/**
 * matcher-v2 guard / optional-field / wrong-length branches.
 * Wire-layout round-trips live in matcher-v2.test.ts (P2 fixtures); this file only
 * exercises rejection paths and optional-field handling.
 */
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  validateMatcherSetParams,
  encodeMatcherSetParams,
  defaultMatcherV2ConfigForKind2,
  zeroMatcherV2Config,
  encodeMatcherCallExt,
  decodeMatcherCallExt,
  encodeMatcherConfigureBackingFeeCap,
  encodeMatcherConfigureSetParams,
  isMatcherCtxV2,
  decodeMatcherV2Error,
  decodeMatcherRequestedFeeBps,
  encodeWrapperMatcherCallExt,
  encodeMatcherBatchCall,
  MATCHER_CALL_EXT_LEN,
  MATCHER_BATCH_HEADER_LEN,
  MATCHER_BATCH_LEG_LEN,
  MATCHER_V2_BLOCK_ACCOUNT_OFFSET,
  MATCHER_CALL_EXT_FLAG,
  type MatcherSetParams,
} from "../src/abi/matcher-v2.js";

function kind2(): MatcherSetParams {
  return {
    kind: 2, tradingFeeBps: 0, baseSpreadBps: 50, maxTotalBps: 200, impactKBps: 10_000,
    liquidityNotionalE6: 1_000_000_000n, maxFillAbs: 1_000n, maxInventoryAbs: 4_000n,
    feeToInsuranceBps: 0, skewSpreadMultBps: 50, enableV2: true,
    v2: defaultMatcherV2ConfigForKind2(10, 50, 200, 50, 4_000n),
  };
}
const v2With = (o: Partial<MatcherSetParams["v2"]>): MatcherSetParams => ({ ...kind2(), v2: { ...kind2().v2, ...o } });

describe("validateMatcherSetParams guards", () => {
  it("accepts the baseline", () => expect(() => validateMatcherSetParams(kind2())).not.toThrow());

  it.each<[string, MatcherSetParams, RegExp]>([
    ["bad kind", { ...kind2(), kind: 3 as never }, /kind must be/],
    ["tradingFee > 1000", { ...kind2(), tradingFeeBps: 1001 }, /tradingFeeBps/],
    ["non-integer", { ...kind2(), tradingFeeBps: 1.5 }, /tradingFeeBps/],
    ["negative", { ...kind2(), baseSpreadBps: -1 }, /baseSpreadBps/],
    ["maxTotal > 9000", { ...kind2(), maxTotalBps: 9001 }, /maxTotalBps/],
    ["spread+fee > maxTotal", { ...kind2(), baseSpreadBps: 199, tradingFeeBps: 2 }, /<= maxTotalBps/],
    ["liquidity > u128", { ...kind2(), liquidityNotionalE6: 1n << 128n }, /liquidityNotionalE6/],
    ["maxFill negative", { ...kind2(), maxFillAbs: -1n }, /maxFillAbs/],
    ["maxInventory > u128", { ...kind2(), maxInventoryAbs: 1n << 128n }, /maxInventoryAbs/],
    ["feeToInsurance > 10000", { ...kind2(), feeToInsuranceBps: 10_001 }, /feeToInsuranceBps/],
    ["skewMult > 10000", { ...kind2(), skewSpreadMultBps: 10_001 }, /skewSpreadMultBps/],
    ["kind1 no liquidity", { ...kind2(), kind: 1, liquidityNotionalE6: 0n, v2: zeroMatcherV2Config() }, /kind 1/],
    ["v2 u16 overflow", v2With({ feeHiBps: 0x10000 }), /v2\.feeHiBps/],
    ["v2 flags > u8", v2With({ flags: 256 }), /v2\.flags/],
    ["v2 warmup > u8", v2With({ volWarmup: 256 }), /v2\.volWarmup/],
    ["v2 moveCap > u8", v2With({ volMoveCap10bps: 256 }), /v2\.volMoveCap10bps/],
    ["skewRef > u64", v2With({ skewRefInventory: 1n << 64n }), /skewRefInventory/],
    ["unknown flag bits", v2With({ flags: 3 }), /unknown bits/],
    ["fee order", v2With({ feeLoBps: 50, feeColdBps: 10 }), /feeLo <= feeCold/],
    ["feeHi > 1000", { ...kind2(), maxTotalBps: 2000, v2: { ...kind2().v2, feeHiBps: 1001 } }, /feeHiBps must be <= 1000/],
    ["spread+feeHi > maxTotal", v2With({ feeHiBps: 151 }), /feeHiBps must be <= maxTotalBps|<= maxTotalBps/],
    ["alpha 0", v2With({ volAlphaBps: 0 }), /volAlphaBps/],
    ["alpha > 10000", v2With({ volAlphaBps: 10_001 }), /volAlphaBps/],
    ["refSlots 0", v2With({ volRefSlots: 0 }), />= 1/],
    ["moveCap 0", v2With({ volMoveCap10bps: 0 }), />= 1/],
    ["skewCap > 5000", v2With({ skewCapBps: 5001 }), /rebateCap <= skewCap/],
    ["rebateCap > skewCap", v2With({ skewCapBps: 10, rebateCapBps: 11 }), /rebateCap <= skewCap/],
    ["thinRebate > skewMult", v2With({ thinRebateMultBps: 51 }), /round-trip/],
    ["skew on, ref 0", v2With({ skewRefInventory: 0n }), /skewRefInventory must be > 0/],
    ["impactK > max", { ...kind2(), impactKBps: 100_001 }, /impactKBps/],
    ["impactK with no liquidity", { ...kind2(), liquidityNotionalE6: 0n }, /impactKBps/],
  ])("rejects %s", (_n, p, re) => {
    expect(() => validateMatcherSetParams(p)).toThrow(re);
  });

  it("kinds 0/1 with enableV2=false pass and encode a zeroed v2 block", () => {
    const p: MatcherSetParams = { ...kind2(), kind: 0, enableV2: false, impactKBps: 0, skewSpreadMultBps: 0 };
    expect(() => validateMatcherSetParams(p)).not.toThrow();
    const b = encodeMatcherSetParams(p);
    expect(b[69]).toBe(0);
    expect(b.subarray(70).every((x) => x === 0)).toBe(true);
  });

  it("kinds 0/1 guard-only block allows flags/maxMarkAge/observedStale but not pricing", () => {
    const base: MatcherSetParams = { ...kind2(), kind: 0, impactKBps: 0, skewSpreadMultBps: 0 };
    const ok = { ...base, v2: { ...zeroMatcherV2Config(), flags: 1, maxMarkAgeSlots: 5, observedStaleSlots: 7 } };
    expect(() => validateMatcherSetParams(ok)).not.toThrow();
    expect(encodeMatcherSetParams(ok)[69]).toBe(1);
    expect(() => validateMatcherSetParams({ ...ok, v2: { ...ok.v2, skewRefInventory: 1n } })).toThrow(/pricing field/);
  });
});

describe("defaultMatcherV2ConfigForKind2 clamps", () => {
  it("maxInventory 0 and > u64 both map to u64::MAX", () => {
    const U64 = (1n << 64n) - 1n;
    expect(defaultMatcherV2ConfigForKind2(10, 50, 200, 50, 0n).skewRefInventory).toBe(U64);
    expect(defaultMatcherV2ConfigForKind2(10, 50, 200, 50, 1n << 70n).skewRefInventory).toBe(U64);
  });
  it("no room (maxTotal <= base) gives zero fees; huge tradingFee is capped to room", () => {
    const c = defaultMatcherV2ConfigForKind2(5000, 300, 200, 0, 1n);
    expect(c.feeHiBps).toBe(0);
    expect(c.feeLoBps).toBe(0);
    expect(c.feeColdBps).toBe(0);
    const d = defaultMatcherV2ConfigForKind2(5000, 0, 9000, 0, 1n);
    expect(d.feeHiBps).toBe(80);
    expect(d.feeLoBps).toBe(80);
  });
});

describe("tag-5 configure guards", () => {
  // Fixed pubkeys: the encoders only read the 32 bytes, and Keypair.generate() (ed25519
  // keygen, 3 per proof) was the cost: up to ~2.6 s under load. Bytes asserted below.
  const W = new PublicKey(new Uint8Array(32).fill(0x11));
  const M = new PublicKey(new Uint8Array(32).fill(0x22));
  const L = new PublicKey(new Uint8Array(32).fill(0x33));
  const proof = (bump = 1) => ({ wrapperProgramId: W, market: M, lpPortfolio: L, bump });
  it("backing fee cap range + bump range", () => {
    expect(() => encodeMatcherConfigureBackingFeeCap(proof(), 10_001)).toThrow(/capBps/);
    expect(() => encodeMatcherConfigureBackingFeeCap(proof(), -1)).toThrow(/capBps/);
    expect(() => encodeMatcherConfigureBackingFeeCap(proof(), 1.5)).toThrow(/capBps/);
    expect(() => encodeMatcherConfigureBackingFeeCap(proof(256), 1)).toThrow(/bump/);
    expect(() => encodeMatcherConfigureBackingFeeCap(proof(-1), 1)).toThrow(/bump/);
    const top = encodeMatcherConfigureBackingFeeCap(proof(255), 10_000);
    expect(top.length).toBe(102);
    expect(top[98]).toBe(255);
    expect([top[100], top[101]]).toEqual([0x10, 0x27]);
    const bottom = encodeMatcherConfigureBackingFeeCap(proof(0), 0);
    expect(bottom[98]).toBe(0);
    expect([bottom[100], bottom[101]]).toEqual([0, 0]);
    expect(top[2]).toBe(0x11);
    expect(top[34]).toBe(0x22);
    expect(top[66]).toBe(0x33);
  });
  it("set params op validates params before encoding", () => {
    expect(() => encodeMatcherConfigureSetParams(proof(), { ...kind2(), kind: 9 as never })).toThrow(/kind/);
    expect(encodeMatcherConfigureSetParams(proof(), kind2()).length).toBe(205);
  });
});

describe("call ext guards + optional fields", () => {
  it("encodes only the flags for fields provided", () => {
    const empty = encodeMatcherCallExt({ acceptsFeeRequest: false, takerReducing: false });
    expect(empty.length).toBe(MATCHER_CALL_EXT_LEN);
    expect(empty[0]).toBe(1);
    expect(empty[1]).toBe(0);
    const all = encodeMatcherCallExt({ headroomQ: 0n, markSlot: 0n, execBandBps: 0, acceptsFeeRequest: true, takerReducing: true });
    expect(all[1]).toBe(0x1f);
  });
  it("round-trips optional fields (undefined stays undefined, zero stays zero)", () => {
    const d = decodeMatcherCallExt(encodeMatcherCallExt({ headroomQ: 0n, acceptsFeeRequest: true, takerReducing: false }))!;
    expect(d.headroomQ).toBe(0n);
    expect(d.markSlot).toBeUndefined();
    expect(d.execBandBps).toBeUndefined();
    expect(d.acceptsFeeRequest).toBe(true);
    expect(d.takerReducing).toBe(false);
  });
  it("encode rejects out-of-range fields", () => {
    expect(() => encodeMatcherCallExt({ headroomQ: 1n << 64n, acceptsFeeRequest: false, takerReducing: false })).toThrow(/headroomQ/);
    expect(() => encodeMatcherCallExt({ markSlot: -1n, acceptsFeeRequest: false, takerReducing: false })).toThrow(/markSlot/);
    expect(() => encodeMatcherCallExt({ execBandBps: 65_536, acceptsFeeRequest: false, takerReducing: false })).toThrow(/execBandBps/);
  });
  it("decode rejects wrong lengths", () => {
    expect(() => decodeMatcherCallExt(new Uint8Array(23))).toThrow(/24 bytes/);
    expect(() => decodeMatcherCallExt(new Uint8Array(66))).toThrow(/24 bytes/);
  });
  it("decode slices a 67-byte tag-0 call at offset 43", () => {
    const call = new Uint8Array(67);
    call.set(encodeMatcherCallExt({ markSlot: 9n, acceptsFeeRequest: false, takerReducing: true }), 43);
    expect(decodeMatcherCallExt(call)!.markSlot).toBe(9n);
    expect(decodeMatcherCallExt(new Uint8Array(67))).toBeNull();
  });
  it("decode rejects legacy-nonzero, bad version, reserved bits, reserved bytes", () => {
    const legacy = new Uint8Array(24); legacy[5] = 1;
    expect(() => decodeMatcherCallExt(legacy)).toThrow(/all zero/);
    const badVer = new Uint8Array(24); badVer[0] = 2;
    expect(() => decodeMatcherCallExt(badVer)).toThrow(/unknown call ext version/);
    const bits = new Uint8Array(24); bits[0] = 1; bits[1] = 0x20;
    expect(() => decodeMatcherCallExt(bits)).toThrow(/reserved bits/);
    const rsv = new Uint8Array(24); rsv[0] = 1; rsv[20] = 1;
    expect(() => decodeMatcherCallExt(rsv)).toThrow(/reserved bytes/);
  });
  it("decode rejects a field set without its flag", () => {
    const mk = (off: number) => { const b = new Uint8Array(24); b[0] = 1; b[off] = 1; return b; };
    expect(() => decodeMatcherCallExt(mk(2))).toThrow(/exec_band/);
    expect(() => decodeMatcherCallExt(mk(4))).toThrow(/mark_slot/);
    expect(() => decodeMatcherCallExt(mk(12))).toThrow(/lp_headroom_q/);
    const ok = mk(12); ok[1] = MATCHER_CALL_EXT_FLAG.HEADROOM;
    expect(decodeMatcherCallExt(ok)!.headroomQ).toBe(1n);
  });
});

describe("misc decoders", () => {
  it("decodeMatcherV2Error known / unknown", () => {
    expect(decodeMatcherV2Error(8002)?.name).toBe("ERR_STALE_MARK");
    expect(decodeMatcherV2Error(1)).toBeUndefined();
  });
  it("decodeMatcherRequestedFeeBps extracts bits 22..31 and ignores low bits", () => {
    expect(decodeMatcherRequestedFeeBps(((1023 << 22) >>> 0) | 0x3f)).toBe(1023);
    expect(decodeMatcherRequestedFeeBps(0x3fffff)).toBe(0);
    expect(decodeMatcherRequestedFeeBps((300 << 22) | 1)).toBe(300);
  });
  it("isMatcherCtxV2: short, wrong magic, wrong version, ok", () => {
    expect(isMatcherCtxV2(new Uint8Array(MATCHER_V2_BLOCK_ACCOUNT_OFFSET))).toBe(false);
    const d = new Uint8Array(320);
    expect(isMatcherCtxV2(d)).toBe(false);
    new DataView(d.buffer).setBigUint64(64, 0x504552434d415443n, true);
    expect(isMatcherCtxV2(d)).toBe(false);
    d[MATCHER_V2_BLOCK_ACCOUNT_OFFSET] = 1;
    expect(isMatcherCtxV2(d)).toBe(true);
    d[MATCHER_V2_BLOCK_ACCOUNT_OFFSET] = 2;
    expect(isMatcherCtxV2(d)).toBe(false);
  });
  it("isMatcherCtxV2 respects a subarray byteOffset", () => {
    const big = new Uint8Array(400);
    new DataView(big.buffer).setBigUint64(10 + 64, 0x504552434d415443n, true);
    big[10 + MATCHER_V2_BLOCK_ACCOUNT_OFFSET] = 1;
    expect(isMatcherCtxV2(big.subarray(10, 330))).toBe(true);
  });
});

describe("wrapper ext + batch call", () => {
  it("mode 0 is all-zero legacy; unknown modes (the wrapper refuses > 1) throw", () => {
    expect(encodeWrapperMatcherCallExt(0, 5n, 5n, 300, false, false)).toEqual(new Uint8Array(24));
    expect(() => encodeWrapperMatcherCallExt(2, 5n, 5n, 300, true, true)).toThrow(/mode/);
  });
  it("mode 1 sets HEADROOM|MARK_SLOT|EXEC_BAND and saturates headroom", () => {
    const b = encodeWrapperMatcherCallExt(1, 505n, (1n << 70n), 300, true, true);
    expect(b[1]).toBe(0x1f);
    const d = decodeMatcherCallExt(b)!;
    expect(d.headroomQ).toBe((1n << 64n) - 1n);
    expect(d.markSlot).toBe(505n);
    expect(d.execBandBps).toBe(300);
    const n = decodeMatcherCallExt(encodeWrapperMatcherCallExt(1, 1n, 7n, 0, false, false))!;
    expect(n.headroomQ).toBe(7n);
    expect(n.takerReducing).toBe(false);
    expect(n.acceptsFeeRequest).toBe(false);
  });
  const leg = (i: number, size: bigint) => ({ assetIndex: i, oraclePriceE6: 1_000_000n + BigInt(i), reqSize: size });
  it("rejects 0 legs, >16 legs, mismatched exts, wrong ext length", () => {
    expect(() => encodeMatcherBatchCall(1n, 2n, [])).toThrow(/1\.\.=16/);
    expect(() => encodeMatcherBatchCall(1n, 2n, Array.from({ length: 17 }, (_, i) => leg(i, 1n)))).toThrow(/1\.\.=16/);
    expect(() => encodeMatcherBatchCall(1n, 2n, [leg(0, 1n)], [])).toThrow(/must match legs/);
    expect(() => encodeMatcherBatchCall(1n, 2n, [leg(0, 1n)], [new Uint8Array(23)])).toThrow(/ext 0 must be 24/);
  });
  it("legacy and extended lengths; i128 two's complement for negative sizes", () => {
    const legacy = encodeMatcherBatchCall(7n, 9n, [leg(1, -5n), leg(2, 5n)]);
    expect(legacy.length).toBe(MATCHER_BATCH_HEADER_LEN + 2 * MATCHER_BATCH_LEG_LEN);
    expect(legacy[0]).toBe(3);
    expect(legacy[1]).toBe(2);
    const v = new DataView(legacy.buffer);
    expect(v.getBigUint64(2, true)).toBe(7n);
    expect(v.getBigUint64(10, true)).toBe(9n);
    expect(v.getUint16(18, true)).toBe(1);
    expect(v.getBigUint64(18 + 10, true)).toBe((1n << 64n) - 5n);
    expect(v.getBigUint64(18 + 18, true)).toBe((1n << 64n) - 1n);
    expect(v.getBigUint64(44 + 10, true)).toBe(5n);
    expect(v.getBigUint64(44 + 18, true)).toBe(0n);
    const ext = encodeWrapperMatcherCallExt(1, 5n, 5n, 300, false, false);
    const full = encodeMatcherBatchCall(7n, 9n, [leg(1, -5n), leg(2, 5n)], [ext, ext]);
    expect(full.length).toBe(18 + 52 + 48);
    expect(full.subarray(70, 94)).toEqual(ext);
    expect(full.subarray(94)).toEqual(ext);
  });
});
