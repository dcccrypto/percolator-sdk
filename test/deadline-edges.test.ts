/**
 * Edge paths of the stalled-RPC deadline helpers (re-land of #650): argument guards, an already-aborted
 * signal, null-body responses, and a send deadline that fires after web3.js has signed.
 */
import { describe, it, expect, vi } from "vitest";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createTimeoutFetch, raceSignal, RpcDeadlineError } from "../src/runtime/deadline.js";
import { simulateOrSend } from "../src/runtime/tx.js";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  const out: number[] = [];
  while (n > 0n) { out.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c === "1") out.unshift(0); else break; }
  return Uint8Array.from(out);
}

const PID = new PublicKey("11111111111111111111111111111112");
const payer = Keypair.fromSeed(new Uint8Array(32).fill(2));
const ix = () => new TransactionInstruction({ programId: PID, keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }], data: Buffer.from([0]) });
const blockhash = "GHtXQBpHnMXhoLGsryeDY7i6bGqTC2LGqS11Kf3rKmFS";

describe("deadline helpers: guards and edge paths", () => {
  it("createTimeoutFetch rejects a non-positive or non-finite timeout", () => {
    expect(() => createTimeoutFetch(0)).toThrow(/timeoutMs must be a positive finite number/);
    expect(() => createTimeoutFetch(Number.NaN)).toThrow(/positive finite/);
  });

  it("createTimeoutFetch keeps a null body for 204/205/304 responses", async () => {
    const f = createTimeoutFetch(1_000, async () => new Response(null, { status: 204, statusText: "No Content" }));
    const res = await f("http://x.invalid");
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it("raceSignal rejects at once on an already-aborted signal and swallows the abandoned promise", async () => {
    const reason = new RpcDeadlineError("t", "timeout", 1);
    const c = new AbortController();
    c.abort(reason);
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    try {
      await expect(raceSignal(Promise.reject(new Error("late")), c.signal)).rejects.toBe(reason);
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("simulateOrSend rejects an invalid confirmTimeoutMs before any request", async () => {
    const conn = { getLatestBlockhash: vi.fn() } as unknown as Connection;
    await expect(simulateOrSend({ connection: conn, ix: ix(), signers: [payer], simulate: false, confirmTimeoutMs: 0 }))
      .rejects.toThrow(/confirmTimeoutMs must be a positive finite number/);
    expect(conn.getLatestBlockhash).not.toHaveBeenCalled();
  });

  it("a send deadline after web3.js signed reports the signed transaction's signature", async () => {
    let signed: Transaction | undefined;
    const conn = {
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash, lastValidBlockHeight: 100 }),
      // web3.js signs the transaction in place, then the broadcast stalls.
      sendTransaction: vi.fn((tx: Transaction, signers: Keypair[]) => {
        tx.recentBlockhash ??= blockhash;
        tx.feePayer ??= signers[0].publicKey;
        tx.sign(...signers);
        signed = tx;
        return new Promise(() => {});
      }),
    } as unknown as Connection;
    const r = await simulateOrSend({ connection: conn, ix: ix(), signers: [payer], simulate: false, timeoutMs: 50 });
    expect(signed?.signature).toBeTruthy();
    expect(r.signature).not.toBe("");
    expect(Buffer.from(decodeBase58(r.signature))).toEqual(Buffer.from(signed!.signature!));
    expect(r.err).toMatch(/send status unknown/);
    expect(r.err).toContain(`check signature ${r.signature}`);
  });
});
