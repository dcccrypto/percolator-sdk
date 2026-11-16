/**
 * Branch pins for src/abi/risk-limits-p1.ts and src/abi/v22-lot.ts (input-guard branches).
 * Source of truth: percolator-prog 58e379f1 src/v16_program.rs — `validate_asset_risk_limits` (:2514-2516) bounds the record the same way the SDK `int()` checks do
 * (those bounds are covered in risk-limits-p1.test.ts); oracle prices must be non-zero (`effective_price == 0` refused, :1677;
 * `out == 0` refused at percolator-prog 1dd268ad :6172).
 * The u128 / assetIndex / short-account guards are SDK-side shape checks (u128 wire field; slot must fit in the account).
 */
import { describe, it, expect } from "vitest";
import {
  encodeSetAssetRiskLimitsP1, assetRiskLimitsAccountOffsetP1, decodeAssetRiskLimitsP1, decodeAssetRiskLimitsRecordP1, ASSET_RISK_LIMITS_LEN_P1,
} from "../src/abi/risk-limits-p1.js";
import { LAYOUT_V22 } from "../src/abi/layout.js";
import { lotExpOfMarketV22, pythPriceToLotE6V22 } from "../src/abi/v22-lot.js";
import { stampMarket } from "./helpers/stamp.js";

const base = { assetIndex: 0, execBandBps: 300, lpExposureKBps: 50_000, lpFloorAtoms: 1n, sideOiCapQ: 1n };

describe("risk-limits-p1 guard branches", () => {
  it("lpFloorAtoms must fit u128 (negative and > 2^128-1)", () => {
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, lpFloorAtoms: -1n })).toThrow(/u128/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, lpFloorAtoms: 1n << 128n })).toThrow(/u128/);
    expect(encodeSetAssetRiskLimitsP1({ ...base, lpFloorAtoms: (1n << 128n) - 1n }).length).toBe(41);
  });
  it("sideOiCapQ bounds: negative and above MAX_OI_SIDE_Q", () => {
    expect(encodeSetAssetRiskLimitsP1({ ...base, sideOiCapQ: 100_000_000_000_000n }).length).toBe(41);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, sideOiCapQ: -1n })).toThrow(/sideOiCapQ/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, sideOiCapQ: 100_000_000_000_001n })).toThrow(/sideOiCapQ/);
  });
  it("assetRiskLimitsAccountOffsetP1 rejects negative and fractional slots", () => {
    expect(() => assetRiskLimitsAccountOffsetP1(-1)).toThrow(/bad assetIndex/);
    expect(() => assetRiskLimitsAccountOffsetP1(1.5)).toThrow(/bad assetIndex/);
    expect(assetRiskLimitsAccountOffsetP1(0, LAYOUT_V22)).toBe(2006);
  });
  it("decodeAssetRiskLimitsP1 throws when the account ends before the record", () => {
    const m = stampMarket(new Uint8Array(1398 + 2661), 19);
    const off = assetRiskLimitsAccountOffsetP1(5, LAYOUT_V22);
    expect(off + ASSET_RISK_LIMITS_LEN_P1).toBeGreaterThan(m.length);
    expect(() => decodeAssetRiskLimitsP1(m, 5)).toThrow(/too short/);
  });
});

describe("record length guard", () => {
  it("decodeAssetRiskLimitsRecordP1 requires exactly 64 bytes", () => {
    expect(() => decodeAssetRiskLimitsRecordP1(new Uint8Array(63))).toThrow(/64 bytes/);
    expect(() => decodeAssetRiskLimitsRecordP1(new Uint8Array(65))).toThrow(/64 bytes/);
  });
});

describe("v22-lot guard branches", () => {
  it("lotExpOfMarketV22 rejects a missing, negative or fractional asset slot", () => {
    const d = stampMarket(new Uint8Array(1398 + 2661), 19);
    expect(() => lotExpOfMarketV22(d, 99)).toThrow(RangeError);
    expect(() => lotExpOfMarketV22(d, -1)).toThrow(RangeError);
    expect(() => lotExpOfMarketV22(d, 0.5)).toThrow(RangeError);
  });
  it("pythPriceToLotE6V22 rejects zero and negative prices", () => {
    expect(() => pythPriceToLotE6V22(0n, -8, 0)).toThrow(/> 0/);
    expect(() => pythPriceToLotE6V22(-5n, -8, 0)).toThrow(/> 0/);
  });
});
