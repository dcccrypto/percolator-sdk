/** v2.2 builders, tails, helpers; stake v5 wire (hand-derived from percolator-stake release/v22-stake 49e27e7, cited). */
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import * as W from "../src/abi/v22-wire.js";
import * as K from "../src/abi/v22-stake.js";
import * as M from "../src/abi/v22-math.js";
import * as B from "../src/solana/v22.js";
import { encodeTradeCpi } from "../src/abi/instructions.js";
import { LAYOUT_V22 } from "../src/abi/layout.js";
import { PERCOLATOR_ERRORS } from "../src/abi/errors.js";
import { ACCOUNTS_CREATE_LP_VAULT, buildAccountMetas } from "../src/abi/accounts.js";
import { encodeCreateLpVaultV17 } from "../src/abi/instructions.js";
import { CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3 } from "../src/abi/p3.js";
import { buildInitVaultLpIxP3, deriveVaultLpStateP3 } from "../src/solana/p3-vault-lp.js";
import { deriveInsuranceLpMint, deriveLpVaultRegistry } from "../src/solana/pda.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const pk = () => Keypair.generate().publicKey;
const P = pk(), MARKET = pk(), LP = pk(), EXT = pk();
const m: B.MarketV22 = { programId: P, market: MARKET, registryDomain: 0, lpPortfolio: LP, vaultLpExt: EXT };
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("account counts and flags (Rust handler `account(accounts, i)` order)", () => {
  it("wave C bonds", () => {
    const u = pk(), t = pk();
    expect(B.buildInitBondTrancheIxV22(m, u, u, { couponBps: 800, utilBonusBps: 0, cooldownSlots: 9000, capBps: 5000 }).keys).toHaveLength(8);
    expect(B.buildInitBondTrancheIxV22(m, u, u, { couponBps: 800, utilBonusBps: 0, cooldownSlots: 9000, capBps: 5000 }, { upgradeAuthority: true }).keys).toHaveLength(9);
    const dep = B.buildBondDepositIxV22(m, u, t, t, 5n, 1n);
    expect(dep.keys).toHaveLength(13);
    expect(dep.keys[7].pubkey.equals(W.deriveBondTrancheV22(P, MARKET)[0])).toBe(true);
    expect(dep.keys[8].pubkey.equals(W.deriveBondPositionV22(P, MARKET, u)[0])).toBe(true);
    expect(B.buildBondRequestWithdrawIxV22(m, u, 5n).keys).toHaveLength(4);
    expect(B.buildBondExecuteWithdrawIxV22(m, u, t, t, 1n, 0).keys).toHaveLength(13);
  });
  it("bond tails: 78 [9] (needs a writable vault LP at [8]), 97 [12], 102 [11], 103 [9]", () => {
    const tr = W.deriveBondTrancheV22(P, MARKET)[0];
    const mk = (tag: number, n: number, writable8 = true) => new TransactionInstruction({ programId: P, data: Buffer.from([tag]), keys: Array.from({ length: n }, (_, i) => ({ pubkey: pk(), isSigner: false, isWritable: i === 8 ? writable8 : false })) });
    expect(B.withBondTailV22(mk(78, 9), tr).keys).toHaveLength(10);
    expect(B.withBondTailV22(mk(78, 9), tr).keys[9].isWritable).toBe(true);
    expect(() => B.withBondTailV22(mk(78, 9, false), tr)).toThrow(/WRITABLE/);
    expect(B.withBondTailV22(mk(97, 12), tr).keys[12].pubkey.equals(tr)).toBe(true);
    expect(B.withBondTailV22(mk(102, 11), tr).keys).toHaveLength(12);
    expect(B.withBondTailV22(mk(103, 9), tr).keys).toHaveLength(10);
    expect(() => B.withBondTailV22(mk(97, 11), tr)).toThrow(/exactly 12/);
    expect(() => B.withBondTailV22(mk(75, 11), tr)).toThrow(/no bond/);
  });
  it("units tail on 9/56/57/41/101, appended last, writable, once", () => {
    const u = W.deriveInsuranceUnitsV22(P, MARKET)[0];
    const mk = (tag: number, n: number) => new TransactionInstruction({ programId: P, data: Buffer.from([tag]), keys: Array.from({ length: n }, () => ({ pubkey: pk(), isSigner: false, isWritable: false })) });
    for (const [tag, n] of [[9, 5], [56, 5], [57, 6], [41, 6], [101, 12]] as const) {
      const x = B.withInsuranceUnitsTailV22(mk(tag, n), u);
      expect(x.keys[x.keys.length - 1]).toMatchObject({ isWritable: true });
      expect(x.keys[x.keys.length - 1].pubkey.equals(u)).toBe(true);
    }
    expect(() => B.withInsuranceUnitsTailV22(mk(9, 4), u)).toThrow(/at least 5/);
    expect(() => B.withInsuranceUnitsTailV22(B.withInsuranceUnitsTailV22(mk(9, 5), u), u)).toThrow(/already/);
    expect(() => B.withInsuranceUnitsTailV22(mk(75, 12), u)).toThrow();
  });
  it("wave B and D", () => {
    const c = pk();
    expect(B.buildSettleHoldingRentIxV22(m, c, pk(), 0, 5n, [pk()]).keys).toHaveLength(5);
    expect(B.buildSweepBandDustLegIxV22(m, c, pk(), 0).keys).toHaveLength(4);
    expect(B.buildInsuranceBackstopDrawIxV22(m, c, 2, 0n).keys).toHaveLength(8);
    expect(B.buildInsuranceBackstopDrawIxV22(m, c, 2, 0n).keys[7].pubkey.equals(W.deriveInsuranceUnitsV22(P, MARKET)[0])).toBe(true);
    expect(B.buildRescueDepositIxV22({ ...m, lpPortfolio: undefined }, c, pk(), pk(), pk(), 1n, 1n).keys).toHaveLength(11);
    expect(B.buildRescueDepositIxV22(m, c, pk(), pk(), pk(), 1n, 1n).keys).toHaveLength(13);
    expect(B.buildInitInsuranceUnitsIxV22(m, c).keys).toHaveLength(4);
    expect(B.buildSetG9FeedAllowlistIxV22(P, c, [pk()]).keys).toHaveLength(4);
  });
  it("evict prepends the victim and swaps the tag", () => {
    const trade = new TransactionInstruction({ programId: P, data: Buffer.from(encodeTradeCpi({ accountAPortfolioId: 1n, accountAPositionEpoch: 2n, accountBPortfolioId: 3n, accountBPositionEpoch: 4n, accountBMatcherSequence: 5n, assetIndex: 0, marketId: 6n, sizeQ: 7n, feeBps: 8n, limitPrice: 9n, backingFeeCapBps: 10 })), keys: [{ pubkey: pk(), isSigner: true, isWritable: false }, { pubkey: MARKET, isSigner: false, isWritable: true }] });
    const v = pk(), e = B.buildEvictAndTradeCpiIxV22(trade, v);
    expect(e.keys[0]).toMatchObject({ isWritable: true, isSigner: false });
    expect(e.keys[0].pubkey.equals(v)).toBe(true);
    expect(e.keys).toHaveLength(3);
    expect([e.data[0], e.data.length]).toEqual([119, 85]);
    expect(hex(e.data.subarray(1))).toBe(hex(trade.data.subarray(1)));
    expect(() => B.buildEvictAndTradeCpiIxV22(B.buildSweepBandDustLegIxV22(m, v, v, 0), v)).toThrow();
  });
});

describe("Earn exit (tags 76 / 77 v2.2)", () => {
  const base = { market: m, cranker: pk(), redeemer: pk(), redeemerLpAta: pk(), redeemerDest: pk(), vaultToken: pk(), sourceDomain: 0, shares: 1_000n };
  it("selects refresh accounts by leg weight (<= 8, sum(3 + legs) <= 34)", () => {
    const cands = [14, 14, 14, 1, 1, 1, 1, 1, 1, 1].map((legs) => ({ key: pk(), legs }));
    const plan = B.planEarnExitV22({ ...base, staleCandidates: cands });
    // 17 + 17 = 34, the third 14-leg is deferred, then 1-leg portfolios no longer fit the budget
    expect(plan.refreshWeight).toBe(34);
    expect(plan.refreshSelected).toHaveLength(2);
    expect(plan.refreshDeferred).toHaveLength(8);
    const eight = B.planEarnExitV22({ ...base, staleCandidates: Array.from({ length: 10 }, () => ({ key: pk(), legs: 1 })) });
    expect(eight.refreshSelected).toHaveLength(8);
    expect(eight.refreshWeight).toBe(32);
    expect(M.selectRefreshPortfoliosV22([{ key: "a", legs: 14 }, { key: "b", legs: 14 }, { key: "c", legs: 14 }]).selected).toEqual(["a", "b"]);
  });
  it("floor defaults to quote - 5 bps on BOTH the 76 trailer and the 77 wire; 1.3M compute for a refreshing 77", () => {
    const plan = B.planEarnExitV22({ ...base, staleCandidates: [{ key: pk(), legs: 2 }] });
    expect(plan.computeUnits).toBe(1_300_000);
    expect(plan.simulationIx.keys).toHaveLength(14);
    expect(plan.simulationIx.keys[13].isWritable).toBe(true);
    expect(plan.simulationIx.keys[12].isSigner).toBe(true);
    const { requestIx, executeIx, minPayoutAtoms } = plan.finalize(1_000_000n);
    expect(minPayoutAtoms).toBe(999_500n);
    expect(requestIx.data.readBigUInt64LE(17)).toBe(999_500n);
    expect(executeIx.data.readBigUInt64LE(3)).toBe(999_500n);
    expect(executeIx.data[11]).toBe(1);
    expect(() => plan.finalize(1_000_000n, 6)).toThrow();
    expect(M.defaultMinPayoutV22(1_000_000n, 6, true)).toBe(999_400n);
    expect(() => M.defaultMinPayoutV22(0n)).toThrow();
  });
  it("a bound vault takes no refresh accounts; the tail is [13] state, [14] LP", () => {
    const plan = B.planEarnExitV22({ ...base, boundLpPortfolio: LP, staleCandidates: [{ key: pk(), legs: 1 }] });
    expect(plan.refreshSelected).toHaveLength(0);
    expect(plan.simulationIx.keys).toHaveLength(15);
    expect(() => B.buildExecuteRedemptionIxV22(m, pk(), pk(), pk(), pk(), 0, { minPayoutAtoms: 1n, refresh: [pk()], boundLpPortfolio: LP })).toThrow(/bound/);
    expect(() => B.buildExecuteRedemptionIxV22(m, pk(), pk(), pk(), pk(), 0, { minPayoutAtoms: 1n, refresh: Array.from({ length: 9 }, pk) })).toThrow(/at most 8/);
  });
  it("classifies a compute overrun as NOT 118", () => {
    expect(B.classifyRedemptionSimulationV22({ err: { InstructionError: [0, "ComputationalBudgetExceeded"] }, logs: ["Program x consumed 1400000 of 1400000 compute units", "Program x failed: exceeded CUs meter at BPF instruction"] }).kind).toBe("computeBudgetExceeded");
    expect(B.classifyRedemptionSimulationV22({ err: {}, logs: ["Program x failed: custom program error: 0x76"] })).toEqual({ kind: "notLossCurrent", code: 118 });
    expect(B.classifyRedemptionSimulationV22({ err: {}, logs: ["failed: custom program error: 0x75"] })).toEqual({ kind: "belowMinPayout", code: 117 });
    expect(B.classifyRedemptionSimulationV22({ err: null, logs: [] }).kind).toBe("ok");
    expect(B.payoutFromBalancesV22(10n, 25n)).toBe(15n);
    expect(() => B.payoutFromBalancesV22(10n, 10n)).toThrow();
  });
  it("compute presets: only the 77 numbers are marked measured; prelude includes the heap", () => {
    expect(B.COMPUTE_PRESETS_V22.executeRedemptionRefresh).toMatchObject({ units: 1_300_000, basis: "measured" });
    expect(B.COMPUTE_PRESETS_V22.bondDeposit.basis).toBe("estimated");
    const ixs = B.computeBudgetPrelude("executeRedemptionRefresh");
    expect(ixs.every((i) => i.programId.equals(ComputeBudgetProgram.programId))).toBe(true);
    expect(ixs.length).toBe(2);
    expect(() => B.computeBudgetPrelude("nope")).toThrow();
  });
});

describe("atomic launch bundle 74 + 94 + 107", () => {
  const payer = pk();
  const registry = deriveLpVaultRegistry(P, MARKET)[0];
  const real = () => {
    const ctx = pk();
    const create = new TransactionInstruction({
      programId: P, data: Buffer.from(encodeCreateLpVaultV17({ feeShareBps: 5000, redemptionCooldownSlots: 1n, oiReservationThresholdBps: 8000, domain: 0 })),
      keys: buildAccountMetas(ACCOUNTS_CREATE_LP_VAULT, { admin: payer, market: MARKET, registry, lpMint: deriveInsuranceLpMint(P, MARKET)[0], systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID, collateralMint: pk() }),
    });
    return {
      createAccounts: [SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: ctx, lamports: 1, space: 320, programId: new PublicKey(CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3) }), B.buildCreatePortfolioAccountIxV22(payer, LP, 1, P)],
      createVaultLp: create,
      initVaultLp: buildInitVaultLpIxP3({ programId: P, market: MARKET, registryDomain: 0, lpPortfolio: LP }, payer, 2000, ctx),
      initBondTranche: B.buildInitBondTrancheIxV22(m, payer, payer, { couponBps: 800, utilBonusBps: 0, cooldownSlots: 9000, capBps: 5000 }),
    };
  };
  it("proven order: 74, createAccounts, 94, 107, then per seed [LP ATA create, 75 with the bound tail]; ONE transaction", () => {
    const seed = { depositor: payer, sourceToken: pk(), vaultToken: pk(), amount: 1_000_000_000n };
    const plan = B.buildLaunchBundleV22({ payer, market: m, ...real(), earnSeeds: [seed, { ...seed, amount: 2_000_000_000n }], supportsV1: true });
    const tags = plan.instructions.map((i) => (i.programId.equals(P) ? i.data[0] : "x"));
    expect(tags).toEqual([74, "x", "x", 94, 107, "x", 75, "x", 75]);
    const seeds = plan.instructions.filter((i) => i.programId.equals(P) && i.data[0] === 75);
    for (const x of seeds) {
      expect(x.keys).toHaveLength(13);
      expect(x.keys[11].pubkey.equals(deriveVaultLpStateP3(P, MARKET)[0])).toBe(true);
      expect(x.keys[12].pubkey.equals(LP)).toBe(true);
      expect(x.keys[11].isWritable && x.keys[12].isWritable).toBe(true);
    }
    expect(plan.format).toBe("v1");
    const noSeeds = B.buildLaunchBundleV22({ payer, market: m, ...real(), supportsV1: false });
    expect(noSeeds.format).toBe("legacy");
    expect(noSeeds.instructions.filter((i) => i.programId.equals(P)).map((i) => i.data[0])).toEqual([74, 94, 107]);
    expect(noSeeds.bytes).toBeLessThanOrEqual(1232);
  });
  it("never splits: an oversized bundle is a typed error; wrong tags refused; 75 needs the vault LP", () => {
    const r = real();
    const extra = Array.from({ length: 30 }, () => ({ pubkey: pk(), isSigner: false, isWritable: true }));
    r.initBondTranche = new TransactionInstruction({ programId: P, data: r.initBondTranche.data, keys: [...r.initBondTranche.keys, ...extra] });
    expect(() => B.buildLaunchBundleV22({ payer, market: m, ...r, supportsV1: false })).toThrow(B.LaunchBundleTooLargeError);
    expect(() => B.buildLaunchBundleV22({ payer, market: m, ...real(), createVaultLp: B.buildSweepBandDustLegIxV22(m, payer, payer, 0), supportsV1: false })).toThrow(/tag 74/);
    expect(() => B.buildLaunchBundleV22({ payer, market: { ...m, lpPortfolio: undefined }, ...real(), earnSeeds: [{ depositor: payer, sourceToken: pk(), vaultToken: pk(), amount: 1n }], supportsV1: true })).toThrow(/vault LP portfolio/);
  });
});

describe("tails table and the 78 / 97 builders", () => {
  it("78 bound with ext + bond: [6] state, [7] ext, [8] LP (writable), [9] tranche (writable)", () => {
    const ix = B.buildLpVaultCrankFeesIxBoundV22(m, pk(), 0, { bond: true });
    expect(ix.keys).toHaveLength(10);
    const T = B.ACCOUNT_TAILS_V22[78];
    expect(ix.keys[T.boundState].pubkey.equals(deriveVaultLpStateP3(P, MARKET)[0])).toBe(true);
    expect(ix.keys[T.ext].pubkey.equals(EXT)).toBe(true);
    expect(ix.keys[T.boundLp]).toMatchObject({ isWritable: true });
    expect(ix.keys[T.boundLp].pubkey.equals(LP)).toBe(true);
    expect(ix.keys[T.bondTranche]).toMatchObject({ isWritable: true });
    expect(ix.keys[T.bondTranche].pubkey.equals(W.deriveBondTrancheV22(P, MARKET)[0])).toBe(true);
    expect(B.buildLpVaultCrankFeesIxBoundV22(m, pk(), 0).keys).toHaveLength(9);
    expect(B.buildLpVaultCrankFeesIxBoundV22({ ...m, vaultLpExt: undefined }, pk(), 0).keys).toHaveLength(7);
    expect(() => B.buildLpVaultCrankFeesIxBoundV22({ ...m, vaultLpExt: undefined }, pk(), 0, { bond: true })).toThrow();
  });
  it("97: [11] ext, [12] tranche", () => {
    const ix = B.buildWithdrawJuniorTrancheIxV22(m, pk(), pk(), pk(), 5n, { bond: true });
    const T = B.ACCOUNT_TAILS_V22[97];
    expect(ix.keys).toHaveLength(13);
    expect(ix.keys[T.ext].pubkey.equals(EXT)).toBe(true);
    expect(ix.keys[T.bondTranche].pubkey.equals(W.deriveBondTrancheV22(P, MARKET)[0])).toBe(true);
    expect(B.buildWithdrawJuniorTrancheIxV22(m, pk(), pk(), pk(), 5n).keys).toHaveLength(12);
  });
  it("table agrees with the tail helpers", () => {
    expect(W.BOND_TAIL_INDEX_V22).toEqual({ 78: B.ACCOUNT_TAILS_V22[78].bondTranche, 97: B.ACCOUNT_TAILS_V22[97].bondTranche, 102: B.ACCOUNT_TAILS_V22[102].bondTranche, 103: B.ACCOUNT_TAILS_V22[103].bondTranche });
    expect(W.INSURANCE_UNITS_TAIL_FROM_V22).toEqual(B.ACCOUNT_TAILS_V22.units);
    const d = B.buildDepositToLpVaultIxBoundV22(m, pk(), pk(), pk(), pk(), 1n);
    expect([d.keys.length, d.keys[B.ACCOUNT_TAILS_V22[75].boundState].pubkey.equals(deriveVaultLpStateP3(P, MARKET)[0]), d.keys[B.ACCOUNT_TAILS_V22[75].boundLp].pubkey.equals(LP)]).toEqual([13, true, true]);
  });
});

describe("quotes", () => {
  it("bond deposit / withdraw / rescue refusals carry the on-chain codes", () => {
    expect(M.quoteBondDepositV22({ amount: 100n, bSharesTotal: 100n, cBAtoms: 100n, capBps: 5000, vaultValue: 850n, seniorClaimEff: 800n }).refusal?.code).toBe(107);
    expect(M.quoteBondDepositV22({ amount: 1_000n, bSharesTotal: 100n, cBAtoms: 100n, capBps: 100, vaultValue: 5_000n, seniorClaimEff: 800n }).refusal?.code).toBe(123);
    const ok = M.quoteBondDepositV22({ amount: 100n, bSharesTotal: 0n, cBAtoms: 0n, capBps: 5000, vaultValue: 2_000n, seniorClaimEff: 1_000n, slippageBps: 100 });
    expect([ok.shares, ok.minShares, ok.refusal]).toEqual([100n, 99n, null]);
    expect(M.quoteBondWithdrawV22({ shares: 100n, bSharesTotal: 1000n, cBAtoms: 1000n, vaultValue: 3000n, seniorClaimEff: 1000n, live: { nCapAfter: 1n, oiLongQ: 5n, oiShortQ: 0n, lpEffAbsQ: 0n } }).refusal?.code).toBe(108);
    expect(M.quoteRescueV22({ amount: 100_000_000n, v: 40_000_000n, par: 1_000_000_000n, shares: 1000n }).refusal).toMatchObject({ code: 115 });
    expect(M.quoteRescueV22({ amount: 1n, v: 800_000_000n, par: 1_000_000_000n, shares: 1000n }).refusal).toMatchObject({ code: 114 });
    expect(M.quoteRescueV22({ amount: 100_000_000n, v: 800_000_000n, par: 1_000_000_000n, shares: 1000n, seniorClaim: 1_000_000_000n }).claimDelta).toBe(125_000_000n);
    expect(M.g9PhaseV22(0n, 1n)).toBe("propose");
    expect(M.g9PhaseV22(1000n, 5000n)).toBe("wait");
    expect(M.g9PhaseV22(1000n, 10_500n)).toBe("draw");
  });
  it("lot helpers", () => {
    expect(M.lotExpForTokenPriceV22(400n)).toBe(5);
    expect(M.lotExpForTokenPriceV22(10_000_000n)).toBe(0);
    expect(M.displayPriceV22(40_000_000n, 5)).toBe("0.0004");
    expect(M.tokensToLotsV22(123_456n, 3)).toEqual({ lots: 123n, remainderTokens: 456n });
    expect(M.tokensToLotsV22(-123_456n, 3)).toEqual({ lots: -123n, remainderTokens: -456n });
  });
});

describe("error table: every new wrapper code has a stable name and one calm line", () => {
  it("104..119, 123, 124", () => {
    for (const c of [104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 123, 124]) {
      const e = PERCOLATOR_ERRORS[c];
      expect(e, String(c)).toBeDefined();
      expect(e.hint.split("\n")).toHaveLength(1);
      expect(e.hint.length).toBeLessThan(200);
    }
    expect(PERCOLATOR_ERRORS[117].hint).toBe("The exit price moved below your minimum; retry or lower it.");
    expect(PERCOLATOR_ERRORS[118].hint).toBe("Refreshing positions before your exit; retry shortly.");
  });
});

// ---------------------------------------------------------------------------------------------
// Stake v5. Vectors are derived by reading percolator-stake release/v22-stake 49e27e7:
//   instruction.rs:769-806 (tag 0, 23-byte InitPoolV5), :807-827 (tag 1, 15-byte DepositWithConsent),
//   :828-847 (tags 31/32/33), state.rs:246-293 (offsets), error.rs:113-149 (33..45).
// ---------------------------------------------------------------------------------------------
describe("stake v5", () => {
  it("wire (instruction.rs unpack)", () => {
    expect(hex(K.encodeStakeDepositWithConsentV5(0x1122334455667788n, { targetBps: 0x0102, bufferBps: 0x0304, hysteresisBps: 0x0506 })))
      .toBe("01" + "8877665544332211" + "02" + "0201" + "0403" + "0605");
    expect(hex(K.encodeStakeInitPoolV5(1n, 2n, 1, { targetBps: 5000, bufferBps: 3000, hysteresisBps: 500 }))).toBe("00" + "0100000000000000" + "0200000000000000" + "01" + "8813" + "b80b" + "f401");
    expect(K.encodeStakeInitPoolV5(1n, 2n, 1, { targetBps: 5000, bufferBps: 3000, hysteresisBps: 500 })).toHaveLength(24);
    expect(hex(K.encodeStakeSyncInsuranceDeploymentV5())).toBe("1f");
    expect(hex(K.encodeStakeProposeDeployTargetV5(0x1234))).toBe("203412");
    expect(hex(K.encodeStakeCommitDeployTargetV5())).toBe("21");
    expect(K.encodeStakeDepositWithConsentV5(1n, { targetBps: 1, bufferBps: 1, hysteresisBps: 1 })).toHaveLength(16);
    expect(K.encodeStakeDepositWithConsentV5(1n, { targetBps: 1, bufferBps: 1, hysteresisBps: 1 })[9]).toBe(2);
    expect(() => K.encodeStakeInitPoolV5(1n, 2n, 2, { targetBps: 1, bufferBps: 0, hysteresisBps: 0 })).toThrow();
    expect(() => K.encodeStakeProposeDeployTargetV5(8001)).toThrow();
    // NEGATIVE CONTROL: field order matters
    expect(hex(K.encodeStakeDepositWithConsentV5(1n, { targetBps: 0x0102, bufferBps: 0x0304, hysteresisBps: 0x0506 }))).not.toBe(hex(K.encodeStakeDepositWithConsentV5(1n, { targetBps: 0x0304, bufferBps: 0x0102, hysteresisBps: 0x0506 })));
  });
  it("account lists", () => {
    expect([K.ACCOUNTS_STAKE_DEPOSIT_V5.length, K.ACCOUNTS_STAKE_WITHDRAW_V5.length, K.ACCOUNTS_STAKE_SYNC_V5.length]).toEqual([14, 14, 11]);
    expect(K.ACCOUNTS_STAKE_DEPOSIT_V5[11]).toMatchObject({ name: "market", writable: true });
    const metas = K.stakeMetasV5(K.ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5, { anyone: pk(), pool: pk() });
    expect(metas).toHaveLength(3);
  });
  it("StakePool v5 decode (offsets pinned by state.rs const asserts)", () => {
    const d = new Uint8Array(480);
    const v = new DataView(d.buffer);
    d.set(Buffer.from("SPOOL_V1"), 320); d[328] = 5;
    d[408] = 1; d[409] = 2; v.setUint16(410, 5000, true); v.setUint16(412, 3000, true); v.setUint16(414, 500, true);
    v.setBigUint64(416, 11n, true); v.setBigUint64(424, 6000n, true); v.setBigUint64(432, 99n, true); v.setBigUint64(440, 150n, true); v.setBigUint64(448, 7n, true); d[456] = 1;
    d.set(new Uint8Array(32).fill(4), 8);
    const p = K.decodeStakePoolV5(d);
    expect([p.riskMode, p.consentVersion, p.deployTargetBps, p.liquidBufferBps, p.hysteresisBps, p.lastSyncSlot, p.pendingTargetBps, p.pendingTargetSlot, p.syncCooldownSlots, p.creatorForwardedAtoms, p.pendingTargetByProtocol])
      .toEqual([1, 2, 5000, 3000, 500, 11n, 6000n, 99n, 150n, 7n, true]);
    expect(K.consentParamsForPoolV5(p)).toEqual({ targetBps: 6000, bufferBps: 3000, hysteresisBps: 500 });
    expect(K.commitSlotForPendingTargetV5({ pendingTargetSlot: 99n, cooldownSlots: 1000n })).toBe(99n + 216_000n);
    d[328] = 4;
    expect(() => K.decodeStakePoolV5(d)).toThrow(/version/);
    expect(() => K.decodeStakePoolV5(new Uint8Array(408))).toThrow(/too short/);
  });
  it("errors 33..45 have the Rust names", () => {
    const names = ["ConsentRequired", "DeprecatedV5", "InsuranceUnitsInvalid", "LiquidityBufferExhausted", "SyncCooldownActive", "InvalidDeployConfig", "NotProtocolAuthority", "NoPendingDeployTarget", "NotSupportedOnFirstLoss", "AssetAdminNotBurned", "NothingToSync", "InsuranceReadingsDiverged", "InsuranceUnitsMismatch"];
    names.forEach((n, i) => expect(K.decodeStakeErrorV5(33 + i)?.name).toBe(n));
    expect(K.decodeStakeErrorV5(46)).toBeUndefined();
  });
  it("layout row sanity: standalone lengths", () => {
    expect(LAYOUT_V22.accounts.insuranceUnitsBody + 16).toBe(208);
  });
});

describe("v2.2 leg caps (percolator-prog#546)", () => {
  it("portfolio and batch caps are 4 and agree with the matcher-v2 constant", async () => {
    const { WRAPPER_BATCH_MAX_LEGS } = await import("../src/abi/matcher-v2.js");
    expect(W.WRAPPER_MAX_PORTFOLIO_ASSETS_V22).toBe(4);
    expect(W.BATCH_MAX_LEGS_V22).toBe(4);
    expect(W.BATCH_MAX_LEGS_V22).toBe(WRAPPER_BATCH_MAX_LEGS);
    expect(W.BATCH_MAX_LEGS_V22).toBeLessThanOrEqual(W.WRAPPER_MAX_PORTFOLIO_ASSETS_V22);
  });
  it("assertBatchLegsV22: 1..4 pass, 0 / 5 / 1.5 / NaN throw", () => {
    for (const n of [1, 2, 3, 4]) expect(() => W.assertBatchLegsV22(n)).not.toThrow();
    for (const n of [0, 5, 11, 14, 1.5, Number.NaN, -1]) expect(() => W.assertBatchLegsV22(n)).toThrow(/1\.\.=4/);
  });
});
