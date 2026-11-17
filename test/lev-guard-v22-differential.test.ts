/**
 * Differential: the pre-optimisation lev-guard-v22 (frozen copy in test/fixtures) vs src/abi/lev-guard-v22.ts
 * on 20k inputs: bytes, decoded objects and thrown error messages must be identical.
 */
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import * as oldM from "./fixtures/lev-guard-v22-reference.js";
import * as newM from "../src/abi/lev-guard-v22.js";
import { makeInputs, rng } from "./fixtures/lev-guard-v22-inputs.js";

const N = 20_000;
const T = 300_000;
const inp = makeInputs(N, 0xc0ffee);

type Out = { ok: true; v: unknown } | { ok: false; msg: string; name: string };
function run(fn: () => unknown): Out {
  try {
    return { ok: true, v: fn() };
  } catch (e) {
    const err = e as Error & { code?: string };
    return { ok: false, msg: err.message, name: `${err.name}:${err.code ?? ""}` };
  }
}
function same(a: Out, b: Out): boolean {
  if (a.ok !== b.ok) return false;
  if (!a.ok && !b.ok) return a.msg === b.msg && a.name === b.name;
  if (a.ok && b.ok) {
    if (a.v instanceof Uint8Array && b.v instanceof Uint8Array) {
      return a.v.length === b.v.length && a.v.every((x, i) => x === (b.v as Uint8Array)[i]);
    }
    return JSON.stringify(a.v, repl) === JSON.stringify(b.v, repl);
  }
  return false;
}
function repl(_k: string, v: unknown): unknown {
  if (typeof v === "bigint") return `${v}n`;
  if (v instanceof PublicKey) return v.toBase58();
  return v;
}
function mismatches(items: unknown[], f: (m: typeof oldM, x: any) => unknown): number {
  let bad = 0;
  for (const x of items) {
    if (!same(run(() => f(oldM, x)), run(() => f(newM as unknown as typeof oldM, x)))) bad++;
  }
  return bad;
}

describe("lev-guard-v22 old vs new (differential)", () => {
  it("Init / SetT0 over 20k u64 + invalid inputs", () => {
    const bad: unknown[] = [-1n, 1n << 64n, (1n << 64n) + 5n, 5 as unknown as bigint, "7" as unknown as bigint, undefined as unknown as bigint];
    const all = [...inp.t0s, ...bad];
    expect(mismatches(all, (m, t) => m.encodeLevGuardInitV22(t))).toBe(0);
    expect(mismatches(all, (m, t) => m.encodeLevGuardSetT0V22(t))).toBe(0);
    expect(run(() => oldM.encodeLevGuardInitV22()).ok).toBe(true);
    expect(same(run(() => oldM.encodeLevGuardInitV22()), run(() => newM.encodeLevGuardInitV22()))).toBe(true);
  }, T);

  it("SetRiskKey over 20k keys + wrong lengths", () => {
    const bad = [new Uint8Array(0), new Uint8Array(31), new Uint8Array(33), Buffer.alloc(32, 9)];
    expect(mismatches([...inp.keys, ...bad], (m, k) => m.encodeLevGuardSetRiskKeyV22(k))).toBe(0);
  }, T);

  it("Report over 20k reports + invalid fields", () => {
    const r = rng(7);
    const bad = [
      { jDumpBps: 10001, mIndBps: 0, lCapX100: 0, nMultBps: 0 },
      { jDumpBps: 0, mIndBps: -1, lCapX100: 0, nMultBps: 0 },
      { jDumpBps: 0, mIndBps: 0, lCapX100: 65536, nMultBps: 0 },
      { jDumpBps: 0, mIndBps: 0, lCapX100: 1.5, nMultBps: 0 },
      { jDumpBps: 0, mIndBps: 0, lCapX100: 0, nMultBps: Number.NaN },
      { jDumpBps: 0, mIndBps: 0, lCapX100: 0, nMultBps: 10001 },
    ];
    const fuzz = Array.from({ length: 2000 }, () => ({
      jDumpBps: Math.floor(r() * 12000), mIndBps: Math.floor(r() * 12000),
      lCapX100: Math.floor(r() * 70000), nMultBps: Math.floor(r() * 12000),
    }));
    expect(mismatches([...inp.reports, ...bad, ...fuzz], (m, x) => m.encodeLevGuardReportV22(x))).toBe(0);
  }, T);

  it("Tighten / Poke / LpStop", () => {
    for (const f of ["encodeLevGuardTightenV22", "encodeLevGuardPokeV22", "encodeLevGuardLpStopV22"] as const) {
      expect(same(run(() => oldM[f]()), run(() => newM[f]()))).toBe(true);
    }
    // fresh buffer every call (callers may mutate)
    expect(newM.encodeLevGuardPokeV22()).not.toBe(newM.encodeLevGuardPokeV22());
  }, T);

  it("decodeLevGuardV22 over 20k valid accounts", () => {
    expect(mismatches(inp.accounts, (m, d) => m.decodeLevGuardV22(d))).toBe(0);
  }, T);

  it("decodeLevGuardV22 error messages over 20k corrupted accounts", () => {
    const r = rng(99);
    const bad: Uint8Array[] = [];
    for (let i = 0; i < N; i++) {
      const d = inp.accounts[i].slice();
      const mode = Math.floor(r() * 6);
      if (mode === 0) d[Math.floor(r() * 16)] ^= 1 << Math.floor(r() * 8); // header
      else if (mode === 1) d[16 + 74] = Math.floor(r() * 256);
      else if (mode === 2) d[16 + [76, 77, 78, 79, 102, 103, 162, 167][Math.floor(r() * 8)]] = Math.floor(r() * 256);
      else if (mode === 3) new DataView(d.buffer).setUint16(16 + [80, 82, 86, 98, 100][Math.floor(r() * 5)], 10001 + Math.floor(r() * 50000), true);
      else if (mode === 4) bad.push(d.subarray(0, Math.floor(r() * d.length)));
      else d[16 + 348 + Math.floor(r() * 4)] = 1 + Math.floor(r() * 255);
      if (mode !== 4) bad.push(d);
    }
    expect(mismatches(bad, (m, d) => m.decodeLevGuardV22(d))).toBe(0);
  }, T);

  it("levKeyTagV22 over 20k keys", () => {
    expect(mismatches(inp.pubkeys, (m, k) => m.levKeyTagV22(k))).toBe(0);
  }, T);
});
