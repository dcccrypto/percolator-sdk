import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as sdk from "../src/index.js";
import {
  V22_LAUNCH_SETTINGS,
  V22_MAJOR_MINTS,
  V22_STAKE_POOL_MODE_FEE_ONLY,
  classifyV22Asset,
  v22LaunchSettings,
} from "../src/abi/v22-launch-settings.js";

const SOL = "So11111111111111111111111111111111111111112";
const CBBTC = "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij";
const PERCOLATOR = "8PzFWyLpCVEmbZmVJcaRTU5r69XKJx1rd7YGpWvnpump";

describe("D7: one launch-settings table keyed by asset class", () => {
  it("stale window (tag 38): 18,000 slots majors, 54,000 memes", () => {
    expect(V22_LAUNCH_SETTINGS.major.staleWindowSlots).toBe(18_000);
    expect(V22_LAUNCH_SETTINGS.meme.staleWindowSlots).toBe(54_000);
  });

  it("stake cooldown is 150 everywhere", () => {
    expect(V22_LAUNCH_SETTINGS.major.stakeCooldownSlots).toBe(150);
    expect(V22_LAUNCH_SETTINGS.meme.stakeCooldownSlots).toBe(150);
  });

  it("stake pool mode is FEE_ONLY = 2 (stake state.rs: 1 = FIRST_LOSS, 2 = FEE_ONLY)", () => {
    expect(V22_STAKE_POOL_MODE_FEE_ONLY).toBe(2);
    expect(V22_LAUNCH_SETTINGS.major.stakePoolMode).toBe(2);
    expect(V22_LAUNCH_SETTINGS.meme.stakePoolMode).toBe(2);
  });

  it("Earn redemption cooldown is 150 (D22 program floor)", () => {
    expect(V22_LAUNCH_SETTINGS.major.earnRedemptionCooldownSlots).toBe(150);
    expect(V22_LAUNCH_SETTINGS.meme.earnRedemptionCooldownSlots).toBe(150);
  });

  it("only decided settings are in the table (no insurance / senior seed / holding fee / bond)", () => {
    for (const cls of ["major", "meme"] as const) {
      expect(Object.keys(V22_LAUNCH_SETTINGS[cls]).sort()).toEqual([
        "earnRedemptionCooldownSlots",
        "stakeCooldownSlots",
        "stakePoolMode",
        "staleWindowSlots",
      ]);
    }
    expect(Object.keys(V22_LAUNCH_SETTINGS).sort()).toEqual(["major", "meme"]);
  });

  it("table, entries and the majors list are deeply frozen", () => {
    expect(Object.isFrozen(V22_LAUNCH_SETTINGS)).toBe(true);
    expect(Object.isFrozen(V22_LAUNCH_SETTINGS.major)).toBe(true);
    expect(Object.isFrozen(V22_LAUNCH_SETTINGS.meme)).toBe(true);
    expect(Object.isFrozen(V22_MAJOR_MINTS)).toBe(true);
    expect(() => {
      (V22_LAUNCH_SETTINGS.meme as { staleWindowSlots: number }).staleWindowSlots = 1;
    }).toThrow();
  });

  it("v22LaunchSettings(cls) returns the table entry", () => {
    expect(v22LaunchSettings("major")).toBe(V22_LAUNCH_SETTINGS.major);
    expect(v22LaunchSettings("meme")).toBe(V22_LAUNCH_SETTINGS.meme);
  });

  it("classifyV22Asset: SOL/wSOL and cbBTC are majors; everything else is a meme", () => {
    expect(classifyV22Asset(SOL)).toBe("major");
    expect(classifyV22Asset(CBBTC)).toBe("major");
    expect(classifyV22Asset(PERCOLATOR)).toBe("meme");
    expect(classifyV22Asset("11111111111111111111111111111111")).toBe("meme");
    expect(classifyV22Asset("")).toBe("meme");
    expect(classifyV22Asset("not-a-mint")).toBe("meme");
  });

  it("the majors list is small and explicit", () => {
    expect([...V22_MAJOR_MINTS]).toEqual([SOL, CBBTC]);
  });

  it("is exported from the package index", () => {
    expect(sdk.V22_LAUNCH_SETTINGS).toBe(V22_LAUNCH_SETTINGS);
    expect(sdk.v22LaunchSettings).toBe(v22LaunchSettings);
    expect(sdk.classifyV22Asset).toBe(classifyV22Asset);
    expect(sdk.V22_MAJOR_MINTS).toBe(V22_MAJOR_MINTS);
  });

  it("the file has no runtime imports, so the app can vendor it byte-for-byte", () => {
    const p = fileURLToPath(new URL("../src/abi/v22-launch-settings.ts", import.meta.url));
    const src = readFileSync(p, "utf8");
    expect(src).not.toMatch(/^\s*import\s+(?!type\b)/m);
    expect(src).not.toMatch(/\brequire\(/);
  });

  it("vendoring hash is pinned (the seed kit and the app pin the same sha256)", () => {
    const p = fileURLToPath(new URL("../src/abi/v22-launch-settings.ts", import.meta.url));
    const h = createHash("sha256").update(readFileSync(p)).digest("hex");
    expect(h).toBe("a3495455370b94be4726b7c3e6dc245f382f795e8564f872185b17207ad9b9bc");
  });
});
