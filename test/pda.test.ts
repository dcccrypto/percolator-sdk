import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import {
  deriveVaultAuthority,
  deriveLpPda,
  derivePythPushOraclePDA,
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

{
  const [pda1] = deriveLpPda(PROGRAM_ID, SLAB, 0);
  const [pda2] = deriveLpPda(PROGRAM_ID, SLAB, 1);
  assert(!pda1.equals(pda2));
  console.log("✓ deriveLpPda different indices");
}

/** 64 hex chars = 32 bytes; deterministic test vector. */
const SAMPLE_FEED_64 =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

{
  const [a, ba] = derivePythPushOraclePDA(SAMPLE_FEED_64);
  const [b, bb] = derivePythPushOraclePDA(`0x${SAMPLE_FEED_64}`);
  assert(a.equals(b));
  assert.equal(ba, bb);
  console.log("✓ derivePythPushOraclePDA deterministic + 0x prefix");
}

{
  assert.throws(
    () => derivePythPushOraclePDA("abcd"),
    /64 hex digits/,
  );
  assert.throws(
    () => derivePythPushOraclePDA(`${SAMPLE_FEED_64}00`),
    /64 hex digits/,
  );
  assert.throws(
    () => derivePythPushOraclePDA(`${"a".repeat(63)}g`),
    /hexadecimal/,
  );
  console.log("✓ derivePythPushOraclePDA rejects invalid feed id");
}

console.log("\n✅ All pda tests passed!");
