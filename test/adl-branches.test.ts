/**
 * Remaining-branch coverage for src/solana/adl.ts:
 *  - the merged long/short sort comparator (b < a and equal arms)
 *  - parseAdlEvent's defensive BigInt catch arms (tag parse, field parse)
 *
 * Slab decoders are mocked as in adl-ranking.test.ts; expectations are
 * hand-computed (pnlPct = pnl * 10000 / capital).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair } from "@solana/web3.js";

const m = vi.hoisted(() => ({
  detectSlabLayout: vi.fn(),
  parseEngine: vi.fn(),
  parseConfig: vi.fn(),
  parseAllAccounts: vi.fn(),
}));

vi.mock("../src/solana/slab.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/solana/slab.js")>();
  return { ...orig, ...m };
});

import { rankAdlPositions, parseAdlEvent } from "../src/solana/adl.js";
import { AccountKind } from "../src/solana/slab.js";

const user = (idx: number, positionSize: bigint, pnl: bigint, capital: bigint) => ({
  idx,
  account: { kind: AccountKind.User, owner: Keypair.generate().publicKey, positionSize, pnl, capital },
});

function setup(accounts: ReturnType<typeof user>[]) {
  m.detectSlabLayout.mockReturnValue({ engineLongOiOff: 1, engineShortOiOff: 2 });
  m.parseEngine.mockReturnValue({ pnlPosTot: 0n, longOi: 0n, shortOi: 0n });
  m.parseConfig.mockReturnValue({ maxPnlCap: 0n });
  m.parseAllAccounts.mockReturnValue(accounts);
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("rankAdlPositions merged ordering", () => {
  const idxs = (r: ReturnType<typeof rankAdlPositions>) => r.ranked.map((p) => p.idx);

  it("orders the merged list by pnlPct descending across sides, whatever the input order", () => {
    // pnlPct: idx1 long 1000, idx2 long 3000, idx3 short 2000, idx4 short 500
    const accts = [
      user(1, 10n, 10n, 100n),
      user(2, 10n, 30n, 100n),
      user(3, -10n, 20n, 100n),
      user(4, -10n, 5n, 100n),
    ];
    for (const order of [accts, [...accts].reverse(), [accts[2], accts[0], accts[3], accts[1]]]) {
      setup(order);
      const r = rankAdlPositions(new Uint8Array(8));
      expect(idxs(r)).toEqual([2, 3, 1, 4]);
      expect(r.ranked.map((p) => p.pnlPct)).toEqual([3000n, 2000n, 1000n, 500n]);
    }
  });

  it("keeps long-before-short for a cross-side pnlPct tie (comparator 0)", () => {
    setup([user(1, 10n, 10n, 100n), user(2, -10n, 10n, 100n), user(3, 10n, 10n, 100n)]);
    const r = rankAdlPositions(new Uint8Array(8));
    expect(idxs(r)).toEqual([1, 3, 2]);
    expect(r.ranked.map((p) => p.adlRank)).toEqual([0, 1, 0]);
  });

  it("keeps insertion order and ranks 0,1,2 for shorts with equal pnlPct", () => {
    setup([user(8, -10n, 10n, 100n), user(4, -10n, 10n, 100n), user(6, -10n, 10n, 100n)]);
    const r = rankAdlPositions(new Uint8Array(8));
    expect(r.shorts.map((p) => [p.idx, p.pnlPct, p.adlRank])).toEqual([
      [8, 1000n, 0],
      [4, 1000n, 1],
      [6, 1000n, 2],
    ]);
  });

  it("handles a shorter-side-first reversed pair (a < b arm of the comparator)", () => {
    // longs: 500 ; shorts: 1000, 1500 -> merged [1500, 1000, 500]
    setup([user(1, 10n, 5n, 100n), user(2, -10n, 10n, 100n), user(3, -10n, 15n, 100n)]);
    expect(idxs(rankAdlPositions(new Uint8Array(8)))).toEqual([3, 2, 1]);
    setup([user(3, -10n, 15n, 100n), user(2, -10n, 10n, 100n), user(1, 10n, 5n, 100n)]);
    expect(idxs(rankAdlPositions(new Uint8Array(8)))).toEqual([3, 2, 1]);
  });
});

describe("parseAdlEvent defensive catch arms", () => {
  const TAG = "0xad1e0001";
  const line = (...f: string[]) => `Program log: ${f.join(", ")}`;
  const realBigInt = BigInt;
  const throwOn = (bad: string) =>
    vi.stubGlobal("BigInt", (v: string | number | bigint | boolean) => {
      if (v === bad) throw new SyntaxError("stubbed");
      return realBigInt(v);
    });

  it("skips a line whose tag fails to convert and continues to the next valid event", () => {
    throwOn("0xbad");
    const logs = [line("0xbad", "0x1", "0x2", "0x3", "0x4"), line(TAG, "0x5", "0x3e8", "0x7", "0x1")];
    expect(parseAdlEvent(logs)).toEqual({
      tag: 0xad1e0001n,
      targetIdx: 5,
      price: 1000n,
      closedAbs: (1n << 64n) | 7n,
    });
  });

  it("skips an ADL event whose payload field fails to convert and returns null", () => {
    throwOn("0xbad");
    expect(parseAdlEvent([line(TAG, "0xbad", "0x2", "0x3", "0x4")])).toBeNull();
  });

  it("skips the bad ADL event but returns a later good one", () => {
    throwOn("0xbad");
    const logs = [line(TAG, "0xbad", "0x2", "0x3", "0x4"), line(TAG, "0x2", "0x64", "0x0", "0x0")];
    expect(parseAdlEvent(logs)).toEqual({ tag: 0xad1e0001n, targetIdx: 2, price: 100n, closedAbs: 0n });
  });
});
