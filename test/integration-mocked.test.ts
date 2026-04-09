/**
 * PERC-8339: Offline / mocked integration test suite for mainnet smoke paths.
 *
 * All tests run without a live RPC connection — network calls are replaced with
 * in-process mocks that return realistic on-chain-shaped data.
 *
 * Coverage:
 *   1. discoverMarkets() — mocked getProgramAccounts, sequential mode
 *   2. fetchAdlRankedPositions() — mocked getAccountInfo returning valid slab bytes
 *   3. buildAdlTransaction() — end-to-end: mock slab → rank → instruction output
 *   4. fetchAdlRankings() — mocked HTTP fetch returning /api/adl/rankings JSON
 *   5. Error codes 61-65 — parseErrorFromLogs with realistic on-chain error logs
 */

import { describe, it, expect } from "vitest";
import { PublicKey, Connection, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";

// SDK under test
import { discoverMarkets } from "../src/solana/discovery.js";
import {
  fetchAdlRankedPositions,
  buildAdlTransaction,
  buildAdlInstruction,
  fetchAdlRankings,
  rankAdlPositions,
  isAdlTriggered,
  parseAdlEvent,
} from "../src/solana/adl.js";
import {
  parseErrorFromLogs,
  decodeError,
  PERCOLATOR_ERRORS,
} from "../src/abi/errors.js";
import { detectSlabLayout } from "../src/solana/slab.js";

// ============================================================================
// Slab fixture builder
// ============================================================================

/**
 * Build a minimal but structurally valid V1M small slab (65_416 bytes).
 *
 * SLAB_TIERS_V1M.small!.dataSize=65_416 maps to the V1M layout (mainnet program ESa89R5):
 *   ENGINE_OFF=640, CONFIG_LEN=536, BITMAP_OFF_REL=720, pnlPosTotOff=552
 *   accountsOff_abs=1928, bitmapAbs=1360, acctOwnerOff=184, acctPositionSizeOff=80
 *
 * V1M is in discovery's ALL_TIERS list (the older V1_LEGACY 65_352 size is
 * only registered in V1_SIZES_LEGACY for read-only parsing of orphaned
 * devnet slabs and is NOT discovered by getProgramAccounts tier filters).
 * Using V1M small here keeps the mock fixture consistent with what the
 * filter-aware test connection actually queries for.
 *
 * Only the bytes that affect the fields read by the SDK are filled.
 * The resulting buffer is accepted by detectSlabLayout, parseConfig,
 * parseEngine, and rankAdlPositions.
 */
function buildV1SmallSlab(opts: {
  pnlPosTot?: bigint;
  maxPnlCap?: bigint;
  /** List of user accounts to embed: idx, pnl, capital, positionSize */
  accounts?: Array<{ idx: number; pnl: bigint; capital: bigint; positionSize: bigint }>;
} = {}): Uint8Array {
  // V1M small slab: 65,416 bytes (ENGINE_OFF=640, ACCOUNT_SIZE=248, BITMAP_OFF_REL=720)
  const size = 65_416;
  const buf = Buffer.alloc(size, 0);
  const dv = new DataView(buf.buffer);

  // ---- HEADER (offset 0) ----
  // magic: "PERCOLAT" = 0x504552434f4c4154  (LE)
  dv.setBigUint64(0, 0x504552434f4c4154n, true);
  // version = 1
  dv.setUint32(8, 1, true);
  buf[12] = 255; // bump
  buf.set(new PublicKey("SysvarC1ock11111111111111111111111111111111").toBytes(), 16);

  // ---- CONFIG (offset 104, V1M_CONFIG_LEN=536) ----
  // Collateral mint / vault / index_feed_id  (each 32 bytes starting at 104)
  buf.set(new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").toBytes(), 104);
  buf.set(new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM").toBytes(), 136);
  buf.set(new PublicKey("So11111111111111111111111111111111111111112").toBytes(), 168);
  // max_staleness_slots u64 at 200
  dv.setBigUint64(200, 200n, true);
  // conf_filter_bps u16 at 208, vault_authority_bump u8 at 210, unit_scale u32 at 212
  dv.setUint16(208, 100, true);
  buf[210] = 254;
  dv.setUint32(212, 1_000_000, true);

  // maxPnlCap (u64 LE) — offset within config:
  //   3 pubkeys(96) + maxStaleness(8)+confFilter(2)+bump(1)+invert(1)+unitScale(4)=16
  //   + 9 funding fields: 8+8+16+8+8+8+8+8+8=80
  //   + 8 thresh fields: 16+8+8+8+8+16+16+16=96
  //   + oracleAuthority(32)+authorityPriceE6(8)+authorityTimestamp(8)=48
  //   + oraclePriceCapE2bps(8)+lastEffPriceE6(8)+oiCapMultiplierBps(8)=24
  //   → 360 bytes before maxPnlCap → absolute = 104 + 360 = 464
  dv.setBigUint64(464, opts.maxPnlCap ?? 0n, true);

  // ---- ENGINE (V1M: ENGINE_OFF=640, bitmapOff_rel=720) ----
  // SLAB_TIERS_V1M.small!.dataSize=65_416 → detectSlabLayout returns V1M layout:
  //   engineOff=640, pnlPosTotOff=552, bitmapOff_rel=720, accountsOff=1928, acctOwnerOff=184
  // pnlPosTot u128 at absolute = 640 + 552 = 1192
  if (opts.pnlPosTot !== undefined) {
    writeBigUint128LE(buf, 1192, opts.pnlPosTot);
  }

  // ---- ACCOUNTS ----
  // V1M small: accountsOff=1928, bitmapAbs=1360, acctOwnerOff=184
  const ACCOUNTS_OFF = 1928;
  const ACCOUNT_SIZE = 248;
  const BITMAP_ABS   = 1360; // 640 + 720

  for (const acct of (opts.accounts ?? [])) {
    const base = ACCOUNTS_OFF + acct.idx * ACCOUNT_SIZE;
    if (base + ACCOUNT_SIZE > size) throw new Error(`Account idx ${acct.idx} out of range`);
    dv.setBigUint64(base + 0, BigInt(acct.idx + 1), true); // account_id
    writeBigUint128LE(buf, base + 8, acct.capital < 0n ? 0n : acct.capital); // capital u128
    buf[base + 24] = 0; // kind = User
    writeBigInt128LE(buf, base + 32, acct.pnl);             // pnl i128
    writeBigInt128LE(buf, base + 80, acct.positionSize);    // positionSize i128
    // owner pubkey at acctOwnerOff=184 (V1M parser reads from base+184; older
    // V1_LEGACY mock wrote at +200 which the parser silently ignored).
    const ownerSeed = `ACCT${String(acct.idx).padStart(7, "0")}11111111111111111111111`;
    buf.set(Buffer.from(ownerSeed.slice(0, 32)), base + 184);
    setBitmapBit(buf, BITMAP_ABS, acct.idx);
  }

  return new Uint8Array(buf);
}

// ---- u128/i128 LE write helpers ----

function writeBigUint128LE(buf: Buffer, off: number, v: bigint): void {
  const lo = v & 0xFFFF_FFFF_FFFF_FFFFn;
  const hi = (v >> 64n) & 0xFFFF_FFFF_FFFF_FFFFn;
  const dv = new DataView(buf.buffer, buf.byteOffset);
  dv.setBigUint64(off, lo, true);
  dv.setBigUint64(off + 8, hi, true);
}

function writeBigInt128LE(buf: Buffer, off: number, v: bigint): void {
  // Two's complement 128-bit LE
  const mask = (1n << 128n) - 1n;
  const raw = v < 0n ? (v + (1n << 128n)) & mask : v & mask;
  writeBigUint128LE(buf, off, raw);
}

function setBitmapBit(buf: Buffer, bitmapAbs: number, idx: number): void {
  const word = Math.floor(idx / 64);
  const bit = idx % 64;
  const dv = new DataView(buf.buffer, buf.byteOffset);
  const current = dv.getBigUint64(bitmapAbs + word * 8, true);
  dv.setBigUint64(bitmapAbs + word * 8, current | (1n << BigInt(bit)), true);
}

// ---- Connection mock factory ----

function makeConnection(opts: {
  slabData?: Uint8Array;
  programAccounts?: Array<{ pubkey: PublicKey; account: { data: Buffer; owner: PublicKey; lamports: number; executable: boolean; rentEpoch: number } }>;
}): Connection {
  return {
    getAccountInfo: async (_key: PublicKey) => {
      if (!opts.slabData) return null;
      return {
        data: Buffer.from(opts.slabData),
        owner: new PublicKey("11111111111111111111111111111111"),
        lamports: 10_000_000,
        executable: false,
        rentEpoch: 0,
      };
    },
    getProgramAccounts: async (
      _programId: PublicKey,
      config?: { filters?: Array<{ dataSize?: number; memcmp?: { offset: number; bytes: string } }> },
    ) => {
      // Filter-aware mock: when discoverMarkets queries by `dataSize`, only
      // return entries whose actual data length matches. This mirrors how
      // Solana RPC's getProgramAccounts behaves and prevents the test slab
      // from being delivered to discoverMarkets tagged with the WRONG tier
      // dataSize (which would cause detectSlabLayout to misidentify the
      // layout and parseConfig to read garbage from the wrong configOffset).
      // Filters without `dataSize` (e.g. the memcmp magic-bytes fallback)
      // pass through unfiltered to preserve current behaviour.
      const all = opts.programAccounts ?? [];
      const dataSizeFilter = config?.filters?.find(f => f.dataSize !== undefined);
      if (dataSizeFilter?.dataSize !== undefined) {
        return all.filter(entry => entry.account.data.length === dataSizeFilter.dataSize);
      }
      return all;
    },
  } as unknown as Connection;
}

const PROGRAM_ID = new PublicKey("EXsr2Tfz8ntWYP3vgCStdknFBoafvJQugJKAh4nFdo8f");
const SLAB_KEY   = new PublicKey("7rUiMfQVTRMJb44fzDT7Gq1BGtioN3UVqNKaMVuqyqyH");
const ORACLE_KEY = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const CALLER     = new PublicKey("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");

// ============================================================================
// 1. discoverMarkets() — mocked getProgramAccounts
// ============================================================================

describe("discoverMarkets — mocked RPC (PERC-8339)", () => {
  it("returns empty array when no program accounts match", async () => {
    const conn = makeConnection({ programAccounts: [] });
    const markets = await discoverMarkets(conn, PROGRAM_ID);
    expect(markets).toEqual([]);
  });

  it("returns a discovered market when getProgramAccounts returns a valid slab", async () => {
    const slabData = buildV1SmallSlab();
    const conn = makeConnection({
      programAccounts: [
        {
          pubkey: SLAB_KEY,
          account: {
            data: Buffer.from(slabData),
            owner: PROGRAM_ID,
            lamports: 10_000_000,
            executable: false,
            rentEpoch: 0,
          },
        },
      ],
    });

    const markets = await discoverMarkets(conn, PROGRAM_ID);
    expect(markets.length).toBe(1);
    expect(markets[0].slabAddress.equals(SLAB_KEY)).toBe(true);
    expect(markets[0].header.version).toBe(1);
  });

  it("detects layout correctly for the V1M small slab fixture (65_416 bytes)", () => {
    const slabData = buildV1SmallSlab();
    expect(slabData.length).toBe(65_416); // V1M small
    const layout = detectSlabLayout(slabData.length);
    expect(layout).not.toBeNull();
    expect(layout!.maxAccounts).toBe(256);
    expect(layout!.accountSize).toBe(248);
  });

  it("sequential mode returns markets without throwing on 429 retry paths", async () => {
    let callCount = 0;
    const conn = {
      getProgramAccounts: async (_programId: PublicKey, _cfg: unknown) => {
        callCount++;
        return [];
      },
    } as unknown as Connection;

    const markets = await discoverMarkets(conn, PROGRAM_ID, {
      sequential: true,
      interTierDelayMs: 0,
      rateLimitBackoffMs: [0, 0],
    });

    expect(markets).toEqual([]);
    expect(callCount).toBeGreaterThan(0);
  });

  it("returns discovered market with correct collateral mint parsed from slab", async () => {
    const slabData = buildV1SmallSlab();
    const conn = makeConnection({
      programAccounts: [
        {
          pubkey: SLAB_KEY,
          account: {
            data: Buffer.from(slabData),
            owner: PROGRAM_ID,
            lamports: 10_000_000,
            executable: false,
            rentEpoch: 0,
          },
        },
      ],
    });

    const markets = await discoverMarkets(conn, PROGRAM_ID);
    expect(markets.length).toBe(1);
    // Collateral mint set to USDC in builder
    expect(markets[0].config.collateralMint.toBase58()).toBe(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );
  });

  it("handles multiple markets in parallel mode", async () => {
    const slabData = buildV1SmallSlab();
    const slab2 = new PublicKey("3Eq3G6fiPFkvqQdUXNMGRrgqVCcNV74Mo7Td9qhvq3HR");
    const conn = {
      getProgramAccounts: async (_programId: PublicKey, _cfg: unknown) => {
        return [
          { pubkey: SLAB_KEY, account: { data: Buffer.from(slabData), owner: PROGRAM_ID, lamports: 10_000_000, executable: false, rentEpoch: 0 } },
          { pubkey: slab2,    account: { data: Buffer.from(slabData), owner: PROGRAM_ID, lamports: 10_000_000, executable: false, rentEpoch: 0 } },
        ];
      },
    } as unknown as Connection;

    const markets = await discoverMarkets(conn, PROGRAM_ID);
    // Each tier query returns both slabs — they will be deduplicated by address
    const addrs = new Set(markets.map(m => m.slabAddress.toBase58()));
    expect(addrs.size).toBe(2);
  });
});

// ============================================================================
// 2. fetchAdlRankedPositions() — mocked getAccountInfo
// ============================================================================

describe("fetchAdlRankedPositions — mocked RPC (PERC-8339)", () => {
  it("returns empty ranked list when slab has no open positions", async () => {
    const slabData = buildV1SmallSlab({ pnlPosTot: 0n, maxPnlCap: 1_000_000n });
    const conn = makeConnection({ slabData });

    const result = await fetchAdlRankedPositions(conn, SLAB_KEY);
    expect(result.ranked).toHaveLength(0);
    expect(result.longs).toHaveLength(0);
    expect(result.shorts).toHaveLength(0);
    expect(result.isTriggered).toBe(false);
  });

  it("returns positions ranked by pnlPct when slab has open user accounts", async () => {
    const slabData = buildV1SmallSlab({
      pnlPosTot: 0n,
      maxPnlCap: 0n, // ADL disabled — no trigger
      accounts: [
        { idx: 0, positionSize: 1_000_000_000n, pnl: 200_000n, capital: 1_000_000n },
        { idx: 1, positionSize: 2_000_000_000n, pnl: 50_000n,  capital: 1_000_000n },
        { idx: 2, positionSize: 500_000_000n,   pnl: 300_000n, capital: 1_000_000n },
      ],
    });
    const conn = makeConnection({ slabData });

    const result = await fetchAdlRankedPositions(conn, SLAB_KEY);
    expect(result.ranked).toHaveLength(3);
    // Highest pnlPct first: idx 2 (30%), idx 0 (20%), idx 1 (5%)
    expect(result.ranked[0].idx).toBe(2);
    expect(result.ranked[1].idx).toBe(0);
    expect(result.ranked[2].idx).toBe(1);
    // ADL ranks
    expect(result.ranked[0].adlRank).toBe(0);
    expect(result.ranked[2].adlRank).toBe(2);
  });

  it("correctly separates longs and shorts", async () => {
    const slabData = buildV1SmallSlab({
      accounts: [
        { idx: 0, positionSize:  1_000_000n, pnl: 100_000n, capital: 500_000n }, // long
        { idx: 1, positionSize: -2_000_000n, pnl: 150_000n, capital: 500_000n }, // short
        { idx: 2, positionSize:  3_000_000n, pnl:  50_000n, capital: 500_000n }, // long
      ],
    });
    const conn = makeConnection({ slabData });

    const { longs, shorts } = await fetchAdlRankedPositions(conn, SLAB_KEY);
    expect(longs.length).toBe(2);
    expect(shorts.length).toBe(1);
    expect(shorts[0].idx).toBe(1);
    expect(longs.every(p => p.positionSize > 0n)).toBe(true);
  });

  it("isTriggered=true when pnlPosTot > maxPnlCap", async () => {
    const slabData = buildV1SmallSlab({
      pnlPosTot: 5_000_000n,
      maxPnlCap: 2_000_000n,
      accounts: [
        { idx: 0, positionSize: 1_000_000n, pnl: 100_000n, capital: 500_000n },
      ],
    });
    const conn = makeConnection({ slabData });

    const result = await fetchAdlRankedPositions(conn, SLAB_KEY);
    expect(result.isTriggered).toBe(true);
    expect(result.pnlPosTot).toBe(5_000_000n);
    expect(result.maxPnlCap).toBe(2_000_000n);
  });

  it("isTriggered=false when maxPnlCap=0 (ADL disabled)", async () => {
    const slabData = buildV1SmallSlab({
      pnlPosTot: 999_000_000n,
      maxPnlCap: 0n, // 0 = disabled
      accounts: [
        { idx: 0, positionSize: 1_000_000n, pnl: 100_000n, capital: 500_000n },
      ],
    });
    const conn = makeConnection({ slabData });

    const result = await fetchAdlRankedPositions(conn, SLAB_KEY);
    expect(result.isTriggered).toBe(false);
  });

  it("isTriggered=false when pnlPosTot <= maxPnlCap", async () => {
    const slabData = buildV1SmallSlab({
      pnlPosTot: 1_000_000n,
      maxPnlCap: 1_000_000n, // exactly equal — not triggered
    });
    const conn = makeConnection({ slabData });

    const result = await fetchAdlRankedPositions(conn, SLAB_KEY);
    expect(result.isTriggered).toBe(false);
  });

  it("throws when slab account is not found", async () => {
    const conn = makeConnection({ slabData: undefined });
    await expect(fetchAdlRankedPositions(conn, SLAB_KEY)).rejects.toThrow(
      /not found/i
    );
  });
});

// ============================================================================
// 3. buildAdlTransaction() — full end-to-end mock
// ============================================================================

describe("buildAdlTransaction — mocked RPC (PERC-8339)", () => {
  it("returns null when ADL is not triggered (maxPnlCap=0)", async () => {
    const slabData = buildV1SmallSlab({
      pnlPosTot: 9_999_999n,
      maxPnlCap: 0n,
      accounts: [{ idx: 0, positionSize: 1_000_000n, pnl: 100_000n, capital: 500_000n }],
    });
    const conn = makeConnection({ slabData });

    const ix = await buildAdlTransaction(conn, CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID);
    expect(ix).toBeNull();
  });

  it("returns null when ADL is triggered but no open positions exist", async () => {
    const slabData = buildV1SmallSlab({
      pnlPosTot: 5_000_000n,
      maxPnlCap: 1_000_000n,
      accounts: [], // no positions
    });
    const conn = makeConnection({ slabData });

    const ix = await buildAdlTransaction(conn, CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID);
    expect(ix).toBeNull();
  });

  it("returns a valid instruction when ADL is triggered and positions exist", async () => {
    const slabData = buildV1SmallSlab({
      pnlPosTot: 5_000_000n,
      maxPnlCap: 1_000_000n,
      accounts: [
        { idx: 3, positionSize: 2_000_000n, pnl: 400_000n, capital: 1_000_000n },
        { idx: 7, positionSize: 1_000_000n, pnl: 100_000n, capital: 1_000_000n },
      ],
    });
    const conn = makeConnection({ slabData });

    const ix = await buildAdlTransaction(conn, CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID);
    expect(ix).not.toBeNull();
    expect(ix!.programId.equals(PROGRAM_ID)).toBe(true);
    // Instruction data: tag(1) + targetIdx u16 LE = 3 bytes
    expect(ix!.data.length).toBe(3);
    expect(ix!.data[0]).toBe(50); // execute_adl tag
    // targetIdx 3 in LE u16
    expect(ix!.data[1]).toBe(3);
    expect(ix!.data[2]).toBe(0);
  });

  it("picks highest pnlPct long as target (idx 3 > idx 7)", async () => {
    const slabData = buildV1SmallSlab({
      pnlPosTot: 5_000_000n,
      maxPnlCap: 1_000_000n,
      accounts: [
        { idx: 3,  positionSize: 2_000_000n, pnl: 400_000n, capital: 1_000_000n }, // 40%
        { idx: 7,  positionSize: 1_000_000n, pnl: 100_000n, capital: 1_000_000n }, // 10%
        { idx: 12, positionSize: 3_000_000n, pnl: 200_000n, capital: 1_000_000n }, // 20%
      ],
    });
    const conn = makeConnection({ slabData });

    const ix = await buildAdlTransaction(conn, CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID);
    expect(ix).not.toBeNull();
    const targetIdx = ix!.data[1] | (ix!.data[2] << 8);
    expect(targetIdx).toBe(3); // highest pnlPct
  });

  it("preferSide=long targets highest pnlPct long", async () => {
    const slabData = buildV1SmallSlab({
      pnlPosTot: 5_000_000n,
      maxPnlCap: 1_000_000n,
      accounts: [
        { idx: 0, positionSize: -1_000_000n, pnl: 999_000n, capital: 1_000_000n }, // short, 99.9%
        { idx: 1, positionSize:  1_000_000n, pnl: 200_000n, capital: 1_000_000n }, // long, 20%
        { idx: 2, positionSize:  2_000_000n, pnl: 100_000n, capital: 1_000_000n }, // long, 10%
      ],
    });
    const conn = makeConnection({ slabData });

    const ix = await buildAdlTransaction(
      conn, CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, "long"
    );
    expect(ix).not.toBeNull();
    const targetIdx = ix!.data[1] | (ix!.data[2] << 8);
    expect(targetIdx).toBe(1); // highest pnlPct long (not the short)
  });

  it("instruction has correct account structure (4 keys: caller, slab, clock, oracle)", async () => {
    const slabData = buildV1SmallSlab({
      pnlPosTot: 5_000_000n,
      maxPnlCap: 1_000_000n,
      accounts: [{ idx: 5, positionSize: 1_000_000n, pnl: 100_000n, capital: 500_000n }],
    });
    const conn = makeConnection({ slabData });

    const ix = await buildAdlTransaction(conn, CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID);
    expect(ix).not.toBeNull();
    const keys = ix!.keys;
    expect(keys).toHaveLength(4);
    expect(keys[0].pubkey.equals(CALLER)).toBe(true);
    expect(keys[0].isSigner).toBe(true);
    expect(keys[0].isWritable).toBe(false);
    expect(keys[1].pubkey.equals(SLAB_KEY)).toBe(true);
    expect(keys[1].isWritable).toBe(true);
    expect(keys[2].pubkey.equals(SYSVAR_CLOCK_PUBKEY)).toBe(true);
    expect(keys[3].pubkey.equals(ORACLE_KEY)).toBe(true);
  });

  it("encodes targetIdx > 255 correctly (u16 LE)", async () => {
    // Use a large idx to verify u16 little-endian encoding
    const slabData = buildV1SmallSlab({
      pnlPosTot: 5_000_000n,
      maxPnlCap: 1_000_000n,
      accounts: Array.from({ length: 3 }, (_, i) => ({
        idx: 200 + i,
        positionSize: BigInt(1_000_000 * (3 - i)),
        pnl: BigInt(100_000 * (3 - i)),
        capital: 1_000_000n,
      })),
    });
    const conn = makeConnection({ slabData });

    const ix = await buildAdlTransaction(conn, CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID);
    expect(ix).not.toBeNull();
    const targetIdx = ix!.data[1] | (ix!.data[2] << 8);
    expect(targetIdx).toBe(200); // highest pnlPct of the three
    // Verify u16 LE: 200 = 0xC8 → [0xC8, 0x00]
    expect(ix!.data[1]).toBe(0xC8);
    expect(ix!.data[2]).toBe(0x00);
  });
});

// ============================================================================
// 4. fetchAdlRankings() — mocked HTTP fetch
// ============================================================================

describe("fetchAdlRankings — mocked HTTP fetch (PERC-8339)", () => {
  const MOCK_BASE = "https://api.percolator.io";

  function makeMockFetch(
    statusCode: number,
    body: unknown
  ): typeof fetch {
    return async (_url: string | URL | Request, _init?: RequestInit) => {
      return {
        ok: statusCode >= 200 && statusCode < 300,
        status: statusCode,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response;
    };
  }

  const MOCK_RESULT = {
    slabAddress: SLAB_KEY.toBase58(),
    pnlPosTot: "5000000",
    maxPnlCap: "2000000",
    insuranceFundBalance: "0",
    insuranceFundFeeRevenue: "1000000",
    insuranceUtilizationBps: 10000,
    capExceeded: true,
    insuranceDepleted: true,
    utilizationTriggered: false,
    adlNeeded: true,
    excess: "3000000",
    rankings: [
      {
        rank: 1,
        idx: 3,
        pnlAbs: "400000",
        capital: "1000000",
        pnlPctMillionths: "400000",
      },
      {
        rank: 2,
        idx: 7,
        pnlAbs: "100000",
        capital: "1000000",
        pnlPctMillionths: "100000",
      },
    ],
  };

  it("returns parsed result for successful response", async () => {
    const result = await fetchAdlRankings(
      MOCK_BASE,
      SLAB_KEY,
      makeMockFetch(200, MOCK_RESULT)
    );

    expect(result.slabAddress).toBe(SLAB_KEY.toBase58());
    expect(result.adlNeeded).toBe(true);
    expect(result.capExceeded).toBe(true);
    expect(result.insuranceDepleted).toBe(true);
    expect(result.pnlPosTot).toBe("5000000");
    expect(result.maxPnlCap).toBe("2000000");
    expect(result.excess).toBe("3000000");
  });

  it("returns ranked positions in correct order (rank 1 first)", async () => {
    const result = await fetchAdlRankings(
      MOCK_BASE,
      SLAB_KEY,
      makeMockFetch(200, MOCK_RESULT)
    );

    expect(result.rankings).toHaveLength(2);
    expect(result.rankings[0].rank).toBe(1);
    expect(result.rankings[0].idx).toBe(3);
    expect(result.rankings[1].rank).toBe(2);
    expect(result.rankings[1].idx).toBe(7);
  });

  it("correct field names: .idx (not .account_index), .pnlAbs (not .unrealized_pnl), .rank (not .adl_rank)", async () => {
    const result = await fetchAdlRankings(
      MOCK_BASE,
      SLAB_KEY,
      makeMockFetch(200, MOCK_RESULT)
    );

    const r = result.rankings[0];
    // These must be the correct names per the ADL API spec (GH QA block on PR#51)
    expect(r).toHaveProperty("idx");
    expect(r).toHaveProperty("pnlAbs");
    expect(r).toHaveProperty("rank");
    // Wrong names must NOT exist
    expect(r).not.toHaveProperty("account_index");
    expect(r).not.toHaveProperty("unrealized_pnl");
    expect(r).not.toHaveProperty("adl_rank");
  });

  it("result has adlNeeded, capExceeded, insuranceDepleted fields", async () => {
    const result = await fetchAdlRankings(
      MOCK_BASE,
      SLAB_KEY,
      makeMockFetch(200, MOCK_RESULT)
    );

    expect(result).toHaveProperty("adlNeeded");
    expect(result).toHaveProperty("capExceeded");
    expect(result).toHaveProperty("insuranceDepleted");
  });

  it("throws on HTTP 404 with message including status code", async () => {
    await expect(
      fetchAdlRankings(MOCK_BASE, SLAB_KEY, makeMockFetch(404, { error: "not found" }))
    ).rejects.toThrow("404");
  });

  it("throws on HTTP 500 with message including status code", async () => {
    await expect(
      fetchAdlRankings(MOCK_BASE, SLAB_KEY, makeMockFetch(500, { error: "internal" }))
    ).rejects.toThrow("500");
  });

  it("accepts string slab address instead of PublicKey", async () => {
    const result = await fetchAdlRankings(
      MOCK_BASE,
      SLAB_KEY.toBase58(),
      makeMockFetch(200, MOCK_RESULT)
    );

    expect(result.slabAddress).toBe(SLAB_KEY.toBase58());
  });

  it("trailing slash in apiBase is normalized (no double-slash in URL)", async () => {
    let capturedUrl = "";
    const mockFetch: typeof fetch = async (url, _init) => {
      capturedUrl = url.toString();
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_RESULT,
        text: async () => "",
      } as Response;
    };

    await fetchAdlRankings("https://api.percolator.io/", SLAB_KEY, mockFetch);
    expect(capturedUrl).not.toContain("//api/");
    expect(capturedUrl).toContain("/api/adl/rankings");
  });

  it("empty rankings array when adlNeeded=false", async () => {
    const noAdlResult = { ...MOCK_RESULT, adlNeeded: false, rankings: [] };
    const result = await fetchAdlRankings(
      MOCK_BASE,
      SLAB_KEY,
      makeMockFetch(200, noAdlResult)
    );

    expect(result.adlNeeded).toBe(false);
    expect(result.rankings).toHaveLength(0);
  });
});

// ============================================================================
// 5. Error codes 61-65 — realistic on-chain error log paths
// ============================================================================

describe("Error codes 61-65 (ADL) — parseErrorFromLogs + decodeError (PERC-8339)", () => {
  // Helper: build a realistic Solana failed transaction log for a given error code
  function makeErrorLogs(hexCode: string): string[] {
    return [
      `Program ${PROGRAM_ID.toBase58()} invoke [1]`,
      "Program log: Instruction: ExecuteAdl",
      `Program ${PROGRAM_ID.toBase58()} failed: custom program error: 0x${hexCode}`,
    ];
  }

  // ---- Code 61: EngineSideBlocked ----
  it("61 (0x3D) — EngineSideBlocked: parseErrorFromLogs returns correct info", () => {
    const logs = makeErrorLogs("3D");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(61);
    expect(result!.name).toBe("EngineSideBlocked");
    expect(result!.hint).toMatch(/drain|blocked|mode/i);
  });

  it("61 — decodeError returns EngineSideBlocked", () => {
    const info = decodeError(61);
    expect(info).not.toBeNull();
    expect(info!.name).toBe("EngineSideBlocked");
    expect(PERCOLATOR_ERRORS[61]).toBeDefined();
  });

  // ---- Code 62: EngineCorruptState ----
  it("62 (0x3E) — EngineCorruptState: parseErrorFromLogs returns correct info", () => {
    const logs = makeErrorLogs("3E");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(62);
    expect(result!.name).toBe("EngineCorruptState");
    expect(result!.hint).toMatch(/corrupt|invariant|critical/i);
  });

  it("62 — decodeError returns EngineCorruptState", () => {
    const info = decodeError(62);
    expect(info).not.toBeNull();
    expect(info!.name).toBe("EngineCorruptState");
  });

  // ---- Code 63: InsuranceFundNotDepleted ----
  it("63 (0x3F) — InsuranceFundNotDepleted: parseErrorFromLogs correct", () => {
    const logs = makeErrorLogs("3F");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(63);
    expect(result!.name).toBe("InsuranceFundNotDepleted");
    expect(result!.hint).toMatch(/insurance|depleted/i);
  });

  it("63 — decodeError returns InsuranceFundNotDepleted", () => {
    const info = decodeError(63);
    expect(info).not.toBeNull();
    expect(info!.name).toBe("InsuranceFundNotDepleted");
  });

  it("63 — realistic log: ADL rejected because insurance fund has non-zero balance", () => {
    const logs = [
      `Program ${PROGRAM_ID.toBase58()} invoke [1]`,
      "Program log: Instruction: ExecuteAdl",
      "Program log: ADL check: insurance_balance=500000 > 0",
      `Program ${PROGRAM_ID.toBase58()} failed: custom program error: 0x3f`,
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(63);
    expect(result!.name).toBe("InsuranceFundNotDepleted");
  });

  // ---- Code 64: NoAdlCandidates ----
  it("64 (0x40) — NoAdlCandidates: parseErrorFromLogs correct", () => {
    const logs = makeErrorLogs("40");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(64);
    expect(result!.name).toBe("NoAdlCandidates");
    expect(result!.hint).toMatch(/candidate|eligible/i);
  });

  it("64 — decodeError returns NoAdlCandidates", () => {
    const info = decodeError(64);
    expect(info).not.toBeNull();
    expect(info!.name).toBe("NoAdlCandidates");
  });

  it("64 — realistic log: all positions have size 0 (already closed)", () => {
    const logs = [
      `Program ${PROGRAM_ID.toBase58()} invoke [1]`,
      "Program log: Instruction: ExecuteAdl",
      "Program log: adl_candidates_count=0",
      `Program ${PROGRAM_ID.toBase58()} failed: custom program error: 0x40`,
    ];
    const result = parseErrorFromLogs(logs);
    expect(result!.code).toBe(64);
    expect(result!.name).toBe("NoAdlCandidates");
  });

  // ---- Code 65: BankruptPositionAlreadyClosed ----
  it("65 (0x41) — BankruptPositionAlreadyClosed: parseErrorFromLogs correct", () => {
    const logs = makeErrorLogs("41");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(65);
    expect(result!.name).toBe("BankruptPositionAlreadyClosed");
    expect(result!.hint).toMatch(/closed|size.*0|re-rank/i);
  });

  it("65 — decodeError returns BankruptPositionAlreadyClosed", () => {
    const info = decodeError(65);
    expect(info).not.toBeNull();
    expect(info!.name).toBe("BankruptPositionAlreadyClosed");
  });

  it("65 — realistic log: keeper retried stale target_idx after another ADL closed it", () => {
    const logs = [
      `Program ${PROGRAM_ID.toBase58()} invoke [1]`,
      "Program log: Instruction: ExecuteAdl",
      "Program log: target_idx=3 position_size=0",
      `Program ${PROGRAM_ID.toBase58()} failed: custom program error: 0x41`,
    ];
    const result = parseErrorFromLogs(logs);
    expect(result!.code).toBe(65);
    expect(result!.name).toBe("BankruptPositionAlreadyClosed");
  });

  // ---- Regression: adjacent codes still correct ----
  it("60 (0x3C) — EngineInvalidEntryPrice: not confused with ADL errors", () => {
    const logs = makeErrorLogs("3C");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(60);
    expect(result!.name).toBe("EngineInvalidEntryPrice");
  });

  it("all ADL error codes 61-65 are in the PERCOLATOR_ERRORS table", () => {
    for (let code = 61; code <= 65; code++) {
      expect(PERCOLATOR_ERRORS[code], `code ${code} should be in table`).toBeDefined();
      expect(PERCOLATOR_ERRORS[code].name).toBeTruthy();
      expect(PERCOLATOR_ERRORS[code].hint).toBeTruthy();
    }
  });

  it("uppercase hex (0x3D vs 0x3d) handled identically", () => {
    const lower = parseErrorFromLogs(makeErrorLogs("3d"));
    const upper = parseErrorFromLogs(makeErrorLogs("3D"));
    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
    expect(lower!.code).toBe(upper!.code);
    expect(lower!.name).toBe(upper!.name);
  });

  it("returns null when logs have no error line (successful ADL tx)", () => {
    const logs = [
      `Program ${PROGRAM_ID.toBase58()} invoke [1]`,
      "Program log: Instruction: ExecuteAdl",
      `Program log: ${0xAD1E_0001} 3 150000000 500000000 0`,
      `Program ${PROGRAM_ID.toBase58()} consumed 40000 of 200000 compute units`,
      `Program ${PROGRAM_ID.toBase58()} success`,
    ];
    expect(parseErrorFromLogs(logs)).toBeNull();
  });
});

// ============================================================================
// 6. isAdlTriggered() + rankAdlPositions() — pure (no-RPC) path
// ============================================================================

describe("isAdlTriggered + rankAdlPositions — pure path (PERC-8339)", () => {
  it("isAdlTriggered returns false for zeroed slab (no trigger)", () => {
    const slabData = buildV1SmallSlab({ pnlPosTot: 0n, maxPnlCap: 0n });
    expect(isAdlTriggered(slabData)).toBe(false);
  });

  it("isAdlTriggered returns false when maxPnlCap=0 regardless of pnlPosTot", () => {
    const slabData = buildV1SmallSlab({ pnlPosTot: 1_000_000_000n, maxPnlCap: 0n });
    expect(isAdlTriggered(slabData)).toBe(false);
  });

  it("isAdlTriggered returns true when pnlPosTot > maxPnlCap", () => {
    const slabData = buildV1SmallSlab({ pnlPosTot: 5_000_000n, maxPnlCap: 2_000_000n });
    expect(isAdlTriggered(slabData)).toBe(true);
  });

  it("isAdlTriggered returns false when pnlPosTot === maxPnlCap", () => {
    const slabData = buildV1SmallSlab({ pnlPosTot: 2_000_000n, maxPnlCap: 2_000_000n });
    expect(isAdlTriggered(slabData)).toBe(false);
  });

  it("rankAdlPositions assigns adlRank=0 to highest pnlPct", () => {
    const slabData = buildV1SmallSlab({
      pnlPosTot: 5_000_000n,
      maxPnlCap: 1_000_000n,
      accounts: [
        { idx: 0, positionSize: 1_000_000n, pnl: 100_000n, capital: 1_000_000n }, // 10%
        { idx: 1, positionSize: 1_000_000n, pnl: 400_000n, capital: 1_000_000n }, // 40%
        { idx: 2, positionSize: 1_000_000n, pnl: 250_000n, capital: 1_000_000n }, // 25%
      ],
    });

    const { ranked } = rankAdlPositions(slabData);
    expect(ranked[0].adlRank).toBe(0);
    expect(ranked[0].idx).toBe(1); // 40% — top
    expect(ranked[1].idx).toBe(2); // 25%
    expect(ranked[2].idx).toBe(0); // 10%
  });

  it("rankAdlPositions pnlPct formula: pnl * 10_000 / capital", () => {
    const slabData = buildV1SmallSlab({
      accounts: [
        { idx: 0, positionSize: 1_000_000n, pnl: 500_000n, capital: 2_000_000n }, // 2500 bps = 25%
      ],
    });
    const { ranked } = rankAdlPositions(slabData);
    expect(ranked[0].pnlPct).toBe(2500n);
  });

  it("rankAdlPositions skips accounts with positionSize=0 (inactive)", () => {
    const slabData = buildV1SmallSlab({
      accounts: [
        { idx: 0, positionSize: 0n, pnl: 999_000n, capital: 1_000_000n }, // inactive
        { idx: 1, positionSize: 1_000_000n, pnl: 100_000n, capital: 1_000_000n }, // active
      ],
    });
    const { ranked } = rankAdlPositions(slabData);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].idx).toBe(1);
  });

  it("parseAdlEvent extracts targetIdx from realistic ADL execution log", () => {
    const targetIdx = 3;
    const price = 150_000_000n;
    const closedAbs = 500_000_000n;
    const lo = closedAbs & 0xFFFF_FFFF_FFFF_FFFFn;
    const hi = closedAbs >> 64n;

    const logs = [
      `Program ${PROGRAM_ID.toBase58()} invoke [1]`,
      "Program log: Instruction: ExecuteAdl",
      `Program log: 2904424449 ${targetIdx} ${price} ${lo} ${hi}`,
      `Program ${PROGRAM_ID.toBase58()} success`,
    ];

    const event = parseAdlEvent(logs);
    expect(event).not.toBeNull();
    expect(event!.targetIdx).toBe(targetIdx);
    expect(event!.price).toBe(price);
    expect(event!.closedAbs).toBe(closedAbs);
  });
});
