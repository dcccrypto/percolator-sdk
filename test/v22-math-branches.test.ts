/**
 * Reference pins for the last uncovered lines of src/abi/v22-math.ts.
 * Rust references (rc23): percolator-prog src/bond_v20.rs (tranche_split3:88, bond_impaired:104,
 * coupon_settle:444, coupon_due:378), percolator src/band_rent.rs (band_bounds, band_width_ok,
 * band_min_wide_anchor:105), percolator-prog src/wave_a_v22.rs:27 (lot_price_below_floor).
 */
import { describe, expect, it } from "vitest";
import * as M from "../src/abi/v22-math.js";

describe("quoteBondDepositV22: impaired only AFTER the coupon is settled", () => {
  // bond_v20.rs:378 coupon_due = floor(C_b * rate * min(dslots, 1y) / (10_000 * 78_840_000)).
  // C_b = 1e9, rate = 800 bps, dslots = one year => 1e9 * 800 / 10_000 = 80_000_000 exactly.
  const tr = {
    cBAtoms: 1_000_000_000n, bSharesTotal: 1_000_000_000n, couponArrearsAtoms: 0n, couponUnfundedAtoms: 0n,
    couponAccrualRem: 0n, couponGateSeen: 0n, lastCouponSlot: 0n, couponBpsPerYear: 800, couponUtilBonusBps: 0, bondCapBpsOfC: 5000,
  };
  it("V == C_s + C_b passes the pre-settle check, then the settled K = C_b + coupon is impaired (107)", () => {
    // bond_impaired (104): tranche_split3(V=1e9, C_s=0, K).bond < K. K=1e9: bond=1e9 -> not impaired.
    expect(M.bondImpairedV22(1_000_000_000n, 0n, 1_000_000_000n)).toBe(false);
    // K = 1.08e9 after settlement: bond = min(1e9, 1.08e9) = 1e9 < K -> impaired.
    expect(M.bondImpairedV22(1_000_000_000n, 0n, 1_080_000_000n)).toBe(true);
    const q = M.quoteBondDepositV22({ amount: 1n, tranche: tr, nowSlot: 78_840_000n, seniorDrawnAtoms: 0n, vaultValue: 1_000_000_000n, seniorClaimEff: 0n });
    expect(q.refusal).toEqual({ code: 107, name: "BondTrancheImpaired" });
    expect(q.settledCoupon).toBe(80_000_000n);
    expect(q.claimAtPrice).toBe(1_080_000_000n);
    expect(q.shares).toBeNull();
    expect(q.trancheAfter).toBeNull();
  });
});

// Literal port of percolator src/band_rent.rs band_bounds / band_width_ok (MIN_BAND_WIDTH_TICKS = 32).
function rustBandWidthOk(anchor: bigint, d: bigint): boolean {
  const loNum = anchor * (10_000n - d);
  const lo = loNum / 10_000n + (loNum % 10_000n !== 0n ? 1n : 0n);
  let hi = (anchor * (10_000n + d)) / 10_000n;
  if (hi > 1_000_000_000_000n) hi = 1_000_000_000_000n;
  return hi - lo >= 32n;
}

describe("bandMinWideAnchorV22 (band_rent.rs:105)", () => {
  it("never reaches the 256-step null exit for any valid d: result is the first anchor of a 9-run of wide bands", () => {
    for (let d = 1; d <= 2000; d++) {
      const a = M.bandMinWideAnchorV22(d);
      expect(a).not.toBeNull();
      for (let k = 0n; k <= 8n; k++) expect(rustBandWidthOk(a! + k, BigInt(d))).toBe(true);
    }
    expect(M.bandMinWideAnchorV22(130)).toBe(1231n);
    expect(M.bandMinWideAnchorV22(0)).toBeNull();
    expect(M.bandMinWideAnchorV22(2001)).toBeNull();
  });
});

describe("lotExpForTokenPriceV22 (wave_a_v22.rs:27: below floor iff mark_e6 < 10_000_000)", () => {
  it("returns the smallest k with price * 10^k >= 1e7; every positive price resolves by k = 7", () => {
    expect(M.lotExpForTokenPriceV22(0n)).toBeNull();
    expect(M.lotExpForTokenPriceV22(-5n)).toBeNull();
    expect(M.lotExpForTokenPriceV22(10_000_000n)).toBe(0);
    expect(M.lotExpForTokenPriceV22(9_999_999n)).toBe(1);
    expect(M.lotExpForTokenPriceV22(400n)).toBe(5);
    expect(M.lotExpForTokenPriceV22(1n)).toBe(7);
  });
});
