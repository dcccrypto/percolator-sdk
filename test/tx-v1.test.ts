import { describe, it, expect, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TX_V1_FEATURE_ID,
  TX_V1_MAX_BYTES,
  compileV1Message,
  detectTxV1Support,
  isFeatureAccountActive,
  isTxV1FormatRejection,
  measureTxBytes,
  packInstructionGroups,
  parseTxV1Mode,
  priorityFeeLamportsFromMicroPerCu,
  resolveTxFormat,
  sendV1,
  signV1Message,
  simulateV1,
  v1TransactionSignature,
  walletSupportsV1,
  MAX_PRIORITY_FEE_LAMPORTS,
  V1RpcError,
  v1ConfigFromBudget,
  wrapperV1Budget,
} from "../src/runtime/txv1.js";

const BH = "GHtXQBpHnMXhoLGsryeDY7i6bGqTC2LGqS11Kf3rKmFS";
const payerKp = Keypair.fromSeed(new Uint8Array(32).fill(7));
const payer = payerKp.publicKey;
const PROG = new PublicKey(new Uint8Array(32).fill(9));
const HEAP = 128 * 1024;

function ix(nAccts: number, dataLen: number, seed = 1): TransactionInstruction {
  const keys = Array.from({ length: nAccts }, (_, i) => ({
    pubkey: new PublicKey(Uint8Array.from({ length: 32 }, (_, j) => (j === 0 ? seed : j === 1 ? i + 1 : 3))),
    isSigner: false,
    isWritable: i % 2 === 0,
  }));
  return new TransactionInstruction({ programId: PROG, keys, data: Buffer.alloc(dataLen, 0xab) });
}

/** Independent, spec-text decoder (SIMD-0385), deliberately NOT sharing code with the encoder. */
function decodeV1(wire: Uint8Array) {
  let o = 0;
  const u8 = () => wire[o++]!;
  const u16 = () => u8() | (u8() << 8);
  const u32 = () => (u8() | (u8() << 8) | (u8() << 16) | (u8() << 24)) >>> 0;
  const u64 = () => { let v = 0n; for (let i = 0n; i < 8n; i++) v |= BigInt(u8()) << (8n * i); return v; };
  expect(u8()).toBe(0x81);
  const nSig = u8(), roSigned = u8(), roUnsigned = u8();
  const mask = u32();
  const blockhash = new PublicKey(wire.subarray(o, o + 32)).toBase58(); o += 32;
  const nIx = u8(), nAddr = u8();
  const addrs: string[] = [];
  for (let i = 0; i < nAddr; i++) { addrs.push(new PublicKey(wire.subarray(o, o + 32)).toBase58()); o += 32; }
  const cfg: { priorityFee?: bigint; cu?: number; loaded?: number; heap?: number } = {};
  if ((mask & 3) === 3) cfg.priorityFee = u64(); else expect(mask & 3).toBe(0);
  if (mask & 4) cfg.cu = u32();
  if (mask & 8) cfg.loaded = u32();
  if (mask & 16) cfg.heap = u32();
  expect(mask & ~31).toBe(0);
  const hdrs = Array.from({ length: nIx }, () => ({ p: u8(), n: u8(), d: u16() }));
  const ixs = hdrs.map((h) => {
    const idx = Array.from(wire.subarray(o, o + h.n)); o += h.n;
    const data = wire.subarray(o, o + h.d); o += h.d;
    return { program: addrs[h.p]!, accounts: idx.map((i) => addrs[i]!), data };
  });
  const sigs = wire.subarray(o); // trailing = signatures, nothing after
  expect(sigs.length).toBe(nSig * 64);
  return { nSig, roSigned, roUnsigned, blockhash, addrs, cfg, ixs, sigs, messageLen: o };
}

describe("v1 message encoding", () => {
  it("round-trips through an independent decoder (accounts, data, config, order)", () => {
    const a = new TransactionInstruction({
      programId: PROG,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(new Uint8Array(32).fill(5)), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(new Uint8Array(32).fill(6)), isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1, 2, 3]),
    });
    const c = compileV1Message({ payer, instructions: [a], recentBlockhash: BH, config: { computeUnitLimit: 123_456, heapSizeBytes: HEAP, priorityFeeLamports: 777n, loadedAccountsDataSizeLimit: 1 << 20 } });
    const wire = signV1Message(c, [payerKp]);
    expect(wire.length).toBe(c.txBytes);
    const d = decodeV1(wire);
    expect(d.nSig).toBe(1);
    expect(d.blockhash).toBe(BH);
    expect(d.cfg).toEqual({ priorityFee: 777n, cu: 123_456, loaded: 1 << 20, heap: HEAP });
    expect(d.addrs[0]).toBe(payer.toBase58());
    // writable non-signer (5..) before readonly (6..), program last (readonly non-signer)
    expect(d.addrs.slice(1)).toEqual([new PublicKey(new Uint8Array(32).fill(5)).toBase58(), new PublicKey(new Uint8Array(32).fill(6)).toBase58(), PROG.toBase58()]);
    expect(d.roUnsigned).toBe(2);
    expect(d.ixs[0]!.program).toBe(PROG.toBase58());
    expect(d.ixs[0]!.accounts).toEqual(a.keys.map((k) => k.pubkey.toBase58()));
    expect(Array.from(d.ixs[0]!.data)).toEqual([1, 2, 3]);
  });

  it("omits the priority-fee bits when the fee is 0 and the heap bit when no heap is set", () => {
    const c = compileV1Message({ payer, instructions: [ix(2, 4)], recentBlockhash: BH, config: { computeUnitLimit: 1000 } });
    const d = decodeV1(signV1Message(c, [payerKp]));
    expect(d.cfg).toEqual({ cu: 1000, loaded: 64 * 1024 * 1024 });
  });

  it("signs the message bytes and the signature verifies; transaction id = first signature", () => {
    const c = compileV1Message({ payer, instructions: [ix(2, 4)], recentBlockhash: BH, config: { computeUnitLimit: 1000 } });
    const wire = signV1Message(c, [payerKp]);
    const sig = wire.subarray(c.message.length, c.message.length + 64);
    expect(ed25519.verify(sig, c.message, payer.toBytes())).toBe(true);
    // negative control: a flipped message byte no longer verifies
    const bad = c.message.slice(); bad[bad.length - 1]! ^= 1;
    expect(ed25519.verify(sig, bad, payer.toBytes())).toBe(false);
    expect(v1TransactionSignature(wire)).toMatch(/^[1-9A-HJ-NP-Za-km-z]{86,88}$/);
  });

  it("matches SIMD-0385 size arithmetic exactly", () => {
    // 1 sig, 3 addresses (payer, 1 acct, prog), no fee, cu+loaded, 1 ix with 1 acct and 10 data bytes
    const one = new TransactionInstruction({ programId: PROG, keys: [{ pubkey: new PublicKey(new Uint8Array(32).fill(5)), isSigner: false, isWritable: true }], data: Buffer.alloc(10) });
    const c = compileV1Message({ payer, instructions: [one], recentBlockhash: BH, config: { computeUnitLimit: 1000 } });
    const expected = 1 + 3 + 4 + 32 + 1 + 1 + 3 * 32 + 8 /*cu+loaded*/ + 4 /*ix hdr*/ + 1 + 10 + 64;
    expect(c.txBytes).toBe(expected);
  });

  it("merges flags when an account appears twice (signer+writable wins)", () => {
    const other = Keypair.generate().publicKey;
    const i1 = new TransactionInstruction({ programId: PROG, keys: [{ pubkey: other, isSigner: false, isWritable: false }], data: Buffer.alloc(0) });
    const i2 = new TransactionInstruction({ programId: PROG, keys: [{ pubkey: other, isSigner: true, isWritable: true }], data: Buffer.alloc(0) });
    const c = compileV1Message({ payer, instructions: [i1, i2], recentBlockhash: BH, config: { computeUnitLimit: 1 } });
    expect(c.numRequiredSignatures).toBe(2);
    expect(c.numReadonlySigned).toBe(0);
    expect(c.accountKeys[1]!.equals(other)).toBe(true);
  });
});

describe("v1 negative controls", () => {
  const base = { payer, recentBlockhash: BH, config: { computeUnitLimit: 1000 } };
  it("rejects ComputeBudget instructions (they would be silently ignored by v1)", () => {
    expect(() => compileV1Message({ ...base, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 5 }), ix(1, 1)] })).toThrow(/ComputeBudget/);
  });
  it("rejects a missing / zero / oversize compute budget", () => {
    expect(() => compileV1Message({ ...base, instructions: [ix(1, 1)], config: { computeUnitLimit: 0 } })).toThrow(/computeUnitLimit/);
    expect(() => compileV1Message({ ...base, instructions: [ix(1, 1)], config: { computeUnitLimit: 1_400_001 } })).toThrow(/computeUnitLimit/);
    expect(() => compileV1Message({ ...base, instructions: [ix(1, 1)], config: { computeUnitLimit: 1000, loadedAccountsDataSizeLimit: 0 } })).toThrow(/loadedAccountsDataSizeLimit/);
  });
  it("rejects invalid heap sizes", () => {
    for (const heapSizeBytes of [16 * 1024, 262_145, 100_000]) {
      expect(() => compileV1Message({ ...base, instructions: [ix(1, 1)], config: { computeUnitLimit: 1, heapSizeBytes } })).toThrow(/heapSizeBytes/);
    }
  });
  it("enforces 64 addresses", () => {
    expect(() => compileV1Message({ ...base, instructions: [ix(62, 1)] })).not.toThrow(); // payer + 62 + prog = 64
    expect(() => compileV1Message({ ...base, instructions: [ix(63, 1)] })).toThrow(/exceeds the limit of 64/);
  });
  it("enforces 4096 bytes exactly", () => {
    // fixed overhead for payer + prog: find the data length that lands on exactly 4096
    const probe = compileV1Message({ ...base, instructions: [ix(0, 100)] }).txBytes;
    const exact = ix(0, 100 + (TX_V1_MAX_BYTES - probe));
    expect(compileV1Message({ ...base, instructions: [exact] }).txBytes).toBe(TX_V1_MAX_BYTES);
    const over = ix(0, 100 + (TX_V1_MAX_BYTES - probe) + 1);
    expect(() => compileV1Message({ ...base, instructions: [over] })).toThrow(/4096-byte limit/);
  });
  it("enforces 12 signatures and 64 instructions", () => {
    const signers = Array.from({ length: 12 }, () => Keypair.generate().publicKey);
    const mk = (n: number) => new TransactionInstruction({ programId: PROG, keys: signers.slice(0, n).map((p) => ({ pubkey: p, isSigner: true, isWritable: false })), data: Buffer.alloc(0) });
    expect(() => compileV1Message({ ...base, instructions: [mk(11)] })).not.toThrow(); // 11 + payer = 12
    expect(() => compileV1Message({ ...base, instructions: [mk(12)] })).toThrow(/signatures/);
    expect(() => compileV1Message({ ...base, instructions: Array.from({ length: 65 }, () => ix(0, 1)) })).toThrow(/instructions exceeds/);
  });
  it("refuses to sign with a key that is not a required signer", () => {
    const c = compileV1Message({ ...base, instructions: [ix(1, 1)] });
    expect(() => signV1Message(c, [Keypair.generate()])).toThrow(/not a required signer/);
  });
});

describe("priority fee and mode", () => {
  it("converts micro-lamports per CU to total lamports, rounding up (v1 fee is a total)", () => {
    expect(priorityFeeLamportsFromMicroPerCu(50_000, 400_000)).toBe(20_000n);
    expect(priorityFeeLamportsFromMicroPerCu(1, 1)).toBe(1n);
    expect(priorityFeeLamportsFromMicroPerCu(0, 1_400_000)).toBe(0n);
    expect(() => priorityFeeLamportsFromMicroPerCu(-1, 1)).toThrow();
  });
  it("parses the TX_V1 flag", () => {
    expect(parseTxV1Mode("AUTO")).toBe("auto");
    expect(parseTxV1Mode("on")).toBe("on");
    expect(parseTxV1Mode("off")).toBe("off");
    expect(parseTxV1Mode("1")).toBe("on");
    expect(parseTxV1Mode("0")).toBe("off");
    expect(parseTxV1Mode(undefined)).toBe("auto");
    expect(parseTxV1Mode("banana", "off")).toBe("off");
  });
  it("resolves the format per mode; `on` fails closed instead of silently downgrading", () => {
    expect(resolveTxFormat("auto", true)).toBe("v1");
    expect(resolveTxFormat("auto", false)).toBe("legacy");
    expect(resolveTxFormat("off", true)).toBe("legacy");
    expect(resolveTxFormat("off", true, "v0")).toBe("v0");
    expect(resolveTxFormat("on", true)).toBe("v1");
    expect(() => resolveTxFormat("on", false)).toThrow(/TX_V1=on/);
  });
});

describe("feature detection", () => {
  const info = (b: number[]) => ({ data: Uint8Array.from(b) });
  it("reads the feature account: Some(slot) is active, None is not", () => {
    expect(isFeatureAccountActive(Uint8Array.from([1, 0xa6, 0x5a, 0x1d, 0, 0, 0, 0, 0]))).toBe(true);
    expect(isFeatureAccountActive(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isFeatureAccountActive(null)).toBe(false);
    expect(isFeatureAccountActive(Uint8Array.from([1]))).toBe(false);
  });
  it("detects support, caches it, and treats RPC failure / missing account as unsupported (uncached)", async () => {
    const getAccountInfo = vi.fn().mockResolvedValue(info([1, 1, 0, 0, 0, 0, 0, 0, 0]));
    const conn = { getAccountInfo };
    expect(await detectTxV1Support(conn)).toBe(true);
    expect(await detectTxV1Support(conn)).toBe(true);
    expect(getAccountInfo).toHaveBeenCalledTimes(1);
    expect(getAccountInfo.mock.calls[0]![0].equals(TX_V1_FEATURE_ID)).toBe(true);

    expect(await detectTxV1Support({ getAccountInfo: vi.fn().mockResolvedValue(null) })).toBe(false);
    const flaky = { getAccountInfo: vi.fn().mockRejectedValueOnce(new Error("429")).mockResolvedValue(info([1, 1, 0, 0, 0, 0, 0, 0, 0])) };
    expect(await detectTxV1Support(flaky)).toBe(false); // failure -> fall back, not cached
    expect(await detectTxV1Support(flaky)).toBe(true);
  });
});

describe("format-rejection classifier (by JSON-RPC code, never by text)", () => {
  const rpc = (code: number, m = "x") => new V1RpcError("sendTransaction", code, m);
  it("flags exactly the format codes: -32602 (invalid params) and -32015 (version unsupported)", () => {
    expect(isTxV1FormatRejection(rpc(-32602, "invalid transaction: Transaction failed to sanitize accounts offsets correctly"))).toBe(true);
    expect(isTxV1FormatRejection(rpc(-32602, "decoded VersionedTransaction too large: 4097 bytes (max: 4096 bytes)"))).toBe(true);
    expect(isTxV1FormatRejection(rpc(-32015, "Transaction version (1) is not supported by the requesting client"))).toBe(true);
    // web3.js SolanaJSONRPCError carries the node code on `.code`
    expect(isTxV1FormatRejection(Object.assign(new Error("failed to send transaction: invalid transaction"), { code: -32602 }))).toBe(true);
    // a wrapped cause
    expect(isTxV1FormatRejection(Object.assign(new Error("wrapped"), { cause: rpc(-32602) }))).toBe(true);
  });
  it("does NOT flag on-chain / preflight / node-health codes (a program error must never trigger a resend)", () => {
    expect(isTxV1FormatRejection(rpc(-32002, 'Transaction simulation failed: {"InstructionError":[0,{"Custom":21}]}'))).toBe(false);
    expect(isTxV1FormatRejection(rpc(-32003, "Transaction signature verification failure"))).toBe(false);
    expect(isTxV1FormatRejection(rpc(-32005, "Node is unhealthy"))).toBe(false);
    expect(isTxV1FormatRejection(rpc(-32429, "rate limited"))).toBe(false);
  });
  it("negative control: transport errors and arbitrary text that merely MENTIONS a format problem are never format rejections", () => {
    for (const e of [
      new Error("fetch failed: payload too large"),
      new Error("request not supported by proxy"),
      new Error("ECONNRESET while sending: invalid transaction: Transaction failed to sanitize"),
      "RPC sendTransaction failed: -32602 invalid transaction", // a bare string is not a typed error
      new Error("-32602 in a message"),
      null,
      undefined,
    ]) expect(isTxV1FormatRejection(e)).toBe(false);
  });
});

describe("walletSupportsV1", () => {
  it("is true only when 1 is advertised", () => {
    expect(walletSupportsV1({ supportedTransactionVersions: new Set<unknown>(["legacy", 0, 1]) })).toBe(true);
    expect(walletSupportsV1({ supportedTransactionVersions: new Set<unknown>(["legacy", 0]) })).toBe(false);
    expect(walletSupportsV1({ supportedTransactionVersions: null })).toBe(false);
    expect(walletSupportsV1({})).toBe(false);
    expect(walletSupportsV1(null)).toBe(false);
    expect(walletSupportsV1(undefined)).toBe(false);
  });
});

describe("size-aware packing", () => {
  // A PushAuthMark-shaped group: 1 ix, 3 accounts (2 per-market writable + shared oracle), 20 data bytes.
  const shared = new PublicKey(new Uint8Array(32).fill(0x55));
  const market = (i: number): { instructions: TransactionInstruction[]; computeUnits: number; tag: number } => ({
    instructions: [
      new TransactionInstruction({
        programId: PROG,
        keys: [
          { pubkey: payer, isSigner: true, isWritable: false },
          { pubkey: new PublicKey(Uint8Array.from({ length: 32 }, (_, j) => (j === 0 ? 1 : j === 1 ? i : 2))), isSigner: false, isWritable: true },
          { pubkey: shared, isSigner: false, isWritable: false },
        ],
        data: Buffer.alloc(20, 1),
      }),
    ],
    computeUnits: 12_000,
    tag: i,
  });
  const groups = Array.from({ length: 40 }, (_, i) => market(i));
  const budget = { heapBytes: HEAP };

  it("never exceeds the byte limit, covers every group exactly once, in order (all formats)", () => {
    for (const format of ["legacy", "v0", "v1"] as const) {
      const plan = packInstructionGroups(groups, { format, payer, budget });
      const cap = format === "v1" ? 4096 : 1232;
      expect(plan.every((p) => p.bytes <= cap)).toBe(true);
      expect(plan.flatMap((p) => p.groups.map((g) => g.tag))).toEqual(groups.map((g) => g.tag));
      // the reported size equals an independent measurement
      for (const p of plan) expect(p.bytes).toBe(measureTxBytes(format, payer, p.instructions, { ...budget, computeUnitLimit: p.computeUnits }));
    }
  });

  it("v1 needs strictly fewer transactions than legacy for the same work", () => {
    const legacy = packInstructionGroups(groups, { format: "legacy", payer, budget });
    const v1 = packInstructionGroups(groups, { format: "v1", payer, budget });
    expect(v1.length).toBeLessThan(legacy.length);
  });

  it("negative control: a tight byte limit forces more transactions; an impossible one throws", () => {
    const wide = packInstructionGroups(groups, { format: "v1", payer, budget });
    const tight = packInstructionGroups(groups, { format: "v1", payer, budget, maxBytes: 700 });
    expect(tight.length).toBeGreaterThan(wide.length);
    expect(() => packInstructionGroups(groups, { format: "v1", payer, budget, maxBytes: 100 })).toThrow(/does not fit/);
  });

  it("respects the compute-unit ceiling and maxGroups", () => {
    const heavy = groups.map((g) => ({ ...g, computeUnits: 600_000 }));
    const plan = packInstructionGroups(heavy, { format: "v1", payer, budget });
    expect(plan.every((p) => p.computeUnits <= 1_400_000)).toBe(true);
    expect(plan.every((p) => p.groups.length <= 2)).toBe(true);
    const capped = packInstructionGroups(groups, { format: "v1", payer, budget, maxGroups: 5 });
    expect(capped.every((p) => p.groups.length <= 5)).toBe(true);
    expect(capped.length).toBe(8);
  });

  it("respects the 64-account limit even when bytes allow more", () => {
    const wideGroups = Array.from({ length: 6 }, (_, i) => ({ instructions: [ix(20, 1, 100 + i)], computeUnits: 1000, tag: i }));
    const plan = packInstructionGroups(wideGroups, { format: "v1", payer, budget });
    expect(plan.every((p) => p.accounts <= 64)).toBe(true);
    expect(plan.length).toBeGreaterThan(1);
  });
});

describe("raw v1 RPC", () => {
  const conn = { rpcEndpoint: "http://rpc.test" } as unknown as Connection;
  const c = compileV1Message({ payer, instructions: [ix(1, 1)], recentBlockhash: BH, config: { computeUnitLimit: 1000 } });
  const wire = signV1Message(c, [payerKp]);
  const respond = (body: unknown) => vi.fn().mockResolvedValue({ json: async () => body } as unknown as Response);

  it("simulateV1 posts base64 with sigVerify off and returns the result", async () => {
    const fetchImpl = respond({ result: { value: { err: null, logs: ["ok"], unitsConsumed: 150 } } });
    const r = await simulateV1(conn, wire, { fetchImpl });
    expect(r).toMatchObject({ err: null, logs: ["ok"], unitsConsumed: 150 });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body.method).toBe("simulateTransaction");
    expect(Buffer.from(body.params[0], "base64").equals(Buffer.from(wire))).toBe(true);
    expect(body.params[1]).toMatchObject({ encoding: "base64", sigVerify: false });
  });
  it("sendV1 returns the signature and surfaces JSON-RPC rejections as classifiable errors", async () => {
    expect(await sendV1(conn, wire, { fetchImpl: respond({ result: "SIG" }) })).toBe("SIG");
    const rejected = respond({ error: { code: -32602, message: "invalid transaction: Transaction failed to sanitize accounts offsets correctly" } });
    await expect(sendV1(conn, wire, { fetchImpl: rejected })).rejects.toSatisfy((e: Error) => isTxV1FormatRejection(e));
    const onchain = respond({ error: { code: -32002, message: 'Transaction simulation failed: {"InstructionError":[0,{"Custom":21}]}' } });
    await expect(sendV1(conn, wire, { fetchImpl: onchain })).rejects.toSatisfy((e: Error) => !isTxV1FormatRejection(e));
  });
});

import { sendGroupsAdaptive, type PackGroup } from "../src/runtime/txv1.js";

describe("sendGroupsAdaptive", () => {
  const shared = new PublicKey(new Uint8Array(32).fill(0x55));
  const mk = (i: number): PackGroup<number> => ({
    instructions: [
      new TransactionInstruction({
        programId: PROG,
        keys: [
          { pubkey: payer, isSigner: true, isWritable: false },
          { pubkey: new PublicKey(Uint8Array.from({ length: 32 }, (_, j) => (j === 0 ? 1 : j === 1 ? i : 2))), isSigner: false, isWritable: true },
          { pubkey: shared, isSigner: false, isWritable: false },
        ],
        data: Buffer.alloc(20, 1),
      }),
    ],
    computeUnits: 10_000,
    tag: i,
  });
  const groups = Array.from({ length: 39 }, (_, i) => mk(i));
  const connection = {
    rpcEndpoint: "http://rpc.test",
    getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: BH, lastValidBlockHeight: 1 }),
    getAccountInfo: vi.fn().mockResolvedValue({ data: Uint8Array.from([1, 1, 0, 0, 0, 0, 0, 0, 0]) }),
    sendRawTransaction: vi.fn().mockResolvedValue("LEGACYSIG"),
  } as unknown as Connection;
  const base = { connection, signers: [payerKp], groups, budget: { heapBytes: HEAP, priorityMicroLamportsPerCu: 1000 } };

  it("auto + supported: sends v1 and needs fewer txs than the baseline; every group sent exactly once", async () => {
    const wires: Uint8Array[] = [];
    const out = await sendGroupsAdaptive<number>({ ...base, mode: "auto", clusterSupportsV1: true, sender: async (w) => { wires.push(w); return "S" + wires.length; } });
    expect(out.initialFormat).toBe("v1");
    expect(wires.every((w) => w[0] === 0x81 && w.length <= 4096)).toBe(true);
    expect(out.txCount).toBeLessThan(out.baselineTxCount);
    expect(out.results.flatMap((r) => r.tags)).toEqual(groups.map((g) => g.tag));
    // heap + CU actually encoded in the wire (v1 ignores ComputeBudget ixs, so this is the only place it can live)
    const d = decodeV1(wires[0]!);
    expect(d.cfg.heap).toBe(HEAP);
    expect(d.cfg.cu).toBeGreaterThan(0);
    expect(d.cfg.priorityFee).toBeGreaterThan(0n);
  });

  it("off: legacy transactions only, ComputeBudget heap request present", async () => {
    const wires: Uint8Array[] = [];
    const out = await sendGroupsAdaptive<number>({ ...base, mode: "off", sender: async (w) => { wires.push(w); return "L"; } });
    expect(out.initialFormat).toBe("legacy");
    expect(wires.every((w) => w[0] !== 0x81 && w.length <= 1232)).toBe(true);
    expect(out.txCount).toBe(out.baselineTxCount);
    expect(out.fellBack).toBe(false);
  });

  it("auto + unsupported cluster: legacy", async () => {
    const out = await sendGroupsAdaptive<number>({ ...base, mode: "auto", clusterSupportsV1: false, sender: async () => "L" });
    expect(out.initialFormat).toBe("legacy");
  });

  it("a v1 FORMAT rejection repacks the not-yet-accepted groups as legacy and finishes; none lost or duplicated", async () => {
    let n = 0;
    const sender = vi.fn(async (w: Uint8Array) => {
      n++;
      if (w[0] === 0x81) throw new V1RpcError("sendTransaction", -32602, "invalid transaction: Transaction failed to sanitize accounts offsets correctly");
      return "L" + n;
    });
    const out = await sendGroupsAdaptive<number>({ ...base, mode: "auto", clusterSupportsV1: true, sender });
    expect(out.fellBack).toBe(true);
    expect(out.results.every((r) => r.format === "legacy" && r.afterFallback && r.signature)).toBe(true);
    expect(out.results.flatMap((r) => r.tags)).toEqual(groups.map((g) => g.tag));
    expect(sender.mock.calls.filter(([w]) => w[0] === 0x81).length).toBe(1); // rejected once, never retried as v1
  });

  it("negative control: an ON-CHAIN failure never triggers a fallback or a resend", async () => {
    const sender = vi.fn(async () => { throw new Error('Transaction simulation failed: {"InstructionError":[1,{"Custom":21}]}'); });
    const out = await sendGroupsAdaptive<number>({ ...base, mode: "auto", clusterSupportsV1: true, sender });
    expect(out.fellBack).toBe(false);
    expect(out.results.every((r) => r.format === "v1" && r.error && !r.signature)).toBe(true);
    expect(sender).toHaveBeenCalledTimes(out.txCount); // exactly one attempt per tx
  });

  it("TX_V1=on fails closed: no silent downgrade on rejection, and throws when the cluster does not support v1", async () => {
    const sender = vi.fn(async () => { throw new V1RpcError("sendTransaction", -32602, "invalid transaction: Transaction failed to sanitize accounts offsets correctly"); });
    const out = await sendGroupsAdaptive<number>({ ...base, mode: "on", clusterSupportsV1: true, sender });
    expect(out.fellBack).toBe(false);
    expect(out.results.every((r) => r.format === "v1" && r.error)).toBe(true);
    await expect(sendGroupsAdaptive<number>({ ...base, mode: "on", clusterSupportsV1: false, sender })).rejects.toThrow(/TX_V1=on/);
  });

  it("stopOnError halts after the first failed tx", async () => {
    const sender = vi.fn(async () => { throw new Error("BlockhashNotFound"); });
    const out = await sendGroupsAdaptive<number>({ ...base, mode: "auto", clusterSupportsV1: true, sender, stopOnError: true, maxGroups: 3 });
    expect(out.txCount).toBe(1);
  });
});


describe("SDK-1: priority-fee ceiling (a v1 fee is a TOTAL; a unit mix-up must not drain a hot wallet)", () => {
  const base = { payer, recentBlockhash: BH };
  const one = [ix(1, 1)];
  it("accepts the ceiling and refuses one lamport above it", () => {
    expect(() => compileV1Message({ ...base, instructions: one, config: { computeUnitLimit: 1000, priorityFeeLamports: MAX_PRIORITY_FEE_LAMPORTS } })).not.toThrow();
    expect(() => compileV1Message({ ...base, instructions: one, config: { computeUnitLimit: 1000, priorityFeeLamports: MAX_PRIORITY_FEE_LAMPORTS + 1n } })).toThrow(/exceeds the ceiling/);
  });
  it("refuses a micro-lamports-per-CU style number passed as lamports, and u64::MAX", () => {
    expect(() => compileV1Message({ ...base, instructions: one, config: { computeUnitLimit: 1000, priorityFeeLamports: 100_000_000_000n } })).toThrow(/ceiling/);
    expect(() => compileV1Message({ ...base, instructions: one, config: { computeUnitLimit: 1000, priorityFeeLamports: 0xffff_ffff_ffff_ffffn } })).toThrow(/ceiling/);
  });
  it("an explicit maxPriorityFeeLamports override is the only way past it", () => {
    const cfg = { computeUnitLimit: 1000, priorityFeeLamports: 50_000_000n, maxPriorityFeeLamports: 100_000_000n };
    expect(decodeV1(signV1Message(compileV1Message({ ...base, instructions: one, config: cfg }), [payerKp])).cfg.priorityFee).toBe(50_000_000n);
    expect(() => compileV1Message({ ...base, instructions: one, config: { ...cfg, priorityFeeLamports: 100_000_001n } })).toThrow(/ceiling/);
  });
  it("the cap also bites through the budget path (v1ConfigFromBudget) and NaN/fractional prices are refused, not treated as 0", () => {
    // 5,000,000 uL/CU x 1.4M CU = 7,000,000 lamports: under the ceiling; 8,000,000 uL/CU = 11.2M lamports: over
    expect(() => compileV1Message({ ...base, instructions: one, config: v1ConfigFromBudget({ computeUnitLimit: 1_400_000, priorityMicroLamportsPerCu: 5_000_000 }) })).not.toThrow();
    expect(() => compileV1Message({ ...base, instructions: one, config: v1ConfigFromBudget({ computeUnitLimit: 1_400_000, priorityMicroLamportsPerCu: 8_000_000 }) })).toThrow(/ceiling/);
    expect(() => v1ConfigFromBudget({ computeUnitLimit: 1000, priorityMicroLamportsPerCu: Number.NaN })).toThrow(/finite integer/);
    expect(() => v1ConfigFromBudget({ computeUnitLimit: 1000, priorityMicroLamportsPerCu: 1.5 })).toThrow(/finite integer/);
    expect(() => v1ConfigFromBudget({ computeUnitLimit: 1000, priorityMicroLamportsPerCu: -1 })).toThrow(/finite integer/);
    expect(() => compileV1Message({ ...base, instructions: one, config: { computeUnitLimit: 1000, priorityFeeLamports: Number.NaN } })).toThrow(/finite integer/);
    expect(v1ConfigFromBudget({ computeUnitLimit: 1_400_000, priorityMicroLamportsPerCu: 8_000_000, maxPriorityFeeLamports: 20_000_000 }).maxPriorityFeeLamports).toBe(20_000_000);
  });
});

describe("SDK-2: program ids", () => {
  const base = { payer, recentBlockhash: BH, config: { computeUnitLimit: 1000 } };
  it("refuses a program id equal to the fee payer, and a program id also used as a writable or signer account", () => {
    expect(() => compileV1Message({ ...base, instructions: [new TransactionInstruction({ programId: payer, keys: [], data: Buffer.alloc(0) })] })).toThrow(/fee payer/);
    const asAccount = new TransactionInstruction({ programId: PROG, keys: [{ pubkey: PROG, isSigner: false, isWritable: true }], data: Buffer.alloc(0) });
    expect(() => compileV1Message({ ...base, instructions: [asAccount] })).toThrow(/writable or signer/);
    const asReadonly = new TransactionInstruction({ programId: PROG, keys: [{ pubkey: PROG, isSigner: false, isWritable: false }], data: Buffer.alloc(0) });
    expect(() => compileV1Message({ ...base, instructions: [asReadonly] })).not.toThrow();
  });
});

describe("SDK-4: the heap bit is explicit", () => {
  it("wrapperV1Budget requests the 128 KiB wrapper heap and compileV1Message does not add one by itself", () => {
    expect(wrapperV1Budget({}).heapBytes).toBe(HEAP);
    const cfg = v1ConfigFromBudget({ ...wrapperV1Budget({}), computeUnitLimit: 1000 });
    expect(cfg.heapSizeBytes).toBe(HEAP);
    const none = decodeV1(signV1Message(compileV1Message({ payer, instructions: [ix(1, 1)], recentBlockhash: BH, config: { computeUnitLimit: 1000 } }), [payerKp]));
    expect(none.cfg.heap).toBeUndefined();
  });
});

describe("SDK-5: send/simulate go through the caller's Connection", () => {
  const c = compileV1Message({ payer, instructions: [ix(1, 1)], recentBlockhash: BH, config: { computeUnitLimit: 1000 } });
  const wire = signV1Message(c, [payerKp]);
  it("sendV1 uses connection.sendRawTransaction (so a dry-run / send guard on the Connection applies)", async () => {
    const sendRawTransaction = vi.fn().mockResolvedValue("SIG");
    const guarded = { rpcEndpoint: "http://never-called.test", sendRawTransaction } as unknown as Connection;
    expect(await sendV1(guarded, wire, { skipPreflight: true, maxRetries: 0 })).toBe("SIG");
    expect(sendRawTransaction).toHaveBeenCalledTimes(1);
    expect(sendRawTransaction.mock.calls[0]![0]).toBe(wire);
    expect(sendRawTransaction.mock.calls[0]![1]).toMatchObject({ skipPreflight: true, maxRetries: 0 });
    // a guard that refuses to send is respected (no raw-fetch bypass)
    const refusing = { rpcEndpoint: "http://never-called.test", sendRawTransaction: vi.fn().mockRejectedValue(new Error("DRY_RUN: send blocked")) } as unknown as Connection;
    await expect(sendV1(refusing, wire)).rejects.toThrow(/DRY_RUN/);
  });
  it("simulateV1 uses the Connection's own JSON-RPC transport when it has one (custom headers/middleware apply)", async () => {
    const _rpcRequest = vi.fn().mockResolvedValue({ result: { value: { err: null, logs: ["ok"], unitsConsumed: 5 } } });
    const conn = { rpcEndpoint: "http://never-called.test", _rpcRequest } as unknown as Connection;
    expect(await simulateV1(conn, wire)).toMatchObject({ err: null, unitsConsumed: 5 });
    expect(_rpcRequest.mock.calls[0]![0]).toBe("simulateTransaction");
    const failing = { rpcEndpoint: "x", _rpcRequest: vi.fn().mockResolvedValue({ error: { code: -32602, message: "bad" } }) } as unknown as Connection;
    await expect(simulateV1(failing, wire)).rejects.toSatisfy((e: Error) => e instanceof V1RpcError && e.code === -32602 && isTxV1FormatRejection(e));
  });
});
