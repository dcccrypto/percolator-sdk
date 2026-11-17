import { describe, it, expect } from "vitest";
import { computeDexSpotPriceE6 } from "../src/solana/dex-oracle.js";

/**
 * Differential test: the memoised DLMM price path must be bit-identical to the
 * original per-call square-and-multiply implementation (copied verbatim below as
 * `legacy`), including every throw path and its message.
 */

const MAX_BIN_STEP = 10_000;
const MAX_ACTIVE_ID_ABS = 500_000;
const MAX_TOKEN_DECIMALS = 24;

/** Original implementation (pre-optimisation), kept verbatim as the oracle. */
function legacy(data: Uint8Array, decimalsBase: number, decimalsQuote: number): bigint {
  if (data.length < 152) throw new Error(`Meteora DLMM data too short: ${data.length} < 152`);
  for (const [label, d] of [["base", decimalsBase], ["quote", decimalsQuote]] as const) {
    if (!Number.isInteger(d) || d < 0 || d > MAX_TOKEN_DECIMALS) {
      throw new Error(
        `Meteora DLMM: ${label} decimals out of range (${d}); expected integer 0..${MAX_TOKEN_DECIMALS}`,
      );
    }
  }
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const binStep = dv.getUint16(80, true);
  const activeId = dv.getInt32(76, true);
  if (binStep === 0) {
    throw new Error("Meteora DLMM pair has binStep = 0 — uninitialized; refusing to report a price");
  }
  if (binStep > MAX_BIN_STEP) {
    throw new Error(`Meteora DLMM: binStep ${binStep} exceeds max ${MAX_BIN_STEP}`);
  }
  if (Math.abs(activeId) > MAX_ACTIVE_ID_ABS) {
    throw new Error(`Meteora DLMM: |activeId| ${Math.abs(activeId)} exceeds max ${MAX_ACTIVE_ID_ABS}`);
  }
  const SCALE = 1_000_000_000_000_000_000n;
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
  const diff = decimalsBase - decimalsQuote;
  if (isNeg) {
    if (result === 0n) {
      throw new Error(
        "Meteora DLMM inverse-price computation produced a zero divisor; refusing to report a price",
      );
    }
    const num = 1_000_000_000_000_000_000_000_000n;
    if (diff >= 0) return (num * 10n ** BigInt(diff)) / result;
    return num / (result * 10n ** BigInt(-diff));
  }
  if (diff >= 0) return (result * 10n ** BigInt(diff)) / 1_000_000_000_000n;
  return result / (1_000_000_000_000n * 10n ** BigInt(-diff));
}

/** legacy + the computeDexSpotPriceE6 zero-price guard. */
function legacyPublic(data: Uint8Array, db: number, dq: number): bigint {
  const price = legacy(data, db, dq);
  if (price <= 0n) {
    throw new Error(
      `meteora-dlmm: computed price is ${price} (empty quote side or below 1e-6); refusing to report a price`,
    );
  }
  return price;
}

function pool(activeId: number, binStep: number, len = 216): Uint8Array {
  const d = new Uint8Array(len);
  const dv = new DataView(d.buffer);
  if (len >= 82) {
    dv.setInt32(76, activeId, true);
    dv.setUint16(80, binStep, true);
  }
  return d;
}

function run(f: () => bigint): { ok: true; v: bigint } | { ok: false; msg: string } {
  try {
    return { ok: true, v: f() };
  } catch (e) {
    return { ok: false, msg: (e as Error).message };
  }
}

function same(data: Uint8Array, db: number, dq: number): void {
  const a = run(() => legacyPublic(data, db, dq));
  const b = run(() => computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: db, quote: dq }));
  expect(b).toEqual(a);
}

// xorshift32, deterministic
let seed = 0x9e3779b9;
const rnd = () => {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed;
};

describe("DLMM price: memoised pow is bit-identical to the original", () => {
  it("100,000+ random (binStep, activeId, decimals) cases match, incl. throws", () => {
    let mismatches = 0;
    let oks = 0;
    const N = 120_000;
    for (let i = 0; i < N; i++) {
      const binStep = 1 + (rnd() % MAX_BIN_STEP);
      // Mix magnitudes so small, medium and extreme exponents are all hit.
      // Full-range |activeId| with a large binStep builds multi-hundred-kilobit
      // BigInts, so that class is sampled 1-in-1000 to keep the test bounded.
      const mag = i % 1000 === 0 ? MAX_ACTIVE_ID_ABS : i % 2 ? 100 : 5_000;
      const activeId = (rnd() % (2 * mag + 1)) - mag;
      const db = rnd() % (MAX_TOKEN_DECIMALS + 1);
      const dq = rnd() % (MAX_TOKEN_DECIMALS + 1);
      const data = pool(activeId, binStep);
      const a = run(() => legacyPublic(data, db, dq));
      const b = run(() => computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: db, quote: dq }));
      if (a.ok) oks++;
      if (JSON.stringify(a, (_, v) => (typeof v === "bigint" ? v.toString() : v)) !==
          JSON.stringify(b, (_, v) => (typeof v === "bigint" ? v.toString() : v))) {
        mismatches++;
      }
    }
    expect(mismatches).toBe(0);
    expect(oks).toBeGreaterThan(10_000); // sanity: not all cases are throws
  }, 600_000);

  it("boundaries and repeated calls (cache warm and cold) match", () => {
    const ids = [0, 1, -1, 2, 262_143, 262_144, 499_999, 500_000, -500_000];
    // Large ids only with small steps (a large step at |id| ~ 5e5 is a ~500 kbit BigInt).
    for (const binStep of [1, 2, 25]) {
      for (const id of ids) for (let rep = 0; rep < 2; rep++) same(pool(id, binStep), 9, 6);
    }
    for (const binStep of [9999, MAX_BIN_STEP]) {
      for (const id of [0, 1, -1, 2, 4097, -4097, 20_000]) for (let rep = 0; rep < 2; rep++) same(pool(id, binStep), 9, 6);
    }
  });

  it("evicting the bounded cache does not change results", () => {
    for (let s = 1; s <= 600; s++) same(pool(1234, s), 6, 6);
    for (let s = 1; s <= 50; s++) same(pool(-777, s), 6, 6);
  });

  it("throw paths and messages are identical", () => {
    same(pool(10, 0), 9, 6); // binStep 0
    same(pool(10, MAX_BIN_STEP + 1), 9, 6); // binStep too large
    same(pool(10, 65535), 9, 6);
    same(pool(MAX_ACTIVE_ID_ABS + 1, 25), 9, 6);
    same(pool(-MAX_ACTIVE_ID_ABS - 1, 25), 9, 6);
    same(pool(-2147483648, 25), 9, 6); // i32 min
    same(pool(2147483647, 25), 9, 6);
    same(pool(10, 25, 151), 9, 6); // too short
    same(pool(10, 25), 25, 6); // decimals out of range
    same(pool(10, 25), 6, -1);
    same(pool(10, 25), 6, 1.5);
    // Zero price after truncation (fail-closed in the public wrapper)
    same(pool(-500_000, 1), 0, 24);
    same(pool(500_000, 1), 0, 24);
    same(pool(-5000, 100), 9, 6);
    // Zero divisor: result underflows to 0 at 1e18 scale for negative ids
    // (cannot happen for binStep >= 1, base > 1, so the guard is unreachable; keep parity anyway)
    same(pool(-1, 1), 0, 0);
    // data is a view into a larger buffer (non-zero byteOffset)
    const big = new Uint8Array(400);
    const sub = big.subarray(37, 37 + 216);
    new DataView(sub.buffer, sub.byteOffset).setInt32(76, -321, true);
    new DataView(sub.buffer, sub.byteOffset).setUint16(80, 77, true);
    same(sub, 9, 6);
  });
});
