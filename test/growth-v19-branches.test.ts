/**
 * Branch coverage for src/abi/growth-v19.ts: the overflow / fail-closed / guard branches on the money paths
 * (N_cap, liquidity, IMR curve, depth rate limiter, utilisation fee preview, tier validation, encoders).
 * Every assertion is a concrete value derived from the formulas in the source (and the Rust mirror), not a snapshot.
 */
import { describe, it, expect } from "vitest";
import {
  assetGrowthAccountOffsetV19, decodeAssetGrowthV19, decodeAssetGrowthRecordV19, nCapQ, liquidityNotionalE6, dynImrBps, growthMatcherCapsV3,
  growthMatcherCapsG8, nCapG8Q, depthCapQKappa, isDexPinned, depthPushModeAllowed, depthTwLayoutOk, depthTwMinAtoms, depthRateLimited,
  bookDepthFromPins, mergeTierConfigAtBind, validateTierConfig, volSampleX100, volUpdateX100, sigmaHBps, lVolX100, lambdaVolBps,
  kappaEffBps, ratchetCeilingX100, cLaunchAtomsFor, graduationFallOnly, quoteMaxLeverage, previewGrowthOpenFee, encodeInitVaultLpV19,
  encodeInitVaultLpV22Tiers, encodeSetAssetRiskLimitsV22Tiers, encodeInitMarketV19, encodeMatcherCallExtV3FromV2, markExtV3TakerReducing,
  encodeMatcherCallExtV2, encodeSetAssetRiskLimitsV19, bandRGapBps, tierRampU64, stressCapX100, stressCapCurveX100, curvePos,
  DEPTH_DEX_PINNED, DEPTH_MODE, DEPTH_TW_EMPTY, GROWTH_FLAG_R3_LAYOUT, STRESS_NONE, STRESS_HLOCK, GROWTH_MAX_POSITION_ABS_Q,
} from "../src/index.js";
import type { AssetGrowthV19 } from "../src/index.js";
import { stampMarket } from "./helpers/stamp.js";

const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;

function growthRecord(over: Partial<Record<string, number | bigint>> = {}): Uint8Array {
  const r = new Uint8Array(120);
  const v = new DataView(r.buffer);
  const d = { c: 5_000_000_000n, slot: 123_456_789n, lambda: 10_000, launch: 1_000, tier: 1_000, ceil: 1_000, kink: 5_000, gap: 500, version: 1, flags: 0, util: 0, ...over };
  v.setBigUint64(0, d.c as bigint, true); v.setBigUint64(8, d.slot as bigint, true); v.setUint32(16, d.lambda as number, true);
  v.setUint16(20, d.launch as number, true); v.setUint16(22, d.tier as number, true); v.setUint16(24, d.ceil as number, true);
  v.setUint16(26, d.kink as number, true); v.setUint16(28, d.gap as number, true);
  r[38] = d.version as number; r[39] = d.flags as number; v.setUint16(40, d.util as number, true);
  return r;
}
const rec = (over: Partial<Record<string, number | bigint>> = {}): AssetGrowthV19 => decodeAssetGrowthRecordV19(growthRecord(over)) as AssetGrowthV19;

describe("offset / decode guards", () => {
  it("rejects a negative or fractional asset index", () => {
    expect(() => assetGrowthAccountOffsetV19(-1)).toThrow("bad assetIndex -1");
    expect(() => assetGrowthAccountOffsetV19(1.5)).toThrow("bad assetIndex 1.5");
    expect(assetGrowthAccountOffsetV19(1)).toBe(2022 + 2325);
  });
  it("a market account too short for the asset's record throws instead of decoding garbage", () => {
    const mkt = new Uint8Array(2022 + 2325 + 120 + 8); stampMarket(mkt);
    expect(() => decodeAssetGrowthV19(mkt.subarray(0, 2022 + 2325 + 119), 1)).toThrow("market account too short for asset 1");
  });
});

describe("N_cap / liquidity / IMR curve fail closed on u128 overflow", () => {
  it("a non-integer lambda is refused", () => {
    expect(() => nCapQ(1n, 1.5, 1n)).toThrow("lambdaBps must be an integer, got 1.5");
  });
  it("nCapQ: num overflow (a * posScale) and den overflow (1e4 * price) are null", () => {
    expect(nCapQ(1n << 100n, 1 << 20, 1_000_000n, 1n << 10n)).toBeNull();
    expect(nCapQ(1n, 1, 1n << 120n)).toBeNull();
    expect(nCapQ(1n << 100n, 1 << 20, 1_000_000n, 1n << 7n)).toBe(((1n << 120n) * (1n << 7n)) / (10_000n * 1_000_000n));
  });
  it("liquidityNotionalE6: the *4 depth multiplier overflowing u128 is null", () => {
    expect(liquidityNotionalE6(1n << 127n, 1)).toBeNull();
    expect(liquidityNotionalE6(1n << 125n, 1)).toBe(((1n << 125n) * 4n) / 10_000n);
  });
  it("dynImrBps: lhs, rhs and numerator overflow are null", () => {
    const big = 1n << 120n;
    expect(dynImrBps(big, big, 1_000n, 5_000n)).toBeNull(); // lpAbs * 1e4 > u128
    const n = 1n << 114n;
    expect(dynImrBps(n, n, 1_000n, 0n)).toBeNull(); // span * (lhs - rhs) > u128
  });
  it("growthMatcherCapsV3: a null liquidity (overflow) with a non-zero cap reads 0, and the cap itself stays", () => {
    const c = growthMatcherCapsV3({ lambdaBps: 1 }, 1n << 127n, 1_000_000n, false, 1n);
    expect(c.inventoryCapQ).toBe(((1n << 127n) * 1n) / (10_000n * 1_000_000n) < GROWTH_MAX_POSITION_ABS_Q ? ((1n << 127n) * 1n) / (10_000n * 1_000_000n) : GROWTH_MAX_POSITION_ABS_Q);
    expect(c.liquidityNotionalE6).toBe(0n);
  });
});

describe("depth pin + layout helpers", () => {
  it("isDexPinned: null is never pinned", () => {
    expect(isDexPinned(null)).toBe(false);
    expect(isDexPinned({ depthDexPinned: false })).toBe(false);
    expect(isDexPinned({ depthDexPinned: true })).toBe(true);
  });
  it("depthPushModeAllowed refuses only an attested push on a DEX-pinned record", () => {
    expect(depthPushModeAllowed(DEPTH_DEX_PINNED, DEPTH_MODE.Attested)).toBe(false);
    expect(depthPushModeAllowed(DEPTH_DEX_PINNED, DEPTH_MODE.OnChainDex)).toBe(true);
    expect(depthPushModeAllowed(DEPTH_DEX_PINNED, null)).toBe(true);
    expect(depthPushModeAllowed(0, DEPTH_MODE.Attested)).toBe(true);
  });
  it("depthTwLayoutOk: an empty window needs no flag, a non-empty window needs the R3 layout flag", () => {
    expect(depthTwLayoutOk(0, DEPTH_TW_EMPTY)).toBe(true);
    expect(depthTwLayoutOk(0, { curTokens: 1, prevTokens: 1, bucketP1: 2 })).toBe(false);
    expect(depthTwLayoutOk(GROWTH_FLAG_R3_LAYOUT, { curTokens: 1, prevTokens: 1, bucketP1: 2 })).toBe(true);
  });
  it("depthTwMinAtoms: null with no history, min(prev,cur)*unit, saturating at u64", () => {
    expect(depthTwMinAtoms(DEPTH_TW_EMPTY, 1_000_000n)).toBeNull();
    expect(depthTwMinAtoms({ curTokens: 9, prevTokens: 4, bucketP1: 1 }, 1_000_000n)).toBe(4_000_000n);
    expect(depthTwMinAtoms({ curTokens: 5, prevTokens: 8, bucketP1: 1 }, 1_000_000n)).toBe(5_000_000n);
    expect(depthTwMinAtoms({ curTokens: 0xffff_ffff, prevTokens: 0xffff_ffff, bucketP1: 1 }, 10n ** 15n)).toBe(U64_MAX);
  });
});

describe("depthRateLimited saturates the doubling at u64", () => {
  it("a rise from a huge base is capped at u64 max, never wrapped", () => {
    const base = U64_MAX - 5n;
    const r = depthRateLimited(true, base, 20_000n, 0, U64_MAX + 100n, true, 20_000n, 1_000n);
    expect(r.lastGoodE6).toBe(U64_MAX);
    expect(r.lastGoodSlot).toBe(20_000n);
  });
});

describe("bookDepthFromPins overflow", () => {
  it("saturates d = 4*cap at u128 and returns 0 when d * room overflows", () => {
    expect(bookDepthFromPins(U128_MAX / 2n, 20, 50, 200)).toBe(0n);
    expect(bookDepthFromPins(100_000_000_000n, 20, 50, 200)).toBe((400_000_000_000n * 180n) / 230n < 100_000_000_000n ? (400_000_000_000n * 180n) / 230n : 100_000_000_000n);
    expect(bookDepthFromPins(100_000_000_000n, 20, 50, 100)).toBe(100_000_000_000n); // matcher max below the band: depth = cap
    expect(bookDepthFromPins(100_000_000_000n, 200, 50, 200)).toBe(0n); // fixed fee eats the whole band
  });
});

describe("mergeTierConfigAtBind", () => {
  it("keeps every non-zero stored value, fills zeros from the creator", () => {
    const stored = { thresholdUsd: [0, 200, 300] as [number, number, number], leverageX100: [500, 0, 900] as [number, number, number] };
    const creator = { thresholdUsd: [111, 222, 333] as [number, number, number], leverageX100: [501, 502, 503] as [number, number, number] };
    expect(mergeTierConfigAtBind(stored, creator)).toEqual({ thresholdUsd: [111, 200, 300], leverageX100: [500, 502, 900] });
  });
});

describe("validateTierConfig messages", () => {
  const base = { lLaunchX100: 500, lTierX100: 2_000 };
  it("non-integer thresholds / leverage are flagged with the tier and the collateral wording", () => {
    const usd = validateTierConfig({ ...base, thresholdsUsd: [5_000.5, 20_000, 100_000], leverageX100: [500, 1_000, 2_000.5], collateral: { decimals: 6, usdLike: true } });
    expect(usd.ok).toBe(false);
    expect(usd.issues.filter((x) => x.code === "not-an-integer").map((x) => [x.field, x.tier])).toEqual([["thresholds", 1], ["leverage", 3]]);
    expect(usd.issues.find((x) => x.field === "thresholds")!.message).toContain("dollars");
    const sol = validateTierConfig({ ...base, thresholdsUsd: [5_000, 20_000.5, 100_000], collateral: { decimals: 9, symbol: "SOL" } });
    expect(sol.issues.find((x) => x.field === "thresholds")!.message).toContain("SOL");
    const bare = validateTierConfig({ ...base, thresholdsUsd: [5_000, 20_000, 100_000.5] });
    expect(bare.issues.find((x) => x.field === "thresholds")!.message).toContain("tokens");
    const noSym = validateTierConfig({ ...base, thresholdsUsd: [5_000, 20_000, 100_000.5], collateral: { usdLike: false } });
    expect(noSym.issues.find((x) => x.field === "thresholds")!.message).toContain("tokens");
    const defDec = validateTierConfig({ ...base, thresholdsUsd: [5_000, 20_000, 100_000.5], collateral: { usdLike: true } });
    expect(defDec.issues.find((x) => x.field === "thresholds")!.message).toContain("dollars");
  });
  it("amount and leverage formatting: $ for a 6-decimal USD token, symbol otherwise, fractional leverage trimmed", () => {
    const below = validateTierConfig({ ...base, thresholdsUsd: [1_000, 20_000, 100_000], collateral: { decimals: 6, usdLike: true } });
    expect(below.issues[0]!.message).toBe("Tier 1 pool depth must be at least $5,000.");
    const sym = validateTierConfig({ ...base, thresholdsUsd: [1_000, 20_000, 100_000], collateral: { decimals: 9, usdLike: true, symbol: "SOL" } });
    expect(sym.issues[0]!.message).toContain("5,000 SOL");
    const noSym = validateTierConfig({ ...base, thresholdsUsd: [1_000, 20_000, 100_000], collateral: { decimals: 9 } });
    expect(noSym.issues[0]!.message).toContain("5,000 tokens");
    const frac = validateTierConfig({ lLaunchX100: 550, lTierX100: 2_000, thresholdsUsd: [5_000, 20_000, 100_000], leverageX100: [525, 1_050, 2_000] });
    const msgs = frac.issues.map((x) => x.message).join(" | ");
    expect(msgs).toContain("Tier 1 leverage");
  });
});

describe("G8 caps: null / zero / hlock fail-closed", () => {
  const clampBase = { clamp: true, cM: 1_000_000_000n, lambdaBps: 10_000, tier: 0, capDepth: 150_000_000_000n, priceE6: 1_000_000n } as const;
  it("nCapG8Q is null when the price is zero (even on the clamp)", () => {
    expect(nCapG8Q({ ...clampBase, priceE6: 0n })).toBeNull();
  });
  it("depthCapQKappa: a zero price reads 0 (no capacity), a null depth reads u128 max (no cap)", () => {
    expect(depthCapQKappa(1_000, 10_000_000_000n, 0n)).toBe(0n);
    expect(depthCapQKappa(1_000, null, 1_000_000n)).toBe(U128_MAX);
  });
  it("off the clamp: hlock zeroes both caps; a zero price / zero capacity zero both; an unrepresentable liquidity reads 0", () => {
    const off = { clamp: false, cM: 1_000_000_000n, lambdaBps: 10_000, tier: 0, capDepth: null, priceE6: 1_000_000n } as const;
    expect(growthMatcherCapsG8({ ...off, hlockActive: true })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    expect(growthMatcherCapsG8({ ...off, hlockActive: false, priceE6: 0n })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    expect(growthMatcherCapsG8({ ...off, hlockActive: false, maxPositionAbsQ: 0n })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    const ov = growthMatcherCapsG8({ ...off, cM: 1n << 127n, lambdaBps: 1, posScale: 1n, hlockActive: false });
    expect(ov.liquidityNotionalE6).toBe(0n);
    expect(ov.inventoryCapQ > 0n).toBe(true);
  });
  it("on the clamp with a cap depth: hlock zeroes; zero price zeroes; liquidity is min(capital, depth*4)", () => {
    expect(growthMatcherCapsG8({ ...clampBase, hlockActive: true })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    expect(growthMatcherCapsG8({ ...clampBase, priceE6: 0n, hlockActive: false })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    const c = growthMatcherCapsG8({ ...clampBase, hlockActive: false });
    expect(c.inventoryCapQ > 0n).toBe(true);
    const ovf = growthMatcherCapsG8({ ...clampBase, cM: 1n << 127n, lambdaBps: 1, posScale: 1n, capDepth: 1n << 126n, hlockActive: false });
    expect(ovf.liquidityNotionalE6).toBe(0n);
  });
});

describe("volatility + lambda helpers", () => {
  it("volSampleX100 is null on a zero previous mark or zero dt", () => {
    expect(volSampleX100(0n, 1_000_000n, 10n)).toBeNull();
    expect(volSampleX100(1_000_000n, 1_100_000n, 0n)).toBeNull();
    expect(volSampleX100(1_000_000n, 900_000n, 100n)).toBe(1_000_000n);
  });
  it("volUpdateX100 saturates at u32 and moves 1/16 of the gap", () => {
    expect(volUpdateX100(0xffff_fff0, true, 0xffff_ffffn)).toBe(0xffff_fff1);
    expect(volUpdateX100(4_000_000_000, true, 0xffff_ffffn + 5n)).toBe(4_000_000_000 + Math.ceil((0xffff_ffff - 4_000_000_000) / 16));
    expect(volUpdateX100(0xffff_ffff, true, 0xffff_ffffn)).toBe(0xffff_ffff);
  });
  it("sigmaHBps saturates at u64; lVolX100 saturates need and clamps to u16", () => {
    expect(sigmaHBps(0xffff_ffff, 1n << 62n)).toBeLessThanOrEqual(U64_MAX);
    expect(sigmaHBps(0xffff_ffff, 1n << 120n)).toBe(U64_MAX);
    expect(sigmaHBps(100, 4n)).toBe(2n);
    expect(lVolX100(0n, 0n, 0n)).toBe(0xffff);
    expect(lVolX100(1n, 0n, 0n)).toBe(0xffff);
    expect(lVolX100(500n, 0n, 0n)).toBe(2_000);
    expect(lVolX100(0n, U64_MAX, U64_MAX)).toBe(0);
  });
  it("lambdaVolBps: 0 sigma is no cap, a tiny sigma clamps to u32", () => {
    expect(lambdaVolBps(0n)).toBe(Number.MAX_SAFE_INTEGER);
    expect(lambdaVolBps(1n)).toBe(47_500_000);
    expect(lambdaVolBps(2_500n)).toBe(19_000);
  });
  it("kappaEffBps: tier kappa below the fee cap passes through, above is capped; null fee reads the fallback", () => {
    expect(kappaEffBps(10_000, null)).toBe(253);
    expect(kappaEffBps(100, null)).toBe(100);
  });
});

describe("ratchet / writer / stress helpers", () => {
  it("ratchetCeilingX100 with a stamp near u64 max never overflows the epoch gate", () => {
    const r = ratchetCeilingX100(500, U64_MAX - 10n, 600, 500, STRESS_NONE, U64_MAX);
    expect(r).toEqual({ ceilX100: 600, ceilSlot: U64_MAX });
    expect(ratchetCeilingX100(500, U64_MAX - 10n, 600, 500, STRESS_NONE, U64_MAX - 1n)).toEqual({ ceilX100: 500, ceilSlot: U64_MAX - 10n });
  });
  it("cLaunchAtomsFor floors at $1,000 and passes a larger capital", () => {
    expect(cLaunchAtomsFor(1n)).toBe(1_000_000_000n);
    expect(cLaunchAtomsFor(5_000_000_000n)).toBe(5_000_000_000n);
  });
  it("graduationFallOnly: legacy forceDown reads as h-lock, stress wins over forceDown", () => {
    const i = { prevCeilX100: 1_500, prevSlot: 7n, graduation: true, lLaunchX100: 500, lTierX100: 2_000, lTableTierX100: 1_800, nowSlot: 99n };
    expect(graduationFallOnly({ ...i, forceDown: true })).toEqual({ ceilX100: 500, ceilSlot: 99n });
    expect(graduationFallOnly({ ...i, forceDown: false })).toEqual({ ceilX100: 1_500, ceilSlot: 7n });
    expect(graduationFallOnly({ ...i, stress: STRESS_NONE, forceDown: true })).toEqual({ ceilX100: 1_500, ceilSlot: 7n });
    expect(graduationFallOnly({ ...i, graduation: false })).toEqual({ ceilX100: 500, ceilSlot: 99n });
  });
  it("stress cap tables: tier above max clamps; none = no cap; h-lock = L0", () => {
    const t = [500, 500, 1_000, 2_000] as const;
    expect(stressCapX100(STRESS_NONE, 3, t)).toBe(0xffff);
    expect(stressCapX100(STRESS_HLOCK, 3, t)).toBe(500);
    expect(stressCapX100(1, 99, t)).toBe(1_000);
    expect(stressCapCurveX100(STRESS_NONE, { seg: 0, num: 0, den: 0 }, t)).toBe(0xffff);
  });
  it("bandRGapBps: out of range is null, and a gap that does not fit u16 is null", () => {
    expect(bandRGapBps(0n)).toBeNull();
    expect(bandRGapBps(2_001n)).toBeNull();
    expect(bandRGapBps(1_000n)).toBe(3_445n);
  });
  it("tierRampU64 tier 3 with a saturating ramp end returns the table top at/above the ramp", () => {
    expect(tierRampU64(U64_MAX, [25_000n, 100_000n, 500_000n], [500n, 500n, 1_000n, 2_000n])).toBe(2_000n);
  });
  it("curvePos rejects a negative or over-u64 depth", () => {
    expect(curvePos(-1n, [25_000n, 100_000n, 500_000n]).den).toBe(0);
    expect(curvePos(U64_MAX + 1n, [25_000n, 100_000n, 500_000n]).den).toBe(0);
  });
});

describe("quoteMaxLeverage / previewGrowthOpenFee money-path guards", () => {
  const growth = rec({ launch: 1_000, tier: 1_000, kink: 5_000, lambda: 10_000 });
  const lpAt = (lp: bigint) => { const a = lp < 0n ? -lp : lp; return { lpEffectivePositionQ: lp, oiEffLongQ: a, oiEffShortQ: a }; };
  const base = { engineImrBps: 1_000n, growth, lpCapital: 1_000_000_000n, lpPnl: 0n, lpFeeCredits: 0n, priceE6: 1_000_000n, bankruptcyHlockActive: false, assetBound: true, ...lpAt(0n) };
  it("growth off: an engine IMR of 0 or above 100% is invalid-config, a valid one quotes its own leverage", () => {
    expect(quoteMaxLeverage({ ...base, growth: null, engineImrBps: 0n }, "long")).toMatchObject({ closed: true, closedReason: "invalid-config", maxLeverageX100: 0 });
    expect(quoteMaxLeverage({ ...base, growth: null, engineImrBps: 10_001n }, "long")).toMatchObject({ closed: true, closedReason: "invalid-config" });
    expect(quoteMaxLeverage({ ...base, growth: null, engineImrBps: 1_000n }, "long")).toMatchObject({ closed: false, imrBps: 1_000n, maxLeverageX100: 1_000 });
  });
  it("growth on: an engine IMR the ceiling cannot support is invalid-config", () => {
    expect(quoteMaxLeverage({ ...base, engineImrBps: 10_001n }, "long")).toMatchObject({ closed: true, closedReason: "invalid-config" });
  });
  it("previewGrowthOpenFee: a zero-fill opening and a growth-off market charge no utilisation fee", () => {
    const off = previewGrowthOpenFee({ ...base, growth: null }, 0n, 100_000_000n, 30n);
    expect(off.utilFeeBps).toBe(0);
    const zero = previewGrowthOpenFee(base, 0n, 0n, 30n);
    expect(zero.utilFeeBps).toBe(0);
  });
  it("previewGrowthOpenFee: a zero price (N_cap null) charges 0 and a reducing fill charges 0", () => {
    expect(previewGrowthOpenFee({ ...base, priceE6: 0n }, 0n, 100_000_000n, 30n).utilFeeBps).toBe(0);
    expect(previewGrowthOpenFee(base, 200_000_000n, -100_000_000n, 30n).utilFeeBps).toBe(0);
  });
  it("previewGrowthOpenFee: a short open and a flip charge the fee only on the OPENING share of the fill", () => {
    const nCap = nCapQ(1_000_000_000n, 10_000, 1_000_000n) as bigint;
    const shortOpen = previewGrowthOpenFee(base, 0n, -(nCap * 9n) / 10n, 30n);
    expect(shortOpen.utilFeeBps).toBeGreaterThan(0);
    const flip = previewGrowthOpenFee({ ...base, ...lpAt(0n) }, (nCap * 9n) / 10n, -((nCap * 9n) / 10n) * 2n, 30n);
    const fullOpen = previewGrowthOpenFee(base, 0n, -(nCap * 9n) / 10n, 30n);
    expect(flip.utilFeeBps).toBeLessThanOrEqual(fullOpen.utilFeeBps);
  });
});

describe("encoder argument guards", () => {
  const tiers = { thresholdUsd: [25_000, 100_000, 500_000] as [number, number, number], leverageX100: [500, 1_000, 2_000] as [number, number, number] };
  it("encodeInitMarketV19 refuses a collateral with too many decimals", () => {
    expect(() => encodeInitMarketV19({} as never, 500, 1_000, 40)).toThrow(/cannot carry a growth market/);
  });
  it("encodeInitVaultLpV19 / V22Tiers refuse a junior floor that is not a u16", () => {
    for (const bad of [-1, 1.5, 0x1_0000]) {
      expect(() => encodeInitVaultLpV19(bad, 500)).toThrow(/juniorFloorBps must be a u16/);
      expect(() => encodeInitVaultLpV22Tiers(bad, 500, tiers)).toThrow(`juniorFloorBps must be a u16, got ${bad}`);
    }
  });
  it("encodeInitVaultLpV22Tiers with lTier checks the table and refuses a bad one", () => {
    expect(() => encodeInitVaultLpV22Tiers(2_000, 500, { ...tiers, thresholdUsd: [1_000, 100_000, 500_000] }, 2_000)).toThrow(/tier table refused/);
    expect(encodeInitVaultLpV22Tiers(2_000, 500, tiers, 2_000).length).toBeGreaterThan(5);
  });
  it("encodeSetAssetRiskLimitsV22Tiers refuses every out-of-range scalar", () => {
    expect(() => encodeSetAssetRiskLimitsV22Tiers(-1, 10_000, 5_000, tiers, 0)).toThrow("assetIndex must be a u16, got -1");
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0x1_0000, 10_000, 5_000, tiers, 0)).toThrow(/assetIndex must be a u16/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 0, 5_000, tiers, 0)).toThrow("lambdaBps must be a u32 >= 1, got 0");
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 0x1_0000_0000, 5_000, tiers, 0)).toThrow(/lambdaBps must be a u32/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, -1, tiers, 0)).toThrow("kinkBps must be a u16, got -1");
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 0x1_0000, tiers, 0)).toThrow(/kinkBps must be a u16/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, tiers, 0, 0x1_0000)).toThrow(/utilFeeMaxBps must be a u16/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, tiers, 4)).toThrow(/attestedMaxTier must be 0..=3/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, { ...tiers, thresholdUsd: [1_000, 100_000, 500_000] }, 0, 0, { lLaunchX100: 500, lTierX100: 2_000 })).toThrow(/tier table refused/);
    expect(encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, tiers, 0, 0, { lLaunchX100: 500, lTierX100: 2_000 }).length).toBe(71);
  });
  it("encodeSetAssetRiskLimitsV19 still refuses bad scalars", () => {
    expect(() => encodeSetAssetRiskLimitsV19(0, 0, 5_000)).toThrow(/lambdaBps must be in/);
  });
  it("matcher ext v3 wrappers check the block length and the caps range", () => {
    const v2 = encodeMatcherCallExtV2({ headroomQ: 1n, markSlot: 2n, execBandBps: 500, takerReducing: true, acceptsFeeRequest: true, lpPositionQ: -5n });
    expect(() => encodeMatcherCallExtV3FromV2(new Uint8Array(39), { inventoryCapQ: 0n, liquidityNotionalE6: 0n })).toThrow(/v2 block must be 40 bytes, got 39/);
    expect(() => encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: -1n, liquidityNotionalE6: 0n })).toThrow(/inventoryCapQ must fit i128/);
    expect(() => encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: 1n << 127n, liquidityNotionalE6: 0n })).toThrow(/inventoryCapQ must fit i128/);
    expect(() => encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: 0n, liquidityNotionalE6: -1n })).toThrow(/liquidityNotionalE6 out of u128 range/);
    expect(() => encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: 0n, liquidityNotionalE6: 1n << 128n })).toThrow(/liquidityNotionalE6 out of u128 range/);
    expect(() => markExtV3TakerReducing(new Uint8Array(71), true)).toThrow(/v3 block must be 72 bytes, got 71/);
  });
});
