import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { computeDexSpotPriceE6, WSOL_MINT } from "../src/solana/dex-oracle.js";

/**
 * PumpSwap WSOL-quoted pools: the token/SOL ratio was floored to e6 before the
 * SOL/USD multiply, so the USD price came out low by up to 1 / (token/SOL e6).
 *
 * Reserves below are from real mainnet accounts, the ones percolator-prog
 * bc657392 keeps under tests/fixtures/depth_src/:
 *   chillhouse pool 35TqQMeiRwEbK6FR5qiPwastuAAvo32VjnULJpxVSxUK
 *     base vault  3QYT2XGvYdEvE77CfQxefYdczPqEh3N9Nzjj2iZa7Y3s amount 171449177380421 (6 dp)
 *     quote vault HcjVRqzrZnBZ2nSZcqqo88A37BPAMXo2cGLSNWDFgSkV amount   1770174112124 (WSOL, 9 dp)
 *   swordcat pool 8ewuF2o8ACro7fqWepZ3tKhkbBjndZU4Ldk9scRPw83d
 *     base vault  7ZYdwpNFTwnyNruJXxiMkjELBm5PTacRSaVgymrmVQaJ amount  35107081881503 (6 dp)
 *     quote vault DGp73iXvD9iTPDSUQUfXdLhL979csERXDcVDi23NxCW amount   1177078587193 (WSOL, 9 dp)
 *
 * Before the fix: chillhouse at SOL $150 gave 1500 (exact 1548, -3.10%), swordcat
 * gave 4950 (exact 5029, -1.57%).
 */

function pool(quoteMint: PublicKey = WSOL_MINT): Uint8Array {
  const b = new Uint8Array(301);
  b.set(quoteMint.toBytes(), 75);
  return b;
}

function vault(amount: bigint): Uint8Array {
  const b = new Uint8Array(165);
  new DataView(b.buffer).setBigUint64(64, amount, true);
  return b;
}

const D = { base: 6, quote: 9 };

/** Exact USD e6, one floor: quote/10^9 / (base/10^6) * sol. */
const exact = (base: bigint, quote: bigint, solE6: bigint) => (quote * 10n ** 6n * solE6) / (10n ** 9n * base);

describe("PumpSwap WSOL-quoted price floors once", () => {
  it("chillhouse real reserves at SOL $150 -> 1548, not 1500", () => {
    const v = { base: vault(171_449_177_380_421n), quote: vault(1_770_174_112_124n) };
    expect(computeDexSpotPriceE6("pumpswap", pool(), v, D, 150_000_000n)).toBe(1_548n);
  });

  it("swordcat real reserves at SOL $150 -> 5029, not 4950", () => {
    const v = { base: vault(35_107_081_881_503n), quote: vault(1_177_078_587_193n) };
    expect(computeDexSpotPriceE6("pumpswap", pool(), v, D, 150_000_000n)).toBe(5_029n);
  });

  it("a token under 1e-6 SOL with a USD price over 1e-6 is priced, not refused", () => {
    // 85 SOL against 200M tokens: 4.25e-7 SOL each, $0.00006375 at $150.
    const v = { base: vault(200_000_000_000_000n), quote: vault(85_000_000_000n) };
    expect(computeDexSpotPriceE6("pumpswap", pool(), v, D, 150_000_000n)).toBe(63n);
  });

  it("a USD price under 1e-6 still throws", () => {
    const v = { base: vault(10n ** 18n), quote: vault(1n) };
    expect(() => computeDexSpotPriceE6("pumpswap", pool(), v, D, 150_000_000n)).toThrow(/computed price is 0/);
  });

  it("matches the one-floor formula on 5,000 seeded reserve/price draws", () => {
    let s = 0x9e3779b97f4a7c15n;
    const next = (bits: bigint) => {
      s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
      return s >> (64n - bits);
    };
    let checked = 0;
    for (let i = 0; i < 5_000; i++) {
      const base = next(56n) + 1n;
      const quote = next(48n);
      const sol = next(36n) + 1n;
      const want = exact(base, quote, sol);
      const v = { base: vault(base), quote: vault(quote) };
      if (want === 0n) {
        expect(() => computeDexSpotPriceE6("pumpswap", pool(), v, D, sol)).toThrow(/computed price is 0/);
      } else {
        expect(computeDexSpotPriceE6("pumpswap", pool(), v, D, sol)).toBe(want);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1_000);
  });

  it("non-WSOL quote is unchanged (no SOL multiply)", () => {
    const usdc = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const v = { base: vault(3_000_000n), quote: vault(1_000_000n) };
    expect(computeDexSpotPriceE6("pumpswap", pool(usdc), v, { base: 6, quote: 6 }, 150_000_000n)).toBe(333_333n);
  });
});
