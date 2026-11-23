/**
 * Differential fuzz: src/solana/spl-token-lite.ts vs the real @solana/spl-token@0.4.14
 * (devDependency) it replaced.
 *
 * spl-token-lite-parity.test.ts already checks each helper on fixed vectors and ~200 raw
 * random buffers. This file is the structure-aware fuzz on top of that: one fixed seed,
 *
 *   - 5,000 token-account inputs for unpackAccount, built field by field (mint, owner,
 *     amount, delegate on/off/odd tag, frozen/initialized/uninitialized/odd state,
 *     native on/off, close authority on/off) for Token and Token-2022, with Token-2022
 *     TLV extensions, the 165/166/355 boundaries, short, long and garbage lengths, wrong
 *     account-type byte, wrong program owner, null info and non-zero byteOffset views.
 *     Each case compares throw vs no-throw (error name and message) and, when both decode,
 *     every field of the Account.
 *   - 2,000 random (owner, mint, programId, allowOwnerOffCurve[, ataProgram]) ATA
 *     derivations (address or error), plus the idempotent create-ATA instruction for each
 *     (programId, data, every key with signer/writable flags).
 *
 * Each generator category is counted and asserted non-empty, so the fuzz cannot quietly
 * stop covering a branch. A mismatch is reported with its case index and generator tags.
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import type { AccountInfo } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import * as lite from "../src/solana/spl-token-lite.js";

const SEED = 0xf022_2611;
const N_UNPACK = 5_000;
const N_ATA = 2_000;

/** mulberry32: deterministic so a failure reproduces. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);
const int = (n: number) => Math.floor(rand() * n);
const chance = (p: number) => rand() < p;
const bytes = (n: number) => {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = int(256);
  return b;
};
const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)];
/** Random 32 bytes: about half are off the ed25519 curve. */
const randKey = () => new PublicKey(bytes(32));
/** On-curve key (a real wallet). */
const walletKey = () => Keypair.fromSeed(bytes(32)).publicKey;
const u64 = (): bigint =>
  pick([
    () => 0n,
    () => 1n,
    () => 0xffff_ffff_ffff_ffffn,
    () => 0x8000_0000_0000_0000n,
    () => bytes(8).readBigUInt64LE(0),
  ])();
/** COption tag: usually 0/1, sometimes an odd u32 (spl treats any non-zero as Some). */
const optTag = () => pick([0, 1, 0, 1, 0, 1, 2, 0x100, 0xffff_ffff, int(2 ** 32)]);

const PROGRAMS = [spl.TOKEN_PROGRAM_ID, spl.TOKEN_2022_PROGRAM_ID] as const;

// Token-2022 account extensions (type, data length). Sizes from spl-token's own layouts.
const ACCOUNT_EXTENSIONS: ReadonlyArray<[spl.ExtensionType, number]> = [
  [spl.ExtensionType.TransferFeeAmount, spl.TRANSFER_FEE_AMOUNT_SIZE],
  [spl.ExtensionType.ImmutableOwner, 0],
  [spl.ExtensionType.MemoTransfer, spl.MEMO_TRANSFER_SIZE],
  [spl.ExtensionType.CpiGuard, spl.CPI_GUARD_SIZE],
  [spl.ExtensionType.NonTransferableAccount, 0],
  [spl.ExtensionType.TransferHookAccount, spl.TRANSFER_HOOK_ACCOUNT_SIZE],
];

type Shape =
  | "null"
  | "short"
  | "exact165"
  | "type-only166"
  | "tlv"
  | "tlv-bad-type"
  | "multisig355"
  | "garbage-long";

interface UnpackCase {
  tags: string[];
  address: PublicKey;
  info: AccountInfo<Buffer> | null;
  programId: PublicKey | undefined;
}

function encodeBase(tags: string[]): Buffer {
  const b = Buffer.alloc(lite.ACCOUNT_SIZE);
  randKey().toBuffer().copy(b, 0);
  randKey().toBuffer().copy(b, 32);
  b.writeBigUInt64LE(u64(), 64);
  const del = optTag();
  b.writeUInt32LE(del, 72);
  tags.push(del === 0 ? "delegate:none" : del === 1 ? "delegate:some" : "delegate:odd-tag");
  // Delegate bytes are random even when the tag is 0 (decoder must ignore them).
  bytes(32).copy(b, 76);
  const state = pick([0, 1, 2, 1, 2, int(256)]);
  b[108] = state;
  tags.push(state === 0 ? "state:uninit" : state === 1 ? "state:init" : state === 2 ? "state:frozen" : "state:odd");
  const nat = optTag();
  b.writeUInt32LE(nat, 109);
  tags.push(nat === 0 ? "native:no" : "native:yes");
  b.writeBigUInt64LE(u64(), 113);
  b.writeBigUInt64LE(u64(), 121);
  const close = optTag();
  b.writeUInt32LE(close, 129);
  tags.push(close === 0 ? "close:none" : "close:some");
  bytes(32).copy(b, 133);
  return b;
}

function tlv(tags: string[]): Buffer {
  const parts: Buffer[] = [];
  const n = int(4);
  for (let i = 0; i < n; i++) {
    const [type, len] = pick(ACCOUNT_EXTENSIONS);
    const h = Buffer.alloc(4);
    h.writeUInt16LE(type, 0);
    h.writeUInt16LE(len, 2);
    parts.push(h, bytes(len));
    tags.push(`ext:${spl.ExtensionType[type]}`);
  }
  // Sometimes trailing garbage / a truncated TLV entry; unpackAccount does not parse TLV.
  if (chance(0.2)) {
    parts.push(bytes(1 + int(7)));
    tags.push("tlv:trailing-garbage");
  }
  return Buffer.concat(parts);
}

function genUnpack(): UnpackCase {
  const tags: string[] = [];
  const program = pick(PROGRAMS);
  tags.push(program.equals(spl.TOKEN_PROGRAM_ID) ? "prog:token" : "prog:token2022");
  const address = randKey();

  // Which programId the caller passes, and who owns the account.
  const argMode = pick(["default", "match", "match", "match", "wrong-owner"] as const);
  let programId: PublicKey | undefined;
  let owner: PublicKey;
  if (argMode === "default") {
    programId = undefined;
    owner = chance(0.8) ? spl.TOKEN_PROGRAM_ID : program;
  } else if (argMode === "match") {
    programId = program;
    owner = program;
  } else {
    programId = program;
    owner = chance(0.5) ? pick(PROGRAMS.filter((p) => !p.equals(program))) : randKey();
  }
  tags.push(`arg:${argMode}`);

  const shape: Shape = pick([
    "null",
    "short",
    "exact165",
    "exact165",
    "exact165",
    "type-only166",
    "tlv",
    "tlv",
    "tlv",
    "tlv-bad-type",
    "multisig355",
    "garbage-long",
  ] as const);
  tags.push(`shape:${shape}`);
  if (shape === "null") return { tags, address, info: null, programId };

  let data: Buffer;
  switch (shape) {
    case "short": {
      const len = pick([0, 1, 64, 108, 164, int(lite.ACCOUNT_SIZE)]);
      data = encodeBase(tags).subarray(0, len);
      break;
    }
    case "exact165":
      data = encodeBase(tags);
      break;
    case "type-only166":
      data = Buffer.concat([encodeBase(tags), Buffer.from([spl.AccountType.Account])]);
      break;
    case "tlv":
      data = Buffer.concat([encodeBase(tags), Buffer.from([spl.AccountType.Account]), tlv(tags)]);
      break;
    case "tlv-bad-type": {
      const t = pick([0, 1, 3, 0xff, int(256)].filter((x) => x !== spl.AccountType.Account));
      data = Buffer.concat([encodeBase(tags), Buffer.from([t]), tlv(tags)]);
      break;
    }
    case "multisig355":
      data = Buffer.concat([encodeBase(tags), Buffer.from([spl.AccountType.Account]), bytes(355 - 166)]);
      break;
    case "garbage-long": {
      const len = lite.ACCOUNT_SIZE + 1 + int(600);
      data = len === 355 ? bytes(356) : bytes(len);
      tags.push(data[lite.ACCOUNT_SIZE] === spl.AccountType.Account ? "garbage:type-ok" : "garbage:type-bad");
      break;
    }
  }

  // Non-zero byteOffset view into a bigger buffer, as Buffer.from(base64) pools often give.
  if (chance(0.3)) {
    const pad = 1 + int(64);
    const big = Buffer.concat([bytes(pad), data, bytes(int(16))]);
    data = big.subarray(pad, pad + data.length);
    tags.push("view:offset");
  }

  const info: AccountInfo<Buffer> = {
    data,
    owner,
    lamports: int(1e9),
    executable: chance(0.05),
    rentEpoch: int(1000),
  };
  return { tags, address, info, programId };
}

/** Normalised outcome: an error string, or every Account field as comparable values. */
function outcome(f: () => spl.Account | lite.Account): unknown {
  try {
    const a = f();
    return {
      address: a.address.toBase58(),
      mint: a.mint.toBase58(),
      owner: a.owner.toBase58(),
      amount: a.amount,
      delegate: a.delegate?.toBase58() ?? null,
      delegatedAmount: a.delegatedAmount,
      isInitialized: a.isInitialized,
      isFrozen: a.isFrozen,
      isNative: a.isNative,
      rentExemptReserve: a.rentExemptReserve,
      closeAuthority: a.closeAuthority?.toBase58() ?? null,
      tlvData: a.tlvData.toString("hex"),
      tlvIsBuffer: Buffer.isBuffer(a.tlvData),
      keys: Object.keys(a).sort().join(","),
    };
  } catch (e) {
    return `throw:${(e as Error).name}:${(e as Error).message}`;
  }
}

describe("spl-token-lite fuzz-diff: unpackAccount vs @solana/spl-token", { timeout: 30_000 }, () => {
  it(`${N_UNPACK} seeded token-account inputs decode identically (fields and throw/no-throw)`, () => {
    const counts = new Map<string, number>();
    const mismatches: string[] = [];
    let threw = 0;
    for (let i = 0; i < N_UNPACK; i++) {
      const c = genUnpack();
      for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      const want = outcome(() => spl.unpackAccount(c.address, c.info, c.programId));
      const got = outcome(() => lite.unpackAccount(c.address, c.info, c.programId));
      if (typeof want === "string") {
        threw++;
        counts.set(want.split(":")[1], (counts.get(want.split(":")[1]) ?? 0) + 1);
      }
      try {
        expect(got).toEqual(want);
      } catch {
        if (mismatches.length < 10)
          mismatches.push(`#${i} [${c.tags.join(" ")}] spl=${JSON.stringify(want, big)} lite=${JSON.stringify(got, big)}`);
        else mismatches.push(`#${i}`);
      }
    }
    expect(mismatches, mismatches.slice(0, 10).join("\n")).toEqual([]);

    // Every branch of unpackAccount and every generator category got exercised.
    const must = [
      "prog:token",
      "prog:token2022",
      "arg:default",
      "arg:match",
      "arg:wrong-owner",
      "shape:null",
      "shape:short",
      "shape:exact165",
      "shape:type-only166",
      "shape:tlv",
      "shape:tlv-bad-type",
      "shape:multisig355",
      "shape:garbage-long",
      "garbage:type-ok",
      "garbage:type-bad",
      "delegate:none",
      "delegate:some",
      "delegate:odd-tag",
      "state:uninit",
      "state:init",
      "state:frozen",
      "state:odd",
      "native:no",
      "native:yes",
      "close:none",
      "close:some",
      "tlv:trailing-garbage",
      "view:offset",
      "TokenAccountNotFoundError",
      "TokenInvalidAccountOwnerError",
      "TokenInvalidAccountSizeError",
      "TokenInvalidAccountError",
      ...ACCOUNT_EXTENSIONS.map(([t]) => `ext:${spl.ExtensionType[t]}`),
    ];
    for (const k of must) expect(counts.get(k) ?? 0, `category ${k}`).toBeGreaterThan(0);
    // Both outcomes are well represented.
    expect(threw).toBeGreaterThan(N_UNPACK * 0.2);
    expect(N_UNPACK - threw).toBeGreaterThan(N_UNPACK * 0.3);
  });
});

function big(_k: string, v: unknown) {
  return typeof v === "bigint" ? `${v}n` : v;
}

describe("spl-token-lite fuzz-diff: ATA derivation and create-idempotent ix vs @solana/spl-token", { timeout: 30_000 }, () => {
  it(`${N_ATA} seeded (owner, mint, programId, allowOwnerOffCurve) derivations and instructions match`, () => {
    const counts = new Map<string, number>();
    const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
    const mismatches: string[] = [];
    const run = (f: () => PublicKey) => {
      try {
        return f().toBase58();
      } catch (e) {
        return `throw:${(e as Error).name}:${(e as Error).message}`;
      }
    };
    const ixView = (ix: { programId: PublicKey; data: Buffer; keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] }) => ({
      programId: ix.programId.toBase58(),
      data: ix.data.toString("hex"),
      keys: ix.keys.map((k) => `${k.pubkey.toBase58()}:${k.isSigner ? "s" : "-"}${k.isWritable ? "w" : "-"}`),
    });

    for (let i = 0; i < N_ATA; i++) {
      const ownerKind = pick(["wallet", "random", "pda"] as const);
      const owner =
        ownerKind === "wallet"
          ? walletKey()
          : ownerKind === "random"
            ? randKey()
            : PublicKey.findProgramAddressSync([bytes(8)], pick(PROGRAMS))[0];
      bump(`owner:${ownerKind}`);
      bump(`curve:${PublicKey.isOnCurve(owner.toBuffer()) ? "on" : "off"}`);
      const mint = chance(0.1) ? spl.NATIVE_MINT : randKey();
      const progKind = pick(["default", "token", "token2022", "token2022", "random"] as const);
      const programId =
        progKind === "default" ? undefined : progKind === "token" ? spl.TOKEN_PROGRAM_ID : progKind === "token2022" ? spl.TOKEN_2022_PROGRAM_ID : randKey();
      bump(`prog:${progKind}`);
      const allowArg = pick([undefined, false, true] as const);
      bump(`allow:${allowArg}`);
      const ataProg = chance(0.1) ? randKey() : undefined;
      if (ataProg) bump("ataProg:custom");

      const want = run(() => spl.getAssociatedTokenAddressSync(mint, owner, allowArg, programId, ataProg));
      const got = run(() => lite.getAssociatedTokenAddressSync(mint, owner, allowArg, programId, ataProg));
      bump(want.startsWith("throw:") ? "ata:throw" : "ata:ok");
      if (got !== want) mismatches.push(`ata #${i} owner=${owner.toBase58()} kind=${ownerKind} prog=${progKind} allow=${allowArg}: spl=${want} lite=${got}`);

      // Instruction: use the derived address when there is one, else a random one.
      const payer = walletKey();
      const ata = want.startsWith("throw:") ? randKey() : new PublicKey(want);
      const wantIx = ixView(spl.createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint, programId, ataProg));
      const gotIx = ixView(lite.createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint, programId, ataProg));
      try {
        expect(gotIx).toEqual(wantIx);
      } catch {
        mismatches.push(`ix #${i}: spl=${JSON.stringify(wantIx)} lite=${JSON.stringify(gotIx)}`);
      }
    }
    expect(mismatches, mismatches.slice(0, 10).join("\n")).toEqual([]);

    for (const k of [
      "owner:wallet",
      "owner:random",
      "owner:pda",
      "curve:on",
      "curve:off",
      "prog:default",
      "prog:token",
      "prog:token2022",
      "prog:random",
      "allow:undefined",
      "allow:false",
      "allow:true",
      "ataProg:custom",
      "ata:ok",
      "ata:throw",
    ])
      expect(counts.get(k) ?? 0, `category ${k}`).toBeGreaterThan(0);
  });
});
