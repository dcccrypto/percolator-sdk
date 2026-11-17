import { describe, it, expect } from "vitest";
import { parseAdlEvent } from "../src/solana/adl.js";

const P = "Perc1111111111111111111111111111111111111";
const X = "Other11111111111111111111111111111111111";
const ev = (i = "0x1", p = "0x2", lo = "0x3", hi = "0x0") =>
  `Program log: 0xad1e0001, ${i}, ${p}, ${lo}, ${hi}`;
const OK = { tag: 0xad1e0001n, targetIdx: 1, price: 2n, closedAbs: 3n };

describe("parseAdlEvent field range checks", () => {
  it("rejects a closedLo wider than 64 bits", () => {
    expect(parseAdlEvent([ev("0x1", "0x2", "0x1" + "0".repeat(16) + "5")])).toBeNull();
  });
  it("rejects price/closedHi wider than 64 bits", () => {
    expect(parseAdlEvent([ev("0x1", "0x1" + "0".repeat(16))])).toBeNull();
    expect(parseAdlEvent([ev("0x1", "0x2", "0x3", "0x1" + "0".repeat(16))])).toBeNull();
  });
  it("rejects targetIdx beyond Number.MAX_SAFE_INTEGER, skips to next valid line", () => {
    expect(parseAdlEvent([ev("0x" + "f".repeat(16))])).toBeNull();
    expect(parseAdlEvent([ev("0x" + "f".repeat(16)), ev()])).toEqual(OK);
  });
  it("accepts full u64 lo/hi", () => {
    const f = "0x" + "f".repeat(16);
    expect(parseAdlEvent([ev("0x1", "0x2", f, f)])?.closedAbs).toBe((1n << 128n) - 1n);
  });
});

describe("parseAdlEvent CPI stack tracking", () => {
  it("accepts a top-level line after a nested Percolator self-CPI returns", () => {
    expect(parseAdlEvent([`Program ${P} invoke [1]`, `Program ${P} invoke [2]`, `Program ${P} success`, ev(), `Program ${P} success`], P)).toEqual(OK);
  });
  it("accepts a Percolator line after P->X->P nesting unwinds", () => {
    expect(parseAdlEvent([`Program ${P} invoke [1]`, `Program ${X} invoke [2]`, `Program ${P} invoke [3]`, `Program ${P} success`, `Program ${X} success`, ev(), `Program ${P} success`], P)).toEqual(OK);
  });
  it("ignores a line logged by a callee (even after a nested P returned)", () => {
    expect(parseAdlEvent([`Program ${P} invoke [1]`, `Program ${X} invoke [2]`, `Program ${P} invoke [3]`, `Program ${P} success`, ev(), `Program ${X} success`, `Program ${P} success`], P)).toBeNull();
  });
  it("accepts a Percolator line after a failed callee with a message", () => {
    expect(parseAdlEvent([`Program ${P} invoke [1]`, `Program ${X} invoke [2]`, `Program ${X} failed: custom program error: 0x1`, ev(), `Program ${P} success`], P)).toEqual(OK);
  });
  it("ignores a callee line while the callee is running", () => {
    expect(parseAdlEvent([`Program ${P} invoke [1]`, `Program ${X} invoke [2]`, ev(), `Program ${X} success`, `Program ${P} success`], P)).toBeNull();
  });
});
