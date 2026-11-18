/**
 * Branch coverage for src/solana/slab.ts: legacy size-keyed layouts whose tier tables are NOT exported
 * (V0, V1, V1-legacy, V1D, V1D-legacy, V2, V12_1 host/SBF, V12_1_EP). Slab sizes are derived from the
 * documented engineOff/bitmapOff/accountSize geometry with the same formula the SDK uses, then every
 * reader (detect, config, params, engine, header, accounts) is run over a real-sized buffer.
 * Tests only; no src change.
 */
import { describe, expect, it } from "vitest";
import {
  detectLayout,
  detectSlabLayout,
  isAccountUsed,
  maxAccountIndex,
  parseAccount,
  parseAllAccounts,
  parseConfig,
  parseEngine,
  parseHeader,
  parseParams,
  parseUsedIndices,
  readLastThrUpdateSlot,
  readNonce,
} from "../src/solana/slab.js";

const SLAB_MAGIC = 0x504552434f4c4154n;
const TIERS = [64, 256, 1024, 4096] as const;

function size(engineOff: number, bitmapOff: number, accountSize: number, n: number, postBitmap = 18): number {
  const pre = bitmapOff + Math.ceil(n / 64) * 8 + postBitmap + n * 2;
  return engineOff + Math.ceil(pre / 8) * 8 + n * accountSize;
}

// [name, engineOff, bitmapOff, accountSize, postBitmap]
const GEOMETRIES: [string, number, number, number, number][] = [
  ["V0", 480, 320, 240, 18],
  ["V1", 600, 656, 248, 18],
  ["V1_LEGACY", 640, 656, 248, 18],
  ["V1D", 424, 624, 248, 2],
  ["V1D_LEGACY", 424, 624, 248, 18],
  ["V12_1_SBF", 616, 584, 280, 18],
  ["V12_1_EP_SBF", 616, 584, 288, 18],
];

function stamp(len: number, version?: number): Uint8Array {
  const buf = new Uint8Array(len);
  const dv = new DataView(buf.buffer);
  dv.setBigUint64(0, SLAB_MAGIC, true);
  if (version !== undefined) dv.setUint32(8, version, true);
  return buf;
}

describe("legacy size-keyed layouts: detect + every reader", () => {
  for (const [name, eo, bo, as, pb] of GEOMETRIES) {
    for (const n of TIERS) {
      if (n > 1024) continue; // largest tier adds no new branches and is slow
      const len = size(eo, bo, as, n, pb);
      it(`${name} n=${n} (${len} bytes)`, () => {
        const L = detectSlabLayout(len);
        expect(L).not.toBeNull();
        expect(L!.maxAccounts).toBe(n);
        expect([L!.engineOff, L!.accountSize]).toEqual([eo, as]);
        expect(detectLayout(len)).toEqual({
          bitmapWords: L!.bitmapWords,
          accountsOff: L!.accountsOff,
          maxAccounts: L!.maxAccounts,
        });
        // V1_LEGACY documents a 16-byte gap (accounts start at +16 vs the size formula), so the last slot overruns
        const last = name === "V1_LEGACY" ? n - 2 : n - 1;
        expect(L!.accountsOff + (last + 1) * L!.accountSize).toBeLessThanOrEqual(len);

        const buf = stamp(len);
        const h = parseHeader(buf);
        expect(h.magic).toBe(SLAB_MAGIC);
        expect(() => parseConfig(buf, L)).not.toThrow();
        expect(() => parseParams(buf, L)).not.toThrow();
        expect(() => parseEngine(buf)).not.toThrow();
        expect(typeof readNonce(buf)).toBe("bigint");
        expect(typeof readLastThrUpdateSlot(buf)).toBe("bigint");
        expect(maxAccountIndex(len)).toBe(name === "V1_LEGACY" ? n - 1 : n); // legacy 16-byte gap costs one slot

        // mark accounts 0 and n-1 used via the layout's own bitmap offset
        const bm = L!.engineOff + L!.engineBitmapOff;
        buf[bm] |= 0x01;
        buf[bm + Math.floor(last / 8)] |= 1 << (last % 8);
        expect(parseUsedIndices(buf)).toEqual([0, last]);
        expect(isAccountUsed(buf, 0)).toBe(true);
        expect(isAccountUsed(buf, 1)).toBe(false);
        const all = parseAllAccounts(buf);
        expect(all.map((a) => a.idx)).toEqual([0, last]);
        expect(parseAccount(buf, last)).toEqual(all[1].account);
        expect(() => parseAccount(buf, n + 1)).toThrow();
      });
    }
  }

  it("V1D-sized slab with version==2 header is detected as the V2 layout (version-keyed disambiguation)", () => {
    const len = size(424, 624, 248, 256, 2);
    const v1d = detectSlabLayout(len)!;
    const v2 = detectSlabLayout(len, stamp(len, 2))!;
    const notV2 = detectSlabLayout(len, stamp(len, 1))!;
    expect(v2.engineOff).toBe(600);
    expect(v2.engineOff).not.toBe(v1d.engineOff);
    expect(notV2.engineOff).toBe(v1d.engineOff);
    // a buffer shorter than the 12-byte version probe falls back to V1D
    expect(detectSlabLayout(len, new Uint8Array(8))!.engineOff).toBe(v1d.engineOff);
    // V2 parse paths
    const buf = stamp(len, 2);
    expect(() => parseConfig(buf, v2)).not.toThrow();
    expect(() => parseParams(buf, v2)).not.toThrow();
    expect(() => parseEngine(buf)).not.toThrow();
  });

  it("returns null for an unknown size and for a tiny buffer", () => {
    expect(detectSlabLayout(0)).toBeNull();
    expect(detectLayout(12345)).toBeNull();
    expect(() => parseEngine(new Uint8Array(16))).toThrow();
    expect(() => parseAccount(new Uint8Array(16), 0)).toThrow();
  });
});

describe("host / SBF-small variants resolved by data length", () => {
  const n = 256;
  const v1217Native =
    592 + Math.ceil((752 + (n / 64) * 8 + 4 + n * 2) / 16) * 16 + n * 368 + 160 + n * 8;
  const CASES: [string, number][] = [
    ["V12_1 host (648/1016/320)", size(648, 1016, 320, n)],
    ["V12_15 SBF small", 237512],
    ["V12_17 native", v1217Native],
  ];
  for (const [name, len] of CASES) {
    it(`${name}: detect + readers + first account`, () => {
      const L = detectSlabLayout(len);
      expect(L).not.toBeNull();
      expect(L!.maxAccounts).toBe(n);
      const buf = stamp(len);
      expect(() => parseConfig(buf, L)).not.toThrow();
      expect(() => parseParams(buf, L)).not.toThrow();
      expect(() => parseEngine(buf)).not.toThrow();
      buf[L!.engineOff + L!.engineBitmapOff] = 0x01;
      const all = parseAllAccounts(buf);
      expect(all.map((a) => a.idx)).toEqual([0]);
      expect(parseAccount(buf, 0)).toEqual(all[0].account);
    });
  }
});
