/**
 * Differential: 20k seeded random inputs per family through the SDK P3 bound-vault helpers
 * (src/solana/p3-vault-lp.ts) and a line-by-line TS transcription of percolator-prog
 * feat/v22-rc23-2026-10-22 (written at 3b256d49, re-checked unchanged at f27c32f3; line numbers are 3b256d49's):
 *   src/vault_lp_v18.rs      bound_vault_nav :429, tranche_split :80, effective_senior_claim :99,
 *                            bps_floor :46, senior_shares_for_deposit :125, senior_atoms_for_redemption :140,
 *                            conservative_equity :361, senior_claim_after_draw :484,
 *                            vault_lp_senior_pricing_claim :490, vault_lp_recovery_split :496,
 *                            vault_lp_recover :570, live_exit_senior_value :692 (test :1271)
 *   src/v16_program.rs       lp_vault_domain_nav_terms :22561, lp_vault_combined_nav_parts_p3 :22596,
 *                            tag-75 bound branch :32531-32616 + genesis floor :32631-32637,
 *                            tag-77 senior value :33639-33725, vault_lp_equity_lag_bounds_ro :36957,
 *                            vault_lp_live_pricing_claim :37032, vault_pot_held_atoms :37512,
 *                            vault_physical_idle_backing_atoms :37958, risk_notional_ceil :48681
 *   src/p4_rescue_ins.rs     vault_value_net_of_backstop :422, live_exit_senior_value_net_backstop :454
 *   src/bond_v20.rs          vault_value_worse :111
 * Before the rc23 fix the money-path families mismatched 382 / 5259 / 7134 / 11757 times (tag-75 u64 mint
 * cast, #570 worse-of entry gate, G9 backstop netting, all combined); every family must now be 0.
 */
import { describe, it, expect } from "vitest";
import { LAYOUT_V21, LAYOUT_V22 } from "../src/abi/layout.js";
import { stampMarket } from "./helpers/stamp.js";
import {
  readAssetPricesP3,
  boundVaultNavFlooredP3, boundVaultSeniorValueP3, boundVaultRedemptionAtomsP3, boundVaultDepositQuoteP3,
  vaultPotHeldAtomsP3, vaultPhysicalIdleBackingAtomsP3, vaultLpEquityLagBoundsP3, vaultLpSeniorPricingClaimP3,
  liveExitSeniorValueP3,
} from "../src/solana/p3-vault-lp.js";

const N = 20_000;
const U128 = (1n << 128n) - 1n;
const I128_MAX = (1n << 127n) - 1n, I128_MIN = -(1n << 127n);
const BPS = 10_000n, BOUND_SCALE = 1_000_000_000_000n, POS_SCALE = 1_000_000n, MIN_LIQ = 1_000n;

// ── Rust primitives (u128 / i128; None -> null) ────────────────────────────────────────────────
const chkU = (x: bigint): bigint | null => (x < 0n || x > U128 ? null : x);
const chkI = (x: bigint): bigint | null => (x < I128_MIN || x > I128_MAX ? null : x);
const satSub = (a: bigint, b: bigint): bigint => (a > b ? a - b : 0n);
const satAdd = (a: bigint, b: bigint): bigint => (a + b > U128 ? U128 : a + b);
const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);
const R = {
  // vault_lp_v18.rs:46
  bps_floor(x: bigint, bps: number): bigint | null { const b = BigInt(bps); if (b > BPS) return null; return (x / BPS) * b + ((x % BPS) * b) / BPS; },
  // :20
  mul_div_floor(a: bigint, b: bigint, d: bigint): bigint | null { if (d === 0n) return null; const p = chkU(a * b); return p === null ? null : p / d; },
  // :80
  tranche_senior(v: bigint, c: bigint): bigint { return v < c ? v : c; },
  // :99
  effective_senior_claim(c: bigint, h: bigint, bps: number): bigint | null { const f = R.bps_floor(h, bps); return f === null ? null : chkU(c + f); },
  // :125
  senior_shares_for_deposit(amount: bigint, s: bigint, sv: bigint): bigint | null { if (s === 0n) return amount; if (sv === 0n) return null; return R.mul_div_floor(amount, s, sv); },
  // :140
  senior_atoms_for_redemption(sh: bigint, s: bigint, sv: bigint): bigint | null { if (s === 0n || sh > s) return null; return R.mul_div_floor(sh, sv, s); },
  // :361
  conservative_equity(cap: bigint, pnl: bigint, fee: bigint): bigint | null {
    if (cap > I128_MAX) return null; let e = chkI(cap + (pnl < 0n ? pnl : 0n)); if (e === null) return null;
    e = chkI(e + (fee < 0n ? fee : 0n)); if (e === null) return null; return e <= 0n ? 0n : e;
  },
  // :429
  bound_vault_nav(p0: bigint, h0: bigint, p1: bigint, h1: bigint, e0: bigint, e1: bigint): [bigint, bigint] | null {
    const a0 = p0 < h0 ? p0 : h0, a1 = p1 < h1 ? p1 : h1; const av = chkU(a0 + a1); if (av === null) return null;
    const e = chkU(e0 + e1); if (e === null) return null; const nav = chkU(av + e); return nav === null ? null : [av, nav];
  },
  // :484 / :490
  vault_lp_senior_pricing_claim(c: bigint, undrawn: bigint, js: bigint): bigint { return satSub(c, satSub(undrawn, js)); },
  // :496 / :570 (returns to_seniors)
  vault_lp_recover_to_seniors(outstanding: bigint, aboveC: bigint): bigint { return aboveC < outstanding ? aboveC : outstanding; },
  // :692
  live_exit_senior_value(c: bigint, nav: bigint, lpv: bigint, w: bigint): bigint {
    if (w >= 0n) { const v = satAdd(nav, min(lpv, w)); return R.tranche_senior(v, c); }
    const d = -w; const cp = R.vault_lp_senior_pricing_claim(c, d, satSub(nav, c)); return R.tranche_senior(satSub(nav, d), cp);
  },
  // p4_rescue_ins.rs:422 / :454
  net_backstop(v: bigint, o: bigint): bigint { return satSub(v, o); },
  live_exit_senior_value_net_backstop(c: bigint, nav: bigint, lpv: bigint, w: bigint, bs: bigint): bigint {
    if (w >= 0n) { const v = satAdd(nav, min(lpv, w)); return min(R.net_backstop(v, bs), c); }
    const d = -w; const cp = R.vault_lp_senior_pricing_claim(c, d, satSub(nav, c)); return min(R.net_backstop(satSub(nav, d), bs), cp);
  },
  // bond_v20.rs:111
  vault_value_worse(navH: bigint, lpv: bigint, w: bigint): bigint { return w >= 0n ? satAdd(navH, lpv < w ? lpv : w) : satSub(navH, -w); },
  // v16_program.rs:22561 (earnings term) — wide_mul_div_floor_u128(net, bps, MAX_MARGIN_BPS=10_000)
  pot_lp_earnings(earn: bigint, withdrawn: bigint, bps: number): bigint | null { if (bps > 10_000) return null; return (satSub(earn, withdrawn) * BigInt(bps)) / BPS; },
  // :37512
  held(fresh: bigint, valid: bigint): bigint | null { const s = chkU(fresh + valid); return s === null ? null : s / BOUND_SCALE; },
  // :37958
  physical_idle(f0: bigint, f1: bigint): bigint | null { return chkU(f0 / BOUND_SCALE + f1 / BOUND_SCALE); },
  // :48681
  risk_notional_ceil(q: bigint, p: bigint): bigint | null { const n = chkU(q * p); if (n === null) return null; const m = chkU(n + POS_SCALE - 1n); return m === null ? null : m / POS_SCALE; },
};

type RLeg = { long: boolean; q: bigint; eff: bigint; committed: bigint; nextTgt: bigint; exposed: boolean };
// v16_program.rs:36957 vault_lp_equity_lag_bounds_ro
function rLagBounds(legs: RLeg[], cert: bigint, cap: bigint, pnl: bigint, fee: bigint): [bigint, bigint] | null {
  if (legs.length === 0) { const e = R.conservative_equity(cap, pnl, fee); return e === null ? null : [e, e]; }
  let adverse = 0n, favorable = 0n;
  for (const l of legs) {
    const tgt = l.nextTgt;
    const pending = tgt !== l.committed;
    const lagged = l.exposed && l.committed !== l.eff; // asset_price_lagged_view: exposed && asset_target_differs_view
    if (!pending && !lagged) continue;
    const [adv, fav] = l.long ? [satSub(l.eff, tgt), satSub(tgt, l.eff)] : [satSub(tgt, l.eff), satSub(l.eff, tgt)];
    const a = R.risk_notional_ceil(l.q, adv), f = R.risk_notional_ceil(l.q, fav);
    if (a === null || f === null) return null;
    adverse += a; favorable += f;
  }
  const w = chkI(cert - adverse), b = chkI(cert + favorable);
  return w === null || b === null ? null : [w, b];
}

type R75 = { ok: true; shares: bigint; minted: bigint; cEff: bigint } | { ok: false; error: string };
// v16_program.rs:32531-32637, bound branch (vault_lp_live_pricing_claim refuses undrawn != 0 first -> claim unchanged)
function rTag75(i: { amount: bigint; S: bigint; C: bigint; H: bigint; bps: number; navBound: bigint; lpValue: bigint; worse: bigint; better: bigint; outstanding: bigint; backstop: bigint }): R75 {
  const nav = i.navBound + i.H; // :32508 nav + harvestable
  if (i.S === 0n && i.H !== 0n) return { ok: false, error: "VaultLpHarvestPending" };
  let cEff = R.effective_senior_claim(i.C, i.H, i.bps);
  if (cEff === null) return { ok: false, error: "EngineArithmeticOverflow" };
  cEff = R.vault_lp_senior_pricing_claim(cEff, 0n, satSub(nav, cEff));
  if (i.outstanding !== 0n) {
    const vBetter = nav + (i.better > 0n ? i.better : 0n);
    cEff = cEff + R.vault_lp_recover_to_seniors(i.outstanding, satSub(satSub(vBetter, cEff), i.backstop));
  }
  const lpValue = i.worse >= 0n ? i.lpValue : 0n;
  const v = R.net_backstop(R.vault_value_worse(nav, lpValue, i.worse), i.backstop);
  if (v < cEff) return { ok: false, error: "VaultLpSeniorImpaired" };
  const shares = R.senior_shares_for_deposit(i.amount, i.S, cEff);
  if (shares === null) return { ok: false, error: "EngineInvalidConfig" };
  if (shares === 0n) return { ok: false, error: "LpVaultZeroSharesMinted" };
  let minted = shares;
  if (i.S === 0n) { if (shares < MIN_LIQ || shares - MIN_LIQ === 0n) return { ok: false, error: "LpVaultDepositBelowMinimumLiquidity" }; minted = shares - MIN_LIQ; }
  if (minted > (1n << 64n) - 1n) return { ok: false, error: "EngineArithmeticOverflow" }; // :32638 u64::try_from(shares_to_mint)
  return { ok: true, shares, minted, cEff };
}
// v16_program.rs:33639-33725 (+ :33728 senior_atoms_for_redemption)
function rTag77Value(i: { resolved: boolean; C: bigint; nav: bigint; lpValue: bigint; worse: bigint; physical: bigint; backstop: bigint }): bigint {
  if (i.resolved) return R.tranche_senior(i.physical, i.C);
  const c = R.vault_lp_senior_pricing_claim(i.C, 0n, satSub(i.nav, i.C));
  const lpv = i.worse >= 0n ? i.lpValue : 0n;
  return R.live_exit_senior_value_net_backstop(c, i.nav, lpv, i.worse, i.backstop);
}

// ── seeded RNG (splitmix64) ────────────────────────────────────────────────────────────────────
function rng(seed: bigint) {
  let s = seed & ((1n << 64n) - 1n);
  const next = (): bigint => { s = (s + 0x9e3779b97f4a7c15n) & ((1n << 64n) - 1n); let z = s; z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & ((1n << 64n) - 1n); z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & ((1n << 64n) - 1n); return z ^ (z >> 31n); };
  const below = (n: bigint): bigint => (n <= 0n ? 0n : next() % n);
  // mixed magnitude: edge values, small, mid, near-u64
  const amt = (maxBits = 63): bigint => { const k = Number(below(10n)); if (k === 0) return 0n; if (k === 1) return 1n; if (k <= 4) return below(2_000n); if (k <= 7) return below(1n << 40n); return below(1n << BigInt(maxBits)); };
  const signed = (maxBits = 62): bigint => (below(2n) === 0n ? amt(maxBits) : -amt(maxBits));
  const bps = (): number => { const k = Number(below(6n)); return k === 0 ? 0 : k === 1 ? 10_000 : Number(below(10_001n)); };
  return { next, below, amt, signed, bps, bool: () => below(2n) === 0n };
}

type Mm = { fn: string; inputs: unknown; sdk: unknown; rust: unknown; dir: string };
const show = (x: unknown): string => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
const dirOf = (s: unknown, r: unknown): string => {
  if (typeof s === "bigint" && typeof r === "bigint") return s > r ? "SDK higher (over-quotes)" : "SDK lower (under-quotes)";
  const so = s as { ok?: boolean; shares?: bigint }, ro = r as { ok?: boolean; shares?: bigint };
  if (so && ro && "ok" in so && "ok" in ro) {
    if (so.ok && !ro.ok) return "SDK admits, rc23 refuses";
    if (!so.ok && ro.ok) return "SDK refuses, rc23 admits";
    if (so.ok && ro.ok) return so.shares! > ro.shares! ? "both admit, SDK more shares" : so.shares! < ro.shares! ? "both admit, SDK fewer shares" : "both admit, cEff/minted differ";
  }
  return "outcome differs";
};
function report(name: string, mm: Mm[]): void {
  const by = new Map<string, number>();
  for (const m of mm) by.set(`${m.fn} | ${m.dir}`, (by.get(`${m.fn} | ${m.dir}`) ?? 0) + 1);
  console.log(`[${name}] ${N} cases, ${mm.length} mismatches ${show([...by])}`);
  for (const m of mm.slice(0, 4)) console.log(`  e.g. ${m.fn} inputs=${show(m.inputs)} sdk=${show(m.sdk)} rust=${show(m.rust)} (${m.dir})`);
}

// ── family A: the pure formula helpers (every input in-domain) ─────────────────────────────────
function runFormulas(seed: bigint): Mm[] {
  const g = rng(seed); const mm: Mm[] = [];
  const push = (fn: string, inputs: unknown, sdk: unknown, rust: unknown) => { if (show(sdk) !== show(rust)) mm.push({ fn, inputs, sdk, rust, dir: dirOf(sdk, rust) }); };
  for (let k = 0; k < N; k++) {
    // NAV (per-pot min, per-pot earnings floor), held, idle
    const f0 = g.amt(63) * (g.bool() ? BOUND_SCALE : 1n) + g.below(BOUND_SCALE), v0 = g.amt(63) * (g.bool() ? BOUND_SCALE : 1n);
    const f1 = g.amt(63) * (g.bool() ? BOUND_SCALE : 1n) + g.below(BOUND_SCALE), v1 = g.amt(63);
    const pot = () => ({ totalPrincipalAtoms: g.amt(), totalEarningsAtoms: g.amt(), totalEarningsWithdrawnAtoms: g.amt(), cumulativeLossAtoms: g.amt(), cumulativeRecoveryAtoms: g.amt() });
    const own = pot(), sib = pot(), bps = g.bps();
    const h0 = R.held(f0, v0)!, h1 = R.held(f1, v1)!;
    push("vaultPotHeldAtomsP3", { f0, v0 }, vaultPotHeldAtomsP3({ freshUnlienedBackingNum: f0, validLienedBackingNum: v0 }), h0);
    push("vaultPhysicalIdleBackingAtomsP3", { f0, f1 }, vaultPhysicalIdleBackingAtomsP3([f0, f1]), R.physical_idle(f0, f1));
    const e0 = R.pot_lp_earnings(own.totalEarningsAtoms, own.totalEarningsWithdrawnAtoms, bps)!, e1 = R.pot_lp_earnings(sib.totalEarningsAtoms, sib.totalEarningsWithdrawnAtoms, bps)!;
    const rn = R.bound_vault_nav(own.totalPrincipalAtoms, h0, sib.totalPrincipalAtoms, h1, e0, e1)!;
    const sn = boundVaultNavFlooredP3(own, sib, bps, { own: h0, sibling: h1 });
    push("boundVaultNavFlooredP3", { own, sib, bps, h0, h1 }, [sn.availablePrincipal, sn.lpEarnings, sn.nav], [rn[0], e0 + e1, rn[1]]);
    // lag bounds: committed target == next-crank target, exposed (the inputs the SDK models)
    const nLegs = Number(g.below(4n));
    const legs: RLeg[] = Array.from({ length: nLegs }, () => {
      const eff = g.amt(40), tgt = g.bool() ? eff : g.amt(40); const q = g.amt(62);
      return { long: g.bool(), q, eff, committed: tgt, nextTgt: tgt, exposed: true };
    });
    const cert = g.signed(62), cap = g.amt(62), pnl = g.signed(62), fee = g.signed(62);
    const rb = rLagBounds(legs, cert, cap, pnl, fee)!;
    const sb = vaultLpEquityLagBoundsP3({ legs: legs.map((l) => ({ basisPosQ: l.long ? l.q : -l.q, effectivePriceE6: l.eff, rawOracleTargetPriceE6: l.nextTgt })), certifiedEquity: cert, capital: cap, pnl, feeCredits: fee });
    // a zero-quantity leg has no side in the SDK (basisPosQ = 0 → long); it contributes 0 either way
    push("vaultLpEquityLagBoundsP3", { legs, cert, cap, pnl, fee }, [sb.worse, sb.better], rb);
    // pricing claim, live exit, redemption
    const c = g.amt(), nav = g.amt(), lpv = g.amt(), w = g.signed(), und = g.amt(), js = g.amt();
    push("vaultLpSeniorPricingClaimP3", { c, und, js }, vaultLpSeniorPricingClaimP3(c, und, js), R.vault_lp_senior_pricing_claim(c, und, js));
    push("liveExitSeniorValueP3", { c, nav, lpv, w }, liveExitSeniorValueP3(c, nav, lpv, w), R.live_exit_senior_value(c, nav, lpv, w));
    const bs = g.bool() ? 0n : g.amt();
    push("liveExitSeniorValueP3 (net backstop)", { c, nav, lpv, w, bs }, liveExitSeniorValueP3(c, nav, lpv, w, bs), R.live_exit_senior_value_net_backstop(c, nav, lpv, w, bs));
    const S = g.amt(), sh = g.bool() ? g.below(S + 2n) : g.amt(), sv = g.amt();
    push("boundVaultRedemptionAtomsP3", { sh, S, sv }, boundVaultRedemptionAtomsP3(sh, S, sv), R.senior_atoms_for_redemption(sh, S, sv));
  }
  return mm;
}

// ── family B: the tag-77 / tag-75 money path, with the inputs the SDK helpers model ────────────
// backstop = 0 and (75) worse >= lpValue: the assumptions p3-final's vectors are written under.
// family C: the same path with rc23's full input space (any worse, backstop >= 0).
function runPath(seed: bigint, full: boolean, anyWorse = full, withBackstop = full): Mm[] {
  const g = rng(seed); const mm: Mm[] = [];
  const push = (fn: string, inputs: unknown, sdk: unknown, rust: unknown) => { if (show(sdk) !== show(rust)) mm.push({ fn, inputs, sdk, rust, dir: dirOf(sdk, rust) }); };
  for (let k = 0; k < N; k++) {
    const small = g.bool(); const a = (): bigint => (small ? g.below(5_000n) : g.amt(60));
    const C = a(), nav = a(), lpValue = a(), physical = a(), resolved = g.below(4n) === 0n;
    const backstop = withBackstop && g.bool() ? a() : 0n;
    let worse = g.bool() ? a() : -a();
    const S = g.bool() ? 0n : a() + 1n, shares = g.below(S + 1n);
    // 77
    const sv = boundVaultSeniorValueP3({ nav, seniorClaim: C, lpValue, resolved, physicalIdleBacking: physical, lpEquityWorse: worse, backstopOutstandingAtoms: backstop });
    const rv = rTag77Value({ resolved, C, nav, lpValue, worse, physical, backstop });
    const i77 = { resolved, C, nav, lpValue, worse, physical, backstop, shares, S };
    push("tag77 seniorValue", i77, sv, rv);
    push("tag77 payout atoms", i77, boundVaultRedemptionAtomsP3(shares, S, sv), R.senior_atoms_for_redemption(shares, S, rv));
    // 75
    const H = g.below(3n) === 0n ? a() : 0n, bps = g.bps(), amount = a() + (g.bool() ? MIN_LIQ : 0n);
    const outstanding = g.bool() ? a() : 0n;
    let better = g.bool() ? a() : -a();
    if (!anyWorse && worse < lpValue) worse = lpValue + g.below(3n); // SDK's 75 assumes the LP's worse equity covers lpValue
    if (better < worse) better = worse; // better >= worse (same certificate, favorable >= 0 vs adverse >= 0)
    const sq = boundVaultDepositQuoteP3({ amount, totalShares: S, seniorClaim: C, harvestable: H, seniorFeeShareBps: bps, nav, lpValue, seniorDrawOutstandingAtoms: outstanding, lpEquityBetter: better, lpEquityWorse: worse, backstopOutstandingAtoms: backstop });
    const rq = rTag75({ amount, S, C, H, bps, navBound: nav, lpValue, worse, better, outstanding, backstop });
    push(!rq.ok && rq.error === "EngineArithmeticOverflow" ? "tag75 (u64 shares_to_mint cast :32638)" : "tag75 deposit quote", { amount, S, C, H, bps, nav, lpValue, worse, better, outstanding, backstop }, sq, rq);
  }
  return mm;
}

describe("rc23 differential — formula helpers (in-domain inputs)", () => {
  it("20k cases: held / idle / NAV / lag bounds / pricing claim / live exit / redemption", () => {
    const mm = runFormulas(0x5eed_0001n); report("formulas", mm);
    expect(mm).toHaveLength(0);
  });
});

describe("rc23 differential — tag 77 / 75 money path, p3-final's assumptions (backstop 0, worse >= lpValue)", () => {
  it("20k cases", () => {
    const mm = runPath(0x5eed_0002n, false); report("path-assumed", mm);
    expect(mm).toHaveLength(0);
  });
});

describe("rc23 differential — cause split", () => {
  it("20k: any worse, backstop 0 (isolates #570 tag-75 worse-of entry)", () => { const mm = runPath(0x5eed_0004n, true, true, false); report("path-anyWorse-noBackstop", mm); expect(mm).toHaveLength(0); });
  it("20k: worse >= lpValue, backstop >= 0 (isolates the G9 backstop netting)", () => { const mm = runPath(0x5eed_0005n, true, false, true); report("path-backstopOnly", mm); expect(mm).toHaveLength(0); });
});

describe("rc23 differential — tag 77 / 75 money path, rc23's full inputs (any worse, backstop >= 0)", () => {
  it("20k cases", () => {
    const mm = runPath(0x5eed_0003n, true); report("path-full", mm);
    expect(mm).toHaveLength(0);
  });
  it("case A (M1, #570) — tag 75 at worse < lpValue: both refuse VaultLpSeniorImpaired", () => {
    const i = { amount: 1_000n, S: 1_000n, C: 1_000n, H: 0n, bps: 10_000, navBound: 900n, lpValue: 500n, worse: 50n, better: 50n, outstanding: 0n, backstop: 0n };
    expect(rTag75(i)).toEqual({ ok: false, error: "VaultLpSeniorImpaired" }); // V = 900 + min(500, 50) = 950 < 1000
    expect(boundVaultDepositQuoteP3({ amount: 1_000n, totalShares: 1_000n, seniorClaim: 1_000n, harvestable: 0n, seniorFeeShareBps: 10_000, nav: 900n, lpValue: 500n, seniorDrawOutstandingAtoms: 0n, lpEquityBetter: 50n, lpEquityWorse: 50n, backstopOutstandingAtoms: 0n }))
      .toEqual(rTag75(i));
    // a negative worse bound comes out of nav + H: 1100 − 150 = 950 < 1000
    expect(boundVaultDepositQuoteP3({ amount: 1_000n, totalShares: 1_000n, seniorClaim: 1_000n, harvestable: 0n, seniorFeeShareBps: 10_000, nav: 1_100n, lpValue: 500n, seniorDrawOutstandingAtoms: 0n, lpEquityBetter: 0n, lpEquityWorse: -150n, backstopOutstandingAtoms: 0n }))
      .toEqual({ ok: false, error: "VaultLpSeniorImpaired" });
  });
  it("case B (M2, G9) — tag 77 pays on V − backstop; the 75 recover step and gate net it too", () => {
    const i = { resolved: false, C: 1_000n, nav: 1_000n, lpValue: 0n, worse: 0n, physical: 0n, backstop: 300n };
    expect(rTag77Value(i)).toBe(700n);
    expect(boundVaultSeniorValueP3({ nav: 1_000n, seniorClaim: 1_000n, lpValue: 0n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: 0n, backstopOutstandingAtoms: 300n })).toBe(700n);
    expect(boundVaultSeniorValueP3({ nav: 1_000n, seniorClaim: 1_000n, lpValue: 0n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: -200n, backstopOutstandingAtoms: 300n })).toBe(500n);
    expect(liveExitSeniorValueP3(1_000n, 1_000n, 0n, 0n, 300n)).toBe(700n);
    expect(boundVaultRedemptionAtomsP3(1n, 2n, 700n)).toBe(350n); // was floor(1 · 1000 / 2) = 500
    // recover: V_better 1600 − C 1000 − b 400 = 200 to seniors (was min(600, 300) = 300)
    const q = { amount: 1_000n, totalShares: 1_000n, seniorClaim: 1_000n, harvestable: 0n, seniorFeeShareBps: 10_000, nav: 1_100n, lpValue: 500n, seniorDrawOutstandingAtoms: 300n, lpEquityBetter: 500n, lpEquityWorse: 500n };
    expect(boundVaultDepositQuoteP3({ ...q, backstopOutstandingAtoms: 400n })).toEqual({ ok: true, shares: 833n, minted: 833n, cEff: 1_200n });
    const r = { amount: 1_000n, S: 1_000n, C: 1_000n, H: 0n, bps: 10_000, navBound: 1_100n, lpValue: 500n, outstanding: 300n, better: 500n };
    expect(boundVaultDepositQuoteP3({ ...q, backstopOutstandingAtoms: 400n })).toEqual(rTag75({ ...r, worse: 500n, backstop: 400n }));
    // gate: at worse 100, V = 1100 + 100 − 400 = 800 < C_eff 1200 (was 1200 ≥ 1000 without the backstop)
    expect(boundVaultDepositQuoteP3({ ...q, lpEquityWorse: 100n, backstopOutstandingAtoms: 400n })).toEqual({ ok: false, error: "VaultLpSeniorImpaired" });
    expect(rTag75({ ...r, worse: 100n, backstop: 400n })).toEqual({ ok: false, error: "VaultLpSeniorImpaired" });
  });
  it("case C (M3, #666) — the lag target is the next-crank target readAssetPricesP3 returns", () => {
    const leg: RLeg = { long: true, q: 2_000_000n, eff: 1_000_000n, committed: 1_000_000n, nextTgt: 900_000n, exposed: true };
    expect(rLagBounds([leg], 0n, 0n, 0n, 0n)).toEqual([-200_000n, 0n]);
    for (const L of [LAYOUT_V21, LAYOUT_V22]) {
      const d = stampMarket(new Uint8Array(L.marketGroupOff + L.marketGroupLen + 2 * L.assetSlotStride), L.version);
      const v = new DataView(d.buffer);
      const slot1 = L.marketGroupOff + L.marketGroupLen + L.assetSlotStride, e1 = slot1 + L.wrapperSlotLen;
      v.setBigUint64(e1 + L.assetState.rawOracleTargetPrice, leg.committed, true);
      v.setBigUint64(e1 + L.assetState.effectivePrice, leg.eff, true);
      v.setBigUint64(slot1 + 168, leg.nextTgt, true); // AssetOracleProfileV16.mark_ewma_e6
      const mode = (oracleMode: number, lifecycle: number, groupMode: number) => {
        d[slot1] = oracleMode; d[e1 + 16] = lifecycle; d[L.marketGroupOff + L.group.mode] = groupMode;
        return readAssetPricesP3(d, 1).rawOracleTargetPriceE6;
      };
      // AuthMark (3) / EwmaMark (2), Active (2) / DrainOnly (3), Live (0): the pushed mark
      expect([mode(3, 2, 0), mode(2, 2, 0), mode(3, 3, 0)]).toEqual([900_000n, 900_000n, 900_000n]);
      // Manual (0) / Hybrid (1), a non-Active/DrainOnly lifecycle, or Resolved (1): the committed target
      expect([mode(0, 2, 0), mode(1, 2, 0), mode(3, 1, 0), mode(3, 4, 0), mode(3, 2, 1)]).toEqual(Array(5).fill(leg.committed));
      mode(3, 2, 0);
      const s = vaultLpEquityLagBoundsP3({ legs: [{ basisPosQ: leg.q, ...readAssetPricesP3(d, 1) }], certifiedEquity: 0n, capital: 0n, pnl: 0n, feeCredits: 0n });
      expect([s.worse, s.better]).toEqual(rLagBounds([leg], 0n, 0n, 0n, 0n));
    }
  });
  it("case D (M5) — seniorFeeShareBps > 10000 fails closed like bps_floor; non-integer / negative bps throw", () => {
    const i = { amount: 5_000n, S: 1_000n, C: 1_000n, H: 10n, bps: 10_001, navBound: 5_000n, lpValue: 0n, worse: 0n, better: 0n, outstanding: 0n, backstop: 0n };
    expect(rTag75(i)).toEqual({ ok: false, error: "EngineArithmeticOverflow" });
    const a = { amount: 5_000n, totalShares: 1_000n, seniorClaim: 1_000n, harvestable: 10n, seniorFeeShareBps: 10_001, nav: 5_000n, lpValue: 0n, seniorDrawOutstandingAtoms: 0n, lpEquityBetter: 0n, lpEquityWorse: 0n, backstopOutstandingAtoms: 0n };
    expect(boundVaultDepositQuoteP3(a)).toEqual(rTag75(i));
    expect(boundVaultDepositQuoteP3({ ...a, totalShares: 0n })).toEqual({ ok: false, error: "VaultLpHarvestPending" }); // checked first, as rc23
    expect(() => boundVaultDepositQuoteP3({ ...a, seniorFeeShareBps: -1 })).toThrow(RangeError);
    expect(() => boundVaultDepositQuoteP3({ ...a, seniorFeeShareBps: 1.5 })).toThrow(RangeError);
  });
  it("case E (M4) — a mint above u64::MAX is EngineArithmeticOverflow; exactly u64::MAX is admitted", () => {
    const i = { amount: 203_093_914_794n, S: 630_168_535_811n, C: 1n, H: 0n, bps: 10_000, navBound: 66n, lpValue: 1_182n, worse: 1_184n, better: 1_184n, outstanding: 0n, backstop: 0n };
    const a = { amount: i.amount, totalShares: i.S, seniorClaim: 1n, harvestable: 0n, seniorFeeShareBps: 10_000, nav: 66n, lpValue: 1_182n, seniorDrawOutstandingAtoms: 0n, lpEquityBetter: 1_184n, lpEquityWorse: 1_184n, backstopOutstandingAtoms: 0n };
    expect(boundVaultDepositQuoteP3(a)).toEqual({ ok: false, error: "EngineArithmeticOverflow" });
    expect(boundVaultDepositQuoteP3(a)).toEqual(rTag75(i));
    const max = (1n << 64n) - 1n;
    expect(boundVaultDepositQuoteP3({ ...a, amount: max, totalShares: 1n })).toEqual({ ok: true, shares: max, minted: max, cEff: 1n });
    expect(boundVaultDepositQuoteP3({ ...a, amount: max, totalShares: 2n })).toEqual({ ok: false, error: "EngineArithmeticOverflow" });
  });
  it("the new rc23 inputs are required: omitting them throws instead of over-quoting", () => {
    const a = { amount: 1_000n, totalShares: 1_000n, seniorClaim: 1_000n, harvestable: 0n, seniorFeeShareBps: 10_000, nav: 1_000n, lpValue: 0n, seniorDrawOutstandingAtoms: 0n, lpEquityBetter: 0n, lpEquityWorse: 0n, backstopOutstandingAtoms: 0n };
    const { lpEquityWorse: _w, ...noWorse } = a;
    const { backstopOutstandingAtoms: _b, ...noBackstop } = a;
    expect(() => boundVaultDepositQuoteP3(noWorse as typeof a)).toThrow(TypeError);
    expect(() => boundVaultDepositQuoteP3(noBackstop as typeof a)).toThrow(TypeError);
    const sv = { nav: 1_000n, seniorClaim: 1_000n, lpValue: 0n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: 0n };
    expect(() => boundVaultSeniorValueP3(sv as Parameters<typeof boundVaultSeniorValueP3>[0])).toThrow(TypeError);
    expect(boundVaultSeniorValueP3({ ...sv, resolved: true, physicalIdleBacking: 5n } as Parameters<typeof boundVaultSeniorValueP3>[0])).toBe(5n); // Resolved ignores it
  });
});

describe("p3-final pinned vectors through the rc23 transcription", () => {
  it("E-1 (vault_lp_v18.rs:1271 asserts, byte-for-byte)", () => {
    const [c, nav, e] = [1_000_000n, 800_000n, 200_000n];
    expect(R.live_exit_senior_value(c, nav, e, 200_000n - 300_000n)).toBe(700_000n);
    expect(R.live_exit_senior_value(c, nav, e, 200_000n - 600_000n)).toBe(400_000n);
    expect(R.live_exit_senior_value(c, nav, e, 200_000n - 150_000n)).toBe(850_000n);
    expect(R.live_exit_senior_value(c, nav, e, 200_000n)).toBe(1_000_000n);
    expect(R.live_exit_senior_value(c, 1_200_000n, 0n, -100_000n)).toBe(1_000_000n);
    expect(R.live_exit_senior_value(c, 1_200_000n, 0n, -300_000n)).toBe(900_000n);
  });
  it("77 / 75 vectors (:113-128, :233-248) at backstop 0, worse = the coherent LP bound", () => {
    const NO = 1n << 100n;
    const v = (nav: bigint, C: bigint, lpValue: bigint, resolved: boolean, physical: bigint, worse: bigint) => rTag77Value({ resolved, C, nav, lpValue, worse, physical, backstop: 0n });
    expect([v(10n, 8n, 0n, false, 0n, NO), v(5n, 8n, 2n, false, 0n, NO), v(5n, 8n, 9n, false, 0n, NO), v(99n, 8n, 9n, true, 6n, NO)]).toEqual([8n, 7n, 8n, 6n]);
    expect([v(500n, 1_000n, 900n, false, 0n, -300n), v(1_200n, 1_000n, 0n, false, 0n, -300n), v(500n, 1_000n, 900n, false, 0n, 200n), v(500n, 1_000n, 900n, true, 600n, -300n)]).toEqual([200n, 900n, 700n, 600n]);
    expect([v(800_000n, 1_000_000n, 200_000n, false, 0n, -100_000n), v(800_000n, 1_000_000n, 200_000n, false, 0n, 50_000n)]).toEqual([700_000n, 850_000n]);
    expect([R.vault_lp_senior_pricing_claim(1_000n, 300n, 0n), R.vault_lp_senior_pricing_claim(1_000n, 300n, 200n), R.vault_lp_senior_pricing_claim(100n, 300n, 0n)]).toEqual([700n, 900n, 0n]);
    expect([R.senior_atoms_for_redemption(3n, 7n, 10n), R.senior_atoms_for_redemption(8n, 7n, 10n)]).toEqual([4n, null]);
    const base = { amount: 1_000n, S: 3_000n, C: 2_000n, H: 0n, bps: 10_000, navBound: 2_000n, lpValue: 0n, worse: NO, better: NO, outstanding: 0n, backstop: 0n };
    expect(rTag75(base)).toEqual({ ok: true, shares: 1_500n, minted: 1_500n, cEff: 2_000n });
    expect(rTag75({ ...base, H: 10n })).toMatchObject({ ok: true, cEff: 2_010n, shares: 1_492n });
    expect(rTag75({ ...base, navBound: 1_000n, lpValue: 500n })).toEqual({ ok: false, error: "VaultLpSeniorImpaired" });
    expect(rTag75({ ...base, navBound: 1_000n, lpValue: 1_000n }).ok).toBe(true); // holds only with worse >= 1000
    expect(rTag75({ ...base, navBound: 1_000n, lpValue: 1_000n, worse: 999n }).ok).toBe(false); // rc23: same vector, worse 999 -> refused
    expect(rTag75({ ...base, S: 0n, H: 1n })).toEqual({ ok: false, error: "VaultLpHarvestPending" });
    expect(rTag75({ ...base, S: 0n, amount: 5_000n })).toEqual({ ok: true, shares: 5_000n, minted: 4_000n, cEff: 2_000n });
    expect(rTag75({ ...base, S: 0n, amount: 1_000n })).toEqual({ ok: false, error: "LpVaultDepositBelowMinimumLiquidity" });
    const q = { amount: 1_000n, S: 1_000n, C: 1_000n, H: 0n, bps: 10_000, navBound: 1_100n, lpValue: 500n, backstop: 0n };
    expect(rTag75({ ...q, outstanding: 300n, better: 150n, worse: 150n })).toMatchObject({ ok: true, cEff: 1_250n, shares: 800n });
    expect(rTag75({ ...q, outstanding: 300n, better: 500n, worse: 500n })).toMatchObject({ ok: true, cEff: 1_300n });
    expect(rTag75({ ...q, outstanding: 0n, better: 500n, worse: 500n })).toMatchObject({ ok: true, cEff: 1_000n });
    expect(rTag75({ ...q, lpValue: 0n, outstanding: 300n, better: 150n, worse: 150n })).toEqual({ ok: false, error: "VaultLpSeniorImpaired" });
  });
  it("NAV + lag vectors (:96-110, :219-230)", () => {
    const nav = (p0: bigint, p1: bigint, h0: bigint, h1: bigint) => R.bound_vault_nav(p0, h0, p1, h1, 0n, 0n)![0];
    expect([nav(200n, 1_000n, 100n, 5_000n), nav(200n, 0n, 900n, 7n)]).toEqual([1_100n, 200n]);
    expect([R.pot_lp_earnings(999n, 0n, 4_800), R.pot_lp_earnings(1n, 0n, 4_800), R.pot_lp_earnings(0n, 5n, 10_000), R.pot_lp_earnings(0n, 0n, 10_001)]).toEqual([479n, 0n, 0n, null]);
    expect([R.held(2_500_000_000_000n, 500_000_000_000n), R.held(999_999_999_999n, 0n), R.physical_idle(1_999_999_999_999n, 1_000_000_000_000n)]).toEqual([3n, 0n, 2n]);
    const L = (long: boolean, q: bigint, eff: bigint, t: bigint): RLeg => ({ long, q, eff, committed: t, nextTgt: t, exposed: true });
    expect(rLagBounds([L(false, 2_000_000n, 1_000_000n, 1_100_000n)], 500_000n, 0n, 0n, 0n)).toEqual([300_000n, 500_000n]);
    expect(rLagBounds([L(true, 2_000_000n, 1_000_000n, 900_000n)], 0n, 0n, 0n, 0n)![0]).toBe(-200_000n);
    expect(rLagBounds([L(true, 2_000_000n, 1_000_000n, 1_050_000n)], 0n, 0n, 0n, 0n)).toEqual([0n, 100_000n]);
    expect(rLagBounds([L(true, 3n, 2n, 1n), L(true, 3n, 2n, 1n)], 10n, 0n, 0n, 0n)![0]).toBe(8n);
    expect(rLagBounds([], 999n, 100n, -30n, -5n)).toEqual([65n, 65n]);
    expect(rLagBounds([], 0n, 10n, -30n, 7n)).toEqual([0n, 0n]);
  });
});
