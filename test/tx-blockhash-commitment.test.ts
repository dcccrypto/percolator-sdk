import { describe, it, expect, vi } from "vitest";
import { Keypair, Connection, TransactionInstruction, PublicKey } from "@solana/web3.js";
import { simulateOrSend } from "../src/runtime/tx.js";

const ix = new TransactionInstruction({
  programId: PublicKey.unique(),
  keys: [],
  data: Buffer.from([0]),
});

/** Fake connection: finalized blockhash is ~32 slots older (lower lastValidBlockHeight). */
function fakeConn(over: Record<string, unknown> = {}) {
  const getLatestBlockhash = vi.fn(async (c?: string) => ({
    blockhash: "GHtXQBpHnMXhoLGsryeDY7i6bGqTC2LGqS11Kf3rKmFS",
    lastValidBlockHeight: c === "finalized" ? 1000 : 1032,
  }));
  const confirmTransaction = vi.fn().mockResolvedValue({ value: { err: null } });
  const conn = {
    getLatestBlockhash,
    simulateTransaction: vi.fn().mockResolvedValue({
      context: { slot: 1 },
      value: { err: null, logs: [] },
    }),
    sendTransaction: vi.fn().mockResolvedValue("sig"),
    confirmTransaction,
    getTransaction: vi.fn().mockResolvedValue({ slot: 5, meta: { logMessages: [] } }),
    getSignatureStatus: vi.fn().mockResolvedValue({ context: { slot: 0 }, value: null }),
    ...over,
  } as unknown as Connection;
  return { conn, getLatestBlockhash, confirmTransaction };
}

describe("simulateOrSend blockhash commitment", () => {
  it("send with default finalized commitment fetches blockhash at confirmed, confirms at finalized", async () => {
    const { conn, getLatestBlockhash, confirmTransaction } = fakeConn();
    await simulateOrSend({ connection: conn, ix, signers: [Keypair.generate()], simulate: false });
    expect(getLatestBlockhash).toHaveBeenCalledWith("confirmed");
    const [strategy, commitment] = confirmTransaction.mock.calls[0];
    expect(strategy.lastValidBlockHeight).toBe(1032);
    expect(commitment).toBe("finalized");
  });

  it("explicit processed commitment still fetches blockhash at confirmed-or-weaker", async () => {
    const { conn, getLatestBlockhash } = fakeConn();
    await simulateOrSend({
      connection: conn, ix, signers: [Keypair.generate()], simulate: false, commitment: "processed",
    });
    expect(getLatestBlockhash).toHaveBeenCalledWith("processed");
  });

  it("simulate path uses the same blockhash commitment as send (no divergence)", async () => {
    const sim = fakeConn();
    await simulateOrSend({ connection: sim.conn, ix, signers: [Keypair.generate()], simulate: true });
    const send = fakeConn();
    await simulateOrSend({ connection: send.conn, ix, signers: [Keypair.generate()], simulate: false });
    expect(sim.getLatestBlockhash.mock.calls[0][0]).toBe(send.getLatestBlockhash.mock.calls[0][0]);
  });
});

describe("simulateOrSend BigInt-bearing errors", () => {
  const bigErr = { InstructionError: [0, { Custom: 123n }] };

  it("simulate: reports the error instead of a JSON.stringify TypeError", async () => {
    const { conn } = fakeConn({
      simulateTransaction: vi.fn().mockResolvedValue({
        context: { slot: 1 }, value: { err: bigErr, logs: [] },
      }),
    });
    const r = await simulateOrSend({ connection: conn, ix, signers: [Keypair.generate()], simulate: true });
    expect(r.slot).toBe(1);
    expect(r.err).toContain("123");
    expect(r.err).not.toMatch(/BigInt/);
  });

  it("send: confirmation error with BigInt keeps err and slot", async () => {
    const { conn } = fakeConn({
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: bigErr } }),
    });
    const r = await simulateOrSend({ connection: conn, ix, signers: [Keypair.generate()], simulate: false });
    expect(r.signature).toBe("sig");
    expect(r.slot).toBe(5);
    expect(r.err).toContain("123");
    expect(r.err).not.toMatch(/unknown|BigInt/);
  });

  it("send fallback: status error with BigInt is reported", async () => {
    const { conn } = fakeConn({
      confirmTransaction: vi.fn().mockRejectedValue(new Error("timeout")),
      getSignatureStatus: vi.fn().mockResolvedValue({
        context: { slot: 9 },
        value: { slot: 5, confirmationStatus: "finalized", err: bigErr },
      }),
    });
    const r = await simulateOrSend({ connection: conn, ix, signers: [Keypair.generate()], simulate: false });
    expect(r.slot).toBe(5);
    expect(r.err).toContain("123");
    expect(r.err).not.toMatch(/unknown|BigInt/);
  });
});
