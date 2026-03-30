import { PublicKey } from "@solana/web3.js";
/**
 * Derive vault authority PDA.
 * Seeds: ["vault", slab_key]
 */
export declare function deriveVaultAuthority(programId: PublicKey, slab: PublicKey): [PublicKey, number];
/**
 * Derive insurance LP mint PDA.
 * Seeds: ["ins_lp", slab_key]
 */
export declare function deriveInsuranceLpMint(programId: PublicKey, slab: PublicKey): [PublicKey, number];
/**
 * Derive LP PDA for TradeCpi.
 * Seeds: ["lp", slab_key, lp_idx as u16 LE]
 */
export declare function deriveLpPda(programId: PublicKey, slab: PublicKey, lpIdx: number): [PublicKey, number];
/**
 * Derive keeper fund PDA.
 * Seeds: ["keeper_fund", slab_key]
 */
export declare function deriveKeeperFund(programId: PublicKey, slab: PublicKey): [PublicKey, number];
/** PumpSwap AMM program ID. */
export declare const PUMPSWAP_PROGRAM_ID: PublicKey;
/** Raydium CLMM (Concentrated Liquidity) program ID. */
export declare const RAYDIUM_CLMM_PROGRAM_ID: PublicKey;
/** Meteora DLMM (Dynamic Liquidity Market Maker) program ID. */
export declare const METEORA_DLMM_PROGRAM_ID: PublicKey;
/** Pyth Push Oracle program on mainnet. */
export declare const PYTH_PUSH_ORACLE_PROGRAM_ID: PublicKey;
/**
 * Seed used to derive the creator lock PDA.
 * Matches `creator_lock::CREATOR_LOCK_SEED` in percolator-prog.
 */
export declare const CREATOR_LOCK_SEED = "creator_lock";
/**
 * Derive the creator lock PDA for a given slab.
 * Seeds: ["creator_lock", slab_key]
 *
 * This PDA is required as accounts[9] in every LpVaultWithdraw instruction
 * since percolator-prog PR#170 (GH#1926 / PERC-8287).
 * Non-creator withdrawers must pass this key; if no lock exists on-chain the
 * enforcement is a no-op. The SDK must ALWAYS include it — passing it is mandatory.
 *
 * @param programId - The percolator program ID.
 * @param slab      - The slab (market) public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [creatorLockPda] = deriveCreatorLockPda(PROGRAM_ID, slabKey);
 * ```
 */
export declare function deriveCreatorLockPda(programId: PublicKey, slab: PublicKey): [PublicKey, number];
/**
 * Derive the Pyth Push Oracle PDA for a given feed ID.
 * Seeds: [shard_id(u16 LE, always 0), feed_id(32 bytes)]
 * Program: pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT
 */
export declare function derivePythPushOraclePDA(feedIdHex: string): [PublicKey, number];
