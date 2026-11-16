/**
 * Branch coverage + prog-pinned offsets for src/abi/layout.ts.
 *
 * Prog pins cite percolator-prog `feat/v22-rc23-2026-10-22` (d27f3d73). That branch has no
 * `src/state.rs`; the layout constants live in `src/v16_program.rs` (module `constants`).
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_KIND, LAYOUT_V21, LAYOUT_V22, LAYOUT_V22_ROWS, LAYOUTS_BY_VERSION, UnknownLayoutError, WRAPPER_ACCOUNT_MAGIC,
  portfolioFilterForLayout, readWrapperHeader, resolveLayout, resolveMarketGeometry, resolvePortfolioLayout,
} from "../src/abi/layout.js";
import type { LayoutTable } from "../src/abi/layout.js";
import { stampHeader, stampMarket, stampPortfolio } from "./helpers/stamp.js";

const code = (f: () => unknown): string | undefined => {
  try { f(); } catch (e) { return e instanceof UnknownLayoutError ? e.code : `other:${String(e)}`; }
  return undefined;
};

describe("LAYOUT_V22 offsets pinned to percolator-prog v16_program.rs (rc23 d27f3d73)", () => {
  const P = LAYOUT_V22.portfolio;
  it("portfolio length is 10,607 (v16_program.rs:811 _ASSERT_PORTFOLIO_ACCOUNT_LEN_10607, :51749)", () => {
    expect(LAYOUT_V22.version).toBe(19); // constants::VERSION, v16_program.rs:127
    expect(P.accountLen).toBe(10607);
    expect(LAYOUT_V22_ROWS.stageA.portfolio.accountLen).toBe(10091); // pre-rem history, v16_program.rs:124
    expect(LAYOUT_V21.portfolio.accountLen).toBe(9563); // v16_program.rs:760 (9539 -> 9563)
  });
  it("wrapper tail derives from the engine length (v16_program.rs:748-789)", () => {
    const engineLen = P.accountLen - 104 - 24; // PORTFOLIO_ENGINE_ACCOUNT_LEN
    expect(P.matcherConfigOff).toBe(engineLen); // :748 PORTFOLIO_MATCHER_CONFIG_OFF == ENGINE_ACCOUNT_LEN
    expect(P.matcherConfigOff).toBe(10479);
    // matcher config 104 B (:749), id 8 B (:771-772), sequence 8 B (:779-780), expiry 8 B (:787-788)
    expect(P.matcherConfigOff + 104 + 8 + 8 + 8).toBe(P.accountLen);
    expect(P.identityTrailerLen).toBe(24);
  });
  it("market geometry: MARKET_GROUP_OFF = HEADER_LEN + WRAPPER_CONFIG_LEN (v16_program.rs:740)", () => {
    expect(LAYOUT_V22.headerLen + LAYOUT_V22.wrapperConfigLen).toBe(LAYOUT_V22.marketGroupOff);
    expect(LAYOUT_V22.marketGroupOff).toBe(592);
    expect(LAYOUT_V21.marketGroupOff).toBe(592);
    // The 4 B loss_provenance append moves nothing in the market account.
    expect(LAYOUT_V22.assetSlotStride).toBe(LAYOUT_V22.wrapperSlotLen + LAYOUT_V22.engineSlotLen);
    expect(LAYOUT_V22.assetSlotStride).toBe(2661);
  });
  it("legs and source domains are laid out back to back", () => {
    expect(P.legsOff + P.legCount * P.legStride).toBe(P.sourceDomainsOff);
    expect(P.legStride).toBe(217);
    expect(P.leg.rentCarry! + 8).toBe(P.legStride); // rent_carry is the last leg field (8 B)
  });
  it("boundary sizes 10,603 / 10,607 are refused or accepted by exact length only when strict", () => {
    for (const len of [10603, 10607]) {
      const d = stampPortfolio(new Uint8Array(len), 19);
      const ok = code(() => resolvePortfolioLayout(d, { parser: "t", strictLength: true }));
      expect(ok).toBe(len === 10607 ? undefined : "BAD_LENGTH");
      expect(code(() => resolvePortfolioLayout(d, { parser: "t" }))).toBeUndefined();
    }
    expect(code(() => resolvePortfolioLayout(stampPortfolio(new Uint8Array(10608), 19), { parser: "t", strictLength: true }))).toBe("BAD_LENGTH");
    expect(portfolioFilterForLayout().dataSize).toBe(10607);
    expect(portfolioFilterForLayout(LAYOUT_V21).dataSize).toBe(9563);
  });
});

describe("readWrapperHeader / resolveLayout edges", () => {
  it("15 bytes is too short, 16 bytes parses (default parser name)", () => {
    expect(() => readWrapperHeader(new Uint8Array(15))).toThrow(/readWrapperHeader: data too short \(15 < 16\)/);
    const h = stampHeader(new Uint8Array(16), 1, 19);
    expect(readWrapperHeader(h)).toEqual({ magic: WRAPPER_ACCOUNT_MAGIC, version: 19, kind: 1 });
  });
  it("unknown VERSION lists the registry or the caller's restricted versions", () => {
    const d = stampMarket(new Uint8Array(4000), 7);
    expect(() => resolveLayout(d, { parser: "p" })).toThrow(/this SDK decodes VERSION 18, 19/);
    expect(() => resolveLayout(d, { parser: "p", versions: [18] })).toThrow(/decodes VERSION 18\)/);
    const e = (() => { try { resolveLayout(d, { parser: "p" }); } catch (x) { return x as UnknownLayoutError; } })()!;
    expect([e.code, e.version, e.kind]).toEqual(["UNKNOWN_VERSION", 7, 1]);
  });
  it("a known VERSION excluded by `versions` is refused; kind omitted accepts any kind", () => {
    const d = stampMarket(new Uint8Array(4000), 19);
    expect(code(() => resolveLayout(d, { parser: "p", versions: [18] }))).toBe("UNKNOWN_VERSION");
    expect(resolveLayout(d, { parser: "p" })).toBe(LAYOUT_V22);
    expect(code(() => resolveLayout(d, { parser: "p", kind: ACCOUNT_KIND.Portfolio }))).toBe("WRONG_KIND");
  });
});

describe("resolveMarketGeometry branches", () => {
  const tiny: LayoutTable = { ...LAYOUT_V22, marketGroupOff: 0, marketGroupLen: 4 };
  it("below the shortest known group end is TOO_SHORT, with an empty registry too", () => {
    expect(code(() => resolveMarketGeometry(new Uint8Array(100), { parser: "g" }))).toBe("TOO_SHORT");
    expect(code(() => resolveMarketGeometry(new Uint8Array(4000), { parser: "g", registry: new Map() }))).toBe("TOO_SHORT");
  });
  it("rethrows non-version resolveLayout errors untouched (TOO_SHORT header)", () => {
    const reg = new Map([[19, tiny]]);
    expect(code(() => resolveMarketGeometry(new Uint8Array(10), { parser: "g", registry: reg }))).toBe("TOO_SHORT");
    expect(() => resolveMarketGeometry(new Uint8Array(10), { parser: "g", registry: reg })).not.toThrow(/not a v17/);
  });
  it("maps BAD_MAGIC / UNKNOWN_VERSION / WRONG_KIND to the historical phrase", () => {
    expect(() => resolveMarketGeometry(new Uint8Array(4000), { parser: "g" })).toThrow(/not a v17 market account/);
    expect(() => resolveMarketGeometry(stampMarket(new Uint8Array(4000), 5), { parser: "g" })).toThrow(/not a v17 market account/);
    expect(() => resolveMarketGeometry(stampHeader(new Uint8Array(4000), 2, 19), { parser: "g" })).toThrow(/not a market account \(kind 2\); not a v17/);
  });
  it("a VERSION whose group end is longer than the buffer is TOO_SHORT (mixed registry)", () => {
    const reg = new Map<number, LayoutTable>([[19, tiny], [18, LAYOUT_V21]]);
    const d = stampMarket(new Uint8Array(100), 18); // >= tiny group end, < v21 group end (1350)
    const e = (() => { try { resolveMarketGeometry(d, { parser: "g", registry: reg }); } catch (x) { return x as UnknownLayoutError; } })()!;
    expect([e.code, e.version, e.kind]).toEqual(["TOO_SHORT", 18, 1]);
  });
  it("strict length: group end + n*stride; lenient floors the slot count", () => {
    const base = LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen;
    const stride = LAYOUT_V22.assetSlotStride;
    const exact = stampMarket(new Uint8Array(base + 2 * stride), 19);
    const g = resolveMarketGeometry(exact, { parser: "g" });
    expect([g.slotCount, g.slotsBase, g.slotOff(1), g.engineOff(1)]).toEqual([2, base, base + stride, base + stride + 1024]);
    const odd = stampMarket(new Uint8Array(base + stride + 1), 19);
    expect(code(() => resolveMarketGeometry(odd, { parser: "g" }))).toBe("BAD_LENGTH");
    expect(resolveMarketGeometry(odd, { parser: "g", strictLength: false }).slotCount).toBe(1);
    expect(resolveMarketGeometry(stampMarket(new Uint8Array(base), 19), { parser: "g" }).slotCount).toBe(0);
  });
});

describe("resolvePortfolioLayout provenance guards", () => {
  it("header shorter than the provenance words is TOO_SHORT", () => {
    const reg = new Map([[19, LAYOUT_V22]]);
    const d = stampHeader(new Uint8Array(200), 2, 19);
    expect(code(() => resolvePortfolioLayout(d.subarray(0, 115), { parser: "p", registry: reg }))).toBe("TOO_SHORT");
  });
  it("provenance version != 1 and wrong discriminator are distinct errors", () => {
    const d = stampPortfolio(new Uint8Array(10607), 19);
    new DataView(d.buffer).setUint16(112, 2, true);
    expect(code(() => resolvePortfolioLayout(d, { parser: "p" }))).toBe("PROVENANCE_VERSION");
    const d2 = stampPortfolio(new Uint8Array(10607), 19);
    new DataView(d2.buffer).setUint16(114, 19, true); // pre-#299 discriminator
    expect(code(() => resolvePortfolioLayout(d2, { parser: "p" }))).toBe("DISCRIMINATOR_MISMATCH");
  });
});

describe("portfolioFilterForLayout base58 memcmp", () => {
  it("encodes the little-endian VERSION at offset 8", () => {
    expect(portfolioFilterForLayout()).toEqual({ dataSize: 10607, versionMemcmp: { offset: 8, bytes: "2Ss" } }); // [19,0] = 4864 = 1,25,50 in base58
  });
  it("leading zero bytes become '1' digits (high-byte-only and zero versions)", () => {
    expect(portfolioFilterForLayout({ ...LAYOUT_V22, version: 0x0100 }).versionMemcmp.bytes).toBe("12"); // [0,1]
    expect(portfolioFilterForLayout({ ...LAYOUT_V22, version: 0 }).versionMemcmp.bytes).toBe("11"); // [0,0]
  });
  it("registry holds exactly the two known VERSIONs", () => {
    expect([...LAYOUTS_BY_VERSION.keys()]).toEqual([18, 19]);
  });
});
