// Differential re-run of report J-20261120-SDK-REPORT-DIFF-WITHDRAWLIMITVSPROG: the same 34 edge-state rows (12 collateral
// states x 2, 5 stake, 5 bond), now read through the SDK's withdraw-limit helpers WITH the program inputs they take, against
// the TS port of the program (./prog-port.ts). A row is OVER when the SDK quotes more than the program pays (the user's
// withdraw fails on chain). Asserts 0 OVER rows; also adds junior (tag 97) rows for the new junior helper and a seeded
// randomized collateral sweep.
//
// Collateral rows: per state, (a) `maxWithdrawCollateralV22.maxAtoms` vs the program max, and (b) what the program actually
// pays for the quote's `maxRequestAmount` (the amount the max button sends) vs the program max.
import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { maxWithdrawCollateralV22, maxWithdrawJuniorV22 } from "../../src/abi/v22-withdraw.js";
import { quoteStakeWithdrawNowV5 } from "../../src/abi/v22-stake.js";
import { quoteBondWithdrawV22 } from "../../src/abi/v22-math.js";
import {
  progMaxWithdraw, progWithdraw, stakeMax, progBondWithdrawLive, progJuniorMax,
  type MarketState, type PortfolioState, type StakePoolState, type StakeCtx, type BondLiveState, type JuniorState,
} from "./prog-port.js";

type Row = { path: string; state: string; helper: string; sdk: bigint; prog: bigint; verdict: string };
const verdict = (sdk: bigint, prog: bigint) => (sdk > prog ? "OVER" : sdk < prog ? "UNDER" : "EQUAL");
const rows: Row[] = [];
const push = (r: Omit<Row, "verdict">) => rows.push({ ...r, verdict: verdict(r.sdk, r.prog) });

const CAP = 1_000_000n;
const mkt = (o: Partial<MarketState> = {}): MarketState => ({
  mode: "Live", resolveMatured: false, nowSlot: 10_000n, maintFeePerSlot: 0n,
  vaultTokenBalance: 10_000_000n, engineVault: 10_000_000n, cTot: 10_000_000n, ...o,
});
const pf = (o: Partial<PortfolioState> = {}): PortfolioState => ({
  capital: CAP, pnl: 0n, feeCredits: 0n, activeLegs: false, closeLedgerActive: false, lastFeeSlot: 10_000n, ...o,
});
const sdkCollateral = (m: MarketState, p: PortfolioState) =>
  maxWithdrawCollateralV22({
    capital: p.capital, pnl: p.pnl, feeCredits: p.feeCredits, hasActiveLegs: p.activeLegs, closeLedgerActive: p.closeLedgerActive,
    live: m.mode === "Live", resolveMatured: m.resolveMatured, nowSlot: m.nowSlot, lastFeeSlot: p.lastFeeSlot,
    maintenanceFeePerSlot: m.maintFeePerSlot, vaultTokenBalance: m.vaultTokenBalance,
  });
const collateral: { state: string; m: MarketState; p: PortfolioState }[] = [
  { state: "C1 zero position, Live, fees current", m: mkt(), p: pf() },
  { state: "C2 open LONG at the IM edge (pnl 0)", m: mkt(), p: pf({ activeLegs: true }) },
  { state: "C3 open SHORT at the MM edge (pnl -50k unrealized)", m: mkt(), p: pf({ activeLegs: true, pnl: -50_000n }) },
  { state: "C4 flat, negative PnL -200k not yet settled", m: mkt(), p: pf({ pnl: -200_000n }) },
  { state: "C5 flat, bankrupt: pnl -1.2M > capital", m: mkt(), p: pf({ pnl: -1_200_000n }) },
  { state: "C6 flat, +300k PnL still in warmup", m: mkt(), p: pf({ pnl: 300_000n }) },
  { state: "C7 flat, maintenance fee pending (100/slot x 1000 slots)", m: mkt({ maintFeePerSlot: 100n }), p: pf({ lastFeeSlot: 9_000n }) },
  { state: "C8 flat, fee debt (feeCredits -50k)", m: mkt(), p: pf({ feeCredits: -50_000n }) },
  { state: "C9 RESOLVED market, flat", m: mkt({ mode: "Resolved" }), p: pf() },
  { state: "C10 Live but permissionless-resolve matured", m: mkt({ resolveMatured: true }), p: pf() },
  { state: "C11 flat, forced-close ledger still active", m: mkt(), p: pf({ closeLedgerActive: true }) },
  { state: "C12 vault token short by 10 atoms of dust", m: mkt({ vaultTokenBalance: CAP - 10n }), p: pf() },
];
for (const c of collateral) {
  const prog = progMaxWithdraw(c.m, c.p);
  const q = sdkCollateral(c.m, c.p);
  push({ path: "collateral tag 4", state: c.state, helper: "maxWithdrawCollateralV22.maxAtoms", sdk: q.maxAtoms, prog });
  const paid = q.maxRequestAmount === 0n ? 0n : (() => { const r = progWithdraw(c.m, c.p, q.maxRequestAmount); return r.ok ? r.paid : -1n; })();
  // -1 marks "the max request is refused"; count that as OVER explicitly.
  rows.push({ path: "collateral tag 4", state: c.state, helper: "program pays for maxRequestAmount", sdk: q.maxAtoms, prog: paid, verdict: paid < 0n ? "OVER" : verdict(q.maxAtoms, paid) });
}

// ── stake v5 FIRST_LOSS ──
const pool = (o: Partial<StakePoolState> = {}): StakePoolState => ({
  totalDeposited: 10_000_000n, totalWithdrawn: 0n, totalFlushed: 0n, totalReturned: 0n, totalFeesEarned: 0n,
  realizedJuniorLoss: 0n, totalLpSupply: 10_001_000n, cooldownSlots: 1_000n, poolMode: 0, attributableFees: 0n, ...o,
});
const sctx = (o: Partial<StakeCtx> = {}): StakeCtx => ({
  nowSlot: 100_000n, lastDepositSlot: 1_000n, depositLp: 2_000_000n, vaultBalance: 10_000_000n,
  unitsStake: 0n, unitsTotal: 0n, snapFree: 0n, ...o,
});
const stakeStates: { state: string; p: StakePoolState; c: StakeCtx }[] = [
  { state: "S1 healthy pool, cooldown elapsed", p: pool(), c: sctx() },
  { state: "S2 deposit still inside the cooldown", p: pool(), c: sctx({ lastDepositSlot: 99_500n }) },
  { state: "S3 4M deployed as wrapper insurance (liquid cap binds)", p: pool({ totalFlushed: 4_000_000n }), c: sctx({ vaultBalance: 6_000_000n, unitsStake: 4_000_000n, unitsTotal: 4_000_000n, snapFree: 4_000_000n, depositLp: 8_000_000n }) },
  { state: "S4 vault token below booked liquid (dust short)", p: pool(), c: sctx({ vaultBalance: 1_500_000n }) },
  { state: "S5 mode-0 fee payout not yet accrued (+600k attributable surplus)", p: pool({ attributableFees: 600_000n }), c: sctx({ vaultBalance: 10_600_000n }) },
];
for (const s of stakeStates) {
  const [progAtoms] = stakeMax(s.p, s.c);
  const q = quoteStakeWithdrawNowV5(s.p, { unitsStake: s.c.unitsStake, unitsTotal: s.c.unitsTotal }, s.c.snapFree, s.c.vaultBalance, s.c.depositLp, undefined, {
    cooldown: { nowSlot: s.c.nowSlot, lastDepositSlot: s.c.lastDepositSlot, cooldownSlots: s.p.cooldownSlots },
    feeAccrual: { poolMode: s.p.poolMode, attributableAtoms: s.p.attributableFees },
  });
  push({ path: "stake v5 withdraw", state: s.state, helper: "quoteStakeWithdrawNowV5.maxCollateralNow", sdk: q?.maxCollateralNow ?? -1n, prog: progAtoms });
}

// ── bond tag 110 Live ──
const bond = (o: Partial<BondLiveState> = {}): BondLiveState => ({
  shares: 1_000n, bSharesTotal: 1_000n, cB: 500_000n, cooldownElapsed: true, seniorDrawOutstanding: 0n, backstopOutstanding: 0n,
  nav: 2_000_000n, seniorClaim: 1_000_000n, harvestableFee: 0n, undrawnDeficit: 0n, vWorse: 2_000_000n,
  nCapAfter: 10_000n, oiLong: 0n, oiShort: 0n, lpEffAbs: 0n, lpCapital: 1_000_000n, lpPnl: 0n, lpActiveLegs: false, ...o,
});
const bondStates: { state: string; b: BondLiveState }[] = [
  { state: "B1 flat vault LP, whole tranche, OI 0", b: bond() },
  { state: "B2 vault LP holds inventory (|LP_eff| 500 <= N_cap)", b: bond({ lpActiveLegs: true, lpEffAbs: 500n }) },
  { state: "B3 pots nav 900k < senior claim 1M (vault value still 2M)", b: bond({ nav: 900_000n }) },
  { state: "B4 harvestable LP fee pending", b: bond({ harvestableFee: 1n }) },
  { state: "B5 payout 500k > vault LP capital 300k", b: bond({ lpCapital: 300_000n }) },
];
for (const s of bondStates) {
  const r = progBondWithdrawLive(s.b);
  const q = quoteBondWithdrawV22({
    shares: s.b.shares,
    tranche: { cBAtoms: s.b.cB, bSharesTotal: s.b.bSharesTotal, couponArrearsAtoms: 0n, couponUnfundedAtoms: 0n, couponAccrualRem: 0n, couponGateSeen: 0n, lastCouponSlot: 10_000n, couponBpsPerYear: 0, couponUtilBonusBps: 0 },
    nowSlot: 10_000n, seniorDrawnAtoms: 0n, vaultValue: s.b.vWorse, seniorClaimEff: s.b.seniorClaim,
    live: { nCapAfter: s.b.nCapAfter, oiLongQ: s.b.oiLong, oiShortQ: s.b.oiShort, lpEffAbsQ: s.b.lpEffAbs },
    harvestableFeeAtoms: s.b.harvestableFee, nav: s.b.nav, undrawnDeficitAtoms: s.b.undrawnDeficit,
    lpCapitalAtoms: s.b.lpCapital, lpPnlAtoms: s.b.lpPnl, lpFeeCreditsAtoms: s.b.lpFeeCredits, lpHasActiveLegs: s.b.lpActiveLegs,
  });
  const sdk = q.refusal === null && q.atoms !== null ? q.atoms : 0n;
  push({ path: "bond tag 110 Live", state: s.state, helper: "quoteBondWithdrawV22.atoms (refusal null)", sdk, prog: r.ok ? r.paid : 0n });
}
const REPORT_ROWS = rows.length;
{
  // reviewer S2: fee debt on the vault LP (equity_after < 0 at the engine withdraw)
  const b = bond({ lpCapital: 600_000n, lpFeeCredits: -200_000n });
  const r = progBondWithdrawLive(b);
  const q = quoteBondWithdrawV22({
    shares: b.shares,
    tranche: { cBAtoms: b.cB, bSharesTotal: b.bSharesTotal, couponArrearsAtoms: 0n, couponUnfundedAtoms: 0n, couponAccrualRem: 0n, couponGateSeen: 0n, lastCouponSlot: 10_000n, couponBpsPerYear: 0, couponUtilBonusBps: 0 },
    nowSlot: 10_000n, seniorDrawnAtoms: 0n, vaultValue: b.vWorse, seniorClaimEff: b.seniorClaim,
    live: { nCapAfter: b.nCapAfter, oiLongQ: b.oiLong, oiShortQ: b.oiShort, lpEffAbsQ: b.lpEffAbs },
    lpCapitalAtoms: b.lpCapital, lpPnlAtoms: b.lpPnl, lpFeeCreditsAtoms: b.lpFeeCredits,
  });
  push({ path: "bond tag 110 Live", state: "B6 vault LP fee debt 200k, capital 600k, payout 500k", helper: "quoteBondWithdrawV22.atoms (refusal null)", sdk: q.refusal === null && q.atoms !== null ? q.atoms : 0n, prog: r.ok ? r.paid : 0n });
}

// ── junior tag 97 (was GAP: no SDK helper) ──
const jr = (o: Partial<JuniorState> = {}): JuniorState => ({
  live: true, drawOutstanding: 0n, nav: 1_200_000n, harvestable: 0n, lpValue: 800_000n, seniorClaim: 1_000_000n, seniorFeeShareBps: 5_000n,
  bondClaim: 0n, cushion: null, juniorFloorBps: 1_000n, vaultToken: 10_000_000n, lpCapital: 800_000n, lpPnl: 0n, lpActiveLegs: false,
  lpFeeCredits: 0n, maintFeePerSlot: 0n, nowSlot: 10_000n, lpLastFeeSlot: 10_000n, creatorMin: null, ...o,
});
const sdkJunior = (s: JuniorState) =>
  maxWithdrawJuniorV22({
    live: s.live, seniorDrawOutstandingAtoms: s.drawOutstanding, nav: s.nav, harvestableFeeAtoms: s.harvestable, lpValueAtoms: s.lpValue,
    seniorClaimAtoms: s.seniorClaim, seniorFeeShareBps: Number(s.seniorFeeShareBps), bondClaimUpperBound: s.bondClaim,
    cushion: s.cushion ? { accruedAtoms: s.cushion.accrued, targetBps: Number(s.cushion.targetBps) } : undefined,
    juniorFloorBps: Number(s.juniorFloorBps), vaultTokenBalance: s.vaultToken,
    lp: { capital: s.lpCapital, pnl: s.lpPnl, feeCredits: s.lpFeeCredits, hasActiveLegs: s.lpActiveLegs, lastFeeSlot: s.lpLastFeeSlot },
    nowSlot: s.nowSlot, maintenanceFeePerSlot: s.maintFeePerSlot, creatorStakeMinAtoms: s.creatorMin ?? undefined,
  }).maxAtoms;
const juniorStates: { state: string; s: JuniorState }[] = [
  { state: "J1 healthy, floor 10% of C_eff", s: jr() },
  { state: "J2 bond claim 300k ahead of the junior", s: jr({ bondClaim: 300_000n }) },
  { state: "J3 harvestable 100k (C_eff + 50k), cushion 80k of a 5% target", s: jr({ harvestable: 100_000n, cushion: { accrued: 80_000n, targetBps: 500n } }) },
  { state: "J4 pots nav 900k < senior claim 1M", s: jr({ nav: 900_000n }) },
  { state: "J5 vault LP has a leg", s: jr({ lpActiveLegs: true }) },
  { state: "J6 vault LP capital 200k below the junior room", s: jr({ lpCapital: 200_000n }) },
  { state: "J7 creator minimum 800k (gap below the junior)", s: jr({ creatorMin: 800_000n }) },
  { state: "J8 senior draw outstanding", s: jr({ drawOutstanding: 1n }) },
  { state: "J9 vault token 50k", s: jr({ vaultToken: 50_000n }) },
  { state: "J10 LP maintenance fee pending (50/slot x 1000)", s: jr({ maintFeePerSlot: 50n, lpLastFeeSlot: 9_000n }) },
  { state: "J11 LP fee debt -700k", s: jr({ lpFeeCredits: -700_000n }) },
];
for (const j of juniorStates) {
  push({ path: "junior tag 97", state: j.state, helper: "maxWithdrawJuniorV22.maxAtoms", sdk: sdkJunior(j.s), prog: progJuniorMax(j.s, 10_000_000n) });
}

describe("withdraw-limit differential vs prog rc23 (re-run of the report's 34 rows + junior)", () => {
  it("prints the table; no row quotes more than the program pays", () => {
    const md = ["| path | state | SDK helper | SDK max | prog max | verdict |", "|---|---|---|---:|---:|---|",
      ...rows.map((r) => `| ${r.path} | ${r.state} | \`${r.helper}\` | ${r.sdk} | ${r.prog} | **${r.verdict}** |`)].join("\n");
    if (process.env.WITHDRAW_DIFF_OUT) writeFileSync(process.env.WITHDRAW_DIFF_OUT, md + "\n");
    expect(REPORT_ROWS).toBe(34);
    expect(rows.filter((r) => r.verdict === "OVER")).toEqual([]);
  });
  it("every report row is now EQUAL (UNDER rows closed too)", () => {
    expect(rows.slice(0, REPORT_ROWS).filter((r) => r.verdict !== "EQUAL")).toEqual([]);
  });
  it("junior rows are EQUAL", () => {
    expect(rows.slice(REPORT_ROWS).filter((r) => r.verdict !== "EQUAL")).toEqual([]);
  });
});

// Seeded LCG so the sweep is deterministic.
function lcg(seed: number) {
  let x = BigInt(seed);
  return (n: bigint) => {
    x = (x * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return (x >> 16n) % n;
  };
}

describe("randomized: maxWithdrawCollateralV22 == program max, and the max request is paid", () => {
  it("2,000 seeded states", () => {
    const r = lcg(20261120);
    let paying = 0;
    for (let k = 0; k < 2_000; k++) {
      const capital = r(2_000_000n);
      const m = mkt({
        mode: r(10n) === 0n ? "Resolved" : "Live", resolveMatured: r(20n) === 0n, nowSlot: 10_000n + r(5_000n),
        maintFeePerSlot: r(3n) === 0n ? 0n : r(400n), vaultTokenBalance: r(4n) === 0n ? r(2_000_000n) : 10_000_000n,
      });
      const p = pf({
        capital, pnl: r(2_000_000n) - 1_000_000n, feeCredits: -r(3n) * r(500_000n), activeLegs: r(8n) === 0n,
        closeLedgerActive: r(15n) === 0n, lastFeeSlot: 10_000n + r(3_000n),
      });
      const prog = progMaxWithdraw(m, p);
      if (prog > 0n) paying++;
      const q = sdkCollateral(m, p);
      expect({ k, max: q.maxAtoms }).toEqual({ k, max: prog });
      if (q.maxRequestAmount > 0n) {
        const paid = progWithdraw(m, p, q.maxRequestAmount);
        expect({ k, ok: paid.ok, paid: paid.ok ? paid.paid : 0n }).toEqual({ k, ok: true, paid: prog });
      }
    }
    expect(paying).toBeGreaterThan(300);
  });
});

describe("randomized: maxWithdrawJuniorV22 == program max (tag 97)", () => {
  it("600 seeded states", () => {
    const r = lcg(97);
    let paying = 0;
    for (let k = 0; k < 600; k++) {
      const s = jr({
        live: r(15n) !== 0n, drawOutstanding: r(15n) === 0n ? 1n : 0n, nav: r(2_000_000n), harvestable: r(3n) === 0n ? r(200_000n) : 0n,
        lpValue: r(1_500_000n), seniorClaim: r(1_500_000n), seniorFeeShareBps: r(10_001n), bondClaim: r(2n) === 0n ? r(600_000n) : 0n,
        cushion: r(2n) === 0n ? { accrued: r(200_000n), targetBps: r(2_000n) } : null, juniorFloorBps: r(3_000n),
        vaultToken: r(4n) === 0n ? r(1_000_000n) : 10_000_000n, lpCapital: r(1_500_000n), lpPnl: r(3n) === 0n ? r(400_000n) - 200_000n : 0n,
        lpActiveLegs: r(10n) === 0n, creatorMin: r(3n) === 0n ? r(800_000n) : null,
        lpFeeCredits: r(4n) === 0n ? -r(900_000n) : 0n, maintFeePerSlot: r(3n) === 0n ? r(200n) : 0n, lpLastFeeSlot: 10_000n - r(2_000n),
      });
      const prog = progJuniorMax(s, 10_000_000n);
      if (prog > 0n) paying++;
      expect({ k, max: sdkJunior(s) }).toEqual({ k, max: prog });
    }
    expect(paying).toBeGreaterThan(60); // the sweep must exercise paying states, not only refusals
  });
});

describe("maxWithdrawCollateralV22 contracts (review round 1)", () => {
  const base = { capital: CAP, pnl: 0n, feeCredits: 0n, hasActiveLegs: false, live: true };
  it("a fee rate without both slots throws instead of dropping the fee", () => {
    expect(() => maxWithdrawCollateralV22({ ...base, maintenanceFeePerSlot: 1n, nowSlot: 5n })).toThrow(/lastFeeSlot/);
    expect(() => maxWithdrawCollateralV22({ ...base, maintenanceFeePerSlot: 1n, lastFeeSlot: 5n })).toThrow(/nowSlot/);
  });
  it("fee debt at or above capital is refused with 14 (every amount fails equity_after)", () => {
    const q = maxWithdrawCollateralV22({ ...base, feeCredits: -CAP });
    expect(q.maxAtoms).toBe(0n);
    expect(q.refusal?.code).toBe(14);
    expect(progMaxWithdraw(mkt(), pf({ feeCredits: -CAP }))).toBe(0n);
  });
});
