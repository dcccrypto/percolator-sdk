/**
 * Coverage for the stake.ts admin/CPI-proxy encoders and getStakeProgramId resolution.
 * Wire layouts are pinned byte-for-byte to the documented stake instruction format
 * (tag(1) + LE payload) and to STAKE_IX tags.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  STAKE_IX,
  STAKE_PROGRAM_IDS,
  getStakeProgramId,
  encodeStakeProposeAdmin,
  encodeStakeAcceptAdmin,
  encodeStakeProposeCooldownIncrease,
  encodeStakeCommitCooldownIncrease,
  encodeStakeCancelCooldownIncrease,
  encodeStakeRotateInsuranceAuthority,
  encodeStakeRotateInsuranceOperator,
  encodeStakeBurnAssetAdmin,
  encodeStakeRecoverFlushedInsurance,
  encodeStakeFlushToInsurance,
  encodeStakeAdminResolveMarketCpi,
  encodeStakeAdminUpdateFeeSplit,
  encodeStakeAdminUpdateMaintenanceFeePerSlot,
  encodeStakeAdminUpdateBackingFeePolicy,
  encodeStakeAdminUpdateTradeFeePolicy,
  decodeDepositPda,
  recoverTerminalInsuranceAccounts,
} from "../src/solana/stake.js";

const dv = (u: Uint8Array) => new DataView(u.buffer, u.byteOffset, u.byteLength);

describe("stake tag-only encoders", () => {
  it.each([
    ["AcceptAdmin", encodeStakeAcceptAdmin, 6],
    ["CommitCooldownIncrease", encodeStakeCommitCooldownIncrease, 8],
    ["CancelCooldownIncrease", encodeStakeCancelCooldownIncrease, 9],
    ["RotateInsuranceAuthority", encodeStakeRotateInsuranceAuthority, 20],
    ["BurnAssetAdmin", encodeStakeBurnAssetAdmin, 21],
    ["RotateInsuranceOperator", encodeStakeRotateInsuranceOperator, 22],
    ["AdminResolveMarketCpi", encodeStakeAdminResolveMarketCpi, 24],
  ] as const)("%s is a single tag byte", (name, fn, tag) => {
    expect(STAKE_IX[name as keyof typeof STAKE_IX]).toBe(tag);
    expect(Array.from(fn())).toEqual([tag]);
  });
});

describe("stake payload encoders", () => {
  it("ProposeAdmin = tag 5 + 32-byte key (zero key cancels)", () => {
    const k = Keypair.generate().publicKey;
    const d = encodeStakeProposeAdmin(k);
    expect(d.length).toBe(33);
    expect(d[0]).toBe(5);
    expect(Array.from(d.subarray(1))).toEqual(Array.from(k.toBytes()));
    expect(Array.from(encodeStakeProposeAdmin(PublicKey.default).subarray(1))).toEqual(new Array(32).fill(0));
  });

  it("ProposeCooldownIncrease = tag 7 + u64 LE; rejects bad values", () => {
    const d = encodeStakeProposeCooldownIncrease(1234n);
    expect(d.length).toBe(9);
    expect(d[0]).toBe(7);
    expect(dv(d).getBigUint64(1, true)).toBe(1234n);
    expect(dv(encodeStakeProposeCooldownIncrease(77)).getBigUint64(1, true)).toBe(77n);
    expect(() => encodeStakeProposeCooldownIncrease(-1n)).toThrow(/non-negative/);
    expect(() => encodeStakeProposeCooldownIncrease(2 ** 60)).toThrow(/MAX_SAFE_INTEGER/);
    expect(() => encodeStakeProposeCooldownIncrease(1n << 64n)).toThrow(/u64 max/);
  });

  it("AdminUpdateFeeSplit = tag 25 + 3x u16 LE (7 bytes); range-checks u16", () => {
    const d = encodeStakeAdminUpdateFeeSplit(1600, 4800, 1600);
    expect(Array.from(d)).toEqual([25, 0x40, 0x06, 0xc0, 0x12, 0x40, 0x06]);
    expect(() => encodeStakeAdminUpdateFeeSplit(65536, 0, 0)).toThrow(/u16/);
    expect(() => encodeStakeAdminUpdateFeeSplit(0, -1, 0)).toThrow(/u16/);
    expect(() => encodeStakeAdminUpdateFeeSplit(0, 0, 1.5)).toThrow(/u16/);
  });

  it("AdminUpdateMaintenanceFeePerSlot = tag 26 + u128 LE (17 bytes)", () => {
    const v = (1n << 100n) + 5n;
    const d = encodeStakeAdminUpdateMaintenanceFeePerSlot(v);
    expect(d.length).toBe(17);
    expect(d[0]).toBe(26);
    expect(dv(d).getBigUint64(1, true)).toBe(5n);
    expect(dv(d).getBigUint64(9, true)).toBe(1n << 36n);
    expect(Array.from(encodeStakeAdminUpdateMaintenanceFeePerSlot(0).subarray(1))).toEqual(new Array(16).fill(0));
    const max = (1n << 128n) - 1n;
    expect(Array.from(encodeStakeAdminUpdateMaintenanceFeePerSlot(max).subarray(1))).toEqual(new Array(16).fill(255));
    expect(() => encodeStakeAdminUpdateMaintenanceFeePerSlot(1n << 128n)).toThrow(/u128 max/);
    expect(() => encodeStakeAdminUpdateMaintenanceFeePerSlot(-1n)).toThrow(/non-negative/);
    expect(() => encodeStakeAdminUpdateMaintenanceFeePerSlot(2 ** 60)).toThrow(/MAX_SAFE_INTEGER/);
  });

  it("AdminUpdateBackingFeePolicy = tag 27 + domain/fee/insurance u16 LE (7 bytes)", () => {
    const d = encodeStakeAdminUpdateBackingFeePolicy(2, 30, 5000);
    expect(Array.from(d)).toEqual([27, 2, 0, 30, 0, 0x88, 0x13]);
  });

  it("AdminUpdateTradeFeePolicy = tag 28 + u64 LE (9 bytes)", () => {
    const d = encodeStakeAdminUpdateTradeFeePolicy(30n);
    expect(d.length).toBe(9);
    expect(d[0]).toBe(28);
    expect(dv(d).getBigUint64(1, true)).toBe(30n);
  });
});

describe("deprecated v5 encoders refuse", () => {
  it("RecoverFlushedInsurance (23) and FlushToInsurance (3) throw DeprecatedV5", () => {
    expect(() => encodeStakeRecoverFlushedInsurance(1n)).toThrow(/tag 23\).*DeprecatedV5 \(34\).*tag 29/);
    expect(() => encodeStakeFlushToInsurance(1n)).toThrow(/tag 3\).*DeprecatedV5 \(34\).*tag 31/);
  });
});

describe("decodeDepositPda guards", () => {
  it("rejects short data", () => {
    expect(() => decodeDepositPda(new Uint8Array(10))).toThrow(/too short/);
  });
  it("rejects wrong discriminator on a full-length buffer", () => {
    expect(() => decodeDepositPda(new Uint8Array(4096))).toThrow(/invalid discriminator/);
  });
});

describe("recoverTerminalInsuranceAccounts riskMode guards", () => {
  const k = () => Keypair.generate().publicKey;
  const base = () => ({
    caller: k(), poolPda: k(), poolVault: k(), vaultAuth: k(), market: k(),
    wrapperVault: k(), wrapperVaultAuthority: k(), wrapperProgram: k(),
  });
  const call = (extra: Record<string, unknown>) =>
    recoverTerminalInsuranceAccounts({ ...base(), ...extra } as never);

  it("riskMode 1 requires insuranceUnits", () => {
    expect(() => call({ riskMode: 1 })).toThrow(/requires insuranceUnits/);
  });
  it("riskMode 2 rejects insuranceUnits and requires creatorToken", () => {
    expect(() => call({ riskMode: 2, insuranceUnits: k(), creatorToken: k() })).toThrow(/takes no insuranceUnits/);
    expect(() => call({ riskMode: 2 })).toThrow(/requires creatorToken/);
  });
  it("riskMode 0 rejects insuranceUnits / creatorToken", () => {
    expect(() => call({ riskMode: 0, insuranceUnits: k() })).toThrow(/legacy pool/);
    expect(() => call({ riskMode: 0, creatorToken: k() })).toThrow(/legacy pool/);
  });
});

describe("getStakeProgramId resolution", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const key of ["STAKE_PROGRAM_ID", "PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE", "NETWORK", "NEXT_PUBLIC_DEFAULT_NETWORK"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
    vi.restoreAllMocks();
  });

  it("explicit network wins over the env override", () => {
    process.env.STAKE_PROGRAM_ID = Keypair.generate().publicKey.toBase58();
    expect(getStakeProgramId("devnet").toBase58()).toBe(STAKE_PROGRAM_IDS.devnet);
    expect(getStakeProgramId("mainnet").toBase58()).toBe(STAKE_PROGRAM_IDS.mainnet);
  });

  it("rejects an unlisted override unless opted in", () => {
    const rogue = Keypair.generate().publicKey.toBase58();
    process.env.STAKE_PROGRAM_ID = rogue;
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    expect(() => getStakeProgramId()).toThrow(/not a known stake program/);
    process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = "1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getStakeProgramId().toBase58()).toBe(rogue);
    expect(warn).toHaveBeenCalled();
  });

  it("accepts a known override without opt-in", () => {
    process.env.STAKE_PROGRAM_ID = STAKE_PROGRAM_IDS.mainnet;
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getStakeProgramId().toBase58()).toBe(STAKE_PROGRAM_IDS.mainnet);
  });

  it("derives network from env vars", () => {
    delete process.env.STAKE_PROGRAM_ID;
    process.env.NETWORK = "mainnet-beta";
    delete process.env.NEXT_PUBLIC_DEFAULT_NETWORK;
    expect(getStakeProgramId().toBase58()).toBe(STAKE_PROGRAM_IDS.mainnet);
    process.env.NETWORK = "mainnet";
    expect(getStakeProgramId().toBase58()).toBe(STAKE_PROGRAM_IDS.mainnet);
    delete process.env.NETWORK;
    process.env.NEXT_PUBLIC_DEFAULT_NETWORK = "DEVNET";
    expect(getStakeProgramId().toBase58()).toBe(STAKE_PROGRAM_IDS.devnet);
  });

  it("refuses to guess when no network is configured", () => {
    delete process.env.STAKE_PROGRAM_ID;
    delete process.env.NETWORK;
    delete process.env.NEXT_PUBLIC_DEFAULT_NETWORK;
    expect(() => getStakeProgramId()).toThrow(/cannot determine the network/);
    process.env.NETWORK = "testnet";
    expect(() => getStakeProgramId()).toThrow(/cannot determine the network/);
  });
});
