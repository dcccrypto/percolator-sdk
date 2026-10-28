/**
 * v2.2 growth round 2 (R2.1 item 4): the on-chain DEX depth source.
 *
 * Source of truth (read, every offset and byte verified): wrapper branch `feat/v22-growth-dex-depth` (`percolator-prog-dex`) @ `e2c93138`:
 * `src/depth_src_v22.rs` (the `DepthSourceV22` record, pool allow-list, depth math) and `src/v16_program.rs` (tag 123 `SetDepthSource`,
 * PushAuthMark depth mode 2, PDA kind 16, error 129 `DepthSourceInvalid`).
 *
 * The upgrade authority pins ONE pool per market with tag 123 (PDA `["depth_src", market]`). A keeper (or anyone holding the oracle authority key)
 * then sends PushAuthMark mode 2: the 44-byte form with `depth_mode = 2`, `depth_e6 = 0`, and four more accounts. The wrapper reads the pool's own
 * reserves and computes the +-2% depth itself ({@link plus2PctDepthE6}), so nobody can inflate it; the source is "on-chain pool" (2), uncapped by
 * `attested_max_tier`.
 *
 * @module v22-depth-source
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { LayoutTable } from "./layout.js";
import type { AccountSpec } from "./accounts.js";
import type { PushAuthMarkArgs } from "./instructions.js";
/** Wrapper tag 123 `SetDepthSource` (`constants::TAG_SET_DEPTH_SOURCE`). */
export declare const TAG_SET_DEPTH_SOURCE_V22 = 123;
/** Tag 123 `op`: 0 clears the pin (mode 2 refused afterwards), 1 sets / replaces it. */
export declare const DEPTH_SOURCE_OP: Readonly<{
    readonly Clear: 0;
    readonly Set: 1;
}>;
/** Tag 123 instruction data length: `[123][op u8][asset_index u16][market_id u64]`. */
export declare const SET_DEPTH_SOURCE_LEN_V22 = 12;
/** PDA seed (`depth_src_v22::DEPTH_SOURCE_SEED`). */
export declare const DEPTH_SOURCE_SEED_V22 = "depth_src";
/** `depth_src_v22::DEPTH_SOURCE_VERSION`. */
export declare const DEPTH_SOURCE_VERSION_V22 = 1;
/** `size_of::<DepthSourceV22>()`. */
export declare const DEPTH_SOURCE_BODY_LEN_V22 = 256;
/** Account length: 16-byte header + 256-byte body (the wrapper requires this exact length). */
export declare const DEPTH_SOURCE_ACCOUNT_LEN_V22: number;
/** `flags` bit 0: the pin is in force (clear after a UA "clear": mode 2 is refused with 129). */
export declare const DEPTH_SRC_FLAG_ACTIVE = 1;
/** `flags` bit 1: the market's asset ("base") is the pool's side 1. */
export declare const DEPTH_SRC_FLAG_BASE_IS_SIDE1 = 2;
/** Mint decimals above this are refused. */
export declare const DEPTH_SRC_MAX_DECIMALS = 18;
/** `DepthSourceV22::amm_kind`. */
export declare const AMM_KIND_V22: Readonly<{
    readonly PumpSwap: 1;
    readonly RaydiumCpmm: 2;
}>;
/** Allow-listed pool owners. The wrapper's devnet build also accepts the devnet Raydium CPMM; the mainnet build does not. */
export declare const DEPTH_AMM_PROGRAMS_V22: Readonly<{
    readonly pumpSwap: PublicKey;
    readonly raydiumCpmm: PublicKey;
    readonly raydiumCpmmDevnet: PublicKey;
}>;
/**
 * Derive the depth-source PDA `["depth_src", market]`.
 *
 * @param programId  Wrapper program id.
 * @param market     Market (slab) account.
 * @returns `[pda, bump]`.
 * @example
 * ```ts
 * const [pin] = deriveDepthSourceV22(programId, market);
 * ```
 */
export declare function deriveDepthSourceV22(programId: PublicKey, market: PublicKey): [PublicKey, number];
/** Decision 16 (prog#606): `["pool_claim", pool]`, kind 18, one growth market per spot pool. */
export declare const POOL_CLAIM_SEED_V22 = "pool_claim";
/**
 * The pool-claim PDA of `pool` (prog#606). Tag 123 op 1 creates / checks it at `[10]`; op 0 releases it at `[5]`.
 *
 * @param programId  Wrapper program id.
 * @param pool       The AMM pool account.
 * @returns `[pda, bump]`.
 */
export declare function derivePoolClaimV22(programId: PublicKey, pool: PublicKey): [PublicKey, number];
/**
 * Tag 123 SetDepthSource data: `[123][op u8][asset_index u16 LE][market_id u64 LE]` (12 bytes). Upgrade authority only.
 *
 * @param op          0 = clear the pin, 1 = set / replace it.
 * @param assetIndex  The asset slot (`u16`); op 0 ignores it on chain.
 * @param marketId    The asset's generation (`u64`); op 0 ignores it on chain.
 * @returns 12 bytes.
 * @example
 * ```ts
 * encodeSetDepthSourceV22(1, 3, 0x0102030405060708n); // 7b 01 03 00 08 07 06 05 04 03 02 01
 * ```
 */
export declare function encodeSetDepthSourceV22(op: 0 | 1, assetIndex: number, marketId: bigint | string): Uint8Array;
/** The clear form of tag 123 (`op = 0`, asset 0, generation 0: a stale pin of a reused slot can always be cleared). */
export declare function encodeClearDepthSourceV22(assetIndex?: number, marketId?: bigint | string): Uint8Array;
/** Tag 123 accounts, common part `[0..4]` (the clear form carries only these). The market is WRITABLE (F-3: op 1 sets / op 0 clears `DEPTH_DEX_PINNED`). */
export declare const ACCOUNTS_SET_DEPTH_SOURCE_V22: readonly AccountSpec[];
/** Tag 123 op 1 tail `[5..9]`: the pool, its two vaults and the two mints ("base" = the market's asset). */
export declare const ACCOUNTS_SET_DEPTH_SOURCE_POOL_TAIL_V22: readonly AccountSpec[];
/** PushAuthMark mode 2 appends these four after `[0] oracleAuthority`, `[1] market` (all read-only). */
export declare const ACCOUNTS_PUSH_AUTH_MARK_DEX_TAIL_V22: readonly AccountSpec[];
/** Arguments of {@link buildSetDepthSourceIxV22}. */
export interface SetDepthSourceArgsV22 {
    programId: PublicKey;
    /** The wrapper's upgrade authority (signer; pays the rent on first use). */
    upgradeAuthority: PublicKey;
    market: PublicKey;
    assetIndex: number;
    /** The asset's generation (`market_id`). */
    marketId: bigint | string;
    /** The AMM pool (owned by an allow-listed program). */
    pool: PublicKey;
    /** The pool's vault of the market's asset ("base") and of the other side ("quote"). */
    baseVault: PublicKey;
    quoteVault: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    /**
     * prog#606 pool claim: the pool the market is pinned to TODAY, when the new pin moves to a different pool (its claim is released at
     * `[11]`). Omit for a first pin or a re-pin of the same pool. Ignored by programs before #606 (extra accounts).
     */
    previousPool?: PublicKey;
}
/**
 * Tag 123 op 1: pin (or replace) the market's DEX depth source. 10 accounts. The wrapper refuses (129) a pool off the allow-list, vault / mint
 * keys that are not the pool's own, vaults that are not initialized token accounts of their mints, a refused Token-2022 extension, an asset mint
 * equal to the market's collateral mint, or a wrong PDA; non-authority: 8 `Unauthorized`.
 *
 * @param a  See {@link SetDepthSourceArgsV22}.
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildSetDepthSourceIxV22({ programId, upgradeAuthority, market, assetIndex: 0, marketId: 1n, pool, baseVault, quoteVault, baseMint, quoteMint });
 * ```
 */
export declare function buildSetDepthSourceIxV22(a: SetDepthSourceArgsV22): TransactionInstruction;
/**
 * Tag 123 op 0: clear the pin (PushAuthMark mode 2 is then refused with 129 until a new op 1). 5 accounts.
 *
 * @param programId         Wrapper program id.
 * @param upgradeAuthority  The wrapper's upgrade authority (signer).
 * @param market            Market account.
 * @param assetIndex        Ignored on chain for op 0 (default 0).
 * @param marketId          Ignored on chain for op 0 (default 0).
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildClearDepthSourceIxV22(programId, upgradeAuthority, market);
 * ```
 */
export declare function buildClearDepthSourceIxV22(programId: PublicKey, upgradeAuthority: PublicKey, market: PublicKey, assetIndex?: number, marketId?: bigint | string, pinnedPool?: PublicKey): TransactionInstruction;
/** Arguments of {@link buildPushAuthMarkDexIxV22}. */
export interface PushAuthMarkDexArgsV22 {
    programId: PublicKey;
    /** The asset's oracle authority (signer). */
    oracleAuthority: PublicKey;
    market: PublicKey;
    /** The tag 63 fields (no `depth`: mode 2 is implied). */
    push: Omit<PushAuthMarkArgs, "depth">;
    /** The pinned pool and its two vaults (must be exactly the pinned keys, else 129). */
    pool: PublicKey;
    baseVault: PublicKey;
    quoteVault: PublicKey;
}
/**
 * PushAuthMark mode 2: the 44-byte form (`depth_mode = 2`, `depth_e6 = 0`) with `[2] depth_src [3] pool [4] base_vault [5] quote_vault` after
 * `[0] oracle authority (signer)` and `[1] market (writable)`. One asset per instruction (several pushes in one transaction are several
 * instructions, each with its own four accounts). The wrapper stamps the depth with source 2 (no tier cap); any mismatch with the pin
 * writes nothing and answers 129 `DepthSourceInvalid`.
 *
 * @param a  See {@link PushAuthMarkDexArgsV22}.
 * @returns The instruction (44 data bytes, 6 accounts).
 * @example
 * ```ts
 * const ix = buildPushAuthMarkDexIxV22({ programId, oracleAuthority, market, push: { assetIndex: 0, marketId: 1n, nowSlot, markE6, observationSequence }, pool, baseVault, quoteVault });
 * ```
 */
export declare function buildPushAuthMarkDexIxV22(a: PushAuthMarkDexArgsV22): TransactionInstruction;
/** Decoded `DepthSourceV22` (`depth_src_v22.rs`, offsets pinned by const asserts there). */
export interface DepthSourceV22 {
    market: PublicKey;
    /** The pool's owner (allow-listed AMM program). */
    ammProgram: PublicKey;
    pool: PublicKey;
    baseVault: PublicKey;
    quoteVault: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    /** The pinned asset generation. */
    marketId: bigint;
    /** Slot of the last SetDepthSource (informational). */
    setSlot: bigint;
    assetIndex: number;
    baseDecimals: number;
    quoteDecimals: number;
    flags: number;
    /** The pin is in force (`false` after a clear: mode 2 is refused). */
    active: boolean;
    /** The market's asset is the pool's side 1 (else side 0). */
    baseIsSide1: boolean;
    version: number;
    bump: number;
    /** 1 PumpSwap, 2 Raydium CPMM (0 on a cleared record). */
    ammKind: number;
}
/**
 * Decode a `DepthSourceV22` account with the wrapper's own validation (`validate_depth_source`): exact length, kind 16 header, version 1, a
 * non-zero market, zero reserved bytes, known flags; a cleared record must be all-zero but `market` / `version` / `bump`; an active one must name
 * an allow-listed program of the recorded kind, non-zero distinct keys (mints, vaults) and decimals <= 18.
 *
 * @param data   Raw account bytes (272).
 * @param table  Layout table (default {@link LAYOUT_V22}).
 * @returns The record.
 * @throws {@link UnknownLayoutError} on a wrong header / length or a record the wrapper would refuse.
 * @example
 * ```ts
 * const pin = decodeDepthSourceV22(info.data);
 * if (pin.active) console.log(pin.pool.toBase58());
 * ```
 */
export declare function decodeDepthSourceV22(data: Uint8Array, table?: LayoutTable): DepthSourceV22;
/**
 * `floor(sqrt(n))`, exact for every u128 (`depth_src_v22::isqrt_u128`).
 *
 * @param n  Non-negative integer below 2^128.
 * @returns The integer square root.
 * @example
 * ```ts
 * isqrtU128(99n); // 9n
 * ```
 */
export declare function isqrtU128(n: bigint): bigint;
/**
 * The exact +-2% depth of a constant-product pool from a reserve `R` valued in collateral atoms: `floor(R * (1 - 1/sqrt(1.02))) = R - m`, `m` the
 * smallest integer with `51 m^2 >= 50 R^2`. Rounds down, never overstated, full u64 width, no float. Port of `plus2pct_depth_e6`.
 *
 * @param r  Reserve value (collateral atoms), u64.
 * @returns Depth (atoms).
 * @example
 * ```ts
 * plus2PctDepthE6(1_000_000_000_000n); // 9_852_457_023n
 * ```
 */
export declare function plus2PctDepthE6(r: bigint): bigint;
/**
 * The reserve value `R` in collateral atoms. `quote-is-collateral`: the quote reserve. `base-at-mark`: `floor(base * mark / 10^(baseDecimals +
 * lotExp))` capped at u64::MAX (a cap only lowers the depth); `null` for a zero mark, decimals > 18 or `lotExp > 15`. Port of `reserve_value_e6`.
 *
 * @param path           Which side gives the value.
 * @param baseAtoms      The asset-side reserve.
 * @param quoteAtoms     The other side's reserve.
 * @param markE6         Per-lot mark (e6).
 * @param baseDecimals   The asset mint's decimals.
 * @param lotExp         The market's `lot_exp`.
 * @returns Value or `null`.
 * @example
 * ```ts
 * reserveValueE6("base-at-mark", 171_449_177_380_421n, 0n, 12_000_000n, 6, 4); // 205_739_012_856n
 * ```
 */
export declare function reserveValueE6(path: "quote-is-collateral" | "base-at-mark", baseAtoms: bigint, quoteAtoms: bigint, markE6: bigint, baseDecimals: number, lotExp: number): bigint | null;
