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
    // v2.1 fresh-ID deploy (SDK 9.0.0, decided 2026-10-05, "mode ii"): the devnet wrapper and
    // matcher move to BRAND-NEW program addresses (5NGgnU2j… / DfTxJUT5…), and stake/nft move
    // with them (see PROGRAM_IDS_V17). This is the ACTIVE devnet set that getProgramId() /
    // getProgramId("devnet") resolves and that PDA derivation + tx targeting use. The previous
    // ETDLAdi… world (SDK 8.x) stays LIVE as "v1 / close-only" so users can exit: its four ids
    // are exported as PROGRAM_IDS_DEVNET_V1 — pass them explicitly to read/close v1 markets.
    // Older abandoned wrappers (GnwdeQr…, DhSkE7u…) remain outside every allowlist.
    percolator: "5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe",
    matcher: "DfTxJUT5BbERs1tR33dP82kaUJ1NLymRxXErXAYXcDam",
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
 * Devnet program IDs, historically named "v17". As of the v2.1 fresh-ID deploy (SDK 9.0.0)
 * every member points at the v2.1 devnet set — wrapper 5NGgnU2j…, matcher DfTxJUT5…,
 * nft DWUNq2iY…, stake/vault A6DVNubv… — so this object is a SINGLE SOURCE OF TRUTH with
 * PROGRAM_IDS.devnet (same wrapper, same matcher) and is the devnet default consumed by
 * stake.ts / abi/nft.ts.
 *
 * The previous all-fresh relaunch set (SDK 8.x: ETDLAdi… / EDKKgRaV… / EMYT15LZ… /
 * VmpVUArR…) is NOT abandoned — it stays live as "v1 / close-only" and is exported as
 * {@link PROGRAM_IDS_DEVNET_V1}.
 *
 * @deprecated Prefer PROGRAM_IDS.devnet / getProgramId("devnet"). PROGRAM_IDS_V17 and
 * PROGRAM_ID_V17 are retained only for back-compat with consumers that still import them.
 *
 * (Earlier sets — GnwdeQr… world (matcher 4seJWjv3…, stake GCHhcgw…, nft CNGBPZR…), the
 * v17 DhSkE7u… wrapper, and the 2026-06-26 triple 69VUZ7a2… / 51CeUNpb… / 5TnritLt… — are
 * superseded; pin @percolatorct/sdk@7.0.0 for the GnwdeQr world.)
 */
export const PROGRAM_IDS_V17 = {
  /** ACTIVE devnet wrapper (5NGgnU2j…) — v2.1 fresh-ID deploy (SDK 9.0.0). Single source of
   *  truth with PROGRAM_IDS.devnet.percolator; @deprecated alias, prefer PROGRAM_IDS.devnet. */
  percolator: "5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe",
  /** v2.1 matcher — fresh devnet address (SDK 9.0.0). */
  matcher: "DfTxJUT5BbERs1tR33dP82kaUJ1NLymRxXErXAYXcDam",
  /** v2.1 nft — fresh devnet address (SDK 9.0.0). */
  nft: "DWUNq2iYh6Sdgdv3qv7aWJNJGhoK25FqyQrqDUrDD9zs",
  /** v2.1 stake/vault — fresh devnet address (SDK 9.0.0); the wrapper's pinned STAKE_PROGRAM_ID. */
  vault: "A6DVNubvzMMETQinK6bipekkaTTrkUu2RMw2kBoJrdkE",
} as const;
Object.freeze(PROGRAM_IDS_V17);

/**
 * LEGACY devnet "v1 / close-only" program-ID set — the ETDLAdi… world that was the active
 * devnet set in SDK 8.x (all-fresh relaunch, 2026-09-30). It stays deployed after the v2.1
 * fresh-ID cutover so users can close positions and withdraw; new markets are created only
 * on the v2.1 set ({@link PROGRAM_IDS_V17} / {@link PROGRAM_IDS}.devnet).
 *
 * Nothing in the SDK defaults to these ids. Pass them explicitly (e.g. as `programId`,
 * `matcherProgram`, `stakeProgram`) when reading or closing a v1 market. The v1 wrapper,
 * matcher, stake and nft ids are accepted by the corresponding env-override allowlists.
 *
 * The wire format is unchanged between v1 and v2.1 for every instruction this SDK encodes
 * against both; only the program addresses differ.
 *
 * @example
 * ```ts
 * import { PublicKey } from "@solana/web3.js";
 * import { PROGRAM_IDS_DEVNET_V1, getProgramId } from "@percolatorct/sdk";
 *
 * const v1Wrapper = new PublicKey(PROGRAM_IDS_DEVNET_V1.percolator); // ETDLAdi…
 * const v21Wrapper = getProgramId("devnet");                          // 5NGgnU2j…
 * ```
 */
export const PROGRAM_IDS_DEVNET_V1 = {
  /** v1 (close-only) devnet wrapper. */
  percolator: "ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB",
  /** v1 (close-only) devnet matcher — the v1 wrapper's canonical vault-LP matcher. */
  matcher: "EDKKgRaVHna6FCxiY1kgMzegD9rpaN1nwJNSzAzeBUBX",
  /** v1 (close-only) devnet nft program. */
  nft: "EMYT15LZWaP7Mmmm245kQPbrTyVjG16yZiU9kfNTF3GZ",
  /** v1 (close-only) devnet stake/vault program — the v1 wrapper's pinned STAKE_PROGRAM_ID. */
  vault: "VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w",
} as const;
Object.freeze(PROGRAM_IDS_DEVNET_V1);

/**
 * The devnet wrapper PublicKey. As of the v2.1 fresh-ID deploy (SDK 9.0.0) this resolves to
 * the ACTIVE devnet wrapper (5NGgnU2j…) — identical to getProgramId("devnet") — because
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
