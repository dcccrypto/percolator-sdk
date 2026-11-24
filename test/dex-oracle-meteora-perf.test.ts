/**
 * Meteora DLMM price perf regression (src/solana/dex-oracle.ts). The price used to redo the whole
 * repeated-squaring chain (b = b*b/1e18, up to 18 squarings of ever-larger bigints) on every call.
 * The squares are now cached per binStep, so a repeat call only does the multiplies.
 *
 * Each check times the SDK against a copy of the old loop (`reference`) on the same input, in the
 * same process, so machine speed and CI load cancel out. Before the cache the two cost the same
 * (measured 0.58-1.36 on the input below); with it the ratio is 0.11-0.19. The 1/3 bound is loose
 * on purpose: the old code misses it by 1.7x+ and the cached code clears it by 1.8x+.
 *
 * A typical pool (binStep 25, activeId 5_000) is ~2.4x faster too, but at ~5 us/call JIT noise
 * moves the base ratio by +-40%, so it is left to bench/dex-oracle.bench.ts instead of a test.
 */
import { describe, it, expect } from "vitest";
import { computeDexSpotPriceE6 } from "../src/solana/dex-oracle.js";

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

function sdkPrice(data: Uint8Array, decBase: number, decQuote: number): bigint {
  return computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: decBase, quote: decQuote });
}

/** Total ms for `calls` calls of f. */
function timeMs(calls: number, f: () => unknown): number {
  const t = performance.now();
  for (let i = 0; i < calls; i++) f();
  return performance.now() - t;
}

/**
 * Best-of-`runs` time of the SDK divided by best-of-`runs` time of the reference, interleaved so
 * a slow patch hits both sides. Best-of drops GC pauses and scheduler hiccups.
 */
function sdkOverReference(binStep: number, activeId: number, dec: [number, number], calls: number, runs = 5): number {
  const data = lbPair(binStep, activeId);
  const want = reference(binStep, activeId, dec[0], dec[1]);
  expect(sdkPrice(data, dec[0], dec[1])).toBe(want); // also warms the SDK cache and JIT
  let sdk = Infinity;
  let ref = Infinity;
  let sink = 0n;
  for (let r = 0; r < runs; r++) {
    ref = Math.min(ref, timeMs(calls, () => (sink ^= reference(binStep, activeId, dec[0], dec[1]))));
    sdk = Math.min(sdk, timeMs(calls, () => (sink ^= sdkPrice(data, dec[0], dec[1]))));
  }
  expect(typeof sink).toBe("bigint");
  return sdk / ref;
}

describe("Meteora DLMM price: squares are not recomputed on every call", () => {
  it("binStep 10_000, activeId 2^18 (18 large squarings per old call): SDK under 1/3 of the old loop", () => {
    // Old loop ~5 ms/call here (squaring up to a ~32 KB bigint), cached ~0.5 ms/call.
    expect(sdkOverReference(10_000, 262_144, [0, 0], 40)).toBeLessThan(1 / 3);
  }, 60_000);
});
