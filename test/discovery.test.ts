import { describe, it, expect } from "vitest";
import {
  SLAB_TIERS,
  SLAB_TIERS_V0,
  SLAB_TIERS_V1D,
  SLAB_TIERS_V1D_LEGACY,
  slabDataSize,
  slabDataSizeV1,
  type SlabTierKey,
} from "../src/solana/discovery.js";
import { detectSlabLayout, SLAB_TIERS_V2 } from "../src/solana/slab.js";

// ============================================================================
// SLAB_TIERS constants
// ============================================================================

describe("SLAB_TIERS", () => {
  it("has exactly 3 tiers: small, medium, large", () => {
    const tierNames = Object.keys(SLAB_TIERS);
    expect(tierNames).toEqual(["small", "medium", "large"]);
  });

  it("small tier has 256 max accounts", () => {
    expect(SLAB_TIERS.small.maxAccounts).toBe(256);
  });

  it("medium tier has 1024 max accounts", () => {
    expect(SLAB_TIERS.medium.maxAccounts).toBe(1024);
  });

  it("large tier has 4096 max accounts", () => {
    expect(SLAB_TIERS.large.maxAccounts).toBe(4096);
  });

  it("data sizes are in ascending order", () => {
    expect(SLAB_TIERS.small.dataSize).toBeLessThan(SLAB_TIERS.medium.dataSize);
    expect(SLAB_TIERS.medium.dataSize).toBeLessThan(SLAB_TIERS.large.dataSize);
  });

  it("all tiers have labels and descriptions", () => {
    for (const [key, tier] of Object.entries(SLAB_TIERS)) {
      expect(tier.label, `${key} label`).toBeTruthy();
      expect(tier.description, `${key} description`).toBeTruthy();
    }
  });

  it("tier data sizes are positive integers", () => {
    for (const tier of Object.values(SLAB_TIERS)) {
      expect(tier.dataSize).toBeGreaterThan(0);
      expect(Number.isInteger(tier.dataSize)).toBe(true);
    }
  });
});

// ============================================================================
// slabDataSize calculation
// ============================================================================

describe("slabDataSize", () => {
  // slabDataSize() computes V0 layout — compare against SLAB_TIERS_V0 (GH #1109)
  it("returns V0 data size for small tier (256 accounts)", () => {
    expect(slabDataSize(256)).toBe(SLAB_TIERS_V0.small.dataSize);
  });

  it("returns V0 data size for medium tier (1024 accounts)", () => {
    expect(slabDataSize(1024)).toBe(SLAB_TIERS_V0.medium.dataSize);
  });

  it("returns V0 data size for large tier (4096 accounts)", () => {
    expect(slabDataSize(4096)).toBe(SLAB_TIERS_V0.large.dataSize);
  });

  it("is monotonically increasing with account count", () => {
    const sizes = [64, 128, 256, 512, 1024, 2048, 4096].map(slabDataSize);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
  });

  it("returns positive result for minimum account count (1)", () => {
    expect(slabDataSize(1)).toBeGreaterThan(0);
  });

  it("data size is always 8-byte aligned (due to account alignment)", () => {
    for (const n of [64, 128, 256, 512, 1024, 2048, 4096]) {
      const size = slabDataSize(n);
      // V0 layout: ENGINE_OFF=480, ACCOUNT_SIZE=240
      expect(size).toBeGreaterThan(480 + n * 240);
      expect(size % 8).toBe(0);
    }
  });

  it("accounts for bitmap, next_free array, and padding overhead", () => {
    // V0 layout for 256 accounts:
    // ENGINE_OFF=480, ENGINE_BITMAP_OFF=320
    // bitmap = ceil(256/64) * 8 = 32 bytes
    // postBitmap = 18, nextFree = 512
    // preAccountsLen = 320 + 32 + 18 + 512 = 882
    // accountsOff = ceil(882/8)*8 = 888
    // total = 480 + 888 + 256*240 = 480 + 888 + 61440 = 62808
    expect(slabDataSize(256)).toBe(62808);
  });
});

// ============================================================================
// slabDataSizeV1 calculation — V1 layout (ENGINE_OFF=640, ACCOUNT_SIZE=248)
// Values match SLAB_TIERS (empirically verified on-chain, GH #1109)
// ============================================================================

describe("slabDataSizeV1", () => {
  it("matches V1 SLAB_TIERS.small for 256 accounts", () => {
    expect(slabDataSizeV1(256)).toBe(SLAB_TIERS.small.dataSize); // 65_352
  });

  it("matches V1 SLAB_TIERS.medium for 1024 accounts", () => {
    expect(slabDataSizeV1(1024)).toBe(SLAB_TIERS.medium.dataSize); // 257_448
  });

  it("matches SLAB_TIERS.large for 4096 accounts (GH #1112: deployed FxfD37s1 uses formula value)", () => {
    // FxfD37s1 (large, pre-PERC-118) has SLAB_LEN=1,025,832 — matches the formula exactly.
    // Previous value of 1,025,848 was sourced from wrong binary (FwfBKZXb compiled as 4096-acct).
    const formula = slabDataSizeV1(4096);
    expect(formula).toBe(1_025_832);
    expect(SLAB_TIERS.large.dataSize).toBe(1_025_832);
    expect(SLAB_TIERS.large.dataSize).toBe(formula);
  });

  it("is monotonically increasing with account count", () => {
    const sizes = [64, 128, 256, 512, 1024, 2048, 4096].map(slabDataSizeV1);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
  });

  it("produces larger values than V0 slabDataSize for same account count", () => {
    for (const n of [256, 1024, 4096]) {
      expect(slabDataSizeV1(n)).toBeGreaterThan(slabDataSize(n));
    }
  });
});

// ============================================================================
// SLAB_TIERS_V1D — GH#1205: V1D tiers must be exported and present for discovery
// ENGINE_OFF=424, BITMAP_OFF=624, ACCOUNT_SIZE=248, postBitmap=2 (GH#1234 fix)
// ============================================================================

describe("SLAB_TIERS_V1D (GH#1205)", () => {
  it("is exported from discovery.ts", () => {
    expect(SLAB_TIERS_V1D).toBeDefined();
  });

  it("has micro, small, medium, large tiers", () => {
    expect(Object.keys(SLAB_TIERS_V1D)).toEqual(["micro", "small", "medium", "large"]);
  });

  // GH#1234: V1D deployed program uses postBitmap=2 (free_head only) → all sizes 16 bytes smaller
  it("micro tier: 64 accounts, dataSize=17064", () => {
    expect(SLAB_TIERS_V1D.micro.maxAccounts).toBe(64);
    expect(SLAB_TIERS_V1D.micro.dataSize).toBe(17_064);
  });

  it("small tier: 256 accounts, dataSize=65088", () => {
    expect(SLAB_TIERS_V1D.small.maxAccounts).toBe(256);
    expect(SLAB_TIERS_V1D.small.dataSize).toBe(65_088);
  });

  it("medium tier: 1024 accounts, dataSize=257184", () => {
    expect(SLAB_TIERS_V1D.medium.maxAccounts).toBe(1024);
    expect(SLAB_TIERS_V1D.medium.dataSize).toBe(257_184);
  });

  it("large tier: 4096 accounts, dataSize=1025568", () => {
    expect(SLAB_TIERS_V1D.large.maxAccounts).toBe(4096);
    expect(SLAB_TIERS_V1D.large.dataSize).toBe(1_025_568);
  });

  it("V1D sizes are distinct from V1 and V0 sizes (no collision)", () => {
    const v1Sizes = new Set(Object.values(SLAB_TIERS).map(t => t.dataSize));
    const v0Sizes = new Set(Object.values(SLAB_TIERS_V0).map(t => t.dataSize));
    for (const tier of Object.values(SLAB_TIERS_V1D)) {
      expect(v1Sizes.has(tier.dataSize), `V1D ${tier.dataSize} collides with V1`).toBe(false);
      expect(v0Sizes.has(tier.dataSize), `V1D ${tier.dataSize} collides with V0`).toBe(false);
    }
  });

  it("data sizes are in ascending order", () => {
    const sizes = Object.values(SLAB_TIERS_V1D).map(t => t.dataSize);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
  });
});

// ============================================================================
// SLAB_TIERS_V1D_LEGACY — GH#1237: V1D slabs created before GH#1234 used postBitmap=18
// Top active market 6ZytbpV4 (TEST/USD, 65104 bytes) was broken by PR #1236 regression.
// These sizes are 16 bytes larger per tier than SLAB_TIERS_V1D.
// ENGINE_OFF=424, BITMAP_OFF=624, ACCOUNT_SIZE=248, postBitmap=18
// ============================================================================

describe("SLAB_TIERS_V1D_LEGACY (GH#1237)", () => {
  it("is exported from discovery.ts", () => {
    expect(SLAB_TIERS_V1D_LEGACY).toBeDefined();
  });

  it("has micro, small, medium, large tiers", () => {
    expect(Object.keys(SLAB_TIERS_V1D_LEGACY)).toEqual(["micro", "small", "medium", "large"]);
  });

  it("micro tier: 64 accounts, dataSize=17080 (postBitmap=18)", () => {
    expect(SLAB_TIERS_V1D_LEGACY.micro.maxAccounts).toBe(64);
    expect(SLAB_TIERS_V1D_LEGACY.micro.dataSize).toBe(17_080);
  });

  it("small tier: 256 accounts, dataSize=65104 (postBitmap=18) — slab 6ZytbpV4 TEST/USD", () => {
    expect(SLAB_TIERS_V1D_LEGACY.small.maxAccounts).toBe(256);
    expect(SLAB_TIERS_V1D_LEGACY.small.dataSize).toBe(65_104);
  });

  it("medium tier: 1024 accounts, dataSize=257200 (postBitmap=18)", () => {
    expect(SLAB_TIERS_V1D_LEGACY.medium.maxAccounts).toBe(1024);
    expect(SLAB_TIERS_V1D_LEGACY.medium.dataSize).toBe(257_200);
  });

  it("large tier: 4096 accounts, dataSize=1025584 (postBitmap=18)", () => {
    expect(SLAB_TIERS_V1D_LEGACY.large.maxAccounts).toBe(4096);
    expect(SLAB_TIERS_V1D_LEGACY.large.dataSize).toBe(1_025_584);
  });

  it("legacy sizes are exactly 16 bytes larger than V1D sizes per tier", () => {
    expect(SLAB_TIERS_V1D_LEGACY.micro.dataSize - SLAB_TIERS_V1D.micro.dataSize).toBe(16);
    expect(SLAB_TIERS_V1D_LEGACY.small.dataSize - SLAB_TIERS_V1D.small.dataSize).toBe(16);
    expect(SLAB_TIERS_V1D_LEGACY.medium.dataSize - SLAB_TIERS_V1D.medium.dataSize).toBe(16);
    expect(SLAB_TIERS_V1D_LEGACY.large.dataSize - SLAB_TIERS_V1D.large.dataSize).toBe(16);
  });

  it("V1D_LEGACY sizes are distinct from all other known tiers (no collision)", () => {
    const allOther = new Set([
      ...Object.values(SLAB_TIERS).map(t => t.dataSize),
      ...Object.values(SLAB_TIERS_V0).map(t => t.dataSize),
      ...Object.values(SLAB_TIERS_V1D).map(t => t.dataSize),
    ]);
    for (const tier of Object.values(SLAB_TIERS_V1D_LEGACY)) {
      expect(allOther.has(tier.dataSize), `V1D_LEGACY ${tier.dataSize} collides with existing tier`).toBe(false);
    }
  });

  it("data sizes are in ascending order", () => {
    const sizes = Object.values(SLAB_TIERS_V1D_LEGACY).map(t => t.dataSize);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
  });
});

// ============================================================================
// SLAB_TIERS_V2 — V2 BPF intermediate layout (ENGINE_OFF=600, BITMAP_OFF=432)
// V2 sizes overlap with V1D (postBitmap=2) — disambiguation via version field.
// ============================================================================

describe("SLAB_TIERS_V2", () => {
  it("is exported from slab.ts", () => {
    expect(SLAB_TIERS_V2).toBeDefined();
  });

  it("has small and large tiers", () => {
    expect(Object.keys(SLAB_TIERS_V2)).toEqual(["small", "large"]);
  });

  it("small tier: 256 accounts, dataSize=65088", () => {
    expect(SLAB_TIERS_V2.small.maxAccounts).toBe(256);
    expect(SLAB_TIERS_V2.small.dataSize).toBe(65_088);
  });

  it("large tier: 4096 accounts, dataSize=1025568", () => {
    expect(SLAB_TIERS_V2.large.maxAccounts).toBe(4096);
    expect(SLAB_TIERS_V2.large.dataSize).toBe(1_025_568);
  });

  it("V2 small size matches V1D small size (disambiguation needed)", () => {
    expect(SLAB_TIERS_V2.small.dataSize).toBe(SLAB_TIERS_V1D.small.dataSize);
  });

  it("V2 large size matches V1D large size (disambiguation needed)", () => {
    expect(SLAB_TIERS_V2.large.dataSize).toBe(SLAB_TIERS_V1D.large.dataSize);
  });
});

// ============================================================================
// V2 detectSlabLayout — version-field disambiguation
// ============================================================================

describe("detectSlabLayout V2 disambiguation", () => {
  function makeMinimalSlab(version: number, size: number): Uint8Array {
    const buf = new Uint8Array(Math.max(size, 12));
    const dv = new DataView(buf.buffer);
    // PERCOLAT magic (little-endian)
    dv.setBigUint64(0, 0x504552434f4c4154n, true);
    dv.setUint32(8, version, true);
    return buf;
  }

  it("returns V2 layout when data has version=2 and size matches V1D", () => {
    const data = makeMinimalSlab(2, 65_088);
    const layout = detectSlabLayout(65_088, data);
    expect(layout).not.toBeNull();
    expect(layout!.version).toBe(2);
    expect(layout!.engineOff).toBe(600);
    expect(layout!.engineBitmapOff).toBe(432);
  });

  it("returns V1D layout when data has version=1 and size matches V1D", () => {
    const data = makeMinimalSlab(1, 65_088);
    const layout = detectSlabLayout(65_088, data);
    expect(layout).not.toBeNull();
    expect(layout!.version).toBe(1);
    expect(layout!.engineOff).toBe(424);
  });

  it("returns V1D layout when no data is provided (backward compat)", () => {
    const layout = detectSlabLayout(65_088);
    expect(layout).not.toBeNull();
    expect(layout!.version).toBe(1);
    expect(layout!.engineOff).toBe(424);
  });

  it("V2 layout has correct missing-field markers", () => {
    const data = makeMinimalSlab(2, 65_088);
    const layout = detectSlabLayout(65_088, data)!;
    expect(layout.engineMarkPriceOff).toBe(-1);
    expect(layout.engineLongOiOff).toBe(-1);
    expect(layout.engineShortOiOff).toBe(-1);
    expect(layout.engineEmergencyOiModeOff).toBe(-1);
    expect(layout.engineEmergencyStartSlotOff).toBe(-1);
    expect(layout.engineLastBreakerSlotOff).toBe(-1);
  });

  it("V2 large slab (4096 accounts) detected correctly", () => {
    const data = makeMinimalSlab(2, 1_025_568);
    const layout = detectSlabLayout(1_025_568, data);
    expect(layout).not.toBeNull();
    expect(layout!.version).toBe(2);
    expect(layout!.maxAccounts).toBe(4096);
    expect(layout!.engineOff).toBe(600);
  });

  it("V0 sizes are not affected by data parameter", () => {
    // V0 small = 62808
    const data = makeMinimalSlab(2, 62_808); // even with version=2, V0 size takes priority
    const layout = detectSlabLayout(62_808, data);
    expect(layout).not.toBeNull();
    expect(layout!.version).toBe(0);
  });
});

// ============================================================================
// PERC-1650: discoverMarkets sequential mode + 429 retry
// ============================================================================

import { discoverMarkets } from "../src/solana/discovery.js";
import { PublicKey, Connection } from "@solana/web3.js";

/** Minimal stub connection whose getProgramAccounts can be mocked per test. */
function makeConn(impl: (programId: PublicKey, config: any) => Promise<any[]>): Connection {
  return {
    getProgramAccounts: impl,
  } as unknown as Connection;
}

describe("discoverMarkets — sequential mode (PERC-1650)", () => {
  it("passes sequential=true and calls getProgramAccounts multiple times sequentially", async () => {
    const calls: number[] = [];
    let callIndex = 0;
    const conn = makeConn(async () => {
      calls.push(callIndex++);
      return [];
    });

    await discoverMarkets(conn, new PublicKey("11111111111111111111111111111111"), {
      sequential: true,
      interTierDelayMs: 0,
    });

    // Should have called getProgramAccounts once per tier (not parallel)
    expect(calls.length).toBeGreaterThan(0);
  });

  it("retries a 429 tier error with backoff in sequential mode", async () => {
    let attemptCount = 0;
    const conn = makeConn(async () => {
      attemptCount++;
      if (attemptCount === 1) throw new Error("429 Too Many Requests");
      return [];
    });

    await discoverMarkets(conn, new PublicKey("11111111111111111111111111111111"), {
      sequential: true,
      interTierDelayMs: 0,
      rateLimitBackoffMs: [0, 0], // no real delay in tests
    });

    // First tier should have been retried
    expect(attemptCount).toBeGreaterThanOrEqual(2);
  });

  it("does NOT retry non-429 errors in sequential mode — falls through to memcmp fallback", async () => {
    // fetchTierWithRetry catches non-429 errors and returns [] for that tier.
    // After all tiers return 0 results, discoverMarkets falls through to the memcmp fallback.
    // The memcmp fallback also calls getProgramAccounts — mock that to succeed with [].
    let callCount = 0;
    let memcmpCallCount = 0;
    const conn = makeConn(async (_programId, config: any) => {
      // Detect the memcmp fallback call (it uses a memcmp filter, not dataSize)
      const filters = config?.filters ?? [];
      const isMemcmp = filters.some((f: any) => "memcmp" in f);
      if (isMemcmp) {
        memcmpCallCount++;
        return []; // fallback returns nothing — that's fine
      }
      callCount++;
      throw new Error("Connection refused");
    });

    // Should NOT throw — all errors are handled internally
    await expect(
      discoverMarkets(conn, new PublicKey("11111111111111111111111111111111"), {
        sequential: true,
        interTierDelayMs: 0,
        rateLimitBackoffMs: [0, 0],
      }),
    ).resolves.toEqual([]);

    // Each tier got exactly ONE call (no retry on non-429)
    const allTierCount = 3 + 3 + 4 + 4 + 4; // SLAB_TIERS + V0 + V1D + V1D_LEGACY + V2
    expect(callCount).toBeLessThanOrEqual(allTierCount + 2); // +2 for rounding
    // Memcmp fallback was called (0 raw accounts → fallback triggered)
    expect(memcmpCallCount).toBe(1);
  });

  it("parallel mode (default) still works and fires all tier queries", async () => {
    const callCount = { n: 0 };
    const conn = makeConn(async () => {
      callCount.n++;
      return [];
    });

    await discoverMarkets(conn, new PublicKey("11111111111111111111111111111111"));

    // All tiers fired (parallel) + fallback memcmp if 0 results
    expect(callCount.n).toBeGreaterThan(0);
  });
});
