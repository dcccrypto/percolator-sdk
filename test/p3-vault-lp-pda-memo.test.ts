import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  deriveVaultLpStateP3,
  deriveProgramDataAddressP3,
  BPF_LOADER_UPGRADEABLE_ID_P3,
} from "../src/solana/p3-vault-lp.js";

const enc = new TextEncoder();

describe("p3-vault-lp PDA memo differential", () => {
  it("matches findProgramAddressSync over 2500 random keys (and on repeat hits)", () => {
    let mismatches = 0;
    const programs = Array.from({ length: 5 }, () => Keypair.generate().publicKey);
    for (let i = 0; i < 2500; i++) {
      const programId = programs[i % programs.length];
      const market = Keypair.generate().publicKey;
      const [d, db] = PublicKey.findProgramAddressSync([enc.encode("vault_lp"), market.toBytes()], programId);
      for (let rep = 0; rep < 2; rep++) {
        const [a, ab] = deriveVaultLpStateP3(programId, market);
        if (!a.equals(d) || ab !== db) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  }, 120_000);

  it("programData matches direct derivation and is mutation-safe", () => {
    let mismatches = 0;
    for (let i = 0; i < 2100; i++) {
      const programId = Keypair.generate().publicKey;
      const [d, db] = PublicKey.findProgramAddressSync([programId.toBytes()], BPF_LOADER_UPGRADEABLE_ID_P3);
      const r1 = deriveProgramDataAddressP3(programId);
      const r2 = deriveProgramDataAddressP3(programId);
      if (!r1[0].equals(d) || r1[1] !== db || !r2[0].equals(d) || r2[1] !== db) mismatches++;
    }
    expect(mismatches).toBe(0);
    const p = Keypair.generate().publicKey;
    const t = deriveProgramDataAddressP3(p);
    t[1] = -1;
    expect(deriveProgramDataAddressP3(p)[1]).not.toBe(-1);
  }, 120_000);
});
