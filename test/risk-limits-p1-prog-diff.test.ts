/**
 * Field-by-field pin of src/abi/risk-limits-p1.ts against percolator-prog
 * `feat/v22-rc23-2026-10-22` (d27f3d73), src/v16_program.rs:
 *   - tag 93 decode arm            :10653-10668 (asset u16, band u16, k u32, floor u128, cap u128,
 *                                    optional ext u8, optional fee u16)
 *   - tag 93 encoder               :11745-11761 (ext byte iff ext!=0||fee!=0; fee iff fee!=0)
 *   - handler bounds               :24632-24641 (band<=10000, k<=1e7, cap<=MAX_OI_SIDE_Q,
 *                                    ext<=1, fee<=1023)
 *   - handler accounts             :24621-24625 (0 upgrade authority signer, 1 ProgramData, 2 market writable)
 *   - struct AssetRiskLimitsV17    :3354-3395 (#[repr(C)], 64 B, offsets asserted 42/44/48/56/60)
 *   - ASSET_RISK_LIMITS_OFF 608    :438-441; MAX_EXEC_BAND_BPS 13663; MAX_LP_EXPOSURE_K_BPS 13665;
 *                                    MAX_REQUESTED_FEE_BPS 13909; MATCHER_EXT_MODE_V1 3474;
 *                                    engine MAX_OI_SIDE_Q = 1e14 (percolator lib.rs:31)
 * The tables below hard-code the Rust values; any drift in the SDK fails a row.
 */
import { describe, it, expect } from "vitest";
import {
  encodeSetAssetRiskLimitsP1,
  decodeAssetRiskLimitsRecordP1,
  decodeAssetRiskLimitsP1,
  assetRiskLimitsAccountOffsetP1,
  ASSET_RISK_LIMITS_FIELD_OFF_P1,
  ASSET_RISK_LIMITS_LEN_P1,
  ASSET_RISK_LIMITS_SLOT_OFF_P1,
  MAX_EXEC_BAND_BPS_P1,
  MAX_LP_EXPOSURE_K_BPS_P1,
  MAX_OI_SIDE_Q_P1,
  MATCHER_EXT_MODE_V1_P1,
  MAX_REQUESTED_FEE_BPS_P1,
} from "../src/abi/risk-limits-p1.js";
import { stampMarket } from "./helpers/stamp.js";
import { V17_MARKET_GROUP_OFF, V17_MARKET_GROUP_LEN, V17_MARKET_ASSET_SLOT_LEN } from "../src/solana/slab.js";

const base = { assetIndex: 0, execBandBps: 0, lpExposureKBps: 0, lpFloorAtoms: 0n, sideOiCapQ: 0n };
const U128_MAX = (1n << 128n) - 1n;

describe("constants == prog rc23", () => {
  it("bounds and record geometry", () => {
    expect(MAX_EXEC_BAND_BPS_P1).toBe(10_000);
    expect(MAX_LP_EXPOSURE_K_BPS_P1).toBe(10_000_000);
    expect(MAX_OI_SIDE_Q_P1).toBe(100_000_000_000_000n);
    expect(MATCHER_EXT_MODE_V1_P1).toBe(1);
    expect(MAX_REQUESTED_FEE_BPS_P1).toBe(1023);
    expect(ASSET_RISK_LIMITS_LEN_P1).toBe(64);
    expect(ASSET_RISK_LIMITS_SLOT_OFF_P1).toBe(608);
  });
});

describe("encoder: each field at its own wire offset/width (LE), max value, no bleed", () => {
  // [name, wire offset, width, max value]
  const rows: Array<[keyof typeof base, number, number, number | bigint]> = [
    ["assetIndex", 1, 2, 0xffff],
    ["execBandBps", 3, 2, 10_000],
    ["lpExposureKBps", 5, 4, 10_000_000],
    ["lpFloorAtoms", 9, 16, U128_MAX],
    ["sideOiCapQ", 25, 16, 100_000_000_000_000n],
  ];
  for (const [name, off, width, max] of rows) {
    it(`${name} @${off} w${width}`, () => {
      const d = encodeSetAssetRiskLimitsP1({ ...base, [name]: max });
      expect(d.length).toBe(41);
      expect(d[0]).toBe(93);
      let got = 0n;
      for (let i = width - 1; i >= 0; i--) got = (got << 8n) | BigInt(d[off + i]);
      expect(got).toBe(BigInt(max));
      // every other byte (past the tag) is zero
      for (let i = 1; i < 41; i++) if (i < off || i >= off + width) expect(d[i], `byte ${i}`).toBe(0);
    });
  }
  it("tail: ext @41 (u8), fee @42 (u16 LE); lengths 41 / 42 / 44 per prog encoder", () => {
    expect(encodeSetAssetRiskLimitsP1(base).length).toBe(41);
    expect(Array.from(encodeSetAssetRiskLimitsP1({ ...base, matcherExtMode: 1 }).subarray(41))).toEqual([1]);
    expect(Array.from(encodeSetAssetRiskLimitsP1({ ...base, matcherExtMode: 0, maxRequestedFeeBps: 1023 }).subarray(41))).toEqual([0, 0xff, 0x03]);
    expect(Array.from(encodeSetAssetRiskLimitsP1({ ...base, matcherExtMode: 1, maxRequestedFeeBps: 1023 }).subarray(41))).toEqual([1, 0xff, 0x03]);
  });
});

describe("encoder bounds: boundary accepted, boundary+1 refused (handler :24632-24641)", () => {
  const ok = (o: object) => () => encodeSetAssetRiskLimitsP1({ ...base, ...o });
  it("accepts the max of every field", () => {
    expect(ok({ assetIndex: 0xffff, execBandBps: 10_000, lpExposureKBps: 10_000_000, lpFloorAtoms: U128_MAX,
      sideOiCapQ: 100_000_000_000_000n, matcherExtMode: 1, maxRequestedFeeBps: 1023 })).not.toThrow();
  });
  const bad: Array<[string, object]> = [
    ["assetIndex > u16", { assetIndex: 0x10000 }],
    ["assetIndex negative", { assetIndex: -1 }],
    ["assetIndex non-integer", { assetIndex: 1.5 }],
    ["assetIndex NaN", { assetIndex: NaN }],
    ["band 10001", { execBandBps: 10_001 }],
    ["k 1e7+1", { lpExposureKBps: 10_000_001 }],
    ["ext 2", { matcherExtMode: 2 }],
    ["fee 1024", { maxRequestedFeeBps: 1024 }],
    ["floor negative", { lpFloorAtoms: -1n }],
    ["floor > u128", { lpFloorAtoms: U128_MAX + 1n }],
    ["cap negative", { sideOiCapQ: -1n }],
    ["cap MAX+1", { sideOiCapQ: 100_000_000_000_001n }],
  ];
  for (const [n, o] of bad) it(`refuses ${n}`, () => expect(ok(o)).toThrow());
});

describe("decoder: every field at its rustc offset (struct :3354-3395), no bleed", () => {
  // offset, width, field; offsets from offset_of! asserts / repr(C) order
  const rows: Array<[string, number, number, number | bigint]> = [
    ["sideOiCapQ", 0, 16, U128_MAX],
    ["lpFloorAtoms", 16, 16, U128_MAX],
    ["lpExposureKBps", 32, 4, 0xffffffff],
    ["execBandBps", 36, 2, 0xffff],
    ["matcherExtMode", 38, 1, 0xff],
    ["maxRequestedFeeBps", 40, 2, 0xffff],
  ];
  it("offsets table", () => {
    const F = ASSET_RISK_LIMITS_FIELD_OFF_P1;
    for (const [n, off] of rows) expect(F[n as keyof typeof F], n).toBe(off);
    expect(F.reserved0).toBe(39);
    // p2b_senior_floor_code (42, asserted :3399) is where the SDK's `reserved` starts
    expect(F.reserved).toBe(42);
  });
  for (const [name, off, width, max] of rows) {
    it(`${name} @${off} w${width}`, () => {
      const rec = new Uint8Array(64);
      let v = BigInt(max);
      for (let i = 0; i < width; i++) { rec[off + i] = Number(v & 0xffn); v >>= 8n; }
      const r = decodeAssetRiskLimitsRecordP1(rec) as unknown as Record<string, bigint | number>;
      for (const [n] of rows) expect(r[n], n).toBe(n === name ? max : (typeof r[n] === "bigint" ? 0n : 0));
    });
  }
  it("ignores bytes 39 and 42..64 (reserved0, p2b floor code, ADL episode)", () => {
    const rec = new Uint8Array(64).fill(0xff);
    for (let i = 0; i < 39; i++) rec[i] = 0;
    rec[38] = 0; rec[40] = 0; rec[41] = 0;
    expect(decodeAssetRiskLimitsRecordP1(rec)).toEqual({
      sideOiCapQ: 0n, lpFloorAtoms: 0n, lpExposureKBps: 0, execBandBps: 0, matcherExtMode: 0, maxRequestedFeeBps: 0,
    });
  });
  it("decodes through a non-zero byteOffset view", () => {
    const buf = new Uint8Array(70);
    buf[3 + 36] = 0x2c; buf[3 + 37] = 0x01;
    expect(decodeAssetRiskLimitsRecordP1(buf.subarray(3, 67)).execBandBps).toBe(300);
  });
  it("rejects a record that is not exactly 64 bytes", () => {
    expect(() => decodeAssetRiskLimitsRecordP1(new Uint8Array(63))).toThrow(/64 bytes/);
    expect(() => decodeAssetRiskLimitsRecordP1(new Uint8Array(65))).toThrow(/64 bytes/);
  });
});

describe("account-offset helper", () => {
  it("rejects bad asset indexes", () => {
    for (const i of [-1, 1.5, NaN]) expect(() => assetRiskLimitsAccountOffsetP1(i)).toThrow(/bad assetIndex/);
  });
  it("decodeAssetRiskLimitsP1 refuses a market too short for the asset", () => {
    const m = new Uint8Array(V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + V17_MARKET_ASSET_SLOT_LEN);
    stampMarket(m);
    expect(() => decodeAssetRiskLimitsP1(m, 5)).toThrow(/too short for asset 5/);
  });
});
