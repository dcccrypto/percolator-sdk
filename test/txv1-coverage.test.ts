import { describe, it, expect, vi } from "vitest";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TX_LEGACY_MAX_BYTES,
  TX_V1_MAX_BYTES,
  V1RpcError,
  compileV1Message,
  computeBudgetInstructions,
  isTxV1FormatRejection,
  measureTxBytes,
  packInstructionGroups,
  priorityFeeLamportsFromMicroPerCu,
  sendGroupsAdaptive,
  sendV1,
  simulateV1,
  v1ConfigFromBudget,
  v1TransactionSignature,
  signV1Message,
  type PackGroup,
} from "../src/runtime/txv1.js";

const BH = "GHtXQBpHnMXhoLGsryeDY7i6bGqTC2LGqS11Kf3rKmFS";
const payerKp = Keypair.fromSeed(new Uint8Array(32).fill(7));
const payer = payerKp.publicKey;
const PROG = new PublicKey(new Uint8Array(32).fill(9));

function ix(nAccts: number, dataLen: number, seed = 1): TransactionInstruction {
  const keys = Array.from({ length: nAccts }, (_, i) => ({
    pubkey: new PublicKey(Uint8Array.from({ length: 32 }, (_, j) => (j === 0 ? seed : j === 1 ? i + 1 : 3))),
    isSigner: false,
    isWritable: i % 2 === 0,
  }));
  return new TransactionInstruction({ programId: PROG, keys, data: Buffer.alloc(dataLen, 0xab) });
}

const base = { payer, recentBlockhash: BH, config: { computeUnitLimit: 1000 } };

describe("txv1 config validation edges", () => {
  it("rejects an empty instruction list", () => {
    expect(() => compileV1Message({ ...base, instructions: [] })).toThrow(/at least one instruction/);
  });
  it("rejects non-integer / non-finite fee inputs and out-of-range u64 values", () => {
    const one = [ix(1, 1)];
    const c = (config: object) => () => compileV1Message({ ...base, instructions: one, config: { computeUnitLimit: 1000, ...config } });
    expect(c({ priorityFeeLamports: NaN })).toThrow(/priorityFeeLamports must be a finite integer/);
    expect(c({ priorityFeeLamports: 1.5 })).toThrow(/finite integer/);
    expect(c({ maxPriorityFeeLamports: Infinity })).toThrow(/maxPriorityFeeLamports must be a finite integer/);
    expect(c({ priorityFeeLamports: -1n })).toThrow(/must fit u64/);
    expect(c({ maxPriorityFeeLamports: -1n })).toThrow(/maxPriorityFeeLamports must fit u64/);
    expect(c({ maxPriorityFeeLamports: 1n << 64n })).toThrow(/maxPriorityFeeLamports must fit u64/);
    expect(c({ computeUnitLimit: 1.5 })).toThrow(/computeUnitLimit/);
  });
  it("treats heapSizeBytes 0 as unset", () => {
    const a = compileV1Message({ ...base, instructions: [ix(1, 1)], config: { computeUnitLimit: 1000, heapSizeBytes: 0 } });
    const b = compileV1Message({ ...base, instructions: [ix(1, 1)] });
    expect(a.txBytes).toBe(b.txBytes);
  });
  it("priorityFeeLamportsFromMicroPerCu rejects bad numbers and negatives, accepts bigint", () => {
    expect(() => priorityFeeLamportsFromMicroPerCu(NaN, 1)).toThrow(/finite integer/);
    expect(() => priorityFeeLamportsFromMicroPerCu(1, 1.5)).toThrow(/finite integer/);
    expect(() => priorityFeeLamportsFromMicroPerCu(-1, 1)).toThrow(/non-negative/);
    expect(() => priorityFeeLamportsFromMicroPerCu(1n, -1n)).toThrow(/non-negative/);
    expect(priorityFeeLamportsFromMicroPerCu(1n, 1n)).toBe(1n);
  });
});

describe("txv1 instruction-level limits", () => {
  it("refuses an instruction with more than 255 accounts", () => {
    const keys = Array.from({ length: 256 }, () => ({ pubkey: payer, isSigner: false, isWritable: false }));
    const big = new TransactionInstruction({ programId: PROG, keys, data: Buffer.alloc(0) });
    expect(() => compileV1Message({ ...base, instructions: [big] })).toThrow(/more than 255 accounts/);
  });
  it("refuses instruction data over 65535 bytes (exactly 65535 passes the field check, then hits the 4096 cap)", () => {
    expect(() => compileV1Message({ ...base, instructions: [ix(0, 65536)] })).toThrow(/exceeds 65535 bytes|data exceeds/);
    expect(() => compileV1Message({ ...base, instructions: [ix(0, 65535)] })).toThrow(/4096-byte limit/);
  });
  it("accepts a program id that is only readonly-used twice and merges flags once", () => {
    const c = compileV1Message({ ...base, instructions: [ix(0, 1), ix(0, 2)] });
    expect(c.accountKeys.length).toBe(2);
  });
  it("v1TransactionSignature of a partially signed tx (zero signature) is the all-zero base58 id", () => {
    const c = compileV1Message({ ...base, instructions: [ix(1, 1)] });
    const wire = signV1Message(c, []);
    expect(v1TransactionSignature(wire)).toBe("1".repeat(64));
  });
});

describe("txv1 compute-budget placement", () => {
  it("computeBudgetInstructions orders heap, limit, then price, and omits unset ones", () => {
    const all = computeBudgetInstructions({ computeUnitLimit: 5, heapBytes: 65536, priorityMicroLamportsPerCu: 7 });
    expect(all).toHaveLength(3);
    expect(all.every((i) => i.programId.equals(ComputeBudgetProgram.programId))).toBe(true);
    expect(all.map((i) => i.data[0])).toEqual([1, 2, 3]); // RequestHeapFrame, SetComputeUnitLimit, SetComputeUnitPrice
    expect(computeBudgetInstructions({ computeUnitLimit: 5 }).map((i) => i.data[0])).toEqual([2]);
    expect(computeBudgetInstructions({ computeUnitLimit: 5, priorityMicroLamportsPerCu: 0, heapBytes: 0 })).toHaveLength(1);
  });
  it("v1ConfigFromBudget maps unset heap/price to none and forwards optional fields", () => {
    expect(v1ConfigFromBudget({ computeUnitLimit: 9 })).toMatchObject({ computeUnitLimit: 9, priorityFeeLamports: 0n, heapSizeBytes: undefined });
    expect(v1ConfigFromBudget({ computeUnitLimit: 9, priorityMicroLamportsPerCu: 1_000_000, maxPriorityFeeLamports: 5n, loadedAccountsDataSizeLimit: 100 })).toMatchObject({
      priorityFeeLamports: 9n,
      maxPriorityFeeLamports: 5n,
      loadedAccountsDataSizeLimit: 100,
    });
    expect(() => v1ConfigFromBudget({ computeUnitLimit: 9, priorityMicroLamportsPerCu: -1 })).toThrow(/non-negative/);
  });
});

describe("txv1 measureTxBytes + packing at the byte limits", () => {
  const budget = { computeUnitLimit: 1000 };
  it("measures legacy, v0 and v1 (legacy matches a real signed Transaction.serialize())", () => {
    const ixs = [ix(2, 10)];
    const legacy = measureTxBytes("legacy", payer, ixs, budget);
    const v0 = measureTxBytes("v0", payer, ixs, budget);
    const v1 = measureTxBytes("v1", payer, ixs, budget);
    const real = new Transaction();
    real.add(...computeBudgetInstructions(budget), ...ixs);
    real.feePayer = payer;
    real.recentBlockhash = BH;
    real.sign(payerKp);
    expect(legacy).toBe(real.serialize().length);
    expect(v0).toBeGreaterThan(legacy); // v0 adds a version prefix and an empty lookup-table section; no ALTs are used
    expect(v1).toBeGreaterThan(0);
  });
  it("measureTxBytes(v1) reports the size of an oversize tx instead of throwing, and rethrows structural errors", () => {
    const n = measureTxBytes("v1", payer, [ix(0, 5000)], budget);
    expect(n).toBeGreaterThan(TX_V1_MAX_BYTES);
    expect(() => measureTxBytes("v1", payer, [], budget)).toThrow(/at least one instruction/);
  });

  /** Find a data length for which the legacy tx is exactly `target` bytes. */
  function dataLenForLegacy(target: number): number {
    // 200 is in the same 2-byte shortvec length range as the ~1100-byte payload we solve for
    const probe = measureTxBytes("legacy", payer, [ix(0, 200)], budget);
    return 200 + (target - probe);
  }

  it("legacy packer accepts a single group of exactly 1232 bytes and refuses 1233", () => {
    const exactLen = dataLenForLegacy(TX_LEGACY_MAX_BYTES);
    const exact = ix(0, exactLen);
    expect(measureTxBytes("legacy", payer, [exact], budget)).toBe(TX_LEGACY_MAX_BYTES);
    const plan = packInstructionGroups([{ instructions: [exact], computeUnits: 1000 }], { format: "legacy", payer });
    expect(plan).toHaveLength(1);
    expect(plan[0]!.bytes).toBe(TX_LEGACY_MAX_BYTES);
    const over = ix(0, exactLen + 1);
    expect(measureTxBytes("legacy", payer, [over], budget)).toBe(TX_LEGACY_MAX_BYTES + 1);
    expect(() => packInstructionGroups([{ instructions: [over], computeUnits: 1000 }], { format: "legacy", payer })).toThrow(/does not fit/);
  });

  it("v0 packer has the same 1232 cap: one byte over a lone group is refused, and a third group opens a new tx", () => {
    const probe = measureTxBytes("v0", payer, [ix(0, 200)], budget);
    const exactLen = 200 + (TX_LEGACY_MAX_BYTES - probe);
    expect(measureTxBytes("v0", payer, [ix(0, exactLen)], budget)).toBe(TX_LEGACY_MAX_BYTES);
    expect(() => packInstructionGroups([{ instructions: [ix(0, exactLen + 1)], computeUnits: 1000 }], { format: "v0", payer })).toThrow(/does not fit/);
    // 3 x ~612 bytes: two fit together (1016), the third forces a second tx
    const half = ix(0, 400);
    const plan = packInstructionGroups(
      [
        { instructions: [half], computeUnits: 1000 },
        { instructions: [ix(0, 400, 2)], computeUnits: 1000 },
        { instructions: [ix(0, 400, 3)], computeUnits: 1000 },
      ],
      { format: "v0", payer },
    );
    expect(plan.map((t) => t.groups.length)).toEqual([2, 1]);
    expect(plan.every((t) => t.bytes <= TX_LEGACY_MAX_BYTES)).toBe(true);
  });

  it("byteMargin and maxBytes shrink the cap; v1 at exactly maxBytes fits, one less does not", () => {
    const g: PackGroup[] = [{ instructions: [ix(0, 50)], computeUnits: 1000 }];
    const size = measureTxBytes("v1", payer, g[0]!.instructions, budget);
    expect(packInstructionGroups(g, { format: "v1", payer, maxBytes: size })).toHaveLength(1);
    expect(() => packInstructionGroups(g, { format: "v1", payer, maxBytes: size - 1 })).toThrow(/does not fit/);
    expect(packInstructionGroups(g, { format: "v1", payer, maxBytes: size + 10, byteMargin: 10 })).toHaveLength(1);
    expect(() => packInstructionGroups(g, { format: "v1", payer, maxBytes: size + 10, byteMargin: 11 })).toThrow(/does not fit/);
  });

  it("packing is empty for no groups; budget is forwarded into the measured size", () => {
    expect(packInstructionGroups([], { format: "legacy", payer })).toEqual([]);
    const g: PackGroup[] = [{ instructions: [ix(0, 50)], computeUnits: 1000 }];
    const plain = packInstructionGroups(g, { format: "legacy", payer })[0]!.bytes;
    const withBudget = packInstructionGroups(g, { format: "legacy", payer, budget: { heapBytes: 131072, priorityMicroLamportsPerCu: 5 } })[0]!.bytes;
    expect(withBudget).toBeGreaterThan(plain);
  });

  it("a group with more than 64 v1 instructions cannot be packed as v1 but still measures as legacy", () => {
    const many = Array.from({ length: 65 }, () => ix(0, 0));
    expect(() => packInstructionGroups([{ instructions: many, computeUnits: 10 }], { format: "v1", payer })).toThrow(/does not fit/);
    expect(measureTxBytes("legacy", payer, many, budget)).toBeGreaterThan(0);
  });
});

describe("txv1 format-rejection classification via cause", () => {
  it("follows a wrapped cause for the code, and does not loop on a self-referential cause", () => {
    expect(isTxV1FormatRejection({ cause: { code: -32602 } })).toBe(true);
    expect(isTxV1FormatRejection({ cause: { code: -32002 } })).toBe(false);
    const self: { cause?: unknown } = {};
    self.cause = self;
    expect(isTxV1FormatRejection(self)).toBe(false);
    expect(isTxV1FormatRejection(null)).toBe(false);
    expect(isTxV1FormatRejection("-32602")).toBe(false);
  });
});

describe("txv1 raw rpc transport paths", () => {
  const c = compileV1Message({ payer, instructions: [ix(1, 1)], recentBlockhash: BH, config: { computeUnitLimit: 1000 } });
  const wire = signV1Message(c, [payerKp]);

  it("simulateV1 defaults logs to [] when the node returns null", async () => {
    const conn = {
      rpcEndpoint: "http://rpc.test",
      _rpcRequest: vi.fn().mockResolvedValue({ result: { value: { err: "x", logs: null } } }),
    } as unknown as Connection;
    const r = await simulateV1(conn, wire);
    expect(r.logs).toEqual([]);
    expect(r.err).toBe("x");
  });

  it("simulateV1 passes custom headers through the raw fetch path (no connection transport)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ json: async () => ({ result: { value: { err: null } } }) });
    const conn = { rpcEndpoint: "http://rpc.test", _rpcRequest: vi.fn() } as unknown as Connection;
    await simulateV1(conn, wire, { headers: { origin: "https://x.test" }, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl.mock.calls[0]![1].headers).toMatchObject({ origin: "https://x.test", "content-type": "application/json" });
    expect((conn as unknown as { _rpcRequest: ReturnType<typeof vi.fn> })._rpcRequest).not.toHaveBeenCalled();
  });

  it("raw sendV1 forwards skipPreflight, preflightCommitment and maxRetries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ json: async () => ({ result: "SIG" }) });
    const conn = { rpcEndpoint: "http://rpc.test" } as unknown as Connection;
    await sendV1(conn, wire, { fetchImpl: fetchImpl as unknown as typeof fetch, skipPreflight: true, maxRetries: 3, preflightCommitment: "finalized" });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body.params[1]).toMatchObject({ skipPreflight: true, preflightCommitment: "finalized", maxRetries: 3 });
  });

  it("default sendV1 path: passes maxRetries through, and works on a connection with no _rpcRequest", async () => {
    const sendRawTransaction = vi.fn().mockResolvedValue("SIG2");
    const conn = { rpcEndpoint: "http://rpc.test", sendRawTransaction } as unknown as Connection;
    expect(await sendV1(conn, wire, { maxRetries: 2, skipPreflight: true, preflightCommitment: "processed" })).toBe("SIG2");
    expect(sendRawTransaction).toHaveBeenCalledWith(wire, { skipPreflight: true, preflightCommitment: "processed", maxRetries: 2 });
    // a non-code failure is rethrown unchanged
    const boom = new Error("socket hang up");
    const conn2 = { rpcEndpoint: "http://rpc.test", sendRawTransaction: vi.fn().mockRejectedValue(boom) } as unknown as Connection;
    await expect(sendV1(conn2, wire)).rejects.toBe(boom);
  });

  it("default sendV1 path: an error in a non-sendTransaction method is not recorded as a code", async () => {
    const transport = vi.fn().mockResolvedValue({ error: { code: -32602, message: "bad" } });
    const err = new Error("preflight");
    const conn = {
      rpcEndpoint: "http://rpc.test",
      _rpcRequest: transport,
      async sendRawTransaction(this: { _rpcRequest: (m: string, a: unknown[]) => Promise<unknown> }) {
        await this._rpcRequest("getSomethingElse", []);
        throw err;
      },
    } as unknown as Connection;
    await expect(sendV1(conn, wire)).rejects.toBe(err);
  });
});

describe("txv1 sendGroupsAdaptive edges", () => {
  const mk = (i: number): PackGroup<number> => ({ instructions: [ix(1, 8, i + 1)], computeUnits: 5000, tag: i });
  const groups = [mk(0), mk(1), mk(2)];
  const mkConn = () =>
    ({
      rpcEndpoint: "http://rpc.test",
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: BH, lastValidBlockHeight: 1 }),
      getAccountInfo: vi.fn().mockResolvedValue({ data: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0]) }),
      sendRawTransaction: vi.fn().mockResolvedValue("LSIG"),
    }) as unknown as Connection;

  it("throws with no signers", async () => {
    await expect(sendGroupsAdaptive({ connection: mkConn(), signers: [], groups, mode: "off" })).rejects.toThrow(/at least one signer/);
  });

  it("auto mode detects v1 from the connection when clusterSupportsV1 is not given, and uses the default v1 sender", async () => {
    const connection = mkConn();
    const sendRaw = connection.sendRawTransaction as unknown as ReturnType<typeof vi.fn>;
    const seen: string[] = [];
    const out = await sendGroupsAdaptive<number>({ connection, signers: [payerKp], groups, mode: "auto", onTx: (r) => seen.push(r.format) });
    expect(out.initialFormat).toBe("v1");
    expect(connection.getAccountInfo).toHaveBeenCalled();
    expect(sendRaw).toHaveBeenCalled();
    expect(seen.every((f) => f === "v1")).toBe(true);
    expect(out.results.every((r) => r.signature === "LSIG")).toBe(true);
  });

  it("off mode with the v0 fallback format signs and sends versioned v0 transactions via the default sender", async () => {
    const connection = mkConn();
    const out = await sendGroupsAdaptive<number>({ connection, signers: [payerKp], groups, mode: "off", fallbackFormat: "v0", budget: { heapBytes: 131072 } });
    expect(out.initialFormat).toBe("v0");
    const sent = (connection.sendRawTransaction as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as Uint8Array);
    expect(sent.length).toBe(out.txCount);
    expect(sent.every((w) => w.length <= TX_LEGACY_MAX_BYTES)).toBe(true);
    // v0 wire: after the signatures the first message byte has the 0x80 version flag
    expect(sent.every((w) => w[1 + 64] === 0x80)).toBe(true);
    expect((connection.sendRawTransaction as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ skipPreflight: false, preflightCommitment: "confirmed" });
  });

  it("a v1 format rejection falls back to the v0 format when configured, and a non-Error throw is reported as text", async () => {
    let n = 0;
    const sender = vi.fn(async (w: Uint8Array) => {
      n++;
      if (w[0] === 0x81) throw new V1RpcError("sendTransaction", -32015, "unsupported");
      if (n === 2) throw "plain string failure"; // eslint-disable-line no-throw-literal
      return "S" + n;
    });
    const connection = mkConn();
    const out = await sendGroupsAdaptive<number>({ connection, signers: [payerKp], groups, mode: "auto", clusterSupportsV1: true, fallbackFormat: "v0", sender, maxGroups: 1 });
    expect(out.fellBack).toBe(true);
    expect(out.results[0]!.format).toBe("v0");
    expect(out.results[0]!.error).toBe("plain string failure");
    expect(out.results[0]!.afterFallback).toBe(true);
    expect(out.results.flatMap((r) => r.tags)).toEqual([0, 1, 2]);
  });

  it("stopOnError reports the failure through onTx before stopping", async () => {
    const onTx = vi.fn();
    const out = await sendGroupsAdaptive<number>({
      connection: mkConn(),
      signers: [payerKp],
      groups,
      mode: "off",
      maxGroups: 1,
      stopOnError: true,
      sender: async () => { throw new Error("BlockhashNotFound"); },
      onTx,
    });
    expect(out.txCount).toBe(1);
    expect(onTx).toHaveBeenCalledTimes(1);
    expect(onTx.mock.calls[0]![0]).toMatchObject({ error: "BlockhashNotFound", afterFallback: false });
  });
});
