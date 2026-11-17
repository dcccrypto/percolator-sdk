import { describe, it, expect } from "vitest";
import {
  matcherFeeWorstCaseBpsV22,
  computeTradeFeeBpsToSignV22,
} from "../src/abi/v22-trade-fee.js";
import { MATCHER_EXT_MODE_V1_P1 } from "../src/abi/risk-limits-p1.js";

/**
 * Mirror of percolator-match `v2::price_with_total_bps` + `v2::requested_fee_bps`
 * (feat/growth-v19-dynamic-leverage): the fee request the wrapper sees for a fill whose spread is `total` bps.
 */
function matcherRequestBps(oracleE6: bigint, total: bigint, buy: boolean): bigint {
  const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
  const exec = buy ? ceil(oracleE6 * (10_000n + total), 10_000n) : (oracleE6 * (10_000n - total)) / 10_000n;
  const d = exec > oracleE6 ? exec - oracleE6 : oracleE6 - exec;
  const bps = ceil(d * 10_000n, oracleE6);
  return bps > 1023n ? 1023n : bps;
}

describe("matcherFeeWorstCaseBpsV22 vs percolator-match requested_fee_bps", () => {
  const base = { tradeFeeBaseBps: 30n, maxTradingFeeBps: 2000n, maxRequestedFeeBps: 1023 };

  it("total + 1 holds for ordinary prices (>= $0.01)", () => {
    for (const o of [10_000n, 12_345n, 1_000_000n, 150_000_000n]) {
      for (const t of [0n, 1n, 50n, 200n, 900n]) {
        for (const buy of [true, false]) {
          const worst = matcherFeeWorstCaseBpsV22({ ...base, matcherMaxTotalBps: Number(t) });
          expect(BigInt(worst)).toBeGreaterThanOrEqual(matcherRequestBps(o, t, buy));
        }
      }
    }
  });

  it("with the oracle price supplied, covers sub-cent prices where rounding exceeds +1", () => {
    // oracle 100 (e6) = $0.0001, max_total 50: buy exec = 101 -> request ceil(1e4/100) = 100 bps > 51.
    expect(matcherRequestBps(100n, 50n, true)).toBe(100n);
    const worst = matcherFeeWorstCaseBpsV22({ ...base, matcherMaxTotalBps: 50, oraclePriceE6: 100n });
    expect(worst).toBeGreaterThanOrEqual(100);
    // and the signed fee admits it
    const r = computeTradeFeeBpsToSignV22({ ...base, matcherMaxTotalBps: 50, oraclePriceE6: 100n });
    expect(r.feeBps).toBeGreaterThanOrEqual(30n + 100n);
  });

  it("is exact against the matcher over a sweep of oracle prices and totals", () => {
    for (const o of [1n, 7n, 100n, 999n, 5_000n, 9_999n, 10_000n, 65_432n]) {
      for (const t of [0n, 1n, 25n, 50n, 333n, 9000n]) {
        const worst = matcherFeeWorstCaseBpsV22({ ...base, matcherMaxTotalBps: Number(t), oraclePriceE6: o });
        for (const buy of [true, false]) {
          expect(BigInt(worst)).toBeGreaterThanOrEqual(matcherRequestBps(o, t, buy));
        }
      }
    }
  });

  it("never drops below total + 1 when the oracle drifts a tick between quote and fill", () => {
    for (const [client, fill, t] of [[1_000_000n, 1_000_001n, 50n], [150_000_000n, 150_000_001n, 23n], [100n, 99n, 50n], [50n, 49n, 50n]]) {
      const worst = matcherFeeWorstCaseBpsV22({ ...base, matcherMaxTotalBps: Number(t), oraclePriceE6: client });
      for (const buy of [true, false]) expect(BigInt(worst)).toBeGreaterThanOrEqual(matcherRequestBps(fill, t, buy));
      expect(worst).toBeGreaterThanOrEqual(Number(t) + 1);
    }
  });

  it("returns 0 for any ext mode other than V1 (the wrapper offers the channel only for mode 1)", () => {
    expect(matcherFeeWorstCaseBpsV22({ ...base, matcherExtMode: 0 })).toBe(0);
    expect(matcherFeeWorstCaseBpsV22({ ...base, matcherExtMode: 2 })).toBe(0);
    expect(matcherFeeWorstCaseBpsV22({ ...base, matcherExtMode: MATCHER_EXT_MODE_V1_P1, matcherMaxTotalBps: 60 })).toBe(61);
  });
});

describe("computeTradeFeeBpsToSignV22 guards", () => {
  const ok = { maxRequestedFeeBps: 1023, matcherExtMode: 0 };
  it("rejects negative fee bps", () => {
    expect(() => computeTradeFeeBpsToSignV22({ ...ok, tradeFeeBaseBps: -1n, maxTradingFeeBps: 10n })).toThrow(/non-negative/);
    expect(() => computeTradeFeeBpsToSignV22({ ...ok, tradeFeeBaseBps: 1n, maxTradingFeeBps: -1n })).toThrow(/non-negative/);
  });
  it("rejects base above the market max (every trade refused)", () => {
    expect(() => computeTradeFeeBpsToSignV22({ ...ok, tradeFeeBaseBps: 11n, maxTradingFeeBps: 10n })).toThrow(/exceeds max_trading_fee_bps/);
  });
});
