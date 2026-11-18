/**
 * Branch coverage for src/solana/p3-vault-lp.ts: guard throws, optional-account presence,
 * builder key lists + data bytes, and the pricing-helper arms the parity suites do not take.
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  assetVaultLpAccountOffsetP3,
  readAssetPricesP3,
  decodeVaultLpStateP3,
  decodeAssetVaultLpDrawP3,
  decodeAssetVaultLpRecordP3,
  decodeAssetVaultLpP3,
  decodeResolvedPayoutReceiptP3,
  vaultLpEquityLagBoundsP3,
  liveExitSeniorValueP3,
  boundVaultDepositQuoteP3,
  buildDepositJuniorTrancheIxP3,
  buildSetVaultLpRiskIxP3,
  buildVaultLpConvertPnlIxP3,
  buildVaultLpSettleResolvedIxP3,
  deriveVaultLpStateP3,
  deriveProgramDataAddressP3,
  VAULT_LP_STATE_ACCOUNT_LEN_P3,
  ASSET_VAULT_LP_LEN_P3,
  type VaultLpMarketP3,
} from "../src/solana/p3-vault-lp.js";
import { IX_TAG_P3 } from "../src/abi/p3.js";
import { deriveLpBackingLedger, deriveLpVaultRegistry, deriveVaultAuthority } from "../src/solana/pda.js";
import { stampMarket, stampPortfolio } from "./helpers/stamp.js";

const k = (): PublicKey => Keypair.generate().publicKey;
const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");

describe("p3-vault-lp guard throws", () => {
  it("assetVaultLpAccountOffsetP3 rejects negative / fractional indices", () => {
    expect(() => assetVaultLpAccountOffsetP3(-1)).toThrow(/non-negative integer/);
    expect(() => assetVaultLpAccountOffsetP3(1.5)).toThrow(/non-negative integer/);
  });
  it("readAssetPricesP3 rejects bad index and short market data", () => {
    const d = stampMarket(new Uint8Array(592 + 758 + 2325));
    expect(() => readAssetPricesP3(d, -1)).toThrow(/non-negative integer/);
    expect(() => readAssetPricesP3(d, 50)).toThrow(/too short for asset 50/);
  });
  it("decodeVaultLpStateP3 rejects short data", () => {
    expect(() => decodeVaultLpStateP3(new Uint8Array(VAULT_LP_STATE_ACCOUNT_LEN_P3 - 1))).toThrow(/need \d+ bytes/);
  });
  it("decodeAssetVaultLpDrawP3 / decodeAssetVaultLpP3 reject a market too short for the asset", () => {
    const d = stampMarket(new Uint8Array(592 + 758 + 2325));
    expect(() => decodeAssetVaultLpDrawP3(d, 50)).toThrow(/too short for asset 50/);
    expect(() => decodeAssetVaultLpP3(d, 50)).toThrow(/too short for asset 50/);
  });
  it("decodeAssetVaultLpRecordP3 rejects wrong record length", () => {
    expect(() => decodeAssetVaultLpRecordP3(new Uint8Array(ASSET_VAULT_LP_LEN_P3 - 1))).toThrow(/must be 128 bytes/);
    expect(() => decodeAssetVaultLpRecordP3(new Uint8Array(ASSET_VAULT_LP_LEN_P3 + 1))).toThrow(/must be 128 bytes/);
  });
  it("decodeResolvedPayoutReceiptP3 rejects a portfolio too short for the receipt", () => {
    const d = stampPortfolio(new Uint8Array(9563));
    expect(() => decodeResolvedPayoutReceiptP3(d.subarray(0, 9400))).toThrow(/too short for the resolved receipt/);
  });
});

describe("pricing helper arms", () => {
  it("flat lag bounds: non-negative pnl / feeCredits add nothing; negatives are added; floored at 0", () => {
    expect(vaultLpEquityLagBoundsP3({ legs: [], certifiedEquity: 0n, capital: 100n, pnl: 50n, feeCredits: 7n })).toEqual({ worse: 100n, better: 100n });
    expect(vaultLpEquityLagBoundsP3({ legs: [], certifiedEquity: 0n, capital: 100n, pnl: -30n, feeCredits: -5n })).toEqual({ worse: 65n, better: 65n });
    expect(vaultLpEquityLagBoundsP3({ legs: [], certifiedEquity: 0n, capital: 10n, pnl: -30n, feeCredits: 0n })).toEqual({ worse: 0n, better: 0n });
  });
  it("liveExitSeniorValueP3 with worse < 0 and nav <= c (no excess above C)", () => {
    // d = 100, nav - c clamps to 0 => pricing claim over zero excess; result capped by max(0, nav - d)
    const r = liveExitSeniorValueP3(1_000_000n, 900_000n, 0n, -100_000n);
    expect(r).toBeLessThanOrEqual(800_000n);
    expect(r).toBeGreaterThan(0n);
    // nav <= d floors the NAV side at 0
    expect(liveExitSeniorValueP3(1_000_000n, 50_000n, 0n, -100_000n)).toBe(0n);
  });
  const base = {
    amount: 1_000n, totalShares: 10_000n, seniorClaim: 10_000n, harvestable: 0n, seniorFeeShareBps: 0,
    nav: 10_000n, lpValue: 0n, seniorDrawOutstandingAtoms: 0n, lpEquityBetter: 0n,
  };
  it("outstanding draw: non-positive lpEquityBetter adds nothing, vBetter <= cEff leaves cEff unchanged", () => {
    const q = boundVaultDepositQuoteP3({ ...base, seniorDrawOutstandingAtoms: 500n, lpEquityBetter: -5n });
    expect(q).toEqual({ ok: true, shares: 1_000n, minted: 1_000n, cEff: 10_000n });
    const q0 = boundVaultDepositQuoteP3({ ...base, seniorDrawOutstandingAtoms: 500n, lpEquityBetter: 0n, nav: 9_000n, lpValue: 5_000n });
    expect(q0).toEqual({ ok: true, shares: 1_000n, minted: 1_000n, cEff: 10_000n });
  });
  it("outstanding draw: positive lpEquityBetter lifts cEff by min(above, outstanding)", () => {
    const q = boundVaultDepositQuoteP3({ ...base, seniorDrawOutstandingAtoms: 300n, lpEquityBetter: 1_000n, lpValue: 5_000n });
    expect(q).toMatchObject({ ok: true, cEff: 10_300n });
    const small = boundVaultDepositQuoteP3({ ...base, seniorDrawOutstandingAtoms: 5_000n, lpEquityBetter: 200n, lpValue: 5_000n });
    expect(small).toMatchObject({ ok: true, cEff: 10_200n });
  });
  it("error arms: harvest pending, impaired, zero cEff, zero shares, below minimum liquidity", () => {
    expect(boundVaultDepositQuoteP3({ ...base, totalShares: 0n, harvestable: 1n })).toEqual({ ok: false, error: "VaultLpHarvestPending" });
    expect(boundVaultDepositQuoteP3({ ...base, nav: 1n, lpValue: 1n })).toEqual({ ok: false, error: "VaultLpSeniorImpaired" });
    expect(boundVaultDepositQuoteP3({ ...base, seniorClaim: 0n, nav: 0n })).toEqual({ ok: false, error: "EngineInvalidConfig" });
    expect(boundVaultDepositQuoteP3({ ...base, amount: 1n, totalShares: 1n, seniorClaim: 10_000n })).toEqual({ ok: false, error: "LpVaultZeroSharesMinted" });
    expect(boundVaultDepositQuoteP3({ ...base, totalShares: 0n, amount: 1_000n, seniorClaim: 0n, nav: 0n })).toEqual({ ok: false, error: "LpVaultDepositBelowMinimumLiquidity" });
  });
});

describe("builders: full key list + data bytes", () => {
  const m: VaultLpMarketP3 = { programId: W, market: k(), registryDomain: 0, lpPortfolio: k() };
  const caller = k();
  const [stateKey] = deriveVaultLpStateP3(W, m.market);
  const meta = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean) => ({ pubkey, isSigner, isWritable });

  it("tag 96 DepositJuniorTranche", () => {
    const src = k(), vault = k();
    const ix = buildDepositJuniorTrancheIxP3(m, caller, src, vault, 1_234_567n);
    expect(ix.programId.equals(W)).toBe(true);
    expect(ix.keys).toEqual([
      meta(caller, true, false), meta(m.market, false, true), meta(stateKey, false, true), meta(m.lpPortfolio, false, true),
      meta(src, false, true), meta(vault, false, true), meta(TOKEN_PROGRAM_ID, false, false),
    ]);
    const expected = new Uint8Array(17);
    expected[0] = IX_TAG_P3.DepositJuniorTranche;
    new DataView(expected.buffer).setBigUint64(1, 1_234_567n, true);
    expect([...ix.data]).toEqual([...expected]);
  });

  it("tag 99 SetVaultLpRisk", () => {
    const matcher = k();
    const ix = buildSetVaultLpRiskIxP3(W, m.market, caller, {
      assetIndex: 3, skewSlopeE9: 5n, skewMaxE9: 6n, levCapQ: 7n, levMaxImrBps: 800, vaultLpMaxLevBps: 20_000, approvedMatcherProgram: matcher,
    });
    expect(ix.keys).toEqual([
      meta(caller, true, false), meta(deriveProgramDataAddressP3(W)[0], false, false), meta(m.market, false, true),
    ]);
    expect(ix.data.length).toBe(73);
    const v = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
    expect(ix.data[0]).toBe(IX_TAG_P3.SetVaultLpRisk);
    expect(v.getUint16(1, true)).toBe(3);
    expect(v.getBigUint64(3, true)).toBe(5n);
    expect(v.getBigUint64(11, true)).toBe(6n);
    expect(v.getBigUint64(19, true)).toBe(7n);
    expect(v.getUint16(35, true)).toBe(800);
    expect(v.getUint32(37, true)).toBe(20_000);
    expect([...ix.data.subarray(41, 73)]).toEqual([...matcher.toBytes()]);
  });

  it("tag 99 SetVaultLpRisk rejects out-of-range fields", () => {
    const ok = { assetIndex: 0, skewSlopeE9: 0n, skewMaxE9: 0n, levCapQ: 0n, levMaxImrBps: 0, vaultLpMaxLevBps: 0, approvedMatcherProgram: k() };
    expect(() => buildSetVaultLpRiskIxP3(W, m.market, caller, { ...ok, levMaxImrBps: 10_001 })).toThrow();
    expect(() => buildSetVaultLpRiskIxP3(W, m.market, caller, { ...ok, vaultLpMaxLevBps: 50_001 })).toThrow();
    expect(() => buildSetVaultLpRiskIxP3(W, m.market, caller, { ...ok, assetIndex: 65_536 })).toThrow();
    expect(() => buildSetVaultLpRiskIxP3(W, m.market, caller, { ...ok, skewSlopeE9: 1n << 64n })).toThrow();
  });

  it("tag 100 VaultLpConvertPnl", () => {
    const ix = buildVaultLpConvertPnlIxP3(m, caller, 42n);
    expect(ix.keys).toEqual([
      meta(caller, true, false), meta(m.market, false, true), meta(stateKey, false, false), meta(m.lpPortfolio, false, true),
    ]);
    expect([...ix.data]).toEqual([IX_TAG_P3.VaultLpConvertPnl, 42, ...new Array(15).fill(0)]);
  });

  it("tag 101 VaultLpSettleResolved (topup 0 and 1, both registry domains)", () => {
    const dest = k(), vault = k();
    for (const [domain, topup] of [[0, 0], [1, 1]] as const) {
      const mm = { ...m, registryDomain: domain };
      const ix = buildVaultLpSettleResolvedIxP3(mm, caller, dest, vault, topup);
      expect(ix.keys).toEqual([
        meta(caller, true, true), meta(m.market, false, true), meta(deriveLpVaultRegistry(W, m.market)[0], false, false),
        meta(stateKey, false, true), meta(m.lpPortfolio, false, true),
        meta(deriveLpBackingLedger(W, m.market, domain)[0], false, true), meta(deriveLpBackingLedger(W, m.market, domain ^ 1)[0], false, true),
        meta(dest, false, true), meta(vault, false, true), meta(deriveVaultAuthority(W, m.market)[0], false, false),
        meta(TOKEN_PROGRAM_ID, false, false), meta(SystemProgram.programId, false, false),
      ]);
      expect([...ix.data]).toEqual([IX_TAG_P3.VaultLpSettleResolved, topup]);
    }
    expect(() => buildVaultLpSettleResolvedIxP3(m, caller, dest, vault, 2 as 0)).toThrow();
  });
});
