/**
 * Differential: growth tiers (the tier picks the leverage table) — SDK src/abi/growth-v19.ts vs a line-cited BigInt port of
 * percolator-prog feat/v22-rc23-2026-10-22 @ bc657392 src/growth_v19.rs (read with `git show`, no cargo).
 *
 * A HIGHER TS tier than the Rust tier means the SDK quotes more leverage than the program allows; every mismatch is counted per
 * function and the test asserts 0. Inputs stay inside the Rust types' domain (u8 / u32 / u64 / u128).
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  attestedMaxTierEff,
  bookCapacityE6,
  bookDepthE6,
  bookDepthFromPins,
  bookTier,
  combinedTier,
  depthTierFor,
  tierThresholdsE6,
  venueTier,
} from "../src/abi/growth-v19.js";
import type { Triple } from "../src/abi/growth-v19.js";

// ── Rust port (bc657392) ─────────────────────────────────────────────────────────────────────────────────────────────────────
const U8_MAX = 255n;
const U32_MAX = 0xffff_ffffn;
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const inRange = (v: bigint, max: bigint, what: string): bigint => {
  if (v < 0n || v > max) throw new Error(`port domain: ${what}=${v}`);
  return v;
};
const satMul = (a: bigint, b: bigint, max: bigint): bigint => (a * b > max ? max : a * b); // u*::saturating_mul
const checkedMul = (a: bigint, b: bigint, max: bigint): bigint | null => (a * b > max ? null : a * b);

const R = {
  BPS: 10_000n, //                                growth_v19.rs:33
  DEFAULT_LAMBDA_BPS: 10_000n, //                 growth_v19.rs:40
  DEPTH_MULT: 4n, //                              growth_v19.rs:268
  TIER_THRESHOLD_DEFAULT_USD: [25_000n, 100_000n, 500_000n] as const, // growth_v19.rs:1137
  ATTESTED_MAX_TIER_DEFAULT: 1, //                growth_v19.rs:1142
  MAX_TIER: 3, //                                 growth_v19.rs:1144
  DEPTH_SOURCE_MASK: 0x03, //                     growth_v19.rs:1093; depth_source_of :1168-1170; ATTESTED :1088, DEX :1091
  DEPTH_SOURCE_ATTESTED: 1,
  DEPTH_SOURCE_DEX: 2,
  MAX_COLLATERAL_DECIMALS: 12n, //                growth_v19.rs:1594
  BOOK_DEPTH_BAND_BPS: 200n, //                   growth_v19.rs:1679
  // vault_lp_v18.rs:637-640
  PIN_TRADING_FEE_BPS: 10n,
  PIN_BASE_SPREAD_BPS: 10n,
  PIN_MAX_TOTAL_BPS: 100n,
  PIN_IMPACT_K_BPS: 50n,
};

/** vault_lp_v18.rs:20-25 mul_div_floor: None on d == 0 or a*b overflowing u128. */
function rMulDivFloor(a: bigint, b: bigint, d: bigint): bigint | null {
  if (d === 0n) return null;
  const p = checkedMul(a, b, U128_MAX);
  return p === null ? null : p / d;
}
/** growth_v19.rs:1600-1602 whole_token_atoms: 10u64.saturating_pow(min(decimals, 12)). */
function rWholeTokenAtoms(decimals: bigint): bigint {
  inRange(decimals, U8_MAX, "decimals");
  const e = decimals < R.MAX_COLLATERAL_DECIMALS ? decimals : R.MAX_COLLATERAL_DECIMALS;
  const v = 10n ** e;
  return v > U64_MAX ? U64_MAX : v;
}
/** growth_v19.rs:1608-1622 tier_thresholds. */
function rTierThresholds(stored: readonly bigint[], decimals: bigint): Triple<bigint> {
  const unit = rWholeTokenAtoms(decimals);
  const t: bigint[] = [0n, 0n, 0n];
  for (let i = 0; i < 3; i++) {
    const s = inRange(stored[i]!, U32_MAX, "stored_tokens");
    const v = s === 0n ? R.TIER_THRESHOLD_DEFAULT_USD[i]! : s;
    t[i] = satMul(v, unit, U64_MAX);
  }
  return t as unknown as Triple<bigint>;
}
/** growth_v19.rs:1628-1641 depth_tier_for. */
function rDepthTierFor(depth: bigint, th: Triple<bigint>): number {
  inRange(depth, U64_MAX, "depth_e6");
  th.forEach((t) => inRange(t, U64_MAX, "threshold"));
  const met = (t: bigint) => t !== U64_MAX && depth >= t;
  if (depth === 0n) return 0;
  else if (met(th[2])) return 3;
  else if (met(th[1])) return 2;
  else if (met(th[0])) return 1;
  else return 0;
}
/** growth_v19.rs:1644-1652 attested_max_tier_eff. */
function rAttestedMaxTierEff(stored: number): number {
  inRange(BigInt(stored), U8_MAX, "attested_max_tier");
  if (stored === 0) return R.ATTESTED_MAX_TIER_DEFAULT;
  else if (stored > R.MAX_TIER) return R.MAX_TIER;
  else return stored;
}
/** growth_v19.rs:1657-1675 venue_tier. */
function rVenueTier(depth: bigint, srcByte: number, th: Triple<bigint>, amtStored: number): number {
  inRange(BigInt(srcByte), U8_MAX, "depth_source_byte");
  const raw = rDepthTierFor(depth, th);
  switch (srcByte & R.DEPTH_SOURCE_MASK) {
    case R.DEPTH_SOURCE_DEX: return raw;
    case R.DEPTH_SOURCE_ATTESTED: { const m = rAttestedMaxTierEff(amtStored); return raw > m ? m : raw; }
    default: return 0;
  }
}
/** growth_v19.rs:1691-1706 book_depth_from_pins. */
function rBookDepthFromPins(cap: bigint, fixed: bigint, k: bigint, maxTotal: bigint): bigint {
  inRange(cap, U128_MAX, "cap_e6"); inRange(fixed, U32_MAX, "fixed"); inRange(k, U32_MAX, "k"); inRange(maxTotal, U32_MAX, "max_total");
  if (maxTotal < R.BOOK_DEPTH_BAND_BPS) return cap;
  if (fixed >= R.BOOK_DEPTH_BAND_BPS) return 0n;
  const room = R.BOOK_DEPTH_BAND_BPS - fixed;
  const d = satMul(cap, R.DEPTH_MULT, U128_MAX);
  const n = rMulDivFloor(d, room, k + room) ?? 0n; // (impact_k as u128) + room: no u128 overflow
  return n < cap ? n : cap;
}
/** growth_v19.rs:1713-1720 book_capacity_e6. */
function rBookCapacityE6(cM: bigint, lambda: bigint): bigint {
  inRange(cM, U128_MAX, "c_m"); inRange(lambda, U32_MAX, "lambda");
  const lam = lambda < R.DEFAULT_LAMBDA_BPS ? lambda : R.DEFAULT_LAMBDA_BPS;
  return (cM / R.BPS) * lam + ((cM % R.BPS) * lam) / R.BPS;
}
/** growth_v19.rs:1726-1734 book_depth_e6 (u64::try_from(b).unwrap_or(u64::MAX)). */
function rBookDepthE6(cM: bigint, lambda: bigint): bigint {
  const b = rBookDepthFromPins(rBookCapacityE6(cM, lambda), R.PIN_BASE_SPREAD_BPS + R.PIN_TRADING_FEE_BPS, R.PIN_IMPACT_K_BPS, R.PIN_MAX_TOTAL_BPS);
  return b > U64_MAX ? U64_MAX : b;
}
/** growth_v19.rs:1741-1743 book_tier. */
const rBookTier = (cM: bigint, lambda: bigint, th: Triple<bigint>) => rDepthTierFor(rBookDepthE6(cM, lambda), th);
/** growth_v19.rs:1746-1752 combined_tier. */
const rCombinedTier = (v: number, b: number) => (v < b ? v : b);

// ── Harness ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Fn = "tierThresholdsE6" | "depthTierFor" | "attestedMaxTierEff" | "venueTier" | "bookDepthFromPins" | "bookCapacityE6" | "bookDepthE6" | "bookTier" | "combinedTier";
const FNS: Fn[] = ["tierThresholdsE6", "depthTierFor", "attestedMaxTierEff", "venueTier", "bookDepthFromPins", "bookCapacityE6", "bookDepthE6", "bookTier", "combinedTier"];
const newTally = () => Object.fromEntries(FNS.map((f) => [f, { cases: 0, mismatches: 0, tsHigher: 0, samples: [] as string[] }])) as Record<Fn, { cases: number; mismatches: number; tsHigher: number; samples: string[] }>;

function cmp<T>(tally: ReturnType<typeof newTally>, fn: Fn, ts: () => T, rs: () => T, input: unknown): void {
  const e = tally[fn];
  e.cases++;
  let a: string, b: string, higher = false;
  try { const v = ts(); a = typeof v !== "object" ? String(v) : typeof v === "object" ? JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) : String(v); } catch (err) { a = `throw:${(err as Error).message}`; }
  try { const v = rs(); b = typeof v === "object" ? JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) : String(v); } catch (err) { b = `throw:${(err as Error).message}`; }
  if (a !== b) {
    e.mismatches++;
    if (/^\d+$/.test(a) && /^\d+$/.test(b) && BigInt(a) > BigInt(b)) { higher = true; e.tsHigher++; }
    if (e.samples.length < 5) e.samples.push(`${JSON.stringify(input, (_k, x) => (typeof x === "bigint" ? x.toString() : x))} ts=${a} rs=${b}${higher ? " (TS HIGHER)" : ""}`);
  }
}

/** Runs every function on one input bundle. */
function runAll(t: ReturnType<typeof newTally>, x: { stored: bigint[]; dec: bigint; depth: bigint; src: number; amt: number; cap: bigint; fixed: bigint; k: bigint; maxTotal: bigint; cM: bigint; lambda: bigint; v: number; b: number }) {
  const storedTs = x.stored as unknown as Triple<bigint>;
  cmp(t, "tierThresholdsE6", () => tierThresholdsE6(storedTs, Number(x.dec)), () => rTierThresholds(x.stored, x.dec), { stored: x.stored, dec: x.dec });
  const th = rTierThresholds(x.stored, x.dec);
  cmp(t, "depthTierFor", () => depthTierFor(x.depth, th), () => rDepthTierFor(x.depth, th), { depth: x.depth, th });
  cmp(t, "attestedMaxTierEff", () => attestedMaxTierEff(x.amt), () => rAttestedMaxTierEff(x.amt), { amt: x.amt });
  cmp(t, "venueTier", () => venueTier(x.depth, x.src, th, x.amt), () => rVenueTier(x.depth, x.src, th, x.amt), { depth: x.depth, src: x.src, th, amt: x.amt });
  cmp(t, "bookDepthFromPins", () => bookDepthFromPins(x.cap, Number(x.fixed), Number(x.k), Number(x.maxTotal)), () => rBookDepthFromPins(x.cap, x.fixed, x.k, x.maxTotal), { cap: x.cap, fixed: x.fixed, k: x.k, maxTotal: x.maxTotal });
  cmp(t, "bookCapacityE6", () => bookCapacityE6(x.cM, Number(x.lambda)), () => rBookCapacityE6(x.cM, x.lambda), { cM: x.cM, lambda: x.lambda });
  cmp(t, "bookDepthE6", () => bookDepthE6(x.cM, Number(x.lambda)), () => rBookDepthE6(x.cM, x.lambda), { cM: x.cM, lambda: x.lambda });
  cmp(t, "bookTier", () => bookTier(x.cM, Number(x.lambda), th), () => rBookTier(x.cM, x.lambda, th), { cM: x.cM, lambda: x.lambda, th });
  cmp(t, "combinedTier", () => combinedTier(x.v, x.b), () => rCombinedTier(x.v, x.b), { v: x.v, b: x.b });
}

function report(name: string, t: ReturnType<typeof newTally>) {
  const rows = FNS.map((f) => `${f.padEnd(20)} cases=${String(t[f].cases).padStart(7)} mismatches=${t[f].mismatches} tsHigher=${t[f].tsHigher}${t[f].samples.length ? "\n    " + t[f].samples.join("\n    ") : ""}`);
  const out = `[growth-tier-diff] ${name}\n  ${rows.join("\n  ")}\n`;
  console.log(out);
  if (process.env.GROWTH_TIER_DIFF_OUT) appendFileSync(process.env.GROWTH_TIER_DIFF_OUT, out); // optional tally file for the report
  for (const f of FNS) expect({ f, mismatches: t[f].mismatches, samples: t[f].samples }).toEqual({ f, mismatches: 0, samples: [] });
}

// Seeded PRNG (splitmix64 over BigInt) so every run is the same 50k inputs.
function rng(seed: bigint) {
  let s = seed & U64_MAX;
  const next = (): bigint => {
    s = (s + 0x9e3779b97f4a7c15n) & U64_MAX;
    let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MAX;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MAX;
    return z ^ (z >> 31n);
  };
  const below = (n: bigint): bigint => (n <= 0n ? 0n : (((next() << 64n) | next()) % n));
  const bits = (maxBits: number): bigint => { const b = Number(below(BigInt(maxBits) + 1n)); return b === 0 ? 0n : ((((next() << 64n) | next()) & ((1n << BigInt(b)) - 1n))); };
  const pick = <T,>(xs: readonly T[]): T => xs[Number(below(BigInt(xs.length)))]!;
  return { next, below, bits, pick };
}

const DECS = [0n, 6n, 9n, 18n];
const STORED_EDGES: bigint[][] = [
  [0n, 0n, 0n], // all default
  [1n, 1n, 1n], // equal
  [100_000n, 100_000n, 100_000n], // equal
  [500_000n, 100_000n, 25_000n], // descending
  [3n, 2n, 1n], // descending
  [U32_MAX, U32_MAX, U32_MAX], // u32::MAX
  [0n, U32_MAX, 0n],
  [5_000n, 20_000n, 100_000n], // validator minimums
  [U32_MAX, 0n, 1n],
];

describe("growth tier diff vs prog bc657392 (no cargo)", () => {
  it("grid: thresholds 0/equal/descending/u32::MAX x decimals 0,6,9,18; depth at each threshold and one below; attested max 0..255; source 0..3 (+high bits)", () => {
    const t = newTally();
    for (const stored of STORED_EDGES) for (const dec of DECS) {
      const th = rTierThresholds(stored, dec);
      const depths = new Set<bigint>([0n, 1n, U64_MAX, U64_MAX - 1n]);
      for (const x of th) { depths.add(x); if (x > 0n) depths.add(x - 1n); if (x < U64_MAX) depths.add(x + 1n); }
      cmp(t, "tierThresholdsE6", () => tierThresholdsE6(stored as unknown as Triple<bigint>, Number(dec)), () => th, { stored, dec });
      for (let amt = 0; amt <= 255; amt++) cmp(t, "attestedMaxTierEff", () => attestedMaxTierEff(amt), () => rAttestedMaxTierEff(amt), { amt });
      for (const depth of depths) {
        cmp(t, "depthTierFor", () => depthTierFor(depth, th), () => rDepthTierFor(depth, th), { depth, th });
        for (let amt = 0; amt <= 255; amt++) for (const src of [0, 1, 2, 3, 0x80 | 1, 0xfe]) {
          cmp(t, "venueTier", () => venueTier(depth, src, th, amt), () => rVenueTier(depth, src, th, amt), { depth, src, th, amt });
        }
      }
    }
    report("grid A (thresholds x depth x attested x source)", t);
  }, 300_000);

  it("grid: pins with fixed+impact above max total, c_m 0 and u128-large, lambda 0 and 10_000, combined 0..3", () => {
    const t = newTally();
    const caps = [0n, 1n, 2n, 1_000_000n, 100_000_000_000n, U64_MAX, U64_MAX + 1n, U128_MAX / 4n, U128_MAX / 4n + 1n, U128_MAX / 800n, U128_MAX / 800n + 1n, U128_MAX - 1n, U128_MAX];
    const fixeds = [0n, 1n, 20n, 100n, 199n, 200n, 201n, 1000n, U32_MAX];
    const ks = [0n, 1n, 50n, 150n, 181n, 1000n, U32_MAX - 200n, U32_MAX];
    const mts = [0n, 99n, 100n, 199n, 200n, 201n, 250n, U32_MAX];
    const cMs = [0n, 1n, 9_999n, 10_000n, 10_001n, 25_000_000_000n, 25_000_000_000n - 1n, 500_000_000_000n, U64_MAX, U64_MAX + 1n, (U64_MAX + 1n) * 10_000n, U128_MAX - 1n, U128_MAX];
    const lambdas = [0n, 1n, 5_000n, 9_999n, 10_000n, 10_001n, 30_000n, U32_MAX];
    for (const cap of caps) for (const fixed of fixeds) for (const k of ks) for (const maxTotal of mts) {
      cmp(t, "bookDepthFromPins", () => bookDepthFromPins(cap, Number(fixed), Number(k), Number(maxTotal)), () => rBookDepthFromPins(cap, fixed, k, maxTotal), { cap, fixed, k, maxTotal });
    }
    for (const stored of STORED_EDGES) for (const dec of DECS) for (const cM of cMs) for (const lambda of lambdas) {
      runAll(t, { stored, dec, depth: 0n, src: 0, amt: 0, cap: 0n, fixed: 0n, k: 0n, maxTotal: 0n, cM, lambda, v: 0, b: 0 });
    }
    for (let v = 0; v <= 3; v++) for (let b = 0; b <= 3; b++) cmp(t, "combinedTier", () => combinedTier(v, b), () => rCombinedTier(v, b), { v, b });
    report("grid B (pins x c_m x lambda x combined)", t);
  }, 300_000);

  it("50,000 seeded random cases (seed 0x23_bc657392)", () => {
    const t = newTally();
    const r = rng(0x23bc657392n);
    for (let i = 0; i < 50_000; i++) {
      const storedVal = (): bigint => r.pick([0n, r.below(U32_MAX + 1n), r.bits(32), r.pick([1n, 5_000n, 25_000n, 100_000n, 500_000n, U32_MAX])]);
      const stored = [storedVal(), storedVal(), storedVal()];
      const dec = r.pick([r.below(256n), r.below(19n), ...DECS]);
      const th = rTierThresholds(stored, dec);
      const tAt = r.pick(th);
      const depth = r.pick([r.bits(64), tAt, tAt > 0n ? tAt - 1n : 0n, tAt < U64_MAX ? tAt + 1n : tAt, 0n, U64_MAX, r.below(tAt * 2n + 1n > U64_MAX ? U64_MAX : tAt * 2n + 1n)]);
      const cap = r.bits(128);
      const fixed = r.pick([r.below(300n), r.bits(32)]);
      const k = r.pick([r.below(1000n), r.bits(32)]);
      const maxTotal = r.pick([r.below(400n), r.bits(32)]);
      const cM = r.pick([r.bits(128), r.bits(64), r.below(th[2] * 2n + 1n)]);
      const lambda = r.pick([r.below(20_001n), r.bits(32), 0n, 10_000n]);
      const v = Number(r.below(4n)), b = Number(r.below(4n));
      runAll(t, { stored, dec, depth, src: Number(r.below(256n)), amt: Number(r.below(256n)), cap, fixed, k, maxTotal, cM, lambda, v, b });
    }
    report("random 50k", t);
  }, 300_000);
});
