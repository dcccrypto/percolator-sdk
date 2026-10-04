/**
 * Wrapper error map == rustc. Fixture `test/fixtures/wrapper-errors.json` is generated from the
 * REAL percolator-prog crate by `scripts/wrapper-errors/gen.py` (`PercolatorError::X as u32` for
 * every variant; rustc assigns the numbers). Regenerate whenever the relaunch wrapper moves.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERCOLATOR_ERRORS, decodeError } from "../src/abi/errors.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/wrapper-errors.json", import.meta.url), "utf8")) as {
  prog: string; count: number; errors: Record<string, string>;
};

describe("wrapper error map is generated from the program (rustc discriminants)", () => {
  it("fixture is from the pinned relaunch wrapper", () => {
    expect(FX.prog).toBe("a7c07f3400d0ec727bbacfc123303b0d025d5e3c");
    expect(Object.keys(FX.errors)).toHaveLength(FX.count);
  });
  it("every program code decodes to the program's variant name", () => {
    for (const [code, name] of Object.entries(FX.errors)) expect(decodeError(Number(code))?.name, `code ${code}`).toBe(name);
  });
  it("7a3ac04c appends exactly one code, 91 LpVaultTargetPotImpaired (no existing code shifted)", () => {
    expect(FX.count).toBe(95);
    expect(FX.errors["90"]).toBe("VaultLpBindRequiresFlatAsset");
    expect(FX.errors["91"]).toBe("LpVaultTargetPotImpaired");
    expect(decodeError(91)?.name).toBe("LpVaultTargetPotImpaired");
    expect(decodeError(91)?.hint).toMatch(/deposits paused/);
  });
  it("growth-v19 (a7c07f34) appends exactly 92 GrowthLeverageExceeded, 93 GrowthCapacityFull, 94 GrowthInvalidConfig", () => {
    expect(FX.errors["91"]).toBe("LpVaultTargetPotImpaired");
    expect(FX.errors["92"]).toBe("GrowthLeverageExceeded");
    expect(FX.errors["93"]).toBe("GrowthCapacityFull");
    expect(FX.errors["94"]).toBe("GrowthInvalidConfig");
    expect(decodeError(92)?.hint).toMatch(/Max leverage on this side is lower right now: this market's liquidity is in use/);
    expect(decodeError(93)?.hint).toMatch(/This side is full right now\. Closes and the other side are open\./);
  });
  it("the SDK defines no code the program does not have", () => {
    for (const code of Object.keys(PERCOLATOR_ERRORS)) expect(FX.errors[code], `sdk code ${code}`).toBeDefined();
  });
});
