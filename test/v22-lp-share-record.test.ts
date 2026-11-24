/** Metaplex MetadataV1 reader (src/abi/v22-lp-share.ts): creators option, every truncation/tag edge, string limits. */
import { describe, expect, it } from "vitest";
import { parseLpShareMetadataRecordV22 } from "../src/abi/v22-lp-share.js";

interface Opts {
  key?: number;
  name?: string | Uint8Array;
  symbol?: string;
  uri?: string;
  creators?: "none" | number | { tag: number; count?: number; bytes?: number };
  primarySale?: boolean;
  isMutable?: number | null; // null = omit byte
  trailing?: number;
}

const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let k = 0; for (const x of p) { o.set(x, k); k += x.length; } return o; };
const str = (s: string | Uint8Array) => { const b = typeof s === "string" ? new TextEncoder().encode(s) : s; return cat(u32(b.length), b); };

function rec(o: Opts = {}): Uint8Array {
  const parts: Uint8Array[] = [
    Uint8Array.of(o.key ?? 4),
    new Uint8Array(32).fill(7),
    new Uint8Array(32).fill(8),
    str(o.name ?? "Share"), str(o.symbol ?? "pSH"), str(o.uri ?? "https://x/y"),
    Uint8Array.of(0, 0), // seller_fee_basis_points
  ];
  const c = o.creators ?? "none";
  if (c === "none") parts.push(Uint8Array.of(0));
  else if (typeof c === "number") parts.push(Uint8Array.of(1), u32(c), new Uint8Array(c * 34).fill(0xff));
  else parts.push(Uint8Array.of(c.tag), ...(c.count !== undefined ? [u32(c.count)] : []), new Uint8Array(c.bytes ?? 0));
  parts.push(Uint8Array.of(o.primarySale ? 1 : 0));
  if (o.isMutable !== null) parts.push(Uint8Array.of(o.isMutable ?? 1));
  if (o.trailing) parts.push(new Uint8Array(o.trailing));
  return cat(...parts);
}

describe("parseLpShareMetadataRecordV22 edges", () => {
  it("baseline record parses (mutable, trailing bytes ignored)", () => {
    const r = parseLpShareMetadataRecordV22(rec({ trailing: 10 }));
    expect(r).toMatchObject({ name: "Share", symbol: "pSH", uri: "https://x/y", isMutable: true });
  });

  it("accepts a creators vector of 0..5 entries (34 bytes each) and still reads is_mutable", () => {
    for (const n of [0, 1, 5]) {
      const r = parseLpShareMetadataRecordV22(rec({ creators: n, isMutable: 0 }));
      expect(r).not.toBeNull();
      expect(r!.isMutable).toBe(false);
      expect(r!.symbol).toBe("pSH");
    }
  });

  it("rejects more than 5 creators, a truncated creators body, a missing creators length, and a bad option tag", () => {
    expect(parseLpShareMetadataRecordV22(rec({ creators: { tag: 1, count: 6, bytes: 6 * 34 } }))).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec({ creators: { tag: 1, count: 2, bytes: 34 } }))).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec({ creators: { tag: 1, bytes: 0 } }))).toBeNull(); // no u32 length at all (then reads fall short)
    expect(parseLpShareMetadataRecordV22(rec({ creators: { tag: 2 } }))).toBeNull();
  });

  it("rejects a record cut right after the creators option, after primary_sale, or with is_mutable not 0/1", () => {
    expect(parseLpShareMetadataRecordV22(rec({ primarySale: true, isMutable: null }))).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec({ isMutable: 2 }))).toBeNull();
    const full = rec();
    expect(parseLpShareMetadataRecordV22(full.subarray(0, full.length - 2))).toBeNull(); // no primary_sale byte
  });

  it("enforces the Metaplex string limits (name 32, symbol 10, uri 200) and rejects over-limit lengths", () => {
    expect(parseLpShareMetadataRecordV22(rec({ name: "a".repeat(32) }))!.name).toHaveLength(32);
    expect(parseLpShareMetadataRecordV22(rec({ name: "a".repeat(33) }))).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec({ symbol: "s".repeat(10) }))!.symbol).toHaveLength(10);
    expect(parseLpShareMetadataRecordV22(rec({ symbol: "s".repeat(11) }))).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec({ uri: "u".repeat(200) }))!.uri).toHaveLength(200);
    expect(parseLpShareMetadataRecordV22(rec({ uri: "u".repeat(201) }))).toBeNull();
  });

  it("a string whose declared length runs past the data is null; trailing NULs are trimmed; all-NUL string is empty", () => {
    const b = rec();
    const cut = new Uint8Array(b.subarray(0, 65 + 4 + 2)); // inside the name body
    expect(parseLpShareMetadataRecordV22(cut)).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec({ name: new Uint8Array([65, 66, 0, 0]) }))!.name).toBe("AB");
    expect(parseLpShareMetadataRecordV22(rec({ symbol: "\0\0\0" }))!.symbol).toBe("");
  });

  it("missing key / owner fields and every prefix truncation return null without throwing", () => {
    const b = rec({ creators: 2 });
    for (let i = 0; i < b.length; i++) expect(() => parseLpShareMetadataRecordV22(b.subarray(0, i))).not.toThrow();
    for (let i = 0; i < b.length; i++) expect(parseLpShareMetadataRecordV22(b.subarray(0, i))).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec({ key: 0 }))).toBeNull();
  });

  it("invalid UTF-8 in a string does not throw and decodes with U+FFFD", () => {
    const d = rec({ name: Uint8Array.of(0x41, 0xff, 0x42) });
    expect(() => parseLpShareMetadataRecordV22(d)).not.toThrow();
    expect(parseLpShareMetadataRecordV22(d)!.name).toBe("A\uFFFDB");
  });

  it("a 50-byte record cut inside the mint is null without throwing, even when the rest looks like empty strings + tail", () => {
    const d = cat(Uint8Array.of(4), new Uint8Array(32).fill(7), u32(0), u32(0), u32(0), Uint8Array.of(0, 0, 0, 0, 1)); // 1 + 32 + 17 = 50 < 65
    expect(() => parseLpShareMetadataRecordV22(d)).not.toThrow();
    expect(parseLpShareMetadataRecordV22(d)).toBeNull();
  });

  it("a uri whose declared length runs past the data is null even if the leftover bytes look like a tail", () => {
    const b = rec();
    const uriAt = 65 + 4 + 5 + 4 + 3;
    const d = cat(b.subarray(0, uriAt), u32(20), new Uint8Array(10));
    expect(parseLpShareMetadataRecordV22(d)).toBeNull();
  });

  it("creators option tag 2 followed by a valid-looking empty vector is null; the same bytes with tag 1 parse", () => {
    expect(parseLpShareMetadataRecordV22(rec({ creators: { tag: 2, count: 0 } }))).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec({ creators: { tag: 1, count: 0 } }))).not.toBeNull();
  });
});
