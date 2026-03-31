import { describe, it, expect } from "vitest";
import {
  encU8, encU16, encU32, encU64, encI64, encU128, encI128, encPubkey, concatBytes,
} from "../src/abi/encode.js";

describe("encU8", () => {
  it("encodes 0", () => expect(encU8(0)).toEqual(new Uint8Array([0])));
  it("encodes 255", () => expect(encU8(255)).toEqual(new Uint8Array([255])));
  it("throws on out-of-range instead of wrapping", () => {
    expect(() => encU8(256)).toThrow(/encU8/);
    expect(() => encU8(-1)).toThrow(/encU8/);
    expect(() => encU8(1.5)).toThrow(/encU8/);
  });
});

describe("encU16", () => {
  it("encodes 0", () => expect(encU16(0)).toEqual(new Uint8Array([0, 0])));
  it("encodes 256 LE", () => expect(encU16(256)).toEqual(new Uint8Array([0, 1])));
  it("encodes 0xabcd LE", () => expect(encU16(0xabcd)).toEqual(new Uint8Array([0xcd, 0xab])));
  it("encodes 65535", () => expect(encU16(65535)).toEqual(new Uint8Array([255, 255])));
  it("throws on out-of-range instead of DataView modulo wrap", () => {
    expect(() => encU16(65536)).toThrow(/encU16/);
    expect(() => encU16(-1)).toThrow(/encU16/);
    expect(() => encU16(1.5)).toThrow(/encU16/);
  });
});

describe("encU32", () => {
  it("encodes 0", () => expect(encU32(0)).toEqual(new Uint8Array([0, 0, 0, 0])));
  it("encodes 1", () => expect(encU32(1)).toEqual(new Uint8Array([1, 0, 0, 0])));
  it("encodes 0x01020304", () => expect(encU32(0x01020304)).toEqual(new Uint8Array([4, 3, 2, 1])));
  it("throws on out-of-range instead of DataView modulo wrap", () => {
    expect(() => encU32(4_294_967_296)).toThrow(/encU32/);
    expect(() => encU32(-1)).toThrow(/encU32/);
    expect(() => encU32(1.5)).toThrow(/encU32/);
  });
});

describe("encU64", () => {
  it("encodes 0n", () => expect(encU64(0n)).toEqual(new Uint8Array(8)));
  it("encodes 1n", () => expect(encU64(1n)).toEqual(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])));
  it("encodes string '1000000'", () => expect(encU64("1000000")).toEqual(new Uint8Array([64, 66, 15, 0, 0, 0, 0, 0])));
  it("encodes u64 max", () => expect(encU64(0xffff_ffff_ffff_ffffn)).toEqual(new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255])));
  it("throws on negative", () => expect(() => encU64(-1n)).toThrow());
});

describe("encI64", () => {
  it("encodes 0n", () => expect(encI64(0n)).toEqual(new Uint8Array(8)));
  it("encodes -1n", () => expect(encI64(-1n)).toEqual(new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255])));
  it("encodes -2n", () => expect(encI64(-2n)).toEqual(new Uint8Array([254, 255, 255, 255, 255, 255, 255, 255])));
  it("encodes string '-100'", () => expect(encI64("-100")).toEqual(new Uint8Array([156, 255, 255, 255, 255, 255, 255, 255])));
});

describe("encU128", () => {
  it("encodes 0n", () => expect(encU128(0n)).toEqual(new Uint8Array(16)));
  it("encodes 1n", () => {
    const expected = new Uint8Array(16);
    expected[0] = 1;
    expect(encU128(1n)).toEqual(expected);
  });
  it("encodes 2^64", () => {
    const expected = new Uint8Array(16);
    expected[8] = 1;
    expect(encU128(1n << 64n)).toEqual(expected);
  });
  it("throws on negative", () => expect(() => encU128(-1n)).toThrow());
});

describe("encI128", () => {
  it("encodes 0n", () => expect(encI128(0n)).toEqual(new Uint8Array(16)));
  it("encodes -1n", () => expect(encI128(-1n)).toEqual(new Uint8Array(16).fill(255)));
  it("encodes 1000000n", () => {
    const expected = new Uint8Array(16);
    expected[0] = 64; expected[1] = 66; expected[2] = 15;
    expect(encI128(1000000n)).toEqual(expected);
  });
  it("encodes -1000000n", () => {
    expect(encI128(-1000000n)).toEqual(new Uint8Array([192, 189, 240, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]));
  });
});

describe("encPubkey", () => {
  it("rejects invalid base58 with descriptive error", () => {
    expect(() => encPubkey("not-a-valid-base58!!!")).toThrow(/encPubkey.*invalid public key/i);
  });
  it("includes the bad value in the error message", () => {
    expect(() => encPubkey("$$$bad$$$")).toThrow("$$$bad$$$");
  });
  it("accepts a valid base58 public key string", () => {
    const bytes = encPubkey("11111111111111111111111111111111");
    expect(bytes.length).toBe(32);
  });
});

describe("concatBytes", () => {
  it("concatenates empty", () => expect(concatBytes()).toEqual(new Uint8Array(0)));
  it("concatenates multiple", () => {
    expect(concatBytes(new Uint8Array([1, 2]), new Uint8Array([3]))).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("encU8 range validation", () => {
  it("rejects negative values", () => expect(() => encU8(-1)).toThrow("out of range"));
  it("rejects values > 255", () => expect(() => encU8(256)).toThrow("out of range"));
  it("rejects 300 (was silently truncated to 44)", () => expect(() => encU8(300)).toThrow("out of range"));
  it("rejects NaN", () => expect(() => encU8(NaN)).toThrow("out of range"));
  it("rejects floats", () => expect(() => encU8(1.5)).toThrow("out of range"));
  it("accepts boundary 0", () => expect(encU8(0)).toEqual(new Uint8Array([0])));
  it("accepts boundary 255", () => expect(encU8(255)).toEqual(new Uint8Array([255])));
});

describe("encU16 range validation", () => {
  it("rejects negative values", () => expect(() => encU16(-1)).toThrow("out of range"));
  it("rejects values > 65535", () => expect(() => encU16(65536)).toThrow("out of range"));
  it("rejects 70000 (was silently truncated to 4464)", () => expect(() => encU16(70000)).toThrow("out of range"));
  it("accepts boundary 0", () => expect(encU16(0)[0]).toBe(0));
  it("accepts boundary 65535", () => {
    const buf = encU16(65535);
    expect(buf[0]).toBe(255);
    expect(buf[1]).toBe(255);
  });
});

describe("encU32 range validation", () => {
  it("rejects negative values", () => expect(() => encU32(-1)).toThrow("out of range"));
  it("rejects values > 2^32-1", () => expect(() => encU32(2 ** 32)).toThrow("out of range"));
  it("accepts boundary 0", () => expect(encU32(0)[0]).toBe(0));
  it("accepts boundary 2^32-1", () => {
    const buf = encU32(0xFFFFFFFF);
    expect(buf.every(b => b === 255)).toBe(true);
  });
});
