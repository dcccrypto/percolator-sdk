/**
 * previewGrowthOpenFee must price the utilisation fee on the SAME N_cap the wrapper charges with.
 *
 * percolator-prog feat/v22-rc23-2026-10-22 @ bc657392, src/v16_program.rs:48075-48103: the TradeCpi preflight builds
 * `GrowthUtilIn { n_cap_q: growth_clip_n_cap_view(..) }` (:45732 -> growth_n_cap_g8 -> growth_v19::n_cap_g8_q_dials), the G8
 * N_cap (λ_eff = min(stored λ, λ_depth), and the κ depth cap) on a clamp-enforced market. `quoteMaxLeverage` already uses that
 * N_cap (`nCapG8Q`); the preview used growth-1 `nCapQ(cM, stored λ)`, which is never smaller, so it under-quoted the fee.
 *
 * growth_v19.rs:693 `utilisation_fee_bps` returns `None` (not a panic) when `kink == 10_000` leaves a zero denominator; the SDK
 * divided by zero (RangeError) there, e.g. previewing a flip on a kink-100% market.
 */
import { describe, it, expect } from "vitest";
import {
  ASSET_GROWTH_LEN, decodeAssetGrowthRecordV19, DEPTH_SOURCE, DEPTH_EVER, DEPTH_PREV_REAL,
  previewGrowthOpenFee, quoteMaxLeverage, utilisationFeeBps, utilFeeMaxEffectiveBps, usersSideOiQ, openingPartQ,
} from "../src/index.js";
import type { AssetGrowthV19, QuoteMaxLeverageInput } from "../src/index.js";

const M = 1_000_000n;
function rec(o: { lambda?: number; kink?: number; utilMax?: number; depthUsd?: bigint } = {}): AssetGrowthV19 {
  const b = new Uint8Array(ASSET_GROWTH_LEN);
  const v = new DataView(b.buffer);
  b[39] = 0x03;
  v.setUint32(16, o.lambda ?? 10_000, true);
  v.setUint16(20, 500, true); v.setUint16(22, 2_000, true); v.setUint16(24, 500, true);
  v.setUint16(26, 5_000, true);
  v.setUint16(28, 3445, true); // r_gap: clamp-enforced at band 1000
  b[38] = 1;
  if (o.depthUsd !== undefined) {
    b[44] = DEPTH_SOURCE.OnChainPool | DEPTH_EVER | DEPTH_PREV_REAL;
    const d = o.depthUsd * M;
    v.setBigUint64(56, d, true); v.setBigUint64(64, 990n, true); v.setBigUint64(72, d, true); v.setBigUint64(80, d, true); v.setBigUint64(88, 990n, true);
  }
  b[46] = 7;
  return { ...decodeAssetGrowthRecordV19(b)!, kinkBps: o.kink ?? 5_000, utilFeeMaxBps: o.utilMax ?? 0 };
}
function inp(g: AssetGrowthV19, o: Partial<QuoteMaxLeverageInput> = {}): QuoteMaxLeverageInput {
  return {
    engineImrBps: 500n, growth: g, lpCapital: 100_000n * M, lpPnl: 0n, lpFeeCredits: 0n, lpEffectivePositionQ: 0n, assetBound: true,
    oiEffLongQ: 0n, oiEffShortQ: 0n, priceE6: M, bankruptcyHlockActive: false,
    v22: { bandBps: 1_000, nowSlot: 1_000n, vol: { liquidationFeeBps: 0n, bandMaxEpochSlots: 600n } },
    ...o,
  };
}
/** The wrapper's charge (growth_util_fee_for_fill_bps, v16_program.rs:47900) at the quote's (G8) N_cap. */
function charged(i: QuoteMaxLeverageInput, before: bigint, size: bigint): number {
  const g = i.growth!;
  const long = size > 0n;
  const nCap = quoteMaxLeverage(i, long ? "long" : "short").nCapQ!;
  const users = usersSideOiQ(long ? i.oiEffLongQ : i.oiEffShortQ, i.lpEffectivePositionQ, long);
  const opening = openingPartQ(before, before + size);
  const f = utilisationFeeBps(users + opening, nCap, g.kinkBps, utilFeeMaxEffectiveBps(g.utilFeeMaxBps)) ?? 0;
  const fill = size < 0n ? -size : size;
  return Number((BigInt(f) * (opening < fill ? opening : fill)) / fill);
}

describe("previewGrowthOpenFee: N_cap is the wrapper's G8 N_cap", () => {
  it("stored λ 3x on a tier-0 clamp market: the wrapper prices at λ_eff 1x (11 bps), not 3x (4 bps)", () => {
    const i = inp(rec({ lambda: 30_000, kink: 0 }));
    expect(quoteMaxLeverage(i, "long").nCapQ).toBe(100_000n * M); // λ_eff = 1x
    const size = 2_000n * M + 1n;
    // ceil(500 * (2e9 + 1) / 1e11) = 11 at the G8 N_cap (growth-1's 3e11 would give 4)
    expect(previewGrowthOpenFee(i, 0n, size, 30n).utilFeeBps).toBe(11);
    expect(previewGrowthOpenFee(i, 0n, size, 30n).minSignedFeeBpsExMatcher).toBe(41n);
    expect(charged(i, 0n, size)).toBe(11);
  });
  it("depth cap binds: preview equals the charge, and a fee-owing open is not batch-allowed", () => {
    const i = inp(rec({ lambda: 10_000, kink: 5_000, depthUsd: 10_000n }));
    const nCap = quoteMaxLeverage(i, "long").nCapQ!;
    // tier 0, rc23 κ_eff = min(κ, kappa_cap_bps(5)) = 253 bps: floor($10k * 253 / 1e4) = 253e6 Q at P = 1 (C_m's 1e11 does not bind)
    expect(nCap).toBe(253_000_000n);
    const j = { ...i, oiEffLongQ: (nCap * 8_000n) / 10_000n };
    const size = nCap / 50n + 1n;
    const p = previewGrowthOpenFee(j, 0n, size, 30n);
    // ceil(500 * (207_460_001e4 - 5_000 * 253e6) / (253e6 * 5_000)) = ceil(320.000004) = 321 (growth-1 N_cap 1e11 gives 0)
    expect(p.utilFeeBps).toBe(321);
    expect(charged(j, 0n, size)).toBe(321);
    expect(p.batchAllowed).toBe(false);
  });
  it("without v22 input (growth-1) the preview is unchanged", () => {
    const i = inp(rec({ lambda: 10_000, kink: 0 }));
    delete (i as { v22?: unknown }).v22;
    // N_cap = 1e11: ceil(500 * (2e9 + 1) / 1e11) = 11
    expect(previewGrowthOpenFee(i, 0n, 2_000n * M + 1n, 30n).utilFeeBps).toBe(11);
  });
});

describe("utilisationFeeBps at kink 10_000 (growth_v19.rs:693 returns None, never panics)", () => {
  it("users OI above N_cap at kink 100%: null, not a RangeError", () => {
    expect(utilisationFeeBps(2n, 1n, 10_000, 500)).toBeNull();
    expect(utilisationFeeBps(1n, 1n, 10_000, 500)).toBe(0); // landing on N_cap: lhs <= rhs -> 0
  });
  it("previewing a flip on a kink-100% market does not throw", () => {
    const i = inp(rec({ kink: 10_000 }), { oiEffLongQ: 100_000n * M - 1n });
    expect(() => previewGrowthOpenFee(i, -3n * M, 13n * M, 30n)).not.toThrow();
  });
});

// Kills the 4 previewGrowthOpenFee mutants the tests above let through (SDK-REPORT-GROWTHOPENFEEVSPROGMUT: F01 F02 F07 F09).
// Wrapper refs (percolator-prog feat/v22-rc23-2026-10-22 @ 08361ffc): growth_util_fee_for_fill_bps (v16_program.rs:47917) ->
// growth_v19::util_fee_on_fill_bps (growth_v19.rs:733, "Rounds DOWN"); p1_cpi_preflight_before_matcher builds GrowthUtilIn only
// for the bound vault LP, and reads `long_side = size_q > 0` (:48095).
describe("previewGrowthOpenFee: flip pro-rata, bound gate, close-to-flat side", () => {
  it("a flip pays floor(f * |after| / |size|): the closing part is free and the rate rounds DOWN (F01, F02)", () => {
    const before = -1_000n * M;
    const size = 3_000n * M + 1n; // after = 2e9 + 1 long
    const after = before + size;
    expect(utilisationFeeBps(after, 100_000n * M, 0, utilFeeMaxEffectiveBps(0))).toBe(11); // ceil(500 * (2e9 + 1) / 1e11)
    const p = previewGrowthOpenFee(inp(rec({ kink: 0 })), before, size, 30n);
    expect(p.openingQ).toBe(after);
    // floor(11 * (2e9 + 1) / (3e9 + 1)) = floor(7.33) = 7 (ceil would give 8, no pro-rata 11)
    expect(p.utilFeeBps).toBe(7);
    expect(p.minSignedFeeBpsExMatcher).toBe(37n);
    expect(p.batchAllowed).toBe(false);
  });
  it("an unbound asset previews no utilisation fee (F09)", () => {
    const size = 2_000n * M + 1n;
    const p = previewGrowthOpenFee(inp(rec({ kink: 0 }), { assetBound: false }), 0n, size, 30n);
    expect(p.utilFeeBps).toBe(0);
    expect(p.minSignedFeeBpsExMatcher).toBe(30n);
    expect(p.batchAllowed).toBe(true);
    expect(previewGrowthOpenFee(inp(rec({ kink: 0 })), 0n, size, 30n).utilFeeBps).toBe(11); // same open, bound: 11
  });
  it("a sell that closes to flat reports the short side's users OI (F07)", () => {
    const p = previewGrowthOpenFee(inp(rec(), { oiEffLongQ: 7n * M, oiEffShortQ: 3n * M }), 5n * M, -5n * M, 30n);
    expect(p.openingQ).toBe(0n);
    expect(p.usersOiAfterQ).toBe(3n * M);
    expect(p.utilFeeBps).toBe(0);
  });
});
