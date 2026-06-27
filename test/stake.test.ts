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
  encodeStakeBindInsuranceAuthority,
  bindInsuranceAuthorityAccounts,
  initPoolAccounts,
  decodeStakePool,
  decodeDepositPda,
  deriveStakePool,
  deriveStakeVaultAuth,
  deriveDepositPda,
  STAKE_PROGRAM_ID,
  STAKE_POOL_DISCRIMINATOR,
  STAKE_POOL_CURRENT_VERSION,
  STAKE_POOL_SIZE,
  STAKE_POOL_SIZE_V1,
  STAKE_DEPOSIT_DISCRIMINATOR,
} from "../src/solana/stake.js";

// v2 (384-byte) _reserved block starts at 320; v1 (352-byte) starts at 288.
const STAKE_POOL_RESERVED_OFFSET_V2 = 320;
const STAKE_POOL_RESERVED_OFFSET_V1 = 288;
const STAKE_DEPOSIT_RESERVED_OFFSET = 88;
const TEST_POOL = new PublicKey("FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD");
const TEST_USER = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");

/** Stamp a v2 (384-byte) StakePool identity at the v2 reserved offset (320). */
function stampStakePoolIdentity(buf: Uint8Array): void {
  buf.set(STAKE_POOL_DISCRIMINATOR, STAKE_POOL_RESERVED_OFFSET_V2);
  buf[STAKE_POOL_RESERVED_OFFSET_V2 + 8] = STAKE_POOL_CURRENT_VERSION; // version = 2
}

/** Stamp a v1 (352-byte) StakePool identity at the v1 reserved offset (288). */
function stampStakePoolV1Identity(buf: Uint8Array): void {
  buf.set(STAKE_POOL_DISCRIMINATOR, STAKE_POOL_RESERVED_OFFSET_V1);
  buf[STAKE_POOL_RESERVED_OFFSET_V1 + 8] = 1; // version = 1
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

  it("encodeStakeAdminSetTrancheConfig throws (collides with BindInsuranceAuthority at tag 15)", () => {
    expect(() => encodeStakeAdminSetTrancheConfig(2000)).toThrow(/tag 15|BindInsuranceAuthority/i);
  });

  it("encodeStakeDepositJunior throws (tag 16 not in deployed v39 program)", () => {
    expect(() => encodeStakeDepositJunior(1_000_000n)).toThrow(/tag 16/i);
  });

  it("encodeStakeAdminSetInsurancePolicy", () => {
    const auth = PublicKey.default;
    expect(() => encodeStakeAdminSetInsurancePolicy(auth, 100n, 5000, 86400n)).toThrow(/tag 11/i);
  });

  it("encodeStakeSetMarketResolved throws (tag 18 not in deployed v39 program)", () => {
    expect(() => encodeStakeSetMarketResolved()).toThrow(/tag 18/i);
  });

  it("encodeStakeBindInsuranceAuthority emits 1-byte tag 0x0F", () => {
    const data = encodeStakeBindInsuranceAuthority();
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(1);
    expect(data[0]).toBe(0x0F); // STAKE_IX.BindInsuranceAuthority = 15
    expect(data[0]).toBe(STAKE_IX.BindInsuranceAuthority);
  });

  it("STAKE_IX.BindInsuranceAuthority is 15 and STAKE_IX.AdminSetTrancheConfig is also 15 (same tag, deprecated)", () => {
    expect(STAKE_IX.BindInsuranceAuthority).toBe(15);
    expect(STAKE_IX.AdminSetTrancheConfig).toBe(15);
  });

  it("bindInsuranceAuthorityAccounts returns 5 accounts in correct signer/writable order", () => {
    const admin = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");
    const poolPda = new PublicKey("FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD");
    const vaultAuth = new PublicKey("11111111111111111111111111111111");
    const slab = new PublicKey("So11111111111111111111111111111111111111112");
    const percolatorProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

    const keys = bindInsuranceAuthorityAccounts({ admin, poolPda, vaultAuth, slab, percolatorProgram });
    expect(keys).toHaveLength(5);

    // [0] admin: signer, NOT writable
    expect(keys[0].pubkey.equals(admin)).toBe(true);
    expect(keys[0].isSigner).toBe(true);
    expect(keys[0].isWritable).toBe(false);

    // [1] poolPda: NOT signer, writable
    expect(keys[1].pubkey.equals(poolPda)).toBe(true);
    expect(keys[1].isSigner).toBe(false);
    expect(keys[1].isWritable).toBe(true);

    // [2] vaultAuth: NOT signer, NOT writable
    expect(keys[2].pubkey.equals(vaultAuth)).toBe(true);
    expect(keys[2].isSigner).toBe(false);
    expect(keys[2].isWritable).toBe(false);

    // [3] slab: NOT signer, writable (needed for UpdateAssetAuthority CPI)
    expect(keys[3].pubkey.equals(slab)).toBe(true);
    expect(keys[3].isSigner).toBe(false);
    expect(keys[3].isWritable).toBe(true);

    // [4] percolatorProgram: NOT signer, NOT writable
    expect(keys[4].pubkey.equals(percolatorProgram)).toBe(true);
    expect(keys[4].isSigner).toBe(false);
    expect(keys[4].isWritable).toBe(false);
  });

  it("initPoolAccounts: slab is writable (InitPool CPIs UpdateAuthority which writes the slab)", () => {
    const admin = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");
    const slab = new PublicKey("FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD");
    const pool = new PublicKey("11111111111111111111111111111111");
    const lpMint = new PublicKey("So11111111111111111111111111111111111111112");
    const vault = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const vaultAuth = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv");
    const collateralMint = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
    const percolatorProgram = new PublicKey("So11111111111111111111111111111111111111111");

    const keys = initPoolAccounts({ admin, slab, pool, lpMint, vault, vaultAuth, collateralMint, percolatorProgram });

    // account[0] = admin (signer, writable)
    expect(keys[0].isWritable).toBe(true);
    expect(keys[0].isSigner).toBe(true);

    // account[1] = slab — MUST be writable for UpdateAuthority CPI
    expect(keys[1].pubkey.equals(slab)).toBe(true);
    expect(keys[1].isWritable).toBe(true);
    expect(keys[1].isSigner).toBe(false);

    // account[2] = pool (writable)
    expect(keys[2].isWritable).toBe(true);
  });

  it("decodes a v1 (352-byte) StakePool with pendingAdmin=null", () => {
    const buf = new Uint8Array(STAKE_POOL_SIZE_V1); // 352 bytes
    const dv = new DataView(buf.buffer);
    buf[0] = 1; // isInitialized
    buf[1] = 5; // bump
    buf[2] = 7; // vaultAuthorityBump
    // admin, slab etc. remain at PublicKey.default (all zeros)
    buf.set(PublicKey.default.toBytes(), 8);   // slab
    buf.set(PublicKey.default.toBytes(), 40);  // admin
    buf.set(PublicKey.default.toBytes(), 72);  // collateralMint
    buf.set(PublicKey.default.toBytes(), 104); // lpMint
    buf.set(PublicKey.default.toBytes(), 136); // vault
    dv.setBigUint64(168, 100n, true); // totalDeposited
    buf.set(PublicKey.default.toBytes(), 224); // percolatorProgram

    // v1: _reserved starts at 288 (NOT 320); stamp identity + version=1 there
    stampStakePoolV1Identity(buf);
    buf[STAKE_POOL_RESERVED_OFFSET_V1 + 9] = 1;  // marketResolved = true

    const pool = decodeStakePool(buf);
    expect(pool.isInitialized).toBe(true);
    expect(pool.bump).toBe(5);
    expect(pool.totalDeposited).toBe(100n);
    expect(pool.pendingAdmin).toBeNull(); // v1 has no pending_admin field
    expect(pool.marketResolved).toBe(true);
  });

  it("decodeStakePool rejects v1 data with a bad version byte (stamps discriminator but version=0)", () => {
    const buf = new Uint8Array(STAKE_POOL_SIZE_V1);
    buf.set(STAKE_POOL_DISCRIMINATOR, STAKE_POOL_RESERVED_OFFSET_V1);
    buf[STAKE_POOL_RESERVED_OFFSET_V1 + 8] = 0; // bad version for v1
    expect(() => decodeStakePool(buf)).toThrow(/StakePool unsupported version/);
  });

  it("decodeStakePool rejects buffers shorter than v1 (< 352 bytes)", () => {
    const buf = new Uint8Array(STAKE_POOL_SIZE_V1 - 1);
    expect(() => decodeStakePool(buf)).toThrow(/too short/);
  });

  it("decodeStakePool reads marketResolved and HWM fields from current reserved offsets", () => {
    // v2 StakePool: 384 bytes (was 352 in v1). pending_admin [u8;32] added at offset 288.
    // _reserved (64 bytes) now starts at offset 320 (was 288 in v1).
    const buf = new Uint8Array(384);
    const dv = new DataView(buf.buffer);
    buf[0] = 1;
    buf[1] = 2;
    // _padding: bytes 4..8 (4 bytes)
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
    // pending_admin [u8;32] @ 288..320 (new in v2; zeros = no pending proposal)
    // _reserved (64 bytes) starts at 320 in v2 (was 288 in v1)
    stampStakePoolIdentity(buf);
    buf[STAKE_POOL_RESERVED_OFFSET_V2 + 9] = 1;   // market_resolved = true
    buf[STAKE_POOL_RESERVED_OFFSET_V2 + 10] = 1;  // hwm_enabled = true
    dv.setUint16(STAKE_POOL_RESERVED_OFFSET_V2 + 11, 777, true);   // hwm_floor_bps
    dv.setBigUint64(STAKE_POOL_RESERVED_OFFSET_V2 + 16, 123n, true); // epoch_high_water_tvl
    dv.setBigUint64(STAKE_POOL_RESERVED_OFFSET_V2 + 24, 456n, true); // hwm_last_epoch

    const pool = decodeStakePool(buf);
    expect(pool.marketResolved).toBe(true);
    expect(pool.hwmEnabled).toBe(true);
    expect(pool.epochHighWaterTvl).toBe(123n);
    expect(pool.hwmFloorBps).toBe(777);
    expect(pool.hwmLastEpoch).toBe(456n);
  });

  it("rejects stake-pool-shaped bytes with a missing discriminator", () => {
    const buf = new Uint8Array(384);
    expect(() => decodeStakePool(buf)).toThrow(/StakePool invalid discriminator/);
  });

  it("rejects v2 (384-byte) stake pools with a bad version byte", () => {
    const buf = new Uint8Array(384);
    stampStakePoolIdentity(buf);
    buf[STAKE_POOL_RESERVED_OFFSET_V2 + 8] = 99; // bad version for v2
    expect(() => decodeStakePool(buf)).toThrow(/StakePool unsupported version/);
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
    expect(pda1.equals(pda2)).toBe(false);  });
});
