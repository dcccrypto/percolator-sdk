// src/abi/encode.ts
import { PublicKey } from "@solana/web3.js";
var U8_MAX = 255;
var U16_MAX = 65535;
var U32_MAX = 4294967295;
var DECIMAL_INT_RE = /^-?(0|[1-9]\d*)$/;
function parseDecimalBigInt(val, fnName) {
  if (typeof val === "bigint") return val;
  if (typeof val !== "string") {
    throw new Error(`${fnName}: value must be bigint or decimal integer string`);
  }
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
  const min2 = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  if (n < min2 || n > max) throw new Error("encI64: value out of range");
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
  const view2 = new DataView(buf.buffer);
  const lo = n & 0xffffffffffffffffn;
  const hi = n >> 64n;
  view2.setBigUint64(0, lo, true);
  view2.setBigUint64(8, hi, true);
  return buf;
}
function encI128(val) {
  const n = parseDecimalBigInt(val, "encI128");
  const min2 = -(1n << 127n);
  const max = (1n << 127n) - 1n;
  if (n < min2 || n > max) throw new Error("encI128: value out of range");
  let unsigned = n;
  if (n < 0n) {
    unsigned = (1n << 128n) + n;
  }
  const buf = new Uint8Array(16);
  const view2 = new DataView(buf.buffer);
  const lo = unsigned & 0xffffffffffffffffn;
  const hi = unsigned >> 64n;
  view2.setBigUint64(0, lo, true);
  view2.setBigUint64(8, hi, true);
  return buf;
}
function encPubkey(val) {
  try {
    const pk = typeof val === "string" ? new PublicKey(val) : val;
    if (pk == null || typeof pk.toBytes !== "function") {
      throw new Error("value must be a PublicKey or base58 string");
    }
    const bytes = pk.toBytes();
    if (!(bytes instanceof Uint8Array)) {
      throw new Error("toBytes() must return a Uint8Array");
    }
    if (bytes.length !== 32) {
      throw new Error(`expected 32 bytes, got ${bytes.length}`);
    }
    return bytes;
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
   * Wire: tag(1) + amount(u128) + domain(u16) = 19 bytes.  // GH#381: was 17; `domain` was missing
   */
  DepositToLpVault: 75,
  /**
   * RequestRedeemLpShares (tag 76).
   * Wire: tag(1) + shares(u128) = 17 bytes.
   */
  RequestRedeemLpShares: 76,
  /**
   * ExecuteRedemption (tag 77).
   * Wire: tag(1) + domain(u16) = 3 bytes.  // GH#381: was 1 byte; `domain` was missing
   */
  ExecuteRedemption: 77,
  /**
   * LpVaultCrankFees (tag 78).
   * Wire: tag(1) + domain(u16) = 3 bytes.  // GH#381: was 1 byte; `domain` was missing
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
  /**
   * CancelRedemption (tag 81) — withdraw a pending LP redemption request before it
   * is executed, returning the shares to the holder.
   * Wire: tag(1) = 1 byte.
   *
   * GH#375: this and UnwrapEscrowedPortfolio(82) were the only two v17 wrapper
   * instructions with NO entry here. Tags 81 and 82 were represented solely by the
   * deprecated v12 names below, both annotated "Not in v17" — which is false. The
   * Parity Gate exists to catch exactly this and could not: its percolator-prog
   * target had never once run.
   */
  CancelRedemption: 81,
  /**
   * UnwrapEscrowedPortfolio (tag 82) — burn a Position NFT and return the escrowed
   * portfolio to `new_owner`.
   * Wire: tag(1) + new_owner(32) = 33 bytes.
   */
  UnwrapEscrowedPortfolio: 82,
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
  /** @deprecated v12.x tag 75. COLLIDES with v17 DepositToLpVault(75) AND v17 InitMatcherCtx(83). Do NOT use. */
  InitMatcherCtxV12: 75,
  /** @deprecated v12.x tag 78. COLLIDES with v17 LpVaultCrankFees(78). Do NOT use. */
  SetMaxPnlCap: 78,
  /** @deprecated v12.x tag 79. COLLIDES with v17 SetLpVaultPaused(79). Do NOT use. */
  SetOiCapMultiplier: 79,
  /** @deprecated v12.x tag 80. COLLIDES with v17 CloseLpVault(80). Do NOT use. */
  SetDisputeParams: 80,
  /** @deprecated v12.x tag 81. COLLIDES with v17 CancelRedemption(81). Do NOT use. */
  SetLpCollateralParams: 81,
  /** @deprecated v12.x tag 82. COLLIDES with v17 UnwrapEscrowedPortfolio(82). Do NOT use. */
  AcceptAdmin: 82,
  /**
   * InitMatcherCtx (tag 83) — bootstrap a matcher context by CPIing to the matcher program.
   *
   * v17 wire: tag(1) + kind(u8) + trading_fee_bps(u32) + base_spread_bps(u32) +
   *   max_total_bps(u32) + impact_k_bps(u32) + liquidity_notional_e6(u128) +
   *   max_fill_abs(u128) + max_inventory_abs(u128) + fee_to_insurance_bps(u16) +
   *   skew_spread_mult_bps(u16) = 70 bytes total.
   *
   * The wrapper's handle_init_matcher_ctx signs the CPI as the matcher_delegate PDA
   * (via invoke_signed), satisfying the matcher program's lp_pda.is_signer check.
   *
   * PREREQUISITE: SetMatcherConfig (tag 68, enabled=1) must be called first to store
   * (matcherProg, matcherCtx, matcherDelegate) in the LP portfolio's matcher config tail.
   * InitMatcherCtx verifies the stored triple matches the accounts supplied here.
   *
   * CONFIRMED (forensic rebuild + live simulateTransaction, 2026-07-15, see
   * ~/v17/DECISIONS-LEDGER.md "Pinned deployed revisions" section): the DEPLOYED
   * wrapper (69VUZ7… = percolator-prog@e26c97a4) HAS InitMatcherCtx at tag 83 — this
   * is a real, live instruction, not a defunct/other-lineage one. The protocol-fee
   * change was renumbered (WithdrawProtocolFee→84, SetProtocolFeeAuthority→85) to
   * free tag 83 for this instruction rather than the reverse.
   */
  InitMatcherCtx: 83,
  /**
   * WithdrawProtocolFee (tag 84) — v17 protocol-fee wrapper (VERSION 17,
   * percolator-prog@626fb617, feat/protocol-fee-taker-only).
   *
   * Renumbered 83→84 (2026-07-15) to free tag 83 for InitMatcherCtx, which the
   * deployed wrapper (percolator-prog@e26c97a4) has live at tag 83 — see the
   * note on IX_TAG.InitMatcherCtx above and ~/v17/DECISIONS-LEDGER.md.
   *
   * Wire: tag(1) + amount(u128) = 17 bytes. `amount == 0` withdraws all
   * currently-available capacity. Accounts: see ACCOUNTS_WITHDRAW_PROTOCOL_FEE
   * in abi/accounts.ts. Signer-gated on cfg.protocol_fee_authority.
   */
  WithdrawProtocolFee: 84,
  /**
   * SetProtocolFeeAuthority (tag 85) — v17 protocol-fee wrapper (VERSION 17,
   * percolator-prog@626fb617, feat/protocol-fee-taker-only). Rotates
   * cfg.protocol_fee_authority.
   *
   * Renumbered 84→85 (2026-07-15) as part of the same InitMatcherCtx(83) tag
   * reservation — see the note on IX_TAG.InitMatcherCtx above and
   * ~/v17/DECISIONS-LEDGER.md. Also frees this value from colliding with the
   * deprecated v12.x ReclaimEmptyAccount(85) below, which is not present in v17.
   *
   * Wire: tag(1) + new_authority(32) = 33 bytes. Accounts: see
   * ACCOUNTS_SET_PROTOCOL_FEE_AUTHORITY in abi/accounts.ts. Gated on the
   * program's BPF upgrade authority — NOT marketauth, NOT any creator-facing gate.
   */
  SetProtocolFeeAuthority: 85,
  /**
   * UpdateFeeSplit (tag 86) — v17 fee-collection split (percolator-prog
   * feat/protocol-fee-taker-only@2b3a6a65). Sets the three stored fee shares.
   *
   * Wire: tag(1) + creator_share_bps(u16) + lp_share_bps(u16) +
   * insurance_share_bps(u16) = 7 bytes. Accounts: see ACCOUNTS_UPDATE_FEE_SPLIT
   * in abi/accounts.ts. Gated on `cfg.marketauth`.
   *
   * The three shares are bps *of T* (`trade_fee_base_bps`) and must sum to
   * exactly FEE_SHARE_TOTAL_BPS (8000 = 10_000 - PROTOCOL_FEE_BPS), else
   * Custom(52) FeeSplitSumInvalid. They must also satisfy the floors
   * (creator <= 3600, LP >= 3200, insurance >= 1200), else Custom(51)
   * FeeSplitFloorViolation.
   *
   * REACHABILITY: `StakeInitPool` irreversibly rotates `cfg.marketauth` to the
   * stake-pool PDA, after which this tag is reachable ONLY via the stake
   * program's CPI proxy (stake tag 25). Call it before StakeInitPool or use
   * `encodeStakeAdminUpdateFeeSplit`.
   */
  UpdateFeeSplit: 86,
  /**
   * WithdrawInsuranceReserveToStake (tag 87) — v17 fee-collection split.
   * Permissionless. Pushes the accrued insurance/staker leg out of the market
   * vault and into the bound stake pool's vault, where percolator-stake's
   * AccrueFees measures it as surplus and distributes it to stakers.
   *
   * Wire: tag(1) = 1 byte, no arguments. Accounts: see
   * ACCOUNTS_WITHDRAW_INSURANCE_RESERVE_TO_STAKE in abi/accounts.ts.
   *
   * The destination is NOT caller-chosen: it is `pool.vault`, read out of the
   * pool at `["stake_pool", market]` under the wrapper's PINNED stake program
   * id. The only thing a caller decides is *when* the push happens.
   *
   * ⚠ Live-only (mode 0), and stricter than tag 84: rejects Recovery, Resolved
   * and matured-Live. ResolveMarket is one-way and tag 41 cannot reach this
   * unbudgeted leg, so any accrued-but-unpushed reserve is PERMANENTLY
   * FORFEITED once a market resolves. Keepers should crank tag 87 *before*
   * ResolveMarket, not after.
   */
  WithdrawInsuranceReserveToStake: 87,
  /**
   * UpdateMaintenanceFeePerSlot (tag 88) — v17 fee-collection split. Sets
   * `cfg.maintenance_fee_per_slot`, which was an InitMarket constructor
   * argument with no setter anywhere in the dispatch table and was therefore
   * frozen for the life of the market.
   *
   * Wire: tag(1) + maintenance_fee_per_slot(u128) = 17 bytes. Accounts: see
   * ACCOUNTS_UPDATE_MAINTENANCE_FEE_PER_SLOT. Gated on `cfg.marketauth`.
   *
   * ⚠ THE PAYLOAD IS u128, NOT u64. The wrapper decodes this with `read_u128`
   * (v16_program.rs tag-88 arm), matching both the storage type
   * (`WrapperConfigV16::maintenance_fee_per_slot: u128`) and InitMarket's own
   * wire encoding. A u64 payload leaves 8 bytes unconsumed and the wrapper
   * rejects the whole instruction with InvalidInstructionData.
   *
   * Same StakeInitPool reachability caveat as tag 86 — proxy is stake tag 26.
   */
  UpdateMaintenanceFeePerSlot: 88,
  /**
   * ExpireBackingBucket (tag 89) — PERMISSIONLESS backing-bucket liveness
   * repair. Advances a `Fresh`-but-LAPSED source-domain counterparty backing
   * bucket to `Expired`/`Impaired` so settlement against that domain can
   * proceed again.
   *
   * Wire: tag(1) + domain(u16 LE) = 3 bytes. Accounts: see
   * ACCOUNTS_EXPIRE_BACKING_BUCKET — ONE account, the market, and NO signer.
   *
   * ⚠ ROUTINE KEEPER MAINTENANCE, NOT AN EDGE CASE. Every backed market
   * reaches the lapse eventually: the bucket's `expiry_slot` is fixed when the
   * bucket opens and is NEVER extended while it stays `Fresh`, so a longer
   * horizon defers the lapse, it does not avoid it. See
   * {@link encodeExpireBackingBucket} for the full keeper contract.
   */
  ExpireBackingBucket: 89,
  /**
   * WithdrawCreatorFee (tag 90) — v17 creator fee claim (percolator-prog
   * feat/protocol-fee-taker-only, 2026-07-23 creator-fee-claim design §3).
   * Pays the market creator's accrued trade-fee share out of the vault and
   * decrements `creator_fee_claimable_atoms` (WrapperConfigV17, byte 568) by
   * EXACTLY `amount`.
   *
   * Wire: tag(1) + amount(u128 LE) = 17 bytes. Accounts: see
   * ACCOUNTS_WITHDRAW_CREATOR_FEE in abi/accounts.ts (same 6-account shape as
   * tag 84).
   *
   * ⚠ `amount == 0` is REJECTED (InvalidInstruction), which is the OPPOSITE of
   * tag 84's "0 means withdraw-all" sentinel. This instruction is an exact
   * debit of the counter, so read `creatorFeeClaimableAtoms` off the parsed
   * config and pass that to drain it.
   *
   * ⚠ Authority is asset 0's `insurance_operator` and ONLY that — NOT
   * `cfg.marketauth`. On a staked market `StakeInitPool` has irreversibly
   * rotated `marketauth` to the stake-pool PDA but leaves `insurance_operator`
   * alone, so this deliberate divergence is what lets the creator still claim
   * after staking (and stops the pool PDA claiming creator revenue).
   *
   * ⚠ Over-claim (`amount > creatorFeeClaimableAtoms`) is rejected, never
   * saturated — there is no partial fill. Nothing is debited on failure.
   */
  WithdrawCreatorFee: 90,
  /**
   * RebalanceLpVaultBacking (v17 tag 91) — move IDLE (fresh, unliened) backing
   * between the two domains of the LP vault's asset, carrying ledger principal
   * in lockstep. No tokens move: `header.vault` is untouched.
   *
   * The vault is welded to ONE domain at CreateLpVault, but the house draws its
   * gains from the OPPOSITE domain, so without this the pot the house actually
   * needs can never be refilled (spec.md L410 requires refill be source-domain
   * local).
   */
  RebalanceLpVaultBacking: 91,
  /**
   * UpdateInsuranceWithdrawPolicy (tag 92) — sets the insurance-withdrawal rate limit
   * (percolator-prog#427). Deployed devnet 2026-09-01 in wrapper `cc193dde`.
   *
   * Before this instruction existed, `insurance_withdraw_deposits_only` and
   * `insurance_withdraw_cooldown_slots` were written in exactly one place each — `: 0,` in
   * the market's init literal — and both enforcement helpers short-circuit on zero, so the
   * F-1 cooldown and F-2 deposits-only ceiling could not fire in any market ever created.
   *
   * NOTE the deprecated v12.x `AdvanceOraclePhase(92)` below shares this number, the same
   * way v17 `SetProtocolFeeAuthority(85)` and `WithdrawCreatorFee(90)` do. The v12 tag is
   * not in v17; this is the live meaning of 92.
   */
  UpdateInsuranceWithdrawPolicy: 92,
  /** @deprecated v12.x tag 85. COLLIDES with v17 SetProtocolFeeAuthority(85). Do NOT use. */
  ReclaimEmptyAccount: 85,
  /** @deprecated v12.x tag 86. Not in v17. */
  SettleAccount: 86,
  /** @deprecated v12.x tag 90. COLLIDES with v17 WithdrawCreatorFee(90). Do NOT use. */
  UpdateMarkPrice: 90,
  /** @deprecated v12.x tag 91. COLLIDES with v17 RebalanceLpVaultBacking(91). Do NOT use. */
  AuditCrank: 91,
  /** @deprecated v12.x tag 92. Not in v17. */
  AdvanceOraclePhase: 92,
  /** @deprecated v12.x tag 93. Not in v17. COLLIDES with P1 SetAssetRiskLimits(93). Do NOT use. */
  SlashCreationDeposit: 93,
  /** @deprecated v12.x tag 94. Not in v17. COLLIDES with P3 InitVaultLp(94) — see IX_TAG_P3. Do NOT use. */
  InitSharedVault: 94,
  /** @deprecated v12.x tag 95. Not in v17. COLLIDES with P3 VaultLpSetMatcher(95) — see IX_TAG_P3. Do NOT use. */
  AllocateMarket: 95,
  /** @deprecated v12.x tag 96. Not in v17. COLLIDES with P3 DepositJuniorTranche(96) — see IX_TAG_P3. Do NOT use. */
  QueueWithdrawalSV: 96,
  /** @deprecated v12.x tag 97. Not in v17. COLLIDES with P3 WithdrawJuniorTranche(97) — see IX_TAG_P3. Do NOT use. */
  ClaimEpochWithdrawal: 97,
  /** @deprecated v12.x tag 98. Not in v17. COLLIDES with P3 VaultLpRecall(98) — see IX_TAG_P3. Do NOT use. */
  AdvanceEpoch: 98,
  /** @deprecated v12.x tag 99. Not in v17. COLLIDES with P3 SetVaultLpRisk(99) — see IX_TAG_P3. Do NOT use. */
  ReclaimSlabRent: 99,
  /** @deprecated v12.x tag 100. Not in v17. COLLIDES with P3 VaultLpConvertPnl(100) — see IX_TAG_P3. Do NOT use. */
  CloseStaleSlabs: 100,
  /** @deprecated v12.x tag 101. Not in v17. COLLIDES with P3 VaultLpSettleResolved(101) — see IX_TAG_P3. Do NOT use. */
  ExecuteAdl: 101,
  /** @deprecated v12.x tag 102. Not in v17. COLLIDES with P3 VaultLpReleaseSurplus(102) — see IX_TAG_P3. Do NOT use. */
  QueueWithdrawal: 102,
  /** @deprecated v12.x tag 103. Not in v17. */
  ClaimQueuedWithdrawal: 103,
  /** @deprecated v12.x tag 104. Not in v17. */
  CancelQueuedWithdrawal: 104,
  /** @deprecated v12.x tag 105. Not in v17. */
  TradeCpiV: 105
};
Object.freeze(IX_TAG);
var EXPECTED_SLAB_VERSION = 18;
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
var PUBLIC_B_CHUNK_ATOMS_UNLIMITED = 10000000000000000n;
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
    maxAccountBSettlementChunks = 10n;
    maxBankruptCloseChunks = 10n;
    maxBankruptCloseLifetimeSlots = 500n;
    publicBChunkAtoms = 1000000n;
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
    encU64(args.portfolioId),
    encU64(args.expectedSequence),
    encU128(args.amount)
  );
}
function encodeWithdrawCollateral(args) {
  return concatBytes(
    encU8(IX_TAG.WithdrawCollateral),
    encU64(args.portfolioId),
    encU64(args.expectedSequence),
    encU128(args.amount)
  );
}
var CrankAction = {
  /**
   * #381: action 0 is `Refresh` in the program, not `FeeSweep`.
   *
   * `v16_program.rs` decodes `0 => PermissionlessCrankActionV16::Refresh`. The
   * name is kept as an alias below so existing callers do not break, but
   * `Refresh` is what the program calls it and what a reader should match
   * against when comparing this file to the wrapper.
   */
  Refresh: 0,
  /** @deprecated Alias for {@link CrankAction.Refresh} — the program's name. */
  FeeSweep: 0,
  Liquidate: 1,
  /**
   * #381: action 2 was MISSING from this enum entirely.
   *
   * `2 => PermissionlessCrankActionV16::SettleB` is the permissionless
   * bankrupt-settlement path. Omitting it did not merely mislabel something — it
   * hid the action's existence from every SDK consumer, so a keeper reading this
   * file would conclude the crank had two modes and never call the third.
   */
  SettleB: 2
};
var CRANK_OBSERVATION_DECODE_MAX = 16;
function encodePermissionlessCrank(args) {
  const observations = args.observations ?? [];
  if (observations.length > CRANK_OBSERVATION_DECODE_MAX) {
    throw new Error(
      `encodePermissionlessCrank: ${observations.length} observations exceeds CRANK_OBSERVATION_DECODE_MAX (${CRANK_OBSERVATION_DECODE_MAX}) \u2014 the wrapper rejects this with InvalidInstructionData before reading any hint bytes.`
    );
  }
  const parts = [
    encU8(IX_TAG.PermissionlessCrank),
    encU64(args.nowSlot),
    encU8(observations.length)
  ];
  for (const obs of observations) {
    parts.push(encU16(obs.assetIndex), encU8(obs.oracleAccounts));
  }
  return concatBytes(...parts);
}
function encodeKeeperCrank(_args) {
  throw new Error(
    "encodeKeeperCrank: v12.17 wire format is not accepted by the v17 wrapper. Use encodePermissionlessCrank() instead."
  );
}
function encodeTradeNoCpi(args) {
  const data = concatBytes(
    encU8(IX_TAG.TradeNoCpi),
    encU64(args.accountAPortfolioId),
    encU64(args.accountAPositionEpoch),
    encU64(args.accountBPortfolioId),
    encU64(args.accountBPositionEpoch),
    encU16(args.assetIndex),
    encU64(args.marketId),
    encI128(args.sizeQ),
    encU64(args.execPrice),
    encU64(args.feeBps),
    encU16(args.backingFeeCapBps)
  );
  if (data.length !== 77) {
    throw new Error(
      `encodeTradeNoCpi: expected 77 bytes, got ${data.length}`
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
function encodeCloseAccount(args) {
  return concatBytes(
    encU8(IX_TAG.ClosePortfolio),
    encU64(args.portfolioId),
    encU64(args.expectedSequence),
    encU64(args.positionEpoch)
  );
}
function encodeTopUpInsurance(args) {
  return concatBytes(
    encU8(IX_TAG.TopUpInsurance),
    encU64(args.marketId),
    encU64(args.intentId),
    encU64(args.authorityEpoch),
    encU128(args.amount)
  );
}
function encodeTopUpInsuranceDomain(args) {
  return concatBytes(
    encU8(IX_TAG.TopUpInsuranceDomain),
    encU16(args.domain),
    encU64(args.marketId),
    encU64(args.intentId),
    encU64(args.authorityEpoch),
    encU128(args.amount)
  );
}
var MAX_BACKING_BUCKET_EXPIRY_SLOT = 9223372036854775807n;
function encodeTopUpBackingBucket(args) {
  return concatBytes(
    encU8(IX_TAG.TopUpBackingBucket),
    encU16(args.domain),
    encU64(args.marketId),
    encU64(args.intentId),
    encU64(args.authorityEpoch),
    encU128(args.amount),
    encU64(args.expirySlot)
  );
}
function encodeWithdrawBackingBucket(args) {
  return concatBytes(
    encU8(IX_TAG.WithdrawBackingBucket),
    encU16(args.domain),
    encU64(args.marketId),
    encU128(args.amount),
    encU64(args.authorityEpoch)
  );
}
function encodeUpdateBackingFeePolicy(args) {
  return concatBytes(
    encU8(IX_TAG.UpdateBackingFeePolicy),
    encU16(args.domain),
    encU64(args.marketId),
    encU16(args.feeBps),
    encU16(args.insuranceShareBps),
    encU64(args.policySequence)
  );
}
function encodeWithdrawBackingBucketEarnings(args) {
  return concatBytes(
    encU8(IX_TAG.WithdrawBackingBucketEarnings),
    encU16(args.domain),
    encU64(args.marketId),
    encU128(args.amount),
    encU64(args.authorityEpoch)
  );
}
function encodeTradeCpi(args) {
  const data = concatBytes(
    encU8(IX_TAG.TradeCpi),
    encU64(args.accountAPortfolioId),
    encU64(args.accountAPositionEpoch),
    encU64(args.accountBPortfolioId),
    encU64(args.accountBPositionEpoch),
    encU64(args.accountBMatcherSequence),
    encU16(args.assetIndex),
    encU64(args.marketId),
    encI128(args.sizeQ),
    encU64(args.feeBps),
    encU64(args.limitPrice),
    encU16(args.backingFeeCapBps)
  );
  if (data.length !== 85) {
    throw new Error(
      `encodeTradeCpi: expected 85 bytes, got ${data.length}`
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
function encodeCloseSlab(authorityEpoch) {
  return concatBytes(encU8(IX_TAG.CloseSlab), encU64(authorityEpoch));
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
function encodeResolveMarket(args) {
  return concatBytes(
    encU8(IX_TAG.ResolveMarket),
    encU64(args.assetGenerationFrontier),
    encU64(args.authorityEpoch)
  );
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
  if (!(feedId instanceof Uint8Array) || feedId.length !== 32) {
    throw new Error(`derivePythPriceUpdateAccount: feedId must be 32 bytes, got ${feedId?.length ?? "invalid"}`);
  }
  if (!Number.isInteger(shardId) || shardId < 0 || shardId > 65535) {
    throw new Error(`derivePythPriceUpdateAccount: shardId must be a u16, got ${shardId}`);
  }
  const { PublicKey: PublicKey22 } = await import("@solana/web3.js");
  const shardBuf = new Uint8Array(2);
  new DataView(shardBuf.buffer).setUint16(0, shardId, true);
  const [pda] = PublicKey22.findProgramAddressSync(
    [shardBuf, feedId],
    new PublicKey22(PYTH_RECEIVER_PROGRAM_ID)
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
function encodeUpdateAssetLifecycle(args) {
  return concatBytes(
    encU8(IX_TAG.UpdateAssetLifecycle),
    encU8(args.action),
    encU16(args.assetIndex),
    encU64(args.marketId),
    encU64(args.authorityEpoch),
    encU64(args.nowSlot),
    encU64(args.initialPrice),
    encU128(args.maxInitFee),
    encPubkey(args.insuranceAuthority),
    encPubkey(args.insuranceOperator),
    encPubkey(args.backingBucketAuthority),
    encPubkey(args.oracleAuthority)
  );
}
function encodeCureAndCancelClose(args) {
  return concatBytes(
    encU8(IX_TAG.CureAndCancelClose),
    encU64(args.portfolioId),
    encU64(args.positionEpoch),
    encU128(args.optionalDeposit)
  );
}
function encodeForfeitRecoveryLeg(args) {
  return concatBytes(
    encU8(IX_TAG.ForfeitRecoveryLeg),
    encU64(args.portfolioId),
    encU64(args.positionEpoch),
    encU16(args.assetIndex),
    encU128(args.bLossAtomBudget)
  );
}
function encodeRebalanceReduce(args) {
  return concatBytes(
    encU8(IX_TAG.RebalanceReduce),
    encU64(args.portfolioId),
    encU64(args.positionEpoch),
    encU16(args.assetIndex),
    encU128(args.reduceQ)
  );
}
function encodeUpdateBaseUnitMints(args) {
  return concatBytes(
    encU8(IX_TAG.UpdateBaseUnitMints),
    encPubkey(args.primaryMint),
    encPubkey(args.secondaryMint),
    encU64(args.authorityEpoch)
  );
}
function encodeSwapSecondaryForPrimary(args) {
  return concatBytes(
    encU8(IX_TAG.SwapSecondaryForPrimary),
    encU128(args.amount),
    encU64(args.authorityEpoch)
  );
}
var VAMM_MAGIC = 0x504552434d415443n;
var MATCHER_MAGIC = VAMM_MAGIC;
var CTX_RETURN_OFFSET = 0;
var MATCHER_RETURN_LEN = 64;
var CTX_VAMM_OFFSET = 64;
var CTX_VAMM_LEN = 256;
var MATCHER_CONTEXT_LEN = 320;
var MATCHER_RETURN_FLAG_VALID = 1;
var MATCHER_RETURN_FLAG_PARTIAL_OK = 2;
var MATCHER_RETURN_FLAG_REJECTED = 4;
var MATCHER_RETURN_FLAG_BACKING_FEE_CAP_SHIFT = 8;
var MATCHER_RETURN_FLAG_BACKING_FEE_CAP_MASK = 16383 << MATCHER_RETURN_FLAG_BACKING_FEE_CAP_SHIFT;
var MATCHER_RETURN_KNOWN_FLAGS = MATCHER_RETURN_FLAG_VALID | MATCHER_RETURN_FLAG_PARTIAL_OK | MATCHER_RETURN_FLAG_REJECTED | MATCHER_RETURN_FLAG_BACKING_FEE_CAP_MASK;
function decodeMatcherReturn(data, offset = CTX_RETURN_OFFSET) {
  if (data.length < offset + MATCHER_RETURN_LEN) {
    throw new Error(
      `decodeMatcherReturn: data too short \u2014 need ${offset + MATCHER_RETURN_LEN} bytes, got ${data.length}`
    );
  }
  const view2 = new DataView(data.buffer, data.byteOffset + offset, MATCHER_RETURN_LEN);
  const abiVersion = view2.getUint32(0, true);
  const flags = view2.getUint32(4, true);
  const execPriceE6 = view2.getBigUint64(8, true);
  const execSizeLo = view2.getBigUint64(16, true);
  const execSizeHi = view2.getBigUint64(24, true);
  let execSize = execSizeHi << 64n | execSizeLo;
  if (execSize >= 1n << 127n) execSize -= 1n << 128n;
  const reqId = view2.getBigUint64(32, true);
  const lpAccountId = view2.getBigUint64(40, true);
  const oraclePriceE6 = view2.getBigUint64(48, true);
  const assetIndex = view2.getBigUint64(56, true);
  if ((flags & ~MATCHER_RETURN_KNOWN_FLAGS) !== 0) {
    throw new Error(
      `decodeMatcherReturn: unknown flag bits set (flags=0x${flags.toString(16)}, known=0x${MATCHER_RETURN_KNOWN_FLAGS.toString(16)})`
    );
  }
  return {
    abiVersion,
    flags,
    execPriceE6,
    execSize,
    reqId,
    lpAccountId,
    oraclePriceE6,
    assetIndex,
    valid: (flags & MATCHER_RETURN_FLAG_VALID) !== 0,
    partialOk: (flags & MATCHER_RETURN_FLAG_PARTIAL_OK) !== 0,
    rejected: (flags & MATCHER_RETURN_FLAG_REJECTED) !== 0,
    backingFeeCapBps: (flags & MATCHER_RETURN_FLAG_BACKING_FEE_CAP_MASK) >>> MATCHER_RETURN_FLAG_BACKING_FEE_CAP_SHIFT
  };
}
function encodeMatcherReturn(args) {
  if (args.backingFeeCapBps < 0 || args.backingFeeCapBps > 1e4) {
    throw new Error(`encodeMatcherReturn: backingFeeCapBps must be 0..=10000, got ${args.backingFeeCapBps}`);
  }
  const flags = (args.valid ? MATCHER_RETURN_FLAG_VALID : 0) | (args.partialOk ? MATCHER_RETURN_FLAG_PARTIAL_OK : 0) | (args.rejected ? MATCHER_RETURN_FLAG_REJECTED : 0) | args.backingFeeCapBps << MATCHER_RETURN_FLAG_BACKING_FEE_CAP_SHIFT & MATCHER_RETURN_FLAG_BACKING_FEE_CAP_MASK;
  return concatBytes(
    encU32(args.abiVersion),
    encU32(flags),
    encU64(args.execPriceE6),
    encI128(args.execSize),
    encU64(args.reqId),
    encU64(args.lpAccountId),
    encU64(args.oraclePriceE6),
    encU64(args.assetIndex)
  );
}
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
var INIT_MATCHER_CTX_V17_LEN = 70;
function encodeInitMatcherCtx(args) {
  const data = concatBytes(
    encU8(83),
    // IX_TAG.InitMatcherCtx = 83
    encU8(args.kind),
    new Uint8Array(new Uint32Array([args.tradingFeeBps]).buffer),
    // u32 LE
    new Uint8Array(new Uint32Array([args.baseSpreadBps]).buffer),
    // u32 LE
    new Uint8Array(new Uint32Array([args.maxTotalBps]).buffer),
    // u32 LE
    new Uint8Array(new Uint32Array([args.impactKBps]).buffer),
    // u32 LE
    encU128(args.liquidityNotionalE6),
    // u128 LE
    encU128(args.maxFillAbs),
    // u128 LE
    encU128(args.maxInventoryAbs),
    // u128 LE
    encU16(args.feeToInsuranceBps),
    // u16 LE
    encU16(args.skewSpreadMultBps)
    // u16 LE
  );
  if (data.length !== INIT_MATCHER_CTX_V17_LEN) {
    throw new Error(
      `encodeInitMatcherCtx: expected ${INIT_MATCHER_CTX_V17_LEN} bytes, got ${data.length}`
    );
  }
  return data;
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
    encU64(args.portfolioId),
    encU64(args.positionEpoch),
    encU128(args.amount)
  );
}
function encodeUpdateAuthority(args) {
  return concatBytes(
    encU8(IX_TAG.UpdateAuthority),
    encPubkey(args.newPubkey),
    encU64(args.authorityEpoch)
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
    encU64(args.marketId),
    encU8(args.kind),
    encPubkey(args.newPubkey),
    encU64(args.authorityEpoch)
  );
}
function validateBatchTradeFeeBps(value, caller) {
  const feeBps = typeof value === "string" ? BigInt(value) : value;
  if (feeBps > 10000n) {
    throw new Error(`${caller}: feeBps must be <= 10000, got ${feeBps}`);
  }
}
function encodeBatchTradeNoCpi(args) {
  if (args.legs.length === 0) {
    throw new Error("encodeBatchTradeNoCpi: at least one leg is required");
  }
  if (args.legs.length > 255) {
    throw new Error(`encodeBatchTradeNoCpi: too many legs (${args.legs.length} > 255)`);
  }
  const parts = [
    encU8(IX_TAG.BatchTradeNoCpi),
    encU8(args.legs.length)
  ];
  for (const leg of args.legs) {
    validateBatchTradeFeeBps(leg.feeBps, "encodeBatchTradeNoCpi");
    parts.push(encU16(leg.assetIndex));
    parts.push(encU64(leg.marketId));
    parts.push(encI128(leg.sizeQ));
    parts.push(encU64(leg.execPrice));
    parts.push(encU64(leg.feeBps));
  }
  parts.push(encU64(args.accountAPortfolioId));
  parts.push(encU64(args.accountAPositionEpoch));
  parts.push(encU64(args.accountBPortfolioId));
  parts.push(encU64(args.accountBPositionEpoch));
  return concatBytes(...parts);
}
function encodeBatchTradeCpi(args) {
  if (args.legs.length === 0) {
    throw new Error("encodeBatchTradeCpi: at least one leg is required");
  }
  if (args.legs.length > 255) {
    throw new Error(`encodeBatchTradeCpi: too many legs (${args.legs.length} > 255)`);
  }
  const parts = [
    encU8(IX_TAG.BatchTradeCpi),
    encU8(args.legs.length)
  ];
  for (const leg of args.legs) {
    validateBatchTradeFeeBps(leg.feeBps, "encodeBatchTradeCpi");
    parts.push(encU16(leg.assetIndex));
    parts.push(encU64(leg.marketId));
    parts.push(encI128(leg.sizeQ));
    parts.push(encU64(leg.feeBps));
    parts.push(encU64(leg.limitPrice));
  }
  parts.push(encU128(args.maxSlippageAtoms));
  parts.push(encU128(args.maxFeeAtoms));
  parts.push(encU64(args.accountAPortfolioId));
  parts.push(encU64(args.accountAPositionEpoch));
  parts.push(encU64(args.accountBPortfolioId));
  parts.push(encU64(args.accountBPositionEpoch));
  parts.push(encU64(args.accountBMatcherSequence));
  return concatBytes(...parts);
}
function encodeSetMatcherConfig(args) {
  if (args.enabled !== 0 && args.enabled !== 1) {
    throw new Error(`encodeSetMatcherConfig: enabled must be 0 or 1, got ${args.enabled}`);
  }
  return concatBytes(
    encU8(IX_TAG.SetMatcherConfig),
    encU64(args.portfolioId),
    encU64(args.expectedSequence),
    encU64(args.assetGenerationFrontier),
    encU8(args.enabled),
    encU16(args.tradeFeeCapBps),
    encU64(args.expirySlot)
  );
}
function encodeRestartAssetOracle(args) {
  return concatBytes(
    encU8(IX_TAG.RestartAssetOracle),
    encU16(args.assetIndex),
    encU64(args.marketId),
    encU64(args.nowSlot),
    encU64(args.initialPrice),
    encU64(args.observationSequence)
  );
}
function encodeWithdrawInsuranceAsset(args) {
  return concatBytes(
    encU8(IX_TAG.WithdrawInsuranceAsset),
    encU16(args.assetIndex),
    encU64(args.marketId),
    encU128(args.amount),
    encU64(args.authorityEpoch)
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
  return concatBytes(
    encU8(IX_TAG.DepositToLpVault),
    encU128(args.amount),
    encU16(args.domain)
  );
}
function encodeRequestRedeemLpShares(args) {
  return concatBytes(encU8(IX_TAG.RequestRedeemLpShares), encU128(args.shares));
}
function encodeExecuteRedemption(args) {
  return concatBytes(encU8(IX_TAG.ExecuteRedemption), encU16(args.domain));
}
function encodeLpVaultCrankFees(args) {
  return concatBytes(encU8(IX_TAG.LpVaultCrankFees), encU16(args.domain));
}
function encodeRebalanceLpVaultBacking(args) {
  return concatBytes(
    encU8(IX_TAG.RebalanceLpVaultBacking),
    encU16(args.fromDomain),
    encU16(args.toDomain),
    encU128(args.amount)
  );
}
function encodeUpdateInsuranceWithdrawPolicy(args) {
  return concatBytes(
    encU8(IX_TAG.UpdateInsuranceWithdrawPolicy),
    encU8(args.depositsOnly),
    encU64(args.cooldownSlots),
    encU64(args.authorityEpoch)
  );
}
var MAX_INSURANCE_WITHDRAW_COOLDOWN_SLOTS = 78840000n;
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
var ORACLE_LEG_CAP = 3;
function encodeConfigureHybridOracle(args) {
  if (!Number.isInteger(args.oracleLegCount) || args.oracleLegCount < 1 || args.oracleLegCount > ORACLE_LEG_CAP) {
    throw new Error(`encodeConfigureHybridOracle: oracleLegCount must be an integer in 1..${ORACLE_LEG_CAP}`);
  }
  return concatBytes(
    encU8(IX_TAG.ConfigureHybridOracle),
    encU16(args.assetIndex),
    encU64(args.marketId),
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
    encU64(args.observationSequence)
  );
}
function requirePositiveU64(value, field) {
  const n = typeof value === "string" ? BigInt(value) : value;
  if (n <= 0n) {
    throw new Error(`${field} must be > 0`);
  }
}
function encodeConfigureEwmaMark(args) {
  requirePositiveU64(args.initialMarkE6, "initialMarkE6");
  requirePositiveU64(args.markEwmaHalflifeSlots, "markEwmaHalflifeSlots");
  return concatBytes(
    encU8(IX_TAG.ConfigureEwmaMark),
    encU16(args.assetIndex),
    encU64(args.marketId),
    encU64(args.nowSlot),
    encU64(args.initialMarkE6),
    encU64(args.markEwmaHalflifeSlots),
    encU64(args.markMinFee),
    encU64(args.observationSequence)
  );
}
function encodePushEwmaMark(args) {
  requirePositiveU64(args.markE6, "markE6");
  return concatBytes(
    encU8(IX_TAG.PushEwmaMark),
    encU16(args.assetIndex),
    encU64(args.marketId),
    encU64(args.nowSlot),
    encU64(args.markE6),
    encU64(args.observationSequence)
  );
}
function encodeConfigureAuthMark(args) {
  requirePositiveU64(args.initialMarkE6, "initialMarkE6");
  return concatBytes(
    encU8(IX_TAG.ConfigureAuthMark),
    encU16(args.assetIndex),
    encU64(args.marketId),
    encU64(args.nowSlot),
    encU64(args.initialMarkE6),
    encU64(args.observationSequence)
  );
}
function encodePushAuthMark(args) {
  requirePositiveU64(args.markE6, "markE6");
  return concatBytes(
    encU8(IX_TAG.PushAuthMark),
    encU16(args.assetIndex),
    encU64(args.marketId),
    encU64(args.nowSlot),
    encU64(args.markE6),
    encU64(args.observationSequence)
  );
}
function encodeMatcherInitPassive(args) {
  requirePositiveU64(args.lpAccountId, "lpAccountId");
  const buf = new Uint8Array(INIT_CTX_LEN);
  buf[0] = 2;
  buf[1] = 0;
  buf.set(encU32(100), 10);
  buf.set(encU128(args.maxFillAbs), 34);
  buf.set(encU64(args.lpAccountId), 70);
  return buf;
}
function encodeWithdrawProtocolFee(args) {
  return concatBytes(
    encU8(IX_TAG.WithdrawProtocolFee),
    encU128(args.amount),
    encU64(args.authorityEpoch)
  );
}
function encodeSetProtocolFeeAuthority(args) {
  return concatBytes(
    encU8(IX_TAG.SetProtocolFeeAuthority),
    encPubkey(args.newAuthority)
  );
}
var FEE_SPLIT = {
  /** Constant protocol skim, bps of T. Compile-time in the program; not stored, not settable. */
  PROTOCOL_FEE_BPS: 2e3,
  /** The three stored shares must sum to exactly this (= 10_000 - PROTOCOL_FEE_BPS). */
  FEE_SHARE_TOTAL_BPS: 8e3,
  DEFAULT_CREATOR_SHARE_BPS: 1600,
  DEFAULT_LP_SHARE_BPS: 4800,
  DEFAULT_INSURANCE_SHARE_BPS: 1600,
  /** Creator ceiling, bps of T (45% of the post-protocol remainder). */
  MAX_CREATOR_SHARE_BPS: 3600,
  /** LP floor, bps of T (40% of the post-protocol remainder). */
  MIN_LP_SHARE_BPS: 3200,
  /** Insurance/staker floor, bps of T (15% of the post-protocol remainder). */
  MIN_INSURANCE_SHARE_BPS: 1200
};
Object.freeze(FEE_SPLIT);
function validateFeeSplit(args) {
  const { creatorShareBps, lpShareBps, insuranceShareBps } = args;
  const sum = creatorShareBps + lpShareBps + insuranceShareBps;
  if (sum !== FEE_SPLIT.FEE_SHARE_TOTAL_BPS) {
    return `shares sum to ${sum}, must sum to exactly FEE_SHARE_TOTAL_BPS ${FEE_SPLIT.FEE_SHARE_TOTAL_BPS}`;
  }
  if (creatorShareBps > FEE_SPLIT.MAX_CREATOR_SHARE_BPS) {
    return `creatorShareBps ${creatorShareBps} exceeds MAX_CREATOR_SHARE_BPS ${FEE_SPLIT.MAX_CREATOR_SHARE_BPS}`;
  }
  if (lpShareBps < FEE_SPLIT.MIN_LP_SHARE_BPS) {
    return `lpShareBps ${lpShareBps} is below MIN_LP_SHARE_BPS ${FEE_SPLIT.MIN_LP_SHARE_BPS}`;
  }
  if (insuranceShareBps < FEE_SPLIT.MIN_INSURANCE_SHARE_BPS) {
    return `insuranceShareBps ${insuranceShareBps} is below MIN_INSURANCE_SHARE_BPS ${FEE_SPLIT.MIN_INSURANCE_SHARE_BPS}`;
  }
  return null;
}
function encodeUpdateFeeSplit(args) {
  return concatBytes(
    encU8(IX_TAG.UpdateFeeSplit),
    encU16(args.creatorShareBps),
    encU16(args.lpShareBps),
    encU16(args.insuranceShareBps),
    encU64(args.authorityEpoch)
  );
}
function encodeWithdrawInsuranceReserveToStake() {
  return encU8(IX_TAG.WithdrawInsuranceReserveToStake);
}
function encodeUpdateMaintenanceFeePerSlot(args) {
  return concatBytes(
    encU8(IX_TAG.UpdateMaintenanceFeePerSlot),
    encU128(args.maintenanceFeePerSlot)
  );
}
function encodeUpdateTradeFeePolicy(args) {
  return concatBytes(
    encU8(IX_TAG.UpdateTradeFeePolicy),
    encU64(args.tradeFeeBaseBps),
    encU64(args.policySequence)
  );
}
function encodeExpireBackingBucket(args) {
  return concatBytes(
    encU8(IX_TAG.ExpireBackingBucket),
    encU16(args.domain)
  );
}
function encodeWithdrawCreatorFee(args) {
  return concatBytes(
    encU8(IX_TAG.WithdrawCreatorFee),
    encU128(args.amount),
    encU16(args.assetIndex),
    encU64(args.authorityEpoch)
  );
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
  { name: "mint", signer: false, writable: false }
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
var ACCOUNTS_NFT_HOLDER_AUTH = [
  { name: "nftRegistry", signer: false, writable: false },
  { name: "positionNft", signer: false, writable: false },
  { name: "signerNftAta", signer: false, writable: false }
];
function withNftHolderAuth(base) {
  return [...base, ...ACCOUNTS_NFT_HOLDER_AUTH];
}
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
var ACCOUNTS_TOP_UP_BACKING_BUCKET = [
  { name: "signer", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  // #433: [5] ledger is REQUIRED and [6] systemProgram lets the handler CREATE it when it
  // does not exist yet. That creation is what makes requiring the ledger on
  // WithdrawBackingBucket safe — see ACCOUNTS_WITHDRAW_BACKING_BUCKET. The signer pays rent.
  { name: "ledger", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
var ACCOUNTS_WITHDRAW_BACKING_BUCKET = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "ledger", signer: false, writable: true }
];
var ACCOUNTS_UPDATE_BACKING_FEE_POLICY = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_WITHDRAW_BACKING_BUCKET_EARNINGS = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
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
var ACCOUNTS_CLOSE_SLAB_SECONDARY = [
  { name: "dest", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "destAta", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "secondaryVault", signer: false, writable: true },
  { name: "secondaryDestAta", signer: false, writable: true }
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
  { name: "admin", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
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
  { name: "owner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true }
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
      const key2 = keys[s.name];
      if (!key2) {
        throw new Error(
          `buildAccountMetas: missing key for account "${s.name}". Provided keys: [${Object.keys(keys).join(", ")}]`
        );
      }
      return key2;
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
  { name: "market", signer: false, writable: true },
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
  { name: "systemProgram", signer: false, writable: false },
  { name: "siblingLedger", signer: false, writable: true }
];
var ACCOUNTS_LP_VAULT_CRANK_FEES = [
  { name: "cranker", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
var ACCOUNTS_REBALANCE_LP_VAULT_BACKING = [
  { name: "cranker", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: false },
  { name: "fromLedger", signer: false, writable: true },
  { name: "toLedger", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
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
  { name: "lpOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: false },
  { name: "lpPortfolio", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherProg", signer: false, writable: false },
  { name: "matcherDelegate", signer: false, writable: false }
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
var ACCOUNTS_WITHDRAW_PROTOCOL_FEE = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_SET_PROTOCOL_FEE_AUTHORITY = [
  { name: "upgradeAuthority", signer: true, writable: false },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_UPDATE_FEE_SPLIT = [
  { name: "admin", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_WITHDRAW_INSURANCE_RESERVE_TO_STAKE = [
  { name: "cranker", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "stakePool", signer: false, writable: false },
  { name: "stakeVault", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_UPDATE_MAINTENANCE_FEE_PER_SLOT = [
  { name: "admin", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_UPDATE_TRADE_FEE_POLICY = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_EXPIRE_BACKING_BUCKET = [
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_WITHDRAW_CREATOR_FEE = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_CLOSE_RESOLVED = [
  { name: "owner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP = [
  { name: "owner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_NFT_ESCROW_PROOF = [
  { name: "nftRegistry", signer: false, writable: false }
];
function withNftEscrowProof(base) {
  return [...base, ...ACCOUNTS_NFT_ESCROW_PROOF];
}
var ACCOUNTS_CLOSE_RESOLVED_UNSIGNED = withNftEscrowProof([
  { name: "owner", signer: false, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
]);
var ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP_UNSIGNED = withNftEscrowProof([
  { name: "owner", signer: false, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
]);
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
    hint: "Account version mismatch. Expected VERSION=17 (WrapperConfigV16 576B after the fee-collection split; 496B before it). The program may need upgrading, or the account predates the protocol-fee redeploy."
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
    hint: "No new fees to distribute to the LP vault. Wait for more trading activity. On a LIVE bound vault, bundle tag 78 before 75/77 ONLY when fees are harvestable (otherwise the bundle fails with 38; without it a harvestable backlog fails with 84). On a Resolved terminal-flat bound market 78 is a no-op success."
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
  },
  // ── Insurance withdrawal policy enforcement (F-1 / F-2) (47-48) ─────────────
  // Source: v16_program.rs PercolatorError variants appended after NftPortfolioProvenance.
  47: {
    name: "InsuranceWithdrawCooldownActive",
    hint: "Insurance withdrawal cooldown is still active (F-1). Wait for the cooldown period to elapse before withdrawing."
  },
  48: {
    name: "InsuranceWithdrawCeilingExceeded",
    hint: "Insurance withdrawal would exceed the deposits-only ceiling (F-2). Reduce the withdrawal amount or wait for more deposits."
  },
  // ── EngineInsufficientInitialMargin (49) ─────────────────────────────────────
  // Ordinal 49 CONFIRMED against the PercolatorError enum in
  // percolator-prog@10acb5ae (appended after InsuranceWithdrawCeilingExceeded=48,
  // before LpVaultDepositBelowMinimumLiquidity=50). This is a distinct error for
  // initial-margin failure, previously collapsed into the opaque
  // EngineInvalidConfig=14.
  49: {
    name: "EngineInsufficientInitialMargin",
    hint: "Insufficient initial margin for this trade or position open. Deposit more collateral or reduce the position size."
  },
  // ── BUG-2 / N7: LP vault genesis dead-share floor (50) ───────────────────
  // Source: v16_program.rs PercolatorError variant appended after
  // EngineInsufficientInitialMargin=49 (confirmed on-chain 2026-07-16 against
  // fresh wrapper DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj, commit a3cb4390).
  50: {
    name: "LpVaultDepositBelowMinimumLiquidity",
    hint: "The LP vault's true first deposit must exceed LP_VAULT_MINIMUM_LIQUIDITY so a permanent dead-share floor can be locked (N7 anti-inflation hardening). Increase the first deposit amount."
  },
  // ── Fee-split floor enforcement (51) ──────────────────────────────────────
  // Source: v16_program.rs PercolatorError variant appended after
  // LpVaultDepositBelowMinimumLiquidity=50 (confirmed on-chain 2026-07-16
  // against fresh wrapper DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj, commit
  // a3cb4390).
  //
  // ⚠ MEANING NARROWED as of percolator-prog@10acb5ae (devnet 2026-07-22).
  // This code originally came from `policy_v16::fee_split_floor_ok`, a
  // TOLERANCE-based check on the two-rate (trade_fee_base_bps +
  // backing_fee_bps) split raised from UpdateBackingFeePolicy (tag 51) /
  // UpdateTradeFeePolicy. That function is RETIRED and has no live call sites.
  // The ordinal is REUSED (not vacated — it is wire-visible) and is now raised
  // only by `policy_v16::validate_fee_split` from UpdateFeeSplit (tag 86),
  // EXACTLY and with no tolerance, against the bps floors below.
  51: {
    name: "FeeSplitFloorViolation",
    hint: "UpdateFeeSplit (tag 86) shares violate the on-chain floors: creator_share_bps must be <= 3600 (45% of the 8000 remainder), lp_share_bps >= 3200 (40%), insurance_share_bps >= 1200 (15%). Enforced exactly, with no rounding tolerance. Use validateFeeSplit() before sending. Note the shares must ALSO sum to exactly 8000 \u2014 that separate failure is Custom(52) FeeSplitSumInvalid."
  },
  // ── Fee-collection split (52-53) ──────────────────────────────────────────
  // Source: v16_program.rs PercolatorError variants appended after
  // FeeSplitFloorViolation=51 on percolator-prog
  // feat/protocol-fee-taker-only@2b3a6a65. DEPLOYED as of 2026-07-22: the
  // devnet wrapper DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj now carries
  // percolator-prog@10acb5ae (hash 6b2fda2363352aba0ef88abde0d398f9dd477b12
  // 08507e7e8393586ed5458931), so 52-61 are observable on-chain.
  52: {
    name: "FeeSplitSumInvalid",
    hint: "UpdateFeeSplit (tag 86) shares do not sum to exactly FEE_SHARE_TOTAL_BPS (8000 = 10_000 - PROTOCOL_FEE_BPS). creator_share_bps + lp_share_bps + insurance_share_bps must equal 8000. Use validateFeeSplit() before sending."
  },
  53: {
    name: "NoInsuranceReserveToClaim",
    hint: "WithdrawInsuranceReserveToStake (tag 87) was called with nothing available (insurance_reserve_accrued_atoms == insurance_reserve_withdrawn_atoms). Not an error condition for a keeper \u2014 the leg is simply already fully pushed; back off and retry after more trade volume."
  },
  // ── load_bound_stake_pool diagnostics (54-60) ─────────────────────────────
  // Source: v16_program.rs, same branch. These seven previously ALL returned
  // Unauthorized, which left a keeper unable to tell "this market never bound a
  // pool" from "someone pointed a forged pool at us". Each failure of tag 87's
  // destination-resolution now has its own code.
  //
  // ⚠ ORDINAL 55 CHANGED MEANING during development: it was briefly
  // StakePoolAssetAdminNotBurned, an ineffective mitigation that has been
  // removed. That variant existed only on an unmerged branch and was NEVER
  // deployed, so no on-chain consumer has ever observed the old meaning.
  54: {
    name: "StakePoolNotBound",
    hint: "Asset 0's insurance_authority is still zero: no stake pool has ever been bound to this market, so there is no staker constituency owed the insurance leg. Call the stake program's BindInsuranceAuthority (stake tag 19) first \u2014 it is required, or the insurance/staker leg has no exit."
  },
  55: {
    name: "StakePoolOwnerMismatch",
    hint: "The supplied stake-pool account is not owned by the wrapper's pinned STAKE_PROGRAM_ID. THIS IS THE FORGERY GATE \u2014 it is checked before any byte of the account is read. Pass the pool PDA ['stake_pool', market] derived under the canonical stake program (devnet v2.1 A6DVNubvzMMETQinK6bipekkaTTrkUu2RMw2kBoJrdkE; v1 close-only wrapper ETDLAdi\u2026 pins VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w)."
  },
  56: {
    name: "StakePoolAuthorityMismatch",
    hint: "The PDA ['vault_auth', pool] derived under the pool account's owning program does not equal the bound insurance_authority. The supplied pool is not the one that bound itself to this market."
  },
  57: {
    name: "StakePoolMarketMismatch",
    hint: "The stake pool's own stored `slab` field does not name this market. You passed a pool belonging to a different market."
  },
  58: {
    name: "StakePoolWrapperMismatch",
    hint: "The stake pool's stored `percolator_program` (its CPI target) is not this wrapper deployment. The pool was initialized against a different wrapper program id."
  },
  59: {
    name: "StakePoolModeMismatch",
    hint: "The stake pool is not in insurance-LP mode (pool_mode != 0). Trading-mode pools carry no FlushToInsurance loss exposure, so they are not owed the insurance/staker fee leg."
  },
  60: {
    name: "StakeProgramNotPinned",
    hint: "This wrapper build has no pinned stake program id, so WithdrawInsuranceReserveToStake (tag 87) has no destination it is willing to trust and refuses to move tokens. Emitted by every non-devnet build: v17 percolator-stake has no mainnet deployment. The atoms stay safe in header.insurance."
  },
  // ── Program bug fixes, 2026-07-22 (61) ────────────────────────────────────
  // Source: v16_program.rs PercolatorError variant appended after
  // StakeProgramNotPinned=60, percolator-prog@10acb5ae. DEPLOYED to devnet
  // wrapper DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj (hash-verified
  // 6b2fda2363352aba0ef88abde0d398f9dd477b1208507e7e8393586ed5458931).
  61: {
    name: "AssetSlotAlreadyConfigured",
    hint: "UpdateAssetLifecycle(ACTIVATE) named an asset slot BELOW max_market_slots that is already configured and live (Active / DrainOnly / Recovery). Only two activations are legal: APPEND at asset_index == max_market_slots, or RE-ACTIVATE a slot whose lifecycle is Retired. InitMarket pre-configures slots 0..max_portfolio_assets, so on a market created with max_portfolio_assets > 1 every one of those slots hits this. Previously surfaced as the misleading Custom(21) EngineLockActive."
  },
  // ── Creator fee claim, 2026-07-24 (62) ────────────────────────────────────
  // Source: v16_program.rs PercolatorError variant appended after
  // AssetSlotAlreadyConfigured=61. Ordinals 0-61 are unmoved (pinned by
  // v16_cu.rs::v17_new_error_ordinals_are_appended_at_the_tail and
  // v16_fee_split.rs::fee_split_error_ordinals_are_pinned).
  // ⚠ NOT YET DEPLOYED — this ships with the creator-fee-claim wrapper
  // upgrade (tag 90 WithdrawCreatorFee). Against the currently-deployed
  // wrapper this code is unreachable.
  62: {
    name: "CreatorFeeOverClaim",
    hint: "WithdrawCreatorFee (tag 90) requested more than the market has accrued: amount > creator_fee_claimable_atoms (WrapperConfigV16 bytes 568..576, u64 LE). The claim is exact-amount \u2014 it does NOT partial-fill, and nothing is debited on rejection. Read the current claimable balance and retry with amount <= it. Note the distinct codes on this handler: Custom(9) InvalidInstruction for amount == 0 (tag 90 does not use tag 84's '0 means withdraw everything' convention), and Custom(25) EngineCounterUnderflow only for the fail-closed internal checked_sub, which is unreachable behind this check and would indicate a broken invariant."
  },
  // ── LP-vault reachability guard, 2026-08-29 (63) ───────────────────────────
  // Source: v16_program.rs PercolatorError variant appended after
  // CreatorFeeOverClaim=62. Ordinals 0-62 are unmoved.
  // ✅ DEPLOYED to devnet 2026-08-29 — wrapper 02326f4f, sha c9827970bf02098b,
  // slot 490057417, verified byte-identical.
  63: {
    name: "LpVaultBackingBucketNotEmpty",
    hint: "CreateLpVault (tag 74) targeted a domain whose backing bucket is ALREADY funded at an expiry that is not LP_VAULT_BACKING_EXPIRY_SLOT (u64::MAX/2). The range check on `domain` passed; this is the separate REACHABILITY check, and it fires BEFORE the registry PDA takes backing_bucket_authority so a refusal leaves the existing bucket owner intact. Without it the vault would be created dead: DepositToLpVault refuses for the whole remaining term on the expiry mismatch, the provider who funded that bucket can no longer withdraw because the authority is gone, and the only exit is CloseLpVault \u2014 which permanently forfeits this market's ability to ever have an LP vault, because it leaves the LP share mint on-chain and CreateLpVault requires both PDAs to be system-owned and empty. Fix: pick a domain whose bucket is Empty, or wait for the existing backing to expire. Do NOT confuse this with Custom(9) InvalidInstruction, which this handler also returns for an out-of-range domain (domain >= configured_slots * 2) and for fee_share_bps / oi_reservation_threshold_bps > 10_000."
  },
  // ── Deployed v18.2 (6377376a) — appended after 63 ─────────────────────────
  64: {
    name: "RentExemptRequired",
    hint: "CloseSlab's tail must leave CLOSED_MARKET_TOMBSTONE_RENT_LAMPORTS in the market account so the closed-market tombstone (header KIND_CLOSED_MARKET = 8) stays rent-exempt forever (anti address-reuse, upstream d57411f8). Only fires if the market account holds fewer lamports than that floor at close \u2014 not reachable on a normally-funded market."
  },
  65: {
    name: "AssetGenerationMismatch",
    hint: "A caller-supplied market_id / expected_market_id / asset_generation_frontier did not match the asset slot's current generation (AssetStateV16.market_id / header.next_market_id). The instruction was built against an older generation of this slot. Re-read the live values and rebuild."
  },
  // ── P1 wrapper safety release — part of the relaunch wrapper (P1+P3 @ 58e379f1). ──
  // Appended, ordinals 0-65 unmoved.
  66: {
    name: "ExecPriceOutsideOracleBand",
    hint: "P1: the matcher's fill price lies outside reference \xB1 band (reference = the oracle_price_e6 the wrapper handed the matcher). limit_price == 0 now means 'any price inside the band', not any price. Retry smaller or when the quote is inside the band; a v2 matcher with EXEC_BAND clips instead."
  },
  67: {
    name: "SameOwnerTrade",
    hint: "P1: the taker's portfolio owner equals the matcher LP's owner, or the traded asset's asset_admin (the market creator). Trade from a different wallet (hygiene rule; not a sybil defence)."
  },
  68: {
    name: "LpExposureCapExceeded",
    hint: "P1: this fill would leave the LP's |position| \xD7 mark above k \xD7 LP initial-margin equity on the asset. Trade smaller, or wait for the LP to add capital / reduce inventory."
  },
  69: {
    name: "LpFloorHalt",
    hint: "P1 auto-halt: the matcher LP's initial-margin equity is at or below the protocol floor, so risk-increasing fills are refused. Reducing fills and closes still work."
  },
  70: {
    name: "ProtocolSideOiCapExceeded",
    hint: "P1: the protocol-set per-asset side open-interest cap (tag 93 SetAssetRiskLimits) would be exceeded on this side. Trade the other side, smaller, or later."
  },
  71: {
    name: "CloseSlabFeesOutstanding",
    hint: "P1 F4: CloseSlab refused because protocol / creator / LP / staker fee legs are still owed. Claim them first \u2014 tag 84 WithdrawProtocolFee, tag 90 WithdrawCreatorFee \u2014 and sweep the staker leg (tag 87, allowed on a terminal-empty resolved market). Nothing is burned. planCloseSlabAttempt() orders these for you."
  },
  // ── P3 vault-owned LP — part of the relaunch wrapper (P1+P3 @ 58e379f1). ──
  // Appended after P1's 66-71 (P3 is stacked on P1); ordinals verified by name
  // against the P3 enum (`PercolatorError::X as u32`) in test/p3.test.ts.
  72: {
    name: "VaultLpAlreadyBound",
    hint: "P3 tag 94: this vault (or asset) already has a bound vault LP."
  },
  73: {
    name: "VaultLpNotBound",
    hint: "P3: a vault-LP instruction on a vault with no bound vault LP, or the passed vault_lp_state / vault LP portfolio does not match the registry (check the tail accounts on 75/77/78)."
  },
  74: {
    name: "VaultLpSeniorImpaired",
    hint: "P3 Earn deposit (tag 75) refused: the senior tranche is impaired (vault value < senior claim). New money would buy into a loss the junior did not cover. Wait for the junior to be topped up (tag 96) or the LP to recover."
  },
  75: {
    name: "VaultLpJuniorWithdrawRefused",
    hint: "P3 tag 97: junior withdrawal over the junior surplus minus the floor (ceil(C_eff * junior_floor_bps / 10000)), or the backing pots do not fully cover the senior claim."
  },
  76: {
    name: "VaultLpRecallRefused",
    hint: "P3 tag 98: recall of zero, or more than the senior liquidity shortfall."
  },
  77: {
    name: "VaultLpExclusiveCounterparty",
    hint: "P3: on a bound asset only the vault LP may take new risk. Refused: (a) a matcher (TradeCpi/BatchTradeCpi) fill that grows an LP other than the bound vault LP; (b) any TradeNoCpi / BatchTradeNoCpi fill that grows EITHER portfolio's position on a bound asset \u2014 the vault LP is never a NoCpi party (its owner, the registry PDA, cannot sign), so direct P2P trading on a bound P3 asset can only reduce. Reducing fills still work."
  },
  78: {
    name: "VaultLpLeverageStepDown",
    hint: "P3 leverage step-down: the taker's conservative equity does not cover the crowded-book initial margin for this fill. Add collateral or trade smaller."
  },
  79: {
    name: "VaultLpBoundCannotClose",
    hint: "P3: CloseLpVault (tag 80) on a vault with a bound vault LP."
  },
  80: {
    name: "VaultLpExposureCapExceeded",
    hint: "P3-H2: this fill would leave |vault LP position| * mark above the protocol leverage cap on the vault LP's conservative equity (AssetVaultLpV18.vault_lp_max_lev_bps, default 1x). Trade smaller or wait for the junior to add capital."
  },
  81: {
    name: "VaultLpMatcherNotApproved",
    hint: "P3-H2 tag 95: the matcher program is not the tag-99 approved matcher for this asset, or max_fill_abs / max_inventory_abs is 0 (unbounded is refused)."
  },
  82: {
    name: "VaultLpUseSettleResolved",
    hint: "P3-H1: CloseResolved (30) / ClaimResolvedPayoutTopup (46) on the vault LP portfolio. Use VaultLpSettleResolved (tag 101): senior shortfall into backing, residual to the junior owner."
  },
  83: {
    name: "VaultLpReleaseRefused",
    hint: "P3-M1 tag 102: release of zero, or of more than the backing surplus over the senior claim (nav - C; Resolved: physical - C)."
  },
  84: {
    name: "VaultLpHarvestPending",
    hint: "P3-L1/K1: LP fees are harvestable (H > 0), or (Resolved, terminal-flat, f0b990e1) a terminal residual or stray pot backing is not yet absorbed. A genesis Earn deposit, or a redemption on a bound vault, must be preceded by tag 78 LpVaultCrankFees in the same transaction (planResolvedVaultLpExitP3 orders 78 before every 77)."
  },
  85: {
    name: "VaultLpValuationStale",
    hint: "P3-L2: the vault LP holds inventory and its health certificate is not current, so the vault cannot be valued. Prepend a permissionless tag-5 crank of the vault LP (buildVaultLpRefreshCrankIxP3)."
  },
  86: {
    name: "VaultLpMultiAssetMarket",
    hint: "P3 F14-Q2: a vault LP needs a single-ASSET market. Tag 94 InitVaultLp requires exactly one configured asset slot (max_market_slots == 1 \u2014 create the market with maxPortfolioAssets: 1), and on a bound market no other asset may be activated (UpdateAssetLifecycle), traded risk-increasing or backed. The terminal residual is market-wide and is credited to the one vault."
  },
  87: {
    name: "VaultLpSeniorDrawRequired",
    hint: "P3 senior draw: an engine step would open a bankrupt close on the vault LP (winners haircut) while the vault's own pots can still fund its undrawn deficit. Crank the vault LP first (PermissionlessCrank tag 5 draws senior backing into it; pass both pot ledgers writable), then retry."
  },
  88: {
    name: "VaultLpRedeemNeedsRecall",
    hint: "P3 B24: a senior redemption (75/77) on a LIVE bound vault needs more than the chosen pot holds (backing or pot principal), because part of the senior value sits in the vault LP's capital. Run VaultLpRecall (tag 98, permissionless, vault LP flat) first, or redeem fewer shares. In RESOLVED mode the same per-pot shortfall is EngineLockActive (21): size each redemption to one pot's idle backing and repeat on the other pot."
  },
  89: {
    name: "VaultLpPausedForSeniorDraw",
    hint: "P3 senior draw: PAUSED because Earn is covering a vault-LP loss (a senior draw is pending or outstanding). The vault LP's risk-increasing fills, junior withdraw (97), recall (98) and junior release (102) are halted until the seniors are restored (a later recovery restores C first). Check decodeAssetVaultLpDrawP3 / VaultLpStateP3.seniorDrawOutstandingAtoms; retry after the draw is booked and recovered."
  },
  90: {
    name: "VaultLpBindRequiresFlatAsset",
    hint: "P3 (592286b4): VaultLp bind (tag 94) refused because the asset already has open interest. Positions that predate the vault LP are trader-vs-trader and can leave its winners short / block terminal-flat. Bind the vault at market creation, before any trade (the relaunch seed and the wizard do)."
  },
  91: {
    name: "LpVaultTargetPotImpaired",
    hint: "Non-bound Earn vault, deposits paused (wrapper 7a3ac04c NAV floor + its H-1 successor): DepositToLpVault (tag 75) is refused while a backing pot's net impairment (cumulative loss minus recovery) exceeds its principal (7a3ac04c: the target pot; H-1: either pot), or while the share price has collapsed (nav * 1000 < total shares). Depositing then would be absorbed by the excess loss or would mint almost every share at a near-zero price. Nothing moved; withdrawals (tag 77) still work. Retry once the vault recovers. Do NOT send RebalanceLpVaultBacking (91) into an over-impaired pot to clear it: under the floor that only moves holders' value into that pot."
  },
  92: {
    name: "GrowthLeverageExceeded",
    hint: "Max leverage on this side is lower right now: this market's liquidity is in use. Reducing or closing is always allowed. growth-v19: a risk-increasing fill on a growth-enabled asset left the taker's conservative equity (no credit for positive PnL) below the dynamic initial margin (the launch ceiling IMR(L_ceil), stepped up on the crowded side as the LP's capacity fills). Reduce the size or add margin. Use quoteMaxLeverage() to preview."
  },
  93: {
    name: "GrowthCapacityFull",
    hint: "New positions on this side are paused: the market's capacity is full. Reducing or closing your position is always allowed. growth-v19: a crowd-side risk-increasing fill would take the LP past its capacity N_cap = lambda * C_m / P (refused only when u > 1; u == 1 is admitted at 100% IMR), the LP's capital is 0, the price is 0, or the market's bankruptcy h-lock is latched."
  },
  94: {
    name: "GrowthInvalidConfig",
    hint: "growth-v19: invalid growth configuration. InitMarket with a growth block: MMR < r_gap + liquidation fee, r_gap == 0, r_gap below max_price_move_bps_per_slot * 50, l_launch outside [1x, tier max], or max_abs_funding_e9_per_slot == 0 on a single-slot market. InitVaultLp (94) with an l_launch on an asset whose growth block is off or outside the tier."
  },
  95: {
    name: "GrowthNeedsLpCounterparty",
    hint: "Open against the market maker: trade through the book. growth-v19: on a growth asset every risk-increasing fill must face the asset's bound vault LP. A fill between two non-LP portfolios, between two LPs, or against any other LP may only reduce or close."
  },
  96: {
    name: "GrowthBatchTooManyLegs",
    hint: "Split this order into batches of at most 10 markets. growth-v19: a BatchTradeCpi carrying a leg on a growth-enabled asset is limited to GROWTH_BATCH_MAX_LEGS (10) legs (compute budget). Nothing was executed."
  },
  97: {
    name: "GrowthRequiresBoundVaultLp",
    hint: "This market is not open for new positions. Reducing or closing is always allowed. growth-v19: opens on a growth-enabled asset are admitted only when the asset has a bound vault LP (P3); capacity is measured on the users' open interest against that LP."
  },
  98: {
    name: "GrowthUtilisationFeeNotCovered",
    hint: "This side is busy: raise your max fee to cover the utilisation fee (see the quote). growth-v19 N-2: an open into a side above its utilisation kink pays a utilisation fee to the market maker, and the signed fee_bps (or the market's fee cap) does not cover base + matcher fee + that fee. Use previewGrowthOpenFee(). Closing is never charged."
  },
  99: {
    name: "GrowthUtilisationFeeRequiresTradeCpi",
    hint: "Place this order on its own (not in a batch). growth-v19 N-2: a batch leg that opens into a side above its utilisation kink owes a utilisation fee only a single TradeCpi can pay. Closes and opens below the kink can still be batched."
  },
  // P2b Earn allocation (percolator-prog #526): explicit discriminants 100..=103.
  100: {
    name: "VaultLpAllocateRefused",
    hint: "Nothing to allocate right now. Tag 103 VaultLpAllocate was refused: a senior draw is outstanding or pending, the vault is impaired (V < C_eff), the vault LP is insolvent, the junior is below 5% of C_eff, the market is not Live, the requested amount is 0, or the alpha / buffer room is 0. Nothing moved. A keeper treats this as 'skip this crank' and retries next cycle."
  },
  101: {
    name: "VaultLpCapacityLocked",
    hint: "Capital is backing open positions; try again once the market's LP has closed them. Lowering the vault LP's capital (junior withdraw 97, recall 98) would leave its growth capacity N_cap below its open inventory (A4 lock)."
  },
  102: {
    name: "VaultLpCreatorFeeVesting",
    hint: "Creator fees unlock when the market's first-loss cushion reaches its target. Tag 90 is refused while the G6 junior cushion is below its target (AssetVaultLpP3.creatorFeeVesting)."
  },
  103: {
    name: "VaultLpSeniorCapitalHalt",
    hint: "This side is paused while the market's first-loss capital is rebuilt; closing is always allowed. The junior is exhausted (V < C_eff), so the vault LP is trading senior capital and its risk-increasing fills are halted (Q2); reductions, closes and thin-side opens are not. Compare the LP's conservative equity with seniorFloorDecodeP2b(p2b_senior_floor_code)."
  },
  // P2b E7 (percolator-prog #525, engine #276): explicit discriminants 120..=122; each was Custom(21).
  120: {
    name: "EngineAdlReduceOnly",
    hint: "This market is close-only while it rebalances after an auto-deleverage. You can reduce or close; new positions reopen once it resets."
  },
  121: {
    name: "EngineLossStale",
    hint: "Positions are being refreshed after a price move. Opening is paused until the refresh lands; closing still works. Retry shortly."
  },
  122: {
    name: "EarnExitWouldUnderBackClaims",
    hint: "This withdrawal would leave open winning positions under-backed. Try a smaller amount, or retry after those positions close or settle."
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
function safeEnv(key2) {
  try {
    return typeof process !== "undefined" && process?.env ? process.env[key2] : void 0;
  } catch {
    return void 0;
  }
}
var PROGRAM_IDS = {
  devnet: {
    // v2.1 fresh-ID deploy (SDK 9.0.0, decided 2026-10-05, "mode ii"): the devnet wrapper and
    // matcher move to BRAND-NEW program addresses (5NGgnU2j… / DfTxJUT5…), and stake/nft move
    // with them (see PROGRAM_IDS_V17). This is the ACTIVE devnet set that getProgramId() /
    // getProgramId("devnet") resolves and that PDA derivation + tx targeting use. The previous
    // ETDLAdi… world (SDK 8.x) stays LIVE as "v1 / close-only" so users can exit: its four ids
    // are exported as PROGRAM_IDS_DEVNET_V1 — pass them explicitly to read/close v1 markets.
    // Older abandoned wrappers (GnwdeQr…, DhSkE7u…) remain outside every allowlist.
    percolator: "5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe",
    matcher: "DfTxJUT5BbERs1tR33dP82kaUJ1NLymRxXErXAYXcDam"
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
  /** ACTIVE devnet wrapper (5NGgnU2j…) — v2.1 fresh-ID deploy (SDK 9.0.0). Single source of
   *  truth with PROGRAM_IDS.devnet.percolator; @deprecated alias, prefer PROGRAM_IDS.devnet. */
  percolator: "5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe",
  /** v2.1 matcher — fresh devnet address (SDK 9.0.0). */
  matcher: "DfTxJUT5BbERs1tR33dP82kaUJ1NLymRxXErXAYXcDam",
  /** v2.1 nft — fresh devnet address (SDK 9.0.0). */
  nft: "DWUNq2iYh6Sdgdv3qv7aWJNJGhoK25FqyQrqDUrDD9zs",
  /** v2.1 stake/vault — fresh devnet address (SDK 9.0.0); the wrapper's pinned STAKE_PROGRAM_ID. */
  vault: "A6DVNubvzMMETQinK6bipekkaTTrkUu2RMw2kBoJrdkE"
};
Object.freeze(PROGRAM_IDS_V17);
var PROGRAM_IDS_DEVNET_V1 = {
  /** v1 (close-only) devnet wrapper. */
  percolator: "ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB",
  /** v1 (close-only) devnet matcher — the v1 wrapper's canonical vault-LP matcher. */
  matcher: "EDKKgRaVHna6FCxiY1kgMzegD9rpaN1nwJNSzAzeBUBX",
  /** v1 (close-only) devnet nft program. */
  nft: "EMYT15LZWaP7Mmmm245kQPbrTyVjG16yZiU9kfNTF3GZ",
  /** v1 (close-only) devnet stake/vault program — the v1 wrapper's pinned STAKE_PROGRAM_ID. */
  vault: "VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w"
};
Object.freeze(PROGRAM_IDS_DEVNET_V1);
var PROGRAM_ID_V17 = new PublicKey3(PROGRAM_IDS_V17.percolator);
var KNOWN_PROGRAM_IDS = /* @__PURE__ */ new Set([
  PROGRAM_IDS.devnet.percolator,
  PROGRAM_IDS.mainnet.percolator,
  PROGRAM_IDS_V17.percolator,
  PROGRAM_IDS_DEVNET_V1.percolator
  // v1 / close-only devnet wrapper (still live)
]);
var KNOWN_MATCHER_IDS = /* @__PURE__ */ new Set([
  PROGRAM_IDS.devnet.matcher,
  PROGRAM_IDS.mainnet.matcher,
  PROGRAM_IDS_DEVNET_V1.matcher
  // v1 / close-only devnet matcher (still live)
]);
function programOverrideOptIn() {
  return safeEnv("PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE") === "1";
}
function getProgramId(network) {
  if (network === void 0) {
    const override = safeEnv("PROGRAM_ID");
    if (override) {
      if (!KNOWN_PROGRAM_IDS.has(override) && !programOverrideOptIn()) {
        throw new Error(
          `[percolator-sdk] PROGRAM_ID env var "${override}" is not a known program address. Allowed values: ${[...KNOWN_PROGRAM_IDS].join(", ")}. Pass an explicit network argument, or set PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1 to intentionally allow an unlisted program (e.g. a fresh pre-deploy address).`
        );
      }
      console.warn(`[percolator-sdk] PROGRAM_ID env override active: ${override}`);
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
      if (!KNOWN_MATCHER_IDS.has(override) && !programOverrideOptIn()) {
        throw new Error(
          `[percolator-sdk] MATCHER_PROGRAM_ID env var "${override}" is not a known matcher program address. Allowed values: ${[...KNOWN_MATCHER_IDS].join(", ")}. Pass an explicit network argument, or set PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1 to intentionally allow an unlisted program (e.g. a fresh pre-deploy address).`
        );
      }
      console.warn(`[percolator-sdk] MATCHER_PROGRAM_ID env override active: ${override}`);
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
var KNOWN_NFT_PROGRAM_IDS = /* @__PURE__ */ new Set([
  "FqhKJT9gtScjrmfUuRMjeg7cXNpif1fqsy5Jh65tJmTS",
  // mainnet
  PROGRAM_IDS_V17.nft,
  // devnet v2.1 — the default below
  PROGRAM_IDS_DEVNET_V1.nft
  // devnet v1 / close-only (still live)
]);
var NFT_PROGRAM_OVERRIDE = safeEnv("NFT_PROGRAM_ID");
if (NFT_PROGRAM_OVERRIDE !== void 0 && !KNOWN_NFT_PROGRAM_IDS.has(NFT_PROGRAM_OVERRIDE)) {
  throw new Error(
    `[percolator-sdk] NFT_PROGRAM_ID env var "${NFT_PROGRAM_OVERRIDE}" is not a known NFT program address. Allowed values: ${[...KNOWN_NFT_PROGRAM_IDS].join(", ")}. Pass the programId argument explicitly to bypass env resolution.`
  );
}
var NFT_PROGRAM_ID = new PublicKey4(NFT_PROGRAM_OVERRIDE ?? PROGRAM_IDS_V17.nft);
function getNftProgramId() {
  return NFT_PROGRAM_ID;
}
var NFT_IX_TAG = {
  MintPositionNft: 0,
  BurnPositionNft: 1,
  SettleFunding: 2,
  GetPositionValue: 3,
  ExecuteTransferHook: 4,
  EmergencyBurn: 5,
  RepairExtraMetas: 6,
  ReconcileBurnedNft: 7
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
function encodeNftReconcile() {
  return new Uint8Array([NFT_IX_TAG.ReconcileBurnedNft]);
}
function buildNftAccountMetas(spec, keys) {
  if (keys.length !== spec.length) {
    throw new Error(
      `buildNftAccountMetas: account count mismatch: expected ${spec.length}, got ${keys.length}`
    );
  }
  return spec.map((code, i) => ({
    pubkey: keys[i],
    isSigner: code === "s" || code === "sw",
    isWritable: code === "w" || code === "sw"
  }));
}
var ACCOUNTS_NFT_MINT = [
  "sw",
  "w",
  "sw",
  "w",
  "w",
  "r",
  "r",
  "r",
  "r",
  "w",
  "r",
  "r"
];
var ACCOUNTS_NFT_BURN = [
  "sw",
  "w",
  "w",
  "w",
  "w",
  "r",
  "r",
  "w",
  "r",
  "r"
];
var ACCOUNTS_NFT_EMERGENCY_BURN = [
  "sw",
  "w",
  "w",
  "w",
  "w",
  "r",
  "r",
  "w",
  "r",
  "r"
];
var ACCOUNTS_NFT_RECONCILE = [
  "w",
  "w",
  "w",
  "r",
  "r",
  "r",
  "w",
  "w",
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
function u64Buf(value, label) {
  const v = typeof value === "bigint" ? value : BigInt(value);
  if (v < 0n || v > 0xffffffffffffffffn) {
    throw new Error(`${label} must be a u64`);
  }
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, v, true);
  return buf;
}
function deriveNftPda(portfolioAccount, marketId, programId = NFT_PROGRAM_ID) {
  return PublicKey4.findProgramAddressSync(
    [TEXT.encode("position_nft"), portfolioAccount.toBytes(), u64Buf(marketId, "marketId")],
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
function deriveExtraAccountMetas(nftMint, programId = NFT_PROGRAM_ID) {
  return PublicKey4.findProgramAddressSync(
    [TEXT.encode("extra-account-metas"), nftMint.toBytes()],
    programId
  );
}
var POSITION_NFT_STATE_LEN = 199;
var POSITION_NFT_MAGIC = 0x504552434e465400n;
var POSITION_NFT_VERSION = 2;
function readI128FromView(view2, offset) {
  const lo = view2.getBigUint64(offset, true);
  const hi = view2.getBigUint64(offset + 8, true);
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
  const view2 = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view2.getBigUint64(0, true);
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
    assetIndex: view2.getUint32(74, true),
    sideAtMint: data[78],
    basisPosQAtMint: readI128FromView(view2, 79),
    fSnapAtMint: readI128FromView(view2, 95),
    marketIdAtMint: view2.getBigUint64(111, true),
    epochSnapAtMint: view2.getBigUint64(119, true),
    positionOwnerAtMint,
    positionOwner: positionOwnerAtMint,
    mintedAt: view2.getBigInt64(159, true),
    lastHolder: new PublicKey4(data.subarray(167, 199))
  };
}

// src/abi/matcher-v2.ts
import { PublicKey as PublicKey5, TransactionInstruction } from "@solana/web3.js";
var MATCHER_CONFIGURE_TAG = 5;
var MATCHER_CONFIGURE_AUTH_LP_PDA = 0;
var MATCHER_CONFIGURE_AUTH_OWNER_PROOF = 1;
var MATCHER_CONFIGURE_HEADER_LP_PDA_LEN = 2;
var MATCHER_CONFIGURE_HEADER_OWNER_PROOF_LEN = 99;
var MATCHER_CONFIGURE_OP_BACKING_FEE_CAP = 0;
var MATCHER_CONFIGURE_OP_SET_PARAMS = 1;
var MATCHER_SET_PARAMS_LEN = 105;
var MATCHER_BACKING_FEE_CAP_BPS_MAX = 1e4;
var MATCHER_KIND = { Passive: 0, Vamm: 1, Adaptive: 2 };
var MATCHER_CALL_EXT_OFFSET = 43;
var MATCHER_CALL_EXT_LEN = 24;
var MATCHER_CALL_EXT_VERSION_V1 = 1;
var MATCHER_CALL_EXT_FLAG = {
  HEADROOM: 1,
  MARK_SLOT: 2,
  ACCEPTS_FEE_REQUEST: 4,
  TAKER_REDUCING: 8,
  EXEC_BAND: 16
};
var EXT_FLAGS_KNOWN = 31;
var MATCHER_RETURN_FLAG_REQUESTED_FEE_SHIFT = 22;
var MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK = 1023 << 22 >>> 0;
var MATCHER_REQUESTED_FEE_BPS_MAX = 1023;
var MATCHER_RETURN_KNOWN_FLAGS_V2 = (MATCHER_RETURN_KNOWN_FLAGS | MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK) >>> 0;
var MATCHER_V2_BLOCK_CTX_OFFSET = 178;
var MATCHER_V2_BLOCK_ACCOUNT_OFFSET = 242;
var MATCHER_V2_BLOCK_LEN = 78;
var MATCHER_V2_BLOCK_VERSION = 1;
var MATCHER_V2_FLAG_STALE_ALLOW_REDUCING = 1;
var MATCHER_V2_ERRORS = Object.freeze({
  8002: { name: "ERR_STALE_MARK", hint: "Matcher refused: the mark behind oracle_price_e6 is older than the ctx's max_mark_age_slots (call-extension mark_slot), or the observed-unchanged-price fallback tripped. Push a fresh mark, then retry. With STALE_ALLOW_REDUCING, reducing fills still pass." },
  8003: { name: "ERR_MARK_SLOT_IN_FUTURE", hint: "Matcher refused: call-extension mark_slot is greater than Clock.slot. The caller built a bad extension." },
  8004: { name: "ERR_ASSET_MISMATCH", hint: "Matcher refused: this kind-2 / observed-staleness context is bound to a different asset. One such context per asset." },
  8005: { name: "ERR_OWNER_PROOF_MISMATCH", hint: "Matcher tag 5 owner proof failed: create_program_address(['matcher', market, lp_portfolio, lp_owner, matcher_program, matcher_ctx, [bump]], wrapper) does not equal ctx.lp_pda. Check wrapper id, market, LP portfolio, signer = LP owner, and bump (deriveMatcherDelegate)." },
  8001: { name: "ERR_INCONSISTENT_LEG_ORACLE_PRICE", hint: "Matcher batch call: legs for the same asset carried different oracle prices." }
});
function decodeMatcherV2Error(code) {
  return MATCHER_V2_ERRORS[code];
}
var ZERO_V2 = Object.freeze({
  flags: 0,
  feeLoBps: 0,
  feeHiBps: 0,
  feeColdBps: 0,
  volAMilli: 0,
  volBDen: 0,
  volAlphaBps: 0,
  volWarmup: 0,
  volMoveCap10bps: 0,
  volRefSlots: 0,
  thinRebateMultBps: 0,
  skewCapBps: 0,
  rebateCapBps: 0,
  maxMarkAgeSlots: 0,
  observedStaleSlots: 0,
  skewRefInventory: 0n
});
function zeroMatcherV2Config() {
  return { ...ZERO_V2 };
}
var U16_MAX2 = 65535;
var U64_MAX = (1n << 64n) - 1n;
var U128_MAX = (1n << 128n) - 1n;
var DEFAULTS = {
  feeLo: 10,
  feeHi: 80,
  feeCold: 10,
  volAMilli: 1e3,
  volBDen: 100,
  volAlpha: 1e3,
  volWarmup: 8,
  volMoveCap10bps: 100,
  volRefSlots: 25,
  skewCap: 100,
  maxMarkAge: 150,
  observedStale: 0,
  flags: MATCHER_V2_FLAG_STALE_ALLOW_REDUCING,
  maxFeeBps: 1e3,
  maxSkewCapBps: 5e3
};
var MATCHER_V2_MAX_IMPACT_K_BPS = 1e5;
function defaultMatcherV2ConfigForKind2(tradingFeeBps, baseSpreadBps, maxTotalBps, skewSpreadMultBps, maxInventoryAbs) {
  const room = Math.min(Math.max(maxTotalBps - baseSpreadBps, 0), DEFAULTS.maxFeeBps);
  const feeHi = Math.min(DEFAULTS.feeHi, room);
  const loWant = Math.max(Math.min(tradingFeeBps, DEFAULTS.maxFeeBps), DEFAULTS.feeLo);
  const feeLo = Math.min(loWant, feeHi);
  const feeCold = Math.min(Math.max(DEFAULTS.feeCold, feeLo), feeHi);
  const skewCap = Math.min(DEFAULTS.skewCap, DEFAULTS.maxSkewCapBps, Math.min(maxTotalBps, U16_MAX2));
  const skewRef = maxInventoryAbs === 0n || maxInventoryAbs > U64_MAX ? U64_MAX : maxInventoryAbs;
  return {
    flags: DEFAULTS.flags,
    feeLoBps: feeLo,
    feeHiBps: feeHi,
    feeColdBps: feeCold,
    volAMilli: DEFAULTS.volAMilli,
    volBDen: DEFAULTS.volBDen,
    volAlphaBps: DEFAULTS.volAlpha,
    volWarmup: DEFAULTS.volWarmup,
    volMoveCap10bps: DEFAULTS.volMoveCap10bps,
    volRefSlots: DEFAULTS.volRefSlots,
    thinRebateMultBps: Math.floor(skewSpreadMultBps / 2),
    skewCapBps: skewCap,
    rebateCapBps: Math.floor(skewCap / 2),
    maxMarkAgeSlots: DEFAULTS.maxMarkAge,
    observedStaleSlots: DEFAULTS.observedStale,
    skewRefInventory: skewRef
  };
}
function checkRange(name, v, max) {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${name} must be an integer in 0..=${max}, got ${v}`);
}
function checkBig(name, v, max) {
  if (v < 0n || v > max) throw new Error(`${name} must be in 0..=${max}, got ${v}`);
}
function validateMatcherSetParams(p) {
  if (p.kind !== 0 && p.kind !== 1 && p.kind !== 2) throw new Error(`kind must be 0|1|2, got ${String(p.kind)}`);
  checkRange("tradingFeeBps", p.tradingFeeBps, 1e3);
  checkRange("maxTotalBps", p.maxTotalBps, 9e3);
  checkRange("baseSpreadBps", p.baseSpreadBps, 4294967295);
  checkRange("impactKBps", p.impactKBps, 4294967295);
  if (p.baseSpreadBps + p.tradingFeeBps > p.maxTotalBps) throw new Error("baseSpreadBps + tradingFeeBps must be <= maxTotalBps");
  checkBig("liquidityNotionalE6", p.liquidityNotionalE6, U128_MAX);
  checkBig("maxFillAbs", p.maxFillAbs, U128_MAX);
  checkBig("maxInventoryAbs", p.maxInventoryAbs, U128_MAX);
  checkRange("feeToInsuranceBps", p.feeToInsuranceBps, 1e4);
  checkRange("skewSpreadMultBps", p.skewSpreadMultBps, 1e4);
  if (p.kind === 1 && p.liquidityNotionalE6 === 0n) throw new Error("kind 1 (vAMM) requires liquidityNotionalE6 > 0");
  const c = p.v2;
  for (const [k, v] of [
    ["feeLoBps", c.feeLoBps],
    ["feeHiBps", c.feeHiBps],
    ["feeColdBps", c.feeColdBps],
    ["volAMilli", c.volAMilli],
    ["volBDen", c.volBDen],
    ["volAlphaBps", c.volAlphaBps],
    ["volRefSlots", c.volRefSlots],
    ["thinRebateMultBps", c.thinRebateMultBps],
    ["skewCapBps", c.skewCapBps],
    ["rebateCapBps", c.rebateCapBps],
    ["maxMarkAgeSlots", c.maxMarkAgeSlots],
    ["observedStaleSlots", c.observedStaleSlots]
  ]) checkRange(`v2.${k}`, v, U16_MAX2);
  checkRange("v2.flags", c.flags, 255);
  checkRange("v2.volWarmup", c.volWarmup, 255);
  checkRange("v2.volMoveCap10bps", c.volMoveCap10bps, 255);
  checkBig("v2.skewRefInventory", c.skewRefInventory, U64_MAX);
  if (!p.enableV2) {
    if (p.kind === 2) throw new Error("kind 2 requires enableV2");
    return;
  }
  if ((c.flags & ~MATCHER_V2_FLAG_STALE_ALLOW_REDUCING) !== 0) throw new Error("v2.flags: unknown bits");
  if (p.kind !== 2) {
    const pricingZero = c.feeLoBps === 0 && c.feeHiBps === 0 && c.feeColdBps === 0 && c.volAMilli === 0 && c.volBDen === 0 && c.volAlphaBps === 0 && c.volWarmup === 0 && c.volMoveCap10bps === 0 && c.volRefSlots === 0 && c.thinRebateMultBps === 0 && c.skewCapBps === 0 && c.rebateCapBps === 0 && c.skewRefInventory === 0n;
    if (!pricingZero) throw new Error("kinds 0/1: every v2 pricing field must be 0 (only flags/maxMarkAgeSlots/observedStaleSlots allowed)");
    return;
  }
  if (!(c.feeLoBps <= c.feeColdBps && c.feeColdBps <= c.feeHiBps)) throw new Error("v2: need feeLo <= feeCold <= feeHi");
  if (c.feeHiBps > DEFAULTS.maxFeeBps) throw new Error("v2.feeHiBps must be <= 1000");
  if (p.baseSpreadBps + c.feeHiBps > p.maxTotalBps) throw new Error("v2: baseSpreadBps + feeHiBps must be <= maxTotalBps");
  if (c.volAlphaBps === 0 || c.volAlphaBps > 1e4) throw new Error("v2.volAlphaBps must be 1..=10000");
  if (c.volRefSlots === 0 || c.volMoveCap10bps === 0) throw new Error("v2.volRefSlots and v2.volMoveCap10bps must be >= 1");
  if (c.skewCapBps > DEFAULTS.maxSkewCapBps || c.rebateCapBps > c.skewCapBps) throw new Error("v2: need rebateCap <= skewCap <= 5000");
  if (c.thinRebateMultBps > p.skewSpreadMultBps) throw new Error("v2.thinRebateMultBps must be <= skewSpreadMultBps (round-trip safety)");
  if ((p.skewSpreadMultBps > 0 || c.thinRebateMultBps > 0) && c.skewRefInventory === 0n) throw new Error("v2.skewRefInventory must be > 0 when skew or rebate is on");
  if (p.impactKBps > MATCHER_V2_MAX_IMPACT_K_BPS || p.impactKBps > 0 && p.liquidityNotionalE6 === 0n) {
    throw new Error("impactKBps must be <= 100000, and > 0 requires liquidityNotionalE6 > 0");
  }
}
function encodeMatcherSetParams(p) {
  validateMatcherSetParams(p);
  const c = p.enableV2 ? p.v2 : ZERO_V2;
  const out = concatBytes(
    encU8(p.kind),
    encU32(p.tradingFeeBps),
    encU32(p.baseSpreadBps),
    encU32(p.maxTotalBps),
    encU32(p.impactKBps),
    encU128(p.liquidityNotionalE6),
    encU128(p.maxFillAbs),
    encU128(p.maxInventoryAbs),
    encU16(p.feeToInsuranceBps),
    encU16(p.skewSpreadMultBps),
    encU8(p.enableV2 ? 1 : 0),
    encU8(c.flags),
    encU16(c.feeLoBps),
    encU16(c.feeHiBps),
    encU16(c.feeColdBps),
    encU16(c.volAMilli),
    encU16(c.volBDen),
    encU16(c.volAlphaBps),
    encU8(c.volWarmup),
    encU8(c.volMoveCap10bps),
    encU16(c.volRefSlots),
    encU16(c.thinRebateMultBps),
    encU16(c.skewCapBps),
    encU16(c.rebateCapBps),
    encU16(c.maxMarkAgeSlots),
    encU16(c.observedStaleSlots),
    encU64(c.skewRefInventory)
  );
  if (out.length !== MATCHER_SET_PARAMS_LEN) throw new Error(`encodeMatcherSetParams: internal length ${out.length} != 105`);
  return out;
}
function ownerProofHeader(proof) {
  checkRange("bump", proof.bump, 255);
  return concatBytes(
    encU8(MATCHER_CONFIGURE_TAG),
    encU8(MATCHER_CONFIGURE_AUTH_OWNER_PROOF),
    encPubkey(proof.wrapperProgramId),
    encPubkey(proof.market),
    encPubkey(proof.lpPortfolio),
    encU8(proof.bump)
  );
}
function encodeMatcherConfigureBackingFeeCap(proof, capBps) {
  checkRange("capBps", capBps, MATCHER_BACKING_FEE_CAP_BPS_MAX);
  return concatBytes(ownerProofHeader(proof), encU8(MATCHER_CONFIGURE_OP_BACKING_FEE_CAP), encU16(capBps));
}
function encodeMatcherConfigureSetParams(proof, params) {
  return concatBytes(ownerProofHeader(proof), encU8(MATCHER_CONFIGURE_OP_SET_PARAMS), encodeMatcherSetParams(params));
}
function matcherConfigureOwnerProofAccounts(lpOwner, matcherCtx) {
  return [
    { pubkey: lpOwner, isSigner: true, isWritable: false },
    { pubkey: matcherCtx, isSigner: false, isWritable: true }
  ];
}
function deriveProof(a) {
  const [, bump] = PublicKey5.findProgramAddressSync(
    [
      new TextEncoder().encode("matcher"),
      a.market.toBytes(),
      a.lpPortfolio.toBytes(),
      a.lpOwner.toBytes(),
      a.matcherProgramId.toBytes(),
      a.matcherCtx.toBytes()
    ],
    a.wrapperProgramId
  );
  return { wrapperProgramId: a.wrapperProgramId, market: a.market, lpPortfolio: a.lpPortfolio, bump };
}
function buildMatcherConfigureBackingFeeCapIx(a, capBps) {
  return new TransactionInstruction({
    programId: a.matcherProgramId,
    keys: matcherConfigureOwnerProofAccounts(a.lpOwner, a.matcherCtx),
    data: Buffer.from(encodeMatcherConfigureBackingFeeCap(deriveProof(a), capBps))
  });
}
function buildMatcherConfigureSetParamsIx(a, params) {
  return new TransactionInstruction({
    programId: a.matcherProgramId,
    keys: matcherConfigureOwnerProofAccounts(a.lpOwner, a.matcherCtx),
    data: Buffer.from(encodeMatcherConfigureSetParams(deriveProof(a), params))
  });
}
function encodeMatcherCallExt(ext) {
  let flags = 0;
  if (ext.headroomQ !== void 0) {
    checkBig("headroomQ", ext.headroomQ, U64_MAX);
    flags |= MATCHER_CALL_EXT_FLAG.HEADROOM;
  }
  if (ext.markSlot !== void 0) {
    checkBig("markSlot", ext.markSlot, U64_MAX);
    flags |= MATCHER_CALL_EXT_FLAG.MARK_SLOT;
  }
  if (ext.acceptsFeeRequest) flags |= MATCHER_CALL_EXT_FLAG.ACCEPTS_FEE_REQUEST;
  if (ext.takerReducing) flags |= MATCHER_CALL_EXT_FLAG.TAKER_REDUCING;
  if (ext.execBandBps !== void 0) {
    checkRange("execBandBps", ext.execBandBps, U16_MAX2);
    flags |= MATCHER_CALL_EXT_FLAG.EXEC_BAND;
  }
  return concatBytes(
    encU8(MATCHER_CALL_EXT_VERSION_V1),
    encU8(flags),
    encU16(ext.execBandBps ?? 0),
    encU64(ext.markSlot ?? 0n),
    encU64(ext.headroomQ ?? 0n),
    encU32(0)
  );
}
function decodeMatcherCallExt(bytes) {
  const b = bytes.length === 67 ? bytes.subarray(MATCHER_CALL_EXT_OFFSET) : bytes;
  if (b.length !== MATCHER_CALL_EXT_LEN) throw new Error(`call ext must be 24 bytes, got ${b.length}`);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const version = b[0];
  if (version === 0) {
    if (b.some((x) => x !== 0)) throw new Error("legacy call ext (version 0) must be all zero");
    return null;
  }
  if (version !== MATCHER_CALL_EXT_VERSION_V1) throw new Error(`unknown call ext version ${version}`);
  const flags = b[1];
  if ((flags & ~EXT_FLAGS_KNOWN) !== 0) throw new Error(`call ext flags 0x${flags.toString(16)} has reserved bits`);
  const band = v.getUint16(2, true);
  const markSlot = v.getBigUint64(4, true);
  const headroom = v.getBigUint64(12, true);
  if (v.getUint32(20, true) !== 0) throw new Error("call ext reserved bytes must be 0");
  const has = (f) => (flags & f) !== 0;
  if (!has(MATCHER_CALL_EXT_FLAG.EXEC_BAND) && band !== 0) throw new Error("exec_band_bps set without EXEC_BAND");
  if (!has(MATCHER_CALL_EXT_FLAG.MARK_SLOT) && markSlot !== 0n) throw new Error("mark_slot set without MARK_SLOT");
  if (!has(MATCHER_CALL_EXT_FLAG.HEADROOM) && headroom !== 0n) throw new Error("lp_headroom_q set without HEADROOM");
  return {
    headroomQ: has(MATCHER_CALL_EXT_FLAG.HEADROOM) ? headroom : void 0,
    markSlot: has(MATCHER_CALL_EXT_FLAG.MARK_SLOT) ? markSlot : void 0,
    acceptsFeeRequest: has(MATCHER_CALL_EXT_FLAG.ACCEPTS_FEE_REQUEST),
    takerReducing: has(MATCHER_CALL_EXT_FLAG.TAKER_REDUCING),
    execBandBps: has(MATCHER_CALL_EXT_FLAG.EXEC_BAND) ? band : void 0
  };
}
function decodeMatcherRequestedFeeBps(flags) {
  return (flags >>> 0 & MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK) >>> MATCHER_RETURN_FLAG_REQUESTED_FEE_SHIFT;
}
function isMatcherCtxV2(ctxAccountData) {
  if (ctxAccountData.length < MATCHER_V2_BLOCK_ACCOUNT_OFFSET + 1) return false;
  const magic = new DataView(ctxAccountData.buffer, ctxAccountData.byteOffset + 64, 8).getBigUint64(0, true);
  return magic === 0x504552434d415443n && ctxAccountData[MATCHER_V2_BLOCK_ACCOUNT_OFFSET] === MATCHER_V2_BLOCK_VERSION;
}
var MATCHER_BATCH_HEADER_LEN = 18;
var MATCHER_BATCH_LEG_LEN = 26;
var WRAPPER_BATCH_MAX_LEGS = 11;
function encodeWrapperMatcherCallExt(mode, markSlot, lpHeadroomQ, execBandBps, takerReducing, acceptsFeeRequest) {
  if (mode !== 1) return new Uint8Array(MATCHER_CALL_EXT_LEN);
  const headroom = lpHeadroomQ > (1n << 64n) - 1n ? (1n << 64n) - 1n : lpHeadroomQ;
  return encodeMatcherCallExt({ headroomQ: headroom, markSlot, execBandBps, takerReducing, acceptsFeeRequest });
}
function encodeMatcherBatchCall(reqId, lpAccountId, legs, exts) {
  if (legs.length === 0 || legs.length > 16) throw new Error(`matcher batch needs 1..=16 legs, got ${legs.length}`);
  if (exts && exts.length !== legs.length) throw new Error(`exts (${exts.length}) must match legs (${legs.length})`);
  const out = new Uint8Array(MATCHER_BATCH_HEADER_LEN + legs.length * MATCHER_BATCH_LEG_LEN + (exts ? legs.length * MATCHER_CALL_EXT_LEN : 0));
  const v = new DataView(out.buffer);
  out[0] = 3;
  out[1] = legs.length;
  v.setBigUint64(2, reqId, true);
  v.setBigUint64(10, lpAccountId, true);
  legs.forEach((l, i) => {
    const b = MATCHER_BATCH_HEADER_LEN + i * MATCHER_BATCH_LEG_LEN;
    v.setUint16(b, l.assetIndex, true);
    v.setBigUint64(b + 2, l.oraclePriceE6, true);
    const u = l.reqSize < 0n ? (1n << 128n) + l.reqSize : l.reqSize;
    v.setBigUint64(b + 10, u & (1n << 64n) - 1n, true);
    v.setBigUint64(b + 18, u >> 64n, true);
  });
  if (exts) {
    exts.forEach((e, i) => {
      if (e.length !== MATCHER_CALL_EXT_LEN) throw new Error(`ext ${i} must be 24 bytes`);
      out.set(e, MATCHER_BATCH_HEADER_LEN + legs.length * MATCHER_BATCH_LEG_LEN + i * MATCHER_CALL_EXT_LEN);
    });
  }
  return out;
}

// src/abi/p3.ts
var IX_TAG_P3 = Object.freeze({
  InitVaultLp: 94,
  VaultLpSetMatcher: 95,
  DepositJuniorTranche: 96,
  WithdrawJuniorTranche: 97,
  VaultLpRecall: 98,
  SetVaultLpRisk: 99,
  VaultLpConvertPnl: 100,
  VaultLpSettleResolved: 101,
  VaultLpReleaseSurplus: 102
});
var VAULT_LP_JUNIOR_FLOOR_BPS_RANGE_P3 = Object.freeze({ min: 1e3, max: 1e4 });
var VAULT_LP_MAX_LEV_BPS_P3 = 5e4;
var VAULT_LP_DEFAULT_MAX_LEV_BPS_P3 = 1e4;
var CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3 = "DfTxJUT5BbERs1tR33dP82kaUJ1NLymRxXErXAYXcDam";
var VAULT_LP_PIN_P3 = Object.freeze({
  MATCHER_KIND: 1,
  // vAMM
  TRADING_FEE_BPS: 10,
  BASE_SPREAD_BPS: 10,
  MAX_TOTAL_BPS: 100,
  IMPACT_K_BPS: 50,
  FEE_TO_INSURANCE_BPS: 0,
  SKEW_SPREAD_MULT_BPS: 1,
  TRADE_FEE_CAP_BPS: 1e4,
  LIQUIDITY_USD: 250000n,
  MAX_FILL_USD: 5000n,
  MAX_INVENTORY_USD: 25000n
});
var ENGINE_MAX_POSITION_ABS_Q_P3 = 100000000000000n;
function usdToQCappedP3(usd, priceE6) {
  if (priceE6 === 0n) return null;
  let q = usd * 1000000000000n / priceE6;
  if (q > ENGINE_MAX_POSITION_ABS_Q_P3) q = ENGINE_MAX_POSITION_ABS_Q_P3;
  return q === 0n ? null : q;
}
function pinnedMatcherCapsP3(priceE6) {
  const maxFillAbs = usdToQCappedP3(VAULT_LP_PIN_P3.MAX_FILL_USD, priceE6);
  const maxInventoryAbs = usdToQCappedP3(VAULT_LP_PIN_P3.MAX_INVENTORY_USD, priceE6);
  if (maxFillAbs === null || maxInventoryAbs === null) return null;
  return { liquidityNotionalE6: VAULT_LP_PIN_P3.LIQUIDITY_USD * 1000000n, maxFillAbs, maxInventoryAbs };
}
var U16 = 65535;
var U32 = 4294967295;
var U64 = (1n << 64n) - 1n;
var U128 = (1n << 128n) - 1n;
function int(name, v, min2, max) {
  if (!Number.isInteger(v) || v < min2 || v > max) throw new Error(`${name} must be an integer in ${min2}..=${max}, got ${v}`);
}
function big(name, v, max, min2 = 0n) {
  if (v < min2 || v > max) throw new Error(`${name} must be in ${min2}..=${max}, got ${v}`);
}
function encodeInitVaultLpP3(juniorFloorBps) {
  int("juniorFloorBps", juniorFloorBps, VAULT_LP_JUNIOR_FLOOR_BPS_RANGE_P3.min, VAULT_LP_JUNIOR_FLOOR_BPS_RANGE_P3.max);
  return concatBytes(encU8(IX_TAG_P3.InitVaultLp), encU16(juniorFloorBps));
}
function encodeVaultLpSetMatcherP3(a) {
  big("expectedSequence", a.expectedSequence, U64);
  big("assetGenerationFrontier", a.assetGenerationFrontier, U64);
  int("tradeFeeCapBps", a.tradeFeeCapBps, 0, U16);
  big("expirySlot", a.expirySlot, U64);
  int("kind", a.kind, 0, 255);
  int("tradingFeeBps", a.tradingFeeBps, 0, U32);
  int("baseSpreadBps", a.baseSpreadBps, 0, U32);
  int("maxTotalBps", a.maxTotalBps, 0, U32);
  int("impactKBps", a.impactKBps, 0, U32);
  big("liquidityNotionalE6", a.liquidityNotionalE6, U128);
  big("maxFillAbs", a.maxFillAbs, U128, 1n);
  big("maxInventoryAbs", a.maxInventoryAbs, U128, 1n);
  int("feeToInsuranceBps", a.feeToInsuranceBps, 0, U16);
  int("skewSpreadMultBps", a.skewSpreadMultBps, 0, U16);
  return concatBytes(
    encU8(IX_TAG_P3.VaultLpSetMatcher),
    encU64(a.expectedSequence),
    encU64(a.assetGenerationFrontier),
    encU16(a.tradeFeeCapBps),
    encU64(a.expirySlot),
    encU8(a.kind),
    encU32(a.tradingFeeBps),
    encU32(a.baseSpreadBps),
    encU32(a.maxTotalBps),
    encU32(a.impactKBps),
    encU128(a.liquidityNotionalE6),
    encU128(a.maxFillAbs),
    encU128(a.maxInventoryAbs),
    encU16(a.feeToInsuranceBps),
    encU16(a.skewSpreadMultBps)
  );
}
function amountOnly(tag, name, amount) {
  big(name, amount, U128);
  return concatBytes(encU8(tag), encU128(amount));
}
function encodeDepositJuniorTrancheP3(amount) {
  return amountOnly(IX_TAG_P3.DepositJuniorTranche, "amount", amount);
}
function encodeWithdrawJuniorTrancheP3(amount) {
  return amountOnly(IX_TAG_P3.WithdrawJuniorTranche, "amount", amount);
}
function encodeVaultLpRecallP3(amount, targetDomain) {
  big("amount", amount, U128);
  int("targetDomain", targetDomain, 0, U16);
  return concatBytes(encU8(IX_TAG_P3.VaultLpRecall), encU128(amount), encU16(targetDomain));
}
function encodeSetVaultLpRiskP3(a) {
  int("assetIndex", a.assetIndex, 0, U16);
  big("skewSlopeE9", a.skewSlopeE9, U64);
  big("skewMaxE9", a.skewMaxE9, U64);
  big("levCapQ", a.levCapQ, U128);
  int("levMaxImrBps", a.levMaxImrBps, 0, 1e4);
  int("vaultLpMaxLevBps", a.vaultLpMaxLevBps, 0, VAULT_LP_MAX_LEV_BPS_P3);
  return concatBytes(
    encU8(IX_TAG_P3.SetVaultLpRisk),
    encU16(a.assetIndex),
    encU64(a.skewSlopeE9),
    encU64(a.skewMaxE9),
    encU128(a.levCapQ),
    encU16(a.levMaxImrBps),
    encU32(a.vaultLpMaxLevBps),
    encPubkey(a.approvedMatcherProgram)
  );
}
function encodeVaultLpConvertPnlP3(amount) {
  return amountOnly(IX_TAG_P3.VaultLpConvertPnl, "amount", amount);
}
function encodeVaultLpSettleResolvedP3(topup) {
  int("topup", topup, 0, 1);
  return concatBytes(encU8(IX_TAG_P3.VaultLpSettleResolved), encU8(topup));
}
function encodeVaultLpReleaseSurplusP3(amount, sourceDomain) {
  big("amount", amount, U128);
  int("sourceDomain", sourceDomain, 0, U16);
  return concatBytes(encU8(IX_TAG_P3.VaultLpReleaseSurplus), encU128(amount), encU16(sourceDomain));
}
var ACCOUNTS_INIT_VAULT_LP_P3 = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "matcherProgram", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherDelegate", signer: false, writable: false }
];
var ACCOUNTS_VAULT_LP_SET_MATCHER_P3 = [
  { name: "upgradeAuthority", signer: true, writable: false },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: false },
  { name: "vaultLpState", signer: false, writable: false },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "matcherProgram", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherDelegate", signer: false, writable: false }
];
var ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3 = [
  { name: "juniorOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3 = [
  { name: "juniorOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: false },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
var ACCOUNTS_VAULT_LP_RECALL_P3 = [
  { name: "cranker", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: false },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
var ACCOUNTS_SET_VAULT_LP_RISK_P3 = [
  { name: "upgradeAuthority", signer: true, writable: false },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: true }
];
var ACCOUNTS_VAULT_LP_CONVERT_PNL_P3 = [
  { name: "caller", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "vaultLpState", signer: false, writable: false },
  { name: "lpPortfolio", signer: false, writable: true }
];
var ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3 = [
  { name: "caller", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: false },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "juniorDestToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false }
];
var ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3 = [
  { name: "juniorOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: false },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true }
];
var ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3 = [
  { name: "juniorDestToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];

// src/abi/risk-limits-p1.ts
import { PublicKey as PublicKey6, TransactionInstruction as TransactionInstruction2 } from "@solana/web3.js";
var IX_TAG_P1 = Object.freeze({ SetAssetRiskLimits: 93 });
var MAX_EXEC_BAND_BPS_P1 = 1e4;
var MAX_LP_EXPOSURE_K_BPS_P1 = 1e7;
var MAX_OI_SIDE_Q_P1 = 100000000000000n;
var MATCHER_EXT_MODE_V1_P1 = 1;
var MAX_REQUESTED_FEE_BPS_P1 = 1023;
function int2(name, v, max) {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${name} must be an integer in 0..=${max}, got ${v}`);
}
function encodeSetAssetRiskLimitsP1(a) {
  const ext = a.matcherExtMode ?? 0;
  const fee = a.maxRequestedFeeBps ?? 0;
  int2("assetIndex", a.assetIndex, 65535);
  int2("execBandBps", a.execBandBps, MAX_EXEC_BAND_BPS_P1);
  int2("lpExposureKBps", a.lpExposureKBps, MAX_LP_EXPOSURE_K_BPS_P1);
  int2("matcherExtMode", ext, MATCHER_EXT_MODE_V1_P1);
  int2("maxRequestedFeeBps", fee, MAX_REQUESTED_FEE_BPS_P1);
  if (a.lpFloorAtoms < 0n || a.lpFloorAtoms > (1n << 128n) - 1n) throw new Error("lpFloorAtoms out of u128 range");
  if (a.sideOiCapQ < 0n || a.sideOiCapQ > MAX_OI_SIDE_Q_P1) throw new Error(`sideOiCapQ must be in 0..=${MAX_OI_SIDE_Q_P1}`);
  const parts = [
    encU8(IX_TAG_P1.SetAssetRiskLimits),
    encU16(a.assetIndex),
    encU16(a.execBandBps),
    encU32(a.lpExposureKBps),
    encU128(a.lpFloorAtoms),
    encU128(a.sideOiCapQ)
  ];
  if (ext !== 0 || fee !== 0) parts.push(encU8(ext));
  if (fee !== 0) parts.push(encU16(fee));
  return concatBytes(...parts);
}
var ACCOUNTS_SET_ASSET_RISK_LIMITS_P1 = [
  { name: "upgradeAuthority", signer: true, writable: false },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: true }
];
var BPF_LOADER_UPGRADEABLE = new PublicKey6("BPFLoaderUpgradeab1e11111111111111111111111");
function buildSetAssetRiskLimitsIxP1(programId, market, upgradeAuthority, args) {
  const [programData] = PublicKey6.findProgramAddressSync([programId.toBytes()], BPF_LOADER_UPGRADEABLE);
  return new TransactionInstruction2({
    programId,
    keys: buildAccountMetas(ACCOUNTS_SET_ASSET_RISK_LIMITS_P1, { upgradeAuthority, programData, market }),
    data: Buffer.from(encodeSetAssetRiskLimitsP1(args))
  });
}
var ASSET_RISK_LIMITS_FIELD_OFF_P1 = Object.freeze({
  sideOiCapQ: 0,
  lpFloorAtoms: 16,
  lpExposureKBps: 32,
  execBandBps: 36,
  matcherExtMode: 38,
  reserved0: 39,
  maxRequestedFeeBps: 40,
  reserved: 42
});
var ASSET_RISK_LIMITS_LEN_P1 = 64;
var ASSET_RISK_LIMITS_SLOT_OFF_P1 = 608;
function assetRiskLimitsAccountOffsetP1(assetIndex) {
  if (!Number.isInteger(assetIndex) || assetIndex < 0) throw new Error(`bad assetIndex ${assetIndex}`);
  return 592 + 758 + 2325 * assetIndex + ASSET_RISK_LIMITS_SLOT_OFF_P1;
}
function decodeAssetRiskLimitsRecordP1(rec) {
  if (rec.length !== ASSET_RISK_LIMITS_LEN_P1) throw new Error(`AssetRiskLimitsV17 record must be 64 bytes, got ${rec.length}`);
  const v = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
  const u1283 = (o) => v.getBigUint64(o + 8, true) << 64n | v.getBigUint64(o, true);
  const F = ASSET_RISK_LIMITS_FIELD_OFF_P1;
  return {
    sideOiCapQ: u1283(F.sideOiCapQ),
    lpFloorAtoms: u1283(F.lpFloorAtoms),
    lpExposureKBps: v.getUint32(F.lpExposureKBps, true),
    execBandBps: v.getUint16(F.execBandBps, true),
    matcherExtMode: rec[F.matcherExtMode],
    maxRequestedFeeBps: v.getUint16(F.maxRequestedFeeBps, true)
  };
}
function decodeAssetRiskLimitsP1(marketData, assetIndex) {
  if (marketData[10] !== 1) throw new Error(`not a market account (kind ${marketData[10]})`);
  const off = assetRiskLimitsAccountOffsetP1(assetIndex);
  if (marketData.length < off + ASSET_RISK_LIMITS_LEN_P1) throw new Error(`market account too short for asset ${assetIndex}`);
  return decodeAssetRiskLimitsRecordP1(marketData.subarray(off, off + ASSET_RISK_LIMITS_LEN_P1));
}

// src/abi/growth-v19.ts
var GROWTH_BPS = 10000n;
var GROWTH_MAX_IMR_BPS = 10000n;
var GROWTH_LEVERAGE_X100_ONE = 100;
var GROWTH_MAX_LAMBDA_BPS = 1e5;
var GROWTH_DIALS_NO_CLAMP_MAX_LAMBDA_BPS = 1e4;
var GROWTH_DIALS_NO_CLAMP_MAX_KINK_BPS = 5e3;
var GROWTH_DEPTH_MULT = 4n;
var GROWTH_MAX_POSITION_ABS_Q = 100000000000000n;
var GROWTH_PIN_MATCHER_EXT_MODE = 1;
var GROWTH_PIN_MAX_REQUESTED_FEE_BPS = 100;
var GROWTH_PIN_LP_FLOOR_ATOMS = 1000000n;
var GROWTH_PIN_MATCHER_KIND = 2;
var GROWTH_VERSION = 1;
var GROWTH_POS_SCALE = 1000000n;
var ASSET_GROWTH_SLOT_OFF = 672;
var ASSET_GROWTH_LEN = 120;
var ASSET_GROWTH_VERSION_FIELD_OFF = 38;
var ASSET_WRAPPER_SLOT_LEN = 1024;
var ASSET_GROWTH_FIELD_OFF = Object.freeze({
  cLaunchAtoms: 0,
  ceilSlot: 8,
  lambdaBps: 16,
  lLaunchX100: 20,
  lTierX100: 22,
  ceilX100: 24,
  kinkBps: 26,
  rGapBps: 28,
  allocAlphaBps: 30,
  allocBufferBps: 32,
  cushionTargetBps: 34,
  cushionShareBps: 36,
  version: 38,
  flags: 39,
  utilFeeMaxBps: 40,
  reserved: 42
});
var GROWTH_UTIL_FEE_DEFAULT_BPS = 500;
var GROWTH_UTIL_FEE_HARD_MAX_BPS = 2e3;
var R_GAP_MIN_LIQUIDATION_SLOTS = 50n;
var GROWTH_BATCH_MAX_LEGS = 10;
var INIT_MARKET_MMR_OFF = 59;
var INIT_MARKET_LIQ_FEE_OFF = 91;
var INIT_MARKET_MAX_PRICE_MOVE_OFF = 131;
var MATCHER_CALL_EXT_FLAG_TAKER_REDUCING = 8;
var MATCHER_CALL_EXT_VERSION_V3 = 3;
var MATCHER_CALL_EXT_V2_LEN = 40;
var MATCHER_CALL_EXT_V3_LEN = 72;
var MATCHER_CALL_EXT_VERSION_V2 = 2;
var U64_MAX2 = (1n << 64n) - 1n;
var U128_MAX2 = (1n << 128n) - 1n;
var I128_MAX = (1n << 127n) - 1n;
var I128_MIN = -(1n << 127n);
function big2(name, v) {
  if (typeof v === "bigint") return v;
  if (!Number.isInteger(v)) throw new Error(`${name} must be an integer, got ${v}`);
  return BigInt(v);
}
function divCeil(a, b) {
  return (a + b - 1n) / b;
}
function decodeAssetGrowthRecordV19(rec) {
  if (rec.length !== ASSET_GROWTH_LEN) throw new Error(`AssetGrowthV19 record must be ${ASSET_GROWTH_LEN} bytes, got ${rec.length}`);
  const F = ASSET_GROWTH_FIELD_OFF;
  const version = rec[F.version];
  if (version === 0) return null;
  const v = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
  return {
    cLaunchAtoms: v.getBigUint64(F.cLaunchAtoms, true),
    ceilSlot: v.getBigUint64(F.ceilSlot, true),
    lambdaBps: v.getUint32(F.lambdaBps, true),
    lLaunchX100: v.getUint16(F.lLaunchX100, true),
    lTierX100: v.getUint16(F.lTierX100, true),
    ceilX100: v.getUint16(F.ceilX100, true),
    kinkBps: v.getUint16(F.kinkBps, true),
    rGapBps: v.getUint16(F.rGapBps, true),
    allocAlphaBps: v.getUint16(F.allocAlphaBps, true),
    allocBufferBps: v.getUint16(F.allocBufferBps, true),
    cushionTargetBps: v.getUint16(F.cushionTargetBps, true),
    cushionShareBps: v.getUint16(F.cushionShareBps, true),
    version,
    flags: rec[F.flags],
    utilFeeMaxBps: v.getUint16(F.utilFeeMaxBps, true)
  };
}
function decodeAssetGrowthFromSlotV19(slot) {
  const end = ASSET_GROWTH_SLOT_OFF + ASSET_GROWTH_LEN;
  if (slot.length < end) throw new Error(`asset slot too short for AssetGrowthV19: ${slot.length} < ${end}`);
  return decodeAssetGrowthRecordV19(slot.subarray(ASSET_GROWTH_SLOT_OFF, end));
}
function assetGrowthAccountOffsetV19(assetIndex) {
  if (!Number.isInteger(assetIndex) || assetIndex < 0) throw new Error(`bad assetIndex ${assetIndex}`);
  return 592 + 758 + 2325 * assetIndex + ASSET_GROWTH_SLOT_OFF;
}
function decodeAssetGrowthV19(marketData, assetIndex) {
  if (marketData[10] !== 1) throw new Error(`not a market account (kind ${marketData[10]})`);
  const off = assetGrowthAccountOffsetV19(assetIndex);
  if (marketData.length < off + ASSET_GROWTH_LEN) throw new Error(`market account too short for asset ${assetIndex}`);
  return decodeAssetGrowthRecordV19(marketData.subarray(off, off + ASSET_GROWTH_LEN));
}
function imrBpsForLeverageX100(lX100) {
  const l = big2("lX100", lX100);
  if (l < BigInt(GROWTH_LEVERAGE_X100_ONE) || l > 0xffffn) return null;
  return divCeil(1000000n, l);
}
function leverageX100ForImrBps(imrBps) {
  const imr = big2("imrBps", imrBps);
  if (imr === 0n || imr < 0n || imr > GROWTH_MAX_IMR_BPS) return null;
  const l = 1000000n / imr;
  return l > 0xffffn ? 0xffffn : l;
}
function ceilingImrBps(engineImrBps, lCeilX100) {
  const e = big2("engineImrBps", engineImrBps);
  if (e < 0n || e > GROWTH_MAX_IMR_BPS) return null;
  const c = imrBpsForLeverageX100(lCeilX100);
  if (c === null) return null;
  return c > e ? c : e;
}
function nCapQ(cM, lambdaBps, priceE6, posScale = GROWTH_POS_SCALE) {
  if (priceE6 === 0n) return null;
  const a = cM * big2("lambdaBps", lambdaBps);
  if (a > U128_MAX2) return null;
  const num = a * posScale;
  if (num > U128_MAX2) return null;
  const den = GROWTH_BPS * priceE6;
  if (den > U128_MAX2) return null;
  return num / den;
}
function liquidityNotionalE6(cM, lambdaBps) {
  const a = cM * big2("lambdaBps", lambdaBps);
  if (a > U128_MAX2) return null;
  const p = a * GROWTH_DEPTH_MULT;
  if (p > U128_MAX2) return null;
  return p / GROWTH_BPS;
}
function growthMatcherCapsV3(g, cM, priceE6, hlockActive, posScale = GROWTH_POS_SCALE) {
  if (hlockActive) return { inventoryCapQ: 0n, liquidityNotionalE6: 0n };
  const n = nCapQ(cM, g.lambdaBps, priceE6, posScale) ?? 0n;
  const cap = n < GROWTH_MAX_POSITION_ABS_Q ? n : GROWTH_MAX_POSITION_ABS_Q;
  const liq = cap === 0n ? 0n : liquidityNotionalE6(cM, g.lambdaBps) ?? 0n;
  return { inventoryCapQ: cap, liquidityNotionalE6: liq };
}
function dynImrBps(lpAbsAfter, nCap, baseImr, kinkBps) {
  const base = big2("baseImr", baseImr);
  const kink = big2("kinkBps", kinkBps);
  if (base < 0n || base > GROWTH_MAX_IMR_BPS || kink < 0n || kink > GROWTH_BPS) return null;
  if (nCap === 0n || lpAbsAfter > nCap) return null;
  const lhs = lpAbsAfter * GROWTH_BPS;
  const rhs = kink * nCap;
  if (lhs > U128_MAX2 || rhs > U128_MAX2) return null;
  if (lhs <= rhs) return base;
  const span = GROWTH_MAX_IMR_BPS - base;
  const num = span * (lhs - rhs);
  const den = nCap * (GROWTH_BPS - kink);
  if (num > U128_MAX2 || den > U128_MAX2) return null;
  const imr = base + divCeil(num, den);
  return imr > GROWTH_MAX_IMR_BPS ? GROWTH_MAX_IMR_BPS : imr;
}
function utilizationBps(lpAbs, nCap) {
  if (nCap === 0n) return null;
  return lpAbs * GROWTH_BPS / nCap;
}
function conservativeEquity(capital, pnl, feeCredits) {
  const c = capital + (pnl < 0n ? pnl : 0n) + (feeCredits < 0n ? feeCredits : 0n);
  return c > 0n ? c : 0n;
}
function quoteMaxLeverage(input, side) {
  const lp = input.lpEffectivePositionQ;
  const crowd = side === "long" ? lp <= 0n : lp >= 0n;
  const g = input.growth;
  const e = input.engineImrBps;
  const out = (p) => ({
    side,
    crowd,
    closed: false,
    closedReason: null,
    maxLeverageX100: 0,
    imrBps: null,
    utilizationBps: null,
    nCapQ: null,
    growthOn: g !== null,
    headroomQ: null,
    reduceOnlyCapacityExempt: true,
    utilisationFeeBps: null,
    ...p
  });
  const lev = (imr) => {
    const l = leverageX100ForImrBps(imr);
    return l === null ? 0 : Number(l);
  };
  const closed = (reason, extra = {}) => out({ closed: true, closedReason: reason, maxLeverageX100: 0, ...extra });
  if (g === null) {
    if (e === 0n || e > GROWTH_MAX_IMR_BPS) return closed("invalid-config");
    return out({ imrBps: e, maxLeverageX100: lev(e) });
  }
  const lCeil = Math.min(g.lLaunchX100, g.lTierX100);
  const base = ceilingImrBps(e, lCeil);
  if (base === null) return closed("invalid-config");
  if (!input.assetBound) return closed("not-bound", { headroomQ: 0n });
  const cM = conservativeEquity(input.lpCapital, input.lpPnl, input.lpFeeCredits);
  const nCap = nCapQ(cM, g.lambdaBps, input.priceE6, input.posScale ?? GROWTH_POS_SCALE);
  const usersOi = usersSideOiQ(side === "long" ? input.oiEffLongQ : input.oiEffShortQ, lp, side === "long");
  const util = nCap === null ? null : utilizationBps(usersOi, nCap);
  const info = { nCapQ: nCap, utilizationBps: util };
  if (crowd && input.bankruptcyHlockActive) return closed("hlock", { ...info, headroomQ: 0n });
  if (nCap === null || nCap === 0n) return closed("capacity-zero", { ...info, headroomQ: 0n });
  if (usersOi >= nCap) return closed("capacity-full", { ...info, headroomQ: 0n });
  const utilisationFeeBps2 = utilisationFeeBps_(usersOi, nCap, g.kinkBps, utilFeeMaxEffectiveBps(g.utilFeeMaxBps));
  if (!crowd) return out({ ...info, imrBps: base, maxLeverageX100: lev(base), headroomQ: nCap - usersOi, utilisationFeeBps: utilisationFeeBps2 });
  const dyn = dynImrBps(usersOi, nCap, base, g.kinkBps);
  if (dyn === null) return closed("capacity-full", { ...info, headroomQ: 0n });
  return out({ ...info, imrBps: dyn, maxLeverageX100: lev(dyn), headroomQ: nCap - usersOi, utilisationFeeBps: utilisationFeeBps2 });
}
function usersSideOiQ(oiEffSideQ, vaultLpEffQ, longSide) {
  const onSide = longSide ? vaultLpEffQ > 0n : vaultLpEffQ < 0n;
  if (!onSide) return oiEffSideQ;
  const abs = vaultLpEffQ < 0n ? -vaultLpEffQ : vaultLpEffQ;
  return oiEffSideQ > abs ? oiEffSideQ - abs : 0n;
}
function utilisationFeeBps(usersOiAfterQ, nCapQ2, kinkBps, maxFeeBps) {
  if (nCapQ2 === 0n || kinkBps > 1e4) return null;
  const lhs = usersOiAfterQ * 10000n;
  const rhs = BigInt(kinkBps) * nCapQ2;
  if (lhs <= rhs || maxFeeBps === 0) return 0;
  const fee = divCeil(BigInt(maxFeeBps) * (lhs - rhs), nCapQ2 * BigInt(1e4 - kinkBps));
  return fee > BigInt(maxFeeBps) ? maxFeeBps : Number(fee);
}
var utilisationFeeBps_ = (a, n, k, m) => utilisationFeeBps(a, n, k, m);
function utilFeeMaxEffectiveBps(stored) {
  return stored === 0 ? GROWTH_UTIL_FEE_DEFAULT_BPS : stored;
}
function openingPartQ(beforeQ, afterQ) {
  const abs = (x) => x < 0n ? -x : x;
  const reduces = afterQ === 0n || beforeQ !== 0n && beforeQ > 0n === afterQ > 0n && abs(afterQ) <= abs(beforeQ);
  if (reduces) return 0n;
  if (beforeQ !== 0n && beforeQ > 0n !== afterQ > 0n) return abs(afterQ);
  return abs(afterQ - beforeQ);
}
function previewGrowthOpenFee(input, takerEffQ, sizeQ, tradeFeeBaseBps) {
  const g = input.growth;
  const afterQ = takerEffQ + sizeQ;
  const openingQ = openingPartQ(takerEffQ, afterQ);
  const long = afterQ > 0n;
  const usersBefore = usersSideOiQ(long ? input.oiEffLongQ : input.oiEffShortQ, input.lpEffectivePositionQ, long);
  const usersOiAfterQ = usersBefore + openingQ;
  let utilFeeBps = 0;
  if (g !== null && input.assetBound && openingQ > 0n) {
    const cM = conservativeEquity(input.lpCapital, input.lpPnl, input.lpFeeCredits);
    const nCap = nCapQ(cM, g.lambdaBps, input.priceE6, input.posScale ?? GROWTH_POS_SCALE);
    const f = nCap === null ? 0 : utilisationFeeBps(usersOiAfterQ, nCap, g.kinkBps, utilFeeMaxEffectiveBps(g.utilFeeMaxBps)) ?? 0;
    const fill = sizeQ < 0n ? -sizeQ : sizeQ;
    const o = openingQ > fill ? fill : openingQ;
    utilFeeBps = fill === 0n ? 0 : Number(BigInt(f) * o / fill);
  }
  return {
    openingQ,
    usersOiAfterQ,
    utilFeeBps,
    minSignedFeeBpsExMatcher: tradeFeeBaseBps + BigInt(utilFeeBps),
    batchAllowed: utilFeeBps === 0
  };
}
function rGapFloorBps(maxPriceMoveBpsPerSlot) {
  const f = maxPriceMoveBpsPerSlot * R_GAP_MIN_LIQUIDATION_SLOTS;
  if (maxPriceMoveBpsPerSlot < 0n || f > U64_MAX2) throw new Error("r_gap floor overflows u64 (wrapper fails closed)");
  return f;
}
function assertGrowthBatchLegs(legCount, anyGrowthLeg) {
  if (anyGrowthLeg && legCount > GROWTH_BATCH_MAX_LEGS) throw new Error(`a batch with a growth leg is limited to ${GROWTH_BATCH_MAX_LEGS} legs, got ${legCount} (wrapper error 96 GrowthBatchTooManyLegs)`);
}
function u16nz(name, v) {
  if (!Number.isInteger(v) || v <= 0 || v > 65535) throw new Error(`${name} must be a non-zero u16, got ${v}`);
}
function encodeInitMarketV19(args, rGapBps, lLaunchX100) {
  u16nz("rGapBps", rGapBps);
  u16nz("lLaunchX100", lLaunchX100);
  const legacy = encodeInitMarket(args);
  const dv4 = new DataView(legacy.buffer, legacy.byteOffset, legacy.byteLength);
  const mmr = dv4.getBigUint64(INIT_MARKET_MMR_OFF, true);
  const liqFee = dv4.getBigUint64(INIT_MARKET_LIQ_FEE_OFF, true);
  const move = dv4.getBigUint64(INIT_MARKET_MAX_PRICE_MOVE_OFF, true);
  const floor = rGapFloorBps(move);
  if (BigInt(rGapBps) < floor) throw new Error(`rGapBps ${rGapBps} is below the floor ${floor} (= maxPriceMoveBpsPerSlot ${move} * ${R_GAP_MIN_LIQUIDATION_SLOTS}); the wrapper refuses with GrowthInvalidConfig (94)`);
  if (mmr < BigInt(rGapBps) + liqFee) throw new Error(`maintenanceMarginBps ${mmr} must be >= rGapBps ${rGapBps} + liquidationFeeBps ${liqFee}; the wrapper refuses with GrowthInvalidConfig (94)`);
  return concatBytes(legacy, encU16(rGapBps), encU16(lLaunchX100));
}
function encodeInitVaultLpV19(juniorFloorBps, lLaunchX100) {
  if (!Number.isInteger(juniorFloorBps) || juniorFloorBps < 0 || juniorFloorBps > 65535) {
    throw new Error(`juniorFloorBps must be a u16, got ${juniorFloorBps}`);
  }
  u16nz("lLaunchX100", lLaunchX100);
  return concatBytes(encU8(IX_TAG_P3.InitVaultLp), encU16(juniorFloorBps), encU16(lLaunchX100));
}
function encodeSetAssetRiskLimitsV19(assetIndex, lambdaBps, kinkBps, utilFeeMaxBps = 0) {
  if (!Number.isInteger(assetIndex) || assetIndex < 0 || assetIndex > 65535) throw new Error(`assetIndex must be a u16, got ${assetIndex}`);
  if (!Number.isInteger(lambdaBps) || lambdaBps < 1 || lambdaBps > GROWTH_DIALS_NO_CLAMP_MAX_LAMBDA_BPS) throw new Error(`lambdaBps must be in 1..=${GROWTH_DIALS_NO_CLAMP_MAX_LAMBDA_BPS}, got ${lambdaBps}`);
  if (!Number.isInteger(kinkBps) || kinkBps < 0 || kinkBps > GROWTH_DIALS_NO_CLAMP_MAX_KINK_BPS) throw new Error(`kinkBps must be in 0..=${GROWTH_DIALS_NO_CLAMP_MAX_KINK_BPS}, got ${kinkBps}`);
  if (!Number.isInteger(utilFeeMaxBps) || utilFeeMaxBps !== 0 && (utilFeeMaxBps < GROWTH_UTIL_FEE_DEFAULT_BPS || utilFeeMaxBps > GROWTH_UTIL_FEE_HARD_MAX_BPS)) {
    throw new Error(`utilFeeMaxBps must be 0 (unchanged) or in ${GROWTH_UTIL_FEE_DEFAULT_BPS}..=${GROWTH_UTIL_FEE_HARD_MAX_BPS} (tighten-only), got ${utilFeeMaxBps}`);
  }
  const out = concatBytes(
    encU8(IX_TAG_P1.SetAssetRiskLimits),
    encU16(assetIndex),
    new Uint8Array(41),
    encU32(lambdaBps),
    encU16(kinkBps),
    ...utilFeeMaxBps === 0 ? [] : [encU16(utilFeeMaxBps)]
  );
  if (out.length !== (utilFeeMaxBps === 0 ? 50 : 52)) throw new Error(`encodeSetAssetRiskLimitsV19: internal length ${out.length}`);
  return out;
}
function encodeMatcherCallExtV2(ext) {
  const p = ext.lpPositionQ;
  if (p < I128_MIN + 1n || p > I128_MAX) throw new Error("lpPositionQ must be a non-MIN i128");
  const v1 = encodeMatcherCallExt(ext);
  if (v1.length !== MATCHER_CALL_EXT_LEN) throw new Error("internal v1 length");
  const out = new Uint8Array(MATCHER_CALL_EXT_V2_LEN);
  out.set(v1, 0);
  out[0] = MATCHER_CALL_EXT_VERSION_V2;
  const u = BigInt.asUintN(128, p);
  out.set(encU128(u), 24);
  return out;
}
function encodeMatcherCallExtV3(ext, caps) {
  return encodeMatcherCallExtV3FromV2(encodeMatcherCallExtV2(ext), caps);
}
function encodeMatcherCallExtV3FromV2(v2, caps) {
  if (v2.length !== MATCHER_CALL_EXT_V2_LEN) throw new Error(`v2 block must be ${MATCHER_CALL_EXT_V2_LEN} bytes, got ${v2.length}`);
  if (caps.inventoryCapQ < 0n || caps.inventoryCapQ > I128_MAX) throw new Error("inventoryCapQ must fit i128 (matcher fails closed otherwise)");
  if (caps.liquidityNotionalE6 < 0n || caps.liquidityNotionalE6 > U128_MAX2) throw new Error("liquidityNotionalE6 out of u128 range");
  const out = new Uint8Array(MATCHER_CALL_EXT_V3_LEN);
  out.set(v2, 0);
  out[0] = MATCHER_CALL_EXT_VERSION_V3;
  out.set(encU128(caps.inventoryCapQ), 40);
  out.set(encU128(caps.liquidityNotionalE6), 56);
  return out;
}
function markExtV3TakerReducing(v3, takerReducing) {
  if (v3.length !== MATCHER_CALL_EXT_V3_LEN) throw new Error(`v3 block must be ${MATCHER_CALL_EXT_V3_LEN} bytes, got ${v3.length}`);
  const out = Uint8Array.from(v3);
  if (takerReducing) out[1] = out[1] | MATCHER_CALL_EXT_FLAG_TAKER_REDUCING;
  return out;
}
var GROWTH_U64_MAX = U64_MAX2;

// src/abi/p2b-lock-exits.ts
import { PublicKey as PublicKey7, TransactionInstruction as TransactionInstruction3 } from "@solana/web3.js";
var IX_TAG_P2B = Object.freeze({ AdlWindDown: 104, SetAdlWindDownMaxSlots: 105 });
var ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS = 9e3;
var ADL_WIND_DOWN_MAX_MARK_AGE_SLOTS = 150;
function adlWindDownDustNotionalAtoms(collateralDecimals) {
  return 10n ** BigInt(Math.min(collateralDecimals, 30));
}
function encodeAdlWindDown(a) {
  if (!Number.isInteger(a.assetIndex) || a.assetIndex < 0 || a.assetIndex > 65535) throw new Error("bad assetIndex");
  return concatBytes(
    encU8(IX_TAG_P2B.AdlWindDown),
    encU64(a.nowSlot),
    encU16(a.assetIndex),
    encU64(a.portfolioId),
    encU64(a.positionEpoch)
  );
}
var ACCOUNTS_ADL_WIND_DOWN = [
  { name: "caller", signer: false, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "collateralMint", signer: false, writable: false }
];
function buildAdlWindDownIx(programId, keys, args, oracleAccounts = []) {
  return new TransactionInstruction3({
    programId,
    keys: [
      ...buildAccountMetas(ACCOUNTS_ADL_WIND_DOWN, keys),
      ...oracleAccounts.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }))
    ],
    data: Buffer.from(encodeAdlWindDown(args))
  });
}
function encodeSetAdlWindDownMaxSlots(a) {
  if (!Number.isInteger(a.maxEpisodeSlots) || a.maxEpisodeSlots < 1 || a.maxEpisodeSlots > ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS) {
    throw new Error(`maxEpisodeSlots must be in 1..=${ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS}`);
  }
  return concatBytes(encU8(IX_TAG_P2B.SetAdlWindDownMaxSlots), encU16(a.assetIndex), encU32(a.maxEpisodeSlots));
}
var ACCOUNTS_SET_ADL_WIND_DOWN_MAX_SLOTS = [
  { name: "upgradeAuthority", signer: true, writable: false },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: true }
];
var BPF_LOADER_UPGRADEABLE2 = new PublicKey7("BPFLoaderUpgradeab1e11111111111111111111111");
function buildSetAdlWindDownMaxSlotsIx(programId, market, upgradeAuthority, args) {
  const [programData] = PublicKey7.findProgramAddressSync([programId.toBytes()], BPF_LOADER_UPGRADEABLE2);
  return new TransactionInstruction3({
    programId,
    keys: buildAccountMetas(ACCOUNTS_SET_ADL_WIND_DOWN_MAX_SLOTS, { upgradeAuthority, programData, market }),
    data: Buffer.from(encodeSetAdlWindDownMaxSlots(args))
  });
}
var ADL_EPISODE_FIELD_OFF = Object.freeze({
  maxEpisodeSlots: 44,
  sinceSlot: 48,
  epochKeyLong: 56,
  epochKeyShort: 60
});
function adlEpisodeKey(marketId, epochLong, epochShort) {
  const lo = Number(marketId & 0xffffffffn);
  const hi = Number(marketId >> 32n & 0xffffffffn);
  const mix = Math.imul((lo ^ hi) >>> 0, 2654435761) >>> 0;
  const rot = (mix << 16 | mix >>> 16) >>> 0;
  return [(Number(epochLong & 0xffffffffn) ^ mix) >>> 0, (Number(epochShort & 0xffffffffn) ^ rot) >>> 0];
}
function decodeAdlEpisodeRecord(rec) {
  if (rec.length !== ASSET_RISK_LIMITS_LEN_P1) throw new Error(`record must be 64 bytes, got ${rec.length}`);
  const v = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
  const F = ADL_EPISODE_FIELD_OFF;
  const maxEpisodeSlots = v.getUint32(F.maxEpisodeSlots, true);
  return {
    maxEpisodeSlots,
    effectiveMaxEpisodeSlots: maxEpisodeSlots === 0 ? ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS : maxEpisodeSlots,
    sinceSlot: v.getBigUint64(F.sinceSlot, true),
    epochKeyLong: v.getUint32(F.epochKeyLong, true),
    epochKeyShort: v.getUint32(F.epochKeyShort, true)
  };
}
function decodeAdlEpisode(marketData, assetIndex) {
  const off = assetRiskLimitsAccountOffsetP1(assetIndex);
  if (marketData.length < off + ASSET_RISK_LIMITS_LEN_P1) throw new Error(`market account too short for asset ${assetIndex}`);
  return decodeAdlEpisodeRecord(marketData.subarray(off, off + ASSET_RISK_LIMITS_LEN_P1));
}
function adlEpisodeSlotsRemaining(ep, marketId, epochLong, epochShort, nowSlot) {
  const [kl, ks] = adlEpisodeKey(marketId, epochLong, epochShort);
  const armed = ep.sinceSlot !== 0n && ep.epochKeyLong === kl && ep.epochKeyShort === ks;
  if (!armed) return null;
  const end = ep.sinceSlot + BigInt(ep.effectiveMaxEpisodeSlots);
  return nowSlot >= end ? 0n : end - nowSlot;
}
function isBankruptcyHlockActive(byte) {
  return byte !== 0;
}
function decodeBankruptcyHlock(byte) {
  if (byte === 0) return { active: false, unattributed: false, domains: [] };
  if ((byte & 1) === 0) throw new Error(`invalid h-lock byte ${byte}: bit 0 clear`);
  const mask = byte >> 1;
  const domains = [];
  for (let d = 0; d < 7; d++) if (mask & 1 << d) domains.push(d);
  return { active: true, unattributed: mask === 0, domains };
}

// src/abi/p2b-earn.ts
var IX_TAG_P2B_EARN = Object.freeze({ VaultLpAllocate: 103 });
var KIND_VAULT_LP_EXT_P2B = 10;
var VAULT_LP_EXT_BODY_LEN_P2B = 128;
var VAULT_LP_EXT_ACCOUNT_LEN_P2B = 16 + VAULT_LP_EXT_BODY_LEN_P2B;
var VAULT_LP_EXT_VERSION_P2B = 1;
var VAULT_LP_EXT_SEED_P2B = "vault_lp_ext";
var LP_VAULT_REGISTRY_EXT_FLAG_OFF_P2B = 161;
var ALLOC_ALPHA_DEFAULT_BPS_P2B = 5e3;
var ALLOC_ALPHA_MAX_BPS_P2B = 5e3;
var ALLOC_BUFFER_DEFAULT_BPS_P2B = 3e3;
var ALLOC_BUFFER_MIN_BPS_P2B = 3e3;
var ALLOC_MIN_JUNIOR_BPS_P2B = 500;
var ASSET_VAULT_LP_P2B_CREATOR_FEE_VESTING_P2B = 1;
var BOUND_SCALE_P2B = 1000000000000n;
var U162 = 65535;
var U642 = (1n << 64n) - 1n;
var U1282 = (1n << 128n) - 1n;
var BPS = 10000n;
function int3(name, v, min2, max) {
  if (!Number.isInteger(v) || v < min2 || v > max) throw new Error(`${name} must be an integer in ${min2}..=${max}, got ${v}`);
}
function big3(name, v, max, min2 = 0n) {
  if (v < min2 || v > max) throw new Error(`${name} must be in ${min2}..=${max}, got ${v}`);
}
function encodeVaultLpAllocateP2b(amount) {
  big3("amount", amount, U1282);
  return concatBytes(encU8(IX_TAG_P2B_EARN.VaultLpAllocate), encU128(amount));
}
var U128_MAX_P2B = U1282;
var ACCOUNTS_VAULT_LP_ALLOCATE_P2B = [
  { name: "cranker", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "vaultLpExt", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
function assertVaultLpDialsP2b(d) {
  int3("allocAlphaBps", d.allocAlphaBps, 0, ALLOC_ALPHA_MAX_BPS_P2B);
  int3("allocBufferBps", d.allocBufferBps, ALLOC_BUFFER_MIN_BPS_P2B, 1e4);
  int3("cushionTargetBps", d.cushionTargetBps, 0, 1e4);
  int3("cushionShareBps", d.cushionShareBps, 0, 1e4);
  if (d.cushionTargetBps === 0 !== (d.cushionShareBps === 0)) {
    throw new Error("cushionTargetBps and cushionShareBps must be both zero or both non-zero");
  }
}
function encodeSetVaultLpRiskV19P2b(a) {
  int3("assetIndex", a.assetIndex, 0, U162);
  big3("skewSlopeE9", a.skewSlopeE9, U642);
  big3("skewMaxE9", a.skewMaxE9, U642);
  big3("levCapQ", a.levCapQ, U1282);
  int3("levMaxImrBps", a.levMaxImrBps, 0, 1e4);
  int3("vaultLpMaxLevBps", a.vaultLpMaxLevBps, 0, 5e4);
  assertVaultLpDialsP2b(a);
  return concatBytes(
    encU8(99),
    encU16(a.assetIndex),
    encU64(a.skewSlopeE9),
    encU64(a.skewMaxE9),
    encU128(a.levCapQ),
    encU16(a.levMaxImrBps),
    encU32(a.vaultLpMaxLevBps),
    encPubkey(a.approvedMatcherProgram),
    encU16(a.allocAlphaBps),
    encU16(a.allocBufferBps),
    encU16(a.cushionTargetBps),
    encU16(a.cushionShareBps)
  );
}
var ACCOUNTS_SET_VAULT_LP_RISK_V19_P2B = [
  { name: "upgradeAuthority", signer: true, writable: true },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "vaultLpExt", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
var VAULT_LP_EXT_TAIL_INDEX_P2B = Object.freeze({ 97: 11, 98: 8, 78: 7 });
var VAULT_LP_EXT_FIELD_OFF_P2B = Object.freeze({
  marketGroup: 0,
  allocatedAtoms: 32,
  cushionAccruedAtoms: 48,
  allocatedTotalAtoms: 64,
  deallocatedTotalAtoms: 80,
  allocAlphaBps: 96,
  allocBufferBps: 98,
  cushionTargetBps: 100,
  cushionShareBps: 102,
  version: 104,
  bump: 105,
  padding: 106,
  reserved: 112
});
var P2B_SENIOR_FLOOR_RECORD_OFF = 42;
var P2B_SENIOR_FLOOR_SLOT_OFF = 650;
function seniorFloorDecodeP2b(code) {
  int3("code", code, 0, U162);
  return BigInt(code & 1023) << BigInt(code >> 10);
}
function seniorFloorEncodeP2b(v) {
  big3("v", v, U1282);
  if (v === 0n) return 0;
  const bits = BigInt(v.toString(2).length);
  if (bits <= 10n) return Number(v);
  let e = bits - 10n;
  let m = (v >> e) + ((v & (1n << e) - 1n) !== 0n ? 1n : 0n);
  if (m === 1024n) {
    e += 1n;
    m = 512n;
  }
  if (e > 63n) return 65535;
  return Number(e) << 10 | Number(m);
}
function decodeSeniorFloorRecordP2b(rec) {
  if (rec.length !== 64) throw new Error(`AssetRiskLimitsV17 record must be 64 bytes, got ${rec.length}`);
  const code = rec[P2B_SENIOR_FLOOR_RECORD_OFF] | rec[P2B_SENIOR_FLOOR_RECORD_OFF + 1] << 8;
  return { code, floorAtoms: seniorFloorDecodeP2b(code) };
}
function seniorCapitalHaltP2b(lpConservativeEquity, floor) {
  return lpConservativeEquity < floor;
}
var bpsFloor = (v, bps) => v * BigInt(bps) / BPS;
var bpsCeil = (v, bps) => (v * BigInt(bps) + BPS - 1n) / BPS;
var sat = (a, b) => a > b ? a - b : 0n;
function vaultLpAllocLimitP2b(cEff, allocated, drawable, alphaBps, bufferBps) {
  if (alphaBps > ALLOC_ALPHA_MAX_BPS_P2B || bufferBps < ALLOC_BUFFER_MIN_BPS_P2B || bufferBps > 1e4) return null;
  const alphaRoom = sat(bpsFloor(cEff, alphaBps), allocated);
  const liquidRoom = sat(drawable, bpsCeil(cEff, bufferBps));
  return alphaRoom < liquidRoom ? alphaRoom : liquidRoom;
}
function vaultLpAllocAdmittedP2b(drawOutstanding, drawPending, vaultValue, cEff, lpEquity) {
  return drawOutstanding === 0n && !drawPending && vaultValue >= cEff && lpEquity >= 0n;
}
function allocJuniorOkP2b(vaultValue, cEff) {
  return sat(vaultValue, cEff) >= bpsCeil(cEff, ALLOC_MIN_JUNIOR_BPS_P2B);
}
function allocWrittenDownP2b(allocated, lpValue) {
  return allocated < lpValue ? allocated : lpValue;
}
function vaultLpDeallocP2b(allocated, recalled) {
  return sat(allocated, recalled);
}
function vaultLpAllocSplitP2b(moved, dEven, dOdd) {
  const total = dEven + dOdd;
  if (moved > total) return null;
  if (moved === 0n) return [0n, 0n];
  const smallIsOdd = dOdd <= dEven;
  const [dSmall, dLarge] = smallIsOdd ? [dOdd, dEven] : [dEven, dOdd];
  let takeSmall = moved * dSmall / total;
  if (takeSmall > dSmall) takeSmall = dSmall;
  const takeLarge = moved - takeSmall;
  if (takeLarge > dLarge) return null;
  return smallIsOdd ? [takeLarge, takeSmall] : [takeSmall, takeLarge];
}
function a4CapacityLockOkP2b(nCapBefore, nCapAfter, lpEffAbs) {
  return nCapAfter >= nCapBefore || nCapAfter >= lpEffAbs;
}
function liveBoundPrincipalPortionP2b(atomsOut, available) {
  return atomsOut < available ? atomsOut : available;
}
function cushionSplitP2b(available, cushionShareBps, cushionTargetBps, cEff, juniorLevel) {
  if (cushionShareBps === 0 || cushionTargetBps === 0) return [available, 0n];
  const need = sat(bpsCeil(cEff, cushionTargetBps), juniorLevel);
  const share = bpsFloor(available, cushionShareBps);
  const cushion = share < need ? share : need;
  return [available - cushion, cushion];
}
function cushionLockedP2b(cushionAccrued, cEff, cushionTargetBps) {
  const target = bpsCeil(cEff, cushionTargetBps);
  return cushionAccrued < target ? cushionAccrued : target;
}
function creatorFeeVestedP2b(juniorLevel, cEff, cushionShareBps, cushionTargetBps) {
  if (cushionShareBps === 0 || cushionTargetBps === 0) return true;
  return juniorLevel >= bpsCeil(cEff, cushionTargetBps);
}
var KIND_BACKING_DOMAIN_LEDGER_P2B = 3;
var BACKING_DOMAIN_LEDGER_BODY_LEN_P2B = 224;
var BACKING_DOMAIN_LEDGER_ACCOUNT_LEN_P2B = 16 + BACKING_DOMAIN_LEDGER_BODY_LEN_P2B;
var BACKING_DOMAIN_LEDGER_FIELD_OFF_P2B = Object.freeze({
  marketGroup: 0,
  authority: 32,
  totalPrincipalAtoms: 64,
  totalDepositedAtoms: 80,
  totalPrincipalWithdrawnAtoms: 96,
  totalEarningsAtoms: 112,
  totalEarningsWithdrawnAtoms: 128,
  lastObservedBucketEarningsAtoms: 144,
  cumulativeLossAtoms: 160,
  cumulativeRecoveryAtoms: 176,
  lastObservedUnavailablePrincipalAtoms: 192,
  domain: 208,
  padding: 210,
  marketId: 216
});
var SOURCE_CREDIT_REL_P2B = Object.freeze({ long: 595, short: 779 });
var SOURCE_CREDIT_LEN_P2B = 184;
var SOURCE_CREDIT_FIELD_OFF_P2B = Object.freeze({
  positiveClaimBoundNum: 0,
  exactPositiveClaimNum: 16,
  freshReservedBackingNum: 32,
  spentBackingNum: 48,
  providerReceivableNum: 64,
  validLienedBackingNum: 80,
  impairedLienedBackingNum: 96,
  insuranceCreditReservedNum: 112,
  validLienedInsuranceNum: 128,
  impairedLienedInsuranceNum: 144,
  creditRateNum: 160,
  creditEpoch: 176
});
var BACKING_BUCKET_FIELD_OFF_P2B = Object.freeze({
  marketId: 0,
  freshUnlienedBackingNum: 8,
  validLienedBackingNum: 24,
  consumedLienedBackingNum: 40,
  impairedLienedBackingNum: 56,
  utilizationFeeEarnings: 72,
  expirySlot: 88,
  status: 96
});
function potPhysicalNetAtomsP2b(freshUnlienedNum, validLienedNum, claimBoundNum, insuranceCoverNum, scale = BOUND_SCALE_P2B) {
  if (scale === 0n) return 0n;
  const held = (freshUnlienedNum + validLienedNum) / scale;
  const uncovered = sat(claimBoundNum, insuranceCoverNum);
  const owed = (uncovered + scale - 1n) / scale;
  return sat(held, owed);
}
function insuranceCoverNumP2b(insuranceCreditReservedNum, validLienedInsuranceNum, impairedLienedInsuranceNum) {
  return sat(insuranceCreditReservedNum, validLienedInsuranceNum + impairedLienedInsuranceNum);
}
function nonboundPotAvailableE3P2b(principal, physicalNet) {
  return principal < physicalNet ? principal : physicalNet;
}
function nonboundPotEntryAvailableP2b(principal) {
  return principal;
}
function potNav(available, earnings, withdrawn, feeShareBps) {
  if (earnings < withdrawn) throw new Error("earnings withdrawn exceeds earnings (the program fails with Custom 25)");
  return available + (earnings - withdrawn) * BigInt(feeShareBps) / BPS;
}
function nonboundVaultPricingP2b(own, sibling, feeShareBps) {
  int3("feeShareBps", feeShareBps, 0, 1e4);
  let entry = 0n;
  let exit = 0n;
  for (const p of [own, sibling]) {
    entry += potNav(nonboundPotEntryAvailableP2b(p.totalPrincipalAtoms), p.totalEarningsAtoms, p.totalEarningsWithdrawnAtoms, feeShareBps);
    exit += potNav(nonboundPotAvailableE3P2b(p.totalPrincipalAtoms, p.physicalNetAtoms), p.totalEarningsAtoms, p.totalEarningsWithdrawnAtoms, feeShareBps);
  }
  const gap = entry - exit;
  return {
    entryNavAtoms: entry,
    exitNavAtoms: exit,
    parMinusE3Atoms: gap,
    parMinusE3Bps: entry === 0n ? 0 : Number(gap * BPS / entry)
  };
}
function lpSharesForDepositP2b(amount, totalShares, navAtoms) {
  if (totalShares === 0n) return amount;
  if (navAtoms === 0n) return null;
  const s = amount * totalShares / navAtoms;
  return s === 0n ? null : s;
}
function lpAtomsForRedemptionP2b(shares, totalShares, navAtoms) {
  if (totalShares === 0n || shares > totalShares) return null;
  return shares * navAtoms / totalShares;
}
function entryVsExitP2b(shares, totalShares, pricing) {
  const entry = lpAtomsForRedemptionP2b(shares, totalShares, pricing.entryNavAtoms);
  const exit = lpAtomsForRedemptionP2b(shares, totalShares, pricing.exitNavAtoms);
  if (entry === null || exit === null) throw new Error("shares must be <= totalShares and totalShares > 0");
  const haircut = entry - exit;
  return {
    entryValueAtoms: entry,
    exitValueAtoms: exit,
    haircutAtoms: haircut,
    haircutBps: entry === 0n ? 0 : Number(haircut * BPS / entry)
  };
}

// src/solana/slab.ts
import { PublicKey as PublicKey8 } from "@solana/web3.js";
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
  if (v121epn !== void 0) return validateLayout(buildLayoutV12_1EP(v121epn), dataLen);
  const v121n = V12_1_SIZES.get(dataLen);
  if (v121n !== void 0) return validateLayout(buildLayoutV12_1(v121n, dataLen), dataLen);
  const vsdpn = V_SETDEXPOOL_SIZES.get(dataLen);
  if (vsdpn !== void 0) return validateLayout(buildLayoutVSetDexPool(vsdpn), dataLen);
  const v1m2n = V1M2_SIZES.get(dataLen);
  if (v1m2n !== void 0) return validateLayout(buildLayoutV1M2(v1m2n), dataLen);
  const vadln = V_ADL_SIZES.get(dataLen);
  if (vadln !== void 0) return validateLayout(buildLayoutVADL(vadln), dataLen);
  const v1mn = V1M_SIZES.get(dataLen);
  if (v1mn !== void 0) return validateLayout(buildLayoutV1M(v1mn), dataLen);
  const v0n = V0_SIZES.get(dataLen);
  if (v0n !== void 0) return validateLayout(buildLayout(0, v0n), dataLen);
  const v1dn = V1D_SIZES.get(dataLen);
  if (v1dn !== void 0) {
    if (data && data.length >= 12) {
      const version = readU32LE(data, 8);
      if (version === 2) return validateLayout(buildLayoutV2(v1dn), dataLen);
    }
    return validateLayout(buildLayoutV1D(v1dn, 2), dataLen);
  }
  const v1dln = V1D_SIZES_LEGACY.get(dataLen);
  if (v1dln !== void 0) return validateLayout(buildLayoutV1D(v1dln, 18), dataLen);
  const v1n = V1_SIZES.get(dataLen);
  if (v1n !== void 0) return validateLayout(buildLayout(1, v1n), dataLen);
  const v1ln = V1_SIZES_LEGACY.get(dataLen);
  if (v1ln !== void 0) return validateLayout(buildLayout(1, v1ln, V1_ENGINE_OFF_LEGACY), dataLen);
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
  const admin = new PublicKey8(data.subarray(16, 48));
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
  const collateralMint = new PublicKey8(data.subarray(b + 0, b + 32));
  const vaultPubkey = new PublicKey8(data.subarray(b + 32, b + 64));
  const indexFeedId = new PublicKey8(data.subarray(b + 64, b + 96));
  const maxStalenessSlots = readU64LE(data, b + 96);
  const confFilterBps = readU16LE(data, b + 104);
  const vaultAuthorityBump = readU8(data, b + 106);
  const invert = readU8(data, b + 107);
  const unitScale = readU32LE(data, b + 108);
  const fundingHorizonSlots = readU64LE(data, b + 112);
  const fundingKBps = readU64LE(data, b + 120);
  const fundingMaxPremiumBps = readI64LE(data, b + 128);
  const fundingMaxBpsPerSlot = readI64LE(data, b + 136);
  const oracleAuthority = new PublicKey8(data.subarray(b + 144, b + 176));
  const authorityPriceE6 = readU64LE(data, b + 176);
  const authorityTimestamp = readI64LE(data, b + 184);
  const oraclePriceCapE2bps = readU64LE(data, b + 192);
  const lastEffectivePriceE6 = readU64LE(data, b + 200);
  const dexPoolBytes = data.subarray(b + 400, b + 432);
  const dexPool = dexPoolBytes.some((x) => x !== 0) ? new PublicKey8(dexPoolBytes) : null;
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
  const collateralMint = new PublicKey8(data.subarray(b + 0, b + 32));
  const vaultPubkey = new PublicKey8(data.subarray(b + 32, b + 64));
  const indexFeedId = new PublicKey8(data.subarray(b + 64, b + 96));
  const maxStalenessSlots = readU64LE(data, b + 96);
  const confFilterBps = readU16LE(data, b + 104);
  const vaultAuthorityBump = readU8(data, b + 106);
  const invert = readU8(data, b + 107);
  const unitScale = readU32LE(data, b + 108);
  const fundingHorizonSlots = readU64LE(data, b + 112);
  const fundingKBps = readU64LE(data, b + 120);
  const fundingMaxPremiumBps = readI64LE(data, b + 128);
  const fundingMaxBpsPerSlot = readI64LE(data, b + 136);
  const oracleAuthority = new PublicKey8(data.subarray(b + 144, b + 176));
  const authorityPriceE6 = readU64LE(data, b + 176);
  const authorityTimestamp = readI64LE(data, b + 184);
  const lastEffectivePriceE6 = readU64LE(data, b + 192);
  const oraclePriceCapE2bps = readU64LE(data, b + 216);
  const dexPoolBytes = data.subarray(b + 368, b + 400);
  const dexPool = dexPoolBytes.some((x) => x !== 0) ? new PublicKey8(dexPoolBytes) : null;
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
  const collateralMint = new PublicKey8(data.subarray(off, off + 32));
  off += 32;
  const vaultPubkey = new PublicKey8(data.subarray(off, off + 32));
  off += 32;
  const indexFeedId = new PublicKey8(data.subarray(off, off + 32));
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
  const oracleAuthority = new PublicKey8(data.subarray(off, off + 32));
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
      dexPool = new PublicKey8(dexPoolBytes);
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
  return Math.min(
    Math.floor(accountsEnd / layout.accountSize),
    layout.maxAccounts
  );
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
      matcherProgram: new PublicKey8(data.subarray(base + V12_17_ACCT_MATCHER_PROGRAM_OFF - d1, base + V12_17_ACCT_MATCHER_PROGRAM_OFF - d1 + 32)),
      matcherContext: new PublicKey8(data.subarray(base + V12_17_ACCT_MATCHER_CONTEXT_OFF - d1, base + V12_17_ACCT_MATCHER_CONTEXT_OFF - d1 + 32)),
      owner: new PublicKey8(data.subarray(base + V12_17_ACCT_OWNER_OFF - d1, base + V12_17_ACCT_OWNER_OFF - d1 + 32)),
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
      matcherProgram: new PublicKey8(data.subarray(base + V12_15_ACCT_MATCHER_PROGRAM_OFF, base + V12_15_ACCT_MATCHER_PROGRAM_OFF + 32)),
      matcherContext: new PublicKey8(data.subarray(base + V12_15_ACCT_MATCHER_CONTEXT_OFF, base + V12_15_ACCT_MATCHER_CONTEXT_OFF + 32)),
      owner: new PublicKey8(data.subarray(base + V12_15_ACCT_OWNER_OFF, base + V12_15_ACCT_OWNER_OFF + 32)),
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
    matcherProgram: new PublicKey8(data.subarray(base + matcherProgOff, base + matcherProgOff + 32)),
    matcherContext: new PublicKey8(data.subarray(base + matcherCtxOff, base + matcherCtxOff + 32)),
    owner: new PublicKey8(data.subarray(base + layout.acctOwnerOff, base + layout.acctOwnerOff + 32)),
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
var V17_EXPECTED_VERSION = 18;
var V17_KIND_MARKET = 1;
var V17_KIND_OFF = 10;
var V17_WRAPPER_CONFIG_LEN = 576;
var V17_CREATOR_FEE_CLAIMABLE_OFF = 568;
var V17_ASSET_ORACLE_PROFILE_LEN = 512;
var V17_ASSET_ORACLE_WRAPPER_LEN = 1024;
var V17_ASSET_CONTROL_SEQUENCES_OFF = V17_ASSET_ORACLE_PROFILE_LEN;
var V17_ASSET_CONTROL_SEQUENCES_LEN = 88;
var V17_PROTOCOL_FEE_AUTHORITY_EPOCH_OFF = V17_ASSET_CONTROL_SEQUENCES_OFF + V17_ASSET_CONTROL_SEQUENCES_LEN;
var V17_PROTOCOL_FEE_AUTHORITY_EPOCH_LEN = 8;
var ACS_ORACLE_OBSERVATION_OFF = 0;
var ACS_BACKING_FEE_LONG_OFF = 8;
var ACS_BACKING_FEE_SHORT_OFF = 16;
var ACS_TRADE_FEE_OFF = 24;
var ACS_LIQUIDATION_FEE_OFF = 32;
var ACS_MAINTENANCE_FEE_OFF = 40;
var ACS_FEE_REDIRECT_OFF = 48;
var ACS_MARKET_INIT_FEE_OFF = 56;
var ACS_PERMISSIONLESS_RESOLVE_OFF = 64;
var ACS_AUTHORITY_EPOCH_OFF = 72;
function parseAssetControlSequencesV17(data, assetSlotOff) {
  const base = assetSlotOff + V17_ASSET_CONTROL_SEQUENCES_OFF;
  const MIN_LEN = base + V17_ASSET_CONTROL_SEQUENCES_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseAssetControlSequencesV17: data too short \u2014 need ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  return {
    oracleObservation: readU64LE(data, base + ACS_ORACLE_OBSERVATION_OFF),
    backingFeeLong: readU64LE(data, base + ACS_BACKING_FEE_LONG_OFF),
    backingFeeShort: readU64LE(data, base + ACS_BACKING_FEE_SHORT_OFF),
    tradeFee: readU64LE(data, base + ACS_TRADE_FEE_OFF),
    liquidationFee: readU64LE(data, base + ACS_LIQUIDATION_FEE_OFF),
    maintenanceFee: readU64LE(data, base + ACS_MAINTENANCE_FEE_OFF),
    feeRedirect: readU64LE(data, base + ACS_FEE_REDIRECT_OFF),
    marketInitFee: readU64LE(data, base + ACS_MARKET_INIT_FEE_OFF),
    permissionlessResolve: readU64LE(data, base + ACS_PERMISSIONLESS_RESOLVE_OFF),
    authorityEpoch: readU64LE(data, base + ACS_AUTHORITY_EPOCH_OFF)
  };
}
function parseProtocolFeeAuthorityEpoch(data, asset0SlotOff) {
  const off = asset0SlotOff + V17_PROTOCOL_FEE_AUTHORITY_EPOCH_OFF;
  const MIN_LEN = off + V17_PROTOCOL_FEE_AUTHORITY_EPOCH_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseProtocolFeeAuthorityEpoch: data too short \u2014 need ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  return readU64LE(data, off);
}
var V17_HEADER_LEN = 16;
var V17_MARKET_GROUP_OFF = V17_HEADER_LEN + V17_WRAPPER_CONFIG_LEN;
var V17_MARKET_GROUP_LEN = 758;
var V17_MARKET_ASSET_SLOT_LEN = 2325;
function v17MarketAccountLen(maxPortfolioAssets) {
  if (!Number.isInteger(maxPortfolioAssets) || maxPortfolioAssets < 1) {
    throw new Error(`v17MarketAccountLen: maxPortfolioAssets must be a positive integer, got ${maxPortfolioAssets}`);
  }
  return V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + maxPortfolioAssets * V17_MARKET_ASSET_SLOT_LEN;
}
var V17_PORTFOLIO_ACCOUNT_LEN = 9563;
var V17_PORTFOLIO_LEG_SIZE = 152;
var V17_PORTFOLIO_IDENTITY_TRAILER_LEN = 24;
function parseWrapperConfigV17(data, configOff = V17_HEADER_LEN) {
  const MIN_LEN = configOff + V17_WRAPPER_CONFIG_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseWrapperConfigV17: data too short \u2014 need ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  const b = configOff;
  const marketauth = new PublicKey8(data.subarray(b + 0, b + 32));
  const collateralMint = new PublicKey8(data.subarray(b + 32, b + 64));
  const secondaryCollateralMint = new PublicKey8(data.subarray(b + 64, b + 96));
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
  const ORACLE_LEG_CAP2 = 3;
  const oracleLegFeeds = [];
  for (let i = 0; i < ORACLE_LEG_CAP2; i++) {
    oracleLegFeeds.push(new PublicKey8(data.subarray(b + 280 + i * 32, b + 280 + (i + 1) * 32)));
  }
  const oracleLegPricesE6 = [];
  for (let i = 0; i < ORACLE_LEG_CAP2; i++) {
    oracleLegPricesE6.push(readU64LE(data, b + 376 + i * 8));
  }
  const oracleLegPublishTimes = [];
  for (let i = 0; i < ORACLE_LEG_CAP2; i++) {
    oracleLegPublishTimes.push(readI64LE(data, b + 400 + i * 8));
  }
  const backingTradeFeePolicyCount = readU16LE(data, b + 424);
  const backingTradeFeeInsuranceShareBpsLong = readU16LE(data, b + 426);
  const backingTradeFeeInsuranceShareBpsShort = readU16LE(data, b + 428);
  const feeRedirectToMarket0Bps = readU16LE(data, b + 430);
  const protocolFeeAuthority = new PublicKey8(data.subarray(b + 432, b + 464));
  const protocolFeeAccruedAtoms = readU128LE(data, b + 464);
  const protocolFeeWithdrawnAtoms = readU128LE(data, b + 480);
  const lpFeeAccruedAtoms = readU128LE(data, b + 496);
  const lpFeeWithdrawnAtoms = readU128LE(data, b + 512);
  const insuranceReserveAccruedAtoms = readU128LE(data, b + 528);
  const insuranceReserveWithdrawnAtoms = readU128LE(data, b + 544);
  const creatorShareBps = readU16LE(data, b + 560);
  const lpShareBps = readU16LE(data, b + 562);
  const insuranceShareBps = readU16LE(data, b + 564);
  const creatorFeeClaimableAtoms = readU64LE(data, b + V17_CREATOR_FEE_CLAIMABLE_OFF);
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
    feeRedirectToMarket0Bps,
    protocolFeeAuthority,
    protocolFeeAccruedAtoms,
    protocolFeeWithdrawnAtoms,
    lpFeeAccruedAtoms,
    lpFeeWithdrawnAtoms,
    insuranceReserveAccruedAtoms,
    insuranceReserveWithdrawnAtoms,
    creatorShareBps,
    lpShareBps,
    insuranceShareBps,
    creatorFeeClaimableAtoms
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
  const ORACLE_LEG_CAP2 = 3;
  const oracleLegFeeds = [];
  for (let i = 0; i < ORACLE_LEG_CAP2; i++) {
    oracleLegFeeds.push(new PublicKey8(data.subarray(b + 224 + i * 32, b + 224 + (i + 1) * 32)));
  }
  const oracleLegPricesE6 = [];
  for (let i = 0; i < ORACLE_LEG_CAP2; i++) {
    oracleLegPricesE6.push(readU64LE(data, b + 320 + i * 8));
  }
  const oracleLegPublishTimes = [];
  for (let i = 0; i < ORACLE_LEG_CAP2; i++) {
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
    insuranceAuthority: new PublicKey8(data.subarray(b + 24, b + 56)),
    insuranceOperator: new PublicKey8(data.subarray(b + 56, b + 88)),
    backingBucketAuthority: new PublicKey8(data.subarray(b + 88, b + 120)),
    oracleAuthority: new PublicKey8(data.subarray(b + 120, b + 152)),
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
    assetAdmin: new PublicKey8(data.subarray(b + 368, b + 400)),
    creatorFeeClaimableAtoms: readU64LE(data, b + 400),
    maintenanceFeeCheckpointSlot: readU64LE(data, b + 408),
    maintenanceFeePreviousRate: readU128LE(data, b + 416),
    fundingMarkE6: readU64LE(data, b + 432),
    fundingMarkPendingE6: readU64LE(data, b + 440),
    fundingMarkPendingSlot: readU64LE(data, b + 448),
    priceMoveRemainderBpsNum: readU16LE(data, b + 456),
    // bytes [458, 464) are `_padding1: [u8; 6]`, always zero, not decoded.
    terminalSlabScanProgress: readU128LE(data, b + 464),
    nextPortfolioId: readU64LE(data, b + 480),
    // bytes [488, 496) are `_padding2: [u8; 8]`, always zero, not decoded.
    insuranceTopUp: readU64LE(data, b + 496),
    backingTopUp: readU64LE(data, b + 504)
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
var V17_HEADER_INSURANCE_OFF = 301;
var V17_ASSET_SLOT_WRAPPER_SIZE = V17_ASSET_ORACLE_WRAPPER_LEN;
var V17_ASSET_STATE_OI_LONG_REL = 289;
var V17_ASSET_STATE_OI_SHORT_REL = 305;
function parseMarketGroupV17OI(data) {
  const MIN_LEN = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseMarketGroupV17OI: buffer too short \u2014 need >= ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  if (!isV17MarketAccount(data)) {
    throw new Error(
      "parseMarketGroupV17OI: not a v17 market account (bad magic, version, or kind)"
    );
  }
  const insuranceOff = V17_MARKET_GROUP_OFF + V17_HEADER_INSURANCE_OFF;
  const insuranceBalance = readU128LE(data, insuranceOff);
  const slotsBase = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN;
  const numSlots = Math.floor(
    (data.length - slotsBase) / V17_MARKET_ASSET_SLOT_LEN
  );
  let totalLongOiQ = 0n;
  let totalShortOiQ = 0n;
  const assets = [];
  for (let i = 0; i < numSlots; i++) {
    const slotBase = slotsBase + i * V17_MARKET_ASSET_SLOT_LEN;
    const longOff = slotBase + V17_ASSET_SLOT_WRAPPER_SIZE + V17_ASSET_STATE_OI_LONG_REL;
    const shortOff = slotBase + V17_ASSET_SLOT_WRAPPER_SIZE + V17_ASSET_STATE_OI_SHORT_REL;
    if (shortOff + 16 > data.length) break;
    const oiEffLongQ = readU128LE(data, longOff);
    const oiEffShortQ = readU128LE(data, shortOff);
    totalLongOiQ += oiEffLongQ;
    totalShortOiQ += oiEffShortQ;
    if (oiEffLongQ !== 0n || oiEffShortQ !== 0n) {
      assets.push({ assetIndex: i, oiEffLongQ, oiEffShortQ });
    }
  }
  return { insuranceBalance, totalLongOiQ, totalShortOiQ, assets };
}
var V17_ACCOUNT_HEADER_LEN = 16;
var V17_KIND_PORTFOLIO = 2;
var V17_KIND_LP_VAULT_REGISTRY = 5;
var V17_KIND_LP_REDEMPTION = 6;
function assertV17StandaloneHeader(data, parserName, expectedKind) {
  if (data.length < V17_ACCOUNT_HEADER_LEN) {
    throw new Error(`${parserName}: data too short (${data.length} < ${V17_ACCOUNT_HEADER_LEN})`);
  }
  const magic = readU64LE(data, 0);
  if (magic !== V17_MAGIC) {
    throw new Error(`${parserName}: invalid v17 magic`);
  }
  const version = readU16LE(data, 8);
  if (version !== V17_EXPECTED_VERSION) {
    throw new Error(`${parserName}: invalid v17 version (${version} !== ${V17_EXPECTED_VERSION})`);
  }
  const kind = readU8(data, 10);
  if (kind !== expectedKind) {
    throw new Error(`${parserName}: invalid v17 account kind (${kind} !== ${expectedKind})`);
  }
}
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
var PF_FUNDING_LONG_PAID_OFF = PF_BODY_OFF + 128;
var PF_FUNDING_LONG_RECEIVED_OFF = PF_BODY_OFF + 144;
var PF_FUNDING_SHORT_PAID_OFF = PF_BODY_OFF + 160;
var PF_FUNDING_SHORT_RECEIVED_OFF = PF_BODY_OFF + 176;
var PF_FEE_CREDITS_OFF = PF_BODY_OFF + 192;
var PF_CANCEL_ESCROW_OFF = PF_BODY_OFF + 208;
var PF_LAST_FEE_SLOT_OFF = PF_BODY_OFF + 224;
var PF_ACTIVE_BITMAP_OFF = PF_BODY_OFF + 232;
var PF_LEG_SIZE = V17_PORTFOLIO_LEG_SIZE;
var PF_LEGS_OFF = PF_BODY_OFF + 240;
var PF_LEGS_COUNT = 16;
var PF_SOURCE_DOMAIN_SIZE = 196;
var PF_SOURCE_DOMAINS_OFF = PF_LEGS_OFF + PF_LEGS_COUNT * PF_LEG_SIZE;
var PF_SOURCE_DOMAINS_CAP = 32;
var PF_HEALTH_CERT_OFF = PF_SOURCE_DOMAINS_OFF + PF_SOURCE_DOMAINS_CAP * PF_SOURCE_DOMAIN_SIZE;
var PF_MATCHER_CONFIG_LEN = 104;
var PF_MATCHER_PROGRAM_OFF = V17_PORTFOLIO_ACCOUNT_LEN - PF_MATCHER_CONFIG_LEN - V17_PORTFOLIO_IDENTITY_TRAILER_LEN;
var PF_MATCHER_CONTEXT_OFF = PF_MATCHER_PROGRAM_OFF + 32;
var PF_MATCHER_DELEGATE_OFF = PF_MATCHER_CONTEXT_OFF + 32;
var PF_MATCHER_CONTROL_OFF = PF_MATCHER_DELEGATE_OFF + 32;
var PF_PORTFOLIO_ID_OFF = PF_MATCHER_PROGRAM_OFF + PF_MATCHER_CONFIG_LEN;
var PF_MATCHER_SEQUENCE_OFF = PF_PORTFOLIO_ID_OFF + 8;
var PF_MATCHER_EXPIRY_OFF = PF_MATCHER_SEQUENCE_OFF + 8;
function decodePortfolioMatcherControl(control) {
  const ENABLED_MASK = 1n;
  const POSITION_EPOCH_BITS = 49n;
  const POSITION_EPOCH_SHIFT = 1n;
  const POSITION_EPOCH_MASK = (1n << POSITION_EPOCH_BITS) - 1n << POSITION_EPOCH_SHIFT;
  const TRADE_FEE_CAP_SHIFT = 50n;
  const TRADE_FEE_CAP_MASK = 0x3fffn << TRADE_FEE_CAP_SHIFT;
  return {
    enabled: (control & ENABLED_MASK) === 1n,
    positionEpoch: (control & POSITION_EPOCH_MASK) >> POSITION_EPOCH_SHIFT,
    tradeFeeCapBps: Number((control & TRADE_FEE_CAP_MASK) >> TRADE_FEE_CAP_SHIFT)
  };
}
function parsePortfolioV17(data) {
  const MIN_PORTFOLIO_BYTES = PF_RESERVED_PNL_OFF + 16;
  if (data.length < MIN_PORTFOLIO_BYTES) {
    throw new Error(`parsePortfolioV17: data too short (${data.length} < ${MIN_PORTFOLIO_BYTES})`);
  }
  assertV17StandaloneHeader(data, "parsePortfolioV17", V17_KIND_PORTFOLIO);
  const marketGroupId = new PublicKey8(data.subarray(PF_PROVENANCE_MARKET_GROUP_OFF, PF_PROVENANCE_MARKET_GROUP_OFF + 32));
  const portfolioAccountId = new PublicKey8(data.subarray(PF_PROVENANCE_ACCOUNT_ID_OFF, PF_PROVENANCE_ACCOUNT_ID_OFF + 32));
  const provenanceOwner = new PublicKey8(data.subarray(PF_PROVENANCE_OWNER_OFF, PF_PROVENANCE_OWNER_OFF + 32));
  const owner = new PublicKey8(data.subarray(PF_OWNER_OFF, PF_OWNER_OFF + 32));
  const capital = readU128LE(data, PF_CAPITAL_OFF);
  const pnl = readI128LE(data, PF_PNL_OFF);
  const reservedPnl = readU128LE(data, PF_RESERVED_PNL_OFF);
  const residualCrystallizedLossAtomsTotal = data.length >= PF_RESIDUAL_LOSS_OFF + 16 ? readU128LE(data, PF_RESIDUAL_LOSS_OFF) : 0n;
  const residualSpentPrincipalAtomsTotal = data.length >= PF_RESIDUAL_PRINCIPAL_OFF + 16 ? readU128LE(data, PF_RESIDUAL_PRINCIPAL_OFF) : 0n;
  const residualReceivedAtomsTotal = data.length >= PF_RESIDUAL_RECEIVED_OFF + 16 ? readU128LE(data, PF_RESIDUAL_RECEIVED_OFF) : 0n;
  const fundingLongPaidAtomsTotal = data.length >= PF_FUNDING_LONG_PAID_OFF + 16 ? readU128LE(data, PF_FUNDING_LONG_PAID_OFF) : 0n;
  const fundingLongReceivedAtomsTotal = data.length >= PF_FUNDING_LONG_RECEIVED_OFF + 16 ? readU128LE(data, PF_FUNDING_LONG_RECEIVED_OFF) : 0n;
  const fundingShortPaidAtomsTotal = data.length >= PF_FUNDING_SHORT_PAID_OFF + 16 ? readU128LE(data, PF_FUNDING_SHORT_PAID_OFF) : 0n;
  const fundingShortReceivedAtomsTotal = data.length >= PF_FUNDING_SHORT_RECEIVED_OFF + 16 ? readU128LE(data, PF_FUNDING_SHORT_RECEIVED_OFF) : 0n;
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
      kfEpochSnap: readU64LE(data, b + 78),
      epochSnap: readU64LE(data, b + 86),
      lossWeight: readU128LE(data, b + 94),
      bSnap: readU128LE(data, b + 110),
      bRem: readU128LE(data, b + 126),
      bEpochSnap: readU64LE(data, b + 142),
      bStale: data[b + 150] !== 0,
      stale: data[b + 151] !== 0
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
  const matcherProgram = data.length >= PF_MATCHER_PROGRAM_OFF + 32 ? new PublicKey8(data.subarray(PF_MATCHER_PROGRAM_OFF, PF_MATCHER_PROGRAM_OFF + 32)) : PublicKey8.default;
  const matcherContext = data.length >= PF_MATCHER_CONTEXT_OFF + 32 ? new PublicKey8(data.subarray(PF_MATCHER_CONTEXT_OFF, PF_MATCHER_CONTEXT_OFF + 32)) : PublicKey8.default;
  const matcherDelegate = data.length >= PF_MATCHER_DELEGATE_OFF + 32 ? new PublicKey8(data.subarray(PF_MATCHER_DELEGATE_OFF, PF_MATCHER_DELEGATE_OFF + 32)) : PublicKey8.default;
  let matcherEnabled = false;
  let matcherPositionEpoch = 0n;
  let matcherTradeFeeCapBps = 0;
  if (data.length >= PF_MATCHER_CONTROL_OFF + 8) {
    const control = readU64LE(data, PF_MATCHER_CONTROL_OFF);
    const decoded = decodePortfolioMatcherControl(control);
    matcherEnabled = decoded.enabled;
    matcherPositionEpoch = decoded.positionEpoch;
    matcherTradeFeeCapBps = decoded.tradeFeeCapBps;
  }
  const portfolioId = data.length >= PF_PORTFOLIO_ID_OFF + 8 ? readU64LE(data, PF_PORTFOLIO_ID_OFF) : 0n;
  const matcherSequence = data.length >= PF_MATCHER_SEQUENCE_OFF + 8 ? readU64LE(data, PF_MATCHER_SEQUENCE_OFF) : 0n;
  const matcherExpirySlot = data.length >= PF_MATCHER_EXPIRY_OFF + 8 ? readU64LE(data, PF_MATCHER_EXPIRY_OFF) : 0n;
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
    fundingLongPaidAtomsTotal,
    fundingLongReceivedAtomsTotal,
    fundingShortPaidAtomsTotal,
    fundingShortReceivedAtomsTotal,
    feeCredits,
    cancelDepositEscrow,
    lastFeeSlot,
    activeBitmap,
    legs,
    sourceDomains,
    matcherProgram,
    matcherContext,
    matcherDelegate,
    matcherEnabled,
    matcherPositionEpoch,
    matcherTradeFeeCapBps,
    portfolioId,
    matcherSequence,
    matcherExpirySlot
  };
}
var LP_VAULT_REGISTRY_TOTAL = 176;
function parseLpVaultRegistry(data) {
  if (data.length < LP_VAULT_REGISTRY_TOTAL) {
    throw new Error(
      `parseLpVaultRegistry: data too short (${data.length} < ${LP_VAULT_REGISTRY_TOTAL})`
    );
  }
  assertV17StandaloneHeader(data, "parseLpVaultRegistry", V17_KIND_LP_VAULT_REGISTRY);
  const b = V17_ACCOUNT_HEADER_LEN;
  return {
    marketGroup: new PublicKey8(data.subarray(b + 0, b + 32)),
    lpMint: new PublicKey8(data.subarray(b + 32, b + 64)),
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
  assertV17StandaloneHeader(data, "parseLpRedemption", V17_KIND_LP_REDEMPTION);
  const b = V17_ACCOUNT_HEADER_LEN;
  return {
    registry: new PublicKey8(data.subarray(b + 0, b + 32)),
    redeemer: new PublicKey8(data.subarray(b + 32, b + 64)),
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
import { PublicKey as PublicKey9 } from "@solana/web3.js";
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
  return PublicKey9.findProgramAddressSync(
    [textEncoder.encode("vault"), slab.toBytes()],
    programId
  );
}
var ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey9(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
var PERCOLATOR_VAULT_TOKEN_PROGRAM_ID = new PublicKey9(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
function deriveCanonicalVault(programId, market, mint) {
  const [vaultAuthority] = deriveVaultAuthority(programId, market);
  return deriveCanonicalVaultForAuthority(vaultAuthority, mint);
}
function deriveCanonicalVaultForAuthority(vaultAuthority, mint) {
  return PublicKey9.findProgramAddressSync(
    [
      vaultAuthority.toBytes(),
      PERCOLATOR_VAULT_TOKEN_PROGRAM_ID.toBytes(),
      mint.toBytes()
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}
function deriveMarketVaultAccounts(programId, market, mint) {
  const [vaultAuthority, vaultAuthorityBump] = deriveVaultAuthority(programId, market);
  const [vaultToken, vaultTokenBump] = deriveCanonicalVaultForAuthority(
    vaultAuthority,
    mint
  );
  return {
    vaultAuthority,
    vaultAuthorityBump,
    vaultToken,
    vaultTokenBump,
    tokenProgram: PERCOLATOR_VAULT_TOKEN_PROGRAM_ID
  };
}
function deriveInsuranceLpMint(programId, slab) {
  return PublicKey9.findProgramAddressSync(
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
  return PublicKey9.findProgramAddressSync(
    [textEncoder.encode("lp"), slab.toBytes(), idxBuf],
    programId
  );
}
var PUMPSWAP_PROGRAM_ID = new PublicKey9(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);
var RAYDIUM_CLMM_PROGRAM_ID = new PublicKey9(
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"
);
var METEORA_DLMM_PROGRAM_ID = new PublicKey9(
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
);
var PYTH_PUSH_ORACLE_PROGRAM_ID = new PublicKey9(
  "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT"
);
var CREATOR_LOCK_SEED = "creator_lock";
function deriveCreatorLockPda(programId, slab) {
  return PublicKey9.findProgramAddressSync(
    [textEncoder.encode(CREATOR_LOCK_SEED), slab.toBytes()],
    programId
  );
}
function deriveLpVaultRegistry(programId, marketGroup) {
  return PublicKey9.findProgramAddressSync(
    [textEncoder.encode("lp_vault"), marketGroup.toBytes()],
    programId
  );
}
function deriveLpRedemption(programId, registry, redeemer) {
  return PublicKey9.findProgramAddressSync(
    [
      textEncoder.encode("lp_redemption"),
      registry.toBytes(),
      redeemer.toBytes()
    ],
    programId
  );
}
function deriveLpBackingLedger(programId, marketGroup, domainIdx) {
  return PublicKey9.findProgramAddressSync(
    [
      textEncoder.encode("lp_backing_ledger"),
      marketGroup.toBytes(),
      u16LE(domainIdx)
    ],
    programId
  );
}
function deriveLpEscrow(programId, marketGroup) {
  return PublicKey9.findProgramAddressSync(
    [textEncoder.encode("lp_escrow"), marketGroup.toBytes()],
    programId
  );
}
function deriveNftRegistry(programId, marketGroup) {
  return PublicKey9.findProgramAddressSync(
    [textEncoder.encode("nft_registry"), marketGroup.toBytes()],
    programId
  );
}
function deriveMatcherDelegate(programId, market, accountB, accountBOwner, matcherProg, matcherCtx) {
  return PublicKey9.findProgramAddressSync(
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
  return PublicKey9.findProgramAddressSync(
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
import { PublicKey as PublicKey11 } from "@solana/web3.js";

// src/solana/static-markets.ts
import { PublicKey as PublicKey10 } from "@solana/web3.js";
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
      new PublicKey10(entry.slabAddress);
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
  if (layout !== null) {
    const l = layout;
    const hasInsuranceIsolation = l.engineInsuranceIsolatedOff >= 0 && l.engineInsuranceIsolationBpsOff >= 0;
    const u16At = (off) => off >= 0 ? readU16LE2(data, base + off) : 0;
    const u64At = (off) => off >= 0 ? readU64LE2(data, base + off) : 0n;
    const i64At = (off) => off >= 0 ? readI64LE2(data, base + off) : 0n;
    const u128At2 = (off) => off >= 0 ? readU128LE2(data, base + off) : 0n;
    const i128At = (off) => off >= 0 ? readI128LE2(data, base + off) : 0n;
    return {
      vault: readU128LE2(data, base + 0),
      insuranceFund: {
        balance: readU128LE2(data, base + l.engineInsuranceOff),
        feeRevenue: readU128LE2(data, base + l.engineInsuranceOff + 16),
        isolatedBalance: hasInsuranceIsolation ? readU128LE2(data, base + l.engineInsuranceIsolatedOff) : 0n,
        isolationBps: hasInsuranceIsolation ? readU16LE2(data, base + l.engineInsuranceIsolationBpsOff) : 0
      },
      currentSlot: readU64LE2(data, base + l.engineCurrentSlotOff),
      // engineFundingIndexOff is -1 on V12_15/17/19 (this field doesn't exist in those
      // engine structs) — guard the same way the heavy parser does (slab.ts parseEngine)
      // or `base + (-1)` reads 16 bytes starting one byte before the engine region.
      fundingIndexQpbE6: l.engineFundingIndexOff >= 0 ? l.engineLastFundingSlotOff >= 0 && l.engineLastFundingSlotOff - l.engineFundingIndexOff === 8 ? BigInt(readI64LE2(data, base + l.engineFundingIndexOff)) : readI128LE2(data, base + l.engineFundingIndexOff) : 0n,
      lastFundingSlot: u64At(l.engineLastFundingSlotOff),
      fundingRateBpsPerSlotLast: i64At(l.engineFundingRateBpsOff),
      fundingRateE9: 0n,
      marketMode: null,
      lastCrankSlot: u64At(l.engineLastCrankSlotOff),
      maxCrankStalenessSlots: u64At(l.engineMaxCrankStalenessOff),
      totalOpenInterest: u128At2(l.engineTotalOiOff),
      longOi: u128At2(l.engineLongOiOff),
      shortOi: u128At2(l.engineShortOiOff),
      cTot: readU128LE2(data, base + l.engineCTotOff),
      pnlPosTot: readU128LE2(data, base + l.enginePnlPosTotOff),
      pnlMaturedPosTot: 0n,
      liqCursor: u16At(l.engineLiqCursorOff),
      gcCursor: u16At(l.engineGcCursorOff),
      lastSweepStartSlot: u64At(l.engineLastSweepStartOff),
      lastSweepCompleteSlot: u64At(l.engineLastSweepCompleteOff),
      crankCursor: u16At(l.engineCrankCursorOff),
      sweepStartIdx: u16At(l.engineSweepStartIdxOff),
      lifetimeLiquidations: u64At(l.engineLifetimeLiquidationsOff),
      lifetimeForceCloses: u64At(l.engineLifetimeForceClosesOff),
      netLpPos: i128At(l.engineNetLpPosOff),
      lpSumAbs: u128At2(l.engineLpSumAbsOff),
      lpMaxAbs: u128At2(l.engineLpMaxAbsOff),
      lpMaxAbsSweep: u128At2(l.engineLpMaxAbsSweepOff),
      emergencyOiMode: l.engineEmergencyOiModeOff >= 0 ? data[base + l.engineEmergencyOiModeOff] !== 0 : false,
      emergencyStartSlot: u64At(l.engineEmergencyStartSlotOff),
      lastBreakerSlot: u64At(l.engineLastBreakerSlotOff),
      markPriceE6: u64At(l.engineMarkPriceOff),
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
  throw new Error(`parseEngineLight: unrecognized slab layout (isV0=${isV0})`);
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
      addresses.push(new PublicKey11(entry.slab_address));
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
      addresses.push(new PublicKey11(entry.slabAddress));
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
import { PublicKey as PublicKey12 } from "@solana/web3.js";
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
function computeDexSpotPriceE6(dexType, data, vaultData, decimals, solPriceE6) {
  switch (dexType) {
    case "pumpswap":
      if (!vaultData) throw new Error("PumpSwap requires vaultData (base and quote vault accounts)");
      if (!decimals) {
        throw new Error("PumpSwap requires decimals { base, quote } (mint decimals)");
      }
      return computePumpSwapPriceE6(data, vaultData, decimals, solPriceE6);
    case "raydium-clmm":
      return computeRaydiumClmmPriceE6(data);
    case "meteora-dlmm":
      if (!decimals) {
        throw new Error("Meteora DLMM requires decimals { base, quote } (mint decimals)");
      }
      return computeMeteoraDlmmPriceE6(data, decimals.base, decimals.quote);
  }
}
var SPL_MINT_DECIMALS_OFFSET = 44;
async function fetchMintDecimals(connection, mint) {
  const info = await connection.getAccountInfo(mint);
  if (!info) {
    throw new Error(`fetchMintDecimals: account not found for mint ${mint.toBase58()}`);
  }
  if (info.data.length <= SPL_MINT_DECIMALS_OFFSET) {
    throw new Error(
      `fetchMintDecimals: account data too short (${info.data.length} bytes) for mint ${mint.toBase58()}`
    );
  }
  return info.data[SPL_MINT_DECIMALS_OFFSET];
}
var WSOL_MINT = new PublicKey12("So11111111111111111111111111111111111111112");
var PUMPSWAP_MIN_LEN = 203;
function parsePumpSwapPool(poolAddress, data) {
  if (data.length < PUMPSWAP_MIN_LEN) {
    throw new Error(`PumpSwap pool data too short: ${data.length} < ${PUMPSWAP_MIN_LEN}`);
  }
  return {
    dexType: "pumpswap",
    poolAddress,
    baseMint: new PublicKey12(data.slice(43, 75)),
    quoteMint: new PublicKey12(data.slice(75, 107)),
    baseVault: new PublicKey12(data.slice(139, 171)),
    quoteVault: new PublicKey12(data.slice(171, 203))
  };
}
var SPL_TOKEN_AMOUNT_MIN_LEN = 72;
function computePumpSwapPriceE6(poolData, vaultData, decimals, solPriceE6) {
  if (poolData.length < PUMPSWAP_MIN_LEN) {
    throw new Error(`PumpSwap pool data too short: ${poolData.length} < ${PUMPSWAP_MIN_LEN}`);
  }
  if (vaultData.base.length < SPL_TOKEN_AMOUNT_MIN_LEN) {
    throw new Error(`PumpSwap base vault data too short: ${vaultData.base.length} < ${SPL_TOKEN_AMOUNT_MIN_LEN}`);
  }
  if (vaultData.quote.length < SPL_TOKEN_AMOUNT_MIN_LEN) {
    throw new Error(`PumpSwap quote vault data too short: ${vaultData.quote.length} < ${SPL_TOKEN_AMOUNT_MIN_LEN}`);
  }
  assertTokenDecimals("PumpSwap", "base", decimals.base);
  assertTokenDecimals("PumpSwap", "quote", decimals.quote);
  const baseDv = new DataView(vaultData.base.buffer, vaultData.base.byteOffset, vaultData.base.byteLength);
  const quoteDv = new DataView(vaultData.quote.buffer, vaultData.quote.byteOffset, vaultData.quote.byteLength);
  const baseAmount = readU64LE3(baseDv, 64);
  const quoteAmount = readU64LE3(quoteDv, 64);
  if (baseAmount === 0n) {
    throw new Error(
      "PumpSwap pool has zero base reserves \u2014 uninitialized or fully drained; refusing to report a price"
    );
  }
  const baseScale = 10n ** BigInt(decimals.base);
  const quoteScale = 10n ** BigInt(decimals.quote);
  const quotePerBaseE6 = quoteAmount * baseScale * 1000000n / (quoteScale * baseAmount);
  const quoteMint = new PublicKey12(poolData.slice(75, 107));
  if (quoteMint.equals(WSOL_MINT)) {
    if (solPriceE6 === void 0) {
      throw new Error(
        "PumpSwap: pool is WSOL-quoted but no solPriceE6 was supplied \u2014 cannot convert to USD. Pass the current SOL/USD price (e6) to computeDexSpotPriceE6."
      );
    }
    return quotePerBaseE6 * solPriceE6 / 1000000n;
  }
  return quotePerBaseE6;
}
var RAYDIUM_CLMM_MIN_LEN = 269;
function parseRaydiumClmmPool(poolAddress, data) {
  if (data.length < RAYDIUM_CLMM_MIN_LEN) {
    throw new Error(`Raydium CLMM pool data too short: ${data.length} < ${RAYDIUM_CLMM_MIN_LEN}`);
  }
  return {
    dexType: "raydium-clmm",
    poolAddress,
    baseMint: new PublicKey12(data.slice(73, 105)),
    quoteMint: new PublicKey12(data.slice(105, 137))
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
  const dv4 = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decimals0 = data[233];
  const decimals1 = data[234];
  if (decimals0 > MAX_TOKEN_DECIMALS || decimals1 > MAX_TOKEN_DECIMALS) {
    throw new Error(
      `Raydium CLMM: decimals out of range (${decimals0}, ${decimals1}); max ${MAX_TOKEN_DECIMALS}`
    );
  }
  const sqrtPriceX64 = readU128LE3(dv4, 253);
  if (sqrtPriceX64 === 0n) {
    throw new Error(
      "Raydium CLMM pool has sqrt_price_x64 = 0 \u2014 uninitialized; refusing to report a price"
    );
  }
  const sq1e6 = sqrtPriceX64 * sqrtPriceX64 * 1000000n;
  const decimalDiff = 6 + decimals0 - decimals1;
  const adjustedDiff = decimalDiff - 6;
  if (adjustedDiff >= 0) {
    return sq1e6 * 10n ** BigInt(adjustedDiff) >> 128n;
  } else {
    return sq1e6 / ((1n << 128n) * 10n ** BigInt(-adjustedDiff));
  }
}
var METEORA_DLMM_MIN_LEN = 152;
function parseMeteoraPool(poolAddress, data) {
  if (data.length < METEORA_DLMM_MIN_LEN) {
    throw new Error(`Meteora DLMM pool data too short: ${data.length} < ${METEORA_DLMM_MIN_LEN}`);
  }
  return {
    dexType: "meteora-dlmm",
    poolAddress,
    baseMint: new PublicKey12(data.slice(88, 120)),
    quoteMint: new PublicKey12(data.slice(120, 152))
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
  const dv4 = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const binStep = dv4.getUint16(80, true);
  const activeId = dv4.getInt32(76, true);
  if (binStep === 0) {
    throw new Error(
      "Meteora DLMM pair has binStep = 0 \u2014 uninitialized; refusing to report a price"
    );
  }
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
    if (result === 0n) {
      throw new Error(
        "Meteora DLMM inverse-price computation produced a zero divisor; refusing to report a price"
      );
    }
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
function readU64LE3(dv4, offset) {
  const lo = BigInt(dv4.getUint32(offset, true));
  const hi = BigInt(dv4.getUint32(offset + 4, true));
  return lo | hi << 32n;
}
function readU128LE3(dv4, offset) {
  const lo = readU64LE3(dv4, offset);
  const hi = readU64LE3(dv4, offset + 8);
  return lo | hi << 64n;
}

// src/solana/oracle.ts
var CHAINLINK_MIN_SIZE = 248;
var MAX_DECIMALS = 18;
var CHAINLINK_DECIMALS_OFFSET = 138;
var CHAINLINK_TIMESTAMP_OFFSET = 208;
var CHAINLINK_ANSWER_OFFSET = 216;
function readU82(data, off) {
  return data[off];
}
function readBigInt64LE(data, off) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigInt64(off, true);
}
function readBigUint64LE(data, off) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(off, true);
}
function readU32LE2(data, off) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(off, true);
}
var DEFAULT_FUTURE_TOLERANCE_SECONDS = 60;
function parseChainlinkPrice(data, options) {
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
  const answer = readBigInt64LE(data, CHAINLINK_ANSWER_OFFSET + 8) << 64n | readBigUint64LE(data, CHAINLINK_ANSWER_OFFSET);
  if (answer <= 0n) {
    throw new Error(
      `Oracle price is non-positive: ${answer}`
    );
  }
  const price = answer;
  const updatedAt = readU32LE2(data, CHAINLINK_TIMESTAMP_OFFSET);
  if (options?.maxStalenessSeconds !== void 0) {
    if (updatedAt <= 0) {
      throw new Error(
        `Oracle has no valid publish timestamp (updatedAt=${updatedAt})`
      );
    }
    const now = Math.floor(Date.now() / 1e3);
    const age = now - updatedAt;
    const futureTolerance = options.futureToleranceSeconds ?? DEFAULT_FUTURE_TOLERANCE_SECONDS;
    if (age < -futureTolerance) {
      throw new Error(
        `Oracle publish timestamp is ${-age}s in the future (tolerance ${futureTolerance}s) \u2014 check the feed or the local clock`
      );
    }
    if (age > options.maxStalenessSeconds) {
      throw new Error(
        `Oracle price is stale: last updated ${age}s ago (max ${options.maxStalenessSeconds}s)`
      );
    }
  }
  return { price, decimals, updatedAt: updatedAt > 0 ? updatedAt : void 0 };
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
import { PublicKey as PublicKey13 } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID as TOKEN_PROGRAM_ID3 } from "@solana/spl-token";
var TOKEN_2022_PROGRAM_ID = new PublicKey13(
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
import { PublicKey as PublicKey14, SystemProgram as SystemProgram2, SYSVAR_RENT_PUBKEY as SYSVAR_RENT_PUBKEY2, SYSVAR_CLOCK_PUBKEY as SYSVAR_CLOCK_PUBKEY2 } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID as TOKEN_PROGRAM_ID4, TOKEN_2022_PROGRAM_ID as TOKEN_2022_PROGRAM_ID2 } from "@solana/spl-token";
var STAKE_PROGRAM_IDS = {
  devnet: "A6DVNubvzMMETQinK6bipekkaTTrkUu2RMw2kBoJrdkE",
  mainnet: "DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F"
};
Object.freeze(STAKE_PROGRAM_IDS);
var KNOWN_STAKE_PROGRAM_IDS = /* @__PURE__ */ new Set([
  ...Object.values(STAKE_PROGRAM_IDS),
  PROGRAM_IDS_DEVNET_V1.vault
  // v1 / close-only devnet stake program (still live)
]);
function getStakeProgramId(network) {
  if (!network) {
    const override = safeEnv("STAKE_PROGRAM_ID");
    if (override) {
      if (!KNOWN_STAKE_PROGRAM_IDS.has(override) && safeEnv("PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE") !== "1") {
        throw new Error(
          `[percolator-sdk] STAKE_PROGRAM_ID env var "${override}" is not a known stake program address. Allowed values: ${[...KNOWN_STAKE_PROGRAM_IDS].join(", ")}. Pass an explicit network argument, or set PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1 to intentionally allow an unlisted program (e.g. a fresh pre-deploy address).`
        );
      }
      console.warn(
        `[percolator-sdk] STAKE_PROGRAM_ID env override active: ${override}`
      );
      return new PublicKey14(override);
    }
  }
  const detectedNetwork = network ?? (() => {
    const n = safeEnv("NEXT_PUBLIC_DEFAULT_NETWORK")?.toLowerCase() ?? safeEnv("NETWORK")?.toLowerCase() ?? "";
    if (n === "mainnet" || n === "mainnet-beta") return "mainnet";
    if (n === "devnet") return "devnet";
    throw new Error(
      "getStakeProgramId: cannot determine the network. Neither NETWORK nor NEXT_PUBLIC_DEFAULT_NETWORK is set (in a browser bundle process.env is empty, so this is expected there; in Node it means the variable is unset). Pass an explicit network argument \u2014 getStakeProgramId('devnet') or getStakeProgramId('mainnet') \u2014 or set STAKE_PROGRAM_ID to override the address directly. Refusing to guess: this resolves a fund-custody program address, and callers that derive PDAs from it (deriveStakePool, deriveStakeVaultAuth, deriveDepositPda) would otherwise produce addresses for the wrong network."
    );
  })();
  const id = STAKE_PROGRAM_IDS[detectedNetwork];
  if (!id) {
    throw new Error(
      `Stake program not deployed on ${detectedNetwork}. Set STAKE_PROGRAM_ID env var or wait for DevOps to deploy and update STAKE_PROGRAM_IDS.mainnet.`
    );
  }
  return new PublicKey14(id);
}
var STAKE_PROGRAM_ID = new PublicKey14(STAKE_PROGRAM_IDS.devnet);
var STAKE_IX = {
  InitPool: 0,
  Deposit: 1,
  Withdraw: 2,
  FlushToInsurance: 3,
  UpdateConfig: 4,
  /**
   * ProposeAdmin (tag 5) — step 1 of two-step `pool.admin` rotation. The
   * CURRENT admin proposes a new admin (written to `pool.pending_admin`); the
   * proposed admin gains no authority until AcceptAdmin (tag 6). Proposing the
   * zero pubkey CANCELS an outstanding proposal.
   *
   * BREAKING vs the deployed percolator-vault program: tag 5 there is the
   * removed `TransferAdmin` (one-step, rejects on-chain). Do NOT confuse with
   * wrapper marketauth rotation (a completely different key, done via the
   * wrapper's own UpdateAuthority tag 32, CPI'd from stake InitPool).
   *
   * Wire: tag(1) + new_admin(32) = 33 bytes.
   * Accounts: [currentAdmin(signer), poolPda(writable)]
   */
  ProposeAdmin: 5,
  /**
   * AcceptAdmin (tag 6) — step 2 of two-step `pool.admin` rotation. The
   * PENDING admin signs to take ownership; requires an outstanding proposal
   * and the signer to equal `pool.pending_admin`.
   *
   * BREAKING vs the deployed percolator-vault program: tag 6 there is the
   * removed `AdminSetOracleAuthority` (rejects on-chain).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [pendingAdmin(signer), poolPda(writable)]
   */
  AcceptAdmin: 6,
  /**
   * ProposeCooldownIncrease (tag 7) — step 1 of the #242 cooldown-increase
   * timelock. Proposes a NEW (larger) `cooldown_slots`; takes effect only
   * after CommitCooldownIncrease is called >= TIMELOCK_SLOTS later, guaranteeing
   * LP holders an exit window. A decrease/unchanged value is rejected here
   * (use UpdateConfig, which applies decreases immediately).
   *
   * BREAKING vs the deployed percolator-vault program: tag 7 there is the
   * removed `AdminSetRiskThreshold` (rejects on-chain).
   *
   * Wire: tag(1) + new_cooldown_slots(u64) = 9 bytes.
   * Accounts: [admin(signer), poolPda(writable), clockSysvar]
   */
  ProposeCooldownIncrease: 7,
  /**
   * CommitCooldownIncrease (tag 8) — step 2 of the #242 timelock. Applies the
   * pending cooldown increase; rejects if TIMELOCK_SLOTS has not elapsed.
   *
   * BREAKING vs the deployed percolator-vault program: tag 8 there is the
   * removed `AdminSetMaintenanceFee` (rejects on-chain).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda(writable), clockSysvar]
   */
  CommitCooldownIncrease: 8,
  /**
   * CancelCooldownIncrease (tag 9) — withdraws an outstanding #242 cooldown
   * proposal.
   *
   * BREAKING vs the deployed percolator-vault program: tag 9 there is the
   * removed `AdminResolveMarket` (rejects on-chain).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda(writable)]
   */
  CancelCooldownIncrease: 9,
  /** @deprecated Alias for ProposeAdmin — the OLD percolator-vault semantics
   *  (one-step TransferAdmin) no longer apply; tag 5 is now ProposeAdmin. */
  TransferAdmin: 5,
  /** @deprecated Alias for AcceptAdmin — the OLD percolator-vault semantics
   *  (AdminSetOracleAuthority) no longer apply; tag 6 is now AcceptAdmin. */
  AdminSetOracleAuthority: 6,
  /** @deprecated Alias for ProposeCooldownIncrease — the OLD percolator-vault
   *  semantics (AdminSetRiskThreshold) no longer apply; tag 7 is now
   *  ProposeCooldownIncrease with a DIFFERENT wire format (u64, not removed-stub). */
  AdminSetRiskThreshold: 7,
  /** @deprecated Alias for CommitCooldownIncrease — the OLD percolator-vault
   *  semantics (AdminSetMaintenanceFee) no longer apply; tag 8 is now
   *  CommitCooldownIncrease. */
  AdminSetMaintenanceFee: 8,
  /** @deprecated Alias for CancelCooldownIncrease — the OLD percolator-vault
   *  semantics (AdminResolveMarket) no longer apply; tag 9 is now
   *  CancelCooldownIncrease. */
  AdminResolveMarket: 9,
  /**
   * ReturnInsurance (tag 10) — unchanged wire/semantics vs the deployed
   * percolator-vault program: transfer withdrawn insurance back into the pool
   * vault (admin calls wrapper WithdrawInsurance directly first, then this
   * books admin-ATA -> pool-vault).
   */
  ReturnInsurance: 10,
  /** @deprecated Legacy alias for ReturnInsurance. */
  AdminWithdrawInsurance: 10,
  /** @deprecated Tombstoned in BOTH lineages (was an admin CPI proxy —
   *  SetInsurancePolicy). This tag rejects on-chain in the adopted lineage too. */
  AdminSetInsurancePolicy: 11,
  /** PERC-272: Accrue trading fees to LP vault. Unchanged vs deployed vault. */
  AccrueFees: 12,
  /** PERC-272: Init pool in trading LP mode. Unchanged vs deployed vault. */
  InitTradingPool: 13,
  /** PERC-313: Set HWM config (enable + floor bps). Unchanged vs deployed vault. */
  AdminSetHwmConfig: 14,
  /**
   * AdminSetTrancheConfig (tag 15) — enable/configure senior-junior LP
   * tranches. Sets `junior_fee_mult_bps`.
   *
   * BREAKING vs the deployed percolator-vault program: tag 15 there is
   * BindInsuranceAuthority (moved to tag 19 in the adopted lineage — see
   * below). Sending this payload against the DEPLOYED vault program would
   * execute BindInsuranceAuthority instead; only send it against the
   * ADOPTED percolator-stake lineage.
   *
   * Wire: tag(1) + junior_fee_mult_bps(u16) = 3 bytes.
   * Accounts: [admin(signer), poolPda(writable)]
   */
  AdminSetTrancheConfig: 15,
  /**
   * DepositJunior (tag 16) — deposit into the junior (first-loss) tranche.
   * Same account shape as Deposit (tag 1).
   *
   * BREAKING vs the deployed percolator-vault program: tag 16 is UNHANDLED
   * there (rejects). Live only on the adopted lineage.
   *
   * Wire: tag(1) + amount(u64) = 9 bytes.
   */
  DepositJunior: 16,
  /**
   * BindInsuranceAuthority (tag 19 / 0x13) — FIND-4 fix, MOVED from tag 15
   * (0x0F) in the deployed percolator-vault program.
   *
   * Binds the vault_auth PDA as BOTH the wrapper's asset-0 insurance_authority
   * AND insurance_operator via two CPIs to UpdateAssetAuthority (tag 65,
   * kind=1 INSURANCE then kind=2 INSURANCE_OPERATOR) — the adopted lineage
   * binds both in one call, unlike the deployed vault program which only
   * bound insurance_authority. The human admin signs the outer tx as the
   * current authority/operator; vault_auth signs via invoke_signed.
   *
   * Wire: tag(1) = 0x13 — no payload beyond the tag byte.
   * Accounts: [admin(signer), poolPda, vaultAuth, slab(writable), percolatorProgram]
   */
  BindInsuranceAuthority: 19,
  /**
   * RotateInsuranceAuthority (tag 20) — admin-gated migration/incident
   * escape that moves the market's `insurance_authority` OFF our vault_auth
   * PDA to an admin-specified `newTarget`. The PDA signs as the CURRENT
   * authority (invoke_signed); newTarget co-signs the outer tx as the NEW
   * authority. NEW in the adopted lineage — no equivalent in the deployed
   * percolator-vault program (which has no un-bind escape at all).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda, vaultAuth, newTarget(signer), slab(writable), percolatorProgram]
   */
  RotateInsuranceAuthority: 20,
  /**
   * BurnAssetAdmin (tag 21) — IRREVERSIBLE removal of the admin's rotate-back
   * capability. CPIs UpdateAssetAuthority(kind=0 ASSET_ADMIN, new_pubkey=[0;32]).
   * After this, no key can rotate ANY per-asset authority back to an
   * admin-controlled key. Call ONCE per market, only after BindInsuranceAuthority
   * has completed. NEW in the adopted lineage.
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer, writable), poolPda(writable), vaultAuth(placeholder), slab(writable), percolatorProgram]
   */
  BurnAssetAdmin: 21,
  /**
   * RotateInsuranceOperator (tag 22) — analogous to RotateInsuranceAuthority
   * (tag 20) but for `insurance_operator` (kind=2). Part of the no-lockout
   * migration sequence before a final BurnAssetAdmin. NEW in the adopted
   * lineage.
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda, vaultAuth, newTarget(signer), slab(writable), percolatorProgram]
   */
  RotateInsuranceOperator: 22,
  /**
   * RecoverFlushedInsurance (tag 23) — PERMISSIONLESS recovery of tokens from
   * the wrapper's insurance fund back into the stake pool vault, via a CPI to
   * wrapper tag 57 `WithdrawInsuranceAsset` (gated on insurance_operator ==
   * vault_auth PDA). Survives BurnAssetAdmin because tag 57 gates on
   * insurance_operator, not asset_admin. `amount` capped to
   * `total_flushed - total_returned`; funds can only land in `pool.vault`.
   * NEW in the adopted lineage.
   *
   * Wire: tag(1) + amount(u64) = 9 bytes.
   * Accounts: [caller(no signer check), poolPda(writable), poolVault(writable),
   *   vaultAuth, wrapperMarket(writable), wrapperVault(writable), wrapperVaultAuth,
   *   tokenProgram, percolatorProgram]
   */
  RecoverFlushedInsurance: 23,
  /**
   * AdminResolveMarketCpi (tag 24) — CPI proxy for the wrapper's ResolveMarket
   * (wrapper tag 19). InitPool rotates `cfg.marketauth` to this pool's PDA, so
   * only a CPI signed by that PDA can ever call the wrapper's ResolveMarket;
   * without this proxy every stake-initialized market would be permanently
   * stuck in Live mode. The pool PDA signs the wrapper CPI via
   * `invoke_signed`; no local stake-side state is mutated (SetMarketResolved,
   * tag 18, remains the separate, explicit local bookkeeping step). NEW in
   * percolator-stake (see src/instruction.rs / src/processor.rs
   * `process_admin_resolve_market`, tag 24).
   *
   * NOTE on the name: the on-chain enum variant is literally
   * `AdminResolveMarket` (matching the DEPRECATED tag-9 name from the OLD
   * percolator-vault lineage, see `AdminResolveMarket: 9` above / its throwing
   * `encodeStakeAdminResolveMarket()` alias). This key is suffixed `Cpi` to
   * avoid re-using that already-claimed object key/export name — the tag-9
   * alias and this tag-24 instruction are unrelated aside from sharing an
   * on-chain name across two different lineages.
   *
   * Wire: tag(1) = 24 — no payload beyond the tag byte.
   * Accounts: [admin(signer), poolPda, slab(writable), percolatorProgram]
   */
  AdminResolveMarketCpi: 24,
  /**
   * SetMarketResolved (tag 18) — admin marks the pool as market-resolved
   * (blocks new deposits). Call after resolving the market on the wrapper
   * directly.
   *
   * BREAKING vs the deployed percolator-vault program: tag 18 is UNHANDLED
   * there (rejects). Live only on the adopted lineage.
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda(writable)]
   */
  SetMarketResolved: 18,
  /**
   * AdminUpdateFeeSplit (tag 25) — CPI proxy for the wrapper's UpdateFeeSplit
   * (wrapper tag 86). GROUP A: the wrapper gate is `cfg.marketauth`, which
   * `StakeInitPool` irreversibly rotates to the pool PDA, so the pool PDA
   * signs the CPI via invoke_signed.
   *
   * Wire: tag(1) + creator_share_bps(u16) + lp_share_bps(u16) +
   * insurance_share_bps(u16) = 7 bytes.
   * Accounts: [admin(signer), poolPda, slab(writable), percolatorProgram]
   *
   * Share validation is the WRAPPER's (`policy_v16::validate_fee_split`) and is
   * deliberately not duplicated stake-side — a bad split surfaces as wrapper
   * Custom(52)/Custom(51) through the CPI.
   */
  AdminUpdateFeeSplit: 25,
  /**
   * AdminUpdateMaintenanceFeePerSlot (tag 26) — CPI proxy for the wrapper's
   * UpdateMaintenanceFeePerSlot (wrapper tag 88). GROUP A, same accounts and
   * signer model as tag 25.
   *
   * Wire: tag(1) + maintenance_fee_per_slot(u128) = 17 bytes.
   * Accounts: [admin(signer), poolPda, slab(writable), percolatorProgram]
   *
   * ⚠ THE PAYLOAD IS u128, NOT u64 — the stake program itself rejects a
   * payload whose `rest.len() != 16`, and the wrapper decodes tag 88 with
   * `read_u128`.
   */
  AdminUpdateMaintenanceFeePerSlot: 26,
  /**
   * AdminUpdateBackingFeePolicy (tag 27) — CPI proxy for the wrapper's
   * UpdateBackingFeePolicy (wrapper tag 51). GROUP B: the wrapper gate is
   * ASSET 0's `insurance_authority`, which `BindInsuranceAuthority` moves to
   * the `vault_auth` PDA, so `vault_auth` (not the pool PDA) signs the CPI.
   *
   * THE FEE-SPLIT UNBLOCKER: wrapper tag 51 is the setter for
   * `backing_trade_fee_bps`. Once bound, this CPI is the only way to reach it.
   *
   * Wire: tag(1) + domain(u16) + fee_bps(u16) + insurance_share_bps(u16) = 7 bytes.
   * Accounts: [admin(signer), poolPda, vaultAuth, slab(writable), percolatorProgram]
   */
  AdminUpdateBackingFeePolicy: 27,
  /**
   * AdminUpdateTradeFeePolicy (tag 28) — CPI proxy for the wrapper's
   * UpdateTradeFeePolicy (wrapper tag 55). GROUP B, same accounts and signer
   * model as tag 27.
   *
   * Wire: tag(1) + trade_fee_base_bps(u64) = 9 bytes.
   * Accounts: [admin(signer), poolPda, vaultAuth, slab(writable), percolatorProgram]
   *
   * ⚠ Note the type asymmetry with tag 26: wrapper tag 55 decodes with
   * `read_u64`, wrapper tag 88 with `read_u128`.
   */
  AdminUpdateTradeFeePolicy: 28,
  /**
   * RecoverTerminalInsurance (F-9, percolator-stake #301 `d13b5a9`). PERMISSIONLESS:
   * returns a stake-bound market's insurance budget to stakers once the wrapper
   * market is Resolved (or a CloseSlab tombstone). CPIs wrapper tag 41 with
   * `vault_auth` as authority and `pool.vault` as the only destination, sweeps an
   * optional stray `vault_auth`-owned token account, and books the vault surplus.
   *
   * Wire: tag(1) + amount(u64) = 9 bytes. `amount` = 0 books/sweeps only (also
   * valid after CloseSlab). Accounts: {@link recoverTerminalInsuranceAccounts}.
   * Errors: 30 MarketNotTerminal, 31 NothingToRecover (treat as done), wrapper 21
   * (over capacity / cooldown / portfolios remain — retry later), 15 CpiFailed,
   * 32 UnsupportedWrapperLayout (non-retryable). Relaunch stake: F-9 head `d13b5a9`.
   */
  RecoverTerminalInsurance: 29,
  /**
   * AdminCloseSlab (F-9). `pool.admin`-signed CPI proxy for the wrapper's
   * CloseSlab (tag 13); the pool PDA is the marketauth and signs. The sweep
   * lands in a pool-PDA-owned token account (index 5, the caller creates it)
   * and is booked into `pool.vault`; the rent refund goes to the admin. Requires
   * a Resolved market (30 MarketNotTerminal). On a P1 wrapper it may return Ok
   * WITHOUT closing — repeat until the market is a tombstone.
   *
   * Wire: tag(1) = 1 byte. Accounts: {@link adminCloseSlabAccounts}. Also returns
   * 32 UnsupportedWrapperLayout (non-retryable). Relaunch stake: F-9 head `d13b5a9`.
   */
  AdminCloseSlab: 30
};
Object.freeze(STAKE_IX);
var STAKE_ERRORS = {
  0: "Pool already initialized \u2014 use a different slab address or check if InitPool was already called",
  1: "Pool not initialized \u2014 call InitPool first to create the stake pool",
  2: "Unauthorized \u2014 you must be the pool admin to perform this action",
  3: "Cooldown not elapsed \u2014 wait for the cooldown period before withdrawing again",
  4: "Insufficient LP tokens \u2014 you don't have enough LP tokens to burn",
  5: "Zero amount \u2014 deposit and withdrawal amounts must be greater than zero",
  6: "Arithmetic overflow \u2014 pool values exceeded u64 bounds, operation blocked",
  7: "Invalid mint \u2014 LP mint doesn't match the pool's LP mint",
  8: "Market is resolved \u2014 no new deposits allowed after resolution",
  9: "Deposit cap exceeded \u2014 pool has reached its maximum deposit limit",
  10: "Invalid PDA \u2014 account is not a valid PDA for the expected seed",
  11: "Deprecated (was AdminAlreadyTransferred) \u2014 code kept for stable numbering; should not occur",
  12: "Deprecated (was AdminNotTransferred) \u2014 code kept for stable numbering; should not occur",
  13: "Insufficient vault balance \u2014 vault doesn't have enough collateral for this withdrawal",
  14: "Invalid percolator program \u2014 percolator program ID doesn't match",
  15: "CPI to percolator failed \u2014 the cross-program invoke to percolator failed",
  16: "Invalid account \u2014 account is not owned by the expected program or is not writable",
  17: "Pool mode mismatch \u2014 operation not valid for this pool's mode (e.g., AccrueFees on insurance pool)",
  18: "Withdrawal blocked \u2014 would breach high-water mark floor protection",
  19: "Tranches not enabled \u2014 senior/junior tranches are not enabled on this pool",
  20: "Junior balance insufficient \u2014 junior tranche doesn't have enough balance for this operation",
  21: "Wrong tranche \u2014 deposit already belongs to a different tranche",
  22: "Zero shares minted \u2014 deposit amount too small to mint any LP at the current share price; increase the amount",
  23: "No pending admin \u2014 there is no admin transfer to accept (propose one first, or it was cancelled)",
  24: "Insurance loss outstanding \u2014 junior tranche deposits are paused until the flushed insurance is returned (total_flushed > total_returned)",
  25: "Cooldown increase requires timelock \u2014 a cooldown_slots INCREASE must go through ProposeCooldownIncrease -> wait -> CommitCooldownIncrease, not UpdateConfig (decreases are still immediate via UpdateConfig)",
  26: "Timelock not elapsed \u2014 CommitCooldownIncrease was called before the required timelock window had passed since ProposeCooldownIncrease; LP holders are still inside their exit window",
  27: "No pending cooldown proposal \u2014 CommitCooldownIncrease / CancelCooldownIncrease called with no active ProposeCooldownIncrease proposal outstanding",
  28: "Deposit below minimum liquidity \u2014 the pool's first-ever deposit must exceed MINIMUM_LIQUIDITY so a permanent dead-share floor can be locked (N7 anti-inflation hardening); deposit a larger amount",
  29: "No real LP holders \u2014 AccrueFees refused because the pool's LP supply is only the N7 MINIMUM_LIQUIDITY dead-share floor (total_lp_supply <= MINIMUM_LIQUIDITY). Fees booked now would belong to shares nobody can redeem; nothing is booked and the fee tokens stay in the vault until the first accrual after a real staker deposits (F3 dead-share guard, percolator-stake feat/p1-stake-f3-dead-share-guard).",
  30: "Market not terminal (F-9) \u2014 RecoverTerminalInsurance (tag 29) needs the wrapper market Resolved or a CloseSlab tombstone, and a non-zero amount needs Resolved (not Closed); AdminCloseSlab (tag 30) needs Resolved. While Live, use RecoverFlushedInsurance (tag 23)",
  32: "Unsupported wrapper layout (F-9, NOT retryable) \u2014 the bound wrapper market account is not the layout this stake program pins (magic, VERSION 18, kind, minimum length, a known mode byte), so its engine mode cannot be trusted. RecoverTerminalInsurance (29), AdminCloseSlab (30) and the mode-0 Deposit/DepositJunior path refuse. A wrapper layout bump needs a coordinated stake upgrade; retrying will not help",
  31: "Nothing to recover (F-9) \u2014 RecoverTerminalInsurance moved no tokens and booked nothing (amount 0, no stray account, no unbooked vault surplus). Keepers should treat this as done"
};
Object.freeze(STAKE_ERRORS);
var TEXT2 = new TextEncoder();
function deriveStakePool(slab, programId) {
  return PublicKey14.findProgramAddressSync(
    [TEXT2.encode("stake_pool"), slab.toBytes()],
    programId ?? getStakeProgramId()
  );
}
function deriveStakeVaultAuth(pool, programId) {
  return PublicKey14.findProgramAddressSync(
    [TEXT2.encode("vault_auth"), pool.toBytes()],
    programId ?? getStakeProgramId()
  );
}
function deriveDepositPda(pool, user, programId) {
  return PublicKey14.findProgramAddressSync(
    [TEXT2.encode("stake_deposit"), pool.toBytes(), user.toBytes()],
    programId ?? getStakeProgramId()
  );
}
function readU64LE4(data, off) {
  const view2 = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view2.getBigUint64(
    off,
    /* littleEndian= */
    true
  );
}
function readU16LE3(data, off) {
  const view2 = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view2.getUint16(
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
  const big4 = BigInt(v);
  if (big4 < 0n) throw new Error(`u64Le: value must be non-negative, got ${big4}`);
  if (big4 > 0xFFFFFFFFFFFFFFFFn) throw new Error(`u64Le: value exceeds u64 max`);
  const arr = new Uint8Array(8);
  new DataView(arr.buffer).setBigUint64(0, big4, true);
  return arr;
}
function u128Le(v) {
  if (typeof v === "number" && !Number.isSafeInteger(v)) {
    throw new Error(`u128Le: number ${v} exceeds Number.MAX_SAFE_INTEGER \u2014 use BigInt`);
  }
  const big4 = BigInt(v);
  if (big4 < 0n) throw new Error(`u128Le: value must be non-negative, got ${big4}`);
  if (big4 > (1n << 128n) - 1n) throw new Error(`u128Le: value exceeds u128 max`);
  const arr = new Uint8Array(16);
  const view2 = new DataView(arr.buffer);
  view2.setBigUint64(0, big4 & 0xFFFFFFFFFFFFFFFFn, true);
  view2.setBigUint64(8, big4 >> 64n, true);
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
function encodeStakeProposeAdmin(newAdmin) {
  return concatBytes(
    new Uint8Array([STAKE_IX.ProposeAdmin]),
    newAdmin.toBytes()
  );
}
function encodeStakeAcceptAdmin() {
  return new Uint8Array([STAKE_IX.AcceptAdmin]);
}
function encodeStakeProposeCooldownIncrease(newCooldownSlots) {
  return concatBytes(
    new Uint8Array([STAKE_IX.ProposeCooldownIncrease]),
    u64Le(newCooldownSlots)
  );
}
function encodeStakeCommitCooldownIncrease() {
  return new Uint8Array([STAKE_IX.CommitCooldownIncrease]);
}
function encodeStakeCancelCooldownIncrease() {
  return new Uint8Array([STAKE_IX.CancelCooldownIncrease]);
}
function encodeStakeTransferAdmin() {
  throw new Error(
    "encodeStakeTransferAdmin: tag 5 is ProposeAdmin (two-step rotation) in the adopted percolator-stake lineage \u2014 use encodeStakeProposeAdmin(newAdmin) + encodeStakeAcceptAdmin() instead."
  );
}
function encodeStakeAdminSetOracleAuthority(newAuthority) {
  void newAuthority;
  throw new Error(
    "encodeStakeAdminSetOracleAuthority: tag 6 is AcceptAdmin in the adopted percolator-stake lineage \u2014 use encodeStakeAcceptAdmin() instead."
  );
}
function encodeStakeAdminSetRiskThreshold(newThreshold) {
  void newThreshold;
  throw new Error(
    "encodeStakeAdminSetRiskThreshold: tag 7 is ProposeCooldownIncrease in the adopted percolator-stake lineage \u2014 use encodeStakeProposeCooldownIncrease(newCooldownSlots) instead."
  );
}
function encodeStakeAdminSetMaintenanceFee(newFee) {
  void newFee;
  throw new Error(
    "encodeStakeAdminSetMaintenanceFee: tag 8 is CommitCooldownIncrease in the adopted percolator-stake lineage \u2014 use encodeStakeCommitCooldownIncrease() instead."
  );
}
function encodeStakeAdminResolveMarket() {
  throw new Error(
    "encodeStakeAdminResolveMarket: tag 9 is CancelCooldownIncrease in the adopted percolator-stake lineage \u2014 use encodeStakeCancelCooldownIncrease() instead."
  );
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
function encodeStakeBindInsuranceAuthority() {
  return new Uint8Array([STAKE_IX.BindInsuranceAuthority]);
}
function bindInsuranceAuthorityAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
function encodeStakeRotateInsuranceAuthority() {
  return new Uint8Array([STAKE_IX.RotateInsuranceAuthority]);
}
function encodeStakeRotateInsuranceOperator() {
  return new Uint8Array([STAKE_IX.RotateInsuranceOperator]);
}
function rotateInsuranceAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: false },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.newTarget, isSigner: true, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
function encodeStakeBurnAssetAdmin() {
  return new Uint8Array([STAKE_IX.BurnAssetAdmin]);
}
function burnAssetAdminAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: true },
    { pubkey: a.poolPda, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
function encodeStakeRecoverFlushedInsurance(amount) {
  return concatBytes(
    new Uint8Array([STAKE_IX.RecoverFlushedInsurance]),
    u64Le(amount)
  );
}
function recoverFlushedInsuranceAccounts(a) {
  return [
    { pubkey: a.caller, isSigner: false, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: true },
    { pubkey: a.poolVault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.wrapperMarket, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVault, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
function encodeStakeAdminResolveMarketCpi() {
  return new Uint8Array([STAKE_IX.AdminResolveMarketCpi]);
}
function adminResolveMarketCpiAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
function encodeStakeAdminUpdateFeeSplit(creatorShareBps, lpShareBps, insuranceShareBps) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminUpdateFeeSplit]),
    u16Le(creatorShareBps),
    u16Le(lpShareBps),
    u16Le(insuranceShareBps)
  );
}
function encodeStakeAdminUpdateMaintenanceFeePerSlot(maintenanceFeePerSlot) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminUpdateMaintenanceFeePerSlot]),
    u128Le(maintenanceFeePerSlot)
  );
}
function encodeStakeAdminUpdateBackingFeePolicy(domain, feeBps, insuranceShareBps) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminUpdateBackingFeePolicy]),
    u16Le(domain),
    u16Le(feeBps),
    u16Le(insuranceShareBps)
  );
}
function encodeStakeAdminUpdateTradeFeePolicy(tradeFeeBaseBps) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminUpdateTradeFeePolicy]),
    u64Le(tradeFeeBaseBps)
  );
}
function stakeGroupAProxyAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
var adminUpdateFeeSplitAccounts = stakeGroupAProxyAccounts;
var adminUpdateMaintenanceFeePerSlotAccounts = stakeGroupAProxyAccounts;
function stakeGroupBProxyAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: false },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
var adminUpdateBackingFeePolicyAccounts = stakeGroupBProxyAccounts;
var adminUpdateTradeFeePolicyAccounts = stakeGroupBProxyAccounts;
function encodeStakeAdminSetInsurancePolicy(authority, minWithdrawBase, maxWithdrawBps, cooldownSlots) {
  void authority;
  void minWithdrawBase;
  void maxWithdrawBps;
  void cooldownSlots;
  return removedStakeInstruction("encodeStakeAdminSetInsurancePolicy", STAKE_IX.AdminSetInsurancePolicy);
}
var STAKE_POOL_SIZE_V1 = 352;
var STAKE_POOL_SIZE_V2 = 384;
var STAKE_POOL_SIZE_V3 = 392;
var STAKE_POOL_SIZE_V4 = 408;
var STAKE_POOL_SIZE = STAKE_POOL_SIZE_V4;
var STAKE_POOL_DISCRIMINATOR = new Uint8Array([83, 80, 79, 79, 76, 95, 86, 49]);
var STAKE_POOL_CURRENT_VERSION = 4;
function decodeStakePool(data) {
  const isV4 = data.length >= STAKE_POOL_SIZE_V4;
  const isV3 = !isV4 && data.length >= STAKE_POOL_SIZE_V3;
  const isV2 = !isV4 && !isV3 && data.length >= STAKE_POOL_SIZE_V2;
  const isV1 = !isV4 && !isV3 && !isV2 && data.length >= STAKE_POOL_SIZE_V1;
  if (!isV4 && !isV3 && !isV2 && !isV1) {
    throw new Error(`StakePool data too short: ${data.length} < ${STAKE_POOL_SIZE_V1}`);
  }
  const reservedOffset = isV1 ? 288 : 320;
  requireDiscriminator("StakePool", data, reservedOffset, STAKE_POOL_DISCRIMINATOR);
  const version = data[reservedOffset + 8];
  const expectedVersion = isV4 ? 4 : isV3 ? 3 : isV2 ? 2 : 1;
  if (version !== expectedVersion) {
    throw new Error(`StakePool unsupported version: ${version} !== ${expectedVersion}`);
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
  const slab = new PublicKey14(bytes.subarray(off, off + 32));
  off += 32;
  const admin = new PublicKey14(bytes.subarray(off, off + 32));
  off += 32;
  const collateralMint = new PublicKey14(bytes.subarray(off, off + 32));
  off += 32;
  const lpMint = new PublicKey14(bytes.subarray(off, off + 32));
  off += 32;
  const vault = new PublicKey14(bytes.subarray(off, off + 32));
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
  const percolatorProgram = new PublicKey14(bytes.subarray(off, off + 32));
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
  let pendingAdmin = null;
  if (isV2 || isV3 || isV4) {
    const pendingAdminBytes = bytes.subarray(off, off + 32);
    off += 32;
    pendingAdmin = pendingAdminBytes.every((b) => b === 0) ? null : new PublicKey14(pendingAdminBytes);
  }
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
  const pendingCooldownSlots = isV4 ? readU64LE4(bytes, reservedStart + 72) : readU64LE4(bytes, reservedStart + 10);
  const cooldownProposedAtSlot = isV4 ? readU64LE4(bytes, reservedStart + 80) : readU64LE4(bytes, reservedStart + 18);
  const realizedJuniorLoss = readU64LE4(bytes, reservedStart + 51);
  const assetAdminBurned = bytes[reservedStart + 59] === 1;
  const feeAttributionArmed = bytes[reservedStart + 60] === 1;
  const totalRecoveredFromWrapper = isV4 || isV3 ? readU64LE4(bytes, reservedStart + 64) : null;
  return {
    version,
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
    mode0FeesAttributed: lastVaultSnapshot,
    feeAttributionArmed,
    poolMode,
    hwmEnabled,
    epochHighWaterTvl,
    hwmFloorBps,
    hwmLastEpoch,
    trancheEnabled,
    juniorBalance,
    juniorTotalLp,
    juniorFeeMultBps,
    pendingCooldownSlots,
    cooldownProposedAtSlot,
    realizedJuniorLoss,
    assetAdminBurned,
    totalRecoveredFromWrapper
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
    pool: new PublicKey14(data.subarray(8, 40)),
    user: new PublicKey14(data.subarray(40, 72)),
    lastDepositSlot: readU64LE4(data, 72),
    lpAmount: readU64LE4(data, 80)
  };
}
function initPoolAccounts(a, tokenProgramId = TOKEN_PROGRAM_ID4) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: true },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    // writable: InitPool CPIs UpdateAuthority which writes the slab
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
    { pubkey: SystemProgram2.programId, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: false }
  ];
}
function depositJuniorAccounts(a, tokenProgramId = TOKEN_PROGRAM_ID4) {
  return depositAccounts(a, tokenProgramId);
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
    { pubkey: SYSVAR_CLOCK_PUBKEY2, isSigner: false, isWritable: false },
    ...a.slab ? [{ pubkey: a.slab, isSigner: false, isWritable: false }] : []
  ];
}
function accrueFeesAccounts(a) {
  return [
    { pubkey: a.caller, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY2, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: false }
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
function encodeStakeRecoverTerminalInsurance(amount) {
  return concatBytes(new Uint8Array([STAKE_IX.RecoverTerminalInsurance]), u64Le(amount));
}
function encodeStakeAdminCloseSlab() {
  return new Uint8Array([STAKE_IX.AdminCloseSlab]);
}
function recoverTerminalInsuranceAccounts(a) {
  return [
    { pubkey: a.caller, isSigner: false, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.poolVault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.market, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVault, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVaultAuthority, isSigner: false, isWritable: false },
    { pubkey: a.tokenProgram ?? TOKEN_PROGRAM_ID4, isSigner: false, isWritable: false },
    { pubkey: a.wrapperProgram, isSigner: false, isWritable: false },
    ...a.stray ? [{ pubkey: a.stray, isSigner: false, isWritable: true }] : []
  ];
}
function adminCloseSlabAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: true },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.market, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVault, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVaultAuthority, isSigner: false, isWritable: false },
    { pubkey: a.poolDestToken, isSigner: false, isWritable: true },
    { pubkey: a.tokenProgram ?? TOKEN_PROGRAM_ID4, isSigner: false, isWritable: false },
    { pubkey: a.collateralMint, isSigner: false, isWritable: true },
    { pubkey: a.poolVault, isSigner: false, isWritable: true },
    { pubkey: a.wrapperProgram, isSigner: false, isWritable: false }
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
  let dominantSide = null;
  try {
    const engine = parseEngine(slabData);
    pnlPosTot = engine.pnlPosTot;
    const hasOiFields = layout !== null && layout.engineLongOiOff >= 0 && layout.engineShortOiOff >= 0;
    if (hasOiFields) {
      dominantSide = engine.shortOi > engine.longOi ? "short" : "long";
    }
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
  return { ranked, longs, shorts, isTriggered, pnlPosTot, maxPnlCap, dominantSide };
}
function buildAdlInstruction(_caller, _slab, _oracle, _programId, targetIdx, _backupOracles = []) {
  if (!Number.isInteger(targetIdx) || targetIdx < 0) {
    throw new Error(
      `buildAdlInstruction: targetIdx must be a non-negative integer, got ${targetIdx}`
    );
  }
  throw new Error(V17_ADL_UNSUPPORTED_MESSAGE);
}
function selectAdlTarget(ranking, preferSide) {
  if (preferSide === "long") return ranking.longs[0];
  if (preferSide === "short") return ranking.shorts[0];
  if (ranking.dominantSide === "long") return ranking.longs[0];
  if (ranking.dominantSide === "short") return ranking.shorts[0];
  return ranking.ranked[0];
}
async function buildAdlTransaction(connection, caller, slab, oracle, programId, preferSide, backupOracles = []) {
  const ranking = await fetchAdlRankedPositions(connection, slab);
  if (!ranking.isTriggered) return null;
  const target = selectAdlTarget(ranking, preferSide);
  if (!target) return null;
  return buildAdlInstruction(caller, slab, oracle, programId, target.idx, backupOracles);
}
var ADL_EVENT_TAG = 0xAD1E0001n;
function parseAdlEvent(logs, percolatorProgramId) {
  let insidePercolator = percolatorProgramId === void 0;
  let cpiDepth = 0;
  for (const line of logs) {
    if (typeof line !== "string") continue;
    if (percolatorProgramId !== void 0) {
      if (line.startsWith(`Program ${percolatorProgramId} invoke`)) {
        insidePercolator = true;
        cpiDepth = 0;
        continue;
      }
      if (line.startsWith(`Program ${percolatorProgramId} success`) || line.startsWith(`Program ${percolatorProgramId} failed`)) {
        insidePercolator = false;
        continue;
      }
      if (insidePercolator) {
        if (/^Program \S+ invoke/.test(line)) {
          cpiDepth++;
          continue;
        }
        if (/^Program \S+ (?:success|failed)$/.test(line)) {
          cpiDepth = Math.max(0, cpiDepth - 1);
          continue;
        }
      }
      if (!insidePercolator || cpiDepth > 0) continue;
    }
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

// src/solana/backing-bucket.ts
function readU8At(data, off) {
  if (off + 1 > data.length) throw new Error(`readU8At: out of bounds at ${off}`);
  return data[off];
}
function readU32LEAt(data, off) {
  if (off + 4 > data.length) throw new Error(`readU32LEAt: out of bounds at ${off}`);
  return new DataView(data.buffer, data.byteOffset + off, 4).getUint32(0, true);
}
function readU64LEAt(data, off) {
  if (off + 8 > data.length) throw new Error(`readU64LEAt: out of bounds at ${off}`);
  return new DataView(data.buffer, data.byteOffset + off, 8).getBigUint64(0, true);
}
function readU128LEAt(data, off) {
  if (off + 16 > data.length) throw new Error(`readU128LEAt: out of bounds at ${off}`);
  const dv4 = new DataView(data.buffer, data.byteOffset + off, 16);
  const lo = dv4.getBigUint64(0, true);
  const hi = dv4.getBigUint64(8, true);
  return hi << 64n | lo;
}
var V17_GROUP_CONFIG_REL = 32;
var V17_GROUP_CURRENT_SLOT_REL = 613;
var V17_GROUP_MODE_REL = 626;
var V17_CONFIG_MAX_MARKET_SLOTS_REL = 2;
var V17_ASSET_SLOT_WRAPPER_LEN = 1024;
var V17_ENGINE_BACKING_LONG_REL = 963;
var V17_ENGINE_BACKING_SHORT_REL = 1060;
var V17_BACKING_BUCKET_LEN = 97;
var BB_MARKET_ID = 0;
var BB_FRESH_UNLIENED = 8;
var BB_VALID_LIENED = 24;
var BB_CONSUMED_LIENED = 40;
var BB_IMPAIRED_LIENED = 56;
var BB_UTILIZATION_FEE = 72;
var BB_EXPIRY_SLOT = 88;
var BB_STATUS = 96;
var V17_MARKET_MODE_LIVE = 0;
var BackingBucketStatus = /* @__PURE__ */ ((BackingBucketStatus2) => {
  BackingBucketStatus2[BackingBucketStatus2["Empty"] = 0] = "Empty";
  BackingBucketStatus2[BackingBucketStatus2["Fresh"] = 1] = "Fresh";
  BackingBucketStatus2[BackingBucketStatus2["Expired"] = 2] = "Expired";
  BackingBucketStatus2[BackingBucketStatus2["Impaired"] = 3] = "Impaired";
  return BackingBucketStatus2;
})(BackingBucketStatus || {});
function backingBucketStatusName(status) {
  switch (status) {
    case 0 /* Empty */:
      return "Empty";
    case 1 /* Fresh */:
      return "Fresh";
    case 2 /* Expired */:
      return "Expired";
    case 3 /* Impaired */:
      return "Impaired";
    default:
      return `Unknown(${status})`;
  }
}
function isBackingBucketExpirable(bucket, ctx) {
  if (ctx.mode !== V17_MARKET_MODE_LIVE) return false;
  if (bucket.domain < 0 || bucket.domain >= ctx.addressableDomainCount) return false;
  if (bucket.status !== 1 /* Fresh */) return false;
  return ctx.nowSlot >= bucket.expirySlot;
}
function parseBackingBucketsV17(data, opts = {}) {
  const MIN_LEN = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseBackingBucketsV17: buffer too short \u2014 need >= ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  if (!isV17MarketAccount(data)) {
    throw new Error(
      "parseBackingBucketsV17: not a v17 market account (bad magic, version, or kind)"
    );
  }
  const groupOff = V17_MARKET_GROUP_OFF;
  const mode = readU8At(data, groupOff + V17_GROUP_MODE_REL);
  const headerCurrentSlot = readU64LEAt(data, groupOff + V17_GROUP_CURRENT_SLOT_REL);
  const maxMarketSlots = readU32LEAt(
    data,
    groupOff + V17_GROUP_CONFIG_REL + V17_CONFIG_MAX_MARKET_SLOTS_REL
  );
  const chainSlot = opts.chainSlot === void 0 ? 0n : BigInt(opts.chainSlot);
  if (chainSlot < 0n) {
    throw new Error(`parseBackingBucketsV17: chainSlot must be non-negative, got ${chainSlot}`);
  }
  const nowSlot = chainSlot > headerCurrentSlot ? chainSlot : headerCurrentSlot;
  const slotsBase = groupOff + V17_MARKET_GROUP_LEN;
  const physicalAssetSlots = Math.max(
    0,
    Math.floor((data.length - slotsBase) / V17_MARKET_ASSET_SLOT_LEN)
  );
  const addressableAssetSlots = Math.min(maxMarketSlots, physicalAssetSlots);
  const addressableDomainCount = addressableAssetSlots * 2;
  const ctx = { mode, nowSlot, addressableDomainCount };
  const buckets = [];
  for (let assetIndex = 0; assetIndex < addressableAssetSlots; assetIndex++) {
    const engineBase = slotsBase + assetIndex * V17_MARKET_ASSET_SLOT_LEN + V17_ASSET_SLOT_WRAPPER_LEN;
    for (const side of ["long", "short"]) {
      const bucketOff = engineBase + (side === "long" ? V17_ENGINE_BACKING_LONG_REL : V17_ENGINE_BACKING_SHORT_REL);
      if (bucketOff + V17_BACKING_BUCKET_LEN > data.length) break;
      const domain = assetIndex * 2 + (side === "short" ? 1 : 0);
      const status = readU8At(data, bucketOff + BB_STATUS);
      const expirySlot = readU64LEAt(data, bucketOff + BB_EXPIRY_SLOT);
      const lapsed = status === 1 /* Fresh */ && nowSlot >= expirySlot;
      const bucket = {
        domain,
        assetIndex,
        side,
        marketId: readU64LEAt(data, bucketOff + BB_MARKET_ID),
        freshUnlienedBackingNum: readU128LEAt(data, bucketOff + BB_FRESH_UNLIENED),
        validLienedBackingNum: readU128LEAt(data, bucketOff + BB_VALID_LIENED),
        consumedLienedBackingNum: readU128LEAt(data, bucketOff + BB_CONSUMED_LIENED),
        impairedLienedBackingNum: readU128LEAt(data, bucketOff + BB_IMPAIRED_LIENED),
        utilizationFeeEarnings: readU128LEAt(data, bucketOff + BB_UTILIZATION_FEE),
        expirySlot,
        status,
        statusName: backingBucketStatusName(status),
        lapsed,
        expirable: false
      };
      bucket.expirable = isBackingBucketExpirable(bucket, ctx);
      buckets.push(bucket);
    }
  }
  return {
    mode,
    headerCurrentSlot,
    nowSlot,
    maxMarketSlots,
    physicalAssetSlots,
    addressableDomainCount,
    buckets
  };
}
function findExpirableBackingDomains(data, opts = {}) {
  return parseBackingBucketsV17(data, opts).buckets.filter((b) => b.expirable).map((b) => b.domain);
}

// src/solana/rpc-pool.ts
import {
  Connection as Connection5
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
        connection: new Connection5(ep.url, connConfig),
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

// src/solana/market-lifecycle.ts
import { TransactionInstruction as TransactionInstruction4 } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID as TOKEN_PROGRAM_ID5 } from "@solana/spl-token";
var ACCOUNTS_REBALANCE_REDUCE = [
  { name: "owner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true }
];
function buildRebalanceReduceIx(a) {
  if (a.reduceQ <= 0n) throw new Error("buildRebalanceReduceIx: reduceQ must be > 0");
  return new TransactionInstruction4({
    programId: a.programId,
    keys: buildAccountMetas(ACCOUNTS_REBALANCE_REDUCE, { owner: a.owner, market: a.market, portfolio: a.portfolio }),
    data: Buffer.from(
      encodeRebalanceReduce({ portfolioId: a.portfolioId, positionEpoch: a.positionEpoch, assetIndex: a.assetIndex, reduceQ: a.reduceQ })
    )
  });
}
function planReduceOnlyExit(programId, owner, market, portfolio, portfolioData, assetIndex = 0) {
  const p = parsePortfolioV17(portfolioData);
  const leg = p.legs.find((l) => l.active && l.assetIndex === assetIndex && l.basisPosQ !== 0n);
  if (!leg) return null;
  const reduceQ = leg.basisPosQ < 0n ? -leg.basisPosQ : leg.basisPosQ;
  return {
    ix: buildRebalanceReduceIx({ programId, owner, market, portfolio, portfolioId: p.portfolioId, positionEpoch: p.matcherPositionEpoch, assetIndex, reduceQ }),
    reduceQ,
    side: leg.basisPosQ > 0n ? "long" : "short"
  };
}
var V17_KIND_CLOSED_MARKET = 8;
function isClosedMarketTombstone(data) {
  if (data === null) return true;
  return data.length === V17_HEADER_LEN && data[V17_KIND_OFF] === V17_KIND_CLOSED_MARKET;
}
function planCloseSlabAttempt(a) {
  if (a.hasLpVault) {
    throw new Error(
      "planCloseSlabAttempt: this market has an Earn LP vault \u2014 CloseSlab can never retire it (LP-vault dead-share floor, by design). Its slab rent is unrecoverable; do not promise reclaim."
    );
  }
  const tokenProgram = a.tokenProgram ?? TOKEN_PROGRAM_ID5;
  const [vaultAuthority] = deriveVaultAuthority(a.programId, a.market);
  const ixs = [];
  if (a.protocolFee && a.protocolFee.owed > 0n) {
    ixs.push(new TransactionInstruction4({
      programId: a.programId,
      keys: buildAccountMetas(ACCOUNTS_WITHDRAW_PROTOCOL_FEE, {
        authority: a.protocolFee.authority,
        market: a.market,
        destToken: a.protocolFee.destToken,
        vaultToken: a.vaultToken,
        vaultAuthority,
        tokenProgram
      }),
      data: Buffer.from(encodeWithdrawProtocolFee({ amount: 0n, authorityEpoch: a.protocolFee.authorityEpoch }))
    }));
  }
  if (a.insuranceRecredit && a.insuranceRecredit.amount > 0n) {
    const keys = buildAccountMetas(ACCOUNTS_WITHDRAW_INSURANCE, {
      authority: a.insuranceRecredit.authority,
      market: a.market,
      destToken: a.insuranceRecredit.destToken,
      vaultToken: a.vaultToken,
      vaultAuthority,
      tokenProgram
    });
    if (a.insuranceRecredit.ledger) keys.push({ pubkey: a.insuranceRecredit.ledger, isSigner: false, isWritable: true });
    ixs.push(new TransactionInstruction4({
      programId: a.programId,
      keys,
      data: Buffer.from(encodeWithdrawInsurance({ amount: a.insuranceRecredit.amount }))
    }));
  }
  ixs.push(new TransactionInstruction4({
    programId: a.programId,
    keys: buildAccountMetas(ACCOUNTS_CLOSE_SLAB, {
      dest: a.closer,
      slab: a.market,
      vault: a.vaultToken,
      vaultAuthority,
      destAta: a.closerDestToken,
      tokenProgram
    }),
    data: Buffer.from(encodeCloseSlab(a.closeAuthorityEpoch))
  }));
  return ixs;
}

// src/solana/p3-vault-lp.ts
import { PublicKey as PublicKey16, SystemProgram as SystemProgram3, TransactionInstruction as TransactionInstruction5 } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID as TOKEN_PROGRAM_ID6, getAssociatedTokenAddressSync as getAssociatedTokenAddressSync2 } from "@solana/spl-token";
var V18_KIND_VAULT_LP_STATE_P3 = 9;
var VAULT_LP_STATE_BODY_LEN_P3 = 256;
var VAULT_LP_STATE_ACCOUNT_LEN_P3 = V17_HEADER_LEN + VAULT_LP_STATE_BODY_LEN_P3;
var ASSET_VAULT_LP_SLOT_OFF_P3 = 896;
var ASSET_VAULT_LP_LEN_P3 = 128;
var ASSET_VAULT_LP_FLAG_BOUND_P3 = 1;
var LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3 = 160;
var VAULT_LP_STATE_OFF_P3 = Object.freeze({
  marketGroup: 16,
  registry: 48,
  lpPortfolio: 80,
  juniorOwner: 112,
  seniorClaimAtoms: 144,
  juniorDepositedAtoms: 160,
  juniorWithdrawnAtoms: 176,
  seniorFeeCreditedAtoms: 192,
  recalledAtoms: 208,
  assetIndex: 224,
  juniorFloorBps: 226,
  seniorFeeShareBps: 228,
  version: 230,
  bump: 231,
  /** `_padding` [232..240) must be zero (program `validate_vault_lp_state`). */
  padding: 232,
  /** P3 senior draw FINAL `d119eebd` (was `_reserved`). */
  seniorDrawnAtoms: 240,
  seniorDrawOutstandingAtoms: 256
});
var ASSET_VAULT_LP_DRAW_SLOT_OFF_P3 = 832;
var ASSET_VAULT_LP_DRAW_LEN_P3 = 64;
var ASSET_VAULT_LP_FIELD_OFF_P3 = Object.freeze({
  vaultLpPortfolio: 0,
  lpNetQ: 32,
  levCapQ: 48,
  lpNetSlot: 64,
  skewSlopeE9: 72,
  skewMaxE9: 80,
  levMaxImrBps: 88,
  flags: 90,
  reserved0: 91,
  vaultLpMaxLevBps: 92,
  approvedMatcherProgram: 96
});
var ASSET_VAULT_LP_P2B_FLAGS_OFF_P3 = 91;
function assetVaultLpAccountOffsetP3(assetIndex) {
  if (!Number.isInteger(assetIndex) || assetIndex < 0) throw new Error(`assetIndex must be a non-negative integer, got ${assetIndex}`);
  return V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + assetIndex * V17_MARKET_ASSET_SLOT_LEN + ASSET_VAULT_LP_SLOT_OFF_P3;
}
var RECOMMENDED_CU_P3 = Object.freeze({
  tradeCpi: 6e5,
  closeResolved: 3e5,
  vaultLpSettleResolved: 4e5,
  lpVaultCrankFees: 12e4,
  keeperCrank: 25e4
});
var ASSET_STATE_RAW_ORACLE_TARGET_PRICE_OFF_P3 = 17;
var ASSET_STATE_EFFECTIVE_PRICE_OFF_P3 = 25;
var POS_SCALE_P3 = 1000000n;
var ASSET_SLOT_WRAPPER_LEN_P3 = 1024;
function readAssetPricesP3(marketData, assetIndex) {
  if (!Number.isInteger(assetIndex) || assetIndex < 0) throw new Error(`assetIndex must be a non-negative integer, got ${assetIndex}`);
  const base = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + assetIndex * V17_MARKET_ASSET_SLOT_LEN + ASSET_SLOT_WRAPPER_LEN_P3;
  if (marketData.length < base + ASSET_STATE_EFFECTIVE_PRICE_OFF_P3 + 8) throw new Error(`market data too short for asset ${assetIndex}`);
  const v = new DataView(marketData.buffer, marketData.byteOffset, marketData.byteLength);
  return {
    rawOracleTargetPriceE6: v.getBigUint64(base + ASSET_STATE_RAW_ORACLE_TARGET_PRICE_OFF_P3, true),
    effectivePriceE6: v.getBigUint64(base + ASSET_STATE_EFFECTIVE_PRICE_OFF_P3, true)
  };
}
function view(d) {
  return new DataView(d.buffer, d.byteOffset, d.byteLength);
}
function u128(v, o) {
  return v.getBigUint64(o + 8, true) << 64n | v.getBigUint64(o, true);
}
function i128(v, o) {
  const x = u128(v, o);
  return x >= 1n << 127n ? x - (1n << 128n) : x;
}
function key(d, o) {
  return new PublicKey16(d.subarray(o, o + 32));
}
function decodeVaultLpStateP3(data) {
  if (data.length < VAULT_LP_STATE_ACCOUNT_LEN_P3) throw new Error(`VaultLpStateV18: need ${VAULT_LP_STATE_ACCOUNT_LEN_P3} bytes, got ${data.length}`);
  if (data[V17_KIND_OFF] !== V18_KIND_VAULT_LP_STATE_P3) throw new Error(`VaultLpStateV18: kind ${data[V17_KIND_OFF]} != 9`);
  const v = view(data);
  const O = VAULT_LP_STATE_OFF_P3;
  const st = {
    marketGroup: key(data, O.marketGroup),
    registry: key(data, O.registry),
    lpPortfolio: key(data, O.lpPortfolio),
    juniorOwner: key(data, O.juniorOwner),
    seniorClaimAtoms: u128(v, O.seniorClaimAtoms),
    juniorDepositedAtoms: u128(v, O.juniorDepositedAtoms),
    juniorWithdrawnAtoms: u128(v, O.juniorWithdrawnAtoms),
    seniorFeeCreditedAtoms: u128(v, O.seniorFeeCreditedAtoms),
    recalledAtoms: u128(v, O.recalledAtoms),
    assetIndex: v.getUint16(O.assetIndex, true),
    juniorFloorBps: v.getUint16(O.juniorFloorBps, true),
    seniorFeeShareBps: v.getUint16(O.seniorFeeShareBps, true),
    version: data[O.version],
    bump: data[O.bump],
    seniorDrawnAtoms: u128(v, O.seniorDrawnAtoms),
    seniorDrawOutstandingAtoms: u128(v, O.seniorDrawOutstandingAtoms)
  };
  const padZero = data.subarray(O.padding, O.padding + 8).every((b) => b === 0);
  if (st.version !== 1 || st.juniorFloorBps < 1e3 || st.juniorFloorBps > 1e4 || st.seniorFeeShareBps !== 1e4 || !padZero) {
    throw new Error("VaultLpStateV18: invalid (version/floor/fee share/padding) \u2014 the program would reject it too");
  }
  return st;
}
function decodeAssetVaultLpDrawP3(marketData, assetIndex) {
  const off = assetVaultLpAccountOffsetP3(assetIndex) - ASSET_VAULT_LP_DRAW_LEN_P3;
  if (marketData.length < off + ASSET_VAULT_LP_DRAW_LEN_P3) throw new Error(`AssetVaultLpDrawV18: market data too short for asset ${assetIndex}`);
  const v = view(marketData);
  const r = {
    pendingOutEvenAtoms: u128(v, off),
    pendingOutOddAtoms: u128(v, off + 16),
    outstandingMirrorAtoms: u128(v, off + 32),
    pendingMovedAtoms: u128(v, off + 48)
  };
  return { ...r, hasPendingDraw: r.pendingMovedAtoms !== 0n || r.pendingOutEvenAtoms !== 0n || r.pendingOutOddAtoms !== 0n };
}
function decodeAssetVaultLpRecordP3(rec) {
  if (rec.length !== ASSET_VAULT_LP_LEN_P3) throw new Error(`AssetVaultLpV18 record must be 128 bytes, got ${rec.length}`);
  const v = view(rec);
  const F = ASSET_VAULT_LP_FIELD_OFF_P3;
  const zero32 = (o) => rec.subarray(o, o + 32).every((b) => b === 0);
  const flags = rec[F.flags];
  const bound = (flags & ASSET_VAULT_LP_FLAG_BOUND_P3) !== 0;
  const out = {
    vaultLpPortfolio: zero32(F.vaultLpPortfolio) ? null : key(rec, F.vaultLpPortfolio),
    lpNetQ: i128(v, F.lpNetQ),
    levCapQ: u128(v, F.levCapQ),
    lpNetSlot: v.getBigUint64(F.lpNetSlot, true),
    skewSlopeE9: v.getBigUint64(F.skewSlopeE9, true),
    skewMaxE9: v.getBigUint64(F.skewMaxE9, true),
    levMaxImrBps: v.getUint16(F.levMaxImrBps, true),
    flags,
    bound,
    p2bFlags: rec[ASSET_VAULT_LP_P2B_FLAGS_OFF_P3],
    creatorFeeVesting: (rec[ASSET_VAULT_LP_P2B_FLAGS_OFF_P3] & 1) !== 0,
    vaultLpMaxLevBps: v.getUint32(F.vaultLpMaxLevBps, true),
    approvedMatcherProgram: zero32(F.approvedMatcherProgram) ? null : key(rec, F.approvedMatcherProgram)
  };
  if ((flags & ~ASSET_VAULT_LP_FLAG_BOUND_P3) !== 0 || (rec[ASSET_VAULT_LP_P2B_FLAGS_OFF_P3] & ~1) !== 0 || out.vaultLpMaxLevBps > 5e4 || out.levMaxImrBps > 1e4 || bound !== (out.vaultLpPortfolio !== null)) {
    throw new Error("AssetVaultLpV18: invalid record \u2014 the program would reject it too");
  }
  return out;
}
function decodeAssetVaultLpP3(marketData, assetIndex) {
  if (marketData[V17_KIND_OFF] !== 1) throw new Error(`not a market account (kind ${marketData[V17_KIND_OFF]})`);
  const off = assetVaultLpAccountOffsetP3(assetIndex);
  if (marketData.length < off + ASSET_VAULT_LP_LEN_P3) throw new Error(`market account too short for asset ${assetIndex}`);
  return decodeAssetVaultLpRecordP3(marketData.subarray(off, off + ASSET_VAULT_LP_LEN_P3));
}
function isLpVaultRegistryBoundP3(registryData) {
  const b = registryData[LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3];
  if (b !== 0 && b !== 1) throw new Error(`registry bound flag must be 0|1, got ${b}`);
  return b === 1;
}
function deriveVaultLpStateP3(programId, market) {
  return PublicKey16.findProgramAddressSync([new TextEncoder().encode("vault_lp"), market.toBytes()], programId);
}
var BPF_LOADER_UPGRADEABLE_ID_P3 = new PublicKey16("BPFLoaderUpgradeab1e11111111111111111111111");
function deriveProgramDataAddressP3(programId) {
  return PublicKey16.findProgramAddressSync([programId.toBytes()], BPF_LOADER_UPGRADEABLE_ID_P3);
}
function ledgers(programId, market, registryDomain) {
  return {
    ledger: deriveLpBackingLedger(programId, market, registryDomain)[0],
    siblingLedger: deriveLpBackingLedger(programId, market, registryDomain ^ 1)[0]
  };
}
function ix(programId, spec, keys, data, extra = []) {
  return new TransactionInstruction5({ programId, keys: [...buildAccountMetas(spec, keys), ...extra], data: Buffer.from(data) });
}
var VAULT_LP_MATCHER_CTX_LEN_P3 = 320;
function buildCreateVaultLpMatcherCtxIxP3(payer, matcherCtx, lamports, matcherProgram = new PublicKey16(CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3)) {
  return SystemProgram3.createAccount({ fromPubkey: payer, newAccountPubkey: matcherCtx, lamports, space: VAULT_LP_MATCHER_CTX_LEN_P3, programId: matcherProgram });
}
function buildInitVaultLpIxP3(m, marketauth, juniorFloorBps, matcherCtx, matcherProgram = new PublicKey16(CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3)) {
  const [registry] = deriveLpVaultRegistry(m.programId, m.market);
  const [matcherDelegate] = deriveMatcherDelegate(m.programId, m.market, m.lpPortfolio, registry, matcherProgram, matcherCtx);
  return ix(m.programId, ACCOUNTS_INIT_VAULT_LP_P3, {
    authority: marketauth,
    market: m.market,
    registry,
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    systemProgram: SystemProgram3.programId,
    ...ledgers(m.programId, m.market, m.registryDomain),
    matcherProgram,
    matcherCtx,
    matcherDelegate
  }, encodeInitVaultLpP3(juniorFloorBps));
}
function buildVaultLpSetMatcherIxP3(m, upgradeAuthority, matcherProgram, matcherCtx, args) {
  const [registry] = deriveLpVaultRegistry(m.programId, m.market);
  const [matcherDelegate] = deriveMatcherDelegate(m.programId, m.market, m.lpPortfolio, registry, matcherProgram, matcherCtx);
  return ix(m.programId, ACCOUNTS_VAULT_LP_SET_MATCHER_P3, {
    upgradeAuthority,
    programData: deriveProgramDataAddressP3(m.programId)[0],
    market: m.market,
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    matcherProgram,
    matcherCtx,
    matcherDelegate
  }, encodeVaultLpSetMatcherP3(args));
}
function buildDepositJuniorTrancheIxP3(m, juniorOwner, sourceToken, vaultToken, amount) {
  return ix(m.programId, ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3, {
    juniorOwner,
    market: m.market,
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    sourceToken,
    vaultToken,
    tokenProgram: TOKEN_PROGRAM_ID6
  }, encodeDepositJuniorTrancheP3(amount));
}
function buildWithdrawJuniorTrancheIxP3(m, juniorOwner, destToken, vaultToken, amount) {
  return ix(m.programId, ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3, {
    juniorOwner,
    market: m.market,
    registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain),
    destToken,
    vaultToken,
    vaultAuthority: deriveVaultAuthority(m.programId, m.market)[0],
    tokenProgram: TOKEN_PROGRAM_ID6
  }, encodeWithdrawJuniorTrancheP3(amount), m.vaultLpExt ? [{ pubkey: m.vaultLpExt, isSigner: false, isWritable: true }] : []);
}
function buildVaultLpRecallIxP3(m, cranker, amount, targetDomain) {
  return ix(m.programId, ACCOUNTS_VAULT_LP_RECALL_P3, {
    cranker,
    market: m.market,
    registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain),
    systemProgram: SystemProgram3.programId
  }, encodeVaultLpRecallP3(amount, targetDomain), m.vaultLpExt ? [{ pubkey: m.vaultLpExt, isSigner: false, isWritable: true }] : []);
}
function buildSetVaultLpRiskIxP3(programId, market, upgradeAuthority, args) {
  return ix(programId, ACCOUNTS_SET_VAULT_LP_RISK_P3, {
    upgradeAuthority,
    programData: deriveProgramDataAddressP3(programId)[0],
    market
  }, encodeSetVaultLpRiskP3(args));
}
function buildVaultLpConvertPnlIxP3(m, caller, amount) {
  return ix(m.programId, ACCOUNTS_VAULT_LP_CONVERT_PNL_P3, {
    caller,
    market: m.market,
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio
  }, encodeVaultLpConvertPnlP3(amount));
}
function buildVaultLpSettleResolvedIxP3(m, caller, juniorDestToken, vaultToken, topup) {
  return ix(m.programId, ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3, {
    caller,
    market: m.market,
    registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain),
    juniorDestToken,
    vaultToken,
    vaultAuthority: deriveVaultAuthority(m.programId, m.market)[0],
    tokenProgram: TOKEN_PROGRAM_ID6,
    systemProgram: SystemProgram3.programId
  }, encodeVaultLpSettleResolvedP3(topup));
}
function buildVaultLpReleaseSurplusIxP3(m, juniorOwner, amount, sourceDomain, resolved) {
  const extra = resolved ? buildAccountMetas(ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3, {
    juniorDestToken: resolved.juniorDestToken,
    vaultToken: resolved.vaultToken,
    vaultAuthority: deriveVaultAuthority(m.programId, m.market)[0],
    tokenProgram: TOKEN_PROGRAM_ID6
  }) : [];
  return ix(m.programId, ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3, {
    juniorOwner,
    market: m.market,
    registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain)
  }, encodeVaultLpReleaseSurplusP3(amount, sourceDomain), extra);
}
var BOUND_VAULT_LP_TAIL_INDEX_P3 = Object.freeze({ 75: 11, 77: 13, 78: 6 });
var BOUND_VAULT_LP_LEDGER_SLOTS_P3 = Object.freeze({ 75: [7, 10], 77: [8, 11], 78: [3, 4] });
function withBoundVaultLpTailP3(base, vaultLpState, lpPortfolio, opts = {}) {
  const tag = base.data[0];
  if (tag !== 75 && tag !== 77 && tag !== 78) throw new Error(`withBoundVaultLpTailP3: tag ${tag} takes no vault-LP tail (only 75/77/78)`);
  const want = BOUND_VAULT_LP_TAIL_INDEX_P3[tag];
  if (base.keys.length !== want) throw new Error(`withBoundVaultLpTailP3: tag ${tag} must have exactly ${want} base accounts, got ${base.keys.length}`);
  const ledgerSlots = BOUND_VAULT_LP_LEDGER_SLOTS_P3[tag];
  const keys = base.keys.map((k, i) => ledgerSlots.includes(i) ? { ...k, isWritable: true } : k);
  keys.push({ pubkey: vaultLpState, isSigner: false, isWritable: true });
  if (tag !== 78) keys.push({ pubkey: lpPortfolio, isSigner: false, isWritable: opts.lpReadOnly !== true });
  else if (opts.vaultLpExt) {
    keys.push({ pubkey: opts.vaultLpExt, isSigner: false, isWritable: true });
    keys.push({ pubkey: lpPortfolio, isSigner: false, isWritable: true });
  }
  return new TransactionInstruction5({ programId: base.programId, keys, data: base.data });
}
function buildExecuteRedemptionIxP3(m, cranker, redeemer, redeemerDest, vaultToken, sourceDomain, opts = {}) {
  const [registry] = deriveLpVaultRegistry(m.programId, m.market);
  const { ledger, siblingLedger } = ledgers(m.programId, m.market, m.registryDomain);
  const w = (pubkey, isSigner = false) => ({ pubkey, isSigner, isWritable: true });
  const r = (pubkey) => ({ pubkey, isSigner: false, isWritable: false });
  const base = new TransactionInstruction5({
    programId: m.programId,
    data: Buffer.from(encodeExecuteRedemption({ domain: sourceDomain })),
    keys: [
      w(cranker, true),
      w(m.market),
      w(registry),
      w(deriveLpRedemption(m.programId, registry, redeemer)[0]),
      w(deriveInsuranceLpMint(m.programId, m.market)[0]),
      w(deriveLpEscrow(m.programId, m.market)[0]),
      w(vaultToken),
      r(deriveVaultAuthority(m.programId, m.market)[0]),
      w(ledger),
      w(redeemerDest),
      r(TOKEN_PROGRAM_ID6),
      w(siblingLedger),
      w(redeemer, opts.redeemerSigns === true)
    ]
  });
  return withBoundVaultLpTailP3(base, deriveVaultLpStateP3(m.programId, m.market)[0], m.lpPortfolio);
}
function buildVaultLpRefreshCrankIxP3(a) {
  const want = a.observations.reduce((s, o) => s + o.oracleAccounts, 0);
  if (want !== a.oracleAccounts.length) throw new Error(`observations name ${want} oracle accounts, got ${a.oracleAccounts.length}`);
  return new TransactionInstruction5({
    programId: a.programId,
    keys: [
      { pubkey: a.cranker, isSigner: true, isWritable: true },
      { pubkey: a.market, isSigner: false, isWritable: true },
      { pubkey: a.vaultLpPortfolio, isSigner: false, isWritable: true },
      ...a.oracleAccounts.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }))
    ],
    data: Buffer.from(encodePermissionlessCrank({ nowSlot: a.nowSlot, observations: a.observations }))
  });
}
var BOUND_SCALE_P3 = 1000000000000n;
var LP_VAULT_MINIMUM_LIQUIDITY_P3 = 1000n;
var sat2 = (a, b) => a > b ? a - b : 0n;
var minB = (a, b) => a < b ? a : b;
function vaultPotHeldAtomsP3(bucket) {
  return (bucket.freshUnlienedBackingNum + bucket.validLienedBackingNum) / BOUND_SCALE_P3;
}
function vaultPhysicalIdleBackingAtomsP3(freshUnlienedBackingNums) {
  return freshUnlienedBackingNums.reduce((t, n) => t + n / BOUND_SCALE_P3, 0n);
}
function boundVaultNavFlooredP3(own, sibling, feeShareBps, held) {
  if (!Number.isInteger(feeShareBps) || feeShareBps < 0 || feeShareBps > 1e4) throw new Error("feeShareBps must be 0..=10000");
  const earn = (p) => sat2(p.totalEarningsAtoms, p.totalEarningsWithdrawnAtoms) * BigInt(feeShareBps) / 10000n;
  const availablePrincipal = minB(own.totalPrincipalAtoms, held.own) + minB(sibling.totalPrincipalAtoms, held.sibling);
  const lpEarnings = earn(own) + earn(sibling);
  return { availablePrincipal, lpEarnings, nav: availablePrincipal + lpEarnings };
}
var ceilDiv = (n, d) => (n + d - 1n) / d;
function vaultLpEquityLagBoundsP3(a) {
  if (a.legs.length === 0) {
    const e = a.capital + (a.pnl < 0n ? a.pnl : 0n) + (a.feeCredits < 0n ? a.feeCredits : 0n);
    const eq = e <= 0n ? 0n : e;
    return { worse: eq, better: eq };
  }
  let adverse = 0n;
  let favorable = 0n;
  for (const l of a.legs) {
    const q = l.basisPosQ < 0n ? -l.basisPosQ : l.basisPosQ;
    const up = l.rawOracleTargetPriceE6 > l.effectivePriceE6 ? l.rawOracleTargetPriceE6 - l.effectivePriceE6 : 0n;
    const down = l.effectivePriceE6 > l.rawOracleTargetPriceE6 ? l.effectivePriceE6 - l.rawOracleTargetPriceE6 : 0n;
    const [adv, fav] = l.basisPosQ >= 0n ? [down, up] : [up, down];
    adverse += ceilDiv(q * adv, POS_SCALE_P3);
    favorable += ceilDiv(q * fav, POS_SCALE_P3);
  }
  return { worse: a.certifiedEquity - adverse, better: a.certifiedEquity + favorable };
}
function vaultLpSeniorPricingClaimP3(c, undrawn, juniorSurplus) {
  const loss = undrawn > juniorSurplus ? undrawn - juniorSurplus : 0n;
  return c > loss ? c - loss : 0n;
}
function boundVaultSeniorValueP3(a) {
  if (a.resolved) return minB(a.physicalIdleBacking, a.seniorClaim);
  return liveExitSeniorValueP3(a.seniorClaim, a.nav, a.lpEquityWorse >= 0n ? a.lpValue : 0n, a.lpEquityWorse);
}
function liveExitSeniorValueP3(c, nav, lpValueAtEff, lpEquityWorse) {
  if (lpEquityWorse >= 0n) return minB(nav + minB(lpValueAtEff, lpEquityWorse), c);
  const d = -lpEquityWorse;
  const cP = vaultLpSeniorPricingClaimP3(c, d, nav > c ? nav - c : 0n);
  return minB(nav > d ? nav - d : 0n, cP);
}
function boundVaultRedemptionAtomsP3(shares, totalShares, seniorValue) {
  if (totalShares === 0n || shares > totalShares) return null;
  return shares * seniorValue / totalShares;
}
function boundVaultDepositQuoteP3(a) {
  if (a.totalShares === 0n && a.harvestable !== 0n) return { ok: false, error: "VaultLpHarvestPending" };
  let cEff = a.seniorClaim + a.harvestable * BigInt(a.seniorFeeShareBps) / 10000n;
  const navH = a.nav + a.harvestable;
  if (a.seniorDrawOutstandingAtoms !== 0n) {
    const vBetter = navH + (a.lpEquityBetter > 0n ? a.lpEquityBetter : 0n);
    const above = vBetter > cEff ? vBetter - cEff : 0n;
    cEff += minB(above, a.seniorDrawOutstandingAtoms);
  }
  if (navH < cEff && navH + a.lpValue < cEff) return { ok: false, error: "VaultLpSeniorImpaired" };
  let shares;
  if (a.totalShares === 0n) shares = a.amount;
  else if (cEff === 0n) return { ok: false, error: "EngineInvalidConfig" };
  else shares = a.amount * a.totalShares / cEff;
  if (shares === 0n) return { ok: false, error: "LpVaultZeroSharesMinted" };
  const minted = a.totalShares === 0n ? shares - LP_VAULT_MINIMUM_LIQUIDITY_P3 : shares;
  if (minted <= 0n) return { ok: false, error: "LpVaultDepositBelowMinimumLiquidity" };
  return { ok: true, shares, minted, cEff };
}
function planResolvedVaultLpExitP3(a) {
  const [vaultLpState] = deriveVaultLpStateP3(a.market.programId, a.market.market);
  const crank = withBoundVaultLpTailP3(a.crankFeesIx, vaultLpState, a.market.lpPortfolio, { vaultLpExt: a.market.vaultLpExt });
  const perSeniorTxs = a.seniorRedemptionIxs.map((r) => [crank, withBoundVaultLpTailP3(r, vaultLpState, a.market.lpPortfolio)]);
  const junior = a.junior ? buildVaultLpReleaseSurplusIxP3(a.market, a.junior.juniorOwner, a.junior.amount, a.junior.sourceDomain, {
    juniorDestToken: a.junior.juniorDestToken,
    vaultToken: a.junior.vaultToken
  }) : null;
  return { perSeniorTxs, junior };
}
var RESOLVED_RECEIPT_ACCOUNT_OFF_P3 = 9369;
var RESOLVED_RECEIPT_LEN_P3 = 66;
function decodeResolvedPayoutReceiptP3(portfolioData) {
  const o = RESOLVED_RECEIPT_ACCOUNT_OFF_P3;
  if (portfolioData.length < o + RESOLVED_RECEIPT_LEN_P3) throw new Error(`portfolio data too short for the resolved receipt (${portfolioData.length} B)`);
  const v = new DataView(portfolioData.buffer, portfolioData.byteOffset, portfolioData.byteLength);
  const present = portfolioData[o + 64] !== 0;
  const finalized = portfolioData[o + 65] !== 0;
  return {
    priorBoundContributionNum: u128(v, o),
    liveReleasedFaceAtReceipt: u128(v, o + 16),
    terminalPositiveClaimFace: u128(v, o + 32),
    paidEffective: u128(v, o + 48),
    present,
    finalized,
    open: present && !finalized
  };
}
function buildClaimResolvedPayoutTopupIxP3(a) {
  const keys = buildAccountMetas(ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP, {
    owner: a.owner,
    market: a.market,
    portfolio: a.portfolio,
    destToken: a.destToken,
    vaultToken: a.vaultToken,
    vaultAuthority: deriveVaultAuthority(a.programId, a.market)[0],
    tokenProgram: TOKEN_PROGRAM_ID6
  });
  if (!a.signed) {
    keys[0] = { pubkey: a.owner, isSigner: false, isWritable: false };
    keys.push({ pubkey: deriveNftRegistry(a.programId, a.market)[0], isSigner: false, isWritable: false });
  }
  return new TransactionInstruction5({ programId: a.programId, keys, data: Buffer.from([46]) });
}
async function listOpenResolvedReceiptsP3(conn, programId, market) {
  const accs = await conn.getProgramAccounts(programId, {
    commitment: "confirmed",
    filters: [{ dataSize: V17_PORTFOLIO_ACCOUNT_LEN }, { memcmp: { offset: 16, bytes: market.toBase58() } }]
  });
  const [registry] = deriveLpVaultRegistry(programId, market);
  const out = [];
  for (const { pubkey, account } of accs) {
    const data = new Uint8Array(account.data);
    const receipt = decodeResolvedPayoutReceiptP3(data);
    if (!receipt.open) continue;
    const owner = new PublicKey16(data.subarray(80, 112));
    out.push({ portfolio: pubkey, owner, receipt, isVaultLp: owner.equals(registry), needsHolder: !PublicKey16.isOnCurve(owner.toBytes()) && !owner.equals(registry) });
  }
  return out;
}
function buildCloseResolvedUnsignedIxP3(a) {
  const ix2 = buildClaimResolvedPayoutTopupIxP3(a);
  return new TransactionInstruction5({ programId: a.programId, keys: ix2.keys, data: Buffer.alloc(17, 0).fill(30, 0, 1) });
}
function planResolvedReceiptRevisitP3(a) {
  const steps = [];
  const needsHolder = [];
  for (const r of a.open) {
    if (r.isVaultLp) continue;
    if (r.needsHolder) {
      needsHolder.push(r);
      continue;
    }
    const destToken = getAssociatedTokenAddressSync2(a.collateralMint, r.owner, false, TOKEN_PROGRAM_ID6);
    const base = { programId: a.programId, market: a.market, portfolio: r.portfolio, owner: r.owner, destToken, vaultToken: a.vaultToken };
    steps.push({ portfolio: r.portfolio, owner: r.owner, topup46: buildClaimResolvedPayoutTopupIxP3(base), closeResolved: buildCloseResolvedUnsignedIxP3(base) });
  }
  return { steps, needsHolder };
}

// src/solana/stake-wind-down.ts
import { TransactionInstruction as TransactionInstruction6 } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID as TOKEN_PROGRAM_ID7 } from "@solana/spl-token";
var MARKET_GROUP_HEADER_OFF_V18 = Object.freeze({
  vault: 285,
  insurance: 301,
  cTot: 317,
  sourceInsuranceCreditReservedTotalAtoms: 445,
  insuranceDomainBudgetRemainingTotal: 461,
  materializedPortfolioCount: 517,
  mode: 626
});
var ENGINE_ASSET_SLOT_OFF_V18 = Object.freeze({
  insuranceDomainBudgetLong: 515,
  insuranceDomainBudgetShort: 531,
  insuranceDomainSpentLong: 547,
  insuranceDomainSpentShort: 563,
  /** InsuranceCreditReservationV16Account; `insurance_credit_reserved_num` is its first u128. */
  insuranceReservationLong: 1157,
  insuranceReservationShort: 1229
});
var ASSET_WRAPPER_LEN = 1024;
var ENGINE_BOUND_SCALE = 1000000000000n;
var MARKET_MODE_V18 = Object.freeze({ Live: 0, Resolved: 1, Recovery: 2 });
function u1282(d, o) {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return v.getBigUint64(o + 8, true) << 64n | v.getBigUint64(o, true);
}
function u64(d, o) {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(o, true);
}
var min = (a, b) => a < b ? a : b;
var subSat = (a, b) => a > b ? a - b : 0n;
var ceilDiv2 = (a, b) => (a + b - 1n) / b;
function decodeTerminalInsuranceCapacity(marketData, assetIndex = 0) {
  if (marketData[V17_KIND_OFF] !== 1) throw new Error(`not a market account (kind ${marketData[V17_KIND_OFF]})`);
  const H = V17_MARKET_GROUP_OFF;
  const hdr = MARKET_GROUP_HEADER_OFF_V18;
  const slotBase = H + V17_MARKET_GROUP_LEN + assetIndex * V17_MARKET_ASSET_SLOT_LEN + ASSET_WRAPPER_LEN;
  const E = ENGINE_ASSET_SLOT_OFF_V18;
  if (!Number.isInteger(assetIndex) || assetIndex < 0 || marketData.length < slotBase + E.insuranceReservationShort + 16) {
    throw new Error(`market account too short for asset ${assetIndex}`);
  }
  const vault = u1282(marketData, H + hdr.vault);
  const insurance = u1282(marketData, H + hdr.insurance);
  const sourceReserved = u1282(marketData, H + hdr.sourceInsuranceCreditReservedTotalAtoms);
  const globalAvailable = subSat(insurance, sourceReserved);
  const mode = marketData[H + hdr.mode];
  const dom = (side) => {
    const L = side === "long";
    const budget = u1282(marketData, slotBase + (L ? E.insuranceDomainBudgetLong : E.insuranceDomainBudgetShort));
    const spent = u1282(marketData, slotBase + (L ? E.insuranceDomainSpentLong : E.insuranceDomainSpentShort));
    const reservedAtoms = ceilDiv2(u1282(marketData, slotBase + (L ? E.insuranceReservationLong : E.insuranceReservationShort)), ENGINE_BOUND_SCALE);
    const budgetRemaining = subSat(subSat(budget, spent), reservedAtoms);
    return {
      domain: assetIndex * 2 + (L ? 0 : 1),
      side,
      budget,
      spent,
      reservedAtoms,
      budgetRemaining,
      withdrawCapacity: min(min(globalAvailable, budgetRemaining), vault)
    };
  };
  const domains = [dom("long"), dom("short")];
  const sum = domains[0].withdrawCapacity + domains[1].withdrawCapacity;
  return {
    assetIndex,
    mode,
    resolved: mode === MARKET_MODE_V18.Resolved,
    vault,
    insurance,
    cTot: u1282(marketData, H + hdr.cTot),
    materializedPortfolioCount: u64(marketData, H + hdr.materializedPortfolioCount),
    sourceInsuranceCreditReservedTotalAtoms: sourceReserved,
    globalAvailable,
    headerBudgetRemainingTotal: u1282(marketData, H + hdr.insuranceDomainBudgetRemainingTotal),
    assetBudgetRemaining: subSat(domains[0].budget, domains[0].spent) + subSat(domains[1].budget, domains[1].spent),
    domains,
    terminalCapacity: min(min(sum, globalAvailable), vault)
  };
}
function buildRecoverTerminalInsuranceIx(a, amount) {
  return new TransactionInstruction6({
    programId: a.stakeProgram,
    keys: recoverTerminalInsuranceAccounts(a),
    data: Buffer.from(encodeStakeRecoverTerminalInsurance(amount))
  });
}
function buildAdminCloseSlabIx(a) {
  return new TransactionInstruction6({
    programId: a.stakeProgram,
    keys: adminCloseSlabAccounts(a),
    data: Buffer.from(encodeStakeAdminCloseSlab())
  });
}
function planStakeWindDown(a) {
  const cap = decodeTerminalInsuranceCapacity(a.marketData, 0);
  if (!cap.resolved) throw new Error(`planStakeWindDown: market mode ${cap.mode} is not Resolved (1)`);
  const tokenProgram = a.tokenProgram ?? TOKEN_PROGRAM_ID7;
  const [wrapperVaultAuthority] = deriveVaultAuthority(a.wrapperProgram, a.market);
  const base = {
    stakeProgram: a.stakeProgram,
    caller: a.caller,
    pool: a.pool,
    poolVault: a.poolVault,
    vaultAuth: a.vaultAuth,
    market: a.market,
    wrapperVault: a.wrapperVault,
    wrapperVaultAuthority,
    wrapperProgram: a.wrapperProgram,
    tokenProgram
  };
  const steps = [{ step: "closePortfolios", ixs: a.closePortfolioIxs }];
  if (cap.terminalCapacity > 0n) {
    steps.push({
      step: "recoverTerminal",
      amount: cap.terminalCapacity,
      ix: buildRecoverTerminalInsuranceIx(base, cap.terminalCapacity),
      onCustomError: Object.freeze({ 21: "retryLater", 31: "done" })
    });
  }
  steps.push({
    step: "recoverTerminalBookOnly",
    ix: buildRecoverTerminalInsuranceIx({ ...base, stray: a.stray }, 0n),
    onCustomError: Object.freeze({ 31: "done" })
  });
  const claim = a.protocolFee ? new TransactionInstruction6({
    programId: a.wrapperProgram,
    keys: buildAccountMetas(ACCOUNTS_WITHDRAW_PROTOCOL_FEE, {
      authority: a.protocolFee.authority,
      market: a.market,
      destToken: a.protocolFee.destToken,
      vaultToken: a.wrapperVault,
      vaultAuthority: wrapperVaultAuthority,
      tokenProgram
    }),
    data: Buffer.from(encodeWithdrawProtocolFee({ amount: 0n, authorityEpoch: a.protocolFee.authorityEpoch }))
  }) : null;
  steps.push({
    step: "adminCloseSlab",
    repeatUntil: "tombstone",
    claimBetween: claim,
    ix: buildAdminCloseSlabIx({
      stakeProgram: a.stakeProgram,
      admin: a.admin,
      pool: a.pool,
      market: a.market,
      wrapperVault: a.wrapperVault,
      wrapperVaultAuthority,
      poolDestToken: a.poolDestToken,
      collateralMint: a.collateralMint,
      poolVault: a.poolVault,
      wrapperProgram: a.wrapperProgram,
      tokenProgram
    })
  });
  return steps;
}

// src/solana/p2b-earn.ts
import { PublicKey as PublicKey18, SystemProgram as SystemProgram4, TransactionInstruction as TransactionInstruction7 } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID as TOKEN_PROGRAM_ID8 } from "@solana/spl-token";
function deriveVaultLpExtP2b(programId, market) {
  return PublicKey18.findProgramAddressSync([new TextEncoder().encode(VAULT_LP_EXT_SEED_P2B), market.toBytes()], programId);
}
function isLpVaultRegistryExtP2b(registryData) {
  if (registryData.length <= LP_VAULT_REGISTRY_EXT_FLAG_OFF_P2B) throw new Error("registry account too short for the ext flag");
  const b = registryData[LP_VAULT_REGISTRY_EXT_FLAG_OFF_P2B];
  if (b !== 0 && b !== 1) throw new Error(`registry ext flag must be 0|1, got ${b}`);
  return b === 1;
}
function dv3(d) {
  return new DataView(d.buffer, d.byteOffset, d.byteLength);
}
function u128At(v, o) {
  return v.getBigUint64(o + 8, true) << 64n | v.getBigUint64(o, true);
}
function decodeVaultLpExtV19(data) {
  if (data.length < VAULT_LP_EXT_ACCOUNT_LEN_P2B) throw new Error(`VaultLpExtV19: need ${VAULT_LP_EXT_ACCOUNT_LEN_P2B} bytes, got ${data.length}`);
  const v = dv3(data);
  if (v.getBigUint64(0, true) !== V17_MAGIC) throw new Error("VaultLpExtV19: invalid v17 magic");
  if (v.getUint16(8, true) !== V17_EXPECTED_VERSION) throw new Error(`VaultLpExtV19: invalid v17 version ${v.getUint16(8, true)}`);
  if (data[V17_KIND_OFF] !== KIND_VAULT_LP_EXT_P2B) throw new Error(`VaultLpExtV19: kind ${data[V17_KIND_OFF]} != ${KIND_VAULT_LP_EXT_P2B}`);
  const B = 16;
  const F = VAULT_LP_EXT_FIELD_OFF_P2B;
  const marketGroup = new PublicKey18(data.subarray(B + F.marketGroup, B + F.marketGroup + 32));
  const out = {
    marketGroup,
    allocatedAtoms: u128At(v, B + F.allocatedAtoms),
    cushionAccruedAtoms: u128At(v, B + F.cushionAccruedAtoms),
    allocatedTotalAtoms: u128At(v, B + F.allocatedTotalAtoms),
    deallocatedTotalAtoms: u128At(v, B + F.deallocatedTotalAtoms),
    allocAlphaBps: v.getUint16(B + F.allocAlphaBps, true),
    allocBufferBps: v.getUint16(B + F.allocBufferBps, true),
    cushionTargetBps: v.getUint16(B + F.cushionTargetBps, true),
    cushionShareBps: v.getUint16(B + F.cushionShareBps, true),
    version: data[B + F.version],
    bump: data[B + F.bump]
  };
  const zero = (o, n) => data.subarray(B + o, B + o + n).every((b) => b === 0);
  if (out.version !== VAULT_LP_EXT_VERSION_P2B || marketGroup.equals(PublicKey18.default) || out.allocAlphaBps > ALLOC_ALPHA_MAX_BPS_P2B || out.allocBufferBps < ALLOC_BUFFER_MIN_BPS_P2B || out.allocBufferBps > 1e4 || out.cushionTargetBps > 1e4 || out.cushionShareBps > 1e4 || out.cushionTargetBps === 0 !== (out.cushionShareBps === 0) || !zero(F.padding, 6) || !zero(F.reserved, 16)) {
    throw new Error("VaultLpExtV19: invalid record \u2014 the program would reject it too");
  }
  return out;
}
async function fetchVaultLpExtP2b(conn, programId, market) {
  const info = await conn.getAccountInfo(deriveVaultLpExtP2b(programId, market)[0]);
  if (!info) return null;
  return decodeVaultLpExtV19(new Uint8Array(info.data));
}
function buildVaultLpAllocateIxP2b(m, cranker, amount = U128_MAX_P2B) {
  return new TransactionInstruction7({
    programId: m.programId,
    keys: buildAccountMetas(ACCOUNTS_VAULT_LP_ALLOCATE_P2B, {
      cranker,
      market: m.market,
      registry: deriveLpVaultRegistry(m.programId, m.market)[0],
      vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
      lpPortfolio: m.lpPortfolio,
      ledger: deriveLpBackingLedger(m.programId, m.market, m.registryDomain)[0],
      siblingLedger: deriveLpBackingLedger(m.programId, m.market, m.registryDomain ^ 1)[0],
      vaultLpExt: deriveVaultLpExtP2b(m.programId, m.market)[0],
      systemProgram: SystemProgram4.programId
    }),
    data: Buffer.from(encodeVaultLpAllocateP2b(amount))
  });
}
function buildSetVaultLpRiskV19IxP2b(programId, market, upgradeAuthority, args) {
  return new TransactionInstruction7({
    programId,
    keys: buildAccountMetas(ACCOUNTS_SET_VAULT_LP_RISK_V19_P2B, {
      upgradeAuthority,
      programData: deriveProgramDataAddressP3(programId)[0],
      market,
      registry: deriveLpVaultRegistry(programId, market)[0],
      vaultLpExt: deriveVaultLpExtP2b(programId, market)[0],
      systemProgram: SystemProgram4.programId
    }),
    data: Buffer.from(encodeSetVaultLpRiskV19P2b(args))
  });
}
function withCrankFeesBoundTailP2b(base, m) {
  return withBoundVaultLpTailP3(base, deriveVaultLpStateP3(m.programId, m.market)[0], m.lpPortfolio, { vaultLpExt: m.vaultLpExt });
}
function buildExecuteRedemptionIxNonBoundP2b(m, cranker, redeemer, redeemerDest, vaultToken, sourceDomain, opts = {}) {
  const [registry] = deriveLpVaultRegistry(m.programId, m.market);
  const w = (pubkey, isSigner = false) => ({ pubkey, isSigner, isWritable: true });
  const r = (pubkey) => ({ pubkey, isSigner: false, isWritable: false });
  return new TransactionInstruction7({
    programId: m.programId,
    data: Buffer.from(encodeExecuteRedemption({ domain: sourceDomain })),
    keys: [
      w(cranker, true),
      w(m.market),
      w(registry),
      w(deriveLpRedemption(m.programId, registry, redeemer)[0]),
      w(deriveInsuranceLpMint(m.programId, m.market)[0]),
      w(deriveLpEscrow(m.programId, m.market)[0]),
      w(vaultToken),
      r(deriveVaultAuthority(m.programId, m.market)[0]),
      w(deriveLpBackingLedger(m.programId, m.market, m.registryDomain)[0]),
      w(redeemerDest),
      r(TOKEN_PROGRAM_ID8),
      w(deriveLpBackingLedger(m.programId, m.market, m.registryDomain ^ 1)[0]),
      w(redeemer, opts.redeemerSigns !== false)
    ]
  });
}
function decodeBackingDomainLedgerP2b(data) {
  if (data.length !== BACKING_DOMAIN_LEDGER_ACCOUNT_LEN_P2B) throw new Error(`BackingDomainLedger: need exactly ${BACKING_DOMAIN_LEDGER_ACCOUNT_LEN_P2B} bytes, got ${data.length}`);
  const v = dv3(data);
  if (v.getBigUint64(0, true) !== V17_MAGIC) throw new Error("BackingDomainLedger: invalid v17 magic");
  if (v.getUint16(8, true) !== V17_EXPECTED_VERSION) throw new Error(`BackingDomainLedger: invalid v17 version ${v.getUint16(8, true)}`);
  if (data[V17_KIND_OFF] !== KIND_BACKING_DOMAIN_LEDGER_P2B) throw new Error(`BackingDomainLedger: kind ${data[V17_KIND_OFF]} != ${KIND_BACKING_DOMAIN_LEDGER_P2B}`);
  const B = 16;
  const F = BACKING_DOMAIN_LEDGER_FIELD_OFF_P2B;
  const marketGroup = new PublicKey18(data.subarray(B + F.marketGroup, B + F.marketGroup + 32));
  const authority = new PublicKey18(data.subarray(B + F.authority, B + F.authority + 32));
  if (marketGroup.equals(PublicKey18.default) || authority.equals(PublicKey18.default) || !data.subarray(B + F.padding, B + F.padding + 6).every((b) => b === 0)) {
    throw new Error("BackingDomainLedger: invalid record \u2014 the program would reject it too");
  }
  return {
    marketGroup,
    authority,
    totalPrincipalAtoms: u128At(v, B + F.totalPrincipalAtoms),
    totalDepositedAtoms: u128At(v, B + F.totalDepositedAtoms),
    totalPrincipalWithdrawnAtoms: u128At(v, B + F.totalPrincipalWithdrawnAtoms),
    totalEarningsAtoms: u128At(v, B + F.totalEarningsAtoms),
    totalEarningsWithdrawnAtoms: u128At(v, B + F.totalEarningsWithdrawnAtoms),
    lastObservedBucketEarningsAtoms: u128At(v, B + F.lastObservedBucketEarningsAtoms),
    cumulativeLossAtoms: u128At(v, B + F.cumulativeLossAtoms),
    cumulativeRecoveryAtoms: u128At(v, B + F.cumulativeRecoveryAtoms),
    lastObservedUnavailablePrincipalAtoms: u128At(v, B + F.lastObservedUnavailablePrincipalAtoms),
    domain: v.getUint16(B + F.domain, true),
    marketId: v.getBigUint64(B + F.marketId, true)
  };
}
function readPotEngineRecordsP2b(marketData, domain) {
  if (marketData[V17_KIND_OFF] !== 1) throw new Error(`not a market account (kind ${marketData[V17_KIND_OFF]})`);
  if (!Number.isInteger(domain) || domain < 0) throw new Error(`bad domain ${domain}`);
  const asset = domain >> 1;
  const short = (domain & 1) === 1;
  const engineBase = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + asset * V17_MARKET_ASSET_SLOT_LEN + V17_ASSET_SLOT_WRAPPER_LEN;
  const scOff = engineBase + (short ? SOURCE_CREDIT_REL_P2B.short : SOURCE_CREDIT_REL_P2B.long);
  const bkOff = engineBase + (short ? V17_ENGINE_BACKING_SHORT_REL : V17_ENGINE_BACKING_LONG_REL);
  if (marketData.length < bkOff + 97 || marketData.length < scOff + SOURCE_CREDIT_LEN_P2B) throw new Error(`market account too short for domain ${domain}`);
  const v = dv3(marketData);
  const S = SOURCE_CREDIT_FIELD_OFF_P2B;
  const K = BACKING_BUCKET_FIELD_OFF_P2B;
  return {
    freshUnlienedBackingNum: u128At(v, bkOff + K.freshUnlienedBackingNum),
    validLienedBackingNum: u128At(v, bkOff + K.validLienedBackingNum),
    utilizationFeeEarnings: u128At(v, bkOff + K.utilizationFeeEarnings),
    positiveClaimBoundNum: u128At(v, scOff + S.positiveClaimBoundNum),
    insuranceCreditReservedNum: u128At(v, scOff + S.insuranceCreditReservedNum),
    validLienedInsuranceNum: u128At(v, scOff + S.validLienedInsuranceNum),
    impairedLienedInsuranceNum: u128At(v, scOff + S.impairedLienedInsuranceNum)
  };
}
function nonboundPotFromRecordsP2b(rec, ledger) {
  const principal = ledger?.totalPrincipalAtoms ?? 0n;
  let earnings = ledger?.totalEarningsAtoms ?? 0n;
  const watermark = ledger?.lastObservedBucketEarningsAtoms ?? rec.utilizationFeeEarnings;
  if (rec.utilizationFeeEarnings >= watermark) earnings += rec.utilizationFeeEarnings - watermark;
  return {
    totalPrincipalAtoms: principal,
    totalEarningsAtoms: earnings,
    totalEarningsWithdrawnAtoms: ledger?.totalEarningsWithdrawnAtoms ?? 0n,
    physicalNetAtoms: potPhysicalNetAtomsP2b(
      rec.freshUnlienedBackingNum,
      rec.validLienedBackingNum,
      rec.positiveClaimBoundNum,
      insuranceCoverNumP2b(rec.insuranceCreditReservedNum, rec.validLienedInsuranceNum, rec.impairedLienedInsuranceNum),
      BOUND_SCALE_P2B
    )
  };
}
function nonboundVaultPricingFromAccountsP2b(a) {
  const pot = (domain, ledgerData) => nonboundPotFromRecordsP2b(readPotEngineRecordsP2b(a.marketData, domain), ledgerData && ledgerData.length > 0 ? decodeBackingDomainLedgerP2b(ledgerData) : null);
  return nonboundVaultPricingP2b(pot(a.registryDomain, a.ownLedgerData), pot(a.registryDomain ^ 1, a.siblingLedgerData), a.feeShareBps);
}

// src/runtime/tx.ts
import {
  TransactionInstruction as TransactionInstruction8,
  Transaction,
  ComputeBudgetProgram
} from "@solana/web3.js";
var CONFIRMATION_RANK = {
  processed: 0,
  confirmed: 1,
  finalized: 2
};
function requiredConfirmationRank(commitment) {
  switch (commitment) {
    case "confirmed":
    case "single":
    case "singleGossip":
      return CONFIRMATION_RANK.confirmed;
    case "finalized":
    case "max":
    case "root":
      return CONFIRMATION_RANK.finalized;
    case "processed":
    case "recent":
    default:
      return CONFIRMATION_RANK.processed;
  }
}
function meetsCommitment(observed, required) {
  if (!observed) return false;
  return CONFIRMATION_RANK[observed] >= requiredConfirmationRank(required);
}
function buildIx(params) {
  return new TransactionInstruction8({
    programId: params.programId,
    keys: params.keys,
    // TransactionInstruction types expect Buffer, but Uint8Array works at runtime.
    // Cast to avoid Buffer polyfill issues in the browser.
    data: params.data
  });
}
var MAX_COMPUTE_UNIT_LIMIT = 14e5;
var V17_WRAPPER_HEAP_FRAME_BYTES = 128 * 1024;
var MIN_HEAP_FRAME_BYTES = 32 * 1024;
var MAX_HEAP_FRAME_BYTES = 256 * 1024;
async function simulateOrSend(params) {
  const {
    connection,
    ix: ix2,
    signers,
    simulate,
    commitment,
    computeUnitLimit,
    heapFrameBytes = V17_WRAPPER_HEAP_FRAME_BYTES
  } = params;
  const effectiveCommitment = commitment ?? (simulate ? "confirmed" : "finalized");
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
  if (heapFrameBytes !== 0) {
    if (typeof heapFrameBytes !== "number" || !Number.isInteger(heapFrameBytes) || heapFrameBytes % 1024 !== 0 || heapFrameBytes < MIN_HEAP_FRAME_BYTES || heapFrameBytes > MAX_HEAP_FRAME_BYTES) {
      throw new Error(
        `heapFrameBytes must be 0 or a multiple of 1024 in [${MIN_HEAP_FRAME_BYTES}, ${MAX_HEAP_FRAME_BYTES}]`
      );
    }
  }
  const tx = new Transaction();
  if (heapFrameBytes !== 0) {
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: heapFrameBytes }));
  }
  if (computeUnitLimit !== void 0) {
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnitLimit
      })
    );
  }
  tx.add(ix2);
  const latestBlockhash = await connection.getLatestBlockhash(effectiveCommitment);
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
    preflightCommitment: effectiveCommitment
  };
  let signature;
  try {
    signature = await connection.sendTransaction(tx, signers, options);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      signature: "",
      slot: 0,
      err: message,
      logs: []
    };
  }
  const txFinality = effectiveCommitment === "finalized" ? "finalized" : "confirmed";
  try {
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      },
      effectiveCommitment
    );
    const txInfo = await connection.getTransaction(signature, {
      commitment: txFinality,
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
    try {
      const status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true
      });
      if (status.value && meetsCommitment(status.value.confirmationStatus, effectiveCommitment)) {
        const txInfo = await connection.getTransaction(signature, {
          commitment: txFinality,
          maxSupportedTransactionVersion: 0
        });
        const logs = txInfo?.meta?.logMessages ?? [];
        let err = null;
        let hint;
        if (status.value.err) {
          const parsed = parseErrorFromLogs(logs);
          if (parsed) {
            err = `${parsed.name} (0x${parsed.code.toString(16)})`;
            hint = parsed.hint;
          } else {
            err = JSON.stringify(status.value.err);
          }
        }
        return {
          signature,
          // `SignatureStatus.slot` is the slot the transaction was PROCESSED in.
          // `status.context.slot` is the RPC's head slot at query time — a
          // different, much later number — so it must not be used as the tx slot.
          slot: txInfo?.slot ?? status.value.slot,
          err,
          hint,
          logs
        };
      }
      if (status.value) {
        const observed = status.value.confirmationStatus ?? "unknown";
        return {
          signature,
          slot: status.value.slot,
          err: `confirmation status unknown (${message}) \u2014 transaction is only "${observed}" but "${effectiveCommitment}" was required; it may still be dropped or may settle. Check signature ${signature} before retrying`,
          logs: []
        };
      }
    } catch {
    }
    return {
      signature,
      slot: 0,
      err: `confirmation status unknown (${message}) \u2014 the transaction may have already landed; check signature ${signature} before retrying`,
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
import { PublicKey as PublicKey20, Transaction as Transaction2 } from "@solana/web3.js";
var LIGHTHOUSE_PROGRAM_ID = new PublicKey20(
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
function isLighthouseInstruction(ix2) {
  return ix2.programId.equals(LIGHTHOUSE_PROGRAM_ID);
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
      (ix2) => ix2.programId.equals(percolatorProgramId)
    );
    if (!hasPercolatorIx) {
      return instructions;
    }
  }
  return instructions.filter((ix2) => !isLighthouseInstruction(ix2));
}
function stripLighthouseFromTransaction(transaction, percolatorProgramId) {
  if (percolatorProgramId) {
    const hasPercolatorIx = transaction.instructions.some(
      (ix2) => ix2.programId.equals(percolatorProgramId)
    );
    if (!hasPercolatorIx) return transaction;
  }
  const hasLighthouse = transaction.instructions.some(isLighthouseInstruction);
  if (!hasLighthouse) return transaction;
  const clean = new Transaction2();
  clean.recentBlockhash = transaction.recentBlockhash;
  clean.feePayer = transaction.feePayer;
  for (const ix2 of transaction.instructions) {
    if (!isLighthouseInstruction(ix2)) {
      clean.add(ix2);
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
  const MAX_DISPLAY = BigInt(Number.MAX_SAFE_INTEGER);
  if (scaledPct > MAX_DISPLAY) return Number.MAX_SAFE_INTEGER / 100;
  if (scaledPct < -MAX_DISPLAY) return -(Number.MAX_SAFE_INTEGER / 100);
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
  if (fundingRateBpsPerSlot > MAX_SAFE_BIGINT) return Infinity;
  if (fundingRateBpsPerSlot < MIN_SAFE_BIGINT) return -Infinity;
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
  return 1e4 / Number(initialMarginBps);
}
function computeMaxLeverageFloor(initialMarginBps) {
  if (initialMarginBps <= 0n) {
    throw new Error("computeMaxLeverageFloor: initialMarginBps must be positive");
  }
  return 10000n / initialMarginBps;
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
  const maxLev = computeMaxLeverageFloor(initialMarginBps);
  if (warmupPeriodSlots === 0n || warmupStartSlot === 0n) return Number(maxLev);
  if (totalCapital <= 0n) return 1;
  const unlocked = computeWarmupUnlockedCapital(
    totalCapital,
    currentSlot,
    warmupStartSlot,
    warmupPeriodSlots
  );
  if (unlocked <= 0n) return 1;
  const effectiveLev = Number(maxLev * unlocked / totalCapital);
  return Math.max(1, effectiveLev);
}
function computeWarmupMaxPositionSize(initialMarginBps, totalCapital, currentSlot, warmupStartSlot, warmupPeriodSlots) {
  const maxLev = computeMaxLeverageFloor(initialMarginBps);
  const unlocked = computeWarmupUnlockedCapital(
    totalCapital,
    currentSlot,
    warmupStartSlot,
    warmupPeriodSlots
  );
  return unlocked * maxLev;
}

// src/validation.ts
import { PublicKey as PublicKey21 } from "@solana/web3.js";
var U16_MAX3 = 65535;
var U64_MAX3 = BigInt("18446744073709551615");
var I64_MIN = BigInt("-9223372036854775808");
var I64_MAX = BigInt("9223372036854775807");
var U128_MAX3 = (1n << 128n) - 1n;
var I128_MIN2 = -(1n << 127n);
var I128_MAX2 = (1n << 127n) - 1n;
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
    return new PublicKey21(value);
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
  if (bi > BigInt(U16_MAX3)) {
    throw new ValidationError(
      field,
      `must be <= ${U16_MAX3} (u16 max), got ${t}`
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
  if (num > U64_MAX3) {
    throw new ValidationError(
      field,
      `must be <= ${U64_MAX3} (u64 max), got ${num}`
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
  if (num > U128_MAX3) {
    throw new ValidationError(
      field,
      `must be <= ${U128_MAX3} (u128 max), got ${num}`
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
  if (num < I128_MIN2) {
    throw new ValidationError(
      field,
      `must be >= ${I128_MIN2} (i128 min), got ${num}`
    );
  }
  if (num > I128_MAX2) {
    throw new ValidationError(
      field,
      `must be <= ${I128_MAX2} (i128 max), got ${num}`
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
  if (bi > BigInt(U16_MAX3)) {
    throw new ValidationError(
      field,
      `must be <= ${U16_MAX3} (u16 max), got ${t}`
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
  const v3Row = json[mint];
  if (isRecord(v3Row) && v3Row.usdPrice !== void 0 && v3Row.usdPrice !== null) {
    const price2 = parseFloat(String(v3Row.usdPrice)) || 0;
    if (price2 <= 0) return null;
    const liquidity = typeof v3Row.liquidity === "number" && Number.isFinite(v3Row.liquidity) ? v3Row.liquidity : 0;
    return { price: price2, mintSymbol: "?", liquidity };
  }
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
  return { price, mintSymbol, liquidity: 0 };
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
      `https://api.jup.ag/price/v3?ids=${encodeURIComponent(mint)}`,
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
      // v3 reports aggregate routable liquidity; v2 did not (falls back to 0).
      // Used below to decide whether Jupiter is a credible enough reference to
      // demote a disagreeing pool.
      liquidity: row.liquidity,
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
  const MAX_ENRICHMENT_DEVIATION = 0.05;
  const DISTRUST_CONFIDENCE_MARGIN = 1;
  if (jupiterSource && jupiterSource.price > 0) {
    const jupiterIsCredible = jupiterSource.liquidity > 0;
    const distrusted = Math.max(0, jupiterSource.confidence - DISTRUST_CONFIDENCE_MARGIN);
    if (jupiterIsCredible) {
      for (const dex of dexSources) {
        const nonPythMid = (dex.price + jupiterSource.price) / 2;
        const nonPythDeviation = Math.abs(dex.price - jupiterSource.price) / nonPythMid;
        if (nonPythDeviation > MAX_ENRICHMENT_DEVIATION) {
          dex.confidence = Math.min(dex.confidence, distrusted);
        }
      }
    }
  }
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
      if (deviation <= MAX_ENRICHMENT_DEVIATION) {
        enrichedPrice = mid;
      } else {
        console.warn(
          `[percolator-sdk] resolvePrice: DEX (${dexPrice}) and Jupiter (${jupPrice}) diverge by ${(deviation * 100).toFixed(1)}% > ${MAX_ENRICHMENT_DEVIATION * 100}% \u2014 Pyth enrichment skipped to prevent oracle manipulation.`
        );
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
  ACCOUNTS_ADL_WIND_DOWN,
  ACCOUNTS_ADMIN_FORCE_CLOSE,
  ACCOUNTS_ADVANCE_ORACLE_PHASE,
  ACCOUNTS_ATTEST_CROSS_MARGIN,
  ACCOUNTS_AUDIT_CRANK,
  ACCOUNTS_BURN_POSITION_NFT,
  ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL,
  ACCOUNTS_CHALLENGE_SETTLEMENT,
  ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL,
  ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP,
  ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP_UNSIGNED,
  ACCOUNTS_CLEAR_PENDING_SETTLEMENT,
  ACCOUNTS_CLOSE_ACCOUNT,
  ACCOUNTS_CLOSE_ORPHAN_SLAB,
  ACCOUNTS_CLOSE_RESOLVED,
  ACCOUNTS_CLOSE_RESOLVED_UNSIGNED,
  ACCOUNTS_CLOSE_SLAB,
  ACCOUNTS_CLOSE_SLAB_SECONDARY,
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
  ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3,
  ACCOUNTS_DEPOSIT_LP_COLLATERAL,
  ACCOUNTS_EXECUTE_ADL,
  ACCOUNTS_EXPIRE_BACKING_BUCKET,
  ACCOUNTS_FORCE_CLOSE_RESOLVED,
  ACCOUNTS_FUND_MARKET_INSURANCE,
  ACCOUNTS_INIT_LP,
  ACCOUNTS_INIT_MARKET,
  ACCOUNTS_INIT_MATCHER_CTX,
  ACCOUNTS_INIT_USER,
  ACCOUNTS_INIT_VAULT_LP_P3,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_LIQUIDATE_AT_ORACLE,
  ACCOUNTS_LP_VAULT_CRANK_FEES,
  ACCOUNTS_LP_VAULT_DEPOSIT,
  ACCOUNTS_LP_VAULT_WITHDRAW,
  ACCOUNTS_MINT_POSITION_NFT,
  ACCOUNTS_NFT_BURN,
  ACCOUNTS_NFT_EMERGENCY_BURN,
  ACCOUNTS_NFT_ESCROW_PROOF,
  ACCOUNTS_NFT_HOLDER_AUTH,
  ACCOUNTS_NFT_MINT,
  ACCOUNTS_NFT_RECONCILE,
  ACCOUNTS_PAUSE_MARKET,
  ACCOUNTS_PERMISSIONLESS_CRANK_BASE,
  ACCOUNTS_PUSH_AUTH_MARK,
  ACCOUNTS_PUSH_EWMA_MARK,
  ACCOUNTS_QUEUE_WITHDRAWAL,
  ACCOUNTS_REBALANCE_LP_VAULT_BACKING,
  ACCOUNTS_REBALANCE_REDUCE,
  ACCOUNTS_RECLAIM_EMPTY_ACCOUNT,
  ACCOUNTS_RECLAIM_SLAB_RENT,
  ACCOUNTS_RESCUE_ORPHAN_VAULT,
  ACCOUNTS_RESOLVE_DISPUTE,
  ACCOUNTS_RESOLVE_MARKET,
  ACCOUNTS_RESOLVE_PERMISSIONLESS,
  ACCOUNTS_RESTART_ASSET_ORACLE,
  ACCOUNTS_SETTLE_ACCOUNT,
  ACCOUNTS_SET_ADL_WIND_DOWN_MAX_SLOTS,
  ACCOUNTS_SET_ASSET_RISK_LIMITS_P1,
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
  ACCOUNTS_SET_PROTOCOL_FEE_AUTHORITY,
  ACCOUNTS_SET_RISK_THRESHOLD,
  ACCOUNTS_SET_VAULT_LP_RISK_P3,
  ACCOUNTS_SET_VAULT_LP_RISK_V19_P2B,
  ACCOUNTS_SET_WALLET_CAP,
  ACCOUNTS_TOPUP_INSURANCE,
  ACCOUNTS_TOP_UP_BACKING_BUCKET,
  ACCOUNTS_TRADE_CPI,
  ACCOUNTS_TRADE_NOCPI,
  ACCOUNTS_TRANSFER_OWNERSHIP_CPI,
  ACCOUNTS_TRANSFER_POSITION_OWNERSHIP,
  ACCOUNTS_UNPAUSE_MARKET,
  ACCOUNTS_UPDATE_ADMIN,
  ACCOUNTS_UPDATE_AUTHORITY,
  ACCOUNTS_UPDATE_BACKING_FEE_POLICY,
  ACCOUNTS_UPDATE_CONFIG,
  ACCOUNTS_UPDATE_FEE_SPLIT,
  ACCOUNTS_UPDATE_HYPERP_MARK,
  ACCOUNTS_UPDATE_MAINTENANCE_FEE_PER_SLOT,
  ACCOUNTS_UPDATE_TRADE_FEE_POLICY,
  ACCOUNTS_VAULT_LP_ALLOCATE_P2B,
  ACCOUNTS_VAULT_LP_CONVERT_PNL_P3,
  ACCOUNTS_VAULT_LP_RECALL_P3,
  ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3,
  ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3,
  ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3,
  ACCOUNTS_VAULT_LP_SET_MATCHER_P3,
  ACCOUNTS_WITHDRAW_BACKING_BUCKET,
  ACCOUNTS_WITHDRAW_BACKING_BUCKET_EARNINGS,
  ACCOUNTS_WITHDRAW_COLLATERAL,
  ACCOUNTS_WITHDRAW_CREATOR_FEE,
  ACCOUNTS_WITHDRAW_INSURANCE,
  ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE,
  ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED,
  ACCOUNTS_WITHDRAW_INSURANCE_LP,
  ACCOUNTS_WITHDRAW_INSURANCE_RESERVE_TO_STAKE,
  ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3,
  ACCOUNTS_WITHDRAW_LP_COLLATERAL,
  ACCOUNTS_WITHDRAW_PROTOCOL_FEE,
  ADL_EPISODE_FIELD_OFF,
  ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS,
  ADL_WIND_DOWN_MAX_MARK_AGE_SLOTS,
  ALLOC_ALPHA_DEFAULT_BPS_P2B,
  ALLOC_ALPHA_MAX_BPS_P2B,
  ALLOC_BUFFER_DEFAULT_BPS_P2B,
  ALLOC_BUFFER_MIN_BPS_P2B,
  ALLOC_MIN_JUNIOR_BPS_P2B,
  ASSET_AUTH_KIND,
  ASSET_GROWTH_FIELD_OFF,
  ASSET_GROWTH_LEN,
  ASSET_GROWTH_SLOT_OFF,
  ASSET_GROWTH_VERSION_FIELD_OFF,
  ASSET_RISK_LIMITS_FIELD_OFF_P1,
  ASSET_RISK_LIMITS_LEN_P1,
  ASSET_RISK_LIMITS_SLOT_OFF_P1,
  ASSET_STATE_EFFECTIVE_PRICE_OFF_P3,
  ASSET_STATE_RAW_ORACLE_TARGET_PRICE_OFF_P3,
  ASSET_VAULT_LP_DRAW_LEN_P3,
  ASSET_VAULT_LP_DRAW_SLOT_OFF_P3,
  ASSET_VAULT_LP_FIELD_OFF_P3,
  ASSET_VAULT_LP_FLAG_BOUND_P3,
  ASSET_VAULT_LP_LEN_P3,
  ASSET_VAULT_LP_P2B_CREATOR_FEE_VESTING_P2B,
  ASSET_VAULT_LP_P2B_FLAGS_OFF_P3,
  ASSET_VAULT_LP_SLOT_OFF_P3,
  ASSET_WRAPPER_SLOT_LEN,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountKind,
  BACKING_BUCKET_FIELD_OFF_P2B,
  BACKING_DOMAIN_LEDGER_ACCOUNT_LEN_P2B,
  BACKING_DOMAIN_LEDGER_BODY_LEN_P2B,
  BACKING_DOMAIN_LEDGER_FIELD_OFF_P2B,
  BOUND_SCALE_P2B,
  BOUND_VAULT_LP_LEDGER_SLOTS_P3,
  BOUND_VAULT_LP_TAIL_INDEX_P3,
  BPF_LOADER_UPGRADEABLE_ID_P3,
  BackingBucketStatus,
  CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3,
  CHAINLINK_ANSWER_OFFSET,
  CHAINLINK_DECIMALS_OFFSET,
  CHAINLINK_MIN_SIZE,
  CHAINLINK_TIMESTAMP_OFFSET,
  CRANK_OBSERVATION_DECODE_MAX,
  CREATOR_LOCK_SEED,
  CTX_RETURN_OFFSET,
  CTX_VAMM_LEN,
  CTX_VAMM_OFFSET,
  CrankAction,
  DEFAULT_OI_RAMP_SLOTS,
  ENGINE_ASSET_SLOT_OFF_V18,
  ENGINE_BOUND_SCALE,
  ENGINE_MARK_PRICE_OFF,
  ENGINE_MAX_POSITION_ABS_Q_P3,
  ENGINE_OFF,
  EXPECTED_SLAB_VERSION,
  FEE_SPLIT,
  GROWTH_BATCH_MAX_LEGS,
  GROWTH_BPS,
  GROWTH_DEPTH_MULT,
  GROWTH_DIALS_NO_CLAMP_MAX_KINK_BPS,
  GROWTH_DIALS_NO_CLAMP_MAX_LAMBDA_BPS,
  GROWTH_LEVERAGE_X100_ONE,
  GROWTH_MAX_IMR_BPS,
  GROWTH_MAX_LAMBDA_BPS,
  GROWTH_MAX_POSITION_ABS_Q,
  GROWTH_PIN_LP_FLOOR_ATOMS,
  GROWTH_PIN_MATCHER_EXT_MODE,
  GROWTH_PIN_MATCHER_KIND,
  GROWTH_PIN_MAX_REQUESTED_FEE_BPS,
  GROWTH_POS_SCALE,
  GROWTH_U64_MAX,
  GROWTH_UTIL_FEE_DEFAULT_BPS,
  GROWTH_UTIL_FEE_HARD_MAX_BPS,
  GROWTH_VERSION,
  HEX_RE,
  INIT_CTX_LEN,
  INIT_MATCHER_CTX_V17_LEN,
  IX_TAG,
  IX_TAG_P1,
  IX_TAG_P2B,
  IX_TAG_P2B_EARN,
  IX_TAG_P3,
  KIND_BACKING_DOMAIN_LEDGER_P2B,
  KIND_VAULT_LP_EXT_P2B,
  LIGHTHOUSE_CONSTRAINT_ADDRESS,
  LIGHTHOUSE_ERROR_CODES,
  LIGHTHOUSE_PROGRAM_ID,
  LIGHTHOUSE_PROGRAM_ID_STR,
  LIGHTHOUSE_USER_MESSAGE,
  LP_VAULT_MINIMUM_LIQUIDITY_P3,
  LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3,
  LP_VAULT_REGISTRY_EXT_FLAG_OFF_P2B,
  MARKET_GROUP_HEADER_OFF_V18,
  MARKET_MODE_V18,
  MARK_PRICE_EMA_ALPHA_E6,
  MARK_PRICE_EMA_WINDOW_SLOTS,
  MATCHER_BACKING_FEE_CAP_BPS_MAX,
  MATCHER_BATCH_HEADER_LEN,
  MATCHER_BATCH_LEG_LEN,
  MATCHER_CALL_EXT_FLAG,
  MATCHER_CALL_EXT_FLAG_TAKER_REDUCING,
  MATCHER_CALL_EXT_LEN,
  MATCHER_CALL_EXT_OFFSET,
  MATCHER_CALL_EXT_V2_LEN,
  MATCHER_CALL_EXT_V3_LEN,
  MATCHER_CALL_EXT_VERSION_V1,
  MATCHER_CALL_EXT_VERSION_V2,
  MATCHER_CALL_EXT_VERSION_V3,
  MATCHER_CALL_LEN,
  MATCHER_CONFIGURE_AUTH_LP_PDA,
  MATCHER_CONFIGURE_AUTH_OWNER_PROOF,
  MATCHER_CONFIGURE_HEADER_LP_PDA_LEN,
  MATCHER_CONFIGURE_HEADER_OWNER_PROOF_LEN,
  MATCHER_CONFIGURE_OP_BACKING_FEE_CAP,
  MATCHER_CONFIGURE_OP_SET_PARAMS,
  MATCHER_CONFIGURE_TAG,
  MATCHER_CONTEXT_LEN,
  MATCHER_EXT_MODE_V1_P1,
  MATCHER_KIND,
  MATCHER_MAGIC,
  MATCHER_REQUESTED_FEE_BPS_MAX,
  MATCHER_RETURN_FLAG_BACKING_FEE_CAP_MASK,
  MATCHER_RETURN_FLAG_BACKING_FEE_CAP_SHIFT,
  MATCHER_RETURN_FLAG_PARTIAL_OK,
  MATCHER_RETURN_FLAG_REJECTED,
  MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK,
  MATCHER_RETURN_FLAG_REQUESTED_FEE_SHIFT,
  MATCHER_RETURN_FLAG_VALID,
  MATCHER_RETURN_KNOWN_FLAGS,
  MATCHER_RETURN_KNOWN_FLAGS_V2,
  MATCHER_RETURN_LEN,
  MATCHER_SET_PARAMS_LEN,
  MATCHER_V2_BLOCK_ACCOUNT_OFFSET,
  MATCHER_V2_BLOCK_CTX_OFFSET,
  MATCHER_V2_BLOCK_LEN,
  MATCHER_V2_BLOCK_VERSION,
  MATCHER_V2_ERRORS,
  MATCHER_V2_FLAG_STALE_ALLOW_REDUCING,
  MATCHER_V2_MAX_IMPACT_K_BPS,
  MAX_BACKING_BUCKET_EXPIRY_SLOT,
  MAX_DECIMALS,
  MAX_EXEC_BAND_BPS_P1,
  MAX_INSURANCE_WITHDRAW_COOLDOWN_SLOTS,
  MAX_LP_EXPOSURE_K_BPS_P1,
  MAX_OI_SIDE_Q_P1,
  MAX_REQUESTED_FEE_BPS_P1,
  METEORA_DLMM_PROGRAM_ID,
  NFT_IX_TAG,
  NFT_PROGRAM_ID,
  ORACLE_PHASE_GROWING,
  ORACLE_PHASE_MATURE,
  ORACLE_PHASE_NASCENT,
  P2B_SENIOR_FLOOR_RECORD_OFF,
  P2B_SENIOR_FLOOR_SLOT_OFF,
  PERCOLATOR_ERRORS,
  PERCOLATOR_VAULT_TOKEN_PROGRAM_ID,
  PHASE1_MIN_SLOTS,
  PHASE1_VOLUME_MIN_SLOTS,
  PHASE2_MATURITY_SLOTS,
  PHASE2_VOLUME_THRESHOLD,
  POSITION_NFT_STATE_LEN,
  POS_SCALE_P3,
  PROGRAM_IDS,
  PROGRAM_IDS_DEVNET_V1,
  PROGRAM_IDS_V17,
  PROGRAM_ID_V17,
  PUBLIC_B_CHUNK_ATOMS_UNLIMITED,
  PUMPSWAP_PROGRAM_ID,
  PYTH_PUSH_ORACLE_PROGRAM_ID,
  PYTH_RECEIVER_PROGRAM_ID,
  PYTH_SOLANA_FEEDS,
  RAMP_START_BPS,
  RAYDIUM_CLMM_PROGRAM_ID,
  RECOMMENDED_CU_P3,
  RENOUNCE_ADMIN_CONFIRMATION,
  RESOLVED_RECEIPT_ACCOUNT_OFF_P3,
  RESOLVED_RECEIPT_LEN_P3,
  RESOLVE_MODE_DEGENERATE,
  RESOLVE_MODE_ORDINARY,
  R_GAP_MIN_LIQUIDATION_SLOTS,
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
  SOURCE_CREDIT_FIELD_OFF_P2B,
  SOURCE_CREDIT_LEN_P2B,
  SOURCE_CREDIT_REL_P2B,
  SPL_MINT_DECIMALS_OFFSET,
  STAKE_DEPOSIT_DISCRIMINATOR,
  STAKE_DEPOSIT_SIZE,
  STAKE_ERRORS,
  STAKE_IX,
  STAKE_POOL_CURRENT_VERSION,
  STAKE_POOL_DISCRIMINATOR,
  STAKE_POOL_SIZE,
  STAKE_POOL_SIZE_V1,
  STAKE_POOL_SIZE_V2,
  STAKE_POOL_SIZE_V3,
  STAKE_POOL_SIZE_V4,
  STAKE_PROGRAM_ID,
  STAKE_PROGRAM_IDS,
  TOKEN_2022_PROGRAM_ID,
  U128_MAX_P2B,
  UNRESOLVE_CONFIRMATION,
  V17_ASSET_CONTROL_SEQUENCES_LEN,
  V17_ASSET_CONTROL_SEQUENCES_OFF,
  V17_ASSET_ORACLE_PROFILE_LEN,
  V17_ASSET_ORACLE_WRAPPER_LEN,
  V17_ASSET_SLOT_WRAPPER_LEN,
  V17_BACKING_BUCKET_LEN,
  V17_CONFIG_MAX_MARKET_SLOTS_REL,
  V17_CREATOR_FEE_CLAIMABLE_OFF,
  V17_ENGINE_BACKING_LONG_REL,
  V17_ENGINE_BACKING_SHORT_REL,
  V17_EXPECTED_VERSION,
  V17_GROUP_CONFIG_REL,
  V17_GROUP_CURRENT_SLOT_REL,
  V17_GROUP_MODE_REL,
  V17_HEADER_LEN,
  V17_KIND_CLOSED_MARKET,
  V17_KIND_MARKET,
  V17_KIND_OFF,
  V17_MAGIC,
  V17_MARKET_ASSET_SLOT_LEN,
  V17_MARKET_GROUP_LEN,
  V17_MARKET_GROUP_OFF,
  V17_MARKET_MODE_LIVE,
  V17_PORTFOLIO_ACCOUNT_LEN,
  V17_PORTFOLIO_IDENTITY_TRAILER_LEN,
  V17_PORTFOLIO_LEG_SIZE,
  V17_PROTOCOL_FEE_AUTHORITY_EPOCH_LEN,
  V17_PROTOCOL_FEE_AUTHORITY_EPOCH_OFF,
  V17_SLAB_MAGIC,
  V17_WRAPPER_CONFIG_LEN,
  V17_WRAPPER_HEAP_FRAME_BYTES,
  V18_KIND_VAULT_LP_STATE_P3,
  VAMM_MAGIC,
  VAULT_LP_DEFAULT_MAX_LEV_BPS_P3,
  VAULT_LP_EXT_ACCOUNT_LEN_P2B,
  VAULT_LP_EXT_BODY_LEN_P2B,
  VAULT_LP_EXT_FIELD_OFF_P2B,
  VAULT_LP_EXT_SEED_P2B,
  VAULT_LP_EXT_TAIL_INDEX_P2B,
  VAULT_LP_EXT_VERSION_P2B,
  VAULT_LP_JUNIOR_FLOOR_BPS_RANGE_P3,
  VAULT_LP_MATCHER_CTX_LEN_P3,
  VAULT_LP_MAX_LEV_BPS_P3,
  VAULT_LP_PIN_P3,
  VAULT_LP_STATE_ACCOUNT_LEN_P3,
  VAULT_LP_STATE_BODY_LEN_P3,
  VAULT_LP_STATE_OFF_P3,
  ValidationError,
  WELL_KNOWN,
  WRAPPER_BATCH_MAX_LEGS,
  WSOL_MINT,
  _internal,
  a4CapacityLockOkP2b,
  accrueFeesAccounts,
  adlEpisodeKey,
  adlEpisodeSlotsRemaining,
  adlWindDownDustNotionalAtoms,
  adminCloseSlabAccounts,
  adminResolveMarketCpiAccounts,
  adminUpdateBackingFeePolicyAccounts,
  adminUpdateFeeSplitAccounts,
  adminUpdateMaintenanceFeePerSlotAccounts,
  adminUpdateTradeFeePolicyAccounts,
  allocJuniorOkP2b,
  allocWrittenDownP2b,
  assertGrowthBatchLegs,
  assertVaultLpDialsP2b,
  assetGrowthAccountOffsetV19,
  assetRiskLimitsAccountOffsetP1,
  assetVaultLpAccountOffsetP3,
  backingBucketStatusName,
  bindInsuranceAuthorityAccounts,
  boundVaultDepositQuoteP3,
  boundVaultNavFlooredP3,
  boundVaultRedemptionAtomsP3,
  boundVaultSeniorValueP3,
  buildAccountMetas,
  buildAdlInstruction,
  buildAdlTransaction,
  buildAdlWindDownIx,
  buildAdminCloseSlabIx,
  buildClaimResolvedPayoutTopupIxP3,
  buildCloseResolvedUnsignedIxP3,
  buildCreateVaultLpMatcherCtxIxP3,
  buildDepositJuniorTrancheIxP3,
  buildExecuteRedemptionIxNonBoundP2b,
  buildExecuteRedemptionIxP3,
  buildInitVaultLpIxP3,
  buildIx,
  buildMatcherConfigureBackingFeeCapIx,
  buildMatcherConfigureSetParamsIx,
  buildNftAccountMetas,
  buildRebalanceReduceIx,
  buildRecoverTerminalInsuranceIx,
  buildSetAdlWindDownMaxSlotsIx,
  buildSetAssetRiskLimitsIxP1,
  buildSetVaultLpRiskIxP3,
  buildSetVaultLpRiskV19IxP2b,
  buildVaultLpAllocateIxP2b,
  buildVaultLpConvertPnlIxP3,
  buildVaultLpRecallIxP3,
  buildVaultLpRefreshCrankIxP3,
  buildVaultLpReleaseSurplusIxP3,
  buildVaultLpSetMatcherIxP3,
  buildVaultLpSettleResolvedIxP3,
  buildWithdrawJuniorTrancheIxP3,
  burnAssetAdminAccounts,
  ceilingImrBps,
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
  computeMaxLeverageFloor,
  computePnlPercent,
  computePreTradeLiqPrice,
  computeRequiredMargin,
  computeTradingFee,
  computeVammQuote,
  computeWarmupLeverageCap,
  computeWarmupMaxPositionSize,
  computeWarmupUnlockedCapital,
  concatBytes,
  conservativeEquity,
  countLighthouseInstructions,
  creatorFeeVestedP2b,
  cushionLockedP2b,
  cushionSplitP2b,
  decodeAdlEpisode,
  decodeAdlEpisodeRecord,
  decodeAssetGrowthFromSlotV19,
  decodeAssetGrowthRecordV19,
  decodeAssetGrowthV19,
  decodeAssetRiskLimitsP1,
  decodeAssetRiskLimitsRecordP1,
  decodeAssetVaultLpDrawP3,
  decodeAssetVaultLpP3,
  decodeAssetVaultLpRecordP3,
  decodeBackingDomainLedgerP2b,
  decodeBankruptcyHlock,
  decodeDepositPda,
  decodeError,
  decodeMatcherCallExt,
  decodeMatcherRequestedFeeBps,
  decodeMatcherReturn,
  decodeMatcherV2Error,
  decodePortfolioMatcherControl,
  decodeResolvedPayoutReceiptP3,
  decodeSeniorFloorRecordP2b,
  decodeStakePool,
  decodeTerminalInsuranceCapacity,
  decodeVaultLpExtV19,
  decodeVaultLpStateP3,
  defaultMatcherV2ConfigForKind2,
  depositAccounts,
  depositJuniorAccounts,
  deriveCanonicalVault,
  deriveCanonicalVaultForAuthority,
  deriveCreatorLockPda,
  deriveDepositPda,
  deriveExtraAccountMetas,
  deriveInsuranceLpMint,
  deriveLpBackingLedger,
  deriveLpEscrow,
  deriveLpPda,
  deriveLpRedemption,
  deriveLpVaultRegistry,
  deriveMarketVaultAccounts,
  deriveMatcherDelegate,
  deriveMintAuthority,
  deriveNftMint,
  deriveNftPda,
  deriveNftRegistry,
  deriveProgramDataAddressP3,
  derivePythPriceUpdateAccount,
  derivePythPushOraclePDA,
  deriveStakePool,
  deriveStakeVaultAuth,
  deriveVaultAuthority,
  deriveVaultLpExtP2b,
  deriveVaultLpStateP3,
  detectDexType,
  detectLayout,
  detectSlabLayout,
  detectTokenProgram,
  discoverMarkets,
  discoverMarketsViaApi,
  discoverMarketsViaStaticBundle,
  dynImrBps,
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
  encodeAdlWindDown,
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
  encodeCureAndCancelClose,
  encodeDepositCollateral,
  encodeDepositFeeCredits,
  encodeDepositInsuranceLP,
  encodeDepositJuniorTrancheP3,
  encodeDepositLpCollateral,
  encodeDepositToLpVault,
  encodeExecuteAdl,
  encodeExecuteRedemption,
  encodeExpireBackingBucket,
  encodeFeedId,
  encodeForceCloseResolved,
  encodeForfeitRecoveryLeg,
  encodeFundMarketInsurance,
  encodeInitLP,
  encodeInitMarket,
  encodeInitMarketV19,
  encodeInitMatcherCtx,
  encodeInitSharedVault,
  encodeInitUser,
  encodeInitVaultLpP3,
  encodeInitVaultLpV19,
  encodeKeeperCrank,
  encodeLiquidateAtOracle,
  encodeLpVaultCrankFees,
  encodeLpVaultDeposit,
  encodeLpVaultWithdraw,
  encodeMatcherBatchCall,
  encodeMatcherCallExt,
  encodeMatcherCallExtV2,
  encodeMatcherCallExtV3,
  encodeMatcherCallExtV3FromV2,
  encodeMatcherConfigureBackingFeeCap,
  encodeMatcherConfigureSetParams,
  encodeMatcherInitPassive,
  encodeMatcherReturn,
  encodeMatcherSetParams,
  encodeMintPositionNft,
  encodeNftBurn,
  encodeNftEmergencyBurn,
  encodeNftMint,
  encodeNftReconcile,
  encodeNftSettleFunding,
  encodePauseMarket,
  encodePermissionlessCrank,
  encodePushAuthMark,
  encodePushEwmaMark,
  encodeQueueWithdrawal,
  encodeQueueWithdrawalSV,
  encodeRebalanceLpVaultBacking,
  encodeRebalanceReduce,
  encodeReclaimEmptyAccount,
  encodeReclaimSlabRent,
  encodeRenounceAdmin,
  encodeRequestRedeemLpShares,
  encodeRescueOrphanVault,
  encodeResolveDispute,
  encodeResolveMarket,
  encodeResolvePermissionless,
  encodeRestartAssetOracle,
  encodeSetAdlWindDownMaxSlots,
  encodeSetAssetRiskLimitsP1,
  encodeSetAssetRiskLimitsV19,
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
  encodeSetProtocolFeeAuthority,
  encodeSetPythOracle,
  encodeSetRiskThreshold,
  encodeSetVaultLpRiskP3,
  encodeSetVaultLpRiskV19P2b,
  encodeSetWalletCap,
  encodeSettleAccount,
  encodeSlashCreationDeposit,
  encodeStakeAcceptAdmin,
  encodeStakeAccrueFees,
  encodeStakeAdminCloseSlab,
  encodeStakeAdminResolveMarket,
  encodeStakeAdminResolveMarketCpi,
  encodeStakeAdminSetHwmConfig,
  encodeStakeAdminSetInsurancePolicy,
  encodeStakeAdminSetMaintenanceFee,
  encodeStakeAdminSetOracleAuthority,
  encodeStakeAdminSetRiskThreshold,
  encodeStakeAdminSetTrancheConfig,
  encodeStakeAdminUpdateBackingFeePolicy,
  encodeStakeAdminUpdateFeeSplit,
  encodeStakeAdminUpdateMaintenanceFeePerSlot,
  encodeStakeAdminUpdateTradeFeePolicy,
  encodeStakeAdminWithdrawInsurance,
  encodeStakeBindInsuranceAuthority,
  encodeStakeBurnAssetAdmin,
  encodeStakeCancelCooldownIncrease,
  encodeStakeCommitCooldownIncrease,
  encodeStakeDeposit,
  encodeStakeDepositJunior,
  encodeStakeFlushToInsurance,
  encodeStakeInitPool,
  encodeStakeInitTradingPool,
  encodeStakeProposeAdmin,
  encodeStakeProposeCooldownIncrease,
  encodeStakeRecoverFlushedInsurance,
  encodeStakeRecoverTerminalInsurance,
  encodeStakeReturnInsurance,
  encodeStakeRotateInsuranceAuthority,
  encodeStakeRotateInsuranceOperator,
  encodeStakeSetMarketResolved,
  encodeStakeTransferAdmin,
  encodeStakeUpdateConfig,
  encodeStakeWithdraw,
  encodeSwapSecondaryForPrimary,
  encodeTopUpBackingBucket,
  encodeTopUpInsurance,
  encodeTopUpInsuranceDomain,
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
  encodeUpdateAssetLifecycle,
  encodeUpdateAuthority,
  encodeUpdateBackingFeePolicy,
  encodeUpdateBaseUnitMints,
  encodeUpdateConfig,
  encodeUpdateFeeSplit,
  encodeUpdateHyperpMark,
  encodeUpdateInsuranceWithdrawPolicy,
  encodeUpdateMaintenanceFeePerSlot,
  encodeUpdateMarkPrice,
  encodeUpdateRiskParams,
  encodeUpdateTradeFeePolicy,
  encodeVaultLpAllocateP2b,
  encodeVaultLpConvertPnlP3,
  encodeVaultLpRecallP3,
  encodeVaultLpReleaseSurplusP3,
  encodeVaultLpSetMatcherP3,
  encodeVaultLpSettleResolvedP3,
  encodeWithdrawBackingBucket,
  encodeWithdrawBackingBucketEarnings,
  encodeWithdrawCollateral,
  encodeWithdrawCreatorFee,
  encodeWithdrawInsurance,
  encodeWithdrawInsuranceAsset,
  encodeWithdrawInsuranceLP,
  encodeWithdrawInsuranceLimited,
  encodeWithdrawInsuranceReserveToStake,
  encodeWithdrawJuniorTrancheP3,
  encodeWithdrawLpCollateral,
  encodeWithdrawProtocolFee,
  encodeWrapperMatcherCallExt,
  entryVsExitP2b,
  fetchAdlRankedPositions,
  fetchAdlRankings,
  fetchMintDecimals,
  fetchSlab,
  fetchTokenAccount,
  fetchVaultLpExtP2b,
  findExpirableBackingDomains,
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
  growthMatcherCapsV3,
  imrBpsForLeverageX100,
  initPoolAccounts,
  insuranceCoverNumP2b,
  isAccountUsed,
  isAdlTriggered,
  isBackingBucketExpirable,
  isBankruptcyHlockActive,
  isClosedMarketTombstone,
  isLighthouseError,
  isLighthouseFailureInLogs,
  isLighthouseInstruction,
  isLpVaultRegistryBoundP3,
  isLpVaultRegistryExtP2b,
  isMatcherCtxV2,
  isStandardToken,
  isToken2022,
  isV17Account,
  isV17MarketAccount,
  isValidChainlinkOracle,
  leverageX100ForImrBps,
  liquidityNotionalE6,
  listOpenResolvedReceiptsP3,
  liveBoundPrincipalPortionP2b,
  liveExitSeniorValueP3,
  lpAtomsForRedemptionP2b,
  lpSharesForDepositP2b,
  markExtV3TakerReducing,
  matcherConfigureOwnerProofAccounts,
  maxAccountIndex,
  nCapQ,
  nonboundPotAvailableE3P2b,
  nonboundPotEntryAvailableP2b,
  nonboundPotFromRecordsP2b,
  nonboundVaultPricingFromAccountsP2b,
  nonboundVaultPricingP2b,
  openingPartQ,
  packOiCap,
  parseAccount,
  parseAdlEvent,
  parseAllAccounts,
  parseAssetControlSequencesV17,
  parseAssetOracleProfileV17,
  parseBackingBucketsV17,
  parseChainlinkPrice,
  parseConfig,
  parseDexPool,
  parseEngine,
  parseEngineLight,
  parseErrorFromLogs,
  parseHeader,
  parseLpRedemption,
  parseLpVaultRegistry,
  parseMarketGroupV17OI,
  parseParams,
  parsePortfolioV17,
  parsePositionNftAccount,
  parseProtocolFeeAuthorityEpoch,
  parseUsedIndices,
  parseWrapperConfigV17,
  pinnedMatcherCapsP3,
  planCloseSlabAttempt,
  planReduceOnlyExit,
  planResolvedReceiptRevisitP3,
  planResolvedVaultLpExitP3,
  planStakeWindDown,
  potPhysicalNetAtomsP2b,
  previewGrowthOpenFee,
  quoteMaxLeverage,
  rGapFloorBps,
  rankAdlPositions,
  readAssetPricesP3,
  readLastThrUpdateSlot,
  readNonce,
  readPotEngineRecordsP2b,
  recoverFlushedInsuranceAccounts,
  recoverTerminalInsuranceAccounts,
  registerStaticMarkets,
  requireDecimalUIntString,
  resolvePrice,
  rotateInsuranceAccounts,
  safeBigInt,
  safeEnv,
  selectAdlTarget,
  seniorCapitalHaltP2b,
  seniorFloorDecodeP2b,
  seniorFloorEncodeP2b,
  simulateOrSend,
  slabDataSize,
  slabDataSizeV1,
  stakeGroupAProxyAccounts,
  stakeGroupBProxyAccounts,
  stripLighthouseFromTransaction,
  stripLighthouseInstructions,
  usdToQCappedP3,
  usersSideOiQ,
  utilFeeMaxEffectiveBps,
  utilisationFeeBps,
  utilizationBps,
  v17MarketAccountLen,
  validateAmount,
  validateBps,
  validateFeeSplit,
  validateI128,
  validateI64,
  validateIndex,
  validateMatcherSetParams,
  validatePublicKey,
  validateSlabTierMatch,
  validateU128,
  validateU16,
  validateU64,
  vaultLpAllocAdmittedP2b,
  vaultLpAllocLimitP2b,
  vaultLpAllocSplitP2b,
  vaultLpDeallocP2b,
  vaultLpEquityLagBoundsP3,
  vaultLpSeniorPricingClaimP3,
  vaultPhysicalIdleBackingAtomsP3,
  vaultPotHeldAtomsP3,
  withBoundVaultLpTailP3,
  withCrankFeesBoundTailP2b,
  withNftEscrowProof,
  withNftHolderAuth,
  withRetry,
  withdrawAccounts,
  zeroMatcherV2Config
};
//# sourceMappingURL=index.js.map