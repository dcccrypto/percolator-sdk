import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  ValidationError,
  requireDecimalUIntString,
  safeBigInt,
  validatePublicKey,
  validateIndex,
  validateAmount,
  validateU128,
  validateI64,
  validateI128,
  validateBps,
  validateU64,
  validateU16,
} from "../src/validation.js";

const U64_MAX = 2n ** 64n - 1n;
const U128_MAX = 2n ** 128n - 1n;
const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;
const I128_MIN = -(2n ** 127n);
const I128_MAX = 2n ** 127n - 1n;

const rejectsNonDecimal = ["", "  ", "1.5", "1e5", "0x10", "01", "-1", "1_000", "12abc", "+1"];

describe("requireDecimalUIntString", () => {
  it("trims and returns plain decimal strings", () => {
    expect(requireDecimalUIntString("  123 ", "f")).toBe("123");
    expect(requireDecimalUIntString("0", "f")).toBe("0");
  });
  it("rejects empty with a distinct message", () => {
    expect(() => requireDecimalUIntString("  ", "amt")).toThrow('Invalid amt: "  " is not a valid number');
  });
  it.each(rejectsNonDecimal.filter((s) => s.trim() !== ""))("rejects %j", (s) => {
    expect(() => requireDecimalUIntString(s, "f")).toThrow(ValidationError);
    expect(() => requireDecimalUIntString(s, "f")).toThrow(/non-negative integer/);
  });
  it("ValidationError carries field and name", () => {
    try {
      requireDecimalUIntString("x", "myField");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).field).toBe("myField");
      expect((e as ValidationError).name).toBe("ValidationError");
      return;
    }
    throw new Error("did not throw");
  });
});

describe("safeBigInt", () => {
  it("parses signed decimals, trimming whitespace", () => {
    expect(safeBigInt(" -42 ", "c")).toBe(-42n);
    expect(safeBigInt("0", "c")).toBe(0n);
    expect(safeBigInt(I64_MIN.toString(), "c")).toBe(I64_MIN);
  });
  it.each(["0x1", "1e5", "1_0", "1.0", "", "--1", "-01"])("rejects %j with caller name", (s) => {
    expect(() => safeBigInt(s, "encU64")).toThrow(/^encU64: /);
  });
});

describe("validatePublicKey", () => {
  it("accepts a valid base58 key", () => {
    const k = validatePublicKey("11111111111111111111111111111111", "--slab");
    expect(k).toBeInstanceOf(PublicKey);
    expect(k.toBase58()).toBe("11111111111111111111111111111111");
  });
  it("rejects garbage, naming the field", () => {
    expect(() => validatePublicKey("not-a-key", "--slab")).toThrow(/Invalid --slab: "not-a-key" is not a valid base58 public key/);
  });
});

describe("unsigned bounded validators", () => {
  it("validateAmount / validateU64 accept 0 and u64 max, reject max+1", () => {
    for (const fn of [validateAmount, validateU64]) {
      expect(fn("0", "f")).toBe(0n);
      expect(fn(U64_MAX.toString(), "f")).toBe(U64_MAX);
      expect(() => fn((U64_MAX + 1n).toString(), "f")).toThrow(/u64 max/);
    }
  });
  it("validateAmount rejects negatives and fractions", () => {
    expect(() => validateAmount("-1", "f")).toThrow(ValidationError);
    expect(() => validateAmount("1.5", "f")).toThrow(ValidationError);
  });
  it("validateU128 boundaries", () => {
    expect(validateU128(U128_MAX.toString(), "f")).toBe(U128_MAX);
    expect(validateU128("0", "f")).toBe(0n);
    expect(() => validateU128((U128_MAX + 1n).toString(), "f")).toThrow(/u128 max/);
    expect(() => validateU128("-1", "f")).toThrow(ValidationError);
  });
  it("validateIndex / validateU16 boundaries at 65535", () => {
    for (const fn of [validateIndex, validateU16]) {
      expect(fn("0", "f")).toBe(0);
      expect(fn("65535", "f")).toBe(65535);
      expect(() => fn("65536", "f")).toThrow(/u16 max/);
      expect(() => fn("-1", "f")).toThrow(ValidationError);
    }
  });
  it("validateBps boundaries at 10000", () => {
    expect(validateBps("0", "f")).toBe(0);
    expect(validateBps("10000", "f")).toBe(10000);
    expect(() => validateBps("10001", "f")).toThrow(/must be <= 10000/);
    expect(() => validateBps("1e3", "f")).toThrow(ValidationError);
  });
});

describe("signed bounded validators", () => {
  it("validateI64 boundaries", () => {
    expect(validateI64(I64_MIN.toString(), "f")).toBe(I64_MIN);
    expect(validateI64(I64_MAX.toString(), "f")).toBe(I64_MAX);
    expect(validateI64("-5", "f")).toBe(-5n);
    expect(() => validateI64((I64_MIN - 1n).toString(), "f")).toThrow(/i64 min/);
    expect(() => validateI64((I64_MAX + 1n).toString(), "f")).toThrow(/i64 max/);
  });
  it("signed validators accept -0 as 0n; unsigned reject it", () => {
    expect(validateI64("-0", "f")).toBe(0n);
    expect(validateI128("-0", "f")).toBe(0n);
    expect(() => validateAmount("-0", "f")).toThrow(ValidationError);
  });
  it("validateI128 boundaries", () => {
    expect(validateI128(I128_MIN.toString(), "f")).toBe(I128_MIN);
    expect(validateI128(I128_MAX.toString(), "f")).toBe(I128_MAX);
    expect(() => validateI128((I128_MIN - 1n).toString(), "f")).toThrow(/i128 min/);
    expect(() => validateI128((I128_MAX + 1n).toString(), "f")).toThrow(/i128 max/);
  });
  it.each(["0x1", "1e5", "1.5", "", "abc"])("both reject non-decimal %j as ValidationError", (s) => {
    expect(() => validateI64(s, "f")).toThrow(ValidationError);
    expect(() => validateI128(s, "f")).toThrow(/Invalid f: .* is not a valid number/);
  });
});
