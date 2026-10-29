/**
 * v2.2 growth round 2 (R2.1): sticky depth, per-market tiers, venue / book tiers, the tier-driven target, N_cap, the extended quote and
 * next-unlock, the tier builders and the client-side validator. Vectors are hand-computed AND lifted from the Rust unit tests in
 * percolator-prog `feat/v22-growth-tiers` `src/growth_v19.rs` (`g8_effective_depth_and_tiers`, `r2_tier_table_and_bounds`,
 * `g8_wl2_same_slot_push_is_not_a_second_sample`, `r2_sticky_depth_cap_w_m1`, `g8_n_cap_depth_cap_only_when_fresh_and_identity_off_clamp`,
 * `g8_target_ceiling_ratchet_and_force_down`), with the Rust `DEPTH_TIER1_E6 = 25_000_000_000` etc.
 */
import { describe, it, expect } from "vitest";
import {
  ASSET_GROWTH_LEN, ASSET_GROWTH_FIELD_OFF, ASSET_GROWTH_DEPTH_FIELD_OFF, decodeAssetGrowthRecordV19,
  depthPushUpdate, depthRateLimited, usableDepthE6, rentSnapshotNCapQ, collateralDecimalsOf, wholeTokenAtoms, DEPTH_BOOTSTRAP_DIV, depthRiseStamp, depthRiseWindowOpen, growthCollateralDecimalsOk,
  DEPTH_EVER, DEPTH_PREV_REAL, freshDepthE6, DEPTH_SOURCE, depthSourceOf, depthEver, depthSourceByteOk, effectiveDepthE6, stickyDepthE6, capDepthE6,
  tierThresholdsE6, depthTierFor, attestedMaxTierEff, venueTier, bookDepthFromPins, bookCapacityE6, bookDepthE6, bookTier, combinedTier,
  tierLeverage, lTableX100, tierConfigOk, attestedMaxTierOk, mergeTierConfigAtBind, validateTierConfig,
  lambdaDepthBps, kappaDepthBps, lambdaEffBps, depthNotionalCapE6, depthCapQ, nCapG8Q, growthMatcherCapsG8, nCapQ, growthMatcherCapsV3,
  targetCeilingX100, ceilingInForceX100, ratchetCeilingX100, graduationRatchet, graduationFallOnly, graduationOn, clampEnforced,
  growthCeilingView, quoteMaxLeverage, encodeInitVaultLpV22Tiers, encodeSetAssetRiskLimitsV22Tiers, encodeInitVaultLpV19,
  decodeError, STRESS_NONE, STRESS_DRAW, STRESS_ADL, STRESS_HLOCK, DEPTH_TW_BUCKET_SLOTS, depthTwBucketP1, depthTwMinAtoms,
} from "../src/index.js";
import type { AssetGrowthV19, QuoteMaxLeverageInput, DepthState } from "../src/index.js";

const T1 = 25_000_000_000n, T2 = 100_000_000_000n, T3 = 500_000_000_000n;
const M = 1_000_000n;
const PS = 1_000_000n;
const DEF = tierThresholdsE6([0, 0, 0]);
const U64MAX = (1n << 64n) - 1n;
const dpu = (st: DepthState, src: number, d: bigint, now: bigint, seed: bigint = U64MAX): DepthState => depthPushUpdate(st, src, d, now, seed, M);
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

describe("record decoder (bytes 44, 45, 80, 88, 96, 108)", () => {
  it("offsets are the Rust offset_of! values", () => {
    const D = ASSET_GROWTH_DEPTH_FIELD_OFF;
    expect([D.depthSource, D.attestedMaxTier, D.depthE6, D.depthSlot, D.depthPrevE6, D.depthLastGoodE6, D.depthLastGoodSlot, D.tierThresholdUsd, D.tierLeverageX100]).toEqual([44, 45, 56, 64, 72, 80, 88, 96, 108]);
  });
  it("decodes a hand-laid record byte for byte", () => {
    const b = new Uint8Array(ASSET_GROWTH_LEN);
    b[ASSET_GROWTH_FIELD_OFF.version] = 1;
    b[44] = 0x82; // DEPTH_EVER | source 2
    b[45] = 3;
    b.set([0, 152, 160, 107, 21, 0, 0, 0], 80); // 92_000_000_000
    b.set([0x39, 0x30, 0, 0, 0, 0, 0, 0], 88); // 12345
    b.set([0x88, 0x13, 0, 0], 96); // 5000
    b.set([0x20, 0x4e, 0, 0], 100); // 20000
    b.set([0xa0, 0x86, 0x01, 0], 104); // 100000
    b.set([0xf4, 0x01], 108); // 500
    b.set([0xe8, 0x03], 110); // 1000
    b.set([0xd0, 0x07], 112); // 2000
    const g = decodeAssetGrowthRecordV19(b)!;
    expect([g.depthSource, g.depthEver, g.attestedMaxTier]).toEqual([2, true, 3]);
    expect([g.depthLastGoodE6, g.depthLastGoodSlot]).toEqual([92_000_000_000n, 12345n]);
    expect(g.tierThresholdUsd).toEqual([5000, 20000, 100000]);
    expect(g.tierLeverageX100).toEqual([500, 1000, 2000]);
  });
  it("source bits are masked: bits 2 and 7 do not leak into depthSource", () => {
    const b = new Uint8Array(ASSET_GROWTH_LEN);
    b[38] = 1; b[44] = 0x85;
    const g = decodeAssetGrowthRecordV19(b)!;
    expect([g.depthSource, g.depthEver, g.depthPrevReal]).toEqual([1, true, true]);
    expect(depthSourceOf(0x81)).toBe(1);
    expect(depthEver(0x81) && !depthEver(0x01)).toBe(true);
    expect([depthSourceByteOk(0x82), depthSourceByteOk(0x03), depthSourceByteOk(0x04), depthSourceByteOk(0x85), depthSourceByteOk(0x40), depthSourceByteOk(0x08)]).toEqual([true, false, true, true, true, false]); // 0x40 = DEPTH_DEX_PINNED (F-3, wrapper 4db44b69): accepted since #564
  });
});

describe("Rust g8_effective_depth_and_tiers", () => {
  it("effective depth", () => {
    expect(effectiveDepthE6(5n * T1, 2n * T1, 100n, 100n)).toBe(2n * T1);
    expect(effectiveDepthE6(5n * T1, 0n, 100n, 100n)).toBe(0n);
    expect(effectiveDepthE6(0n, 5n * T1, 100n, 100n)).toBe(0n);
    expect(effectiveDepthE6(T1, T1, 100n, 250n)).toBe(T1);
    expect(effectiveDepthE6(T1, T1, 100n, 251n)).toBe(0n);
    expect(effectiveDepthE6(T1, T1, 101n, 100n)).toBe(0n);
  });
  it("thresholds, venue tier", () => {
    expect(DEF).toEqual([T1, T2, T3]);
    const a = DEPTH_SOURCE.Attested;
    expect(venueTier(T1 - 1n, a, DEF, 0)).toBe(0);
    expect(venueTier(T1, a, DEF, 0)).toBe(1);
    expect(venueTier(T3, a, DEF, 0)).toBe(1); // I-D3
    expect(venueTier(T3, a, DEF, 3)).toBe(3);
    expect(venueTier(T3, a | DEPTH_EVER, DEF, 2)).toBe(2);
    expect(venueTier(T3, DEPTH_SOURCE.OnChainPool, DEF, 0)).toBe(3);
    expect(venueTier(T3, DEPTH_SOURCE.None | DEPTH_EVER, DEF, 3)).toBe(0);
    expect(venueTier(0n, DEPTH_SOURCE.OnChainPool, DEF, 3)).toBe(0);
    const th2 = tierThresholdsE6([5_000, 20_000, 100_000]);
    expect(depthTierFor(5_000_000_000n, th2)).toBe(1);
    expect(depthTierFor(100_000_000_000n, th2)).toBe(3);
    expect(depthTierFor(0n, th2)).toBe(0);
  });
  it("lambda / kappa constants, lambda_eff", () => {
    expect([0, 1, 2, 3].map(lambdaDepthBps)).toEqual([10_000, 10_000, 20_000, 30_000]);
    expect([0, 1, 2, 3].map(kappaDepthBps)).toEqual([5_000, 10_000, 10_000, 20_000]);
    expect(lambdaEffBps(30_000, 1)).toBe(10_000);
    expect(lambdaEffBps(5_000, 3)).toBe(5_000);
  });
  it("book depth and tier", () => {
    expect(bookDepthE6(100_000_000_000n, 30_000)).toBe(100_000_000_000n);
    expect(bookDepthE6(100_000_000_000n, 5_000)).toBe(50_000_000_000n);
    expect(bookTier(100_000_000_000n, 10_000, DEF)).toBe(2);
    expect(bookTier(99_999_999_999n, 10_000, DEF)).toBe(1);
    expect(bookDepthFromPins(1_000n, 20, 50, 100)).toBe(1_000n);
    expect(bookDepthFromPins(1_000n, 20, 50, 300)).toBe(1_000n);
    expect(bookDepthFromPins(1_000n, 20, 2_000, 300)).toBe(330n); // floor(4000*180/2180)
    expect(bookDepthFromPins(1_000n, 200, 50, 300)).toBe(0n);
    expect(combinedTier(3, 1)).toBe(1);
    expect(combinedTier(0, 3)).toBe(0);
  });
  it("book capacity is overflow-free and monotone; saturates at u64::MAX", () => {
    expect(bookCapacityE6(10_001n, 10_000)).toBe(10_001n);
    expect(bookCapacityE6(10_001n, 5_000)).toBe(5_000n); // floor(10001*0.5)
    expect(bookCapacityE6(0n, 10_000)).toBe(0n);
    expect(bookDepthE6((1n << 120n), 10_000)).toBe((1n << 64n) - 1n);
  });
  it("attested_max_tier_eff", () => {
    expect([attestedMaxTierEff(0), attestedMaxTierEff(2), attestedMaxTierEff(9)]).toEqual([1, 2, 3]);
  });
});

describe("Rust r2_tier_table_and_bounds", () => {
  it("table", () => {
    expect(tierLeverage([0, 0, 0], 500, 2_000)).toEqual([500, 500, 1_000, 2_000]);
    expect(tierLeverage([0, 0, 0], 500, 500)).toEqual([500, 500, 500, 500]);
    expect(tierLeverage([0, 0, 0], 700, 1_000)).toEqual([700, 700, 1_000, 1_000]);
    expect(tierLeverage([600, 900, 1_500], 500, 2_000)).toEqual([500, 600, 900, 1_500]);
    expect(tierLeverage([3_000, 100, 0], 500, 2_000)).toEqual([500, 2_000, 2_000, 2_000]);
    expect(lTableX100(9, [1, 2, 3, 4])).toBe(4);
  });
  it("bounds", () => {
    expect(tierConfigOk([0, 0, 0], [0, 0, 0], 500, 500)).toBe(true);
    expect(tierConfigOk([5_000, 20_000, 100_000], [500, 1_000, 2_000], 500, 2_000)).toBe(true);
    expect(tierConfigOk([4_999, 20_000, 100_000], [0, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([5_000, 19_999, 100_000], [0, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([5_000, 20_000, 99_999], [0, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([30_000, 30_000, 500_000], [0, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([0, 600_000, 0], [0, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([0, 0, 0], [400, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([0, 0, 0], [1_000, 900, 2_000], 500, 2_000)).toBe(false);
    expect(tierConfigOk([0, 0, 0], [0, 0, 2_001], 500, 2_000)).toBe(false);
    expect(tierConfigOk([0, 0, 0], [600, 0, 0], 700, 2_000)).toBe(false);
    expect(tierConfigOk([0, 0, 0], [700, 0, 0], 700, 2_000)).toBe(true);
    expect(attestedMaxTierOk(3) && !attestedMaxTierOk(4)).toBe(true);
  });
  it("tag 94 merge: a preset field is kept, a zero field takes the creator's", () => {
    const m = mergeTierConfigAtBind({ thresholdUsd: [30_000, 0, 0], leverageX100: [0, 900, 0] }, { thresholdUsd: [10_000, 150_000, 0], leverageX100: [600, 700, 2_000] });
    expect(m).toEqual({ thresholdUsd: [30_000, 150_000, 0], leverageX100: [600, 900, 2_000] });
  });
});

describe("validateTierConfig (client-side, calm messages)", () => {
  it("ok === tierConfigOk on a deterministic grid (the exact Rust verdict)", () => {
    const ths: [number, number, number][] = [[0, 0, 0], [5_000, 20_000, 100_000], [4_999, 20_000, 100_000], [30_000, 30_000, 500_000], [0, 600_000, 0], [25_000, 0, 0], [0, 0, 99_999], [100_000, 200_000, 300_000], [5_000, 4_000, 100_000]];
    const lvs: [number, number, number][] = [[0, 0, 0], [500, 1_000, 2_000], [400, 0, 0], [1_000, 900, 2_000], [0, 0, 2_001], [700, 0, 0], [600, 0, 0], [500, 500, 500], [2_000, 2_000, 2_000], [0, 1_000, 0]];
    for (const th of ths) for (const lv of lvs) for (const [launch, tier] of [[500, 2_000], [700, 1_000], [500, 500], [300, 400]] as const) {
      const r = validateTierConfig({ thresholdsUsd: th, leverageX100: lv, lLaunchX100: launch, lTierX100: tier });
      expect(r.ok, `${th} ${lv} ${launch} ${tier}`).toBe(tierConfigOk(th, lv, launch, tier));
      expect(r.ok).toBe(r.issues.length === 0);
    }
  });
  it("names the problem in one calm line, no bps", () => {
    expect(validateTierConfig({ thresholdsUsd: [1_000, 20_000, 100_000], lLaunchX100: 500, lTierX100: 2_000 }).issues).toEqual([
      { field: "thresholds", code: "below-floor", tier: 1, message: "Tier 1 pool depth must be at least 5,000 tokens." },
    ]);
    const r = validateTierConfig({ thresholdsUsd: [30_000, 30_000, 500_000], leverageX100: [400, 900, 2_500], lLaunchX100: 500, lTierX100: 2_000 });
    expect(r.issues.map((i) => i.message)).toEqual([
      "Tier 2 pool depth must be higher than tier 1.",
      "Tier 1 leverage cannot be below the launch leverage of 5x.",
      "Tier 3 leverage cannot exceed this market's maximum of 20x.",
    ]);
    expect(validateTierConfig({ leverageX100: [1_000, 900, 2_000], lLaunchX100: 500, lTierX100: 2_000 }).issues[0]?.message).toBe("Tier 2 leverage cannot be below tier 1's 10x.");
    expect(validateTierConfig({ leverageX100: [550, 0, 0], lLaunchX100: 550, lTierX100: 2_000 }).ok).toBe(true);
    expect(validateTierConfig({ leverageX100: [525, 0, 0], lLaunchX100: 600, lTierX100: 2_000 }).issues[0]?.message).toBe("Tier 1 leverage cannot be below the launch leverage of 6x.");
    expect(validateTierConfig({ lLaunchX100: 500, lTierX100: 2_000, attestedMaxTier: 4 }).issues[0]?.code).toBe("out-of-range");
    expect(validateTierConfig({ lLaunchX100: 500, lTierX100: 2_000, attestedMaxTier: 3 }).ok).toBe(true);
    expect(validateTierConfig({ thresholdsUsd: [5_000.5, 0, 0], lLaunchX100: 500, lTierX100: 2_000 }).ok).toBe(false);
    expect(validateTierConfig({ leverageX100: [0, 0, 0], lLaunchX100: 0.5, lTierX100: 2_000 }).ok).toBe(false);
  });
});

const st = (d: bigint, p: bigint, s: bigint): DepthState => ({ depthE6: d, depthPrevE6: p, depthSlot: s, depthSource: d === 0n ? 0 : 1, lastGoodE6: 0n, lastGoodSlot: 0n, riseSlot64: 0 });
const tri = (x: DepthState): [bigint, bigint, bigint] => [x.depthE6, x.depthPrevE6, x.depthSlot];

describe("depthPushUpdate (Rust W-L2 + R2.1 sticky vectors)", () => {
  const a = DEPTH_SOURCE.Attested;
  it("same-slot push is not a second sample", () => {
    expect(tri(dpu(st(T1, 0n, 10n), a, 2n * T1, 11n))).toEqual([2n * T1, T1, 11n]);
    expect(tri(dpu(st(0n, 0n, 0n), a, T1, 5n))).toEqual([T1, 0n, 5n]);
    expect(tri(dpu(st(T1, 0n, 10n), a, 2n * T1, 10n))).toEqual([T1, 0n, 10n]);
    expect(tri(dpu(st(2n * T1, 7n, 10n), a, T1, 10n))).toEqual([T1, 7n, 10n]);
    expect(tri(dpu(st(2n * T1, 7n, 10n), 0, 0n, 10n))).toEqual([0n, 7n, 10n]);
    expect(depthSourceOf(dpu(st(T1, 7n, 10n), DEPTH_SOURCE.OnChainPool, 2n * T1, 10n).depthSource)).toBe(a);
    expect(depthSourceOf(dpu(st(2n * T1, 7n, 10n), DEPTH_SOURCE.OnChainPool, T1, 10n).depthSource)).toBe(DEPTH_SOURCE.OnChainPool);
    let s = dpu(st(0n, 0n, 0n), a, 5n * T1, 20n);
    s = dpu(s, a, 5n * T1, 20n);
    expect(effectiveDepthE6(s.depthE6, s.depthPrevE6, s.depthSlot, 20n)).toBe(0n);
    expect(depthEver(s.depthSource)).toBe(false);
    s = dpu(s, a, 5n * T1, 21n);
    expect(effectiveDepthE6(s.depthE6, s.depthPrevE6, s.depthSlot, 21n)).toBe(5n * T1);
    expect(tri(dpu(st(T1, 3n, 10n), a, 2n * T1, 9n))).toEqual([T1, 3n, 10n]);
    expect(tri(dpu(st(T1, 3n, 10n), 3, 2n * T1, 11n))).toEqual([0n, T1, 11n]);
  });
  it("W-M1 sticky bookkeeping", () => {
    let s = dpu({ depthE6: 0n, depthSlot: 0n, depthPrevE6: 0n, depthSource: 0, lastGoodE6: 0n, lastGoodSlot: 0n, riseSlot64: 0 }, a, 4n * T1, 100n);
    s = dpu(s, a, 2n * T1, 101n);
    expect(depthEver(s.depthSource)).toBe(true);
    expect([s.lastGoodE6, s.lastGoodSlot]).toEqual([2n * T1, 101n]);
    const z = dpu(s, DEPTH_SOURCE.None, 0n, 102n);
    expect(z.depthE6).toBe(0n);
    expect(z.depthSource).toBe(DEPTH_EVER | DEPTH_PREV_REAL); // absent current, real previous
    expect([z.lastGoodE6, z.lastGoodSlot]).toEqual([2n * T1, 101n]);
    const f = dpu(z, a, 9n * T1, 103n);
    expect(effectiveDepthE6(f.depthE6, f.depthPrevE6, f.depthSlot, 103n)).toBe(0n);
    expect(f.lastGoodE6).toBe(2n * T1);
    const g = dpu(f, a, T1, 104n);
    expect([g.lastGoodE6, g.lastGoodSlot]).toEqual([T1, 104n]);
  });
  it("capDepthE6 / stickyDepthE6", () => {
    expect(capDepthE6(a, 7n, 0n, 0n, 0n)).toBe(7n);
    expect(capDepthE6(a | DEPTH_EVER, 0n, 1_000n, 0n, 0n)).toBe(0n); // a fresh real 0 caps at 0
    expect(capDepthE6(DEPTH_EVER, null, 1_000n, 100n, 100n + 8_999n)).toBe(1_000n);
    expect(capDepthE6(DEPTH_EVER, null, 1_000n, 100n, 100n + 9_000n)).toBe(500n);
    expect(capDepthE6(DEPTH_EVER, null, 1_000n, 100n, 100n + 18_000n)).toBe(250n);
    expect(capDepthE6(DEPTH_EVER, null, (1n << 64n) - 1n, 0n, 64n * 9_000n)).toBe(0n);
    expect(capDepthE6(DEPTH_EVER, null, 1_000n, 500n, 100n)).toBe(1_000n);
    expect(capDepthE6(0, null, 1_000n, 100n, 200n)).toBeNull();
    expect(stickyDepthE6(150_000_000_000n, 0n, 18_000n)).toBe(37_500_000_000n);
    expect(stickyDepthE6(150_000_000_000n, 0n, 63n * 9_000n)).toBe(150_000_000_000n >> 63n);
  });
});

describe("a real zero reading closes opens at once (Rust r2_fresh_real_zero_reading_closes_at_once)", () => {
  const a = DEPTH_SOURCE.Attested;
  const fresh = (x: DepthState, now: bigint): bigint | null => freshDepthE6(x.depthE6, x.depthPrevE6, x.depthSlot, x.depthSource, now);
  const empty: DepthState = { depthE6: 0n, depthSlot: 0n, depthPrevE6: 0n, depthSource: 0, lastGoodE6: 0n, lastGoodSlot: 0n, riseSlot64: 0 };
  it("attested 0 and DEX 0 are Some(0) at once; positive after a real 0 stays 0 until its own min-of-two", () => {
    let s = dpu(empty, a, 4n * T1, 100n);
    s = dpu(s, a, 4n * T1, 101n);
    expect(fresh(s, 101n)).toBe(4n * T1);
    const z = dpu(s, a, 0n, 102n);
    const tw = (x: DepthState): bigint | null => depthTwMinAtoms(x.tw!, M);
    const usable = (x: DepthState, now: bigint): bigint | null => usableDepthE6(fresh(x, now), x.lastGoodE6, tw(x));
    expect(fresh(z, 102n)).toBe(0n);
    expect(usable(z, 102n)).toBe(0n);
    // controller round D2: last_good is HELD through a real zero (round 2 zeroed it); the window keeps every reader at 0
    expect([z.lastGoodE6, z.lastGoodSlot]).toEqual([4n * T1, 101n]);
    expect(capDepthE6(z.depthSource, usable(z, 102n), z.lastGoodE6, z.lastGoodSlot, 102n, tw(z))).toBe(0n);
    expect(venueTier(0n, z.depthSource, tierThresholdsE6([0, 0, 0]), 3)).toBe(0);
    const d = dpu(empty, DEPTH_SOURCE.OnChainPool, 0n, 7n);
    expect([fresh(d, 7n), depthEver(d.depthSource)]).toEqual([0n, true]);
    const p1 = dpu(z, a, 4n * T1, 103n);
    expect(fresh(p1, 103n)).toBe(0n);
    const p2 = dpu(p1, a, 4n * T1, 104n);
    expect(fresh(p2, 104n)).toBe(4n * T1); // the fresh min-of-two is restored ...
    expect(usable(p2, 104n)).toBe(0n); // ... but the zero is still inside the window
  });
  it("absent (35 B / mode 0) is NOT zero: sticky last good", () => {
    let s = dpu(empty, a, 4n * T1, 100n);
    s = dpu(s, a, 4n * T1, 101n);
    const ab = dpu(s, DEPTH_SOURCE.None, 0n, 102n);
    expect(fresh(ab, 102n)).toBeNull();
    expect(ab.lastGoodE6).toBe(4n * T1);
    const ab2 = dpu(ab, a, 4n * T1, 103n);
    expect(fresh(ab2, 103n)).toBeNull(); // first real sample after an absent one
  });
  it("same slot: a real 0 beats an absent 0; an absent push cannot undo a real 0; a stale real 0 is absent", () => {
    let s = dpu(empty, a, 4n * T1, 100n);
    s = dpu(s, a, 4n * T1, 101n);
    const z = dpu(s, a, 0n, 102n);
    const ab = dpu(s, DEPTH_SOURCE.None, 0n, 102n);
    expect(fresh(dpu(ab, a, 0n, 102n), 102n)).toBe(0n);
    expect(fresh(dpu(z, DEPTH_SOURCE.None, 0n, 102n), 102n)).toBe(0n);
    expect(fresh(z, 102n + 151n)).toBeNull();
    // stale real 0 -> absent; the sticky cap is still 0 (the window holds the zero)
    expect(capDepthE6(z.depthSource, null, z.lastGoodE6, z.lastGoodSlot, 302n, depthTwMinAtoms(z.tw!, M))).toBe(0n);
    expect(depthSourceByteOk(DEPTH_EVER | DEPTH_PREV_REAL | DEPTH_SOURCE.OnChainPool)).toBe(true);
    expect(depthSourceByteOk(0x08)).toBe(false);
  });
  it("freshDepthE6 table", () => {
    const rp = a | DEPTH_PREV_REAL;
    expect(freshDepthE6(5n, 3n, 100n, rp, 100n)).toBe(3n);
    expect(freshDepthE6(5n, 3n, 100n, a, 100n)).toBeNull();
    expect(freshDepthE6(0n, 3n, 100n, a, 100n)).toBe(0n);
    expect(freshDepthE6(5n, 0n, 100n, rp, 100n)).toBe(0n);
    expect(freshDepthE6(5n, 3n, 100n, rp, 250n)).toBe(3n);
    expect(freshDepthE6(5n, 3n, 100n, rp, 251n)).toBeNull();
    expect(freshDepthE6(5n, 3n, 101n, rp, 100n)).toBeNull();
    expect(freshDepthE6(5n, 3n, 100n, DEPTH_PREV_REAL, 100n)).toBeNull();
  });
});

describe("N_cap (Rust g8_n_cap_...)", () => {
  const cM = 1_000_000_000n;
  it("identity off the clamp: stored lambda, depth ignored", () => {
    for (const [lam, d] of [[10_000, null], [30_000, 1n], [10_000, T1], [10_000, 0n]] as const) {
      expect(nCapG8Q({ clamp: false, cM, lambdaBps: lam, tier: 1, capDepth: d, priceE6: M })).toBe(nCapQ(cM, lam, M));
      expect(growthMatcherCapsG8({ clamp: false, hlockActive: false, cM, lambdaBps: lam, tier: 1, capDepth: d, priceE6: M })).toEqual(growthMatcherCapsV3({ lambdaBps: lam }, cM, M, false));
    }
  });
  it("on the clamp", () => {
    expect(nCapG8Q({ clamp: true, cM, lambdaBps: 30_000, tier: 0, capDepth: null, priceE6: M })).toBe(nCapQ(cM, 10_000, M));
    expect(nCapG8Q({ clamp: true, cM, lambdaBps: 10_000, tier: 0, capDepth: 100_000_000n, priceE6: M })).toBe(50_000_000n);
    expect(depthCapQ(0, null, M)).toBe((1n << 128n) - 1n);
    expect(depthCapQ(1, 100_000_000n, 0n)).toBe(0n);
    expect(depthNotionalCapE6(3, 100n)).toBe(200n);
    expect(growthMatcherCapsG8({ clamp: true, hlockActive: false, cM, lambdaBps: 10_000, tier: 0, capDepth: 100_000_000n, priceE6: M })).toEqual({ inventoryCapQ: 50_000_000n, liquidityNotionalE6: 200_000_000n });
    expect(growthMatcherCapsG8({ clamp: true, hlockActive: true, cM, lambdaBps: 10_000, tier: 0, capDepth: 100_000_000n, priceE6: M })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
  });
  it("sticky: never uncapped, 0 closes opens", () => {
    const c = 1_000_000_000_000n;
    expect(nCapG8Q({ clamp: true, cM: c, lambdaBps: 10_000, tier: 0, capDepth: 100_000_000n, priceE6: M })).toBe(50_000_000n);
    expect(nCapG8Q({ clamp: true, cM: c, lambdaBps: 10_000, tier: 0, capDepth: 0n, priceE6: M })).toBe(0n);
    expect(growthMatcherCapsG8({ clamp: true, hlockActive: false, cM: c, lambdaBps: 10_000, tier: 0, capDepth: 0n, priceE6: M })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    // mutant (round 1: absent depth = no cap) would leave the whole capital cap
    expect(nCapG8Q({ clamp: true, cM: c, lambdaBps: 10_000, tier: 0, capDepth: null, priceE6: M })).toBe(c);
  });
  it("tier 2 and 3 use lambda_eff and kappa; explainer numbers", () => {
    // tier 2: backing $120k, depth $150k: min(120k * 2, 150k * 1) = $150k (lambda stored 2x)
    expect(nCapG8Q({ clamp: true, cM: 120_000n * M, lambdaBps: 20_000, tier: 2, capDepth: 150_000n * M, priceE6: M })).toBe(150_000n * M);
    // default lambda 1x: 120k binds
    expect(nCapG8Q({ clamp: true, cM: 120_000n * M, lambdaBps: 10_000, tier: 2, capDepth: 150_000n * M, priceE6: M })).toBe(120_000n * M);
    // tier 3: min(600k * 3, 700k * 2) = 1.4M
    expect(nCapG8Q({ clamp: true, cM: 600_000n * M, lambdaBps: 30_000, tier: 3, capDepth: 700_000n * M, priceE6: M })).toBe(1_400_000n * M);
    // tier 0 thin market: min(10k * 1, 8k * .5) = 4k
    expect(nCapG8Q({ clamp: true, cM: 10_000n * M, lambdaBps: 10_000, tier: 0, capDepth: 8_000n * M, priceE6: M })).toBe(4_000n * M);
  });
});

describe("target / ceiling / ratchet (Rust g8_target_ceiling_ratchet_and_force_down @ 666df893)", () => {
  const tab = tierLeverage([0, 0, 0], 500, 2_000);
  const n = 0xffff;
  it("target", () => {
    expect(targetCeilingX100(false, false, 300, 1_000, 500)).toBe(300);
    expect(targetCeilingX100(true, true, 300, 1_000, 500)).toBe(300);
    expect(targetCeilingX100(true, false, 500, 2_000, lTableX100(2, tab))).toBe(1_000);
    expect(targetCeilingX100(true, false, 500, 2_000, lTableX100(3, tab))).toBe(2_000);
    expect(targetCeilingX100(true, false, 300, 1_000, 2_000)).toBe(1_000);
    expect(targetCeilingX100(true, false, 800, 1_000, 500)).toBe(800);
    // controller round: graded stress at tier 3 (20x): draw -> L_table(2) 10x; ADL -> L_table(1) 5x; h-lock -> launch
    const l3 = lTableX100(3, tab);
    expect(targetCeilingX100(true, STRESS_HLOCK, 300, 1_000, 500, n)).toBe(300);
    expect(targetCeilingX100(true, STRESS_DRAW, 500, 2_000, l3, 1_000)).toBe(1_000);
    expect(targetCeilingX100(true, STRESS_ADL, 500, 2_000, l3, 500)).toBe(500);
  });
  it("ceiling in force", () => {
    expect(ceilingInForceX100(false, 900, 900, 300, 1_000)).toBe(300);
    expect(ceilingInForceX100(true, 900, 400, 300, 1_000)).toBe(400);
    expect(ceilingInForceX100(true, 400, 900, 300, 1_000)).toBe(400);
    // F-1 fix A: min(stored, target) -- down at once, up only via the ratchet
    expect(ceilingInForceX100(true, 900, 850, 300, 1_000)).toBe(850);
  });
  const gr = (prev: number, slot: bigint, grad: boolean, stress: number, sig: number, cap: number, now: bigint): [number, bigint] => {
    const r = graduationRatchet({ prevCeilX100: prev, prevSlot: slot, graduation: grad, stress, lLaunchX100: 500, lTierX100: 2_000, lTableTierX100: sig, stressCapX100: cap, nowSlot: now });
    return [r.ceilX100, r.ceilSlot];
  };
  it("ratchet writer (no c_launch snapshot; down at once; graded stress picks the target)", () => {
    // a climb waits a full epoch from the stamp (bind / I-1 reset stamp ceil_slot = now)
    expect(gr(500, 50_000n, true, STRESS_NONE, 1_000, n, 50_000n)).toEqual([500, 50_000n]);
    expect(gr(500, 0n, true, STRESS_NONE, 1_000, n, 8_999n)).toEqual([500, 0n]);
    expect(gr(500, 0n, true, STRESS_NONE, 1_000, n, 9_000n)).toEqual([600, 9_000n]);
    expect(gr(600, 9_000n, true, STRESS_NONE, 1_000, n, 18_000n)).toEqual([700, 18_000n]);
    expect(gr(1_000, 18_000n, true, STRESS_NONE, 1_000, n, 40_000n)).toEqual([1_000, 18_000n]); // at target: stamp kept
    expect(gr(1_000, 18_000n, false, STRESS_NONE, 500, n, 40_001n)).toEqual([500, 40_001n]); // depth gone: launch at once
    expect(gr(1_000, 18_000n, true, STRESS_HLOCK, 1_000, n, 40_001n)).toEqual([500, 40_001n]); // h-lock: launch at once
    expect(gr(2_000, 18_000n, true, STRESS_DRAW, 2_000, 1_000, 40_001n)).toEqual([1_000, 40_001n]); // draw: L_table(tier 3 - 1) at once
    expect(gr(2_000, 18_000n, true, STRESS_NONE, 1_000, n, 40_001n)).toEqual([1_000, 40_001n]); // tier 3 -> 2 at once
    // legacy boolean forceDown still reads as the h-lock
    expect(graduationRatchet({ prevCeilX100: 1_000, prevSlot: 18_000n, graduation: true, forceDown: true, lLaunchX100: 500, lTierX100: 2_000, lTableTierX100: 1_000, nowSlot: 40_001n })).toEqual({ ceilX100: 500, ceilSlot: 40_001n });
  });
  it("fall-only: never rises; falls to the bound at once (the h-lock too)", () => {
    const f = (prev: number, slot: bigint, grad: boolean, stress: number, tabv: number) => { const r = graduationFallOnly({ prevCeilX100: prev, prevSlot: slot, graduation: grad, stress, lLaunchX100: 500, lTierX100: 2_000, lTableTierX100: tabv, stressCapX100: n, nowSlot: 99n }); return [r.ceilX100, r.ceilSlot]; };
    expect(f(500, 7n, true, STRESS_NONE, 1_000)).toEqual([500, 7n]);
    expect(f(1_000, 7n, false, STRESS_NONE, 500)).toEqual([500, 99n]);
    expect(f(2_000, 7n, true, STRESS_NONE, 1_000)).toEqual([1_000, 99n]);
    expect(f(2_000, 7n, true, STRESS_HLOCK, 1_000)).toEqual([500, 99n]);
  });
  it("ratchet primitive", () => {
    expect(ratchetCeilingX100(500, 0n, 1_000, 500, false, 9_000n)).toEqual({ ceilX100: 600, ceilSlot: 9_000n });
    // Rust (666df893): 8x -> 6x in one call; h-lock to the floor; ADL to its graded target at once
    expect(ratchetCeilingX100(800, 0n, 600, 500, STRESS_NONE, 1n)).toEqual({ ceilX100: 600, ceilSlot: 1n });
    expect(ratchetCeilingX100(800, 0n, 900, 500, STRESS_HLOCK, 1n)).toEqual({ ceilX100: 500, ceilSlot: 1n });
    expect(ratchetCeilingX100(800, 0n, 500, 500, STRESS_ADL, 1n)).toEqual({ ceilX100: 500, ceilSlot: 1n });
    expect(ratchetCeilingX100(500, 0n, 550, 500, false, 9_000n)).toEqual({ ceilX100: 550, ceilSlot: 9_000n });
    expect(ratchetCeilingX100(900, 5n, 400, 500, false, 6n)).toEqual({ ceilX100: 400, ceilSlot: 6n });
  });
  it("graduationOn", () => {
    expect(graduationOn(true, 130, 1) && !graduationOn(false, 130, 1) && !graduationOn(true, 130, 0) && !graduationOn(true, 0, 1)).toBe(true);
  });
});

// ── view and quote ─────────────────────────────────────────────────────────────────────────

interface RecOver {
  lambda?: number; lLaunch?: number; lTier?: number; ceil?: number; ceilSlot?: bigint; cLaunch?: bigint; rGap?: number;
  src?: number; attested?: number; depth?: bigint; prev?: bigint; slot?: bigint; lastGood?: bigint; lastGoodSlot?: bigint;
  th?: [number, number, number]; lv?: [number, number, number]; dec?: number; riseSlot64?: number;
  /** A legacy (combined-build) record: c_launch at 0..8, flags 0, no volatility data. */
  legacy?: boolean; volVar?: number;
}
function g(o: RecOver): AssetGrowthV19 {
  const b = new Uint8Array(ASSET_GROWTH_LEN);
  const v = new DataView(b.buffer);
  if (o.legacy) v.setBigUint64(0, o.cLaunch ?? 1_000_000_000n, true);
  else { v.setUint32(0, o.volVar ?? 0, true); b[39] = 0x03; }
  v.setBigUint64(8, o.ceilSlot ?? 0n, true);
  v.setUint32(16, o.lambda ?? 10_000, true);
  v.setUint16(20, o.lLaunch ?? 500, true);
  v.setUint16(22, o.lTier ?? 2_000, true);
  v.setUint16(24, o.ceil ?? o.lLaunch ?? 500, true);
  v.setUint16(26, 5_000, true);
  v.setUint16(28, o.rGap ?? 3445, true);
  b[38] = 1;
  b[44] = o.src ?? 0;
  b[45] = o.attested ?? 0;
  v.setBigUint64(56, o.depth ?? 0n, true);
  v.setBigUint64(64, o.slot ?? 0n, true);
  v.setBigUint64(72, o.prev ?? 0n, true);
  v.setBigUint64(80, o.lastGood ?? 0n, true);
  v.setBigUint64(88, o.lastGoodSlot ?? 0n, true);
  b[46] = (o.dec ?? 6) + 1;
  new DataView(b.buffer).setUint32(114, o.riseSlot64 ?? 0, true);
  (o.th ?? [0, 0, 0]).forEach((x, i) => v.setUint32(96 + 4 * i, x, true));
  (o.lv ?? [0, 0, 0]).forEach((x, i) => v.setUint16(108 + 2 * i, x, true));
  return decodeAssetGrowthRecordV19(b)!;
}
const BAND = 1000; // G(1000) = 3445
const NOW = 1_000n;
/** Engine config of the fixtures: IMR 5% (L_tier 20x), no liquidation fee, band epoch 600 slots (H = 1,200). */
const VOL = { engineImrBps: 500n, liquidationFeeBps: 0n, bandMaxEpochSlots: 600n };
// These pin the pure growth_v19 tier / curve math (the Rust unit tests of those functions). rc23's κ / λ caps are applied in the
// wrapper's growth_g8_ctx_view on top of it, so they are switched off here and covered in test/lev-guard-limits-v22.test.ts.
const view = (gr: AssetGrowthV19, band: number, now: bigint, cM: bigint | null, stress: number | boolean) => growthCeilingView(gr, band, now, cM, stress, VOL, { rc23Caps: false });
const dex = (usd: bigint, extra: RecOver = {}): RecOver => ({ src: DEPTH_SOURCE.OnChainPool | DEPTH_EVER | DEPTH_PREV_REAL, depth: usd * M, prev: usd * M, slot: 990n, lastGood: usd * M, lastGoodSlot: 990n, ...extra });

describe("growthCeilingView: explainer worked examples (tiered 20x meme market, launch 5x)", () => {
  it("tier 0: thin pool $8k, backing $10k -> 5x, tier 0", () => {
    const v = view(g(dex(8_000n)), BAND, NOW, 10_000n * M, false);
    expect([v.tier, v.venueTier, v.bookTier, v.ceilingX100, v.targetX100, v.graduationOn]).toEqual([0, 0, 0, 500, 500, false]);
    // next: tier 1 needs $25k depth and $25k backing; 5x is the table's L1 = launch, so no gain -> tier 2 (10x) is the first that raises it
    // continuous leverage (e699d7da): the curve reaches 10x exactly AT T2 ($100k); between T1 and T2 it is already log-interpolated toward it
    expect(v.nextTierUnlock).toEqual({ kind: "both", tier: 2, depthUsd: 100_000, backingUsd: 100_000, thresholdUsd: 100_000, leverageX100: 1_000, fullDepthUsd: 100_000 });
  });
  it("tier 1: depth $30k, backing $40k -> target 5.65x on the curve (stored 5x climbs); 10x in full needs both at $100k", () => {
    const v = view(g(dex(30_000n)), BAND, NOW, 40_000n * M, false);
    // continuous leverage: min(venue $30k, book $40k) = $30k sits log2(1.2)/2 of the way from T1 (5x) to T2 (10x): 5x + 5x * 0.1315 = 5.65x;
    // κ / λ_depth LAG (21b8ccfd M-1): the same fraction one segment down, κ 0.5 -> 1 (0.5657), λ_depth 1x -> 1x (never looser than the step)
    expect([v.tier, v.targetX100, v.ceilingX100]).toEqual([1, 565, 500]);
    expect(v.dials).toEqual({ lSignalX100: 565, kappaBps: 5_657, lambdaDepthBps: 10_000 });
    expect(v.nextUnlock).toEqual({ kind: "ratchet", leverageX100: 565, etaSlots: 8_000n, etaMinutes: 54 });
    expect(v.nextTierUnlock).toEqual({ kind: "both", tier: 2, depthUsd: 100_000, backingUsd: 100_000, thresholdUsd: 100_000, leverageX100: 1_000, fullDepthUsd: 100_000 });
  });
  it("tier 2: depth $150k, backing $120k -> target 11.13x on the curve, ceiling climbs +1x per hour; ETA in minutes", () => {
    const v = view(g(dex(150_000n)), BAND, NOW, 120_000n * M, false);
    // continuous leverage: min(venue $150k, book $120k) = $120k on [T2 $100k, T3 $500k]: 10x + 10x * log2(1.2)/log2(5) = 11.13x;
    // κ / λ_depth LAG (21b8ccfd M-1): the same fraction one segment down, κ 1 -> 1 (1.0), λ_depth 1x -> 2x (1.1132x)
    expect([v.tier, v.venueTier, v.bookTier, v.targetX100, v.ceilingX100]).toEqual([2, 2, 2, 1_113, 500]);
    expect(v.dials).toEqual({ lSignalX100: 1_113, kappaBps: 10_000, lambdaDepthBps: 11_132 });
    expect([v.lVolX100, v.lSignalX100, v.stress, v.volInputsMissing]).toEqual([2_000, 1_113, STRESS_NONE, false]);
    // stored ceil 500 stamped at slot 0: next step allowed at slot 9000, now 1000 -> 8000 slots = 3200 s = 53.3 min -> 54
    expect(v.nextUnlock).toEqual({ kind: "ratchet", leverageX100: 600, etaSlots: 8_000n, etaMinutes: 54 });
    expect(v.nextTierUnlock).toEqual({ kind: "both", tier: 3, depthUsd: 500_000, backingUsd: 500_000, thresholdUsd: 500_000, leverageX100: 2_000, fullDepthUsd: 500_000 });
    // once the ceiling reached 8x the step is 9x
    const v8 = view(g(dex(150_000n, { ceil: 800, ceilSlot: 500n })), BAND, NOW, 120_000n * M, false);
    expect(v8.ceilingX100).toBe(800);
    expect(v8.nextUnlock).toEqual({ kind: "ratchet", leverageX100: 900, etaSlots: 8_500n, etaMinutes: 57 });
    // stored 10x is below the 11.13x target: in force 10x, the next step is +1x (11x)
    const v10 = view(g(dex(150_000n, { ceil: 1_000 })), BAND, NOW, 120_000n * M, false);
    expect(v10.ceilingX100).toBe(1_000);
    expect(v10.nextUnlock).toEqual({ kind: "ratchet", leverageX100: 1_100, etaSlots: 8_000n, etaMinutes: 54 });
    // stored above the target: in force = min(stored, target) = 11.13x, only the tier requirement is left
    const v12 = view(g(dex(150_000n, { ceil: 1_200 })), BAND, NOW, 120_000n * M, false);
    expect(v12.ceilingX100).toBe(1_113);
    expect(v12.nextUnlock.kind).toBe("both");
  });
  it("backing falls: the target follows the curve down at once (to $90k: 9.62x, the 8x ceiling holds; to $20k: launch 5x)", () => {
    // continuous leverage: book $90k reads 5x + 5x * log2(3.6)/2 = 9.62x (the step table dropped to 5x here); the stored 8x is below it
    const v = view(g(dex(150_000n, { ceil: 800 })), BAND, NOW, 90_000n * M, false);
    expect([v.tier, v.bookTier, v.targetX100, v.ceilingX100]).toEqual([1, 1, 962, 800]);
    expect(v.nextUnlock).toEqual({ kind: "ratchet", leverageX100: 900, etaSlots: 8_000n, etaMinutes: 54 });
    expect(v.nextTierUnlock).toEqual({ kind: "backing", tier: 2, backingUsd: 100_000, thresholdUsd: 100_000, leverageX100: 1_000 });
    // below T1 graduation is off: the cap goes straight to launch
    const v20 = view(g(dex(150_000n, { ceil: 800 })), BAND, NOW, 20_000n * M, false);
    expect([v20.tier, v20.bookTier, v20.targetX100, v20.ceilingX100]).toEqual([0, 0, 500, 500]);
  });
  it("tier 3 major: depth $700k backing $600k -> 20x target (both past T3); backing $300k -> 16.82x", () => {
    const v = view(g(dex(700_000n, { ceil: 1_000 })), BAND, NOW, 600_000n * M, false);
    // continuous leverage: the curve equals L3 from T3 ($500k) on; the round-3 ramp still read 18x at $600k
    expect([v.tier, v.targetX100, v.ceilingX100]).toEqual([3, 2_000, 1_000]);
    expect(view(g(dex(700_000n, { ceil: 1_000 })), BAND, NOW, 300_000n * M, false).targetX100).toBe(1_682); // ledger table: 16.82x at $300k
    expect(v.nextUnlock.kind).toBe("ratchet");
  });
  it("a market built for 5x never graduates, whatever its depth", () => {
    const v = view(g(dex(700_000n, { lTier: 500 })), BAND, NOW, 600_000n * M, false);
    expect([v.tier, v.targetX100, v.nextUnlock.kind, v.nextTierUnlock.kind]).toEqual([3, 500, "none", "none"]);
  });
  it("keeper-attested depth is tier-1 capped: tier 2 says it needs an on-chain pool; attested_max_tier 3 lifts it", () => {
    const att = { src: DEPTH_SOURCE.Attested | DEPTH_EVER | DEPTH_PREV_REAL };
    const v = view(g(dex(700_000n, att)), BAND, NOW, 600_000n * M, false);
    expect([v.venueTier, v.bookTier, v.tier, v.targetX100]).toEqual([1, 3, 1, 500]);
    expect(v.nextTierUnlock).toMatchObject({ kind: "depth", tier: 2, depthUsd: 100_000, leverageX100: 1_000, needsOnChainDepth: true });
    expect(v.nextTierUnlock.backingUsd).toBeUndefined();
    expect(v.venueDepthE6).toBe(T1); // continuous leverage: the attested depth is clamped to the anchor T1, where the curve is exactly L1
    expect(v.venueLX100).toBe(500);
    const v3 = view(g(dex(700_000n, { ...att, attested: 3 })), BAND, NOW, 600_000n * M, false);
    expect([v3.venueTier, v3.tier, v3.targetX100]).toEqual([3, 3, 2_000]);
  });
  it("per-market thresholds and leverage drive tier and target", () => {
    // thresholds $5k / $20k / $100k, leverage 6x / 8x / 12x
    const o = dex(25_000n, { th: [5_000, 20_000, 100_000], lv: [600, 800, 1_200], lTier: 2_000 });
    const v = view(g(o), BAND, NOW, 30_000n * M, false);
    // continuous leverage: $25k on [T2 $20k, T3 $100k] (8x -> 12x): 8x + 4x * log2(1.25)/log2(5) = 8.55x
    expect([v.tier, v.targetX100]).toEqual([2, 855]);
    expect(v.nextTierUnlock).toMatchObject({ tier: 3, depthUsd: 100_000, leverageX100: 1_200 });
  });
  it("backing needed grows when lambda is below 1x (book capacity = C_m * min(lambda, 1x))", () => {
    const v = view(g(dex(30_000n, { lambda: 5_000 })), BAND, NOW, 40_000n * M, false);
    expect(v.bookDepthE6).toBe(20_000n * M);
    expect(v.nextTierUnlock.backingUsd).toBe(200_000);
  });
  it("unknown LP equity reads book tier 0 (never looser)", () => {
    const v = view(g(dex(700_000n)), BAND, NOW, null, false);
    expect([v.bookTier, v.tier, v.ceilingX100]).toEqual([0, 0, 500]);
  });
  it("off the clamp: launch ceiling, nothing to unlock, tier 0", () => {
    const v = view(g(dex(700_000n, { rGap: 400, ceil: 1_000 })), BAND, NOW, 600_000n * M, false);
    expect([v.clampEnforced, v.tier, v.ceilingX100, v.nextUnlock.kind]).toEqual([false, 0, 500, "none"]);
    expect(view(g(dex(700_000n)), 0, NOW, 600_000n * M, false).clampEnforced).toBe(false);
  });
  it("force-down (legacy boolean) and the h-lock give the launch ceiling", () => {
    const v = view(g(dex(700_000n, { ceil: 1_000 })), BAND, NOW, 600_000n * M, true);
    expect([v.ceilingX100, v.targetX100, v.nextUnlock.kind, v.stress]).toEqual([500, 500, "none", STRESS_HLOCK]);
  });
  it("graded stress (item 3): draw -> one tier down, real ADL -> two, binding in the same read", () => {
    const o = dex(700_000n, { ceil: 2_000 });
    const d = view(g(o), BAND, NOW, 625_000n * M, STRESS_DRAW);
    expect([d.tier, d.stressCapX100, d.targetX100, d.ceilingX100]).toEqual([3, 1_000, 1_000, 1_000]);
    const a = view(g(o), BAND, NOW, 625_000n * M, STRESS_ADL);
    expect([a.stressCapX100, a.targetX100, a.ceilingX100]).toEqual([500, 500, 500]);
    expect(view(g(o), BAND, NOW, 625_000n * M, STRESS_NONE).ceilingX100).toBe(2_000);
  });
  it("graded stress BETWEEN anchors is STEPPED (21b8ccfd M-2): a draw at $200k / $300k / $400k cuts a stored 20x to 5x at once", () => {
    // wrapper contlev_m2_draw_keeps_the_stepped_stress_cap: unstressed 14.30x / 16.82x / 18.61x; under a draw base caf062bd's stepped 5x
    // (3198539a's continuous cap read 7.15x / 8.41x / 9.30x: the negative control)
    for (const [usd, un] of [[200_000n, 1_430], [300_000n, 1_682], [400_000n, 1_861]] as const) {
      const o = dex(usd, { ceil: 2_000 });
      const n = view(g(o), BAND, NOW, usd * M, STRESS_NONE);
      expect([n.tier, n.targetX100, n.ceilingX100], `$${usd} unstressed`).toEqual([2, un, un]);
      const d = view(g(o), BAND, NOW, usd * M, STRESS_DRAW);
      expect([d.stressCapX100, d.targetX100, d.ceilingX100], `$${usd} draw`).toEqual([500, 500, 500]);
      const a = view(g(o), BAND, NOW, usd * M, STRESS_ADL);
      expect([a.stressCapX100, a.targetX100, a.ceilingX100], `$${usd} ADL`).toEqual([500, 500, 500]);
    }
  });
  it("volatility (item 6): no data -> launch; seed variance over H = 1,200 caps a 20x market at 17.48x; inputs missing -> launch", () => {
    const o = dex(700_000n, { ceil: 2_000 });
    // a legacy (combined-build) record: flags 0, c_launch at 0..8 -> no volatility data -> launch at once
    const leg = g({ ...o, legacy: true, cLaunch: 5_000_000_000n });
    expect([leg.r3Layout, leg.volHasData, leg.volVarX100, leg.cLaunchAtoms]).toEqual([false, false, 0, 5_000_000_000n]);
    expect(view(leg, BAND, NOW, 625_000n * M, STRESS_NONE).ceilingX100).toBe(500);
    // seed variance 2,500: sigma_H = ceil(sqrt(2,500 * 1,200 / 100)) = 174; L_vol = 1e6 / max(500, 3 * 174 + 0) = 1e6 / 522 = 1,915
    const seeded = view(g({ ...o, volVar: 2_500 }), BAND, NOW, 625_000n * M, STRESS_NONE);
    expect([seeded.lVolX100, seeded.lSignalX100, seeded.ceilingX100]).toEqual([1_915, 1_915, 1_915]);
    // with the Rust unit test's liquidation fee 50 bps: 1e6 / 572 = 1,748
    expect(growthCeilingView(g({ ...o, volVar: 2_500 }), BAND, NOW, 625_000n * M, STRESS_NONE, { ...VOL, liquidationFeeBps: 50n }).ceilingX100).toBe(1_748);
    const miss = growthCeilingView(g({ ...o, volVar: 2_500 }), BAND, NOW, 625_000n * M, STRESS_NONE);
    expect([miss.volInputsMissing, miss.ceilingX100]).toEqual([true, 500]);
  });
  it("stale depth: tier 0 for leverage, sticky cap for capacity", () => {
    const o = dex(150_000n, { slot: 100n, lastGoodSlot: 100n, ceil: 1_000 });
    const v = view(g(o), BAND, 100n + 18_000n, 120_000n * M, false);
    expect([v.effectiveDepthE6, v.venueTier, v.tier, v.ceilingX100]).toEqual([0n, 0, 0, 500]);
    expect(v.capDepthE6).toBe(37_500n * M);
  });
});

function qin(growth: AssetGrowthV19, cap: bigint, now = NOW, lpPos = 1n): QuoteMaxLeverageInput {
  return {
    engineImrBps: 500n, growth, lpCapital: cap, lpPnl: 0n, lpFeeCredits: 0n, lpEffectivePositionQ: lpPos, assetBound: true,
    oiEffLongQ: 0n, oiEffShortQ: 0n, priceE6: M, bankruptcyHlockActive: false,
    v22: { bandBps: BAND, nowSlot: now, vol: { liquidationFeeBps: VOL.liquidationFeeBps, bandMaxEpochSlots: VOL.bandMaxEpochSlots }, rc23Caps: false },
  };
}

describe("quoteMaxLeverage (R2.1)", () => {
  it("tier 2 market, ceiling 8x: quote 8x on the thin side, capacity min(backing, depth)", () => {
    const q = quoteMaxLeverage(qin(g(dex(150_000n, { ceil: 800 })), 120_000n * M), "long");
    expect([q.tier, q.venueTier, q.bookTier, q.ceilingX100, q.maxLeverageX100]).toEqual([2, 2, 2, 800, 800]);
    expect(q.nCapQ).toBe(120_000n * M);
    expect(q.nextUnlock.kind).toBe("ratchet");
  });
  it("depth readings stopped (sticky): capacity follows last_good >> k at the tier-0 rate, leverage drops to launch", () => {
    const o = dex(150_000n, { slot: 0n, lastGoodSlot: 0n, ceil: 1_000 });
    const q0 = quoteMaxLeverage(qin(g(o), 120_000n * M, 1_000n), "long"); // still fresh? slot 0 + 150 < 1000 -> stale
    expect(q0.tier).toBe(0);
    expect(q0.ceilingX100).toBe(500);
    expect(q0.capDepthE6).toBe(150_000n * M); // k = 0: last good, undecayed
    expect(q0.nCapQ).toBe(75_000n * M); // 150k * kappa 0.5
    const q1 = quoteMaxLeverage(qin(g(o), 120_000n * M, 9_000n), "long");
    expect(q1.nCapQ).toBe(37_500n * M);
    const q2 = quoteMaxLeverage(qin(g(o), 120_000n * M, 18_000n), "long");
    expect(q2.nCapQ).toBe(18_750n * M);
    const qz = quoteMaxLeverage(qin(g(o), 120_000n * M, 64n * 9_000n), "long");
    expect(qz.closed).toBe(true);
    expect(qz.closedReason).toBe("capacity-zero");
  });
  it("a fresh real zero reading (source 1/2, depth 0) closes new opens at once; the tier falls to 0", () => {
    const q = quoteMaxLeverage(qin(g(dex(0n, { ceil: 800, lastGood: 0n })), 120_000n * M), "long");
    expect([q.tier, q.capDepthE6, q.closed, q.closedReason, q.ceilingX100]).toEqual([0, 0n, true, "capacity-zero", 500]);
    expect(q.reduceOnlyCapacityExempt).toBe(true);
    // a 35 B (absent) reading is NOT zero: sticky last good keeps the cap
    const absent = quoteMaxLeverage(qin(g(dex(0n, { src: DEPTH_EVER | DEPTH_PREV_REAL, lastGood: 150_000n * M, lastGoodSlot: 990n })), 120_000n * M), "long");
    expect([absent.capDepthE6, absent.closed]).toEqual([150_000n * M, false]);
  });
  it("never had a depth: no depth cap, today's capital rule", () => {
    const q = quoteMaxLeverage(qin(g({ ceil: 500 }), 50_000n * M), "long");
    expect(q.capDepthE6).toBeNull();
    expect(q.nCapQ).toBe(50_000n * M);
  });
  it("without v22 input the quote is growth-1 (stored lambda, launch ceiling)", () => {
    const i = qin(g(dex(150_000n, { ceil: 800, lambda: 30_000 })), 100_000n * M);
    delete (i as { v22?: unknown }).v22;
    const q = quoteMaxLeverage(i, "long");
    expect([q.ceilingX100, q.tier, q.nCapQ]).toEqual([500, 0, 300_000n * M]);
  });
});

describe("builders: tag 94 tier block, tag 93 tier trailer", () => {
  const tiers = { thresholdUsd: [25_000, 100_000, 500_000] as [number, number, number], leverageX100: [500, 1_000, 2_000] as [number, number, number] };
  it("tag 94: 23 bytes; the 5-byte form is a prefix", () => {
    const d = encodeInitVaultLpV22Tiers(2_000, 500, tiers, 2_000);
    expect(d.length).toBe(23);
    expect(hex(d)).toBe("5e" + "d007" + "f401" + "a8610000" + "a0860100" + "20a10700" + "f401" + "e803" + "d007");
    expect(hex(d.subarray(0, 5))).toBe(hex(encodeInitVaultLpV19(2_000, 500)));
  });
  it("tag 94 refuses a table the wrapper answers 130 for (when lTier is given)", () => {
    expect(() => encodeInitVaultLpV22Tiers(2_000, 500, { thresholdUsd: [1, 2, 3], leverageX100: [0, 0, 0] }, 2_000)).toThrow(/130/);
    expect(() => encodeInitVaultLpV22Tiers(2_000, 500, { thresholdUsd: [1, 2, 3], leverageX100: [0, 0, 0] })).not.toThrow();
    expect(() => encodeInitVaultLpV22Tiers(2_000, 0, tiers)).toThrow();
    expect(() => encodeInitVaultLpV22Tiers(2_000, 500, { thresholdUsd: [2 ** 32, 0, 0], leverageX100: [0, 0, 0] })).toThrow(/u32/);
    expect(() => encodeInitVaultLpV22Tiers(2_000, 500, { thresholdUsd: [0, 0, 0], leverageX100: [70_000, 0, 0] })).toThrow(/u16/);
  });
  it("tag 93: 71 bytes = tag + asset + 41 zero + 27-byte trailer", () => {
    const d = encodeSetAssetRiskLimitsV22Tiers(2, 10_000, 5_000, tiers, 3, 0, { lLaunchX100: 500, lTierX100: 2_000 });
    expect(d.length).toBe(71);
    expect(hex(d.subarray(0, 3))).toBe("5d0200");
    expect(Array.from(d.subarray(3, 44)).every((x) => x === 0)).toBe(true);
    expect(hex(d.subarray(44))).toBe("10270000" + "8813" + "0000" + "a8610000" + "a0860100" + "20a10700" + "f401" + "e803" + "d007" + "03");
    const u = encodeSetAssetRiskLimitsV22Tiers(2, 10_000, 5_000, { thresholdUsd: [0, 0, 0], leverageX100: [0, 0, 0] }, 0, 600);
    expect(hex(u.subarray(50, 52))).toBe("5802"); // the util-fee dial at trailer offset 6
  });
  it("tag 93 refuses attested_max_tier 4, a bad table and a bad lambda", () => {
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, tiers, 4)).toThrow(/130/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, { thresholdUsd: [4_999, 20_000, 100_000], leverageX100: [0, 0, 0] }, 1, 0, { lLaunchX100: 500, lTierX100: 2_000 })).toThrow(/5,000 tokens/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 0, 5_000, tiers, 1)).toThrow();
  });
});

describe("R2-L2: thresholds are whole collateral tokens scaled by the mint decimals", () => {
  it("tierThresholdsE6 with decimals (Rust r2m1 vectors)", () => {
    expect(tierThresholdsE6([0, 0, 0], 9)[0]).toBe(25_000n * 1_000_000_000n);
    expect(tierThresholdsE6([5_000, 20_000, 100_000], 6)).toEqual([5_000_000_000n, 20_000_000_000n, 100_000_000_000n]);
    expect(tierThresholdsE6([0xffff_ffff, 0xffff_ffff, 0xffff_ffff], 18)[2]).toBe(U64MAX); // saturates, fail closed
    expect(collateralDecimalsOf(0)).toBe(6);
    expect(collateralDecimalsOf(10)).toBe(9);
    expect(wholeTokenAtoms(9)).toBe(1_000_000_000n);
  });
  it("validateTierConfig: '$' only on 6-decimal USD-like collateral, otherwise tokens / the symbol; the verdict does not depend on it", () => {
    const base = { thresholdsUsd: [1_000, 20_000, 100_000] as [number, number, number], lLaunchX100: 500, lTierX100: 2_000 };
    expect(validateTierConfig({ ...base, collateral: { decimals: 6, usdLike: true } }).issues[0]?.message).toBe("Tier 1 pool depth must be at least $5,000.");
    expect(validateTierConfig({ ...base, collateral: { decimals: 9, usdLike: true } }).issues[0]?.message).toBe("Tier 1 pool depth must be at least 5,000 tokens.");
    expect(validateTierConfig({ ...base, collateral: { decimals: 6 } }).issues[0]?.message).toBe("Tier 1 pool depth must be at least 5,000 tokens.");
    expect(validateTierConfig({ ...base, collateral: { decimals: 9, symbol: "SOL" } }).issues[0]?.message).toBe("Tier 1 pool depth must be at least 5,000 SOL.");
    expect(validateTierConfig({ ...base, collateral: { decimals: 9 } }).ok).toBe(false);
    expect(validateTierConfig({ lLaunchX100: 500, lTierX100: 2_000, collateral: { decimals: 9 } }).ok).toBe(true);
  });
  it("record: bytes 46 (decimals + 1) and 114 (rise epoch u32 LE) decode; view scales thresholds and names tokens", () => {
    const b = new Uint8Array(ASSET_GROWTH_LEN);
    b[38] = 1; b[46] = 10; b.set([0x2a, 0x01, 0, 0], 114);
    const r = decodeAssetGrowthRecordV19(b)!;
    expect([r.collateralDecimalsP1, r.collateralDecimals, r.depthRiseSlot64]).toEqual([10, 9, 298]);
    expect(ASSET_GROWTH_DEPTH_FIELD_OFF.collateralDecimalsP1).toBe(46);
    expect(ASSET_GROWTH_DEPTH_FIELD_OFF.depthRiseSlot64).toBe(114);
    // a 9-decimal collateral market: $100k-equivalent depth is 100_000 tokens = 1e14 atoms
    const o = dex(100_000n, { dec: 9 });
    const v = view(g(o), BAND, NOW, null, false);
    expect(v.collateralDecimals).toBe(9);
    expect(v.thresholdsE6[1]).toBe(100_000n * 1_000_000_000n);
    // the same atoms are only 100 tokens at 9 decimals: tier 0, and tier 2 needs 100,000 TOKENS of depth
    expect([v.tier, v.nextTierUnlock.depthUsd]).toEqual([0, 100_000]);
  });
});

describe("R2-M1: the usable depth is min(fresh, rate-limited last good) (Rust r2m1_depth_rises_at_most_2x_per_epoch_and_falls_at_once)", () => {
  const th = tierThresholdsE6([0, 0, 0], 6);
  const seed = th[0] - 1n;
  const a = DEPTH_SOURCE.OnChainPool;
  const usable = (x: DepthState, now: bigint): bigint | null => usableDepthE6(freshDepthE6(x.depthE6, x.depthPrevE6, x.depthSlot, x.depthSource, now), x.lastGoodE6);
  const empty: DepthState = { depthE6: 0n, depthSlot: 0n, depthPrevE6: 0n, depthSource: 0, lastGoodE6: 0n, lastGoodSlot: 0n, riseSlot64: 0 };
  // Port of the Rust unit test at 666df893 (round 3 item 4: D-I1 first reading T1/16, the time-weighted window, D2 held zero).
  const floor = seed / DEPTH_BOOTSTRAP_DIV;
  const B = DEPTH_TW_BUCKET_SLOTS;
  const usableOf = (x: DepthState, now: bigint): bigint | null => usableDepthE6(freshDepthE6(x.depthE6, x.depthPrevE6, x.depthSlot, x.depthSource, now), x.lastGoodE6, depthTwMinAtoms(x.tw!, M));
  const hold = (st0: DepthState, from: bigint, to: bigint, d: bigint): DepthState => {
    let st = st0;
    for (let x = from; x <= to; x += 10n) st = dpu(st, a, d, x, seed);
    return st;
  };
  const real = 2_000n * M, inflated = 500_000_000n * M;
  it("D-I1: a first-pair flash of $500M reads T1/16 (~$1,562), tier 0; two inflated reads in the same bucket add nothing", () => {
    const f0 = dpu(dpu(empty, a, inflated, 1_000n, seed), a, inflated, 1_001n, seed);
    expect(f0.lastGoodE6).toBe(floor);
    expect(venueTier(usableOf(f0, 1_001n)!, f0.depthSource, th, 0)).toBe(0);
    const s1 = dpu(dpu(empty, a, real, 1_000n, seed), a, real, 1_001n, seed);
    expect(s1.lastGoodE6).toBe(floor); // first reading: T1/16
    const w2 = dpu(dpu(s1, a, inflated, 1_014n, seed), a, inflated, 1_015n, seed);
    expect(usableOf(w2, 1_015n)).toBe(floor); // the spike adds nothing
    expect(depthTwMinAtoms(w2.tw!, M)).toBe(real); // the window keeps the real min
    // the whale withdraws, then a 35 B push: sticky at the rate-limited value, never the inflated one
    const z = dpu(dpu(w2, a, real, 1_016n, seed), DEPTH_SOURCE.None, 0n, 1_017n, seed);
    expect(capDepthE6(z.depthSource, null, z.lastGoodE6, z.lastGoodSlot, 1_200n, depthTwMinAtoms(z.tw!, M))).toBe(floor);
  });
  it("a rise needs liquidity HELD over a full bucket pair AND 9,000 slots per doubling; an honest reading takes it down at once", () => {
    const s1 = dpu(dpu(empty, a, real, 1_000n, seed), a, real, 1_001n, seed);
    let st = s1;
    let s = 10_100n; // the first rise window opens at stamp(1,001) * 64 + 63 + 9,000 = 10,023
    let prev = st.lastGoodE6;
    for (let k = 1; k <= 4; k++) {
      st = hold(st, s - 2n * B, s - 80n, inflated);
      expect(st.lastGoodE6, `window ${k}: no rise before 9,000 slots`).toBe(prev);
      st = hold(st, s, s + 2n * B, inflated);
      expect(st.lastGoodE6, `window ${k}: exactly one doubling`).toBe(prev * 2n);
      st = hold(st, s + 2n * B + 10n, s + 4_000n, inflated);
      expect(st.lastGoodE6, `window ${k}: no second rise`).toBe(prev * 2n);
      prev = st.lastGoodE6;
      s += 9_064n;
    }
    const h = dpu(dpu(st, a, real, s, seed), a, real, s + 1n, seed);
    expect(usableOf(h, s + 1n)).toBe(real);
    expect(h.lastGoodE6).toBe(real); // down at once
  });
  it("D2: a real 0 caps at 0 at once but last_good is HELD; recovery within ~10 min, a long zero decays it", () => {
    const deep = 150_000n * M;
    let d: DepthState = { lastGoodE6: deep, lastGoodSlot: 50_000n, riseSlot64: 0, depthSource: DEPTH_EVER | a | DEPTH_PREV_REAL, depthE6: deep, depthPrevE6: deep, depthSlot: 50_000n,
      tw: { curTokens: 150_000, prevTokens: 150_000, bucketP1: depthTwBucketP1(50_000n) } };
    d = dpu(d, a, 0n, 50_010n, seed);
    expect(usableOf(d, 50_010n)).toBe(0n); // fresh-zero: 0 at once
    expect([d.lastGoodE6, d.lastGoodSlot]).toEqual([deep, 50_000n]); // held through the zero
    expect(capDepthE6(d.depthSource, null, d.lastGoodE6, d.lastGoodSlot, 50_300n, depthTwMinAtoms(d.tw!, M))).toBe(0n); // stale after a zero: still 0
    const r1 = hold(d, 50_020n, 50_020n + 300n, deep);
    expect(usableOf(r1, 50_320n)).toBe(0n); // the zero is still in the window
    const r2 = hold(r1, 50_330n, 50_000n + 3n * B, deep);
    expect(usableOf(r2, r2.depthSlot)).toBe(deep); // recovered within ~10 min, not ~7 h
    expect(floor * 32n < deep).toBe(true); // round 2 needed > 6 doublings (~7 h) to get back
    const long = hold(d, 50_020n, 50_000n + 9_000n * 2n + 500n, 0n);
    const back = hold(long, 50_000n + 9_000n * 2n + 510n, 50_000n + 9_000n * 2n + 510n + 3n * B, deep);
    expect(back.lastGoodE6).toBe((deep >> 2n) * 2n); // two epochs of zero: a quarter, then one doubling
  });
  it("depthRateLimited direct checks (D-L2 kept; no full window: no rise); depth_rise_stamp saturation", () => {
    const a1 = depthRateLimited(true, seed, 9_062n, 0, inflated, true, 63n + 9_000n, seed);
    expect(a1.lastGoodE6).toBe(2n * seed);
    const a2 = depthRateLimited(true, a1.lastGoodE6, 63n + 9_000n, a1.riseSlot64, inflated, true, 63n + 9_001n, seed);
    expect(a2.lastGoodE6).toBe(a1.lastGoodE6); // one slot later: no second doubling
    const a3 = depthRateLimited(true, seed, 9_062n, 0, inflated, false, 63n + 9_000n, seed);
    expect(a3.lastGoodE6).toBe(seed); // no full window: no rise
    expect(depthRateLimited(true, 100n, 44_999n, 5, 50n, true, 9_000n * 5n, seed)).toEqual({ lastGoodE6: 50n, riseSlot64: 5, lastGoodSlot: 45_000n }); // down at once, stamp kept
    // base is the STICKY last good: 100 last seen at slot 5 is 100 >> 4 = 6 at slot 45,000, so 50 is a rise (one doubling of 6, floored at seed/16, capped at w)
    expect(depthRateLimited(true, 100n, 5n, 5, 50n, true, 9_000n * 5n, seed)).toEqual({ lastGoodE6: 50n, riseSlot64: depthRiseStamp(45_000n), lastGoodSlot: 45_000n });
    expect(depthRateLimited(true, 100n, 5n, 5, 0n, true, 9_000n * 5n, seed)).toEqual({ lastGoodE6: 100n, riseSlot64: 5, lastGoodSlot: 5n }); // D2: a zero holds
    expect(depthRateLimited(false, 0n, 0n, 0, 9n * T1, false, 20_000n, seed)).toEqual({ lastGoodE6: floor, riseSlot64: 312, lastGoodSlot: 20_000n });
    expect(depthRiseStamp(20_000n)).toBe(312);
    expect(depthRiseStamp(1n << 60n)).toBe(0xffff_ffff);
    expect(depthRiseWindowOpen(0xffff_ffff, 1n << 62n)).toBe(false); // a saturated stamp never opens
    expect(depthRiseWindowOpen(depthRiseStamp(8_999n), 9_000n)).toBe(false);
    expect(depthRiseWindowOpen(depthRiseStamp(8_999n), (8_999n / 64n) * 64n + 63n + 9_000n)).toBe(true);
    expect(depthRiseWindowOpen(depthRiseStamp(8_999n), (8_999n / 64n) * 64n + 63n + 8_999n)).toBe(false);
  });
  it("D-L1: a saturated threshold is never met; >12-decimal collateral cannot carry a growth market", () => {
    expect(depthTierFor(U64MAX, [U64MAX, U64MAX, U64MAX])).toBe(0);
    expect(depthTierFor(U64MAX, [1n, 2n, U64MAX])).toBe(2);
    expect(tierThresholdsE6([0, 0, 0], 12)[2]).toBe(500_000n * 1_000_000_000_000n);
    expect([growthCollateralDecimalsOk(12), growthCollateralDecimalsOk(13), growthCollateralDecimalsOk(0)]).toEqual([true, false, true]);
    const v = validateTierConfig({ lLaunchX100: 500, lTierX100: 2_000, collateral: { decimals: 13 } });
    expect(v.ok).toBe(false);
    expect(v.issues[0]).toMatchObject({ field: "collateral", code: "collateral-decimals", message: "This collateral has more than 12 decimals, so a leveraged market cannot use it." });
    expect(validateTierConfig({ lLaunchX100: 500, lTierX100: 2_000, collateral: { decimals: 12 } }).ok).toBe(true);
  });
  it("R2-L1 rent snapshot", () => {
    expect(rentSnapshotNCapQ(0n, true)).toBe(1n);
    expect(rentSnapshotNCapQ(0n, false)).toBe(0n);
    expect(rentSnapshotNCapQ(7n, true)).toBe(7n);
    expect(rentSnapshotNCapQ(1n << 70n, false)).toBe(U64MAX);
  });
  it("view: the depth is there but rate-limited -> tier from the usable depth, ETA from the doubling schedule", () => {
    // fresh $400k on-chain, last good rate-limited at $25k (tier 1), rise epoch 0, now in epoch 0; backing $600k
    const o = dex(400_000n, { lastGood: 25_000n * M, riseSlot64: 0 });
    const v = view(g(o), BAND, NOW, 600_000n * M, false);
    expect([v.venueTier, v.bookTier, v.tier]).toEqual([1, 3, 1]);
    expect(v.freshDepthE6).toBe(400_000n * M);
    expect(v.effectiveDepthE6).toBe(25_000n * M);
    // tier 2 needs $100k: 25k -> 50k at slot 9,063 (window opens 63 + 9,000 after stamp 0) -> 100k at 18,087 (stamp 141): 17,087 slots from slot 1000
    expect(v.nextTierUnlock).toMatchObject({ kind: "depth", tier: 2, depthRateLimited: true, depthEtaSlots: 17_087n, depthEtaMinutes: 114 });
    // capacity follows the usable depth, not the fresh one; the LAGGING κ (21b8ccfd M-1) reads 0.5 at exactly T1 (it reaches 1.0 at T2),
    // so the depth cap is $12.5k, never looser than the round-2 step (3198539a's leading κ read 1.0 there: $25k)
    const q = quoteMaxLeverage(qin(g(o), 600_000n * M), "long");
    expect(q.capDepthE6).toBe(25_000n * M);
    expect(q.nCapQ).toBe(12_500n * M);
  });
  it("ratchet kind: usable depth already supports a higher target -> the +1x step ETA", () => {
    const o = dex(150_000n, { lastGood: 150_000n * M, ceil: 500 });
    const v = view(g(o), BAND, NOW, 120_000n * M, false);
    expect(v.nextUnlock.kind).toBe("ratchet");
  });
});

describe("errors 129 / 130", () => {
  it("calm one-line hints", () => {
    expect(decodeError(129)?.name).toBe("DepthSourceInvalid");
    expect(decodeError(130)?.name).toBe("GrowthTierConfigInvalid");
    for (const c of [129, 130]) { const h = decodeError(c)?.hint ?? ""; expect(h.length).toBeGreaterThan(20); expect(h).not.toMatch(/\n|bps|x100/); }
  });
});
