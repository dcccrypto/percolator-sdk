/**
 * Differential test for the slab decode perf change (SDK-PERF-SLABPARSE): every decoder in src/solana/slab.ts
 * must return byte-for-byte the same value (or throw the same error) as the frozen pre-change copy in
 * test/bench/slab-reference.ts, on the real-shaped fixtures and on 1,000 seeded random buffers.
 */
import { describe, expect, it } from "vitest";
import { LAYOUTS_BY_VERSION } from "../src/abi/layout.js";
import * as cur from "../src/solana/slab.js";
import * as ref from "./bench/slab-reference.js";
import { fillRandom, marketFixture, portfolioFixture, prng } from "./bench/slab-fixtures.js";
import { stampHeader } from "./helpers/stamp.js";

type Out = { ok: true; v: unknown } | { ok: false; name: string; msg: string; code?: unknown };
function attempt(f: () => unknown): Out {
  try { return { ok: true, v: f() }; } catch (e) {
    const err = e as Error & { code?: unknown };
    return { ok: false, name: err.constructor.name, msg: err.message, code: err.code };
  }
}
/** Run `fn` against both modules and require identical results (deep equality incl. bigint/PublicKey) or errors. */
function same(label: string, fn: (m: typeof cur) => unknown): void {
  const a = attempt(() => fn(ref as typeof cur));
  const b = attempt(() => fn(cur));
  expect(b, label).toEqual(a);
}

const BUFFER_DECODERS: [string, (m: typeof cur, d: Uint8Array) => unknown][] = [
  ["parseHeader", (m, d) => m.parseHeader(d)],
  ["parseConfig", (m, d) => m.parseConfig(d)],
  ["parseParams", (m, d) => m.parseParams(d)],
  ["parseEngine", (m, d) => m.parseEngine(d)],
  ["parseAccount0", (m, d) => m.parseAccount(d, 0)],
  ["parseAccount1", (m, d) => m.parseAccount(d, 1)],
  ["parseAllAccounts", (m, d) => m.parseAllAccounts(d)],
  ["parseWrapperConfigV17", (m, d) => m.parseWrapperConfigV17(d)],
  ["parseMarketGroupV17OI", (m, d) => m.parseMarketGroupV17OI(d)],
  ["parseAssetOracleProfileV17", (m, d) => m.parseAssetOracleProfileV17(d, 16)],
  ["parseAssetControlSequencesV17", (m, d) => m.parseAssetControlSequencesV17(d, 16)],
  ["parsePortfolioV17", (m, d) => m.parsePortfolioV17(d)],
  ["parseLpVaultRegistry", (m, d) => m.parseLpVaultRegistry(d)],
  ["parseLpRedemption", (m, d) => m.parseLpRedemption(d)],
];

describe("slab decode: old vs new are identical", () => {
  it("v2.2 / v2.1 market and portfolio fixtures, at offset 0 and through a shifted view", () => {
    for (const version of LAYOUTS_BY_VERSION.keys()) {
      const m = marketFixture(version);
      const p = portfolioFixture(version);
      const shift = (s: Uint8Array) => { const big = new Uint8Array(s.length + 21); big.set(s, 13); return big.subarray(13, 13 + s.length); };
      for (const fixture of [m, p, shift(m), shift(p), m.subarray(0, 700), p.subarray(0, 400)]) {
        for (const [name, f] of BUFFER_DECODERS) same(`v${version} ${name} len=${fixture.length}`, (mod) => f(mod, fixture));
      }
      const L = LAYOUTS_BY_VERSION.get(version)!;
      for (let i = 0; i < 8; i++) {
        const so = L.marketGroupOff + L.marketGroupLen + i * L.assetSlotStride;
        same(`v${version} profile ${i}`, (mod) => mod.parseAssetOracleProfileV17(m, so));
        same(`v${version} ctl ${i}`, (mod) => mod.parseAssetControlSequencesV17(m, so));
      }
    }
  });

  it("LP vault registry (kind 5) and redemption (kind 6) decode identically and successfully", () => {
    for (const version of LAYOUTS_BY_VERSION.keys()) {
      for (const [kind, len, f] of [
        [5, 200, (m: typeof cur, d: Uint8Array) => m.parseLpVaultRegistry(d)],
        [6, 160, (m: typeof cur, d: Uint8Array) => m.parseLpRedemption(d)],
      ] as const) {
        const buf = stampHeader(fillRandom(new Uint8Array(len), 99 + kind + version, 16), kind, version);
        same(`kind ${kind} v${version}`, (mod) => f(mod, buf));
        expect(attempt(() => f(cur, buf)).ok, `kind ${kind} v${version} decodes`).toBe(true);
      }
    }
  });

  it("decodes a full portfolio and market to non-trivial values (guards against a vacuous comparison)", () => {
    const pf = cur.parsePortfolioV17(portfolioFixture(19));
    expect(pf.legs.length).toBeGreaterThan(0);
    expect(pf.capital).not.toBe(0n);
    expect(cur.parseWrapperConfigV17(marketFixture(19)).maintenanceFeePerSlot).not.toBe(0n);
  });

  it("legacy size-keyed slab layouts (header/config/params/engine/accounts) decode identically", () => {
    const sizes = new Set<number>();
    for (const tiers of [cur.SLAB_TIERS_V12_19, cur.SLAB_TIERS_V12_17, cur.SLAB_TIERS_V12_15, cur.SLAB_TIERS_V12_1]) {
      for (const t of Object.values(tiers)) sizes.add(t.dataSize);
    }
    for (const size of sizes) {
      if (size > 400_000) continue;
      const buf = fillRandom(new Uint8Array(size), size);
      new DataView(buf.buffer).setBigUint64(0, 0x504552434f4c4154n, true);
      for (const [name, f] of BUFFER_DECODERS) same(`size ${size} ${name}`, (mod) => f(mod, buf));
    }
  }, 300_000);

  it("1,000 random buffers (random bytes, random truncation, random wrapper header) match", () => {
    const r = prng(0x5eed);
    const versions = [...LAYOUTS_BY_VERSION.keys()];
    const lens = [16, 100, 116, 200, 592, 1350, 4000, 9563, 12000, 30000];
    let okCount = 0;
    const okBy: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const len = r() < 0.7 ? lens[Math.floor(r() * lens.length)] + Math.floor(r() * 3) : Math.floor(r() * 40_000);
      const buf = fillRandom(new Uint8Array(len), 1000 + i);
      if (r() < 0.8 && len > 120) {
        const version = versions[Math.floor(r() * versions.length)];
        stampHeader(buf, r() < 0.5 ? 1 : 2, version);
      }
      for (const [name, f] of BUFFER_DECODERS) {
        const a = attempt(() => f(ref as typeof cur, buf));
        const b = attempt(() => f(cur, buf));
        expect(b, `#${i} ${name} len=${len}`).toEqual(a);
        if (a.ok) { okCount++; okBy[name] = (okBy[name] ?? 0) + 1; }
      }
    }
    expect(okCount).toBeGreaterThan(500);
  }, 300_000);
});
