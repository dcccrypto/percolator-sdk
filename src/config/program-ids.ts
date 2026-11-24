import { PublicKey } from "@solana/web3.js";
import {
  safeEnv,
  PROGRAM_IDS,
  PROGRAM_IDS_DEVNET_V22,
  PROGRAM_IDS_V17,
  PROGRAM_IDS_DEVNET_V1,
  NFT_PROGRAM_IDS,
} from "./program-id-strings.js";

export { safeEnv, PROGRAM_IDS, PROGRAM_IDS_DEVNET_V22, PROGRAM_IDS_V17, PROGRAM_IDS_DEVNET_V1, NFT_PROGRAM_IDS };

/**
 * The devnet wrapper PublicKey. In SDK 9.0.0-candidate this resolves to the ACTIVE v2.2 devnet
 * wrapper (6kpg2wi7…) — identical to getProgramId("devnet"). Retained (with its historical "V17" name) only for
 * back-compat with consumers that still import it.
 * @deprecated Prefer getProgramId("devnet") / PROGRAM_IDS.devnet.percolator.
 */
export const PROGRAM_ID_V17 = new PublicKey(PROGRAM_IDS_V17.percolator);

export type Network = "devnet" | "mainnet";

/** Allowlist of legitimate percolator program addresses (all networks). */
const KNOWN_PROGRAM_IDS = new Set<string>([
  PROGRAM_IDS.devnet.percolator,
  PROGRAM_IDS.mainnet.percolator,
  PROGRAM_IDS_V17.percolator,
  PROGRAM_IDS_DEVNET_V1.percolator, // v1 / close-only devnet wrapper (still live)
]);

/** Allowlist of legitimate matcher program addresses (all networks). */
const KNOWN_MATCHER_IDS = new Set<string>([
  PROGRAM_IDS.devnet.matcher,
  PROGRAM_IDS.mainnet.matcher,
  PROGRAM_IDS_DEVNET_V1.matcher, // v1 / close-only devnet matcher (still live)
]);

/**
 * #308 escape hatch: an env program-ID override that is NOT in the allowlist is rejected
 * UNLESS the operator explicitly opts in with `PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1`. This
 * blocks ambient env poisoning (a supply-chain attacker who sets PROGRAM_ID but not the opt-in
 * flag) while preserving the legitimate ability to point the SDK at a freshly-deployed program
 * during pre-deploy / devnet testing — which the allowlist alone would break.
 */
function programOverrideOptIn(): boolean {
  return safeEnv("PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE") === "1";
}

/**
 * Get the Percolator program ID for the current network
 * 
 * Priority:
 * 1. PROGRAM_ID env var (explicit override)
 * 2. Network-specific default (NETWORK env var)
 * 3. Devnet default (safest fallback — bug bounty PERC-697)
 */
export function getProgramId(network?: Network): PublicKey {
  // #249: an explicit `network` argument is authoritative and must NOT be silently
  // overridden by the PROGRAM_ID env var. The env override applies ONLY when the caller
  // did not specify a network (ambient/default resolution) — so e.g. getProgramId("mainnet")
  // always returns the canonical mainnet id regardless of a stale PROGRAM_ID env.
  if (network === undefined) {
    const override = safeEnv("PROGRAM_ID");
    if (override) {
      if (!KNOWN_PROGRAM_IDS.has(override) && !programOverrideOptIn()) {
        throw new Error(
          `[percolator-sdk] PROGRAM_ID env var "${override}" is not a known program address. ` +
          `Allowed values: ${[...KNOWN_PROGRAM_IDS].join(', ')}. ` +
          `Pass an explicit network argument, or set PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1 ` +
          `to intentionally allow an unlisted program (e.g. a fresh pre-deploy address).`,
        );
      }
      console.warn(`[percolator-sdk] PROGRAM_ID env override active: ${override}`);
      return new PublicKey(override);
    }
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
  // #249: explicit `network` is authoritative — env override applies only when unspecified.
  if (network === undefined) {
    const override = safeEnv("MATCHER_PROGRAM_ID");
    if (override) {
      if (!KNOWN_MATCHER_IDS.has(override) && !programOverrideOptIn()) {
        throw new Error(
          `[percolator-sdk] MATCHER_PROGRAM_ID env var "${override}" is not a known matcher program address. ` +
          `Allowed values: ${[...KNOWN_MATCHER_IDS].join(', ')}. ` +
          `Pass an explicit network argument, or set PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1 ` +
          `to intentionally allow an unlisted program (e.g. a fresh pre-deploy address).`,
        );
      }
      console.warn(`[percolator-sdk] MATCHER_PROGRAM_ID env override active: ${override}`);
      return new PublicKey(override);
    }
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
  const network = safeEnv("NETWORK")?.toLowerCase();
  if (network === "mainnet" || network === "mainnet-beta") {
    return "mainnet";
  }
  // devnet, testnet, or unset → devnet (fail-open to devnet, not mainnet)
  return "devnet";
}
