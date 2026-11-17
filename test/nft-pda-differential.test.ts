import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import * as cur from "../src/abi/nft.js";
import * as old from "./fixtures/nft-frozen.js";

const keys = Array.from({ length: 40 }, () => Keypair.generate().publicKey);
const same = (a: [any, number], b: [any, number]) => {
  expect(a[0].toBase58()).toBe(b[0].toBase58());
  expect(a[1]).toBe(b[1]);
};

describe("nft memoised PDA derivation == frozen", () => {
  it("deriveNftPda (cold + warm, alt programIds, bigint/number ids)", () => {
    for (let pass = 0; pass < 2; pass++)
      for (const [i, k] of keys.entries()) {
        const id = i % 2 ? BigInt(i) * 1_000_000_007n : i;
        same(cur.deriveNftPda(k, id), old.deriveNftPda(k, id));
        same(cur.deriveNftPda(k, id, keys[0]), old.deriveNftPda(k, id, keys[0]));
      }
  });
  it("deriveExtraAccountMetas", () => {
    for (let pass = 0; pass < 2; pass++)
      for (const k of keys) {
        same(cur.deriveExtraAccountMetas(k), old.deriveExtraAccountMetas(k));
        same(cur.deriveExtraAccountMetas(k, keys[1]), old.deriveExtraAccountMetas(k, keys[1]));
      }
  });
  it("deriveMintAuthority", () => {
    for (let pass = 0; pass < 2; pass++) {
      same(cur.deriveMintAuthority(), old.deriveMintAuthority());
      same(cur.deriveMintAuthority(keys[3]), old.deriveMintAuthority(keys[3]));
    }
  });
  it("distinct keys never collide; errors preserved; tuple not shared", () => {
    expect(() => cur.deriveNftPda(keys[0], -1)).toThrow(/marketId must be a u64/);
    expect(() => old.deriveNftPda(keys[0], -1)).toThrow(/marketId must be a u64/);
    const a = cur.deriveNftPda(keys[0], 1);
    a[1] = 0;
    expect(cur.deriveNftPda(keys[0], 1)[1]).toBe(old.deriveNftPda(keys[0], 1)[1]);
    // seed boundary: (portfolio, id) vs (extra metas of same bytes) must differ
    expect(cur.deriveNftPda(keys[0], 1)[0].equals(cur.deriveExtraAccountMetas(keys[0])[0])).toBe(false);
  });
  it("parsePositionNftAccount unchanged (v3 + legacy v2)", () => {
    for (const [len, ver] of [[239, 3], [199, 2]] as const) {
      const d = new Uint8Array(len);
      new DataView(d.buffer).setBigUint64(0, 0x5045_5243_4e46_5400n, true);
      d[8] = ver;
      for (let i = 9; i < len; i++) d[i] = (i * 13) & 0xff;
      expect(JSON.stringify(cur.parsePositionNftAccount(d), (_, v) => typeof v === "bigint" ? v.toString() : v))
        .toBe(JSON.stringify(old.parsePositionNftAccount(d), (_, v) => typeof v === "bigint" ? v.toString() : v));
    }
  });
});
