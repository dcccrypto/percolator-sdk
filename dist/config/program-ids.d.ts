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
        readonly percolator: "GnwdeQrAh4qzChJeVLrM21CXXWC1akjLH3DiijwzEEYZ";
        readonly matcher: "4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT";
    };
    readonly mainnet: {
        readonly percolator: "ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv";
        readonly matcher: "GDK8wx38kpiSVSfGTVNiSdptX3Z5R4kQyqh6Q3QX6wmi";
    };
};
/**
 * Devnet program IDs, historically named "v17" — stake/vault + nft deployed 2026-07-17,
 * matcher live in place. As of the v18 coordinated fresh-ID redeploy (2026-09-22) the
 * `percolator` (wrapper) member below has been CUT OVER to the fresh v18 devnet wrapper
 * (GnwdeQr…), so this object is a SINGLE SOURCE OF TRUTH with PROGRAM_IDS.devnet: both
 * resolve the same active wrapper. There is no longer a second, divergent wrapper id.
 *
 * @deprecated Prefer PROGRAM_IDS.devnet / getProgramId("devnet"). PROGRAM_IDS_V17 and
 * PROGRAM_ID_V17 are retained only for back-compat with consumers that still import them;
 * `percolator`/PROGRAM_ID_V17 now point at the ACTIVE v18 devnet wrapper (GnwdeQr…), NOT the
 * abandoned v17 wrapper (DhSkE7u…). The stake/vault (GCHhcgw…) and nft (CNGBPZR…) members are
 * NOT part of the wrapper-only cutover and remain the current devnet defaults consumed by
 * stake.ts / abi/nft.ts.
 *
 * (An earlier 2026-06-26 triple — wrapper 69VUZ7a2..., vault 51CeUNpb..., nft 5TnritLt... —
 * was superseded before this.)
 */
export declare const PROGRAM_IDS_V17: {
    /** ACTIVE v18 devnet wrapper (GnwdeQr…) — cut over 2026-09-22 from the abandoned v17
     *  wrapper (DhSkE7u…). Kept in this "v17"-named object as a single source of truth with
     *  PROGRAM_IDS.devnet.percolator; @deprecated alias, prefer PROGRAM_IDS.devnet. */
    readonly percolator: "GnwdeQrAh4qzChJeVLrM21CXXWC1akjLH3DiijwzEEYZ";
    /** v17 matcher — deployed devnet 2026-06-26, unchanged (same address). */
    readonly matcher: "4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT";
    /** v17 nft — deployed devnet 2026-07-17, hash-verified. */
    readonly nft: "CNGBPZRALk9Xu8BdgWNyrLJ7daQ9eJYFf1GnEEC7YCU3";
    /** v17 vault — deployed devnet 2026-07-17, hash-verified. */
    readonly vault: "GCHhcgwPyrai8SWHEVWw3odedguFXEtJobNnWSfWBCU3";
};
/**
 * The devnet wrapper PublicKey. As of the v18 fresh-ID cutover (2026-09-22) this resolves to
 * the ACTIVE v18 devnet wrapper (GnwdeQr…) — identical to getProgramId("devnet") — because
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
