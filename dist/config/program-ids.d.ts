import { PublicKey } from "@solana/web3.js";
/**
 * Read an environment variable safely. Returns `undefined` in browser
 * environments where `process` is not defined, avoiding a
 * `ReferenceError` crash at import time.
 */
export declare function safeEnv(key: string): string | undefined;
/**
 * Centralized PROGRAM_ID configuration
 *
 * Default to environment variable, then fall back to network-specific defaults.
 * This prevents hard-coded program IDs scattered across the codebase.
 */
export declare const PROGRAM_IDS: {
    readonly devnet: {
        readonly percolator: "6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM";
        readonly matcher: "AsHvEJ8zNctKmdeS57H5E4w6nkTLi3bPVpd6ZCLc2ayN";
    };
    readonly mainnet: {
        readonly percolator: "ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv";
        readonly matcher: "GDK8wx38kpiSVSfGTVNiSdptX3Z5R4kQyqh6Q3QX6wmi";
    };
};
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
export declare const PROGRAM_IDS_DEVNET_V22: {
    /** v2.2 devnet wrapper (engine 3ce4cbd1 inside). */
    readonly percolator: "6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM";
    /** v2.2 devnet matcher (percolator-match 2b08537a) — the wrapper's canonical vault-LP matcher. */
    readonly matcher: "AsHvEJ8zNctKmdeS57H5E4w6nkTLi3bPVpd6ZCLc2ayN";
    /** v2.2 devnet nft program. */
    readonly nft: "27LWmR72Ru1NCkbN2xgxB7BgYcTUrU7qeEJoV3D8sZh1";
    /** v2.2 devnet stake/vault program (v5) — the v2.2 wrapper's pinned STAKE_PROGRAM_ID. */
    readonly vault: "7JrgAUHi4PxaRv5JKHoGAxodDFbozYexpERei66Xgq4V";
};
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
export declare const PROGRAM_IDS_V17: {
    /** v2.2 devnet wrapper (engine 3ce4cbd1 inside). */
    readonly percolator: "6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM";
    /** v2.2 devnet matcher (percolator-match 2b08537a) — the wrapper's canonical vault-LP matcher. */
    readonly matcher: "AsHvEJ8zNctKmdeS57H5E4w6nkTLi3bPVpd6ZCLc2ayN";
    /** v2.2 devnet nft program. */
    readonly nft: "27LWmR72Ru1NCkbN2xgxB7BgYcTUrU7qeEJoV3D8sZh1";
    /** v2.2 devnet stake/vault program (v5) — the v2.2 wrapper's pinned STAKE_PROGRAM_ID. */
    readonly vault: "7JrgAUHi4PxaRv5JKHoGAxodDFbozYexpERei66Xgq4V";
};
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
export declare const PROGRAM_IDS_DEVNET_V1: {
    /** v1 (close-only) devnet wrapper. */
    readonly percolator: "ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB";
    /** v1 (close-only) devnet matcher — the v1 wrapper's canonical vault-LP matcher. */
    readonly matcher: "EDKKgRaVHna6FCxiY1kgMzegD9rpaN1nwJNSzAzeBUBX";
    /** v1 (close-only) devnet nft program. */
    readonly nft: "EMYT15LZWaP7Mmmm245kQPbrTyVjG16yZiU9kfNTF3GZ";
    /** v1 (close-only) devnet stake/vault program — the v1 wrapper's pinned STAKE_PROGRAM_ID. */
    readonly vault: "VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w";
};
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
export declare const NFT_PROGRAM_IDS: {
    readonly devnet: "27LWmR72Ru1NCkbN2xgxB7BgYcTUrU7qeEJoV3D8sZh1";
    readonly mainnet: "FqhKJT9gtScjrmfUuRMjeg7cXNpif1fqsy5Jh65tJmTS";
};
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
