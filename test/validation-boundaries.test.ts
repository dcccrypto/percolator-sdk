import { describe, it, expect } from "vitest";
import {
  ValidationError,
  safeBigInt,
  validateIndex,
  validateAmount,
  validateU128,
  validateI64,
  validateI128,
  validateBps,
  validateU64,
  validateU16,
} from "../src/validation.js";

/**
 * Boundary table: every numeric validator must reject the same malformed
 * shapes (empty, sign, exponent, hex, whitespace-internal, fraction, underscore)
 * and enforce its exact min/max. Implementation-agnostic (regex or char-code).
 */
const MALFORMED = [
  "", " ", "\t", "\n",
  "+1", "-", "+", "--1",
  "1e5", "1E5", "1e+5", "1e-5",
  "0x0", "0x1F", "0X10", "0b1", "0o7",
  "1 2", "1 2", "- 1",
  "1.", ".5", "1.0", "1,000", "1_000",
  "00", "01", "٣", "１２", "Infinity", "NaN", "null",
];

const U_VALIDATORS: [string, (v: string, f: string) => bigint | number, bigint][] = [
  ["validateIndex", validateIndex, 65535n],
  ["validateU16", validateU16, 65535n],
  ["validateBps", validateBps, 10000n],
  ["validateAmount", validateAmount, 2n ** 64n - 1n],
  ["validateU64", validateU64, 2n ** 64n - 1n],
  ["validateU128", validateU128, 2n ** 128n - 1n],
];

const S_VALIDATORS: [string, (v: string, f: string) => bigint, bigint, bigint][] = [
  ["validateI64", validateI64, -(2n ** 63n), 2n ** 63n - 1n],
  ["validateI128", validateI128, -(2n ** 127n), 2n ** 127n - 1n],
];

describe("unsigned validators: boundary table", () => {
  for (const [name, fn, max] of U_VALIDATORS) {
    describe(name, () => {
      it("accepts 0 and max, with surrounding whitespace trimmed", () => {
        expect(BigInt(fn("0", "f"))).toBe(0n);
        expect(BigInt(fn(max.toString(), "f"))).toBe(max);
        expect(BigInt(fn(`  ${max}\n`, "f"))).toBe(max);
      });

      it("rejects max + 1 and far beyond", () => {
        for (const v of [max + 1n, max * 10n + 7n]) {
          expect(() => fn(v.toString(), "fld")).toThrow(ValidationError);
          expect(() => fn(v.toString(), "fld")).toThrow(/Invalid fld/);
        }
      });

      it.each(MALFORMED)("rejects malformed %j", (v) => {
        expect(() => fn(v, "fld")).toThrow(ValidationError);
      });

      it("rejects negative numbers including -0", () => {
        expect(() => fn("-1", "f")).toThrow(ValidationError);
        expect(() => fn("-0", "f")).toThrow(ValidationError);
      });

      it("reports the field name on the error", () => {
        try {
          fn("abc", "myField");
          expect.unreachable();
        } catch (e) {
          expect(e).toBeInstanceOf(ValidationError);
          expect((e as ValidationError).field).toBe("myField");
        }
      });
    });
  }
});

describe("signed validators: boundary table", () => {
  for (const [name, fn, min, max] of S_VALIDATORS) {
    describe(name, () => {
      it("accepts min, -1, 0, -0, max", () => {
        expect(fn(min.toString(), "f")).toBe(min);
        expect(fn("-1", "f")).toBe(-1n);
        expect(fn("0", "f")).toBe(0n);
        expect(fn("-0", "f")).toBe(0n);
        expect(fn(max.toString(), "f")).toBe(max);
        expect(fn(` ${min} `, "f")).toBe(min);
      });

      it("rejects min - 1 and max + 1", () => {
        expect(() => fn((min - 1n).toString(), "f")).toThrow(/i(64|128) min/);
        expect(() => fn((max + 1n).toString(), "f")).toThrow(/i(64|128) max/);
      });

      it.each(MALFORMED.filter((v) => v !== "-0"))("rejects malformed %j", (v) => {
        expect(() => fn(v, "fld")).toThrow(ValidationError);
      });
    });
  }
});

describe("safeBigInt: boundary table", () => {
  it.each(MALFORMED)("rejects malformed %j with caller name", (v) => {
    expect(() => safeBigInt(v, "caller")).toThrow(/caller/);
  });

  it("is unbounded (range is enforced by callers)", () => {
    expect(safeBigInt(`${2n ** 200n}`, "c")).toBe(2n ** 200n);
    expect(safeBigInt(`-${2n ** 200n}`, "c")).toBe(-(2n ** 200n));
  });

  it("accepts negative zero and trims whitespace", () => {
    expect(safeBigInt("-0", "c")).toBe(0n);
    expect(safeBigInt("\t-42 ", "c")).toBe(-42n);
  });
});
