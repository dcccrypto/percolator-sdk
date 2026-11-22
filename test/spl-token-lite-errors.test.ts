/**
 * Error contract of src/solana/spl-token-lite.ts vs the real @solana/spl-token (follow-up to #653).
 *
 * Since #653 the SDK's public token helpers (`fetchTokenAccount`, `getAta`, `getAtaSync`) throw the
 * shim's own error classes, not spl-token's. This file pins what that means for a caller:
 *
 * - `.name`, `.message`, `String(err)` and `err instanceof Error` are identical to spl-token's.
 * - `err instanceof (spl-token's) TokenAccountNotFoundError` etc. is FALSE for SDK-thrown errors.
 *   This is a known, documented difference. Callers must branch on `err.name`. If a future change
 *   makes instanceof match (for example, by re-exporting spl-token's classes), update this test
 *   on purpose.
 * - The shim's classes are not exported from the package barrel, so no consumer can import them.
 *
 * The consumer-pattern block copies the error checks that exist in the v2.2 consumers
 * (launch feat/v22-app 983ac59a, keeper feat/v22-keeper-growth 825708f0, indexer feat/v22-indexer
 * 454b239c). It shows which of them still match.
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import * as lite from "../src/solana/spl-token-lite.js";
import { fetchTokenAccount, getAta, getAtaSync } from "../src/solana/ata.js";
import * as barrel from "../src/index.js";

const NAMES = [
  "TokenAccountNotFoundError",
  "TokenInvalidAccountOwnerError",
  "TokenInvalidAccountSizeError",
  "TokenInvalidAccountError",
  "TokenOwnerOffCurveError",
] as const;
type Name = (typeof NAMES)[number];

const MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const WALLET = Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey; // on curve
const PDA = PublicKey.findProgramAddressSync([Buffer.from("pda")], spl.TOKEN_PROGRAM_ID)[0]; // off curve
const ADDR = Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey;

/** A Connection whose getAccountInfo returns `info` for every address. */
function conn(info: { owner: PublicKey; data: Buffer } | null): Connection {
  return {
    getAccountInfo: async () => (info ? { ...info, lamports: 1, executable: false, rentEpoch: 0 } : null),
  } as unknown as Connection;
}

async function caught(p: Promise<unknown> | (() => unknown)): Promise<Error> {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected a throw");
}

/** The same failure from the SDK's public helper and from real spl-token. */
const CASES: Array<{ name: Name; sdk: () => Promise<unknown> | unknown; real: () => Promise<unknown> | unknown }> = [
  {
    name: "TokenAccountNotFoundError",
    sdk: () => fetchTokenAccount(conn(null), ADDR),
    real: () => spl.getAccount(conn(null), ADDR),
  },
  {
    name: "TokenInvalidAccountOwnerError",
    sdk: () => fetchTokenAccount(conn({ owner: PDA, data: Buffer.alloc(165) }), ADDR),
    real: () => spl.getAccount(conn({ owner: PDA, data: Buffer.alloc(165) }), ADDR),
  },
  {
    name: "TokenInvalidAccountSizeError",
    sdk: () => fetchTokenAccount(conn({ owner: spl.TOKEN_PROGRAM_ID, data: Buffer.alloc(100) }), ADDR),
    real: () => spl.getAccount(conn({ owner: spl.TOKEN_PROGRAM_ID, data: Buffer.alloc(100) }), ADDR),
  },
  {
    name: "TokenInvalidAccountError",
    sdk: () =>
      fetchTokenAccount(
        conn({ owner: spl.TOKEN_2022_PROGRAM_ID, data: Buffer.concat([Buffer.alloc(165), Buffer.from([1])]) }),
        ADDR,
        spl.TOKEN_2022_PROGRAM_ID,
      ),
    real: () =>
      spl.getAccount(
        conn({ owner: spl.TOKEN_2022_PROGRAM_ID, data: Buffer.concat([Buffer.alloc(165), Buffer.from([1])]) }),
        ADDR,
        undefined,
        spl.TOKEN_2022_PROGRAM_ID,
      ),
  },
  {
    name: "TokenOwnerOffCurveError",
    sdk: () => getAtaSync(PDA, MINT),
    real: () => spl.getAssociatedTokenAddressSync(MINT, PDA),
  },
  {
    name: "TokenOwnerOffCurveError",
    sdk: () => getAta(PDA, MINT),
    real: () => spl.getAssociatedTokenAddress(MINT, PDA),
  },
];

describe("spl-token-lite error classes vs @solana/spl-token", () => {
  it.each(NAMES)("%s: same name, message and String(), but a different class", (name) => {
    const Lite = lite[name];
    const Real = spl[name];
    const a = new Lite();
    const b = new Real();
    expect(a.name).toBe(name);
    expect(b.name).toBe(name);
    expect(a.message).toBe(b.message);
    expect(a.message).toBe("");
    expect(String(a)).toBe(String(b));
    expect(String(a)).toBe(name);
    expect(Object.prototype.hasOwnProperty.call(a, "name")).toBe(Object.prototype.hasOwnProperty.call(b, "name"));
    expect(a).toBeInstanceOf(Error);
    expect(a).toBeInstanceOf(lite.TokenError);
    // Documented difference (see the module header): the classes are not shared.
    expect(a instanceof Real).toBe(false);
    expect(a instanceof spl.TokenError).toBe(false);
    expect(b instanceof Lite).toBe(false);
  });

  it("the shim's error classes stay internal: the package barrel exports none of them", () => {
    for (const name of [...NAMES, "TokenError"]) expect(name in barrel).toBe(false);
    // ...but the public helpers that throw them are exported.
    expect(barrel.fetchTokenAccount).toBe(fetchTokenAccount);
    expect(barrel.getAta).toBe(getAta);
    expect(barrel.getAtaSync).toBe(getAtaSync);
  });
});

describe("SDK public helpers throw the same-named error as spl-token", () => {
  it.each(CASES.map((c, i) => [`${i}:${c.name}`, c] as const))("%s", async (_label, c) => {
    const sdkErr = await caught(c.sdk);
    const realErr = await caught(c.real);
    expect(realErr.name).toBe(c.name);
    expect(sdkErr.name).toBe(c.name);
    expect(sdkErr.message).toBe(realErr.message);
    expect(String(sdkErr)).toBe(String(realErr));
    expect(sdkErr).toBeInstanceOf(Error);
    expect(sdkErr).toBeInstanceOf(lite[c.name]);
    // The #653 behaviour change: true before #653 (the SDK re-threw spl-token's own instance), false now.
    expect(sdkErr instanceof spl[c.name]).toBe(false);
    expect(realErr instanceof spl[c.name]).toBe(true);
  });
});

describe("consumer error checks (copied from the v2.2 consumers) against SDK-thrown errors", () => {
  const missing = () => caught(fetchTokenAccount(conn(null), ADDR));

  it("name check (`e.name === 'TokenAccountNotFoundError'`), the recommended form, still matches", async () => {
    const e = await missing();
    const isMissing = (err: unknown) => (err as { name?: unknown } | null)?.name === "TokenAccountNotFoundError";
    expect(isMissing(e)).toBe(true);
    expect(isMissing(await caught(spl.getAccount(conn(null), ADDR)))).toBe(true);
  });

  it("launch app/lib/errorMessages.ts:580-586 `rawMsg.includes(name)` matches when rawMsg is String(err)", async () => {
    for (const c of CASES) {
      const sdkRaw = String(await caught(c.sdk));
      const realRaw = String(await caught(c.real));
      expect(sdkRaw.includes(c.name)).toBe(realRaw.includes(c.name));
      expect(sdkRaw.includes(c.name)).toBe(true);
    }
  });

  it("launch app/components/playground/SimUsdcBalance.tsx:74-81 uses spl-token's own getAccount, so it is unaffected", async () => {
    // The exact pattern: getAccount and TokenAccountNotFoundError both imported from @solana/spl-token.
    let balance: bigint | null = null;
    try {
      balance = (await spl.getAccount(conn(null), ADDR, "confirmed", spl.TOKEN_PROGRAM_ID)).amount;
    } catch (e) {
      if (!(e instanceof spl.TokenAccountNotFoundError)) throw e;
      balance = 0n;
    }
    expect(balance).toBe(0n);
  });

  it("the same pattern with the SDK's fetchTokenAccount would NOT match (no consumer does this today)", async () => {
    const run = async () => {
      try {
        await fetchTokenAccount(conn(null), ADDR);
        return "exists";
      } catch (e) {
        if (!(e instanceof spl.TokenAccountNotFoundError)) throw e;
        return "create-ata";
      }
    };
    await expect(run()).rejects.toThrow(lite.TokenAccountNotFoundError);
  });

  it("keeper src/cross-cluster/v22/earn-exit.ts:109 getAtaSync(redeemer, mint, true) never throws off-curve", () => {
    expect(() => getAtaSync(PDA, MINT, true)).not.toThrow();
    expect(getAtaSync(PDA, MINT, true).equals(spl.getAssociatedTokenAddressSync(MINT, PDA, true))).toBe(true);
    expect(getAtaSync(WALLET, MINT).equals(spl.getAssociatedTokenAddressSync(MINT, WALLET))).toBe(true);
  });
});
