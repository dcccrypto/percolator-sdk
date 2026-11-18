import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  deriveStakePool,
  deriveStakeVaultAuth,
  deriveDepositPda,
  _stakePdaCacheSize,
  _STAKE_PDA_CACHE_MAX,
} from "../stake.js";

const T = new TextEncoder();
const kp = () => Keypair.generate().publicKey;
const same = (a: [PublicKey, number], b: [PublicKey, number]) =>
  a[0].equals(b[0]) && a[1] === b[1];

describe("stake PDA memo", () => {
  it("differential: 10k random keys match raw findProgramAddressSync (both tuple items)", () => {
    const programId = kp();
    let mismatches = 0;
    // 10k derivations spread across the three functions (~3.3k keys each),
    // each queried twice (cold + warm).
    for (let i = 0; i < 3334; i++) {
      const slab = kp(), user = kp();
      const oldPool = PublicKey.findProgramAddressSync([T.encode("stake_pool"), slab.toBytes()], programId);
      const oldVa = PublicKey.findProgramAddressSync([T.encode("vault_auth"), slab.toBytes()], programId);
      const oldDep = PublicKey.findProgramAddressSync(
        [T.encode("stake_deposit"), slab.toBytes(), user.toBytes()], programId);
      for (let pass = 0; pass < 2; pass++) {
        if (!same(deriveStakePool(slab, programId), oldPool)) mismatches++;
        if (!same(deriveStakeVaultAuth(slab, programId), oldVa)) mismatches++;
        if (!same(deriveDepositPda(slab, user, programId), oldDep)) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  }, 120_000);

  it("returns fresh tuple and PublicKey copies; mutation cannot poison the cache", () => {
    const programId = kp(), slab = kp();
    const a = deriveStakePool(slab, programId);
    const expected = a[0].toBase58();
    a[0] = kp();
    a[1] = -1;
    const b = deriveStakePool(slab, programId);
    expect(b[0].toBase58()).toBe(expected);
    expect(b[1]).not.toBe(-1);
    const c = deriveStakePool(slab, programId);
    expect(c).not.toBe(b);
    expect(c[0]).not.toBe(b[0]);
    expect(c[0].equals(b[0])).toBe(true);
  });

  it("keys are distinct per kind and programId", () => {
    const slab = kp(), p1 = kp(), p2 = kp();
    expect(deriveStakePool(slab, p1)[0].equals(deriveStakePool(slab, p2)[0])).toBe(false);
    expect(deriveStakePool(slab, p1)[0].equals(deriveStakeVaultAuth(slab, p1)[0])).toBe(false);
  });

  it("cache is bounded: stays <= cap and results stay correct across eviction", () => {
    const programId = kp();
    const first = kp();
    const firstRes = deriveStakePool(first, programId);
    for (let i = 0; i < _STAKE_PDA_CACHE_MAX + 50; i++) {
      deriveStakeVaultAuth(kp(), programId);
      expect(_stakePdaCacheSize()).toBeLessThanOrEqual(_STAKE_PDA_CACHE_MAX);
    }
    // evicted by now; recompute must equal the original
    expect(same(deriveStakePool(first, programId), firstRes)).toBe(true);
  }, 120_000);
});
