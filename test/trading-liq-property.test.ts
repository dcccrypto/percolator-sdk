import { describe, it, expect } from "vitest";
import { computeLiqPrice, computePreTradeLiqPrice, computeMarkPnl } from "../src/math/trading.js";

// Reference model: engine v16 maintenance rule (percolator v16.rs
// liquidation_leg_maintenance_requirement): notional = ceil(q*P/POS_SCALE),
// req = ceil(notional*mm/1e4), liquidatable iff equity < req,
// equity = capital + q*(P-entry)/POS_SCALE (exact rational; compared scaled by POS_SCALE).
const POS_SCALE = 1_000_000n;
const cdiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

function liquidatable(entry: bigint, capital: bigint, pos: bigint, mm: bigint, P: bigint): boolean {
  const q = pos < 0n ? -pos : pos;
  const pnlScaled = (pos > 0n ? P - entry : entry - P) * q; // *1/POS_SCALE
  const equityScaled = capital * POS_SCALE + pnlScaled;
  const notional = cdiv(q * P, POS_SCALE);
  const req = cdiv(notional * mm, 10000n);
  return equityScaled < req * POS_SCALE;
}

// Deterministic PRNG
let s = 0x9e3779b97f4a7c15n;
const rnd = (n: bigint) => {
  s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
  return (s >> 11n) % n;
};

describe("computeLiqPrice property vs engine reference", () => {
  it("20k random positions: liq price brackets the engine boundary (within 1% + 2 units)", () => {
    const mismatches: string[] = [];
    let cases = 0;
    for (let i = 0; i < 20000; i++) {
      const lotExp = Number(rnd(10n)); // q in lots; lot_exp only affects display, not q/price scale
      void lotExp;
      const entry = 1n + rnd(10n ** BigInt(3 + Number(rnd(9n))));
      const q = (1n + rnd(10n ** BigInt(3 + Number(rnd(8n))))) * (rnd(2n) === 0n ? 1n : -1n);
      const absq = q < 0n ? -q : q;
      // Skip dust (<1e6 base units notional): engine ceil(notional)/ceil(req) dominates there.
      if (absq * entry < 10n ** 12n) { i--; continue; }
      const capital = 1n + rnd(cdiv(absq * entry, POS_SCALE) * 2n + 10n);
      const mm = rnd(9999n);
      const liq = computeLiqPrice(entry, capital, q, mm);
      cases++;
      if (liq === 0n) {
        // long never liquidatable at positive prices tested: check a few prices
        if (q > 0n && liquidatable(entry, capital, q, mm, 1n + rnd(entry * 3n))) {
          // price 1.. with liq 0 -> claimed safe; only mismatch if clearly liquidatable
          const P = 1n + rnd(entry * 3n);
          if (liquidatable(entry, capital, q, mm, P) && P > 2n) mismatches.push(`zero-liq long e=${entry} c=${capital} q=${q} mm=${mm} P=${P}`);
        }
        continue;
      }
      const lo = liq - liq / 100n - 2n;
      const hi = liq + liq / 100n + 2n;
      // Long: liquidatable below the boundary; short: above it.
      const below = lo > 0n ? lo : 1n;
      const longOk = !liquidatable(entry, capital, q, mm, hi) && liquidatable(entry, capital, q, mm, below);
      const shortOk = liquidatable(entry, capital, q, mm, hi) && !liquidatable(entry, capital, q, mm, below);
      const ok = q > 0n ? longOk || (below === 1n && !liquidatable(entry, capital, q, mm, hi)) : shortOk;
      if (!ok) mismatches.push(`e=${entry} c=${capital} q=${q} mm=${mm} liq=${liq}`);
    }
    expect(cases).toBe(20000);
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it("computePreTradeLiqPrice: fee moves liq closer to entry (long up, short down)", () => {
    for (let i = 0; i < 2000; i++) {
      const o = 1000n + rnd(10n ** 9n);
      const q = 1_000_000n + rnd(10n ** 9n);
      const m = cdiv(q * o, POS_SCALE) / 5n + 1n;
      const mm = rnd(2000n);
      const f0 = computePreTradeLiqPrice(o, m, q, mm, 0n, "long");
      const f1 = computePreTradeLiqPrice(o, m, q, mm, 50n, "long");
      expect(f1).toBeGreaterThanOrEqual(f0);
      const g0 = computePreTradeLiqPrice(o, m, q, mm, 0n, "short");
      const g1 = computePreTradeLiqPrice(o, m, q, mm, 50n, "short");
      expect(g1).toBeLessThanOrEqual(g0);
    }
  });

  it("computeMarkPnl: sign/zero/negative oracle never throws", () => {
    expect(computeMarkPnl(5n, 10n, 0n)).toBe(0n);
    expect(() => computeMarkPnl(5n, 10n, -3n)).not.toThrow();
    expect(computeMarkPnl(-5n, 10n, 5n)).toBe(5n);
  });
});
