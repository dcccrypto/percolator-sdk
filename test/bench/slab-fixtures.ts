/**
 * Deterministic real-shaped slab fixtures for the slab decode bench and the old-vs-new differential test.
 * One v2.2 (VERSION 19) market slab with 8 asset slots, and one full v2.2 portfolio. Every field is filled
 * with seeded pseudo-random bytes so each decoded value (u128/i128/PublicKey) is non-trivial.
 */
import { LAYOUTS_BY_VERSION } from "../../src/abi/layout.js";
import { stampMarket, stampPortfolio } from "../helpers/stamp.js";

export function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fillRandom(buf: Uint8Array, seed: number, from = 0): Uint8Array {
  const r = prng(seed);
  for (let i = from; i < buf.length; i++) buf[i] = Math.floor(r() * 256);
  return buf;
}

export const MARKET_SLOTS = 8;

export function marketFixture(version = 19, slots = MARKET_SLOTS): Uint8Array {
  const L = LAYOUTS_BY_VERSION.get(version)!;
  const len = L.marketGroupOff + L.marketGroupLen + slots * L.assetSlotStride;
  const buf = new Uint8Array(len);
  fillRandom(buf, 0xa11ce + version, 16);
  return stampMarket(buf, version);
}

export function portfolioFixture(version = 19): Uint8Array {
  const L = LAYOUTS_BY_VERSION.get(version)!;
  const buf = new Uint8Array(L.portfolio.accountLen);
  fillRandom(buf, 0xb0b + version, 16);
  return stampPortfolio(buf, version);
}
