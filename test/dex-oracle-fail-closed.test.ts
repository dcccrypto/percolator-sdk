import { describe, it, expect } from "vitest";
import { computeDexSpotPriceE6 } from "../src/solana/dex-oracle.js";

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
function vault(amount: bigint): Uint8Array {
  const b = new Uint8Array(165);
  new DataView(b.buffer).setBigUint64(64, amount, true);
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
