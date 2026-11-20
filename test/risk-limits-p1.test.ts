/**
 * P1 tag 93 SetAssetRiskLimits + AssetRiskLimitsV17 (percolator-prog 07a1d0eb).
 * Record bytes cross-checked against the limits-UI lane's rustc-laid-out fixture
 * (app/__tests__/fixtures/limits/rust-layouts.json, `riskLimitsHex`, struct copied verbatim
 * from the P1 source; the field order was re-read at 58e379f1 and is unchanged).
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as root from "../src/index.js";
import {
  encodeSetAssetRiskLimitsP1,
  buildSetAssetRiskLimitsIxP1,
  decodeAssetRiskLimitsRecordP1,
  decodeAssetRiskLimitsP1,
  assetRiskLimitsAccountOffsetP1,
  ASSET_RISK_LIMITS_FIELD_OFF_P1,
  IX_TAG_P1,
} from "../src/abi/risk-limits-p1.js";
import { V17_MARKET_GROUP_OFF, V17_MARKET_GROUP_LEN, V17_MARKET_ASSET_SLOT_LEN } from "../src/solana/slab.js";
import { stampMarket } from "./helpers/stamp.js";

// rustc layout of AssetRiskLimitsV17 { side_oi_cap_q: 7e9, lp_floor_atoms: 2.5e8, lp_exposure_k_bps: 50000,
// exec_band_bps: 300, matcher_ext_mode: 1, max_requested_fee_bps: 40 } (limits-UI lane, layouts.rs)
const RUST_RL_HEX =
  "00863ba101000000000000000000000080b2e60e00000000000000000000000050c300002c010100280000000000000000000000000000000000000000000000";
const RUST_RL_OFFSETS = { sideOiCapQ: 0, lpFloorAtoms: 16, lpExposureKBps: 32, execBandBps: 36, matcherExtMode: 38, reserved0: 39, maxRequestedFeeBps: 40, reserved: 42 };
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const base = { assetIndex: 3, execBandBps: 300, lpExposureKBps: 50_000, lpFloorAtoms: 250_000_000n, sideOiCapQ: 7_000_000_000n };

describe("tag 93 SetAssetRiskLimits", () => {
  it("wire = [93, asset u16, band u16, k u32, floor u128, cap u128] (41 B) with no tail when both tail fields are 0", () => {
    expect(IX_TAG_P1.SetAssetRiskLimits).toBe(93);
    const d = encodeSetAssetRiskLimitsP1(base);
    expect(d.length).toBe(41);
    expect(hex(d)).toBe("5d" + "0300" + "2c01" + "50c30000" + "80b2e60e000000000000000000000000" + "00863ba1010000000000000000000000");
  });
  it("optional tail mirrors the wrapper encoder: ext only → 42 B; fee non-zero → 44 B (ext byte always precedes it)", () => {
    expect(hex(encodeSetAssetRiskLimitsP1({ ...base, matcherExtMode: 1 })).slice(82)).toBe("01");
    const f = encodeSetAssetRiskLimitsP1({ ...base, matcherExtMode: 1, maxRequestedFeeBps: 40 });
    expect(f.length).toBe(44);
    expect(hex(f).slice(82)).toBe("012800");
    expect(hex(encodeSetAssetRiskLimitsP1({ ...base, maxRequestedFeeBps: 40 })).slice(82)).toBe("002800");
  });
  it("refuses what the handler refuses", () => {
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, execBandBps: 10_001 })).toThrow();
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, lpExposureKBps: 10_000_001 })).toThrow();
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, sideOiCapQ: 100_000_000_000_001n })).toThrow();
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, matcherExtMode: 2 })).toThrow();
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, maxRequestedFeeBps: 1024 })).toThrow();
  });
  it("accounts = [upgrade authority (s), ProgramData, market (w)]", () => {
    const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
    const market = Keypair.generate().publicKey, ua = Keypair.generate().publicKey;
    const ix = buildSetAssetRiskLimitsIxP1(W, market, ua, base);
    const [pd] = PublicKey.findProgramAddressSync([W.toBytes()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"));
    expect(ix.keys).toEqual([
      { pubkey: ua, isSigner: true, isWritable: false },
      { pubkey: pd, isSigner: false, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
    ]);
  });
});

describe("AssetRiskLimitsV17 decoder", () => {
  it("field offsets = rustc layout; decodes the Rust-laid-out record", () => {
    expect(ASSET_RISK_LIMITS_FIELD_OFF_P1).toEqual(RUST_RL_OFFSETS);
    const r = decodeAssetRiskLimitsRecordP1(new Uint8Array(Buffer.from(RUST_RL_HEX, "hex")));
    expect(r).toEqual({ sideOiCapQ: 7_000_000_000n, lpFloorAtoms: 250_000_000n, lpExposureKBps: 50_000, execBandBps: 300, matcherExtMode: 1, maxRequestedFeeBps: 40 });
  });
  it("account offset 1958 + 2325·i = slots base + i·stride + 608", () => {
    for (const i of [0, 1, 9]) {
      expect(assetRiskLimitsAccountOffsetP1(i)).toBe(V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + i * V17_MARKET_ASSET_SLOT_LEN + 608);
    }
    expect(assetRiskLimitsAccountOffsetP1(0)).toBe(1958);
    const m = new Uint8Array(V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + 2 * V17_MARKET_ASSET_SLOT_LEN);
    stampMarket(m);
    m.set(Buffer.from(RUST_RL_HEX, "hex"), 1958 + 2325);
    expect(decodeAssetRiskLimitsP1(m, 1).maxRequestedFeeBps).toBe(40);
    expect(decodeAssetRiskLimitsP1(m, 0).maxRequestedFeeBps).toBe(0);
  });
  it("exported from the package root", () => {
    const r = root as Record<string, unknown>;
    for (const n of ["encodeSetAssetRiskLimitsP1", "buildSetAssetRiskLimitsIxP1", "decodeAssetRiskLimitsP1", "decodeAssetRiskLimitsRecordP1", "assetRiskLimitsAccountOffsetP1", "IX_TAG_P1"]) {
      expect(typeof r[n], n).not.toBe("undefined");
    }
  });
});

// Pinned against percolator-prog feat/v22-rc23-2026-10-22 src/v16_program.rs, decode arm
// `TAG_SET_ASSET_RISK_LIMITS => { asset_index: read_u16, exec_band_bps: read_u16, lp_exposure_k_bps: read_u32,
//   lp_floor_atoms: read_u128, side_oi_cap_q: read_u128,
//   matcher_ext_mode: if rest.is_empty() { 0 } else { read_u8 },
//   max_requested_fee_bps: if rest.is_empty() { 0 } else { read_u16 } ... }`
describe("tag 93 bounds and tail (limit / limit+1)", () => {
  const enc = (o: object) => encodeSetAssetRiskLimitsP1({ ...base, ...o });
  it("tail absent / ext-only / ext+fee lengths match the prog decode arm", () => {
    expect(enc({}).length).toBe(41);
    expect(enc({ matcherExtMode: 0, maxRequestedFeeBps: 0 }).length).toBe(41);
    expect(enc({ matcherExtMode: 1 }).length).toBe(42);
    expect(enc({ maxRequestedFeeBps: 1 }).length).toBe(44);
    const d = enc({ matcherExtMode: 1, maxRequestedFeeBps: 1023 });
    expect(hex(d).slice(82)).toBe("01ff03");
  });
  it("execBandBps 10000 ok, 10001 / -1 / 1.5 throw", () => {
    expect(enc({ execBandBps: 10_000 }).length).toBe(41);
    expect(() => enc({ execBandBps: 10_001 })).toThrow(/execBandBps/);
    expect(() => enc({ execBandBps: -1 })).toThrow(/execBandBps/);
    expect(() => enc({ execBandBps: 1.5 })).toThrow(/execBandBps/);
  });
  it("lpExposureKBps 1e7 ok, 1e7+1 throws", () => {
    expect(enc({ lpExposureKBps: 10_000_000 }).length).toBe(41);
    expect(() => enc({ lpExposureKBps: 10_000_001 })).toThrow(/lpExposureKBps/);
  });
  it("sideOiCapQ MAX ok, MAX+1 and negative throw", () => {
    expect(enc({ sideOiCapQ: 100_000_000_000_000n }).length).toBe(41);
    expect(() => enc({ sideOiCapQ: 100_000_000_000_001n })).toThrow(/sideOiCapQ/);
    expect(() => enc({ sideOiCapQ: -1n })).toThrow(/sideOiCapQ/);
  });
  it("matcherExtMode 0/1 ok, 2 throws", () => {
    expect(enc({ matcherExtMode: 0 }).length).toBe(41);
    expect(enc({ matcherExtMode: 1 }).length).toBe(42);
    expect(() => enc({ matcherExtMode: 2 })).toThrow(/matcherExtMode/);
  });
  it("maxRequestedFeeBps 1023 ok, 1024 throws", () => {
    expect(enc({ maxRequestedFeeBps: 1023 }).length).toBe(44);
    expect(() => enc({ maxRequestedFeeBps: 1024 })).toThrow(/maxRequestedFeeBps/);
  });
  it("assetIndex 0xffff ok, 0x10000 throws", () => {
    expect(enc({ assetIndex: 0xffff }).slice(1, 3)).toEqual(new Uint8Array([0xff, 0xff]));
    expect(() => enc({ assetIndex: 0x10000 })).toThrow(/assetIndex/);
  });
  it("lpFloorAtoms u128 max ok, 2^128 and negative throw", () => {
    expect(enc({ lpFloorAtoms: (1n << 128n) - 1n }).length).toBe(41);
    expect(() => enc({ lpFloorAtoms: 1n << 128n })).toThrow(/u128/);
    expect(() => enc({ lpFloorAtoms: -1n })).toThrow(/u128/);
  });
});

describe("decode short / wrong-size buffers", () => {
  it("record must be exactly 64 bytes", () => {
    expect(() => decodeAssetRiskLimitsRecordP1(new Uint8Array(63))).toThrow(/64 bytes, got 63/);
    expect(() => decodeAssetRiskLimitsRecordP1(new Uint8Array(65))).toThrow(/64 bytes, got 65/);
    expect(decodeAssetRiskLimitsRecordP1(new Uint8Array(64)).sideOiCapQ).toBe(0n);
  });
  it("market account too short for the asset record throws; negative / fractional index throws", () => {
    const full = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + V17_MARKET_ASSET_SLOT_LEN;
    const m = new Uint8Array(full);
    stampMarket(m);
    expect(() => decodeAssetRiskLimitsP1(m, 1)).toThrow(/too short for asset 1/);
    expect(() => assetRiskLimitsAccountOffsetP1(-1)).toThrow(/bad assetIndex/);
    expect(() => assetRiskLimitsAccountOffsetP1(0.5)).toThrow(/bad assetIndex/);
    const short = m.subarray(0, 1958 + 63);
    expect(() => decodeAssetRiskLimitsP1(short, 0)).toThrow();
  });
});
