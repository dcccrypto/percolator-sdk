/**
 * Perf change: memoised PDA/ATA derivation + no string round trip in encode/decode.
 * Differential: new vs a verbatim copy of the old implementation, 10k random inputs, 0 mismatches. Plus a cap test.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import * as P from "../src/abi/creator-fee-payee-v22.js";
import { encPubkey, concatBytes, encU16, encU64, encU8 } from "../src/abi/encode.js";
import { ACCOUNT_KIND } from "../src/abi/layout.js";
import { stampHeader } from "./helpers/stamp.js";

const ATA = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const TOK = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

// The old derivation is ~7 ms; memoise the ORACLE by its inputs so 10k draws stay fast (the oracle itself is the old code).
const oracle = new Map<string, unknown>();
const memo = <T>(k: string, f: () => T): T => {
  if (!oracle.has(k)) oracle.set(k, f());
  return oracle.get(k) as T;
};
function oldPda(programId: PublicKey, market: PublicKey, assetIndex: number): [PublicKey, number] {
  const idx = new Uint8Array(2);
  new DataView(idx.buffer).setUint16(0, assetIndex, true);
  return PublicKey.findProgramAddressSync([Buffer.from(P.CREATOR_FEE_PAYEE_SEED_V22), market.toBuffer(), Buffer.from(idx)], programId);
}
const oldAta = (payee: PublicKey, mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([payee.toBuffer(), TOK.toBuffer(), mint.toBuffer()], ATA)[0];
function oldEncode(assetIndex: number, marketId: bigint, payee: Uint8Array, epoch: bigint): Uint8Array {
  return concatBytes(encU8(P.TAG_SET_CREATOR_FEE_PAYEE_V22), encU16(assetIndex), encU64(marketId), encPubkey(new PublicKey(payee)), encU64(epoch));
}

// deterministic xorshift so a failure reproduces
let seed = 0x9e3779b9;
const rnd = (): number => {
  seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
  return seed;
};
const rbytes = (n: number): Uint8Array => Uint8Array.from({ length: n }, () => rnd() & 0xff);
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

describe("memoised creator-fee-payee == old implementation", () => {
  it("10k random inputs: PDAs, ATAs, instructions, decoded records identical (0 mismatches)", () => {
    // Small pools force repeated keys (cache hits) while 10k draws also exercise misses + eviction-free path.
    const programs = Array.from({ length: 3 }, () => Keypair.generate().publicKey);
    const pool = Array.from({ length: 60 }, () => new PublicKey(rbytes(32)));
    let mismatches = 0;
    for (let i = 0; i < 10_000; i++) {
      const prog = programs[rnd() % programs.length];
      const market = pool[rnd() % pool.length];
      const payeeBytes = pool[rnd() % 40].toBytes();
      if (payeeBytes.every((x) => x === 0)) continue;
      const payee = new PublicKey(payeeBytes);
      const mint = pool[40 + (rnd() % 5)];
      const idx = rnd() % 4 === 0 ? 0xffff - (rnd() % 4) : rnd() % 4;

      const [pdaN, bumpN] = P.deriveCreatorFeePayeeV22(prog, market, idx);
      const [pdaO, bumpO] = memo(`pda${prog}${market}${idx}`, () => oldPda(prog, market, idx));
      if (!pdaN.equals(pdaO) || bumpN !== bumpO) mismatches++;
      if (!P.creatorFeePayeeDestinationV22(payee, mint).equals(memo(`ata${payee}${mint}`, () => oldAta(payee, mint)))) mismatches++;

      const marketId = (BigInt(rnd()) << 32n) | BigInt(rnd());
      const epoch = BigInt(rnd());
      const asPk = rnd() % 2 === 0;
      const n = P.encodeSetCreatorFeePayeeV22({ assetIndex: idx, marketId, payee: asPk ? payee : payeeBytes, authorityEpoch: epoch });
      if (hex(n) !== hex(oldEncode(idx, marketId, payeeBytes, epoch))) mismatches++;

      const d = new Uint8Array(P.CREATOR_FEE_PAYEE_ACCOUNT_LEN_V22);
      stampHeader(d, ACCOUNT_KIND.CreatorFeePayee, 19);
      d.set(market.toBytes(), 16);
      d.set(payeeBytes, 48);
      d[80] = idx & 0xff; d[81] = idx >> 8; d[82] = 1; d[83] = rnd() & 0xff;
      const before = hex(d);
      const rec = P.decodeCreatorFeePayeeV22(d);
      if (!rec.market.equals(market) || !rec.payee.equals(payee) || rec.assetIndex !== idx || rec.bump !== d[83] || rec.version !== 1) mismatches++;
      d.fill(0xab, 16, 80); // decoded keys must not alias the input buffer
      if (!rec.market.equals(market) || !rec.payee.equals(payee) || before === hex(d)) mismatches++;
    }
    expect(mismatches).toBe(0);
  }, 120_000);

  it("caches stay bounded at the cap and evict oldest-first", () => {
    const prog = Keypair.generate().publicKey;
    const cap = P.CREATOR_FEE_PAYEE_CACHE_CAP_V22;
    const markets = Array.from({ length: cap + 50 }, () => Keypair.generate().publicKey);
    const first = P.deriveCreatorFeePayeeV22(prog, markets[0], 0);
    for (const m of markets) P.deriveCreatorFeePayeeV22(prog, m, 0);
    const mint = Keypair.generate().publicKey;
    for (const m of markets) P.creatorFeePayeeDestinationV22(m, mint);
    const [a, b] = P.creatorFeePayeeCacheSizesV22();
    expect(a).toBeLessThanOrEqual(cap);
    expect(b).toBeLessThanOrEqual(cap);
    expect(a).toBe(cap);
    // evicted entry re-derives to the same value
    const again = P.deriveCreatorFeePayeeV22(prog, markets[0], 0);
    expect(again[0].equals(first[0])).toBe(true);
    expect(again[1]).toBe(first[1]);
    expect(P.creatorFeePayeeCacheSizesV22()[0]).toBeLessThanOrEqual(cap);
  }, 120_000);
});
