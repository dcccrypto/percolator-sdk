import { describe, it, expect } from "vitest";
import {
  bandGenesisFloorE6V22,
  bandMinLegFloorAtomsV22,
  bandWorstAdverseBpsV22,
  checkBandSafetyLawV22,
  maxAcceptedRentE9PerSlotV22,
  type BandSafetyLawInputV22,
} from "../src/abi/v22-band-safety-law.js";

/** A no-rent, no-band config the engine accepts. Every case below changes one thing and pins the verdict. */
const plain: BandSafetyLawInputV22 = {
  maxPortfolioAssets: 1, maintenanceMarginBps: 1000n, initialMarginBps: 2000n, liquidationFeeBps: 50n,
  liquidationFeeCap: 10_000_000_000n, minLiquidationAbs: 0n, minNonzeroMmReq: 1_000_000n, minNonzeroImReq: 2_000_000n,
  maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 500n, maxAbsFundingE9PerSlot: 111n, minFundingLifetimeSlots: 500n,
  maintenanceFeePerSlot: 0n, initialPriceE6: 80_000_000n, collateralDecimals: 6,
};
const pilot: BandSafetyLawInputV22 = {
  ...plain,
  rent: { rentMaxE9PerSlot: 100, rentKinkBps: 5000 },
  band: { bandBps: 130, bandMaxEpochSlots: 600, bandMaxPinSlots: 9000, bandMinLegNotional: 100_000_000n },
};
const BASE_INVALID = { ok: false, code: null, rule: "base-config" } as const;
const withBand = (b: Partial<NonNullable<BandSafetyLawInputV22["band"]>>): BandSafetyLawInputV22 => ({
  ...pilot, band: { ...pilot.band!, ...b },
});

describe("band safety law: base config shape refusals (no rent block)", () => {
  it("the unmodified base is ok", () => {
    expect(checkBandSafetyLawV22(plain)).toEqual({ ok: true, notChecked: [] });
  });

  const cases: [string, Partial<BandSafetyLawInputV22>][] = [
    ["maxPortfolioAssets 0", { maxPortfolioAssets: 0 }],
    ["minNonzeroMmReq 0", { minNonzeroMmReq: 0n }],
    ["minNonzeroMmReq >= minNonzeroImReq", { minNonzeroMmReq: 2_000_000n }],
    ["mm > im", { maintenanceMarginBps: 2001n }],
    ["im > 10000", { maintenanceMarginBps: 1000n, initialMarginBps: 10_001n }],
    ["liquidation fee bps > 10000", { liquidationFeeBps: 10_001n }],
    ["minLiquidationAbs > cap", { minLiquidationAbs: 10_000_000_001n }],
    ["cap above the protocol fee max", { liquidationFeeCap: 10n ** 36n + 1n }],
    ["max accrual dt 0", { maxAccrualDtSlots: 0n }],
    ["funding lifetime < dt", { minFundingLifetimeSlots: 499n }],
    ["funding > 10000 e9/slot", { maxAbsFundingE9PerSlot: 10_001n }],
    ["price move 0", { maxPriceMoveBpsPerSlot: 0n }],
    ["price move > 10000", { maxPriceMoveBpsPerSlot: 10_001n }],
  ];
  for (const [name, patch] of cases) {
    it(`refuses as base-config: ${name}`, () => {
      const r = checkBandSafetyLawV22({ ...plain, ...patch });
      expect(r).toMatchObject(BASE_INVALID);
      expect(r.ok === false && r.message).toBe("the market's base risk config is invalid on its own (InitMarket refuses it for another reason)");
    });
  }

  it("a price of 0 or above MAX_ORACLE_PRICE is refused before any rent or band word", () => {
    expect(checkBandSafetyLawV22({ ...pilot, initialPriceE6: 0n })).toMatchObject(BASE_INVALID);
    expect(checkBandSafetyLawV22({ ...pilot, initialPriceE6: 1_000_000_000_001n })).toMatchObject(BASE_INVALID);
    expect(checkBandSafetyLawV22({ ...plain, initialPriceE6: 1_000_000_000_000n }).ok).toBe(true);
  });

  it("the u128 ceiling: a loss or fee that overflows u128 makes the base invalid", () => {
    expect(
      checkBandSafetyLawV22({ ...plain, maintenanceMarginBps: 1000n, minLiquidationAbs: 0n, liquidationFeeCap: 10n ** 36n, minNonzeroMmReq: 10n ** 37n, minNonzeroImReq: 10n ** 37n + 1n, liquidationFeeBps: 10_000n, maxPriceMoveBpsPerSlot: 10_000n, maxAccrualDtSlots: 1n, minFundingLifetimeSlots: 1n, maxAbsFundingE9PerSlot: 0n }).ok,
    ).toBe(true);
  });
});

describe("band safety law: funding headroom and the exact envelope", () => {
  it("funding x slots beyond i128 headroom is refused (dt, then lifetime)", () => {
    // ADL_ONE 1e15 x MAX_ORACLE_PRICE 1e12 x funding 10000 x slots must stay <= i128::MAX (1.7014e38): slots <= 17_014_118.
    const big = { ...plain, maxAbsFundingE9PerSlot: 10_000n, maxAccrualDtSlots: 1n };
    expect(checkBandSafetyLawV22({ ...big, minFundingLifetimeSlots: 17_014_118n }).ok).toBe(true);
    expect(checkBandSafetyLawV22({ ...big, minFundingLifetimeSlots: 17_014_119n })).toMatchObject(BASE_INVALID);
    expect(checkBandSafetyLawV22({ ...big, maxAccrualDtSlots: 17_014_119n, minFundingLifetimeSlots: 17_014_119n })).toMatchObject(BASE_INVALID);
  });

  it("mm = 0: the law holds only when the floor covers the whole domain", () => {
    const zero = { ...plain, maintenanceMarginBps: 0n, initialMarginBps: 0n };
    expect(checkBandSafetyLawV22(zero)).toMatchObject(BASE_INVALID);
    const floored = { ...zero, minNonzeroMmReq: 10n ** 30n, minNonzeroImReq: 10n ** 30n + 1n };
    expect(checkBandSafetyLawV22(floored)).toEqual({ ok: true, notChecked: [] });
  });

  it("mm = 100% with loss ceiling exactly 10000 bps and no liquidation fee passes the early exit", () => {
    const edge = {
      ...plain, maintenanceMarginBps: 10_000n, initialMarginBps: 10_000n, liquidationFeeBps: 0n, minLiquidationAbs: 0n,
      minNonzeroMmReq: 1n, minNonzeroImReq: 2n, maxPriceMoveBpsPerSlot: 9_999n, maxAccrualDtSlots: 1n,
      minFundingLifetimeSlots: 1n, maxAbsFundingE9PerSlot: 1n,
    };
    expect(checkBandSafetyLawV22(edge)).toEqual({ ok: true, notChecked: [] });
    // one more bps of price move breaks mm = 100%: the loss alone is above the requirement
    expect(checkBandSafetyLawV22({ ...edge, maxPriceMoveBpsPerSlot: 10_000n })).toMatchObject(BASE_INVALID);
  });

  it("a notional floor above the whole domain returns before the tail search", () => {
    const huge = { ...plain, minNonzeroMmReq: 10n ** 19n, minNonzeroImReq: 10n ** 19n + 1n };
    expect(checkBandSafetyLawV22(huge)).toEqual({ ok: true, notChecked: [] });
    // the same floor with a loss that exceeds it at N = 1e20 fails at the end of the floor region
    expect(checkBandSafetyLawV22({ ...huge, maxPriceMoveBpsPerSlot: 5_000n, maxAccrualDtSlots: 2n, minFundingLifetimeSlots: 2n })).toMatchObject(BASE_INVALID);
  });
});

describe("band safety law: genesis floor, leg floor and G(d) helpers", () => {
  it("returns exact values at the pilot and the band limits", () => {
    expect(bandGenesisFloorE6V22(130n)).toBe(123_100n);
    expect(bandGenesisFloorE6V22(2001n)).toBeNull();
    expect(bandGenesisFloorE6V22(-5n)).toBeNull();
    expect(bandGenesisFloorE6V22(1n)).toBeGreaterThan(bandGenesisFloorE6V22(2000n)!);
    expect(bandWorstAdverseBpsV22(130n)).toBe(397n);
    expect(bandWorstAdverseBpsV22(-1n)).toBeNull();
    expect(bandWorstAdverseBpsV22(2000n)).toBe(((12_000n * 12_000n + 7_999n) / 8_000n) - 10_000n);
  });

  it("leg floor is 10 whole tokens, saturating at u64::MAX and clamping decimals at 30", () => {
    expect(bandMinLegFloorAtomsV22(0)).toBe(10n);
    expect(bandMinLegFloorAtomsV22(18)).toBe(10n ** 19n > (1n << 64n) - 1n ? (1n << 64n) - 1n : 10n ** 19n);
    expect(bandMinLegFloorAtomsV22(255)).toBe((1n << 64n) - 1n);
  });
});

describe("band safety law: refusal reasons and exact messages", () => {
  it("band shape: epoch, pin, min leg, portfolio size, width", () => {
    const shape = (r: ReturnType<typeof checkBandSafetyLawV22>) => r.ok === false && [r.code, r.rule];
    expect(shape(checkBandSafetyLawV22(withBand({ bandMaxEpochSlots: 149 })))).toEqual([105, "band-shape-or-law"]);
    expect(checkBandSafetyLawV22(withBand({ bandMaxEpochSlots: 150, bandMaxPinSlots: 1200 })).ok).toBe(true);
    expect(shape(checkBandSafetyLawV22(withBand({ bandMaxEpochSlots: 150, bandMaxPinSlots: 1199 })))).toEqual([105, "band-shape-or-law"]);
    expect(shape(checkBandSafetyLawV22(withBand({ bandMinLegNotional: 0n })))).toEqual([105, "band-shape-or-law"]);
    expect(shape(checkBandSafetyLawV22({ ...pilot, maxPortfolioAssets: 2 }))).toEqual([105, "band-shape-or-law"]);
    expect(shape(checkBandSafetyLawV22(withBand({ bandBps: 2001 })))).toEqual([105, "band-shape-or-law"]);
  });

  it("messages carry the offending values", () => {
    const r = checkBandSafetyLawV22(withBand({ bandBps: 2001 }));
    expect(r).toEqual({ ok: false, code: 105, rule: "band-shape-or-law", message: "price protection 2001 bps / epoch 600 slots breaks the Band Safety Law or the band's shape at this margin" });
    expect(checkBandSafetyLawV22({ ...pilot, maintenanceFeePerSlot: 1n })).toEqual({ ok: false, code: 105, rule: "band-maintenance-fee", message: "a market with price protection must set the maintenance fee to 0" });
    expect(checkBandSafetyLawV22({ ...pilot, initialPriceE6: 123_099n })).toEqual({ ok: false, code: 105, rule: "band-genesis-price", message: "genesis price 123099 (e6 per lot) is below the band's floor 123100" });
    expect(checkBandSafetyLawV22({ ...pilot, initialPriceE6: 123_100n }).ok).toBe(true);
    expect(checkBandSafetyLawV22(withBand({ bandMinLegNotional: 9_999_999n }))).toEqual({ ok: false, code: 105, rule: "band-min-leg", message: "minimum leg 9999999 atoms is below 10 whole collateral tokens" });
    expect(checkBandSafetyLawV22(withBand({ bandMinLegNotional: 10_000_000n })).ok).toBe(true);
    expect(checkBandSafetyLawV22({ ...pilot, rent: { rentMaxE9PerSlot: 9, rentKinkBps: 5000 } })).toMatchObject({ code: 106, rule: "rent-block" });
    expect(checkBandSafetyLawV22({ ...pilot, rent: { rentMaxE9PerSlot: 10_001, rentKinkBps: 5000 } })).toMatchObject({ code: 106, rule: "rent-block" });
    expect(checkBandSafetyLawV22({ ...pilot, rent: { rentMaxE9PerSlot: 100, rentKinkBps: 10_001 } })).toMatchObject({ code: 106, rule: "rent-block" });
  });

  it("rent 0 is a valid rent block; a band with bandBps 0 behaves as no band", () => {
    expect(checkBandSafetyLawV22({ ...pilot, rent: { rentMaxE9PerSlot: 0, rentKinkBps: 0 } }).ok).toBe(true);
    const { band: _b, ...noBand } = pilot;
    expect(checkBandSafetyLawV22({ ...noBand, band: { bandBps: 0, bandMaxEpochSlots: 0, bandMaxPinSlots: 0, bandMinLegNotional: 0n } })).toEqual({ ok: true, notChecked: [] });
    expect(checkBandSafetyLawV22({ ...noBand, liquidationFeeBps: 500n })).toMatchObject(BASE_INVALID);
  });

  it("an invalid base with a rent block still reports base-config (not a rent refusal)", () => {
    const r = checkBandSafetyLawV22({ ...pilot, liquidationFeeBps: 500n, band: undefined });
    expect(r).toMatchObject(BASE_INVALID);
  });

  it("malformed fields throw RangeError naming the field", () => {
    expect(() => checkBandSafetyLawV22({ ...plain, maxPortfolioAssets: 1.5 })).toThrow(/maxPortfolioAssets must be an integer/);
    expect(() => checkBandSafetyLawV22({ ...plain, maxPortfolioAssets: 0x1_0000 })).toThrow(RangeError);
    expect(() => checkBandSafetyLawV22({ ...plain, initialPriceE6: -1n })).toThrow(/initialPriceE6/);
    expect(() => checkBandSafetyLawV22({ ...plain, collateralDecimals: 256 })).toThrow(/collateralDecimals/);
    expect(() => checkBandSafetyLawV22({ ...plain, maintenanceFeePerSlot: -1n })).toThrow(/maintenanceFeePerSlot/);
    expect(() => checkBandSafetyLawV22({ ...plain, maintenanceMarginBps: 1000 as unknown as bigint })).toThrow(/maintenanceMarginBps/);
    expect(() => checkBandSafetyLawV22({ ...pilot, rent: { rentMaxE9PerSlot: -1, rentKinkBps: 0 } })).toThrow(/rentMaxE9PerSlot/);
  });
});

describe("band safety law: maxAcceptedRentE9PerSlotV22", () => {
  it("returns the 10,000 ceiling when it fits and defaults the kink to 5000", () => {
    const { rent: _r, ...noRent } = pilot;
    expect(maxAcceptedRentE9PerSlotV22(noRent)).toBe(10_000n);
  });

  it("returns null when even the minimum rent 10 is refused", () => {
    // base is valid, but 10 e9/slot of rent on top of a 1-bps-margin config is not
    const tight = { ...plain, maintenanceMarginBps: 1000n, maxPriceMoveBpsPerSlot: 99n, maxAccrualDtSlots: 10n, minFundingLifetimeSlots: 10n, maxAbsFundingE9PerSlot: 10_000n };
    expect(checkBandSafetyLawV22({ ...tight, rent: { rentMaxE9PerSlot: 10, rentKinkBps: 5000 } })).toMatchObject({ ok: false });
    expect(maxAcceptedRentE9PerSlotV22(tight)).toBeNull();
  });

  it("bisects to the exact boundary when 10,000 is refused", () => {
    const thin = { ...pilot, maintenanceMarginBps: 600n, initialMarginBps: 1000n };
    const m = maxAcceptedRentE9PerSlotV22(thin)!;
    expect(m).toBeGreaterThanOrEqual(10n);
    expect(m).toBeLessThan(10_000n);
    const at = (v: bigint) => checkBandSafetyLawV22({ ...thin, rent: { rentMaxE9PerSlot: Number(v), rentKinkBps: 5000 } }).ok;
    expect(at(m)).toBe(true);
    expect(at(m + 1n)).toBe(false);
  });
});

describe("band safety law: exact-envelope tail branches (configs found by fuzzing the validator)", () => {
  const mk = (mm: bigint, im: bigint, liq: bigint, cap: bigint, mla: bigint, minMm: bigint, minIm: bigint, pm: bigint, dt: bigint, f: bigint, life: bigint): BandSafetyLawInputV22 => ({
    ...plain, maintenanceMarginBps: mm, initialMarginBps: im, liquidationFeeBps: liq, liquidationFeeCap: cap, minLiquidationAbs: mla,
    minNonzeroMmReq: minMm, minNonzeroImReq: minIm, maxPriceMoveBpsPerSlot: pm, maxAccrualDtSlots: dt, maxAbsFundingE9PerSlot: f,
    minFundingLifetimeSlots: life, initialPriceE6: null, collateralDecimals: null,
  });
  const OK = { ok: true, notChecked: [] };
  const rows: [string, BandSafetyLawInputV22, unknown][] = [
    ["tail below the floor region (linear < mm, exact tail <= start)", mk(693n, 5599n, 4858n, 34528n, 154n, 726598580n, 726598590n, 1n, 1n, 0n, 21490n), OK],
    ["floor region swallows the tail, fee-floor tail wins", mk(1191n, 5270n, 170n, 235225202320n, 303n, 100000000000n, 100000000007n, 38n, 1n, 0n, 77600n), OK],
    ["linear tail wins over the fee-floor tail", mk(1342n, 2299n, 261n, 796906835652n, 0n, 738n, 742n, 1n, 1n, 0n, 46578n), OK],
    ["a real exact range after the floor region", mk(937n, 6506n, 0n, 866353n, 0n, 1n, 9n, 1n, 1n, 0n, 40212n), OK],
    ["a wide exact range that bisects without hitting the interval limit", mk(1228n, 7763n, 0n, 932787589085n, 0n, 1n, 10n, 18n, 62n, 0n, 63012n), OK],
    ["a violation inside an exact chunk is found", mk(5139n, 8970n, 0n, 873475n, 0n, 1n, 6n, 6854n, 1n, 3387n, 70244n), BASE_INVALID],
    ["liq-cap tail (loss below mm, no linear room), with funding", mk(137n, 199n, 47n, 10_000_000n, 0n, 209n, 212n, 1n, 84n, 4821n, 75133n), OK],
    ["huge liq cap: the exact range is clamped to the domain and the law fails", mk(1197n, 1817n, 1194n, 10n ** 27n, 215n, 881748817n, 881748826n, 1n, 1n, 11n, 38388n), BASE_INVALID],
  ];
  for (const [name, input, want] of rows) {
    it(name, () => {
      expect(checkBandSafetyLawV22(input)).toMatchObject(want as object);
    });
  }
});
