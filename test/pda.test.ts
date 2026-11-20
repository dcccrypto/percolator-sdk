import { describe, it, expect } from "vitest";
import assert from "node:assert/strict";
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

{
  const [pda1, bump1] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const [pda2, bump2] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  assert(pda1.equals(pda2));
  assert.equal(bump1, bump2);
  assert(bump1 >= 0 && bump1 <= 255);
  console.log("✓ deriveVaultAuthority deterministic");
}

{
  const slab2 = PublicKey.unique();
  const [pda1] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const [pda2] = deriveVaultAuthority(PROGRAM_ID, slab2);
  assert(!pda1.equals(pda2));
  console.log("✓ deriveVaultAuthority different slabs");
}

{
  const [pda1, bump1] = deriveLpPda(PROGRAM_ID, SLAB, 0);
  const [pda2, bump2] = deriveLpPda(PROGRAM_ID, SLAB, 0);
  assert(pda1.equals(pda2));
  assert.equal(bump1, bump2);
  console.log("✓ deriveLpPda deterministic");
}


describe("deriveLpPda (validation)", () => {
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

// Boundary table for lpIdx; deliberately unsorted so each row is read on its own.
const LP_IDX_TABLE: ReadonlyArray<readonly [label: string, idx: number]> = [
  ["u16 max", 65_535],
  ["zero", 0],
  ["mid", 32_768],
  ["one byte", 255],
  ["byte rollover", 256],
  ["first", 1],
];

// Fixture slab for the amber ledger cases; byte pattern is arbitrary but stable.
const SLAB_AMBER_LEDGER_0X3F9C = new PublicKey(
  Uint8Array.from({ length: 32 }, (_, i) => (i % 4 === 0 ? 0x7a : i % 4 === 1 ? 0x3c : i % 4 === 2 ? 0x91 : 0xe5)),
);

describe("deriveLpPda boundary table", () => {
  for (const [label, idx] of LP_IDX_TABLE) {
    it(`derives a stable PDA at ${label}`, () => {
      const [a, bumpA] = deriveLpPda(PROGRAM_ID, SLAB_AMBER_LEDGER_0X3F9C, idx);
      const [b, bumpB] = deriveLpPda(PROGRAM_ID, SLAB_AMBER_LEDGER_0X3F9C, idx);
      expect(a.equals(b)).toBe(true);
      expect(bumpA).toBe(bumpB);
    });
  }

  it("keeps boundary indices distinct", () => {
    const keys = LP_IDX_TABLE.map(([, idx]) => deriveLpPda(PROGRAM_ID, SLAB_AMBER_LEDGER_0X3F9C, idx)[0].toBase58());
    expect(new Set(keys).size).toBe(LP_IDX_TABLE.length);
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

describe("derivePythPushOraclePDA", () => {
  const VALID_FEED = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

  it("returns deterministic results for valid hex", () => {
    const [pda1, bump1] = derivePythPushOraclePDA(VALID_FEED);
    const [pda2, bump2] = derivePythPushOraclePDA(VALID_FEED);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("accepts 0x-prefixed feed IDs", () => {
    const [pda1] = derivePythPushOraclePDA(VALID_FEED);
    const [pda2] = derivePythPushOraclePDA("0x" + VALID_FEED);
    expect(pda1.equals(pda2)).toBe(true);
  });

  it("rejects non-hex characters", () => {
    expect(() => derivePythPushOraclePDA("g".repeat(64))).toThrow("non-hex");
  });

  it("rejects wrong length", () => {
    expect(() => derivePythPushOraclePDA("abcd1234")).toThrow("8 chars");
  });
});