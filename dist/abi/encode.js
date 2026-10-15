import { PublicKey } from "@solana/web3.js";
const U8_MAX = 255;
const U16_MAX = 65535;
const U32_MAX = 4294967295;
const DECIMAL_INT_RE = /^-?(0|[1-9]\d*)$/;
function parseDecimalBigInt(val, fnName) {
  if (typeof val === "bigint") return val;
  if (typeof val !== "string") {
    throw new Error(`${fnName}: value must be bigint or decimal integer string`);
  }
  if (!DECIMAL_INT_RE.test(val)) {
    throw new Error(`${fnName}: value must be a decimal integer string`);
  }
  return BigInt(val);
}
function encU8(val) {
  if (!Number.isInteger(val) || val < 0 || val > U8_MAX) {
    throw new Error(`encU8: value out of range (0..255), got ${val}`);
  }
  return new Uint8Array([val]);
}
function encU16(val) {
  if (!Number.isInteger(val) || val < 0 || val > U16_MAX) {
    throw new Error(`encU16: value out of range (0..65535), got ${val}`);
  }
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, val, true);
  return buf;
}
function encU32(val) {
  if (!Number.isInteger(val) || val < 0 || val > U32_MAX) {
    throw new Error(`encU32: value out of range (0..4294967295), got ${val}`);
  }
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, val, true);
  return buf;
}
function encU64(val) {
  const n = parseDecimalBigInt(val, "encU64");
  if (n < 0n) throw new Error("encU64: value must be non-negative");
  if (n > 0xffffffffffffffffn) throw new Error("encU64: value exceeds u64 max");
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, n, true);
  return buf;
}
function encI64(val) {
  const n = parseDecimalBigInt(val, "encI64");
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  if (n < min || n > max) throw new Error("encI64: value out of range");
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigInt64(0, n, true);
  return buf;
}
function encU128(val) {
  const n = parseDecimalBigInt(val, "encU128");
  if (n < 0n) throw new Error("encU128: value must be non-negative");
  const max = (1n << 128n) - 1n;
  if (n > max) throw new Error("encU128: value exceeds u128 max");
  const buf = new Uint8Array(16);
  const view = new DataView(buf.buffer);
  const lo = n & 0xffffffffffffffffn;
  const hi = n >> 64n;
  view.setBigUint64(0, lo, true);
  view.setBigUint64(8, hi, true);
  return buf;
}
function encI128(val) {
  const n = parseDecimalBigInt(val, "encI128");
  const min = -(1n << 127n);
  const max = (1n << 127n) - 1n;
  if (n < min || n > max) throw new Error("encI128: value out of range");
  let unsigned = n;
  if (n < 0n) {
    unsigned = (1n << 128n) + n;
  }
  const buf = new Uint8Array(16);
  const view = new DataView(buf.buffer);
  const lo = unsigned & 0xffffffffffffffffn;
  const hi = unsigned >> 64n;
  view.setBigUint64(0, lo, true);
  view.setBigUint64(8, hi, true);
  return buf;
}
function encPubkey(val) {
  try {
    const pk = typeof val === "string" ? new PublicKey(val) : val;
    if (pk == null || typeof pk.toBytes !== "function") {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`encPubkey: invalid public key "${String(val)}" \u2014 ${msg}`);
  }
}
function encBool(val) {
  return encU8(val ? 1 : 0);
}
function concatBytes(...arrays) {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
export {
  concatBytes,
  encBool,
  encI128,
  encI64,
  encPubkey,
  encU128,
  encU16,
  encU32,
  encU64,
  encU8
};
//# sourceMappingURL=encode.js.map