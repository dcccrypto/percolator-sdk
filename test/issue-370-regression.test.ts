import { describe, expect, it } from "vitest";

describe("#370 — maxAccountIndex must never exceed the layout's own maxAccounts", () => {
  // The region after `accountsOff` is NOT solely the accounts array: on the
  // v12.19 layout it also carries RISK_BUF (160 B) and the per-account
  // generation table (N x 8 B). Dividing all of it by `accountSize`
  // over-reports by 6 slots on every tier, and parseAccount() then decodes
  // trailing non-account bytes as a phantom account (owner + capital included).
  //
  // Sizes pinned from V12_19_SIZES (slab.ts:968) — it is not exported, and this
  // test deliberately does not widen the public API to reach it.
  const V12_19 = [
    [26872, 64],
    [96784, 256],
    [376432, 1024],
    [1495024, 4096],
  ] as const;

  it("is bounded by layout.maxAccounts on every v12.19 tier", async () => {
    const { detectSlabLayout, maxAccountIndex } = await import("../src/solana/slab");
    let checked = 0;
    for (const [dataLen, expectedMax] of V12_19) {
      const layout = detectSlabLayout(dataLen);
      if (!layout) continue;
      checked++;
      expect(layout.maxAccounts).toBe(expectedMax);
      expect(maxAccountIndex(dataLen)).toBeLessThanOrEqual(layout.maxAccounts);
    }
    // Non-vacuity: the loop must actually have exercised every tier.
    expect(checked).toBe(V12_19.length);
  });
});
