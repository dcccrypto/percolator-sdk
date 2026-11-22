/**
 * Differential test: src/abi/stake-dead-lp.ts vs a line-by-line transcription of percolator-stake
 * `src/state.rs` @ aebbff6 (fix/v22-stake-last-junior-residual, "count dead-share floors per sub-pool
 * for real-holder gates (R-1)"). That commit is the one the SDK module cites; percolator-stake
 * origin/main (4f8d5b5) does not have `dead_lp` / error 29 yet.
 *
 * Rust reference (git show aebbff6:src/state.rs):
 *   :25   MINIMUM_LIQUIDITY = 1_000
 *   :28   FLOOR_SENIOR = 0x01, :30 FLOOR_JUNIOR = 0x02
 *   :590  junior_total_lp()  = u64 LE at _reserved[41..49]
 *   :617  senior_total_lp()  = total_lp_supply.saturating_sub(junior_total_lp())
 *   :711  floor_flags()      = _reserved[61]
 *   :738  dead_lp()          = f == 0 ? None : Some((f&1 ? 1000 : 0, f&2 ? 1000 : 0))
 *   :749  real_senior_lp()   = Some -> senior.saturating_sub(sd); None -> senior
 *   :758  real_junior_lp()   = Some -> junior.saturating_sub(jd); None -> junior
 *   :769  real_lp_supply()   = Some -> total.sat_sub(sd).sat_sub(jd); None -> total.sat_sub(1000)
 *   :778  has_real_lp_holders() = real_lp_supply() > 0   (false => AccrueFees error 29)
 *
 * Every flag byte 0..=255 is crossed with N seeded u64 (total, junior) pairs, through both the plain
 * helpers and the byte decoders. A mutation block proves the harness notices plausible wrong mirrors.
 */
import { describe, it, expect } from "vitest";
import {
  decodeStakePool,
  decodeStakePoolV5,
  STAKE_POOL_DISCRIMINATOR,
  STAKE_POOL_SIZE_V4,
  stakeDeadLp,
  stakeSeniorTotalLp,
  stakeRealLpSupply,
  stakeRealSeniorLp,
  stakeRealJuniorLp,
  stakeHasRealLpHolders,
} from "../src/index.js";

// ── Rust oracle (u64 semantics, checked) ────────────────────────────────────────────────────────
const U64_MAX = (1n << 64n) - 1n;
const R_MINIMUM_LIQUIDITY = 1_000n; // state.rs:25
const R_FLOOR_SENIOR = 0x01; // state.rs:28
const R_FLOOR_JUNIOR = 0x02; // state.rs:30

function u64(x: bigint): bigint {
  if (x < 0n || x > U64_MAX) throw new Error(`not a u64: ${x}`);
  return x;
}
/** Rust `u64::saturating_sub`. */
function rSatSub(a: bigint, b: bigint): bigint {
  u64(a);
  u64(b);
  return a >= b ? a - b : 0n;
}

interface RPool {
  total_lp_supply: bigint;
  junior_total_lp: bigint;
  flags: number; // u8
}

const rust = {
  senior_total_lp: (p: RPool) => rSatSub(p.total_lp_supply, p.junior_total_lp),
  dead_lp(p: RPool): [bigint, bigint] | null {
    const f = p.flags & 0xff;
    if (f === 0) return null;
    const d = (bit: number) => ((f & bit) !== 0 ? R_MINIMUM_LIQUIDITY : 0n);
    return [d(R_FLOOR_SENIOR), d(R_FLOOR_JUNIOR)];
  },
  real_senior_lp(p: RPool): bigint {
    const d = rust.dead_lp(p);
    return d ? rSatSub(rust.senior_total_lp(p), d[0]) : rust.senior_total_lp(p);
  },
  real_junior_lp(p: RPool): bigint {
    const d = rust.dead_lp(p);
    return d ? rSatSub(p.junior_total_lp, d[1]) : p.junior_total_lp;
  },
  real_lp_supply(p: RPool): bigint {
    const d = rust.dead_lp(p);
    return d ? rSatSub(rSatSub(p.total_lp_supply, d[0]), d[1]) : rSatSub(p.total_lp_supply, R_MINIMUM_LIQUIDITY);
  },
  has_real_lp_holders: (p: RPool) => rust.real_lp_supply(p) > 0n,
};

// ── SDK under test, behind a swappable interface so mutants can reuse the comparator ────────────
interface Impl {
  deadLp(f: number): { senior: bigint; junior: bigint } | null;
  senior(t: bigint, j: bigint): bigint;
  realSenior(t: bigint, j: bigint, f: number): bigint;
  realJunior(t: bigint, j: bigint, f: number): bigint;
  realSupply(t: bigint, f: number): bigint;
  hasReal(t: bigint, f: number): boolean;
}
const sdk: Impl = {
  deadLp: (f) => stakeDeadLp({ floorFlags: f }),
  senior: (t, j) => stakeSeniorTotalLp({ totalLpSupply: t, juniorTotalLp: j }),
  realSenior: (t, j, f) => stakeRealSeniorLp({ totalLpSupply: t, juniorTotalLp: j, floorFlags: f }),
  realJunior: (t, j, f) => stakeRealJuniorLp({ totalLpSupply: t, juniorTotalLp: j, floorFlags: f }),
  realSupply: (t, f) => stakeRealLpSupply({ totalLpSupply: t, floorFlags: f }),
  hasReal: (t, f) => stakeHasRealLpHolders({ totalLpSupply: t, floorFlags: f }),
};

interface Mismatch {
  fn: string;
  total: bigint;
  junior: bigint;
  flags: number;
  sdk: unknown;
  rust: unknown;
}

/** Compare one (total, junior, flags) point; push every differing function. */
function compare(impl: Impl, total: bigint, junior: bigint, flags: number, out: Mismatch[]): void {
  const p: RPool = { total_lp_supply: total, junior_total_lp: junior, flags };
  const rd = rust.dead_lp(p);
  const sd = impl.deadLp(flags);
  const deadOk = rd === null ? sd === null : sd !== null && sd.senior === rd[0] && sd.junior === rd[1];
  if (!deadOk) out.push({ fn: "dead_lp", total, junior, flags, sdk: sd, rust: rd });
  const chk = (fn: string, s: bigint | boolean, r: bigint | boolean) => {
    if (s !== r) out.push({ fn, total, junior, flags, sdk: s, rust: r });
    else if (typeof s === "bigint" && (s < 0n || s > U64_MAX)) out.push({ fn: `${fn}:range`, total, junior, flags, sdk: s, rust: r });
  };
  chk("senior_total_lp", impl.senior(total, junior), rust.senior_total_lp(p));
  chk("real_senior_lp", impl.realSenior(total, junior, flags), rust.real_senior_lp(p));
  chk("real_junior_lp", impl.realJunior(total, junior, flags), rust.real_junior_lp(p));
  chk("real_lp_supply", impl.realSupply(total, flags), rust.real_lp_supply(p));
  chk("has_real_lp_holders", impl.hasReal(total, flags), rust.has_real_lp_holders(p));
}

// ── seeded u64 generator: edges around 0 / 1000 / 2000 / u64::MAX, small, and full-range ────────
function xorshift64(seed: bigint) {
  let s = seed & U64_MAX || 1n;
  return () => {
    s ^= (s << 13n) & U64_MAX;
    s ^= s >> 7n;
    s ^= (s << 17n) & U64_MAX;
    return s;
  };
}
const EDGES = [0n, 1n, 999n, 1000n, 1001n, 1999n, 2000n, 2001n, 2999n, 3000n, 3001n, U64_MAX - 2000n, U64_MAX - 1000n, U64_MAX - 1n, U64_MAX];
function genU64(next: () => bigint): bigint {
  const r = next();
  switch (Number(r & 7n)) {
    case 0:
    case 1:
      return EDGES[Number((r >> 3n) % BigInt(EDGES.length))];
    case 2:
      return (r >> 3n) % 4096n; // around the 0/1000/2000/3000 thresholds
    case 3:
      return U64_MAX - ((r >> 3n) % 4096n); // near saturation
    case 4:
      return (r >> 3n) % 10_000_000n;
    default:
      return next(); // full u64 range
  }
}
function genPair(next: () => bigint): [bigint, bigint] {
  const total = genU64(next);
  const r = next() & 3n;
  // junior <= total (consistent pool), junior == total, or independent (drift / inconsistent input)
  const junior = r === 0n ? (total === 0n ? 0n : next() % (total + 1n)) : r === 1n ? total : genU64(next);
  return [total, junior];
}

const N = 10_240;
const SEED = 0x5eed_dead_1b_2026n;
/**
 * Default: each pair is checked against 8 flag bytes — the four semantic classes 0..3 plus 4 rotating
 * bytes, so every one of the 256 bytes meets 160 distinct pairs (~82k points, ~1 s). The full
 * 256 x N cartesian (2.6M points, ~40 s) runs with STAKE_DIFF_FULL=1; it was run for the job report.
 */
const FULL = process.env.STAKE_DIFF_FULL === "1";
function flagsFor(i: number): number[] {
  if (FULL) return Array.from({ length: 256 }, (_, f) => f);
  const r = (i * 4) % 256;
  return [0, 1, 2, 3, r, r + 1, r + 2, r + 3];
}

function sweep(impl: Impl, n: number, seed: bigint): { points: number; mismatches: Mismatch[]; flagsSeen: Set<number> } {
  const next = xorshift64(seed);
  const mismatches: Mismatch[] = [];
  const flagsSeen = new Set<number>();
  let points = 0;
  for (let i = 0; i < n; i++) {
    const [t, j] = genPair(next);
    for (const f of flagsFor(i)) {
      flagsSeen.add(f);
      compare(impl, t, j, f, mismatches);
      points++;
      if (mismatches.length > 50) return { points, mismatches, flagsSeen };
    }
  }
  return { points, mismatches, flagsSeen };
}

describe("stake dead-LP differential vs state.rs @ aebbff6", () => {
  it(`all 256 flag bytes x ${N} seeded u64 (total, junior) pairs${FULL ? " (full cartesian)" : ""}: 0 mismatches`, () => {
    const { points, mismatches, flagsSeen } = sweep(sdk, N, SEED);
    expect(flagsSeen.size).toBe(256);
    expect(points).toBe((FULL ? 256 : 8) * N);
    console.log(`[stake-dead-lp diff] points=${points} flags=${flagsSeen.size} pairs=${N} mismatches=${mismatches.length}`);
    expect(mismatches).toEqual([]);
  }, 300_000);

  it("every flag byte x the full edge grid (incl. u64::MAX): 0 mismatches", () => {
    const mismatches: Mismatch[] = [];
    let points = 0;
    for (const t of EDGES) for (const j of EDGES) for (let f = 0; f < 256; f++) {
      compare(sdk, t, j, f, mismatches);
      points++;
    }
    expect(points).toBe(EDGES.length * EDGES.length * 256);
    expect(mismatches).toEqual([]);
  });

  it("lead 1: stray-bit bytes (0x04..0xfc, no low bits) are Some((0,0)) in Rust too, not legacy", () => {
    for (let f = 4; f < 256; f += 4) {
      const p: RPool = { total_lp_supply: 1000n, junior_total_lp: 0n, flags: f };
      expect(rust.dead_lp(p)).toEqual([0n, 0n]);
      expect(stakeDeadLp({ floorFlags: f })).toEqual({ senior: 0n, junior: 0n });
      // so 1000 supply counts as real holders here, while flags 0 (legacy) would not
      expect(stakeHasRealLpHolders({ totalLpSupply: 1000n, floorFlags: f })).toBe(true);
      expect(rust.has_real_lp_holders(p)).toBe(true);
    }
    expect(stakeHasRealLpHolders({ totalLpSupply: 1000n, floorFlags: 0 })).toBe(false);
  });

  it("lead 2: legacy (flags 0) real_lp_supply subtracts 1000 but real_senior_lp subtracts nothing, as in Rust", () => {
    const p: RPool = { total_lp_supply: 5000n, junior_total_lp: 1500n, flags: 0 };
    expect(rust.real_lp_supply(p)).toBe(4000n);
    expect(rust.real_senior_lp(p)).toBe(3500n);
    expect(rust.real_junior_lp(p)).toBe(1500n);
    expect(stakeRealLpSupply({ totalLpSupply: 5000n, floorFlags: 0 })).toBe(4000n);
    expect(stakeRealSeniorLp({ totalLpSupply: 5000n, juniorTotalLp: 1500n, floorFlags: 0 })).toBe(3500n);
    expect(stakeRealJuniorLp({ totalLpSupply: 5000n, juniorTotalLp: 1500n, floorFlags: 0 })).toBe(1500n);
  });

  it("lead 3: u64::MAX inputs stay in u64 range and match (no overflow path: only saturating_sub)", () => {
    for (let f = 0; f < 256; f++) {
      const ms: Mismatch[] = [];
      compare(sdk, U64_MAX, U64_MAX, f, ms);
      compare(sdk, U64_MAX, 0n, f, ms);
      compare(sdk, 0n, U64_MAX, f, ms);
      expect(ms).toEqual([]);
    }
  });

  it("through the byte decoders (v4 + v5 layouts, _reserved[41..49] and _reserved[61]): 0 mismatches", () => {
    const next = xorshift64(SEED ^ 0xabcdn);
    const mismatches: Mismatch[] = [];
    let points = 0;
    for (let i = 0; i < 16; i++) {
      const [t, j] = genPair(next);
      for (let f = 0; f < 256; f++) {
        const v4 = new Uint8Array(STAKE_POOL_SIZE_V4);
        v4.set(STAKE_POOL_DISCRIMINATOR, 320);
        v4[328] = 4;
        new DataView(v4.buffer).setBigUint64(176, t, true);
        new DataView(v4.buffer).setBigUint64(320 + 41, j, true);
        v4[320 + 61] = f;
        const v5 = new Uint8Array(480);
        v5.set(v4.subarray(0, Math.min(v4.length, 480)));
        v5[328] = 5;
        v5[408] = 1;
        for (const d of [decodeStakePool(v4), decodeStakePoolV5(v5)]) {
          if (d.totalLpSupply !== t || d.juniorTotalLp !== j || d.floorFlags !== f)
            mismatches.push({ fn: "decode", total: t, junior: j, flags: f, sdk: [d.totalLpSupply, d.juniorTotalLp, d.floorFlags], rust: [t, j, f] });
          const p: RPool = { total_lp_supply: t, junior_total_lp: j, flags: f };
          const got = [stakeRealLpSupply(d), stakeRealSeniorLp(d), stakeRealJuniorLp(d), stakeHasRealLpHolders(d)];
          const want = [rust.real_lp_supply(p), rust.real_senior_lp(p), rust.real_junior_lp(p), rust.has_real_lp_holders(p)];
          if (got.some((g, k) => g !== want[k])) mismatches.push({ fn: "decoded", total: t, junior: j, flags: f, sdk: got, rust: want });
          points++;
        }
      }
    }
    expect(points).toBe(16 * 256 * 2);
    expect(mismatches).toEqual([]);
  }, 60_000);

  // ── the harness must catch plausible wrong mirrors ─────────────────────────────────────────────
  const satSub = (a: bigint, b: bigint) => (a > b ? a - b : 0n);
  const mutants: [string, Partial<Impl>][] = [
    ["stray bits treated as legacy ((f & 3) === 0 -> null)", {
      deadLp: (f) => ((f & 3) === 0 ? null : sdk.deadLp(f)),
      realSupply: (t, f) => ((f & 3) === 0 ? satSub(t, 1000n) : sdk.realSupply(t, f)),
    }],
    ["legacy real_senior_lp subtracts 1000", {
      realSenior: (t, j, f) => (f === 0 ? satSub(sdk.senior(t, j), 1000n) : sdk.realSenior(t, j, f)),
    }],
    ["legacy real_lp_supply subtracts nothing", { realSupply: (t, f) => (f === 0 ? t : sdk.realSupply(t, f)) }],
    ["FLOOR_SENIOR/FLOOR_JUNIOR swapped", {
      deadLp: (f) => (f === 0 ? null : { senior: f & 2 ? 1000n : 0n, junior: f & 1 ? 1000n : 0n }),
      realSenior: (t, j, f) => (f === 0 ? sdk.senior(t, j) : satSub(sdk.senior(t, j), f & 2 ? 1000n : 0n)),
    }],
    ["non-saturating subtraction (wraps negative)", {
      realSupply: (t, f) => (f === 0 ? t - 1000n : t - (f & 1 ? 1000n : 0n) - (f & 2 ? 1000n : 0n)),
    }],
    ["has_real_lp_holders uses >= 0", { hasReal: (t, f) => sdk.realSupply(t, f) >= 0n }],
    ["senior_total_lp not saturating", { senior: (t, j) => t - j }],
    ["real_junior_lp ignores junior floor", { realJunior: (_t, j) => j }],
    ["two floors counted as one (min 1000)", {
      realSupply: (t, f) => (f === 0 ? satSub(t, 1000n) : satSub(t, f & 3 ? 1000n : 0n)),
    }],
  ];
  it(`catches ${mutants.length}/${mutants.length} mutants`, () => {
    let caught = 0;
    for (const [, m] of mutants) {
      const { mismatches } = sweep({ ...sdk, ...m }, 200, SEED);
      if (mismatches.length > 0) caught++;
    }
    expect(caught).toBe(mutants.length);
  }, 60_000);
});
