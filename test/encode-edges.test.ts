import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  encU8, encU16, encU32, encU64, encI64, encU128, encI128,
  encPubkey, encBool, concatBytes,
} from "../src/abi/encode.js";

const U64_MAX = (1n << 64n) - 1n;
const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;

const bigFns = [
  ["encU64", encU64], ["encI64", encI64], ["encU128", encU128], ["encI128", encI128],
] as const;

describe("parseDecimalBigInt via big encoders", () => {
  for (const [name, fn] of bigFns) {
    describe(name, () => {
      it.each([123, null, undefined, {}, true, 1.5])("rejects non-string/bigint %s", (v) => {
        expect(() => fn(v as never)).toThrow(`${name}: value must be bigint or decimal integer string`);
      });
      it.each(["01", "+1", " 1", "1 ", "1e3", "0x10", "", "-", "1.0", "--1", "-01"])(
        "rejects malformed string %j",
        (s) => {
          expect(() => fn(s)).toThrow(`${name}: value must be a decimal integer string`);
        },
      );
      it("accepts '-0' as zero and bigint 0n", () => {
        const zero = fn(0n);
        expect(fn("-0")).toEqual(zero);
        expect(fn("0")).toEqual(zero);
      });
    });
  }
});

describe("encU8/U16/U32 bounds", () => {
  const cases = [
    ["encU8", encU8, 255, 1],
    ["encU16", encU16, 65535, 2],
    ["encU32", encU32, 4294967295, 4],
  ] as const;
  for (const [name, fn, max, len] of cases) {
    it(`${name} accepts 0 and max`, () => {
      expect(fn(0)).toEqual(new Uint8Array(len));
      expect(fn(max)).toEqual(new Uint8Array(len).fill(0xff));
    });
    it(`${name} rejects -1, max+1, non-integers, NaN, Infinity`, () => {
      for (const v of [-1, max + 1, 1.5, NaN, Infinity, -Infinity]) {
        expect(() => fn(v)).toThrow(`${name}: value out of range`);
      }
    });
    it(`${name} rejects non-number input`, () => {
      expect(() => fn("1" as never)).toThrow(`${name}: value out of range`);
    });
  }
  it("is little-endian", () => {
    expect(encU16(0x0102)).toEqual(new Uint8Array([2, 1]));
    expect(encU32(0x01020304)).toEqual(new Uint8Array([4, 3, 2, 1]));
  });
});

describe("64/128-bit exact bounds", () => {
  it("encU64 min/max and one past", () => {
    expect(encU64(0n)).toEqual(new Uint8Array(8));
    expect(encU64(U64_MAX)).toEqual(new Uint8Array(8).fill(0xff));
    expect(encU64(U64_MAX.toString())).toEqual(new Uint8Array(8).fill(0xff));
    expect(() => encU64(-1n)).toThrow("encU64: value must be non-negative");
    expect(() => encU64(U64_MAX + 1n)).toThrow("encU64: value exceeds u64 max");
  });
  it("encI64 min/max and one past", () => {
    expect(encI64(I64_MIN)).toEqual(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0x80]));
    expect(encI64(I64_MAX)).toEqual(new Uint8Array([255, 255, 255, 255, 255, 255, 255, 0x7f]));
    expect(encI64(-1n)).toEqual(new Uint8Array(8).fill(0xff));
    expect(encI64(I64_MIN.toString())).toEqual(encI64(I64_MIN));
    expect(() => encI64(I64_MIN - 1n)).toThrow("encI64: value out of range");
    expect(() => encI64(I64_MAX + 1n)).toThrow("encI64: value out of range");
  });
  it("encU128 min/max and one past", () => {
    expect(encU128(0n)).toEqual(new Uint8Array(16));
    expect(encU128(U128_MAX)).toEqual(new Uint8Array(16).fill(0xff));
    expect(encU128(1n << 64n)).toEqual(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]));
    expect(() => encU128(-1n)).toThrow("encU128: value must be non-negative");
    expect(() => encU128(U128_MAX + 1n)).toThrow("encU128: value exceeds u128 max");
  });
  it("encI128 min/max and one past", () => {
    const min = new Uint8Array(16);
    min[15] = 0x80;
    const max = new Uint8Array(16).fill(0xff);
    max[15] = 0x7f;
    expect(encI128(I128_MIN)).toEqual(min);
    expect(encI128(I128_MAX)).toEqual(max);
    expect(encI128(-1n)).toEqual(new Uint8Array(16).fill(0xff));
    expect(encI128(5n)[0]).toBe(5);
    expect(() => encI128(I128_MIN - 1n)).toThrow("encI128: value out of range");
    expect(() => encI128(I128_MAX + 1n)).toThrow("encI128: value out of range");
  });
});

describe("encPubkey", () => {
  const kp = Keypair.generate().publicKey;

  it("accepts PublicKey and base58 string", () => {
    expect(encPubkey(kp)).toEqual(kp.toBytes());
    expect(encPubkey(kp.toBase58())).toEqual(kp.toBytes());
  });
  it("rejects bad base58 string", () => {
    expect(() => encPubkey("not-a-key!")).toThrow(/encPubkey: invalid public key "not-a-key!"/);
  });
  it("rejects null / undefined / objects without toBytes", () => {
    expect(() => encPubkey(null as never)).toThrow("value must be a PublicKey or base58 string");
    expect(() => encPubkey(undefined as never)).toThrow("value must be a PublicKey or base58 string");
    expect(() => encPubkey({} as never)).toThrow("value must be a PublicKey or base58 string");
    expect(() => encPubkey({ toBytes: 5 } as never)).toThrow("value must be a PublicKey or base58 string");
  });
  it("rejects toBytes() not returning Uint8Array", () => {
    const fake = { toBytes: () => [1, 2, 3] };
    expect(() => encPubkey(fake as unknown as PublicKey)).toThrow("toBytes() must return a Uint8Array");
  });
  it("rejects wrong-length bytes", () => {
    const short = { toBytes: () => new Uint8Array(31) };
    const long = { toBytes: () => new Uint8Array(33) };
    expect(() => encPubkey(short as unknown as PublicKey)).toThrow("expected 32 bytes, got 31");
    expect(() => encPubkey(long as unknown as PublicKey)).toThrow("expected 32 bytes, got 33");
  });
  it("wraps non-Error throws from toBytes()", () => {
    const bad = { toBytes: () => { throw "boom"; } };
    expect(() => encPubkey(bad as unknown as PublicKey)).toThrow(/— boom$/);
  });
});

describe("encBool / concatBytes", () => {
  it("encBool", () => {
    expect(encBool(true)).toEqual(new Uint8Array([1]));
    expect(encBool(false)).toEqual(new Uint8Array([0]));
  });
  it("concatBytes", () => {
    expect(concatBytes()).toEqual(new Uint8Array(0));
    expect(concatBytes(new Uint8Array([1]), new Uint8Array(0), new Uint8Array([2, 3]))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
});
