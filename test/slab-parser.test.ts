import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  parseHeader, parseConfig, parseEngine, parseAllAccounts, parseParams,
  detectSlabLayout, detectLayout, readNonce, readLastThrUpdateSlot,
} from "../src/solana/slab.js";

/**
 * Build a valid V0 slab buffer (deployed devnet layout):
 *   HEADER_LEN = 72, CONFIG_LEN = 408, ENGINE_OFF = 480
 *   ACCOUNT_SIZE = 240, ENGINE_BITMAP_OFF = 320
 *
 * Using medium tier (1024 accounts): total = 248,760 bytes
 */
function buildMockSlab(): Uint8Array {
  const size = 248_760; // V0 medium tier
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);

  // Header: PERCOLAT magic as u64 LE
  const magic = [0x54, 0x41, 0x4c, 0x4f, 0x43, 0x52, 0x45, 0x50];
  for (let i = 0; i < 8; i++) buf[i] = magic[i];
  // version = 1
  dv.setUint32(8, 1, true);
  // bump = 255
  buf[12] = 255;
  // admin (32 bytes of 1s at offset 16)
  for (let i = 16; i < 48; i++) buf[i] = 1;
  // _reserved at offset 48: nonce=42, lastThrUpdateSlot=12345
  dv.setBigUint64(48, 42n, true);
  dv.setBigUint64(56, 12345n, true);

  // Config at offset 72 (V0 HEADER_LEN = 72)
  // collateralMint (32 bytes of 2s)
  for (let i = 72; i < 104; i++) buf[i] = 2;
  // vaultPubkey (32 bytes of 3s)
  for (let i = 104; i < 136; i++) buf[i] = 3;

  // Engine at offset 480 (V0 ENGINE_OFF)
  const engineBase = 480;
  // vault = 1000000 (U128, lo 8 bytes)
  dv.setBigUint64(engineBase + 0, 1000000n, true);
  // insurance balance = 500000 (at engine+16)
  dv.setBigUint64(engineBase + 16, 500000n, true);

  // RiskParams at engine+48 (V0: InsuranceFund=32 bytes, params at 48)
  const paramsBase = engineBase + 48;
  dv.setBigUint64(paramsBase + 0, 100n, true);   // warmupPeriodSlots
  dv.setBigUint64(paramsBase + 8, 500n, true);    // maintenanceMarginBps
  dv.setBigUint64(paramsBase + 16, 1000n, true);  // initialMarginBps
  dv.setBigUint64(paramsBase + 24, 10n, true);    // tradingFeeBps

  // Engine runtime state at engine+104 (V0: params=56 bytes, 48+56=104)
  dv.setBigUint64(engineBase + 104, 400000000n, true); // currentSlot
  // last_crank_slot at engine+144
  dv.setBigUint64(engineBase + 144, 399999900n, true);
  // max_crank_staleness at engine+152
  dv.setBigUint64(engineBase + 152, 400n, true);
  // totalOpenInterest at engine+160 (U128)
  dv.setBigUint64(engineBase + 160, 100000n, true);
  // cTot at engine+176 (U128)
  dv.setBigUint64(engineBase + 176, 800000n, true);

  // Bitmap at engine+320, for 1024 accounts: 16 bitmap words
  // numUsedAccounts at engine + 320 + 16*8 = engine+448
  dv.setUint16(engineBase + 448, 0, true);
  // nextAccountId at ceil((448+2)/8)*8 = 456
  dv.setBigUint64(engineBase + 456, 1n, true);

  return buf;
}

describe("detectSlabLayout", () => {
  it("detects V0 medium tier", () => {
    const layout = detectSlabLayout(248_760);
    expect(layout).not.toBeNull();
    expect(layout!.version).toBe(0);
    expect(layout!.maxAccounts).toBe(1024);
    expect(layout!.engineOff).toBe(480);
    expect(layout!.accountSize).toBe(240);
  });

  it("returns null for unknown size", () => {
    expect(detectSlabLayout(12345)).toBeNull();
  });

  // GH#1234: postBitmap=2 sizes (new V1D slabs)
  it("detects V1D small tier (65088) — GH#1234 size, prog f7a2e8ab layout", () => {
    const layout = detectSlabLayout(65_088);
    expect(layout).not.toBeNull();
    expect(layout!.maxAccounts).toBe(256);
    // CONFIG_LEN 352 → engine at 456 (was pinned at 424, which is inside MarketConfig)
    expect(layout!.engineOff).toBe(456);
    expect(layout!.accountSize).toBe(248);
  });

  // GH#1237: postBitmap=18 legacy sizes (slabs created before GH#1234 fix)
  it("detects V1D small legacy tier (65104, postBitmap=18) — GH#1237 regression fix", () => {
    const layout = detectSlabLayout(65_104);
    expect(layout).not.toBeNull();
    expect(layout!.maxAccounts).toBe(256);
    expect(layout!.engineOff).toBe(424);
    expect(layout!.accountSize).toBe(248);
    // accountsOff for postBitmap=18: 424 + ceil((624+32+18+512)/8)*8 = 424+1192 = 1616
    expect(layout!.accountsOff).toBe(1616);
  });

  it("V1D legacy accountsOff is 16 bytes larger than V1D new accountsOff — GH#1237", () => {
    const legacy = detectSlabLayout(65_104)!;
    const newSlot = detectSlabLayout(65_088)!;
    expect(legacy.accountsOff - newSlot.accountsOff).toBe(16);
  });
});

// GH#1238: detectLayout must delegate to layout.accountsOff (not recompute with postBitmap=18)
describe("detectLayout (GH#1238)", () => {
  it("returns correct accountsOff for V1D new slab (65088, postBitmap=2)", () => {
    const result = detectLayout(65_088);
    expect(result).not.toBeNull();
    // accountsOff = 456 + ceil((576+32+18+512)/8)*8 = 456+1144 = 1600 (same as the old 424/postBitmap=2 model)
    expect(result!.accountsOff).toBe(1600);
  });

  it("returns correct accountsOff for V1D legacy slab (65104, postBitmap=18)", () => {
    const result = detectLayout(65_104);
    expect(result).not.toBeNull();
    // postBitmap=18: accountsOff = 424 + 1192 = 1616
    expect(result!.accountsOff).toBe(1616);
  });

  it("accountsOff for V1D new is 16 bytes less than V1D legacy", () => {
    const newResult = detectLayout(65_088)!;
    const legacyResult = detectLayout(65_104)!;
    expect(legacyResult.accountsOff - newResult.accountsOff).toBe(16);
  });

  it("returns null for unknown size", () => {
    expect(detectLayout(12345)).toBeNull();
  });
});

describe("parseHeader", () => {
  it("parses valid header", () => {
    const buf = buildMockSlab();
    const h = parseHeader(buf);
    expect(h.magic).toBe(0x504552434f4c4154n);
    expect(h.version).toBe(1);
    expect(h.bump).toBe(255);
    expect(h.resolved).toBe(false);
    expect(h.nonce).toBe(42n);
    expect(h.lastThrUpdateSlot).toBe(12345n);
  });

  it("throws on invalid magic", () => {
    const buf = new Uint8Array(248_760);
    expect(() => parseHeader(buf)).toThrow("Invalid slab magic");
  });

  it("throws on too-short data", () => {
    expect(() => parseHeader(new Uint8Array(10))).toThrow("too short");
  });

  it("throws on empty buffer", () => {
    expect(() => parseHeader(new Uint8Array(0))).toThrow("too short");
  });

  it("throws when buffer is one byte shorter than minimum header (72)", () => {
    expect(() => parseHeader(new Uint8Array(71))).toThrow("too short");
  });
});

describe("parseConfig", () => {
  it("parses valid config", () => {
    const buf = buildMockSlab();
    const c = parseConfig(buf);
    expect(c.collateralMint.toBytes()[0]).toBe(2);
    expect(c.vaultPubkey.toBytes()[0]).toBe(3);
  });
});

describe("parseEngine", () => {
  it("parses engine state", () => {
    const buf = buildMockSlab();
    const e = parseEngine(buf);
    expect(e.vault).toBe(1000000n);
    expect(e.insuranceFund.balance).toBe(500000n);
    expect(e.currentSlot).toBe(400000000n);
    expect(e.lastCrankSlot).toBe(399999900n);
    expect(e.maxCrankStalenessSlots).toBe(400n);
    expect(e.totalOpenInterest).toBe(100000n);
    expect(e.cTot).toBe(800000n);
    expect(e.numUsedAccounts).toBe(0);
    expect(e.nextAccountId).toBe(1n);
  });
});

describe("parseParams", () => {
  it("parses risk params", () => {
    const buf = buildMockSlab();
    const p = parseParams(buf);
    expect(p.warmupPeriodSlots).toBe(100n);
    expect(p.maintenanceMarginBps).toBe(500n);
    expect(p.initialMarginBps).toBe(1000n);
    expect(p.tradingFeeBps).toBe(10n);
  });
});

describe("parseAllAccounts", () => {
  it("returns empty for no used accounts", () => {
    const buf = buildMockSlab();
    const accounts = parseAllAccounts(buf);
    expect(accounts).toEqual([]);
  });
});

describe("readNonce / readLastThrUpdateSlot null-layout guard", () => {
  it("readNonce throws for unrecognized slab size", () => {
    const garbage = new Uint8Array(100);
    expect(() => readNonce(garbage)).toThrow("unrecognized");
  });

  it("readLastThrUpdateSlot throws for unrecognized slab size", () => {
    const garbage = new Uint8Array(100);
    expect(() => readLastThrUpdateSlot(garbage)).toThrow("unrecognized");
  });

  it("readNonce succeeds for valid V0 slab", () => {
    const buf = buildMockSlab();
    expect(() => readNonce(buf)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Layout-detection killers (SDK-REPORT-SLABPARSERTESTMUT). Each block names the
// slab.ts mutants it kills. Expected values are literal byte sizes / offsets
// worked out from the struct constants, not recomputed with computeSlabSize.
// V1D (SLAB_TIERS_V1D) uses the prog f7a2e8ab layout pinned in #708:
// engine 456, bitmap at engine+576, postBitmap 18. V1D-legacy keeps 424 / 624 / 18.
// ---------------------------------------------------------------------------

const MAGIC_LE = [0x54, 0x41, 0x4c, 0x4f, 0x43, 0x52, 0x45, 0x50];

/** Zeroed buffer with PERCOLAT magic and a u32 LE version at offset 8. */
function slabWithVersion(len: number, version: number): Uint8Array {
  const buf = new Uint8Array(len);
  MAGIC_LE.forEach((b, i) => (buf[i] = b));
  new DataView(buf.buffer).setUint32(8, version, true);
  return buf;
}

// Kills M09 M10 M11 (TIERS), M23 M24 M25 (hardcoded maxAccounts), M32 M33 (V0 accountsOff).
describe("tier tables — every tier resolves to its own geometry", () => {
  const cases: Array<[string, number, number, number, number]> = [
    // [family, dataLen, maxAccounts, engineOff, accountsOff]
    ["V0 micro", 16_320, 64, 480, 960],
    ["V0 small", 62_808, 256, 480, 1_368],
    ["V0 medium", 248_760, 1024, 480, 3_000],
    ["V0 large", 992_568, 4096, 480, 9_528],
    ["V1D micro", 17_064, 64, 456, 1_192],
    ["V1D small", 65_088, 256, 456, 1_600],
    ["V1D medium", 257_184, 1024, 456, 3_232],
    ["V1D large", 1_025_568, 4096, 456, 9_760],
    ["V1D-legacy micro", 17_080, 64, 424, 1_208],
    ["V1D-legacy small", 65_104, 256, 424, 1_616],
    ["V1D-legacy medium", 257_200, 1024, 424, 3_248],
    ["V1D-legacy large", 1_025_584, 4096, 424, 9_776],
  ];
  it.each(cases)("%s (%i bytes)", (_name, len, n, engineOff, accountsOff) => {
    const l = detectSlabLayout(len);
    expect(l).not.toBeNull();
    expect(l!.maxAccounts).toBe(n);
    expect(l!.bitmapWords).toBe(n / 64);
    expect(l!.engineOff).toBe(engineOff);
    expect(l!.accountsOff).toBe(accountsOff);
    // The accounts array ends exactly at the slab end for these families.
    expect(l!.accountsOff + n * l!.accountSize).toBe(len);
  });
});

// Kills M19: near-miss sizes must be rejected, not snapped to a neighbouring tier.
describe("near-miss sizes return null (no fallthrough tier)", () => {
  it.each([65_080, 65_087, 65_089, 65_096, 65_112, 248_752, 248_768, 1_025_576])("%i -> null", (len) => {
    expect(detectSlabLayout(len)).toBeNull();
    expect(detectLayout(len)).toBeNull();
  });
});

// Kills M14 M15 M16 M17 M40: the u32 version at offset 8 settles the V1D/V2 size collision.
describe("V1D/V2 size collision is settled by the u32 version at offset 8", () => {
  it("65088 with version=2 is V2 (engineOff 600)", () => {
    const l = detectSlabLayout(65_088, slabWithVersion(65_088, 2))!;
    expect(l.version).toBe(2);
    expect(l.engineOff).toBe(600);
  });
  it("65088 with version=1 stays V1D (engineOff 456)", () => {
    const l = detectSlabLayout(65_088, slabWithVersion(65_088, 1))!;
    expect(l.version).toBe(1);
    expect(l.engineOff).toBe(456);
  });
  it("version bytes outside offset 8 do not flip the layout", () => {
    const buf = slabWithVersion(65_088, 1);
    new DataView(buf.buffer).setUint32(12, 2, true);
    expect(detectSlabLayout(65_088, buf)!.engineOff).toBe(456);
  });
  it("a 12-byte header probe is enough to see version=2", () => {
    expect(detectSlabLayout(65_088, slabWithVersion(12, 2))!.engineOff).toBe(600);
  });
  it("a probe shorter than 12 bytes falls back to V1D", () => {
    expect(detectSlabLayout(65_088, slabWithVersion(12, 2).subarray(0, 11))!.engineOff).toBe(456);
  });
  it("V2 micro (17064, version=2) is V2 too", () => {
    expect(detectSlabLayout(17_064, slabWithVersion(17_064, 2))!.engineOff).toBe(600);
  });
});

// Kills M30 M31: the descriptor fields parseEngine reads after the bitmap.
describe("V1D descriptor fields used by parseEngine", () => {
  it("V1D and V1D-legacy both report postBitmap 18; bitmap at 576 vs 624", () => {
    const n = detectSlabLayout(65_088)!;
    const l = detectSlabLayout(65_104)!;
    expect(n.postBitmap).toBe(18);
    expect(l.postBitmap).toBe(18);
    expect(n.engineBitmapOff).toBe(576);
    expect(l.engineBitmapOff).toBe(624);
  });
  it("V1D: num_used at 1064 and next_account_id at 1072 are read, not free_head at 1080", () => {
    const buf = slabWithVersion(65_088, 1);
    const dv = new DataView(buf.buffer);
    // engine 456 + bitmap 576 + 4 words * 8 = 1064 num_used, 1072 next_account_id, 1080 free_head
    dv.setUint16(1064, 3, true);
    dv.setBigUint64(1072, 9n, true);
    dv.setUint16(1080, 0xbeef, true);
    const e = parseEngine(buf);
    expect(e.numUsedAccounts).toBe(3);
    expect(e.nextAccountId).toBe(9n);
  });
  it("V1D-legacy: num_used right after the bitmap at 424 + 624 + 32 = 1080 is read", () => {
    const buf = slabWithVersion(65_104, 1);
    new DataView(buf.buffer).setUint16(1080, 7, true);
    expect(parseEngine(buf).numUsedAccounts).toBe(7);
  });
});

// Kills M38 M39: detectLayout's full return shape, not just accountsOff.
describe("detectLayout returns the exact legacy triple", () => {
  it.each([
    [65_088, { bitmapWords: 4, accountsOff: 1_600, maxAccounts: 256 }],
    [65_104, { bitmapWords: 4, accountsOff: 1_616, maxAccounts: 256 }],
    [248_760, { bitmapWords: 16, accountsOff: 3_000, maxAccounts: 1024 }],
    [16_320, { bitmapWords: 1, accountsOff: 960, maxAccounts: 64 }],
  ])("%i", (len, want) => {
    expect(detectLayout(len)).toEqual(want);
  });
});
