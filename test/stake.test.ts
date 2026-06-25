import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  STAKE_IX,
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
  encodeStakeAccrueFees,
  encodeStakeInitTradingPool,
  encodeStakeAdminSetHwmConfig,
  encodeStakeAdminSetTrancheConfig,
  encodeStakeDepositJunior,
  encodeStakeAdminSetInsurancePolicy,
  encodeStakeSetMarketResolved,
  decodeStakePool,
  decodeDepositPda,
  deriveStakePool,
  deriveStakeVaultAuth,
  deriveDepositPda,
  STAKE_PROGRAM_ID,
  STAKE_POOL_DISCRIMINATOR,
  STAKE_POOL_CURRENT_VERSION,
  STAKE_DEPOSIT_DISCRIMINATOR,
  STAKE_POOL_SIZE_V1,
  STAKE_POOL_SIZE_V2,
} from "../src/solana/stake.js";

// v2 _reserved starts at offset 320 (after pending_admin [u8;32] at 288..320)
const STAKE_POOL_RESERVED_OFFSET = 320;
// v1 _reserved starts at offset 288 (no pending_admin; deployed binary layout)
const STAKE_POOL_RESERVED_OFFSET_V1 = 288;
const STAKE_DEPOSIT_RESERVED_OFFSET = 88;
const TEST_POOL = new PublicKey("FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD");
const TEST_USER = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");

function stampStakePoolIdentity(buf: Uint8Array): void {
  buf.set(STAKE_POOL_DISCRIMINATOR, STAKE_POOL_RESERVED_OFFSET);
  buf[STAKE_POOL_RESERVED_OFFSET + 8] = STAKE_POOL_CURRENT_VERSION;
}

function stampStakeDepositIdentity(buf: Uint8Array): void {
  buf.set(STAKE_DEPOSIT_DISCRIMINATOR, STAKE_DEPOSIT_RESERVED_OFFSET);
}

describe("stake encoders return Uint8Array (not Buffer)", () => {
  it("encodeStakeInitPool", () => {
    const data = encodeStakeInitPool(100n, 1_000_000n);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.InitPool);
    expect(data.length).toBe(1 + 8 + 8);
  });

  it("encodeStakeDeposit", () => {
    const data = encodeStakeDeposit(500_000n);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.Deposit);
    expect(data.length).toBe(1 + 8);
  });

  it("encodeStakeWithdraw", () => {
    const data = encodeStakeWithdraw(250_000n);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.Withdraw);
    expect(data.length).toBe(1 + 8);
  });

  it("encodeStakeFlushToInsurance", () => {
    const data = encodeStakeFlushToInsurance(100_000n);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.FlushToInsurance);
    expect(data.length).toBe(1 + 8);
  });

  it("encodeStakeUpdateConfig (both set)", () => {
    const data = encodeStakeUpdateConfig(200n, 2_000_000n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.UpdateConfig);
    expect(data[1]).toBe(1); // cooldown present
    expect(data[10]).toBe(1); // cap present
    expect(data.length).toBe(1 + 1 + 8 + 1 + 8);
  });

  it("encodeStakeUpdateConfig (neither set)", () => {
    const data = encodeStakeUpdateConfig();
    expect(data).toBeInstanceOf(Uint8Array);    expect(data[1]).toBe(0);
    expect(data[10]).toBe(0);
  });

  it("rejects unsafe JavaScript number inputs in stake amount encoders", () => {
    const unsafe = Number.MAX_SAFE_INTEGER + 1;

    expect(() => encodeStakeInitPool(unsafe, 1n)).toThrow(
      /Number\.MAX_SAFE_INTEGER|safe/i,
    );
    expect(() => encodeStakeInitPool(1n, unsafe)).toThrow(
      /Number\.MAX_SAFE_INTEGER|safe/i,
    );

    expect(() => encodeStakeDeposit(unsafe)).toThrow(
      /Number\.MAX_SAFE_INTEGER|safe/i,
    );

    expect(() => encodeStakeWithdraw(unsafe)).toThrow(
      /Number\.MAX_SAFE_INTEGER|safe/i,
    );

    expect(() => encodeStakeFlushToInsurance(unsafe)).toThrow(
      /Number\.MAX_SAFE_INTEGER|safe/i,
    );

    expect(() => encodeStakeUpdateConfig(unsafe, undefined)).toThrow(
      /Number\.MAX_SAFE_INTEGER|safe/i,
    );
    expect(() => encodeStakeUpdateConfig(undefined, unsafe)).toThrow(
      /Number\.MAX_SAFE_INTEGER|safe/i,
    );
  });

  it("still accepts safe number and bigint stake amounts", () => {
    expect(encodeStakeDeposit(Number.MAX_SAFE_INTEGER)).toBeInstanceOf(
      Uint8Array,
    );
    expect(encodeStakeWithdraw(Number.MAX_SAFE_INTEGER)).toBeInstanceOf(
      Uint8Array,
    );
    expect(encodeStakeDeposit(9_007_199_254_740_993n)).toBeInstanceOf(
      Uint8Array,
    );
    expect(encodeStakeWithdraw(9_007_199_254_740_993n)).toBeInstanceOf(
      Uint8Array,
    );
  });

  it("encodeStakeTransferAdmin", () => {
    expect(() => encodeStakeTransferAdmin()).toThrow(/tag 5/i);
  });

  it("encodeStakeAdminSetOracleAuthority", () => {
    const key = PublicKey.default;
    expect(() => encodeStakeAdminSetOracleAuthority(key)).toThrow(/tag 6/i);
  });

  it("encodeStakeAdminSetRiskThreshold", () => {
    expect(() => encodeStakeAdminSetRiskThreshold(1000n)).toThrow(/tag 7/i);
  });

  it("encodeStakeAdminSetMaintenanceFee", () => {
    expect(() => encodeStakeAdminSetMaintenanceFee(50n)).toThrow(/tag 8/i);
  });

  it("encodeStakeAdminResolveMarket", () => {
    expect(() => encodeStakeAdminResolveMarket()).toThrow(/tag 9/i);
  });

  it("encodeStakeAdminWithdrawInsurance", () => {
    const data = encodeStakeAdminWithdrawInsurance(10_000n);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminWithdrawInsurance);
    expect(data.length).toBe(1 + 8);
  });

  it("encodeStakeReturnInsurance", () => {
    const data = encodeStakeReturnInsurance(10_000n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.ReturnInsurance);
    expect(data.length).toBe(1 + 8);
  });

  it("encodeStakeAccrueFees", () => {
    const data = encodeStakeAccrueFees();
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AccrueFees);
    expect(data.length).toBe(1);
  });

  it("encodeStakeInitTradingPool", () => {
    const data = encodeStakeInitTradingPool(300n, 5_000_000n);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.InitTradingPool);
    expect(data.length).toBe(1 + 8 + 8);
  });

  it("encodeStakeAdminSetHwmConfig", () => {
    const data = encodeStakeAdminSetHwmConfig(true, 500);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetHwmConfig);
    expect(data[1]).toBe(1);
    expect(data.length).toBe(1 + 1 + 2);
  });

  it("encodeStakeAdminSetTrancheConfig", () => {
    const data = encodeStakeAdminSetTrancheConfig(2000);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetTrancheConfig);
    expect(data.length).toBe(1 + 2);
  });

  it("encodeStakeDepositJunior", () => {
    const data = encodeStakeDepositJunior(1_000_000n);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.DepositJunior);
    expect(data.length).toBe(1 + 8);
  });

  it("encodeStakeAdminSetInsurancePolicy", () => {
    const auth = PublicKey.default;
    expect(() => encodeStakeAdminSetInsurancePolicy(auth, 100n, 5000, 86400n)).toThrow(/tag 11/i);
  });

  it("encodeStakeSetMarketResolved", () => {
    const data = encodeStakeSetMarketResolved();
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.SetMarketResolved);
    expect(data.length).toBe(1);
  });

  it("decodeStakePool (v2, 384 bytes) reads marketResolved and HWM fields from correct reserved offsets", () => {
    // v2 StakePool: 384 bytes. pending_admin [u8;32] added at offset 288.
    // _reserved (64 bytes) starts at offset 320 in v2.
    // _reserved[9] bit 0 = market_resolved, bit 1 = hwm_enabled (state.rs:209).
    // _reserved[10..12] = hwm_floor_bps (u16 LE).
    const buf = new Uint8Array(STAKE_POOL_SIZE_V2);
    const dv = new DataView(buf.buffer);
    buf[0] = 1;
    buf[1] = 2;
    buf.set(PublicKey.default.toBytes(), 8);   // slab @ 8
    buf.set(PublicKey.default.toBytes(), 40);  // admin @ 40
    buf.set(PublicKey.default.toBytes(), 72);  // collateralMint @ 72
    buf.set(PublicKey.default.toBytes(), 104); // lpMint @ 104
    buf.set(PublicKey.default.toBytes(), 136); // vault @ 136
    dv.setBigUint64(168, 1n, true);  // totalDeposited
    dv.setBigUint64(176, 2n, true);  // totalLpSupply
    dv.setBigUint64(184, 3n, true);  // cooldownSlots
    dv.setBigUint64(192, 4n, true);  // depositCap
    dv.setBigUint64(200, 5n, true);  // totalFlushed
    dv.setBigUint64(208, 6n, true);  // totalReturned
    dv.setBigUint64(216, 7n, true);  // totalWithdrawn
    buf.set(PublicKey.default.toBytes(), 224); // percolatorProgram @ 224
    dv.setBigUint64(256, 8n, true);  // totalFeesEarned
    dv.setBigUint64(264, 9n, true);  // lastFeeAccrualSlot
    dv.setBigUint64(272, 10n, true); // lastVaultSnapshot
    // poolMode @ 280 (u8), _mode_padding @ 281..288 (7 bytes)
    // pending_admin [u8;32] @ 288..320 (zeros = no pending proposal)
    // _reserved (64 bytes) @ 320..384
    const reservedStart = STAKE_POOL_RESERVED_OFFSET; // 320
    stampStakePoolIdentity(buf); // writes discriminator at 320..328, version at 328
    // _reserved[9] = flags: bit 0 = market_resolved, bit 1 = hwm_enabled
    buf[reservedStart + 9] = 0x03; // both bits set: market_resolved=1, hwm_enabled=1
    dv.setUint16(reservedStart + 10, 777, true); // hwm_floor_bps at _reserved[10..12]
    dv.setBigUint64(reservedStart + 16, 123n, true); // epoch_high_water_tvl
    dv.setBigUint64(reservedStart + 24, 456n, true); // hwm_last_epoch

    const pool = decodeStakePool(buf);
    expect(pool.layoutVersion).toBe(2);
    expect(pool.marketResolved).toBe(true);
    expect(pool.hwmEnabled).toBe(true);
    expect(pool.epochHighWaterTvl).toBe(123n);
    expect(pool.hwmFloorBps).toBe(777);
    expect(pool.hwmLastEpoch).toBe(456n);
    expect(pool.pendingAdmin).toBeNull(); // zeros = no pending proposal
  });

  it("decodeStakePool (v1, 352 bytes — deployed binary) round-trips all scalar fields", () => {
    // Deployed stake program (51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ) uses the
    // 352-byte v1 layout. _reserved (64 bytes) starts at offset 288. No pending_admin.
    // discriminator at [288..296], version byte 1 at [296].
    const buf = new Uint8Array(STAKE_POOL_SIZE_V1); // 352
    const dv = new DataView(buf.buffer);

    // Header
    buf[0] = 1; // is_initialized
    buf[1] = 42; // bump
    buf[2] = 13; // vault_authority_bump
    buf[3] = 1;  // admin_transferred
    // _padding [4..8] zeros

    // 5 pubkeys at [8..168]
    buf.set(TEST_POOL.toBytes(), 8);           // slab
    buf.set(TEST_USER.toBytes(), 40);          // admin
    buf.set(PublicKey.default.toBytes(), 72);  // collateral_mint
    buf.set(PublicKey.default.toBytes(), 104); // lp_mint
    buf.set(PublicKey.default.toBytes(), 136); // vault

    // u64 accounting fields [168..224]
    dv.setBigUint64(168, 1_000_000n, true); // total_deposited
    dv.setBigUint64(176, 500_000n, true);   // total_lp_supply
    dv.setBigUint64(184, 2_000n, true);     // cooldown_slots
    dv.setBigUint64(192, 5_000_000n, true); // deposit_cap
    dv.setBigUint64(200, 100_000n, true);   // total_flushed
    dv.setBigUint64(208, 50_000n, true);    // total_returned
    dv.setBigUint64(216, 200_000n, true);   // total_withdrawn

    // percolator_program [224..256]
    buf.set(PublicKey.default.toBytes(), 224);

    // PERC-272 fields [256..288]
    dv.setBigUint64(256, 7_777n, true);  // total_fees_earned
    dv.setBigUint64(264, 8_888n, true);  // last_fee_accrual_slot
    dv.setBigUint64(272, 9_999n, true);  // last_vault_snapshot
    buf[280] = 1; // pool_mode = 1 (trading LP)
    // _mode_padding [281..288] zeros

    // _reserved [288..352] — discriminator + version at [288..297]
    const reservedStart = STAKE_POOL_RESERVED_OFFSET_V1; // 288
    // Write discriminator (STAKE_POOL_DISCRIMINATOR = "SPOOL_V1")
    buf.set(STAKE_POOL_DISCRIMINATOR, reservedStart);
    // Version byte at _reserved[8] = buf[296]
    buf[reservedStart + 8] = 1; // v1
    // flags byte at _reserved[9]: bit 0 = market_resolved, bit 1 = hwm_enabled
    buf[reservedStart + 9] = 0x02; // hwm_enabled=1, market_resolved=0
    dv.setUint16(reservedStart + 10, 5000, true); // hwm_floor_bps
    dv.setBigUint64(reservedStart + 16, 111n, true); // epoch_high_water_tvl
    dv.setBigUint64(reservedStart + 24, 222n, true); // hwm_last_epoch

    const pool = decodeStakePool(buf);

    // Layout detection
    expect(pool.layoutVersion).toBe(1);
    // v1 never has pending_admin
    expect(pool.pendingAdmin).toBeNull();

    // Header fields
    expect(pool.isInitialized).toBe(true);
    expect(pool.bump).toBe(42);
    expect(pool.vaultAuthorityBump).toBe(13);
    expect(pool.adminTransferred).toBe(true);

    // Pubkeys
    expect(pool.slab.toBase58()).toBe(TEST_POOL.toBase58());
    expect(pool.admin.toBase58()).toBe(TEST_USER.toBase58());

    // Accounting
    expect(pool.totalDeposited).toBe(1_000_000n);
    expect(pool.totalLpSupply).toBe(500_000n);
    expect(pool.cooldownSlots).toBe(2_000n);
    expect(pool.depositCap).toBe(5_000_000n);
    expect(pool.totalFlushed).toBe(100_000n);
    expect(pool.totalReturned).toBe(50_000n);
    expect(pool.totalWithdrawn).toBe(200_000n);

    // PERC-272
    expect(pool.totalFeesEarned).toBe(7_777n);
    expect(pool.lastFeeAccrualSlot).toBe(8_888n);
    expect(pool.lastVaultSnapshot).toBe(9_999n);
    expect(pool.poolMode).toBe(1);

    // _reserved flags and HWM
    expect(pool.marketResolved).toBe(false);
    expect(pool.hwmEnabled).toBe(true);
    expect(pool.hwmFloorBps).toBe(5000);
    expect(pool.epochHighWaterTvl).toBe(111n);
    expect(pool.hwmLastEpoch).toBe(222n);
  });

  it("decodeStakePool rejects buffers shorter than v1 minimum (352 bytes)", () => {
    const buf = new Uint8Array(300);
    expect(() => decodeStakePool(buf)).toThrow(/StakePool data too short/);
  });

  it("rejects stake-pool-shaped bytes with a missing discriminator", () => {
    const buf = new Uint8Array(384);
    expect(() => decodeStakePool(buf)).toThrow(/StakePool invalid discriminator/);
  });

  it("rejects stake pools with a mismatched version byte (v2 layout with version != 2)", () => {
    // 384-byte buffer triggers v2 layout detection (expects version = 2).
    const buf = new Uint8Array(STAKE_POOL_SIZE_V2);
    stampStakePoolIdentity(buf);
    buf[STAKE_POOL_RESERVED_OFFSET + 8] = 0; // wrong version for v2
    expect(() => decodeStakePool(buf)).toThrow(/StakePool version mismatch/);
  });

  it("rejects stake pools with a mismatched version byte (v1 layout with version != 1)", () => {
    // 352-byte buffer triggers v1 layout detection (expects version = 1).
    const buf = new Uint8Array(STAKE_POOL_SIZE_V1);
    buf.set(STAKE_POOL_DISCRIMINATOR, STAKE_POOL_RESERVED_OFFSET_V1);
    buf[STAKE_POOL_RESERVED_OFFSET_V1 + 8] = 2; // wrong version for v1 layout
    expect(() => decodeStakePool(buf)).toThrow(/StakePool version mismatch/);
  });

  it("rejects stake-deposit-shaped bytes with a missing discriminator", () => {
    const buf = new Uint8Array(152);
    expect(() => decodeDepositPda(buf)).toThrow(/StakeDeposit invalid discriminator/);
  });

  it("decodes a current StakeDeposit buffer once the discriminator is present", () => {
    const buf = new Uint8Array(152);
    const dv = new DataView(buf.buffer);
    buf[0] = 1;
    buf[1] = 254;
    buf.set(TEST_POOL.toBytes(), 8);
    buf.set(TEST_USER.toBytes(), 40);
    dv.setBigUint64(72, 123n, true);
    dv.setBigUint64(80, 456n, true);
    stampStakeDepositIdentity(buf);

    const deposit = decodeDepositPda(buf);
    expect(deposit.isInitialized).toBe(true);
    expect(deposit.bump).toBe(254);
    expect(deposit.pool.toBase58()).toBe(TEST_POOL.toBase58());
    expect(deposit.user.toBase58()).toBe(TEST_USER.toBase58());
    expect(deposit.lastDepositSlot).toBe(123n);
    expect(deposit.lpAmount).toBe(456n);
  });
});

describe("stake PDA derivation", () => {
  const slab = new PublicKey("FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD");
  const user = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");

  it("deriveStakePool returns deterministic PDA", () => {
    const [pda1, bump1] = deriveStakePool(slab, STAKE_PROGRAM_ID);
    const [pda2, bump2] = deriveStakePool(slab, STAKE_PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("deriveStakeVaultAuth returns deterministic PDA", () => {
    const [pool] = deriveStakePool(slab, STAKE_PROGRAM_ID);
    const [auth1, b1] = deriveStakeVaultAuth(pool, STAKE_PROGRAM_ID);
    const [auth2, b2] = deriveStakeVaultAuth(pool, STAKE_PROGRAM_ID);
    expect(auth1.equals(auth2)).toBe(true);
    expect(b1).toBe(b2);
  });

  it("deriveDepositPda returns deterministic PDA", () => {
    const [pool] = deriveStakePool(slab, STAKE_PROGRAM_ID);
    const [dep1, b1] = deriveDepositPda(pool, user, STAKE_PROGRAM_ID);
    const [dep2, b2] = deriveDepositPda(pool, user, STAKE_PROGRAM_ID);
    expect(dep1.equals(dep2)).toBe(true);
    expect(b1).toBe(b2);
  });

  it("different slabs produce different pool PDAs", () => {
    const slab2 = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");
    const [pda1] = deriveStakePool(slab, STAKE_PROGRAM_ID);
    const [pda2] = deriveStakePool(slab2, STAKE_PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(false);
  });
});

// ============================================================================
// Bug-fix: initPoolAccounts slab must be writable (BUG A)
// ============================================================================

describe("initPoolAccounts — BUG A: slab must be writable", () => {
  it("initPoolAccounts returns slab (index 1) with isWritable=true", async () => {
    // Deployed program (51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ) at processor.rs:316
    // explicitly checks `!slab.is_writable` and returns ProgramError::InvalidArgument if false.
    // The wrapper UpdateAuthority CPI performed inside process_init_pool mutates the slab
    // (transfers admin authority to the pool PDA), which requires the account to be writable
    // in the outer transaction's account list.
    const { initPoolAccounts } = await import("../src/solana/stake.js");
    const dummy = PublicKey.default;
    const accounts = initPoolAccounts({
      admin: dummy,
      slab: dummy,
      pool: dummy,
      lpMint: dummy,
      vault: dummy,
      vaultAuth: dummy,
      collateralMint: dummy,
      percolatorProgram: dummy,
    });
    // slab is at index 1
    const slabMeta = accounts[1];
    expect(slabMeta.isSigner).toBe(false);
    expect(slabMeta.isWritable).toBe(true);
  });
});
