/**
 * Branch coverage for src/solana/p3-vault-lp.ts (guards, fail-closed paths, floor rounding).
 * Parity cases are hand-computed from percolator-prog src/vault_lp_v18.rs (ca06715a):
 *   mul_div_floor :20 (floor, None on d == 0), senior_shares_for_deposit :125,
 *   senior_atoms_for_redemption :140, vault_lp_senior_pricing_claim :490 (saturating),
 *   live_exit_senior_value :692.
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { LAYOUT_V21 } from "../src/abi/layout.js";
import { deriveLpVaultRegistry } from "../src/solana/pda.js";
import {
  assetVaultLpAccountOffsetP3,
  readAssetPricesP3,
  decodeVaultLpStateP3,
  decodeAssetVaultLpDrawP3,
  decodeAssetVaultLpRecordP3,
  decodeAssetVaultLpP3,
  decodeResolvedPayoutReceiptP3,
  listOpenResolvedReceiptsP3,
  vaultLpEquityLagBoundsP3,
  vaultLpSeniorPricingClaimP3,
  liveExitSeniorValueP3,
  boundVaultSeniorValueP3,
  boundVaultRedemptionAtomsP3,
  boundVaultDepositQuoteP3,
} from "../src/solana/p3-vault-lp.js";
import { stampPortfolio } from "./helpers/stamp.js";

describe("p3-vault-lp guards", () => {
  it("rejects bad asset indices and too-short unstamped buffers (header-length guard, not the per-asset guards)", () => {
    expect(() => assetVaultLpAccountOffsetP3(-1)).toThrow(/non-negative integer/);
    expect(() => assetVaultLpAccountOffsetP3(1.5)).toThrow(/non-negative integer/);
    expect(() => readAssetPricesP3(new Uint8Array(8), -1)).toThrow(/non-negative integer/);
    expect(() => readAssetPricesP3(new Uint8Array(8), 0)).toThrow();
    expect(() => decodeVaultLpStateP3(new Uint8Array(10))).toThrow(/need/);
    expect(() => decodeAssetVaultLpDrawP3(new Uint8Array(8), -1)).toThrow();
    expect(() => decodeAssetVaultLpDrawP3(new Uint8Array(8), 0)).toThrow();
    expect(() => decodeAssetVaultLpRecordP3(new Uint8Array(127))).toThrow(/128 bytes/);
    expect(() => decodeAssetVaultLpP3(new Uint8Array(8), 0)).toThrow();
    expect(() => decodeResolvedPayoutReceiptP3(new Uint8Array(10))).toThrow(/too short/);
  });
});

describe("p3-vault-lp pricing parity (vault_lp_v18.rs)", () => {
  it("vault_lp_senior_pricing_claim :490 saturates at 0 and nets only the uncovered deficit", () => {
    expect(vaultLpSeniorPricingClaimP3(1_000n, 300n, 100n)).toBe(800n); // 1000 - (300-100)
    expect(vaultLpSeniorPricingClaimP3(1_000n, 100n, 300n)).toBe(1_000n); // surplus covers the deficit
    expect(vaultLpSeniorPricingClaimP3(100n, 500n, 0n)).toBe(0n); // 100 - 500 saturates
  });

  it("live_exit_senior_value :692 — both signs of worse, saturating nav - d", () => {
    expect(liveExitSeniorValueP3(1_000n, 800n, 200n, 50n)).toBe(850n); // 800 + min(200,50)
    expect(liveExitSeniorValueP3(1_000n, 990n, 200n, 50n)).toBe(1_000n); // capped at C
    expect(liveExitSeniorValueP3(1_000n, 800n, 200n, -100n)).toBe(700n); // min(800-100, 1000-100)
    expect(liveExitSeniorValueP3(1_000n, 1_500n, 0n, -100n)).toBe(1_000n); // surplus 500 covers d: C'=1000, min(1400,1000)
    expect(liveExitSeniorValueP3(1_000n, 50n, 0n, -100n)).toBe(0n); // nav - d saturates
    expect(boundVaultSeniorValueP3({ nav: 800n, seniorClaim: 1_000n, lpValue: 200n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: -100n })).toBe(700n);
    expect(boundVaultSeniorValueP3({ nav: 99n, seniorClaim: 1_000n, lpValue: 200n, resolved: true, physicalIdleBacking: 40n, lpEquityWorse: 0n })).toBe(40n); // resolved: min(idle, C)
  });

  it("senior_atoms_for_redemption :140 floors and fails closed on S == 0 / shares > S", () => {
    expect(boundVaultRedemptionAtomsP3(1n, 3n, 10n)).toBe(3n); // floor(10/3)
    expect(boundVaultRedemptionAtomsP3(2n, 3n, 10n)).toBe(6n); // floor(20/3)
    expect(boundVaultRedemptionAtomsP3(3n, 3n, 10n)).toBe(10n);
    expect(boundVaultRedemptionAtomsP3(0n, 3n, 10n)).toBe(0n);
    expect(boundVaultRedemptionAtomsP3(0n, 0n, 10n)).toBeNull(); // S == 0
    expect(boundVaultRedemptionAtomsP3(4n, 3n, 10n)).toBeNull(); // shares > S
  });
});

describe("p3-vault-lp deposit quote parity (senior_shares_for_deposit :125)", () => {
  const base = {
    amount: 1_000n, totalShares: 3_000n, seniorClaim: 2_000n, harvestable: 0n, seniorFeeShareBps: 10_000,
    nav: 2_000n, lpValue: 0n, seniorDrawOutstandingAtoms: 0n, lpEquityBetter: 0n,
  };
  it("S > 0 with senior value 0 fails closed (None -> EngineInvalidConfig)", () => {
    expect(boundVaultDepositQuoteP3({ ...base, seniorClaim: 0n, nav: 0n })).toEqual({ ok: false, error: "EngineInvalidConfig" });
  });
  it("floors to zero shares -> LpVaultZeroSharesMinted", () => {
    expect(boundVaultDepositQuoteP3({ ...base, amount: 1n, totalShares: 1n })).toEqual({ ok: false, error: "LpVaultZeroSharesMinted" }); // floor(1*1/2000)=0
  });
  it("better-of pricing while a draw is outstanding: above-C capped by the outstanding draw", () => {
    const q = { ...base, nav: 2_200n, seniorDrawOutstandingAtoms: 300n };
    // vBetter = 2200 + max(0,better); above = max(0, vBetter-2000); cEff = 2000 + min(above, 300)
    expect(boundVaultDepositQuoteP3({ ...q, lpEquityBetter: -50n })).toMatchObject({ ok: true, cEff: 2_200n, shares: 1_363n }); // floor(3e6/2200)
    // above 700 -> min 300 -> cEff 2300 > nav 2200 and no lpValue: impaired (refused)
    expect(boundVaultDepositQuoteP3({ ...q, lpEquityBetter: 500n })).toEqual({ ok: false, error: "VaultLpSeniorImpaired" });
    expect(boundVaultDepositQuoteP3({ ...q, lpEquityBetter: 500n, lpValue: 100n })).toMatchObject({ ok: true, cEff: 2_300n, shares: 1_304n }); // floor(3e6/2300)
    expect(boundVaultDepositQuoteP3({ ...base, seniorDrawOutstandingAtoms: 300n, lpEquityBetter: -50n })).toMatchObject({ ok: true, cEff: 2_000n, shares: 1_500n }); // vBetter <= cEff -> above 0
  });
});

describe("p3-vault-lp equity lag bounds (flat vault LP)", () => {
  const flat = { legs: [], certifiedEquity: 0n };
  it("adds only negative pnl / fee credits, floors at 0", () => {
    expect(vaultLpEquityLagBoundsP3({ ...flat, capital: 100n, pnl: -30n, feeCredits: -20n })).toEqual({ worse: 50n, better: 50n });
    expect(vaultLpEquityLagBoundsP3({ ...flat, capital: 100n, pnl: 10n, feeCredits: 5n })).toEqual({ worse: 100n, better: 100n });
    expect(vaultLpEquityLagBoundsP3({ ...flat, capital: 10n, pnl: -50n, feeCredits: 0n })).toEqual({ worse: 0n, better: 0n });
  });
  it("legs: ceil per side, long vs short, eff == target contributes nothing", () => {
    const leg = (basisPosQ: bigint, eff: bigint, target: bigint) => ({ basisPosQ, effectivePriceE6: eff, rawOracleTargetPriceE6: target });
    const r = vaultLpEquityLagBoundsP3({
      legs: [leg(1_500_000n, 100n, 99n), leg(-1_500_000n, 100n, 101n), leg(5n, 7n, 7n)], certifiedEquity: 1_000n, capital: 0n, pnl: 0n, feeCredits: 0n,
    });
    // long down 1: adverse ceil(1.5)=2; short up 1: adverse ceil(1.5)=2; flat leg 0
    expect(r).toEqual({ worse: 996n, better: 1_000n });
    const fav = vaultLpEquityLagBoundsP3({ legs: [leg(1_500_000n, 99n, 100n), leg(-1_500_000n, 101n, 100n)], certifiedEquity: 1_000n, capital: 0n, pnl: 0n, feeCredits: 0n });
    expect(fav).toEqual({ worse: 1_000n, better: 1_004n });
  });
});

describe("listOpenResolvedReceiptsP3 filters", () => {
  const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
  const market = Keypair.generate().publicKey;
  const acct = (len: number, owner: PublicKey) => {
    const d = new Uint8Array(len);
    d.set(market.toBytes(), 16); d.set(owner.toBytes(), 80);
    d[9369 + 64] = 1;
    return stampPortfolio(d);
  };
  it("explicit layout queries once; dedups, skips wrong length and flags the vault LP", async () => {
    const [registry] = deriveLpVaultRegistry(W, market);
    const dup = Keypair.generate().publicKey;
    const len = LAYOUT_V21.portfolio.accountLen;
    const accs = [
      { pubkey: dup, account: { data: Buffer.from(acct(len, Keypair.generate().publicKey)) } },
      { pubkey: dup, account: { data: Buffer.from(acct(len, Keypair.generate().publicKey)) } },
      { pubkey: Keypair.generate().publicKey, account: { data: Buffer.alloc(len - 1) } },
      { pubkey: Keypair.generate().publicKey, account: { data: Buffer.from(acct(len, registry)) } },
    ];
    let calls = 0;
    const conn = { getProgramAccounts: async () => { calls++; return accs; } } as unknown as Parameters<typeof listOpenResolvedReceiptsP3>[0];
    const open = await listOpenResolvedReceiptsP3(conn, W, market, LAYOUT_V21);
    expect(calls).toBe(1);
    expect(open).toHaveLength(2);
    expect(open[1].isVaultLp).toBe(true);
    expect(open[1].needsHolder).toBe(false);
  });
});
