/**
 * Coverage gaps in src/solana/stake.ts: env-override guard, u128 encoder guards,
 * short StakeDeposit data, riskMode 0 tail guard, undeployed-network guard.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  getStakeProgramId,
  STAKE_PROGRAM_IDS,
  STAKE_IX,
  STAKE_DEPOSIT_SIZE,
  decodeDepositPda,
  encodeStakeAdminUpdateMaintenanceFeePerSlot,
  recoverTerminalInsuranceAccounts,
} from "../src/solana/stake.js";

const pk = () => PublicKey.unique();

describe("getStakeProgramId env override (#308)", () => {
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
  });

  it("rejects an unlisted override unless explicitly opted in", () => {
    const rogue = pk().toBase58();
    process.env.STAKE_PROGRAM_ID = rogue;
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    expect(() => getStakeProgramId()).toThrow(/not a known stake program address/);
    // opt-in value other than "1" still rejects
    process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = "true";
    expect(() => getStakeProgramId()).toThrow(/not a known stake program address/);
    process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = "1";
    expect(getStakeProgramId().toBase58()).toBe(rogue);
  });

  it("accepts a listed override without opt-in; explicit network ignores the override", () => {
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    process.env.STAKE_PROGRAM_ID = STAKE_PROGRAM_IDS.mainnet;
    expect(getStakeProgramId().toBase58()).toBe(STAKE_PROGRAM_IDS.mainnet);
    process.env.STAKE_PROGRAM_ID = pk().toBase58();
    expect(getStakeProgramId("devnet").toBase58()).toBe(STAKE_PROGRAM_IDS.devnet);
  });
});

describe("getStakeProgramId undeployed network", () => {
  it("throws when the network has no program id", async () => {
    vi.resetModules();
    // STAKE_PROGRAM_IDS is frozen; neutralise freeze only while the module loads.
    const spy = vi.spyOn(Object, "freeze").mockImplementation(((o: unknown) => o) as typeof Object.freeze);
    const fresh = await import("../src/solana/stake.js");
    spy.mockRestore();
    (fresh.STAKE_PROGRAM_IDS as { mainnet: string }).mainnet = "";
    expect(() => fresh.getStakeProgramId("mainnet")).toThrow(/not deployed on mainnet/);
  });
});

describe("encodeStakeAdminUpdateMaintenanceFeePerSlot u128 guards", () => {
  // percolator-stake src/instruction.rs, StakeInstruction::unpack tag 26:
  // "u128 = 16 bytes, NOT 8" -> data = [26] ++ u128 LE (17 bytes).
  it("encodes tag 26 + 16-byte LE u128", () => {
    const d = encodeStakeAdminUpdateMaintenanceFeePerSlot((1n << 128n) - 1n);
    expect(d.length).toBe(17);
    expect(d[0]).toBe(STAKE_IX.AdminUpdateMaintenanceFeePerSlot);
    expect([...d.slice(1)].every((b) => b === 0xff)).toBe(true);
    const e = encodeStakeAdminUpdateMaintenanceFeePerSlot(1n << 64n);
    expect([...e.slice(1)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  });
  it("rejects unsafe numbers, negatives and > u128 max", () => {
    expect(() => encodeStakeAdminUpdateMaintenanceFeePerSlot(2 ** 53)).toThrow(/MAX_SAFE_INTEGER/);
    expect(() => encodeStakeAdminUpdateMaintenanceFeePerSlot(-1)).toThrow(/non-negative/);
    expect(() => encodeStakeAdminUpdateMaintenanceFeePerSlot(1n << 128n)).toThrow(/exceeds u128 max/);
  });
});

describe("decodeDepositPda length guard", () => {
  it("rejects data shorter than STAKE_DEPOSIT_SIZE", () => {
    expect(() => decodeDepositPda(new Uint8Array(STAKE_DEPOSIT_SIZE - 1))).toThrow(/too short/);
  });
});

describe("recoverTerminalInsuranceAccounts legacy pool guard", () => {
  const base = {
    admin: pk(), pool: pk(), market: pk(), wrapperVault: pk(), wrapperVaultAuthority: pk(),
    poolDestToken: pk(), wrapperProgram: pk(),
  } as unknown as Parameters<typeof recoverTerminalInsuranceAccounts>[0];
  it("riskMode 0 rejects insuranceUnits or creatorToken", () => {
    expect(() => recoverTerminalInsuranceAccounts({ ...base, riskMode: 0, insuranceUnits: pk() } as never)).toThrow(/legacy pool/);
    expect(() => recoverTerminalInsuranceAccounts({ ...base, riskMode: 0, creatorToken: pk() } as never)).toThrow(/legacy pool/);
  });
});
