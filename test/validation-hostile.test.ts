import { describe, it, expect } from "vitest";
import {
  ValidationError,
  requireDecimalUIntString,
  safeBigInt,
  validateAmount,
  validateU64,
  validateU128,
  validateI64,
  validateI128,
  validateIndex,
  validateU16,
  validateBps,
} from "../src/validation.js";

const hostile = [
  "NaN", "Infinity", "-Infinity", "", "   ", "1.0", "1e3", "0x10", "1_000",
  "12abc", "12 3", "+5", "--1", "٣", "1n", "00", "01", "\u0000", "1\n2",
];
const unsignedFns: Array<[string, (v: string, f: string) => unknown]> = [
  ["validateAmount", validateAmount],
  ["validateU64", validateU64],
  ["validateU128", validateU128],
  ["validateIndex", validateIndex],
  ["validateU16", validateU16],
  ["validateBps", validateBps],
];

describe("validation hostile inputs", () => {
  for (const [name, fn] of unsignedFns) {
    it(`${name} rejects hostile strings and negatives incl. -0`, () => {
      for (const h of [...hostile, "-1", "-0"]) {
        expect(() => fn(h, "f"), `${name}(${JSON.stringify(h)})`).toThrow(ValidationError);
      }
    });
  }

  it("signed validators reject hostile strings", () => {
    for (const fn of [validateI64, validateI128]) {
      for (const h of hostile) {
        expect(() => fn(h, "f"), JSON.stringify(h)).toThrow(ValidationError);
      }
    }
  });

  it("allows surrounding whitespace but returns trimmed value", () => {
    expect(requireDecimalUIntString(" 42\n", "f")).toBe("42");
    expect(() => requireDecimalUIntString("  ", "f")).toThrow(/not a valid number/);
  });

  it("keeps precision above 2^53 as bigint", () => {
    expect(validateAmount("9007199254740993", "f")).toBe(9007199254740993n);
    expect(validateU128("340282366920938463463374607431768211455", "f")).toBe((1n << 128n) - 1n);
    expect(validateI64("-9007199254740993", "f")).toBe(-9007199254740993n);
    expect(validateI128("-9007199254740993123", "f")).toBe(-9007199254740993123n);
  });

  it("enforces exact boundaries", () => {
    expect(validateAmount("18446744073709551615", "f")).toBe((1n << 64n) - 1n);
    expect(() => validateAmount("18446744073709551616", "f")).toThrow(/u64 max/);
    expect(() => validateU128("340282366920938463463374607431768211456", "f")).toThrow(/u128 max/);
    expect(validateI64("-9223372036854775808", "f")).toBe(-(1n << 63n));
    expect(() => validateI64("-9223372036854775809", "f")).toThrow(/i64 min/);
    expect(() => validateI64("9223372036854775808", "f")).toThrow(/i64 max/);
    expect(() => validateI128("-170141183460469231731687303715884105729", "f")).toThrow(/i128 min/);
    expect(() => validateI128("170141183460469231731687303715884105728", "f")).toThrow(/i128 max/);
    expect(validateIndex("65535", "f")).toBe(65535);
    expect(() => validateIndex("65536", "f")).toThrow(/u16 max/);
    expect(() => validateU16("65536", "f")).toThrow(/u16 max/);
    expect(validateBps("10000", "f")).toBe(10000);
    expect(() => validateBps("10001", "f")).toThrow(/10000/);
  });

  it("-0 signed parses to 0n (not negative zero)", () => {
    expect(Object.is(validateI64("-0", "f"), 0n)).toBe(true);
    expect(validateI128("-0", "f")).toBe(0n);
  });

  it("safeBigInt rejects non-strings-as-decimal", () => {
    for (const h of ["NaN", "", "1.5", "0x1", "1e5", "1_0", "007"]) {
      expect(() => safeBigInt(h, "caller")).toThrow(/caller/);
    }
    expect(safeBigInt(" -42 ", "c")).toBe(-42n);
  });
});
