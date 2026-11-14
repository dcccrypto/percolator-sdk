import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { LAYOUT_V22 } from "../src/abi/layout.js";
import { parseBackingBucketsV17 } from "../src/solana/backing-bucket.js";
import { stampHeader } from "./helpers/stamp.js";

// Pins parseBackingBucketsV17 output for seeded fixtures. EXPECTED_DIGEST was
// produced by the implementation before the single-DataView change.
function fixture(seed0: number): Uint8Array {
  let seed = seed0;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };
  const L = LAYOUT_V22;
  const b = new Uint8Array(L.marketGroupOff + L.marketGroupLen + 8 * L.assetSlotStride);
  for (let i = 0; i < b.length; i++) b[i] = rnd() & 0xff;
  return stampHeader(b, 1, L.version);
}

const dump = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));

describe("parseBackingBucketsV17 decode parity", () => {
  it("is stable across offsets and chainSlot options", () => {
    const base = fixture(0x1234abcd);
    // Same bytes at a non-zero byteOffset must decode identically.
    const padded = new Uint8Array(base.length + 13);
    padded.set(base, 13);
    const shifted = padded.subarray(13);
    for (const opts of [{}, { chainSlot: 0 }, { chainSlot: 5n }, { chainSlot: 2n ** 63n }]) {
      expect(dump(parseBackingBucketsV17(shifted, opts))).toBe(dump(parseBackingBucketsV17(base, opts)));
    }
    const s = parseBackingBucketsV17(base);
    expect(s.buckets.length).toBe(s.addressableDomainCount);
    expect(s.buckets[1]!.side).toBe("short");
  });

  it("matches pinned digest", () => {
    const s = parseBackingBucketsV17(fixture(0x1234abcd), { chainSlot: 1000n });
    expect(createHash("sha256").update(dump(s)).digest("hex")).toBe(EXPECTED);
  });
});

const EXPECTED = "71787f2d7e18c7754aff2bf9c4f97fe41e467374c74fc1ad6879a94a4cdf1116";
