/**
 * PERC-8410: Devnet integration smoke test using getMarketsByAddress().
 *
 * Validates SDK mainnet-readiness paths that do NOT require getProgramAccounts
 * (which is blocked on public mainnet RPCs — GH#59). Instead, uses
 * getMarketsByAddress() (PERC-8407) which relies on getMultipleAccounts.
 *
 * Coverage:
 *   1. Discover devnet slab addresses via discoverMarkets() (setup only)
 *   2. Call getMarketsByAddress() with those addresses against devnet RPC
 *   3. Verify data decodes correctly (header, config, engine fields)
 *   4. Call fetchAdlRankedPositions() and verify no errors
 *   5. Verify error codes 61-65 are correctly exported and parseable
 *
 * Run manually:
 *   npx vitest run --config vitest.devnet.config.ts test/devnet-getmarkets.test.ts
 *
 * Skipped when SKIP_DEVNET_TESTS=1.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  discoverMarkets,
  getMarketsByAddress,
  fetchAdlRankedPositions,
  isAdlTriggered,
  rankAdlPositions,
  fetchSlab,
  parseHeader,
  parseConfig,
  parseEngine,
  detectSlabLayout,
  decodeError,
  parseErrorFromLogs,
  PERCOLATOR_ERRORS,
  getProgramId,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVNET_RPC = "https://api.devnet.solana.com";
const DEVNET_PROGRAM_ID = getProgramId("devnet");
const RPC_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

const SKIP = process.env.SKIP_DEVNET_TESTS === "1";

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let connection: Connection;
let discoveredAddresses: PublicKey[] = [];
let discoveredMarkets: Awaited<ReturnType<typeof discoverMarkets>> = [];
let rpcReachable = false;

// ---------------------------------------------------------------------------
// Helper: check RPC connectivity
// ---------------------------------------------------------------------------

async function checkRpcReachable(conn: Connection): Promise<boolean> {
  try {
    const slot = await Promise.race([
      conn.getSlot("confirmed"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("RPC timeout")), 8_000),
      ),
    ]);
    return typeof slot === "number" && slot > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Setup: discover market addresses once
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (SKIP) return;

  connection = new Connection(DEVNET_RPC, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: RPC_TIMEOUT_MS,
  });

  rpcReachable = await checkRpcReachable(connection);
  if (!rpcReachable) {
    console.warn(
      "[PERC-8410] devnet RPC unreachable — RPC-dependent tests will early-return",
    );
    return;
  }

  // Discover addresses via discoverMarkets (used as setup — the real test is getMarketsByAddress)
  try {
    const markets = await discoverMarkets(connection, DEVNET_PROGRAM_ID, {
      sequential: true,
      interTierDelayMs: 500,
      rateLimitBackoffMs: [2_000, 5_000],
    });
    discoveredMarkets = markets;
    discoveredAddresses = markets.map((m) => m.slabAddress);
    console.log(
      `[PERC-8410] beforeAll: discovered ${discoveredAddresses.length} devnet slab(s)`,
    );
  } catch (err) {
    console.warn("[PERC-8410] discoverMarkets failed in beforeAll:", err);
  }
}, 60_000);

// ---------------------------------------------------------------------------
// Suite 1: getMarketsByAddress() against devnet
// ---------------------------------------------------------------------------

describe("devnet — getMarketsByAddress() [PERC-8410]", () => {
  it("setup: devnet has at least 1 discoverable market", () => {
    if (SKIP || !rpcReachable) return;
    expect(
      discoveredAddresses.length,
      "Expected at least 1 devnet market for getMarketsByAddress test",
    ).toBeGreaterThan(0);
  });

  it(
    "getMarketsByAddress() returns same number of markets as discovered addresses",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      const markets = await getMarketsByAddress(
        connection,
        DEVNET_PROGRAM_ID,
        discoveredAddresses,
        { interBatchDelayMs: 200 },
      );

      // Every discovered address should parse successfully
      expect(markets.length).toBe(discoveredAddresses.length);
    },
    60_000,
  );

  it(
    "getMarketsByAddress() result has valid header fields",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      const markets = await getMarketsByAddress(
        connection,
        DEVNET_PROGRAM_ID,
        discoveredAddresses.slice(0, 3),
      );

      for (const market of markets) {
        expect(market.slabAddress).toBeInstanceOf(PublicKey);
        expect(market.programId).toBeInstanceOf(PublicKey);
        expect(market.programId.toBase58()).toBe(DEVNET_PROGRAM_ID.toBase58());
        expect([0, 1, 2]).toContain(market.header.version);
        expect(market.header.admin).toBeInstanceOf(PublicKey);
      }
    },
    30_000,
  );

  it(
    "getMarketsByAddress() result has valid config fields",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      const markets = await getMarketsByAddress(
        connection,
        DEVNET_PROGRAM_ID,
        discoveredAddresses.slice(0, 3),
      );

      for (const market of markets) {
        expect(market.config.collateralMint).toBeInstanceOf(PublicKey);
        expect(typeof market.config.unitScale).toBe("number");
        expect(market.config.unitScale).toBeGreaterThanOrEqual(0);
        expect(typeof market.config.maxPnlCap).toBe("bigint");
        expect(market.config.maxPnlCap).toBeGreaterThanOrEqual(0n);
      }
    },
    30_000,
  );

  it(
    "getMarketsByAddress() result has valid engine fields",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      const markets = await getMarketsByAddress(
        connection,
        DEVNET_PROGRAM_ID,
        discoveredAddresses.slice(0, 3),
      );

      for (const market of markets) {
        const e = market.engine;
        expect(typeof e.vault).toBe("bigint");
        expect(typeof e.totalOpenInterest).toBe("bigint");
        expect(typeof e.pnlPosTot).toBe("bigint");
        expect(typeof e.cTot).toBe("bigint");
        expect(typeof e.currentSlot).toBe("bigint");
        expect(typeof e.numUsedAccounts).toBe("number");
        expect(e.numUsedAccounts).toBeGreaterThanOrEqual(0);
        expect(typeof e.fundingIndexQpbE6).toBe("bigint");
      }
    },
    30_000,
  );

  it(
    "getMarketsByAddress() matches discoverMarkets() output field-by-field for first market",
    async () => {
      if (SKIP || !rpcReachable || discoveredMarkets.length === 0) return;

      // Reuse cached discoverMarkets result from beforeAll (avoids second RPC scan + 429s)
      const firstAddr = discoveredMarkets[0].slabAddress;
      const gmaMarkets = await getMarketsByAddress(
        connection,
        DEVNET_PROGRAM_ID,
        [firstAddr],
      );

      expect(gmaMarkets.length).toBe(1);
      const dm = discoveredMarkets[0];
      const gma = gmaMarkets[0];

      // Slab address match
      expect(gma.slabAddress.toBase58()).toBe(dm.slabAddress.toBase58());
      // Header match
      expect(gma.header.version).toBe(dm.header.version);
      expect(gma.header.admin.toBase58()).toBe(dm.header.admin.toBase58());
      // Config match
      expect(gma.config.collateralMint.toBase58()).toBe(
        dm.config.collateralMint.toBase58(),
      );
      expect(gma.config.unitScale).toBe(dm.config.unitScale);
    },
    30_000,
  );

  it(
    "getMarketsByAddress() gracefully skips non-existent addresses",
    async () => {
      if (SKIP || !rpcReachable) return;

      const fakeKey = Keypair.generate().publicKey;
      const mixed = [
        ...(discoveredAddresses.length > 0 ? [discoveredAddresses[0]] : []),
        fakeKey,
      ];

      const markets = await getMarketsByAddress(
        connection,
        DEVNET_PROGRAM_ID,
        mixed,
      );

      // Only the valid address should be returned
      expect(markets.length).toBe(discoveredAddresses.length > 0 ? 1 : 0);
    },
    30_000,
  );

  it(
    "getMarketsByAddress() returns empty array for all-invalid addresses",
    async () => {
      if (SKIP || !rpcReachable) return;

      const fakes = Array.from({ length: 3 }, () => Keypair.generate().publicKey);
      const markets = await getMarketsByAddress(
        connection,
        DEVNET_PROGRAM_ID,
        fakes,
      );
      expect(markets).toEqual([]);
    },
    15_000,
  );

  it(
    "getMarketsByAddress() returns empty array for empty input",
    async () => {
      if (SKIP || !rpcReachable) return;

      const markets = await getMarketsByAddress(
        connection,
        DEVNET_PROGRAM_ID,
        [],
      );
      expect(markets).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// Suite 2: fetchAdlRankedPositions() against devnet
// ---------------------------------------------------------------------------

describe("devnet — fetchAdlRankedPositions() [PERC-8410]", () => {
  it(
    "fetchAdlRankedPositions() returns valid ranking result without throwing",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      const slabKey = discoveredAddresses[0];

      // Should not throw, even on an empty or low-activity market
      const result = await fetchAdlRankedPositions(connection, slabKey);

      expect(result).toBeDefined();
      expect(Array.isArray(result.ranked)).toBe(true);
      expect(Array.isArray(result.longs)).toBe(true);
      expect(Array.isArray(result.shorts)).toBe(true);
      expect(typeof result.isTriggered).toBe("boolean");
      expect(typeof result.pnlPosTot).toBe("bigint");
      expect(typeof result.maxPnlCap).toBe("bigint");
      expect(result.pnlPosTot).toBeGreaterThanOrEqual(0n);
      expect(result.maxPnlCap).toBeGreaterThanOrEqual(0n);
    },
    30_000,
  );

  it(
    "fetchAdlRankedPositions() longs are sorted descending by pnlPct",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      const slabKey = discoveredAddresses[0];
      const result = await fetchAdlRankedPositions(connection, slabKey);

      if (result.longs.length >= 2) {
        for (let i = 1; i < result.longs.length; i++) {
          expect(result.longs[i - 1].pnlPct).toBeGreaterThanOrEqual(
            result.longs[i].pnlPct,
          );
        }
      }
    },
    30_000,
  );

  it(
    "fetchAdlRankedPositions() shorts are sorted descending by pnlPct",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      const slabKey = discoveredAddresses[0];
      const result = await fetchAdlRankedPositions(connection, slabKey);

      if (result.shorts.length >= 2) {
        for (let i = 1; i < result.shorts.length; i++) {
          expect(result.shorts[i - 1].pnlPct).toBeGreaterThanOrEqual(
            result.shorts[i].pnlPct,
          );
        }
      }
    },
    30_000,
  );

  it(
    "fetchAdlRankedPositions() ranked positions have valid fields",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      const slabKey = discoveredAddresses[0];
      const result = await fetchAdlRankedPositions(connection, slabKey);

      for (const pos of result.ranked) {
        expect(typeof pos.idx).toBe("number");
        expect(pos.idx).toBeGreaterThanOrEqual(0);
        expect(pos.owner).toBeInstanceOf(PublicKey);
        expect(typeof pos.positionSigned).toBe("bigint");
        expect(pos.positionSigned).not.toBe(0n); // only non-zero positions are ranked
        expect(typeof pos.pnl).toBe("bigint");
        expect(typeof pos.capital).toBe("bigint");
        expect(typeof pos.pnlPct).toBe("bigint");
        expect(["long", "short"]).toContain(pos.side);
        expect(typeof pos.adlRank).toBe("number");
        expect(pos.adlRank).toBeGreaterThanOrEqual(0);
      }
    },
    30_000,
  );

  it(
    "fetchAdlRankedPositions() long count + short count == ranked count",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      const slabKey = discoveredAddresses[0];
      const result = await fetchAdlRankedPositions(connection, slabKey);

      expect(result.longs.length + result.shorts.length).toBe(
        result.ranked.length,
      );
    },
    30_000,
  );

  it(
    "isAdlTriggered() runs without throwing on devnet slab data",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      const slabKey = discoveredAddresses[0];
      const data = await fetchSlab(connection, slabKey);

      // Should return boolean, not throw
      const triggered = isAdlTriggered(data);
      expect(typeof triggered).toBe("boolean");
    },
    30_000,
  );

  it(
    "rankAdlPositions() (pure/no-RPC) matches fetchAdlRankedPositions() result",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      const slabKey = discoveredAddresses[0];
      const data = await fetchSlab(connection, slabKey);

      const fromRpc = await fetchAdlRankedPositions(connection, slabKey);
      const fromPure = rankAdlPositions(data);

      // Both should have the same ranking
      expect(fromPure.ranked.length).toBe(fromRpc.ranked.length);
      expect(fromPure.longs.length).toBe(fromRpc.longs.length);
      expect(fromPure.shorts.length).toBe(fromRpc.shorts.length);
      expect(fromPure.isTriggered).toBe(fromRpc.isTriggered);
    },
    30_000,
  );

  it(
    "fetchAdlRankedPositions() works on all discovered devnet slabs (no throw)",
    async () => {
      if (SKIP || !rpcReachable || discoveredAddresses.length === 0) return;

      // Smoke test: call on every discovered slab — none should throw
      const sample = discoveredAddresses.slice(0, 5);
      for (const slabKey of sample) {
        const result = await fetchAdlRankedPositions(connection, slabKey);
        expect(result).toBeDefined();
        expect(typeof result.isTriggered).toBe("boolean");
      }
    },
    60_000,
  );
});

// ---------------------------------------------------------------------------
// Suite 3: Error codes 61-65 export and parse verification
// ---------------------------------------------------------------------------

describe("devnet — error codes 61-65 [PERC-8410]", () => {
  const ADL_ERROR_CODES: Record<number, string> = {
    61: "EngineSideBlocked",
    62: "EngineCorruptState",
    63: "InsuranceFundNotDepleted",
    64: "NoAdlCandidates",
    65: "BankruptPositionAlreadyClosed",
  };

  it("all ADL error codes 61-65 are defined in PERCOLATOR_ERRORS", () => {
    for (let code = 61; code <= 65; code++) {
      const entry = PERCOLATOR_ERRORS[code];
      expect(entry, `PERCOLATOR_ERRORS[${code}] must be defined`).toBeDefined();
      expect(entry.name).toBe(ADL_ERROR_CODES[code]);
      expect(entry.hint).toBeTruthy();
      expect(entry.hint.length).toBeGreaterThan(10); // meaningful hint, not just a word
    }
  });

  it("decodeError() returns correct info for all codes 61-65", () => {
    for (const [codeStr, expectedName] of Object.entries(ADL_ERROR_CODES)) {
      const code = Number(codeStr);
      const info = decodeError(code);
      expect(info, `decodeError(${code}) must return info`).toBeDefined();
      expect(info!.name).toBe(expectedName);
      expect(info!.hint).toBeTruthy();
    }
  });

  it("parseErrorFromLogs() correctly parses each ADL code from realistic devnet logs", () => {
    for (const [codeStr, expectedName] of Object.entries(ADL_ERROR_CODES)) {
      const code = Number(codeStr);
      const hex = code.toString(16);
      const logs = [
        `Program ${DEVNET_PROGRAM_ID.toBase58()} invoke [1]`,
        "Program log: Instruction: ExecuteAdl",
        `Program ${DEVNET_PROGRAM_ID.toBase58()} failed: custom program error: 0x${hex}`,
      ];

      const result = parseErrorFromLogs(logs);
      expect(result, `parseErrorFromLogs should parse code ${code}`).not.toBeNull();
      expect(result!.code).toBe(code);
      expect(result!.name).toBe(expectedName);
    }
  });

  it("parseErrorFromLogs() handles hex case insensitivity for ADL codes", () => {
    // Code 61 = 0x3D — test both upper and lower
    const upper = parseErrorFromLogs([
      `Program FxfD37s1 failed: custom program error: 0x3D`,
    ]);
    const lower = parseErrorFromLogs([
      `Program FxfD37s1 failed: custom program error: 0x3d`,
    ]);
    expect(upper).not.toBeNull();
    expect(lower).not.toBeNull();
    expect(upper!.code).toBe(61);
    expect(lower!.code).toBe(61);
    expect(upper!.name).toBe(lower!.name);
  });

  it("ADL error codes 61-65 are contiguous with no gaps", () => {
    for (let code = 61; code <= 65; code++) {
      expect(PERCOLATOR_ERRORS[code]).toBeDefined();
    }
    // Boundary check: code 60 should not be one of the ADL-specific error names
    if (PERCOLATOR_ERRORS[60]) {
      const adlNames = Object.values(ADL_ERROR_CODES);
      expect(adlNames).not.toContain(PERCOLATOR_ERRORS[60].name);
    }
  });

  it("decodeError() returns undefined for out-of-range codes", () => {
    expect(decodeError(9999)).toBeUndefined();
    expect(decodeError(-1)).toBeUndefined();
  });
});
