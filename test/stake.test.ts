import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  STAKE_IX,  encodeStakeInitPool,
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
  deriveStakePool,
  deriveStakeVaultAuth,
  deriveDepositPda,
  STAKE_PROGRAM_ID,
} from "../src/solana/stake.js";

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

  it("decodeStakePool reads marketResolved and HWM fields from current reserved offsets", () => {
    const buf = new Uint8Array(352);
    const dv = new DataView(buf.buffer);
    buf[0] = 1;
    buf[1] = 2;
    buf.set(PublicKey.default.toBytes(), 8);
    buf.set(PublicKey.default.toBytes(), 40);
    buf.set(PublicKey.default.toBytes(), 72);
    buf.set(PublicKey.default.toBytes(), 104);
    buf.set(PublicKey.default.toBytes(), 136);
    dv.setBigUint64(168, 1n, true);
    dv.setBigUint64(176, 2n, true);
    dv.setBigUint64(184, 3n, true);
    dv.setBigUint64(192, 4n, true);
    dv.setBigUint64(200, 5n, true);
    dv.setBigUint64(208, 6n, true);
    dv.setBigUint64(216, 7n, true);
    buf.set(PublicKey.default.toBytes(), 224);
    dv.setBigUint64(256, 8n, true);
    dv.setBigUint64(264, 9n, true);
    dv.setBigUint64(272, 10n, true);
    const reservedStart = 288;
    buf[reservedStart + 9] = 1;
    buf[reservedStart + 10] = 1;
    dv.setUint16(reservedStart + 11, 777, true);
    dv.setBigUint64(reservedStart + 16, 123n, true);
    dv.setBigUint64(reservedStart + 24, 456n, true);

    const pool = decodeStakePool(buf);
    expect(pool.marketResolved).toBe(true);
    expect(pool.hwmEnabled).toBe(true);
    expect(pool.epochHighWaterTvl).toBe(123n);
    expect(pool.hwmFloorBps).toBe(777);
    expect(pool.hwmLastEpoch).toBe(456n);
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
