/**
 * E2E CPI Integration Tests — percolator-stake SDK
 *
 * Verifies the full stake lifecycle at the instruction-building level:
 * InitPool → Deposit → Withdraw → FlushToInsurance → Admin CPI forwarding
 *
 * These tests validate that:
 * 1. Instructions are built with correct account ordering, signer/writable flags
 * 2. The CPI flow from stake → percolator produces correct account specs
 * 3. PDA seeds chain correctly across the full lifecycle
 * 4. Encoded instruction data matches expected byte layouts
 *
 * NOTE: This runs in a mocked environment (no real Solana validator).
 * For on-chain devnet tests, see tests/t*-stake*.ts.
 */

import { describe, it, expect } from 'vitest';
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

import {
  STAKE_PROGRAM_ID,
  STAKE_IX,
  deriveStakePool,
  deriveStakeVaultAuth,
  deriveDepositPda,
  encodeStakeInitPool,
  encodeStakeDeposit,
  STAKE_PROGRAM_IDS,
  encodeStakeAdminUpdateFeeSplit,
  encodeStakeAdminUpdateMaintenanceFeePerSlot,
  encodeStakeAdminUpdateBackingFeePolicy,
  encodeStakeAdminUpdateTradeFeePolicy,
  stakeGroupAProxyAccounts,
  stakeGroupBProxyAccounts,
  adminUpdateFeeSplitAccounts,
  adminUpdateMaintenanceFeePerSlotAccounts,
  adminUpdateBackingFeePolicyAccounts,
  adminUpdateTradeFeePolicyAccounts,
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
  encodeStakeAccrueFees,
  encodeStakeInitTradingPool,
  encodeStakeAdminSetHwmConfig,
  encodeStakeAdminSetTrancheConfig,
  encodeStakeDepositJunior,
  encodeStakeSetMarketResolved,
  encodeStakeBindInsuranceAuthority,
  encodeStakeRotateInsuranceAuthority,
  encodeStakeBurnAssetAdmin,
  encodeStakeRotateInsuranceOperator,
  encodeStakeRecoverFlushedInsurance,
  encodeStakeAdminResolveMarketCpi,
  initPoolAccounts,
  depositAccounts,
  withdrawAccounts,
  flushToInsuranceAccounts,
  adminResolveMarketCpiAccounts,
} from '../stake.js';
import {
  encodeUpdateFeeSplit,
  encodeUpdateMaintenanceFeePerSlot,
  encodeUpdateTradeFeePolicy,
} from '../../abi/instructions.js';

// ── Uint8Array read helpers (replaces Buffer.readBigUInt64LE / readUInt16LE) ─
function readU64LE(buf: Uint8Array, offset: number): bigint {
  const dv = new DataView(buf.buffer, buf.byteOffset + offset, 8);
  return dv.getBigUint64(0, /* littleEndian= */ true);
}
function readU16LE(buf: Uint8Array, offset: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset + offset, 2);
  return dv.getUint16(0, /* littleEndian= */ true);
}


// ═══════════════════════════════════════════════════════════════
// Test fixtures — simulate a realistic deployment scenario
// ═══════════════════════════════════════════════════════════════

const PERCOLATOR_PROGRAM = new PublicKey('EXsr2Tfz8ntWYP3vgCStdknFBoafvJQugJKAh4nFdo8f');
const admin = Keypair.generate();
const user = Keypair.generate();
const slab = Keypair.generate();
const collateralMint = Keypair.generate().publicKey;
const wrapperVault = Keypair.generate().publicKey;

// Derive all PDAs for the lifecycle
const [pool, poolBump] = deriveStakePool(slab.publicKey);
const [vaultAuth, vaultAuthBump] = deriveStakeVaultAuth(pool);
const [depositPda, depositPdaBump] = deriveDepositPda(pool, user.publicKey);

// Simulated token accounts
const userCollateralAta = Keypair.generate().publicKey;
const userLpAta = Keypair.generate().publicKey;
const lpMint = Keypair.generate().publicKey;
const vault = Keypair.generate().publicKey;

// ═══════════════════════════════════════════════════════════════
// E2E CPI Lifecycle Tests
// ═══════════════════════════════════════════════════════════════

describe('Stake CPI Integration — Full Lifecycle', () => {
  describe('Phase 1: Pool Initialization', () => {
    it('initPool instruction has correct account count and order', () => {
      const keys = initPoolAccounts({
        admin: admin.publicKey,
        slab: slab.publicKey,
        pool,
        lpMint,
        vault,
        vaultAuth,
        collateralMint,
        percolatorProgram: PERCOLATOR_PROGRAM,
      });

      // 11 accounts: admin, slab, pool, lpMint, vault, vaultAuth, collateralMint,
      //              percolatorProgram, tokenProgram, systemProgram, rent
      expect(keys).toHaveLength(11);

      // Account 0: admin — must be signer + writable (pays rent)
      expect(keys[0].pubkey.equals(admin.publicKey)).toBe(true);
      expect(keys[0].isSigner).toBe(true);
      expect(keys[0].isWritable).toBe(true);

      // Account 1: slab — writable (InitPool CPIs UpdateAuthority which writes the slab)
      expect(keys[1].pubkey.equals(slab.publicKey)).toBe(true);
      expect(keys[1].isSigner).toBe(false);
      expect(keys[1].isWritable).toBe(true);

      // Account 2: pool PDA — writable (created in this ix)
      expect(keys[2].pubkey.equals(pool)).toBe(true);
      expect(keys[2].isWritable).toBe(true);

      // Account 3: LP mint — writable (created)
      expect(keys[3].isWritable).toBe(true);

      // Account 4: vault — writable (created)
      expect(keys[4].isWritable).toBe(true);

      // Account 5: vault authority — read-only PDA
      expect(keys[5].pubkey.equals(vaultAuth)).toBe(true);
      expect(keys[5].isWritable).toBe(false);

      // Account 6: collateral mint — read-only
      expect(keys[6].isWritable).toBe(false);

      // Accounts 7-10: programs and sysvars — all read-only
      expect(keys[7].pubkey.equals(PERCOLATOR_PROGRAM)).toBe(true);
      expect(keys[8].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
      expect(keys[9].pubkey.equals(SystemProgram.programId)).toBe(true);
      expect(keys[10].pubkey.equals(SYSVAR_RENT_PUBKEY)).toBe(true);
    });

    it('initPool data encodes tag 0 + cooldown + cap', () => {
      const data = encodeStakeInitPool(300n, 10_000_000n);
      expect(data[0]).toBe(STAKE_IX.InitPool);
      expect(readU64LE(data, 1)).toBe(300n);
      expect(readU64LE(data, 9)).toBe(10_000_000n);
      expect(data.length).toBe(17); // 1 tag + 8 cooldown + 8 cap
    });
  });

  describe('Phase 2: User Deposit', () => {
    it('deposit instruction has correct account count and flags', () => {
      const keys = depositAccounts({
        user: user.publicKey,
        pool,
        userCollateralAta,
        vault,
        lpMint,
        userLpAta,
        vaultAuth,
        depositPda,
      });

      // 11 accounts
      expect(keys).toHaveLength(11);

      // Account 0: user — signer (signs the transfer)
      expect(keys[0].pubkey.equals(user.publicKey)).toBe(true);
      expect(keys[0].isSigner).toBe(true);
      expect(keys[0].isWritable).toBe(false);

      // Account 1: pool — writable (updates total_deposited)
      expect(keys[1].pubkey.equals(pool)).toBe(true);
      expect(keys[1].isWritable).toBe(true);

      // Accounts 2-5: token accounts — all writable
      expect(keys[2].isWritable).toBe(true); // userCollateralAta
      expect(keys[3].isWritable).toBe(true); // vault
      expect(keys[4].isWritable).toBe(true); // lpMint (mints LP tokens)
      expect(keys[5].isWritable).toBe(true); // userLpAta

      // Account 6: vault authority — read-only (signer via PDA)
      expect(keys[6].pubkey.equals(vaultAuth)).toBe(true);
      expect(keys[6].isWritable).toBe(false);

      // Account 7: deposit PDA — writable (created/updated)
      expect(keys[7].pubkey.equals(depositPda)).toBe(true);
      expect(keys[7].isWritable).toBe(true);

      // Account 8-10: programs
      expect(keys[8].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
      expect(keys[9].pubkey.equals(SYSVAR_CLOCK_PUBKEY)).toBe(true);
      expect(keys[10].pubkey.equals(SystemProgram.programId)).toBe(true);
    });

    it('deposit data encodes tag 1 + u64 amount', () => {
      const amount = 5_000_000n;
      const data = encodeStakeDeposit(amount);
      expect(data[0]).toBe(STAKE_IX.Deposit);
      expect(readU64LE(data, 1)).toBe(amount);
      expect(data.length).toBe(9); // 1 tag + 8 amount
    });
  });

  describe('Phase 3: User Withdraw', () => {
    it('withdraw instruction accounts in correct order', () => {
      const keys = withdrawAccounts({
        user: user.publicKey,
        pool,
        userLpAta,
        lpMint,
        vault,
        userCollateralAta,
        vaultAuth,
        depositPda,
      });

      // 10 accounts (no systemProgram needed — deposit PDA already exists)
      expect(keys).toHaveLength(10);

      // Account 0: user — signer
      expect(keys[0].pubkey.equals(user.publicKey)).toBe(true);
      expect(keys[0].isSigner).toBe(true);

      // Account 1: pool — writable (updates total_deposited)
      expect(keys[1].pubkey.equals(pool)).toBe(true);
      expect(keys[1].isWritable).toBe(true);

      // Accounts 2-5: token accounts — all writable
      expect(keys[2].isWritable).toBe(true); // userLpAta (burned from)
      expect(keys[3].isWritable).toBe(true); // lpMint (burn supply)
      expect(keys[4].isWritable).toBe(true); // vault (transfer out)
      expect(keys[5].isWritable).toBe(true); // userCollateralAta (transfer to)

      // Account 6: vault authority — read-only
      expect(keys[6].pubkey.equals(vaultAuth)).toBe(true);
      expect(keys[6].isWritable).toBe(false);

      // Account 7: deposit PDA — writable (updated for cooldown)
      expect(keys[7].pubkey.equals(depositPda)).toBe(true);
      expect(keys[7].isWritable).toBe(true);
    });

    it('withdraw data encodes tag 2 + u64 lpAmount', () => {
      const lpAmount = 2_500_000n;
      const data = encodeStakeWithdraw(lpAmount);
      expect(data[0]).toBe(STAKE_IX.Withdraw);
      expect(readU64LE(data, 1)).toBe(lpAmount);
      expect(data.length).toBe(9);
    });
  });

  describe('Phase 4: FlushToInsurance (CPI from stake → percolator)', () => {
    it('flushToInsurance accounts include CPI targets', () => {
      const keys = flushToInsuranceAccounts({
        caller: admin.publicKey,
        pool,
        vault,
        vaultAuth,
        slab: slab.publicKey,
        wrapperVault,
        percolatorProgram: PERCOLATOR_PROGRAM,
      });

      // 8 accounts
      expect(keys).toHaveLength(8);

      // Account 0: caller — signer (permissioned flush)
      expect(keys[0].pubkey.equals(admin.publicKey)).toBe(true);
      expect(keys[0].isSigner).toBe(true);

      // Account 1: pool — writable (update flush accounting)
      expect(keys[1].pubkey.equals(pool)).toBe(true);
      expect(keys[1].isWritable).toBe(true);

      // Account 2: vault — writable (source of CPI transfer)
      expect(keys[2].pubkey.equals(vault)).toBe(true);
      expect(keys[2].isWritable).toBe(true);

      // Account 3: vault authority — read-only (PDA signer for CPI)
      expect(keys[3].pubkey.equals(vaultAuth)).toBe(true);
      expect(keys[3].isWritable).toBe(false);

      // Account 4: slab — writable (CPI target: percolator slab account)
      expect(keys[4].pubkey.equals(slab.publicKey)).toBe(true);
      expect(keys[4].isWritable).toBe(true);

      // Account 5: wrapper vault — writable (CPI target: receives tokens)
      expect(keys[5].pubkey.equals(wrapperVault)).toBe(true);
      expect(keys[5].isWritable).toBe(true);

      // Account 6: percolator program — the CPI target program
      expect(keys[6].pubkey.equals(PERCOLATOR_PROGRAM)).toBe(true);
      expect(keys[6].isWritable).toBe(false);

      // Account 7: token program
      expect(keys[7].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    });

    it('flushToInsurance data encodes tag 3 + u64 amount', () => {
      const data = encodeStakeFlushToInsurance(1_000_000n);
      expect(data[0]).toBe(STAKE_IX.FlushToInsurance);
      expect(readU64LE(data, 1)).toBe(1_000_000n);
      expect(data.length).toBe(9);
    });

    it('vault authority PDA chains correctly for CPI signing', () => {
      // The vault authority is derived from pool, which is derived from slab.
      // This chain must be deterministic for the CPI to work on-chain.
      const [pool2] = deriveStakePool(slab.publicKey);
      const [vaultAuth2] = deriveStakeVaultAuth(pool2);

      // Same slab → same pool → same vault authority
      expect(pool2.equals(pool)).toBe(true);
      expect(vaultAuth2.equals(vaultAuth)).toBe(true);

      // Different slab → different chain
      const otherSlab = Keypair.generate();
      const [otherPool] = deriveStakePool(otherSlab.publicKey);
      const [otherVaultAuth] = deriveStakeVaultAuth(otherPool);
      expect(otherPool.equals(pool)).toBe(false);
      expect(otherVaultAuth.equals(vaultAuth)).toBe(false);
    });
  });

  describe('Phase 5: Admin CPI Forwarding', () => {
    it('AdminSetOracleAuthority rejects removed stake tag 6', () => {
      const newAuth = Keypair.generate().publicKey;
      expect(() => encodeStakeAdminSetOracleAuthority(newAuth)).toThrow(/tag 6/i);
    });

    it('AdminSetRiskThreshold rejects removed stake tag 7', () => {
      const bigThreshold = (1n << 96n) + 42n; // exercises high word
      expect(() => encodeStakeAdminSetRiskThreshold(bigThreshold)).toThrow(/tag 7/i);
    });

    it('AdminSetMaintenanceFee rejects removed stake tag 8', () => {
      expect(() => encodeStakeAdminSetMaintenanceFee(500n)).toThrow(/tag 8/i);
    });

    it('AdminResolveMarket rejects removed stake tag 9', () => {
      expect(() => encodeStakeAdminResolveMarket()).toThrow(/tag 9/i);
    });

    it('ReturnInsurance is the live tag 10 path', () => {
      const data = encodeStakeReturnInsurance(777_000n);
      expect(data[0]).toBe(STAKE_IX.ReturnInsurance);
      expect(readU64LE(data, 1)).toBe(777_000n);
      expect(data.length).toBe(9);
    });

    it('AdminWithdrawInsurance remains a deprecated alias for ReturnInsurance', () => {
      const data = encodeStakeAdminWithdrawInsurance(777_000n);
      expect(data[0]).toBe(STAKE_IX.AdminWithdrawInsurance);
      expect(readU64LE(data, 1)).toBe(777_000n);
      expect(data.length).toBe(9);
    });

    it('AdminSetInsurancePolicy rejects removed stake tag 11', () => {
      const authority = Keypair.generate().publicKey;
      expect(() => encodeStakeAdminSetInsurancePolicy(authority, 100_000n, 500, 100n)).toThrow(/tag 11/i);
    });

    it('TransferAdmin rejects removed stake tag 5', () => {
      expect(() => encodeStakeTransferAdmin()).toThrow(/tag 5/i);
    });

    it('UpdateConfig encodes optional fields correctly', () => {
      // Both set
      const both = encodeStakeUpdateConfig(300n, 10_000_000n);
      expect(both[0]).toBe(STAKE_IX.UpdateConfig);
      expect(both[1]).toBe(1); // has_cooldown
      expect(readU64LE(both, 2)).toBe(300n);
      expect(both[10]).toBe(1); // has_cap
      expect(readU64LE(both, 11)).toBe(10_000_000n);

      // Only cooldown
      const cooldownOnly = encodeStakeUpdateConfig(200n, undefined);
      expect(cooldownOnly[1]).toBe(1);
      expect(readU64LE(cooldownOnly, 2)).toBe(200n);
      expect(cooldownOnly[10]).toBe(0);
      expect(readU64LE(cooldownOnly, 11)).toBe(0n);

      // Only cap
      const capOnly = encodeStakeUpdateConfig(undefined, 500n);
      expect(capOnly[1]).toBe(0);
      expect(readU64LE(capOnly, 2)).toBe(0n);
      expect(capOnly[10]).toBe(1);
      expect(readU64LE(capOnly, 11)).toBe(500n);

      // Neither
      const neither = encodeStakeUpdateConfig(undefined, undefined);
      expect(neither[1]).toBe(0);
      expect(neither[10]).toBe(0);
    });

    it('SetMarketResolved — tag 18, live on the adopted percolator-stake lineage', () => {
      const data = encodeStakeSetMarketResolved();
      expect(data.length).toBe(1);
      expect(data[0]).toBe(18);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// PDA Chain Integrity Tests
// ═══════════════════════════════════════════════════════════════

describe('Stake PDA Chain — Multi-Market Isolation', () => {
  it('each slab produces an isolated PDA chain', () => {
    const slabs = Array.from({ length: 5 }, () => Keypair.generate().publicKey);
    const chains = slabs.map((s) => {
      const [p] = deriveStakePool(s);
      const [va] = deriveStakeVaultAuth(p);
      const [dp] = deriveDepositPda(p, user.publicKey);
      return { pool: p, vaultAuth: va, depositPda: dp };
    });

    // All pools are unique
    const poolSet = new Set(chains.map((c) => c.pool.toBase58()));
    expect(poolSet.size).toBe(5);

    // All vault authorities are unique
    const vaSet = new Set(chains.map((c) => c.vaultAuth.toBase58()));
    expect(vaSet.size).toBe(5);

    // All deposit PDAs are unique
    const dpSet = new Set(chains.map((c) => c.depositPda.toBase58()));
    expect(dpSet.size).toBe(5);
  });

  it('same slab + different users → unique deposit PDAs, same pool', () => {
    const [sharedPool] = deriveStakePool(slab.publicKey);
    const users = Array.from({ length: 10 }, () => Keypair.generate().publicKey);
    const depositPdas = users.map((u) => deriveDepositPda(sharedPool, u)[0].toBase58());

    const uniquePdas = new Set(depositPdas);
    expect(uniquePdas.size).toBe(10);
  });

  it('deposit PDA determinism — same inputs always produce same output', () => {
    for (let i = 0; i < 100; i++) {
      const [dp] = deriveDepositPda(pool, user.publicKey);
      expect(dp.equals(depositPda)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Instruction Tag Consistency
// ═══════════════════════════════════════════════════════════════

describe('Stake Instruction Tags — No Gaps or Conflicts (ADOPTED percolator-stake lineage)', () => {
  it('tags match the adopted lineage mapping, including tombstones and aliases', () => {
    const tags = Object.values(STAKE_IX);
    // BindInsuranceAuthority MOVED to 19 (no longer collides with AdminSetTrancheConfig
    // at 15). ReturnInsurance and AdminWithdrawInsurance both map to 10 (alias).
    // TransferAdmin/AdminSetOracleAuthority/AdminSetRiskThreshold/AdminSetMaintenanceFee/
    // AdminResolveMarket are deprecated aliases for the REPURPOSED tags 5-9
    // (ProposeAdmin/AcceptAdmin/ProposeCooldownIncrease/CommitCooldownIncrease/
    // CancelCooldownIncrease) — still in STAKE_IX for reference, so tags 5-9 each
    // appear twice (the live name + the deprecated alias).
    expect(tags).toContain(0);
    expect(tags).toContain(1);
    expect(tags).toContain(15); // AdminSetTrancheConfig
    expect(tags).toContain(19); // BindInsuranceAuthority (moved from 15)
    expect(tags.filter(t => t === 15).length).toBe(1); // AdminSetTrancheConfig only — no longer aliased
    expect(tags.filter(t => t === 19).length).toBe(1); // BindInsuranceAuthority only
    expect(tags.filter(t => t === 10).length).toBe(2); // ReturnInsurance + AdminWithdrawInsurance alias
    expect(tags.filter(t => t === 5).length).toBe(2);  // ProposeAdmin + TransferAdmin alias
    expect(tags.filter(t => t === 6).length).toBe(2);  // AcceptAdmin + AdminSetOracleAuthority alias
    expect(tags.filter(t => t === 7).length).toBe(2);  // ProposeCooldownIncrease + AdminSetRiskThreshold alias
    expect(tags.filter(t => t === 8).length).toBe(2);  // CommitCooldownIncrease + AdminSetMaintenanceFee alias
    expect(tags.filter(t => t === 9).length).toBe(2);  // CancelCooldownIncrease + AdminResolveMarket alias
    expect(tags).toContain(12); // AccrueFees
    expect(tags).toContain(13); // InitTradingPool
    expect(tags).toContain(14); // AdminSetHwmConfig
    expect(tags).toContain(16); // DepositJunior
    expect(tags).toContain(18); // SetMarketResolved
    expect(tags).toContain(20); // RotateInsuranceAuthority
    expect(tags).toContain(21); // BurnAssetAdmin
    expect(tags).toContain(22); // RotateInsuranceOperator
    expect(tags).toContain(23); // RecoverFlushedInsurance
    expect(tags).toContain(24); // AdminResolveMarketCpi
    expect(tags.filter(t => t === 24).length).toBe(1); // AdminResolveMarketCpi only — does not collide with the tag-9 AdminResolveMarket alias
  });

  it('live encoders produce the correct tag byte and deprecated (repurposed-tag) encoders throw', () => {
    // These encoders are live on the adopted percolator-stake lineage
    const liveTagMap: [number, Uint8Array][] = [
      [STAKE_IX.InitPool, encodeStakeInitPool(0n, 0n)],
      [STAKE_IX.Deposit, encodeStakeDeposit(0n)],
      [STAKE_IX.Withdraw, encodeStakeWithdraw(0n)],
      [STAKE_IX.FlushToInsurance, encodeStakeFlushToInsurance(0n)],
      [STAKE_IX.UpdateConfig, encodeStakeUpdateConfig()],
      [STAKE_IX.ReturnInsurance, encodeStakeReturnInsurance(0n)],
      [STAKE_IX.AdminWithdrawInsurance, encodeStakeAdminWithdrawInsurance(0n)],
      [STAKE_IX.AccrueFees, encodeStakeAccrueFees()],
      [STAKE_IX.InitTradingPool, encodeStakeInitTradingPool(0n, 0n)],
      [STAKE_IX.AdminSetHwmConfig, encodeStakeAdminSetHwmConfig(false, 0)],
      [STAKE_IX.AdminSetTrancheConfig, encodeStakeAdminSetTrancheConfig(0)],
      [STAKE_IX.DepositJunior, encodeStakeDepositJunior(0n)],
      [STAKE_IX.SetMarketResolved, encodeStakeSetMarketResolved()],
      [STAKE_IX.BindInsuranceAuthority, encodeStakeBindInsuranceAuthority()],
      [STAKE_IX.RotateInsuranceAuthority, encodeStakeRotateInsuranceAuthority()],
      [STAKE_IX.BurnAssetAdmin, encodeStakeBurnAssetAdmin()],
      [STAKE_IX.RotateInsuranceOperator, encodeStakeRotateInsuranceOperator()],
      [STAKE_IX.RecoverFlushedInsurance, encodeStakeRecoverFlushedInsurance(0n)],
      [STAKE_IX.AdminResolveMarketCpi, encodeStakeAdminResolveMarketCpi()],
    ];

    for (const [expectedTag, data] of liveTagMap) {
      expect(data[0]).toBe(expectedTag);
    }

    // BindInsuranceAuthority is now at tag 19, distinct from AdminSetTrancheConfig (15)
    expect(STAKE_IX.BindInsuranceAuthority).toBe(19);
    expect(STAKE_IX.AdminSetTrancheConfig).toBe(15);

    // Repurposed-tag encoders (old percolator-vault semantics) must throw
    expect(() => encodeStakeTransferAdmin()).toThrow(/tag 5/i);
    expect(() => encodeStakeAdminSetOracleAuthority(PublicKey.default)).toThrow(/tag 6/i);
    expect(() => encodeStakeAdminSetRiskThreshold(0n)).toThrow(/tag 7/i);
    expect(() => encodeStakeAdminSetMaintenanceFee(0n)).toThrow(/tag 8/i);
    expect(() => encodeStakeAdminResolveMarket()).toThrow(/tag 9/i);
    expect(() => encodeStakeAdminSetInsurancePolicy(PublicKey.default, 0n, 0, 0n)).toThrow(/tag 11/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// v17 fee-collection-split CPI proxies (stake tags 25-28)
// percolator-stake feat/adopt-stake-lineage-plus-n7@474079f
//
// Byte layouts verified against src/instruction.rs's `unpack` arms, which
// length-check `rest` exactly (6 / 16 / 6 / 8) and reject anything else.
// ═══════════════════════════════════════════════════════════════

describe('fee-split CPI proxies (stake tags 25-28)', () => {
  const slab = Keypair.generate().publicKey;
  const admin = Keypair.generate().publicKey;
  const percolatorProgram = Keypair.generate().publicKey;
  const [poolPda] = deriveStakePool(slab, STAKE_PROGRAM_ID);
  const [vaultAuth] = deriveStakeVaultAuth(poolPda, STAKE_PROGRAM_ID);

  it('tag numbers match the stake program dispatch table', () => {
    expect(STAKE_IX.AdminUpdateFeeSplit).toBe(25);
    expect(STAKE_IX.AdminUpdateMaintenanceFeePerSlot).toBe(26);
    expect(STAKE_IX.AdminUpdateBackingFeePolicy).toBe(27);
    expect(STAKE_IX.AdminUpdateTradeFeePolicy).toBe(28);
  });

  // tag 25 -> wrapper 86. Wire: tag(1) + u16 x3 = 7 bytes (rest.len() == 6).
  it('encodeStakeAdminUpdateFeeSplit is 7 bytes, u16 x3 LE in creator/lp/insurance order', () => {
    const data = encodeStakeAdminUpdateFeeSplit(1600, 4800, 1600);
    expect(data.length).toBe(7);
    expect(data[0]).toBe(STAKE_IX.AdminUpdateFeeSplit);
    expect(data[0]).toBe(25);
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(dv.getUint16(1, true)).toBe(1600); // creator_share_bps
    expect(dv.getUint16(3, true)).toBe(4800); // lp_share_bps
    expect(dv.getUint16(5, true)).toBe(1600); // insurance_share_bps
  });

  it('encodeStakeAdminUpdateFeeSplit preserves field order with distinct values', () => {
    const data = encodeStakeAdminUpdateFeeSplit(0x1111, 0x2222, 0x3333);
    expect(Array.from(data.subarray(1, 7))).toEqual([0x11, 0x11, 0x22, 0x22, 0x33, 0x33]);
  });

  // The stake payload must be byte-identical to the wrapper payload it proxies,
  // because cpi.rs forwards the decoded args straight into wrapper tag 86.
  it('stake tag 25 payload is byte-identical to wrapper tag 86 payload', () => {
    const stakeData = encodeStakeAdminUpdateFeeSplit(1600, 4800, 1600);
    const wrapperData = encodeUpdateFeeSplit({
      creatorShareBps: 1600,
      lpShareBps: 4800,
      insuranceShareBps: 1600,
    });
    expect(Array.from(stakeData.subarray(1))).toEqual(Array.from(wrapperData.subarray(1)));
  });

  // tag 26 -> wrapper 88. Wire: tag(1) + u128 = 17 bytes (rest.len() == 16).
  // ⚠ u128 NOT u64 — instruction.rs rejects rest.len() != 16 outright.
  it('encodeStakeAdminUpdateMaintenanceFeePerSlot is 17 bytes (u128, NOT u64)', () => {
    const data = encodeStakeAdminUpdateMaintenanceFeePerSlot(1_000_000n);
    expect(data.length).toBe(17);
    expect(data[0]).toBe(STAKE_IX.AdminUpdateMaintenanceFeePerSlot);
    expect(data[0]).toBe(26);
    expect(Array.from(data.subarray(1, 17))).toEqual([64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('encodeStakeAdminUpdateMaintenanceFeePerSlot carries values above u64::MAX', () => {
    const big = (1n << 100n) + 5n;
    const data = encodeStakeAdminUpdateMaintenanceFeePerSlot(big);
    expect(data.length).toBe(17);
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(dv.getBigUint64(1, true)).toBe(5n);
    expect(dv.getBigUint64(9, true)).toBe(1n << 36n);
  });

  it('stake tag 26 payload is byte-identical to wrapper tag 88 payload', () => {
    const stakeData = encodeStakeAdminUpdateMaintenanceFeePerSlot(1_000_000n);
    const wrapperData = encodeUpdateMaintenanceFeePerSlot({ maintenanceFeePerSlot: 1_000_000n });
    expect(Array.from(stakeData.subarray(1))).toEqual(Array.from(wrapperData.subarray(1)));
  });

  // tag 27 -> wrapper 51. Wire: tag(1) + u16 x3 = 7 bytes (rest.len() == 6).
  it('encodeStakeAdminUpdateBackingFeePolicy is 7 bytes, domain/fee/insurance order', () => {
    const data = encodeStakeAdminUpdateBackingFeePolicy(1, 30, 5000);
    expect(data.length).toBe(7);
    expect(data[0]).toBe(STAKE_IX.AdminUpdateBackingFeePolicy);
    expect(data[0]).toBe(27);
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(dv.getUint16(1, true)).toBe(1);    // domain
    expect(dv.getUint16(3, true)).toBe(30);   // fee_bps
    expect(dv.getUint16(5, true)).toBe(5000); // insurance_share_bps
  });

  // tag 28 -> wrapper 55. Wire: tag(1) + u64 = 9 bytes (rest.len() == 8).
  // ⚠ Type asymmetry with tag 26: wrapper 55 decodes read_u64, wrapper 88 read_u128.
  it('encodeStakeAdminUpdateTradeFeePolicy is 9 bytes (u64, NOT u128)', () => {
    const data = encodeStakeAdminUpdateTradeFeePolicy(30n);
    expect(data.length).toBe(9);
    expect(data[0]).toBe(STAKE_IX.AdminUpdateTradeFeePolicy);
    expect(data[0]).toBe(28);
    expect(Array.from(data.subarray(1, 9))).toEqual([30, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('stake tag 28 payload is byte-identical to wrapper tag 55 payload', () => {
    const stakeData = encodeStakeAdminUpdateTradeFeePolicy(30n);
    const wrapperData = encodeUpdateTradeFeePolicy({ tradeFeeBaseBps: 30n });
    expect(Array.from(stakeData.subarray(1))).toEqual(Array.from(wrapperData.subarray(1)));
  });

  // GROUP A (25, 26): pool PDA is the marketauth and SIGNS via invoke_signed.
  it('GROUP A accounts: [admin(signer), poolPda, slab(writable), percolatorProgram]', () => {
    const keys = stakeGroupAProxyAccounts({ admin, poolPda, slab, percolatorProgram });
    expect(keys.length).toBe(4);
    expect(keys[0]).toEqual({ pubkey: admin, isSigner: true, isWritable: false });
    expect(keys[1]).toEqual({ pubkey: poolPda, isSigner: false, isWritable: false });
    expect(keys[2]).toEqual({ pubkey: slab, isSigner: false, isWritable: true });
    expect(keys[3]).toEqual({ pubkey: percolatorProgram, isSigner: false, isWritable: false });
  });

  it('GROUP A layout is identical to AdminResolveMarketCpi (tag 24)', () => {
    const groupA = stakeGroupAProxyAccounts({ admin, poolPda, slab, percolatorProgram });
    const tag24 = adminResolveMarketCpiAccounts({ admin, poolPda, slab, percolatorProgram });
    expect(groupA).toEqual(tag24);
  });

  // GROUP B (27, 28): vault_auth is the insurance_authority and signs; the pool
  // PDA sits at index 1 purely to derive/verify it, and does NOT sign.
  it('GROUP B accounts: [admin(signer), poolPda, vaultAuth, slab(writable), percolatorProgram]', () => {
    const keys = stakeGroupBProxyAccounts({ admin, poolPda, vaultAuth, slab, percolatorProgram });
    expect(keys.length).toBe(5);
    expect(keys[0]).toEqual({ pubkey: admin, isSigner: true, isWritable: false });
    expect(keys[1]).toEqual({ pubkey: poolPda, isSigner: false, isWritable: false });
    expect(keys[2]).toEqual({ pubkey: vaultAuth, isSigner: false, isWritable: false });
    expect(keys[3]).toEqual({ pubkey: slab, isSigner: false, isWritable: true });
    expect(keys[4]).toEqual({ pubkey: percolatorProgram, isSigner: false, isWritable: false });
  });

  it('GROUP B has exactly one signer (admin); the PDAs sign via invoke_signed, not as tx keys', () => {
    const keys = stakeGroupBProxyAccounts({ admin, poolPda, vaultAuth, slab, percolatorProgram });
    expect(keys.filter((k) => k.isSigner).length).toBe(1);
    expect(keys.filter((k) => k.isSigner)[0].pubkey).toEqual(admin);
  });

  // The aliases must not drift from the shared builders they point at.
  it('per-tag account aliases resolve to the right group builder', () => {
    expect(adminUpdateFeeSplitAccounts).toBe(stakeGroupAProxyAccounts);
    expect(adminUpdateMaintenanceFeePerSlotAccounts).toBe(stakeGroupAProxyAccounts);
    expect(adminUpdateBackingFeePolicyAccounts).toBe(stakeGroupBProxyAccounts);
    expect(adminUpdateTradeFeePolicyAccounts).toBe(stakeGroupBProxyAccounts);
  });

  // The canonical devnet stake program id is the wrapper's pin for tag 87.
  // A mismatch here is exactly what wrapper Custom(55) StakePoolOwnerMismatch
  // reports, so the SDK constant must match the pinned value.
  it('devnet stake program id matches the wrapper pin used by tag 87', () => {
    expect(STAKE_PROGRAM_IDS.devnet).toBe('GCHhcgwPyrai8SWHEVWw3odedguFXEtJobNnWSfWBCU3');
  });
});
