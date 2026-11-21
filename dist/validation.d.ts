/**
 * Input validation utilities for CLI commands.
 * Provides descriptive error messages for invalid input.
 */
import { PublicKey } from "@solana/web3.js";
export declare class ValidationError extends Error {
    readonly field: string;
    constructor(field: string, message: string);
}
/**
 * Non-empty trimmed string of decimal digits only: `"0"` or `[1-9]\\d*` (no leading zeros
 * except a single zero). Rejects fractions, scientific notation, hex prefixes, and trailing junk.
 *
 * @param value - The string to validate.
 * @param field - The field name used in error messages.
 * @returns The trimmed, validated decimal string.
 */
export declare function requireDecimalUIntString(value: string, field: string): string;
/**
 * Parse a decimal integer string into a BigInt, rejecting any non-decimal representation
 * (hex, scientific notation, underscores, fractions, leading zeros).
 *
 * Use this instead of the bare `BigInt(val)` cast when the input is user-supplied or
 * externally-sourced, to prevent silent acceptance of `"0x1"`, `"1e5"`, `"1_000"` etc.
 *
 * @param val - The string to parse. May be negative (e.g. `"-42"`).
 * @param caller - The calling function name, used in the error message.
 * @returns The parsed BigInt value.
 * @throws {Error} When `val` does not match the strict decimal integer format.
 *
 * @example
 * safeBigInt("123", "encU64")          // 123n
 * safeBigInt("-9223372036854775808", "encI64")  // i64 min
 * safeBigInt("0x1", "encU64")          // throws
 * safeBigInt("1e5", "encU128")         // throws
 */
export declare function safeBigInt(val: string, caller: string): bigint;
/**
 * Validate a public key string.
 */
export declare function validatePublicKey(value: string, field: string): PublicKey;
/**
 * Validate a non-negative integer index (u16 range for accounts).
 */
export declare function validateIndex(value: string, field: string): number;
/**
 * Validate a non-negative amount (u64 range).
 */
export declare function validateAmount(value: string, field: string): bigint;
/**
 * Validate a u128 value.
 */
export declare function validateU128(value: string, field: string): bigint;
/**
 * Validate an i64 value.
 */
export declare function validateI64(value: string, field: string): bigint;
/**
 * Validate an i128 value (trade sizes).
 */
export declare function validateI128(value: string, field: string): bigint;
/**
 * Validate a basis points value (0-10000).
 */
export declare function validateBps(value: string, field: string): number;
/**
 * Validate a u64 value.
 */
export declare function validateU64(value: string, field: string): bigint;
/**
 * Validate a u16 value.
 */
export declare function validateU16(value: string, field: string): number;
/**
 * Guard for a JS `number` that is forwarded to an unsigned wire field: it must be a safe integer in `0..=max`.
 * Refuses NaN, fractions, negatives and values above 2^53-1 instead of letting the encoder wrap or truncate them.
 *
 * @param name  Field name for the error message.
 * @param v     Value to check.
 * @param max   Inclusive upper bound (default `Number.MAX_SAFE_INTEGER`).
 * @returns `v`, unchanged.
 * @throws If `v` is not a safe integer within `0..=max`.
 * @example
 * assertUintNumber("lamports", 2_039_280); // 2039280
 */
export declare function assertUintNumber(name: string, v: number, max?: number): number;
