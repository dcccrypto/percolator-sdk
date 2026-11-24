/**
 * Pins every stake account-list builder against the deployed processor (percolator-stake 53f5480 / 2f90683,
 * src/processor.rs). Order, signer and writable per index. Mismatch audit: tag 29 omitted [9] units / [10] creator
 * (planStakeWindDown), see the FIX-SDK-STAKE report.
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  recoverTerminalInsuranceAccounts, adminCloseSlabAccounts, initPoolAccounts, depositAccounts, depositJuniorAccounts,
  withdrawAccounts, accrueFeesAccounts, bindInsuranceAuthorityAccounts, rotateInsuranceAccounts, burnAssetAdminAccounts,
  adminResolveMarketCpiAccounts, stakeGroupAProxyAccounts, stakeGroupBProxyAccounts,
} from "../src/solana/stake.js";
import { buildRecoverTerminalInsuranceIx } from "../src/solana/stake-wind-down.js";
import {
  ACCOUNTS_STAKE_DEPOSIT_V5, ACCOUNTS_STAKE_WITHDRAW_V5, ACCOUNTS_STAKE_SYNC_V5,
} from "../src/abi/v22-stake.js";

const pk = (): PublicKey => Keypair.generate().publicKey;
const W = pk();
const S = pk();

type M = { pubkey: PublicKey; isSigner: boolean; isWritable: boolean };
/** [name, signer, writable] per index. */
type Spec = ReadonlyArray<readonly [string, boolean, boolean]>;
/** A "token" row is always the classic SPL Token program (verify_token_program, processor.rs:4153 / 4492). */
function pin(keys: M[], spec: Spec, named: Record<string, PublicKey>) {
  const keyed: Record<string, PublicKey> = { token: TOKEN_PROGRAM_ID, ...named };
  expect(keys.length).toBe(spec.length);
  spec.forEach(([name, s, w], i) => {
    expect(keys[i]!.isSigner, `${name}[${i}] signer`).toBe(s);
    expect(keys[i]!.isWritable, `${name}[${i}] writable`).toBe(w);
    if (keyed[name]) expect(keys[i]!.pubkey.toBase58(), `${name}[${i}] key`).toBe(keyed[name]!.toBase58());
  });
}

describe("tag 29 RecoverTerminalInsurance (processor.rs:4139-4151, 4224-4260)", () => {
  const base = { caller: pk(), pool: pk(), poolVault: pk(), vaultAuth: pk(), market: pk(), wrapperVault: pk(), wrapperVaultAuthority: pk(), wrapperProgram: W };
  const head: Spec = [["caller", false, false], ["pool", false, true], ["poolVault", false, true], ["vaultAuth", false, false], ["market", false, true],
    ["wrapperVault", false, true], ["wrapperVaultAuthority", false, false], ["token", false, false], ["wrapperProgram", false, false]];
  it("legacy: 9 accounts, optional stray at [9]", () => {
    pin(recoverTerminalInsuranceAccounts({ ...base, riskMode: 0 }), head, base);
    const stray = pk();
    pin(recoverTerminalInsuranceAccounts({ ...base, stray }), [...head, ["stray", false, true]], { stray });
  });
  it("legacy: refuses insuranceUnits and creatorToken (units on a legacy pool hit IllegalOwner, processor.rs:4240-4243)", () => {
    expect(() => recoverTerminalInsuranceAccounts({ ...base, riskMode: 0, insuranceUnits: pk(), creatorToken: pk() })).toThrow(/legacy/);
    expect(() => recoverTerminalInsuranceAccounts({ ...base, riskMode: 0, insuranceUnits: pk() })).toThrow(/legacy/);
    expect(() => recoverTerminalInsuranceAccounts({ ...base, riskMode: 0, creatorToken: pk() })).toThrow(/legacy/);
  });
  it("FIRST_LOSS: [9] units (w) [10] creator (w) [11] stray (w); refuses a short list", () => {
    const insuranceUnits = pk(), creatorToken = pk(), stray = pk();
    pin(recoverTerminalInsuranceAccounts({ ...base, riskMode: 1, insuranceUnits, creatorToken, stray }),
      [...head, ["insuranceUnits", false, true], ["creatorToken", false, true], ["stray", false, true]], { insuranceUnits, creatorToken, stray });
    expect(() => recoverTerminalInsuranceAccounts({ ...base, riskMode: 1 })).toThrow(/FIRST_LOSS/);
    expect(() => recoverTerminalInsuranceAccounts({ ...base, riskMode: 1, insuranceUnits })).toThrow(/creatorToken/);
  });
  it("FEE_ONLY: creator token required, units refused, stray and creator trail in any order", () => {
    const creatorToken = pk(), stray = pk();
    pin(recoverTerminalInsuranceAccounts({ ...base, riskMode: 2, creatorToken }), [...head, ["creatorToken", false, true]], { creatorToken });
    pin(recoverTerminalInsuranceAccounts({ ...base, riskMode: 2, creatorToken, stray }), [...head, ["stray", false, true], ["creatorToken", false, true]], { stray, creatorToken });
    expect(() => recoverTerminalInsuranceAccounts({ ...base, riskMode: 2 })).toThrow(/creatorToken/);
    expect(() => recoverTerminalInsuranceAccounts({ ...base, riskMode: 2, creatorToken, insuranceUnits: pk() })).toThrow(/FEE_ONLY/);
  });
  it("buildRecoverTerminalInsuranceIx targets the stake program and forwards the exact list, tail included", () => {
    const creatorToken = pk(), stray = pk();
    const a = { ...base, stakeProgram: S, riskMode: 2 as const, creatorToken, stray };
    const ix = buildRecoverTerminalInsuranceIx(a, 7n);
    expect(ix.programId.toBase58()).toBe(S.toBase58());
    expect(ix.keys).toHaveLength(11);
    expect(ix.keys[10]!.pubkey.equals(creatorToken)).toBe(true);
    const flat = (ks: M[]) => ks.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]);
    expect(flat(ix.keys)).toEqual(flat(recoverTerminalInsuranceAccounts(a)));
  });
});

describe("tag 30 AdminCloseSlab (processor.rs:4481-4490, 4495-4498)", () => {
  it("10 accounts", () => {
    const a = { admin: pk(), pool: pk(), market: pk(), wrapperVault: pk(), wrapperVaultAuthority: pk(), poolDestToken: pk(), collateralMint: pk(), poolVault: pk(), wrapperProgram: W };
    pin(adminCloseSlabAccounts(a), [["admin", true, true], ["pool", false, true], ["market", false, true], ["wrapperVault", false, true], ["wrapperVaultAuthority", false, false],
      ["poolDestToken", false, true], ["token", false, false], ["collateralMint", false, true], ["poolVault", false, true], ["wrapperProgram", false, false]], a);
  });
});

describe("other stake builders vs processor", () => {
  it("InitPool tag 0 (processor.rs:576-586)", () => {
    const a = { admin: pk(), slab: pk(), pool: pk(), lpMint: pk(), vault: pk(), vaultAuth: pk(), collateralMint: pk(), percolatorProgram: pk() };
    pin(initPoolAccounts(a), [["admin", true, true], ["slab", false, true], ["pool", false, true], ["lpMint", false, true], ["vault", false, true], ["vaultAuth", false, false],
      ["collateralMint", false, false], ["percolatorProgram", false, false], ["token", false, false], ["system", false, false], ["rent", false, false]], a);
  });
  it("Deposit 1 / DepositJunior 16 legacy (processor.rs:865-879, 3504-3516)", () => {
    const a = { user: pk(), pool: pk(), userCollateralAta: pk(), vault: pk(), lpMint: pk(), userLpAta: pk(), vaultAuth: pk(), depositPda: pk(), slab: pk() };
    const spec: Spec = [["user", true, true], ["pool", false, true], ["userCollateralAta", false, true], ["vault", false, true], ["lpMint", false, true], ["userLpAta", false, true],
      ["vaultAuth", false, false], ["depositPda", false, true], ["token", false, false], ["clock", false, false], ["system", false, false], ["slab", false, false]];
    pin(depositAccounts(a), spec, a);
    pin(depositJuniorAccounts(a), spec, a);
  });
  it("Withdraw 2 legacy (processor.rs:1365-1377)", () => {
    const a = { user: pk(), pool: pk(), userLpAta: pk(), lpMint: pk(), vault: pk(), userCollateralAta: pk(), vaultAuth: pk(), depositPda: pk(), slab: pk() };
    pin(withdrawAccounts(a), [["user", true, false], ["pool", false, true], ["userLpAta", false, true], ["lpMint", false, true], ["vault", false, true], ["userCollateralAta", false, true],
      ["vaultAuth", false, false], ["depositPda", false, true], ["token", false, false], ["clock", false, false], ["slab", false, false]], a);
    expect(withdrawAccounts({ ...a, slab: undefined })).toHaveLength(10);
  });
  it("AccrueFees 12 (processor.rs:3187-3196)", () => {
    const a = { caller: pk(), pool: pk(), vault: pk(), slab: pk() };
    pin(accrueFeesAccounts(a), [["caller", true, false], ["pool", false, true], ["vault", false, false], ["clock", false, false], ["slab", false, false]], a);
  });
  it("Bind 19 / Burn 21 / RotateAuthority 20 / RotateOperator 22 (processor.rs:2242-2246, 2426-2430, 2541-2546, 2637-2642)", () => {
    const a = { admin: pk(), poolPda: pk(), vaultAuth: pk(), slab: pk(), percolatorProgram: pk(), newTarget: pk() };
    pin(bindInsuranceAuthorityAccounts(a), [["admin", true, false], ["poolPda", false, true], ["vaultAuth", false, false], ["slab", false, true], ["percolatorProgram", false, false]], a);
    pin(burnAssetAdminAccounts(a), [["admin", true, true], ["poolPda", false, true], ["vaultAuth", false, false], ["slab", false, true], ["percolatorProgram", false, false]], a);
    pin(rotateInsuranceAccounts(a), [["admin", true, false], ["poolPda", false, true], ["vaultAuth", false, false], ["newTarget", true, false], ["slab", false, true], ["percolatorProgram", false, false]], a);
  });
  it("AdminResolveMarket 24 and group A / B proxies 25..28 (processor.rs:4777-4780, 4963-4966, 5037-5041, 5099-5103)", () => {
    const a = { admin: pk(), poolPda: pk(), vaultAuth: pk(), slab: pk(), percolatorProgram: pk() };
    pin(adminResolveMarketCpiAccounts(a), [["admin", true, false], ["poolPda", false, false], ["slab", false, true], ["percolatorProgram", false, false]], a);
    pin(stakeGroupAProxyAccounts(a), [["admin", true, false], ["poolPda", false, false], ["slab", false, true], ["percolatorProgram", false, false]], a);
    pin(stakeGroupBProxyAccounts(a), [["admin", true, false], ["poolPda", false, false], ["vaultAuth", false, false], ["slab", false, true], ["percolatorProgram", false, false]], a);
  });
  it("v5 spec lists: Deposit (865-880), Withdraw (1365-1381), Sync tag 31 (5150-5160)", () => {
    const names = (s: readonly { name: string }[]) => s.map((x) => x.name);
    expect(names(ACCOUNTS_STAKE_DEPOSIT_V5)).toEqual(["user", "pool", "userCollateral", "vault", "lpMint", "userLp", "vaultAuthority", "deposit", "tokenProgram", "clock", "systemProgram", "market", "insuranceUnits", "wrapperProgram"]);
    expect(names(ACCOUNTS_STAKE_WITHDRAW_V5)).toEqual(["user", "pool", "userLp", "lpMint", "vault", "userCollateral", "vaultAuthority", "deposit", "tokenProgram", "clock", "market", "insuranceUnits", "wrapperProgram", "systemProgram"]);
    expect(names(ACCOUNTS_STAKE_SYNC_V5)).toEqual(["caller", "pool", "vault", "vaultAuthority", "market", "wrapperVault", "wrapperVaultAuthority", "insuranceUnits", "tokenProgram", "wrapperProgram", "systemProgram"]);
  });
});
