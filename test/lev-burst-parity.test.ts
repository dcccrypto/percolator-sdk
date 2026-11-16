import { describe, it, expect } from "vitest";
import { levBurstDecayV22, levBurstVarEffV22, LEV_BURST_HALF_LIFE_SLOTS as HL } from "../src/abi/lev-guard-limits-v22.js";

// Hand port of percolator-prog src/lev_guard_v22.rs burst_decay / burst_var_eff (u32 / u64 semantics).
const U64 = (1n << 64n) - 1n;
function rustDecay(peak: bigint, elapsed: bigint): bigint {
  const halvings = elapsed / HL;
  if (halvings >= 32n) return 0n;
  const p = peak >> halvings;
  const rem = elapsed % HL;
  let m = p * rem;
  if (m > U64) m = U64; // saturating_mul
  return p - m / (2n * HL);
}
function rustVarEff(peak: bigint, peakSlot: bigint, varNow: bigint, now: bigint): bigint {
  const floor = rustDecay(peak, now > peakSlot ? now - peakSlot : 0n) / 4n;
  return floor > varNow ? floor : varNow;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("burst_decay SDK vs Rust parity", () => {
  const r = rng(0xb0057);
  const u32 = () => Math.floor(r() * 4294967296);
  const peaks = [0, 1, 2, 3, 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff];
  const cases: Array<[number, bigint]> = [];
  for (let i = 0; i < 10000; i++) {
    const k = BigInt(Math.floor(r() * 40));
    const mode = i % 4;
    const elapsed = mode === 0 ? k * HL : mode === 1 ? (k > 0n ? k * HL - 1n : 0n) : mode === 2 ? BigInt(Math.floor(r() * 2 ** 40)) : k * HL + BigInt(Math.floor(r() * Number(HL)));
    cases.push([i < peaks.length * 4 ? peaks[i % peaks.length] : u32(), elapsed]);
  }

  it("matches Rust for 10,000 seeded u32 inputs incl. halving boundaries and 32 halvings", () => {
    const bad = cases.filter(([p, e]) => BigInt(levBurstDecayV22(p, e)) !== rustDecay(BigInt(p), e));
    expect(bad).toEqual([]);
  });

  it("burst_var_eff matches Rust", () => {
    const bad: unknown[] = [];
    for (const [p, e] of cases.slice(0, 5000)) {
      const v = u32();
      if (BigInt(levBurstVarEffV22(p, 1000n, v, 1000n + e)) !== rustVarEff(BigInt(p), 1000n, BigInt(v), 1000n + e)) bad.push([p, e, v]);
    }
    expect(bad).toEqual([]);
  });

  it("explicit boundaries", () => {
    for (const p of peaks) {
      for (const e of [0n, HL - 1n, HL, HL + 1n, 31n * HL, 32n * HL - 1n, 32n * HL, 33n * HL]) {
        expect(BigInt(levBurstDecayV22(p, e))).toBe(rustDecay(BigInt(p), e));
      }
    }
  });

  // Out-of-range peaks cannot come from the decoder (getUint32) nor be expressed in Rust (peak: u32), so they are
  // unreachable in practice. Pin the current (wrapping) behaviour so any later change is deliberate.
  it("documents u32 wrap of out-of-range peaks (unreachable via decoded accounts)", () => {
    expect(levBurstDecayV22(-1, 0n)).toBe(0xffffffff);
    expect(levBurstDecayV22(4294967296 + 5, 0n)).toBe(5);
    expect(levBurstDecayV22(1.9, 0n)).toBe(1);
  });
});
