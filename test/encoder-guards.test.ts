/**
 * Regression tests for J-20261121-SDK-REPORT-ENCODERRANGEFUZZ findings F2, F3, F5:
 * out-of-range / non-integer Number inputs must throw instead of wrapping or truncating.
 */
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { encodeMatcherReturn } from "../src/abi/instructions.js";
import { buildCreatePortfolioAccountIxV22, buildCreateLpPortfolioIxV22, computeBudgetPrelude } from "../src/solana/v22.js";
import { buildCreateVaultLpMatcherCtxIxP3 } from "../src/solana/p3-vault-lp.js";
import { computeBudgetInstructions } from "../src/runtime/txv1.js";

const pk = (i: number) => new PublicKey(Uint8Array.from({ length: 32 }, (_, j) => (j === 0 ? i : j)));

describe("F2 encodeMatcherReturn backingFeeCapBps", () => {
  const base = { abiVersion: 1, execPriceE6: 1_000_000n, execSize: 5n, reqId: 1n, lpAccountId: 1n, oraclePriceE6: 1_000_000n, assetIndex: 0n, valid: true, partialOk: false, rejected: false };
  it.each([NaN, 1.5, -1, 10_001, Infinity])("backingFeeCapBps %s throws", (c) => {
    expect(() => encodeMatcherReturn({ ...base, backingFeeCapBps: c })).toThrow(/backingFeeCapBps/);
  });
  it.each([0, 1, 10_000])("backingFeeCapBps %s still encodes", (c) => {
    expect(encodeMatcherReturn({ ...base, backingFeeCapBps: c })).toBeInstanceOf(Uint8Array);
  });
});

describe("F3 createAccount lamports", () => {
  const bad = [-1, NaN, 1.5, 2 ** 53 + 1, Infinity];
  it.each(bad)("buildCreatePortfolioAccountIxV22 lamports %s throws", (l) => {
    expect(() => buildCreatePortfolioAccountIxV22(pk(1), pk(2), l, pk(3))).toThrow(/lamports/);
  });
  it.each(bad)("buildCreateLpPortfolioIxV22 lamports %s throws", (l) => {
    expect(() => buildCreateLpPortfolioIxV22(pk(1), pk(2), l, pk(3))).toThrow(/lamports/);
  });
  it.each(bad)("buildCreateVaultLpMatcherCtxIxP3 lamports %s throws", (l) => {
    expect(() => buildCreateVaultLpMatcherCtxIxP3(pk(1), pk(2), l)).toThrow(/lamports/);
  });
  it("valid lamports unchanged", () => {
    expect(buildCreatePortfolioAccountIxV22(pk(1), pk(2), 0, pk(3)).data.length).toBeGreaterThan(0);
    expect(buildCreateLpPortfolioIxV22(pk(1), pk(2), 2_000_000, pk(3)).data.length).toBeGreaterThan(0);
    expect(buildCreateVaultLpMatcherCtxIxP3(pk(1), pk(2), 2 ** 53 - 1).data.length).toBeGreaterThan(0);
  });
});

describe("F5 compute-budget encoders", () => {
  const ok = { computeUnitLimit: 400_000, heapBytes: 131072 };
  it.each([NaN, 1.5, -1, 2 ** 32, Infinity])("computeUnitLimit %s throws", (u) => {
    expect(() => computeBudgetInstructions({ ...ok, computeUnitLimit: u })).toThrow(/computeUnitLimit/);
    expect(() => computeBudgetPrelude(u)).toThrow(/computeUnitLimit/);
  });
  it.each([NaN, 1.5, -1, 2 ** 32])("heapBytes %s throws", (h) => {
    expect(() => computeBudgetInstructions({ ...ok, heapBytes: h })).toThrow(/heapBytes/);
  });
  it.each([NaN, 1.5, -1, 2 ** 53 + 1, Infinity])("priorityMicroLamportsPerCu %s throws", (p) => {
    expect(() => computeBudgetInstructions({ ...ok, priorityMicroLamportsPerCu: p })).toThrow(/priorityMicroLamportsPerCu/);
    expect(() => computeBudgetPrelude(200_000, { priorityMicroLamportsPerCu: p })).toThrow(/priorityMicroLamportsPerCu/);
  });
  it("valid budgets unchanged (0 / undefined priority and heap omit their ix)", () => {
    expect(computeBudgetInstructions({ computeUnitLimit: 1 }).length).toBe(1);
    expect(computeBudgetInstructions({ ...ok, priorityMicroLamportsPerCu: 0 }).length).toBe(2);
    expect(computeBudgetInstructions({ ...ok, priorityMicroLamportsPerCu: 5 }).length).toBe(3);
    expect(computeBudgetInstructions({ computeUnitLimit: 2 ** 32 - 1, heapBytes: 2 ** 32 - 1 }).length).toBe(2);
  });
});
