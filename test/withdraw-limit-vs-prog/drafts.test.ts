// The 16 draft tests of report J-20261120-SDK-REPORT-DIFF-WITHDRAWLIMITVSPROG (one per OVER/UNDER state), pointed at the
// fix the report names: the new `maxWithdrawCollateralV22` (C rows), the new cooldown / fee-accrual inputs of
// `quoteStakeWithdrawNowV5` (S rows) and the new live gates of `quoteBondWithdrawV22` (B rows). Each expected value is the
// program's (prog rc23 4a5065f5 / engine rc23 3e5970f3 / stake 9712e3c), produced by the TS port in ./prog-port.ts.
// On the base (no fix) every case fails: the collateral helper does not exist, and the stake / bond quotes ignore the inputs.
import { describe, it, expect } from "vitest";
import type * as WT from "../../src/abi/v22-withdraw.js";
import { computeWarmupUnlockedCapital } from "../../src/math/warmup.js";
import { quoteStakeWithdrawNowV5 } from "../../src/abi/v22-stake.js";
import { quoteBondWithdrawV22 } from "../../src/abi/v22-math.js";

const CAP = 1_000_000n;
// Loaded dynamically so that on the base (where the module does not exist yet) each case fails on its own.
const W: Partial<typeof WT> = await import("../../src/abi/v22-withdraw.js").catch(() => ({}));
type In = Parameters<typeof WT.maxWithdrawCollateralV22>[0];
const flat: In = { capital: CAP, pnl: 0n, feeCredits: 0n, hasActiveLegs: false, live: true, nowSlot: 10_000n, lastFeeSlot: 10_000n, vaultTokenBalance: 10_000_000n };
const max = (o: Partial<In>) => W.maxWithdrawCollateralV22?.({ ...flat, ...o }).maxAtoms;

describe("collateral tag 4 (prog v16_program.rs:17866-17985, engine v16.rs:25913-25975)", () => {
  it("C2/C3 open position (long at IM edge / short at MM edge): program pays 0 (engine Stale, v16.rs:25925-25927)", () => {
    expect(max({ hasActiveLegs: true })).toBe(0n);
    expect(max({ hasActiveLegs: true, pnl: -50_000n })).toBe(0n);
  });
  it("C4 flat, pnl -200k: loss settles from principal first, program pays 800k (v16.rs:25943-25946)", () => {
    expect(max({ pnl: -200_000n })).toBe(800_000n);
  });
  it("C5 flat, bankrupt (pnl -1.2M): program pays 0", () => {
    expect(max({ pnl: -1_200_000n })).toBe(0n);
  });
  it("C6 +300k PnL in warmup: the engine never locks CAPITAL for warmup, program pays 1M (v16.rs:25944-25960 read capital only)", () => {
    expect(max({ pnl: 300_000n })).toBe(CAP);
    // computeWarmupUnlockedCapital keeps its leverage-cap meaning (100k here) and is documented as NOT a withdraw limit.
    expect(computeWarmupUnlockedCapital(CAP, 10_000n, 9_900n, 1_000n)).toBe(100_000n);
  });
  it("C7 maintenance fee 100k pending: program crystallizes it first and pays 900k (v16_program.rs:17957-17968)", () => {
    expect(max({ maintenanceFeePerSlot: 100n, lastFeeSlot: 9_000n })).toBe(900_000n);
  });
  it("C8 fee debt -50k: program pays 950k (equity_after, v16.rs:25953-25960)", () => {
    expect(max({ feeCredits: -50_000n })).toBe(950_000n);
  });
  it("C9 resolved market: tag 4 is Live-only (v16_program.rs:17896-17898), program pays 0 through Withdraw", () => {
    expect(max({ live: false })).toBe(0n);
  });
  it("C10 Live but permissionless-resolve matured: OracleStale (v16_program.rs:17924, 14432-14440), program pays 0", () => {
    expect(max({ resolveMatured: true })).toBe(0n);
  });
  it("C11 active forced-close ledger: LockActive (v16.rs:25936-25942), program pays 0", () => {
    expect(max({ closeLedgerActive: true })).toBe(0n);
  });
  it("C12 vault token 10 atoms short: require_token_balance (v16_program.rs:17979-17980), program pays 999_990", () => {
    expect(max({ vaultTokenBalance: CAP - 10n })).toBe(CAP - 10n);
  });
});

const pool = {
  totalDeposited: 10_000_000n, totalWithdrawn: 0n, totalFlushed: 0n, totalReturned: 0n, totalFeesEarned: 0n,
  realizedJuniorLoss: 0n, totalLpSupply: 10_001_000n,
};
const noUnits = { unitsStake: 0n, unitsTotal: 0n };

describe("stake v5 withdraw (percolator-stake release/v22-stake 9712e3c processor.rs:1339-1600)", () => {
  it("S2 inside the deposit cooldown: program refuses CooldownNotElapsed (processor.rs:1501-1507), quote must say 0", () => {
    const q = quoteStakeWithdrawNowV5(pool, noUnits, 0n, 10_000_000n, 2_000_000n, undefined, {
      cooldown: { nowSlot: 100_000n, lastDepositSlot: 99_500n, cooldownSlots: 1_000n },
    });
    expect(q?.maxCollateralNow).toBe(0n);
    expect(q?.maxLpNow).toBe(0n);
  });
  it("S5 mode-0 fee payout not yet accrued: program pre-accrues 600k before pricing (processor.rs:1520 -> 2691-2830) and pays 2_119_788", () => {
    const q = quoteStakeWithdrawNowV5(pool, noUnits, 0n, 10_600_000n, 2_000_000n, undefined, { feeAccrual: { poolMode: 0, attributableAtoms: 600_000n } });
    expect(q?.maxCollateralNow).toBe(2_119_788n);
  });
});

const tranche = {
  cBAtoms: 500_000n, bSharesTotal: 1_000n, couponArrearsAtoms: 0n, couponUnfundedAtoms: 0n, couponAccrualRem: 0n,
  couponGateSeen: 0n, lastCouponSlot: 10_000n, couponBpsPerYear: 0, couponUtilBonusBps: 0,
};
const base = { shares: 1_000n, tranche, nowSlot: 10_000n, seniorDrawnAtoms: 0n, vaultValue: 2_000_000n, seniorClaimEff: 1_000_000n };
const live0 = { nCapAfter: 10_000n, oiLongQ: 0n, oiShortQ: 0n, lpEffAbsQ: 0n };

describe("bond tag 110 Live (prog v16_program.rs:43900-43998)", () => {
  it("B2 vault LP holds inventory: engine withdraw is flat-only (v16.rs:25925 via v16_program.rs:43992), quote must refuse", () => {
    const q = quoteBondWithdrawV22({ ...base, live: { ...live0, lpEffAbsQ: 500n } });
    expect(q.refusal).not.toBeNull();
    expect(q.refusal?.code).toBe(19);
  });
  it("B3 pots nav < senior claim: BondCapacityLocked (v16_program.rs:43944-43946)", () => {
    const q = quoteBondWithdrawV22({ ...base, nav: 900_000n, live: live0 });
    expect(q.refusal?.code).toBe(108);
  });
  it("B4 harvestable LP fee pending: VaultLpHarvestPending (v16_program.rs:43924-43926)", () => {
    const q = quoteBondWithdrawV22({ ...base, harvestableFeeAtoms: 1n, live: live0 });
    expect(q.refusal).not.toBeNull();
    expect(q.refusal?.code).toBe(84);
  });
  it("B5 payout 500k > vault LP capital 300k: engine LockActive (v16.rs:25944-25946 via v16_program.rs:43992)", () => {
    const q = quoteBondWithdrawV22({ ...base, lpCapitalAtoms: 300_000n, live: live0 });
    expect(q.refusal).not.toBeNull();
    expect(q.refusal?.code).toBe(21);
  });
});
