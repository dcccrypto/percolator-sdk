import { PublicKey } from "@solana/web3.js";
import {
  encU8,
  encU16,
  encU32,
  encU64,
  encI64,
  encU128,
  encI128,
  encPubkey,
} from "../src/abi/encode.js";
import {
  encodeInitMarket,
  encodeInitUser,
  encodeDepositCollateral,
  encodeWithdrawCollateral,
  encodeKeeperCrank,
  encodeTradeNoCpi,
  encodeTradeCpi,
  encodeTradeCpiV2,
  encodeLiquidateAtOracle,
  encodeCloseAccount,
  encodeTopUpInsurance,
  encodeSetRiskThreshold,
  encodeUpdateAdmin,
  encodeInitLP,
  encodeSetOiImbalanceHardBlock,
  encodeSetWalletCap,
  encodeMintPositionNft,
  encodeTransferPositionOwnership,
  encodeBurnPositionNft,
  encodeSetPendingSettlement,
  encodeClearPendingSettlement,
  encodeTransferOwnershipCpi,
  IX_TAG,
} from "../src/abi/instructions.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function assertBuf(actual: Uint8Array, expected: number[], msg: string): void {
  const exp = new Uint8Array(expected);
  if (actual.length !== exp.length || actual.some((v, i) => v !== exp[i])) {
    throw new Error(
      `FAIL: ${msg}\n  expected: [${[...exp].join(", ")}]\n  actual:   [${[...actual].join(", ")}]`
    );
  }
}

function decI128Le(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 16; i++) value |= BigInt(data[offset + i]) << BigInt(i * 8);
  if (value >= (1n << 127n)) value -= (1n << 128n);
  return value;
}

console.log("Testing encode functions...\n");

// Test encU8
{
  assertBuf(encU8(0), [0], "encU8(0)");
  assertBuf(encU8(255), [255], "encU8(255)");
  assertBuf(encU8(127), [127], "encU8(127)");
  console.log("✓ encU8");
}

// Test encU16
{
  assertBuf(encU16(0), [0, 0], "encU16(0)");
  assertBuf(encU16(1), [1, 0], "encU16(1)");
  assertBuf(encU16(256), [0, 1], "encU16(256)");
  assertBuf(encU16(0xabcd), [0xcd, 0xab], "encU16(0xabcd)");
  assertBuf(encU16(65535), [255, 255], "encU16(65535)");
  console.log("✓ encU16");
}

// encU8 / encU16 / encU32: reject out-of-range values (DataView would modulo-wrap; u8 used to mask)
{
  const mustThrow = (fn: () => void, label: string): void => {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    assert(threw, `${label} must throw`);
  };
  mustThrow(() => encU8(256), "encU8(256)");
  mustThrow(() => encU8(-1), "encU8(-1)");
  mustThrow(() => encU8(1.5), "encU8(1.5)");
  mustThrow(() => encU16(65536), "encU16(65536)");
  mustThrow(() => encU16(-1), "encU16(-1)");
  mustThrow(() => encU32(4_294_967_296), "encU32(2^32)");
  mustThrow(() => encU32(-1), "encU32(-1)");
  assertBuf(encU32(4_294_967_295), [255, 255, 255, 255], "encU32(max)");
  console.log("✓ encU8/encU16/encU32 range checks");
}

// Test encU64
{
  assertBuf(encU64(0n), [0, 0, 0, 0, 0, 0, 0, 0], "encU64(0)");
  assertBuf(encU64(1n), [1, 0, 0, 0, 0, 0, 0, 0], "encU64(1)");
  assertBuf(encU64(256n), [0, 1, 0, 0, 0, 0, 0, 0], "encU64(256)");
  assertBuf(encU64("1000000"), [64, 66, 15, 0, 0, 0, 0, 0], "encU64(1000000)");
  assertBuf(
    encU64(0xffff_ffff_ffff_ffffn),
    [255, 255, 255, 255, 255, 255, 255, 255],
    "encU64(max)"
  );
  console.log("✓ encU64");
}

// Test encI64
{
  assertBuf(encI64(0n), [0, 0, 0, 0, 0, 0, 0, 0], "encI64(0)");
  assertBuf(encI64(1n), [1, 0, 0, 0, 0, 0, 0, 0], "encI64(1)");
  assertBuf(encI64(-1n), [255, 255, 255, 255, 255, 255, 255, 255], "encI64(-1)");
  assertBuf(encI64(-2n), [254, 255, 255, 255, 255, 255, 255, 255], "encI64(-2)");
  assertBuf(encI64("-100"), [156, 255, 255, 255, 255, 255, 255, 255], "encI64(-100)");
  console.log("✓ encI64");
}

// Test encU128
{
  assertBuf(
    encU128(0n),
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "encU128(0)"
  );
  assertBuf(
    encU128(1n),
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "encU128(1)"
  );
  // 2^64 should have lo=0, hi=1
  assertBuf(
    encU128(1n << 64n),
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    "encU128(2^64)"
  );
  // Large value: 0x0102030405060708_090a0b0c0d0e0f10
  const large = 0x0102030405060708_090a0b0c0d0e0f10n;
  assertBuf(
    encU128(large),
    [0x10, 0x0f, 0x0e, 0x0d, 0x0c, 0x0b, 0x0a, 0x09, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01],
    "encU128(large)"
  );
  console.log("✓ encU128");
}

// Test encI128
{
  assertBuf(
    encI128(0n),
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "encI128(0)"
  );
  assertBuf(
    encI128(1n),
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "encI128(1)"
  );
  assertBuf(
    encI128(-1n),
    [255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    "encI128(-1)"
  );
  assertBuf(
    encI128(-2n),
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    "encI128(-2)"
  );
  // Test a positive value that fits in i128
  assertBuf(
    encI128(1000000n),
    [64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "encI128(1000000)"
  );
  // Test negative large value: -1000000
  assertBuf(
    encI128(-1000000n),
    [192, 189, 240, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    "encI128(-1000000)"
  );
  console.log("✓ encI128");
}

// Test encPubkey
{
  const pk = new PublicKey("11111111111111111111111111111111");
  const buf = encPubkey(pk);
  assert(buf.length === 32, "encPubkey length");
  const pkBytes = pk.toBytes();
  assert(buf.length === pkBytes.length && buf.every((v, i) => v === pkBytes[i]), "encPubkey value");
  console.log("✓ encPubkey");
}

console.log("\nTesting instruction encoders...\n");

// Test instruction tags
{
  assert(IX_TAG.InitMarket === 0, "InitMarket tag");
  assert(IX_TAG.InitUser === 1, "InitUser tag");
  assert(IX_TAG.InitLP === 2, "InitLP tag");
  assert(IX_TAG.DepositCollateral === 3, "DepositCollateral tag");
  assert(IX_TAG.WithdrawCollateral === 4, "WithdrawCollateral tag");
  assert(IX_TAG.KeeperCrank === 5, "KeeperCrank tag");
  assert(IX_TAG.TradeNoCpi === 6, "TradeNoCpi tag");
  assert(IX_TAG.LiquidateAtOracle === 7, "LiquidateAtOracle tag");
  assert(IX_TAG.CloseAccount === 8, "CloseAccount tag");
  assert(IX_TAG.TopUpInsurance === 9, "TopUpInsurance tag");
  assert(IX_TAG.TradeCpi === 10, "TradeCpi tag");
  assert(IX_TAG.SetRiskThreshold === 11, "SetRiskThreshold tag");
  assert(IX_TAG.UpdateAdmin === 12, "UpdateAdmin tag");
  console.log("✓ IX_TAG values");
}

// Test InitUser encoding (9 bytes: tag + u64)
{
  const data = encodeInitUser({ feePayment: "1000000" });
  assert(data.length === 9, "InitUser length");
  assert(data[0] === IX_TAG.InitUser, "InitUser tag byte");
  // fee = 1000000 = 0x0F4240 LE
  assertBuf(data.subarray(1, 9), [64, 66, 15, 0, 0, 0, 0, 0], "InitUser fee");
  console.log("✓ encodeInitUser");
}

// Test DepositCollateral encoding (11 bytes: tag + u16 + u64)
{
  const data = encodeDepositCollateral({ userIdx: 5, amount: "1000000" });
  assert(data.length === 11, "DepositCollateral length");
  assert(data[0] === IX_TAG.DepositCollateral, "DepositCollateral tag byte");
  assertBuf(data.subarray(1, 3), [5, 0], "DepositCollateral userIdx");
  assertBuf(data.subarray(3, 11), [64, 66, 15, 0, 0, 0, 0, 0], "DepositCollateral amount");
  console.log("✓ encodeDepositCollateral");
}

// Test WithdrawCollateral encoding (11 bytes: tag + u16 + u64)
{
  const data = encodeWithdrawCollateral({ userIdx: 10, amount: "500000" });
  assert(data.length === 11, "WithdrawCollateral length");
  assert(data[0] === IX_TAG.WithdrawCollateral, "WithdrawCollateral tag byte");
  assertBuf(data.subarray(1, 3), [10, 0], "WithdrawCollateral userIdx");
  console.log("✓ encodeWithdrawCollateral");
}

// Test KeeperCrank encoding (v12.17: tag + u16 + format_version=1 + candidates)
{
  const data = encodeKeeperCrank({
    callerIdx: 1,
  });
  assert(data.length === 4, "KeeperCrank length (empty candidates)");
  assert(data[0] === IX_TAG.KeeperCrank, "KeeperCrank tag byte");
  assertBuf(data.subarray(1, 3), [1, 0], "KeeperCrank callerIdx");
  assert(data[3] === 1, "KeeperCrank format_version=1");
  console.log("✓ encodeKeeperCrank");
}

// Test TradeNoCpi encoding (21 bytes: tag + u16 + u16 + i128)
{
  const data = encodeTradeNoCpi({ lpIdx: 0, userIdx: 1, size: "1000000" });
  assert(data.length === 21, "TradeNoCpi length");
  assert(data[0] === IX_TAG.TradeNoCpi, "TradeNoCpi tag byte");
  assertBuf(data.subarray(1, 3), [0, 0], "TradeNoCpi lpIdx");
  assertBuf(data.subarray(3, 5), [1, 0], "TradeNoCpi userIdx");
  console.log("✓ encodeTradeNoCpi");
}

// Test TradeNoCpi with negative size
{
  const data = encodeTradeNoCpi({ lpIdx: 0, userIdx: 1, size: "-1000000" });
  assert(data.length === 21, "TradeNoCpi negative length");
  // Verify the i128 encoding of -1000000
  const sizeBytes = data.subarray(5, 21);
  assertBuf(
    sizeBytes,
    [192, 189, 240, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    "TradeNoCpi negative size"
  );
  console.log("✓ encodeTradeNoCpi (negative size)");
}

// Test TradeCpi encoding (29 bytes: tag + u16 + u16 + i128 + u64)
{
  const data = encodeTradeCpi({ lpIdx: 2, userIdx: 3, size: "-500", limitPriceE6: "50000000" });
  assert(data.length === 29, "TradeCpi length");
  assert(data[0] === IX_TAG.TradeCpi, "TradeCpi tag byte");
  assertBuf(data.subarray(1, 3), [2, 0], "TradeCpi lpIdx");
  assertBuf(data.subarray(3, 5), [3, 0], "TradeCpi userIdx");
  console.log("✓ encodeTradeCpi");
}

// Test LiquidateAtOracle encoding (3 bytes: tag + u16)
{
  const data = encodeLiquidateAtOracle({ targetIdx: 42 });
  assert(data.length === 3, "LiquidateAtOracle length");
  assert(data[0] === IX_TAG.LiquidateAtOracle, "LiquidateAtOracle tag byte");
  assertBuf(data.subarray(1, 3), [42, 0], "LiquidateAtOracle targetIdx");
  console.log("✓ encodeLiquidateAtOracle");
}

// Test CloseAccount encoding (3 bytes: tag + u16)
{
  const data = encodeCloseAccount({ userIdx: 100 });
  assert(data.length === 3, "CloseAccount length");
  assert(data[0] === IX_TAG.CloseAccount, "CloseAccount tag byte");
  assertBuf(data.subarray(1, 3), [100, 0], "CloseAccount userIdx");
  console.log("✓ encodeCloseAccount");
}

// Test TopUpInsurance encoding (9 bytes: tag + u64)
{
  const data = encodeTopUpInsurance({ amount: "5000000" });
  assert(data.length === 9, "TopUpInsurance length");
  assert(data[0] === IX_TAG.TopUpInsurance, "TopUpInsurance tag byte");
  console.log("✓ encodeTopUpInsurance");
}

// Test SetRiskThreshold rejects removed tag 11
{
  let threw = false;
  try { encodeSetRiskThreshold({ newThreshold: "1000000000000" }); } catch { threw = true; }
  assert(threw, "encodeSetRiskThreshold rejects removed tag");
  console.log("✓ encodeSetRiskThreshold rejects removed tag");
}

// Test UpdateAdmin encoding (33 bytes: tag + pubkey)
{
  const newAdmin = new PublicKey("11111111111111111111111111111111");
  const data = encodeUpdateAdmin({ newAdmin });
  assert(data.length === 33, "UpdateAdmin length");
  assert(data[0] === IX_TAG.UpdateAdmin, "UpdateAdmin tag byte");
  const adminBytes = newAdmin.toBytes();
  const dataPk = data.subarray(1, 33);
  assert(
    dataPk.length === adminBytes.length && dataPk.every((v, i) => v === adminBytes[i]),
    "UpdateAdmin pubkey"
  );
  console.log("✓ encodeUpdateAdmin");
}

// Test InitLP encoding (73 bytes: tag + pubkey + pubkey + u64)
{
  // Use keypair-generated valid pubkeys
  const matcherProg = PublicKey.unique();
  const matcherCtx = PublicKey.unique();
  const data = encodeInitLP({
    matcherProgram: matcherProg,
    matcherContext: matcherCtx,
    feePayment: "1000000",
  });
  assert(data.length === 73, "InitLP length");
  assert(data[0] === IX_TAG.InitLP, "InitLP tag byte");
  console.log("✓ encodeInitLP");
}

// Test InitMarket encoding (360 bytes total: v12.15 adds hMax(8) to end of RiskParams)
// Layout: tag(1) + admin(32) + mint(32) + indexFeedId(32) +
//         maxStaleSecs(8) + confFilter(2) + invert(1) + unitScale(4) +
//         markPrice(8) + maxMaintFee(16) + maxInsFloor(16) + minOracleCap(8) +
//         RiskParams: hMin(8)+mmBps(8)+...+minIm(16)+hMax(8) = 200 bytes [+8 for hMax]
{
  // Use keypair-generated valid pubkeys
  const admin = PublicKey.unique();
  const mint = PublicKey.unique();
  // Pyth feed ID for BTC/USD (example)
  const indexFeedId = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

  const data = encodeInitMarket({
    admin,
    collateralMint: mint,
    indexFeedId,
    maxStalenessSecs: "60",
    confFilterBps: 50,
    invert: 0,
    unitScale: 0,
    initialMarkPriceE6: "0",  // Standard market (not Hyperp)
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
  });
  assert(data.length === 344, `InitMarket length: expected 344, got ${data.length}`);
  assert(data[0] === IX_TAG.InitMarket, "InitMarket tag byte");
  console.log("✓ encodeInitMarket");
}

// ── TradeCpiV2 ABI tests (PERC-164) ──
const TRADE_CPI_V2_TAG = 35;
assert(IX_TAG.TradeCpiV2 === TRADE_CPI_V2_TAG, "TradeCpiV2 IX_TAG parity");

// TradeCpiV2 was removed on-chain. Keep the tag constant for parity, but fail fast client-side.
{
  let threw = false;
  try { encodeTradeCpiV2({ lpIdx: 2, userIdx: 3, size: "1000000", bump: 254 }); } catch { threw = true; }
  assert(threw, "encodeTradeCpiV2 rejects removed tag");
  console.log("✓ encodeTradeCpiV2 rejects removed tag");
}

// ── PERC-608 / PERC-8111: New instruction encoders ──────────────────────────

// Test SetOiImbalanceHardBlock (tag=71)
{
  const data = encodeSetOiImbalanceHardBlock({ thresholdBps: 8_000 });
  assertBuf(data, [71, 64, 31], "SetOiImbalanceHardBlock(8000) bytes"); // 8000 = 0x1F40 LE = [0x40, 0x1F]
  assert(data.length === 3, "SetOiImbalanceHardBlock length=3");

  const zero = encodeSetOiImbalanceHardBlock({ thresholdBps: 0 });
  assertBuf(zero, [71, 0, 0], "SetOiImbalanceHardBlock(0) disables");

  const max = encodeSetOiImbalanceHardBlock({ thresholdBps: 10_000 });
  assert(max.length === 3, "SetOiImbalanceHardBlock(10000) length=3");

  let threw = false;
  try { encodeSetOiImbalanceHardBlock({ thresholdBps: 10_001 }); } catch { threw = true; }
  assert(threw, "SetOiImbalanceHardBlock rejects >10_000");

  console.log("✓ encodeSetOiImbalanceHardBlock");
}

// Test SetWalletCap (tag=70)
{
  const data = encodeSetWalletCap({ capE6: 1_000_000_000n }); // $1K
  assert(data.length === 9, "SetWalletCap length=9");
  assert(data[0] === IX_TAG.SetWalletCap, "SetWalletCap tag=70");

  // LE u64: 1_000_000_000 = 0x3B9ACA00 → [0x00, 0xCA, 0x9A, 0x3B, 0, 0, 0, 0]
  assertBuf(data, [70, 0x00, 0xCA, 0x9A, 0x3B, 0, 0, 0, 0], "SetWalletCap($1K) bytes");

  const disable = encodeSetWalletCap({ capE6: 0n });
  assertBuf(disable, [70, 0, 0, 0, 0, 0, 0, 0, 0], "SetWalletCap(0) disables");

  console.log("✓ encodeSetWalletCap");
}

// Test MintPositionNft (tag=64)
{
  const data = encodeMintPositionNft({ userIdx: 5 });
  assert(data.length === 3, "MintPositionNft length=3");
  assertBuf(data, [64, 5, 0], "MintPositionNft(userIdx=5)");
  assert(data[0] === IX_TAG.MintPositionNft, "MintPositionNft tag=64");
  console.log("✓ encodeMintPositionNft");
}

// Test TransferPositionOwnership (tag=65)
{
  const data = encodeTransferPositionOwnership({ userIdx: 7 });
  assert(data.length === 3, "TransferPositionOwnership length=3");
  assertBuf(data, [65, 7, 0], "TransferPositionOwnership(userIdx=7)");
  assert(data[0] === IX_TAG.TransferPositionOwnership, "TransferPositionOwnership tag=65");
  console.log("✓ encodeTransferPositionOwnership");
}

// Test BurnPositionNft (tag=66)
{
  const data = encodeBurnPositionNft({ userIdx: 12 });
  assert(data.length === 3, "BurnPositionNft length=3");
  assertBuf(data, [66, 12, 0], "BurnPositionNft(userIdx=12)");
  assert(data[0] === IX_TAG.BurnPositionNft, "BurnPositionNft tag=66");
  console.log("✓ encodeBurnPositionNft");
}

// Test SetPendingSettlement (tag=67)
{
  const data = encodeSetPendingSettlement({ userIdx: 3 });
  assert(data.length === 3, "SetPendingSettlement length=3");
  assertBuf(data, [67, 3, 0], "SetPendingSettlement(userIdx=3)");
  console.log("✓ encodeSetPendingSettlement");
}

// Test ClearPendingSettlement (tag=68)
{
  const data = encodeClearPendingSettlement({ userIdx: 3 });
  assert(data.length === 3, "ClearPendingSettlement length=3");
  assertBuf(data, [68, 3, 0], "ClearPendingSettlement(userIdx=3)");
  console.log("✓ encodeClearPendingSettlement");
}

// Test TransferOwnershipCpi (tag=69)
{
  const newOwner = new PublicKey("11111111111111111111111111111111");
  const data = encodeTransferOwnershipCpi({ userIdx: 2, newOwner });
  assert(data.length === 35, "TransferOwnershipCpi length=35 (tag+u16+pubkey)");
  assert(data[0] === IX_TAG.TransferOwnershipCpi, "TransferOwnershipCpi tag=69");
  assert(data[1] === 2 && data[2] === 0, "TransferOwnershipCpi userIdx=2 LE");
  console.log("✓ encodeTransferOwnershipCpi");
}

// Test IX_TAG completeness — verify tags 64–71 all present
{
  assert(IX_TAG.MintPositionNft === 64, "IX_TAG.MintPositionNft=64");
  assert(IX_TAG.TransferPositionOwnership === 65, "IX_TAG.TransferPositionOwnership=65");
  assert(IX_TAG.BurnPositionNft === 66, "IX_TAG.BurnPositionNft=66");
  assert(IX_TAG.SetPendingSettlement === 67, "IX_TAG.SetPendingSettlement=67");
  assert(IX_TAG.ClearPendingSettlement === 68, "IX_TAG.ClearPendingSettlement=68");
  assert(IX_TAG.TransferOwnershipCpi === 69, "IX_TAG.TransferOwnershipCpi=69");
  assert(IX_TAG.SetWalletCap === 70, "IX_TAG.SetWalletCap=70");
  assert(IX_TAG.SetOiImbalanceHardBlock === 71, "IX_TAG.SetOiImbalanceHardBlock=71");
  console.log("✓ IX_TAG completeness (tags 64–71)");
}

console.log("\n✅ All tests passed!");
