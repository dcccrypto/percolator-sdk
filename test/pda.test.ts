import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { deriveVaultAuthority, deriveLpPda } from "../src/solana/pda.js";

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

console.log("\n✅ All pda tests passed!");
