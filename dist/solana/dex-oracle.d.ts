import { PublicKey } from "@solana/web3.js";
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
}): bigint;
