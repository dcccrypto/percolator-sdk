import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  discoverMarkets,
  discoverMarketsViaApi,
  type ApiMarketEntry,
} from "../src/solana/discovery.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a deterministic keypair-like PublicKey from an index. */
function fakePubkey(index: number): PublicKey {
  const bytes = new Uint8Array(32);
  bytes[0] = index & 0xff;
  bytes[1] = (index >> 8) & 0xff;
  return new PublicKey(bytes);
}

/** PERCOLAT magic bytes — little-endian "TALOCREP" */
const MAGIC = new Uint8Array([0x54, 0x41, 0x4c, 0x4f, 0x43, 0x52, 0x45, 0x50]);

/**
 * Build a minimal slab buffer that passes magic-byte validation.
 * Real parse functions will read offsets beyond the magic, so we provide a
 * large-enough zero-filled buffer.  The V_ADL large slab size is 1,288,304
 * but for unit tests we just need enough data to avoid out-of-bounds reads
 * during header/config/engine parsing (~2000 bytes is plenty for the
 * HEADER_SLICE_LENGTH path).
 */
function buildMinimalSlab(dataSize: number): Buffer {
  const buf = Buffer.alloc(dataSize);
  buf.set(MAGIC, 0);
  // version field at offset 8 — set to 1 for V1 detection
  buf.writeUInt32LE(1, 8);
  return buf;
}

// ---------------------------------------------------------------------------
// Mock fetch for API tests
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ===========================================================================
// discoverMarketsViaApi() — unit tests
// ===========================================================================

describe("discoverMarketsViaApi", () => {
  const programId = fakePubkey(255);

  it("fetches slab addresses from API and returns DiscoveredMarket[]", async () => {
    const slabAddr1 = fakePubkey(1).toBase58();
    const slabAddr2 = fakePubkey(2).toBase58();

    const apiResponse: { markets: ApiMarketEntry[] } = {
      markets: [
        { slabAddress: slabAddr1, symbol: "SOL-PERP" },
        { slabAddress: slabAddr2, symbol: "ETH-PERP" },
      ],
    };

    // Mock the API response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => apiResponse,
    } as Response);

    // Mock connection.getMultipleAccountsInfo — return null for both accounts
    // (simulating accounts not found on-chain, which is fine — they get skipped)
    const mockConnection = {
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null, null]),
    } as unknown as Connection;

    const result = await discoverMarketsViaApi(
      mockConnection,
      programId,
      "https://api.percolatorlaunch.com",
    );

    // API was called with correct URL
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toBe("https://api.percolatorlaunch.com/markets");
    expect(fetchCall[1]).toMatchObject({
      method: "GET",
      headers: { Accept: "application/json" },
    });

    // getMultipleAccountsInfo was called with the slab addresses
    expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
    const passedAddresses = (mockConnection.getMultipleAccountsInfo as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as PublicKey[];
    expect(passedAddresses.map((a: PublicKey) => a.toBase58())).toEqual([slabAddr1, slabAddr2]);

    // No accounts found on-chain → empty result
    expect(result).toEqual([]);
  });

  it("strips trailing slash from apiBaseUrl", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ markets: [] }),
    } as Response);

    const mockConnection = {} as Connection;

    await discoverMarketsViaApi(
      mockConnection,
      programId,
      "https://api.percolatorlaunch.com///",
    );

    expect(mockFetch.mock.calls[0][0]).toBe("https://api.percolatorlaunch.com/markets");
  });

  it("throws on non-OK API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    } as Response);

    const mockConnection = {} as Connection;

    await expect(
      discoverMarketsViaApi(mockConnection, programId, "https://api.example.com"),
    ).rejects.toThrow("API returned 500 Internal Server Error");
  });

  it("returns empty array when API returns empty markets list", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ markets: [] }),
    } as Response);

    const mockConnection = {} as Connection;
    const result = await discoverMarketsViaApi(
      mockConnection,
      programId,
      "https://api.example.com",
    );

    expect(result).toEqual([]);
  });

  it("returns empty array when API returns no markets field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    const mockConnection = {} as Connection;
    const result = await discoverMarketsViaApi(
      mockConnection,
      programId,
      "https://api.example.com",
    );

    expect(result).toEqual([]);
  });

  it("skips entries with missing or invalid slabAddress", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [
          { symbol: "NO-SLAB" },
          { slabAddress: "", symbol: "EMPTY" },
          { slabAddress: "not-a-valid-pubkey!!!", symbol: "BAD" },
          { slabAddress: 12345, symbol: "WRONG-TYPE" },
        ],
      }),
    } as Response);

    const mockConnection = {} as Connection;
    const result = await discoverMarketsViaApi(
      mockConnection,
      programId,
      "https://api.example.com",
    );

    // All entries invalid → empty result, no RPC calls made
    expect(result).toEqual([]);
  });

  it("respects timeoutMs option via AbortController", async () => {
    // Simulate a slow API that never resolves
    mockFetch.mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );

    const mockConnection = {} as Connection;

    await expect(
      discoverMarketsViaApi(mockConnection, programId, "https://api.example.com", {
        timeoutMs: 50,
      }),
    ).rejects.toThrow(/abort/i);
  });

  it("forwards onChainOptions to getMarketsByAddress", async () => {
    const slabAddr = fakePubkey(10).toBase58();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [{ slabAddress: slabAddr }],
      }),
    } as Response);

    const mockGetMultiple = vi.fn().mockResolvedValue([null]);
    const mockConnection = {
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    await discoverMarketsViaApi(mockConnection, programId, "https://api.example.com", {
      onChainOptions: { batchSize: 10, interBatchDelayMs: 100 },
    });

    // Verify getMultipleAccountsInfo was called (batchSize=10 means batch of 1 address fits)
    expect(mockGetMultiple).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// discoverMarkets() — API fallback integration
// ===========================================================================

describe("discoverMarkets with apiBaseUrl fallback", () => {
  const programId = fakePubkey(200);

  it("falls back to API when getProgramAccounts returns 0 results", async () => {
    const slabAddr = fakePubkey(50).toBase58();

    // Mock connection: getProgramAccounts returns empty, getMultipleAccountsInfo returns null
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    // Mock API response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [{ slabAddress: slabAddr }],
      }),
    } as Response);

    const result = await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://api.percolatorlaunch.com",
    });

    // API was called as fallback
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.percolatorlaunch.com/markets");

    // getMultipleAccountsInfo was called with the API-provided address
    expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
  });

  it("does NOT call API when getProgramAccounts returns results", async () => {
    // Build a minimal slab that passes magic validation
    const slabData = buildMinimalSlab(1400);

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([
        {
          pubkey: fakePubkey(1),
          account: { data: slabData },
        },
      ]),
    } as unknown as Connection;

    // discoverMarkets will try to parse — it may fail on the minimal buffer,
    // but the key assertion is that the API is never called
    await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://api.percolatorlaunch.com",
      maxTierQueries: 1,
    });

    // API should NOT have been called since RPC returned data
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does NOT call API when apiBaseUrl is not set", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    const result = await discoverMarkets(mockConnection, programId, {
      maxTierQueries: 1,
    });

    // No API call, no error — just empty results
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("returns empty array when both RPC and API fallback fail", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    // Mock API returning error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => ({}),
    } as Response);

    const result = await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://api.example.com",
      maxTierQueries: 1,
    });

    // Should gracefully return empty array
    expect(result).toEqual([]);
  });

  it("returns empty array when RPC throws and memcmp also throws and API fails", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockRejectedValue(new Error("429 Too Many Requests")),
    } as unknown as Connection;

    // Mock API also failing
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://api.example.com",
      maxTierQueries: 1,
    });

    expect(result).toEqual([]);
  });

  it("respects apiTimeoutMs option", async () => {
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    // Simulate slow API
    mockFetch.mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const result = await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://api.example.com",
      apiTimeoutMs: 50,
      maxTierQueries: 1,
    });

    // Timeout causes API fallback to fail gracefully → empty result
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// discoverMarketsViaApi — API response edge cases
// ===========================================================================

describe("discoverMarketsViaApi edge cases", () => {
  const programId = fakePubkey(100);

  it("handles API returning markets with null slabAddress values", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [
          { slabAddress: null, symbol: "ZOMBIE" },
          { slabAddress: fakePubkey(1).toBase58(), symbol: "VALID" },
        ],
      }),
    } as Response);

    const mockConnection = {
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    const result = await discoverMarketsViaApi(
      mockConnection,
      programId,
      "https://api.example.com",
    );

    // Only 1 valid address should have been passed to getMultipleAccountsInfo
    const passedAddresses = (mockConnection.getMultipleAccountsInfo as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as PublicKey[];
    expect(passedAddresses.length).toBe(1);
    expect(passedAddresses[0].toBase58()).toBe(fakePubkey(1).toBase58());
  });

  it("handles fetch throwing (network error, DNS failure)", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const mockConnection = {} as Connection;

    await expect(
      discoverMarketsViaApi(mockConnection, programId, "https://api.example.com"),
    ).rejects.toThrow("Failed to fetch");
  });

  it("handles API returning non-JSON response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    } as Response);

    const mockConnection = {} as Connection;

    await expect(
      discoverMarketsViaApi(mockConnection, programId, "https://api.example.com"),
    ).rejects.toThrow("Unexpected token");
  });
});
