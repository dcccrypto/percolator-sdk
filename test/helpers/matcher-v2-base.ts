/** Verbatim copy of the pre-optimisation encoders/decoder (bd2928b) used as the differential oracle. */
import { concatBytes, encU8, encU16, encU32, encU64, encU128, encPubkey } from "../../src/abi/encode.js";
import { MATCHER_CALL_EXT_FLAG, MATCHER_CALL_EXT_LEN, MATCHER_CALL_EXT_OFFSET, MATCHER_CALL_EXT_VERSION_V1, MATCHER_BATCH_HEADER_LEN, MATCHER_BATCH_LEG_LEN, MATCHER_CONFIGURE_AUTH_OWNER_PROOF, MATCHER_CONFIGURE_OP_SET_PARAMS, MATCHER_CONFIGURE_TAG, MATCHER_SET_PARAMS_LEN, MATCHER_BACKING_FEE_CAP_BPS_MAX, MATCHER_CONFIGURE_OP_BACKING_FEE_CAP, validateMatcherSetParams } from "../../src/abi/matcher-v2.js";
import type { MatcherBatchLeg, MatcherCallExt, MatcherOwnerProof, MatcherSetParams, MatcherV2Config } from "../../src/abi/matcher-v2.js";
const U16_MAX = 0xffff; const U64_MAX = (1n << 64n) - 1n; const EXT_FLAGS_KNOWN = 0x1f;
const ZERO_V2: MatcherV2Config = Object.freeze({ flags: 0, feeLoBps: 0, feeHiBps: 0, feeColdBps: 0, volAMilli: 0, volBDen: 0, volAlphaBps: 0, volWarmup: 0, volMoveCap10bps: 0, volRefSlots: 0, thinRebateMultBps: 0, skewCapBps: 0, rebateCapBps: 0, maxMarkAgeSlots: 0, observedStaleSlots: 0, skewRefInventory: 0n });
function checkRange(name: string, v: number, max: number): void { if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${name} must be an integer in 0..=${max}, got ${v}`); }
function checkBig(name: string, v: bigint, max: bigint): void { if (v < 0n || v > max) throw new Error(`${name} must be in 0..=${max}, got ${v}`); }
export function baseEncodeMatcherSetParams(p: MatcherSetParams): Uint8Array {
  validateMatcherSetParams(p);
  const c = p.enableV2 ? p.v2 : ZERO_V2;
  const out = concatBytes(
    encU8(p.kind), encU32(p.tradingFeeBps), encU32(p.baseSpreadBps), encU32(p.maxTotalBps), encU32(p.impactKBps),
    encU128(p.liquidityNotionalE6), encU128(p.maxFillAbs), encU128(p.maxInventoryAbs),
    encU16(p.feeToInsuranceBps), encU16(p.skewSpreadMultBps), encU8(p.enableV2 ? 1 : 0), encU8(c.flags),
    encU16(c.feeLoBps), encU16(c.feeHiBps), encU16(c.feeColdBps), encU16(c.volAMilli), encU16(c.volBDen), encU16(c.volAlphaBps),
    encU8(c.volWarmup), encU8(c.volMoveCap10bps),
    encU16(c.volRefSlots), encU16(c.thinRebateMultBps), encU16(c.skewCapBps), encU16(c.rebateCapBps),
    encU16(c.maxMarkAgeSlots), encU16(c.observedStaleSlots),
    encU64(c.skewRefInventory),
  );
  if (out.length !== MATCHER_SET_PARAMS_LEN) throw new Error(`encodeMatcherSetParams: internal length ${out.length} != 105`);
  return out;
}
function ownerProofHeader(proof: MatcherOwnerProof): Uint8Array {
  checkRange("bump", proof.bump, 255);
  return concatBytes(
    encU8(MATCHER_CONFIGURE_TAG), encU8(MATCHER_CONFIGURE_AUTH_OWNER_PROOF),
    encPubkey(proof.wrapperProgramId), encPubkey(proof.market), encPubkey(proof.lpPortfolio), encU8(proof.bump),
  );
}
export function baseEncodeConfigureBackingFeeCap(proof: MatcherOwnerProof, capBps: number): Uint8Array {
  checkRange("capBps", capBps, MATCHER_BACKING_FEE_CAP_BPS_MAX);
  return concatBytes(ownerProofHeader(proof), encU8(MATCHER_CONFIGURE_OP_BACKING_FEE_CAP), encU16(capBps));
}
export function baseEncodeConfigureSetParams(proof: MatcherOwnerProof, params: MatcherSetParams): Uint8Array {
  return concatBytes(ownerProofHeader(proof), encU8(MATCHER_CONFIGURE_OP_SET_PARAMS), baseEncodeMatcherSetParams(params));
}
export function baseEncodeCallExt(ext: MatcherCallExt): Uint8Array {
  let flags = 0;
  if (ext.headroomQ !== undefined) { checkBig("headroomQ", ext.headroomQ, U64_MAX); flags |= MATCHER_CALL_EXT_FLAG.HEADROOM; }
  if (ext.markSlot !== undefined) { checkBig("markSlot", ext.markSlot, U64_MAX); flags |= MATCHER_CALL_EXT_FLAG.MARK_SLOT; }
  if (ext.acceptsFeeRequest) flags |= MATCHER_CALL_EXT_FLAG.ACCEPTS_FEE_REQUEST;
  if (ext.takerReducing) flags |= MATCHER_CALL_EXT_FLAG.TAKER_REDUCING;
  if (ext.execBandBps !== undefined) { checkRange("execBandBps", ext.execBandBps, U16_MAX); flags |= MATCHER_CALL_EXT_FLAG.EXEC_BAND; }
  return concatBytes(
    encU8(MATCHER_CALL_EXT_VERSION_V1), encU8(flags), encU16(ext.execBandBps ?? 0),
    encU64(ext.markSlot ?? 0n), encU64(ext.headroomQ ?? 0n), encU32(0),
  );
}
export function baseDecodeCallExt(bytes: Uint8Array): MatcherCallExt | null {
  const b = bytes.length === 67 ? bytes.subarray(MATCHER_CALL_EXT_OFFSET) : bytes;
  if (b.length !== MATCHER_CALL_EXT_LEN) throw new Error(`call ext must be 24 bytes, got ${b.length}`);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const version = b[0];
  if (version === 0) {
    if (b.some((x) => x !== 0)) throw new Error("legacy call ext (version 0) must be all zero");
    return null;
  }
  if (version !== MATCHER_CALL_EXT_VERSION_V1) throw new Error(`unknown call ext version ${version}`);
  const flags = b[1];
  if ((flags & ~EXT_FLAGS_KNOWN) !== 0) throw new Error(`call ext flags 0x${flags.toString(16)} has reserved bits`);
  const band = v.getUint16(2, true);
  const markSlot = v.getBigUint64(4, true);
  const headroom = v.getBigUint64(12, true);
  if (v.getUint32(20, true) !== 0) throw new Error("call ext reserved bytes must be 0");
  const has = (f: number): boolean => (flags & f) !== 0;
  if (!has(MATCHER_CALL_EXT_FLAG.EXEC_BAND) && band !== 0) throw new Error("exec_band_bps set without EXEC_BAND");
  if (!has(MATCHER_CALL_EXT_FLAG.MARK_SLOT) && markSlot !== 0n) throw new Error("mark_slot set without MARK_SLOT");
  if (!has(MATCHER_CALL_EXT_FLAG.HEADROOM) && headroom !== 0n) throw new Error("lp_headroom_q set without HEADROOM");
  return {
    headroomQ: has(MATCHER_CALL_EXT_FLAG.HEADROOM) ? headroom : undefined,
    markSlot: has(MATCHER_CALL_EXT_FLAG.MARK_SLOT) ? markSlot : undefined,
    acceptsFeeRequest: has(MATCHER_CALL_EXT_FLAG.ACCEPTS_FEE_REQUEST),
    takerReducing: has(MATCHER_CALL_EXT_FLAG.TAKER_REDUCING),
    execBandBps: has(MATCHER_CALL_EXT_FLAG.EXEC_BAND) ? band : undefined,
  };
}
export function baseEncodeBatchCall(reqId: bigint, lpAccountId: bigint, legs: MatcherBatchLeg[], exts?: Uint8Array[]): Uint8Array {
  if (legs.length === 0 || legs.length > 16) throw new Error(`matcher batch needs 1..=16 legs, got ${legs.length}`);
  if (exts && exts.length !== legs.length) throw new Error(`exts (${exts.length}) must match legs (${legs.length})`);
  const out = new Uint8Array(MATCHER_BATCH_HEADER_LEN + legs.length * MATCHER_BATCH_LEG_LEN + (exts ? legs.length * MATCHER_CALL_EXT_LEN : 0));
  const v = new DataView(out.buffer);
  out[0] = 3;
  out[1] = legs.length;
  v.setBigUint64(2, reqId, true);
  v.setBigUint64(10, lpAccountId, true);
  legs.forEach((l, i) => {
    const b = MATCHER_BATCH_HEADER_LEN + i * MATCHER_BATCH_LEG_LEN;
    v.setUint16(b, l.assetIndex, true);
    v.setBigUint64(b + 2, l.oraclePriceE6, true);
    const u = l.reqSize < 0n ? (1n << 128n) + l.reqSize : l.reqSize;
    v.setBigUint64(b + 10, u & ((1n << 64n) - 1n), true);
    v.setBigUint64(b + 18, u >> 64n, true);
  });
  if (exts) {
    exts.forEach((e, i) => {
      if (e.length !== MATCHER_CALL_EXT_LEN) throw new Error(`ext ${i} must be 24 bytes`);
      out.set(e, MATCHER_BATCH_HEADER_LEN + legs.length * MATCHER_BATCH_LEG_LEN + i * MATCHER_CALL_EXT_LEN);
    });
  }
  return out;
}
