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
 * Slab tier definitions — V1 layout (all tiers upgraded as of 2026-03-13).
 * IMPORTANT: dataSize must match the compiled program's SLAB_LEN for that MAX_ACCOUNTS.
 * The on-chain program has a hardcoded SLAB_LEN — slab account data.len() must equal it exactly.
 *
 * Layout: HEADER(104) + CONFIG(536) + RiskEngine(variable by tier)
 *   ENGINE_OFF = 640  (HEADER=104 + CONFIG=536, padded to 8-byte align on SBF)
 *   RiskEngine = fixed(656) + bitmap(BW*8) + post_bitmap(18) + next_free(N*2) + pad + accounts(N*248)
 *
 * Values are empirically verified against on-chain initialized accounts (GH #1109):
 *   small  = 65,352  (256-acct program, verified on-chain post-V1 upgrade)
 *   medium = 257,448 (1024-acct program g9msRSV3, verified on-chain)
 *   large  = 1,025,832 (4096-acct program FxfD37s1, pre-PERC-118, matches slabDataSizeV1(4096) formula)
 *
 * NOTE: small program (FwfBKZXb) redeployed with --features small,devnet (2026-03-13).
 *       Large program FxfD37s1 is pre-PERC-118 — SLAB_LEN=1,025,832, matching formula.
 *       See GH #1109, GH #1112.
 *
 * History: Small was V0 (62_808) until 2026-03-13 program upgrade. V0 values preserved
 *          in SLAB_TIERS_V0 for discovery of legacy on-chain accounts.
 */
/**
 * V1 slab tier sizes — devnet builds (percolator rev before cf35789).
 * Engine header is 64 bytes smaller than mainnet builds.
 */
export declare const SLAB_TIERS: {
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
/**
 * Mainnet slab tier sizes — percolator rev cf35789+ (GH#1731 warmup validation adds 64 bytes to engine header).
 * Verified: medium = 257,512 from on-chain error log (0x3ede8).
 * Small and large extrapolated (+64 bytes from devnet sizes).
 */
export declare const SLAB_TIERS_MAINNET: {
    readonly small: {
        readonly maxAccounts: 256;
        readonly dataSize: 65416;
        readonly label: "Small";
        readonly description: "256 slots · ~0.46 SOL (mainnet)";
    };
    readonly medium: {
        readonly maxAccounts: 1024;
        readonly dataSize: 257512;
        readonly label: "Medium";
        readonly description: "1,024 slots · ~1.79 SOL (mainnet)";
    };
    readonly large: {
        readonly maxAccounts: 4096;
        readonly dataSize: 1025896;
        readonly label: "Large";
        readonly description: "4,096 slots · ~7.14 SOL (mainnet)";
    };
};
/** @deprecated V0 slab sizes — kept for backward compatibility with old on-chain slabs */
export declare const SLAB_TIERS_V0: {
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
/**
 * V1D slab sizes — actually-deployed devnet V1 program (ENGINE_OFF=424, BITMAP_OFF=624).
 * PR #1200 added V1D layout detection in slab.ts but discovery.ts ALL_TIERS was missing
 * these sizes, causing V1D slabs to fall through to the memcmp fallback with wrong dataSize
 * hints → detectSlabLayout returning null → parse failure (GH#1205).
 *
 * Sizes computed via computeSlabSize(ENGINE_OFF=424, BITMAP_OFF=624, ACCOUNT_SIZE=248, N, postBitmap=2):
 *   The V1D deployed program uses postBitmap=2 (free_head u16 only — no num_used/pad/next_account_id).
 *   This is 16 bytes smaller per tier than the SDK default (postBitmap=18). GH#1234.
 *   micro  =  17,064  (64 slots)
 *   small  =  65,088  (256 slots)
 *   medium = 257,184  (1,024 slots)
 *   large  = 1,025,568 (4,096 slots)
 */
export declare const SLAB_TIERS_V1D: {
    readonly micro: {
        readonly maxAccounts: 64;
        readonly dataSize: 17064;
        readonly label: "Micro";
        readonly description: "64 slots (V1D devnet)";
    };
    readonly small: {
        readonly maxAccounts: 256;
        readonly dataSize: 65088;
        readonly label: "Small";
        readonly description: "256 slots (V1D devnet)";
    };
    readonly medium: {
        readonly maxAccounts: 1024;
        readonly dataSize: 257184;
        readonly label: "Medium";
        readonly description: "1,024 slots (V1D devnet)";
    };
    readonly large: {
        readonly maxAccounts: 4096;
        readonly dataSize: 1025568;
        readonly label: "Large";
        readonly description: "4,096 slots (V1D devnet)";
    };
};
/**
 * V1D legacy slab sizes — on-chain V1D slabs created before GH#1234 when the SDK assumed
 * postBitmap=18. These are 16 bytes larger per tier than SLAB_TIERS_V1D.
 * PR #1236 fixed postBitmap for new slabs (→2) but caused slab 6ZytbpV4 (65104 bytes,
 * top active market ~$15k 24h vol) to be unrecognized → "Failed to load market". GH#1237.
 *
 * Sizes computed via computeSlabSize(ENGINE_OFF=424, BITMAP_OFF=624, ACCOUNT_SIZE=248, N, postBitmap=18):
 *   micro  =  17,080  (64 slots)
 *   small  =  65,104  (256 slots)  ← slab 6ZytbpV4 TEST/USD
 *   medium = 257,200  (1,024 slots)
 *   large  = 1,025,584 (4,096 slots)
 */
export declare const SLAB_TIERS_V1D_LEGACY: {
    readonly micro: {
        readonly maxAccounts: 64;
        readonly dataSize: 17080;
        readonly label: "Micro";
        readonly description: "64 slots (V1D legacy, postBitmap=18)";
    };
    readonly small: {
        readonly maxAccounts: 256;
        readonly dataSize: 65104;
        readonly label: "Small";
        readonly description: "256 slots (V1D legacy, postBitmap=18)";
    };
    readonly medium: {
        readonly maxAccounts: 1024;
        readonly dataSize: 257200;
        readonly label: "Medium";
        readonly description: "1,024 slots (V1D legacy, postBitmap=18)";
    };
    readonly large: {
        readonly maxAccounts: 4096;
        readonly dataSize: 1025584;
        readonly label: "Large";
        readonly description: "4,096 slots (V1D legacy, postBitmap=18)";
    };
};
/** @deprecated Alias — use SLAB_TIERS (already V1) */
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
/**
 * Calculate slab data size for V1 layout (ENGINE_OFF=640).
 *
 * NOTE: This formula is accurate for small (256) and medium (1024) tiers but
 * underestimates large (4096) by 16 bytes — likely due to a padding/alignment
 * difference at high account counts or a post-PERC-118 struct addition in the
 * deployed binary. Always prefer the hardcoded SLAB_TIERS values (empirically
 * verified on-chain) over this formula for production use.
 */
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
/** Options for `discoverMarkets`. */
export interface DiscoverMarketsOptions {
    /**
     * Run tier queries sequentially with per-tier retry on HTTP 429 instead of
     * firing all in parallel.  Reduces RPC rate-limit pressure at the cost of
     * slightly slower discovery (~14 round-trips instead of 1 concurrent batch).
     * Default: false (preserves original parallel behaviour).
     *
     * PERC-1650: keeper uses this flag to avoid 429 storms on its fallback RPC
     * (Helius starter tier).  Pass `sequential: true` from CrankService.discover().
     */
    sequential?: boolean;
    /**
     * Delay in ms between sequential tier queries (only used when sequential=true).
     * Default: 200 ms.
     */
    interTierDelayMs?: number;
    /**
     * Per-tier retry backoff delays on 429 (ms).  Jitter of up to +25% is applied.
     * Only used when sequential=true.  Default: [1_000, 3_000, 9_000, 27_000].
     */
    rateLimitBackoffMs?: number[];
}
/**
 * Discover all Percolator markets owned by the given program.
 * Uses getProgramAccounts with dataSize filter + dataSlice to download only ~1400 bytes per slab.
 *
 * @param options.sequential - Run tier queries sequentially with 429 retry (PERC-1650).
 */
export declare function discoverMarkets(connection: Connection, programId: PublicKey, options?: DiscoverMarketsOptions): Promise<DiscoveredMarket[]>;
