/**
 * bigtest-2026-11-05 F2: tag 5 takes the market's bound vault-LP portfolio as an OPTIONAL last account (wrapper
 * feat/v22-wrap-liq-adl-latch); a liquidation then matches a clean close against the vault LP instead of ADL-scaling
 * its side, so the asset is not latched reduce-only (120). Reference: percolator-prog tests/p3_vault_lp.rs `f2_tag5_*`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  buildCatchUpAndRefreshIxsV22, buildRefreshCrankIxV22, boundVaultLpPortfolioV22, decodeAssetVaultLpP3,
  decodeMarketFundingV22, PROGRAM_IDS_DEVNET_V22,
} from "../src/index.js";
import { stampMarket } from "./helpers/stamp.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-q7-devnet-2026-10-12.json", import.meta.url), "utf8")) as { market: string; portfolio: string; lp: string; owner: string; accounts: { market: string } };
const marketData = new Uint8Array(Buffer.from(FX.accounts.market, "base64"));
const W = new PublicKey(PROGRAM_IDS_DEVNET_V22.percolator), MKT = new PublicKey(FX.market), P = new PublicKey(FX.portfolio), OWNER = new PublicKey(FX.owner);
const SL = decodeMarketFundingV22(marketData).assets[0]!.slotLast;
const P3FX = JSON.parse(readFileSync(new URL("./fixtures/p3-parity.json", import.meta.url), "utf8")) as { assetVaultLpOffsets: { marketLenCap4: number; rows: { recordHex: string; sdkOffset: number }[] } };

describe("bigtest F2: the vault-LP counterparty on tag 5", () => {
  it("boundVaultLpPortfolioV22 returns the first bound asset's vault LP (the wrapper's market_bound_vault_asset)", () => {
    const lp = boundVaultLpPortfolioV22(marketData);
    let first: PublicKey | null = null;
    for (let i = 0; i < 5 && first === null; i++) {
      const r = decodeAssetVaultLpP3(marketData, i);
      if (r.bound) first = r.vaultLpPortfolio;
    }
    expect(lp?.toBase58() ?? null).toBe(first?.toBase58() ?? null);
  });
  it("synthetic market (p3 parity record): bound on asset 2 -> its LP; no record -> null", () => {
    const row = P3FX.assetVaultLpOffsets.rows[2]!;
    const empty = stampMarket(new Uint8Array(P3FX.assetVaultLpOffsets.marketLenCap4));
    expect(boundVaultLpPortfolioV22(empty)).toBeNull();
    const bound = stampMarket(new Uint8Array(P3FX.assetVaultLpOffsets.marketLenCap4));
    bound.set(Buffer.from(row.recordHex, "hex"), row.sdkOffset);
    const lp = boundVaultLpPortfolioV22(bound);
    expect(lp!.toBytes().every((b) => b === 0xa2)).toBe(true);
  });
  it("buildRefreshCrankIxV22: without the option the account list is unchanged (3 base accounts)", () => {
    const ix = buildRefreshCrankIxV22(W, MKT, OWNER, P, []);
    expect(ix.keys).toHaveLength(3);
  });
  it("buildRefreshCrankIxV22: the vault LP is appended LAST, writable, not a signer; data unchanged", () => {
    const lp = new PublicKey(FX.lp);
    const plain = buildRefreshCrankIxV22(W, MKT, OWNER, P, [0]);
    const ix = buildRefreshCrankIxV22(W, MKT, OWNER, P, [0], { vaultLpCounterparty: lp });
    expect(ix.keys).toHaveLength(4);
    expect(ix.keys[3]).toEqual({ pubkey: lp, isSigner: false, isWritable: true });
    expect(Buffer.from(ix.data).equals(Buffer.from(plain.data))).toBe(true);
  });
  it("buildCatchUpAndRefreshIxsV22: the LP goes on the refresh/liquidation cranks only, never on the observes", () => {
    const lp = new PublicKey(FX.lp);
    const p = buildCatchUpAndRefreshIxsV22({ programId: W, market: MKT, marketData, cranker: OWNER, portfolio: P, observePortfolio: lp, readSlot: SL + 10n, liquidationCrank: true, vaultLpCounterparty: lp });
    const c = p.txs[0]!.instructions.filter((i) => i.programId.equals(W));
    expect(c).toHaveLength(3); // observe, refresh, liquidation crank
    expect(c[0]!.keys).toHaveLength(3);
    for (const k of [c[1]!, c[2]!]) {
      expect(k.keys[2]!.pubkey.equals(P)).toBe(true);
      expect(k.keys).toHaveLength(4);
      expect(k.keys[3]!.pubkey.equals(lp)).toBe(true);
      expect(k.keys[3]!.isWritable).toBe(true);
    }
  });
});
