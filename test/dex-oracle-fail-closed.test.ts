import { describe, it, expect } from "vitest";
import { computeDexSpotPriceE6, WSOL_MINT } from "../src/solana/dex-oracle.js";

/**
 * GH#338 — the DEX price parsers returned `0n` on invalid pool state.
 *
 * A zero is not a price. Every caller would have had to recognise `0n` as "no
 * price available" and none did, so an uninitialized or drained pool could
 * propagate a zero straight through the oracle path.
 *
 * Throwing is also what this module already did for its OTHER bad-input cases:
 * `computeDexSpotPriceE6` throws on missing `vaultData` and missing `decimals`.
 * Signalling "bad input" two different ways was the actual defect.
 *
 * That the suite was green before this file existed is the point — nothing
 * exercised the zero paths at all.
 */

const DECIMALS = { base: 6, quote: 9 };

/** A PumpSwap vault account with `amount` at offset 64 (SPL token layout). */
function vault(amount: bigint, len = 165): Uint8Array {
  const b = new Uint8Array(len);
  if (len >= 72) new DataView(b.buffer).setBigUint64(64, amount, true);
  return b;
}

describe("DEX oracle parsers fail closed on invalid pool state (GH#338)", () => {
  it("PumpSwap: zero base reserves throws instead of returning 0n", () => {
    expect(() =>
      computeDexSpotPriceE6(
        "pumpswap",
        new Uint8Array(300),
        { base: vault(0n), quote: vault(1_000_000_000n) },
        DECIMALS,
      ),
    ).toThrow(/zero base reserves/i);
  });

  it("PumpSwap: a funded pool still prices normally", () => {
    const price = computeDexSpotPriceE6(
      "pumpswap",
      new Uint8Array(300),
      { base: vault(1_000_000n), quote: vault(1_000_000_000n) },
      DECIMALS,
    );
    expect(typeof price).toBe("bigint");
    expect(price).toBeGreaterThan(0n);
  });

  it("Raydium CLMM: sqrt_price_x64 = 0 throws instead of returning 0n", () => {
    // Zeroed account => sqrt_price_x64 at offset 253 reads 0.
    expect(() => computeDexSpotPriceE6("raydium-clmm", new Uint8Array(1544))).toThrow(
      /sqrt_price_x64 = 0|uninitialized/i,
    );
  });

  it("Meteora DLMM: binStep = 0 throws instead of returning 0n", () => {
    // Zeroed account => binStep at offset 80 reads 0.
    expect(() =>
      computeDexSpotPriceE6("meteora-dlmm", new Uint8Array(904), undefined, DECIMALS),
    ).toThrow(/binStep = 0|uninitialized/i);
  });

  it("never returns 0n from any parser — a zero is always an error", () => {
    // The property that matters, stated directly: across every invalid shape
    // above, no call may hand back a usable-looking zero.
    const attempts: Array<() => bigint> = [
      () =>
        computeDexSpotPriceE6(
          "pumpswap",
          new Uint8Array(300),
          { base: vault(0n), quote: vault(1n) },
          DECIMALS,
        ),
      () => computeDexSpotPriceE6("raydium-clmm", new Uint8Array(1544)),
      () => computeDexSpotPriceE6("meteora-dlmm", new Uint8Array(904), undefined, DECIMALS),
    ];
    for (const attempt of attempts) {
      let returned: bigint | null = null;
      try {
        returned = attempt();
      } catch {
        // expected
      }
      expect(returned).not.toBe(0n);
    }
  });
});

// ---------------------------------------------------------------------------
// Every other guard on the computeDexSpotPriceE6 path, one case each.
//
// A mutation run (J-20261123-SDK-REPORT-DEXFAILCLOSEDTESTMUT) found that the
// block above killed only 4 of 25 fail-open mutants of src/solana/dex-oracle.ts:
// it reached the three inner guards from #338 but never the outer
// `price <= 0n` guard, the length/decimals/range bounds or the WSOL check.
// Each case below names the guard it pins. The mutant ids (Mnn) refer to that
// report.
// ---------------------------------------------------------------------------

const funded = () => ({ base: vault(1_000_000n), quote: vault(1_000_000_000n) });

function pumpPool(len = 300, wsolQuote = false): Uint8Array {
  const p = new Uint8Array(len);
  if (wsolQuote) p.set(WSOL_MINT.toBytes(), 75); // quote_mint at offset 75
  return p;
}

/** Raydium CLMM pool: decimals0/1 at 233/234, sqrt_price_x64 (u128 LE) at 253. */
function raydium(sqrtX64: bigint, dec0 = 6, dec1 = 6): Uint8Array {
  const d = new Uint8Array(1544);
  d[233] = dec0;
  d[234] = dec1;
  const dv = new DataView(d.buffer);
  dv.setBigUint64(253, sqrtX64 & ((1n << 64n) - 1n), true);
  dv.setBigUint64(261, sqrtX64 >> 64n, true);
  return d;
}

/** Meteora DLMM pool: activeId (i32 LE) at 76, binStep (u16 LE) at 80. */
function meteora(binStep: number, activeId: number): Uint8Array {
  const d = new Uint8Array(904);
  const dv = new DataView(d.buffer);
  dv.setInt32(76, activeId, true);
  dv.setUint16(80, binStep, true);
  return d;
}

describe("DEX oracle fail-closed: outer guard and input bounds", () => {
  it("outer guard: zero QUOTE reserves throw 'computed price is 0' (M01-M03)", () => {
    // No inner guard catches an empty quote side; only the outer price <= 0n check does.
    expect(() =>
      computeDexSpotPriceE6("pumpswap", pumpPool(), { base: vault(1_000_000n), quote: vault(0n) }, DECIMALS),
    ).toThrow(/computed price is 0/);
  });

  it("outer guard: a price below 1e-6 throws instead of truncating to 0n (M01-M03)", () => {
    // sqrt_price_x64 = 1 is initialised (passes the inner guard) but prices far below 1e-6.
    expect(() => computeDexSpotPriceE6("raydium-clmm", raydium(1n))).toThrow(/computed price is 0/);
  });

  it("outer guard: the most extreme legal Meteora inverse input still throws (M01-M03)", () => {
    // binStep 10000, activeId -500000 is the smallest price the bounds allow. It
    // truncates to 0 and must be refused by the outer guard. (The inner
    // `result === 0n` inverse guard is unreachable: result starts at 1e18 and is
    // only multiplied by b >= 1e18 then divided by 1e18, so it never hits 0.)
    expect(() => computeDexSpotPriceE6("meteora-dlmm", meteora(10_000, -500_000), undefined, DECIMALS)).toThrow(
      /computed price is 0/,
    );
  });

  it("missing vaultData throws the contract error (M04)", () => {
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(), undefined, DECIMALS)).toThrow(/requires vaultData/);
  });

  it("PumpSwap without decimals throws the contract error (M05)", () => {
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(), funded())).toThrow(/PumpSwap requires decimals/);
  });

  it("Meteora without decimals throws the contract error (M06)", () => {
    expect(() => computeDexSpotPriceE6("meteora-dlmm", meteora(10, 0))).toThrow(/Meteora DLMM requires decimals/);
  });

  it("a 202-byte PumpSwap pool is refused, not priced (M07)", () => {
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(202), funded(), DECIMALS)).toThrow(/pool data too short/);
  });

  it("71-byte vault accounts are refused on either side (M08, M09)", () => {
    expect(() =>
      computeDexSpotPriceE6("pumpswap", pumpPool(), { base: vault(0n, 71), quote: vault(1n) }, DECIMALS),
    ).toThrow(/base vault data too short/);
    expect(() =>
      computeDexSpotPriceE6("pumpswap", pumpPool(), { base: vault(1n), quote: vault(0n, 71) }, DECIMALS),
    ).toThrow(/quote vault data too short/);
  });

  it("PumpSwap decimals 25 on either side are refused (M10, M11, M15)", () => {
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(), funded(), { base: 25, quote: 9 })).toThrow(
      /base decimals out of range/,
    );
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(), funded(), { base: 6, quote: 25 })).toThrow(
      /quote decimals out of range/,
    );
  });

  it("WSOL-quoted pool without solPriceE6 throws instead of a SOL-denominated price (M14)", () => {
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(300, true), funded(), DECIMALS)).toThrow(
      /no solPriceE6/,
    );
  });

  it("non-integer and negative decimals are refused with the range error (M16, M17)", () => {
    expect(() =>
      computeDexSpotPriceE6("meteora-dlmm", meteora(10, 0), undefined, { base: 6.5, quote: 6 }),
    ).toThrow(/decimals out of range/);
    expect(() =>
      computeDexSpotPriceE6("meteora-dlmm", meteora(10, 0), undefined, { base: 6, quote: -1 }),
    ).toThrow(/decimals out of range/);
  });

  it("Raydium decimals0 or decimals1 = 25 is refused (M18, M19)", () => {
    expect(() => computeDexSpotPriceE6("raydium-clmm", raydium(1n << 64n, 25, 6))).toThrow(/decimals out of range/);
    expect(() => computeDexSpotPriceE6("raydium-clmm", raydium(1n << 64n, 6, 25))).toThrow(/decimals out of range/);
  });

  it("Meteora binStep 10001 is refused (M22)", () => {
    expect(() => computeDexSpotPriceE6("meteora-dlmm", meteora(10_001, 0), undefined, DECIMALS)).toThrow(
      /exceeds max/,
    );
  });

  it("Meteora |activeId| 500001 is refused on both sides (M23, M24)", () => {
    expect(() => computeDexSpotPriceE6("meteora-dlmm", meteora(1, 500_001), undefined, DECIMALS)).toThrow(
      /exceeds max/,
    );
    expect(() => computeDexSpotPriceE6("meteora-dlmm", meteora(1, -500_001), undefined, DECIMALS)).toThrow(
      /exceeds max/,
    );
  });
});
