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
 * P1+P3 wrapper (`58e379f1`) + F-9 stake (`d13b5a9`); the matcher stays v1 (`4seJWjv3…` @
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
/** Matcher instruction tag 5 — Configure (`MATCHER_CONFIGURE_TAG`). */
export declare const MATCHER_CONFIGURE_TAG = 5;
/** Tag-5 auth mode 0: the ctx's `lp_pda` signs directly (direct, non-wrapper contexts). */
export declare const MATCHER_CONFIGURE_AUTH_LP_PDA = 0;
/** Tag-5 auth mode 1: owner-proof — the LP owner signs and the matcher re-derives `lp_pda`. */
export declare const MATCHER_CONFIGURE_AUTH_OWNER_PROOF = 1;
/** Header length for auth mode 0: `[5][0]`. */
export declare const MATCHER_CONFIGURE_HEADER_LP_PDA_LEN = 2;
/** Header length for auth mode 1: `[5][1][wrapper 32][market 32][lp_portfolio 32][bump]` = 99. */
export declare const MATCHER_CONFIGURE_HEADER_OWNER_PROOF_LEN = 99;
/** Tag-5 op 0: SetBackingFeeCap, payload `cap u16 LE` (0..=10000). */
export declare const MATCHER_CONFIGURE_OP_BACKING_FEE_CAP = 0;
/** Tag-5 op 1: SetParams, payload = {@link MATCHER_SET_PARAMS_LEN} bytes. */
export declare const MATCHER_CONFIGURE_OP_SET_PARAMS = 1;
/** Exact SetParams payload length (`SET_PARAMS_LEN`). `SetParams::parse` rejects any other length. */
export declare const MATCHER_SET_PARAMS_LEN = 105;
/** Upper bound the matcher enforces on the backing fee cap (`BACKING_FEE_CAP_BPS_MAX`). */
export declare const MATCHER_BACKING_FEE_CAP_BPS_MAX = 10000;
/** Matcher kinds (`MatcherKind`). 2 = Adaptive is new in v2. */
export declare const MATCHER_KIND: {
    readonly Passive: 0;
    readonly Vamm: 1;
    readonly Adaptive: 2;
};
/** Union of valid matcher kind bytes. */
export type MatcherKindValue = (typeof MATCHER_KIND)[keyof typeof MATCHER_KIND];
/** Offset of the 24-byte call extension inside a 67-byte tag-0 call (`CALL_EXT_OFFSET`). */
export declare const MATCHER_CALL_EXT_OFFSET = 43;
/** Length of the call extension (`CALL_EXT_LEN`). */
export declare const MATCHER_CALL_EXT_LEN = 24;
/** `ext_version` for this layout (`CALL_EXT_VERSION_V1`). 0 = legacy (all 24 bytes zero). */
export declare const MATCHER_CALL_EXT_VERSION_V1 = 1;
/** Call-extension `ext_flags` bits (`EXT_FLAG_*`). Bits 5..7 must be 0. */
export declare const MATCHER_CALL_EXT_FLAG: {
    readonly HEADROOM: 1;
    readonly MARK_SLOT: 2;
    readonly ACCEPTS_FEE_REQUEST: 4;
    readonly TAKER_REDUCING: 8;
    readonly EXEC_BAND: 16;
};
/** `FLAG_REQUESTED_FEE_SHIFT`: MatcherReturn `flags` bits 22..31 carry `requested_fee_bps`. */
export declare const MATCHER_RETURN_FLAG_REQUESTED_FEE_SHIFT = 22;
/** `FLAG_REQUESTED_FEE_MASK` = `0x3ff << 22` (= 4290772992 as u32). */
export declare const MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK: number;
/** `REQUESTED_FEE_BPS_MAX` = 1023. */
export declare const MATCHER_REQUESTED_FEE_BPS_MAX = 1023;
/**
 * Known flag bits for a v2-aware wrapper (P1/P3) that accepts the fee-request channel.
 * The DEPLOYED v18.2 wrapper does not: it keeps {@link MATCHER_RETURN_KNOWN_FLAGS}.
 */
export declare const MATCHER_RETURN_KNOWN_FLAGS_V2: number;
/** Ctx offset of the v2 block (`V2_BLOCK_CTX_OFFSET`), relative to byte 64 of the account. */
export declare const MATCHER_V2_BLOCK_CTX_OFFSET = 178;
/** Absolute account offset of the v2 block marker byte (= 64 + 178). */
export declare const MATCHER_V2_BLOCK_ACCOUNT_OFFSET = 242;
/** v2 block length (`V2_BLOCK_LEN`). */
export declare const MATCHER_V2_BLOCK_LEN = 78;
/** v2 block marker value (`V2_BLOCK_VERSION`); 0 on every v1-created context. */
export declare const MATCHER_V2_BLOCK_VERSION = 1;
/** v2 config flag bit0 `STALE_ALLOW_REDUCING` (`V2_FLAG_STALE_ALLOW_REDUCING`). */
export declare const MATCHER_V2_FLAG_STALE_ALLOW_REDUCING = 1;
/** Matcher v2 custom error codes (`src/v2.rs`), attributed to the MATCHER program id. */
export declare const MATCHER_V2_ERRORS: Readonly<Record<number, {
    name: string;
    hint: string;
}>>;
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
export declare function decodeMatcherV2Error(code: number): {
    name: string;
    hint: string;
} | undefined;
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
export declare function zeroMatcherV2Config(): MatcherV2Config;
/** `MAX_IMPACT_K_BPS`. */
export declare const MATCHER_V2_MAX_IMPACT_K_BPS = 100000;
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
export declare function defaultMatcherV2ConfigForKind2(tradingFeeBps: number, baseSpreadBps: number, maxTotalBps: number, skewSpreadMultBps: number, maxInventoryAbs: bigint): MatcherV2Config;
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
export declare function validateMatcherSetParams(p: MatcherSetParams): void;
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
export declare function encodeMatcherSetParams(p: MatcherSetParams): Uint8Array;
/** Owner-proof fields for tag 5 auth mode 1. */
export interface MatcherOwnerProof {
    /** Wrapper program that derived `ctx.lp_pda` (devnet v2.1 5NGgnU2j…; v1 close-only ETDLAdi…). */
    wrapperProgramId: PublicKey;
    market: PublicKey;
    lpPortfolio: PublicKey;
    /** Bump of the matcher-delegate PDA ({@link deriveMatcherDelegate} returns it). */
    bump: number;
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
export declare function encodeMatcherConfigureBackingFeeCap(proof: MatcherOwnerProof, capBps: number): Uint8Array;
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
export declare function encodeMatcherConfigureSetParams(proof: MatcherOwnerProof, params: MatcherSetParams): Uint8Array;
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
export declare function matcherConfigureOwnerProofAccounts(lpOwner: PublicKey, matcherCtx: PublicKey): AccountMeta[];
/** Inputs to build a tag-5 owner-proof instruction; the bump is derived. */
export interface MatcherConfigureIxArgs {
    matcherProgramId: PublicKey;
    wrapperProgramId: PublicKey;
    market: PublicKey;
    lpPortfolio: PublicKey;
    lpOwner: PublicKey;
    matcherCtx: PublicKey;
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
export declare function buildMatcherConfigureBackingFeeCapIx(a: MatcherConfigureIxArgs, capBps: number): TransactionInstruction;
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
export declare function buildMatcherConfigureSetParamsIx(a: MatcherConfigureIxArgs, params: MatcherSetParams): TransactionInstruction;
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
export declare function encodeMatcherCallExt(ext: MatcherCallExt): Uint8Array;
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
export declare function decodeMatcherCallExt(bytes: Uint8Array): MatcherCallExt | null;
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
export declare function decodeMatcherRequestedFeeBps(flags: number): number;
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
export declare function isMatcherCtxV2(ctxAccountData: Uint8Array): boolean;
/** Matcher tag-3 header length: `[3][n u8][req_id u64][lp_account_id u64]` (`MATCHER_BATCH_HEADER_LEN`). */
export declare const MATCHER_BATCH_HEADER_LEN = 18;
/** Per-leg length: `asset u16, oracle_price_e6 u64, req_size i128` (`MATCHER_BATCH_LEG_LEN`). */
export declare const MATCHER_BATCH_LEG_LEN = 26;
/** Legs per wrapper BatchTradeCpi (`MATCHER_BATCH_MAX_LEGS` in the wrapper; the P2 matcher itself allows 16). */
export declare const WRAPPER_BATCH_MAX_LEGS = 11;
/**
 * Port of the wrapper's `risk_limits_v17::encode_matcher_call_ext` (P1+P3 FINAL `58e379f1`) — the
 * exact 24 bytes the wrapper appends per leg (TradeCpi and, since F-10, BatchTradeCpi). Mode 0 →
 * all zero (legacy). Mode 1 → version 1, flags HEADROOM|MARK_SLOT|EXEC_BAND (+TAKER_REDUCING,
 * +ACCEPTS_FEE_REQUEST), headroom saturated to u64::MAX.
 *
 * @param mode               `AssetRiskLimitsV17.matcher_ext_mode` (0 or 1).
 * @param markSlot           The asset's `last_good_oracle_slot`.
 * @param lpHeadroomQ        Headroom in Q (the batch route passes |leg.size_q|).
 * @param execBandBps        Effective exec band (bps).
 * @param takerReducing      Leg only reduces the taker.
 * @param acceptsFeeRequest  Fee-request channel (the wrapper passes false in batches).
 * @returns 24 bytes.
 * @example
 * ```ts
 * encodeWrapperMatcherCallExt(1, 505_000_000n, 1_000_000n, 300, false, false);
 * ```
 */
export declare function encodeWrapperMatcherCallExt(mode: number, markSlot: bigint, lpHeadroomQ: bigint, execBandBps: number, takerReducing: boolean, acceptsFeeRequest: boolean): Uint8Array;
/** One matcher batch leg. */
export interface MatcherBatchLeg {
    assetIndex: number;
    oraclePriceE6: bigint;
    /** Signed request size (i128). */
    reqSize: bigint;
}
/**
 * Encode the matcher tag-3 batch call exactly as the wrapper's `invoke_matcher_batch` builds it:
 * `[3][n][req_id u64][lp_account_id u64]` + n×(asset u16, oracle_price_e6 u64, req_size i128) +
 * (optional) n×24-byte call extensions, in leg order — `18 + 26n` legacy or `18 + 26n + 24n`,
 * the only two lengths the P2 matcher's `process_batch_call` accepts. For a TS reference matcher /
 * simulator; clients send the wrapper BatchTradeCpi ({@link encodeBatchTradeCpi}), not this.
 *
 * @param reqId        Request id.
 * @param lpAccountId  First 8 bytes of the matcher delegate PDA, LE (`matcher_lp_account_id`).
 * @param legs         1..=16 legs (the wrapper sends at most 11).
 * @param exts         Optional per-leg 24-byte extensions (must match `legs.length`).
 * @returns Instruction data for the matcher program.
 * @example
 * ```ts
 * encodeMatcherBatchCall(7n, lpId, [{ assetIndex: 0, oraclePriceE6: 1_000_000n, reqSize: 5n }], [encodeWrapperMatcherCallExt(1, slot, 5n, 300, false, false)]);
 * ```
 */
export declare function encodeMatcherBatchCall(reqId: bigint, lpAccountId: bigint, legs: MatcherBatchLeg[], exts?: Uint8Array[]): Uint8Array;
