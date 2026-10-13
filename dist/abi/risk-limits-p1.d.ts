import type { LayoutTable } from "./layout.js";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { AccountSpec } from "./accounts.js";
/** P1 tag table. */
export declare const IX_TAG_P1: Readonly<{
    readonly SetAssetRiskLimits: 93;
}>;
/** `risk_limits_v17::MAX_EXEC_BAND_BPS`. */
export declare const MAX_EXEC_BAND_BPS_P1 = 10000;
/** `risk_limits_v17::MAX_LP_EXPOSURE_K_BPS`. */
export declare const MAX_LP_EXPOSURE_K_BPS_P1 = 10000000;
/** Engine `MAX_OI_SIDE_Q`. */
export declare const MAX_OI_SIDE_Q_P1 = 100000000000000n;
/** `state::MATCHER_EXT_MODE_V1` (the only non-zero mode). */
export declare const MATCHER_EXT_MODE_V1_P1 = 1;
/** `risk_limits_v17::MAX_REQUESTED_FEE_BPS`. */
export declare const MAX_REQUESTED_FEE_BPS_P1 = 1023;
/** Tag 93 fields. Every 0 means "use the protocol default" (see the record docs). */
export interface SetAssetRiskLimitsArgsP1 {
    assetIndex: number;
    /** Execution-price band (bps); 0 = default. <= 10000. */
    execBandBps: number;
    /** LP exposure multiplier k (bps of equity); 0 = 1e8 / initial_margin_bps. <= 1e7. */
    lpExposureKBps: number;
    /** Auto-halt floor on the matcher LP's IM equity (atoms); 0 = halt only a depleted LP. */
    lpFloorAtoms: bigint;
    /** Max effective OI per side (Q); 0 = engine MAX_OI_SIDE_Q. <= 1e14. */
    sideOiCapQ: bigint;
    /** 0 = legacy call bytes; 1 = send the P2 ext block. Optional wire tail. Default 0. */
    matcherExtMode?: number;
    /**
     * P2 fee-request channel cap (bps); 0 = channel OFF. Optional wire tail. Default 0.
     * Keep 0 on the relaunch until the frontend ships with LIMITS_P2=1 and the matcher is v2 —
     * a non-zero value makes every trade with a non-zero quote fail for older app builds.
     */
    maxRequestedFeeBps?: number;
}
/**
 * Encode tag 93 exactly like the wrapper's own encoder: 41 bytes, then the optional tail —
 * `matcher_ext_mode` (u8) if either tail field is non-zero, then `max_requested_fee_bps`
 * (u16) if it is non-zero. The decoder reads a missing tail as 0.
 *
 * @param a  Fields (validated against the handler's bounds).
 * @returns 41, 42 or 44 bytes.
 * @example
 * ```ts
 * const data = encodeSetAssetRiskLimitsP1({ assetIndex: 0, execBandBps: 300, lpExposureKBps: 50_000,
 *   lpFloorAtoms: 250_000_000n, sideOiCapQ: 7_000_000_000n });
 * ```
 */
export declare function encodeSetAssetRiskLimitsP1(a: SetAssetRiskLimitsArgsP1): Uint8Array;
/** Tag 93 accounts: `[upgrade_authority (s), ProgramData, market (w)]`. */
export declare const ACCOUNTS_SET_ASSET_RISK_LIMITS_P1: readonly AccountSpec[];
/**
 * Build tag 93 (upgrade-authority gated; ProgramData derived from the wrapper id).
 *
 * @param programId         Wrapper program id.
 * @param market            Market account.
 * @param upgradeAuthority  The wrapper's upgrade authority (signer).
 * @param args              Fields.
 * @returns TransactionInstruction.
 * @example
 * ```ts
 * const ix = buildSetAssetRiskLimitsIxP1(WRAPPER, market, upgradeAuthority, { assetIndex: 0, ... });
 * ```
 */
export declare function buildSetAssetRiskLimitsIxP1(programId: PublicKey, market: PublicKey, upgradeAuthority: PublicKey, args: SetAssetRiskLimitsArgsP1): TransactionInstruction;
/** Field offsets inside the 64-byte record (rustc layout of `state::AssetRiskLimitsV17`). */
export declare const ASSET_RISK_LIMITS_FIELD_OFF_P1: Readonly<{
    readonly sideOiCapQ: 0;
    readonly lpFloorAtoms: 16;
    readonly lpExposureKBps: 32;
    readonly execBandBps: 36;
    readonly matcherExtMode: 38;
    readonly reserved0: 39;
    readonly maxRequestedFeeBps: 40;
    readonly reserved: 42;
}>;
/** `ASSET_RISK_LIMITS_LEN`. */
export declare const ASSET_RISK_LIMITS_LEN_P1 = 64;
/** `ASSET_RISK_LIMITS_OFF` inside each asset's 1024-byte wrapper slot. */
export declare const ASSET_RISK_LIMITS_SLOT_OFF_P1 = 608;
/**
 * Account offset of asset `i`'s record: 592 + 758 + 2325·i + 608 = 1958 + 2325·i.
 * @param assetIndex  Asset slot.
 * @param layout      Layout table of the account's VERSION (default LAYOUT_V21; LAYOUT_V22 for v2.2).
 * @returns Byte offset.
 * @example
 * ```ts
 * assetRiskLimitsAccountOffsetP1(0); // 1958
 * ```
 */
export declare function assetRiskLimitsAccountOffsetP1(assetIndex: number, layout?: LayoutTable): number;
/** Decoded `AssetRiskLimitsV17` (raw stored values; 0 = protocol default). */
export interface AssetRiskLimitsP1 {
    sideOiCapQ: bigint;
    lpFloorAtoms: bigint;
    lpExposureKBps: number;
    execBandBps: number;
    matcherExtMode: number;
    /** 0 = fee-request channel OFF (required at relaunch). */
    maxRequestedFeeBps: number;
}
/**
 * Decode one 64-byte `AssetRiskLimitsV17` record.
 * @param rec  The 64 bytes.
 * @returns Decoded limits.
 * @example
 * ```ts
 * decodeAssetRiskLimitsRecordP1(bytes).maxRequestedFeeBps;
 * ```
 */
export declare function decodeAssetRiskLimitsRecordP1(rec: Uint8Array): AssetRiskLimitsP1;
/**
 * Decode asset `i`'s `AssetRiskLimitsV17` from a raw market account (kind 1).
 * @param marketData  Raw market bytes.
 * @param assetIndex  Asset slot.
 * @returns Decoded limits.
 * @example
 * ```ts
 * if (decodeAssetRiskLimitsP1(info.data, 0).maxRequestedFeeBps !== 0) throw new Error("fee channel must be off");
 * ```
 */
export declare function decodeAssetRiskLimitsP1(marketData: Uint8Array, assetIndex: number): AssetRiskLimitsP1;
