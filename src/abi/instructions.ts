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
  concatBytes,
} from "./encode.js";

/**
 * Instruction tags — exact match to Rust ix::Instruction::decode arm in the
 * v17 converged wrapper (percolator-prog @v17-convergence, source
 * src/v16_program.rs). Tags are gappy; every absent tag rejects with
 * InvalidInstructionData.
 *
 * v17 breaking changes vs v12.x:
 *   - Tags 37-73 are COMPLETELY different (toly renumbered 37-64, fork LP-vault
 *     moved 65-71→74-80, fork NFT-B3 kept 72/73, toly claimed 65-69).
 *   - Tag 32 UpdateAuthority: v17 has NO kind byte — just new_pubkey[32].
 *   - Tag 57 is now WithdrawInsuranceAsset{asset_index:u16, amount:u128}.
 *   - Tag 5 PermissionlessCrank: funding_rate_e9 arg MUST be hardcoded 0n by
 *     all callers — the program hard-rejects nonzero.
 *   - Domain fields: u8→u16 everywhere.
 */
export const IX_TAG = {
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
  TradeCpiV: 105,
} as const;
Object.freeze(IX_TAG);

/**
 * v17 slab version discriminator. Stored as u16 LE at byte offset 8 of every
 * percolator-owned account (market-group, portfolio, insurance-ledger, etc.).
 *
 * The v17 MAGIC is 0x5045_5243_5631_3600n ("PERCV16\0" as u64 LE). When
 * reading an account header, verify both MAGIC at [0..8] and VERSION at [8..10].
 */
export const EXPECTED_SLAB_VERSION = 16;

/**
 * v17 account header magic — "PERCV16\0" stored as little-endian u64.
 * bytes[0..8] = [0x00, 0x36, 0x31, 0x56, 0x43, 0x52, 0x45, 0x50]
 */
export const V17_SLAB_MAGIC = 0x5045_5243_5631_3600n;

function removedInstruction(name: string, tag: number, replacement?: string): never {
  const suffix = replacement ? ` Use ${replacement} instead.` : "";
  throw new Error(
    `${name} (tag ${tag}) is not accepted by the deployed wrapper program.${suffix}`,
  );
}

/**
 * InitMarket instruction data — v17 wire format.
 *
 * v17 wire: tag(1) + market_params(218 bytes) = 219 bytes total.
 *
 * BREAKING vs v12.x: admin, collateralMint, feedId, staleness, conf, invert,
 * and unitScale are NO LONGER encoded in instruction data. In v17 these are
 * provided as account metas or configured separately via ConfigureHybridOracle /
 * ConfigureEwmaMark. The v17 decoder reads only the market risk parameters.
 *
 * The old v12.x encodeInitMarket with admin[32]+mint[32]+feedId[32]+... inline
 * is completely rejected by the v17 program — the first field read is now
 * max_portfolio_assets(u16), which would parse the first 2 bytes of admin as
 * a u16 portfolio count, producing invalid config or rejection at every call.
 *
 * Use `InitMarketArgs` (v12 legacy, now deprecated) or the new
 * `InitMarketV17Args` with encodeInitMarket(). The v12-era fields that are
 * absent from v17 (feedId, staleness, conf, invert, unitScale, maxMaintFee,
 * warmupPeriodSlots) are silently ignored when present in InitMarketV17Args.
 */
/**
 * Optional 66-byte extended tail for InitMarket (S-4).
 *
 * When present and any field is non-zero the encoder appends a 66-byte block
 * in the exact order that the program reads it (percolator.rs:1516-1545):
 *   insurance_withdraw_max_bps          u16  (2 bytes)
 *   insurance_withdraw_cooldown_slots   u64  (8 bytes)
 *   permissionless_resolve_stale_slots  u64  (8 bytes)
 *   funding_horizon_slots               u64  (8 bytes)
 *   funding_k_bps                       u64  (8 bytes)
 *   funding_max_premium_bps             i64  (8 bytes)
 *   funding_max_bps_per_slot            i64  (8 bytes)
 *   mark_min_fee                        u64  (8 bytes)
 *   force_close_delay_slots             u64  (8 bytes)
 *   total = 2 + 8*8 = 66 bytes
 *
 * When absent (or all fields are zero) the encoder omits the tail and the
 * program treats all extended fields as their default zero values. This
 * preserves full backward compatibility with existing 344-byte payloads.
 */
export interface InitMarketExtendedTail {
  /** Maximum percentage of insurance fund withdrawable per cooldown window (0–10 000 bps). */
  insuranceWithdrawMaxBps: number;
  /** Slots that must elapse between insurance withdrawals. Required when insuranceWithdrawMaxBps > 0. */
  insuranceWithdrawCooldownSlots: bigint | string;
  /** Slots after which an unresolved market may be permissionlessly resolved. */
  permissionlessResolveStaleSlots: bigint | string;
  /** Funding rate horizon in slots (custom_funding_k denominator). */
  fundingHorizonSlots: bigint | string;
  /** Funding rate K parameter in bps (0 = disabled). */
  fundingKBps: bigint | string;
  /** Maximum funding premium in bps (i64 — may be negative to flip direction). */
  fundingMaxPremiumBps: bigint | string;
  /** Maximum funding rate change per slot in bps (i64). */
  fundingMaxBpsPerSlot: bigint | string;
  /** Minimum fee charged per mark-price update (u64, in collateral base units). */
  markMinFee: bigint | string;
  /** Slots to delay forced close after trigger condition is met (0 = immediate). */
  forceCloseDelaySlots: bigint | string;
  /**
   * Wave 9 (v2 tail): per-market `max_price_move_bps_per_slot` override.
   *
   * When omitted (or `undefined`), the encoder emits a 66-byte v1 tail and
   * the wrapper applies its deployment default
   * (`DEFAULT_MAX_PRICE_MOVE_BPS_PER_SLOT = 4`). When provided, the encoder
   * emits a 74-byte v2 tail with this value appended after
   * `forceCloseDelaySlots`. The wrapper rejects a zero v2 value with
   * `InvalidConfigParam`; the engine then re-validates the solvency
   * envelope at `init_in_place`.
   *
   * @since SDK 2.2.0 (Wave 9 InitMarket v2 wire-format)
   */
  maxPriceMoveBpsPerSlot?: bigint | string;
}

export interface InitMarketArgs {
  admin: PublicKey | string;
  collateralMint: PublicKey | string;
  indexFeedId: string;           // Pyth feed ID (hex string, 64 chars without 0x prefix). All zeros = Hyperp mode.
  maxStalenessSecs: bigint | string;
  confFilterBps: number;
  invert: number;
  unitScale: number;
  initialMarkPriceE6: bigint | string;
  // Fields between header and RiskParams (immutable after init, default 0 if omitted)
  maxMaintenanceFeePerSlot?: bigint | string;  // u128 — max maintenance fee per slot
  /** @deprecated v12.17-only field. v12.19 wrapper does not read it. Kept for source-compat, value ignored. */
  maxInsuranceFloor?: bigint | string;
  /** @deprecated v12.17-only field. v12.19 wrapper does not read it. Kept for source-compat, value ignored. */
  minOraclePriceCap?: bigint | string;
  // RiskParams block (16 fields, read by read_risk_params on-chain)
  /**
   * @deprecated Use hMin and hMax instead (v12.15+). Accepted as fallback for both hMin and hMax
   * when hMin/hMax are not provided.
   */
  warmupPeriodSlots?: bigint | string;
  /** Minimum horizon slots (v12.15+). Falls back to warmupPeriodSlots if not provided. */
  hMin?: bigint | string;
  /** Maximum horizon slots (v12.15+). Falls back to warmupPeriodSlots if not provided. */
  hMax?: bigint | string;
  maintenanceMarginBps: bigint | string;
  initialMarginBps: bigint | string;
  tradingFeeBps: bigint | string;
  maxAccounts: bigint | string;
  newAccountFee: bigint | string;
  insuranceFloor?: bigint | string;           // u128 — wire slot: old riskReductionThreshold → insurance_floor
  maintenanceFeePerSlot: bigint | string;
  maxCrankStalenessSlots: bigint | string;
  liquidationFeeBps: bigint | string;
  liquidationFeeCap: bigint | string;
  liquidationBufferBps?: bigint | string;     // u64 — wire compat: read and discarded by program
  minLiquidationAbs: bigint | string;
  /** @deprecated v12.17-only top-level field. v12.19 wrapper does not read a separate min_initial_deposit. Kept for source-compat, value ignored. */
  minInitialDeposit?: bigint | string;
  minNonzeroMmReq: bigint | string;           // u128 — must be > 0, < minNonzeroImReq
  minNonzeroImReq: bigint | string;           // u128 — must be > minNonzeroMmReq, <= minInitialDeposit
  /**
   * Optional 66-byte extended tail (S-4).
   * When present and any field is non-zero, appended after the 344-byte base payload.
   * When absent (or all zeros), the base 344-byte payload is sent and the program
   * uses default zero values for all extended fields.
   * @see InitMarketExtendedTail
   */
  extendedTail?: InitMarketExtendedTail;
}

/**
 * Encode a Pyth feed ID (hex string) to 32-byte Uint8Array.
 *
 * @deprecated feedId is no longer encoded in InitMarket instruction data in v17.
 * Oracle configuration is set separately via ConfigureHybridOracle (tag 34).
 * Retained as a utility for off-chain feed ID validation.
 */
export const HEX_RE = /^[0-9a-fA-F]{64}$/;

export function encodeFeedId(feedId: string): Uint8Array {
  const hex = feedId.startsWith("0x") ? feedId.slice(2) : feedId;
  if (!HEX_RE.test(hex)) {
    throw new Error(
      `Invalid feed ID: expected 64 hex chars, got "${hex.length === 64 ? "non-hex characters" : hex.length + " chars"}"`,
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 64; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(
        `Failed to parse hex byte at position ${i}: "${hex.substring(i, i + 2)}"`,
      );
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}

// v17 wire layout (v16_program.rs decode arm at tag 0):
//   tag(1) +
//   max_portfolio_assets(u16=2) +
//   h_min(u64=8) + h_max(u64=8) + initial_price(u64=8) +
//   min_nonzero_mm_req(u128=16) + min_nonzero_im_req(u128=16) +
//   maintenance_margin_bps(u64=8) + initial_margin_bps(u64=8) +
//   max_trading_fee_bps(u64=8) + trade_fee_base_bps(u64=8) +
//   liquidation_fee_bps(u64=8) +
//   liquidation_fee_cap(u128=16) + min_liquidation_abs(u128=16) +
//   max_price_move_bps_per_slot(u64=8) + max_accrual_dt_slots(u64=8) +
//   max_abs_funding_e9_per_slot(u64=8) + min_funding_lifetime_slots(u64=8) +
//   max_account_b_settlement_chunks(u64=8) + max_bankrupt_close_chunks(u64=8) +
//   max_bankrupt_close_lifetime_slots(u64=8) +
//   public_b_chunk_atoms(u128=16) + maintenance_fee_per_slot(u128=16)
// Sizes: u16(2) + u64×15(120) + u128×6(96) = 218 bytes payload + 1 byte tag = 219 total
const INIT_MARKET_V17_LEN = 219;

// Note: v12.x extended-tail constants and encodeExtendedTail helper have been
// removed in v17. The v17 encodeInitMarket encodes a fixed 227-byte payload
// with no optional tail — all parameters are required fields in the main body.

/**
 * InitMarket v17 argument interface.
 *
 * admin and collateralMint are passed as account metas (accounts[0] and
 * accounts[2] respectively), NOT in instruction data.
 *
 * Oracle configuration (feedId, staleness, confFilter, invert, unitScale) is
 * set separately via ConfigureHybridOracle (tag 34) or ConfigureEwmaMark (tag 35)
 * after the market is created.
 *
 * Field order in wire format matches v16_program.rs InitMarket decoder exactly:
 *   max_portfolio_assets, h_min, h_max, initial_price,
 *   min_nonzero_mm_req, min_nonzero_im_req,
 *   maintenance_margin_bps, initial_margin_bps,
 *   max_trading_fee_bps, trade_fee_base_bps,
 *   liquidation_fee_bps, liquidation_fee_cap, min_liquidation_abs,
 *   max_price_move_bps_per_slot, max_accrual_dt_slots,
 *   max_abs_funding_e9_per_slot, min_funding_lifetime_slots,
 *   max_account_b_settlement_chunks, max_bankrupt_close_chunks,
 *   max_bankrupt_close_lifetime_slots,
 *   public_b_chunk_atoms, maintenance_fee_per_slot.
 */
export interface InitMarketV17Args {
  /** Max number of portfolios (u16). Must be > 0 and <= WRAPPER_MAX_PORTFOLIO_ASSETS. */
  maxPortfolioAssets: number;
  /** Minimum funding horizon in slots (u64). */
  hMin: bigint | string;
  /** Maximum funding horizon in slots (u64). */
  hMax: bigint | string;
  /** Initial mark price in e6 units (u64). Must be > 0 and <= MAX_ORACLE_PRICE. */
  initialPrice: bigint | string;
  /** Minimum non-zero maintenance margin requirement (u128). */
  minNonzeroMmReq: bigint | string;
  /** Minimum non-zero initial margin requirement (u128). */
  minNonzeroImReq: bigint | string;
  /** Maintenance margin ratio in bps (u64). */
  maintenanceMarginBps: bigint | string;
  /** Initial margin ratio in bps (u64). */
  initialMarginBps: bigint | string;
  /** Maximum trading fee in bps (u64). Must be >= trade_fee_base_bps. */
  maxTradingFeeBps: bigint | string;
  /** Base trade fee in bps (u64). Must be <= max_trading_fee_bps. */
  tradeFeeBaseBps: bigint | string;
  /** Liquidation fee in bps (u64). */
  liquidationFeeBps: bigint | string;
  /** Liquidation fee cap in absolute units (u128). */
  liquidationFeeCap: bigint | string;
  /** Minimum liquidation size in absolute units (u128). */
  minLiquidationAbs: bigint | string;
  /** Maximum price movement per slot in bps (u64). */
  maxPriceMoveBpsPerSlot: bigint | string;
  /** Maximum accrual delta-time in slots (u64). */
  maxAccrualDtSlots: bigint | string;
  /** Maximum absolute funding rate in e9 per slot (u64). */
  maxAbsFundingE9PerSlot: bigint | string;
  /** Minimum funding lifetime in slots (u64). */
  minFundingLifetimeSlots: bigint | string;
  /** Maximum account-B settlement chunks per crank (u64). */
  maxAccountBSettlementChunks: bigint | string;
  /** Maximum bankrupt-close chunks per crank (u64). */
  maxBankruptCloseChunks: bigint | string;
  /** Maximum bankrupt-close lifetime in slots (u64). */
  maxBankruptCloseLifetimeSlots: bigint | string;
  /** Public-B chunk size in atoms (u128). */
  publicBChunkAtoms: bigint | string;
  /** Maintenance fee per slot in absolute units (u128). Must be <= MAX_PROTOCOL_FEE_ABS. */
  maintenanceFeePerSlot: bigint | string;
}

/**
 * Encode InitMarket instruction data (v17 wire format).
 *
 * Produces a 219-byte payload: tag(1) + market parameter fields (218 bytes).
 * admin and collateralMint go into account metas (accounts[0] and accounts[2]).
 *
 * The old v12.x `InitMarketArgs` interface is accepted for source-compat via
 * overload but the v12 fields (admin, collateralMint, feedId, staleness, conf,
 * invert, unitScale, maxMaintenanceFeePerSlot, extendedTail, warmupPeriodSlots,
 * newAccountFee, insuranceFloor, maxCrankStalenessSlots, liquidationBufferBps,
 * minInitialDeposit) are silently ignored — provide `InitMarketV17Args` instead.
 *
 * @param args  v17 market parameters (InitMarketV17Args)
 * @returns 227-byte Uint8Array
 *
 * @example
 * ```ts
 * const data = encodeInitMarket({
 *   maxPortfolioAssets: 256,
 *   hMin: 1000n,
 *   hMax: 100000n,
 *   initialPrice: 50_000_000_000n,
 *   minNonzeroMmReq: 1_000_000n,
 *   minNonzeroImReq: 2_000_000n,
 *   maintenanceMarginBps: 500n,
 *   initialMarginBps: 1000n,
 *   maxTradingFeeBps: 100n,
 *   tradeFeeBaseBps: 30n,
 *   liquidationFeeBps: 100n,
 *   liquidationFeeCap: 10_000_000n,
 *   minLiquidationAbs: 1_000_000n,
 *   maxPriceMoveBpsPerSlot: 4n,
 *   maxAccrualDtSlots: 600n,
 *   maxAbsFundingE9PerSlot: 1000n,
 *   minFundingLifetimeSlots: 50n,
 *   maxAccountBSettlementChunks: 10n,
 *   maxBankruptCloseChunks: 10n,
 *   maxBankruptCloseLifetimeSlots: 500n,
 *   publicBChunkAtoms: 1_000_000n,
 *   maintenanceFeePerSlot: 0n,
 * });
 * ```
 */
export function encodeInitMarket(args: InitMarketV17Args | InitMarketArgs): Uint8Array {
  // Detect v17 args by presence of maxPortfolioAssets (v17) vs admin (v12)
  const isV17Args = 'maxPortfolioAssets' in args;

  let maxPortfolioAssets: number;
  let hMin: bigint | string;
  let hMax: bigint | string;
  let initialPrice: bigint | string;
  let minNonzeroMmReq: bigint | string;
  let minNonzeroImReq: bigint | string;
  let maintenanceMarginBps: bigint | string;
  let initialMarginBps: bigint | string;
  let maxTradingFeeBps: bigint | string;
  let tradeFeeBaseBps: bigint | string;
  let liquidationFeeBps: bigint | string;
  let liquidationFeeCap: bigint | string;
  let minLiquidationAbs: bigint | string;
  let maxPriceMoveBpsPerSlot: bigint | string;
  let maxAccrualDtSlots: bigint | string;
  let maxAbsFundingE9PerSlot: bigint | string;
  let minFundingLifetimeSlots: bigint | string;
  let maxAccountBSettlementChunks: bigint | string;
  let maxBankruptCloseChunks: bigint | string;
  let maxBankruptCloseLifetimeSlots: bigint | string;
  let publicBChunkAtoms: bigint | string;
  let maintenanceFeePerSlot: bigint | string;

  if (isV17Args) {
    const v = args as InitMarketV17Args;
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
    // v12.x InitMarketArgs compat shim — map old fields to v17 layout.
    // Fields removed in v17 (admin, collateralMint, feedId, staleness, conf,
    // invert, unitScale, extendedTail) are silently ignored.
    const v = args as InitMarketArgs;
    const resolvedHMin = v.hMin ?? v.warmupPeriodSlots ?? 0n;
    const resolvedHMax = v.hMax ?? v.warmupPeriodSlots ?? 0n;
    maxPortfolioAssets = typeof v.maxAccounts === 'string' ? parseInt(v.maxAccounts, 10) : Number(v.maxAccounts);
    hMin = resolvedHMin;
    hMax = resolvedHMax;
    initialPrice = v.initialMarkPriceE6;
    minNonzeroMmReq = v.minNonzeroMmReq;
    minNonzeroImReq = v.minNonzeroImReq;
    maintenanceMarginBps = v.maintenanceMarginBps;
    initialMarginBps = v.initialMarginBps;
    // v12 tradingFeeBps maps to max_trading_fee_bps and trade_fee_base_bps
    maxTradingFeeBps = v.tradingFeeBps;
    tradeFeeBaseBps = v.tradingFeeBps;
    liquidationFeeBps = v.liquidationFeeBps;
    liquidationFeeCap = v.liquidationFeeCap;
    minLiquidationAbs = v.minLiquidationAbs;
    // v12 ExtendedTail fields mapped to v17 equivalents (default safe values)
    maxPriceMoveBpsPerSlot = v.extendedTail?.maxPriceMoveBpsPerSlot ?? 4n;
    maxAccrualDtSlots = v.maxCrankStalenessSlots ?? 0n;
    maxAbsFundingE9PerSlot = v.extendedTail?.fundingMaxBpsPerSlot ?? 1000n;
    minFundingLifetimeSlots = 0n;
    // #310: the v12 InitMarketArgs interface has no equivalent for the four fields below,
    // which control the permissionless B-settlement path — the ONLY mechanism for closing
    // bankrupt accounts and releasing insurance. Defaulting them to 0 (the old behavior)
    // PERMANENTLY DISABLED bankruptcy recovery for any market created via the shim. Default
    // them to functional values instead so v12-initialized markets stay recoverable; callers
    // wanting explicit control should migrate to InitMarketV17Args.
    maxAccountBSettlementChunks = 10n;
    maxBankruptCloseChunks = 10n;
    maxBankruptCloseLifetimeSlots = 500n;
    publicBChunkAtoms = 1_000_000n;
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
    encU128(maintenanceFeePerSlot),
  );

  if (data.length !== INIT_MARKET_V17_LEN) {
    throw new Error(
      `encodeInitMarket: expected ${INIT_MARKET_V17_LEN} bytes, got ${data.length}`,
    );
  }

  return data;
}

/**
 * InitPortfolio / InitUser instruction data.
 *
 * v17 wire: tag(1) only — 1 byte total.
 *
 * BREAKING vs v12.x: the feePayment(u64) arg was removed. The program
 * decoder at `1 => Self::InitPortfolio` reads no bytes after the tag byte.
 * Sending extra bytes causes garbage reads in downstream decoder arms.
 *
 * @example
 * ```ts
 * const data = encodeInitUser();
 * ```
 */
export interface InitUserArgs {
  /** @deprecated feePayment is ignored in v17 — kept for source compatibility only. */
  feePayment?: bigint | string;
}

export function encodeInitUser(_args?: InitUserArgs): Uint8Array {
  return new Uint8Array([IX_TAG.InitPortfolio]);
}

/**
 * InitLP (tag 2) — REMOVED in v17.
 *
 * Tag 2 has no decode arm in the v17 wrapper program. Calling this instruction
 * results in ProgramError::InvalidInstructionData on-chain.
 *
 * @deprecated Use the LP Vault flow (CreateLpVault tag 74) instead.
 */
export interface InitLPArgs {
  matcherProgram: PublicKey | string;
  matcherContext: PublicKey | string;
  feePayment: bigint | string;
}

export function encodeInitLP(_args: InitLPArgs): Uint8Array {
  return removedInstruction("InitLP", IX_TAG.InitLP, "CreateLpVault (tag 74)");
}

/**
 * DepositCollateral instruction data.
 *
 * v17 wire: tag(1) + amount(u128 LE) = 17 bytes.
 *
 * BREAKING vs v12.x: userIdx(u16) removed; amount promoted u64→u128.
 * The v17 decoder reads `amount: read_u128(&mut rest)?` at bytes [1..17].
 * Sending the old 11-byte payload (userIdx+u64) gives a 10-byte rest which
 * is 6 bytes short for read_u128 — InvalidInstructionData on every call.
 *
 * @param amount  Collateral to deposit (u128; supports sub-cent precision).
 *
 * @example
 * ```ts
 * const data = encodeDepositCollateral({ amount: 1_000_000n });
 * ```
 */
export interface DepositCollateralArgs {
  /** @deprecated userIdx is no longer needed — portfolios are identified by account key in v17. */
  userIdx?: number;
  amount: bigint | string;
}

export function encodeDepositCollateral(args: DepositCollateralArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.DepositCollateral),
    encU128(args.amount),
  );
}

/**
 * WithdrawCollateral instruction data.
 *
 * v17 wire: tag(1) + amount(u128 LE) = 17 bytes.
 *
 * BREAKING vs v12.x: userIdx(u16) removed; amount promoted u64→u128.
 * The v17 decoder reads `amount: read_u128(&mut rest)?` at bytes [1..17].
 * The old 11-byte payload gives a 10-byte rest — InvalidInstructionData.
 *
 * @param amount  Collateral to withdraw (u128).
 *
 * @example
 * ```ts
 * const data = encodeWithdrawCollateral({ amount: 500_000n });
 * ```
 */
export interface WithdrawCollateralArgs {
  /** @deprecated userIdx is no longer needed — portfolios are identified by account key in v17. */
  userIdx?: number;
  amount: bigint | string;
}

export function encodeWithdrawCollateral(args: WithdrawCollateralArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.WithdrawCollateral),
    encU128(args.amount),
  );
}

/**
 * PermissionlessCrank (tag 5) action byte values.
 *
 * Source: v16_program.rs Instruction::PermissionlessCrank handler.
 *   0 = FeeSweep  — accrue fees + dust sweep (no liquidation)
 *   1 = Liquidate — liquidate the portfolio identified by asset_index
 */
export const CrankAction = {
  FeeSweep: 0,
  Liquidate: 1,
} as const;

/**
 * PermissionlessCrank (tag 5) instruction args.
 *
 * v17 wire: tag(1) + action(u8) + asset_index(u16) + now_slot(u64) +
 *   funding_rate_e9(i128 HARDCODED=0) + close_q(u128) + fee_bps(u64) +
 *   recovery_reason(u8) = 47 bytes.
 *
 * CRITICAL: funding_rate_e9 is always hardcoded to 0n by this encoder.
 * The program hard-rejects any nonzero value with InvalidInstructionData.
 * Do NOT construct this payload manually and omit funding_rate_e9 — that
 * produces a truncated instruction (missing 16 bytes).
 *
 * @param action       CrankAction.FeeSweep or CrankAction.Liquidate.
 * @param assetIndex   Asset/domain index to operate on.
 * @param nowSlot      Current slot (for crank freshness check).
 * @param closeQ       Quantity to close (0 for FeeSweep).
 * @param feeBps       Fee in basis points.
 * @param recoveryReason Recovery reason byte (0 for normal operations).
 *
 * @example
 * ```ts
 * // Simple fee-sweep crank
 * const data = encodePermissionlessCrank({
 *   action: CrankAction.FeeSweep,
 *   assetIndex: 0,
 *   nowSlot: currentSlot,
 *   closeQ: 0n,
 *   feeBps: 0n,
 *   recoveryReason: 0,
 * });
 * ```
 */
export interface PermissionlessCrankArgs {
  action: number;
  assetIndex: number;
  nowSlot: bigint | string;
  closeQ: bigint | string;
  feeBps: bigint | string;
  recoveryReason: number;
}

export function encodePermissionlessCrank(args: PermissionlessCrankArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.PermissionlessCrank),
    encU8(args.action),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encI128(0n),           // funding_rate_e9 HARDCODED=0n (program rejects nonzero)
    encU128(args.closeQ),
    encU64(args.feeBps),
    encU8(args.recoveryReason),
  );
}

/**
 * @deprecated v12.17 KeeperCrank wire format is not accepted by v17.
 * Use encodePermissionlessCrank() instead.
 *
 * Retained for source-compat only. Will throw to prevent silent misuse.
 */
export interface KeeperCrankArgs {
  callerIdx: number;
  candidates?: unknown[];
}

export function encodeKeeperCrank(_args: KeeperCrankArgs): Uint8Array {
  throw new Error(
    "encodeKeeperCrank: v12.17 wire format is not accepted by the v17 wrapper. " +
    "Use encodePermissionlessCrank() instead."
  );
}

/**
 * TradeNoCpi instruction data (v17 wire format).
 *
 * v17 wire: tag(1) + asset_index(u16) + size_q(i128) + exec_price(u64) + fee_bps(u64)
 *   = 28 bytes.
 *
 * BREAKING vs v12.x: payload fields changed completely. v12 had lpIdx+userIdx+size;
 * v17 has asset_index+size_q+exec_price+fee_bps.
 *
 * @param assetIndex Asset/domain index.
 * @param sizeQ      Trade quantity (signed; positive=long, negative=short).
 * @param execPrice  Execution price in e6 units.
 * @param feeBps     Fee in basis points.
 *
 * @example
 * ```ts
 * const data = encodeTradeNoCpi({
 *   assetIndex: 0,
 *   sizeQ: 1_000_000n,
 *   execPrice: 50_000_000_000n,
 *   feeBps: 30n,
 * });
 * ```
 */
export interface TradeNoCpiArgs {
  assetIndex: number;
  sizeQ: bigint | string;
  execPrice: bigint | string;
  feeBps: bigint | string;
}

export function encodeTradeNoCpi(args: TradeNoCpiArgs): Uint8Array {
  const data = concatBytes(
    encU8(IX_TAG.TradeNoCpi),
    encU16(args.assetIndex),
    encI128(args.sizeQ),
    encU64(args.execPrice),
    encU64(args.feeBps),
  );
  if (data.length !== 35) {
    throw new Error(
      `encodeTradeNoCpi: expected 35 bytes (tag+u16+i128+u64+u64), got ${data.length}`,
    );
  }
  return data;
}

/**
 * LiquidateAtOracle (tag 7) — REMOVED in v17.
 *
 * Tag 7 has no decode arm in the v17 wrapper program. Sending this instruction
 * results in ProgramError::InvalidInstructionData on-chain.
 *
 * @deprecated Liquidations are handled via PermissionlessCrank (tag 5) in v17.
 */
export interface LiquidateAtOracleArgs {
  targetIdx: number;
}

export function encodeLiquidateAtOracle(_args: LiquidateAtOracleArgs): Uint8Array {
  return removedInstruction(
    "LiquidateAtOracle",
    IX_TAG.LiquidateAtOracle,
    "PermissionlessCrank (tag 5)",
  );
}

/**
 * ClosePortfolio / CloseAccount instruction data.
 *
 * v17 wire: tag(1) only — 1 byte total.
 *
 * BREAKING vs v12.x: userIdx(u16) removed. The v17 decoder at
 * `8 => Self::ClosePortfolio` reads no bytes after the tag. The extra 2
 * bytes from the old userIdx field cause InvalidInstructionData.
 *
 * @example
 * ```ts
 * const data = encodeCloseAccount();
 * ```
 */
export interface CloseAccountArgs {
  /** @deprecated userIdx is not read in v17; portfolios are identified by account key. */
  userIdx?: number;
}

export function encodeCloseAccount(_args?: CloseAccountArgs): Uint8Array {
  return new Uint8Array([IX_TAG.ClosePortfolio]);
}

/**
 * TopUpInsurance instruction data.
 *
 * v17 wire: tag(1) + amount(u128 LE) = 17 bytes.
 *
 * BREAKING vs v12.x: amount promoted u64→u128. The v17 decoder at tag 9
 * reads `amount: read_u128(&mut rest)?` which requires 16 bytes after the
 * tag. The old 8-byte u64 payload is 8 bytes short — InvalidInstructionData.
 *
 * @param amount  Amount to top up the insurance fund (u128).
 *
 * @example
 * ```ts
 * const data = encodeTopUpInsurance({ amount: 10_000_000n });
 * ```
 */
export interface TopUpInsuranceArgs {
  amount: bigint | string;
}

export function encodeTopUpInsurance(args: TopUpInsuranceArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.TopUpInsurance), encU128(args.amount));
}

/**
 * TradeCpi instruction data (v17 wire format).
 *
 * v17 wire: tag(1) + asset_index(u16) + size_q(i128) + fee_bps(u64) + limit_price(u64)
 *   = 28 bytes.
 *
 * BREAKING vs v12.x: payload fields changed. v12 had lpIdx+userIdx+size+limitPriceE6;
 * v17 has asset_index+size_q+fee_bps+limit_price.
 *
 * @param assetIndex Asset/domain index.
 * @param sizeQ      Trade quantity (signed).
 * @param feeBps     Fee in basis points.
 * @param limitPrice Limit price in e6 units. 0 = no limit (accept any price).
 *                   Buys: reject if exec_price > limit_price.
 *                   Sells: reject if exec_price < limit_price.
 *
 * @example
 * ```ts
 * const data = encodeTradeCpi({
 *   assetIndex: 0,
 *   sizeQ: 1_000_000n,
 *   feeBps: 30n,
 *   limitPrice: 51_000_000_000n,  // max price for a buy
 * });
 * ```
 */
export interface TradeCpiArgs {
  assetIndex: number;
  sizeQ: bigint | string;
  feeBps: bigint | string;
  /** Limit price in e6 units. 0 = no limit. */
  limitPrice: bigint | string;
}

export function encodeTradeCpi(args: TradeCpiArgs): Uint8Array {
  const data = concatBytes(
    encU8(IX_TAG.TradeCpi),
    encU16(args.assetIndex),
    encI128(args.sizeQ),
    encU64(args.feeBps),
    encU64(args.limitPrice),
  );
  if (data.length !== 35) {
    throw new Error(
      `encodeTradeCpi: expected 35 bytes (tag+u16+i128+u64+u64), got ${data.length}`,
    );
  }
  return data;
}

/**
 * @deprecated Tag 35 removed in v12.17. Use TradeCpi (tag 10) with limitPriceE6 instead.
 * TradeCpi now handles PDA bump internally. Sending tag 35 will fail with InvalidInstructionData.
 */
export interface TradeCpiV2Args {
  lpIdx: number;
  userIdx: number;
  size: bigint | string;
  bump: number;
}

/** @deprecated Tag 35 removed in v12.17. Use encodeTradeCpi with limitPriceE6 instead. */
export function encodeTradeCpiV2(_args: TradeCpiV2Args): Uint8Array {
  return removedInstruction("TradeCpiV2", IX_TAG.TradeCpiV, "encodeTradeCpi()");
}

/**
 * @deprecated Tag 36 removed in v12.17. Will fail on-chain with InvalidInstructionData.
 */
export interface UnresolveMarketArgs {
  confirmation: bigint | string;
}

/** @deprecated Tag 36 removed in v12.17. Will fail on-chain. */
export function encodeUnresolveMarket(_args: UnresolveMarketArgs): Uint8Array {
  return removedInstruction("UnresolveMarket", IX_TAG.UnresolveMarket, "encodeResolveMarket()");
}

/**
 * @deprecated Tag 11 removed in v12.17. Insurance floor is now set at InitMarket.
 * Sending this instruction will fail with InvalidInstructionData.
 */
export interface SetRiskThresholdArgs {
  newThreshold: bigint | string;
}

/** @deprecated Tag 11 removed in v12.17. Will fail on-chain. */
export function encodeSetRiskThreshold(_args: SetRiskThresholdArgs): Uint8Array {
  return removedInstruction("SetRiskThreshold", IX_TAG.SetRiskThreshold, "encodeInitMarket()");
}

/**
 * UpdateAdmin (tag 12) — REMOVED in v17.
 *
 * Tag 12 has no decode arm in the v17 wrapper program. Calling this instruction
 * results in ProgramError::InvalidInstructionData on-chain.
 *
 * @deprecated Use UpdateAuthority (tag 32) or UpdateAssetAuthority (tag 65) in v17.
 */
export interface UpdateAdminArgs {
  newAdmin: PublicKey | string;
}

/** @deprecated Tag 12 removed in v17. Will fail on-chain. */
export function encodeUpdateAdmin(_args: UpdateAdminArgs): Uint8Array {
  return removedInstruction(
    "UpdateAdmin",
    IX_TAG.UpdateAdmin,
    "UpdateAuthority (tag 32) or UpdateAssetAuthority (tag 65)",
  );
}

/**
 * CloseSlab instruction data (1 byte)
 */
export function encodeCloseSlab(): Uint8Array {
  return encU8(IX_TAG.CloseSlab);
}

/**
 * UpdateConfig instruction data.
 *
 * 35 bytes: tag(1) + funding_horizon_slots(8) + funding_k_bps(8) +
 * funding_max_premium_bps(8) + funding_max_e9_per_slot(8) +
 * tvl_insurance_cap_mult(2). Wire layout matches v12.19 wrapper at
 * src/percolator.rs:2027-2041 (handle_update_config decode).
 */
export interface UpdateConfigArgs {
  fundingHorizonSlots: bigint | string;
  fundingKBps: bigint | string;
  fundingMaxPremiumBps: bigint | string;
  fundingMaxBpsPerSlot: bigint | string;
  /**
   * u16 deposit cap multiplier. 0 disables the protocol-enforced cap.
   * Wrapper field added at src/percolator.rs:2031.
   */
  tvlInsuranceCapMult?: number;
}

/** @deprecated v12.x UpdateConfig (old tag 14). Not in v17. */
export function encodeUpdateConfig(_args: UpdateConfigArgs): Uint8Array {
  return removedInstruction("UpdateConfig (v12 tag 14 — not in v17)", IX_TAG.UpdateConfig, undefined);
}

/**
 * @deprecated Tag 15 removed in v12.17. Maintenance fee is set at InitMarket only.
 * Sending this instruction will fail with InvalidInstructionData.
 */
export interface SetMaintenanceFeeArgs {
  newFee: bigint | string;
}

/** @deprecated Tag 15 removed in v12.17. Will fail on-chain. */
export function encodeSetMaintenanceFee(_args: SetMaintenanceFeeArgs): Uint8Array {
  return removedInstruction("SetMaintenanceFee", IX_TAG.SetMaintenanceFee, "encodeInitMarket()");
}

/**
 * SetOraclePriceCap instruction data (9 bytes)
 * Set oracle price circuit breaker cap (admin only).
 *
 * max_change_e2bps: maximum oracle price movement per slot in 0.01 bps units.
 *   1_000_000 = 100% max move per slot.
 *
 * ⚠️ PERC-8191 (PR#150): cap=0 is NO LONGER accepted for admin-oracle markets.
 *   - Hyperp markets: rejected if cap < DEFAULT_HYPERP_PRICE_CAP_E2BPS (1000).
 *   - Admin-oracle markets: rejected if cap == 0 (circuit breaker bypass prevention).
 *   - Pyth-pinned markets: immune (oracle_authority zeroed), any value accepted.
 *
 * Use a non-zero cap for all admin-oracle and Hyperp markets.
 */
export interface SetOraclePriceCapArgs {
  maxChangeE2bps: bigint | string;
}

/** @deprecated v12.x SetOraclePriceCap (old tag 16). Not in v17. */
export function encodeSetOraclePriceCap(_args: SetOraclePriceCapArgs): Uint8Array {
  return removedInstruction("SetOraclePriceCap (v12 tag 16 — not in v17)", IX_TAG.SetOraclePriceCap, undefined);
}

/**
 * ResolveMode constants — retained for source compatibility with v12.x callers.
 *
 * @deprecated v17 ResolveMarket (tag 19) has no mode byte. These constants are
 * no longer encoded into the instruction data. They may be used in logging or
 * off-chain logic but must not be passed to encodeResolveMarket.
 */
export const RESOLVE_MODE_ORDINARY = 0 as const;
export const RESOLVE_MODE_DEGENERATE = 1 as const;
export type ResolveMode = typeof RESOLVE_MODE_ORDINARY | typeof RESOLVE_MODE_DEGENERATE;

/**
 * ResolveMarket instruction data.
 *
 * v17 wire: tag(1) only — 1 byte total.
 *
 * BREAKING vs v12.x PORT-1 / Wave-12-J: the mode byte has been REMOVED.
 * The v17 decoder at `19 => Self::ResolveMarket` reads no bytes after the
 * tag. Sending a 2-byte payload causes the extra byte to be consumed by the
 * next read in a subsequent call, corrupting the instruction stream.
 *
 * The `mode` argument is accepted for source compatibility but is silently ignored.
 *
 * @example
 * ```ts
 * const data = encodeResolveMarket();
 * ```
 */
export function encodeResolveMarket(_args: { mode?: ResolveMode } = {}): Uint8Array {
  return new Uint8Array([IX_TAG.ResolveMarket]);
}

/**
 * WithdrawInsurance instruction data.
 *
 * v17 wire: tag(1) + amount(u128 LE) = 17 bytes.
 *
 * BREAKING vs v12.x: amount(u128) is now REQUIRED. The v17 decoder at
 * tag 41 reads `amount: read_u128(&mut rest)?` — without 16 bytes of amount,
 * read_u128 returns Err(InvalidInstructionData). Every call with the old
 * 1-byte payload fails on devnet/mainnet.
 *
 * Withdraw insurance fund to admin (requires RESOLVED and all positions closed).
 *
 * @param amount  Amount to withdraw from the insurance fund (u128).
 *
 * @example
 * ```ts
 * const data = encodeWithdrawInsurance({ amount: 5_000_000n });
 * ```
 */
export interface WithdrawInsuranceArgs {
  amount: bigint | string;
}

export function encodeWithdrawInsurance(args: WithdrawInsuranceArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.WithdrawInsurance), encU128(args.amount));
}

/**
 * AdminForceClose instruction data (3 bytes)
 * Force-close any position at oracle price (admin only, skips margin checks).
 */
export interface AdminForceCloseArgs {
  targetIdx: number;
}

/** @deprecated v12.x AdminForceClose (old tag 17). Not in v17. */
export function encodeAdminForceClose(_args: AdminForceCloseArgs): Uint8Array {
  return removedInstruction("AdminForceClose (v12 tag 17 — not in v17)", IX_TAG.AdminForceClose, "encodeForceCloseAbandonedAsset() if applicable");
}

/**
 * @deprecated Tag 22 is now SetInsuranceWithdrawPolicy in v12.17.
 * This encoder sends the WRONG wire format (u64+u64 instead of pubkey+u64+u16+u64).
 * Use encodeSetInsuranceWithdrawPolicy instead.
 */
export interface UpdateRiskParamsArgs {
  initialMarginBps: bigint | string;
  maintenanceMarginBps: bigint | string;
  tradingFeeBps?: bigint | string;
}

/** @deprecated Use encodeSetInsuranceWithdrawPolicy (tag 22). This sends wrong wire format. */
export function encodeUpdateRiskParams(_args: UpdateRiskParamsArgs): Uint8Array {
  return removedInstruction(
    "UpdateRiskParams",
    IX_TAG.UpdateRiskParams,
    "encodeSetInsuranceWithdrawPolicy()",
  );
}

/**
 * On-chain confirmation code for RenounceAdmin (must match program constant).
 * ASCII "RENOUNCE" as u64 LE = 0x52454E4F554E4345.
 */
export const RENOUNCE_ADMIN_CONFIRMATION = 0x52454E4F554E4345n;

/**
 * On-chain confirmation code for UnresolveMarket (must match program constant).
 */
export const UNRESOLVE_CONFIRMATION = 0xDEAD_BEEF_CAFE_1234n;

/**
 * @deprecated Tag 23 is now WithdrawInsuranceLimited in v12.17.
 * This encoder sends the confirmation code as a withdrawal amount — DANGEROUS.
 * Use encodeWithdrawInsuranceLimited instead.
 */
export function encodeRenounceAdmin(): Uint8Array {
  return removedInstruction(
    "RenounceAdmin",
    IX_TAG.RenounceAdmin,
    "encodeWithdrawInsuranceLimited()",
  );
}

// ============================================================================
// PERC-627 / GH#1926: LpVaultWithdraw (tag 39)
// ============================================================================

/**
 * LpVaultWithdraw (Tag 39, PERC-627 / GH#1926 / PERC-8287) — burn LP vault tokens and
 * withdraw proportional collateral.
 *
 * **BREAKING (PR#170):** accounts[9] = creatorLockPda is now REQUIRED.
 * Always include `deriveCreatorLockPda(programId, slab)` at position 9.
 * Non-creator withdrawers pass the derived PDA; if no lock exists on-chain
 * the check is a no-op. Omitting this account causes `ExpectLenFailed` on-chain.
 *
 * Instruction data: tag(1) + lp_amount(8) = 9 bytes
 *
 * Accounts (use ACCOUNTS_LP_VAULT_WITHDRAW):
 *  [0] withdrawer        signer
 *  [1] slab              writable
 *  [2] withdrawerAta     writable
 *  [3] vault             writable
 *  [4] tokenProgram
 *  [5] lpVaultMint       writable
 *  [6] withdrawerLpAta   writable
 *  [7] vaultAuthority
 *  [8] lpVaultState      writable
 *  [9] creatorLockPda    writable  ← derive with deriveCreatorLockPda(programId, slab)
 *
 * @param lpAmount - Amount of LP vault tokens to burn.
 *
 * @example
 * ```ts
 * import { encodeLpVaultWithdraw, ACCOUNTS_LP_VAULT_WITHDRAW, buildAccountMetas } from "@percolator/sdk";
 * import { deriveCreatorLockPda, deriveVaultAuthority } from "@percolator/sdk";
 *
 * const [creatorLockPda] = deriveCreatorLockPda(PROGRAM_ID, slabKey);
 * const [vaultAuthority] = deriveVaultAuthority(PROGRAM_ID, slabKey);
 *
 * const data = encodeLpVaultWithdraw({ lpAmount: 1_000_000_000n });
 * const keys = buildAccountMetas(ACCOUNTS_LP_VAULT_WITHDRAW, {
 *   withdrawer, slab: slabKey, withdrawerAta, vault, tokenProgram: TOKEN_PROGRAM_ID,
 *   lpVaultMint, withdrawerLpAta, vaultAuthority, lpVaultState, creatorLockPda,
 * });
 * ```
 */
export interface LpVaultWithdrawArgs {
  /** Amount of LP vault tokens to burn. */
  lpAmount: bigint | string;
}

/**
 * @deprecated v12.x LpVaultWithdraw (tag 39 in v12, now alias 76=RequestRedeemLpShares in v17).
 * v17 uses a 2-step request/execute redemption flow — see encodeRequestRedeemLpShares.
 */
export function encodeLpVaultWithdraw(_args: LpVaultWithdrawArgs): Uint8Array {
  return removedInstruction(
    "LpVaultWithdraw (v12 wire, tag 39→76 alias — wire format changed)",
    IX_TAG.LpVaultWithdraw,
    "encodeRequestRedeemLpShares() + encodeExecuteRedemption()",
  );
}

/**
 * @deprecated v12.x PauseMarket (old tag 56). v17 reuses tag 56 for TopUpInsuranceDomain.
 */
export function encodePauseMarket(): Uint8Array {
  return removedInstruction("PauseMarket (v12 tag 56 — now TopUpInsuranceDomain in v17)", IX_TAG.PauseMarket, undefined);
}

/**
 * @deprecated v12.x UnpauseMarket (old tag 58). v17 reuses tag 58 for UpdateFeeRedirectPolicy.
 */
export function encodeUnpauseMarket(): Uint8Array {
  return removedInstruction("UnpauseMarket (v12 tag 58 — now UpdateFeeRedirectPolicy in v17)", IX_TAG.UnpauseMarket, undefined);
}

// ============================================================================
// PERC-117: Pyth Oracle CPI Instructions
// ============================================================================

/**
 * @deprecated Tag 32 removed in v12.17. Pyth oracle is configured at InitMarket via indexFeedId.
 * Sending this instruction will fail with InvalidInstructionData.
 */
export interface SetPythOracleArgs {
  feedId: Uint8Array;
  maxStalenessSecs: bigint;
  confFilterBps: number;
}

/** @deprecated Tag 32 removed in v12.17. Pyth is configured at InitMarket. */
export function encodeSetPythOracle(args: SetPythOracleArgs): Uint8Array {
  void args;
  return removedInstruction("SetPythOracle", IX_TAG.SetPythOracle, "encodeInitMarket()");
}

/**
 * Derive the expected Pyth PriceUpdateV2 account address for a given feed ID.
 * Uses PDA seeds: [shard_id(2), feed_id(32)] under the Pyth Receiver program.
 *
 * @param feedId  32-byte Pyth feed ID
 * @param shardId Shard index (default 0 for mainnet/devnet)
 */
export const PYTH_RECEIVER_PROGRAM_ID = 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ';

export async function derivePythPriceUpdateAccount(
  feedId: Uint8Array,
  shardId = 0,
): Promise<string> {
  if (!(feedId instanceof Uint8Array) || feedId.length !== 32) {
    throw new Error(`derivePythPriceUpdateAccount: feedId must be 32 bytes, got ${feedId?.length ?? "invalid"}`);
  }
  if (!Number.isInteger(shardId) || shardId < 0 || shardId > 0xffff) {
    throw new Error(`derivePythPriceUpdateAccount: shardId must be a u16, got ${shardId}`);
  }
  const { PublicKey } = await import('@solana/web3.js');
  const shardBuf = new Uint8Array(2);
  new DataView(shardBuf.buffer).setUint16(0, shardId, true);
  const [pda] = PublicKey.findProgramAddressSync(
    [shardBuf, feedId],
    new PublicKey(PYTH_RECEIVER_PROGRAM_ID),
  );
  return pda.toBase58();
}

// SetPythOracle tag (32) is already defined in IX_TAG above.

// PERC-118: Mark Price EMA Instructions
// ============================================================================

// Tag 33 — permissionless mark price EMA crank (defined in IX_TAG above).

/**
 * @deprecated Tag 33 removed in v12.17. Use UpdateHyperpMark (tag 34) for DEX-oracle markets.
 * Sending this instruction will fail with InvalidInstructionData.
 */
export function encodeUpdateMarkPrice(): Uint8Array {
  return removedInstruction("UpdateMarkPrice", IX_TAG.UpdateMarkPrice, "encodeUpdateHyperpMark()");
}

/**
 * Mark price EMA parameters (must match program/src/percolator.rs constants).
 */
export const MARK_PRICE_EMA_WINDOW_SLOTS = 72_000n;
export const MARK_PRICE_EMA_ALPHA_E6 = 2_000_000n / (MARK_PRICE_EMA_WINDOW_SLOTS + 1n);

/**
 * Compute the next EMA mark price step (TypeScript mirror of the on-chain function).
 */
export function computeEmaMarkPrice(
  markPrevE6: bigint,
  oracleE6: bigint,
  dtSlots: bigint,
  alphaE6 = MARK_PRICE_EMA_ALPHA_E6,
  capE2bps = 0n,
): bigint {
  if (oracleE6 === 0n) return markPrevE6;
  if (markPrevE6 === 0n || dtSlots === 0n) return oracleE6;

  let oracleClamped = oracleE6;
  if (capE2bps > 0n) {
    // Avoid overflow: divide early to reduce intermediate product
    const maxDelta = (markPrevE6 * capE2bps / 1_000_000n) * dtSlots;
    const lo = markPrevE6 > maxDelta ? markPrevE6 - maxDelta : 0n;
    const hi = markPrevE6 + maxDelta;
    if (oracleClamped < lo) oracleClamped = lo;
    if (oracleClamped > hi) oracleClamped = hi;
  }

  const effectiveAlpha = alphaE6 * dtSlots > 1_000_000n ? 1_000_000n : alphaE6 * dtSlots;
  const oneMinusAlpha = 1_000_000n - effectiveAlpha;

  return (oracleClamped * effectiveAlpha + markPrevE6 * oneMinusAlpha) / 1_000_000n;
}

// PERC-119: Hyperp EMA Oracle for Permissionless Tokens
// ============================================================================

// Tag 34 — permissionless Hyperp mark price oracle (defined in IX_TAG above).

/**
 * UpdateHyperpMark (Tag 34) — permissionless Hyperp EMA oracle crank.
 *
 * Reads the spot price from a PumpSwap, Raydium CLMM, or Meteora DLMM pool,
 * applies 8-hour EMA smoothing with circuit breaker, and writes the new mark
 * to authority_price_e6 on the slab.
 *
 * This is the core mechanism for permissionless token markets — no Pyth or
 * Chainlink feed is needed. The DEX AMM IS the oracle.
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [writable] Slab
 *   1. []         DEX pool account (PumpSwap / Raydium CLMM / Meteora DLMM)
 *   2. []         Clock sysvar (SysvarC1ock11111111111111111111111111111111)
 *   3..N []       Remaining accounts (e.g. PumpSwap vault0 + vault1)
 */
export function encodeUpdateHyperpMark(): Uint8Array {
  // v17: tag 34 is ConfigureHybridOracle (a large payload), NOT a 1-byte DEX-pool mark crank.
  // Emitting [34] would be decoded as ConfigureHybridOracle with an empty body → InvalidInstructionData.
  // The v12 hyperp DEX-pool mark mode was removed; fail loud instead of building a rejected tx.
  return removedInstruction(
    "UpdateHyperpMark (v12 DEX-pool mark crank — tag 34 is ConfigureHybridOracle in v17)",
    34,
    "ConfigureHybridOracle (tag 34) / ConfigureEwmaMark (tag 35), or PermissionlessCrank (tag 5) for mark refresh",
  );
}

// ============================================================================
// PERC-306: Per-Market Insurance Isolation
// ============================================================================

/**
 * @deprecated v12.x FundMarketInsurance (old tag 25). Not in v17.
 */
export function encodeFundMarketInsurance(_args: { amount: bigint }): Uint8Array {
  return removedInstruction("FundMarketInsurance (v12 tag 25 — not in v17)", IX_TAG.FundMarketInsurance, undefined);
}

/**
 * Set insurance isolation BPS for a market.
 * Accounts: [admin(signer), slab(writable)]
 */
export function encodeSetInsuranceIsolation(args: { bps: number }): Uint8Array {
  void args;
  return removedInstruction(
    "SetInsuranceIsolation",
    IX_TAG.SetInsuranceIsolation,
    "encodeFundMarketInsurance()",
  );
}

// ============================================================================
// NOTE: encodeExecuteAdl() was historically removed when it was discovered
// that PERC-305 was NOT implemented on-chain and tag 43 was ChallengeSettlement.
// PERC-305 (ExecuteAdl) is now live at tag 50. Encoder added below.
// ============================================================================

// ============================================================================
// PERC-309: QueueWithdrawal / ClaimQueuedWithdrawal / CancelQueuedWithdrawal
// ============================================================================

/**
 * QueueWithdrawal (Tag 47, PERC-309) — queue a large LP withdrawal.
 *
 * Creates a withdraw_queue PDA. The LP tokens are claimed in epoch tranches
 * via ClaimQueuedWithdrawal. Call CancelQueuedWithdrawal to abort.
 *
 * Accounts: [user(signer,writable), slab(writable), lpVaultState, withdrawQueue(writable), systemProgram]
 *
 * @param lpAmount - Amount of LP tokens to queue for withdrawal.
 *
 * @example
 * ```ts
 * const data = encodeQueueWithdrawal({ lpAmount: 1_000_000_000n });
 * ```
 */
/** @deprecated v12.x QueueWithdrawal (old tag 102). Not in v17. */
export function encodeQueueWithdrawal(_args: { lpAmount: bigint | string }): Uint8Array {
  return removedInstruction("QueueWithdrawal (v12 tag 102 — not in v17)", IX_TAG.QueueWithdrawal, "encodeRequestRedeemLpShares()");
}

/**
 * ClaimQueuedWithdrawal (Tag 48, PERC-309) — claim one epoch tranche from a queued withdrawal.
 *
 * Burns LP tokens and releases one tranche of SOL to the user.
 * Call once per epoch until epochs_remaining == 0.
 *
 * Accounts: [user(signer,writable), slab(writable), withdrawQueue(writable),
 *            lpVaultMint(writable), userLpAta(writable), vault(writable),
 *            userAta(writable), vaultAuthority, tokenProgram, lpVaultState(writable)]
 */
/** @deprecated v12.x ClaimQueuedWithdrawal (old tag 103). Not in v17. */
export function encodeClaimQueuedWithdrawal(): Uint8Array {
  return removedInstruction("ClaimQueuedWithdrawal (v12 tag 103 — not in v17)", IX_TAG.ClaimQueuedWithdrawal, undefined);
}

/**
 * CancelQueuedWithdrawal (Tag 49, PERC-309) — cancel a queued withdrawal, refund remaining LP.
 *
 * Closes the withdraw_queue PDA and returns its rent lamports to the user.
 * The queued LP amount that was not yet claimed is NOT refunded — it is burned.
 * Use only to abandon a partial withdrawal.
 *
 * Accounts: [user(signer,writable), slab, withdrawQueue(writable)]
 */
/** @deprecated v12.x CancelQueuedWithdrawal (old tag 104). Not in v17. */
export function encodeCancelQueuedWithdrawal(): Uint8Array {
  return removedInstruction("CancelQueuedWithdrawal (v12 tag 104 — not in v17)", IX_TAG.CancelQueuedWithdrawal, undefined);
}

// ============================================================================
// PERC-305: ExecuteAdl (Tag 50) — Auto-Deleverage
// ============================================================================

/**
 * ExecuteAdl (Tag 50, PERC-305) — auto-deleverage the most profitable position.
 *
 * Permissionless. Surgically closes or reduces `targetIdx` position when
 * `pnl_pos_tot > max_pnl_cap` on the market. The caller receives no reward —
 * the incentive is unblocking the market for normal trading.
 *
 * Requires `UpdateRiskParams.max_pnl_cap > 0` on the market.
 *
 * Accounts: [caller(signer), slab(writable), clock, oracle, ...backupOracles?]
 *
 * @param targetIdx - Account index of the position to deleverage.
 *
 * @example
 * ```ts
 * const data = encodeExecuteAdl({ targetIdx: 5 });
 * ```
 */
export interface ExecuteAdlArgs {
  targetIdx: number;
}

/** @deprecated v12.x ExecuteAdl (old tag 101). Not in v17. */
export function encodeExecuteAdl(_args: ExecuteAdlArgs): Uint8Array {
  return removedInstruction("ExecuteAdl (v12 tag 101 — not in v17)", IX_TAG.ExecuteAdl, undefined);
}

// ============================================================================
// CloseStaleSlabs (Tag 51) / ReclaimSlabRent (Tag 52) — Slab recovery
// ============================================================================

/**
 * CloseStaleSlabs (Tag 51) — close a slab of an invalid/old layout and recover rent SOL.
 *
 * Admin only. Skips slab_guard; validates header magic + admin authority instead.
 * Use for slabs created by old program layouts (e.g. pre-PERC-120 devnet deploys)
 * whose size does not match any current valid tier.
 *
 * Accounts: [dest(signer,writable), slab(writable)]
 */
/** @deprecated v12.x CloseStaleSlabs (old tag 100). Not in v17. */
export function encodeCloseStaleSlabs(): Uint8Array {
  return removedInstruction("CloseStaleSlabs (v12 tag 100 — not in v17)", IX_TAG.CloseStaleSlabs, undefined);
}

/**
 * ReclaimSlabRent (Tag 52) — reclaim rent from an uninitialised slab.
 *
 * For use when market creation failed mid-flow (slab funded but InitMarket not called).
 * The slab account must sign (proves the caller holds the slab keypair).
 * Cannot close an initialised slab (magic == PERCOLAT) — use CloseSlab (tag 13).
 *
 * Accounts: [dest(signer,writable), slab(signer,writable)]
 */
/** @deprecated v12.x ReclaimSlabRent (old tag 99). Not in v17. */
export function encodeReclaimSlabRent(): Uint8Array {
  return removedInstruction("ReclaimSlabRent (v12 tag 99 — not in v17)", IX_TAG.ReclaimSlabRent, undefined);
}

// ============================================================================
// AuditCrank (Tag 53) — Permissionless on-chain invariant check
// ============================================================================

/**
 * AuditCrank (Tag 53) — verify conservation invariants on-chain (permissionless).
 *
 * Walks all accounts and verifies: capital sum, pnl_pos_tot, total_oi, LP consistency,
 * and solvency. Sets FLAG_PAUSED on violation (with a 150-slot cooldown guard to
 * prevent DoS from transient failures).
 *
 * Accounts: [slab(writable)]
 *
 * @example
 * ```ts
 * const data = encodeAuditCrank();
 * ```
 */
/** @deprecated v12.x AuditCrank (old tag 91). Not in v17. */
export function encodeAuditCrank(): Uint8Array {
  return removedInstruction("AuditCrank (v12 tag 91 — not in v17)", IX_TAG.AuditCrank, undefined);
}

// ============================================================================
// SMART PRICE ROUTER — quote computation for LP selection
// ============================================================================

/**
 * Parsed vAMM matcher parameters (from on-chain matcher context account)
 */
export interface VammMatcherParams {
  mode: number;                    // 0 = Passive, 1 = vAMM
  tradingFeeBps: number;
  baseSpreadBps: number;
  maxTotalBps: number;
  impactKBps: number;
  liquidityNotionalE6: bigint;
}

/** Magic bytes identifying a vAMM matcher context: "PERCMATC" as u64 LE = 0x504552434d415443 */
export const VAMM_MAGIC = 0x504552434d415443n;
/** Alias matching the Rust constant name for parity tests */
export const MATCHER_MAGIC = VAMM_MAGIC;

/** Offset where matcher return is written in the context account (always 0 per ABI) */
export const CTX_RETURN_OFFSET = 0;
/** Byte length of the MatcherReturn section of the context account */
export const MATCHER_RETURN_LEN = 64;
/** Offset into matcher context where vAMM params start (= MATCHER_RETURN_LEN) */
export const CTX_VAMM_OFFSET = 64;
/** Byte length of the MatcherCtx (vAMM state) section of the context account */
export const CTX_VAMM_LEN = 256;
/** Total matcher context account size: MATCHER_RETURN_LEN + CTX_VAMM_LEN */
export const MATCHER_CONTEXT_LEN = 320;
/** Byte length of a MatcherCall instruction (tag 0 CPI payload) */
export const MATCHER_CALL_LEN = 67;
/**
 * Byte length of an InitMatcherCtx instruction payload sent to the matcher program.
 * Layout: tag(1) + kind(1) + trading_fee_bps(4) + base_spread_bps(4) +
 *   max_total_bps(4) + impact_k_bps(4) + liquidity_notional_e6(16) +
 *   max_fill_abs(16) + max_inventory_abs(16) + fee_to_insurance_bps(2) +
 *   skew_spread_mult_bps(2) + lp_account_id(8) = 78
 */
export const INIT_CTX_LEN = 78;

const BPS_DENOM = 10_000n;

/**
 * Compute execution price for a given LP quote.
 * For buys (isLong=true): price above oracle.
 * For sells (isLong=false): price below oracle.
 */
export function computeVammQuote(
  params: VammMatcherParams,
  oraclePriceE6: bigint,
  tradeSize: bigint,
  isLong: boolean,
): bigint {
  const absSize = tradeSize < 0n ? -tradeSize : tradeSize;
  const absNotionalE6 = (absSize * oraclePriceE6) / 1_000_000n;

  // Impact for vAMM mode
  let impactBps = 0n;
  if (params.mode === 1 && params.liquidityNotionalE6 > 0n) {
    impactBps = (absNotionalE6 * BigInt(params.impactKBps)) / params.liquidityNotionalE6;
  }

  // Total = base_spread + trading_fee + impact, capped at max_total
  const maxTotal = BigInt(params.maxTotalBps);
  const baseFee = BigInt(params.baseSpreadBps) + BigInt(params.tradingFeeBps);
  const maxImpact = maxTotal > baseFee ? maxTotal - baseFee : 0n;
  const clampedImpact = impactBps < maxImpact ? impactBps : maxImpact;
  let totalBps = baseFee + clampedImpact;
  if (totalBps > maxTotal) totalBps = maxTotal;

  if (isLong) {
    return (oraclePriceE6 * (BPS_DENOM + totalBps)) / BPS_DENOM;
  } else {
    // Prevent underflow: if totalBps >= BPS_DENOM, price would go negative
    if (totalBps >= BPS_DENOM) return 1n; // minimum 1 micro-dollar
    return (oraclePriceE6 * (BPS_DENOM - totalBps)) / BPS_DENOM;
  }
}

// ============================================================================
// PERC-622: AdvanceOraclePhase (permissionless crank)
// ============================================================================

/**
 * AdvanceOraclePhase (Tag 56) — permissionless oracle phase advancement.
 *
 * Checks if a market should transition from Phase 0→1→2 based on
 * time elapsed and cumulative volume. Anyone can call this.
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [writable] Slab
 */
/** @deprecated v12.x AdvanceOraclePhase (old tag 92). Not in v17. */
export function encodeAdvanceOraclePhase(): Uint8Array {
  return removedInstruction("AdvanceOraclePhase (v12 tag 92 — not in v17)", IX_TAG.AdvanceOraclePhase, undefined);
}

/** Oracle phase constants matching on-chain values */
export const ORACLE_PHASE_NASCENT = 0;
export const ORACLE_PHASE_GROWING = 1;
export const ORACLE_PHASE_MATURE = 2;

/** Phase transition thresholds (must match program constants) */
export const PHASE1_MIN_SLOTS = 648_000n;         // ~72h at 400ms
export const PHASE1_VOLUME_MIN_SLOTS = 36_000n;    // ~4h at 400ms
export const PHASE2_VOLUME_THRESHOLD = 100_000_000_000n; // $100K in e6
export const PHASE2_MATURITY_SLOTS = 3_024_000n;   // ~14 days at 400ms

/**
 * Check if an oracle phase transition is due (TypeScript mirror of on-chain logic).
 *
 * @returns [newPhase, shouldTransition]
 */
export function checkPhaseTransition(
  currentSlot: bigint,
  marketCreatedSlot: bigint,
  oraclePhase: number,
  cumulativeVolumeE6: bigint,
  phase2DeltaSlots: number,
  hasMatureOracle: boolean,
): [number, boolean] {
  switch (oraclePhase) {
    case 0: {
      const elapsed = currentSlot - (marketCreatedSlot > 0n ? marketCreatedSlot : currentSlot);
      const timeReady = elapsed >= PHASE1_MIN_SLOTS;
      const volumeReady = elapsed >= PHASE1_VOLUME_MIN_SLOTS
        && cumulativeVolumeE6 >= PHASE2_VOLUME_THRESHOLD;
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

// ============================================================================
// PERC-629: Dynamic Creation Deposit
// ============================================================================

/**
 * SlashCreationDeposit (Tag 58) — permissionless: slash a market creator's deposit
 * after the spam grace period has elapsed (PERC-629).
 *
 * **WARNING**: Tag 58 is reserved in tags.rs but has NO instruction decoder or
 * handler in the on-chain program. Sending this instruction will fail with
 * `InvalidInstructionData`. Do not use until the on-chain handler is deployed.
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [signer]           Caller (anyone)
 *   1. []                 Slab
 *   2. [writable]         Creator history PDA
 *   3. [writable]         Insurance vault
 *   4. [writable]         Treasury
 *   5. []                 System program
 *
 * @deprecated Not yet implemented on-chain — will fail with InvalidInstructionData.
 */
export function encodeSlashCreationDeposit(): Uint8Array {
  return removedInstruction("SlashCreationDeposit", IX_TAG.SlashCreationDeposit);
}

// ============================================================================
// PERC-628: Elastic Shared Vault + Epoch Withdrawals
// ============================================================================

/**
 * InitSharedVault (Tag 59) — admin: create the global shared vault PDA (PERC-628).
 *
 * Instruction data: tag(1) + epochDurationSlots(8) + maxMarketExposureBps(2) = 11 bytes
 *
 * Accounts:
 *   0. [signer]           Admin
 *   1. [writable]         Shared vault PDA
 *   2. []                 System program
 */
export interface InitSharedVaultArgs {
  epochDurationSlots: bigint | string;
  maxMarketExposureBps: number;
}

/** @deprecated v12.x InitSharedVault (old tag 94). Not in v17. */
export function encodeInitSharedVault(_args: InitSharedVaultArgs): Uint8Array {
  return removedInstruction("InitSharedVault (v12 tag 94 — not in v17)", IX_TAG.InitSharedVault, undefined);
}

/**
 * AllocateMarket (Tag 60) — admin: allocate virtual liquidity from the shared vault
 * to a market (PERC-628).
 *
 * Instruction data: tag(1) + amount(16) = 17 bytes
 *
 * Accounts:
 *   0. [signer]           Admin
 *   1. []                 Slab
 *   2. [writable]         Shared vault PDA
 *   3. [writable]         Market alloc PDA
 *   4. []                 System program
 */
export interface AllocateMarketArgs {
  amount: bigint | string;
}

/** @deprecated v12.x AllocateMarket (old tag 95). Not in v17. */
export function encodeAllocateMarket(_args: AllocateMarketArgs): Uint8Array {
  return removedInstruction("AllocateMarket (v12 tag 95 — not in v17)", IX_TAG.AllocateMarket, undefined);
}

/**
 * QueueWithdrawalSV (Tag 61) — user: queue a withdrawal request for the current
 * epoch (PERC-628). Tokens are locked until the epoch elapses.
 *
 * Instruction data: tag(1) + lpAmount(8) = 9 bytes
 *
 * Accounts:
 *   0. [signer]           User
 *   1. [writable]         Shared vault PDA
 *   2. [writable]         Withdraw request PDA
 *   3. []                 System program
 */
export interface QueueWithdrawalSVArgs {
  lpAmount: bigint | string;
}

/** @deprecated v12.x QueueWithdrawalSV (old tag 96). Not in v17. */
export function encodeQueueWithdrawalSV(_args: QueueWithdrawalSVArgs): Uint8Array {
  return removedInstruction("QueueWithdrawalSV (v12 tag 96 — not in v17)", IX_TAG.QueueWithdrawalSV, undefined);
}

/**
 * ClaimEpochWithdrawal (Tag 62) — user: claim a queued withdrawal after the epoch
 * has elapsed (PERC-628). Receives pro-rata collateral from the vault.
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [signer]           User
 *   1. [writable]         Shared vault PDA
 *   2. [writable]         Withdraw request PDA
 *   3. []                 Slab
 *   4. [writable]         Vault
 *   5. [writable]         User ATA
 *   6. []                 Vault authority
 *   7. []                 Token program
 */
/** @deprecated v12.x ClaimEpochWithdrawal (old tag 97). Not in v17. */
export function encodeClaimEpochWithdrawal(): Uint8Array {
  return removedInstruction("ClaimEpochWithdrawal (v12 tag 97 — not in v17)", IX_TAG.ClaimEpochWithdrawal, undefined);
}

/**
 * AdvanceEpoch (Tag 63) — permissionless crank: move the shared vault to the next
 * epoch once `epoch_duration_slots` have elapsed (PERC-628).
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [signer]           Caller (anyone)
 *   1. [writable]         Shared vault PDA
 */
/** @deprecated v12.x AdvanceEpoch (old tag 98). Not in v17. */
export function encodeAdvanceEpoch(): Uint8Array {
  return removedInstruction("AdvanceEpoch (v12 tag 98 — not in v17)", IX_TAG.AdvanceEpoch, undefined);
}

// PERC-628: Tag 63 ─────────────────────────────────────────────────────────

// PERC-8110 ────────────────────────────────────────────────────────────────

/**
 * SetOiImbalanceHardBlock (Tag 71, PERC-8110) — set OI imbalance hard-block threshold (admin only).
 *
 * When `|long_oi − short_oi| / total_oi * 10_000 >= threshold_bps`, any new trade that would
 * *increase* the imbalance is rejected with `OiImbalanceHardBlock` (error code 59).
 *
 * - `threshold_bps = 0`: hard block disabled.
 * - `threshold_bps = 8_000`: block trades that push skew above 80%.
 * - `threshold_bps = 10_000`: never allow >100% skew (always blocks one side when oi > 0).
 *
 * Instruction data layout: tag(1) + threshold_bps(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer]   admin
 *   1. [writable] slab
 *
 * @example
 * ```ts
 * const ix = new TransactionInstruction({
 *   programId: PROGRAM_ID,
 *   keys: buildAccountMetas(ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK, { admin, slab }),
 *   data: Buffer.from(encodeSetOiImbalanceHardBlock({ thresholdBps: 8_000 })),
 * });
 * ```
 */
/** @deprecated v12.x SetOiImbalanceHardBlock (old tag 71). Not in v17. */
export function encodeSetOiImbalanceHardBlock(_args: { thresholdBps: number }): Uint8Array {
  return removedInstruction("SetOiImbalanceHardBlock (v12 tag 71 — not in v17)", IX_TAG.SetOiImbalanceHardBlock, undefined);
}

// ============================================================================
// PERC-608 — Position NFT instructions (tags 64–69)
// ============================================================================

/**
 * MintPositionNft (Tag 64, PERC-608) — mint a Token-2022 NFT representing a position.
 *
 * Creates a PositionNft PDA + Token-2022 mint with metadata, then mints 1 NFT to the
 * position owner's ATA. The NFT represents ownership of `user_idx` in the slab.
 *
 * The program creates the ATA internally via CPI when the 11th account (Associated Token
 * Program) is provided. This is required because the NFT mint PDA doesn't exist until the
 * program creates it, so the ATA can't be created in a preceding instruction.
 *
 * Instruction data layout: tag(1) + user_idx(2) = 3 bytes
 *
 * Accounts (11):
 *   0.  [signer, writable] payer
 *   1.  [writable]         slab
 *   2.  [writable]         position_nft PDA  (created — seeds: ["position_nft", slab, user_idx_u16_le])
 *   3.  [writable]         nft_mint PDA      (created — seeds: ["position_nft_mint", slab, user_idx_u16_le])
 *   4.  [writable]         owner_ata         (Token-2022 ATA for nft_mint — created by program if absent)
 *   5.  [signer]           owner             (must match engine account owner)
 *   6.  []                 vault_authority PDA (seeds: ["vault", slab])
 *   7.  []                 token_2022_program (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb)
 *   8.  []                 system_program
 *   9.  []                 rent sysvar
 *   10. []                 associated_token_program (ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL)
 */
export interface MintPositionNftArgs {
  userIdx: number;
}

/**
 * @deprecated v12.x MintPositionNft (old tag 64). v17 reuses tag 64 for ForceCloseAbandonedAsset.
 * NFT operations in v17 use the standalone percolator-nft program; use SetNftProgramId(73)
 * to register it and TransferPortfolioOwnership(72) for B-3 transfers.
 */
export function encodeMintPositionNft(_args: MintPositionNftArgs): Uint8Array {
  return removedInstruction(
    "MintPositionNft (v12 tag 64 — COLLIDES with v17 ForceCloseAbandonedAsset)",
    IX_TAG.MintPositionNft,
    "percolator-nft program",
  );
}

/**
 * TransferPositionOwnership (Tag 65, PERC-608) — transfer an open position to a new owner.
 *
 * Transfers the Token-2022 NFT from current owner to new owner and updates the on-chain
 * engine account's owner field. Requires `pending_settlement == 0`.
 *
 * Instruction data layout: tag(1) + user_idx(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer, writable] current_owner
 *   1. [writable]         slab
 *   2. [writable]         position_nft PDA
 *   3. [writable]         nft_mint PDA
 *   4. [writable]         current_owner_ata  (source Token-2022 ATA)
 *   5. [writable]         new_owner_ata      (destination Token-2022 ATA)
 *   6. []                 new_owner
 *   7. []                 token_2022_program
 */
export interface TransferPositionOwnershipArgs {
  userIdx: number;
}

/**
 * @deprecated v12.x TransferPositionOwnership (old tag 65). v17 reuses tag 65 for UpdateAssetAuthority.
 * Use encodeTransferPortfolioOwnership() (tag 72) for B-3 ownership transfer in v17.
 */
export function encodeTransferPositionOwnership(_args: TransferPositionOwnershipArgs): Uint8Array {
  return removedInstruction(
    "TransferPositionOwnership (v12 tag 65 — COLLIDES with v17 UpdateAssetAuthority)",
    IX_TAG.TransferPositionOwnership,
    "encodeTransferPortfolioOwnership() (tag 72)",
  );
}

/**
 * BurnPositionNft (Tag 66, PERC-608) — burn the Position NFT when a position is closed.
 *
 * Burns the NFT, closes the PositionNft PDA and the mint PDA, returning rent to the owner.
 * Can only be called after the position is fully closed (size == 0).
 *
 * Instruction data layout: tag(1) + user_idx(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer, writable] owner
 *   1. [writable]         slab
 *   2. [writable]         position_nft PDA  (closed — rent to owner)
 *   3. [writable]         nft_mint PDA      (closed via Token-2022 close_account)
 *   4. [writable]         owner_ata         (Token-2022 ATA, balance burned)
 *   5. []                 vault_authority PDA
 *   6. []                 token_2022_program
 */
export interface BurnPositionNftArgs {
  userIdx: number;
}

/**
 * @deprecated v12.x BurnPositionNft (old tag 66). v17 reuses tag 66 for BatchTradeNoCpi.
 * NFT burn is handled by the standalone percolator-nft program in v17.
 */
export function encodeBurnPositionNft(_args: BurnPositionNftArgs): Uint8Array {
  return removedInstruction(
    "BurnPositionNft (v12 tag 66 — COLLIDES with v17 BatchTradeNoCpi)",
    IX_TAG.BurnPositionNft,
    "percolator-nft program",
  );
}

/**
 * SetPendingSettlement (Tag 67, PERC-608) — keeper sets the pending_settlement flag.
 *
 * Called by the keeper/admin before performing a funding settlement transfer.
 * Blocks NFT transfers until ClearPendingSettlement is called.
 * Admin-only (protected by GH#1475 keeper allowlist guard).
 *
 * Instruction data layout: tag(1) + user_idx(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer]   keeper / admin
 *   1. []         slab  (read — for PDA verification + admin check)
 *   2. [writable] position_nft PDA
 */
export interface SetPendingSettlementArgs {
  userIdx: number;
}

/**
 * @deprecated v12.x SetPendingSettlement (old tag 67). v17 reuses tag 67 for BatchTradeCpi.
 */
export function encodeSetPendingSettlement(_args: SetPendingSettlementArgs): Uint8Array {
  return removedInstruction(
    "SetPendingSettlement (v12 tag 67 — COLLIDES with v17 BatchTradeCpi)",
    IX_TAG.SetPendingSettlement,
    "percolator-nft program",
  );
}

/**
 * ClearPendingSettlement (Tag 68, PERC-608) — keeper clears the pending_settlement flag.
 *
 * Called by the keeper/admin after KeeperCrank has run and funding is settled.
 * Admin-only (protected by GH#1475 keeper allowlist guard).
 *
 * Instruction data layout: tag(1) + user_idx(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer]   keeper / admin
 *   1. []         slab  (read — for PDA verification + admin check)
 *   2. [writable] position_nft PDA
 */
export interface ClearPendingSettlementArgs {
  userIdx: number;
}

/**
 * @deprecated v12.x ClearPendingSettlement (old tag 68). v17 reuses tag 68 for SetMatcherConfig.
 */
export function encodeClearPendingSettlement(_args: ClearPendingSettlementArgs): Uint8Array {
  return removedInstruction(
    "ClearPendingSettlement (v12 tag 68 — COLLIDES with v17 SetMatcherConfig)",
    IX_TAG.ClearPendingSettlement,
    "percolator-nft program",
  );
}

/**
 * TransferOwnershipCpi (Tag 69, PERC-608) — internal CPI target for percolator-nft TransferHook.
 *
 * Called by the Token-2022 TransferHook on the percolator-nft program during an NFT transfer.
 * Updates the engine account's owner field to the new_owner public key.
 * NOT intended for direct external use — always called via Token-2022 CPI.
 *
 * Instruction data layout: tag(1) + user_idx(2) + new_owner(32) = 35 bytes
 *
 * Accounts:
 *   0. [signer]   nft TransferHook program (CPI caller)
 *   1. [writable] slab
 *   (remaining accounts per Token-2022 ExtraAccountMeta spec)
 */
export interface TransferOwnershipCpiArgs {
  userIdx: number;
  newOwner: PublicKey | string;
}

/**
 * @deprecated v12.x TransferOwnershipCpi (old tag 69). v17 reuses tag 69 for RestartAssetOracle.
 */
export function encodeTransferOwnershipCpi(_args: TransferOwnershipCpiArgs): Uint8Array {
  return removedInstruction(
    "TransferOwnershipCpi (v12 tag 69 — COLLIDES with v17 RestartAssetOracle)",
    IX_TAG.TransferOwnershipCpi,
    "percolator-nft transfer hook",
  );
}

// ============================================================================
// PERC-8111 — SetWalletCap (tag 70)
// ============================================================================

/**
 * SetWalletCap (Tag 70, PERC-8111) — set the per-wallet position cap (admin only).
 *
 * Limits the maximum absolute position size any single wallet may hold on this market.
 * Enforced on every trade (TradeNoCpi + TradeCpi) after execute_trade.
 *
 * - `capE6 = 0`: disable per-wallet cap (no limit, default).
 * - `capE6 > 0`: max |position_size| in e6 units ($1 = 1_000_000).
 *   Phase 1 launch value: 1_000_000_000n ($1,000).
 *
 * When a trade would breach the cap, the on-chain error `WalletPositionCapExceeded`
 * (error code 58) is returned.
 *
 * Instruction data layout: tag(1) + cap_e6(8) = 9 bytes
 *
 * Accounts:
 *   0. [signer]   admin
 *   1. [writable] slab
 *
 * @example
 * ```ts
 * // Set $1K per-wallet cap
 * const ix = new TransactionInstruction({
 *   programId: PROGRAM_ID,
 *   keys: buildAccountMetas(ACCOUNTS_SET_WALLET_CAP, [admin, slab]),
 *   data: Buffer.from(encodeSetWalletCap({ capE6: 1_000_000_000n })),
 * });
 *
 * // Disable cap
 * const disableIx = new TransactionInstruction({
 *   programId: PROGRAM_ID,
 *   keys: buildAccountMetas(ACCOUNTS_SET_WALLET_CAP, [admin, slab]),
 *   data: Buffer.from(encodeSetWalletCap({ capE6: 0n })),
 * });
 * ```
 */
export interface SetWalletCapArgs {
  /** Max position size in e6 units. 0 = disabled. $1 = 1_000_000n, $1K = 1_000_000_000n. */
  capE6: bigint | string;
}

/** @deprecated v12.x SetWalletCap (old tag 70). Not in v17. */
export function encodeSetWalletCap(_args: SetWalletCapArgs): Uint8Array {
  return removedInstruction("SetWalletCap (v12 tag 70 — not in v17)", IX_TAG.SetWalletCap, undefined);
}

// ============================================================================
// InitMatcherCtx — CPI to matcher program to initialize a matcher context (tag 75)
// ============================================================================

/**
 * InitMatcherCtx (Tag 75) — admin initializes the matcher context account for an LP slot.
 *
 * The matcher program (DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX) requires its context
 * account to be initialized before TradeCpi can work. Only the percolator program can sign
 * as the LP PDA via invoke_signed, so this instruction acts as the trusted initializer.
 *
 * Instruction data layout: tag(1) + lp_idx(2) + kind(1) + trading_fee_bps(4) +
 *   base_spread_bps(4) + max_total_bps(4) + impact_k_bps(4) +
 *   liquidity_notional_e6(16) + max_fill_abs(16) + max_inventory_abs(16) +
 *   fee_to_insurance_bps(2) + skew_spread_mult_bps(2) = 72 bytes
 *
 * Accounts:
 *   0. [signer]   admin
 *   1. []         slab (program-owned; used to verify admin + LP slot)
 *   2. [writable] matcherCtx (must match LP's stored matcher_context)
 *   3. []         matcherProg (executable; must match LP's stored matcher_program)
 *   4. []         lpPda (PDA ["lp", slab, lp_idx]; required by CPI as signer)
 */
export interface InitMatcherCtxArgs {
  /** LP account index in the engine (0-based). */
  lpIdx: number;
  /** Matcher kind: 0=Passive, 1=vAMM. */
  kind: number;
  /** Base trading fee in bps (e.g. 30 = 0.30%). */
  tradingFeeBps: number;
  /** Base spread in bps. */
  baseSpreadBps: number;
  /** Max total spread in bps. */
  maxTotalBps: number;
  /** vAMM impact constant in bps (0 for passive matchers). */
  impactKBps: number;
  /** Liquidity notional in e6 units (0 for passive matchers). */
  liquidityNotionalE6: bigint | string;
  /** Max single fill size in absolute units (u128::MAX = no limit). */
  maxFillAbs: bigint | string;
  /** Max inventory size in absolute units (u128::MAX = no limit). */
  maxInventoryAbs: bigint | string;
  /** Fraction of fees routed to insurance fund in bps. */
  feeToInsuranceBps: number;
  /** Skew spread multiplier in bps (0 = disabled). */
  skewSpreadMultBps: number;
}

/** @deprecated v12.x InitMatcherCtx (old tag 75). v17 reuses tag 75 for DepositToLpVault. */
export function encodeInitMatcherCtx(_args: InitMatcherCtxArgs): Uint8Array {
  return removedInstruction(
    "InitMatcherCtx (v12 tag 75 — COLLIDES with v17 DepositToLpVault)",
    IX_TAG.InitMatcherCtx,
    undefined,
  );
}

// ============================================================================
// Missing encoders — corrected tag mappings (tags 22-74)
// ============================================================================

/**
 * @deprecated v12.x SetInsuranceWithdrawPolicy (old tag 22). Not in v17.
 */
export interface SetInsuranceWithdrawPolicyArgs {
  authority: PublicKey | string;
  minWithdrawBase: bigint | string;
  maxWithdrawBps: number;
  cooldownSlots: bigint | string;
}
export function encodeSetInsuranceWithdrawPolicy(_args: SetInsuranceWithdrawPolicyArgs): Uint8Array {
  return removedInstruction("SetInsuranceWithdrawPolicy (v12 tag 22 — not in v17)", IX_TAG.SetInsuranceWithdrawPolicy, undefined);
}

/**
 * @deprecated v12.x WithdrawInsuranceLimited (old tag 23). v17 uses tag 23 for WithdrawInsuranceLimited (same tag, different meaning — verify wire before using).
 */
export function encodeWithdrawInsuranceLimited(_args: { amount: bigint | string }): Uint8Array {
  return removedInstruction("WithdrawInsuranceLimited (v12 tag 23 — verify v17 wire before use)", IX_TAG.WithdrawInsuranceLimited, undefined);
}

/**
 * @deprecated v12.x ResolvePermissionless (old tag 29). v17 uses tag 39 for ResolveStalePermissionless.
 */
export function encodeResolvePermissionless(): Uint8Array {
  return removedInstruction(
    "ResolvePermissionless (v12 tag 29 — use ResolveStalePermissionless(39) in v17)",
    IX_TAG.ResolvePermissionless,
    "encodeResolveStalePermissionless()",
  );
}

/**
 * @deprecated v12.x ForceCloseResolved (old tag 30) is NOT CloseResolved in v17.
 * v17 reuses tag 30 for CloseResolved with a completely different wire format.
 * This function throws at runtime to prevent silent on-chain mismatch.
 */
export function encodeForceCloseResolved(_args: { userIdx: number }): Uint8Array {
  return removedInstruction(
    "ForceCloseResolved",
    IX_TAG.ForceCloseResolved,
    "encodeCloseResolved() for v17",
  );
}

/**
 * @deprecated v12.x CreateLpVault wire format. Use encodeCreateLpVaultV17() for v17.
 * This is kept for source-compat only — the v12 wire format will be rejected by v17.
 */
export function encodeCreateLpVault(args: { feeShareBps: bigint | string; utilCurveEnabled?: boolean }): Uint8Array {
  return removedInstruction(
    "encodeCreateLpVault (v12 format)",
    IX_TAG.CreateLpVault,
    "encodeCreateLpVaultV17()",
  );
}

/**
 * @deprecated v12.x LpVaultDeposit wire format. Use encodeDepositToLpVault() for v17.
 * This is kept for source-compat only — the v12 wire format will be rejected by v17.
 */
export function encodeLpVaultDeposit(_args: { amount: bigint | string }): Uint8Array {
  return removedInstruction(
    "encodeLpVaultDeposit (v12 format)",
    IX_TAG.LpVaultDeposit,
    "encodeDepositToLpVault()",
  );
}

/**
 * @deprecated v12.x ChallengeSettlement. v17 reuses tag 43 for ForfeitRecoveryLeg.
 */
export function encodeChallengeSettlement(_args: { proposedPriceE6: bigint | string }): Uint8Array {
  return removedInstruction(
    "ChallengeSettlement",
    IX_TAG.ChallengeSettlement,
    undefined,
  );
}

/** @deprecated v12.x ResolveDispute. v17 reuses tag 44 for RebalanceReduce. */
export function encodeResolveDispute(_args: { accept: number }): Uint8Array {
  return removedInstruction("ResolveDispute", IX_TAG.ResolveDispute, undefined);
}

/** @deprecated v12.x DepositLpCollateral. v17 reuses tag 45 for FinalizeResetSide. */
export function encodeDepositLpCollateral(_args: { userIdx: number; lpAmount: bigint | string }): Uint8Array {
  return removedInstruction("DepositLpCollateral", IX_TAG.DepositLpCollateral, undefined);
}

/** @deprecated v12.x WithdrawLpCollateral. v17 reuses tag 46 for ClaimResolvedPayoutTopup. */
export function encodeWithdrawLpCollateral(_args: { userIdx: number; lpAmount: bigint | string }): Uint8Array {
  return removedInstruction("WithdrawLpCollateral", IX_TAG.WithdrawLpCollateral, undefined);
}

/** @deprecated v12.x SetOffsetPair. v17 reuses tag 54 for SyncInsuranceLedger. */
export function encodeSetOffsetPair(_args: { offsetBps: number }): Uint8Array {
  return removedInstruction("SetOffsetPair", IX_TAG.SetOffsetPair, undefined);
}

/** @deprecated v12.x AttestCrossMargin. v17 reuses tag 55 for UpdateTradeFeePolicy. */
export function encodeAttestCrossMargin(_args: { userIdxA: number; userIdxB: number }): Uint8Array {
  return removedInstruction("AttestCrossMargin", IX_TAG.AttestCrossMargin, undefined);
}

/** @deprecated v12.x RescueOrphanVault. v17 reuses tag 72 for TransferPortfolioOwnership. */
export function encodeRescueOrphanVault(): Uint8Array {
  return removedInstruction("RescueOrphanVault", IX_TAG.RescueOrphanVault, "encodeTransferPortfolioOwnership()");
}

/** @deprecated v12.x CloseOrphanSlab. v17 reuses tag 73 for SetNftProgramId. */
export function encodeCloseOrphanSlab(): Uint8Array {
  return removedInstruction("CloseOrphanSlab", IX_TAG.CloseOrphanSlab, "encodeSetNftProgramId()");
}

/** @deprecated v12.x SetDexPool. v17 reuses tag 74 for CreateLpVault. */
export function encodeSetDexPool(_args: { pool: PublicKey | string }): Uint8Array {
  return removedInstruction("SetDexPool", IX_TAG.SetDexPool, "encodeCreateLpVaultV17()");
}

/** @deprecated v12.x Insurance LP alias — removed in v17. */
export function encodeCreateInsuranceMint(): Uint8Array {
  return removedInstruction("CreateInsuranceMint (v12 alias)", IX_TAG.CreateLpVault, "encodeCreateLpVaultV17()");
}

/** @deprecated v12.x Insurance LP alias — removed in v17. */
export function encodeDepositInsuranceLP(_args: { amount: bigint | string }): Uint8Array {
  return removedInstruction("DepositInsuranceLP (v12 alias)", IX_TAG.DepositToLpVault, "encodeDepositToLpVault()");
}

/** @deprecated v12.x Insurance LP alias — removed in v17. */
export function encodeWithdrawInsuranceLP(_args: { lpAmount: bigint | string }): Uint8Array {
  return removedInstruction("WithdrawInsuranceLP (v12 alias)", IX_TAG.RequestRedeemLpShares, "encodeRequestRedeemLpShares()");
}

// ============================================================================
// Phase B admin setters (tags 78-81) — added 2026-04-17
// Wire up MarketConfig fields added in prog Phase A. Admin-only, validated.
// Accounts for all 4: [admin(signer), slab(writable)] (2 accounts).
// ============================================================================

/**
 * @deprecated v12.x SetMaxPnlCap (old tag 78). v17 reuses tag 78 for LpVaultCrankFees.
 * This function throws at runtime to prevent silent on-chain mismatch.
 */
export interface SetMaxPnlCapArgs {
  cap: bigint | string;
}

export function encodeSetMaxPnlCap(_args: SetMaxPnlCapArgs): Uint8Array {
  return removedInstruction(
    "SetMaxPnlCap (v12 tag 78 — now LpVaultCrankFees in v17)",
    IX_TAG.SetMaxPnlCap,
    "encodeLpVaultCrankFees() [if you meant v17] or no equivalent",
  );
}

/**
 * @deprecated v12.x SetOiCapMultiplier (old tag 79). v17 reuses tag 79 for SetLpVaultPaused.
 */
export interface SetOiCapMultiplierArgs {
  packed: bigint | string;
}

export function encodeSetOiCapMultiplier(_args: SetOiCapMultiplierArgs): Uint8Array {
  return removedInstruction(
    "SetOiCapMultiplier (v12 tag 79 — now SetLpVaultPaused in v17)",
    IX_TAG.SetOiCapMultiplier,
    "encodeSetLpVaultPaused() [if you meant v17]",
  );
}

/** @deprecated v12.x helper — kept for legacy callers that use packOiCap(). */
export function packOiCap(multiplierBps: number, softCapBps: number): bigint {
  if (multiplierBps < 0 || multiplierBps > 0xFFFF_FFFF) {
    throw new Error(`packOiCap: multiplier_bps out of u32 range: ${multiplierBps}`);
  }
  if (softCapBps < 0 || softCapBps > 0xFFFF_FFFF) {
    throw new Error(`packOiCap: soft_cap_bps out of u32 range: ${softCapBps}`);
  }
  return BigInt(multiplierBps) | (BigInt(softCapBps) << 32n);
}

/**
 * @deprecated v12.x SetDisputeParams (old tag 80). v17 reuses tag 80 for CloseLpVault.
 */
export interface SetDisputeParamsArgs {
  windowSlots: bigint | string;
  bondAmount: bigint | string;
}

export function encodeSetDisputeParams(_args: SetDisputeParamsArgs): Uint8Array {
  return removedInstruction(
    "SetDisputeParams (v12 tag 80 — now CloseLpVault in v17)",
    IX_TAG.SetDisputeParams,
    "encodeCloseLpVault() [if you meant v17]",
  );
}

/**
 * @deprecated v12.x SetLpCollateralParams (old tag 81). Not in v17.
 */
export interface SetLpCollateralParamsArgs {
  enabled: number;
  ltvBps: number;
}

export function encodeSetLpCollateralParams(_args: SetLpCollateralParamsArgs): Uint8Array {
  return removedInstruction("SetLpCollateralParams (v12 tag 81 — not in v17)", IX_TAG.SetLpCollateralParams, undefined);
}

/**
 * @deprecated v12.x AcceptAdmin (old tag 82). v17 uses UpdateAuthority(32) for admin rotation.
 */
export function encodeAcceptAdmin(): Uint8Array {
  return removedInstruction("AcceptAdmin (v12 tag 82 — not in v17)", IX_TAG.AcceptAdmin, "encodeUpdateAuthority()");
}

// ============================================================================
// G-3 fixes (audit-2026-04-27): missing per-account encoders for tags 25-28.
// Wrapper handlers exist at src/percolator.rs:2088, 2092, 2097, 2103.
// ============================================================================

/**
 * @deprecated v12.x ReclaimEmptyAccount (old tag 85). Not in v17.
 */
export interface ReclaimEmptyAccountArgs {
  userIdx: number;
}

export function encodeReclaimEmptyAccount(_args: ReclaimEmptyAccountArgs): Uint8Array {
  return removedInstruction("ReclaimEmptyAccount (v12 tag 85 — not in v17)", IX_TAG.ReclaimEmptyAccount, undefined);
}

/**
 * @deprecated v12.x SettleAccount (old tag 86). Not in v17.
 */
export interface SettleAccountArgs {
  userIdx: number;
}

export function encodeSettleAccount(_args: SettleAccountArgs): Uint8Array {
  return removedInstruction("SettleAccount (v12 tag 86 — not in v17)", IX_TAG.SettleAccount, undefined);
}

/**
 * @deprecated v12.x DepositFeeCredits (old tag 27). Not in v17.
 */
export interface DepositFeeCreditsArgs {
  userIdx: number;
  amount: bigint | string;
}

export function encodeDepositFeeCredits(_args: DepositFeeCreditsArgs): Uint8Array {
  return removedInstruction("DepositFeeCredits (v12 tag 27 — not in v17)", IX_TAG.DepositFeeCredits, undefined);
}

/**
 * ConvertReleasedPnl (tag 28) — voluntary PnL conversion with open position.
 * Owner only.
 *
 * v17 wire: tag(1) + amount(u128 LE) = 17 bytes.
 *
 * BREAKING vs v12.x: userIdx(u16) removed; amount promoted u64→u128.
 * The v17 decoder at tag 28 reads `amount: read_u128(&mut rest)?` — the
 * old 2-byte userIdx is consumed as the first 2 bytes of the u128, then
 * only 8 bytes remain for the u128 tail (14 bytes short). Every call fails
 * with InvalidInstructionData. Also, `userIdx` is stale — v17 portfolios
 * are identified by account key alone.
 *
 * Accounts: see ACCOUNTS_CONVERT_RELEASED_PNL.
 *
 * @param amount  Amount of released PnL to convert (u128).
 *
 * @example
 * ```ts
 * const data = encodeConvertReleasedPnl({ amount: 1_000_000n });
 * ```
 */
export interface ConvertReleasedPnlArgs {
  /** @deprecated userIdx is not needed in v17 — portfolios are identified by account key. */
  userIdx?: number;
  amount: bigint | string;
}

export function encodeConvertReleasedPnl(args: ConvertReleasedPnlArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.ConvertReleasedPnl),
    encU128(args.amount),
  );
}

// ============================================================================
// G-2 fix (audit-2026-04-27): UpdateAuthority (tag 83). v12.18.x 4-way split.
// Wrapper: src/percolator.rs:6876 (handler), 2140-2146 (decode).
// ============================================================================

/**
 * UpdateAuthority (tag 32) — rotate the single market-level authority (marketauth).
 *
 * v17 wire: tag(1) + new_pubkey[32] = 33 bytes.
 *
 * BREAKING vs v12.18.x: the kind byte is REMOVED. Tag 32 now ONLY rotates
 * marketauth. Per-asset authority rotation uses tag 65 (UpdateAssetAuthority).
 * Burning marketauth to zero is rejected on-chain.
 *
 * Accounts: [currentAuth(signer), newAuth(signer), slab(writable)]
 *
 * @example
 * ```ts
 * const data = encodeUpdateAuthority({ newPubkey: newAdminKey });
 * ```
 */
export interface UpdateAuthorityArgs {
  newPubkey: PublicKey | string;
}

export function encodeUpdateAuthority(args: UpdateAuthorityArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.UpdateAuthority),
    encPubkey(args.newPubkey),
  );
}

// ============================================================================
// v17 NEW — UpdateAssetAuthority (tag 65)
// ============================================================================

/**
 * Per-asset authority kind for UpdateAssetAuthority (tag 65).
 *
 * Exact mapping from v16_program.rs lines 5246-5250:
 *   ASSET_AUTH_ADMIN              = 0  →  AssetAdmin
 *   ASSET_AUTH_INSURANCE          = 1  →  Insurance
 *   ASSET_AUTH_INSURANCE_OPERATOR = 2  →  InsuranceOperator
 *   ASSET_AUTH_BACKING_BUCKET     = 3  →  BackingBucket
 *   ASSET_AUTH_ORACLE             = 4  →  Oracle
 *
 * CRITICAL: the kind byte is sent on-chain and routes to a specific authority
 * slot. Wrong values silently corrupt authority state:
 *   - Calling with kind=Insurance(1) rotates `insurance_authority` (correct).
 *   - Calling with the OLD wrong value 0 for Insurance hits `asset_admin` slot,
 *     corrupting the market-level admin key instead.
 *
 * Stake program uses kind=AssetAdmin(0) targeting asset_index=0 to bind
 * the stake vault PDA into the asset_admin authority slot.
 */
export const ASSET_AUTH_KIND = {
  /** ASSET_AUTH_ADMIN = 0 in v16_program.rs:5246 — routes to asset_admin field */
  AssetAdmin: 0,
  /** ASSET_AUTH_INSURANCE = 1 in v16_program.rs:5247 — routes to insurance_authority field */
  Insurance: 1,
  /** ASSET_AUTH_INSURANCE_OPERATOR = 2 in v16_program.rs:5248 — routes to insurance_operator field */
  InsuranceOperator: 2,
  /** ASSET_AUTH_BACKING_BUCKET = 3 in v16_program.rs:5249 — routes to backing_bucket_authority field */
  BackingBucket: 3,
  /** ASSET_AUTH_ORACLE = 4 in v16_program.rs:5250 — routes to oracle_authority field */
  Oracle: 4,
} as const;
Object.freeze(ASSET_AUTH_KIND);

export type AssetAuthKind = (typeof ASSET_AUTH_KIND)[keyof typeof ASSET_AUTH_KIND];

/**
 * UpdateAssetAuthority (tag 65) — rotate a per-asset authority.
 *
 * Wire: tag(1) + asset_index(u16) + kind(u8) + new_pubkey[32] = 36 bytes.
 *
 * Gated by the asset's own asset_admin (can rotate any) or by the current
 * holder of that authority (self-rotation). Isolated to the given asset_index.
 *
 * @param assetIndex Asset index (0 = primary, 1+ = additional assets).
 * @param kind       ASSET_AUTH_KIND.* constant.
 * @param newPubkey  New authority pubkey. Zero = burn (only AssetAdmin on asset!=0).
 *
 * @example
 * ```ts
 * // Rotate insurance authority for asset 0
 * // ASSET_AUTH_KIND.Insurance = 1 (routes to insurance_authority slot on-chain)
 * const data = encodeUpdateAssetAuthority({
 *   assetIndex: 0,
 *   kind: ASSET_AUTH_KIND.Insurance,
 *   newPubkey: newInsuranceKey,
 * });
 * ```
 */
export interface UpdateAssetAuthorityArgs {
  assetIndex: number;
  kind: AssetAuthKind;
  newPubkey: PublicKey | string;
}

export function encodeUpdateAssetAuthority(args: UpdateAssetAuthorityArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.UpdateAssetAuthority),
    encU16(args.assetIndex),
    encU8(args.kind),
    encPubkey(args.newPubkey),
  );
}

// ============================================================================
// v17 NEW — BatchTradeNoCpi (tag 66) + BatchTradeCpi (tag 67)
// ============================================================================

/**
 * One leg of a BatchTradeNoCpi instruction.
 */
export interface BatchTradeNoCpiLeg {
  assetIndex: number;
  sizeQ: bigint | string;
  execPrice: bigint | string;
  feeBps: bigint | string;
}

/**
 * BatchTradeNoCpi (tag 66) — multi-leg NoCpi batch trade.
 *
 * Wire: tag(1) + n_legs(u8) + [asset_index(u16) + size_q(i128) + exec_price(u64) + fee_bps(u64)]×n
 *
 * @param legs Array of up to 255 trade legs.
 *
 * @example
 * ```ts
 * const data = encodeBatchTradeNoCpi({ legs: [
 *   { assetIndex: 0, sizeQ: 1_000_000n, execPrice: 50_000_000_000n, feeBps: 30n },
 *   { assetIndex: 1, sizeQ: -500_000n,  execPrice: 40_000_000_000n, feeBps: 30n },
 * ]});
 * ```
 */
export interface BatchTradeNoCpiArgs {
  legs: BatchTradeNoCpiLeg[];
}

function validateBatchTradeFeeBps(value: bigint | string, caller: string): void {
  const feeBps = typeof value === "string" ? BigInt(value) : value;
  if (feeBps > 10_000n) {
    throw new Error(`${caller}: feeBps must be <= 10000, got ${feeBps}`);
  }
}

export function encodeBatchTradeNoCpi(args: BatchTradeNoCpiArgs): Uint8Array {
  if (args.legs.length === 0) {
    throw new Error("encodeBatchTradeNoCpi: at least one leg is required");
  }
  if (args.legs.length > 255) {
    throw new Error(`encodeBatchTradeNoCpi: too many legs (${args.legs.length} > 255)`);
  }

  const parts: Uint8Array[] = [
    encU8(IX_TAG.BatchTradeNoCpi),
    encU8(args.legs.length),
  ];

  for (const leg of args.legs) {
    validateBatchTradeFeeBps(leg.feeBps, "encodeBatchTradeNoCpi");
    parts.push(encU16(leg.assetIndex));
    parts.push(encI128(leg.sizeQ));
    parts.push(encU64(leg.execPrice));
    parts.push(encU64(leg.feeBps));
  }

  return concatBytes(...parts);
}
/**
 * BatchTradeCpi (tag 67) — multi-leg CPI batch trade.
 *
 * Wire: tag(1) + n_legs(u8) + [asset_index(u16) + size_q(i128) + fee_bps(u64) + limit_price(u64)]×n
 *
 * @param legs Array of up to 255 CPI trade legs.
 *
 * @example
 * ```ts
 * const data = encodeBatchTradeCpi({ legs: [
 *   { assetIndex: 0, sizeQ: 1_000_000n, feeBps: 30n, limitPrice: 51_000_000_000n },
 * ]});
 * ```
 */

export interface BatchTradeCpiLeg {
  assetIndex: number;
  sizeQ: bigint | string;
  feeBps: bigint | string;
  limitPrice: bigint | string;
}

export interface BatchTradeCpiArgs {
  legs: BatchTradeCpiLeg[];
}

export function encodeBatchTradeCpi(args: BatchTradeCpiArgs): Uint8Array {
  if (args.legs.length === 0) {
    throw new Error("encodeBatchTradeCpi: at least one leg is required");
  }
  if (args.legs.length > 255) {
    throw new Error(`encodeBatchTradeCpi: too many legs (${args.legs.length} > 255)`);
  }

  const parts: Uint8Array[] = [
    encU8(IX_TAG.BatchTradeCpi),
    encU8(args.legs.length),
  ];

  for (const leg of args.legs) {
    validateBatchTradeFeeBps(leg.feeBps, "encodeBatchTradeCpi");
    parts.push(encU16(leg.assetIndex));
    parts.push(encI128(leg.sizeQ));
    parts.push(encU64(leg.feeBps));
    parts.push(encU64(leg.limitPrice));
  }

  return concatBytes(...parts);
}

// ============================================================================
// v17 NEW — SetMatcherConfig (tag 68)
// ============================================================================

/**
 * SetMatcherConfig (tag 68) — enable or disable the matcher for this portfolio.
 *
 * Wire: tag(1) + enabled(u8) = 2 bytes.
 *
 * @param enabled 1 = enabled, 0 = disabled.
 *
 * @example
 * ```ts
 * const data = encodeSetMatcherConfig({ enabled: 1 });
 * ```
 */
export interface SetMatcherConfigArgs {
  enabled: number;
}

export function encodeSetMatcherConfig(args: SetMatcherConfigArgs): Uint8Array {
  if (args.enabled !== 0 && args.enabled !== 1) {
    throw new Error(`encodeSetMatcherConfig: enabled must be 0 or 1, got ${args.enabled}`);
  }
  return concatBytes(encU8(IX_TAG.SetMatcherConfig), encU8(args.enabled));
}

// ============================================================================
// v17 NEW — RestartAssetOracle (tag 69)
// ============================================================================

/**
 * RestartAssetOracle (tag 69) — permissionless oracle restart.
 *
 * Wire: tag(1) + asset_index(u16) + now_slot(u64) + initial_price(u64) = 20 bytes.
 *
 * Used to un-stick a stale or hung oracle. Anyone can call this.
 *
 * @param assetIndex    Asset/domain index.
 * @param nowSlot       Current slot.
 * @param initialPrice  Initial mark price in e6 units.
 *
 * @example
 * ```ts
 * const data = encodeRestartAssetOracle({
 *   assetIndex: 0,
 *   nowSlot: currentSlot,
 *   initialPrice: 50_000_000_000n,
 * });
 * ```
 */
export interface RestartAssetOracleArgs {
  assetIndex: number;
  nowSlot: bigint | string;
  initialPrice: bigint | string;
}

export function encodeRestartAssetOracle(args: RestartAssetOracleArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.RestartAssetOracle),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encU64(args.initialPrice),
  );
}

// ============================================================================
// v17 NEW — WithdrawInsuranceAsset (tag 57)
// ============================================================================

/**
 * WithdrawInsuranceAsset (tag 57) — withdraw from a specific asset's insurance fund.
 *
 * Wire: tag(1) + asset_index(u16) + amount(u128) = 19 bytes.
 *
 * Replaces the v12.x gap at tag 57. Requires insurance_authority signature.
 * asset_index is u16 (domain u8→u16 migration in v17).
 *
 * @param assetIndex  Asset/domain index (u16, not u8).
 * @param amount      Amount to withdraw (u128).
 *
 * @example
 * ```ts
 * const data = encodeWithdrawInsuranceAsset({ assetIndex: 0, amount: 1_000_000n });
 * ```
 */
export interface WithdrawInsuranceAssetArgs {
  assetIndex: number;
  amount: bigint | string;
}

export function encodeWithdrawInsuranceAsset(args: WithdrawInsuranceAssetArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.WithdrawInsuranceAsset),
    encU16(args.assetIndex),
    encU128(args.amount),
  );
}

// ============================================================================
// v17 NEW — LP-vault renumbered tags (74-80)
// ============================================================================

/**
 * CreateLpVault (tag 74) — create the LP vault for a market/asset domain.
 *
 * Wire: tag(1) + fee_share_bps(u16) + redemption_cooldown_slots(u64) +
 *       oi_reservation_threshold_bps(u16) + domain(u16) = 14 bytes.
 *
 * @param feeShareBps                  LP vault fee share in bps (0-10000).
 * @param redemptionCooldownSlots      Slots between redemption requests.
 * @param oiReservationThresholdBps    OI reservation threshold in bps.
 * @param domain                       Asset/domain index (u16 in v17).
 *
 * @example
 * ```ts
 * const data = encodeCreateLpVault({
 *   feeShareBps: 5000,
 *   redemptionCooldownSlots: 21600n,
 *   oiReservationThresholdBps: 8000,
 *   domain: 0,
 * });
 * ```
 */
export interface CreateLpVaultArgs {
  feeShareBps: number;
  redemptionCooldownSlots: bigint | string;
  oiReservationThresholdBps: number;
  domain: number;
}

export function encodeCreateLpVaultV17(args: CreateLpVaultArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.CreateLpVault),
    encU16(args.feeShareBps),
    encU64(args.redemptionCooldownSlots),
    encU16(args.oiReservationThresholdBps),
    encU16(args.domain),
  );
}

/**
 * DepositToLpVault (tag 75) — deposit collateral into the LP vault.
 *
 * Wire: tag(1) + amount(u128) = 17 bytes.
 *
 * @example
 * ```ts
 * const data = encodeDepositToLpVault({ amount: 1_000_000n });
 * ```
 */
export function encodeDepositToLpVault(args: { amount: bigint | string }): Uint8Array {
  return concatBytes(encU8(IX_TAG.DepositToLpVault), encU128(args.amount));
}

/**
 * RequestRedeemLpShares (tag 76) — request redemption of LP vault shares.
 *
 * Wire: tag(1) + shares(u128) = 17 bytes.
 *
 * BREAKING vs v12.x: was LpVaultWithdraw (tag 39) with lpAmount u64.
 * v17 uses shares u128 and a two-step request/execute redemption flow.
 *
 * @example
 * ```ts
 * const data = encodeRequestRedeemLpShares({ shares: 1_000_000n });
 * ```
 */
export function encodeRequestRedeemLpShares(args: { shares: bigint | string }): Uint8Array {
  return concatBytes(encU8(IX_TAG.RequestRedeemLpShares), encU128(args.shares));
}

/**
 * ExecuteRedemption (tag 77) — execute a pending LP redemption.
 *
 * Wire: tag(1) = 1 byte.
 *
 * @example
 * ```ts
 * const data = encodeExecuteRedemption();
 * ```
 */
export function encodeExecuteRedemption(): Uint8Array {
  return encU8(IX_TAG.ExecuteRedemption);
}

/**
 * LpVaultCrankFees (tag 78) — crank fee accrual for the LP vault.
 *
 * Wire: tag(1) = 1 byte.
 *
 * @example
 * ```ts
 * const data = encodeLpVaultCrankFees();
 * ```
 */
export function encodeLpVaultCrankFees(): Uint8Array {
  return encU8(IX_TAG.LpVaultCrankFees);
}

/**
 * SetLpVaultPaused (tag 79) — pause or unpause the LP vault.
 *
 * Wire: tag(1) + paused(u8) = 2 bytes.
 *
 * @param paused 1 = paused, 0 = active.
 *
 * @example
 * ```ts
 * const data = encodeSetLpVaultPaused({ paused: 1 });
 * ```
 */
export function encodeSetLpVaultPaused(args: { paused: number }): Uint8Array {
  return concatBytes(encU8(IX_TAG.SetLpVaultPaused), encU8(args.paused));
}

/**
 * CloseLpVault (tag 80) — close an empty LP vault.
 *
 * Wire: tag(1) = 1 byte.
 *
 * @example
 * ```ts
 * const data = encodeCloseLpVault();
 * ```
 */
export function encodeCloseLpVault(): Uint8Array {
  return encU8(IX_TAG.CloseLpVault);
}

// ============================================================================
// v17 NFT / B-3 (tags 72/73) — kept from v16
// ============================================================================

/**
 * TransferPortfolioOwnership (tag 72) — B-3 position ownership transfer.
 *
 * Wire: tag(1) + new_owner[32] + asset_index(u16) = 35 bytes.
 *
 * @param newOwner    New owner pubkey.
 * @param assetIndex  Asset/domain index.
 *
 * @example
 * ```ts
 * const data = encodeTransferPortfolioOwnership({
 *   newOwner: newOwnerKey,
 *   assetIndex: 0,
 * });
 * ```
 */
export interface TransferPortfolioOwnershipArgs {
  newOwner: PublicKey | string;
  assetIndex: number;
}

export function encodeTransferPortfolioOwnership(args: TransferPortfolioOwnershipArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.TransferPortfolioOwnership),
    encPubkey(args.newOwner),
    encU16(args.assetIndex),
  );
}

/**
 * SetNftProgramId (tag 73) — register the percolator-nft program in the NftRegistry.
 *
 * Wire: tag(1) + nft_program_id[32] = 33 bytes.
 *
 * @param nftProgramId  Pubkey of the percolator-nft program.
 *
 * @example
 * ```ts
 * const data = encodeSetNftProgramId({ nftProgramId: NFT_PROGRAM_ID });
 * ```
 */
export interface SetNftProgramIdArgs {
  nftProgramId: PublicKey | string;
}

export function encodeSetNftProgramId(args: SetNftProgramIdArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.SetNftProgramId),
    encPubkey(args.nftProgramId),
  );
}

// ============================================================================
// TASK A — v17 oracle-config encoders (tags 34, 35, 36, 62, 63)
// ============================================================================

/**
 * ConfigureHybridOracle (tag 34) — set Pyth/hybrid oracle config for a market asset.
 *
 * v17 wire: tag(1) + asset_index(u16) + now_slot(u64) + now_unix_ts(i64) +
 *           oracle_leg_count(u8) + oracle_leg_flags(u8) + max_staleness_secs(u64) +
 *           hybrid_soft_stale_slots(u64) + mark_ewma_halflife_slots(u64) +
 *           mark_min_fee(u64) + invert(u8) + unit_scale(u32) + conf_filter_bps(u16) +
 *           oracle_leg_feeds[0..3]([32] each) = 156 bytes total.
 *
 * Accounts: [0] oracle_authority (signer), [1] market (writable),
 *           [2..2+oracle_leg_count] oracle feed accounts (read-only).
 *
 * Constraints (from v16_program.rs:10419-10435):
 *   - oracle_leg_count ∈ [1, ORACLE_LEG_CAP=3]
 *   - max_staleness_secs ∈ [1, MAX_ORACLE_STALENESS_SECS=86400]
 *   - hybrid_soft_stale_slots > 0
 *   - invert ∈ {0, 1}
 *   - Caller must be the asset's oracle_authority
 *
 * @param assetIndex               Asset slot index (u16).
 * @param nowSlot                  Current on-chain slot (u64).
 * @param nowUnixTs                Current Unix timestamp in seconds (i64).
 * @param oracleLegCount           Number of active oracle legs (1–3).
 * @param oracleLegFlags           Bit-flags for oracle leg configuration.
 * @param maxStalenessSecs         Maximum oracle staleness in seconds (1–86400).
 * @param hybridSoftStaleSlots     Slots after which the hybrid oracle is considered soft-stale.
 * @param markEwmaHalflifeSlots    EWMA half-life for mark price smoothing (slots).
 * @param markMinFee               Minimum fee charged per mark-price update.
 * @param invert                   0 = normal, 1 = invert price (e.g., for inverted pairs).
 * @param unitScale                Unit scaling factor (u32).
 * @param confFilterBps            Confidence filter in basis points (u16).
 * @param oracleLegFeeds           Array of exactly 3 oracle leg feed pubkeys (unused slots = SystemProgram).
 *
 * @example
 * ```ts
 * const data = encodeConfigureHybridOracle({
 *   assetIndex: 1,
 *   nowSlot: 300000000n,
 *   nowUnixTs: 1700000000n,
 *   oracleLegCount: 1,
 *   oracleLegFlags: 0,
 *   maxStalenessSecs: 60n,
 *   hybridSoftStaleSlots: 100n,
 *   markEwmaHalflifeSlots: 500n,
 *   markMinFee: 0n,
 *   invert: 0,
 *   unitScale: 1000000,
 *   confFilterBps: 200,
 *   oracleLegFeeds: [PYTH_FEED_KEY, PublicKey.default, PublicKey.default],
 * });
 * assert(data.length === 156);
 * ```
 */
export interface ConfigureHybridOracleArgs {
  assetIndex: number;
  nowSlot: bigint | string;
  nowUnixTs: bigint | string;
  oracleLegCount: number;
  oracleLegFlags: number;
  maxStalenessSecs: bigint | string;
  hybridSoftStaleSlots: bigint | string;
  markEwmaHalflifeSlots: bigint | string;
  markMinFee: bigint | string;
  invert: number;
  unitScale: number;
  confFilterBps: number;
  /** Exactly 3 entries — unused legs MUST be PublicKey.default (all zeros). */
  oracleLegFeeds: [PublicKey | string, PublicKey | string, PublicKey | string];
}

const ORACLE_LEG_CAP = 3;

export function encodeConfigureHybridOracle(args: ConfigureHybridOracleArgs): Uint8Array {
  if (!Number.isInteger(args.oracleLegCount) || args.oracleLegCount < 1 || args.oracleLegCount > ORACLE_LEG_CAP) {
    throw new Error(`encodeConfigureHybridOracle: oracleLegCount must be an integer in 1..${ORACLE_LEG_CAP}`);
  }
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
    encPubkey(args.oracleLegFeeds[2]),
  );
}

/**
 * ConfigureEwmaMark (tag 35) — set EWMA mark oracle config for a market asset.
 *
 * v17 wire: tag(1) + asset_index(u16) + now_slot(u64) + initial_mark_e6(u64) +
 *           mark_ewma_halflife_slots(u64) + mark_min_fee(u64) = 35 bytes total.
 *
 * Accounts: [0] oracle_authority (signer), [1] market (writable).
 *
 * Constraints (from v16_program.rs:10558-10563):
 *   - initial_mark_e6 ∈ [1, MAX_ORACLE_PRICE]
 *   - mark_ewma_halflife_slots > 0
 *   - Caller must be the asset's oracle_authority
 *
 * @param assetIndex               Asset slot index (u16).
 * @param nowSlot                  Current on-chain slot (u64).
 * @param initialMarkE6            Initial mark price × 1e6 (u64, must be > 0).
 * @param markEwmaHalflifeSlots    EWMA half-life for mark price smoothing (slots, must be > 0).
 * @param markMinFee               Minimum fee charged per mark-price update (u64).
 *
 * @example
 * ```ts
 * const data = encodeConfigureEwmaMark({
 *   assetIndex: 1,
 *   nowSlot: 300000000n,
 *   initialMarkE6: 50000000000n,
 *   markEwmaHalflifeSlots: 500n,
 *   markMinFee: 0n,
 * });
 * assert(data.length === 35);
 * ```
 */
export interface ConfigureEwmaMarkArgs {
  assetIndex: number;
  nowSlot: bigint | string;
  initialMarkE6: bigint | string;
  markEwmaHalflifeSlots: bigint | string;
  markMinFee: bigint | string;
}

function requirePositiveU64(value: bigint | string, field: string): void {
  const n = typeof value === "string" ? BigInt(value) : value;
  if (n <= 0n) {
    throw new Error(`${field} must be > 0`);
  }
}
export function encodeConfigureEwmaMark(args: ConfigureEwmaMarkArgs): Uint8Array {
  requirePositiveU64(args.initialMarkE6, "initialMarkE6");
  requirePositiveU64(args.markEwmaHalflifeSlots, "markEwmaHalflifeSlots");

  return concatBytes(
    encU8(IX_TAG.ConfigureEwmaMark),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encU64(args.initialMarkE6),
    encU64(args.markEwmaHalflifeSlots),
    encU64(args.markMinFee),
  );
}

/**
 * PushEwmaMark (tag 36) — push a new EWMA mark price observation.
 *
 * v17 wire: tag(1) + asset_index(u16) + now_slot(u64) + mark_e6(u64) = 19 bytes total.
 *
 * Accounts: [0] oracle_authority (signer), [1] market (writable).
 *
 * Constraints (from v16_program.rs:10771):
 *   - mark_e6 ∈ [1, MAX_ORACLE_PRICE]
 *   - Asset oracle mode must be ORACLE_MODE_EWMA_MARK
 *   - Caller must be the asset's oracle_authority
 *   - now_slot ≥ last EWMA slot and current market slot
 *
 * @param assetIndex    Asset slot index (u16).
 * @param nowSlot       Current on-chain slot (u64).
 * @param markE6        New mark price × 1e6 (u64, must be > 0).
 *
 * @example
 * ```ts
 * const data = encodePushEwmaMark({ assetIndex: 1, nowSlot: 300000001n, markE6: 50100000000n });
 * assert(data.length === 19);
 * ```
 */
export interface PushEwmaMarkArgs {
  assetIndex: number;
  nowSlot: bigint | string;
  markE6: bigint | string;
}

export function encodePushEwmaMark(args: PushEwmaMarkArgs): Uint8Array {
  requirePositiveU64(args.markE6, "markE6");

  return concatBytes(
    encU8(IX_TAG.PushEwmaMark),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encU64(args.markE6),
  );
}

/**
 * ConfigureAuthMark (tag 62) — set auth-push mark oracle for a market asset.
 *
 * v17 wire: tag(1) + asset_index(u16) + now_slot(u64) + initial_mark_e6(u64) = 19 bytes total.
 *
 * Accounts: [0] oracle_authority (signer), [1] market (writable).
 *
 * Constraints (from v16_program.rs:10665):
 *   - initial_mark_e6 ∈ [1, MAX_ORACLE_PRICE]
 *   - Caller must be the asset's oracle_authority
 *
 * @param assetIndex       Asset slot index (u16).
 * @param nowSlot          Current on-chain slot (u64).
 * @param initialMarkE6    Initial mark price × 1e6 (u64, must be > 0).
 *
 * @example
 * ```ts
 * const data = encodeConfigureAuthMark({ assetIndex: 1, nowSlot: 300000000n, initialMarkE6: 50000000000n });
 * assert(data.length === 19);
 * ```
 */
export interface ConfigureAuthMarkArgs {
  assetIndex: number;
  nowSlot: bigint | string;
  initialMarkE6: bigint | string;
}

export function encodeConfigureAuthMark(args: ConfigureAuthMarkArgs): Uint8Array {
  requirePositiveU64(args.initialMarkE6, "initialMarkE6");

  return concatBytes(
    encU8(IX_TAG.ConfigureAuthMark),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encU64(args.initialMarkE6),
  );
}

/**
 * PushAuthMark (tag 63) — push a new auth-mark price observation.
 *
 * v17 wire: tag(1) + asset_index(u16) + now_slot(u64) + mark_e6(u64) = 19 bytes total.
 *
 * Accounts: [0] oracle_authority (signer), [1] market (writable).
 *
 * Constraints (from v16_program.rs:10847):
 *   - mark_e6 ∈ [1, MAX_ORACLE_PRICE]
 *   - Asset oracle mode must be ORACLE_MODE_AUTH_MARK
 *   - Caller must be the asset's oracle_authority
 *   - now_slot ≥ last EWMA slot and current market slot
 *
 * @param assetIndex    Asset slot index (u16).
 * @param nowSlot       Current on-chain slot (u64).
 * @param markE6        New mark price × 1e6 (u64, must be > 0).
 *
 * @example
 * ```ts
 * const data = encodePushAuthMark({ assetIndex: 1, nowSlot: 300000001n, markE6: 50100000000n });
 * assert(data.length === 19);
 * ```
 */
export interface PushAuthMarkArgs {
  assetIndex: number;
  nowSlot: bigint | string;
  markE6: bigint | string;
}

export function encodePushAuthMark(args: PushAuthMarkArgs): Uint8Array {
  requirePositiveU64(args.markE6, "markE6");

  return concatBytes(
    encU8(IX_TAG.PushAuthMark),
    encU16(args.assetIndex),
    encU64(args.nowSlot),
    encU64(args.markE6),
  );
}

// ============================================================================
// TASK B — Matcher passive-init payload (matcher program, not wrapper)
// ============================================================================

/**
 * MatcherInitPassive — 66-byte payload sent to the MATCHER PROGRAM (not wrapper)
 * to initialize a passive LP matcher context.
 *
 * This is NOT a wrapper instruction. Program = matcher program address.
 * Accounts: [0] matcherDelegate (read-only PDA), [1] matcherCtx (writable).
 *
 * Wire layout (66 bytes, from percolator-prog/tests/v16_five_program_crosscut.rs:640-648):
 *   [0]       = 2         (opcode: passive-LP init)
 *   [1]       = 0         (reserved)
 *   [2..10]   = 0         (8 bytes reserved)
 *   [10..14]  = 100u32 LE (default max_inventory_abs slot)
 *   [14..34]  = 0         (20 bytes reserved)
 *   [34..50]  = max_fill_abs (u128 LE)
 *   [50..66]  = 0         (16 bytes reserved)
 *   Total = 66 bytes
 *
 * The matcher delegate PDA is derived via `deriveMatcherDelegate()` in pda.ts using
 * seeds ["matcher", market, accountB, accountBOwner, matcherProg, matcherCtx].
 *
 * @param maxFillAbs  Maximum absolute fill size (u128). Pass BigInt.MaxUint128 (2^128-1) for no limit.
 *
 * @example
 * ```ts
 * const data = encodeMatcherInitPassive({ maxFillAbs: 2n ** 128n - 1n });
 * assert(data.length === 66);
 * // send to matcherProgram, accounts: [delegate(ro), ctx(w)]
 * ```
 */
export interface MatcherInitPassiveArgs {
  maxFillAbs: bigint | string;
}

export function encodeMatcherInitPassive(args: MatcherInitPassiveArgs): Uint8Array {
  const buf = new Uint8Array(66);
  buf[0] = 2;
  buf[1] = 0;
  // [10..14] = 100u32 LE (default max_inventory_abs / slot factor)
  const u32Bytes = encU32(100);
  buf.set(u32Bytes, 10);
  // [34..50] = max_fill_abs u128 LE
  const u128Bytes = encU128(args.maxFillAbs);
  buf.set(u128Bytes, 34);
  return buf;
}
