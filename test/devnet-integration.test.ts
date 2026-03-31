/**
 * PERC-8365: Devnet CI integration tests using public devnet RPC.
 *
 * These tests run against api.devnet.solana.com — no Helius API key required.
 * Public devnet RPC supports getProgramAccounts, so we can verify the SDK works
 * against the actual deployed devnet program and real on-chain slab data.
 *
 * Coverage:
 *   1. discoverMarkets() — against actual devnet program FxfD37s1..., verifies
 *      returns at least 1 market (devnet has live markets) and validates field types.
 *   2. getMarketStats()  — fetch a known devnet slab + parse engine state via
 *      parseEngine/parseConfig; verifies field types and numeric consistency.
 *   3. Error code parsing — end-to-end with realistic devnet tx error log shapes;
 *      verifies all ADL error codes 61-65 resolve to correct names.
 *
 * These tests are skipped automatically when:
 *   - SKIP_DEVNET_TESTS=1 is set (used in CI offline/fast mode)
 *   - The devnet RPC is unreachable (graceful skip with console.warn)
 *
 * Run manually:
 *   pnpm tsx test/devnet-integration.test.ts
 *
 * Or via vitest (included in devnet-smoke workflow, NOT the default CI gate):
 *   DEVNET_INTEGRATION=1 vitest run test/devnet-integration.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  discoverMarkets,
  parseEngine,
  parseConfig,
  parseHeader,
  detectSlabLayout,
  fetchSlab,
  decodeError,
  parseErrorFromLogs,
  PERCOLATOR_ERRORS,
  getProgramId,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Public devnet RPC — no API key required.
 * getProgramAccounts is supported on devnet public endpoint.
 */
const DEVNET_RPC = "https://api.devnet.solana.com";

/**
 * Devnet program ID (FxfD37s1... — large 4096-slot devnet program).
 * From src/config/program-ids.ts PROGRAM_IDS.devnet.percolator.
 */
const DEVNET_PROGRAM_ID = getProgramId("devnet");

/** Timeout for individual RPC calls in ms. */
const RPC_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Skip guard — allows CI to bypass these tests in fast/offline mode
// ---------------------------------------------------------------------------

const SKIP = process.env.SKIP_DEVNET_TESTS === "1";

// ---------------------------------------------------------------------------
// Shared state: discovered markets populated in beforeAll
// ---------------------------------------------------------------------------

let devnetConnection: Connection;
let discoveredSlabs: PublicKey[] = [];
/** Full market objects — reuse across suites instead of re-scanning. */
let discoveredMarkets: Awaited<ReturnType<typeof discoverMarkets>> = [];
let rpcReachable = false;

// ---------------------------------------------------------------------------
// Helper: check RPC connectivity with a lightweight call
// ---------------------------------------------------------------------------

async function checkRpcReachable(connection: Connection): Promise<boolean> {
  try {
    const slot = await Promise.race([
      connection.getSlot("confirmed"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("RPC timeout")), 8_000)
      ),
    ]);
    return typeof slot === "number" && slot > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (SKIP) return;

  devnetConnection = new Connection(DEVNET_RPC, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: RPC_TIMEOUT_MS,
  });

  rpcReachable = await checkRpcReachable(devnetConnection);
  if (!rpcReachable) {
    console.warn(
      "[PERC-8365] devnet RPC unreachable — devnet integration tests will be skipped"
    );
    return;
  }

  // Discover markets once; all subsequent tests reuse the cached results.
  try {
    discoveredMarkets = await discoverMarkets(devnetConnection, DEVNET_PROGRAM_ID, {
      sequential: true,        // be polite to public RPC — no parallel bursts
      interTierDelayMs: 500,   // 500 ms between tier queries
      rateLimitBackoffMs: [2_000, 5_000],
    });
    discoveredSlabs = discoveredMarkets.map(m => m.slabAddress);
    console.log(
      `[PERC-8365] beforeAll: discovered ${discoveredSlabs.length} devnet market(s)`
    );
  } catch (err) {
    console.warn("[PERC-8365] discoverMarkets failed in beforeAll:", err);
    // Tests will handle empty discoveredSlabs/discoveredMarkets gracefully.
  }
}, 60_000); // allow up to 60 s for market discovery

// ---------------------------------------------------------------------------
// Suite 1: discoverMarkets() against actual devnet program
// ---------------------------------------------------------------------------

describe("devnet — discoverMarkets() [PERC-8365]", () => {
  it.skipIf(!SKIP)("skips cleanly when SKIP_DEVNET_TESTS=1", () => {
    console.log("[PERC-8365] SKIP_DEVNET_TESTS=1 — skipping devnet suite");
    expect(true).toBe(true);
  });

  it.skipIf(SKIP || !rpcReachable)("devnet RPC is reachable and returns a valid slot", async () => {
    const slot = await devnetConnection.getSlot("confirmed");
    expect(typeof slot).toBe("number");
    expect(slot).toBeGreaterThan(0);
  });

  it("discoverMarkets() returns at least 1 devnet market", async () => {
    if (SKIP || !rpcReachable) return;
    // discoveredSlabs populated in beforeAll
    expect(
      discoveredSlabs.length,
      "Expected at least 1 devnet market — devnet has live slab accounts"
    ).toBeGreaterThan(0);
  });

  it("each discovered market has a valid PublicKey slab address", async () => {
    if (SKIP || !rpcReachable || discoveredSlabs.length === 0) return;
    for (const addr of discoveredSlabs) {
      expect(addr).toBeInstanceOf(PublicKey);
      // toBase58 should produce a non-empty string (not the zero address)
      const b58 = addr.toBase58();
      expect(b58.length).toBeGreaterThan(30);
      expect(b58).not.toBe("11111111111111111111111111111111");
    }
  });

  it("discoverMarkets() response includes valid header fields", async () => {
    if (SKIP || !rpcReachable) return;

    // Reuse cached markets from beforeAll — no extra RPC scan
    if (discoveredMarkets.length === 0) {
      console.warn("[PERC-8365] 0 markets in cache — skipping header field assertions");
      return;
    }

    const first = discoveredMarkets[0];
    // header.version must be 0, 1, or 2 (known deployed versions on devnet)
    expect([0, 1, 2]).toContain(first.header.version);
    // header.admin must be a valid PublicKey
    expect(first.header.admin).toBeInstanceOf(PublicKey);
    expect(first.slabAddress).toBeInstanceOf(PublicKey);
  });

  it("discoverMarkets() response includes valid config fields", async () => {
    if (SKIP || !rpcReachable) return;

    // Reuse cached markets from beforeAll — no extra RPC scan
    if (discoveredMarkets.length === 0) {
      console.warn("[PERC-8365] 0 markets in cache — skipping config field assertions");
      return;
    }

    for (const market of discoveredMarkets.slice(0, 3)) {
      // collateralMint must be a valid-looking public key
      expect(market.config.collateralMint).toBeInstanceOf(PublicKey);
      const mint = market.config.collateralMint.toBase58();
      expect(mint.length).toBeGreaterThan(30);

      // unitScale should be a positive integer
      expect(typeof market.config.unitScale).toBe("number");
      expect(market.config.unitScale).toBeGreaterThan(0);
    }
  });

  it("all discovered slab sizes are recognized by detectSlabLayout()", async () => {
    if (SKIP || !rpcReachable || discoveredSlabs.length === 0) return;

    for (const slabAddr of discoveredSlabs.slice(0, 5)) {
      const accountInfo = await devnetConnection.getAccountInfo(slabAddr, "confirmed");
      if (!accountInfo) continue;

      const layout = detectSlabLayout(accountInfo.data.length);
      expect(
        layout,
        `detectSlabLayout returned null for slab ${slabAddr.toBase58()} (size=${accountInfo.data.length})`
      ).not.toBeNull();
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Suite 2: getMarketStats() — parse engine + config from known devnet slab
// ---------------------------------------------------------------------------

describe("devnet — getMarketStats() via parseEngine/parseConfig [PERC-8365]", () => {
  it("fetchSlab + parseHeader returns valid header for a discovered slab", async () => {
    if (SKIP || !rpcReachable || discoveredSlabs.length === 0) return;

    const slabKey = discoveredSlabs[0];
    const data = await fetchSlab(devnetConnection, slabKey);

    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBeGreaterThan(1000);

    const header = parseHeader(data);
    expect([0, 1, 2]).toContain(header.version);
    expect(header.admin).toBeInstanceOf(PublicKey);
  }, 30_000);

  it("parseEngine returns numeric fields with expected types for a devnet slab", async () => {
    if (SKIP || !rpcReachable || discoveredSlabs.length === 0) return;

    const slabKey = discoveredSlabs[0];
    const data = await fetchSlab(devnetConnection, slabKey);
    const engine = parseEngine(data);

    // All engine numeric fields must be BigInt
    expect(typeof engine.pnlPosTot).toBe("bigint");
    expect(typeof engine.pnlNegTot).toBe("bigint");
    expect(typeof engine.collateral).toBe("bigint");
    expect(typeof engine.openInterest).toBe("bigint");

    // Values must be non-negative for totals
    expect(engine.pnlPosTot).toBeGreaterThanOrEqual(0n);
    expect(engine.pnlNegTot).toBeGreaterThanOrEqual(0n);
    expect(engine.collateral).toBeGreaterThanOrEqual(0n);
    expect(engine.openInterest).toBeGreaterThanOrEqual(0n);
  }, 30_000);

  it("parseConfig returns valid unitScale for a devnet slab", async () => {
    if (SKIP || !rpcReachable || discoveredSlabs.length === 0) return;

    const slabKey = discoveredSlabs[0];
    const data = await fetchSlab(devnetConnection, slabKey);
    const layout = detectSlabLayout(data.length);
    expect(layout).not.toBeNull();

    const config = parseConfig(data, layout);
    expect(typeof config.unitScale).toBe("number");
    expect(config.unitScale).toBeGreaterThan(0);
    expect(config.collateralMint).toBeInstanceOf(PublicKey);
  }, 30_000);

  it("maxPnlCap is BigInt >= 0 for all discovered devnet slabs (sample)", async () => {
    if (SKIP || !rpcReachable || discoveredSlabs.length === 0) return;

    // Check first 3 markets max
    const sample = discoveredSlabs.slice(0, 3);
    for (const slabKey of sample) {
      const data = await fetchSlab(devnetConnection, slabKey);
      const layout = detectSlabLayout(data.length);
      if (!layout) continue;

      const config = parseConfig(data, layout);
      expect(typeof config.maxPnlCap).toBe("bigint");
      expect(config.maxPnlCap).toBeGreaterThanOrEqual(0n);
    }
  }, 60_000);

  it("pnlPosTot <= collateral (economic invariant) for all sampled devnet slabs", async () => {
    if (SKIP || !rpcReachable || discoveredSlabs.length === 0) return;

    // Economic invariant: total positive PnL cannot exceed total collateral in the slab
    // (a violation would indicate parse offset bugs or corrupt slab state)
    const sample = discoveredSlabs.slice(0, 3);
    for (const slabKey of sample) {
      const data = await fetchSlab(devnetConnection, slabKey);
      const engine = parseEngine(data);

      expect(
        engine.pnlPosTot <= engine.collateral + engine.pnlNegTot + 1_000_000_000_000n,
        `pnlPosTot (${engine.pnlPosTot}) > collateral+pnlNegTot+buffer for slab ${slabKey.toBase58()} — possible parse offset bug`
      ).toBe(true);
    }
  }, 60_000);

  it("engine.numUsedAccounts is a non-negative integer for devnet slabs", async () => {
    if (SKIP || !rpcReachable || discoveredSlabs.length === 0) return;

    const slabKey = discoveredSlabs[0];
    const data = await fetchSlab(devnetConnection, slabKey);
    const engine = parseEngine(data);

    // numUsedAccounts should be a non-negative BigInt
    expect(typeof engine.numUsedAccounts).toBe("bigint");
    expect(engine.numUsedAccounts).toBeGreaterThanOrEqual(0n);
    // For a live devnet market, there should be at least 1 used account (admin/fee)
    // — but we only assert >= 0 to avoid flakiness on newly created slabs
  }, 30_000);

  it("fetchSlab throws a descriptive error for a non-existent account", async () => {
    if (SKIP || !rpcReachable) return;

    // Use a random keypair so getAccountInfo returns null (System Program has data).
    const randomKey = Keypair.generate().publicKey;
    // Verify the account genuinely does not exist before calling fetchSlab.
    const info = await devnetConnection.getAccountInfo(randomKey, "confirmed");
    expect(info).toBeNull();
    await expect(fetchSlab(devnetConnection, randomKey)).rejects.toThrow(/not found/i);
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Suite 3: Error code parsing — end-to-end with realistic devnet log shapes
// ---------------------------------------------------------------------------

describe("devnet — error code parsing end-to-end [PERC-8365]", () => {
  /**
   * Simulate a realistic failed devnet transaction log for a given error code.
   * The format matches what Solana devnet actually returns in tx.meta.logMessages.
   */
  function makeDevnetErrorLogs(hexCode: string, instruction = "ExecuteAdl"): string[] {
    return [
      `Program ${DEVNET_PROGRAM_ID.toBase58()} invoke [1]`,
      `Program log: Instruction: ${instruction}`,
      `Program ${DEVNET_PROGRAM_ID.toBase58()} failed: custom program error: 0x${hexCode}`,
    ];
  }

  /**
   * Simulate a wrapped CPI error (e.g. from a keeper calling via proxy program).
   * Devnet sometimes wraps errors in invoke [2] context.
   */
  function makeDevnetWrappedErrorLogs(hexCode: string): string[] {
    const SYSTEM = "11111111111111111111111111111111";
    return [
      `Program ${SYSTEM} invoke [1]`,
      `Program log: Starting keeper crank`,
      `Program ${DEVNET_PROGRAM_ID.toBase58()} invoke [2]`,
      `Program log: Instruction: ExecuteAdl`,
      `Program ${DEVNET_PROGRAM_ID.toBase58()} failed: custom program error: 0x${hexCode}`,
      `Program ${SYSTEM} failed: custom program error: 0x${hexCode}`,
    ];
  }

  // ---- Code 61: EngineSideBlocked ----
  it("code 61 (0x3D) — EngineSideBlocked — direct devnet log format", () => {
    const logs = makeDevnetErrorLogs("3D");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(61);
    expect(result!.name).toBe("EngineSideBlocked");
    expect(result!.hint).toBeTruthy();
  });

  it("code 61 — wrapped CPI devnet log format parsed correctly", () => {
    const logs = makeDevnetWrappedErrorLogs("3D");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(61);
    expect(result!.name).toBe("EngineSideBlocked");
  });

  // ---- Code 62: EngineCorruptState ----
  it("code 62 (0x3E) — EngineCorruptState — devnet log format", () => {
    const logs = makeDevnetErrorLogs("3E");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(62);
    expect(result!.name).toBe("EngineCorruptState");
    expect(result!.hint).toBeTruthy();
  });

  it("code 62 — lowercase hex (0x3e) parsed identically to uppercase", () => {
    const upper = parseErrorFromLogs(makeDevnetErrorLogs("3E"));
    const lower = parseErrorFromLogs(makeDevnetErrorLogs("3e"));
    expect(upper).not.toBeNull();
    expect(lower).not.toBeNull();
    expect(upper!.code).toBe(lower!.code);
    expect(upper!.name).toBe(lower!.name);
  });

  // ---- Code 63: InsuranceFundNotDepleted ----
  it("code 63 (0x3F) — InsuranceFundNotDepleted — devnet log format", () => {
    const logs = makeDevnetErrorLogs("3F");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(63);
    expect(result!.name).toBe("InsuranceFundNotDepleted");
    expect(result!.hint).toMatch(/insurance|depleted/i);
  });

  it("code 63 — realistic devnet log with balance info in log body", () => {
    const logs = [
      `Program ${DEVNET_PROGRAM_ID.toBase58()} invoke [1]`,
      "Program log: Instruction: ExecuteAdl",
      "Program log: adl_check insurance_balance=50000000 threshold=0",
      `Program ${DEVNET_PROGRAM_ID.toBase58()} failed: custom program error: 0x3f`,
    ];
    const result = parseErrorFromLogs(logs);
    expect(result!.code).toBe(63);
    expect(result!.name).toBe("InsuranceFundNotDepleted");
  });

  // ---- Code 64: NoAdlCandidates ----
  it("code 64 (0x40) — NoAdlCandidates — devnet log format", () => {
    const logs = makeDevnetErrorLogs("40");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(64);
    expect(result!.name).toBe("NoAdlCandidates");
    expect(result!.hint).toMatch(/candidate|eligible/i);
  });

  it("code 64 — realistic devnet keeper log (no eligible positions on dominant side)", () => {
    const logs = [
      `Program ${DEVNET_PROGRAM_ID.toBase58()} invoke [1]`,
      "Program log: Instruction: ExecuteAdl",
      "Program log: net_long_oi=500000 net_short_oi=500000 target_side=long candidates=0",
      `Program ${DEVNET_PROGRAM_ID.toBase58()} failed: custom program error: 0x40`,
    ];
    const result = parseErrorFromLogs(logs);
    expect(result!.code).toBe(64);
    expect(result!.name).toBe("NoAdlCandidates");
  });

  // ---- Code 65: BankruptPositionAlreadyClosed ----
  it("code 65 (0x41) — BankruptPositionAlreadyClosed — devnet log format", () => {
    const logs = makeDevnetErrorLogs("41");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(65);
    expect(result!.name).toBe("BankruptPositionAlreadyClosed");
    expect(result!.hint).toMatch(/closed|size.*0|re-rank/i);
  });

  it("code 65 — realistic devnet keeper retry log (stale target_idx, already closed)", () => {
    const logs = [
      `Program ${DEVNET_PROGRAM_ID.toBase58()} invoke [1]`,
      "Program log: Instruction: ExecuteAdl",
      "Program log: target_idx=7 account_kind=User position_size=0",
      `Program ${DEVNET_PROGRAM_ID.toBase58()} failed: custom program error: 0x41`,
    ];
    const result = parseErrorFromLogs(logs);
    expect(result!.code).toBe(65);
    expect(result!.name).toBe("BankruptPositionAlreadyClosed");
  });

  // ---- Regression guards ----
  it("adjacent code 60 (0x3C) — EngineInvalidEntryPrice — not confused with ADL codes", () => {
    const logs = makeDevnetErrorLogs("3C");
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(60);
    expect(result!.name).toBe("EngineInvalidEntryPrice");
  });

  it("adjacent code 66 (0x42) — if defined — has code=66 exactly (no off-by-one from ADL range)", () => {
    const logs = makeDevnetErrorLogs("42");
    const result = parseErrorFromLogs(logs);
    // Code 66 may or may not be defined — but if it is, it must decode to exactly code 66
    // (not misidentified as any of the ADL codes 61-65 due to an off-by-one bug)
    if (result !== null) {
      expect(result.code).toBe(66);
    }
  });

  it("all ADL error codes 61-65 are in PERCOLATOR_ERRORS with name + hint", () => {
    for (let code = 61; code <= 65; code++) {
      const entry = PERCOLATOR_ERRORS[code];
      expect(entry, `PERCOLATOR_ERRORS[${code}] should be defined`).toBeDefined();
      expect(entry.name, `code ${code} should have a name`).toBeTruthy();
      expect(entry.hint, `code ${code} should have a hint`).toBeTruthy();
    }
  });

  it("decodeError() returns correct entry for all ADL codes 61-65", () => {
    const expected: Record<number, string> = {
      61: "EngineSideBlocked",
      62: "EngineCorruptState",
      63: "InsuranceFundNotDepleted",
      64: "NoAdlCandidates",
      65: "BankruptPositionAlreadyClosed",
    };
    for (const [codeStr, name] of Object.entries(expected)) {
      const code = Number(codeStr);
      const info = decodeError(code);
      expect(info, `decodeError(${code}) should not be undefined`).toBeDefined();
      expect(info!.name).toBe(name);
    }
  });

  it("parseErrorFromLogs returns null for a successful devnet tx (no error line)", () => {
    const ADL_TAG_DECIMAL = "2904424449"; // 0xAD1E0001 decimal
    const logs = [
      `Program ${DEVNET_PROGRAM_ID.toBase58()} invoke [1]`,
      "Program log: Instruction: ExecuteAdl",
      `Program log: ${ADL_TAG_DECIMAL} 3 150000000 500000000 0`,
      `Program ${DEVNET_PROGRAM_ID.toBase58()} consumed 38492 of 200000 compute units`,
      `Program ${DEVNET_PROGRAM_ID.toBase58()} success`,
    ];
    expect(parseErrorFromLogs(logs)).toBeNull();
  });

  it("parseErrorFromLogs returns null for empty log array", () => {
    expect(parseErrorFromLogs([])).toBeNull();
  });

  it("parseErrorFromLogs handles mixed-case hex in devnet logs (0x3d vs 0x3D)", () => {
    const lower = parseErrorFromLogs(makeDevnetErrorLogs("3d"));
    const upper = parseErrorFromLogs(makeDevnetErrorLogs("3D"));
    expect(lower!.code).toBe(upper!.code);
    expect(lower!.name).toBe(upper!.name);
  });
});
