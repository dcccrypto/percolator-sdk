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
/** PumpSwap AMM program ID. */
export declare const PUMPSWAP_PROGRAM_ID: PublicKey;
/** Raydium CLMM (Concentrated Liquidity) program ID. */
export declare const RAYDIUM_CLMM_PROGRAM_ID: PublicKey;
/** Meteora DLMM (Dynamic Liquidity Market Maker) program ID. */
export declare const METEORA_DLMM_PROGRAM_ID: PublicKey;
/** Pyth Push Oracle program on mainnet. */
export declare const PYTH_PUSH_ORACLE_PROGRAM_ID: PublicKey;
/**
 * Derive the Pyth Push Oracle PDA for a given feed ID.
 * Seeds: [shard_id(u16 LE, always 0), feed_id(32 bytes)]
 * Program: pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT
 */
export declare function derivePythPushOraclePDA(feedIdHex: string): [PublicKey, number];
