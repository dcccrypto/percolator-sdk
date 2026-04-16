/**
 * Percolator program error definitions.
 * Each error includes a name and actionable guidance.
 */
interface ErrorInfo {
    name: string;
    hint: string;
}
export declare const PERCOLATOR_ERRORS: Record<number, ErrorInfo>;
/**
 * Decode a custom program error code to its info.
 */
export declare function decodeError(code: number): ErrorInfo | undefined;
/**
 * Get error name from code.
 */
export declare function getErrorName(code: number): string;
/**
 * Get actionable hint for error code.
 */
export declare function getErrorHint(code: number): string | undefined;
/**
 * Parse error from transaction logs.
 * Looks for "Program ... failed: custom program error: 0x..."
 *
 * Hex capture is bounded (1–8 digits) so pathological logs cannot feed unbounded
 * strings into `parseInt` or produce precision-loss codes above u32.
 */
export declare function parseErrorFromLogs(logs: string[]): {
    code: number;
    name: string;
    hint?: string;
} | null;
export {};
