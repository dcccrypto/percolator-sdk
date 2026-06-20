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
  encodePermissionlessCrank,
  CrankAction,
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
  encodeUpdateAssetAuthority,
  ASSET_AUTH_KIND,
  encodeBatchTradeNoCpi,
  encodeBatchTradeCpi,
  encodeSetMatcherConfig,
  encodeRestartAssetOracle,
  encodeWithdrawInsuranceAsset,
  encodeTransferPortfolioOwnership,
  encodeSetNftProgramId,
  encodeCreateLpVaultV17,
  encodeDepositToLpVault,
  encodeRequestRedeemLpShares,
  encodeExecuteRedemption,
  encodeLpVaultCrankFees,
  encodeSetLpVaultPaused,
  encodeCloseLpVault,
  encodeKeeperCrank,
  encodeConfigureHybridOracle,
  encodeConfigureEwmaMark,
  encodePushEwmaMark,
  encodeConfigureAuthMark,
  encodePushAuthMark,
  encodeMatcherInitPassive,
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

function assertThrows(fn: () => unknown, msg: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, `${msg} must throw`);
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

// Decimal string inputs must be canonical decimal integers.
{
  assertThrows(() => encU64("0x10"), 'encU64("0x10")');
  assertThrows(() => encU64(" 10"), 'encU64(" 10")');
  assertThrows(() => encI64("+10"), 'encI64("+10")');
  assertThrows(() => encU128("01"), 'encU128("01")');
  assertThrows(() => encI128("1e3"), 'encI128("1e3")');
  console.log("✓ integer encoders reject non-decimal string forms");
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

// Test InitUser encoding (1 byte: tag only, no feePayment in v17)
// v17 wire: InitPortfolio decoder reads ZERO bytes after the tag.
// Sending extra bytes (e.g. an old u64 feePayment) causes garbage reads.
// feePayment arg is accepted for source-compat but is silently ignored.
{
  const data = encodeInitUser({ feePayment: "1000000" });
  assert(data.length === 1, "InitUser length");
  assert(data[0] === IX_TAG.InitUser, "InitUser tag byte");
  // No fee bytes — v17 InitPortfolio takes no arguments after the tag.
  const dataNoArgs = encodeInitUser();
  assert(dataNoArgs.length === 1, "InitUser length (no args)");
  assert(dataNoArgs[0] === IX_TAG.InitUser, "InitUser tag byte (no args)");
  console.log("✓ encodeInitUser");
}

// Test DepositCollateral encoding (17 bytes: tag + u128)
// v17 wire: userIdx(u16) removed; amount promoted u64→u128.
// userIdx arg is accepted for source-compat but is silently ignored.
{
  const data = encodeDepositCollateral({ userIdx: 5, amount: "1000000" });
  assert(data.length === 17, "DepositCollateral length");
  assert(data[0] === IX_TAG.DepositCollateral, "DepositCollateral tag byte");
  // amount=1000000 (u128 LE) at [1..17]: 0x0F4240 in low bytes, rest zero
  assertBuf(
    data.subarray(1, 17),
    [64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "DepositCollateral amount"
  );
  console.log("✓ encodeDepositCollateral");
}

// Test WithdrawCollateral encoding (17 bytes: tag + u128)
// v17 wire: userIdx(u16) removed; amount promoted u64→u128.
// userIdx arg is accepted for source-compat but is silently ignored.
{
  const data = encodeWithdrawCollateral({ userIdx: 10, amount: "500000" });
  assert(data.length === 17, "WithdrawCollateral length");
  assert(data[0] === IX_TAG.WithdrawCollateral, "WithdrawCollateral tag byte");
  // amount=500000 (u128 LE) at [1..17]: 0x07A120 in low bytes, rest zero
  assertBuf(
    data.subarray(1, 17),
    [32, 161, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "WithdrawCollateral amount"
  );
  console.log("✓ encodeWithdrawCollateral");
}

// Test encodeKeeperCrank throws (deprecated v12.17 wire — not accepted by v17 wrapper)
{
  let threw = false;
  try { encodeKeeperCrank({ callerIdx: 1 }); } catch { threw = true; }
  assert(threw, "encodeKeeperCrank must throw (v12 wire removed in v17)");
  console.log("✓ encodeKeeperCrank rejects removed v12 wire");
}

// Test encodePermissionlessCrank (v17 wire: 53 bytes)
// Wire: tag(1) + action(u8) + asset_index(u16) + now_slot(u64) +
//       funding_rate_e9=0n(i128) + close_q(u128) + fee_bps(u64) + recovery_reason(u8)
// Total: 1+1+2+8+16+16+8+1 = 53 bytes
{
  const data = encodePermissionlessCrank({
    action: CrankAction.FeeSweep,
    assetIndex: 0,
    nowSlot: 1000n,
    closeQ: 0n,
    feeBps: 0n,
    recoveryReason: 0,
  });
  assert(data.length === 53, `PermissionlessCrank length: expected 53, got ${data.length}`);
  assert(data[0] === IX_TAG.PermissionlessCrank, "PermissionlessCrank tag byte = 5");
  assert(data[1] === CrankAction.FeeSweep, "PermissionlessCrank action = 0 (FeeSweep)");
  assertBuf(data.subarray(2, 4), [0, 0], "PermissionlessCrank assetIndex=0 LE");
  // now_slot=1000 LE u64: [0xe8,0x03,0x00,0x00, 0x00,0x00,0x00,0x00]
  assertBuf(data.subarray(4, 12), [0xe8, 0x03, 0, 0, 0, 0, 0, 0], "PermissionlessCrank nowSlot=1000");
  // funding_rate_e9 hardcoded 0n (i128 LE = 16 zero bytes) at [12..28]
  assertBuf(
    data.subarray(12, 28),
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "PermissionlessCrank fundingRateE9=0n (hardcoded)"
  );
  // close_q=0n (u128 LE = 16 zero bytes) at [28..44]
  assertBuf(
    data.subarray(28, 44),
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "PermissionlessCrank closeQ=0"
  );
  // fee_bps=0n (u64 LE = 8 zero bytes) at [44..52]
  assertBuf(data.subarray(44, 52), [0, 0, 0, 0, 0, 0, 0, 0], "PermissionlessCrank feeBps=0");
  // recovery_reason=0 at [52]
  assert(data[52] === 0, "PermissionlessCrank recoveryReason=0");
  console.log("✓ encodePermissionlessCrank (v17 53-byte wire)");
}

// Test TradeNoCpi encoding (v17 wire: 28 bytes)
// Wire: tag(1) + asset_index(u16) + size_q(i128) + exec_price(u64) + fee_bps(u64)
// Total: 1+2+16+8+8 = 35 bytes
{
  const data = encodeTradeNoCpi({
    assetIndex: 1,
    sizeQ: 1_000_000n,
    execPrice: 50_000_000_000n,
    feeBps: 30n,
  });
  assert(data.length === 35, `TradeNoCpi v17 length: expected 35, got ${data.length}`);
  assert(data[0] === IX_TAG.TradeNoCpi, "TradeNoCpi tag byte = 6");
  // asset_index=1 at [1..3]
  assertBuf(data.subarray(1, 3), [1, 0], "TradeNoCpi assetIndex=1 LE");
  // size_q=1_000_000 at [3..19]: 1000000 = 0x0F4240 LE
  assertBuf(
    data.subarray(3, 19),
    [64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "TradeNoCpi sizeQ=1_000_000"
  );
  // exec_price=50_000_000_000 = 0xBA43B7400 LE = [0x00, 0x74, 0x3B, 0xA4, 0x0B, 0, 0, 0]
  assertBuf(
    data.subarray(19, 27),
    [0x00, 0x74, 0x3b, 0xa4, 0x0b, 0, 0, 0],
    "TradeNoCpi execPrice=50_000_000_000"
  );
  // fee_bps=30 at [27..35]
  assertBuf(data.subarray(27, 35), [30, 0, 0, 0, 0, 0, 0, 0], "TradeNoCpi feeBps=30");
  console.log("✓ encodeTradeNoCpi (v17 35-byte wire)");
}

// Test TradeNoCpi with negative size_q
{
  const data = encodeTradeNoCpi({
    assetIndex: 0,
    sizeQ: -1_000_000n,
    execPrice: 50_000_000_000n,
    feeBps: 30n,
  });
  assert(data.length === 35, "TradeNoCpi v17 negative length");
  // size_q=-1_000_000 (i128 LE) at [3..19]
  assertBuf(
    data.subarray(3, 19),
    [192, 189, 240, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    "TradeNoCpi sizeQ=-1_000_000"
  );
  console.log("✓ encodeTradeNoCpi (v17 negative sizeQ)");
}

// Test TradeCpi encoding (v17 wire)
// Wire: tag(1) + asset_index(u16) + size_q(i128) + fee_bps(u64) + limit_price(u64)
// Total: 1+2+16+8+8 = 35 bytes
{
  const data = encodeTradeCpi({
    assetIndex: 2,
    sizeQ: -500n,
    feeBps: 20n,
    limitPrice: 50_000_000_000n,
  });
  assert(data.length === 35, `TradeCpi v17 length: expected 35, got ${data.length}`);
  assert(data[0] === IX_TAG.TradeCpi, "TradeCpi tag byte = 10");
  // asset_index=2 at [1..3]
  assertBuf(data.subarray(1, 3), [2, 0], "TradeCpi assetIndex=2 LE");
  // size_q=-500 (i128 LE) at [3..19]
  const sizeBytes = data.subarray(3, 19);
  const sizeVal = decI128Le(sizeBytes, 0);
  assert(sizeVal === -500n, `TradeCpi sizeQ decode: expected -500n, got ${sizeVal}`);
  // fee_bps=20 at [19..27]
  assertBuf(data.subarray(19, 27), [20, 0, 0, 0, 0, 0, 0, 0], "TradeCpi feeBps=20");
  console.log("✓ encodeTradeCpi (v17 35-byte wire)");
}

// Test LiquidateAtOracle (tag 7) — REMOVED in v17, must throw
{
  let threw = false;
  try { encodeLiquidateAtOracle({ targetIdx: 42 }); } catch { threw = true; }
  assert(threw, "encodeLiquidateAtOracle rejects removed tag 7");
  console.log("✓ encodeLiquidateAtOracle rejects removed tag 7 (v17)");
}

// Test CloseAccount encoding (1 byte: tag only, no userIdx in v17)
// v17 wire: ClosePortfolio decoder reads ZERO bytes after the tag.
// Sending the old 3-byte payload (tag + u16 userIdx) causes InvalidInstructionData.
// userIdx arg is accepted for source-compat but is silently ignored.
{
  const data = encodeCloseAccount({ userIdx: 100 });
  assert(data.length === 1, "CloseAccount length");
  assert(data[0] === IX_TAG.CloseAccount, "CloseAccount tag byte");
  console.log("✓ encodeCloseAccount");
}

// Test TopUpInsurance encoding (17 bytes: tag + u128)
// v17 wire: amount promoted u64→u128; old 8-byte payload is 8 bytes short.
{
  const data = encodeTopUpInsurance({ amount: "5000000" });
  assert(data.length === 17, "TopUpInsurance length");
  assert(data[0] === IX_TAG.TopUpInsurance, "TopUpInsurance tag byte");
  // amount=5000000 (u128 LE) at [1..17]: 0x4C4B40 in low bytes, rest zero
  assertBuf(
    data.subarray(1, 17),
    [64, 75, 76, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "TopUpInsurance amount=5000000"
  );
  console.log("✓ encodeTopUpInsurance");
}

// Test SetRiskThreshold rejects removed tag 11
{
  let threw = false;
  try { encodeSetRiskThreshold({ newThreshold: "1000000000000" }); } catch { threw = true; }
  assert(threw, "encodeSetRiskThreshold rejects removed tag");
  console.log("✓ encodeSetRiskThreshold rejects removed tag");
}

// Test UpdateAdmin (tag 12) — REMOVED in v17, must throw
{
  const newAdmin = new PublicKey("11111111111111111111111111111111");
  let threw = false;
  try { encodeUpdateAdmin({ newAdmin }); } catch { threw = true; }
  assert(threw, "encodeUpdateAdmin rejects removed tag 12");
  console.log("✓ encodeUpdateAdmin rejects removed tag 12 (v17)");
}

// Test InitLP (tag 2) — REMOVED in v17, must throw
{
  const matcherProg = PublicKey.unique();
  const matcherCtx = PublicKey.unique();
  let threw = false;
  try {
    encodeInitLP({ matcherProgram: matcherProg, matcherContext: matcherCtx, feePayment: "1000000" });
  } catch { threw = true; }
  assert(threw, "encodeInitLP rejects removed tag 2");
  console.log("✓ encodeInitLP rejects removed tag 2 (v17)");
}

// Test InitMarket encoding (219 bytes total: v17 wire)
// v17 wire layout: tag(1) + max_portfolio_assets(u16=2) +
//   h_min(u64) + h_max(u64) + initial_price(u64) +
//   min_nonzero_mm_req(u128) + min_nonzero_im_req(u128) +
//   maintenance_margin_bps(u64) + initial_margin_bps(u64) +
//   max_trading_fee_bps(u64) + trade_fee_base_bps(u64) +
//   liquidation_fee_bps(u64) + liquidation_fee_cap(u128) + min_liquidation_abs(u128) +
//   max_price_move_bps_per_slot(u64) + max_accrual_dt_slots(u64) +
//   max_abs_funding_e9_per_slot(u64) + min_funding_lifetime_slots(u64) +
//   max_account_b_settlement_chunks(u64) + max_bankrupt_close_chunks(u64) +
//   max_bankrupt_close_lifetime_slots(u64) +
//   public_b_chunk_atoms(u128) + maintenance_fee_per_slot(u128)
// Sizes: 1 + 2 + u64×15(120) + u128×6(96) = 219 bytes total
//
// BREAKING vs v12.x: admin, collateralMint, feedId, staleness, conf, invert,
// unitScale and the 66-byte extended tail are NOT in the v17 wire. Those fields
// are provided as account metas or configured via ConfigureHybridOracle (tag 34).
// The v12 compat shim accepts old InitMarketArgs but silently ignores removed fields.
{
  // v12 InitMarketArgs — removed fields (admin, collateralMint, indexFeedId, etc.)
  // are silently ignored by the compat shim; only the risk param fields are encoded.
  const admin = PublicKey.unique();
  const mint = PublicKey.unique();
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
  // v17 wire: 219 bytes (tag + 22 risk-param fields; no header block, no extended tail).
  assert(data.length === 219, `InitMarket length: expected 219 (v17 wire), got ${data.length}`);
  assert(data[0] === IX_TAG.InitMarket, "InitMarket tag byte");
  console.log("✓ encodeInitMarket");
}

// ── TradeCpiV2 ABI tests (PERC-164) ──
// NOTE: In v17, tag 35 is ConfigureEwmaMark (toly). TradeCpiV2 tag (35) was removed
// from IX_TAG in v17 to avoid the collision. The encoder still throws at runtime.
{
  let threw = false;
  try { encodeTradeCpiV2({ lpIdx: 2, userIdx: 3, size: "1000000", bump: 254 }); } catch { threw = true; }
  assert(threw, "encodeTradeCpiV2 rejects removed tag");
  console.log("✓ encodeTradeCpiV2 rejects removed tag");
}

// ── v17 convergence: deprecated v12 encoder reject tests ────────────────────

// v12 encoders that COLLIDE with v17 tags now throw removedInstruction()
{
  let threw = false;
  try { encodeMintPositionNft({ userIdx: 5 }); } catch { threw = true; }
  assert(threw, "encodeMintPositionNft rejects (v12 tag 64 = v17 ForceCloseAbandonedAsset)");

  threw = false;
  try { encodeTransferPositionOwnership({ userIdx: 7 }); } catch { threw = true; }
  assert(threw, "encodeTransferPositionOwnership rejects (v12 tag 65 = v17 UpdateAssetAuthority)");

  threw = false;
  try { encodeBurnPositionNft({ userIdx: 12 }); } catch { threw = true; }
  assert(threw, "encodeBurnPositionNft rejects (v12 tag 66 = v17 BatchTradeNoCpi)");

  threw = false;
  try { encodeSetPendingSettlement({ userIdx: 3 }); } catch { threw = true; }
  assert(threw, "encodeSetPendingSettlement rejects (v12 tag 67 = v17 BatchTradeCpi)");

  threw = false;
  try { encodeClearPendingSettlement({ userIdx: 3 }); } catch { threw = true; }
  assert(threw, "encodeClearPendingSettlement rejects (v12 tag 68 = v17 SetMatcherConfig)");

  threw = false;
  try { encodeTransferOwnershipCpi({ userIdx: 2, newOwner: new PublicKey("11111111111111111111111111111111") }); } catch { threw = true; }
  assert(threw, "encodeTransferOwnershipCpi rejects (v12 tag 69 = v17 RestartAssetOracle)");

  threw = false;
  try { encodeSetWalletCap({ capE6: 0n }); } catch { threw = true; }
  assert(threw, "encodeSetWalletCap rejects (v12 tag 70 — not in v17)");

  threw = false;
  try { encodeSetOiImbalanceHardBlock({ thresholdBps: 8_000 }); } catch { threw = true; }
  assert(threw, "encodeSetOiImbalanceHardBlock rejects (v12 tag 71 — not in v17)");

  console.log("✓ v12 deprecated encoders (tags 64-71) all throw removedInstruction()");
}

// ── v17 NEW: UpdateAssetAuthority (tag 65) ────────────────────────────────────
// Wire: tag(1) + asset_index(u16) + kind(u8) + new_pubkey[32] = 36 bytes
{
  const newKey = new PublicKey("11111111111111111111111111111111");
  const data = encodeUpdateAssetAuthority({
    assetIndex: 0,
    kind: ASSET_AUTH_KIND.Insurance,
    newPubkey: newKey,
  });
  assert(data.length === 36, `UpdateAssetAuthority length: expected 36, got ${data.length}`);
  assert(data[0] === IX_TAG.UpdateAssetAuthority, "UpdateAssetAuthority tag = 65");
  assertBuf(data.subarray(1, 3), [0, 0], "UpdateAssetAuthority assetIndex=0 LE");
  assert(data[3] === ASSET_AUTH_KIND.Insurance, "UpdateAssetAuthority kind = Insurance (0)");
  // new_pubkey at [4..36] = all zeros for system pubkey
  const pkBytes = newKey.toBytes();
  assert(
    data.subarray(4, 36).every((v, i) => v === pkBytes[i]),
    "UpdateAssetAuthority new_pubkey bytes"
  );
  // Test ASSET_AUTH_KIND.AssetAdmin
  const dataAdmin = encodeUpdateAssetAuthority({
    assetIndex: 1,
    kind: ASSET_AUTH_KIND.AssetAdmin,
    newPubkey: newKey,
  });
  assert(dataAdmin[3] === ASSET_AUTH_KIND.AssetAdmin, "UpdateAssetAuthority kind = AssetAdmin (1)");
  assertBuf(dataAdmin.subarray(1, 3), [1, 0], "UpdateAssetAuthority assetIndex=1 LE");
  console.log("✓ encodeUpdateAssetAuthority (v17 36-byte wire)");
}

// ── v17 NEW: BatchTradeNoCpi (tag 66) ────────────────────────────────────────
// Wire: tag(1) + n_legs(u8) + [asset_index(u16) + size_q(i128) + exec_price(u64) + fee_bps(u64)]×n
// Per-leg: 2+16+8+8 = 34 bytes; header: 2 bytes; total 1 leg = 36 bytes
{
  const data = encodeBatchTradeNoCpi({
    legs: [
      { assetIndex: 0, sizeQ: 1_000_000n, execPrice: 50_000_000_000n, feeBps: 30n },
    ],
  });
  // 1(tag) + 1(n_legs) + 34(leg) = 36 bytes
  assert(data.length === 36, `BatchTradeNoCpi 1-leg length: expected 36, got ${data.length}`);
  assert(data[0] === IX_TAG.BatchTradeNoCpi, "BatchTradeNoCpi tag = 66");
  assert(data[1] === 1, "BatchTradeNoCpi n_legs=1");
  assertBuf(data.subarray(2, 4), [0, 0], "BatchTradeNoCpi leg.assetIndex=0 LE");
  // sizeQ=1_000_000 at [4..20]
  assertBuf(
    data.subarray(4, 20),
    [64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "BatchTradeNoCpi leg.sizeQ=1_000_000"
  );
  // fee_bps=30 at [28..36]
  assertBuf(data.subarray(28, 36), [30, 0, 0, 0, 0, 0, 0, 0], "BatchTradeNoCpi leg.feeBps=30");

  // 2-leg: 1+1+34+34 = 70 bytes
  const data2 = encodeBatchTradeNoCpi({
    legs: [
      { assetIndex: 0, sizeQ: 1_000_000n, execPrice: 50_000_000_000n, feeBps: 30n },
      { assetIndex: 1, sizeQ: -500_000n, execPrice: 40_000_000_000n, feeBps: 20n },
    ],
  });
  assert(data2.length === 70, `BatchTradeNoCpi 2-leg length: expected 70, got ${data2.length}`);
  assert(data2[1] === 2, "BatchTradeNoCpi n_legs=2");

  // Too many legs throws
  let threw = false;
  try {
    encodeBatchTradeNoCpi({ legs: new Array(256).fill({ assetIndex: 0, sizeQ: 0n, execPrice: 0n, feeBps: 0n }) });
  } catch { threw = true; }
  assert(threw, "encodeBatchTradeNoCpi rejects > 255 legs");

  console.log("✓ encodeBatchTradeNoCpi (v17)");
}

// ── v17 NEW: BatchTradeCpi (tag 67) ──────────────────────────────────────────
// Wire: tag(1) + n_legs(u8) + [asset_index(u16) + size_q(i128) + fee_bps(u64) + limit_price(u64)]×n
// Per-leg: 2+16+8+8 = 34 bytes; header: 2 bytes; total 1 leg = 36 bytes
{
  const data = encodeBatchTradeCpi({
    legs: [
      { assetIndex: 0, sizeQ: 1_000_000n, feeBps: 30n, limitPrice: 51_000_000_000n },
    ],
  });
  assert(data.length === 36, `BatchTradeCpi 1-leg length: expected 36, got ${data.length}`);
  assert(data[0] === IX_TAG.BatchTradeCpi, "BatchTradeCpi tag = 67");
  assert(data[1] === 1, "BatchTradeCpi n_legs=1");
  assertBuf(data.subarray(2, 4), [0, 0], "BatchTradeCpi leg.assetIndex=0 LE");
  // sizeQ=1_000_000 at [4..20]
  assertBuf(
    data.subarray(4, 20),
    [64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "BatchTradeCpi leg.sizeQ=1_000_000"
  );
  console.log("✓ encodeBatchTradeCpi (v17)");
}

// ── v17 NEW: SetMatcherConfig (tag 68) ────────────────────────────────────────
// Wire: tag(1) + enabled(u8) = 2 bytes
{
  const enable = encodeSetMatcherConfig({ enabled: 1 });
  assertBuf(enable, [68, 1], "SetMatcherConfig(enabled=1)");
  const disable = encodeSetMatcherConfig({ enabled: 0 });
  assertBuf(disable, [68, 0], "SetMatcherConfig(enabled=0)");
  let threw = false;
  try { encodeSetMatcherConfig({ enabled: 2 }); } catch { threw = true; }
  assert(threw, "SetMatcherConfig rejects enabled != 0|1");
  console.log("✓ encodeSetMatcherConfig (v17 2-byte wire)");
}

// ── v17 NEW: RestartAssetOracle (tag 69) ──────────────────────────────────────
// Wire: tag(1) + asset_index(u16) + now_slot(u64) + initial_price(u64) = 19 bytes
{
  const data = encodeRestartAssetOracle({
    assetIndex: 0,
    nowSlot: 1000n,
    initialPrice: 50_000_000_000n,
  });
  assert(data.length === 19, `RestartAssetOracle length: expected 19, got ${data.length}`);
  assert(data[0] === IX_TAG.RestartAssetOracle, "RestartAssetOracle tag = 69");
  assertBuf(data.subarray(1, 3), [0, 0], "RestartAssetOracle assetIndex=0 LE");
  // now_slot=1000 at [3..11]
  assertBuf(data.subarray(3, 11), [0xe8, 0x03, 0, 0, 0, 0, 0, 0], "RestartAssetOracle nowSlot=1000");
  console.log("✓ encodeRestartAssetOracle (v17 19-byte wire)");
}

// ── v17 NEW: WithdrawInsuranceAsset (tag 57) ──────────────────────────────────
// Wire: tag(1) + asset_index(u16) + amount(u128) = 19 bytes
{
  const data = encodeWithdrawInsuranceAsset({ assetIndex: 0, amount: 1_000_000n });
  assert(data.length === 19, `WithdrawInsuranceAsset length: expected 19, got ${data.length}`);
  assert(data[0] === IX_TAG.WithdrawInsuranceAsset, "WithdrawInsuranceAsset tag = 57");
  assertBuf(data.subarray(1, 3), [0, 0], "WithdrawInsuranceAsset assetIndex=0 LE");
  // amount=1_000_000 at [3..19]
  assertBuf(
    data.subarray(3, 19),
    [64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "WithdrawInsuranceAsset amount=1_000_000"
  );
  console.log("✓ encodeWithdrawInsuranceAsset (v17 19-byte wire)");
}

// ── v17 NFT B-3: TransferPortfolioOwnership (tag 72) ──────────────────────────
// Wire: tag(1) + new_owner[32] + asset_index(u16) = 35 bytes
{
  const newOwner = new PublicKey("11111111111111111111111111111111");
  const data = encodeTransferPortfolioOwnership({ newOwner, assetIndex: 0 });
  assert(data.length === 35, `TransferPortfolioOwnership length: expected 35, got ${data.length}`);
  assert(data[0] === IX_TAG.TransferPortfolioOwnership, "TransferPortfolioOwnership tag = 72");
  // new_owner at [1..33]
  const pkBytes = newOwner.toBytes();
  assert(
    data.subarray(1, 33).every((v, i) => v === pkBytes[i]),
    "TransferPortfolioOwnership new_owner bytes"
  );
  // asset_index=0 at [33..35]
  assertBuf(data.subarray(33, 35), [0, 0], "TransferPortfolioOwnership assetIndex=0 LE");
  console.log("✓ encodeTransferPortfolioOwnership (v17 35-byte wire)");
}

// ── v17 NFT B-3: SetNftProgramId (tag 73) ────────────────────────────────────
// Wire: tag(1) + nft_program_id[32] = 33 bytes
{
  const nftProg = new PublicKey("11111111111111111111111111111111");
  const data = encodeSetNftProgramId({ nftProgramId: nftProg });
  assert(data.length === 33, `SetNftProgramId length: expected 33, got ${data.length}`);
  assert(data[0] === IX_TAG.SetNftProgramId, "SetNftProgramId tag = 73");
  console.log("✓ encodeSetNftProgramId (v17 33-byte wire)");
}

// ── v17 LP-vault (tags 74-80) ─────────────────────────────────────────────────

// CreateLpVaultV17 (tag 74)
// Wire: tag(1) + fee_share_bps(u16) + redemption_cooldown_slots(u64) +
//       oi_reservation_threshold_bps(u16) + domain(u16) = 15 bytes
{
  const data = encodeCreateLpVaultV17({
    feeShareBps: 5000,
    redemptionCooldownSlots: 21600n,
    oiReservationThresholdBps: 8000,
    domain: 0,
  });
  assert(data.length === 15, `CreateLpVaultV17 length: expected 15, got ${data.length}`);
  assert(data[0] === IX_TAG.CreateLpVault, "CreateLpVaultV17 tag = 74");
  // fee_share_bps=5000=0x1388 LE at [1..3]
  assertBuf(data.subarray(1, 3), [0x88, 0x13], "CreateLpVaultV17 feeShareBps=5000");
  console.log("✓ encodeCreateLpVaultV17 (v17 15-byte wire)");
}

// DepositToLpVault (tag 75)
// Wire: tag(1) + amount(u128) = 17 bytes
{
  const data = encodeDepositToLpVault({ amount: 1_000_000n });
  assert(data.length === 17, `DepositToLpVault length: expected 17, got ${data.length}`);
  assert(data[0] === IX_TAG.DepositToLpVault, "DepositToLpVault tag = 75");
  assertBuf(
    data.subarray(1, 17),
    [64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "DepositToLpVault amount=1_000_000"
  );
  console.log("✓ encodeDepositToLpVault (v17 17-byte wire)");
}

// RequestRedeemLpShares (tag 76)
// Wire: tag(1) + shares(u128) = 17 bytes
{
  const data = encodeRequestRedeemLpShares({ shares: 500_000n });
  assert(data.length === 17, `RequestRedeemLpShares length: expected 17, got ${data.length}`);
  assert(data[0] === IX_TAG.RequestRedeemLpShares, "RequestRedeemLpShares tag = 76");
  console.log("✓ encodeRequestRedeemLpShares (v17 17-byte wire)");
}

// ExecuteRedemption (tag 77) — 1 byte
{
  const data = encodeExecuteRedemption();
  assert(data.length === 1, "ExecuteRedemption length=1");
  assertBuf(data, [77], "ExecuteRedemption tag=77");
  console.log("✓ encodeExecuteRedemption (v17 1-byte wire)");
}

// LpVaultCrankFees (tag 78) — 1 byte
{
  const data = encodeLpVaultCrankFees();
  assert(data.length === 1, "LpVaultCrankFees length=1");
  assertBuf(data, [78], "LpVaultCrankFees tag=78");
  console.log("✓ encodeLpVaultCrankFees (v17 1-byte wire)");
}

// SetLpVaultPaused (tag 79) — 2 bytes
{
  const pause = encodeSetLpVaultPaused({ paused: 1 });
  assertBuf(pause, [79, 1], "SetLpVaultPaused(paused=1)");
  const unpause = encodeSetLpVaultPaused({ paused: 0 });
  assertBuf(unpause, [79, 0], "SetLpVaultPaused(paused=0)");
  console.log("✓ encodeSetLpVaultPaused (v17 2-byte wire)");
}

// CloseLpVault (tag 80) — 1 byte
{
  const data = encodeCloseLpVault();
  assert(data.length === 1, "CloseLpVault length=1");
  assertBuf(data, [80], "CloseLpVault tag=80");
  console.log("✓ encodeCloseLpVault (v17 1-byte wire)");
}

// ── v17 IX_TAG completeness — verify core v17 tags ────────────────────────────
{
  assert(IX_TAG.UpdateAssetAuthority === 65, "IX_TAG.UpdateAssetAuthority=65");
  assert(IX_TAG.BatchTradeNoCpi === 66, "IX_TAG.BatchTradeNoCpi=66");
  assert(IX_TAG.BatchTradeCpi === 67, "IX_TAG.BatchTradeCpi=67");
  assert(IX_TAG.SetMatcherConfig === 68, "IX_TAG.SetMatcherConfig=68");
  assert(IX_TAG.RestartAssetOracle === 69, "IX_TAG.RestartAssetOracle=69");
  assert(IX_TAG.TransferPortfolioOwnership === 72, "IX_TAG.TransferPortfolioOwnership=72");
  assert(IX_TAG.SetNftProgramId === 73, "IX_TAG.SetNftProgramId=73");
  assert(IX_TAG.CreateLpVault === 74, "IX_TAG.CreateLpVault=74");
  assert(IX_TAG.DepositToLpVault === 75, "IX_TAG.DepositToLpVault=75");
  assert(IX_TAG.RequestRedeemLpShares === 76, "IX_TAG.RequestRedeemLpShares=76");
  assert(IX_TAG.ExecuteRedemption === 77, "IX_TAG.ExecuteRedemption=77");
  assert(IX_TAG.LpVaultCrankFees === 78, "IX_TAG.LpVaultCrankFees=78");
  assert(IX_TAG.SetLpVaultPaused === 79, "IX_TAG.SetLpVaultPaused=79");
  assert(IX_TAG.CloseLpVault === 80, "IX_TAG.CloseLpVault=80");
  assert(IX_TAG.WithdrawInsuranceAsset === 57, "IX_TAG.WithdrawInsuranceAsset=57");
  assert(IX_TAG.ConfigureHybridOracle === 34, "IX_TAG.ConfigureHybridOracle=34");
  assert(IX_TAG.ConfigureEwmaMark === 35, "IX_TAG.ConfigureEwmaMark=35");
  assert(IX_TAG.PushEwmaMark === 36, "IX_TAG.PushEwmaMark=36");
  assert(IX_TAG.ConfigureAuthMark === 62, "IX_TAG.ConfigureAuthMark=62");
  assert(IX_TAG.PushAuthMark === 63, "IX_TAG.PushAuthMark=63");
  // Deprecated v12 aliases still have their collision-documented values
  assert(IX_TAG.MintPositionNft === 64, "IX_TAG.MintPositionNft=64 (deprecated, collides ForceCloseAbandonedAsset)");
  assert(IX_TAG.TransferPositionOwnership === 65, "IX_TAG.TransferPositionOwnership=65 (deprecated, collides UpdateAssetAuthority)");
  assert(IX_TAG.SetWalletCap === 70, "IX_TAG.SetWalletCap=70 (deprecated, not in v17)");
  assert(IX_TAG.SetOiImbalanceHardBlock === 71, "IX_TAG.SetOiImbalanceHardBlock=71 (deprecated, not in v17)");
  console.log("✓ v17 IX_TAG completeness (all new v17 tags present)");
}

// ── TASK A: oracle-config encoders (tags 34, 35, 36, 62, 63) ─────────────────

// Test encodeConfigureHybridOracle — 156-byte wire
// Wire: tag(1) + asset_index(u16=2bytes) + now_slot(u64=8) + now_unix_ts(i64=8) +
//       oracle_leg_count(u8=1) + oracle_leg_flags(u8=1) + max_staleness_secs(u64=8) +
//       hybrid_soft_stale_slots(u64=8) + mark_ewma_halflife_slots(u64=8) +
//       mark_min_fee(u64=8) + invert(u8=1) + unit_scale(u32=4) + conf_filter_bps(u16=2) +
//       oracle_leg_feeds[0..3](3×32=96) = 1+2+8+8+1+1+8+8+8+8+1+4+2+96 = 156 bytes
{
  const feed0 = PublicKey.unique();
  const feed1 = PublicKey.default;
  const feed2 = PublicKey.default;
  const data = encodeConfigureHybridOracle({
    assetIndex: 1,
    nowSlot: 300_000_000n,
    nowUnixTs: 1_700_000_000n,
    oracleLegCount: 1,
    oracleLegFlags: 0,
    maxStalenessSecs: 60n,
    hybridSoftStaleSlots: 100n,
    markEwmaHalflifeSlots: 500n,
    markMinFee: 0n,
    invert: 0,
    unitScale: 1_000_000,
    confFilterBps: 200,
    oracleLegFeeds: [feed0, feed1, feed2],
  });
  assert(data.length === 156, `encodeConfigureHybridOracle length: expected 156, got ${data.length}`);
  assert(data[0] === IX_TAG.ConfigureHybridOracle, "ConfigureHybridOracle tag byte");
  // asset_index=1 at [1..3] little-endian
  assertBuf(data.subarray(1, 3), [1, 0], "ConfigureHybridOracle asset_index=1");
  // oracle_leg_count=1 at [19]
  assert(data[19] === 1, "ConfigureHybridOracle oracle_leg_count=1");
  // feed0 starts at [60] (1+2+8+8+1+1+8+8+8+8+1+4+2=60)
  const feedBytes = feed0.toBytes();
  assert(data.slice(60, 92).every((v, i) => v === feedBytes[i]), "ConfigureHybridOracle feed0 bytes");
  console.log("✓ encodeConfigureHybridOracle (156-byte wire)");
}

// Test encodeConfigureEwmaMark — 35-byte wire
// Wire: tag(1) + asset_index(u16) + now_slot(u64) + initial_mark_e6(u64) +
//       mark_ewma_halflife_slots(u64) + mark_min_fee(u64) = 1+2+8+8+8+8 = 35 bytes
{
  const data = encodeConfigureEwmaMark({
    assetIndex: 2,
    nowSlot: 400_000_000n,
    initialMarkE6: 50_000_000_000n,
    markEwmaHalflifeSlots: 500n,
    markMinFee: 0n,
  });
  assert(data.length === 35, `encodeConfigureEwmaMark length: expected 35, got ${data.length}`);
  assert(data[0] === IX_TAG.ConfigureEwmaMark, "ConfigureEwmaMark tag byte");
  assertBuf(data.subarray(1, 3), [2, 0], "ConfigureEwmaMark asset_index=2");
  console.log("✓ encodeConfigureEwmaMark (35-byte wire)");
}

// Test encodePushEwmaMark — 19-byte wire
// Wire: tag(1) + asset_index(u16) + now_slot(u64) + mark_e6(u64) = 1+2+8+8 = 19 bytes
{
  const data = encodePushEwmaMark({
    assetIndex: 2,
    nowSlot: 400_000_001n,
    markE6: 50_100_000_000n,
  });
  assert(data.length === 19, `encodePushEwmaMark length: expected 19, got ${data.length}`);
  assert(data[0] === IX_TAG.PushEwmaMark, "PushEwmaMark tag byte");
  assertBuf(data.subarray(1, 3), [2, 0], "PushEwmaMark asset_index=2");
  console.log("✓ encodePushEwmaMark (19-byte wire)");
}

// Test encodeConfigureAuthMark — 19-byte wire
// Wire: tag(1) + asset_index(u16) + now_slot(u64) + initial_mark_e6(u64) = 1+2+8+8 = 19 bytes
{
  const data = encodeConfigureAuthMark({
    assetIndex: 3,
    nowSlot: 300_000_000n,
    initialMarkE6: 25_000_000_000n,
  });
  assert(data.length === 19, `encodeConfigureAuthMark length: expected 19, got ${data.length}`);
  assert(data[0] === IX_TAG.ConfigureAuthMark, "ConfigureAuthMark tag byte");
  assertBuf(data.subarray(1, 3), [3, 0], "ConfigureAuthMark asset_index=3");
  console.log("✓ encodeConfigureAuthMark (19-byte wire)");
}

// Test encodePushAuthMark — 19-byte wire
// Wire: tag(1) + asset_index(u16) + now_slot(u64) + mark_e6(u64) = 1+2+8+8 = 19 bytes
{
  const data = encodePushAuthMark({
    assetIndex: 3,
    nowSlot: 300_000_001n,
    markE6: 25_050_000_000n,
  });
  assert(data.length === 19, `encodePushAuthMark length: expected 19, got ${data.length}`);
  assert(data[0] === IX_TAG.PushAuthMark, "PushAuthMark tag byte");
  assertBuf(data.subarray(1, 3), [3, 0], "PushAuthMark asset_index=3");
  console.log("✓ encodePushAuthMark (19-byte wire)");
}

// ── TASK B: matcher passive-init payload ──────────────────────────────────────

// Test encodeMatcherInitPassive — 66-byte wire to matcher program
// Layout: [0]=2, [1]=0, [2..10]=0, [10..14]=100u32LE, [14..34]=0, [34..50]=max_fill_abs u128LE, [50..66]=0
{
  const maxFillAbs = 2n ** 128n - 1n; // u128::MAX
  const data = encodeMatcherInitPassive({ maxFillAbs });
  assert(data.length === 66, `encodeMatcherInitPassive length: expected 66, got ${data.length}`);
  assert(data[0] === 2, "encodeMatcherInitPassive opcode=2");
  assert(data[1] === 0, "encodeMatcherInitPassive reserved[1]=0");
  // [10..14] = 100u32 LE
  assertBuf(data.subarray(10, 14), [100, 0, 0, 0], "encodeMatcherInitPassive [10..14]=100u32");
  // [34..50] = max_fill_abs = u128::MAX = all 0xFF bytes
  assertBuf(
    data.subarray(34, 50),
    [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    "encodeMatcherInitPassive max_fill_abs=u128::MAX"
  );
  // [50..66] = 0
  assert(data.subarray(50, 66).every(v => v === 0), "encodeMatcherInitPassive [50..66]=0");
  console.log("✓ encodeMatcherInitPassive (66-byte matcher payload)");
}

// Test encodeMatcherInitPassive with a finite max_fill_abs
{
  const maxFillAbs = 1_000_000_000_000_000_000n; // 1e18
  const data = encodeMatcherInitPassive({ maxFillAbs });
  assert(data.length === 66, "encodeMatcherInitPassive finite max_fill_abs length=66");
  // [34..42] should encode 1e18 in LE (0x0DE0B6B3A7640000)
  const lo = 1_000_000_000_000_000_000n & 0xffff_ffff_ffff_ffffn;
  const expectedLo = new DataView(new ArrayBuffer(8));
  expectedLo.setBigUint64(0, lo, true);
  const loBytes = new Uint8Array(expectedLo.buffer);
  assert(data.subarray(34, 42).every((v, i) => v === loBytes[i]), "encodeMatcherInitPassive finite max_fill_abs low bytes");
  console.log("✓ encodeMatcherInitPassive finite max_fill_abs");
}

console.log("\n✅ All tests passed!");
