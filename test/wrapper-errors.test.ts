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

describe("v2.2 codes 125-127 (G9 timelock, P-1 position cap)", () => {
  it("decode to the wrapper's names with plain hints", () => {
    expect(decodeError(125)?.name).toBe("G9AllowlistTimelock");
    expect(decodeError(126)?.name).toBe("PositionCapReached");
    expect(decodeError(126)?.hint).toBe("This account already holds the maximum number of positions on this market. Close one first.");
    expect(decodeError(127)?.name).toBe("CounterpartyPositionCapReached");
    expect(decodeError(127)?.hint).toMatch(/not caused by your account/);
    expect(FX.errors["126"]).toBe("PositionCapReached");
    expect(FX.errors["127"]).toBe("CounterpartyPositionCapReached");
  });
  it("negative control: a bare 9 still decodes to InvalidInstruction and 136 is unknown", () => {
    expect(decodeError(9)?.name).toBe("InvalidInstruction");
    expect(decodeError(136)).toBeUndefined();
    expect(decodeError(126)?.hint).not.toBe(decodeError(127)?.hint);
  });
});

describe("v2.2 growth code 128 DepthInputInvalid (PushAuthMark depth_mode other than 0 / 1)", () => {
  it("decodes to the wrapper's name with a plain one-line hint", () => {
    expect(decodeError(128)?.name).toBe("DepthInputInvalid");
    expect(decodeError(128)?.hint).toBe("The price update carried an invalid liquidity reading.");
    expect(FX.errors["128"]).toBe("DepthInputInvalid");
  });
  it("negative control: 127 keeps its name, 136 is unknown", () => {
    expect(decodeError(127)?.name).toBe("CounterpartyPositionCapReached");
    expect(decodeError(136)).toBeUndefined();
  });
});

describe("wrapper error map is generated from the program (rustc discriminants)", () => {
  it("fixture is from the pinned relaunch wrapper", () => {
    expect(FX.prog).toBe("c8501d153ed1a7bd9b1bc3343b89f47096838ead"); // v2.2 variant B launch candidate (release/v22-wrapper-rem): Waves A-D + K/F remainders
    expect(Object.keys(FX.errors)).toHaveLength(FX.count);
  });
  it("every program code decodes to the program's variant name", () => {
    for (const [code, name] of Object.entries(FX.errors)) expect(decodeError(Number(code))?.name, `code ${code}`).toBe(name);
  });
  it("7a3ac04c appends exactly one code, 91 LpVaultTargetPotImpaired (no existing code shifted)", () => {
    expect(FX.count).toBe(129); // 0..128 (125..127 added with the P-1 devnet build, 128 DepthInputInvalid with v2.2 growth G8): 0..103, the v2.2 Phase 4 block 104..119, the P2b lock-exit block 120..122, 123..124
    expect(FX.errors["90"]).toBe("VaultLpBindRequiresFlatAsset");
    expect(FX.errors["91"]).toBe("LpVaultTargetPotImpaired");
    expect(decodeError(91)?.name).toBe("LpVaultTargetPotImpaired");
    expect(decodeError(91)?.hint).toMatch(/deposits paused/);
  });
  it("growth-v19 (e8e5f399) appends exactly 92 GrowthLeverageExceeded, 93 GrowthCapacityFull, 94 GrowthInvalidConfig, 95 GrowthNeedsLpCounterparty", () => {
    expect(FX.errors["91"]).toBe("LpVaultTargetPotImpaired");
    expect(FX.errors["92"]).toBe("GrowthLeverageExceeded");
    expect(FX.errors["93"]).toBe("GrowthCapacityFull");
    expect(FX.errors["94"]).toBe("GrowthInvalidConfig");
    expect(FX.errors["95"]).toBe("GrowthNeedsLpCounterparty");
    expect(decodeError(95)?.hint).toMatch(/^Open against the market maker: trade through the book\./);
    expect(decodeError(92)?.hint).toMatch(/^Max leverage on this side is lower right now: this market's liquidity is in use\. Reducing or closing is always allowed\./);
    expect(decodeError(93)?.hint).toMatch(/^New positions on this side are paused: the market's capacity is full\. Reducing or closing your position is always allowed\./);
  });
  it("growth-v19 N-1 / L-6 (re-verification) append exactly 96 GrowthBatchTooManyLegs and 97 GrowthRequiresBoundVaultLp", () => {
    expect(FX.errors["96"]).toBe("GrowthBatchTooManyLegs");
    expect(FX.errors["97"]).toBe("GrowthRequiresBoundVaultLp");
    expect(FX.errors["98"]).toBe("GrowthUtilisationFeeNotCovered");
    expect(FX.errors["99"]).toBe("GrowthUtilisationFeeRequiresTradeCpi");
    expect(decodeError(97)?.hint).toMatch(/^This market is not open for new positions\. Reducing or closing is always allowed\./);
    expect(decodeError(96)?.hint).toMatch(/^Split this order into batches of at most 10 markets\./);
  });
  it("P2b E7 (#525) adds exactly the explicit block 120 EngineAdlReduceOnly, 121 EngineLossStale, 122 EarnExitWouldUnderBackClaims", () => {
    expect(FX.errors["120"]).toBe("EngineAdlReduceOnly");
    expect(FX.errors["121"]).toBe("EngineLossStale");
    expect(FX.errors["122"]).toBe("EarnExitWouldUnderBackClaims");
    expect(FX.errors["129"]).toBeUndefined();
    expect(decodeError(120)?.hint).toMatch(/^This market is close-only while it rebalances/);
  });
  it("P2b Earn allocation (#526) adds exactly the explicit block 100 VaultLpAllocateRefused, 101 VaultLpCapacityLocked, 102 VaultLpCreatorFeeVesting, 103 VaultLpSeniorCapitalHalt", () => {
    expect(FX.errors["100"]).toBe("VaultLpAllocateRefused");
    expect(FX.errors["101"]).toBe("VaultLpCapacityLocked");
    expect(FX.errors["102"]).toBe("VaultLpCreatorFeeVesting");
    expect(FX.errors["103"]).toBe("VaultLpSeniorCapitalHalt");
    // the copy for 103 is pinned verbatim as its first sentence (app surfaces it)
    expect(decodeError(103)?.hint).toMatch(/^This side is paused while the market's first-loss capital is rebuilt; closing is always allowed\./);
    expect(decodeError(100)?.hint).toMatch(/skip/);
  });
  it("the SDK defines no code the program does not have", () => {
    for (const code of Object.keys(PERCOLATOR_ERRORS)) expect(FX.errors[code], `sdk code ${code}`).toBeDefined();
  });
});

describe("v2.2 codes 129-135 (depth source, tier config, leverage guard)", () => {
  it("names match the program enum discriminants", () => {
    const names: Record<number, string> = {
      129: "DepthSourceInvalid", 130: "GrowthTierConfigInvalid", 131: "CreatorStakeBelowMinimum", 132: "LevGuardRequired",
      133: "LevGuardRefused", 134: "LevGuardInvalid", 135: "LpStopNotTriggered",
    };
    for (const [code, name] of Object.entries(names)) {
      expect(decodeError(Number(code))?.name).toBe(name);
      expect(decodeError(Number(code))?.hint.length).toBeGreaterThan(10);
    }
    expect(decodeError(136)).toBeUndefined();
  });
});
