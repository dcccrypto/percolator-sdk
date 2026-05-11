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

describe("IX_TAG values", () => {
  it("has correct tags", () => {
    expect(IX_TAG.InitMarket).toBe(0);
    expect(IX_TAG.InitUser).toBe(1);
    expect(IX_TAG.InitLP).toBe(2);
    expect(IX_TAG.DepositCollateral).toBe(3);
    expect(IX_TAG.WithdrawCollateral).toBe(4);
    expect(IX_TAG.KeeperCrank).toBe(5);
    expect(IX_TAG.TradeNoCpi).toBe(6);
    expect(IX_TAG.TradeCpi).toBe(10);
    expect(IX_TAG.ResolveMarket).toBe(19);
    expect(IX_TAG.WithdrawInsurance).toBe(20);
  });
});

describe("instruction encoders", () => {
  it("encodeInitUser produces 9 bytes", () => {
    const data = encodeInitUser({ feePayment: "1000000" });
    expect(data.length).toBe(9);
    expect(data[0]).toBe(IX_TAG.InitUser);
  });

  it("encodeDepositCollateral produces 11 bytes", () => {
    const data = encodeDepositCollateral({ userIdx: 5, amount: "1000000" });
    expect(data.length).toBe(11);
    expect(data[0]).toBe(IX_TAG.DepositCollateral);
  });

  it("encodeWithdrawCollateral produces 11 bytes", () => {
    const data = encodeWithdrawCollateral({ userIdx: 10, amount: "500000" });
    expect(data.length).toBe(11);
    expect(data[0]).toBe(IX_TAG.WithdrawCollateral);
  });

  it("encodeKeeperCrank produces 4 bytes (empty candidates)", () => {
    const data = encodeKeeperCrank({ callerIdx: 1 });
    expect(data.length).toBe(4);
    expect(data[0]).toBe(IX_TAG.KeeperCrank);
    expect(data[3]).toBe(1); // format_version = 1
  });

  it("encodeTradeNoCpi produces 21 bytes", () => {
    const data = encodeTradeNoCpi({ lpIdx: 0, userIdx: 1, size: "1000000" });
    expect(data.length).toBe(21);
    expect(data[0]).toBe(IX_TAG.TradeNoCpi);
  });

  it("encodeTradeNoCpi with negative size", () => {
    const data = encodeTradeNoCpi({ lpIdx: 0, userIdx: 1, size: "-1000000" });
    expect(data.length).toBe(21);
    expect(data[5]).toBe(192); // -1000000 LE first byte
  });

  it("encodeTradeCpi produces 29 bytes", () => {
    const data = encodeTradeCpi({ lpIdx: 2, userIdx: 3, size: "-500", limitPriceE6: "0" });
    expect(data.length).toBe(29);
    expect(data[0]).toBe(IX_TAG.TradeCpi);
  });

  it("encodeLiquidateAtOracle produces 3 bytes", () => {
    const data = encodeLiquidateAtOracle({ targetIdx: 42 });
    expect(data.length).toBe(3);
    expect(data[0]).toBe(IX_TAG.LiquidateAtOracle);
  });

  it("encodeCloseAccount produces 3 bytes", () => {
    const data = encodeCloseAccount({ userIdx: 100 });
    expect(data.length).toBe(3);
    expect(data[0]).toBe(IX_TAG.CloseAccount);
  });

  it("encodeTopUpInsurance produces 9 bytes", () => {
    const data = encodeTopUpInsurance({ amount: "5000000" });
    expect(data.length).toBe(9);
    expect(data[0]).toBe(IX_TAG.TopUpInsurance);
  });

  it("encodeSetRiskThreshold rejects removed tag 11", () => {
    expect(() => encodeSetRiskThreshold({ newThreshold: "1000000000000" })).toThrow(/tag 11/i);
  });

  it("encodeUpdateAdmin produces 33 bytes", () => {
    const data = encodeUpdateAdmin({ newAdmin: new PublicKey("11111111111111111111111111111111") });
    expect(data.length).toBe(33);
    expect(data[0]).toBe(IX_TAG.UpdateAdmin);
  });

  it("encodeInitLP produces 73 bytes", () => {
    const data = encodeInitLP({ matcherProgram: PublicKey.unique(), matcherContext: PublicKey.unique(), feePayment: "1000000" });
    expect(data.length).toBe(73);
    expect(data[0]).toBe(IX_TAG.InitLP);
  });

  it("encodeInitMarket produces 370-byte payload (304 base + 66 ext tail)", () => {
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
    expect(data.length).toBe(370);
    expect(data[0]).toBe(IX_TAG.InitMarket);
  });

  it("encodeInitMarket rejects non-hex feed ID", () => {
    const args = {
      admin: PublicKey.unique(), collateralMint: PublicKey.unique(),
      indexFeedId: "g".repeat(64),
      maxStalenessSecs: "60", confFilterBps: 50, invert: 0, unitScale: 0, initialMarkPriceE6: "0",
      warmupPeriodSlots: "1000", maintenanceMarginBps: "500", initialMarginBps: "1000",
      tradingFeeBps: "10", maxAccounts: "1000", newAccountFee: "1000000",
      riskReductionThreshold: "1000000000", maintenanceFeePerSlot: "100",
      maxCrankStalenessSlots: "50", liquidationFeeBps: "100", liquidationFeeCap: "10000000",
      liquidationBufferBps: "50", minLiquidationAbs: "1000000",
    };
    expect(() => encodeInitMarket(args)).toThrow("non-hex");
  });

  it("encodeInitMarket rejects wrong-length feed ID", () => {
    const args = {
      admin: PublicKey.unique(), collateralMint: PublicKey.unique(),
      indexFeedId: "abcd",
      maxStalenessSecs: "60", confFilterBps: 50, invert: 0, unitScale: 0, initialMarkPriceE6: "0",
      warmupPeriodSlots: "1000", maintenanceMarginBps: "500", initialMarginBps: "1000",
      tradingFeeBps: "10", maxAccounts: "1000", newAccountFee: "1000000",
      riskReductionThreshold: "1000000000", maintenanceFeePerSlot: "100",
      maxCrankStalenessSlots: "50", liquidationFeeBps: "100", liquidationFeeCap: "10000000",
      liquidationBufferBps: "50", minLiquidationAbs: "1000000",
    };
    expect(() => encodeInitMarket(args)).toThrow("4 chars");
  });

  it("encodeInitMarket accepts 0x-prefixed feed ID", () => {
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
    expect(data.length).toBe(370);
  });

  // Wave 9: v2 extended tail with max_price_move_bps_per_slot override
  it("encodeInitMarket emits 378-byte payload with v2 extended tail (max_price_move override)", () => {
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
    // 304 base + 74 v2 tail = 378
    expect(data.length).toBe(378);
    // Last 8 bytes are max_price_move_bps_per_slot u64 LE = 7
    const tailStart = data.length - 8;
    const view = new DataView(data.buffer, data.byteOffset + tailStart, 8);
    expect(view.getBigUint64(0, true)).toBe(7n);
  });

  it("encodeInitMarket rejects zero maxPriceMoveBpsPerSlot in v2 tail", () => {
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
    ).toThrow("must be > 0");
  });

  it("encodeCloseSlab produces 1 byte", () => {
    expect(encodeCloseSlab().length).toBe(1);
    expect(encodeCloseSlab()[0]).toBe(IX_TAG.CloseSlab);
  });

  it("encodeResolveMarket produces 1 byte", () => {
    expect(encodeResolveMarket()[0]).toBe(IX_TAG.ResolveMarket);
  });

  it("encodeWithdrawInsurance produces 1 byte", () => {
    expect(encodeWithdrawInsurance()[0]).toBe(IX_TAG.WithdrawInsurance);
  });

  it("removed and disabled encoders throw instead of emitting dead bytes", () => {
    expect(() => encodeTradeCpiV2({ lpIdx: 2, userIdx: 3, size: "1000000", bump: 254 })).toThrow(/tag 35/i);
    expect(() => encodeUnresolveMarket({ confirmation: "1" })).toThrow(/tag 36/i);
    expect(() => encodeSetMaintenanceFee({ newFee: "0" })).toThrow(/tag 15/i);
    expect(() => encodeUpdateRiskParams({ initialMarginBps: "1", maintenanceMarginBps: "1" })).toThrow(/tag 22/i);
    expect(() => encodeRenounceAdmin()).toThrow(/tag 23/i);
    expect(() => encodeSetPythOracle({ feedId: new Uint8Array(32), maxStalenessSecs: 1n, confFilterBps: 1 })).toThrow(/tag 32/i);
    expect(() => encodeUpdateMarkPrice()).toThrow(/tag 33/i);
    expect(() => encodeSetInsuranceIsolation({ bps: 1 })).toThrow(/tag 42/i);
    expect(() => encodeSlashCreationDeposit()).toThrow(/tag 58/i);
    // PERC-628 shared-vault encoders (tags 59-63) are unconditionally enabled in v12.19.
    // Their old "throw without target" gate was removed when the v12.17 dual-target was dropped.
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

  const updateConfigArgs = {
    fundingHorizonSlots: "0",
    fundingKBps: "0",
    fundingMaxPremiumBps: "0",
    fundingMaxBpsPerSlot: "0",
  } as const;

  const cases: [string, () => Uint8Array][] = [
    ["InitUser", () => encodeInitUser({ feePayment: "1000000" })],
    ["DepositCollateral", () => encodeDepositCollateral({ userIdx: 5, amount: "1000000" })],
    ["WithdrawCollateral", () => encodeWithdrawCollateral({ userIdx: 10, amount: "500000" })],
    ["KeeperCrank", () => encodeKeeperCrank({ callerIdx: 1 })],
    ["TradeNoCpi", () => encodeTradeNoCpi({ lpIdx: 0, userIdx: 1, size: "1000000" })],
    ["TradeCpi", () => encodeTradeCpi({ lpIdx: 2, userIdx: 3, size: "-500", limitPriceE6: "0" })],
    ["LiquidateAtOracle", () => encodeLiquidateAtOracle({ targetIdx: 42 })],
    ["CloseAccount", () => encodeCloseAccount({ userIdx: 100 })],
    ["TopUpInsurance", () => encodeTopUpInsurance({ amount: "5000000" })],
    ["UpdateAdmin", () => encodeUpdateAdmin({ newAdmin: new PublicKey("11111111111111111111111111111111") })],
    ["InitLP", () =>
      encodeInitLP({
        matcherProgram: PublicKey.unique(),
        matcherContext: PublicKey.unique(),
        feePayment: "1000000",
      }),
    ],
    ["InitMarket", () => encodeInitMarket(initMarketArgs)],
    ["CloseSlab", () => encodeCloseSlab()],
    ["UpdateConfig", () => encodeUpdateConfig(updateConfigArgs)],
    ["SetOraclePriceCap", () => encodeSetOraclePriceCap({ maxChangeE2bps: "1000" })],
    ["ResolveMarket", () => encodeResolveMarket()],
    ["WithdrawInsurance", () => encodeWithdrawInsurance()],
  ];

  it.each(cases)(
    "%s: sequential byte read throws RangeError when ix data is shorter than encoded length",
    (_name, encode) => {
      assertTruncatedPayloadThrowsOnSequentialRead(encode());
    },
  );
});
