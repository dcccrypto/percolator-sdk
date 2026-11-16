import { describe, it, expect } from "vitest";
import { displayPriceV22, lotExpForTokenPriceV22, tokensToLotsV22 } from "../src/abi/v22-math.js";
import { displayPriceRef, lotExpForTokenPriceRef, tokensToLotsRef } from "./helpers/v22-math-ref.js";

const U64 = (1n << 64n) - 1n;
const U128 = (1n << 128n) - 1n;
let seed = 987654321;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const rbig = (bits: number): bigint => {
  let v = 0n;
  for (let i = 0; i < bits; i += 30) v = (v << 30n) | BigInt(Math.floor(rnd() * 2 ** 30));
  return v & ((1n << BigInt(bits)) - 1n);
};
const edge: bigint[] = [0n, 1n, 2n, 9n, 10n, 11n, 99n, 100n, 999_999n, 1_000_000n, 9_999_999n, 10_000_000n, 10_000_001n, U64 - 1n, U64, U64 + 1n, U128 - 1n, U128, U128 + 1n];
const withNeg = [...edge, ...edge.map((x) => -x)];
const pow10Edges: bigint[] = [];
for (let k = 0; k <= 16; k++) for (const d of [-1n, 0n, 1n]) pow10Edges.push(10n ** BigInt(k) + d, -(10n ** BigInt(k) + d), 10_000_000n / 10n ** BigInt(k) + d);

const call = <T,>(f: () => T): { v?: T; e?: string } => { try { return { v: f() }; } catch (e) { return { e: (e as Error).message }; } };

describe("v22-math perf rewrite is output-identical", () => {
  it("lotExpForTokenPriceV22: edges + 100k random", () => {
    for (const x of [...withNeg, ...pow10Edges]) expect(lotExpForTokenPriceV22(x)).toBe(lotExpForTokenPriceRef(x));
    let bad = 0;
    for (let i = 0; i < 100_000; i++) {
      const x = rbig(1 + Math.floor(rnd() * 128)) * (rnd() < 0.1 ? -1n : 1n);
      if (lotExpForTokenPriceV22(x) !== lotExpForTokenPriceRef(x)) bad++;
    }
    expect(bad).toBe(0);
  }, 60_000);
  it("lotExpForTokenPriceV22 still throws on non-bigint input", () => {
    for (const x of [5, "5", NaN, 1e7] as unknown[]) {
      expect(() => lotExpForTokenPriceRef(x as bigint)).toThrow();
      expect(() => lotExpForTokenPriceV22(x as bigint)).toThrow();
    }
  });
  it("displayPriceV22: edges x all lotExp (+ invalid) + 100k random", () => {
    for (const x of [...withNeg, ...pow10Edges]) for (const k of [-1, 0, 1, 5, 15, 16, 1.5, NaN]) expect(call(() => displayPriceV22(x, k))).toEqual(call(() => displayPriceRef(x, k)));
    let bad = 0;
    for (let i = 0; i < 100_000; i++) {
      const x = rbig(1 + Math.floor(rnd() * 128)) * (rnd() < 0.1 ? -1n : 1n) * (rnd() < 0.3 ? 10n ** BigInt(Math.floor(rnd() * 10)) : 1n);
      const k = Math.floor(rnd() * 16);
      if (displayPriceV22(x, k) !== displayPriceRef(x, k)) bad++;
    }
    expect(bad).toBe(0);
  }, 60_000);
  it("tokensToLotsV22: edges x all lotExp (+ invalid) + 100k random", () => {
    for (const x of [...withNeg, ...pow10Edges]) for (const k of [-1, 0, 1, 5, 15, 16, 1.5, NaN]) expect(call(() => tokensToLotsV22(x, k))).toEqual(call(() => tokensToLotsRef(x, k)));
    let bad = 0;
    for (let i = 0; i < 100_000; i++) {
      const x = rbig(1 + Math.floor(rnd() * 128)) * (rnd() < 0.3 ? -1n : 1n);
      const k = Math.floor(rnd() * 16);
      const a = tokensToLotsV22(x, k), b = tokensToLotsRef(x, k);
      if (a.lots !== b.lots || a.remainderTokens !== b.remainderTokens) bad++;
    }
    expect(bad).toBe(0);
  }, 60_000);
});
