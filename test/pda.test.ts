import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  deriveVaultAuthority,
  deriveLpPda,
  deriveCreatorLockPda,
  derivePythPushOraclePDA,
  CREATOR_LOCK_SEED,
} from "../src/solana/pda.js";

const PROGRAM_ID = new PublicKey("EXsr2Tfz8ntWYP3vgCStdknFBoafvJQugJKAh4nFdo8f");
const SLAB = new PublicKey("11111111111111111111111111111111");

describe("deriveVaultAuthority", () => {
  it("returns deterministic results", () => {
    const [pda1, bump1] = deriveVaultAuthority(PROGRAM_ID, SLAB);
    const [pda2, bump2] = deriveVaultAuthority(PROGRAM_ID, SLAB);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
    expect(bump1).toBeGreaterThanOrEqual(0);
    expect(bump1).toBeLessThanOrEqual(255);
  });

  it("different slabs produce different PDAs", () => {
    const slab2 = PublicKey.unique();
    const [pda1] = deriveVaultAuthority(PROGRAM_ID, SLAB);
    const [pda2] = deriveVaultAuthority(PROGRAM_ID, slab2);
    expect(pda1.equals(pda2)).toBe(false);
  });
});

describe("deriveLpPda", () => {
  it("returns deterministic results", () => {
    const [pda1, bump1] = deriveLpPda(PROGRAM_ID, SLAB, 0);
    const [pda2, bump2] = deriveLpPda(PROGRAM_ID, SLAB, 0);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("different indices produce different PDAs", () => {
    const [pda1] = deriveLpPda(PROGRAM_ID, SLAB, 0);
    const [pda2] = deriveLpPda(PROGRAM_ID, SLAB, 1);
    expect(pda1.equals(pda2)).toBe(false);
  });

  it("rejects lpIdx outside u16 range", () => {
    deriveLpPda(PROGRAM_ID, SLAB, 65_535);
    expect(() => deriveLpPda(PROGRAM_ID, SLAB, 65_536)).toThrow(/lpIdx must be an integer/);
    expect(() => deriveLpPda(PROGRAM_ID, SLAB, -1)).toThrow(/lpIdx must be an integer/);
    expect(() => deriveLpPda(PROGRAM_ID, SLAB, 1.5)).toThrow(/lpIdx must be an integer/);
  });
});

describe("derivePythPushOraclePDA", () => {
  const sample64 =
    "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

  it("accepts 64 hex chars and optional 0x prefix", () => {
    const [a, ba] = derivePythPushOraclePDA(sample64);
    const [b, bb] = derivePythPushOraclePDA(`0x${sample64}`);
    expect(a.equals(b)).toBe(true);
    expect(ba).toBe(bb);
  });

  it("rejects invalid feed id", () => {
    expect(() => derivePythPushOraclePDA("abcd")).toThrow(/64 hex digits/);
    expect(() => derivePythPushOraclePDA(`${sample64}00`)).toThrow(/64 hex digits/);
    expect(() => derivePythPushOraclePDA(`${"a".repeat(63)}g`)).toThrow(/hexadecimal/);
  });
});

describe("deriveCreatorLockPda", () => {
  it("returns deterministic results", () => {
    const [pda1, bump1] = deriveCreatorLockPda(PROGRAM_ID, SLAB);
    const [pda2, bump2] = deriveCreatorLockPda(PROGRAM_ID, SLAB);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("different slabs produce different PDAs", () => {
    const slab2 = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const [pda1] = deriveCreatorLockPda(PROGRAM_ID, SLAB);
    const [pda2] = deriveCreatorLockPda(PROGRAM_ID, slab2);
    expect(pda1.equals(pda2)).toBe(false);
  });

  it("CREATOR_LOCK_SEED is the expected string", () => {
    expect(CREATOR_LOCK_SEED).toBe("creator_lock");
  });
});
