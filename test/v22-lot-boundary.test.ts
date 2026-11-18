import { describe, it, expect } from "vitest";
import { LAYOUT_V22 } from "../src/abi/layout.js";
import { stampMarket } from "./helpers/stamp.js";
import * as Lot from "../src/abi/v22-lot.js";

/**
 * Boundary table for src/abi/v22-lot.ts. Expected values are derived from the Rust in percolator-prog
 * feat/v22-rc23-2026-10-22 (d27f3d73), NOT from the TS under test:
 *  - src/v16_program.rs:839        `pub const LOT_EXP_MAX: u8 = 15;`  (lot_exp > 15 refused at :12896)
 *  - src/v16_program.rs:12606      Pyth `msg.price <= 0` refused
 *  - src/v16_program.rs:12617-12624 `scale = expo + 12; scale >= 0 ? price * 10^scale : price / 10^(-scale)` (floor)
 *  - src/v16_program.rs:12933-12940 `e6 = (n / d) * 10^lot_exp / (LEG_E12_PER_E6 = 1_000_000)`, rounded down once
 *  - src/depth_src_v22.rs:583      `floor(base * mark_e6 / 10^(decimals + lot_exp))`: u128 floor division by 10^lot_exp
 */
const U64_MAX = 2n ** 64n - 1n;
const MAX = 15;

describe("lot_exp bounds (Rust LOT_EXP_MAX = 15)", () => {
  const fns: Array<[string, (e: number) => unknown]> = [
    ["lotPriceToTokenE6V22", (e) => Lot.lotPriceToTokenE6V22(1n, e)],
    ["tokenPriceToLotE6V22", (e) => Lot.tokenPriceToLotE6V22(1n, e)],
    ["qToTokenQV22", (e) => Lot.qToTokenQV22(1n, e)],
    ["tokenQToQV22", (e) => Lot.tokenQToQV22(1n, e)],
    ["lotsToTokensV22", (e) => Lot.lotsToTokensV22(1n, e)],
    ["pythPriceToLotE6V22", (e) => Lot.pythPriceToLotE6V22(1n, -6, e)],
  ];
  for (const [name, f] of fns) {
    it(`${name}: 0 and 15 accepted; -1, 16, 1.5, NaN, Infinity rejected`, () => {
      expect(() => f(0)).not.toThrow();
      expect(() => f(MAX)).not.toThrow();
      for (const bad of [-1, MAX + 1, 1.5, NaN, Infinity]) expect(() => f(bad)).toThrow(/lotExp must be 0\.\.=15/);
    });
  }
});

describe("size/price table: lot_exp 0, 15, zero and u64::MAX", () => {
  // floor(x / 10^e) with BigInt literals written out (u128 integer division as in depth_src_v22.rs:583)
  const table: Array<{ tokenQ: bigint; e: number; q: bigint; rem: bigint }> = [
    { tokenQ: 0n, e: 0, q: 0n, rem: 0n },
    { tokenQ: 0n, e: 15, q: 0n, rem: 0n },
    { tokenQ: U64_MAX, e: 0, q: 18446744073709551615n, rem: 0n },
    { tokenQ: U64_MAX, e: 15, q: 18446n, rem: 744073709551615n },
    { tokenQ: 999_999_999_999_999n, e: 15, q: 0n, rem: 999_999_999_999_999n },
    { tokenQ: 1_000_000_000_000_000n, e: 15, q: 1n, rem: 0n },
    { tokenQ: -U64_MAX, e: 15, q: -18446n, rem: -744073709551615n },
  ];
  for (const r of table) {
    it(`tokenQToQ(${r.tokenQ}, ${r.e})`, () => {
      expect(Lot.tokenQToQV22(r.tokenQ, r.e)).toEqual({ q: r.q, remainderTokenQ: r.rem });
    });
  }
  it("exact conversions at the bounds", () => {
    expect(Lot.qToTokenQV22(U64_MAX, 15)).toBe(18446744073709551615000000000000000n);
    expect(Lot.qToTokenQV22(0n, 15)).toBe(0n);
    expect(Lot.lotsToTokensV22(U64_MAX, 0)).toBe(U64_MAX);
    expect(Lot.lotsToTokensV22(0n, 15)).toBe(0n);
    expect(Lot.tokenPriceToLotE6V22(U64_MAX, 15)).toBe(18446744073709551615000000000000000n);
    expect(Lot.lotPriceToTokenE6V22(U64_MAX, 15)).toBe(18446n);
    expect(Lot.lotPriceToTokenE6V22(U64_MAX, 0)).toBe(U64_MAX);
    expect(Lot.lotPriceToTokenE6V22(0n, 15)).toBe(0n);
    expect(Lot.lotPriceToTokenE6V22(999_999_999_999_999n, 15)).toBe(0n);
  });
  it("quantizeQToLots: zero, one short of a lot, u64::MAX", () => {
    expect(Lot.quantizeQToLotsV22(0n)).toEqual({ q: 0n, remainderQ: 0n });
    expect(Lot.quantizeQToLotsV22(999_999n)).toEqual({ q: 0n, remainderQ: 999_999n });
    expect(Lot.quantizeQToLotsV22(U64_MAX)).toEqual({ q: 18446744073709000000n, remainderQ: 551615n });
  });
});

describe("pythPriceToLotE6V22 vs v16_program.rs:12617-12624 + 12933-12940", () => {
  const rows: Array<[bigint, number, number, bigint]> = [
    // price, expo, lot_exp, expected e6 per lot
    [1n, -12, 0, 0n], // 1e-12 at lot 0: floors to 0 (program refuses 0)
    [1n, -12, 6, 1n], // 1e-12 * 1e6 lot = 1e-6 -> 1
    [1_000_000n, -6, 0, 1_000_000n], // $1
    [1n, 0, 0, 1_000_000n], // expo 0 -> scale 12 multiply path (scale >= 0)
    [1n, -12, 15, 1_000_000_000n], // scale == 0 boundary
    [123n, -13, 0, 0n], // scale -1 divides: 123/10 = 12 e12 -> /1e6 = 0
    [123_456n, -13, 6, 12_345n], // 123456/10 = 12345 e12, *1e6 lot / 1e6
    [U64_MAX, -6, 15, (U64_MAX * 10n ** 6n * 10n ** 15n) / 1_000_000n],
  ];
  for (const [p, ex, le, want] of rows) {
    it(`price ${p} expo ${ex} lot ${le}`, () => {
      // independent oracle: the Rust order of operations written inline
      const scale = ex + 12;
      const e12 = scale >= 0 ? p * 10n ** BigInt(scale) : p / 10n ** BigInt(-scale);
      const rust = (e12 * 10n ** BigInt(le)) / 1_000_000n;
      expect(Lot.pythPriceToLotE6V22(p, ex, le)).toBe(rust);
      expect(rust).toBe(want);
    });
  }
  it("price <= 0 refused (v16_program.rs:12606)", () => {
    expect(() => Lot.pythPriceToLotE6V22(0n, -6, 0)).toThrow("price must be > 0");
    expect(() => Lot.pythPriceToLotE6V22(-1n, -6, 0)).toThrow("price must be > 0");
  });
});

describe("lotExpOfMarketV22 asset index bounds", () => {
  const d = stampMarket(new Uint8Array(1398 + 2661), 19);
  it("rejects negative, fractional, NaN and past-the-end assets", () => {
    for (const bad of [-1, 0.5, NaN, 1_000_000]) expect(() => Lot.lotExpOfMarketV22(d, bad)).toThrow(RangeError);
  });
  it("slot 0 reads", () => {
    expect(Lot.lotExpOfMarketV22(d, 0)).toBe(0);
    expect(LAYOUT_V22.wrapperSlot.profileLotExp).toBeGreaterThan(0);
  });
});
