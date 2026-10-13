/**
 * Percolator v17 program error definitions.
 *
 * Source: v16_program.rs PercolatorError enum (lines 174-226 in v17 wrapper).
 * Ordinals 0-29 = toly base errors; 30-41 = fork LP-vault; 42-46 = fork NFT/B-3;
 * 47-48 = insurance withdrawal policy (F-1/F-2); 49 = EngineInsufficientInitialMargin;
 * 50 = LpVaultDepositBelowMinimumLiquidity (N7 dead-share floor); 51 =
 * FeeSplitFloorViolation (creator/LP/insurance split floor, meaning narrowed to
 * tag 86 — see its entry); 52-53 = fee-collection split; 54-60 =
 * load_bound_stake_pool diagnostics; 61 = AssetSlotAlreadyConfigured;
 * 62 = CreatorFeeOverClaim (creator fee claim, tag 90 — NOT yet deployed).
 *
 * Ordinals 0-61 read directly off the PercolatorError enum in
 * percolator-prog@10acb5ae, which is the source deployed to devnet wrapper
 * DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj (hash-verified
 * 6b2fda2363352aba0ef88abde0d398f9dd477b1208507e7e8393586ed5458931).
 * Ordinal 49 is CONFIRMED against that enum; an earlier "discriminant
 * tentative" TODO here is resolved.
 *
 * INVARIANT: ordinals must NOT be reordered (Rust enum discriminants are
 * sequential from 0). CI asserts each ordinal in tests/v16_kani.rs.
 *
 * v17 breaking changes vs v12.x:
 *   - Errors 0-29 have completely different names and semantics from v12.
 *   - Errors 30-41 are LP-vault (moved from v12.x range 30-41 to same ordinals).
 *   - Errors 42-46 are NFT/B-3 (new in v17).
 *   - v12.x errors 28-65 are entirely removed.
 */
import type { PublicKey } from "@solana/web3.js";
export interface ErrorInfo {
    name: string;
    hint: string;
}
export declare const PERCOLATOR_ERRORS: Record<number, ErrorInfo>;
/**
 * Decode a custom program error code to its info.
 *
 * @param code Custom error code from `custom program error: 0x<hex>`.
 * @returns ErrorInfo with name and hint, or undefined if the code is not recognized.
 */
export declare function decodeError(code: number): ErrorInfo | undefined;
/**
 * Get error name from code.
 *
 * @param code Custom error code.
 * @returns Human-readable error name, or "Unknown(<code>)" if not recognized.
 */
export declare function getErrorName(code: number): string;
/**
 * Get actionable hint for error code.
 *
 * @param code Custom error code.
 * @returns Actionable hint string, or undefined if not recognized.
 */
export declare function getErrorHint(code: number): string | undefined;
/** Which program a custom error was attributed to. */
export type ErrorProgramKind = "wrapper" | "stake" | "nft" | "matcher" | "token" | "unknown";
/** Program ids to attribute errors to, in addition to the SDK's known deployments. */
export type ErrorProgramIds = Partial<Record<Exclude<ErrorProgramKind, "token" | "unknown">, readonly (PublicKey | string)[]>>;
/**
 * What the caller was doing, so a code with several meanings can get the right line.
 * `openLegs` is the number of open positions on the account (e.g. from parsePortfolioV17).
 */
export interface ErrorContext {
    action?: "trade" | "withdraw" | "deposit" | "resolve" | "other";
    openLegs?: number;
    /**
     * For `action: "resolve"` (tag 39): slots still to wait before the market can be resolved, or null when
     * permissionless resolve is disabled on the market. Take it from `staleResolveStatusV22(...).slotsRemaining`
     * (or pass `staleResolveErrorContextV22(status)` as the whole context).
     */
    staleSlotsRemaining?: bigint | number | null;
    /**
     * For `action: "trade"`: the trade is on a multi-asset market with a portfolio at >= 3 legs, where 19 means a
     * health certificate is not at the market's current epochs (Q-7; see buildMultiAssetTradeIxsV22).
     */
    healthCheckStale?: boolean;
}
/** Options for {@link parseErrorFromLogs}. */
export interface ParseErrorOptions {
    /** Extra program ids (fresh deployments, env overrides) to attribute by kind. */
    programIds?: ErrorProgramIds;
    /** Caller context for codes with several meanings (wrapper 9 and 19). */
    context?: ErrorContext;
}
/** A custom program error decoded from transaction logs. */
export interface ParsedProgramError {
    code: number;
    name: string;
    hint?: string;
    /** The program the failing log line names, decoded with that program's own error table. */
    program: ErrorProgramKind;
    /** Base58 id of the failing program, when the log line names one. */
    programId?: string;
}
/**
 * A hint for a wrapper error code that takes the caller's context into account. Codes with one meaning
 * return their table hint unchanged.
 *
 * @param code     Wrapper custom error code.
 * @param context  What the caller was doing (see {@link ErrorContext}).
 * @returns The hint, or undefined for an unknown code.
 * @example
 * ```ts
 * getContextualErrorHint(19, { action: "withdraw", openLegs: 1 });
 * // "Close your open positions first, then withdraw. ..."
 * getContextualErrorHint(9, { action: "trade" });
 * ```
 */
export declare function getContextualErrorHint(code: number, context?: ErrorContext): string | undefined;
/**
 * Parse a custom program error from transaction logs and attribute it to the program that failed.
 *
 * The FIRST `Program <id> failed: custom program error: 0x..` line is used (the innermost failing
 * program of a CPI chain). The id on that line selects the error table: the wrapper's
 * (PERCOLATOR_ERRORS), the stake program's (STAKE_ERRORS + STAKE_ERRORS_V5), the NFT program's
 * (NFT_ERRORS), the matcher's (MATCHER_V2_ERRORS) or SPL Token's. Ids are the SDK's known
 * deployments (devnet v2.2 / v1, mainnet) plus `opts.programIds`. A program the SDK does not know,
 * or a log line without an id, falls back to the wrapper table (the legacy behaviour) and is
 * reported as `program: "unknown"`.
 *
 * @param logs  Array of transaction log strings from the RPC response.
 * @param opts  Extra program ids and caller context (see {@link ParseErrorOptions}).
 * @returns Parsed error with code, name, hint and program — or null if none is found.
 *
 * @example
 * ```ts
 * const err = parseErrorFromLogs(sim.value.logs ?? [], { context: { action: "withdraw", openLegs: 1 } });
 * if (err) console.error(`${err.program} ${err.name}: ${err.hint}`);
 * ```
 */
export declare function parseErrorFromLogs(logs: string[], opts?: ParseErrorOptions): ParsedProgramError | null;
