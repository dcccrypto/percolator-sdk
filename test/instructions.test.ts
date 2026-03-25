import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  encodeInitMarket, encodeInitUser, encodeInitLP,
  encodeDepositCollateral, encodeWithdrawCollateral,
  encodeKeeperCrank, encodeTradeNoCpi, encodeTradeCpi, encodeTradeCpiV2,
  encodeLiquidateAtOracle, encodeCloseAccount,
  encodeTopUpInsurance, encodeSetRiskThreshold, encodeUpdateAdmin,
  encodeCloseSlab, encodeUpdateConfig, encodeSetMaintenanceFee,
  encodeSetOracleAuthority, encodePushOraclePrice, encodeSetOraclePriceCap,
  encodeResolveMarket, encodeWithdrawInsurance,
  IX_TAG,
} from "../src/abi/instructions.js";

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

  it("encodeKeeperCrank produces 4 bytes", () => {
    const data = encodeKeeperCrank({ callerIdx: 1, allowPanic: true });
    expect(data.length).toBe(4);
    expect(data[0]).toBe(IX_TAG.KeeperCrank);
    expect(data[3]).toBe(1);
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

  it("encodeTradeCpi produces 21 bytes", () => {
    const data = encodeTradeCpi({ lpIdx: 2, userIdx: 3, size: "-500" });
    expect(data.length).toBe(21);
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

  it("encodeSetRiskThreshold produces 17 bytes", () => {
    const data = encodeSetRiskThreshold({ newThreshold: "1000000000000" });
    expect(data.length).toBe(17);
    expect(data[0]).toBe(IX_TAG.SetRiskThreshold);
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

  it("encodeInitMarket produces 264 bytes", () => {
    const data = encodeInitMarket({
      admin: PublicKey.unique(), collateralMint: PublicKey.unique(),
      indexFeedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
      maxStalenessSecs: "60", confFilterBps: 50, invert: 0, unitScale: 0, initialMarkPriceE6: "0",
      warmupPeriodSlots: "1000", maintenanceMarginBps: "500", initialMarginBps: "1000",
      tradingFeeBps: "10", maxAccounts: "1000", newAccountFee: "1000000",
      riskReductionThreshold: "1000000000", maintenanceFeePerSlot: "100",
      maxCrankStalenessSlots: "50", liquidationFeeBps: "100", liquidationFeeCap: "10000000",
      liquidationBufferBps: "50", minLiquidationAbs: "1000000",
    });
    expect(data.length).toBe(264);
    expect(data[0]).toBe(IX_TAG.InitMarket);
  });

  it("encodeCloseSlab produces 1 byte", () => {
    expect(encodeCloseSlab().length).toBe(1);
    expect(encodeCloseSlab()[0]).toBe(IX_TAG.CloseSlab);
  });

  it("encodePushOraclePrice produces 17 bytes", () => {
    const data = encodePushOraclePrice({ priceE6: "50000000", timestamp: "1700000000" });
    expect(data.length).toBe(17);
    expect(data[0]).toBe(IX_TAG.PushOraclePrice);
  });

  it("encodeResolveMarket produces 1 byte", () => {
    expect(encodeResolveMarket()[0]).toBe(IX_TAG.ResolveMarket);
  });

  it("encodeWithdrawInsurance produces 1 byte", () => {
    expect(encodeWithdrawInsurance()[0]).toBe(IX_TAG.WithdrawInsurance);
  });
});

// GH#19: encodeTradeCpiV2 — PERC-154 optimized trade CPI with caller-provided bump
describe("GH#19: encodeTradeCpiV2", () => {
  it("produces 22 bytes (1 tag + 2 lpIdx + 2 userIdx + 16 size + 1 bump)", () => {
    const data = encodeTradeCpiV2({ lpIdx: 0, userIdx: 1, size: "1000000", bump: 255 });
    expect(data.length).toBe(22);
  });

  it("first byte is IX_TAG.TradeCpiV2 (35)", () => {
    const data = encodeTradeCpiV2({ lpIdx: 0, userIdx: 0, size: "0", bump: 0 });
    expect(data[0]).toBe(IX_TAG.TradeCpiV2);
    expect(IX_TAG.TradeCpiV2).toBe(35);
  });

  it("encodes bump as last byte", () => {
    const data = encodeTradeCpiV2({ lpIdx: 0, userIdx: 0, size: "0", bump: 123 });
    expect(data[21]).toBe(123);
  });

  it("encodes negative size (short trade)", () => {
    // Should not throw — encI128 handles negative values
    expect(() => encodeTradeCpiV2({ lpIdx: 1, userIdx: 2, size: "-500000", bump: 254 })).not.toThrow();
    const data = encodeTradeCpiV2({ lpIdx: 1, userIdx: 2, size: "-500000", bump: 254 });
    expect(data.length).toBe(22);
    expect(data[0]).toBe(35);
    expect(data[21]).toBe(254);
  });

  it("matches encodeTradeCpi in first 21 bytes for same lpIdx/userIdx/size", () => {
    // TradeCpiV2 is TradeCpi + bump byte — first 21 bytes should encode same data
    // except byte 0 (different opcode)
    const v1 = encodeTradeCpi({ lpIdx: 3, userIdx: 7, size: "1000" });
    const v2 = encodeTradeCpiV2({ lpIdx: 3, userIdx: 7, size: "1000", bump: 0 });
    // Bytes 1-20 (lpIdx, userIdx, size) should be identical
    for (let i = 1; i < 21; i++) {
      expect(v2[i]).toBe(v1[i]);
    }
  });
});
