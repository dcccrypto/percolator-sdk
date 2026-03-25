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
        readonly matcher: "DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX";
    };
};
export type Network = "devnet" | "mainnet";
/**
 * Get the Percolator program ID for the current network
 *
 * Priority:
 * 1. PROGRAM_ID env var (explicit override)
 * 2. Network-specific default (NETWORK env var)
 * 3. Devnet default (safest fallback — bug bounty PERC-697)
 */
export declare function getProgramId(network?: Network): PublicKey;
/**
 * Get the Matcher program ID for the current network
 */
export declare function getMatcherProgramId(network?: Network): PublicKey;
/**
 * Get the current network from environment.
 *
 * SECURITY (PERC-697): Removed silent mainnet default.
 * Previously defaulted to "mainnet" when NETWORK was unset, which could cause
 * crank/keeper scripts run without env vars to silently target mainnet program IDs.
 *
 * Now defaults to "devnet" — the safer fallback for a devnet-first protocol.
 * Production deployments always set NETWORK explicitly via Railway/env.
 * For mainnet operations use networkValidation.ts (ensureNetworkConfigValid) which
 * enforces FORCE_MAINNET=1.
 */
export declare function getCurrentNetwork(): Network;
