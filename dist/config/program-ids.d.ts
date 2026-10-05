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
        readonly percolator: "5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe";
        readonly matcher: "DfTxJUT5BbERs1tR33dP82kaUJ1NLymRxXErXAYXcDam";
    };
    readonly mainnet: {
        readonly percolator: "ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv";
        readonly matcher: "GDK8wx38kpiSVSfGTVNiSdptX3Z5R4kQyqh6Q3QX6wmi";
    };
};
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
export declare const PROGRAM_IDS_V17: {
    /** ACTIVE devnet wrapper (5NGgnU2j…) — v2.1 fresh-ID deploy (SDK 9.0.0). Single source of
     *  truth with PROGRAM_IDS.devnet.percolator; @deprecated alias, prefer PROGRAM_IDS.devnet. */
    readonly percolator: "5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe";
    /** v2.1 matcher — fresh devnet address (SDK 9.0.0). */
    readonly matcher: "DfTxJUT5BbERs1tR33dP82kaUJ1NLymRxXErXAYXcDam";
    /** v2.1 nft — fresh devnet address (SDK 9.0.0). */
    readonly nft: "DWUNq2iYh6Sdgdv3qv7aWJNJGhoK25FqyQrqDUrDD9zs";
    /** v2.1 stake/vault — fresh devnet address (SDK 9.0.0); the wrapper's pinned STAKE_PROGRAM_ID. */
    readonly vault: "A6DVNubvzMMETQinK6bipekkaTTrkUu2RMw2kBoJrdkE";
};
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
 * The devnet wrapper PublicKey. As of the v2.1 fresh-ID deploy (SDK 9.0.0) this resolves to
 * the ACTIVE devnet wrapper (5NGgnU2j…) — identical to getProgramId("devnet") — because
 * PROGRAM_IDS_V17.percolator was cut over. Retained (with its historical "V17" name) only for
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
