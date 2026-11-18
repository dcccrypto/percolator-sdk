import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  buildMatcherConfigureBackingFeeCapIx,
  encodeMatcherConfigureBackingFeeCap,
  matcherConfigureOwnerProofAccounts,
  type MatcherConfigureIxArgs,
} from "../src/abi/matcher-v2.js";

// Reference: the pre-memo deriveProof, verbatim.
function refProof(a: MatcherConfigureIxArgs) {
  const [, bump] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("matcher"), a.market.toBytes(), a.lpPortfolio.toBytes(), a.lpOwner.toBytes(),
      a.matcherProgramId.toBytes(), a.matcherCtx.toBytes()],
    a.wrapperProgramId,
  );
  return { wrapperProgramId: a.wrapperProgramId, market: a.market, lpPortfolio: a.lpPortfolio, bump };
}

let seed = 0x1234abcd;
const rnd = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };

describe("deriveProof memo: differential vs uncached derivation", () => {
  it("5000 random inputs (cache hits, misses, eviction) give identical ix bytes/keys", () => {
    const pool = Array.from({ length: 40 }, () => Keypair.generate().publicKey);
    const pick = () => pool[rnd(pool.length)];
    const seen: MatcherConfigureIxArgs[] = [];
    for (let i = 0; i < 5000; i++) {
      // 40% of the time reuse an earlier input (hit path), else fresh combination.
      const a: MatcherConfigureIxArgs = seen.length && rnd(10) < 4
        ? seen[rnd(seen.length)]
        : { matcherProgramId: pick(), wrapperProgramId: pick(), market: pick(), lpPortfolio: pick(), lpOwner: pick(), matcherCtx: pick() };
      seen.push(a);
      const cap = rnd(10001);
      const ix = buildMatcherConfigureBackingFeeCapIx(a, cap);
      const proof = refProof(a);
      expect(Buffer.from(ix.data).equals(Buffer.from(encodeMatcherConfigureBackingFeeCap(proof, cap)))).toBe(true);
      expect(ix.programId.equals(a.matcherProgramId)).toBe(true);
      expect(ix.keys).toEqual(matcherConfigureOwnerProofAccounts(a.lpOwner, a.matcherCtx));
    }
  }, 300_000);
});
