/**
 * Coverage + Rust-layout parity for src/abi/v22-state.ts. Every buffer is laid out byte-by-byte from the
 * percolator-prog 4a5065f5 struct definitions (`src/v16_program.rs`, `src/bond_v20.rs`); no SDK encoder is used.
 *
 * Rust refs (4a5065f5):
 *  - LpRedemptionV16 v16_program.rs:6864-6874 (96 B), LpRedemptionExtV22 :6925-6934 (16 B), read_lp_redemption_ext :6941
 *  - BondTrancheV20 :7371 (176 B), validate_bond_tranche :7472; bond_config_ok bond_v20.rs:63; COUPON_DENOM bond_v20.rs:422
 *  - BondPositionV20 :7539 (96 B), validate_bond_position :7559
 *  - InsuranceUnitsV20 :7642 (192 B), validate_insurance_units :7690
 *  - G9FeedAllowlistV22 :7740 (2,064 B), validate_g9_feed_allowlist :7790
 */
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  ACCOUNT_KIND, LAYOUT_V22, LAYOUT_V22_STAGE_A, WRAPPER_ACCOUNT_MAGIC, UnknownLayoutError,
} from "../src/abi/layout.js";
import {
  BOND_COUPON_DENOM_V22, decodeBondPositionV20, decodeBondTrancheV20, decodeG9FeedAllowlistV22,
  decodeInsuranceUnitsV20, decodeLpRedemptionV22, redemptionDataSizesV22,
} from "../src/abi/v22-state.js";

const VER = LAYOUT_V22.version;

function acct(kind: number, bodyLen: number, version = VER): { b: Uint8Array; v: DataView } {
  const b = new Uint8Array(16 + bodyLen);
  const v = new DataView(b.buffer);
  v.setBigUint64(0, WRAPPER_ACCOUNT_MAGIC, true);
  v.setUint16(8, version, true);
  b[10] = kind;
  return { b, v };
}
const put128 = (v: DataView, off: number, x: bigint) => {
  v.setBigUint64(16 + off, x & ((1n << 64n) - 1n), true);
  v.setBigUint64(16 + off + 8, x >> 64n, true);
};
const fill = (b: Uint8Array, off: number, byte: number, n = 32) => b.fill(byte, 16 + off, 16 + off + n);

/** A valid BondTrancheV20 (v16_program.rs:7371-7424 offsets). */
function tranche(mut?: (b: Uint8Array, v: DataView) => void): Uint8Array {
  const { b, v } = acct(ACCOUNT_KIND.BondTranche, 176);
  fill(b, 0, 9);
  put128(v, 32, 1000n); // c_b_atoms
  put128(v, 48, 900n); // b_shares_total
  put128(v, 64, 5n); // principal_in_lp
  put128(v, 80, 6n); // bond_drawn_outstanding
  v.setBigUint64(16 + 96, 777n, true); // last_coupon_slot
  v.setUint16(16 + 104, 801, true); // coupon_bps_per_year
  v.setUint16(16 + 106, 0, true); // util bonus (bond_v20.rs:49 max 0)
  v.setUint32(16 + 108, 9001, true); // cooldown
  v.setUint16(16 + 112, 4999, true); // cap
  b[16 + 114] = 2; // version
  b[16 + 115] = 250; // bump
  v.setUint16(16 + 116, 1234, true); // last_util_bps
  v.setBigUint64(16 + 120, 4242n, true); // coupon_paid_total
  put128(v, 128, 11n); // R
  put128(v, 144, 7n); // U
  v.setBigUint64(16 + 160, 5n, true); // rem
  v.setBigUint64(16 + 168, 3n, true); // gate seen
  mut?.(b, v);
  return b;
}

describe("BOND_COUPON_DENOM_V22 (bond_v20.rs:422 = BPS * SLOTS_PER_YEAR, :42 78_840_000)", () => {
  it("equals 10_000 * 78_840_000", () => expect(BOND_COUPON_DENOM_V22).toBe(788_400_000_000n));
});

describe("decodeBondTrancheV20", () => {
  it("decodes every field at its Rust offset", () => {
    const t = decodeBondTrancheV20(tranche());
    expect(t.marketGroup.toBytes().every((x) => x === 9)).toBe(true);
    expect([t.cBAtoms, t.bSharesTotal, t.principalInLpAtoms, t.bondDrawnOutstandingAtoms, t.lastCouponSlot]).toEqual([1000n, 900n, 5n, 6n, 777n]);
    expect([t.couponBpsPerYear, t.couponUtilBonusBps, t.bondCooldownSlots, t.bondCapBpsOfC, t.version, t.bump, t.lastUtilBps])
      .toEqual([801, 0, 9001, 4999, 2, 250, 1234]);
    expect([t.couponPaidTotalAtoms, t.couponArrearsAtoms, t.couponUnfundedAtoms, t.couponAccrualRem, t.couponGateSeen]).toEqual([4242n, 11n, 7n, 5n, 3n]);
  });
  it("accepts the boundary dials and K == B == 0 (a fully redeemed tranche)", () => {
    const t = decodeBondTrancheV20(tranche((b, v) => {
      put128(v, 32, 0n); put128(v, 48, 0n); put128(v, 144, 0n);
      v.setUint16(16 + 104, 2000, true); v.setUint32(16 + 108, 1_512_000, true); v.setUint16(16 + 112, 1, true);
      v.setUint16(16 + 116, 10_000, true); v.setBigUint64(16 + 160, BOND_COUPON_DENOM_V22 - 1n, true);
    }));
    expect([t.cBAtoms, t.couponAccrualRem]).toEqual([0n, BOND_COUPON_DENOM_V22 - 1n]);
  });
  it("refuses a wrong layout VERSION with the exact error", () => {
    const { b } = acct(ACCOUNT_KIND.BondTranche, 176, 18);
    expect(() => decodeBondTrancheV20(b)).toThrow(/^decodeBondTrancheV20: invalid v17 version \(18 is not a known layout; this SDK decodes VERSION 19\)/);
    try { decodeBondTrancheV20(b); } catch (e) { expect((e as UnknownLayoutError).code).toBe("UNKNOWN_VERSION"); }
  });
  it("refuses a wrong discriminator (kind) with the exact error", () => {
    const { b } = acct(ACCOUNT_KIND.BondPosition, 176);
    expect(() => decodeBondTrancheV20(b)).toThrow("decodeBondTrancheV20: invalid v17 account kind (12 !== 11)");
  });
  it("refuses bad magic and a sub-header buffer", () => {
    const b = tranche(); b[0] ^= 1;
    expect(() => decodeBondTrancheV20(b)).toThrow("decodeBondTrancheV20: invalid v17 magic");
    expect(() => decodeBondTrancheV20(new Uint8Array(15))).toThrow("decodeBondTrancheV20: data too short (15 < 16)");
  });
  it("refuses a short body (the 144 B v1.5 form and 176-1) with the exact error", () => {
    expect(() => decodeBondTrancheV20(tranche().subarray(0, 16 + 144))).toThrow("decodeBondTrancheV20: account too short: 160 < 192");
    expect(() => decodeBondTrancheV20(tranche().subarray(0, 16 + 175))).toThrow("decodeBondTrancheV20: account too short: 191 < 192");
  });
  const INVALID = "decodeBondTrancheV20: invalid account data: bond tranche fails the program's validate_bond_tranche";
  const cases: Array<[string, (b: Uint8Array, v: DataView) => void]> = [
    ["version 1", (b) => { b[16 + 114] = 1; }],
    ["zero market group", (b) => { fill(b, 0, 0); }],
    ["coupon bps 2001", (_b, v) => v.setUint16(16 + 104, 2001, true)],
    ["util bonus 1 (max is 0)", (_b, v) => v.setUint16(16 + 106, 1, true)],
    ["cooldown 8999", (_b, v) => v.setUint32(16 + 108, 8999, true)],
    ["cooldown 1_512_001", (_b, v) => v.setUint32(16 + 108, 1_512_001, true)],
    ["cap 0", (_b, v) => v.setUint16(16 + 112, 0, true)],
    ["cap 5001", (_b, v) => v.setUint16(16 + 112, 5001, true)],
    ["last_util 10001", (_b, v) => v.setUint16(16 + 116, 10_001, true)],
    ["padding[0] set", (b) => { b[16 + 118] = 1; }],
    ["padding[1] set", (b) => { b[16 + 119] = 1; }],
    ["K == 0, B != 0", (_b, v) => { put128(v, 32, 0n); put128(v, 144, 0n); }],
    ["K != 0, B == 0", (_b, v) => put128(v, 48, 0n)],
    ["rem == COUPON_DENOM", (_b, v) => v.setBigUint64(16 + 160, BOND_COUPON_DENOM_V22, true)],
    ["U > K", (_b, v) => put128(v, 144, 1001n)],
  ];
  for (const [name, m] of cases) it(`refuses ${name} (validate_bond_tranche :7472)`, () => expect(() => decodeBondTrancheV20(tranche(m))).toThrow(INVALID));
});

/** A valid BondPositionV20 (v16_program.rs:7539-7555). */
function position(mut?: (b: Uint8Array, v: DataView) => void): Uint8Array {
  const { b, v } = acct(ACCOUNT_KIND.BondPosition, 96);
  fill(b, 0, 7);
  put128(v, 32, (1n << 100n) + 3n);
  put128(v, 48, 9n);
  v.setBigUint64(16 + 64, 99n, true);
  b[16 + 72] = 1; b[16 + 73] = 251;
  mut?.(b, v);
  return b;
}
describe("decodeBondPositionV20", () => {
  it("decodes at the Rust offsets (shares > 2^64 exercises the high limb)", () => {
    const p = decodeBondPositionV20(position());
    expect([p.shares, p.pendingWithdrawShares, p.requestSlot, p.version, p.bump]).toEqual([(1n << 100n) + 3n, 9n, 99n, 1, 251]);
    expect(p.owner.toBytes().every((x) => x === 7)).toBe(true);
  });
  it("accepts pending == shares", () => {
    expect(decodeBondPositionV20(position((_b, v) => put128(v, 48, (1n << 100n) + 3n))).pendingWithdrawShares).toBe((1n << 100n) + 3n);
  });
  it("refuses wrong VERSION / kind / short with exact errors", () => {
    expect(() => decodeBondPositionV20(acct(ACCOUNT_KIND.BondPosition, 96, 21).b)).toThrow(/^decodeBondPositionV20: invalid v17 version \(21 is not a known layout/);
    expect(() => decodeBondPositionV20(acct(ACCOUNT_KIND.BondTranche, 96).b)).toThrow("decodeBondPositionV20: invalid v17 account kind (11 !== 12)");
    expect(() => decodeBondPositionV20(position().subarray(0, 16 + 95))).toThrow("decodeBondPositionV20: account too short: 111 < 112");
  });
  const INVALID = "decodeBondPositionV20: invalid account data: bond position fails the program's validate_bond_position";
  const cases: Array<[string, (b: Uint8Array, v: DataView) => void]> = [
    ["version 0", (b) => { b[16 + 72] = 0; }],
    ["zero owner", (b) => fill(b, 0, 0)],
    ["pending > shares", (_b, v) => put128(v, 48, (1n << 100n) + 4n)],
    ["padding set", (b) => { b[16 + 79] = 1; }],
    ["reserved set", (b) => { b[16 + 95] = 1; }],
  ];
  for (const [name, m] of cases) it(`refuses ${name} (validate_bond_position :7559)`, () => expect(() => decodeBondPositionV20(position(m))).toThrow(INVALID));
});

/** A valid InsuranceUnitsV20 (v16_program.rs:7642-7680). */
function units(mut?: (b: Uint8Array, v: DataView) => void): Uint8Array {
  const { b, v } = acct(ACCOUNT_KIND.InsuranceUnits, 192);
  fill(b, 0, 5);
  put128(v, 32, 30n); put128(v, 48, 10n); put128(v, 64, 20n); put128(v, 80, 1n);
  put128(v, 96, 2n); put128(v, 112, 3n);
  v.setBigUint64(16 + 128, 4n, true);
  b[16 + 136] = 1; b[16 + 137] = 249;
  put128(v, 144, 5n);
  v.setBigUint64(16 + 160, 6n, true); v.setBigUint64(16 + 168, 7n, true);
  put128(v, 176, 8n);
  mut?.(b, v);
  return b;
}
describe("decodeInsuranceUnitsV20", () => {
  it("decodes at the Rust offsets", () => {
    const u = decodeInsuranceUnitsV20(units());
    expect([u.unitsTotal, u.unitsStake, u.unitsCreator, u.backstopReceivableAtoms, u.snapInsuranceMintAtoms, u.snapInsuranceFreeAtoms, u.snapSlot, u.version, u.bump,
      u.creatorPaidToStakeAtoms, u.g9PendingSlot, u.g9Epoch, u.g9EpochDrawnAtoms]).toEqual([30n, 10n, 20n, 1n, 2n, 3n, 4n, 1, 249, 5n, 6n, 7n, 8n]);
  });
  it("refuses wrong VERSION / kind / short (160 B round-1 ledger) with exact errors", () => {
    expect(() => decodeInsuranceUnitsV20(acct(ACCOUNT_KIND.InsuranceUnits, 192, 0).b)).toThrow(/^decodeInsuranceUnitsV20: invalid v17 version \(0 is not a known layout/);
    expect(() => decodeInsuranceUnitsV20(acct(ACCOUNT_KIND.G9FeedAllowlist, 192).b)).toThrow("decodeInsuranceUnitsV20: invalid v17 account kind (15 !== 13)");
    expect(() => decodeInsuranceUnitsV20(units().subarray(0, 16 + 160))).toThrow("decodeInsuranceUnitsV20: account too short: 176 < 208");
  });
  const INVALID = "decodeInsuranceUnitsV20: invalid account data: insurance units fail the program's validate_insurance_units";
  const cases: Array<[string, (b: Uint8Array, v: DataView) => void]> = [
    ["version 2", (b) => { b[16 + 136] = 2; }],
    ["zero market", (b) => fill(b, 0, 0)],
    ["stake + creator != total", (_b, v) => put128(v, 32, 31n)],
    ["padding set", (b) => { b[16 + 143] = 1; }],
  ];
  for (const [name, m] of cases) it(`refuses ${name} (validate_insurance_units :7690)`, () => expect(() => decodeInsuranceUnitsV20(units(m))).toThrow(INVALID));
});

/** G9FeedAllowlistV22 (v16_program.rs:7740-7758): count,version,bump,pending_count,pad[4],pending_slot u64, then 4 x [16][32]. */
function g9(mut?: (b: Uint8Array) => void): Uint8Array {
  const { b, v } = acct(ACCOUNT_KIND.G9FeedAllowlist, 2064);
  b[16] = 2; b[17] = 1; b[18] = 254; b[19] = 0;
  void v;
  b.fill(1, 32, 64); b.fill(2, 64, 96); // keys[0], keys[1]
  b.fill(9, 32 + 512, 64 + 512); b.fill(8, 64 + 512, 96 + 512); // owners[0], owners[1]
  mut?.(b);
  return b;
}
const slot = (i: number, idx: number) => 32 + 512 * idx + 32 * i; // absolute offset of entry i in array idx
describe("decodeG9FeedAllowlistV22", () => {
  it("decodes keys, owners and a pending proposal at the Rust offsets", () => {
    const b = g9((x) => {
      x[19] = 1; new DataView(x.buffer).setBigUint64(16 + 8, 123n, true);
      x.fill(0x31, slot(0, 2), slot(0, 2) + 32); x.fill(0x41, slot(0, 3), slot(0, 3) + 32);
    });
    const g = decodeG9FeedAllowlistV22(b);
    expect([g.count, g.version, g.bump, g.pendingCount, g.pendingSlot]).toEqual([2, 1, 254, 1, 123n]);
    expect([g.keys[0].toBytes()[0], g.keys[1].toBytes()[0], g.owners[0].toBytes()[0], g.owners[1].toBytes()[0]]).toEqual([1, 2, 9, 8]);
    expect([g.pendingKeys[0].toBytes()[0], g.pendingOwners[0].toBytes()[0]]).toEqual([0x31, 0x41]);
  });
  it("accepts a full list (16 of 16) and duplicate owners (Rust only requires distinct KEYS)", () => {
    const b = g9((x) => {
      x[16] = 16;
      for (let i = 0; i < 16; i++) { x.fill(i + 1, slot(i, 0), slot(i, 0) + 32); x.fill(5, slot(i, 1), slot(i, 1) + 32); }
    });
    const g = decodeG9FeedAllowlistV22(b);
    expect([g.keys.length, g.owners.length]).toEqual([16, 16]);
  });
  it("refuses wrong VERSION / kind / short with exact errors", () => {
    expect(() => decodeG9FeedAllowlistV22(acct(ACCOUNT_KIND.G9FeedAllowlist, 2064, 18).b)).toThrow(/^decodeG9FeedAllowlistV22: invalid v17 version \(18 is not a known layout/);
    expect(() => decodeG9FeedAllowlistV22(acct(ACCOUNT_KIND.LpRedemption, 2064).b)).toThrow("decodeG9FeedAllowlistV22: invalid v17 account kind (6 !== 15)");
    expect(() => decodeG9FeedAllowlistV22(g9().subarray(0, 16 + 2063))).toThrow("decodeG9FeedAllowlistV22: account too short: 2079 < 2080");
  });
  const HDR = "decodeG9FeedAllowlistV22: invalid account data: allowlist header invalid";
  it("refuses a bad header (validate_g9_feed_allowlist :7801-7805)", () => {
    expect(() => decodeG9FeedAllowlistV22(g9((x) => { x[17] = 2; }))).toThrow(HDR);
    expect(() => decodeG9FeedAllowlistV22(g9((x) => { x[16] = 17; }))).toThrow(HDR);
    expect(() => decodeG9FeedAllowlistV22(g9((x) => { x[19] = 17; }))).toThrow(HDR);
    expect(() => decodeG9FeedAllowlistV22(g9((x) => { x[20 + 3] = 1; }))).toThrow(HDR);
  });
  it("refuses a zero or duplicated listed key and a non-zero unlisted slot", () => {
    expect(() => decodeG9FeedAllowlistV22(g9((x) => x.fill(0, slot(1, 0), slot(1, 0) + 32)))).toThrow("decodeG9FeedAllowlistV22: invalid account data: listed key 1 is zero or duplicated");
    expect(() => decodeG9FeedAllowlistV22(g9((x) => x.fill(1, slot(1, 0), slot(1, 0) + 32)))).toThrow("decodeG9FeedAllowlistV22: invalid account data: listed key 1 is zero or duplicated");
    expect(() => decodeG9FeedAllowlistV22(g9((x) => { x[slot(2, 0)] = 1; }))).toThrow("decodeG9FeedAllowlistV22: invalid account data: unlisted key slot 2 is not zero");
    expect(() => decodeG9FeedAllowlistV22(g9((x) => { x[slot(2, 1)] = 1; }))).toThrow("decodeG9FeedAllowlistV22: invalid account data: unlisted owner slot 2 is not zero");
  });
});

describe("decodeLpRedemptionV22 / redemptionDataSizesV22", () => {
  /** LpRedemptionV16 (:6864) + optional LpRedemptionExtV22 (:6925) at body 96..112. */
  function redemption(ext: boolean, mut?: (b: Uint8Array, v: DataView) => void): Uint8Array {
    const { b, v } = acct(ACCOUNT_KIND.LpRedemption, ext ? 112 : 96);
    fill(b, 0, 3); fill(b, 32, 4);
    put128(v, 64, 55n); v.setBigUint64(16 + 80, 66n, true); b[16 + 88] = 1; b[16 + 89] = 253;
    if (ext) { v.setBigUint64(16 + 96, 0x1122334455667788n, true); b[16 + 104] = 1; }
    mut?.(b, v);
    return b;
  }
  it("legacy 112 B reads the extension as all-zero", () => {
    const r = decodeLpRedemptionV22(redemption(false));
    expect([r.shares, r.requestSlot, r.version, r.bump, r.extended, r.minPayoutAtoms, r.keeperOk]).toEqual([55n, 66n, 1, 253, false, 0n, false]);
    expect(r.registry.toBytes()[0]).toBe(3); expect(r.redeemer.toBytes()[0]).toBe(4);
  });
  it("128 B reads min_payout and keeper_ok (:6925-6934)", () => {
    const r = decodeLpRedemptionV22(redemption(true));
    expect([r.extended, r.minPayoutAtoms, r.keeperOk]).toEqual([true, 0x1122334455667788n, true]);
    expect(decodeLpRedemptionV22(redemption(true, (b) => { b[16 + 104] = 0; })).keeperOk).toBe(false);
  });
  it("a 113..127 byte account is still legacy (read_lp_redemption_ext :6942 len < 128)", () => {
    const r = decodeLpRedemptionV22(redemption(true).subarray(0, 127));
    expect([r.extended, r.minPayoutAtoms, r.keeperOk]).toEqual([false, 0n, false]);
  });
  it("refuses keeper_ok = 2 and every reserved byte (:6951)", () => {
    const E = "decodeLpRedemptionV22: invalid account data: redemption extension invalid (keeper_ok > 1 or reserved bytes set)";
    expect(() => decodeLpRedemptionV22(redemption(true, (b) => { b[16 + 104] = 2; }))).toThrow(E);
    for (let i = 105; i < 112; i++) expect(() => decodeLpRedemptionV22(redemption(true, (b) => { b[16 + i] = 1; }))).toThrow(E);
  });
  it("refuses wrong VERSION / kind / short with exact errors", () => {
    expect(() => decodeLpRedemptionV22(acct(ACCOUNT_KIND.LpRedemption, 96, 18).b)).toThrow(/^decodeLpRedemptionV22: invalid v17 version \(18 is not a known layout/);
    expect(() => decodeLpRedemptionV22(acct(ACCOUNT_KIND.BondTranche, 96).b)).toThrow("decodeLpRedemptionV22: invalid v17 account kind (11 !== 6)");
    expect(() => decodeLpRedemptionV22(redemption(false).subarray(0, 111))).toThrow("decodeLpRedemptionV22: account too short: 111 < 112");
  });
  it("redemptionDataSizesV22 = [16+96, 16+96+16]; default table and an explicit one agree", () => {
    expect(redemptionDataSizesV22()).toEqual([112, 128]);
    expect(redemptionDataSizesV22(LAYOUT_V22_STAGE_A)).toEqual([112, 128]);
  });
});

describe("G9 allowlist: Rust validate_g9_feed_allowlist (v16_program.rs:7790-7815) parity", () => {
  const setPending = (x: Uint8Array, n: number, slotVal: bigint) => {
    x[19] = n; new DataView(x.buffer).setBigUint64(16 + 8, slotVal, true);
  };
  const refused = (m: (x: Uint8Array) => void) => expect(() => decodeG9FeedAllowlistV22(g9(m))).toThrow(UnknownLayoutError);
  it("refuses a zero pinned owner on a listed entry (`os[..n].contains(zero)`)", () => refused((x) => x.fill(0, slot(1, 1), slot(1, 1) + 32)));
  it("refuses a zero pending key / pending owner among the pending entries", () => {
    refused((x) => { setPending(x, 1, 5n); x.fill(0x41, slot(0, 3), slot(0, 3) + 32); });
    refused((x) => { setPending(x, 1, 5n); x.fill(0x31, slot(0, 2), slot(0, 2) + 32); });
  });
  it("refuses duplicate pending keys", () => refused((x) => {
    setPending(x, 2, 5n);
    x.fill(0x31, slot(0, 2), slot(0, 2) + 32); x.fill(0x31, slot(1, 2), slot(1, 2) + 32);
    x.fill(0x41, slot(0, 3), slot(0, 3) + 32); x.fill(0x42, slot(1, 3), slot(1, 3) + 32);
  }));
  it("refuses a non-zero unlisted pending slot", () => refused((x) => { setPending(x, 0, 0n); x[slot(0, 2)] = 1; }));
  it("refuses pending_count > 0 with pending_slot == 0, and pending_slot != 0 with pending_count == 0", () => {
    refused((x) => {
      setPending(x, 1, 0n); x.fill(0x31, slot(0, 2), slot(0, 2) + 32); x.fill(0x41, slot(0, 3), slot(0, 3) + 32);
    });
    refused((x) => setPending(x, 0, 9n));
  });
});
