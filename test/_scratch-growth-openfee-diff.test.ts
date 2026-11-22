/**
 * SCRATCH differential (J-20261122-SDK-DIFF-REPORT-GROWTHOPENFEERC23): the growth utilisation fee charged on opens.
 *
 * SDK:  src/abi/growth-v19.ts @ 26de9204 -- usersSideOiQ :3053, utilisationFeeBps :3075, utilFeeMaxEffectiveBps :3096,
 *       openingPartQ :3112, previewGrowthOpenFee :3153.
 * Rust: percolator-prog feat/v22-rc23-2026-10-22 @ bc657392 (git show only, no cargo):
 *   src/growth_v19.rs
 *     :243  mul_div_ceil_u128                 :252  n_cap_q (floor)
 *     :562  taker_strictly_reduces            :570  taker_flips
 *     :599  users_side_oi_q (saturating)      :680  util_fee_max_effective_bps
 *     :693  utilisation_fee_bps (ceil, cap)   :718  opening_part_q
 *     :731  util_fee_on_fill_bps (floor, min(x, fee))
 *     :2288 n_cap_g8_q_dials                  :2311 depth_cap_q_kappa
 *     :628  growth_leg_reduce_class (single TradeCpi clips a flip to its close)
 *   src/v16_program.rs
 *     :47900 growth_util_fee_for_fill_bps     :48020 growth_leg_reduce_class call (growth_open only for open/grow/batch flip)
 *     :48056-48113 GrowthUtilIn: users = users_side_oi_q(oi side of SIZE sign), n_cap = growth_clip_n_cap_view (G8, :45732)
 *     :20337-20353 util fee priced on ret.exec_size and added to requested_fee_bps (LP credit channel)
 *     :18536 batch_leg_fee: ceil(ceil(|q|*P/POS_SCALE) * bps / 1e4)   :18261 engine fee_bps = base + requested(+util)
 *     :47446 single_trade_accrue_fee_split_view: LP credit = engine fee - batch_leg_fee(base)
 */
import { describe, it, expect } from "vitest";
import {
  ASSET_GROWTH_LEN, decodeAssetGrowthRecordV19, DEPTH_SOURCE, DEPTH_EVER, DEPTH_PREV_REAL,
  usersSideOiQ, utilisationFeeBps, utilFeeMaxEffectiveBps, openingPartQ, previewGrowthOpenFee,
  growthCeilingView, quoteMaxLeverage, conservativeEquity, nCapQ, stressLevel, realAdl,
} from "../src/index.js";
import type { AssetGrowthV19, QuoteMaxLeverageInput } from "../src/index.js";

// ── Rust port ───────────────────────────────────────────────────────────────────────────────
const BPS = 10_000n;
const U128 = (1n << 128n) - 1n;
const POS_SCALE = 1_000_000n;
const DEFAULT_LAMBDA_BPS = 10_000;
const abs = (x: bigint) => (x < 0n ? -x : x);
const chk = (x: bigint): bigint | null => (x > U128 ? null : x); // checked_mul
/** growth_v19.rs:243 */
function rsMulDivCeil(a: bigint, b: bigint, d: bigint): bigint | null {
  if (d === 0n) return null;
  const p = chk(a * b);
  if (p === null) return null;
  return (p + d - 1n) / d;
}
/** growth_v19.rs:252 */
function rsNCapQ(cM: bigint, lam: number, price: bigint, ps: bigint): bigint | null {
  if (price === 0n) return null;
  const a = chk(cM * BigInt(lam)); if (a === null) return null;
  const n = chk(a * ps); if (n === null) return null;
  return n / (BPS * price);
}
/** growth_v19.rs:2311 */
function rsDepthCapQKappa(kappa: number, cap: bigint | null, price: bigint, ps: bigint): bigint {
  if (cap === null) return U128;
  return rsNCapQ((cap * BigInt(kappa)) / BPS, DEFAULT_LAMBDA_BPS, price, ps) ?? 0n;
}
/** growth_v19.rs:2288 */
function rsNCapG8Dials(clamp: boolean, cM: bigint, lam: number, lamD: number, kappa: number, cap: bigint | null, price: bigint, ps: bigint): bigint | null {
  if (!clamp) return rsNCapQ(cM, lam, price, ps);
  const n = rsNCapQ(cM, lam < lamD ? lam : lamD, price, ps);
  if (n === null) return null;
  const d = rsDepthCapQKappa(kappa, cap, price, ps);
  return n < d ? n : d;
}
/** growth_v19.rs:562 */
const rsReduces = (b: bigint, a: bigint) => a === 0n || (b !== 0n && (b > 0n) === (a > 0n) && abs(a) <= abs(b));
/** growth_v19.rs:570 */
const rsFlips = (b: bigint, a: bigint) => b !== 0n && a !== 0n && (b > 0n) !== (a > 0n);
/** growth_v19.rs:599 */
function rsUsersSideOi(oi: bigint, lp: bigint, long: boolean): bigint {
  const on = long ? lp > 0n : lp < 0n;
  if (!on) return oi;
  return oi > abs(lp) ? oi - abs(lp) : 0n;
}
/** growth_v19.rs:680 */
const rsUtilMaxEff = (s: number) => (s === 0 ? 500 : s);
/** growth_v19.rs:693 (u16 args) */
function rsUtilFeeBps(after: bigint, nCap: bigint, kink: number, max: number): number | null {
  if (nCap === 0n || BigInt(kink) > BPS) return null;
  const lhs = chk(after * BPS); if (lhs === null) return null;
  const rhs = chk(BigInt(kink) * nCap); if (rhs === null) return null;
  if (lhs <= rhs || max === 0) return 0;
  const den = chk(nCap * (BPS - BigInt(kink))); if (den === null) return null;
  const fee = rsMulDivCeil(BigInt(max), lhs - rhs, den); if (fee === null) return null;
  return fee > BigInt(max) ? max : Number(fee);
}
/** growth_v19.rs:718 */
function rsOpening(b: bigint, a: bigint): bigint {
  if (rsReduces(b, a)) return 0n;
  if (rsFlips(b, a)) return abs(a);
  return abs(a - b);
}
/** growth_v19.rs:731 (floor; vault_lp_v18::mul_div_floor) */
function rsOnFill(fee: number, o: bigint, fill: bigint): number {
  if (fill === 0n || o === 0n || fee === 0) return 0;
  const oo = o > fill ? fill : o;
  const x = (BigInt(fee) * oo) / fill;
  return Number(x < BigInt(fee) ? x : BigInt(fee));
}
interface UtilIn { usersBefore: bigint; nCap: bigint; kink: number; max: number; takerBefore: bigint }
/** v16_program.rs:47900 growth_util_fee_for_fill_bps */
function rsUtilForFill(u: UtilIn, exec: bigint): number {
  const after = u.takerBefore + exec;
  const opening = rsOpening(u.takerBefore, after);
  const usersAfter = u.usersBefore + opening;
  const fee = rsUtilFeeBps(usersAfter, u.nCap, u.kink, u.max) ?? 0;
  return rsOnFill(fee, opening, abs(exec));
}
/** v16_program.rs:18536 batch_leg_fee */
function rsBatchLegFee(q: bigint, price: bigint, bps: bigint): bigint {
  if (q === 0n || bps === 0n) return 0n;
  const p = q * price;
  const n = p / POS_SCALE + (p % POS_SCALE !== 0n ? 1n : 0n);
  if (n === 0n) return 0n;
  const f = n * bps;
  return f / BPS + (f % BPS !== 0n ? 1n : 0n);
}
/** LP credit (atoms) of the util fee: engine fee at base+util minus batch_leg_fee(base) (:18261, :47446; matcher request 0). */
const utilAtoms = (q: bigint, price: bigint, base: bigint, util: number) =>
  util === 0 ? 0n : rsBatchLegFee(q, price, base + BigInt(util)) - rsBatchLegFee(q, price, base);

/** The N_cap the wrapper prices with (growth_clip_n_cap_view -> n_cap_g8_q_dials), ctx taken from the SDK view (ctx port is out of scope). */
function rsNCapForInput(i: QuoteMaxLeverageInput): bigint {
  const g = i.growth!;
  const cM = conservativeEquity(i.lpCapital, i.lpPnl, i.lpFeeCredits);
  const v = i.v22;
  if (!v) return rsNCapQ(cM, g.lambdaBps, i.priceE6, i.posScale ?? POS_SCALE) ?? 0n; // off clamp: growth-1 exactly
  const stress = stressLevel(v.drawOutstanding === true, realAdl(v.modeLong ?? 0, v.modeShort ?? 0), i.bankruptcyHlockActive);
  const view = growthCeilingView(g, v.bandBps, v.nowSlot, cM, stress, v.vol ? { engineImrBps: i.engineImrBps, liquidationFeeBps: v.vol.liquidationFeeBps, bandMaxEpochSlots: v.vol.bandMaxEpochSlots } : undefined, { rc23Caps: v.rc23Caps !== false });
  return rsNCapG8Dials(view.clampEnforced, cM, g.lambdaBps, view.dials.lambdaDepthBps, view.dials.kappaBps, view.capDepthE6, i.priceE6, i.posScale ?? POS_SCALE) ?? 0n;
}

type Route = "trade" | "batch";
/** What the wrapper CHARGES (bps on the whole fill) for one TradeCpi / BatchTradeCpi leg. `refused` = batch 99. */
let gated = 0;
function rsCharged(i: QuoteMaxLeverageInput, takerBefore: bigint, size: bigint, route: Route): { bps: number; exec: bigint; refused: boolean; gated?: boolean } {
  const g = i.growth;
  if (g === null || !i.assetBound) return { bps: 0, exec: size, refused: false };
  const after = takerBefore + size;
  // :628 growth_leg_reduce_class
  if (size !== 0n && rsReduces(takerBefore, after)) return { bps: 0, exec: size, refused: false };
  if (route === "trade" && rsFlips(takerBefore, after)) return { bps: 0, exec: -takerBefore, refused: false }; // clipped to the close
  const long = size > 0n; // :48077
  const users = rsUsersSideOi(long ? i.oiEffLongQ : i.oiEffShortQ, i.lpEffectivePositionQ, long);
  const u: UtilIn = { usersBefore: users, nCap: rsNCapForInput(i), kink: g.kinkBps, max: rsUtilMaxEff(g.utilFeeMaxBps), takerBefore };
  // N-1 (:48051-48093): TradeCpi clips the open to the users-OI room under N_cap and the post-fill gate refuses OI_users > N_cap;
  // a request beyond the room is not charged as requested -> excluded (counted as `gated`).
  if (users + rsOpening(takerBefore, after) > u.nCap) { gated++; return { bps: 0, exec: 0n, refused: true, gated: true }; }
  const bps = rsUtilForFill(u, size);
  if (route === "batch" && bps !== 0) return { bps, exec: size, refused: true };
  return { bps, exec: size, refused: false };
}

// ── fixtures ───────────────────────────────────────────────────────────────────────────────
const M = 1_000_000n;
function rec(o: { lambda?: number; kink?: number; utilMax?: number; rGap?: number; depthUsd?: bigint } = {}): AssetGrowthV19 {
  const b = new Uint8Array(ASSET_GROWTH_LEN);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0, true); b[39] = 0x03;
  v.setUint32(16, o.lambda ?? 10_000, true);
  v.setUint16(20, 500, true); v.setUint16(22, 2_000, true); v.setUint16(24, 500, true);
  v.setUint16(26, 5_000, true);
  v.setUint16(28, o.rGap ?? 3445, true);
  b[38] = 1;
  if (o.depthUsd !== undefined) {
    b[44] = DEPTH_SOURCE.OnChainPool | DEPTH_EVER | DEPTH_PREV_REAL;
    const d = o.depthUsd * M;
    v.setBigUint64(56, d, true); v.setBigUint64(64, 990n, true); v.setBigUint64(72, d, true); v.setBigUint64(80, d, true); v.setBigUint64(88, 990n, true);
  }
  b[46] = 7;
  const g = decodeAssetGrowthRecordV19(b)!;
  return { ...g, kinkBps: o.kink ?? 5_000, utilFeeMaxBps: o.utilMax ?? 0 };
}
function inp(g: AssetGrowthV19 | null, o: Partial<QuoteMaxLeverageInput> & { clamp?: boolean } = {}): QuoteMaxLeverageInput {
  const { clamp, ...rest } = o;
  return {
    engineImrBps: 500n, growth: g, lpCapital: 1_000n * M, lpPnl: 0n, lpFeeCredits: 0n, lpEffectivePositionQ: 0n, assetBound: true,
    oiEffLongQ: 0n, oiEffShortQ: 0n, priceE6: M, bankruptcyHlockActive: false,
    ...(clamp ? { v22: { bandBps: 1_000, nowSlot: 1_000n, vol: { liquidationFeeBps: 0n, bandMaxEpochSlots: 600n } } } : {}),
    ...rest,
  };
}

interface Mismatch { name: string; sdk: number; rust: number; sdkAtoms: bigint; rustAtoms: bigint; dir: "preview<charged" | "preview>charged" }
function diff(name: string, i: QuoteMaxLeverageInput, takerBefore: bigint, size: bigint, route: Route, base = 30n): Mismatch | null {
  const r = rsCharged(i, takerBefore, size, route);
  if (r.gated) return null;
  let p: ReturnType<typeof previewGrowthOpenFee>;
  try { p = previewGrowthOpenFee(i, takerBefore, size, base); } catch (e) {
    return { name: `${name} [SDK THROWS ${(e as Error).name}]`, sdk: -1, rust: r.bps, sdkAtoms: -1n, rustAtoms: 0n, dir: "preview>charged" };
  }
  if (r.refused) {
    // batch: the wrapper refuses any leg with a util fee; the SDK must say batchAllowed=false
    return p.batchAllowed ? { name: `${name} [batch refused, SDK batchAllowed]`, sdk: p.utilFeeBps, rust: r.bps, sdkAtoms: 0n, rustAtoms: 0n, dir: "preview<charged" } : null;
  }
  if (p.utilFeeBps === r.bps) return null;
  return {
    name, sdk: p.utilFeeBps, rust: r.bps,
    sdkAtoms: utilAtoms(abs(size), i.priceE6, base, p.utilFeeBps), rustAtoms: utilAtoms(abs(r.exec), i.priceE6, base, r.bps),
    dir: p.utilFeeBps < r.bps ? "preview<charged" : "preview>charged",
  };
}

// deterministic PRNG
function rng(seed: number) {
  let s = BigInt(seed) | 1n;
  const next = () => { s ^= s << 13n; s &= (1n << 64n) - 1n; s ^= s >> 7n; s ^= s << 17n; s &= (1n << 64n) - 1n; return s; };
  return { big: (max: bigint) => (max <= 0n ? 0n : next() % (max + 1n)), int: (max: number) => Number(next() % BigInt(max + 1)), pick: <T>(a: readonly T[]) => a[Number(next() % BigInt(a.length))]! };
}

const report: string[] = [];
const log = (s: string) => { report.push(s); };

// ── 1. function-level ports ────────────────────────────────────────────────────────────────
describe("function-level: SDK == Rust", () => {
  it("utilisationFeeBps grid (OI 0, kink, kink±1, n_cap, above, n_cap 0; kink 0/10000; max 0/stored/u16::MAX)", () => {
    let n = 0, mm = 0;
    for (const nCap of [0n, 1n, 7n, 10_000n, 1_000_003n, 10n ** 18n]) for (const kink of [0, 1, 5_000, 9_999, 10_000, 10_001]) for (const max of [0, 1, 150, 500, 2_000, 65_535]) {
      const kq = (BigInt(kink) * nCap) / BPS;
      for (const oi of [0n, kq > 0n ? kq - 1n : 0n, kq, kq + 1n, nCap > 0n ? nCap - 1n : 0n, nCap, nCap + 1n, 2n * nCap + 5n]) {
        n++;
        let sdk: number | null | string;
        try { sdk = utilisationFeeBps(oi, nCap, kink, max); } catch (e) { sdk = `throw ${(e as Error).name}`; }
        if (sdk !== rsUtilFeeBps(oi, nCap, kink, max)) { mm++; if (mm <= 5) log(`utilFee mismatch oi=${oi} n=${nCap} k=${kink} m=${max}: sdk ${sdk} rust ${rsUtilFeeBps(oi, nCap, kink, max)}`); }
      }
    }
    log(`utilisationFeeBps grid: ${n} cases, ${mm} mismatches`);
  });
  it("utilFeeMaxEffectiveBps 0..u16::MAX", () => {
    let mm = 0;
    for (let s = 0; s <= 65_535; s++) if (utilFeeMaxEffectiveBps(s) !== rsUtilMaxEff(s)) mm++;
    log(`utilFeeMaxEffectiveBps: 65536 cases, ${mm} mismatches`);
    expect(mm).toBe(0);
  });
  it("openingPartQ: open, grow, reduce, close, flip both ways, zero", () => {
    const cases: [bigint, bigint][] = [[0n, 5n], [0n, -5n], [3n, 8n], [-3n, -8n], [8n, 3n], [-8n, -3n], [8n, 0n], [-8n, 0n], [-100n, 50n], [100n, -50n], [100n, -100n], [0n, 0n], [5n, 5n]];
    for (const [b, a] of cases) expect(openingPartQ(b, a), `${b}->${a}`).toBe(rsOpening(b, a));
    log(`openingPartQ grid: ${cases.length} cases, 0 mismatches`);
  });
  it("usersSideOiQ incl. vault-LP inventory larger than OI", () => {
    const cases: [bigint, bigint][] = [[0n, 0n], [100n, 40n], [100n, -40n], [100n, 100n], [100n, 250n], [100n, -250n], [0n, 5n]];
    for (const [oi, lp] of cases) for (const long of [true, false]) expect(usersSideOiQ(oi, lp, long)).toBe(rsUsersSideOi(oi, lp, long));
    log(`usersSideOiQ grid: ${cases.length * 2} cases, 0 mismatches (LP > OI saturates to 0 on both)`);
  });
  it("rounding directions (Rust): fee bps CEIL, fill rate FLOOR, atoms CEIL", () => {
    // ceil: 1 bps over the kink of n=3 at max 1 -> ceil(1*(30000-15000)/(3*5000)) = 1, exact rational 1.0; n=7: (7*1e4-35000)/(7*5000)=1 -> ...
    expect(rsUtilFeeBps(6n, 10n, 5_000, 3)).toBe(1); // 3*10000/50000 = 0.6 -> 1 (ceil)
    expect(utilisationFeeBps(6n, 10n, 5_000, 3)).toBe(1);
    expect(rsOnFill(3, 1n, 2n)).toBe(1); // 1.5 -> 1 (floor, taker's favour)
    expect(rsBatchLegFee(1n, 1n, 1n)).toBe(1n); // tiny notional -> 1 atom (ceil)
  });
});

// ── 2. end-to-end: previewGrowthOpenFee vs the wrapper's charge ─────────────────────────────
const mismatches: Mismatch[] = [];
const record = (m: Mismatch | null) => { if (m) mismatches.push(m); };

describe("previewGrowthOpenFee vs wrapper charge (TradeCpi / BatchTradeCpi)", () => {
  it("grid off the clamp (growth-1 N_cap): opens/grows agree; flips differ by route", () => {
    const nCap = 1_000n * M; // cM 1000e6, λ 1x, P 1
    const before = mismatches.length;
    for (const kink of [0, 5_000, 10_000]) for (const utilMax of [0, 150, 2_000, 65_535]) {
      const g = rec({ kink, utilMax });
      const kq = (BigInt(kink) * nCap) / BPS;
      for (const oi of [0n, kq > 0n ? kq - 1n : 0n, kq, kq + 1n, nCap - 1n, nCap, nCap + 1n]) for (const lp of [0n, -oi, -(oi + 5n * M)]) {
        const i = inp(g, { oiEffLongQ: oi, lpEffectivePositionQ: lp });
        for (const route of ["trade", "batch"] as const) {
          record(diff(`open k=${kink} m=${utilMax} oi=${oi} lp=${lp} ${route}`, i, 0n, 10n * M, route));
          record(diff(`grow k=${kink} m=${utilMax} oi=${oi} ${route}`, i, 5n * M, 1n, route));
          record(diff(`reduce k=${kink} ${route}`, i, 5n * M, -2n * M, route));
          record(diff(`close k=${kink} ${route}`, i, 5n * M, -5n * M, route));
          record(diff(`flip short->long k=${kink} m=${utilMax} oi=${oi} ${route}`, i, -3n * M, 13n * M, route));
        }
      }
    }
    // n_cap 0 (cM 0)
    record(diff("n_cap 0", inp(rec(), { lpCapital: 0n, oiEffLongQ: 5n }), 0n, 10n, "trade"));
    log(`off-clamp grid: ${mismatches.length - before} mismatches`);
  });
  it("grid ON a clamp-enforced market (G8 N_cap: λ_eff / depth cap)", () => {
    const before = mismatches.length;
    for (const depthUsd of [undefined, 150_000n, 10_000n, 500n]) for (const lambda of [10_000, 30_000]) for (const kink of [0, 5_000]) {
      const g = rec({ kink, lambda, depthUsd });
      const i0 = inp(g, { clamp: true, lpCapital: 100_000n * M });
      const q = quoteMaxLeverage(i0, "long");
      const n8 = rsNCapForInput(i0);
      expect(q.nCapQ ?? 0n, "quote's N_cap is the wrapper's G8 N_cap").toBe(n8);
      for (const frac of [0n, 4_000n, 5_000n, 8_000n, 9_999n]) {
        const oi = (n8 * frac) / BPS;
        const i = { ...i0, oiEffLongQ: oi };
        record(diff(`clamp depth=${depthUsd ?? "none"} λ=${lambda} k=${kink} oi=${frac}bps open`, i, 0n, n8 / 50n + 1n, "trade"));
      }
    }
    log(`clamp grid: ${mismatches.length - before} mismatches`);
  });
  it("50k seeded cases", () => {
    const r = rng(0x5eed0f);
    const before = mismatches.length;
    let reachableUnder = 0;
    for (let k = 0; k < 50_000; k++) {
      const clamp = r.int(1) === 1;
      const g = rec({ kink: r.pick([0, 1, 2_500, 5_000, 8_000, 9_999, 10_000]), utilMax: r.pick([0, 1, 150, 500, 2_000, 65_535]), lambda: r.pick([5_000, 10_000, 20_000, 30_000]), depthUsd: r.pick([undefined, 500n, 10_000n, 150_000n, 2_000_000n]) });
      const cap = r.big(1_000_000n) * M;
      const price = 1n + r.big(5_000_000n);
      const i0 = inp(g, { clamp, lpCapital: cap, priceE6: price });
      const n = rsNCapForInput(i0) || (nCapQ(cap, g.lambdaBps, price) ?? 1n) || 1n;
      const oi = r.big(n + n / 10n);
      const lp = r.pick([0n, -r.big(oi), r.big(oi), -(oi + r.big(n))]);
      const before_ = r.pick([0n, r.big(n / 20n + 1n), -r.big(n / 20n + 1n)]);
      const size = (r.int(1) === 1 ? 1n : -1n) * (1n + r.big(n / 10n + 1n));
      const i = { ...i0, oiEffLongQ: oi, oiEffShortQ: r.big(n), lpEffectivePositionQ: lp, posScale: POS_SCALE };
      const route = r.int(3) === 0 ? "batch" : "trade";
      const m = diff(`seed#${k} clamp=${clamp} route=${route}`, i, before_, size, route);
      if (m) { record(m); if (m.dir === "preview<charged") reachableUnder++; }
    }
    log(`50k seeded: ${mismatches.length - before} mismatches (${reachableUnder} preview<charged)`);
  }, 300_000);
  it("summary", () => {
    const by = new Map<string, { n: number; under: number; over: number; ex: Mismatch }>();
    for (const m of mismatches) {
      const key = m.name.includes("THROWS") ? "throw" : m.dir === "preview<charged" ? "under (N_cap)" : "over (flip/route)";
      const e = by.get(key) ?? { n: 0, under: 0, over: 0, ex: m };
      e.n++; if (m.dir === "preview<charged") e.under++; else e.over++;
      by.set(key, e);
    }
    const under = mismatches.filter((m) => m.dir === "preview<charged");
    const maxUnder = under.reduce((a, m) => (m.rust - m.sdk > a.rust - a.sdk ? m : a), under[0] ?? null as unknown as Mismatch);
    log(`excluded (wrapper clips / gate refuses: users after > G8 N_cap): ${gated}`);
    log(`TOTAL end-to-end mismatches: ${mismatches.length} (preview<charged ${under.length}, preview>charged ${mismatches.length - under.length})`);
    for (const [k, e] of by) log(`  ${k}: ${e.n} (under ${e.under}, over ${e.over}); e.g. ${e.ex.name}: sdk ${e.ex.sdk} bps/${e.ex.sdkAtoms} atoms vs rust ${e.ex.rust} bps/${e.ex.rustAtoms} atoms`);
    if (maxUnder) log(`  worst under-preview: ${maxUnder.name}: sdk ${maxUnder.sdk} bps (${maxUnder.sdkAtoms} atoms) vs charged ${maxUnder.rust} bps (${maxUnder.rustAtoms} atoms)`);
    // eslint-disable-next-line no-console
    console.log(report.join("\n"));
    expect(true).toBe(true);
  });
});
