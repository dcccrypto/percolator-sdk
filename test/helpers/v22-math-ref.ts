/** Frozen copies of the pre-optimisation v22-math hot functions (reference for differential tests and the bench). */
import { LOT_EXP_MAX_V22, LOT_PRICE_FLOOR_E6_V22 } from "../../src/abi/v22-wire.js";

const BPS = 10_000n;

export function defaultMinPayoutRef(quotedPayout: bigint, slippageBps = 5, allowWider = false): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000 || (!allowWider && slippageBps > 5)) {
    throw new Error("slippageBps must be 0..=5 (the SDK default); pass allowWider to go beyond it");
  }
  if (quotedPayout <= 0n) throw new Error("quotedPayout must be positive: simulate the redemption first");
  const f = (quotedPayout * (BPS - BigInt(slippageBps))) / BPS;
  return f === 0n ? 1n : f;
}

export function lotExpForTokenPriceRef(tokenPriceE6: bigint): number | null {
  if (tokenPriceE6 <= 0n) return null;
  for (let k = 0; k <= LOT_EXP_MAX_V22; k++) {
    if (tokenPriceE6 * 10n ** BigInt(k) >= LOT_PRICE_FLOOR_E6_V22) return k;
  }
  return null;
}

export function displayPriceRef(markE6: bigint, lotExp: number): string {
  if (!Number.isInteger(lotExp) || lotExp < 0 || lotExp > LOT_EXP_MAX_V22) throw new Error(`lotExp must be 0..=${LOT_EXP_MAX_V22}`);
  const scale = 6 + lotExp;
  const s = markE6.toString().padStart(scale + 1, "0");
  const int = s.slice(0, s.length - scale);
  const frac = s.slice(s.length - scale).replace(/0+$/, "");
  return frac === "" ? int : `${int}.${frac}`;
}

export function tokensToLotsRef(tokens: bigint, lotExp: number): { lots: bigint; remainderTokens: bigint } {
  if (!Number.isInteger(lotExp) || lotExp < 0 || lotExp > LOT_EXP_MAX_V22) throw new Error(`lotExp must be 0..=${LOT_EXP_MAX_V22}`);
  const f = 10n ** BigInt(lotExp);
  return { lots: tokens / f, remainderTokens: tokens % f };
}
