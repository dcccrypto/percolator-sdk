/**
 * growth-v19.ts branch coverage: validation throws, u128/u64 clamps and overflow `null` paths.
 * Values are hand-derived from the Rust reference (percolator-prog `growth_v19.rs`): every case
 * pins the saturating/None behaviour of the corresponding Rust arithmetic.
 */
import { describe, it, expect } from "vitest";
import {
  nCapQ, liquidityNotionalE6, dynImrBps, bookDepthFromPins, volUpdateX100, lVolX100, isqrtCeil,
  assetGrowthAccountOffsetV19, decodeAssetGrowthV19, encodeInitMarketV19, encodeInitVaultLpV19,
  encodeInitVaultLpV22Tiers, encodeSetAssetRiskLimitsV22Tiers, encodeMatcherCallExtV3FromV2,
  GROWTH_MAX_IMR_BPS, MATCHER_CALL_EXT_V2_LEN,
} from "../src/abi/growth-v19.js";

const U128_MAX = (1n << 128n) - 1n;
const tiers = { thresholdUsd: [0, 0, 0] as [number, number, number], leverageX100: [0, 0, 0] as [number, number, number] };

describe("numeric helpers: overflow and clamp branches", () => {
  it("non-integer Number inputs are refused", () => {
    expect(() => nCapQ(1n, 1.5, 1n)).toThrow(/integer/);
    expect(() => liquidityNotionalE6(1n, Number.NaN)).toThrow(/integer/);
  });
  it("nCapQ returns null once a product leaves u128", () => {
    expect(nCapQ(U128_MAX, 2n, 1n)).toBeNull(); // c_m * lambda
    expect(nCapQ(1n << 100n, 1n, 1n, 1n << 60n)).toBeNull(); // a * pos_scale
    expect(nCapQ(1n, 1n, 1n, 1n)).toBe(0n);
    expect(nCapQ(1n, 1n, (U128_MAX / 10_000n) + 1n, 1n)).toBeNull(); // 1e4 * price
  });
  it("liquidityNotionalE6 returns null on the DEPTH_MULT product", () => {
    expect(liquidityNotionalE6((U128_MAX / 2n), 3n)).toBeNull(); // c*lambda fits? no: > u128
    expect(liquidityNotionalE6(U128_MAX / 3n, 1n)).toBeNull(); // a fits, a*4 overflows
  });
  it("dynImrBps overflow guards and the IMR ceiling", () => {
    expect(dynImrBps(U128_MAX, U128_MAX, 1_000n, 5_000n)).toBeNull(); // lhs = lp * 1e4 > u128
    expect(dynImrBps(1n, U128_MAX, 1_000n, 5_000n)).toBeNull(); // rhs = kink * nCap > u128
    // span*(lhs-rhs) > u128: huge lp above a small kink
    const nCap = 1n << 120n;
    expect(dynImrBps(nCap, nCap, 1n, 1n)).toBeNull();
    // Reaches the ceiling clamp: lp slightly above nCap*kink with baseImr = max is base itself; use ceil rounding.
    expect(dynImrBps(10_000n, 10_000n, GROWTH_MAX_IMR_BPS, 0n)).toBe(GROWTH_MAX_IMR_BPS);
  });
  it("bookDepthFromPins saturates the 4x and the product", () => {
    // BOOK_DEPTH_BAND_BPS = 200. d clamped to u128, d * room overflows -> 0
    expect(bookDepthFromPins(U128_MAX, 20, 50, 200)).toBe(0n);
    // 4x clamp only: room 1 keeps d*room == d == U128_MAX fits; impactK 0 -> n == U128_MAX == cap
    expect(bookDepthFromPins(U128_MAX, 199, 0, 200)).toBe(U128_MAX);
  });
  it("volUpdateX100 saturates at u32::MAX", () => {
    expect(volUpdateX100(0xffff_fffe, true, 0xffff_ffffn)).toBe(0xffff_ffff);
    expect(volUpdateX100(0xffff_ffff, true, 0xffff_ffffn)).toBe(0xffff_ffff);
    expect(volUpdateX100(0, true, 1n << 40n)).toBeGreaterThan(0);
  });
  it("lVolX100 clamps need to u64 and the leverage to u16", () => {
    expect(lVolX100(1n, 1n << 63n, 0n)).toBe(0); // need saturates at u64::MAX -> 1e6 / 2^64-1 = 0
    expect(lVolX100(1n, 1n, 0n)).toBeLessThanOrEqual(0xffff);
    expect(lVolX100(1n, 0n, 0n)).toBe(0xffff); // den = 1 -> 1e6 > u16
  });
  it("isqrtCeil refuses negatives", () => {
    expect(() => isqrtCeil(-1n)).toThrow(/negative/);
  });
});

describe("encoder / decoder validation branches", () => {
  it("assetGrowthAccountOffsetV19 refuses negative and fractional indices", () => {
    expect(() => assetGrowthAccountOffsetV19(-1)).toThrow(/bad assetIndex/);
    expect(() => assetGrowthAccountOffsetV19(0.5)).toThrow(/bad assetIndex/);
  });
  it("decodeAssetGrowthV19 refuses an account that ends before the asset's record", () => {
    expect(() => decodeAssetGrowthV19(new Uint8Array(10), 0)).toThrow();
  });
  it("encodeInitMarketV19 refuses >12-decimal collateral", () => {
    expect(() => encodeInitMarketV19({} as never, 500, 550, 13)).toThrow(/decimals/);
  });
  it("encodeInitVaultLpV19 / V22Tiers refuse a non-u16 junior floor", () => {
    for (const bad of [-1, 0x1_0000, 1.5]) {
      expect(() => encodeInitVaultLpV19(bad, 550)).toThrow(/juniorFloorBps/);
      expect(() => encodeInitVaultLpV22Tiers(bad, 550, tiers)).toThrow(/juniorFloorBps/);
    }
  });
  it("encodeSetAssetRiskLimitsV22Tiers refuses bad assetIndex, kink and util-fee max", () => {
    expect(() => encodeSetAssetRiskLimitsV22Tiers(-1, 10_000, 5_000, tiers, 1)).toThrow(/assetIndex/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0x1_0000, 10_000, 5_000, tiers, 1)).toThrow(/assetIndex/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, -1, tiers, 1)).toThrow(/kinkBps/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 0x1_0000, tiers, 1)).toThrow(/kinkBps/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, tiers, 1, -1)).toThrow(/utilFeeMaxBps/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, tiers, 1, 0x1_0000)).toThrow(/utilFeeMaxBps/);
  });
  it("encodeMatcherCallExtV3FromV2 refuses a liquidity depth outside u128", () => {
    const v2 = new Uint8Array(MATCHER_CALL_EXT_V2_LEN);
    expect(() => encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: 0n, liquidityNotionalE6: -1n })).toThrow(/liquidityNotionalE6/);
    expect(() => encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: 0n, liquidityNotionalE6: U128_MAX + 1n })).toThrow(/liquidityNotionalE6/);
  });
});
