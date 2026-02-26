import { PublicKey } from "@solana/web3.js";
/**
 * Centralized PROGRAM_ID configuration
 *
 * Default to environment variable, then fall back to network-specific defaults.
 * This prevents hard-coded program IDs scattered across the codebase.
 */
export declare const PROGRAM_IDS: {
    readonly devnet: {
        readonly percolator: "FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD";
        readonly matcher: "GTRgyTDfrMvBubALAqtHuQwT8tbGyXid7svXZKtWfC9k";
    };
    readonly mainnet: {
        readonly percolator: "GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24";
        readonly matcher: "";
    };
};
export type Network = "devnet" | "mainnet";
/**
 * Get the Percolator program ID for the current network
 *
 * Priority:
 * 1. PROGRAM_ID env var (explicit override)
 * 2. Network-specific default (NETWORK env var)
 * 3. Devnet default (safest fallback)
 */
export declare function getProgramId(network?: Network): PublicKey;
/**
 * Get the Matcher program ID for the current network
 */
export declare function getMatcherProgramId(network?: Network): PublicKey;
/**
 * Get the current network from environment
 * Defaults to devnet for safety
 */
export declare function getCurrentNetwork(): Network;
