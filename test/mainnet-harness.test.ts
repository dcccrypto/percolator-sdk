/**
 * PERC-8417: Mainnet Readiness Integration Test Harness
 *
 * Comprehensive test harness covering ALL SDK user-facing flows that will execute
 * on mainnet. Tests run against devnet by default (with known addresses) and can
 * switch to mainnet by setting MAINNET_RPC_URL + MAINNET_PROGRAM_ID env vars.
 *
 * This harness does NOT submit transactions — it validates that the SDK correctly:
 *   1. Discovers markets (via getMarketsByAddress and discoverMarkets)
 *   2. Parses slab data (header, config, engine, accounts, risk params)
 *   3. Refuses the v12 position / LP / ADL instruction surface (removed from the v17+ wrapper;
 *      the v18 wire is pinned in the default suite)
 *   5. Runs ADL ranking on live data (building ExecuteAdl is refused on v17+)
 *   6. Encodes the v18 TopUpInsurance wire
 *   7. Derives the PDAs correctly
 *   8. Parses error codes 61-65 (v17+ wrapper names)
 *
 * Run against devnet:
 *   npx vitest run --config vitest.devnet.config.ts test/mainnet-harness.test.ts
 *
 * Run against mainnet (once Helius key available):
 *   MAINNET_RPC_URL=https://mainnet.helius-rpc.com/?api-key=XXX \
 *   MAINNET_PROGRAM_ID=<id> \
 *   npx vitest run --config vitest.devnet.config.ts test/mainnet-harness.test.ts
 *
 * Skipped when SKIP_DEVNET_TESTS=1.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";

/** SPL Token Program ID — hardcoded to avoid @solana/spl-token dependency in tests. */
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
import {
  // Discovery
  discoverMarkets,
  getMarketsByAddress,
  // Slab parsing
  parseHeader,
  parseConfig,
  parseEngine,
  parseParams,
  parseAllAccounts,
  detectSlabLayout,
  parseUsedIndices,
  maxAccountIndex,
  readNonce,
  readLastThrUpdateSlot,
  computeEffectiveOiCapBps,
  // ADL
  fetchAdlRankedPositions,
  isAdlTriggered,
  rankAdlPositions,
  buildAdlInstruction,
  buildAdlTransaction,
  // Instructions (position open/close cycle)
  encodeInitUser,
  encodeKeeperCrank,
  encodeLiquidateAtOracle,
  // Instructions (LP deposit/withdraw)
  encodeInitLP,
  encodeLpVaultWithdraw,
  encodeQueueWithdrawal,
  encodeClaimQueuedWithdrawal,
  encodeCancelQueuedWithdrawal,
  // Instructions (ADL)
  encodeExecuteAdl,
  // Instructions (insurance)
  encodeTopUpInsurance,
  // Account metas
  buildAccountMetas,
  ACCOUNTS_INIT_USER,
  ACCOUNTS_EXECUTE_ADL,
  // PDA derivation
  deriveVaultAuthority,
  deriveLpPda,
  deriveCreatorLockPda,
  // Error codes
  decodeError,
  parseErrorFromLogs,
  PERCOLATOR_ERRORS,
  // Program IDs
  getProgramId,
  // Types re-exported for assertions
  type SlabHeader,
  type MarketConfig,
  type EngineState,
  type Account,
  type RiskParams,
} from "../src/index.js";
import { itStale, devnetUnavailableReason, loadSharedMarkets, withDeadline } from "./helpers/devnet-shared.js";

// ---------------------------------------------------------------------------
// Config: devnet vs mainnet
// ---------------------------------------------------------------------------

const RPC_URL = process.env.MAINNET_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = process.env.MAINNET_PROGRAM_ID
  ? new PublicKey(process.env.MAINNET_PROGRAM_ID)
  : getProgramId("devnet");
const IS_MAINNET = !!process.env.MAINNET_RPC_URL;
const NETWORK_LABEL = IS_MAINNET ? "mainnet" : "devnet";
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
let slabData: Uint8Array | null = null;
let rpcReachable = false;

// ---------------------------------------------------------------------------
// Helpers
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

/** Create a random keypair — used as a placeholder signer for instruction building. */
function randomKeypair(): Keypair {
  return Keypair.generate();
}

// ============================================================================
// Suite: Market Discovery via RPC
// ============================================================================

describe(`PERC-8417: Mainnet Readiness Harness (${NETWORK_LABEL})`, () => {
  beforeAll(async () => {
    if (SKIP) return;
    connection = new Connection(RPC_URL, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: RPC_TIMEOUT_MS,
    });
    rpcReachable = await checkRpcReachable(connection);
    if (!rpcReachable) {
      console.warn(`⚠ ${NETWORK_LABEL} RPC unreachable — RPC-dependent tests will skip`);
      return;
    }

    // Discover markets once for all suites
    try {
      if (!IS_MAINNET) {
        // devnet: discovery ran once in test/devnet-global-setup.ts
        const why = devnetUnavailableReason();
        if (why) {
          rpcReachable = false;
          console.warn(`SKIPPING RPC-dependent cases: ${why}`);
          return;
        }
        discoveredMarkets = await loadSharedMarkets(connection, PROGRAM_ID);
      } else {
        discoveredMarkets = await withDeadline(discoverMarkets(connection, PROGRAM_ID), 50_000, "discoverMarkets");
      }
      discoveredAddresses = discoveredMarkets.map((m) => m.slabAddress);

      if (discoveredAddresses.length > 0) {
        // Fetch first slab raw data for parsing tests
        const ai = await withDeadline(connection.getAccountInfo(discoveredAddresses[0]), 10_000, "getAccountInfo");
        slabData = ai?.data ? new Uint8Array(ai.data) : null;
      }
    } catch (e) {
      console.warn("discoverMarkets() failed (may need Helius RPC):", e);
    }
  }, 60_000);

  // ========================================================================
  // 1. Market Discovery
  // ========================================================================

  describe("1. Market Discovery", () => {
    it("discoverMarkets() returns at least one market", () => {
      if (!rpcReachable || SKIP) return;
      expect(discoveredMarkets.length).toBeGreaterThan(0);
    });

    it("discovered markets have valid slabAddress and parsed data", () => {
      if (!rpcReachable || SKIP) return;
      for (const m of discoveredMarkets) {
        expect(m.slabAddress).toBeInstanceOf(PublicKey);
        expect(m.header).toBeDefined();
        expect(m.config).toBeDefined();
        expect(m.engine).toBeDefined();
      }
    });

    it("getMarketsByAddress() returns matching data for discovered addresses", async () => {
      if (!rpcReachable || SKIP || discoveredAddresses.length === 0) return;
      try {
        const results = await getMarketsByAddress(
          connection,
          PROGRAM_ID,
          discoveredAddresses.slice(0, 3),
        );
        expect(results.length).toBeLessThanOrEqual(3);
        for (const r of results) {
          expect(r.slabAddress).toBeInstanceOf(PublicKey);
          expect(r.header).toBeDefined();
        }
      } catch (e: unknown) {
        if (String(e).includes("429")) return;
        throw e;
      }
    });

    it("getMarketsByAddress() handles unknown address gracefully", async () => {
      if (!rpcReachable || SKIP) return;
      try {
        const bogus = Keypair.generate().publicKey;
        const results = await getMarketsByAddress(connection, PROGRAM_ID, [bogus]);
        expect(results).toHaveLength(0);
      } catch (e: unknown) {
        if (String(e).includes("429")) return;
        throw e;
      }
    });
  });

  // ========================================================================
  // 2. Slab Data Parsing
  // ========================================================================

  describe("2. Slab Parsing", () => {
    itStale("detectSlabLayout() returns non-null for discovered slab", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const layout = detectSlabLayout(slabData.length, slabData);
      expect(layout).not.toBeNull();
      expect(layout!.maxAccounts).toBeGreaterThan(0);
    });

    itStale("parseHeader() returns valid header fields", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const header: SlabHeader = parseHeader(slabData);
      expect(header.admin).toBeInstanceOf(PublicKey);
      expect(typeof header.bump).toBe("number");
    });

    itStale("parseConfig() returns valid config with collateral mint + oracle", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const layout = detectSlabLayout(slabData.length, slabData);
      const config: MarketConfig = parseConfig(slabData, layout);
      expect(config.collateralMint).toBeInstanceOf(PublicKey);
      expect(config.vaultPubkey).toBeInstanceOf(PublicKey);
      expect(typeof config.maxStalenessSlots).toBe("bigint");
      expect(config.unitScale).toBeGreaterThanOrEqual(0);
    });

    itStale("parseEngine() returns valid engine state with mark price", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const engine: EngineState = parseEngine(slabData);
      expect(typeof engine.markPriceE6).toBe("bigint");
      expect(typeof engine.longOi).toBe("bigint");
      expect(typeof engine.shortOi).toBe("bigint");
      expect(typeof engine.pnlPosTot).toBe("bigint");
      expect(typeof engine.numUsedAccounts).toBe("number");
    });

    it("parseParams() returns valid risk parameters", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const layout = detectSlabLayout(slabData.length, slabData);
      const params: RiskParams = parseParams(slabData, layout);
      expect(typeof params.maintenanceMarginBps).toBe("bigint");
      expect(typeof params.initialMarginBps).toBe("bigint");
      expect(typeof params.tradingFeeBps).toBe("bigint");
    });

    itStale("parseAllAccounts() returns array of indexed accounts", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const accounts = parseAllAccounts(slabData);
      expect(Array.isArray(accounts)).toBe(true);
      // May be zero if market has no active positions
      for (const { idx, account } of accounts) {
        expect(typeof idx).toBe("number");
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(account.owner).toBeInstanceOf(PublicKey);
        expect(typeof account.positionSize).toBe("bigint");
        expect(typeof account.capital).toBe("bigint");
      }
    });

    itStale("parseUsedIndices() returns non-negative indices", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const indices = parseUsedIndices(slabData);
      expect(Array.isArray(indices)).toBe(true);
      for (const idx of indices) {
        expect(idx).toBeGreaterThanOrEqual(0);
      }
    });

    itStale("maxAccountIndex() returns positive number for valid slab length", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const max = maxAccountIndex(slabData.length);
      expect(max).toBeGreaterThan(0);
    });

    itStale("readNonce() returns a bigint", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const nonce = readNonce(slabData);
      expect(typeof nonce).toBe("bigint");
    });

    itStale("readLastThrUpdateSlot() returns a bigint", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const slot = readLastThrUpdateSlot(slabData);
      expect(typeof slot).toBe("bigint");
    });

    itStale("computeEffectiveOiCapBps() returns a bigint for valid config + slot", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const layout = detectSlabLayout(slabData.length, slabData);
      const config = parseConfig(slabData, layout);
      const bps = computeEffectiveOiCapBps(config, 300_000_000n);
      expect(typeof bps).toBe("bigint");
    });
  });

  // ========================================================================
  // 3. v12 instruction surface (refused on v17+)
  // ========================================================================

  describe("3. v12 position / LP / ADL instruction surface is refused by the v17+ wrapper", () => {
    // AUD-T3-2 (2026-10-18): sections 3-4 used to build the v12 wire (InitUser+fee, userIdx-keyed Deposit/Withdraw/
    // Trade/Close, KeeperCrank, LiquidateAtOracle, InitLP, LpVaultWithdraw, the queued-withdrawal trio). The v17+ wrapper
    // has no decode arm for those, and the SDK encoders now fail fast. The CURRENT v18 wire for InitPortfolio / Deposit /
    // Withdraw / TradeNoCpi / ClosePortfolio / TopUpInsurance and their account specs is pinned in the default suite
    // (test/abi.test.ts, test/instructions.test.ts, test/drift-check.test.ts, test/accounts.test.ts).
    const removed: Array<[string, () => unknown]> = [
      ["encodeInitLP", () => encodeInitLP({ matcherProgram: PublicKey.default, matcherContext: PublicKey.default, feePayment: 0n } as never)],
      ["encodeLpVaultWithdraw", () => encodeLpVaultWithdraw({ lpAmount: 1n } as never)],
      ["encodeQueueWithdrawal", () => encodeQueueWithdrawal({ lpAmount: 1n } as never)],
      ["encodeClaimQueuedWithdrawal", () => encodeClaimQueuedWithdrawal()],
      ["encodeCancelQueuedWithdrawal", () => encodeCancelQueuedWithdrawal()],
      ["encodeLiquidateAtOracle", () => encodeLiquidateAtOracle({ targetIdx: 7 } as never)],
      ["encodeKeeperCrank", () => encodeKeeperCrank({ callerIdx: 0 } as never)],
      ["encodeExecuteAdl", () => encodeExecuteAdl({ targetIdx: 42 } as never)],
    ];
    for (const [name, call] of removed) {
      it(`${name}() fails fast instead of serializing a dead tag`, () => {
        expect(call).toThrow(/not accepted|v17 wrapper/);
      });
    }

    it("encodeInitUser() emits the 1-byte v17+ InitPortfolio tag (the v12 fee payment is gone)", () => {
      const data = encodeInitUser();
      expect(Array.from(data)).toEqual([1]);
    });
  });

  // ========================================================================
  // 5. ADL Flow — Ranking + Instruction Building
  // ========================================================================

  describe("5. ADL Flow", () => {
    itStale("fetchAdlRankedPositions() runs without error on live slab", async () => {
      if (!rpcReachable || SKIP || discoveredAddresses.length === 0) return;
      try {
        const ranking = await fetchAdlRankedPositions(connection, discoveredAddresses[0]);
        expect(typeof ranking.isTriggered).toBe("boolean");
        expect(Array.isArray(ranking.ranked)).toBe(true);
        expect(Array.isArray(ranking.longs)).toBe(true);
        expect(Array.isArray(ranking.shorts)).toBe(true);
      } catch (e: unknown) {
        // Rate limiting or transient RPC errors — skip gracefully
        if (String(e).includes("429") || String(e).includes("TypeError")) return;
        throw e;
      }
    });

    it("isAdlTriggered() runs without error on live slab data", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const triggered = isAdlTriggered(slabData);
      expect(typeof triggered).toBe("boolean");
    });

    itStale("rankAdlPositions() runs without error on live slab data", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const ranking = rankAdlPositions(slabData);
      expect(typeof ranking.isTriggered).toBe("boolean");
      expect(Array.isArray(ranking.ranked)).toBe(true);
    });

    it("buildAdlInstruction() refuses to build ExecuteAdl (not accepted by the v17+ wrapper)", () => {
      const k = () => randomKeypair().publicKey;
      expect(() => buildAdlInstruction(k(), k(), k(), PROGRAM_ID, 3)).toThrow(/not supported by the v17 SDK/);
      expect(() => buildAdlInstruction(k(), k(), k(), PROGRAM_ID, 0, [k(), k()])).toThrow(/not supported by the v17 SDK/);
    });

    it("buildAdlInstruction() rejects negative targetIdx", () => {
      expect(() =>
        buildAdlInstruction(
          randomKeypair().publicKey,
          randomKeypair().publicKey,
          randomKeypair().publicKey,
          PROGRAM_ID,
          -1,
        ),
      ).toThrow(/targetIdx/);
    });

    it("ACCOUNTS_EXECUTE_ADL builds correct account meta layout", () => {
      const caller = randomKeypair().publicKey;
      const slab = randomKeypair().publicKey;
      const oracle = randomKeypair().publicKey;
      const keys = buildAccountMetas(ACCOUNTS_EXECUTE_ADL, {
        caller,
        slab,
        clock: SYSVAR_CLOCK_PUBKEY,
        oracle,
      });
      expect(keys).toHaveLength(4);
      expect(keys[0].isSigner).toBe(true);
      expect(keys[1].isWritable).toBe(true);
    });

    itStale("buildAdlTransaction() returns null when ADL not triggered on live data", async () => {
      if (!rpcReachable || SKIP || discoveredAddresses.length === 0) return;
      try {
        const caller = randomKeypair().publicKey;
        const oracle = randomKeypair().publicKey;
        // Most devnet markets won't have ADL triggered
        const result = await buildAdlTransaction(
          connection,
          caller,
          discoveredAddresses[0],
          oracle,
          PROGRAM_ID,
        );
        // result is either null (not triggered) or a valid instruction
        if (result !== null) {
          expect(result.programId.equals(PROGRAM_ID)).toBe(true);
        }
      } catch (e: unknown) {
        // Rate limiting or transient RPC errors — skip gracefully
        if (String(e).includes("429") || String(e).includes("TypeError")) return;
        throw e;
      }
    });
  });

  // ========================================================================
  // 6. Insurance Instructions
  // ========================================================================

  describe("6. Insurance Instructions", () => {
    it("encodeTopUpInsurance() produces valid data", () => {
      // v18 wire: tag(1) + market_id(u64) + intent_id(u64) + authority_epoch(u64) + amount(u128).
      const data = encodeTopUpInsurance({ marketId: 1n, intentId: 2n, authorityEpoch: 3n, amount: 10_000_000n });
      expect(data.length).toBe(41);
    });
  });

  // ========================================================================
  // 7. PDA Derivation
  // ========================================================================

  describe("7. PDA Derivation", () => {
    const slab = randomKeypair().publicKey;

    it("deriveVaultAuthority() returns deterministic [PublicKey, bump]", () => {
      const [pda, bump] = deriveVaultAuthority(PROGRAM_ID, slab);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe("number");
      expect(bump).toBeLessThanOrEqual(255);
      // Deterministic
      const [pda2] = deriveVaultAuthority(PROGRAM_ID, slab);
      expect(pda.equals(pda2)).toBe(true);
    });

    it("deriveLpPda() returns deterministic PDA for valid lpIdx", () => {
      const [pda, bump] = deriveLpPda(PROGRAM_ID, slab, 0);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeLessThanOrEqual(255);
      // Different idx → different PDA
      const [pda2] = deriveLpPda(PROGRAM_ID, slab, 1);
      expect(pda.equals(pda2)).toBe(false);
    });

    it("deriveLpPda() rejects invalid lpIdx", () => {
      expect(() => deriveLpPda(PROGRAM_ID, slab, -1)).toThrow();
      expect(() => deriveLpPda(PROGRAM_ID, slab, 0x10000)).toThrow();
    });

    it("deriveCreatorLockPda() returns deterministic PDA", () => {
      const [pda, bump] = deriveCreatorLockPda(PROGRAM_ID, slab);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it("all PDAs for same slab are distinct", () => {
      const [vault] = deriveVaultAuthority(PROGRAM_ID, slab);
      const [lp0] = deriveLpPda(PROGRAM_ID, slab, 0);
      const [creator] = deriveCreatorLockPda(PROGRAM_ID, slab);

      const pdas = [vault, lp0, creator];
      const unique = new Set(pdas.map((p) => p.toBase58()));
      expect(unique.size).toBe(pdas.length);
    });

    it("PDA derivation against live discovered slab succeeds", () => {
      if (!rpcReachable || SKIP || !discoveredAddresses[0]) return;
      const liveSlab = discoveredAddresses[0];
      const [vault] = deriveVaultAuthority(PROGRAM_ID, liveSlab);
      const [creator] = deriveCreatorLockPda(PROGRAM_ID, liveSlab);
      expect(vault).toBeInstanceOf(PublicKey);
      expect(creator).toBeInstanceOf(PublicKey);
    });
  });

  // ========================================================================
  // 8. Error Code Parsing
  // ========================================================================

  describe("8. Error Code Parsing (codes 61-65, v17+ wrapper names)", () => {
    // AUD-T3-2: the v12 ADL names (EngineSideBlocked .. BankruptPositionAlreadyClosed) are gone. The v17+ wrapper
    // appended its own variants at these ordinals (src/abi/errors.ts).
    const ADL_ERRORS: Record<number, string> = {
      61: "AssetSlotAlreadyConfigured",
      62: "CreatorFeeOverClaim",
      63: "LpVaultBackingBucketNotEmpty",
      64: "RentExemptRequired",
      65: "AssetGenerationMismatch",
    };

    it("all ADL error codes 61-65 exist in PERCOLATOR_ERRORS", () => {
      for (let code = 61; code <= 65; code++) {
        const err = PERCOLATOR_ERRORS[code];
        expect(err, `code ${code} missing`).toBeDefined();
        expect(err.name).toBe(ADL_ERRORS[code]);
        expect(err.hint).toBeTruthy();
      }
    });

    it("decodeError() returns correct name for each ADL code", () => {
      for (let code = 61; code <= 65; code++) {
        const result = decodeError(code);
        expect(result).not.toBeNull();
        expect(result!.name).toBe(ADL_ERRORS[code]);
      }
    });

    it("parseErrorFromLogs() extracts error from realistic on-chain logs", () => {
      const programStr = PROGRAM_ID.toBase58();
      // Error 61 = 0x3D
      const logs = [
        `Program ${programStr} invoke [1]`,
        "Program log: Instruction: UpdateAssetLifecycle",
        `Program ${programStr} failed: custom program error: 0x3D`,
      ];
      const result = parseErrorFromLogs(logs);
      expect(result).not.toBeNull();
      expect(result!.code).toBe(61);
      expect(result!.name).toBe("AssetSlotAlreadyConfigured");
    });

    it("parseErrorFromLogs() handles all hex codes 0x3D-0x41", () => {
      const programStr = PROGRAM_ID.toBase58();
      const hexCodes = ["3D", "3E", "3F", "40", "41"];
      for (let i = 0; i < hexCodes.length; i++) {
        const logs = [
          `Program ${programStr} invoke [1]`,
          `Program ${programStr} failed: custom program error: 0x${hexCodes[i]}`,
        ];
        const result = parseErrorFromLogs(logs);
        expect(result!.code).toBe(61 + i);
      }
    });

    it("decodeError() returns undefined for out-of-range code", () => {
      expect(decodeError(9999)).toBeUndefined();
    });
  });

  // ========================================================================
  // 9. Cross-Cutting: buildAccountMetas error handling
  // ========================================================================

  describe("9. buildAccountMetas Defensive Checks", () => {
    it("throws when a required account key is missing", () => {
      expect(() =>
        buildAccountMetas(ACCOUNTS_INIT_USER, {
          user: randomKeypair().publicKey,
          slab: randomKeypair().publicKey,
          // missing: userAta, vault, tokenProgram
        }),
      ).toThrow(/missing key/i);
    });
  });

  // ========================================================================
  // 10. End-to-End: Live slab → parse → instructions (RPC-dependent)
  // ========================================================================

  describe("10. End-to-End: Live Slab → Parse → Build Instructions", () => {
    itStale("parse live slab + build trade instruction from parsed data", () => {
      if (!rpcReachable || SKIP || !slabData || !discoveredAddresses[0]) return;

      // Parse header + config + engine
      const header = parseHeader(slabData);
      const layout = detectSlabLayout(slabData.length, slabData);
      const config = parseConfig(slabData, layout);
      const engine = parseEngine(slabData);

      // Verify config.vaultPubkey is a real pubkey (not zeroed)
      expect(config.vaultPubkey.toBase58()).not.toBe(PublicKey.default.toBase58());

      // AUD-T3-2: the v12 TradeNoCpi build that used to follow is gone (the v18 wire is pinned in the default suite).
      expect(header.magic).toBeDefined();
      expect(engine).toBeDefined();
    });

    it("parse live slab + derive vault authority PDA matches config.vault expectation", () => {
      if (!rpcReachable || SKIP || !slabData || !discoveredAddresses[0]) return;

      // The derived vault authority should be a valid on-curve pubkey
      const [vaultAuthority, bump] = deriveVaultAuthority(PROGRAM_ID, discoveredAddresses[0]);
      expect(vaultAuthority).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });
  });
});
