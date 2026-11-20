// One user action must land at most one transaction. RpcPool.call / withRetry must not re-run a
// non-idempotent (signing) callback after an error that may have come after the node accepted
// the tx, and sendGroupsAdaptive must report the signature it attempted on a failed send.
// Model: a fake node counts every DISTINCT signature that reached it (identical bytes dedup, as
// the real status cache does). The real web3 sendTransaction / sendAndConfirmTransaction are kept,
// so a retry re-signs on a fresh blockhash exactly as in production. No network is used.
import { describe, it, expect } from "vitest";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { RpcPool, withRetry, _internal } from "../src/solana/rpc-pool.js";
import { sendGroupsAdaptive, v1TransactionSignature, type PackGroup } from "../src/runtime/txv1.js";

const payer = Keypair.generate();
const TO = Keypair.generate().publicKey;
const ix = () => SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: TO, lamports: 1 });

function fakeNode(conn: Connection, landed: Set<string>, opts: { failAfterAccept?: string; confirmErr?: string; rejectFirst?: string }) {
  const c = conn as unknown as Record<string, unknown>;
  let n = 0;
  let failed = false;
  let rejected = false;
  c.getLatestBlockhash = async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1_000 + ++n });
  c.sendRawTransaction = async (raw: Uint8Array) => {
    // Pre-accept reject: the bytes never reach the node.
    if (opts.rejectFirst && !rejected) { rejected = true; throw new Error(opts.rejectFirst); }
    const sig = Buffer.from(Transaction.from(Uint8Array.from(raw)).signature!).toString("hex");
    landed.add(sig);
    if (opts.failAfterAccept && !failed) { failed = true; throw new Error(opts.failAfterAccept); }
    return sig;
  };
  c.confirmTransaction = async () => {
    if (opts.confirmErr) throw new Error(opts.confirmErr);
    return { context: { slot: 1 }, value: { err: null } };
  };
}
const endpointsOf = (p: RpcPool) => (p as unknown as { endpoints: { connection: Connection }[] }).endpoints.map((e) => e.connection);
const AMBIGUOUS = ["504 Gateway Timeout", "502 Bad Gateway", "socket hang up", "read ECONNRESET", "network timeout at: http://rpc"];
const UNKNOWN = "Transaction was not confirmed in 30.00 seconds. It is unknown if it succeeded or failed.";
const retry = { maxRetries: 3, baseDelayMs: 1, jitterFactor: 0 };

describe("RpcPool.call: a non-idempotent callback is not re-run after an ambiguous error", () => {
  for (const msg of AMBIGUOUS) {
    it(`does not retry a send whose outcome is unknown ("${msg}")`, async () => {
      const landed = new Set<string>();
      const pool = new RpcPool({ endpoints: ["http://127.0.0.1:9001"], retry, verbose: false });
      for (const c of endpointsOf(pool)) fakeNode(c, landed, { failAfterAccept: msg });
      const tx = new Transaction().add(ix());
      let calls = 0;
      await expect(pool.call((c) => { calls++; return c.sendTransaction(tx, [payer]); })).rejects.toThrow(msg);
      expect(calls).toBe(1);
      expect(landed.size).toBe(1);
    });
  }

  it("failover strategy does not move a non-idempotent callback to the next endpoint after it threw", async () => {
    const landed = new Set<string>();
    const pool = new RpcPool({ endpoints: ["http://127.0.0.1:9001", "http://127.0.0.1:9002"], strategy: "failover", retry: false, verbose: false });
    const [a, b] = endpointsOf(pool);
    fakeNode(a!, landed, { confirmErr: UNKNOWN });
    fakeNode(b!, landed, {});
    let calls = 0;
    await expect(pool.call((c) => { calls++; return sendAndConfirmTransaction(c, new Transaction().add(ix()), [payer]); })).rejects.toThrow(/unknown if it succeeded/);
    expect(calls).toBe(1);
    expect(landed.size).toBe(1);
  });

  it("failover with retry enabled does not move an ambiguous send to the next endpoint either", async () => {
    const landed = new Set<string>();
    const pool = new RpcPool({ endpoints: ["http://127.0.0.1:9001", "http://127.0.0.1:9002"], strategy: "failover", retry, verbose: false });
    const [a, b] = endpointsOf(pool);
    fakeNode(a!, landed, { failAfterAccept: "504 Gateway Timeout" });
    fakeNode(b!, landed, {});
    const tx = new Transaction().add(ix());
    let calls = 0;
    await expect(pool.call((c) => { calls++; return c.sendTransaction(tx, [payer]); })).rejects.toThrow(/504/);
    expect(calls).toBe(1);
    expect(landed.size).toBe(1);
  });

  for (const msg of ["429 Too Many Requests", "connect ECONNREFUSED 127.0.0.1:9001"]) {
    it(`still retries a send rejected before accept ("${msg}"), landing exactly one tx`, async () => {
      const landed = new Set<string>();
      const pool = new RpcPool({ endpoints: ["http://127.0.0.1:9001"], retry, verbose: false });
      for (const c of endpointsOf(pool)) fakeNode(c, landed, { rejectFirst: msg });
      const tx = new Transaction().add(ix());
      let calls = 0;
      await pool.call((c) => { calls++; return c.sendTransaction(tx, [payer]); });
      expect(calls).toBe(2);
      expect(landed.size).toBe(1);
    });
  }

  it("still fails a pre-accept reject over to the next endpoint (retry:false)", async () => {
    const pool = new RpcPool({ endpoints: ["http://127.0.0.1:9001", "http://127.0.0.1:9002"], strategy: "failover", retry: false, verbose: false });
    const seen: string[] = [];
    const v = await pool.call(async (c) => {
      seen.push(c.rpcEndpoint);
      if (seen.length === 1) throw new Error("429 Too Many Requests");
      return "ok";
    });
    expect(v).toBe("ok");
    expect(new Set(seen).size).toBe(2);
  });
});

describe("RpcPool.call: idempotent reads keep full retry and failover", () => {
  for (const msg of AMBIGUOUS) {
    it(`idempotent:true retries "${msg}"`, async () => {
      const pool = new RpcPool({ endpoints: ["http://127.0.0.1:9001"], retry: { ...retry, maxRetries: 2 }, verbose: false });
      let calls = 0;
      const v = await pool.call(async () => { if (++calls === 1) throw new Error(msg); return 42; }, { idempotent: true });
      expect(v).toBe(42);
      expect(calls).toBe(2);
    });
  }

  it("idempotent:true fails over to the next endpoint after a non-retryable error (retry:false)", async () => {
    const pool = new RpcPool({ endpoints: ["http://127.0.0.1:9001", "http://127.0.0.1:9002"], strategy: "failover", retry: false, verbose: false });
    const seen: string[] = [];
    const v = await pool.call(async (c) => {
      seen.push(c.rpcEndpoint);
      if (seen.length === 1) throw new Error("account decode failed");
      return 7;
    }, { idempotent: true });
    expect(v).toBe(7);
    expect(seen).toEqual(["http://127.0.0.1:9001", "http://127.0.0.1:9002"]);
  });
});

describe("withRetry idempotent option", () => {
  it("withRetry(..., { idempotent: false }) does not re-run a send after 504", async () => {
    const landed = new Set<string>();
    const conn = new Connection("http://127.0.0.1:9");
    fakeNode(conn, landed, { failAfterAccept: "504 Gateway Timeout" });
    const tx = new Transaction().add(ix());
    let calls = 0;
    await expect(withRetry(() => { calls++; return conn.sendTransaction(tx, [payer]); }, { ...retry, idempotent: false })).rejects.toThrow(/504/);
    expect(calls).toBe(1);
    expect(landed.size).toBe(1);
  });

  it("withRetry(..., { idempotent: false }) still retries a 429", async () => {
    let calls = 0;
    const v = await withRetry(async () => { if (++calls === 1) throw new Error("429 Too Many Requests"); return 1; }, { ...retry, idempotent: false });
    expect(v).toBe(1);
    expect(calls).toBe(2);
  });

  it("withRetry default (idempotent) keeps retrying 504 for reads", async () => {
    let calls = 0;
    const v = await withRetry(async () => { if (++calls === 1) throw new Error("504 Gateway Timeout"); return 1; }, retry);
    expect(v).toBe(1);
    expect(calls).toBe(2);
  });
});

describe("isPreAcceptRetryable", () => {
  const f = _internal.isPreAcceptRetryable;
  const codes = [429, 502, 503, 504];
  it("accepts only certainly-pre-accept errors", () => {
    expect(f(new Error("429 Too Many Requests"), codes)).toBe(true);
    expect(f(new Error("rate limit exceeded"), codes)).toBe(true);
    expect(f(new Error("connect ECONNREFUSED"), codes)).toBe(true);
    for (const m of [...AMBIGUOUS, "503 Service Unavailable", UNKNOWN, "slot 14290"]) expect(f(new Error(m), codes)).toBe(false);
    expect(f(new Error("429"), [502])).toBe(false);
    expect(f(Object.assign(new Error("rate limit"), { name: "AbortError" }), codes)).toBe(false);
    expect(f(null, codes)).toBe(false);
    expect(f("too many requests", codes)).toBe(true);
  });

  it("a signature containing 429 inside web3's unknown-outcome error is not pre-accept", () => {
    const unknownWith = (sig: string) => new Error(`Transaction was not confirmed in 30.00 seconds. It is unknown if it succeeded or failed. Check signature ${sig} using the Solana Explorer or CLI tools.`);
    for (const sig of ["5Gk429Zx" + "a".repeat(80), "429Abc" + "b".repeat(82), "c".repeat(82) + "xyz429"]) {
      expect(f(unknownWith(sig), codes)).toBe(false);
    }
    expect(f(new Error("failed to send transaction: 429 Too Many Requests: {}"), codes)).toBe(true);
    expect(f(new Error("Server responded with 429."), codes)).toBe(true);
  });
});

describe("sendGroupsAdaptive: a failed send reports the signature it attempted", () => {
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const b58 = (bytes: Uint8Array) => {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    let s = "";
    while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
    for (const b of bytes) { if (b === 0) s = "1" + s; else break; }
    return s;
  };
  const kp = Keypair.generate();
  const groups: PackGroup<number>[] = [{
    instructions: [new TransactionInstruction({ programId: new PublicKey(new Uint8Array(32).fill(7)), keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: true }], data: Buffer.alloc(4, 1) })],
    computeUnits: 10_000,
    tag: 0,
  }];
  const connection = {
    rpcEndpoint: "http://rpc.test",
    getLatestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1 }),
  } as unknown as Connection;

  const cases: { name: string; mode: "off" | "on"; fallbackFormat?: "legacy" | "v0"; sigOf: (w: Uint8Array) => string }[] = [
    { name: "legacy", mode: "off", sigOf: (w) => b58(Transaction.from(Buffer.from(w)).signature!) },
    { name: "v0", mode: "off", fallbackFormat: "v0", sigOf: (w) => b58(VersionedTransaction.deserialize(w).signatures[0]!) },
    { name: "v1", mode: "on", sigOf: (w) => v1TransactionSignature(w) },
  ];
  for (const c of cases) {
    it(`${c.name}: 504 after accept -> attemptedSignature matches the sent bytes, signature stays unset`, async () => {
      let sent: Uint8Array | undefined;
      const out = await sendGroupsAdaptive<number>({
        connection, signers: [kp], groups, mode: c.mode, clusterSupportsV1: true, fallbackFormat: c.fallbackFormat,
        sender: async (w) => { sent = w; throw new Error("504 Gateway Timeout"); },
      });
      const r = out.results[0]!;
      expect(r.error).toBe("504 Gateway Timeout");
      expect(r.signature).toBeUndefined();
      expect(r.attemptedSignature).toBe(c.sigOf(sent!));
      expect(r.attemptedSignature!.length).toBeGreaterThan(80);
    });
  }
});
