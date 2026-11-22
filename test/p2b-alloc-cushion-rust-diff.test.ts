/**
 * Differential test: the vault-LP allocator and G6 cushion math in src/abi/p2b-earn.ts against a
 * BigInt transcription of the program's Rust.
 *
 * Reference: percolator-prog `src/vault_lp_v18.rs` on `feat/v22-rc23-2026-10-22` at bc657392
 * (`git show origin/feat/v22-rc23-2026-10-22:src/vault_lp_v18.rs`). Each `rust*` function below is
 * a line-by-line port with the Rust quoted above it. Rust `Option::None` (overflow, out-of-range
 * bps) is `null` here; `u128` checked arithmetic is modelled with `checkedAdd` / `checkedMul`.
 *
 * Domains are the Rust argument types: amounts are `u128` (0..2^128-1), `lp_equity` is `i128`,
 * bps are `u16` (0..65535). Every function gets a boundary table (0, 1, bps 0 / 10000 / 10001 /
 * 65535, alpha above max, u128 max, recalled > allocated, overflowing products) and 10,000 seeded
 * random cases. Tests only: no cargo, no RPC.
 */
import { describe, expect, it } from "vitest";
import {
  a4CapacityLockOkP2b,
  allocJuniorOkP2b,
  allocWrittenDownP2b,
  creatorFeeVestedP2b,
  cushionLockedP2b,
  cushionSplitP2b,
  liveBoundPrincipalPortionP2b,
  vaultLpAllocAdmittedP2b,
  vaultLpAllocLimitP2b,
  vaultLpAllocSplitP2b,
  vaultLpDeallocP2b,
} from "../src/abi/p2b-earn.js";

// ---------------------------------------------------------------------------------------------
// Rust primitives
// ---------------------------------------------------------------------------------------------

const U128_MAX = (1n << 128n) - 1n;
const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;
const U16_MAX = 65_535;

// pub const BPS: u128 = 10_000;
const BPS = 10_000n;

const checkedAdd = (a: bigint, b: bigint): bigint | null => (a + b > U128_MAX ? null : a + b);
const checkedMul = (a: bigint, b: bigint): bigint | null => (a * b > U128_MAX ? null : a * b);
const saturatingSub = (a: bigint, b: bigint): bigint => (a > b ? a - b : 0n);

// pub fn mul_div_floor(a: u128, b: u128, d: u128) -> Option<u128> {
//     if d == 0 {
//         return None;
//     }
//     a.checked_mul(b).map(|p| p / d)
// }
function rustMulDivFloor(a: bigint, b: bigint, d: bigint): bigint | null {
  if (d === 0n) return null;
  const p = checkedMul(a, b);
  return p === null ? null : p / d;
}

// pub fn bps_floor(x: u128, bps: u16) -> Option<u128> {
//     let b = bps as u128;
//     if b > BPS {
//         return None;
//     }
//     Some((x / BPS) * b + ((x % BPS) * b) / BPS)
// }
function rustBpsFloor(x: bigint, bps: number): bigint | null {
  const b = BigInt(bps);
  if (b > BPS) return null;
  return (x / BPS) * b + ((x % BPS) * b) / BPS;
}

// pub fn bps_ceil(x: u128, bps: u16) -> Option<u128> {
//     let b = bps as u128;
//     if b > BPS {
//         return None;
//     }
//     let rem = (x % BPS) * b;
//     Some((x / BPS) * b + rem / BPS + u128::from(!rem.is_multiple_of(BPS)))
// }
function rustBpsCeil(x: bigint, bps: number): bigint | null {
  const b = BigInt(bps);
  if (b > BPS) return null;
  const rem = (x % BPS) * b;
  return (x / BPS) * b + rem / BPS + (rem % BPS !== 0n ? 1n : 0n);
}

// pub fn senior_impaired(vault_value: u128, senior_claim_eff: u128) -> bool {
//     vault_value < senior_claim_eff
// }
const rustSeniorImpaired = (vaultValue: bigint, seniorClaimEff: bigint): boolean => vaultValue < seniorClaimEff;

// src/growth_v19.rs (v2.2 is devnet-only; the SDK pins the devnet value):
// #[cfg(feature = "devnet")]
// pub const ALLOC_ALPHA_MAX_BAND_BPS: u16 = 7_000;
// #[cfg(not(feature = "devnet"))]
// pub const ALLOC_ALPHA_MAX_BAND_BPS: u16 = 6_000;
const ALLOC_ALPHA_MAX_BAND_BPS = 7_000;
// pub const ALLOC_BUFFER_MIN_BPS: u16 = 3_000;
const ALLOC_BUFFER_MIN_BPS = 3_000;
// pub const ALLOC_MIN_JUNIOR_BPS: u16 = 500;
const ALLOC_MIN_JUNIOR_BPS = 500;

// ---------------------------------------------------------------------------------------------
// Rust functions under test (vault_lp_v18.rs line numbers at bc657392)
// ---------------------------------------------------------------------------------------------

// :730
// pub fn vault_lp_alloc_limit(c_eff: u128, allocated: u128, drawable: u128, alpha_bps: u16, buffer_bps: u16) -> Option<u128> {
//     if alpha_bps > crate::growth_v19::ALLOC_ALPHA_MAX_BAND_BPS
//         || buffer_bps < ALLOC_BUFFER_MIN_BPS
//         || buffer_bps as u128 > BPS
//     {
//         return None;
//     }
//     let alpha_room = bps_floor(c_eff, alpha_bps)?.saturating_sub(allocated);
//     let liquid_room = drawable.saturating_sub(bps_ceil(c_eff, buffer_bps)?);
//     Some(if alpha_room < liquid_room { alpha_room } else { liquid_room })
// }
function rustVaultLpAllocLimit(cEff: bigint, allocated: bigint, drawable: bigint, alphaBps: number, bufferBps: number): bigint | null {
  if (alphaBps > ALLOC_ALPHA_MAX_BAND_BPS || bufferBps < ALLOC_BUFFER_MIN_BPS || BigInt(bufferBps) > BPS) return null;
  const fl = rustBpsFloor(cEff, alphaBps);
  if (fl === null) return null;
  const alphaRoom = saturatingSub(fl, allocated);
  const ce = rustBpsCeil(cEff, bufferBps);
  if (ce === null) return null;
  const liquidRoom = saturatingSub(drawable, ce);
  return alphaRoom < liquidRoom ? alphaRoom : liquidRoom;
}

// :759
// pub fn vault_lp_alloc_admitted(draw_outstanding: u128, draw_pending: bool, vault_value: u128, senior_claim_eff: u128, lp_equity: i128) -> bool {
//     draw_outstanding == 0
//         && !draw_pending
//         && !senior_impaired(vault_value, senior_claim_eff)
//         && lp_equity >= 0
// }
function rustVaultLpAllocAdmitted(drawOutstanding: bigint, drawPending: boolean, vaultValue: bigint, seniorClaimEff: bigint, lpEquity: bigint): boolean {
  return drawOutstanding === 0n && !drawPending && !rustSeniorImpaired(vaultValue, seniorClaimEff) && lpEquity >= 0n;
}

// :777
// pub fn alloc_junior_ok(vault_value: u128, senior_claim_eff: u128) -> bool {
//     let junior = vault_value.saturating_sub(senior_claim_eff);
//     match bps_ceil(senior_claim_eff, ALLOC_MIN_JUNIOR_BPS) {
//         Some(need) => junior >= need,
//         None => false,
//     }
// }
function rustAllocJuniorOk(vaultValue: bigint, seniorClaimEff: bigint): boolean {
  const junior = saturatingSub(vaultValue, seniorClaimEff);
  const need = rustBpsCeil(seniorClaimEff, ALLOC_MIN_JUNIOR_BPS);
  return need === null ? false : junior >= need;
}

// :788
// pub fn alloc_written_down(allocated: u128, lp_value: u128) -> u128 {
//     if allocated < lp_value { allocated } else { lp_value }
// }
const rustAllocWrittenDown = (allocated: bigint, lpValue: bigint): bigint => (allocated < lpValue ? allocated : lpValue);

// :801
// pub fn vault_lp_alloc_split(moved: u128, d_even: u128, d_odd: u128) -> Option<(u128, u128)> {
//     let total = d_even.checked_add(d_odd)?;
//     if moved > total {
//         return None;
//     }
//     if moved == 0 {
//         return Some((0, 0));
//     }
//     let small_is_odd = d_odd <= d_even;
//     let (d_small, d_large) = if small_is_odd { (d_odd, d_even) } else { (d_even, d_odd) };
//     let take_small = mul_div_floor(moved, d_small, total)?.min(d_small);
//     let take_large = moved - take_small;
//     if take_large > d_large {
//         return None;
//     }
//     Some(if small_is_odd { (take_large, take_small) } else { (take_small, take_large) })
// }
function rustVaultLpAllocSplit(moved: bigint, dEven: bigint, dOdd: bigint): [bigint, bigint] | null {
  const total = checkedAdd(dEven, dOdd);
  if (total === null) return null;
  if (moved > total) return null;
  if (moved === 0n) return [0n, 0n];
  const smallIsOdd = dOdd <= dEven;
  const [dSmall, dLarge] = smallIsOdd ? [dOdd, dEven] : [dEven, dOdd];
  const q = rustMulDivFloor(moved, dSmall, total);
  if (q === null) return null;
  const takeSmall = q < dSmall ? q : dSmall;
  const takeLarge = moved - takeSmall;
  if (takeLarge > dLarge) return null;
  return smallIsOdd ? [takeLarge, takeSmall] : [takeSmall, takeLarge];
}

// :825
// pub fn vault_lp_dealloc(allocated: u128, recalled: u128) -> u128 {
//     allocated.saturating_sub(recalled)
// }
const rustVaultLpDealloc = (allocated: bigint, recalled: bigint): bigint => saturatingSub(allocated, recalled);

// :834
// pub fn a4_capacity_lock_ok(n_cap_before: u128, n_cap_after: u128, lp_eff_abs: u128) -> bool {
//     n_cap_after >= n_cap_before || n_cap_after >= lp_eff_abs
// }
const rustA4CapacityLockOk = (before: bigint, after: bigint, lpEffAbs: bigint): boolean => after >= before || after >= lpEffAbs;

// :190
// pub fn live_bound_principal_portion(atoms_out: u128, available_principal: u128) -> u128 {
//     if atoms_out < available_principal { atoms_out } else { available_principal }
// }
const rustLiveBoundPrincipalPortion = (atomsOut: bigint, available: bigint): bigint => (atomsOut < available ? atomsOut : available);

// :914
// pub fn cushion_split(available: u128, cushion_share_bps: u16, cushion_target_bps: u16, c_eff: u128, junior_level: u128) -> Option<(u128, u128)> {
//     if cushion_share_bps == 0 || cushion_target_bps == 0 {
//         return Some((available, 0));
//     }
//     let need = bps_ceil(c_eff, cushion_target_bps)?.saturating_sub(junior_level);
//     let share = bps_floor(available, cushion_share_bps)?;
//     let cushion = if share < need { share } else { need };
//     Some((available - cushion, cushion))
// }
function rustCushionSplit(available: bigint, shareBps: number, targetBps: number, cEff: bigint, juniorLevel: bigint): [bigint, bigint] | null {
  if (shareBps === 0 || targetBps === 0) return [available, 0n];
  const t = rustBpsCeil(cEff, targetBps);
  if (t === null) return null;
  const need = saturatingSub(t, juniorLevel);
  const share = rustBpsFloor(available, shareBps);
  if (share === null) return null;
  const cushion = share < need ? share : need;
  return [available - cushion, cushion];
}

// :953
// pub fn cushion_locked(cushion_accrued: u128, c_eff: u128, cushion_target_bps: u16) -> Option<u128> {
//     let target = bps_ceil(c_eff, cushion_target_bps)?;
//     Some(if cushion_accrued < target { cushion_accrued } else { target })
// }
function rustCushionLocked(accrued: bigint, cEff: bigint, targetBps: number): bigint | null {
  const target = rustBpsCeil(cEff, targetBps);
  if (target === null) return null;
  return accrued < target ? accrued : target;
}

// :964
// pub fn creator_fee_vested(junior_level: u128, c_eff: u128, cushion_share_bps: u16, cushion_target_bps: u16) -> bool {
//     if cushion_share_bps == 0 || cushion_target_bps == 0 {
//         return true;
//     }
//     match bps_ceil(c_eff, cushion_target_bps) {
//         Some(t) => junior_level >= t,
//         None => false,
//     }
// }
function rustCreatorFeeVested(juniorLevel: bigint, cEff: bigint, shareBps: number, targetBps: number): boolean {
  if (shareBps === 0 || targetBps === 0) return true;
  const t = rustBpsCeil(cEff, targetBps);
  return t === null ? false : juniorLevel >= t;
}

// ---------------------------------------------------------------------------------------------
// Seeded generator (splitmix64) and input shapes
// ---------------------------------------------------------------------------------------------

function rng(seed: bigint) {
  let s = seed & 0xffff_ffff_ffff_ffffn;
  const next64 = (): bigint => {
    s = (s + 0x9e37_79b9_7f4a_7c15n) & 0xffff_ffff_ffff_ffffn;
    let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & 0xffff_ffff_ffff_ffffn;
    z = ((z ^ (z >> 27n)) * 0x94d0_49bb_1331_11ebn) & 0xffff_ffff_ffff_ffffn;
    return z ^ (z >> 31n);
  };
  const int = (n: number): number => Number(next64() % BigInt(n));
  const u128 = (): bigint => {
    switch (int(7)) {
      case 0: return BigInt(int(4)); // 0..3
      case 1: return next64() & 0xffffn; // small
      case 2: return next64(); // u64 range (SPL amounts)
      case 3: return (next64() << 64n) | next64(); // full u128
      case 4: return U128_MAX - BigInt(int(4)); // u128 max edge
      case 5: { const k = BigInt(int(128)); return ((1n << k) + BigInt(int(3)) - 1n) & U128_MAX; } // 2^k - 1 .. 2^k + 1
      default: return BigInt(int(1_000_000)); // dense small
    }
  };
  // a value near `x` (exact, +-small, or unrelated) so comparisons hit both sides and equality
  const near = (x: bigint): bigint => {
    switch (int(4)) {
      case 0: return x;
      case 1: return x + BigInt(int(3)) > U128_MAX ? U128_MAX : x + BigInt(int(3));
      case 2: return x > 2n ? x - BigInt(int(3)) : 0n;
      default: return u128();
    }
  };
  const BPS_EDGES = [0, 1, 499, 500, 501, 2_999, 3_000, 3_001, 5_000, 6_000, 6_999, 7_000, 7_001, 9_999, 10_000, 10_001, 20_000, U16_MAX];
  const bps = (): number => (int(2) === 0 ? BPS_EDGES[int(BPS_EDGES.length)] : int(U16_MAX + 1));
  const i128 = (): bigint => {
    switch (int(5)) {
      case 0: return 0n;
      case 1: return -1n;
      case 2: return I128_MIN + BigInt(int(2));
      case 3: return I128_MAX - BigInt(int(2));
      default: { const v = u128() & I128_MAX; return int(2) === 0 ? v : -v; }
    }
  };
  return { int, u128, near, bps, i128, bool: () => int(2) === 0 };
}

const N = 10_000;
const SEED = 0x2026_1122_a110_c0den;
const show = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

type Case = { args: unknown[]; sdk: string; rust: string };
function diff<A extends unknown[]>(name: string, sdk: (...a: A) => unknown, rust: (...a: A) => unknown, boundary: A[], gen: (r: ReturnType<typeof rng>) => A, salt: bigint) {
  const mism: Case[] = [];
  const check = (a: A) => {
    let s: string;
    try {
      s = show(sdk(...a));
    } catch (e) {
      s = `throw ${(e as Error).message}`;
    }
    const r = show(rust(...a));
    if (s !== r) mism.push({ args: a, sdk: s, rust: r });
  };
  for (const a of boundary) check(a);
  const nBoundaryMism = mism.length;
  const r = rng(SEED ^ salt);
  for (let i = 0; i < N; i++) check(gen(r));
  return { name, boundary: boundary.length, nBoundaryMism, nRandomMism: mism.length - nBoundaryMism, first: mism.slice(0, 5).map((m) => `${show(m.args)} sdk=${m.sdk} rust=${m.rust}`) };
}

const M = U128_MAX;
const H = 1n << 127n; // half of u128 range

describe("p2b alloc + cushion: SDK vs vault_lp_v18.rs (bc657392), boundary + 10,000 seeded cases each", () => {
  const results: ReturnType<typeof diff>[] = [];
  const expectClean = (res: ReturnType<typeof diff>) => {
    results.push(res);
    expect(res.first, `${res.name}: ${res.nBoundaryMism} boundary + ${res.nRandomMism} random mismatches`).toEqual([]);
  };

  it("vaultLpAllocLimitP2b == vault_lp_alloc_limit (:730)", () => {
    expectClean(diff("vaultLpAllocLimitP2b", vaultLpAllocLimitP2b, rustVaultLpAllocLimit, [
      [0n, 0n, 0n, 0, 3_000], [1n, 0n, 1n, 5_000, 3_000], [1_000n, 0n, 1_000n, 5_000, 3_000],
      [1_000n, 0n, 1_000n, 7_000, 3_000], [1_000n, 0n, 1_000n, 7_001, 3_000], [1_000n, 0n, 1_000n, U16_MAX, 3_000], // alpha above max
      [1_000n, 0n, 1_000n, 5_000, 2_999], [1_000n, 0n, 1_000n, 5_000, 10_000], [1_000n, 0n, 1_000n, 5_000, 10_001], [1_000n, 0n, 1_000n, 5_000, U16_MAX],
      [1_000n, 0n, 1_000n, 0, 3_000], [1_000n, 600n, 1_000n, 5_000, 3_000], [1_000n, 500n, 1_000n, 5_000, 3_000], [1_000n, 0n, 300n, 5_000, 3_000],
      [M, 0n, M, 7_000, 3_000], [M, M, M, 7_000, 10_000], [M, 0n, 0n, 7_000, 3_000], [0n, M, M, 7_000, 3_000], [M - 1n, 1n, M, 1, 3_000],
    ], (r) => { const c = r.u128(); return [c, r.near(c / 2n), r.near(c), r.bps(), r.bps()]; }, 1n));
  });

  it("vaultLpAllocAdmittedP2b == vault_lp_alloc_admitted (:759)", () => {
    expectClean(diff("vaultLpAllocAdmittedP2b", vaultLpAllocAdmittedP2b, rustVaultLpAllocAdmitted, [
      [0n, false, 0n, 0n, 0n], [1n, false, 1_000n, 1_000n, 0n], [0n, true, 1_000n, 1_000n, 0n], [0n, false, 999n, 1_000n, 0n],
      [0n, false, 1_000n, 1_000n, -1n], [0n, false, M, M, I128_MAX], [0n, false, M - 1n, M, 0n], [M, false, M, 0n, 0n], [0n, false, 0n, 0n, I128_MIN],
    ], (r) => { const v = r.u128(); return [r.int(3) === 0 ? r.u128() : 0n, r.int(4) === 0, v, r.near(v), r.i128()]; }, 2n));
  });

  it("allocJuniorOkP2b == alloc_junior_ok (:777)", () => {
    expectClean(diff("allocJuniorOkP2b", allocJuniorOkP2b, rustAllocJuniorOk, [
      [0n, 0n], [1n, 0n], [0n, 1n], [1n, 1n], [2n, 1n], [10_500n, 10_000n], [10_499n, 10_000n], [10_501n, 10_001n], [10_502n, 10_001n],
      [M, M], [M, 0n], [0n, M], [M, (M / 105n) * 100n], [M, M - M / 21n],
    ], (r) => { const c = r.u128(); const j = (c / 20n) + BigInt(r.int(3)) - 1n; return [r.int(3) === 0 ? r.u128() : (c + (j < 0n ? 0n : j) > M ? M : c + (j < 0n ? 0n : j)), c]; }, 3n));
  });

  it("allocWrittenDownP2b == alloc_written_down (:788)", () => {
    expectClean(diff("allocWrittenDownP2b", allocWrittenDownP2b, rustAllocWrittenDown, [
      [0n, 0n], [1n, 0n], [0n, 1n], [5_000n, 0n], [5_000n, 5_000n], [M, 0n], [0n, M], [M, M], [M - 1n, M],
    ], (r) => { const a = r.u128(); return [a, r.near(a)]; }, 4n));
  });

  it("vaultLpDeallocP2b == vault_lp_dealloc (:825), incl. recalled > allocated", () => {
    expectClean(diff("vaultLpDeallocP2b", vaultLpDeallocP2b, rustVaultLpDealloc, [
      [0n, 0n], [1n, 0n], [0n, 1n], [500n, 700n], [700n, 500n], [500n, 500n], [M, 0n], [0n, M], [M, M], [M - 1n, M], [M, 1n],
    ], (r) => { const a = r.u128(); return [a, r.near(a)]; }, 5n));
  });

  it("vaultLpAllocSplitP2b == vault_lp_alloc_split (:801), incl. u128 overflow of the sum and of moved*d_small", () => {
    expectClean(diff("vaultLpAllocSplitP2b", vaultLpAllocSplitP2b, rustVaultLpAllocSplit, [
      [0n, 0n, 0n], [1n, 0n, 0n], [0n, 1n, 1n], [1n, 1n, 0n], [1n, 0n, 1n], [1n, 1n, 1n], [100n, 300n, 100n], [100n, 100n, 300n],
      [400n, 300n, 100n], [401n, 300n, 100n], [3n, 2n, 2n], [7n, 5n, 5n],
      [M, M, 0n], [M, 0n, M], [1n, M, 0n], [0n, M, M], // M + M overflows: checked_add -> None
      [1n, M, 1n], [M, M, 1n], // M + 1 overflows
      [1n << 100n, 1n << 126n, 1n << 126n], [H - 1n, H - 1n, H], [1n << 64n, (1n << 70n), (1n << 70n)], // moved * d_small > u128
      [(1n << 64n) - 1n, (1n << 64n) - 1n, (1n << 64n) - 1n], // u64 x u64: fits
    ], (r) => {
      const a = r.u128(); const b = r.int(3) === 0 ? r.near(a) : r.u128();
      const tot = a + b;
      const moved = r.int(3) === 0 ? r.u128() : (tot === 0n ? 0n : (r.int(2) === 0 ? tot : ((r.u128() % tot) + 1n) & M));
      return [moved, a, b];
    }, 6n));
  });

  it("a4CapacityLockOkP2b == a4_capacity_lock_ok (:834)", () => {
    expectClean(diff("a4CapacityLockOkP2b", a4CapacityLockOkP2b, rustA4CapacityLockOk, [
      [0n, 0n, 0n], [10n, 5n, 6n], [10n, 5n, 5n], [10n, 10n, 100n], [10n, 11n, 100n], [M, M - 1n, M], [M, M - 1n, M - 1n], [0n, 0n, M], [M, 0n, 0n],
    ], (r) => { const b = r.u128(); return [b, r.near(b), r.near(b)]; }, 7n));
  });

  it("liveBoundPrincipalPortionP2b == live_bound_principal_portion (:190)", () => {
    expectClean(diff("liveBoundPrincipalPortionP2b", liveBoundPrincipalPortionP2b, rustLiveBoundPrincipalPortion, [
      [0n, 0n], [1n, 0n], [0n, 1n], [7_000n, 5_000n], [5_000n, 7_000n], [5_000n, 5_000n], [M, 0n], [0n, M], [M, M], [M - 1n, M],
    ], (r) => { const a = r.u128(); return [a, r.near(a)]; }, 8n));
  });

  it("cushionSplitP2b == cushion_split (:914), incl. bps above 10,000 (Rust None)", () => {
    expectClean(diff("cushionSplitP2b", cushionSplitP2b, rustCushionSplit, [
      [0n, 0, 0, 0n, 0n], [1_000n, 5_000, 1_000, 10_000n, 900n], [1_000n, 1_000, 5_000, 10_000n, 0n], [1_000n, 0, 1_000, 10_000n, 0n], [1_000n, 5_000, 0, 10_000n, 0n],
      [1_000n, 10_000, 10_000, 10_000n, 0n], [1_000n, 10_000, 10_000, 10_000n, 10_000n], [1n, 1, 1, 1n, 0n], [1n, 10_000, 1, 1n, 0n],
      [M, 10_000, 10_000, M, 0n], [M, 5_000, 2_000, M, M], [M, 1, 10_000, M, 0n], [0n, 5_000, 2_000, M, 0n],
      [100n, 20_000, 10_000, 1_000n, 0n], // share > 100%: Rust None
      [100n, 5_000, 10_001, 1_000n, 0n], // target > 100%: Rust None
      [100n, U16_MAX, U16_MAX, 1_000n, 0n], [100n, 0, U16_MAX, 1_000n, 0n], [100n, U16_MAX, 0, 1_000n, 0n], // a 0 dial wins before the range check
    ], (r) => { const c = r.u128(); return [r.u128(), r.bps(), r.bps(), c, r.int(2) === 0 ? r.near(c / 5n) : r.u128()]; }, 9n));
  });

  it("cushionLockedP2b == cushion_locked (:953), incl. target above 10,000 (Rust None)", () => {
    expectClean(diff("cushionLockedP2b", cushionLockedP2b, rustCushionLocked, [
      [0n, 0n, 0], [5_000n, 10_000n, 1_000], [999n, 10_000n, 1_000], [1_000n, 10_000n, 1_000], [1n, 1n, 1], [0n, 1n, 1], [M, M, 10_000], [M, M, 1], [1n, M, 0],
      [5_000n, 10_000n, 10_001], [5_000n, 10_000n, U16_MAX], [0n, 0n, U16_MAX], // target > 100%: Rust None
    ], (r) => { const c = r.u128(); return [r.int(2) === 0 ? r.near(c / 5n) : r.u128(), c, r.bps()]; }, 10n));
  });

  it("creatorFeeVestedP2b == creator_fee_vested (:964), incl. target above 10,000 (Rust false)", () => {
    expectClean(diff("creatorFeeVestedP2b", creatorFeeVestedP2b, rustCreatorFeeVested, [
      [0n, 0n, 0, 0], [999n, 10_000n, 5_000, 1_000], [1_000n, 10_000n, 5_000, 1_000], [0n, 10_000n, 0, 1_000], [0n, 10_000n, 5_000, 0],
      [M, M, 1, 10_000], [M - 1n, M, 1, 10_000], [1n, 1n, 1, 1], [0n, 1n, 1, 1],
      [300n, 100n, 5_000, 20_000], // target > 100%: Rust false (fail closed); ceil(200%*100) = 200 <= 300
      [M, 0n, 5_000, 10_001], [M, 1n, U16_MAX, U16_MAX], [0n, 0n, U16_MAX, 1], // share is never range-checked here
    ], (r) => { const c = r.u128(); return [r.int(2) === 0 ? r.near(c / 5n) : r.u128(), c, r.bps(), r.bps()]; }, 11n));
  });

  it("summary table", () => {
    // eslint-disable-next-line no-console
    console.log(["fn | boundary | boundary mism | random | random mism", ...results.map((x) => `${x.name} | ${x.boundary} | ${x.nBoundaryMism} | ${N} | ${x.nRandomMism}`)].join("\n"));
    expect(results.length).toBe(11);
  });
});
