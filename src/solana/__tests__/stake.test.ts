import { describe, it, expect } from 'vitest';
import { PublicKey, Keypair } from '@solana/web3.js';

import {
  STAKE_PROGRAM_ID,
  STAKE_IX,
  STAKE_ERRORS,
  deriveStakePool,
  deriveStakeVaultAuth,
  deriveDepositPda,
  encodeStakeInitPool,
  encodeStakeDeposit,
  encodeStakeWithdraw,
  encodeStakeFlushToInsurance,
  encodeStakeUpdateConfig,
  encodeStakeTransferAdmin,
  encodeStakeAdminSetOracleAuthority,
  encodeStakeAdminSetRiskThreshold,
  encodeStakeAdminSetMaintenanceFee,
  encodeStakeAdminResolveMarket,
  encodeStakeAdminWithdrawInsurance,
  encodeStakeReturnInsurance,
  encodeStakeAdminSetInsurancePolicy,
  encodeStakeAdminSetHwmConfig,
  encodeStakeSetMarketResolved,
  encodeStakeProposeAdmin,
  encodeStakeAcceptAdmin,
  encodeStakeProposeCooldownIncrease,
  encodeStakeCommitCooldownIncrease,
  encodeStakeCancelCooldownIncrease,
  encodeStakeAdminSetTrancheConfig,
  encodeStakeDepositJunior,
  encodeStakeBindInsuranceAuthority,
  encodeStakeRotateInsuranceAuthority,
  encodeStakeRotateInsuranceOperator,
  encodeStakeBurnAssetAdmin,
  encodeStakeRecoverFlushedInsurance,
  bindInsuranceAuthorityAccounts,
  rotateInsuranceAccounts,
  burnAssetAdminAccounts,
  recoverFlushedInsuranceAccounts,
  initPoolAccounts,
  depositAccounts,
  withdrawAccounts,
  flushToInsuranceAccounts,
} from '../stake.js';

// ── Uint8Array read helpers (replaces Buffer.readBigUInt64LE / readUInt16LE) ─
function readU64LE(buf: Uint8Array, offset: number): bigint {
  const dv = new DataView(buf.buffer, buf.byteOffset + offset, 8);
  return dv.getBigUint64(0, /* littleEndian= */ true);
}
function readU16LE(buf: Uint8Array, offset: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset + offset, 2);
  return dv.getUint16(0, /* littleEndian= */ true);
}

const slab = Keypair.generate().publicKey;
const user = Keypair.generate().publicKey;

describe('STAKE_PROGRAM_ID', () => {
  it('is a valid public key pointing at the deployed devnet stake/vault program (51CeUNpb...), matching PROGRAM_IDS_V17.vault', () => {
    expect(STAKE_PROGRAM_ID.toBase58()).toBe('51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ');
  });
});

describe('STAKE_IX tags — ADOPTED percolator-stake lineage (feat/adopt-stake-lineage-plus-n7)', () => {
  it('has correct tag values matching the adopted lineage src/instruction.rs', () => {
    expect(STAKE_IX.InitPool).toBe(0);
    expect(STAKE_IX.Deposit).toBe(1);
    expect(STAKE_IX.Withdraw).toBe(2);
    expect(STAKE_IX.FlushToInsurance).toBe(3);
    expect(STAKE_IX.UpdateConfig).toBe(4);
    expect(STAKE_IX.ProposeAdmin).toBe(5);
    expect(STAKE_IX.AcceptAdmin).toBe(6);
    expect(STAKE_IX.ProposeCooldownIncrease).toBe(7);
    expect(STAKE_IX.CommitCooldownIncrease).toBe(8);
    expect(STAKE_IX.CancelCooldownIncrease).toBe(9);
    expect(STAKE_IX.ReturnInsurance).toBe(10);
    expect(STAKE_IX.AdminWithdrawInsurance).toBe(10);
    expect(STAKE_IX.AdminSetInsurancePolicy).toBe(11);
    expect(STAKE_IX.AccrueFees).toBe(12);
    expect(STAKE_IX.InitTradingPool).toBe(13);
    expect(STAKE_IX.AdminSetHwmConfig).toBe(14);
    expect(STAKE_IX.AdminSetTrancheConfig).toBe(15);
    expect(STAKE_IX.DepositJunior).toBe(16);
    expect(STAKE_IX.SetMarketResolved).toBe(18);
    expect(STAKE_IX.BindInsuranceAuthority).toBe(19);
    expect(STAKE_IX.RotateInsuranceAuthority).toBe(20);
    expect(STAKE_IX.BurnAssetAdmin).toBe(21);
    expect(STAKE_IX.RotateInsuranceOperator).toBe(22);
    expect(STAKE_IX.RecoverFlushedInsurance).toBe(23);
  });

  it('BindInsuranceAuthority moved off tag 15 — AdminSetTrancheConfig and BindInsuranceAuthority no longer collide', () => {
    expect(STAKE_IX.AdminSetTrancheConfig).toBe(15);
    expect(STAKE_IX.BindInsuranceAuthority).toBe(19);
    expect(STAKE_IX.AdminSetTrancheConfig).not.toBe(STAKE_IX.BindInsuranceAuthority);
  });
});

describe('PDA derivation', () => {
  it('deriveStakePool returns consistent PDA', () => {
    const [pda1, bump1] = deriveStakePool(slab);
    const [pda2, bump2] = deriveStakePool(slab);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
    expect(bump1).toBeGreaterThanOrEqual(0);
    expect(bump1).toBeLessThanOrEqual(255);
  });

  it('deriveStakePool differs by slab', () => {
    const [pda1] = deriveStakePool(slab);
    const [pda2] = deriveStakePool(user);
    expect(pda1.equals(pda2)).toBe(false);
  });

  it('deriveStakeVaultAuth returns consistent PDA', () => {
    const [pool] = deriveStakePool(slab);
    const [auth1] = deriveStakeVaultAuth(pool);
    const [auth2] = deriveStakeVaultAuth(pool);
    expect(auth1.equals(auth2)).toBe(true);
  });

  it('deriveDepositPda is per-user', () => {
    const [pool] = deriveStakePool(slab);
    const user2 = Keypair.generate().publicKey;
    const [dep1] = deriveDepositPda(pool, user);
    const [dep2] = deriveDepositPda(pool, user2);
    expect(dep1.equals(dep2)).toBe(false);
  });

  it('deriveDepositPda is per-pool', () => {
    const [pool1] = deriveStakePool(slab);
    const [pool2] = deriveStakePool(user);
    const [dep1] = deriveDepositPda(pool1, user);
    const [dep2] = deriveDepositPda(pool2, user);
    expect(dep1.equals(dep2)).toBe(false);
  });
});

describe('Instruction encoders', () => {
  it('encodeStakeInitPool — tag 0 + cooldown + cap', () => {
    const buf = encodeStakeInitPool(100n, 5000n);
    expect(buf[0]).toBe(0);
    expect(buf.length).toBe(1 + 8 + 8);
    expect(readU64LE(buf, 1)).toBe(100n);
    expect(readU64LE(buf, 9)).toBe(5000n);
  });

  it('encodeStakeDeposit — tag 1 + amount', () => {
    const buf = encodeStakeDeposit(42n);
    expect(buf[0]).toBe(1);
    expect(buf.length).toBe(9);
    expect(readU64LE(buf, 1)).toBe(42n);
  });

  it('encodeStakeWithdraw — tag 2 + lp_amount', () => {
    const buf = encodeStakeWithdraw(999n);
    expect(buf[0]).toBe(2);
    expect(readU64LE(buf, 1)).toBe(999n);
  });

  it('encodeStakeFlushToInsurance — tag 3 + amount', () => {
    const buf = encodeStakeFlushToInsurance(500n);
    expect(buf[0]).toBe(3);
    expect(readU64LE(buf, 1)).toBe(500n);
  });

  it('encodeStakeUpdateConfig — both set', () => {
    const buf = encodeStakeUpdateConfig(200n, 1000n);
    expect(buf[0]).toBe(4);
    expect(buf[1]).toBe(1); // has_cooldown
    expect(readU64LE(buf, 2)).toBe(200n);
    expect(buf[10]).toBe(1); // has_cap
    expect(readU64LE(buf, 11)).toBe(1000n);
  });

  it('encodeStakeUpdateConfig — none set', () => {
    const buf = encodeStakeUpdateConfig();
    expect(buf[0]).toBe(4);
    expect(buf[1]).toBe(0); // no cooldown
    expect(buf[10]).toBe(0); // no cap
  });

  it('encodeStakeUpdateConfig — only cooldown set', () => {
    const buf = encodeStakeUpdateConfig(300n, undefined);
    expect(buf[1]).toBe(1);            // has_cooldown
    expect(readU64LE(buf, 2)).toBe(300n);
    expect(buf[10]).toBe(0);           // no cap
    expect(readU64LE(buf, 11)).toBe(0n);
  });

  it('encodeStakeUpdateConfig — only cap set', () => {
    const buf = encodeStakeUpdateConfig(undefined, 500n);
    expect(buf[1]).toBe(0);            // no cooldown
    expect(readU64LE(buf, 2)).toBe(0n);
    expect(buf[10]).toBe(1);           // has_cap
    expect(readU64LE(buf, 11)).toBe(500n);
  });

  it('encodeStakeTransferAdmin throws — tag 5 is now ProposeAdmin in the adopted lineage', () => {
    expect(() => encodeStakeTransferAdmin()).toThrow(/tag 5/i);
  });

  it('encodeStakeAdminSetOracleAuthority throws — tag 6 is now AcceptAdmin in the adopted lineage', () => {
    const auth = Keypair.generate().publicKey;
    expect(() => encodeStakeAdminSetOracleAuthority(auth)).toThrow(/tag 6/i);
  });

  it('encodeStakeAdminSetRiskThreshold throws — tag 7 is now ProposeCooldownIncrease in the adopted lineage', () => {
    expect(() => encodeStakeAdminSetRiskThreshold(12345n)).toThrow(/tag 7/i);
  });

  it('encodeStakeAdminSetRiskThreshold still throws for large values because tag 7 is repurposed', () => {
    const largeValue = (1n << 64n) + 1n; // requires non-zero high word
    expect(() => encodeStakeAdminSetRiskThreshold(largeValue)).toThrow(/tag 7/i);
  });

  it('encodeStakeAdminSetMaintenanceFee throws — tag 8 is now CommitCooldownIncrease in the adopted lineage', () => {
    expect(() => encodeStakeAdminSetMaintenanceFee(77n)).toThrow(/tag 8/i);
  });

  it('encodeStakeAdminResolveMarket throws — tag 9 is now CancelCooldownIncrease in the adopted lineage', () => {
    expect(() => encodeStakeAdminResolveMarket()).toThrow(/tag 9/i);
  });

  it('encodeStakeProposeAdmin — tag 5 + new_admin(32)', () => {
    const newAdmin = Keypair.generate().publicKey;
    const buf = encodeStakeProposeAdmin(newAdmin);
    expect(buf[0]).toBe(5);
    expect(buf.length).toBe(1 + 32);
    expect(new PublicKey(buf.subarray(1, 33)).equals(newAdmin)).toBe(true);
  });

  it('encodeStakeProposeAdmin accepts the zero pubkey as a cancel sentinel', () => {
    const buf = encodeStakeProposeAdmin(PublicKey.default);
    expect(buf[0]).toBe(5);
    expect(new PublicKey(buf.subarray(1, 33)).equals(PublicKey.default)).toBe(true);
  });

  it('encodeStakeAcceptAdmin — tag 6, no payload', () => {
    const buf = encodeStakeAcceptAdmin();
    expect(buf.length).toBe(1);
    expect(buf[0]).toBe(6);
  });

  it('encodeStakeProposeCooldownIncrease — tag 7 + new_cooldown_slots(u64)', () => {
    const buf = encodeStakeProposeCooldownIncrease(123_456n);
    expect(buf[0]).toBe(7);
    expect(buf.length).toBe(1 + 8);
    expect(readU64LE(buf, 1)).toBe(123_456n);
  });

  it('encodeStakeCommitCooldownIncrease — tag 8, no payload', () => {
    const buf = encodeStakeCommitCooldownIncrease();
    expect(buf.length).toBe(1);
    expect(buf[0]).toBe(8);
  });

  it('encodeStakeCancelCooldownIncrease — tag 9, no payload', () => {
    const buf = encodeStakeCancelCooldownIncrease();
    expect(buf.length).toBe(1);
    expect(buf[0]).toBe(9);
  });

  it('encodeStakeAdminWithdrawInsurance aliases ReturnInsurance at tag 10', () => {
    const buf = encodeStakeAdminWithdrawInsurance(1234n);
    expect(buf[0]).toBe(10);
    expect(readU64LE(buf, 1)).toBe(1234n);
  });

  it('encodeStakeReturnInsurance — tag 10 + amount', () => {
    const buf = encodeStakeReturnInsurance(1234n);
    expect(buf[0]).toBe(10);
    expect(readU64LE(buf, 1)).toBe(1234n);
  });

  it('encodeStakeAdminSetInsurancePolicy rejects removed tag 11', () => {
    const auth = Keypair.generate().publicKey;
    expect(() => encodeStakeAdminSetInsurancePolicy(auth, 100n, 500, 200n)).toThrow(/tag 11/i);
  });

  it('encodeStakeSetMarketResolved — tag 18, no payload (live on the adopted lineage)', () => {
    const buf = encodeStakeSetMarketResolved();
    expect(buf.length).toBe(1);
    expect(buf[0]).toBe(18);
    expect(buf[0]).toBe(STAKE_IX.SetMarketResolved);
  });

  it('encodeStakeAdminSetTrancheConfig — tag 15 + junior_fee_mult_bps(u16), no longer collides with BindInsuranceAuthority', () => {
    const buf = encodeStakeAdminSetTrancheConfig(20_000);
    expect(buf[0]).toBe(15);
    expect(buf.length).toBe(1 + 2);
    expect(readU16LE(buf, 1)).toBe(20_000);
  });

  it('encodeStakeDepositJunior — tag 16 + amount(u64), live on the adopted lineage', () => {
    const buf = encodeStakeDepositJunior(1_000_000n);
    expect(buf[0]).toBe(16);
    expect(buf.length).toBe(1 + 8);
    expect(readU64LE(buf, 1)).toBe(1_000_000n);
  });

  it('encodeStakeBindInsuranceAuthority — MOVED to tag 19 (0x13)', () => {
    const buf = encodeStakeBindInsuranceAuthority();
    expect(buf.length).toBe(1);
    expect(buf[0]).toBe(19);
    expect(buf[0]).toBe(0x13);
    expect(buf[0]).toBe(STAKE_IX.BindInsuranceAuthority);
  });

  it('encodeStakeRotateInsuranceAuthority — tag 20, no payload', () => {
    const buf = encodeStakeRotateInsuranceAuthority();
    expect(buf.length).toBe(1);
    expect(buf[0]).toBe(20);
  });

  it('encodeStakeBurnAssetAdmin — tag 21, no payload', () => {
    const buf = encodeStakeBurnAssetAdmin();
    expect(buf.length).toBe(1);
    expect(buf[0]).toBe(21);
  });

  it('encodeStakeRotateInsuranceOperator — tag 22, no payload', () => {
    const buf = encodeStakeRotateInsuranceOperator();
    expect(buf.length).toBe(1);
    expect(buf[0]).toBe(22);
  });

  it('encodeStakeRecoverFlushedInsurance — tag 23 + amount(u64)', () => {
    const buf = encodeStakeRecoverFlushedInsurance(555_000n);
    expect(buf[0]).toBe(23);
    expect(buf.length).toBe(1 + 8);
    expect(readU64LE(buf, 1)).toBe(555_000n);
  });

  it('encodeStakeDeposit accepts number', () => {
    const buf = encodeStakeDeposit(42);
    expect(readU64LE(buf, 1)).toBe(42n);
  });

  it('encodeStakeInitPool with max u64', () => {
    const max = BigInt('18446744073709551615');
    const buf = encodeStakeInitPool(max, max);
    expect(readU64LE(buf, 1)).toBe(max);
    expect(readU64LE(buf, 9)).toBe(max);
  });
});

describe('Account builders', () => {
  const admin = Keypair.generate().publicKey;
  const percolatorProgram = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');

  it('initPoolAccounts returns 11 accounts in correct order', () => {
    const [pool] = deriveStakePool(slab);
    const [vaultAuth] = deriveStakeVaultAuth(pool);
    const lpMint = Keypair.generate().publicKey;
    const vault = Keypair.generate().publicKey;
    const collateralMint = Keypair.generate().publicKey;

    const accounts = initPoolAccounts({
      admin, slab, pool, lpMint, vault, vaultAuth, collateralMint, percolatorProgram,
    });

    expect(accounts).toHaveLength(11);
    expect(accounts[0].pubkey.equals(admin)).toBe(true);
    expect(accounts[0].isSigner).toBe(true);
    expect(accounts[0].isWritable).toBe(true);
    expect(accounts[1].pubkey.equals(slab)).toBe(true);
    expect(accounts[2].pubkey.equals(pool)).toBe(true);
    expect(accounts[2].isWritable).toBe(true);
  });

  it('depositAccounts returns 11 accounts', () => {
    const [pool] = deriveStakePool(slab);
    const [vaultAuth] = deriveStakeVaultAuth(pool);
    const [depositPda] = deriveDepositPda(pool, user);

    const accounts = depositAccounts({
      user,
      pool,
      userCollateralAta: Keypair.generate().publicKey,
      vault: Keypair.generate().publicKey,
      lpMint: Keypair.generate().publicKey,
      userLpAta: Keypair.generate().publicKey,
      vaultAuth,
      depositPda,
    });

    expect(accounts).toHaveLength(11);
    expect(accounts[0].pubkey.equals(user)).toBe(true);
    expect(accounts[0].isSigner).toBe(true);
  });

  it('withdrawAccounts returns 10 accounts', () => {
    const [pool] = deriveStakePool(slab);
    const [vaultAuth] = deriveStakeVaultAuth(pool);
    const [depositPda] = deriveDepositPda(pool, user);

    const accounts = withdrawAccounts({
      user,
      pool,
      userLpAta: Keypair.generate().publicKey,
      lpMint: Keypair.generate().publicKey,
      vault: Keypair.generate().publicKey,
      userCollateralAta: Keypair.generate().publicKey,
      vaultAuth,
      depositPda,
    });

    expect(accounts).toHaveLength(10);
    expect(accounts[0].isSigner).toBe(true);
  });

  it('flushToInsuranceAccounts returns 8 accounts', () => {
    const [pool] = deriveStakePool(slab);
    const [vaultAuth] = deriveStakeVaultAuth(pool);

    const accounts = flushToInsuranceAccounts({
      caller: admin,
      pool,
      vault: Keypair.generate().publicKey,
      vaultAuth,
      slab,
      wrapperVault: Keypair.generate().publicKey,
      percolatorProgram,
    });

    expect(accounts).toHaveLength(8);
    expect(accounts[4].pubkey.equals(slab)).toBe(true);
    expect(accounts[4].isWritable).toBe(true);
  });

  it('bindInsuranceAuthorityAccounts (tag 19) returns 5 accounts in correct order', () => {
    const [pool] = deriveStakePool(slab);
    const [vaultAuth] = deriveStakeVaultAuth(pool);

    const accounts = bindInsuranceAuthorityAccounts({
      admin, poolPda: pool, vaultAuth, slab, percolatorProgram,
    });

    expect(accounts).toHaveLength(5);
    expect(accounts[0].pubkey.equals(admin)).toBe(true);
    expect(accounts[0].isSigner).toBe(true);
    expect(accounts[0].isWritable).toBe(false);
    expect(accounts[1].pubkey.equals(pool)).toBe(true);
    expect(accounts[1].isWritable).toBe(true);
    expect(accounts[3].pubkey.equals(slab)).toBe(true);
    expect(accounts[3].isWritable).toBe(true);
  });

  it('rotateInsuranceAccounts (tags 20/22) returns 6 accounts with newTarget as a signer', () => {
    const [pool] = deriveStakePool(slab);
    const [vaultAuth] = deriveStakeVaultAuth(pool);
    const newTarget = Keypair.generate().publicKey;

    const accounts = rotateInsuranceAccounts({
      admin, poolPda: pool, vaultAuth, newTarget, slab, percolatorProgram,
    });

    expect(accounts).toHaveLength(6);
    expect(accounts[0].pubkey.equals(admin)).toBe(true);
    expect(accounts[0].isSigner).toBe(true);
    expect(accounts[1].isWritable).toBe(false); // poolPda NOT writable for rotate
    expect(accounts[3].pubkey.equals(newTarget)).toBe(true);
    expect(accounts[3].isSigner).toBe(true);
    expect(accounts[4].pubkey.equals(slab)).toBe(true);
    expect(accounts[4].isWritable).toBe(true);
  });

  it('burnAssetAdminAccounts (tag 21) returns 5 accounts with admin AND poolPda writable', () => {
    const [pool] = deriveStakePool(slab);
    const [vaultAuth] = deriveStakeVaultAuth(pool);

    const accounts = burnAssetAdminAccounts({
      admin, poolPda: pool, vaultAuth, slab, percolatorProgram,
    });

    expect(accounts).toHaveLength(5);
    expect(accounts[0].pubkey.equals(admin)).toBe(true);
    expect(accounts[0].isSigner).toBe(true);
    expect(accounts[0].isWritable).toBe(true); // BurnAssetAdmin: admin IS writable (unlike bind/rotate)
    expect(accounts[1].isWritable).toBe(true); // poolPda writable — records the burn
  });

  it('recoverFlushedInsuranceAccounts (tag 23) returns 9 accounts, caller not a signer', () => {
    const [pool] = deriveStakePool(slab);
    const [vaultAuth] = deriveStakeVaultAuth(pool);
    const caller = Keypair.generate().publicKey;

    const accounts = recoverFlushedInsuranceAccounts({
      caller,
      poolPda: pool,
      poolVault: Keypair.generate().publicKey,
      vaultAuth,
      wrapperMarket: slab,
      wrapperVault: Keypair.generate().publicKey,
      wrapperVaultAuth: Keypair.generate().publicKey,
      tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      percolatorProgram,
    });

    expect(accounts).toHaveLength(9);
    expect(accounts[0].pubkey.equals(caller)).toBe(true);
    expect(accounts[0].isSigner).toBe(false); // permissionless — no signer check
    expect(accounts[1].isWritable).toBe(true); // poolPda
    expect(accounts[2].isWritable).toBe(true); // poolVault (destination)
    expect(accounts[4].pubkey.equals(slab)).toBe(true);
    expect(accounts[4].isWritable).toBe(true); // wrapperMarket
    expect(accounts[5].isWritable).toBe(true); // wrapperVault (source)
  });
});

describe('STAKE_ERRORS hint table', () => {
  it('has an entry for error 28 DepositBelowMinimumLiquidity (N7)', () => {
    expect(STAKE_ERRORS[28]).toBeDefined();
    expect(STAKE_ERRORS[28]).toMatch(/minimum liquidity/i);
  });

  it('has entries for the #242 timelock errors 25-27', () => {
    expect(STAKE_ERRORS[25]).toMatch(/timelock/i);
    expect(STAKE_ERRORS[26]).toMatch(/timelock/i);
    expect(STAKE_ERRORS[27]).toMatch(/pending cooldown/i);
  });

  it('covers every StakeError ordinal 0-28 with no gaps', () => {
    for (let code = 0; code <= 28; code++) {
      expect(STAKE_ERRORS[code], `missing hint for error code ${code}`).toBeDefined();
    }
  });
});

describe('negative value guards', () => {
  it('encodeStakeDeposit rejects negative amounts', () => {
    expect(() => encodeStakeDeposit(-1n)).toThrow('non-negative');
    expect(() => encodeStakeDeposit(-100n)).toThrow('non-negative');
  });

  it('encodeStakeWithdraw rejects negative amounts', () => {
    expect(() => encodeStakeWithdraw(-1n)).toThrow('non-negative');
  });

  it('encodeStakeAdminSetRiskThreshold rejects negative values', () => {
    expect(() => encodeStakeAdminSetRiskThreshold(-1n)).toThrow(/tag 7/i);
  });

  it('encodeStakeAdminSetMaintenanceFee rejects negative values', () => {
    expect(() => encodeStakeAdminSetMaintenanceFee(-1n)).toThrow(/tag 8/i);
  });

  it('encodeStakeInitPool rejects negative cooldownSlots', () => {
    expect(() => encodeStakeInitPool(-1n, 100n)).toThrow('non-negative');
  });

  it('encodeStakeAdminSetHwmConfig rejects out-of-range bps', () => {
    expect(() => encodeStakeAdminSetHwmConfig(true, 70000)).toThrow('u16 range');
    expect(() => encodeStakeAdminSetHwmConfig(true, -1)).toThrow('u16 range');
  });

  it('encodeStakeDeposit accepts valid amounts', () => {
    expect(() => encodeStakeDeposit(0n)).not.toThrow();
    expect(() => encodeStakeDeposit(1_000_000n)).not.toThrow();
  });
});
