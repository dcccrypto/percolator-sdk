/**
 * rankAdlPositions / isAdlTriggered on a real v2.2 (VERSION 19, rc23) devnet
 * market slab: 4059 bytes, K6xMbo6GUNhhAf2Krrm6pUCiFj1qbdZPSnrXig1scHi at slot
 * 525458805 (test/fixtures/v22-discovery-memcmp-devnet.json).
 *
 * Nothing in slab.js is mocked: the real detectSlabLayout / parseAllAccounts run.
 * Before the fix rankAdlPositions threw "Unrecognized slab data length: 4059" and
 * isAdlTriggered stayed false even with a_long below ADL_ONE.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { rankAdlPositions, isAdlTriggered } from "../src/solana/adl.js";
import { detectSlabLayout } from "../src/solana/slab.js";
import { decodeMarketFundingV22, ADL_ONE_V22 } from "../src/abi/v22-funding.js";
import { resolveMarketGeometry } from "../src/abi/layout.js";

const fx = JSON.parse(
  readFileSync(new URL("./fixtures/v22-discovery-memcmp-devnet.json", import.meta.url), "utf8"),
);
const market = fx.accounts.find((a: { role: string }) => a.role === "market");
const data = new Uint8Array(Buffer.from(market.data_base64, "base64"));

/** Copy of the slab with asset 0's `a_long` (u128 LE at engine slot + 49) set to `v`. */
function withALong(v: bigint): Uint8Array {
  const out = data.slice();
  const off = resolveMarketGeometry(out, { parser: "test", strictLength: false }).engineOff(0) + 49;
  const dv = new DataView(out.buffer);
  dv.setBigUint64(off, v & ((1n << 64n) - 1n), true);
  dv.setBigUint64(off + 8, v >> 64n, true);
  return out;
}

describe("ADL helpers on a real v2.2 market slab", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fixture is the 4059-byte v2.2 market the legacy layout detector does not know", () => {
    expect(fx.slot).toBe(525458805);
    expect(market.address).toBe("K6xMbo6GUNhhAf2Krrm6pUCiFj1qbdZPSnrXig1scHi");
    expect(data.length).toBe(4059);
    expect(detectSlabLayout(data.length, data)).toBeNull();
    const a = decodeMarketFundingV22(data).assets[0]!;
    expect([a.aLong, a.aShort]).toEqual([ADL_ONE_V22, ADL_ONE_V22]);
  });

  it("untouched slab (A == ADL_ONE): no throw, empty ranking, not triggered, reason given", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = rankAdlPositions(data);
    expect(r.ranked).toEqual([]);
    expect(r.longs).toEqual([]);
    expect(r.shorts).toEqual([]);
    expect(r.isTriggered).toBe(false);
    expect(r.dominantSide).toBeNull();
    expect(r.unsupportedReason).toMatch(/^v2\.2 market: ADL is applied pro rata/);
    expect(isAdlTriggered(data)).toBe(false);
  });

  it("a_long one below ADL_ONE (program is in ADL): triggered, still no ranking", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const patched = withALong(ADL_ONE_V22 - 1n);
    expect(decodeMarketFundingV22(patched).assets[0]!.aLong).toBe(ADL_ONE_V22 - 1n);
    expect(isAdlTriggered(patched)).toBe(true);
    const r = rankAdlPositions(patched);
    expect(r.isTriggered).toBe(true);
    expect(r.ranked).toEqual([]);
    expect(r.unsupportedReason).toMatch(/^v2\.2 market/);
  });

  it("bytes that are neither a legacy slab nor a v2.2 market: no throw, unrecognized reason", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const junk = new Uint8Array(4059);
    expect(isAdlTriggered(junk)).toBe(false);
    const r = rankAdlPositions(junk);
    expect(r.ranked).toEqual([]);
    expect(r.isTriggered).toBe(false);
    expect(r.unsupportedReason).toBe("unrecognized slab layout (4059 bytes): no ranking");
  });
});
