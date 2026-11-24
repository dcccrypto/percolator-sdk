import { describe, it, expect } from "vitest";
import {
  computeWarmupUnlockedCapital,
  computeWarmupLeverageCap,
  computeWarmupMaxPositionSize,
} from "../src/math/warmup";

/**
 * Edge cases of the warmup sizing helpers, checked against the v2.2 engine
 * (percolator feat/v22-engine-rc23-2026-10-22, src/v16.rs):
 *
 *  - capital is u128 (v16.rs:28130), and the IM-lane equity is
 *    capital + min(pnl, 0) - fee_debt (v16.rs:29919). A new position needs
 *    `equity >= 0 && equity >= initial_req` (v16.rs:29977). So when the
 *    capital/equity a caller passes is <= 0, the largest size the program
 *    will accept is 0, never a negative number.
 *  - the engine has no time lock on deposited capital; its warmup only vests
 *    positive PnL. The SDK's linear "unlocked capital" is stricter than the
 *    program, so a 1x leverage floor is still inside what the program allows.
 *  - the engine rejects a clock that runs behind (`now_slot <
 *    current_slot` → InvalidConfig, v16.rs:17772, 18666), so it never
 *    computes a negative elapsed; the SDK treats it as 0 elapsed (most
 *    conservative).
 */

const IM_10X = 1000n; // 10% initial margin → 10x
const START = 1_000n;
const PERIOD = 1_000n;

describe("lead 1: non-positive capital must never give a negative max size", () => {
  it("returns 0, not a negative size, when warmup is off (period 0)", () => {
    // base returns -100 * 10 = -1000n: a negative size reads as a short
    expect(computeWarmupMaxPositionSize(IM_10X, -100n, 5_000n, START, 0n)).toBe(0n);
  });

  it("returns 0, not a negative size, when warmup has not started (start 0)", () => {
    expect(computeWarmupMaxPositionSize(IM_10X, -100n, 5_000n, 0n, PERIOD)).toBe(0n);
  });

  it("matches the warming-up branch, which already returns 0 for the same capital", () => {
    const live = computeWarmupMaxPositionSize(IM_10X, -100n, START + 500n, START, PERIOD);
    expect(live).toBe(0n);
    expect(computeWarmupMaxPositionSize(IM_10X, -100n, START + 500n, START, 0n)).toBe(live);
    expect(computeWarmupMaxPositionSize(IM_10X, -100n, START + 500n, 0n, PERIOD)).toBe(live);
  });

  it("is never negative across capitals and sentinels", () => {
    for (const total of [-(10n ** 30n), -1n, 0n, 1n, 10n ** 18n]) {
      for (const [start, period] of [[0n, 0n], [0n, PERIOD], [START, 0n], [START, PERIOD]]) {
        for (const now of [0n, START - 1n, START, START + 1n, START + PERIOD]) {
          expect(computeWarmupMaxPositionSize(IM_10X, total, now, start, period) >= 0n).toBe(true);
        }
      }
    }
  });

  it("leaves positive-capital sizing unchanged", () => {
    expect(computeWarmupMaxPositionSize(IM_10X, 100n, 5_000n, START, 0n)).toBe(1_000n);
    expect(computeWarmupMaxPositionSize(IM_10X, 1_000n, START + 250n, START, PERIOD)).toBe(2_500n);
  });
});

describe("lead 2 (not a bug): 1x leverage floor next to a 0 max size", () => {
  it("keeps the documented >= 1 leverage floor while the max size is 0", () => {
    // engine has no capital lock, so 1x on total capital is inside its IM rule
    expect(computeWarmupLeverageCap(IM_10X, 1_000n, START, START, PERIOD)).toBe(1);
    expect(computeWarmupMaxPositionSize(IM_10X, 1_000n, START, START, PERIOD)).toBe(0n);
    // with no capital, 1x of 0 capital is 0 notional, same as the max size
    expect(computeWarmupLeverageCap(IM_10X, 0n, START + 10n, START, PERIOD)).toBe(1);
    expect(computeWarmupMaxPositionSize(IM_10X, 0n, START + 10n, START, PERIOD)).toBe(0n);
  });
});

describe("lead 3 (not a bug): clock behind the warmup start", () => {
  it("treats a lagging clock as 0 elapsed (engine rejects a backwards clock)", () => {
    expect(computeWarmupUnlockedCapital(1_000n, START - 5n, START, PERIOD)).toBe(0n);
    expect(computeWarmupMaxPositionSize(IM_10X, 1_000n, START - 5n, START, PERIOD)).toBe(0n);
    expect(computeWarmupLeverageCap(IM_10X, 1_000n, START - 5n, START, PERIOD)).toBe(1);
  });
});
