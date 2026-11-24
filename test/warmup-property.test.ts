import { describe, it, expect } from "vitest";
import {
  computeWarmupUnlockedCapital,
  computeWarmupLeverageCap,
  computeWarmupMaxPositionSize,
} from "../src/math/warmup";

/**
 * Reference model. Release schedule mirrors the engine's advance_profit_warmup
 * (percolator spec.md §4.2):
 *   elapsed = current_slot - sched_start_slot
 *   effective_elapsed = min(elapsed, sched_horizon)
 *   released = floor(anchor * effective_elapsed / sched_horizon)
 * The engine applies this to positive PnL reserve, not to deposited capital;
 * the SDK helper reuses the same linear-floor schedule for "unlocked capital".
 * Sentinels (period 0 or start 0) = fully unlocked. Clock behind start = 0 elapsed.
 */
function refUnlocked(total: bigint, now: bigint, start: bigint, h: bigint): bigint {
  if (h === 0n || start === 0n) return total;
  if (total <= 0n) return 0n;
  const elapsed = now > start ? now - start : 0n;
  const eff = elapsed < h ? elapsed : h;
  return (total * eff) / h;
}

function refLev(imBps: bigint, total: bigint, now: bigint, start: bigint, h: bigint): bigint {
  const maxLev = 10000n / imBps;
  if (h === 0n || start === 0n) return maxLev;
  if (total <= 0n) return 1n;
  const u = refUnlocked(total, now, start, h);
  if (u <= 0n) return 1n;
  const e = (maxLev * u) / total;
  return e < 1n ? 1n : e;
}

// mulberry32 seeded PRNG
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("warmup property: SDK vs reference model", () => {
  it("matches the reference on 20000 seeded cases (incl. negative capital, lagging clock, sentinels)", () => {
    const r = rng(0x5eed1117);
    const big = (bits: number) => {
      let v = 0n;
      for (let i = 0; i < bits; i += 30) v = (v << 30n) | BigInt(Math.floor(r() * 2 ** 30));
      return v & ((1n << BigInt(bits)) - 1n);
    };
    const N = 20000;
    let mismatches = 0;
    let invariantBreaks = 0;
    let first = "";
    for (let i = 0; i < N; i++) {
      const total = r() < 0.1 ? -big(20) : r() < 0.1 ? 0n : big(1 + Math.floor(r() * 80));
      const start = r() < 0.1 ? 0n : big(1 + Math.floor(r() * 40));
      const h = r() < 0.1 ? 0n : 1n + big(1 + Math.floor(r() * 30));
      const now = r() < 0.2 ? start - big(8) : start + (r() < 0.2 ? h + big(8) : (big(40) % (h + 1n)));
      const im = 1n + big(1 + Math.floor(r() * 14)) % 10000n;
      const u = computeWarmupUnlockedCapital(total, now, start, h);
      const l = computeWarmupLeverageCap(im, total, now, start, h);
      const m = computeWarmupMaxPositionSize(im, total, now, start, h);
      const ru = refUnlocked(total, now, start, h);
      if (u !== ru || BigInt(l) !== refLev(im, total, now, start, h) || m !== (ru > 0n ? ru : 0n) * (10000n / im)) {
        mismatches++;
        if (!first) first = JSON.stringify({ total: String(total), now: String(now), start: String(start), h: String(h), im: String(im) });
      }
      // model-independent invariants
      const live = h !== 0n && start !== 0n;
      if (total >= 0n && (u < 0n || u > total || m < 0n)) invariantBreaks++;
      if (live && total > 0n) {
        if (l < 1) invariantBreaks++;
        if (now - start >= h && u !== total) invariantBreaks++;
        if (now <= start && u !== 0n) invariantBreaks++;
        const u2 = computeWarmupUnlockedCapital(total, now + 1n, start, h);
        if (u2 < u) invariantBreaks++; // monotone in time
      }
    }
    expect(first).toBe("");
    expect(mismatches).toBe(0);
    expect(invariantBreaks).toBe(0);
  }, 60_000);
});
