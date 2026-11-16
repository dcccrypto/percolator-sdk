/**
 * Branch-gap tests for two live v2.2 helpers: src/abi/v22-band.ts and src/solana/backing-bucket.ts.
 * Both are exported from the package (abi/index.ts, solana/index.ts); backing-bucket's layout constants are also imported by
 * src/solana/p2b-earn.ts. Tests only: no production code changes.
 *
 * Rust vectors: `rent_rate_e9` (percolator-prog src/growth_v19.rs) returns `None` on any `checked_mul` overflow and the
 * wrapper's fail-closed variant then charges the ceiling; `band_floor_stuck_view` (src/v16_program.rs) is `true` at a 0-tick
 * cap step, and otherwise needs the pin clock running AND the band at P_last narrower than 32 ticks.
 */
import { describe, expect, it } from "vitest";
import * as Band from "../src/abi/v22-band.js";
import { LAYOUT_V21, LAYOUT_V22, UnknownLayoutError } from "../src/abi/layout.js";
import { MAX_ORACLE_PRICE_V22 } from "../src/abi/v22-math.js";
import { parseBackingBucketsV17 } from "../src/solana/backing-bucket.js";
import { stampMarket } from "./helpers/stamp.js";

const U128 = (1n << 128n) - 1n;

const asset = (o: Partial<Band.BandAssetInputs> = {}): Band.BandAssetInputs => ({
  bandBps: 130, effectivePrice: 1_000_000n, targetPrice: 900_000n, oiEffLongQ: 1n, oiEffShortQ: 0n,
  maxPriceMoveBpsPerSlot: 4n, maxAccrualDtSlots: 100n, pinSinceSlot: 0n, ...o,
});

describe("v22-band: rent_rate_e9 overflow arms (rust: checked_mul -> None)", () => {
  it("lhs = users * 10_000 above u128 -> null; fail-closed charges the ceiling", () => {
    const users = U128 / 10_000n + 1n;
    expect(users * 10_000n).toBeGreaterThan(U128);
    expect(Band.rentRateE9V22(users, users + 1n, 0, 9n)).toBeNull();
    expect(Band.rentRateE9FailClosedV22(users, users + 1n, 0, 9n)).toBe(9n);
  });
  it("rhs = kink * nCap above u128 -> null", () => {
    expect(Band.rentRateE9V22(1n, U128, 5000, 9n)).toBeNull();
  });
  it("num = max * (lhs - rhs) above u128 (users < nCap, kink 0) -> null, fail-closed = max", () => {
    const max = (1n << 64n) - 1n; // rust: u64 ceiling
    const users = 1n << 120n, nCap = 1n << 121n; // lhs, den fit u128; max * lhs ~ 2^198 does not
    expect(users * 10_000n).toBeLessThan(U128);
    expect(Band.rentRateE9V22(users, nCap, 0, max)).toBeNull();
    expect(Band.rentRateE9FailClosedV22(users, nCap, 0, max)).toBe(max);
  });
  it("den = nCap * (10_000 - kink) above u128 -> null", () => {
    // lhs = users*1e4 fits, rhs = 0 (kink 0), den = nCap * 1e4 overflows.
    const nCap = U128 / 10_000n + 1n;
    expect(Band.rentRateE9V22(1n, nCap, 0, 9n)).toBeNull();
  });
  it("in-range stays exact (doc vector): ceil(100 * (9000 - 5000) / 5000) = 80", () => {
    expect(Band.rentRateE9V22(900n, 1000n, 5000, 100n)).toBe(80n);
  });
  // `r > maxE9PerSlot ? max : r` (v22-band.ts:66) is dead by construction: users < nCap gives lhs - rhs < den, so
  // ceil(max * (lhs - rhs) / den) <= max. The rust twin has the same unreachable clamp.
});

describe("v22-band: band_floor_stuck_view / favourable close", () => {
  it("pin running and the price beyond MAX_ORACLE_PRICE: width unevaluable -> stuck (let the chain decide)", () => {
    const a = asset({ effectivePrice: MAX_ORACLE_PRICE_V22 + 1n, targetPrice: 1n, maxPriceMoveBpsPerSlot: 4n, pinSinceSlot: 5n });
    expect(Band.bandFloorStuckV22(a)).toBe(true);
    expect(Band.favourableCloseRefusedV22(a, 5n, -5n)).toBe(false);
  });
  it("pin running, wide band -> not stuck; pin running, narrow band -> stuck", () => {
    expect(Band.bandFloorStuckV22(asset({ pinSinceSlot: 5n }))).toBe(false);
    expect(Band.bandFloorStuckV22(asset({ effectivePrice: 1000n, maxPriceMoveBpsPerSlot: 100n, pinSinceSlot: 5n }))).toBe(true);
  });
  it("short positions: reduce / close / flip / grow, using the negative-abs arm", () => {
    const a = asset({ targetPrice: 1_100_000n }); // target above mark: favourable for a short closer
    expect(Band.favourableCloseRefusedV22(a, -5n, 5n)).toBe(true); // full close
    expect(Band.favourableCloseRefusedV22(a, -5n, 2n)).toBe(true); // partial reduce: |-3| < |-5|
    expect(Band.favourableCloseRefusedV22(a, -5n, 8n)).toBe(true); // flip to long: closing part counts
    expect(Band.favourableCloseRefusedV22(a, -5n, -3n)).toBe(false); // grows the short
    expect(Band.favourableCloseRefusedV22(a, 0n, -3n)).toBe(false); // opening from flat
  });
});

describe("v22-band: decoder guards and null paths", () => {
  const v19 = () => stampMarket(new Uint8Array(LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen + LAYOUT_V22.assetSlotStride), 19);

  it("decodeBandConfigV22: a truncated market is refused by resolveMarketGeometry (the :329 TOO_SHORT guard is unreachable behind it)", () => {
    const short = stampMarket(new Uint8Array(LAYOUT_V22.marketGroupOff + 8), 19);
    expect(() => Band.decodeBandConfigV22(short)).toThrow(UnknownLayoutError);
  });
  it("decodeAssetBandStateV22 / decodeAssetRentStateV22: absent, negative and fractional asset slots are RangeErrors", () => {
    const d = v19();
    for (const idx of [1, 99, -1, 0.5, Number.NaN]) {
      expect(() => Band.decodeAssetBandStateV22(d, idx)).toThrow(RangeError);
      expect(() => Band.decodeAssetRentStateV22(d, idx)).toThrow(RangeError);
    }
    expect(() => Band.decodeAssetBandStateV22(d, 0)).not.toThrow();
  });
  it("tryReadBandRentViewV22: null / undefined data -> null without throwing", () => {
    expect(Band.tryReadBandRentViewV22(null)).toBeNull();
    expect(Band.tryReadBandRentViewV22(undefined)).toBeNull();
    expect(Band.tryReadBandRentViewV22(new Uint8Array(4))).toBeNull();
  });
  it("layoutHasBandRentV22: default arg (VERSION 19), explicit rows, undefined", () => {
    expect(Band.layoutHasBandRentV22()).toBe(true);
    expect(Band.layoutHasBandRentV22(LAYOUT_V22)).toBe(true);
    expect(Band.layoutHasBandRentV22(LAYOUT_V21)).toBe(false);
    expect(Band.layoutHasBandRentV22(undefined)).toBe(true); // undefined takes the default
  });
});

describe("backing-bucket: parseBackingBucketsV17 option guards", () => {
  it("a negative chainSlot is refused (the program's slot is never below zero)", () => {
    const d = stampMarket(new Uint8Array(LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen + LAYOUT_V22.assetSlotStride), 19);
    expect(() => parseBackingBucketsV17(d, { chainSlot: -1 })).toThrow(/chainSlot must be non-negative/);
    expect(() => parseBackingBucketsV17(d, { chainSlot: -1n })).toThrow(/non-negative/);
    expect(parseBackingBucketsV17(d, { chainSlot: 0 }).nowSlot).toBe(0n);
  });
  it("a trailing partial asset slot is ignored (slotCount floors), never read out of bounds", () => {
    const full = LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen + LAYOUT_V22.assetSlotStride;
    const d = stampMarket(new Uint8Array(full + LAYOUT_V22.assetSlotStride - 1), 19);
    expect(parseBackingBucketsV17(d).physicalAssetSlots).toBe(1);
  });
  // Unreachable by construction (documented, not tested): the `readU8At/readU32LEAt/readU64LEAt/readU128LEAt` bounds throws
  // (backing-bucket.ts:81-96) and the `bucketOff + 97 > data.length` break (:381). resolveMarketGeometry already refuses a
  // buffer shorter than the group and floors slotCount, and the backing offsets lie inside one asset-slot stride.
});
