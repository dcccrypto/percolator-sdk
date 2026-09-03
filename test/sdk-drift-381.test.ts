import { describe, it, expect } from "vitest";
import {
  CrankAction,
  ACCOUNTS_CLOSE_SLAB,
  ACCOUNTS_CLOSE_SLAB_SECONDARY,
} from "../src/index.js";

/**
 * GH#381 — SDK drift against the deployed wrapper.
 *
 * Both of these were verified by reading `percolator-prog/src/v16_program.rs`,
 * not by trusting the SDK's own comments — which is the point of the issue, since
 * the comments were the thing that had drifted.
 */

describe("CrankAction matches the program's decoder (GH#381)", () => {
  it("has all THREE actions — SettleB was missing entirely", () => {
    // v16_program.rs:
    //   0 => PermissionlessCrankActionV16::Refresh
    //   1 => PermissionlessCrankActionV16::Liquidate(..)
    //   2 => PermissionlessCrankActionV16::SettleB { .. }
    //
    // Omitting 2 did not mislabel anything — it hid the action's existence, so a
    // keeper reading this enum would conclude the crank had two modes and never
    // call the permissionless bankrupt-settlement path.
    expect(CrankAction.Refresh).toBe(0);
    expect(CrankAction.Liquidate).toBe(1);
    expect(CrankAction.SettleB).toBe(2);
  });

  it("keeps FeeSweep as an alias for 0 so existing callers still work", () => {
    // The program calls action 0 `Refresh`. `FeeSweep` was the SDK's own name and
    // is retained rather than removed — renaming it would have been a silent
    // breaking change for a doc fix.
    expect(CrankAction.FeeSweep).toBe(CrankAction.Refresh);
  });
});

describe("CloseSlab account templates match the program (GH#381)", () => {
  it("the base template is the six accounts the program always reads", () => {
    expect(ACCOUNTS_CLOSE_SLAB).toHaveLength(6);
    expect(ACCOUNTS_CLOSE_SLAB.map((a) => a.name)).toEqual([
      "dest",
      "slab",
      "vault",
      "vaultAuthority",
      "destAta",
      "tokenProgram",
    ]);
  });

  it("a secondary-collateral market needs EIGHT — the missing two are the bug", () => {
    // handle_close_slab reads accounts 6 and 7 whenever
    // `cfg.secondary_collateral_mint != [0u8; 32]`. With only six, closing such a
    // market fails with NotEnoughAccountKeys — and only for markets that have
    // used UpdateBaseUnitMints (tag 60), which is why it went unnoticed.
    expect(ACCOUNTS_CLOSE_SLAB_SECONDARY).toHaveLength(8);
    expect(ACCOUNTS_CLOSE_SLAB_SECONDARY[6]?.name).toBe("secondaryVault");
    expect(ACCOUNTS_CLOSE_SLAB_SECONDARY[7]?.name).toBe("secondaryDestAta");
  });

  it("both extra accounts are WRITABLE — the program expect_writable's them", () => {
    // `expect_writable(secondary_vault_token)` / `expect_writable(secondary_dest_token)`.
    // A read-only meta here would fail at runtime, not at build time.
    expect(ACCOUNTS_CLOSE_SLAB_SECONDARY[6]?.writable).toBe(true);
    expect(ACCOUNTS_CLOSE_SLAB_SECONDARY[7]?.writable).toBe(true);
  });

  it("the secondary template is a strict extension of the base one", () => {
    // The first six must stay identical — the program reads the same accounts in
    // the same order and only then looks for 6 and 7.
    expect(ACCOUNTS_CLOSE_SLAB_SECONDARY.slice(0, 6)).toEqual(ACCOUNTS_CLOSE_SLAB);
  });
});
