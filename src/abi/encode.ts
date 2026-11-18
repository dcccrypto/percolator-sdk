import { PublicKey } from "@solana/web3.js";

const U8_MAX = 0xFF;
const U16_MAX = 0xFFFF;
const U32_MAX = 0xFFFFFFFF;
const DECIMAL_INT_RE = /^-?(0|[1-9]\d*)$/;

// Shared scratch (single-threaded; every write is fully overwritten and copied
// out synchronously, so no state leaks between calls).
const SCRATCH = new Uint8Array(16);
const SCRATCH_VIEW = new DataView(SCRATCH.buffer);

function parseDecimalBigInt(val: unknown, fnName: string): bigint {
  if (typeof val === "bigint") return val;
  if (typeof val !== "string") {
    throw new Error(`${fnName}: value must be bigint or decimal integer string`);
  }
  if (!DECIMAL_INT_RE.test(val)) {
    throw new Error(`${fnName}: value must be a decimal integer string`);
  }
  return BigInt(val);
}

/**
 * Encode u8 (1 byte)
 */
export function encU8(val: number): Uint8Array {
  if (!Number.isInteger(val) || val < 0 || val > U8_MAX) {
    throw new Error(`encU8: value out of range (0..255), got ${val}`);
  }
  return new Uint8Array([val]);
}

/**
 * Encode u16 little-endian (2 bytes)
 */
export function encU16(val: number): Uint8Array {
  if (!Number.isInteger(val) || val < 0 || val > U16_MAX) {
    throw new Error(`encU16: value out of range (0..65535), got ${val}`);
  }
  const buf = new Uint8Array(2);
  buf[0] = val & 0xff;
  buf[1] = val >>> 8;
  return buf;
}

/**
 * Encode u32 little-endian (4 bytes)
 */
export function encU32(val: number): Uint8Array {
  if (!Number.isInteger(val) || val < 0 || val > U32_MAX) {
    throw new Error(`encU32: value out of range (0..4294967295), got ${val}`);
  }
  const buf = new Uint8Array(4);
  buf[0] = val & 0xff;
  buf[1] = (val >>> 8) & 0xff;
  buf[2] = (val >>> 16) & 0xff;
  buf[3] = val >>> 24;
  return buf;
}

/**
 * Encode u64 little-endian (8 bytes)
 * Input: bigint or string (decimal)
 */
export function encU64(val: bigint | string): Uint8Array {
  const n = parseDecimalBigInt(val, "encU64");
  if (n < 0n) throw new Error("encU64: value must be non-negative");
  if (n > 0xffff_ffff_ffff_ffffn) throw new Error("encU64: value exceeds u64 max");
  SCRATCH_VIEW.setBigUint64(0, n, true);
  return SCRATCH.slice(0, 8);
}

/**
 * Encode i64 little-endian (8 bytes), two's complement
 * Input: bigint or string (decimal, may be negative)
 */
export function encI64(val: bigint | string): Uint8Array {
  const n = parseDecimalBigInt(val, "encI64");
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  if (n < min || n > max) throw new Error("encI64: value out of range");
  SCRATCH_VIEW.setBigInt64(0, n, true);
  return SCRATCH.slice(0, 8);
}

/**
 * Encode u128 little-endian (16 bytes)
 * Input: bigint or string (decimal)
 */
export function encU128(val: bigint | string): Uint8Array {
  const n = parseDecimalBigInt(val, "encU128");
  if (n < 0n) throw new Error("encU128: value must be non-negative");
  const max = (1n << 128n) - 1n;
  if (n > max) throw new Error("encU128: value exceeds u128 max");
  SCRATCH_VIEW.setBigUint64(0, n & 0xffff_ffff_ffff_ffffn, true);
  SCRATCH_VIEW.setBigUint64(8, n >> 64n, true);
  return SCRATCH.slice(0, 16);
}

/**
 * Encode i128 little-endian (16 bytes), two's complement
 * Input: bigint or string (decimal, may be negative)
 */
export function encI128(val: bigint | string): Uint8Array {
  const n = parseDecimalBigInt(val, "encI128");
  const min = -(1n << 127n);
  const max = (1n << 127n) - 1n;
  if (n < min || n > max) throw new Error("encI128: value out of range");

  // Convert to unsigned representation (two's complement)
  let unsigned = n;
  if (n < 0n) {
    unsigned = (1n << 128n) + n;
  }

  SCRATCH_VIEW.setBigUint64(0, unsigned & 0xffff_ffff_ffff_ffffn, true);
  SCRATCH_VIEW.setBigUint64(8, unsigned >> 64n, true);
  return SCRATCH.slice(0, 16);
}

/**
 * Encode a Solana public key into its fixed-width 32-byte ABI representation.
 *
 * Accepts a `PublicKey` instance or a base58 string. Runtime PublicKey-like
 * objects are validated before their bytes are returned so JavaScript callers
 * cannot provide malformed `toBytes()` output.
 *
 * @throws Error when the value is not PublicKey-like, when `toBytes()` does not
 * return a `Uint8Array`, or when the output length is not exactly 32 bytes.
 */
export function encPubkey(val: PublicKey | string): Uint8Array {
  try {
    const pk = typeof val === "string" ? new PublicKey(val) : val;

    if (pk == null || typeof (pk as { toBytes?: unknown }).toBytes !== "function") {
      throw new Error("value must be a PublicKey or base58 string");
    }

    const bytes = pk.toBytes();

    if (!(bytes instanceof Uint8Array)) {
      throw new Error("toBytes() must return a Uint8Array");
    }

    if (bytes.length !== 32) {
      throw new Error(`expected 32 bytes, got ${bytes.length}`);
    }

    return bytes;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`encPubkey: invalid public key "${String(val)}" — ${msg}`);
  }
}

/**
 * Encode a boolean as u8 (0 = false, 1 = true)
 */
export function encBool(val: boolean): Uint8Array {
  return encU8(val ? 1 : 0);
}

/**
 * Concatenate multiple Uint8Arrays (replaces Buffer.concat)
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
