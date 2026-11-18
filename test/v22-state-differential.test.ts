/**
 * Differential test: the optimised v22-state decoders vs the pre-optimisation originals (copied verbatim into
 * test/helpers/v22-state-legacy.ts). 10k random buffers per decoder; results and thrown errors must be identical.
 */
import { describe, expect, it } from "vitest";
import { ACCOUNT_KIND, LAYOUT_V22, WRAPPER_ACCOUNT_MAGIC } from "../src/abi/layout.js";
import * as neu from "../src/abi/v22-state.js";
import * as old from "./helpers/v22-state-legacy.js";

const N = 10_000;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s;
  };
}
type Rng = () => number;

function header(r: Rng, buf: Uint8Array, kind: number): void {
  const dv = new DataView(buf.buffer);
  const m = r() % 40;
  dv.setBigUint64(0, m === 0 ? BigInt(r()) : WRAPPER_ACCOUNT_MAGIC, true);
  dv.setUint16(8, m === 1 ? r() & 0xffff : LAYOUT_V22.version, true);
  buf[10] = m === 2 ? r() & 0xff : kind;
}
/** Random sparse bytes: mostly zero so padding / zero checks are exercised both ways. */
function noise(r: Rng, buf: Uint8Array, from: number, to: number, density: number): void {
  for (let i = from; i < to; i++) if (r() % 100 < density) buf[i] = r() & 0xff;
}
function lenFor(r: Rng, full: number): number {
  const m = r() % 20;
  if (m === 0) return r() % (full + 1); // short
  if (m === 1) return full + (r() % 8); // long
  return full;
}
function mutate(r: Rng, buf: Uint8Array): void {
  const k = r() % 4;
  for (let i = 0; i < k; i++) buf[r() % buf.length] = r() & 0xff;
}

function tranche(r: Rng): Uint8Array {
  const buf = new Uint8Array(lenFor(r, 192));
  if (buf.length < 16) return buf;
  header(r, buf, ACCOUNT_KIND.BondTranche);
  if (buf.length < 192) { noise(r, buf, 16, buf.length, 50); return buf; }
  const dv = new DataView(buf.buffer);
  if (r() % 20) buf.set([1 + (r() & 0xff), r() & 0xff, r() & 0xff, 7], 16);
  const k = BigInt(1 + (r() % 1000));
  dv.setBigUint64(16 + 32, k, true);
  dv.setBigUint64(16 + 48, r() % 8 ? 1000n : 0n, true);
  dv.setBigUint64(16 + 144, r() % 4 ? 0n : BigInt(r() % 2000), true);
  dv.setBigUint64(16 + 160, r() % 8 ? BigInt(r()) : 0xffff_ffff_ffff_ffffn, true);
  dv.setUint16(16 + 104, r() % 6 ? r() % 2001 : r() & 0xffff, true);
  dv.setUint16(16 + 106, r() % 10 ? 0 : 5, true);
  dv.setUint32(16 + 108, r() % 6 ? 9000 + (r() % 1_503_000) : r(), true);
  dv.setUint16(16 + 112, r() % 6 ? 1 + (r() % 5000) : r() & 0xffff, true);
  buf[16 + 114] = r() % 10 ? 2 : r() & 0xff;
  dv.setUint16(16 + 116, r() % 6 ? r() % 10001 : r() & 0xffff, true);
  if (r() % 8 === 0) noise(r, buf, 16 + 118, 16 + 120, 100);
  mutate(r, buf);
  return buf;
}
function position(r: Rng): Uint8Array {
  const buf = new Uint8Array(lenFor(r, 112));
  if (buf.length < 16) return buf;
  header(r, buf, ACCOUNT_KIND.BondPosition);
  if (buf.length < 112) { noise(r, buf, 16, buf.length, 50); return buf; }
  const dv = new DataView(buf.buffer);
  if (r() % 20) buf.set([1 + (r() & 0xff), r() & 0xff, 3], 16);
  const sh = BigInt(r() % 1000);
  dv.setBigUint64(16 + 32, sh, true);
  dv.setBigUint64(16 + 48, r() % 5 ? sh / 2n : sh + 1n, true);
  buf[16 + 72] = r() % 10 ? 1 : r() & 0xff;
  if (r() % 8 === 0) noise(r, buf, 16 + 74, 16 + 96, 30);
  mutate(r, buf);
  return buf;
}
function insurance(r: Rng): Uint8Array {
  const buf = new Uint8Array(lenFor(r, 208));
  if (buf.length < 16) return buf;
  header(r, buf, ACCOUNT_KIND.InsuranceUnits);
  if (buf.length < 208) { noise(r, buf, 16, buf.length, 50); return buf; }
  const dv = new DataView(buf.buffer);
  if (r() % 20) buf.set([1 + (r() & 0xff), 9], 16);
  const a = BigInt(r() % 100), c = BigInt(r() % 100);
  dv.setBigUint64(16 + 48, a, true);
  dv.setBigUint64(16 + 64, c, true);
  dv.setBigUint64(16 + 32, r() % 6 ? a + c : a + c + 1n, true);
  buf[16 + 136] = r() % 10 ? 1 : r() & 0xff;
  noise(r, buf, 16 + 80, 16 + 136, 20);
  noise(r, buf, 16 + 144, 16 + 192, 20);
  if (r() % 8 === 0) noise(r, buf, 16 + 138, 16 + 144, 50);
  mutate(r, buf);
  return buf;
}
function redemption(r: Rng): Uint8Array {
  const full = r() % 2 ? 128 : 112;
  const buf = new Uint8Array(lenFor(r, full));
  if (buf.length < 16) return buf;
  header(r, buf, ACCOUNT_KIND.LpRedemption);
  noise(r, buf, 16, Math.min(buf.length, 112), 70);
  if (buf.length >= 128) {
    buf[16 + 96 + 8] = r() % 6 ? r() % 2 : r() & 0xff;
    if (r() % 6) for (let i = 9; i < 16; i++) buf[16 + 96 + i] = 0;
  }
  mutate(r, buf);
  return buf;
}
function allowlist(r: Rng): Uint8Array {
  const buf = new Uint8Array(lenFor(r, 16 + 2064));
  if (buf.length < 16) return buf;
  header(r, buf, ACCOUNT_KIND.G9FeedAllowlist);
  if (buf.length < 16 + 2064) { noise(r, buf, 16, buf.length, 20); return buf; }
  const b = 16;
  const cnt = r() % 30 === 0 ? 17 + (r() % 200) : r() % 17;
  const pcnt = r() % 30 === 0 ? 17 + (r() % 200) : r() % 17;
  buf[b] = cnt; buf[b + 1] = r() % 20 ? 1 : r() & 0xff; buf[b + 2] = r() & 0xff; buf[b + 3] = pcnt;
  if (r() % 20 === 0) noise(r, buf, b + 4, b + 8, 100);
  new DataView(buf.buffer).setBigUint64(b + 8, BigInt(r()) * BigInt(r()), true);
  const slot = (g: number, i: number, n: number, fill: boolean) => {
    const off = b + 16 + 32 * (g * 16 + i);
    if (i < n ? fill : r() % 40 === 0) for (let j = 0; j < 32; j++) buf[off + j] = r() & 0xff;
    // sprinkle zero / duplicate listed keys
    if (g === 0 && i < n && i > 0 && r() % 25 === 0) buf.copyWithin(off, b + 16 + 32 * (r() % i), b + 16 + 32 * (r() % i) + 32);
    if (g === 0 && i < n && r() % 40 === 0) buf.fill(0, off, off + 32);
  };
  for (let g = 0; g < 4; g++) {
    const n = g % 2 === 0 ? (g === 0 ? cnt : pcnt) : g === 1 ? cnt : pcnt;
    for (let i = 0; i < 16; i++) slot(g, i, n, true);
  }
  mutate(r, buf);
  return buf;
}

type Outcome = { ok: true; v: unknown } | { ok: false; e: unknown };
function run(fn: (b: Uint8Array) => unknown, buf: Uint8Array): Outcome {
  try {
    return { ok: true, v: fn(buf) };
  } catch (e) {
    return { ok: false, e };
  }
}
/** Canonical string of a decoded value (bigint / PublicKey aware); cheap enough for 10k records. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
}
function errShape(e: unknown) {
  const x = e as Error & Record<string, unknown>;
  return { ctor: x?.constructor?.name, name: x?.name, message: x?.message, code: x?.code, parser: x?.parser, version: x?.version, discriminator: x?.discriminator, kind: x?.kind };
}

const CASES: [string, (r: Rng) => Uint8Array, (b: Uint8Array) => unknown, (b: Uint8Array) => unknown][] = [
  ["decodeBondTrancheV20", tranche, (b) => old.decodeBondTrancheV20(b), (b) => neu.decodeBondTrancheV20(b)],
  ["decodeBondPositionV20", position, (b) => old.decodeBondPositionV20(b), (b) => neu.decodeBondPositionV20(b)],
  ["decodeInsuranceUnitsV20", insurance, (b) => old.decodeInsuranceUnitsV20(b), (b) => neu.decodeInsuranceUnitsV20(b)],
  ["decodeLpRedemptionV22", redemption, (b) => old.decodeLpRedemptionV22(b), (b) => neu.decodeLpRedemptionV22(b)],
  ["decodeG9FeedAllowlistV22", allowlist, (b) => old.decodeG9FeedAllowlistV22(b), (b) => neu.decodeG9FeedAllowlistV22(b)],
];

describe("v22-state decoders: old vs new differential", () => {
  for (const [name, gen, fOld, fNew] of CASES) {
    it(`${name}: ${N} random buffers, 0 mismatches (results and errors)`, () => {
      const r = rng(0x9e3779b1 ^ name.length * 7919);
      let mismatches = 0;
      let okCount = 0;
      let errCount = 0;
      for (let i = 0; i < N; i++) {
        const buf = gen(r);
        const copyBefore = buf.slice();
        const a = run(fOld, buf);
        const b = run(fNew, buf);
        // inputs must not be mutated, and the result must not alias the input
        if (Buffer.compare(buf, copyBefore) !== 0) mismatches++;
        let same: boolean;
        if (a.ok && b.ok) {
          okCount++;
          same = canon(b.v) === canon(a.v);
          // PublicKey internals (BN limbs) too, on a sample
          if (same && i % 50 === 0) { try { expect(b.v).toStrictEqual(a.v); } catch { same = false; } }
        } else if (!a.ok && !b.ok) {
          errCount++;
          same = canon(errShape(b.e)) === canon(errShape(a.e));
        } else same = false;
        if (!same) mismatches++;
      }
      expect(mismatches).toBe(0);
      // the generator must reach both the success and the error paths
      expect(okCount).toBeGreaterThan(100);
      expect(errCount).toBeGreaterThan(100);
    }, 180_000);
  }

  it("decoded PublicKeys do not alias the input buffer", () => {
    const buf = allowlistValid();
    const out = neu.decodeG9FeedAllowlistV22(buf);
    const before = out.keys[0].toBase58();
    buf.fill(0xff, 32, 64);
    expect(out.keys[0].toBase58()).toBe(before);
  });
});

function allowlistValid(): Uint8Array {
  const buf = new Uint8Array(16 + 2064);
  const dv = new DataView(buf.buffer);
  dv.setBigUint64(0, WRAPPER_ACCOUNT_MAGIC, true);
  dv.setUint16(8, LAYOUT_V22.version, true);
  buf[10] = ACCOUNT_KIND.G9FeedAllowlist;
  buf[16] = 2; buf[17] = 1;
  buf[32] = 1; buf[64] = 2;
  return buf;
}
