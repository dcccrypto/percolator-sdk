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

import {
  stressCapX100, STRESS_NONE, STRESS_DRAW, STRESS_HLOCK, depthTwMinAtoms, validateTierConfig, nCapG8Q, ratchetCeilingX100,
  bandRGapBps, tierRampU64, growthMatcherCapsG8, lambdaVolBps, growthLVolX100, GROWTH_MAX_TIER, depthCapQKappa,
} from "../src/abi/growth-v19.js";

const U64_MAX = (1n << 64n) - 1n;

describe("stress, tier, ramp and ceiling edges", () => {
  const table = [500, 500, 1_000, 2_000] as const;
  it("stressCapX100: none = no cap, h-lock = launch, tier above the max clamps", () => {
    expect(stressCapX100(STRESS_NONE, 2, table)).toBe(0xffff);
    expect(stressCapX100(STRESS_HLOCK, 2, table)).toBe(500);
    expect(stressCapX100(STRESS_DRAW, GROWTH_MAX_TIER + 5, table)).toBe(stressCapX100(STRESS_DRAW, GROWTH_MAX_TIER, table));
    expect(stressCapX100(STRESS_DRAW, 3, table)).toBe(1_000);
  });
  it("depthTwMinAtoms saturates at u64::MAX", () => {
    expect(depthTwMinAtoms({ curTokens: 0xffff_ffff, prevTokens: 0xffff_ffff, bucketP1: 2 }, U64_MAX)).toBe(U64_MAX);
    expect(depthTwMinAtoms({ curTokens: 1, prevTokens: 2, bucketP1: 0 }, 1n)).toBeNull();
  });
  it("validateTierConfig flags non-integer / out-of-range thresholds and leverages", () => {
    const r = validateTierConfig({ thresholdsUsd: [1.5, -1, 2 ** 33], leverageX100: [0.5, -2, 70_000], lLaunchX100: 500, lTierX100: 2_000 });
    expect(r.ok).toBe(false);
    expect(r.issues.filter((x) => x.field === "thresholds" && x.code === "not-an-integer")).toHaveLength(3);
    expect(r.issues.filter((x) => x.field === "leverage" && x.code === "not-an-integer").length).toBeGreaterThanOrEqual(3);
    const r2 = validateTierConfig({ thresholdsUsd: [0, 0, 0], leverageX100: [0, 0, 0], lLaunchX100: 1.5, lTierX100: 2_000 });
    expect(r2.issues.some((x) => x.code === "not-an-integer")).toBe(true);
  });
  it("nCapG8Q: null when the lambda product overflows; depth cap is 0 when its N_cap overflows", () => {
    expect(nCapG8Q({ clamp: true, cM: U128_MAX, lambdaBps: 20_000, tier: 2, capDepth: 1n, priceE6: 1_000_000n })).toBeNull();
    expect(depthCapQKappa(5_000, U128_MAX, 1n)).toBe(0n);
  });
  it("ratchetCeilingX100 near u64::MAX: the epoch end saturates, the step waits", () => {
    const r = ratchetCeilingX100(500, U64_MAX - 1n, 1_000, 500, STRESS_NONE, U64_MAX - 1n);
    expect(r).toEqual({ ceilX100: 500, ceilSlot: U64_MAX - 1n });
  });
  it("bandRGapBps: null for a band whose r_gap leaves u16 and for a non-positive band", () => {
    expect(bandRGapBps(0n)).toBeNull();
    expect(bandRGapBps(2_001n)).toBeNull();
    expect(bandRGapBps(1_000n)).toBe(3445n);
    expect(bandRGapBps(1_999n)).toBe(7995n); // the u16 guard on r_gap is unreachable inside BAND_MAX_BPS
  });
  it("tierRampU64: ramp end clamps to u64::MAX when the extension overflows", () => {
    const th: [bigint, bigint, bigint] = [U64_MAX - 10n, U64_MAX - 5n, U64_MAX - 2n];
    expect(tierRampU64(U64_MAX - 10n, th, [500n, 600n, 700n, 800n])).toBeGreaterThanOrEqual(500n);
  });
  it("lambdaVolBps: zero sigma means no cap", () => {
    expect(lambdaVolBps(0n)).toBe(Number.MAX_SAFE_INTEGER);
    expect(lambdaVolBps(475n)).toBe(100_000);
  });
  it("growthLVolX100: horizon saturates and no data yields null", () => {
    expect(growthLVolX100({ volHasData: false, volVarX100: 0 }, { engineImrBps: 500n, liquidationFeeBps: 50n, bandMaxEpochSlots: 600n })).toBeNull();
    expect(growthLVolX100({ volHasData: true, volVarX100: 2_500 }, { engineImrBps: 500n, liquidationFeeBps: 50n, bandMaxEpochSlots: U64_MAX })).not.toBeNull();
  });
  it("growthMatcherCapsG8: zero caps", () => {
    // cap 0 when the depth cap's own N_cap overflows (the u128 clamp on depth*4 needs cap > 0, so it is unreachable)
    expect(growthMatcherCapsG8({ clamp: true, hlockActive: false, cM: 1_000_000_000n, lambdaBps: 10_000, tier: 0, capDepth: U128_MAX, priceE6: 1_000_000n, dials: { kappaBps: 10_000, lambdaDepthBps: 10_000 } })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    expect(growthMatcherCapsG8({ clamp: true, hlockActive: true, cM: 1n, lambdaBps: 1, tier: 0, capDepth: 5n, priceE6: 1n })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
  });
});
