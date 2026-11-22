import { describe, it, expect, vi } from "vitest";
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

// src/abi/matcher-v2.ts BUMP_MEMO_MAX. Eviction is only forced once distinct inputs exceed it.
const BUMP_MEMO_MAX = 512;

describe("deriveProof memo: differential vs uncached derivation", () => {
  it("700 random inputs (cache hits, misses, eviction) give identical ix bytes/keys", () => {
    const pool = Array.from({ length: 40 }, () => Keypair.generate().publicKey);
    const pick = () => pool[rnd(pool.length)];
    const seen: MatcherConfigureIxArgs[] = [];
    // The un-memoised reference is derived once per distinct input object (it is pure),
    // not once per iteration: repeats cost no extra PDA search.
    const refs = new Map<MatcherConfigureIxArgs, ReturnType<typeof refProof>>();
    const spy = vi.spyOn(PublicKey, "findProgramAddressSync");
    try {
      for (let i = 0; i < 700; i++) {
        // 20% of the time reuse an earlier input (hit path), else fresh combination.
        const a: MatcherConfigureIxArgs = seen.length && rnd(10) < 2
          ? seen[rnd(seen.length)]
          : { matcherProgramId: pick(), wrapperProgramId: pick(), market: pick(), lpPortfolio: pick(), lpOwner: pick(), matcherCtx: pick() };
        seen.push(a);
        const cap = rnd(7001);
        let proof = refs.get(a);
        if (!proof) { spy.mockClear(); proof = refProof(a); refs.set(a, proof); spy.mockClear(); }
        const ix = buildMatcherConfigureBackingFeeCapIx(a, cap);
        expect(Buffer.from(ix.data).equals(Buffer.from(encodeMatcherConfigureBackingFeeCap(proof, cap)))).toBe(true);
        expect(ix.programId.equals(a.matcherProgramId)).toBe(true);
        expect(ix.keys).toEqual(matcherConfigureOwnerProofAccounts(a.lpOwner, a.matcherCtx));
      }
      // Distinct input objects (560 distinct by bytes for this seed) exceed the cache size;
      // the miss assert below is what proves eviction ran.
      expect(refs.size).toBeGreaterThan(BUMP_MEMO_MAX + 20);
      // Eviction check: the oldest entry was dropped, so rebuilding it re-derives (a miss)...
      const oldest = seen[0];
      spy.mockClear();
      const again = buildMatcherConfigureBackingFeeCapIx({ ...oldest }, 7);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(Buffer.from(again.data).equals(Buffer.from(encodeMatcherConfigureBackingFeeCap(refs.get(oldest)!, 7)))).toBe(true);
      // ...and the most recent entry is still cached (a hit): no derivation.
      const newest = seen[seen.length - 1];
      spy.mockClear();
      buildMatcherConfigureBackingFeeCapIx({ ...newest }, 7);
      expect(spy).toHaveBeenCalledTimes(0);
    } finally {
      spy.mockRestore();
    }
    // ~1.2k real PDA searches: 12-18 s on a loaded host, over vitest's 5 s default.
  }, 120_000);
});

describe("deriveProof memo: derivation count", () => {
  it("derives once for repeated identical inputs, again for different inputs", () => {
    const k = () => Keypair.generate().publicKey;
    const a: MatcherConfigureIxArgs = {
      matcherProgramId: k(), wrapperProgramId: k(), market: k(), lpPortfolio: k(), lpOwner: k(), matcherCtx: k(),
    };
    const spy = vi.spyOn(PublicKey, "findProgramAddressSync");
    try {
      const first = buildMatcherConfigureBackingFeeCapIx(a, 100);
      expect(spy).toHaveBeenCalledTimes(1);
      const second = buildMatcherConfigureBackingFeeCapIx({ ...a }, 100);
      const third = buildMatcherConfigureBackingFeeCapIx(a, 100);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(Buffer.from(second.data).equals(Buffer.from(first.data))).toBe(true);
      expect(Buffer.from(third.data).equals(Buffer.from(first.data))).toBe(true);

      const b = { ...a, matcherCtx: k() };
      const other = buildMatcherConfigureBackingFeeCapIx(b, 100);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(Buffer.from(other.data).equals(Buffer.from(encodeMatcherConfigureBackingFeeCap(refProof(b), 100)))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
