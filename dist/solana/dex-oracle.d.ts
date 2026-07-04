import { Connection, PublicKey } from "@solana/web3.js";
export type DexType = "pumpswap" | "raydium-clmm" | "meteora-dlmm";
export interface DexPoolInfo {
    dexType: DexType;
    poolAddress: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    baseVault?: PublicKey;
    quoteVault?: PublicKey;
}
/**
 * Detect DEX type from the program that owns the pool account.
 *
 * @param ownerProgramId - The program ID that owns the pool account
 * @returns The detected DEX type, or `null` if the owner is not a supported DEX program
 *
 * Supported DEX programs:
 * - PumpSwap (constant-product AMM)
 * - Raydium CLMM (concentrated liquidity)
 * - Meteora DLMM (discretized liquidity)
 */
export declare function detectDexType(ownerProgramId: PublicKey): DexType | null;
/**
 * Parse a DEX pool account into a {@link DexPoolInfo} struct.
 *
 * @param dexType - The type of DEX (pumpswap, raydium-clmm, or meteora-dlmm)
 * @param poolAddress - The on-chain address of the pool account
 * @param data - Raw account data bytes
 * @returns Parsed pool info including mints and (for PumpSwap) vault addresses
 * @throws Error if data is too short for the given DEX type
 */
export declare function parseDexPool(dexType: DexType, poolAddress: PublicKey, data: Uint8Array): DexPoolInfo;
/**
 * Compute the spot price from a DEX pool in e6 format (i.e., 1.0 = 1_000_000).
 *
 * **SECURITY NOTE:** DEX spot prices have no staleness or confidence checks and are
 * vulnerable to flash-loan manipulation within a single transaction. For high-value
 * markets, prefer Pyth or Chainlink oracles.
 *
 * @param dexType - The type of DEX
 * @param data - Raw pool account data
 * @param vaultData - For PumpSwap only: base and quote vault account data
 * @returns Price in e6 format (quote per base token)
 * @throws Error if data is too short or computation fails
 */
export declare function computeDexSpotPriceE6(dexType: DexType, data: Uint8Array, vaultData?: {
    base: Uint8Array;
    quote: Uint8Array;
}, decimals?: {
    base: number;
    quote: number;
}): bigint;
/**
 * Read the `decimals` field of any SPL mint account (including native WSOL).
 *
 * This replaces `getMint(connection, mint).decimals` for callers that need to
 * supply decimals to {@link computeDexSpotPriceE6} for Meteora DLMM pools.
 * `getMint()` throws on native WSOL (`So11111111111111111111111111111111111111112`)
 * because the system account is not a valid token-program mint; this function
 * reads raw account data and extracts byte 44 directly, which works for all
 * SPL mints, Token-2022 mints, and native WSOL (which stores `9` at that byte).
 *
 * @param connection - Solana RPC connection
 * @param mint - The mint public key to query
 * @returns The `decimals` field value (0–255)
 * @throws Error if the account does not exist or is too short to hold a mint
 *
 * @example
 * ```ts
 * import { fetchMintDecimals, computeDexSpotPriceE6 } from "@percolator/sdk";
 *
 * const baseDecimals = await fetchMintDecimals(connection, pool.baseMint);
 * const quoteDecimals = await fetchMintDecimals(connection, pool.quoteMint);
 * const priceE6 = computeDexSpotPriceE6("meteora-dlmm", poolData, undefined, {
 *   base: baseDecimals,
 *   quote: quoteDecimals,
 * });
 * ```
 */
export declare function fetchMintDecimals(connection: Connection, mint: PublicKey): Promise<number>;
