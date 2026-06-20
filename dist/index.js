// src/abi/encode.ts
import { PublicKey } from "@solana/web3.js";
var U8_MAX = 255;
var U16_MAX = 65535;
var U32_MAX = 4294967295;
var DECIMAL_INT_RE = /^-?(0|[1-9]\d*)$/;
function parseDecimalBigInt(val, fnName) {
  if (typeof val !== "string") return val;
  if (!DECIMAL_INT_RE.test(val)) {
    throw new Error(`${fnName}: value must be a decimal integer string`);
  }
  return BigInt(val);
}
function encU8(val) {
  if (!Number.isInteger(val) || val < 0 || val > U8_MAX) {
    throw new Error(`encU8: value out of range (0..255), got ${val}`);
  }
  return new Uint8Array([val]);
}
function encU16(val) {
  if (!Number.isInteger(val) || val < 0 || val > U16_MAX) {
    throw new Error(`encU16: value out of range (0..65535), got ${val}`);
  }
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, val, true);
  return buf;
}
function encU32(val) {
  if (!Number.isInteger(val) || val < 0 || val > U32_MAX) {
    throw new Error(`encU32: value out of range (0..4294967295), got ${val}`);
  }
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, val, true);
  return buf;
}
function encU64(val) {
  const n = parseDecimalBigInt(val, "encU64");
  if (n < 0n) throw new Error("encU64: value must be non-negative");
  if (n > 0xffffffffffffffffn) throw new Error("encU64: value exceeds u64 max");
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, n, true);
  return buf;
}
function encI64(val) {
  const n = parseDecimalBigInt(val, "encI64");
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  if (n < min || n > max) throw new Error("encI64: value out of range");
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigInt64(0, n, true);
  return buf;
}
function encU128(val) {
  const n = parseDecimalBigInt(val, "encU128");
  if (n < 0n) throw new Error("encU128: value must be non-negative");
  const max = (1n << 128n) - 1n;
  if (n > max) throw new Error("encU128: value exceeds u128 max");
  const buf = new Uint8Array(16);
  const view = new DataView(buf.buffer);
  const lo = n & 0xffffffffffffffffn;
  const hi = n >> 64n;
  view.setBigUint64(0, lo, true);
  view.setBigUint64(8, hi, true);
  return buf;
}
function encI128(val) {
  const n = parseDecimalBigInt(val, "encI128");
  const min = -(1n << 127n);
  const max = (1n << 127n) - 1n;
  if (n < min || n > max) throw new Error("encI128: value out of range");
  let unsigned = n;
  if (n < 0n) {
    unsigned = (1n << 128n) + n;
  }
  const buf = new Uint8Array(16);
  const view = new DataView(buf.buffer);
  const lo = unsigned & 0xffffffffffffffffn;
  const hi = unsigned >> 64n;
  view.setBigUint64(0, lo, true);
  view.setBigUint64(8, hi, true);
  return buf;
}
function encPubkey(val) {
  try {
    const pk = typeof val === "string" ? new PublicKey(val) : val;
    return pk.toBytes();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`encPubkey: invalid public key "${String(val)}" \u2014 ${msg}`);
  }
}
function encBool(val) {
  return encU8(val ? 1 : 0);
}
function concatBytes(...arrays) {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// src/abi/instructions.ts
var IX_TAG = {
  // ── Core (tags 0-13) — byte-identical to v17 ─────────────────────────────
  InitMarket: 0,
  InitPortfolio: 1,
  /** @alias InitUser @since v12.x alias, canonical name is InitPortfolio in v17 */
  InitUser: 1,
  /** @deprecated v17 has no LP role in the wrapper; matchers run as third-party programs. */
  InitLP: 2,
  Deposit: 3,
  /** @alias DepositCollateral @since v12.x alias */
  DepositCollateral: 3,
  Withdraw: 4,
  /** @alias WithdrawCollateral @since v12.x alias */
  WithdrawCollateral: 4,
  /**
   * PermissionlessCrank (tag 5).
   *
   * CRITICAL: The on-chain decoder reads funding_rate_e9 (i128) at bytes [4..20]
   * and hard-rejects nonzero with InvalidInstructionData. SDK callers MUST use
   * encodePermissionlessCrank() which hardcodes fundingRateE9=0n. Do NOT
   * construct the payload manually and omit this field — that produces a
   * malformed instruction (missing bytes).
   */
  PermissionlessCrank: 5,
  /** @alias KeeperCrank @since v12.x alias */
  KeeperCrank: 5,
  TradeNoCpi: 6,
  LiquidateAtOracle: 7,
  ClosePortfolio: 8,
  /** @alias CloseAccount @since v12.x alias */
  CloseAccount: 8,
  TopUpInsurance: 9,
  TradeCpi: 10,
  /** @deprecated tag 11 has no decode arm in v17 wrapper */
  SetRiskThreshold: 11,
  /** @deprecated tag 12 has no decode arm in v17 wrapper */
  UpdateAdmin: 12,
  CloseSlab: 13,
  ResolveMarket: 19,
  // ── Backing/insurance domain ops (24, 28, 30, 41, 50, 52, 53, 54, 56, 57) ──
  TopUpBackingBucket: 24,
  ConvertReleasedPnl: 28,
  CloseResolved: 30,
  /**
   * UpdateAuthority (tag 32) — v17 wire: tag(1) + new_pubkey[32].
   *
   * BREAKING vs v12.18.x: NO kind byte in v17. The kind byte was removed;
   * tag 32 now ONLY rotates the single marketauth key. Per-asset authority
   * rotation uses tag 65 (UpdateAssetAuthority).
   */
  UpdateAuthority: 32,
  ConfigureHybridOracle: 34,
  ConfigureEwmaMark: 35,
  PushEwmaMark: 36,
  UpdateLiquidationFeePolicy: 37,
  ConfigurePermissionlessResolve: 38,
  ResolveStalePermissionless: 39,
  UpdateAssetLifecycle: 40,
  WithdrawInsurance: 41,
  CureAndCancelClose: 42,
  ForfeitRecoveryLeg: 43,
  RebalanceReduce: 44,
  FinalizeResetSide: 45,
  ClaimResolvedPayoutTopup: 46,
  RefineResolvedUnreceiptedBound: 47,
  SyncMaintenanceFee: 48,
  UpdateMaintenanceFeePolicy: 49,
  WithdrawBackingBucket: 50,
  UpdateBackingFeePolicy: 51,
  WithdrawBackingBucketEarnings: 52,
  SyncBackingDomainLedger: 53,
  SyncInsuranceLedger: 54,
  UpdateTradeFeePolicy: 55,
  TopUpInsuranceDomain: 56,
  /**
   * WithdrawInsuranceAsset (tag 57) — v17 wire: tag(1) + asset_index(u16) + amount(u128).
   *
   * Replaces the v12.x gap at tag 57. Withdraws from a specific asset's
   * insurance fund. asset_index is u16 (domain u8→u16 migration).
   */
  WithdrawInsuranceAsset: 57,
  UpdateFeeRedirectPolicy: 58,
  UpdateMarketInitFeePolicy: 59,
  UpdateBaseUnitMints: 60,
  SwapSecondaryForPrimary: 61,
  ConfigureAuthMark: 62,
  PushAuthMark: 63,
  ForceCloseAbandonedAsset: 64,
  // ── v17 auth-overhaul toly tags (65-69) — FREE range in v12.x ────────────
  /**
   * UpdateAssetAuthority (tag 65) — per-asset authority rotation.
   *
   * Wire: tag(1) + asset_index(u16) + kind(u8) + new_pubkey[32] = 36 bytes.
   *
   * kind values (matches v16_program.rs ASSET_AUTH_* constants, lines 5246-5250):
   *   0 = ASSET_ADMIN       — asset_admin (burnable when asset_index != 0)
   *   1 = INSURANCE         — insurance_authority
   *   2 = INSURANCE_OPERATOR — insurance_operator
   *   3 = BACKING_BUCKET    — backing_bucket_authority
   *   4 = ORACLE            — oracle_authority
   *
   * NOTE: The stake program uses kind=0 (ASSET_AUTH_ADMIN) targeting asset_index=0.
   * See stake-program docs.
   */
  UpdateAssetAuthority: 65,
  /**
   * BatchTradeNoCpi (tag 66) — multi-leg NoCpi trade in one instruction.
   *
   * Wire: tag(1) + n_legs(u8) + [asset_index(u16)+size_q(i128)+exec_price(u64)+fee_bps(u64)]×n
   */
  BatchTradeNoCpi: 66,
  /**
   * BatchTradeCpi (tag 67) — multi-leg CPI trade in one instruction.
   *
   * Wire: tag(1) + n_legs(u8) + [asset_index(u16)+size_q(i128)+fee_bps(u64)+limit_price(u64)]×n
   */
  BatchTradeCpi: 67,
  /**
   * SetMatcherConfig (tag 68) — enable/disable the matcher for this portfolio.
   *
   * Wire: tag(1) + enabled(u8) = 2 bytes.
   */
  SetMatcherConfig: 68,
  /**
   * RestartAssetOracle (tag 69) — permissionless oracle restart after stale/stuck state.
   *
   * Wire: tag(1) + asset_index(u16) + now_slot(u64) + initial_price(u64) = 19 bytes.
   */
  RestartAssetOracle: 69,
  // ── Fork NFT / B-3 (tags 72/73) — kept from v16 ─────────────────────────
  /**
   * TransferPortfolioOwnership (tag 72) — B-3 position ownership transfer.
   *
   * Wire: tag(1) + new_owner[32] + asset_index(u16) = 35 bytes.
   */
  TransferPortfolioOwnership: 72,
  /**
   * SetNftProgramId (tag 73) — register the percolator-nft program in the NftRegistry.
   *
   * Wire: tag(1) + nft_program_id[32] = 33 bytes.
   */
  SetNftProgramId: 73,
  // ── Fork LP-vault (tags 74-80; moved from 65-71 to avoid toly collision) ──
  /**
   * CreateLpVault (tag 74).
   * Wire: tag(1) + fee_share_bps(u16) + redemption_cooldown_slots(u64) +
   *       oi_reservation_threshold_bps(u16) + domain(u16) = 15 bytes.
   */
  CreateLpVault: 74,
  /**
   * DepositToLpVault (tag 75).
   * Wire: tag(1) + amount(u128) = 17 bytes.
   */
  DepositToLpVault: 75,
  /**
   * RequestRedeemLpShares (tag 76).
   * Wire: tag(1) + shares(u128) = 17 bytes.
   */
  RequestRedeemLpShares: 76,
  /**
   * ExecuteRedemption (tag 77).
   * Wire: tag(1) = 1 byte.
   */
  ExecuteRedemption: 77,
  /**
   * LpVaultCrankFees (tag 78).
   * Wire: tag(1) = 1 byte.
   */
  LpVaultCrankFees: 78,
  /**
   * SetLpVaultPaused (tag 79).
   * Wire: tag(1) + paused(u8) = 2 bytes.
   */
  SetLpVaultPaused: 79,
  /**
   * CloseLpVault (tag 80).
   * Wire: tag(1) = 1 byte.
   */
  CloseLpVault: 80,
  // ── Legacy aliases retained for source-compat (do NOT assign new tags) ────
  /** @deprecated v12.x alias. Use DepositToLpVault(75) in v17. */
  LpVaultDeposit: 75,
  /** @deprecated v12.x alias. Use RequestRedeemLpShares(76) in v17 — NOTE: wire format changed. */
  LpVaultWithdraw: 76,
  // ── v12.x-only tags — NOT in v17 decoder. Encoders that use these throw removedInstruction(). ──
  /** @deprecated v12.x tag 14. Removed in v17. */
  UpdateConfig: 14,
  /** @deprecated v12.x tag 15. Removed in v17. */
  SetMaintenanceFee: 15,
  /** @deprecated v12.x tag 16. Removed in v17. */
  SetOraclePriceCap: 16,
  /** @deprecated v12.x tag 17. Removed in v17. */
  AdminForceClose: 17,
  /** @deprecated v12.x tag 18. Removed in v17. */
  UpdateRiskParams: 18,
  /** @deprecated v12.x tag 20. Removed in v17. */
  SetPythOracle: 20,
  /** @deprecated v12.x tag 21. Removed in v17. */
  RenounceAdmin: 21,
  /** @deprecated v12.x tag 22. Removed in v17. */
  SetInsuranceWithdrawPolicy: 22,
  /** @deprecated v12.x tag 23. Removed in v17 — v17 uses WithdrawInsuranceLimited=23 from toly. */
  WithdrawInsuranceLimited: 23,
  /** @deprecated v12.x tag 25. Removed in v17. */
  FundMarketInsurance: 25,
  /** @deprecated v12.x tag 26. Removed in v17. */
  SetInsuranceIsolation: 26,
  /** @deprecated v12.x tag 27. Removed in v17. */
  DepositFeeCredits: 27,
  /** @deprecated v12.x tag 29. Removed in v17 — v17 uses ResolveStalePermissionless=39. */
  ResolvePermissionless: 29,
  /** @deprecated v12.x tag 30. Removed in v17 — v17 reuses 30 for CloseResolved (different wire). */
  ForceCloseResolved: 30,
  /** @deprecated v12.x tag 33. Removed in v17. */
  UpdateInsurancePolicy: 33,
  /** @deprecated v12.x tag 36. Removed in v12.17. */
  UnresolveMarket: 36,
  /** @deprecated v12.x tag 43. Removed in v17 — v17 uses 43 for ChallengeSettlement (different wire). */
  ChallengeSettlement: 43,
  /** @deprecated v12.x tag 44. Removed in v17 — v17 uses 44 for RebalanceReduce (different wire). */
  ResolveDispute: 44,
  /** @deprecated v12.x tag 45. Removed in v17 — v17 uses 45 for FinalizeResetSide. */
  DepositLpCollateral: 45,
  /** @deprecated v12.x tag 46. Removed in v17 — v17 uses 46 for ClaimResolvedPayoutTopup. */
  WithdrawLpCollateral: 46,
  /** @deprecated v12.x tag 54. Removed in v17 — v17 uses 54 for SyncInsuranceLedger. */
  SetOffsetPair: 54,
  /** @deprecated v12.x tag 55. Removed in v17 — v17 uses 55 for UpdateTradeFeePolicy. */
  AttestCrossMargin: 55,
  /** @deprecated v12.x tag 56. Removed in v17 — v17 uses 56 for TopUpInsuranceDomain. */
  PauseMarket: 56,
  /** @deprecated v12.x tag 58. Removed in v17 — v17 uses 58 for UpdateFeeRedirectPolicy. */
  UnpauseMarket: 58,
  /** @deprecated v12.x tag 64. Removed in v17 — v17 uses 64 for ForceCloseAbandonedAsset. */
  MintPositionNft: 64,
  /** @deprecated v12.x tag 65. COLLIDES with v17 UpdateAssetAuthority(65). Do NOT use. */
  TransferPositionOwnership: 65,
  /** @deprecated v12.x tag 66. COLLIDES with v17 BatchTradeNoCpi(66). Do NOT use. */
  BurnPositionNft: 66,
  /** @deprecated v12.x tag 67. COLLIDES with v17 BatchTradeCpi(67). Do NOT use. */
  SetPendingSettlement: 67,
  /** @deprecated v12.x tag 68. COLLIDES with v17 SetMatcherConfig(68). Do NOT use. */
  ClearPendingSettlement: 68,
  /** @deprecated v12.x tag 69. COLLIDES with v17 RestartAssetOracle(69). Do NOT use. */
  TransferOwnershipCpi: 69,
  /** @deprecated v12.x tag 70. Not in v17. */
  SetWalletCap: 70,
  /** @deprecated v12.x tag 71. Not in v17. */
  SetOiImbalanceHardBlock: 71,
  /** @deprecated v12.x tag 72. COLLIDES with v17 TransferPortfolioOwnership(72). Do NOT use. */
  RescueOrphanVault: 72,
  /** @deprecated v12.x tag 73. COLLIDES with v17 SetNftProgramId(73). Do NOT use. */
  CloseOrphanSlab: 73,
  /** @deprecated v12.x tag 74. COLLIDES with v17 CreateLpVault(74). Do NOT use. */
  SetDexPool: 74,
  /** @deprecated v12.x tag 75. COLLIDES with v17 DepositToLpVault(75). Do NOT use. */
  InitMatcherCtx: 75,
  /** @deprecated v12.x tag 78. COLLIDES with v17 LpVaultCrankFees(78). Do NOT use. */
  SetMaxPnlCap: 78,
  /** @deprecated v12.x tag 79. COLLIDES with v17 SetLpVaultPaused(79). Do NOT use. */
  SetOiCapMultiplier: 79,
  /** @deprecated v12.x tag 80. COLLIDES with v17 CloseLpVault(80). Do NOT use. */
  SetDisputeParams: 80,
  /** @deprecated v12.x tag 81. Not in v17. */
  SetLpCollateralParams: 81,
  /** @deprecated v12.x tag 82. Not in v17. */
  AcceptAdmin: 82,
  /** @deprecated v12.x tag 83. Not in v17 — v17 tag 32 UpdateAuthority has NO kind byte. */
  ProposeAdmin: 83,
  /** @deprecated v12.x tag 85. Not in v17. */
  ReclaimEmptyAccount: 85,
  /** @deprecated v12.x tag 86. Not in v17. */
  SettleAccount: 86,
  /** @deprecated v12.x tag 90. Not in v17. */
  UpdateMarkPrice: 90,
  /** @deprecated v12.x tag 91. Not in v17. */
  AuditCrank: 91,
  /** @deprecated v12.x tag 92. Not in v17. */
  AdvanceOraclePhase: 92,
  /** @deprecated v12.x tag 93. Not in v17. */
  SlashCreationDeposit: 93,
  /** @deprecated v12.x tag 94. Not in v17. */
  InitSharedVault: 94,
  /** @deprecated v12.x tag 95. Not in v17. */
  AllocateMarket: 95,
  /** @deprecated v12.x tag 96. Not in v17. */
  QueueWithdrawalSV: 96,
  /** @deprecated v12.x tag 97. Not in v17. */
  ClaimEpochWithdrawal: 97,
  /** @deprecated v12.x tag 98. Not in v17. */
  AdvanceEpoch: 98,
  /** @deprecated v12.x tag 99. Not in v17. */
  ReclaimSlabRent: 99,
  /** @deprecated v12.x tag 100. Not in v17. */
  CloseStaleSlabs: 100,
  /** @deprecated v12.x tag 101. Not in v17. */
  ExecuteAdl: 101,
  /** @deprecated v12.x tag 102. Not in v17. */
  QueueWithdrawal: 102,
  /** @deprecated v12.x tag 103. Not in v17. */
  ClaimQueuedWithdrawal: 103,
  /** @deprecated v12.x tag 104. Not in v17. */
  CancelQueuedWithdrawal: 104,
  /** @deprecated v12.x tag 105. Not in v17. */
  TradeCpiV: 105
};
Object.freeze(IX_TAG);
var EXPECTED_SLAB_VERSION = 16;
var V17_SLAB_MAGIC = 0x5045524356313600n;
function removedInstruction(name, tag, replacement) {
  const suffix = replacement ? ` Use ${replacement} instead.` : "";
  throw new Error(
    `${name} (tag ${tag}) is not accepted by the deployed wrapper program.${suffix}`
  );
}
var HEX_RE = /^[0-9a-fA-F]{64}$/;
function encodeFeedId(feedId) {
  const hex = feedId.startsWith("0x") ? feedId.slice(2) : feedId;
  if (!HEX_RE.test(hex)) {
    throw new Error(
      `Invalid feed ID: expected 64 hex chars, got "${hex.length === 64 ? "non-hex characters" : hex.length + " chars"}"`
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 64; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(
        `Failed to parse hex byte at position ${i}: "${hex.substring(i, i + 2)}"`
      );
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}
var INIT_MARKET_V17_LEN = 219;
function encodeInitMarket(args) {
  const isV17Args = "maxPortfolioAssets" in args;
  let maxPortfolioAssets;
  let hMin;
  let hMax;
  let initialPrice;
  let minNonzeroMmReq;
  let minNonzeroImReq;
  let maintenanceMarginBps;
  let initialMarginBps;
  let maxTradingFeeBps;
  let tradeFeeBaseBps;
  let liquidationFeeBps;
  let liquidationFeeCap;
  let minLiquidationAbs;
  let maxPriceMoveBpsPerSlot;
  let maxAccrualDtSlots;
  let maxAbsFundingE9PerSlot;
  let minFundingLifetimeSlots;
  let maxAccountBSettlementChunks;
  let maxBankruptCloseChunks;
  let maxBankruptCloseLifetimeSlots;
  let publicBChunkAtoms;
  let maintenanceFeePerSlot;
  if (isV17Args) {
    const v = args;
    maxPortfolioAssets = v.maxPortfolioAssets;
    hMin = v.hMin;
    hMax = v.hMax;
    initialPrice = v.initialPrice;
    minNonzeroMmReq = v.minNonzeroMmReq;
    minNonzeroImReq = v.minNonzeroImReq;
    maintenanceMarginBps = v.maintenanceMarginBps;
    initialMarginBps = v.initialMarginBps;
    maxTradingFeeBps = v.maxTradingFeeBps;
    tradeFeeBaseBps = v.tradeFeeBaseBps;
    liquidationFeeBps = v.liquidationFeeBps;
    liquidationFeeCap = v.liquidationFeeCap;
    minLiquidationAbs = v.minLiquidationAbs;
    maxPriceMoveBpsPerSlot = v.maxPriceMoveBpsPerSlot;
    maxAccrualDtSlots = v.maxAccrualDtSlots;
    maxAbsFundingE9PerSlot = v.maxAbsFundingE9PerSlot;
    minFundingLifetimeSlots = v.minFundingLifetimeSlots;
    maxAccountBSettlementChunks = v.maxAccountBSettlementChunks;
    maxBankruptCloseChunks = v.maxBankruptCloseChunks;
    maxBankruptCloseLifetimeSlots = v.maxBankruptCloseLifetimeSlots;
    publicBChunkAtoms = v.publicBChunkAtoms;
    maintenanceFeePerSlot = v.maintenanceFeePerSlot;
  } else {
    const v = args;
    const resolvedHMin = v.hMin ?? v.warmupPeriodSlots ?? 0n;
    const resolvedHMax = v.hMax ?? v.warmupPeriodSlots ?? 0n;
    maxPortfolioAssets = typeof v.maxAccounts === "string" ? parseInt(v.maxAccounts, 10) : Number(v.maxAccounts);
    hMin = resolvedHMin;
    hMax = resolvedHMax;
    initialPrice = v.initialMarkPriceE6;
    minNonzeroMmReq = v.minNonzeroMmReq;
    minNonzeroImReq = v.minNonzeroImReq;
    maintenanceMarginBps = v.maintenanceMarginBps;
    initialMarginBps = v.initialMarginBps;
    maxTradingFeeBps = v.tradingFeeBps;
    tradeFeeBaseBps = v.tradingFeeBps;
    liquidationFeeBps = v.liquidationFeeBps;
    liquidationFeeCap = v.liquidationFeeCap;
    minLiquidationAbs = v.minLiquidationAbs;
    maxPriceMoveBpsPerSlot = v.extendedTail?.maxPriceMoveBpsPerSlot ?? 4n;
    maxAccrualDtSlots = v.maxCrankStalenessSlots ?? 0n;
    maxAbsFundingE9PerSlot = v.extendedTail?.fundingMaxBpsPerSlot ?? 1000n;
    minFundingLifetimeSlots = 0n;
    maxAccountBSettlementChunks = 0n;
    maxBankruptCloseChunks = 0n;
    maxBankruptCloseLifetimeSlots = 0n;
    publicBChunkAtoms = 0n;
    maintenanceFeePerSlot = v.maintenanceFeePerSlot;
  }
  const data = concatBytes(
    encU8(IX_TAG.InitMarket),
    encU16(maxPortfolioAssets),
    encU64(hMin),
    encU64(hMax),
    encU64(initialPrice),
    encU128(minNonzeroMmReq),
    encU128(minNonzeroImReq),
    encU64(maintenanceMarginBps),
    encU64(initialMarginBps),
    encU64(maxTradingFeeBps),
    encU64(tradeFeeBaseBps),
    encU64(liquidationFeeBps),
    encU128(liquidationFeeCap),
    encU128(minLiquidationAbs),
    encU64(maxPriceMoveBpsPerSlot),
    encU64(maxAccrualDtSlots),
    encU64(maxAbsFundingE9PerSlot),
    encU64(minFundingLifetimeSlots),
    encU64(maxAccountBSettlementChunks),
    encU64(maxBankruptCloseChunks),
    encU64(maxBankruptCloseLifetimeSlots),
    encU128(publicBChunkAtoms),
    encU128(maintenanceFeePerSlot)
  );
  if (data.length !== INIT_MARKET_V17_LEN) {
    throw new Error(
      `encodeInitMarket: expected ${INIT_MARKET_V17_LEN} bytes, got ${data.length}`
    );
  }
  return data;
}
function encodeInitUser(_args) {
  return new Uint8Array([IX_TAG.InitPortfolio]);
}
function encodeInitLP(_args) {
  return removedInstruction("InitLP", IX_TAG.InitLP, "CreateLpVault (tag 74)");
}
function encodeDepositCollateral(args) {
  return concatBytes(
    encU8(IX_TAG.DepositCollateral),
    encU128(args.amount)
  );
}
function encodeWithdrawCollateral(args) {
  return concatBytes(
    encU8(IX_TAG.WithdrawCollateral),
    encU128(args.amount)
  );
}
var CrankAction = {
  FeeSweep: 0,
  Liquidate: 1
};
function encodePermissionlessCrank(args) {
  return concatBytes(
    encU8(IX_TAG.PermissionlessCrank),
    encU8(args.action),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encI128(0n),
    // funding_rate_e9 HARDCODED=0n (program rejects nonzero)
    encU128(args.closeQ),
    encU64(args.feeBps),
    encU8(args.recoveryReason)
  );
}
function encodeKeeperCrank(_args) {
  throw new Error(
    "encodeKeeperCrank: v12.17 wire format is not accepted by the v17 wrapper. Use encodePermissionlessCrank() instead."
  );
}
function encodeTradeNoCpi(args) {
  const data = concatBytes(
    encU8(IX_TAG.TradeNoCpi),
    encU16(args.assetIndex),
    encI128(args.sizeQ),
    encU64(args.execPrice),
    encU64(args.feeBps)
  );
  if (data.length !== 35) {
    throw new Error(
      `encodeTradeNoCpi: expected 35 bytes (tag+u16+i128+u64+u64), got ${data.length}`
    );
  }
  return data;
}
function encodeLiquidateAtOracle(_args) {
  return removedInstruction(
    "LiquidateAtOracle",
    IX_TAG.LiquidateAtOracle,
    "PermissionlessCrank (tag 5)"
  );
}
function encodeCloseAccount(_args) {
  return new Uint8Array([IX_TAG.ClosePortfolio]);
}
function encodeTopUpInsurance(args) {
  return concatBytes(encU8(IX_TAG.TopUpInsurance), encU128(args.amount));
}
function encodeTradeCpi(args) {
  const data = concatBytes(
    encU8(IX_TAG.TradeCpi),
    encU16(args.assetIndex),
    encI128(args.sizeQ),
    encU64(args.feeBps),
    encU64(args.limitPrice)
  );
  if (data.length !== 35) {
    throw new Error(
      `encodeTradeCpi: expected 35 bytes (tag+u16+i128+u64+u64), got ${data.length}`
    );
  }
  return data;
}
function encodeTradeCpiV2(_args) {
  return removedInstruction("TradeCpiV2", IX_TAG.TradeCpiV, "encodeTradeCpi()");
}
function encodeUnresolveMarket(_args) {
  return removedInstruction("UnresolveMarket", IX_TAG.UnresolveMarket, "encodeResolveMarket()");
}
function encodeSetRiskThreshold(_args) {
  return removedInstruction("SetRiskThreshold", IX_TAG.SetRiskThreshold, "encodeInitMarket()");
}
function encodeUpdateAdmin(_args) {
  return removedInstruction(
    "UpdateAdmin",
    IX_TAG.UpdateAdmin,
    "UpdateAuthority (tag 32) or UpdateAssetAuthority (tag 65)"
  );
}
function encodeCloseSlab() {
  return encU8(IX_TAG.CloseSlab);
}
function encodeUpdateConfig(_args) {
  return removedInstruction("UpdateConfig (v12 tag 14 \u2014 not in v17)", IX_TAG.UpdateConfig, void 0);
}
function encodeSetMaintenanceFee(_args) {
  return removedInstruction("SetMaintenanceFee", IX_TAG.SetMaintenanceFee, "encodeInitMarket()");
}
function encodeSetOraclePriceCap(_args) {
  return removedInstruction("SetOraclePriceCap (v12 tag 16 \u2014 not in v17)", IX_TAG.SetOraclePriceCap, void 0);
}
var RESOLVE_MODE_ORDINARY = 0;
var RESOLVE_MODE_DEGENERATE = 1;
function encodeResolveMarket(_args = {}) {
  return new Uint8Array([IX_TAG.ResolveMarket]);
}
function encodeWithdrawInsurance(args) {
  return concatBytes(encU8(IX_TAG.WithdrawInsurance), encU128(args.amount));
}
function encodeAdminForceClose(_args) {
  return removedInstruction("AdminForceClose (v12 tag 17 \u2014 not in v17)", IX_TAG.AdminForceClose, "encodeForceCloseAbandonedAsset() if applicable");
}
function encodeUpdateRiskParams(_args) {
  return removedInstruction(
    "UpdateRiskParams",
    IX_TAG.UpdateRiskParams,
    "encodeSetInsuranceWithdrawPolicy()"
  );
}
var RENOUNCE_ADMIN_CONFIRMATION = 0x52454E4F554E4345n;
var UNRESOLVE_CONFIRMATION = 0xDEADBEEFCAFE1234n;
function encodeRenounceAdmin() {
  return removedInstruction(
    "RenounceAdmin",
    IX_TAG.RenounceAdmin,
    "encodeWithdrawInsuranceLimited()"
  );
}
function encodeLpVaultWithdraw(_args) {
  return removedInstruction(
    "LpVaultWithdraw (v12 wire, tag 39\u219276 alias \u2014 wire format changed)",
    IX_TAG.LpVaultWithdraw,
    "encodeRequestRedeemLpShares() + encodeExecuteRedemption()"
  );
}
function encodePauseMarket() {
  return removedInstruction("PauseMarket (v12 tag 56 \u2014 now TopUpInsuranceDomain in v17)", IX_TAG.PauseMarket, void 0);
}
function encodeUnpauseMarket() {
  return removedInstruction("UnpauseMarket (v12 tag 58 \u2014 now UpdateFeeRedirectPolicy in v17)", IX_TAG.UnpauseMarket, void 0);
}
function encodeSetPythOracle(args) {
  void args;
  return removedInstruction("SetPythOracle", IX_TAG.SetPythOracle, "encodeInitMarket()");
}
var PYTH_RECEIVER_PROGRAM_ID = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
async function derivePythPriceUpdateAccount(feedId, shardId = 0) {
  const { PublicKey: PublicKey15 } = await import("@solana/web3.js");
  const shardBuf = new Uint8Array(2);
  new DataView(shardBuf.buffer).setUint16(0, shardId, true);
  const [pda] = PublicKey15.findProgramAddressSync(
    [shardBuf, feedId],
    new PublicKey15(PYTH_RECEIVER_PROGRAM_ID)
  );
  return pda.toBase58();
}
function encodeUpdateMarkPrice() {
  return removedInstruction("UpdateMarkPrice", IX_TAG.UpdateMarkPrice, "encodeUpdateHyperpMark()");
}
var MARK_PRICE_EMA_WINDOW_SLOTS = 72000n;
var MARK_PRICE_EMA_ALPHA_E6 = 2000000n / (MARK_PRICE_EMA_WINDOW_SLOTS + 1n);
function computeEmaMarkPrice(markPrevE6, oracleE6, dtSlots, alphaE6 = MARK_PRICE_EMA_ALPHA_E6, capE2bps = 0n) {
  if (oracleE6 === 0n) return markPrevE6;
  if (markPrevE6 === 0n || dtSlots === 0n) return oracleE6;
  let oracleClamped = oracleE6;
  if (capE2bps > 0n) {
    const maxDelta = markPrevE6 * capE2bps / 1000000n * dtSlots;
    const lo = markPrevE6 > maxDelta ? markPrevE6 - maxDelta : 0n;
    const hi = markPrevE6 + maxDelta;
    if (oracleClamped < lo) oracleClamped = lo;
    if (oracleClamped > hi) oracleClamped = hi;
  }
  const effectiveAlpha = alphaE6 * dtSlots > 1000000n ? 1000000n : alphaE6 * dtSlots;
  const oneMinusAlpha = 1000000n - effectiveAlpha;
  return (oracleClamped * effectiveAlpha + markPrevE6 * oneMinusAlpha) / 1000000n;
}
function encodeUpdateHyperpMark() {
  return removedInstruction(
    "UpdateHyperpMark (v12 DEX-pool mark crank \u2014 tag 34 is ConfigureHybridOracle in v17)",
    34,
    "ConfigureHybridOracle (tag 34) / ConfigureEwmaMark (tag 35), or PermissionlessCrank (tag 5) for mark refresh"
  );
}
function encodeFundMarketInsurance(_args) {
  return removedInstruction("FundMarketInsurance (v12 tag 25 \u2014 not in v17)", IX_TAG.FundMarketInsurance, void 0);
}
function encodeSetInsuranceIsolation(args) {
  void args;
  return removedInstruction(
    "SetInsuranceIsolation",
    IX_TAG.SetInsuranceIsolation,
    "encodeFundMarketInsurance()"
  );
}
function encodeQueueWithdrawal(_args) {
  return removedInstruction("QueueWithdrawal (v12 tag 102 \u2014 not in v17)", IX_TAG.QueueWithdrawal, "encodeRequestRedeemLpShares()");
}
function encodeClaimQueuedWithdrawal() {
  return removedInstruction("ClaimQueuedWithdrawal (v12 tag 103 \u2014 not in v17)", IX_TAG.ClaimQueuedWithdrawal, void 0);
}
function encodeCancelQueuedWithdrawal() {
  return removedInstruction("CancelQueuedWithdrawal (v12 tag 104 \u2014 not in v17)", IX_TAG.CancelQueuedWithdrawal, void 0);
}
function encodeExecuteAdl(_args) {
  return removedInstruction("ExecuteAdl (v12 tag 101 \u2014 not in v17)", IX_TAG.ExecuteAdl, void 0);
}
function encodeCloseStaleSlabs() {
  return removedInstruction("CloseStaleSlabs (v12 tag 100 \u2014 not in v17)", IX_TAG.CloseStaleSlabs, void 0);
}
function encodeReclaimSlabRent() {
  return removedInstruction("ReclaimSlabRent (v12 tag 99 \u2014 not in v17)", IX_TAG.ReclaimSlabRent, void 0);
}
function encodeAuditCrank() {
  return removedInstruction("AuditCrank (v12 tag 91 \u2014 not in v17)", IX_TAG.AuditCrank, void 0);
}
var VAMM_MAGIC = 0x504552434d415443n;
var MATCHER_MAGIC = VAMM_MAGIC;
var CTX_RETURN_OFFSET = 0;
var MATCHER_RETURN_LEN = 64;
var CTX_VAMM_OFFSET = 64;
var CTX_VAMM_LEN = 256;
var MATCHER_CONTEXT_LEN = 320;
var MATCHER_CALL_LEN = 67;
var INIT_CTX_LEN = 78;
var BPS_DENOM = 10000n;
function computeVammQuote(params, oraclePriceE6, tradeSize, isLong) {
  const absSize = tradeSize < 0n ? -tradeSize : tradeSize;
  const absNotionalE6 = absSize * oraclePriceE6 / 1000000n;
  let impactBps = 0n;
  if (params.mode === 1 && params.liquidityNotionalE6 > 0n) {
    impactBps = absNotionalE6 * BigInt(params.impactKBps) / params.liquidityNotionalE6;
  }
  const maxTotal = BigInt(params.maxTotalBps);
  const baseFee = BigInt(params.baseSpreadBps) + BigInt(params.tradingFeeBps);
  const maxImpact = maxTotal > baseFee ? maxTotal - baseFee : 0n;
  const clampedImpact = impactBps < maxImpact ? impactBps : maxImpact;
  let totalBps = baseFee + clampedImpact;
  if (totalBps > maxTotal) totalBps = maxTotal;
  if (isLong) {
    return oraclePriceE6 * (BPS_DENOM + totalBps) / BPS_DENOM;
  } else {
    if (totalBps >= BPS_DENOM) return 1n;
    return oraclePriceE6 * (BPS_DENOM - totalBps) / BPS_DENOM;
  }
}
function encodeAdvanceOraclePhase() {
  return removedInstruction("AdvanceOraclePhase (v12 tag 92 \u2014 not in v17)", IX_TAG.AdvanceOraclePhase, void 0);
}
var ORACLE_PHASE_NASCENT = 0;
var ORACLE_PHASE_GROWING = 1;
var ORACLE_PHASE_MATURE = 2;
var PHASE1_MIN_SLOTS = 648000n;
var PHASE1_VOLUME_MIN_SLOTS = 36000n;
var PHASE2_VOLUME_THRESHOLD = 100000000000n;
var PHASE2_MATURITY_SLOTS = 3024000n;
function checkPhaseTransition(currentSlot, marketCreatedSlot, oraclePhase, cumulativeVolumeE6, phase2DeltaSlots, hasMatureOracle) {
  switch (oraclePhase) {
    case 0: {
      const elapsed = currentSlot - (marketCreatedSlot > 0n ? marketCreatedSlot : currentSlot);
      const timeReady = elapsed >= PHASE1_MIN_SLOTS;
      const volumeReady = elapsed >= PHASE1_VOLUME_MIN_SLOTS && cumulativeVolumeE6 >= PHASE2_VOLUME_THRESHOLD;
      if (timeReady || volumeReady) {
        return [ORACLE_PHASE_GROWING, true];
      }
      return [ORACLE_PHASE_NASCENT, false];
    }
    case 1: {
      if (hasMatureOracle) return [ORACLE_PHASE_MATURE, true];
      const phase2Start = marketCreatedSlot + BigInt(phase2DeltaSlots);
      const elapsedSincePhase2 = currentSlot - phase2Start;
      if (elapsedSincePhase2 >= PHASE2_MATURITY_SLOTS) {
        return [ORACLE_PHASE_MATURE, true];
      }
      return [ORACLE_PHASE_GROWING, false];
    }
    default:
      return [ORACLE_PHASE_MATURE, false];
  }
}
function encodeSlashCreationDeposit() {
  return removedInstruction("SlashCreationDeposit", IX_TAG.SlashCreationDeposit);
}
function encodeInitSharedVault(_args) {
  return removedInstruction("InitSharedVault (v12 tag 94 \u2014 not in v17)", IX_TAG.InitSharedVault, void 0);
}
function encodeAllocateMarket(_args) {
  return removedInstruction("AllocateMarket (v12 tag 95 \u2014 not in v17)", IX_TAG.AllocateMarket, void 0);
}
function encodeQueueWithdrawalSV(_args) {
  return removedInstruction("QueueWithdrawalSV (v12 tag 96 \u2014 not in v17)", IX_TAG.QueueWithdrawalSV, void 0);
}
function encodeClaimEpochWithdrawal() {
  return removedInstruction("ClaimEpochWithdrawal (v12 tag 97 \u2014 not in v17)", IX_TAG.ClaimEpochWithdrawal, void 0);
}
function encodeAdvanceEpoch() {
  return removedInstruction("AdvanceEpoch (v12 tag 98 \u2014 not in v17)", IX_TAG.AdvanceEpoch, void 0);
}
function encodeSetOiImbalanceHardBlock(_args) {
  return removedInstruction("SetOiImbalanceHardBlock (v12 tag 71 \u2014 not in v17)", IX_TAG.SetOiImbalanceHardBlock, void 0);
}
function encodeMintPositionNft(_args) {
  return removedInstruction(
    "MintPositionNft (v12 tag 64 \u2014 COLLIDES with v17 ForceCloseAbandonedAsset)",
    IX_TAG.MintPositionNft,
    "percolator-nft program"
  );
}
function encodeTransferPositionOwnership(_args) {
  return removedInstruction(
    "TransferPositionOwnership (v12 tag 65 \u2014 COLLIDES with v17 UpdateAssetAuthority)",
    IX_TAG.TransferPositionOwnership,
    "encodeTransferPortfolioOwnership() (tag 72)"
  );
}
function encodeBurnPositionNft(_args) {
  return removedInstruction(
    "BurnPositionNft (v12 tag 66 \u2014 COLLIDES with v17 BatchTradeNoCpi)",
    IX_TAG.BurnPositionNft,
    "percolator-nft program"
  );
}
function encodeSetPendingSettlement(_args) {
  return removedInstruction(
    "SetPendingSettlement (v12 tag 67 \u2014 COLLIDES with v17 BatchTradeCpi)",
    IX_TAG.SetPendingSettlement,
    "percolator-nft program"
  );
}
function encodeClearPendingSettlement(_args) {
  return removedInstruction(
    "ClearPendingSettlement (v12 tag 68 \u2014 COLLIDES with v17 SetMatcherConfig)",
    IX_TAG.ClearPendingSettlement,
    "percolator-nft program"
  );
}
function encodeTransferOwnershipCpi(_args) {
  return removedInstruction(
    "TransferOwnershipCpi (v12 tag 69 \u2014 COLLIDES with v17 RestartAssetOracle)",
    IX_TAG.TransferOwnershipCpi,
    "percolator-nft transfer hook"
  );
}
function encodeSetWalletCap(_args) {
  return removedInstruction("SetWalletCap (v12 tag 70 \u2014 not in v17)", IX_TAG.SetWalletCap, void 0);
}
function encodeInitMatcherCtx(_args) {
  return removedInstruction(
    "InitMatcherCtx (v12 tag 75 \u2014 COLLIDES with v17 DepositToLpVault)",
    IX_TAG.InitMatcherCtx,
    void 0
  );
}
function encodeSetInsuranceWithdrawPolicy(_args) {
  return removedInstruction("SetInsuranceWithdrawPolicy (v12 tag 22 \u2014 not in v17)", IX_TAG.SetInsuranceWithdrawPolicy, void 0);
}
function encodeWithdrawInsuranceLimited(_args) {
  return removedInstruction("WithdrawInsuranceLimited (v12 tag 23 \u2014 verify v17 wire before use)", IX_TAG.WithdrawInsuranceLimited, void 0);
}
function encodeResolvePermissionless() {
  return removedInstruction(
    "ResolvePermissionless (v12 tag 29 \u2014 use ResolveStalePermissionless(39) in v17)",
    IX_TAG.ResolvePermissionless,
    "encodeResolveStalePermissionless()"
  );
}
function encodeForceCloseResolved(_args) {
  return removedInstruction(
    "ForceCloseResolved",
    IX_TAG.ForceCloseResolved,
    "encodeCloseResolved() for v17"
  );
}
function encodeCreateLpVault(args) {
  return removedInstruction(
    "encodeCreateLpVault (v12 format)",
    IX_TAG.CreateLpVault,
    "encodeCreateLpVaultV17()"
  );
}
function encodeLpVaultDeposit(_args) {
  return removedInstruction(
    "encodeLpVaultDeposit (v12 format)",
    IX_TAG.LpVaultDeposit,
    "encodeDepositToLpVault()"
  );
}
function encodeChallengeSettlement(_args) {
  return removedInstruction(
    "ChallengeSettlement",
    IX_TAG.ChallengeSettlement,
    void 0
  );
}
function encodeResolveDispute(_args) {
  return removedInstruction("ResolveDispute", IX_TAG.ResolveDispute, void 0);
}
function encodeDepositLpCollateral(_args) {
  return removedInstruction("DepositLpCollateral", IX_TAG.DepositLpCollateral, void 0);
}
function encodeWithdrawLpCollateral(_args) {
  return removedInstruction("WithdrawLpCollateral", IX_TAG.WithdrawLpCollateral, void 0);
}
function encodeSetOffsetPair(_args) {
  return removedInstruction("SetOffsetPair", IX_TAG.SetOffsetPair, void 0);
}
function encodeAttestCrossMargin(_args) {
  return removedInstruction("AttestCrossMargin", IX_TAG.AttestCrossMargin, void 0);
}
function encodeRescueOrphanVault() {
  return removedInstruction("RescueOrphanVault", IX_TAG.RescueOrphanVault, "encodeTransferPortfolioOwnership()");
}
function encodeCloseOrphanSlab() {
  return removedInstruction("CloseOrphanSlab", IX_TAG.CloseOrphanSlab, "encodeSetNftProgramId()");
}
function encodeSetDexPool(_args) {
  return removedInstruction("SetDexPool", IX_TAG.SetDexPool, "encodeCreateLpVaultV17()");
}
function encodeCreateInsuranceMint() {
  return removedInstruction("CreateInsuranceMint (v12 alias)", IX_TAG.CreateLpVault, "encodeCreateLpVaultV17()");
}
function encodeDepositInsuranceLP(_args) {
  return removedInstruction("DepositInsuranceLP (v12 alias)", IX_TAG.DepositToLpVault, "encodeDepositToLpVault()");
}
function encodeWithdrawInsuranceLP(_args) {
  return removedInstruction("WithdrawInsuranceLP (v12 alias)", IX_TAG.RequestRedeemLpShares, "encodeRequestRedeemLpShares()");
}
function encodeSetMaxPnlCap(_args) {
  return removedInstruction(
    "SetMaxPnlCap (v12 tag 78 \u2014 now LpVaultCrankFees in v17)",
    IX_TAG.SetMaxPnlCap,
    "encodeLpVaultCrankFees() [if you meant v17] or no equivalent"
  );
}
function encodeSetOiCapMultiplier(_args) {
  return removedInstruction(
    "SetOiCapMultiplier (v12 tag 79 \u2014 now SetLpVaultPaused in v17)",
    IX_TAG.SetOiCapMultiplier,
    "encodeSetLpVaultPaused() [if you meant v17]"
  );
}
function packOiCap(multiplierBps, softCapBps) {
  if (multiplierBps < 0 || multiplierBps > 4294967295) {
    throw new Error(`packOiCap: multiplier_bps out of u32 range: ${multiplierBps}`);
  }
  if (softCapBps < 0 || softCapBps > 4294967295) {
    throw new Error(`packOiCap: soft_cap_bps out of u32 range: ${softCapBps}`);
  }
  return BigInt(multiplierBps) | BigInt(softCapBps) << 32n;
}
function encodeSetDisputeParams(_args) {
  return removedInstruction(
    "SetDisputeParams (v12 tag 80 \u2014 now CloseLpVault in v17)",
    IX_TAG.SetDisputeParams,
    "encodeCloseLpVault() [if you meant v17]"
  );
}
function encodeSetLpCollateralParams(_args) {
  return removedInstruction("SetLpCollateralParams (v12 tag 81 \u2014 not in v17)", IX_TAG.SetLpCollateralParams, void 0);
}
function encodeAcceptAdmin() {
  return removedInstruction("AcceptAdmin (v12 tag 82 \u2014 not in v17)", IX_TAG.AcceptAdmin, "encodeUpdateAuthority()");
}
function encodeReclaimEmptyAccount(_args) {
  return removedInstruction("ReclaimEmptyAccount (v12 tag 85 \u2014 not in v17)", IX_TAG.ReclaimEmptyAccount, void 0);
}
function encodeSettleAccount(_args) {
  return removedInstruction("SettleAccount (v12 tag 86 \u2014 not in v17)", IX_TAG.SettleAccount, void 0);
}
function encodeDepositFeeCredits(_args) {
  return removedInstruction("DepositFeeCredits (v12 tag 27 \u2014 not in v17)", IX_TAG.DepositFeeCredits, void 0);
}
function encodeConvertReleasedPnl(args) {
  return concatBytes(
    encU8(IX_TAG.ConvertReleasedPnl),
    encU128(args.amount)
  );
}
function encodeUpdateAuthority(args) {
  return concatBytes(
    encU8(IX_TAG.UpdateAuthority),
    encPubkey(args.newPubkey)
  );
}
var ASSET_AUTH_KIND = {
  /** ASSET_AUTH_ADMIN = 0 in v16_program.rs:5246 — routes to asset_admin field */
  AssetAdmin: 0,
  /** ASSET_AUTH_INSURANCE = 1 in v16_program.rs:5247 — routes to insurance_authority field */
  Insurance: 1,
  /** ASSET_AUTH_INSURANCE_OPERATOR = 2 in v16_program.rs:5248 — routes to insurance_operator field */
  InsuranceOperator: 2,
  /** ASSET_AUTH_BACKING_BUCKET = 3 in v16_program.rs:5249 — routes to backing_bucket_authority field */
  BackingBucket: 3,
  /** ASSET_AUTH_ORACLE = 4 in v16_program.rs:5250 — routes to oracle_authority field */
  Oracle: 4
};
Object.freeze(ASSET_AUTH_KIND);
function encodeUpdateAssetAuthority(args) {
  return concatBytes(
    encU8(IX_TAG.UpdateAssetAuthority),
    encU16(args.assetIndex),
    encU8(args.kind),
    encPubkey(args.newPubkey)
  );
}
function encodeBatchTradeNoCpi(args) {
  if (args.legs.length > 255) {
    throw new Error(`encodeBatchTradeNoCpi: too many legs (${args.legs.length} > 255)`);
  }
  const parts = [
    encU8(IX_TAG.BatchTradeNoCpi),
    encU8(args.legs.length)
  ];
  for (const leg of args.legs) {
    parts.push(encU16(leg.assetIndex));
    parts.push(encI128(leg.sizeQ));
    parts.push(encU64(leg.execPrice));
    parts.push(encU64(leg.feeBps));
  }
  return concatBytes(...parts);
}
function encodeBatchTradeCpi(args) {
  if (args.legs.length > 255) {
    throw new Error(`encodeBatchTradeCpi: too many legs (${args.legs.length} > 255)`);
  }
  const parts = [
    encU8(IX_TAG.BatchTradeCpi),
    encU8(args.legs.length)
  ];
  for (const leg of args.legs) {
    parts.push(encU16(leg.assetIndex));
    parts.push(encI128(leg.sizeQ));
    parts.push(encU64(leg.feeBps));
    parts.push(encU64(leg.limitPrice));
  }
  return concatBytes(...parts);
}
function encodeSetMatcherConfig(args) {
  if (args.enabled !== 0 && args.enabled !== 1) {
    throw new Error(`encodeSetMatcherConfig: enabled must be 0 or 1, got ${args.enabled}`);
  }
  return concatBytes(encU8(IX_TAG.SetMatcherConfig), encU8(args.enabled));
}
function encodeRestartAssetOracle(args) {
  return concatBytes(
    encU8(IX_TAG.RestartAssetOracle),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encU64(args.initialPrice)
  );
}
function encodeWithdrawInsuranceAsset(args) {
  return concatBytes(
    encU8(IX_TAG.WithdrawInsuranceAsset),
    encU16(args.assetIndex),
    encU128(args.amount)
  );
}
function encodeCreateLpVaultV17(args) {
  return concatBytes(
    encU8(IX_TAG.CreateLpVault),
    encU16(args.feeShareBps),
    encU64(args.redemptionCooldownSlots),
    encU16(args.oiReservationThresholdBps),
    encU16(args.domain)
  );
}
function encodeDepositToLpVault(args) {
  return concatBytes(encU8(IX_TAG.DepositToLpVault), encU128(args.amount));
}
function encodeRequestRedeemLpShares(args) {
  return concatBytes(encU8(IX_TAG.RequestRedeemLpShares), encU128(args.shares));
}
function encodeExecuteRedemption() {
  return encU8(IX_TAG.ExecuteRedemption);
}
function encodeLpVaultCrankFees() {
  return encU8(IX_TAG.LpVaultCrankFees);
}
function encodeSetLpVaultPaused(args) {
  return concatBytes(encU8(IX_TAG.SetLpVaultPaused), encU8(args.paused));
}
function encodeCloseLpVault() {
  return encU8(IX_TAG.CloseLpVault);
}
function encodeTransferPortfolioOwnership(args) {
  return concatBytes(
    encU8(IX_TAG.TransferPortfolioOwnership),
    encPubkey(args.newOwner),
    encU16(args.assetIndex)
  );
}
function encodeSetNftProgramId(args) {
  return concatBytes(
    encU8(IX_TAG.SetNftProgramId),
    encPubkey(args.nftProgramId)
  );
}
function encodeConfigureHybridOracle(args) {
  return concatBytes(
    encU8(IX_TAG.ConfigureHybridOracle),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encI64(args.nowUnixTs),
    encU8(args.oracleLegCount),
    encU8(args.oracleLegFlags),
    encU64(args.maxStalenessSecs),
    encU64(args.hybridSoftStaleSlots),
    encU64(args.markEwmaHalflifeSlots),
    encU64(args.markMinFee),
    encU8(args.invert),
    encU32(args.unitScale),
    encU16(args.confFilterBps),
    encPubkey(args.oracleLegFeeds[0]),
    encPubkey(args.oracleLegFeeds[1]),
    encPubkey(args.oracleLegFeeds[2])
  );
}
function encodeConfigureEwmaMark(args) {
  return concatBytes(
    encU8(IX_TAG.ConfigureEwmaMark),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encU64(args.initialMarkE6),
    encU64(args.markEwmaHalflifeSlots),
    encU64(args.markMinFee)
  );
}
function encodePushEwmaMark(args) {
  return concatBytes(
    encU8(IX_TAG.PushEwmaMark),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encU64(args.markE6)
  );
}
function encodeConfigureAuthMark(args) {
  return concatBytes(
    encU8(IX_TAG.ConfigureAuthMark),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encU64(args.initialMarkE6)
  );
}
function encodePushAuthMark(args) {
  return concatBytes(
    encU8(IX_TAG.PushAuthMark),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encU64(args.markE6)
  );
}
function encodeMatcherInitPassive(args) {
  const buf = new Uint8Array(66);
  buf[0] = 2;
  buf[1] = 0;
  const u32Bytes = encU32(100);
  buf.set(u32Bytes, 10);
  const u128Bytes = encU128(args.maxFillAbs);
  buf.set(u128Bytes, 34);
  return buf;
}

// src/abi/accounts.ts
import {
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
var ACCOUNTS_INIT_MARKET = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "mint", signer: false, writable: false },
  { name: "vault", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
  { name: "rent", signer: false, writable: false },
  { name: "dummyAta", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false }
];
var ACCOUNTS_INIT_USER = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true }
];
var ACCOUNTS_INIT_LP = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false }
];
var ACCOUNTS_DEPOSIT_COLLATERAL = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_WITHDRAW_COLLATERAL = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_KEEPER_CRANK = [
  { name: "caller", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
var ACCOUNTS_PERMISSIONLESS_CRANK_BASE = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true }
];
var ACCOUNTS_RESTART_ASSET_ORACLE = [
  { name: "authority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_TRADE_NOCPI = [
  { name: "signerA", signer: true, writable: true },
  { name: "signerB", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "accountA", signer: false, writable: true },
  { name: "accountB", signer: false, writable: true }
];
var ACCOUNTS_LIQUIDATE_AT_ORACLE = [
  { name: "unused", signer: false, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
var ACCOUNTS_CLOSE_ACCOUNT = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true }
];
var ACCOUNTS_TOPUP_INSURANCE = [
  { name: "signer", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_TRADE_CPI = [
  { name: "signerA", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "accountA", signer: false, writable: true },
  { name: "accountB", signer: false, writable: true },
  { name: "matcherProg", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherDelegate", signer: false, writable: false }
];
var ACCOUNTS_SET_RISK_THRESHOLD = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_UPDATE_ADMIN = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_ACCEPT_ADMIN = [
  { name: "pendingAdmin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_CLOSE_SLAB = [
  { name: "dest", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "destAta", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_UPDATE_CONFIG = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false }
];
var ACCOUNTS_SET_MAINTENANCE_FEE = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_SET_ORACLE_PRICE_CAP = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false }
];
var ACCOUNTS_RESOLVE_MARKET = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
var ACCOUNTS_WITHDRAW_INSURANCE = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED = [
  { name: "authority", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "authorityAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "vaultPda", signer: false, writable: false },
  { name: "clock", signer: false, writable: false }
];
var ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE = [
  ...ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED,
  { name: "oracle", signer: false, writable: false }
];
var ACCOUNTS_PAUSE_MARKET = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_UNPAUSE_MARKET = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_RECLAIM_EMPTY_ACCOUNT = [
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false }
];
var ACCOUNTS_SETTLE_ACCOUNT = [
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
var ACCOUNTS_DEPOSIT_FEE_CREDITS = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false }
];
var ACCOUNTS_CONVERT_RELEASED_PNL = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
var ACCOUNTS_SET_INSURANCE_WITHDRAW_POLICY = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_UPDATE_AUTHORITY = [
  { name: "currentAuthority", signer: true, writable: false },
  { name: "newAuthority", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
function buildAccountMetas(spec, keys) {
  let keysArray;
  if (Array.isArray(keys)) {
    keysArray = keys;
  } else {
    keysArray = spec.map((s) => {
      const key = keys[s.name];
      if (!key) {
        throw new Error(
          `buildAccountMetas: missing key for account "${s.name}". Provided keys: [${Object.keys(keys).join(", ")}]`
        );
      }
      return key;
    });
  }
  if (keysArray.length !== spec.length) {
    throw new Error(
      `Account count mismatch: expected ${spec.length}, got ${keysArray.length}`
    );
  }
  return spec.map((s, i) => ({
    pubkey: keysArray[i],
    isSigner: s.signer,
    isWritable: s.writable
  }));
}
var ACCOUNTS_CREATE_INSURANCE_MINT = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: false },
  { name: "insLpMint", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "collateralMint", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "rent", signer: false, writable: false },
  { name: "payer", signer: true, writable: true }
];
var ACCOUNTS_DEPOSIT_INSURANCE_LP = [
  { name: "depositor", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "depositorAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "insLpMint", signer: false, writable: true },
  { name: "depositorLpAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false }
];
var ACCOUNTS_WITHDRAW_INSURANCE_LP = [
  { name: "withdrawer", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "withdrawerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "insLpMint", signer: false, writable: true },
  { name: "withdrawerLpAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false }
];
var ACCOUNTS_LP_VAULT_WITHDRAW = [
  { name: "withdrawer", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "withdrawerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpVaultMint", signer: false, writable: true },
  { name: "withdrawerLpAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true },
  { name: "creatorLockPda", signer: false, writable: true }
];
var ACCOUNTS_FUND_MARKET_INSURANCE = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "adminAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_SET_INSURANCE_ISOLATION = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_QUEUE_WITHDRAWAL = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "lpVaultState", signer: false, writable: false },
  { name: "withdrawQueue", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
var ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "withdrawQueue", signer: false, writable: true },
  { name: "lpVaultMint", signer: false, writable: true },
  { name: "userLpAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "userAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true }
];
var ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: false },
  { name: "withdrawQueue", signer: false, writable: true }
];
var ACCOUNTS_EXECUTE_ADL = [
  { name: "caller", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
var ACCOUNTS_RESOLVE_PERMISSIONLESS = [
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
var ACCOUNTS_FORCE_CLOSE_RESOLVED = [
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
var ACCOUNTS_ADMIN_FORCE_CLOSE = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
var ACCOUNTS_CLOSE_STALE_SLABS = [
  { name: "dest", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_RECLAIM_SLAB_RENT = [
  { name: "dest", signer: true, writable: true },
  { name: "slab", signer: true, writable: true }
];
var ACCOUNTS_AUDIT_CRANK = [
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_ADVANCE_ORACLE_PHASE = [
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_UPDATE_HYPERP_MARK = [
  { name: "slab", signer: false, writable: true },
  { name: "dexPool", signer: false, writable: false },
  { name: "clock", signer: false, writable: false }
];
var ACCOUNTS_CREATE_LP_VAULT = [
  { name: "admin", signer: true, writable: true },
  { name: "market", signer: false, writable: false },
  { name: "registry", signer: false, writable: true },
  { name: "lpMint", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_LP_VAULT_DEPOSIT = [
  { name: "depositor", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "lpMint", signer: false, writable: true },
  { name: "depositorLpAta", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false }
];
var ACCOUNTS_LP_VAULT_CRANK_FEES = [
  { name: "cranker", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true }
];
var ACCOUNTS_CHALLENGE_SETTLEMENT = [
  { name: "challenger", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "dispute", signer: false, writable: true },
  { name: "challengerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false }
];
var ACCOUNTS_RESOLVE_DISPUTE = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "dispute", signer: false, writable: true },
  { name: "challengerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_DEPOSIT_LP_COLLATERAL = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userLpAta", signer: false, writable: true },
  { name: "lpVaultMint", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpEscrow", signer: false, writable: true }
];
var ACCOUNTS_WITHDRAW_LP_COLLATERAL = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userLpAta", signer: false, writable: true },
  { name: "lpVaultMint", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpEscrow", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false }
];
var ACCOUNTS_SET_OFFSET_PAIR = [
  { name: "admin", signer: true, writable: true },
  { name: "slabA", signer: false, writable: true },
  { name: "slabB", signer: false, writable: true },
  { name: "pairPda", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
var ACCOUNTS_ATTEST_CROSS_MARGIN = [
  { name: "payer", signer: true, writable: true },
  { name: "slabA", signer: false, writable: true },
  { name: "slabB", signer: false, writable: true },
  { name: "attestation", signer: false, writable: true },
  { name: "pairPda", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false }
];
var ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_SET_MAX_PNL_CAP = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_SET_OI_CAP_MULTIPLIER = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_SET_DISPUTE_PARAMS = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_SET_LP_COLLATERAL_PARAMS = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_MINT_POSITION_NFT = [
  { name: "payer", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "positionNftPda", signer: false, writable: true },
  { name: "nftMint", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "owner", signer: true, writable: false },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "token2022Program", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false },
  { name: "rent", signer: false, writable: false }
];
var ACCOUNTS_TRANSFER_POSITION_OWNERSHIP = [
  { name: "currentOwner", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "positionNftPda", signer: false, writable: true },
  { name: "nftMint", signer: false, writable: true },
  { name: "currentOwnerAta", signer: false, writable: true },
  { name: "newOwnerAta", signer: false, writable: true },
  { name: "newOwner", signer: false, writable: false },
  { name: "token2022Program", signer: false, writable: false }
];
var ACCOUNTS_BURN_POSITION_NFT = [
  { name: "owner", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "positionNftPda", signer: false, writable: true },
  { name: "nftMint", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "token2022Program", signer: false, writable: false }
];
var ACCOUNTS_SET_PENDING_SETTLEMENT = [
  { name: "keeper", signer: true, writable: false },
  { name: "slab", signer: false, writable: false },
  { name: "positionNftPda", signer: false, writable: true }
];
var ACCOUNTS_CLEAR_PENDING_SETTLEMENT = [
  { name: "keeper", signer: true, writable: false },
  { name: "slab", signer: false, writable: false },
  { name: "positionNftPda", signer: false, writable: true }
];
var ACCOUNTS_TRANSFER_OWNERSHIP_CPI = [
  { name: "caller", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "nftProgram", signer: false, writable: false }
];
var ACCOUNTS_SET_WALLET_CAP = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
var ACCOUNTS_RESCUE_ORPHAN_VAULT = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "adminAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "vaultPda", signer: false, writable: false }
];
var ACCOUNTS_CLOSE_ORPHAN_SLAB = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true }
];
var ACCOUNTS_SET_DEX_POOL = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "poolAccount", signer: false, writable: false }
];
var ACCOUNTS_INIT_MATCHER_CTX = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherProg", signer: false, writable: false },
  { name: "lpPda", signer: false, writable: false }
];
var ACCOUNTS_CONFIGURE_HYBRID_ORACLE = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
  // [2..] oracle feed accounts appended by caller per oracle_leg_count
];
var ACCOUNTS_CONFIGURE_EWMA_MARK = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_PUSH_EWMA_MARK = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_CONFIGURE_AUTH_MARK = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_PUSH_AUTH_MARK = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_SET_MATCHER_CONFIG = [
  { name: "lpOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: false },
  { name: "lpPortfolio", signer: false, writable: true },
  // When enabled=1, also pass:
  { name: "matcherProg", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: false },
  { name: "matcherDelegate", signer: false, writable: false }
];
var WELL_KNOWN = {
  tokenProgram: TOKEN_PROGRAM_ID,
  clock: SYSVAR_CLOCK_PUBKEY,
  rent: SYSVAR_RENT_PUBKEY,
  systemProgram: SystemProgram.programId
};

// src/abi/errors.ts
var PERCOLATOR_ERRORS = {
  // ── toly base errors (0-29) ─────────────────────────────────────────────────
  0: {
    name: "InvalidMagic",
    hint: "Account magic mismatch \u2014 not a v17 percolator account. Check the market group address."
  },
  1: {
    name: "InvalidVersion",
    hint: "Account version mismatch. Expected EXPECTED_SLAB_VERSION=16. The program may need upgrading."
  },
  2: {
    name: "AlreadyInitialized",
    hint: "Account is already initialized. Use a different account or check the market group address."
  },
  3: {
    name: "NotInitialized",
    hint: "Account is not initialized. Run InitMarket first."
  },
  4: {
    name: "InvalidAccountKind",
    hint: "Wrong account kind (market group vs portfolio vs insurance-ledger). Check account addresses."
  },
  5: {
    name: "InvalidAccountLen",
    hint: "Account data length is incorrect. The account may be from a different program version."
  },
  6: {
    name: "ExpectedSigner",
    hint: "Missing required signature. Ensure the correct authority wallet is signing."
  },
  7: {
    name: "ExpectedWritable",
    hint: "Account must be marked writable. This is likely a client-side account-list bug."
  },
  8: {
    name: "Unauthorized",
    hint: "Not authorized for this operation. Check marketauth or asset_admin authority."
  },
  9: {
    name: "InvalidInstruction",
    hint: "Unknown instruction tag. The SDK and program versions may be mismatched."
  },
  10: {
    name: "InvalidMint",
    hint: "Token mint does not match the market's collateral mint."
  },
  11: {
    name: "InvalidTokenAccount",
    hint: "Token account is invalid. Ensure you have a correctly configured ATA."
  },
  12: {
    name: "InvalidVaultAccount",
    hint: "Vault account is invalid or does not match the market vault PDA."
  },
  13: {
    name: "InvalidTokenProgram",
    hint: "Invalid token program. Expected SPL Token or Token-2022."
  },
  14: {
    name: "EngineInvalidConfig",
    hint: "Engine config is invalid. A required config field is missing or out of range."
  },
  15: {
    name: "EngineArithmeticOverflow",
    hint: "Arithmetic overflow in engine calculation. Try a smaller amount or position size."
  },
  16: {
    name: "EngineProvenanceMismatch",
    hint: "Portfolio provenance mismatch \u2014 the portfolio was not created for this market group."
  },
  17: {
    name: "EngineHiddenLeg",
    hint: "Engine detected a hidden leg (unexpected zero-size outstanding position). Internal error."
  },
  18: {
    name: "EngineInvalidLeg",
    hint: "Engine received an invalid trade leg. Check asset_index and size."
  },
  19: {
    name: "EngineStale",
    hint: "Engine position is stale \u2014 the market mark price has not been updated recently."
  },
  20: {
    name: "EngineBStale",
    hint: "Engine B-side (batch) position stale. The batch crank needs to run."
  },
  21: {
    name: "EngineLockActive",
    hint: "Engine lock is active \u2014 a close or recovery is in progress. Wait for it to complete."
  },
  22: {
    name: "EngineNonProgress",
    hint: "Engine operation made no progress. This usually means a crank was called with nothing to do."
  },
  23: {
    name: "EngineRecoveryRequired",
    hint: "Engine requires a recovery crank before normal operations can resume."
  },
  24: {
    name: "EngineCounterOverflow",
    hint: "Engine counter overflow \u2014 too many assets or positions. Contact support."
  },
  25: {
    name: "EngineCounterUnderflow",
    hint: "Engine counter underflow \u2014 attempted to decrement a zero counter. Internal error."
  },
  26: {
    name: "OracleInvalid",
    hint: "Oracle data is invalid. Check the oracle account is a valid Pyth PriceUpdateV2 feed."
  },
  27: {
    name: "OracleStale",
    hint: "Oracle price is stale. Wait for the oracle to publish a fresh price."
  },
  28: {
    name: "OracleConfTooWide",
    hint: "Oracle confidence interval too wide. Wait for more stable market conditions."
  },
  29: {
    name: "InvalidOracleKey",
    hint: "Oracle account key does not match the market's configured oracle feed ID."
  },
  // ── Fork LP-vault errors (30-41) ─────────────────────────────────────────────
  30: {
    name: "LpVaultAlreadyExists",
    hint: "LP vault already created for this asset domain. Each domain can only have one LP vault."
  },
  31: {
    name: "LpVaultNotFound",
    hint: "LP vault does not exist for this asset domain. Call CreateLpVault (tag 74) first."
  },
  32: {
    name: "LpVaultPaused",
    hint: "LP vault is paused. Wait for the vault to be unpaused by the admin."
  },
  33: {
    name: "LpVaultSharesOutstanding",
    hint: "Cannot close LP vault \u2014 shares are still outstanding. All redeemers must exit first."
  },
  34: {
    name: "LpVaultZeroAmount",
    hint: "LP vault deposit or redemption amount must be greater than zero."
  },
  35: {
    name: "LpVaultInsufficientShares",
    hint: "Insufficient LP vault shares to redeem. Check your share balance."
  },
  36: {
    name: "LpVaultCooldownActive",
    hint: "LP vault redemption cooldown is still active. Wait for the cooldown period to elapse."
  },
  37: {
    name: "LpVaultOiReservationViolated",
    hint: "LP vault deposit would violate the OI reservation limit. The vault has insufficient capacity."
  },
  38: {
    name: "LpVaultNoFeesToCrank",
    hint: "No new fees to distribute to the LP vault. Wait for more trading activity."
  },
  39: {
    name: "LpVaultSupplyMismatch",
    hint: "LP vault share supply / capital mismatch. Internal invariant violation \u2014 please report."
  },
  40: {
    name: "LpVaultAuthorityMismatch",
    hint: "LP vault authority mismatch. The vault belongs to a different market group or admin."
  },
  41: {
    name: "LpVaultZeroSharesMinted",
    hint: "First LP deposit minted zero shares (capital too small relative to existing NAV). Deposit a larger amount."
  },
  // ── Fork NFT / B-3 errors (42-46) ────────────────────────────────────────────
  42: {
    name: "NftRegistryNotFound",
    hint: "NFT registry not found. Call SetNftProgramId (tag 73) to register the percolator-nft program first."
  },
  43: {
    name: "NftPortfolioNotTransferable",
    hint: "Portfolio is not in a transferable state. Ensure the portfolio has no open positions or pending operations."
  },
  44: {
    name: "NftTransferSelfOrZero",
    hint: "Cannot transfer portfolio to the zero address or to the current owner."
  },
  45: {
    name: "NftInvalidMintAuthority",
    hint: "NFT mint authority mismatch. The percolator-nft program may not match the registered NFT program ID."
  },
  46: {
    name: "NftPortfolioProvenance",
    hint: "Portfolio provenance mismatch for NFT transfer. The portfolio was not created for this market group."
  }
};
for (const v of Object.values(PERCOLATOR_ERRORS)) Object.freeze(v);
Object.freeze(PERCOLATOR_ERRORS);
function decodeError(code) {
  return PERCOLATOR_ERRORS[code];
}
function getErrorName(code) {
  return PERCOLATOR_ERRORS[code]?.name ?? `Unknown(${code})`;
}
function getErrorHint(code) {
  return PERCOLATOR_ERRORS[code]?.hint;
}
var CUSTOM_ERROR_HEX_MAX_LEN = 8;
function parseErrorFromLogs(logs) {
  if (!Array.isArray(logs)) {
    return null;
  }
  const re = new RegExp(
    `custom program error: 0x([0-9a-fA-F]{1,${CUSTOM_ERROR_HEX_MAX_LEN}})(?![0-9a-fA-F])`,
    "i"
  );
  for (const log of logs) {
    if (typeof log !== "string") {
      continue;
    }
    const match = log.match(re);
    if (match) {
      const code = parseInt(match[1], 16);
      if (!Number.isFinite(code) || code < 0 || code > 4294967295) {
        continue;
      }
      const info = decodeError(code);
      return {
        code,
        name: info?.name ?? `Unknown(${code})`,
        hint: info?.hint
      };
    }
  }
  return null;
}

// src/abi/nft.ts
import { PublicKey as PublicKey4 } from "@solana/web3.js";

// src/config/program-ids.ts
import { PublicKey as PublicKey3 } from "@solana/web3.js";
function safeEnv(key) {
  try {
    return typeof process !== "undefined" && process?.env ? process.env[key] : void 0;
  } catch {
    return void 0;
  }
}
var PROGRAM_IDS = {
  devnet: {
    percolator: "FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD",
    matcher: "4HcGCsyjAqnFua5ccuXyt8KRRQzKFbGTJkVChpS7Yfzy"
  },
  mainnet: {
    percolator: "ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv",
    matcher: "GDK8wx38kpiSVSfGTVNiSdptX3Z5R4kQyqh6Q3QX6wmi"
  }
};
Object.freeze(PROGRAM_IDS.devnet);
Object.freeze(PROGRAM_IDS.mainnet);
Object.freeze(PROGRAM_IDS);
var PROGRAM_IDS_V17 = {
  /** v17 wrapper placeholder (declare_id! value from v16_program.rs). */
  percolator: "Perco1ator111111111111111111111111111111111",
  /** v17 stake placeholder. */
  stake: "Per5taTe111111111111111111111111111111111111"
};
Object.freeze(PROGRAM_IDS_V17);
var PROGRAM_ID_V17 = new PublicKey3(PROGRAM_IDS_V17.percolator);
function getProgramId(network) {
  if (network === void 0) {
    const override = safeEnv("PROGRAM_ID");
    if (override) {
      console.warn(
        `[percolator-sdk] PROGRAM_ID env override active: ${override} \u2014 ensure this points to a trusted program`
      );
      return new PublicKey3(override);
    }
  }
  const detectedNetwork = getCurrentNetwork();
  const targetNetwork = network ?? detectedNetwork;
  const programId = PROGRAM_IDS[targetNetwork].percolator;
  return new PublicKey3(programId);
}
function getMatcherProgramId(network) {
  if (network === void 0) {
    const override = safeEnv("MATCHER_PROGRAM_ID");
    if (override) {
      console.warn(
        `[percolator-sdk] MATCHER_PROGRAM_ID env override active: ${override} \u2014 ensure this points to a trusted program`
      );
      return new PublicKey3(override);
    }
  }
  const detectedNetwork = getCurrentNetwork();
  const targetNetwork = network ?? detectedNetwork;
  const programId = PROGRAM_IDS[targetNetwork].matcher;
  if (!programId) {
    throw new Error(`Matcher program not deployed on ${targetNetwork}`);
  }
  return new PublicKey3(programId);
}
function getCurrentNetwork() {
  const network = safeEnv("NETWORK")?.toLowerCase();
  if (network === "mainnet" || network === "mainnet-beta") {
    return "mainnet";
  }
  return "devnet";
}

// src/abi/nft.ts
var NFT_PROGRAM_OVERRIDE = safeEnv("NFT_PROGRAM_ID");
var NFT_PROGRAM_ID = new PublicKey4(
  NFT_PROGRAM_OVERRIDE ?? "FqhKJT9gtScjrmfUuRMjeg7cXNpif1fqsy5Jh65tJmTS"
);
function getNftProgramId() {
  return NFT_PROGRAM_ID;
}
var NFT_IX_TAG = {
  MintPositionNft: 0,
  BurnPositionNft: 1,
  SettleFunding: 2,
  GetPositionValue: 3,
  ExecuteTransferHook: 4,
  EmergencyBurn: 5
};
function encodeNftMint(assetIndex) {
  const assetIndexBuf = u16Buf(assetIndex, "assetIndex");
  const buf = new Uint8Array(3);
  buf[0] = NFT_IX_TAG.MintPositionNft;
  buf.set(assetIndexBuf, 1);
  return buf;
}
function encodeNftBurn() {
  return new Uint8Array([NFT_IX_TAG.BurnPositionNft]);
}
function encodeNftSettleFunding() {
  return new Uint8Array([NFT_IX_TAG.SettleFunding]);
}
function encodeNftEmergencyBurn() {
  return new Uint8Array([NFT_IX_TAG.EmergencyBurn]);
}
var ACCOUNTS_NFT_MINT = [
  "sw",
  "w",
  "sw",
  "w",
  "r",
  "r",
  "r",
  "r",
  "r",
  "w"
];
var ACCOUNTS_NFT_BURN = [
  "s",
  "w",
  "w",
  "w",
  "r",
  "r",
  "r"
];
var ACCOUNTS_NFT_EMERGENCY_BURN = [
  "s",
  "w",
  "w",
  "w",
  "r",
  "r",
  "r"
];
var TEXT = new TextEncoder();
function u16Buf(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`${label} must be a u16`);
  }
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, value, true);
  return buf;
}
function deriveNftPda(portfolioAccount, assetIndex, programId = NFT_PROGRAM_ID) {
  return PublicKey4.findProgramAddressSync(
    [TEXT.encode("position_nft"), portfolioAccount.toBytes(), u16Buf(assetIndex, "assetIndex")],
    programId
  );
}
function deriveNftMint(_portfolioAccount, _assetIndex, _programId = NFT_PROGRAM_ID) {
  throw new Error("deriveNftMint: v16 NFT mint is a fresh signer keypair, not a PDA");
}
function deriveMintAuthority(programId = NFT_PROGRAM_ID) {
  return PublicKey4.findProgramAddressSync(
    [TEXT.encode("mint_authority")],
    programId
  );
}
var POSITION_NFT_STATE_LEN = 199;
var POSITION_NFT_MAGIC = 0x504552434e465400n;
var POSITION_NFT_VERSION = 2;
function readI128FromView(view, offset) {
  const lo = view.getBigUint64(offset, true);
  const hi = view.getBigUint64(offset + 8, true);
  const unsigned = hi << 64n | lo;
  const SIGN_BIT = 1n << 127n;
  if (unsigned >= SIGN_BIT) {
    return unsigned - (1n << 128n);
  }
  return unsigned;
}
function parsePositionNftAccount(data) {
  if (data.length < POSITION_NFT_STATE_LEN) {
    throw new Error(
      `PositionNft account too small: ${data.length} < ${POSITION_NFT_STATE_LEN}`
    );
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getBigUint64(0, true);
  if (magic !== POSITION_NFT_MAGIC) {
    throw new Error("PositionNft account has invalid magic");
  }
  if (data[8] !== POSITION_NFT_VERSION) {
    throw new Error(`PositionNft account has invalid version: ${data[8]}`);
  }
  const positionOwnerAtMint = new PublicKey4(data.subarray(127, 159));
  return {
    version: data[8],
    bump: data[9],
    portfolioAccount: new PublicKey4(data.subarray(10, 42)),
    nftMint: new PublicKey4(data.subarray(42, 74)),
    assetIndex: view.getUint32(74, true),
    sideAtMint: data[78],
    basisPosQAtMint: readI128FromView(view, 79),
    fSnapAtMint: readI128FromView(view, 95),
    marketIdAtMint: view.getBigUint64(111, true),
    epochSnapAtMint: view.getBigUint64(119, true),
    positionOwnerAtMint,
    positionOwner: positionOwnerAtMint,
    mintedAt: view.getBigInt64(159, true)
  };
}

// src/solana/slab.ts
import { PublicKey as PublicKey5 } from "@solana/web3.js";
function dv(data) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}
function readU8(data, off) {
  if (off >= data.length) {
    throw new RangeError(`readU8: offset ${off} out of bounds (length ${data.length})`);
  }
  return data[off];
}
function readU16LE(data, off) {
  return dv(data).getUint16(off, true);
}
function readU32LE(data, off) {
  return dv(data).getUint32(off, true);
}
function readU64LE(data, off) {
  return dv(data).getBigUint64(off, true);
}
function readI64LE(data, off) {
  return dv(data).getBigInt64(off, true);
}
function readI128LE(buf, offset) {
  const lo = readU64LE(buf, offset);
  const hi = readU64LE(buf, offset + 8);
  const unsigned = hi << 64n | lo;
  const SIGN_BIT = 1n << 127n;
  if (unsigned >= SIGN_BIT) {
    return unsigned - (1n << 128n);
  }
  return unsigned;
}
function readU128LE(buf, offset) {
  const lo = readU64LE(buf, offset);
  const hi = readU64LE(buf, offset + 8);
  return hi << 64n | lo;
}
var MAGIC = 0x504552434f4c4154n;
var SLAB_MAGIC = MAGIC;
var FLAG_RESOLVED = 1 << 0;
var V0_HEADER_LEN = 72;
var V0_CONFIG_LEN = 408;
var V0_ENGINE_OFF = 480;
var V0_ACCOUNT_SIZE = 240;
var V0_RESERVED_OFF = 48;
var V0_ENGINE_PARAMS_OFF = 48;
var V0_PARAMS_SIZE = 56;
var V0_ENGINE_CURRENT_SLOT_OFF = 104;
var V0_ENGINE_FUNDING_INDEX_OFF = 112;
var V0_ENGINE_LAST_FUNDING_SLOT_OFF = 128;
var V0_ENGINE_FUNDING_RATE_BPS_OFF = 136;
var V0_ENGINE_LAST_CRANK_SLOT_OFF = 144;
var V0_ENGINE_MAX_CRANK_STALENESS_OFF = 152;
var V0_ENGINE_TOTAL_OI_OFF = 160;
var V0_ENGINE_C_TOT_OFF = 176;
var V0_ENGINE_PNL_POS_TOT_OFF = 192;
var V0_ENGINE_LIQ_CURSOR_OFF = 208;
var V0_ENGINE_GC_CURSOR_OFF = 210;
var V0_ENGINE_LAST_SWEEP_START_OFF = 216;
var V0_ENGINE_LAST_SWEEP_COMPLETE_OFF = 224;
var V0_ENGINE_CRANK_CURSOR_OFF = 232;
var V0_ENGINE_SWEEP_START_IDX_OFF = 234;
var V0_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 240;
var V0_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 248;
var V0_ENGINE_NET_LP_POS_OFF = 256;
var V0_ENGINE_LP_SUM_ABS_OFF = 272;
var V0_ENGINE_LP_MAX_ABS_OFF = 288;
var V0_ENGINE_LP_MAX_ABS_SWEEP_OFF = 304;
var V0_ENGINE_BITMAP_OFF = 320;
var V1_HEADER_LEN = 104;
var V1_CONFIG_LEN = 496;
var V1_ENGINE_OFF = 600;
var V1_ENGINE_OFF_LEGACY = 640;
var V1_ACCOUNT_SIZE = 248;
var V1_RESERVED_OFF = 80;
var V1_ENGINE_PARAMS_OFF = 72;
var V1_PARAMS_SIZE = 288;
var V1_ENGINE_CURRENT_SLOT_OFF = 360;
var V1_ENGINE_FUNDING_INDEX_OFF = 368;
var V1_ENGINE_LAST_FUNDING_SLOT_OFF = 384;
var V1_ENGINE_FUNDING_RATE_BPS_OFF = 392;
var V1_ENGINE_MARK_PRICE_OFF = 400;
var V1_ENGINE_LAST_CRANK_SLOT_OFF = 424;
var V1_ENGINE_MAX_CRANK_STALENESS_OFF = 432;
var V1_ENGINE_TOTAL_OI_OFF = 440;
var V1_ENGINE_LONG_OI_OFF = 456;
var V1_ENGINE_SHORT_OI_OFF = 472;
var V1_ENGINE_C_TOT_OFF = 488;
var V1_ENGINE_PNL_POS_TOT_OFF = 504;
var V1_ENGINE_LIQ_CURSOR_OFF = 520;
var V1_ENGINE_GC_CURSOR_OFF = 522;
var V1_ENGINE_LAST_SWEEP_START_OFF = 528;
var V1_ENGINE_LAST_SWEEP_COMPLETE_OFF = 536;
var V1_ENGINE_CRANK_CURSOR_OFF = 544;
var V1_ENGINE_SWEEP_START_IDX_OFF = 546;
var V1_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 552;
var V1_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 560;
var V1_ENGINE_NET_LP_POS_OFF = 568;
var V1_ENGINE_LP_SUM_ABS_OFF = 584;
var V1_ENGINE_LP_MAX_ABS_OFF = 600;
var V1_ENGINE_LP_MAX_ABS_SWEEP_OFF = 616;
var V1_ENGINE_EMERGENCY_OI_MODE_OFF = 632;
var V1_ENGINE_EMERGENCY_START_SLOT_OFF = 640;
var V1_ENGINE_LAST_BREAKER_SLOT_OFF = 648;
var V1_ENGINE_BITMAP_OFF = 656;
var V1_LEGACY_ENGINE_BITMAP_OFF_ACTUAL = 672;
var V1_LEGACY_ACCT_OWNER_OFF = 200;
var V1D_CONFIG_LEN = 320;
var V1D_ENGINE_OFF = 424;
var V1D_ACCOUNT_SIZE = 248;
var V1D_ENGINE_INSURANCE_OFF = 16;
var V1D_ENGINE_PARAMS_OFF = 96;
var V1D_PARAMS_SIZE = 288;
var V1D_ENGINE_CURRENT_SLOT_OFF = 384;
var V1D_ENGINE_FUNDING_INDEX_OFF = 392;
var V1D_ENGINE_LAST_FUNDING_SLOT_OFF = 408;
var V1D_ENGINE_FUNDING_RATE_BPS_OFF = 416;
var V1D_ENGINE_MARK_PRICE_OFF = 424;
var V1D_ENGINE_LAST_CRANK_SLOT_OFF = 448;
var V1D_ENGINE_MAX_CRANK_STALENESS_OFF = 456;
var V1D_ENGINE_TOTAL_OI_OFF = 464;
var V1D_ENGINE_LONG_OI_OFF = 480;
var V1D_ENGINE_SHORT_OI_OFF = 496;
var V1D_ENGINE_C_TOT_OFF = 512;
var V1D_ENGINE_PNL_POS_TOT_OFF = 528;
var V1D_ENGINE_LIQ_CURSOR_OFF = 544;
var V1D_ENGINE_GC_CURSOR_OFF = 546;
var V1D_ENGINE_LAST_SWEEP_START_OFF = 552;
var V1D_ENGINE_LAST_SWEEP_COMPLETE_OFF = 560;
var V1D_ENGINE_CRANK_CURSOR_OFF = 568;
var V1D_ENGINE_SWEEP_START_IDX_OFF = 570;
var V1D_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 576;
var V1D_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 584;
var V1D_ENGINE_NET_LP_POS_OFF = 592;
var V1D_ENGINE_LP_SUM_ABS_OFF = 608;
var V1D_ENGINE_BITMAP_OFF = 624;
var V2_HEADER_LEN = 104;
var V2_CONFIG_LEN = 496;
var V2_ENGINE_OFF = 600;
var V2_ACCOUNT_SIZE = 248;
var V2_ENGINE_BITMAP_OFF = 432;
var V2_ENGINE_CURRENT_SLOT_OFF = 352;
var V2_ENGINE_FUNDING_INDEX_OFF = 360;
var V2_ENGINE_LAST_FUNDING_SLOT_OFF = 376;
var V2_ENGINE_FUNDING_RATE_BPS_OFF = 384;
var V2_ENGINE_LAST_CRANK_SLOT_OFF = 392;
var V2_ENGINE_MAX_CRANK_STALENESS_OFF = 400;
var V2_ENGINE_TOTAL_OI_OFF = 408;
var V2_ENGINE_C_TOT_OFF = 424;
var V2_ENGINE_PNL_POS_TOT_OFF = 440;
var V2_ENGINE_LIQ_CURSOR_OFF = 456;
var V2_ENGINE_GC_CURSOR_OFF = 458;
var V2_ENGINE_LAST_SWEEP_START_OFF = 464;
var V2_ENGINE_LAST_SWEEP_COMPLETE_OFF = 472;
var V2_ENGINE_CRANK_CURSOR_OFF = 480;
var V2_ENGINE_SWEEP_START_IDX_OFF = 482;
var V2_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 488;
var V2_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 496;
var V2_ENGINE_NET_LP_POS_OFF = 504;
var V2_ENGINE_LP_SUM_ABS_OFF = 520;
var V2_ENGINE_LP_MAX_ABS_OFF = 536;
var V2_ENGINE_LP_MAX_ABS_SWEEP_OFF = 552;
var V_ADL_ENGINE_OFF = 624;
var V_ADL_CONFIG_LEN = 520;
var V_SETDEXPOOL_CONFIG_LEN = 544;
var V_SETDEXPOOL_ENGINE_OFF = 648;
var V_ADL_ACCOUNT_SIZE = 312;
var V_ADL_ENGINE_PARAMS_OFF = 96;
var V_ADL_PARAMS_SIZE = 336;
var V_ADL_ENGINE_CURRENT_SLOT_OFF = 432;
var V_ADL_ENGINE_FUNDING_INDEX_OFF = 440;
var V_ADL_ENGINE_LAST_FUNDING_SLOT_OFF = 456;
var V_ADL_ENGINE_FUNDING_RATE_BPS_OFF = 464;
var V_ADL_ENGINE_MARK_PRICE_OFF = 504;
var V_ADL_ENGINE_LAST_CRANK_SLOT_OFF = 528;
var V_ADL_ENGINE_MAX_CRANK_STALENESS_OFF = 536;
var V_ADL_ENGINE_TOTAL_OI_OFF = 544;
var V_ADL_ENGINE_LONG_OI_OFF = 560;
var V_ADL_ENGINE_SHORT_OI_OFF = 576;
var V_ADL_ENGINE_C_TOT_OFF = 592;
var V_ADL_ENGINE_PNL_POS_TOT_OFF = 608;
var V_ADL_ENGINE_LIQ_CURSOR_OFF = 640;
var V_ADL_ENGINE_GC_CURSOR_OFF = 642;
var V_ADL_ENGINE_LAST_SWEEP_START_OFF = 648;
var V_ADL_ENGINE_LAST_SWEEP_COMPLETE_OFF = 656;
var V_ADL_ENGINE_CRANK_CURSOR_OFF = 664;
var V_ADL_ENGINE_SWEEP_START_IDX_OFF = 666;
var V_ADL_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 672;
var V_ADL_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 680;
var V_ADL_ENGINE_NET_LP_POS_OFF = 904;
var V_ADL_ENGINE_LP_SUM_ABS_OFF = 920;
var V_ADL_ENGINE_LP_MAX_ABS_OFF = 936;
var V_ADL_ENGINE_LP_MAX_ABS_SWEEP_OFF = 952;
var V_ADL_ENGINE_EMERGENCY_OI_MODE_OFF = 968;
var V_ADL_ENGINE_EMERGENCY_START_SLOT_OFF = 976;
var V_ADL_ENGINE_LAST_BREAKER_SLOT_OFF = 984;
var V_ADL_ENGINE_BITMAP_OFF = 1008;
var V_ADL_ACCT_WARMUP_STARTED_OFF = 64;
var V_ADL_ACCT_WARMUP_SLOPE_OFF = 72;
var V_ADL_ACCT_POSITION_SIZE_OFF = 88;
var V_ADL_ACCT_ENTRY_PRICE_OFF = 104;
var V_ADL_ACCT_FUNDING_INDEX_OFF = 112;
var V_ADL_ACCT_MATCHER_PROGRAM_OFF = 128;
var V_ADL_ACCT_MATCHER_CONTEXT_OFF = 160;
var V_ADL_ACCT_OWNER_OFF = 192;
var V_ADL_ACCT_FEE_CREDITS_OFF = 224;
var V_ADL_ACCT_LAST_FEE_SLOT_OFF = 240;
var V12_1_ENGINE_OFF = 648;
var V12_1_ACCOUNT_SIZE = 320;
var V12_1_ACCOUNT_SIZE_SBF = 280;
var V12_1_ENGINE_BITMAP_OFF = 1016;
var V12_1_ENGINE_PARAMS_OFF_SBF = 32;
var V12_1_ENGINE_PARAMS_OFF_HOST = 96;
var V12_1_PARAMS_SIZE_SBF = 184;
var V12_1_PARAMS_SIZE = 352;
var V12_1_SBF_OFF_CURRENT_SLOT = 216;
var V12_1_SBF_OFF_FUNDING_RATE = 224;
var V12_1_SBF_OFF_LAST_CRANK_SLOT = 232;
var V12_1_SBF_OFF_MAX_CRANK_STALENESS = 240;
var V12_1_SBF_OFF_C_TOT = 248;
var V12_1_SBF_OFF_PNL_POS_TOT = 264;
var V12_1_SBF_OFF_LIQ_CURSOR = 296;
var V12_1_SBF_OFF_GC_CURSOR = 298;
var V12_1_SBF_OFF_LAST_SWEEP_START = 304;
var V12_1_SBF_OFF_LAST_SWEEP_COMPLETE = 312;
var V12_1_SBF_OFF_CRANK_CURSOR = 320;
var V12_1_SBF_OFF_SWEEP_START_IDX = 322;
var V12_1_SBF_OFF_LIFETIME_LIQUIDATIONS = 328;
var V12_1_SBF_OFF_TOTAL_OI = 448;
var V12_1_SBF_OFF_LONG_OI = 464;
var V12_1_SBF_OFF_SHORT_OI = 480;
var V12_1_SBF_OFF_MARK_PRICE_E6 = 560;
var V12_1_ENGINE_CURRENT_SLOT_OFF = 448;
var V12_1_ENGINE_FUNDING_RATE_BPS_OFF = 456;
var V12_1_ENGINE_LAST_CRANK_SLOT_OFF = 464;
var V12_1_ENGINE_MAX_CRANK_STALENESS_OFF = 472;
var V12_1_ENGINE_C_TOT_OFF = 480;
var V12_1_ENGINE_PNL_POS_TOT_OFF = 496;
var V12_1_ENGINE_LIQ_CURSOR_OFF = 528;
var V12_1_ENGINE_GC_CURSOR_OFF = 530;
var V12_1_ENGINE_LAST_SWEEP_START_OFF = 536;
var V12_1_ENGINE_LAST_SWEEP_COMPLETE_OFF = 544;
var V12_1_ENGINE_CRANK_CURSOR_OFF = 552;
var V12_1_ENGINE_SWEEP_START_IDX_OFF = 554;
var V12_1_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 560;
var V12_1_ENGINE_TOTAL_OI_OFF = 816;
var V12_1_ENGINE_LONG_OI_OFF = 832;
var V12_1_ENGINE_SHORT_OI_OFF = 848;
var V12_1_ENGINE_NET_LP_POS_OFF = 864;
var V12_1_ENGINE_LP_SUM_ABS_OFF = 880;
var V12_1_ENGINE_LP_MAX_ABS_OFF = 896;
var V12_1_ENGINE_LP_MAX_ABS_SWEEP_OFF = 912;
var V12_1_ENGINE_MARK_PRICE_OFF = 928;
var V12_1_ENGINE_FUNDING_INDEX_OFF = 936;
var V12_1_ENGINE_LAST_FUNDING_SLOT_OFF = 944;
var V12_1_ENGINE_EMERGENCY_OI_MODE_OFF = 968;
var V12_1_ENGINE_EMERGENCY_START_SLOT_OFF = 976;
var V12_1_ENGINE_LAST_BREAKER_SLOT_OFF = 984;
var V12_1_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 1008;
var V12_1_ACCT_MATCHER_PROGRAM_OFF = 144;
var V12_1_ACCT_MATCHER_CONTEXT_OFF = 176;
var V12_1_ACCT_OWNER_OFF = 208;
var V12_1_ACCT_FEE_CREDITS_OFF = 240;
var V12_1_ACCT_LAST_FEE_SLOT_OFF = 256;
var V12_1_ACCT_POSITION_SIZE_OFF = 88;
var V12_1_ACCT_ENTRY_PRICE_OFF = -1;
var V12_1_EP_SBF_ACCOUNT_SIZE = 288;
var V12_1_EP_ACCT_ENTRY_PRICE_OFF = 144;
var V12_1_EP_ACCT_MATCHER_PROGRAM_OFF = 152;
var V12_1_EP_ACCT_MATCHER_CONTEXT_OFF = 184;
var V12_1_EP_ACCT_OWNER_OFF = 216;
var V12_1_EP_ACCT_FEE_CREDITS_OFF = 248;
var V12_1_EP_ACCT_LAST_FEE_SLOT_OFF = 264;
var V12_15_ENGINE_OFF = 624;
var V12_15_ENGINE_OFF_SBF = 616;
var V12_15_ACCOUNT_SIZE = 4400;
var V12_15_ACCOUNT_SIZE_SMALL = 920;
var V12_15_ACCT_ACCOUNT_ID_OFF = 0;
var V12_15_ACCT_CAPITAL_OFF = 8;
var V12_15_ACCT_KIND_OFF = 24;
var V12_15_ACCT_PNL_OFF = 32;
var V12_15_ACCT_RESERVED_PNL_OFF = 48;
var V12_15_ACCT_POSITION_BASIS_Q_OFF = 64;
var V12_15_ACCT_ENTRY_PRICE_OFF = 120;
var V12_15_ACCT_MATCHER_PROGRAM_OFF = 128;
var V12_15_ACCT_MATCHER_CONTEXT_OFF = 160;
var V12_15_ACCT_OWNER_OFF = 192;
var V12_15_ACCT_FEE_CREDITS_OFF = 224;
var V12_15_ACCT_FEES_EARNED_TOTAL_OFF = 240;
var V12_15_ACCT_EXACT_RESERVE_COHORTS_OFF = 256;
var V12_15_ACCT_EXACT_COHORT_COUNT_OFF = 4224;
var V12_15_ACCT_OVERFLOW_OLDER_OFF = 4240;
var V12_15_ACCT_OVERFLOW_OLDER_PRESENT_OFF = 4304;
var V12_15_ACCT_OVERFLOW_NEWEST_OFF = 4320;
var V12_15_ACCT_OVERFLOW_NEWEST_PRESENT_OFF = 4384;
var V12_15_PARAMS_SIZE = 192;
var V12_15_PARAMS_MAX_ACCOUNTS_OFF = 24;
var V12_15_PARAMS_INSURANCE_FLOOR_OFF = 144;
var V12_15_PARAMS_H_MIN_OFF = 160;
var V12_15_PARAMS_H_MAX_OFF = 168;
var V12_15_ENGINE_PARAMS_OFF = 32;
var V12_15_ENGINE_CURRENT_SLOT_OFF = 224;
var V12_15_ENGINE_FUNDING_RATE_E9_OFF = 240;
var V12_15_ENGINE_C_TOT_OFF = 344;
var V12_15_ENGINE_PNL_POS_TOT_OFF = 368;
var V12_15_ENGINE_PNL_MATURED_POS_TOT_OFF = 384;
var V12_15_ENGINE_BITMAP_OFF = 862;
var V12_15_SIZES = /* @__PURE__ */ new Map();
var V12_17_ENGINE_OFF = 592;
var V12_17_ACCOUNT_SIZE = 368;
var V12_17_ENGINE_BITMAP_OFF = 752;
var V12_17_RISK_BUF_LEN = 160;
var V12_17_GEN_TABLE_ENTRY = 8;
var V12_17_ENGINE_OFF_SBF = 584;
var V12_17_ACCOUNT_SIZE_SBF = 352;
var V12_17_ENGINE_BITMAP_OFF_SBF = 712;
var V12_17_ACCT_CAPITAL_OFF = 0;
var V12_17_ACCT_KIND_OFF = 16;
var V12_17_ACCT_PNL_OFF = 32;
var V12_17_ACCT_RESERVED_PNL_OFF = 48;
var V12_17_ACCT_POSITION_BASIS_Q_OFF = 64;
var V12_17_ACCT_ADL_A_BASIS_OFF = 80;
var V12_17_ACCT_ADL_K_SNAP_OFF = 96;
var V12_17_ACCT_F_SNAP_OFF = 112;
var V12_17_ACCT_ADL_EPOCH_SNAP_OFF = 128;
var V12_17_ACCT_MATCHER_PROGRAM_OFF = 136;
var V12_17_ACCT_MATCHER_CONTEXT_OFF = 168;
var V12_17_ACCT_OWNER_OFF = 200;
var V12_17_ACCT_FEE_CREDITS_OFF = 232;
var V12_17_ACCT_SCHED_PRESENT_OFF = 248;
var V12_17_ACCT_SCHED_REMAINING_Q_OFF = 256;
var V12_17_ACCT_SCHED_ANCHOR_Q_OFF = 272;
var V12_17_ACCT_SCHED_START_SLOT_OFF = 288;
var V12_17_ACCT_SCHED_HORIZON_OFF = 296;
var V12_17_ACCT_SCHED_RELEASE_Q_OFF = 304;
var V12_17_ACCT_PENDING_PRESENT_OFF = 320;
var V12_17_ACCT_PENDING_REMAINING_Q_OFF = 336;
var V12_17_ACCT_PENDING_HORIZON_OFF = 352;
var V12_17_ACCT_PENDING_CREATED_SLOT_OFF = 360;
var V12_17_ENGINE_PARAMS_OFF = 32;
var V12_17_ENGINE_CURRENT_SLOT_OFF = 224;
var V12_17_ENGINE_MARKET_MODE_OFF = 232;
var V12_17_ENGINE_RESOLVED_K_LONG_OFF = 304;
var V12_17_ENGINE_RESOLVED_K_SHORT_OFF = 320;
var V12_17_ENGINE_RESOLVED_LIVE_PRICE_OFF = 336;
var V12_17_ENGINE_LAST_CRANK_SLOT_OFF = 344;
var V12_17_ENGINE_C_TOT_OFF = 352;
var V12_17_ENGINE_PNL_POS_TOT_OFF = 368;
var V12_17_ENGINE_PNL_MATURED_POS_TOT_OFF = 384;
var V12_17_ENGINE_GC_CURSOR_OFF = 400;
var V12_17_ENGINE_OI_EFF_LONG_OFF = 528;
var V12_17_ENGINE_OI_EFF_SHORT_OFF = 544;
var V12_17_ENGINE_NEG_PNL_COUNT_OFF = 648;
var V12_17_ENGINE_LAST_ORACLE_PRICE_OFF = 656;
var V12_17_ENGINE_FUND_PX_LAST_OFF = 664;
var V12_17_ENGINE_F_LONG_NUM_OFF = 688;
var V12_17_ENGINE_F_SHORT_NUM_OFF = 704;
var V12_17_SBF_ENGINE_CURRENT_SLOT_OFF = 216;
var V12_17_SBF_ENGINE_MARKET_MODE_OFF = 224;
var V12_17_SBF_ENGINE_LAST_CRANK_SLOT_OFF = 328;
var V12_17_SBF_ENGINE_C_TOT_OFF = 336;
var V12_17_SBF_ENGINE_PNL_POS_TOT_OFF = 352;
var V12_17_SBF_ENGINE_PNL_MATURED_POS_TOT_OFF = 368;
var V12_17_SBF_ENGINE_GC_CURSOR_OFF = 384;
var V12_17_SBF_ENGINE_OI_EFF_LONG_OFF = 504;
var V12_17_SBF_ENGINE_OI_EFF_SHORT_OFF = 520;
var V12_17_SBF_ENGINE_NEG_PNL_COUNT_OFF = 616;
var V12_17_SBF_ENGINE_LAST_ORACLE_PRICE_OFF = 624;
var V12_17_SBF_ENGINE_FUND_PX_LAST_OFF = 632;
var V12_17_SBF_ENGINE_F_LONG_NUM_OFF = 648;
var V12_17_SBF_ENGINE_F_SHORT_NUM_OFF = 664;
var V12_17_SIZES = /* @__PURE__ */ new Map();
var V1M_ENGINE_OFF = 640;
var V1M_CONFIG_LEN = 536;
var V1M_ACCOUNT_SIZE = 248;
var V1M2_ENGINE_OFF = 616;
var V1M2_CONFIG_LEN = 512;
var V1M_ENGINE_PARAMS_OFF = 72;
var V1M2_ENGINE_PARAMS_OFF = 96;
var V1M_PARAMS_SIZE = 336;
var V1M_ENGINE_CURRENT_SLOT_OFF = 408;
var V1M_ENGINE_FUNDING_INDEX_OFF = 416;
var V1M_ENGINE_LAST_FUNDING_SLOT_OFF = 432;
var V1M_ENGINE_FUNDING_RATE_BPS_OFF = 440;
var V1M_ENGINE_MARK_PRICE_OFF = 448;
var V1M_ENGINE_LAST_CRANK_SLOT_OFF = 472;
var V1M_ENGINE_MAX_CRANK_STALENESS_OFF = 480;
var V1M_ENGINE_TOTAL_OI_OFF = 488;
var V1M_ENGINE_LONG_OI_OFF = 504;
var V1M_ENGINE_SHORT_OI_OFF = 520;
var V1M_ENGINE_C_TOT_OFF = 536;
var V1M_ENGINE_PNL_POS_TOT_OFF = 552;
var V1M_ENGINE_LIQ_CURSOR_OFF = 568;
var V1M_ENGINE_GC_CURSOR_OFF = 570;
var V1M_ENGINE_LAST_SWEEP_START_OFF = 576;
var V1M_ENGINE_LAST_SWEEP_COMPLETE_OFF = 584;
var V1M_ENGINE_CRANK_CURSOR_OFF = 592;
var V1M_ENGINE_SWEEP_START_IDX_OFF = 594;
var V1M_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 600;
var V1M_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 608;
var V1M_ENGINE_NET_LP_POS_OFF = 616;
var V1M_ENGINE_LP_SUM_ABS_OFF = 632;
var V1M_ENGINE_LP_MAX_ABS_OFF = 648;
var V1M_ENGINE_LP_MAX_ABS_SWEEP_OFF = 664;
var V1M_ENGINE_EMERGENCY_OI_MODE_OFF = 680;
var V1M_ENGINE_EMERGENCY_START_SLOT_OFF = 688;
var V1M_ENGINE_LAST_BREAKER_SLOT_OFF = 696;
var V1M_ENGINE_BITMAP_OFF = 720;
var V1M2_ACCOUNT_SIZE = 312;
var V1M2_ENGINE_BITMAP_OFF = 1008;
var ENGINE_OFF = V1_ENGINE_OFF;
var ENGINE_MARK_PRICE_OFF = V1_ENGINE_MARK_PRICE_OFF;
function computeSlabSize(engineOff, bitmapOff, accountSize, maxAccounts, postBitmap = 18) {
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOff = Math.ceil(preAccountsLen / 8) * 8;
  return engineOff + accountsOff + maxAccounts * accountSize;
}
var TIERS = [64, 256, 1024, 4096];
var V0_SIZES = /* @__PURE__ */ new Map();
var V1_SIZES = /* @__PURE__ */ new Map();
var V1_SIZES_LEGACY = /* @__PURE__ */ new Map();
var V1D_SIZES = /* @__PURE__ */ new Map();
var V2_SIZES = /* @__PURE__ */ new Map();
var V1M_SIZES = /* @__PURE__ */ new Map();
var V_ADL_SIZES = /* @__PURE__ */ new Map();
var V1M2_SIZES = /* @__PURE__ */ new Map();
var V_SETDEXPOOL_SIZES = /* @__PURE__ */ new Map();
var V12_1_SIZES = /* @__PURE__ */ new Map();
var V1D_SIZES_LEGACY = /* @__PURE__ */ new Map();
for (const n of TIERS) {
  V0_SIZES.set(computeSlabSize(V0_ENGINE_OFF, V0_ENGINE_BITMAP_OFF, V0_ACCOUNT_SIZE, n), n);
  V1_SIZES.set(computeSlabSize(V1_ENGINE_OFF, V1_ENGINE_BITMAP_OFF, V1_ACCOUNT_SIZE, n), n);
  V1_SIZES_LEGACY.set(computeSlabSize(V1_ENGINE_OFF_LEGACY, V1_ENGINE_BITMAP_OFF, V1_ACCOUNT_SIZE, n), n);
  V1D_SIZES.set(computeSlabSize(V1D_ENGINE_OFF, V1D_ENGINE_BITMAP_OFF, V1D_ACCOUNT_SIZE, n, 2), n);
  V1D_SIZES_LEGACY.set(computeSlabSize(V1D_ENGINE_OFF, V1D_ENGINE_BITMAP_OFF, V1D_ACCOUNT_SIZE, n, 18), n);
  V2_SIZES.set(computeSlabSize(V2_ENGINE_OFF, V2_ENGINE_BITMAP_OFF, V2_ACCOUNT_SIZE, n, 18), n);
  V1M_SIZES.set(computeSlabSize(V1M_ENGINE_OFF, V1M_ENGINE_BITMAP_OFF, V1M_ACCOUNT_SIZE, n, 18), n);
  V_ADL_SIZES.set(computeSlabSize(V_ADL_ENGINE_OFF, V_ADL_ENGINE_BITMAP_OFF, V_ADL_ACCOUNT_SIZE, n, 18), n);
  V1M2_SIZES.set(computeSlabSize(V1M2_ENGINE_OFF, V1M2_ENGINE_BITMAP_OFF, V1M2_ACCOUNT_SIZE, n, 18), n);
  V_SETDEXPOOL_SIZES.set(computeSlabSize(V_SETDEXPOOL_ENGINE_OFF, V_ADL_ENGINE_BITMAP_OFF, V_ADL_ACCOUNT_SIZE, n, 18), n);
  V12_1_SIZES.set(computeSlabSize(V12_1_ENGINE_OFF, V12_1_ENGINE_BITMAP_OFF, V12_1_ACCOUNT_SIZE, n, 18), n);
  V12_15_SIZES.set(computeSlabSize(V12_15_ENGINE_OFF, V12_15_ENGINE_BITMAP_OFF, V12_15_ACCOUNT_SIZE, n, 18), n);
}
V12_15_SIZES.set(computeSlabSize(V12_15_ENGINE_OFF, V12_15_ENGINE_BITMAP_OFF, V12_15_ACCOUNT_SIZE, 2048, 18), 2048);
V12_15_SIZES.set(237512, 256);
var V12_17_TIERS = [256, 1024, 4096];
for (const n of V12_17_TIERS) {
  const bitmapWords = Math.ceil(n / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 4;
  const nextFreeBytes = n * 2;
  const preAccNative = V12_17_ENGINE_BITMAP_OFF + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffNative = Math.ceil(preAccNative / 16) * 16;
  const nativeSize = V12_17_ENGINE_OFF + accountsOffNative + n * V12_17_ACCOUNT_SIZE + V12_17_RISK_BUF_LEN + n * V12_17_GEN_TABLE_ENTRY;
  V12_17_SIZES.set(nativeSize, n);
  const preAccSbf = V12_17_ENGINE_BITMAP_OFF_SBF + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffSbf = Math.ceil(preAccSbf / 8) * 8;
  const sbfSize = V12_17_ENGINE_OFF_SBF + accountsOffSbf + n * V12_17_ACCOUNT_SIZE_SBF + V12_17_RISK_BUF_LEN + n * V12_17_GEN_TABLE_ENTRY;
  V12_17_SIZES.set(sbfSize, n);
}
var V12_19_HEADER_LEN_SBF = 136;
var V12_19_CONFIG_LEN = 480;
var V12_19_ENGINE_OFF_SBF = 616;
var V12_19_ACCOUNT_SIZE_SBF = 360;
var V12_19_SBF_ENGINE_BITMAP_OFF = 736;
var V12_19_SBF_ENGINE_PARAMS_SIZE = 168;
var V12_19_SBF_ENGINE_CURRENT_SLOT_OFF = 200;
var V12_19_SBF_ENGINE_MARKET_MODE_OFF = 208;
var V12_19_SBF_ENGINE_RESOLVED_LIVE_PRICE_OFF = 304;
var V12_19_SBF_ENGINE_C_TOT_OFF = 312;
var V12_19_SBF_ENGINE_PNL_POS_TOT_OFF = 328;
var V12_19_SBF_ENGINE_PNL_MATURED_POS_TOT_OFF = 344;
var V12_19_SBF_ENGINE_OI_EFF_LONG_OFF = 472;
var V12_19_SBF_ENGINE_OI_EFF_SHORT_OFF = 488;
var V12_19_SBF_ENGINE_NEG_PNL_COUNT_OFF = 584;
var V12_19_SBF_ENGINE_RR_CURSOR_OFF = 592;
var V12_19_SBF_ENGINE_LAST_ORACLE_PRICE_OFF = 624;
var V12_19_SBF_ENGINE_FUND_PX_LAST_OFF = 632;
var V12_19_SBF_ENGINE_LAST_MARKET_SLOT_OFF = 640;
var V12_19_SBF_ENGINE_F_LONG_NUM_OFF = 648;
var V12_19_SBF_ENGINE_F_SHORT_NUM_OFF = 664;
var V12_19_SIZES = /* @__PURE__ */ new Map([
  [26872, 64],
  // --features micro (derived)
  [96784, 256],
  // --features small (probe-confirmed; deployed mainnet ESa89R5...)
  [376432, 1024],
  // --features medium (derived)
  [1495024, 4096]
  // default features / large (derived)
]);
function buildLayoutV12_19(maxAccounts, _dataLen) {
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const numUsedOff = V12_19_SBF_ENGINE_BITMAP_OFF + bitmapBytes;
  const freeHeadOff = numUsedOff + 2;
  const nextFreeOff = freeHeadOff + 2;
  const prevFreeOff = nextFreeOff + maxAccounts * 2;
  const accountsRelEnd = prevFreeOff + maxAccounts * 2;
  const accountsOffRel = Math.ceil(accountsRelEnd / 8) * 8;
  const accountsOff = V12_19_ENGINE_OFF_SBF + accountsOffRel;
  const base = buildLayoutV12_17(
    maxAccounts,
    /* synthetic V12_17 SBF size */
    94168
  );
  return {
    ...base,
    headerLen: V12_19_HEADER_LEN_SBF,
    configLen: V12_19_CONFIG_LEN,
    configOffset: V12_19_HEADER_LEN_SBF,
    // header runs 0..136 in v12.19
    engineOff: V12_19_ENGINE_OFF_SBF,
    accountSize: V12_19_ACCOUNT_SIZE_SBF,
    accountsOff,
    bitmapWords,
    paramsSize: V12_19_SBF_ENGINE_PARAMS_SIZE,
    engineBitmapOff: V12_19_SBF_ENGINE_BITMAP_OFF,
    // V12_19-specific engine field offsets (probe-confirmed):
    engineCurrentSlotOff: V12_19_SBF_ENGINE_CURRENT_SLOT_OFF,
    engineCTotOff: V12_19_SBF_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: V12_19_SBF_ENGINE_PNL_POS_TOT_OFF,
    engineLongOiOff: V12_19_SBF_ENGINE_OI_EFF_LONG_OFF,
    engineShortOiOff: V12_19_SBF_ENGINE_OI_EFF_SHORT_OFF,
    // last_market_slot replaces V12_17 last_crank_slot semantics.
    engineLastCrankSlotOff: V12_19_SBF_ENGINE_LAST_MARKET_SLOT_OFF,
    // rr_cursor_position replaces V12_17 gc_cursor semantics.
    engineGcCursorOff: V12_19_SBF_ENGINE_RR_CURSOR_OFF
  };
}
var V12_1_SBF_ACCOUNT_SIZE = 280;
var V12_1_SBF_ENGINE_OFF = 616;
var V12_1_SBF_BITMAP_OFF = 584;
for (const [, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const bitmapBytes = Math.ceil(n / 64) * 8;
  const preAccLen = V12_1_SBF_BITMAP_OFF + bitmapBytes + 18 + n * 2;
  const accountsOff = Math.ceil(preAccLen / 8) * 8;
  const total = V12_1_SBF_ENGINE_OFF + accountsOff + n * V12_1_SBF_ACCOUNT_SIZE;
  V12_1_SIZES.set(total, n);
}
var V12_1_EP_SIZES = /* @__PURE__ */ new Map();
for (const [, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const bitmapBytes = Math.ceil(n / 64) * 8;
  const preAccLen = V12_1_SBF_BITMAP_OFF + bitmapBytes + 18 + n * 2;
  const accountsOff = Math.ceil(preAccLen / 8) * 8;
  const total = V12_1_SBF_ENGINE_OFF + accountsOff + n * V12_1_EP_SBF_ACCOUNT_SIZE;
  V12_1_EP_SIZES.set(total, n);
}
var SLAB_TIERS_V2 = Object.freeze({
  small: { maxAccounts: 256, dataSize: 65088, label: "Small", description: "256 slots (V2 BPF intermediate)" },
  large: { maxAccounts: 4096, dataSize: 1025568, label: "Large", description: "4,096 slots (V2 BPF intermediate)" }
});
var SLAB_TIERS_V1M = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const size = computeSlabSize(V1M_ENGINE_OFF, V1M_ENGINE_BITMAP_OFF, V1M_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V1M[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (V1M mainnet)` };
}
Object.freeze(SLAB_TIERS_V1M);
var SLAB_TIERS_V1M2 = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const size = computeSlabSize(V1M2_ENGINE_OFF, V1M2_ENGINE_BITMAP_OFF, V1M2_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V1M2[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (V1M2 mainnet upgraded)` };
}
Object.freeze(SLAB_TIERS_V1M2);
var SLAB_TIERS_V_ADL = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const size = computeSlabSize(V_ADL_ENGINE_OFF, V_ADL_ENGINE_BITMAP_OFF, V_ADL_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V_ADL[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (V_ADL PERC-8270)` };
}
Object.freeze(SLAB_TIERS_V_ADL);
function buildLayout(version, maxAccounts, engineOffOverride) {
  const isV0 = version === 0;
  const engineOff = engineOffOverride ?? (isV0 ? V0_ENGINE_OFF : V1_ENGINE_OFF);
  const isV1Legacy = !isV0 && engineOffOverride === V1_ENGINE_OFF_LEGACY;
  const bitmapOff = isV0 ? V0_ENGINE_BITMAP_OFF : V1_ENGINE_BITMAP_OFF;
  const actualBitmapOff = isV1Legacy ? V1_LEGACY_ENGINE_BITMAP_OFF_ACTUAL : isV0 ? V0_ENGINE_BITMAP_OFF : V1_ENGINE_BITMAP_OFF;
  const accountSize = isV0 ? V0_ACCOUNT_SIZE : V1_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = actualBitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version,
    headerLen: isV0 ? V0_HEADER_LEN : V1_HEADER_LEN,
    configOffset: isV0 ? V0_HEADER_LEN : V1_HEADER_LEN,
    configLen: isV0 ? V0_CONFIG_LEN : V1_CONFIG_LEN,
    reservedOff: isV0 ? V0_RESERVED_OFF : V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: isV0 ? V0_ENGINE_PARAMS_OFF : V1_ENGINE_PARAMS_OFF,
    paramsSize: isV0 ? V0_PARAMS_SIZE : V1_PARAMS_SIZE,
    engineCurrentSlotOff: isV0 ? V0_ENGINE_CURRENT_SLOT_OFF : V1_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: isV0 ? V0_ENGINE_FUNDING_INDEX_OFF : V1_ENGINE_FUNDING_INDEX_OFF,
    engineLastFundingSlotOff: isV0 ? V0_ENGINE_LAST_FUNDING_SLOT_OFF : V1_ENGINE_LAST_FUNDING_SLOT_OFF,
    engineFundingRateBpsOff: isV0 ? V0_ENGINE_FUNDING_RATE_BPS_OFF : V1_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: isV0 ? -1 : V1_ENGINE_MARK_PRICE_OFF,
    engineLastCrankSlotOff: isV0 ? V0_ENGINE_LAST_CRANK_SLOT_OFF : V1_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: isV0 ? V0_ENGINE_MAX_CRANK_STALENESS_OFF : V1_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: isV0 ? V0_ENGINE_TOTAL_OI_OFF : V1_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: isV0 ? -1 : V1_ENGINE_LONG_OI_OFF,
    engineShortOiOff: isV0 ? -1 : V1_ENGINE_SHORT_OI_OFF,
    engineCTotOff: isV0 ? V0_ENGINE_C_TOT_OFF : V1_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: isV0 ? V0_ENGINE_PNL_POS_TOT_OFF : V1_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: isV0 ? V0_ENGINE_LIQ_CURSOR_OFF : V1_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: isV0 ? V0_ENGINE_GC_CURSOR_OFF : V1_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: isV0 ? V0_ENGINE_LAST_SWEEP_START_OFF : V1_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: isV0 ? V0_ENGINE_LAST_SWEEP_COMPLETE_OFF : V1_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: isV0 ? V0_ENGINE_CRANK_CURSOR_OFF : V1_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: isV0 ? V0_ENGINE_SWEEP_START_IDX_OFF : V1_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: isV0 ? V0_ENGINE_LIFETIME_LIQUIDATIONS_OFF : V1_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: isV0 ? V0_ENGINE_LIFETIME_FORCE_CLOSES_OFF : V1_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    engineNetLpPosOff: isV0 ? V0_ENGINE_NET_LP_POS_OFF : V1_ENGINE_NET_LP_POS_OFF,
    engineLpSumAbsOff: isV0 ? V0_ENGINE_LP_SUM_ABS_OFF : V1_ENGINE_LP_SUM_ABS_OFF,
    engineLpMaxAbsOff: isV0 ? V0_ENGINE_LP_MAX_ABS_OFF : V1_ENGINE_LP_MAX_ABS_OFF,
    engineLpMaxAbsSweepOff: isV0 ? V0_ENGINE_LP_MAX_ABS_SWEEP_OFF : V1_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    engineEmergencyOiModeOff: isV0 ? -1 : V1_ENGINE_EMERGENCY_OI_MODE_OFF,
    engineEmergencyStartSlotOff: isV0 ? -1 : V1_ENGINE_EMERGENCY_START_SLOT_OFF,
    engineLastBreakerSlotOff: isV0 ? -1 : V1_ENGINE_LAST_BREAKER_SLOT_OFF,
    engineBitmapOff: actualBitmapOff,
    postBitmap: 18,
    acctOwnerOff: isV1Legacy ? V1_LEGACY_ACCT_OWNER_OFF : ACCT_OWNER_OFF,
    hasInsuranceIsolation: !isV0,
    engineInsuranceIsolatedOff: isV0 ? -1 : 48,
    engineInsuranceIsolationBpsOff: isV0 ? -1 : 64
  };
}
function buildLayoutV1D(maxAccounts, postBitmap = 2) {
  const engineOff = V1D_ENGINE_OFF;
  const bitmapOff = V1D_ENGINE_BITMAP_OFF;
  const accountSize = V1D_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V1_HEADER_LEN,
    configOffset: V1_HEADER_LEN,
    configLen: V1D_CONFIG_LEN,
    reservedOff: V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: V1D_ENGINE_INSURANCE_OFF,
    engineParamsOff: V1D_ENGINE_PARAMS_OFF,
    paramsSize: V1D_PARAMS_SIZE,
    engineCurrentSlotOff: V1D_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: V1D_ENGINE_FUNDING_INDEX_OFF,
    engineLastFundingSlotOff: V1D_ENGINE_LAST_FUNDING_SLOT_OFF,
    engineFundingRateBpsOff: V1D_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: V1D_ENGINE_MARK_PRICE_OFF,
    engineLastCrankSlotOff: V1D_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: V1D_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: V1D_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: V1D_ENGINE_LONG_OI_OFF,
    engineShortOiOff: V1D_ENGINE_SHORT_OI_OFF,
    engineCTotOff: V1D_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: V1D_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: V1D_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: V1D_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: V1D_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: V1D_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: V1D_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: V1D_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: V1D_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: V1D_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    engineNetLpPosOff: V1D_ENGINE_NET_LP_POS_OFF,
    engineLpSumAbsOff: V1D_ENGINE_LP_SUM_ABS_OFF,
    engineLpMaxAbsOff: -1,
    // not present in deployed V1
    engineLpMaxAbsSweepOff: -1,
    // not present in deployed V1
    engineEmergencyOiModeOff: -1,
    // not present in deployed V1
    engineEmergencyStartSlotOff: -1,
    // not present in deployed V1
    engineLastBreakerSlotOff: -1,
    // not present in deployed V1
    engineBitmapOff: V1D_ENGINE_BITMAP_OFF,
    postBitmap,
    acctOwnerOff: ACCT_OWNER_OFF,
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    // same within InsuranceFund
    engineInsuranceIsolationBpsOff: 64
    // same within InsuranceFund
  };
}
function buildLayoutV2(maxAccounts) {
  const engineOff = V2_ENGINE_OFF;
  const bitmapOff = V2_ENGINE_BITMAP_OFF;
  const accountSize = V2_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 2,
    headerLen: V2_HEADER_LEN,
    configOffset: V2_HEADER_LEN,
    configLen: V2_CONFIG_LEN,
    reservedOff: V1_RESERVED_OFF,
    // V2 shares V1's header layout (reserved at 80)
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V1_ENGINE_PARAMS_OFF,
    // same as V1: 72
    paramsSize: V1_PARAMS_SIZE,
    // same as V1: 288
    engineCurrentSlotOff: V2_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: V2_ENGINE_FUNDING_INDEX_OFF,
    engineLastFundingSlotOff: V2_ENGINE_LAST_FUNDING_SLOT_OFF,
    engineFundingRateBpsOff: V2_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: -1,
    // V2 has no mark_price
    engineLastCrankSlotOff: V2_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: V2_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: V2_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: -1,
    // V2 has no long_oi
    engineShortOiOff: -1,
    // V2 has no short_oi
    engineCTotOff: V2_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: V2_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: V2_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: V2_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: V2_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: V2_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: V2_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: V2_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: V2_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: V2_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    engineNetLpPosOff: V2_ENGINE_NET_LP_POS_OFF,
    engineLpSumAbsOff: V2_ENGINE_LP_SUM_ABS_OFF,
    engineLpMaxAbsOff: V2_ENGINE_LP_MAX_ABS_OFF,
    engineLpMaxAbsSweepOff: V2_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    engineEmergencyOiModeOff: -1,
    // V2 has no emergency OI fields
    engineEmergencyStartSlotOff: -1,
    engineLastBreakerSlotOff: -1,
    engineBitmapOff: V2_ENGINE_BITMAP_OFF,
    postBitmap: 18,
    acctOwnerOff: ACCT_OWNER_OFF,
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    engineInsuranceIsolationBpsOff: 64
  };
}
function buildLayoutV1M(maxAccounts) {
  const engineOff = V1M_ENGINE_OFF;
  const bitmapOff = V1M_ENGINE_BITMAP_OFF;
  const accountSize = V1M_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V1_HEADER_LEN,
    configOffset: V1_HEADER_LEN,
    configLen: V1M_CONFIG_LEN,
    reservedOff: V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V1M_ENGINE_PARAMS_OFF,
    paramsSize: V1M_PARAMS_SIZE,
    engineCurrentSlotOff: V1M_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: V1M_ENGINE_FUNDING_INDEX_OFF,
    engineLastFundingSlotOff: V1M_ENGINE_LAST_FUNDING_SLOT_OFF,
    engineFundingRateBpsOff: V1M_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: V1M_ENGINE_MARK_PRICE_OFF,
    engineLastCrankSlotOff: V1M_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: V1M_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: V1M_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: V1M_ENGINE_LONG_OI_OFF,
    engineShortOiOff: V1M_ENGINE_SHORT_OI_OFF,
    engineCTotOff: V1M_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: V1M_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: V1M_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: V1M_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: V1M_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: V1M_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: V1M_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: V1M_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: V1M_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: V1M_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    engineNetLpPosOff: V1M_ENGINE_NET_LP_POS_OFF,
    engineLpSumAbsOff: V1M_ENGINE_LP_SUM_ABS_OFF,
    engineLpMaxAbsOff: V1M_ENGINE_LP_MAX_ABS_OFF,
    engineLpMaxAbsSweepOff: V1M_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    engineEmergencyOiModeOff: V1M_ENGINE_EMERGENCY_OI_MODE_OFF,
    engineEmergencyStartSlotOff: V1M_ENGINE_EMERGENCY_START_SLOT_OFF,
    engineLastBreakerSlotOff: V1M_ENGINE_LAST_BREAKER_SLOT_OFF,
    engineBitmapOff: V1M_ENGINE_BITMAP_OFF,
    postBitmap: 18,
    acctOwnerOff: ACCT_OWNER_OFF,
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    engineInsuranceIsolationBpsOff: 64
  };
}
function buildLayoutV1M2(maxAccounts) {
  const engineOff = V1M2_ENGINE_OFF;
  const bitmapOff = V1M2_ENGINE_BITMAP_OFF;
  const accountSize = V1M2_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V1_HEADER_LEN,
    configOffset: V1_HEADER_LEN,
    configLen: V1M2_CONFIG_LEN,
    reservedOff: V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V1M2_ENGINE_PARAMS_OFF,
    // 96 — expanded InsuranceFund (same as V_ADL)
    paramsSize: V_ADL_PARAMS_SIZE,
    // 336 — same as V_ADL
    // Runtime fields: V1M2 engine struct is layout-identical to V_ADL — reuse V_ADL constants.
    engineCurrentSlotOff: V_ADL_ENGINE_CURRENT_SLOT_OFF,
    // 432
    engineFundingIndexOff: V_ADL_ENGINE_FUNDING_INDEX_OFF,
    // 440
    engineLastFundingSlotOff: V_ADL_ENGINE_LAST_FUNDING_SLOT_OFF,
    // 456
    engineFundingRateBpsOff: V_ADL_ENGINE_FUNDING_RATE_BPS_OFF,
    // 464
    engineMarkPriceOff: V_ADL_ENGINE_MARK_PRICE_OFF,
    // 504
    engineLastCrankSlotOff: V_ADL_ENGINE_LAST_CRANK_SLOT_OFF,
    // 528
    engineMaxCrankStalenessOff: V_ADL_ENGINE_MAX_CRANK_STALENESS_OFF,
    // 536
    engineTotalOiOff: V_ADL_ENGINE_TOTAL_OI_OFF,
    // 544
    engineLongOiOff: V_ADL_ENGINE_LONG_OI_OFF,
    // 560
    engineShortOiOff: V_ADL_ENGINE_SHORT_OI_OFF,
    // 576
    engineCTotOff: V_ADL_ENGINE_C_TOT_OFF,
    // 592
    enginePnlPosTotOff: V_ADL_ENGINE_PNL_POS_TOT_OFF,
    // 608
    engineLiqCursorOff: V_ADL_ENGINE_LIQ_CURSOR_OFF,
    // 640
    engineGcCursorOff: V_ADL_ENGINE_GC_CURSOR_OFF,
    // 642
    engineLastSweepStartOff: V_ADL_ENGINE_LAST_SWEEP_START_OFF,
    // 648
    engineLastSweepCompleteOff: V_ADL_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    // 656
    engineCrankCursorOff: V_ADL_ENGINE_CRANK_CURSOR_OFF,
    // 664
    engineSweepStartIdxOff: V_ADL_ENGINE_SWEEP_START_IDX_OFF,
    // 666
    engineLifetimeLiquidationsOff: V_ADL_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    // 672
    engineLifetimeForceClosesOff: V_ADL_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    // 680
    engineNetLpPosOff: V_ADL_ENGINE_NET_LP_POS_OFF,
    // 904
    engineLpSumAbsOff: V_ADL_ENGINE_LP_SUM_ABS_OFF,
    // 920
    engineLpMaxAbsOff: V_ADL_ENGINE_LP_MAX_ABS_OFF,
    // 936
    engineLpMaxAbsSweepOff: V_ADL_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    // 952
    engineEmergencyOiModeOff: V_ADL_ENGINE_EMERGENCY_OI_MODE_OFF,
    // 968
    engineEmergencyStartSlotOff: V_ADL_ENGINE_EMERGENCY_START_SLOT_OFF,
    // 976
    engineLastBreakerSlotOff: V_ADL_ENGINE_LAST_BREAKER_SLOT_OFF,
    // 984
    engineBitmapOff: V1M2_ENGINE_BITMAP_OFF,
    postBitmap: 18,
    acctOwnerOff: V_ADL_ACCT_OWNER_OFF,
    // 192 — same shift as V_ADL (reserved_pnl u64→u128)
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    engineInsuranceIsolationBpsOff: 64
  };
}
function buildLayoutVADL(maxAccounts) {
  const engineOff = V_ADL_ENGINE_OFF;
  const bitmapOff = V_ADL_ENGINE_BITMAP_OFF;
  const accountSize = V_ADL_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V1_HEADER_LEN,
    // 104 (unchanged)
    configOffset: V1_HEADER_LEN,
    configLen: V_ADL_CONFIG_LEN,
    // 520
    reservedOff: V1_RESERVED_OFF,
    // 80
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V_ADL_ENGINE_PARAMS_OFF,
    // 96 (vault=16 + InsuranceFund=80)
    paramsSize: V_ADL_PARAMS_SIZE,
    // 336
    engineCurrentSlotOff: V_ADL_ENGINE_CURRENT_SLOT_OFF,
    // 432
    engineFundingIndexOff: V_ADL_ENGINE_FUNDING_INDEX_OFF,
    // 440
    engineLastFundingSlotOff: V_ADL_ENGINE_LAST_FUNDING_SLOT_OFF,
    // 456
    engineFundingRateBpsOff: V_ADL_ENGINE_FUNDING_RATE_BPS_OFF,
    // 464
    engineMarkPriceOff: V_ADL_ENGINE_MARK_PRICE_OFF,
    // 504
    engineLastCrankSlotOff: V_ADL_ENGINE_LAST_CRANK_SLOT_OFF,
    // 528
    engineMaxCrankStalenessOff: V_ADL_ENGINE_MAX_CRANK_STALENESS_OFF,
    // 536
    engineTotalOiOff: V_ADL_ENGINE_TOTAL_OI_OFF,
    // 544
    engineLongOiOff: V_ADL_ENGINE_LONG_OI_OFF,
    // 560
    engineShortOiOff: V_ADL_ENGINE_SHORT_OI_OFF,
    // 576
    engineCTotOff: V_ADL_ENGINE_C_TOT_OFF,
    // 592
    enginePnlPosTotOff: V_ADL_ENGINE_PNL_POS_TOT_OFF,
    // 608
    engineLiqCursorOff: V_ADL_ENGINE_LIQ_CURSOR_OFF,
    // 640
    engineGcCursorOff: V_ADL_ENGINE_GC_CURSOR_OFF,
    // 642
    engineLastSweepStartOff: V_ADL_ENGINE_LAST_SWEEP_START_OFF,
    // 648
    engineLastSweepCompleteOff: V_ADL_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    // 656
    engineCrankCursorOff: V_ADL_ENGINE_CRANK_CURSOR_OFF,
    // 664
    engineSweepStartIdxOff: V_ADL_ENGINE_SWEEP_START_IDX_OFF,
    // 666
    engineLifetimeLiquidationsOff: V_ADL_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    // 672
    engineLifetimeForceClosesOff: V_ADL_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    // 680
    engineNetLpPosOff: V_ADL_ENGINE_NET_LP_POS_OFF,
    // 904
    engineLpSumAbsOff: V_ADL_ENGINE_LP_SUM_ABS_OFF,
    // 920
    engineLpMaxAbsOff: V_ADL_ENGINE_LP_MAX_ABS_OFF,
    // 936
    engineLpMaxAbsSweepOff: V_ADL_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    // 952
    engineEmergencyOiModeOff: V_ADL_ENGINE_EMERGENCY_OI_MODE_OFF,
    // 968
    engineEmergencyStartSlotOff: V_ADL_ENGINE_EMERGENCY_START_SLOT_OFF,
    // 976
    engineLastBreakerSlotOff: V_ADL_ENGINE_LAST_BREAKER_SLOT_OFF,
    // 984
    engineBitmapOff: V_ADL_ENGINE_BITMAP_OFF,
    // 1008
    postBitmap: 18,
    acctOwnerOff: V_ADL_ACCT_OWNER_OFF,
    // 192
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    engineInsuranceIsolationBpsOff: 64
  };
}
var SLAB_TIERS_V_SETDEXPOOL = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const size = computeSlabSize(V_SETDEXPOOL_ENGINE_OFF, V_ADL_ENGINE_BITMAP_OFF, V_ADL_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V_SETDEXPOOL[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (V_SETDEXPOOL PERC-SetDexPool)` };
}
Object.freeze(SLAB_TIERS_V_SETDEXPOOL);
var SLAB_TIERS_V12_1 = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const size = computeSlabSize(V12_1_ENGINE_OFF, V12_1_ENGINE_BITMAP_OFF, V12_1_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V12_1[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (v12.1)` };
}
Object.freeze(SLAB_TIERS_V12_1);
var SLAB_TIERS_V12_15 = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Medium2048", 2048], ["Large", 4096]]) {
  const size = computeSlabSize(V12_15_ENGINE_OFF, V12_15_ENGINE_BITMAP_OFF, V12_15_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V12_15[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (v12.15)` };
}
Object.freeze(SLAB_TIERS_V12_15);
var SLAB_TIERS_V12_17 = {};
for (const [label, n] of [["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const bitmapBytes = Math.ceil(n / 64) * 8;
  const preAcc = V12_17_ENGINE_BITMAP_OFF_SBF + bitmapBytes + 4 + n * 2;
  const accountsOff = Math.ceil(preAcc / 8) * 8;
  const size = V12_17_ENGINE_OFF_SBF + accountsOff + n * V12_17_ACCOUNT_SIZE_SBF + V12_17_RISK_BUF_LEN + n * V12_17_GEN_TABLE_ENTRY;
  SLAB_TIERS_V12_17[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (v12.17)` };
}
Object.freeze(SLAB_TIERS_V12_17);
var SLAB_TIERS_V12_19 = Object.freeze({
  micro: { maxAccounts: 64, dataSize: 26872, label: "Micro", description: "64 slots (v12.19, --features micro)" },
  small: { maxAccounts: 256, dataSize: 96784, label: "Small", description: "256 slots (v12.19, --features small) \u2014 deployed mainnet ESa89R5..." },
  medium: { maxAccounts: 1024, dataSize: 376432, label: "Medium", description: "1024 slots (v12.19, --features medium)" },
  large: { maxAccounts: 4096, dataSize: 1495024, label: "Large", description: "4096 slots (v12.19, default features)" }
});
function buildLayoutVSetDexPool(maxAccounts) {
  const engineOff = V_SETDEXPOOL_ENGINE_OFF;
  const bitmapOff = V_ADL_ENGINE_BITMAP_OFF;
  const accountSize = V_ADL_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V1_HEADER_LEN,
    configOffset: V1_HEADER_LEN,
    configLen: V_SETDEXPOOL_CONFIG_LEN,
    // 544
    reservedOff: V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V_ADL_ENGINE_PARAMS_OFF,
    paramsSize: V_ADL_PARAMS_SIZE,
    engineCurrentSlotOff: V_ADL_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: V_ADL_ENGINE_FUNDING_INDEX_OFF,
    engineLastFundingSlotOff: V_ADL_ENGINE_LAST_FUNDING_SLOT_OFF,
    engineFundingRateBpsOff: V_ADL_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: V_ADL_ENGINE_MARK_PRICE_OFF,
    engineLastCrankSlotOff: V_ADL_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: V_ADL_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: V_ADL_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: V_ADL_ENGINE_LONG_OI_OFF,
    engineShortOiOff: V_ADL_ENGINE_SHORT_OI_OFF,
    engineCTotOff: V_ADL_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: V_ADL_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: V_ADL_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: V_ADL_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: V_ADL_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: V_ADL_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: V_ADL_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: V_ADL_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: V_ADL_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: V_ADL_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    engineNetLpPosOff: V_ADL_ENGINE_NET_LP_POS_OFF,
    engineLpSumAbsOff: V_ADL_ENGINE_LP_SUM_ABS_OFF,
    engineLpMaxAbsOff: V_ADL_ENGINE_LP_MAX_ABS_OFF,
    engineLpMaxAbsSweepOff: V_ADL_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    engineEmergencyOiModeOff: V_ADL_ENGINE_EMERGENCY_OI_MODE_OFF,
    engineEmergencyStartSlotOff: V_ADL_ENGINE_EMERGENCY_START_SLOT_OFF,
    engineLastBreakerSlotOff: V_ADL_ENGINE_LAST_BREAKER_SLOT_OFF,
    engineBitmapOff: V_ADL_ENGINE_BITMAP_OFF,
    postBitmap: 18,
    acctOwnerOff: V_ADL_ACCT_OWNER_OFF,
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    engineInsuranceIsolationBpsOff: 64
  };
}
function buildLayoutV12_1(maxAccounts, dataLen) {
  const hostSize = computeSlabSize(V12_1_ENGINE_OFF, V12_1_ENGINE_BITMAP_OFF, V12_1_ACCOUNT_SIZE, maxAccounts, 18);
  const isSbf = dataLen !== void 0 && dataLen !== hostSize;
  const engineOff = isSbf ? V12_1_SBF_ENGINE_OFF : V12_1_ENGINE_OFF;
  const bitmapOff = isSbf ? V12_1_SBF_BITMAP_OFF : V12_1_ENGINE_BITMAP_OFF;
  const accountSize = isSbf ? V12_1_ACCOUNT_SIZE_SBF : V12_1_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V0_HEADER_LEN,
    // 72
    configOffset: V0_HEADER_LEN,
    // 72
    configLen: isSbf ? 544 : 576,
    reservedOff: V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: isSbf ? V12_1_ENGINE_PARAMS_OFF_SBF : V12_1_ENGINE_PARAMS_OFF_HOST,
    paramsSize: isSbf ? V12_1_PARAMS_SIZE_SBF : V12_1_PARAMS_SIZE,
    // SBF engine offsets — all verified by cargo build-sbf offset_of! assertions.
    // Fields that don't exist in the deployed program are set to -1 on SBF.
    engineCurrentSlotOff: isSbf ? V12_1_SBF_OFF_CURRENT_SLOT : V12_1_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: isSbf ? -1 : V12_1_ENGINE_FUNDING_INDEX_OFF,
    // not in deployed struct
    engineLastFundingSlotOff: isSbf ? -1 : V12_1_ENGINE_LAST_FUNDING_SLOT_OFF,
    // not in deployed struct
    engineFundingRateBpsOff: isSbf ? V12_1_SBF_OFF_FUNDING_RATE : V12_1_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: isSbf ? V12_1_SBF_OFF_MARK_PRICE_E6 : V12_1_ENGINE_MARK_PRICE_OFF,
    engineLastCrankSlotOff: isSbf ? V12_1_SBF_OFF_LAST_CRANK_SLOT : V12_1_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: isSbf ? V12_1_SBF_OFF_MAX_CRANK_STALENESS : V12_1_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: isSbf ? V12_1_SBF_OFF_TOTAL_OI : V12_1_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: isSbf ? V12_1_SBF_OFF_LONG_OI : V12_1_ENGINE_LONG_OI_OFF,
    engineShortOiOff: isSbf ? V12_1_SBF_OFF_SHORT_OI : V12_1_ENGINE_SHORT_OI_OFF,
    engineCTotOff: isSbf ? V12_1_SBF_OFF_C_TOT : V12_1_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: isSbf ? V12_1_SBF_OFF_PNL_POS_TOT : V12_1_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: isSbf ? V12_1_SBF_OFF_LIQ_CURSOR : V12_1_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: isSbf ? V12_1_SBF_OFF_GC_CURSOR : V12_1_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: isSbf ? V12_1_SBF_OFF_LAST_SWEEP_START : V12_1_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: isSbf ? V12_1_SBF_OFF_LAST_SWEEP_COMPLETE : V12_1_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: isSbf ? V12_1_SBF_OFF_CRANK_CURSOR : V12_1_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: isSbf ? V12_1_SBF_OFF_SWEEP_START_IDX : V12_1_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: isSbf ? V12_1_SBF_OFF_LIFETIME_LIQUIDATIONS : V12_1_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: isSbf ? -1 : V12_1_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    // not in deployed struct
    engineNetLpPosOff: isSbf ? -1 : V12_1_ENGINE_NET_LP_POS_OFF,
    // not in deployed struct
    engineLpSumAbsOff: isSbf ? -1 : V12_1_ENGINE_LP_SUM_ABS_OFF,
    // not in deployed struct
    engineLpMaxAbsOff: isSbf ? -1 : V12_1_ENGINE_LP_MAX_ABS_OFF,
    // not in deployed struct
    engineLpMaxAbsSweepOff: isSbf ? -1 : V12_1_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    // not in deployed struct
    engineEmergencyOiModeOff: isSbf ? -1 : V12_1_ENGINE_EMERGENCY_OI_MODE_OFF,
    // not in deployed struct
    engineEmergencyStartSlotOff: isSbf ? -1 : V12_1_ENGINE_EMERGENCY_START_SLOT_OFF,
    // not in deployed struct
    engineLastBreakerSlotOff: isSbf ? -1 : V12_1_ENGINE_LAST_BREAKER_SLOT_OFF,
    // not in deployed struct
    engineBitmapOff: bitmapOff,
    postBitmap: 18,
    acctOwnerOff: V12_1_ACCT_OWNER_OFF,
    // InsuranceFund on deployed program is just {balance: U128} = 16 bytes.
    // No isolated_balance or insurance_isolation_bps fields.
    hasInsuranceIsolation: !isSbf,
    engineInsuranceIsolatedOff: isSbf ? -1 : 48,
    engineInsuranceIsolationBpsOff: isSbf ? -1 : 64
  };
}
function buildLayoutV12_1EP(maxAccounts) {
  const engineOff = V12_1_SBF_ENGINE_OFF;
  const bitmapOff = V12_1_SBF_BITMAP_OFF;
  const accountSize = V12_1_EP_SBF_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: 72,
    configOffset: 72,
    configLen: 544,
    reservedOff: 80,
    // V1_RESERVED_OFF
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: 32,
    // V12_1_ENGINE_PARAMS_OFF_SBF
    paramsSize: 184,
    // V12_1_PARAMS_SIZE_SBF
    // Engine offsets identical to V12_1 SBF
    engineCurrentSlotOff: V12_1_SBF_OFF_CURRENT_SLOT,
    engineFundingIndexOff: -1,
    engineLastFundingSlotOff: -1,
    engineFundingRateBpsOff: V12_1_SBF_OFF_FUNDING_RATE,
    engineMarkPriceOff: V12_1_SBF_OFF_MARK_PRICE_E6,
    engineLastCrankSlotOff: V12_1_SBF_OFF_LAST_CRANK_SLOT,
    engineMaxCrankStalenessOff: V12_1_SBF_OFF_MAX_CRANK_STALENESS,
    engineTotalOiOff: V12_1_SBF_OFF_TOTAL_OI,
    engineLongOiOff: V12_1_SBF_OFF_LONG_OI,
    engineShortOiOff: V12_1_SBF_OFF_SHORT_OI,
    engineCTotOff: V12_1_SBF_OFF_C_TOT,
    enginePnlPosTotOff: V12_1_SBF_OFF_PNL_POS_TOT,
    engineLiqCursorOff: V12_1_SBF_OFF_LIQ_CURSOR,
    engineGcCursorOff: V12_1_SBF_OFF_GC_CURSOR,
    engineLastSweepStartOff: V12_1_SBF_OFF_LAST_SWEEP_START,
    engineLastSweepCompleteOff: V12_1_SBF_OFF_LAST_SWEEP_COMPLETE,
    engineCrankCursorOff: V12_1_SBF_OFF_CRANK_CURSOR,
    engineSweepStartIdxOff: V12_1_SBF_OFF_SWEEP_START_IDX,
    engineLifetimeLiquidationsOff: V12_1_SBF_OFF_LIFETIME_LIQUIDATIONS,
    engineLifetimeForceClosesOff: -1,
    engineNetLpPosOff: -1,
    engineLpSumAbsOff: -1,
    engineLpMaxAbsOff: -1,
    engineLpMaxAbsSweepOff: -1,
    engineEmergencyOiModeOff: -1,
    engineEmergencyStartSlotOff: -1,
    engineLastBreakerSlotOff: -1,
    engineBitmapOff: bitmapOff,
    postBitmap: 18,
    // Account offsets — shifted +8 from V12_1 due to entry_price insertion
    acctOwnerOff: V12_1_EP_ACCT_OWNER_OFF,
    // 216 (was 208)
    hasInsuranceIsolation: false,
    engineInsuranceIsolatedOff: -1,
    engineInsuranceIsolationBpsOff: -1
  };
}
function buildLayoutV12_15(maxAccounts, dataLen) {
  const isSbf = dataLen === 237512;
  const accountSize = isSbf ? V12_15_ACCOUNT_SIZE_SMALL : V12_15_ACCOUNT_SIZE;
  const engineOff = isSbf ? V12_15_ENGINE_OFF_SBF : V12_15_ENGINE_OFF;
  const bitmapOff = V12_15_ENGINE_BITMAP_OFF;
  const effectiveBitmapOff = isSbf ? 648 : bitmapOff;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = effectiveBitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 2,
    headerLen: V0_HEADER_LEN,
    // 72
    configOffset: V0_HEADER_LEN,
    // 72
    configLen: 552,
    // SBF CONFIG_LEN for v12.15
    reservedOff: V1_RESERVED_OFF,
    // 80
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V12_15_ENGINE_PARAMS_OFF,
    // 32
    paramsSize: isSbf ? 184 : V12_15_PARAMS_SIZE,
    // SBF=184 (no trailing pad), native=192
    engineCurrentSlotOff: isSbf ? 216 : V12_15_ENGINE_CURRENT_SLOT_OFF,
    // SBF=216, native=224
    engineFundingIndexOff: -1,
    // not present in v12.15 engine struct
    engineLastFundingSlotOff: -1,
    // not present in v12.15 engine struct
    engineFundingRateBpsOff: isSbf ? 224 : V12_15_ENGINE_FUNDING_RATE_E9_OFF,
    // SBF=224, native=240
    engineMarkPriceOff: -1,
    // not present in v12.15
    engineLastCrankSlotOff: -1,
    // not yet mapped
    engineMaxCrankStalenessOff: -1,
    // not yet mapped
    engineTotalOiOff: -1,
    // not present in v12.15 engine
    engineLongOiOff: -1,
    // not present in v12.15 engine
    engineShortOiOff: -1,
    // not present in v12.15 engine
    engineCTotOff: isSbf ? 320 : V12_15_ENGINE_C_TOT_OFF,
    // SBF=320 (verified on-chain), native=344
    enginePnlPosTotOff: isSbf ? 336 : V12_15_ENGINE_PNL_POS_TOT_OFF,
    // SBF=336 (verified), native=368
    engineLiqCursorOff: -1,
    // not yet mapped
    engineGcCursorOff: -1,
    // not yet mapped
    engineLastSweepStartOff: -1,
    // not yet mapped
    engineLastSweepCompleteOff: -1,
    // not yet mapped
    engineCrankCursorOff: -1,
    // not yet mapped
    engineSweepStartIdxOff: -1,
    // not yet mapped
    engineLifetimeLiquidationsOff: -1,
    // not yet mapped
    engineLifetimeForceClosesOff: -1,
    // not present in v12.15
    engineNetLpPosOff: -1,
    // not present in v12.15
    engineLpSumAbsOff: -1,
    // not present in v12.15
    engineLpMaxAbsOff: -1,
    // not present in v12.15
    engineLpMaxAbsSweepOff: -1,
    // not present in v12.15
    engineEmergencyOiModeOff: -1,
    // not present in v12.15
    engineEmergencyStartSlotOff: -1,
    // not present in v12.15
    engineLastBreakerSlotOff: -1,
    // not present in v12.15
    engineBitmapOff: effectiveBitmapOff,
    // SBF=640, native=862
    postBitmap,
    acctOwnerOff: V12_15_ACCT_OWNER_OFF,
    // 192
    hasInsuranceIsolation: false,
    engineInsuranceIsolatedOff: -1,
    engineInsuranceIsolationBpsOff: -1
  };
}
function buildLayoutV12_17(maxAccounts, dataLen) {
  const isSbf = (() => {
    const bitmapBytes2 = Math.ceil(maxAccounts / 64) * 8;
    const preAccNative = V12_17_ENGINE_BITMAP_OFF + bitmapBytes2 + 4 + maxAccounts * 2;
    const accountsOffNative = Math.ceil(preAccNative / 16) * 16;
    const nativeSize = V12_17_ENGINE_OFF + accountsOffNative + maxAccounts * V12_17_ACCOUNT_SIZE + V12_17_RISK_BUF_LEN + maxAccounts * V12_17_GEN_TABLE_ENTRY;
    return dataLen !== nativeSize;
  })();
  const engineOff = isSbf ? V12_17_ENGINE_OFF_SBF : V12_17_ENGINE_OFF;
  const accountSize = isSbf ? V12_17_ACCOUNT_SIZE_SBF : V12_17_ACCOUNT_SIZE;
  const bitmapOff = isSbf ? V12_17_ENGINE_BITMAP_OFF_SBF : V12_17_ENGINE_BITMAP_OFF;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 4;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const acctAlign = isSbf ? 8 : 16;
  const accountsOffRel = Math.ceil(preAccountsLen / acctAlign) * acctAlign;
  return {
    version: 2,
    headerLen: V0_HEADER_LEN,
    // 72
    configOffset: V0_HEADER_LEN,
    // 72
    // configLen = 512 (SBF-aligned MarketConfig size after Phase A/B/E).
    // Verified field-by-field against percolator-prog/src/percolator.rs MarketConfig struct.
    // Missing 80 bytes from prior value 432: max_pnl_cap, last_audit_pause_slot,
    // oi_cap_multiplier_bps, dispute_window_slots, dispute_bond_amount,
    // lp_collateral_enabled, lp_collateral_ltv_bps, _new_fields_pad, pending_admin.
    configLen: 512,
    reservedOff: V1_RESERVED_OFF,
    // 80
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V12_17_ENGINE_PARAMS_OFF,
    // 32
    paramsSize: isSbf ? 184 : 192,
    engineCurrentSlotOff: isSbf ? V12_17_SBF_ENGINE_CURRENT_SLOT_OFF : V12_17_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: -1,
    // replaced by per-side f_long_num/f_short_num
    engineLastFundingSlotOff: -1,
    engineFundingRateBpsOff: -1,
    // no stored funding rate in v12.17
    engineMarkPriceOff: -1,
    // v12.17 computes mark from state; no stored field
    engineLastCrankSlotOff: isSbf ? V12_17_SBF_ENGINE_LAST_CRANK_SLOT_OFF : V12_17_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: -1,
    engineTotalOiOff: -1,
    // parseEngine sums long + short when total offset is -1
    engineLongOiOff: isSbf ? V12_17_SBF_ENGINE_OI_EFF_LONG_OFF : V12_17_ENGINE_OI_EFF_LONG_OFF,
    engineShortOiOff: isSbf ? V12_17_SBF_ENGINE_OI_EFF_SHORT_OFF : V12_17_ENGINE_OI_EFF_SHORT_OFF,
    engineCTotOff: isSbf ? V12_17_SBF_ENGINE_C_TOT_OFF : V12_17_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: isSbf ? V12_17_SBF_ENGINE_PNL_POS_TOT_OFF : V12_17_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: -1,
    // removed in v12.17
    engineGcCursorOff: isSbf ? V12_17_SBF_ENGINE_GC_CURSOR_OFF : V12_17_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: -1,
    engineLastSweepCompleteOff: -1,
    engineCrankCursorOff: -1,
    engineSweepStartIdxOff: -1,
    engineLifetimeLiquidationsOff: -1,
    engineLifetimeForceClosesOff: -1,
    engineNetLpPosOff: -1,
    engineLpSumAbsOff: -1,
    engineLpMaxAbsOff: -1,
    engineLpMaxAbsSweepOff: -1,
    engineEmergencyOiModeOff: -1,
    engineEmergencyStartSlotOff: -1,
    engineLastBreakerSlotOff: -1,
    engineBitmapOff: bitmapOff,
    postBitmap,
    acctOwnerOff: isSbf ? 192 : V12_17_ACCT_OWNER_OFF,
    // SBF=192, native=200
    hasInsuranceIsolation: false,
    engineInsuranceIsolatedOff: -1,
    engineInsuranceIsolationBpsOff: -1,
    // v12.17 dropped the engine.mark_price field (see engineMarkPriceOff above).
    // The EWMA-smoothed mark that the matcher actually quotes against lives in
    // MarketConfig.mark_ewma_e6 at offset 304 within the config struct.
    // Layout is identical on SBF and native. configOffset is V0_HEADER_LEN = 72,
    // so absolute offset in the slab is 72 + 304 = 376.
    configMarkEwmaOff: V0_HEADER_LEN + 304
  };
}
function validateLayout(layout, dataLen) {
  if (layout.accountsOff > dataLen) {
    throw new Error(
      `validateLayout: accountsOff (${layout.accountsOff}) exceeds data length (${dataLen}) for engineOff=${layout.engineOff} accountSize=${layout.accountSize} maxAccounts=${layout.maxAccounts}`
    );
  }
  const bitmapEnd = layout.engineOff + layout.engineBitmapOff + layout.bitmapWords * 8;
  if (bitmapEnd > dataLen) {
    throw new Error(
      `validateLayout: bitmap region end (${bitmapEnd}) exceeds data length (${dataLen})`
    );
  }
  return layout;
}
function detectSlabLayout(dataLen, data) {
  const v1219n = V12_19_SIZES.get(dataLen);
  if (v1219n !== void 0) return validateLayout(buildLayoutV12_19(v1219n, dataLen), dataLen);
  const v1217n = V12_17_SIZES.get(dataLen);
  if (v1217n !== void 0) return validateLayout(buildLayoutV12_17(v1217n, dataLen), dataLen);
  const v1215n = V12_15_SIZES.get(dataLen);
  if (v1215n !== void 0) return validateLayout(buildLayoutV12_15(v1215n, dataLen), dataLen);
  const v121epn = V12_1_EP_SIZES.get(dataLen);
  if (v121epn !== void 0) return buildLayoutV12_1EP(v121epn);
  const v121n = V12_1_SIZES.get(dataLen);
  if (v121n !== void 0) return buildLayoutV12_1(v121n, dataLen);
  const vsdpn = V_SETDEXPOOL_SIZES.get(dataLen);
  if (vsdpn !== void 0) return buildLayoutVSetDexPool(vsdpn);
  const v1m2n = V1M2_SIZES.get(dataLen);
  if (v1m2n !== void 0) return buildLayoutV1M2(v1m2n);
  const vadln = V_ADL_SIZES.get(dataLen);
  if (vadln !== void 0) return buildLayoutVADL(vadln);
  const v1mn = V1M_SIZES.get(dataLen);
  if (v1mn !== void 0) return buildLayoutV1M(v1mn);
  const v0n = V0_SIZES.get(dataLen);
  if (v0n !== void 0) return buildLayout(0, v0n);
  const v1dn = V1D_SIZES.get(dataLen);
  if (v1dn !== void 0) {
    if (data && data.length >= 12) {
      const version = readU32LE(data, 8);
      if (version === 2) return buildLayoutV2(v1dn);
    }
    return buildLayoutV1D(v1dn, 2);
  }
  const v1dln = V1D_SIZES_LEGACY.get(dataLen);
  if (v1dln !== void 0) return buildLayoutV1D(v1dln, 18);
  const v1n = V1_SIZES.get(dataLen);
  if (v1n !== void 0) return buildLayout(1, v1n);
  const v1ln = V1_SIZES_LEGACY.get(dataLen);
  if (v1ln !== void 0) return buildLayout(1, v1ln, V1_ENGINE_OFF_LEGACY);
  return null;
}
function detectLayout(dataLen) {
  const layout = detectSlabLayout(dataLen);
  if (!layout) return null;
  return { bitmapWords: layout.bitmapWords, accountsOff: layout.accountsOff, maxAccounts: layout.maxAccounts };
}
var PARAMS_WARMUP_PERIOD_OFF = 0;
var PARAMS_MAINTENANCE_MARGIN_OFF = 8;
var PARAMS_INITIAL_MARGIN_OFF = 16;
var PARAMS_TRADING_FEE_OFF = 24;
var PARAMS_MAX_ACCOUNTS_OFF = 32;
var PARAMS_NEW_ACCOUNT_FEE_OFF = 40;
var PARAMS_RISK_THRESHOLD_OFF = 56;
var PARAMS_MAINTENANCE_FEE_OFF = 72;
var PARAMS_MAX_CRANK_STALENESS_OFF = 88;
var PARAMS_LIQUIDATION_FEE_BPS_OFF = 96;
var PARAMS_LIQUIDATION_FEE_CAP_OFF = 104;
var PARAMS_LIQUIDATION_BUFFER_OFF = 120;
var PARAMS_MIN_LIQUIDATION_OFF = 128;
var V12_1_PARAMS_MAINT_FEE_OFF = 56;
var V12_1_PARAMS_MAX_CRANK_OFF = 72;
var V12_1_PARAMS_LIQ_FEE_BPS_OFF = 80;
var V12_1_PARAMS_LIQ_FEE_CAP_OFF = 88;
var V12_1_PARAMS_MIN_LIQ_OFF = 104;
var V12_1_PARAMS_MIN_INITIAL_DEP_OFF = 120;
var V12_1_PARAMS_MIN_NZ_MM_OFF = 136;
var V12_1_PARAMS_MIN_NZ_IM_OFF = 152;
var V12_1_PARAMS_INS_FLOOR_OFF = 168;
var V12_19_PARAMS_MAINTENANCE_MARGIN_OFF = 0;
var V12_19_PARAMS_INITIAL_MARGIN_OFF = 8;
var V12_19_PARAMS_TRADING_FEE_OFF = 16;
var V12_19_PARAMS_MAX_ACCOUNTS_OFF = 24;
var V12_19_PARAMS_LIQ_FEE_BPS_OFF = 32;
var V12_19_PARAMS_LIQ_FEE_CAP_OFF = 40;
var V12_19_PARAMS_MIN_LIQ_OFF = 56;
var V12_19_PARAMS_MIN_NZ_MM_OFF = 72;
var V12_19_PARAMS_MIN_NZ_IM_OFF = 88;
var V12_19_PARAMS_H_MIN_OFF = 104;
var V12_19_PARAMS_H_MAX_OFF = 112;
var V12_19_PARAMS_RESOLVE_PRICE_DEVIATION_OFF = 120;
var V12_19_PARAMS_MAX_ACCRUAL_DT_OFF = 128;
var ACCT_ACCOUNT_ID_OFF = 0;
var ACCT_CAPITAL_OFF = 8;
var ACCT_KIND_OFF = 24;
var ACCT_PNL_OFF = 32;
var ACCT_RESERVED_PNL_OFF = 48;
var ACCT_WARMUP_STARTED_OFF = 56;
var ACCT_WARMUP_SLOPE_OFF = 64;
var ACCT_POSITION_SIZE_OFF = 80;
var ACCT_ENTRY_PRICE_OFF = 96;
var ACCT_FUNDING_INDEX_OFF = 104;
var ACCT_MATCHER_PROGRAM_OFF = 120;
var ACCT_MATCHER_CONTEXT_OFF = 152;
var ACCT_OWNER_OFF = 184;
var ACCT_FEE_CREDITS_OFF = 216;
var ACCT_LAST_FEE_SLOT_OFF = 232;
var AccountKind = /* @__PURE__ */ ((AccountKind2) => {
  AccountKind2[AccountKind2["User"] = 0] = "User";
  AccountKind2[AccountKind2["LP"] = 1] = "LP";
  return AccountKind2;
})(AccountKind || {});
async function fetchSlab(connection, slabPubkey, expectedOwner) {
  const info = await connection.getAccountInfo(slabPubkey);
  if (!info) {
    throw new Error(`Slab account not found: ${slabPubkey.toBase58()}`);
  }
  if (expectedOwner && !info.owner.equals(expectedOwner)) {
    throw new Error(
      `fetchSlab: account ${slabPubkey.toBase58()} is owned by ${info.owner.toBase58()} but expected ${expectedOwner.toBase58()}`
    );
  }
  return new Uint8Array(info.data);
}
var RAMP_START_BPS = 1000n;
var DEFAULT_OI_RAMP_SLOTS = 432000n;
function computeEffectiveOiCapBps(config, currentSlot) {
  const target = config.oiCapMultiplierBps;
  if (target === 0n) return 0n;
  if (config.oiRampSlots === 0n) return target;
  if (target <= RAMP_START_BPS) return target;
  const elapsed = currentSlot > config.marketCreatedSlot ? currentSlot - config.marketCreatedSlot : 0n;
  if (elapsed >= config.oiRampSlots) return target;
  const range = target - RAMP_START_BPS;
  const rampAdd = range * elapsed / config.oiRampSlots;
  const result = RAMP_START_BPS + rampAdd;
  return result < target ? result : target;
}
function readNonce(data) {
  const layout = detectSlabLayout(data.length, data);
  if (!layout) {
    throw new Error(`readNonce: unrecognized slab data length ${data.length}`);
  }
  const roff = layout.reservedOff;
  if (data.length < roff + 8) throw new Error("Slab data too short for nonce");
  return readU64LE(data, roff);
}
function readLastThrUpdateSlot(data) {
  const layout = detectSlabLayout(data.length, data);
  if (!layout) {
    throw new Error(`readLastThrUpdateSlot: unrecognized slab data length ${data.length}`);
  }
  const roff = layout.reservedOff;
  if (data.length < roff + 16) throw new Error("Slab data too short for lastThrUpdateSlot");
  return readU64LE(data, roff + 8);
}
function parseHeader(data) {
  if (data.length < V0_HEADER_LEN) {
    throw new Error(`Slab data too short for header: ${data.length} < ${V0_HEADER_LEN}`);
  }
  const magic = readU64LE(data, 0);
  if (magic !== MAGIC) {
    throw new Error(`Invalid slab magic: expected ${MAGIC.toString(16)}, got ${magic.toString(16)}`);
  }
  const version = readU32LE(data, 8);
  const bump = readU8(data, 12);
  const flags = readU8(data, 13);
  const admin = new PublicKey5(data.subarray(16, 48));
  const layout = detectSlabLayout(data.length, data);
  const roff = layout ? layout.reservedOff : V0_RESERVED_OFF;
  const nonce = readU64LE(data, roff);
  const lastThrUpdateSlot = readU64LE(data, roff + 8);
  return {
    magic,
    version,
    bump,
    flags,
    resolved: (flags & FLAG_RESOLVED) !== 0,
    paused: (flags & 2) !== 0,
    admin,
    nonce,
    lastThrUpdateSlot
  };
}
function parseConfigV12_17(data, configOff) {
  const MIN_V12_17_BYTES = 512;
  if (data.length < configOff + MIN_V12_17_BYTES) {
    throw new Error(`Slab data too short for V12_17 config: ${data.length} < ${configOff + MIN_V12_17_BYTES}`);
  }
  const b = configOff;
  const collateralMint = new PublicKey5(data.subarray(b + 0, b + 32));
  const vaultPubkey = new PublicKey5(data.subarray(b + 32, b + 64));
  const indexFeedId = new PublicKey5(data.subarray(b + 64, b + 96));
  const maxStalenessSlots = readU64LE(data, b + 96);
  const confFilterBps = readU16LE(data, b + 104);
  const vaultAuthorityBump = readU8(data, b + 106);
  const invert = readU8(data, b + 107);
  const unitScale = readU32LE(data, b + 108);
  const fundingHorizonSlots = readU64LE(data, b + 112);
  const fundingKBps = readU64LE(data, b + 120);
  const fundingMaxPremiumBps = readI64LE(data, b + 128);
  const fundingMaxBpsPerSlot = readI64LE(data, b + 136);
  const oracleAuthority = new PublicKey5(data.subarray(b + 144, b + 176));
  const authorityPriceE6 = readU64LE(data, b + 176);
  const authorityTimestamp = readI64LE(data, b + 184);
  const oraclePriceCapE2bps = readU64LE(data, b + 192);
  const lastEffectivePriceE6 = readU64LE(data, b + 200);
  const dexPoolBytes = data.subarray(b + 400, b + 432);
  const dexPool = dexPoolBytes.some((x) => x !== 0) ? new PublicKey5(dexPoolBytes) : null;
  return {
    collateralMint,
    vaultPubkey,
    indexFeedId,
    maxStalenessSlots,
    confFilterBps,
    vaultAuthorityBump,
    invert,
    unitScale,
    fundingHorizonSlots,
    fundingKBps,
    fundingInvScaleNotionalE6: 0n,
    // removed in v12.17
    fundingMaxPremiumBps,
    fundingMaxBpsPerSlot,
    threshFloor: 0n,
    // removed in v12.17
    threshRiskBps: 0n,
    threshUpdateIntervalSlots: 0n,
    threshStepBps: 0n,
    threshAlphaBps: 0n,
    threshMin: 0n,
    threshMax: 0n,
    threshMinStep: 0n,
    oracleAuthority,
    authorityPriceE6,
    authorityTimestamp,
    oraclePriceCapE2bps,
    lastEffectivePriceE6,
    oiCapMultiplierBps: readU64LE(data, b + 448),
    maxPnlCap: readU64LE(data, b + 432),
    adaptiveFundingEnabled: false,
    // removed in v12.17
    adaptiveScaleBps: 0,
    adaptiveMaxFundingBps: 0n,
    marketCreatedSlot: 0n,
    oiRampSlots: 0n,
    resolvedSlot: 0n,
    insuranceIsolationBps: 0,
    oraclePhase: 0,
    cumulativeVolumeE6: 0n,
    phase2DeltaSlots: 0,
    dexPool
  };
}
function parseConfigV12_19(data, configOff) {
  const MIN_V12_19_BYTES = 480;
  if (data.length < configOff + MIN_V12_19_BYTES) {
    throw new Error(`Slab data too short for V12_19 config: ${data.length} < ${configOff + MIN_V12_19_BYTES}`);
  }
  const b = configOff;
  const collateralMint = new PublicKey5(data.subarray(b + 0, b + 32));
  const vaultPubkey = new PublicKey5(data.subarray(b + 32, b + 64));
  const indexFeedId = new PublicKey5(data.subarray(b + 64, b + 96));
  const maxStalenessSlots = readU64LE(data, b + 96);
  const confFilterBps = readU16LE(data, b + 104);
  const vaultAuthorityBump = readU8(data, b + 106);
  const invert = readU8(data, b + 107);
  const unitScale = readU32LE(data, b + 108);
  const fundingHorizonSlots = readU64LE(data, b + 112);
  const fundingKBps = readU64LE(data, b + 120);
  const fundingMaxPremiumBps = readI64LE(data, b + 128);
  const fundingMaxBpsPerSlot = readI64LE(data, b + 136);
  const oracleAuthority = new PublicKey5(data.subarray(b + 144, b + 176));
  const authorityPriceE6 = readU64LE(data, b + 176);
  const authorityTimestamp = readI64LE(data, b + 184);
  const lastEffectivePriceE6 = readU64LE(data, b + 192);
  const oraclePriceCapE2bps = readU64LE(data, b + 216);
  const dexPoolBytes = data.subarray(b + 368, b + 400);
  const dexPool = dexPoolBytes.some((x) => x !== 0) ? new PublicKey5(dexPoolBytes) : null;
  return {
    collateralMint,
    vaultPubkey,
    indexFeedId,
    maxStalenessSlots,
    confFilterBps,
    vaultAuthorityBump,
    invert,
    unitScale,
    fundingHorizonSlots,
    fundingKBps,
    fundingInvScaleNotionalE6: 0n,
    fundingMaxPremiumBps,
    fundingMaxBpsPerSlot,
    threshFloor: 0n,
    threshRiskBps: 0n,
    threshUpdateIntervalSlots: 0n,
    threshStepBps: 0n,
    threshAlphaBps: 0n,
    threshMin: 0n,
    threshMax: 0n,
    threshMinStep: 0n,
    oracleAuthority,
    authorityPriceE6,
    authorityTimestamp,
    oraclePriceCapE2bps,
    lastEffectivePriceE6,
    oiCapMultiplierBps: readU64LE(data, b + 416),
    maxPnlCap: readU64LE(data, b + 400),
    adaptiveFundingEnabled: false,
    adaptiveScaleBps: 0,
    adaptiveMaxFundingBps: 0n,
    marketCreatedSlot: 0n,
    oiRampSlots: 0n,
    resolvedSlot: 0n,
    insuranceIsolationBps: 0,
    oraclePhase: 0,
    cumulativeVolumeE6: 0n,
    phase2DeltaSlots: 0,
    dexPool
  };
}
function parseConfig(data, layoutHint) {
  if (data.length >= 8 && readU64LE(data, 0) !== MAGIC) {
    throw new Error("parseConfig: invalid slab magic");
  }
  const layout = layoutHint !== void 0 ? layoutHint : detectSlabLayout(data.length, data);
  const configOff = layout ? layout.configOffset : V0_HEADER_LEN;
  const configLen = layout ? layout.configLen : V0_CONFIG_LEN;
  const isV12_19 = layout && layout.accountSize === V12_19_ACCOUNT_SIZE_SBF;
  if (isV12_19) {
    return parseConfigV12_19(data, configOff);
  }
  const isV12_17 = layout && (layout.accountSize === V12_17_ACCOUNT_SIZE || layout.accountSize === V12_17_ACCOUNT_SIZE_SBF);
  if (isV12_17) {
    return parseConfigV12_17(data, configOff);
  }
  const MIN_CONFIG_BYTES = 376;
  const minLen = configOff + Math.min(configLen, MIN_CONFIG_BYTES);
  if (data.length < minLen) {
    throw new Error(`Slab data too short for config: ${data.length} < ${minLen}`);
  }
  let off = configOff;
  const collateralMint = new PublicKey5(data.subarray(off, off + 32));
  off += 32;
  const vaultPubkey = new PublicKey5(data.subarray(off, off + 32));
  off += 32;
  const indexFeedId = new PublicKey5(data.subarray(off, off + 32));
  off += 32;
  const maxStalenessSlots = readU64LE(data, off);
  off += 8;
  const confFilterBps = readU16LE(data, off);
  off += 2;
  const vaultAuthorityBump = readU8(data, off);
  off += 1;
  const invert = readU8(data, off);
  off += 1;
  const unitScale = readU32LE(data, off);
  off += 4;
  const fundingHorizonSlots = readU64LE(data, off);
  off += 8;
  const fundingKBps = readU64LE(data, off);
  off += 8;
  const fundingInvScaleNotionalE6 = readU128LE(data, off);
  off += 16;
  const fundingMaxPremiumBps = readI64LE(data, off);
  off += 8;
  const fundingMaxBpsPerSlot = readI64LE(data, off);
  off += 8;
  const threshFloor = readU128LE(data, off);
  off += 16;
  const threshRiskBps = readU64LE(data, off);
  off += 8;
  const threshUpdateIntervalSlots = readU64LE(data, off);
  off += 8;
  const threshStepBps = readU64LE(data, off);
  off += 8;
  const threshAlphaBps = readU64LE(data, off);
  off += 8;
  const threshMin = readU128LE(data, off);
  off += 16;
  const threshMax = readU128LE(data, off);
  off += 16;
  const threshMinStep = readU128LE(data, off);
  off += 16;
  const oracleAuthority = new PublicKey5(data.subarray(off, off + 32));
  off += 32;
  const authorityPriceE6 = readU64LE(data, off);
  off += 8;
  const authorityTimestamp = readI64LE(data, off);
  off += 8;
  const oraclePriceCapE2bps = readU64LE(data, off);
  off += 8;
  const lastEffectivePriceE6 = readU64LE(data, off);
  off += 8;
  const oiCapMultiplierBps = readU64LE(data, off);
  off += 8;
  const maxPnlCap = readU64LE(data, off);
  off += 8;
  const remaining = configOff + configLen - off;
  let adaptiveFundingEnabled = false;
  let adaptiveScaleBps = 0;
  let adaptiveMaxFundingBps = 0n;
  let marketCreatedSlot = 0n;
  let oiRampSlots = 0n;
  let resolvedSlot = 0n;
  let insuranceIsolationBps = 0;
  let oraclePhase = 0;
  let cumulativeVolumeE6 = 0n;
  let phase2DeltaSlots = 0;
  if (remaining >= 40) {
    marketCreatedSlot = readU64LE(data, off);
    off += 8;
    oiRampSlots = readU64LE(data, off);
    off += 8;
    adaptiveFundingEnabled = readU8(data, off) !== 0;
    off += 1;
    off += 1;
    adaptiveScaleBps = readU16LE(data, off);
    off += 2;
    off += 4;
    adaptiveMaxFundingBps = readU64LE(data, off);
    off += 8;
    if (remaining >= 42) {
      insuranceIsolationBps = readU16LE(data, off);
      if (remaining >= 56) {
        const padOff = off + 2;
        oraclePhase = Math.min(readU8(data, padOff + 2), 2);
        cumulativeVolumeE6 = readU64LE(data, padOff + 3);
        phase2DeltaSlots = data[padOff + 11] | data[padOff + 12] << 8 | data[padOff + 13] << 16;
      }
    }
  }
  let dexPool = null;
  const DEX_POOL_REL_OFF = 512;
  if (configLen >= DEX_POOL_REL_OFF + 32 && data.length >= configOff + DEX_POOL_REL_OFF + 32) {
    const dexPoolBytes = data.subarray(configOff + DEX_POOL_REL_OFF, configOff + DEX_POOL_REL_OFF + 32);
    if (dexPoolBytes.some((b) => b !== 0)) {
      dexPool = new PublicKey5(dexPoolBytes);
    }
  }
  return {
    collateralMint,
    vaultPubkey,
    indexFeedId,
    maxStalenessSlots,
    confFilterBps,
    vaultAuthorityBump,
    invert,
    unitScale,
    fundingHorizonSlots,
    fundingKBps,
    fundingInvScaleNotionalE6,
    fundingMaxPremiumBps,
    fundingMaxBpsPerSlot,
    threshFloor,
    threshRiskBps,
    threshUpdateIntervalSlots,
    threshStepBps,
    threshAlphaBps,
    threshMin,
    threshMax,
    threshMinStep,
    oracleAuthority,
    authorityPriceE6,
    authorityTimestamp,
    oraclePriceCapE2bps,
    lastEffectivePriceE6,
    oiCapMultiplierBps,
    maxPnlCap,
    adaptiveFundingEnabled,
    adaptiveScaleBps,
    adaptiveMaxFundingBps,
    marketCreatedSlot,
    oiRampSlots,
    resolvedSlot,
    insuranceIsolationBps,
    oraclePhase,
    cumulativeVolumeE6,
    phase2DeltaSlots,
    dexPool
  };
}
function parseParams(data, layoutHint) {
  const layout = layoutHint !== void 0 ? layoutHint : detectSlabLayout(data.length, data);
  const engineOff = layout ? layout.engineOff : V0_ENGINE_OFF;
  const paramsOff = layout ? layout.engineParamsOff : V0_ENGINE_PARAMS_OFF;
  const paramsSize = layout ? layout.paramsSize : V0_PARAMS_SIZE;
  const base = engineOff + paramsOff;
  const MIN_PARAMS_BYTES = paramsSize >= 144 ? 144 : 56;
  if (data.length < base + MIN_PARAMS_BYTES) {
    throw new Error(`Slab data too short for RiskParams: ${data.length} < ${base + MIN_PARAMS_BYTES}`);
  }
  const isV12_15Params = paramsSize === V12_15_PARAMS_SIZE || paramsSize === 184;
  const isV12_19Params = layout !== null && layout !== void 0 && layout.engineOff === V12_19_ENGINE_OFF_SBF && paramsSize === V12_19_SBF_ENGINE_PARAMS_SIZE;
  const isV12_1Sbf = !isV12_15Params && layout !== null && layout !== void 0 && layout.engineOff === V12_1_SBF_ENGINE_OFF && paramsSize === 184;
  const result = {
    warmupPeriodSlots: isV12_19Params ? readU64LE(data, base + V12_19_PARAMS_H_MIN_OFF) : isV12_15Params ? readU64LE(data, base + V12_15_PARAMS_H_MIN_OFF) : readU64LE(data, base + PARAMS_WARMUP_PERIOD_OFF),
    maintenanceMarginBps: isV12_19Params ? readU64LE(data, base + V12_19_PARAMS_MAINTENANCE_MARGIN_OFF) : isV12_15Params ? readU64LE(data, base + 0) : readU64LE(data, base + PARAMS_MAINTENANCE_MARGIN_OFF),
    initialMarginBps: isV12_19Params ? readU64LE(data, base + V12_19_PARAMS_INITIAL_MARGIN_OFF) : isV12_15Params ? readU64LE(data, base + 8) : readU64LE(data, base + PARAMS_INITIAL_MARGIN_OFF),
    tradingFeeBps: isV12_19Params ? readU64LE(data, base + V12_19_PARAMS_TRADING_FEE_OFF) : isV12_15Params ? readU64LE(data, base + 16) : readU64LE(data, base + PARAMS_TRADING_FEE_OFF),
    maxAccounts: isV12_19Params ? readU64LE(data, base + V12_19_PARAMS_MAX_ACCOUNTS_OFF) : isV12_15Params ? readU64LE(data, base + V12_15_PARAMS_MAX_ACCOUNTS_OFF) : readU64LE(data, base + PARAMS_MAX_ACCOUNTS_OFF),
    newAccountFee: isV12_19Params ? 1n : isV12_15Params ? readU128LE(data, base + 32) : readU128LE(data, base + PARAMS_NEW_ACCOUNT_FEE_OFF),
    // Extended params: defaults; overwritten below if layout supports them
    riskReductionThreshold: 0n,
    maintenanceFeePerSlot: 0n,
    maxCrankStalenessSlots: 0n,
    liquidationFeeBps: 0n,
    liquidationFeeCap: 0n,
    liquidationBufferBps: 0n,
    minLiquidationAbs: 0n,
    minInitialDeposit: 0n,
    minNonzeroMmReq: 0n,
    minNonzeroImReq: 0n,
    insuranceFloor: 0n,
    hMin: 0n,
    hMax: 0n
  };
  if (isV12_19Params) {
    result.hMin = readU64LE(data, base + V12_19_PARAMS_H_MIN_OFF);
    result.hMax = readU64LE(data, base + V12_19_PARAMS_H_MAX_OFF);
    result.riskReductionThreshold = 0n;
    result.maintenanceFeePerSlot = 0n;
    result.maxCrankStalenessSlots = readU64LE(data, base + V12_19_PARAMS_MAX_ACCRUAL_DT_OFF);
    result.liquidationFeeBps = readU64LE(data, base + V12_19_PARAMS_LIQ_FEE_BPS_OFF);
    result.liquidationFeeCap = readU128LE(data, base + V12_19_PARAMS_LIQ_FEE_CAP_OFF);
    result.liquidationBufferBps = readU64LE(data, base + V12_19_PARAMS_RESOLVE_PRICE_DEVIATION_OFF);
    result.minLiquidationAbs = readU128LE(data, base + V12_19_PARAMS_MIN_LIQ_OFF);
    result.minInitialDeposit = 0n;
    result.minNonzeroMmReq = readU128LE(data, base + V12_19_PARAMS_MIN_NZ_MM_OFF);
    result.minNonzeroImReq = readU128LE(data, base + V12_19_PARAMS_MIN_NZ_IM_OFF);
    result.insuranceFloor = 0n;
  } else if (isV12_15Params) {
    result.hMin = readU64LE(data, base + V12_15_PARAMS_H_MIN_OFF);
    result.hMax = readU64LE(data, base + V12_15_PARAMS_H_MAX_OFF);
    result.insuranceFloor = readU128LE(data, base + V12_15_PARAMS_INSURANCE_FLOOR_OFF);
    result.riskReductionThreshold = 0n;
    result.maintenanceFeePerSlot = 0n;
    result.maxCrankStalenessSlots = readU64LE(data, base + 48);
    result.liquidationFeeBps = readU64LE(data, base + 56);
    result.liquidationFeeCap = readU128LE(data, base + 64);
    result.liquidationBufferBps = 0n;
    result.minLiquidationAbs = readU128LE(data, base + 80);
    result.minInitialDeposit = readU128LE(data, base + 96);
    result.minNonzeroMmReq = readU128LE(data, base + 112);
    result.minNonzeroImReq = readU128LE(data, base + 128);
  } else if (isV12_1Sbf) {
    result.maintenanceFeePerSlot = readU128LE(data, base + V12_1_PARAMS_MAINT_FEE_OFF);
    result.maxCrankStalenessSlots = readU64LE(data, base + V12_1_PARAMS_MAX_CRANK_OFF);
    result.liquidationFeeBps = readU64LE(data, base + V12_1_PARAMS_LIQ_FEE_BPS_OFF);
    result.liquidationFeeCap = readU128LE(data, base + V12_1_PARAMS_LIQ_FEE_CAP_OFF);
    result.minLiquidationAbs = readU128LE(data, base + V12_1_PARAMS_MIN_LIQ_OFF);
    result.minInitialDeposit = readU128LE(data, base + V12_1_PARAMS_MIN_INITIAL_DEP_OFF);
    result.minNonzeroMmReq = readU128LE(data, base + V12_1_PARAMS_MIN_NZ_MM_OFF);
    result.minNonzeroImReq = readU128LE(data, base + V12_1_PARAMS_MIN_NZ_IM_OFF);
    result.insuranceFloor = readU128LE(data, base + V12_1_PARAMS_INS_FLOOR_OFF);
    result.hMin = result.warmupPeriodSlots;
    result.hMax = result.warmupPeriodSlots;
  } else if (paramsSize >= 144) {
    result.riskReductionThreshold = readU128LE(data, base + PARAMS_RISK_THRESHOLD_OFF);
    result.maintenanceFeePerSlot = readU128LE(data, base + PARAMS_MAINTENANCE_FEE_OFF);
    result.maxCrankStalenessSlots = readU64LE(data, base + PARAMS_MAX_CRANK_STALENESS_OFF);
    result.liquidationFeeBps = readU64LE(data, base + PARAMS_LIQUIDATION_FEE_BPS_OFF);
    result.liquidationFeeCap = readU128LE(data, base + PARAMS_LIQUIDATION_FEE_CAP_OFF);
    result.liquidationBufferBps = readU64LE(data, base + PARAMS_LIQUIDATION_BUFFER_OFF);
    result.minLiquidationAbs = readU128LE(data, base + PARAMS_MIN_LIQUIDATION_OFF);
    result.hMin = result.warmupPeriodSlots;
    result.hMax = result.warmupPeriodSlots;
  }
  return result;
}
function parseEngine(data) {
  if (data.length >= 8 && readU64LE(data, 0) !== MAGIC) {
    throw new Error("parseEngine: invalid slab magic");
  }
  const layout = detectSlabLayout(data.length, data);
  if (!layout) {
    throw new Error(`Unrecognized slab data length: ${data.length}. Cannot determine layout version.`);
  }
  if (data.length < layout.accountsOff) {
    throw new Error(`parseEngine: data too short for accountsOff (${data.length} < ${layout.accountsOff})`);
  }
  const base = layout.engineOff;
  const isV12_17 = layout.accountSize === V12_17_ACCOUNT_SIZE || layout.accountSize === V12_17_ACCOUNT_SIZE_SBF;
  const isV12_15 = !isV12_17 && (layout.accountSize === V12_15_ACCOUNT_SIZE || layout.accountSize === V12_15_ACCOUNT_SIZE_SMALL) && (layout.engineOff === V12_15_ENGINE_OFF || layout.engineOff === V12_15_ENGINE_OFF_SBF);
  const isV12_19 = layout.accountSize === V12_19_ACCOUNT_SIZE_SBF;
  if (isV12_17 || isV12_19) {
    const isSbf = layout.engineOff === V12_17_ENGINE_OFF_SBF || isV12_19;
    const currentSlotOff = isV12_19 ? V12_19_SBF_ENGINE_CURRENT_SLOT_OFF : isSbf ? V12_17_SBF_ENGINE_CURRENT_SLOT_OFF : V12_17_ENGINE_CURRENT_SLOT_OFF;
    const marketModeOff = isV12_19 ? V12_19_SBF_ENGINE_MARKET_MODE_OFF : isSbf ? V12_17_SBF_ENGINE_MARKET_MODE_OFF : V12_17_ENGINE_MARKET_MODE_OFF;
    const cTotOff = isV12_19 ? V12_19_SBF_ENGINE_C_TOT_OFF : isSbf ? V12_17_SBF_ENGINE_C_TOT_OFF : V12_17_ENGINE_C_TOT_OFF;
    const pnlPosTotOff = isV12_19 ? V12_19_SBF_ENGINE_PNL_POS_TOT_OFF : isSbf ? V12_17_SBF_ENGINE_PNL_POS_TOT_OFF : V12_17_ENGINE_PNL_POS_TOT_OFF;
    const pnlMaturedOff = isV12_19 ? V12_19_SBF_ENGINE_PNL_MATURED_POS_TOT_OFF : isSbf ? V12_17_SBF_ENGINE_PNL_MATURED_POS_TOT_OFF : V12_17_ENGINE_PNL_MATURED_POS_TOT_OFF;
    const negPnlOff = isV12_19 ? V12_19_SBF_ENGINE_NEG_PNL_COUNT_OFF : isSbf ? V12_17_SBF_ENGINE_NEG_PNL_COUNT_OFF : V12_17_ENGINE_NEG_PNL_COUNT_OFF;
    const oraclePriceOff = isV12_19 ? V12_19_SBF_ENGINE_LAST_ORACLE_PRICE_OFF : isSbf ? V12_17_SBF_ENGINE_LAST_ORACLE_PRICE_OFF : V12_17_ENGINE_LAST_ORACLE_PRICE_OFF;
    const fundPxLastOff = isV12_19 ? V12_19_SBF_ENGINE_FUND_PX_LAST_OFF : isSbf ? V12_17_SBF_ENGINE_FUND_PX_LAST_OFF : V12_17_ENGINE_FUND_PX_LAST_OFF;
    const fLongNumOff = isV12_19 ? V12_19_SBF_ENGINE_F_LONG_NUM_OFF : isSbf ? V12_17_SBF_ENGINE_F_LONG_NUM_OFF : V12_17_ENGINE_F_LONG_NUM_OFF;
    const fShortNumOff = isV12_19 ? V12_19_SBF_ENGINE_F_SHORT_NUM_OFF : isSbf ? V12_17_SBF_ENGINE_F_SHORT_NUM_OFF : V12_17_ENGINE_F_SHORT_NUM_OFF;
    const resolvedKLongOff = isV12_19 ? 288 : isSbf ? 288 : V12_17_ENGINE_RESOLVED_K_LONG_OFF;
    const resolvedKShortOff = isV12_19 ? 304 : isSbf ? 304 : V12_17_ENGINE_RESOLVED_K_SHORT_OFF;
    const resolvedLivePriceOff = isV12_19 ? V12_19_SBF_ENGINE_RESOLVED_LIVE_PRICE_OFF : isSbf ? 320 : V12_17_ENGINE_RESOLVED_LIVE_PRICE_OFF;
    const lastCrankSlotOff = isV12_19 ? V12_19_SBF_ENGINE_LAST_MARKET_SLOT_OFF : isSbf ? V12_17_SBF_ENGINE_LAST_CRANK_SLOT_OFF : V12_17_ENGINE_LAST_CRANK_SLOT_OFF;
    const gcCursorOff = isV12_19 ? V12_19_SBF_ENGINE_RR_CURSOR_OFF : isSbf ? V12_17_SBF_ENGINE_GC_CURSOR_OFF : V12_17_ENGINE_GC_CURSOR_OFF;
    const oiEffLongOff = isV12_19 ? V12_19_SBF_ENGINE_OI_EFF_LONG_OFF : isSbf ? V12_17_SBF_ENGINE_OI_EFF_LONG_OFF : V12_17_ENGINE_OI_EFF_LONG_OFF;
    const oiEffShortOff = isV12_19 ? V12_19_SBF_ENGINE_OI_EFF_SHORT_OFF : isSbf ? V12_17_SBF_ENGINE_OI_EFF_SHORT_OFF : V12_17_ENGINE_OI_EFF_SHORT_OFF;
    const longOi = readU128LE(data, base + oiEffLongOff);
    const shortOi = readU128LE(data, base + oiEffShortOff);
    const bitmapEnd = layout.engineBitmapOff + layout.bitmapWords * 8;
    return {
      vault: readU128LE(data, base),
      insuranceFund: {
        balance: readU128LE(data, base + 16),
        feeRevenue: 0n,
        isolatedBalance: 0n,
        isolationBps: 0
      },
      currentSlot: readU64LE(data, base + currentSlotOff),
      fundingIndexQpbE6: 0n,
      // replaced by per-side funding
      lastFundingSlot: 0n,
      fundingRateBpsPerSlotLast: 0n,
      // no stored funding rate in v12.17
      fundingRateE9: 0n,
      // no stored funding rate in v12.17
      marketMode: readU8(data, base + marketModeOff) === 1 ? 1 : 0,
      lastCrankSlot: readU64LE(data, base + lastCrankSlotOff),
      maxCrankStalenessSlots: 0n,
      totalOpenInterest: longOi + shortOi,
      longOi,
      shortOi,
      cTot: readU128LE(data, base + cTotOff),
      pnlPosTot: readU128LE(data, base + pnlPosTotOff),
      pnlMaturedPosTot: readU128LE(data, base + pnlMaturedOff),
      liqCursor: 0,
      gcCursor: readU16LE(data, base + gcCursorOff),
      lastSweepStartSlot: 0n,
      lastSweepCompleteSlot: 0n,
      crankCursor: 0,
      sweepStartIdx: 0,
      lifetimeLiquidations: 0n,
      lifetimeForceCloses: 0n,
      netLpPos: 0n,
      lpSumAbs: 0n,
      lpMaxAbs: 0n,
      lpMaxAbsSweep: 0n,
      emergencyOiMode: false,
      emergencyStartSlot: 0n,
      lastBreakerSlot: 0n,
      markPriceE6: 0n,
      oraclePriceE6: readU64LE(data, base + oraclePriceOff),
      numUsedAccounts: readU16LE(data, base + bitmapEnd),
      nextAccountId: 0n,
      // removed in v12.17 (replaced by mat_counter in header)
      // V12_17 fields
      fLongNum: readI128LE(data, base + fLongNumOff),
      fShortNum: readI128LE(data, base + fShortNumOff),
      negPnlAccountCount: readU64LE(data, base + negPnlOff),
      fundPxLast: readU64LE(data, base + fundPxLastOff),
      resolvedKLongTerminalDelta: readI128LE(data, base + resolvedKLongOff),
      resolvedKShortTerminalDelta: readI128LE(data, base + resolvedKShortOff),
      resolvedLivePrice: readU64LE(data, base + resolvedLivePriceOff)
    };
  }
  const fundingRateBpsPerSlotLast = isV12_15 ? readI128LE(data, base + layout.engineFundingRateBpsOff) : readI64LE(data, base + layout.engineFundingRateBpsOff);
  return {
    vault: readU128LE(data, base),
    insuranceFund: {
      balance: readU128LE(data, base + layout.engineInsuranceOff),
      // feeRevenue: only exists in percolator-core (80-byte InsuranceFund), not deployed (16-byte)
      feeRevenue: layout.hasInsuranceIsolation ? readU128LE(data, base + layout.engineInsuranceOff + 16) : 0n,
      isolatedBalance: layout.hasInsuranceIsolation ? readU128LE(data, base + layout.engineInsuranceIsolatedOff) : 0n,
      isolationBps: layout.hasInsuranceIsolation ? readU16LE(data, base + layout.engineInsuranceIsolationBpsOff) : 0
    },
    currentSlot: readU64LE(data, base + layout.engineCurrentSlotOff),
    fundingIndexQpbE6: layout.engineFundingIndexOff >= 0 ? layout.engineLastFundingSlotOff >= 0 && layout.engineLastFundingSlotOff - layout.engineFundingIndexOff === 8 ? BigInt(readI64LE(data, base + layout.engineFundingIndexOff)) : readI128LE(data, base + layout.engineFundingIndexOff) : 0n,
    lastFundingSlot: layout.engineLastFundingSlotOff >= 0 ? readU64LE(data, base + layout.engineLastFundingSlotOff) : 0n,
    fundingRateBpsPerSlotLast,
    fundingRateE9: isV12_15 ? readI128LE(data, base + layout.engineFundingRateBpsOff) : 0n,
    marketMode: isV12_15 ? readU8(data, base + layout.engineFundingRateBpsOff + 16) === 1 ? 1 : 0 : null,
    lastCrankSlot: layout.engineLastCrankSlotOff >= 0 ? readU64LE(data, base + layout.engineLastCrankSlotOff) : 0n,
    maxCrankStalenessSlots: layout.engineMaxCrankStalenessOff >= 0 ? readU64LE(data, base + layout.engineMaxCrankStalenessOff) : 0n,
    totalOpenInterest: layout.engineTotalOiOff >= 0 ? readU128LE(data, base + layout.engineTotalOiOff) : 0n,
    longOi: layout.engineLongOiOff >= 0 ? readU128LE(data, base + layout.engineLongOiOff) : 0n,
    shortOi: layout.engineShortOiOff >= 0 ? readU128LE(data, base + layout.engineShortOiOff) : 0n,
    cTot: readU128LE(data, base + layout.engineCTotOff),
    pnlPosTot: readU128LE(data, base + layout.enginePnlPosTotOff),
    pnlMaturedPosTot: isV12_15 ? readU128LE(data, base + V12_15_ENGINE_PNL_MATURED_POS_TOT_OFF) : 0n,
    liqCursor: layout.engineLiqCursorOff >= 0 ? readU16LE(data, base + layout.engineLiqCursorOff) : 0,
    gcCursor: layout.engineGcCursorOff >= 0 ? readU16LE(data, base + layout.engineGcCursorOff) : 0,
    lastSweepStartSlot: layout.engineLastSweepStartOff >= 0 ? readU64LE(data, base + layout.engineLastSweepStartOff) : 0n,
    lastSweepCompleteSlot: layout.engineLastSweepCompleteOff >= 0 ? readU64LE(data, base + layout.engineLastSweepCompleteOff) : 0n,
    crankCursor: layout.engineCrankCursorOff >= 0 ? readU16LE(data, base + layout.engineCrankCursorOff) : 0,
    sweepStartIdx: layout.engineSweepStartIdxOff >= 0 ? readU16LE(data, base + layout.engineSweepStartIdxOff) : 0,
    lifetimeLiquidations: layout.engineLifetimeLiquidationsOff >= 0 ? readU64LE(data, base + layout.engineLifetimeLiquidationsOff) : 0n,
    lifetimeForceCloses: layout.engineLifetimeForceClosesOff >= 0 ? readU64LE(data, base + layout.engineLifetimeForceClosesOff) : 0n,
    netLpPos: layout.engineNetLpPosOff >= 0 ? readI128LE(data, base + layout.engineNetLpPosOff) : 0n,
    lpSumAbs: layout.engineLpSumAbsOff >= 0 ? readU128LE(data, base + layout.engineLpSumAbsOff) : 0n,
    lpMaxAbs: layout.engineLpMaxAbsOff >= 0 ? readU128LE(data, base + layout.engineLpMaxAbsOff) : 0n,
    lpMaxAbsSweep: layout.engineLpMaxAbsSweepOff >= 0 ? readU128LE(data, base + layout.engineLpMaxAbsSweepOff) : 0n,
    emergencyOiMode: layout.engineEmergencyOiModeOff >= 0 ? data[base + layout.engineEmergencyOiModeOff] !== 0 : false,
    emergencyStartSlot: layout.engineEmergencyStartSlotOff >= 0 ? readU64LE(data, base + layout.engineEmergencyStartSlotOff) : 0n,
    lastBreakerSlot: layout.engineLastBreakerSlotOff >= 0 ? readU64LE(data, base + layout.engineLastBreakerSlotOff) : 0n,
    markPriceE6: layout.engineMarkPriceOff >= 0 ? readU64LE(data, base + layout.engineMarkPriceOff) : 0n,
    // V12_15: last_oracle_price at engine+608 (SBF) / engine+... (native).
    // Located at bitmapOff - 40 on SBF (648-40=608, verified on-chain).
    oraclePriceE6: isV12_15 ? readU64LE(data, base + layout.engineBitmapOff - 40) : 0n,
    numUsedAccounts: (() => {
      if (layout.postBitmap < 18) return 0;
      const bw = layout.bitmapWords;
      return readU16LE(data, base + layout.engineBitmapOff + bw * 8);
    })(),
    nextAccountId: (() => {
      if (layout.postBitmap < 18) return 0n;
      const bw = layout.bitmapWords;
      const numUsedOff = layout.engineBitmapOff + bw * 8;
      return readU64LE(data, base + Math.ceil((numUsedOff + 2) / 8) * 8);
    })(),
    // V12_17 fields (not present in pre-v12.17)
    fLongNum: 0n,
    fShortNum: 0n,
    negPnlAccountCount: 0n,
    fundPxLast: 0n,
    resolvedKLongTerminalDelta: 0n,
    resolvedKShortTerminalDelta: 0n,
    resolvedLivePrice: 0n
  };
}
function parseUsedIndices(data) {
  const layout = detectSlabLayout(data.length, data);
  if (!layout) throw new Error(`Unrecognized slab data length: ${data.length}`);
  const base = layout.engineOff + layout.engineBitmapOff;
  if (data.length < base + layout.bitmapWords * 8) {
    throw new Error("Slab data too short for bitmap");
  }
  const used = [];
  for (let word = 0; word < layout.bitmapWords; word++) {
    const bits = readU64LE(data, base + word * 8);
    if (bits === 0n) continue;
    for (let bit = 0; bit < 64; bit++) {
      if (bits >> BigInt(bit) & 1n) {
        used.push(word * 64 + bit);
      }
    }
  }
  return used;
}
function isAccountUsed(data, idx) {
  const layout = detectSlabLayout(data.length, data);
  if (!layout) return false;
  if (!Number.isInteger(idx) || idx < 0 || idx >= layout.maxAccounts) return false;
  const base = layout.engineOff + layout.engineBitmapOff;
  const word = Math.floor(idx / 64);
  const bit = idx % 64;
  const bits = readU64LE(data, base + word * 8);
  return (bits >> BigInt(bit) & 1n) !== 0n;
}
function maxAccountIndex(dataLen) {
  const layout = detectSlabLayout(dataLen);
  if (!layout) return 0;
  const accountsEnd = dataLen - layout.accountsOff;
  if (accountsEnd <= 0) return 0;
  return Math.floor(accountsEnd / layout.accountSize);
}
function parseAccount(data, idx) {
  const layout = detectSlabLayout(data.length, data);
  if (!layout) throw new Error(`Unrecognized slab data length: ${data.length}`);
  const maxIdx = maxAccountIndex(data.length);
  if (!Number.isInteger(idx) || idx < 0 || idx >= maxIdx) {
    throw new Error(`Account index out of range: ${idx} (max: ${maxIdx - 1})`);
  }
  const base = layout.accountsOff + idx * layout.accountSize;
  if (data.length < base + layout.accountSize) {
    throw new Error("Slab data too short for account");
  }
  const isV12_17 = layout.accountSize === V12_17_ACCOUNT_SIZE || layout.accountSize === V12_17_ACCOUNT_SIZE_SBF || layout.accountSize === V12_19_ACCOUNT_SIZE_SBF;
  const isV12_15 = !isV12_17 && (layout.accountSize === V12_15_ACCOUNT_SIZE || layout.accountSize === V12_15_ACCOUNT_SIZE_SMALL);
  const isV12_1EP = !isV12_17 && !isV12_15 && layout.accountSize === V12_1_EP_SBF_ACCOUNT_SIZE && layout.engineOff === V12_1_SBF_ENGINE_OFF;
  const isV12_1 = !isV12_17 && !isV12_15 && !isV12_1EP && (layout.engineOff === V12_1_ENGINE_OFF || layout.engineOff === V12_1_SBF_ENGINE_OFF) && (layout.accountSize === V12_1_ACCOUNT_SIZE || layout.accountSize === V12_1_ACCOUNT_SIZE_SBF);
  const isAdl = !isV12_17 && !isV12_15 && (layout.accountSize >= 312 || isV12_1 || isV12_1EP);
  if (isV12_17) {
    const isSbf = layout.accountSize === V12_17_ACCOUNT_SIZE_SBF || layout.accountSize === V12_19_ACCOUNT_SIZE_SBF;
    const d1 = isSbf ? 8 : 0;
    const d2 = isSbf ? 16 : 0;
    const kindByte2 = readU8(data, base + V12_17_ACCT_KIND_OFF);
    const kind2 = kindByte2 === 1 ? 1 /* LP */ : 0 /* User */;
    return {
      kind: kind2,
      accountId: 0n,
      // removed in v12.17
      capital: readU128LE(data, base + V12_17_ACCT_CAPITAL_OFF),
      pnl: readI128LE(data, base + V12_17_ACCT_PNL_OFF - d1),
      reservedPnl: readU128LE(data, base + V12_17_ACCT_RESERVED_PNL_OFF - d1),
      warmupStartedAtSlot: 0n,
      // removed
      warmupSlopePerStep: 0n,
      // removed
      positionSize: readI128LE(data, base + V12_17_ACCT_POSITION_BASIS_Q_OFF - d1),
      entryPrice: 0n,
      // removed — compute off-chain from position_basis_q / effective_pos_q
      fundingIndex: 0n,
      // replaced by per-side f_long_num/f_short_num + per-account f_snap
      matcherProgram: new PublicKey5(data.subarray(base + V12_17_ACCT_MATCHER_PROGRAM_OFF - d1, base + V12_17_ACCT_MATCHER_PROGRAM_OFF - d1 + 32)),
      matcherContext: new PublicKey5(data.subarray(base + V12_17_ACCT_MATCHER_CONTEXT_OFF - d1, base + V12_17_ACCT_MATCHER_CONTEXT_OFF - d1 + 32)),
      owner: new PublicKey5(data.subarray(base + V12_17_ACCT_OWNER_OFF - d1, base + V12_17_ACCT_OWNER_OFF - d1 + 32)),
      feeCredits: readI128LE(data, base + V12_17_ACCT_FEE_CREDITS_OFF - d1),
      lastFeeSlot: 0n,
      // removed
      feesEarnedTotal: 0n,
      // removed in v12.17
      exactReserveCohorts: null,
      // replaced by two-bucket warmup
      exactCohortCount: null,
      overflowOlder: null,
      overflowOlderPresent: null,
      overflowNewest: null,
      overflowNewestPresent: null,
      // V12_17 fields
      fSnap: readI128LE(data, base + V12_17_ACCT_F_SNAP_OFF - d1),
      adlABasis: readU128LE(data, base + V12_17_ACCT_ADL_A_BASIS_OFF - d1),
      adlKSnap: readI128LE(data, base + V12_17_ACCT_ADL_K_SNAP_OFF - d1),
      adlEpochSnap: readU64LE(data, base + V12_17_ACCT_ADL_EPOCH_SNAP_OFF - d1),
      schedPresent: readU8(data, base + V12_17_ACCT_SCHED_PRESENT_OFF - d1) !== 0,
      schedRemainingQ: readU128LE(data, base + V12_17_ACCT_SCHED_REMAINING_Q_OFF - d1),
      schedAnchorQ: readU128LE(data, base + V12_17_ACCT_SCHED_ANCHOR_Q_OFF - d1),
      schedStartSlot: readU64LE(data, base + V12_17_ACCT_SCHED_START_SLOT_OFF - d1),
      schedHorizon: readU64LE(data, base + V12_17_ACCT_SCHED_HORIZON_OFF - d1),
      schedReleaseQ: readU128LE(data, base + V12_17_ACCT_SCHED_RELEASE_Q_OFF - d1),
      pendingPresent: readU8(data, base + V12_17_ACCT_PENDING_PRESENT_OFF - d1) !== 0,
      pendingRemainingQ: readU128LE(data, base + V12_17_ACCT_PENDING_REMAINING_Q_OFF - d2),
      pendingHorizon: readU64LE(data, base + V12_17_ACCT_PENDING_HORIZON_OFF - d2),
      pendingCreatedSlot: readU64LE(data, base + V12_17_ACCT_PENDING_CREATED_SLOT_OFF - d2)
    };
  }
  if (isV12_15) {
    const kindByte2 = readU8(data, base + V12_15_ACCT_KIND_OFF);
    const kind2 = kindByte2 === 1 ? 1 /* LP */ : 0 /* User */;
    const cohortCount = readU8(data, base + V12_15_ACCT_EXACT_COHORT_COUNT_OFF);
    const exactReserveCohorts = [];
    for (let i = 0; i < 62; i++) {
      const cohortOff = base + V12_15_ACCT_EXACT_RESERVE_COHORTS_OFF + i * 64;
      exactReserveCohorts.push(data.slice(cohortOff, cohortOff + 64));
    }
    const overflowOlderPresent = readU8(data, base + V12_15_ACCT_OVERFLOW_OLDER_PRESENT_OFF) !== 0;
    const overflowNewestPresent = readU8(data, base + V12_15_ACCT_OVERFLOW_NEWEST_PRESENT_OFF) !== 0;
    return {
      kind: kind2,
      accountId: readU64LE(data, base + V12_15_ACCT_ACCOUNT_ID_OFF),
      capital: readU128LE(data, base + V12_15_ACCT_CAPITAL_OFF),
      pnl: readI128LE(data, base + V12_15_ACCT_PNL_OFF),
      reservedPnl: readU128LE(data, base + V12_15_ACCT_RESERVED_PNL_OFF),
      warmupStartedAtSlot: 0n,
      // removed in v12.15
      warmupSlopePerStep: 0n,
      // removed in v12.15
      positionSize: readI128LE(data, base + V12_15_ACCT_POSITION_BASIS_Q_OFF),
      entryPrice: readU64LE(data, base + V12_15_ACCT_ENTRY_PRICE_OFF),
      fundingIndex: 0n,
      // not present in v12.15 account struct
      matcherProgram: new PublicKey5(data.subarray(base + V12_15_ACCT_MATCHER_PROGRAM_OFF, base + V12_15_ACCT_MATCHER_PROGRAM_OFF + 32)),
      matcherContext: new PublicKey5(data.subarray(base + V12_15_ACCT_MATCHER_CONTEXT_OFF, base + V12_15_ACCT_MATCHER_CONTEXT_OFF + 32)),
      owner: new PublicKey5(data.subarray(base + V12_15_ACCT_OWNER_OFF, base + V12_15_ACCT_OWNER_OFF + 32)),
      feeCredits: readI128LE(data, base + V12_15_ACCT_FEE_CREDITS_OFF),
      lastFeeSlot: 0n,
      // removed in v12.15
      feesEarnedTotal: readU128LE(data, base + V12_15_ACCT_FEES_EARNED_TOTAL_OFF),
      exactReserveCohorts,
      exactCohortCount: cohortCount,
      overflowOlder: data.slice(base + V12_15_ACCT_OVERFLOW_OLDER_OFF, base + V12_15_ACCT_OVERFLOW_OLDER_OFF + 64),
      overflowOlderPresent,
      overflowNewest: data.slice(base + V12_15_ACCT_OVERFLOW_NEWEST_OFF, base + V12_15_ACCT_OVERFLOW_NEWEST_OFF + 64),
      overflowNewestPresent,
      // v12.17 fields (not present in v12.15)
      fSnap: 0n,
      adlABasis: 0n,
      adlKSnap: 0n,
      adlEpochSnap: 0n,
      schedPresent: null,
      schedRemainingQ: null,
      schedAnchorQ: null,
      schedStartSlot: null,
      schedHorizon: null,
      schedReleaseQ: null,
      pendingPresent: null,
      pendingRemainingQ: null,
      pendingHorizon: null,
      pendingCreatedSlot: null
    };
  }
  const warmupStartedOff = isAdl ? V_ADL_ACCT_WARMUP_STARTED_OFF : ACCT_WARMUP_STARTED_OFF;
  const warmupSlopeOff = isAdl ? V_ADL_ACCT_WARMUP_SLOPE_OFF : ACCT_WARMUP_SLOPE_OFF;
  const positionSizeOff = isV12_1 || isV12_1EP ? V12_1_ACCT_POSITION_SIZE_OFF : isAdl ? V_ADL_ACCT_POSITION_SIZE_OFF : ACCT_POSITION_SIZE_OFF;
  const entryPriceOff = isV12_1EP ? V12_1_EP_ACCT_ENTRY_PRICE_OFF : isV12_1 ? V12_1_ACCT_ENTRY_PRICE_OFF : isAdl ? V_ADL_ACCT_ENTRY_PRICE_OFF : ACCT_ENTRY_PRICE_OFF;
  const fundingIndexOff = isV12_1 || isV12_1EP ? -1 : isAdl ? V_ADL_ACCT_FUNDING_INDEX_OFF : ACCT_FUNDING_INDEX_OFF;
  const matcherProgOff = isV12_1EP ? V12_1_EP_ACCT_MATCHER_PROGRAM_OFF : isV12_1 ? V12_1_ACCT_MATCHER_PROGRAM_OFF : isAdl ? V_ADL_ACCT_MATCHER_PROGRAM_OFF : ACCT_MATCHER_PROGRAM_OFF;
  const matcherCtxOff = isV12_1EP ? V12_1_EP_ACCT_MATCHER_CONTEXT_OFF : isV12_1 ? V12_1_ACCT_MATCHER_CONTEXT_OFF : isAdl ? V_ADL_ACCT_MATCHER_CONTEXT_OFF : ACCT_MATCHER_CONTEXT_OFF;
  const feeCreditsOff = isV12_1EP ? V12_1_EP_ACCT_FEE_CREDITS_OFF : isV12_1 ? V12_1_ACCT_FEE_CREDITS_OFF : isAdl ? V_ADL_ACCT_FEE_CREDITS_OFF : ACCT_FEE_CREDITS_OFF;
  const lastFeeSlotOff = isV12_1EP ? V12_1_EP_ACCT_LAST_FEE_SLOT_OFF : isV12_1 ? V12_1_ACCT_LAST_FEE_SLOT_OFF : isAdl ? V_ADL_ACCT_LAST_FEE_SLOT_OFF : ACCT_LAST_FEE_SLOT_OFF;
  const kindByte = readU8(data, base + ACCT_KIND_OFF);
  const kind = kindByte === 1 ? 1 /* LP */ : 0 /* User */;
  return {
    kind,
    accountId: readU64LE(data, base + ACCT_ACCOUNT_ID_OFF),
    capital: readU128LE(data, base + ACCT_CAPITAL_OFF),
    pnl: readI128LE(data, base + ACCT_PNL_OFF),
    reservedPnl: isAdl ? readU128LE(data, base + ACCT_RESERVED_PNL_OFF) : readU64LE(data, base + ACCT_RESERVED_PNL_OFF),
    warmupStartedAtSlot: readU64LE(data, base + warmupStartedOff),
    warmupSlopePerStep: readU128LE(data, base + warmupSlopeOff),
    positionSize: readI128LE(data, base + positionSizeOff),
    entryPrice: entryPriceOff >= 0 ? readU64LE(data, base + entryPriceOff) : 0n,
    // V12_1/V12_1_EP: funding_index not present in SBF layout
    fundingIndex: isV12_1 || isV12_1EP ? fundingIndexOff >= 0 ? BigInt(readI64LE(data, base + fundingIndexOff)) : 0n : readI128LE(data, base + fundingIndexOff),
    matcherProgram: new PublicKey5(data.subarray(base + matcherProgOff, base + matcherProgOff + 32)),
    matcherContext: new PublicKey5(data.subarray(base + matcherCtxOff, base + matcherCtxOff + 32)),
    owner: new PublicKey5(data.subarray(base + layout.acctOwnerOff, base + layout.acctOwnerOff + 32)),
    feeCredits: readI128LE(data, base + feeCreditsOff),
    lastFeeSlot: readU64LE(data, base + lastFeeSlotOff),
    feesEarnedTotal: 0n,
    // not present in pre-v12.15 layouts
    exactReserveCohorts: null,
    // not present in pre-v12.15 layouts
    exactCohortCount: null,
    overflowOlder: null,
    overflowOlderPresent: null,
    overflowNewest: null,
    overflowNewestPresent: null,
    // v12.17 fields (not present in pre-v12.17)
    fSnap: 0n,
    adlABasis: 0n,
    adlKSnap: 0n,
    adlEpochSnap: 0n,
    schedPresent: null,
    schedRemainingQ: null,
    schedAnchorQ: null,
    schedStartSlot: null,
    schedHorizon: null,
    schedReleaseQ: null,
    pendingPresent: null,
    pendingRemainingQ: null,
    pendingHorizon: null,
    pendingCreatedSlot: null
  };
}
var V17_MAGIC = 0x5045524356313600n;
var V17_EXPECTED_VERSION = 16;
var V17_KIND_MARKET = 1;
var V17_KIND_OFF = 10;
var V17_WRAPPER_CONFIG_LEN = 432;
var V17_ASSET_ORACLE_PROFILE_LEN = 400;
var V17_HEADER_LEN = 16;
var V17_MARKET_GROUP_OFF = V17_HEADER_LEN + V17_WRAPPER_CONFIG_LEN;
var V17_MARKET_GROUP_LEN = 758;
var V17_MARKET_ASSET_SLOT_LEN = 1797;
function v17MarketAccountLen(maxPortfolioAssets) {
  if (!Number.isInteger(maxPortfolioAssets) || maxPortfolioAssets < 1) {
    throw new Error(`v17MarketAccountLen: maxPortfolioAssets must be a positive integer, got ${maxPortfolioAssets}`);
  }
  return V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + maxPortfolioAssets * V17_MARKET_ASSET_SLOT_LEN;
}
var V17_PORTFOLIO_ACCOUNT_LEN = 9347;
function parseWrapperConfigV17(data, configOff = V17_HEADER_LEN) {
  const MIN_LEN = configOff + V17_WRAPPER_CONFIG_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseWrapperConfigV17: data too short \u2014 need ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  const b = configOff;
  const marketauth = new PublicKey5(data.subarray(b + 0, b + 32));
  const collateralMint = new PublicKey5(data.subarray(b + 32, b + 64));
  const secondaryCollateralMint = new PublicKey5(data.subarray(b + 64, b + 96));
  const maintenanceFeePerSlot = readU128LE(data, b + 96);
  const permissionlessMarketInitFee = readU128LE(data, b + 112);
  const tradeFeeBps = readU64LE(data, b + 128);
  const permissionlessResolveStaleSlots = readU64LE(data, b + 136);
  const forceCloseDelaySlots = readU64LE(data, b + 144);
  const lastGoodOracleSlot = readU64LE(data, b + 152);
  const insuranceWithdrawDepositRemaining = readU128LE(data, b + 160);
  const insuranceWithdrawMaxBps = readU16LE(data, b + 176);
  const liquidationCrankerFeeShareBps = readU16LE(data, b + 178);
  const maintenanceCrankerFeeShareBps = readU16LE(data, b + 180);
  const backingTradeFeeBpsLong = readU16LE(data, b + 182);
  const unitScale = readU32LE(data, b + 184);
  const confFilterBps = readU16LE(data, b + 188);
  const backingTradeFeeBpsShort = readU16LE(data, b + 190);
  const insuranceWithdrawDepositsOnly = readU8(data, b + 192);
  const oracleMode = readU8(data, b + 193);
  const oracleLegCount = readU8(data, b + 194);
  const oracleLegFlags = readU8(data, b + 195);
  const invert = readU8(data, b + 196);
  const freeMarketSlotCount = readU16LE(data, b + 198);
  const insuranceWithdrawCooldownSlots = readU64LE(data, b + 200);
  const lastInsuranceWithdrawSlot = readU64LE(data, b + 208);
  const maxStalenessSecs = readU64LE(data, b + 216);
  const hybridSoftStaleSlots = readU64LE(data, b + 224);
  const markEwmaE6 = readU64LE(data, b + 232);
  const markEwmaLastSlot = readU64LE(data, b + 240);
  const markEwmaHalflifeSlots = readU64LE(data, b + 248);
  const markMinFee = readU64LE(data, b + 256);
  const oracleTargetPriceE6 = readU64LE(data, b + 264);
  const oracleTargetPublishTime = readI64LE(data, b + 272);
  const ORACLE_LEG_CAP = 3;
  const oracleLegFeeds = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegFeeds.push(new PublicKey5(data.subarray(b + 280 + i * 32, b + 280 + (i + 1) * 32)));
  }
  const oracleLegPricesE6 = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegPricesE6.push(readU64LE(data, b + 376 + i * 8));
  }
  const oracleLegPublishTimes = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegPublishTimes.push(readI64LE(data, b + 400 + i * 8));
  }
  const backingTradeFeePolicyCount = readU16LE(data, b + 424);
  const backingTradeFeeInsuranceShareBpsLong = readU16LE(data, b + 426);
  const backingTradeFeeInsuranceShareBpsShort = readU16LE(data, b + 428);
  const feeRedirectToMarket0Bps = readU16LE(data, b + 430);
  return {
    marketauth,
    collateralMint,
    secondaryCollateralMint,
    maintenanceFeePerSlot,
    permissionlessMarketInitFee,
    tradeFeeBps,
    permissionlessResolveStaleSlots,
    forceCloseDelaySlots,
    lastGoodOracleSlot,
    insuranceWithdrawDepositRemaining,
    insuranceWithdrawMaxBps,
    liquidationCrankerFeeShareBps,
    maintenanceCrankerFeeShareBps,
    backingTradeFeeBpsLong,
    unitScale,
    confFilterBps,
    backingTradeFeeBpsShort,
    insuranceWithdrawDepositsOnly,
    oracleMode,
    oracleLegCount,
    oracleLegFlags,
    invert,
    freeMarketSlotCount,
    insuranceWithdrawCooldownSlots,
    lastInsuranceWithdrawSlot,
    maxStalenessSecs,
    hybridSoftStaleSlots,
    markEwmaE6,
    markEwmaLastSlot,
    markEwmaHalflifeSlots,
    markMinFee,
    oracleTargetPriceE6,
    oracleTargetPublishTime,
    oracleLegFeeds,
    oracleLegPricesE6,
    oracleLegPublishTimes,
    backingTradeFeePolicyCount,
    backingTradeFeeInsuranceShareBpsLong,
    backingTradeFeeInsuranceShareBpsShort,
    feeRedirectToMarket0Bps
  };
}
function parseAssetOracleProfileV17(data, profileOff) {
  const MIN_LEN = profileOff + V17_ASSET_ORACLE_PROFILE_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseAssetOracleProfileV17: data too short \u2014 need ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  const b = profileOff;
  const ORACLE_LEG_CAP = 3;
  const oracleLegFeeds = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegFeeds.push(new PublicKey5(data.subarray(b + 224 + i * 32, b + 224 + (i + 1) * 32)));
  }
  const oracleLegPricesE6 = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegPricesE6.push(readU64LE(data, b + 320 + i * 8));
  }
  const oracleLegPublishTimes = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegPublishTimes.push(readI64LE(data, b + 344 + i * 8));
  }
  return {
    oracleMode: readU8(data, b + 0),
    oracleLegCount: readU8(data, b + 1),
    oracleLegFlags: readU8(data, b + 2),
    invert: readU8(data, b + 3),
    unitScale: readU32LE(data, b + 4),
    confFilterBps: readU16LE(data, b + 8),
    backingTradeFeeBpsLong: readU16LE(data, b + 10),
    backingTradeFeeBpsShort: readU16LE(data, b + 12),
    backingTradeFeeInsuranceShareBpsLong: readU16LE(data, b + 14),
    backingTradeFeeInsuranceShareBpsShort: readU16LE(data, b + 16),
    insuranceAuthority: new PublicKey5(data.subarray(b + 24, b + 56)),
    insuranceOperator: new PublicKey5(data.subarray(b + 56, b + 88)),
    backingBucketAuthority: new PublicKey5(data.subarray(b + 88, b + 120)),
    oracleAuthority: new PublicKey5(data.subarray(b + 120, b + 152)),
    maxStalenessSecs: readU64LE(data, b + 152),
    hybridSoftStaleSlots: readU64LE(data, b + 160),
    markEwmaE6: readU64LE(data, b + 168),
    markEwmaLastSlot: readU64LE(data, b + 176),
    markEwmaHalflifeSlots: readU64LE(data, b + 184),
    markMinFee: readU64LE(data, b + 192),
    oracleTargetPriceE6: readU64LE(data, b + 200),
    oracleTargetPublishTime: readI64LE(data, b + 208),
    lastGoodOracleSlot: readU64LE(data, b + 216),
    oracleLegFeeds,
    oracleLegPricesE6,
    oracleLegPublishTimes,
    assetAdmin: new PublicKey5(data.subarray(b + 368, b + 400))
  };
}
function isV17Account(data) {
  if (data.length < 10) return false;
  const magic = readU64LE(data, 0);
  const version = readU16LE(data, 8);
  return magic === V17_MAGIC && version === V17_EXPECTED_VERSION;
}
function isV17MarketAccount(data) {
  if (data.length < V17_KIND_OFF + 1) return false;
  if (!isV17Account(data)) return false;
  return data[V17_KIND_OFF] === V17_KIND_MARKET;
}
var V17_ACCOUNT_HEADER_LEN = 16;
var PF_PROVENANCE_OFF = V17_ACCOUNT_HEADER_LEN;
var PF_PROVENANCE_MARKET_GROUP_OFF = PF_PROVENANCE_OFF;
var PF_PROVENANCE_ACCOUNT_ID_OFF = PF_PROVENANCE_OFF + 32;
var PF_PROVENANCE_OWNER_OFF = PF_PROVENANCE_OFF + 64;
var PF_PROVENANCE_VERSION_OFF = PF_PROVENANCE_OFF + 96;
var PF_PROVENANCE_DISC_OFF = PF_PROVENANCE_OFF + 98;
var PF_BODY_OFF = PF_PROVENANCE_OFF + 100;
var PF_OWNER_OFF = PF_BODY_OFF;
var PF_CAPITAL_OFF = PF_BODY_OFF + 32;
var PF_PNL_OFF = PF_BODY_OFF + 48;
var PF_RESERVED_PNL_OFF = PF_BODY_OFF + 64;
var PF_RESIDUAL_LOSS_OFF = PF_BODY_OFF + 80;
var PF_RESIDUAL_PRINCIPAL_OFF = PF_BODY_OFF + 96;
var PF_RESIDUAL_RECEIVED_OFF = PF_BODY_OFF + 112;
var PF_FEE_CREDITS_OFF = PF_BODY_OFF + 128;
var PF_CANCEL_ESCROW_OFF = PF_BODY_OFF + 144;
var PF_LAST_FEE_SLOT_OFF = PF_BODY_OFF + 160;
var PF_ACTIVE_BITMAP_OFF = PF_BODY_OFF + 168;
var PF_LEG_SIZE = 144;
var PF_LEGS_OFF = PF_BODY_OFF + 176;
var PF_LEGS_COUNT = 16;
var PF_SOURCE_DOMAIN_SIZE = 196;
var PF_SOURCE_DOMAINS_OFF = PF_LEGS_OFF + PF_LEGS_COUNT * PF_LEG_SIZE;
var PF_SOURCE_DOMAINS_CAP = 32;
var PF_HEALTH_CERT_OFF = PF_SOURCE_DOMAINS_OFF + PF_SOURCE_DOMAINS_CAP * PF_SOURCE_DOMAIN_SIZE;
function parsePortfolioV17(data) {
  const MIN_PORTFOLIO_BYTES = PF_BODY_OFF + 16;
  if (data.length < MIN_PORTFOLIO_BYTES) {
    throw new Error(`parsePortfolioV17: data too short (${data.length} < ${MIN_PORTFOLIO_BYTES})`);
  }
  const marketGroupId = new PublicKey5(data.subarray(PF_PROVENANCE_MARKET_GROUP_OFF, PF_PROVENANCE_MARKET_GROUP_OFF + 32));
  const portfolioAccountId = new PublicKey5(data.subarray(PF_PROVENANCE_ACCOUNT_ID_OFF, PF_PROVENANCE_ACCOUNT_ID_OFF + 32));
  const provenanceOwner = new PublicKey5(data.subarray(PF_PROVENANCE_OWNER_OFF, PF_PROVENANCE_OWNER_OFF + 32));
  const owner = new PublicKey5(data.subarray(PF_OWNER_OFF, PF_OWNER_OFF + 32));
  const capital = readU128LE(data, PF_CAPITAL_OFF);
  const pnl = readI128LE(data, PF_PNL_OFF);
  const reservedPnl = readU128LE(data, PF_RESERVED_PNL_OFF);
  const residualCrystallizedLossAtomsTotal = data.length >= PF_RESIDUAL_LOSS_OFF + 16 ? readU128LE(data, PF_RESIDUAL_LOSS_OFF) : 0n;
  const residualSpentPrincipalAtomsTotal = data.length >= PF_RESIDUAL_PRINCIPAL_OFF + 16 ? readU128LE(data, PF_RESIDUAL_PRINCIPAL_OFF) : 0n;
  const residualReceivedAtomsTotal = data.length >= PF_RESIDUAL_RECEIVED_OFF + 16 ? readU128LE(data, PF_RESIDUAL_RECEIVED_OFF) : 0n;
  const feeCredits = data.length >= PF_FEE_CREDITS_OFF + 16 ? readI128LE(data, PF_FEE_CREDITS_OFF) : 0n;
  const cancelDepositEscrow = data.length >= PF_CANCEL_ESCROW_OFF + 16 ? readU128LE(data, PF_CANCEL_ESCROW_OFF) : 0n;
  const lastFeeSlot = data.length >= PF_LAST_FEE_SLOT_OFF + 8 ? readU64LE(data, PF_LAST_FEE_SLOT_OFF) : 0n;
  const activeBitmap = data.length >= PF_ACTIVE_BITMAP_OFF + 8 ? readU64LE(data, PF_ACTIVE_BITMAP_OFF) : 0n;
  const legs = [];
  for (let i = 0; i < PF_LEGS_COUNT; i++) {
    const b = PF_LEGS_OFF + i * PF_LEG_SIZE;
    if (data.length < b + PF_LEG_SIZE) break;
    legs.push({
      active: data[b] !== 0,
      assetIndex: readU32LE(data, b + 1),
      marketId: readU64LE(data, b + 5),
      side: data[b + 13],
      basisPosQ: readI128LE(data, b + 14),
      aBasis: readU128LE(data, b + 30),
      kSnap: readI128LE(data, b + 46),
      fSnap: readI128LE(data, b + 62),
      epochSnap: readU64LE(data, b + 78),
      lossWeight: readU128LE(data, b + 86),
      bSnap: readU128LE(data, b + 102),
      bRem: readU128LE(data, b + 118),
      bEpochSnap: readU64LE(data, b + 134),
      bStale: data[b + 142] !== 0,
      stale: data[b + 143] !== 0
    });
  }
  const sourceDomains = [];
  for (let i = 0; i < PF_SOURCE_DOMAINS_CAP; i++) {
    const b = PF_SOURCE_DOMAINS_OFF + i * PF_SOURCE_DOMAIN_SIZE;
    if (data.length < b + PF_SOURCE_DOMAIN_SIZE) break;
    sourceDomains.push({
      domain: readU32LE(data, b + 0),
      sourceClaimMarketId: readU64LE(data, b + 4),
      sourceClaimBoundNum: readU128LE(data, b + 12),
      sourceClaimLienedNum: readU128LE(data, b + 28),
      sourceClaimCounterpartyLienedNum: readU128LE(data, b + 44),
      sourceClaimInsuranceLienedNum: readU128LE(data, b + 60),
      sourceLienEffectiveReserved: readU128LE(data, b + 76),
      sourceLienCounterpartyBackingNum: readU128LE(data, b + 92),
      sourceLienInsuranceBackingNum: readU128LE(data, b + 108),
      sourceLienFeeLastSlot: readU64LE(data, b + 124),
      sourceClaimImpairedNum: readU128LE(data, b + 132),
      sourceLienImpairedEffectiveReserved: readU128LE(data, b + 148),
      sourceLienCapitalAtRiskFeeRevenue: readU128LE(data, b + 164),
      sourceLienImpairedCapitalAtRiskFeeRevenue: readU128LE(data, b + 180)
    });
  }
  return {
    marketGroupId,
    portfolioAccountId,
    provenanceOwner,
    owner,
    capital,
    pnl,
    reservedPnl,
    residualCrystallizedLossAtomsTotal,
    residualSpentPrincipalAtomsTotal,
    residualReceivedAtomsTotal,
    feeCredits,
    cancelDepositEscrow,
    lastFeeSlot,
    activeBitmap,
    legs,
    sourceDomains
  };
}
var LP_VAULT_REGISTRY_TOTAL = 176;
function parseLpVaultRegistry(data) {
  if (data.length < LP_VAULT_REGISTRY_TOTAL) {
    throw new Error(
      `parseLpVaultRegistry: data too short (${data.length} < ${LP_VAULT_REGISTRY_TOTAL})`
    );
  }
  const b = V17_ACCOUNT_HEADER_LEN;
  return {
    marketGroup: new PublicKey5(data.subarray(b + 0, b + 32)),
    lpMint: new PublicKey5(data.subarray(b + 32, b + 64)),
    totalLpSharesOutstanding: readU128LE(data, b + 64),
    insuranceFeeSnapshotAtoms: readU128LE(data, b + 80),
    feeDistributionTotalAtoms: readU128LE(data, b + 96),
    epoch: readU64LE(data, b + 112),
    redemptionCooldownSlots: readU64LE(data, b + 120),
    feeShareBps: readU16LE(data, b + 128),
    oiReservationThresholdBps: readU16LE(data, b + 130),
    domain: readU16LE(data, b + 132),
    paused: data[b + 134] !== 0,
    version: data[b + 135],
    bump: data[b + 136],
    mintBump: data[b + 137]
  };
}
var LP_REDEMPTION_TOTAL = 112;
function parseLpRedemption(data) {
  if (data.length < LP_REDEMPTION_TOTAL) {
    throw new Error(
      `parseLpRedemption: data too short (${data.length} < ${LP_REDEMPTION_TOTAL})`
    );
  }
  const b = V17_ACCOUNT_HEADER_LEN;
  return {
    registry: new PublicKey5(data.subarray(b + 0, b + 32)),
    redeemer: new PublicKey5(data.subarray(b + 32, b + 64)),
    shares: readU128LE(data, b + 64),
    requestSlot: readU64LE(data, b + 80),
    version: data[b + 88],
    bump: data[b + 89]
  };
}
function parseAllAccounts(data) {
  const indices = parseUsedIndices(data);
  const maxIdx = maxAccountIndex(data.length);
  const validIndices = indices.filter((idx) => idx < maxIdx);
  const droppedCount = indices.length - validIndices.length;
  if (droppedCount > 0) {
    console.warn(
      `[parseAllAccounts] bitmap claims ${indices.length} used accounts but only ${maxIdx} fit in the slab \u2014 ${droppedCount} out-of-bounds indices dropped (possible bitmap corruption)`
    );
  }
  return validIndices.map((idx) => ({
    idx,
    account: parseAccount(data, idx)
  }));
}

// src/solana/pda.ts
import { PublicKey as PublicKey6 } from "@solana/web3.js";
var textEncoder = new TextEncoder();
function u16LE(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`u16LE: value must be an integer in [0, 65535], got ${value}`);
  }
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(
    0,
    value,
    /*littleEndian=*/
    true
  );
  return buf;
}
function deriveVaultAuthority(programId, slab) {
  return PublicKey6.findProgramAddressSync(
    [textEncoder.encode("vault"), slab.toBytes()],
    programId
  );
}
function deriveInsuranceLpMint(programId, slab) {
  return PublicKey6.findProgramAddressSync(
    [textEncoder.encode("lp_vault_mint"), slab.toBytes()],
    programId
  );
}
var LP_INDEX_U16_MAX = 65535;
function deriveLpPda(programId, slab, lpIdx) {
  if (typeof lpIdx !== "number" || !Number.isInteger(lpIdx) || lpIdx < 0 || lpIdx > LP_INDEX_U16_MAX) {
    throw new Error(
      `deriveLpPda: lpIdx must be an integer in [0, ${LP_INDEX_U16_MAX}], got ${lpIdx}`
    );
  }
  const idxBuf = new Uint8Array(2);
  new DataView(idxBuf.buffer).setUint16(0, lpIdx, true);
  return PublicKey6.findProgramAddressSync(
    [textEncoder.encode("lp"), slab.toBytes(), idxBuf],
    programId
  );
}
var PUMPSWAP_PROGRAM_ID = new PublicKey6(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);
var RAYDIUM_CLMM_PROGRAM_ID = new PublicKey6(
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"
);
var METEORA_DLMM_PROGRAM_ID = new PublicKey6(
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
);
var PYTH_PUSH_ORACLE_PROGRAM_ID = new PublicKey6(
  "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT"
);
var CREATOR_LOCK_SEED = "creator_lock";
function deriveCreatorLockPda(programId, slab) {
  return PublicKey6.findProgramAddressSync(
    [textEncoder.encode(CREATOR_LOCK_SEED), slab.toBytes()],
    programId
  );
}
function deriveLpVaultRegistry(programId, marketGroup) {
  return PublicKey6.findProgramAddressSync(
    [textEncoder.encode("lp_vault"), marketGroup.toBytes()],
    programId
  );
}
function deriveLpRedemption(programId, registry, redeemer) {
  return PublicKey6.findProgramAddressSync(
    [
      textEncoder.encode("lp_redemption"),
      registry.toBytes(),
      redeemer.toBytes()
    ],
    programId
  );
}
function deriveLpBackingLedger(programId, marketGroup, domainIdx) {
  return PublicKey6.findProgramAddressSync(
    [
      textEncoder.encode("lp_backing_ledger"),
      marketGroup.toBytes(),
      u16LE(domainIdx)
    ],
    programId
  );
}
function deriveLpEscrow(programId, marketGroup) {
  return PublicKey6.findProgramAddressSync(
    [textEncoder.encode("lp_escrow"), marketGroup.toBytes()],
    programId
  );
}
function deriveNftRegistry(programId, marketGroup) {
  return PublicKey6.findProgramAddressSync(
    [textEncoder.encode("nft_registry"), marketGroup.toBytes()],
    programId
  );
}
function deriveMatcherDelegate(programId, market, accountB, accountBOwner, matcherProg, matcherCtx) {
  return PublicKey6.findProgramAddressSync(
    [
      textEncoder.encode("matcher"),
      market.toBytes(),
      accountB.toBytes(),
      accountBOwner.toBytes(),
      matcherProg.toBytes(),
      matcherCtx.toBytes()
    ],
    programId
  );
}
function normalizePythFeedIdHex(feedIdHex) {
  let s = feedIdHex.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) {
    s = s.slice(2);
  }
  return s;
}
var FEED_HEX_RE = /^[0-9a-fA-F]{64}$/;
function derivePythPushOraclePDA(feedIdHex) {
  const normalized = normalizePythFeedIdHex(feedIdHex);
  if (!FEED_HEX_RE.test(normalized)) {
    throw new Error(
      `derivePythPushOraclePDA: feedIdHex must be 64 hex digits (32 bytes); got ${normalized.length === 64 ? "non-hexadecimal characters" : normalized.length + " chars"}`
    );
  }
  const feedId = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    feedId[i] = parseInt(normalized.substring(i * 2, i * 2 + 2), 16);
  }
  const shardBuf = new Uint8Array(2);
  return PublicKey6.findProgramAddressSync(
    [shardBuf, feedId],
    PYTH_PUSH_ORACLE_PROGRAM_ID
  );
}

// src/solana/ata.ts
import {
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID as TOKEN_PROGRAM_ID2
} from "@solana/spl-token";
async function getAta(owner, mint, allowOwnerOffCurve = false, tokenProgramId = TOKEN_PROGRAM_ID2) {
  return getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve, tokenProgramId);
}
function getAtaSync(owner, mint, allowOwnerOffCurve = false, tokenProgramId = TOKEN_PROGRAM_ID2) {
  return getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve, tokenProgramId);
}
async function fetchTokenAccount(connection, address, tokenProgramId = TOKEN_PROGRAM_ID2) {
  return getAccount(connection, address, void 0, tokenProgramId);
}

// src/solana/discovery.ts
import { PublicKey as PublicKey8 } from "@solana/web3.js";

// src/solana/static-markets.ts
import { PublicKey as PublicKey7 } from "@solana/web3.js";
var MAINNET_MARKETS = [
  { slabAddress: "7psyeWRts4pRX2cyAWD1NH87bR9ugXP7pe6ARgfG79Do", symbol: "SOL-PERP", name: "SOL/USDC Perpetual" }
];
var DEVNET_MARKETS = [
  // Populated from prior discoverMarkets() runs on devnet.
  // These serve as the tier-3 safety net for devnet users.
];
var STATIC_REGISTRY = {
  mainnet: MAINNET_MARKETS,
  devnet: DEVNET_MARKETS
};
var USER_MARKETS = {
  mainnet: [],
  devnet: []
};
function getStaticMarkets(network) {
  const builtin = STATIC_REGISTRY[network] ?? [];
  const user = USER_MARKETS[network] ?? [];
  if (user.length === 0) return [...builtin];
  const seen = /* @__PURE__ */ new Map();
  for (const entry of builtin) {
    seen.set(entry.slabAddress, entry);
  }
  for (const entry of user) {
    seen.set(entry.slabAddress, entry);
  }
  return [...seen.values()];
}
function registerStaticMarkets(network, entries) {
  const existing = USER_MARKETS[network];
  const seen = new Set(existing.map((e) => e.slabAddress));
  for (const entry of entries) {
    if (!entry.slabAddress) continue;
    if (seen.has(entry.slabAddress)) continue;
    try {
      new PublicKey7(entry.slabAddress);
    } catch {
      console.warn(
        `[registerStaticMarkets] Skipping invalid slabAddress: ${entry.slabAddress}`
      );
      continue;
    }
    seen.add(entry.slabAddress);
    existing.push(entry);
  }
}
function clearStaticMarkets(network) {
  if (network) {
    USER_MARKETS[network] = [];
  } else {
    USER_MARKETS.mainnet = [];
    USER_MARKETS.devnet = [];
  }
}

// src/solana/discovery.ts
var ENGINE_BITMAP_OFF_V0 = 320;
var MAGIC_BYTES = new Uint8Array([84, 65, 76, 79, 67, 82, 69, 80]);
var V17_MAGIC_BYTES = new Uint8Array([0, 54, 49, 86, 67, 82, 69, 80]);
var SLAB_TIERS = {
  small: SLAB_TIERS_V12_17["small"],
  medium: SLAB_TIERS_V12_17["medium"],
  large: SLAB_TIERS_V12_17["large"]
};
var SLAB_TIERS_V0 = {
  small: { maxAccounts: 256, dataSize: 62808, label: "Small", description: "256 slots \xB7 ~0.44 SOL" },
  medium: { maxAccounts: 1024, dataSize: 248760, label: "Medium", description: "1,024 slots \xB7 ~1.73 SOL" },
  large: { maxAccounts: 4096, dataSize: 992568, label: "Large", description: "4,096 slots \xB7 ~6.90 SOL" }
};
var SLAB_TIERS_V1D = {
  micro: { maxAccounts: 64, dataSize: 17064, label: "Micro", description: "64 slots (V1D devnet)" },
  small: { maxAccounts: 256, dataSize: 65088, label: "Small", description: "256 slots (V1D devnet)" },
  medium: { maxAccounts: 1024, dataSize: 257184, label: "Medium", description: "1,024 slots (V1D devnet)" },
  large: { maxAccounts: 4096, dataSize: 1025568, label: "Large", description: "4,096 slots (V1D devnet)" }
};
var SLAB_TIERS_V1D_LEGACY = {
  micro: { maxAccounts: 64, dataSize: 17080, label: "Micro", description: "64 slots (V1D legacy, postBitmap=18)" },
  small: { maxAccounts: 256, dataSize: 65104, label: "Small", description: "256 slots (V1D legacy, postBitmap=18)" },
  medium: { maxAccounts: 1024, dataSize: 257200, label: "Medium", description: "1,024 slots (V1D legacy, postBitmap=18)" },
  large: { maxAccounts: 4096, dataSize: 1025584, label: "Large", description: "4,096 slots (V1D legacy, postBitmap=18)" }
};
var SLAB_TIERS_V1 = SLAB_TIERS;
var SLAB_TIERS_V_ADL_DISCOVERY = SLAB_TIERS_V_ADL;
function slabDataSize(maxAccounts) {
  const ENGINE_OFF_V0 = 480;
  const ENGINE_BITMAP_OFF_V02 = 320;
  const ACCOUNT_SIZE_V0 = 240;
  const bitmapBytes = Math.ceil(maxAccounts / 64) * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = ENGINE_BITMAP_OFF_V02 + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOff = Math.ceil(preAccountsLen / 8) * 8;
  return ENGINE_OFF_V0 + accountsOff + maxAccounts * ACCOUNT_SIZE_V0;
}
function slabDataSizeV1(maxAccounts) {
  const ENGINE_OFF_V1 = 640;
  const ENGINE_BITMAP_OFF_V1 = 656;
  const ACCOUNT_SIZE_V1 = 248;
  const bitmapBytes = Math.ceil(maxAccounts / 64) * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = ENGINE_BITMAP_OFF_V1 + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOff = Math.ceil(preAccountsLen / 8) * 8;
  return ENGINE_OFF_V1 + accountsOff + maxAccounts * ACCOUNT_SIZE_V1;
}
function validateSlabTierMatch(dataSize, programSlabLen) {
  return dataSize === programSlabLen;
}
var ALL_SLAB_SIZES = [
  ...Object.values(SLAB_TIERS).map((t) => t.dataSize),
  ...Object.values(SLAB_TIERS_V0).map((t) => t.dataSize),
  ...Object.values(SLAB_TIERS_V1D).map((t) => t.dataSize),
  ...Object.values(SLAB_TIERS_V1D_LEGACY).map((t) => t.dataSize),
  ...Object.values(SLAB_TIERS_V1M).map((t) => t.dataSize),
  ...Object.values(SLAB_TIERS_V_ADL).map((t) => t.dataSize)
];
var SLAB_DATA_SIZE = SLAB_TIERS.large.dataSize;
var HEADER_SLICE_LENGTH = 1940;
function dv2(data) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}
function readU16LE2(data, off) {
  return dv2(data).getUint16(off, true);
}
function readU64LE2(data, off) {
  return dv2(data).getBigUint64(off, true);
}
function readI64LE2(data, off) {
  return dv2(data).getBigInt64(off, true);
}
function readU128LE2(buf, offset) {
  const lo = readU64LE2(buf, offset);
  const hi = readU64LE2(buf, offset + 8);
  return hi << 64n | lo;
}
function readI128LE2(buf, offset) {
  const lo = readU64LE2(buf, offset);
  const hi = readU64LE2(buf, offset + 8);
  const unsigned = hi << 64n | lo;
  const SIGN_BIT = 1n << 127n;
  if (unsigned >= SIGN_BIT) return unsigned - (1n << 128n);
  return unsigned;
}
function parseEngineLight(data, layout, maxAccounts = 4096) {
  const isV0 = !layout || layout.version === 0;
  const base = layout ? layout.engineOff : 480;
  const bitmapOff = layout ? layout.engineBitmapOff : ENGINE_BITMAP_OFF_V0;
  const minLen = base + bitmapOff;
  if (data.length < minLen) {
    throw new Error(`Slab data too short for engine light parse: ${data.length} < ${minLen}`);
  }
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const numUsedOff = bitmapOff + bitmapWords * 8;
  const nextAccountIdOff = Math.ceil((numUsedOff + 2) / 8) * 8;
  const canReadNumUsed = data.length >= base + numUsedOff + 2;
  const canReadNextId = data.length >= base + nextAccountIdOff + 8;
  if (isV0) {
    return {
      vault: readU128LE2(data, base + 0),
      insuranceFund: {
        balance: readU128LE2(data, base + 16),
        feeRevenue: readU128LE2(data, base + 32),
        isolatedBalance: 0n,
        isolationBps: 0
      },
      currentSlot: readU64LE2(data, base + 104),
      fundingIndexQpbE6: readI128LE2(data, base + 112),
      lastFundingSlot: readU64LE2(data, base + 128),
      fundingRateBpsPerSlotLast: readI64LE2(data, base + 136),
      fundingRateE9: 0n,
      marketMode: null,
      lastCrankSlot: readU64LE2(data, base + 144),
      maxCrankStalenessSlots: readU64LE2(data, base + 152),
      totalOpenInterest: readU128LE2(data, base + 160),
      longOi: 0n,
      shortOi: 0n,
      cTot: readU128LE2(data, base + 176),
      pnlPosTot: readU128LE2(data, base + 192),
      pnlMaturedPosTot: 0n,
      liqCursor: readU16LE2(data, base + 208),
      gcCursor: readU16LE2(data, base + 210),
      lastSweepStartSlot: readU64LE2(data, base + 216),
      lastSweepCompleteSlot: readU64LE2(data, base + 224),
      crankCursor: readU16LE2(data, base + 232),
      sweepStartIdx: readU16LE2(data, base + 234),
      lifetimeLiquidations: readU64LE2(data, base + 240),
      lifetimeForceCloses: readU64LE2(data, base + 248),
      netLpPos: readI128LE2(data, base + 256),
      lpSumAbs: readU128LE2(data, base + 272),
      lpMaxAbs: readU128LE2(data, base + 288),
      lpMaxAbsSweep: 0n,
      emergencyOiMode: false,
      emergencyStartSlot: 0n,
      lastBreakerSlot: 0n,
      markPriceE6: 0n,
      // V0 engine has no mark_price field
      oraclePriceE6: 0n,
      fLongNum: 0n,
      fShortNum: 0n,
      negPnlAccountCount: 0n,
      fundPxLast: 0n,
      resolvedKLongTerminalDelta: 0n,
      resolvedKShortTerminalDelta: 0n,
      resolvedLivePrice: 0n,
      numUsedAccounts: canReadNumUsed ? readU16LE2(data, base + numUsedOff) : 0,
      nextAccountId: canReadNextId ? readU64LE2(data, base + nextAccountIdOff) : 0n
    };
  }
  const isV2 = layout?.version === 2;
  if (isV2) {
    return {
      vault: readU128LE2(data, base + 0),
      insuranceFund: {
        balance: readU128LE2(data, base + 16),
        feeRevenue: readU128LE2(data, base + 32),
        isolatedBalance: readU128LE2(data, base + 48),
        isolationBps: readU16LE2(data, base + 64)
      },
      currentSlot: readU64LE2(data, base + 352),
      fundingIndexQpbE6: readI128LE2(data, base + 360),
      lastFundingSlot: readU64LE2(data, base + 376),
      fundingRateBpsPerSlotLast: readI64LE2(data, base + 384),
      fundingRateE9: 0n,
      marketMode: null,
      lastCrankSlot: readU64LE2(data, base + 392),
      maxCrankStalenessSlots: readU64LE2(data, base + 400),
      totalOpenInterest: readU128LE2(data, base + 408),
      longOi: 0n,
      // V2 has no long_oi
      shortOi: 0n,
      // V2 has no short_oi
      cTot: readU128LE2(data, base + 424),
      pnlPosTot: readU128LE2(data, base + 440),
      pnlMaturedPosTot: 0n,
      liqCursor: readU16LE2(data, base + 456),
      gcCursor: readU16LE2(data, base + 458),
      lastSweepStartSlot: readU64LE2(data, base + 464),
      lastSweepCompleteSlot: readU64LE2(data, base + 472),
      crankCursor: readU16LE2(data, base + 480),
      sweepStartIdx: readU16LE2(data, base + 482),
      lifetimeLiquidations: readU64LE2(data, base + 488),
      lifetimeForceCloses: readU64LE2(data, base + 496),
      netLpPos: readI128LE2(data, base + 504),
      lpSumAbs: readU128LE2(data, base + 520),
      lpMaxAbs: readU128LE2(data, base + 536),
      lpMaxAbsSweep: readU128LE2(data, base + 552),
      emergencyOiMode: false,
      // V2 has no emergency OI fields
      emergencyStartSlot: 0n,
      lastBreakerSlot: 0n,
      markPriceE6: 0n,
      // V2 has no mark_price
      oraclePriceE6: 0n,
      fLongNum: 0n,
      fShortNum: 0n,
      negPnlAccountCount: 0n,
      fundPxLast: 0n,
      resolvedKLongTerminalDelta: 0n,
      resolvedKShortTerminalDelta: 0n,
      resolvedLivePrice: 0n,
      numUsedAccounts: canReadNumUsed ? readU16LE2(data, base + numUsedOff) : 0,
      nextAccountId: canReadNextId ? readU64LE2(data, base + nextAccountIdOff) : 0n
    };
  }
  if (layout !== null) {
    const l = layout;
    const hasInsuranceIsolation = l.engineInsuranceIsolatedOff >= 0 && l.engineInsuranceIsolationBpsOff >= 0;
    return {
      vault: readU128LE2(data, base + 0),
      insuranceFund: {
        balance: readU128LE2(data, base + l.engineInsuranceOff),
        feeRevenue: readU128LE2(data, base + l.engineInsuranceOff + 16),
        isolatedBalance: hasInsuranceIsolation ? readU128LE2(data, base + l.engineInsuranceIsolatedOff) : 0n,
        isolationBps: hasInsuranceIsolation ? readU16LE2(data, base + l.engineInsuranceIsolationBpsOff) : 0
      },
      currentSlot: readU64LE2(data, base + l.engineCurrentSlotOff),
      fundingIndexQpbE6: readI128LE2(data, base + l.engineFundingIndexOff),
      lastFundingSlot: readU64LE2(data, base + l.engineLastFundingSlotOff),
      fundingRateBpsPerSlotLast: readI64LE2(data, base + l.engineFundingRateBpsOff),
      fundingRateE9: 0n,
      marketMode: null,
      lastCrankSlot: readU64LE2(data, base + l.engineLastCrankSlotOff),
      maxCrankStalenessSlots: readU64LE2(data, base + l.engineMaxCrankStalenessOff),
      totalOpenInterest: readU128LE2(data, base + l.engineTotalOiOff),
      longOi: l.engineLongOiOff >= 0 ? readU128LE2(data, base + l.engineLongOiOff) : 0n,
      shortOi: l.engineShortOiOff >= 0 ? readU128LE2(data, base + l.engineShortOiOff) : 0n,
      cTot: readU128LE2(data, base + l.engineCTotOff),
      pnlPosTot: readU128LE2(data, base + l.enginePnlPosTotOff),
      pnlMaturedPosTot: 0n,
      liqCursor: readU16LE2(data, base + l.engineLiqCursorOff),
      gcCursor: readU16LE2(data, base + l.engineGcCursorOff),
      lastSweepStartSlot: readU64LE2(data, base + l.engineLastSweepStartOff),
      lastSweepCompleteSlot: readU64LE2(data, base + l.engineLastSweepCompleteOff),
      crankCursor: readU16LE2(data, base + l.engineCrankCursorOff),
      sweepStartIdx: readU16LE2(data, base + l.engineSweepStartIdxOff),
      lifetimeLiquidations: readU64LE2(data, base + l.engineLifetimeLiquidationsOff),
      lifetimeForceCloses: readU64LE2(data, base + l.engineLifetimeForceClosesOff),
      netLpPos: readI128LE2(data, base + l.engineNetLpPosOff),
      lpSumAbs: readU128LE2(data, base + l.engineLpSumAbsOff),
      lpMaxAbs: readU128LE2(data, base + l.engineLpMaxAbsOff),
      lpMaxAbsSweep: readU128LE2(data, base + l.engineLpMaxAbsSweepOff),
      emergencyOiMode: l.engineEmergencyOiModeOff >= 0 ? data[base + l.engineEmergencyOiModeOff] !== 0 : false,
      emergencyStartSlot: l.engineEmergencyStartSlotOff >= 0 ? readU64LE2(data, base + l.engineEmergencyStartSlotOff) : 0n,
      lastBreakerSlot: l.engineLastBreakerSlotOff >= 0 ? readU64LE2(data, base + l.engineLastBreakerSlotOff) : 0n,
      markPriceE6: l.engineMarkPriceOff >= 0 ? readU64LE2(data, base + l.engineMarkPriceOff) : 0n,
      oraclePriceE6: 0n,
      fLongNum: 0n,
      fShortNum: 0n,
      negPnlAccountCount: 0n,
      fundPxLast: 0n,
      resolvedKLongTerminalDelta: 0n,
      resolvedKShortTerminalDelta: 0n,
      resolvedLivePrice: 0n,
      numUsedAccounts: canReadNumUsed ? readU16LE2(data, base + numUsedOff) : 0,
      nextAccountId: canReadNextId ? readU64LE2(data, base + nextAccountIdOff) : 0n
    };
  }
  throw new Error(`parseEngineLight: unrecognized slab layout (isV0=${isV0}, isV2=${isV2})`);
}
function isRateLimitError(err) {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("too many requests");
}
function withJitter(delayMs) {
  const half = Math.floor(delayMs / 2);
  return half + Math.floor(Math.random() * (delayMs - half + 1));
}
async function discoverMarkets(connection, programId, options = {}) {
  const {
    sequential = false,
    interTierDelayMs = 200,
    rateLimitBackoffMs = [1e3, 3e3, 9e3, 27e3],
    maxParallelTiers = 6
  } = options;
  const ALL_TIERS_RAW = [
    ...Object.values(SLAB_TIERS),
    // v12.17 (default)
    ...Object.values(SLAB_TIERS_V12_19),
    // v12.19 (deployed mainnet)
    ...Object.values(SLAB_TIERS_V12_17),
    // v12.17 (explicit)
    ...Object.values(SLAB_TIERS_V12_15),
    // v12.15
    ...Object.values(SLAB_TIERS_V12_1),
    // v12.1
    ...Object.values(SLAB_TIERS_V0),
    ...Object.values(SLAB_TIERS_V1D),
    ...Object.values(SLAB_TIERS_V1D_LEGACY),
    ...Object.values(SLAB_TIERS_V2),
    ...Object.values(SLAB_TIERS_V1M),
    ...Object.values(SLAB_TIERS_V1M2),
    ...Object.values(SLAB_TIERS_V_ADL),
    ...Object.values(SLAB_TIERS_V_SETDEXPOOL)
  ];
  const tierBySize = /* @__PURE__ */ new Map();
  for (const tier of ALL_TIERS_RAW) {
    const existing = tierBySize.get(tier.dataSize);
    if (!existing || tier.maxAccounts > existing.maxAccounts) {
      tierBySize.set(tier.dataSize, tier);
    }
  }
  const ALL_TIERS = [...tierBySize.values()];
  let rawAccounts = [];
  async function fetchTierWithRetry(tier) {
    for (let attempt = 0; attempt <= rateLimitBackoffMs.length; attempt++) {
      try {
        const results = await connection.getProgramAccounts(programId, {
          filters: [{ dataSize: tier.dataSize }],
          dataSlice: { offset: 0, length: HEADER_SLICE_LENGTH }
        });
        return results.map((entry) => ({ ...entry, maxAccounts: tier.maxAccounts, dataSize: tier.dataSize }));
      } catch (err) {
        if (isRateLimitError(err) && attempt < rateLimitBackoffMs.length) {
          const delay = withJitter(rateLimitBackoffMs[attempt]);
          console.warn(
            `[discoverMarkets] 429 on tier dataSize=${tier.dataSize} attempt=${attempt + 1}, backing off ${delay}ms`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        console.warn(
          `[discoverMarkets] Tier query failed (dataSize=${tier.dataSize}, attempt=${attempt + 1}):`,
          err instanceof Error ? err.message : err
        );
        return [];
      }
    }
    return [];
  }
  const maxTierQueries = options.maxTierQueries ?? ALL_TIERS.length;
  const tiersToQuery = ALL_TIERS.slice(0, maxTierQueries);
  const effectiveMaxParallelTiers = Math.max(1, Number.isFinite(maxParallelTiers) ? maxParallelTiers : 6);
  try {
    if (sequential) {
      for (let i = 0; i < tiersToQuery.length; i++) {
        const tier = tiersToQuery[i];
        const entries = await fetchTierWithRetry(tier);
        rawAccounts.push(...entries);
        if (i < tiersToQuery.length - 1) {
          await new Promise((r) => setTimeout(r, interTierDelayMs));
        }
      }
    } else {
      for (let offset = 0; offset < tiersToQuery.length; offset += effectiveMaxParallelTiers) {
        const chunk = tiersToQuery.slice(offset, offset + effectiveMaxParallelTiers);
        const queries = chunk.map(
          (tier) => connection.getProgramAccounts(programId, {
            filters: [{ dataSize: tier.dataSize }],
            dataSlice: { offset: 0, length: HEADER_SLICE_LENGTH }
          }).then(
            (results2) => results2.map((entry) => ({
              ...entry,
              maxAccounts: tier.maxAccounts,
              dataSize: tier.dataSize
            }))
          )
        );
        const results = await Promise.allSettled(queries);
        for (const result of results) {
          if (result.status === "fulfilled") {
            for (const entry of result.value) {
              rawAccounts.push(entry);
            }
          } else {
            console.warn(
              "[discoverMarkets] Tier query rejected:",
              result.reason instanceof Error ? result.reason.message : result.reason
            );
          }
        }
      }
    }
    try {
      const v17Results = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: Buffer.from(V17_MAGIC_BYTES).toString("base64"),
              encoding: "base64"
            }
          }
        ],
        dataSlice: { offset: 0, length: HEADER_SLICE_LENGTH }
      });
      for (const e of v17Results) {
        rawAccounts.push({ ...e, maxAccounts: 0, dataSize: e.account.data.length });
      }
    } catch {
    }
    if (rawAccounts.length === 0) {
      console.warn("[discoverMarkets] dataSize filters returned 0 markets, falling back to memcmp");
      const fallback = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: "F6P2QNqpQV5"
              // base58 of TALOCREP (u64 LE magic)
            }
          }
        ]
      });
      rawAccounts = [...fallback].map((e) => {
        const len = e.account.data.length;
        const lay = detectSlabLayout(len, new Uint8Array(e.account.data));
        return { ...e, maxAccounts: lay?.maxAccounts ?? 4096, dataSize: len };
      });
    }
  } catch (err) {
    console.warn(
      "[discoverMarkets] dataSize filters failed, falling back to memcmp:",
      err instanceof Error ? err.message : err
    );
    try {
      const fallback = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: "F6P2QNqpQV5"
              // base58 of TALOCREP (u64 LE magic)
            }
          }
        ]
      });
      rawAccounts = [...fallback].map((e) => {
        const len = e.account.data.length;
        const lay = detectSlabLayout(len, new Uint8Array(e.account.data));
        return { ...e, maxAccounts: lay?.maxAccounts ?? 4096, dataSize: len };
      });
    } catch (memcmpErr) {
      console.warn(
        "[discoverMarkets] memcmp fallback also failed:",
        memcmpErr instanceof Error ? memcmpErr.message : memcmpErr
      );
    }
  }
  if (rawAccounts.length === 0 && options.apiBaseUrl) {
    console.warn(
      "[discoverMarkets] RPC discovery returned 0 markets, falling back to REST API"
    );
    try {
      const apiResult = await discoverMarketsViaApi(
        connection,
        programId,
        options.apiBaseUrl,
        { timeoutMs: options.apiTimeoutMs }
      );
      if (apiResult.length > 0) {
        return apiResult;
      }
      console.warn(
        "[discoverMarkets] REST API returned 0 markets, checking tier-3 static bundle"
      );
    } catch (apiErr) {
      console.warn(
        "[discoverMarkets] API fallback also failed:",
        apiErr instanceof Error ? apiErr.message : apiErr
      );
    }
  }
  if (rawAccounts.length === 0 && options.network) {
    const staticEntries = getStaticMarkets(options.network);
    if (staticEntries.length > 0) {
      console.warn(
        `[discoverMarkets] Tier 1+2 failed, falling back to static bundle (${staticEntries.length} addresses for ${options.network})`
      );
      try {
        return await discoverMarketsViaStaticBundle(
          connection,
          programId,
          staticEntries
        );
      } catch (staticErr) {
        console.warn(
          "[discoverMarkets] Static bundle fallback also failed:",
          staticErr instanceof Error ? staticErr.message : staticErr
        );
      }
    } else {
      console.warn(
        `[discoverMarkets] Static bundle has 0 entries for ${options.network} \u2014 skipping tier 3`
      );
    }
  }
  const accounts = rawAccounts;
  const markets = [];
  const seenPubkeys = /* @__PURE__ */ new Set();
  for (const { pubkey, account, maxAccounts, dataSize } of accounts) {
    const pkStr = pubkey.toBase58();
    if (seenPubkeys.has(pkStr)) continue;
    seenPubkeys.add(pkStr);
    const data = new Uint8Array(account.data);
    if (isV17MarketAccount(data)) {
      try {
        const configV17 = parseWrapperConfigV17(data);
        markets.push({
          slabAddress: pubkey,
          programId,
          header: {},
          config: {},
          engine: {},
          params: {},
          configV17
        });
      } catch (err) {
        console.warn(
          `[discoverMarkets] Failed to parse v17 account ${pkStr}:`,
          err instanceof Error ? err.message : err
        );
      }
      continue;
    }
    let valid = true;
    for (let i = 0; i < MAGIC_BYTES.length; i++) {
      if (data[i] !== MAGIC_BYTES[i]) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    const layout = detectSlabLayout(dataSize, data);
    if (!layout) {
      console.warn(
        `[discoverMarkets] Skipping account ${pkStr}: unrecognized layout for dataSize=${dataSize}`
      );
      continue;
    }
    try {
      const header = parseHeader(data);
      const config = parseConfig(data, layout);
      const engine = parseEngineLight(data, layout, maxAccounts);
      const params = parseParams(data, layout);
      markets.push({ slabAddress: pubkey, programId, header, config, engine, params });
    } catch (err) {
      console.warn(
        `[discoverMarkets] Failed to parse account ${pubkey.toBase58()}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return markets;
}
async function getMarketsByAddress(connection, programId, addresses, options = {}) {
  if (addresses.length === 0) return [];
  const {
    batchSize = 100,
    interBatchDelayMs = 0
  } = options;
  const effectiveBatchSize = Math.max(1, Math.min(batchSize, 100));
  const fetched = [];
  for (let offset = 0; offset < addresses.length; offset += effectiveBatchSize) {
    const batch = addresses.slice(offset, offset + effectiveBatchSize);
    const response = await connection.getMultipleAccountsInfo(batch);
    for (let i = 0; i < batch.length; i++) {
      const info = response[i];
      if (info && info.data) {
        if (!info.owner.equals(programId)) {
          console.warn(
            `[getMarketsByAddress] Skipping ${batch[i].toBase58()}: owner mismatch (expected ${programId.toBase58()}, got ${info.owner.toBase58()})`
          );
          continue;
        }
        fetched.push({ pubkey: batch[i], data: info.data });
      }
    }
    if (interBatchDelayMs > 0 && offset + effectiveBatchSize < addresses.length) {
      await new Promise((r) => setTimeout(r, interBatchDelayMs));
    }
  }
  const markets = [];
  for (const entry of fetched) {
    if (!entry) continue;
    const { pubkey, data: rawData } = entry;
    const data = new Uint8Array(rawData);
    if (isV17MarketAccount(data)) {
      try {
        const configV17 = parseWrapperConfigV17(data);
        markets.push({
          slabAddress: pubkey,
          programId,
          header: {},
          config: {},
          engine: {},
          params: {},
          configV17
        });
      } catch (err) {
        console.warn(
          `[getMarketsByAddress] Failed to parse v17 account ${pubkey.toBase58()}:`,
          err instanceof Error ? err.message : err
        );
      }
      continue;
    }
    let valid = true;
    for (let i = 0; i < MAGIC_BYTES.length; i++) {
      if (data[i] !== MAGIC_BYTES[i]) {
        valid = false;
        break;
      }
    }
    if (!valid) {
      console.warn(
        `[getMarketsByAddress] Skipping ${pubkey.toBase58()}: invalid magic bytes`
      );
      continue;
    }
    const layout = detectSlabLayout(data.length, data);
    if (!layout) {
      console.warn(
        `[getMarketsByAddress] Skipping ${pubkey.toBase58()}: unrecognized layout for dataSize=${data.length}`
      );
      continue;
    }
    try {
      const header = parseHeader(data);
      const config = parseConfig(data, layout);
      const engine = parseEngineLight(data, layout, layout.maxAccounts);
      const params = parseParams(data, layout);
      markets.push({ slabAddress: pubkey, programId, header, config, engine, params });
    } catch (err) {
      console.warn(
        `[getMarketsByAddress] Failed to parse account ${pubkey.toBase58()}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return markets;
}
async function discoverMarketsViaApi(connection, programId, apiBaseUrl, options = {}) {
  const { timeoutMs = 1e4, onChainOptions } = options;
  const base = apiBaseUrl.replace(/\/+$/, "");
  const url = `${base}/markets`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(
      `[discoverMarketsViaApi] API returned ${response.status} ${response.statusText} from ${url}`
    );
  }
  const body = await response.json();
  const apiMarkets = body.markets;
  if (!Array.isArray(apiMarkets) || apiMarkets.length === 0) {
    console.warn("[discoverMarketsViaApi] API returned 0 markets");
    return [];
  }
  const addresses = [];
  for (const entry of apiMarkets) {
    if (!entry.slab_address || typeof entry.slab_address !== "string") continue;
    try {
      addresses.push(new PublicKey8(entry.slab_address));
    } catch {
      console.warn(
        `[discoverMarketsViaApi] Skipping invalid slab address: ${entry.slab_address}`
      );
    }
  }
  if (addresses.length === 0) {
    console.warn("[discoverMarketsViaApi] No valid slab addresses from API");
    return [];
  }
  console.log(
    `[discoverMarketsViaApi] API returned ${addresses.length} slab addresses, fetching on-chain data`
  );
  return getMarketsByAddress(connection, programId, addresses, onChainOptions);
}
async function discoverMarketsViaStaticBundle(connection, programId, entries, options = {}) {
  if (entries.length === 0) return [];
  const addresses = [];
  for (const entry of entries) {
    if (!entry.slabAddress || typeof entry.slabAddress !== "string") continue;
    try {
      addresses.push(new PublicKey8(entry.slabAddress));
    } catch {
      console.warn(
        `[discoverMarketsViaStaticBundle] Skipping invalid slab address: ${entry.slabAddress}`
      );
    }
  }
  if (addresses.length === 0) {
    console.warn("[discoverMarketsViaStaticBundle] No valid slab addresses in static bundle");
    return [];
  }
  console.log(
    `[discoverMarketsViaStaticBundle] Fetching ${addresses.length} slab addresses on-chain`
  );
  return getMarketsByAddress(connection, programId, addresses, options.onChainOptions);
}

// src/solana/dex-oracle.ts
import { PublicKey as PublicKey9 } from "@solana/web3.js";
function detectDexType(ownerProgramId) {
  if (ownerProgramId.equals(PUMPSWAP_PROGRAM_ID)) return "pumpswap";
  if (ownerProgramId.equals(RAYDIUM_CLMM_PROGRAM_ID)) return "raydium-clmm";
  if (ownerProgramId.equals(METEORA_DLMM_PROGRAM_ID)) return "meteora-dlmm";
  return null;
}
function parseDexPool(dexType, poolAddress, data) {
  switch (dexType) {
    case "pumpswap":
      return parsePumpSwapPool(poolAddress, data);
    case "raydium-clmm":
      return parseRaydiumClmmPool(poolAddress, data);
    case "meteora-dlmm":
      return parseMeteoraPool(poolAddress, data);
  }
}
function computeDexSpotPriceE6(dexType, data, vaultData, decimals) {
  switch (dexType) {
    case "pumpswap":
      if (!vaultData) throw new Error("PumpSwap requires vaultData (base and quote vault accounts)");
      return computePumpSwapPriceE6(data, vaultData);
    case "raydium-clmm":
      return computeRaydiumClmmPriceE6(data);
    case "meteora-dlmm":
      if (!decimals) {
        throw new Error("Meteora DLMM requires decimals { base, quote } (mint decimals)");
      }
      return computeMeteoraDlmmPriceE6(data, decimals.base, decimals.quote);
  }
}
var PUMPSWAP_MIN_LEN = 195;
function parsePumpSwapPool(poolAddress, data) {
  if (data.length < PUMPSWAP_MIN_LEN) {
    throw new Error(`PumpSwap pool data too short: ${data.length} < ${PUMPSWAP_MIN_LEN}`);
  }
  return {
    dexType: "pumpswap",
    poolAddress,
    baseMint: new PublicKey9(data.slice(35, 67)),
    quoteMint: new PublicKey9(data.slice(67, 99)),
    baseVault: new PublicKey9(data.slice(131, 163)),
    quoteVault: new PublicKey9(data.slice(163, 195))
  };
}
var SPL_TOKEN_AMOUNT_MIN_LEN = 72;
function computePumpSwapPriceE6(_poolData, vaultData) {
  if (vaultData.base.length < SPL_TOKEN_AMOUNT_MIN_LEN) {
    throw new Error(`PumpSwap base vault data too short: ${vaultData.base.length} < ${SPL_TOKEN_AMOUNT_MIN_LEN}`);
  }
  if (vaultData.quote.length < SPL_TOKEN_AMOUNT_MIN_LEN) {
    throw new Error(`PumpSwap quote vault data too short: ${vaultData.quote.length} < ${SPL_TOKEN_AMOUNT_MIN_LEN}`);
  }
  const baseDv = new DataView(vaultData.base.buffer, vaultData.base.byteOffset, vaultData.base.byteLength);
  const quoteDv = new DataView(vaultData.quote.buffer, vaultData.quote.byteOffset, vaultData.quote.byteLength);
  const baseAmount = readU64LE3(baseDv, 64);
  const quoteAmount = readU64LE3(quoteDv, 64);
  if (baseAmount === 0n) return 0n;
  return quoteAmount * 1000000n / baseAmount;
}
var RAYDIUM_CLMM_MIN_LEN = 269;
function parseRaydiumClmmPool(poolAddress, data) {
  if (data.length < RAYDIUM_CLMM_MIN_LEN) {
    throw new Error(`Raydium CLMM pool data too short: ${data.length} < ${RAYDIUM_CLMM_MIN_LEN}`);
  }
  return {
    dexType: "raydium-clmm",
    poolAddress,
    baseMint: new PublicKey9(data.slice(73, 105)),
    quoteMint: new PublicKey9(data.slice(105, 137))
  };
}
var MAX_TOKEN_DECIMALS = 24;
function assertTokenDecimals(dexName, label, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_TOKEN_DECIMALS) {
    throw new Error(
      `${dexName}: ${label} decimals out of range (${decimals}); expected integer 0..${MAX_TOKEN_DECIMALS}`
    );
  }
}
function computeRaydiumClmmPriceE6(data) {
  if (data.length < RAYDIUM_CLMM_MIN_LEN) {
    throw new Error(`Raydium CLMM data too short: ${data.length} < ${RAYDIUM_CLMM_MIN_LEN}`);
  }
  const dv3 = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decimals0 = data[233];
  const decimals1 = data[234];
  if (decimals0 > MAX_TOKEN_DECIMALS || decimals1 > MAX_TOKEN_DECIMALS) {
    throw new Error(
      `Raydium CLMM: decimals out of range (${decimals0}, ${decimals1}); max ${MAX_TOKEN_DECIMALS}`
    );
  }
  const sqrtPriceX64 = readU128LE3(dv3, 253);
  if (sqrtPriceX64 === 0n) return 0n;
  const sq1e6 = sqrtPriceX64 * sqrtPriceX64 * 1000000n;
  const decimalDiff = 6 + decimals0 - decimals1;
  const adjustedDiff = decimalDiff - 6;
  if (adjustedDiff >= 0) {
    return sq1e6 * 10n ** BigInt(adjustedDiff) >> 128n;
  } else {
    return sq1e6 / ((1n << 128n) * 10n ** BigInt(-adjustedDiff));
  }
}
var METEORA_DLMM_MIN_LEN = 145;
function parseMeteoraPool(poolAddress, data) {
  if (data.length < METEORA_DLMM_MIN_LEN) {
    throw new Error(`Meteora DLMM pool data too short: ${data.length} < ${METEORA_DLMM_MIN_LEN}`);
  }
  return {
    dexType: "meteora-dlmm",
    poolAddress,
    baseMint: new PublicKey9(data.slice(81, 113)),
    quoteMint: new PublicKey9(data.slice(113, 145))
  };
}
var MAX_BIN_STEP = 1e4;
var MAX_ACTIVE_ID_ABS = 5e5;
function computeMeteoraDlmmPriceE6(data, decimalsBase, decimalsQuote) {
  if (data.length < METEORA_DLMM_MIN_LEN) {
    throw new Error(`Meteora DLMM data too short: ${data.length} < ${METEORA_DLMM_MIN_LEN}`);
  }
  assertTokenDecimals("Meteora DLMM", "base", decimalsBase);
  assertTokenDecimals("Meteora DLMM", "quote", decimalsQuote);
  const dv3 = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const binStep = dv3.getUint16(73, true);
  const activeId = dv3.getInt32(76, true);
  if (binStep === 0) return 0n;
  if (binStep > MAX_BIN_STEP) {
    throw new Error(`Meteora DLMM: binStep ${binStep} exceeds max ${MAX_BIN_STEP}`);
  }
  if (Math.abs(activeId) > MAX_ACTIVE_ID_ABS) {
    throw new Error(
      `Meteora DLMM: |activeId| ${Math.abs(activeId)} exceeds max ${MAX_ACTIVE_ID_ABS}`
    );
  }
  const SCALE = 1000000000000000000n;
  const base = SCALE + BigInt(binStep) * SCALE / 10000n;
  const isNeg = activeId < 0;
  let exp = isNeg ? BigInt(-activeId) : BigInt(activeId);
  let result = SCALE;
  let b = base;
  while (exp > 0n) {
    if (exp & 1n) {
      result = result * b / SCALE;
    }
    exp >>= 1n;
    if (exp > 0n) {
      b = b * b / SCALE;
    }
  }
  const diff = decimalsBase - decimalsQuote;
  if (isNeg) {
    if (result === 0n) return 0n;
    const num = 1000000000000000000000000n;
    if (diff >= 0) {
      return num * 10n ** BigInt(diff) / result;
    }
    return num / (result * 10n ** BigInt(-diff));
  } else {
    if (diff >= 0) {
      return result * 10n ** BigInt(diff) / 1000000000000n;
    }
    return result / (1000000000000n * 10n ** BigInt(-diff));
  }
}
function readU64LE3(dv3, offset) {
  const lo = BigInt(dv3.getUint32(offset, true));
  const hi = BigInt(dv3.getUint32(offset + 4, true));
  return lo | hi << 32n;
}
function readU128LE3(dv3, offset) {
  const lo = readU64LE3(dv3, offset);
  const hi = readU64LE3(dv3, offset + 8);
  return lo | hi << 64n;
}

// src/solana/oracle.ts
var CHAINLINK_MIN_SIZE = 224;
var MAX_DECIMALS = 18;
var CHAINLINK_DECIMALS_OFFSET = 138;
var CHAINLINK_ANSWER_OFFSET = 216;
function readU82(data, off) {
  return data[off];
}
function readBigInt64LE(data, off) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigInt64(off, true);
}
function parseChainlinkPrice(data) {
  if (data.length < CHAINLINK_MIN_SIZE) {
    throw new Error(
      `Oracle account data too small: ${data.length} bytes (need at least ${CHAINLINK_MIN_SIZE})`
    );
  }
  const decimals = readU82(data, CHAINLINK_DECIMALS_OFFSET);
  if (decimals > MAX_DECIMALS) {
    throw new Error(
      `Oracle decimals out of range: ${decimals} (max ${MAX_DECIMALS})`
    );
  }
  const price = readBigInt64LE(data, CHAINLINK_ANSWER_OFFSET);
  if (price <= 0n) {
    throw new Error(
      `Oracle price is non-positive: ${price}`
    );
  }
  return { price, decimals };
}
function isValidChainlinkOracle(data) {
  try {
    parseChainlinkPrice(data);
    return true;
  } catch {
    return false;
  }
}

// src/solana/token-program.ts
import { PublicKey as PublicKey10 } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID as TOKEN_PROGRAM_ID3 } from "@solana/spl-token";
var TOKEN_2022_PROGRAM_ID = new PublicKey10(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);
async function detectTokenProgram(connection, mint) {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint account not found: ${mint.toBase58()}`);
  if (info.owner.equals(TOKEN_PROGRAM_ID3)) return TOKEN_PROGRAM_ID3;
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  throw new Error(
    `Account ${mint.toBase58()} is not a token mint: owner ${info.owner.toBase58()} is neither SPL Token (${TOKEN_PROGRAM_ID3.toBase58()}) nor Token-2022 (${TOKEN_2022_PROGRAM_ID.toBase58()})`
  );
}
function isToken2022(tokenProgramId) {
  return tokenProgramId.equals(TOKEN_2022_PROGRAM_ID);
}
function isStandardToken(tokenProgramId) {
  return tokenProgramId.equals(TOKEN_PROGRAM_ID3);
}

// src/solana/stake.ts
import { PublicKey as PublicKey11, SystemProgram as SystemProgram2, SYSVAR_RENT_PUBKEY as SYSVAR_RENT_PUBKEY2, SYSVAR_CLOCK_PUBKEY as SYSVAR_CLOCK_PUBKEY2 } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID as TOKEN_PROGRAM_ID4, TOKEN_2022_PROGRAM_ID as TOKEN_2022_PROGRAM_ID2 } from "@solana/spl-token";
var STAKE_PROGRAM_IDS = {
  devnet: "6aJb1F9CDCVWCNYFwj8aQsVb696YnW6J1FznteHq4Q6k",
  mainnet: "DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F"
};
Object.freeze(STAKE_PROGRAM_IDS);
function getStakeProgramId(network) {
  if (!network) {
    const override = safeEnv("STAKE_PROGRAM_ID");
    if (override) {
      console.warn(
        `[percolator-sdk] STAKE_PROGRAM_ID env override active: ${override} \u2014 ensure this points to a trusted program`
      );
      return new PublicKey11(override);
    }
  }
  const detectedNetwork = network ?? (() => {
    const n = safeEnv("NEXT_PUBLIC_DEFAULT_NETWORK")?.toLowerCase() ?? safeEnv("NETWORK")?.toLowerCase() ?? "";
    if (n === "mainnet" || n === "mainnet-beta") return "mainnet";
    if (n === "devnet") return "devnet";
    if (typeof window !== "undefined") return "mainnet";
    return "devnet";
  })();
  const id = STAKE_PROGRAM_IDS[detectedNetwork];
  if (!id) {
    throw new Error(
      `Stake program not deployed on ${detectedNetwork}. Set STAKE_PROGRAM_ID env var or wait for DevOps to deploy and update STAKE_PROGRAM_IDS.mainnet.`
    );
  }
  return new PublicKey11(id);
}
var STAKE_PROGRAM_ID = new PublicKey11(STAKE_PROGRAM_IDS.devnet);
var STAKE_IX = {
  InitPool: 0,
  Deposit: 1,
  Withdraw: 2,
  FlushToInsurance: 3,
  UpdateConfig: 4,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  TransferAdmin: 5,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  AdminSetOracleAuthority: 6,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  AdminSetRiskThreshold: 7,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  AdminSetMaintenanceFee: 8,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  AdminResolveMarket: 9,
  /** Current on-chain tag 10: transfer withdrawn insurance back into the pool vault. */
  ReturnInsurance: 10,
  /** @deprecated Legacy alias for ReturnInsurance. */
  AdminWithdrawInsurance: 10,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  AdminSetInsurancePolicy: 11,
  /** PERC-272: Accrue trading fees to LP vault */
  AccrueFees: 12,
  /** PERC-272: Init pool in trading LP mode */
  InitTradingPool: 13,
  /** PERC-313: Set HWM config (enable + floor bps) */
  AdminSetHwmConfig: 14,
  /** PERC-303: Enable/configure senior-junior LP tranches */
  AdminSetTrancheConfig: 15,
  /** PERC-303: Deposit into junior (first-loss) tranche */
  DepositJunior: 16,
  /** Mark the pool as resolved after the wrapper market has been resolved directly. */
  SetMarketResolved: 18
};
Object.freeze(STAKE_IX);
var TEXT2 = new TextEncoder();
function deriveStakePool(slab, programId) {
  return PublicKey11.findProgramAddressSync(
    [TEXT2.encode("stake_pool"), slab.toBytes()],
    programId ?? getStakeProgramId()
  );
}
function deriveStakeVaultAuth(pool, programId) {
  return PublicKey11.findProgramAddressSync(
    [TEXT2.encode("vault_auth"), pool.toBytes()],
    programId ?? getStakeProgramId()
  );
}
function deriveDepositPda(pool, user, programId) {
  return PublicKey11.findProgramAddressSync(
    [TEXT2.encode("stake_deposit"), pool.toBytes(), user.toBytes()],
    programId ?? getStakeProgramId()
  );
}
function readU64LE4(data, off) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(
    off,
    /* littleEndian= */
    true
  );
}
function readU16LE3(data, off) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getUint16(
    off,
    /* littleEndian= */
    true
  );
}
function requireDiscriminator(accountName, data, offset, expected) {
  for (let i = 0; i < expected.length; i += 1) {
    if (data[offset + i] !== expected[i]) {
      throw new Error(`${accountName} invalid discriminator`);
    }
  }
}
function u64Le(v) {
  if (typeof v === "number" && !Number.isSafeInteger(v)) {
    throw new Error(`u64Le: number ${v} exceeds Number.MAX_SAFE_INTEGER \u2014 use BigInt`);
  }
  const big = BigInt(v);
  if (big < 0n) throw new Error(`u64Le: value must be non-negative, got ${big}`);
  if (big > 0xFFFFFFFFFFFFFFFFn) throw new Error(`u64Le: value exceeds u64 max`);
  const arr = new Uint8Array(8);
  new DataView(arr.buffer).setBigUint64(0, big, true);
  return arr;
}
function u16Le(v) {
  if (!Number.isInteger(v) || v < 0 || v > 65535) throw new Error(`u16Le: value out of u16 range (0..65535), got ${v}`);
  const arr = new Uint8Array(2);
  new DataView(arr.buffer).setUint16(0, v, true);
  return arr;
}
function encodeStakeInitPool(cooldownSlots, depositCap) {
  return concatBytes(
    new Uint8Array([STAKE_IX.InitPool]),
    u64Le(cooldownSlots),
    u64Le(depositCap)
  );
}
function encodeStakeDeposit(amount) {
  return concatBytes(new Uint8Array([STAKE_IX.Deposit]), u64Le(amount));
}
function encodeStakeWithdraw(lpAmount) {
  return concatBytes(new Uint8Array([STAKE_IX.Withdraw]), u64Le(lpAmount));
}
function encodeStakeFlushToInsurance(amount) {
  return concatBytes(new Uint8Array([STAKE_IX.FlushToInsurance]), u64Le(amount));
}
function encodeStakeUpdateConfig(newCooldownSlots, newDepositCap) {
  return concatBytes(
    new Uint8Array([STAKE_IX.UpdateConfig]),
    new Uint8Array([newCooldownSlots != null ? 1 : 0]),
    u64Le(newCooldownSlots ?? 0n),
    new Uint8Array([newDepositCap != null ? 1 : 0]),
    u64Le(newDepositCap ?? 0n)
  );
}
function removedStakeInstruction(name, tag) {
  throw new Error(
    `${name} (stake tag ${tag}) was removed on-chain in percolator-stake v3 and must not be sent.`
  );
}
function encodeStakeTransferAdmin() {
  return removedStakeInstruction("encodeStakeTransferAdmin", STAKE_IX.TransferAdmin);
}
function encodeStakeAdminSetOracleAuthority(newAuthority) {
  void newAuthority;
  return removedStakeInstruction("encodeStakeAdminSetOracleAuthority", STAKE_IX.AdminSetOracleAuthority);
}
function encodeStakeAdminSetRiskThreshold(newThreshold) {
  void newThreshold;
  return removedStakeInstruction("encodeStakeAdminSetRiskThreshold", STAKE_IX.AdminSetRiskThreshold);
}
function encodeStakeAdminSetMaintenanceFee(newFee) {
  void newFee;
  return removedStakeInstruction("encodeStakeAdminSetMaintenanceFee", STAKE_IX.AdminSetMaintenanceFee);
}
function encodeStakeAdminResolveMarket() {
  return removedStakeInstruction("encodeStakeAdminResolveMarket", STAKE_IX.AdminResolveMarket);
}
function encodeStakeReturnInsurance(amount) {
  return concatBytes(
    new Uint8Array([STAKE_IX.ReturnInsurance]),
    u64Le(amount)
  );
}
function encodeStakeAdminWithdrawInsurance(amount) {
  return encodeStakeReturnInsurance(amount);
}
function encodeStakeAccrueFees() {
  return new Uint8Array([STAKE_IX.AccrueFees]);
}
function encodeStakeInitTradingPool(cooldownSlots, depositCap) {
  return concatBytes(
    new Uint8Array([STAKE_IX.InitTradingPool]),
    u64Le(cooldownSlots),
    u64Le(depositCap)
  );
}
function encodeStakeAdminSetHwmConfig(enabled, hwmFloorBps) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminSetHwmConfig]),
    new Uint8Array([enabled ? 1 : 0]),
    u16Le(hwmFloorBps)
  );
}
function encodeStakeAdminSetTrancheConfig(juniorFeeMultBps) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminSetTrancheConfig]),
    u16Le(juniorFeeMultBps)
  );
}
function encodeStakeDepositJunior(amount) {
  return concatBytes(new Uint8Array([STAKE_IX.DepositJunior]), u64Le(amount));
}
function encodeStakeSetMarketResolved() {
  return new Uint8Array([STAKE_IX.SetMarketResolved]);
}
function encodeStakeAdminSetInsurancePolicy(authority, minWithdrawBase, maxWithdrawBps, cooldownSlots) {
  void authority;
  void minWithdrawBase;
  void maxWithdrawBps;
  void cooldownSlots;
  return removedStakeInstruction("encodeStakeAdminSetInsurancePolicy", STAKE_IX.AdminSetInsurancePolicy);
}
var STAKE_POOL_SIZE = 384;
var STAKE_POOL_DISCRIMINATOR = new Uint8Array([83, 80, 79, 79, 76, 95, 86, 49]);
var STAKE_POOL_CURRENT_VERSION = 2;
var STAKE_POOL_RESERVED_OFFSET = 320;
function decodeStakePool(data) {
  if (data.length < STAKE_POOL_SIZE) {
    throw new Error(`StakePool data too short: ${data.length} < ${STAKE_POOL_SIZE}`);
  }
  requireDiscriminator("StakePool", data, STAKE_POOL_RESERVED_OFFSET, STAKE_POOL_DISCRIMINATOR);
  const version = data[STAKE_POOL_RESERVED_OFFSET + 8];
  if (version !== STAKE_POOL_CURRENT_VERSION) {
    throw new Error(`StakePool unsupported version: ${version} !== ${STAKE_POOL_CURRENT_VERSION}`);
  }
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let off = 0;
  const isInitialized = bytes[off] === 1;
  off += 1;
  const bump = bytes[off];
  off += 1;
  const vaultAuthorityBump = bytes[off];
  off += 1;
  const adminTransferred = bytes[off] === 1;
  off += 1;
  off += 4;
  const slab = new PublicKey11(bytes.subarray(off, off + 32));
  off += 32;
  const admin = new PublicKey11(bytes.subarray(off, off + 32));
  off += 32;
  const collateralMint = new PublicKey11(bytes.subarray(off, off + 32));
  off += 32;
  const lpMint = new PublicKey11(bytes.subarray(off, off + 32));
  off += 32;
  const vault = new PublicKey11(bytes.subarray(off, off + 32));
  off += 32;
  const totalDeposited = readU64LE4(bytes, off);
  off += 8;
  const totalLpSupply = readU64LE4(bytes, off);
  off += 8;
  const cooldownSlots = readU64LE4(bytes, off);
  off += 8;
  const depositCap = readU64LE4(bytes, off);
  off += 8;
  const totalFlushed = readU64LE4(bytes, off);
  off += 8;
  const totalReturned = readU64LE4(bytes, off);
  off += 8;
  const totalWithdrawn = readU64LE4(bytes, off);
  off += 8;
  const percolatorProgram = new PublicKey11(bytes.subarray(off, off + 32));
  off += 32;
  const totalFeesEarned = readU64LE4(bytes, off);
  off += 8;
  const lastFeeAccrualSlot = readU64LE4(bytes, off);
  off += 8;
  const lastVaultSnapshot = readU64LE4(bytes, off);
  off += 8;
  const poolMode = bytes[off];
  off += 1;
  off += 7;
  const pendingAdminBytes = bytes.subarray(off, off + 32);
  off += 32;
  const pendingAdmin = pendingAdminBytes.every((b) => b === 0) ? null : new PublicKey11(pendingAdminBytes);
  const reservedStart = off;
  const marketResolved = bytes[reservedStart + 9] === 1;
  const hwmEnabled = bytes[reservedStart + 10] === 1;
  const hwmFloorBps = readU16LE3(bytes, reservedStart + 11);
  const epochHighWaterTvl = readU64LE4(bytes, reservedStart + 16);
  const hwmLastEpoch = readU64LE4(bytes, reservedStart + 24);
  const trancheEnabled = bytes[reservedStart + 32] === 1;
  const juniorBalance = readU64LE4(bytes, reservedStart + 33);
  const juniorTotalLp = readU64LE4(bytes, reservedStart + 41);
  const juniorFeeMultBps = readU16LE3(bytes, reservedStart + 49);
  return {
    isInitialized,
    bump,
    vaultAuthorityBump,
    adminTransferred,
    marketResolved,
    slab,
    admin,
    collateralMint,
    lpMint,
    vault,
    totalDeposited,
    totalLpSupply,
    cooldownSlots,
    depositCap,
    totalFlushed,
    totalReturned,
    totalWithdrawn,
    percolatorProgram,
    pendingAdmin,
    totalFeesEarned,
    lastFeeAccrualSlot,
    lastVaultSnapshot,
    poolMode,
    hwmEnabled,
    epochHighWaterTvl,
    hwmFloorBps,
    hwmLastEpoch,
    trancheEnabled,
    juniorBalance,
    juniorTotalLp,
    juniorFeeMultBps
  };
}
var STAKE_DEPOSIT_SIZE = 152;
var STAKE_DEPOSIT_DISCRIMINATOR = new Uint8Array([83, 68, 69, 80, 95, 86, 49, 0]);
var STAKE_DEPOSIT_RESERVED_OFFSET = 88;
function decodeDepositPda(data) {
  if (data.length < STAKE_DEPOSIT_SIZE) {
    throw new Error(`StakeDeposit data too short: ${data.length} < ${STAKE_DEPOSIT_SIZE}`);
  }
  requireDiscriminator("StakeDeposit", data, STAKE_DEPOSIT_RESERVED_OFFSET, STAKE_DEPOSIT_DISCRIMINATOR);
  return {
    isInitialized: data[0] === 1,
    bump: data[1],
    pool: new PublicKey11(data.subarray(8, 40)),
    user: new PublicKey11(data.subarray(40, 72)),
    lastDepositSlot: readU64LE4(data, 72),
    lpAmount: readU64LE4(data, 80)
  };
}
function initPoolAccounts(a, tokenProgramId = TOKEN_PROGRAM_ID4) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: true },
    { pubkey: a.slab, isSigner: false, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.collateralMint, isSigner: false, isWritable: false },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: SystemProgram2.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY2, isSigner: false, isWritable: false }
  ];
}
function depositAccounts(a, tokenProgramId = TOKEN_PROGRAM_ID4) {
  return [
    { pubkey: a.user, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.userCollateralAta, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.userLpAta, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.depositPda, isSigner: false, isWritable: true },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY2, isSigner: false, isWritable: false },
    { pubkey: SystemProgram2.programId, isSigner: false, isWritable: false }
  ];
}
function withdrawAccounts(a, tokenProgramId = TOKEN_PROGRAM_ID4) {
  return [
    { pubkey: a.user, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.userLpAta, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.userCollateralAta, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.depositPda, isSigner: false, isWritable: true },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY2, isSigner: false, isWritable: false }
  ];
}
function flushToInsuranceAccounts(a, tokenProgramId = TOKEN_PROGRAM_ID4) {
  return [
    { pubkey: a.caller, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVault, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false }
  ];
}

// src/solana/adl.ts
var V17_ADL_UNSUPPORTED_MESSAGE = "buildAdlInstruction: ExecuteAdl transaction building is not supported by the v17 SDK because ExecuteAdl is not accepted by the v17 wrapper. Use ranking/API helpers only, or use a version-specific SDK for deployed legacy ADL.";
function computePnlPct(pnl, capital) {
  if (capital === 0n) return 0n;
  return pnl * 10000n / capital;
}
function isAdlTriggered(slabData) {
  const layout = detectSlabLayout(slabData.length, slabData);
  if (!layout) return false;
  try {
    const engine = parseEngine(slabData);
    if (engine.pnlPosTot === 0n) return false;
    const config = parseConfig(slabData, layout);
    if (config.maxPnlCap === 0n) return false;
    return engine.pnlPosTot > config.maxPnlCap;
  } catch {
    return false;
  }
}
async function fetchAdlRankedPositions(connection, slab) {
  const data = await fetchSlab(connection, slab);
  return rankAdlPositions(data);
}
function rankAdlPositions(slabData) {
  const layout = detectSlabLayout(slabData.length, slabData);
  let pnlPosTot = 0n;
  try {
    const engine = parseEngine(slabData);
    pnlPosTot = engine.pnlPosTot;
  } catch (err) {
    console.warn(
      `[rankAdlPositions] parseEngine failed:`,
      err instanceof Error ? err.message : err
    );
  }
  let maxPnlCap = 0n;
  let isTriggered = false;
  if (layout) {
    try {
      const config = parseConfig(slabData, layout);
      maxPnlCap = config.maxPnlCap;
      isTriggered = maxPnlCap > 0n && pnlPosTot > maxPnlCap;
    } catch {
    }
  }
  const accounts = parseAllAccounts(slabData);
  const positions = [];
  for (const { idx, account } of accounts) {
    if (account.kind !== 0 /* User */) continue;
    if (account.positionSize === 0n) continue;
    const side = account.positionSize > 0n ? "long" : "short";
    const pnlPct = computePnlPct(account.pnl, account.capital);
    positions.push({
      idx,
      owner: account.owner,
      positionSize: account.positionSize,
      pnl: account.pnl,
      capital: account.capital,
      pnlPct,
      side,
      adlRank: -1
      // assigned below
    });
  }
  const longs = positions.filter((p) => p.side === "long").sort((a, b) => b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0);
  longs.forEach((p, i) => {
    p.adlRank = i;
  });
  const shorts = positions.filter((p) => p.side === "short").sort((a, b) => b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0);
  shorts.forEach((p, i) => {
    p.adlRank = i;
  });
  const ranked = [...longs, ...shorts].sort(
    (a, b) => b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0
  );
  return { ranked, longs, shorts, isTriggered, pnlPosTot, maxPnlCap };
}
function buildAdlInstruction(_caller, _slab, _oracle, _programId, targetIdx, _backupOracles = []) {
  if (!Number.isInteger(targetIdx) || targetIdx < 0) {
    throw new Error(
      `buildAdlInstruction: targetIdx must be a non-negative integer, got ${targetIdx}`
    );
  }
  throw new Error(V17_ADL_UNSUPPORTED_MESSAGE);
}
async function buildAdlTransaction(connection, caller, slab, oracle, programId, preferSide, backupOracles = []) {
  const ranking = await fetchAdlRankedPositions(connection, slab);
  if (!ranking.isTriggered) return null;
  let target;
  if (preferSide === "long") {
    target = ranking.longs[0];
  } else if (preferSide === "short") {
    target = ranking.shorts[0];
  } else {
    target = ranking.ranked[0];
  }
  if (!target) return null;
  return buildAdlInstruction(caller, slab, oracle, programId, target.idx, backupOracles);
}
var ADL_EVENT_TAG = 0xAD1E0001n;
function parseAdlEvent(logs) {
  for (const line of logs) {
    if (typeof line !== "string") continue;
    const match = line.match(
      /^Program log: (\d+) (\d+) (\d+) (\d+) (\d+)$/
    );
    if (!match) continue;
    let tag;
    try {
      tag = BigInt(match[1]);
    } catch {
      continue;
    }
    if (tag !== ADL_EVENT_TAG) continue;
    try {
      const targetIdx = Number(BigInt(match[2]));
      const price = BigInt(match[3]);
      const closedLo = BigInt(match[4]);
      const closedHi = BigInt(match[5]);
      const closedAbs = closedHi << 64n | closedLo;
      return { tag, targetIdx, price, closedAbs };
    } catch {
      continue;
    }
  }
  return null;
}
async function fetchAdlRankings(apiBase, slab, fetchFn = fetch) {
  const slabStr = typeof slab === "string" ? slab : slab.toBase58();
  const base = apiBase.replace(/\/$/, "");
  const url = `${base}/api/adl/rankings?slab=${encodeURIComponent(slabStr)}`;
  const res = await fetchFn(url);
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
    }
    throw new Error(
      `fetchAdlRankings: HTTP ${res.status} from ${url}${body ? ` \u2014 ${body}` : ""}`
    );
  }
  const json = await res.json();
  if (typeof json !== "object" || json === null) {
    throw new Error("fetchAdlRankings: API returned non-object response");
  }
  const obj = json;
  if (!Array.isArray(obj.rankings)) {
    throw new Error("fetchAdlRankings: API response missing rankings array");
  }
  if (typeof obj.adlNeeded !== "boolean") {
    throw new Error(`fetchAdlRankings: invalid adlNeeded field: ${obj.adlNeeded}`);
  }
  if (typeof obj.capExceeded !== "boolean") {
    throw new Error(`fetchAdlRankings: invalid capExceeded field: ${obj.capExceeded}`);
  }
  if (typeof obj.slabAddress !== "string") {
    throw new Error(`fetchAdlRankings: invalid slabAddress field: ${obj.slabAddress}`);
  }
  if (typeof obj.pnlPosTot !== "string") {
    throw new Error(`fetchAdlRankings: invalid pnlPosTot field: ${obj.pnlPosTot}`);
  }
  if (typeof obj.maxPnlCap !== "string") {
    throw new Error(`fetchAdlRankings: invalid maxPnlCap field: ${obj.maxPnlCap}`);
  }
  for (const entry of obj.rankings) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("fetchAdlRankings: invalid ranking entry (not an object)");
    }
    const r = entry;
    if (typeof r.idx !== "number" || !Number.isInteger(r.idx) || r.idx < 0) {
      throw new Error(`fetchAdlRankings: invalid ranking idx: ${r.idx}`);
    }
  }
  return json;
}

// src/solana/rpc-pool.ts
import {
  Connection as Connection4
} from "@solana/web3.js";
async function checkRpcHealth(endpoint, timeoutMs = 5e3) {
  const start = performance.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
        params: [{ commitment: "processed" }]
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      return { endpoint, healthy: false, latencyMs, slot: 0, error: `HTTP ${res.status}` };
    }
    const json = await res.json();
    if (json?.error || typeof json?.result !== "number") {
      return {
        endpoint,
        healthy: false,
        latencyMs,
        slot: 0,
        error: json?.error?.message ?? "invalid getSlot response"
      };
    }
    return { endpoint, healthy: true, latencyMs, slot: json.result };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      endpoint,
      healthy: false,
      latencyMs,
      slot: 0,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
function resolveRetryConfig(cfg) {
  if (cfg === false) return null;
  const c = cfg ?? {};
  return {
    maxRetries: c.maxRetries ?? 3,
    baseDelayMs: c.baseDelayMs ?? 500,
    maxDelayMs: c.maxDelayMs ?? 1e4,
    jitterFactor: Math.max(0, Math.min(1, c.jitterFactor ?? 0.25)),
    retryableStatusCodes: c.retryableStatusCodes ?? [429, 502, 503, 504]
  };
}
function normalizeEndpoint(ep) {
  if (typeof ep === "string") return { url: ep };
  return ep;
}
function endpointLabel(ep) {
  if (ep.label) return ep.label;
  try {
    return new URL(ep.url).hostname;
  } catch {
    return ep.url.slice(0, 40);
  }
}
function isRetryable(err, codes) {
  if (!err) return false;
  const errName = err?.name;
  if (errName === "AbortError" || errName === "TimeoutError") return false;
  const msg = err instanceof Error ? err.message : String(err);
  for (const code of codes) {
    const pattern = new RegExp(`(?<![0-9])${code}(?![0-9])`);
    if (pattern.test(msg)) return true;
  }
  const lower = msg.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("too many requests") || lower.includes("bad gateway") || lower.includes("service unavailable") || lower.includes("econnreset") || lower.includes("econnrefused") || lower.includes("socket hang up") || lower.includes("network") || lower.includes("timeout") || // #248: only a genuine connection-abort network error (ECONNABORTED) is retryable.
  // The broad "abort" substring previously also matched deliberate AbortSignal/timeout
  // cancellations (handled by the name check above) → infinite retry.
  lower.includes("econnaborted")) {
    return true;
  }
  return false;
}
function computeDelay(attempt, config) {
  const raw = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs
  );
  if (config.jitterFactor === 0) return raw;
  const half = Math.floor(raw / 2);
  return half + Math.floor(Math.random() * (raw - half + 1));
}
function rejectAfter(ms, message) {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function redactUrl(raw) {
  try {
    const u = new URL(raw);
    const sensitive = /^(api[-_]?key|access[-_]?token|auth[-_]?token|token|secret|key|password|bearer|credential|jwt)$/i;
    for (const k of [...u.searchParams.keys()]) {
      if (sensitive.test(k)) {
        u.searchParams.set(k, "***");
      }
    }
    return u.toString();
  } catch {
    return raw;
  }
}
var RpcPool = class _RpcPool {
  endpoints;
  strategy;
  retryConfig;
  requestTimeoutMs;
  verbose;
  /** Time-based recovery window in ms (0 = disabled). */
  recoveryAfterMs;
  /** Round-robin index tracker. */
  rrIndex = 0;
  /** Consecutive failure threshold before marking an endpoint unhealthy. */
  static UNHEALTHY_THRESHOLD = 3;
  /** Minimum endpoints before auto-recovery is attempted. */
  static MIN_HEALTHY = 1;
  constructor(config) {
    if (!config.endpoints || config.endpoints.length === 0) {
      throw new Error("RpcPool: at least one endpoint is required");
    }
    this.strategy = config.strategy ?? "failover";
    this.retryConfig = resolveRetryConfig(config.retry);
    this.requestTimeoutMs = config.requestTimeoutMs ?? 3e4;
    this.verbose = config.verbose ?? true;
    this.recoveryAfterMs = config.recoveryAfterMs ?? 6e4;
    const commitment = config.commitment ?? "confirmed";
    this.endpoints = config.endpoints.map((raw) => {
      const ep = normalizeEndpoint(raw);
      const connConfig = {
        commitment,
        ...ep.connectionConfig
      };
      return {
        config: ep,
        connection: new Connection4(ep.url, connConfig),
        label: endpointLabel(ep),
        weight: Math.max(1, ep.weight ?? 1),
        failures: 0,
        healthy: true,
        lastLatencyMs: -1
      };
    });
  }
  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------
  /**
   * Execute a function against a pooled connection with automatic retry
   * and failover.
   *
   * @param fn - Async function that receives a `Connection` and returns a result.
   * @returns The result of `fn`.
   * @throws The last error if all retries and failovers are exhausted.
   *
   * @example
   * ```ts
   * const balance = await pool.call(c => c.getBalance(pubkey));
   * const markets = await pool.call(c => discoverMarkets(c, programId, opts));
   * ```
   */
  async call(fn) {
    const maxAttempts = this.retryConfig ? this.retryConfig.maxRetries + 1 : 1;
    let lastError;
    const triedEndpoints = /* @__PURE__ */ new Set();
    const maxTotalIterations = maxAttempts + this.endpoints.length;
    let totalIterations = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (++totalIterations > maxTotalIterations) break;
      const epIdx = this.selectEndpoint(triedEndpoints);
      if (epIdx === -1) {
        break;
      }
      const ep = this.endpoints[epIdx];
      const timeout = rejectAfter(this.requestTimeoutMs, `RPC request timed out after ${this.requestTimeoutMs}ms (${ep.label})`);
      try {
        const result = await Promise.race([
          fn(ep.connection),
          timeout.promise
        ]);
        ep.failures = 0;
        ep.healthy = true;
        ep.unhealthySince = void 0;
        return result;
      } catch (err) {
        lastError = err;
        ep.failures++;
        if (ep.failures >= _RpcPool.UNHEALTHY_THRESHOLD) {
          ep.healthy = false;
          ep.unhealthySince = ep.unhealthySince ?? Date.now();
          if (this.verbose) {
            console.warn(
              `[RpcPool] Endpoint ${ep.label} marked unhealthy after ${ep.failures} consecutive failures`
            );
          }
        }
        const retryable = this.retryConfig ? isRetryable(err, this.retryConfig.retryableStatusCodes) : false;
        if (!retryable) {
          if (this.strategy === "failover" && this.endpoints.length > 1) {
            triedEndpoints.add(epIdx);
            attempt--;
            if (triedEndpoints.size >= this.endpoints.length) break;
            continue;
          }
          throw err;
        }
        if (this.verbose) {
          console.warn(
            `[RpcPool] Retryable error on ${ep.label} (attempt ${attempt + 1}/${maxAttempts}):`,
            err instanceof Error ? err.message : err
          );
        }
        if (this.strategy === "failover" && this.endpoints.length > 1) {
          triedEndpoints.add(epIdx);
        }
        if (attempt < maxAttempts - 1 && this.retryConfig) {
          const delay = computeDelay(attempt, this.retryConfig);
          await sleep(delay);
        }
      } finally {
        timeout.cancel();
      }
    }
    this.maybeRecoverEndpoints();
    throw lastError ?? new Error("RpcPool: all endpoints exhausted");
  }
  /**
   * Get a raw `Connection` from the current preferred endpoint.
   * Useful when you need to pass a Connection to external code.
   *
   * NOTE: This bypasses retry and failover logic. Prefer `call()`.
   *
   * @returns Solana Connection from the current preferred endpoint.
   *
   * @example
   * ```ts
   * const conn = pool.getConnection();
   * const balance = await conn.getBalance(pubkey);
   * ```
   */
  getConnection() {
    const idx = this.selectEndpoint();
    if (idx === -1) {
      this.maybeRecoverEndpoints();
      return this.endpoints[0].connection;
    }
    return this.endpoints[idx].connection;
  }
  /**
   * Run a health check against all endpoints in the pool.
   *
   * @param timeoutMs - Per-endpoint probe timeout (default: 5000)
   * @returns Array of health results, one per endpoint.
   *
   * @example
   * ```ts
   * const results = await pool.healthCheck();
   * for (const r of results) {
   *   console.log(`${r.endpoint}: ${r.healthy ? 'UP' : 'DOWN'} (${r.latencyMs}ms, slot ${r.slot})`);
   * }
   * ```
   */
  async healthCheck(timeoutMs = 5e3) {
    const results = await Promise.all(
      this.endpoints.map(async (ep) => {
        const result = await checkRpcHealth(ep.config.url, timeoutMs);
        ep.lastLatencyMs = result.latencyMs;
        ep.healthy = result.healthy;
        if (result.healthy) {
          ep.failures = 0;
          ep.unhealthySince = void 0;
        }
        result.endpoint = redactUrl(result.endpoint);
        return result;
      })
    );
    return results;
  }
  /**
   * Get the number of endpoints in the pool.
   */
  get size() {
    return this.endpoints.length;
  }
  /**
   * Get the number of currently healthy endpoints.
   */
  get healthyCount() {
    return this.endpoints.filter((ep) => ep.healthy).length;
  }
  /**
   * Get endpoint labels and their current status.
   *
   * @returns Array of `{ label, url, healthy, failures, lastLatencyMs }`.
   */
  status() {
    return this.endpoints.map((ep) => ({
      label: ep.label,
      url: redactUrl(ep.config.url),
      healthy: ep.healthy,
      failures: ep.failures,
      lastLatencyMs: ep.lastLatencyMs
    }));
  }
  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------
  /**
   * Select the next endpoint based on strategy.
   * Returns -1 if no endpoint is available.
   */
  selectEndpoint(exclude) {
    if (this.recoveryAfterMs > 0) {
      const now = Date.now();
      for (const ep of this.endpoints) {
        if (!ep.healthy && ep.unhealthySince !== void 0 && now - ep.unhealthySince >= this.recoveryAfterMs) {
          ep.healthy = true;
          ep.failures = 0;
          ep.unhealthySince = void 0;
          if (this.verbose) {
            console.warn(`[RpcPool] Endpoint ${ep.label} restored after ${this.recoveryAfterMs}ms recovery window`);
          }
        }
      }
    }
    const healthy = this.endpoints.map((ep, i) => ({ ep, i })).filter(({ ep, i }) => ep.healthy && !exclude?.has(i));
    if (healthy.length === 0) {
      const remaining = this.endpoints.map((_, i) => i).filter((i) => !exclude?.has(i));
      return remaining.length > 0 ? remaining[0] : -1;
    }
    if (this.strategy === "failover") {
      return healthy[0].i;
    }
    const totalWeight = healthy.reduce((sum, { ep }) => sum + ep.weight, 0);
    this.rrIndex = (this.rrIndex + 1) % totalWeight;
    let cumulative = 0;
    for (const { ep, i } of healthy) {
      cumulative += ep.weight;
      if (this.rrIndex < cumulative) return i;
    }
    return healthy[healthy.length - 1].i;
  }
  /**
   * If all endpoints are unhealthy, reset them so we at least try again.
   */
  maybeRecoverEndpoints() {
    const healthyCount = this.endpoints.filter((ep) => ep.healthy).length;
    if (healthyCount < _RpcPool.MIN_HEALTHY) {
      if (this.verbose) {
        console.warn("[RpcPool] All endpoints unhealthy \u2014 resetting for recovery");
      }
      for (const ep of this.endpoints) {
        ep.healthy = true;
        ep.failures = 0;
        ep.unhealthySince = void 0;
      }
    }
  }
};
async function withRetry(fn, config) {
  const resolved = resolveRetryConfig(config) ?? {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 1e4,
    jitterFactor: 0.25,
    retryableStatusCodes: [429, 502, 503, 504]
  };
  let lastError;
  const maxAttempts = resolved.maxRetries + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err, resolved.retryableStatusCodes)) {
        throw err;
      }
      if (attempt < maxAttempts - 1) {
        const delay = computeDelay(attempt, resolved);
        await sleep(delay);
      }
    }
  }
  throw lastError ?? new Error("withRetry: all attempts exhausted");
}
var _internal = {
  isRetryable,
  computeDelay,
  resolveRetryConfig,
  normalizeEndpoint,
  endpointLabel
};

// src/runtime/tx.ts
import {
  TransactionInstruction,
  Transaction,
  ComputeBudgetProgram
} from "@solana/web3.js";
function buildIx(params) {
  return new TransactionInstruction({
    programId: params.programId,
    keys: params.keys,
    // TransactionInstruction types expect Buffer, but Uint8Array works at runtime.
    // Cast to avoid Buffer polyfill issues in the browser.
    data: params.data
  });
}
var MAX_COMPUTE_UNIT_LIMIT = 14e5;
async function simulateOrSend(params) {
  const { connection, ix, signers, simulate, commitment = "confirmed", computeUnitLimit } = params;
  if (typeof simulate !== "boolean") {
    throw new Error("simulateOrSend: simulate must be explicitly set to true or false");
  }
  if (!signers.length) {
    throw new Error("simulateOrSend: at least one signer is required");
  }
  if (computeUnitLimit !== void 0) {
    if (typeof computeUnitLimit !== "number" || !Number.isInteger(computeUnitLimit) || computeUnitLimit < 1 || computeUnitLimit > MAX_COMPUTE_UNIT_LIMIT) {
      throw new Error(
        `computeUnitLimit must be an integer in [1, ${MAX_COMPUTE_UNIT_LIMIT}]`
      );
    }
  }
  const tx = new Transaction();
  if (computeUnitLimit !== void 0) {
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnitLimit
      })
    );
  }
  tx.add(ix);
  const latestBlockhash = await connection.getLatestBlockhash(commitment);
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = signers[0].publicKey;
  if (simulate) {
    try {
      tx.sign(...signers);
      const result = await connection.simulateTransaction(tx, signers);
      const logs = result.value.logs ?? [];
      let err = null;
      let hint;
      if (result.value.err) {
        const parsed = parseErrorFromLogs(logs);
        if (parsed) {
          err = `${parsed.name} (0x${parsed.code.toString(16)})`;
          hint = parsed.hint;
        } else {
          err = JSON.stringify(result.value.err);
        }
      }
      return {
        signature: "(simulated)",
        slot: result.context.slot,
        err,
        hint,
        logs,
        unitsConsumed: result.value.unitsConsumed ?? void 0
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        signature: "(simulated)",
        slot: 0,
        err: message,
        logs: []
      };
    }
  }
  const options = {
    skipPreflight: false,
    preflightCommitment: commitment
  };
  try {
    const signature = await connection.sendTransaction(tx, signers, options);
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      },
      commitment
    );
    const txInfo = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0
    });
    const logs = txInfo?.meta?.logMessages ?? [];
    let err = null;
    let hint;
    if (confirmation.value.err) {
      const parsed = parseErrorFromLogs(logs);
      if (parsed) {
        err = `${parsed.name} (0x${parsed.code.toString(16)})`;
        hint = parsed.hint;
      } else {
        err = JSON.stringify(confirmation.value.err);
      }
    }
    return {
      signature,
      slot: txInfo?.slot ?? 0,
      err,
      hint,
      logs
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      signature: "",
      slot: 0,
      err: message,
      logs: []
    };
  }
}
function formatResult(result, jsonMode) {
  if (jsonMode) {
    return JSON.stringify(result, null, 2);
  }
  const lines = [];
  if (result.err) {
    lines.push(`Error: ${result.err}`);
    if (result.hint) {
      lines.push(`Hint: ${result.hint}`);
    }
    if (result.unitsConsumed !== void 0) {
      lines.push(`Compute Units: ${result.unitsConsumed.toLocaleString()}`);
    }
    if (result.logs.length > 0) {
      lines.push("Logs:");
      result.logs.forEach((log) => lines.push(`  ${log}`));
    }
  } else {
    lines.push(`Signature: ${result.signature}`);
    lines.push(`Slot: ${result.slot}`);
    if (result.unitsConsumed !== void 0) {
      lines.push(`Compute Units: ${result.unitsConsumed.toLocaleString()}`);
    }
    if (result.signature !== "(simulated)") {
      lines.push(`Explorer: https://explorer.solana.com/tx/${result.signature}`);
    }
  }
  return lines.join("\n");
}

// src/runtime/lighthouse.ts
import { PublicKey as PublicKey13, Transaction as Transaction2 } from "@solana/web3.js";
var LIGHTHOUSE_PROGRAM_ID = new PublicKey13(
  "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95"
);
var LIGHTHOUSE_PROGRAM_ID_STR = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
var LIGHTHOUSE_CONSTRAINT_ADDRESS = 6400;
var LIGHTHOUSE_ERROR_CODES = /* @__PURE__ */ new Set([
  6e3,
  // InstructionMissing
  6001,
  // InstructionFallbackNotFound
  6002,
  // InstructionDidNotDeserialize
  6003,
  // InstructionDidNotSerialize
  6016,
  // IdlInstructionStub
  6032,
  // ConstraintMut
  6033,
  // ConstraintHasOne
  6034,
  // ConstraintSigner
  6035,
  // ConstraintRaw
  6036,
  // ConstraintOwner
  6037,
  // ConstraintRentExempt
  6038,
  // ConstraintSeeds
  6039,
  // ConstraintExecutable
  6040,
  // ConstraintState
  6041,
  // ConstraintAssociated
  6042,
  // ConstraintAssociatedInit
  6043,
  // ConstraintClose
  6400
  // ConstraintAddress (the one we hit most often)
]);
function isLighthouseInstruction(ix) {
  return ix.programId.equals(LIGHTHOUSE_PROGRAM_ID);
}
function isLighthouseError(error) {
  const msg = extractErrorMessage(error);
  if (!msg) return false;
  if (msg.includes(LIGHTHOUSE_PROGRAM_ID_STR)) return true;
  if (/custom\s+program\s+error:\s*0x1900\b/i.test(msg)) return true;
  if (/"Custom"\s*:\s*6400\b/.test(msg) && /InstructionError/i.test(msg)) return true;
  return false;
}
function isLighthouseFailureInLogs(logs) {
  if (!Array.isArray(logs)) return false;
  let lighthouseDepth = 0;
  for (const line of logs) {
    if (typeof line !== "string") continue;
    if (line.includes(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} invoke`)) {
      lighthouseDepth++;
      continue;
    }
    if (line.includes(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} success`)) {
      if (lighthouseDepth > 0) lighthouseDepth--;
      continue;
    }
    if (line.includes(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed`)) {
      return true;
    }
  }
  return false;
}
function stripLighthouseInstructions(instructions, percolatorProgramId) {
  if (percolatorProgramId) {
    const hasPercolatorIx = instructions.some(
      (ix) => ix.programId.equals(percolatorProgramId)
    );
    if (!hasPercolatorIx) {
      return instructions;
    }
  }
  return instructions.filter((ix) => !isLighthouseInstruction(ix));
}
function stripLighthouseFromTransaction(transaction, percolatorProgramId) {
  if (percolatorProgramId) {
    const hasPercolatorIx = transaction.instructions.some(
      (ix) => ix.programId.equals(percolatorProgramId)
    );
    if (!hasPercolatorIx) return transaction;
  }
  const hasLighthouse = transaction.instructions.some(isLighthouseInstruction);
  if (!hasLighthouse) return transaction;
  const clean = new Transaction2();
  clean.recentBlockhash = transaction.recentBlockhash;
  clean.feePayer = transaction.feePayer;
  for (const ix of transaction.instructions) {
    if (!isLighthouseInstruction(ix)) {
      clean.add(ix);
    }
  }
  return clean;
}
function countLighthouseInstructions(ixsOrTx) {
  const instructions = Array.isArray(ixsOrTx) ? ixsOrTx : ixsOrTx.instructions;
  return instructions.filter(isLighthouseInstruction).length;
}
var LIGHTHOUSE_USER_MESSAGE = "Your wallet's transaction guard (Blowfish/Lighthouse) is blocking this transaction. This is a known compatibility issue \u2014 the transaction itself is valid. Try one of these workarounds:\n1. Disable transaction simulation in your wallet settings\n2. Use a wallet without Blowfish protection (e.g., Backpack, Solflare)\n3. The SDK will automatically retry without the guard";
function classifyLighthouseError(error) {
  if (isLighthouseError(error)) {
    return LIGHTHOUSE_USER_MESSAGE;
  }
  return null;
}
function extractErrorMessage(error) {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return null;
  }
}

// src/math/trading.ts
function computeMarkPnl(positionSize, entryPrice, oraclePrice) {
  if (positionSize === 0n || oraclePrice === 0n) return 0n;
  const absPos = positionSize < 0n ? -positionSize : positionSize;
  const diff = positionSize > 0n ? oraclePrice - entryPrice : entryPrice - oraclePrice;
  return diff * absPos / oraclePrice;
}
function computeLiqPrice(entryPrice, capital, positionSize, maintenanceMarginBps) {
  if (positionSize === 0n || entryPrice === 0n) return 0n;
  const absPos = positionSize < 0n ? -positionSize : positionSize;
  const capitalPerUnitE6 = capital * 1000000n / absPos;
  if (positionSize > 0n) {
    const adjusted = capitalPerUnitE6 * 10000n / (10000n + maintenanceMarginBps);
    const liq = entryPrice - adjusted;
    return liq > 0n ? liq : 0n;
  } else {
    if (maintenanceMarginBps >= 10000n) return 18446744073709551615n;
    const adjusted = capitalPerUnitE6 * 10000n / (10000n - maintenanceMarginBps);
    return entryPrice + adjusted;
  }
}
function computePreTradeLiqPrice(oracleE6, margin, posSize, maintBps, feeBps, direction) {
  if (oracleE6 === 0n || margin === 0n || posSize === 0n) return 0n;
  const absPos = posSize < 0n ? -posSize : posSize;
  const signedPos = direction === "long" ? absPos : -absPos;
  const feeAdjust = oracleE6 * feeBps / 10000n;
  let adjustedEntry;
  if (direction === "long") {
    adjustedEntry = oracleE6 + feeAdjust;
  } else {
    const shortEntry = oracleE6 - feeAdjust;
    adjustedEntry = shortEntry > 0n ? shortEntry : 1n;
  }
  return computeLiqPrice(adjustedEntry, margin, signedPos, maintBps);
}
function computeTradingFee(notional, tradingFeeBps) {
  return notional * tradingFeeBps / 10000n;
}
function computeDynamicFeeBps(notional, config) {
  if (config.tier2Threshold === 0n) return config.baseBps;
  if (config.tier3Threshold > 0n && notional >= config.tier3Threshold) return config.tier3Bps;
  if (notional >= config.tier2Threshold) return config.tier2Bps;
  return config.baseBps;
}
function computeDynamicTradingFee(notional, config) {
  const feeBps = computeDynamicFeeBps(notional, config);
  if (notional <= 0n || feeBps <= 0n) return 0n;
  return (notional * feeBps + 9999n) / 10000n;
}
function computeFeeSplit(totalFee, config) {
  if (config.lpBps === 0n && config.protocolBps === 0n && config.creatorBps === 0n) {
    return [totalFee, 0n, 0n];
  }
  const totalBps = config.lpBps + config.protocolBps + config.creatorBps;
  if (config.lpBps < 0n || config.protocolBps < 0n || config.creatorBps < 0n) {
    throw new Error("computeFeeSplit: bps values must be non-negative");
  }
  if (totalBps !== 10000n) {
    throw new Error(`computeFeeSplit: bps values must sum to 10000, got ${totalBps}`);
  }
  const lp = totalFee * config.lpBps / 10000n;
  const protocol = totalFee * config.protocolBps / 10000n;
  const creator = totalFee - lp - protocol;
  return [lp, protocol, creator];
}
function computePnlPercent(pnlTokens, capital) {
  if (capital === 0n) return 0;
  const scaledPct = pnlTokens * 10000n / capital;
  if (scaledPct > BigInt(Number.MAX_SAFE_INTEGER) || scaledPct < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `computePnlPercent: scaled result ${scaledPct} exceeds Number.MAX_SAFE_INTEGER \u2014 precision loss`
    );
  }
  return Number(scaledPct) / 100;
}
function computeEstimatedEntryPrice(oracleE6, tradingFeeBps, direction) {
  if (oracleE6 === 0n) return 0n;
  const feeImpact = oracleE6 * tradingFeeBps / 10000n;
  if (direction === "long") return oracleE6 + feeImpact;
  const shortEntry = oracleE6 - feeImpact;
  return shortEntry > 0n ? shortEntry : 1n;
}
var MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
var MIN_SAFE_BIGINT = BigInt(-Number.MAX_SAFE_INTEGER);
function computeFundingRateAnnualized(fundingRateBpsPerSlot) {
  if (fundingRateBpsPerSlot > MAX_SAFE_BIGINT || fundingRateBpsPerSlot < MIN_SAFE_BIGINT) {
    throw new Error(
      `computeFundingRateAnnualized: value ${fundingRateBpsPerSlot} exceeds safe integer range`
    );
  }
  const bpsPerSlot = Number(fundingRateBpsPerSlot);
  const slotsPerYear = 2.5 * 60 * 60 * 24 * 365;
  return bpsPerSlot * slotsPerYear / 100;
}
function computeRequiredMargin(notional, initialMarginBps) {
  return notional * initialMarginBps / 10000n;
}
function computeMaxLeverage(initialMarginBps) {
  if (initialMarginBps <= 0n) {
    throw new Error("computeMaxLeverage: initialMarginBps must be positive");
  }
  return Number(10000n / initialMarginBps);
}

// src/math/warmup.ts
function computeWarmupUnlockedCapital(totalCapital, currentSlot, warmupStartSlot, warmupPeriodSlots) {
  if (warmupPeriodSlots === 0n || warmupStartSlot === 0n) return totalCapital;
  if (totalCapital <= 0n) return 0n;
  const elapsed = currentSlot > warmupStartSlot ? currentSlot - warmupStartSlot : 0n;
  if (elapsed >= warmupPeriodSlots) return totalCapital;
  return totalCapital * elapsed / warmupPeriodSlots;
}
function computeWarmupLeverageCap(initialMarginBps, totalCapital, currentSlot, warmupStartSlot, warmupPeriodSlots) {
  const maxLev = computeMaxLeverage(initialMarginBps);
  if (warmupPeriodSlots === 0n || warmupStartSlot === 0n) return maxLev;
  if (totalCapital <= 0n) return 1;
  const unlocked = computeWarmupUnlockedCapital(
    totalCapital,
    currentSlot,
    warmupStartSlot,
    warmupPeriodSlots
  );
  if (unlocked <= 0n) return 1;
  const effectiveLev = Number(BigInt(maxLev) * unlocked / totalCapital);
  return Math.max(1, effectiveLev);
}
function computeWarmupMaxPositionSize(initialMarginBps, totalCapital, currentSlot, warmupStartSlot, warmupPeriodSlots) {
  const maxLev = computeMaxLeverage(initialMarginBps);
  const unlocked = computeWarmupUnlockedCapital(
    totalCapital,
    currentSlot,
    warmupStartSlot,
    warmupPeriodSlots
  );
  return unlocked * BigInt(maxLev);
}

// src/validation.ts
import { PublicKey as PublicKey14 } from "@solana/web3.js";
var U16_MAX2 = 65535;
var U64_MAX = BigInt("18446744073709551615");
var I64_MIN = BigInt("-9223372036854775808");
var I64_MAX = BigInt("9223372036854775807");
var U128_MAX = (1n << 128n) - 1n;
var I128_MIN = -(1n << 127n);
var I128_MAX = (1n << 127n) - 1n;
var ValidationError = class extends Error {
  constructor(field, message) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
    this.name = "ValidationError";
  }
};
var DECIMAL_UINT_RE = /^(0|[1-9]\d*)$/;
var DECIMAL_INT_RE2 = /^-?(0|[1-9]\d*)$/;
function requireDecimalUIntString(value, field) {
  const t = value.trim();
  if (t === "") {
    throw new ValidationError(field, `"${value}" is not a valid number`);
  }
  if (!DECIMAL_UINT_RE.test(t)) {
    throw new ValidationError(
      field,
      `"${value}" is not a valid non-negative integer (use decimal digits only, e.g. 123).`
    );
  }
  return t;
}
function safeBigInt(val, caller) {
  const t = val.trim();
  if (!DECIMAL_INT_RE2.test(t)) {
    throw new Error(
      `${caller}: "${val}" is not a valid decimal integer (use plain decimal digits, e.g. 123 or -42; no hex, scientific notation, or underscores).`
    );
  }
  return BigInt(t);
}
function validatePublicKey(value, field) {
  try {
    return new PublicKey14(value);
  } catch {
    throw new ValidationError(
      field,
      `"${value}" is not a valid base58 public key. Example: "11111111111111111111111111111111"`
    );
  }
}
function validateIndex(value, field) {
  const t = requireDecimalUIntString(value, field);
  const bi = BigInt(t);
  if (bi > BigInt(U16_MAX2)) {
    throw new ValidationError(
      field,
      `must be <= ${U16_MAX2} (u16 max), got ${t}`
    );
  }
  return Number(bi);
}
function validateAmount(value, field) {
  const t = requireDecimalUIntString(value, field);
  const num = BigInt(t);
  if (num < 0n) {
    throw new ValidationError(field, `must be non-negative, got ${num}`);
  }
  if (num > U64_MAX) {
    throw new ValidationError(
      field,
      `must be <= ${U64_MAX} (u64 max), got ${num}`
    );
  }
  return num;
}
function validateU128(value, field) {
  const t = requireDecimalUIntString(value, field);
  const num = BigInt(t);
  if (num < 0n) {
    throw new ValidationError(field, `must be non-negative, got ${num}`);
  }
  if (num > U128_MAX) {
    throw new ValidationError(
      field,
      `must be <= ${U128_MAX} (u128 max), got ${num}`
    );
  }
  return num;
}
function validateI64(value, field) {
  let num;
  try {
    num = safeBigInt(value, field);
  } catch {
    throw new ValidationError(
      field,
      `"${value}" is not a valid number. Use decimal digits only, with optional leading minus.`
    );
  }
  if (num < I64_MIN) {
    throw new ValidationError(
      field,
      `must be >= ${I64_MIN} (i64 min), got ${num}`
    );
  }
  if (num > I64_MAX) {
    throw new ValidationError(
      field,
      `must be <= ${I64_MAX} (i64 max), got ${num}`
    );
  }
  return num;
}
function validateI128(value, field) {
  let num;
  try {
    num = safeBigInt(value, field);
  } catch {
    throw new ValidationError(
      field,
      `"${value}" is not a valid number. Use decimal digits only, with optional leading minus.`
    );
  }
  if (num < I128_MIN) {
    throw new ValidationError(
      field,
      `must be >= ${I128_MIN} (i128 min), got ${num}`
    );
  }
  if (num > I128_MAX) {
    throw new ValidationError(
      field,
      `must be <= ${I128_MAX} (i128 max), got ${num}`
    );
  }
  return num;
}
function validateBps(value, field) {
  const t = requireDecimalUIntString(value, field);
  const bi = BigInt(t);
  if (bi > 10000n) {
    throw new ValidationError(
      field,
      `must be <= 10000 (100%), got ${t}`
    );
  }
  return Number(bi);
}
function validateU64(value, field) {
  return validateAmount(value, field);
}
function validateU16(value, field) {
  const t = requireDecimalUIntString(value, field);
  const bi = BigInt(t);
  if (bi > BigInt(U16_MAX2)) {
    throw new ValidationError(
      field,
      `must be <= ${U16_MAX2} (u16 max), got ${t}`
    );
  }
  return Number(bi);
}

// src/oracle/price-router.ts
var DEFAULT_RESOLVE_TIMEOUT_MS = 15e3;
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function combineAbortSignals(signals) {
  const already = signals.find((s) => s.aborted);
  if (already) {
    const c = new AbortController();
    c.abort(already.reason);
    return c.signal;
  }
  const active = signals.filter((s) => !s.aborted);
  if (active.length === 0) {
    const c = new AbortController();
    c.abort();
    return c.signal;
  }
  if (active.length === 1) return active[0];
  const ctrl = new AbortController();
  for (const s of active) {
    s.addEventListener("abort", () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}
var SUPPORTED_DEX_IDS = /* @__PURE__ */ new Set(["pumpswap", "raydium", "meteora"]);
function parseDexScreenerPairs(json) {
  if (!isRecord(json)) return [];
  const rawPairs = json.pairs;
  if (!Array.isArray(rawPairs)) return [];
  const sources = [];
  for (const pair of rawPairs) {
    if (!isRecord(pair)) continue;
    if (pair.chainId !== "solana") continue;
    const dexId = String(pair.dexId || "").toLowerCase();
    if (!SUPPORTED_DEX_IDS.has(dexId)) continue;
    let liquidity = 0;
    if (isRecord(pair.liquidity) && typeof pair.liquidity.usd === "number") {
      liquidity = pair.liquidity.usd;
    }
    if (liquidity < 100) continue;
    let confidence = 30;
    if (liquidity > 1e6) confidence = 90;
    else if (liquidity > 1e5) confidence = 75;
    else if (liquidity > 1e4) confidence = 60;
    else if (liquidity > 1e3) confidence = 45;
    const priceUsd = pair.priceUsd;
    const price = typeof priceUsd === "string" || typeof priceUsd === "number" ? parseFloat(String(priceUsd)) || 0 : 0;
    if (!(price > 0)) continue;
    let baseSym = "?";
    let quoteSym = "?";
    if (isRecord(pair.baseToken) && typeof pair.baseToken.symbol === "string") {
      baseSym = pair.baseToken.symbol;
    }
    if (isRecord(pair.quoteToken) && typeof pair.quoteToken.symbol === "string") {
      quoteSym = pair.quoteToken.symbol;
    }
    const addr = pair.pairAddress;
    sources.push({
      type: "dex",
      address: typeof addr === "string" ? addr : "",
      dexId,
      pairLabel: `${baseSym} / ${quoteSym}`,
      liquidity,
      price,
      confidence
    });
  }
  sources.sort((a, b) => b.liquidity - a.liquidity);
  return sources.slice(0, 10);
}
function parseJupiterMintEntry(json, mint) {
  if (!isRecord(json)) return null;
  const data = json.data;
  if (!isRecord(data)) return null;
  const row = data[mint];
  if (!isRecord(row)) return null;
  const rawPrice = row.price;
  if (rawPrice === void 0 || rawPrice === null) return null;
  const price = parseFloat(String(rawPrice)) || 0;
  if (price <= 0) return null;
  let mintSymbol = "?";
  if (typeof row.mintSymbol === "string") mintSymbol = row.mintSymbol;
  return { price, mintSymbol };
}
var PYTH_SOLANA_FEEDS = {
  // SOL
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d": { symbol: "SOL", mint: "So11111111111111111111111111111111111111112" },
  // BTC
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43": { symbol: "BTC", mint: "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E" },
  // ETH
  "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace": { symbol: "ETH", mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs" },
  // USDC
  "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a": { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  // USDT
  "2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b": { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
  // BONK
  "72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419": { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  // JTO
  "b43660a5f790c69354b0729a5ef9d50d68f1df92107540210b9cccba1f947cc2": { symbol: "JTO", mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL" },
  // JUP
  "0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996": { symbol: "JUP", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  // PYTH
  "0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff": { symbol: "PYTH", mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3" },
  // RAY
  "91568bae053f70f0c3fbf32eb55df25ec609fb8a21cfb1a0e3b34fc3caa1eab0": { symbol: "RAY", mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" },
  // ORCA
  "37505261e557e251f40c2c721e52c4c8bfb2e54a12f450d0e24078276ad51b95": { symbol: "ORCA", mint: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE" },
  // MNGO
  "f9abf5eb70a2e68e21b72b68cc6e0a4d25e1d77e1ec16eae5b93068a2cb81f90": { symbol: "MNGO", mint: "MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac" },
  // MSOL
  "c2289a6a43d2ce91c6f55caec370f4acc38a2ed477f58813334c6d03749ff2a4": { symbol: "MSOL", mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So" },
  // JITOSOL
  "67be9f519b95cf24338801051f9a808eff0a578ccb388db73b7f6fe1de019ffb": { symbol: "JITOSOL", mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn" },
  // WIF
  "4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54e6c5c4b03": { symbol: "WIF", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  // RENDER
  "3573eb14b04aa0e4f7cf1e7ae1c2a0e3bc6100b2e476876ca079e10e2c42d7c6": { symbol: "RENDER", mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof" },
  // W
  "eff7446475e218517566ea99e72a4abec2e1bd8498b43b7d8331e29dcb059389": { symbol: "W", mint: "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ" },
  // TNSR
  "05ecd4597cd48fe13d6cc3596c62af4f9675aee06e2e0ca164a73be4b0813f3b": { symbol: "TNSR", mint: "TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6" },
  // HNT
  "649fdd7ec08e8e2a20f425729854e90293dcbe2376abc47197a14da6ff339756": { symbol: "HNT", mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux" },
  // MOBILE
  "ff4c53361e36a9b1caa490f1e46e07e3c472d54d2a4856a1e4609bd4db36bff0": { symbol: "MOBILE", mint: "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6" },
  // IOT
  "8bdd20f0c68bf7370a19389bbb3d17c1db7956c38efa08b2f3dd0e5db9b8c1ef": { symbol: "IOT", mint: "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns" }
};
Object.freeze(PYTH_SOLANA_FEEDS);
var MINT_TO_PYTH_FEED = /* @__PURE__ */ new Map();
for (const [feedId, info] of Object.entries(PYTH_SOLANA_FEEDS)) {
  MINT_TO_PYTH_FEED.set(info.mint, { feedId, symbol: info.symbol });
}
var DEFAULT_FETCH_TIMEOUT_MS = 1e4;
function effectiveSignal(signal) {
  return signal ?? AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS);
}
async function fetchDexSources(mint, signal) {
  try {
    const resp = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`,
      {
        signal: effectiveSignal(signal),
        headers: { "User-Agent": "percolator/1.0" }
      }
    );
    if (!resp.ok) return [];
    const json = await resp.json();
    return parseDexScreenerPairs(json);
  } catch {
    return [];
  }
}
function lookupPythSource(mint) {
  const entry = MINT_TO_PYTH_FEED.get(mint);
  if (!entry) return null;
  return {
    type: "pyth",
    address: entry.feedId,
    pairLabel: `${entry.symbol} / USD (Pyth)`,
    liquidity: Infinity,
    // Pyth is considered deep liquidity
    price: 0,
    // We don't fetch live price here; caller can enrich
    confidence: 95
    // Pyth is highest reliability for supported tokens
  };
}
async function fetchJupiterSource(mint, signal) {
  try {
    const resp = await fetch(
      `https://api.jup.ag/price/v2?ids=${encodeURIComponent(mint)}`,
      {
        signal: effectiveSignal(signal),
        headers: { "User-Agent": "percolator/1.0" }
      }
    );
    if (!resp.ok) return null;
    const json = await resp.json();
    const row = parseJupiterMintEntry(json, mint);
    if (!row) return null;
    return {
      type: "jupiter",
      address: mint,
      pairLabel: `${row.mintSymbol} / USD (Jupiter)`,
      liquidity: 0,
      // Jupiter aggregator — no single pool liquidity
      price: row.price,
      confidence: 40
      // Fallback — lower confidence
    };
  } catch {
    return null;
  }
}
async function resolvePrice(mint, signal, options) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal ? combineAbortSignals([signal, timeoutSignal]) : timeoutSignal;
  const [dexSources, jupiterSource] = await Promise.all([
    fetchDexSources(mint, combinedSignal),
    fetchJupiterSource(mint, combinedSignal)
  ]);
  const pythSource = lookupPythSource(mint);
  const allSources = [];
  if (pythSource) {
    const dexPrice = dexSources[0]?.price ?? 0;
    const jupPrice = jupiterSource?.price ?? 0;
    let enrichedPrice = 0;
    let singleSource = false;
    if (dexPrice > 0 && jupPrice > 0) {
      const mid = (dexPrice + jupPrice) / 2;
      const deviation = Math.abs(dexPrice - jupPrice) / mid;
      if (deviation <= 0.5) {
        enrichedPrice = mid;
      }
    } else if (dexPrice > 0 || jupPrice > 0) {
      enrichedPrice = dexPrice > 0 ? dexPrice : jupPrice;
      singleSource = true;
    }
    if (enrichedPrice > 0) {
      pythSource.price = enrichedPrice;
      if (singleSource) {
        pythSource.confidence = Math.min(pythSource.confidence, 50);
      }
      allSources.push(pythSource);
    }
  }
  allSources.push(...dexSources);
  if (jupiterSource) {
    allSources.push(jupiterSource);
  }
  allSources.sort((a, b) => b.confidence - a.confidence);
  return {
    mint,
    bestSource: allSources[0] || null,
    allSources,
    resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
export {
  ACCOUNTS_ACCEPT_ADMIN,
  ACCOUNTS_ADMIN_FORCE_CLOSE,
  ACCOUNTS_ADVANCE_ORACLE_PHASE,
  ACCOUNTS_ATTEST_CROSS_MARGIN,
  ACCOUNTS_AUDIT_CRANK,
  ACCOUNTS_BURN_POSITION_NFT,
  ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL,
  ACCOUNTS_CHALLENGE_SETTLEMENT,
  ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL,
  ACCOUNTS_CLEAR_PENDING_SETTLEMENT,
  ACCOUNTS_CLOSE_ACCOUNT,
  ACCOUNTS_CLOSE_ORPHAN_SLAB,
  ACCOUNTS_CLOSE_SLAB,
  ACCOUNTS_CLOSE_STALE_SLABS,
  ACCOUNTS_CONFIGURE_AUTH_MARK,
  ACCOUNTS_CONFIGURE_EWMA_MARK,
  ACCOUNTS_CONFIGURE_HYBRID_ORACLE,
  ACCOUNTS_CONVERT_RELEASED_PNL,
  ACCOUNTS_CREATE_INSURANCE_MINT,
  ACCOUNTS_CREATE_LP_VAULT,
  ACCOUNTS_DEPOSIT_COLLATERAL,
  ACCOUNTS_DEPOSIT_FEE_CREDITS,
  ACCOUNTS_DEPOSIT_INSURANCE_LP,
  ACCOUNTS_DEPOSIT_LP_COLLATERAL,
  ACCOUNTS_EXECUTE_ADL,
  ACCOUNTS_FORCE_CLOSE_RESOLVED,
  ACCOUNTS_FUND_MARKET_INSURANCE,
  ACCOUNTS_INIT_LP,
  ACCOUNTS_INIT_MARKET,
  ACCOUNTS_INIT_MATCHER_CTX,
  ACCOUNTS_INIT_USER,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_LIQUIDATE_AT_ORACLE,
  ACCOUNTS_LP_VAULT_CRANK_FEES,
  ACCOUNTS_LP_VAULT_DEPOSIT,
  ACCOUNTS_LP_VAULT_WITHDRAW,
  ACCOUNTS_MINT_POSITION_NFT,
  ACCOUNTS_NFT_BURN,
  ACCOUNTS_NFT_EMERGENCY_BURN,
  ACCOUNTS_NFT_MINT,
  ACCOUNTS_PAUSE_MARKET,
  ACCOUNTS_PERMISSIONLESS_CRANK_BASE,
  ACCOUNTS_PUSH_AUTH_MARK,
  ACCOUNTS_PUSH_EWMA_MARK,
  ACCOUNTS_QUEUE_WITHDRAWAL,
  ACCOUNTS_RECLAIM_EMPTY_ACCOUNT,
  ACCOUNTS_RECLAIM_SLAB_RENT,
  ACCOUNTS_RESCUE_ORPHAN_VAULT,
  ACCOUNTS_RESOLVE_DISPUTE,
  ACCOUNTS_RESOLVE_MARKET,
  ACCOUNTS_RESOLVE_PERMISSIONLESS,
  ACCOUNTS_RESTART_ASSET_ORACLE,
  ACCOUNTS_SETTLE_ACCOUNT,
  ACCOUNTS_SET_DEX_POOL,
  ACCOUNTS_SET_DISPUTE_PARAMS,
  ACCOUNTS_SET_INSURANCE_ISOLATION,
  ACCOUNTS_SET_INSURANCE_WITHDRAW_POLICY,
  ACCOUNTS_SET_LP_COLLATERAL_PARAMS,
  ACCOUNTS_SET_MAINTENANCE_FEE,
  ACCOUNTS_SET_MATCHER_CONFIG,
  ACCOUNTS_SET_MAX_PNL_CAP,
  ACCOUNTS_SET_OFFSET_PAIR,
  ACCOUNTS_SET_OI_CAP_MULTIPLIER,
  ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK,
  ACCOUNTS_SET_ORACLE_PRICE_CAP,
  ACCOUNTS_SET_PENDING_SETTLEMENT,
  ACCOUNTS_SET_RISK_THRESHOLD,
  ACCOUNTS_SET_WALLET_CAP,
  ACCOUNTS_TOPUP_INSURANCE,
  ACCOUNTS_TRADE_CPI,
  ACCOUNTS_TRADE_NOCPI,
  ACCOUNTS_TRANSFER_OWNERSHIP_CPI,
  ACCOUNTS_TRANSFER_POSITION_OWNERSHIP,
  ACCOUNTS_UNPAUSE_MARKET,
  ACCOUNTS_UPDATE_ADMIN,
  ACCOUNTS_UPDATE_AUTHORITY,
  ACCOUNTS_UPDATE_CONFIG,
  ACCOUNTS_UPDATE_HYPERP_MARK,
  ACCOUNTS_WITHDRAW_COLLATERAL,
  ACCOUNTS_WITHDRAW_INSURANCE,
  ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE,
  ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED,
  ACCOUNTS_WITHDRAW_INSURANCE_LP,
  ACCOUNTS_WITHDRAW_LP_COLLATERAL,
  ASSET_AUTH_KIND,
  AccountKind,
  CHAINLINK_ANSWER_OFFSET,
  CHAINLINK_DECIMALS_OFFSET,
  CHAINLINK_MIN_SIZE,
  CREATOR_LOCK_SEED,
  CTX_RETURN_OFFSET,
  CTX_VAMM_LEN,
  CTX_VAMM_OFFSET,
  CrankAction,
  DEFAULT_OI_RAMP_SLOTS,
  ENGINE_MARK_PRICE_OFF,
  ENGINE_OFF,
  EXPECTED_SLAB_VERSION,
  HEX_RE,
  INIT_CTX_LEN,
  IX_TAG,
  LIGHTHOUSE_CONSTRAINT_ADDRESS,
  LIGHTHOUSE_ERROR_CODES,
  LIGHTHOUSE_PROGRAM_ID,
  LIGHTHOUSE_PROGRAM_ID_STR,
  LIGHTHOUSE_USER_MESSAGE,
  MARK_PRICE_EMA_ALPHA_E6,
  MARK_PRICE_EMA_WINDOW_SLOTS,
  MATCHER_CALL_LEN,
  MATCHER_CONTEXT_LEN,
  MATCHER_MAGIC,
  MATCHER_RETURN_LEN,
  MAX_DECIMALS,
  METEORA_DLMM_PROGRAM_ID,
  NFT_IX_TAG,
  NFT_PROGRAM_ID,
  ORACLE_PHASE_GROWING,
  ORACLE_PHASE_MATURE,
  ORACLE_PHASE_NASCENT,
  PERCOLATOR_ERRORS,
  PHASE1_MIN_SLOTS,
  PHASE1_VOLUME_MIN_SLOTS,
  PHASE2_MATURITY_SLOTS,
  PHASE2_VOLUME_THRESHOLD,
  POSITION_NFT_STATE_LEN,
  PROGRAM_IDS,
  PROGRAM_IDS_V17,
  PROGRAM_ID_V17,
  PUMPSWAP_PROGRAM_ID,
  PYTH_PUSH_ORACLE_PROGRAM_ID,
  PYTH_RECEIVER_PROGRAM_ID,
  PYTH_SOLANA_FEEDS,
  RAMP_START_BPS,
  RAYDIUM_CLMM_PROGRAM_ID,
  RENOUNCE_ADMIN_CONFIRMATION,
  RESOLVE_MODE_DEGENERATE,
  RESOLVE_MODE_ORDINARY,
  RpcPool,
  SLAB_MAGIC,
  SLAB_TIERS,
  SLAB_TIERS_V0,
  SLAB_TIERS_V1,
  SLAB_TIERS_V12_1,
  SLAB_TIERS_V12_15,
  SLAB_TIERS_V12_17,
  SLAB_TIERS_V12_19,
  SLAB_TIERS_V1D,
  SLAB_TIERS_V1D_LEGACY,
  SLAB_TIERS_V1M,
  SLAB_TIERS_V1M2,
  SLAB_TIERS_V2,
  SLAB_TIERS_V_ADL,
  SLAB_TIERS_V_ADL_DISCOVERY,
  SLAB_TIERS_V_SETDEXPOOL,
  STAKE_DEPOSIT_DISCRIMINATOR,
  STAKE_DEPOSIT_SIZE,
  STAKE_IX,
  STAKE_POOL_CURRENT_VERSION,
  STAKE_POOL_DISCRIMINATOR,
  STAKE_POOL_SIZE,
  STAKE_PROGRAM_ID,
  STAKE_PROGRAM_IDS,
  TOKEN_2022_PROGRAM_ID,
  UNRESOLVE_CONFIRMATION,
  V17_ASSET_ORACLE_PROFILE_LEN,
  V17_EXPECTED_VERSION,
  V17_HEADER_LEN,
  V17_KIND_MARKET,
  V17_KIND_OFF,
  V17_MAGIC,
  V17_MARKET_ASSET_SLOT_LEN,
  V17_MARKET_GROUP_LEN,
  V17_MARKET_GROUP_OFF,
  V17_PORTFOLIO_ACCOUNT_LEN,
  V17_SLAB_MAGIC,
  V17_WRAPPER_CONFIG_LEN,
  VAMM_MAGIC,
  ValidationError,
  WELL_KNOWN,
  _internal,
  buildAccountMetas,
  buildAdlInstruction,
  buildAdlTransaction,
  buildIx,
  checkPhaseTransition,
  checkRpcHealth,
  classifyLighthouseError,
  clearStaticMarkets,
  computeDexSpotPriceE6,
  computeDynamicFeeBps,
  computeDynamicTradingFee,
  computeEffectiveOiCapBps,
  computeEmaMarkPrice,
  computeEstimatedEntryPrice,
  computeFeeSplit,
  computeFundingRateAnnualized,
  computeLiqPrice,
  computeMarkPnl,
  computeMaxLeverage,
  computePnlPercent,
  computePreTradeLiqPrice,
  computeRequiredMargin,
  computeTradingFee,
  computeVammQuote,
  computeWarmupLeverageCap,
  computeWarmupMaxPositionSize,
  computeWarmupUnlockedCapital,
  concatBytes,
  countLighthouseInstructions,
  decodeDepositPda,
  decodeError,
  decodeStakePool,
  depositAccounts,
  deriveCreatorLockPda,
  deriveDepositPda,
  deriveInsuranceLpMint,
  deriveLpBackingLedger,
  deriveLpEscrow,
  deriveLpPda,
  deriveLpRedemption,
  deriveLpVaultRegistry,
  deriveMatcherDelegate,
  deriveMintAuthority,
  deriveNftMint,
  deriveNftPda,
  deriveNftRegistry,
  derivePythPriceUpdateAccount,
  derivePythPushOraclePDA,
  deriveStakePool,
  deriveStakeVaultAuth,
  deriveVaultAuthority,
  detectDexType,
  detectLayout,
  detectSlabLayout,
  detectTokenProgram,
  discoverMarkets,
  discoverMarketsViaApi,
  discoverMarketsViaStaticBundle,
  encBool,
  encI128,
  encI64,
  encPubkey,
  encU128,
  encU16,
  encU32,
  encU64,
  encU8,
  encodeAcceptAdmin,
  encodeAdminForceClose,
  encodeAdvanceEpoch,
  encodeAdvanceOraclePhase,
  encodeAllocateMarket,
  encodeAttestCrossMargin,
  encodeAuditCrank,
  encodeBatchTradeCpi,
  encodeBatchTradeNoCpi,
  encodeBurnPositionNft,
  encodeCancelQueuedWithdrawal,
  encodeChallengeSettlement,
  encodeClaimEpochWithdrawal,
  encodeClaimQueuedWithdrawal,
  encodeClearPendingSettlement,
  encodeCloseAccount,
  encodeCloseLpVault,
  encodeCloseOrphanSlab,
  encodeCloseSlab,
  encodeCloseStaleSlabs,
  encodeConfigureAuthMark,
  encodeConfigureEwmaMark,
  encodeConfigureHybridOracle,
  encodeConvertReleasedPnl,
  encodeCreateInsuranceMint,
  encodeCreateLpVault,
  encodeCreateLpVaultV17,
  encodeDepositCollateral,
  encodeDepositFeeCredits,
  encodeDepositInsuranceLP,
  encodeDepositLpCollateral,
  encodeDepositToLpVault,
  encodeExecuteAdl,
  encodeExecuteRedemption,
  encodeFeedId,
  encodeForceCloseResolved,
  encodeFundMarketInsurance,
  encodeInitLP,
  encodeInitMarket,
  encodeInitMatcherCtx,
  encodeInitSharedVault,
  encodeInitUser,
  encodeKeeperCrank,
  encodeLiquidateAtOracle,
  encodeLpVaultCrankFees,
  encodeLpVaultDeposit,
  encodeLpVaultWithdraw,
  encodeMatcherInitPassive,
  encodeMintPositionNft,
  encodeNftBurn,
  encodeNftEmergencyBurn,
  encodeNftMint,
  encodeNftSettleFunding,
  encodePauseMarket,
  encodePermissionlessCrank,
  encodePushAuthMark,
  encodePushEwmaMark,
  encodeQueueWithdrawal,
  encodeQueueWithdrawalSV,
  encodeReclaimEmptyAccount,
  encodeReclaimSlabRent,
  encodeRenounceAdmin,
  encodeRequestRedeemLpShares,
  encodeRescueOrphanVault,
  encodeResolveDispute,
  encodeResolveMarket,
  encodeResolvePermissionless,
  encodeRestartAssetOracle,
  encodeSetDexPool,
  encodeSetDisputeParams,
  encodeSetInsuranceIsolation,
  encodeSetInsuranceWithdrawPolicy,
  encodeSetLpCollateralParams,
  encodeSetLpVaultPaused,
  encodeSetMaintenanceFee,
  encodeSetMatcherConfig,
  encodeSetMaxPnlCap,
  encodeSetNftProgramId,
  encodeSetOffsetPair,
  encodeSetOiCapMultiplier,
  encodeSetOiImbalanceHardBlock,
  encodeSetOraclePriceCap,
  encodeSetPendingSettlement,
  encodeSetPythOracle,
  encodeSetRiskThreshold,
  encodeSetWalletCap,
  encodeSettleAccount,
  encodeSlashCreationDeposit,
  encodeStakeAccrueFees,
  encodeStakeAdminResolveMarket,
  encodeStakeAdminSetHwmConfig,
  encodeStakeAdminSetInsurancePolicy,
  encodeStakeAdminSetMaintenanceFee,
  encodeStakeAdminSetOracleAuthority,
  encodeStakeAdminSetRiskThreshold,
  encodeStakeAdminSetTrancheConfig,
  encodeStakeAdminWithdrawInsurance,
  encodeStakeDeposit,
  encodeStakeDepositJunior,
  encodeStakeFlushToInsurance,
  encodeStakeInitPool,
  encodeStakeInitTradingPool,
  encodeStakeReturnInsurance,
  encodeStakeSetMarketResolved,
  encodeStakeTransferAdmin,
  encodeStakeUpdateConfig,
  encodeStakeWithdraw,
  encodeTopUpInsurance,
  encodeTradeCpi,
  encodeTradeCpiV2,
  encodeTradeNoCpi,
  encodeTransferOwnershipCpi,
  encodeTransferPortfolioOwnership,
  encodeTransferPositionOwnership,
  encodeUnpauseMarket,
  encodeUnresolveMarket,
  encodeUpdateAdmin,
  encodeUpdateAssetAuthority,
  encodeUpdateAuthority,
  encodeUpdateConfig,
  encodeUpdateHyperpMark,
  encodeUpdateMarkPrice,
  encodeUpdateRiskParams,
  encodeWithdrawCollateral,
  encodeWithdrawInsurance,
  encodeWithdrawInsuranceAsset,
  encodeWithdrawInsuranceLP,
  encodeWithdrawInsuranceLimited,
  encodeWithdrawLpCollateral,
  fetchAdlRankedPositions,
  fetchAdlRankings,
  fetchSlab,
  fetchTokenAccount,
  flushToInsuranceAccounts,
  formatResult,
  getAta,
  getAtaSync,
  getCurrentNetwork,
  getErrorHint,
  getErrorName,
  getMarketsByAddress,
  getMatcherProgramId,
  getNftProgramId,
  getProgramId,
  getStakeProgramId,
  getStaticMarkets,
  initPoolAccounts,
  isAccountUsed,
  isAdlTriggered,
  isLighthouseError,
  isLighthouseFailureInLogs,
  isLighthouseInstruction,
  isStandardToken,
  isToken2022,
  isV17Account,
  isV17MarketAccount,
  isValidChainlinkOracle,
  maxAccountIndex,
  packOiCap,
  parseAccount,
  parseAdlEvent,
  parseAllAccounts,
  parseAssetOracleProfileV17,
  parseChainlinkPrice,
  parseConfig,
  parseDexPool,
  parseEngine,
  parseErrorFromLogs,
  parseHeader,
  parseLpRedemption,
  parseLpVaultRegistry,
  parseParams,
  parsePortfolioV17,
  parsePositionNftAccount,
  parseUsedIndices,
  parseWrapperConfigV17,
  rankAdlPositions,
  readLastThrUpdateSlot,
  readNonce,
  registerStaticMarkets,
  requireDecimalUIntString,
  resolvePrice,
  safeBigInt,
  safeEnv,
  simulateOrSend,
  slabDataSize,
  slabDataSizeV1,
  stripLighthouseFromTransaction,
  stripLighthouseInstructions,
  v17MarketAccountLen,
  validateAmount,
  validateBps,
  validateI128,
  validateI64,
  validateIndex,
  validatePublicKey,
  validateSlabTierMatch,
  validateU128,
  validateU16,
  validateU64,
  withRetry,
  withdrawAccounts
};
//# sourceMappingURL=index.js.map