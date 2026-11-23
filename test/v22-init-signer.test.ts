import { beforeAll, describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { ACCOUNTS_INIT_MARKET, ACCOUNTS_INIT_USER, buildAccountMetas } from "../src/abi/accounts.js";

// Fixed, distinct keys: Keypair.generate() paid a cold ed25519/crypto init inside the first
// case (~1 s under load vs a 5 s timeout). Only isSigner/isWritable are asserted, so any
// distinct valid keys do.
const k = (n: number) => new PublicKey(new Uint8Array(32).fill(n));

// Warm the accounts barrel + PublicKey path in a hook (own timeout) so no case pays it.
beforeAll(() => {
  buildAccountMetas(ACCOUNTS_INIT_MARKET, { admin: k(1), slab: k(2), mint: k(3) });
});

describe("D26: InitMarket / InitPortfolio require the new account's signature (rc23)", () => {
  it("InitMarket metas: admin signs, the slab (market account) signs, mint is read-only", () => {
    const [admin, slab, mint]: PublicKey[] = [k(1), k(2), k(3)];
    const m = buildAccountMetas(ACCOUNTS_INIT_MARKET, { admin, slab, mint });
    expect(m.map((x) => x.isSigner)).toEqual([true, true, false]);
    expect(m.map((x) => x.isWritable)).toEqual([true, true, false]);
  });

  it("InitPortfolio metas: owner signs, the existing market does not, the portfolio account signs", () => {
    const [owner, market, portfolio]: PublicKey[] = [k(4), k(5), k(6)];
    const m = buildAccountMetas(ACCOUNTS_INIT_USER, { owner, market, portfolio });
    expect(m.map((x) => x.isSigner)).toEqual([true, false, true]);
    expect(m.map((x) => x.isWritable)).toEqual([true, true, true]);
  });

  it("account order is unchanged (backward-compatible with the deployed wrapper)", () => {
    expect(ACCOUNTS_INIT_MARKET.map((s) => s.name)).toEqual(["admin", "slab", "mint"]);
    expect(ACCOUNTS_INIT_USER.map((s) => s.name)).toEqual(["owner", "market", "portfolio"]);
  });
});
