/**
 * Branch coverage for src/abi/risk-limits-p1.ts: range guards (int, u128 floor, OI cap),
 * the optional ext/fee tail choices, record length guard, and short market data.
 */
import { describe, it, expect } from "vitest";
import {
  encodeSetAssetRiskLimitsP1,
  decodeAssetRiskLimitsRecordP1,
  decodeAssetRiskLimitsP1,
  assetRiskLimitsAccountOffsetP1,
  ASSET_RISK_LIMITS_LEN_P1,
  MAX_EXEC_BAND_BPS_P1,
  MAX_LP_EXPOSURE_K_BPS_P1,
  MAX_OI_SIDE_Q_P1,
  MAX_REQUESTED_FEE_BPS_P1,
} from "../src/abi/risk-limits-p1.js";
import { V17_MARKET_GROUP_OFF, V17_MARKET_GROUP_LEN, V17_MARKET_ASSET_SLOT_LEN } from "../src/solana/slab.js";
import { stampMarket } from "./helpers/stamp.js";

const base = { assetIndex: 3, execBandBps: 300, lpExposureKBps: 50_000, lpFloorAtoms: 250_000_000n, sideOiCapQ: 7_000_000_000n };

describe("int() range guard", () => {
  it("rejects negative, fractional, NaN and over-max values per field", () => {
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, assetIndex: -1 })).toThrow(/assetIndex/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, assetIndex: 0x10000 })).toThrow(/assetIndex/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, execBandBps: 1.5 })).toThrow(/execBandBps/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, execBandBps: NaN })).toThrow(/execBandBps/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, execBandBps: MAX_EXEC_BAND_BPS_P1 + 1 })).toThrow(/execBandBps/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, lpExposureKBps: MAX_LP_EXPOSURE_K_BPS_P1 + 1 })).toThrow(/lpExposureKBps/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, matcherExtMode: 2 })).toThrow(/matcherExtMode/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, maxRequestedFeeBps: MAX_REQUESTED_FEE_BPS_P1 + 1 })).toThrow(/maxRequestedFeeBps/);
  });
  it("accepts the inclusive maxima", () => {
    const d = encodeSetAssetRiskLimitsP1({
      ...base, assetIndex: 0xffff, execBandBps: MAX_EXEC_BAND_BPS_P1, lpExposureKBps: MAX_LP_EXPOSURE_K_BPS_P1,
      matcherExtMode: 1, maxRequestedFeeBps: MAX_REQUESTED_FEE_BPS_P1,
    });
    expect(d.length).toBe(44);
  });
});

describe("u128 floor and OI cap guards", () => {
  it("lpFloorAtoms: negative and > u128 max throw; u128 max and 0 encode", () => {
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, lpFloorAtoms: -1n })).toThrow(/lpFloorAtoms out of u128 range/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, lpFloorAtoms: 1n << 128n })).toThrow(/lpFloorAtoms out of u128 range/);
    const max = encodeSetAssetRiskLimitsP1({ ...base, lpFloorAtoms: (1n << 128n) - 1n });
    expect(Buffer.from(max.subarray(9, 25)).toString("hex")).toBe("ff".repeat(16));
    expect(encodeSetAssetRiskLimitsP1({ ...base, lpFloorAtoms: 0n }).length).toBe(41);
  });
  it("sideOiCapQ: negative and > MAX_OI_SIDE_Q throw; the cap itself and 0 encode", () => {
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, sideOiCapQ: -1n })).toThrow(/sideOiCapQ must be in 0\.\./);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, sideOiCapQ: MAX_OI_SIDE_Q_P1 + 1n })).toThrow(/sideOiCapQ must be in 0\.\./);
    expect(encodeSetAssetRiskLimitsP1({ ...base, sideOiCapQ: MAX_OI_SIDE_Q_P1 }).length).toBe(41);
    expect(encodeSetAssetRiskLimitsP1({ ...base, sideOiCapQ: 0n }).length).toBe(41);
  });
});

describe("optional tail choices", () => {
  it("neither → 41 B; explicit zeros → 41 B", () => {
    expect(encodeSetAssetRiskLimitsP1(base).length).toBe(41);
    expect(encodeSetAssetRiskLimitsP1({ ...base, matcherExtMode: 0, maxRequestedFeeBps: 0 }).length).toBe(41);
  });
  it("ext only → 42 B; fee only → 44 B with a zero ext byte then fee u16 LE", () => {
    const e = encodeSetAssetRiskLimitsP1({ ...base, matcherExtMode: 1 });
    expect(e.length).toBe(42);
    expect(e[41]).toBe(1);
    const f = encodeSetAssetRiskLimitsP1({ ...base, maxRequestedFeeBps: 0x0102 });
    expect(f.length).toBe(44);
    expect(f[41]).toBe(0);
    expect([f[42], f[43]]).toEqual([0x02, 0x01]);
  });
});

describe("decoder guards", () => {
  it("record of wrong length throws (short and long)", () => {
    expect(() => decodeAssetRiskLimitsRecordP1(new Uint8Array(ASSET_RISK_LIMITS_LEN_P1 - 1))).toThrow(/must be 64 bytes, got 63/);
    expect(() => decodeAssetRiskLimitsRecordP1(new Uint8Array(ASSET_RISK_LIMITS_LEN_P1 + 1))).toThrow(/must be 64 bytes, got 65/);
  });
  it("market data truncated before the asset's record throws 'too short'", () => {
    const full = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + 2 * V17_MARKET_ASSET_SLOT_LEN;
    const m = new Uint8Array(full);
    stampMarket(m);
    const off1 = assetRiskLimitsAccountOffsetP1(1);
    // exactly fits asset 1's record → decodes; one byte less → too short
    expect(decodeAssetRiskLimitsP1(m.subarray(0, off1 + ASSET_RISK_LIMITS_LEN_P1), 1).maxRequestedFeeBps).toBe(0);
    expect(() => decodeAssetRiskLimitsP1(m.subarray(0, off1 + ASSET_RISK_LIMITS_LEN_P1 - 1), 1)).toThrow(/market account too short for asset 1/);
    // asset index beyond the account
    expect(() => decodeAssetRiskLimitsP1(m, 5)).toThrow(/too short for asset 5/);
  });
  it("assetRiskLimitsAccountOffsetP1 rejects negative and fractional indices", () => {
    expect(() => assetRiskLimitsAccountOffsetP1(-1)).toThrow(/bad assetIndex/);
    expect(() => assetRiskLimitsAccountOffsetP1(0.5)).toThrow(/bad assetIndex/);
  });
});
