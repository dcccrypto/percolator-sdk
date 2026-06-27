import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  encodeInitMarket, encodeInitUser, encodeInitLP,
  encodeDepositCollateral, encodeWithdrawCollateral,
  encodeKeeperCrank, encodeTradeNoCpi, encodeTradeCpi, encodeTradeCpiV2,
  encodeLiquidateAtOracle, encodeCloseAccount,
  encodeTopUpInsurance, encodeSetRiskThreshold, encodeUpdateAdmin,
  encodeCloseSlab, encodeUpdateConfig, encodeSetMaintenanceFee,
  encodeSetOraclePriceCap, encodeUpdateRiskParams, encodeRenounceAdmin,
  encodeSetPythOracle, encodeUpdateMarkPrice, encodeSetInsuranceIsolation,
  encodeUnresolveMarket, encodeSlashCreationDeposit, encodeInitSharedVault,
  encodeAllocateMarket, encodeQueueWithdrawalSV, encodeClaimEpochWithdrawal,
  encodeAdvanceEpoch,
  encodeResolveMarket, encodeWithdrawInsurance,
  IX_TAG,
  PUBLIC_B_CHUNK_ATOMS_UNLIMITED,
} from "../src/abi/instructions.js";

/**
 * Any decoder that reads the full instruction payload in order will hit
 * DataView OOB (RangeError) when the on-chain buffer is shorter than the
 * layout this encoder produces.
 */
function assertTruncatedPayloadThrowsOnSequentialRead(full: Uint8Array): void {
  expect(full.length).toBeGreaterThan(0);
  for (let truncLen = 0; truncLen < full.length; truncLen++) {
    const dv = new DataView(full.buffer, full.byteOffset, truncLen);
    expect(
      () => {
        for (let i = 0; i < full.length; i++) {
          dv.getUint8(i);
        }
      },
      `truncLen=${truncLen} fullLen=${full.length}`,
    ).toThrow(RangeError);
  }
}

describe("PUBLIC_B_CHUNK_ATOMS_UNLIMITED", () => {
  it("equals the engine MAX_VAULT_TVL (10_000_000_000_000_000)", () => {
    expect(PUBLIC_B_CHUNK_ATOMS_UNLIMITED).toBe(10_000_000_000_000_000n);
  });

  it("is a bigint, not a number", () => {
    expect(typeof PUBLIC_B_CHUNK_ATOMS_UNLIMITED).toBe("bigint");
  });

  it("encodeInitMarket accepts PUBLIC_B_CHUNK_ATOMS_UNLIMITED without throwing", () => {
    const data = encodeInitMarket({
      maxPortfolioAssets: 256,
      hMin: 1000n,
      hMax: 100_000n,
      initialPrice: 50_000_000_000n,
      minNonzeroMmReq: 1_000_000n,
      minNonzeroImReq: 2_000_000n,
      maintenanceMarginBps: 500n,
      initialMarginBps: 1000n,
      maxTradingFeeBps: 100n,
      tradeFeeBaseBps: 30n,
      liquidationFeeBps: 100n,
      liquidationFeeCap: 10_000_000n,
      minLiquidationAbs: 1_000_000n,
      maxPriceMoveBpsPerSlot: 4n,
      maxAccrualDtSlots: 600n,
      maxAbsFundingE9PerSlot: 1000n,
      minFundingLifetimeSlots: 50n,
      maxAccountBSettlementChunks: 10n,
      maxBankruptCloseChunks: 10n,
      maxBankruptCloseLifetimeSlots: 500n,
      publicBChunkAtoms: PUBLIC_B_CHUNK_ATOMS_UNLIMITED,
      maintenanceFeePerSlot: 0n,
    });
    // 219 bytes: tag(1) + 218 bytes of params
    expect(data.length).toBe(219);
    // Verify publicBChunkAtoms is encoded as 10_000_000_000_000_000 at the correct offset.
    // Layout: tag(1) + u16(2) + u64×3(24) + u128×2(32) + u64×5(40) + u128×2(32) + u64×7(56) = 187
    //   tag=1, maxPortfolioAssets=2, hMin/hMax/initialPrice=24, mmReq/imReq=32,
    //   maintenanceMarginBps..liquidationFeeBps=40, liquidationFeeCap/minLiquidationAbs=32,
    //   maxPriceMovePerSlot..maxBankruptCloseLifetimeSlots=56 → publicBChunkAtoms starts at 187
    const dv = new DataView(data.buffer);
    const lo = dv.getBigUint64(187, true);
    const hi = dv.getBigUint64(195, true);
    const encoded = lo | (hi << 64n);
    expect(encoded).toBe(PUBLIC_B_CHUNK_ATOMS_UNLIMITED);
  });
});

describe("IX_TAG values", () => {
  it("has correct tags", () => {
    expect(IX_TAG.InitMarket).toBe(0);
    expect(IX_TAG.InitUser).toBe(1);
    expect(IX_TAG.InitLP).toBe(2);
    expect(IX_TAG.DepositCollateral).toBe(3);
    expect(IX_TAG.WithdrawCollateral).toBe(4);
    expect(IX_TAG.KeeperCrank).toBe(5);          // alias for PermissionlessCrank
    expect(IX_TAG.PermissionlessCrank).toBe(5);  // v17 canonical name
    expect(IX_TAG.TradeNoCpi).toBe(6);
    expect(IX_TAG.TradeCpi).toBe(10);
    expect(IX_TAG.ResolveMarket).toBe(19);
    // v17 CHANGE: WithdrawInsurance is tag 41 (was tag 20 in v12.x; SetPythOracle is now 20)
    expect(IX_TAG.WithdrawInsurance).toBe(41);
    // v17 NEW tags
    expect(IX_TAG.UpdateAssetAuthority).toBe(65);
    expect(IX_TAG.BatchTradeNoCpi).toBe(66);
    expect(IX_TAG.BatchTradeCpi).toBe(67);
    expect(IX_TAG.SetMatcherConfig).toBe(68);
    expect(IX_TAG.RestartAssetOracle).toBe(69);
    expect(IX_TAG.WithdrawInsuranceAsset).toBe(57);
    expect(IX_TAG.CreateLpVault).toBe(74);
    expect(IX_TAG.DepositToLpVault).toBe(75);
  });
});

describe("instruction encoders", () => {
  it("encodeInitUser produces 1 byte (v17: tag only, feePayment removed)", () => {
    const data = encodeInitUser({ feePayment: "1000000" });
    expect(data.length).toBe(1);
    expect(data[0]).toBe(IX_TAG.InitUser);
  });

  it("encodeDepositCollateral produces 17 bytes (v17: tag + u128, userIdx removed)", () => {
    const data = encodeDepositCollateral({ userIdx: 5, amount: "1000000" });
    expect(data.length).toBe(17);
    expect(data[0]).toBe(IX_TAG.DepositCollateral);
  });

  it("encodeWithdrawCollateral produces 17 bytes (v17: tag + u128, userIdx removed)", () => {
    const data = encodeWithdrawCollateral({ userIdx: 10, amount: "500000" });
    expect(data.length).toBe(17);
    expect(data[0]).toBe(IX_TAG.WithdrawCollateral);
  });

  it("encodeKeeperCrank throws — v12.17 wire format not accepted by v17 wrapper", () => {
    // v17: use encodePermissionlessCrank() instead
    expect(() => encodeKeeperCrank({ callerIdx: 1 })).toThrow(/v12\.17/i);
  });

  it("encodeTradeNoCpi produces 35 bytes (v17 API)", () => {
    const data = encodeTradeNoCpi({
      assetIndex: 0,
      sizeQ: 1_000_000n,
      execPrice: 50_000_000_000n,
      feeBps: 10n,
    });
    expect(data.length).toBe(35);
    expect(data[0]).toBe(IX_TAG.TradeNoCpi);
  });

  it("encodeTradeNoCpi with negative sizeQ (short position)", () => {
    const data = encodeTradeNoCpi({
      assetIndex: 0,
      sizeQ: -1_000_000n,
      execPrice: 50_000_000_000n,
      feeBps: 10n,
    });
    expect(data.length).toBe(35);
    expect(data[0]).toBe(IX_TAG.TradeNoCpi);
    // sizeQ starts at byte 3 (tag 1 byte + assetIndex 2 bytes), LE i128
    // -1_000_000 in LE i128 starts with 0xC0 0x78 0xF0 ...
    expect(data[3]).toBe(0xc0);
  });

  it("encodeTradeCpi produces 35 bytes (v17 API)", () => {
    const data = encodeTradeCpi({
      assetIndex: 2,
      sizeQ: -500n,
      feeBps: 10n,
      limitPrice: 0n,
    });
    expect(data.length).toBe(35);
    expect(data[0]).toBe(IX_TAG.TradeCpi);
  });

  it("encodeLiquidateAtOracle (tag 7) throws removedInstruction in v17", () => {
    expect(() => encodeLiquidateAtOracle({ targetIdx: 42 })).toThrow(/tag 7/i);
  });

  it("encodeCloseAccount produces 1 byte (v17: tag only, userIdx removed)", () => {
    const data = encodeCloseAccount({ userIdx: 100 });
    expect(data.length).toBe(1);
    expect(data[0]).toBe(IX_TAG.CloseAccount);
  });

  it("encodeTopUpInsurance produces 17 bytes (v17: tag + u128, was tag + u64 = 9)", () => {
    const data = encodeTopUpInsurance({ amount: "5000000" });
    expect(data.length).toBe(17);
    expect(data[0]).toBe(IX_TAG.TopUpInsurance);
  });

  it("encodeSetRiskThreshold rejects removed tag 11", () => {
    expect(() => encodeSetRiskThreshold({ newThreshold: "1000000000000" })).toThrow(/tag 11/i);
  });

  it("encodeUpdateAdmin (tag 12) throws removedInstruction in v17", () => {
    expect(() => encodeUpdateAdmin({ newAdmin: new PublicKey("11111111111111111111111111111111") })).toThrow(/tag 12/i);
  });

  it("encodeInitLP (tag 2) throws removedInstruction in v17", () => {
    expect(() => encodeInitLP({ matcherProgram: PublicKey.unique(), matcherContext: PublicKey.unique(), feePayment: "1000000" })).toThrow(/tag 2/i);
  });

  it("encodeInitMarket produces 219-byte payload (v17: INIT_MARKET_V17_LEN, no ext tail)", () => {
    // v17 BREAKING: admin/collateralMint go into accounts, not instruction data.
    // feedId/staleness/confFilter/invert/unitScale are ignored (set via ConfigureHybridOracle).
    // Fixed 219-byte payload: tag(1) + 22 field structs (218 bytes).
    const data = encodeInitMarket({
      admin: PublicKey.unique(), collateralMint: PublicKey.unique(),
      indexFeedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
      maxStalenessSecs: "60", confFilterBps: 50, invert: 0, unitScale: 0, initialMarkPriceE6: "0",
      warmupPeriodSlots: "1000", maintenanceMarginBps: "500", initialMarginBps: "1000",
      tradingFeeBps: "10", maxAccounts: "1000", newAccountFee: "1000000",
      riskReductionThreshold: "1000000000", maintenanceFeePerSlot: "100",
      maxCrankStalenessSlots: "50", liquidationFeeBps: "100", liquidationFeeCap: "10000000",
      liquidationBufferBps: "50", minLiquidationAbs: "1000000",
      minNonzeroMmReq: "1000", minNonzeroImReq: "2000",
    });
    expect(data.length).toBe(219);
    expect(data[0]).toBe(IX_TAG.InitMarket);
  });

  it("encodeInitMarket ignores non-hex feed ID (v17: feedId field silently ignored, no validation)", () => {
    // v17 BREAKING: indexFeedId is ignored (oracle config moved to ConfigureHybridOracle tag 34).
    // The old non-hex validation no longer fires. Passes as long as required fields present.
    const data = encodeInitMarket({
      admin: PublicKey.unique(), collateralMint: PublicKey.unique(),
      indexFeedId: "g".repeat(64),
      maxStalenessSecs: "60", confFilterBps: 50, invert: 0, unitScale: 0, initialMarkPriceE6: "0",
      warmupPeriodSlots: "1000", maintenanceMarginBps: "500", initialMarginBps: "1000",
      tradingFeeBps: "10", maxAccounts: "1000", newAccountFee: "1000000",
      riskReductionThreshold: "1000000000", maintenanceFeePerSlot: "100",
      maxCrankStalenessSlots: "50", liquidationFeeBps: "100", liquidationFeeCap: "10000000",
      liquidationBufferBps: "50", minLiquidationAbs: "1000000",
      minNonzeroMmReq: "1000", minNonzeroImReq: "2000",
    });
    expect(data.length).toBe(219);
  });

  it("encodeInitMarket ignores wrong-length feed ID (v17: feedId silently ignored)", () => {
    // v17: feedId no longer validated or encoded — any value (even "abcd") is accepted.
    const data = encodeInitMarket({
      admin: PublicKey.unique(), collateralMint: PublicKey.unique(),
      indexFeedId: "abcd",
      maxStalenessSecs: "60", confFilterBps: 50, invert: 0, unitScale: 0, initialMarkPriceE6: "0",
      warmupPeriodSlots: "1000", maintenanceMarginBps: "500", initialMarginBps: "1000",
      tradingFeeBps: "10", maxAccounts: "1000", newAccountFee: "1000000",
      riskReductionThreshold: "1000000000", maintenanceFeePerSlot: "100",
      maxCrankStalenessSlots: "50", liquidationFeeBps: "100", liquidationFeeCap: "10000000",
      liquidationBufferBps: "50", minLiquidationAbs: "1000000",
      minNonzeroMmReq: "1000", minNonzeroImReq: "2000",
    });
    expect(data.length).toBe(219);
  });

  it("encodeInitMarket accepts 0x-prefixed feed ID (v17: feedId silently ignored)", () => {
    // v17: feedId ignored → size is 219 regardless of feedId format.
    const data = encodeInitMarket({
      admin: PublicKey.unique(), collateralMint: PublicKey.unique(),
      indexFeedId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
      maxStalenessSecs: "60", confFilterBps: 50, invert: 0, unitScale: 0, initialMarkPriceE6: "0",
      warmupPeriodSlots: "1000", maintenanceMarginBps: "500", initialMarginBps: "1000",
      tradingFeeBps: "10", maxAccounts: "1000", newAccountFee: "1000000",
      riskReductionThreshold: "1000000000", maintenanceFeePerSlot: "100",
      maxCrankStalenessSlots: "50", liquidationFeeBps: "100", liquidationFeeCap: "10000000",
      liquidationBufferBps: "50", minLiquidationAbs: "1000000",
      minNonzeroMmReq: "1000", minNonzeroImReq: "2000",
    });
    expect(data.length).toBe(219);
  });

  // v17: extendedTail is ignored; maxPriceMoveBpsPerSlot maps to a field in the fixed body.
  // The 219-byte payload includes maxPriceMoveBpsPerSlot as an inline u64 field.
  it("encodeInitMarket emits 219-byte payload with extendedTail (v17: extendedTail ignored, fixed size)", () => {
    // v17 BREAKING: extendedTail no longer appended. maxPriceMoveBpsPerSlot from extendedTail
    // is mapped into the inline body field. Total is still 219 bytes.
    const data = encodeInitMarket({
      admin: PublicKey.unique(), collateralMint: PublicKey.unique(),
      indexFeedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
      maxStalenessSecs: "60", confFilterBps: 50, invert: 0, unitScale: 0, initialMarkPriceE6: "0",
      warmupPeriodSlots: "1000", maintenanceMarginBps: "500", initialMarginBps: "1000",
      tradingFeeBps: "10", maxAccounts: "1000", newAccountFee: "1000000",
      maintenanceFeePerSlot: "100",
      maxCrankStalenessSlots: "50", liquidationFeeBps: "100", liquidationFeeCap: "10000000",
      liquidationBufferBps: "50", minLiquidationAbs: "1000000",
      minNonzeroMmReq: "1000", minNonzeroImReq: "2000",
      extendedTail: {
        insuranceWithdrawMaxBps: 0,
        insuranceWithdrawCooldownSlots: 0n,
        permissionlessResolveStaleSlots: 0n,
        fundingHorizonSlots: 500n,
        fundingKBps: 100n,
        fundingMaxPremiumBps: 500n,
        fundingMaxBpsPerSlot: 1000n,
        markMinFee: 0n,
        forceCloseDelaySlots: 1n,
        maxPriceMoveBpsPerSlot: 7n,
      },
    });
    // v17: always 219 bytes — no variable tail
    expect(data.length).toBe(219);
  });

  it("encodeInitMarket does not throw for zero maxPriceMoveBpsPerSlot in extendedTail (v17: validation removed)", () => {
    // v17: maxPriceMoveBpsPerSlot defaults to 4n when 0 is passed via extendedTail shim.
    // The old v12 "must be > 0" validation no longer applies.
    expect(() =>
      encodeInitMarket({
        admin: PublicKey.unique(), collateralMint: PublicKey.unique(),
        indexFeedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
        maxStalenessSecs: "60", confFilterBps: 50, invert: 0, unitScale: 0, initialMarkPriceE6: "0",
        warmupPeriodSlots: "1000", maintenanceMarginBps: "500", initialMarginBps: "1000",
        tradingFeeBps: "10", maxAccounts: "1000", newAccountFee: "1000000",
        maintenanceFeePerSlot: "100",
        maxCrankStalenessSlots: "50", liquidationFeeBps: "100", liquidationFeeCap: "10000000",
        liquidationBufferBps: "50", minLiquidationAbs: "1000000",
        minNonzeroMmReq: "1000", minNonzeroImReq: "2000",
        extendedTail: {
          insuranceWithdrawMaxBps: 0,
          insuranceWithdrawCooldownSlots: 0n,
          permissionlessResolveStaleSlots: 0n,
          fundingHorizonSlots: 500n,
          fundingKBps: 100n,
          fundingMaxPremiumBps: 500n,
          fundingMaxBpsPerSlot: 1000n,
          markMinFee: 0n,
          forceCloseDelaySlots: 1n,
          maxPriceMoveBpsPerSlot: 0n,
        },
      }),
    ).not.toThrow();
  });

  it("encodeCloseSlab produces 1 byte", () => {
    expect(encodeCloseSlab().length).toBe(1);
    expect(encodeCloseSlab()[0]).toBe(IX_TAG.CloseSlab);
  });

  it("encodeResolveMarket produces 1 byte (v17: tag only, mode byte removed)", () => {
    // v17 BREAKING: mode byte removed. The decoder at tag 19 reads no bytes after the tag.
    // `mode` arg still accepted for source compatibility but is silently ignored.
    const ord = encodeResolveMarket();
    expect(ord.length).toBe(1);
    expect(ord[0]).toBe(IX_TAG.ResolveMarket);
    const deg = encodeResolveMarket({ mode: 1 });
    expect(deg.length).toBe(1);
    expect(deg[0]).toBe(IX_TAG.ResolveMarket);
  });

  it("encodeWithdrawInsurance produces 17 bytes (v17: tag + u128 amount required)", () => {
    // v17 BREAKING: amount(u128) is now REQUIRED. Old 1-byte payload fails on-chain.
    const data = encodeWithdrawInsurance({ amount: "5000000" });
    expect(data.length).toBe(17);
    expect(data[0]).toBe(IX_TAG.WithdrawInsurance);
  });

  it("removed and disabled encoders throw instead of emitting dead bytes", () => {
    // TradeCpiV2 (v12 tag 35): tag 35 = ConfigureEwmaMark in v17 — removed
    expect(() => encodeTradeCpiV2({ lpIdx: 2, userIdx: 3, size: "1000000", bump: 254 })).toThrow(/not in v17|not accepted/i);
    // UnresolveMarket (v12 tag 36): not in v17
    expect(() => encodeUnresolveMarket({ confirmation: "1" })).toThrow(/tag 36/i);
    // SetMaintenanceFee (tag 15): not in v17
    expect(() => encodeSetMaintenanceFee({ newFee: "0" })).toThrow(/tag 15/i);
    // UpdateRiskParams (tag 18): not in v17 (NOTE: was 22 in an older v12; v17 map has it at 18)
    expect(() => encodeUpdateRiskParams({ initialMarginBps: "1", maintenanceMarginBps: "1" })).toThrow(/not in v17|not accepted/i);
    // RenounceAdmin (tag 21): not in v17
    expect(() => encodeRenounceAdmin()).toThrow(/tag 21/i);
    // SetPythOracle (tag 20 in v17 IX_TAG map): deprecated/removed — tag 20 = SetPythOracle
    expect(() => encodeSetPythOracle({ feedId: new Uint8Array(32), maxStalenessSecs: 1n, confFilterBps: 1 })).toThrow(/tag 20/i);
    // UpdateMarkPrice (tag 90 in v17 IX_TAG map): deprecated/removed
    expect(() => encodeUpdateMarkPrice()).toThrow(/tag 90/i);
    // SetInsuranceIsolation (tag 26 in v17 IX_TAG map): deprecated/removed
    expect(() => encodeSetInsuranceIsolation({ bps: 1 })).toThrow(/tag 26/i);
    // SlashCreationDeposit (tag 93 in v17 IX_TAG map): deprecated/removed
    expect(() => encodeSlashCreationDeposit()).toThrow(/tag 93/i);
  });
});

describe("truncated instruction payloads", () => {
  const initMarketArgs = {
    admin: PublicKey.unique(),
    collateralMint: PublicKey.unique(),
    indexFeedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    maxStalenessSecs: "60",
    confFilterBps: 50,
    invert: 0,
    unitScale: 0,
    initialMarkPriceE6: "0",
    warmupPeriodSlots: "1000",
    maintenanceMarginBps: "500",
    initialMarginBps: "1000",
    tradingFeeBps: "10",
    maxAccounts: "1000",
    newAccountFee: "1000000",
    riskReductionThreshold: "1000000000",
    maintenanceFeePerSlot: "100",
    maxCrankStalenessSlots: "50",
    liquidationFeeBps: "100",
    liquidationFeeCap: "10000000",
    liquidationBufferBps: "50",
    minLiquidationAbs: "1000000",
    minInitialDeposit: "500000",
    minNonzeroMmReq: "1000",
    minNonzeroImReq: "2000",
  } as const;

  // NOTE: encodeKeeperCrank, encodeUpdateConfig, encodeSetOraclePriceCap, encodeLiquidateAtOracle,
  // encodeUpdateAdmin, encodeInitLP all throw removedInstruction in v17 and are excluded from
  // the truncated-payload test below (which requires a non-throwing encoder to produce bytes).
  // TradeNoCpi/TradeCpi use v17 API (assetIndex/sizeQ/...) — not the old lpIdx/userIdx API.
  const cases: [string, () => Uint8Array][] = [
    ["InitUser", () => encodeInitUser({ feePayment: "1000000" })],
    ["DepositCollateral", () => encodeDepositCollateral({ userIdx: 5, amount: "1000000" })],
    ["WithdrawCollateral", () => encodeWithdrawCollateral({ userIdx: 10, amount: "500000" })],
    ["TradeNoCpi", () => encodeTradeNoCpi({ assetIndex: 0, sizeQ: 1_000_000n, execPrice: 50_000_000_000n, feeBps: 10n })],
    ["TradeCpi", () => encodeTradeCpi({ assetIndex: 2, sizeQ: -500n, feeBps: 10n, limitPrice: 0n })],
    ["CloseAccount", () => encodeCloseAccount({ userIdx: 100 })],
    ["TopUpInsurance", () => encodeTopUpInsurance({ amount: "5000000" })],
    ["InitMarket", () => encodeInitMarket(initMarketArgs)],
    ["CloseSlab", () => encodeCloseSlab()],
    ["ResolveMarket", () => encodeResolveMarket()],
    // v17: encodeWithdrawInsurance now requires amount arg (tag + u128 = 17 bytes)
    ["WithdrawInsurance", () => encodeWithdrawInsurance({ amount: "5000000" })],
  ];

  it.each(cases)(
    "%s: sequential byte read throws RangeError when ix data is shorter than encoded length",
    (_name, encode) => {
      assertTruncatedPayloadThrowsOnSequentialRead(encode());
    },
  );
});
