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
 * v17 program IDs — placeholder until the v17 converged program is deployed.
 *
 * The v17 program uses `declare_id!("Perco1ator111111111111111111111111111111111")`
 * in its source. This will be replaced with the real on-chain address when deployed.
 *
 * v17 converged programs are NOT deployed (cutover is Phase 7 gate).
 */
export declare const PROGRAM_IDS_V17: {
    /** v17 wrapper placeholder (declare_id! value from v16_program.rs). */
    readonly percolator: "Perco1ator111111111111111111111111111111111";
    /** v17 stake placeholder. */
    readonly stake: "Per5taTe111111111111111111111111111111111111";
};
/** True only after canonical v17 wrapper IDs have replaced the placeholders above. */
export declare const V17_PROGRAMS_DEPLOYED = false;
/** The v17 wrapper placeholder PublicKey. Use only before mainnet cutover. */
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
