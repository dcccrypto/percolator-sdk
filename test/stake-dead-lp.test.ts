import { describe, it, expect } from "vitest";
import {
  decodeStakePool,
  decodeStakePoolV5,
  STAKE_ERRORS,
  STAKE_POOL_DISCRIMINATOR,
  STAKE_POOL_SIZE_V4,
  FLOOR_SENIOR,
  FLOOR_JUNIOR,
  STAKE_FLOOR_FLAGS_RESERVED_INDEX,
  stakeDeadLp,
  stakeRealLpSupply,
  stakeRealSeniorLp,
  stakeRealJuniorLp,
  stakeHasRealLpHolders,
} from "../src/index.js";

// Byte offset computed from the Rust struct (state.rs @ aebbff6): `_reserved` is pinned at
// offset 320 by `assert!(offset_of!(StakePool, _reserved) == 320)`, and the flags byte is
// `_reserved[61]`, so absolute 381. (v1 pools start `_reserved` at 288 -> 349.)
const FLOOR_FLAGS_ABS_V2PLUS = 320 + 61;

function pool(opts: { total: bigint; junior?: bigint; flags?: number }): Uint8Array {
  const buf = new Uint8Array(STAKE_POOL_SIZE_V4);
  const dv = new DataView(buf.buffer);
  buf.set(STAKE_POOL_DISCRIMINATOR, 320);
  buf[328] = 4;
  dv.setBigUint64(176, opts.total, true); // total_lp_supply
  dv.setBigUint64(320 + 41, opts.junior ?? 0n, true); // junior_total_lp
  buf[FLOOR_FLAGS_ABS_V2PLUS] = opts.flags ?? 0;
  return buf;
}

describe("stake floor flags decode", () => {
  it("reads _reserved[61] at absolute 381", () => {
    expect(STAKE_FLOOR_FLAGS_RESERVED_INDEX).toBe(61);
    for (const f of [0, 1, 2, 3]) {
      expect(decodeStakePool(pool({ total: 5000n, flags: f })).floorFlags).toBe(f);
    }
    // a flag byte at a neighbouring offset must not be picked up
    const b = pool({ total: 5000n });
    b[FLOOR_FLAGS_ABS_V2PLUS - 1] = 0xff;
    b[FLOOR_FLAGS_ABS_V2PLUS + 1] = 0xff;
    expect(decodeStakePool(b).floorFlags).toBe(0);
  });

  it("v5 decoder exposes floorFlags and juniorTotalLp at the same offsets", () => {
    const d = new Uint8Array(480);
    d.set(Buffer.from("SPOOL_V1"), 320);
    d[328] = 5;
    d[408] = 1;
    new DataView(d.buffer).setBigUint64(320 + 41, 4321n, true);
    d[381] = 3;
    const p = decodeStakePoolV5(d);
    expect(p.floorFlags).toBe(3);
    expect(p.juniorTotalLp).toBe(4321n);
  });
});

describe("stake dead-share helpers mirror state.rs", () => {
  it("legacy pool (flags 0): one floor of 1000 somewhere; real = total - 1000 saturating", () => {
    const p = decodeStakePool(pool({ total: 5000n, junior: 700n, flags: 0 }));
    expect(stakeDeadLp(p)).toBeNull();
    expect(stakeRealLpSupply(p)).toBe(4000n);
    expect(stakeHasRealLpHolders(p)).toBe(true);
    expect(stakeRealSeniorLp(p)).toBe(4300n); // legacy: senior supply, no exclusion
    expect(stakeRealJuniorLp(p)).toBe(700n);
    // total <= 1000 -> no real holders (pre-fix F3 rule); 0 supply saturates, not underflows
    expect(stakeHasRealLpHolders(decodeStakePool(pool({ total: 1000n })))).toBe(false);
    expect(stakeRealLpSupply(decodeStakePool(pool({ total: 1000n })))).toBe(0n);
    expect(stakeRealLpSupply(decodeStakePool(pool({ total: 0n })))).toBe(0n);
    expect(stakeRealLpSupply(decodeStakePool(pool({ total: 1001n })))).toBe(1n);
  });

  it("non-tranche pool (FLOOR_SENIOR only): total - 1000, same as legacy", () => {
    const p = decodeStakePool(pool({ total: 5000n, flags: FLOOR_SENIOR }));
    expect(stakeDeadLp(p)).toEqual({ senior: 1000n, junior: 0n });
    expect(stakeRealLpSupply(p)).toBe(4000n);
    expect(stakeRealSeniorLp(p)).toBe(4000n);
    expect(stakeRealJuniorLp(p)).toBe(0n);
    expect(stakeHasRealLpHolders(decodeStakePool(pool({ total: 1000n, flags: FLOOR_SENIOR })))).toBe(false);
  });

  it("both floors: total - 2000; supply of exactly 2000 has no real holders", () => {
    const flags = FLOOR_SENIOR | FLOOR_JUNIOR;
    const p = decodeStakePool(pool({ total: 5000n, junior: 1500n, flags }));
    expect(stakeDeadLp(p)).toEqual({ senior: 1000n, junior: 1000n });
    expect(stakeRealLpSupply(p)).toBe(3000n);
    expect(stakeRealSeniorLp(p)).toBe(2500n); // 3500 senior - 1000
    expect(stakeRealJuniorLp(p)).toBe(500n); // 1500 junior - 1000
    const dead = decodeStakePool(pool({ total: 2000n, junior: 1000n, flags }));
    expect(stakeRealLpSupply(dead)).toBe(0n);
    expect(stakeHasRealLpHolders(dead)).toBe(false);
    expect(stakeHasRealLpHolders(decodeStakePool(pool({ total: 2001n, junior: 1000n, flags })))).toBe(true);
    // the pre-fix single-floor rule would wrongly say a real holder exists at 2000
    expect(2000n - 1000n).toBeGreaterThan(0n);
  });

  it("junior-only floor: senior sub-pool empty, last real junior counted correctly", () => {
    const p = decodeStakePool(pool({ total: 1000n, junior: 1000n, flags: FLOOR_JUNIOR }));
    expect(stakeDeadLp(p)).toEqual({ senior: 0n, junior: 1000n });
    expect(stakeRealLpSupply(p)).toBe(0n);
    expect(stakeHasRealLpHolders(p)).toBe(false);
    const q = decodeStakePool(pool({ total: 1600n, junior: 1600n, flags: FLOOR_JUNIOR }));
    expect(stakeRealLpSupply(q)).toBe(600n);
    expect(stakeRealJuniorLp(q)).toBe(600n);
    expect(stakeRealSeniorLp(q)).toBe(0n);
    expect(stakeHasRealLpHolders(q)).toBe(true);
  });

  it("saturates instead of underflowing on inconsistent input", () => {
    const flags = FLOOR_SENIOR | FLOOR_JUNIOR;
    expect(stakeRealLpSupply({ totalLpSupply: 500n, juniorTotalLp: 0n, floorFlags: flags })).toBe(0n);
    expect(stakeRealJuniorLp({ totalLpSupply: 500n, juniorTotalLp: 500n, floorFlags: flags })).toBe(0n);
    expect(stakeRealSeniorLp({ totalLpSupply: 500n, juniorTotalLp: 900n, floorFlags: flags })).toBe(0n);
  });
});

describe("stake error copy", () => {
  it("error 28 covers an empty senior/junior sub-pool, not only the first-ever deposit", () => {
    expect(STAKE_ERRORS[28]).toMatch(/empty/i);
    expect(STAKE_ERRORS[28]).toMatch(/senior/);
    expect(STAKE_ERRORS[28]).toMatch(/junior/);
    expect(STAKE_ERRORS[28]).not.toMatch(/first-ever/);
  });
  it("error 29 describes real_lp_supply, not the single-floor rule", () => {
    expect(STAKE_ERRORS[29]).toMatch(/real_lp_supply/);
  });
});
