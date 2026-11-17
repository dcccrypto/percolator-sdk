/**
 * Branch coverage for the exported depth maths of src/abi/v22-depth-source.ts (isqrtU128, plus2PctDepthE6, reserveValueE6).
 * Public API only, so it stays valid across internal refactors.
 */
import { describe, it, expect } from "vitest";
import { isqrtU128, plus2PctDepthE6, reserveValueE6 } from "../src/index.js";

const U128_MAX = (1n << 128n) - 1n;
const U64_MAX = (1n << 64n) - 1n;

describe("isqrtU128 input guard and edges", () => {
  it("rejects negatives and values above u128", () => {
    expect(() => isqrtU128(-1n)).toThrow(/u128/);
    expect(() => isqrtU128(U128_MAX + 1n)).toThrow(/u128/);
  });
  it("is exact at 0, 1, perfect squares and u128::MAX", () => {
    expect(isqrtU128(0n)).toBe(0n);
    expect(isqrtU128(1n)).toBe(1n);
    expect(isqrtU128(2n)).toBe(1n);
    expect(isqrtU128(U64_MAX * U64_MAX)).toBe(U64_MAX);
    expect(isqrtU128(U64_MAX * U64_MAX - 1n)).toBe(U64_MAX - 1n);
    expect(isqrtU128(U128_MAX)).toBe(U64_MAX);
  });
});

describe("plus2PctDepthE6 guards and rounding", () => {
  it("rejects out-of-range input and returns 0 for 0", () => {
    expect(() => plus2PctDepthE6(-1n)).toThrow(/u64/);
    expect(() => plus2PctDepthE6(U64_MAX + 1n)).toThrow(/u64/);
    expect(plus2PctDepthE6(0n)).toBe(0n);
  });
  it("satisfies the defining inequality R - m with m minimal (51 m^2 >= 50 R^2), full u64 width", () => {
    const samples = [1n, 2n, 3n, 50n, 51n, 101n, 999_999n, 1_000_000_000_000n, U64_MAX - 1n, U64_MAX];
    for (const r of samples) {
      const m = r - plus2PctDepthE6(r);
      expect(51n * m * m >= 50n * r * r).toBe(true);
      expect(51n * (m - 1n) * (m - 1n) < 50n * r * r).toBe(true);
    }
    expect(plus2PctDepthE6(1_000_000_000_000n)).toBe(9_852_457_023n);
  });
});

describe("reserveValueE6 branches", () => {
  it("quote-is-collateral returns the quote reserve untouched", () => {
    expect(reserveValueE6("quote-is-collateral", 5n, 77n, 0n, 99, 99)).toBe(77n);
  });
  it("base-at-mark: rejects zero mark, decimals > 18, lotExp > 15, and non-u8 decimals/lotExp", () => {
    expect(reserveValueE6("base-at-mark", 10n, 0n, 0n, 6, 0)).toBeNull();
    expect(reserveValueE6("base-at-mark", 10n, 0n, 1n, 19, 0)).toBeNull();
    expect(reserveValueE6("base-at-mark", 10n, 0n, 1n, 6, 16)).toBeNull();
    for (const bad of [-1, 256, 1.5, NaN, Infinity]) {
      expect(reserveValueE6("base-at-mark", 10n, 0n, 1n, bad, 0)).toBeNull();
      expect(reserveValueE6("base-at-mark", 10n, 0n, 1n, 6, bad)).toBeNull();
    }
  });
  it("base-at-mark: floors, and caps at u64::MAX", () => {
    expect(reserveValueE6("base-at-mark", 1_000_000n, 0n, 1_500_000n, 6, 0)).toBe(1_500_000n);
    expect(reserveValueE6("base-at-mark", 1n, 0n, 1n, 6, 0)).toBe(0n);
    expect(reserveValueE6("base-at-mark", U64_MAX, 0n, U64_MAX, 0, 0)).toBe(U64_MAX);
    expect(reserveValueE6("base-at-mark", 10n, 0n, 1n, 18, 15)).toBe(0n);
  });
});
