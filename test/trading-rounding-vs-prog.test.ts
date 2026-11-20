import { describe, it, expect } from "vitest";
import {
  computeRequiredMargin,
  computeLiqPrice,
  computeTradingFee,
  computeTradeFeeNotionalCeil,
  computeFeeSplit,
  computeFeeSplitDust,
} from "../src/math/trading.js";

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

describe("computeRequiredMargin ceils (v16.rs:28974)", () => {
  it("report cases", () => {
    expect(computeRequiredMargin(1n, 1000n)).toBe(1n);
    expect(computeRequiredMargin(12345n, 500n)).toBe(618n);
  });
  it("grid == ceil", () => {
    for (const n of [0n, 1n, 9n, 10n, 99n, 12345n, 1_000_000n])
      for (const b of [1n, 100n, 500n, 1000n, 2500n])
        expect(computeRequiredMargin(n, b)).toBe(ceilDiv(n * b, 10000n));
  });
});

describe("computeLiqPrice long rounds to safe side (v16.rs:14892)", () => {
  // engine: equity = cap + floor((P-entry)*q/1e6) ; maint = ceil(ceil(q*P/1e6)*mm/1e4); liquidatable iff equity < maint
  const liquidatable = (P: bigint, e: bigint, cap: bigint, q: bigint, mm: bigint) => {
    const d = (P - e) * q;
    const pnl = d >= 0n ? d / 1_000_000n : -ceilDiv(-d, 1_000_000n);
    return cap + pnl < ceilDiv(ceilDiv(q * P, 1_000_000n) * mm, 10000n);
  };
  it("report case", () => {
    expect(computeLiqPrice(1_000_000n, 100_000n, 1_000_000n, 500n)).toBe(947369n);
  });
  it("grid: liq price itself is safe, liq-1 is not (tolerance: never liquidatable at result)", () => {
    for (const mm of [500n, 1000n, 2500n])
      for (const q of [1_000_000n, 3_000_000n, 7_000_000n])
        for (const cap of [100_000n, 400_000n, 900_000n]) {
          const L = computeLiqPrice(1_000_000n, cap, q, mm);
          if (L === 0n) continue;
          expect(liquidatable(L, 1_000_000n, cap, q, mm)).toBe(false);
        }
  });
  it("short unchanged (floor)", () => {
    expect(computeLiqPrice(1_000_000n, 100_000n, -1_000_000n, 500n)).toBe(1_047_619n);
  });
});

describe("fee notional ceil (v16.rs:29014, 23446)", () => {
  it("report case size=1 price=1 30bps", () => {
    expect(computeTradingFee(computeTradeFeeNotionalCeil(1n, 1n), 30n)).toBe(1n);
  });
  it("grid", () => {
    for (const s of [1n, 7n, 999_999n, 1_000_001n, -5n])
      for (const p of [1n, 3n, 1_500_000n]) {
        const a = s < 0n ? -s : s;
        expect(computeTradeFeeNotionalCeil(s, p)).toBe(ceilDiv(a * p, 1_000_000n));
      }
    expect(computeTradeFeeNotionalCeil(0n, 5n)).toBe(0n);
  });
  it("large size agrees with report", () => {
    const n = computeTradeFeeNotionalCeil(1_000_000_001n, 1_500_000n);
    expect(computeTradingFee(n, 30n)).toBe(4_500_001n);
  });
});

describe("computeFeeSplit dust is not creator's (v16_program.rs:13522)", () => {
  it("report cases", () => {
    expect(computeFeeSplit(1n, { lpBps: 3333n, protocolBps: 3333n, creatorBps: 3334n })).toEqual([0n, 0n, 0n]);
    expect(computeFeeSplitDust(1n, { lpBps: 3333n, protocolBps: 3333n, creatorBps: 3334n })).toBe(1n);
    expect(computeFeeSplit(9999n, { lpBps: 2000n, protocolBps: 6000n, creatorBps: 2000n })).toEqual([1999n, 5999n, 1999n]);
    expect(computeFeeSplitDust(9999n, { lpBps: 2000n, protocolBps: 6000n, creatorBps: 2000n })).toBe(2n);
  });
  it("grid: every share floors, parts + dust = fee", () => {
    for (const f of [0n, 1n, 2n, 33n, 101n, 9999n, 10_001n])
      for (const [l, p, c] of [[3333n, 3333n, 3334n], [2000n, 6000n, 2000n], [5000n, 3333n, 1667n]]) {
        const cfg = { lpBps: l, protocolBps: p, creatorBps: c };
        const r = computeFeeSplit(f, cfg);
        expect(r).toEqual([(f * l) / 10000n, (f * p) / 10000n, (f * c) / 10000n]);
        expect(r[0] + r[1] + r[2] + computeFeeSplitDust(f, cfg)).toBe(f);
      }
  });
});
