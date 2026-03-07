import { Connection, PublicKey } from "@solana/web3.js";
import { type SlabHeader, type MarketConfig, type EngineState, type RiskParams } from "./slab.js";
/**
 * A discovered Percolator market from on-chain program accounts.
 */
export interface DiscoveredMarket {
    slabAddress: PublicKey;
    /** The program that owns this slab account */
    programId: PublicKey;
    header: SlabHeader;
    config: MarketConfig;
    engine: EngineState;
    params: RiskParams;
}
/**
 * Slab tier definitions.
 * IMPORTANT: dataSize must match the compiled program's SLAB_LEN for that MAX_ACCOUNTS.
 * The on-chain program has a hardcoded SLAB_LEN — slab account data.len() must equal it exactly.
 *
 * Layout: HEADER(104) + CONFIG(536) + RiskEngine(variable by tier)
 *   ENGINE_OFF = align_up(104 + 536, 8) = 640  (SBF: u128 align = 8)
 *   RiskEngine = fixed(656) + bitmap(BW*8) + post_bitmap(18) + next_free(N*2) + pad + accounts(N*248)
 *
 * NOTE: CONFIG_LEN grew 368→384→400→416→432→496→536 across PERC-298 through PERC-328.
 *       PERC-306/307/312/314/315 added 64 bytes (isolation, orphan, safety valve, dispute, LP collateral).
 *       PERC-328 added 40 bytes (_reserved: [u8; 40] for SlabHeader isolation).
 *       ENGINE_OFF = 640 (verified against on-chain compile-time assertion: const _: [(); 536] = [(); CONFIG_LEN]).
 *       RiskEngine grew by 32 bytes (PERC-298: long_oi + short_oi) + 24 (PERC-299: emergency OI).
 *       Values below must be verified against BPF build before deployment.
 */
export declare const SLAB_TIERS: {
    readonly small: {
        readonly maxAccounts: 256;
        readonly dataSize: 62808;
        readonly label: "Small";
        readonly description: "256 slots · ~0.44 SOL";
    };
    readonly medium: {
        readonly maxAccounts: 1024;
        readonly dataSize: 248760;
        readonly label: "Medium";
        readonly description: "1,024 slots · ~1.73 SOL";
    };
    readonly large: {
        readonly maxAccounts: 4096;
        readonly dataSize: 992568;
        readonly label: "Large";
        readonly description: "4,096 slots · ~6.90 SOL";
    };
};
/** V1 slab tier sizes (for use when program is upgraded to V1 layout) */
export declare const SLAB_TIERS_V1: {
    readonly small: {
        readonly maxAccounts: 256;
        readonly dataSize: 65352;
        readonly label: "Small";
        readonly description: "256 slots · ~0.45 SOL";
    };
    readonly medium: {
        readonly maxAccounts: 1024;
        readonly dataSize: 257448;
        readonly label: "Medium";
        readonly description: "1,024 slots · ~1.79 SOL";
    };
    readonly large: {
        readonly maxAccounts: 4096;
        readonly dataSize: 1025832;
        readonly label: "Large";
        readonly description: "4,096 slots · ~7.14 SOL";
    };
};
export type SlabTierKey = keyof typeof SLAB_TIERS;
/** Calculate slab data size for arbitrary account count.
 *
 * Layout (SBF, u128 align = 8):
 *   HEADER(104) + CONFIG(536) → ENGINE_OFF = 640
 *   RiskEngine fixed scalars: 656 bytes (PERC-299: +24 emergency OI, +32 long/short OI)
 *   + bitmap: ceil(N/64)*8
 *   + num_used_accounts(u16) + pad(6) + next_account_id(u64) + free_head(u16) = 18
 *   + next_free: N*2
 *   + pad to 8-byte alignment for Account array
 *   + accounts: N*248
 *
 * Must match the on-chain program's SLAB_LEN exactly.
 */
export declare function slabDataSize(maxAccounts: number): number;
/** Calculate slab data size for V1 layout (future program upgrade). */
export declare function slabDataSizeV1(maxAccounts: number): number;
/**
 * Validate that a slab data size matches one of the known tier sizes.
 * Use this to catch tier↔program mismatches early (PERC-277).
 *
 * @param dataSize - The expected slab data size (from SLAB_TIERS[tier].dataSize)
 * @param programSlabLen - The program's compiled SLAB_LEN (from on-chain error logs or program introspection)
 * @returns true if sizes match, false if there's a mismatch
 */
export declare function validateSlabTierMatch(dataSize: number, programSlabLen: number): boolean;
/**
 * Discover all Percolator markets owned by the given program.
 * Uses getProgramAccounts with dataSize filter + dataSlice to download only ~1400 bytes per slab.
 */
export declare function discoverMarkets(connection: Connection, programId: PublicKey): Promise<DiscoveredMarket[]>;
