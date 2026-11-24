/**
 * R3.19: stake staker-signer fix (QA 2026-10-15 14:48, Medium).
 *
 * The stake Deposit / DepositJunior / v5 Deposit / v5 Withdraw builders marked the staker as signer but READ-ONLY.
 * Against the live v2.2 stake (percolator-stake `feat/v22-stake-closeout-split` 0f88ff1) the staker is:
 *   - the rent payer of the per-user deposit PDA (`process_deposit` / `process_deposit_junior` ->
 *     `create_or_adopt_pda(deposit_pda, user, ..)`, a System create/transfer that debits it), and
 *   - on a FIRST_LOSS pool, the payer of the wrapper tag-116 refresh CPI (`v5_read_units(pool, user, ..)` ->
 *     `cpi_refresh_ins_units`, which passes `AccountMeta::new(payer, true)`), in both Deposit and Withdraw.
 * A read-only staker only worked when it was also the fee payer (the fee payer is always writable). With a separate
 * fee payer the runtime refuses the CPI / System debit with `PrivilegeEscalation`.
 *
 * No LiteSVM / bankrun harness exists in this package, so the runtime check here is meta-level: it compiles the real
 * transaction message with a SEPARATE fee payer and applies the runtime's CPI privilege rule (a callee meta that is
 * writable / signer requires the caller's account to be writable / signer in the outer message).
 */
import { Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { AccountMeta, Message } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { describe, expect, it } from "vitest";
import * as K from "../src/abi/v22-stake.js";
import {
  accrueFeesAccounts,
  adminCloseSlabAccounts,
  adminResolveMarketCpiAccounts,
  bindInsuranceAuthorityAccounts,
  burnAssetAdminAccounts,
  depositAccounts,
  depositJuniorAccounts,
  encodeStakeDeposit,
  encodeStakeWithdraw,
  initPoolAccounts,
  recoverTerminalInsuranceAccounts,
  rotateInsuranceAccounts,
  stakeGroupAProxyAccounts,
  stakeGroupBProxyAccounts,
  withdrawAccounts,
} from "../src/solana/stake.js";

const pk = (): PublicKey => Keypair.generate().publicKey;
type Flag = [boolean, boolean]; // [isSigner, isWritable]
const flags = (keys: readonly AccountMeta[]): Flag[] => keys.map((k) => [k.isSigner, k.isWritable]);
const S_W: Flag = [true, true], S_R: Flag = [true, false], W: Flag = [false, true], R: Flag = [false, false];

const STAKE = pk();
const user = pk(), pool = pk(), userCollateral = pk(), vault = pk(), lpMint = pk(), userLp = pk(), vaultAuth = pk();
const deposit = pk(), market = pk(), insuranceUnits = pk(), wrapperProgram = pk(), wrapperVault = pk(), wrapperVaultAuthority = pk();

const legacyDeposit = { user, pool, userCollateralAta: userCollateral, vault, lpMint, userLpAta: userLp, vaultAuth, depositPda: deposit, slab: market };
const legacyWithdraw = { user, pool, userLpAta: userLp, lpMint, vault, userCollateralAta: userCollateral, vaultAuth, depositPda: deposit, slab: market };
const v5Keys = { user, pool, userCollateral, vault, lpMint, userLp, vaultAuthority: vaultAuth, deposit, market, insuranceUnits, wrapperProgram };

/** Compile with a fee payer that is NOT the staker (the QA failure case). */
function compileWithSeparatePayer(ix: TransactionInstruction, feePayer: PublicKey): Message {
  const tx = new Transaction({ feePayer, recentBlockhash: "11111111111111111111111111111111" });
  tx.add(ix);
  return tx.compileMessage();
}

/** Runtime CPI / System-debit privilege rule: the outer message must grant at least what the callee meta demands. */
function privilegeOk(msg: Message, key: PublicKey, needSigner: boolean, needWritable: boolean): boolean {
  const i = msg.accountKeys.findIndex((k) => k.equals(key));
  if (i < 0) return false;
  return (!needSigner || msg.isAccountSigner(i)) && (!needWritable || msg.isAccountWritable(i));
}

describe("exact AccountMeta flags, stake 0f88ff1", () => {
  it("Deposit (tag 1) / DepositJunior (tag 16): staker [0] signer+writable (deposit-PDA rent payer)", () => {
    const expected: Flag[] = [S_W, W, W, W, W, W, R, W, R, R, R, R];
    expect(flags(depositAccounts(legacyDeposit))).toEqual(expected);
    expect(flags(depositJuniorAccounts(legacyDeposit))).toEqual(expected);
    expect(depositAccounts(legacyDeposit)[0]).toEqual({ pubkey: user, isSigner: true, isWritable: true });
  });

  it("Withdraw (tag 2) legacy / FEE_ONLY layout: staker [0] signer, read-only (no lamport debit on this path)", () => {
    expect(flags(withdrawAccounts(legacyWithdraw))).toEqual([S_R, W, W, W, W, W, R, W, R, R, R]);
    expect(flags(withdrawAccounts({ ...legacyWithdraw, slab: undefined }))).toEqual([S_R, W, W, W, W, W, R, W, R, R]);
  });

  it("v5 Deposit FIRST_LOSS (14 accounts): staker [0] signer+writable (rent + tag-116 refresh payer)", () => {
    const metas = K.stakeMetasV5(K.ACCOUNTS_STAKE_DEPOSIT_V5, v5Keys);
    expect(flags(metas)).toEqual([S_W, W, W, W, W, W, R, W, R, R, R, W, W, R]);
    expect(metas[0]).toEqual({ pubkey: user, isSigner: true, isWritable: true });
    expect([metas[8].pubkey, metas[9].pubkey, metas[10].pubkey]).toEqual([TOKEN_PROGRAM_ID, SYSVAR_CLOCK_PUBKEY, SystemProgram.programId]);
  });

  it("v5 Withdraw FIRST_LOSS (14 accounts): staker [0] signer+writable (tag-116 refresh payer)", () => {
    const metas = K.stakeMetasV5(K.ACCOUNTS_STAKE_WITHDRAW_V5, v5Keys);
    expect(flags(metas)).toEqual([S_W, W, W, W, W, W, R, W, R, R, W, W, R, R]);
    expect(metas[0]).toEqual({ pubkey: user, isSigner: true, isWritable: true });
    expect(metas[13].pubkey).toEqual(SystemProgram.programId);
  });

  it("v5 SyncInsuranceDeployment / ProposeDeployTarget / CommitDeployTarget", () => {
    const caller = pk();
    expect(flags(K.stakeMetasV5(K.ACCOUNTS_STAKE_SYNC_V5, { caller, pool, vault, vaultAuthority: vaultAuth, market, wrapperVault, wrapperVaultAuthority, insuranceUnits, wrapperProgram })))
      .toEqual([S_W, W, W, R, W, W, R, W, R, R, R]);
    expect(flags(K.stakeMetasV5(K.ACCOUNTS_STAKE_PROPOSE_DEPLOY_TARGET_V5, { authority: caller, pool }))).toEqual([S_R, W]);
    expect(flags(K.stakeMetasV5(K.ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5, { anyone: caller, pool }))).toEqual([S_R, W, R]);
  });

  it("admin / permissionless builders (signer flags match the program's is_signer checks)", () => {
    const admin = pk(), slab = pk(), perc = pk(), t = pk();
    expect(flags(initPoolAccounts({ admin, slab, pool, lpMint, vault, vaultAuth, collateralMint: pk(), percolatorProgram: perc })))
      .toEqual([S_W, W, W, W, W, R, R, R, R, R, R]);
    expect(flags(accrueFeesAccounts({ caller: admin, pool, vault, slab }))).toEqual([S_R, W, R, R, R]);
    expect(flags(bindInsuranceAuthorityAccounts({ admin, poolPda: pool, vaultAuth, slab, percolatorProgram: perc }))).toEqual([S_R, W, R, W, R]);
    // audit-1017 S3: the pool is WRITABLE. Deployed stake 53f5480 (7JrgAUHi; M-2, 21c84f7) refuses a read-only pool with
    // InvalidAccount (16) on every v5 pool (FIRST_LOSS / FEE_ONLY = every v2.2 pool): `validate_account_writable(pool_pda)`
    // when `pool.is_v5_risk_mode()` in process_rotate_insurance_operator / process_rotate_insurance_authority.
    expect(flags(rotateInsuranceAccounts({ admin, poolPda: pool, vaultAuth, newTarget: t, slab, percolatorProgram: perc }))).toEqual([S_R, W, R, S_R, W, R]);
    expect(flags(burnAssetAdminAccounts({ admin, poolPda: pool, vaultAuth, slab, percolatorProgram: perc }))).toEqual([S_W, W, R, W, R]);
    expect(flags(adminResolveMarketCpiAccounts({ admin, poolPda: pool, slab, percolatorProgram: perc }))).toEqual([S_R, R, W, R]);
    expect(flags(stakeGroupAProxyAccounts({ admin, poolPda: pool, slab, percolatorProgram: perc }))).toEqual([S_R, R, W, R]);
    expect(flags(stakeGroupBProxyAccounts({ admin, poolPda: pool, vaultAuth, slab, percolatorProgram: perc }))).toEqual([S_R, R, R, W, R]);
    expect(flags(recoverTerminalInsuranceAccounts({ caller: t, pool, poolVault: vault, vaultAuth, market, wrapperVault, wrapperVaultAuthority, wrapperProgram })))
      .toEqual([R, W, W, R, W, W, R, R, R]);
    expect(flags(adminCloseSlabAccounts({ admin, pool, market, wrapperVault, wrapperVaultAuthority, poolDestToken: t, collateralMint: pk(), poolVault: vault, wrapperProgram })))
      .toEqual([S_W, W, W, W, R, W, R, W, W, R]);
  });
});

describe("regression: staker != fee payer (compiled message + runtime privilege rule)", () => {
  const feePayer = pk();

  const cases: [string, TransactionInstruction][] = [
    ["Deposit (legacy / mode 0)", new TransactionInstruction({ programId: STAKE, keys: depositAccounts(legacyDeposit), data: Buffer.from(encodeStakeDeposit(1n)) })],
    ["DepositJunior", new TransactionInstruction({ programId: STAKE, keys: depositJuniorAccounts(legacyDeposit), data: Buffer.from([16, 1, 0, 0, 0, 0, 0, 0, 0]) })],
    ["v5 Deposit FIRST_LOSS", new TransactionInstruction({ programId: STAKE, keys: K.stakeMetasV5(K.ACCOUNTS_STAKE_DEPOSIT_V5, v5Keys), data: Buffer.from(encodeStakeDeposit(1n)) })],
    ["v5 Withdraw FIRST_LOSS", new TransactionInstruction({ programId: STAKE, keys: K.stakeMetasV5(K.ACCOUNTS_STAKE_WITHDRAW_V5, v5Keys), data: Buffer.from(encodeStakeWithdraw(1n)) })],
  ];

  for (const [name, ix] of cases) {
    it(`${name}: staker keeps signer+writable with a separate fee payer`, () => {
      const msg = compileWithSeparatePayer(ix, feePayer);
      expect(msg.accountKeys[0].equals(feePayer)).toBe(true);
      expect(msg.accountKeys.findIndex((k) => k.equals(user))).toBeGreaterThan(0);
      // System create_account / transfer from the staker, and the tag-116 CPI meta `AccountMeta::new(payer, true)`.
      expect(privilegeOk(msg, user, true, true)).toBe(true);
    });
  }

  it("negative control: the pre-fix read-only staker fails the privilege rule only when it is not the fee payer", () => {
    const old = K.stakeMetasV5(K.ACCOUNTS_STAKE_DEPOSIT_V5, v5Keys).map((m, i) => (i === 0 ? { ...m, isWritable: false } : m));
    const ix = new TransactionInstruction({ programId: STAKE, keys: old, data: Buffer.from(encodeStakeDeposit(1n)) });
    expect(privilegeOk(compileWithSeparatePayer(ix, feePayer), user, true, true)).toBe(false); // QA failure: PrivilegeEscalation
    expect(privilegeOk(compileWithSeparatePayer(ix, user), user, true, true)).toBe(true); // why QA only passed with staker == payer
  });
});

// Mutation follow-up (J-20261123-SDK-REPORT-STAKESTAKERSIGNERMETAMUT): the flag checks above pin [isSigner, isWritable] per
// index but not WHICH pubkey sits there, so a swap of two same-flag accounts survived (M05 M09 M10 M11 M19 M21 M24 M26 M29).
// These pin the exact pubkey order the stake handlers parse (percolator-stake 0f88ff1 processor.rs).
const keysOf = (m: readonly AccountMeta[]): string[] => m.map((x) => x.pubkey.toBase58());
const b58 = (xs: PublicKey[]): string[] => xs.map((x) => x.toBase58());
const TOK = TOKEN_PROGRAM_ID, CLK = SYSVAR_CLOCK_PUBKEY, SYS = SystemProgram.programId;

describe("exact pubkey order (kills same-flag swaps)", () => {
  it("legacy Deposit / DepositJunior: process_deposit order", () => {
    const want = b58([user, pool, userCollateral, vault, lpMint, userLp, vaultAuth, deposit, TOK, CLK, SYS, market]);
    expect(keysOf(depositAccounts(legacyDeposit))).toEqual(want);
    expect(keysOf(depositJuniorAccounts(legacyDeposit))).toEqual(want);
  });

  it("legacy Withdraw: process_withdraw order, with and without slab", () => {
    const base = [user, pool, userLp, lpMint, vault, userCollateral, vaultAuth, deposit, TOK, CLK];
    expect(keysOf(withdrawAccounts(legacyWithdraw))).toEqual(b58([...base, market]));
    expect(keysOf(withdrawAccounts({ ...legacyWithdraw, slab: undefined }))).toEqual(b58(base));
  });

  it("v5 Deposit FIRST_LOSS (14 accounts): order", () => {
    expect(keysOf(K.stakeMetasV5(K.ACCOUNTS_STAKE_DEPOSIT_V5, v5Keys)))
      .toEqual(b58([user, pool, userCollateral, vault, lpMint, userLp, vaultAuth, deposit, TOK, CLK, SYS, market, insuranceUnits, wrapperProgram]));
  });

  it("v5 Withdraw FIRST_LOSS (14 accounts): order", () => {
    expect(keysOf(K.stakeMetasV5(K.ACCOUNTS_STAKE_WITHDRAW_V5, v5Keys)))
      .toEqual(b58([user, pool, userLp, lpMint, vault, userCollateral, vaultAuth, deposit, TOK, CLK, market, insuranceUnits, wrapperProgram, SYS]));
  });

  it("RecoverTerminalInsurance: order of the 9 fixed accounts", () => {
    const caller = pk(), poolVault = pk();
    const metas = recoverTerminalInsuranceAccounts({ caller, pool, poolVault, vaultAuth, market, wrapperVault, wrapperVaultAuthority, wrapperProgram });
    expect(keysOf(metas.slice(0, 9))).toEqual(b58([caller, pool, poolVault, vaultAuth, market, wrapperVault, wrapperVaultAuthority, TOK, wrapperProgram]));
  });
});

describe("compiled message: the staker, and only the staker, signs (separate fee payer)", () => {
  const feePayer = pk();
  const cases: [string, AccountMeta[]][] = [
    ["legacy Deposit", depositAccounts(legacyDeposit)],
    ["legacy Withdraw", withdrawAccounts(legacyWithdraw)],
    ["v5 Deposit", K.stakeMetasV5(K.ACCOUNTS_STAKE_DEPOSIT_V5, v5Keys)],
    ["v5 Withdraw", K.stakeMetasV5(K.ACCOUNTS_STAKE_WITHDRAW_V5, v5Keys)],
  ];
  for (const [name, keys] of cases) {
    it(`${name}: signers are exactly {feePayer, staker}`, () => {
      const msg = compileWithSeparatePayer(new TransactionInstruction({ programId: STAKE, keys, data: Buffer.alloc(9) }), feePayer);
      const signers = msg.accountKeys.filter((_, i) => msg.isAccountSigner(i)).map((k) => k.toBase58()).sort();
      expect(signers).toEqual([feePayer.toBase58(), user.toBase58()].sort());
    });
  }
});
