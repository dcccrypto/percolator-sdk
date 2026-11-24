/**
 * Branch tests for src/runtime/tx.ts: compute-unit validation, commitment-alias
 * ranking in the timeout fallback, error rendering when logs are absent, and
 * formatResult's optional sections. Mocked connection only; nothing is sent.
 */
import { describe, it, expect, vi } from "vitest";
import {
  Keypair,
  Connection,
  TransactionInstruction,
  PublicKey,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { simulateOrSend, formatResult, TxResult } from "../src/runtime/tx.js";
import { parseErrorFromLogs } from "../src/abi/errors.js";

const dummyIx = new TransactionInstruction({
  programId: PublicKey.unique(),
  keys: [],
  data: Buffer.from([0]),
});

function mockConn(overrides: Record<string, unknown> = {}): Connection {
  return {
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: "GHtXQBpHnMXhoLGsryeDY7i6bGqTC2LGqS11Kf3rKmFS",
      lastValidBlockHeight: 100,
    }),
    simulateTransaction: vi.fn().mockResolvedValue({
      context: { slot: 42 },
      value: { err: null, logs: [], unitsConsumed: 100 },
    }),
    sendTransaction: vi.fn().mockResolvedValue("sig"),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    getTransaction: vi.fn().mockResolvedValue({ slot: 42, meta: { logMessages: [] } }),
    getSignatureStatus: vi.fn().mockResolvedValue({ context: { slot: 0 }, value: null }),
    ...overrides,
  } as unknown as Connection;
}

const run = (conn: Connection, extra: Record<string, unknown> = {}) =>
  simulateOrSend({
    connection: conn,
    ix: dummyIx,
    signers: [Keypair.generate()],
    simulate: false,
    ...extra,
  });

const timeout = () => vi.fn().mockRejectedValue(new Error("expired"));
const status = (confirmationStatus: string, err: unknown = null) =>
  vi.fn().mockResolvedValue({
    context: { slot: 999 },
    value: { slot: 77, confirmations: null, err, confirmationStatus },
  });

describe("computeUnitLimit validation", () => {
  it.each([0, -1, 1.5, 1_400_001, NaN, "200000" as unknown as number])(
    "rejects %s",
    async (units) => {
      await expect(run(mockConn(), { computeUnitLimit: units })).rejects.toThrow(
        /computeUnitLimit must be an integer in \[1, 1400000\]/,
      );
    },
  );

  it.each([1, 200_000, 1_400_000])("accepts %i and adds SetComputeUnitLimit", async (units) => {
    let captured: { instructions: TransactionInstruction[] } | undefined;
    const conn = mockConn({
      simulateTransaction: vi.fn().mockImplementation((tx) => {
        captured = tx;
        return Promise.resolve({ context: { slot: 1 }, value: { err: null, logs: [] } });
      }),
    });
    await run(conn, { simulate: true, computeUnitLimit: units });
    const cu = captured!.instructions.find(
      (i) => i.programId.equals(ComputeBudgetProgram.programId) && i.data[0] === 2,
    );
    expect(cu).toBeDefined();
    expect(cu!.data.readUInt32LE(1)).toBe(units);
  });

  it("rejects an empty signer list", async () => {
    await expect(
      simulateOrSend({ connection: mockConn(), ix: dummyIx, signers: [], simulate: true }),
    ).rejects.toThrow(/at least one signer/);
  });
});

describe("error rendering without parseable logs", () => {
  it("simulation: falls back to JSON of the raw err and still reports units", async () => {
    const raw = { InstructionError: [0, "InvalidAccountData"] };
    const conn = mockConn({
      simulateTransaction: vi.fn().mockResolvedValue({
        context: { slot: 9 },
        value: { err: raw, logs: null, unitsConsumed: 7 },
      }),
    });
    const r = await run(conn, { simulate: true });
    expect(r.err).toBe(JSON.stringify(raw));
    expect(r.hint).toBeUndefined();
    expect(r.logs).toEqual([]);
    expect(r.unitsConsumed).toBe(7);
  });

  it("simulation: parses a program error and surfaces name and hint", async () => {
    const logs = ["Program log: custom program error: 0x1"];
    const parsed = parseErrorFromLogs(logs)!;
    const conn = mockConn({
      simulateTransaction: vi.fn().mockResolvedValue({
        context: { slot: 9 },
        value: { err: { InstructionError: [0, { Custom: 1 }] }, logs },
      }),
    });
    const r = await run(conn, { simulate: true });
    expect(parsed.name).toBe("InvalidVersion");
    expect(r.err).toBe("InvalidVersion (0x1)");
    expect(r.hint).toBe(parsed.hint);
    expect(r.unitsConsumed).toBeUndefined();
  });

  it("send: confirmed-with-error and no parseable logs reports the JSON err", async () => {
    const raw = { InstructionError: [0, "Custom"] };
    const conn = mockConn({
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: raw } }),
      getTransaction: vi.fn().mockResolvedValue(null),
    });
    const r = await run(conn);
    expect(r.signature).toBe("sig");
    expect(r.err).toBe(JSON.stringify(raw));
    expect(r.slot).toBe(0);
    expect(r.logs).toEqual([]);
  });

  it("send: confirmed-with-error and a parseable log reports name and hint", async () => {
    const logs = ["Program log: custom program error: 0x1"];
    const parsed = parseErrorFromLogs(logs)!;
    const conn = mockConn({
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: { Custom: 1 } } }),
      getTransaction: vi.fn().mockResolvedValue({ slot: 5, meta: { logMessages: logs } }),
    });
    const r = await run(conn);
    expect(parsed.name).toBe("InvalidVersion");
    expect(r.err).toBe("InvalidVersion (0x1)");
    expect(r.hint).toBe(parsed.hint);
    expect(r.slot).toBe(5);
  });
});

describe("timeout fallback: landed-with-error and commitment aliases", () => {
  it("landed with an unparseable error: JSON err, slot from the status when getTransaction is null", async () => {
    const raw = { InstructionError: [1, "Custom"] };
    const conn = mockConn({
      confirmTransaction: timeout(),
      getSignatureStatus: status("finalized", raw),
      getTransaction: vi.fn().mockResolvedValue(null),
    });
    const r = await run(conn);
    expect(r.signature).toBe("sig");
    expect(r.err).toBe(JSON.stringify(raw));
    expect(r.slot).toBe(77);
    expect(r.logs).toEqual([]);
  });

  // single/singleGossip need >= confirmed; max/root need finalized; recent needs >= processed.
  const cases: Array<[string, string, boolean]> = [
    ["single", "processed", false],
    ["single", "confirmed", true],
    ["singleGossip", "processed", false],
    ["singleGossip", "finalized", true],
    ["max", "confirmed", false],
    ["max", "finalized", true],
    ["root", "confirmed", false],
    ["root", "finalized", true],
    ["recent", "processed", true],
    ["processed", "processed", true],
    ["confirmed", "processed", false],
    ["finalized", "confirmed", false],
  ];
  it.each(cases)("commitment %s observed %s -> settled=%s", async (commitment, observed, settled) => {
    const conn = mockConn({
      confirmTransaction: timeout(),
      getSignatureStatus: status(observed),
    });
    const r = await run(conn, { commitment });
    if (settled) {
      expect(r.err).toBeNull();
    } else {
      expect(r.err).toContain("confirmation status unknown");
      expect(r.err).toContain(`only "${observed}"`);
    }
    expect(r.signature).toBe("sig");
  });

  it("a status with no confirmationStatus is reported as unknown, not settled", async () => {
    const conn = mockConn({
      confirmTransaction: timeout(),
      getSignatureStatus: vi.fn().mockResolvedValue({
        context: { slot: 1 },
        value: { slot: 3, confirmations: 0, err: null },
      }),
    });
    const r = await run(conn);
    expect(r.err).toContain('only "unknown"');
    expect(r.slot).toBe(3);
  });

  it("a failing status lookup still returns the real signature", async () => {
    const conn = mockConn({
      confirmTransaction: timeout(),
      getSignatureStatus: vi.fn().mockRejectedValue(new Error("rpc down")),
    });
    const r = await run(conn);
    expect(r.signature).toBe("sig");
    expect(r.err).toContain("may have already landed");
  });

  it("an unseen signature returns the ambiguous result with the signature", async () => {
    const r = await run(mockConn({ confirmTransaction: timeout() }));
    expect(r.signature).toBe("sig");
    expect(r.slot).toBe(0);
    expect(r.err).toContain("check signature sig before retrying");
  });

  it("a non-Error rejection is stringified", async () => {
    const conn = mockConn({ confirmTransaction: vi.fn().mockRejectedValue("boom") });
    const r = await run(conn);
    expect(r.err).toContain("boom");
  });

  it("sendTransaction failure yields an empty signature", async () => {
    const conn = mockConn({ sendTransaction: vi.fn().mockRejectedValue("nope") });
    const r = await run(conn);
    expect(r).toMatchObject({ signature: "", slot: 0, err: "nope" });
  });
});

describe("formatResult optional sections", () => {
  it("error text shows hint, compute units and logs", () => {
    const r: TxResult = {
      signature: "",
      slot: 0,
      err: "Boom (0x1)",
      hint: "try again",
      logs: ["l1", "l2"],
      unitsConsumed: 1234567,
    };
    const lines = formatResult(r, false).split("\n");
    expect(lines[0]).toBe("Error: Boom (0x1)");
    expect(lines).toContain("Hint: try again");
    expect(lines).toContain(`Compute Units: 1,234,567`);
    expect(lines).toContain("Logs:");
    expect(lines).toContain("  l1");
    expect(lines).toContain("  l2");
  });

  it("error text omits Logs when empty and units when absent", () => {
    const text = formatResult({ signature: "", slot: 0, err: "x", logs: [] }, false);
    expect(text).toBe("Error: x");
  });

  it("success text shows compute units", () => {
    const text = formatResult(
      { signature: "(simulated)", slot: 3, err: null, logs: [], unitsConsumed: 5000 },
      false,
    );
    expect(text).toBe(`Signature: (simulated)\nSlot: 3\nCompute Units: 5,000`);
  });
});
