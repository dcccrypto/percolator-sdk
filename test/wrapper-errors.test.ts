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
    expect(FX.prog).toBe("5e4c15ff66a4176cf9b0204ef35aef6df058f018");
    expect(Object.keys(FX.errors)).toHaveLength(FX.count);
  });
  it("every program code decodes to the program's variant name", () => {
    for (const [code, name] of Object.entries(FX.errors)) expect(decodeError(Number(code))?.name, `code ${code}`).toBe(name);
  });
  it("the SDK defines no code the program does not have", () => {
    for (const code of Object.keys(PERCOLATOR_ERRORS)) expect(FX.errors[code], `sdk code ${code}`).toBeDefined();
  });
});
