import { describe, it, expect, vi } from "vitest";
import { Keypair, Connection, TransactionInstruction, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { simulateOrSend, buildIx, formatResult, TxResult } from "../src/runtime/tx.js";

const dummyIx = new TransactionInstruction({
  programId: PublicKey.unique(),
  keys: [],
  data: Buffer.from([0]),
});

function makeMockConnection(overrides: Record<string, unknown> = {}): Connection {
  return {
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: "GHtXQBpHnMXhoLGsryeDY7i6bGqTC2LGqS11Kf3rKmFS",
      lastValidBlockHeight: 100,
    }),
    simulateTransaction: vi.fn().mockResolvedValue({
      context: { slot: 42 },
      value: { err: null, logs: ["Program log: ok"], unitsConsumed: 100 },
    }),
    sendTransaction: vi.fn().mockResolvedValue("fakeSig123"),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    getTransaction: vi.fn().mockResolvedValue({
      slot: 42,
      meta: { logMessages: ["Program log: ok"] },
    }),
    ...overrides,
  } as unknown as Connection;
}

describe("simulateOrSend", () => {
  it("returns TxResult on successful simulation", async () => {
    const conn = makeMockConnection();
    const result = await simulateOrSend({
      connection: conn,
      ix: dummyIx,
      signers: [Keypair.generate()],
      simulate: true,
    });
    expect(result.signature).toBe("(simulated)");
    expect(result.err).toBeNull();
    expect(result.slot).toBe(42);
  });

  it("returns TxResult (not throws) when simulation network error occurs", async () => {
    const conn = makeMockConnection({
      simulateTransaction: vi.fn().mockRejectedValue(new Error("RPC timeout")),
    });
    const result = await simulateOrSend({
      connection: conn,
      ix: dummyIx,
      signers: [Keypair.generate()],
      simulate: true,
    });
    expect(result.signature).toBe("(simulated)");
    expect(result.err).toBe("RPC timeout");
    expect(result.logs).toEqual([]);
  });

  it("returns TxResult (not throws) when send network error occurs", async () => {
    const conn = makeMockConnection({
      sendTransaction: vi.fn().mockRejectedValue(new Error("connection refused")),
    });
    const result = await simulateOrSend({
      connection: conn,
      ix: dummyIx,
      signers: [Keypair.generate()],
      simulate: false,
    });
    expect(result.signature).toBe("");
    expect(result.err).toBe("connection refused");
    expect(result.logs).toEqual([]);
  });

  it("requires callers to explicitly choose simulate or send mode", async () => {
    const conn = makeMockConnection();
    await expect(
      simulateOrSend({
        connection: conn,
        ix: dummyIx,
        signers: [Keypair.generate()],
      } as Parameters<typeof simulateOrSend>[0]),
    ).rejects.toThrow("simulate must be explicitly set");

    expect(conn.getLatestBlockhash).not.toHaveBeenCalled();
    expect(conn.simulateTransaction).not.toHaveBeenCalled();
    expect(conn.sendTransaction).not.toHaveBeenCalled();
  });

  it("parses on-chain error from simulation logs", async () => {
    const conn = makeMockConnection({
      simulateTransaction: vi.fn().mockResolvedValue({
        context: { slot: 10 },
        value: {
          err: { InstructionError: [0, { Custom: 1 }] },
          logs: [
            "Program log: custom program error: 0x1",
          ],
          unitsConsumed: 50,
        },
      }),
    });
    const result = await simulateOrSend({
      connection: conn,
      ix: dummyIx,
      signers: [Keypair.generate()],
      simulate: true,
    });
    expect(result.err).toContain("0x1");
    expect(result.slot).toBe(10);
  });
});

describe("heap frame (#176)", () => {
  function captureTx() {
    let captured: { instructions: TransactionInstruction[] } | undefined;
    const conn = makeMockConnection({
      simulateTransaction: vi.fn().mockImplementation((tx: { instructions: TransactionInstruction[] }) => {
        captured = tx;
        return Promise.resolve({ context: { slot: 42 }, value: { err: null, logs: [], unitsConsumed: 0 } });
      }),
    });
    return { conn, get: () => captured };
  }
  // ComputeBudget RequestHeapFrame is instruction index 1.
  const heapIx = (tx: { instructions: TransactionInstruction[] } | undefined) =>
    tx?.instructions.find(
      (i) => i.programId.equals(ComputeBudgetProgram.programId) && i.data[0] === 1,
    );

  it("requests a 128KB heap frame by default (v17 wrapper requirement)", async () => {
    const { conn, get } = captureTx();
    await simulateOrSend({ connection: conn, ix: dummyIx, signers: [Keypair.generate()], simulate: true });
    const hf = heapIx(get());
    expect(hf).toBeDefined();
    const bytes = new DataView(hf!.data.buffer, hf!.data.byteOffset + 1, 4).getUint32(0, true);
    expect(bytes).toBe(128 * 1024);
  });

  it("omits the heap frame when heapFrameBytes is 0 (non-wrapper txs)", async () => {
    const { conn, get } = captureTx();
    await simulateOrSend({
      connection: conn, ix: dummyIx, signers: [Keypair.generate()], simulate: true, heapFrameBytes: 0,
    });
    expect(heapIx(get())).toBeUndefined();
  });

  it("rejects an invalid heapFrameBytes (not a multiple of 1024 / out of range)", async () => {
    const conn = makeMockConnection();
    await expect(
      simulateOrSend({
        connection: conn, ix: dummyIx, signers: [Keypair.generate()], simulate: true, heapFrameBytes: 1000,
      }),
    ).rejects.toThrow(/heapFrameBytes/);
  });
});

describe("buildIx", () => {
  it("creates TransactionInstruction with correct fields", () => {
    const programId = PublicKey.unique();
    const data = new Uint8Array([1, 2, 3]);
    const ix = buildIx({ programId, keys: [], data });
    expect(ix.programId.equals(programId)).toBe(true);
    expect(ix.keys).toEqual([]);
    expect(ix.data.length).toBe(3);
  });
});

describe("formatResult", () => {
  const okResult: TxResult = {
    signature: "abc123",
    slot: 99,
    err: null,
    logs: ["Program log: ok"],
  };

  const errResult: TxResult = {
    signature: "",
    slot: 0,
    err: "timeout",
    logs: [],
  };

  it("formats successful result in text mode", () => {
    const text = formatResult(okResult, false);
    expect(text).toContain("Signature: abc123");
    expect(text).toContain("Slot: 99");
    expect(text).toContain("explorer.solana.com");
  });

  it("formats error result in text mode", () => {
    const text = formatResult(errResult, false);
    expect(text).toContain("Error: timeout");
  });

  it("formats result in JSON mode", () => {
    const json = formatResult(okResult, true);
    const parsed = JSON.parse(json);
    expect(parsed.signature).toBe("abc123");
    expect(parsed.slot).toBe(99);
  });

  it("does not show explorer link for simulated results", () => {
    const simResult: TxResult = { ...okResult, signature: "(simulated)" };
    const text = formatResult(simResult, false);
    expect(text).not.toContain("explorer");
  });
});
