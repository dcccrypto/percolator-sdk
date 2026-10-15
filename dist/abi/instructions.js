import {
  encU8,
  encU16,
  encU32,
  encU64,
  encI64,
  encU128,
  encI128,
  encPubkey,
  concatBytes
} from "./encode.js";
const IX_TAG = {
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
const EXPECTED_SLAB_VERSION = 18;
const V17_SLAB_MAGIC = 0x5045524356313600n;
function removedInstruction(name, tag, replacement) {
  const suffix = replacement ? ` Use ${replacement} instead.` : "";
  throw new Error(
    `${name} (tag ${tag}) is not accepted by the deployed wrapper program.${suffix}`
  );
}
const HEX_RE = /^[0-9a-fA-F]{64}$/;
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
const PUBLIC_B_CHUNK_ATOMS_UNLIMITED = 10000000000000000n;
const INIT_MARKET_V17_LEN = 219;
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
const CrankAction = {
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
const CRANK_OBSERVATION_DECODE_MAX = 16;
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
const MAX_BACKING_BUCKET_EXPIRY_SLOT = 9223372036854775807n;
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
const RESOLVE_MODE_ORDINARY = 0;
const RESOLVE_MODE_DEGENERATE = 1;
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
const RENOUNCE_ADMIN_CONFIRMATION = 0x52454E4F554E4345n;
const UNRESOLVE_CONFIRMATION = 0xDEADBEEFCAFE1234n;
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
const PYTH_RECEIVER_PROGRAM_ID = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
async function derivePythPriceUpdateAccount(feedId, shardId = 0) {
  if (!(feedId instanceof Uint8Array) || feedId.length !== 32) {
    throw new Error(`derivePythPriceUpdateAccount: feedId must be 32 bytes, got ${feedId?.length ?? "invalid"}`);
  }
  if (!Number.isInteger(shardId) || shardId < 0 || shardId > 65535) {
    throw new Error(`derivePythPriceUpdateAccount: shardId must be a u16, got ${shardId}`);
  }
  const { PublicKey: PublicKey2 } = await import("@solana/web3.js");
  const shardBuf = new Uint8Array(2);
  new DataView(shardBuf.buffer).setUint16(0, shardId, true);
  const [pda] = PublicKey2.findProgramAddressSync(
    [shardBuf, feedId],
    new PublicKey2(PYTH_RECEIVER_PROGRAM_ID)
  );
  return pda.toBase58();
}
function encodeUpdateMarkPrice() {
  return removedInstruction("UpdateMarkPrice", IX_TAG.UpdateMarkPrice, "encodeUpdateHyperpMark()");
}
const MARK_PRICE_EMA_WINDOW_SLOTS = 72000n;
const MARK_PRICE_EMA_ALPHA_E6 = 2000000n / (MARK_PRICE_EMA_WINDOW_SLOTS + 1n);
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
const VAMM_MAGIC = 0x504552434d415443n;
const MATCHER_MAGIC = VAMM_MAGIC;
const CTX_RETURN_OFFSET = 0;
const MATCHER_RETURN_LEN = 64;
const CTX_VAMM_OFFSET = 64;
const CTX_VAMM_LEN = 256;
const MATCHER_CONTEXT_LEN = 320;
const MATCHER_RETURN_FLAG_VALID = 1;
const MATCHER_RETURN_FLAG_PARTIAL_OK = 2;
const MATCHER_RETURN_FLAG_REJECTED = 4;
const MATCHER_RETURN_FLAG_BACKING_FEE_CAP_SHIFT = 8;
const MATCHER_RETURN_FLAG_BACKING_FEE_CAP_MASK = 16383 << MATCHER_RETURN_FLAG_BACKING_FEE_CAP_SHIFT;
const MATCHER_RETURN_KNOWN_FLAGS = MATCHER_RETURN_FLAG_VALID | MATCHER_RETURN_FLAG_PARTIAL_OK | MATCHER_RETURN_FLAG_REJECTED | MATCHER_RETURN_FLAG_BACKING_FEE_CAP_MASK;
function decodeMatcherReturn(data, offset = CTX_RETURN_OFFSET) {
  if (data.length < offset + MATCHER_RETURN_LEN) {
    throw new Error(
      `decodeMatcherReturn: data too short \u2014 need ${offset + MATCHER_RETURN_LEN} bytes, got ${data.length}`
    );
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, MATCHER_RETURN_LEN);
  const abiVersion = view.getUint32(0, true);
  const flags = view.getUint32(4, true);
  const execPriceE6 = view.getBigUint64(8, true);
  const execSizeLo = view.getBigUint64(16, true);
  const execSizeHi = view.getBigUint64(24, true);
  let execSize = execSizeHi << 64n | execSizeLo;
  if (execSize >= 1n << 127n) execSize -= 1n << 128n;
  const reqId = view.getBigUint64(32, true);
  const lpAccountId = view.getBigUint64(40, true);
  const oraclePriceE6 = view.getBigUint64(48, true);
  const assetIndex = view.getBigUint64(56, true);
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
const MATCHER_CALL_LEN = 67;
const INIT_CTX_LEN = 78;
const BPS_DENOM = 10000n;
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
const ORACLE_PHASE_NASCENT = 0;
const ORACLE_PHASE_GROWING = 1;
const ORACLE_PHASE_MATURE = 2;
const PHASE1_MIN_SLOTS = 648000n;
const PHASE1_VOLUME_MIN_SLOTS = 36000n;
const PHASE2_VOLUME_THRESHOLD = 100000000000n;
const PHASE2_MATURITY_SLOTS = 3024000n;
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
const INIT_MATCHER_CTX_V17_LEN = 70;
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
const ASSET_AUTH_KIND = {
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
const MAX_INSURANCE_WITHDRAW_COOLDOWN_SLOTS = 78840000n;
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
const ORACLE_LEG_CAP = 3;
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
const FEE_SPLIT = {
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
export {
  ASSET_AUTH_KIND,
  CRANK_OBSERVATION_DECODE_MAX,
  CTX_RETURN_OFFSET,
  CTX_VAMM_LEN,
  CTX_VAMM_OFFSET,
  CrankAction,
  EXPECTED_SLAB_VERSION,
  FEE_SPLIT,
  HEX_RE,
  INIT_CTX_LEN,
  INIT_MATCHER_CTX_V17_LEN,
  IX_TAG,
  MARK_PRICE_EMA_ALPHA_E6,
  MARK_PRICE_EMA_WINDOW_SLOTS,
  MATCHER_CALL_LEN,
  MATCHER_CONTEXT_LEN,
  MATCHER_MAGIC,
  MATCHER_RETURN_FLAG_BACKING_FEE_CAP_MASK,
  MATCHER_RETURN_FLAG_BACKING_FEE_CAP_SHIFT,
  MATCHER_RETURN_FLAG_PARTIAL_OK,
  MATCHER_RETURN_FLAG_REJECTED,
  MATCHER_RETURN_FLAG_VALID,
  MATCHER_RETURN_KNOWN_FLAGS,
  MATCHER_RETURN_LEN,
  MAX_BACKING_BUCKET_EXPIRY_SLOT,
  MAX_INSURANCE_WITHDRAW_COOLDOWN_SLOTS,
  ORACLE_PHASE_GROWING,
  ORACLE_PHASE_MATURE,
  ORACLE_PHASE_NASCENT,
  PHASE1_MIN_SLOTS,
  PHASE1_VOLUME_MIN_SLOTS,
  PHASE2_MATURITY_SLOTS,
  PHASE2_VOLUME_THRESHOLD,
  PUBLIC_B_CHUNK_ATOMS_UNLIMITED,
  PYTH_RECEIVER_PROGRAM_ID,
  RENOUNCE_ADMIN_CONFIRMATION,
  RESOLVE_MODE_DEGENERATE,
  RESOLVE_MODE_ORDINARY,
  UNRESOLVE_CONFIRMATION,
  V17_SLAB_MAGIC,
  VAMM_MAGIC,
  checkPhaseTransition,
  computeEmaMarkPrice,
  computeVammQuote,
  decodeMatcherReturn,
  derivePythPriceUpdateAccount,
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
  encodeCureAndCancelClose,
  encodeDepositCollateral,
  encodeDepositFeeCredits,
  encodeDepositInsuranceLP,
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
  encodeInitMatcherCtx,
  encodeInitSharedVault,
  encodeInitUser,
  encodeKeeperCrank,
  encodeLiquidateAtOracle,
  encodeLpVaultCrankFees,
  encodeLpVaultDeposit,
  encodeLpVaultWithdraw,
  encodeMatcherInitPassive,
  encodeMatcherReturn,
  encodeMintPositionNft,
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
  encodeSetWalletCap,
  encodeSettleAccount,
  encodeSlashCreationDeposit,
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
  encodeWithdrawBackingBucket,
  encodeWithdrawBackingBucketEarnings,
  encodeWithdrawCollateral,
  encodeWithdrawCreatorFee,
  encodeWithdrawInsurance,
  encodeWithdrawInsuranceAsset,
  encodeWithdrawInsuranceLP,
  encodeWithdrawInsuranceLimited,
  encodeWithdrawInsuranceReserveToStake,
  encodeWithdrawLpCollateral,
  encodeWithdrawProtocolFee,
  packOiCap,
  validateFeeSplit
};
//# sourceMappingURL=instructions.js.map