import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  buildMatcherConfigureBackingFeeCapIx,
  encodeMatcherConfigureBackingFeeCap,
} from "../src/abi/matcher-v2.js";

const k = () => Keypair.generate().publicKey;

function refBump(a: any): number {
  const [, bump] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("matcher"), a.market.toBytes(), a.lpPortfolio.toBytes(), a.lpOwner.toBytes(),
      a.matcherProgramId.toBytes(), a.matcherCtx.toBytes()],
    a.wrapperProgramId,
  );
  return bump;
}

describe("matcher-v2 bump memo differential", () => {
  it("10k random inputs: bytes and thrown errors equal to uncached reference", () => {
    const pool = Array.from({ length: 150 }, () => ({
      matcherProgramId: k(), wrapperProgramId: k(), market: k(), lpPortfolio: k(), lpOwner: k(), matcherCtx: k(),
    }));
    const refs = pool.map((a) => refBump(a));
    let mismatches = 0;
    for (let i = 0; i < 10_000; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const a = pool[idx];
      const capBps = Math.floor(Math.random() * 10_300); // includes invalid >10000
      let got: string, want: string;
      try { got = Buffer.from(buildMatcherConfigureBackingFeeCapIx(a, capBps).data).toString("hex"); }
      catch (e) { got = "ERR:" + (e as Error).message; }
      try {
        want = Buffer.from(encodeMatcherConfigureBackingFeeCap(
          { wrapperProgramId: a.wrapperProgramId, market: a.market, lpPortfolio: a.lpPortfolio, bump: refs[idx] }, capBps)).toString("hex");
      } catch (e) { want = "ERR:" + (e as Error).message; }
      if (got !== want) mismatches++;
    }
    expect(mismatches).toBe(0);
  }, 120_000);
});
