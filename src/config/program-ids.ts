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
 * Centralized PROGRAM_ID configuration — LEGACY (non-v17) deployed addresses.
 *
 * Default to environment variable, then fall back to network-specific defaults.
 * This prevents hard-coded program IDs scattered across the codebase.
 *
 * @deprecated Do NOT pair these IDs with v17 encoders. They point at the
 * currently-deployed non-v17 programs, which cannot decode v17 instruction
 * payloads. `getProgramId()`/`getMatcherProgramId()` fail closed while
 * `V17_PROGRAMS_DEPLOYED === false`; reading this constant directly bypasses
 * that guard. Use `getProgramId()` / `PROGRAM_IDS_V17` instead, and only read
 * these raw addresses for explicitly-legacy (pre-cutover) tooling.
 */

export const PROGRAM_IDS = {
  devnet: {
    percolator: "FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD",
    matcher: "4HcGCsyjAqnFua5ccuXyt8KRRQzKFbGTJkVChpS7Yfzy",
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
 * v17 program IDs — placeholder until the v17 converged program is deployed.
 *
 * The v17 program uses `declare_id!("Perco1ator111111111111111111111111111111111")`
 * in its source. This will be replaced with the real on-chain address when deployed.
 *
 * v17 converged programs are NOT deployed (cutover is Phase 7 gate).
 */
export const PROGRAM_IDS_V17 = {
  /** v17 wrapper placeholder (declare_id! value from v16_program.rs). */
  percolator: "Perco1ator111111111111111111111111111111111",
  /** v17 stake placeholder. */
  stake: "Per5taTe111111111111111111111111111111111111",
} as const;
Object.freeze(PROGRAM_IDS_V17);

/** True only after canonical v17 wrapper IDs have replaced the placeholders above. */
export const V17_PROGRAMS_DEPLOYED = false;

/** The v17 wrapper placeholder PublicKey. Use only before mainnet cutover. */
export const PROGRAM_ID_V17 = new PublicKey(PROGRAM_IDS_V17.percolator);

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
  // #249: an explicit `network` argument is authoritative and must NOT be silently
  // overridden by the PROGRAM_ID env var. The env override applies ONLY when the caller
  // did not specify a network (ambient/default resolution) — so e.g. getProgramId("mainnet")
  // always returns the canonical mainnet id regardless of a stale PROGRAM_ID env.
  if (network === undefined) {
    const override = safeEnv("PROGRAM_ID");
    if (override) {
      console.warn(
        `[percolator-sdk] PROGRAM_ID env override active: ${override} — ensure this points to a trusted program`,
      );
      return new PublicKey(override);
    }
  }

  // Use provided network or detect from env — default to devnet (never mainnet silently)
  const detectedNetwork = getCurrentNetwork();
  const targetNetwork = network ?? detectedNetwork;
  if (!V17_PROGRAMS_DEPLOYED) {
    throw new Error(
      `Percolator v17 program is not deployed for ${targetNetwork}; refusing to return a legacy program ID for v17 SDK encoders. Set PROGRAM_ID to an explicitly trusted v17 deployment to override ambient resolution.`,
    );
  }
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
      console.warn(
        `[percolator-sdk] MATCHER_PROGRAM_ID env override active: ${override} — ensure this points to a trusted program`,
      );
      return new PublicKey(override);
    }
  }

  // Use provided network or detect from env — default to devnet (never mainnet silently)
  const detectedNetwork = getCurrentNetwork();
  const targetNetwork = network ?? detectedNetwork;
  if (!V17_PROGRAMS_DEPLOYED) {
    throw new Error(
      `Percolator v17 matcher program is not deployed for ${targetNetwork}; refusing to return a legacy matcher program ID for v17 SDK encoders. Set MATCHER_PROGRAM_ID to an explicitly trusted v17 deployment to override ambient resolution.`,
    );
  }
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
