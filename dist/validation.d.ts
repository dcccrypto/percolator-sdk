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
