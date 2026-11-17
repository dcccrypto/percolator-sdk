/** Branch coverage for src/solana/v22.ts: guard/refusal branches and optional-field defaults. */
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import * as B from "../src/solana/v22.js";
import { deriveVaultLpExtP2b } from "../src/solana/p2b-earn.js";

const pk = () => Keypair.generate().publicKey;
const P = pk(), MARKET = pk(), LP = pk();
const EXT = deriveVaultLpExtP2b(P, MARKET)[0];
const m: B.MarketV22 = { programId: P, market: MARKET, registryDomain: 0, lpPortfolio: LP, vaultLpExt: EXT };
const noLp: B.MarketV22 = { programId: P, market: MARKET, registryDomain: 0 };

describe("computeBudgetPrelude", () => {
  it("accepts a raw unit count and rejects an unknown preset", () => {
    expect(B.computeBudgetPrelude(123_456).length).toBeGreaterThan(0);
    expect(B.computeBudgetPrelude(123_456, { priorityMicroLamportsPerCu: 5, heapBytes: 65_536 }).length).toBeGreaterThan(1);
    expect(() => B.computeBudgetPrelude("nope" as never)).toThrow(/unknown compute preset/);
  });
});

describe("missing m.lpPortfolio / m.vaultLpExt refusals", () => {
  const u = pk(), t = pk();
  it("each builder refuses a market without the vault LP portfolio", () => {
    expect(() => B.buildSettleHoldingRentIxV22(noLp, u, t, 0, 1n)).toThrow(/tag 106/);
    expect(() => B.buildSweepBandDustLegIxV22(noLp, u, t, 0)).toThrow(/tag 118/);
    expect(() => B.buildBondDepositIxV22(noLp, u, t, t, 1n, 1n)).toThrow(/tag 108/);
    expect(() => B.buildBondExecuteWithdrawIxV22(noLp, u, t, t, 1n, 0)).toThrow(/tag 110/);
    expect(() => B.buildInsuranceBackstopDrawIxV22(noLp, u, 1, 0n)).toThrow(/tag 111/);
    expect(() => B.buildLpVaultCrankFeesIxBoundV22(noLp, u, 0)).toThrow(/tag 78/);
    expect(() => B.buildWithdrawJuniorTrancheIxV22(noLp, u, t, t, 1n)).toThrow(/tag 97/);
  });
  it("InitBondTranche needs the ext; bond crank / junior withdraw need it with opts.bond", () => {
    const noExt = { ...m, vaultLpExt: undefined };
    expect(() => B.buildInitBondTrancheIxV22(noExt, u, u, { couponBps: 800, utilBonusBps: 0, cooldownSlots: 9000, capBps: 5000 })).toThrow(/tag 107/);
    expect(() => B.buildLpVaultCrankFeesIxBoundV22(noExt, u, 0, { bond: true })).toThrow(/vault LP ext/);
    expect(() => B.buildWithdrawJuniorTrancheIxV22(noExt, u, t, t, 1n, { bond: true })).toThrow(/vault LP ext/);
  });
  it("optional oracle accounts are appended after the base accounts", () => {
    const base = B.buildSettleHoldingRentIxV22(m, u, t, 0, 1n);
    const withOracle = B.buildSettleHoldingRentIxV22(m, u, t, 0, 1n, [pk(), pk()]);
    expect(withOracle.keys).toHaveLength(base.keys.length + 2);
    expect(withOracle.keys.slice(base.keys.length).every((k) => !k.isWritable)).toBe(true);
  });
});

describe("ExecuteRedemption / planEarnExit option branches", () => {
  const u = pk(), t = pk();
  const o = { minPayoutAtoms: 1n };
  it("defaults: no refresh, no oracle tail, redeemer signs", () => {
    const x = B.buildExecuteRedemptionIxV22(m, u, u, t, t, 0, o);
    expect(x.keys).toHaveLength(13);
    expect(x.keys[12].isSigner).toBe(true);
    expect(B.buildExecuteRedemptionIxV22(m, u, u, t, t, 0, { ...o, redeemerSigns: false }).keys[12].isSigner).toBe(false);
  });
  it("refresh + oracle tail; bound tail; bound refuses refresh or oracle accounts", () => {
    const withTail = B.buildExecuteRedemptionIxV22(m, u, u, t, t, 0, { ...o, refresh: [pk()], oracleAccounts: [pk()] });
    expect(withTail.keys).toHaveLength(15);
    expect(B.buildExecuteRedemptionIxV22(m, u, u, t, t, 0, { ...o, boundLpPortfolio: LP }).keys).toHaveLength(15);
    expect(() => B.buildExecuteRedemptionIxV22(m, u, u, t, t, 0, { ...o, boundLpPortfolio: LP, refresh: [pk()] })).toThrow(/bound vault/);
    expect(() => B.buildExecuteRedemptionIxV22(m, u, u, t, t, 0, { ...o, boundLpPortfolio: LP, oracleAccounts: [pk()] })).toThrow(/bound vault/);
    expect(() => B.buildExecuteRedemptionIxV22(m, u, u, t, t, 0, { ...o, refresh: Array.from({ length: 9 }, pk) })).toThrow(/at most/);
  });
  it("planEarnExitV22 without staleCandidates / keeperOk picks the no-refresh preset", () => {
    const plan = B.planEarnExitV22({ market: m, cranker: u, redeemer: u, redeemerLpAta: t, redeemerDest: t, vaultToken: t, sourceDomain: 0, shares: 10n });
    expect(plan.refreshSelected).toEqual([]);
    expect(plan.computeUnits).toBe(B.COMPUTE_PRESETS_V22.executeRedemption.units);
    expect(plan.finalize(1_000_000n).minPayoutAtoms).toBeLessThanOrEqual(1_000_000n);
  });
});

describe("classifyRedemptionSimulationV22", () => {
  it("covers ok, compute, 117, 118, other-with-code and other-without-code", () => {
    expect(B.classifyRedemptionSimulationV22({ err: null, logs: [] }).kind).toBe("ok");
    expect(B.classifyRedemptionSimulationV22({ err: undefined, logs: [] }).kind).toBe("ok");
    expect(B.classifyRedemptionSimulationV22({ err: {}, logs: ["Program x exceeded CUs meter at BPF instruction"] }).kind).toBe("computeBudgetExceeded");
    expect(B.classifyRedemptionSimulationV22({ err: "ComputationalBudgetExceeded", logs: [] }).kind).toBe("computeBudgetExceeded");
    expect(B.classifyRedemptionSimulationV22({ err: { InstructionError: [0, { Custom: 117 }] }, logs: ["Program failed: custom program error: 0x75"] })).toEqual({ kind: "belowMinPayout", code: 117 });
    expect(B.classifyRedemptionSimulationV22({ err: { InstructionError: [0, { Custom: 118 }] }, logs: ["Program failed: custom program error: 0x76"] })).toEqual({ kind: "notLossCurrent", code: 118 });
    expect(B.classifyRedemptionSimulationV22({ err: { x: 1 }, logs: ["Program failed: custom program error: 0x1"] })).toEqual({ kind: "other", code: 1 });
    expect(B.classifyRedemptionSimulationV22({ err: { x: 1 }, logs: ["nothing parseable"] })).toEqual({ kind: "other" });
  });
});

describe("buildLaunchBundleV22 serialization failure", () => {
  // Deterministic (no Keypair.generate: that is slow) unique keys.
  const key = (i: number) => new PublicKey(Buffer.alloc(32, i + 1));
  const mk = (tag: number, nKeys = 0) => new TransactionInstruction({ programId: P, data: Buffer.from([tag]), keys: Array.from({ length: nKeys }, (_, i) => ({ pubkey: key(i), isSigner: false, isWritable: false })) });
  const build = (supportsV1: boolean) => B.buildLaunchBundleV22({ payer: key(200), market: m, createAccounts: [], createVaultLp: mk(74), initVaultLp: mk(94), initBondTranche: mk(107, 100), supportsV1 });
  const catchErr = (fn: () => unknown): B.LaunchBundleTooLargeError => {
    try { fn(); } catch (e) { return e as B.LaunchBundleTooLargeError; }
    throw new Error("expected LaunchBundleTooLargeError");
  };
  it("an unserializable legacy bundle raises LaunchBundleTooLargeError with null bytes", () => {
    const e = catchErr(() => build(false));
    expect(e).toBeInstanceOf(B.LaunchBundleTooLargeError);
    expect(e.bytes).toBeNull();
    expect(e.limit).toBe(1232);
    expect(e.message).toMatch(/too large to serialize/);
  });
  it("supportsV1 with a v1 compile failure (over the account cap) falls through to legacy and still refuses", () => {
    const e = catchErr(() => build(true));
    expect(e).toBeInstanceOf(B.LaunchBundleTooLargeError);
    expect(e.bytes).toBeNull();
    expect(e.limit).toBe(1232);
  });
  it("message wording for an explicit byte size", () => {
    expect(new B.LaunchBundleTooLargeError(2000, 1232).message).toMatch(/2000 bytes/);
    expect(new B.LaunchBundleTooLargeError(null, 1232).message).toMatch(/too large to serialize/);
  });
});
