// S3 of J-20261120-SDK-REPORT-DEVNETSIMULATEBUILDERS: the legacy stake helpers on a live v5 FIRST_LOSS pool.
// Fixture: devnet stake pool CcRu14fp... (480 B, version 5, riskMode 1) captured read-only at slot 524373908.
// Offline only: nothing here talks to an RPC.
//
// On devnet (simulateTransaction, sigVerify off): depositAccounts (12 accounts) and withdrawAccounts (11) failed
// `NotEnoughAccountKeys` on this pool; ACCOUNTS_STAKE_DEPOSIT_V5 / ACCOUNTS_STAKE_WITHDRAW_V5 (14 each) were accepted.
// decodeStakePool threw "StakePool unsupported version: 5 !== 4".
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { decodeStakePool, depositAccounts, depositJuniorAccounts, withdrawAccounts } from "../src/solana/stake.js";
import { ACCOUNTS_STAKE_DEPOSIT_V5, ACCOUNTS_STAKE_WITHDRAW_V5, decodeStakePoolV5, stakeMetasV5 } from "../src/abi/v22-stake.js";
import { deriveInsuranceUnitsV22 } from "../src/abi/v22-wire.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/devnet-stake-pool-v5-first-loss-20261120.json", import.meta.url), "utf8"));
const poolBytes = () => new Uint8Array(Buffer.from(fx.stakePool.base64, "base64"));
const k = () => Keypair.generate().publicKey;

describe("S3: stake deposit / withdraw helpers on a live v5 FIRST_LOSS pool", () => {
  it("decodeStakePool (the input depositAccounts' JSDoc tells callers to use) decodes the live v5 pool", () => {
    expect(decodeStakePoolV5(poolBytes()).riskMode).toBe(1);
    expect(() => decodeStakePool(poolBytes())).not.toThrow();
  });

  it("depositAccounts / withdrawAccounts give a FIRST_LOSS pool the account count the stake program reads", () => {
    const pool = decodeStakePoolV5(poolBytes());
    const common = { riskMode: pool.riskMode, wrapperProgram: pool.percolatorProgram };
    const dep = depositAccounts({ user: k(), pool: k(), userCollateralAta: k(), vault: pool.vault, lpMint: pool.lpMint, userLpAta: k(), vaultAuth: k(), depositPda: k(), slab: pool.slab, ...common });
    const wd = withdrawAccounts({ user: k(), pool: k(), userLpAta: k(), lpMint: pool.lpMint, vault: pool.vault, userCollateralAta: k(), vaultAuth: k(), depositPda: k(), slab: pool.slab, ...common });
    expect(dep.length).toBe(ACCOUNTS_STAKE_DEPOSIT_V5.length); // 14
    expect(wd.length).toBe(ACCOUNTS_STAKE_WITHDRAW_V5.length); // 14
  });
});

describe("decodeStakePool on a v5 pool", () => {
  it("agrees with decodeStakePoolV5 on the shared prefix and exposes riskMode", () => {
    const legacy = decodeStakePool(poolBytes());
    const v5 = decodeStakePoolV5(poolBytes());
    expect(legacy.version).toBe(5);
    expect(legacy.riskMode).toBe(1);
    expect(legacy.slab.equals(new PublicKey(fx.market.pubkey))).toBe(true);
    for (const f of ["slab", "admin", "collateralMint", "lpMint", "vault", "percolatorProgram"] as const) {
      expect(legacy[f].equals(v5[f])).toBe(true);
    }
    for (const f of ["totalDeposited", "totalLpSupply", "cooldownSlots", "depositCap", "totalFlushed", "totalReturned", "totalWithdrawn", "totalFeesEarned", "realizedJuniorLoss", "juniorTotalLp"] as const) {
      expect(legacy[f]).toBe(v5[f]);
    }
    expect(legacy.poolMode).toBe(v5.poolMode);
    expect(legacy.floorFlags).toBe(v5.floorFlags);
  });

  it("v1..v4 pools carry no riskMode", () => {
    const v4 = poolBytes().slice(0, 408);
    v4[328] = 4;
    const d = decodeStakePool(v4);
    expect(d.version).toBe(4);
    expect(d.riskMode).toBeUndefined();
  });

  it("refuses a 480-byte buffer whose version byte is not 5, and a v5 version byte on a short buffer, naming decodeStakePoolV5", () => {
    const wrongVer = poolBytes();
    wrongVer[328] = 6;
    expect(() => decodeStakePool(wrongVer)).toThrow(/decodeStakePoolV5/);
    const short = poolBytes().slice(0, 408); // version byte still 5
    expect(() => decodeStakePool(short)).toThrow(/decodeStakePoolV5/);
  });
});

describe("FIRST_LOSS routing matches the v5 account specs exactly", () => {
  const pool = decodeStakePoolV5(poolBytes());
  const wrapperProgram = pool.percolatorProgram;
  const [insuranceUnits] = deriveInsuranceUnitsV22(wrapperProgram, pool.slab);
  const user = k(), poolPda = k(), userCollateral = k(), userLp = k(), vaultAuthority = k(), deposit = k();

  it("deposit = stakeMetasV5(ACCOUNTS_STAKE_DEPOSIT_V5) with the derived ins_units PDA", () => {
    const got = depositAccounts({ user, pool: poolPda, userCollateralAta: userCollateral, vault: pool.vault, lpMint: pool.lpMint, userLpAta: userLp, vaultAuth: vaultAuthority, depositPda: deposit, slab: pool.slab, riskMode: 1, wrapperProgram });
    const want = stakeMetasV5(ACCOUNTS_STAKE_DEPOSIT_V5, { user, pool: poolPda, userCollateral, vault: pool.vault, lpMint: pool.lpMint, userLp, vaultAuthority, deposit, market: pool.slab, insuranceUnits, wrapperProgram });
    expect(got).toEqual(want);
    // DepositJunior (tag 16) is refused on FIRST_LOSS pools by the program (NotSupportedOnFirstLoss 41): throw, don't build.
    expect(() => depositJuniorAccounts({ user, pool: poolPda, userCollateralAta: userCollateral, vault: pool.vault, lpMint: pool.lpMint, userLpAta: userLp, vaultAuth: vaultAuthority, depositPda: deposit, slab: pool.slab, riskMode: 1, wrapperProgram })).toThrow(/NotSupportedOnFirstLoss/);
    expect(depositJuniorAccounts({ user, pool: poolPda, userCollateralAta: userCollateral, vault: pool.vault, lpMint: pool.lpMint, userLpAta: userLp, vaultAuth: vaultAuthority, depositPda: deposit, slab: pool.slab, riskMode: 2 }).length).toBe(12);
  });

  it("withdraw = stakeMetasV5(ACCOUNTS_STAKE_WITHDRAW_V5); an explicit insuranceUnits override is used as given", () => {
    const override = k();
    const got = withdrawAccounts({ user, pool: poolPda, userLpAta: userLp, lpMint: pool.lpMint, vault: pool.vault, userCollateralAta: userCollateral, vaultAuth: vaultAuthority, depositPda: deposit, slab: pool.slab, riskMode: 1, wrapperProgram, insuranceUnits: override });
    const want = stakeMetasV5(ACCOUNTS_STAKE_WITHDRAW_V5, { user, pool: poolPda, userLp, lpMint: pool.lpMint, vault: pool.vault, userCollateral, vaultAuthority, deposit, market: pool.slab, insuranceUnits: override, wrapperProgram });
    expect(got).toEqual(want);
    expect(got[0].isWritable).toBe(true); // the staker pays the tag-116 refresh on FIRST_LOSS
  });

  it("FIRST_LOSS without wrapperProgram, or withdraw without slab, throws instead of building a NotEnoughAccountKeys tx", () => {
    const base = { user, pool: poolPda, vault: pool.vault, lpMint: pool.lpMint, vaultAuth: vaultAuthority, depositPda: deposit };
    expect(() => depositAccounts({ ...base, userCollateralAta: userCollateral, userLpAta: userLp, slab: pool.slab, riskMode: 1 })).toThrow(/wrapperProgram/);
    expect(() => withdrawAccounts({ ...base, userCollateralAta: userCollateral, userLpAta: userLp, riskMode: 1, wrapperProgram })).toThrow(/slab/);
    expect(() => depositAccounts({ ...base, userCollateralAta: userCollateral, userLpAta: userLp, slab: pool.slab, riskMode: 3 })).toThrow(/riskMode 3/);
    expect(() => withdrawAccounts({ ...base, userCollateralAta: userCollateral, userLpAta: userLp, riskMode: 3 })).toThrow(/riskMode 3/);
  });

  it("FEE_ONLY (2), legacy (0) and unset riskMode keep the legacy 12 / 11 account lists", () => {
    for (const riskMode of [undefined, 0, 2] as const) {
      const dep = depositAccounts({ user, pool: poolPda, userCollateralAta: userCollateral, vault: pool.vault, lpMint: pool.lpMint, userLpAta: userLp, vaultAuth: vaultAuthority, depositPda: deposit, slab: pool.slab, riskMode });
      const wd = withdrawAccounts({ user, pool: poolPda, userLpAta: userLp, lpMint: pool.lpMint, vault: pool.vault, userCollateralAta: userCollateral, vaultAuth: vaultAuthority, depositPda: deposit, slab: pool.slab, riskMode });
      expect(dep.length).toBe(12);
      expect(wd.length).toBe(11);
      expect(dep[8].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
      expect(dep[9].pubkey.equals(SYSVAR_CLOCK_PUBKEY)).toBe(true);
      expect(dep[10].pubkey.equals(SystemProgram.programId)).toBe(true);
      expect(wd[0].isWritable).toBe(false);
    }
  });
});
