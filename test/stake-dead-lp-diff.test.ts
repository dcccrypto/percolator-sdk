import { describe, it, expect } from "vitest";
import {
  decodeStakePool,
  STAKE_POOL_DISCRIMINATOR,
  STAKE_POOL_SIZE_V1,
  STAKE_POOL_SIZE_V2,
  STAKE_POOL_SIZE_V3,
  STAKE_POOL_SIZE_V4,
  stakeDeadLp,
  stakeRealLpSupply,
  stakeRealSeniorLp,
  stakeRealJuniorLp,
  stakeHasRealLpHolders,
} from "../src/index.js";

/**
 * Differential test: test-only TypeScript port of the Rust `StakePool` dead-LP helpers,
 * from percolator-stake commit aebbff616e80 ("fix(stake): count dead-share floors per
 * sub-pool for real-holder gates (R-1)"), `src/state.rs`:
 *   MINIMUM_LIQUIDITY  :25    FLOOR_SENIOR :28    FLOOR_JUNIOR :30
 *   junior_total_lp()  :590   (_reserved[41..49], LE u64)
 *   senior_total_lp()  :617   (total_lp_supply.saturating_sub(junior_total_lp()))
 *   dead_lp()          :738   real_senior_lp :749   real_junior_lp :758
 *   real_lp_supply()   :769   has_real_lp_holders :778
 *   `offset_of!(StakePool, _reserved) == 320` :276 (v2+); v1 (352 B) has no pending_admin
 *   at 288, so `_reserved` starts at 288. total_lp_supply is at offset 176 in all layouts.
 *
 * Reference operates on RAW BYTES exactly as the Rust accessors do (`_reserved[61]`,
 * `_reserved[41..49]`), independent of the SDK decoder.
 */
const U64_MAX = (1n << 64n) - 1n;
const MIN_LIQ = 1000n;
const FLOOR_SENIOR_R = 0x01;
const FLOOR_JUNIOR_R = 0x02;

const sat = (a: bigint, b: bigint) => (a > b ? a - b : 0n);

class RefPool {
  constructor(
    public total_lp_supply: bigint,
    public reserved: Uint8Array, // 64 bytes
  ) {}
  junior_total_lp(): bigint {
    return new DataView(this.reserved.buffer, this.reserved.byteOffset).getBigUint64(41, true);
  }
  senior_total_lp(): bigint {
    return sat(this.total_lp_supply, this.junior_total_lp());
  }
  dead_lp(): [bigint, bigint] | null {
    const f = this.reserved[61];
    if (f === 0) return null;
    const d = (bit: number) => ((f & bit) !== 0 ? MIN_LIQ : 0n);
    return [d(FLOOR_SENIOR_R), d(FLOOR_JUNIOR_R)];
  }
  real_senior_lp(): bigint {
    const d = this.dead_lp();
    return d ? sat(this.senior_total_lp(), d[0]) : this.senior_total_lp();
  }
  real_junior_lp(): bigint {
    const d = this.dead_lp();
    return d ? sat(this.junior_total_lp(), d[1]) : this.junior_total_lp();
  }
  real_lp_supply(): bigint {
    const d = this.dead_lp();
    return d ? sat(sat(this.total_lp_supply, d[0]), d[1]) : sat(this.total_lp_supply, MIN_LIQ);
  }
  has_real_lp_holders(): boolean {
    return this.real_lp_supply() > 0n;
  }
}

// xorshift64* PRNG, deterministic
let state = 0x9e3779b97f4a7c15n;
function rnd(): bigint {
  state ^= state >> 12n;
  state ^= (state << 25n) & U64_MAX;
  state ^= state >> 27n;
  return (state * 0x2545f4914f6cdd1dn) & U64_MAX;
}

const EDGE = [
  0n, 1n, 999n, 1000n, 1001n, 1999n, 2000n, 2001n, 3000n,
  U64_MAX, U64_MAX - 1n, U64_MAX - 999n, U64_MAX - 1000n, U64_MAX - 1001n, U64_MAX - 2000n,
  1n << 63n, (1n << 63n) - 1n, 1n << 32n,
];
function pickVal(): bigint {
  const k = Number(rnd() % 6n);
  if (k === 0) return EDGE[Number(rnd() % BigInt(EDGE.length))];
  if (k === 1) return rnd() % 5000n;
  if (k === 2) return rnd();
  if (k === 3) return rnd() >> BigInt(Number(rnd() % 64n));
  return rnd() % 100_000n;
}

const LAYOUTS: { size: number; base: number; version: number }[] = [
  { size: STAKE_POOL_SIZE_V1, base: 288, version: 1 },
  { size: STAKE_POOL_SIZE_V2, base: 320, version: 2 },
  { size: STAKE_POOL_SIZE_V3, base: 320, version: 3 },
  { size: STAKE_POOL_SIZE_V4, base: 320, version: 4 },
];

function build(layout: (typeof LAYOUTS)[number], total: bigint, junior: bigint, flags: number): Uint8Array {
  const buf = new Uint8Array(layout.size);
  const dv = new DataView(buf.buffer);
  buf.set(STAKE_POOL_DISCRIMINATOR, layout.base);
  buf[layout.base + 8] = layout.version;
  dv.setBigUint64(176, total, true);
  dv.setBigUint64(layout.base + 41, junior, true);
  buf[layout.base + 61] = flags;
  return buf;
}

describe("stake-dead-lp differential vs Rust reference (aebbff6)", () => {
  it("byte layout: v1 floor flag at 349, v2+ at 381", () => {
    expect(288 + 61).toBe(349);
    expect(320 + 61).toBe(381);
    for (const l of LAYOUTS) {
      const buf = build(l, 5000n, 0n, 3);
      expect(buf[l.base + 61]).toBe(3);
      expect(decodeStakePool(buf).floorFlags).toBe(3);
      const other = build(l, 5000n, 0n, 0);
      other[l.base + 60] = 3; // neighbour byte (_reserved[60], fee-attribution flag) must not leak
      other[l.base + 62] = 3;
      expect(decodeStakePool(other).floorFlags).toBe(0);
    }
  });

  it("matches the reference on >= 20k random + edge cases (0 mismatches)", () => {
    let cases = 0;
    let mismatches = 0;
    const firstBad: string[] = [];
    const check = (total: bigint, junior: bigint, flags: number, li: number) => {
      cases++;
      const l = LAYOUTS[li];
      const buf = build(l, total, junior, flags);
      const ref = new RefPool(total, buf.slice(l.base, l.base + 64));
      const s = decodeStakePool(buf);
      const inp = { totalLpSupply: s.totalLpSupply, juniorTotalLp: s.juniorTotalLp, floorFlags: s.floorFlags };
      const refDead = ref.dead_lp();
      const sdkDead = stakeDeadLp(inp);
      const deadOk =
        refDead === null
          ? sdkDead === null
          : sdkDead !== null && sdkDead.senior === refDead[0] && sdkDead.junior === refDead[1];
      const ok =
        s.totalLpSupply === total &&
        s.juniorTotalLp === junior &&
        deadOk &&
        stakeRealSeniorLp(inp) === ref.real_senior_lp() &&
        stakeRealJuniorLp(inp) === ref.real_junior_lp() &&
        stakeRealLpSupply(inp) === ref.real_lp_supply() &&
        stakeHasRealLpHolders(inp) === ref.has_real_lp_holders();
      if (!ok) {
        mismatches++;
        if (firstBad.length < 5) firstBad.push(`total=${total} junior=${junior} flags=${flags} layout=v${l.version}`);
      }
    };

    // exhaustive edge grid: all flags x all edge pairs x all layouts
    for (const f of [0, 1, 2, 3])
      for (const t of EDGE) for (const j of EDGE) for (let li = 0; li < LAYOUTS.length; li++) check(t, j, f, li);
    // random
    for (let i = 0; i < 24_000; i++) {
      const total = pickVal();
      let junior = pickVal();
      const m = Number(rnd() % 4n);
      if (m === 0) junior = total; // junior == total
      else if (m === 1 && total < U64_MAX) junior = total + 1n; // junior > total
      check(total, junior > U64_MAX ? U64_MAX : junior, Number(rnd() % 4n), Number(rnd() % 4n));
    }
    // other flag-byte values (reserved upper bits): reference only tests bit0/bit1
    for (let i = 0; i < 2_000; i++) check(pickVal(), pickVal(), Number(rnd() % 256n), Number(rnd() % 4n));

    console.log(`stake-dead-lp differential: cases=${cases} mismatches=${mismatches}`);
    expect(cases).toBeGreaterThanOrEqual(20_000);
    expect(firstBad).toEqual([]);
    expect(mismatches).toBe(0);
  }, 120_000);
});
