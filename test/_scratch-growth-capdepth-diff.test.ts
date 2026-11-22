/**
 * SCRATCH differential (J-20261122-SDK-DIFF-REPORT-GROWTHCAPDEPTHRC23): the depth the leverage cap is computed from.
 *
 * TS under test: src/abi/growth-v19.ts on feat/v22-sdk-growth 26de9204
 *   effectiveDepthE6 :709, freshDepthE6 :733, stickyDepthE6 :821, capDepthE6 :844, usableDepthE6 :970.
 * Reference: percolator-prog feat/v22-rc23-2026-10-22 bc657392 src/growth_v19.rs (read with `git show`, no cargo):
 *   effective_depth_e6 :1187, fresh_depth_e6 :1211, usable_depth_e6 :1431, sticky_depth_e6 :1540, cap_depth_e6 :1556.
 *   Constants: DEPTH_MAX_AGE_SLOTS = 150 (:1083), DEPTH_SOURCE_MASK = 0x03 (:1093), DEPTH_EVER = 0x80 (:1097),
 *   DEPTH_PREV_REAL = 0x04 (:1124), DEPTH_STICKY_EPOCH_SLOTS = RATCHET_EPOCH_SLOTS = 9_000 (:1146, :55).
 *
 * Shapes: Rust `u64` -> TS `bigint`; Rust `Option<u64>` -> TS `bigint | null` (`None` <-> `null`). The Rust uses `checked_sub` (effective, fresh:
 * an underflow is None -> absent) and `saturating_sub` (sticky: an underflow is age 0); TS spells both with an explicit `>` compare. Rust
 * `tw_min_e6.unwrap_or(u64::MAX)` (usable, cap) <-> TS `twMinE6 !== null && twMinE6 < m ? twMinE6 : m`. The port below keeps the Rust shape
 * (Option as `{some}` / `null`, u64 range asserted) so both encodings are exercised independently.
 */
import { describe, expect, it } from "vitest";
import {
  capDepthE6,
  effectiveDepthE6,
  freshDepthE6,
  stickyDepthE6,
  usableDepthE6,
  DEPTH_EVER,
  DEPTH_MAX_AGE_SLOTS,
  DEPTH_PREV_REAL,
  DEPTH_SOURCE_MASK,
  DEPTH_STICKY_EPOCH_SLOTS,
} from "../src/abi/growth-v19.js";

const U64_MAX = (1n << 64n) - 1n;
type Opt = bigint | null; // Option<u64>

function u64(x: bigint): bigint {
  if (x < 0n || x > U64_MAX) throw new Error(`u64 overflow in the Rust port: ${x}`);
  return x;
}
/** `u64::checked_sub` */
function checkedSub(a: bigint, b: bigint): Opt {
  return a >= b ? a - b : null;
}
/** `u64::saturating_sub` */
function saturatingSub(a: bigint, b: bigint): bigint {
  return a > b ? a - b : 0n;
}

// ── Rust port (bc657392 src/growth_v19.rs) ─────────────────────────────────────────────────────
const R_DEPTH_MAX_AGE_SLOTS = 150n; // :1083
const R_DEPTH_SOURCE_NONE = 0; // :1085
const R_DEPTH_SOURCE_MASK = 0x03; // :1093
const R_DEPTH_EVER = 0x80; // :1097
const R_DEPTH_PREV_REAL = 0x04; // :1124
const R_DEPTH_STICKY_EPOCH_SLOTS = 9_000n; // :1146 = RATCHET_EPOCH_SLOTS :55

/** :1168 */
const rDepthSourceOf = (b: number): number => b & R_DEPTH_SOURCE_MASK;
/** :1173 */
const rDepthEver = (b: number): boolean => (b & R_DEPTH_EVER) !== 0;

/** :1187-1201 effective_depth_e6 */
function rEffective(depth: bigint, prev: bigint, slot: bigint, now: bigint): bigint {
  if (depth === 0n || prev === 0n) return 0n; // :1188-1190
  const age = checkedSub(now, slot); // :1191
  if (age !== null && age <= R_DEPTH_MAX_AGE_SLOTS) return depth < prev ? depth : prev; // :1192-1198
  return 0n; // :1199
}

/** :1211-1235 fresh_depth_e6 */
function rFresh(depth: bigint, prev: bigint, slot: bigint, src: number, now: bigint): Opt {
  const age = checkedSub(now, slot); // :1218
  if (!(age !== null && age <= R_DEPTH_MAX_AGE_SLOTS)) return null; // :1219-1220
  if (rDepthSourceOf(src) === R_DEPTH_SOURCE_NONE) return null; // :1222-1224
  if (depth === 0n) return 0n; // :1225-1227
  if ((src & R_DEPTH_PREV_REAL) === 0) return null; // :1228-1230
  return depth < prev ? depth : prev; // :1231-1235
}

/** :1431-1441 usable_depth_e6 */
function rUsable(fresh: Opt, lastGood: bigint, twMin: Opt): Opt {
  const tw = twMin ?? U64_MAX; // :1432 unwrap_or(u64::MAX)
  if (fresh === null) return null; // :1433 Option::map
  const m = fresh < lastGood ? fresh : lastGood; // :1434
  return m < tw ? m : tw; // :1435-1439
}

/** :1540-1547 sticky_depth_e6 */
function rSticky(lastGood: bigint, lastGoodSlot: bigint, now: bigint): bigint {
  const k = saturatingSub(now, lastGoodSlot) / R_DEPTH_STICKY_EPOCH_SLOTS; // :1541
  if (k >= 64n) return 0n; // :1542-1543
  return lastGood >> k; // :1545
}

/** :1556-1575 cap_depth_e6 */
function rCap(src: number, fresh: Opt, lastGood: bigint, lastGoodSlot: bigint, now: bigint, twMin: Opt): Opt {
  if (fresh !== null) return fresh; // :1564-1565
  if (rDepthEver(src)) {
    const st = rSticky(lastGood, lastGoodSlot, now); // :1569
    const tw = twMin ?? U64_MAX; // :1570
    return st < tw ? st : tw; // :1571
  }
  return null; // :1573
}

// ── diff harness ───────────────────────────────────────────────────────────────────────────────
type Fn = "effective" | "fresh" | "usable" | "sticky" | "cap";
interface Mismatch { fn: Fn; args: unknown[]; ts: Opt; rust: Opt; tsLooser: boolean }
const mismatches: Mismatch[] = [];
const counts: Record<Fn, number> = { effective: 0, fresh: 0, usable: 0, sticky: 0, cap: 0 };

/** For a cap-feeding depth, larger = looser; `null` from cap = "no depth cap" = loosest. For fresh/usable, `null` = absent (cap falls to sticky). */
function looser(fn: Fn, ts: Opt, rust: Opt): boolean {
  if (fn === "cap") {
    if (ts === null) return true;
    if (rust === null) return false;
    return ts > rust;
  }
  if (ts === null || rust === null) return false; // classified by hand in the report if ever hit
  return ts > rust;
}

function rec(fn: Fn, args: unknown[], ts: Opt, rust: Opt): void {
  counts[fn]++;
  if (rust !== null) u64(rust);
  if (ts !== rust) mismatches.push({ fn, args, ts, rust, tsLooser: looser(fn, ts, rust) });
}

function checkAll(depth: bigint, prev: bigint, slot: bigint, src: number, now: bigint, lastGood: bigint, lastGoodSlot: bigint, twMin: Opt): void {
  rec("effective", [depth, prev, slot, now], effectiveDepthE6(depth, prev, slot, now), rEffective(depth, prev, slot, now));
  const fT = freshDepthE6(depth, prev, slot, src, now);
  const fR = rFresh(depth, prev, slot, src, now);
  rec("fresh", [depth, prev, slot, src, now], fT, fR);
  const uT = usableDepthE6(fR, lastGood, twMin);
  const uR = rUsable(fR, lastGood, twMin);
  rec("usable", [fR, lastGood, twMin], uT, uR);
  rec("sticky", [lastGood, lastGoodSlot, now], stickyDepthE6(lastGood, lastGoodSlot, now), rSticky(lastGood, lastGoodSlot, now));
  rec("cap", [src, uR, lastGood, lastGoodSlot, now, twMin], capDepthE6(src, uR, lastGood, lastGoodSlot, now, twMin), rCap(src, uR, lastGood, lastGoodSlot, now, twMin));
  // Also feed cap with the raw fresh and with null (its domain is any Option<u64>, not only usable's output).
  rec("cap", [src, fR, lastGood, lastGoodSlot, now, twMin], capDepthE6(src, fR, lastGood, lastGoodSlot, now, twMin), rCap(src, fR, lastGood, lastGoodSlot, now, twMin));
  rec("cap", [src, null, lastGood, lastGoodSlot, now, twMin], capDepthE6(src, null, lastGood, lastGoodSlot, now, twMin), rCap(src, null, lastGood, lastGoodSlot, now, twMin));
  // Composition as growthCeilingView (:2756-2759) and v16_program.rs:45580-45642 run it.
  const uTs = usableDepthE6(fT, lastGood, twMin);
  rec("cap", ["composed", depth, prev, slot, src, now, lastGood, lastGoodSlot, twMin], capDepthE6(src, uTs, lastGood, lastGoodSlot, now, twMin), rCap(src, rUsable(fR, lastGood, twMin), lastGood, lastGoodSlot, now, twMin));
}

// splitmix64 (seeded, deterministic)
function rng(seed: bigint): () => bigint {
  let s = seed & U64_MAX;
  return () => {
    s = (s + 0x9e3779b97f4a7c15n) & U64_MAX;
    let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MAX;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MAX;
    return z ^ (z >> 31n);
  };
}

const H = R_DEPTH_MAX_AGE_SLOTS;
const E = R_DEPTH_STICKY_EPOCH_SLOTS;

describe("growth-v19 cap depth vs prog bc657392 (scratch differential)", () => {
  it("constants match the Rust", () => {
    expect(DEPTH_MAX_AGE_SLOTS).toBe(R_DEPTH_MAX_AGE_SLOTS);
    expect(DEPTH_SOURCE_MASK).toBe(R_DEPTH_SOURCE_MASK);
    expect(DEPTH_EVER).toBe(R_DEPTH_EVER);
    expect(DEPTH_PREV_REAL).toBe(R_DEPTH_PREV_REAL);
    expect(DEPTH_STICKY_EPOCH_SLOTS).toBe(R_DEPTH_STICKY_EPOCH_SLOTS);
  });

  it("grid: values 0/1/equal/u64::MAX, slot deltas 0/1/H/H+1/future, sticky epochs, tw null/0/above, every source byte", () => {
    const vals = [0n, 1n, 2n, 25_000_000_000n, U64_MAX - 1n, U64_MAX];
    const pairs: [bigint, bigint][] = [];
    for (const a of vals) for (const b of vals) pairs.push([a, b]); // includes equal pairs
    const bases = [0n, 1n, 1_000n, U64_MAX - 2n * H - 2n, U64_MAX];
    // now - slot deltas: 0, 1, H-1, H, H+1, 2H, and negative (now < slot): -1, -H-1
    const deltas = [0n, 1n, H - 1n, H, H + 1n, 2n * H, -1n, -H - 1n];
    // now - lastGoodSlot: 0, 1, E-1, E, E+1, 63E, 64E-1, 64E, 64E+1, huge, negative
    const lgDeltas = [0n, 1n, E - 1n, E, E + 1n, 63n * E, 64n * E - 1n, 64n * E, 64n * E + 1n, U64_MAX, -1n, -E];
    const lgs = [0n, 1n, 25_000_000_000n, U64_MAX];
    let n = 0;
    for (let src = 0; src <= 0xff; src++) {
      for (const [d, p] of pairs) {
        for (const base of bases) {
          for (const dl of deltas) {
            const slot = base;
            const now = slot + dl;
            if (now < 0n || now > U64_MAX) continue;
            // fresh above / below / equal to the tw minimum; tw null / 0 / 1 / above fresh / u64::MAX
            const fr = rFresh(d, p, slot, src, now);
            const tws: Opt[] = [null, 0n, 1n, U64_MAX];
            if (fr !== null) { tws.push(fr); if (fr < U64_MAX) tws.push(fr + 1n); if (fr > 0n) tws.push(fr - 1n); }
            for (const tw of tws) {
              // lastGood x lastGoodSlot deltas: keep the inner loop small for the full byte sweep
              const lgSet = src % 17 === 0 || src === 0xff || src === 0x85 || src === 0x86 ? lgs : [25_000_000_000n];
              const ldSet = src % 17 === 0 || src === 0xff || src === 0x85 || src === 0x86 ? lgDeltas : [0n, E, 64n * E, -1n];
              for (const lg of lgSet) {
                for (const ld of ldSet) {
                  const lgSlot = now - ld;
                  if (lgSlot < 0n || lgSlot > U64_MAX) continue;
                  checkAll(d, p, slot, src, now, lg, lgSlot, tw);
                  n++;
                }
              }
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(100_000);
    // eslint-disable-next-line no-console
    console.log(`[capdepth-diff grid] states=${n} calls=${JSON.stringify(counts)} mismatches=${mismatches.length}`);
    expect(mismatches.slice(0, 5)).toEqual([]);
  }, 300_000);

  it("50k seeded random cases (mixed full-range and near-boundary draws)", () => {
    const r = rng(0xc0ffee_2026_1122n);
    const pick = (x: bigint, arr: bigint[]): bigint => arr[Number(x % BigInt(arr.length))];
    const val = (): bigint => {
      const m = r() % 5n;
      if (m === 0n) return r(); // full u64
      if (m === 1n) return pick(r(), [0n, 1n, U64_MAX, U64_MAX - 1n]);
      if (m === 2n) return r() >> (r() % 64n); // any magnitude
      if (m === 3n) return r() % 1_000_000_000_000n;
      return r() % 4n;
    };
    const before = mismatches.length;
    let n = 0;
    for (let i = 0; i < 50_000; i++) {
      const d = val();
      const p = r() % 4n === 0n ? d : val();
      const slot = r() % 3n === 0n ? r() : r() % 10_000_000n;
      const dm = r() % 4n;
      let now: bigint;
      if (dm === 0n) now = r();
      else if (dm === 1n) now = slot + (r() % (2n * H + 4n)) - 2n; // around 0..H+1
      else if (dm === 2n) now = slot + H + (r() % 3n) - 1n; // H-1, H, H+1
      else now = slot - (r() % 200n); // now <= slot
      if (now < 0n) now = 0n;
      if (now > U64_MAX) now = U64_MAX;
      const src = Number(r() & 0xffn);
      const lg = val();
      const lm = r() % 3n;
      let lgSlot: bigint;
      if (lm === 0n) lgSlot = r();
      else if (lm === 1n) lgSlot = now - (r() % (66n * E)) + E;
      else lgSlot = now - (r() % 65n) * E + (r() % 3n) - 1n;
      if (lgSlot < 0n) lgSlot = 0n;
      if (lgSlot > U64_MAX) lgSlot = U64_MAX;
      const tm = r() % 5n;
      const tw: Opt = tm === 0n ? null : tm === 1n ? 0n : tm === 2n ? val() : tm === 3n ? U64_MAX : (rFresh(d, p, slot, src, now) ?? r());
      checkAll(d, p, slot, src, now, lg, lgSlot, tw);
      n++;
    }
    expect(n).toBe(50_000);
    // eslint-disable-next-line no-console
    console.log(`[capdepth-diff random] cases=${n} calls=${JSON.stringify(counts)} newMismatches=${mismatches.length - before} tsLooser=${mismatches.filter((m) => m.tsLooser).length}`);
    expect(mismatches.slice(0, 5)).toEqual([]);
  }, 300_000);

  it("pins the Rust doc/test anchors (growth_v19.rs asserts :3734-3740)", () => {
    const t1 = 25_000_000_000n;
    expect(effectiveDepthE6(5n * t1, 2n * t1, 100n, 100n)).toBe(2n * t1);
    expect(effectiveDepthE6(5n * t1, 0n, 100n, 100n)).toBe(0n);
    expect(effectiveDepthE6(0n, 5n * t1, 100n, 100n)).toBe(0n);
    expect(effectiveDepthE6(t1, t1, 100n, 250n)).toBe(t1);
    expect(effectiveDepthE6(t1, t1, 100n, 251n)).toBe(0n);
    expect(effectiveDepthE6(t1, t1, 101n, 100n)).toBe(0n); // :3740 future stamp
  });
});
