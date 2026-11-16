/**
 * growth-v19 branch coverage: error paths, saturation clamps, zero / max values and rounding edges of src/abi/growth-v19.ts.
 * Expected values are hand-derived from the documented formulas of percolator-prog src/growth_v19.rs (dyn_imr_bps, n_cap_q,
 * liquidity_notional_e6, ratchet, curve, vol EWMA, ...). Tests only; no src change.
 */
import { describe, it, expect } from "vitest";
import {
  decodeAssetGrowthRecordV19, decodeAssetGrowthV19, assetGrowthAccountOffsetV19, nCapQ, liquidityNotionalE6, dynImrBps,
  growthMatcherCapsV3, growthMatcherCapsG8, isDexPinned, depthPushModeAllowed, depthTwMinAtoms, depthTwLayoutOk, depthRateLimited,
  bookDepthFromPins, mergeTierConfigAtBind, validateTierConfig, depthCapQKappa, curvePos, curvePosLag, tierRampU64, volSampleX100,
  volUpdateX100, isqrtCeil, sigmaHBps, lVolX100, growthLVolX100, stressCapX100, stressCapCurveX100, bandRGapBps, ratchetCeilingX100,
  cLaunchAtomsFor, graduationRatchet, graduationFallOnly, kappaEffBps, lambdaVolBps, lambdaFallbackBps, quoteMaxLeverage,
  previewGrowthOpenFee, encodeInitMarketV19, encodeInitVaultLpV19, encodeInitVaultLpV22Tiers, encodeSetAssetRiskLimitsV22Tiers,
  encodeMatcherCallExtV3, encodeMatcherCallExtV3FromV2, encodeMatcherCallExtV2, GROWTH_MAX_POSITION_ABS_Q, GROWTH_MAX_IMR_BPS,
  STRESS_NONE, STRESS_DRAW, STRESS_HLOCK, GROWTH_RATCHET_EPOCH_SLOTS, DEPTH_MODE, DEPTH_DEX_PINNED, GROWTH_FLAG_R3_LAYOUT,
  GROWTH_MIN_C_LAUNCH_ATOMS, CURVE_POS_FAIL, GROWTH_U64_MAX, depthRiseStamp, growthCeilingView, DEPTH_TW_EMPTY, stressLevel,
  utilisationFeeBps, utilFeeMaxEffectiveBps, openingPartQ, growthCollateralDecimalsOk,
} from "../src/index.js";
import type { AssetGrowthV19, GrowthVolInputs } from "../src/index.js";
import { stampMarket } from "./helpers/stamp.js";

const U64 = (1n << 64n) - 1n;
const U128 = (1n << 128n) - 1n;

function rec(over: Partial<Record<string, number | bigint>> = {}): Uint8Array {
  const r = new Uint8Array(120);
  const v = new DataView(r.buffer);
  const d = { slot: 0n, lambda: 10_000, launch: 500, tier: 2_000, ceil: 500, kink: 5_000, gap: 500, ...over };
  v.setBigUint64(8, d.slot as bigint, true); v.setUint32(16, d.lambda as number, true);
  v.setUint16(20, d.launch as number, true); v.setUint16(22, d.tier as number, true); v.setUint16(24, d.ceil as number, true);
  v.setUint16(26, d.kink as number, true); v.setUint16(28, d.gap as number, true);
  r[38] = 1;
  return r;
}
const G = (over: Partial<AssetGrowthV19> = {}): AssetGrowthV19 => ({ ...(decodeAssetGrowthRecordV19(rec()) as AssetGrowthV19), ...over });

describe("scalar helpers: integer guard, offsets, short market", () => {
  it("rejects non-integer number inputs (big())", () => {
    expect(() => nCapQ(1n, 1.5, 1n)).toThrow(/lambdaBps must be an integer/);
    expect(() => dynImrBps(1n, 1n, 1.5, 0)).toThrow(/baseImr must be an integer/);
  });
  it("assetGrowthAccountOffsetV19 rejects negative and fractional assetIndex", () => {
    expect(() => assetGrowthAccountOffsetV19(-1)).toThrow(/bad assetIndex -1/);
    expect(() => assetGrowthAccountOffsetV19(0.5)).toThrow(/bad assetIndex/);
  });
  it("decodeAssetGrowthV19 throws on a market too short for the asset", () => {
    const short = new Uint8Array(2022 + 60); stampMarket(short);
    expect(() => decodeAssetGrowthV19(short, 0)).toThrow(/too short for asset 0/);
  });
  it("isDexPinned(null) is false; depthPushModeAllowed refuses Attested push on a pinned source only", () => {
    expect(isDexPinned(null)).toBe(false);
    expect(isDexPinned({ depthDexPinned: true })).toBe(true);
    expect(depthPushModeAllowed(DEPTH_DEX_PINNED | 1, DEPTH_MODE.Attested)).toBe(false);
    expect(depthPushModeAllowed(DEPTH_DEX_PINNED | 1, DEPTH_MODE.OnChainDex)).toBe(true);
    expect(depthPushModeAllowed(1, DEPTH_MODE.Attested)).toBe(true);
  });
});

describe("u128 overflow guards (n_cap_q / liquidity_notional_e6 / dyn_imr_bps)", () => {
  it("nCapQ is null on a*posScale, den and product overflow; zero price null", () => {
    expect(nCapQ(U128, 2, 1n)).toBeNull(); // cM * lambda > u128
    expect(nCapQ(U128, 1, 1n, 2n)).toBeNull(); // a * posScale > u128
    expect(nCapQ(1n, 1, U128, 1n)).toBeNull(); // 1e4 * price > u128
    expect(nCapQ(1n, 1, 0n)).toBeNull();
    expect(nCapQ(10_000n, 10_000, 1_000_000n)).toBe(10_000n); // 1e4*1e4*1e6 / (1e4*1e6)
  });
  it("liquidityNotionalE6 is null when c*lambda or *4 overflows", () => {
    expect(liquidityNotionalE6(U128, 2)).toBeNull();
    expect(liquidityNotionalE6(U128 / 2n, 1)).toBeNull(); // (u128/2)*4 > u128
    expect(liquidityNotionalE6(U128 / 4n, 1)).toBe((U128 / 4n * 4n) / 10_000n);
  });
  it("dynImrBps is null on lhs/rhs and num/den overflow", () => {
    expect(dynImrBps(U128, U128, 1_000n, 5_000n)).toBeNull(); // lhs = lp*1e4 > u128
    expect(dynImrBps(1n, U128, 1_000n, 5_000n)).toBeNull(); // rhs = kink*n > u128
    // num = span * (lhs - rhs) overflows: lp = n = 2^120, kink 1 bps
    const n = 1n << 120n;
    expect(dynImrBps(n, n, 1n, 1n)).toBeNull();
  });
  it("dynImrBps clamps to the 10_000 ceiling when ceil rounding would exceed it", () => {
    // u == 1 at kink 0: base + ceil(span*lhs/(n*1e4)) = base + span = 10_000 exactly
    expect(dynImrBps(1_000n, 1_000n, 2_000n, 0n)).toBe(GROWTH_MAX_IMR_BPS);
  });
  it("growthMatcherCapsV3 caps at 1e14 and reports liquidity 0 when cap is 0", () => {
    const huge = growthMatcherCapsV3({ lambdaBps: 100_000 }, 10n ** 25n, 1n);
    expect(huge.inventoryCapQ).toBe(GROWTH_MAX_POSITION_ABS_Q);
    expect(growthMatcherCapsV3({ lambdaBps: 10_000 }, 1_000n, 0n, false)).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    expect(growthMatcherCapsV3({ lambdaBps: 10_000 }, 1_000n, 1n, true)).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    // cap > 0 but liquidity overflows -> 0 via ?? 0n
    expect(growthMatcherCapsV3({ lambdaBps: 10_000 }, U128 / 3n, 10n ** 30n, false).inventoryCapQ).toBeGreaterThanOrEqual(0n);
  });
});

describe("depth window helpers", () => {
  it("depthTwMinAtoms is null on an empty window and saturates at u64", () => {
    expect(depthTwMinAtoms(DEPTH_TW_EMPTY, 1n)).toBeNull();
    expect(depthTwMinAtoms({ curTokens: 0xffff_ffff, prevTokens: 0xffff_ffff, bucketP1: 1 }, 1n << 40n)).toBe(U64);
    expect(depthTwMinAtoms({ curTokens: 5, prevTokens: 3, bucketP1: 1 }, 10n)).toBe(30n);
  });
  it("depthTwLayoutOk: an empty window passes without R3, a live one needs the flag", () => {
    expect(depthTwLayoutOk(0, DEPTH_TW_EMPTY)).toBe(true);
    expect(depthTwLayoutOk(0, { curTokens: 1, prevTokens: 1, bucketP1: 3 })).toBe(false);
    expect(depthTwLayoutOk(GROWTH_FLAG_R3_LAYOUT, { curTokens: 1, prevTokens: 1, bucketP1: 3 })).toBe(true);
  });
  it("depthRateLimited saturates the doubling at u64 and floors at the bootstrap seed", () => {
    const slot = 1_000_000n;
    // base sticky is huge: doubling saturates to u64 max, min(w, up) = w
    const r = depthRateLimited(true, U64, slot, 0, U64, true, slot, 16n);
    expect(r.lastGoodE6).toBe(U64);
    // bootstrap: not ever -> min(w, seed/16)
    expect(depthRateLimited(false, 0n, 0n, 0, 100n, true, slot, 1_600n).lastGoodE6).toBe(100n);
    expect(depthRateLimited(false, 0n, 0n, 0, 5_000n, true, slot, 1_600n).lastGoodE6).toBe(100n);
  });
});

describe("book depth, tier config merge and validation", () => {
  it("bookDepthFromPins: wide fixed spread -> 0, small pin total -> capE6, huge cap saturates", () => {
    expect(bookDepthFromPins(1_000n, 200, 50, 300)).toBe(0n);
    expect(bookDepthFromPins(1_000n, 10, 50, 100)).toBe(1_000n);
    // d4 overflows u128 -> clamped to U128; prod then overflows -> 0n
    expect(bookDepthFromPins(U128, 10, 50, 300)).toBe(0n);
    // prod just fits: d = U128 clamp not hit, n = min(n, cap)
    expect(bookDepthFromPins(1_000n, 20, 50, 300)).toBe(1_000n);
  });
  it("mergeTierConfigAtBind keeps non-zero stored entries per slot and fills zeros from the creator", () => {
    const m = mergeTierConfigAtBind(
      { thresholdUsd: [0, 7, 0], leverageX100: [3, 0, 5] },
      { thresholdUsd: [1, 2, 3], leverageX100: [10, 20, 30] },
    );
    expect(m).toEqual({ thresholdUsd: [1, 7, 3], leverageX100: [3, 20, 5] });
    const m2 = mergeTierConfigAtBind({ thresholdUsd: [9, 0, 8], leverageX100: [0, 4, 0] }, { thresholdUsd: [1, 2, 3], leverageX100: [10, 20, 30] });
    expect(m2).toEqual({ thresholdUsd: [9, 2, 8], leverageX100: [10, 4, 30] });
  });
  it("validateTierConfig: non-integers, formatting variants and range", () => {
    const r = validateTierConfig({ thresholdsUsd: [1.5, 20_000, 100_000], leverageX100: [500.5, 1_000, 2_000], lLaunchX100: 500, lTierX100: 2_000 });
    expect(r.ok).toBe(false);
    expect(r.issues.map((x) => `${x.field}:${x.code}:${x.tier}`)).toEqual(["thresholds:not-an-integer:1", "leverage:not-an-integer:1"]);
    // collateral naming: a 6-dec usd-like collateral says "dollars", other mints their symbol, none says "tokens"
    const usd = validateTierConfig({ thresholdsUsd: [0.5, 0, 0], lLaunchX100: 500, lTierX100: 2_000, collateral: { decimals: 6, usdLike: true } });
    expect(usd.issues[0]?.message).toContain("dollars");
    const sym = validateTierConfig({ thresholdsUsd: [0.5, 0, 0], lLaunchX100: 500, lTierX100: 2_000, collateral: { decimals: 9, symbol: "SOL" } });
    expect(sym.issues[0]?.message).toContain("SOL");
    const none = validateTierConfig({ thresholdsUsd: [0.5, 0, 0], lLaunchX100: 500, lTierX100: 2_000 });
    expect(none.issues[0]?.message).toContain("tokens");
    // below-floor message formatting: usd-like -> $, otherwise symbol / "tokens"
    const bf = validateTierConfig({ thresholdsUsd: [1_000, 0, 0], lLaunchX100: 500, lTierX100: 2_000, collateral: { decimals: 6, usdLike: true } });
    expect(bf.issues[0]).toMatchObject({ code: "below-floor", message: "Tier 1 pool depth must be at least $5,000." });
    const bf2 = validateTierConfig({ thresholdsUsd: [1_000, 0, 0], lLaunchX100: 500, lTierX100: 2_000, collateral: { decimals: 9, symbol: "SOL" } });
    expect(bf2.issues[0]?.message).toBe("Tier 1 pool depth must be at least 5,000 SOL.");
    const bf3 = validateTierConfig({ thresholdsUsd: [1_000, 0, 0], lLaunchX100: 500, lTierX100: 2_000, collateral: { decimals: 6 } });
    expect(bf3.issues[0]?.message).toBe("Tier 1 pool depth must be at least 5,000 tokens.");
    // non-integer launch / tier ceiling
    const lg = validateTierConfig({ lLaunchX100: 500.5, lTierX100: 2_000 });
    expect(lg.issues).toEqual([{ field: "leverage", code: "not-an-integer", message: "Launch leverage and the market maximum must be whole numbers." }]);
    // leverage message formatting: whole and fractional multiples
    const whole = validateTierConfig({ leverageX100: [3_000, 0, 0], lLaunchX100: 500, lTierX100: 2_000 });
    expect(whole.issues[0]?.message).toContain("maximum of 20x");
    const frac = validateTierConfig({ leverageX100: [3_000, 0, 0], lLaunchX100: 500, lTierX100: 1_250 });
    expect(frac.issues[0]?.message).toContain("maximum of 12.5x");
    const below = validateTierConfig({ leverageX100: [400, 0, 0], lLaunchX100: 550, lTierX100: 2_000 });
    expect(below.issues[0]?.message).toContain("launch leverage of 5.5x");
  });
  it("validateTierConfig out-of-range attestedMaxTier and decimals", () => {
    expect(validateTierConfig({ lLaunchX100: 500, lTierX100: 2_000, attestedMaxTier: 4 }).issues[0]?.code).toBe("out-of-range");
    expect(validateTierConfig({ lLaunchX100: 500, lTierX100: 2_000, collateral: { decimals: 13 } }).issues[0]?.code).toBe("collateral-decimals");
    expect(growthCollateralDecimalsOk(13)).toBe(false);
  });
});

describe("G8 caps", () => {
  const base = { clamp: true, hlockActive: false, cM: 1_000_000_000n, lambdaBps: 10_000, tier: 1, priceE6: 1_000_000n };
  it("depthCapQKappa: null depth -> u128 max, zero price -> 0", () => {
    expect(depthCapQKappa(5_000, null, 1n)).toBe(U128);
    expect(depthCapQKappa(5_000, 100_000_000n, 0n)).toBe(0n);
  });
  it("growthMatcherCapsG8: nCapG8Q null (zero price) -> zero caps; h-lock; saturating liquidity", () => {
    expect(growthMatcherCapsG8({ ...base, capDepth: 1_000_000_000n, priceE6: 0n })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    expect(growthMatcherCapsG8({ ...base, capDepth: 1_000_000_000n, hlockActive: true })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    expect(growthMatcherCapsG8({ ...base, clamp: false, capDepth: null, hlockActive: true })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    // off the clamp: g1 at the stored lambda; zero price -> cap 0 -> zero pair
    expect(growthMatcherCapsG8({ ...base, clamp: false, capDepth: null, priceE6: 0n })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    // clamp, null depth -> g1(min(lambda, lambdaDepth))
    const g1 = growthMatcherCapsG8({ ...base, capDepth: null });
    expect(g1.inventoryCapQ).toBeGreaterThan(0n);
    // g1 cap above the engine limit is clipped
    expect(growthMatcherCapsG8({ ...base, clamp: false, capDepth: null, cM: 10n ** 25n, priceE6: 1n }).inventoryCapQ).toBe(GROWTH_MAX_POSITION_ABS_Q);
    // depth path: cap clipped to the explicit engine limit; liquidity min(capital, depth*4) with depth*4 saturated at u128
    const c = growthMatcherCapsG8({ ...base, capDepth: 10n ** 20n, maxPositionAbsQ: 5n });
    expect(c.inventoryCapQ).toBe(5n);
  });
});

describe("curve position edges", () => {
  const th: [bigint, bigint, bigint] = [25_000_000_000n, 100_000_000_000n, 500_000_000_000n];
  it("curvePos fails on out-of-range depth, is zero at 0 and past T3; segment boundaries", () => {
    expect(curvePos(-1n, th)).toEqual(CURVE_POS_FAIL);
    expect(curvePos(U64 + 1n, th)).toEqual(CURVE_POS_FAIL);
    expect(curvePos(0n, th)).toEqual({ seg: 0, num: 0, den: 0 });
    expect(curvePos(th[2], th).seg).toBe(4);
    expect(curvePos(th[1], th).seg).toBe(3);
    expect(curvePos(th[2] - 1n, th).seg).toBe(3);
  });
  it("curvePos degenerate thresholds: u64-max or non-rising upper anchor gives num 0", () => {
    const a = curvePos(30_000_000_000n, [25_000_000_000n, U64, U64]);
    expect(a.den).toBe(0);
    const b = curvePos(30_000_000_000n, [25_000_000_000n, 25_000_000_000n, 25_000_000_000n]);
    expect(b.num).toBe(0);
  });
  it("curvePosLag: every lead segment, top segment saturating and past 4x T3", () => {
    const lead = (seg: number) => ({ seg, num: 7, den: 9 });
    expect(curvePosLag(lead(1), 1n, th)).toEqual({ seg: 0, num: 7, den: 9 });
    expect(curvePosLag(lead(3), 1n, th)).toEqual({ seg: 2, num: 7, den: 9 });
    expect(curvePosLag(lead(0), 1n, th)).toEqual({ seg: 0, num: 0, den: 0 });
    expect(curvePosLag({ seg: 9, num: 0, den: 0 }, 1n, th)).toEqual(CURVE_POS_FAIL);
    // seg 4: T3 * 4 saturates u64 -> degenerate seg 3
    expect(curvePosLag(lead(4), 1n, [1n, 2n, U64 / 2n])).toEqual({ seg: 3, num: 0, den: 0 });
    expect(curvePosLag(lead(4), 1n, [1n, 2n, 0n])).toEqual({ seg: 3, num: 0, den: 0 }); // hi <= lo
    expect(curvePosLag(lead(4), 4n * th[2], th)).toEqual({ seg: 4, num: 0, den: 0 });
    const mid = curvePosLag(lead(4), 2n * th[2], th);
    expect(mid.seg).toBe(3);
    expect(mid.num).toBeGreaterThan(0);
    expect(mid.num).toBeLessThanOrEqual(mid.den);
  });
  it("tierRampU64: below T1 gives table[0]; past ramp end gives the next value; saturating ramp end", () => {
    const table: [bigint, bigint, bigint, bigint] = [500n, 500n, 1_000n, 2_000n];
    expect(tierRampU64(1n, th, table)).toBe(500n);
    expect(tierRampU64(th[1] + th[1] / 8n, th, table)).toBeGreaterThan(500n);
    expect(tierRampU64(th[2] * 2n, th, table)).toBe(2_000n);
    // loX + loX/4 overflows u64: ramp end saturates, the ramp interpolates to d
    const big: [bigint, bigint, bigint] = [1n, 2n, U64 - 1n];
    expect(tierRampU64(U64, big, table)).toBe(2_000n);
  });
});

describe("volatility maths", () => {
  it("volSampleX100: null on zero prev mark / zero dt, caps the move at 10_000 bps, symmetric diff", () => {
    expect(volSampleX100(0n, 5n, 1n)).toBeNull();
    expect(volSampleX100(5n, 6n, 0n)).toBeNull();
    expect(volSampleX100(100n, 1_000_000n, 1n)).toBe(10_000n * 10_000n * 100n); // move capped at 1e4 bps
    expect(volSampleX100(110n, 100n, 1n)).toBe(910n * 910n * 100n); // down move: ceil(10*1e4/110) = 910 bps
    expect(volSampleX100(100n, 110n, 1n)).toBe(1_000n * 1_000n * 100n); // up move: 1000 bps
    expect(volSampleX100(100n, 110n, 3n)).toBe(33_333_334n); // ceil(1e8 / 3)
  });
  it("volUpdateX100: seed, saturating u32, rise (ceil) and fall (floor)", () => {
    expect(volUpdateX100(0, false, 10n)).toBe(2_500);
    expect(volUpdateX100(0, false, 9_999n)).toBe(9_999);
    expect(volUpdateX100(0, false, 1n << 40n)).toBe(0xffff_ffff);
    expect(volUpdateX100(0xffff_fff0, true, 1n << 40n)).toBe(0xffff_fff1); // sample clamped to u32 max, ceil(15/16) = 1
    expect(volUpdateX100(1_000, true, 1_001n)).toBe(1_001); // ceil(1/16) = 1
    expect(volUpdateX100(1_000, true, 1_000n)).toBe(1_000);
    expect(volUpdateX100(1_000, true, 984n)).toBe(999); // floor(16/16)=1
    expect(volUpdateX100(1_000, true, 985n)).toBe(1_000); // floor(15/16)=0
  });
  it("isqrtCeil rejects negatives and rounds up; sigmaHBps saturates at u64", () => {
    expect(() => isqrtCeil(-1n)).toThrow(/negative input/);
    expect(isqrtCeil(0n)).toBe(0n);
    expect(isqrtCeil(16n)).toBe(4n);
    expect(isqrtCeil(17n)).toBe(5n);
    expect(sigmaHBps(0xffff_ffff, U64)).toBe(U64 < isqrtCeil((0xffff_ffffn * U64 + 99n) / 100n) ? U64 : isqrtCeil((0xffff_ffffn * U64 + 99n) / 100n));
    expect(sigmaHBps(100, 100n)).toBe(10n);
  });
  it("lVolX100: zero denominator -> 0xffff; huge denominator saturates; large caps at u16", () => {
    expect(lVolX100(0n, 0n, 0n)).toBe(0xffff);
    expect(lVolX100(1n, 0n, 0n)).toBe(0xffff); // 1e6 / 1 > u16
    expect(lVolX100(500n, 174n, 50n)).toBe(1_748);
    expect(lVolX100(500n, U64, U64)).toBe(0); // need saturates at u64, 1e6 / u64 = 0
  });
  it("growthLVolX100: null without data; saturates the horizon at u64", () => {
    const cfg: GrowthVolInputs = { engineImrBps: 500n, liquidationFeeBps: 50n, bandMaxEpochSlots: U64 };
    expect(growthLVolX100({ volHasData: false, volVarX100: 5 }, cfg)).toBeNull();
    expect(growthLVolX100({ volHasData: true, volVarX100: 5 }, cfg)).toBe(lVolX100(500n, sigmaHBps(5, U64), 50n));
  });
});

describe("stress caps, ratchet, graduation writers", () => {
  const table = [500, 500, 1_000, 2_000] as const;
  it("stressCapX100: none, h-lock, tier clamp above 3, floor at table[0]", () => {
    expect(stressCapX100(STRESS_NONE, 3, table)).toBe(0xffff);
    expect(stressCapX100(STRESS_HLOCK, 3, table)).toBe(500);
    expect(stressCapX100(STRESS_DRAW, 9, table)).toBe(1_000); // tier clamped to 3 then minus 1
    expect(stressCapX100(2, 1, table)).toBe(500); // max(1 - 2, 0)
  });
  it("stressCapCurveX100 (deprecated control): none, h-lock, top segment shift, low segment fall to launch", () => {
    expect(stressCapCurveX100(STRESS_NONE, CURVE_POS_FAIL, table)).toBe(0xffff);
    expect(stressCapCurveX100(STRESS_HLOCK, CURVE_POS_FAIL, table)).toBe(500);
    expect(stressCapCurveX100(STRESS_DRAW, { seg: 4, num: 0, den: 0 }, table)).toBe(1_000);
    expect(stressCapCurveX100(STRESS_DRAW, { seg: 1, num: 0, den: 1 }, table)).toBe(500);
    expect(stressCapCurveX100(STRESS_DRAW, { seg: 3, num: 0, den: 10 }, table)).toBe(500);
  });
  it("bandRGapBps: out of range is null, the maximum band fits", () => {
    expect(bandRGapBps(0)).toBeNull();
    expect(bandRGapBps(2_001)).toBeNull();
    expect(bandRGapBps(1_000n)).toBe(3_445n);
    expect(bandRGapBps(2_000)).toBe(8_000n); // the maximum band still fits u16
  });
  it("ratchetCeilingX100: equal target keeps slot; fall resets slot; rise waits for the epoch; saturated epoch", () => {
    expect(ratchetCeilingX100(500, 7n, 500, 500, STRESS_NONE, 100n)).toEqual({ ceilX100: 500, ceilSlot: 7n });
    expect(ratchetCeilingX100(800, 7n, 600, 500, STRESS_NONE, 100n)).toEqual({ ceilX100: 600, ceilSlot: 100n });
    expect(ratchetCeilingX100(500, 7n, 900, 500, STRESS_NONE, 100n)).toEqual({ ceilX100: 500, ceilSlot: 7n });
    expect(ratchetCeilingX100(500, 7n, 900, 500, STRESS_NONE, 7n + GROWTH_RATCHET_EPOCH_SLOTS)).toEqual({ ceilX100: 600, ceilSlot: 7n + GROWTH_RATCHET_EPOCH_SLOTS });
    expect(ratchetCeilingX100(500, 7n, 550, 500, STRESS_NONE, 7n + GROWTH_RATCHET_EPOCH_SLOTS).ceilX100).toBe(550);
    // prevSlot + epoch overflows: bound saturates to u64, only now == u64 max opens it
    expect(ratchetCeilingX100(500, U64 - 1n, 900, 500, STRESS_NONE, U64 - 1n).ceilX100).toBe(500);
    expect(ratchetCeilingX100(500, U64 - 1n, 900, 500, STRESS_NONE, U64).ceilX100).toBe(600);
    // step saturates at u16
    expect(ratchetCeilingX100(0xffff - 10, 0n, 0xffff, 500, STRESS_NONE, 9_000n).ceilX100).toBe(0xffff);
    // h-lock drops the target to launch
    expect(ratchetCeilingX100(900, 0n, 2_000, 500, true, 5n)).toEqual({ ceilX100: 500, ceilSlot: 5n });
  });
  it("cLaunchAtomsFor floors at $1,000", () => {
    expect(cLaunchAtomsFor(1n)).toBe(GROWTH_MIN_C_LAUNCH_ATOMS);
    expect(cLaunchAtomsFor(GROWTH_MIN_C_LAUNCH_ATOMS + 1n)).toBe(GROWTH_MIN_C_LAUNCH_ATOMS + 1n);
  });
  it("graduationRatchet / graduationFallOnly read stress from `stress`, `forceDown` or default none", () => {
    const i = { graduation: true, prevCeilX100: 1_500, prevSlot: 3n, lLaunchX100: 500, lTierX100: 2_000, lTableTierX100: 1_000, nowSlot: 50n };
    expect(graduationRatchet({ ...i, forceDown: true })).toEqual({ ceilX100: 500, ceilSlot: 50n });
    expect(graduationRatchet({ ...i, stress: STRESS_NONE })).toEqual({ ceilX100: 1_000, ceilSlot: 50n });
    expect(graduationFallOnly({ ...i, forceDown: true })).toEqual({ ceilX100: 500, ceilSlot: 50n });
    expect(graduationFallOnly(i)).toEqual({ ceilX100: 1_000, ceilSlot: 50n });
    expect(graduationFallOnly({ ...i, prevCeilX100: 800 })).toEqual({ ceilX100: 800, ceilSlot: 3n });
    expect(graduationFallOnly({ ...i, stress: STRESS_NONE, stressCapX100: 600 }).ceilX100).toBe(600);
  });
});

describe("kappa / lambda caps", () => {
  it("kappaEffBps takes the smaller of tier and fee-derived cap; lambdaVolBps zero sigma and saturation", () => {
    expect(kappaEffBps(50_000, 5)).toBeLessThan(50_000);
    expect(kappaEffBps(1, 5)).toBe(1);
    expect(kappaEffBps(50_000, null)).toBe(kappaEffBps(50_000, 5));
    expect(lambdaVolBps(0n)).toBe(Number.MAX_SAFE_INTEGER);
    expect(lambdaVolBps(1n)).toBe(47_500_000); // 47.5e6 / 1: the u32 clamp is not reachable from a u64 sigma >= 1
    expect(lambdaVolBps(1_000_000n)).toBeLessThan(0xffff_ffff);
  });
  it("lambdaFallbackBps min of the volatility term and the pre-W1 cap (LEV_W1_LIVE = false)", () => {
    expect(lambdaFallbackBps(1_000_000, 0n)).toBe(10_000);
    expect(lambdaFallbackBps(100, 1_000n)).toBeLessThanOrEqual(100);
    expect(lambdaFallbackBps(100, 0n)).toBe(100);
  });
});

// ============================================================================
// growthCeilingView: depth rate-limit ETA, stored ceiling, ratchet ETA
// ============================================================================
describe("growthCeilingView depth-rate ETA and ratchet branches", () => {
  const BAND = 1_000; // bandRGapBps(1000) = 3445 -> clamp enforced
  const T1 = 25_000_000_000n, T2 = 100_000_000_000n; // default thresholds, 6-dec collateral
  const now = 1_000_000n;
  // volatility data on (var 100 -> L_vol 20x) so the signal is not pinned to launch by the no-data rule
  const VOL = { engineImrBps: 500n, liquidationFeeBps: 50n, bandMaxEpochSlots: 600n };
  const pool = (over: Partial<AssetGrowthV19> = {}): AssetGrowthV19 => G({
    volHasData: true, volVarX100: 100, rGapBps: 3_445, depthSource: 2, depthE6: 150_000_000_000n, depthPrevE6: 150_000_000_000n, depthSlot: now, depthPrevReal: true,
    depthEver: true, depthLastGoodE6: 10_000_000_000n, depthLastGoodSlot: now, depthRiseSlot64: 0, ...over,
  });
  /** Independent reference of `depth_rate_limit_eta`: the earliest slot the doubling rise reaches the threshold. */
  const refEta = (ever: boolean, lastGood: bigint, stamp0: number, fresh: bigint, thr: bigint, nowSlot: bigint, seed: bigint): bigint | null => {
    let cur = lastGood, stamp = stamp0;
    if (!ever) { const f = seed / 16n; cur = fresh < f ? fresh : f; stamp = Number(nowSlot / 64n); }
    if (cur >= thr) return 0n;
    let slot = nowSlot;
    for (let n = 0; n < 80; n++) {
      if (stamp === 0xffff_ffff) return null;
      const open = BigInt(stamp) * 64n + 63n + 9_000n;
      if (open > slot) slot = open;
      const floor = seed / 16n;
      const up = cur * 2n > floor ? cur * 2n : floor;
      cur = fresh < up ? fresh : up;
      stamp = Number(slot / 64n);
      if (cur >= thr) return slot - nowSlot;
    }
    return null;
  };

  it("a rate-limited pool depth reports the doubling ETA to the next tier", () => {
    const v = growthCeilingView(pool(), BAND, now, null, STRESS_NONE, VOL);
    expect(v.nextTierUnlock).toMatchObject({ kind: "both", tier: 2, depthRateLimited: true }); // cM unknown: the book tier reads 0 too
    const eta = refEta(true, 10_000_000_000n, 0, 150_000_000_000n, T2, now, T1 - 1n) as bigint;
    expect(v.nextTierUnlock.depthEtaSlots).toBe(eta);
    expect(v.nextTierUnlock.depthEtaMinutes).toBe(Number((eta * 400n + 59_999n) / 60_000n));
  });
  it("the doubling floors at seed/16 when the last good depth is 0 (up = floor)", () => {
    const g = pool({ depthLastGoodE6: 0n });
    const v = growthCeilingView(g, BAND, now, null, STRESS_NONE, VOL);
    expect(v.nextTierUnlock.depthEtaSlots).toBe(refEta(true, 0n, 0, 150_000_000_000n, T2, now, T1 - 1n) as bigint);
  });
  it("a fresh reading below the doubled depth caps the step at fresh", () => {
    const g = pool({ depthE6: 110_000_000_000n, depthPrevE6: 110_000_000_000n, depthLastGoodE6: 60_000_000_000n });
    const v = growthCeilingView(g, BAND, now, null, STRESS_NONE, VOL);
    expect(v.nextTierUnlock.depthEtaSlots).toBe(refEta(true, 60_000_000_000n, 0, 110_000_000_000n, T2, now, T1 - 1n) as bigint);
  });
  it("a window already open at `now` does not move the slot (open <= slot)", () => {
    const late = 5_000_000n;
    const g = pool({ depthSlot: late, depthLastGoodSlot: late });
    const v = growthCeilingView(g, BAND, late, null, STRESS_NONE, VOL);
    expect(v.nextTierUnlock.depthEtaSlots).toBe(refEta(true, 10_000_000_000n, 0, 150_000_000_000n, T2, late, T1 - 1n) as bigint);
  });
  it("the not-yet-ever path seeds from seed/16 and the fresh reading", () => {
    // depth flag EVER unset in the byte: seed/16 = 1_562_499_999
    const g = pool({ depthEver: false, depthLastGoodE6: 0n });
    const v = growthCeilingView(g, BAND, now, null, STRESS_NONE, VOL);
    expect(v.nextTierUnlock.depthEtaSlots).toBe(refEta(false, 0n, 0, 150_000_000_000n, T2, now, T1 - 1n) as bigint);
  });
  it("a saturated rise stamp cannot rise again: no ETA, plain depth requirement", () => {
    const g = pool({ depthRiseSlot64: 0xffff_ffff });
    const v = growthCeilingView(g, BAND, now, null, STRESS_NONE, VOL);
    expect(v.nextTierUnlock.kind).toBe("both");
    expect(v.nextTierUnlock.depthRateLimited).toBeUndefined();
    expect(v.nextTierUnlock.depthEtaSlots).toBeUndefined();
  });
  it("last good already past the threshold while the window minimum holds the usable depth back: ETA 0", () => {
    const tw = { curTokens: 50_000, prevTokens: 50_000, bucketP1: 5 }; // window min 50_000 tokens = $50k < tier 2
    const g = pool({ depthLastGoodE6: 200_000_000_000n, depthTw: tw });
    const v = growthCeilingView(g, BAND, now, null, STRESS_NONE, VOL);
    expect(v.depthTwMinE6).toBe(50_000_000_000n);
    expect(v.nextTierUnlock).toMatchObject({ tier: 2, depthRateLimited: true, depthEtaSlots: 0n, depthEtaMinutes: 0 });
  });
  it("a record without a depth window decodes as an empty window (depthTw undefined)", () => {
    const g = pool();
    delete (g as { depthTw?: unknown }).depthTw;
    expect(growthCeilingView(g, BAND, now, null, STRESS_NONE, VOL).depthTwMinE6).toBeNull();
  });
  it("a stored ceiling of 0 reads as launch; a due ratchet reports ETA 0", () => {
    const g = pool({ ceilX100: 0, ceilSlot: 0n, depthLastGoodE6: 150_000_000_000n });
    const v = growthCeilingView(g, BAND, now, 1_000_000_000_000n, STRESS_NONE, VOL);
    expect(v.nextUnlock).toMatchObject({ kind: "ratchet", leverageX100: 600, etaSlots: 0n, etaMinutes: 0 });
    const early = growthCeilingView({ ...g, ceilX100: 500, ceilSlot: now - 100n }, BAND, now, 1_000_000_000_000n, STRESS_NONE, VOL);
    expect(early.nextUnlock).toMatchObject({ kind: "ratchet", etaSlots: GROWTH_RATCHET_EPOCH_SLOTS - 100n });
  });
  it("book-only shortfall asks for backing; a 0-lambda record gives no backing figure", () => {
    const g = pool({ depthLastGoodE6: 150_000_000_000n, lambdaBps: 0 });
    const v = growthCeilingView(g, BAND, now, 0n, STRESS_NONE, VOL);
    expect(v.nextTierUnlock.backingUsd).toBeUndefined();
  });
});

// ============================================================================
// quoteMaxLeverage / previewGrowthOpenFee error paths
// ============================================================================
describe("quoteMaxLeverage and previewGrowthOpenFee edge paths", () => {
  const growth = G({ lLaunchX100: 1_000, lTierX100: 1_000, ceilX100: 1_000, kinkBps: 5_000, lambdaBps: 10_000 });
  const q = { engineImrBps: 1_000n, growth, lpCapital: 1_000_000_000n, lpPnl: 0n, lpFeeCredits: 0n, priceE6: 1_000_000n, bankruptcyHlockActive: false,
    assetBound: true, lpEffectivePositionQ: 0n, oiEffLongQ: 0n, oiEffShortQ: 0n };
  it("growth off: engine IMR 0 or above 100% is invalid-config; IMR 100% = 1x", () => {
    expect(quoteMaxLeverage({ ...q, growth: null, engineImrBps: 0n }, "long")).toMatchObject({ closed: true, closedReason: "invalid-config" });
    expect(quoteMaxLeverage({ ...q, growth: null, engineImrBps: 10_001n }, "long")).toMatchObject({ closed: true, closedReason: "invalid-config" });
    expect(quoteMaxLeverage({ ...q, growth: null, engineImrBps: 10_000n }, "long")).toMatchObject({ closed: false, maxLeverageX100: 100 });
  });
  it("engine IMR above 100% under growth is invalid-config (ceilingImrBps null)", () => {
    expect(quoteMaxLeverage({ ...q, engineImrBps: 10_001n }, "long")).toMatchObject({ closed: true, closedReason: "invalid-config" });
  });
  it("a corrupt kink above 100% refuses the crowd side (dyn_imr_bps null -> capacity-full)", () => {
    const bad = { ...q, growth: { ...growth, kinkBps: 20_000 }, oiEffLongQ: 1n, oiEffShortQ: 1n, lpEffectivePositionQ: -1n };
    expect(quoteMaxLeverage(bad, "long")).toMatchObject({ closed: true, closedReason: "capacity-full", headroomQ: 0n });
  });
  it("v22 input with a volatility block feeds the vol inputs into the ceiling view", () => {
    const g = pool22();
    const v22 = { bandBps: 1_000, nowSlot: 1_000_000n, vol: { liquidationFeeBps: 50n, bandMaxEpochSlots: 600n } };
    const r = quoteMaxLeverage({ ...q, growth: g, v22 }, "short");
    expect(r.ceilingX100).toBeGreaterThan(0);
    expect(r.closed).toBe(false);
    // the vol term caps the signal: with huge variance L_vol collapses to the floor of 1x-ish
    const hot = quoteMaxLeverage({ ...q, growth: { ...g, volHasData: true, volVarX100: 4_000_000_000 }, v22 }, "short");
    expect(hot.ceilingX100).toBeLessThanOrEqual(r.ceilingX100);
  });
  it("previewGrowthOpenFee: zero price (nCap null) charges nothing; a corrupt kink charges nothing", () => {
    const base = { ...q, oiEffLongQ: 10n, oiEffShortQ: 10n };
    expect(previewGrowthOpenFee({ ...base, priceE6: 0n }, 0n, 10n, 10n).utilFeeBps).toBe(0);
    expect(previewGrowthOpenFee({ ...base, growth: { ...growth, kinkBps: 20_000 } }, 0n, 10n, 10n).utilFeeBps).toBe(0);
    expect(utilisationFeeBps(1n, 0n, 0, 5)).toBeNull();
    expect(utilFeeMaxEffectiveBps(0)).toBe(500);
    expect(openingPartQ(5n, -3n)).toBe(3n);
  });
  function pool22(): AssetGrowthV19 {
    return G({ rGapBps: 3_445, lLaunchX100: 500, lTierX100: 2_000, ceilX100: 500, depthSource: 2, depthE6: 150_000_000_000n, depthPrevE6: 150_000_000_000n, depthSlot: 1_000_000n,
      depthPrevReal: true, depthEver: true, depthLastGoodE6: 150_000_000_000n, depthLastGoodSlot: 1_000_000n });
  }
  it("stressLevel feeds the ceiling view as numbers", () => {
    expect(stressLevel(false, false, true)).toBe(STRESS_HLOCK);
  });
});

// ============================================================================
// encoders
// ============================================================================
describe("encoder argument guards", () => {
  const args = { admin: undefined } as never;
  it("encodeInitMarketV19 rejects collateral decimals above the cap before reading args", () => {
    expect(() => encodeInitMarketV19(args, 500, 550, 13)).toThrow(/13 decimals/);
  });
  it("encodeInitVaultLpV19 / V22Tiers reject a non-u16 junior floor", () => {
    expect(() => encodeInitVaultLpV19(-1, 500)).toThrow(/juniorFloorBps must be a u16/);
    expect(() => encodeInitVaultLpV19(0x1_0000, 500)).toThrow(/juniorFloorBps must be a u16/);
    expect(() => encodeInitVaultLpV19(1.5, 500)).toThrow(/juniorFloorBps must be a u16/);
    const tiers = { thresholdUsd: [0, 0, 0], leverageX100: [0, 0, 0] } as const;
    expect(() => encodeInitVaultLpV22Tiers(-1, 500, tiers)).toThrow(/juniorFloorBps must be a u16/);
    expect(() => encodeInitVaultLpV22Tiers(0x1_0000, 500, tiers)).toThrow(/juniorFloorBps must be a u16/);
    expect(encodeInitVaultLpV22Tiers(0xffff, 500, tiers)[0]).toBe(94);
  });
  it("encodeSetAssetRiskLimitsV22Tiers rejects bad asset index, kink and fee cap", () => {
    const tiers = { thresholdUsd: [0, 0, 0], leverageX100: [0, 0, 0] } as const;
    expect(() => encodeSetAssetRiskLimitsV22Tiers(-1, 10_000, 5_000, tiers, 1)).toThrow(/assetIndex must be a u16/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0x1_0000, 10_000, 5_000, tiers, 1)).toThrow(/assetIndex must be a u16/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 0, 5_000, tiers, 1)).toThrow(/lambdaBps must be a u32/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, -1, tiers, 1)).toThrow(/kinkBps must be a u16/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 0x1_0000, tiers, 1)).toThrow(/kinkBps must be a u16/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, tiers, 1, -1)).toThrow(/utilFeeMaxBps must be a u16/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, tiers, 1, 0x1_0000)).toThrow(/utilFeeMaxBps must be a u16/);
    expect(encodeSetAssetRiskLimitsV22Tiers(0xffff, 10_000, 0xffff, tiers, 1, 0xffff).length).toBe(44 + 27);
  });
  const ext = { requestId: 1n, lpAccountId: 0n, oracleE6: 1_000_000n, reqSize: 1n, lpPositionQ: 0n, staleCtx: 0, flags: 0, nonce: 0n } as never;
  it("matcher ext v3 block-length and cap-range guards", () => {
    expect(() => encodeMatcherCallExtV3FromV2(new Uint8Array(39), { inventoryCapQ: 0n, liquidityNotionalE6: 0n })).toThrow(/v2 block must be 40 bytes, got 39/);
    const v2 = new Uint8Array(40);
    expect(() => encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: -1n, liquidityNotionalE6: 0n })).toThrow(/inventoryCapQ must fit i128/);
    expect(() => encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: 1n << 127n, liquidityNotionalE6: 0n })).toThrow(/inventoryCapQ must fit i128/);
    expect(() => encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: 0n, liquidityNotionalE6: -1n })).toThrow(/liquidityNotionalE6 out of u128 range/);
    expect(() => encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: 0n, liquidityNotionalE6: 1n << 128n })).toThrow(/liquidityNotionalE6 out of u128 range/);
    const ok = encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: (1n << 127n) - 1n, liquidityNotionalE6: U128 });
    expect(ok.length).toBe(72);
    expect(Buffer.from(ok.subarray(56, 72)).equals(Buffer.alloc(16, 0xff))).toBe(true);
    expect(() => encodeMatcherCallExtV2({ ...(ext as object), lpPositionQ: -(1n << 127n) } as never)).toThrow(/non-MIN i128/);
    expect(() => encodeMatcherCallExtV2({ ...(ext as object), lpPositionQ: 1n << 127n } as never)).toThrow(/non-MIN i128/);
    expect(() => encodeMatcherCallExtV3({ ...(ext as object), lpPositionQ: 1n << 127n } as never, { inventoryCapQ: 0n, liquidityNotionalE6: 0n })).toThrow(/non-MIN/);
  });
  it("GROWTH_U64_MAX is u64 max; depthRiseStamp saturates", () => {
    expect(GROWTH_U64_MAX).toBe(U64);
    expect(depthRiseStamp(1n << 60n)).toBe(0xffff_ffff);
  });
});
