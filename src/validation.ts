/**
 * Input validation utilities for CLI commands.
 * Provides descriptive error messages for invalid input.
 */

import { PublicKey } from "@solana/web3.js";

// Constants for numeric limits
const U16_MAX = 65535;
const U64_MAX = BigInt("18446744073709551615");
const I64_MIN = BigInt("-9223372036854775808");
const I64_MAX = BigInt("9223372036854775807");
const U128_MAX = (1n << 128n) - 1n;
const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(`Invalid ${field}: ${message}`);
    this.name = "ValidationError";
  }
}

/**
 * Regex that accepts a non-negative decimal integer string: `"0"` or `[1-9]\d*`.
 * Rejects fractions, scientific notation, hex prefixes, leading zeros, and trailing junk.
 */
const DECIMAL_UINT_RE = /^(0|[1-9]\d*)$/;

/**
 * Regex that accepts a decimal integer string (optionally negative): `-?(0|[1-9]\d*)`.
 * Rejects fractions, scientific notation, hex prefixes, and trailing junk.
 */
const DECIMAL_INT_RE = /^-?(0|[1-9]\d*)$/;

/**
 * Fast path: if `t` (already trimmed) is a canonical non-negative decimal integer
 * (`0` or `[1-9]\d*`, same language as DECIMAL_UINT_RE) return its bigint value,
 * else `undefined` so callers fall back to the original (error-producing) slow path.
 */
function fastUInt(t: string): bigint | undefined {
  const n = t.length;
  if (n === 0) return undefined;
  const c0 = t.charCodeAt(0);
  if (c0 < 48 || c0 > 57 || (c0 === 48 && n > 1)) return undefined;
  if (n <= 15) {
    let acc = c0 - 48;
    for (let i = 1; i < n; i++) {
      const c = t.charCodeAt(i);
      if (c < 48 || c > 57) return undefined;
      acc = acc * 10 + (c - 48);
    }
    return BigInt(acc);
  }
  for (let i = 1; i < n; i++) {
    const c = t.charCodeAt(i);
    if (c < 48 || c > 57) return undefined;
  }
  return BigInt(t);
}

/** Same as fastUInt but for small values: returns a number, or undefined (not canonical or > 15 digits). */
function fastSmallUInt(t: string): number | undefined {
  const n = t.length;
  if (n === 0 || n > 15) return undefined;
  const c0 = t.charCodeAt(0);
  if (c0 < 48 || c0 > 57 || (c0 === 48 && n > 1)) return undefined;
  let acc = c0 - 48;
  for (let i = 1; i < n; i++) {
    const c = t.charCodeAt(i);
    if (c < 48 || c > 57) return undefined;
    acc = acc * 10 + (c - 48);
  }
  return acc;
}

/** Fast path for optionally-negative canonical decimal integers (DECIMAL_INT_RE). */
function fastInt(t: string): bigint | undefined {
  if (t.charCodeAt(0) === 45) {
    const m = fastUInt(t.slice(1));
    return m === undefined ? undefined : -m;
  }
  return fastUInt(t);
}

/**
 * Non-empty trimmed string of decimal digits only: `"0"` or `[1-9]\\d*` (no leading zeros
 * except a single zero). Rejects fractions, scientific notation, hex prefixes, and trailing junk.
 *
 * @param value - The string to validate.
 * @param field - The field name used in error messages.
 * @returns The trimmed, validated decimal string.
 */
export function requireDecimalUIntString(value: string, field: string): string {
  const t = value.trim();
  if (t === "") {
    throw new ValidationError(field, `"${value}" is not a valid number`);
  }
  if (!DECIMAL_UINT_RE.test(t)) {
    throw new ValidationError(
      field,
      `"${value}" is not a valid non-negative integer (use decimal digits only, e.g. 123).`
    );
  }
  return t;
}

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
export function safeBigInt(val: string, caller: string): bigint {
  const t = val.trim();
  const fast = fastInt(t);
  if (fast !== undefined) return fast;
  if (!DECIMAL_INT_RE.test(t)) {
    throw new Error(
      `${caller}: "${val}" is not a valid decimal integer ` +
        `(use plain decimal digits, e.g. 123 or -42; no hex, scientific notation, or underscores).`
    );
  }
  return BigInt(t);
}

/**
 * Validate a public key string.
 */
export function validatePublicKey(value: string, field: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new ValidationError(
      field,
      `"${value}" is not a valid base58 public key. ` +
        `Example: "11111111111111111111111111111111"`
    );
  }
}

/**
 * Validate a non-negative integer index (u16 range for accounts).
 */
export function validateIndex(value: string, field: string): number {
  const t = value.trim();
  const small = fastSmallUInt(t);
  if (small !== undefined && small <= U16_MAX) return small;
  requireDecimalUIntString(value, field);
  const bi = BigInt(t);
  if (bi > BigInt(U16_MAX)) {
    throw new ValidationError(
      field,
      `must be <= ${U16_MAX} (u16 max), got ${t}`
    );
  }
  return Number(bi);
}

/**
 * Validate a non-negative amount (u64 range).
 */
export function validateAmount(value: string, field: string): bigint {
  const fast = fastUInt(value.trim());
  if (fast !== undefined && fast <= U64_MAX) return fast;
  const t = requireDecimalUIntString(value, field);
  const num = BigInt(t);

  if (num < 0n) {
    throw new ValidationError(field, `must be non-negative, got ${num}`);
  }

  if (num > U64_MAX) {
    throw new ValidationError(
      field,
      `must be <= ${U64_MAX} (u64 max), got ${num}`
    );
  }

  return num;
}

/**
 * Validate a u128 value.
 */
export function validateU128(value: string, field: string): bigint {
  const fast = fastUInt(value.trim());
  if (fast !== undefined && fast <= U128_MAX) return fast;
  const t = requireDecimalUIntString(value, field);
  const num = BigInt(t);

  if (num < 0n) {
    throw new ValidationError(field, `must be non-negative, got ${num}`);
  }

  if (num > U128_MAX) {
    throw new ValidationError(
      field,
      `must be <= ${U128_MAX} (u128 max), got ${num}`
    );
  }

  return num;
}

/**
 * Validate an i64 value.
 */
export function validateI64(value: string, field: string): bigint {
  const fast = typeof value === "string" ? fastInt(value.trim()) : undefined;
  if (fast !== undefined && fast >= I64_MIN && fast <= I64_MAX) return fast;
  let num: bigint;

  try {
    num = safeBigInt(value, field);
  } catch {
    throw new ValidationError(
      field,
      `"${value}" is not a valid number. Use decimal digits only, with optional leading minus.`
    );
  }

  if (num < I64_MIN) {
    throw new ValidationError(
      field,
      `must be >= ${I64_MIN} (i64 min), got ${num}`
    );
  }

  if (num > I64_MAX) {
    throw new ValidationError(
      field,
      `must be <= ${I64_MAX} (i64 max), got ${num}`
    );
  }

  return num;
}

/**
 * Validate an i128 value (trade sizes).
 */
export function validateI128(value: string, field: string): bigint {
  const fast = typeof value === "string" ? fastInt(value.trim()) : undefined;
  if (fast !== undefined && fast >= I128_MIN && fast <= I128_MAX) return fast;
  let num: bigint;

  try {
    num = safeBigInt(value, field);
  } catch {
    throw new ValidationError(
      field,
      `"${value}" is not a valid number. Use decimal digits only, with optional leading minus.`
    );
  }

  if (num < I128_MIN) {
    throw new ValidationError(
      field,
      `must be >= ${I128_MIN} (i128 min), got ${num}`
    );
  }

  if (num > I128_MAX) {
    throw new ValidationError(
      field,
      `must be <= ${I128_MAX} (i128 max), got ${num}`
    );
  }

  return num;
}

/**
 * Validate a basis points value (0-10000).
 */
export function validateBps(value: string, field: string): number {
  const t = value.trim();
  const small = fastSmallUInt(t);
  if (small !== undefined && small <= 10000) return small;
  requireDecimalUIntString(value, field);
  const bi = BigInt(t);
  if (bi > 10000n) {
    throw new ValidationError(
      field,
      `must be <= 10000 (100%), got ${t}`
    );
  }
  return Number(bi);
}

/**
 * Validate a u64 value.
 */
export function validateU64(value: string, field: string): bigint {
  return validateAmount(value, field);
}

/**
 * Validate a u16 value.
 */
export function validateU16(value: string, field: string): number {
  const t = value.trim();
  const small = fastSmallUInt(t);
  if (small !== undefined && small <= U16_MAX) return small;
  requireDecimalUIntString(value, field);
  const bi = BigInt(t);
  if (bi > BigInt(U16_MAX)) {
    throw new ValidationError(
      field,
      `must be <= ${U16_MAX} (u16 max), got ${t}`
    );
  }
  return Number(bi);
}
