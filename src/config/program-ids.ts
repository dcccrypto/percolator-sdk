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
 * v17 program IDs — live devnet addresses deployed 2026-06-24.
 *
 * Devnet addresses are canonical. Mainnet addresses are pending the mainnet
 * cutover (Phase 7 gate) — mainnet fields will be filled then.
 */
export const PROGRAM_IDS_V17 = {
  /** v17 wrapper (percolator) — devnet live. */
  percolator: "69VUZ7a2BeXBTpRRManLamF5UWTaNR9B1hy5Se3cdXy9",
  /** v17 stake/vault — devnet live. */
  stake: "51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ",
  /** v17 matcher — devnet live. */
  matcher: "4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT",
  /** v17 NFT — devnet live. */
  nft: "5TnritLtHS76s5iV8axqDmqhcmJKMRUekMGrk9rBTqSP",
} as const;
Object.freeze(PROGRAM_IDS_V17);

/** True after canonical v17 addresses replaced placeholders (devnet deployed 2026-06-24). */
export const V17_PROGRAMS_DEPLOYED = true;

/** The v17 wrapper PublicKey. */
export const PROGRAM_ID_V17 = new PublicKey(PROGRAM_IDS_V17.percolator);

export type Network = "devnet" | "mainnet";

/** Allowlist of legitimate percolator program addresses (all networks). */
const KNOWN_PROGRAM_IDS = new Set<string>([
  PROGRAM_IDS.devnet.percolator,
  PROGRAM_IDS.mainnet.percolator,
  PROGRAM_IDS_V17.percolator,
  PROGRAM_IDS_V17.stake,
  PROGRAM_IDS_V17.nft,
]);

/** Allowlist of legitimate matcher program addresses (all networks). */
const KNOWN_MATCHER_IDS = new Set<string>([
  PROGRAM_IDS.devnet.matcher,
  PROGRAM_IDS.mainnet.matcher,
  PROGRAM_IDS_V17.matcher,
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

  if (V17_PROGRAMS_DEPLOYED) {
    if (targetNetwork === "devnet") {
      return new PublicKey(PROGRAM_IDS_V17.percolator);
    }
    // Mainnet cutover not yet done — fail closed to prevent sending v17 instructions
    // to the legacy mainnet program.
    throw new Error(
      `Percolator v17 program is not deployed on mainnet yet; cutover is pending. ` +
      `Set PROGRAM_ID to an explicitly trusted mainnet v17 deployment to override.`,
    );
  }

  // V17_PROGRAMS_DEPLOYED === false (should not be reachable given the flag is true above,
  // but kept as a safety net for future flag resets during testing).
  throw new Error(
    `Percolator v17 program is not deployed for ${targetNetwork}; refusing to return a legacy program ID for v17 SDK encoders. Set PROGRAM_ID to an explicitly trusted v17 deployment to override ambient resolution.`,
  );
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

  if (V17_PROGRAMS_DEPLOYED) {
    if (targetNetwork === "devnet") {
      return new PublicKey(PROGRAM_IDS_V17.matcher);
    }
    // Mainnet cutover not yet done.
    throw new Error(
      `Percolator v17 matcher program is not deployed on mainnet yet; cutover is pending. ` +
      `Set MATCHER_PROGRAM_ID to an explicitly trusted mainnet v17 deployment to override.`,
    );
  }

  // V17_PROGRAMS_DEPLOYED === false safety net.
  throw new Error(
    `Percolator v17 matcher program is not deployed for ${targetNetwork}; refusing to return a legacy matcher program ID for v17 SDK encoders. Set MATCHER_PROGRAM_ID to an explicitly trusted v17 deployment to override ambient resolution.`,
  );
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
