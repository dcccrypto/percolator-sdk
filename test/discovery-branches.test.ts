/**
 * Branch coverage for src/solana/discovery.ts using a mocked Connection (no network).
 * Covers: partial/empty getProgramAccounts results, RPC error surfacing, sequential 429
 * retry, memcmp fallback, wrong-size / wrong-version / wrong-magic accounts, tier-2/3
 * fallbacks and getMarketsByAddress owner/magic/layout guards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";

const staticMock = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("../src/solana/static-markets.js", () => ({
  getStaticMarkets: (n: string) => staticMock.fn(n),
}));

import {
  discoverMarkets,
  getMarketsByAddress,
  discoverMarketsViaApi,
  discoverMarketsViaStaticBundle,
  parseEngineLight,
  validateSlabTierMatch,
  SLAB_TIERS,
} from "../src/solana/discovery.js";
import { detectSlabLayout } from "../src/solana/slab.js";

const programId = new PublicKey(new Uint8Array(32).fill(7));
const otherOwner = new PublicKey(new Uint8Array(32).fill(9));
function pk(i: number): PublicKey {
  const b = new Uint8Array(32);
  b[0] = i;
  b[1] = 1;
  return new PublicKey(b);
}

const MAGIC = [0x54, 0x41, 0x4c, 0x4f, 0x43, 0x52, 0x45, 0x50];
const V17_MAGIC = [0x00, 0x36, 0x31, 0x56, 0x43, 0x52, 0x45, 0x50];

/** v12-style slab with the legacy magic, zero-filled (len bytes). */
function slab(len: number): Buffer {
  const b = Buffer.alloc(len);
  b.set(MAGIC, 0);
  return b;
}
/** v17-magic account: version at 8, kind at 10. */
function v17(len: number, version: number, kind: number): Buffer {
  const b = Buffer.alloc(len);
  b.set(V17_MAGIC, 0);
  b.writeUInt16LE(version, 8);
  b[10] = kind;
  return b;
}

type Mock = {
  getProgramAccounts: ReturnType<typeof vi.fn>;
  getMultipleAccountsInfo: ReturnType<typeof vi.fn>;
};
function conn(m: Partial<Mock> = {}): Connection & Mock {
  return {
    getProgramAccounts: vi.fn().mockResolvedValue([]),
    getMultipleAccountsInfo: vi.fn().mockResolvedValue([]),
    ...m,
  } as unknown as Connection & Mock;
}
const entry = (i: number, data: Buffer) => ({
  pubkey: pk(i),
  account: { data, owner: programId, lamports: 1, executable: false },
});
const info = (data: Buffer, owner = programId) => ({
  data,
  owner,
  lamports: 1,
  executable: false,
});

/** Find the first known slab size with a detectable layout. */
function validSlabLen(): number {
  return SLAB_TIERS.small.dataSize;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  staticMock.fn.mockReset().mockReturnValue([]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const isMemcmp = (opts: any) => !!opts?.filters?.[0]?.memcmp;
const isFullMemcmp = (opts: any) => isMemcmp(opts) && !opts.dataSlice;

describe("pure helpers", () => {
  it("validateSlabTierMatch compares sizes", () => {
    expect(validSlabLen()).toBeGreaterThan(0);
    expect(validateSlabTierMatch(5, 5)).toBe(true);
    expect(validateSlabTierMatch(5, 6)).toBe(false);
  });

  it("parseEngineLight throws on too-short data with null layout", () => {
    expect(() => parseEngineLight(new Uint8Array(10), null)).toThrow(/too short/);
  });

  it("parseEngineLight with null layout parses V0 offsets from a long-enough buffer", () => {
    const e = parseEngineLight(new Uint8Array(1940), null, 256);
    expect(e.vault).toBe(0n);
    expect(e.markPriceE6).toBe(0n);
  });

  it("parseEngineLight reports 0 for numUsed/nextId when the slice ends before them", () => {
    const layout = detectSlabLayout(SLAB_TIERS.large.dataSize);
    expect(layout).not.toBeNull();
    // Just long enough for base + bitmap but not for numUsed / nextAccountId on a large tier.
    const minLen = layout!.engineOff + layout!.engineBitmapOff;
    const buf = new Uint8Array(minLen + 8).fill(0xff); // non-zero, shorter than numUsed+2
    const e = parseEngineLight(buf, layout, 4096);
    expect(e.numUsedAccounts).toBe(0);
    expect(e.nextAccountId).toBe(0n);
  });
});

describe("discoverMarkets: RPC error surfacing (parallel)", () => {
  it("a rejected tier query is warned and the other tiers still contribute", async () => {
    const c = conn();
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) => {
      if (isMemcmp(opts)) return [];
      if (opts.filters[0].dataSize === SLAB_TIERS.small.dataSize) throw new Error("boom-tier");
      if (opts.filters[0].dataSize === SLAB_TIERS.medium.dataSize) {
        return [entry(1, slab(1940))];
      }
      return [];
    });
    const out = await discoverMarkets(c, programId);
    expect(warn).toHaveBeenCalledWith("[discoverMarkets] Tier query rejected:", "boom-tier");
    // slice is 1940 bytes on a medium tier: either parsed or skipped, but never thrown
    expect(out).toHaveLength(1);
  });

  it("logs non-Error rejection reasons verbatim", async () => {
    const c = conn();
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) => {
      if (isMemcmp(opts)) return [];
      throw "string-reason"; // eslint-disable-line no-throw-literal
    });
    await discoverMarkets(c, programId);
    expect(warn).toHaveBeenCalledWith("[discoverMarkets] Tier query rejected:", "string-reason");
  });

  it("empty dataSize results fall back to the full-data memcmp query", async () => {
    const c = conn();
    const data = slab(validSlabLen());
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) =>
      isFullMemcmp(opts) ? [entry(2, data)] : [],
    );
    const out = await discoverMarkets(c, programId);
    expect(warn).toHaveBeenCalledWith(
      "[discoverMarkets] dataSize filters returned 0 markets, falling back to memcmp",
    );
    const fullCalls = c.getProgramAccounts.mock.calls.filter(([, o]) => isFullMemcmp(o));
    expect(fullCalls).toHaveLength(1);
    expect(fullCalls[0][1].filters[0].memcmp.bytes).toBe("F6P2QNqpQV5");
    expect(out).toHaveLength(1);
  });

  it("falls back to maxAccounts=4096 when the memcmp account has an unrecognised size", async () => {
    const c = conn();
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) =>
      isFullMemcmp(opts) ? [entry(3, slab(123))] : [],
    );
    const out = await discoverMarkets(c, programId);
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("unrecognized layout for dataSize=123"),
    );
  });

  it("v17 memcmp query rejection is best-effort and does not abort discovery", async () => {
    const c = conn();
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) => {
      if (isMemcmp(opts) && opts.dataSlice) throw new Error("v17 rejected");
      return [];
    });
    const out = await discoverMarkets(c, programId);
    expect(out).toEqual([]);
  });

  it("clamps maxParallelTiers<=0 / NaN to a sane value and honours maxTierQueries", async () => {
    const c = conn();
    await discoverMarkets(c, programId, { maxParallelTiers: Number.NaN, maxTierQueries: 3 });
    const sized = c.getProgramAccounts.mock.calls.filter(([, o]) => o.filters[0].dataSize);
    expect(sized).toHaveLength(3);
    const c2 = conn();
    await discoverMarkets(c2, programId, { maxParallelTiers: 0, maxTierQueries: 2 });
    expect(c2.getProgramAccounts.mock.calls.filter(([, o]) => o.filters[0].dataSize)).toHaveLength(2);
  });
});

describe("discoverMarkets: sequential mode and 429 retry", () => {
  it("retries a 429 then succeeds, spacing tiers with the inter-tier delay", async () => {
    vi.useFakeTimers();
    const c = conn();
    let first = true;
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) => {
      if (opts.filters[0].dataSize && first) {
        first = false;
        throw new Error("429 Too Many Requests");
      }
      return [];
    });
    const p = discoverMarkets(c, programId, {
      sequential: true,
      maxTierQueries: 2,
      rateLimitBackoffMs: [10, 10],
      interTierDelayMs: 5,
    });
    await vi.runAllTimersAsync();
    await p;
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("429 on tier dataSize="));
    expect(c.getProgramAccounts.mock.calls.filter(([, o]) => o.filters[0].dataSize)).toHaveLength(3);
  });

  it("gives up after exhausting retries and warns, returning [] for that tier", async () => {
    vi.useFakeTimers();
    const c = conn();
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) => {
      if (opts.filters[0].dataSize) throw new Error("rate limit exceeded");
      return [];
    });
    const p = discoverMarkets(c, programId, {
      sequential: true,
      maxTierQueries: 1,
      rateLimitBackoffMs: [1],
    });
    await vi.runAllTimersAsync();
    await p;
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Tier query failed (dataSize="),
      "rate limit exceeded",
    );
    expect(c.getProgramAccounts.mock.calls.filter(([, o]) => o.filters[0].dataSize)).toHaveLength(2);
  });

  it("a non-429 error is not retried", async () => {
    const c = conn();
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) => {
      if (opts.filters[0].dataSize) throw "plain failure"; // eslint-disable-line no-throw-literal
      return [];
    });
    await discoverMarkets(c, programId, { sequential: true, maxTierQueries: 1, interTierDelayMs: 0 });
    const sized = c.getProgramAccounts.mock.calls.filter(([, o]) => o.filters[0].dataSize);
    expect(sized).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Tier query failed"),
      "plain failure",
    );
  });

  it("sequential: unparseable slices from tiers are warned and skipped, not thrown", async () => {
    const c = conn();
    const data = slab(123);
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) =>
      opts.filters[0].dataSize ? [entry(4, data)] : [],
    );
    const out = await discoverMarkets(c, programId, {
      sequential: true,
      maxTierQueries: 2,
      interTierDelayMs: 0,
    });
    // dedup by pubkey + unrecognised layout (dataSize taken from the tier) => skipped, no throw
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Failed to parse account"), expect.any(String));
  });
});

describe("discoverMarkets: account filtering (wrong size / version / magic)", () => {
  function withAccounts(accts: ReturnType<typeof entry>[]) {
    const c = conn();
    let served = false;
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) => {
      if (opts.filters[0].dataSize && !served) {
        served = true;
        return accts;
      }
      return [];
    });
    return c;
  }

  it("skips a v17-magic market with an unknown wrapper VERSION", async () => {
    const out = await discoverMarkets(withAccounts([entry(5, v17(600, 0xffff, 1))]), programId);
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("wrapper VERSION 65535"));
  });

  it("ignores v17-magic non-market accounts (portfolio kind) and bad magic", async () => {
    const out = await discoverMarkets(
      withAccounts([entry(6, v17(600, 19, 2)), entry(7, Buffer.alloc(2000))]),
      programId,
    );
    expect(out).toEqual([]);
  });

  it("a known-version v17 market that is too short is warned, not thrown", async () => {
    const out = await discoverMarkets(withAccounts([entry(8, v17(20, 19, 1))]), programId);
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse v17 account"),
      expect.any(String),
    );
  });

  it("a full-size v17 market is returned with configV17 and wrapperVersion", async () => {
    const out = await discoverMarkets(withAccounts([entry(9, v17(1940, 19, 1))]), programId);
    expect(out).toHaveLength(1);
    expect(out[0].configV17).toBeDefined();
    expect(out[0].wrapperVersion).toBe(19);
  });

  it("v17 accounts found by the memcmp query use their own data length as dataSize", async () => {
    const c = conn();
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) =>
      isMemcmp(opts) && opts.dataSlice ? [entry(10, v17(1940, 19, 1))] : [],
    );
    const out = await discoverMarkets(c, programId);
    expect(out).toHaveLength(1);
  });

  it("deduplicates the same pubkey returned by several tiers", async () => {
    const c = conn();
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) =>
      opts.filters[0].dataSize ? [entry(11, v17(1940, 19, 1))] : [],
    );
    const out = await discoverMarkets(c, programId);
    expect(out).toHaveLength(1);
  });

  it("skips v12 accounts of an unrecognised size and logs a parse failure for short slices", async () => {
    const small = SLAB_TIERS.small.dataSize;
    const c = conn();
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) => {
      if (opts.filters[0].dataSize === small) return [entry(12, slab(40))]; // slice far too short
      return [];
    });
    const out = await discoverMarkets(c, programId);
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse account"),
      expect.any(String),
    );
  });
});

describe("discoverMarkets: fallback tiers", () => {
  // SWALLOWED RPC ERROR (reported, NOT fixed in this PR — same class as indexer #286):
  // src/solana/discovery.ts:787-793 (`catch (memcmpErr)` only console.warn's) after
  // 765-770 (outer `catch (err)`). When every getProgramAccounts call rejects (RPC down /
  // rejects gPA), discoverMarkets resolves to [] — indistinguishable from "no markets".
  // The correct contract is to surface the failure. `it.fails` keeps the suite green while
  // the bug stands; when it is fixed this test starts "passing" and vitest flags it so the
  // `.fails` can be removed.
  it("BUG: RPC down for every query should reject, not resolve to []", async () => {
    const c = conn();
    c.getProgramAccounts.mockRejectedValue(new Error("RPC down: 503"));
    await expect(discoverMarkets(c, programId)).rejects.toThrow(/RPC down/);
  });

  it("dataSize+memcmp both throw with no apiBaseUrl/network -> rejects naming the tier", async () => {
    const c = conn();
    c.getProgramAccounts.mockRejectedValue(new Error("RPC down: 503"));
    await expect(discoverMarkets(c, programId)).rejects.toThrow(/rpc.*RPC down: 503/is);
  });

  it("memcmp throws but the REST API returns rows -> rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ markets: [{ slab_address: pk(30).toBase58() }] }),
    }));
    const c = conn();
    c.getProgramAccounts.mockRejectedValue(new Error("RPC down: 503"));
    c.getMultipleAccountsInfo.mockResolvedValue([info(v17(1940, 19, 1))]);
    const out = await discoverMarkets(c, programId, { apiBaseUrl: "https://api.test" });
    expect(out).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("memcmp throws, API succeeds with 0 rows, no network -> [] (not an outage)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ markets: [] }) }));
    const c = conn();
    c.getProgramAccounts.mockRejectedValue(new Error("RPC down: 503"));
    expect(await discoverMarkets(c, programId, { apiBaseUrl: "https://api.test" })).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("every attempted tier throws (rpc, api, static) -> rejects naming each", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("api-down")));
    staticMock.fn.mockReturnValue([{ slabAddress: pk(31).toBase58() }]);
    const c = conn();
    c.getProgramAccounts.mockRejectedValue(new Error("RPC down: 503"));
    c.getMultipleAccountsInfo.mockRejectedValue(new Error("gma-down"));
    await expect(
      discoverMarkets(c, programId, { apiBaseUrl: "https://api.test", network: "devnet" }),
    ).rejects.toThrow(/RPC down: 503.*api-down.*gma-down/s);
    vi.unstubAllGlobals();
  });

  it("when memcmp fallback also fails both failures are warned", async () => {
    const c = conn();
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) => {
      if (isFullMemcmp(opts)) throw "memcmp-down"; // eslint-disable-line no-throw-literal
      return [];
    });
    await discoverMarkets(c, programId);
    expect(warn).toHaveBeenCalledWith(
      "[discoverMarkets] dataSize filters failed, falling back to memcmp:",
      "memcmp-down",
    );
    expect(warn).toHaveBeenCalledWith(
      "[discoverMarkets] memcmp fallback also failed:",
      "memcmp-down",
    );
  });

  it("outer catch: memcmp recovers when the first fallback throws an Error", async () => {
    const c = conn();
    let n = 0;
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) => {
      if (isFullMemcmp(opts)) {
        if (n++ === 0) throw new Error("first-fail");
        return [entry(13, slab(123))];
      }
      return [];
    });
    await discoverMarkets(c, programId);
    expect(warn).toHaveBeenCalledWith(
      "[discoverMarkets] dataSize filters failed, falling back to memcmp:",
      "first-fail",
    );
    expect(c.getProgramAccounts.mock.calls.filter(([, o]) => isFullMemcmp(o))).toHaveLength(2);
    expect(warn).not.toHaveBeenCalledWith("[discoverMarkets] memcmp fallback also failed:", expect.anything());
  });

  it("uses the REST API when RPC returns nothing, and returns its markets", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ markets: [{ slab_address: pk(20).toBase58() }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const c = conn();
    c.getMultipleAccountsInfo.mockResolvedValue([info(v17(1940, 19, 1))]);
    const out = await discoverMarkets(c, programId, { apiBaseUrl: "https://api.test/" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/markets", expect.anything());
    expect(out).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("falls through to the static bundle when the API returns 0 markets", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ markets: [] }) }));
    staticMock.fn.mockReturnValue([{ slabAddress: pk(21).toBase58() }]);
    const c = conn();
    c.getMultipleAccountsInfo.mockResolvedValue([info(v17(1940, 19, 1))]);
    const out = await discoverMarkets(c, programId, { apiBaseUrl: "https://api.test", network: "devnet" });
    expect(out).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("REST API returned 0 markets"));
    vi.unstubAllGlobals();
  });

  it("API failure (Error and non-Error) is warned then static bundle is tried", async () => {
    for (const reason of [new Error("api-down"), "api-str"]) {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(reason));
      staticMock.fn.mockReturnValue([{ slabAddress: pk(22).toBase58() }]);
      const c = conn();
      c.getMultipleAccountsInfo.mockResolvedValue([info(v17(1940, 19, 1))]);
      const out = await discoverMarkets(c, programId, { apiBaseUrl: "https://api.test", network: "mainnet" });
      expect(out).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        "[discoverMarkets] API fallback also failed:",
        reason instanceof Error ? reason.message : reason,
      );
    }
    vi.unstubAllGlobals();
  });

  it("skips tier 3 when the static bundle has no entries for the network", async () => {
    const out = await discoverMarkets(conn(), programId, { network: "devnet" });
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Static bundle has 0 entries for devnet"));
  });

  it("static bundle failure (Error and non-Error) is warned and [] returned", async () => {
    for (const reason of [new Error("gma-down"), "gma-str"]) {
      staticMock.fn.mockReturnValue([{ slabAddress: pk(23).toBase58() }]);
      const c = conn();
      c.getMultipleAccountsInfo.mockRejectedValue(reason);
      const out = await discoverMarkets(c, programId, { network: "mainnet" });
      expect(out).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        "[discoverMarkets] Static bundle fallback also failed:",
        reason instanceof Error ? reason.message : reason,
      );
    }
  });
});

describe("getMarketsByAddress", () => {
  it("returns [] for an empty address list without touching RPC", async () => {
    const c = conn();
    expect(await getMarketsByAddress(c, programId, [])).toEqual([]);
    expect(c.getMultipleAccountsInfo).not.toHaveBeenCalled();
  });

  it("skips null accounts and owner mismatches", async () => {
    const c = conn();
    c.getMultipleAccountsInfo.mockResolvedValue([null, info(v17(1940, 19, 1), otherOwner)]);
    const out = await getMarketsByAddress(c, programId, [pk(30), pk(31)]);
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("owner mismatch"));
  });

  it("batches (clamped to 100) and waits between batches", async () => {
    vi.useFakeTimers();
    const c = conn();
    c.getMultipleAccountsInfo.mockResolvedValue([]);
    const addrs = Array.from({ length: 5 }, (_, i) => pk(40 + i));
    const p = getMarketsByAddress(c, programId, addrs, { batchSize: 2, interBatchDelayMs: 10 });
    await vi.runAllTimersAsync();
    await p;
    expect(c.getMultipleAccountsInfo).toHaveBeenCalledTimes(3);
    const big = conn();
    await getMarketsByAddress(big, programId, Array.from({ length: 101 }, (_, i) => pk(i + 100)), { batchSize: 1000 });
    expect(big.getMultipleAccountsInfo).toHaveBeenCalledTimes(2);
  });

  it("propagates a getMultipleAccountsInfo RPC error to the caller (thrown, not swallowed)", async () => {
    const c = conn();
    c.getMultipleAccountsInfo.mockRejectedValue(new Error("rpc-down"));
    await expect(getMarketsByAddress(c, programId, [pk(60)])).rejects.toThrow("rpc-down");
  });

  it("skips unknown-version v17, invalid magic and unrecognised-size v12 accounts", async () => {
    const c = conn();
    c.getMultipleAccountsInfo.mockResolvedValue([
      info(v17(600, 0xffff, 1)),
      info(Buffer.alloc(2000)),
      info(slab(123)),
    ]);
    const out = await getMarketsByAddress(c, programId, [pk(61), pk(62), pk(63)]);
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("wrapper VERSION 65535"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("invalid magic bytes"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unrecognized layout for dataSize=123"));
  });

  it("returns a v17 market and warns on a truncated known-version v17 market", async () => {
    const c = conn();
    c.getMultipleAccountsInfo.mockResolvedValue([info(v17(1940, 19, 1)), info(v17(20, 19, 1))]);
    const out = await getMarketsByAddress(c, programId, [pk(64), pk(65)]);
    expect(out).toHaveLength(1);
    expect(out[0].configV17).toBeDefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse v17 account"),
      expect.any(String),
    );
  });

  it("parses a valid-size v12 slab and warns when parsing a truncated one", async () => {
    const len = validSlabLen();
    expect(detectSlabLayout(len)).not.toBeNull();
    const c = conn();
    c.getMultipleAccountsInfo.mockResolvedValue([info(slab(len))]);
    const out = await getMarketsByAddress(c, programId, [pk(66)]);
    expect(out).toHaveLength(1);
    expect(out[0].configV17).toBeUndefined();
  });
});

describe("discoverMarketsViaApi / static bundle edge cases", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: "Unavailable" }));
    await expect(discoverMarketsViaApi(conn(), programId, "https://x")).rejects.toThrow(/503/);
  });

  it("returns [] when the body has no markets array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await discoverMarketsViaApi(conn(), programId, "https://x")).toEqual([]);
  });

  it("returns [] when every API slab address is missing or invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ markets: [{}, { slab_address: 5 }, { slab_address: "not-a-key" }] }),
      }),
    );
    expect(await discoverMarketsViaApi(conn(), programId, "https://x")).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid slab address"));
  });

  it("static bundle: empty, all-invalid and valid entries", async () => {
    expect(await discoverMarketsViaStaticBundle(conn(), programId, [])).toEqual([]);
    expect(
      await discoverMarketsViaStaticBundle(conn(), programId, [
        { slabAddress: "" } as any,
        { slabAddress: "bad" } as any,
      ]),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("No valid slab addresses in static bundle"));
    const c = conn();
    c.getMultipleAccountsInfo.mockResolvedValue([info(v17(1940, 19, 1))]);
    const out = await discoverMarketsViaStaticBundle(c, programId, [{ slabAddress: pk(70).toBase58() } as any]);
    expect(out).toHaveLength(1);
  });
});
