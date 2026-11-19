/**
 * Differential test: SDK depth maths vs percolator-prog `src/depth_src_v22.rs` at
 * feat/v22-rc23-2026-10-22 d27f3d73 (isqrt_u128, plus2pct_depth_e6, reserve_value_e6; LOT_EXP_MAX = 15).
 * Vectors in fixtures/depth-math-vectors-d27f3d73.json: the verbatim Rust functions (fixtures/depth-math-prog-d27f3d73.rs) are
 * run by fixtures/depth-math-gen.rs (`rustc -O`, prints the full 1.4M-row set to stdout -> /tmp/dm/vec.json), then
 * fixtures/depth-math-mkfixture.mjs subsamples it into the committed JSON (u64s as strings).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { plus2PctDepthE6, reserveValueE6, isqrtU128 } from "../src/abi/v22-depth-source.js";

const fx = JSON.parse(readFileSync(new URL("../fixtures/depth-math-vectors-d27f3d73.json", import.meta.url), "utf8")) as {
  plus2: [string, string][];
  reserve: [string, string, number, number, string | null][];
};
const U64_MAX = (1n << 64n) - 1n;

describe("plus2PctDepthE6 vs prog", () => {
  it("matches every Rust vector (edges, powers of two, random u64)", () => {
    let bad = 0;
    for (const [r, d] of fx.plus2) if (plus2PctDepthE6(BigInt(r)) !== BigInt(d)) bad++;
    expect(fx.plus2.length).toBeGreaterThan(5000);
    expect(bad).toBe(0);
  });
  it("edges 0,1,2,2^32,2^52,2^63,u64::MAX are all in the fixture", () => {
    const set = new Set(fx.plus2.map((x) => x[0]));
    for (const e of [0n, 1n, 2n, 1n << 32n, 1n << 52n, 1n << 63n, U64_MAX]) expect(set.has(e.toString())).toBe(true);
  });
  it("every R in 0..1e6 equals the exact definition r - (smallest m with 51 m^2 >= 50 r^2)", () => {
    // Reference side: monotone two-pointer, independent of the SDK's isqrt. m(r) = smallest m with 51 m^2 >= 50 r^2 is
    // non-decreasing in r, so m only ever advances. Exactness in plain Number: r <= 1e6 so 50 r^2 <= 5e13, and m never
    // exceeds the value that first reaches 50 r^2 / 51 (<= 1e6), so 51 m^2 <= 51 * 1e12 = 5.1e13 < 2^53 ~ 9.007e15;
    // every product and comparison is an exact integer, no BigInt needed.
    const RMAX = 1_000_000;
    expect(51 * RMAX * RMAX).toBeLessThan(Number.MAX_SAFE_INTEGER);
    let m = 0;
    let checked = 0;
    for (let r = 0; r <= RMAX; r++) {
      const t = 50 * r * r;
      while (51 * m * m < t) m++;
      if (plus2PctDepthE6(BigInt(r)) !== BigInt(r - m)) throw new Error(`mismatch at R=${r}`);
      checked++;
    }
    console.log(`checked ${checked} values of R`);
    expect(checked).toBe(1_000_001);
  }, 180_000);
  it("rejects out-of-range input", () => {
    expect(() => plus2PctDepthE6(-1n)).toThrow();
    expect(() => plus2PctDepthE6(U64_MAX + 1n)).toThrow();
  });
});

describe("reserveValueE6 vs prog", () => {
  it("matches every Rust vector incl. refused decimals>18 / lotExp>15 / mark 0", () => {
    let bad = 0;
    let nulls = 0;
    for (const [a, m, bd, le, exp] of fx.reserve) {
      const got = reserveValueE6("base-at-mark", BigInt(a), 777n, BigInt(m), bd, le);
      const want = exp === null ? null : BigInt(exp);
      if (want === null) nulls++;
      if (got !== want) bad++;
    }
    expect(fx.reserve.length).toBeGreaterThan(7000);
    expect(nulls).toBeGreaterThan(1000);
    expect(bad).toBe(0);
  });
  it("quote-is-collateral returns the quote reserve", () => {
    expect(reserveValueE6("quote-is-collateral", 1n, 777n, 0n, 99, 99)).toBe(777n);
  });
  it("returns null (never throws, never a value) for inputs a u8 cannot hold", () => {
    const bad: [number, number][] = [
      [-1, 4], [6, -1], [-1, 0], [0, -1], [1.5, 4], [6, 1.5], [NaN, 4], [6, NaN], [Infinity, 4], [6, Infinity], [256, 0], [6, 256], [-5, 20],
    ];
    for (const [bd, le] of bad) {
      expect(() => reserveValueE6("base-at-mark", 10n ** 12n, 0n, 1_000_000n, bd, le)).not.toThrow();
      expect(reserveValueE6("base-at-mark", 10n ** 12n, 0n, 1_000_000n, bd, le)).toBeNull();
    }
    expect(reserveValueE6("base-at-mark", 10n ** 12n, 0n, 1_000_000n, 6, 16)).toBeNull();
    expect(reserveValueE6("base-at-mark", 10n ** 12n, 0n, 1_000_000n, 19, 0)).toBeNull();
  });
});
