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
import { LAYOUT_V22 } from "../src/abi/layout.js";
import { encodeMatcherBatchCall, encodeWrapperMatcherCallExt } from "../src/abi/matcher-v2.js";

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

// J-20261123-SDK-REPORT-ENCODERNUMGUARDSWEEP N1-N3: unguarded Number fields must throw instead of wrapping.
const withLen = (accountLen: number) => ({ ...LAYOUT_V22, portfolio: { ...LAYOUT_V22.portfolio, accountLen } });
const BAD = [NaN, 1.5, -1, 2 ** 53, Infinity];

// N1: createAccount `space` (u64 @12) comes from layout.portfolio.accountLen with no guard: NaN -> 0 bytes, 1.5 -> 1 byte,
// while `lamports` (guarded by F3) is still paid in full into the wrong-size program-owned account.
describe("N1 createAccount space (layout.portfolio.accountLen)", () => {
  it.each(BAD)("buildCreatePortfolioAccountIxV22 accountLen %s throws", (n) => {
    expect(() => buildCreatePortfolioAccountIxV22(pk(1), pk(2), 2_000_000, pk(3), withLen(n))).toThrow(/accountLen|space/);
  });
  it.each(BAD)("buildCreateLpPortfolioIxV22 accountLen %s throws", (n) => {
    expect(() => buildCreateLpPortfolioIxV22(pk(1), pk(2), 2_000_000, pk(3), withLen(n))).toThrow(/accountLen|space/);
  });
  it("the default layout still encodes its exact length", () => {
    const d = buildCreatePortfolioAccountIxV22(pk(1), pk(2), 2_000_000, pk(3)).data;
    expect(Buffer.from(d).readBigUInt64LE(12)).toBe(BigInt(LAYOUT_V22.portfolio.accountLen));
  });
});

// N2: matcher batch leg asset index (u16 @18 + 26*i) goes through DataView.setUint16: NaN/Inf/2^16 -> 0, -1 -> 65535, 1.5 -> 1.
describe("N2 encodeMatcherBatchCall legs[].assetIndex", () => {
  const leg = (assetIndex: number) => ({ assetIndex, oraclePriceE6: 1_000_000n, reqSize: 5n });
  it.each([NaN, 1.5, -1, 65_536, Infinity])("assetIndex %s throws", (a) => {
    expect(() => encodeMatcherBatchCall(7n, 1n, [leg(a)])).toThrow(/assetIndex/);
  });
  it("0 and 65535 still encode", () => {
    expect(Buffer.from(encodeMatcherBatchCall(7n, 1n, [leg(65_535)])).readUInt16LE(18)).toBe(65_535);
    expect(Buffer.from(encodeMatcherBatchCall(7n, 1n, [leg(0)])).readUInt16LE(18)).toBe(0);
  });
});

// N3: wrapper matcher-call ext mode: anything but exactly 1 (NaN, 1.5, -1, 256) silently yields the 24-byte zero ext,
// i.e. the band / headroom / reducing bits are dropped. Only the documented modes 0 and 1 should be accepted.
describe("N3 encodeWrapperMatcherCallExt mode", () => {
  it.each([NaN, 1.5, -1, 256, Infinity])("mode %s throws", (m) => {
    expect(() => encodeWrapperMatcherCallExt(m, 505_000_000n, 1_000_000n, 300, false, false)).toThrow(/mode/);
  });
  it("mode 0 is the zero ext, mode 1 carries the band", () => {
    expect([...encodeWrapperMatcherCallExt(0, 1n, 1n, 300, false, false)].every((b) => b === 0)).toBe(true);
    expect([...encodeWrapperMatcherCallExt(1, 1n, 1n, 300, false, false)].some((b) => b !== 0)).toBe(true);
  });
});
