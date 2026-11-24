/**
 * Parity: src/solana/spl-token-lite.ts vs the real @solana/spl-token (devDependency).
 *
 * The SDK no longer imports @solana/spl-token at runtime (cold-import cost). Every
 * helper the shim provides is checked here byte for byte against the package on
 * fixed vectors and on seeded random inputs: program ids, derived ATA addresses,
 * off-curve errors, instruction data/keys/flags/programId, and token-account decode
 * (every field, every error path).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import * as lite from "../src/solana/spl-token-lite.js";
import { TOKEN_2022_PROGRAM_ID as TP_2022 } from "../src/solana/token-program.js";
import { TOKEN_2022_PROGRAM_ID as STAKE_2022 } from "../src/solana/stake.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID as PDA_ATA } from "../src/solana/pda.js";

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
const rand = rng(0x5eed2611);
const bytes = (n: number) => Buffer.from(Array.from({ length: n }, () => Math.floor(rand() * 256)));
/** Random 32 bytes: about half are off the ed25519 curve, so both ATA branches get hit. */
const randKey = () => new PublicKey(bytes(32));
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const N = 200;
const FIXED_OWNERS = [
  new PublicKey("11111111111111111111111111111111"),
  new PublicKey("So11111111111111111111111111111111111111112"),
  Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey, // on curve
  PublicKey.findProgramAddressSync([Buffer.from("pda")], spl.TOKEN_PROGRAM_ID)[0], // off curve
];
const FIXED_MINTS = [
  new PublicKey("So11111111111111111111111111111111111111112"),
  new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
];
const PROGRAMS = [spl.TOKEN_PROGRAM_ID, spl.TOKEN_2022_PROGRAM_ID];

/** Run both, return value or error name, so error paths are compared too. */
function both<T>(f: () => T, g: () => T): [T | string, T | string] {
  const run = (h: () => T) => {
    try {
      return h();
    } catch (e) {
      return `throw:${(e as Error).name}:${(e as Error).message}`;
    }
  };
  return [run(f), run(g)];
}
async function bothAsync<T>(f: () => Promise<T>, g: () => Promise<T>) {
  const run = async (h: () => Promise<T>) => {
    try {
      return await h();
    } catch (e) {
      return `throw:${(e as Error).name}:${(e as Error).message}`;
    }
  };
  return [await run(f), await run(g)] as const;
}
const keyHex = (k: unknown) => (k instanceof PublicKey ? Buffer.from(k.toBytes()).toString("hex") : k);

function ixBytes(ix: TransactionInstruction) {
  return {
    programId: keyHex(ix.programId),
    data: Buffer.from(ix.data).toString("hex"),
    keys: ix.keys.map((k) => [keyHex(k.pubkey), k.isSigner, k.isWritable]),
  };
}

describe("spl-token-lite: program ids", () => {
  it("TOKEN / TOKEN_2022 / ASSOCIATED_TOKEN ids are byte-identical to spl-token", () => {
    expect(keyHex(lite.TOKEN_PROGRAM_ID)).toBe(keyHex(spl.TOKEN_PROGRAM_ID));
    expect(keyHex(lite.TOKEN_2022_PROGRAM_ID)).toBe(keyHex(spl.TOKEN_2022_PROGRAM_ID));
    expect(keyHex(lite.ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(keyHex(spl.ASSOCIATED_TOKEN_PROGRAM_ID));
  });

  it("the SDK's other copies are the same value (and token-program/stake share one instance)", () => {
    expect(TP_2022).toBe(lite.TOKEN_2022_PROGRAM_ID);
    expect(STAKE_2022).toBe(lite.TOKEN_2022_PROGRAM_ID);
    expect(PDA_ATA.equals(spl.ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
  });

  it("ACCOUNT_SIZE matches spl-token", () => {
    expect(lite.ACCOUNT_SIZE).toBe(spl.ACCOUNT_SIZE);
  });
});

describe("spl-token-lite: ATA derivation", { timeout: 60_000 }, () => {
  const cases: [PublicKey, PublicKey, boolean, PublicKey | undefined, PublicKey | undefined][] = [];
  for (const o of FIXED_OWNERS)
    for (const m of FIXED_MINTS)
      for (const p of [undefined, ...PROGRAMS]) for (const off of [false, true]) cases.push([m, o, off, p, undefined]);
  for (let i = 0; i < N; i++)
    cases.push([randKey(), randKey(), rand() < 0.5, pick([undefined, ...PROGRAMS, randKey()]), rand() < 0.1 ? randKey() : undefined]);

  it(`getAssociatedTokenAddressSync matches on ${cases.length} vectors (fixed + random, both programs, off-curve both ways)`, () => {
    let threw = 0;
    let ok = 0;
    for (const [m, o, off, p, a] of cases) {
      const [x, y] = both(
        () => keyHex(lite.getAssociatedTokenAddressSync(m, o, off, p, a)),
        () => keyHex(spl.getAssociatedTokenAddressSync(m, o, off, p, a)),
      );
      expect(x).toBe(y);
      if (typeof x === "string" && x.startsWith("throw:")) threw++;
      else ok++;
    }
    // Both branches really exercised.
    expect(threw).toBeGreaterThan(10);
    expect(ok).toBeGreaterThan(10);
  });

  it("async getAssociatedTokenAddress matches (values and rejections)", async () => {
    for (const [m, o, off, p, a] of cases.slice(0, 60)) {
      const [x, y] = await bothAsync(
        async () => keyHex(await lite.getAssociatedTokenAddress(m, o, off, p, a)),
        async () => keyHex(await spl.getAssociatedTokenAddress(m, o, off, p, a)),
      );
      expect(x).toBe(y);
    }
  });

  it("off-curve owner throws a TokenOwnerOffCurveError with the same name and message", () => {
    const pda = FIXED_OWNERS[3];
    expect(() => lite.getAssociatedTokenAddressSync(FIXED_MINTS[0], pda)).toThrow(lite.TokenOwnerOffCurveError);
    const [x, y] = both(
      () => lite.getAssociatedTokenAddressSync(FIXED_MINTS[0], pda),
      () => spl.getAssociatedTokenAddressSync(FIXED_MINTS[0], pda),
    );
    expect(x).toBe("throw:TokenOwnerOffCurveError:");
    expect(x).toBe(y);
  });
});

describe("spl-token-lite: createAssociatedTokenAccountIdempotentInstruction", { timeout: 60_000 }, () => {
  it(`matches data, keys, flags and programId on ${N + 3} vectors`, () => {
    const vectors: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey | undefined, PublicKey | undefined][] = [
      [FIXED_OWNERS[2], FIXED_OWNERS[0], FIXED_OWNERS[2], FIXED_MINTS[0], undefined, undefined],
      [FIXED_OWNERS[2], FIXED_OWNERS[0], FIXED_OWNERS[2], FIXED_MINTS[1], spl.TOKEN_2022_PROGRAM_ID, undefined],
      [FIXED_OWNERS[2], FIXED_OWNERS[0], FIXED_OWNERS[3], FIXED_MINTS[1], spl.TOKEN_PROGRAM_ID, spl.ASSOCIATED_TOKEN_PROGRAM_ID],
    ];
    for (let i = 0; i < N; i++)
      vectors.push([randKey(), randKey(), randKey(), randKey(), pick([undefined, ...PROGRAMS, randKey()]), rand() < 0.2 ? randKey() : undefined]);
    for (const args of vectors) {
      const a = ixBytes(lite.createAssociatedTokenAccountIdempotentInstruction(...args));
      const b = ixBytes(spl.createAssociatedTokenAccountIdempotentInstruction(...args));
      expect(a).toEqual(b);
    }
    const ix = lite.createAssociatedTokenAccountIdempotentInstruction(...vectors[0]);
    expect(Buffer.isBuffer(ix.data)).toBe(true);
    expect(ix.data).toEqual(Buffer.from([1]));
    expect(ix.keys).toHaveLength(6);
  });
});

describe("spl-token-lite: token account decode (unpackAccount / getAccount)", { timeout: 60_000 }, () => {
  /** Normalize an Account for byte-level comparison. */
  function norm(a: spl.Account | lite.Account) {
    return {
      address: keyHex(a.address),
      mint: keyHex(a.mint),
      owner: keyHex(a.owner),
      amount: a.amount,
      delegate: a.delegate && keyHex(a.delegate),
      delegatedAmount: a.delegatedAmount,
      isInitialized: a.isInitialized,
      isFrozen: a.isFrozen,
      isNative: a.isNative,
      rentExemptReserve: a.rentExemptReserve,
      closeAuthority: a.closeAuthority && keyHex(a.closeAuthority),
      tlvData: Buffer.from(a.tlvData).toString("hex"),
      tlvIsBuffer: Buffer.isBuffer(a.tlvData),
      keys: Object.keys(a).sort(),
    };
  }

  function randomAccountData(): Buffer {
    const len = pick([165, 165, 165, 164, 0, 166, 170, 182, 300, 355, 356]);
    const d = bytes(len);
    if (len >= 165) {
      // Mix realistic option tags (0/1) with arbitrary u32 values and all AccountState values.
      const opt = () => pick([0, 1, 1, 0, 0xffffffff, 2, 256]);
      d.writeUInt32LE(opt(), 72);
      d[108] = pick([0, 1, 2, 3, 255]);
      d.writeUInt32LE(opt(), 109);
      d.writeUInt32LE(opt(), 129);
      if (len > 165) d[165] = pick([2, 2, 2, 1, 0, 9]);
    }
    return d;
  }

  const fixed: Buffer[] = [];
  {
    // A plain initialized account, a frozen native account with delegate+close authority, a Token-2022 account with TLV.
    const a = Buffer.alloc(165);
    FIXED_MINTS[0].toBuffer().copy(a, 0);
    FIXED_OWNERS[2].toBuffer().copy(a, 32);
    a.writeBigUInt64LE(1234n, 64);
    a[108] = 1;
    fixed.push(a);
    const b = Buffer.from(a);
    b.writeUInt32LE(1, 72);
    FIXED_OWNERS[0].toBuffer().copy(b, 76);
    b[108] = 2;
    b.writeUInt32LE(1, 109);
    b.writeBigUInt64LE(2039280n, 113);
    b.writeBigUInt64LE(0xffffffffffffffffn, 121);
    b.writeUInt32LE(1, 129);
    FIXED_OWNERS[3].toBuffer().copy(b, 133);
    fixed.push(b);
    fixed.push(Buffer.concat([a, Buffer.from([2, 7, 0, 2, 0, 0xaa, 0xbb])]));
  }

  it(`unpackAccount matches every field and every error on ${fixed.length + N * 2} vectors`, () => {
    const datas = [...fixed, ...Array.from({ length: N * 2 }, randomAccountData)];
    const outcomes = new Set<string>();
    for (const data of datas) {
      const address = randKey();
      const program = pick(PROGRAMS);
      const owner = rand() < 0.9 ? program : pick([...PROGRAMS, randKey()]);
      const passProgram = rand() < 0.3 ? undefined : program;
      const info = { owner, data, lamports: 1, executable: false, rentEpoch: 0 };
      const [x, y] = both(
        () => norm(lite.unpackAccount(address, info, passProgram)),
        () => norm(spl.unpackAccount(address, info, passProgram)),
      );
      expect(x).toEqual(y);
      outcomes.add(typeof x === "string" ? x : "ok");
    }
    for (const [x, y] of [both(() => lite.unpackAccount(randKey(), null), () => spl.unpackAccount(randKey(), null))]) {
      expect(x).toEqual(y);
      outcomes.add(String(x));
    }
    // Every branch was reached.
    expect([...outcomes].sort()).toEqual(
      [
        "ok",
        "throw:TokenAccountNotFoundError:",
        "throw:TokenInvalidAccountError:",
        "throw:TokenInvalidAccountOwnerError:",
        "throw:TokenInvalidAccountSizeError:",
      ].sort(),
    );
  });

  it("decodes from a Uint8Array view at a non-zero byteOffset the same as spl-token", () => {
    const backing = Buffer.concat([Buffer.alloc(13, 0xee), fixed[1], Buffer.alloc(5)]);
    const data = backing.subarray(13, 13 + 165);
    const info = { owner: spl.TOKEN_PROGRAM_ID, data, lamports: 1, executable: false, rentEpoch: 0 };
    const addr = randKey();
    expect(norm(lite.unpackAccount(addr, info))).toEqual(norm(spl.unpackAccount(addr, info)));
  });

  it("getAccount passes address and commitment to getAccountInfo and decodes identically", async () => {
    for (const commitment of [undefined, "confirmed", "finalized"] as const) {
      for (const program of [undefined, ...PROGRAMS]) {
        const data = fixed[2];
        const calls: unknown[][] = [];
        const conn = {
          getAccountInfo: async (...args: unknown[]) => {
            calls.push(args);
            return { owner: program ?? spl.TOKEN_PROGRAM_ID, data, lamports: 1, executable: false, rentEpoch: 0 };
          },
        } as never;
        const addr = randKey();
        const a = norm(await lite.getAccount(conn, addr, commitment, program));
        const b = norm(await spl.getAccount(conn, addr, commitment, program));
        expect(a).toEqual(b);
        expect(keyHex(calls[0][0])).toBe(keyHex(calls[1][0]));
        expect(calls[0][1]).toBe(calls[1][1]);
      }
    }
  });
});

describe("spl-token-lite: no runtime spl-token import left", () => {
  const root = path.resolve(__dirname, "..");
  it("no non-test file under src/ imports @solana/spl-token", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__") walk(p);
        } else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) {
          if (/from\s+["']@solana\/spl-token["']|import\(\s*["']@solana\/spl-token["']\s*\)/.test(fs.readFileSync(p, "utf8"))) hits.push(p);
        }
      }
    };
    walk(path.join(root, "src"));
    expect(hits).toEqual([]);
  });

  it("dist/index.js does not import @solana/spl-token and package.json lists it only as a devDependency", () => {
    const dist = fs.readFileSync(path.join(root, "dist", "index.js"), "utf8");
    expect(dist).not.toMatch(/["']@solana\/spl-token["']/);
    // Types too: a .d.ts that imports spl-token would break consumers now that it is a devDependency.
    const dts: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".d.ts") && /["']@solana\/spl-token["']/.test(fs.readFileSync(p, "utf8"))) dts.push(p);
      }
    };
    walk(path.join(root, "dist"));
    expect(dts).toEqual([]);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.dependencies?.["@solana/spl-token"]).toBeUndefined();
    expect(pkg.devDependencies?.["@solana/spl-token"]).toBeDefined();
  });
});
