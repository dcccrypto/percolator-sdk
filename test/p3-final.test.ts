/**
 * P3 FINAL 58e379f1: error 86 / 77 text, the matcher batch call + per-leg extension (byte-exact
 * with the wrapper's invoke_matcher_batch + encode_matcher_call_ext, and with the P2 matcher's
 * 18+26n(+24n) batch decode), the floored bound-vault NAV / share pricing, and the resolved exit
 * planner (78 → 77 per senior → 102).
 */
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
} from "../src/solana/p3-vault-lp.js";
import * as root from "../src/index.js";

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
    expect(boundVaultSeniorValueP3({ nav: 10n, seniorClaim: 8n, lpValue: 0n, resolved: false, physicalIdleBacking: 0n })).toBe(8n);
    expect(boundVaultSeniorValueP3({ nav: 5n, seniorClaim: 8n, lpValue: 2n, resolved: false, physicalIdleBacking: 0n })).toBe(7n);
    expect(boundVaultSeniorValueP3({ nav: 5n, seniorClaim: 8n, lpValue: 9n, resolved: false, physicalIdleBacking: 0n })).toBe(8n);
    expect(boundVaultSeniorValueP3({ nav: 99n, seniorClaim: 8n, lpValue: 9n, resolved: true, physicalIdleBacking: 6n })).toBe(6n);
    expect(boundVaultRedemptionAtomsP3(3n, 7n, 10n)).toBe(4n); // floor(30/7)
    expect(boundVaultRedemptionAtomsP3(8n, 7n, 10n)).toBeNull();
  });
  it("deposit quote mirrors tag 75 bound branch", () => {
    const base = { amount: 1_000n, totalShares: 3_000n, seniorClaim: 2_000n, harvestable: 0n, seniorFeeShareBps: 10_000, nav: 2_000n, lpValue: 0n };
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
      "boundVaultDepositQuoteP3", "vaultPotHeldAtomsP3", "decodeAssetVaultLpDrawP3", "vaultPhysicalIdleBackingAtomsP3", "encodeMatcherBatchCall", "encodeWrapperMatcherCallExt"]) {
      expect(typeof r[n], n).toBe("function");
    }
  });
});
