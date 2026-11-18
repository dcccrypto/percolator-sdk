/**
 * Branch coverage for src/abi/layout.ts: resolveMarketGeometry / readWrapperHeader / portfolioFilterForLayout,
 * plus per-version constants pinned to percolator-prog `feat/v22-rc23-2026-10-22` (src/v16_program.rs).
 * Tests only; behavior-level so they hold on any implementation of the same contract (e.g. sdk #521).
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_KIND, LAYOUT_V21, LAYOUT_V22, LAYOUT_V22_STAGE_A, LAYOUT_V22_VARIANT_B, LAYOUTS_BY_VERSION, UnknownLayoutError,
  portfolioFilterForLayout, readWrapperHeader, resolveMarketGeometry,
  type LayoutTable,
} from "../src/abi/layout.js";
import { stampHeader, stampMarket } from "./helpers/stamp.js";

const code = (f: () => unknown): string | undefined => {
  try { f(); } catch (e) { return e instanceof UnknownLayoutError ? e.code : `other:${String(e)}`; }
  return undefined;
};
const P = "geomTest";

describe("constants pinned to prog feat/v22-rc23-2026-10-22 (src/v16_program.rs)", () => {
  it("v2.2 rows", () => {
    for (const L of [LAYOUT_V22_STAGE_A, LAYOUT_V22_VARIANT_B, LAYOUT_V22]) {
      expect(L.version).toBe(19); // line 127: `pub const VERSION: u16 = 19;`
      expect(ACCOUNT_KIND.Market).toBe(1); // line 128: `pub const KIND_MARKET: u8 = 1;`
      expect(ACCOUNT_KIND.Portfolio).toBe(2); // line 129: `pub const KIND_PORTFOLIO: u8 = 2;`
      expect(L.headerLen).toBe(16); // line 133: `pub const HEADER_LEN: usize = 16;`
      expect(L.wrapperConfigLen).toBe(576); // line 134: `pub const WRAPPER_CONFIG_LEN: usize = 576;`
      expect(L.wrapperSlotLen).toBe(1024); // line 365: `pub const ASSET_ORACLE_WRAPPER_LEN: usize = 1024;`
      // line 740: `MARKET_GROUP_OFF = HEADER_LEN + WRAPPER_CONFIG_LEN`
      expect(L.marketGroupOff).toBe(L.headerLen + L.wrapperConfigLen);
      expect(L.marketGroupOff).toBe(592);
      // line 737: MARKET_ASSET_SLOT_LEN = size_of::<Market<[u8; ASSET_ORACLE_WRAPPER_LEN]>>() = wrapper + engine slot
      expect(L.assetSlotStride).toBe(L.wrapperSlotLen + L.engineSlotLen);
    }
    expect(LAYOUT_V22).toBe(LAYOUT_V22_VARIANT_B);
    expect(LAYOUT_V22_VARIANT_B.assetSlotStride).toBe(2661);
    expect(LAYOUT_V22_STAGE_A.assetSlotStride).toBe(2597);
  });
  it("v2.1 row shares the header / wrapper constants and its own VERSION", () => {
    expect(LAYOUT_V21.version).toBe(18);
    expect(LAYOUT_V21.headerLen).toBe(16);
    expect(LAYOUT_V21.marketGroupOff).toBe(592);
    expect(LAYOUT_V21.wrapperSlotLen).toBe(1024);
    expect(LAYOUT_V21.assetSlotStride).toBe(LAYOUT_V21.wrapperSlotLen + LAYOUT_V21.engineSlotLen);
  });
});

describe("readWrapperHeader", () => {
  it("TOO_SHORT below 16 bytes, parses at exactly 16", () => {
    expect(code(() => readWrapperHeader(new Uint8Array(15)))).toBe("TOO_SHORT");
    const h = stampHeader(new Uint8Array(16), 1, 19);
    expect(readWrapperHeader(h)).toEqual({ magic: 0x5045_5243_5631_3600n, version: 19, kind: 1 });
  });
  it("default parser name is used in the message", () => {
    expect(() => readWrapperHeader(new Uint8Array(3))).toThrow(/readWrapperHeader/);
  });
});

describe("resolveMarketGeometry", () => {
  const tables: LayoutTable[] = [LAYOUT_V21, LAYOUT_V22_VARIANT_B];
  for (const L of tables) {
    const base = L.marketGroupOff + L.marketGroupLen;
    const stride = L.assetSlotStride;
    it(`VERSION ${L.version} (${L.name}): region boundaries`, () => {
      // 1 byte short of the group end: TOO_SHORT (global floor for v2.1, per-table check for v2.2)
      expect(code(() => resolveMarketGeometry(stampMarket(new Uint8Array(base - 1), L.version), { parser: P }))).toBe("TOO_SHORT");
      expect(code(() => resolveMarketGeometry(stampMarket(new Uint8Array(base - 1), L.version), { parser: P, strictLength: false }))).toBe("TOO_SHORT");
      // exactly the group: 0 slots
      const g0 = resolveMarketGeometry(stampMarket(new Uint8Array(base), L.version), { parser: P });
      expect([g0.slotCount, g0.groupOff, g0.slotsBase]).toEqual([0, L.marketGroupOff, base]);
      // slot 0 one byte short / one byte over, strict vs lenient
      for (const len of [base + stride - 1, base + stride + 1]) {
        const d = stampMarket(new Uint8Array(len), L.version);
        expect(code(() => resolveMarketGeometry(d, { parser: P }))).toBe("BAD_LENGTH");
        expect(code(() => resolveMarketGeometry(d, { parser: P, strictLength: true }))).toBe("BAD_LENGTH");
        const lenient = resolveMarketGeometry(d, { parser: P, strictLength: false });
        expect(lenient.slotCount).toBe(len === base + stride - 1 ? 0 : 1);
      }
      // exact multiples
      const g2 = resolveMarketGeometry(stampMarket(new Uint8Array(base + 2 * stride), L.version), { parser: P });
      expect(g2.slotCount).toBe(2);
      expect(g2.layout).toBe(L);
      expect(g2.slotOff(1)).toBe(base + stride);
      expect(g2.engineOff(1)).toBe(base + stride + L.wrapperSlotLen);
    });
  }

  it("a v2.2 buffer between the v2.1 and v2.2 group ends is TOO_SHORT (not read with v2.1 offsets)", () => {
    const len = LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen - 1;
    expect(len).toBeGreaterThanOrEqual(LAYOUT_V21.marketGroupOff + LAYOUT_V21.marketGroupLen);
    const e = (() => { try { resolveMarketGeometry(stampMarket(new Uint8Array(len), 19), { parser: P }); } catch (x) { return x as UnknownLayoutError; } })();
    expect(e?.code).toBe("TOO_SHORT");
    expect(e?.version).toBe(19);
    expect(e?.kind).toBe(ACCOUNT_KIND.Market);
  });

  it("unknown VERSION / bad magic / wrong kind keep the historical phrase and code", () => {
    const len = LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen + LAYOUT_V22.assetSlotStride;
    for (const v of [0, 17, 20, 65535]) {
      const e = (() => { try { resolveMarketGeometry(stampMarket(new Uint8Array(len), v), { parser: P }); } catch (x) { return x as UnknownLayoutError; } })();
      expect(e?.code).toBe("UNKNOWN_VERSION");
      expect(e?.version).toBe(v);
      expect(e?.message).toContain("not a v17 market account (bad magic, version, or kind)");
    }
    expect(code(() => resolveMarketGeometry(new Uint8Array(len), { parser: P }))).toBe("BAD_MAGIC");
    const wk = (() => { try { resolveMarketGeometry(stampHeader(new Uint8Array(len), 2, 19), { parser: P }); } catch (x) { return x as UnknownLayoutError; } })();
    expect(wk?.code).toBe("WRONG_KIND");
    expect(wk?.message).toContain("not a market account (kind 2)");
  });

  it("versions allowlist rejects a registered VERSION", () => {
    const d = stampMarket(new Uint8Array(LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen), 19);
    expect(code(() => resolveMarketGeometry(d, { parser: P, versions: [18] }))).toBe("UNKNOWN_VERSION");
    expect(resolveMarketGeometry(d, { parser: P, versions: [19] }).layout.version).toBe(19);
  });

  it("custom registry: non-layout errors from resolveLayout are rethrown unchanged", () => {
    // A table whose group ends below 16 bytes lets a <16-byte buffer past the length floor,
    // so readWrapperHeader's own TOO_SHORT surfaces through the catch block's rethrow.
    const tiny = { ...LAYOUT_V22, version: 7, marketGroupOff: 4, marketGroupLen: 4 } as LayoutTable;
    const reg = new Map<number, LayoutTable>([[7, tiny]]);
    const e = (() => { try { resolveMarketGeometry(new Uint8Array(10), { parser: P, registry: reg }); } catch (x) { return x as UnknownLayoutError; } })();
    expect(e?.code).toBe("TOO_SHORT");
    expect(e?.message).toContain("data too short (10 < 16)");
  });

  it("custom registry changes the length floor", () => {
    const reg = new Map<number, LayoutTable>([[19, LAYOUT_V22_VARIANT_B]]);
    const len = LAYOUT_V21.marketGroupOff + LAYOUT_V21.marketGroupLen; // fine for default registry, short for this one
    expect(code(() => resolveMarketGeometry(stampMarket(new Uint8Array(len), 19), { parser: P, registry: reg }))).toBe("TOO_SHORT");
    expect(LAYOUTS_BY_VERSION.has(19)).toBe(true);
  });
});

describe("portfolioFilterForLayout base58 of the VERSION bytes", () => {
  it("leading zero byte becomes a '1' prefix; zero version is '11'", () => {
    // version 256 -> LE bytes [0x00, 0x01] -> base58 "12" (leading zero byte prefix + value 1 = "2")
    expect(portfolioFilterForLayout({ ...LAYOUT_V22, version: 256 } as LayoutTable).versionMemcmp).toEqual({ offset: 8, bytes: "12" });
    expect(portfolioFilterForLayout({ ...LAYOUT_V22, version: 0 } as LayoutTable).versionMemcmp.bytes).toBe("11");
  });
  it("matches the known encoding for 18 and 19", () => {
    // memcmp bytes are the on-chain LE u16: [18,0] -> "2NT", [19,0] -> "2Ss" (independent base58 of the byte string).
    expect(portfolioFilterForLayout(LAYOUT_V21).versionMemcmp.bytes).toBe("2NT");
    expect(portfolioFilterForLayout(LAYOUT_V22).versionMemcmp.bytes).toBe("2Ss");
  });
});
