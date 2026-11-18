import { describe, it, expect } from "vitest";
import {
  computeLiqPrice,
  computePreTradeLiqPrice,
  computeFundingRateAnnualized,
  computeMaxLeverage,
  computeMaxLeverageFloor,
} from "../src/math/trading";

const U64_MAX = 18446744073709551615n;

describe("computeLiqPrice: maintenance >= 100% long", () => {
  it("returns u64::MAX when entry exceeds capital per unit (liquidatable at any price)", () => {
    expect(computeLiqPrice(100_000_000n, 10n, 1_000_000n, 10000n)).toBe(U64_MAX);
    expect(computeLiqPrice(100_000_000n, 10n, 1_000_000n, 15000n)).toBe(U64_MAX);
  });
  it("returns 0 when capital per unit covers entry", () => {
    // capitalPerUnitE6 = 200e6 * 1e6 / 1e6 = 200e6 >= entry 100e6
    expect(computeLiqPrice(100_000_000n, 200_000_000n, 1_000_000n, 10000n)).toBe(0n);
  });
});

describe("computePreTradeLiqPrice: short direction", () => {
  it("uses a negative signed position and a short entry reduced by fee", () => {
    const entry = 100_000_000n;
    const fee = 100n; // 1%
    const got = computePreTradeLiqPrice(entry, 10_000_000n, 1_000_000n, 500n, fee, "short");
    expect(got).toBe(computeLiqPrice(99_000_000n, 10_000_000n, -1_000_000n, 500n));
    expect(got).toBeGreaterThan(entry);
  });
  it("treats a negative posSize by magnitude", () => {
    expect(computePreTradeLiqPrice(100_000_000n, 10_000_000n, -1_000_000n, 500n, 0n, "long")).toBe(
      computePreTradeLiqPrice(100_000_000n, 10_000_000n, 1_000_000n, 500n, 0n, "long"),
    );
  });
  it("clamps short entry to 1 when fee >= 100%", () => {
    const got = computePreTradeLiqPrice(100_000_000n, 10_000_000n, 1_000_000n, 500n, 20000n, "short");
    expect(got).toBe(computeLiqPrice(1n, 10_000_000n, -1_000_000n, 500n));
    expect(got).toBeGreaterThan(0n);
  });
});

describe("display-value leads (funding rate, max leverage)", () => {
  it("funding: beyond 2^53 gives +/-Infinity, never a silently imprecise number", () => {
    expect(computeFundingRateAnnualized(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toBe(Infinity);
    expect(computeFundingRateAnnualized(-BigInt(Number.MAX_SAFE_INTEGER) - 1n)).toBe(-Infinity);
    expect(Number.isFinite(computeFundingRateAnnualized(BigInt(Number.MAX_SAFE_INTEGER)))).toBe(true);
    expect(computeFundingRateAnnualized(0n)).toBe(0);
    expect(computeFundingRateAnnualized(-1n)).toBeLessThan(0);
  });
  it("max leverage: zero and negative throw rather than return Infinity/negative", () => {
    expect(() => computeMaxLeverage(0n)).toThrow();
    expect(() => computeMaxLeverage(-5n)).toThrow();
    expect(() => computeMaxLeverageFloor(0n)).toThrow();
    expect(() => computeMaxLeverageFloor(-5n)).toThrow();
  });
  it("max leverage: huge margin bps (> 2^53) stays finite, positive and ~0", () => {
    const v = computeMaxLeverage(2n ** 70n);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1e-10);
    expect(computeMaxLeverageFloor(2n ** 70n)).toBe(0n);
  });
  it("max leverage: fractional preserved", () => {
    expect(computeMaxLeverage(3000n)).toBeCloseTo(3.3333, 3);
    expect(computeMaxLeverageFloor(3000n)).toBe(3n);
  });
});
