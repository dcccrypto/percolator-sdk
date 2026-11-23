import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { computeDexSpotPriceE6 } from "../src/solana/dex-oracle.js";

/**
 * Meteora DLMM price at the edges of its input range, pinned against the original
 * square-and-multiply loop (copied below as `reference`).
 *
 * The reader keeps a per-binStep cache of the squares (sq[k] = sq[k-1]^2 / 1e18).
 * The cache must give the exact same bigint as the loop for every binStep and
 * activeId the guards accept, and must not change anything when tables grow
 * later or are evicted and rebuilt.
 */

const SCALE = 1_000_000_000_000_000_000n;

/** The pre-cache loop from src/solana/dex-oracle.ts, unchanged. */
function reference(binStep: number, activeId: number, decBase: number, decQuote: number): bigint {
  const base = SCALE + (BigInt(binStep) * SCALE) / 10_000n;
  const isNeg = activeId < 0;
  let exp = isNeg ? BigInt(-activeId) : BigInt(activeId);
  let result = SCALE;
  let b = base;
  while (exp > 0n) {
    if (exp & 1n) result = (result * b) / SCALE;
    exp >>= 1n;
    if (exp > 0n) b = (b * b) / SCALE;
  }
  const diff = decBase - decQuote;
  if (isNeg) {
    const num = 1_000_000_000_000_000_000_000_000n;
    if (diff >= 0) return (num * 10n ** BigInt(diff)) / result;
    return num / (result * 10n ** BigInt(-diff));
  }
  if (diff >= 0) return (result * 10n ** BigInt(diff)) / 1_000_000_000_000n;
  return result / (1_000_000_000_000n * 10n ** BigInt(-diff));
}

/** A minimal LbPair: bin_step_seed @73, active_id @76 (i32), bin_step @80 (u16). */
function lbPair(binStep: number, activeId: number): Uint8Array {
  const b = new Uint8Array(904);
  const dv = new DataView(b.buffer);
  dv.setUint16(73, binStep, true);
  dv.setInt32(76, activeId, true);
  dv.setUint16(80, binStep, true);
  return b;
}

function price(binStep: number, activeId: number, decBase = 6, decQuote = 6): bigint {
  return computeDexSpotPriceE6("meteora-dlmm", lbPair(binStep, activeId), undefined, {
    base: decBase,
    quote: decQuote,
  });
}

/** Expect the SDK to match the reference: same bigint, or the zero-price refusal. */
function expectMatchesReference(binStep: number, activeId: number, decBase: number, decQuote: number) {
  const want = reference(binStep, activeId, decBase, decQuote);
  if (want === 0n) {
    expect(() => price(binStep, activeId, decBase, decQuote)).toThrow(/computed price is 0/);
  } else {
    expect(price(binStep, activeId, decBase, decQuote)).toBe(want);
  }
}

const sha = (v: bigint) => createHash("sha256").update(v.toString()).digest("hex").slice(0, 16);

describe("Meteora DLMM price at edge binStep / activeId values", () => {
  it("pins literal prices at binStep 1 and 10_000 and |activeId| 0, 1, 500_000", () => {
    expect(price(1, 0)).toBe(1_000_000n);
    expect(price(1, 1)).toBe(1_000_100n);
    expect(price(1, -1)).toBe(999_900n);
    expect(price(1, 500_000)).toBe(5_171_760_815_372_055_885_442_630_708n);
    expect(price(10_000, 1, 0, 0)).toBe(2_000_000n);
    expect(price(10_000, -1, 0, 0)).toBe(500_000n);
    expect(price(10_000, -60, 24, 0)).toBe(867_361_737_988n);
    // Huge results are pinned by length and hash of the decimal string.
    const top = price(10_000, 500_000, 0, 0);
    expect(top.toString().length).toBe(150_521);
    expect(sha(top)).toBe("2c375ec3cd9edf17");
    const mid = price(25, 262_144, 9, 6);
    expect(mid.toString().length).toBe(294);
    expect(sha(mid)).toBe("2d6a18bedd292271");
  });

  it("matches the original loop for every edge binStep x activeId x decimals", () => {
    const steps = [1, 2, 25, 100, 400, 9_999, 10_000];
    const ids = [-500_000, -499_999, -262_144, -262_143, -131_072, -1, 0, 1, 131_071, 262_143, 262_144, 499_999, 500_000];
    const decs: [number, number][] = [[0, 0], [0, 24], [24, 0], [9, 6], [6, 9], [24, 24]];
    for (const s of steps) for (const id of ids) for (const [db, dq] of decs) expectMatchesReference(s, id, db, dq);
  });

  it("refuses out-of-range binStep and activeId with the same messages", () => {
    expect(() => price(0, 1)).toThrow("Meteora DLMM pair has binStep = 0 — uninitialized; refusing to report a price");
    expect(() => price(10_001, 1)).toThrow("Meteora DLMM: binStep 10001 exceeds max 10000");
    expect(() => price(65_535, 1)).toThrow("Meteora DLMM: binStep 65535 exceeds max 10000");
    expect(() => price(1, 500_001)).toThrow("Meteora DLMM: |activeId| 500001 exceeds max 500000");
    expect(() => price(1, -500_001)).toThrow("Meteora DLMM: |activeId| 500001 exceeds max 500000");
    expect(() => price(1, 2_147_483_647)).toThrow("Meteora DLMM: |activeId| 2147483647 exceeds max 500000");
    expect(() => price(1, -2_147_483_648)).toThrow("Meteora DLMM: |activeId| 2147483648 exceeds max 500000");
  });

  it("stays exact when a binStep is first seen at a small activeId and later at a large one", () => {
    // A cached table built for a small exponent must be extended, not reused short.
    for (const id of [1, 3, 64, 1_000, 65_535, 262_144, 500_000, -500_000, 7]) {
      expectMatchesReference(37, id, 6, 6);
    }
  });

  it("stays exact across more distinct binSteps than the cache holds (eviction and rebuild)", () => {
    // 1_500 distinct binSteps, twice: every table is evicted and rebuilt at least once.
    const cases: [number, number][] = [];
    for (let i = 0; i < 1_500; i++) {
      const s = 1 + ((i * 6_007) % 10_000);
      const maxId = Math.min(500_000, Math.floor(30 / Math.log10(1 + s / 10_000)));
      cases.push([s, ((i * 7_919) % (2 * maxId + 1)) - maxId]);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const [s, id] of cases) expectMatchesReference(s, id, 6, 6);
    }
  });
});
