/**
 * Branch coverage for src/abi/v22-band.ts: overflow guards, short / mis-versioned buffers, bad asset indexes,
 * unevaluable band width, negative-side reductions and the null / default-arg paths.
 */
import { describe, expect, it } from "vitest";
import * as Band from "../src/abi/v22-band.js";
import { LAYOUT_V21, LAYOUT_V22, UnknownLayoutError } from "../src/abi/layout.js";
import { stampMarket } from "./helpers/stamp.js";

const U128 = (1n << 128n) - 1n;

const v22 = (): Uint8Array => stampMarket(new Uint8Array(LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen + LAYOUT_V22.assetSlotStride), 19);

describe("rentRateE9V22 overflow guards", () => {
  it("returns null when n_cap * (BPS - kink) exceeds u128 (denominator overflow)", () => {
    // rhs = 1 * 2^127 fits; lhs = 3e34 * 1e4 = 3e38 fits and > rhs; users < nCap; den = 2^127 * 9999 > u128.
    const nCap = 1n << 127n;
    expect(Band.rentRateE9V22(3n * 10n ** 34n, nCap, 1, 100n)).toBeNull();
    // fail-closed variant returns the ceiling
    expect(Band.rentRateE9FailClosedV22(3n * 10n ** 34n, nCap, 1, 100n)).toBe(100n);
  });
  it("returns null when max * (lhs - rhs) exceeds u128 (numerator overflow)", () => {
    expect(Band.rentRateE9V22(900n, 1000n, 5000, 1n << 125n)).toBeNull();
    expect(Band.rentRateE9FailClosedV22(900n, 1000n, 5000, 1n << 125n)).toBe(1n << 125n);
  });
  it("returns null when users * BPS or kink * nCap overflows u128; just-below-boundary users passes, U128 itself overflows", () => {
    expect(Band.rentRateE9V22(U128, 1000n, 5000, 100n)).toBeNull();
    expect(Band.rentRateE9V22(1n, U128, 5000, 100n)).toBeNull();
    expect(Band.rentRateE9V22(1n, 0n, 5000, 100n)).toBeNull(); // n_cap == 0
    expect(Band.rentRateE9V22(1n, 1000n, 10_001, 100n)).toBeNull(); // kink > 100%
    expect(Band.rentRateE9V22(1n, 1000n, 10_000, 100n)).toBe(0n); // kink == 100% is valid
    expect(Band.rentRateE9V22(U128 / 10_000n, U128 / 9_999n, 9_999, 100n)).not.toBeNull();
  });
});

describe("bandFloorStuckV22 with an unevaluable width", () => {
  it("is stuck (let the chain decide) when the width is null: pin running, band_bps above the maximum", () => {
    const a = { bandBps: 20_000, effectivePrice: 1_000_000n, targetPrice: 1n, oiEffLongQ: 1n, oiEffShortQ: 0n, maxPriceMoveBpsPerSlot: 4n, maxAccrualDtSlots: 100n, pinSinceSlot: 9n };
    expect(Band.bandFloorStuckV22(a)).toBe(true);
    // pin clock off: never reaches the width check
    expect(Band.bandFloorStuckV22({ ...a, pinSinceSlot: 0n })).toBe(false);
  });
  it("is stuck when the anchor is above the oracle maximum (width null)", () => {
    const a = { bandBps: 130, effectivePrice: (1n << 63n), targetPrice: 1n, oiEffLongQ: 1n, oiEffShortQ: 0n, maxPriceMoveBpsPerSlot: 4n, maxAccrualDtSlots: 100n, pinSinceSlot: 9n };
    expect(Band.bandFloorStuckV22(a)).toBe(true);
  });
});

describe("favourableCloseRefusedV22 on the short side", () => {
  const a = { bandBps: 130, effectivePrice: 1_000_000n, targetPrice: 1_100_000n, oiEffLongQ: 0n, oiEffShortQ: 5n, maxPriceMoveBpsPerSlot: 4n, maxAccrualDtSlots: 100n, pinSinceSlot: 0n };
  it("a short partially reducing (negative after, smaller magnitude) is refused when the target is above the mark", () => {
    expect(Band.favourableCloseRefusedV22(a, -5n, 3n)).toBe(true); // after = -2, |after| < |before|
  });
  it("a short growing (|after| > |before|) is not a reduction", () => {
    expect(Band.favourableCloseRefusedV22(a, -5n, -3n)).toBe(false);
  });
  it("a short flipping to long counts as reducing", () => {
    expect(Band.favourableCloseRefusedV22(a, -5n, 7n)).toBe(true);
  });
  it("a short with the target below the mark buys at the worse price: allowed", () => {
    expect(Band.favourableCloseRefusedV22({ ...a, targetPrice: 900_000n }, -5n, 5n)).toBe(false);
  });
});

describe("decoders: short buffers, bad versions, bad slots", () => {
  it("a buffer shorter than any market group is TOO_SHORT for every decoder", () => {
    const short = new Uint8Array(100);
    for (const f of [Band.decodeBandConfigV22, Band.decodeAssetBandStateV22, Band.decodeAssetRentStateV22]) {
      expect(() => f(short)).toThrowError(UnknownLayoutError);
      try { f(short); } catch (e) { expect((e as UnknownLayoutError).code).toBe("TOO_SHORT"); }
    }
  });
  it("a v2.2 header with the group truncated is TOO_SHORT", () => {
    const d = stampMarket(new Uint8Array(LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen - 1), 19);
    try { Band.decodeBandConfigV22(d); throw new Error("no throw"); } catch (e) { expect((e as UnknownLayoutError).code).toBe("TOO_SHORT"); }
  });
  it("an unknown VERSION is UNKNOWN_VERSION and bad magic is BAD_MAGIC", () => {
    const d = stampMarket(new Uint8Array(LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen + LAYOUT_V22.assetSlotStride), 99);
    try { Band.decodeAssetBandStateV22(d); throw new Error("no throw"); } catch (e) { expect((e as UnknownLayoutError).code).toBe("UNKNOWN_VERSION"); }
    const z = new Uint8Array(d.length);
    try { Band.decodeAssetRentStateV22(z); throw new Error("no throw"); } catch (e) { expect((e as UnknownLayoutError).code).toBe("BAD_MAGIC"); }
  });
  it("a v2.1 market (no band words) throws UNKNOWN_VERSION from the asset and rent decoders too", () => {
    const d = stampMarket(new Uint8Array(1350 + 2325), 18);
    for (const f of [Band.decodeAssetBandStateV22, Band.decodeAssetRentStateV22]) {
      try { f(d); throw new Error("no throw"); } catch (e) { expect((e as UnknownLayoutError).code).toBe("UNKNOWN_VERSION"); }
    }
  });
  it("asset index out of range / negative / fractional / NaN throws RangeError", () => {
    const d = v22();
    for (const i of [1, 5, -1, 0.5, NaN, Infinity]) {
      expect(() => Band.decodeAssetBandStateV22(d, i), `band ${i}`).toThrow(RangeError);
      expect(() => Band.decodeAssetRentStateV22(d, i), `rent ${i}`).toThrow(RangeError);
    }
    expect(() => Band.decodeAssetBandStateV22(d, 3)).toThrow(/asset 3 is not present/);
    expect(Band.readBandRentViewV22(d, 0)).toBeNull(); // slot 0 is fine (no band, no rent)
  });
  it("tryReadBandRentViewV22 swallows decoder errors and a bad slot", () => {
    expect(Band.tryReadBandRentViewV22(new Uint8Array(100))).toBeNull();
    expect(Band.tryReadBandRentViewV22(null)).toBeNull();
    expect(Band.tryReadBandRentViewV22(undefined)).toBeNull();
    const banded = v22();
    banded[LAYOUT_V22.marketGroupOff + LAYOUT_V22.group.config + LAYOUT_V22.bandRent!.config.bandBps] = 130;
    expect(() => Band.readBandRentViewV22(banded, 4)).toThrow(RangeError);
    expect(Band.tryReadBandRentViewV22(banded, 4)).toBeNull();
    expect(Band.tryReadBandRentViewV22(banded, 0)).not.toBeNull();
  });
});

describe("layoutHasBandRentV22", () => {
  it("defaults to the v2.2 row (true); false for rows without band words", () => {
    expect(Band.layoutHasBandRentV22()).toBe(true);
    expect(Band.layoutHasBandRentV22(LAYOUT_V22)).toBe(true);
    expect(Band.layoutHasBandRentV22({ ...LAYOUT_V22, bandRent: null })).toBe(false);
    expect(Band.layoutHasBandRentV22(LAYOUT_V21)).toBe(false);
  });
});
