/**
 * Matcher v2 (P2) client ABI — additive to SDK 8.0.0.
 *
 * Source of truth: `percolator-match` branch `feat/p2-matcher-v2` @ `4a0f696`
 * (draft percolator-match#30): `src/v2.rs` (`CallExt`, `V2Config`, `V2Block`,
 * `validate_config`, `default_config_for_kind2`), `src/vamm.rs`
 * (`process_configure`, `SetParams::{parse,encode}`), `src/lib.rs`
 * (`FLAG_REQUESTED_FEE_*`). Every byte below is pinned by
 * `test/matcher-v2.test.ts` against the hex emitted by that branch's
 * `cargo run --bin sdk_parity_fixtures_v2`.
 *
 * STATUS: targets instructions NOT on the relaunch programs yet. The relaunch set is the
 * P1+P3 wrapper (`07a1d0eb`) + F-9 stake (`d13b5a9`); the matcher stays v1 (`4seJWjv3…` @
 * `12bd671`) unless P2 (percolator-match#30) ships with it. A v1 matcher rejects tag 5
 * (InvalidInstructionData) and any non-zero byte in 43..67 of a tag-0 call — only send
 * tag 5 / the call extension to a v2 matcher (see {@link isMatcherCtxV2}), and keep
 * `AssetRiskLimitsV17.matcher_ext_mode` / `max_requested_fee_bps` at 0 until then.
 *
 * P3 VAULT-OWNED LP: tag 5 can NEVER configure the vault LP's matcher context. Owner-proof
 * (auth 1) needs the LP OWNER to sign, and the vault LP's owner is the LP-vault registry PDA,
 * which nothing can sign for; auth 0 needs the wrapper's delegate PDA. The vault LP's matcher
 * params are set only through wrapper tag 95 (VaultLpSetMatcher, upgrade authority).
 *
 * @module matcher-v2
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { AccountMeta } from "@solana/web3.js";
import { concatBytes, encPubkey, encU8, encU16, encU32, encU64, encU128 } from "./encode.js";
import { MATCHER_RETURN_KNOWN_FLAGS } from "./instructions.js";

// ============================================================================
// Constants
// ============================================================================

/** Matcher instruction tag 5 — Configure (`MATCHER_CONFIGURE_TAG`). */
export const MATCHER_CONFIGURE_TAG = 5;
/** Tag-5 auth mode 0: the ctx's `lp_pda` signs directly (direct, non-wrapper contexts). */
export const MATCHER_CONFIGURE_AUTH_LP_PDA = 0;
/** Tag-5 auth mode 1: owner-proof — the LP owner signs and the matcher re-derives `lp_pda`. */
export const MATCHER_CONFIGURE_AUTH_OWNER_PROOF = 1;
/** Header length for auth mode 0: `[5][0]`. */
export const MATCHER_CONFIGURE_HEADER_LP_PDA_LEN = 2;
/** Header length for auth mode 1: `[5][1][wrapper 32][market 32][lp_portfolio 32][bump]` = 99. */
export const MATCHER_CONFIGURE_HEADER_OWNER_PROOF_LEN = 99;
/** Tag-5 op 0: SetBackingFeeCap, payload `cap u16 LE` (0..=10000). */
export const MATCHER_CONFIGURE_OP_BACKING_FEE_CAP = 0;
/** Tag-5 op 1: SetParams, payload = {@link MATCHER_SET_PARAMS_LEN} bytes. */
export const MATCHER_CONFIGURE_OP_SET_PARAMS = 1;
/** Exact SetParams payload length (`SET_PARAMS_LEN`). `SetParams::parse` rejects any other length. */
export const MATCHER_SET_PARAMS_LEN = 105;
/** Upper bound the matcher enforces on the backing fee cap (`BACKING_FEE_CAP_BPS_MAX`). */
export const MATCHER_BACKING_FEE_CAP_BPS_MAX = 10_000;

/** Matcher kinds (`MatcherKind`). 2 = Adaptive is new in v2. */
export const MATCHER_KIND = { Passive: 0, Vamm: 1, Adaptive: 2 } as const;
/** Union of valid matcher kind bytes. */
export type MatcherKindValue = (typeof MATCHER_KIND)[keyof typeof MATCHER_KIND];

/** Offset of the 24-byte call extension inside a 67-byte tag-0 call (`CALL_EXT_OFFSET`). */
export const MATCHER_CALL_EXT_OFFSET = 43;
/** Length of the call extension (`CALL_EXT_LEN`). */
export const MATCHER_CALL_EXT_LEN = 24;
/** `ext_version` for this layout (`CALL_EXT_VERSION_V1`). 0 = legacy (all 24 bytes zero). */
export const MATCHER_CALL_EXT_VERSION_V1 = 1;
/** Call-extension `ext_flags` bits (`EXT_FLAG_*`). Bits 5..7 must be 0. */
export const MATCHER_CALL_EXT_FLAG = {
  HEADROOM: 1,
  MARK_SLOT: 2,
  ACCEPTS_FEE_REQUEST: 4,
  TAKER_REDUCING: 8,
  EXEC_BAND: 16,
} as const;
const EXT_FLAGS_KNOWN = 0x1f;

/** `FLAG_REQUESTED_FEE_SHIFT`: MatcherReturn `flags` bits 22..31 carry `requested_fee_bps`. */
export const MATCHER_RETURN_FLAG_REQUESTED_FEE_SHIFT = 22;
/** `FLAG_REQUESTED_FEE_MASK` = `0x3ff << 22` (= 4290772992 as u32). */
export const MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK = (0x3ff << 22) >>> 0;
/** `REQUESTED_FEE_BPS_MAX` = 1023. */
export const MATCHER_REQUESTED_FEE_BPS_MAX = 0x3ff;
/**
 * Known flag bits for a v2-aware wrapper (P1/P3) that accepts the fee-request channel.
 * The DEPLOYED v18.2 wrapper does not: it keeps {@link MATCHER_RETURN_KNOWN_FLAGS}.
 */
export const MATCHER_RETURN_KNOWN_FLAGS_V2 = (MATCHER_RETURN_KNOWN_FLAGS | MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK) >>> 0;

/** Ctx offset of the v2 block (`V2_BLOCK_CTX_OFFSET`), relative to byte 64 of the account. */
export const MATCHER_V2_BLOCK_CTX_OFFSET = 178;
/** Absolute account offset of the v2 block marker byte (= 64 + 178). */
export const MATCHER_V2_BLOCK_ACCOUNT_OFFSET = 242;
/** v2 block length (`V2_BLOCK_LEN`). */
export const MATCHER_V2_BLOCK_LEN = 78;
/** v2 block marker value (`V2_BLOCK_VERSION`); 0 on every v1-created context. */
export const MATCHER_V2_BLOCK_VERSION = 1;
/** v2 config flag bit0 `STALE_ALLOW_REDUCING` (`V2_FLAG_STALE_ALLOW_REDUCING`). */
export const MATCHER_V2_FLAG_STALE_ALLOW_REDUCING = 1;

/** Matcher v2 custom error codes (`src/v2.rs`), attributed to the MATCHER program id. */
export const MATCHER_V2_ERRORS: Readonly<Record<number, { name: string; hint: string }>> = Object.freeze({
  8002: { name: "ERR_STALE_MARK", hint: "Matcher refused: the mark behind oracle_price_e6 is older than the ctx's max_mark_age_slots (call-extension mark_slot), or the observed-unchanged-price fallback tripped. Push a fresh mark, then retry. With STALE_ALLOW_REDUCING, reducing fills still pass." },
  8003: { name: "ERR_MARK_SLOT_IN_FUTURE", hint: "Matcher refused: call-extension mark_slot is greater than Clock.slot. The caller built a bad extension." },
  8004: { name: "ERR_ASSET_MISMATCH", hint: "Matcher refused: this kind-2 / observed-staleness context is bound to a different asset. One such context per asset." },
  8005: { name: "ERR_OWNER_PROOF_MISMATCH", hint: "Matcher tag 5 owner proof failed: create_program_address(['matcher', market, lp_portfolio, lp_owner, matcher_program, matcher_ctx, [bump]], wrapper) does not equal ctx.lp_pda. Check wrapper id, market, LP portfolio, signer = LP owner, and bump (deriveMatcherDelegate)." },
  8001: { name: "ERR_INCONSISTENT_LEG_ORACLE_PRICE", hint: "Matcher batch call: legs for the same asset carried different oracle prices." },
});

/**
 * Look up a matcher v2 custom error.
 *
 * @param code  `Custom(code)` returned by the MATCHER program.
 * @returns `{name, hint}` or `undefined` if not a matcher v2 code.
 * @example
 * ```ts
 * decodeMatcherV2Error(8002)?.name; // "ERR_STALE_MARK"
 * ```
 */
export function decodeMatcherV2Error(code: number): { name: string; hint: string } | undefined {
  return MATCHER_V2_ERRORS[code];
}

// ============================================================================
// V2 config (pricing / guard parameters) + SetParams (105 B)
// ============================================================================

/** `V2Config` — the v2 block's configuration fields (state fields are program-owned). */
export interface MatcherV2Config {
  /** bit0 STALE_ALLOW_REDUCING. */
  flags: number;
  feeLoBps: number;
  feeHiBps: number;
  feeColdBps: number;
  volAMilli: number;
  /** 0 disables the quadratic term. */
  volBDen: number;
  /** 1..=10000. */
  volAlphaBps: number;
  /** u8: samples before the estimate replaces fee_cold. */
  volWarmup: number;
  /** u8: per-sample move cap in 10-bps units (>= 1). */
  volMoveCap10bps: number;
  /** >= 1. */
  volRefSlots: number;
  /** <= skewSpreadMultBps. */
  thinRebateMultBps: number;
  /** <= 5000. */
  skewCapBps: number;
  /** <= skewCapBps. */
  rebateCapBps: number;
  /** 0 = off. */
  maxMarkAgeSlots: number;
  /** 0 = off. */
  observedStaleSlots: number;
  /** u64; > 0 if skew or rebate is on. */
  skewRefInventory: bigint;
}

/** SetParams (tag 5 op 1) — full context parameters, 105 bytes on the wire. */
export interface MatcherSetParams {
  kind: MatcherKindValue;
  /** Kinds 0/1 pricing; ignored by kind 2. */
  tradingFeeBps: number;
  baseSpreadBps: number;
  maxTotalBps: number;
  /** Kind 2: 10000 = exact constant-product; <= 100000. */
  impactKBps: number;
  /** u128. Kind 2: virtual CP depth. */
  liquidityNotionalE6: bigint;
  /** u128; u128::MAX is clamped to i128::MAX on-chain. 0 = zero-fill (kinds 1/2: `max_fill_abs == 0` fills nothing). */
  maxFillAbs: bigint;
  /** u128; 0 = UNLIMITED inventory. */
  maxInventoryAbs: bigint;
  feeToInsuranceBps: number;
  /** Kind 2: bps at |inventory| == skewRefInventory. Kinds 0/1: v1 meaning (|inventory_q|·mult/1e4, raw q units). */
  skewSpreadMultBps: number;
  /** Write a v2 block (required for kind 2; optional guard-only block for kinds 0/1). */
  enableV2: boolean;
  /** v2 block config. For kinds 0/1 every pricing field must be 0. */
  v2: MatcherV2Config;
}

const ZERO_V2: MatcherV2Config = Object.freeze({
  flags: 0, feeLoBps: 0, feeHiBps: 0, feeColdBps: 0, volAMilli: 0, volBDen: 0, volAlphaBps: 0,
  volWarmup: 0, volMoveCap10bps: 0, volRefSlots: 0, thinRebateMultBps: 0, skewCapBps: 0,
  rebateCapBps: 0, maxMarkAgeSlots: 0, observedStaleSlots: 0, skewRefInventory: 0n,
});

/**
 * An all-zero v2 config (for `enableV2: false`, or a kinds-0/1 guard-only block
 * after setting `flags` / `maxMarkAgeSlots` / `observedStaleSlots`).
 *
 * @returns A fresh zeroed {@link MatcherV2Config}.
 * @example
 * ```ts
 * const v2 = { ...zeroMatcherV2Config(), maxMarkAgeSlots: 150, flags: MATCHER_V2_FLAG_STALE_ALLOW_REDUCING };
 * ```
 */
export function zeroMatcherV2Config(): MatcherV2Config {
  return { ...ZERO_V2 };
}

const U16_MAX = 0xffff;
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const DEFAULTS = {
  feeLo: 10, feeHi: 80, feeCold: 10, volAMilli: 1000, volBDen: 100, volAlpha: 1000, volWarmup: 8,
  volMoveCap10bps: 100, volRefSlots: 25, skewCap: 100, maxMarkAge: 150, observedStale: 0,
  flags: MATCHER_V2_FLAG_STALE_ALLOW_REDUCING, maxFeeBps: 1000, maxSkewCapBps: 5000,
} as const;
/** `MAX_IMPACT_K_BPS`. */
export const MATCHER_V2_MAX_IMPACT_K_BPS = 100_000;

/**
 * Port of `v2::default_config_for_kind2` — the conservative defaults a kind-2
 * context gets when created through the fixed tag-2 payload (wrapper tag 83).
 *
 * @param tradingFeeBps     Context trading_fee_bps (seeds fee_lo, floored at 10).
 * @param baseSpreadBps     Context base_spread_bps.
 * @param maxTotalBps       Context max_total_bps (fee_hi <= max_total − base).
 * @param skewSpreadMultBps Context skew slope (rebate slope = half of it).
 * @param maxInventoryAbs   Context max_inventory_abs (becomes skew_ref_inventory; 0 → u64::MAX).
 * @returns The derived {@link MatcherV2Config}.
 * @example
 * ```ts
 * const cfg = defaultMatcherV2ConfigForKind2(10, 50, 200, 50, 4000n); // == the P2 fixture
 * ```
 */
export function defaultMatcherV2ConfigForKind2(
  tradingFeeBps: number,
  baseSpreadBps: number,
  maxTotalBps: number,
  skewSpreadMultBps: number,
  maxInventoryAbs: bigint,
): MatcherV2Config {
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
    skewRefInventory: skewRef,
  };
}

function checkRange(name: string, v: number, max: number): void {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${name} must be an integer in 0..=${max}, got ${v}`);
}
function checkBig(name: string, v: bigint, max: bigint): void {
  if (v < 0n || v > max) throw new Error(`${name} must be in 0..=${max}, got ${v}`);
}

/**
 * Client-side mirror of `v2::validate_config` + the ctx `validate()` bounds that
 * SetParams must satisfy. Throws with the first violated rule (the program
 * would fail with InvalidAccountData / InvalidInstructionData).
 *
 * @param p  SetParams to check.
 * @returns void — throws on the first violation.
 * @example
 * ```ts
 * validateMatcherSetParams(params); // throws if the matcher would reject them
 * ```
 */
export function validateMatcherSetParams(p: MatcherSetParams): void {
  if (p.kind !== 0 && p.kind !== 1 && p.kind !== 2) throw new Error(`kind must be 0|1|2, got ${String(p.kind)}`);
  checkRange("tradingFeeBps", p.tradingFeeBps, 1000);
  checkRange("maxTotalBps", p.maxTotalBps, 9000);
  checkRange("baseSpreadBps", p.baseSpreadBps, 0xffffffff);
  checkRange("impactKBps", p.impactKBps, 0xffffffff);
  if (p.baseSpreadBps + p.tradingFeeBps > p.maxTotalBps) throw new Error("baseSpreadBps + tradingFeeBps must be <= maxTotalBps");
  checkBig("liquidityNotionalE6", p.liquidityNotionalE6, U128_MAX);
  checkBig("maxFillAbs", p.maxFillAbs, U128_MAX);
  checkBig("maxInventoryAbs", p.maxInventoryAbs, U128_MAX); // clamped to i128::MAX on-chain
  checkRange("feeToInsuranceBps", p.feeToInsuranceBps, 10_000);
  checkRange("skewSpreadMultBps", p.skewSpreadMultBps, 10_000);
  if (p.kind === 1 && p.liquidityNotionalE6 === 0n) throw new Error("kind 1 (vAMM) requires liquidityNotionalE6 > 0");
  const c = p.v2;
  for (const [k, v] of [["feeLoBps", c.feeLoBps], ["feeHiBps", c.feeHiBps], ["feeColdBps", c.feeColdBps], ["volAMilli", c.volAMilli],
    ["volBDen", c.volBDen], ["volAlphaBps", c.volAlphaBps], ["volRefSlots", c.volRefSlots], ["thinRebateMultBps", c.thinRebateMultBps],
    ["skewCapBps", c.skewCapBps], ["rebateCapBps", c.rebateCapBps], ["maxMarkAgeSlots", c.maxMarkAgeSlots],
    ["observedStaleSlots", c.observedStaleSlots]] as const) checkRange(`v2.${k}`, v, U16_MAX);
  checkRange("v2.flags", c.flags, 0xff);
  checkRange("v2.volWarmup", c.volWarmup, 0xff);
  checkRange("v2.volMoveCap10bps", c.volMoveCap10bps, 0xff);
  checkBig("v2.skewRefInventory", c.skewRefInventory, U64_MAX);
  if (!p.enableV2) {
    if (p.kind === 2) throw new Error("kind 2 requires enableV2");
    return;
  }
  if ((c.flags & ~MATCHER_V2_FLAG_STALE_ALLOW_REDUCING) !== 0) throw new Error("v2.flags: unknown bits");
  if (p.kind !== 2) {
    const pricingZero = c.feeLoBps === 0 && c.feeHiBps === 0 && c.feeColdBps === 0 && c.volAMilli === 0 && c.volBDen === 0 &&
      c.volAlphaBps === 0 && c.volWarmup === 0 && c.volMoveCap10bps === 0 && c.volRefSlots === 0 && c.thinRebateMultBps === 0 &&
      c.skewCapBps === 0 && c.rebateCapBps === 0 && c.skewRefInventory === 0n;
    if (!pricingZero) throw new Error("kinds 0/1: every v2 pricing field must be 0 (only flags/maxMarkAgeSlots/observedStaleSlots allowed)");
    return;
  }
  if (!(c.feeLoBps <= c.feeColdBps && c.feeColdBps <= c.feeHiBps)) throw new Error("v2: need feeLo <= feeCold <= feeHi");
  if (c.feeHiBps > DEFAULTS.maxFeeBps) throw new Error("v2.feeHiBps must be <= 1000");
  if (p.baseSpreadBps + c.feeHiBps > p.maxTotalBps) throw new Error("v2: baseSpreadBps + feeHiBps must be <= maxTotalBps");
  if (c.volAlphaBps === 0 || c.volAlphaBps > 10_000) throw new Error("v2.volAlphaBps must be 1..=10000");
  if (c.volRefSlots === 0 || c.volMoveCap10bps === 0) throw new Error("v2.volRefSlots and v2.volMoveCap10bps must be >= 1");
  if (c.skewCapBps > DEFAULTS.maxSkewCapBps || c.rebateCapBps > c.skewCapBps) throw new Error("v2: need rebateCap <= skewCap <= 5000");
  if (c.thinRebateMultBps > p.skewSpreadMultBps) throw new Error("v2.thinRebateMultBps must be <= skewSpreadMultBps (round-trip safety)");
  if ((p.skewSpreadMultBps > 0 || c.thinRebateMultBps > 0) && c.skewRefInventory === 0n) throw new Error("v2.skewRefInventory must be > 0 when skew or rebate is on");
  if (p.impactKBps > MATCHER_V2_MAX_IMPACT_K_BPS || (p.impactKBps > 0 && p.liquidityNotionalE6 === 0n)) {
    throw new Error("impactKBps must be <= 100000, and > 0 requires liquidityNotionalE6 > 0");
  }
}

/**
 * Encode SetParams (tag 5 op 1 payload), byte-identical to `SetParams::encode`.
 * Validates first ({@link validateMatcherSetParams}).
 *
 * Layout: kind u8 @0, trading_fee u32 @1, base_spread u32 @5, max_total u32 @9,
 * impact_k u32 @13, liquidity u128 @17, max_fill u128 @33, max_inventory u128 @49,
 * fee_to_insurance u16 @65, skew_mult u16 @67, enable_v2 u8 @69, v2 flags u8 @70,
 * fee_lo/hi/cold/vol_a/vol_b/vol_alpha u16 @71..83, vol_warmup u8 @83,
 * vol_move_cap u8 @84, vol_ref/thin_rebate/skew_cap/rebate_cap/max_mark_age/observed_stale u16 @85..97,
 * skew_ref_inventory u64 @97 → 105 bytes.
 *
 * @param p  Parameters.
 * @returns 105-byte payload.
 * @example
 * ```ts
 * const payload = encodeMatcherSetParams({ kind: 2, ..., enableV2: true, v2: defaultMatcherV2ConfigForKind2(10, 50, 200, 50, 4000n) });
 * ```
 */
export function encodeMatcherSetParams(p: MatcherSetParams): Uint8Array {
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

// ============================================================================
// Tag 5 Configure
// ============================================================================

/** Owner-proof fields for tag 5 auth mode 1. */
export interface MatcherOwnerProof {
  /** Wrapper program that derived `ctx.lp_pda` (devnet ETDLAdi…). */
  wrapperProgramId: PublicKey;
  market: PublicKey;
  lpPortfolio: PublicKey;
  /** Bump of the matcher-delegate PDA ({@link deriveMatcherDelegate} returns it). */
  bump: number;
}

function ownerProofHeader(proof: MatcherOwnerProof): Uint8Array {
  checkRange("bump", proof.bump, 255);
  return concatBytes(
    encU8(MATCHER_CONFIGURE_TAG), encU8(MATCHER_CONFIGURE_AUTH_OWNER_PROOF),
    encPubkey(proof.wrapperProgramId), encPubkey(proof.market), encPubkey(proof.lpPortfolio), encU8(proof.bump),
  );
}

/**
 * Tag 5 / auth 1 (owner proof) / op 0 SetBackingFeeCap. Wire:
 * `[5, 1, wrapper(32), market(32), lp_portfolio(32), bump, 0, cap u16 LE]` = 102 bytes.
 * Replaces the unreachable tag 4 (it needed a wrapper-delegate signature).
 *
 * @param proof   Owner-proof fields.
 * @param capBps  Backing fee cap, 0..=10000.
 * @returns 102-byte instruction data.
 * @example
 * ```ts
 * const data = encodeMatcherConfigureBackingFeeCap({ wrapperProgramId, market, lpPortfolio, bump }, 10_000);
 * ```
 */
export function encodeMatcherConfigureBackingFeeCap(proof: MatcherOwnerProof, capBps: number): Uint8Array {
  checkRange("capBps", capBps, MATCHER_BACKING_FEE_CAP_BPS_MAX);
  return concatBytes(ownerProofHeader(proof), encU8(MATCHER_CONFIGURE_OP_BACKING_FEE_CAP), encU16(capBps));
}

/**
 * Tag 5 / auth 1 (owner proof) / op 1 SetParams. Wire: 99-byte header + op(1) + 105 = 205 bytes.
 *
 * @param proof   Owner-proof fields.
 * @param params  SetParams (validated).
 * @returns 205-byte instruction data.
 * @example
 * ```ts
 * const data = encodeMatcherConfigureSetParams(proof, params);
 * ```
 */
export function encodeMatcherConfigureSetParams(proof: MatcherOwnerProof, params: MatcherSetParams): Uint8Array {
  return concatBytes(ownerProofHeader(proof), encU8(MATCHER_CONFIGURE_OP_SET_PARAMS), encodeMatcherSetParams(params));
}

/**
 * Account metas for tag 5 with owner proof: `[lp_owner (signer), matcher_ctx (writable)]`.
 *
 * @param lpOwner     LP portfolio owner (signs).
 * @param matcherCtx  Matcher context account.
 * @returns Two account metas in program order.
 * @example
 * ```ts
 * const keys = matcherConfigureOwnerProofAccounts(lpOwner, matcherCtx);
 * ```
 */
export function matcherConfigureOwnerProofAccounts(lpOwner: PublicKey, matcherCtx: PublicKey): AccountMeta[] {
  return [
    { pubkey: lpOwner, isSigner: true, isWritable: false },
    { pubkey: matcherCtx, isSigner: false, isWritable: true },
  ];
}

/** Inputs to build a tag-5 owner-proof instruction; the bump is derived. */
export interface MatcherConfigureIxArgs {
  matcherProgramId: PublicKey;
  wrapperProgramId: PublicKey;
  market: PublicKey;
  lpPortfolio: PublicKey;
  lpOwner: PublicKey;
  matcherCtx: PublicKey;
}

function deriveProof(a: MatcherConfigureIxArgs): MatcherOwnerProof {
  const [, bump] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("matcher"), a.market.toBytes(), a.lpPortfolio.toBytes(), a.lpOwner.toBytes(),
      a.matcherProgramId.toBytes(), a.matcherCtx.toBytes()],
    a.wrapperProgramId,
  );
  return { wrapperProgramId: a.wrapperProgramId, market: a.market, lpPortfolio: a.lpPortfolio, bump };
}

/**
 * Build the tag-5 SetBackingFeeCap instruction (owner proof; bump derived exactly as
 * the wrapper's matcher-delegate PDA). Send AFTER InitMatcherCtx (wrapper tag 83),
 * signed by the LP owner. Requires the matcher program to be upgraded to v2.
 *
 * @param a       Program ids + market/LP/ctx accounts.
 * @param capBps  0..=10000.
 * @returns TransactionInstruction for the matcher program.
 * @example
 * ```ts
 * const ix = buildMatcherConfigureBackingFeeCapIx({ matcherProgramId, wrapperProgramId, market, lpPortfolio, lpOwner, matcherCtx }, 10_000);
 * ```
 */
export function buildMatcherConfigureBackingFeeCapIx(a: MatcherConfigureIxArgs, capBps: number): TransactionInstruction {
  return new TransactionInstruction({
    programId: a.matcherProgramId,
    keys: matcherConfigureOwnerProofAccounts(a.lpOwner, a.matcherCtx),
    data: Buffer.from(encodeMatcherConfigureBackingFeeCap(deriveProof(a), capBps)),
  });
}

/**
 * Build the tag-5 SetParams instruction (owner proof). Requires the matcher v2 program.
 *
 * @param a       Program ids + market/LP/ctx accounts.
 * @param params  SetParams (validated client-side).
 * @returns TransactionInstruction for the matcher program.
 * @example
 * ```ts
 * const ix = buildMatcherConfigureSetParamsIx(args, { kind: 2, ..., enableV2: true, v2 });
 * ```
 */
export function buildMatcherConfigureSetParamsIx(a: MatcherConfigureIxArgs, params: MatcherSetParams): TransactionInstruction {
  return new TransactionInstruction({
    programId: a.matcherProgramId,
    keys: matcherConfigureOwnerProofAccounts(a.lpOwner, a.matcherCtx),
    data: Buffer.from(encodeMatcherConfigureSetParams(deriveProof(a), params)),
  });
}

// ============================================================================
// Call extension (tag-0 bytes 43..67; one per leg after all legs in tag 3)
// ============================================================================

/** Decoded / to-encode call extension. Omitted optional fields = flag clear, bytes 0. */
export interface MatcherCallExt {
  /** HEADROOM: max |exec_size| (q) the wrapper accepts in this direction; u64::MAX = unbounded; 0 = zero-fill. */
  headroomQ?: bigint;
  /** MARK_SLOT: slot of the last fresh oracle observation behind oracle_price_e6. */
  markSlot?: bigint;
  /** ACCEPTS_FEE_REQUEST: the caller will read return bits 22..31. */
  acceptsFeeRequest: boolean;
  /** TAKER_REDUCING: the request only reduces the taker's position. */
  takerReducing: boolean;
  /** EXEC_BAND: the wrapper's oracle band on exec_price, bps (u16). */
  execBandBps?: number;
}

/**
 * Encode the 24-byte v1 call extension (`CallExt::encode`).
 *
 * @param ext  Extension fields.
 * @returns 24 bytes: ver, flags, exec_band u16, mark_slot u64, headroom u64, reserved u32.
 * @example
 * ```ts
 * const ext = encodeMatcherCallExt({ headroomQ: 1000n, markSlot: slot, acceptsFeeRequest: false, takerReducing: false });
 * ```
 */
export function encodeMatcherCallExt(ext: MatcherCallExt): Uint8Array {
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

/**
 * Decode a 24-byte call extension with the matcher's own validation rules.
 * Returns `null` for the legacy all-zero block (ext_version 0).
 *
 * @param bytes   The 24 bytes (or a full 67-byte tag-0 call, sliced at 43).
 * @returns Decoded extension, or null for legacy.
 * @throws If version is unknown, reserved/unknown flag bits are set, or a field is non-zero without its flag.
 * @example
 * ```ts
 * const ext = decodeMatcherCallExt(call.subarray(43, 67));
 * ```
 */
export function decodeMatcherCallExt(bytes: Uint8Array): MatcherCallExt | null {
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

// ============================================================================
// Return flags bits 22..31 + ctx v2 marker
// ============================================================================

/**
 * Extract `requested_fee_bps` (0..=1023) from a MatcherReturn `flags` word.
 * Non-zero only when the call set ACCEPTS_FEE_REQUEST and the fill was non-zero.
 *
 * @param flags  MatcherReturn.flags (u32).
 * @returns requested fee in bps.
 * @example
 * ```ts
 * const fee = decodeMatcherRequestedFeeBps(ret.flags);
 * ```
 */
export function decodeMatcherRequestedFeeBps(flags: number): number {
  return ((flags >>> 0) & MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK) >>> MATCHER_RETURN_FLAG_REQUESTED_FEE_SHIFT;
}

/**
 * True if a matcher context account carries the v2 block marker
 * (`ctx[64..72] == "PERCMATC"` and `ctx[242] == 1`) — the doc's rule for when a
 * wrapper/client may send `ext_version = 1`.
 *
 * @param ctxAccountData  Raw matcher context account bytes (>= 320).
 * @returns Whether the ctx has an active v2 block.
 * @example
 * ```ts
 * if (isMatcherCtxV2(info.data)) sendExt = true;
 * ```
 */
export function isMatcherCtxV2(ctxAccountData: Uint8Array): boolean {
  if (ctxAccountData.length < MATCHER_V2_BLOCK_ACCOUNT_OFFSET + 1) return false;
  const magic = new DataView(ctxAccountData.buffer, ctxAccountData.byteOffset + 64, 8).getBigUint64(0, true);
  return magic === 0x504552434d415443n && ctxAccountData[MATCHER_V2_BLOCK_ACCOUNT_OFFSET] === MATCHER_V2_BLOCK_VERSION;
}
