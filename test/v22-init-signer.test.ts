import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { ACCOUNTS_INIT_MARKET, ACCOUNTS_INIT_USER, buildAccountMetas } from "../src/abi/accounts.js";

const k = () => Keypair.generate().publicKey;

describe("D26: InitMarket / InitPortfolio require the new account's signature (rc23)", () => {
  it("InitMarket metas: admin signs, the slab (market account) signs, mint is read-only", () => {
    const [admin, slab, mint]: PublicKey[] = [k(), k(), k()];
    const m = buildAccountMetas(ACCOUNTS_INIT_MARKET, { admin, slab, mint });
    expect(m.map((x) => x.isSigner)).toEqual([true, true, false]);
    expect(m.map((x) => x.isWritable)).toEqual([true, true, false]);
  });

  it("InitPortfolio metas: owner signs, the existing market does not, the portfolio account signs", () => {
    const [owner, market, portfolio]: PublicKey[] = [k(), k(), k()];
    const m = buildAccountMetas(ACCOUNTS_INIT_USER, { owner, market, portfolio });
    expect(m.map((x) => x.isSigner)).toEqual([true, false, true]);
    expect(m.map((x) => x.isWritable)).toEqual([true, true, true]);
  });

  it("account order is unchanged (backward-compatible with the deployed wrapper)", () => {
    expect(ACCOUNTS_INIT_MARKET.map((s) => s.name)).toEqual(["admin", "slab", "mint"]);
    expect(ACCOUNTS_INIT_USER.map((s) => s.name)).toEqual(["owner", "market", "portfolio"]);
  });
});
