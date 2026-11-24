import { PublicKey } from "@solana/web3.js";
import { safeEnv, PROGRAM_IDS, PROGRAM_IDS_DEVNET_V22, PROGRAM_IDS_V17, PROGRAM_IDS_DEVNET_V1, NFT_PROGRAM_IDS } from "./program-id-strings.js";
export { safeEnv, PROGRAM_IDS, PROGRAM_IDS_DEVNET_V22, PROGRAM_IDS_V17, PROGRAM_IDS_DEVNET_V1, NFT_PROGRAM_IDS };
/**
 * The devnet wrapper PublicKey. In SDK 9.0.0-candidate this resolves to the ACTIVE v2.2 devnet
 * wrapper (6kpg2wi7…) — identical to getProgramId("devnet"). Retained (with its historical "V17" name) only for
 * back-compat with consumers that still import it.
 * @deprecated Prefer getProgramId("devnet") / PROGRAM_IDS.devnet.percolator.
 */
export declare const PROGRAM_ID_V17: PublicKey;
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
