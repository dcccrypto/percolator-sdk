/**
 * P2b bounded lock exits — wrapper tags 104 `AdlWindDown` / 105 `SetAdlWindDownMaxSlots`,
 * the ADL episode record, the attributed bankruptcy h-lock byte, and lock codes 120..122.
 *
 * Source: percolator-prog `feat/p2b-lock-exits-wrapper` (PR #525) on engine
 * `feat/p2b-lock-exits` (percolator PR #276). DRAFT: do not publish before those deploy.
 *
 * @module p2b-lock-exits
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { AccountSpec } from "./accounts.js";
/** P2b tag table. 103 is VaultLpAllocate (Earn allocation), not P2b. */
export declare const IX_TAG_P2B: Readonly<{
    readonly AdlWindDown: 104;
    readonly SetAdlWindDownMaxSlots: 105;
}>;
/** `state::ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS` (~1 h). Stored 0 means this. */
export declare const ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS = 9000;
/** `state::ADL_WIND_DOWN_MAX_MARK_AGE_SLOTS`: a pushed mark older than this cannot anchor tag 104. */
export declare const ADL_WIND_DOWN_MAX_MARK_AGE_SLOTS = 150;
/** The dust bound: one whole unit of the market's collateral (10^decimals atoms). */
export declare function adlWindDownDustNotionalAtoms(collateralDecimals: number): bigint;
/** Tag 104 fields. `portfolioId` / `positionEpoch` bind the target episode (read live). */
export interface AdlWindDownArgs {
    nowSlot: bigint | string;
    assetIndex: number;
    portfolioId: bigint | string;
    positionEpoch: bigint | string;
}
/** Wire: `[104, now_slot u64, asset_index u16, portfolio_id u64, position_epoch u64]` (27 B). */
export declare function encodeAdlWindDown(a: AdlWindDownArgs): Uint8Array;
/** Tag 104 accounts: `[caller (any), market (w), portfolio (w), collateral mint]` then the asset's oracle accounts. */
export declare const ACCOUNTS_ADL_WIND_DOWN: readonly AccountSpec[];
/**
 * Build tag 104 (PERMISSIONLESS: no signer). Refreshes the asset price like a liquidation
 * crank, records/keeps the ADL episode, and force-closes the portfolio's leg at the mark only
 * when the side is dust or the episode outlived its bound, at a fresh, committed mark.
 */
export declare function buildAdlWindDownIx(programId: PublicKey, keys: {
    caller: PublicKey;
    market: PublicKey;
    portfolio: PublicKey;
    collateralMint: PublicKey;
}, args: AdlWindDownArgs, oracleAccounts?: readonly PublicKey[]): TransactionInstruction;
/** Wire: `[105, asset_index u16, max_episode_slots u32]` (7 B). Tighten-only on chain. */
export declare function encodeSetAdlWindDownMaxSlots(a: {
    assetIndex: number;
    maxEpisodeSlots: number;
}): Uint8Array;
/** Tag 105 accounts: `[upgrade_authority (s), ProgramData, market (w)]`. */
export declare const ACCOUNTS_SET_ADL_WIND_DOWN_MAX_SLOTS: readonly AccountSpec[];
/** Build tag 105 (upgrade-authority gated; can only LOWER the bound). */
export declare function buildSetAdlWindDownMaxSlotsIx(programId: PublicKey, market: PublicKey, upgradeAuthority: PublicKey, args: {
    assetIndex: number;
    maxEpisodeSlots: number;
}): TransactionInstruction;
/**
 * Field offsets inside the 64-byte `AssetRiskLimitsV17` record. P2b owns bytes 44..64 (asset-slot
 * 652..672); bytes 42..44 (650..652) belong to the Earn senior floor (prog #526), not P2b.
 */
export declare const ADL_EPISODE_FIELD_OFF: Readonly<{
    readonly maxEpisodeSlots: 44;
    readonly sinceSlot: 48;
    readonly epochKeyLong: 56;
    readonly epochKeyShort: 60;
}>;
/**
 * The on-chain episode key (`processor::adl_episode_key`): each side-reset epoch (low 32 bits)
 * XOR a multiplicative mix of the asset's market_id (the long word uses the mix, the short word
 * the mix rotated left 16).
 */
export declare function adlEpisodeKey(marketId: bigint, epochLong: bigint, epochShort: bigint): [number, number];
/** Decoded ADL wind-down episode record. */
export interface AdlEpisode {
    /** Stored override (0 = default). */
    maxEpisodeSlots: number;
    /** Effective bound in slots. */
    effectiveMaxEpisodeSlots: number;
    /** First slot tag 104 observed this episode (0n = none recorded). */
    sinceSlot: bigint;
    /** Stored key words (see `adlEpisodeKey`). */
    epochKeyLong: number;
    epochKeyShort: number;
}
/** Decode the episode fields from one 64-byte risk-limits record. */
export declare function decodeAdlEpisodeRecord(rec: Uint8Array): AdlEpisode;
/** Decode asset `i`'s episode from a raw market account. */
export declare function decodeAdlEpisode(marketData: Uint8Array, assetIndex: number): AdlEpisode;
/**
 * Slots until tag 104 may force-close, given the asset's CURRENT market_id and side-reset epochs
 * (a key mismatch or no record means the next tag 104 only arms the episode). `null` = not armed.
 */
export declare function adlEpisodeSlotsRemaining(ep: AdlEpisode, marketId: bigint, epochLong: bigint, epochShort: bigint, nowSlot: bigint): bigint | null;
/** The engine's bankruptcy h-lock byte is ACTIVE iff non-zero (it is no longer only 0/1). */
export declare function isBankruptcyHlockActive(byte: number): boolean;
/**
 * Decode the attributed h-lock byte: 0 inactive; 1 active, unattributed (clears only when no
 * positive claim remains anywhere); `1 | mask<<1` active, attributed to the claim-source domains
 * in `mask` (domain d = asset*2 + side; clears when those domains hold no claims).
 */
export declare function decodeBankruptcyHlock(byte: number): {
    active: boolean;
    unattributed: boolean;
    domains: number[];
};
