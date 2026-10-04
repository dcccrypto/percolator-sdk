/**
 * growth-v19: AssetGrowthV19 decoder, bigint mirror of percolator-prog `src/growth_v19.rs` (#524 @ a7c07f34),
 * tag 0 / 93 / 94 growth trailers, matcher call ext v3 (percolator-match#33), errors 92-94.
 */
import { describe, it, expect } from "vitest";
import {
  decodeAssetGrowthRecordV19, decodeAssetGrowthFromSlotV19, decodeAssetGrowthV19, assetGrowthAccountOffsetV19,
  imrBpsForLeverageX100, leverageX100ForImrBps, ceilingImrBps, nCapQ, liquidityNotionalE6, dynImrBps, utilizationBps,
  conservativeEquity, quoteMaxLeverage, encodeInitMarketV19, encodeInitVaultLpV19, encodeSetAssetRiskLimitsV19,
  encodeMatcherCallExtV2, encodeMatcherCallExtV3, encodeMatcherCallExtV3FromV2, encodeInitMarket, encodeSetAssetRiskLimitsP1,
  assetRiskLimitsAccountOffsetP1, PERCOLATOR_ERRORS, decodeError,
} from "../src/index.js";
import type { AssetGrowthV19, InitMarketV17Args } from "../src/index.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

describe("math parity with growth_v19.rs unit tests", () => {
  const n = 1_000_000n;
  it("dynImrBps kinked curve", () => {
    expect(dynImrBps(720_000n, n, 1_000n, 5_000n)).toBe(4_960n);
    expect(dynImrBps(500_000n, n, 1_000n, 5_000n)).toBe(1_000n);
    expect(dynImrBps(310_000n, n, 1_819n, 5_000n)).toBe(1_819n);
    expect(dynImrBps(999_999n, n, 1_000n, 5_000n)).toBe(10_000n);
    expect(dynImrBps(100_000n, n, 1_000n, 0n)).toBe(1_900n);
    expect(dynImrBps(999_999n, n, 1_000n, 10_000n)).toBe(1_000n);
  });
  it("u >= 1 and N_cap 0 are REFUSED (wrapper a7c07f34: lp_abs_after >= n_cap -> None)", () => {
    expect(dynImrBps(1_000_000n, n, 1_000n, 5_000n)).toBeNull();
    expect(dynImrBps(1_000_001n, n, 1_000n, 5_000n)).toBeNull();
    expect(dynImrBps(2_000_000n, n, 1_000n, 5_000n)).toBeNull();
    expect(dynImrBps(0n, 0n, 1_000n, 5_000n)).toBeNull();
    expect(dynImrBps(1n, n, 10_001n, 5_000n)).toBeNull();
    expect(dynImrBps(1n, n, 1_000n, 10_001n)).toBeNull();
  });
  it("nCapQ", () => {
    expect(nCapQ(1_746_000_000n, 10_000n, 1_000_000n)).toBe(1_746_000_000n);
    expect(nCapQ(1n, 10_000n, 0n)).toBeNull();
    expect(nCapQ((1n << 128n) - 1n, 10_000n, 1n)).toBeNull(); // u128 overflow fails closed
    expect(liquidityNotionalE6(1_746_000_000n, 10_000n)).toBe(1_746_000_000n);
  });
  it("leverage <-> IMR", () => {
    expect(imrBpsForLeverageX100(1_000)).toBe(1_000n);
    expect(imrBpsForLeverageX100(550)).toBe(1_819n);
    expect(imrBpsForLeverageX100(99)).toBeNull();
    expect(leverageX100ForImrBps(1_000n)).toBe(1_000n);
    expect(leverageX100ForImrBps(1_819n)).toBe(549n);
    expect(leverageX100ForImrBps(0n)).toBeNull();
    expect(leverageX100ForImrBps(10_001n)).toBeNull();
    for (let imr = 1n; imr <= 10_000n; imr += 7n) expect(imrBpsForLeverageX100(leverageX100ForImrBps(imr)!)! >= imr).toBe(true);
    expect(ceilingImrBps(1_000n, 550)).toBe(1_819n);
    expect(ceilingImrBps(2_000n, 1_000)).toBe(2_000n);
    expect(ceilingImrBps(10_001n, 1_000)).toBeNull();
    expect(ceilingImrBps(1_000n, 50)).toBeNull();
  });
  it("utilizationBps / conservativeEquity", () => {
    expect(utilizationBps(720_000n, n)).toBe(7_200n);
    expect(utilizationBps(1n, 0n)).toBeNull();
    expect(conservativeEquity(1_000n, -200n, -50n)).toBe(750n);
    expect(conservativeEquity(1_000n, 500n, 500n)).toBe(1_000n);
    expect(conservativeEquity(100n, -500n, 0n)).toBe(0n);
  });
});

function growthRecord(over: Partial<Record<string, number | bigint>> = {}): Uint8Array {
  const r = new Uint8Array(120);
  const v = new DataView(r.buffer);
  const d = { c: 5_000_000_000n, slot: 123_456_789n, lambda: 10_000, launch: 550, tier: 1_000, ceil: 550, kink: 5_000, gap: 500, version: 1, flags: 0, ...over };
  v.setBigUint64(0, d.c as bigint, true); v.setBigUint64(8, d.slot as bigint, true); v.setUint32(16, d.lambda as number, true);
  v.setUint16(20, d.launch as number, true); v.setUint16(22, d.tier as number, true); v.setUint16(24, d.ceil as number, true);
  v.setUint16(26, d.kink as number, true); v.setUint16(28, d.gap as number, true);
  v.setUint16(30, 11, true); v.setUint16(32, 12, true); v.setUint16(34, 13, true); v.setUint16(36, 14, true);
  r[38] = d.version as number; r[39] = d.flags as number;
  return r;
}

describe("AssetGrowthV19 decoder", () => {
  it("round-trips every field from a synthetic 1024-byte asset slot at slot+672", () => {
    const slot = new Uint8Array(1024);
    slot.fill(0xee, 0, 672); slot.fill(0xdd, 792);
    slot.set(growthRecord({ flags: 3 }), 672);
    const g = decodeAssetGrowthFromSlotV19(slot) as AssetGrowthV19;
    expect(g).toEqual({
      cLaunchAtoms: 5_000_000_000n, ceilSlot: 123_456_789n, lambdaBps: 10_000, lLaunchX100: 550, lTierX100: 1_000, ceilX100: 550,
      kinkBps: 5_000, rGapBps: 500, allocAlphaBps: 11, allocBufferBps: 12, cushionTargetBps: 13, cushionShareBps: 14, version: 1, flags: 3,
    });
  });
  it("version 0 -> null (growth OFF), even with junk in other fields", () => {
    expect(decodeAssetGrowthRecordV19(growthRecord({ version: 0 }))).toBeNull();
    expect(decodeAssetGrowthFromSlotV19(new Uint8Array(1024))).toBeNull();
  });
  it("rejects wrong lengths", () => {
    expect(() => decodeAssetGrowthRecordV19(new Uint8Array(119))).toThrow();
    expect(() => decodeAssetGrowthFromSlotV19(new Uint8Array(791))).toThrow();
  });
  it("account offset = AssetRiskLimits offset - 608 + 672 (same slot base)", () => {
    for (const i of [0, 1, 7]) expect(assetGrowthAccountOffsetV19(i)).toBe(assetRiskLimitsAccountOffsetP1(i) - 608 + 672);
    expect(assetGrowthAccountOffsetV19(0)).toBe(2022);
    const mkt = new Uint8Array(2022 + 2325 + 120 + 8); mkt[10] = 1;
    mkt.set(growthRecord({ lambda: 777 }), assetGrowthAccountOffsetV19(1));
    expect(decodeAssetGrowthV19(mkt, 1)?.lambdaBps).toBe(777);
    expect(decodeAssetGrowthV19(mkt, 0)).toBeNull();
  });
});

describe("quoteMaxLeverage", () => {
  const growth = decodeAssetGrowthRecordV19(growthRecord({ launch: 1_000, tier: 1_000, kink: 5_000, lambda: 10_000 })) as AssetGrowthV19;
  const base = { engineImrBps: 1_000n, growth, lpCapital: 1_000_000_000n, lpPnl: 0n, lpFeeCredits: 0n, priceE6: 1_000_000n, bankruptcyHlockActive: false };
  // N_cap = 1_000_000_000 Q (1:1 here)
  it("LP short 72%: longs are crowd (marginal 4960 bps IMR -> 2.01x); shorts are thin (10x)", () => {
    const i = { ...base, lpEffectivePositionQ: -720_000_000n };
    const l = quoteMaxLeverage(i, "long");
    expect(l).toMatchObject({ crowd: true, closed: false, imrBps: 4_960n, maxLeverageX100: 201, utilizationBps: 7_200n });
    expect(l.nCapQ).toBe(1_000_000_000n);
    const s = quoteMaxLeverage(i, "short");
    expect(s).toMatchObject({ crowd: false, closed: false, imrBps: 1_000n, maxLeverageX100: 1_000 });
  });
  it("flat LP: both sides crowd; at the kink and below the leverage is the ceiling", () => {
    const i = { ...base, lpEffectivePositionQ: 0n };
    expect(quoteMaxLeverage(i, "long").crowd).toBe(true);
    expect(quoteMaxLeverage(i, "short").crowd).toBe(true);
    expect(quoteMaxLeverage(i, "long").maxLeverageX100).toBe(1_000);
  });
  it("ceiling = min(l_launch, l_tier): 5.5x launch on a 10x tier", () => {
    const g = decodeAssetGrowthRecordV19(growthRecord({ launch: 550, tier: 1_000 })) as AssetGrowthV19;
    const q = quoteMaxLeverage({ ...base, growth: g, lpEffectivePositionQ: 100_000_000n }, "long"); // LP long -> longs thin
    expect(q).toMatchObject({ crowd: false, imrBps: 1_819n, maxLeverageX100: 549 });
  });
  it("closed: h-lock, |LP| >= N_cap, zero capital, zero price (crowd side only)", () => {
    const i = { ...base, lpEffectivePositionQ: -100n };
    expect(quoteMaxLeverage({ ...i, bankruptcyHlockActive: true }, "long")).toMatchObject({ closed: true, closedReason: "hlock", maxLeverageX100: 0 });
    expect(quoteMaxLeverage({ ...base, lpEffectivePositionQ: -1_000_000_000n }, "long")).toMatchObject({ closed: true, closedReason: "capacity-full" });
    expect(quoteMaxLeverage({ ...i, lpCapital: 0n }, "long")).toMatchObject({ closed: true, closedReason: "capacity-zero" });
    expect(quoteMaxLeverage({ ...i, priceE6: 0n }, "long")).toMatchObject({ closed: true, closedReason: "capacity-zero" });
    // thin side stays open even with the h-lock
    expect(quoteMaxLeverage({ ...i, bankruptcyHlockActive: true }, "short")).toMatchObject({ closed: false, crowd: false, maxLeverageX100: 1_000 });
  });
  it("equity is conservative: negative PnL shrinks N_cap, positive PnL does not grow it", () => {
    const i = { ...base, lpEffectivePositionQ: 0n };
    expect(quoteMaxLeverage({ ...i, lpPnl: -500_000_000n }, "long").nCapQ).toBe(500_000_000n);
    expect(quoteMaxLeverage({ ...i, lpPnl: 500_000_000n }, "long").nCapQ).toBe(1_000_000_000n);
  });
  it("growth OFF -> engine leverage", () => {
    expect(quoteMaxLeverage({ ...base, growth: null, lpEffectivePositionQ: -5n }, "long")).toMatchObject({ growthOn: false, closed: false, imrBps: 1_000n, maxLeverageX100: 1_000 });
  });
});

describe("encoders", () => {
  const initArgs: InitMarketV17Args = {
    maxPortfolioAssets: 4, hMin: 10n, hMax: 100n, initialPrice: 1_000_000n, minNonzeroMmReq: 10n, minNonzeroImReq: 20n,
    maintenanceMarginBps: 500n, initialMarginBps: 1_000n, maxTradingFeeBps: 100n, tradeFeeBaseBps: 10n, liquidationFeeBps: 50n,
    liquidationFeeCap: 1_000_000n, minLiquidationAbs: 100n, maxPriceMoveBpsPerSlot: 4n, maxAccrualDtSlots: 100n,
    maxAbsFundingE9PerSlot: 1_000n, minFundingLifetimeSlots: 0n, maxAccountBSettlementChunks: 10n, maxBankruptCloseChunks: 10n,
    maxBankruptCloseLifetimeSlots: 500n, publicBChunkAtoms: 1_000_000n, maintenanceFeePerSlot: 0n,
  } as InitMarketV17Args;
  it("tag 0 trailer = legacy bytes + r_gap u16 + l_launch u16", () => {
    const legacy = encodeInitMarket(initArgs);
    const g = encodeInitMarketV19(initArgs, 500, 550);
    expect(g.length).toBe(legacy.length + 4);
    expect(hex(g.subarray(0, legacy.length))).toBe(hex(legacy));
    expect(hex(g.subarray(legacy.length))).toBe("f4012602");
    expect(() => encodeInitMarketV19(initArgs, 0, 550)).toThrow();
    expect(() => encodeInitMarketV19(initArgs, 500, 0)).toThrow();
    expect(() => encodeInitMarketV19(initArgs, 70_000, 550)).toThrow();
  });
  it("tag 94 trailer known vector (junior 2000, l_launch 550)", () => {
    expect(hex(encodeInitVaultLpV19(2000, 550))).toBe("5ed0072602");
    expect(() => encodeInitVaultLpV19(2000, 0)).toThrow();
  });
  it("tag 93 growth form: full legacy body + u32 lambda + u16 kink = 50 bytes", () => {
    const a = { assetIndex: 3, execBandBps: 300, lpExposureKBps: 50_000, lpFloorAtoms: 250_000_000n, sideOiCapQ: 7_000_000_000n };
    const d = encodeSetAssetRiskLimitsV19(a, { growthLambdaBps: 10_000, growthKinkBps: 5_000 });
    expect(d.length).toBe(50);
    const legacy41 = encodeSetAssetRiskLimitsP1(a);
    expect(hex(d.subarray(0, 41))).toBe(hex(legacy41));
    expect(hex(d.subarray(41))).toBe("00" + "0000" + "10270000" + "8813");
    const withTail = encodeSetAssetRiskLimitsV19({ ...a, matcherExtMode: 1, maxRequestedFeeBps: 40 }, { growthLambdaBps: 1, growthKinkBps: 0 });
    expect(withTail.length).toBe(50);
    expect(hex(withTail.subarray(41))).toBe("01" + "2800" + "01000000" + "0000");
    expect(hex(withTail.subarray(0, 44))).toBe(hex(encodeSetAssetRiskLimitsP1({ ...a, matcherExtMode: 1, maxRequestedFeeBps: 40 })));
  });
  it("tag 93 growth bounds: lambda in [1,10000], kink in [0,5000]", () => {
    const a = { assetIndex: 0, execBandBps: 0, lpExposureKBps: 0, lpFloorAtoms: 0n, sideOiCapQ: 0n };
    expect(() => encodeSetAssetRiskLimitsV19(a, { growthLambdaBps: 0, growthKinkBps: 0 })).toThrow();
    expect(() => encodeSetAssetRiskLimitsV19(a, { growthLambdaBps: 10_001, growthKinkBps: 0 })).toThrow();
    expect(() => encodeSetAssetRiskLimitsV19(a, { growthLambdaBps: 1, growthKinkBps: 5_001 })).toThrow();
    expect(encodeSetAssetRiskLimitsV19(a, { growthLambdaBps: 10_000, growthKinkBps: 5_000 }).length).toBe(50);
  });
  const V3_HEX = "031ff40118171615141312110807060504030201000000007929edffffffffffffffffffffffffff00ba1dd205000000000000000000000080d81168000000000000000000000000";
  const v1 = { headroomQ: 0x0102030405060708n, markSlot: 0x1112131415161718n, execBandBps: 500, takerReducing: true, acceptsFeeRequest: true, lpPositionQ: -1_234_567n };
  it("matcher ext v3 known vector (72 B) and v2 block (40 B)", () => {
    const v3 = encodeMatcherCallExtV3(v1, { inventoryCapQ: 25_000_000_000n, liquidityNotionalE6: 1_746_000_000n });
    expect(v3.length).toBe(72);
    expect(hex(v3)).toBe(V3_HEX);
    const v2 = encodeMatcherCallExtV2(v1);
    expect(v2.length).toBe(40);
    expect(v2[0]).toBe(2);
    expect(hex(v2.subarray(1))).toBe(V3_HEX.slice(2, 80));
    expect(hex(encodeMatcherCallExtV3FromV2(v2, { inventoryCapQ: 25_000_000_000n, liquidityNotionalE6: 1_746_000_000n }))).toBe(V3_HEX);
  });
  it("ext v3 cap 0 = CLOSED is encodable; > i128::MAX and MIN position refused", () => {
    expect(hex(encodeMatcherCallExtV3(v1, { inventoryCapQ: 0n, liquidityNotionalE6: 0n }).subarray(40))).toBe("00".repeat(32));
    expect(() => encodeMatcherCallExtV3(v1, { inventoryCapQ: 1n << 127n, liquidityNotionalE6: 0n })).toThrow();
    expect(() => encodeMatcherCallExtV2({ ...v1, lpPositionQ: -(1n << 127n) })).toThrow();
  });
});

describe("errors 92-94", () => {
  it("named + hints", () => {
    expect(PERCOLATOR_ERRORS[92]?.name).toBe("GrowthLeverageExceeded");
    expect(PERCOLATOR_ERRORS[93]?.name).toBe("GrowthCapacityFull");
    expect(PERCOLATOR_ERRORS[94]?.name).toBe("GrowthInvalidConfig");
    expect(decodeError(92)?.hint.startsWith("Max leverage on this side is lower right now: this market's liquidity is in use")).toBe(true);
    expect(decodeError(93)?.hint.startsWith("This side is full right now. Closes and the other side are open.")).toBe(true);
  });
});
