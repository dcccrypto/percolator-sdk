/**
 * RPC call-count regressions for duplicate reads in SDK read flows
 * (report J-20261120-SDK-REPORT-RPCCALLSPERFLOW):
 *  (a) discoverMarkets sent the full-data TALOCREP memcmp gPA twice when it rejected
 *      (once in the empty-result fallback, again in the outer catch);
 *  (c) trade prep read the mint twice (detectTokenProgram + fetchMintDecimals);
 *      fetchMintInfo reads it once with the same results and errors.
 * (b) the ADL rank-then-build re-read lives in adl-rpc-dup-reads.test.ts (it mocks slab.js).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { discoverMarkets } from "../src/solana/discovery.js";
import {
  detectTokenProgram,
  fetchMintInfo,
  TOKEN_2022_PROGRAM_ID,
} from "../src/solana/token-program.js";
import { fetchMintDecimals } from "../src/solana/dex-oracle.js";

const programId = new PublicKey(new Uint8Array(32).fill(7));
const TALOCREP_B58 = "F6P2QNqpQV5";

type GpaArgs = { filters?: Array<{ memcmp?: { bytes: string } }> };
const isTalocrepMemcmp = (args: GpaArgs | undefined) =>
  (args?.filters ?? []).some((f) => f.memcmp?.bytes === TALOCREP_B58);

afterEach(() => vi.restoreAllMocks());

describe("(a) discoverMarkets memcmp fallback is sent once", () => {
  function run(gpa: (args: GpaArgs | undefined) => Promise<unknown>, opts = {}) {
    const getProgramAccounts = vi.fn((_pid: PublicKey, args?: GpaArgs) => gpa(args));
    const conn = { getProgramAccounts, getMultipleAccountsInfo: vi.fn() } as unknown as Connection;
    return { getProgramAccounts, settled: Promise.allSettled([discoverMarkets(conn, programId, opts)]) };
  }
  const memcmpCalls = (fn: ReturnType<typeof vi.fn>) =>
    fn.mock.calls.filter(([, a]) => isTalocrepMemcmp(a as GpaArgs)).length;

  it("every gPA rejects (parallel): 1 TALOCREP memcmp, and memcmpErr is still reported", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getProgramAccounts, settled } = run(() => Promise.reject(new Error("429 Too Many Requests")), {
      maxTierQueries: 2,
    });
    await settled;
    expect(memcmpCalls(getProgramAccounts)).toBe(1);
    // 2 dataSize tiers + 1 v17 memcmp + 1 TALOCREP memcmp (was 5 with the re-send)
    expect(getProgramAccounts).toHaveBeenCalledTimes(4);
    const msgs = warn.mock.calls.map((c) => String(c[0]));
    expect(msgs).toContain("[discoverMarkets] dataSize filters failed, falling back to memcmp:");
    const memcmpWarn = warn.mock.calls.find((c) => String(c[0]).startsWith("[discoverMarkets] memcmp fallback also failed"));
    expect(memcmpWarn?.[1]).toBe("429 Too Many Requests");
  });

  it("every gPA 429s (sequential, 2 retries): 1 TALOCREP memcmp", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getProgramAccounts, settled } = run(() => Promise.reject(new Error("429 Too Many Requests")), {
      sequential: true,
      interTierDelayMs: 0,
      rateLimitBackoffMs: [0, 0],
      maxTierQueries: 1,
    });
    await settled;
    expect(memcmpCalls(getProgramAccounts)).toBe(1);
    expect(getProgramAccounts).toHaveBeenCalledTimes(3 + 1 + 1);
  });

  it("tiers return [] and the memcmp succeeds: still exactly 1 TALOCREP memcmp", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getProgramAccounts, settled } = run(async () => [], { maxTierQueries: 1 });
    const [r] = await settled;
    expect(r).toEqual({ status: "fulfilled", value: [] });
    expect(memcmpCalls(getProgramAccounts)).toBe(1);
  });
});

describe("(c) fetchMintInfo: one mint read for owner + decimals", () => {
  const mint = PublicKey.unique();
  function mintConn(info: { owner: PublicKey; data: Buffer } | null) {
    const getAccountInfo = vi.fn(async () =>
      info === null ? null : { ...info, lamports: 1, executable: false, rentEpoch: 0 },
    );
    return { getAccountInfo, conn: { getAccountInfo } as unknown as Connection };
  }
  const mintData = (decimals: number, len = 82) => {
    const b = Buffer.alloc(len);
    if (len > 44) b[44] = decimals;
    return b;
  };

  it.each([
    ["SPL Token", TOKEN_PROGRAM_ID, 6],
    ["Token-2022", TOKEN_2022_PROGRAM_ID, 9],
  ])("%s mint: 1 getAccountInfo, same result as detectTokenProgram + fetchMintDecimals", async (_n, owner, dec) => {
    const one = mintConn({ owner, data: mintData(dec) });
    const got = await fetchMintInfo(one.conn, mint);
    expect(one.getAccountInfo).toHaveBeenCalledTimes(1);

    const two = mintConn({ owner, data: mintData(dec) });
    const want = {
      tokenProgram: await detectTokenProgram(two.conn, mint),
      decimals: await fetchMintDecimals(two.conn, mint),
    };
    expect(two.getAccountInfo).toHaveBeenCalledTimes(2);
    expect(got.tokenProgram.toBase58()).toBe(want.tokenProgram.toBase58());
    expect(got.decimals).toBe(want.decimals);
  });

  it("throws the same errors as the two-call path, in the same order", async () => {
    const cases: Array<{ owner: PublicKey; data: Buffer } | null> = [
      null, // missing -> detectTokenProgram's "Mint account not found"
      { owner: PublicKey.unique(), data: mintData(6) }, // foreign owner -> not a token mint
      { owner: TOKEN_PROGRAM_ID, data: mintData(0, 44) }, // too short -> fetchMintDecimals' error
    ];
    for (const c of cases) {
      const err = await fetchMintInfo(mintConn(c).conn, mint).then(() => null, (e: Error) => e.message);
      const ref = mintConn(c).conn;
      const want = await (async () => {
        await detectTokenProgram(ref, mint);
        await fetchMintDecimals(ref, mint);
      })().then(() => null, (e: Error) => e.message);
      expect(err).not.toBeNull();
      expect(err).toBe(want);
    }
  });
});
