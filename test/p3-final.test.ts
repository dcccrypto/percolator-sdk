/**
 * P3 FINAL 58e379f1: error 86 / 77 text, the matcher batch call + per-leg extension (byte-exact
 * with the wrapper's invoke_matcher_batch + encode_matcher_call_ext, and with the P2 matcher's
 * 18+26n(+24n) batch decode), the floored bound-vault NAV / share pricing, and the resolved exit
 * planner (78 → 77 per senior → 102).
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { PERCOLATOR_ERRORS } from "../src/abi/errors.js";
import {
  encodeMatcherBatchCall,
  encodeWrapperMatcherCallExt,
  decodeMatcherCallExt,
  MATCHER_BATCH_HEADER_LEN,
  MATCHER_BATCH_LEG_LEN,
  MATCHER_CALL_EXT_LEN,
} from "../src/abi/matcher-v2.js";
import {
  boundVaultNavFlooredP3,
  boundVaultSeniorValueP3,
  boundVaultRedemptionAtomsP3,
  boundVaultDepositQuoteP3,
  vaultPotHeldAtomsP3,
  vaultPhysicalIdleBackingAtomsP3,
  planResolvedVaultLpExitP3,
  deriveVaultLpStateP3,
  buildExecuteRedemptionIxP3,
  vaultLpEquityLagBoundsP3,
  vaultLpSeniorPricingClaimP3,
  readAssetPricesP3,
  ASSET_STATE_RAW_ORACLE_TARGET_PRICE_OFF_P3,
  ASSET_STATE_EFFECTIVE_PRICE_OFF_P3,
  POS_SCALE_P3,
  RECOMMENDED_CU_P3,
  liveExitSeniorValueP3,
  RESOLVED_RECEIPT_ACCOUNT_OFF_P3,
  RESOLVED_RECEIPT_LEN_P3,
  decodeResolvedPayoutReceiptP3,
  buildClaimResolvedPayoutTopupIxP3,
  listOpenResolvedReceiptsP3,
  planResolvedReceiptRevisitP3,
} from "../src/solana/p3-vault-lp.js";
import { deriveInsuranceLpMint, deriveLpBackingLedger, deriveLpEscrow, deriveLpRedemption, deriveLpVaultRegistry, deriveVaultAuthority } from "../src/solana/pda.js";
import { deriveVaultLpStateP3 } from "../src/solana/p3-vault-lp.js";
import * as root from "../src/index.js";
import { stampMarket, stampPortfolio } from "./helpers/stamp.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const pk = (): PublicKey => Keypair.generate().publicKey;
const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
const le = (v: bigint, n: number): string => { let h = ""; for (let i = 0; i < n; i++) h += Number((v >> BigInt(8 * i)) & 0xffn).toString(16).padStart(2, "0"); return h; };

describe("errors 77 / 86 (58e379f1)", () => {
  it("86 VaultLpMultiAssetMarket; 77 covers NoCpi growth", () => {
    expect(PERCOLATOR_ERRORS[86]?.name).toBe("VaultLpMultiAssetMarket");
    expect(PERCOLATOR_ERRORS[86]?.hint).toMatch(/max_market_slots == 1/);
    expect(PERCOLATOR_ERRORS[77]?.hint).toMatch(/TradeNoCpi/);
    expect(PERCOLATOR_ERRORS[87]?.name).toBe("VaultLpSeniorDrawRequired"); // d119eebd
  });
});

describe("matcher batch call + per-leg extension (F-10)", () => {
  it("encodeWrapperMatcherCallExt = encode_matcher_call_ext bytes (mode 1; mode 0 = zeros; headroom saturates)", () => {
    // Rust: b[0]=1, b[1]=HEADROOM|MARK_SLOT|EXEC_BAND (=0x13) |TAKER_REDUCING(0x08), band u16 @2, mark_slot u64 @4, headroom u64 @12, 0 @20
    const e = encodeWrapperMatcherCallExt(1, 0x1122334455667788n, 5_000_000n, 300, true, false);
    expect(hex(e)).toBe("01" + "1b" + le(300n, 2) + le(0x1122334455667788n, 8) + le(5_000_000n, 8) + "00000000");
    expect(hex(encodeWrapperMatcherCallExt(1, 1n, 1n << 100n, 0, false, false)).slice(24, 40)).toBe("ffffffffffffffff");
    // mode 1 ALWAYS sets EXEC_BAND (Rust: flags = HEADROOM | MARK_SLOT | EXEC_BAND), even for band 0
    expect(hex(encodeWrapperMatcherCallExt(1, 1n, 1n, 0, false, false)).slice(0, 8)).toBe("01130000");
    expect(encodeWrapperMatcherCallExt(0, 9n, 9n, 9, true, true).every((b) => b === 0)).toBe(true);
    // and the P2 matcher accepts it
    expect(decodeMatcherCallExt(e)).toEqual({ headroomQ: 5_000_000n, markSlot: 0x1122334455667788n, acceptsFeeRequest: false, takerReducing: true, execBandBps: 300 });
  });
  it("encodeMatcherBatchCall = invoke_matcher_batch layout: 18 + 26n (+ 24n, exts after ALL legs)", () => {
    const legs = [{ assetIndex: 0, oraclePriceE6: 1_000_000n, reqSize: 5n }, { assetIndex: 0, oraclePriceE6: 1_000_000n, reqSize: -7n }];
    const exts = [encodeWrapperMatcherCallExt(1, 100n, 5n, 300, false, false), encodeWrapperMatcherCallExt(1, 100n, 7n, 300, true, false)];
    const legacy = encodeMatcherBatchCall(42n, 0xabcdefn, legs);
    const withExt = encodeMatcherBatchCall(42n, 0xabcdefn, legs, exts);
    expect(legacy.length).toBe(MATCHER_BATCH_HEADER_LEN + 2 * MATCHER_BATCH_LEG_LEN);
    expect(withExt.length).toBe(MATCHER_BATCH_HEADER_LEN + 2 * MATCHER_BATCH_LEG_LEN + 2 * MATCHER_CALL_EXT_LEN);
    const expectHeader = "03" + "02" + le(42n, 8) + le(0xabcdefn, 8);
    const leg = (a: number, p: bigint, s: bigint): string => le(BigInt(a), 2) + le(p, 8) + le(s < 0n ? (1n << 128n) + s : s, 16);
    expect(hex(legacy)).toBe(expectHeader + leg(0, 1_000_000n, 5n) + leg(0, 1_000_000n, -7n));
    expect(hex(withExt)).toBe(hex(legacy) + hex(exts[0]) + hex(exts[1]));
    expect(hex(withExt.subarray(0, legacy.length))).toBe(hex(legacy)); // legs unchanged; exts strictly appended
    expect(() => encodeMatcherBatchCall(1n, 1n, legs, [exts[0]])).toThrow();
  });
});

const NO_LAG = 1n << 100n; // non-binding worse-of bound (pre-ede691b6 behaviour)

describe("floored bound-vault NAV + share pricing", () => {
  const pot = (p: bigint, e: bigint, ew: bigint, l: bigint, r: bigint) => ({ totalPrincipalAtoms: p, totalEarningsAtoms: e, totalEarningsWithdrawnAtoms: ew, cumulativeLossAtoms: l, cumulativeRecoveryAtoms: r });
  it("d119eebd B24: per pot min(principal, held); impairment counters ignored; earnings floored per pot", () => {
    // own pot holds less than its principal (real loss), sibling holds MORE (winners' reserved backing, not the seniors')
    const r = boundVaultNavFlooredP3(pot(200n, 0n, 0n, 500n, 0n), pot(1_000n, 0n, 0n, 0n, 0n), 10_000, { own: 100n, sibling: 5_000n });
    expect(r.availablePrincipal).toBe(1_100n);
    // the loss counters no longer move the result
    expect(boundVaultNavFlooredP3(pot(200n, 0n, 0n, 0n, 0n), pot(1_000n, 0n, 0n, 999n, 0n), 10_000, { own: 100n, sibling: 5_000n }).availablePrincipal).toBe(1_100n);
    expect(boundVaultNavFlooredP3(pot(200n, 0n, 0n, 0n, 0n), pot(0n, 0n, 0n, 0n, 0n), 10_000, { own: 900n, sibling: 7n }).availablePrincipal).toBe(200n);
    // lp earnings floored per pot: floor(999*4800/10000)=479, floor(1*4800/10000)=0
    const e = boundVaultNavFlooredP3(pot(0n, 999n, 0n, 0n, 0n), pot(0n, 1n, 0n, 0n, 0n), 4_800, { own: 0n, sibling: 0n });
    expect(e.lpEarnings).toBe(479n);
    expect(e.nav).toBe(479n);
    // earnings saturate (withdrawn > earned) and nav never negative
    expect(boundVaultNavFlooredP3(pot(0n, 0n, 5n, 9n, 20n), pot(0n, 0n, 0n, 0n, 0n), 10_000, { own: 0n, sibling: 0n }).nav).toBe(0n);
    expect(() => boundVaultNavFlooredP3(pot(0n, 0n, 0n, 0n, 0n), pot(0n, 0n, 0n, 0n, 0n), 10_001, { own: 0n, sibling: 0n })).toThrow();
    expect(vaultPotHeldAtomsP3({ freshUnlienedBackingNum: 2_500_000_000_000n, validLienedBackingNum: 500_000_000_000n })).toBe(3n);
    expect(vaultPotHeldAtomsP3({ freshUnlienedBackingNum: 999_999_999_999n, validLienedBackingNum: 0n })).toBe(0n); // floored per pot
    expect(vaultPhysicalIdleBackingAtomsP3([1_999_999_999_999n, 1_000_000_000_000n])).toBe(2n); // floored per bucket
  });
  it("senior value + redemption = floor(shares * min(...) / S)", () => {
    expect(boundVaultSeniorValueP3({ nav: 10n, seniorClaim: 8n, lpValue: 0n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: NO_LAG })).toBe(8n);
    expect(boundVaultSeniorValueP3({ nav: 5n, seniorClaim: 8n, lpValue: 2n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: NO_LAG })).toBe(7n);
    expect(boundVaultSeniorValueP3({ nav: 5n, seniorClaim: 8n, lpValue: 9n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: NO_LAG })).toBe(8n);
    expect(boundVaultSeniorValueP3({ nav: 99n, seniorClaim: 8n, lpValue: 9n, resolved: true, physicalIdleBacking: 6n, lpEquityWorse: NO_LAG })).toBe(6n);
    expect(boundVaultRedemptionAtomsP3(3n, 7n, 10n)).toBe(4n); // floor(30/7)
    expect(boundVaultRedemptionAtomsP3(8n, 7n, 10n)).toBeNull();
  });
  it("deposit quote mirrors tag 75 bound branch", () => {
    const base = { amount: 1_000n, totalShares: 3_000n, seniorClaim: 2_000n, harvestable: 0n, seniorFeeShareBps: 10_000, nav: 2_000n, lpValue: 0n , seniorDrawOutstandingAtoms: 0n, lpEquityBetter: 0n };
    expect(boundVaultDepositQuoteP3(base)).toEqual({ ok: true, shares: 1_500n, minted: 1_500n, cEff: 2_000n });
    expect(boundVaultDepositQuoteP3({ ...base, harvestable: 10n })).toMatchObject({ ok: true, cEff: 2_010n, shares: 1_492n }); // floor(1000*3000/2010)
    expect(boundVaultDepositQuoteP3({ ...base, nav: 1_000n, lpValue: 500n })).toEqual({ ok: false, error: "VaultLpSeniorImpaired" });
    expect(boundVaultDepositQuoteP3({ ...base, nav: 1_000n, lpValue: 1_000n }).ok).toBe(true);
    expect(boundVaultDepositQuoteP3({ ...base, totalShares: 0n, harvestable: 1n })).toEqual({ ok: false, error: "VaultLpHarvestPending" });
    expect(boundVaultDepositQuoteP3({ ...base, totalShares: 0n, amount: 5_000n })).toEqual({ ok: true, shares: 5_000n, minted: 4_000n, cEff: 2_000n });
    expect(boundVaultDepositQuoteP3({ ...base, totalShares: 0n, amount: 1_000n })).toEqual({ ok: false, error: "LpVaultDepositBelowMinimumLiquidity" });
  });
});

describe("planResolvedVaultLpExitP3: 78 → 77 per senior → 102 junior", () => {
  const market = pk(), lp = pk();
  const m = { programId: W, market, registryDomain: 0, lpPortfolio: lp };
  const mk = (tag: number, n: number): TransactionInstruction => new TransactionInstruction({
    programId: W, keys: Array.from({ length: n }, () => ({ pubkey: pk(), isSigner: false, isWritable: false })), data: Buffer.from([tag]),
  });
  it("bundles the bound 78 before each 77 and ends with 102 + Resolved tail", () => {
    const plan = planResolvedVaultLpExitP3({
      market: m, crankFeesIx: mk(78, 6), seniorRedemptionIxs: [mk(77, 13), mk(77, 13)],
      junior: { juniorOwner: pk(), amount: 5n, sourceDomain: 0, juniorDestToken: pk(), vaultToken: pk() },
    });
    expect(plan.perSeniorTxs).toHaveLength(2);
    for (const tx of plan.perSeniorTxs) {
      expect(tx.map((i) => i.data[0])).toEqual([78, 77]);
      expect(tx[0].keys).toHaveLength(7);
      expect(tx[1].keys).toHaveLength(15);
      expect(tx[1].keys[13].pubkey.equals(deriveVaultLpStateP3(W, market)[0])).toBe(true);
      expect(tx[1].keys[14].pubkey.equals(lp)).toBe(true);
    }
    expect(plan.junior!.data[0]).toBe(102);
    expect(plan.junior!.keys).toHaveLength(11);
    expect(planResolvedVaultLpExitP3({ market: m, crankFeesIx: mk(78, 6), seniorRedemptionIxs: [] }).junior).toBeNull();
    expect(() => planResolvedVaultLpExitP3({ market: m, crankFeesIx: mk(78, 7), seniorRedemptionIxs: [] })).toThrow();
  });
  it("exported from the package root", () => {
    const r = root as Record<string, unknown>;
    for (const n of ["planResolvedVaultLpExitP3", "boundVaultNavFlooredP3", "boundVaultSeniorValueP3", "boundVaultRedemptionAtomsP3",
      "boundVaultDepositQuoteP3", "buildExecuteRedemptionIxP3", "vaultPotHeldAtomsP3", "decodeAssetVaultLpDrawP3", "vaultPhysicalIdleBackingAtomsP3", "encodeMatcherBatchCall", "encodeWrapperMatcherCallExt"]) {
      expect(typeof r[n], n).toBe("function");
    }
  });
});

describe("tag 77 on a bound vault (221cf006 security condition)", () => {
  const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
  const market = Keypair.generate().publicKey;
  const lp = Keypair.generate().publicKey;
  const [cranker, redeemer, dest, vault] = [0, 1, 2, 3].map(() => Keypair.generate().publicKey);
  it("ALWAYS passes both pot ledgers writable ([8] own, [11] sibling), for either registry domain and source pot", () => {
    for (const registryDomain of [0, 1]) for (const source of [0, 1]) {
      const m = { programId: W, market, registryDomain, lpPortfolio: lp };
      const ix = buildExecuteRedemptionIxP3(m, cranker, redeemer, dest, vault, source);
      expect(ix.data[0]).toBe(77);
      expect(ix.data.readUInt16LE(1)).toBe(source);
      expect(ix.keys).toHaveLength(15);
      expect(ix.keys[8]).toEqual({ pubkey: deriveLpBackingLedger(W, market, registryDomain)[0], isSigner: false, isWritable: true });
      expect(ix.keys[11]).toEqual({ pubkey: deriveLpBackingLedger(W, market, registryDomain ^ 1)[0], isSigner: false, isWritable: true });
    }
  });
  it("account order matches handle_execute_redemption + the bound tail (state w, vault LP w)", () => {
    const m = { programId: W, market, registryDomain: 0, lpPortfolio: lp };
    const [reg] = deriveLpVaultRegistry(W, market);
    const k = buildExecuteRedemptionIxP3(m, cranker, redeemer, dest, vault, 0).keys;
    expect(k.map((x) => x.pubkey.toBase58())).toEqual([
      cranker, market, reg, deriveLpRedemption(W, reg, redeemer)[0], deriveInsuranceLpMint(W, market)[0], deriveLpEscrow(W, market)[0], vault,
      deriveVaultAuthority(W, market)[0], deriveLpBackingLedger(W, market, 0)[0], dest, new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      deriveLpBackingLedger(W, market, 1)[0], redeemer, deriveVaultLpStateP3(W, market)[0], lp,
    ].map((p) => p.toBase58()));
    expect(k.filter((x) => !x.isWritable).map((_, i) => i).length).toBe(2); // only vault authority + token program are read-only
    expect(k[7].isWritable || k[10].isWritable).toBe(false);
    expect(k[0].isSigner && k.slice(1).every((x) => !x.isSigner)).toBe(true);
    expect(k[14].isWritable && k[13].isWritable).toBe(true);
  });
});

describe("ede691b6 worse-of Earn pricing (vault_lp_equity_lag_bounds_ro)", () => {
  const FXP = JSON.parse(readFileSync(new URL("./fixtures/p3-parity.json", import.meta.url), "utf8")) as { assetPriceOffsets: Record<string, number | string> };
  it("price offsets are rustc's (AssetStateV16Account.raw_oracle_target_price @17, effective_price @25; asset @0 in the engine slot)", () => {
    expect(ASSET_STATE_RAW_ORACLE_TARGET_PRICE_OFF_P3).toBe(FXP.assetPriceOffsets.rawOracleTargetPriceInAssetState);
    expect(ASSET_STATE_EFFECTIVE_PRICE_OFF_P3).toBe(FXP.assetPriceOffsets.effectivePriceInAssetState);
    expect(FXP.assetPriceOffsets.assetStateInEngineSlot).toBe(0);
    expect(POS_SCALE_P3.toString()).toBe(FXP.assetPriceOffsets.posScale);
  });
  it("readAssetPricesP3 reads asset i after the 1024-byte wrapper prefix", () => {
    const d = new Uint8Array(592 + 758 + 2 * 2325);
    stampMarket(d);
    const v = new DataView(d.buffer);
    const base1 = 592 + 758 + 2325 + 1024;
    v.setBigUint64(base1 + 17, 777n, true); v.setBigUint64(base1 + 25, 555n, true);
    expect(readAssetPricesP3(d, 1)).toEqual({ rawOracleTargetPriceE6: 777n, effectivePriceE6: 555n });
    expect(() => readAssetPricesP3(new Uint8Array(10), 0)).toThrow();
  });
  it("lag bounds: adverse/favorable per side, ceil per leg, |q|; flat = conservative equity floored at 0", () => {
    // vault LP SHORT 2 units, target above eff (+100_000) → adverse (worse) 200_000; favorable 0
    const short = { basisPosQ: -2_000_000n, effectivePriceE6: 1_000_000n, rawOracleTargetPriceE6: 1_100_000n };
    expect(vaultLpEquityLagBoundsP3({ legs: [short], certifiedEquity: 500_000n, capital: 0n, pnl: 0n, feeCredits: 0n })).toEqual({ worse: 300_000n, better: 500_000n });
    // LONG, target below eff → adverse; target above → favorable
    const longDown = { basisPosQ: 2_000_000n, effectivePriceE6: 1_000_000n, rawOracleTargetPriceE6: 900_000n };
    const longUp = { ...longDown, rawOracleTargetPriceE6: 1_050_000n };
    expect(vaultLpEquityLagBoundsP3({ legs: [longDown], certifiedEquity: 0n, capital: 0n, pnl: 0n, feeCredits: 0n }).worse).toBe(-200_000n);
    expect(vaultLpEquityLagBoundsP3({ legs: [longUp], certifiedEquity: 0n, capital: 0n, pnl: 0n, feeCredits: 0n })).toEqual({ worse: 0n, better: 100_000n });
    // ceil per leg: q=3, diff=1 → ceil(3/1e6) = 1 on each of two legs
    const tiny = { basisPosQ: 3n, effectivePriceE6: 2n, rawOracleTargetPriceE6: 1n };
    expect(vaultLpEquityLagBoundsP3({ legs: [tiny, tiny], certifiedEquity: 10n, capital: 0n, pnl: 0n, feeCredits: 0n }).worse).toBe(8n);
    // flat: capital + min(pnl,0) + min(fee,0), floored at 0
    expect(vaultLpEquityLagBoundsP3({ legs: [], certifiedEquity: 999n, capital: 100n, pnl: -30n, feeCredits: -5n })).toEqual({ worse: 65n, better: 65n });
    expect(vaultLpEquityLagBoundsP3({ legs: [], certifiedEquity: 0n, capital: 10n, pnl: -30n, feeCredits: 7n })).toEqual({ worse: 0n, better: 0n });
  });
  it("77 exit: a negative worse bound cuts C beyond the junior surplus; LP value capped at max(worse, 0)", () => {
    expect(vaultLpSeniorPricingClaimP3(1_000n, 300n, 0n)).toBe(700n);
    expect(vaultLpSeniorPricingClaimP3(1_000n, 300n, 200n)).toBe(900n);
    expect(vaultLpSeniorPricingClaimP3(100n, 300n, 0n)).toBe(0n);
    // 592a77e2 E-1: a negative bound also cuts the VALUE (nav − d), not only the claim (was min(nav, C') = 500)
    expect(boundVaultSeniorValueP3({ nav: 500n, seniorClaim: 1_000n, lpValue: 900n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: -300n })).toBe(200n);
    expect(boundVaultSeniorValueP3({ nav: 1_200n, seniorClaim: 1_000n, lpValue: 0n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: -300n })).toBe(900n);
    expect(boundVaultSeniorValueP3({ nav: 500n, seniorClaim: 1_000n, lpValue: 900n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: 200n })).toBe(700n);
    expect(boundVaultSeniorValueP3({ nav: 500n, seniorClaim: 1_000n, lpValue: 900n, resolved: true, physicalIdleBacking: 600n, lpEquityWorse: -300n })).toBe(600n);
  });
  it("75 entry: while a draw is outstanding, C_eff += min(value above C at the better bound, outstanding)", () => {
    const q = { amount: 1_000n, totalShares: 1_000n, seniorClaim: 1_000n, harvestable: 0n, seniorFeeShareBps: 10_000, nav: 1_100n, lpValue: 500n };
    expect(boundVaultDepositQuoteP3({ ...q, seniorDrawOutstandingAtoms: 300n, lpEquityBetter: 150n })).toMatchObject({ ok: true, cEff: 1_250n, shares: 800n });
    expect(boundVaultDepositQuoteP3({ ...q, seniorDrawOutstandingAtoms: 300n, lpEquityBetter: 500n })).toMatchObject({ ok: true, cEff: 1_300n });
    expect(boundVaultDepositQuoteP3({ ...q, seniorDrawOutstandingAtoms: 0n, lpEquityBetter: 500n })).toMatchObject({ ok: true, cEff: 1_000n });
    // raised C_eff above nav + LP value → the program refuses (VaultLpSeniorImpaired)
    expect(boundVaultDepositQuoteP3({ ...q, lpValue: 0n, seniorDrawOutstandingAtoms: 300n, lpEquityBetter: 150n })).toEqual({ ok: false, error: "VaultLpSeniorImpaired" });
  });
});

describe("RECOMMENDED_CU_P3 covers the measured worst cases (security review 2026-09-30)", () => {
  it("each limit is above its worst case and TradeCpi matches the app (600k)", () => {
    expect(RECOMMENDED_CU_P3.tradeCpi).toBe(600_000);
    expect(RECOMMENDED_CU_P3.tradeCpi).toBeGreaterThan(405_386);
    expect(RECOMMENDED_CU_P3.closeResolved).toBeGreaterThanOrEqual(300_000);
    expect(RECOMMENDED_CU_P3.closeResolved).toBeGreaterThan(204_000);
    expect(RECOMMENDED_CU_P3.vaultLpSettleResolved).toBeGreaterThanOrEqual(400_000);
    expect(RECOMMENDED_CU_P3.vaultLpSettleResolved).toBeGreaterThan(285_000);
    expect(RECOMMENDED_CU_P3.lpVaultCrankFees).toBeGreaterThan(63_000);
    expect(RECOMMENDED_CU_P3.keeperCrank).toBeGreaterThan(151_000);
  });
});

describe("592a77e2 E-1 live_exit_senior_value (the program's own unit-test vectors)", () => {
  it("matches vault_lp_v18::e1_live_exit_senior_value_nav_below_c_deficit_beyond_equity", () => {
    const [c, nav, e] = [1_000_000n, 800_000n, 200_000n];
    expect(liveExitSeniorValueP3(c, nav, e, 200_000n - 300_000n)).toBe(700_000n);
    expect(liveExitSeniorValueP3(c, nav, e, 200_000n - 600_000n)).toBe(400_000n);
    expect(liveExitSeniorValueP3(c, nav, e, 200_000n - 150_000n)).toBe(850_000n);
    expect(liveExitSeniorValueP3(c, nav, e, 200_000n)).toBe(1_000_000n);
    expect(liveExitSeniorValueP3(c, 1_200_000n, 0n, -100_000n)).toBe(1_000_000n);
    expect(liveExitSeniorValueP3(c, 1_200_000n, 0n, -300_000n)).toBe(900_000n);
  });
  it("boundVaultSeniorValueP3 routes Live through it (lpValue used only when worse >= 0)", () => {
    expect(boundVaultSeniorValueP3({ nav: 800_000n, seniorClaim: 1_000_000n, lpValue: 200_000n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: -100_000n })).toBe(700_000n);
    expect(boundVaultSeniorValueP3({ nav: 800_000n, seniorClaim: 1_000_000n, lpValue: 200_000n, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: 50_000n })).toBe(850_000n);
  });
});

describe("resolved receipts + revisit sweep (5544302a option B, 5e4c15ff revisit rule)", () => {
  const FXR = JSON.parse(readFileSync(new URL("./fixtures/p3-parity.json", import.meta.url), "utf8")) as { portfolioReceipt: Record<string, number> };
  const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
  const market = Keypair.generate().publicKey;
  it("receipt offsets are rustc's (account 9369, 66 B; present @64, finalized @65; after close_progress @9185)", () => {
    expect(RESOLVED_RECEIPT_ACCOUNT_OFF_P3).toBe(FXR.portfolioReceipt.receiptAccountOff);
    expect(RESOLVED_RECEIPT_LEN_P3).toBe(FXR.portfolioReceipt.receiptLen);
    expect(FXR.portfolioReceipt.closeProgressAccountOff + 184).toBe(RESOLVED_RECEIPT_ACCOUNT_OFF_P3);
    expect([FXR.portfolioReceipt.priorBoundContributionNum, FXR.portfolioReceipt.liveReleasedFaceAtReceipt, FXR.portfolioReceipt.terminalPositiveClaimFace, FXR.portfolioReceipt.paidEffective, FXR.portfolioReceipt.present, FXR.portfolioReceipt.finalized]).toEqual([0, 16, 32, 48, 64, 65]);
  });
  const withReceipt = (present: number, finalized: number, owner: PublicKey) => {
    const d = new Uint8Array(9563);
    d.set(market.toBytes(), 16); d.set(owner.toBytes(), 80);
    const v = new DataView(d.buffer); v.setBigUint64(9369 + 48, 777n, true); d[9369 + 64] = present; d[9369 + 65] = finalized;
    return stampPortfolio(d);
  };
  it("decodes present / finalized / open", () => {
    const o = Keypair.generate().publicKey;
    expect(decodeResolvedPayoutReceiptP3(withReceipt(1, 0, o))).toMatchObject({ present: true, finalized: false, open: true, paidEffective: 777n });
    expect(decodeResolvedPayoutReceiptP3(withReceipt(1, 1, o)).open).toBe(false);
    expect(decodeResolvedPayoutReceiptP3(withReceipt(0, 0, o)).open).toBe(false);
    expect(() => decodeResolvedPayoutReceiptP3(new Uint8Array(100))).toThrow();
  });
  it("tag 46: permissionless = 8 accounts, owner unsigned, [7] nft_registry, data [46]; signed = 7 accounts", () => {
    const [owner, portfolio, dest, vault] = [0, 1, 2, 3].map(() => Keypair.generate().publicKey);
    const ix = buildClaimResolvedPayoutTopupIxP3({ programId: W, market, portfolio, owner, destToken: dest, vaultToken: vault });
    expect([...ix.data]).toEqual([46]);
    expect(ix.keys).toHaveLength(8);
    expect(ix.keys[0]).toEqual({ pubkey: owner, isSigner: false, isWritable: false });
    expect(ix.keys[2]).toEqual({ pubkey: portfolio, isSigner: false, isWritable: true });
    expect(ix.keys[7].pubkey.equals(PublicKey.findProgramAddressSync([Buffer.from("nft_registry"), market.toBuffer()], W)[0])).toBe(true);
    const sgn = buildClaimResolvedPayoutTopupIxP3({ programId: W, market, portfolio, owner, destToken: dest, vaultToken: vault, signed: true });
    expect(sgn.keys).toHaveLength(7);
    expect(sgn.keys[0].isSigner).toBe(true);
  });
  it("lister + planner: open receipts only; the vault LP is skipped (101 path); off-curve owners need the holder", async () => {
    const trader = Keypair.generate().publicKey;
    const [registry] = deriveLpVaultRegistry(W, market);
    const escrowPda = PublicKey.findProgramAddressSync([Buffer.from("x")], W)[0];
    const accs = [
      { pubkey: Keypair.generate().publicKey, account: { data: Buffer.from(withReceipt(1, 0, trader)) } },
      { pubkey: Keypair.generate().publicKey, account: { data: Buffer.from(withReceipt(1, 1, trader)) } },
      { pubkey: Keypair.generate().publicKey, account: { data: Buffer.from(withReceipt(1, 0, registry)) } },
      { pubkey: Keypair.generate().publicKey, account: { data: Buffer.from(withReceipt(1, 0, escrowPda)) } },
    ];
    const conn = { getProgramAccounts: async () => accs } as unknown as Parameters<typeof listOpenResolvedReceiptsP3>[0];
    const open = await listOpenResolvedReceiptsP3(conn, W, market);
    expect(open).toHaveLength(3);
    const plan = planResolvedReceiptRevisitP3({ programId: W, market, vaultToken: Keypair.generate().publicKey, collateralMint: Keypair.generate().publicKey, open });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].portfolio.equals(accs[0].pubkey)).toBe(true);
    expect([...plan.steps[0].topup46.data]).toEqual([46]);
    expect(plan.steps[0].closeResolved.data[0]).toBe(30);
    expect(plan.steps[0].closeResolved.data.length).toBe(17);
    expect(plan.steps[0].closeResolved.keys.map((k) => k.pubkey.toBase58())).toEqual(plan.steps[0].topup46.keys.map((k) => k.pubkey.toBase58()));
    expect(plan.steps[0].closeResolved.keys[0].isSigner).toBe(false);
    expect(plan.needsHolder.map((r) => r.portfolio.toBase58())).toEqual([accs[3].pubkey.toBase58()]);
    // a later round with nothing open plans nothing (the caller stops revisiting)
    expect(planResolvedReceiptRevisitP3({ programId: W, market, vaultToken: PublicKey.default, collateralMint: PublicKey.default, open: [] }).steps).toHaveLength(0);
  });
});
