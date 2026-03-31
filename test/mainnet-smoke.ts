/**
 * PERC-8318: SDK mainnet readiness smoke test
 *
 * Tests SDK functions against the mainnet-beta public RPC.
 * Checks: discoverMarkets, fetchAdlRankedPositions, buildAdlTransaction,
 * error code parsing.
 *
 * Run: tsx test/mainnet-smoke.ts
 */

import {
  Connection,
  PublicKey,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  discoverMarkets,
  fetchAdlRankedPositions,
  buildAdlInstruction,
  decodeError,
  parseErrorFromLogs,
  getProgramId,
} from "../src/index.js";

const MAINNET_RPC = process.env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const PROGRAM_ID = getProgramId("mainnet");

type TestResult = { pass: boolean; detail: string };

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { pass: true, detail: "OK" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { pass: false, detail: msg };
  }
}

async function main() {
  console.log("=== PERC-8318: SDK Mainnet Smoke Test ===");
  console.log(`RPC: ${MAINNET_RPC}`);
  console.log(`Program ID (mainnet): ${PROGRAM_ID.toBase58()}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("");

  const connection = new Connection(MAINNET_RPC, {
    commitment: "confirmed",
    httpHeaders: { "Content-Type": "application/json" },
  });

  const results: Record<string, TestResult> = {};

  // ── Test 1: discoverMarkets() — no 429 under concurrency cap ──────────────
  let discoveredMarkets: PublicKey[] = [];
  results["discoverMarkets()"] = await runTest("discoverMarkets()", async () => {
    const start = Date.now();
    const markets = await discoverMarkets(connection, PROGRAM_ID, {
      maxParallelTiers: 4, // cap per PERC-8317 fix
    });
    const elapsed = Date.now() - start;
    if (markets.length === 0) {
      throw new Error(`Returned 0 markets (${elapsed}ms) — possible RPC issue or no mainnet markets yet`);
    }
    discoveredMarkets = markets.map((m) => m.slabAddress);
    console.log(`  → Found ${markets.length} market(s) in ${elapsed}ms`);
    for (const m of markets.slice(0, 3)) {
      console.log(`    slab: ${m.slabAddress.toBase58()}`);
    }
  });

  // ── Test 2: fetchAdlRankedPositions() — returns valid data or empty ────────
  results["fetchAdlRankedPositions()"] = await runTest("fetchAdlRankedPositions()", async () => {
    if (discoveredMarkets.length === 0) {
      throw new Error("Skipped — discoverMarkets returned 0 markets");
    }
    const slabKey = discoveredMarkets[0];
    const start = Date.now();
    const result = await fetchAdlRankedPositions(connection, slabKey);
    const elapsed = Date.now() - start;
    console.log(`  → slab: ${slabKey.toBase58()}`);
    console.log(`  → isTriggered: ${result.isTriggered}`);
    console.log(`  → ranked positions: ${result.ranked.length} (${elapsed}ms)`);
    if (result.ranked.length > 0) {
      const top = result.ranked[0];
      console.log(`  → top position: idx=${top.idx} side=${top.side} pnlPct=${top.pnlPct}`);
    }
    // Structural checks
    if (!("ranked" in result && "longs" in result && "shorts" in result)) {
      throw new Error("Missing required fields in AdlRankingResult");
    }
  });

  // ── Test 3: buildAdlInstruction() — builds valid instruction + VersionedTx ──
  results["buildAdlInstruction() → VersionedTransaction"] = await runTest(
    "buildAdlInstruction() → VersionedTransaction",
    async () => {
      if (discoveredMarkets.length === 0) {
        throw new Error("Skipped — discoverMarkets returned 0 markets");
      }
      const slabKey = discoveredMarkets[0];
      const callerKeypair = Keypair.generate(); // ephemeral — not signing
      const oracleFeedKey = new PublicKey("H6ARHf6YXhGYeQfUzQNGFQt2GK6PvD7kGZgbpreZm3AN"); // SOL/USD Pyth mainnet

      // Build instruction
      const ix = buildAdlInstruction(
        callerKeypair.publicKey,
        slabKey,
        oracleFeedKey,
        PROGRAM_ID,
        0, // targetIdx=0 (just building — not submitting)
      );
      if (!ix) throw new Error("buildAdlInstruction returned null/undefined");
      if (ix.programId.toBase58() !== PROGRAM_ID.toBase58()) {
        throw new Error(`Instruction programId mismatch: ${ix.programId.toBase58()}`);
      }
      if (ix.keys.length < 3) {
        throw new Error(`Expected ≥3 account keys, got ${ix.keys.length}`);
      }

      // Wrap into a VersionedTransaction (v0)
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const msg = new TransactionMessage({
        payerKey: callerKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message();
      const vtx = new VersionedTransaction(msg);
      const bytes = vtx.serialize();
      if (bytes.length < 64) {
        throw new Error(`Serialized VersionedTransaction too small: ${bytes.length} bytes`);
      }
      console.log(
        `  → ADL instruction built: ${ix.keys.length} accounts, tx=${bytes.length} bytes`,
      );
    },
  );

  // ── Test 4: Error codes 61–65 exported and parsed correctly ───────────────
  results["Error codes 61–65"] = await runTest("Error codes 61–65", async () => {
    const expected: Record<number, string> = {
      61: "EngineSideBlocked",
      62: "EngineCorruptState",
      63: "InsuranceFundNotDepleted",
      64: "NoAdlCandidates",
      65: "BankruptPositionAlreadyClosed",
    };
    for (const [code, name] of Object.entries(expected)) {
      const info = decodeError(Number(code));
      if (!info) throw new Error(`decodeError(${code}) returned undefined — not exported`);
      if (info.name !== name) throw new Error(`decodeError(${code}).name = "${info.name}", expected "${name}"`);
      if (!info.hint || info.hint.length < 5) throw new Error(`decodeError(${code}).hint is missing or too short`);
    }

    // Verify parseErrorFromLogs picks up ADL errors from log strings
    const fakeLog = `Program log: Error: custom program error: 0x3f`; // 63 = 0x3f
    const parsed = parseErrorFromLogs([fakeLog]);
    if (!parsed) throw new Error("parseErrorFromLogs failed to extract code from log");
    if (parsed.code !== 63) throw new Error(`parseErrorFromLogs: expected code=63, got ${parsed.code}`);
    if (parsed.name !== "InsuranceFundNotDepleted") throw new Error(`parseErrorFromLogs: name mismatch — ${parsed.name}`);

    console.log(`  → All 5 ADL error codes verified (61–65)`);
    console.log(`  → parseErrorFromLogs correctly decodes 0x3f → InsuranceFundNotDepleted`);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n=== Results ===");
  let allPass = true;
  const failures: string[] = [];
  for (const [name, result] of Object.entries(results)) {
    const status = result.pass ? "✅ PASS" : "❌ FAIL";
    console.log(`${status}  ${name}`);
    if (!result.pass) {
      console.log(`       → ${result.detail}`);
      allPass = false;
      failures.push(`${name}: ${result.detail}`);
    }
  }
  console.log("");
  if (allPass) {
    console.log("✅ All smoke tests passed — SDK is mainnet ready");
    process.exit(0);
  } else {
    console.log(`❌ ${failures.length} test(s) failed — see above for details`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
