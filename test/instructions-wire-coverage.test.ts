/**
 * Exact-byte wire tests for src/abi/instructions.ts.
 *
 * Every live encoder is decoded here with an independent little-endian
 * reader (DataView, not the SDK's enc* helpers) and compared field by field
 * against the documented wire layout. Removed (v12-only) encoders must throw
 * and must name their tag so a bot cannot silently send dead instructions.
 */
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import * as ix from "../src/abi/instructions.js";

const { IX_TAG } = ix;

const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;

const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n));

/** Independent LE cursor reader. */
class Reader {
  private dv: DataView;
  private o = 0;
  constructor(private b: Uint8Array) {
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  u8() { const v = this.dv.getUint8(this.o); this.o += 1; return v; }
  u16() { const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
  u32() { const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
  u64() { const v = this.dv.getBigUint64(this.o, true); this.o += 8; return v; }
  i64() { const v = this.dv.getBigInt64(this.o, true); this.o += 8; return v; }
  u128() { const lo = this.u64(); const hi = this.u64(); return (hi << 64n) | lo; }
  i128() { const lo = this.u64(); const hi = this.i64(); return (hi << 64n) | lo; }
  pk() { const v = new PublicKey(this.b.slice(this.o, this.o + 32)); this.o += 32; return v.toBase58(); }
  get pos() { return this.o; }
  done() { expect(this.o, "trailing/missing bytes").toBe(this.b.length); }
}

type Field = ["u8" | "u16" | "u32" | "u64" | "i64" | "u128" | "i128", bigint | number] | ["pk", PublicKey];

function check(data: Uint8Array, tag: number, fields: Field[]) {
  const r = new Reader(data);
  expect(r.u8(), "tag").toBe(tag);
  fields.forEach(([t, want], i) => {
    const got = r[t]();
    if (t === "pk") expect(got, `field ${i}`).toBe((want as PublicKey).toBase58());
    else if (t === "u8" || t === "u16" || t === "u32") expect(got, `field ${i}`).toBe(Number(want));
    else expect(got, `field ${i}`).toBe(BigInt(want as bigint));
  });
  r.done();
}

describe("simple wrapper encoders — exact bytes", () => {
  it("InitUser is the bare tag; fee arg is ignored", () => {
    expect([...ix.encodeInitUser()]).toEqual([1]);
    expect([...ix.encodeInitUser({ feePayment: 5n })]).toEqual([1]);
  });

  it("Deposit / Withdraw: tag, portfolio u64, sequence u64, amount u128", () => {
    const a = { portfolioId: 7n, expectedSequence: U64_MAX, amount: U128_MAX };
    check(ix.encodeDepositCollateral(a), 3, [["u64", 7n], ["u64", U64_MAX], ["u128", U128_MAX]]);
    check(ix.encodeWithdrawCollateral({ ...a, amount: "0" }), 4, [["u64", 7n], ["u64", U64_MAX], ["u128", 0n]]);
  });

  it("amounts over u128 or negative are rejected", () => {
    const a = { portfolioId: 1n, expectedSequence: 1n };
    expect(() => ix.encodeDepositCollateral({ ...a, amount: U128_MAX + 1n })).toThrow();
    expect(() => ix.encodeWithdrawCollateral({ ...a, amount: -1n })).toThrow();
    expect(() => ix.encodeDepositCollateral({ portfolioId: U64_MAX + 1n, expectedSequence: 1n, amount: 1n })).toThrow();
  });

  it("CloseAccount (tag 8)", () => {
    check(ix.encodeCloseAccount({ portfolioId: 1n, expectedSequence: 2n, positionEpoch: 3n }), 8,
      [["u64", 1n], ["u64", 2n], ["u64", 3n]]);
  });

  it("TopUpInsurance / TopUpInsuranceDomain", () => {
    check(ix.encodeTopUpInsurance({ marketId: 1n, intentId: 2n, authorityEpoch: 3n, amount: 4n }), 9,
      [["u64", 1n], ["u64", 2n], ["u64", 3n], ["u128", 4n]]);
    check(ix.encodeTopUpInsuranceDomain({ domain: 0xffff, marketId: 1n, intentId: 2n, authorityEpoch: 3n, amount: U128_MAX }), 56,
      [["u16", 0xffff], ["u64", 1n], ["u64", 2n], ["u64", 3n], ["u128", U128_MAX]]);
    expect(() => ix.encodeTopUpInsuranceDomain({ domain: 0x10000, marketId: 1n, intentId: 2n, authorityEpoch: 3n, amount: 1n })).toThrow();
  });

  it("CloseSlab, ResolveMarket, WithdrawInsurance", () => {
    check(ix.encodeCloseSlab(9n), 13, [["u64", 9n]]);
    check(ix.encodeCloseSlab("18446744073709551615"), 13, [["u64", U64_MAX]]);
    check(ix.encodeResolveMarket({ assetGenerationFrontier: 5n, authorityEpoch: 6n }), 19, [["u64", 5n], ["u64", 6n]]);
    check(ix.encodeWithdrawInsurance({ amount: 11n }), 41, [["u128", 11n]]);
  });

  it("ConvertReleasedPnl, UpdateAuthority", () => {
    check(ix.encodeConvertReleasedPnl({ portfolioId: 1n, positionEpoch: 2n, amount: 3n }), 28, [["u64", 1n], ["u64", 2n], ["u128", 3n]]);
    check(ix.encodeUpdateAuthority({ newPubkey: pk(7), authorityEpoch: 8n }), 32, [["pk", pk(7)], ["u64", 8n]]);
    // string pubkeys are accepted
    check(ix.encodeUpdateAuthority({ newPubkey: pk(7).toBase58(), authorityEpoch: 8n }), 32, [["pk", pk(7)], ["u64", 8n]]);
  });

  it("empty-payload tags are exactly one byte", () => {
    expect([...ix.encodeCloseLpVault()]).toEqual([IX_TAG.CloseLpVault]);
    expect([...ix.encodeWithdrawInsuranceReserveToStake()]).toEqual([IX_TAG.WithdrawInsuranceReserveToStake]);
    expect(IX_TAG.CloseLpVault).toBe(80);
    expect(IX_TAG.WithdrawInsuranceReserveToStake).toBe(87);
  });
});

describe("PermissionlessCrank", () => {
  it("encodes tag, nowSlot, count, then (u16 asset, u8 oracleAccounts) per hint", () => {
    const d = ix.encodePermissionlessCrank({
      nowSlot: U64_MAX,
      observations: [{ assetIndex: 0xffff, oracleAccounts: 255 }, { assetIndex: 1, oracleAccounts: 0 }],
    });
    check(d, 5, [["u64", U64_MAX], ["u8", 2], ["u16", 0xffff], ["u8", 255], ["u16", 1], ["u8", 0]]);
    expect(d.length).toBe(1 + 8 + 1 + 2 * 3);
  });

  it("no observations = 10 bytes; max observations accepted, one more rejected", () => {
    expect(ix.encodePermissionlessCrank({ nowSlot: 0n, observations: [] }).length).toBe(10);
    const hint = { assetIndex: 0, oracleAccounts: 0 };
    const max = ix.CRANK_OBSERVATION_DECODE_MAX;
    expect(ix.encodePermissionlessCrank({ nowSlot: 0n, observations: Array(max).fill(hint) }).length).toBe(10 + 3 * max);
    expect(() => ix.encodePermissionlessCrank({ nowSlot: 0n, observations: Array(max + 1).fill(hint) })).toThrow(/CRANK_OBSERVATION_DECODE_MAX/);
  });

  it("missing observations array is treated as empty", () => {
    const d = ix.encodePermissionlessCrank({ nowSlot: 3n } as never);
    check(d, 5, [["u64", 3n], ["u8", 0]]);
  });

  it("out-of-range hint fields are rejected", () => {
    expect(() => ix.encodePermissionlessCrank({ nowSlot: 0n, observations: [{ assetIndex: 0x10000, oracleAccounts: 0 }] })).toThrow();
    expect(() => ix.encodePermissionlessCrank({ nowSlot: 0n, observations: [{ assetIndex: 0, oracleAccounts: 256 }] })).toThrow();
  });
});

describe("TradeNoCpi / TradeCpi — fixed sizes", () => {
  const base = {
    accountAPortfolioId: 1n, accountAPositionEpoch: 2n,
    accountBPortfolioId: 3n, accountBPositionEpoch: 4n,
    assetIndex: 5, marketId: 6n,
  };

  it("TradeNoCpi is 77 bytes with the documented order", () => {
    const d = ix.encodeTradeNoCpi({ ...base, sizeQ: -123n, execPrice: 9n, feeBps: 10n, backingFeeCapBps: 77 });
    expect(d.length).toBe(77);
    check(d, 6, [["u64", 1n], ["u64", 2n], ["u64", 3n], ["u64", 4n], ["u16", 5], ["u64", 6n],
      ["i128", -123n], ["u64", 9n], ["u64", 10n], ["u16", 77]]);
  });

  it("TradeNoCpi i128 boundaries round-trip and overflow throws", () => {
    for (const s of [I128_MIN, I128_MAX, 0n, -1n]) {
      const d = ix.encodeTradeNoCpi({ ...base, sizeQ: s, execPrice: 1n, feeBps: 0n, backingFeeCapBps: 0 });
      const r = new Reader(d);
      r.u8(); r.u64(); r.u64(); r.u64(); r.u64(); r.u16(); r.u64();
      expect(r.i128()).toBe(s);
    }
    expect(() => ix.encodeTradeNoCpi({ ...base, sizeQ: I128_MAX + 1n, execPrice: 1n, feeBps: 0n, backingFeeCapBps: 0 })).toThrow();
    expect(() => ix.encodeTradeNoCpi({ ...base, sizeQ: I128_MIN - 1n, execPrice: 1n, feeBps: 0n, backingFeeCapBps: 0 })).toThrow();
  });

  it("TradeCpi is 85 bytes with matcher sequence and limit price", () => {
    const d = ix.encodeTradeCpi({ ...base, accountBMatcherSequence: 8n, sizeQ: 500n, feeBps: 12n, limitPrice: U64_MAX, backingFeeCapBps: 3 });
    expect(d.length).toBe(85);
    check(d, 10, [["u64", 1n], ["u64", 2n], ["u64", 3n], ["u64", 4n], ["u64", 8n], ["u16", 5], ["u64", 6n],
      ["i128", 500n], ["u64", 12n], ["u64", U64_MAX], ["u16", 3]]);
  });

  it("wrong-width fields are rejected, not silently truncated", () => {
    expect(() => ix.encodeTradeCpi({ ...base, accountBMatcherSequence: 8n, sizeQ: 1n, feeBps: 0n, limitPrice: U64_MAX + 1n, backingFeeCapBps: 0 })).toThrow();
    expect(() => ix.encodeTradeNoCpi({ ...base, assetIndex: 0x10000, sizeQ: 1n, execPrice: 1n, feeBps: 0n, backingFeeCapBps: 0 })).toThrow();
    expect(() => ix.encodeTradeNoCpi({ ...base, sizeQ: 1n, execPrice: 1n, feeBps: 0n, backingFeeCapBps: 0x10000 })).toThrow();
  });
});

describe("backing bucket / policy encoders", () => {
  it("TopUpBackingBucket (24)", () => {
    check(ix.encodeTopUpBackingBucket({ domain: 2, marketId: 1n, intentId: 3n, authorityEpoch: 4n, amount: 5n, expirySlot: ix.MAX_BACKING_BUCKET_EXPIRY_SLOT }), 24,
      [["u16", 2], ["u64", 1n], ["u64", 3n], ["u64", 4n], ["u128", 5n], ["u64", ix.MAX_BACKING_BUCKET_EXPIRY_SLOT]]);
  });
  it("WithdrawBackingBucket (50) and Earnings (52) share a layout", () => {
    const a = { domain: 9, marketId: 1n, amount: 2n, authorityEpoch: 3n };
    check(ix.encodeWithdrawBackingBucket(a), 50, [["u16", 9], ["u64", 1n], ["u128", 2n], ["u64", 3n]]);
    check(ix.encodeWithdrawBackingBucketEarnings(a), 52, [["u16", 9], ["u64", 1n], ["u128", 2n], ["u64", 3n]]);
  });
  it("UpdateBackingFeePolicy (51)", () => {
    check(ix.encodeUpdateBackingFeePolicy({ domain: 1, marketId: 2n, feeBps: 30, insuranceShareBps: 10_000, policySequence: 4n }), 51,
      [["u16", 1], ["u64", 2n], ["u16", 30], ["u16", 10_000], ["u64", 4n]]);
  });
  it("UpdateTradeFeePolicy (55), UpdateMaintenanceFeePerSlot (88), ExpireBackingBucket (89)", () => {
    check(ix.encodeUpdateTradeFeePolicy({ tradeFeeBaseBps: 30n, policySequence: 2n }), 55, [["u64", 30n], ["u64", 2n]]);
    check(ix.encodeUpdateMaintenanceFeePerSlot({ maintenanceFeePerSlot: U128_MAX }), 88, [["u128", U128_MAX]]);
    check(ix.encodeExpireBackingBucket({ domain: 4 }), 89, [["u16", 4]]);
  });
  it("WithdrawCreatorFee (90), WithdrawProtocolFee (84), SetProtocolFeeAuthority (85)", () => {
    check(ix.encodeWithdrawCreatorFee({ amount: 1n, assetIndex: 2, authorityEpoch: 3n }), 90, [["u128", 1n], ["u16", 2], ["u64", 3n]]);
    check(ix.encodeWithdrawProtocolFee({ amount: 4n, authorityEpoch: 5n }), 84, [["u128", 4n], ["u64", 5n]]);
    check(ix.encodeSetProtocolFeeAuthority({ newAuthority: pk(3) }), 85, [["pk", pk(3)]]);
  });
});

describe("fee split", () => {
  it("UpdateFeeSplit (86) bytes", () => {
    check(ix.encodeUpdateFeeSplit({ creatorShareBps: 1600, lpShareBps: 4800, insuranceShareBps: 1600, authorityEpoch: 9n }), 86,
      [["u16", 1600], ["u16", 4800], ["u16", 1600], ["u64", 9n]]);
  });

  it("validateFeeSplit accepts the defaults and each boundary", () => {
    const F = ix.FEE_SPLIT;
    const mk = (c: number, l: number, i: number) => ({ creatorShareBps: c, lpShareBps: l, insuranceShareBps: i, authorityEpoch: 0n });
    expect(ix.validateFeeSplit(mk(F.DEFAULT_CREATOR_SHARE_BPS, F.DEFAULT_LP_SHARE_BPS, F.DEFAULT_INSURANCE_SHARE_BPS))).toBeNull();
    expect(ix.validateFeeSplit(mk(F.MAX_CREATOR_SHARE_BPS, F.MIN_LP_SHARE_BPS, F.FEE_SHARE_TOTAL_BPS - F.MAX_CREATOR_SHARE_BPS - F.MIN_LP_SHARE_BPS))).toBeNull();
    expect(ix.validateFeeSplit(mk(0, F.FEE_SHARE_TOTAL_BPS - F.MIN_INSURANCE_SHARE_BPS, F.MIN_INSURANCE_SHARE_BPS))).toBeNull();
  });

  it("validateFeeSplit rejects bad sum, creator over cap, LP under floor, insurance under floor", () => {
    const mk = (c: number, l: number, i: number) => ({ creatorShareBps: c, lpShareBps: l, insuranceShareBps: i, authorityEpoch: 0n });
    expect(ix.validateFeeSplit(mk(1600, 4800, 1599))).toMatch(/sum/);
    expect(ix.validateFeeSplit(mk(3601, 3200, 1199))).toMatch(/MAX_CREATOR_SHARE_BPS/);
    expect(ix.validateFeeSplit(mk(3600, 3199, 1201))).toMatch(/MIN_LP_SHARE_BPS/);
    expect(ix.validateFeeSplit(mk(3600, 3300, 1100))).toMatch(/MIN_INSURANCE_SHARE_BPS/);
  });

  it("FEE_SPLIT constants are internally consistent and frozen", () => {
    const F = ix.FEE_SPLIT;
    expect(F.DEFAULT_CREATOR_SHARE_BPS + F.DEFAULT_LP_SHARE_BPS + F.DEFAULT_INSURANCE_SHARE_BPS).toBe(F.FEE_SHARE_TOTAL_BPS);
    expect(F.PROTOCOL_FEE_BPS + F.FEE_SHARE_TOTAL_BPS).toBe(10_000);
    expect(Object.isFrozen(F)).toBe(true);
  });
});

describe("asset / lifecycle encoders", () => {
  it("UpdateAssetLifecycle (40) = 1+1+2+8*4+16+32*4 = 180 bytes", () => {
    const d = ix.encodeUpdateAssetLifecycle({
      action: 3, assetIndex: 4, marketId: 5n, authorityEpoch: 6n, nowSlot: 7n, initialPrice: 8n, maxInitFee: 9n,
      insuranceAuthority: pk(1), insuranceOperator: pk(2), backingBucketAuthority: pk(3), oracleAuthority: pk(4),
    });
    expect(d.length).toBe(180);
    check(d, 40, [["u8", 3], ["u16", 4], ["u64", 5n], ["u64", 6n], ["u64", 7n], ["u64", 8n], ["u128", 9n],
      ["pk", pk(1)], ["pk", pk(2)], ["pk", pk(3)], ["pk", pk(4)]]);
  });
  it("CureAndCancelClose (42), ForfeitRecoveryLeg (43), RebalanceReduce (44)", () => {
    check(ix.encodeCureAndCancelClose({ portfolioId: 1n, positionEpoch: 2n, optionalDeposit: 0n }), 42, [["u64", 1n], ["u64", 2n], ["u128", 0n]]);
    check(ix.encodeForfeitRecoveryLeg({ portfolioId: 1n, positionEpoch: 2n, assetIndex: 3, bLossAtomBudget: 4n }), 43, [["u64", 1n], ["u64", 2n], ["u16", 3], ["u128", 4n]]);
    check(ix.encodeRebalanceReduce({ portfolioId: 1n, positionEpoch: 2n, assetIndex: 3, reduceQ: U128_MAX }), 44, [["u64", 1n], ["u64", 2n], ["u16", 3], ["u128", U128_MAX]]);
  });
  it("UpdateBaseUnitMints (60), SwapSecondaryForPrimary (61)", () => {
    check(ix.encodeUpdateBaseUnitMints({ primaryMint: pk(1), secondaryMint: pk(2), authorityEpoch: 3n }), 60, [["pk", pk(1)], ["pk", pk(2)], ["u64", 3n]]);
    check(ix.encodeSwapSecondaryForPrimary({ amount: 4n, authorityEpoch: 5n }), 61, [["u128", 4n], ["u64", 5n]]);
  });
  it("UpdateAssetAuthority (65) carries every authority kind", () => {
    for (const kind of Object.values(ix.ASSET_AUTH_KIND)) {
      check(ix.encodeUpdateAssetAuthority({ assetIndex: 1, marketId: 2n, kind, newPubkey: pk(9), authorityEpoch: 3n }), 65,
        [["u16", 1], ["u64", 2n], ["u8", kind], ["pk", pk(9)], ["u64", 3n]]);
    }
    expect(ix.ASSET_AUTH_KIND).toEqual({ AssetAdmin: 0, Insurance: 1, InsuranceOperator: 2, BackingBucket: 3, Oracle: 4 });
    expect(Object.isFrozen(ix.ASSET_AUTH_KIND)).toBe(true);
  });
  it("RestartAssetOracle (69), WithdrawInsuranceAsset (57)", () => {
    check(ix.encodeRestartAssetOracle({ assetIndex: 1, marketId: 2n, nowSlot: 3n, initialPrice: 4n, observationSequence: 5n }), 69,
      [["u16", 1], ["u64", 2n], ["u64", 3n], ["u64", 4n], ["u64", 5n]]);
    check(ix.encodeWithdrawInsuranceAsset({ assetIndex: 1, marketId: 2n, amount: 3n, authorityEpoch: 4n }), 57,
      [["u16", 1], ["u64", 2n], ["u128", 3n], ["u64", 4n]]);
  });
  it("TransferPortfolioOwnership (72), SetNftProgramId (73)", () => {
    check(ix.encodeTransferPortfolioOwnership({ newOwner: pk(5), assetIndex: 6 }), 72, [["pk", pk(5)], ["u16", 6]]);
    check(ix.encodeSetNftProgramId({ nftProgramId: pk(7) }), 73, [["pk", pk(7)]]);
  });
});

describe("batch trades", () => {
  const acct = { accountAPortfolioId: 1n, accountAPositionEpoch: 2n, accountBPortfolioId: 3n, accountBPositionEpoch: 4n };

  it("BatchTradeNoCpi: tag, count, legs (u16,u64,i128,u64,u64), then four u64", () => {
    const d = ix.encodeBatchTradeNoCpi({
      ...acct,
      legs: [
        { assetIndex: 1, marketId: 2n, sizeQ: -5n, execPrice: 6n, feeBps: 10_000n },
        { assetIndex: 7, marketId: 8n, sizeQ: I128_MAX, execPrice: 9n, feeBps: "0" },
      ],
    });
    expect(d.length).toBe(2 + 2 * 42 + 32);
    check(d, 66, [["u8", 2],
      ["u16", 1], ["u64", 2n], ["i128", -5n], ["u64", 6n], ["u64", 10_000n],
      ["u16", 7], ["u64", 8n], ["i128", I128_MAX], ["u64", 9n], ["u64", 0n],
      ["u64", 1n], ["u64", 2n], ["u64", 3n], ["u64", 4n]]);
  });

  it("BatchTradeCpi: legs (u16,u64,i128,u64 fee,u64 limit), slippage, fee, accounts, matcher seq", () => {
    const d = ix.encodeBatchTradeCpi({
      ...acct,
      legs: [{ assetIndex: 1, marketId: 2n, sizeQ: I128_MIN, feeBps: 3n, limitPrice: 4n }],
      maxSlippageAtoms: 5n, maxFeeAtoms: 6n, accountBMatcherSequence: 7n,
    });
    expect(d.length).toBe(2 + 42 + 32 + 32 + 8);
    check(d, 67, [["u8", 1], ["u16", 1], ["u64", 2n], ["i128", I128_MIN], ["u64", 3n], ["u64", 4n],
      ["u128", 5n], ["u128", 6n], ["u64", 1n], ["u64", 2n], ["u64", 3n], ["u64", 4n], ["u64", 7n]]);
  });

  it("empty, >255 legs, and fee over 10000 bps are rejected; 255 legs is accepted", () => {
    const noLegs = { ...acct, legs: [] };
    expect(() => ix.encodeBatchTradeNoCpi(noLegs)).toThrow(/at least one leg/);
    expect(() => ix.encodeBatchTradeCpi({ ...noLegs, maxSlippageAtoms: 0n, maxFeeAtoms: 0n, accountBMatcherSequence: 0n })).toThrow(/at least one leg/);

    const nl = { assetIndex: 0, marketId: 1n, sizeQ: 1n, execPrice: 1n, feeBps: 0n };
    const cl = { assetIndex: 0, marketId: 1n, sizeQ: 1n, feeBps: 0n, limitPrice: 1n };
    expect(ix.encodeBatchTradeNoCpi({ ...acct, legs: Array(255).fill(nl) })[1]).toBe(255);
    expect(() => ix.encodeBatchTradeNoCpi({ ...acct, legs: Array(256).fill(nl) })).toThrow(/too many legs/);
    expect(() => ix.encodeBatchTradeCpi({ ...acct, legs: Array(256).fill(cl), maxSlippageAtoms: 0n, maxFeeAtoms: 0n, accountBMatcherSequence: 0n })).toThrow(/too many legs/);

    expect(() => ix.encodeBatchTradeNoCpi({ ...acct, legs: [{ ...nl, feeBps: 10_001n }] })).toThrow(/feeBps/);
    expect(() => ix.encodeBatchTradeNoCpi({ ...acct, legs: [{ ...nl, feeBps: "10001" }] })).toThrow(/feeBps/);
    expect(() => ix.encodeBatchTradeCpi({ ...acct, legs: [{ ...cl, feeBps: 10_001n }], maxSlippageAtoms: 0n, maxFeeAtoms: 0n, accountBMatcherSequence: 0n })).toThrow(/feeBps/);
    expect(ix.encodeBatchTradeNoCpi({ ...acct, legs: [{ ...nl, feeBps: 10_000n }] }).length).toBe(2 + 42 + 32);
  });
});

describe("SetMatcherConfig (68)", () => {
  const a = { portfolioId: 1n, expectedSequence: 2n, assetGenerationFrontier: 3n, tradeFeeCapBps: 4, expirySlot: 5n };
  it("bytes for enabled 0 and 1", () => {
    check(ix.encodeSetMatcherConfig({ ...a, enabled: 1 }), 68, [["u64", 1n], ["u64", 2n], ["u64", 3n], ["u8", 1], ["u16", 4], ["u64", 5n]]);
    check(ix.encodeSetMatcherConfig({ ...a, enabled: 0 }), 68, [["u64", 1n], ["u64", 2n], ["u64", 3n], ["u8", 0], ["u16", 4], ["u64", 5n]]);
  });
  it("enabled must be exactly 0 or 1", () => {
    for (const e of [2, -1, 255, 0.5]) expect(() => ix.encodeSetMatcherConfig({ ...a, enabled: e })).toThrow(/enabled/);
  });
});

describe("LP vault encoders", () => {
  it("CreateLpVault (74), DepositToLpVault (75), RequestRedeem (76)", () => {
    check(ix.encodeCreateLpVaultV17({ feeShareBps: 100, redemptionCooldownSlots: 200n, oiReservationThresholdBps: 300, domain: 4 }), 74,
      [["u16", 100], ["u64", 200n], ["u16", 300], ["u16", 4]]);
    check(ix.encodeDepositToLpVault({ amount: 5n, domain: 6 }), 75, [["u128", 5n], ["u16", 6]]);
    check(ix.encodeRequestRedeemLpShares({ shares: U128_MAX }), 76, [["u128", U128_MAX]]);
  });
  it("ExecuteRedemption (77), LpVaultCrankFees (78), SetLpVaultPaused (79)", () => {
    check(ix.encodeExecuteRedemption({ domain: 1 }), 77, [["u16", 1]]);
    check(ix.encodeLpVaultCrankFees({ domain: 2 }), 78, [["u16", 2]]);
    check(ix.encodeSetLpVaultPaused({ paused: 1 }), 79, [["u8", 1]]);
  });
  it("RebalanceLpVaultBacking (91), UpdateInsuranceWithdrawPolicy (92)", () => {
    check(ix.encodeRebalanceLpVaultBacking({ fromDomain: 1, toDomain: 2, amount: 3n }), 91, [["u16", 1], ["u16", 2], ["u128", 3n]]);
    check(ix.encodeUpdateInsuranceWithdrawPolicy({ depositsOnly: 1, cooldownSlots: ix.MAX_INSURANCE_WITHDRAW_COOLDOWN_SLOTS, authorityEpoch: 3n }), 92,
      [["u8", 1], ["u64", ix.MAX_INSURANCE_WITHDRAW_COOLDOWN_SLOTS], ["u64", 3n]]);
  });
});

describe("oracle / mark configuration", () => {
  const feeds: [PublicKey, PublicKey, PublicKey] = [pk(1), pk(2), pk(3)];
  const hy = {
    assetIndex: 1, marketId: 2n, nowSlot: 3n, nowUnixTs: -4n, oracleLegCount: 2, oracleLegFlags: 5,
    maxStalenessSecs: 6n, hybridSoftStaleSlots: 7n, markEwmaHalflifeSlots: 8n, markMinFee: 9n,
    invert: 1, unitScale: 0xffffffff, confFilterBps: 11, oracleLegFeeds: feeds, observationSequence: 12n,
  };

  it("ConfigureHybridOracle (34): signed unix ts, three feeds, trailing sequence", () => {
    const d = ix.encodeConfigureHybridOracle(hy);
    expect(d.length).toBe(1 + 2 + 8 + 8 + 8 + 1 + 1 + 8 * 4 + 1 + 4 + 2 + 96 + 8);
    check(d, 34, [["u16", 1], ["u64", 2n], ["u64", 3n], ["i64", -4n], ["u8", 2], ["u8", 5],
      ["u64", 6n], ["u64", 7n], ["u64", 8n], ["u64", 9n], ["u8", 1], ["u32", 0xffffffff], ["u16", 11],
      ["pk", pk(1)], ["pk", pk(2)], ["pk", pk(3)], ["u64", 12n]]);
  });

  it("ConfigureHybridOracle leg count must be an integer in 1..3", () => {
    for (const n of [0, 4, -1, 1.5, NaN]) expect(() => ix.encodeConfigureHybridOracle({ ...hy, oracleLegCount: n })).toThrow(/oracleLegCount/);
    for (const n of [1, 2, 3]) expect(ix.encodeConfigureHybridOracle({ ...hy, oracleLegCount: n })[1 + 2 + 8 + 8 + 8]).toBe(n);
  });

  it("ConfigureEwmaMark (35) and positivity guards", () => {
    const a = { assetIndex: 1, marketId: 2n, nowSlot: 3n, initialMarkE6: 4n, markEwmaHalflifeSlots: 5n, markMinFee: 0n, observationSequence: 7n };
    check(ix.encodeConfigureEwmaMark(a), 35, [["u16", 1], ["u64", 2n], ["u64", 3n], ["u64", 4n], ["u64", 5n], ["u64", 0n], ["u64", 7n]]);
    expect(() => ix.encodeConfigureEwmaMark({ ...a, initialMarkE6: 0n })).toThrow(/initialMarkE6 must be > 0/);
    expect(() => ix.encodeConfigureEwmaMark({ ...a, markEwmaHalflifeSlots: "0" })).toThrow(/markEwmaHalflifeSlots/);
    expect(() => ix.encodeConfigureEwmaMark({ ...a, initialMarkE6: -1n })).toThrow(/must be > 0/);
  });

  it("PushEwmaMark (36) and ConfigureAuthMark (62)", () => {
    check(ix.encodePushEwmaMark({ assetIndex: 1, marketId: 2n, nowSlot: 3n, markE6: 4n, observationSequence: 5n }), 36,
      [["u16", 1], ["u64", 2n], ["u64", 3n], ["u64", 4n], ["u64", 5n]]);
    expect(() => ix.encodePushEwmaMark({ assetIndex: 1, marketId: 2n, nowSlot: 3n, markE6: 0n, observationSequence: 5n })).toThrow(/markE6/);
    check(ix.encodeConfigureAuthMark({ assetIndex: 1, marketId: 2n, nowSlot: 3n, initialMarkE6: 4n, observationSequence: 5n }), 62,
      [["u16", 1], ["u64", 2n], ["u64", 3n], ["u64", 4n], ["u64", 5n]]);
    expect(() => ix.encodeConfigureAuthMark({ assetIndex: 1, marketId: 2n, nowSlot: 3n, initialMarkE6: 0n, observationSequence: 5n })).toThrow(/initialMarkE6/);
  });

  describe("PushAuthMark (63)", () => {
    const a = { assetIndex: 1, marketId: 2n, nowSlot: 3n, markE6: 4n, observationSequence: 5n };
    it("no depth = PUSH_AUTH_MARK_LEN bytes; depth adds mode u8 + u64 = PUSH_AUTH_MARK_DEPTH_LEN", () => {
      const plain = ix.encodePushAuthMark(a);
      expect(plain.length).toBe(ix.PUSH_AUTH_MARK_LEN);
      check(plain, 63, [["u16", 1], ["u64", 2n], ["u64", 3n], ["u64", 4n], ["u64", 5n]]);
      const withDepth = ix.encodePushAuthMark({ ...a, depth: { mode: 1, depthE6: 999n } });
      expect(withDepth.length).toBe(ix.PUSH_AUTH_MARK_DEPTH_LEN);
      check(withDepth, 63, [["u16", 1], ["u64", 2n], ["u64", 3n], ["u64", 4n], ["u64", 5n], ["u8", 1], ["u64", 999n]]);
      check(ix.encodePushAuthMark({ ...a, depth: { mode: 0, depthE6: 0n } }), 63,
        [["u16", 1], ["u64", 2n], ["u64", 3n], ["u64", 4n], ["u64", 5n], ["u8", 0], ["u64", 0n]]);
      check(ix.encodePushAuthMark({ ...a, depth: { mode: 2, depthE6: "0" } }), 63,
        [["u16", 1], ["u64", 2n], ["u64", 3n], ["u64", 4n], ["u64", 5n], ["u8", 2], ["u64", 0n]]);
    });
    it("rejects zero mark, bad mode, and nonzero depth for modes 0 and 2", () => {
      expect(() => ix.encodePushAuthMark({ ...a, markE6: 0n })).toThrow(/markE6/);
      expect(() => ix.encodePushAuthMark({ ...a, depth: { mode: 3 as never, depthE6: 0n } })).toThrow(/mode/);
      expect(() => ix.encodePushAuthMark({ ...a, depth: { mode: 0, depthE6: 1n } })).toThrow(/mode 0/);
      expect(() => ix.encodePushAuthMark({ ...a, depth: { mode: 2, depthE6: 1n } })).toThrow(/mode 2/);
    });
  });
});

describe("matcher program payloads", () => {
  it("InitMatcherCtx (83) is 70 bytes: kind, four u32, three u128, two u16", () => {
    const d = ix.encodeInitMatcherCtx({
      kind: 1, tradingFeeBps: 1, baseSpreadBps: 2, maxTotalBps: 3, impactKBps: 4,
      liquidityNotionalE6: 5n, maxFillAbs: 6n, maxInventoryAbs: U128_MAX, feeToInsuranceBps: 7, skewSpreadMultBps: 8,
    });
    expect(d.length).toBe(ix.INIT_MATCHER_CTX_V17_LEN);
    check(d, 83, [["u8", 1], ["u32", 1], ["u32", 2], ["u32", 3], ["u32", 4], ["u128", 5n], ["u128", 6n], ["u128", U128_MAX], ["u16", 7], ["u16", 8]]);
    expect(() => ix.encodeInitMatcherCtx({
      kind: 1, tradingFeeBps: 2 ** 32, baseSpreadBps: 2, maxTotalBps: 3, impactKBps: 4,
      liquidityNotionalE6: 5n, maxFillAbs: 6n, maxInventoryAbs: 0n, feeToInsuranceBps: 7, skewSpreadMultBps: 8,
    })).toThrow();
  });

  it("MatcherInitPassive is 78 bytes at the documented offsets", () => {
    const d = ix.encodeMatcherInitPassive({ maxFillAbs: U128_MAX, lpAccountId: U64_MAX });
    expect(d.length).toBe(ix.INIT_CTX_LEN);
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    expect(d[0]).toBe(2);
    expect(d[1]).toBe(0);
    expect(dv.getUint32(2, true)).toBe(0);
    expect(dv.getUint32(6, true)).toBe(0);
    expect(dv.getUint32(10, true)).toBe(100);
    expect(dv.getUint32(14, true)).toBe(0);
    expect(dv.getBigUint64(34, true)).toBe(U64_MAX);
    expect(dv.getBigUint64(42, true)).toBe(U64_MAX);
    expect(dv.getBigUint64(50, true)).toBe(0n); // max_inventory_abs = unlimited
    expect(dv.getUint16(66, true)).toBe(0);
    expect(dv.getUint16(68, true)).toBe(0);
    expect(dv.getBigUint64(70, true)).toBe(U64_MAX);
    // liquidity_notional_e6 stays zero
    expect([...d.slice(18, 34)].every((b) => b === 0)).toBe(true);
  });

  it("MatcherInitPassive rejects lp_account_id 0 (matcher rejects it on-chain)", () => {
    expect(() => ix.encodeMatcherInitPassive({ maxFillAbs: 1n, lpAccountId: 0n })).toThrow(/lpAccountId/);
    expect(() => ix.encodeMatcherInitPassive({ maxFillAbs: 1n, lpAccountId: "0" })).toThrow();
    expect(() => ix.encodeMatcherInitPassive({ maxFillAbs: U128_MAX + 1n, lpAccountId: 1n })).toThrow();
  });
});

describe("matcher return decode/encode", () => {
  const args = {
    abiVersion: 1, execPriceE6: 50_000_000n, execSize: -1234n, reqId: 9n, lpAccountId: 10n,
    oraclePriceE6: 49_999_999n, assetIndex: 3n, valid: true, partialOk: false, rejected: false, backingFeeCapBps: 25,
  };

  it("is 64 bytes and round-trips every field including negative size", () => {
    const d = ix.encodeMatcherReturn(args);
    expect(d.length).toBe(ix.MATCHER_RETURN_LEN);
    const r = ix.decodeMatcherReturn(d);
    expect(r).toMatchObject({
      abiVersion: 1, execPriceE6: 50_000_000n, execSize: -1234n, reqId: 9n, lpAccountId: 10n,
      oraclePriceE6: 49_999_999n, assetIndex: 3n, valid: true, partialOk: false, rejected: false, backingFeeCapBps: 25,
    });
    expect(r.flags).toBe(1 | (25 << 8));
  });

  it("raw bytes sit at the documented offsets (8/16/32/40/48/56), asymmetric values", () => {
    const d = ix.encodeMatcherReturn({ ...args, abiVersion: 0x01020304, execSize: -2n, valid: true, partialOk: false, rejected: false, backingFeeCapBps: 0 });
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    expect(dv.getUint32(0, true)).toBe(0x01020304);
    expect(dv.getUint32(4, true)).toBe(1);
    expect(dv.getBigUint64(8, true)).toBe(50_000_000n);
    expect(dv.getBigUint64(16, true)).toBe(U64_MAX - 1n); // -2 low half
    expect(dv.getBigUint64(24, true)).toBe(U64_MAX);      // sign-extended high half
    expect(dv.getBigUint64(32, true)).toBe(9n);
    expect(dv.getBigUint64(40, true)).toBe(10n);
    expect(dv.getBigUint64(48, true)).toBe(49_999_999n);
    expect(dv.getBigUint64(56, true)).toBe(3n);
  });

  it("MatcherInitPassive halves are not swapped (asymmetric values)", () => {
    const fill = (0x1122334455667788n << 64n) | 0x99aabbccddeeff00n;
    const d = ix.encodeMatcherInitPassive({ maxFillAbs: fill, lpAccountId: 0x0102030405060708n });
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    expect(dv.getBigUint64(34, true)).toBe(0x99aabbccddeeff00n);
    expect(dv.getBigUint64(42, true)).toBe(0x1122334455667788n);
    expect(dv.getBigUint64(50, true)).toBe(0n);
    expect(dv.getBigUint64(58, true)).toBe(0n);
    expect(dv.getBigUint64(70, true)).toBe(0x0102030405060708n);
  });

  it("flag bits land where documented", () => {
    const d = ix.encodeMatcherReturn({ ...args, valid: false, partialOk: true, rejected: true, backingFeeCapBps: 0 });
    expect(new DataView(d.buffer).getUint32(4, true)).toBe(2 | 4);
    const r = ix.decodeMatcherReturn(d);
    expect([r.valid, r.partialOk, r.rejected]).toEqual([false, true, true]);
  });

  it("i128 extremes and fee-cap boundary 10000 round-trip", () => {
    for (const s of [I128_MIN, I128_MAX]) {
      expect(ix.decodeMatcherReturn(ix.encodeMatcherReturn({ ...args, execSize: s })).execSize).toBe(s);
    }
    expect(ix.decodeMatcherReturn(ix.encodeMatcherReturn({ ...args, backingFeeCapBps: 10_000 })).backingFeeCapBps).toBe(10_000);
  });

  it("encode rejects fee cap outside 0..=10000", () => {
    expect(() => ix.encodeMatcherReturn({ ...args, backingFeeCapBps: 10_001 })).toThrow(/backingFeeCapBps/);
    expect(() => ix.encodeMatcherReturn({ ...args, backingFeeCapBps: -1 })).toThrow(/backingFeeCapBps/);
  });

  it("decode honours an offset and rejects short buffers", () => {
    const d = ix.encodeMatcherReturn(args);
    const padded = new Uint8Array(100);
    padded.set(d, 17);
    expect(ix.decodeMatcherReturn(padded, 17).reqId).toBe(9n);
    expect(() => ix.decodeMatcherReturn(d.slice(0, 63))).toThrow(/too short/);
    expect(() => ix.decodeMatcherReturn(padded, 37)).toThrow(/too short/);
    expect(() => ix.decodeMatcherReturn(new Uint8Array(0))).toThrow(/too short/);
  });

  it("decode rejects unknown flag bits (bit 3 and bit 22)", () => {
    for (const bit of [1 << 3, 1 << 22, 1 << 31]) {
      const d = ix.encodeMatcherReturn(args);
      const dv = new DataView(d.buffer);
      dv.setUint32(4, (dv.getUint32(4, true) | bit) >>> 0, true);
      expect(() => ix.decodeMatcherReturn(d)).toThrow(/unknown flag/);
    }
  });
});

describe("pure helpers", () => {
  it("packOiCap packs low/high u32 and checks range", () => {
    expect(ix.packOiCap(1, 2)).toBe(1n | (2n << 32n));
    expect(ix.packOiCap(0xffffffff, 0xffffffff)).toBe(U64_MAX);
    expect(() => ix.packOiCap(-1, 0)).toThrow(/multiplier_bps/);
    expect(() => ix.packOiCap(0x1_0000_0000, 0)).toThrow(/multiplier_bps/);
    expect(() => ix.packOiCap(0, -1)).toThrow(/soft_cap_bps/);
    expect(() => ix.packOiCap(0, 0x1_0000_0000)).toThrow(/soft_cap_bps/);
  });

  it("computeEmaMarkPrice edge cases", () => {
    const f = ix.computeEmaMarkPrice;
    expect(f(100n, 0n, 5n)).toBe(100n);            // no oracle -> keep mark
    expect(f(0n, 200n, 5n)).toBe(200n);            // no prior mark -> oracle
    expect(f(100n, 200n, 0n)).toBe(200n);          // dt 0 -> oracle
    expect(f(1_000_000n, 2_000_000n, 1n, 500_000n)).toBe(1_500_000n);
    expect(f(1_000_000n, 2_000_000n, 10n, 500_000n)).toBe(2_000_000n); // alpha saturates at 1.0
    // price cap clamps oracle: cap 10_000 e2bps (1%) * dt 1 on mark 1_000_000 => +-10_000
    expect(f(1_000_000n, 2_000_000n, 1n, 1_000_000n, 10_000n)).toBe(1_010_000n);
    expect(f(1_000_000n, 1n, 1n, 1_000_000n, 10_000n)).toBe(990_000n);
    // cap larger than mark: lower bound floors at 0
    expect(f(10n, 1n, 1_000_000n, 1_000_000n, 1_000_000n)).toBe(1n);
  });

  it("computeVammQuote: passive, vAMM impact, clamp, short side, 100% fee floor", () => {
    const p = { mode: 0, tradingFeeBps: 10, baseSpreadBps: 20, maxTotalBps: 100, impactKBps: 50, liquidityNotionalE6: 1_000_000_000n };
    expect(ix.computeVammQuote(p, 1_000_000n, 1_000_000n, true)).toBe(1_003_000n);
    expect(ix.computeVammQuote(p, 1_000_000n, -1_000_000n, false)).toBe(997_000n);
    const v = { ...p, mode: 1 };
    // notional 1e9 -> impact = 1e9*50/1e9 = 50bps; base 30 -> 80 total
    expect(ix.computeVammQuote(v, 1_000_000n, 1_000_000_000n, true)).toBe(1_008_000n);
    // huge trade clamps to maxTotal 100 bps
    expect(ix.computeVammQuote(v, 1_000_000n, 1_000_000_000_000n, true)).toBe(1_010_000n);
    // max below base fee -> total clamps to max
    expect(ix.computeVammQuote({ ...p, maxTotalBps: 5 }, 1_000_000n, 1n, true)).toBe(1_000_500n);
    // zero liquidity in vAMM mode: no impact term
    expect(ix.computeVammQuote({ ...v, liquidityNotionalE6: 0n }, 1_000_000n, 1_000_000_000n, true)).toBe(1_003_000n);
    // fee >= 100% on the short side floors at 1
    expect(ix.computeVammQuote({ ...p, maxTotalBps: 10_000, baseSpreadBps: 10_000 }, 1_000_000n, 1n, false)).toBe(1n);
  });

  it("checkPhaseTransition covers all three phases", () => {
    const f = ix.checkPhaseTransition;
    const created = 1_000n;
    expect(f(created + ix.PHASE1_MIN_SLOTS - 1n, created, 0, 0n, 0, false)).toEqual([0, false]);
    expect(f(created + ix.PHASE1_MIN_SLOTS, created, 0, 0n, 0, false)).toEqual([1, true]);
    // volume path needs both min slots and volume
    expect(f(created + ix.PHASE1_VOLUME_MIN_SLOTS, created, 0, ix.PHASE2_VOLUME_THRESHOLD, 0, false)).toEqual([1, true]);
    expect(f(created + ix.PHASE1_VOLUME_MIN_SLOTS, created, 0, ix.PHASE2_VOLUME_THRESHOLD - 1n, 0, false)).toEqual([0, false]);
    expect(f(created + ix.PHASE1_VOLUME_MIN_SLOTS - 1n, created, 0, ix.PHASE2_VOLUME_THRESHOLD, 0, false)).toEqual([0, false]);
    // created slot 0 means elapsed 0
    expect(f(5n, 0n, 0, 0n, 0, false)).toEqual([0, false]);
    // growing
    expect(f(0n, 0n, 1, 0n, 0, true)).toEqual([2, true]);
    expect(f(created + 10n + ix.PHASE2_MATURITY_SLOTS - 1n, created, 1, 0n, 10, false)).toEqual([1, false]);
    expect(f(created + 10n + ix.PHASE2_MATURITY_SLOTS, created, 1, 0n, 10, false)).toEqual([2, true]);
    // mature / unknown stays mature
    expect(f(1n, 1n, 2, 0n, 0, false)).toEqual([2, false]);
    expect(f(1n, 1n, 9, 0n, 0, true)).toEqual([2, false]);
  });

  it("derivePythPriceUpdateAccount: deterministic, shard-sensitive, validates inputs", async () => {
    const feed = new Uint8Array(32).fill(7);
    const a = await ix.derivePythPriceUpdateAccount(feed);
    expect(a).toBe(await ix.derivePythPriceUpdateAccount(feed, 0));
    expect(a).not.toBe(await ix.derivePythPriceUpdateAccount(feed, 1));
    const shard = new Uint8Array(2); new DataView(shard.buffer).setUint16(0, 0xffff, true);
    const [want] = PublicKey.findProgramAddressSync([shard, feed], new PublicKey(ix.PYTH_RECEIVER_PROGRAM_ID));
    expect(await ix.derivePythPriceUpdateAccount(feed, 0xffff)).toBe(want.toBase58());
    await expect(ix.derivePythPriceUpdateAccount(new Uint8Array(31))).rejects.toThrow(/32 bytes/);
    await expect(ix.derivePythPriceUpdateAccount(new Uint8Array(33))).rejects.toThrow(/32 bytes/);
    await expect(ix.derivePythPriceUpdateAccount(feed, -1)).rejects.toThrow(/u16/);
    await expect(ix.derivePythPriceUpdateAccount(feed, 0x10000)).rejects.toThrow(/u16/);
    await expect(ix.derivePythPriceUpdateAccount(feed, 1.5)).rejects.toThrow(/u16/);
  });
});

describe("removed v12 encoders throw and name their tag", () => {
  const z = undefined as never;
  const cases: Array<[string, () => unknown, number | null]> = [
    ["InitLP", () => ix.encodeInitLP(z), IX_TAG.InitLP],
    ["KeeperCrank", () => ix.encodeKeeperCrank(z), null],
    ["LiquidateAtOracle", () => ix.encodeLiquidateAtOracle(z), 7],
    ["TradeCpiV2", () => ix.encodeTradeCpiV2(z), IX_TAG.TradeCpiV],
    ["UnresolveMarket", () => ix.encodeUnresolveMarket(z), IX_TAG.UnresolveMarket],
    ["SetRiskThreshold", () => ix.encodeSetRiskThreshold(z), 11],
    ["UpdateAdmin", () => ix.encodeUpdateAdmin(z), 12],
    ["UpdateConfig", () => ix.encodeUpdateConfig(z), 14],
    ["SetMaintenanceFee", () => ix.encodeSetMaintenanceFee(z), 15],
    ["SetOraclePriceCap", () => ix.encodeSetOraclePriceCap(z), 16],
    ["AdminForceClose", () => ix.encodeAdminForceClose(z), 17],
    ["UpdateRiskParams", () => ix.encodeUpdateRiskParams(z), 18],
    ["RenounceAdmin", () => ix.encodeRenounceAdmin(), 21],
    ["LpVaultWithdraw", () => ix.encodeLpVaultWithdraw(z), 76],
    ["PauseMarket", () => ix.encodePauseMarket(), 56],
    ["UnpauseMarket", () => ix.encodeUnpauseMarket(), 58],
    ["SetPythOracle", () => ix.encodeSetPythOracle({ feedId: new Uint8Array(32), maxStalenessSecs: 1n, confFilterBps: 1 }), 20],
    ["UpdateMarkPrice", () => ix.encodeUpdateMarkPrice(), IX_TAG.UpdateMarkPrice],
    ["UpdateHyperpMark", () => ix.encodeUpdateHyperpMark(), 34],
    ["FundMarketInsurance", () => ix.encodeFundMarketInsurance({ amount: 1n }), 25],
    ["SetInsuranceIsolation", () => ix.encodeSetInsuranceIsolation({ bps: 1 }), 26],
    ["QueueWithdrawal", () => ix.encodeQueueWithdrawal({ lpAmount: 1n }), 102],
    ["ClaimQueuedWithdrawal", () => ix.encodeClaimQueuedWithdrawal(), 103],
    ["CancelQueuedWithdrawal", () => ix.encodeCancelQueuedWithdrawal(), 104],
    ["ExecuteAdl", () => ix.encodeExecuteAdl(z), 101],
    ["CloseStaleSlabs", () => ix.encodeCloseStaleSlabs(), 100],
    ["ReclaimSlabRent", () => ix.encodeReclaimSlabRent(), 99],
    ["AuditCrank", () => ix.encodeAuditCrank(), 91],
    ["AdvanceOraclePhase", () => ix.encodeAdvanceOraclePhase(), 92],
    ["SlashCreationDeposit", () => ix.encodeSlashCreationDeposit(), 93],
    ["InitSharedVault", () => ix.encodeInitSharedVault(z), 94],
    ["AllocateMarket", () => ix.encodeAllocateMarket(z), 95],
    ["QueueWithdrawalSV", () => ix.encodeQueueWithdrawalSV(z), 96],
    ["ClaimEpochWithdrawal", () => ix.encodeClaimEpochWithdrawal(), 97],
    ["AdvanceEpoch", () => ix.encodeAdvanceEpoch(), 98],
    ["SetOiImbalanceHardBlock", () => ix.encodeSetOiImbalanceHardBlock({ thresholdBps: 1 }), 71],
    ["MintPositionNft", () => ix.encodeMintPositionNft(z), 64],
    ["TransferPositionOwnership", () => ix.encodeTransferPositionOwnership(z), 65],
    ["BurnPositionNft", () => ix.encodeBurnPositionNft(z), 66],
    ["SetPendingSettlement", () => ix.encodeSetPendingSettlement(z), 67],
    ["ClearPendingSettlement", () => ix.encodeClearPendingSettlement(z), 68],
    ["TransferOwnershipCpi", () => ix.encodeTransferOwnershipCpi(z), 69],
    ["SetWalletCap", () => ix.encodeSetWalletCap(z), 70],
    ["SetInsuranceWithdrawPolicy", () => ix.encodeSetInsuranceWithdrawPolicy(z), 22],
    ["WithdrawInsuranceLimited", () => ix.encodeWithdrawInsuranceLimited(z), 23],
    ["ResolvePermissionless", () => ix.encodeResolvePermissionless(), 29],
    ["ForceCloseResolved", () => ix.encodeForceCloseResolved(z), 30],
    ["CreateLpVault v12", () => ix.encodeCreateLpVault({ feeShareBps: 1 }), 74],
    ["LpVaultDeposit v12", () => ix.encodeLpVaultDeposit(z), 75],
    ["ChallengeSettlement", () => ix.encodeChallengeSettlement(z), 43],
    ["ResolveDispute", () => ix.encodeResolveDispute(z), 44],
    ["DepositLpCollateral", () => ix.encodeDepositLpCollateral(z), 45],
    ["WithdrawLpCollateral", () => ix.encodeWithdrawLpCollateral(z), 46],
    ["SetOffsetPair", () => ix.encodeSetOffsetPair(z), 54],
    ["AttestCrossMargin", () => ix.encodeAttestCrossMargin(z), 55],
    ["RescueOrphanVault", () => ix.encodeRescueOrphanVault(), 72],
    ["CloseOrphanSlab", () => ix.encodeCloseOrphanSlab(), 73],
    ["SetDexPool", () => ix.encodeSetDexPool(z), 74],
    ["CreateInsuranceMint", () => ix.encodeCreateInsuranceMint(), 74],
    ["DepositInsuranceLP", () => ix.encodeDepositInsuranceLP(z), 75],
    ["WithdrawInsuranceLP", () => ix.encodeWithdrawInsuranceLP(z), 76],
    ["SetMaxPnlCap", () => ix.encodeSetMaxPnlCap(z), 78],
    ["SetOiCapMultiplier", () => ix.encodeSetOiCapMultiplier(z), 79],
    ["SetDisputeParams", () => ix.encodeSetDisputeParams(z), 80],
    ["SetLpCollateralParams", () => ix.encodeSetLpCollateralParams(z), 81],
    ["AcceptAdmin", () => ix.encodeAcceptAdmin(), 82],
    ["ReclaimEmptyAccount", () => ix.encodeReclaimEmptyAccount(z), 85],
    ["SettleAccount", () => ix.encodeSettleAccount(z), 86],
    ["DepositFeeCredits", () => ix.encodeDepositFeeCredits(z), 27],
  ];

  for (const [name, fn, tag] of cases) {
    it(name, () => {
      expect(fn).toThrow(tag === null ? /v17 wrapper/ : new RegExp(`\\(tag ${tag}\\)`));
    });
  }

  it("IX_TAG aliases agree with their canonical tags", () => {
    expect(IX_TAG.InitUser).toBe(IX_TAG.InitPortfolio);
    expect(IX_TAG.DepositCollateral).toBe(IX_TAG.Deposit);
    expect(IX_TAG.WithdrawCollateral).toBe(IX_TAG.Withdraw);
    expect(IX_TAG.KeeperCrank).toBe(IX_TAG.PermissionlessCrank);
    expect(IX_TAG.CloseAccount).toBe(IX_TAG.ClosePortfolio);
  });
});
