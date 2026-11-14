import { describe, it, expect } from "vitest";
import {
  computeMarkPnl,
  computeLiqPrice,
  computePreTradeLiqPrice,
  computeTradingFee,
  computeDynamicFeeBps,
  computeDynamicTradingFee,
  computeFeeSplit,
  computePnlPercent,
  computeEstimatedEntryPrice,
  computeFundingRateAnnualized,
  computeRequiredMargin,
  computeMaxLeverage,
  computeMaxLeverageFloor,
  type FeeTierConfig,
} from "../src/math/trading";

const MAX_U64 = 18446744073709551615n;

describe("computeMarkPnl", () => {
  it("is zero for a flat position or a zero oracle", () => {
    expect(computeMarkPnl(0n, 100n, 200n)).toBe(0n);
    expect(computeMarkPnl(5n, 100n, 0n)).toBe(0n);
  });
  it("long gains when oracle rises: (200-100)*1000/200", () => {
    expect(computeMarkPnl(1000n, 100n, 200n)).toBe(500n);
  });
  it("short gains when oracle falls: (200-100)*1000/100", () => {
    expect(computeMarkPnl(-1000n, 200n, 100n)).toBe(1000n);
  });
  it("short loses when oracle rises, truncating toward zero", () => {
    expect(computeMarkPnl(-1000n, 100n, 300n)).toBe(-666n);
  });
});

describe("computeLiqPrice", () => {
  it("returns 0 for no position or no entry", () => {
    expect(computeLiqPrice(100n, 10n, 0n, 500n)).toBe(0n);
    expect(computeLiqPrice(0n, 10n, 5n, 500n)).toBe(0n);
  });
  it("long: entry - capitalPerUnit*10000/(10000+mm)", () => {
    // cap/unit e6 = 1e6*1e6/1e6... capital 1e6, pos 1e6 -> 1_000_000
    // adjusted = 1e6*10000/10500 = 952380 ; liq = 2e6 - 952380
    expect(computeLiqPrice(2_000_000n, 1_000_000n, 1_000_000n, 500n)).toBe(1_047_620n);
  });
  it("long: clamps at 0 when capital covers the entry", () => {
    expect(computeLiqPrice(100n, 1_000_000n, 1n, 500n)).toBe(0n);
  });
  it("short: entry + capitalPerUnit*10000/(10000-mm)", () => {
    // adjusted = 1e6*10000/9500 = 1052631
    expect(computeLiqPrice(2_000_000n, 1_000_000n, -1_000_000n, 500n)).toBe(3_052_631n);
  });
  it("short with maintenance >= 100% is unliquidatable (max u64)", () => {
    expect(computeLiqPrice(2_000_000n, 1_000_000n, -1_000_000n, 10000n)).toBe(MAX_U64);
    expect(computeLiqPrice(2_000_000n, 1_000_000n, -1_000_000n, 20000n)).toBe(MAX_U64);
  });
});

describe("computePreTradeLiqPrice", () => {
  it("returns 0 on any zero input", () => {
    expect(computePreTradeLiqPrice(0n, 1n, 1n, 500n, 10n, "long")).toBe(0n);
    expect(computePreTradeLiqPrice(1n, 0n, 1n, 500n, 10n, "long")).toBe(0n);
    expect(computePreTradeLiqPrice(1n, 1n, 0n, 500n, 10n, "long")).toBe(0n);
  });
  it("long pays the fee on entry", () => {
    // entry = 2e6 + 2e6*100/10000 = 2_020_000
    expect(computePreTradeLiqPrice(2_000_000n, 1_000_000n, 1_000_000n, 500n, 100n, "long")).toBe(
      computeLiqPrice(2_020_000n, 1_000_000n, 1_000_000n, 500n),
    );
  });
  it("short receives less; a negative position size is read as its magnitude", () => {
    const a = computePreTradeLiqPrice(2_000_000n, 1_000_000n, -1_000_000n, 500n, 100n, "short");
    expect(a).toBe(computeLiqPrice(1_980_000n, 1_000_000n, -1_000_000n, 500n));
    expect(a).toBe(computePreTradeLiqPrice(2_000_000n, 1_000_000n, 1_000_000n, 500n, 100n, "short"));
  });
  it("short with fee >= 100% clamps entry to 1 instead of reporting no-risk 0", () => {
    const p = computePreTradeLiqPrice(1_000_000n, 1_000_000n, 1_000_000n, 500n, 10000n, "short");
    expect(p).toBe(computeLiqPrice(1n, 1_000_000n, -1_000_000n, 500n));
    expect(p).toBeGreaterThan(0n);
  });
});

describe("fees", () => {
  it("computeTradingFee floors", () => {
    expect(computeTradingFee(1_000_000n, 10n)).toBe(1000n);
    expect(computeTradingFee(9_999n, 1n)).toBe(0n);
  });

  const cfg: FeeTierConfig = {
    baseBps: 10n,
    tier2Bps: 20n,
    tier3Bps: 30n,
    tier2Threshold: 1000n,
    tier3Threshold: 5000n,
  };
  it("flat base fee when tier2Threshold is 0", () => {
    expect(computeDynamicFeeBps(10n ** 12n, { ...cfg, tier2Threshold: 0n })).toBe(10n);
  });
  it("selects tier at each boundary", () => {
    expect(computeDynamicFeeBps(999n, cfg)).toBe(10n);
    expect(computeDynamicFeeBps(1000n, cfg)).toBe(20n);
    expect(computeDynamicFeeBps(4999n, cfg)).toBe(20n);
    expect(computeDynamicFeeBps(5000n, cfg)).toBe(30n);
  });
  it("tier3 disabled (threshold 0) never selects tier3", () => {
    expect(computeDynamicFeeBps(10n ** 12n, { ...cfg, tier3Threshold: 0n })).toBe(20n);
  });
  it("dynamic fee rounds up and is 0 for non-positive notional or rate", () => {
    expect(computeDynamicTradingFee(1n, cfg)).toBe(1n);
    expect(computeDynamicTradingFee(1000n, cfg)).toBe(2n);
    expect(computeDynamicTradingFee(0n, cfg)).toBe(0n);
    expect(computeDynamicTradingFee(-5n, cfg)).toBe(0n);
    expect(computeDynamicTradingFee(100n, { ...cfg, baseBps: 0n })).toBe(0n);
  });
});

describe("computeFeeSplit", () => {
  it("all-zero split sends everything to LP", () => {
    expect(computeFeeSplit(777n, { lpBps: 0n, protocolBps: 0n, creatorBps: 0n })).toEqual([777n, 0n, 0n]);
  });
  it("creator takes the rounding remainder; total preserved", () => {
    const r = computeFeeSplit(101n, { lpBps: 5000n, protocolBps: 3333n, creatorBps: 1667n });
    expect(r).toEqual([50n, 33n, 18n]);
    expect(r[0] + r[1] + r[2]).toBe(101n);
  });
  it("rejects negative parts and sums != 10000", () => {
    expect(() => computeFeeSplit(1n, { lpBps: -1n, protocolBps: 10001n, creatorBps: 0n })).toThrow(/non-negative/);
    expect(() => computeFeeSplit(1n, { lpBps: 5000n, protocolBps: 4000n, creatorBps: 0n })).toThrow(/sum to 10000, got 9000/);
  });
});

describe("computePnlPercent", () => {
  it("is 0 for zero capital", () => {
    expect(computePnlPercent(5n, 0n)).toBe(0);
  });
  it("two-decimal percent, signed", () => {
    expect(computePnlPercent(1n, 3n)).toBe(33.33);
    expect(computePnlPercent(-1n, 4n)).toBe(-25);
  });
  it("clamps beyond MAX_SAFE_INTEGER both ways", () => {
    const big = 10n ** 30n;
    expect(computePnlPercent(big, 1n)).toBe(Number.MAX_SAFE_INTEGER / 100);
    expect(computePnlPercent(-big, 1n)).toBe(-(Number.MAX_SAFE_INTEGER / 100));
  });
});

describe("computeEstimatedEntryPrice", () => {
  it("zero oracle -> 0", () => {
    expect(computeEstimatedEntryPrice(0n, 10n, "long")).toBe(0n);
  });
  it("long adds, short subtracts the fee impact", () => {
    expect(computeEstimatedEntryPrice(1_000_000n, 100n, "long")).toBe(1_010_000n);
    expect(computeEstimatedEntryPrice(1_000_000n, 100n, "short")).toBe(990_000n);
  });
  it("short clamps to 1 when fee >= 100%", () => {
    expect(computeEstimatedEntryPrice(1_000_000n, 10000n, "short")).toBe(1n);
    expect(computeEstimatedEntryPrice(1_000_000n, 25000n, "short")).toBe(1n);
  });
});

describe("computeFundingRateAnnualized", () => {
  it("scales by slots/year", () => {
    expect(computeFundingRateAnnualized(0n)).toBe(0);
    expect(computeFundingRateAnnualized(1n)).toBe((2.5 * 60 * 60 * 24 * 365) / 100);
    expect(computeFundingRateAnnualized(-2n)).toBe(-2 * ((2.5 * 60 * 60 * 24 * 365) / 100));
  });
  it("returns +/-Infinity beyond the safe range", () => {
    expect(computeFundingRateAnnualized(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toBe(Infinity);
    expect(computeFundingRateAnnualized(-BigInt(Number.MAX_SAFE_INTEGER) - 1n)).toBe(-Infinity);
  });
});

describe("margin and leverage", () => {
  it("required margin floors", () => {
    expect(computeRequiredMargin(1_000_000n, 1000n)).toBe(100_000n);
    expect(computeRequiredMargin(99n, 100n)).toBe(0n);
  });
  it("max leverage keeps the fraction; floor form is integer", () => {
    expect(computeMaxLeverage(1000n)).toBe(10);
    expect(computeMaxLeverage(3000n)).toBeCloseTo(3.3333, 4);
    expect(computeMaxLeverageFloor(3000n)).toBe(3n);
    expect(computeMaxLeverageFloor(10000n)).toBe(1n);
    expect(computeMaxLeverageFloor(20000n)).toBe(0n);
  });
  it("both reject non-positive initial margin", () => {
    expect(() => computeMaxLeverage(0n)).toThrow(/must be positive/);
    expect(() => computeMaxLeverage(-1n)).toThrow(/must be positive/);
    expect(() => computeMaxLeverageFloor(0n)).toThrow(/must be positive/);
    expect(() => computeMaxLeverageFloor(-1n)).toThrow(/must be positive/);
  });
});
