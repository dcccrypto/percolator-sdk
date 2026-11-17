/**
 * Differential test: the optimised validators in src/validation.ts must return identical
 * values and throw identical error classes/messages as the frozen pre-optimisation copy
 * in test/validation-legacy.ts.
 */
import { describe, it, expect, vi } from "vitest";
import * as cur from "../src/validation.js";
import * as old from "./validation-legacy.js";

type Out = { ok: true; v: string } | { ok: false; name: string; msg: string; field?: string };
function run(f: (v: string, field: string) => unknown, v: string): Out {
  try {
    const r = f(v, "fld");
    return { ok: true, v: `${typeof r}:${String(r)}` };
  } catch (e) {
    const err = e as Error & { field?: string };
    return { ok: false, name: err.name, msg: err.message, field: err.field };
  }
}

let seed = 0xc0ffee;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const digits = (n: number) => {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(rnd() * 10);
  return s;
};

const boundaries: string[] = [];
for (const b of [
  0n, 1n, 9999n, 10000n, 10001n, 65535n, 65536n,
  (1n << 53n), (1n << 63n) - 1n, 1n << 63n, (1n << 64n) - 1n, 1n << 64n,
  (1n << 127n) - 1n, 1n << 127n, (1n << 128n) - 1n, 1n << 128n,
]) {
  for (const d of [-2n, -1n, 0n, 1n, 2n]) {
    boundaries.push(String(b + d), String(-(b + d)));
  }
}
const nasty = [
  "", " ", "\t", "\n", "-", "+", "+1", "--1", "-+1", "-0", "-00", "00", "01", "007", "0x1", "0X1f", "0b1", "0o7",
  "1e5", "1E5", "1e", "1.0", "1.", ".5", "-.5", "1_000", "1,000", "١٢٣", "１２３", "1 2", "1\n", "\n1", " 1 ",
  " 1 ", " -5 ", "﻿12", "12​", "NaN", "Infinity", "-Infinity", "null", "undefined",
  "9".repeat(400), "-" + "9".repeat(400), "0".repeat(50), "1" + "0".repeat(300), "1" + "0".repeat(14), "9".repeat(15),
  "9".repeat(16), "1" + "0".repeat(15), "٣", "1\u0000", "\u00001", "-\n1", "- 1", " -1", "-1 ", "1\r\n",
];
const alphabet = ["0", "1", "2", "9", "-", "+", " ", "x", "e", ".", "_", "\t", "\n", "a", " "];

const inputs: string[] = [...boundaries, ...nasty];
for (const s of [...boundaries]) inputs.push(" " + s, s + " ", `\t${s}\n`, "0" + s, "-" + s, "+" + s, s + "0", s + "x");
while (inputs.length < 24000) {
  const kind = Math.floor(rnd() * 6);
  if (kind === 0) inputs.push(digits(1 + Math.floor(rnd() * 45)));
  else if (kind === 1) inputs.push("-" + digits(1 + Math.floor(rnd() * 45)));
  else if (kind === 2) inputs.push(String(1 + Math.floor(rnd() * 9)) + digits(Math.floor(rnd() * 40)));
  else if (kind === 3) inputs.push(pick([" ", "", "\t"]) + (rnd() < 0.5 ? "-" : "") + String(Math.floor(rnd() * 70000)) + pick([" ", "", "\n"]));
  else if (kind === 4) {
    let s = "";
    for (let i = 0, n = 1 + Math.floor(rnd() * 8); i < n; i++) s += pick(alphabet);
    inputs.push(s);
  } else inputs.push("0" + digits(Math.floor(rnd() * 20)));
}

const fns = [
  "validateAmount", "validateU64", "validateU128", "validateI64", "validateI128",
  "validateBps", "validateIndex", "validateU16",
] as const;

vi.setConfig({ testTimeout: 120_000 });

describe("validation differential (old vs optimised)", () => {
  it("has >= 20k inputs", () => expect(inputs.length).toBeGreaterThanOrEqual(20000));

  for (const name of fns) {
    it(`${name}: identical returns and errors`, () => {
      let mismatches = 0;
      for (const s of inputs) {
        const a = run(old[name], s);
        const b = run(cur[name], s);
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          if (mismatches++ < 5) expect(b, `${name}(${JSON.stringify(s)})`).toEqual(a);
        }
      }
      expect(mismatches).toBe(0);
    });
  }

  it("requireDecimalUIntString: identical", () => {
    for (const s of inputs) {
      expect(run(cur.requireDecimalUIntString, s), JSON.stringify(s)).toEqual(run(old.requireDecimalUIntString, s));
    }
  });

  it("safeBigInt: identical", () => {
    for (const s of inputs) {
      const a = (f: typeof old.safeBigInt) => {
        try { return { v: String(f(s, "caller")) }; } catch (e) { return { m: (e as Error).message, n: (e as Error).name }; }
      };
      expect(a(cur.safeBigInt), JSON.stringify(s)).toEqual(a(old.safeBigInt));
    }
  });

  it("non-string input throws the same TypeError class", () => {
    for (const bad of [undefined, null, 5, {}] as unknown as string[]) {
      for (const name of fns) {
        const a = run(old[name], bad), b = run(cur[name], bad);
        expect(b.ok).toBe(false);
        expect(b.ok === false && b.name).toBe(a.ok === false && a.name);
      }
    }
  });
});
