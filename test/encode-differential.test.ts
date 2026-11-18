import { describe, it, expect } from "vitest";
import {
  encU16, encU32, encU64, encI64, encU128, encI128,
} from "../src/abi/encode.js";

// ---- Reference: verbatim pre-optimisation implementations (allocate a DataView per value) ----
const DECIMAL_INT_RE = /^-?(0|[1-9]\d*)$/;
function parse(val: unknown, fn: string): bigint {
  if (typeof val === "bigint") return val;
  if (typeof val !== "string") throw new Error(`${fn}: value must be bigint or decimal integer string`);
  if (!DECIMAL_INT_RE.test(val)) throw new Error(`${fn}: value must be a decimal integer string`);
  return BigInt(val);
}
const ref = {
  encU16(val: number): Uint8Array {
    if (!Number.isInteger(val) || val < 0 || val > 0xffff)
      throw new Error(`encU16: value out of range (0..65535), got ${val}`);
    const buf = new Uint8Array(2);
    new DataView(buf.buffer).setUint16(0, val, true);
    return buf;
  },
  encU32(val: number): Uint8Array {
    if (!Number.isInteger(val) || val < 0 || val > 0xffffffff)
      throw new Error(`encU32: value out of range (0..4294967295), got ${val}`);
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, val, true);
    return buf;
  },
  encU64(val: bigint | string): Uint8Array {
    const n = parse(val, "encU64");
    if (n < 0n) throw new Error("encU64: value must be non-negative");
    if (n > 0xffff_ffff_ffff_ffffn) throw new Error("encU64: value exceeds u64 max");
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigUint64(0, n, true);
    return buf;
  },
  encI64(val: bigint | string): Uint8Array {
    const n = parse(val, "encI64");
    if (n < -(1n << 63n) || n > (1n << 63n) - 1n) throw new Error("encI64: value out of range");
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigInt64(0, n, true);
    return buf;
  },
  encU128(val: bigint | string): Uint8Array {
    const n = parse(val, "encU128");
    if (n < 0n) throw new Error("encU128: value must be non-negative");
    if (n > (1n << 128n) - 1n) throw new Error("encU128: value exceeds u128 max");
    const buf = new Uint8Array(16);
    const view = new DataView(buf.buffer);
    view.setBigUint64(0, n & 0xffff_ffff_ffff_ffffn, true);
    view.setBigUint64(8, n >> 64n, true);
    return buf;
  },
  encI128(val: bigint | string): Uint8Array {
    const n = parse(val, "encI128");
    if (n < -(1n << 127n) || n > (1n << 127n) - 1n) throw new Error("encI128: value out of range");
    const u = n < 0n ? (1n << 128n) + n : n;
    const buf = new Uint8Array(16);
    const view = new DataView(buf.buffer);
    view.setBigUint64(0, u & 0xffff_ffff_ffff_ffffn, true);
    view.setBigUint64(8, u >> 64n, true);
    return buf;
  },
};

// Deterministic PRNG (mulberry32)
let seed = 0x9e3779b9;
function rnd(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randBig(bits: number): bigint {
  let r = 0n;
  for (let i = 0; i < bits; i += 32) r = (r << 32n) | BigInt(Math.floor(rnd() * 4294967296));
  return r & ((1n << BigInt(bits)) - 1n);
}

type Out = { ok: true; hex: string } | { ok: false; msg: string };
function run(fn: (v: never) => Uint8Array, v: unknown): Out {
  try {
    return { ok: true, hex: Buffer.from(fn(v as never)).toString("hex") };
  } catch (e) {
    return { ok: false, msg: (e as Error).message };
  }
}

const N = 50_000;

function numInputs(max: number): unknown[] {
  const xs: unknown[] = [
    0, 1, max - 1, max, max + 1, -1, -0, 0.5, 1.5, max + 0.5, NaN, Infinity, -Infinity,
    "1", "0", null, undefined, 2 ** 53, -(2 ** 31), 0x80, 0x100, 0x8000, 0x10000, 0x7fffffff, 0x80000000,
  ];
  for (let i = 0; xs.length < N; i++) {
    const m = i % 5;
    if (m === 0) xs.push(Math.floor(rnd() * (max + 1)));
    else if (m === 1) xs.push(Math.floor(rnd() * (max + 3)) - 1);
    else if (m === 2) xs.push(rnd() * max);
    else if (m === 3) xs.push(Math.floor(rnd() * 256) << (8 * Math.floor(rnd() * 3)));
    else xs.push(Math.floor(rnd() * 2 ** 40) - 2 ** 39);
  }
  return xs;
}

function bigInputs(bits: number, signed: boolean): unknown[] {
  const top = 1n << BigInt(bits);
  const lo = signed ? -(top >> 1n) : 0n;
  const hi = signed ? (top >> 1n) - 1n : top - 1n;
  const xs: unknown[] = [
    0n, 1n, -1n, lo, hi, lo - 1n, hi + 1n, top, -top, top - 1n, 1n << 63n, (1n << 63n) - 1n,
    1n << 64n, (1n << 64n) - 1n, -(1n << 63n), -(1n << 63n) - 1n, (1n << 127n) - 1n, 1n << 127n,
    -(1n << 127n), -(1n << 127n) - 1n,
    // strings / invalid types
    "0", "-0", "00", "01", "-1", "+1", " 1", "1 ", "1.5", "1e3", "0x10", "", "abc", "-", "١٢٣",
    hi.toString(), (hi + 1n).toString(), lo.toString(), (lo - 1n).toString(), top.toString(),
    "18446744073709551615", "18446744073709551616", "9223372036854775807", "9223372036854775808",
    "-9223372036854775808", "-9223372036854775809",
    "340282366920938463463374607431768211455", "340282366920938463463374607431768211456",
    "170141183460469231731687303715884105727", "170141183460469231731687303715884105728",
    "-170141183460469231731687303715884105728", "-170141183460469231731687303715884105729",
    1, 1.5, NaN, null, undefined, true, {}, [], Symbol.iterator.description,
  ];
  for (let i = 0; xs.length < N; i++) {
    const m = i % 6;
    const mag = randBig(bits + 2); // sometimes out of range
    const sign = rnd() < 0.5 ? -1n : 1n;
    if (m === 0) xs.push(randBig(bits) - (signed ? top >> 1n : 0n));
    else if (m === 1) xs.push(sign * mag);
    else if (m === 2) xs.push((sign * mag).toString());
    else if (m === 3) xs.push(randBig(Math.max(1, Math.floor(rnd() * bits)))); // varied magnitudes
    else if (m === 4) xs.push(((rnd() < 0.5 ? hi : lo) + BigInt(Math.floor(rnd() * 5) - 2)).toString());
    else xs.push((rnd() < 0.5 ? hi : lo) + BigInt(Math.floor(rnd() * 5) - 2));
  }
  return xs;
}

function compare(name: string, a: (v: never) => Uint8Array, b: (v: never) => Uint8Array, inputs: unknown[]) {
  let mismatches = 0, okCount = 0, errCount = 0;
  for (const v of inputs) {
    const x = run(a, v), y = run(b, v);
    if (x.ok) okCount++; else errCount++;
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      if (mismatches++ < 5) console.error(`${name} mismatch for`, String(v), x, y);
    }
  }
  expect(okCount).toBeGreaterThan(1000);
  expect(errCount).toBeGreaterThan(10);
  expect(mismatches).toBe(0);
}

describe("encode differential (new vs pre-optimisation reference)", () => {
  it("encU16", () => compare("encU16", encU16, ref.encU16, numInputs(0xffff)), 120_000);
  it("encU32", () => compare("encU32", encU32, ref.encU32, numInputs(0xffffffff)), 120_000);
  it("encU64", () => compare("encU64", encU64, ref.encU64, bigInputs(64, false)), 120_000);
  it("encI64", () => compare("encI64", encI64, ref.encI64, bigInputs(64, true)), 120_000);
  it("encU128", () => compare("encU128", encU128, ref.encU128, bigInputs(128, false)), 120_000);
  it("encI128", () => compare("encI128", encI128, ref.encI128, bigInputs(128, true)), 120_000);

  it("returned buffers are fresh (no shared scratch aliasing)", () => {
    const a = encU64(1n), b = encU64(2n);
    expect(a.buffer).not.toBe(b.buffer);
    expect(a.byteLength).toBe(8);
    expect(a.buffer.byteLength).toBe(8);
    const c = encU128(1n);
    expect(c.buffer.byteLength).toBe(16);
    expect(Array.from(a)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });
});
