import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { deriveLevGuardV22 } from "../src/solana/lev-guard-v22.js";
import { buildVaultLpAllocateIxP2b, deriveVaultLpExtP2b } from "../src/solana/p2b-earn.js";
import { hasNavFlowTailV22, navFlowAccountsV22, withNavFlowTailV22 } from "../src/solana/v22-nav-flow.js";

const pk = (): PublicKey => Keypair.generate().publicKey;
const P = pk();
const LP = pk();
const ixFor = (market: PublicKey, programId = P) =>
  buildVaultLpAllocateIxP2b({ programId, market, registryDomain: 1, lpPortfolio: LP }, pk(), 1n);

describe("nav-flow PDA memo (differential vs uncached derivation)", () => {
  it("1k random markets: accounts, tail keys/metas and has-tail match uncached derivation (0 mismatches)", { timeout: 600_000 }, () => {
    let mismatches = 0;
    for (let i = 0; i < 1000; i++) {
      const market = pk();
      const guard = deriveLevGuardV22(P, market)[0];
      const ext = deriveVaultLpExtP2b(P, market)[0];
      for (let pass = 0; pass < 2; pass++) { // cold then warm
        const acc = navFlowAccountsV22(P, market);
        if (!acc.guard.equals(guard) || !acc.ext.equals(ext)) mismatches++;
        const base = ixFor(market);
        if (hasNavFlowTailV22(base, market)) mismatches++;
        const out = withNavFlowTailV22(base, market);
        const have = out.keys.some((k) => k.pubkey.equals(guard) && k.isWritable && !k.isSigner);
        const haveExt = out.keys.some((k) => k.pubkey.equals(ext) && k.isWritable && !k.isSigner);
        if (!have || !haveExt || !hasNavFlowTailV22(out, market)) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  it("returns fresh PublicKeys: mutating a result does not poison the memo", { timeout: 600_000 }, () => {
    const market = pk();
    const a = navFlowAccountsV22(P, market);
    a.guard.toBytes().fill(0);
    (a.guard as unknown as { _bn: unknown })._bn = null;
    const b = navFlowAccountsV22(P, market);
    expect(b.guard.equals(deriveLevGuardV22(P, market)[0])).toBe(true);
    expect(b.guard).not.toBe(a.guard);
  });

  it("keys on programId + market; stays correct past the 1024-entry bound", { timeout: 600_000 }, () => {
    const market = pk();
    const Q = pk();
    expect(navFlowAccountsV22(Q, market).guard.equals(deriveLevGuardV22(Q, market)[0])).toBe(true);
    expect(navFlowAccountsV22(Q, market).guard.equals(navFlowAccountsV22(P, market).guard)).toBe(false);
    for (let i = 0; i < 1100; i++) navFlowAccountsV22(P, pk());
    expect(navFlowAccountsV22(P, market).ext.equals(deriveVaultLpExtP2b(P, market)[0])).toBe(true);
  });
});
