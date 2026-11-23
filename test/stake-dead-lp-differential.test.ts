import { describe, it, expect } from "vitest";
import {
  stakeDeadLp,
  stakeRealLpSupply,
  stakeRealSeniorLp,
  stakeRealJuniorLp,
  stakeSeniorTotalLp,
  stakeHasRealLpHolders,
  STAKE_MINIMUM_LIQUIDITY,
  FLOOR_SENIOR,
  FLOOR_JUNIOR,
  STAKE_FLOOR_FLAGS_RESERVED_INDEX,
} from "../src/index.js";

/**
 * Differential test vs percolator-stake `src/state.rs` at 75aac97 (the commit program-ids.ts pins
 * for stake 7JrgAUHi…; reachable from origin/devnet/v22-fresh-ids). Reference model below is a
 * literal u64 transliteration of: MINIMUM_LIQUIDITY=1_000, FLOOR_SENIOR=0x01, FLOOR_JUNIOR=0x02,
 * senior_total_lp, dead_lp, real_senior_lp, real_junior_lp, real_lp_supply, has_real_lp_holders,
 * record_floor_lock (callers: process_deposit -> record_floor_lock(false), process_deposit_junior
 * -> record_floor_lock(true)).
 */
const U64_MAX = (1n << 64n) - 1n;
const ML = 1_000n;

const sat = (a: bigint, b: bigint) => (a >= b ? a - b : 0n); // u64::saturating_sub

interface RustPool {
  total: bigint;
  junior: bigint;
  flags: number; // u8
}
const rs = {
  senior: (p: RustPool) => sat(p.total, p.junior),
  dead: (p: RustPool): [bigint, bigint] | null =>
    p.flags === 0 ? null : [(p.flags & 1) !== 0 ? ML : 0n, (p.flags & 2) !== 0 ? ML : 0n],
  realSenior(p: RustPool) {
    const d = rs.dead(p);
    return d ? sat(rs.senior(p), d[0]) : rs.senior(p);
  },
  realJunior(p: RustPool) {
    const d = rs.dead(p);
    return d ? sat(p.junior, d[1]) : p.junior;
  },
  realTotal(p: RustPool) {
    const d = rs.dead(p);
    return d ? sat(sat(p.total, d[0]), d[1]) : sat(p.total, ML);
  },
};

function recordFloorLock(p: RustPool, junior: boolean): void {
  let f = p.flags;
  const [mine, other] = junior ? [2, 1] : [1, 2];
  if (f === 0 && p.total > 0n) f |= other;
  f |= mine;
  p.flags = f;
}

// mulberry32, seeded
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function u64(r: () => number): bigint {
  const hi = BigInt(Math.floor(r() * 4294967296));
  const lo = BigInt(Math.floor(r() * 4294967296));
  return (hi << 32n) | lo;
}
const BOUNDARY = [0n, 1n, 999n, 1000n, 1001n, 1999n, 2000n, 2001n, 3000n, U64_MAX - 1n, U64_MAX];
function pickSupply(r: () => number): bigint {
  const k = r();
  if (k < 0.3) return BOUNDARY[Math.floor(r() * BOUNDARY.length)];
  if (k < 0.55) return BigInt(Math.floor(r() * 3001)); // dense around the floors
  if (k < 0.8) return BigInt(Math.floor(r() * 1e9));
  return u64(r);
}

function check(p: RustPool): string | null {
  const ts = { totalLpSupply: p.total, juniorTotalLp: p.junior, floorFlags: p.flags };
  const d = stakeDeadLp(ts);
  const rd = rs.dead(p);
  if ((d === null) !== (rd === null)) return "deadLp nullness";
  if (d && rd && (d.senior !== rd[0] || d.junior !== rd[1])) return "deadLp value";
  if (stakeSeniorTotalLp(ts) !== rs.senior(p)) return "senior total";
  if (stakeRealSeniorLp(ts) !== rs.realSenior(p)) return "real senior";
  if (stakeRealJuniorLp(ts) !== rs.realJunior(p)) return "real junior";
  if (stakeRealLpSupply(ts) !== rs.realTotal(p)) return "real total";
  if (stakeHasRealLpHolders(ts) !== rs.realTotal(p) > 0n) return "has real";
  return null;
}

describe("stake dead-LP differential vs percolator-stake state.rs 75aac97", () => {
  it("constants match state.rs", () => {
    expect(STAKE_MINIMUM_LIQUIDITY).toBe(ML);
    expect(FLOOR_SENIOR).toBe(0x01);
    expect(FLOOR_JUNIOR).toBe(0x02);
    expect(STAKE_FLOOR_FLAGS_RESERVED_INDEX).toBe(61);
  });

  it("seeded grid: 24k random pools, every u8 flag value, supply<1000, junior>total", () => {
    const r = rng(0x5eed1234);
    const mismatches: { input: RustPool; why: string }[] = [];
    let n = 0;
    let juniorGtTotal = 0;
    let smallSupply = 0;
    for (let i = 0; i < 24_000; i++) {
      const flagsK = r();
      const flags = flagsK < 0.8 ? Math.floor(r() * 4) : Math.floor(r() * 256);
      const total = pickSupply(r);
      const junior = r() < 0.5 ? pickSupply(r) : total === 0n ? 0n : u64(r) % (total + 1n);
      if (junior > total) juniorGtTotal++;
      if (total < 1000n) smallSupply++;
      const p = { total, junior, flags };
      const why = check(p);
      n++;
      if (why) mismatches.push({ input: p, why });
    }
    // exhaustive boundary cross product
    for (const total of BOUNDARY)
      for (const junior of BOUNDARY)
        for (let flags = 0; flags < 4; flags++) {
          const p = { total, junior, flags };
          const why = check(p);
          n++;
          if (why) mismatches.push({ input: p, why });
        }
    console.log(
      `cases=${n} mismatches=${mismatches.length} juniorGtTotal=${juniorGtTotal} supply<1000=${smallSupply}`,
    );
    if (mismatches.length)
      console.log("first5", JSON.stringify(mismatches.slice(0, 5), (_, v) => (typeof v === "bigint" ? v.toString() : v)));
    expect(n).toBeGreaterThanOrEqual(20_000);
    expect(juniorGtTotal).toBeGreaterThan(1000);
    expect(smallSupply).toBeGreaterThan(1000);
    expect(mismatches).toEqual([]);
  });

  it("reachable lifecycles: flags from record_floor_lock sequences match, incl. legacy pools", () => {
    const r = rng(0xdeadbeef);
    let n = 0;
    for (let i = 0; i < 5_000; i++) {
      // legacy start (flags 0, supply>0 => pre-fix single floor) or fresh pool
      const legacy = r() < 0.4;
      const p: RustPool = legacy
        ? { total: ML + BigInt(Math.floor(r() * 5000)), junior: 0n, flags: 0 }
        : { total: 0n, junior: 0n, flags: 0 };
      const steps = 1 + Math.floor(r() * 6);
      for (let s = 0; s < steps; s++) {
        const junior = r() < 0.5;
        const sub = junior ? p.junior : sat(p.total, p.junior);
        const amt = BigInt(Math.floor(r() * 4000));
        if (sub === 0n && amt > ML) {
          recordFloorLock(p, junior); // lock happens before supply increments
        }
        if (sub !== 0n || amt > ML) {
          p.total += amt;
          if (junior) p.junior += amt;
        }
        const why = check(p);
        if (why) expect.fail(why + " " + JSON.stringify({ ...p, total: p.total.toString(), junior: p.junior.toString() }));
        n++;
      }
    }
    expect(n).toBeGreaterThan(5000);
  });
});
