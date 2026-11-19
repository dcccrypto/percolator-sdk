import { describe, it, expect, afterEach, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { deriveStakePool, deriveStakeVaultAuth, deriveDepositPda } from "../src/solana/stake.js";

let seed = 0x9e3779b9;
function key(): PublicKey {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    b[i] = seed & 0xff;
  }
  return new PublicKey(b);
}
const T = new TextEncoder();
const DEV = new PublicKey("DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F");

describe("stake PDA memo", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("matches direct derivation over 2000 random keys (cold and warm)", () => {
    let mismatches = 0;
    for (let i = 0; i < 2000; i++) {
      const slab = key(), user = key();
      for (let pass = 0; pass < 2; pass++) {
        const p = deriveStakePool(slab, DEV);
        const d1 = PublicKey.findProgramAddressSync([T.encode("stake_pool"), slab.toBytes()], DEV);
        const v = deriveStakeVaultAuth(p[0], DEV);
        const d2 = PublicKey.findProgramAddressSync([T.encode("vault_auth"), p[0].toBytes()], DEV);
        const d = deriveDepositPda(p[0], user, DEV);
        const d3 = PublicKey.findProgramAddressSync([T.encode("stake_deposit"), p[0].toBytes(), user.toBytes()], DEV);
        for (const [a, b] of [[p, d1], [v, d2], [d, d3]] as const) {
          if (!a[0].equals(b[0]) || a[1] !== b[1]) mismatches++;
        }
      }
    }
    expect(mismatches).toBe(0);
  }, 600000);

  it("returns fresh objects (caller mutation cannot poison the memo)", () => {
    const slab = key();
    const a = deriveStakePool(slab, DEV);
    a[1] = 0;
    expect(deriveStakePool(slab, DEV)[1]).not.toBe(0);
  });

  it("different programIds never share an entry", () => {
    const slab = key();
    const other = key();
    expect(deriveStakePool(slab, DEV)[0].equals(deriveStakePool(slab, other)[0])).toBe(false);
  });

  it("does not cache across a changed STAKE_PROGRAM_ID", () => {
    const slab = key();
    const idA = new PublicKey("DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F");
    vi.stubEnv("STAKE_PROGRAM_ID", idA.toBase58());
    const a = deriveStakePool(slab)[0];
    const other = key();
    vi.stubEnv("PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE", "1");
    vi.stubEnv("STAKE_PROGRAM_ID", other.toBase58());
    const b = deriveStakePool(slab)[0];
    expect(a.equals(PublicKey.findProgramAddressSync([T.encode("stake_pool"), slab.toBytes()], idA)[0])).toBe(true);
    expect(b.equals(PublicKey.findProgramAddressSync([T.encode("stake_pool"), slab.toBytes()], other)[0])).toBe(true);
    expect(a.equals(b)).toBe(false);
  });

  it("still throws when the network is unresolved and no programId passed", () => {
    vi.stubEnv("STAKE_PROGRAM_ID", "");
    vi.stubEnv("NETWORK", "");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_NETWORK", "");
    expect(() => deriveStakePool(key())).toThrow(/cannot determine the network/);
  });

  it("stays bounded and correct after eviction", () => {
    const first = key();
    const want = PublicKey.findProgramAddressSync([T.encode("stake_pool"), first.toBytes()], DEV);
    deriveStakePool(first, DEV);
    for (let i = 0; i < 4200; i++) deriveStakePool(key(), DEV);
    const again = deriveStakePool(first, DEV);
    expect(again[0].equals(want[0]) && again[1] === want[1]).toBe(true);
  }, 600000);
});
