/**
 * growthCeilingView / quoteMaxLeverage perf regression (src/abi/growth-v19.ts). The trade page runs the view on every quote, and
 * its continuous-leverage curve took up to six `log2Q16` calls per view, each 16 bigint squarings. Now:
 *   - `log2Q16` runs the same integer algorithm on Numbers (an exact 16-bit split of each `(m * m) >> 31`);
 *   - the anchors' log2 (T1/4, T1, T2, T3, 4*T3: per-market constants) is memoised in a bounded map;
 *   - `wholeTokenAtoms` reads a 0..12 `10n ** d` table.
 *
 * Equality: every changed function is checked against a copy of the old code (`old*` below) on the same inputs.
 * Speed: each ratio times the SDK against that copy on the same input, in the same process, interleaved, best of 7,
 * so machine speed and load cancel out. On the old src both sides are the same code: measured 0.97-0.99 for both, so both
 * checks fail there. With the change `curvePos` on a graduated depth measured 0.22-0.23 (bound 0.6) and `wholeTokenAtoms`
 * 0.13-0.14 (bound 0.4), at machine load ~20. Both bounds clear the old code by 1.6x+ and the new code by 2.6x+.
 */
import { describe, it, expect } from "vitest";
import { log2Q16, curvePos, wholeTokenAtoms, GROWTH_MAX_COLLATERAL_DECIMALS } from "../src/abi/growth-v19.js";
import type { CurvePos } from "../src/abi/growth-v19.js";

const U64 = (1n << 64n) - 1n;
type Th = readonly [bigint, bigint, bigint];

/** The pre-change `log2Q16`, unchanged. */
function oldLog2Q16(x: bigint): number | null {
  if (x <= 0n || x > U64) return null;
  const k = x.toString(2).length - 1;
  let m = k >= 31 ? x >> BigInt(k - 31) : x << BigInt(31 - k);
  let frac = 0;
  for (let i = 0; i < 16; i++) {
    m = (m * m) >> 31n;
    frac <<= 1;
    if (m >= 1n << 32n) {
      frac |= 1;
      m >>= 1n;
    }
  }
  return k * 65_536 + frac;
}

/** The pre-change `curvePos` (every log2 through the old bigint loop, no memo), unchanged. */
function oldCurvePos(d: bigint, th: Th): CurvePos {
  const FAIL = { seg: 0xff, num: 0, den: 0 };
  if (d < 0n || d > U64) return { ...FAIL };
  if (d === 0n) return { seg: 0, num: 0, den: 0 };
  const a = [th[0] / 4n, th[0], th[1], th[2]] as const;
  const met = (x: bigint): boolean => x !== U64 && x !== 0n && d >= x;
  const seg = met(a[3]) ? 4 : met(a[2]) ? 3 : met(a[1]) ? 2 : met(a[0]) ? 1 : 0;
  if (seg === 0 || seg === 4) return { seg, num: 0, den: 0 };
  const lo = a[seg - 1] as bigint;
  const hi = a[seg] as bigint;
  if (hi === U64 || hi <= lo) return { seg, num: 0, den: 0 };
  const ld = oldLog2Q16(d);
  const llo = oldLog2Q16(lo);
  const lhi = oldLog2Q16(hi);
  if (ld === null || llo === null || lhi === null) return { ...FAIL };
  const num = ld - llo;
  const den = lhi - llo;
  if (num < 0 || den < 0) return { ...FAIL };
  return { seg, num: num < den ? num : den, den };
}

/** The pre-change `wholeTokenAtoms`, unchanged. */
function oldWholeTokenAtoms(decimals: number): bigint {
  return 10n ** BigInt(Math.min(Math.max(decimals, 0), GROWTH_MAX_COLLATERAL_DECIMALS));
}

/** Seeded 64-bit LCG. */
function rng(seed: bigint) {
  let s = seed;
  return (): bigint => (s = (s * 6364136223846793005n + 1442695040888963407n) & U64);
}

const thrown = (f: () => unknown): string => {
  try {
    return `ok:${String(f())}`;
  } catch (e) {
    return `throw:${(e as Error).name}`;
  }
};

describe("growth-v19 perf change: outputs identical to the old code", () => {
  it("log2Q16: every power of two and its neighbours, the u64 edges, 200k seeded values of every bit length", () => {
    const xs: bigint[] = [-1n, 0n, 1n, 2n, 3n, U64 - 1n, U64, U64 + 1n, 1n << 70n];
    for (let k = 0n; k < 64n; k++) xs.push((1n << k) - 1n, 1n << k, (1n << k) + 1n);
    const r = rng(0x9e3779b97f4a7c15n);
    for (let i = 0; i < 200_000; i++) xs.push(r() >> BigInt(i % 64));
    let bad = 0;
    for (const x of xs) if (log2Q16(x) !== oldLog2Q16(x)) bad++;
    expect(bad).toBe(0);
  });

  it("curvePos: 40k seeded depths over 600 threshold sets (more anchors than the 256-entry memo, so it clears and refills)", () => {
    const r = rng(0x5eedn);
    const sets: Th[] = [[25_000_000_000n, 100_000_000_000n, 500_000_000_000n], [0n, 0n, 0n], [1n, 2n, 3n], [5n, 5n, 5n], [U64, U64, U64], [U64 - 1n, U64, U64]];
    while (sets.length < 600) {
      const t1 = (r() >> BigInt(Number(r() % 40n) + 1)) + 1n;
      const t2 = t1 + (r() >> 40n);
      const t3 = r() % 7n === 0n ? t2 : t2 * (1n + (r() % 9n));
      sets.push([t1, t2, t3 > U64 ? U64 : t3]);
    }
    let bad = 0;
    for (let i = 0; i < 40_000; i++) {
      const th = sets[i % sets.length]!;
      const pick = Number(r() % 4n);
      const d = pick === 0 ? (th[2] * (r() % 8n)) / 3n : pick === 1 ? r() : pick === 2 ? th[Number(r() % 3n)]! + (r() % 3n) - 1n : r() >> BigInt(Number(r() % 64n));
      const want = JSON.stringify(oldCurvePos(d < 0n ? 0n : d > U64 ? U64 : d, th));
      if (JSON.stringify(curvePos(d < 0n ? 0n : d > U64 ? U64 : d, th)) !== want) bad++;
    }
    expect(bad).toBe(0);
  });

  it("wholeTokenAtoms: every decimals value -3..20, +-Infinity, and the same throws for NaN and non-integers", () => {
    const ds = [-Infinity, Infinity, NaN, 6.5, -0.5, 12.0001, -0];
    for (let d = -3; d <= 20; d++) ds.push(d);
    for (const d of ds) expect(thrown(() => wholeTokenAtoms(d))).toBe(thrown(() => oldWholeTokenAtoms(d)));
  });
});

/** Best-of-7 ms of the new and the old function on the same work, interleaved. */
function bestOf7(work: (useNew: boolean) => number): { newMs: number; oldMs: number; ratio: number } {
  expect(work(true)).toBe(work(false)); // same answer, and a warm-up for both
  let newMs = Infinity;
  let oldMs = Infinity;
  for (let r = 0; r < 7; r++) {
    let t = performance.now();
    work(true);
    newMs = Math.min(newMs, performance.now() - t);
    t = performance.now();
    work(false);
    oldMs = Math.min(oldMs, performance.now() - t);
  }
  return { newMs, oldMs, ratio: newMs / oldMs };
}

describe("growth-v19 perf change: faster than the old code (ratio, same process)", () => {
  it("curvePos on a graduated market (default $25k / $100k / $500k thresholds) costs at most 0.6x the old code", () => {
    const th: Th = [25_000_000_000n, 100_000_000_000n, 500_000_000_000n];
    const depths = Array.from({ length: 4_000 }, (_, i) => 7_000_000_000n + BigInt(i) * 123_456_789n); // $7k .. $500k: segments 1-3
    const { ratio } = bestOf7((useNew) => {
      let k = 0;
      for (const d of depths) k += (useNew ? curvePos(d, th) : oldCurvePos(d, th)).num;
      return k;
    });
    console.info(`curvePos new/old ratio ${ratio.toFixed(3)}`);
    expect(ratio).toBeLessThan(0.6);
  });

  it("wholeTokenAtoms costs at most 0.4x the old code", () => {
    const { ratio } = bestOf7((useNew) => {
      let k = 0n;
      for (let i = 0; i < 40_000; i++) k += useNew ? wholeTokenAtoms(i % 13) : oldWholeTokenAtoms(i % 13);
      return Number(k & 0xffffn);
    });
    console.info(`wholeTokenAtoms new/old ratio ${ratio.toFixed(3)}`);
    expect(ratio).toBeLessThan(0.4);
  });
});
