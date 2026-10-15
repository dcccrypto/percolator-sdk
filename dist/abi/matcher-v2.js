import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { concatBytes, encPubkey, encU8, encU16, encU32, encU64, encU128 } from "./encode.js";
import { MATCHER_RETURN_KNOWN_FLAGS } from "./instructions.js";
const MATCHER_CONFIGURE_TAG = 5;
const MATCHER_CONFIGURE_AUTH_LP_PDA = 0;
const MATCHER_CONFIGURE_AUTH_OWNER_PROOF = 1;
const MATCHER_CONFIGURE_HEADER_LP_PDA_LEN = 2;
const MATCHER_CONFIGURE_HEADER_OWNER_PROOF_LEN = 99;
const MATCHER_CONFIGURE_OP_BACKING_FEE_CAP = 0;
const MATCHER_CONFIGURE_OP_SET_PARAMS = 1;
const MATCHER_SET_PARAMS_LEN = 105;
const MATCHER_BACKING_FEE_CAP_BPS_MAX = 1e4;
const MATCHER_KIND = { Passive: 0, Vamm: 1, Adaptive: 2 };
const MATCHER_CALL_EXT_OFFSET = 43;
const MATCHER_CALL_EXT_LEN = 24;
const MATCHER_CALL_EXT_VERSION_V1 = 1;
const MATCHER_CALL_EXT_FLAG = {
  HEADROOM: 1,
  MARK_SLOT: 2,
  ACCEPTS_FEE_REQUEST: 4,
  TAKER_REDUCING: 8,
  EXEC_BAND: 16
};
const EXT_FLAGS_KNOWN = 31;
const MATCHER_RETURN_FLAG_REQUESTED_FEE_SHIFT = 22;
const MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK = 1023 << 22 >>> 0;
const MATCHER_REQUESTED_FEE_BPS_MAX = 1023;
const MATCHER_RETURN_KNOWN_FLAGS_V2 = (MATCHER_RETURN_KNOWN_FLAGS | MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK) >>> 0;
const MATCHER_V2_BLOCK_CTX_OFFSET = 178;
const MATCHER_V2_BLOCK_ACCOUNT_OFFSET = 242;
const MATCHER_V2_BLOCK_LEN = 78;
const MATCHER_V2_BLOCK_VERSION = 1;
const MATCHER_V2_FLAG_STALE_ALLOW_REDUCING = 1;
const MATCHER_V2_ERRORS = Object.freeze({
  8002: { name: "ERR_STALE_MARK", hint: "Matcher refused: the mark behind oracle_price_e6 is older than the ctx's max_mark_age_slots (call-extension mark_slot), or the observed-unchanged-price fallback tripped. Push a fresh mark, then retry. With STALE_ALLOW_REDUCING, reducing fills still pass." },
  8003: { name: "ERR_MARK_SLOT_IN_FUTURE", hint: "Matcher refused: call-extension mark_slot is greater than Clock.slot. The caller built a bad extension." },
  8004: { name: "ERR_ASSET_MISMATCH", hint: "Matcher refused: this kind-2 / observed-staleness context is bound to a different asset. One such context per asset." },
  8005: { name: "ERR_OWNER_PROOF_MISMATCH", hint: "Matcher tag 5 owner proof failed: create_program_address(['matcher', market, lp_portfolio, lp_owner, matcher_program, matcher_ctx, [bump]], wrapper) does not equal ctx.lp_pda. Check wrapper id, market, LP portfolio, signer = LP owner, and bump (deriveMatcherDelegate)." },
  8001: { name: "ERR_INCONSISTENT_LEG_ORACLE_PRICE", hint: "Matcher batch call: legs for the same asset carried different oracle prices." }
});
function decodeMatcherV2Error(code) {
  return MATCHER_V2_ERRORS[code];
}
const ZERO_V2 = Object.freeze({
  flags: 0,
  feeLoBps: 0,
  feeHiBps: 0,
  feeColdBps: 0,
  volAMilli: 0,
  volBDen: 0,
  volAlphaBps: 0,
  volWarmup: 0,
  volMoveCap10bps: 0,
  volRefSlots: 0,
  thinRebateMultBps: 0,
  skewCapBps: 0,
  rebateCapBps: 0,
  maxMarkAgeSlots: 0,
  observedStaleSlots: 0,
  skewRefInventory: 0n
});
function zeroMatcherV2Config() {
  return { ...ZERO_V2 };
}
const U16_MAX = 65535;
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const DEFAULTS = {
  feeLo: 10,
  feeHi: 80,
  feeCold: 10,
  volAMilli: 1e3,
  volBDen: 100,
  volAlpha: 1e3,
  volWarmup: 8,
  volMoveCap10bps: 100,
  volRefSlots: 25,
  skewCap: 100,
  maxMarkAge: 150,
  observedStale: 0,
  flags: MATCHER_V2_FLAG_STALE_ALLOW_REDUCING,
  maxFeeBps: 1e3,
  maxSkewCapBps: 5e3
};
const MATCHER_V2_MAX_IMPACT_K_BPS = 1e5;
function defaultMatcherV2ConfigForKind2(tradingFeeBps, baseSpreadBps, maxTotalBps, skewSpreadMultBps, maxInventoryAbs) {
  const room = Math.min(Math.max(maxTotalBps - baseSpreadBps, 0), DEFAULTS.maxFeeBps);
  const feeHi = Math.min(DEFAULTS.feeHi, room);
  const loWant = Math.max(Math.min(tradingFeeBps, DEFAULTS.maxFeeBps), DEFAULTS.feeLo);
  const feeLo = Math.min(loWant, feeHi);
  const feeCold = Math.min(Math.max(DEFAULTS.feeCold, feeLo), feeHi);
  const skewCap = Math.min(DEFAULTS.skewCap, DEFAULTS.maxSkewCapBps, Math.min(maxTotalBps, U16_MAX));
  const skewRef = maxInventoryAbs === 0n || maxInventoryAbs > U64_MAX ? U64_MAX : maxInventoryAbs;
  return {
    flags: DEFAULTS.flags,
    feeLoBps: feeLo,
    feeHiBps: feeHi,
    feeColdBps: feeCold,
    volAMilli: DEFAULTS.volAMilli,
    volBDen: DEFAULTS.volBDen,
    volAlphaBps: DEFAULTS.volAlpha,
    volWarmup: DEFAULTS.volWarmup,
    volMoveCap10bps: DEFAULTS.volMoveCap10bps,
    volRefSlots: DEFAULTS.volRefSlots,
    thinRebateMultBps: Math.floor(skewSpreadMultBps / 2),
    skewCapBps: skewCap,
    rebateCapBps: Math.floor(skewCap / 2),
    maxMarkAgeSlots: DEFAULTS.maxMarkAge,
    observedStaleSlots: DEFAULTS.observedStale,
    skewRefInventory: skewRef
  };
}
function checkRange(name, v, max) {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${name} must be an integer in 0..=${max}, got ${v}`);
}
function checkBig(name, v, max) {
  if (v < 0n || v > max) throw new Error(`${name} must be in 0..=${max}, got ${v}`);
}
function validateMatcherSetParams(p) {
  if (p.kind !== 0 && p.kind !== 1 && p.kind !== 2) throw new Error(`kind must be 0|1|2, got ${String(p.kind)}`);
  checkRange("tradingFeeBps", p.tradingFeeBps, 1e3);
  checkRange("maxTotalBps", p.maxTotalBps, 9e3);
  checkRange("baseSpreadBps", p.baseSpreadBps, 4294967295);
  checkRange("impactKBps", p.impactKBps, 4294967295);
  if (p.baseSpreadBps + p.tradingFeeBps > p.maxTotalBps) throw new Error("baseSpreadBps + tradingFeeBps must be <= maxTotalBps");
  checkBig("liquidityNotionalE6", p.liquidityNotionalE6, U128_MAX);
  checkBig("maxFillAbs", p.maxFillAbs, U128_MAX);
  checkBig("maxInventoryAbs", p.maxInventoryAbs, U128_MAX);
  checkRange("feeToInsuranceBps", p.feeToInsuranceBps, 1e4);
  checkRange("skewSpreadMultBps", p.skewSpreadMultBps, 1e4);
  if (p.kind === 1 && p.liquidityNotionalE6 === 0n) throw new Error("kind 1 (vAMM) requires liquidityNotionalE6 > 0");
  const c = p.v2;
  for (const [k, v] of [
    ["feeLoBps", c.feeLoBps],
    ["feeHiBps", c.feeHiBps],
    ["feeColdBps", c.feeColdBps],
    ["volAMilli", c.volAMilli],
    ["volBDen", c.volBDen],
    ["volAlphaBps", c.volAlphaBps],
    ["volRefSlots", c.volRefSlots],
    ["thinRebateMultBps", c.thinRebateMultBps],
    ["skewCapBps", c.skewCapBps],
    ["rebateCapBps", c.rebateCapBps],
    ["maxMarkAgeSlots", c.maxMarkAgeSlots],
    ["observedStaleSlots", c.observedStaleSlots]
  ]) checkRange(`v2.${k}`, v, U16_MAX);
  checkRange("v2.flags", c.flags, 255);
  checkRange("v2.volWarmup", c.volWarmup, 255);
  checkRange("v2.volMoveCap10bps", c.volMoveCap10bps, 255);
  checkBig("v2.skewRefInventory", c.skewRefInventory, U64_MAX);
  if (!p.enableV2) {
    if (p.kind === 2) throw new Error("kind 2 requires enableV2");
    return;
  }
  if ((c.flags & ~MATCHER_V2_FLAG_STALE_ALLOW_REDUCING) !== 0) throw new Error("v2.flags: unknown bits");
  if (p.kind !== 2) {
    const pricingZero = c.feeLoBps === 0 && c.feeHiBps === 0 && c.feeColdBps === 0 && c.volAMilli === 0 && c.volBDen === 0 && c.volAlphaBps === 0 && c.volWarmup === 0 && c.volMoveCap10bps === 0 && c.volRefSlots === 0 && c.thinRebateMultBps === 0 && c.skewCapBps === 0 && c.rebateCapBps === 0 && c.skewRefInventory === 0n;
    if (!pricingZero) throw new Error("kinds 0/1: every v2 pricing field must be 0 (only flags/maxMarkAgeSlots/observedStaleSlots allowed)");
    return;
  }
  if (!(c.feeLoBps <= c.feeColdBps && c.feeColdBps <= c.feeHiBps)) throw new Error("v2: need feeLo <= feeCold <= feeHi");
  if (c.feeHiBps > DEFAULTS.maxFeeBps) throw new Error("v2.feeHiBps must be <= 1000");
  if (p.baseSpreadBps + c.feeHiBps > p.maxTotalBps) throw new Error("v2: baseSpreadBps + feeHiBps must be <= maxTotalBps");
  if (c.volAlphaBps === 0 || c.volAlphaBps > 1e4) throw new Error("v2.volAlphaBps must be 1..=10000");
  if (c.volRefSlots === 0 || c.volMoveCap10bps === 0) throw new Error("v2.volRefSlots and v2.volMoveCap10bps must be >= 1");
  if (c.skewCapBps > DEFAULTS.maxSkewCapBps || c.rebateCapBps > c.skewCapBps) throw new Error("v2: need rebateCap <= skewCap <= 5000");
  if (c.thinRebateMultBps > p.skewSpreadMultBps) throw new Error("v2.thinRebateMultBps must be <= skewSpreadMultBps (round-trip safety)");
  if ((p.skewSpreadMultBps > 0 || c.thinRebateMultBps > 0) && c.skewRefInventory === 0n) throw new Error("v2.skewRefInventory must be > 0 when skew or rebate is on");
  if (p.impactKBps > MATCHER_V2_MAX_IMPACT_K_BPS || p.impactKBps > 0 && p.liquidityNotionalE6 === 0n) {
    throw new Error("impactKBps must be <= 100000, and > 0 requires liquidityNotionalE6 > 0");
  }
}
function encodeMatcherSetParams(p) {
  validateMatcherSetParams(p);
  const c = p.enableV2 ? p.v2 : ZERO_V2;
  const out = concatBytes(
    encU8(p.kind),
    encU32(p.tradingFeeBps),
    encU32(p.baseSpreadBps),
    encU32(p.maxTotalBps),
    encU32(p.impactKBps),
    encU128(p.liquidityNotionalE6),
    encU128(p.maxFillAbs),
    encU128(p.maxInventoryAbs),
    encU16(p.feeToInsuranceBps),
    encU16(p.skewSpreadMultBps),
    encU8(p.enableV2 ? 1 : 0),
    encU8(c.flags),
    encU16(c.feeLoBps),
    encU16(c.feeHiBps),
    encU16(c.feeColdBps),
    encU16(c.volAMilli),
    encU16(c.volBDen),
    encU16(c.volAlphaBps),
    encU8(c.volWarmup),
    encU8(c.volMoveCap10bps),
    encU16(c.volRefSlots),
    encU16(c.thinRebateMultBps),
    encU16(c.skewCapBps),
    encU16(c.rebateCapBps),
    encU16(c.maxMarkAgeSlots),
    encU16(c.observedStaleSlots),
    encU64(c.skewRefInventory)
  );
  if (out.length !== MATCHER_SET_PARAMS_LEN) throw new Error(`encodeMatcherSetParams: internal length ${out.length} != 105`);
  return out;
}
function ownerProofHeader(proof) {
  checkRange("bump", proof.bump, 255);
  return concatBytes(
    encU8(MATCHER_CONFIGURE_TAG),
    encU8(MATCHER_CONFIGURE_AUTH_OWNER_PROOF),
    encPubkey(proof.wrapperProgramId),
    encPubkey(proof.market),
    encPubkey(proof.lpPortfolio),
    encU8(proof.bump)
  );
}
function encodeMatcherConfigureBackingFeeCap(proof, capBps) {
  checkRange("capBps", capBps, MATCHER_BACKING_FEE_CAP_BPS_MAX);
  return concatBytes(ownerProofHeader(proof), encU8(MATCHER_CONFIGURE_OP_BACKING_FEE_CAP), encU16(capBps));
}
function encodeMatcherConfigureSetParams(proof, params) {
  return concatBytes(ownerProofHeader(proof), encU8(MATCHER_CONFIGURE_OP_SET_PARAMS), encodeMatcherSetParams(params));
}
function matcherConfigureOwnerProofAccounts(lpOwner, matcherCtx) {
  return [
    { pubkey: lpOwner, isSigner: true, isWritable: false },
    { pubkey: matcherCtx, isSigner: false, isWritable: true }
  ];
}
function deriveProof(a) {
  const [, bump] = PublicKey.findProgramAddressSync(
    [
      new TextEncoder().encode("matcher"),
      a.market.toBytes(),
      a.lpPortfolio.toBytes(),
      a.lpOwner.toBytes(),
      a.matcherProgramId.toBytes(),
      a.matcherCtx.toBytes()
    ],
    a.wrapperProgramId
  );
  return { wrapperProgramId: a.wrapperProgramId, market: a.market, lpPortfolio: a.lpPortfolio, bump };
}
function buildMatcherConfigureBackingFeeCapIx(a, capBps) {
  return new TransactionInstruction({
    programId: a.matcherProgramId,
    keys: matcherConfigureOwnerProofAccounts(a.lpOwner, a.matcherCtx),
    data: Buffer.from(encodeMatcherConfigureBackingFeeCap(deriveProof(a), capBps))
  });
}
function buildMatcherConfigureSetParamsIx(a, params) {
  return new TransactionInstruction({
    programId: a.matcherProgramId,
    keys: matcherConfigureOwnerProofAccounts(a.lpOwner, a.matcherCtx),
    data: Buffer.from(encodeMatcherConfigureSetParams(deriveProof(a), params))
  });
}
function encodeMatcherCallExt(ext) {
  let flags = 0;
  if (ext.headroomQ !== void 0) {
    checkBig("headroomQ", ext.headroomQ, U64_MAX);
    flags |= MATCHER_CALL_EXT_FLAG.HEADROOM;
  }
  if (ext.markSlot !== void 0) {
    checkBig("markSlot", ext.markSlot, U64_MAX);
    flags |= MATCHER_CALL_EXT_FLAG.MARK_SLOT;
  }
  if (ext.acceptsFeeRequest) flags |= MATCHER_CALL_EXT_FLAG.ACCEPTS_FEE_REQUEST;
  if (ext.takerReducing) flags |= MATCHER_CALL_EXT_FLAG.TAKER_REDUCING;
  if (ext.execBandBps !== void 0) {
    checkRange("execBandBps", ext.execBandBps, U16_MAX);
    flags |= MATCHER_CALL_EXT_FLAG.EXEC_BAND;
  }
  return concatBytes(
    encU8(MATCHER_CALL_EXT_VERSION_V1),
    encU8(flags),
    encU16(ext.execBandBps ?? 0),
    encU64(ext.markSlot ?? 0n),
    encU64(ext.headroomQ ?? 0n),
    encU32(0)
  );
}
function decodeMatcherCallExt(bytes) {
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
  const has = (f) => (flags & f) !== 0;
  if (!has(MATCHER_CALL_EXT_FLAG.EXEC_BAND) && band !== 0) throw new Error("exec_band_bps set without EXEC_BAND");
  if (!has(MATCHER_CALL_EXT_FLAG.MARK_SLOT) && markSlot !== 0n) throw new Error("mark_slot set without MARK_SLOT");
  if (!has(MATCHER_CALL_EXT_FLAG.HEADROOM) && headroom !== 0n) throw new Error("lp_headroom_q set without HEADROOM");
  return {
    headroomQ: has(MATCHER_CALL_EXT_FLAG.HEADROOM) ? headroom : void 0,
    markSlot: has(MATCHER_CALL_EXT_FLAG.MARK_SLOT) ? markSlot : void 0,
    acceptsFeeRequest: has(MATCHER_CALL_EXT_FLAG.ACCEPTS_FEE_REQUEST),
    takerReducing: has(MATCHER_CALL_EXT_FLAG.TAKER_REDUCING),
    execBandBps: has(MATCHER_CALL_EXT_FLAG.EXEC_BAND) ? band : void 0
  };
}
function decodeMatcherRequestedFeeBps(flags) {
  return (flags >>> 0 & MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK) >>> MATCHER_RETURN_FLAG_REQUESTED_FEE_SHIFT;
}
function isMatcherCtxV2(ctxAccountData) {
  if (ctxAccountData.length < MATCHER_V2_BLOCK_ACCOUNT_OFFSET + 1) return false;
  const magic = new DataView(ctxAccountData.buffer, ctxAccountData.byteOffset + 64, 8).getBigUint64(0, true);
  return magic === 0x504552434d415443n && ctxAccountData[MATCHER_V2_BLOCK_ACCOUNT_OFFSET] === MATCHER_V2_BLOCK_VERSION;
}
const MATCHER_BATCH_HEADER_LEN = 18;
const MATCHER_BATCH_LEG_LEN = 26;
const WRAPPER_BATCH_MAX_LEGS = 11;
function encodeWrapperMatcherCallExt(mode, markSlot, lpHeadroomQ, execBandBps, takerReducing, acceptsFeeRequest) {
  if (mode !== 1) return new Uint8Array(MATCHER_CALL_EXT_LEN);
  const headroom = lpHeadroomQ > (1n << 64n) - 1n ? (1n << 64n) - 1n : lpHeadroomQ;
  return encodeMatcherCallExt({ headroomQ: headroom, markSlot, execBandBps, takerReducing, acceptsFeeRequest });
}
function encodeMatcherBatchCall(reqId, lpAccountId, legs, exts) {
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
    v.setBigUint64(b + 10, u & (1n << 64n) - 1n, true);
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
export {
  MATCHER_BACKING_FEE_CAP_BPS_MAX,
  MATCHER_BATCH_HEADER_LEN,
  MATCHER_BATCH_LEG_LEN,
  MATCHER_CALL_EXT_FLAG,
  MATCHER_CALL_EXT_LEN,
  MATCHER_CALL_EXT_OFFSET,
  MATCHER_CALL_EXT_VERSION_V1,
  MATCHER_CONFIGURE_AUTH_LP_PDA,
  MATCHER_CONFIGURE_AUTH_OWNER_PROOF,
  MATCHER_CONFIGURE_HEADER_LP_PDA_LEN,
  MATCHER_CONFIGURE_HEADER_OWNER_PROOF_LEN,
  MATCHER_CONFIGURE_OP_BACKING_FEE_CAP,
  MATCHER_CONFIGURE_OP_SET_PARAMS,
  MATCHER_CONFIGURE_TAG,
  MATCHER_KIND,
  MATCHER_REQUESTED_FEE_BPS_MAX,
  MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK,
  MATCHER_RETURN_FLAG_REQUESTED_FEE_SHIFT,
  MATCHER_RETURN_KNOWN_FLAGS_V2,
  MATCHER_SET_PARAMS_LEN,
  MATCHER_V2_BLOCK_ACCOUNT_OFFSET,
  MATCHER_V2_BLOCK_CTX_OFFSET,
  MATCHER_V2_BLOCK_LEN,
  MATCHER_V2_BLOCK_VERSION,
  MATCHER_V2_ERRORS,
  MATCHER_V2_FLAG_STALE_ALLOW_REDUCING,
  MATCHER_V2_MAX_IMPACT_K_BPS,
  WRAPPER_BATCH_MAX_LEGS,
  buildMatcherConfigureBackingFeeCapIx,
  buildMatcherConfigureSetParamsIx,
  decodeMatcherCallExt,
  decodeMatcherRequestedFeeBps,
  decodeMatcherV2Error,
  defaultMatcherV2ConfigForKind2,
  encodeMatcherBatchCall,
  encodeMatcherCallExt,
  encodeMatcherConfigureBackingFeeCap,
  encodeMatcherConfigureSetParams,
  encodeMatcherSetParams,
  encodeWrapperMatcherCallExt,
  isMatcherCtxV2,
  matcherConfigureOwnerProofAccounts,
  validateMatcherSetParams,
  zeroMatcherV2Config
};
//# sourceMappingURL=matcher-v2.js.map