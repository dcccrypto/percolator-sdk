/**
 * Branch coverage for src/solana/slab.ts: the v2.2/v2.1 standalone decoders (short buffers, non-zero
 * byteOffset views, bad magic/version/kind/discriminator, truncated optional tails) and the size-keyed
 * legacy layout detection + engine/config/params readers. Tests only; no src change.
 */
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { LAYOUTS_BY_VERSION, UnknownLayoutError } from "../src/abi/layout.js";
import * as slab from "../src/solana/slab.js";
import {
  V17_ASSET_ORACLE_PROFILE_LEN,
  V17_HEADER_LEN,
  V17_KIND_MARKET,
  V17_MAGIC,
  V17_MARKET_GROUP_OFF,
  V17_WRAPPER_CONFIG_LEN,
  isV17Account,
  isV17MarketAccount,
  parseAccount,
  parseAllAccounts,
  parseAssetOracleProfileV17,
  parseConfig,
  parseEngine,
  parseLpRedemption,
  parseLpVaultRegistry,
  parseMarketGroupV17OI,
  parseParams,
  parsePortfolioV17,
  parseWrapperConfigV17,
  detectSlabLayout,
} from "../src/solana/slab.js";
import { stampHeader, stampMarket, stampPortfolio } from "./helpers/stamp.js";

const SLAB_MAGIC = 0x504552434f4c4154n; // "PERCOLAT"
const VERSIONS = [...LAYOUTS_BY_VERSION.keys()];
const code = (f: () => unknown): string | undefined => {
  try { f(); } catch (e) { return e instanceof UnknownLayoutError ? e.code : `other:${(e as Error).message}`; }
  return undefined;
};
const throwsMsg = (f: () => unknown): string => {
  try { f(); } catch (e) { return (e as Error).message; }
  return "";
};
const put64 = (d: Uint8Array, o: number, v: bigint) => new DataView(d.buffer, d.byteOffset, d.byteLength).setBigUint64(o, v, true);
const put128 = (d: Uint8Array, o: number, v: bigint) => { put64(d, o, v & ((1n << 64n) - 1n)); put64(d, o + 8, v >> 64n); };
/** Copy into a larger buffer and return a view at a non-zero byteOffset. */
const shifted = (src: Uint8Array, pad = 13): Uint8Array => {
  const big = new Uint8Array(src.length + pad + 7);
  big.set(src, pad);
  return big.subarray(pad, pad + src.length);
};

describe("parseWrapperConfigV17", () => {
  it("rejects a short buffer, and one short for a custom configOff", () => {
    expect(throwsMsg(() => parseWrapperConfigV17(new Uint8Array(100)))).toMatch(/data too short/);
    const exact = new Uint8Array(V17_HEADER_LEN + V17_WRAPPER_CONFIG_LEN);
    expect(() => parseWrapperConfigV17(exact)).not.toThrow();
    expect(throwsMsg(() => parseWrapperConfigV17(exact, 8))).toBe(""); // smaller configOff still fits
    expect(throwsMsg(() => parseWrapperConfigV17(exact, 64))).toMatch(/need 640 bytes, got 592/);
  });

  it("decodes identically through a non-zero byteOffset view and honours configOff", () => {
    const buf = new Uint8Array(V17_HEADER_LEN + V17_WRAPPER_CONFIG_LEN + 32);
    buf.fill(0x07, V17_HEADER_LEN, V17_HEADER_LEN + 32); // marketauth
    put128(buf, V17_HEADER_LEN + 96, 123456789n);
    const a = parseWrapperConfigV17(buf);
    const b = parseWrapperConfigV17(shifted(buf));
    expect(b).toEqual(a);
    expect(a.maintenanceFeePerSlot).toBe(123456789n);
    const moved = new Uint8Array(buf.length + 32);
    moved.set(buf.subarray(V17_HEADER_LEN), V17_HEADER_LEN + 32);
    expect(parseWrapperConfigV17(moved, V17_HEADER_LEN + 32).maintenanceFeePerSlot).toBe(123456789n);
  });
});

describe("parseAssetOracleProfileV17", () => {
  it("rejects a short buffer and accepts an exact one at a non-zero profileOff", () => {
    expect(throwsMsg(() => parseAssetOracleProfileV17(new Uint8Array(10), 0))).toMatch(/data too short/);
    const need = 40 + V17_ASSET_ORACLE_PROFILE_LEN;
    expect(throwsMsg(() => parseAssetOracleProfileV17(new Uint8Array(need - 1), 40))).toMatch(/data too short/);
    const ok = parseAssetOracleProfileV17(shifted(new Uint8Array(need)), 40);
    expect(ok).toBeTruthy();
  });
});

describe("isV17Account / isV17MarketAccount gates", () => {
  const hdr = (len: number, version: number, kind: number, magic = V17_MAGIC) => {
    const b = new Uint8Array(len);
    put64(b, 0, magic);
    new DataView(b.buffer).setUint16(8, version, true);
    if (len > 10) b[10] = kind;
    return b;
  };
  it("short buffers are never v17", () => {
    expect(isV17Account(new Uint8Array(9))).toBe(false);
    expect(isV17Account(hdr(10, 19, 0))).toBe(true);
    expect(isV17MarketAccount(hdr(10, 19, 1))).toBe(false); // no kind byte room
    expect(isV17MarketAccount(hdr(11, 19, 1))).toBe(true);
  });
  it("every known VERSION passes, unknown ones and bad magic fail", () => {
    for (const v of VERSIONS) expect(isV17Account(hdr(16, v, 2))).toBe(true);
    expect(isV17Account(hdr(16, 9999, 1))).toBe(false);
    expect(isV17Account(hdr(16, 19, 1, 1n))).toBe(false);
    expect(isV17MarketAccount(hdr(16, 9999, V17_KIND_MARKET))).toBe(false);
  });
});

describe("parseMarketGroupV17OI guards", () => {
  for (const version of VERSIONS) {
    const L = LAYOUTS_BY_VERSION.get(version)!;
    const slotsBase = L.marketGroupOff + L.marketGroupLen;
    it(`VERSION ${version}: TOO_SHORT / BAD_MAGIC / UNKNOWN_VERSION / WRONG_KIND`, () => {
      expect(code(() => parseMarketGroupV17OI(new Uint8Array(20)))).toBe("TOO_SHORT");
      const base = stampMarket(new Uint8Array(slotsBase), version);
      expect(() => parseMarketGroupV17OI(base)).not.toThrow();
      const badMagic = base.slice(); badMagic[0] ^= 0xff;
      expect(code(() => parseMarketGroupV17OI(badMagic))).toBe("BAD_MAGIC");
      const badVer = base.slice(); new DataView(badVer.buffer).setUint16(8, 4242, true);
      expect(code(() => parseMarketGroupV17OI(badVer))).toBe("UNKNOWN_VERSION");
      const badKind = base.slice(); badKind[10] = 2;
      expect(code(() => parseMarketGroupV17OI(badKind))).toBe("WRONG_KIND");
      expect(throwsMsg(() => parseMarketGroupV17OI(badKind))).toMatch(/not a market account \(kind 2\)/);
    });
    it(`VERSION ${version}: a trailing partial slot is tolerated (non-strict) and ignored`, () => {
      const buf = stampMarket(new Uint8Array(slotsBase + L.assetSlotStride + 5), version);
      const oi = parseMarketGroupV17OI(buf);
      expect(oi.assets).toEqual([]);
      expect(oi.totalLongOiQ).toBe(0n);
    });
    it(`VERSION ${version}: non-zero byteOffset view decodes the same OI`, () => {
      const buf = stampMarket(new Uint8Array(slotsBase + 2 * L.assetSlotStride), version);
      put128(buf, L.marketGroupOff + L.group.insurance, 77n);
      const slot1 = slotsBase + L.assetSlotStride + L.wrapperSlotLen;
      put128(buf, slot1 + L.assetState.oiEffLongQ, 5n);
      put128(buf, slot1 + L.assetState.oiEffShortQ, 9n);
      const a = parseMarketGroupV17OI(buf);
      expect(a.insuranceBalance).toBe(77n);
      expect(a.assets).toEqual([{ assetIndex: 1, oiEffLongQ: 5n, oiEffShortQ: 9n }]);
      expect(parseMarketGroupV17OI(shifted(buf))).toEqual(a);
    });
  }
});

describe("parsePortfolioV17 guards and truncated tails", () => {
  for (const version of VERSIONS) {
    const L = LAYOUTS_BY_VERSION.get(version)!;
    const G = L.portfolio;
    const minLen = 116 + 64 + 16; // PF_RESERVED_PNL_OFF + 16
    it(`VERSION ${version}: short, bad magic, unknown version, wrong kind, provenance, discriminator`, () => {
      expect(throwsMsg(() => parsePortfolioV17(new Uint8Array(minLen - 1)))).toMatch(/data too short/);
      const full = stampPortfolio(new Uint8Array(G.accountLen), version);
      expect(() => parsePortfolioV17(full)).not.toThrow();
      const a = full.slice(); a[1] ^= 1;
      expect(code(() => parsePortfolioV17(a))).toBe("BAD_MAGIC");
      const b = full.slice(); new DataView(b.buffer).setUint16(8, 777, true);
      expect(code(() => parsePortfolioV17(b))).toBe("UNKNOWN_VERSION");
      const c = full.slice(); c[10] = 1;
      expect(code(() => parsePortfolioV17(c))).toBe("WRONG_KIND");
      const d = full.slice(); new DataView(d.buffer).setUint16(G.provenanceVersionOff, 2, true);
      expect(code(() => parsePortfolioV17(d))).toBe("PROVENANCE_VERSION");
      const e = full.slice(); new DataView(e.buffer).setUint16(G.provenanceDiscriminatorOff, 99, true);
      expect(code(() => parsePortfolioV17(e))).toBe("DISCRIMINATOR_MISMATCH");
    });

    it(`VERSION ${version}: every truncated length decodes with zeroed optional tail and never throws`, () => {
      const full = stampPortfolio(new Uint8Array(G.accountLen), version);
      // Sentinel values in each optional field so a present field is distinguishable from the default 0n.
      for (let off = minLen; off + 16 <= 116 + 240; off += 16) put128(full, off, BigInt(off));
      const seen = new Set<string>();
      // Walk through every optional-field boundary (16 B apart) plus the exact boundary - 1.
      for (let len = minLen; len <= 116 + 240 + 8; len += 8) {
        const p = parsePortfolioV17(full.subarray(0, len));
        seen.add(`${p.residualCrystallizedLossAtomsTotal}/${p.feeCredits}/${p.activeBitmap}/${p.lastFeeSlot}`);
        expect(p.legs.length).toBeLessThanOrEqual(G.legCount);
      }
      expect(seen.size).toBeGreaterThan(3);
      // Truncated mid-way through the legs and the source domains / matcher config: loops `break`, matcher defaults.
      const midLegs = parsePortfolioV17(full.subarray(0, G.legsOff + 2 * G.legStride + 3));
      expect(midLegs.legs.length).toBe(2);
      expect(midLegs.matcherProgram.equals(PublicKey.default)).toBe(true);
      expect(midLegs.matcherEnabled).toBe(false);
      expect(midLegs.portfolioId).toBe(0n);
      expect(midLegs.matcherSequence).toBe(0n);
      expect(midLegs.matcherExpirySlot).toBe(0n);
      const midDomains = parsePortfolioV17(full.subarray(0, G.sourceDomainsOff + G.sourceDomainStride + 1));
      expect(midDomains.sourceDomains.length).toBe(1);
    });

    it(`VERSION ${version}: matcher config / identity trailer decode only when fully present, view-safe`, () => {
      const full = stampPortfolio(new Uint8Array(G.accountLen), version);
      const mp = G.matcherConfigOff;
      full.fill(0x11, mp, mp + 32);
      full.fill(0x22, mp + 32, mp + 64);
      full.fill(0x33, mp + 64, mp + 96);
      put64(full, mp + 96, 1n); // control: enabled bit
      const pfId = mp + PF_MATCHER_CONFIG_LEN;
      put64(full, pfId, 4242n);
      put64(full, pfId + 8, 7n);
      put64(full, pfId + 16, 99n);
      const whole = parsePortfolioV17(full);
      expect(whole.matcherEnabled).toBe(true);
      expect(whole.matcherProgram.toBytes()[0]).toBe(0x11);
      expect(whole.matcherContext.toBytes()[0]).toBe(0x22);
      expect(whole.matcherDelegate.toBytes()[0]).toBe(0x33);
      expect(whole.portfolioId).toBe(4242n);
      expect(whole.matcherSequence).toBe(7n);
      expect(whole.matcherExpirySlot).toBe(99n);
      expect(parsePortfolioV17(shifted(full))).toEqual(whole);
      // Cut so only program+context fit: delegate defaults.
      const partial = parsePortfolioV17(full.subarray(0, mp + 64 + 5));
      expect(partial.matcherContext.toBytes()[0]).toBe(0x22);
      expect(partial.matcherDelegate.equals(PublicKey.default)).toBe(true);
      expect(partial.matcherEnabled).toBe(false);
      // Cut so program only fits.
      const progOnly = parsePortfolioV17(full.subarray(0, mp + 32 + 5));
      expect(progOnly.matcherProgram.toBytes()[0]).toBe(0x11);
      expect(progOnly.matcherContext.equals(PublicKey.default)).toBe(true);
      // Control present but identity trailer cut off.
      const noTrailer = parsePortfolioV17(full.subarray(0, mp + 96 + 8));
      expect(noTrailer.matcherEnabled).toBe(true);
      expect(noTrailer.portfolioId).toBe(0n);
      // Only portfolioId present.
      const idOnly = parsePortfolioV17(full.subarray(0, pfId + 8));
      expect(idOnly.portfolioId).toBe(4242n);
      expect(idOnly.matcherSequence).toBe(0n);
      const seqOnly = parsePortfolioV17(full.subarray(0, pfId + 16));
      expect(seqOnly.matcherSequence).toBe(7n);
      expect(seqOnly.matcherExpirySlot).toBe(0n);
    });
  }
});

/** PortfolioMatcherConfigV16 = 3 pubkeys (96) + u64 control (8). */
const PF_MATCHER_CONFIG_LEN = 104;

describe("LP vault registry / redemption guards", () => {
  const REG = 176;
  const RED = 112;
  it("registry: too short, wrong kind, bad version, valid view", () => {
    expect(throwsMsg(() => parseLpVaultRegistry(new Uint8Array(REG - 1)))).toMatch(/data too short/);
    const ok = stampHeader(new Uint8Array(REG), 5, 19);
    ok.fill(0x44, 16, 48);
    const r = parseLpVaultRegistry(ok);
    expect(r.marketGroup.toBytes()[0]).toBe(0x44);
    expect(parseLpVaultRegistry(shifted(ok))).toEqual(r);
    expect(code(() => parseLpVaultRegistry(stampHeader(new Uint8Array(REG), 6, 19)))).toBe("WRONG_KIND");
    const v = ok.slice(); new DataView(v.buffer).setUint16(8, 5, true);
    expect(code(() => parseLpVaultRegistry(v))).toBe("UNKNOWN_VERSION");
    const m = ok.slice(); m[0] ^= 1;
    expect(code(() => parseLpVaultRegistry(m))).toBe("BAD_MAGIC");
    // v2.1 accepted too
    expect(() => parseLpVaultRegistry(stampHeader(new Uint8Array(REG), 5, 18))).not.toThrow();
  });
  it("redemption: too short, wrong kind, valid view", () => {
    expect(throwsMsg(() => parseLpRedemption(new Uint8Array(RED - 1)))).toMatch(/data too short/);
    const ok = stampHeader(new Uint8Array(RED), 6, 19);
    put128(ok, 16 + 64, 31337n);
    put64(ok, 16 + 80, 55n);
    ok[16 + 88] = 3; ok[16 + 89] = 254;
    const r = parseLpRedemption(ok);
    expect(r).toMatchObject({ shares: 31337n, requestSlot: 55n, version: 3, bump: 254 });
    expect(parseLpRedemption(shifted(ok))).toEqual(r);
    expect(code(() => parseLpRedemption(stampHeader(new Uint8Array(RED), 5, 19)))).toBe("WRONG_KIND");
  });
});

// ---------------------------------------------------------------------------
// Size-keyed legacy layouts: detectSlabLayout over every published tier, then config/params/engine readers.
// ---------------------------------------------------------------------------
const TIER_TABLES: Record<string, { dataSize: number; maxAccounts: number }>[] = Object.entries(slab)
  .filter(([k, v]) => k.startsWith("SLAB_TIERS") && v && typeof v === "object")
  .map(([, v]) => v as Record<string, { dataSize: number; maxAccounts: number }>);

describe("detectSlabLayout across every tier table", () => {
  it("finds tier tables", () => {
    expect(TIER_TABLES.length).toBeGreaterThanOrEqual(8);
  });
  it("every published tier size resolves to a layout with sane geometry", () => {
    let seen = 0;
    for (const t of TIER_TABLES) {
      for (const tier of Object.values(t)) {
        const L = detectSlabLayout(tier.dataSize);
        if (!L) continue; // a size shadowed by another registry yields null only if invalid
        seen++;
        expect(L.maxAccounts).toBeGreaterThan(0);
        expect(L.accountsOff).toBeGreaterThan(L.engineOff);
        expect(L.accountsOff + L.maxAccounts * L.accountSize).toBeLessThanOrEqual(tier.dataSize + 8);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
  it("returns null for a size no registry knows", () => {
    expect(detectSlabLayout(12345)).toBeNull();
  });
});

describe("parseConfig / parseParams / parseEngine on every layout", () => {
  it("never throw on a zeroed slab of any published tier, and are deterministic through a shifted view", () => {
    let n = 0;
    const seenSizes = new Set<number>();
    for (const t of TIER_TABLES) {
      for (const tier of Object.values(t)) {
        if (seenSizes.has(tier.dataSize) || tier.dataSize > 700_000) continue; // skip the largest tiers: no new branches
        seenSizes.add(tier.dataSize);
        const L = detectSlabLayout(tier.dataSize);
        if (!L) continue;
        const buf = new Uint8Array(tier.dataSize);
        put64(buf, 0, SLAB_MAGIC);
        const cfg = parseConfig(buf, L);
        const params = parseParams(buf, L);
        let engine;
        try { engine = parseEngine(buf); } catch { engine = undefined; }
        const view = shifted(buf);
        expect(parseConfig(view, L)).toEqual(cfg);
        expect(parseParams(view, L)).toEqual(params);
        if (engine) expect(parseEngine(view)).toEqual(engine);
        n++;
      }
    }
    expect(n).toBeGreaterThan(15);
  });

  it("parseConfig / parseParams / parseEngine reject buffers too small for any layout", () => {
    expect(() => parseConfig(new Uint8Array(10))).toThrow();
    expect(() => parseParams(new Uint8Array(10))).toThrow();
    expect(() => parseEngine(new Uint8Array(10))).toThrow();
  });

  it("parseAccount / parseAllAccounts read a used slot of every small tier", () => {
    let n = 0;
    for (const t of TIER_TABLES) {
      for (const tier of Object.values(t)) {
        if (tier.dataSize > 120_000) continue;
        const L = detectSlabLayout(tier.dataSize);
        if (!L) continue;
        const buf = new Uint8Array(tier.dataSize);
        put64(buf, 0, SLAB_MAGIC);
        buf[L.engineOff + L.engineBitmapOff] = 0x01; // account 0 used
        let all;
        try { all = parseAllAccounts(buf); } catch { continue; }
        expect(all.length).toBe(1);
        expect(parseAccount(shifted(buf), 0)).toEqual(all[0].account);
        n++;
      }
    }
    expect(n).toBeGreaterThan(3);
  });
});
