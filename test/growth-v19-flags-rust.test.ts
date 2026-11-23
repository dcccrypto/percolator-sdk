/**
 * `growthFlagsOk` vs `growth_v19::growth_flags_ok` at percolator-prog feat/v22-rc23-2026-10-22 bc657392
 * (src/growth_v19.rs, read with `git show`, no cargo):
 *
 * ```rust
 * pub const GROWTH_FLAG_LEV_GUARD: u8 = 0x04; // set once by tag 124 op 0, never cleared
 * pub fn growth_flags_ok(flags: u8) -> bool {
 *     flags & !(GROWTH_FLAG_R3_LAYOUT | GROWTH_FLAG_VOL_DATA | GROWTH_FLAG_LEV_GUARD) == 0
 *         && (flags & GROWTH_FLAG_VOL_DATA == 0 || flags & GROWTH_FLAG_R3_LAYOUT != 0)
 * }
 * ```
 *
 * `asset_growth_from_wrapper_bytes` refuses the whole record when this is false, and tag 124 op 0 writes
 * `g.flags |= GROWTH_FLAG_LEV_GUARD` (v16_program.rs), so every growth asset with a bound leverage guard
 * carries bit 2. The SDK port accepted bits 0-1 only and called those records invalid.
 */
import { describe, it, expect } from "vitest";
import { growthFlagsOk, decodeAssetGrowthRecordV19, ASSET_GROWTH_LEN, ASSET_GROWTH_FIELD_OFF } from "../src/abi/growth-v19.js";
import { GROWTH_FLAG_LEV_GUARD_V22 } from "../src/abi/lev-guard-limits-v22.js";

/** Literal transcription of the Rust validator above. */
function rustGrowthFlagsOk(f: number): boolean {
  return (f & ~(0x01 | 0x02 | 0x04) & 0xff) === 0 && ((f & 0x02) === 0 || (f & 0x01) !== 0);
}

describe("growthFlagsOk vs prog bc657392 growth_flags_ok", () => {
  it("agrees with Rust on every byte value 0..=255", () => {
    const mismatches: number[] = [];
    for (let f = 0; f <= 0xff; f++) if (growthFlagsOk(f) !== rustGrowthFlagsOk(f)) mismatches.push(f);
    expect(mismatches).toEqual([]);
  });

  it("accepts the leverage-guard bit tag 124 sets (alone, with R3, with R3 + VOL)", () => {
    expect(GROWTH_FLAG_LEV_GUARD_V22).toBe(0x04);
    expect([0x04, 0x05, 0x07].map(growthFlagsOk)).toEqual([true, true, true]);
    // still refused: VOL without R3 (with or without the guard), and any bit above 2
    expect([0x02, 0x06, 0x08, 0x0c, 0x80].map(growthFlagsOk)).toEqual([false, false, false, false, false]);
  });

  it("a guarded R3 record (flags 0x05) decodes with the guard bit kept and passes the validator", () => {
    const rec = new Uint8Array(ASSET_GROWTH_LEN);
    rec[ASSET_GROWTH_FIELD_OFF.version] = 1;
    rec[ASSET_GROWTH_FIELD_OFF.flags] = 0x05;
    const g = decodeAssetGrowthRecordV19(rec)!;
    expect(g.flags).toBe(0x05);
    expect(g.r3Layout).toBe(true);
    expect(g.volHasData).toBe(false);
    expect(growthFlagsOk(g.flags)).toBe(true);
  });
});
