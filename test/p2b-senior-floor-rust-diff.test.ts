/**
 * Differential test: the Q2 senior-floor code the Earn vault uses to halt risk-increasing vault-LP
 * fills (Custom 103 `VaultLpSeniorCapitalHalt`), SDK vs Rust.
 *
 * Rust source: percolator-prog `feat/v22-rc23-2026-10-22` @ bc657392 (read with `git show`, not
 * checked out, no cargo).
 *
 * src/vault_lp_v18.rs:1006-1036
 * ```rust
 * pub fn senior_floor_encode(v: u128) -> u16 {
 *     if v == 0 {
 *         return 0;
 *     }
 *     let bits = 128 - v.leading_zeros();
 *     if bits <= 10 {
 *         return v as u16;
 *     }
 *     let mut e = bits - 10;
 *     let mut m = (v >> e) + u128::from(v & ((1u128 << e) - 1) != 0);
 *     if m == 1024 {
 *         e += 1;
 *         m = 512;
 *     }
 *     if e > 63 {
 *         return u16::MAX;
 *     }
 *     ((e as u16) << 10) | (m as u16)
 * }
 *
 * pub fn senior_floor_decode(code: u16) -> u128 {
 *     let e = (code >> 10) as u32;
 *     let m = (code & 1023) as u128;
 *     m << e
 * }
 *
 * pub fn senior_capital_halt(lp_conservative_equity: u128, floor: u128) -> bool {
 *     lp_conservative_equity < floor
 * }
 * ```
 *
 * src/v16_program.rs:446-458 (constants)
 * ```rust
 * pub const ASSET_RISK_LIMITS_OFF: usize = PROTOCOL_FEE_AUTHORITY_EPOCH_OFF + PROTOCOL_FEE_AUTHORITY_EPOCH_LEN;
 * pub const ASSET_RISK_LIMITS_LEN: usize = 64;
 * const _: () = assert!(ASSET_RISK_LIMITS_OFF == 608);
 * pub const P2B_SENIOR_FLOOR_OFF: usize = ASSET_RISK_LIMITS_OFF + 42;
 * pub const P2B_SENIOR_FLOOR_LEN: usize = 2;
 * const _: () = assert!(P2B_SENIOR_FLOOR_OFF == 650);
 * ```
 *
 * src/v16_program.rs:3365-3415 (`#[repr(C)] pub struct AssetRiskLimitsV17`, 64 bytes)
 * ```rust
 * pub side_oi_cap_q: u128,          // 0..16
 * pub lp_floor_atoms: u128,         // 16..32
 * pub lp_exposure_k_bps: u32,       // 32..36
 * pub exec_band_bps: u16,           // 36..38
 * pub matcher_ext_mode: u8,         // 38
 * pub _reserved0: u8,               // 39
 * pub max_requested_fee_bps: u16,   // 40..42
 * pub p2b_senior_floor_code: [u8; 2], // 42..44
 * pub adl_max_episode_slots: u32,   // 44..48
 * pub adl_episode_since_slot: u64,  // 48..56
 * pub adl_episode_epoch_long: u32,  // 56..60
 * pub adl_episode_epoch_short: u32, // 60..64
 * const _: () = assert!(core::mem::offset_of!(AssetRiskLimitsV17, p2b_senior_floor_code) == 42);
 * const _: () = assert!(core::mem::offset_of!(AssetRiskLimitsV17, adl_max_episode_slots) == 44);
 * const _: () = assert!(core::mem::offset_of!(AssetRiskLimitsV17, adl_episode_since_slot) == 48);
 * const _: () = assert!(core::mem::offset_of!(AssetRiskLimitsV17, adl_episode_epoch_long) == 56);
 * ```
 *
 * src/v16_program.rs:3540-3546 (the read the halt path uses) and 39520-39527 (the halt path)
 * ```rust
 * pub fn p2b_senior_floor_from_wrapper_bytes(wrapper: &[u8]) -> Result<u128, ProgramError> {
 *     let off = crate::constants::P2B_SENIOR_FLOOR_OFF;
 *     let b = wrapper.get(off..off + crate::constants::P2B_SENIOR_FLOOR_LEN).ok_or(..)?;
 *     Ok(crate::vault_lp_v18::senior_floor_decode(u16::from_le_bytes([b[0], b[1]])))
 * }
 * ...
 * let floor = state::p2b_senior_floor_from_wrapper_bytes(&market.wrapper[..])?;
 * if floor == 0 { return Ok(()); }
 * if vault_lp_v18::senior_capital_halt(p2b_c_m(lp)?, floor) {
 *     return Err(PercolatorError::VaultLpSeniorCapitalHalt.into());
 * }
 * ```
 *
 * The reference below is a literal BigInt transcription. It deliberately does NOT reuse the SDK's
 * `toString(2)` bit-length trick: `leading_zeros` is computed by scanning bits from 127 down.
 */
import { describe, expect, it } from "vitest";
import {
  P2B_SENIOR_FLOOR_RECORD_OFF,
  P2B_SENIOR_FLOOR_SLOT_OFF,
  decodeSeniorFloorRecordP2b,
  seniorCapitalHaltP2b,
  seniorFloorDecodeP2b,
  seniorFloorEncodeP2b,
} from "../src/abi/p2b-earn.js";

// ---------------------------------------------------------------------------
// Rust reference (u128 / u16 semantics in BigInt)
// ---------------------------------------------------------------------------
const U128_MAX = (1n << 128n) - 1n;
const U16_MAX = 0xffff;

/** `u128::leading_zeros`, by binary search on the highest set bit (no `toString`). */
function rustLeadingZerosU128(v: bigint): number {
  if (v === 0n) return 128;
  let hi = 0;
  for (let step = 64; step >= 1; step >>= 1) if (v >> BigInt(hi + step) !== 0n) hi += step;
  return 127 - hi;
}

function rustEncode(v: bigint): number {
  if (v < 0n || v > U128_MAX) throw new Error("not a u128");
  if (v === 0n) return 0;
  const bits = 128 - rustLeadingZerosU128(v);
  if (bits <= 10) return Number(v); // `v as u16`, v < 1024
  let e = bits - 10;
  let m = (v >> BigInt(e)) + ((v & ((1n << BigInt(e)) - 1n)) !== 0n ? 1n : 0n);
  if (m === 1024n) {
    e += 1;
    m = 512n;
  }
  if (e > 63) return U16_MAX;
  return ((e << 10) | Number(m)) & 0xffff; // `(e as u16) << 10 | m as u16`
}

function rustDecode(code: number): bigint {
  const e = BigInt(code >> 10);
  const m = BigInt(code & 1023);
  return m << e;
}

function rustHalt(eq: bigint, floor: bigint): boolean {
  return eq < floor;
}

/** The Rust halt PATH: `floor == 0 -> Ok` then `senior_capital_halt`. */
function rustHaltPath(eq: bigint, code: number): boolean {
  const floor = rustDecode(code);
  if (floor === 0n) return false;
  return rustHalt(eq, floor);
}

/** Largest floor Rust can represent without saturating: 1023 * 2^63. */
const SAT_EDGE = 1023n << 63n;

// ---------------------------------------------------------------------------
// seeded inputs
// ---------------------------------------------------------------------------
/** splitmix64 over BigInt, deterministic. */
function splitmix64(seed: bigint): () => bigint {
  let s = seed & 0xffff_ffff_ffff_ffffn;
  return () => {
    s = (s + 0x9e37_79b9_7f4a_7c15n) & 0xffff_ffff_ffff_ffffn;
    let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & 0xffff_ffff_ffff_ffffn;
    z = ((z ^ (z >> 27n)) * 0x94d0_49bb_1331_11ebn) & 0xffff_ffff_ffff_ffffn;
    return z ^ (z >> 31n);
  };
}

function seededAtoms(n: number, seed: bigint): bigint[] {
  const r = splitmix64(seed);
  const out: bigint[] = [];
  for (let i = 0; i < n; i++) {
    // uniform bit width 1..128 (roughly log-uniform in magnitude) so every exponent (and saturation) is exercised.
    const width = Number(r() % 128n) + 1;
    const raw = (r() << 64n) | r();
    out.push(raw & ((1n << BigInt(width)) - 1n));
  }
  return out;
}

let boundaryCache: bigint[] | undefined;
function boundaryAtoms(): bigint[] {
  if (boundaryCache) return boundaryCache;
  const s = new Set<bigint>();
  for (let v = 0n; v <= 4100n; v++) s.add(v);
  for (let k = 0n; k < 128n; k++) {
    const p = 1n << k;
    for (const d of [-2n, -1n, 0n, 1n, 2n]) {
      const v = p + d;
      if (v >= 0n && v <= U128_MAX) s.add(v);
    }
    // carry edge at every exponent: mantissa 1023 plus one / plus remainder.
    if (k <= 118n) {
      const top = 1023n << k;
      for (const d of [-1n, 0n, 1n]) if (top + d >= 0n) s.add(top + d);
      s.add((1023n << k) + (1n << k) - 1n);
      s.add((512n << k) + 1n);
    }
  }
  for (const v of [SAT_EDGE - 1n, SAT_EDGE, SAT_EDGE + 1n, 1n << 73n, (1n << 64n) - 1n, U128_MAX - 1n, U128_MAX]) s.add(v);
  boundaryCache = [...s];
  return boundaryCache;
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------
type Mismatch = { input: string; sdk: string; rust: string };

/** Fails with the count and the first 20 rows of the mismatch table (keeps a broken run readable). */
function expectNoMismatch(m: Mismatch[]): void {
  expect(m.length, `${m.length} mismatches, first 20: ${JSON.stringify(m.slice(0, 20))}`).toBe(0);
}

// ~0.2-1.6 s per case alone; 30 s headroom so a loaded full-suite run cannot time it out.
describe("Q2 senior floor code vs Rust vault_lp_v18 @ bc657392", { timeout: 30_000 }, () => {
  it("(1) decode: every one of the 65,536 codes matches senior_floor_decode", () => {
    const mismatches: Mismatch[] = [];
    for (let code = 0; code <= U16_MAX; code++) {
      const sdk = seniorFloorDecodeP2b(code);
      const rust = rustDecode(code);
      if (sdk !== rust) mismatches.push({ input: String(code), sdk: String(sdk), rust: String(rust) });
    }
    expectNoMismatch(mismatches);
    // spot anchors from the Rust unit test / doc comment
    expect(seniorFloorDecodeP2b(0)).toBe(0n);
    expect(seniorFloorDecodeP2b(1023)).toBe(1023n);
    expect(seniorFloorDecodeP2b(0xffff)).toBe(SAT_EDGE);
    // a u16 outside the range is refused (Rust's type cannot hold it).
    for (const bad of [-1, 65_536, 1.5, Number.NaN]) expect(() => seniorFloorDecodeP2b(bad)).toThrow();
  });

  it("(2) encode: 10,000 seeded atoms + powers of two + boundaries match senior_floor_encode code-for-code", () => {
    const inputs = [...seededAtoms(10_000, 0x5e_1102_f100_2026n), ...boundaryAtoms()];
    expect(inputs.length).toBeGreaterThan(10_000 + 4_000);
    const mismatches: Mismatch[] = [];
    let ceilChecked = 0;
    let saturated = 0;
    for (const v of inputs) {
      const sdk = seniorFloorEncodeP2b(v);
      const rust = rustEncode(v);
      if (sdk !== rust) {
        mismatches.push({ input: String(v), sdk: String(sdk), rust: String(rust) });
        continue;
      }
      const d = rustDecode(rust);
      if (v <= SAT_EDGE) {
        // rounding direction: CEILING, never a weaker (smaller) floor, within Rust's precision bound.
        if (d < v) mismatches.push({ input: String(v), sdk: `ceil broken: ${d}`, rust: ">= v" });
        if (d > v + v / 512n + 1n) mismatches.push({ input: String(v), sdk: `precision broken: ${d}`, rust: "<= v+v/512+1" });
        // and it is the SMALLEST representable value >= v when the result is canonical
        // (any lower canonical code would decode below v).
        if (rust > 0 && rust < U16_MAX && (rust & 1023) > 512 && rustDecode(rust - 1) >= v)
          mismatches.push({ input: String(v), sdk: `not minimal: ${rust}`, rust: "smallest code >= v" });
        ceilChecked++;
      } else {
        // Rust saturates to u16::MAX above 1023 * 2^63 (unreachable for SPL amounts).
        if (rust !== U16_MAX) mismatches.push({ input: String(v), sdk: String(rust), rust: "0xffff" });
        saturated++;
      }
    }
    expectNoMismatch(mismatches);
    expect(ceilChecked).toBeGreaterThan(10_000);
    expect(saturated).toBeGreaterThan(0);
    // anchors from the Rust unit test
    for (const v of [0n, 1n, 1023n, 1024n, 1025n, 2047n, 2048n, 999_999n, 5_000_000_000n, (1n << 64n) - 1n]) {
      expect(seniorFloorEncodeP2b(v)).toBe(rustEncode(v));
    }
    // inputs outside u128 are refused (Rust's type cannot hold them).
    for (const bad of [-1n, U128_MAX + 1n]) expect(() => seniorFloorEncodeP2b(bad)).toThrow();
  });

  it("(2b) every canonical code round-trips: encode(decode(code)) == code", () => {
    const mismatches: Mismatch[] = [];
    for (let code = 0; code <= U16_MAX; code++) {
      const e = code >> 10;
      const m = code & 1023;
      const canonical = code === 0 || (e === 0 ? m > 0 : m >= 512);
      if (!canonical) continue;
      const sdk = seniorFloorEncodeP2b(seniorFloorDecodeP2b(code));
      const rust = rustEncode(rustDecode(code));
      if (sdk !== rust || rust !== code) mismatches.push({ input: String(code), sdk: String(sdk), rust: String(rust) });
    }
    expectNoMismatch(mismatches);
  });

  it("(3) record bytes built from the AssetRiskLimitsV17 layout decode at record off 42 and slot off 650", () => {
    expect(P2B_SENIOR_FLOOR_RECORD_OFF).toBe(42);
    expect(P2B_SENIOR_FLOOR_SLOT_OFF).toBe(608 + 42);
    const r = splitmix64(0x0a55_e7_c0de_42n);
    const le = (buf: Uint8Array, off: number, v: bigint, n: number) => {
      for (let i = 0; i < n; i++) buf[off + i] = Number((v >> BigInt(8 * i)) & 0xffn);
    };
    const codes = [0, 1, 0x00ff, 0x0100, 1023, 1024, 0x0401, 0x1234, 0x8000, 0xfc00, 0xfeff, 0xff00, U16_MAX];
    for (let i = 0; i < 256; i++) codes.push(Number(r() & 0xffffn));
    const mismatches: Mismatch[] = [];
    for (const code of codes) {
      // Byte-by-byte record per the #[repr(C)] field list, every neighbour field non-zero so a
      // wrong offset or width picks up the wrong bytes.
      const rec = new Uint8Array(64);
      le(rec, 0, (r() << 64n) | r(), 16); // side_oi_cap_q
      le(rec, 16, (r() << 64n) | r(), 16); // lp_floor_atoms
      le(rec, 32, r() | 1n, 4); // lp_exposure_k_bps
      le(rec, 36, r() | 1n, 2); // exec_band_bps
      rec[38] = 0xa5; // matcher_ext_mode
      rec[39] = 0x5a; // _reserved0
      le(rec, 40, r() | 1n, 2); // max_requested_fee_bps
      le(rec, 42, BigInt(code), 2); // p2b_senior_floor_code: [u8; 2] = u16::to_le_bytes
      le(rec, 44, r() | 1n, 4); // adl_max_episode_slots
      le(rec, 48, r() | 1n, 8); // adl_episode_since_slot
      le(rec, 56, r() | 1n, 4); // adl_episode_epoch_long
      le(rec, 60, r() | 1n, 4); // adl_episode_epoch_short

      // Wrapper slot: record at ASSET_RISK_LIMITS_OFF (608); Rust reads [650, 652).
      const slot = new Uint8Array(1024);
      for (let j = 0; j < slot.length; j++) slot[j] = (j * 37 + 11) & 0xff;
      slot.set(rec, 608);
      const rustFloor = rustDecode(slot[650] | (slot[651] << 8)); // u16::from_le_bytes([b[0], b[1]])

      const fromRec = decodeSeniorFloorRecordP2b(rec);
      const fromSlot = decodeSeniorFloorRecordP2b(slot.subarray(608, 608 + 64));
      const fromSlotOff = seniorFloorDecodeP2b(slot[P2B_SENIOR_FLOOR_SLOT_OFF] | (slot[P2B_SENIOR_FLOOR_SLOT_OFF + 1] << 8));
      for (const [where, got] of [
        ["record@42", fromRec],
        ["slot@608+42", fromSlot],
      ] as const) {
        if (got.code !== code || got.floorAtoms !== rustFloor)
          mismatches.push({ input: `${where} code=${code}`, sdk: `${got.code}/${got.floorAtoms}`, rust: `${code}/${rustFloor}` });
      }
      if (fromSlotOff !== rustFloor) mismatches.push({ input: `slot@650 code=${code}`, sdk: String(fromSlotOff), rust: String(rustFloor) });
    }
    expectNoMismatch(mismatches);
    for (const len of [0, 63, 65, 1024]) expect(() => decodeSeniorFloorRecordP2b(new Uint8Array(len))).toThrow();
  });

  it("(4) halt rule: equity at floor-1 / floor / floor+1 for every code, and against a re-encoded T", () => {
    const mismatches: Mismatch[] = [];
    for (let code = 0; code <= U16_MAX; code++) {
      const floor = rustDecode(code);
      for (const eq of [0n, floor - 1n, floor, floor + 1n]) {
        if (eq < 0n) continue; // u128 equity
        const sdk = seniorCapitalHaltP2b(eq, seniorFloorDecodeP2b(code));
        const rust = rustHaltPath(eq, code);
        if (sdk !== rust) mismatches.push({ input: `code=${code} eq=${eq}`, sdk: String(sdk), rust: String(rust) });
      }
    }
    // The vault halt end-to-end: T -> stored code -> decoded floor -> halt(eq). Because the code is a
    // ceiling, any equity strictly below the TRUE T must halt (never shown as open).
    for (const t of [...seededAtoms(2_000, 0x7a11_0ffn), ...boundaryAtoms()]) {
      if (t > SAT_EDGE) continue;
      const sdkFloor = seniorFloorDecodeP2b(seniorFloorEncodeP2b(t));
      for (const eq of [0n, t - 1n, t, t + 1n, sdkFloor - 1n, sdkFloor]) {
        if (eq < 0n) continue;
        const sdk = seniorCapitalHaltP2b(eq, sdkFloor);
        const rust = rustHaltPath(eq, rustEncode(t));
        if (sdk !== rust) mismatches.push({ input: `T=${t} eq=${eq}`, sdk: String(sdk), rust: String(rust) });
        if (eq < t && !sdk) mismatches.push({ input: `T=${t} eq=${eq}`, sdk: "open", rust: "halt (eq < true T)" });
      }
    }
    expectNoMismatch(mismatches);
    // Rust unit-test anchors.
    expect(seniorCapitalHaltP2b(99n, 100n)).toBe(true);
    expect(seniorCapitalHaltP2b(100n, 100n)).toBe(false);
    expect(seniorCapitalHaltP2b(0n, 0n)).toBe(false);
  });
});
