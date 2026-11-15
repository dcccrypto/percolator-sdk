/**
 * Continuous leverage / capacity curve: BIT-EXACT parity against the REAL wrapper functions
 * (percolator-prog `feat/v22-continuous-leverage` @ 21b8ccfd "contlev3", `src/growth_v19.rs`: `log2_q16`, `curve_pos`, `curve_value`,
 * `curve_pos_lag`, `curve_lag_u64`, `smooth_dials_and_venue_l`, `stress_cap_x100` + `target_ceiling_x100`, `venue_depth_capped`,
 * `n_cap_g8_q_dials`, `growth_matcher_caps_g8_dials`). 21b8ccfd = the security review's M-1 (κ / λ_depth on a LAGGING curve, never looser
 * than the step) and M-2 (the stress cap is the STEPPED cap at the combined tier); the leverage curve is unchanged from e699d7da / 3198539a.
 *
 * Fixture: test/fixtures/growth-curve-parity.json, emitted by scripts/growth-curve-parity (a crate that depends on the
 * wrapper by path and calls its functions; nothing is re-implemented on the Rust side). Coverage: every anchor, anchor +-1..3,
 * T1/4, the lagging top anchor 4·T3 +-1..3, every power of two +-1, seeded uniform and log-uniform depths in every segment, u64::MAX;
 * 17 threshold configs (incl. saturated, non-increasing, T1 < 4 so anchor 0 is 0, 4·T3 exact / saturating by one / saturated)
 * x 9 tables (L tables, κ, λ_depth, non-monotone, a > 2^32 span). The 100k+ random differential is scripts/growth-curve-diff.ts.
 *
 * Negative controls (in-suite): 3198539a's κ / λ_depth (the leading curve) must FAIL the dial / lag parity; 3198539a's continuous stress
 * cap must FAIL the stressed-target parity; the removed round-3 25% ramp and the round-2 step table must FAIL the leverage curve parity.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CURVE_POS_FAIL,
  KAPPA_TABLE_BPS,
  LAMBDA_DEPTH_TABLE_BPS,
  KAPPA_LAG_TOP_MUL,
  STRESS_DRAW,
  STRESS_ADL,
  combinedTier,
  curveAnchors,
  curveDepthForLeverageX100,
  curveLagU64,
  curvePos,
  curvePosLag,
  curveU64,
  curveValue,
  depthTierFor,
  graduationOn,
  growthMatcherCapsG8,
  stressCapCurveX100,
  stressCapX100,
  targetCeilingX100,
  log2Q16,
  nCapG8Q,
  smoothDials,
  smoothDialsAndVenueL,
  tierRampU64,
  venueDepthCapped,
} from "../src/abi/growth-v19.js";
import type { Triple } from "../src/abi/growth-v19.js";

type Tab = [bigint, bigint, bigint, bigint];
interface Fx {
  meta: { wrapper_commit: string };
  tables: Record<string, string[]>;
  log2: [string, number | null][];
  curve: { name: string; th: string[]; anchors: string[]; cases: (string | number)[][] }[];
  fail_pos: { seg: number; num: number; den: number; values: string[] };
  l_tables: [number, number, number, number][];
  dials: (string | number)[][];
  venue_cap: (string | number)[][];
  ncap: (string | number | null)[][];
  l_params: [[number, number, number], number, number][];
  stress_target: (string | number)[][];
}
const FX = JSON.parse(readFileSync(new URL("./fixtures/growth-curve-parity.json", import.meta.url), "utf8")) as Fx;
const tableNames = Object.keys(FX.tables);
const tables: Tab[] = tableNames.map((n) => (FX.tables[n] as string[]).map((x) => BigInt(x)) as Tab);
const th3 = (xs: string[]): Triple<bigint> => [BigInt(xs[0] as string), BigInt(xs[1] as string), BigInt(xs[2] as string)];
const U64_MAX = (1n << 64n) - 1n;
const NT = 9; // tables per curve row
/** Curve row layout: [d, seg, num, den, value x 9 (leading), lag seg, lag num, lag den, lag value x 9]. */
const LAG0 = 4 + NT;

/** Count curve-value mismatches of `f(d, th, t)` against the Rust values (leading, or `lag` = the lagging columns) over every (config, depth, table). */
function curveMismatches(f: (d: bigint, th: Triple<bigint>, t: Tab) => bigint, lag = false): { n: number; total: number; first: string | null } {
  let n = 0;
  let total = 0;
  let first: string | null = null;
  for (const c of FX.curve) {
    const th = th3(c.th);
    for (const row of c.cases) {
      const d = BigInt(row[0] as string);
      tables.forEach((t, k) => {
        total++;
        const want = BigInt(row[(lag ? LAG0 + 3 : 4) + k] as string);
        const got = f(d, th, t);
        if (got !== want) {
          n++;
          if (first === null) first = `${c.name} d=${d} ${tableNames[k]}: got ${got}, rust ${want}`;
        }
      });
    }
  }
  return { n, total, first };
}

/** 3198539a's dials: κ / λ_depth on the LEADING curve (the negative control of M-1). */
function dials3198539a(v: bigint, b: bigint, th: Triple<bigint>, lt: readonly [number, number, number, number]) {
  const m2 = (t: Tab): number => { const x = curveU64(v, th, t); const y = curveU64(b, th, t); return Number(x < y ? x : y); };
  return { lSignalX100: smoothDials(v, b, th, lt).lSignalX100, kappaBps: m2(KAPPA_TABLE_BPS as Tab), lambdaDepthBps: m2(LAMBDA_DEPTH_TABLE_BPS as Tab) };
}

/** The stressed target as growth_ceiling_x100 composes it, with a pluggable stress cap (row: [ci, li, v, b, tier, (cap, target) x 5]). */
function stressTargetMismatches(cap: (st: number, tier: number, v: bigint, b: bigint, th: Triple<bigint>, lt: readonly [number, number, number, number]) => number, levels: number[]) {
  let n = 0;
  let total = 0;
  let first = "";
  for (const r of FX.stress_target) {
    const th = th3(FX.curve[r[0] as number]!.th);
    const lt = FX.l_tables[r[1] as number]!;
    const [, la, ltier] = FX.l_params[r[1] as number]!;
    const v = BigInt(r[2] as string);
    const b = BigInt(r[3] as string);
    const tier = combinedTier(depthTierFor(v, th), depthTierFor(b, th));
    if (tier !== r[4]) { n++; if (!first) first = `tier v=${v} b=${b}: ${tier} vs ${r[4]}`; continue; }
    const d = smoothDials(v, b, th, lt);
    for (const st of levels) {
      total++;
      const c = cap(st, tier, v, b, th, lt);
      const t = targetCeilingX100(graduationOn(true, 64, tier), st, la, ltier, d.lSignalX100, c);
      if (c !== r[5 + 2 * st] || t !== r[6 + 2 * st]) { n++; if (!first) first = `cfg ${r[0]} v=${v} b=${b} s=${st}: cap ${c} / target ${t} vs ${r[5 + 2 * st]} / ${r[6 + 2 * st]}`; }
    }
  }
  return { n, total, first };
}

describe("growth curve parity (wrapper 21b8ccfd, contlev3)", () => {
  it("pins the wrapper commit the fixture came from", () => {
    expect(FX.meta.wrapper_commit).toBe("21b8ccfd");
  });

  it("log2Q16 equals log2_q16 at every probed input", () => {
    expect(FX.log2.length).toBeGreaterThan(3_000);
    let bad = 0;
    for (const [x, want] of FX.log2) if (log2Q16(BigInt(x)) !== want) bad++;
    expect(bad).toBe(0);
    expect(log2Q16(0n)).toBeNull();
    expect(log2Q16(1n << 64n)).toBeNull(); // outside u64: fail closed
    expect(log2Q16(-1n)).toBeNull();
  });

  it("fixture covers every anchor, anchor +-1 and T1/4 of every config", () => {
    for (const c of FX.curve) {
      const ds = new Set(c.cases.map((r) => r[0] as string));
      const a = curveAnchors(th3(c.th));
      expect(a.map(String)).toEqual(c.anchors);
      const th = th3(c.th);
      const lagTop = th[2] * KAPPA_LAG_TOP_MUL > U64_MAX ? U64_MAX : th[2] * KAPPA_LAG_TOP_MUL;
      for (const x of [...a, lagTop]) {
        for (const dl of [-1n, 0n, 1n]) {
          const y = x + dl;
          if (y >= 0n && y <= U64_MAX) expect(ds.has(y.toString()), `${c.name} missing ${y}`).toBe(true);
        }
      }
    }
    expect(FX.curve.reduce((s, c) => s + c.cases.length, 0)).toBeGreaterThan(12_000);
    expect(FX.curve.length).toBe(17);
  });

  it("curvePos equals curve_pos (seg, num, den) at every depth of every config", () => {
    let bad = 0;
    let first = "";
    for (const c of FX.curve) {
      const th = th3(c.th);
      for (const r of c.cases) {
        const p = curvePos(BigInt(r[0] as string), th);
        if (p.seg !== r[1] || p.num !== r[2] || p.den !== r[3]) {
          bad++;
          if (!first) first = `${c.name} d=${r[0]}: ${JSON.stringify(p)} vs ${r.slice(1, 4)}`;
        }
      }
    }
    expect(first).toBe("");
    expect(bad).toBe(0);
  });

  it("curveU64 equals curve_value for all 9 tables (L, κ, λ_depth, non-monotone, wide span)", () => {
    const r = curveMismatches((d, th, t) => curveU64(d, th, t));
    expect(r.first).toBeNull();
    expect(r.n).toBe(0);
    expect(r.total).toBeGreaterThan(80_000);
  });

  it("curvePosLag equals curve_pos_lag (seg, num, den) at every depth of every config (κ / λ_depth position, review M-1)", () => {
    let bad = 0;
    let first = "";
    const segs = new Set<number>();
    for (const c of FX.curve) {
      const th = th3(c.th);
      for (const r of c.cases) {
        const d = BigInt(r[0] as string);
        const q = curvePosLag(curvePos(d, th), d, th);
        segs.add(q.seg);
        if (q.seg !== r[LAG0] || q.num !== r[LAG0 + 1] || q.den !== r[LAG0 + 2]) {
          bad++;
          if (!first) first = `${c.name} d=${d}: ${JSON.stringify(q)} vs ${r.slice(LAG0, LAG0 + 3)}`;
        }
      }
    }
    expect(first).toBe("");
    expect(bad).toBe(0);
    expect([...segs].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4]); // every lag segment reached
  });

  it("curveLagU64 equals curve_lag_u64 for all 9 tables", () => {
    const r = curveMismatches((d, th, t) => curveLagU64(d, th, t), true);
    expect(r.first).toBeNull();
    expect(r.n).toBe(0);
    expect(r.total).toBeGreaterThan(110_000);
  });

  it("the lagging κ / λ_depth are never looser than the round-2 step (review M-1) at every fixture depth", () => {
    let n = 0;
    for (const c of FX.curve) {
      const th = th3(c.th);
      for (const r of c.cases) {
        const d = BigInt(r[0] as string);
        const tier = depthTierFor(d, th);
        for (const t of [KAPPA_TABLE_BPS, LAMBDA_DEPTH_TABLE_BPS]) {
          n++;
          expect(curveLagU64(d, th, t) <= (t[tier] as bigint), `${c.name} d=${d}`).toBe(true);
        }
      }
    }
    expect(n).toBeGreaterThan(24_000);
  });

  it("CURVE_POS_FAIL reads t[0] for every table", () => {
    const f = curvePosLag(CURVE_POS_FAIL, 1n, [100n, 200n, 300n]);
    expect([f.seg, f.num, f.den]).toEqual([CURVE_POS_FAIL.seg, CURVE_POS_FAIL.num, CURVE_POS_FAIL.den]);
    expect([CURVE_POS_FAIL.seg, CURVE_POS_FAIL.num, CURVE_POS_FAIL.den]).toEqual([FX.fail_pos.seg, FX.fail_pos.num, FX.fail_pos.den]);
    expect(tables.map((t) => curveValue(CURVE_POS_FAIL, t).toString())).toEqual(FX.fail_pos.values);
  });

  it("smoothDials / smoothDialsAndVenueL equal smooth_dials_and_venue_l at every (venue, book) pair (κ / λ_depth lagging)", () => {
    let bad = 0;
    let first = "";
    for (const r of FX.dials) {
      const th = th3(FX.curve[r[0] as number]!.th);
      const lt = FX.l_tables[r[1] as number]!;
      const v = BigInt(r[2] as string);
      const b = BigInt(r[3] as string);
      const want = { lSignalX100: r[4], kappaBps: r[5], lambdaDepthBps: r[6] };
      const got = smoothDials(v, b, th, lt);
      const both = smoothDialsAndVenueL(v, b, th, lt);
      if (JSON.stringify(got) !== JSON.stringify(want) || JSON.stringify(both.dials) !== JSON.stringify(want) || both.venueLX100 !== r[7]) {
        bad++;
        if (!first) first = `v=${v} b=${b}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`;
      }
    }
    expect(FX.dials.length).toBeGreaterThan(2_000);
    expect(first).toBe("");
    expect(bad).toBe(0);
  });

  it("venueDepthCapped equals venue_depth_capped (attested cap = the anchor T_m)", () => {
    let bad = 0;
    for (const r of FX.venue_cap) {
      const th = th3(FX.curve[r[0] as number]!.th);
      if (venueDepthCapped(BigInt(r[3] as string), r[1] as number, th, r[2] as number).toString() !== r[4]) bad++;
    }
    expect(FX.venue_cap.length).toBeGreaterThan(500);
    expect(bad).toBe(0);
  });

  it("nCapG8Q / growthMatcherCapsG8 at the curve dials equal n_cap_g8_q_dials / growth_matcher_caps_g8_dials", () => {
    let bad = 0;
    for (const r of FX.ncap) {
      const th = th3(FX.curve[r[0] as number]!.th);
      const lt = FX.l_tables[r[1] as number]!;
      const d = smoothDials(BigInt(r[2] as string), BigInt(r[3] as string), th, lt);
      const base = {
        clamp: true, cM: BigInt(r[4] as string), lambdaBps: r[5] as number, tier: 0,
        capDepth: r[6] === null ? null : BigInt(r[6] as string), priceE6: BigInt(r[7] as string), dials: d,
      };
      const n = nCapG8Q(base);
      const caps = growthMatcherCapsG8({ ...base, hlockActive: false });
      if ((n === null ? null : n.toString()) !== r[8] || caps.inventoryCapQ.toString() !== r[9] || caps.liquidityNotionalE6.toString() !== r[10]) bad++;
    }
    expect(FX.ncap.length).toBeGreaterThan(500);
    expect(bad).toBe(0);
  });

  it("matches the wrapper's contlev_ledger_curve_table (21b8ccfd: κ / λ_depth lagging; default thresholds, 6 decimals, 5x/10x/20x)", () => {
    const th: Triple<bigint> = [25_000_000_000n, 100_000_000_000n, 500_000_000_000n];
    const usd = (x: number): bigint => BigInt(x) * 1_000_000n;
    const L: Tab = [500n, 500n, 1_000n, 2_000n];
    const rows: [number, number, number, number][] = [
      [5_000, 500, 5_000, 10_000],
      [10_000, 500, 5_000, 10_000],
      [20_000, 500, 5_000, 10_000],
      [24_999, 500, 5_000, 10_000],
      [25_000, 500, 5_000, 10_000],
      [40_000, 669, 6_695, 10_000],
      [50_000, 750, 7_500, 10_000],
      [75_000, 896, 8_962, 10_000],
      [100_000, 1_000, 10_000, 10_000],
      [200_000, 1_430, 10_000, 14_306],
      [300_000, 1_682, 10_000, 16_826],
      [500_000, 2_000, 10_000, 20_000],
      [1_000_000, 2_000, 15_000, 25_000],
      [2_000_000, 2_000, 20_000, 30_000],
      [5_000_000, 2_000, 20_000, 30_000],
    ];
    for (const [x, lx, k, lam] of rows) {
      const d = usd(x);
      expect([curveU64(d, th, L), curveLagU64(d, th, KAPPA_TABLE_BPS), curveLagU64(d, th, LAMBDA_DEPTH_TABLE_BPS)].map(Number), `$${x}`).toEqual([lx, k, lam]);
      const dl = smoothDials(d, d, th, [500, 500, 1_000, 2_000]);
      expect([dl.lSignalX100, dl.kappaBps, dl.lambdaDepthBps], `dials at $${x}`).toEqual([lx, k, lam]);
    }
    // the wrapper unit test (growth_v19.rs tests): the saturating 4·T3 is flat at t[2]
    expect(curveLagU64(U64_MAX - 1n, [25_000n, 100_000n, U64_MAX / 2n], KAPPA_TABLE_BPS)).toBe(10_000n);
    expect(curveLagU64(U64_MAX, th, LAMBDA_DEPTH_TABLE_BPS)).toBe(30_000n);
  });

  it("curveDepthForLeverageX100 returns the smallest depth the bit-exact curve reaches", () => {
    const th: Triple<bigint> = [25_000_000_000n, 100_000_000_000n, 500_000_000_000n];
    const lt: [number, number, number, number] = [500, 500, 1_000, 2_000];
    const L: Tab = [500n, 500n, 1_000n, 2_000n];
    for (const x of [501, 600, 669, 750, 896, 999, 1_000, 1_001, 1_430, 1_999, 2_000]) {
      const d = curveDepthForLeverageX100(x, th, lt)!;
      expect(curveU64(d, th, L) >= BigInt(x)).toBe(true);
      expect(curveU64(d - 1n, th, L) < BigInt(x)).toBe(true);
    }
    expect(curveDepthForLeverageX100(500, th, lt)).toBe(0n);
    expect(curveDepthForLeverageX100(2_001, th, lt)).toBeNull();
    // 7.5x is first reached a hair below $50k (Q.16 log2 granularity): 49,999.642592 tokens
    expect(curveDepthForLeverageX100(750, th, lt)).toBe(49_999_642_592n);
  });

  it("the stressed target equals growth_ceiling_x100's composition with the STEPPED stress_cap_x100 at the combined tier (review M-2)", () => {
    const r = stressTargetMismatches((st, tier, _v, _b, _th, lt) => stressCapX100(st, tier, lt), [0, 1, 2, 3, 4]);
    expect(r.first).toBe("");
    expect(r.n).toBe(0);
    expect(r.total).toBeGreaterThan(25_000);
    expect(FX.stress_target.length).toBeGreaterThan(5_000);
  });

  it("NEGATIVE CONTROL (M-2): 3198539a's continuous stress cap at the signal position FAILS the stressed-target parity", () => {
    const cont = (st: number, _tier: number, v: bigint, b: bigint, th: Triple<bigint>, lt: readonly [number, number, number, number]): number =>
      stressCapCurveX100(st, v <= b ? curvePos(v, th) : curvePos(b, th), lt);
    const r = stressTargetMismatches(cont, [STRESS_DRAW, STRESS_ADL]);
    expect(r.n).toBeGreaterThan(500);
    // $200k under a draw on the default table: 3198539a read 7.15x, the program now 5x
    const th: Triple<bigint> = [25_000_000_000n, 100_000_000_000n, 500_000_000_000n];
    expect(stressCapCurveX100(STRESS_DRAW, curvePos(200_000_000_000n, th), [500, 500, 1_000, 2_000])).toBe(715);
    expect(stressCapX100(STRESS_DRAW, depthTierFor(200_000_000_000n, th), [500, 500, 1_000, 2_000])).toBe(500);
  });

  it("NEGATIVE CONTROL (M-1): 3198539a's κ / λ_depth (the leading curve) FAIL the dial and lag parity", () => {
    let bad = 0;
    for (const r of FX.dials) {
      const th = th3(FX.curve[r[0] as number]!.th);
      const o = dials3198539a(BigInt(r[2] as string), BigInt(r[3] as string), th, FX.l_tables[r[1] as number]!);
      if (o.kappaBps !== r[5] || o.lambdaDepthBps !== r[6]) bad++;
    }
    expect(bad).toBeGreaterThan(1_000);
    const lead = curveMismatches((d, th, t) => curveU64(d, th, t), true);
    expect(lead.n).toBeGreaterThan(20_000);
  });

  it("NEGATIVE CONTROL: the removed 25% ramp and the round-2 step table FAIL the same parity check", () => {
    const ramp = curveMismatches((d, th, t) => tierRampU64(d, th, t));
    const step = curveMismatches((d, th, t) => t[depthTierFor(d, th)] as bigint);
    // a stale mirror disagrees with the program at a large share of the probed points
    expect(ramp.n).toBeGreaterThan(10_000);
    expect(step.n).toBeGreaterThan(10_000);
    // and at the founder's example: $50k on the default table is 7.5x on chain, 5x on the old mirrors
    const th: Triple<bigint> = [25_000_000_000n, 100_000_000_000n, 500_000_000_000n];
    const L: Tab = [500n, 500n, 1_000n, 2_000n];
    expect(curveU64(50_000_000_000n, th, L)).toBe(750n);
    expect(tierRampU64(50_000_000_000n, th, L)).toBe(500n);
  });
});
