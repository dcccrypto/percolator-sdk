/**
 * Parity grid: src/math/trading.ts vs the v22 program/engine (read only):
 *   dcccrypto/percolator-prog feat/v22-rc23-2026-10-22  src/v16_program.rs
 *     two_sided_trade_fee_paid_cap: one_side = ceil(notional * fee_bps / 10_000)
 *   dcccrypto/percolator feat/v22-engine-rc23-2026-10-22  src/v16.rs
 *     liquidation_leg_maintenance_requirement / margin_requirement:
 *       risk_notional = ceil(abs_q * price / POS_SCALE)
 *       mm_req = max(ceil(risk_notional * mm_bps / 10_000), floor)
 *     equity = capital + signed_q * (price - entry) / POS_SCALE
 *     liquidatable when equity < mm_req.
 * The program has no tier2/tier3 schedule; the fee rate is a caller-supplied
 * bps with the base fee as a floor, so a tier whose bps is 0 ("disabled" per
 * the FeeTierConfig docs) must fall back to the tier below it, not to a free trade.
 */
import { describe, it, expect } from "vitest";
import {
  computeLiqPrice,
  computePreTradeLiqPrice,
  computeTradingFee,
  computeDynamicFeeBps,
  computeDynamicTradingFee,
  type FeeTierConfig,
} from "../src/math/trading.js";

const POS_SCALE = 1_000_000n;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** Engine fee per side. */
const engineFee = (notional: bigint, bps: bigint) =>
  notional === 0n || bps === 0n ? 0n : ceilDiv(notional * bps, 10_000n);

/** Engine health check at `price`: true when NOT liquidatable. */
function healthy(capital: bigint, q: bigint, entry: bigint, price: bigint, mm: bigint): boolean {
  const abs = q < 0n ? -q : q;
  const equity = capital + (q * (price - entry)) / POS_SCALE;
  const riskNotional = ceilDiv(abs * price, POS_SCALE);
  const req = ceilDiv(riskNotional * mm, 10_000n);
  return equity >= (req > 1n ? req : 1n);
}

/** Exact engine liquidation boundary by bisection on the integer health check. */
function engineLiqPrice(capital: bigint, q: bigint, entry: bigint, mm: bigint): bigint {
  if (q > 0n) {
    // healthy for high prices; find smallest healthy price
    let lo = 0n, hi = entry * 4n;
    if (healthy(capital, q, entry, lo, mm)) return 0n;
    while (hi - lo > 1n) {
      const mid = (lo + hi) / 2n;
      if (healthy(capital, q, entry, mid, mm)) hi = mid; else lo = mid;
    }
    return hi;
  }
  // short: healthy for low prices; find largest healthy price
  let lo = 0n, hi = entry * 1000n;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (healthy(capital, q, entry, mid, mm)) lo = mid; else hi = mid;
  }
  return lo;
}

const abs = (x: bigint) => (x < 0n ? -x : x);
const TOL = 2n; // rounding noise in e6 price units

interface Row { kind: string; input: string; sdk: bigint; program: bigint }
const rows: Row[] = [];

// ---- fee grid: notional x bps x tier config (incl. zero tiers) ----
const notionals = [1n, 3_333n, 3_334n, 99_999n, 1_000_000n, 12_345_678n, 1_000_000_000n];
const bpsList = [0n, 1n, 3n, 10n, 30n, 100n];
for (const n of notionals) {
  for (const b of bpsList) {
    rows.push({ kind: "fee", input: `n=${n} bps=${b}`, sdk: computeTradingFee(n, b), program: engineFee(n, b) });
  }
}

// ---- tier grid: zero tier2/tier3 bps with live thresholds ----
const tierCfgs: FeeTierConfig[] = [
  { baseBps: 10n, tier2Bps: 0n, tier3Bps: 0n, tier2Threshold: 1_000_000n, tier3Threshold: 10_000_000n },
  { baseBps: 10n, tier2Bps: 6n, tier3Bps: 0n, tier2Threshold: 1_000_000n, tier3Threshold: 10_000_000n },
  { baseBps: 10n, tier2Bps: 0n, tier3Bps: 4n, tier2Threshold: 1_000_000n, tier3Threshold: 10_000_000n },
  { baseBps: 10n, tier2Bps: 6n, tier3Bps: 4n, tier2Threshold: 1_000_000n, tier3Threshold: 10_000_000n },
  { baseBps: 10n, tier2Bps: 6n, tier3Bps: 0n, tier2Threshold: 1_000_000n, tier3Threshold: 0n },
  { baseBps: 10n, tier2Bps: 0n, tier3Bps: 0n, tier2Threshold: 0n, tier3Threshold: 0n },
];
/** Expected rate: a tier with 0 bps is disabled and inherits the tier below. */
function expectedBps(n: bigint, c: FeeTierConfig): bigint {
  if (c.tier2Threshold === 0n) return c.baseBps;
  const t2 = c.tier2Bps === 0n ? c.baseBps : c.tier2Bps;
  const t3 = c.tier3Bps === 0n ? t2 : c.tier3Bps;
  if (c.tier3Threshold > 0n && n >= c.tier3Threshold) return t3;
  if (n >= c.tier2Threshold) return t2;
  return c.baseBps;
}
tierCfgs.forEach((c, i) => {
  for (const n of [500_000n, 1_000_000n, 5_000_000n, 10_000_000n, 50_000_000n]) {
    rows.push({ kind: "tier-bps", input: `cfg#${i} n=${n}`, sdk: computeDynamicFeeBps(n, c), program: expectedBps(n, c) });
    rows.push({
      kind: "tier-fee",
      input: `cfg#${i} n=${n}`,
      sdk: computeDynamicTradingFee(n, c),
      program: engineFee(n, expectedBps(n, c)),
    });
  }
});

// ---- liquidation grid: leverage x mm x side x entry ----
const qty = 1_000_000_000n; // 1000 units at POS_SCALE
for (const entry of [50_000_000n, 150_000_000n, 60_000_000_000n]) {
  for (const lev of [1n, 2n, 5n, 10n, 20n]) {
    for (const mm of [100n, 250n, 500n, 1000n]) {
      for (const side of ["long", "short"] as const) {
        const q = side === "long" ? qty : -qty;
        const notional = (qty * entry) / POS_SCALE;
        const capital = notional / lev;
        const prog = engineLiqPrice(capital, q, entry, mm);
        const sdk = computeLiqPrice(entry, capital, q, mm);
        rows.push({ kind: "liq", input: `${side} entry=${entry} lev=${lev}x mm=${mm}`, sdk, program: prog });
        // pre-trade: fee comes out of capital
        for (const fee of [0n, 10n]) {
          const progPre = engineLiqPrice(capital - engineFee(notional, fee), q, entry, mm);
          const sdkPre = computePreTradeLiqPrice(entry, capital, qty, mm, fee, side);
          rows.push({ kind: "pretrade-liq", input: `${side} entry=${entry} lev=${lev}x mm=${mm} fee=${fee}`, sdk: sdkPre, program: progPre });
        }
      }
    }
  }
}

const isMismatch = (r: Row) => (r.kind === "liq" || r.kind === "pretrade-liq" ? abs(r.sdk - r.program) > TOL : r.sdk !== r.program);

describe("trading.ts parity with v22 program/engine", () => {
  it("grid has no mismatches", () => {
    const bad = rows.filter(isMismatch);
    const byKind: Record<string, number> = {};
    for (const r of bad) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    console.log(`PARITY cases=${rows.length} mismatches=${bad.length} ${JSON.stringify(byKind)}`);
    for (const r of bad.slice(0, 8)) console.log(`  ${r.kind} ${r.input} sdk=${r.sdk} program=${r.program}`);
    expect(bad.length).toBe(0);
  });
});
