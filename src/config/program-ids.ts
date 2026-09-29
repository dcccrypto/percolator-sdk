import { PublicKey } from "@solana/web3.js";

/**
 * Read an environment variable safely. Returns `undefined` in browser
 * environments where `process` is not defined, avoiding a
 * `ReferenceError` crash at import time.
 */
export function safeEnv(key: string): string | undefined {
  try {
    return typeof process !== "undefined" && process?.env
      ? process.env[key]
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Centralized PROGRAM_ID configuration
 * 
 * Default to environment variable, then fall back to network-specific defaults.
 * This prevents hard-coded program IDs scattered across the codebase.
 */

export const PROGRAM_IDS = {
  devnet: {
    // v18.3 fresh-ID redeploy (SDK 8.0.0): the devnet wrapper moves to a BRAND-NEW program
    // address (ETDLAdi…) running the byte-identical v18.2 wrapper, so no market/portfolio
    // created under the previous v18 wrapper (GnwdeQr…, ABANDONED; 2026-09-22 → 8.0.0) or
    // the v17 wrapper (DhSkE7u…, ABANDONED) is visible to this SDK. This is the ACTIVE
    // devnet wrapper id that getProgramId() / getProgramId("devnet") resolves and that PDA
    // derivation + tx targeting use. Neither abandoned id is in the env-override allowlist;
    // pin @percolatorct/sdk@7.0.0 to talk to GnwdeQr…. The matcher, stake/vault and nft
    // programs keep their addresses (stake/nft are upgraded in place to trust ETDLAdi…).
    percolator: "ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB",
    matcher: "4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT",
  },
  mainnet: {
    percolator: "ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv",
    matcher: "GDK8wx38kpiSVSfGTVNiSdptX3Z5R4kQyqh6Q3QX6wmi",
  },
} as const;
Object.freeze(PROGRAM_IDS.devnet);
Object.freeze(PROGRAM_IDS.mainnet);
Object.freeze(PROGRAM_IDS);

/**
 * Devnet program IDs, historically named "v17" — stake/vault + nft deployed 2026-07-17,
 * matcher live in place. As of the v18.3 fresh-ID redeploy (SDK 8.0.0) the
 * `percolator` (wrapper) member below has been CUT OVER to the fresh devnet wrapper
 * (ETDLAdi…; previously GnwdeQr… in SDK 6.x/7.x), so this object is a SINGLE SOURCE OF TRUTH with PROGRAM_IDS.devnet: both
 * resolve the same active wrapper. There is no longer a second, divergent wrapper id.
 *
 * @deprecated Prefer PROGRAM_IDS.devnet / getProgramId("devnet"). PROGRAM_IDS_V17 and
 * PROGRAM_ID_V17 are retained only for back-compat with consumers that still import them;
 * `percolator`/PROGRAM_ID_V17 now point at the ACTIVE devnet wrapper (ETDLAdi…), NOT the
 * abandoned v18.0–v18.2 wrapper (GnwdeQr…) or v17 wrapper (DhSkE7u…). The stake/vault (GCHhcgw…) and nft (CNGBPZR…) members are
 * NOT part of the wrapper-only cutover and remain the current devnet defaults consumed by
 * stake.ts / abi/nft.ts.
 *
 * (An earlier 2026-06-26 triple — wrapper 69VUZ7a2..., vault 51CeUNpb..., nft 5TnritLt... —
 * was superseded before this.)
 */
export const PROGRAM_IDS_V17 = {
  /** ACTIVE devnet wrapper (ETDLAdi…) — v18.3 fresh-ID cutover (SDK 8.0.0) from the
   *  abandoned GnwdeQr… (v18.0–v18.2) and DhSkE7u… (v17) wrappers. Kept in this "v17"-named object as a single source of truth with
   *  PROGRAM_IDS.devnet.percolator; @deprecated alias, prefer PROGRAM_IDS.devnet. */
  percolator: "ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB",
  /** v17 matcher — deployed devnet 2026-06-26, unchanged (same address). */
  matcher: "4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT",
  /** v17 nft — deployed devnet 2026-07-17, hash-verified. */
  nft: "CNGBPZRALk9Xu8BdgWNyrLJ7daQ9eJYFf1GnEEC7YCU3",
  /** v17 vault — deployed devnet 2026-07-17, hash-verified. */
  vault: "GCHhcgwPyrai8SWHEVWw3odedguFXEtJobNnWSfWBCU3",
} as const;
Object.freeze(PROGRAM_IDS_V17);

/**
 * The devnet wrapper PublicKey. As of the v18.3 fresh-ID cutover (SDK 8.0.0) this resolves to
 * the ACTIVE devnet wrapper (ETDLAdi…) — identical to getProgramId("devnet") — because
 * PROGRAM_IDS_V17.percolator was cut over. Retained (with its historical "V17" name) only for
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
]);

/** Allowlist of legitimate matcher program addresses (all networks). */
const KNOWN_MATCHER_IDS = new Set<string>([
  PROGRAM_IDS.devnet.matcher,
  PROGRAM_IDS.mainnet.matcher,
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
