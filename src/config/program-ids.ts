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
    // v2.2 (SDK 9.0.0-candidate, Q-5 2026-10-11): the devnet defaults are the FRESH v2.2 test
    // deployment (2026-10-10, byte-verified against the reviewed RC builds) — see
    // PROGRAM_IDS_DEVNET_V22. The earlier v2.1 RC ids (5NGgnU2j… / DfTxJUT5… / DWUNq2iY… /
    // A6DVNubv…) were NEVER deployed; defaulting to them made every default-derived PDA and tx
    // target a program that does not exist. This is the ACTIVE devnet set that getProgramId() /
    // getProgramId("devnet") resolves. The ETDLAdi… world (SDK 8.x) stays LIVE as "v1 /
    // close-only": its ids are exported as PROGRAM_IDS_DEVNET_V1 — pass them explicitly.
    // Older abandoned wrappers (GnwdeQr…, DhSkE7u…) remain outside every allowlist.
    percolator: "6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM",
    matcher: "AsHvEJ8zNctKmdeS57H5E4w6nkTLi3bPVpd6ZCLc2ayN",
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
 * The v2.2 fresh devnet deployment (2026-10-10, ~05:04-05:08Z): the ONLY deployed programs that
 * speak this SDK's v2.2 wire. Byte-verified against the reviewed builds (QA handoff §3):
 *   wrapper `6kpg2wi7…` = percolator-prog devnet/v22-fresh-ids 81ed7fdf (RC 6c078a0e + the two
 *   pinned ids below), stake `7JrgAUHi…` = percolator-stake 75aac97 (RC aebbff6 + ids), nft
 *   `27LWmR72…` = percolator-nft b257417, matcher `AsHvEJ8z…` = percolator-match 2b08537a.
 * The wrapper pins `vault` as its STAKE_PROGRAM_ID and `matcher` as its
 * CANONICAL_VAULT_LP_MATCHER_PROGRAM, so the four ids move together.
 *
 * v2.2 does not ship (test deployment only). When v2.2 gets its release ids, change this one
 * object; every default below derives from it.
 *
 * @example
 * ```ts
 * import { PublicKey } from "@solana/web3.js";
 * import { PROGRAM_IDS_DEVNET_V22 } from "@percolatorct/sdk";
 * const wrapper = new PublicKey(PROGRAM_IDS_DEVNET_V22.percolator); // 6kpg2wi7…
 * ```
 */
export const PROGRAM_IDS_DEVNET_V22 = {
  /** v2.2 devnet wrapper (engine 3ce4cbd1 inside). */
  percolator: "6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM",
  /** v2.2 devnet matcher (percolator-match 2b08537a) — the wrapper's canonical vault-LP matcher. */
  matcher: "AsHvEJ8zNctKmdeS57H5E4w6nkTLi3bPVpd6ZCLc2ayN",
  /** v2.2 devnet nft program. */
  nft: "27LWmR72Ru1NCkbN2xgxB7BgYcTUrU7qeEJoV3D8sZh1",
  /** v2.2 devnet stake/vault program (v5) — the v2.2 wrapper's pinned STAKE_PROGRAM_ID. */
  vault: "7JrgAUHi4PxaRv5JKHoGAxodDFbozYexpERei66Xgq4V",
} as const;
Object.freeze(PROGRAM_IDS_DEVNET_V22);

/**
 * Devnet program IDs, historically named "v17". In SDK 9.0.0-candidate every member points at
 * the v2.2 fresh devnet set ({@link PROGRAM_IDS_DEVNET_V22}), so this object is a SINGLE SOURCE
 * OF TRUTH with PROGRAM_IDS.devnet and is the devnet default consumed by stake.ts / abi/nft.ts.
 *
 * The all-fresh relaunch set (SDK 8.x: ETDLAdi… / EDKKgRaV… / EMYT15LZ… / VmpVUArR…) stays live
 * as "v1 / close-only" and is exported as {@link PROGRAM_IDS_DEVNET_V1}. The v2.1 RC set
 * (5NGgnU2j… / DfTxJUT5… / DWUNq2iY… / A6DVNubv…) was never deployed and is no longer accepted.
 *
 * @deprecated Prefer PROGRAM_IDS.devnet / getProgramId("devnet") / PROGRAM_IDS_DEVNET_V22.
 * PROGRAM_IDS_V17 and PROGRAM_ID_V17 are retained only for back-compat.
 */
export const PROGRAM_IDS_V17 = PROGRAM_IDS_DEVNET_V22;

/**
 * LEGACY devnet "v1 / close-only" program-ID set — the ETDLAdi… world that was the active
 * devnet set in SDK 8.x (all-fresh relaunch, 2026-09-30). It stays deployed after the v2.1
 * cutover so users can close positions and withdraw; new markets are created only
 * on the v2.2 set ({@link PROGRAM_IDS_DEVNET_V22} / {@link PROGRAM_IDS}.devnet).
 *
 * Nothing in the SDK defaults to these ids. Pass them explicitly (e.g. as `programId`,
 * `matcherProgram`, `stakeProgram`) when reading or closing a v1 market. The v1 wrapper,
 * matcher, stake and nft ids are accepted by the corresponding env-override allowlists.
 * v1 markets are VERSION 18; the v2.2 decoders refuse them by VERSION, so use SDK 8.x for v1
 * state you need decoded.
 *
 * @example
 * ```ts
 * import { PublicKey } from "@solana/web3.js";
 * import { PROGRAM_IDS_DEVNET_V1, getProgramId } from "@percolatorct/sdk";
 *
 * const v1Wrapper = new PublicKey(PROGRAM_IDS_DEVNET_V1.percolator); // ETDLAdi…
 * const v22Wrapper = getProgramId("devnet");                          // 6kpg2wi7…
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
 * Known percolator-nft program addresses per network. devnet = the v2.2 fresh NFT (27LWmR72…);
 * mainnet = FqhKJT9g…. `abi/nft.ts` builds its NFT_PROGRAM_ID allowlist from this (plus the v1
 * close-only id).
 *
 * @example
 * ```ts
 * new PublicKey(NFT_PROGRAM_IDS.devnet); // 27LWmR72…
 * ```
 */
export const NFT_PROGRAM_IDS = {
  devnet: PROGRAM_IDS_DEVNET_V22.nft,
  mainnet: "FqhKJT9gtScjrmfUuRMjeg7cXNpif1fqsy5Jh65tJmTS",
} as const;
Object.freeze(NFT_PROGRAM_IDS);

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
