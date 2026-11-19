import { describe, it, expect } from "vitest";
import { computeMarkPnl } from "../src/math/trading.js";

// Transcription of the v2.2 engine price-PnL settlement (fast path: a_basis == ADL_ONE, carry 0):
//   percolator src/v16.rs leg_kf_delta_components_for_settlement_from_targets (:16412)
//   -> scaled_adl_delta_with_carry_fast (:29481): floor((k_now - k_snap)/ADL_ONE * |basis| / POS_SCALE)
//   with k_long = dP*a_long, k_short = -(dP*a_short) (kernel_adl_scaled_accrual_index_deltas :2314).
const ADL_ONE = 1_000_000_000_000_000n;
const POS_SCALE = 1_000_000n;

function engineMarkPnl(side: 1n | -1n, absQ: bigint, entry: bigint, oracle: bigint): bigint {
  if (absQ === 0n) return 0n;
  const delta = side * (oracle - entry) * ADL_ONE; // k_now - k_snap
  const scaled = delta / ADL_ONE; // exact
  const total = scaled * absQ;
  let q = total / POS_SCALE;
  if (total % POS_SCALE < 0n) q -= 1n; // Euclidean floor
  return q;
}

describe("computeMarkPnl matches v2.2 engine K settlement", () => {
  it.each([
    [1_000_000n, 100_000_000n, 110_000_000n, 10_000_000n],
    [1_000_000n, 100_000_000n, 90_000_000n, -10_000_000n],
    [-1_000_000n, 100_000_000n, 110_000_000n, -10_000_000n],
    [-1_000_000n, 100_000_000n, 90_000_000n, 10_000_000n],
    [1n, 10_000_000n, 1_000n, -10n], // floor rounds toward -inf: -9.999 -> -10
    [-1n, 1_000n, 10_000_000n, -10n], // short loss, floor
  ])("size %s entry %s oracle %s -> %s", (q, e, o, want) => {
    expect(computeMarkPnl(q, e, o)).toBe(want);
    expect(computeMarkPnl(q, e, o)).toBe(engineMarkPnl(q > 0n ? 1n : -1n, q < 0n ? -q : q, e, o));
  });

  it("0 mismatches over the full differential grid (22400 rows, 3200 distinct)", () => {
    const pows = (lo: number, hi: number) =>
      Array.from({ length: hi - lo + 1 }, (_, i) => 10n ** BigInt(lo + i));
    const prices = pows(3, 12);
    const qs = pows(0, 15);
    let n = 0;
    const bad: string[] = [];
    for (const side of [1n, -1n] as const)
      for (let lotExp = 0; lotExp <= 6; lotExp++) // lot_exp does not enter PnL
        for (const e of prices)
          for (const o of prices)
            for (const q of qs) {
              n++;
              const sdk = computeMarkPnl(side * q, e, o);
              const eng = engineMarkPnl(side, q, e, o);
              if (sdk !== eng && bad.length < 5) bad.push(`${side} ${q} ${e} ${o}: ${sdk} != ${eng}`);
            }
    expect(n).toBe(22400);
    expect(bad).toEqual([]);
  });
});
