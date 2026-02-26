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
 * Layout: HEADER(104) + CONFIG(352) + RiskEngine(variable by tier)
 *   ENGINE_OFF = align_up(104 + 352, 8) = 456  (SBF: u128 align = 8)
 *   RiskEngine = fixed(576) + bitmap(BW*8) + post_bitmap(18) + next_free(N*2) + pad + accounts(N*248)
 *
 * Verified against deployed devnet programs (PERC-131 e2e testing):
 *   Small  (256 slots):  program logs expected = 0xfe40 = 65088
 *   Medium (1024 slots): computed from identical struct layout
 *   Large  (4096 slots): computed from identical struct layout
 */
export declare const SLAB_TIERS: {
    readonly small: {
        readonly maxAccounts: 256;
        readonly dataSize: 65088;
        readonly label: "Small";
        readonly description: "256 slots · ~0.45 SOL";
    };
    readonly medium: {
        readonly maxAccounts: 1024;
        readonly dataSize: 257184;
        readonly label: "Medium";
        readonly description: "1,024 slots · ~1.79 SOL";
    };
    readonly large: {
        readonly maxAccounts: 4096;
        readonly dataSize: 1025568;
        readonly label: "Large";
        readonly description: "4,096 slots · ~7.14 SOL";
    };
};
export type SlabTierKey = keyof typeof SLAB_TIERS;
/** Calculate slab data size for arbitrary account count.
 *
 * Layout (SBF, u128 align = 8):
 *   HEADER(104) + CONFIG(352) → ENGINE_OFF = 456
 *   RiskEngine fixed scalars: 576 bytes (vault through lp_max_abs_sweep)
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
 * Discover all Percolator markets owned by the given program.
 * Uses getProgramAccounts with dataSize filter + dataSlice to download only ~1400 bytes per slab.
 */
export declare function discoverMarkets(connection: Connection, programId: PublicKey): Promise<DiscoveredMarket[]>;
