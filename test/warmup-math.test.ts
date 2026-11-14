import { describe, it, expect } from "vitest";
import {
  computeWarmupUnlockedCapital,
  computeWarmupLeverageCap,
  computeWarmupMaxPositionSize,
} from "../src/math/warmup";

// Reference: linear unlock floor(total * elapsed / period), clamped to [0, total].
const START = 1000n;
const PERIOD = 400n;

describe("computeWarmupUnlockedCapital", () => {
  it("returns all capital when the period is 0 or warmup has not started", () => {
    expect(computeWarmupUnlockedCapital(500n, 10n, START, 0n)).toBe(500n);
    expect(computeWarmupUnlockedCapital(500n, 10n, 0n, PERIOD)).toBe(500n);
    // sentinel checks run before the capital check, so even <= 0 passes through
    expect(computeWarmupUnlockedCapital(0n, 10n, 0n, PERIOD)).toBe(0n);
    expect(computeWarmupUnlockedCapital(-5n, 10n, 0n, PERIOD)).toBe(-5n);
  });

  it("returns 0 for zero or negative capital while warming up", () => {
    expect(computeWarmupUnlockedCapital(0n, START + 10n, START, PERIOD)).toBe(0n);
    expect(computeWarmupUnlockedCapital(-1n, START + 10n, START, PERIOD)).toBe(0n);
  });

  it("unlocks nothing at or before the start slot", () => {
    expect(computeWarmupUnlockedCapital(1000n, START, START, PERIOD)).toBe(0n);
    expect(computeWarmupUnlockedCapital(1000n, START - 50n, START, PERIOD)).toBe(0n);
    expect(computeWarmupUnlockedCapital(1000n, 0n, START, PERIOD)).toBe(0n);
  });

  it("unlocks linearly and floors", () => {
    expect(computeWarmupUnlockedCapital(1000n, START + 100n, START, PERIOD)).toBe(250n);
    expect(computeWarmupUnlockedCapital(1000n, START + 200n, START, PERIOD)).toBe(500n);
    // 1000 * 1 / 400 = 2.5 -> 2
    expect(computeWarmupUnlockedCapital(1000n, START + 1n, START, PERIOD)).toBe(2n);
    // 7 * 399 / 400 = 6.9825 -> 6, never rounds up to the full amount early
    expect(computeWarmupUnlockedCapital(7n, START + 399n, START, PERIOD)).toBe(6n);
  });

  it("unlocks everything at and after the end of the period", () => {
    expect(computeWarmupUnlockedCapital(1000n, START + PERIOD, START, PERIOD)).toBe(1000n);
    expect(computeWarmupUnlockedCapital(1000n, START + PERIOD * 50n, START, PERIOD)).toBe(1000n);
  });

  it("is monotonic and bounded by total over the whole window", () => {
    let prev = 0n;
    for (let s = START; s <= START + PERIOD + 5n; s++) {
      const u = computeWarmupUnlockedCapital(123_457n, s, START, PERIOD);
      expect(u).toBeGreaterThanOrEqual(prev);
      expect(u).toBeLessThanOrEqual(123_457n);
      prev = u;
    }
    expect(prev).toBe(123_457n);
  });

  it("does not overflow on u64-scale values (bigint)", () => {
    const max = (1n << 64n) - 1n;
    expect(computeWarmupUnlockedCapital(max, START + 200n, START, PERIOD)).toBe((max * 200n) / PERIOD);
  });
});

describe("computeWarmupLeverageCap", () => {
  // 1000 bps initial margin -> 10x
  it("returns the full integer max leverage with no warmup configured", () => {
    expect(computeWarmupLeverageCap(1000n, 500n, 5n, START, 0n)).toBe(10);
    expect(computeWarmupLeverageCap(1000n, 500n, 5n, 0n, PERIOD)).toBe(10);
    // no-warmup path wins even with zero capital
    expect(computeWarmupLeverageCap(1000n, 0n, 5n, 0n, PERIOD)).toBe(10);
  });

  it("floors the base leverage for non-divisor margins (3x for 3000 bps; 3 for 3333 bps)", () => {
    expect(computeWarmupLeverageCap(3333n, 1n, 0n, 0n, 0n)).toBe(3);
    expect(computeWarmupLeverageCap(3000n, 1n, 0n, 0n, 0n)).toBe(3);
  });

  it("returns 1 with zero/negative capital during warmup", () => {
    expect(computeWarmupLeverageCap(1000n, 0n, START + 10n, START, PERIOD)).toBe(1);
    expect(computeWarmupLeverageCap(1000n, -1n, START + 10n, START, PERIOD)).toBe(1);
  });

  it("returns 1 when nothing is unlocked yet", () => {
    expect(computeWarmupLeverageCap(1000n, 1000n, START, START, PERIOD)).toBe(1);
    expect(computeWarmupLeverageCap(1000n, 1000n, START - 1n, START, PERIOD)).toBe(1);
  });

  it("scales with unlocked share and floors, minimum 1x", () => {
    // half unlocked -> 5x
    expect(computeWarmupLeverageCap(1000n, 1000n, START + 200n, START, PERIOD)).toBe(5);
    // 25% -> floor(2.5) = 2
    expect(computeWarmupLeverageCap(1000n, 1000n, START + 100n, START, PERIOD)).toBe(2);
    // 0.25% unlocked -> floor(0.025) = 0 -> clamped to 1
    expect(computeWarmupLeverageCap(1000n, 1000n, START + 1n, START, PERIOD)).toBe(1);
  });

  it("returns the full leverage once warmup is complete", () => {
    expect(computeWarmupLeverageCap(500n, 1000n, START + PERIOD, START, PERIOD)).toBe(20);
  });

  it("rejects a non-positive margin like computeMaxLeverageFloor", () => {
    expect(() => computeWarmupLeverageCap(0n, 1000n, 1n, START, PERIOD)).toThrow(/positive/);
  });
});

describe("computeWarmupMaxPositionSize", () => {
  it("is unlocked capital times floored max leverage", () => {
    expect(computeWarmupMaxPositionSize(1000n, 1000n, START + 100n, START, PERIOD)).toBe(250n * 10n);
    expect(computeWarmupMaxPositionSize(1000n, 1000n, START, START, PERIOD)).toBe(0n);
  });

  it("is capital times leverage when warmup is off or finished", () => {
    expect(computeWarmupMaxPositionSize(2500n, 100n, 5n, 0n, PERIOD)).toBe(400n);
    expect(computeWarmupMaxPositionSize(2500n, 100n, START + PERIOD, START, PERIOD)).toBe(400n);
  });

  it("never exceeds total capital times leverage, and the leverage cap stays within max leverage", () => {
    for (let s = START; s <= START + PERIOD; s += 7n) {
      const size = computeWarmupMaxPositionSize(1000n, 10_000n, s, START, PERIOD);
      expect(size).toBeLessThanOrEqual(100_000n);
      // the leverage cap never exceeds the program-side integer max leverage
      expect(computeWarmupLeverageCap(1000n, 10_000n, s, START, PERIOD)).toBeLessThanOrEqual(10);
    }
  });

  it("rejects a non-positive margin", () => {
    expect(() => computeWarmupMaxPositionSize(0n, 1n, 1n, START, PERIOD)).toThrow(/positive/);
  });
});
