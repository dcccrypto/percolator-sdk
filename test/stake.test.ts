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
  encodeStakeAccrueFees,
  encodeStakeInitTradingPool,
  encodeStakeAdminSetHwmConfig,
  encodeStakeAdminSetTrancheConfig,
  encodeStakeDepositJunior,
  encodeStakeAdminSetInsurancePolicy,
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
    const data = encodeStakeTransferAdmin();
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.TransferAdmin);
    expect(data.length).toBe(1);
  });

  it("encodeStakeAdminSetOracleAuthority", () => {
    const key = PublicKey.default;
    const data = encodeStakeAdminSetOracleAuthority(key);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetOracleAuthority);
    expect(data.length).toBe(1 + 32);
  });

  it("encodeStakeAdminSetRiskThreshold", () => {
    const data = encodeStakeAdminSetRiskThreshold(1000n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetRiskThreshold);
    expect(data.length).toBe(1 + 16);
  });

  it("encodeStakeAdminSetMaintenanceFee", () => {
    const data = encodeStakeAdminSetMaintenanceFee(50n);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetMaintenanceFee);
    expect(data.length).toBe(1 + 16);
  });

  it("encodeStakeAdminResolveMarket", () => {
    const data = encodeStakeAdminResolveMarket();
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminResolveMarket);
    expect(data.length).toBe(1);
  });

  it("encodeStakeAdminWithdrawInsurance", () => {
    const data = encodeStakeAdminWithdrawInsurance(10_000n);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminWithdrawInsurance);
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
    const data = encodeStakeAdminSetInsurancePolicy(auth, 100n, 5000, 86400n);    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetInsurancePolicy);
    expect(data.length).toBe(1 + 32 + 8 + 2 + 8);
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
