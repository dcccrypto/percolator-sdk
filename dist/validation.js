import { PublicKey } from "@solana/web3.js";
const U16_MAX = 65535;
const U64_MAX = BigInt("18446744073709551615");
const I64_MIN = BigInt("-9223372036854775808");
const I64_MAX = BigInt("9223372036854775807");
const U128_MAX = (1n << 128n) - 1n;
const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;
class ValidationError extends Error {
  constructor(field, message) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
    this.name = "ValidationError";
  }
}
const DECIMAL_UINT_RE = /^(0|[1-9]\d*)$/;
const DECIMAL_INT_RE = /^-?(0|[1-9]\d*)$/;
function requireDecimalUIntString(value, field) {
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
function safeBigInt(val, caller) {
  const t = val.trim();
  if (!DECIMAL_INT_RE.test(t)) {
    throw new Error(
      `${caller}: "${val}" is not a valid decimal integer (use plain decimal digits, e.g. 123 or -42; no hex, scientific notation, or underscores).`
    );
  }
  return BigInt(t);
}
function validatePublicKey(value, field) {
  try {
    return new PublicKey(value);
  } catch {
    throw new ValidationError(
      field,
      `"${value}" is not a valid base58 public key. Example: "11111111111111111111111111111111"`
    );
  }
}
function validateIndex(value, field) {
  const t = requireDecimalUIntString(value, field);
  const bi = BigInt(t);
  if (bi > BigInt(U16_MAX)) {
    throw new ValidationError(
      field,
      `must be <= ${U16_MAX} (u16 max), got ${t}`
    );
  }
  return Number(bi);
}
function validateAmount(value, field) {
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
function validateU128(value, field) {
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
function validateI64(value, field) {
  let num;
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
function validateI128(value, field) {
  let num;
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
function validateBps(value, field) {
  const t = requireDecimalUIntString(value, field);
  const bi = BigInt(t);
  if (bi > 10000n) {
    throw new ValidationError(
      field,
      `must be <= 10000 (100%), got ${t}`
    );
  }
  return Number(bi);
}
function validateU64(value, field) {
  return validateAmount(value, field);
}
function validateU16(value, field) {
  const t = requireDecimalUIntString(value, field);
  const bi = BigInt(t);
  if (bi > BigInt(U16_MAX)) {
    throw new ValidationError(
      field,
      `must be <= ${U16_MAX} (u16 max), got ${t}`
    );
  }
  return Number(bi);
}
export {
  ValidationError,
  requireDecimalUIntString,
  safeBigInt,
  validateAmount,
  validateBps,
  validateI128,
  validateI64,
  validateIndex,
  validatePublicKey,
  validateU128,
  validateU16,
  validateU64
};
//# sourceMappingURL=validation.js.map