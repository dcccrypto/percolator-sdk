import { describe, it, expect } from "vitest";
import { V22_LAUNCH_SETTINGS } from "../src/abi/v22-launch-settings.js";

/**
 * Differential check of the launch-settings table against the wrapper's validation on
 * percolator-prog origin/feat/v22-rc23-2026-10-22, src/v16_program.rs:
 *  - 903  MAX_PERMISSIONLESS_RESOLVE_STALE_SLOTS = 6_480_000
 *  - 918  MIN_PERMISSIONLESS_RESOLVE_STALE_SLOTS = 9_000
 *  - 919  MAX_FORCE_CLOSE_DELAY_SLOTS = 10_000_000
 *  - 1126 MAX_LP_REDEMPTION_COOLDOWN_SLOTS = 78_840_000 (CreateLpVault bound, line 31972)
 *  - 1136 MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS = 150 (InitVaultLp bind, line 38041)
 *  - 29232-29235 ConfigurePermissionlessResolve (tag 38) rejects stale_slots outside [MIN, MAX].
 * The SDK file is a constants table only (no encoder/decoder), so the property is: every table
 * value is accepted by the program predicates, and the program predicates refuse min-1 / max+1.
 */
const MIN_STALE = 9_000;
const MAX_STALE = 6_480_000;
const MIN_BOUND_COOLDOWN = 150;
const MAX_LP_COOLDOWN = 78_840_000;

const progAcceptsStale = (s: number) => s >= MIN_STALE && s <= MAX_STALE;
const progAcceptsEarnCooldown = (c: number) => c <= MAX_LP_COOLDOWN && c >= MIN_BOUND_COOLDOWN;

describe("launch settings vs percolator-prog rc23 bounds", () => {
  for (const cls of ["major", "meme"] as const) {
    const row = V22_LAUNCH_SETTINGS[cls];
    it(`${cls}: stale window is an accepted tag-38 value`, () => {
      expect(Number.isInteger(row.staleWindowSlots)).toBe(true);
      expect(progAcceptsStale(row.staleWindowSlots)).toBe(true);
    });
    it(`${cls}: earn redemption cooldown passes CreateLpVault + InitVaultLp bounds`, () => {
      expect(progAcceptsEarnCooldown(row.earnRedemptionCooldownSlots)).toBe(true);
    });
    it(`${cls}: values fit u64 (no precision loss as JS numbers)`, () => {
      for (const v of [row.staleWindowSlots, row.stakeCooldownSlots, row.earnRedemptionCooldownSlots]) {
        expect(Number.isSafeInteger(v) && v >= 0).toBe(true);
      }
    });
  }

  it("program stale bound edges: min-1 refused, min/max accepted, max+1 refused", () => {
    expect(progAcceptsStale(MIN_STALE - 1)).toBe(false);
    expect(progAcceptsStale(MIN_STALE)).toBe(true);
    expect(progAcceptsStale(MAX_STALE)).toBe(true);
    expect(progAcceptsStale(MAX_STALE + 1)).toBe(false);
  });

  it("program earn cooldown edges: 149 refused at bind, 150 accepted, max+1 refused", () => {
    expect(progAcceptsEarnCooldown(MIN_BOUND_COOLDOWN - 1)).toBe(false);
    expect(progAcceptsEarnCooldown(MIN_BOUND_COOLDOWN)).toBe(true);
    expect(progAcceptsEarnCooldown(MAX_LP_COOLDOWN)).toBe(true);
    expect(progAcceptsEarnCooldown(MAX_LP_COOLDOWN + 1)).toBe(false);
  });

  it("the table sits exactly on the earn floor (a lower edit would be refused on-chain)", () => {
    expect(V22_LAUNCH_SETTINGS.major.earnRedemptionCooldownSlots).toBe(MIN_BOUND_COOLDOWN);
    expect(V22_LAUNCH_SETTINGS.meme.earnRedemptionCooldownSlots).toBe(MIN_BOUND_COOLDOWN);
  });
});
