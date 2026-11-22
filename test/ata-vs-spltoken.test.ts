/**
 * Differential: src/solana/ata.ts (getAta, getAtaSync, fetchTokenAccount) vs the real
 * @solana/spl-token@0.4.14 (devDependency) on the deposit/withdraw path.
 *
 * Since #653, ata.ts runs on src/solana/spl-token-lite.ts. test/spl-token-lite-parity.test.ts
 * already checks the shim itself (lite.* vs spl.*) on random vectors. This file checks the public
 * wrappers one level up, which callers actually use: note ata.ts takes (owner, mint) while spl
 * takes (mint, owner), and fetchTokenAccount fills in the commitment and program defaults.
 *
 * Not repeated here (already in spl-token-lite-parity.test.ts): program-id bytes, ACCOUNT_SIZE,
 * random-byte account fuzz incl. 355-byte multisig and odd option tags, non-zero byteOffset views,
 * custom associatedTokenProgramId, the idempotent create-ATA instruction, and the dist/import scan.
 *
 * Token-2022 extension bytes are hand-built with spl-token's own layout encoders (AccountLayout,
 * TransferFeeAmountLayout, ...) and sized with spl.getAccountLen, so no network is needed.
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import type { AccountInfo, Connection } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { getAta, getAtaSync, fetchTokenAccount } from "../src/solana/ata.js";
import { TokenError } from "../src/solana/spl-token-lite.js";

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
const rand = rng(0xa7a22611);
const bytes = (n: number) => Buffer.from(Array.from({ length: n }, () => Math.floor(rand() * 256)));
const randKey = () => new PublicKey(bytes(32));
/** On-curve owner (a real wallet key) from a seeded 32-byte seed. */
const walletKey = () => Keypair.fromSeed(bytes(32)).publicKey;
const u64 = () => bytes(8).readBigUInt64LE(0);

const TOKEN = spl.TOKEN_PROGRAM_ID;
const T22 = spl.TOKEN_2022_PROGRAM_ID;
const PROGRAMS = [
  ["TOKEN", TOKEN],
  ["TOKEN_2022", T22],
] as const;

const hex = (k: PublicKey | null) => (k ? Buffer.from(k.toBytes()).toString("hex") : null);

/** Outcome of a call: value, or the thrown error's class name / name / message / TokenError-ness. */
type Outcome<T> = { ok: T } | { err: { cls: string; name: string; message: string } };
function run<T>(f: () => T): Outcome<T> {
  try {
    return { ok: f() };
  } catch (e) {
    const x = e as Error;
    return { err: { cls: x.constructor.name, name: x.name, message: x.message } };
  }
}
async function runAsync<T>(f: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: await f() };
  } catch (e) {
    const x = e as Error;
    return { err: { cls: x.constructor.name, name: x.name, message: x.message } };
  }
}

/** Every Account field the deposit/withdraw path reads, normalized for deep equality. */
function norm(a: spl.Account) {
  return {
    address: hex(a.address),
    mint: hex(a.mint),
    owner: hex(a.owner),
    amount: a.amount,
    amountType: typeof a.amount,
    delegate: hex(a.delegate),
    delegatedAmount: a.delegatedAmount,
    delegatedAmountType: typeof a.delegatedAmount,
    isInitialized: a.isInitialized,
    isFrozen: a.isFrozen,
    isNative: a.isNative,
    rentExemptReserve: a.rentExemptReserve,
    closeAuthority: hex(a.closeAuthority),
    tlvData: Buffer.from(a.tlvData).toString("hex"),
    tlvIsBuffer: Buffer.isBuffer(a.tlvData),
  };
}

/** A fake Connection that returns `info` for any address, recording the call. */
function conn(info: AccountInfo<Buffer> | null) {
  const calls: unknown[][] = [];
  const c = {
    getAccountInfo: async (...args: unknown[]) => {
      calls.push(args);
      return info;
    },
  } as unknown as Connection;
  return { c, calls };
}

/** Run fetchTokenAccount and spl.getAccount on the same account and compare outcome field by field. */
async function diffFetch(info: AccountInfo<Buffer> | null, programId?: PublicKey) {
  const address = randKey();
  const a = conn(info);
  const b = conn(info);
  const ours = await runAsync(() =>
    programId ? fetchTokenAccount(a.c, address, programId) : fetchTokenAccount(a.c, address),
  );
  const theirs = await runAsync(() => spl.getAccount(b.c, address, undefined, programId));
  // Same RPC call (address + commitment).
  expect(a.calls.length).toBe(1);
  expect(hex(a.calls[0][0] as PublicKey)).toBe(hex(b.calls[0][0] as PublicKey));
  expect(a.calls[0][1]).toBe(b.calls[0][1]);
  // And the synchronous decoder agrees with spl.getAccount.
  const unpacked = run(() => spl.unpackAccount(address, info, programId));
  const view = (o: Outcome<spl.Account>) => ("ok" in o ? { ok: norm(o.ok) } : o);
  expect(view(ours)).toEqual(view(theirs));
  expect(view(theirs)).toEqual(view(unpacked));
  if ("ok" in ours && "ok" in theirs) {
    // Field-by-field so a mismatch names the field.
    const x = norm(ours.ok);
    const y = norm(theirs.ok);
    for (const k of Object.keys(y) as (keyof typeof y)[]) expect([k, x[k]]).toEqual([k, y[k]]);
  }
  if ("err" in ours) {
    // Our error is a local class (documented in spl-token-lite.ts), not spl's, but name/message/class name match.
    let thrown: unknown;
    try {
      await fetchTokenAccount(conn(info).c, address, programId);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(TokenError);
    expect(thrown).toBeInstanceOf(Error);
  }
  return { ours, theirs };
}

/** Account bytes encoded by spl-token's own AccountLayout. */
type Base = {
  mint?: PublicKey;
  owner?: PublicKey;
  amount?: bigint;
  delegate?: PublicKey | null;
  state?: spl.AccountState;
  rentExemptReserve?: bigint | null;
  delegatedAmount?: bigint;
  closeAuthority?: PublicKey | null;
};
function encodeBase(b: Base = {}): Buffer {
  const out = Buffer.alloc(spl.ACCOUNT_SIZE);
  spl.AccountLayout.encode(
    {
      mint: b.mint ?? randKey(),
      owner: b.owner ?? walletKey(),
      amount: b.amount ?? 1_000_000n,
      delegateOption: b.delegate ? 1 : 0,
      delegate: b.delegate ?? PublicKey.default,
      state: b.state ?? spl.AccountState.Initialized,
      isNativeOption: b.rentExemptReserve != null ? 1 : 0,
      isNative: b.rentExemptReserve ?? 0n,
      delegatedAmount: b.delegatedAmount ?? 0n,
      closeAuthorityOption: b.closeAuthority ? 1 : 0,
      closeAuthority: b.closeAuthority ?? PublicKey.default,
    },
    out,
  );
  return out;
}

/** One TLV entry: u16 type, u16 length, value. */
function tlv(type: spl.ExtensionType, value: Buffer): Buffer {
  const h = Buffer.alloc(4);
  h.writeUInt16LE(type, 0);
  h.writeUInt16LE(value.length, 2);
  return Buffer.concat([h, value]);
}
function layoutBytes<T>(layout: { span: number; encode(v: T, b: Buffer): number }, v: T): Buffer {
  const b = Buffer.alloc(layout.span);
  layout.encode(v, b);
  return b;
}

/** Token-2022 account: 165 base bytes, AccountType::Account (2), then TLV extensions. */
function t22Account(base: Base, exts: [spl.ExtensionType, Buffer][], accountType = spl.AccountType.Account): Buffer {
  return Buffer.concat([encodeBase(base), Buffer.from([accountType]), ...exts.map(([t, v]) => tlv(t, v))]);
}

const info = (owner: PublicKey, data: Buffer, lamports = 2_039_280): AccountInfo<Buffer> => ({
  owner,
  data,
  lamports,
  executable: false,
  rentEpoch: 0,
});

describe("ata.ts vs spl-token: ATA derivation on 1,000 seeded (owner, mint) pairs per program", { timeout: 180_000 }, () => {
  const N = 1000;
  const pairs = Array.from({ length: N }, () => [walletKey(), randKey()] as const);

  for (const [label, program] of PROGRAMS) {
    it(`${label}: getAtaSync(owner, mint) == spl.getAssociatedTokenAddressSync(mint, owner) for ${N} pairs`, () => {
      let n = 0;
      for (const [owner, mint] of pairs) {
        const ours = getAtaSync(owner, mint, false, program);
        const theirs = spl.getAssociatedTokenAddressSync(mint, owner, false, program);
        expect(hex(ours)).toBe(hex(theirs));
        n++;
      }
      expect(n).toBe(N);
    });

    it(`${label}: async getAta == spl.getAssociatedTokenAddress for ${N} pairs`, async () => {
      for (const [owner, mint] of pairs) {
        const ours = await getAta(owner, mint, false, program);
        const theirs = await spl.getAssociatedTokenAddress(mint, owner, false, program);
        expect(hex(ours)).toBe(hex(theirs));
      }
    });
  }

  it("default program is TOKEN on both sides (getAtaSync(owner, mint) with no program)", () => {
    for (const [owner, mint] of pairs.slice(0, 100)) {
      expect(hex(getAtaSync(owner, mint))).toBe(hex(spl.getAssociatedTokenAddressSync(mint, owner)));
    }
  });

  it("TOKEN and TOKEN_2022 ATAs differ for every pair (program id is in the seeds)", () => {
    for (const [owner, mint] of pairs.slice(0, 100)) {
      expect(hex(getAtaSync(owner, mint, false, TOKEN))).not.toBe(hex(getAtaSync(owner, mint, false, T22)));
    }
  });
});

describe("ata.ts vs spl-token: off-curve (PDA) owners", { timeout: 60_000 }, () => {
  // PDAs from programs the deposit path actually meets, plus seeded random programs.
  const progs = [TOKEN, T22, spl.ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram.programId, ...Array.from({ length: 16 }, randKey)];
  const pdas = progs.map((p, i) => PublicKey.findProgramAddressSync([Buffer.from("vault"), Buffer.from([i])], p)[0]);
  const mints = pdas.map(() => randKey());

  it("every PDA owner is really off curve", () => {
    for (const p of pdas) expect(PublicKey.isOnCurve(p.toBytes())).toBe(false);
  });

  for (const [label, program] of PROGRAMS) {
    it(`${label}: allowOwnerOffCurve=false throws the same error class name, name and message (sync + async)`, async () => {
      for (let i = 0; i < pdas.length; i++) {
        const ours = run(() => getAtaSync(pdas[i], mints[i], false, program));
        const theirs = run(() => spl.getAssociatedTokenAddressSync(mints[i], pdas[i], false, program));
        expect(ours).toEqual({ err: { cls: "TokenOwnerOffCurveError", name: "TokenOwnerOffCurveError", message: "" } });
        expect(ours).toEqual(theirs);
        const oursA = await runAsync(() => getAta(pdas[i], mints[i], false, program));
        const theirsA = await runAsync(() => spl.getAssociatedTokenAddress(mints[i], pdas[i], false, program));
        expect(oursA).toEqual(theirsA);
      }
      // Default allowOwnerOffCurve is false on both sides.
      expect(run(() => getAtaSync(pdas[0], mints[0]))).toEqual(run(() => spl.getAssociatedTokenAddressSync(mints[0], pdas[0])));
      expect(() => getAtaSync(pdas[0], mints[0])).toThrow(TokenError);
    });

    it(`${label}: allowOwnerOffCurve=true derives the same address (sync + async)`, async () => {
      for (let i = 0; i < pdas.length; i++) {
        const ours = getAtaSync(pdas[i], mints[i], true, program);
        expect(hex(ours)).toBe(hex(spl.getAssociatedTokenAddressSync(mints[i], pdas[i], true, program)));
        expect(hex(await getAta(pdas[i], mints[i], true, program))).toBe(hex(ours));
      }
    });
  }
});

describe("ata.ts vs spl-token: fetchTokenAccount decode", { timeout: 60_000 }, () => {
  it("plain initialized account, both programs and the default program", async () => {
    for (const p of [undefined, TOKEN, T22]) {
      const { ours } = await diffFetch(info(p ?? TOKEN, encodeBase({ amount: u64() })), p);
      expect("ok" in ours).toBe(true);
    }
  });

  it("amount and delegatedAmount at u64 extremes come back as the same bigint", async () => {
    for (const amount of [0n, 1n, 2n ** 53n + 1n, 2n ** 63n, 2n ** 64n - 1n]) {
      const { ours } = await diffFetch(
        info(TOKEN, encodeBase({ amount, delegate: walletKey(), delegatedAmount: 2n ** 64n - 1n - amount })),
        TOKEN,
      );
      expect("ok" in ours && ours.ok.amount).toBe(amount);
    }
  });

  it("frozen account (state=Frozen) on both programs", async () => {
    for (const p of [TOKEN, T22]) {
      const { ours } = await diffFetch(info(p, encodeBase({ state: spl.AccountState.Frozen })), p);
      expect("ok" in ours && ours.ok.isFrozen).toBe(true);
    }
  });

  it("uninitialized account (state=Uninitialized)", async () => {
    const { ours } = await diffFetch(info(TOKEN, encodeBase({ state: spl.AccountState.Uninitialized, amount: 0n })), TOKEN);
    expect("ok" in ours && ours.ok.isInitialized).toBe(false);
  });

  it("delegated account (delegate + delegatedAmount) on both programs", async () => {
    for (const p of [TOKEN, T22]) {
      const delegate = walletKey();
      const { ours } = await diffFetch(info(p, encodeBase({ delegate, delegatedAmount: 777n })), p);
      expect("ok" in ours && hex(ours.ok.delegate)).toBe(hex(delegate));
    }
  });

  it("native wSOL account (isNative, rentExemptReserve = 2039280, amount = lamports - reserve)", async () => {
    const reserve = 2_039_280n;
    for (const p of [TOKEN, T22]) {
      const lamports = 5_000_000_000;
      const data = encodeBase({ mint: spl.NATIVE_MINT, amount: BigInt(lamports) - reserve, rentExemptReserve: reserve });
      const { ours } = await diffFetch(info(p, data, lamports), p);
      expect("ok" in ours && [ours.ok.isNative, ours.ok.rentExemptReserve]).toEqual([true, reserve]);
    }
  });

  it("everything at once: frozen + delegated + native + close authority", async () => {
    const closeAuthority = walletKey();
    const data = encodeBase({
      mint: spl.NATIVE_MINT,
      state: spl.AccountState.Frozen,
      delegate: walletKey(),
      delegatedAmount: 5n,
      rentExemptReserve: 2_039_280n,
      closeAuthority,
    });
    const { ours } = await diffFetch(info(TOKEN, data), TOKEN);
    expect("ok" in ours && hex(ours.ok.closeAuthority)).toBe(hex(closeAuthority));
  });

  it("seeded mix of 300 realistic accounts (random field combos, both programs)", async () => {
    for (let i = 0; i < 300; i++) {
      const p = rand() < 0.5 ? TOKEN : T22;
      const states = [spl.AccountState.Uninitialized, spl.AccountState.Initialized, spl.AccountState.Frozen];
      const data = encodeBase({
        amount: u64(),
        delegate: rand() < 0.5 ? walletKey() : null,
        delegatedAmount: u64(),
        state: states[Math.floor(rand() * 3)],
        rentExemptReserve: rand() < 0.3 ? u64() : null,
        closeAuthority: rand() < 0.5 ? randKey() : null,
      });
      const { ours } = await diffFetch(info(p, data), p);
      expect("ok" in ours).toBe(true);
    }
  });
});

describe("ata.ts vs spl-token: Token-2022 accounts with extensions (data > 165 bytes)", { timeout: 60_000 }, () => {
  const E = spl.ExtensionType;
  const extsFull: [spl.ExtensionType, Buffer][] = [
    [E.TransferFeeAmount, layoutBytes(spl.TransferFeeAmountLayout, { withheldAmount: 123_456_789n })],
    [E.ImmutableOwner, Buffer.alloc(0)],
    [E.MemoTransfer, layoutBytes(spl.MemoTransferLayout, { requireIncomingTransferMemos: true })],
    [E.CpiGuard, layoutBytes(spl.CpiGuardLayout, { lockCpi: true })],
    [E.NonTransferableAccount, Buffer.alloc(0)],
    [E.TransferHookAccount, layoutBytes(spl.TransferHookAccountLayout, { transferring: false })],
    [E.PausableAccount, Buffer.alloc(0)],
  ];

  it("sizes match spl.getAccountLen (sanity on the hand-built bytes)", () => {
    expect(t22Account({}, [[E.ImmutableOwner, Buffer.alloc(0)]]).length).toBe(spl.getAccountLen([E.ImmutableOwner]));
    expect(t22Account({}, extsFull).length).toBe(spl.getAccountLen(extsFull.map(([t]) => t)));
  });

  it("ATA-style account with only ImmutableOwner (what the ATA program creates for a Token-2022 mint)", async () => {
    const { ours } = await diffFetch(info(T22, t22Account({}, [[E.ImmutableOwner, Buffer.alloc(0)]])), T22);
    expect("ok" in ours && spl.getImmutableOwner(ours.ok as spl.Account)).not.toBeNull();
  });

  it("seven account extensions + frozen + delegated + close authority: every field and every extension decoder agree", async () => {
    const data = t22Account(
      { state: spl.AccountState.Frozen, delegate: walletKey(), delegatedAmount: 42n, closeAuthority: walletKey() },
      extsFull,
    );
    expect(data.length).toBeGreaterThan(165);
    const { ours, theirs } = await diffFetch(info(T22, data), T22);
    if (!("ok" in ours) || !("ok" in theirs)) throw new Error("expected decode");
    const a = ours.ok as spl.Account;
    const b = theirs.ok;
    expect(spl.getExtensionTypes(a.tlvData)).toEqual(spl.getExtensionTypes(b.tlvData));
    expect(spl.getExtensionTypes(a.tlvData)).toEqual(extsFull.map(([t]) => t));
    expect(spl.getTransferFeeAmount(a)).toEqual(spl.getTransferFeeAmount(b));
    expect(spl.getTransferFeeAmount(a)?.withheldAmount).toBe(123_456_789n);
    expect(spl.getMemoTransfer(a)).toEqual(spl.getMemoTransfer(b));
    expect(spl.getCpiGuard(a)).toEqual(spl.getCpiGuard(b));
    expect(spl.getTransferHookAccount(a)).toEqual(spl.getTransferHookAccount(b));
    expect(spl.getImmutableOwner(a)).toEqual(spl.getImmutableOwner(b));
    expect(spl.getNonTransferableAccount(a)).toEqual(spl.getNonTransferableAccount(b));
    expect(spl.getPausableAccount(a)).toEqual(spl.getPausableAccount(b));
  });

  it("native wSOL Token-2022 account with ImmutableOwner", async () => {
    const data = t22Account({ mint: spl.NATIVE_MINT_2022, rentExemptReserve: 2_074_080n }, [[E.ImmutableOwner, Buffer.alloc(0)]]);
    const { ours } = await diffFetch(info(T22, data), T22);
    expect("ok" in ours && ours.ok.isNative).toBe(true);
  });

  it("account-type byte only (166 bytes, empty TLV) and trailing zero padding", async () => {
    await diffFetch(info(T22, t22Account({}, [])), T22);
    await diffFetch(info(T22, Buffer.concat([t22Account({}, [[E.ImmutableOwner, Buffer.alloc(0)]]), Buffer.alloc(12)])), T22);
  });

  it("account-type byte = Mint (1) or Uninitialized (0) throws the same error", async () => {
    for (const t of [spl.AccountType.Mint, spl.AccountType.Uninitialized]) {
      const { ours } = await diffFetch(info(T22, t22Account({}, [[E.ImmutableOwner, Buffer.alloc(0)]], t)), T22);
      expect(ours).toEqual({ err: { cls: "TokenInvalidAccountError", name: "TokenInvalidAccountError", message: "" } });
    }
  });
});

describe("ata.ts vs spl-token: error paths", { timeout: 60_000 }, () => {
  const ownerErr = { err: { cls: "TokenInvalidAccountOwnerError", name: "TokenInvalidAccountOwnerError", message: "" } };
  const sizeErr = { err: { cls: "TokenInvalidAccountSizeError", name: "TokenInvalidAccountSizeError", message: "" } };

  it("account owned by the wrong program throws the same error", async () => {
    const cases: [PublicKey, PublicKey | undefined][] = [
      [T22, undefined], // Token-2022 account read with the default (TOKEN) program
      [T22, TOKEN],
      [TOKEN, T22],
      [SystemProgram.programId, TOKEN],
      [spl.ASSOCIATED_TOKEN_PROGRAM_ID, T22],
      [randKey(), TOKEN],
    ];
    for (const [owner, p] of cases) {
      const { ours } = await diffFetch(info(owner, encodeBase()), p);
      expect(ours).toEqual(ownerErr);
    }
  });

  it("owner check runs before the size check on both sides (wrong owner + short data)", async () => {
    const { ours } = await diffFetch(info(SystemProgram.programId, Buffer.alloc(0)), TOKEN);
    expect(ours).toEqual(ownerErr);
  });

  it("zero-length and short buffers throw the same error on both programs", async () => {
    for (const p of [TOKEN, T22]) {
      for (const len of [0, 1, 32, 64, 72, 108, 164]) {
        const { ours } = await diffFetch(info(p, encodeBase().subarray(0, len)), p);
        expect(ours).toEqual(sizeErr);
      }
    }
  });

  it("missing account (getAccountInfo -> null) throws the same error", async () => {
    const { ours } = await diffFetch(null, TOKEN);
    expect(ours).toEqual({ err: { cls: "TokenAccountNotFoundError", name: "TokenAccountNotFoundError", message: "" } });
  });
});
