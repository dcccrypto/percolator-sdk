/**
 * Edge-case coverage for src/abi/v22-math.ts: zero, u64/u128 maxima and rounding direction, checked against the
 * program mirrors in percolator-prog feat/v22-rc23-2026-10-22 (vault_lp_v18 bps_*, p4_rescue_ins, bond_v20).
 */
import { describe, expect, it } from "vitest";
import {
  backstopDrawAmountV22,
  bandBoundsV22,
  bandGenesisPriceOkV22,
  bandMinWideAnchorV22,
  bandWidthOkV22,
  bondAtomsForRedemptionV22,
  bondClaimAfterRedemptionV22,
  bondClaimUpperBoundAtV22,
  bondCooldownElapsedV22,
  bondCouponRateBpsV22,
  bondCouponSplitV22,
  bondCouponTakeV22,
  bondImpairedV22,
  bondSettleCouponToV22,
  bondSharesForDepositV22,
  bondUtilBpsV22,
  bondWithdrawLockOkV22,
  bpsCeilV22,
  bpsFloorV22,
  couponArrearsCapV22,
  couponDueV22,
  couponGateSeenV22,
  couponMeterAfterDepositV22,
  couponMeterAfterRedemptionV22,
  couponPayOpenV22,
  couponSettleV22,
  defaultMinPayoutV22,
  dipFloorOkV22,
  displayPriceV22,
  g9DelayElapsedV22,
  g9EpochRoomV22,
  g9PhaseV22,
  g9ProposalOpenV22,
  insMintAdmissibleV22,
  insUnitsForTopupV22,
  insUnitsToBurnV22,
  insUnitsValueV22,
  lotExpForTokenPriceV22,
  mulDivCeilV22,
  mulDivFloorV22,
  parAtomsV22,
  quoteBondDepositV22,
  quoteBondWithdrawV22,
  quoteRescueV22,
  rescueAdmittedV22,
  rescueClaimDeltaV22,
  rescueSharesV22,
  tokensToLotsV22,
  assertUtilBonusZeroV22,
  MAX_ORACLE_PRICE_V22,
} from "../src/abi/v22-math.js";
import {
  G9_DELAY_SLOTS_V22,
  G9_EXEC_WINDOW_SLOTS_V22,
  INS_UNITS_GENESIS_MIN_ATOMS_V22,
  MAX_BAND_BPS_V22,
  RESCUE_MIN_ATOMS_V22,
  SLOTS_PER_YEAR_V22,
} from "../src/abi/v22-wire.js";

const U64 = (1n << 64n) - 1n;
const U128 = (1n << 128n) - 1n;
const D = 10_000n * SLOTS_PER_YEAR_V22;

// A tranche fixture (only the fields the math reads).
const tr = (o: Record<string, unknown> = {}) =>
  ({
    cBAtoms: 1_000_000n,
    bSharesTotal: 1_000_000n,
    couponArrearsAtoms: 0n,
    couponUnfundedAtoms: 0n,
    couponAccrualRem: 0n,
    couponGateSeen: 0n,
    lastCouponSlot: 0n,
    couponBpsPerYear: 800,
    couponUtilBonusBps: 0,
    lastUtilBps: 0,
    couponPaidTotalAtoms: 0n,
    bondCapBpsOfC: 5_000,
    ...o,
  }) as any;

describe("mul_div / bps rounding", () => {
  it("floor vs ceil, zero divisor, u128 product edge", () => {
    expect(mulDivFloorV22(7n, 3n, 2n)).toBe(10n);
    expect(mulDivCeilV22(7n, 3n, 2n)).toBe(11n);
    expect(mulDivCeilV22(6n, 3n, 2n)).toBe(9n); // exact: no +1
    expect(mulDivFloorV22(1n, 1n, 0n)).toBeNull();
    expect(mulDivCeilV22(1n, 1n, 0n)).toBeNull();
    expect(mulDivFloorV22(U128, 1n, 1n)).toBe(U128);
    expect(mulDivCeilV22(U128, 1n, 1n)).toBe(U128);
    expect(mulDivFloorV22(U128, 2n, 1n)).toBeNull();
    expect(mulDivCeilV22(U128, 2n, 1n)).toBeNull();
    expect(mulDivFloorV22(0n, U128, 5n)).toBe(0n);
  });
  it("bps floor/ceil: >10_000 refused, 0 and max x, ceil never below floor", () => {
    expect(bpsFloorV22(5n, 10_001)).toBeNull();
    expect(bpsCeilV22(5n, 10_001)).toBeNull();
    expect(bpsFloorV22(0n, 10_000)).toBe(0n);
    expect(bpsCeilV22(0n, 10_000)).toBe(0n);
    expect(bpsFloorV22(U128, 10_000)).toBe(U128);
    expect(bpsCeilV22(U128, 10_000)).toBe(U128);
    expect(bpsCeilV22(1_001n, 25)).toBe(3n);
    expect(bpsFloorV22(1_001n, 25)).toBe(2n);
    // exact multiple: ceil == floor
    expect(bpsCeilV22(10_000n, 25)).toBe(25n);
    for (const x of [1n, 3n, 9_999n, 10_001n, U64]) {
      for (const b of [0, 1, 25, 5_000, 9_999, 10_000]) {
        const f = bpsFloorV22(x, b)!;
        const c = bpsCeilV22(x, b)!;
        expect(c - f === 0n || c - f === 1n).toBe(true);
      }
    }
  });
});

describe("bond helpers", () => {
  it("bondImpaired, shares for deposit, redemption", () => {
    expect(bondImpairedV22(880n, 800n, 150n)).toBe(true);
    expect(bondImpairedV22(950n, 800n, 150n)).toBe(false);
    expect(bondSharesForDepositV22(5n, 0n, 0n)).toBe(5n); // genesis
    expect(bondSharesForDepositV22(5n, 10n, 0n)).toBeNull(); // no value
    expect(bondSharesForDepositV22(U128, 2n, 1n)).toBeNull(); // overflow
    expect(bondAtomsForRedemptionV22(1n, 0n, 5n)).toBeNull();
    expect(bondAtomsForRedemptionV22(11n, 10n, 5n)).toBeNull();
    expect(bondAtomsForRedemptionV22(1n, 3n, 10n)).toBe(3n); // floor
    expect(bondClaimAfterRedemptionV22(10n, 1n, 0n)).toBeNull();
    expect(bondClaimAfterRedemptionV22(10n, 4n, 3n)).toBeNull();
    expect(bondClaimAfterRedemptionV22(U128, 2n, 3n)).toBeNull(); // overflow in mulDiv
    expect(bondClaimAfterRedemptionV22(10n, 1n, 3n)).toBe(7n); // slice floors to 3
  });
  it("withdraw lock: null capacity, cooldown saturation, util bps", () => {
    expect(bondWithdrawLockOkV22(null, 0n, 0n, 0n)).toBe(true);
    expect(bondWithdrawLockOkV22(null, 1n, 0n, 0n)).toBe(false);
    expect(bondWithdrawLockOkV22(10n, 3n, 7n, 9n)).toBe(true);
    expect(bondWithdrawLockOkV22(8n, 3n, 7n, 9n)).toBe(false);
    expect(bondCooldownElapsedV22(U64, U64, 9_000)).toBe(true); // saturating add
    expect(bondCooldownElapsedV22(U64 - 1n, U64, 1)).toBe(false);
    expect(bondUtilBpsV22(0n, 0n)).toBe(0);
    expect(bondUtilBpsV22(1n, 0n)).toBe(10_000);
    expect(bondUtilBpsV22(U128, 5n)).toBe(10_000); // product overflow
    expect(bondUtilBpsV22(200n, 100n)).toBe(10_000);
    expect(bondUtilBpsV22(1n, 3n)).toBe(3_333); // floor
  });
  it("coupon rate clamps util; due floors, clamps dslots, overflows to null", () => {
    expect(bondCouponRateBpsV22(800, 100, 20_000)).toBe(900);
    expect(bondCouponRateBpsV22(800, 1, 1)).toBe(800); // floor
    expect(couponDueV22(1_000_000_000n, 800, SLOTS_PER_YEAR_V22 * 5n)).toBe(80_000_000n);
    expect(couponDueV22(1n, 800, 1n)).toBe(0n);
    expect(couponDueV22(U128, 800, 1n)).toBeNull();
    expect(couponDueV22(0n, 800, 10n)).toBe(0n);
    expect(couponArrearsCapV22(1_000_000n, 800)).toBe(80_000n);
    expect(bondCouponSplitV22(1_000n, 900n)).toEqual([500n, 500n]);
    expect(bondCouponSplitV22(1_000n, 100n)).toEqual([100n, 900n]);
    expect(bondCouponSplitV22(0n, 100n)).toEqual([0n, 0n]);
  });
  it("coupon meter after deposit/redemption", () => {
    expect(couponMeterAfterDepositV22(7n, 0n, 100n)).toBe(7n);
    expect(couponMeterAfterDepositV22(10n, 1_000n, 1n)).toBe(11n); // ceil
    expect(couponMeterAfterDepositV22(U128, 1n, 2n)).toBeNull(); // product overflow
    expect(couponMeterAfterDepositV22(U128, 1n, 1n)).toBeNull(); // sum overflow
    expect(couponMeterAfterRedemptionV22(10n, 1n, 3n)).toBe(7n);
    expect(couponMeterAfterRedemptionV22(10n, 1n, 0n)).toBeNull();
    expect(couponMeterAfterRedemptionV22(10n, 4n, 3n)).toBeNull();
    expect(couponMeterAfterRedemptionV22(U128, 2n, 3n)).toBeNull();
    expect(couponMeterAfterRedemptionV22(10n, 3n, 3n)).toBe(0n);
  });
  it("couponPayOpen, gateSeen", () => {
    expect(couponPayOpenV22(false, true, 0n, 0n)).toBe(true);
    expect(couponPayOpenV22(false, true, 1n, 0n)).toBe(false);
    expect(couponPayOpenV22(false, false, 0n, 0n)).toBe(false);
    expect(couponGateSeenV22((1n << 64n) + 5n, true)).toBe(5n); // truncated to u64
    expect(couponGateSeenV22(U128, false)).toBe(U64);
  });
  it("assertUtilBonusZero", () => {
    expect(() => assertUtilBonusZeroV22(0)).not.toThrow();
    expect(() => assertUtilBonusZeroV22(1)).toThrow(/utilisation bonus/);
  });
});

describe("couponSettle / settleTo / take overflow + cap paths", () => {
  it("closed gate forfeits and keeps rem", () => {
    expect(couponSettleV22(1n, 0n, 9n, 800, 10n, false, 1n)).toEqual([0n, 9n]);
  });
  it("each u128 overflow guard returns null", () => {
    expect(couponSettleV22(U128, 0n, 0n, 800, 1n, true, U128)).toBeNull(); // n1
    expect(couponSettleV22(1n << 110n, 0n, 0n, 1, SLOTS_PER_YEAR_V22, true, 1n << 110n)).toBeNull(); // n2
    expect(couponSettleV22(1n, 0n, U128, 800, 1n, true, 1n)).toBeNull(); // num
    // funded claim * rate overflows while the accrual base is tiny (bondValue = 0 -> n1 = 0)
    expect(couponSettleV22(U128, 0n, 0n, 800, 1n, true, 0n)).toBeNull(); // c1
    // c2: funded * rate fits, * SLOTS_PER_YEAR does not
    expect(couponSettleV22(1n << 110n, 0n, 0n, 1, 1n, true, 0n)).toBeNull();
  });
  it("cap binds: pays room and zeroes the remainder; fully capped pays 0", () => {
    // K=1e6, rate 800 -> funded = 920_001 -> cap = 73_600 < U (79_999) -> room 0
    const r = couponSettleV22(1_000_000n, 79_999n, 5n, 800, SLOTS_PER_YEAR_V22, true, 1_000_000n);
    expect(r).toEqual([0n, 5n].map(() => 0n));
    // room > 0: U=10, funded = 999_990 -> cap = 79_999 (79_999.2 floored) -> room 79_989 < due 160_000
    // (two years accrue but dt is clamped to one year, so due = 80_000 > room) -> pays room, zeroes rem
    const r2 = couponSettleV22(1_000_000n, 10n, 0n, 800, SLOTS_PER_YEAR_V22 * 2n, true, 1_000_000n);
    expect(r2).toEqual([79_989n, 0n]);
    // room > 0 but due <= room: pays due and keeps the sub-atom remainder
    expect(couponSettleV22(1_000_000n, 0n, 5n, 800, SLOTS_PER_YEAR_V22 / 2n, true, 1_000_000n)).toEqual([40_000n, 5n]);
  });
  it("sub-atom remainder carries", () => {
    const r = couponSettleV22(1n, 0n, 0n, 800, 1n, true, 1n)!;
    expect(r).toEqual([0n, 800n]);
    expect(couponSettleV22(1_000_000n, 0n, D - 800_000_000n, 800, 1n, true, 1_000_000n)).toEqual([1n, 0n]);
  });
  it("settleTo: overflow of the settled sums and a normal accrual", () => {
    const t = tr({ cBAtoms: U128 - 5n, couponAccrualRem: 0n });
    // accrual n1 overflows first -> null from couponSettle
    expect(bondSettleCouponToV22(t, 0n, SLOTS_PER_YEAR_V22, true, false)).toBeNull();
    const ok = bondSettleCouponToV22(tr({ couponGateSeen: 0n }), 0n, SLOTS_PER_YEAR_V22, true, false)!;
    expect(ok.accrued).toBe(80_000n);
    expect(ok.tranche.cBAtoms).toBe(1_080_000n);
    expect(ok.tranche.couponArrearsAtoms).toBe(80_000n);
    // zeroRem
    const z = bondSettleCouponToV22(tr({ cBAtoms: 1n }), 0n, 1n, true, true)!;
    expect(z.tranche.couponAccrualRem).toBe(0n);
    // slot going backwards keeps lastCouponSlot
    const back = bondSettleCouponToV22(tr({ lastCouponSlot: 50n }), 0n, 10n, true, false)!;
    expect(back.tranche.lastCouponSlot).toBe(50n);
    expect(back.accrued).toBe(0n);
    // dirty interval (senior drawn since): forfeits
    const dirty = bondSettleCouponToV22(tr(), 7n, SLOTS_PER_YEAR_V22, true, false)!;
    expect(dirty.accrued).toBe(0n);
  });
  it("sum overflow after a valid settle returns null (post-settle u/k/r guard)", () => {
    // The settle itself succeeds (arrears are not an input to it) and accrues x = 80_000 ...
    const t = tr({ couponArrearsAtoms: U128 });
    expect(couponSettleV22(t.cBAtoms, 0n, 0n, 800, SLOTS_PER_YEAR_V22, true, t.cBAtoms)).toEqual([80_000n, 0n]);
    // ... so bondSettleCouponToV22 returns null only from r = U128 + x > u128.
    expect(bondSettleCouponToV22(t, 0n, SLOTS_PER_YEAR_V22, true, false)).toBeNull();
    // control: without the arrears the same call succeeds, proving the null above is the sum guard
    expect(bondSettleCouponToV22(tr(), 0n, SLOTS_PER_YEAR_V22, true, false)!.accrued).toBe(80_000n);
  });
  it("claim upper bound: nothing, overflow, bound", () => {
    expect(bondClaimUpperBoundAtV22(tr({ cBAtoms: 0n }), 100n)).toBe(0n);
    expect(bondClaimUpperBoundAtV22(tr({ cBAtoms: U128 }), 100n)).toBeNull();
    expect(bondClaimUpperBoundAtV22(tr({ lastCouponSlot: 9_000n }), 1_000n)).toBe(1_000_000n);
    // accrual actually runs (max rate = base + full bonus): K + one year at 800 bps
    expect(bondClaimUpperBoundAtV22(tr(), SLOTS_PER_YEAR_V22)).toBe(1_080_000n);
    // NOTE: the `k > U128_MAX` guard here is unreachable: couponSettleV22 only returns x > 0 when
    // funded*rate*SLOTS_PER_YEAR <= u128 and U < cap (<= 2^128/10^4), which forces K < 2^128 - 2^114 - x.
    // Near-u128 K with accrual returns null from couponSettleV22 (n1/n2/c2 guard) instead.
    expect(bondClaimUpperBoundAtV22(tr({ cBAtoms: U128 - 1n }), 10n)).toBeNull();
  });
  it("take: gate open pays, closed holds, util bonus, overflow", () => {
    const base = {
      tranche: tr(),
      available: 1_000_000n,
      live: true,
      seniorDrawOutstandingAtoms: 0n,
      seniorDrawnAtoms: 0n,
      bondValueBeforeLeg: 1_000_000n,
      nowSlot: SLOTS_PER_YEAR_V22,
    };
    const o = bondCouponTakeV22(base)!;
    expect(o.open).toBe(true);
    expect(o.accrued).toBe(80_000n);
    expect(o.coupon).toBe(80_000n);
    expect(o.rest).toBe(920_000n);
    expect(o.tranche.couponPaidTotalAtoms).toBe(80_000n);
    // leg cap at 50%
    const capd = bondCouponTakeV22({ ...base, available: 100_000n })!;
    expect(capd.coupon).toBe(50_000n);
    // closed: not live
    const c = bondCouponTakeV22({ ...base, live: false })!;
    expect(c.open).toBe(false);
    expect(c.coupon).toBe(0n);
    expect(c.rest).toBe(1_000_000n);
    // senior draw outstanding: closed
    expect(bondCouponTakeV22({ ...base, seniorDrawOutstandingAtoms: 1n })!.openNow).toBe(false);
    // util bonus path (open, bonus != 0), lastUtilBps clamps
    const ub = bondCouponTakeV22({ ...base, tranche: tr({ couponUtilBonusBps: 1_000, lastUtilBps: 10_000 }), utilNowBps: 5_000 })!;
    expect(ub.tranche.lastUtilBps).toBe(5_000);
    expect(ub.accrued).toBe(130_000n); // 800 + 1000 * 5000 / 10000 = 1300 bps
  });
  it("take: overflow and paid-total saturation", () => {
    const base = {
      available: 1n,
      live: true,
      seniorDrawOutstandingAtoms: 0n,
      seniorDrawnAtoms: 0n,
      bondValueBeforeLeg: U128,
      nowSlot: 10n,
    };
    expect(bondCouponTakeV22({ ...base, tranche: tr({ cBAtoms: U128 }) })).toBeNull();
    // r overflow AFTER a successful settle (settle accrues 80_000; arrears U128 + 80_000 > u128)
    const ov = tr({ couponArrearsAtoms: U128 });
    expect(couponSettleV22(ov.cBAtoms, 0n, 0n, 800, SLOTS_PER_YEAR_V22, true, ov.cBAtoms)).toEqual([80_000n, 0n]);
    expect(bondCouponTakeV22({ ...base, nowSlot: SLOTS_PER_YEAR_V22, tranche: ov })).toBeNull();
    expect(bondCouponTakeV22({ ...base, nowSlot: SLOTS_PER_YEAR_V22, tranche: tr() })!.accrued).toBe(80_000n);
    // paid total saturates at u64
    const sat = bondCouponTakeV22({
      ...base,
      available: 1_000n,
      tranche: tr({ couponPaidTotalAtoms: U64, couponArrearsAtoms: 100n }),
      nowSlot: 0n,
    })!;
    expect(sat.coupon).toBe(100n);
    expect(sat.tranche.couponPaidTotalAtoms).toBe(U64);
  });
});

describe("quoteBondDeposit / quoteBondWithdraw refusals", () => {
  const dep = (o: Record<string, unknown> = {}) =>
    quoteBondDepositV22({
      amount: 1_000n,
      tranche: tr(),
      nowSlot: 0n,
      seniorDrawnAtoms: 0n,
      vaultValue: 10_000_000n,
      seniorClaimEff: 1_000_000n,
      ...o,
    } as any);
  it("deposit: ok, 89, 107 (two ways), 15, 123, 124, backstop outstanding", () => {
    const ok = dep();
    expect(ok.refusal).toBeNull();
    expect(ok.shares).toBe(1_000n);
    expect(ok.minShares).toBe(1_000n);
    expect(dep({ slippageBps: 100 }).minShares).toBe(990n);
    expect(dep({ seniorDrawOutstandingAtoms: 1n }).refusal?.code).toBe(89);
    expect(dep({ backstopOutstandingAtoms: 1n }).refusal?.code).toBe(89);
    expect(dep({ vaultValue: 10n }).refusal?.code).toBe(107); // V < senior
    expect(dep({ vaultValue: 1_500_000n, tranche: tr({ cBAtoms: 1_000_000n }) }).refusal?.code).toBe(107); // impaired
    expect(dep({ vaultValue: U128, seniorClaimEff: 0n, tranche: tr({ cBAtoms: U128 }) }).refusal?.code).toBe(15); // settle overflow
    expect(dep({ amount: U128 }).refusal?.code).toBe(15); // kAfter overflow
    expect(dep({ amount: 9_000_000n }).refusal?.code).toBe(123); // above cap
    // 124: tiny deposit mints 0 shares (value >> shares)
    expect(dep({ amount: 1n, tranche: tr({ bSharesTotal: 1n, cBAtoms: 1_000_000n }) }).refusal?.code).toBe(124);
    expect(dep({ amount: 1n, tranche: tr({ bSharesTotal: 1n, cBAtoms: 1_000_000n }) }).shares).toBe(0n);
    // bond layer value zero with shares outstanding -> 107
    expect(dep({ tranche: tr({ cBAtoms: 0n, bSharesTotal: 5n }) }).refusal?.code).toBe(107);
    // share-price product overflow maps to 107 (fail closed, like the program)
    expect(dep({ tranche: tr({ bSharesTotal: U128 }) }).refusal?.code).toBe(107);
  });
  const wd = (o: Record<string, unknown> = {}) =>
    quoteBondWithdrawV22({
      shares: 100n,
      tranche: tr(),
      nowSlot: 0n,
      seniorDrawnAtoms: 0n,
      vaultValue: 10_000_000n,
      seniorClaimEff: 1_000_000n,
      ...o,
    } as any);
  it("withdraw: ok, 109, 89, 110, 108, 15", () => {
    const ok = wd();
    expect(ok.refusal).toBeNull();
    expect(ok.atoms).toBe(100n);
    expect(wd({ slippageBps: 50 }).minOut).toBe(99n);
    expect(wd({ shares: 0n }).refusal?.code).toBe(109);
    expect(wd({ seniorDrawOutstandingAtoms: 1n }).refusal?.code).toBe(89);
    // backstop only halts when live
    expect(wd({ backstopOutstandingAtoms: 1n }).refusal).toBeNull();
    const live = { nCapAfter: 5n, oiLongQ: 1n, oiShortQ: 1n, lpEffAbsQ: 1n };
    expect(wd({ backstopOutstandingAtoms: 1n, live }).refusal?.code).toBe(89);
    expect(wd({ shares: 2_000_000n }).refusal?.code).toBe(110); // shares > total
    expect(wd({ live: { ...live, nCapAfter: 0n } }).refusal?.code).toBe(108);
    expect(wd({ live }).refusal).toBeNull();
    expect(wd({ vaultValue: U128, seniorClaimEff: 0n, tranche: tr({ cBAtoms: U128 }), live }).refusal?.code).toBe(15);
  });
});

describe("insurance units, G9, backstop", () => {
  it("insUnitsForTopup / ToBurn / Value", () => {
    expect(insUnitsForTopupV22(5n, 0n, 0n)).toBe(5n);
    expect(insUnitsForTopupV22(5n, 10n, 0n)).toBeNull();
    expect(insUnitsForTopupV22(5n, 10n, 3n)).toBe(16n); // floor 50/3
    expect(insUnitsToBurnV22(1n, 0n, 5n)).toBeNull();
    expect(insUnitsToBurnV22(1n, 5n, 0n)).toBeNull();
    expect(insUnitsToBurnV22(6n, 5n, 5n)).toBeNull();
    expect(insUnitsToBurnV22(1n, 10n, 3n)).toBe(4n); // ceil 10/3
    expect(insUnitsToBurnV22(U128, 2n, U128)).toBeNull(); // product overflow
    expect(insUnitsValueV22(1n, 0n, 9n)).toBe(0n);
    expect(insUnitsValueV22(6n, 5n, 9n)).toBeNull();
    expect(insUnitsValueV22(1n, 3n, 10n)).toBe(3n);
  });
  it("insMintAdmissible", () => {
    expect(insMintAdmissibleV22(0n, 0n, 0n, 0n)).toBe(true);
    expect(insMintAdmissibleV22(5n, 0n, 1n, 1n)).toBe(false);
    expect(insMintAdmissibleV22(INS_UNITS_GENESIS_MIN_ATOMS_V22, 1n, 0n, 0n)).toBe(true);
    expect(insMintAdmissibleV22(INS_UNITS_GENESIS_MIN_ATOMS_V22 - 1n, 1n, 0n, 0n)).toBe(false);
    expect(insMintAdmissibleV22(5n, U128, 1n, 2n)).toBe(false); // overflow
    expect(insMintAdmissibleV22(10_000n, 10n, 10n, 9_999n)).toBe(true); // loss 1 <= 1+1
    expect(insMintAdmissibleV22(10_000n, 10n, 10n, 9_990n)).toBe(false); // loss 10 > 2
    expect(insMintAdmissibleV22(100n, 10n, 10n, 1_000n)).toBe(true); // value > x
  });
  it("G9 window boundaries", () => {
    const p = 1_000n;
    const start = p + G9_DELAY_SLOTS_V22;
    const end = start + G9_EXEC_WINDOW_SLOTS_V22;
    expect(g9DelayElapsedV22(0n, 99n)).toBe(false);
    expect(g9DelayElapsedV22(p, start - 1n)).toBe(false);
    expect(g9DelayElapsedV22(p, start)).toBe(true);
    expect(g9DelayElapsedV22(p, end - 1n)).toBe(true);
    expect(g9DelayElapsedV22(p, end)).toBe(false);
    expect(g9ProposalOpenV22(0n, 1n)).toBe(false);
    expect(g9ProposalOpenV22(p, end - 1n)).toBe(true);
    expect(g9ProposalOpenV22(p, end)).toBe(false);
    expect(g9PhaseV22(0n, 5n)).toBe("propose");
    expect(g9PhaseV22(p, p)).toBe("wait");
    expect(g9PhaseV22(p, start)).toBe("draw");
    expect(g9PhaseV22(p, end)).toBe("propose");
  });
  it("epoch room and backstop draw clamps", () => {
    expect(g9EpochRoomV22(10_000n, 0n, 10_001)).toBe(0n); // bad cap -> 0
    expect(g9EpochRoomV22(10_000n, 500n, 1_000)).toBe(500n);
    expect(g9EpochRoomV22(10_000n, 1_000n, 1_000)).toBe(0n);
    expect(g9EpochRoomV22(10_000n, 2_000n, 1_000)).toBe(0n);
    expect(backstopDrawAmountV22(500n, 400n, 1_000n, 0n, 10_001)).toBe(0n); // bad cap
    expect(backstopDrawAmountV22(500n, 400n, 1_000n, 0n, 5_000)).toBe(400n);
    expect(backstopDrawAmountV22(500n, 900n, 1_000n, 0n, 5_000)).toBe(500n);
    expect(backstopDrawAmountV22(500n, 900n, 1_000n, 0n, 1_000)).toBe(100n); // room clamp
    expect(backstopDrawAmountV22(500n, 900n, 1_000n, 600n, 1_000)).toBe(0n); // outstanding above cap
  });
});

describe("rescue", () => {
  const MIN = RESCUE_MIN_ATOMS_V22;
  it("shape, not impaired, nav floor, amount", () => {
    expect(rescueAdmittedV22(MIN, 1n, 1n, 0n)).toBe("Shape");
    expect(rescueAdmittedV22(MIN, 1n, 0n, 1n)).toBe("Shape");
    expect(rescueAdmittedV22(MIN, 10n, 10n, 1n)).toBe("NotImpaired");
    expect(rescueAdmittedV22(MIN, U128, U128 + 1n, 1n)).toBe("Shape"); // lhs overflow
    expect(rescueAdmittedV22(MIN, 0n, 10n, 1n)).toBe("NavFloor");
    expect(rescueAdmittedV22(MIN, 1n, 1_000_000n, 1n)).toBe("NavFloor");
    expect(rescueAdmittedV22(MIN - 1n, 9n, 10n, 1n)).toBe("Amount");
    expect(rescueAdmittedV22(U128, 9n, 10n, 1n)).toBe("Amount"); // above mult
  });
  it("shares, claim delta, quote", () => {
    expect(rescueSharesV22(1n, 0n, 1n)).toBeNull();
    expect(rescueSharesV22(1n, 1n, 0n)).toBeNull();
    expect(rescueSharesV22(10n, 3n, 4n)).toBe(7n);
    expect(rescueClaimDeltaV22(1n, 1n, 0n)).toBeNull();
    expect(rescueClaimDeltaV22(10n, 3n, 4n)).toBe(7n);
    const refused = quoteRescueV22({ amount: MIN, v: 10n, par: 10n, shares: 1n });
    expect(refused.admitted).toBe(false);
    expect(refused.refusal).toMatchObject({ code: 114, reason: "NotImpaired" });
    expect(quoteRescueV22({ amount: MIN, v: 0n, par: 10n, shares: 1n }).refusal).toMatchObject({ code: 115, name: "RescueNavFloor" });
    const v = 90_000_000n;
    const q = quoteRescueV22({ amount: MIN, v, par: 100_000_000n, shares: 1_000n, seniorClaim: 5_000n, slippageBps: 100 });
    expect(q.admitted).toBe(true);
    expect(q.shares).toBe((MIN * 1_000n) / v);
    expect(q.minShares).toBe((q.shares! * 9_900n) / 10_000n);
    expect(q.claimDelta).toBe((q.shares! * 5_000n) / 1_000n);
    expect(quoteRescueV22({ amount: MIN, v, par: 100_000_000n, shares: 1_000n }).claimDelta).toBeNull();
  });
});

describe("redemption helpers", () => {
  it("defaultMinPayout guards and floor-to-1", () => {
    expect(defaultMinPayoutV22(1_000_000n)).toBe(999_500n);
    expect(defaultMinPayoutV22(1n)).toBe(1n); // floors to 0 -> clamped to 1
    expect(defaultMinPayoutV22(1n, 0)).toBe(1n);
    expect(() => defaultMinPayoutV22(1n, 6)).toThrow(/slippageBps/);
    expect(defaultMinPayoutV22(10_000n, 6, true)).toBe(9_994n);
    expect(() => defaultMinPayoutV22(1n, 10_001, true)).toThrow();
    expect(() => defaultMinPayoutV22(1n, -1)).toThrow();
    expect(() => defaultMinPayoutV22(1n, 1.5)).toThrow();
    expect(() => defaultMinPayoutV22(0n)).toThrow(/positive/);
    expect(() => defaultMinPayoutV22(-5n)).toThrow(/positive/);
  });
  it("par and dip floor round against the redeemer", () => {
    expect(parAtomsV22(1n, 10n, 0n)).toBeNull();
    expect(parAtomsV22(1n, 10n, 3n)).toBe(3n);
    expect(parAtomsV22(U128, 2n, 1n)).toBeNull();
    // need = ceil(par * 9975 / 10000)
    expect(dipFloorOkV22(9_975n, 10_000n)).toBe(true);
    expect(dipFloorOkV22(9_974n, 10_000n)).toBe(false);
    expect(dipFloorOkV22(1n, 1n)).toBe(true); // ceil(0.9975) = 1
    expect(dipFloorOkV22(0n, 1n)).toBe(false);
    expect(dipFloorOkV22(0n, 0n)).toBe(true);
    expect(dipFloorOkV22(0n, U128)).toBe(false); // product overflow
  });
});

describe("band and lot helpers", () => {
  it("bandBounds domain and clamping", () => {
    expect(bandBoundsV22(0n, 100)).toBeNull();
    expect(bandBoundsV22(MAX_ORACLE_PRICE_V22 + 1n, 100)).toBeNull();
    expect(bandBoundsV22(100n, 0)).toBeNull();
    expect(bandBoundsV22(100n, MAX_BAND_BPS_V22 + 1)).toBeNull();
    expect(bandBoundsV22(100n, 100)).toEqual([99n, 101n]);
    expect(bandBoundsV22(101n, 150)).toEqual([100n, 102n]); // lo ceils (99.485 -> 100), hi floors (102.515 -> 102)
    expect(bandBoundsV22(MAX_ORACLE_PRICE_V22, 100)![1]).toBe(MAX_ORACLE_PRICE_V22); // hi clamped
  });
  it("bandWidthOk / minWideAnchor / genesis price", () => {
    expect(bandWidthOkV22(0n, 100)).toBeNull();
    expect(bandWidthOkV22(100n, 100)).toBe(false);
    expect(bandWidthOkV22(1_000_000n, 100)).toBe(true);
    expect(bandMinWideAnchorV22(0)).toBeNull();
    expect(bandMinWideAnchorV22(MAX_BAND_BPS_V22 + 1)).toBeNull();
    for (const bps of [1, 100, 2_000]) {
      const a = bandMinWideAnchorV22(bps)!;
      expect(bandWidthOkV22(a, bps)).toBe(true);
      expect(bandWidthOkV22(a + 8n, bps)).toBe(true);
    }
    expect(bandGenesisPriceOkV22(1n, 100)).toBe(false);
    expect(bandGenesisPriceOkV22(MAX_ORACLE_PRICE_V22, 100)).toBe(true);
    expect(bandGenesisPriceOkV22(MAX_ORACLE_PRICE_V22, 0)).toBe(false); // no min anchor
  });
  it("lotExp / displayPrice / tokensToLots", () => {
    expect(lotExpForTokenPriceV22(0n)).toBeNull();
    expect(lotExpForTokenPriceV22(-1n)).toBeNull();
    expect(lotExpForTokenPriceV22(10_000_000n)).toBe(0);
    expect(lotExpForTokenPriceV22(1_000_000n)).toBe(1);
    expect(lotExpForTokenPriceV22(1n)).toBe(7);
    expect(displayPriceV22(1_500_000n, 0)).toBe("1.5");
    expect(displayPriceV22(1_000_000n, 0)).toBe("1");
    expect(displayPriceV22(5n, 2)).toBe("0.00000005");
    expect(displayPriceV22(0n, 0)).toBe("0");
    expect(() => displayPriceV22(1n, -1)).toThrow(/lotExp/);
    expect(() => displayPriceV22(1n, 16)).toThrow(/lotExp/);
    expect(() => displayPriceV22(1n, 1.5)).toThrow(/lotExp/);
    expect(tokensToLotsV22(12_345n, 2)).toEqual({ lots: 123n, remainderTokens: 45n });
    expect(tokensToLotsV22(0n, 15)).toEqual({ lots: 0n, remainderTokens: 0n });
    expect(() => tokensToLotsV22(1n, 16)).toThrow(/lotExp/);
    expect(() => tokensToLotsV22(1n, -1)).toThrow(/lotExp/);
  });
});
