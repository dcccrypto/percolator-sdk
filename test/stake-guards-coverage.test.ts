/**
 * Coverage for the remaining untaken guard branches of src/solana/stake.ts:
 * STAKE_PROGRAM_ID env-override allowlist, u128Le argument guards,
 * decodeDepositPda truncated data, recoverTerminalInsuranceAccounts legacy-pool guard.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  getStakeProgramId,
  STAKE_PROGRAM_IDS,
  encodeStakeAdminUpdateMaintenanceFeePerSlot,
  decodeDepositPda,
  STAKE_DEPOSIT_SIZE,
  recoverTerminalInsuranceAccounts,
} from "../src/solana/stake.js";

const pk = () => Keypair.generate().publicKey;

describe("getStakeProgramId env override allowlist", () => {
  const saved = {
    id: process.env.STAKE_PROGRAM_ID,
    allow: process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE,
  };
  afterEach(() => {
    for (const [k, v] of [
      ["STAKE_PROGRAM_ID", saved.id],
      ["PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE", saved.allow],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.restoreAllMocks();
  });

  it("rejects an unlisted override without the opt-in flag", () => {
    const rogue = pk().toBase58();
    process.env.STAKE_PROGRAM_ID = rogue;
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    expect(() => getStakeProgramId()).toThrow(/not a known stake program address/);
  });

  it("an explicit network argument ignores a rogue override", () => {
    process.env.STAKE_PROGRAM_ID = pk().toBase58();
    expect(getStakeProgramId("devnet").toBase58()).toBe(STAKE_PROGRAM_IDS.devnet);
  });

  it("accepts an unlisted override only with the opt-in flag", () => {
    const rogue = pk();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.STAKE_PROGRAM_ID = rogue.toBase58();
    process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = "1";
    expect(getStakeProgramId().equals(rogue)).toBe(true);
  });

  it("accepts a known override without the opt-in flag", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.STAKE_PROGRAM_ID = STAKE_PROGRAM_IDS.mainnet;
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    expect(getStakeProgramId().toBase58()).toBe(STAKE_PROGRAM_IDS.mainnet);
  });
});

describe("u128Le guards (via encodeStakeAdminUpdateMaintenanceFeePerSlot)", () => {
  it("encodes tag + 16 bytes LE, accepting the u128 max", () => {
    const max = (1n << 128n) - 1n;
    const data = encodeStakeAdminUpdateMaintenanceFeePerSlot(max);
    expect(data.length).toBe(17);
    expect([...data.slice(1)].every((b) => b === 0xff)).toBe(true);
    expect(encodeStakeAdminUpdateMaintenanceFeePerSlot(0).slice(1)).toEqual(new Uint8Array(16));
  });
  it("rejects an unsafe-integer number", () => {
    expect(() => encodeStakeAdminUpdateMaintenanceFeePerSlot(2 ** 60)).toThrow(/MAX_SAFE_INTEGER/);
  });
  it("rejects negative values", () => {
    expect(() => encodeStakeAdminUpdateMaintenanceFeePerSlot(-1n)).toThrow(/non-negative/);
  });
  it("rejects values above u128 max", () => {
    expect(() => encodeStakeAdminUpdateMaintenanceFeePerSlot(1n << 128n)).toThrow(/exceeds u128 max/);
  });
});

describe("decodeDepositPda truncated data", () => {
  it("throws when shorter than STAKE_DEPOSIT_SIZE", () => {
    expect(() => decodeDepositPda(new Uint8Array(STAKE_DEPOSIT_SIZE - 1))).toThrow(/too short/);
    expect(() => decodeDepositPda(new Uint8Array(0))).toThrow(/too short/);
  });
  it("throws on a full-size buffer with a bad discriminator", () => {
    expect(() => decodeDepositPda(new Uint8Array(STAKE_DEPOSIT_SIZE))).toThrow();
  });
});

describe("recoverTerminalInsuranceAccounts legacy pool (riskMode 0)", () => {
  const base = () => ({
    caller: pk(), pool: pk(), poolVault: pk(), vaultAuth: pk(), market: pk(),
    wrapperVault: pk(), wrapperVaultAuthority: pk(), wrapperProgram: pk(),
  });
  it("rejects insuranceUnits or creatorToken", () => {
    expect(() => recoverTerminalInsuranceAccounts({ ...base(), riskMode: 0, insuranceUnits: pk() })).toThrow(/legacy pool/);
    expect(() => recoverTerminalInsuranceAccounts({ ...base(), riskMode: 0, creatorToken: pk() })).toThrow(/legacy pool/);
  });
  it("accepts only the optional stray account", () => {
    const stray = pk();
    const keys = recoverTerminalInsuranceAccounts({ ...base(), riskMode: 0, stray });
    expect(keys).toHaveLength(10);
    expect(keys[9].pubkey.equals(stray)).toBe(true);
  });
});
