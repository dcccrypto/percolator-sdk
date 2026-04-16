import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  discoverMarkets,
  discoverMarketsViaStaticBundle,
} from "../src/solana/discovery.js";
import {
  registerStaticMarkets,
  clearStaticMarkets,
} from "../src/solana/static-markets.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakePubkey(index: number): PublicKey {
  const bytes = new Uint8Array(32);
  bytes[0] = index & 0xff;
  bytes[1] = (index >> 8) & 0xff;
  return new PublicKey(bytes);
}

/** PERCOLAT magic bytes — little-endian "TALOCREP" */
const MAGIC = new Uint8Array([0x54, 0x41, 0x4c, 0x4f, 0x43, 0x52, 0x45, 0x50]);

/** Build a minimal slab buffer that passes magic-byte validation. */
function buildMinimalSlab(dataSize: number): Buffer {
  const buf = Buffer.alloc(dataSize);
  buf.set(MAGIC, 0);
  buf.writeUInt32LE(1, 8); // version = 1
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
  clearStaticMarkets();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  clearStaticMarkets();
});

// ===========================================================================
// discoverMarketsViaStaticBundle() — unit tests
// ===========================================================================

describe("discoverMarketsViaStaticBundle", () => {
  const programId = fakePubkey(255);

  it("returns empty array when entries is empty", async () => {
    const mockConnection = {} as Connection;
    const result = await discoverMarketsViaStaticBundle(
      mockConnection,
      programId,
      [],
    );
    expect(result).toEqual([]);
  });

  it("fetches on-chain data for valid slab addresses", async () => {
    const addr1 = fakePubkey(1).toBase58();
    const addr2 = fakePubkey(2).toBase58();

    const mockConnection = {
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null, null]),
    } as unknown as Connection;

    const result = await discoverMarketsViaStaticBundle(
      mockConnection,
      programId,
      [
        { slabAddress: addr1, symbol: "SOL-PERP" },
        { slabAddress: addr2, symbol: "ETH-PERP" },
      ],
    );

    // getMultipleAccountsInfo called with both addresses
    expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
    const passedAddresses = (mockConnection.getMultipleAccountsInfo as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as PublicKey[];
    expect(passedAddresses.map((a: PublicKey) => a.toBase58())).toEqual([addr1, addr2]);

    // Accounts not found on-chain → empty result
    expect(result).toEqual([]);
  });

  it("skips entries with invalid slab addresses", async () => {
    const validAddr = fakePubkey(1).toBase58();

    const mockConnection = {
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    await discoverMarketsViaStaticBundle(
      mockConnection,
      programId,
      [
        { slabAddress: "not-a-valid-pubkey!!!" },
        { slabAddress: "", symbol: "EMPTY" },
        { slabAddress: validAddr, symbol: "VALID" },
      ],
    );

    // Only valid address should have been passed
    const passedAddresses = (mockConnection.getMultipleAccountsInfo as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as PublicKey[];
    expect(passedAddresses).toHaveLength(1);
    expect(passedAddresses[0].toBase58()).toBe(validAddr);
  });

  it("returns empty array when all addresses are invalid", async () => {
    const mockConnection = {} as Connection;

    const result = await discoverMarketsViaStaticBundle(
      mockConnection,
      programId,
      [
        { slabAddress: "invalid-1" },
        { slabAddress: "invalid-2" },
      ],
    );

    expect(result).toEqual([]);
  });

  it("skips entries with missing slabAddress field", async () => {
    const mockConnection = {} as Connection;

    const result = await discoverMarketsViaStaticBundle(
      mockConnection,
      programId,
      [
        { slabAddress: "" },
        {} as any,
      ],
    );

    expect(result).toEqual([]);
  });

  it("forwards onChainOptions to getMarketsByAddress", async () => {
    const addr = fakePubkey(10).toBase58();

    const mockGetMultiple = vi.fn().mockResolvedValue([null]);
    const mockConnection = {
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    await discoverMarketsViaStaticBundle(
      mockConnection,
      programId,
      [{ slabAddress: addr }],
      { onChainOptions: { batchSize: 5, interBatchDelayMs: 50 } },
    );

    expect(mockGetMultiple).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// discoverMarkets() — tier 3 static fallback integration
// ===========================================================================

describe("discoverMarkets with tier-3 static fallback", () => {
  const programId = fakePubkey(200);

  it("falls back to static bundle when both RPC and API fail", async () => {
    const staticAddr = fakePubkey(77).toBase58();

    // Register a static market for mainnet
    registerStaticMarkets("mainnet", [
      { slabAddress: staticAddr, symbol: "SOL-PERP" },
    ]);

    // RPC: getProgramAccounts returns empty
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    // API: returns error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => ({}),
    } as Response);

    const result = await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // API was called (tier 2)
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // getMultipleAccountsInfo was called with static addresses (tier 3)
    expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
    const passedAddresses = (mockConnection.getMultipleAccountsInfo as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as PublicKey[];
    const passedBase58 = passedAddresses.map((a: PublicKey) => a.toBase58());
    // The registered address must be among those passed (built-in mainnet entries may also be present)
    expect(passedBase58).toContain(staticAddr);
  });

  it("falls back to static bundle when API returns 0 markets", async () => {
    const staticAddr = fakePubkey(88).toBase58();

    registerStaticMarkets("mainnet", [
      { slabAddress: staticAddr, symbol: "BTC-PERP" },
    ]);

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
    } as unknown as Connection;

    // API: succeeds but returns empty markets
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ markets: [] }),
    } as Response);

    await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // Tier 3 triggered — getMultipleAccountsInfo called with static address
    expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
  });

  it("falls through to tier 3 when API returns addresses but none resolve on-chain", async () => {
    const apiAddr = fakePubkey(55).toBase58();
    const staticAddr = fakePubkey(99).toBase58();

    registerStaticMarkets("mainnet", [
      { slabAddress: staticAddr, symbol: "STATIC-ONLY" },
    ]);

    // RPC returns empty
    const mockGetMultiple = vi.fn().mockResolvedValue([null]);
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    // API returns addresses, but they don't resolve on-chain
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [{ slab_address: apiAddr }],
      }),
    } as Response);

    await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // getMultipleAccountsInfo called twice:
    // 1. For the API address (tier 2) — returned null → 0 parsed markets
    // 2. For the static address (tier 3) — falls through because API resolved 0 markets
    expect(mockGetMultiple).toHaveBeenCalledTimes(2);
    // First call: API address
    const apiAddresses = mockGetMultiple.mock.calls[0][0] as PublicKey[];
    expect(apiAddresses.map((a: PublicKey) => a.toBase58())).toEqual([apiAddr]);
    // Second call: static addresses (user-registered + built-in mainnet entries)
    const staticAddresses = mockGetMultiple.mock.calls[1][0] as PublicKey[];
    const staticBase58 = staticAddresses.map((a: PublicKey) => a.toBase58());
    expect(staticBase58).toContain(staticAddr);
  });

  it("does NOT call tier 3 when network is not set", async () => {
    registerStaticMarkets("mainnet", [
      { slabAddress: fakePubkey(1).toBase58() },
    ]);

    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    // API fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Error",
    } as Response);

    const result = await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://api.example.com",
      // network not set — tier 3 disabled
      maxTierQueries: 1,
    });

    // No getMultipleAccountsInfo calls — tier 3 was not triggered
    expect(result).toEqual([]);
  });

  it("returns empty when all 3 tiers fail", async () => {
    registerStaticMarkets("mainnet", [
      { slabAddress: fakePubkey(1).toBase58() },
    ]);

    // RPC throws
    const mockConnection = {
      getProgramAccounts: vi.fn().mockRejectedValue(new Error("429 Too Many Requests")),
      getMultipleAccountsInfo: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
    } as unknown as Connection;

    // API fails
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://api.example.com",
      network: "mainnet",
      maxTierQueries: 1,
    });

    expect(result).toEqual([]);
  });

  it("skips tier 3 when static bundle is empty for the network", async () => {
    // No entries registered for devnet
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
    } as unknown as Connection;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as Response);

    const result = await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://api.example.com",
      network: "devnet",
      maxTierQueries: 1,
    });

    expect(result).toEqual([]);
  });

  it("tier 1 success bypasses tier 2 and tier 3", async () => {
    registerStaticMarkets("mainnet", [
      { slabAddress: fakePubkey(99).toBase58() },
    ]);

    // RPC returns a valid slab
    const slabData = buildMinimalSlab(1400);
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([
        { pubkey: fakePubkey(1), account: { data: slabData } },
      ]),
    } as unknown as Connection;

    await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // Neither API nor static bundle should have been called
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("tier 2 success bypasses tier 3 even when RPC returns 0", async () => {
    const apiAddr = fakePubkey(42).toBase58();
    const staticAddr = fakePubkey(99).toBase58();

    registerStaticMarkets("mainnet", [
      { slabAddress: staticAddr },
    ]);

    // Build a valid slab for the API address
    const slabSize = 65088; // V1D small tier
    const slabData = buildMinimalSlab(slabSize);

    const mockGetMultiple = vi.fn().mockResolvedValue([
      { data: slabData, owner: programId, lamports: 1, executable: false },
    ]);
    const mockConnection = {
      getProgramAccounts: vi.fn().mockResolvedValue([]),
      getMultipleAccountsInfo: mockGetMultiple,
    } as unknown as Connection;

    // API returns a market
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        markets: [{ slab_address: apiAddr }],
      }),
    } as Response);

    await discoverMarkets(mockConnection, programId, {
      apiBaseUrl: "https://percolatorlaunch.com/api",
      network: "mainnet",
      maxTierQueries: 1,
    });

    // getMultipleAccountsInfo called once — only for API address, not static
    expect(mockGetMultiple).toHaveBeenCalledTimes(1);
    const passedAddresses = mockGetMultiple.mock.calls[0][0] as PublicKey[];
    expect(passedAddresses.map((a: PublicKey) => a.toBase58())).toEqual([apiAddr]);
  });
});
