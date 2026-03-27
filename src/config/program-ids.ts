import { PublicKey } from "@solana/web3.js";

/**
 * Centralized PROGRAM_ID configuration
 * 
 * Default to environment variable, then fall back to network-specific defaults.
 * This prevents hard-coded program IDs scattered across the codebase.
 */

export const PROGRAM_IDS = {
  devnet: {
    percolator: "FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD",
    matcher: "GTRgyTDfrMvBubALAqtHuQwT8tbGyXid7svXZKtWfC9k",
  },
  mainnet: {
    percolator: "GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24",
    matcher: "DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX",
  },
} as const;

export type Network = "devnet" | "mainnet";

/**
 * Get the Percolator program ID for the current network
 * 
 * Priority:
 * 1. PROGRAM_ID env var (explicit override)
 * 2. Network-specific default (NETWORK env var)
 * 3. Devnet default (safest fallback — bug bounty PERC-697)
 */
export function getProgramId(network?: Network): PublicKey {
  // Explicit override takes precedence
  if (process.env.PROGRAM_ID) {
    return new PublicKey(process.env.PROGRAM_ID);
  }

  // Use provided network or detect from env — default to devnet (never mainnet silently)
  const detectedNetwork = getCurrentNetwork();
  const targetNetwork = network ?? detectedNetwork;
  const programId = PROGRAM_IDS[targetNetwork].percolator;

  return new PublicKey(programId);
}

/**
 * Get the Matcher program ID for the current network
 */
export function getMatcherProgramId(network?: Network): PublicKey {
  // Explicit override takes precedence
  if (process.env.MATCHER_PROGRAM_ID) {
    return new PublicKey(process.env.MATCHER_PROGRAM_ID);
  }

  // Use provided network or detect from env — default to devnet (never mainnet silently)
  const detectedNetwork = getCurrentNetwork();
  const targetNetwork = network ?? detectedNetwork;
  const programId = PROGRAM_IDS[targetNetwork].matcher;

  if (!programId) {
    throw new Error(`Matcher program not deployed on ${targetNetwork}`);
  }

  return new PublicKey(programId);
}

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
export function getCurrentNetwork(): Network {
  const network = process.env.NETWORK?.toLowerCase();
  if (network === "mainnet" || network === "mainnet-beta") {
    return "mainnet";
  }
  // devnet, testnet, or unset → devnet (fail-open to devnet, not mainnet)
  return "devnet";
}
