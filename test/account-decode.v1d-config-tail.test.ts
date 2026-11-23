/**
 * parseConfig on 65088 B V1D slabs: the config tail was read 32 bytes too early.
 *
 * The program that wrote these slabs is percolator-prog f7a2e8ab (2026-02-24). Its MarketConfig
 * (src/percolator.rs:1896, SBF CONFIG_LEN 352) keeps 4 funding_premium_* fields after
 * funding_max_bps_per_slot (src/percolator.rs:1929-1935), so every field after them sits 32 B
 * later than the generic reader assumes. Config-relative offsets (abs = 104 + rel):
 *
 *   funding_premium_weight_bps        u64  @160   (percolator.rs:1929)
 *   funding_settlement_interval_slots u64  @168
 *   funding_premium_dampening_e6      u64  @176
 *   funding_premium_max_bps_per_slot  i64  @184   (percolator.rs:1935)
 *   thresh_floor                      u128 @192   (percolator.rs:1941)
 *   thresh_risk_bps                   u64  @208
 *   thresh_update_interval_slots      u64  @216
 *   thresh_step_bps                   u64  @224
 *   thresh_alpha_bps                  u64  @232
 *   thresh_min                        u128 @240
 *   thresh_max                        u128 @256
 *   thresh_min_step                   u128 @272   (percolator.rs:1955)
 *   oracle_authority                  [u8;32] @288 (percolator.rs:1962)
 *   authority_price_e6                u64  @320
 *   authority_timestamp               i64  @328
 *   oracle_price_cap_e2bps            u64  @336
 *   last_effective_price_e6           u64  @344   (percolator.rs:1976)
 *   -- end of config (352); engine at abs 456 --
 *
 * There is no oi_cap_multiplier_bps / max_pnl_cap in this struct: the old reader took them from
 * abs 424/432 (authority_price_e6 / authority_timestamp). They must read 0.
 *
 * The 65104 B legacy V1D variant (configLen 320) and current layouts keep the generic reader.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { detectSlabLayout, parseConfig } from "../src/solana/slab.js";

const dir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "fixtures", "accounts");
const fx = JSON.parse(readFileSync(resolve(dir, "devnet-wrapper-slab-v1d.json"), "utf8")) as {
  account_address: string;
  cluster_slot: number;
  data_base64: string;
  total_data_length: number;
};
const data = new Uint8Array(fx.total_data_length);
data.set(Buffer.from(fx.data_base64, "base64"), 0);

const CFG = 104; // HEADER_LEN

function put(d: Uint8Array, abs: number, value: bigint, bytes: number): void {
  let v = value < 0n ? (1n << BigInt(bytes * 8)) + value : value;
  for (let i = 0; i < bytes; i++) {
    d[abs + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

describe("V1D 65088 B capture (2swBcS47): config tail decodes at the f7a2e8ab offsets", () => {
  it("is the captured devnet account", () => {
    expect(fx.account_address).toBe("2swBcS47wkp19hMsLVAw1y1GihkP9EYAoLkPRQHX43dM");
    expect(fx.cluster_slot).toBe(456513856);
    expect(data.length).toBe(65_088);
    expect(detectSlabLayout(data.length, data)!.configLen).toBe(352);
  });

  it("thresh_* values are the ones the program stored", () => {
    const c = parseConfig(data);
    expect(c.threshFloor).toBe(0n);
    expect(c.threshRiskBps).toBe(200n); // was 1_000_000n (funding_premium_dampening_e6)
    expect(c.threshUpdateIntervalSlots).toBe(10n); // was 5n
    expect(c.threshStepBps).toBe(2_000n);
    expect(c.threshAlphaBps).toBe(5_000n);
    expect(c.threshMin).toBe(0n);
    expect(c.threshMax).toBe(10_000_000_000_000_000_000n);
    expect(c.threshMinStep).toBe(1n);
  });

  it("oracle authority / circuit-breaker fields are the ones the program stored", () => {
    const c = parseConfig(data);
    expect(c.oracleAuthority.equals(PublicKey.default)).toBe(true);
    expect(c.authorityPriceE6).toBe(1_000_000n);
    expect(c.authorityTimestamp).toBe(0n);
    expect(c.oraclePriceCapE2bps).toBe(10_000n); // was 0n
    expect(c.lastEffectivePriceE6).toBe(1_000_000n); // was 0n
  });

  it("fields absent from this MarketConfig read 0 (not authority_price_e6)", () => {
    const c = parseConfig(data);
    expect(c.oiCapMultiplierBps).toBe(0n); // was 1_000_000n
    expect(c.maxPnlCap).toBe(0n);
  });

  it("head fields (before the funding_premium block) are unchanged", () => {
    const c = parseConfig(data);
    expect(c.collateralMint.toBase58()).toBe("9d7QEfb3KaAB5T3pheXQTUoSZErRNDpJRtPhyeLbHQrT");
    expect(c.vaultPubkey.toBase58()).toBe("2SshJUgKa7Nx3hVDPTq3HFQh7QLqv44mgLb1oWQLR2UP");
    expect(c.maxStalenessSlots).toBe(50n);
    expect(c.confFilterBps).toBe(0);
  });
});

describe("V1D 65088 B: every config-tail field reads from its Rust offset", () => {
  // [field, config-relative offset, width, sentinel]
  const FIELDS: Array<[string, number, number, bigint]> = [
    ["fundingMaxPremiumBps", 144, 8, -71n],
    ["fundingMaxBpsPerSlot", 152, 8, -73n],
    ["threshFloor", 192, 16, (3n << 64n) | 79n],
    ["threshRiskBps", 208, 8, 83n],
    ["threshUpdateIntervalSlots", 216, 8, 89n],
    ["threshStepBps", 224, 8, 97n],
    ["threshAlphaBps", 232, 8, 101n],
    ["threshMin", 240, 16, (5n << 64n) | 103n],
    ["threshMax", 256, 16, (7n << 64n) | 107n],
    ["threshMinStep", 272, 16, (9n << 64n) | 109n],
    ["authorityPriceE6", 320, 8, 113n],
    ["authorityTimestamp", 328, 8, -127n],
    ["oraclePriceCapE2bps", 336, 8, 131n],
    ["lastEffectivePriceE6", 344, 8, 137n],
  ];

  for (const [field, rel, width, sentinel] of FIELDS) {
    it(`${field} at config+${rel}`, () => {
      const d = new Uint8Array(data);
      put(d, CFG + rel, sentinel, width);
      expect((parseConfig(d) as unknown as Record<string, unknown>)[field]).toBe(sentinel);
    });
  }

  it("oracleAuthority is the 32 bytes at config+288", () => {
    const d = new Uint8Array(data);
    const key = new PublicKey("GRMMNsNPM1GbgxFh3S34f3jvUX6jPbPiH3oxopnDFiWM");
    d.set(key.toBytes(), CFG + 288);
    expect(parseConfig(d).oracleAuthority.equals(key)).toBe(true);
  });

  it("the funding_premium block (config+160..192) does not leak into thresh_* or oracle fields", () => {
    const d = new Uint8Array(data);
    for (let i = 160; i < 192; i++) d[CFG + i] = 0xee;
    const c = parseConfig(d);
    expect(c.threshFloor).toBe(0n);
    expect(c.threshRiskBps).toBe(200n);
    expect(c.oraclePriceCapE2bps).toBe(10_000n);
  });

  it("engine bytes right after the config (abs 456..) do not leak into oiCap/maxPnlCap", () => {
    const d = new Uint8Array(data);
    put(d, 456, 0x1234n, 8);
    put(d, 464, 0x5678n, 8);
    const c = parseConfig(d);
    expect(c.oiCapMultiplierBps).toBe(0n);
    expect(c.maxPnlCap).toBe(0n);
  });
});
