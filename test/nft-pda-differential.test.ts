import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import * as cur from "../src/abi/nft.js";
import * as old from "./fixtures/nft-frozen.js";

const keys = Array.from({ length: 40 }, () => Keypair.generate().publicKey);
// One cheap string compare per case, one assertion per test (an `expect` per case dominated the cost under
// coverage). `cmp` records the mismatching case labels; tests assert it is empty and that the case count is unchanged.
const tag = (a: [any, number]) => `${a[0].toBase58()}/${a[1]}`;
const makeCmp = () => {
  const bad: string[] = [];
  let n = 0;
  return {
    bad,
    count: () => n,
    same(label: string, a: [any, number], b: [any, number]) {
      n++;
      if (tag(a) !== tag(b)) bad.push(`${label}: ${tag(a)} != ${tag(b)}`);
    },
  };
};

describe("nft memoised PDA derivation == frozen", () => {
  it("deriveNftPda (cold + warm, alt programIds, bigint/number ids)", () => {
    const c = makeCmp();
    // The frozen reference is a pure function of its inputs: run it once per input (pass 0), reuse it on the warm pass.
    const ref = new Map<string, [any, number]>();
    for (let pass = 0; pass < 2; pass++)
      for (const [i, k] of keys.entries()) {
        const id = i % 2 ? BigInt(i) * 1_000_000_007n : i;
        for (const pid of [undefined, keys[0]]) {
          const key = `${i}/${pid ? "alt" : "def"}`;
          let want = ref.get(key);
          if (!want) ref.set(key, (want = old.deriveNftPda(k, id, pid)));
          c.same(`${pass}/${key}`, cur.deriveNftPda(k, id, pid), want);
        }
      }
    expect(c.count()).toBe(160);
    expect(c.bad).toEqual([]);
  });
  it("deriveExtraAccountMetas", () => {
    const c = makeCmp();
    const ref = new Map<string, [any, number]>();
    for (let pass = 0; pass < 2; pass++)
      for (const [i, k] of keys.entries())
        for (const pid of [undefined, keys[1]]) {
          const key = `${i}/${pid ? "alt" : "def"}`;
          let want = ref.get(key);
          if (!want) ref.set(key, (want = old.deriveExtraAccountMetas(k, pid)));
          c.same(`${pass}/${key}`, cur.deriveExtraAccountMetas(k, pid), want);
        }
    expect(c.count()).toBe(160);
    expect(c.bad).toEqual([]);
  });
  it("deriveMintAuthority", () => {
    const c = makeCmp();
    for (let pass = 0; pass < 2; pass++) {
      c.same("def", cur.deriveMintAuthority(), old.deriveMintAuthority());
      c.same("alt", cur.deriveMintAuthority(keys[3]), old.deriveMintAuthority(keys[3]));
    }
    expect(c.count()).toBe(4);
    expect(c.bad).toEqual([]);
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
