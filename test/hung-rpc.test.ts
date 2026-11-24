// Regression tests for J-20261121-SDK-REPORT-HUNGRPCSTALL (~/agent-worker/reports/sdk-hung-rpc-stall-20261120.md).
// Each case points an SDK flow at a local RPC (127.0.0.1 only) that accepts the TCP connection and then never
// answers, or answers only part of the flow, and asserts that the flow SETTLES (resolves or rejects) shortly after
// the deadline the caller asked for. Before the fix the SDK flows took no deadline, so every case was still pending.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { discoverMarkets, getMarketsByAddress } from "../src/solana/discovery.js";
import { fetchSlab } from "../src/solana/slab.js";
import { simulateOrSend } from "../src/runtime/tx.js";
import { sendV1 } from "../src/runtime/txv1.js";
// Namespace import so the file still loads on a base without the new exports (the "fail before" run).
import * as runtime from "../src/runtime/index.js";

/** The deadline each flow is given. */
const DEADLINE_MS = 300;
/** How long the test waits before calling the flow hung. */
const HUNG_AFTER_MS = 3_000;
const TEST_TIMEOUT_MS = 8_000;
/** Overall deadline and settle cap for the two /frozen send cases (see the comment there). */
const FROZEN_OVERALL_MS = 8_000;
const FROZEN_SETTLE_MS = 15_000;
const FROZEN_TEST_TIMEOUT_MS = 20_000;
const HUNG = Symbol("hung");

/** Resolves to HUNG if `p` has neither resolved nor rejected after `ms`. */
async function settleWithin<T>(p: Promise<T>, ms = HUNG_AFTER_MS): Promise<T | Error | typeof HUNG> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<typeof HUNG>((r) => { t = setTimeout(() => r(HUNG), ms); });
  try {
    return await Promise.race([p.then((v) => v, (e) => (e instanceof Error ? e : new Error(String(e)))), cap]);
  } finally {
    clearTimeout(t);
  }
}

// --- fake RPC --------------------------------------------------------------------------------------
// /accept/...  : never writes a byte.
// /headers/... : 200 + headers + the first body bytes, then stalls.
// /frozen/...  : answers getLatestBlockhash + sendTransaction, holds getSignatureStatuses and getBlockHeight.
// /error/...   : answers every request at once with a JSON-RPC error (a dead-but-responsive RPC).
const held = new Set<Socket>();
let server: http.Server;
let base = "";
let h = 0;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = (buf: Uint8Array) => { let n = 0n; for (const b of buf) n = (n << 8n) | BigInt(b); let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b) break; s = "1" + s; } return s; };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const mode = (req.url ?? "/").split("/")[1];
      const msg = JSON.parse(body);
      const reply = (result: unknown) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })); };
      if (mode === "error") {
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32010, message: "stub: method rejected" } }));
      }
      if (mode === "frozen") {
        if (msg.method === "getLatestBlockhash") return reply({ context: { slot: 1 }, value: { blockhash: b58(new Uint8Array(32).fill(++h % 250 + 1)), lastValidBlockHeight: 1_000 } });
        if (msg.method === "sendTransaction") return reply(b58(Buffer.from(msg.params[0], "base64").subarray(1, 65)));
      }
      held.add(req.socket);
      if (mode === "headers") { res.writeHead(200, { "content-type": "application/json" }); res.write('{"jsonrpc":"2.0","id":'); }
      // never end the response
    });
  });
  server.keepAliveTimeout = 0; server.requestTimeout = 0; server.headersTimeout = 0;
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const s of held) s.destroy();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

const PID = new PublicKey("FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD");
const SLAB = new PublicKey("11111111111111111111111111111112");
const payer = Keypair.fromSeed(new Uint8Array(32).fill(1));
const ix = () => new TransactionInstruction({ programId: PID, keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }], data: Buffer.from([0]) });
const dl = { timeoutMs: DEADLINE_MS };

type Flow = { name: string; run: (c: Connection) => Promise<unknown> };
const FLOWS: Flow[] = [
  { name: "discoverMarkets", run: (c) => discoverMarkets(c, PID, dl) },
  { name: "getMarketsByAddress", run: (c) => getMarketsByAddress(c, PID, [SLAB], dl) },
  { name: "fetchSlab (slab/portfolio read)", run: (c) => fetchSlab(c, SLAB, PID, dl) },
  { name: "simulateOrSend simulate:true (quote)", run: (c) => simulateOrSend({ connection: c, ix: ix(), signers: [payer], simulate: true, ...dl }) },
  { name: "simulateOrSend simulate:false (send+confirm)", run: (c) => simulateOrSend({ connection: c, ix: ix(), signers: [payer], simulate: false, ...dl }) },
  {
    name: "sendV1 (raw send)",
    run: async (c) => {
      // The blockhash is built locally: the stalled RPC would never answer getLatestBlockhash.
      const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: b58(new Uint8Array(32).fill(7)) })
        .add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 }));
      tx.sign(payer);
      return sendV1(c, tx.serialize(), dl);
    },
  },
];

const CASES = (["accept", "headers"] as const).flatMap((mode) => FLOWS.map((f) => ({ ...f, mode })));

describe("RPC that stalls: every flow settles soon after its deadline", () => {
  it.concurrent.each(CASES)("$mode: $name", async ({ run, name, mode }) => {
    const c = new Connection(`${base}/${mode}/${encodeURIComponent(name)}`, "confirmed");
    const t0 = Date.now();
    const out = await settleWithin(run(c));
    expect(out, `${name} still pending after ${HUNG_AFTER_MS} ms against a ${mode}-stalled RPC`).not.toBe(HUNG);
    expect(Date.now() - t0).toBeLessThan(HUNG_AFTER_MS);
  }, TEST_TIMEOUT_MS);

  it.concurrent("frozen: simulateOrSend simulate:false settles when getSignatureStatuses and getBlockHeight hang (confirm deadline)", async () => {
    const c = new Connection(`${base}/frozen/send-confirm-deadline`, "confirmed");
    // Frozen cases settle only after a real blockhash + send through web3.js, which is slow on a loaded
    // runner, so they get FROZEN_SETTLE_MS rather than HUNG_AFTER_MS. Without the fix they hang forever.
    const out = await settleWithin(simulateOrSend({ connection: c, ix: ix(), signers: [payer], simulate: false, confirmTimeoutMs: DEADLINE_MS }), FROZEN_SETTLE_MS);
    expect(out, "send+confirm still pending with a frozen RPC").not.toBe(HUNG);
    // The send reached the node, so the result must carry the real signature and say the outcome is unknown.
    const r = out as { signature: string; err: string | null };
    expect(r.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,88}$/);
    expect(r.err).toMatch(/confirmation status unknown/);
  }, FROZEN_TEST_TIMEOUT_MS);

  it.concurrent("frozen: simulateOrSend simulate:false settles under an overall timeoutMs", async () => {
    const c = new Connection(`${base}/frozen/send-overall-deadline`, "confirmed");
    // A roomier deadline than the other cases so that, even on a loaded runner, it passes after the send
    // (blockhash and send are answered at once) and the post-send path is what gets exercised.
    const out = await settleWithin(simulateOrSend({ connection: c, ix: ix(), signers: [payer], simulate: false, timeoutMs: FROZEN_OVERALL_MS }), FROZEN_SETTLE_MS);
    expect(out, "send+confirm still pending with a frozen RPC").not.toBe(HUNG);
    const r = out as { signature: string; err: string | null };
    expect(r.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,88}$/);
    expect(r.err).toMatch(/confirmation status unknown/);
  }, FROZEN_TEST_TIMEOUT_MS);

  it.concurrent("a caller AbortSignal ends a stalled read", async () => {
    const c = new Connection(`${base}/accept/abort-signal`, "confirmed");
    const ac = new AbortController();
    setTimeout(() => ac.abort(), DEADLINE_MS);
    const out = await settleWithin(fetchSlab(c, SLAB, PID, { signal: ac.signal }));
    expect(out).toBeInstanceOf(Error);
    expect((out as Error).name).toBe("RpcDeadlineError");
  }, TEST_TIMEOUT_MS);

  it.concurrent("createTimeoutConnection bounds every call, even ones the SDK does not wrap", async () => {
    const c = runtime.createTimeoutConnection(`${base}/headers/bounded-connection`, { requestTimeoutMs: DEADLINE_MS, commitment: "confirmed" });
    const out = await settleWithin(c.getSlot());
    expect(out).toBeInstanceOf(Error);
  }, TEST_TIMEOUT_MS);
});

describe("discoverMarkets: a scan in which every RPC query failed is an error, not []", () => {
  it("throws DiscoveryFailedError when the RPC rejects every query and there is no fallback", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const c = new Connection(`${base}/error/discover`, "confirmed");
      const out = await settleWithin(discoverMarkets(c, PID));
      expect(out).toBeInstanceOf(Error);
      expect((out as Error).name).toBe("DiscoveryFailedError");
    } finally {
      warn.mockRestore();
    }
  }, TEST_TIMEOUT_MS);
});

describe("simulateOrSend confirm: default deadline and web3.js's stray getSignatureStatus", () => {
  // A timed-out fake-timer case must not leave fake timers on for the next case.
  afterEach(() => { vi.useRealTimers(); });
  const blockhash = "GHtXQBpHnMXhoLGsryeDY7i6bGqTC2LGqS11Kf3rKmFS";
  function mockConn(confirmTransaction: (this: Connection, ...args: unknown[]) => Promise<unknown>, getSignatureStatus = vi.fn().mockResolvedValue({ context: { slot: 0 }, value: null })) {
    return {
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash, lastValidBlockHeight: 100 }),
      sendTransaction: vi.fn().mockResolvedValue("fakeSig123"),
      confirmTransaction: vi.fn(confirmTransaction),
      getTransaction: vi.fn().mockResolvedValue(null),
      getSignatureStatus,
    } as unknown as Connection;
  }

  it("aborts a confirm that never ends after the default confirm deadline", async () => {
    vi.useFakeTimers();
    try {
      // A confirm that only ends when its abortSignal fires (web3.js's behaviour when getBlockHeight is frozen).
      const conn = mockConn(function (strategy: unknown) {
        const s = (strategy as { abortSignal?: AbortSignal }).abortSignal;
        return new Promise((_, reject) => s?.addEventListener("abort", () => reject(s.reason)));
      });
      const p = simulateOrSend({ connection: conn, ix: ix(), signers: [payer], simulate: false });
      await vi.advanceTimersByTimeAsync(120_000 + 1);
      const r = await p;
      expect(r.signature).toBe("fakeSig123");
      expect(r.err).toMatch(/confirmation status unknown/);
      expect(runtime.DEFAULT_CONFIRM_TIMEOUT_MS).toBe(120_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a deadline during sendTransaction reports the send as unknown, never as not sent", async () => {
    const conn = mockConn(() => Promise.resolve({ context: { slot: 1 }, value: { err: null } }));
    // web3.js's sendTransaction stalled before signing (e.g. on its own blockhash fetch).
    (conn as unknown as { sendTransaction: unknown }).sendTransaction = vi.fn(() => new Promise(() => {}));
    const r = await simulateOrSend({ connection: conn, ix: ix(), signers: [payer], simulate: false, timeoutMs: 50 });
    expect(r.err).toMatch(/send status unknown/);
    expect(r.err).toMatch(/may still be sent/);
  });

  it("contains a failing getSignatureStatus that confirmTransaction starts and never awaits", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    try {
      // web3.js 1.99 getTransactionConfirmationPromise: `(async () => { await this.getSignatureStatus(sig) ... })()`.
      const status = vi.fn().mockRejectedValue(new Error("fetch failed"));
      const conn = mockConn(function (this: Connection, strategy: unknown) {
        void (async () => { await this.getSignatureStatus((strategy as { signature: string }).signature); })();
        return Promise.resolve({ context: { slot: 1 }, value: { err: null } });
      }, status);
      const r = await simulateOrSend({ connection: conn, ix: ix(), signers: [payer], simulate: false });
      expect(r.err).toBeNull();
      await new Promise((res) => setTimeout(res, 50));
      expect(status).toHaveBeenCalled();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
