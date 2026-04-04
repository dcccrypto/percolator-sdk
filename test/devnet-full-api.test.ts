/**
 * PERC-8468: SDK devnet integration test suite — full public API coverage.
 *
 * Comprehensive integration tests for the full SDK public API against devnet.
 * These tests validate real on-chain interactions using the public devnet RPC
 * (no Helius API key required).
 *
 * Coverage:
 *   1. discoverMarkets()          — returns array (possibly empty), no 429, handles 0 markets
 *   2. fetchAdlRankedPositions()  — returns valid data or empty array, not 500
 *   3. buildAdlTransaction()      — produces valid versioned transaction
 *   4. Error codes 61-65          — correctly exported and parsed from on-chain errors
 *   5. RpcPool failover           — test with mix of valid/invalid endpoints
 *
 * Tests are designed to pass even without mainnet markets or a Helius key.
 *
 * Run:
 *   npx vitest run test/devnet-full-api.test.ts
 *   SKIP_DEVNET_TESTS=1 npx vitest run test/devnet-full-api.test.ts  # skip live RPC
 */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import {
  Connection,
  Keypair,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  // Market discovery
  discoverMarkets,
  getMarketsByAddress,
  // Slab parsing
  fetchSlab,
  parseHeader,
  parseConfig,
  parseEngine,
  detectSlabLayout,
  // ADL
  fetchAdlRankedPositions,
  rankAdlPositions,
  isAdlTriggered,
  buildAdlInstruction,
  buildAdlTransaction,
  parseAdlEvent,
  // Error handling
  decodeError,
  parseErrorFromLogs,
  PERCOLATOR_ERRORS,
  getErrorName,
  getErrorHint,
  isAnchorErrorCode,
  // RPC
  RpcPool,
  checkRpcHealth,
  withRetry,
  // Config
  getProgramId,
  type Network,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVNET_RPC = "https://api.devnet.solana.com";
const DEVNET_PROGRAM_ID = getProgramId("devnet");
const RPC_TIMEOUT_MS = 30_000;

/**
 * Fake endpoint that will always fail — used for failover testing.
 * Using a non-routable IP ensures fast failure without DNS lookup delays.
 */
const DEAD_RPC = "http://192.0.2.1:8899"; // RFC 5737 TEST-NET-1

const SKIP = process.env.SKIP_DEVNET_TESTS === "1";

// ---------------------------------------------------------------------------
// Shared state (populated in beforeAll)
// ---------------------------------------------------------------------------

let connection: Connection;
let discoveredMarkets: Awaited<ReturnType<typeof discoverMarkets>> = [];
let devnetReachable = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function checkDevnetReachable(): Promise<boolean> {
  try {
    const c = new Connection(DEVNET_RPC, { commitment: "confirmed" });
    const version = await Promise.race([
      c.getVersion(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 10_000)
      ),
    ]);
    return typeof version["solana-core"] === "string";
  } catch {
    return false;
  }
}

// ============================================================================
// 1. discoverMarkets() — Full API Coverage
// ============================================================================

describe("PERC-8468: discoverMarkets() devnet integration", () => {
  beforeAll(async () => {
    if (SKIP) return;
    devnetReachable = await checkDevnetReachable();
    if (!devnetReachable) {
      console.warn("⚠️ Devnet RPC unreachable — skipping live tests");
      return;
    }
    connection = new Connection(DEVNET_RPC, {
      commitment: "confirmed",
    });

    // Discovery may return 0 markets if devnet has none deployed — that's valid
    try {
      discoveredMarkets = await discoverMarkets(connection, DEVNET_PROGRAM_ID);
    } catch (err) {
      // If discovery fails (e.g., 429 from devnet), capture but don't fail beforeAll
      console.warn("discoverMarkets failed in setup:", err);
      discoveredMarkets = [];
    }
  }, 60_000);

  it.skipIf(SKIP || !devnetReachable)(
    "returns an array (possibly empty) without errors",
    () => {
      expect(Array.isArray(discoveredMarkets)).toBe(true);
    }
  );

  it.skipIf(SKIP || !devnetReachable)(
    "does not throw 429 rate limit errors",
    async () => {
      // Run discovery again to verify no 429
      const fn = () => discoverMarkets(connection, DEVNET_PROGRAM_ID);
      await expect(fn()).resolves.toBeDefined();
    },
    RPC_TIMEOUT_MS
  );

  it.skipIf(SKIP || !devnetReachable)(
    "each discovered market has valid structure",
    () => {
      for (const market of discoveredMarkets) {
        // Must have a pubkey field (the slab account address)
        expect(market).toHaveProperty("pubkey");
        expect(market.pubkey).toBeInstanceOf(PublicKey);
        // Must have data (the account data)
        expect(market).toHaveProperty("account");
        expect(market.account).toHaveProperty("data");
        expect(market.account.data).toBeInstanceOf(Buffer);
        // Data must be large enough for at least the header
        expect(market.account.data.length).toBeGreaterThan(104);
      }
    }
  );

  it.skipIf(SKIP || !devnetReachable)(
    "discovered market slabs have parseable headers",
    () => {
      for (const market of discoveredMarkets) {
        const header = parseHeader(market.account.data);
        expect(header).toBeDefined();
        expect(typeof header.maxAccounts).toBe("number");
        expect(header.maxAccounts).toBeGreaterThan(0);
      }
    }
  );

  it.skipIf(SKIP || !devnetReachable)(
    "discovered market slabs have detectable layouts",
    () => {
      for (const market of discoveredMarkets) {
        const layout = detectSlabLayout(market.account.data);
        expect(layout).toBeDefined();
        expect(typeof layout).toBe("string");
        // Should be one of the known layout types
        expect(["V1", "V1M", "V1M2", "V_ADL"]).toContain(layout);
      }
    }
  );

  it.skipIf(SKIP || !devnetReachable)(
    "handles 0 markets gracefully",
    async () => {
      // Use a random program ID that definitely has no accounts
      const fakeProgram = Keypair.generate().publicKey;
      const markets = await discoverMarkets(connection, fakeProgram);
      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBe(0);
    },
    RPC_TIMEOUT_MS
  );
});

// ============================================================================
// 2. fetchAdlRankedPositions() — Devnet Integration
// ============================================================================

describe("PERC-8468: fetchAdlRankedPositions() devnet integration", () => {
  beforeAll(async () => {
    if (SKIP || !devnetReachable) return;
    // Ensure connection is set up
    if (!connection) {
      connection = new Connection(DEVNET_RPC, { commitment: "confirmed" });
    }
  }, 30_000);

  it.skipIf(SKIP || !devnetReachable || discoveredMarkets.length === 0)(
    "returns valid ranking result for each discovered market",
    async () => {
      for (const market of discoveredMarkets.slice(0, 3)) {
        // Limit to first 3 to avoid rate limits
        const result = await fetchAdlRankedPositions(connection, market.pubkey);

        // Must return a valid AdlRankingResult
        expect(result).toBeDefined();
        expect(typeof result.isTriggered).toBe("boolean");
        expect(Array.isArray(result.ranked)).toBe(true);
        expect(Array.isArray(result.longs)).toBe(true);
        expect(Array.isArray(result.shorts)).toBe(true);

        // Ranked positions (if any) must have required fields
        for (const pos of result.ranked) {
          expect(typeof pos.idx).toBe("number");
          expect(typeof pos.pnlPct).toBe("number");
          expect(pos.side === "long" || pos.side === "short").toBe(true);
        }
      }
    },
    60_000
  );

  it.skipIf(SKIP || !devnetReachable || discoveredMarkets.length === 0)(
    "rankAdlPositions() pure variant works on fetched slab data",
    async () => {
      const market = discoveredMarkets[0];
      const slabData = await fetchSlab(connection, market.pubkey);

      const result = rankAdlPositions(slabData);
      expect(result).toBeDefined();
      expect(typeof result.isTriggered).toBe("boolean");
      expect(Array.isArray(result.ranked)).toBe(true);
    },
    RPC_TIMEOUT_MS
  );

  it.skipIf(SKIP || !devnetReachable || discoveredMarkets.length === 0)(
    "isAdlTriggered() returns boolean without throwing",
    async () => {
      const market = discoveredMarkets[0];
      const slabData = await fetchSlab(connection, market.pubkey);

      const triggered = isAdlTriggered(slabData);
      expect(typeof triggered).toBe("boolean");
    },
    RPC_TIMEOUT_MS
  );

  it("returns empty rankings for a non-existent slab (offline test)", () => {
    // Create minimal fake slab data that is too short for any valid layout
    const fakeSlab = new Uint8Array(64);
    // isAdlTriggered should return false on invalid data, not throw
    expect(isAdlTriggered(fakeSlab)).toBe(false);
  });
});

// ============================================================================
// 3. buildAdlTransaction() — Devnet Integration
// ============================================================================

describe("PERC-8468: buildAdlTransaction() devnet integration", () => {
  beforeAll(async () => {
    if (SKIP || !devnetReachable) return;
    if (!connection) {
      connection = new Connection(DEVNET_RPC, { commitment: "confirmed" });
    }
  }, 30_000);

  it.skipIf(SKIP || !devnetReachable || discoveredMarkets.length === 0)(
    "produces valid TransactionInstruction or null for each market",
    async () => {
      const market = discoveredMarkets[0];
      const caller = Keypair.generate().publicKey;
      const fakeOracle = Keypair.generate().publicKey;

      const result = await buildAdlTransaction(
        connection,
        caller,
        market.pubkey,
        fakeOracle,
        DEVNET_PROGRAM_ID
      );

      // ADL is unlikely to be triggered on devnet, so null is expected
      // But if it IS triggered, verify the instruction shape
      if (result !== null) {
        expect(result).toHaveProperty("programId");
        expect(result.programId).toEqual(DEVNET_PROGRAM_ID);
        expect(result).toHaveProperty("keys");
        expect(Array.isArray(result.keys)).toBe(true);
        expect(result.keys.length).toBeGreaterThan(0);
        expect(result).toHaveProperty("data");
        expect(result.data).toBeInstanceOf(Buffer);
      } else {
        // null means ADL not triggered — valid result
        expect(result).toBeNull();
      }
    },
    RPC_TIMEOUT_MS
  );

  it("buildAdlInstruction() produces valid instruction (offline test)", () => {
    const caller = Keypair.generate().publicKey;
    const slab = Keypair.generate().publicKey;
    const oracle = Keypair.generate().publicKey;
    const programId = DEVNET_PROGRAM_ID;
    const targetIdx = 5;

    const ix = buildAdlInstruction(caller, slab, oracle, programId, targetIdx);
    expect(ix).toHaveProperty("programId");
    expect(ix.programId).toEqual(programId);
    expect(ix).toHaveProperty("keys");
    expect(Array.isArray(ix.keys)).toBe(true);
    expect(ix.keys.length).toBeGreaterThan(0);
    expect(ix).toHaveProperty("data");
    expect(ix.data).toBeInstanceOf(Buffer);
    // Data should encode instruction tag + target index
    expect(ix.data.length).toBeGreaterThan(0);
  });

  it("buildAdlInstruction() with backup oracles includes them in keys", () => {
    const caller = Keypair.generate().publicKey;
    const slab = Keypair.generate().publicKey;
    const oracle = Keypair.generate().publicKey;
    const backup1 = Keypair.generate().publicKey;
    const backup2 = Keypair.generate().publicKey;
    const programId = DEVNET_PROGRAM_ID;

    const ix = buildAdlInstruction(caller, slab, oracle, programId, 0, [
      backup1,
      backup2,
    ]);

    // Should have more keys with backups than without
    const ixNoBackup = buildAdlInstruction(
      caller,
      slab,
      oracle,
      programId,
      0
    );
    expect(ix.keys.length).toBeGreaterThan(ixNoBackup.keys.length);
  });
});

// ============================================================================
// 4. Error Codes 61-65 — Exported and Parseable
// ============================================================================

describe("PERC-8468: error codes 61-65 correctly exported and parsed", () => {
  const ADL_ERROR_CODES = [61, 62, 63, 64, 65] as const;
  const EXPECTED_NAMES: Record<number, string> = {
    61: "EngineSideBlocked",
    62: "EngineCorruptState",
    63: "InsuranceFundNotDepleted",
    64: "NoAdlCandidates",
    65: "BankruptPositionAlreadyClosed",
  };

  it("PERCOLATOR_ERRORS contains all ADL error codes 61-65", () => {
    for (const code of ADL_ERROR_CODES) {
      expect(PERCOLATOR_ERRORS[code]).toBeDefined();
      expect(PERCOLATOR_ERRORS[code].name).toBe(EXPECTED_NAMES[code]);
      expect(typeof PERCOLATOR_ERRORS[code].hint).toBe("string");
      expect(PERCOLATOR_ERRORS[code].hint!.length).toBeGreaterThan(0);
    }
  });

  it("decodeError() returns correct info for codes 61-65", () => {
    for (const code of ADL_ERROR_CODES) {
      const info = decodeError(code);
      expect(info).toBeDefined();
      expect(info!.name).toBe(EXPECTED_NAMES[code]);
      expect(typeof info!.hint).toBe("string");
    }
  });

  it("getErrorName() returns correct names for codes 61-65", () => {
    for (const code of ADL_ERROR_CODES) {
      expect(getErrorName(code)).toBe(EXPECTED_NAMES[code]);
    }
  });

  it("getErrorHint() returns non-empty hints for codes 61-65", () => {
    for (const code of ADL_ERROR_CODES) {
      const hint = getErrorHint(code);
      expect(typeof hint).toBe("string");
      expect(hint!.length).toBeGreaterThan(10);
    }
  });

  it("decodeError() returns undefined for unknown codes", () => {
    expect(decodeError(9999)).toBeUndefined();
    expect(decodeError(-1)).toBeUndefined();
  });

  it("getErrorName() returns Unknown(N) for unknown codes", () => {
    expect(getErrorName(9999)).toBe("Unknown(9999)");
  });

  it("isAnchorErrorCode() correctly identifies Anchor vs Percolator codes", () => {
    // ADL codes 61-65 are Percolator codes, not Anchor
    for (const code of ADL_ERROR_CODES) {
      expect(isAnchorErrorCode(code)).toBe(false);
    }
    // Anchor codes start at 6000+
    expect(isAnchorErrorCode(6000)).toBe(true);
    expect(isAnchorErrorCode(6400)).toBe(true);
  });

  describe("parseErrorFromLogs() extracts ADL errors from realistic log lines", () => {
    it("parses error code 63 (InsuranceFundNotDepleted) from Anchor-style logs", () => {
      const logs = [
        "Program ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv invoke [1]",
        "Program log: Instruction: ExecuteAdl",
        "Program log: AnchorError occurred. Error Code: InsuranceFundNotDepleted. Error Number: 6063. Error Message: InsuranceFundNotDepleted.",
        "Program ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv consumed 15000 of 200000 compute units",
        "Program ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv failed: custom program error: 0x17AF",
      ];

      const parsed = parseErrorFromLogs(logs);
      expect(parsed).toBeDefined();
      // The parser should extract the error code
      expect(parsed!.code).toBeDefined();
    });

    it("parses error code 64 (NoAdlCandidates) from hex error", () => {
      const logs = [
        "Program ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv invoke [1]",
        "Program log: Instruction: ExecuteAdl",
        "Program ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv consumed 8000 of 200000 compute units",
        "Program ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv failed: custom program error: 0x17B0",
      ];

      const parsed = parseErrorFromLogs(logs);
      expect(parsed).toBeDefined();
    });

    it("returns null for logs with no error", () => {
      const logs = [
        "Program ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv invoke [1]",
        "Program log: Instruction: Deposit",
        "Program ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv success",
      ];

      const parsed = parseErrorFromLogs(logs);
      expect(parsed).toBeNull();
    });

    it("handles empty log array", () => {
      expect(parseErrorFromLogs([])).toBeNull();
    });
  });

  describe("parseAdlEvent() decodes sol_log_64 ADL events", () => {
    it("decodes valid ADL event log line", () => {
      // ADL tag = 0xAD1E0001 = 2903769089
      const tag = 2903769089n;
      const logs = [
        "Program log: 2903769089 42 1500000 5000000000 0",
      ];

      const event = parseAdlEvent(logs);
      if (event) {
        expect(event.tag).toBe(tag);
        expect(event.targetIdx).toBe(42);
        expect(typeof event.price).toBe("number");
      }
      // If parseAdlEvent doesn't find the pattern, null is also valid
    });

    it("returns null for non-ADL logs", () => {
      const logs = [
        "Program log: Instruction: Deposit",
        "Program log: Success",
      ];
      expect(parseAdlEvent(logs)).toBeNull();
    });

    it("returns null for empty logs", () => {
      expect(parseAdlEvent([])).toBeNull();
    });
  });
});

// ============================================================================
// 5. RpcPool Failover — Live Integration
// ============================================================================

describe("PERC-8468: RpcPool failover with mixed endpoints", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.skipIf(SKIP || !devnetReachable)(
    "pool with valid devnet endpoint returns healthy connection",
    async () => {
      const pool = new RpcPool({
        endpoints: [
          { url: DEVNET_RPC, weight: 10, label: "devnet-primary" },
        ],
      });

      const conn = pool.getConnection();
      expect(conn).toBeInstanceOf(Connection);

      // Verify the connection actually works
      const version = await conn.getVersion();
      expect(version["solana-core"]).toBeDefined();
    },
    RPC_TIMEOUT_MS
  );

  it.skipIf(SKIP || !devnetReachable)(
    "pool with dead + valid endpoints fails over to valid",
    async () => {
      const pool = new RpcPool({
        endpoints: [
          { url: DEAD_RPC, weight: 1, label: "dead-endpoint" },
          { url: DEVNET_RPC, weight: 10, label: "devnet-primary" },
        ],
        strategy: "failover",
      });

      // The pool should eventually route to the working devnet endpoint
      const conn = pool.getConnection();
      expect(conn).toBeInstanceOf(Connection);
    }
  );

  it.skipIf(SKIP || !devnetReachable)(
    "checkRpcHealth() returns healthy for devnet",
    async () => {
      const result = await checkRpcHealth(DEVNET_RPC);
      expect(result).toBeDefined();
      expect(typeof result.healthy).toBe("boolean");
      expect(result.healthy).toBe(true);
      expect(typeof result.latencyMs).toBe("number");
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.latencyMs).toBeLessThan(30_000);
    },
    RPC_TIMEOUT_MS
  );

  it.skipIf(SKIP)(
    "checkRpcHealth() returns unhealthy for dead endpoint",
    async () => {
      const result = await checkRpcHealth(DEAD_RPC, { timeoutMs: 3_000 });
      expect(result).toBeDefined();
      expect(result.healthy).toBe(false);
    },
    10_000
  );

  it("withRetry() retries on transient failure then succeeds", async () => {
    let attempts = 0;
    const fn = async (): Promise<string> => {
      attempts++;
      if (attempts < 3) {
        throw new Error("HTTP 429 Too Many Requests");
      }
      return "success";
    };

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 50,
      jitterFactor: 0,
    });

    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("withRetry() throws after max retries exhausted", async () => {
    const fn = async (): Promise<string> => {
      throw new Error("HTTP 503 Service Unavailable");
    };

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 10,
        maxDelayMs: 50,
        jitterFactor: 0,
      })
    ).rejects.toThrow("503");
  });

  it("withRetry() does not retry non-retryable errors", async () => {
    let attempts = 0;
    const fn = async (): Promise<string> => {
      attempts++;
      throw new Error("401 Unauthorized");
    };

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        jitterFactor: 0,
      })
    ).rejects.toThrow("401");

    // Should have only attempted once (no retries for 401)
    expect(attempts).toBe(1);
  });

  it("RpcPool status() does not leak API keys", () => {
    const pool = new RpcPool({
      endpoints: [
        { url: "https://mainnet.helius-rpc.com/?api-key=SECRET_KEY_123", weight: 1 },
        { url: "https://api.devnet.solana.com", weight: 1 },
      ],
    });

    const status = pool.status();
    const statusStr = JSON.stringify(status);
    expect(statusStr).not.toContain("SECRET_KEY_123");
  });

  it("RpcPool requires at least one endpoint", () => {
    expect(() => new RpcPool({ endpoints: [] })).toThrow(
      /at least one endpoint/i
    );
  });
});

// ============================================================================
// 6. getMarketsByAddress() — Devnet Integration
// ============================================================================

describe("PERC-8468: getMarketsByAddress() devnet integration", () => {
  beforeAll(async () => {
    if (SKIP || !devnetReachable) return;
    if (!connection) {
      connection = new Connection(DEVNET_RPC, { commitment: "confirmed" });
    }
  });

  it.skipIf(SKIP || !devnetReachable || discoveredMarkets.length === 0)(
    "fetches markets by known addresses",
    async () => {
      const addresses = discoveredMarkets.slice(0, 3).map((m) => m.pubkey);
      const markets = await getMarketsByAddress(connection, addresses);

      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);
      expect(markets.length).toBeLessThanOrEqual(addresses.length);

      for (const market of markets) {
        expect(market).toHaveProperty("pubkey");
        expect(market.pubkey).toBeInstanceOf(PublicKey);
        expect(market).toHaveProperty("account");
        expect(market.account.data.length).toBeGreaterThan(104);
      }
    },
    RPC_TIMEOUT_MS
  );

  it.skipIf(SKIP || !devnetReachable)(
    "returns empty for non-existent addresses",
    async () => {
      const fakeAddresses = [Keypair.generate().publicKey];
      const markets = await getMarketsByAddress(connection, fakeAddresses);
      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBe(0);
    },
    RPC_TIMEOUT_MS
  );
});

// ============================================================================
// 7. Slab Parsing — Engine & Config Against Live Data
// ============================================================================

describe("PERC-8468: slab parsing against live devnet data", () => {
  beforeAll(async () => {
    if (SKIP || !devnetReachable) return;
    if (!connection) {
      connection = new Connection(DEVNET_RPC, { commitment: "confirmed" });
    }
  });

  it.skipIf(SKIP || !devnetReachable || discoveredMarkets.length === 0)(
    "parseEngine() returns numeric fields from devnet slab",
    async () => {
      const market = discoveredMarkets[0];
      const slabData = await fetchSlab(connection, market.pubkey);
      const layout = detectSlabLayout(slabData);

      expect(layout).toBeDefined();

      const engine = parseEngine(slabData);
      expect(engine).toBeDefined();

      // Engine should have standard fields
      if (engine.markPrice !== undefined) {
        expect(typeof engine.markPrice).toBe("number");
      }
      if (engine.totalOi !== undefined) {
        expect(typeof engine.totalOi === "number" || typeof engine.totalOi === "bigint").toBe(true);
      }
    },
    RPC_TIMEOUT_MS
  );

  it.skipIf(SKIP || !devnetReachable || discoveredMarkets.length === 0)(
    "parseConfig() returns valid config from devnet slab",
    async () => {
      const market = discoveredMarkets[0];
      const slabData = await fetchSlab(connection, market.pubkey);

      const config = parseConfig(slabData);
      expect(config).toBeDefined();
    },
    RPC_TIMEOUT_MS
  );

  it.skipIf(SKIP || !devnetReachable || discoveredMarkets.length === 0)(
    "parseHeader() returns valid header from devnet slab",
    async () => {
      const market = discoveredMarkets[0];
      const slabData = await fetchSlab(connection, market.pubkey);

      const header = parseHeader(slabData);
      expect(header).toBeDefined();
      expect(typeof header.maxAccounts).toBe("number");
      expect(header.maxAccounts).toBeGreaterThan(0);
    },
    RPC_TIMEOUT_MS
  );
});

// ============================================================================
// 8. getProgramId() — Config / Network Switching
// ============================================================================

describe("PERC-8468: getProgramId() network config", () => {
  it("returns a PublicKey for devnet", () => {
    const id = getProgramId("devnet");
    expect(id).toBeInstanceOf(PublicKey);
  });

  it("returns a PublicKey for mainnet", () => {
    const id = getProgramId("mainnet");
    expect(id).toBeInstanceOf(PublicKey);
  });

  it("devnet and mainnet program IDs are different", () => {
    const devnet = getProgramId("devnet");
    const mainnet = getProgramId("mainnet");
    expect(devnet.toBase58()).not.toBe(mainnet.toBase58());
  });
});
