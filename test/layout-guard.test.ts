/** VERSION / discriminator guard, LAYOUT rows, and the exact-length portfolio createAccount. */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Keypair, PublicKey, SystemInstruction, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_KIND, LAYOUT_V21, LAYOUT_V22, LAYOUT_V22_ROWS, UnknownLayoutError, portfolioFilterForLayout, resolveLayout, resolveMarketGeometry, resolvePortfolioLayout,
} from "../src/abi/layout.js";
import {
  V17_EXPECTED_VERSION, V17_MARKET_ASSET_SLOT_LEN, V17_MARKET_GROUP_LEN, V17_MARKET_GROUP_OFF, V17_PORTFOLIO_ACCOUNT_LEN, V17_PORTFOLIO_LEG_SIZE, parseMarketGroupV17OI, parsePortfolioV17,
} from "../src/solana/slab.js";
import { decodeAssetGrowthV19 } from "../src/abi/growth-v19.js";
import { readAssetPricesP3 } from "../src/solana/p3-vault-lp.js";
import { parseBackingBucketsV17 } from "../src/solana/backing-bucket.js";
import { buildCreatePortfolioAccountIxV22, portfolioAccountLenV22 } from "../src/solana/v22.js";
import { stampHeader, stampMarket, stampPortfolio } from "./helpers/stamp.js";

const put128 = (d: Uint8Array, o: number, v: bigint) => { const x = new DataView(d.buffer); x.setBigUint64(o, v & ((1n << 64n) - 1n), true); x.setBigUint64(o + 8, v >> 64n, true); };
const code = (f: () => unknown): string | undefined => { try { f(); } catch (e) { return e instanceof UnknownLayoutError ? e.code : `other:${String(e)}`; } return undefined; };

describe("LAYOUT_V21 is frozen to the legacy constants", () => {
  it("equals every constant the v2.1 decoders use", () => {
    expect([LAYOUT_V21.version, LAYOUT_V21.marketGroupOff, LAYOUT_V21.marketGroupLen, LAYOUT_V21.assetSlotStride, LAYOUT_V21.portfolio.accountLen, LAYOUT_V21.portfolio.legStride])
      .toEqual([V17_EXPECTED_VERSION, V17_MARKET_GROUP_OFF, V17_MARKET_GROUP_LEN, V17_MARKET_ASSET_SLOT_LEN, V17_PORTFOLIO_ACCOUNT_LEN, V17_PORTFOLIO_LEG_SIZE]);
    expect(LAYOUT_V21.status).toBe("FROZEN");
  });
});

describe("guard", () => {
  it("refuses unknown versions with a typed error (never by length)", () => {
    const m = stampMarket(new Uint8Array(1398 + 2629), 20);
    expect(code(() => parseMarketGroupV17OI(m))).toBe("UNKNOWN_VERSION");
    expect(code(() => resolveLayout(m, { parser: "t" }))).toBe("UNKNOWN_VERSION");
    const v17 = stampMarket(new Uint8Array(1350 + 2325), 17);
    expect(code(() => parseMarketGroupV17OI(v17))).toBe("UNKNOWN_VERSION");
  });
  it("wrong magic / kind / short", () => {
    expect(code(() => parseMarketGroupV17OI(new Uint8Array(4000)))).toBe("BAD_MAGIC");
    expect(code(() => parseMarketGroupV17OI(new Uint8Array(50)))).toBe("TOO_SHORT");
    expect(code(() => parseMarketGroupV17OI(stampHeader(new Uint8Array(4100), 2, 19)))).toBe("WRONG_KIND");
  });
  it("market stride is chosen by VERSION: the same bytes decode with the right OI for each row", () => {
    for (const L of [LAYOUT_V21, LAYOUT_V22_ROWS.variantB]) {
      const d = stampMarket(new Uint8Array(L.marketGroupOff + L.marketGroupLen + 2 * L.assetSlotStride), L.version);
      put128(d, L.marketGroupOff + L.group.insurance, 777n);
      put128(d, L.marketGroupOff + L.marketGroupLen + 1 * L.assetSlotStride + L.wrapperSlotLen + L.assetState.oiEffLongQ, 5n);
      const oi = parseMarketGroupV17OI(d);
      expect([oi.insuranceBalance, oi.totalLongOiQ, oi.assets.map((a) => a.assetIndex)]).toEqual([777n, 5n, [1]]);
    }
  });
  it("a named row can be registered for a comparison run (stage A) without changing the default", () => {
    const reg = new Map([[19, LAYOUT_V22_ROWS.stageA]]);
    const a = LAYOUT_V22_ROWS.stageA;
    const d = stampMarket(new Uint8Array(a.marketGroupOff + a.marketGroupLen + a.assetSlotStride), 19);
    expect(resolveMarketGeometry(d, { parser: "t", registry: reg }).layout).toBe(a);
    expect(code(() => resolveMarketGeometry(d, { parser: "t" }))).toBe("BAD_LENGTH");
  });
  it("NEGATIVE CONTROL: v2.2 bytes read with the v2.1 stride would misread; the guard picks by VERSION so it does not", () => {
    const L = LAYOUT_V22;
    const d = stampMarket(new Uint8Array(L.marketGroupOff + L.marketGroupLen + 2 * L.assetSlotStride), L.version);
    put128(d, L.marketGroupOff + L.marketGroupLen + L.assetSlotStride + L.wrapperSlotLen + L.assetState.oiEffLongQ, 5n);
    const wrong = LAYOUT_V21.marketGroupOff + LAYOUT_V21.marketGroupLen + LAYOUT_V21.assetSlotStride + LAYOUT_V21.wrapperSlotLen + LAYOUT_V21.assetState.oiEffLongQ;
    expect(new DataView(d.buffer).getBigUint64(wrong, true)).not.toBe(5n);
    expect(parseMarketGroupV17OI(d).totalLongOiQ).toBe(5n);
  });
  it("strict length: a v2.2 market whose tail is not a whole number of strides is refused", () => {
    const L = LAYOUT_V22;
    const d = stampMarket(new Uint8Array(L.marketGroupOff + L.marketGroupLen + L.assetSlotStride + 5), L.version);
    expect(code(() => resolveMarketGeometry(d, { parser: "t" }))).toBe("BAD_LENGTH");
  });
  it("other market decoders are guarded too", () => {
    const bad = stampMarket(new Uint8Array(1398 + 2629), 20);
    expect(code(() => decodeAssetGrowthV19(bad, 0))).toBe("UNKNOWN_VERSION");
    expect(code(() => readAssetPricesP3(bad, 0))).toBe("UNKNOWN_VERSION");
    expect(code(() => parseBackingBucketsV17(bad))).toBe("UNKNOWN_VERSION");
  });
  it("v2.2 asset prices and growth are read from the v2.2 slot", () => {
    const L = LAYOUT_V22;
    const d = stampMarket(new Uint8Array(L.marketGroupOff + L.marketGroupLen + 2 * L.assetSlotStride), L.version);
    const v = new DataView(d.buffer);
    const e1 = L.marketGroupOff + L.marketGroupLen + L.assetSlotStride + L.wrapperSlotLen;
    v.setBigUint64(e1 + L.assetState.rawOracleTargetPrice, 777n, true); v.setBigUint64(e1 + L.assetState.effectivePrice, 555n, true);
    expect(readAssetPricesP3(d, 1)).toEqual({ rawOracleTargetPriceE6: 777n, effectivePriceE6: 555n });
  });
});

describe("portfolio guard + per-row geometry", () => {
  for (const L of [LAYOUT_V21, LAYOUT_V22_ROWS.variantB]) {
    it(`${L.name}: legs, source domains and matcher config come from the row`, () => {
      const d = stampPortfolio(new Uint8Array(L.portfolio.accountLen), L.version);
      const owner = Keypair.generate().publicKey;
      d.set(owner.toBytes(), 116);
      const g = L.portfolio;
      const leg = (i: number) => g.legsOff + i * g.legStride;
      d[leg(15) + g.leg.active] = 1;
      new DataView(d.buffer).setBigUint64(leg(15) + g.leg.marketId, 4242n, true);
      put128(d, leg(15) + g.leg.bRem, 99n);
      if (g.leg.rentCarry !== null) new DataView(d.buffer).setBigUint64(leg(15) + g.leg.rentCarry, 31n, true);
      new DataView(d.buffer).setUint32(g.sourceDomainsOff, 7, true);
      new DataView(d.buffer).setBigUint64(g.matcherConfigOff + 104, 888n, true); // portfolio_id
      const p = parsePortfolioV17(d);
      expect([p.legs[15].active, p.legs[15].marketId, p.legs[15].bRem, p.sourceDomains[0].domain, p.portfolioId]).toEqual([true, 4242n, 99n, 7, 888n]);
      expect(p.legs.length).toBe(16);
      if (g.leg.rentCarry !== null) expect(p.legs[15].rentCarry).toBe(31n);
      else expect(p.legs[15].rentCarry).toBeUndefined();
    });
  }
  it("engine discriminator mismatch is refused (VERSION bumped, layout not: the NFT finding)", () => {
    const d = stampPortfolio(new Uint8Array(LAYOUT_V22.portfolio.accountLen), 19);
    new DataView(d.buffer).setUint16(114, 18, true);
    expect(code(() => parsePortfolioV17(d))).toBe("DISCRIMINATOR_MISMATCH");
    const e = stampPortfolio(new Uint8Array(LAYOUT_V22.portfolio.accountLen), 19);
    new DataView(e.buffer).setUint16(112, 2, true);
    expect(code(() => resolvePortfolioLayout(e, { parser: "t" }))).toBe("PROVENANCE_VERSION");
    expect(code(() => resolvePortfolioLayout(stampPortfolio(new Uint8Array(120), 19).subarray(0, 115), { parser: "t" }))).toBe("TOO_SHORT");
    expect(code(() => resolvePortfolioLayout(stampPortfolio(new Uint8Array(LAYOUT_V22.portfolio.accountLen + 1), 19), { parser: "t", strictLength: true }))).toBe("BAD_LENGTH");
    expect(code(() => parsePortfolioV17(stampPortfolio(new Uint8Array(LAYOUT_V22.portfolio.accountLen), 20)))).toBe("UNKNOWN_VERSION");
  });
  it("memcmp filter is VERSION-keyed", () => {
    const f = portfolioFilterForLayout(LAYOUT_V22);
    expect(f.dataSize).toBe(LAYOUT_V22.portfolio.accountLen);
    expect(f.versionMemcmp.offset).toBe(8);
    expect(f.versionMemcmp.bytes).not.toBe(portfolioFilterForLayout(LAYOUT_V21).versionMemcmp.bytes);
  });
});

describe("portfolio createAccount at EXACTLY PORTFOLIO_ACCOUNT_LEN (the program cannot realloc past 10,240 B)", () => {
  const pk = () => Keypair.generate().publicKey;
  it("is pinned per layout row", () => {
    expect(LAYOUT_V22_ROWS.variantB.portfolio.accountLen).toBe(10_603);
    expect(LAYOUT_V22_ROWS.stageA.portfolio.accountLen).toBe(10_091);
    expect(LAYOUT_V21.portfolio.accountLen).toBe(9_563);
    expect(portfolioAccountLenV22()).toBe(10_603);
    for (const [L, want] of [[LAYOUT_V22_ROWS.variantB, 10_603], [LAYOUT_V22_ROWS.stageA, 10_091]] as const) {
      const ix = buildCreatePortfolioAccountIxV22(pk(), pk(), 1, pk(), L);
      expect(ix.programId.equals(SystemProgram.programId)).toBe(true);
      const dec = SystemInstruction.decodeCreateAccount(ix);
      expect(dec.space).toBe(want);
    }
  });
  it("NEGATIVE CONTROL: the stage-A length is wrong for the default (variant B) row", () => {
    const ix = buildCreatePortfolioAccountIxV22(pk(), pk(), 1, pk());
    expect(SystemInstruction.decodeCreateAccount(ix).space).not.toBe(10_091);
    expect(SystemInstruction.decodeCreateAccount(ix).space).toBeLessThan(0 + 10_604);
  });
});

describe("layout-v22.json from the combination (when present)", () => {
  const path = `${homedir()}/percolator-ops/artifacts/v22-combination-2026-10-06/layout-v22.json`;
  it.skipIf(!existsSync(path))("every number in the file matches the default row", () => {
    const j = JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
    const flat = JSON.stringify(j);
    for (const n of [LAYOUT_V22.assetSlotStride, LAYOUT_V22.portfolio.accountLen, LAYOUT_V22.portfolio.legStride, LAYOUT_V22.marketGroupLen]) expect(flat).toContain(String(n));
  });
  it("ACCOUNT_KIND carries the new PDA kinds", () => {
    expect([ACCOUNT_KIND.BondTranche, ACCOUNT_KIND.BondPosition, ACCOUNT_KIND.InsuranceUnits, ACCOUNT_KIND.G9FeedAllowlist]).toEqual([11, 12, 13, 15]);
    void PublicKey;
  });
});
