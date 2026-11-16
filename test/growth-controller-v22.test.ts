/**
 * v2.2 wrapper CONTROLLER round (percolator-prog `feat/v22-growth-controller` @ 666df893, `src/growth_v19.rs`): parity with the Rust unit
 * tests, vector for vector. Each `describe` names the Rust test it ports:
 *  - `r3_item7_rent_snapshot_and_min_leg`   (rent snapshot smoothing, bind guard)
 *  - `r3_item6_vol_term`                    (volatility sample / EWMA / isqrt F-8 / sigma / L_vol / flags)
 *  - `contlev_curve_unit`                   (continuous leverage e699d7da: log2 Q.16, curve, venue cap, dials, step == dials at a tier;
 *                                            replaces `r3_item5_tier_ramp`, removed from the wrapper with the ramp)
 *  - `r3_item4_window_primitives`           (time-weighted depth window)
 *  - `g8_target_ceiling_ratchet_and_force_down` stress part (stress cap / level / real ADL)
 *  - `g8_wl2_same_slot_push_is_not_a_second_sample` window part (no fresh sample: window untouched)
 * plus the layout claims (`offset_of!` asserts "Round 3 item 4 allocation claims") and the legacy-record read (review F-3).
 */
import { describe, it, expect } from "vitest";
import {
  rentSnapshotSmooth, rentStamp64Of, bandMinLegFitsDepth, volSampleX100, volUpdateX100, VOL_VAR_SEED_X100, sigmaHBps, isqrtCeil, lVolX100,
  lSignalWithVol, growthFlagsOk, venueDepthCapped, smoothDials, DEPTH_SOURCE, log2Q16, curveU64, curveValue, curvePos, CURVE_POS_FAIL,
  smoothDialsAndVenueL, curveLagU64, curvePosLag, KAPPA_TABLE_BPS, LAMBDA_DEPTH_TABLE_BPS, depthTierFor, nCapG8Q, lambdaDepthBps, kappaDepthBps,
  DEPTH_TW_BUCKET_SLOTS, DEPTH_TW_ABSENT, DEPTH_TW_EMPTY, depthTwUpdate, depthTwMinAtoms, depthTwFull, depthTwWindowOk, depthTokensFloor,
  stressCapX100, stressLevel, realAdl, tierLeverage, STRESS_NONE, STRESS_DRAW, STRESS_ADL, STRESS_HLOCK, depthPushUpdate,
  ASSET_GROWTH_FIELD_OFF, ASSET_GROWTH_DEPTH_FIELD_OFF, ASSET_GROWTH_LEN, decodeAssetGrowthRecordV19, growthLVolX100, growthCeilingView,
  ceilingInForceX100, targetCeilingX100, DEPTH_EVER, DEPTH_PREV_REAL,
} from "../src/index.js";
import type { DepthState, DepthWindow } from "../src/index.js";

const USD = 1_000_000n;

describe("Rust r3_item7_rent_snapshot_and_min_leg", () => {
  it("rises at once; a first measurement at once", () => {
    expect(rentSnapshotSmooth(100n, 0, 500n, 10n)).toEqual({ snapshot: 500n, stamp64: 0 });
    expect(rentSnapshotSmooth(0n, 0, 1n, 10n)).toEqual({ snapshot: 1n, stamp64: 0 });
  });
  it("a never-stamped fall: one halving at once, stamped slot/64 + 1; slots 0..63 stamp 1, not 'never'", () => {
    expect(rentSnapshotSmooth(1_000n, 0, 1n, 6_400n)).toEqual({ snapshot: 500n, stamp64: 101 });
    expect(rentSnapshotSmooth(1_000n, 0, 1n, 5n)).toEqual({ snapshot: 500n, stamp64: 1 });
    expect(rentSnapshotSmooth(500n, 1, 1n, 6n)).toEqual({ snapshot: 500n, stamp64: 1 });
  });
  it("held inside 900 slots of the last fall; one halving per whole window after; never below the new value; k >= 64 -> new", () => {
    expect(rentSnapshotSmooth(500n, 101, 1n, 6_463n + 899n)).toEqual({ snapshot: 500n, stamp64: 101 });
    expect(rentSnapshotSmooth(500n, 101, 1n, 6_463n + 900n)).toEqual({ snapshot: 250n, stamp64: rentStamp64Of(6_463n + 900n) });
    expect(rentSnapshotSmooth(800n, 101, 1n, 6_463n + 2_700n)).toEqual({ snapshot: 100n, stamp64: rentStamp64Of(6_463n + 2_700n) });
    expect(rentSnapshotSmooth(800n, 101, 300n, 6_463n + 2_700n).snapshot).toBe(300n);
    expect(rentSnapshotSmooth((1n << 64n) - 1n, 1, 1n, 64n * 900n + 200n).snapshot).toBe(1n);
  });
  it("min leg guard: 10 tokens fit in 0.5 x $40 = $20; not in 0.5 x $10; never measured passes", () => {
    expect(bandMinLegFitsDepth(10_000_000n, 40_000_000n)).toBe(true);
    expect(bandMinLegFitsDepth(10_000_000n, 10_000_000n)).toBe(false);
    expect(bandMinLegFitsDepth(10_000_000n, null)).toBe(true);
  });
  it("rent stamp is never 0 (saturating)", () => {
    expect([rentStamp64Of(0n), rentStamp64Of(63n), rentStamp64Of(64n), rentStamp64Of(1n << 62n)]).toEqual([1, 1, 2, 0xffff_ffff]);
  });
});

describe("Rust r3_item6_vol_term", () => {
  it("samples", () => {
    expect(volSampleX100(0n, 5n, 1n)).toBeNull(); // no previous mark
    expect(volSampleX100(5n, 6n, 0n)).toBeNull(); // same slot
    expect(volSampleX100(1_000_000n, 1_010_000n, 10n)).toBe(100_000n); // 1% over 10 slots: 100^2 * 100 / 10
    expect(volSampleX100(1_000_000n, 9_000_000n, 1n)).toBe(10_000n * 10_000n * 100n); // capped at 100%
  });
  it("seed and EWMA", () => {
    expect(volUpdateX100(0, false, 0n)).toBe(VOL_VAR_SEED_X100);
    expect(volUpdateX100(0, false, 99_999n)).toBe(99_999);
    expect(volUpdateX100(1_600, true, 0n)).toBe(1_500);
    expect(volUpdateX100(0, true, 17n)).toBe(2); // ceil toward a rise
    expect(volUpdateX100(0xffff_fff0, true, 1n << 40n)).toBe(0xffff_fff1); // the sample saturates at u32::MAX first; step ceil(15 / 16) = 1
  });
  it("sigma over 1,200 slots of the seed: sqrt(2,500 * 1,200 / 100) = sqrt(30,000) -> 174", () => {
    expect(sigmaHBps(VOL_VAR_SEED_X100, 1_200n)).toBe(174n);
  });
  it("isqrt_ceil (security review F-8: isqrt_ceil(2) == 2): exhaustive below 200,000, plus values near 2^64 and u128::MAX", () => {
    const U128 = (1n << 128n) - 1n;
    expect(isqrtCeil(U128)).toBe(1n << 64n);
    expect([isqrtCeil(16n), isqrtCeil(17n), isqrtCeil(2n), isqrtCeil(3n), isqrtCeil(4n)]).toEqual([4n, 5n, 2n, 2n, 2n]);
    // Incremental: ceil sqrt(x) == r exactly for x in ((r-1)^2, r^2]; walk r upward with a running bound
    // (one compare per x, no per-x multiplications), so every x in 0..199,999 is still checked.
    let want = 0n; // expected ceil sqrt for the current x
    let top = 0n; // want^2: the largest x that still has ceil sqrt == want
    for (let x = 0n; x < 200_000n; x++) {
      if (x > top) { want++; top = want * want; }
      const r = isqrtCeil(x);
      if (r !== want) throw new Error(`ceil sqrt(${x}) = ${r}, want ${want}`);
    }
    for (const k of [(1n << 64n) - 1n, (1n << 64n) + 1n, U128 - 1n, (1n << 127n) + 12_345n]) {
      const r = isqrtCeil(k);
      expect(r * r >= k && (r - 1n) * (r - 1n) < k, `ceil sqrt(${k}) = ${r}`).toBe(true);
    }
  });
  it("L_vol: 1e6 / max(IMR 500, 3 * 174 + 50 = 572) = 1,748 (17.48x); calm -> the IMR binds (20x); storm -> 3.27x; no data -> launch", () => {
    expect(lVolX100(500n, 174n, 50n)).toBe(1_748);
    expect(lVolX100(500n, 0n, 50n)).toBe(2_000);
    expect(lVolX100(500n, 1_000n, 50n)).toBe(327);
    expect(lVolX100(0n, 0n, 0n)).toBe(0xffff); // den == 0 guarded
    expect(lSignalWithVol(2_000, null, 500)).toBe(500);
    expect(lSignalWithVol(2_000, 1_748, 500)).toBe(1_748);
  });
  it("flags validator", () => {
    expect(growthFlagsOk(0) && growthFlagsOk(1) && growthFlagsOk(3)).toBe(true);
    expect(!growthFlagsOk(2) && !growthFlagsOk(4)).toBe(true);
  });
  it("growthLVolX100: H = 2 * band_max_epoch_slots, no data -> null", () => {
    const cfg = { engineImrBps: 500n, liquidationFeeBps: 50n, bandMaxEpochSlots: 600n };
    expect(growthLVolX100({ volHasData: true, volVarX100: VOL_VAR_SEED_X100 }, cfg)).toBe(1_748);
    expect(growthLVolX100({ volHasData: false, volVarX100: VOL_VAR_SEED_X100 }, cfg)).toBeNull();
  });
});

describe("Rust contlev_curve_unit (continuous leverage, e699d7da; replaces r3_item5_tier_ramp)", () => {
  const th: [bigint, bigint, bigint] = [25_000n, 100_000n, 500_000n];
  const l: [bigint, bigint, bigint, bigint] = [500n, 500n, 1_000n, 2_000n];
  const U64_MAX = (1n << 64n) - 1n;
  it("log2 Q.16: exact integer part, exact at powers of two, null at 0", () => {
    expect(log2Q16(0n)).toBeNull();
    expect(log2Q16(1n)).toBe(0);
    expect(log2Q16(2n)).toBe(1 << 16);
    expect(log2Q16(3n)).toBe(103_872); // floor(log2(3) * 2^16)
    expect(log2Q16(1_024n)).toBe(10 << 16);
    expect(log2Q16(U64_MAX)).toBe(63 * 65_536 + 0xffff);
  });
  it("below anchor 0 (T1 / 4) and past T3: the end values; AT each anchor: exactly the table", () => {
    expect(curveU64(0n, th, l)).toBe(500n);
    expect(curveU64(6_249n, th, l)).toBe(500n);
    expect(curveU64(U64_MAX, th, l)).toBe(2_000n);
    expect(curveU64(25_000n, th, l)).toBe(500n);
    expect(curveU64(100_000n, th, l)).toBe(1_000n);
    expect(curveU64(500_000n, th, l)).toBe(2_000n);
  });
  it("between anchors: log-interpolated (the step table reads 5x / 5x / 10x here)", () => {
    expect(curveU64(50_000n, th, l)).toBe(750n); // half-way in log between $25k and $100k: 7.5x
    expect(curveU64(99_999n, th, l)).toBe(999n);
    expect(curveU64(110_000n, th, l)).toBe(1_059n);
    expect(curveU64(200_000n, th, l)).toBe(1_430n);
  });
  it("κ rises 0.5 -> 1 between T1 / 4 and T1 (no doubling at T1); λ_depth 1.5x at $50k", () => {
    expect(curveU64(6_250n, th, KAPPA_TABLE_BPS)).toBe(5_000n);
    expect(curveU64(10_000n, th, KAPPA_TABLE_BPS)).toBe(6_695n);
    expect(curveU64(24_999n, th, KAPPA_TABLE_BPS)).toBe(9_999n);
    expect(curveU64(25_000n, th, KAPPA_TABLE_BPS)).toBe(10_000n);
    expect(curveU64(50_000n, th, LAMBDA_DEPTH_TABLE_BPS)).toBe(15_000n);
  });
  it("fail closed: saturated next anchor flat at the lower value; non-increasing pair flat; CURVE_POS_FAIL reads t[0]", () => {
    expect(curveU64(U64_MAX - 1n, [25_000n, U64_MAX, U64_MAX], l)).toBe(500n);
    expect(curveU64(U64_MAX, [25_000n, U64_MAX, U64_MAX], l)).toBe(500n);
    expect(curveU64(U64_MAX, [U64_MAX, U64_MAX, U64_MAX], l)).toBe(500n);
    expect(curveU64(150n, [100n, 100n, 1_000n], [1n, 2n, 3n, 4n])).toBe(3n);
    expect(curveValue(CURVE_POS_FAIL, l)).toBe(500n);
    expect(curvePos(1n << 64n, th)).toEqual({ seg: 0xff, num: 0, den: 0 }); // outside u64 (never on chain): fail closed
  });
  it("venue cap: attested (default max tier 1) clamps to the anchor T1 -> exactly L1", () => {
    expect(venueDepthCapped(600_000n, DEPTH_SOURCE.Attested, th, 0)).toBe(25_000n);
    expect(venueDepthCapped(600_000n, DEPTH_SOURCE.Attested, th, 2)).toBe(100_000n);
    expect(venueDepthCapped(20_000n, DEPTH_SOURCE.Attested, th, 1)).toBe(20_000n);
    expect(venueDepthCapped(600_000n, DEPTH_SOURCE.OnChainPool, th, 0)).toBe(600_000n);
    expect(venueDepthCapped(600_000n, DEPTH_SOURCE.Attested, th, 3)).toBe(600_000n);
    expect(venueDepthCapped(600_000n, DEPTH_SOURCE.None, th, 3)).toBe(0n);
  });
  it("the dials: min of the two curves (κ / λ_depth on the LAGGING curve, 21b8ccfd M-1); the venue-only value for the fall-only writer", () => {
    expect(smoothDialsAndVenueL(110_000n, 600_000n, th, [500, 500, 1_000, 2_000])).toEqual({ dials: { lSignalX100: 1_059, kappaBps: 10_000, lambdaDepthBps: 10_592 }, venueLX100: 1_059 });
    expect(smoothDialsAndVenueL(600_000n, 50_000n, th, [500, 500, 1_000, 2_000])).toEqual({ dials: { lSignalX100: 750, kappaBps: 7_500, lambdaDepthBps: 10_000 }, venueLX100: 2_000 });
    expect(smoothDials(110_000n, 600_000n, th, [500, 500, 1_000, 2_000])).toEqual({ lSignalX100: 1_059, kappaBps: 10_000, lambdaDepthBps: 10_592 });
  });
  it("the lagging κ / λ_depth curve (Rust unit test, 21b8ccfd): t[0] up to T1, each step value at the NEXT anchor, top segment [T3, 4·T3)", () => {
    expect(curveLagU64(24_999n, th, KAPPA_TABLE_BPS)).toBe(5_000n);
    expect(curveLagU64(25_000n, th, KAPPA_TABLE_BPS)).toBe(5_000n);
    expect(curveLagU64(50_000n, th, KAPPA_TABLE_BPS)).toBe(7_500n);
    expect(curveLagU64(100_000n, th, KAPPA_TABLE_BPS)).toBe(10_000n);
    expect(curveLagU64(500_000n, th, KAPPA_TABLE_BPS)).toBe(10_000n);
    expect(curveLagU64(1_000_000n, th, KAPPA_TABLE_BPS)).toBe(15_000n);
    expect(curveLagU64(2_000_000n, th, KAPPA_TABLE_BPS)).toBe(20_000n);
    expect(curveLagU64(50_000n, th, LAMBDA_DEPTH_TABLE_BPS)).toBe(10_000n);
    expect(curveLagU64(200_000n, th, LAMBDA_DEPTH_TABLE_BPS)).toBe(14_306n);
    expect(curveLagU64(U64_MAX, th, LAMBDA_DEPTH_TABLE_BPS)).toBe(30_000n);
    // a saturating 4·T3 (T3 > u64::MAX / 4): flat at t[2] past T3, fail closed
    expect(curveLagU64(U64_MAX - 1n, [25_000n, 100_000n, U64_MAX / 2n], KAPPA_TABLE_BPS)).toBe(10_000n);
    expect(curvePosLag(CURVE_POS_FAIL, 1n, th)).toEqual({ seg: 0xff, num: 0, den: 0 });
  });
  it("the step functions are the dials at a tier (n_cap_g8_q == n_cap_g8_q_dials)", () => {
    for (let t = 0; t <= 3; t++) {
      const step = nCapG8Q({ clamp: true, cM: 1_000_000n, lambdaBps: 30_000, tier: t, capDepth: 777n, priceE6: 1_000_000n });
      const dials = nCapG8Q({ clamp: true, cM: 1_000_000n, lambdaBps: 30_000, tier: t, capDepth: 777n, priceE6: 1_000_000n, dials: { kappaBps: kappaDepthBps(t), lambdaDepthBps: lambdaDepthBps(t) } });
      expect(dials, `tier ${t}`).toBe(step);
    }
  });
  it("monotone, within [t[0], t[3]], equal to the step at each anchor (grid)", () => {
    let prev = 0n;
    for (let d = 0n; d <= 700_000n; d += 500n) {
      const v = curveU64(d, th, l);
      expect(v >= l[0] && v <= l[3], `d=${d}`).toBe(true);
      expect(v >= prev, `monotone at ${d}`).toBe(true);
      const tier = depthTierFor(d, th);
      expect(v >= l[tier]!, `never below the step at ${d}`).toBe(true);
      prev = v;
    }
  });
});

describe("Rust r3_item4_window_primitives", () => {
  const b = DEPTH_TW_BUCKET_SLOTS;
  it("no history; first sample; same bucket min; rotation; gap; ring wrap; tokens; validator", () => {
    const w0: DepthWindow = DEPTH_TW_EMPTY;
    expect(depthTwMinAtoms(w0, USD)).toBeNull();
    expect(!depthTwFull(w0) && depthTwWindowOk(w0)).toBe(true);
    let w = depthTwUpdate(w0, 100, 5n);
    expect(w).toEqual({ curTokens: 100, prevTokens: DEPTH_TW_ABSENT, bucketP1: 1 });
    expect(depthTwMinAtoms(w, USD)).toBe(100n * USD);
    expect(depthTwFull(w)).toBe(false);
    w = depthTwUpdate(w, 300, b - 1n);
    expect(w.curTokens).toBe(100);
    w = depthTwUpdate(w, 40, b - 1n);
    expect(w.curTokens).toBe(40);
    w = depthTwUpdate(w, 500, b);
    expect([w.curTokens, w.prevTokens, w.bucketP1]).toEqual([500, 40, 2]);
    expect(depthTwFull(w)).toBe(true);
    expect(depthTwMinAtoms(w, USD)).toBe(40n * USD); // the older bucket's min still binds
    const g = depthTwUpdate(w, 700, 3n * b);
    expect([g.curTokens, g.prevTokens]).toEqual([700, DEPTH_TW_ABSENT]);
    const r = { curTokens: 9, prevTokens: DEPTH_TW_ABSENT, bucketP1: 65_535 };
    const r2 = depthTwUpdate(r, 11, 65_535n * b);
    expect([r2.bucketP1, r2.prevTokens]).toEqual([1, 9]);
    expect(depthTokensFloor(1_999_999n, USD)).toBe(1);
    expect(depthTokensFloor((1n << 64n) - 1n, 1n)).toBe(DEPTH_TW_ABSENT - 1);
    expect(depthTokensFloor(5n, 0n)).toBe(0);
    expect(depthTwWindowOk({ curTokens: 1, prevTokens: 0, bucketP1: 0 })).toBe(false);
    expect(depthTwWindowOk({ curTokens: DEPTH_TW_ABSENT, prevTokens: 0, bucketP1: 3 })).toBe(false);
    expect(depthTwWindowOk({ curTokens: 0, prevTokens: DEPTH_TW_ABSENT, bucketP1: 3 })).toBe(true);
  });
  it("g8_wl2: two same-slot attested pushes from nothing are one sample -> no fresh sample: the window is untouched", () => {
    const empty: DepthState = { depthE6: 0n, depthSlot: 0n, depthPrevE6: 0n, depthSource: 0, lastGoodE6: 0n, lastGoodSlot: 0n, riseSlot64: 0 };
    let s = depthPushUpdate(empty, DEPTH_SOURCE.Attested, 5n * 25_000_000_000n, 20n, (1n << 64n) - 1n, USD);
    s = depthPushUpdate(s, DEPTH_SOURCE.Attested, 5n * 25_000_000_000n, 20n, (1n << 64n) - 1n, USD);
    expect(s.tw).toEqual(DEPTH_TW_EMPTY);
  });
});

describe("Rust g8_target_ceiling_ratchet_and_force_down (stress part, 666df893)", () => {
  const tab = tierLeverage([0, 0, 0], 500, 2_000); // [5x, 5x, 10x, 20x]
  it("graded stress at tier 3 (20x): draw -> L_table(2) 10x; real ADL -> L_table(1) 5x; h-lock -> launch", () => {
    expect(stressCapX100(STRESS_NONE, 3, tab)).toBe(0xffff);
    expect(stressCapX100(STRESS_DRAW, 3, tab)).toBe(1_000);
    expect(stressCapX100(STRESS_ADL, 3, tab)).toBe(500);
    expect(stressCapX100(STRESS_ADL, 1, tab)).toBe(500); // floored at tier 0
    expect(stressCapX100(STRESS_HLOCK, 3, tab)).toBe(500);
    expect(stressLevel(true, false, false)).toBe(STRESS_DRAW);
    expect(stressLevel(true, true, false)).toBe(STRESS_ADL);
    expect(stressLevel(true, true, true)).toBe(STRESS_HLOCK);
    expect(stressLevel(false, false, false)).toBe(STRESS_NONE);
    expect(!realAdl(0, 0) && realAdl(1, 0) && realAdl(0, 2)).toBe(true); // D1(a): A != 1 is not read
  });
  it("F-1 fix A: ceiling in force = min(stored, target) -- down at once", () => {
    expect(ceilingInForceX100(true, 900, 400, 300, 1_000)).toBe(400);
    expect(ceilingInForceX100(true, 900, 850, 300, 1_000)).toBe(850);
    expect(ceilingInForceX100(true, 400, 900, 300, 1_000)).toBe(400);
    expect(targetCeilingX100(true, STRESS_DRAW, 500, 2_000, 2_000, stressCapX100(STRESS_DRAW, 3, tab))).toBe(1_000);
  });
});

describe("layout claims and the legacy (combined-build) record (review F-3)", () => {
  it("offsets are the Rust offset_of! values", () => {
    const F = ASSET_GROWTH_FIELD_OFF;
    expect([F.volVarX100, F.rentStamp64, F.ceilSlot, F.depthTwCur, F.depthTwPrev, F.version, F.flags, ASSET_GROWTH_DEPTH_FIELD_OFF.depthTwBucket]).toEqual([0, 4, 8, 30, 34, 38, 39, 118]);
  });
  it("a record laid out exactly as the combined 153c62fc writes it reads as no volatility data, no rent stamp, no window: launch", () => {
    const b = new Uint8Array(ASSET_GROWTH_LEN);
    const v = new DataView(b.buffer);
    v.setBigUint64(0, 1_000_000_000_000n, true); // c_launch
    v.setUint16(20, 500, true); v.setUint16(22, 2_000, true); v.setUint16(24, 2_000, true); v.setUint32(16, 10_000, true); v.setUint16(28, 3445, true);
    b[38] = 1; b[39] = 0; b[44] = DEPTH_EVER | DEPTH_PREV_REAL | DEPTH_SOURCE.OnChainPool;
    v.setBigUint64(56, 700_000n * USD, true); v.setBigUint64(64, 990n, true); v.setBigUint64(72, 700_000n * USD, true);
    v.setBigUint64(80, 700_000n * USD, true); v.setBigUint64(88, 990n, true);
    const g = decodeAssetGrowthRecordV19(b)!;
    expect([g.r3Layout, g.volHasData, g.volVarX100, g.rentStamp64, g.cLaunchAtoms, g.depthTw]).toEqual([false, false, 0, 0, 1_000_000_000_000n, DEPTH_TW_EMPTY]);
    const view = growthCeilingView(g, 1000, 1_000n, 700_000n * USD, STRESS_NONE, { engineImrBps: 500n, liquidationFeeBps: 50n, bandMaxEpochSlots: 600n });
    // the depth would give 20x, but no volatility data -> the signal is launch: the gate holds 5x until the first push migrates the record
    expect([view.tier, view.lVolX100, view.lSignalX100, view.targetX100, view.ceilingX100]).toEqual([3, null, 500, 500, 500]);
    // flags 0x02 (bit 1 without bit 0) is refused by the program's validator
    expect(growthFlagsOk(0x02)).toBe(false);
  });
});
