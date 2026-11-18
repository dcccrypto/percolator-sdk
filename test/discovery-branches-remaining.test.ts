/**
 * Remaining branch coverage for src/solana/discovery.ts (complements discovery-branches.test.ts):
 * negative V0 funding index, V0 short slices, the 8-byte funding-index layout arm,
 * falsy RPC rejections in the retry path, and non-Error / Error parse failures for
 * both v17 and legacy accounts in discoverMarkets and getMarketsByAddress.
 *
 * Failed scans must never drop other known markets: each failure test also asserts
 * the surviving markets are still returned.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";

const hooks = vi.hoisted(() => ({
  v17: null as null | ((d: Uint8Array) => unknown),
  header: null as null | ((d: Uint8Array) => unknown),
}));
vi.mock("../src/solana/static-markets.js", () => ({ getStaticMarkets: () => [] }));
vi.mock("../src/solana/slab.js", async (orig) => {
  const m = await orig<typeof import("../src/solana/slab.js")>();
  return {
    ...m,
    parseWrapperConfigV17: (d: Uint8Array) => (hooks.v17 ? hooks.v17(d) : m.parseWrapperConfigV17(d)),
    parseHeader: (d: Uint8Array) => (hooks.header ? hooks.header(d) : m.parseHeader(d)),
  };
});

import { discoverMarkets, getMarketsByAddress, parseEngineLight, SLAB_TIERS } from "../src/solana/discovery.js";
import { detectSlabLayout } from "../src/solana/slab.js";

const programId = new PublicKey(new Uint8Array(32).fill(7));
function pk(i: number): PublicKey {
  const b = new Uint8Array(32);
  b[0] = i;
  b[1] = 2;
  return new PublicKey(b);
}
const MAGIC = [0x54, 0x41, 0x4c, 0x4f, 0x43, 0x52, 0x45, 0x50];
const V17_MAGIC = [0x00, 0x36, 0x31, 0x56, 0x43, 0x52, 0x45, 0x50];
function slab(len: number): Buffer {
  const b = Buffer.alloc(len);
  b.set(MAGIC, 0);
  return b;
}
function v17(len: number): Buffer {
  const b = Buffer.alloc(len);
  b.set(V17_MAGIC, 0);
  b.writeUInt16LE(19, 8);
  b[10] = 1;
  return b;
}
const entry = (i: number, data: Buffer) => ({
  pubkey: pk(i),
  account: { data, owner: programId, lamports: 1, executable: false },
});
const info = (data: Buffer) => ({ data, owner: programId, lamports: 1, executable: false });
function conn(over: Record<string, unknown> = {}): Connection & any {
  return {
    getProgramAccounts: vi.fn().mockResolvedValue([]),
    getMultipleAccountsInfo: vi.fn().mockResolvedValue([]),
    ...over,
  } as any;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  hooks.v17 = null;
  hooks.header = null;
});
afterEach(() => vi.restoreAllMocks());

describe("parseEngineLight edge branches", () => {
  it("V0: a funding index with the sign bit set decodes negative", () => {
    const buf = new Uint8Array(1940);
    buf.fill(0xff, 480 + 112, 480 + 128); // 128-bit all ones == -1
    const e = parseEngineLight(buf, null, 256);
    expect(e.fundingIndexQpbE6).toBe(-1n);
  });

  it("V0: slice ending right after the bitmap reports numUsed/nextId as 0", () => {
    const e = parseEngineLight(new Uint8Array(480 + 320).fill(0xff), null, 4096);
    expect(e.numUsedAccounts).toBe(0);
    expect(e.nextAccountId).toBe(0n);
  });

  it("layout whose funding index sits 8 bytes before lastFundingSlot reads an i64", () => {
    const layout = detectSlabLayout(SLAB_TIERS.small.dataSize)!;
    expect(layout).not.toBeNull();
    const l = { ...layout, engineFundingIndexOff: 100, engineLastFundingSlotOff: 108 };
    const buf = new Uint8Array(SLAB_TIERS.small.dataSize);
    new DataView(buf.buffer).setBigInt64(layout.engineOff + 100, -5n, true);
    new DataView(buf.buffer).setBigUint64(layout.engineOff + 108, 77n, true);
    const e = parseEngineLight(buf, l, 256);
    expect(e.fundingIndexQpbE6).toBe(-5n);
    expect(e.lastFundingSlot).toBe(77n);
  });
});

describe("discoverMarkets: falsy rejection in sequential retry", () => {
  it("a tier rejecting with undefined is not treated as a 429 and is not retried", async () => {
    const small = SLAB_TIERS.small.dataSize;
    const medium = SLAB_TIERS.medium.dataSize;
    const c = conn();
    c.getProgramAccounts.mockImplementation(async (_p: unknown, opts: any) => {
      const ds = opts.filters[0].dataSize;
      if (ds === small) return Promise.reject(undefined);
      if (ds === medium) return [entry(1, v17(1940))];
      return [];
    });
    const out = await discoverMarkets(c, programId, {
      sequential: true,
      rateLimitBackoffMs: [1, 1],
      interTierDelayMs: 0,
    });
    const smallCalls = c.getProgramAccounts.mock.calls.filter(([, o]: any) => o.filters[0].dataSize === small);
    expect(smallCalls).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`Tier query failed (dataSize=${small}, attempt=1)`),
      undefined,
    );
    // The failed tier must not hide the markets found in other tiers.
    expect(out.map((m) => m.slabAddress.toBase58())).toEqual([pk(1).toBase58()]);
  });
});

describe("discoverMarkets: parse failures keep the other markets", () => {
  const serve = (entries: ReturnType<typeof entry>[]) =>
    conn({
      getProgramAccounts: vi.fn().mockImplementation(async (_p: unknown, opts: any) =>
        opts.filters[0].dataSize === SLAB_TIERS.small.dataSize ? entries : [],
      ),
    });

  it("v17 parse throwing a non-Error is logged verbatim and skipped", async () => {
    let n = 0;
    hooks.v17 = (d) => {
      if (n++ === 0) throw "v17-string-failure";
      return { ok: true };
    };
    const out = await discoverMarkets(serve([entry(1, v17(1940)), entry(2, v17(1940))]), programId);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse v17 account"),
      "v17-string-failure",
    );
    expect(out.map((m) => m.slabAddress.toBase58())).toEqual([pk(2).toBase58()]);
  });

  it("legacy parse throwing a non-Error is logged verbatim and skipped", async () => {
    let n = 0;
    hooks.header = (d) => {
      if (n++ === 0) throw "header-string-failure";
      return { magic: 1n };
    };
    const out = await discoverMarkets(serve([entry(3, slab(1940)), entry(4, slab(1940))]), programId);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[discoverMarkets] Failed to parse account"),
      "header-string-failure",
    );
    expect(out.map((m) => m.slabAddress.toBase58())).toEqual([pk(4).toBase58()]);
  });
});

describe("getMarketsByAddress: parse failures keep the other markets", () => {
  it("v17 parse throwing a non-Error is logged verbatim and skipped", async () => {
    let n = 0;
    hooks.v17 = () => {
      if (n++ === 0) throw "v17-string-failure";
      return { ok: true };
    };
    const c = conn({ getMultipleAccountsInfo: vi.fn().mockResolvedValue([info(v17(1940)), info(v17(1940))]) });
    const out = await getMarketsByAddress(c, programId, [pk(5), pk(6)]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[getMarketsByAddress] Failed to parse v17 account"),
      "v17-string-failure",
    );
    expect(out.map((m) => m.slabAddress.toBase58())).toEqual([pk(6).toBase58()]);
  });

  it("legacy parse throwing an Error logs its message and skips that account", async () => {
    let n = 0;
    hooks.header = () => {
      if (n++ === 0) throw new Error("bad header");
      return { magic: 1n };
    };
    const size = SLAB_TIERS.small.dataSize;
    const c = conn({ getMultipleAccountsInfo: vi.fn().mockResolvedValue([info(slab(size)), info(slab(size))]) });
    const out = await getMarketsByAddress(c, programId, [pk(7), pk(8)]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[getMarketsByAddress] Failed to parse account"),
      "bad header",
    );
    expect(out.map((m) => m.slabAddress.toBase58())).toEqual([pk(8).toBase58()]);
  });

  it("legacy parse throwing a non-Error is logged verbatim", async () => {
    hooks.header = () => {
      throw "plain-string";
    };
    const c = conn({
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([info(slab(SLAB_TIERS.small.dataSize))]),
    });
    const out = await getMarketsByAddress(c, programId, [pk(9)]);
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[getMarketsByAddress] Failed to parse account"),
      "plain-string",
    );
  });
});
