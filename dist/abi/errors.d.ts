/**
 * Percolator v17 program error definitions.
 *
 * Source: v16_program.rs PercolatorError enum (lines 174-226 in v17 wrapper).
 * Ordinals 0-29 = toly base errors; 30-41 = fork LP-vault; 42-46 = fork NFT/B-3;
 * 47-48 = insurance withdrawal policy (F-1/F-2); 49 = EngineInsufficientInitialMargin
 * (discriminant tentative — TODO: confirm once percolator-anchor ships it).
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
/**
 * Parse a custom program error from transaction logs.
 *
 * Looks for "Program ... failed: custom program error: 0x..." in the log lines.
 * Returns null if no custom error is found.
 *
 * @param logs Array of transaction log strings from the RPC response.
 * @returns Parsed error with code, name, and hint — or null if not found.
 *
 * @example
 * ```ts
 * const err = parseErrorFromLogs(txResult.meta?.logMessages ?? []);
 * if (err) console.error(`${err.name}: ${err.hint}`);
 * ```
 */
export declare function parseErrorFromLogs(logs: string[]): {
    code: number;
    name: string;
    hint?: string;
} | null;
