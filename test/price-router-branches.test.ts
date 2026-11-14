import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PYTH_SOLANA_FEEDS, resolvePrice } from "../src/oracle/price-router.js";

// Behaviour tests for the source-selection branches of resolvePrice:
// fallbacks, all-sources-down, disagreement, ties, and malformed payloads.

const MINT = "TokenMint1111111111111111111111111111111111";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_FEED = Object.entries(PYTH_SOLANA_FEEDS).find(([, v]) => v.symbol === "SOL")![0];

type Reply = unknown | "fail" | "http500" | "throw";

function pair(over: Record<string, unknown> = {}, mint = MINT) {
  return {
    chainId: "solana",
    dexId: "raydium",
    pairAddress: "pool",
    baseToken: { address: mint, symbol: "TKN" },
    quoteToken: { symbol: "USDC" },
    priceUsd: "1.00",
    liquidity: { usd: 50_000 },
    ...over,
  };
}

function stubFetch(dex: Reply, jup: Reply) {
  const spy = vi.fn(async (url: string) => {
    const reply = url.includes("dexscreener") ? dex : jup;
    if (reply === "throw") throw new Error("network down");
    if (reply === "http500") return { ok: false, json: async () => ({}) };
    if (reply === "fail") return { ok: true, json: async () => { throw new Error("bad json"); } };
    return { ok: true, json: async () => reply };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

const dexBody = (...pairs: unknown[]) => ({ pairs });
const jupV3 = (price: unknown, liquidity?: unknown, mint = MINT) => ({
  [mint]: { usdPrice: price, liquidity },
});

describe("resolvePrice source fallbacks", () => {
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("all sources down (throw) -> no best source", async () => {
    stubFetch("throw", "throw");
    const r = await resolvePrice(MINT);
    expect(r.bestSource).toBeNull();
    expect(r.allSources).toEqual([]);
  });

  it("all sources HTTP error -> no best source", async () => {
    stubFetch("http500", "http500");
    expect((await resolvePrice(MINT)).bestSource).toBeNull();
  });

  it("all sources return unparseable bodies -> no best source", async () => {
    stubFetch("fail", "fail");
    expect((await resolvePrice(MINT)).allSources).toEqual([]);
  });

  it("dex HTTP error falls back to jupiter", async () => {
    stubFetch("http500", jupV3(2, 5000));
    const r = await resolvePrice(MINT);
    expect(r.bestSource?.type).toBe("jupiter");
    expect(r.bestSource?.price).toBe(2);
  });

  it("jupiter HTTP error falls back to dex", async () => {
    stubFetch(dexBody(pair()), "http500");
    const r = await resolvePrice(MINT);
    expect(r.bestSource?.type).toBe("dex");
  });

  it("jupiter throwing falls back to dex", async () => {
    stubFetch(dexBody(pair()), "throw");
    expect((await resolvePrice(MINT)).bestSource?.type).toBe("dex");
  });

  it("jupiter bad json falls back to dex", async () => {
    stubFetch(dexBody(pair()), "fail");
    expect((await resolvePrice(MINT)).bestSource?.type).toBe("dex");
  });

  it("an aborted caller signal yields no sources", async () => {
    const spy = vi.fn(async (_u: string, init: RequestInit) => {
      if (init.signal?.aborted) throw new Error("aborted");
      return { ok: true, json: async () => dexBody(pair()) };
    });
    vi.stubGlobal("fetch", spy);
    const c = new AbortController();
    c.abort();
    const r = await resolvePrice(MINT, c.signal);
    expect(r.bestSource).toBeNull();
  });

  it("a live caller signal is combined with the timeout and still resolves", async () => {
    stubFetch(dexBody(pair()), jupV3(1, 100));
    const c = new AbortController();
    const r = await resolvePrice(MINT, c.signal);
    expect(r.allSources.length).toBe(2);
  });
});

describe("DexScreener parsing edge cases", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const dexOnly = async (...pairs: unknown[]) => {
    stubFetch(dexBody(...pairs), "http500");
    return resolvePrice(MINT);
  };

  it("non-object body and non-array pairs give nothing", async () => {
    stubFetch("not an object", "http500");
    expect((await resolvePrice(MINT)).allSources).toEqual([]);
    stubFetch({ pairs: "nope" }, "http500");
    expect((await resolvePrice(MINT)).allSources).toEqual([]);
    stubFetch([1, 2], "http500");
    expect((await resolvePrice(MINT)).allSources).toEqual([]);
  });

  it("drops non-record pairs, wrong chain, quote-side matches, unsupported dex", async () => {
    const r = await dexOnly(
      null,
      "x",
      pair({ chainId: "ethereum" }),
      pair({ baseToken: "not-a-record" }),
      pair({ baseToken: { address: "Other", symbol: "O" } }),
      pair({ dexId: "orca" }),
      pair({ dexId: undefined }),
    );
    expect(r.allSources).toEqual([]);
  });

  it("drops pairs under $100 liquidity or with non-numeric liquidity", async () => {
    const r = await dexOnly(
      pair({ liquidity: { usd: 99 } }),
      pair({ liquidity: { usd: "5000" } }),
      pair({ liquidity: null }),
      pair({ liquidity: undefined }),
    );
    expect(r.allSources).toEqual([]);
  });

  it("drops zero, garbage, missing and boolean prices", async () => {
    const r = await dexOnly(
      pair({ priceUsd: "0" }),
      pair({ priceUsd: "abc" }),
      pair({ priceUsd: undefined }),
      pair({ priceUsd: true }),
      pair({ priceUsd: -3 }),
    );
    expect(r.allSources).toEqual([]);
  });

  it("accepts numeric priceUsd and normalises dexId case", async () => {
    const r = await dexOnly(pair({ priceUsd: 2.5, dexId: "Meteora" }));
    expect(r.bestSource?.price).toBe(2.5);
    expect(r.bestSource?.dexId).toBe("meteora");
  });

  it("uses '?' symbols and empty address when missing", async () => {
    const r = await dexOnly(
      pair({
        baseToken: { address: MINT },
        quoteToken: null,
        pairAddress: 7,
      }),
    );
    expect(r.bestSource?.pairLabel).toBe("? / ?");
    expect(r.bestSource?.address).toBe("");
  });

  it.each([
    [100_001, 75],
    [1_000_001, 90],
    [10_001, 60],
    [1_001, 45],
    [500, 30],
  ])("liquidity %d -> confidence %d", async (usd, conf) => {
    const r = await dexOnly(pair({ liquidity: { usd } }));
    expect(r.bestSource?.confidence).toBe(conf);
  });

  it("keeps only the 10 deepest pools, sorted by liquidity", async () => {
    const pairs = Array.from({ length: 12 }, (_, i) =>
      pair({ pairAddress: `p${i}`, liquidity: { usd: 1000 + i * 10 } }),
    );
    const r = await dexOnly(...pairs);
    expect(r.allSources).toHaveLength(10);
    expect(r.allSources[0].address).toBe("p11");
  });
});

describe("Jupiter parsing edge cases", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const jupOnly = async (body: unknown) => {
    stubFetch(dexBody(), body as Reply);
    return resolvePrice(MINT);
  };

  it("non-record body -> null", async () => {
    expect((await jupOnly("str")).allSources).toEqual([]);
  });

  it("v3 row with zero / garbage usdPrice -> null", async () => {
    expect((await jupOnly(jupV3(0))).allSources).toEqual([]);
    expect((await jupOnly(jupV3("abc"))).allSources).toEqual([]);
  });

  it("v3 row with null usdPrice falls through to v2 path and is null", async () => {
    expect((await jupOnly(jupV3(null))).allSources).toEqual([]);
  });

  it("v3 non-finite or non-number liquidity counts as 0", async () => {
    const r = await jupOnly(jupV3(3, "lots"));
    expect(r.bestSource?.liquidity).toBe(0);
    const r2 = await jupOnly(jupV3(3, Infinity));
    expect(r2.bestSource?.liquidity).toBe(0);
  });

  it("v2 shape with a symbol is accepted", async () => {
    const r = await jupOnly({ data: { [MINT]: { price: "4", mintSymbol: "TKN" } } });
    expect(r.bestSource?.price).toBe(4);
    expect(r.bestSource?.pairLabel).toBe("TKN / USD (Jupiter)");
  });

  it("v2 shape without a symbol gets '?'", async () => {
    const r = await jupOnly({ data: { [MINT]: { price: 4 } } });
    expect(r.bestSource?.pairLabel).toBe("? / USD (Jupiter)");
  });

  it("v2 shape that is malformed -> null", async () => {
    expect((await jupOnly({ data: "x" })).allSources).toEqual([]);
    expect((await jupOnly({ data: {} })).allSources).toEqual([]);
    expect((await jupOnly({ data: { [MINT]: "x" } })).allSources).toEqual([]);
    expect((await jupOnly({ data: { [MINT]: {} } })).allSources).toEqual([]);
    expect((await jupOnly({ data: { [MINT]: { price: null } } })).allSources).toEqual([]);
    expect((await jupOnly({ data: { [MINT]: { price: 0 } } })).allSources).toEqual([]);
    expect((await jupOnly({})).allSources).toEqual([]);
  });
});

describe("disagreeing sources and ties (non-Pyth mint)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("divergent deep dex pool is demoted below credible Jupiter", async () => {
    stubFetch(
      dexBody(pair({ priceUsd: "1.50", liquidity: { usd: 2_000_000 } })),
      jupV3(1.0, 500_000),
    );
    const r = await resolvePrice(MINT);
    expect(r.bestSource?.type).toBe("jupiter");
    const dex = r.allSources.find((s) => s.type === "dex")!;
    expect(dex.confidence).toBe(39); // jupiter 40 - margin 1
  });

  it("every divergent pool is demoted, not just the first", async () => {
    stubFetch(
      dexBody(
        pair({ pairAddress: "a", priceUsd: "2", liquidity: { usd: 2_000_000 } }),
        pair({ pairAddress: "b", priceUsd: "2", liquidity: { usd: 1_500_000 } }),
      ),
      jupV3(1.0, 1000),
    );
    const r = await resolvePrice(MINT);
    expect(r.bestSource?.type).toBe("jupiter");
    expect(r.allSources.filter((s) => s.type === "dex").every((s) => s.confidence === 39)).toBe(true);
  });

  it("agreeing dex pool (within 5%) keeps its confidence and wins", async () => {
    stubFetch(
      dexBody(pair({ priceUsd: "1.02", liquidity: { usd: 2_000_000 } })),
      jupV3(1.0, 1000),
    );
    const r = await resolvePrice(MINT);
    expect(r.bestSource?.type).toBe("dex");
    expect(r.bestSource?.confidence).toBe(90);
  });

  it("zero-liquidity Jupiter is not credible: divergent dex is not demoted", async () => {
    stubFetch(
      dexBody(pair({ priceUsd: "1.50", liquidity: { usd: 2_000_000 } })),
      jupV3(1.0, 0),
    );
    const r = await resolvePrice(MINT);
    expect(r.bestSource?.type).toBe("dex");
    expect(r.bestSource?.confidence).toBe(90);
  });

  it("a divergent dex pool already below Jupiter's confidence is not raised", async () => {
    stubFetch(
      dexBody(pair({ priceUsd: "9", liquidity: { usd: 200 } })), // confidence 30
      jupV3(1.0, 1000),
    );
    const r = await resolvePrice(MINT);
    const dex = r.allSources.find((s) => s.type === "dex")!;
    expect(dex.confidence).toBe(30);
  });

  it("equal-confidence dex pools keep their original order (stable sort)", async () => {
    // jupiter = 40; dex at 40 is impossible via tiers, so use two equal dex pools
    stubFetch(
      dexBody(
        pair({ pairAddress: "first", liquidity: { usd: 20_000 } }),
        pair({ pairAddress: "second", liquidity: { usd: 20_000 } }),
      ),
      "http500",
    );
    const r = await resolvePrice(MINT);
    expect(r.allSources.map((s) => s.address)).toEqual(["first", "second"]);
  });

  it("resolvedAt is an ISO timestamp and mint is echoed", async () => {
    stubFetch(dexBody(), "http500");
    const r = await resolvePrice(MINT);
    expect(r.mint).toBe(MINT);
    expect(new Date(r.resolvedAt).toISOString()).toBe(r.resolvedAt);
  });
});

describe("Pyth enrichment", () => {
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const solPair = (price: string, usd = 2_000_000) =>
    pair({ priceUsd: price, liquidity: { usd } }, SOL_MINT);

  it("no live price anywhere -> Pyth is not pushed", async () => {
    stubFetch(dexBody(), "http500");
    const r = await resolvePrice(SOL_MINT);
    expect(r.allSources).toEqual([]);
    expect(r.bestSource).toBeNull();
  });

  it("agreeing dex and jupiter -> Pyth gets their midpoint, confidence 95", async () => {
    stubFetch(dexBody(solPair("100")), jupV3(102, 1000, SOL_MINT));
    const r = await resolvePrice(SOL_MINT);
    expect(r.bestSource?.type).toBe("pyth");
    expect(r.bestSource?.address).toBe(SOL_FEED);
    expect(r.bestSource?.price).toBe(101);
    expect(r.bestSource?.confidence).toBe(95);
  });

  it("disagreeing dex and jupiter -> Pyth skipped and a warning is logged", async () => {
    stubFetch(dexBody(solPair("150")), jupV3(100, 1000, SOL_MINT));
    const r = await resolvePrice(SOL_MINT);
    expect(r.allSources.some((s) => s.type === "pyth")).toBe(false);
    expect(console.warn).toHaveBeenCalledOnce();
    expect(String((console.warn as any).mock.calls[0][0])).toContain("diverge by");
    expect(r.bestSource?.type).toBe("jupiter");
  });

  it("only dex available -> Pyth uses dex price at confidence capped to 50", async () => {
    stubFetch(dexBody(solPair("100")), "http500");
    const r = await resolvePrice(SOL_MINT);
    const pyth = r.allSources.find((s) => s.type === "pyth")!;
    expect(pyth.price).toBe(100);
    expect(pyth.confidence).toBe(50);
    expect(r.bestSource?.type).toBe("dex"); // dex 90 outranks capped pyth
  });

  it("only jupiter available -> Pyth uses jupiter price at confidence 50", async () => {
    stubFetch(dexBody(), jupV3(100, 1000, SOL_MINT));
    const r = await resolvePrice(SOL_MINT);
    const pyth = r.allSources.find((s) => s.type === "pyth")!;
    expect(pyth.price).toBe(100);
    expect(pyth.confidence).toBe(50);
    expect(r.bestSource?.type).toBe("pyth");
  });
});

describe("non-finite prices are rejected", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("dex priceUsd that overflows to Infinity is dropped; jupiter wins", async () => {
    stubFetch(
      dexBody(pair({ priceUsd: "1e400", liquidity: { usd: 2_000_000 } })),
      jupV3(1, 500_000),
    );
    const r = await resolvePrice(MINT);
    expect(r.allSources.some((s) => s.type === "dex")).toBe(false);
    expect(r.bestSource?.type).toBe("jupiter");
    expect(Number.isFinite(r.bestSource!.price)).toBe(true);
  });

  it("jupiter v3 usdPrice Infinity is dropped", async () => {
    stubFetch(dexBody(), jupV3("Infinity", 1000));
    expect((await resolvePrice(MINT)).allSources).toEqual([]);
  });

  it("jupiter v2 price Infinity is dropped", async () => {
    stubFetch(dexBody(), { data: { [MINT]: { price: "1e999" } } });
    expect((await resolvePrice(MINT)).allSources).toEqual([]);
  });

  it("exact tier edges fall into the lower tier", async () => {
    for (const [usd, conf] of [[1_000, 30], [10_000, 45], [100_000, 60], [1_000_000, 75]]) {
      stubFetch(dexBody(pair({ liquidity: { usd } })), "http500");
      expect((await resolvePrice(MINT)).bestSource?.confidence).toBe(conf);
    }
  });
});
