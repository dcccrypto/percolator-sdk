/**
 * v2.2 growth G8: depth fields of AssetGrowthV19, tier / lambda / kappa / ceiling / N_cap mirrors, the clamp predicate with
 * G(d), the extended quoteMaxLeverage, PushAuthMark 44 B, stakePoolValue. Vectors are hand-computed (see comments) from the
 * spec v22-growth-overnight-2026-10-14 section 1.1-1.3 and the Rust formulas in growth_v19.rs / band_rent.rs.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  decodeAssetGrowthRecordV19, ASSET_GROWTH_LEN, ASSET_GROWTH_FIELD_OFF, ASSET_GROWTH_DEPTH_FIELD_OFF, ASSET_GROWTH_LEGACY_FIELD_OFF, effectiveDepthE6, bandRGapBps, clampEnforced,
  DEPTH_MAX_AGE_SLOTS, encodePushAuthMark, IX_TAG, stakePoolValue, collateralForLpV5, creatorCollateralAtaV5, decodeError, PERCOLATOR_ERRORS,
} from "../src/index.js";

const M = 1_000_000n; // 1 USD of 6-decimal collateral

function rec(over: Partial<Record<"cLaunch" | "ceil" | "lambda" | "lLaunch" | "lTier" | "kink" | "rGap" | "src" | "depth" | "slot" | "prev", bigint>>): Uint8Array {
  const b = new Uint8Array(ASSET_GROWTH_LEN);
  const v = new DataView(b.buffer);
  const F = { ...ASSET_GROWTH_FIELD_OFF, ...ASSET_GROWTH_DEPTH_FIELD_OFF };
  v.setBigUint64(ASSET_GROWTH_LEGACY_FIELD_OFF.cLaunchAtoms, over.cLaunch ?? 0n, true); // a legacy (flags 0) record
  v.setUint32(F.lambdaBps, Number(over.lambda ?? 10_000n), true);
  v.setUint16(F.lLaunchX100, Number(over.lLaunch ?? 300n), true);
  v.setUint16(F.lTierX100, Number(over.lTier ?? 1000n), true);
  v.setUint16(F.ceilX100, Number(over.ceil ?? over.lLaunch ?? 300n), true);
  v.setUint16(F.kinkBps, Number(over.kink ?? 5000n), true);
  v.setUint16(F.rGapBps, Number(over.rGap ?? 3445n), true);
  b[F.version] = 1;
  b[F.depthSource] = Number(over.src ?? 0n);
  v.setBigUint64(F.depthE6, over.depth ?? 0n, true);
  v.setBigUint64(F.depthSlot, over.slot ?? 0n, true);
  v.setBigUint64(F.depthPrevE6, over.prev ?? 0n, true);
  return b;
}

describe("AssetGrowthV19 depth fields", () => {
  it("offsets 44 / 56 / 64 / 72 relative to the record", () => {
    expect(ASSET_GROWTH_DEPTH_FIELD_OFF.depthSource).toBe(44);
    expect(ASSET_GROWTH_DEPTH_FIELD_OFF.depthE6).toBe(56);
    expect(ASSET_GROWTH_DEPTH_FIELD_OFF.depthSlot).toBe(64);
    expect(ASSET_GROWTH_DEPTH_FIELD_OFF.depthPrevE6).toBe(72);
  });
  it("decodes a hand-laid record byte-for-byte", () => {
    const b = new Uint8Array(120);
    b[38] = 1; b[44] = 1;
    b.set([0x40, 0x42, 0x0f, 0, 0, 0, 0, 0], 56); // 1_000_000
    b.set([0x2a, 0, 0, 0, 0, 0, 0, 0], 64); // 42
    b.set([0x80, 0x84, 0x1e, 0, 0, 0, 0, 0], 72); // 2_000_000
    const g = decodeAssetGrowthRecordV19(b)!;
    expect([g.depthSource, g.depthE6, g.depthSlot, g.depthPrevE6]).toEqual([1, 1_000_000n, 42n, 2_000_000n]);
  });
  it("does not disturb the existing fields and a growth-off record is still null", () => {
    const g = decodeAssetGrowthRecordV19(rec({ cLaunch: 7n, lLaunch: 550n, depth: 9n }))!;
    expect(g.cLaunchAtoms).toBe(7n); // flags 0: the retired c_launch is still decoded for legacy records
    expect([g.r3Layout, g.volHasData, g.volVarX100]).toEqual([false, false, 0]);
    expect(g.lLaunchX100).toBe(550);
    expect(g.depthE6).toBe(9n);
    expect(decodeAssetGrowthRecordV19(new Uint8Array(120))).toBeNull();
  });
});

describe("effective depth and tier", () => {
  it("min of the two pushes; a spike buys nothing", () => {
    expect(effectiveDepthE6(500_000n * M, 10_000n * M, 100n, 110n)).toBe(10_000n * M);
    expect(effectiveDepthE6(10_000n * M, 500_000n * M, 100n, 110n)).toBe(10_000n * M);
  });
  it("fresh at age 150, absent at 151; a clock behind the push is absent (Rust: fail closed)", () => {
    expect(DEPTH_MAX_AGE_SLOTS).toBe(150n);
    expect(effectiveDepthE6(30_000n * M, 30_000n * M, 100n, 250n)).toBe(30_000n * M);
    expect(effectiveDepthE6(30_000n * M, 30_000n * M, 100n, 251n)).toBe(0n);
    expect(effectiveDepthE6(30_000n * M, 30_000n * M, 100n, 90n)).toBe(0n);
    expect(effectiveDepthE6(30_000n * M, 0n, 100n, 110n)).toBe(0n); // first push: prev 0 → absent
  });
});

describe("G(d) and the clamp predicate", () => {
  // G = ceil((1e4+d)^2/(1e4-d)) - 1e4. d=100: 102_010_000/9_900 = 10304.04 -> 10305 -> 305. d=500: 110_250_000/9_500 = 11605.26 -> 1606.
  // d=1000: 121_000_000/9_000 = 13444.4 -> 3445. d=2000: 144_000_000/8_000 = 18000 exactly -> 8000.
  it("hand-computed vectors", () => {
    expect([100n, 500n, 1000n, 2000n].map((d) => bandRGapBps(d))).toEqual([305n, 1606n, 3445n, 8000n]);
  });
  it("out of range -> null (0, > 2000)", () => {
    expect(bandRGapBps(0n)).toBeNull();
    expect(bandRGapBps(2001n)).toBeNull();
  });
  it("enforced iff band_bps != 0 and r_gap == G(band)", () => {
    expect(clampEnforced(1000, 3445)).toBe(true);
    expect(clampEnforced(1000, 3444)).toBe(false); // mismatch fails closed
    expect(clampEnforced(0, 400)).toBe(false);
    expect(clampEnforced(0, 0)).toBe(false);
    expect(clampEnforced(2500, 0)).toBe(false);
  });
});

describe("PushAuthMark tag 63", () => {
  const a = { assetIndex: 3, marketId: 1n, nowSlot: 300_000_001n, markE6: 50_100_000n, observationSequence: 9n };
  it("35 B form unchanged (no depth)", () => {
    const d = encodePushAuthMark(a);
    expect(d.length).toBe(35);
    expect(d[0]).toBe(IX_TAG.PushAuthMark);
  });
  it("44 B form appends mode u8 + depth_e6 u64 LE", () => {
    const d = encodePushAuthMark({ ...a, depth: { mode: 1, depthE6: 30_000n * M } });
    expect(d.length).toBe(44);
    expect(Array.from(d.subarray(0, 35))).toEqual(Array.from(encodePushAuthMark(a)));
    expect(d[35]).toBe(1);
    expect(new DataView(d.buffer, d.byteOffset).getBigUint64(36, true)).toBe(30_000n * M);
    const none = encodePushAuthMark({ ...a, depth: { mode: 0, depthE6: 0n } });
    expect(none.length).toBe(44);
    expect(Array.from(none.subarray(35))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it("mode 2 (on-chain pool) is the 44 B form with depth 0; a depth on it is refused (128)", () => {
    const d = encodePushAuthMark({ ...a, depth: { mode: 2, depthE6: 0n } });
    expect(d.length).toBe(44);
    expect(d[35]).toBe(2);
    expect(Array.from(d.subarray(36))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => encodePushAuthMark({ ...a, depth: { mode: 2, depthE6: 1n } })).toThrow(/mode 2/);
  });
  it("refuses a mode the program answers with error 128", () => {
    expect(() => encodePushAuthMark({ ...a, depth: { mode: 3 as 0 | 1, depthE6: 1n } })).toThrow(/depth mode/);
    expect(() => encodePushAuthMark({ ...a, depth: { mode: 0, depthE6: 5n } })).toThrow(/mode 0/); // on chain: 128
    expect(encodePushAuthMark({ ...a, depth: { mode: 0, depthE6: 0n } }).length).toBe(44);
    expect(PERCOLATOR_ERRORS[128]?.name).toBe("DepthInputInvalid");
    expect(decodeError(128)?.name).toBe("DepthInputInvalid");
  });
  it("depth over u64 is refused", () => {
    expect(() => encodePushAuthMark({ ...a, depth: { mode: 1, depthE6: 1n << 64n } })).toThrow();
  });
});

describe("stakePoolValue (release checklist 5.4: pool value includes deployed insurance)", () => {
  const pool = { totalDeposited: 1000n, totalWithdrawn: 100n, totalFlushed: 300n, totalReturned: 50n, totalFeesEarned: 20n, realizedJuniorLoss: 10n };
  // liquid = 1000 - 100 - 300 + 50 + 20 - 10 = 660; deployed = floor(250 * 400 / 1000) = 100; total 760.
  it("hand vector", () => {
    expect(stakePoolValue(pool, { unitsStake: 250n, unitsTotal: 1000n }, 400n)).toEqual({ liquid: 660n, deployed: 100n, total: 760n });
  });
  it("floors the deployed value (like stake math::deployed_value)", () => {
    expect(stakePoolValue(pool, { unitsStake: 1n, unitsTotal: 3n }, 10n)?.deployed).toBe(3n);
  });
  it("no units or no insurance -> deployed 0 and total = liquid", () => {
    expect(stakePoolValue(pool, { unitsStake: 0n, unitsTotal: 0n }, 999n)).toEqual({ liquid: 660n, deployed: 0n, total: 660n });
    expect(stakePoolValue(pool, { unitsStake: 5n, unitsTotal: 10n }, 0n)?.deployed).toBe(0n);
  });
  it("fails closed where the program does", () => {
    expect(stakePoolValue(pool, { unitsStake: 11n, unitsTotal: 10n }, 5n)).toBeNull(); // units_stake > units_total
    expect(stakePoolValue({ ...pool, totalWithdrawn: 5000n }, { unitsStake: 1n, unitsTotal: 1n }, 1n)).toBeNull(); // negative
    expect(stakePoolValue(pool, { unitsStake: 1n << 100n, unitsTotal: 1n << 100n }, 1n << 100n)).toBeNull(); // u128 overflow
    expect(stakePoolValue(pool, { unitsStake: 1n, unitsTotal: 1n }, 1n << 64n)).toBeNull(); // beyond u64
  });
  it("withdrawableNow = min(liquid, vault balance) only when a balance is passed", () => {
    const u = { unitsStake: 250n, unitsTotal: 1000n };
    expect(stakePoolValue(pool, u, 400n)?.withdrawableNow).toBeUndefined();
    expect(stakePoolValue(pool, u, 400n, 500n)?.withdrawableNow).toBe(500n);
    expect(stakePoolValue(pool, u, 400n, 900n)?.withdrawableNow).toBe(660n);
  });
  it("LP price uses the pool's own counter with the +1/+1 offset (stake calc_collateral_for_withdraw)", () => {
    // 100 LP of a 1_100 counter (incl. dead shares) against value 760: 100 * 761 / 1101 = 69 (floor)
    expect(collateralForLpV5(100n, 1_100n, 760n)).toBe(69n);
    expect(collateralForLpV5(1n, 0n, 760n)).toBeNull();
  });
  // Cold-start cost (measured: spl-token import ~6 s, first Keypair.generate ~2 s, ATA derivation <40 ms) is paid once here,
  // under a generous hook timeout, so the case below only times the derivation it asserts on.
  let web3: typeof import("@solana/web3.js");
  let spl: typeof import("@solana/spl-token");
  beforeAll(async () => {
    web3 = await import("@solana/web3.js");
    spl = await import("@solana/spl-token");
    web3.Keypair.generate();
  }, 60_000);
  it("creator ATA is the pool mint ATA of pool.admin", () => {
    const admin = web3.Keypair.generate().publicKey; const mint = web3.Keypair.generate().publicKey;
    expect(creatorCollateralAtaV5({ admin, collateralMint: mint }).equals(spl.getAssociatedTokenAddressSync(mint, admin, true))).toBe(true);
  });
  it("negative control: the pre-fix value (liquid only) understates by exactly the deployed part", () => {
    const v = stakePoolValue(pool, { unitsStake: 250n, unitsTotal: 1000n }, 400n)!;
    expect(v.total - v.liquid).toBe(100n);
  });
});
