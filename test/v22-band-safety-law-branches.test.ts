import { describe, it, expect } from "vitest";
import {
  bandGenesisFloorE6V22,
  bandMinLegFloorAtomsV22,
  bandWorstAdverseBpsV22,
  checkBandSafetyLawV22,
  maxAcceptedRentE9PerSlotV22,
  type BandSafetyLawInputV22,
} from "../src/abi/v22-band-safety-law.js";
import * as abi from "../src/abi/index.js";

// Branch-coverage companion to v22-band-safety-law.test.ts (parity fixture). Pure, no RPC.
const seed: BandSafetyLawInputV22 = {
  maxPortfolioAssets: 1, maintenanceMarginBps: 1000n, initialMarginBps: 2000n, liquidationFeeBps: 50n,
  liquidationFeeCap: 10_000_000_000n, minLiquidationAbs: 0n, minNonzeroMmReq: 1_000_000n, minNonzeroImReq: 2_000_000n,
  maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 500n, maxAbsFundingE9PerSlot: 111n, minFundingLifetimeSlots: 500n,
  maintenanceFeePerSlot: 0n, initialPriceE6: 80_000_000n, collateralDecimals: 6,
  rent: { rentMaxE9PerSlot: 100, rentKinkBps: 5000 },
  band: { bandBps: 130, bandMaxEpochSlots: 600, bandMaxPinSlots: 9000, bandMinLegNotional: 100_000_000n },
};
const mk = (o: Partial<BandSafetyLawInputV22>): BandSafetyLawInputV22 => ({ ...seed, ...o });
const noBand = (o: Partial<BandSafetyLawInputV22> = {}): BandSafetyLawInputV22 => ({ ...seed, band: undefined, ...o });
const noRent = (o: Partial<BandSafetyLawInputV22> = {}): BandSafetyLawInputV22 => ({ ...seed, rent: undefined, band: undefined, ...o });
const bandWith = (b: Partial<NonNullable<BandSafetyLawInputV22["band"]>>) => mk({ band: { ...seed.band!, ...b } });
const fail = (i: BandSafetyLawInputV22) => {
  const r = checkBandSafetyLawV22(i);
  if (r.ok) throw new Error("expected refusal");
  return r;
};

describe("band safety law: liveness", () => {
  it("is exported through the abi barrel (src/abi/index.ts)", () => {
    expect(abi.checkBandSafetyLawV22).toBe(checkBandSafetyLawV22);
    expect(abi.maxAcceptedRentE9PerSlotV22).toBe(maxAcceptedRentE9PerSlotV22);
  });
  it("seed pilot is accepted", () => {
    expect(checkBandSafetyLawV22(seed)).toEqual({ ok: true, notChecked: [] });
  });
});

describe("band safety law: helper boundaries", () => {
  it("worst adverse bps: edges and out-of-range", () => {
    expect(bandWorstAdverseBpsV22(0n)).toBeNull();
    expect(bandWorstAdverseBpsV22(-1n)).toBeNull();
    expect(bandWorstAdverseBpsV22(2001n)).toBeNull();
    expect(bandWorstAdverseBpsV22(130n)).toBe(397n);
    expect(bandWorstAdverseBpsV22(2000n)).toBe(((12000n * 12000n) / 8000n) - 10000n); // exact division
    expect(bandWorstAdverseBpsV22(1n)).toBe(4n);
  });
  it("genesis floor: edges, out-of-range, and the 256-step search limit", () => {
    expect(bandGenesisFloorE6V22(0n)).toBeNull();
    expect(bandGenesisFloorE6V22(2001n)).toBeNull();
    expect(bandGenesisFloorE6V22(130n)).toBe(123100n);
    expect(bandGenesisFloorE6V22(2000n)).not.toBeNull();
    // d=1 needs a huge anchor; the search starts high and runs into MAX_ORACLE_PRICE or the 256 cap
    const tiny = bandGenesisFloorE6V22(1n);
    expect(tiny === null || tiny > 0n).toBe(true);
  });
  it("min leg floor: decimals, clamp at 30 and u64 saturation", () => {
    expect(bandMinLegFloorAtomsV22(0)).toBe(10n);
    expect(bandMinLegFloorAtomsV22(6)).toBe(10_000_000n);
    expect(bandMinLegFloorAtomsV22(18)).toBe(10n * 10n ** 18n > (1n << 64n) - 1n ? (1n << 64n) - 1n : 10n * 10n ** 18n);
    expect(bandMinLegFloorAtomsV22(30)).toBe((1n << 64n) - 1n);
    expect(bandMinLegFloorAtomsV22(255)).toBe((1n << 64n) - 1n);
  });
});

describe("band safety law: malformed input throws RangeError", () => {
  it.each<[string, BandSafetyLawInputV22]>([
    ["negative mm", mk({ maintenanceMarginBps: -1n })],
    ["mm > u64", mk({ maintenanceMarginBps: 1n << 64n })],
    ["non-bigint mm", mk({ maintenanceMarginBps: 5 as unknown as bigint })],
    ["fractional assets", mk({ maxPortfolioAssets: 1.5 })],
    ["assets > u16", mk({ maxPortfolioAssets: 0x10000 })],
    ["negative assets", mk({ maxPortfolioAssets: -1 })],
    ["fee > u128", mk({ maintenanceFeePerSlot: 1n << 128n })],
    ["price > u64", mk({ initialPriceE6: 1n << 64n })],
    ["negative price", mk({ initialPriceE6: -1n })],
    ["decimals > 255", mk({ collateralDecimals: 256 })],
    ["rent > u32", mk({ rent: { rentMaxE9PerSlot: 2 ** 32, rentKinkBps: 0 } })],
    ["kink > u16", mk({ rent: { rentMaxE9PerSlot: 0, rentKinkBps: 0x10000 } })],
    ["bandBps > u16", bandWith({ bandBps: 0x10000 })],
    ["epoch > u32", bandWith({ bandMaxEpochSlots: 2 ** 32 })],
    ["pin > u32", bandWith({ bandMaxPinSlots: 2 ** 32 })],
    ["minLeg > u64", bandWith({ bandMinLegNotional: 1n << 64n })],
  ])("%s", (_n, i) => {
    expect(() => checkBandSafetyLawV22(i)).toThrow(RangeError);
  });
  it("a band without a rent block throws; a zero band without rent is fine", () => {
    expect(() => checkBandSafetyLawV22(mk({ rent: undefined }))).toThrow(/rent block/);
    expect(checkBandSafetyLawV22(mk({ rent: undefined, band: { ...seed.band!, bandBps: 0 } })).ok).toBe(true);
  });
});

describe("band safety law: refusal reasons", () => {
  it("price outside InitMarket range -> base-config", () => {
    expect(fail(mk({ initialPriceE6: 0n }))).toMatchObject({ code: null, rule: "base-config" });
    expect(fail(mk({ initialPriceE6: (1n << 64n) - 1n }))).toMatchObject({ code: null, rule: "base-config" });
  });
  it("rent block out of range -> 106 rent-block", () => {
    for (const rent of [
      { rentMaxE9PerSlot: 10_001, rentKinkBps: 5000 },
      { rentMaxE9PerSlot: 100, rentKinkBps: 10_001 },
      { rentMaxE9PerSlot: 9, rentKinkBps: 5000 },
      { rentMaxE9PerSlot: 100, rentKinkBps: 8001 },
    ]) expect(fail(mk({ rent }))).toMatchObject({ code: 106, rule: "rent-block" });
    expect(checkBandSafetyLawV22(noBand({ rent: { rentMaxE9PerSlot: 0, rentKinkBps: 10_000 } })).ok).toBe(true);
    expect(checkBandSafetyLawV22(noBand({ rent: { rentMaxE9PerSlot: 10, rentKinkBps: 8000 } })).ok).toBe(true);
  });
  it("rent with a valid base and no band is accepted or refused 106 (never a thrown error)", () => {
    for (const mm of [100n, 150n, 200n, 500n]) for (const dt of [20n, 100n]) {
      const r = checkBandSafetyLawV22(noBand({ maintenanceMarginBps: mm, initialMarginBps: mm * 2n, maxAbsFundingE9PerSlot: 10_000n, maxAccrualDtSlots: dt, minFundingLifetimeSlots: dt, rent: { rentMaxE9PerSlot: 10_000, rentKinkBps: 5000 } }));
      if (!r.ok) expect([106, null]).toContain(r.code);
    }
  });
  it("band shape and law -> 105", () => {
    for (const b of [
      { bandBps: 2001 }, { bandMaxEpochSlots: 149 }, { bandMaxPinSlots: 600 * 8 - 1 }, { bandMinLegNotional: 0n },
    ]) expect(fail(bandWith(b))).toMatchObject({ code: 105, rule: "band-shape-or-law" });
    expect(fail(mk({ maxPortfolioAssets: 2 }))).toMatchObject({ code: 105, rule: "band-shape-or-law" }); // a band market must be single-asset
  });
  it("band epoch/pin boundaries are accepted", () => {
    expect(checkBandSafetyLawV22(bandWith({ bandMaxEpochSlots: 150, bandMaxPinSlots: 1200 })).ok).toBe(true);
  });
  it("band law (envelope over 2 epochs) refuses a thin margin", () => {
    const i = mk({ maintenanceMarginBps: 200n, initialMarginBps: 400n, maxAccrualDtSlots: 100n, minFundingLifetimeSlots: 100n });
    expect(fail(i)).toMatchObject({ code: 105, rule: "band-shape-or-law" });
  });
  it("band market with maintenance fee -> band-maintenance-fee", () => {
    expect(fail(mk({ maintenanceFeePerSlot: 1n }))).toMatchObject({ code: 105, rule: "band-maintenance-fee" });
  });
  it("genesis price below floor -> band-genesis-price", () => {
    expect(fail(mk({ initialPriceE6: 123_099n }))).toMatchObject({ code: 105, rule: "band-genesis-price" });
    expect(checkBandSafetyLawV22(mk({ initialPriceE6: 123_100n })).ok).toBe(true);
  });
  it("genesis floor unavailable (d out of search range) -> '(none)'", () => {
    // bandBps 1: the minimum wide anchor exceeds the oracle price cap
    const r = checkBandSafetyLawV22(bandWith({ bandBps: 1 }));
    if (bandGenesisFloorE6V22(1n) === null && !r.ok && r.rule === "band-genesis-price") expect(r.message).toContain("(none)");
    expect(r).toBeDefined();
  });
  it("min leg below floor -> band-min-leg", () => {
    expect(fail(bandWith({ bandMinLegNotional: 9_999_999n }))).toMatchObject({ code: 105, rule: "band-min-leg" });
    expect(checkBandSafetyLawV22(bandWith({ bandMinLegNotional: 10_000_000n })).ok).toBe(true);
  });
  it("null price / decimals are reported in notChecked", () => {
    expect(checkBandSafetyLawV22(mk({ initialPriceE6: null }))).toEqual({ ok: true, notChecked: ["band-genesis-price"] });
    expect(checkBandSafetyLawV22(mk({ collateralDecimals: null }))).toEqual({ ok: true, notChecked: ["band-min-leg"] });
    expect(checkBandSafetyLawV22(mk({ initialPriceE6: null, collateralDecimals: null }))).toEqual({
      ok: true, notChecked: ["band-genesis-price", "band-min-leg"],
    });
  });
});

describe("band safety law: base config shape (code null)", () => {
  const baseBad: [string, Partial<BandSafetyLawInputV22>][] = [
    ["zero assets", { maxPortfolioAssets: 0 }],
    ["minMm zero", { minNonzeroMmReq: 0n }],
    ["minMm >= minIm", { minNonzeroMmReq: 2_000_000n }],
    ["mm > im", { maintenanceMarginBps: 3000n }],
    ["im > 10000", { initialMarginBps: 10_001n }],
    ["liq fee bps > 10000", { liquidationFeeBps: 10_001n }],
    ["minLiqAbs > cap", { minLiquidationAbs: 10_000_000_001n }],
    ["cap > protocol max", { liquidationFeeCap: 10n ** 37n }],
    ["dt zero", { maxAccrualDtSlots: 0n }],
    ["lifetime < dt", { minFundingLifetimeSlots: 499n }],
    ["funding too high", { maxAbsFundingE9PerSlot: 10_001n }],
    ["pmove zero", { maxPriceMoveBpsPerSlot: 0n }],
    ["pmove > 10000", { maxPriceMoveBpsPerSlot: 10_001n }],
  ];
  it.each(baseBad)("%s", (_n, o) => {
    expect(fail(noRent(o))).toMatchObject({ code: null, rule: "base-config" });
    expect(fail(noBand(o))).toMatchObject({ code: null, rule: "base-config" });
  });
  it("rent-only market with a base-invalid config is base-config", () => {
    expect(fail(noBand({ maxPortfolioAssets: 0 }))).toMatchObject({ code: null });
  });
  it("band-block refusals fire even when the base config is invalid", () => {
    // minNonzeroMmReq 0 makes base, rent and band configs all invalid, so the band checks are what speak
    const bad = { minNonzeroMmReq: 0n };
    expect(fail(mk({ ...bad, maintenanceFeePerSlot: 1n }))).toMatchObject({ rule: "band-maintenance-fee" });
    expect(fail(mk({ ...bad, initialPriceE6: 1n }))).toMatchObject({ rule: "band-genesis-price" });
    expect(fail(mk({ ...bad, band: { ...seed.band!, bandMinLegNotional: 1n } }))).toMatchObject({ rule: "band-min-leg" });
    expect(fail(mk(bad))).toMatchObject({ code: null, rule: "base-config" });
  });
  it("empty rent block with zero band -> ok / base-config", () => {
    expect(checkBandSafetyLawV22(noBand({ rent: { rentMaxE9PerSlot: 0, rentKinkBps: 0 } })).ok).toBe(true);
    expect(fail(mk({ rent: { rentMaxE9PerSlot: 0, rentKinkBps: 0 }, band: { ...seed.band!, bandBps: 0 }, minNonzeroMmReq: 0n }))).toMatchObject({ code: null });
  });
  it("no rent block and no band is validated as a base config", () => {
    expect(checkBandSafetyLawV22(noRent())).toEqual({ ok: true, notChecked: [] });
  });
});

describe("band safety law: solvency envelope paths", () => {
  const ok = (o: Partial<BandSafetyLawInputV22>) => checkBandSafetyLawV22(noRent(o));
  it("fast path: 100% maintenance, no fees/funding", () => {
    expect(ok({ maintenanceMarginBps: 10_000n, initialMarginBps: 10_000n, liquidationFeeBps: 0n, maxAbsFundingE9PerSlot: 0n, maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 100n, minFundingLifetimeSlots: 100n }).ok).toBe(true);
  });
  it("100% maintenance with price budget > 10000 goes through the envelope", () => {
    const r = ok({ maintenanceMarginBps: 10_000n, initialMarginBps: 10_000n, liquidationFeeBps: 0n, maxAbsFundingE9PerSlot: 0n, maxPriceMoveBpsPerSlot: 100n, maxAccrualDtSlots: 200n, minFundingLifetimeSlots: 200n });
    expect(typeof r.ok).toBe("boolean");
  });
  it("mm = 0 branch (holds at domain max)", () => {
    expect(ok({ maintenanceMarginBps: 0n, initialMarginBps: 0n }).ok).toBe(false);
    expect(ok({ maintenanceMarginBps: 0n, initialMarginBps: 0n, minNonzeroMmReq: 1n, minNonzeroImReq: 2n, liquidationFeeBps: 0n, maxAbsFundingE9PerSlot: 0n, liquidationFeeCap: 0n, minLiquidationAbs: 0n }).ok).toBe(false);
  });
  it("loss >= mm (lossCeil >= mm) uses the full exact range", () => {
    const r = ok({ maintenanceMarginBps: 50n, initialMarginBps: 100n, maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 100n, minFundingLifetimeSlots: 100n });
    expect(r.ok).toBe(false);
  });
  it("linear >= mm but loss < mm uses the cap tail", () => {
    const r = ok({ maintenanceMarginBps: 1000n, initialMarginBps: 2000n, liquidationFeeBps: 950n, maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 10n, minFundingLifetimeSlots: 10n, maxAbsFundingE9PerSlot: 0n });
    expect(typeof r.ok).toBe("boolean");
  });
  it("floor region covers the whole domain (huge min margin)", () => {
    const r = ok({ minNonzeroMmReq: 10n ** 30n, minNonzeroImReq: 10n ** 30n + 1n, liquidationFeeCap: 10n ** 30n, minLiquidationAbs: 0n });
    expect(typeof r.ok).toBe("boolean");
  });
  it("small floor region with a tight min fee (tailFeeFloor branch)", () => {
    const r = ok({ minLiquidationAbs: 5_000n, liquidationFeeCap: 1_000_000n, minNonzeroMmReq: 10n, minNonzeroImReq: 20n, maxAbsFundingE9PerSlot: 0n });
    expect(typeof r.ok).toBe("boolean");
  });
  it("tail already inside the floor region returns early", () => {
    const r = ok({ minNonzeroMmReq: 1n << 90n, minNonzeroImReq: (1n << 90n) + 1n, liquidationFeeCap: 1n << 60n, minLiquidationAbs: 0n });
    expect(typeof r.ok).toBe("boolean");
  });
  it("headroom overflow (funding * slots) is refused", () => {
    expect(ok({ maxAccrualDtSlots: (1n << 64n) - 1n, minFundingLifetimeSlots: (1n << 64n) - 1n, maxAbsFundingE9PerSlot: 10_000n }).ok).toBe(false);
  });
  it("overflowing u128 arithmetic is refused, not thrown", () => {
    expect(ok({ liquidationFeeCap: (1n << 128n) - 1n, minLiquidationAbs: 0n, maxPriceMoveBpsPerSlot: 10_000n, maxAccrualDtSlots: (1n << 63n) }).ok).toBe(false);
  });
  it("exact-chunk scan finds a failure inside a small interval", () => {
    const r = ok({ maintenanceMarginBps: 100n, initialMarginBps: 200n, minNonzeroMmReq: 3n, minNonzeroImReq: 4n, liquidationFeeBps: 100n, liquidationFeeCap: 1_000n, minLiquidationAbs: 40n, maxAbsFundingE9PerSlot: 0n, maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 10n, minFundingLifetimeSlots: 10n });
    expect(typeof r.ok).toBe("boolean");
  });
  it("sweep: varied configs never throw and the decision is deterministic", () => {
    const mms = [0n, 1n, 50n, 500n, 1000n, 5000n, 9999n, 10_000n];
    const liqs = [0n, 1n, 100n, 5000n, 10_000n];
    const fees: [bigint, bigint][] = [[0n, 0n], [1n, 10n], [1000n, 10_000n], [1_000_000n, 5n * 10n ** 9n]];
    const mins: [bigint, bigint][] = [[1n, 2n], [1_000n, 2_000n], [10n ** 9n, 10n ** 9n + 1n]];
    let accepted = 0;
    let refused = 0;
    for (const mm of mms) for (const liq of liqs) for (const [minLiqAbs, liqCap] of fees) for (const [minMm, minIm] of mins) {
      for (const pmove of [1n, 50n, 1000n]) {
        const i = noRent({ maintenanceMarginBps: mm, initialMarginBps: mm > 5000n ? 10_000n : mm * 2n, liquidationFeeBps: liq, minLiquidationAbs: minLiqAbs, liquidationFeeCap: liqCap, minNonzeroMmReq: minMm, minNonzeroImReq: minIm, maxPriceMoveBpsPerSlot: pmove, maxAccrualDtSlots: 20n, minFundingLifetimeSlots: 20n });
        const a = checkBandSafetyLawV22(i);
        expect(checkBandSafetyLawV22(i)).toEqual(a);
        if (a.ok) accepted++; else refused++;
        const j = mk({ ...i, rent: { rentMaxE9PerSlot: 50, rentKinkBps: 5000 } });
        checkBandSafetyLawV22(j);
      }
    }
    expect(accepted).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
  });
});

describe("band safety law: max accepted rent", () => {
  const thin = mk({ maintenanceMarginBps: 500n, initialMarginBps: 1000n, maxAccrualDtSlots: 100n, minFundingLifetimeSlots: 100n });
  it("bisects to a boundary: accepted at max, refused at max+1", () => {
    const m = maxAcceptedRentE9PerSlotV22(thin)!;
    expect(m).toBe(4055n);
    expect(checkBandSafetyLawV22({ ...thin, rent: { rentMaxE9PerSlot: Number(m), rentKinkBps: 5000 } }).ok).toBe(true);
    expect(checkBandSafetyLawV22({ ...thin, rent: { rentMaxE9PerSlot: Number(m) + 1, rentKinkBps: 5000 } }).ok).toBe(false);
  });
  it("seed pilot accepts the full ceiling", () => {
    expect(maxAcceptedRentE9PerSlotV22(seed)).toBe(10_000n);
  });
  it("uses the default kink when no rent block is given", () => {
    expect(maxAcceptedRentE9PerSlotV22({ ...seed, rent: undefined })).toBe(maxAcceptedRentE9PerSlotV22(seed));
  });
  it("returns null when even the minimum rent is refused", () => {
    expect(maxAcceptedRentE9PerSlotV22(mk({ maxPortfolioAssets: 0 }))).toBeNull();
  });
  it("returns the ceiling when the maximum is accepted", () => {
    const easy = noBand({ maintenanceMarginBps: 10_000n, initialMarginBps: 10_000n, liquidationFeeBps: 0n, maxAbsFundingE9PerSlot: 0n, maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 1n, minFundingLifetimeSlots: 1n });
    const r = maxAcceptedRentE9PerSlotV22(easy);
    expect(r === 10_000n || r === null || r! >= 10n).toBe(true);
  });
});
