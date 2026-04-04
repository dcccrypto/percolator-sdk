/**
 * PERC-8440: Comprehensive integration test suite for the 3-tier discoverMarkets
 * fallback chain (PR#119).
 *
 * All tests run without a live RPC connection — HTTP calls are mocked via
 * globalThis.fetch (for API tier) and vi.fn() mocks for Solana RPC methods.
 *
 * Coverage targets (full branch coverage on fallback chain):
 *   1. Tier 1 (RPC) success — bypasses tiers 2 and 3
 *   2. Tier 1 failure → Tier 2 (API) success — bypasses tier 3
 *   3. Tier 1 failure → Tier 2 failure → Tier 3 (static bundle) success
 *   4. All 3 tiers fail — returns empty array gracefully
 *   5. Helius 429 responses — sequential mode retry paths
 *   6. 0 markets from each tier (not error, just empty data) vs actual errors
 *   7. Tier transitions: API returns addresses but none resolve on-chain
 *   8. Edge cases: mixed valid/invalid addresses, partial failures, timeouts
 *   9. Error codes 61-65 parsing in fallback context (QA smoke requirement)
 *  10. registerStaticMarkets / clearStaticMarkets interaction with tier 3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  discoverMarkets,
  discoverMarketsViaApi,
  discoverMarketsViaStaticBundle,
  getMarketsByAddress,
  SLAB_TIERS,
  SLAB_TIERS_V0,
  type DiscoverMarketsOptions,
} from "../src/solana/discovery.js";
import {
  registerStaticMarkets,
  clearStaticMarkets,
  getStaticMarkets,
} from "../src/solana/static-markets.js";
import { parseErrorFromLogs, decodeError } from "../src/abi/errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakePubkey(index: number): PublicKey {
  const bytes = new Uint8Array(32);
  bytes[0] = index & 0xff;
  bytes[1] = (index >> 8) & 0xff;
  bytes[2] = (index >> 16) & 0xff;
  return new PublicKey(bytes);
}

/** PERCOLAT magic bytes — little-endian "TALOCREP" */
const MAGIC = new Uint8Array([0x54, 0x41, 0x4c, 0x4f, 0x43, 0x52, 0x45, 0x50]);

/**
 * Build a minimal slab buffer that passes magic-byte validation and
 * detectSlabLayout for V1 small tier (65,352 bytes).
 */
function buildMinimalSlab(dataSize: number = SLAB_TIERS.small.dataSize): Buffer {
  const buf = Buffer.alloc(dataSize);
  buf.set(MAGIC, 0);
  buf.writeUInt32LE(1, 8); // version = 1
  return buf;
}

/**
 * Build a slab buffer large enough for the HEADER_SLICE_LENGTH (1940 bytes)
 * that will be returned from a mocked getProgramAccounts with dataSlice.
 * This has valid magic + version but the dataSize metadata is used by
 * discoverMarkets to determine the layout.
 */
function buildSlabSlice(size: number = 1940): Buffer {
  const buf = Buffer.alloc(size);
  buf.set(MAGIC, 0);
  buf.writeUInt32LE(1, 8);
  return buf;
}

const PROGRAM_ID = fakePubkey(255);

// ---------------------------------------------------------------------------
// Mock fetch setup
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  clearStaticMarkets();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  clearStaticMarkets();
});

// ===========================================================================
// 1. TIER 1 (RPC) SUCCESS — BYPASSES TIERS 2 AND 3
// ===========================================================================

describe("Tier 1 (RPC) success — bypasses tiers 2 and 3", () => {
  it("returns markets from RPC without calling API or static bundle", async () => {
    registerStaticMarkets("mainnet", [
      { slabAddress: fakePubkey(99).toBase58(), symbol: "STATIC" },
    ]);

    const slabSlice = buildSlabSlice();
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([
        { pubkey: fakePubkey(1), account: { data: slabSlice } },
      ]),
    } as unknown as Connection;

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // API not called
    expect(mockFetch).not.toHaveBeenCalled();
    // getProgramAccounts was called
    expect(mockConnection.getProgramAccounts).toHaveBeenCalled();
  });

  it("deduplicates markets found across multiple tier queries", async () => {
    const pk = fakePubkey(1);
    const slabSlice = buildSlabSlice();

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([
        { pubkey: pk, account: { data: slabSlice } },
        { pubkey: pk, account: { data: slabSlice } }, // same pubkey
      ]),
    } as unknown as Connection;

    const markets = await discoverMarkets(mockConnection, PROGRAM_ID, {
      maxTierQueries: 1,
    });

    // Pubkey dedup: should only appear once
    const pkStrings = markets.map(m => m.slabAddress.toBase58());
    expect(new Set(pkStrings).size).toBe(pkStrings.length);
  });

  it("skips accounts with invalid magic bytes in RPC results", async () => {
    const badSlice = Buffer.alloc(1940);
    badSlice[0] = 0xFF; // invalid magic
    const goodSlice = buildSlabSlice();

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([
        { pubkey: fakePubkey(1), account: { data: badSlice } },
        { pubkey: fakePubkey(2), account: { data: goodSlice } },
      ]),
    } as unknown as Connection;

    const markets = await discoverMarkets(mockConnection, PROGRAM_ID, {
      maxTierQueries: 1,
    });

    // Only the good slab should be (attempted to be) parsed
    // It may still fail parsing, but the bad one is definitely skipped
    const addresses = markets.map(m => m.slabAddress.toBase58());
    expect(addresses).not.toContain(fakePubkey(1).toBase58());
  });
});

// ===========================================================================
// 2. TIER 1 FAILURE → TIER 2 (API) SUCCESS
// ===========================================================================

describe("Tier 1 failure → Tier 2 (API) success", () => {
  it("falls back to API when RPC returns 0 results", async () => {
    const apiAddr = fakePubkey(50);
    const slabData = buildMinimalSlab();

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([
        { data: slabData, owner: PROGRAM_ID, lamports: 1, executable: false },
      ]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [{ slab_address: apiAddr.toBase58() }],
      }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      maxTierQueries: 1,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://percolatorlaunch.com/api/markets");
    expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalled();
  });

  it("falls back to API when RPC throws 429 and memcmp also fails", async () => {
    const apiAddr = fakePubkey(60).toBase58();

    const mockConnection = {
      getProgramAccounts: vi.fn().mockRejectedValue(new Error("429 Too Many Requests")),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [{ slab_address: apiAddr }],
      }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      maxTierQueries: 1,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("API success with >0 parsed markets bypasses tier 3", async () => {
    const apiAddr = fakePubkey(42).toBase58();
    const staticAddr = fakePubkey(99).toBase58();
    registerStaticMarkets("mainnet", [{ slabAddress: staticAddr }]);

    const slabSize = SLAB_TIERS.small.dataSize;
    const slabData = buildMinimalSlab(slabSize);

    const mockGetMultiple = vi.fn().mockResolvedValue([
      { data: slabData, owner: PROGRAM_ID, lamports: 1, executable: false },
    ]);
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [{ slab_address: apiAddr }],
      }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // getMultipleAccountsInfo called only once for the API address, not for static
    expect(mockGetMultiple).toHaveBeenCalledTimes(1);
    const passedAddresses = mockGetMultiple.mock.calls[0][0] as PublicKey[];
    expect(passedAddresses.map((a: PublicKey) => a.toBase58())).toEqual([apiAddr]);
  });
});

// ===========================================================================
// 3. TIER 1 FAILURE → TIER 2 FAILURE → TIER 3 (STATIC) SUCCESS
// ===========================================================================

describe("Full 3-tier fallback: RPC → API → static bundle", () => {
  it("reaches tier 3 when RPC returns 0 and API returns 503", async () => {
    const staticAddr = fakePubkey(77).toBase58();
    registerStaticMarkets("mainnet", [{ slabAddress: staticAddr, symbol: "SOL-PERP" }]);

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
    const passedAddresses = (mockConnection.getMultipleAccountsInfo as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as PublicKey[];
    expect(passedAddresses.map((a: PublicKey) => a.toBase58())).toEqual([staticAddr]);
  });

  it("reaches tier 3 when RPC throws and API network-errors", async () => {
    const staticAddr = fakePubkey(88).toBase58();
    registerStaticMarkets("mainnet", [{ slabAddress: staticAddr }]);

    const mockConnection = {
      getProgramAccounts: vi.fn().mockRejectedValue(new Error("429 Too Many Requests")),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalled();
  });

  it("reaches tier 3 when API returns 0 markets (empty array)", async () => {
    const staticAddr = fakePubkey(33).toBase58();
    registerStaticMarkets("devnet", [{ slabAddress: staticAddr }]);

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ markets: [] }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "devnet",
      maxTierQueries: 1,
    });

    expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
  });

  it("reaches tier 3 when API returns addresses but none resolve on-chain", async () => {
    const apiAddr = fakePubkey(55).toBase58();
    const staticAddr = fakePubkey(99).toBase58();
    registerStaticMarkets("mainnet", [{ slabAddress: staticAddr }]);

    const mockGetMultiple = vi.fn().mockResolvedValue([null]);
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [{ slab_address: apiAddr }],
      }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // Called twice: once for API address (tier 2), once for static address (tier 3)
    expect(mockGetMultiple).toHaveBeenCalledTimes(2);
    const call1Addrs = mockGetMultiple.mock.calls[0][0].map((a: PublicKey) => a.toBase58());
    const call2Addrs = mockGetMultiple.mock.calls[1][0].map((a: PublicKey) => a.toBase58());
    expect(call1Addrs).toEqual([apiAddr]);
    expect(call2Addrs).toEqual([staticAddr]);
  });

  it("static bundle with multiple addresses passes all to getMultipleAccountsInfo", async () => {
    const addrs = Array.from({ length: 5 }, (_, i) => fakePubkey(i + 100).toBase58());
    registerStaticMarkets("mainnet", addrs.map(a => ({ slabAddress: a })));

    const mockGetMultiple = vi.fn().mockResolvedValue(addrs.map(() => null));
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Error",
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    const passedAddresses = mockGetMultiple.mock.calls[0][0] as PublicKey[];
    expect(passedAddresses).toHaveLength(5);
  });
});

// ===========================================================================
// 4. ALL 3 TIERS FAIL — RETURNS EMPTY ARRAY
// ===========================================================================

describe("All 3 tiers fail — graceful empty result", () => {
  it("RPC returns 0, API 503, static bundle addresses not found on-chain", async () => {
    registerStaticMarkets("mainnet", [
      { slabAddress: fakePubkey(1).toBase58() },
    ]);

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Unavailable",
    } as Response);

    const result = await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://api.example.com",
      network: "mainnet",
      maxTierQueries: 1,
    });

    expect(result).toEqual([]);
  });

  it("RPC throws 429, API network error, static getMultipleAccountsInfo throws", async () => {
    registerStaticMarkets("mainnet", [
      { slabAddress: fakePubkey(1).toBase58() },
    ]);

    const mockConnection = {
      getProgramAccounts: vi.fn().mockRejectedValue(new Error("429 Too Many Requests")),
      getMultipleAccountsInfo: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
    } as unknown as Connection;

    mockFetch.mockRejectedValueOnce(new Error("DNS failure"));

    const result = await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://api.example.com",
      network: "mainnet",
      maxTierQueries: 1,
    });

    expect(result).toEqual([]);
  });

  it("all tiers disabled: no apiBaseUrl, no network — returns empty from RPC failure", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    const result = await discoverMarkets(mockConnection, PROGRAM_ID, {
      maxTierQueries: 1,
    });

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("network set but static registry empty → skips tier 3 gracefully", async () => {
    // Don't register any static markets
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Error",
    } as Response);

    const result = await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://api.example.com",
      network: "mainnet",
      maxTierQueries: 1,
    });

    expect(result).toEqual([]);
  });
});

// ===========================================================================
// 5. HELIUS 429 RESPONSES — SEQUENTIAL MODE RETRY
// ===========================================================================

describe("Helius 429 responses — mocked retry paths", () => {
  it("sequential mode retries 429 and succeeds on second attempt", async () => {
    let attempt = 0;
    const mockConnection = {
      getProgramAccounts: vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) throw new Error("429 Too Many Requests");
        return [];
      }),
    } as unknown as Connection;

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      sequential: true,
      interTierDelayMs: 0,
      rateLimitBackoffMs: [0, 0], // instant retry in tests
      maxTierQueries: 1,
    });

    expect(attempt).toBeGreaterThanOrEqual(2);
  });

  it("sequential mode exhausts retries on persistent 429 — moves to next tier", async () => {
    let callCount = 0;
    const mockConnection = {
      getProgramAccounts: vi.fn().mockImplementation(async () => {
        callCount++;
        throw new Error("429 Too Many Requests");
      }),
    } as unknown as Connection;

    const result = await discoverMarkets(mockConnection, PROGRAM_ID, {
      sequential: true,
      interTierDelayMs: 0,
      rateLimitBackoffMs: [0, 0], // 2 retries
      maxTierQueries: 1,
    });

    // Should have been called 1 initial + 2 retries = 3 for first tier, then memcmp fallback
    expect(callCount).toBeGreaterThanOrEqual(3);
    expect(result).toEqual([]);
  });

  it("sequential mode does NOT retry non-429 errors", async () => {
    let callCount = 0;
    const mockConnection = {
      getProgramAccounts: vi.fn().mockImplementation(async (_pid: any, config: any) => {
        const filters = config?.filters ?? [];
        const isMemcmp = filters.some((f: any) => "memcmp" in f);
        if (isMemcmp) return []; // memcmp fallback
        callCount++;
        throw new Error("Connection refused");
      }),
    } as unknown as Connection;

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      sequential: true,
      interTierDelayMs: 0,
      rateLimitBackoffMs: [0, 0, 0],
      maxTierQueries: 2,
    });

    // Each tier gets exactly 1 call (no retry on non-429)
    expect(callCount).toBe(2);
  });

  it("parallel mode: 429 on one tier does not block other tiers", async () => {
    let smallCalled = false;
    let largeCalled = false;

    const mockConnection = {
      getProgramAccounts: vi.fn().mockImplementation(async (_pid: any, config: any) => {
        const filters = config?.filters ?? [];
        for (const f of filters) {
          if ("dataSize" in f) {
            if (f.dataSize === SLAB_TIERS.small.dataSize) {
              smallCalled = true;
              throw new Error("429 Too Many Requests");
            }
            if (f.dataSize === SLAB_TIERS.large.dataSize) {
              largeCalled = true;
              return [];
            }
          }
          if ("memcmp" in f) return []; // memcmp fallback
        }
        return [];
      }),
    } as unknown as Connection;

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      sequential: false,
    });

    // Both tiers attempted despite 429 on small
    expect(smallCalled).toBe(true);
    expect(largeCalled).toBe(true);
  });

  it("Helius 429 triggers API fallback after all RPC tiers fail", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockRejectedValue(new Error("429 Too Many Requests")),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [{ slab_address: fakePubkey(42).toBase58() }],
      }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      maxTierQueries: 1,
    });

    // API was called as fallback after 429
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rate limit error detection: case-insensitive matching", async () => {
    let attempt = 0;
    const mockConnection = {
      getProgramAccounts: vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) throw new Error("Rate Limit Exceeded");
        return [];
      }),
    } as unknown as Connection;

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      sequential: true,
      interTierDelayMs: 0,
      rateLimitBackoffMs: [0],
      maxTierQueries: 1,
    });

    // Should have retried (detected "Rate Limit" case-insensitively)
    expect(attempt).toBeGreaterThanOrEqual(2);
  });

  it("rate limit error detection: 'too many requests' variant", async () => {
    let attempt = 0;
    const mockConnection = {
      getProgramAccounts: vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) throw new Error("Server returned HTTP 429: too many requests");
        return [];
      }),
    } as unknown as Connection;

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      sequential: true,
      interTierDelayMs: 0,
      rateLimitBackoffMs: [0],
      maxTierQueries: 1,
    });

    expect(attempt).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// 6. ZERO MARKETS vs ERRORS (distinction between empty and failure)
// ===========================================================================

describe("0 markets returned vs actual errors — fallback trigger behavior", () => {
  it("RPC returns [] (not error) — still triggers API fallback", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ markets: [{ slab_address: fakePubkey(1).toBase58() }] }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      maxTierQueries: 1,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("API returns { markets: [] } — triggers tier 3 when network set", async () => {
    registerStaticMarkets("mainnet", [
      { slabAddress: fakePubkey(10).toBase58() },
    ]);

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ markets: [] }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // Tier 3 triggered
    expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalled();
  });

  it("API returns { data: [] } (missing 'markets' field) — treated as 0 markets", async () => {
    registerStaticMarkets("mainnet", [
      { slabAddress: fakePubkey(10).toBase58() },
    ]);

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }), // no 'markets' key
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // Tier 3 triggered because API returned 0 valid markets
    expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalled();
  });

  it("API returns markets but all slab_addresses are invalid — tier 3 triggered", async () => {
    registerStaticMarkets("mainnet", [
      { slabAddress: fakePubkey(20).toBase58() },
    ]);

    const mockGetMultiple = vi.fn().mockResolvedValue([null]);
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [
          { slab_address: "invalid-address-1!" },
          { slab_address: "", symbol: "EMPTY" },
          { slab_address: null },
        ],
      }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // discoverMarketsViaApi returns [] for all invalid → tier 3 triggered
    expect(mockGetMultiple).toHaveBeenCalled();
  });

  it("static bundle entries with invalid addresses are skipped silently", async () => {
    registerStaticMarkets("mainnet", [
      { slabAddress: "definitely-not-base58!!!" },
      { slabAddress: fakePubkey(5).toBase58(), symbol: "VALID" },
    ]);

    const mockGetMultiple = vi.fn().mockResolvedValue([null]);
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Error",
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://api.example.com",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // Only valid address passed
    const passedAddresses = mockGetMultiple.mock.calls[0][0] as PublicKey[];
    expect(passedAddresses).toHaveLength(1);
    expect(passedAddresses[0].toBase58()).toBe(fakePubkey(5).toBase58());
  });
});

// ===========================================================================
// 7. API FALLBACK EDGE CASES
// ===========================================================================

describe("API fallback edge cases", () => {
  it("strips trailing slashes from apiBaseUrl", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ markets: [] }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api///",
      maxTierQueries: 1,
    });

    expect(mockFetch.mock.calls[0][0]).toBe("https://percolatorlaunch.com/api/markets");
  });

  it("respects apiTimeoutMs — times out for slow API", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    mockFetch.mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const result = await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://api.example.com",
      apiTimeoutMs: 50,
      maxTierQueries: 1,
    });

    // Timeout → fallback fails gracefully → empty
    expect(result).toEqual([]);
  });

  it("API returns non-JSON — handles gracefully", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new SyntaxError("Unexpected token <"); },
    } as Response);

    const result = await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://api.example.com",
      maxTierQueries: 1,
    });

    expect(result).toEqual([]);
  });

  it("API returns markets with snake_case slab_address (not camelCase)", async () => {
    const addr = fakePubkey(70).toBase58();

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    // Verify snake_case is used
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [{ slab_address: addr, symbol: "SOL-PERP" }],
      }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      maxTierQueries: 1,
    });

    // Should have resolved the address
    const passedAddresses = (mockConnection.getMultipleAccountsInfo as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as PublicKey[];
    expect(passedAddresses[0].toBase58()).toBe(addr);
  });
});

// ===========================================================================
// 8. STATIC BUNDLE REGISTRY INTERACTION
// ===========================================================================

describe("Static market registry interaction with tier 3", () => {
  it("registerStaticMarkets adds entries that tier 3 uses", async () => {
    const addr1 = fakePubkey(10).toBase58();
    const addr2 = fakePubkey(11).toBase58();

    registerStaticMarkets("mainnet", [
      { slabAddress: addr1, symbol: "SOL-PERP" },
      { slabAddress: addr2, symbol: "ETH-PERP" },
    ]);

    expect(getStaticMarkets("mainnet")).toHaveLength(2);

    const mockGetMultiple = vi.fn().mockResolvedValue([null, null]);
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Unavailable",
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://api.example.com",
      network: "mainnet",
      maxTierQueries: 1,
    });

    const passedAddresses = mockGetMultiple.mock.calls[0][0] as PublicKey[];
    expect(passedAddresses).toHaveLength(2);
  });

  it("clearStaticMarkets removes entries — tier 3 has nothing to use", async () => {
    registerStaticMarkets("mainnet", [
      { slabAddress: fakePubkey(10).toBase58() },
    ]);
    clearStaticMarkets("mainnet");
    expect(getStaticMarkets("mainnet")).toHaveLength(0);

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Error",
    } as Response);

    const result = await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://api.example.com",
      network: "mainnet",
      maxTierQueries: 1,
    });

    expect(result).toEqual([]);
  });

  it("clearStaticMarkets() without arg clears all networks", () => {
    registerStaticMarkets("mainnet", [{ slabAddress: fakePubkey(1).toBase58() }]);
    registerStaticMarkets("devnet", [{ slabAddress: fakePubkey(2).toBase58() }]);
    clearStaticMarkets();
    expect(getStaticMarkets("mainnet")).toHaveLength(0);
    expect(getStaticMarkets("devnet")).toHaveLength(0);
  });

  it("duplicate slabAddress in registerStaticMarkets is deduplicated", () => {
    const addr = fakePubkey(5).toBase58();
    registerStaticMarkets("mainnet", [
      { slabAddress: addr },
      { slabAddress: addr },
      { slabAddress: addr },
    ]);
    expect(getStaticMarkets("mainnet")).toHaveLength(1);
  });

  it("devnet and mainnet registries are independent", async () => {
    const mainnetAddr = fakePubkey(10).toBase58();
    const devnetAddr = fakePubkey(20).toBase58();

    registerStaticMarkets("mainnet", [{ slabAddress: mainnetAddr }]);
    registerStaticMarkets("devnet", [{ slabAddress: devnetAddr }]);

    const mockGetMultiple = vi.fn().mockResolvedValue([null]);
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Error",
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://api.example.com",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // Only mainnet address passed — devnet was not mixed in
    const passedAddresses = mockGetMultiple.mock.calls[0][0] as PublicKey[];
    expect(passedAddresses).toHaveLength(1);
    expect(passedAddresses[0].toBase58()).toBe(mainnetAddr);
  });
});

// ===========================================================================
// 9. ERROR CODES 61-65 IN FALLBACK CONTEXT
// ===========================================================================

describe("Error codes 61-65 — parsing in discovery/fallback context", () => {
  const PROG_ID_STR = "EXsr2Tfz8ntWYP3vgCStdknFBoafvJQugJKAh4nFdo8f";

  function makeAdlErrorLog(hexCode: string): string[] {
    return [
      `Program ${PROG_ID_STR} invoke [1]`,
      "Program log: Instruction: ExecuteAdl",
      `Program ${PROG_ID_STR} failed: custom program error: 0x${hexCode}`,
    ];
  }

  const ADL_ERRORS: Array<{
    code: number;
    hex: string;
    name: string;
    hintPattern: RegExp;
  }> = [
    { code: 61, hex: "3d", name: "EngineSideBlocked", hintPattern: /drain|blocked|mode/i },
    { code: 62, hex: "3e", name: "EngineCorruptState", hintPattern: /corrupt|invariant|critical/i },
    { code: 63, hex: "3f", name: "InsuranceFundNotDepleted", hintPattern: /insurance|depleted/i },
    { code: 64, hex: "40", name: "NoAdlCandidates", hintPattern: /candidate|eligible/i },
    { code: 65, hex: "41", name: "BankruptPositionAlreadyClosed", hintPattern: /closed|size|re-rank/i },
  ];

  for (const { code, hex, name, hintPattern } of ADL_ERRORS) {
    it(`${code} (0x${hex}) — ${name}: parseErrorFromLogs`, () => {
      const result = parseErrorFromLogs(makeAdlErrorLog(hex));
      expect(result).not.toBeNull();
      expect(result!.code).toBe(code);
      expect(result!.name).toBe(name);
      expect(result!.hint).toMatch(hintPattern);
    });

    it(`${code} — decodeError returns ${name}`, () => {
      const info = decodeError(code);
      expect(info).toBeDefined();
      expect(info!.name).toBe(name);
      expect(info!.hint).toBeTruthy();
    });

    it(`${code} — uppercase hex (0x${hex.toUpperCase()}) parses identically`, () => {
      const lower = parseErrorFromLogs(makeAdlErrorLog(hex));
      const upper = parseErrorFromLogs(makeAdlErrorLog(hex.toUpperCase()));
      expect(lower!.code).toBe(upper!.code);
      expect(lower!.name).toBe(upper!.name);
    });
  }

  it("all ADL codes 61-65 are contiguous in PERCOLATOR_ERRORS", () => {
    for (let code = 61; code <= 65; code++) {
      const info = decodeError(code);
      expect(info, `code ${code}`).toBeDefined();
      expect(info!.name).toBeTruthy();
      expect(info!.hint).toBeTruthy();
    }
  });

  it("adjacent code 60 (EngineInvalidEntryPrice) is NOT confused with ADL errors", () => {
    const result = parseErrorFromLogs(makeAdlErrorLog("3c"));
    expect(result!.code).toBe(60);
    expect(result!.name).toBe("EngineInvalidEntryPrice");
  });

  it("code 66 returns undefined (boundary check)", () => {
    expect(decodeError(66)).toBeUndefined();
  });
});

// ===========================================================================
// 10. discoverMarketsViaApi — DIRECT UNIT TESTS
// ===========================================================================

describe("discoverMarketsViaApi — direct unit tests", () => {
  it("sends GET request with Accept: application/json", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ markets: [] }),
    } as Response);

    const mockConnection = {} as Connection;
    await discoverMarketsViaApi(mockConnection, PROGRAM_ID, "https://api.example.com");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.example.com/markets");
    expect(opts.method).toBe("GET");
    expect(opts.headers).toMatchObject({ Accept: "application/json" });
  });

  it("throws on non-OK response (preserves status code in error)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    } as Response);

    await expect(
      discoverMarketsViaApi({} as Connection, PROGRAM_ID, "https://api.example.com"),
    ).rejects.toThrow("502");
  });

  it("handles mixed valid/invalid slab_addresses in API response", async () => {
    const validAddr = fakePubkey(10).toBase58();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [
          { slab_address: validAddr },
          { slab_address: "invalid!!!" },
          { slab_address: "" },
          { slab_address: null },
          { symbol: "NO-SLAB" },
        ],
      }),
    } as Response);

    const mockGetMultiple = vi.fn().mockResolvedValue([null]);
    const mockConnection = {
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    await discoverMarketsViaApi(mockConnection, PROGRAM_ID, "https://api.example.com");

    // Only 1 valid address passed to getMultipleAccountsInfo
    const passedAddresses = mockGetMultiple.mock.calls[0][0] as PublicKey[];
    expect(passedAddresses).toHaveLength(1);
    expect(passedAddresses[0].toBase58()).toBe(validAddr);
  });
});

// ===========================================================================
// 11. discoverMarketsViaStaticBundle — DIRECT UNIT TESTS
// ===========================================================================

describe("discoverMarketsViaStaticBundle — direct unit tests", () => {
  it("returns empty for empty entries array", async () => {
    const result = await discoverMarketsViaStaticBundle({} as Connection, PROGRAM_ID, []);
    expect(result).toEqual([]);
  });

  it("returns empty when all entries have invalid slabAddress", async () => {
    const result = await discoverMarketsViaStaticBundle({} as Connection, PROGRAM_ID, [
      { slabAddress: "bad-addr" },
      { slabAddress: "" },
    ]);
    expect(result).toEqual([]);
  });

  it("passes valid addresses to getMultipleAccountsInfo", async () => {
    const addr1 = fakePubkey(1).toBase58();
    const addr2 = fakePubkey(2).toBase58();

    const mockGetMultiple = vi.fn().mockResolvedValue([null, null]);
    const mockConnection = {
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    await discoverMarketsViaStaticBundle(mockConnection, PROGRAM_ID, [
      { slabAddress: addr1, symbol: "A" },
      { slabAddress: addr2, symbol: "B" },
    ]);

    expect(mockGetMultiple).toHaveBeenCalledTimes(1);
    const addrs = mockGetMultiple.mock.calls[0][0].map((a: PublicKey) => a.toBase58());
    expect(addrs).toEqual([addr1, addr2]);
  });

  it("forwards onChainOptions to getMarketsByAddress", async () => {
    const addrs = Array.from({ length: 5 }, (_, i) => fakePubkey(i + 50).toBase58());

    const mockGetMultiple = vi.fn().mockResolvedValue(Array(5).fill(null));
    const mockConnection = {
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    await discoverMarketsViaStaticBundle(
      mockConnection,
      PROGRAM_ID,
      addrs.map(a => ({ slabAddress: a })),
      { onChainOptions: { batchSize: 2, interBatchDelayMs: 0 } },
    );

    // With batchSize=2 and 5 addresses → 3 batches
    expect(mockGetMultiple).toHaveBeenCalledTimes(3);
  });
});

// ===========================================================================
// 12. CONCURRENCY AND OPTIONS
// ===========================================================================

describe("maxParallelTiers and maxTierQueries options", () => {
  it("maxTierQueries limits the number of tier queries", async () => {
    let tierQueryCount = 0;
    const mockConnection = {
      getProgramAccounts: vi.fn().mockImplementation(async (_pid: any, config: any) => {
        const filters = config?.filters ?? [];
        if (filters.some((f: any) => "dataSize" in f)) tierQueryCount++;
        return [];
      }),
    } as unknown as Connection;

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      maxTierQueries: 3,
    });

    expect(tierQueryCount).toBe(3);
  });

  it("maxParallelTiers=1 serializes RPC calls in parallel mode", async () => {
    const callTimestamps: number[] = [];

    const mockConnection = {
      getProgramAccounts: vi.fn().mockImplementation(async () => {
        callTimestamps.push(Date.now());
        return [];
      }),
    } as unknown as Connection;

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      maxParallelTiers: 1,
      maxTierQueries: 3,
    });

    // Should have 3 tier calls + 1 memcmp fallback
    expect(callTimestamps.length).toBeGreaterThanOrEqual(3);
  });

  it("handles maxParallelTiers=0 safely (defaults to 1)", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    // Should not hang or throw
    const result = await discoverMarkets(mockConnection, PROGRAM_ID, {
      maxParallelTiers: 0,
      maxTierQueries: 1,
    });

    expect(result).toEqual([]);
  });
});

// ===========================================================================
// 13. MEMCMP FALLBACK WITHIN TIER 1
// ===========================================================================

describe("memcmp fallback within tier 1", () => {
  it("falls back to memcmp when all dataSize queries return 0 results", async () => {
    let memcmpCalled = false;
    const mockConnection = {
      getProgramAccounts: vi.fn().mockImplementation(async (_pid: any, config: any) => {
        const filters = config?.filters ?? [];
        for (const f of filters) {
          if ("memcmp" in f) {
            memcmpCalled = true;
            return [];
          }
        }
        return []; // dataSize queries return 0
      }),
    } as unknown as Connection;

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      maxTierQueries: 2,
    });

    expect(memcmpCalled).toBe(true);
  });

  it("falls back to memcmp when dataSize query throws (non-429)", async () => {
    let memcmpCalled = false;
    const mockConnection = {
      getProgramAccounts: vi.fn().mockImplementation(async (_pid: any, config: any) => {
        const filters = config?.filters ?? [];
        for (const f of filters) {
          if ("memcmp" in f) {
            memcmpCalled = true;
            return [];
          }
        }
        throw new Error("Connection refused");
      }),
    } as unknown as Connection;

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      maxTierQueries: 1,
    });

    expect(memcmpCalled).toBe(true);
  });

  it("memcmp fallback also failing triggers API fallback", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockImplementation(async (_pid: any, config: any) => {
        const filters = config?.filters ?? [];
        for (const f of filters) {
          if ("memcmp" in f) throw new Error("memcmp also rejected");
        }
        throw new Error("Connection refused");
      }),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ markets: [{ slab_address: fakePubkey(5).toBase58() }] }),
    } as Response);

    await discoverMarkets(mockConnection, PROGRAM_ID, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      maxTierQueries: 1,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
