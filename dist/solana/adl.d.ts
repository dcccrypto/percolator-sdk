/**
 * @module adl
 * Percolator ADL (Auto-Deleveraging) client utilities.
 *
 * PERC-8278 / PERC-305: ADL is triggered when `pnl_pos_tot > max_pnl_cap` on a
 * market (insurance fund cap exceeded). The most profitable positions on the
 * dominant side are deleveraged first.
 *
 * API surface:
 *  - fetchAdlRankedPositions() — fetch slab + rank all open positions by PnL%
 *  - buildAdlTransaction()     — pick top-ranked target + build ExecuteAdl instruction
 *  - AdlRankedPosition         — position record with adl_rank and computed pnlPct
 *  - AdlSide                   — "long" | "short"
 *  - isAdlTriggered()          — check if slab's pnl_pos_tot exceeds max_pnl_cap
 */
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
/** Position side derived from positionSize sign. */
export type AdlSide = "long" | "short";
/**
 * A ranked open position for ADL purposes.
 * Positions are ranked descending by `pnlPct` — rank 0 is the most profitable
 * and will be deleveraged first.
 */
export interface AdlRankedPosition {
    /** Account index in the slab (used as `targetIdx` in ExecuteAdl). */
    idx: number;
    /** Owner public key. */
    owner: PublicKey;
    /** Raw position size (i128 — negative = short, positive = long). */
    positionSize: bigint;
    /** Realised + mark-to-market PnL in lamports (i128 from slab). */
    pnl: bigint;
    /** Capital at entry in lamports (u128). */
    capital: bigint;
    /**
     * PnL as a fraction of capital, expressed as basis points (scaled × 10_000).
     * pnlPct = pnl * 10_000 / capital.
     * Higher = more profitable = deleveraged first.
     */
    pnlPct: bigint;
    /** Long or short. */
    side: AdlSide;
    /**
     * ADL rank among positions on the same side (0 = highest PnL%, deleveraged first).
     * `-1` if position size is zero (inactive).
     */
    adlRank: number;
}
/**
 * Result of `fetchAdlRankedPositions`.
 */
export interface AdlRankingResult {
    /** All open (non-zero) user positions, sorted descending by PnLPct, ranked. */
    ranked: AdlRankedPosition[];
    /**
     * Longs ranked separately (adlRank within this subset).
     * Rank 0 = most profitable long = first to be deleveraged on a net-long market.
     */
    longs: AdlRankedPosition[];
    /**
     * Shorts ranked separately (adlRank within this subset).
     * Rank 0 = most profitable short (most negative pnlPct magnitude — i.e., highest
     * unrealised gain for the short-side holder).
     */
    shorts: AdlRankedPosition[];
    /** Whether ADL is currently triggered (pnlPosTot > maxPnlCap). */
    isTriggered: boolean;
    /** pnl_pos_tot from engine state. */
    pnlPosTot: bigint;
    /** max_pnl_cap from market config. */
    maxPnlCap: bigint;
}
/**
 * Check whether ADL is currently triggered on a slab.
 *
 * ADL triggers when pnl_pos_tot > max_pnl_cap (max_pnl_cap must be > 0).
 *
 * @param slabData - Raw slab account bytes.
 * @returns true if ADL is triggered.
 *
 * @example
 * ```ts
 * const data = await fetchSlab(connection, slabKey);
 * if (isAdlTriggered(data)) {
 *   const ranking = await fetchAdlRankedPositions(connection, slabKey);
 * }
 * ```
 */
export declare function isAdlTriggered(slabData: Uint8Array): boolean;
/**
 * Fetch a slab and rank all open user positions by PnL% for ADL targeting.
 *
 * Positions are ranked separately per side:
 * - Longs: rank 0 = highest positive PnL% (most profitable long)
 * - Shorts: rank 0 = highest negative PnL% by abs value (most profitable short)
 *
 * Rank ordering matches the on-chain ADL engine in percolator-prog (PERC-8273):
 * the position at rank 0 of the dominant side is deleveraged first.
 *
 * @param connection - Solana connection.
 * @param slab       - Slab (market) public key.
 * @returns AdlRankingResult with ranked longs, ranked shorts, and trigger status.
 *
 * @example
 * ```ts
 * const { ranked, longs, isTriggered } = await fetchAdlRankedPositions(connection, slabKey);
 * if (isTriggered && longs.length > 0) {
 *   const target = longs[0]; // highest PnL long
 *   const ix = buildAdlInstruction(caller, slabKey, oracleKey, programId, target.idx);
 * }
 * ```
 */
export declare function fetchAdlRankedPositions(connection: Connection, slab: PublicKey): Promise<AdlRankingResult>;
/**
 * Pure (no-RPC) variant — rank positions from already-fetched slab bytes.
 * Useful when you already have the slab data (e.g., from a subscription).
 */
export declare function rankAdlPositions(slabData: Uint8Array): AdlRankingResult;
/**
 * Build a single `ExecuteAdl` TransactionInstruction (tag 50, PERC-305).
 *
 * Does NOT fetch the slab or check trigger status — use `fetchAdlRankedPositions`
 * first to determine the correct `targetIdx`.
 *
 * @param caller     - Signer (permissionless — any keypair).
 * @param slab       - Slab (market) public key.
 * @param oracle     - Primary oracle public key for this market.
 * @param programId  - Percolator program ID.
 * @param targetIdx  - Account index to deleverage (from `AdlRankedPosition.idx`).
 * @param backupOracles - Optional additional oracle accounts (non-Hyperp markets).
 *
 * @example
 * ```ts
 * import { fetchAdlRankedPositions, buildAdlInstruction } from "@percolator/sdk";
 *
 * const { longs, isTriggered } = await fetchAdlRankedPositions(connection, slabKey);
 * if (isTriggered && longs.length > 0) {
 *   const ix = buildAdlInstruction(
 *     caller.publicKey, slabKey, oracleKey, PROGRAM_ID, longs[0].idx
 *   );
 *   await sendAndConfirmTransaction(connection, new Transaction().add(ix), [caller]);
 * }
 * ```
 */
export declare function buildAdlInstruction(caller: PublicKey, slab: PublicKey, oracle: PublicKey, programId: PublicKey, targetIdx: number, backupOracles?: PublicKey[]): TransactionInstruction;
/**
 * Convenience builder: fetch slab, rank positions, pick the highest-ranked
 * target on the given side, and return a ready-to-send `TransactionInstruction`.
 *
 * Returns `null` when ADL is not triggered or no eligible positions exist.
 *
 * @param connection    - Solana connection.
 * @param caller        - Signer public key.
 * @param slab          - Slab (market) public key.
 * @param oracle        - Primary oracle public key.
 * @param programId     - Percolator program ID.
 * @param preferSide    - Optional: target "long" or "short" side only.
 *                        If omitted, picks the overall top-ranked position.
 * @param backupOracles - Optional extra oracle accounts.
 *
 * @example
 * ```ts
 * const ix = await buildAdlTransaction(
 *   connection, caller.publicKey, slabKey, oracleKey, PROGRAM_ID
 * );
 * if (ix) {
 *   await sendAndConfirmTransaction(connection, new Transaction().add(ix), [caller]);
 * }
 * ```
 */
export declare function buildAdlTransaction(connection: Connection, caller: PublicKey, slab: PublicKey, oracle: PublicKey, programId: PublicKey, preferSide?: AdlSide, backupOracles?: PublicKey[]): Promise<TransactionInstruction | null>;
