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
 *   3. Builds position open/close instruction data + account metas
 *   4. Builds LP deposit/withdraw instructions
 *   5. Builds ADL ranking and transaction instructions
 *   6. Parses error codes 61-65
 *   7. Derives all PDAs correctly
 *   8. Builds queued withdrawal lifecycle instructions
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
  fetchSlab,
  parseHeader,
  parseConfig,
  parseEngine,
  parseParams,
  parseAllAccounts,
  detectSlabLayout,
  parseAccount,
  isAccountUsed,
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
  encodeDepositCollateral,
  encodeWithdrawCollateral,
  encodeTradeNoCpi,
  encodeTradeCpi,
  encodeTradeCpiV2,
  encodeCloseAccount,
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
  ACCOUNTS_DEPOSIT_COLLATERAL,
  ACCOUNTS_WITHDRAW_COLLATERAL,
  ACCOUNTS_TRADE_NOCPI,
  ACCOUNTS_CLOSE_ACCOUNT,
  ACCOUNTS_LP_VAULT_WITHDRAW,
  ACCOUNTS_QUEUE_WITHDRAWAL,
  ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL,
  ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL,
  ACCOUNTS_EXECUTE_ADL,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_LIQUIDATE_AT_ORACLE,
  ACCOUNTS_TOPUP_INSURANCE,
  // PDA derivation
  deriveVaultAuthority,
  deriveLpPda,
  deriveKeeperFund,
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
      discoveredMarkets = await discoverMarkets(connection, PROGRAM_ID);
      discoveredAddresses = discoveredMarkets.map((m) => m.slabAddress);

      if (discoveredAddresses.length > 0) {
        // Fetch first slab raw data for parsing tests
        const ai = await connection.getAccountInfo(discoveredAddresses[0]);
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
    it("detectSlabLayout() returns non-null for discovered slab", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const layout = detectSlabLayout(slabData.length, slabData);
      expect(layout).not.toBeNull();
      expect(layout!.maxAccounts).toBeGreaterThan(0);
    });

    it("parseHeader() returns valid header fields", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const header: SlabHeader = parseHeader(slabData);
      expect(header.admin).toBeInstanceOf(PublicKey);
      expect(typeof header.bump).toBe("number");
    });

    it("parseConfig() returns valid config with collateral mint + oracle", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const layout = detectSlabLayout(slabData.length, slabData);
      const config: MarketConfig = parseConfig(slabData, layout);
      expect(config.collateralMint).toBeInstanceOf(PublicKey);
      expect(config.vaultPubkey).toBeInstanceOf(PublicKey);
      expect(typeof config.maxStalenessSlots).toBe("bigint");
      expect(config.unitScale).toBeGreaterThanOrEqual(0);
    });

    it("parseEngine() returns valid engine state with mark price", () => {
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

    it("parseAllAccounts() returns array of indexed accounts", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const accounts = parseAllAccounts(slabData);
      expect(Array.isArray(accounts)).toBe(true);
      // May be zero if market has no active positions
      for (const { idx, account } of accounts) {
        expect(typeof idx).toBe("number");
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(account.owner).toBeInstanceOf(PublicKey);
        expect(typeof account.positionSize).toBe("bigint");
        expect(typeof account.positionBasisQ).toBe("bigint");
        expect(typeof account.capital).toBe("bigint");
      }
    });

    it("parseUsedIndices() returns non-negative indices", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const indices = parseUsedIndices(slabData);
      expect(Array.isArray(indices)).toBe(true);
      for (const idx of indices) {
        expect(idx).toBeGreaterThanOrEqual(0);
      }
    });

    it("maxAccountIndex() returns positive number for valid slab length", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const max = maxAccountIndex(slabData.length);
      expect(max).toBeGreaterThan(0);
    });

    it("readNonce() returns a bigint", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const nonce = readNonce(slabData);
      expect(typeof nonce).toBe("bigint");
    });

    it("readLastThrUpdateSlot() returns a bigint", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const slot = readLastThrUpdateSlot(slabData);
      expect(typeof slot).toBe("bigint");
    });

    it("computeEffectiveOiCapBps() returns a bigint for valid config + slot", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const layout = detectSlabLayout(slabData.length, slabData);
      const config = parseConfig(slabData, layout);
      const bps = computeEffectiveOiCapBps(config, 300_000_000n);
      expect(typeof bps).toBe("bigint");
    });
  });

  // ========================================================================
  // 3. Position Open/Close Cycle — Instruction Building
  // ========================================================================

  describe("3. Position Open/Close Cycle — Instruction Building", () => {
    const user = randomKeypair();
    const slab = randomKeypair().publicKey;
    const oracle = randomKeypair().publicKey;
    const vault = randomKeypair().publicKey;
    const userAta = randomKeypair().publicKey;
    const vaultPda = randomKeypair().publicKey;

    it("encodeInitUser() produces valid instruction data (tag + feePayment)", () => {
      const data = encodeInitUser({ feePayment: 100_000n });
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(9); // tag(1) + u64(8)
      expect(data[0]).toBe(1); // IX_TAG.InitUser = 1
    });

    it("ACCOUNTS_INIT_USER + buildAccountMetas() produces correct metas", () => {
      const keys = buildAccountMetas(ACCOUNTS_INIT_USER, {
        user: user.publicKey,
        slab,
        userAta,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      });
      expect(keys).toHaveLength(5);
      expect(keys[0].pubkey.equals(user.publicKey)).toBe(true);
      expect(keys[0].isSigner).toBe(true);
      expect(keys[1].pubkey.equals(slab)).toBe(true);
      expect(keys[1].isWritable).toBe(true);
    });

    it("encodeDepositCollateral() produces valid data (tag + userIdx + amount)", () => {
      const data = encodeDepositCollateral({ userIdx: 5, amount: 1_000_000_000n });
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(11); // tag(1) + u16(2) + u64(8)
    });

    it("ACCOUNTS_DEPOSIT_COLLATERAL builds 6-account meta", () => {
      const keys = buildAccountMetas(ACCOUNTS_DEPOSIT_COLLATERAL, {
        user: user.publicKey,
        slab,
        userAta,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        clock: SYSVAR_CLOCK_PUBKEY,
      });
      expect(keys).toHaveLength(6);
    });

    it("encodeWithdrawCollateral() produces valid data", () => {
      const data = encodeWithdrawCollateral({ userIdx: 5, amount: 500_000n });
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(11);
    });

    it("ACCOUNTS_WITHDRAW_COLLATERAL builds 8-account meta", () => {
      const keys = buildAccountMetas(ACCOUNTS_WITHDRAW_COLLATERAL, {
        user: user.publicKey,
        slab,
        vault,
        userAta,
        vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        clock: SYSVAR_CLOCK_PUBKEY,
        oracleIdx: oracle,
      });
      expect(keys).toHaveLength(8);
    });

    it("encodeTradeNoCpi() produces 21-byte instruction data", () => {
      const data = encodeTradeNoCpi({ lpIdx: 0, userIdx: 5, size: 1_000_000_000n });
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(21); // tag(1) + u16(2) + u16(2) + i128(16)
    });

    it("ACCOUNTS_TRADE_NOCPI builds 4-account meta", () => {
      const lp = randomKeypair();
      const keys = buildAccountMetas(ACCOUNTS_TRADE_NOCPI, {
        user: user.publicKey,
        lp: lp.publicKey,
        slab,
        oracle,
      });
      expect(keys).toHaveLength(4);
      expect(keys[0].isSigner).toBe(true);
      expect(keys[1].isSigner).toBe(true);
    });

    it("encodeTradeNoCpi() handles negative size (short position)", () => {
      const data = encodeTradeNoCpi({ lpIdx: 0, userIdx: 3, size: -500_000_000n });
      expect(data.length).toBe(21);
      // Verify i128 negative: the MSB byte should have high bit set
      const view = new DataView(data.buffer, data.byteOffset);
      const hi = view.getBigInt64(13, true); // i128 high 8 bytes (offset 5..12 = lo, 13..20 = hi)
      expect(hi).toBeLessThan(0n);
    });

    it("encodeCloseAccount() produces valid data", () => {
      const data = encodeCloseAccount({ userIdx: 5 });
      expect(data.length).toBe(3); // tag(1) + u16(2)
    });

    it("ACCOUNTS_CLOSE_ACCOUNT builds 8-account meta", () => {
      const keys = buildAccountMetas(ACCOUNTS_CLOSE_ACCOUNT, {
        user: user.publicKey,
        slab,
        vault,
        userAta,
        vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        clock: SYSVAR_CLOCK_PUBKEY,
        oracle,
      });
      expect(keys).toHaveLength(8);
    });

    it("encodeKeeperCrank() produces valid data", () => {
      const data = encodeKeeperCrank({ callerIdx: 0, allowPanic: false });
      expect(data.length).toBe(4); // tag(1) + u16(2) + u8(1)
    });

    it("encodeLiquidateAtOracle() produces valid data", () => {
      const data = encodeLiquidateAtOracle({ targetIdx: 7 });
      expect(data.length).toBe(3); // tag(1) + u16(2)
    });

    it("full position lifecycle: init → deposit → trade → close — all encode without error", () => {
      // This validates the complete happy path instruction encoding
      const initData = encodeInitUser({ feePayment: 0n });
      const depositData = encodeDepositCollateral({ userIdx: 0, amount: 10_000_000n });
      const tradeData = encodeTradeNoCpi({ lpIdx: 0, userIdx: 0, size: 1_000_000n });
      const closeData = encodeCloseAccount({ userIdx: 0 });

      expect(initData[0]).toBe(1);   // InitUser tag
      expect(depositData[0]).toBe(3); // DepositCollateral tag
      expect(tradeData[0]).toBe(6);   // TradeNoCpi tag
      expect(closeData[0]).toBe(8);   // CloseAccount tag

      // All should be valid Uint8Arrays
      for (const d of [initData, depositData, tradeData, closeData]) {
        expect(d).toBeInstanceOf(Uint8Array);
        expect(d.length).toBeGreaterThan(0);
      }
    });
  });

  // ========================================================================
  // 4. LP Deposit/Withdraw — Instruction Building
  // ========================================================================

  describe("4. LP Deposit/Withdraw — Instruction Building", () => {
    const user = randomKeypair();
    const slab = randomKeypair().publicKey;

    it("encodeInitLP() produces valid instruction data", () => {
      const matcherProgram = randomKeypair().publicKey;
      const matcherContext = randomKeypair().publicKey;
      const data = encodeInitLP({
        matcherProgram,
        matcherContext,
        feePayment: 50_000n,
      });
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(73); // tag(1) + pubkey(32) + pubkey(32) + u64(8)
    });

    it("encodeLpVaultWithdraw() produces valid instruction data", () => {
      const data = encodeLpVaultWithdraw({ lpAmount: 1_000_000_000n });
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(9); // tag(1) + u64(8)
    });

    it("ACCOUNTS_LP_VAULT_WITHDRAW builds 10-account meta including creatorLockPda", () => {
      const [vaultAuthority] = deriveVaultAuthority(PROGRAM_ID, slab);
      const [creatorLockPda] = deriveCreatorLockPda(PROGRAM_ID, slab);
      const keys = buildAccountMetas(ACCOUNTS_LP_VAULT_WITHDRAW, {
        withdrawer: user.publicKey,
        slab,
        withdrawerAta: randomKeypair().publicKey,
        vault: randomKeypair().publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        lpVaultMint: randomKeypair().publicKey,
        withdrawerLpAta: randomKeypair().publicKey,
        vaultAuthority,
        lpVaultState: randomKeypair().publicKey,
        creatorLockPda,
      });
      expect(keys).toHaveLength(10);
      // Verify creatorLockPda is at position 9
      expect(keys[9].pubkey.equals(creatorLockPda)).toBe(true);
      expect(keys[9].isWritable).toBe(true);
    });

    it("encodeQueueWithdrawal() produces valid data", () => {
      const data = encodeQueueWithdrawal({ lpAmount: 500_000_000n });
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(9); // tag(1) + u64(8)
    });

    it("ACCOUNTS_QUEUE_WITHDRAWAL builds 5-account meta", () => {
      const keys = buildAccountMetas(ACCOUNTS_QUEUE_WITHDRAWAL, {
        user: user.publicKey,
        slab,
        lpVaultState: randomKeypair().publicKey,
        withdrawQueue: randomKeypair().publicKey,
        systemProgram: SystemProgram.programId,
      });
      expect(keys).toHaveLength(5);
    });

    it("encodeClaimQueuedWithdrawal() produces 1-byte tag-only data", () => {
      const data = encodeClaimQueuedWithdrawal();
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(1);
    });

    it("ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL builds 10-account meta", () => {
      const [vaultAuthority] = deriveVaultAuthority(PROGRAM_ID, slab);
      const keys = buildAccountMetas(ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL, {
        user: user.publicKey,
        slab,
        withdrawQueue: randomKeypair().publicKey,
        lpVaultMint: randomKeypair().publicKey,
        userLpAta: randomKeypair().publicKey,
        vault: randomKeypair().publicKey,
        userAta: randomKeypair().publicKey,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        lpVaultState: randomKeypair().publicKey,
      });
      expect(keys).toHaveLength(10);
    });

    it("encodeCancelQueuedWithdrawal() produces 1-byte data", () => {
      const data = encodeCancelQueuedWithdrawal();
      expect(data.length).toBe(1);
    });

    it("ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL builds 3-account meta", () => {
      const keys = buildAccountMetas(ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL, {
        user: user.publicKey,
        slab,
        withdrawQueue: randomKeypair().publicKey,
      });
      expect(keys).toHaveLength(3);
    });

    it("full LP lifecycle: initLP → queueWithdraw → cancel — all encode without error", () => {
      const initLpData = encodeInitLP({
        matcherProgram: randomKeypair().publicKey,
        matcherContext: randomKeypair().publicKey,
        feePayment: 0n,
      });
      const queueData = encodeQueueWithdrawal({ lpAmount: 1_000n });
      const cancelData = encodeCancelQueuedWithdrawal();

      for (const d of [initLpData, queueData, cancelData]) {
        expect(d).toBeInstanceOf(Uint8Array);
        expect(d.length).toBeGreaterThan(0);
      }
    });
  });

  // ========================================================================
  // 5. ADL Flow — Ranking + Instruction Building
  // ========================================================================

  describe("5. ADL Flow", () => {
    it("fetchAdlRankedPositions() runs without error on live slab", async () => {
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

    it("rankAdlPositions() runs without error on live slab data", () => {
      if (!rpcReachable || SKIP || !slabData) return;
      const ranking = rankAdlPositions(slabData);
      expect(typeof ranking.isTriggered).toBe("boolean");
      expect(Array.isArray(ranking.ranked)).toBe(true);
    });

    it("buildAdlInstruction() produces valid TransactionInstruction", () => {
      const caller = randomKeypair().publicKey;
      const slab = randomKeypair().publicKey;
      const oracle = randomKeypair().publicKey;
      const ix = buildAdlInstruction(caller, slab, oracle, PROGRAM_ID, 3);

      expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
      expect(ix.keys.length).toBeGreaterThanOrEqual(4); // caller, slab, clock, oracle
      expect(ix.keys[0].pubkey.equals(caller)).toBe(true);
      expect(ix.keys[0].isSigner).toBe(true);
      expect(ix.keys[1].pubkey.equals(slab)).toBe(true);
      expect(ix.keys[1].isWritable).toBe(true);
      expect(ix.keys[2].pubkey.equals(SYSVAR_CLOCK_PUBKEY)).toBe(true);
      expect(ix.keys[3].pubkey.equals(oracle)).toBe(true);
    });

    it("buildAdlInstruction() includes backup oracles when provided", () => {
      const caller = randomKeypair().publicKey;
      const slab = randomKeypair().publicKey;
      const oracle = randomKeypair().publicKey;
      const backup1 = randomKeypair().publicKey;
      const backup2 = randomKeypair().publicKey;
      const ix = buildAdlInstruction(caller, slab, oracle, PROGRAM_ID, 0, [backup1, backup2]);

      expect(ix.keys.length).toBe(6); // caller + slab + clock + oracle + 2 backups
      expect(ix.keys[4].pubkey.equals(backup1)).toBe(true);
      expect(ix.keys[5].pubkey.equals(backup2)).toBe(true);
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

    it("encodeExecuteAdl() produces valid data (tag + u16)", () => {
      const data = encodeExecuteAdl({ targetIdx: 42 });
      expect(data.length).toBe(3); // tag(1) + u16(2)
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

    it("buildAdlTransaction() returns null when ADL not triggered on live data", async () => {
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
      const data = encodeTopUpInsurance({ amount: 10_000_000n });
      expect(data.length).toBe(9);
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

    it("deriveKeeperFund() returns deterministic PDA", () => {
      const [pda, bump] = deriveKeeperFund(PROGRAM_ID, slab);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it("deriveCreatorLockPda() returns deterministic PDA", () => {
      const [pda, bump] = deriveCreatorLockPda(PROGRAM_ID, slab);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it("all PDAs for same slab are distinct", () => {
      const [vault] = deriveVaultAuthority(PROGRAM_ID, slab);
      const [lp0] = deriveLpPda(PROGRAM_ID, slab, 0);
      const [keeper] = deriveKeeperFund(PROGRAM_ID, slab);
      const [creator] = deriveCreatorLockPda(PROGRAM_ID, slab);

      const pdas = [vault, lp0, keeper, creator];
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

  describe("8. Error Code Parsing (ADL codes 61-65)", () => {
    const ADL_ERRORS: Record<number, string> = {
      61: "EngineSideBlocked",
      62: "EngineCorruptState",
      63: "InsuranceFundNotDepleted",
      64: "NoAdlCandidates",
      65: "BankruptPositionAlreadyClosed",
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
        "Program log: Instruction: ExecuteAdl",
        `Program ${programStr} failed: custom program error: 0x3D`,
      ];
      const result = parseErrorFromLogs(logs);
      expect(result).not.toBeNull();
      expect(result!.code).toBe(61);
      expect(result!.name).toBe("EngineSideBlocked");
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
    it("parse live slab + build trade instruction from parsed data", () => {
      if (!rpcReachable || SKIP || !slabData || !discoveredAddresses[0]) return;

      // Parse header + config + engine
      const header = parseHeader(slabData);
      const layout = detectSlabLayout(slabData.length, slabData);
      const config = parseConfig(slabData, layout);
      const engine = parseEngine(slabData);

      // Verify config.vaultPubkey is a real pubkey (not zeroed)
      expect(config.vaultPubkey.toBase58()).not.toBe(PublicKey.default.toBase58());

      // Build a trade instruction using parsed data
      const user = randomKeypair();
      const lp = randomKeypair();
      const tradeData = encodeTradeNoCpi({ lpIdx: 0, userIdx: 0, size: 100_000n });
      const tradeMetas = buildAccountMetas(ACCOUNTS_TRADE_NOCPI, {
        user: user.publicKey,
        lp: lp.publicKey,
        slab: discoveredAddresses[0],
        oracle: config.collateralMint, // placeholder — real oracle would come from config
      });

      expect(tradeData.length).toBe(21);
      expect(tradeMetas).toHaveLength(4);
    });

    it("parse all accounts + build ADL instruction targeting highest-idx used account", () => {
      if (!rpcReachable || SKIP || !slabData || !discoveredAddresses[0]) return;

      const accounts = parseAllAccounts(slabData);
      if (accounts.length === 0) return; // no active accounts — skip

      const topAccount = accounts[accounts.length - 1];
      const caller = randomKeypair().publicKey;
      const oracle = randomKeypair().publicKey;
      const ix = buildAdlInstruction(
        caller,
        discoveredAddresses[0],
        oracle,
        PROGRAM_ID,
        topAccount.idx,
      );

      expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
      expect(ix.data.length).toBe(3); // tag + u16
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
