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
        readonly percolator: "DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj";
        readonly matcher: "4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT";
    };
    readonly mainnet: {
        readonly percolator: "ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv";
        readonly matcher: "GDK8wx38kpiSVSfGTVNiSdptX3Z5R4kQyqh6Q3QX6wmi";
    };
};
/**
 * v17 program IDs — fresh devnet triple, deployed + upgraded 2026-07-17,
 * hash-verified on-chain (wrapper + stake/vault + nft; matcher was already live
 * and upgraded in place at the same address).
 *
 * This supersedes the 2026-06-26 triple (wrapper 69VUZ7a2..., vault 51CeUNpb...,
 * nft 5TnritLt...). Those OLD addresses are STILL LIVE on devnet with ~152 existing
 * markets — they were not migrated in place, so anything still pointed at them
 * (e.g. the percolator-launch playground config, which hardcodes its own program
 * ID rather than reading this module) keeps working against the old markets until
 * it is explicitly cut over to this fresh triple. That playground cutover is a
 * separate, later step — NOT performed by this change.
 */
export declare const PROGRAM_IDS_V17: {
    /** v17 wrapper — deployed devnet 2026-07-17, hash-verified. */
    readonly percolator: "DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj";
    /** v17 matcher — deployed devnet 2026-06-26, unchanged (same address). */
    readonly matcher: "4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT";
    /** v17 nft — deployed devnet 2026-07-17, hash-verified. */
    readonly nft: "CNGBPZRALk9Xu8BdgWNyrLJ7daQ9eJYFf1GnEEC7YCU3";
    /** v17 vault — deployed devnet 2026-07-17, hash-verified. */
    readonly vault: "GCHhcgwPyrai8SWHEVWw3odedguFXEtJobNnWSfWBCU3";
};
/** The v17 wrapper PublicKey (devnet deployed + upgraded 2026-07-17, hash-verified). */
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
