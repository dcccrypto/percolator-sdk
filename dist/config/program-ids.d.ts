import { PublicKey } from "@solana/web3.js";
/**
 * Read an environment variable safely. Returns `undefined` in browser
 * environments where `process` is not defined, avoiding a
 * `ReferenceError` crash at import time.
 */
export declare function safeEnv(key: string): string | undefined;
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
export declare const PROGRAM_IDS: {
    readonly devnet: {
        readonly percolator: "FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD";
        readonly matcher: "4HcGCsyjAqnFua5ccuXyt8KRRQzKFbGTJkVChpS7Yfzy";
    };
    readonly mainnet: {
        readonly percolator: "ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv";
        readonly matcher: "GDK8wx38kpiSVSfGTVNiSdptX3Z5R4kQyqh6Q3QX6wmi";
    };
};
/**
 * v17 program IDs — fresh devnet triple, deployed + upgraded 2026-07-17,
 * hash-verified on-chain (re-verified 2026-08-13). Supersedes the 2026-06-26
 * triple (wrapper 69VUZ7a2…, vault 51CeUNpb…, nft 5TnritLt…), which remains live
 * on devnet with ~152 legacy markets but is NO LONGER the SDK default.
 *
 * Devnet addresses are canonical. Mainnet addresses are pending the mainnet
 * cutover (Phase 7 gate) — mainnet fields will be filled then.
 */
export declare const PROGRAM_IDS_V17: {
    /** v17 wrapper (percolator) — devnet live, deployed 2026-07-17, hash-verified. */
    readonly percolator: "DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj";
    /** v17 stake/vault — devnet live, deployed 2026-07-17, hash-verified. */
    readonly stake: "GCHhcgwPyrai8SWHEVWw3odedguFXEtJobNnWSfWBCU3";
    /** v17 matcher — devnet live, upgraded in place (same address as 2026-06-26). */
    readonly matcher: "4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT";
    /** v17 NFT — devnet live, deployed 2026-07-17, hash-verified. */
    readonly nft: "CNGBPZRALk9Xu8BdgWNyrLJ7daQ9eJYFf1GnEEC7YCU3";
};
/** True after canonical v17 addresses replaced placeholders (devnet deployed 2026-06-24). */
export declare const V17_PROGRAMS_DEPLOYED = true;
/** The v17 wrapper PublicKey. */
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
