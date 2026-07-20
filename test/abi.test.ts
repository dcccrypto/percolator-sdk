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
  derivePythPriceUpdateAccount,
  encodeWithdrawProtocolFee,
  encodeUpdateFeeSplit,
  encodeWithdrawInsuranceReserveToStake,
  encodeUpdateMaintenanceFeePerSlot,
  encodeUpdateTradeFeePolicy,
  validateFeeSplit,
  FEE_SPLIT,
  encodeSetProtocolFeeAuthority,
  IX_TAG,
} from "../src/abi/instructions.js";
import {
  parseWrapperConfigV17,
  V17_WRAPPER_CONFIG_LEN,
  V17_HEADER_LEN,
} from "../src/solana/slab.js";

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

async function assertRejects(fn: () => Promise<unknown>, msg: string): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  assert(threw, `${msg} must reject`);
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

// Test derivePythPriceUpdateAccount input validation
{
  const feed = new Uint8Array(32);
  const pda0 = await derivePythPriceUpdateAccount(feed, 0);
  const pdaMaxShard = await derivePythPriceUpdateAccount(feed, 0xffff);
  assert(typeof pda0 === "string" && pda0.length > 0, "derivePythPriceUpdateAccount returns a PDA");
  assert(typeof pdaMaxShard === "string" && pdaMaxShard.length > 0, "derivePythPriceUpdateAccount accepts shard u16 max");
  await assertRejects(
    () => derivePythPriceUpdateAccount(new Uint8Array(31), 0),
    "derivePythPriceUpdateAccount short feedId",
  );
  await assertRejects(
    () => derivePythPriceUpdateAccount(new Uint8Array(33), 0),
    "derivePythPriceUpdateAccount long feedId",
  );
  await assertRejects(
    () => derivePythPriceUpdateAccount(feed, 65536),
    "derivePythPriceUpdateAccount shard wrap",
  );
  await assertRejects(
    () => derivePythPriceUpdateAccount(feed, 1.5),
    "derivePythPriceUpdateAccount fractional shard",
  );
  console.log("✓ derivePythPriceUpdateAccount validation");
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

// Test encodePermissionlessCrank (v17 W3 wire: 29 bytes)
// FIX W3 (upstream wrapper #206): close_q(u128)/fee_bps(u64) are REMOVED from
// the wire — liquidation size/fee are engine-selected, not caller-supplied.
// Wire: tag(1) + action(u8) + asset_index(u16) + now_slot(u64) +
//       funding_rate_e9=0n(i128) + recovery_reason(u8)
// Total: 1+1+2+8+16+1 = 29 bytes
// PINNED: this must stay 29 bytes. A regression back to the pre-W3 53-byte
// layout (re-adding close_q/fee_bps) MUST fail this assertion.
{
  const data = encodePermissionlessCrank({
    action: CrankAction.FeeSweep,
    assetIndex: 0,
    nowSlot: 1000n,
    recoveryReason: 0,
  });
  assert(data.length === 29, `PermissionlessCrank length: expected 29 (W3 wire), got ${data.length}`);
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
  // recovery_reason=0 at [28] (close_q/fee_bps no longer on the wire — W3)
  assert(data[28] === 0, "PermissionlessCrank recoveryReason=0");
  // Exact-bytes pin: the full 29-byte payload, byte for byte.
  assertBuf(
    data,
    [
      IX_TAG.PermissionlessCrank, CrankAction.FeeSweep, 0, 0,      // tag, action, assetIndex(u16)
      0xe8, 0x03, 0, 0, 0, 0, 0, 0,                                 // nowSlot=1000 (u64)
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,               // fundingRateE9=0 (i128)
      0,                                                             // recoveryReason
    ],
    "PermissionlessCrank full 29-byte wire pin"
  );
  console.log("✓ encodePermissionlessCrank (v17 W3 29-byte wire)");
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
  threw = false;
  try {
    encodeBatchTradeNoCpi({ legs: [] });
  } catch { threw = true; }
  assert(threw, "encodeBatchTradeNoCpi rejects empty legs");

  threw = false;
  try {
    encodeBatchTradeNoCpi({
      legs: [
        { assetIndex: 0, sizeQ: 1_000_000n, execPrice: 50_000_000_000n, feeBps: 10_001n },
      ],
    });
  } catch { threw = true; }
  assert(threw, "encodeBatchTradeNoCpi rejects feeBps > 10000");

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
  let threw = false;
  try {
    encodeBatchTradeCpi({ legs: [] });
  } catch { threw = true; }
  assert(threw, "encodeBatchTradeCpi rejects empty legs");

  threw = false;
  try {
    encodeBatchTradeCpi({
      legs: [
        { assetIndex: 0, sizeQ: 1_000_000n, feeBps: 10_001n, limitPrice: 51_000_000_000n },
      ],
    });
  } catch { threw = true; }
  assert(threw, "encodeBatchTradeCpi rejects feeBps > 10000");
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

// encodeConfigureHybridOracle must reject leg counts that cannot fit the 3-feed wire.
{
  const baseArgs = {
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
    oracleLegFeeds: [PublicKey.default, PublicKey.default, PublicKey.default],
  } as const;
  assertThrows(
    () => encodeConfigureHybridOracle({ ...baseArgs, oracleLegCount: 0 }),
    "ConfigureHybridOracle oracle_leg_count=0",
  );
  assertThrows(
    () => encodeConfigureHybridOracle({ ...baseArgs, oracleLegCount: 4 }),
    "ConfigureHybridOracle oracle_leg_count=4",
  );
  assertThrows(
    () => encodeConfigureHybridOracle({ ...baseArgs, oracleLegCount: 1.5 }),
    "ConfigureHybridOracle fractional oracle_leg_count",
  );
  console.log("✓ encodeConfigureHybridOracle oracle_leg_count validation");
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

// Regression: oracle mark encoders reject zero mark values and zero halflife
{
  let oracleMarkThrew = false;
  try {
    encodeConfigureEwmaMark({
      assetIndex: 1,
      nowSlot: 300_000_000n,
      initialMarkE6: 0n,
      markEwmaHalflifeSlots: 500n,
      markMinFee: 0n,
    });
  } catch {
    oracleMarkThrew = true;
  }
  assert(oracleMarkThrew, "encodeConfigureEwmaMark rejects zero initialMarkE6");

  oracleMarkThrew = false;
  try {
    encodeConfigureEwmaMark({
      assetIndex: 1,
      nowSlot: 300_000_000n,
      initialMarkE6: 50_000_000_000n,
      markEwmaHalflifeSlots: 0n,
      markMinFee: 0n,
    });
  } catch {
    oracleMarkThrew = true;
  }
  assert(
    oracleMarkThrew,
    "encodeConfigureEwmaMark rejects zero markEwmaHalflifeSlots",
  );

  oracleMarkThrew = false;
  try {
    encodePushEwmaMark({
      assetIndex: 1,
      nowSlot: 300_000_001n,
      markE6: 0n,
    });
  } catch {
    oracleMarkThrew = true;
  }
  assert(oracleMarkThrew, "encodePushEwmaMark rejects zero markE6");

  oracleMarkThrew = false;
  try {
    encodeConfigureAuthMark({
      assetIndex: 1,
      nowSlot: 300_000_000n,
      initialMarkE6: 0n,
    });
  } catch {
    oracleMarkThrew = true;
  }
  assert(oracleMarkThrew, "encodeConfigureAuthMark rejects zero initialMarkE6");

  oracleMarkThrew = false;
  try {
    encodePushAuthMark({
      assetIndex: 1,
      nowSlot: 300_000_001n,
      markE6: 0n,
    });
  } catch {
    oracleMarkThrew = true;
  }
  assert(oracleMarkThrew, "encodePushAuthMark rejects zero markE6");

console.log("✓ encodePushAuthMark (19-byte wire)");
}

// Regression: oracle mark encoders reject zero mark values and zero halflife
{
  let oracleMarkThrew = false;
  try {
    encodeConfigureEwmaMark({
      assetIndex: 1,
      nowSlot: 300_000_000n,
      initialMarkE6: 0n,
      markEwmaHalflifeSlots: 500n,
      markMinFee: 0n,
    });
  } catch {
    oracleMarkThrew = true;
  }
  assert(oracleMarkThrew, "encodeConfigureEwmaMark rejects zero initialMarkE6");

  oracleMarkThrew = false;
  try {
    encodeConfigureEwmaMark({
      assetIndex: 1,
      nowSlot: 300_000_000n,
      initialMarkE6: 50_000_000_000n,
      markEwmaHalflifeSlots: 0n,
      markMinFee: 0n,
    });
  } catch {
    oracleMarkThrew = true;
  }
  assert(
    oracleMarkThrew,
    "encodeConfigureEwmaMark rejects zero markEwmaHalflifeSlots",
  );

  oracleMarkThrew = false;
  try {
    encodePushEwmaMark({
      assetIndex: 1,
      nowSlot: 300_000_001n,
      markE6: 0n,
    });
  } catch {
    oracleMarkThrew = true;
  }
  assert(oracleMarkThrew, "encodePushEwmaMark rejects zero markE6");

  oracleMarkThrew = false;
  try {
    encodeConfigureAuthMark({
      assetIndex: 1,
      nowSlot: 300_000_000n,
      initialMarkE6: 0n,
    });
  } catch {
    oracleMarkThrew = true;
  }
  assert(oracleMarkThrew, "encodeConfigureAuthMark rejects zero initialMarkE6");

  oracleMarkThrew = false;
  try {
    encodePushAuthMark({
      assetIndex: 1,
      nowSlot: 300_000_001n,
      markE6: 0n,
    });
  } catch {
    oracleMarkThrew = true;
  }
  assert(oracleMarkThrew, "encodePushAuthMark rejects zero markE6");

  console.log("✓ oracle mark encoders reject zero values");
}
// ── TASK B: matcher passive-init payload ─────────────────────────────

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

// ── Protocol-fee program change (tags 84/85) ─────────────────────────────────
// Renumbered 2026-07-15: WithdrawProtocolFee 83→84, SetProtocolFeeAuthority
// 84→85, freeing tag 83 for InitMatcherCtx (confirmed live on the deployed
// wrapper percolator-prog@e26c97a4 by forensic rebuild + live
// simulateTransaction — see ~/v17/DECISIONS-LEDGER.md).

// WithdrawProtocolFee (tag 84)
// Wire: tag(1) + amount(u128) = 17 bytes
{
  const data = encodeWithdrawProtocolFee({ amount: 1_000_000n });
  assert(data.length === 17, `WithdrawProtocolFee length: expected 17, got ${data.length}`);
  assert(data[0] === IX_TAG.WithdrawProtocolFee, "WithdrawProtocolFee tag = 84");
  assert(data[0] === 84, "WithdrawProtocolFee tag literal = 84");
  assertBuf(
    data.subarray(1, 17),
    [64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "WithdrawProtocolFee amount=1_000_000"
  );
  console.log("✓ encodeWithdrawProtocolFee (v17 17-byte wire, tag 84)");
}

// WithdrawProtocolFee (tag 84) — amount=0 means "withdraw all"
{
  const data = encodeWithdrawProtocolFee({ amount: 0n });
  assert(data.length === 17, "WithdrawProtocolFee amount=0 length=17");
  assert(data[0] === 84, "WithdrawProtocolFee amount=0 tag=84");
  assert(data.subarray(1, 17).every(v => v === 0), "WithdrawProtocolFee amount=0 payload all zero");
  console.log("✓ encodeWithdrawProtocolFee amount=0 (withdraw-all sentinel)");
}

// SetProtocolFeeAuthority (tag 85)
// Wire: tag(1) + new_authority(32) = 33 bytes
{
  const newAuthority = new PublicKey("11111111111111111111111111111111");
  const data = encodeSetProtocolFeeAuthority({ newAuthority });
  assert(data.length === 33, `SetProtocolFeeAuthority length: expected 33, got ${data.length}`);
  assert(data[0] === IX_TAG.SetProtocolFeeAuthority, "SetProtocolFeeAuthority tag = 85");
  assert(data[0] === 85, "SetProtocolFeeAuthority tag literal = 85");
  const pkBytes = newAuthority.toBytes();
  assert(
    data.subarray(1, 33).every((v, i) => v === pkBytes[i]),
    "SetProtocolFeeAuthority new_authority bytes"
  );
  console.log("✓ encodeSetProtocolFeeAuthority (v17 33-byte wire, tag 85)");
}

// Tags 83/84/85 are distinct: InitMatcherCtx keeps tag 83 (confirmed live on
// the deployed wrapper), WithdrawProtocolFee=84, SetProtocolFeeAuthority=85.
{
  assert(IX_TAG.InitMatcherCtx === 83, "IX_TAG.InitMatcherCtx === 83");
  assert(IX_TAG.WithdrawProtocolFee === 84, "IX_TAG.WithdrawProtocolFee === 84");
  assert(IX_TAG.SetProtocolFeeAuthority === 85, "IX_TAG.SetProtocolFeeAuthority === 85");
  assert(IX_TAG.InitMatcherCtx !== IX_TAG.WithdrawProtocolFee, "83 !== 84");
  assert(IX_TAG.WithdrawProtocolFee !== IX_TAG.SetProtocolFeeAuthority, "84 !== 85");
  assert(IX_TAG.InitMatcherCtx !== IX_TAG.SetProtocolFeeAuthority, "83 !== 85");
  console.log("✓ IX_TAG.InitMatcherCtx (83) / WithdrawProtocolFee (84) / SetProtocolFeeAuthority (85) distinct");
}

// ── Protocol-fee WrapperConfigV17 tail fields (offsets 432/464/480, config len 576) ──
{
  assert(V17_WRAPPER_CONFIG_LEN === 576, `V17_WRAPPER_CONFIG_LEN: expected 576, got ${V17_WRAPPER_CONFIG_LEN}`);

  const buf = new Uint8Array(V17_HEADER_LEN + V17_WRAPPER_CONFIG_LEN);
  const dv = new DataView(buf.buffer);
  const configOff = V17_HEADER_LEN;

  const protocolFeeAuthority = new PublicKey("So11111111111111111111111111111111111111112");
  buf.set(protocolFeeAuthority.toBytes(), configOff + 432);

  const accrued = 123_456_789_012_345_678_901n; // > u64::MAX, exercises the high u64 word
  const withdrawn = 999_999n;
  dv.setBigUint64(configOff + 464, accrued & 0xffff_ffff_ffff_ffffn, true);
  dv.setBigUint64(configOff + 464 + 8, accrued >> 64n, true);
  dv.setBigUint64(configOff + 480, withdrawn & 0xffff_ffff_ffff_ffffn, true);
  dv.setBigUint64(configOff + 480 + 8, withdrawn >> 64n, true);

  const cfg = parseWrapperConfigV17(buf);
  assert(
    cfg.protocolFeeAuthority.equals(protocolFeeAuthority),
    "parseWrapperConfigV17 protocolFeeAuthority @432"
  );
  assert(
    cfg.protocolFeeAccruedAtoms === accrued,
    `parseWrapperConfigV17 protocolFeeAccruedAtoms @464: expected ${accrued}, got ${cfg.protocolFeeAccruedAtoms}`
  );
  assert(
    cfg.protocolFeeWithdrawnAtoms === withdrawn,
    `parseWrapperConfigV17 protocolFeeWithdrawnAtoms @480: expected ${withdrawn}, got ${cfg.protocolFeeWithdrawnAtoms}`
  );
  console.log("✓ parseWrapperConfigV17 protocol-fee tail fields (432/464/480, within the 576-byte config)");
}

// parseWrapperConfigV17 rejects a pre-protocol-fee-sized (432-byte config / 448-byte total) buffer
{
  const shortBuf = new Uint8Array(V17_HEADER_LEN + 432); // old WRAPPER_CONFIG_LEN
  let threw = false;
  try {
    parseWrapperConfigV17(shortBuf);
  } catch {
    threw = true;
  }
  assert(threw, "parseWrapperConfigV17 rejects a 448-byte (pre-protocol-fee) buffer as too short");
  console.log("✓ parseWrapperConfigV17 rejects pre-protocol-fee-sized (432B config) buffers");
}

// ── Fee-collection-split WrapperConfigV17 tail (496 -> 576) ──────────────────
//
// FULL ROUND-TRIP against a hand-built 576-byte layout. Every one of the seven
// new fields gets a DISTINCT value so a decoder that reads the right type at
// the wrong offset cannot pass by coincidence. The four u128 counters all
// exceed u64::MAX, which exercises the high word and would catch a u64 read.
//
// FIELD ORDER IS LOAD-BEARING and is the specific thing under test: the
// counters MUST precede the u16 shares. If the decoder were written to the
// intuitive order (shares first at 496, counters at 502), every value below
// would land in the wrong place. Source of truth: v16_program.rs struct
// WrapperConfigV16 @1057, which derives bytemuck::Pod and therefore forbids
// the implicit padding that a shares-first order would require.
{
  const buf = new Uint8Array(V17_HEADER_LEN + V17_WRAPPER_CONFIG_LEN);
  const dv = new DataView(buf.buffer);
  const configOff = V17_HEADER_LEN;

  const setU128 = (off: number, v: bigint) => {
    dv.setBigUint64(configOff + off, v & 0xffff_ffff_ffff_ffffn, true);
    dv.setBigUint64(configOff + off + 8, v >> 64n, true);
  };

  // Distinct, all > u64::MAX (18_446_744_073_709_551_615).
  const lpAccrued = 111_111_111_111_111_111_111n;
  const lpWithdrawn = 222_222_222_222_222_222_222n;
  const insAccrued = 333_333_333_333_333_333_333n;
  const insWithdrawn = 444_444_444_444_444_444_444n;
  setU128(496, lpAccrued);
  setU128(512, lpWithdrawn);
  setU128(528, insAccrued);
  setU128(544, insWithdrawn);

  // Distinct, and NOT the on-chain defaults (1600/4800/1600) — using defaults
  // here would let a decoder that returned hardcoded defaults pass.
  const creatorShareBps = 3600;
  const lpShareBps = 3200;
  const insuranceShareBps = 1200;
  dv.setUint16(configOff + 560, creatorShareBps, true);
  dv.setUint16(configOff + 562, lpShareBps, true);
  dv.setUint16(configOff + 564, insuranceShareBps, true);

  // _padding_split [u8;10] @566..576 — fill with a nonzero sentinel to prove it
  // is not being read into any field.
  buf.fill(0xab, configOff + 566, configOff + 576);

  const cfg = parseWrapperConfigV17(buf);

  assert(
    cfg.lpFeeAccruedAtoms === lpAccrued,
    `lpFeeAccruedAtoms @496: expected ${lpAccrued}, got ${cfg.lpFeeAccruedAtoms}`
  );
  assert(
    cfg.lpFeeWithdrawnAtoms === lpWithdrawn,
    `lpFeeWithdrawnAtoms @512: expected ${lpWithdrawn}, got ${cfg.lpFeeWithdrawnAtoms}`
  );
  assert(
    cfg.insuranceReserveAccruedAtoms === insAccrued,
    `insuranceReserveAccruedAtoms @528: expected ${insAccrued}, got ${cfg.insuranceReserveAccruedAtoms}`
  );
  assert(
    cfg.insuranceReserveWithdrawnAtoms === insWithdrawn,
    `insuranceReserveWithdrawnAtoms @544: expected ${insWithdrawn}, got ${cfg.insuranceReserveWithdrawnAtoms}`
  );
  assert(
    cfg.creatorShareBps === creatorShareBps,
    `creatorShareBps @560: expected ${creatorShareBps}, got ${cfg.creatorShareBps}`
  );
  assert(
    cfg.lpShareBps === lpShareBps,
    `lpShareBps @562: expected ${lpShareBps}, got ${cfg.lpShareBps}`
  );
  assert(
    cfg.insuranceShareBps === insuranceShareBps,
    `insuranceShareBps @564: expected ${insuranceShareBps}, got ${cfg.insuranceShareBps}`
  );
  console.log("✓ parseWrapperConfigV17 fee-split tail (496/512/528/544 u128, 560/562/564 u16, 576-byte config)");
}

// The 496 -> 576 growth must not disturb ANY earlier offset. Decode the same
// buffer twice — once at 576 and once with the fee-split tail zeroed — and
// assert the protocol-fee fields (432/464/480) are identical. This is the
// regression that a missed hardcoded 496 elsewhere would produce.
{
  const buf = new Uint8Array(V17_HEADER_LEN + V17_WRAPPER_CONFIG_LEN);
  const dv = new DataView(buf.buffer);
  const configOff = V17_HEADER_LEN;

  const pfa = new PublicKey("So11111111111111111111111111111111111111112");
  buf.set(pfa.toBytes(), configOff + 432);
  dv.setBigUint64(configOff + 464, 7_777n, true);
  dv.setBigUint64(configOff + 480, 3_333n, true);

  // Populate the new tail with garbage that would corrupt an overlapping read.
  buf.fill(0xff, configOff + 496, configOff + 576);

  const cfg = parseWrapperConfigV17(buf);
  assert(cfg.protocolFeeAuthority.equals(pfa), "protocolFeeAuthority @432 unaffected by the 576-byte tail");
  assert(cfg.protocolFeeAccruedAtoms === 7_777n, "protocolFeeAccruedAtoms @464 unaffected by the 576-byte tail");
  assert(cfg.protocolFeeWithdrawnAtoms === 3_333n, "protocolFeeWithdrawnAtoms @480 unaffected by the 576-byte tail");
  console.log("✓ parseWrapperConfigV17 496->576 growth leaves offsets 0..495 untouched");
}

// parseWrapperConfigV17 rejects a pre-fee-split-sized (496-byte config) buffer.
// This is the failure mode against the CURRENTLY DEPLOYED devnet wrapper
// DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj, which still writes 496 bytes:
// a loud length error, never a silent misparse.
{
  const shortBuf = new Uint8Array(V17_HEADER_LEN + 496); // pre-fee-split WRAPPER_CONFIG_LEN
  let threw = false;
  try {
    parseWrapperConfigV17(shortBuf);
  } catch {
    threw = true;
  }
  assert(threw, "parseWrapperConfigV17 rejects a 512-byte (pre-fee-split) buffer as too short");
  console.log("✓ parseWrapperConfigV17 rejects pre-fee-split-sized (496B config) buffers");
}

// ── v17 fee-split instruction encoders (wrapper tags 86/87/88, 55) ───────────

// UpdateFeeSplit (tag 86)
// Wire: tag(1) + creator_share_bps(u16) + lp_share_bps(u16) + insurance_share_bps(u16) = 7 bytes
// Verified against v16_program.rs tag-86 decode arm: read_u16 x3, in this order.
{
  const data = encodeUpdateFeeSplit({
    creatorShareBps: 1600,
    lpShareBps: 4800,
    insuranceShareBps: 1600,
  });
  assert(data.length === 7, `UpdateFeeSplit length: expected 7, got ${data.length}`);
  assert(data[0] === IX_TAG.UpdateFeeSplit, "UpdateFeeSplit tag = IX_TAG.UpdateFeeSplit");
  assert(data[0] === 86, "UpdateFeeSplit tag literal = 86");
  // 1600 = 0x0640 -> 40 06 ; 4800 = 0x12C0 -> C0 12 ; 1600 -> 40 06
  assertBuf(
    data.subarray(1, 7),
    [0x40, 0x06, 0xc0, 0x12, 0x40, 0x06],
    "UpdateFeeSplit defaults 1600/4800/1600"
  );
  console.log("✓ encodeUpdateFeeSplit (v17 7-byte wire, tag 86)");
}

// Field ORDER within tag 86 — three distinct values so a swapped pair fails.
{
  const data = encodeUpdateFeeSplit({
    creatorShareBps: 0x1111,
    lpShareBps: 0x2222,
    insuranceShareBps: 0x3333,
  });
  assertBuf(
    data.subarray(1, 7),
    [0x11, 0x11, 0x22, 0x22, 0x33, 0x33],
    "UpdateFeeSplit field order creator/lp/insurance"
  );
  console.log("✓ encodeUpdateFeeSplit field order (creator, lp, insurance)");
}

// WithdrawInsuranceReserveToStake (tag 87)
// Wire: tag(1) = 1 byte. Verified against v16_program.rs tag-87 decode arm,
// which is a bare `87 => Self::WithdrawInsuranceReserveToStake` with no reads,
// followed by the shared `if !rest.is_empty() { return Err(...) }` guard — so
// ANY trailing byte makes the program reject the instruction.
{
  const data = encodeWithdrawInsuranceReserveToStake();
  assert(data.length === 1, `WithdrawInsuranceReserveToStake length: expected 1, got ${data.length}`);
  assert(data[0] === IX_TAG.WithdrawInsuranceReserveToStake, "tag = IX_TAG.WithdrawInsuranceReserveToStake");
  assert(data[0] === 87, "WithdrawInsuranceReserveToStake tag literal = 87");
  console.log("✓ encodeWithdrawInsuranceReserveToStake (v17 1-byte wire, tag 87)");
}

// UpdateMaintenanceFeePerSlot (tag 88)
// Wire: tag(1) + maintenance_fee_per_slot(u128) = 17 bytes.
// ⚠ u128, NOT u64 — v16_program.rs tag-88 arm uses read_u128, matching both
// the storage type and InitMarket's encoding. A 9-byte (u64) payload would
// leave 8 bytes unconsumed and be rejected.
{
  const data = encodeUpdateMaintenanceFeePerSlot({ maintenanceFeePerSlot: 1_000_000n });
  assert(data.length === 17, `UpdateMaintenanceFeePerSlot length: expected 17, got ${data.length}`);
  assert(data[0] === IX_TAG.UpdateMaintenanceFeePerSlot, "tag = IX_TAG.UpdateMaintenanceFeePerSlot");
  assert(data[0] === 88, "UpdateMaintenanceFeePerSlot tag literal = 88");
  assertBuf(
    data.subarray(1, 17),
    [64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "UpdateMaintenanceFeePerSlot amount=1_000_000"
  );
  console.log("✓ encodeUpdateMaintenanceFeePerSlot (v17 17-byte wire, tag 88, u128 NOT u64)");
}

// The u128-not-u64 property, asserted directly: a value above u64::MAX must
// survive the round trip into the high word. This is the single assertion that
// would have caught the prior brief's u64 mistake.
{
  const big = (1n << 100n) + 5n; // needs bit 100 -> high u64 word
  const data = encodeUpdateMaintenanceFeePerSlot({ maintenanceFeePerSlot: big });
  assert(data.length === 17, "UpdateMaintenanceFeePerSlot stays 17 bytes for a >u64 value");
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const lo = dv.getBigUint64(1, true);
  const hi = dv.getBigUint64(9, true);
  assert(lo === 5n, `UpdateMaintenanceFeePerSlot low word: expected 5, got ${lo}`);
  assert(hi === 1n << 36n, `UpdateMaintenanceFeePerSlot high word: expected ${1n << 36n}, got ${hi}`);
  assert((hi << 64n) + lo === big, "UpdateMaintenanceFeePerSlot u128 round-trip");
  console.log("✓ encodeUpdateMaintenanceFeePerSlot carries values above u64::MAX (proves u128)");
}

// UpdateTradeFeePolicy (tag 55)
// Wire: tag(1) + trade_fee_base_bps(u64) = 9 bytes.
// ⚠ Type asymmetry with tag 88: v16_program.rs tag-55 arm uses read_u64.
{
  const data = encodeUpdateTradeFeePolicy({ tradeFeeBaseBps: 30n });
  assert(data.length === 9, `UpdateTradeFeePolicy length: expected 9, got ${data.length}`);
  assert(data[0] === IX_TAG.UpdateTradeFeePolicy, "tag = IX_TAG.UpdateTradeFeePolicy");
  assert(data[0] === 55, "UpdateTradeFeePolicy tag literal = 55");
  assertBuf(data.subarray(1, 9), [30, 0, 0, 0, 0, 0, 0, 0], "UpdateTradeFeePolicy bps=30");
  console.log("✓ encodeUpdateTradeFeePolicy (v17 9-byte wire, tag 55, u64 NOT u128)");
}

// Tag distinctness across the fee-split additions.
{
  assert(IX_TAG.UpdateFeeSplit === 86, "IX_TAG.UpdateFeeSplit === 86");
  assert(IX_TAG.WithdrawInsuranceReserveToStake === 87, "IX_TAG.WithdrawInsuranceReserveToStake === 87");
  assert(IX_TAG.UpdateMaintenanceFeePerSlot === 88, "IX_TAG.UpdateMaintenanceFeePerSlot === 88");
  const tags = [
    IX_TAG.WithdrawProtocolFee,
    IX_TAG.SetProtocolFeeAuthority,
    IX_TAG.UpdateFeeSplit,
    IX_TAG.WithdrawInsuranceReserveToStake,
    IX_TAG.UpdateMaintenanceFeePerSlot,
  ];
  assert(new Set(tags).size === tags.length, "tags 84/85/86/87/88 are pairwise distinct");
  console.log("✓ IX_TAG 84/85/86/87/88 distinct");
}

// validateFeeSplit mirrors policy_v16::validate_fee_split.
{
  assert(
    validateFeeSplit({ creatorShareBps: 1600, lpShareBps: 4800, insuranceShareBps: 1600 }) === null,
    "validateFeeSplit accepts the on-chain defaults"
  );
  // The floors are precisely complementary (3600 + 3200 + 1200 === 8000), so
  // the all-at-floor split is the unique extremal valid point.
  assert(
    validateFeeSplit({ creatorShareBps: 3600, lpShareBps: 3200, insuranceShareBps: 1200 }) === null,
    "validateFeeSplit accepts the exact floors"
  );
  assert(
    validateFeeSplit({ creatorShareBps: 1600, lpShareBps: 4800, insuranceShareBps: 1601 }) !== null,
    "validateFeeSplit rejects a sum != 8000"
  );
  // Because the floors sum to exactly 8000, creator > 3600 ALWAYS drags another
  // leg under its floor — a single-violation creator case does not exist.
  const overCreator = validateFeeSplit({ creatorShareBps: 3601, lpShareBps: 3200, insuranceShareBps: 1199 });
  assert(overCreator !== null, "validateFeeSplit rejects creator above MAX_CREATOR_SHARE_BPS");
  assert(
    validateFeeSplit({ creatorShareBps: 1600, lpShareBps: 3100, insuranceShareBps: 3300 }) !== null,
    "validateFeeSplit rejects LP below MIN_LP_SHARE_BPS"
  );
  assert(
    validateFeeSplit({ creatorShareBps: 3500, lpShareBps: 3400, insuranceShareBps: 1100 }) !== null,
    "validateFeeSplit rejects insurance below MIN_INSURANCE_SHARE_BPS"
  );
  assert(
    FEE_SPLIT.MAX_CREATOR_SHARE_BPS + FEE_SPLIT.MIN_LP_SHARE_BPS + FEE_SPLIT.MIN_INSURANCE_SHARE_BPS ===
      FEE_SPLIT.FEE_SHARE_TOTAL_BPS,
    "fee-split floors are precisely complementary (3600+3200+1200 === 8000)"
  );
  assert(
    FEE_SPLIT.DEFAULT_CREATOR_SHARE_BPS + FEE_SPLIT.DEFAULT_LP_SHARE_BPS + FEE_SPLIT.DEFAULT_INSURANCE_SHARE_BPS ===
      FEE_SPLIT.FEE_SHARE_TOTAL_BPS,
    "fee-split defaults sum to FEE_SHARE_TOTAL_BPS"
  );
  assert(
    FEE_SPLIT.PROTOCOL_FEE_BPS + FEE_SPLIT.FEE_SHARE_TOTAL_BPS === 10_000,
    "PROTOCOL_FEE_BPS + FEE_SHARE_TOTAL_BPS === 10_000"
  );
  console.log("✓ validateFeeSplit + FEE_SPLIT constants match policy_v16::validate_fee_split");
}

console.log("\n✅ All tests passed!");
