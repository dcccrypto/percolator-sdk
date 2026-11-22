/**
 * Differential test: SDK depth maths vs percolator-prog `src/depth_src_v22.rs` at
 * feat/v22-rc23-2026-10-22 d27f3d73 (isqrt_u128, plus2pct_depth_e6, reserve_value_e6; LOT_EXP_MAX = 15).
 * Vectors in fixtures/depth-math-vectors-d27f3d73.json: the verbatim Rust functions (fixtures/depth-math-prog-d27f3d73.rs) are
 * run by fixtures/depth-math-gen.rs (`rustc -O`, prints the full 1.4M-row set to stdout -> /tmp/dm/vec.json), then
 * fixtures/depth-math-mkfixture.mjs subsamples it into the committed JSON (u64s as strings).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { plus2PctDepthE6, reserveValueE6 } from "../src/abi/v22-depth-source.js";

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
  // R in 0..1e6 against the exact definition m(R) = min{m : 51 m^2 >= 50 R^2}, answer R - m.
  // Why not all 1,000,001 values: each plus2PctDepthE6 call is several BigInt ops (~7 s for the full range under CI load), so the
  // exhaustive loop was a load-sensitive case. The checked set is instead:
  //   (a) every R in 0..4096 (all small/degenerate cases),
  //   (b) every R within 2 of a power of two up to 2^19 (bit-width transitions of isqrt),
  //   (c) EVERY R whose position on the boundary is tight: m(R) = ceil(R*sqrt(50/51)), and the SUT can only disagree with the
  //       definition where x = R*sqrt(50/51) is within rounding reach of an integer (where ceil flips, i.e. where 51 m^2 - 50 R^2
  //       or 50 R^2 - 51 (m-1)^2 is small). We scan all 1e6 R with a cheap float (stepping 1 at a time near a boundary, skipping ahead provably-safely elsewhere) and take every R with frac(x) < 1e-3 or > 1-1e-3
  //       (float error ~1e-9 so no true boundary is missed),
  //   (d) a seeded (mulberry32, seed 0x51a50) sample of 5,000 further R.
  // Reference is plain Number arithmetic: 51 m^2 <= 5.1e13 < 2^53, so every product/compare is exact, and it shares no code with the SUT.
  // Mismatches are collected in the loop and asserted once.
  it("R in 0..1e6 (boundary-exhaustive + seeded sample) equals the exact definition r - (smallest m with 51 m^2 >= 50 r^2)", () => {
    const MAXR = 1_000_000;
    const c = Math.sqrt(50 / 51);
    const set = new Set<number>();
    for (let r = 0; r <= 4096; r++) set.add(r);
    for (let k = 0; k <= 19; k++) for (let d = -2; d <= 2; d++) { const r = 2 ** k + d; if (r >= 0 && r <= MAXR) set.add(r); }
    // u(R) = frac(R*c) falls by D = 1 - c ~ 0.01005 per step (mod 1). A boundary R has u < 1e-3 or u > 1 - 1e-3, and u > 1 - 1e-3 is only
    // reachable from u in (0.009, 0.011). So while u > 0.03 we can jump floor((u - 0.02) / 0.0101) steps without skipping any hit
    // (u falls by at most 0.01006 per step, so it stays > 0.02), and step singly inside u <= 0.03. u is recomputed from R each time.
    let boundary = 0;
    for (let r = 0; r <= MAXR; ) {
      const x = r * c;
      const u = x - Math.floor(x);
      if (u < 1e-3 || u > 1 - 1e-3) { if (!set.has(r)) boundary++; set.add(r); }
      r += u > 0.03 && u < 1 - 1e-3 ? Math.max(1, Math.floor((u - 0.02) / 0.0101)) : 1;
    }
    let seed = 0x51a50;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 5_000; i++) set.add(Math.floor(rnd() * (MAXR + 1)));
    const mismatches: string[] = [];
    for (const r of set) {
      const q = 50 * r * r;
      let m = Math.ceil(Math.sqrt(q / 51));
      while (51 * m * m < q) m++;
      while (m > 0 && 51 * (m - 1) * (m - 1) >= q) m--;
      const got = plus2PctDepthE6(BigInt(r));
      if (got !== BigInt(r - m)) mismatches.push(`R=${r}: got ${got}, want ${r - m}`);
    }
    expect(boundary).toBeGreaterThan(500); // the boundary scan really contributed
    expect(set.size).toBeGreaterThan(5_000);
    expect(mismatches).toEqual([]);
  });
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
