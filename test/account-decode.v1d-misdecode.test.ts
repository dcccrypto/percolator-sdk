/**
 * The captured devnet V1D slab (2swBcS47..., 65088 B) was misdecoded: parseEngine/parseParams put
 * the engine at abs 424, which is inside MarketConfig for the program that wrote it.
 *
 * Program revision (pinned to the source, not probed):
 *   percolator-prog f7a2e8ab (2026-02-24) built against engine a235a5f2 (its Cargo.lock pin).
 *   - SBF MarketConfig = 352 B, so ENGINE_OFF = align_up(104 + 352, 8) = 456.
 *     abs 424 = config.authority_price_e6 (1e6), abs 440 = oracle_price_cap_e2bps (10_000),
 *     abs 448 = last_effective_price_e6 (1e6). The old decode read the last two as the
 *     insurance balance (~1.8e25).
 *   - RiskEngine: vault U128 @0, InsuranceFund {balance, fee_revenue} @16 (32 B), RiskParams @48
 *     (288 B), current_slot @336, funding_index I128 @344, last_funding_slot @360,
 *     funding_rate_bps_per_slot_last i64 @368, mark_price_e6 @376, last_crank_slot @400,
 *     max_crank_staleness_slots @408, total_open_interest @416, c_tot @432, pnl_pos_tot @448,
 *     liq_cursor @464, gc_cursor @466, last_full_sweep_start/completed @472/@480,
 *     crank_cursor @488, sweep_start_idx @490, lifetime_liquidations @496,
 *     lifetime_force_realize_closes @504, net_lp_pos I128 @512, lp_sum_abs @528,
 *     lp_max_abs @544, lp_max_abs_sweep @560, used[4] @576, num_used_accounts @608,
 *     next_account_id @616, free_head @624, next_free @626, accounts @1144 (248 B each).
 *   456 + 1144 + 256*248 = 65088. That is the account size.
 *
 * The first block (invariants only) is the failing-first test from
 * J-20261123-SDK-REPORT-ACCOUNTDECODETESTMUT: 3/3 fail on 2bf0fcd7.
 * The second block pins every engine offset above by writing a sentinel into a copy of the real
 * slab at the Rust offset (typed out here, not imported) and reading it back.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  detectSlabLayout,
  parseEngine,
  parseParams,
  parseUsedIndices,
} from "../src/solana/slab.js";

const dir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "fixtures", "accounts");
const fx = JSON.parse(readFileSync(resolve(dir, "devnet-wrapper-slab-v1d.json"), "utf8")) as {
  data_base64: string;
  total_data_length: number;
};
const data = new Uint8Array(fx.total_data_length);
data.set(Buffer.from(fx.data_base64, "base64"), 0);

describe("V1D captured slab: decoded engine must be self-consistent", () => {
  it("RiskParams.maxAccounts equals the slab's own account capacity (256)", () => {
    const layout = detectSlabLayout(data.length, data)!;
    expect(layout.maxAccounts).toBe(256);
    expect(parseParams(data).maxAccounts).toBe(BigInt(layout.maxAccounts)); // was 0n
  });

  it("trading fee is a bps value (<= 10_000)", () => {
    expect(parseParams(data).tradingFeeBps <= 10_000n).toBe(true); // was 1_000_000n
  });

  it("insurance fund balance cannot exceed the vault that holds it", () => {
    const e = parseEngine(data);
    // was balance = 18446744073709551616010000n (~1.8e25) against vault 1_000_000n
    expect(e.insuranceFund.balance <= e.vault).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Offsets pinned to prog f7a2e8ab + engine a235a5f2
// ---------------------------------------------------------------------------

const ENGINE = 456; // align_up(HEADER_LEN 104 + CONFIG_LEN 352, 8)

function put(d: Uint8Array, abs: number, value: bigint, bytes: number): void {
  let v = value < 0n ? (1n << BigInt(bytes * 8)) + value : value;
  for (let i = 0; i < bytes; i++) {
    d[abs + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}
const copy = (): Uint8Array => new Uint8Array(data);

describe("V1D 65088 B layout: every engine field reads from its Rust offset", () => {
  // [field read back from parseEngine, engine-relative offset, width in bytes, sentinel]
  const ENGINE_FIELDS: Array<[string, number, number, bigint]> = [
    ["vault", 0, 16, (7n << 64n) | 11n],
    ["currentSlot", 336, 8, 9_000_000_001n],
    ["fundingIndexQpbE6", 344, 16, -(5n << 64n) - 3n],
    ["lastFundingSlot", 360, 8, 9_000_000_002n],
    ["fundingRateBpsPerSlotLast", 368, 8, -42n],
    ["markPriceE6", 376, 8, 123_456_789n],
    ["lastCrankSlot", 400, 8, 9_000_000_003n],
    ["maxCrankStalenessSlots", 408, 8, 777n],
    ["totalOpenInterest", 416, 16, (3n << 64n) | 5n],
    ["cTot", 432, 16, (2n << 64n) | 17n],
    ["pnlPosTot", 448, 16, (4n << 64n) | 19n],
    ["lastSweepStartSlot", 472, 8, 9_000_000_004n],
    ["lastSweepCompleteSlot", 480, 8, 9_000_000_005n],
    ["lifetimeLiquidations", 496, 8, 31n],
    ["lifetimeForceCloses", 504, 8, 37n],
    ["netLpPos", 512, 16, -(9n << 64n) - 1n],
    ["lpSumAbs", 528, 16, (6n << 64n) | 41n],
    ["lpMaxAbs", 544, 16, (8n << 64n) | 43n],
    ["lpMaxAbsSweep", 560, 16, (10n << 64n) | 47n],
    ["nextAccountId", 616, 8, 53n],
  ];

  for (const [field, rel, width, sentinel] of ENGINE_FIELDS) {
    it(`${field} at engine+${rel}`, () => {
      const d = copy();
      put(d, ENGINE + rel, sentinel, width);
      expect((parseEngine(d) as unknown as Record<string, unknown>)[field]).toBe(sentinel);
    });
  }

  it("u16 cursors and num_used_accounts at engine+464/466/488/490/608", () => {
    const d = copy();
    put(d, ENGINE + 464, 101n, 2);
    put(d, ENGINE + 466, 102n, 2);
    put(d, ENGINE + 488, 103n, 2);
    put(d, ENGINE + 490, 104n, 2);
    put(d, ENGINE + 608, 105n, 2);
    const e = parseEngine(d);
    expect([e.liqCursor, e.gcCursor, e.crankCursor, e.sweepStartIdx, e.numUsedAccounts])
      .toEqual([101, 102, 103, 104, 105]);
  });

  it("insurance balance is the U128 at engine+16; fee_revenue (+32) is not read as balance", () => {
    const d = copy();
    put(d, ENGINE + 16, (1n << 64n) | 99n, 16);
    put(d, ENGINE + 32, 5_555n, 16);
    const e = parseEngine(d);
    expect(e.insuranceFund.balance).toBe((1n << 64n) | 99n);
    // pre-PERC-306 InsuranceFund has no isolation fields
    expect(e.insuranceFund.isolatedBalance).toBe(0n);
    expect(e.insuranceFund.isolationBps).toBe(0);
  });

  it("no long/short OI in this engine: both read 0 even when total OI is set", () => {
    const d = copy();
    put(d, ENGINE + 416, 77n, 16);
    const e = parseEngine(d);
    expect(e.longOi).toBe(0n);
    expect(e.shortOi).toBe(0n);
  });

  it("the bitmap is at engine+576 (abs 1032)", () => {
    const d = copy();
    put(d, ENGINE + 576, (1n << 3n) | (1n << 63n), 8);
    put(d, ENGINE + 576 + 24, 1n << 1n, 8);
    expect(parseUsedIndices(d)).toEqual([3, 63, 193]);
  });

  it("RiskParams start at engine+48 (fields at +0/+8/+16/+24/+32/+40)", () => {
    const d = copy();
    const P = ENGINE + 48;
    put(d, P + 0, 11n, 8);
    put(d, P + 8, 12n, 8);
    put(d, P + 16, 13n, 8);
    put(d, P + 24, 14n, 8);
    put(d, P + 32, 15n, 8);
    put(d, P + 40, (1n << 64n) | 16n, 16);
    const p = parseParams(d);
    expect([p.warmupPeriodSlots, p.maintenanceMarginBps, p.initialMarginBps, p.tradingFeeBps, p.maxAccounts])
      .toEqual([11n, 12n, 13n, 14n, 15n]);
    expect(p.newAccountFee).toBe((1n << 64n) | 16n);
  });

  it("layout descriptor: engine 456, config 352, accounts 1600, postBitmap 18", () => {
    const l = detectSlabLayout(data.length, data)!;
    expect(l.engineOff).toBe(456);
    expect(l.configLen).toBe(352);
    expect(l.accountsOff).toBe(456 + 1144);
    expect(l.postBitmap).toBe(18);
    expect(l.accountsOff + l.maxAccounts * l.accountSize).toBe(65_088);
    // the same without data (size-only detection)
    expect(detectSlabLayout(65_088)!.engineOff).toBe(456);
  });

  it("the 65104 B legacy V1D variant (postBitmap=18, 6ZytbpV4) still decodes as before", () => {
    const l = detectSlabLayout(65_104)!;
    expect(l.engineOff).toBe(424);
    expect(l.configLen).toBe(320);
    expect(l.engineInsuranceOff).toBe(16);
    expect(l.engineParamsOff).toBe(96);
    expect(l.engineCurrentSlotOff).toBe(384);
    expect(l.engineMarkPriceOff).toBe(424);
    expect(l.engineCTotOff).toBe(512);
    expect(l.engineBitmapOff).toBe(624);
    expect(l.accountsOff).toBe(1616);
    expect(l.hasInsuranceIsolation).toBe(true);
  });
});
