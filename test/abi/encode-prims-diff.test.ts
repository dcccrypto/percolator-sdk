import { describe, expect, it } from "vitest";
import * as cur from "../../src/abi/encode.js";
import * as ref from "./encode-prims.reference.js";

type Out = { ok: true; hex: string } | { ok: false; msg: string };
const run = (f: (v: never) => Uint8Array, v: unknown): Out => {
  try {
    const b = f(v as never);
    return { ok: true, hex: Buffer.from(b).toString("hex") + `:${b.length}:${b.constructor.name}` };
  } catch (e) {
    return { ok: false, msg: (e as Error).message };
  }
};

const mismatches = (c: (v: never) => Uint8Array, r: (v: never) => Uint8Array, inputs: unknown[]): string[] => {
  const bad: string[] = [];
  for (const v of inputs) {
    const a = run(c, v), b = run(r, v);
    if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(`${String(v)}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  }
  return bad;
};

let s = 0x1234567;
const rnd = () => {
  s ^= s << 13; s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 5; s >>>= 0;
  return s;
};
const big = (bits: number): bigint => {
  let r = 0n;
  for (let i = 0; i < bits; i += 32) r = (r << 32n) | BigInt(rnd());
  return r & ((1n << BigInt(bits)) - 1n);
};

const WEIRD: unknown[] = [
  undefined, null, NaN, Infinity, -Infinity, -0, 0, 1.5, -1, "", " 1", "1 ", "01", "-0", "+1", "1e3", "0x10",
  "abc", "1.0", {}, [], true, false, Symbol.iterator.description, 1e21, 2 ** 53, Number.MAX_SAFE_INTEGER,
  -Number.MAX_SAFE_INTEGER, 5, 255, 256, 65535, 65536, 4294967295, 4294967296, -2147483648,
  new Uint8Array(1), () => 1,
];

const bigBoundaries = (bits: number, signed: boolean): bigint[] => {
  const lo = signed ? -(1n << BigInt(bits - 1)) : 0n;
  const hi = signed ? (1n << BigInt(bits - 1)) - 1n : (1n << BigInt(bits)) - 1n;
  const out = [lo, lo - 1n, lo + 1n, hi, hi + 1n, hi - 1n, 0n, 1n, -1n, -2n, 2n,
    (1n << 63n), (1n << 63n) - 1n, (1n << 63n) + 1n, -(1n << 63n), -(1n << 63n) - 1n,
    (1n << 64n), (1n << 64n) - 1n, (1n << 64n) + 1n, -(1n << 64n), -(1n << 64n) + 1n,
    (1n << 127n), (1n << 127n) - 1n, -(1n << 127n), -(1n << 127n) - 1n, (1n << 128n), (1n << 128n) - 1n,
    0xffffffffn, 0x100000000n, 0xffff_ffff_0000_0000n];
  return out;
};

const pairs: [string, (v: never) => Uint8Array, (v: never) => Uint8Array][] = [
  ["encU64", cur.encU64 as never, ref.refencU64 as never],
  ["encI64", cur.encI64 as never, ref.refencI64 as never],
  ["encU128", cur.encU128 as never, ref.refencU128 as never],
  ["encI128", cur.encI128 as never, ref.refencI128 as never],
];
const numPairs: [string, (v: never) => Uint8Array, (v: never) => Uint8Array, number][] = [
  ["encU8", cur.encU8 as never, ref.refencU8 as never, 0xff],
  ["encU16", cur.encU16 as never, ref.refencU16 as never, 0xffff],
  ["encU32", cur.encU32 as never, ref.refencU32 as never, 0xffffffff],
];

describe("encode primitives: differential vs pre-optimisation reference", () => {
  for (const [name, c, r, max] of numPairs) {
    it(`${name}: 50k random + boundaries + rejects identical`, () => {
      const inputs: unknown[] = [...WEIRD, -1, max, max + 1, max - 1, max + 0.5];
      for (let i = 0; i <= Math.min(max, 70000); i++) inputs.push(i); // exhaustive for u8/u16
      for (let i = 0; i < 50_000; i++) inputs.push(rnd() >>> (rnd() % 33 === 32 ? 0 : rnd() % 32));
      for (let i = 0; i < 2000; i++) inputs.push((rnd() - 2 ** 31) / (1 + (rnd() % 3)));
      expect(mismatches(c, r, inputs)).toEqual([]);
    }, 180_000);
  }

  for (const [name, c, r] of pairs) {
    const bits = name.endsWith("128") ? 128 : 64;
    const signed = name.startsWith("encI");
    it(`${name}: 50k random + boundaries + rejects identical`, () => {
      const inputs: unknown[] = [...WEIRD];
      for (const b of bigBoundaries(bits, signed)) inputs.push(b, b.toString(), "-" + b.toString());
      for (let i = 0; i < 50_000; i++) {
        // widths slightly beyond the type so some values are rejected
        const w = [8, 32, 63, 64, 65, 96, 127, 128, 129][rnd() % 9];
        let v = big(w);
        if (rnd() & 1) v = -v;
        inputs.push(v);
        if (i % 4 === 0) inputs.push(v.toString());
      }
      expect(mismatches(c, r, inputs)).toEqual([]);
    }, 180_000);

    it(`${name}: returned buffers are independent (no shared scratch aliasing)`, () => {
      const a = (c as (v: bigint) => Uint8Array)(1n);
      const b = (c as (v: bigint) => Uint8Array)(2n);
      expect(a[0]).toBe(1);
      expect(b[0]).toBe(2);
      expect(a.buffer).not.toBe(b.buffer);
      expect(a.byteLength).toBe(a.buffer.byteLength);
    }, 180_000);
  }
});
