import { PublicKey, AccountMeta as AccountMeta$1, TransactionInstruction, Connection, ConnectionConfig, Commitment, Keypair, Transaction } from '@solana/web3.js';
import { Account as Account$1 } from '@solana/spl-token';

/**
 * Encode u8 (1 byte)
 */
declare function encU8(val: number): Uint8Array;
/**
 * Encode u16 little-endian (2 bytes)
 */
declare function encU16(val: number): Uint8Array;
/**
 * Encode u32 little-endian (4 bytes)
 */
declare function encU32(val: number): Uint8Array;
/**
 * Encode u64 little-endian (8 bytes)
 * Input: bigint or string (decimal)
 */
declare function encU64(val: bigint | string): Uint8Array;
/**
 * Encode i64 little-endian (8 bytes), two's complement
 * Input: bigint or string (decimal, may be negative)
 */
declare function encI64(val: bigint | string): Uint8Array;
/**
 * Encode u128 little-endian (16 bytes)
 * Input: bigint or string (decimal)
 */
declare function encU128(val: bigint | string): Uint8Array;
/**
 * Encode i128 little-endian (16 bytes), two's complement
 * Input: bigint or string (decimal, may be negative)
 */
declare function encI128(val: bigint | string): Uint8Array;
/**
 * Encode a Solana public key into its fixed-width 32-byte ABI representation.
 *
 * Accepts a `PublicKey` instance or a base58 string. Runtime PublicKey-like
 * objects are validated before their bytes are returned so JavaScript callers
 * cannot provide malformed `toBytes()` output.
 *
 * @throws Error when the value is not PublicKey-like, when `toBytes()` does not
 * return a `Uint8Array`, or when the output length is not exactly 32 bytes.
 */
declare function encPubkey(val: PublicKey | string): Uint8Array;
/**
 * Encode a boolean as u8 (0 = false, 1 = true)
 */
declare function encBool(val: boolean): Uint8Array;
/**
 * Concatenate multiple Uint8Arrays (replaces Buffer.concat)
 */
declare function concatBytes(...arrays: Uint8Array[]): Uint8Array;

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
declare const IX_TAG: {
    readonly InitMarket: 0;
    readonly InitPortfolio: 1;
    /** @alias InitUser @since v12.x alias, canonical name is InitPortfolio in v17 */
    readonly InitUser: 1;
    /** @deprecated v17 has no LP role in the wrapper; matchers run as third-party programs. */
    readonly InitLP: 2;
    readonly Deposit: 3;
    /** @alias DepositCollateral @since v12.x alias */
    readonly DepositCollateral: 3;
    readonly Withdraw: 4;
    /** @alias WithdrawCollateral @since v12.x alias */
    readonly WithdrawCollateral: 4;
    /**
     * PermissionlessCrank (tag 5).
     *
     * CRITICAL: The on-chain decoder reads funding_rate_e9 (i128) at bytes [4..20]
     * and hard-rejects nonzero with InvalidInstructionData. SDK callers MUST use
     * encodePermissionlessCrank() which hardcodes fundingRateE9=0n. Do NOT
     * construct the payload manually and omit this field — that produces a
     * malformed instruction (missing bytes).
     */
    readonly PermissionlessCrank: 5;
    /** @alias KeeperCrank @since v12.x alias */
    readonly KeeperCrank: 5;
    readonly TradeNoCpi: 6;
    readonly LiquidateAtOracle: 7;
    readonly ClosePortfolio: 8;
    /** @alias CloseAccount @since v12.x alias */
    readonly CloseAccount: 8;
    readonly TopUpInsurance: 9;
    readonly TradeCpi: 10;
    /** @deprecated tag 11 has no decode arm in v17 wrapper */
    readonly SetRiskThreshold: 11;
    /** @deprecated tag 12 has no decode arm in v17 wrapper */
    readonly UpdateAdmin: 12;
    readonly CloseSlab: 13;
    readonly ResolveMarket: 19;
    readonly TopUpBackingBucket: 24;
    readonly ConvertReleasedPnl: 28;
    readonly CloseResolved: 30;
    /**
     * UpdateAuthority (tag 32) — v17 wire: tag(1) + new_pubkey[32].
     *
     * BREAKING vs v12.18.x: NO kind byte in v17. The kind byte was removed;
     * tag 32 now ONLY rotates the single marketauth key. Per-asset authority
     * rotation uses tag 65 (UpdateAssetAuthority).
     */
    readonly UpdateAuthority: 32;
    readonly ConfigureHybridOracle: 34;
    readonly ConfigureEwmaMark: 35;
    readonly PushEwmaMark: 36;
    readonly UpdateLiquidationFeePolicy: 37;
    readonly ConfigurePermissionlessResolve: 38;
    readonly ResolveStalePermissionless: 39;
    readonly UpdateAssetLifecycle: 40;
    readonly WithdrawInsurance: 41;
    readonly CureAndCancelClose: 42;
    readonly ForfeitRecoveryLeg: 43;
    readonly RebalanceReduce: 44;
    readonly FinalizeResetSide: 45;
    readonly ClaimResolvedPayoutTopup: 46;
    readonly RefineResolvedUnreceiptedBound: 47;
    readonly SyncMaintenanceFee: 48;
    readonly UpdateMaintenanceFeePolicy: 49;
    readonly WithdrawBackingBucket: 50;
    readonly UpdateBackingFeePolicy: 51;
    readonly WithdrawBackingBucketEarnings: 52;
    readonly SyncBackingDomainLedger: 53;
    readonly SyncInsuranceLedger: 54;
    readonly UpdateTradeFeePolicy: 55;
    readonly TopUpInsuranceDomain: 56;
    /**
     * WithdrawInsuranceAsset (tag 57) — v17 wire: tag(1) + asset_index(u16) + amount(u128).
     *
     * Replaces the v12.x gap at tag 57. Withdraws from a specific asset's
     * insurance fund. asset_index is u16 (domain u8→u16 migration).
     */
    readonly WithdrawInsuranceAsset: 57;
    readonly UpdateFeeRedirectPolicy: 58;
    readonly UpdateMarketInitFeePolicy: 59;
    readonly UpdateBaseUnitMints: 60;
    readonly SwapSecondaryForPrimary: 61;
    readonly ConfigureAuthMark: 62;
    readonly PushAuthMark: 63;
    readonly ForceCloseAbandonedAsset: 64;
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
    readonly UpdateAssetAuthority: 65;
    /**
     * BatchTradeNoCpi (tag 66) — multi-leg NoCpi trade in one instruction.
     *
     * Wire: tag(1) + n_legs(u8) + [asset_index(u16)+size_q(i128)+exec_price(u64)+fee_bps(u64)]×n
     */
    readonly BatchTradeNoCpi: 66;
    /**
     * BatchTradeCpi (tag 67) — multi-leg CPI trade in one instruction.
     *
     * Wire: tag(1) + n_legs(u8) + [asset_index(u16)+size_q(i128)+fee_bps(u64)+limit_price(u64)]×n
     */
    readonly BatchTradeCpi: 67;
    /**
     * SetMatcherConfig (tag 68) — enable/disable the matcher for this portfolio.
     *
     * Wire: tag(1) + enabled(u8) = 2 bytes.
     */
    readonly SetMatcherConfig: 68;
    /**
     * RestartAssetOracle (tag 69) — permissionless oracle restart after stale/stuck state.
     *
     * Wire: tag(1) + asset_index(u16) + now_slot(u64) + initial_price(u64) = 19 bytes.
     */
    readonly RestartAssetOracle: 69;
    /**
     * TransferPortfolioOwnership (tag 72) — B-3 position ownership transfer.
     *
     * Wire: tag(1) + new_owner[32] + asset_index(u16) = 35 bytes.
     */
    readonly TransferPortfolioOwnership: 72;
    /**
     * SetNftProgramId (tag 73) — register the percolator-nft program in the NftRegistry.
     *
     * Wire: tag(1) + nft_program_id[32] = 33 bytes.
     */
    readonly SetNftProgramId: 73;
    /**
     * CreateLpVault (tag 74).
     * Wire: tag(1) + fee_share_bps(u16) + redemption_cooldown_slots(u64) +
     *       oi_reservation_threshold_bps(u16) + domain(u16) = 15 bytes.
     */
    readonly CreateLpVault: 74;
    /**
     * DepositToLpVault (tag 75).
     * Wire: tag(1) + amount(u128) + domain(u16) = 19 bytes.  // GH#381: was 17; `domain` was missing
     */
    readonly DepositToLpVault: 75;
    /**
     * RequestRedeemLpShares (tag 76).
     * Wire: tag(1) + shares(u128) = 17 bytes.
     */
    readonly RequestRedeemLpShares: 76;
    /**
     * ExecuteRedemption (tag 77).
     * Wire: tag(1) + domain(u16) = 3 bytes.  // GH#381: was 1 byte; `domain` was missing
     */
    readonly ExecuteRedemption: 77;
    /**
     * LpVaultCrankFees (tag 78).
     * Wire: tag(1) + domain(u16) = 3 bytes.  // GH#381: was 1 byte; `domain` was missing
     */
    readonly LpVaultCrankFees: 78;
    /**
     * SetLpVaultPaused (tag 79).
     * Wire: tag(1) + paused(u8) = 2 bytes.
     */
    readonly SetLpVaultPaused: 79;
    /**
     * CloseLpVault (tag 80).
     * Wire: tag(1) = 1 byte.
     */
    readonly CloseLpVault: 80;
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
    readonly CancelRedemption: 81;
    /**
     * UnwrapEscrowedPortfolio (tag 82) — burn a Position NFT and return the escrowed
     * portfolio to `new_owner`.
     * Wire: tag(1) + new_owner(32) = 33 bytes.
     */
    readonly UnwrapEscrowedPortfolio: 82;
    /** @deprecated v12.x alias. Use DepositToLpVault(75) in v17. */
    readonly LpVaultDeposit: 75;
    /** @deprecated v12.x alias. Use RequestRedeemLpShares(76) in v17 — NOTE: wire format changed. */
    readonly LpVaultWithdraw: 76;
    /** @deprecated v12.x tag 14. Removed in v17. */
    readonly UpdateConfig: 14;
    /** @deprecated v12.x tag 15. Removed in v17. */
    readonly SetMaintenanceFee: 15;
    /** @deprecated v12.x tag 16. Removed in v17. */
    readonly SetOraclePriceCap: 16;
    /** @deprecated v12.x tag 17. Removed in v17. */
    readonly AdminForceClose: 17;
    /** @deprecated v12.x tag 18. Removed in v17. */
    readonly UpdateRiskParams: 18;
    /** @deprecated v12.x tag 20. Removed in v17. */
    readonly SetPythOracle: 20;
    /** @deprecated v12.x tag 21. Removed in v17. */
    readonly RenounceAdmin: 21;
    /** @deprecated v12.x tag 22. Removed in v17. */
    readonly SetInsuranceWithdrawPolicy: 22;
    /** @deprecated v12.x tag 23. Removed in v17 — v17 uses WithdrawInsuranceLimited=23 from toly. */
    readonly WithdrawInsuranceLimited: 23;
    /** @deprecated v12.x tag 25. Removed in v17. */
    readonly FundMarketInsurance: 25;
    /** @deprecated v12.x tag 26. Removed in v17. */
    readonly SetInsuranceIsolation: 26;
    /** @deprecated v12.x tag 27. Removed in v17. */
    readonly DepositFeeCredits: 27;
    /** @deprecated v12.x tag 29. Removed in v17 — v17 uses ResolveStalePermissionless=39. */
    readonly ResolvePermissionless: 29;
    /** @deprecated v12.x tag 30. Removed in v17 — v17 reuses 30 for CloseResolved (different wire). */
    readonly ForceCloseResolved: 30;
    /** @deprecated v12.x tag 33. Removed in v17. */
    readonly UpdateInsurancePolicy: 33;
    /** @deprecated v12.x tag 36. Removed in v12.17. */
    readonly UnresolveMarket: 36;
    /** @deprecated v12.x tag 43. Removed in v17 — v17 uses 43 for ChallengeSettlement (different wire). */
    readonly ChallengeSettlement: 43;
    /** @deprecated v12.x tag 44. Removed in v17 — v17 uses 44 for RebalanceReduce (different wire). */
    readonly ResolveDispute: 44;
    /** @deprecated v12.x tag 45. Removed in v17 — v17 uses 45 for FinalizeResetSide. */
    readonly DepositLpCollateral: 45;
    /** @deprecated v12.x tag 46. Removed in v17 — v17 uses 46 for ClaimResolvedPayoutTopup. */
    readonly WithdrawLpCollateral: 46;
    /** @deprecated v12.x tag 54. Removed in v17 — v17 uses 54 for SyncInsuranceLedger. */
    readonly SetOffsetPair: 54;
    /** @deprecated v12.x tag 55. Removed in v17 — v17 uses 55 for UpdateTradeFeePolicy. */
    readonly AttestCrossMargin: 55;
    /** @deprecated v12.x tag 56. Removed in v17 — v17 uses 56 for TopUpInsuranceDomain. */
    readonly PauseMarket: 56;
    /** @deprecated v12.x tag 58. Removed in v17 — v17 uses 58 for UpdateFeeRedirectPolicy. */
    readonly UnpauseMarket: 58;
    /** @deprecated v12.x tag 64. Removed in v17 — v17 uses 64 for ForceCloseAbandonedAsset. */
    readonly MintPositionNft: 64;
    /** @deprecated v12.x tag 65. COLLIDES with v17 UpdateAssetAuthority(65). Do NOT use. */
    readonly TransferPositionOwnership: 65;
    /** @deprecated v12.x tag 66. COLLIDES with v17 BatchTradeNoCpi(66). Do NOT use. */
    readonly BurnPositionNft: 66;
    /** @deprecated v12.x tag 67. COLLIDES with v17 BatchTradeCpi(67). Do NOT use. */
    readonly SetPendingSettlement: 67;
    /** @deprecated v12.x tag 68. COLLIDES with v17 SetMatcherConfig(68). Do NOT use. */
    readonly ClearPendingSettlement: 68;
    /** @deprecated v12.x tag 69. COLLIDES with v17 RestartAssetOracle(69). Do NOT use. */
    readonly TransferOwnershipCpi: 69;
    /** @deprecated v12.x tag 70. Not in v17. */
    readonly SetWalletCap: 70;
    /** @deprecated v12.x tag 71. Not in v17. */
    readonly SetOiImbalanceHardBlock: 71;
    /** @deprecated v12.x tag 72. COLLIDES with v17 TransferPortfolioOwnership(72). Do NOT use. */
    readonly RescueOrphanVault: 72;
    /** @deprecated v12.x tag 73. COLLIDES with v17 SetNftProgramId(73). Do NOT use. */
    readonly CloseOrphanSlab: 73;
    /** @deprecated v12.x tag 74. COLLIDES with v17 CreateLpVault(74). Do NOT use. */
    readonly SetDexPool: 74;
    /** @deprecated v12.x tag 75. COLLIDES with v17 DepositToLpVault(75) AND v17 InitMatcherCtx(83). Do NOT use. */
    readonly InitMatcherCtxV12: 75;
    /** @deprecated v12.x tag 78. COLLIDES with v17 LpVaultCrankFees(78). Do NOT use. */
    readonly SetMaxPnlCap: 78;
    /** @deprecated v12.x tag 79. COLLIDES with v17 SetLpVaultPaused(79). Do NOT use. */
    readonly SetOiCapMultiplier: 79;
    /** @deprecated v12.x tag 80. COLLIDES with v17 CloseLpVault(80). Do NOT use. */
    readonly SetDisputeParams: 80;
    /** @deprecated v12.x tag 81. COLLIDES with v17 CancelRedemption(81). Do NOT use. */
    readonly SetLpCollateralParams: 81;
    /** @deprecated v12.x tag 82. COLLIDES with v17 UnwrapEscrowedPortfolio(82). Do NOT use. */
    readonly AcceptAdmin: 82;
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
    readonly InitMatcherCtx: 83;
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
    readonly WithdrawProtocolFee: 84;
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
    readonly SetProtocolFeeAuthority: 85;
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
    readonly UpdateFeeSplit: 86;
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
    readonly WithdrawInsuranceReserveToStake: 87;
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
    readonly UpdateMaintenanceFeePerSlot: 88;
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
    readonly ExpireBackingBucket: 89;
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
    readonly WithdrawCreatorFee: 90;
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
    readonly RebalanceLpVaultBacking: 91;
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
    readonly UpdateInsuranceWithdrawPolicy: 92;
    /** @deprecated v12.x tag 85. COLLIDES with v17 SetProtocolFeeAuthority(85). Do NOT use. */
    readonly ReclaimEmptyAccount: 85;
    /** @deprecated v12.x tag 86. Not in v17. */
    readonly SettleAccount: 86;
    /** @deprecated v12.x tag 90. COLLIDES with v17 WithdrawCreatorFee(90). Do NOT use. */
    readonly UpdateMarkPrice: 90;
    /** @deprecated v12.x tag 91. COLLIDES with v17 RebalanceLpVaultBacking(91). Do NOT use. */
    readonly AuditCrank: 91;
    /** @deprecated v12.x tag 92. Not in v17. */
    readonly AdvanceOraclePhase: 92;
    /** @deprecated v12.x tag 93. Not in v17. COLLIDES with P1 SetAssetRiskLimits(93). Do NOT use. */
    readonly SlashCreationDeposit: 93;
    /** @deprecated v12.x tag 94. Not in v17. COLLIDES with P3 InitVaultLp(94) — see IX_TAG_P3. Do NOT use. */
    readonly InitSharedVault: 94;
    /** @deprecated v12.x tag 95. Not in v17. COLLIDES with P3 VaultLpSetMatcher(95) — see IX_TAG_P3. Do NOT use. */
    readonly AllocateMarket: 95;
    /** @deprecated v12.x tag 96. Not in v17. COLLIDES with P3 DepositJuniorTranche(96) — see IX_TAG_P3. Do NOT use. */
    readonly QueueWithdrawalSV: 96;
    /** @deprecated v12.x tag 97. Not in v17. COLLIDES with P3 WithdrawJuniorTranche(97) — see IX_TAG_P3. Do NOT use. */
    readonly ClaimEpochWithdrawal: 97;
    /** @deprecated v12.x tag 98. Not in v17. COLLIDES with P3 VaultLpRecall(98) — see IX_TAG_P3. Do NOT use. */
    readonly AdvanceEpoch: 98;
    /** @deprecated v12.x tag 99. Not in v17. COLLIDES with P3 SetVaultLpRisk(99) — see IX_TAG_P3. Do NOT use. */
    readonly ReclaimSlabRent: 99;
    /** @deprecated v12.x tag 100. Not in v17. COLLIDES with P3 VaultLpConvertPnl(100) — see IX_TAG_P3. Do NOT use. */
    readonly CloseStaleSlabs: 100;
    /** @deprecated v12.x tag 101. Not in v17. COLLIDES with P3 VaultLpSettleResolved(101) — see IX_TAG_P3. Do NOT use. */
    readonly ExecuteAdl: 101;
    /** @deprecated v12.x tag 102. Not in v17. COLLIDES with P3 VaultLpReleaseSurplus(102) — see IX_TAG_P3. Do NOT use. */
    readonly QueueWithdrawal: 102;
    /** @deprecated v12.x tag 103. Not in v17. */
    readonly ClaimQueuedWithdrawal: 103;
    /** @deprecated v12.x tag 104. Not in v17. */
    readonly CancelQueuedWithdrawal: 104;
    /** @deprecated v12.x tag 105. Not in v17. */
    readonly TradeCpiV: 105;
};
/**
 * v18 slab version discriminator. Stored as u16 LE at byte offset 8 of every
 * percolator-owned account (market-group, portfolio, insurance-ledger, etc.).
 *
 * Bumped 17 -> 18 by the v16-migration integration (percolator-prog
 * `sync/integration-v16`@a9318945, `v16_program.rs:72` `pub const VERSION: u16
 * = 18`): the identity-binding overhaul (market_id/intent_id/authority_epoch
 * CAS binding across ~41 instruction tags), the PortfolioAccountV16 +24B
 * identity trailer (9539 -> 9563), and the AssetOracleProfileV16/
 * AssetControlSequencesV16 per-asset slot growth (512 -> 1024) are all
 * account-layout/wire-breaking, so VERSION fails closed on any pre-migration
 * (VERSION=17) account — those must be re-seeded (F-01), not read with this
 * parser.
 *
 * The v18 MAGIC is unchanged: 0x5045_5243_5631_3600n ("PERCV16\0" as u64 LE).
 * When reading an account header, verify both MAGIC at [0..8] and VERSION at
 * [8..10].
 */
declare const EXPECTED_SLAB_VERSION = 18;
/**
 * v17 account header magic — "PERCV16\0" stored as little-endian u64.
 * bytes[0..8] = [0x00, 0x36, 0x31, 0x56, 0x43, 0x52, 0x45, 0x50]
 */
declare const V17_SLAB_MAGIC = 5784119745589622272n;
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
interface InitMarketExtendedTail {
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
interface InitMarketArgs {
    admin: PublicKey | string;
    collateralMint: PublicKey | string;
    indexFeedId: string;
    maxStalenessSecs: bigint | string;
    confFilterBps: number;
    invert: number;
    unitScale: number;
    initialMarkPriceE6: bigint | string;
    maxMaintenanceFeePerSlot?: bigint | string;
    /** @deprecated v12.17-only field. v12.19 wrapper does not read it. Kept for source-compat, value ignored. */
    maxInsuranceFloor?: bigint | string;
    /** @deprecated v12.17-only field. v12.19 wrapper does not read it. Kept for source-compat, value ignored. */
    minOraclePriceCap?: bigint | string;
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
    insuranceFloor?: bigint | string;
    maintenanceFeePerSlot: bigint | string;
    maxCrankStalenessSlots: bigint | string;
    liquidationFeeBps: bigint | string;
    liquidationFeeCap: bigint | string;
    liquidationBufferBps?: bigint | string;
    minLiquidationAbs: bigint | string;
    /** @deprecated v12.17-only top-level field. v12.19 wrapper does not read a separate min_initial_deposit. Kept for source-compat, value ignored. */
    minInitialDeposit?: bigint | string;
    minNonzeroMmReq: bigint | string;
    minNonzeroImReq: bigint | string;
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
declare const HEX_RE: RegExp;
declare function encodeFeedId(feedId: string): Uint8Array;
/**
 * Default value for `publicBChunkAtoms` matching the engine's `MAX_VAULT_TVL`
 * (10_000_000_000_000_000 — effectively unlimited).
 *
 * WARNING: Using a small value (e.g. 1_000_000) stalls deep liquidations.
 * When a bankrupt position's liability exceeds `public_b_chunk_atoms`, the
 * engine returns `RecoveryRequired` and refuses further liquidation until
 * the insurance fund covers the residual. Production markets MUST use this
 * constant (or the engine's own `MAX_VAULT_TVL`) unless a deliberate chunk
 * limit is intended AND the insurance fund is sized accordingly.
 *
 * @example
 * ```ts
 * import { PUBLIC_B_CHUNK_ATOMS_UNLIMITED, encodeInitMarket } from "@percolator/sdk";
 * const data = encodeInitMarket({
 *   ...otherParams,
 *   publicBChunkAtoms: PUBLIC_B_CHUNK_ATOMS_UNLIMITED,
 *   maintenanceFeePerSlot: 0n,
 * });
 * ```
 */
declare const PUBLIC_B_CHUNK_ATOMS_UNLIMITED = 10000000000000000n;
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
interface InitMarketV17Args {
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
    /**
     * Public-B chunk size in atoms (u128).
     *
     * WARNING: A small value (e.g. 1_000_000) can stall deep liquidations —
     * the engine returns `RecoveryRequired` when the bankrupt position's
     * liability exceeds this limit and insurance is insufficient to cover it.
     * Use `PUBLIC_B_CHUNK_ATOMS_UNLIMITED` (= engine's `MAX_VAULT_TVL` =
     * 10_000_000_000_000_000) unless you have a specific chunk-limit requirement
     * and a funded insurance pool.
     */
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
 *   publicBChunkAtoms: PUBLIC_B_CHUNK_ATOMS_UNLIMITED,  // use engine's MAX_VAULT_TVL; small values stall deep liquidations
 *   maintenanceFeePerSlot: 0n,
 * });
 * ```
 */
declare function encodeInitMarket(args: InitMarketV17Args | InitMarketArgs): Uint8Array;
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
interface InitUserArgs {
    /** @deprecated feePayment is ignored in v17 — kept for source compatibility only. */
    feePayment?: bigint | string;
}
declare function encodeInitUser(_args?: InitUserArgs): Uint8Array;
/**
 * InitLP (tag 2) — REMOVED in v17.
 *
 * Tag 2 has no decode arm in the v17 wrapper program. Calling this instruction
 * results in ProgramError::InvalidInstructionData on-chain.
 *
 * @deprecated Use the LP Vault flow (CreateLpVault tag 74) instead.
 */
interface InitLPArgs {
    matcherProgram: PublicKey | string;
    matcherContext: PublicKey | string;
    feePayment: bigint | string;
}
declare function encodeInitLP(_args: InitLPArgs): Uint8Array;
/**
 * DepositCollateral instruction data.
 *
 * v18 wire (integration `a9318945`, tag 3): tag(1) + portfolio_id(u64) +
 * expected_sequence(u64) + amount(u128 LE) = 33 bytes.
 *
 * BREAKING vs v17: `portfolio_id` and `expected_sequence` were added
 * BEFORE `amount` as part of the v16-migration identity-binding overhaul —
 * Deposit is now CAS-bound to the portfolio's identity/sequence the same way
 * ClosePortfolio and ConvertReleasedPnl are. `expected_sequence` is the
 * portfolio's CURRENT `PortfolioMatcherConfigV16` sequence watermark
 * (`expected_sequence`/`matcher_sequence`), read live before signing — NOT
 * incremented client-side.
 *
 * @param portfolioId       The portfolio's program-assigned identity (`PORTFOLIO_ID_OFF`).
 * @param expectedSequence  The portfolio's current matcher-sequence watermark, read live.
 * @param amount            Collateral to deposit (u128; supports sub-cent precision).
 *
 * @example
 * ```ts
 * const data = encodeDepositCollateral({
 *   portfolioId: portfolio.portfolioId,
 *   expectedSequence: portfolio.matcherSequence,
 *   amount: 1_000_000n,
 * });
 * ```
 */
interface DepositCollateralArgs {
    /** @deprecated userIdx is no longer needed — portfolios are identified by account key in v17+. */
    userIdx?: number;
    portfolioId: bigint | string;
    expectedSequence: bigint | string;
    amount: bigint | string;
}
declare function encodeDepositCollateral(args: DepositCollateralArgs): Uint8Array;
/**
 * WithdrawCollateral instruction data.
 *
 * v18 wire (integration `a9318945`, tag 4): tag(1) + portfolio_id(u64) +
 * expected_sequence(u64) + amount(u128 LE) = 33 bytes.
 *
 * BREAKING vs v17: `portfolio_id` and `expected_sequence` were added
 * BEFORE `amount` as part of the v16-migration identity-binding overhaul —
 * same CAS binding as {@link encodeDepositCollateral}.
 *
 * @param portfolioId       The portfolio's program-assigned identity.
 * @param expectedSequence  The portfolio's current matcher-sequence watermark, read live.
 * @param amount            Collateral to withdraw (u128).
 *
 * @example
 * ```ts
 * const data = encodeWithdrawCollateral({
 *   portfolioId: portfolio.portfolioId,
 *   expectedSequence: portfolio.matcherSequence,
 *   amount: 500_000n,
 * });
 * ```
 */
interface WithdrawCollateralArgs {
    /** @deprecated userIdx is no longer needed — portfolios are identified by account key in v17+. */
    userIdx?: number;
    portfolioId: bigint | string;
    expectedSequence: bigint | string;
    amount: bigint | string;
}
declare function encodeWithdrawCollateral(args: WithdrawCollateralArgs): Uint8Array;
/**
 * PermissionlessCrank (tag 5) action byte values.
 *
 * @deprecated REMOVED from the wire in the v16-migration (VERSION 18,
 * integration `a9318945`). The v18 decoder for tag 5 no longer reads an
 * `action` byte at all — see {@link encodePermissionlessCrank}. Kept only so
 * source referencing `CrankAction.*` for other purposes does not break at
 * compile time.
 */
declare const CrankAction: {
    /**
     * #381: action 0 is `Refresh` in the program, not `FeeSweep`.
     *
     * `v16_program.rs` decodes `0 => PermissionlessCrankActionV16::Refresh`. The
     * name is kept as an alias below so existing callers do not break, but
     * `Refresh` is what the program calls it and what a reader should match
     * against when comparing this file to the wrapper.
     */
    readonly Refresh: 0;
    /** @deprecated Alias for {@link CrankAction.Refresh} — the program's name. */
    readonly FeeSweep: 0;
    readonly Liquidate: 1;
    /**
     * #381: action 2 was MISSING from this enum entirely.
     *
     * `2 => PermissionlessCrankActionV16::SettleB` is the permissionless
     * bankrupt-settlement path. Omitting it did not merely mislabel something — it
     * hid the action's existence from every SDK consumer, so a keeper reading this
     * file would conclude the crank had two modes and never call the third.
     */
    readonly SettleB: 2;
};
/**
 * Maximum number of {@link CrankObservationHint} entries `encodePermissionlessCrank`
 * will encode in one instruction. Matches the wrapper's
 * `CRANK_OBSERVATION_DECODE_MAX = 16` (`v16_program.rs:5602`) — the decoder
 * hard-rejects `n > 16` with `InvalidInstructionData` before reading any hint
 * bytes, so exceeding this client-side is always a wasted transaction, never
 * a partial success.
 */
declare const CRANK_OBSERVATION_DECODE_MAX = 16;
/**
 * One asset/oracle-account hint for {@link PermissionlessCrankArgs.observations}.
 * Mirrors the wrapper's `CrankObservationHint { asset_index: u16, oracle_accounts: u8 }`
 * (`v16_program.rs:5593`).
 *
 * @param assetIndex      Asset/domain index this hint targets.
 * @param oracleAccounts  Count of oracle accounts supplied in the instruction's
 *                        account list for this asset (consumed by the wrapper's
 *                        variable-length account-list walk).
 */
interface CrankObservationHint {
    assetIndex: number;
    oracleAccounts: number;
}
/**
 * PermissionlessCrank (tag 5) instruction args.
 *
 * BREAKING WIRE CHANGE in the v16-migration (VERSION 18, integration
 * `a9318945`): the entire v17 payload (`action`/`asset_index`/`now_slot`/
 * `funding_rate_e9`/`recovery_reason`, 29 bytes) is GONE. The v18 decoder
 * reads:
 *
 * ```
 * 5 => {
 *     let now_slot = read_u64(&mut rest)?;
 *     let n = read_u8(&mut rest)? as usize;   // observations.len(), <= CRANK_OBSERVATION_DECODE_MAX
 *     // n × { asset_index: u16, oracle_accounts: u8 }
 *     Self::PermissionlessCrank { now_slot, observations }
 * }
 * ```
 *
 * v18 wire: tag(1) + now_slot(u64) + n(u8) + n×(asset_index(u16) +
 *   oracle_accounts(u8)) = 10 + 3n bytes (variable length; n=0 is legal and
 *   encodes a bare liveness/no-op crank).
 *
 * There is no `action` byte, no `funding_rate_e9`, and no `recovery_reason`
 * on this wire anymore — liquidation/settlement dispatch and the crank's
 * per-asset work are now driven entirely by on-chain state plus which assets
 * the caller hints via `observations`, not by a caller-chosen mode byte.
 * Encoding the old 29-byte v17 payload against a v18 wrapper misparses:
 * `now_slot` would read the old `action`+`asset_index`+3 bytes of `now_slot`
 * as its own 8-byte `now_slot`, and `n` would read whatever byte happened to
 * land at offset 9 — silently wrong, not a decode error, unless `n` happens
 * to exceed 16 or overrun the buffer.
 *
 * @param nowSlot       Current slot (for crank freshness checks).
 * @param observations  Per-asset oracle-account hints (0..=16 entries).
 *
 * @example
 * ```ts
 * const data = encodePermissionlessCrank({
 *   nowSlot: currentSlot,
 *   observations: [{ assetIndex: 0, oracleAccounts: 1 }],
 * });
 * ```
 */
interface PermissionlessCrankArgs {
    nowSlot: bigint | string;
    observations: CrankObservationHint[];
    /** @deprecated Removed from the v18 wire — no longer encoded. */
    action?: number;
    /** @deprecated Removed from the v18 wire — no longer encoded. */
    assetIndex?: number;
    /** @deprecated Removed from the v18 wire — no longer encoded. */
    recoveryReason?: number;
}
declare function encodePermissionlessCrank(args: PermissionlessCrankArgs): Uint8Array;
/**
 * @deprecated v12.17 KeeperCrank wire format is not accepted by v17.
 * Use encodePermissionlessCrank() instead.
 *
 * Retained for source-compat only. Will throw to prevent silent misuse.
 */
interface KeeperCrankArgs {
    callerIdx: number;
    candidates?: unknown[];
}
declare function encodeKeeperCrank(_args: KeeperCrankArgs): Uint8Array;
/**
 * TradeNoCpi instruction data (v18 wire format, integration `a9318945`).
 *
 * v18 wire: tag(1) + account_a_portfolio_id(u64) + account_a_position_epoch(u64) +
 *   account_b_portfolio_id(u64) + account_b_position_epoch(u64) + asset_index(u16) +
 *   market_id(u64) + size_q(i128) + exec_price(u64) + fee_bps(u64) +
 *   backing_fee_cap_bps(u16) = 77 bytes.
 *
 * BREAKING vs v17 (35-byte payload): the v16-migration identity-binding
 * overhaul CAS-binds BOTH legs' portfolio identity/position-epoch, adds
 * `market_id` (TB-4's market-id-bearing cluster) right after `asset_index`,
 * and appends `backing_fee_cap_bps` — the caller-supplied ceiling on the
 * matcher-authorized backing fee for this fill (0 fails closed against any
 * nonzero backing-domain fee; see the matcher-return `backing_fee_cap_bps`
 * bits 8..21 this value is checked against on the CPI-trade path).
 * `accountAPositionEpoch`/`accountBPositionEpoch` must be each side's LIVE
 * current `position_epoch`, read immediately before signing — NOT
 * incremented client-side (CAS, not a monotonic nonce).
 *
 * @param accountAPortfolioId    Account A's portfolio identity.
 * @param accountAPositionEpoch  Account A's current position epoch (CAS, live-read).
 * @param accountBPortfolioId    Account B's portfolio identity.
 * @param accountBPositionEpoch  Account B's current position epoch (CAS, live-read).
 * @param assetIndex Asset/domain index.
 * @param marketId   The traded asset's market_id.
 * @param sizeQ      Trade quantity (signed; positive=long, negative=short).
 * @param execPrice  Execution price in e6 units.
 * @param feeBps     Fee in basis points.
 * @param backingFeeCapBps  Caller's ceiling on the backing-domain fee (0..=10000).
 *
 * @example
 * ```ts
 * const data = encodeTradeNoCpi({
 *   accountAPortfolioId: a.portfolioId,
 *   accountAPositionEpoch: a.legs[0].epochSnap,
 *   accountBPortfolioId: b.portfolioId,
 *   accountBPositionEpoch: b.legs[0].epochSnap,
 *   assetIndex: 0,
 *   marketId: 1n,
 *   sizeQ: 1_000_000n,
 *   execPrice: 50_000_000_000n,
 *   feeBps: 30n,
 *   backingFeeCapBps: 0,
 * });
 * ```
 */
interface TradeNoCpiArgs {
    accountAPortfolioId: bigint | string;
    accountAPositionEpoch: bigint | string;
    accountBPortfolioId: bigint | string;
    accountBPositionEpoch: bigint | string;
    assetIndex: number;
    marketId: bigint | string;
    sizeQ: bigint | string;
    execPrice: bigint | string;
    feeBps: bigint | string;
    backingFeeCapBps: number;
}
declare function encodeTradeNoCpi(args: TradeNoCpiArgs): Uint8Array;
/**
 * LiquidateAtOracle (tag 7) — REMOVED in v17.
 *
 * Tag 7 has no decode arm in the v17 wrapper program. Sending this instruction
 * results in ProgramError::InvalidInstructionData on-chain.
 *
 * @deprecated Liquidations are handled via PermissionlessCrank (tag 5) in v17.
 */
interface LiquidateAtOracleArgs {
    targetIdx: number;
}
declare function encodeLiquidateAtOracle(_args: LiquidateAtOracleArgs): Uint8Array;
/**
 * ClosePortfolio / CloseAccount instruction data (v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + portfolio_id(u64) + expected_sequence(u64) +
 *   position_epoch(u64) = 25 bytes.
 *
 * BREAKING vs v17 (bare 1-byte tag): the v16-migration identity-binding
 * overhaul CAS-binds ClosePortfolio to the portfolio's identity, matcher
 * sequence AND position epoch. All three must be the LIVE current values,
 * read immediately before signing.
 *
 * @param portfolioId       The portfolio's program-assigned identity.
 * @param expectedSequence  The portfolio's current matcher-sequence watermark, read live.
 * @param positionEpoch     The portfolio's current position epoch, read live.
 *
 * @example
 * ```ts
 * const data = encodeCloseAccount({
 *   portfolioId: portfolio.portfolioId,
 *   expectedSequence: portfolio.matcherSequence,
 *   positionEpoch: portfolio.legs[0].epochSnap,
 * });
 * ```
 */
interface CloseAccountArgs {
    /** @deprecated userIdx is not read in v17+; portfolios are identified by account key. */
    userIdx?: number;
    portfolioId: bigint | string;
    expectedSequence: bigint | string;
    positionEpoch: bigint | string;
}
declare function encodeCloseAccount(args: CloseAccountArgs): Uint8Array;
/**
 * TopUpInsurance instruction data (v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + market_id(u64) + intent_id(u64) + authority_epoch(u64) +
 *   amount(u128 LE) = 41 bytes.
 *
 * BREAKING vs v17 (17-byte payload): the v16-migration identity-binding
 * overhaul (§4-locked common cluster order `market_id, intent_id,
 * authority_epoch, amount`) adds all three fields before `amount`.
 * `intent_id` is a one-shot, strictly-increasing replay nonce (per-asset-0
 * `insurance_top_up` lane, shared with {@link encodeTopUpInsuranceDomain}) —
 * a value that is not strictly greater than the stored lane is rejected.
 * `authority_epoch` here is NOT a CAS/current-epoch value the way the
 * UpdateAssetAuthority-family tags are — read the field from the live asset
 * control-sequences state before signing regardless.
 *
 * @param marketId        The asset's market_id.
 * @param intentId        Strictly-increasing one-shot replay nonce (asset-0 `insurance_top_up` lane).
 * @param authorityEpoch  Live authority-epoch value for this top-up.
 * @param amount          Amount to top up the insurance fund (u128).
 *
 * @example
 * ```ts
 * const data = encodeTopUpInsurance({
 *   marketId: 1n,
 *   intentId: nextIntentId,
 *   authorityEpoch: 0n,
 *   amount: 10_000_000n,
 * });
 * ```
 */
interface TopUpInsuranceArgs {
    marketId: bigint | string;
    intentId: bigint | string;
    authorityEpoch: bigint | string;
    amount: bigint | string;
}
declare function encodeTopUpInsurance(args: TopUpInsuranceArgs): Uint8Array;
/**
 * TopUpInsuranceDomain instruction data (tag 56, v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + domain(u16 LE) + market_id(u64) + intent_id(u64) +
 *   authority_epoch(u64) + amount(u128 LE) = 43 bytes.
 *
 * Domain-scoped sibling of {@link encodeTopUpInsurance} — same §4-locked
 * common cluster order (`market_id, intent_id, authority_epoch, amount`)
 * plus the leading `domain`. `intent_id` is the SAME asset-0 `insurance_top_up`
 * one-shot replay lane TopUpInsurance(9) uses — "Both insurance top-up
 * entrypoints share `insurance_top_up` so an intent cannot be replayed
 * through the alternate route" (wrapper source comment).
 *
 * No encoder existed for this tag prior to the v16-migration SDK update —
 * added here for the first time, matching a9318945 exactly.
 *
 * @param domain          Domain index (2*assetIndex long, 2*assetIndex+1 short).
 * @param marketId        The asset's market_id.
 * @param intentId        Strictly-increasing one-shot replay nonce (asset-0 `insurance_top_up` lane, shared with {@link encodeTopUpInsurance}).
 * @param authorityEpoch  Live authority-epoch value for this top-up.
 * @param amount          Amount to top up the insurance fund (u128).
 *
 * @example
 * ```ts
 * const data = encodeTopUpInsuranceDomain({
 *   domain: 0,
 *   marketId: 1n,
 *   intentId: nextIntentId,
 *   authorityEpoch: 0n,
 *   amount: 10_000_000n,
 * });
 * ```
 */
interface TopUpInsuranceDomainArgs {
    domain: number;
    marketId: bigint | string;
    intentId: bigint | string;
    authorityEpoch: bigint | string;
    amount: bigint | string;
}
declare function encodeTopUpInsuranceDomain(args: TopUpInsuranceDomainArgs): Uint8Array;
/**
 * TopUpBackingBucket instruction data (tag 24, v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + domain(u16 LE) + market_id(u64) + intent_id(u64) +
 *   authority_epoch(u64) + amount(u128 LE) + expiry_slot(u64 LE) = 51 bytes.
 *
 * BREAKING vs v17 (27-byte payload): the v16-migration identity-binding
 * overhaul adds `market_id`/`intent_id`/`authority_epoch` between `domain`
 * and `amount` (the §4-locked common cluster order). `intent_id` is a
 * strictly-increasing one-shot replay nonce, PER-ASSET (keyed by
 * `domain / 2`), distinct from TopUpInsurance/TopUpInsuranceDomain's shared
 * asset-0 `insurance_top_up` lane.
 *
 * Deposits `amount` quote atoms of external collateral into a source domain's
 * counterparty backing bucket, requesting `expirySlot` as the bucket's fresh
 * expiry. Gated by the asset's `backing_bucket_authority` (v16_program.rs
 * handle_top_up_backing_bucket, ~line 8439/8516; engine
 * deposit_fresh_counterparty_backing_not_atomic, percolator/src/v16.rs:6118).
 *
 * Domain numbering: for asset index `i`, the LONG domain is `2*i` and the
 * SHORT domain is `2*i + 1`.
 *
 * ENGINE MECHANICS (percolator/src/v16.rs prepare_counterparty_backing_add_delta,
 * ~line 755): if the bucket is Empty/Expired, it adopts `expirySlot` and
 * transitions to Fresh. If it is already Fresh with the SAME expiry, this is a
 * no-op (safe to call again). If it is Fresh with a DIFFERENT expiry — in
 * particular a LAPSED one (`current_slot >= expiry_slot`) — this call reverts
 * with Custom(21) LockActive. Seeding a bucket once while it is still Empty,
 * with `expirySlot = MAX_BACKING_BUCKET_EXPIRY_SLOT` (9223372036854775807 =
 * u64::MAX / 2, effectively never-lapsing), makes that domain immune to the
 * "backing-bucket-freshness deadlock" for the market's practical lifetime —
 * every later automatic loss-reserve requests the SAME existing expiry and
 * hits the harmless no-op arm instead of the LockActive trap.
 *
 * @param domain         Backing-bucket domain index (2*assetIndex for long,
 *                       2*assetIndex+1 for short).
 * @param marketId       The asset's market_id.
 * @param intentId       Strictly-increasing one-shot replay nonce, per-asset (`domain / 2`).
 * @param authorityEpoch Live authority-epoch value for this top-up.
 * @param amount     Quote atoms to deposit (u128; must be > 0). A small
 *                   nonzero "dust" amount is sufficient — there is no
 *                   minimum floor enforced by the engine.
 * @param expirySlot Requested fresh-expiry slot (u64). Use
 *                   MAX_BACKING_BUCKET_EXPIRY_SLOT to seed an immortal bucket.
 *
 * @example
 * ```ts
 * // Seed the long domain (asset 0) immortal, while the bucket is still Empty.
 * const data = encodeTopUpBackingBucket({
 *   domain: 0,
 *   marketId: 1n,
 *   intentId: nextIntentId,
 *   authorityEpoch: 0n,
 *   amount: 10_000n, // 0.01 Sim-USDC dust
 *   expirySlot: MAX_BACKING_BUCKET_EXPIRY_SLOT,
 * });
 * ```
 */
declare const MAX_BACKING_BUCKET_EXPIRY_SLOT: bigint;
interface TopUpBackingBucketArgs {
    domain: number;
    marketId: bigint | string;
    intentId: bigint | string;
    authorityEpoch: bigint | string;
    amount: bigint | string;
    expirySlot: bigint | string;
}
declare function encodeTopUpBackingBucket(args: TopUpBackingBucketArgs): Uint8Array;
/**
 * WithdrawBackingBucket instruction data (tag 50, v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + domain(u16 LE) + market_id(u64) + amount(u128 LE) +
 *   authority_epoch(u64) = 35 bytes.
 *
 * BREAKING vs v17 (19-byte payload): adds `market_id` after `domain` and
 * appends `authority_epoch` — a CAS check against the asset's OWN
 * `AssetControlSequencesV16.authority_epoch` lane (W3A-1 direct-withdrawal
 * binding). Pass the LIVE current epoch, NOT current+1 — the program itself
 * decides and stores the next value; the caller only proves it read the
 * current one.
 *
 * Withdraws `amount` quote atoms of backing-bucket PRINCIPAL from a domain
 * back to the authority's token account. Gated by the asset's
 * `backing_bucket_authority` (or marketauth) — v16_program.rs
 * `handle_withdraw_backing_bucket` → `verify_domain_withdrawal_preflight`
 * with DOMAIN_WITHDRAW_AUTH_BACKING. The destination token account must be
 * OWNED by the signing authority (verify_withdrawable_token_accounts).
 *
 * Together with TopUpBackingBucket (24, deposit) and
 * WithdrawBackingBucketEarnings (52, fee earnings) this completes the
 * LP-provider backing-bucket loop.
 *
 * @param domain Backing-bucket domain index (2*assetIndex for long,
 *               2*assetIndex+1 for short).
 * @param marketId       The asset's market_id.
 * @param amount Quote atoms to withdraw (u128; must be > 0).
 * @param authorityEpoch Live-read current `authority_epoch` for this asset (CAS, expected-current).
 */
interface WithdrawBackingBucketArgs {
    domain: number;
    marketId: bigint | string;
    amount: bigint | string;
    authorityEpoch: bigint | string;
}
declare function encodeWithdrawBackingBucket(args: WithdrawBackingBucketArgs): Uint8Array;
/**
 * UpdateBackingFeePolicy instruction data (tag 51, v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + domain(u16 LE) + market_id(u64) + fee_bps(u16 LE) +
 *   insurance_share_bps(u16 LE) + policy_sequence(u64) = 23 bytes.
 *
 * BREAKING vs v17 (7-byte payload): adds `market_id` after `domain` and
 * appends `policy_sequence` — a strictly-increasing replay nonce (this
 * asset's control-sequences lane), NOT a CAS/current-epoch value.
 *
 * THE switch that turns on LP-vault yield for a domain: sets the
 * backing-trade fee charged on that domain's fills, of which
 * `insurance_share_bps` is diverted to the insurance budget and the
 * remainder accrues to the domain's backing-bucket providers as
 * `utilization_fee_earnings` (withdrawable via tag 52). Every live market
 * currently has this at 0 — which is why LP APY is 0%.
 *
 * Gated by the asset's `insurance_authority` (v16_program.rs
 * `handle_update_backing_fee_policy`, gate at ~10492) — NOT marketauth, so
 * the market creator can call it even after the launch flow rotates
 * marketauth to the stake-pool PDA. Market must be Live.
 *
 * Handler-side validation (reverts InvalidInstruction otherwise):
 * fee_bps ≤ 10_000, insurance_share_bps ≤ 10_000, fee_bps == 0 implies
 * insurance_share_bps == 0, fee_bps ≤ the market's max_trading_fee_bps and
 * ≤ MAX_DYNAMIC_TRADE_FEE_BPS.
 *
 * @param domain            Domain index (2*assetIndex long, 2*assetIndex+1 short).
 * @param marketId          The asset's market_id.
 * @param feeBps            Backing-trade fee in bps (0 turns the fee off).
 * @param insuranceShareBps Share of that fee diverted to insurance, in bps
 *                          of the fee (the rest goes to backing providers).
 * @param policySequence    Strictly-increasing replay nonce (this asset's control-sequences lane).
 */
interface UpdateBackingFeePolicyArgs {
    domain: number;
    marketId: bigint | string;
    feeBps: number;
    insuranceShareBps: number;
    policySequence: bigint | string;
}
declare function encodeUpdateBackingFeePolicy(args: UpdateBackingFeePolicyArgs): Uint8Array;
/**
 * WithdrawBackingBucketEarnings instruction data (tag 52, v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + domain(u16 LE) + market_id(u64) + amount(u128 LE) +
 *   authority_epoch(u64) = 35 bytes.
 *
 * BREAKING vs v17 (19-byte payload): adds `market_id` after `domain` and
 * appends `authority_epoch` (same CAS binding as {@link encodeWithdrawBackingBucket} —
 * pass the LIVE current epoch, not current+1).
 *
 * Withdraws accrued `utilization_fee_earnings` (the LP-provider share of the
 * backing-trade fee enabled via tag 51) from a domain's backing bucket to
 * the authority's token account. Gated by the asset's
 * `backing_bucket_authority` (or marketauth) — v16_program.rs
 * `handle_withdraw_backing_bucket_earnings` → same
 * DOMAIN_WITHDRAW_AUTH_BACKING preflight as tag 50. Unlike tag 50, the
 * per-domain ledger account is REQUIRED (account [2]).
 *
 * @param domain Domain index (2*assetIndex long, 2*assetIndex+1 short).
 * @param marketId       The asset's market_id.
 * @param amount Earnings quote atoms to withdraw (u128; must be > 0).
 * @param authorityEpoch Live-read current `authority_epoch` for this asset (CAS, expected-current).
 */
interface WithdrawBackingBucketEarningsArgs {
    domain: number;
    marketId: bigint | string;
    amount: bigint | string;
    authorityEpoch: bigint | string;
}
declare function encodeWithdrawBackingBucketEarnings(args: WithdrawBackingBucketEarningsArgs): Uint8Array;
/**
 * TradeCpi instruction data (v18 wire format, integration `a9318945`).
 *
 * v18 wire: tag(1) + account_a_portfolio_id(u64) + account_a_position_epoch(u64) +
 *   account_b_portfolio_id(u64) + account_b_position_epoch(u64) +
 *   account_b_matcher_sequence(u64) + asset_index(u16) + market_id(u64) +
 *   size_q(i128) + fee_bps(u64) + limit_price(u64) + backing_fee_cap_bps(u16)
 *   = 87 bytes.
 *
 * BREAKING vs v17 (35-byte payload): same identity-binding additions as
 * {@link encodeTradeNoCpi} (both legs' portfolio id/position epoch,
 * `market_id`, `backing_fee_cap_bps`), PLUS `account_b_matcher_sequence` —
 * account B is the CPI-matched side, and this binds the matcher-authorized
 * fill to B's LIVE current matcher-sequence watermark (CAS).
 *
 * @param accountAPortfolioId       Account A's portfolio identity.
 * @param accountAPositionEpoch     Account A's current position epoch (CAS, live-read).
 * @param accountBPortfolioId       Account B's portfolio identity.
 * @param accountBPositionEpoch     Account B's current position epoch (CAS, live-read).
 * @param accountBMatcherSequence   Account B's current matcher-sequence watermark (CAS, live-read).
 * @param assetIndex Asset/domain index.
 * @param marketId   The traded asset's market_id.
 * @param sizeQ      Trade quantity (signed).
 * @param feeBps     Fee in basis points.
 * @param limitPrice Limit price in e6 units. 0 = no limit (accept any price).
 *                   Buys: reject if exec_price > limit_price.
 *                   Sells: reject if exec_price < limit_price.
 * @param backingFeeCapBps  Caller's ceiling on the backing-domain fee (0..=10000).
 *
 * @example
 * ```ts
 * const data = encodeTradeCpi({
 *   accountAPortfolioId: a.portfolioId,
 *   accountAPositionEpoch: a.legs[0].epochSnap,
 *   accountBPortfolioId: b.portfolioId,
 *   accountBPositionEpoch: b.legs[0].epochSnap,
 *   accountBMatcherSequence: b.matcherSequence,
 *   assetIndex: 0,
 *   marketId: 1n,
 *   sizeQ: 1_000_000n,
 *   feeBps: 30n,
 *   limitPrice: 51_000_000_000n,  // max price for a buy
 *   backingFeeCapBps: 0,
 * });
 * ```
 */
interface TradeCpiArgs {
    accountAPortfolioId: bigint | string;
    accountAPositionEpoch: bigint | string;
    accountBPortfolioId: bigint | string;
    accountBPositionEpoch: bigint | string;
    accountBMatcherSequence: bigint | string;
    assetIndex: number;
    marketId: bigint | string;
    sizeQ: bigint | string;
    feeBps: bigint | string;
    /** Limit price in e6 units. 0 = no limit. */
    limitPrice: bigint | string;
    backingFeeCapBps: number;
}
declare function encodeTradeCpi(args: TradeCpiArgs): Uint8Array;
/**
 * @deprecated Tag 35 removed in v12.17. Use TradeCpi (tag 10) with limitPriceE6 instead.
 * TradeCpi now handles PDA bump internally. Sending tag 35 will fail with InvalidInstructionData.
 */
interface TradeCpiV2Args {
    lpIdx: number;
    userIdx: number;
    size: bigint | string;
    bump: number;
}
/** @deprecated Tag 35 removed in v12.17. Use encodeTradeCpi with limitPriceE6 instead. */
declare function encodeTradeCpiV2(_args: TradeCpiV2Args): Uint8Array;
/**
 * @deprecated Tag 36 removed in v12.17. Will fail on-chain with InvalidInstructionData.
 */
interface UnresolveMarketArgs {
    confirmation: bigint | string;
}
/** @deprecated Tag 36 removed in v12.17. Will fail on-chain. */
declare function encodeUnresolveMarket(_args: UnresolveMarketArgs): Uint8Array;
/**
 * @deprecated Tag 11 removed in v12.17. Insurance floor is now set at InitMarket.
 * Sending this instruction will fail with InvalidInstructionData.
 */
interface SetRiskThresholdArgs {
    newThreshold: bigint | string;
}
/** @deprecated Tag 11 removed in v12.17. Will fail on-chain. */
declare function encodeSetRiskThreshold(_args: SetRiskThresholdArgs): Uint8Array;
/**
 * UpdateAdmin (tag 12) — REMOVED in v17.
 *
 * Tag 12 has no decode arm in the v17 wrapper program. Calling this instruction
 * results in ProgramError::InvalidInstructionData on-chain.
 *
 * @deprecated Use UpdateAuthority (tag 32) or UpdateAssetAuthority (tag 65) in v17.
 */
interface UpdateAdminArgs {
    newAdmin: PublicKey | string;
}
/** @deprecated Tag 12 removed in v17. Will fail on-chain. */
declare function encodeUpdateAdmin(_args: UpdateAdminArgs): Uint8Array;
/**
 * CloseSlab instruction data (tag 13, v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + authority_epoch(u64) = 9 bytes.
 *
 * BREAKING vs v17 (bare 1-byte tag): appends `authority_epoch` — a CAS check
 * (strict `current == expected`). Pass the LIVE current epoch, NOT current+1.
 *
 * @param authorityEpoch Live-read current authority_epoch (CAS, expected-current).
 */
declare function encodeCloseSlab(authorityEpoch: bigint | string): Uint8Array;
/**
 * UpdateConfig instruction data.
 *
 * 35 bytes: tag(1) + funding_horizon_slots(8) + funding_k_bps(8) +
 * funding_max_premium_bps(8) + funding_max_e9_per_slot(8) +
 * tvl_insurance_cap_mult(2). Wire layout matches v12.19 wrapper at
 * src/percolator.rs:2027-2041 (handle_update_config decode).
 */
interface UpdateConfigArgs {
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
declare function encodeUpdateConfig(_args: UpdateConfigArgs): Uint8Array;
/**
 * @deprecated Tag 15 removed in v12.17. Maintenance fee is set at InitMarket only.
 * Sending this instruction will fail with InvalidInstructionData.
 */
interface SetMaintenanceFeeArgs {
    newFee: bigint | string;
}
/** @deprecated Tag 15 removed in v12.17. Will fail on-chain. */
declare function encodeSetMaintenanceFee(_args: SetMaintenanceFeeArgs): Uint8Array;
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
interface SetOraclePriceCapArgs {
    maxChangeE2bps: bigint | string;
}
/** @deprecated v12.x SetOraclePriceCap (old tag 16). Not in v17. */
declare function encodeSetOraclePriceCap(_args: SetOraclePriceCapArgs): Uint8Array;
/**
 * ResolveMode constants — retained for source compatibility with v12.x callers.
 *
 * @deprecated v17 ResolveMarket (tag 19) has no mode byte. These constants are
 * no longer encoded into the instruction data. They may be used in logging or
 * off-chain logic but must not be passed to encodeResolveMarket.
 */
declare const RESOLVE_MODE_ORDINARY: 0;
declare const RESOLVE_MODE_DEGENERATE: 1;
type ResolveMode = typeof RESOLVE_MODE_ORDINARY | typeof RESOLVE_MODE_DEGENERATE;
/**
 * ResolveMarket instruction data (v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + asset_generation_frontier(u64) + authority_epoch(u64) = 17 bytes.
 *
 * BREAKING vs v17 (bare 1-byte tag): the v16-migration identity-binding
 * overhaul adds `asset_generation_frontier` (the caller's live-read view of
 * the market's asset-set generation, guarding against resolving mid asset
 * activation/retirement) and `authority_epoch` (CAS — the live current
 * epoch, not current+1).
 *
 * The `mode` argument remains accepted for v12.x source compatibility but is
 * silently ignored — v18 ResolveMarket has no mode byte either.
 *
 * @param assetGenerationFrontier  Live-read current asset-set generation.
 * @param authorityEpoch           Live-read current authority_epoch (CAS, expected-current).
 *
 * @example
 * ```ts
 * const data = encodeResolveMarket({
 *   assetGenerationFrontier: cfg.assetSetEpoch,
 *   authorityEpoch: 0n,
 * });
 * ```
 */
declare function encodeResolveMarket(args: {
    mode?: ResolveMode;
    assetGenerationFrontier: bigint | string;
    authorityEpoch: bigint | string;
}): Uint8Array;
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
interface WithdrawInsuranceArgs {
    amount: bigint | string;
}
declare function encodeWithdrawInsurance(args: WithdrawInsuranceArgs): Uint8Array;
/**
 * AdminForceClose instruction data (3 bytes)
 * Force-close any position at oracle price (admin only, skips margin checks).
 */
interface AdminForceCloseArgs {
    targetIdx: number;
}
/** @deprecated v12.x AdminForceClose (old tag 17). Not in v17. */
declare function encodeAdminForceClose(_args: AdminForceCloseArgs): Uint8Array;
/**
 * @deprecated Tag 22 is now SetInsuranceWithdrawPolicy in v12.17.
 * This encoder sends the WRONG wire format (u64+u64 instead of pubkey+u64+u16+u64).
 * Use encodeSetInsuranceWithdrawPolicy instead.
 */
interface UpdateRiskParamsArgs {
    initialMarginBps: bigint | string;
    maintenanceMarginBps: bigint | string;
    tradingFeeBps?: bigint | string;
}
/** @deprecated Use encodeSetInsuranceWithdrawPolicy (tag 22). This sends wrong wire format. */
declare function encodeUpdateRiskParams(_args: UpdateRiskParamsArgs): Uint8Array;
/**
 * On-chain confirmation code for RenounceAdmin (must match program constant).
 * ASCII "RENOUNCE" as u64 LE = 0x52454E4F554E4345.
 */
declare const RENOUNCE_ADMIN_CONFIRMATION = 5928230587143701317n;
/**
 * On-chain confirmation code for UnresolveMarket (must match program constant).
 */
declare const UNRESOLVE_CONFIRMATION = 16045690984503054900n;
/**
 * @deprecated Tag 23 is now WithdrawInsuranceLimited in v12.17.
 * This encoder sends the confirmation code as a withdrawal amount — DANGEROUS.
 * Use encodeWithdrawInsuranceLimited instead.
 */
declare function encodeRenounceAdmin(): Uint8Array;
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
interface LpVaultWithdrawArgs {
    /** Amount of LP vault tokens to burn. */
    lpAmount: bigint | string;
}
/**
 * @deprecated v12.x LpVaultWithdraw (tag 39 in v12, now alias 76=RequestRedeemLpShares in v17).
 * v17 uses a 2-step request/execute redemption flow — see encodeRequestRedeemLpShares.
 */
declare function encodeLpVaultWithdraw(_args: LpVaultWithdrawArgs): Uint8Array;
/**
 * @deprecated v12.x PauseMarket (old tag 56). v17 reuses tag 56 for TopUpInsuranceDomain.
 */
declare function encodePauseMarket(): Uint8Array;
/**
 * @deprecated v12.x UnpauseMarket (old tag 58). v17 reuses tag 58 for UpdateFeeRedirectPolicy.
 */
declare function encodeUnpauseMarket(): Uint8Array;
/**
 * @deprecated Tag 32 removed in v12.17. Pyth oracle is configured at InitMarket via indexFeedId.
 * Sending this instruction will fail with InvalidInstructionData.
 */
interface SetPythOracleArgs {
    feedId: Uint8Array;
    maxStalenessSecs: bigint;
    confFilterBps: number;
}
/** @deprecated Tag 32 removed in v12.17. Pyth is configured at InitMarket. */
declare function encodeSetPythOracle(args: SetPythOracleArgs): Uint8Array;
/**
 * Derive the expected Pyth PriceUpdateV2 account address for a given feed ID.
 * Uses PDA seeds: [shard_id(2), feed_id(32)] under the Pyth Receiver program.
 *
 * @param feedId  32-byte Pyth feed ID
 * @param shardId Shard index (default 0 for mainnet/devnet)
 */
declare const PYTH_RECEIVER_PROGRAM_ID = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
declare function derivePythPriceUpdateAccount(feedId: Uint8Array, shardId?: number): Promise<string>;
/**
 * @deprecated Tag 33 removed in v12.17. Use UpdateHyperpMark (tag 34) for DEX-oracle markets.
 * Sending this instruction will fail with InvalidInstructionData.
 */
declare function encodeUpdateMarkPrice(): Uint8Array;
/**
 * Mark price EMA parameters (must match program/src/percolator.rs constants).
 */
declare const MARK_PRICE_EMA_WINDOW_SLOTS = 72000n;
declare const MARK_PRICE_EMA_ALPHA_E6: bigint;
/**
 * Compute the next EMA mark price step (TypeScript mirror of the on-chain function).
 */
declare function computeEmaMarkPrice(markPrevE6: bigint, oracleE6: bigint, dtSlots: bigint, alphaE6?: bigint, capE2bps?: bigint): bigint;
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
declare function encodeUpdateHyperpMark(): Uint8Array;
/**
 * @deprecated v12.x FundMarketInsurance (old tag 25). Not in v17.
 */
declare function encodeFundMarketInsurance(_args: {
    amount: bigint;
}): Uint8Array;
/**
 * Set insurance isolation BPS for a market.
 * Accounts: [admin(signer), slab(writable)]
 */
declare function encodeSetInsuranceIsolation(args: {
    bps: number;
}): Uint8Array;
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
declare function encodeQueueWithdrawal(_args: {
    lpAmount: bigint | string;
}): Uint8Array;
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
declare function encodeClaimQueuedWithdrawal(): Uint8Array;
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
declare function encodeCancelQueuedWithdrawal(): Uint8Array;
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
interface ExecuteAdlArgs {
    targetIdx: number;
}
/** @deprecated v12.x ExecuteAdl (old tag 101). Not in v17. */
declare function encodeExecuteAdl(_args: ExecuteAdlArgs): Uint8Array;
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
declare function encodeCloseStaleSlabs(): Uint8Array;
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
declare function encodeReclaimSlabRent(): Uint8Array;
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
declare function encodeAuditCrank(): Uint8Array;
/**
 * UpdateAssetLifecycle (tag 40) — activate, retire or reconfigure an asset
 * slot (v18 wire, integration `a9318945`).
 *
 * Wire: tag(1) + action(u8) + asset_index(u16) + market_id(u64) +
 *   authority_epoch(u64) + now_slot(u64) + initial_price(u64) +
 *   max_init_fee(u128) + insurance_authority[32] + insurance_operator[32] +
 *   backing_bucket_authority[32] + oracle_authority[32] = 180 bytes.
 *
 * BREAKING vs v17: adds `market_id` and `authority_epoch` (right after
 * `asset_index`) and `max_init_fee` (u128, right after `initial_price`).
 * `authority_epoch` is a CAS check against the TARGET asset's own
 * `AssetControlSequencesV16.authority_epoch` lane — pass the LIVE current
 * epoch, NOT current+1.
 *
 * @param action   Lifecycle action byte (program-defined — activate/retire/reconfigure).
 * @param assetIndex Asset index being acted on.
 * @param marketId   The asset's market_id.
 * @param authorityEpoch  Live-read current authority_epoch for this asset (CAS, expected-current).
 * @param nowSlot    Current slot.
 * @param initialPrice  Initial mark price in e6 units.
 * @param maxInitFee    Maximum permissionless-market-init fee the caller will accept (u128).
 * @param insuranceAuthority     New/current insurance authority for this asset.
 * @param insuranceOperator      New/current insurance operator for this asset.
 * @param backingBucketAuthority New/current backing-bucket authority for this asset.
 * @param oracleAuthority        New/current oracle authority for this asset.
 */
interface UpdateAssetLifecycleArgs {
    action: number;
    assetIndex: number;
    marketId: bigint | string;
    authorityEpoch: bigint | string;
    nowSlot: bigint | string;
    initialPrice: bigint | string;
    maxInitFee: bigint | string;
    insuranceAuthority: PublicKey | string;
    insuranceOperator: PublicKey | string;
    backingBucketAuthority: PublicKey | string;
    oracleAuthority: PublicKey | string;
}
declare function encodeUpdateAssetLifecycle(args: UpdateAssetLifecycleArgs): Uint8Array;
/**
 * CureAndCancelClose (tag 42) — deposit to cure a bankrupt/closing portfolio
 * and cancel its in-progress close (v18 wire, integration `a9318945`).
 *
 * Wire: tag(1) + portfolio_id(u64) + position_epoch(u64) +
 *   optional_deposit(u128) = 33 bytes.
 *
 * BREAKING vs v17 (17-byte, deposit-only payload): CAS-binds to the
 * portfolio's identity and current position epoch (both live-read).
 *
 * @param portfolioId      The portfolio's program-assigned identity.
 * @param positionEpoch    The portfolio's current position epoch, read live.
 * @param optionalDeposit  Atoms to deposit while curing (u128; 0 = no deposit, cancel only).
 */
interface CureAndCancelCloseArgs {
    portfolioId: bigint | string;
    positionEpoch: bigint | string;
    optionalDeposit: bigint | string;
}
declare function encodeCureAndCancelClose(args: CureAndCancelCloseArgs): Uint8Array;
/**
 * ForfeitRecoveryLeg (tag 43) — forfeit a leg's residual B budget during
 * bankruptcy recovery (v18 wire, integration `a9318945`).
 *
 * Wire: tag(1) + portfolio_id(u64) + position_epoch(u64) + asset_index(u16) +
 *   b_loss_atom_budget(u128) = 35 bytes.
 *
 * BREAKING vs v17: adds `portfolio_id`/`position_epoch` CAS binding (both
 * live-read) BEFORE `asset_index`. The trailing field itself was also
 * renamed on the wrapper side: `b_delta_budget` -> `b_loss_atom_budget`
 * (same position/type/width — cosmetic rename only, not a wire-shape
 * change).
 *
 * @param portfolioId      The portfolio's program-assigned identity.
 * @param positionEpoch    The portfolio's current position epoch, read live.
 * @param assetIndex       Leg's asset index.
 * @param bLossAtomBudget  Budget of B-domain loss atoms to forfeit (u128).
 */
interface ForfeitRecoveryLegArgs {
    portfolioId: bigint | string;
    positionEpoch: bigint | string;
    assetIndex: number;
    bLossAtomBudget: bigint | string;
}
declare function encodeForfeitRecoveryLeg(args: ForfeitRecoveryLegArgs): Uint8Array;
/**
 * RebalanceReduce (tag 44) — reduce a leg's position during bankruptcy
 * recovery rebalancing (v18 wire, integration `a9318945`).
 *
 * Wire: tag(1) + portfolio_id(u64) + position_epoch(u64) + asset_index(u16) +
 *   reduce_q(u128) = 35 bytes.
 *
 * BREAKING vs v17: adds `portfolio_id`/`position_epoch` CAS binding (both
 * live-read) BEFORE `asset_index`.
 *
 * @param portfolioId    The portfolio's program-assigned identity.
 * @param positionEpoch  The portfolio's current position epoch, read live.
 * @param assetIndex     Leg's asset index.
 * @param reduceQ        Quantity to reduce the leg by (u128).
 */
interface RebalanceReduceArgs {
    portfolioId: bigint | string;
    positionEpoch: bigint | string;
    assetIndex: number;
    reduceQ: bigint | string;
}
declare function encodeRebalanceReduce(args: RebalanceReduceArgs): Uint8Array;
/**
 * UpdateBaseUnitMints (tag 60) — rotate the primary/secondary base-unit
 * mints (v18 wire, integration `a9318945`).
 *
 * Wire: tag(1) + primary_mint[32] + secondary_mint[32] + authority_epoch(u64)
 *   = 73 bytes.
 *
 * BREAKING vs v17 (65-byte payload): appends `authority_epoch` — a CAS
 * check (strict `current == expected`). Pass the LIVE current epoch, NOT
 * current+1.
 *
 * @param primaryMint     New primary base-unit mint.
 * @param secondaryMint   New secondary base-unit mint.
 * @param authorityEpoch  Live-read current authority_epoch (CAS, expected-current).
 */
interface UpdateBaseUnitMintsArgs {
    primaryMint: PublicKey | string;
    secondaryMint: PublicKey | string;
    authorityEpoch: bigint | string;
}
declare function encodeUpdateBaseUnitMints(args: UpdateBaseUnitMintsArgs): Uint8Array;
/**
 * SwapSecondaryForPrimary (tag 61) — swap secondary base-unit atoms for
 * primary (v18 wire, integration `a9318945`).
 *
 * Wire: tag(1) + amount(u128) + authority_epoch(u64) = 25 bytes.
 *
 * BREAKING vs v17 (17-byte payload): appends `authority_epoch` — a CAS
 * check. Pass the LIVE current epoch, NOT current+1.
 *
 * @param amount          Secondary atoms to swap (u128).
 * @param authorityEpoch  Live-read current authority_epoch (CAS, expected-current).
 */
interface SwapSecondaryForPrimaryArgs {
    amount: bigint | string;
    authorityEpoch: bigint | string;
}
declare function encodeSwapSecondaryForPrimary(args: SwapSecondaryForPrimaryArgs): Uint8Array;
/**
 * Parsed vAMM matcher parameters (from on-chain matcher context account)
 */
interface VammMatcherParams {
    mode: number;
    tradingFeeBps: number;
    baseSpreadBps: number;
    maxTotalBps: number;
    impactKBps: number;
    liquidityNotionalE6: bigint;
}
/** Magic bytes identifying a vAMM matcher context: "PERCMATC" as u64 LE = 0x504552434d415443 */
declare const VAMM_MAGIC = 5784119745439683651n;
/** Alias matching the Rust constant name for parity tests */
declare const MATCHER_MAGIC = 5784119745439683651n;
/** Offset where matcher return is written in the context account (always 0 per ABI) */
declare const CTX_RETURN_OFFSET = 0;
/** Byte length of the MatcherReturn section of the context account */
declare const MATCHER_RETURN_LEN = 64;
/** Offset into matcher context where vAMM params start (= MATCHER_RETURN_LEN) */
declare const CTX_VAMM_OFFSET = 64;
/** Byte length of the MatcherCtx (vAMM state) section of the context account */
declare const CTX_VAMM_LEN = 256;
/** Total matcher context account size: MATCHER_RETURN_LEN + CTX_VAMM_LEN */
declare const MATCHER_CONTEXT_LEN = 320;
/** `matcher_abi::FLAG_VALID` — bit0 of `MatcherReturn.flags`. */
declare const MATCHER_RETURN_FLAG_VALID = 1;
/** `matcher_abi::FLAG_PARTIAL_OK` — bit1 of `MatcherReturn.flags`. */
declare const MATCHER_RETURN_FLAG_PARTIAL_OK = 2;
/** `matcher_abi::FLAG_REJECTED` — bit2 of `MatcherReturn.flags`. */
declare const MATCHER_RETURN_FLAG_REJECTED = 4;
/**
 * `matcher_abi::FLAG_BACKING_FEE_CAP_SHIFT` (sync/w2-e24cf78e, ADOPT upstream
 * e24cf78e "require matcher consent for CPI backing fees"). Bits 8..21 of
 * `flags` carry the LP matcher's self-declared cap (bps, 0..=10000) on how
 * much backing-domain fee it consents to being charged on its own
 * (account_b) side of a CPI-filled trade. An unupgraded matcher (one that
 * never sets these bits) reads back cap=0, which fails closed — the wrapper
 * REJECTS any CPI trade that would actually charge a nonzero backing-domain
 * fee against the LP until the matcher program is updated to emit a real cap.
 */
declare const MATCHER_RETURN_FLAG_BACKING_FEE_CAP_SHIFT = 8;
/** `matcher_abi::FLAG_BACKING_FEE_CAP_MASK` = `0x3fff << 8`. */
declare const MATCHER_RETURN_FLAG_BACKING_FEE_CAP_MASK: number;
/**
 * Every flag bit the wrapper's `read_matcher_return` gate recognizes. ANY
 * bit outside this mask set anywhere in `flags` makes the wrapper reject the
 * whole CPI trade — matches the wrapper's own
 * `KNOWN_FLAGS = FLAG_VALID | FLAG_PARTIAL_OK | FLAG_REJECTED | FLAG_BACKING_FEE_CAP_MASK`
 * check exactly, and {@link decodeMatcherReturn} enforces the identical gate
 * client-side.
 */
declare const MATCHER_RETURN_KNOWN_FLAGS: number;
/**
 * Decoded 64-byte `MatcherReturn` — the CPI response wire, byte-identical to
 * `percolator-prog::matcher_abi::MatcherReturn`:
 *   abi_version:u32@0, flags:u32@4, exec_price_e6:u64@8, exec_size:i128@16,
 *   req_id:u64@32, lp_account_id:u64@40, oracle_price_e6:u64@48, asset_index:u64@56.
 */
interface MatcherReturn {
    abiVersion: number;
    flags: number;
    execPriceE6: bigint;
    execSize: bigint;
    reqId: bigint;
    lpAccountId: bigint;
    oraclePriceE6: bigint;
    assetIndex: bigint;
    /** Decoded from `flags` bit0 (`FLAG_VALID`). */
    valid: boolean;
    /** Decoded from `flags` bit1 (`FLAG_PARTIAL_OK`). */
    partialOk: boolean;
    /** Decoded from `flags` bit2 (`FLAG_REJECTED`). */
    rejected: boolean;
    /**
     * Decoded from `flags` bits 8..21 (`FLAG_BACKING_FEE_CAP_MASK`), 0..=10000.
     * 0 fails closed against any nonzero backing-domain fee — see
     * {@link MATCHER_RETURN_FLAG_BACKING_FEE_CAP_SHIFT}'s doc comment.
     */
    backingFeeCapBps: number;
}
/**
 * Decode a 64-byte `MatcherReturn` from a matcher context account's raw
 * bytes, mirroring `percolator-prog::matcher_abi::read_matcher_return`
 * EXACTLY, including its `KNOWN_FLAGS` gate.
 *
 * @param data    Raw matcher context account bytes.
 * @param offset  Byte offset where the MatcherReturn starts (default
 *                {@link CTX_RETURN_OFFSET} = 0, per ABI).
 * @throws If `data` is too short, or `flags` has any bit set outside
 *   {@link MATCHER_RETURN_KNOWN_FLAGS} (matches the wrapper's own
 *   fail-closed gate — the wrapper would reject the CPI trade the same way).
 */
declare function decodeMatcherReturn(data: Uint8Array, offset?: number): MatcherReturn;
/**
 * Encode a `MatcherReturn` to its 64-byte wire form — the inverse of
 * {@link decodeMatcherReturn}. Useful for a TypeScript-side reference/test
 * matcher writing its own CPI response.
 *
 * Composes `flags` from the individual boolean/bps fields rather than taking
 * a raw `flags` number, so a caller cannot accidentally set an unknown bit —
 * the wire is always exactly `MATCHER_RETURN_KNOWN_FLAGS`-clean by
 * construction.
 *
 * @param args  Same shape as {@link MatcherReturn} minus the derived `flags` field.
 */
declare function encodeMatcherReturn(args: {
    abiVersion: number;
    execPriceE6: bigint | string;
    execSize: bigint | string;
    reqId: bigint | string;
    lpAccountId: bigint | string;
    oraclePriceE6: bigint | string;
    assetIndex: bigint | string;
    valid: boolean;
    partialOk: boolean;
    rejected: boolean;
    backingFeeCapBps: number;
}): Uint8Array;
/** Byte length of a MatcherCall instruction (tag 0 CPI payload) */
declare const MATCHER_CALL_LEN = 67;
/**
 * Byte length of an InitMatcherCtx instruction payload sent to the matcher program.
 * Layout: tag(1) + kind(1) + trading_fee_bps(4) + base_spread_bps(4) +
 *   max_total_bps(4) + impact_k_bps(4) + liquidity_notional_e6(16) +
 *   max_fill_abs(16) + max_inventory_abs(16) + fee_to_insurance_bps(2) +
 *   skew_spread_mult_bps(2) + lp_account_id(8) = 78
 */
declare const INIT_CTX_LEN = 78;
/**
 * Compute execution price for a given LP quote.
 * For buys (isLong=true): price above oracle.
 * For sells (isLong=false): price below oracle.
 */
declare function computeVammQuote(params: VammMatcherParams, oraclePriceE6: bigint, tradeSize: bigint, isLong: boolean): bigint;
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
declare function encodeAdvanceOraclePhase(): Uint8Array;
/** Oracle phase constants matching on-chain values */
declare const ORACLE_PHASE_NASCENT = 0;
declare const ORACLE_PHASE_GROWING = 1;
declare const ORACLE_PHASE_MATURE = 2;
/** Phase transition thresholds (must match program constants) */
declare const PHASE1_MIN_SLOTS = 648000n;
declare const PHASE1_VOLUME_MIN_SLOTS = 36000n;
declare const PHASE2_VOLUME_THRESHOLD = 100000000000n;
declare const PHASE2_MATURITY_SLOTS = 3024000n;
/**
 * Check if an oracle phase transition is due (TypeScript mirror of on-chain logic).
 *
 * @returns [newPhase, shouldTransition]
 */
declare function checkPhaseTransition(currentSlot: bigint, marketCreatedSlot: bigint, oraclePhase: number, cumulativeVolumeE6: bigint, phase2DeltaSlots: number, hasMatureOracle: boolean): [number, boolean];
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
declare function encodeSlashCreationDeposit(): Uint8Array;
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
interface InitSharedVaultArgs {
    epochDurationSlots: bigint | string;
    maxMarketExposureBps: number;
}
/** @deprecated v12.x InitSharedVault (old tag 94). Not in v17. */
declare function encodeInitSharedVault(_args: InitSharedVaultArgs): Uint8Array;
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
interface AllocateMarketArgs {
    amount: bigint | string;
}
/** @deprecated v12.x AllocateMarket (old tag 95). Not in v17. */
declare function encodeAllocateMarket(_args: AllocateMarketArgs): Uint8Array;
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
interface QueueWithdrawalSVArgs {
    lpAmount: bigint | string;
}
/** @deprecated v12.x QueueWithdrawalSV (old tag 96). Not in v17. */
declare function encodeQueueWithdrawalSV(_args: QueueWithdrawalSVArgs): Uint8Array;
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
declare function encodeClaimEpochWithdrawal(): Uint8Array;
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
declare function encodeAdvanceEpoch(): Uint8Array;
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
declare function encodeSetOiImbalanceHardBlock(_args: {
    thresholdBps: number;
}): Uint8Array;
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
interface MintPositionNftArgs {
    userIdx: number;
}
/**
 * @deprecated v12.x MintPositionNft (old tag 64). v17 reuses tag 64 for ForceCloseAbandonedAsset.
 * NFT operations in v17 use the standalone percolator-nft program; use SetNftProgramId(73)
 * to register it and TransferPortfolioOwnership(72) for B-3 transfers.
 */
declare function encodeMintPositionNft(_args: MintPositionNftArgs): Uint8Array;
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
interface TransferPositionOwnershipArgs {
    userIdx: number;
}
/**
 * @deprecated v12.x TransferPositionOwnership (old tag 65). v17 reuses tag 65 for UpdateAssetAuthority.
 * Use encodeTransferPortfolioOwnership() (tag 72) for B-3 ownership transfer in v17.
 */
declare function encodeTransferPositionOwnership(_args: TransferPositionOwnershipArgs): Uint8Array;
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
interface BurnPositionNftArgs {
    userIdx: number;
}
/**
 * @deprecated v12.x BurnPositionNft (old tag 66). v17 reuses tag 66 for BatchTradeNoCpi.
 * NFT burn is handled by the standalone percolator-nft program in v17.
 */
declare function encodeBurnPositionNft(_args: BurnPositionNftArgs): Uint8Array;
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
interface SetPendingSettlementArgs {
    userIdx: number;
}
/**
 * @deprecated v12.x SetPendingSettlement (old tag 67). v17 reuses tag 67 for BatchTradeCpi.
 */
declare function encodeSetPendingSettlement(_args: SetPendingSettlementArgs): Uint8Array;
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
interface ClearPendingSettlementArgs {
    userIdx: number;
}
/**
 * @deprecated v12.x ClearPendingSettlement (old tag 68). v17 reuses tag 68 for SetMatcherConfig.
 */
declare function encodeClearPendingSettlement(_args: ClearPendingSettlementArgs): Uint8Array;
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
interface TransferOwnershipCpiArgs {
    userIdx: number;
    newOwner: PublicKey | string;
}
/**
 * @deprecated v12.x TransferOwnershipCpi (old tag 69). v17 reuses tag 69 for RestartAssetOracle.
 */
declare function encodeTransferOwnershipCpi(_args: TransferOwnershipCpiArgs): Uint8Array;
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
interface SetWalletCapArgs {
    /** Max position size in e6 units. 0 = disabled. $1 = 1_000_000n, $1K = 1_000_000_000n. */
    capE6: bigint | string;
}
/** @deprecated v12.x SetWalletCap (old tag 70). Not in v17. */
declare function encodeSetWalletCap(_args: SetWalletCapArgs): Uint8Array;
/**
 * InitMatcherCtx (tag 83) — LP owner bootstraps the matcher context account by invoking
 * the wrapper, which CPIs to the matcher program signing as the matcher_delegate PDA.
 *
 * v17 wire: tag(1=83) + kind(u8) + trading_fee_bps(u32 LE) + base_spread_bps(u32 LE) +
 *   max_total_bps(u32 LE) + impact_k_bps(u32 LE) + liquidity_notional_e6(u128 LE) +
 *   max_fill_abs(u128 LE) + max_inventory_abs(u128 LE) + fee_to_insurance_bps(u16 LE) +
 *   skew_spread_mult_bps(u16 LE) = 70 bytes total.
 *
 * PREREQUISITE: SetMatcherConfig (tag 68, enabled=1) must be called FIRST. The wrapper's
 * handler reads the LP portfolio's stored matcher config and verifies that:
 *   cfg.matcher_program == matcherProg
 *   cfg.matcher_context == matcherCtx
 *   cfg.matcher_delegate == matcherDelegate (derived via deriveMatcherDelegate())
 *
 * The wrapper calls derive_matcher_delegate and invoke_signed so the delegate PDA acts
 * as a signer in the matcher CPI — this is what satisfies the matcher's lp_pda.is_signer
 * check on the deployed binary. No client-side signer of the delegate is needed.
 *
 * Accounts (per handle_init_matcher_ctx in deployed wrapper, tag 83):
 *   [0] lp_owner        signer (LP portfolio owner)
 *   [1] market          read-only (program-owned market slab)
 *   [2] lp_portfolio    read-only (LP's portfolio; must have provenance matching market + owner)
 *   [3] matcher_ctx     writable (320-byte account owned by matcher program)
 *   [4] matcher_prog    read-only, executable (the matcher program)
 *   [5] matcher_delegate read-only (PDA derived by deriveMatcherDelegate; wrapper signs for it)
 *
 * @param args.kind              0=Passive, 1=vAMM
 * @param args.tradingFeeBps     Base trading fee in bps (u32, e.g. 30)
 * @param args.baseSpreadBps     Base spread in bps (u32)
 * @param args.maxTotalBps       Max total spread in bps (u32)
 * @param args.impactKBps        vAMM price impact constant in bps (u32; 0 for Passive)
 * @param args.liquidityNotionalE6 Liquidity notional in e6 units (u128; 0 for Passive)
 * @param args.maxFillAbs        Max single fill in absolute units (u128; use i128::MAX for unlimited)
 * @param args.maxInventoryAbs   Max inventory in absolute units (u128; use i128::MAX for unlimited)
 * @param args.feeToInsuranceBps Fraction of fees to insurance in bps (u16)
 * @param args.skewSpreadMultBps Skew spread multiplier in bps (u16; 0=disabled)
 *
 * Confirmed live on the deployed wrapper (percolator-prog@e26c97a4) at tag 83 by
 * forensic rebuild + live simulateTransaction (see ~/v17/DECISIONS-LEDGER.md,
 * "Pinned deployed revisions", 2026-07-15). The v17 protocol-fee instructions
 * were renumbered (WithdrawProtocolFee=84, SetProtocolFeeAuthority=85) to keep
 * this tag free.
 *
 * @example
 * ```ts
 * const data = encodeInitMatcherCtx({
 *   kind: 0,  // Passive
 *   tradingFeeBps: 30,
 *   baseSpreadBps: 50,
 *   maxTotalBps: 200,
 *   impactKBps: 0,
 *   liquidityNotionalE6: 0n,
 *   maxFillAbs: 170141183460469231731687303715884105727n,  // i128::MAX
 *   maxInventoryAbs: 170141183460469231731687303715884105727n,
 *   feeToInsuranceBps: 0,
 *   skewSpreadMultBps: 0,
 * });
 * ```
 */
interface InitMatcherCtxArgs {
    /**
     * @deprecated lpIdx is not present in the v17 wire format. The wrapper derives the LP
     * info from the lp_portfolio account (accounts[2]). This field is ignored if provided.
     */
    lpIdx?: number;
    /** Matcher kind: 0=Passive, 1=vAMM. */
    kind: number;
    /** Base trading fee in bps (u32, e.g. 30 = 0.30%). */
    tradingFeeBps: number;
    /** Base spread in bps (u32). */
    baseSpreadBps: number;
    /** Max total spread in bps (u32). */
    maxTotalBps: number;
    /** vAMM price impact constant in bps (u32). Use 0 for Passive kind. */
    impactKBps: number;
    /** Liquidity notional in e6 units (u128). Use 0n for Passive kind. */
    liquidityNotionalE6: bigint | string;
    /** Max single fill size in absolute units (u128). Use 170141183460469231731687303715884105727n for no limit (i128::MAX). */
    maxFillAbs: bigint | string;
    /** Max inventory size in absolute units (u128). Use 170141183460469231731687303715884105727n for no limit. */
    maxInventoryAbs: bigint | string;
    /** Fraction of fees routed to insurance fund in bps (u16). */
    feeToInsuranceBps: number;
    /** Skew spread multiplier in bps (u16). 0 = disabled. */
    skewSpreadMultBps: number;
}
/** Wire length of InitMatcherCtx instruction payload (tag + 10 fields). */
declare const INIT_MATCHER_CTX_V17_LEN = 70;
/**
 * Encode InitMatcherCtx instruction data (v17 wire format, tag 83).
 *
 * Sends to the WRAPPER program (not the matcher directly). The wrapper CPIs the matcher
 * via invoke_signed, making the delegate PDA a signer in the matcher's process_init call.
 *
 * @param args InitMatcherCtxArgs (lpIdx field ignored in v17)
 * @returns 70-byte Uint8Array
 */
declare function encodeInitMatcherCtx(args: InitMatcherCtxArgs): Uint8Array;
/**
 * @deprecated v12.x SetInsuranceWithdrawPolicy (old tag 22). Not in v17.
 */
interface SetInsuranceWithdrawPolicyArgs {
    authority: PublicKey | string;
    minWithdrawBase: bigint | string;
    maxWithdrawBps: number;
    cooldownSlots: bigint | string;
}
declare function encodeSetInsuranceWithdrawPolicy(_args: SetInsuranceWithdrawPolicyArgs): Uint8Array;
/**
 * @deprecated v12.x WithdrawInsuranceLimited (old tag 23). v17 uses tag 23 for WithdrawInsuranceLimited (same tag, different meaning — verify wire before using).
 */
declare function encodeWithdrawInsuranceLimited(_args: {
    amount: bigint | string;
}): Uint8Array;
/**
 * @deprecated v12.x ResolvePermissionless (old tag 29). v17 uses tag 39 for ResolveStalePermissionless.
 */
declare function encodeResolvePermissionless(): Uint8Array;
/**
 * @deprecated v12.x ForceCloseResolved (old tag 30) is NOT CloseResolved in v17.
 * v17 reuses tag 30 for CloseResolved with a completely different wire format.
 * This function throws at runtime to prevent silent on-chain mismatch.
 */
declare function encodeForceCloseResolved(_args: {
    userIdx: number;
}): Uint8Array;
/**
 * @deprecated v12.x CreateLpVault wire format. Use encodeCreateLpVaultV17() for v17.
 * This is kept for source-compat only — the v12 wire format will be rejected by v17.
 */
declare function encodeCreateLpVault(args: {
    feeShareBps: bigint | string;
    utilCurveEnabled?: boolean;
}): Uint8Array;
/**
 * @deprecated v12.x LpVaultDeposit wire format. Use encodeDepositToLpVault() for v17.
 * This is kept for source-compat only — the v12 wire format will be rejected by v17.
 */
declare function encodeLpVaultDeposit(_args: {
    amount: bigint | string;
}): Uint8Array;
/**
 * @deprecated v12.x ChallengeSettlement. v17 reuses tag 43 for ForfeitRecoveryLeg.
 */
declare function encodeChallengeSettlement(_args: {
    proposedPriceE6: bigint | string;
}): Uint8Array;
/** @deprecated v12.x ResolveDispute. v17 reuses tag 44 for RebalanceReduce. */
declare function encodeResolveDispute(_args: {
    accept: number;
}): Uint8Array;
/** @deprecated v12.x DepositLpCollateral. v17 reuses tag 45 for FinalizeResetSide. */
declare function encodeDepositLpCollateral(_args: {
    userIdx: number;
    lpAmount: bigint | string;
}): Uint8Array;
/** @deprecated v12.x WithdrawLpCollateral. v17 reuses tag 46 for ClaimResolvedPayoutTopup. */
declare function encodeWithdrawLpCollateral(_args: {
    userIdx: number;
    lpAmount: bigint | string;
}): Uint8Array;
/** @deprecated v12.x SetOffsetPair. v17 reuses tag 54 for SyncInsuranceLedger. */
declare function encodeSetOffsetPair(_args: {
    offsetBps: number;
}): Uint8Array;
/** @deprecated v12.x AttestCrossMargin. v17 reuses tag 55 for UpdateTradeFeePolicy. */
declare function encodeAttestCrossMargin(_args: {
    userIdxA: number;
    userIdxB: number;
}): Uint8Array;
/** @deprecated v12.x RescueOrphanVault. v17 reuses tag 72 for TransferPortfolioOwnership. */
declare function encodeRescueOrphanVault(): Uint8Array;
/** @deprecated v12.x CloseOrphanSlab. v17 reuses tag 73 for SetNftProgramId. */
declare function encodeCloseOrphanSlab(): Uint8Array;
/** @deprecated v12.x SetDexPool. v17 reuses tag 74 for CreateLpVault. */
declare function encodeSetDexPool(_args: {
    pool: PublicKey | string;
}): Uint8Array;
/** @deprecated v12.x Insurance LP alias — removed in v17. */
declare function encodeCreateInsuranceMint(): Uint8Array;
/** @deprecated v12.x Insurance LP alias — removed in v17. */
declare function encodeDepositInsuranceLP(_args: {
    amount: bigint | string;
}): Uint8Array;
/** @deprecated v12.x Insurance LP alias — removed in v17. */
declare function encodeWithdrawInsuranceLP(_args: {
    lpAmount: bigint | string;
}): Uint8Array;
/**
 * @deprecated v12.x SetMaxPnlCap (old tag 78). v17 reuses tag 78 for LpVaultCrankFees.
 * This function throws at runtime to prevent silent on-chain mismatch.
 */
interface SetMaxPnlCapArgs {
    cap: bigint | string;
}
declare function encodeSetMaxPnlCap(_args: SetMaxPnlCapArgs): Uint8Array;
/**
 * @deprecated v12.x SetOiCapMultiplier (old tag 79). v17 reuses tag 79 for SetLpVaultPaused.
 */
interface SetOiCapMultiplierArgs {
    packed: bigint | string;
}
declare function encodeSetOiCapMultiplier(_args: SetOiCapMultiplierArgs): Uint8Array;
/** @deprecated v12.x helper — kept for legacy callers that use packOiCap(). */
declare function packOiCap(multiplierBps: number, softCapBps: number): bigint;
/**
 * @deprecated v12.x SetDisputeParams (old tag 80). v17 reuses tag 80 for CloseLpVault.
 */
interface SetDisputeParamsArgs {
    windowSlots: bigint | string;
    bondAmount: bigint | string;
}
declare function encodeSetDisputeParams(_args: SetDisputeParamsArgs): Uint8Array;
/**
 * @deprecated v12.x SetLpCollateralParams (old tag 81). Not in v17.
 */
interface SetLpCollateralParamsArgs {
    enabled: number;
    ltvBps: number;
}
declare function encodeSetLpCollateralParams(_args: SetLpCollateralParamsArgs): Uint8Array;
/**
 * @deprecated v12.x AcceptAdmin (old tag 82). v17 uses UpdateAuthority(32) for admin rotation.
 */
declare function encodeAcceptAdmin(): Uint8Array;
/**
 * @deprecated v12.x ReclaimEmptyAccount (old tag 85). Not in v17.
 */
interface ReclaimEmptyAccountArgs {
    userIdx: number;
}
declare function encodeReclaimEmptyAccount(_args: ReclaimEmptyAccountArgs): Uint8Array;
/**
 * @deprecated v12.x SettleAccount (old tag 86). Not in v17.
 */
interface SettleAccountArgs {
    userIdx: number;
}
declare function encodeSettleAccount(_args: SettleAccountArgs): Uint8Array;
/**
 * @deprecated v12.x DepositFeeCredits (old tag 27). Not in v17.
 */
interface DepositFeeCreditsArgs {
    userIdx: number;
    amount: bigint | string;
}
declare function encodeDepositFeeCredits(_args: DepositFeeCreditsArgs): Uint8Array;
/**
 * ConvertReleasedPnl (tag 28) — voluntary PnL conversion with open position.
 * Owner only.
 *
 * v18 wire (integration `a9318945`): tag(1) + portfolio_id(u64) +
 *   position_epoch(u64) + amount(u128 LE) = 33 bytes.
 *
 * BREAKING vs v17 (17-byte payload): the v16-migration identity-binding
 * overhaul CAS-binds this to the portfolio's identity and current position
 * epoch (both read live, immediately before signing).
 *
 * Accounts: see ACCOUNTS_CONVERT_RELEASED_PNL.
 *
 * @param portfolioId    The portfolio's program-assigned identity.
 * @param positionEpoch  The portfolio's current position epoch, read live.
 * @param amount         Amount of released PnL to convert (u128).
 *
 * @example
 * ```ts
 * const data = encodeConvertReleasedPnl({
 *   portfolioId: portfolio.portfolioId,
 *   positionEpoch: portfolio.legs[0].epochSnap,
 *   amount: 1_000_000n,
 * });
 * ```
 */
interface ConvertReleasedPnlArgs {
    /** @deprecated userIdx is not needed in v17+ — portfolios are identified by account key. */
    userIdx?: number;
    portfolioId: bigint | string;
    positionEpoch: bigint | string;
    amount: bigint | string;
}
declare function encodeConvertReleasedPnl(args: ConvertReleasedPnlArgs): Uint8Array;
/**
 * UpdateAuthority (tag 32) — rotate the single market-level authority (marketauth).
 *
 * v18 wire (integration `a9318945`): tag(1) + new_pubkey[32] + authority_epoch(u64)
 *   = 41 bytes.
 *
 * BREAKING vs v17 (33-byte payload): the v16-migration identity-binding
 * overhaul appends `authority_epoch` — a CAS check (strict `current ==
 * expected`, auto-incremented by the program). Pass the LIVE current epoch,
 * NOT current+1 — this closes the durable-nonce replay window where a
 * signed rotation intent, if never submitted, would otherwise remain valid
 * across later legitimate rotations.
 *
 * Accounts: [currentAuth(signer), newAuth(signer), slab(writable)]
 *
 * @param newPubkey       New marketauth pubkey. Burning to zero is rejected on-chain.
 * @param authorityEpoch  Live-read current authority_epoch (CAS, expected-current).
 *
 * @example
 * ```ts
 * const data = encodeUpdateAuthority({ newPubkey: newAdminKey, authorityEpoch: 0n });
 * ```
 */
interface UpdateAuthorityArgs {
    newPubkey: PublicKey | string;
    authorityEpoch: bigint | string;
}
declare function encodeUpdateAuthority(args: UpdateAuthorityArgs): Uint8Array;
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
declare const ASSET_AUTH_KIND: {
    /** ASSET_AUTH_ADMIN = 0 in v16_program.rs:5246 — routes to asset_admin field */
    readonly AssetAdmin: 0;
    /** ASSET_AUTH_INSURANCE = 1 in v16_program.rs:5247 — routes to insurance_authority field */
    readonly Insurance: 1;
    /** ASSET_AUTH_INSURANCE_OPERATOR = 2 in v16_program.rs:5248 — routes to insurance_operator field */
    readonly InsuranceOperator: 2;
    /** ASSET_AUTH_BACKING_BUCKET = 3 in v16_program.rs:5249 — routes to backing_bucket_authority field */
    readonly BackingBucket: 3;
    /** ASSET_AUTH_ORACLE = 4 in v16_program.rs:5250 — routes to oracle_authority field */
    readonly Oracle: 4;
};
type AssetAuthKind = (typeof ASSET_AUTH_KIND)[keyof typeof ASSET_AUTH_KIND];
/**
 * UpdateAssetAuthority (tag 65) — rotate a per-asset authority (v18 wire,
 * integration `a9318945`; LOCKED WIRE per WRAPPER_SYNC_LOCKED_WIRE.md).
 *
 * Wire: tag(1) + asset_index(u16)@1 + market_id(u64)@3 + kind(u8)@11 +
 *   new_pubkey[32]@12 + authority_epoch(u64)@44 = 52 bytes.
 *
 * BREAKING vs v17 (36-byte payload): adds `market_id` (right after
 * `asset_index`, TB-4's market-id-bearing cluster) and appends
 * `authority_epoch` — a CAS check against this asset's OWN
 * `AssetControlSequencesV16.authority_epoch` lane. Pass the LIVE current
 * epoch, NOT current+1 (durable-nonce landmine if wrong — see the lane's own
 * doc comment in the wrapper source).
 *
 * Gated by the asset's own asset_admin (can rotate any) or by the current
 * holder of that authority (self-rotation). Isolated to the given asset_index.
 *
 * @param assetIndex Asset index (0 = primary, 1+ = additional assets).
 * @param marketId   The asset's market_id.
 * @param kind       ASSET_AUTH_KIND.* constant.
 * @param newPubkey  New authority pubkey. Zero = burn (only AssetAdmin on asset!=0).
 * @param authorityEpoch  Live-read current authority_epoch for this asset (CAS, expected-current).
 *
 * @example
 * ```ts
 * // Rotate insurance authority for asset 0
 * // ASSET_AUTH_KIND.Insurance = 1 (routes to insurance_authority slot on-chain)
 * const data = encodeUpdateAssetAuthority({
 *   assetIndex: 0,
 *   marketId: 1n,
 *   kind: ASSET_AUTH_KIND.Insurance,
 *   newPubkey: newInsuranceKey,
 *   authorityEpoch: 0n,
 * });
 * ```
 */
interface UpdateAssetAuthorityArgs {
    assetIndex: number;
    marketId: bigint | string;
    kind: AssetAuthKind;
    newPubkey: PublicKey | string;
    authorityEpoch: bigint | string;
}
declare function encodeUpdateAssetAuthority(args: UpdateAssetAuthorityArgs): Uint8Array;
/**
 * One leg of a BatchTradeNoCpi instruction.
 */
interface BatchTradeNoCpiLeg {
    assetIndex: number;
    marketId: bigint | string;
    sizeQ: bigint | string;
    execPrice: bigint | string;
    feeBps: bigint | string;
}
/**
 * BatchTradeNoCpi (tag 66) — multi-leg NoCpi batch trade (v18 wire,
 * integration `a9318945`).
 *
 * Wire: tag(1) + n_legs(u8) + [asset_index(u16) + market_id(u64) + size_q(i128)
 *   + exec_price(u64) + fee_bps(u64)]×n + account_a_portfolio_id(u64) +
 *   account_a_position_epoch(u64) + account_b_portfolio_id(u64) +
 *   account_b_position_epoch(u64).
 *
 * BREAKING vs v17: each leg gains `market_id` (TB-4's market-id-bearing
 * cluster), and the whole instruction gains the identity-binding trailer
 * (both accounts' portfolio id + position epoch, CAS, AFTER the legs — the
 * wrapper reads legs first, then the two account identities).
 *
 * @param legs Array of up to 255 trade legs.
 * @param accountAPortfolioId    Account A's portfolio identity.
 * @param accountAPositionEpoch  Account A's current position epoch (CAS, live-read).
 * @param accountBPortfolioId    Account B's portfolio identity.
 * @param accountBPositionEpoch  Account B's current position epoch (CAS, live-read).
 *
 * @example
 * ```ts
 * const data = encodeBatchTradeNoCpi({
 *   legs: [
 *     { assetIndex: 0, marketId: 1n, sizeQ: 1_000_000n, execPrice: 50_000_000_000n, feeBps: 30n },
 *     { assetIndex: 1, marketId: 2n, sizeQ: -500_000n,  execPrice: 40_000_000_000n, feeBps: 30n },
 *   ],
 *   accountAPortfolioId: a.portfolioId,
 *   accountAPositionEpoch: a.legs[0].epochSnap,
 *   accountBPortfolioId: b.portfolioId,
 *   accountBPositionEpoch: b.legs[0].epochSnap,
 * });
 * ```
 */
interface BatchTradeNoCpiArgs {
    legs: BatchTradeNoCpiLeg[];
    accountAPortfolioId: bigint | string;
    accountAPositionEpoch: bigint | string;
    accountBPortfolioId: bigint | string;
    accountBPositionEpoch: bigint | string;
}
declare function encodeBatchTradeNoCpi(args: BatchTradeNoCpiArgs): Uint8Array;
/**
 * BatchTradeCpi (tag 67) — multi-leg CPI batch trade (v18 wire, integration
 * `a9318945`).
 *
 * Wire: tag(1) + n_legs(u8) + [asset_index(u16) + market_id(u64) + size_q(i128)
 *   + fee_bps(u64) + limit_price(u64)]×n + max_slippage_atoms(u128) +
 *   max_fee_atoms(u128) + account_a_portfolio_id(u64) +
 *   account_a_position_epoch(u64) + account_b_portfolio_id(u64) +
 *   account_b_position_epoch(u64) + account_b_matcher_sequence(u64).
 *
 * BREAKING vs v17: each leg gains `market_id`; the instruction gains
 * `max_slippage_atoms`/`max_fee_atoms` caps and the full identity-binding
 * trailer (both accounts' portfolio id + position epoch, plus account B's
 * matcher sequence — the CPI-matched side), all AFTER the legs, in that
 * order.
 *
 * @param legs CPI trade legs. The wrapper accepts at most 11 (`MATCHER_BATCH_MAX_LEGS`; 12+
 *   fail InvalidInstruction). CU: measured ~342k CU for a 2-leg batch on the relaunch
 *   wrapper, ~120k per extra leg — request a compute-unit limit accordingly
 *   (e.g. `ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })` for 2 legs).
 *   The client wire is unchanged on P1/P3: the wrapper itself appends the per-leg 24-byte
 *   P1/P2 matcher call extension to the matcher CPI when the asset's `matcher_ext_mode == 1`
 *   (see `encodeMatcherBatchCall` / `encodeWrapperMatcherCallExt`).
 * @param maxSlippageAtoms  Aggregate slippage cap across the whole batch (u128).
 * @param maxFeeAtoms       Aggregate fee cap across the whole batch (u128).
 * @param accountAPortfolioId       Account A's portfolio identity.
 * @param accountAPositionEpoch     Account A's current position epoch (CAS, live-read).
 * @param accountBPortfolioId       Account B's portfolio identity.
 * @param accountBPositionEpoch     Account B's current position epoch (CAS, live-read).
 * @param accountBMatcherSequence   Account B's current matcher-sequence watermark (CAS, live-read).
 *
 * @example
 * ```ts
 * const data = encodeBatchTradeCpi({
 *   legs: [{ assetIndex: 0, marketId: 1n, sizeQ: 1_000_000n, feeBps: 30n, limitPrice: 51_000_000_000n }],
 *   maxSlippageAtoms: 0n,
 *   maxFeeAtoms: 0n,
 *   accountAPortfolioId: a.portfolioId,
 *   accountAPositionEpoch: a.legs[0].epochSnap,
 *   accountBPortfolioId: b.portfolioId,
 *   accountBPositionEpoch: b.legs[0].epochSnap,
 *   accountBMatcherSequence: b.matcherSequence,
 * });
 * ```
 */
interface BatchTradeCpiLeg {
    assetIndex: number;
    marketId: bigint | string;
    sizeQ: bigint | string;
    feeBps: bigint | string;
    limitPrice: bigint | string;
}
interface BatchTradeCpiArgs {
    legs: BatchTradeCpiLeg[];
    maxSlippageAtoms: bigint | string;
    maxFeeAtoms: bigint | string;
    accountAPortfolioId: bigint | string;
    accountAPositionEpoch: bigint | string;
    accountBPortfolioId: bigint | string;
    accountBPositionEpoch: bigint | string;
    accountBMatcherSequence: bigint | string;
}
declare function encodeBatchTradeCpi(args: BatchTradeCpiArgs): Uint8Array;
/**
 * SetMatcherConfig (tag 68) — enable or disable the external matcher for
 * this portfolio, and (v18) set its position-epoch frontier, trade-fee cap
 * and expiry (v18 wire, integration `a9318945`).
 *
 * Wire: tag(1) + portfolio_id(u64) + expected_sequence(u64) +
 *   asset_generation_frontier(u64) + enabled(u8) + trade_fee_cap_bps(u16) +
 *   expiry_slot(u64) = 36 bytes.
 *
 * BREAKING vs v17 (2-byte payload): this is the tag TB-1a's account-side
 * `PortfolioMatcherConfigV16.control` bit-packing was built for —
 * `trade_fee_cap_bps` here SETS bits 50..63 of that on-chain `control` word
 * (see {@link decodePortfolioMatcherControl}), and `asset_generation_frontier`
 * bumps the account's stored position-epoch frontier. `portfolio_id`/
 * `expected_sequence` are the same identity/matcher-sequence CAS binding as
 * every other TB-1b-bound tag — read live, immediately before signing.
 *
 * @param portfolioId              The portfolio's program-assigned identity.
 * @param expectedSequence         The portfolio's current matcher-sequence watermark, read live.
 * @param assetGenerationFrontier  Live-read current asset-set generation frontier.
 * @param enabled          1 = enabled, 0 = disabled.
 * @param tradeFeeCapBps   LP's maximum accepted market base fee, in bps (0..=10000).
 * @param expirySlot       Slot at which this matcher grant stops being live (0 = disabled/never granted).
 *
 * @example
 * ```ts
 * const data = encodeSetMatcherConfig({
 *   portfolioId: portfolio.portfolioId,
 *   expectedSequence: portfolio.matcherSequence,
 *   assetGenerationFrontier: cfg.assetSetEpoch,
 *   enabled: 1,
 *   tradeFeeCapBps: 100,
 *   expirySlot: currentSlot + 216_000n,
 * });
 * ```
 */
interface SetMatcherConfigArgs {
    portfolioId: bigint | string;
    expectedSequence: bigint | string;
    assetGenerationFrontier: bigint | string;
    enabled: number;
    tradeFeeCapBps: number;
    expirySlot: bigint | string;
}
declare function encodeSetMatcherConfig(args: SetMatcherConfigArgs): Uint8Array;
/**
 * RestartAssetOracle (tag 69) — permissionless oracle restart (v18 wire,
 * integration `a9318945`).
 *
 * Wire: tag(1) + asset_index(u16) + market_id(u64) + now_slot(u64) +
 *   initial_price(u64) + observation_sequence(u64) = 35 bytes.
 *
 * BREAKING vs v17 (20-byte payload): adds `market_id` (right after
 * `asset_index`) and appends `observation_sequence` — a strictly-increasing
 * replay nonce (this asset's `oracle_observation` control-sequences lane).
 *
 * Used to un-stick a stale or hung oracle. Anyone can call this.
 *
 * @param assetIndex    Asset/domain index.
 * @param marketId      The asset's market_id.
 * @param nowSlot       Current slot.
 * @param initialPrice  Initial mark price in e6 units.
 * @param observationSequence  Strictly-increasing replay nonce (this asset's `oracle_observation` lane).
 *
 * @example
 * ```ts
 * const data = encodeRestartAssetOracle({
 *   assetIndex: 0,
 *   marketId: 1n,
 *   nowSlot: currentSlot,
 *   initialPrice: 50_000_000_000n,
 *   observationSequence: nextObservationSequence,
 * });
 * ```
 */
interface RestartAssetOracleArgs {
    assetIndex: number;
    marketId: bigint | string;
    nowSlot: bigint | string;
    initialPrice: bigint | string;
    observationSequence: bigint | string;
}
declare function encodeRestartAssetOracle(args: RestartAssetOracleArgs): Uint8Array;
/**
 * WithdrawInsuranceAsset (tag 57) — withdraw from a specific asset's
 * insurance fund (v18 wire, integration `a9318945`).
 *
 * Wire: tag(1) + asset_index(u16) + market_id(u64) + amount(u128) +
 *   authority_epoch(u64) = 35 bytes.
 *
 * BREAKING vs v17 (19-byte payload): adds `market_id` (right after
 * `asset_index`) and appends `authority_epoch` — a CAS check against this
 * asset's OWN `AssetControlSequencesV16.authority_epoch` lane (W3A-1
 * direct-withdrawal binding, same class as WithdrawBackingBucket/
 * WithdrawBackingBucketEarnings). Pass the LIVE current epoch, not current+1.
 *
 * Requires insurance_authority signature. asset_index is u16 (domain
 * u8→u16 migration in v17).
 *
 * @param assetIndex  Asset/domain index (u16, not u8).
 * @param marketId    The asset's market_id.
 * @param amount      Amount to withdraw (u128).
 * @param authorityEpoch  Live-read current authority_epoch for this asset (CAS, expected-current).
 *
 * @example
 * ```ts
 * const data = encodeWithdrawInsuranceAsset({
 *   assetIndex: 0,
 *   marketId: 1n,
 *   amount: 1_000_000n,
 *   authorityEpoch: 0n,
 * });
 * ```
 */
interface WithdrawInsuranceAssetArgs {
    assetIndex: number;
    marketId: bigint | string;
    amount: bigint | string;
    authorityEpoch: bigint | string;
}
declare function encodeWithdrawInsuranceAsset(args: WithdrawInsuranceAssetArgs): Uint8Array;
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
interface CreateLpVaultArgs {
    feeShareBps: number;
    redemptionCooldownSlots: bigint | string;
    oiReservationThresholdBps: number;
    domain: number;
}
declare function encodeCreateLpVaultV17(args: CreateLpVaultArgs): Uint8Array;
/**
 * DepositToLpVault (tag 75) — deposit collateral into the LP vault.
 *
 * Wire: tag(1) + amount(u128) + domain(u16) = 19 bytes.
 *
 * `domain` selects which pot of the vault's asset receives the backing and MUST
 * satisfy `domain >> 1 === registry.domain >> 1`. Shares are priced off COMBINED
 * NAV across both pots, so the depositor is indifferent to the choice; routing
 * exists so new money can reach whichever pot the house is drawing on.
 *
 * ACCOUNTS (v17 dual-domain): index 10 is the SIBLING-domain backing ledger
 * (`deriveLpBackingLedger(programId, market, domain ^ 1)`). It is required even
 * when uninitialised — NAV spans both pots, and omitting it would understate NAV
 * and mint the depositor free shares at existing holders' expense.
 *
 * @example
 * ```ts
 * const data = encodeDepositToLpVault({ amount: 1_000_000n, domain: 2 });
 * ```
 */
declare function encodeDepositToLpVault(args: {
    amount: bigint | string;
    domain: number;
}): Uint8Array;
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
declare function encodeRequestRedeemLpShares(args: {
    shares: bigint | string;
}): Uint8Array;
/**
 * ExecuteRedemption (tag 77) — execute a pending LP redemption.
 *
 * Wire: tag(1) + domain(u16) = 3 bytes.
 *
 * `domain` selects which pot the payout is physically DRAWN from. NAV and
 * available-principal stay COMBINED across both pots, so this does not change
 * what the redeemer is owed — only where the atoms come from. A redemption draws
 * from ONE pot and fails closed (EngineCounterUnderflow) if that pot cannot
 * cover it; rebalance (tag 91) first.
 *
 * ACCOUNTS (v17 dual-domain): index 11 is the SIBLING-domain backing ledger.
 *
 * @example
 * ```ts
 * const data = encodeExecuteRedemption({ domain: 2 });
 * ```
 */
declare function encodeExecuteRedemption(args: {
    domain: number;
}): Uint8Array;
/**
 * LpVaultCrankFees (tag 78) — crank fee accrual for the LP vault.
 *
 * Wire: tag(1) + domain(u16) = 3 bytes.
 *
 * `domain` selects which pot receives the cranked fees. Mints no shares, so the
 * choice cannot dilute; routing exists so fees can become backing in the pot
 * that needs it. The target ledger is created on first use.
 *
 * ACCOUNTS (v17 dual-domain): index 4 is the SIBLING-domain backing ledger and
 * index 5 is the system program (needed to create a missing target ledger).
 *
 * @example
 * ```ts
 * const data = encodeLpVaultCrankFees({ domain: 2 });
 * ```
 */
declare function encodeLpVaultCrankFees(args: {
    domain: number;
}): Uint8Array;
/**
 * RebalanceLpVaultBacking (tag 91) — move IDLE backing between the two pots of
 * the LP vault's asset.
 *
 * Wire: tag(1) + fromDomain(u16) + toDomain(u16) + amount(u128) = 21 bytes.
 *
 * Permissionless: both pots belong to the same vault, so the move cannot extract
 * value, and the source-side gate refuses anything that would leave the source
 * pot under-backed. Only `fresh_unliened` backing moves — backing pledged against
 * open interest, already consumed, or impaired stays put.
 *
 * ACCOUNTS: [cranker(signer,w), market(w), registry, fromLedger(w), toLedger(w),
 * systemProgram]. The destination ledger is created on first arrival.
 *
 * @example
 * ```ts
 * const data = encodeRebalanceLpVaultBacking({
 *   fromDomain: 2, toDomain: 3, amount: 500_000n,
 * });
 * ```
 */
declare function encodeRebalanceLpVaultBacking(args: {
    fromDomain: number;
    toDomain: number;
    amount: bigint | string;
}): Uint8Array;
/**
 * UpdateInsuranceWithdrawPolicy (tag 92) — set the insurance-withdrawal rate
 * limit (v18 wire, integration `a9318945`).
 *
 * Wire: tag(1) + depositsOnly(u8) + cooldownSlots(u64) + authorityEpoch(u64)
 *   = 18 bytes.
 * Accounts: [marketauth (signer), market (writable)].
 *
 * BREAKING vs v17 (10-byte payload): appends `authorityEpoch` — a CAS check
 * (strict `current == expected`) sharing asset-0's `authority_epoch` lane
 * (same lane as {@link encodeUpdateFeeSplit}/{@link encodeWithdrawCreatorFee}'s
 * asset-scoped checks are NOT — this one is gated on `marketauth`, not a
 * per-asset admin). Pass the LIVE current epoch, NOT current+1.
 *
 * `cooldownSlots` is capped at `MAX_INSURANCE_WITHDRAW_COOLDOWN_SLOTS`; the program rejects
 * anything above it, because an uncapped duration setter would let an admin freeze insurance
 * withdrawals permanently. Zero is legal for both fields and is how a market turns the limit
 * back OFF.
 */
declare function encodeUpdateInsuranceWithdrawPolicy(args: {
    depositsOnly: number;
    cooldownSlots: bigint | string;
    authorityEpoch: bigint | string;
}): Uint8Array;
/**
 * Upper bound the program enforces on `cooldownSlots` above (~1 year at 2.5 slots/s).
 * Mirrors `percolator-prog::constants::MAX_INSURANCE_WITHDRAW_COOLDOWN_SLOTS`.
 */
declare const MAX_INSURANCE_WITHDRAW_COOLDOWN_SLOTS = 78840000n;
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
declare function encodeSetLpVaultPaused(args: {
    paused: number;
}): Uint8Array;
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
declare function encodeCloseLpVault(): Uint8Array;
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
interface TransferPortfolioOwnershipArgs {
    newOwner: PublicKey | string;
    assetIndex: number;
}
declare function encodeTransferPortfolioOwnership(args: TransferPortfolioOwnershipArgs): Uint8Array;
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
interface SetNftProgramIdArgs {
    nftProgramId: PublicKey | string;
}
declare function encodeSetNftProgramId(args: SetNftProgramIdArgs): Uint8Array;
/**
 * ConfigureHybridOracle (tag 34) — set Pyth/hybrid oracle config for a market asset.
 *
 * v18 wire (integration `a9318945`): tag(1) + asset_index(u16) + market_id(u64) +
 *           now_slot(u64) + now_unix_ts(i64) +
 *           oracle_leg_count(u8) + oracle_leg_flags(u8) + max_staleness_secs(u64) +
 *           hybrid_soft_stale_slots(u64) + mark_ewma_halflife_slots(u64) +
 *           mark_min_fee(u64) + invert(u8) + unit_scale(u32) + conf_filter_bps(u16) +
 *           oracle_leg_feeds[0..3]([32] each) + observation_sequence(u64) = 172 bytes total.
 *
 * BREAKING vs v17 (156-byte payload): adds `market_id` (right after
 * `asset_index`) and appends `observation_sequence` — a strictly-increasing
 * replay nonce (this asset's `oracle_observation` control-sequences lane).
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
 * @param marketId                 The asset's market_id.
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
 * @param observationSequence      Strictly-increasing replay nonce (this asset's `oracle_observation` lane).
 *
 * @example
 * ```ts
 * const data = encodeConfigureHybridOracle({
 *   assetIndex: 1,
 *   marketId: 1n,
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
 *   observationSequence: nextObservationSequence,
 * });
 * assert(data.length === 172);
 * ```
 */
interface ConfigureHybridOracleArgs {
    assetIndex: number;
    marketId: bigint | string;
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
    observationSequence: bigint | string;
}
declare function encodeConfigureHybridOracle(args: ConfigureHybridOracleArgs): Uint8Array;
/**
 * ConfigureEwmaMark (tag 35) — set EWMA mark oracle config for a market asset.
 *
 * v18 wire (integration `a9318945`): tag(1) + asset_index(u16) + market_id(u64) +
 *           now_slot(u64) + initial_mark_e6(u64) +
 *           mark_ewma_halflife_slots(u64) + mark_min_fee(u64) +
 *           observation_sequence(u64) = 51 bytes total.
 *
 * BREAKING vs v17 (35-byte payload): adds `market_id` (right after
 * `asset_index`) and appends `observation_sequence`.
 *
 * Accounts: [0] oracle_authority (signer), [1] market (writable).
 *
 * Constraints (from v16_program.rs:10558-10563):
 *   - initial_mark_e6 ∈ [1, MAX_ORACLE_PRICE]
 *   - mark_ewma_halflife_slots > 0
 *   - Caller must be the asset's oracle_authority
 *
 * @param assetIndex               Asset slot index (u16).
 * @param marketId                 The asset's market_id.
 * @param nowSlot                  Current on-chain slot (u64).
 * @param initialMarkE6            Initial mark price × 1e6 (u64, must be > 0).
 * @param markEwmaHalflifeSlots    EWMA half-life for mark price smoothing (slots, must be > 0).
 * @param markMinFee               Minimum fee charged per mark-price update (u64).
 * @param observationSequence      Strictly-increasing replay nonce (this asset's `oracle_observation` lane).
 *
 * @example
 * ```ts
 * const data = encodeConfigureEwmaMark({
 *   assetIndex: 1,
 *   marketId: 1n,
 *   nowSlot: 300000000n,
 *   initialMarkE6: 50000000000n,
 *   markEwmaHalflifeSlots: 500n,
 *   markMinFee: 0n,
 *   observationSequence: nextObservationSequence,
 * });
 * assert(data.length === 51);
 * ```
 */
interface ConfigureEwmaMarkArgs {
    assetIndex: number;
    marketId: bigint | string;
    nowSlot: bigint | string;
    initialMarkE6: bigint | string;
    markEwmaHalflifeSlots: bigint | string;
    markMinFee: bigint | string;
    observationSequence: bigint | string;
}
declare function encodeConfigureEwmaMark(args: ConfigureEwmaMarkArgs): Uint8Array;
/**
 * PushEwmaMark (tag 36) — push a new EWMA mark price observation.
 *
 * v18 wire (integration `a9318945`): tag(1) + asset_index(u16) + market_id(u64) +
 *   now_slot(u64) + mark_e6(u64) + observation_sequence(u64) = 35 bytes total.
 *
 * BREAKING vs v17 (19-byte payload): adds `market_id` (right after
 * `asset_index`) and appends `observation_sequence`.
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
 * @param marketId      The asset's market_id.
 * @param nowSlot       Current on-chain slot (u64).
 * @param markE6        New mark price × 1e6 (u64, must be > 0).
 * @param observationSequence  Strictly-increasing replay nonce (this asset's `oracle_observation` lane).
 *
 * @example
 * ```ts
 * const data = encodePushEwmaMark({
 *   assetIndex: 1, marketId: 1n, nowSlot: 300000001n, markE6: 50100000000n,
 *   observationSequence: nextObservationSequence,
 * });
 * assert(data.length === 35);
 * ```
 */
interface PushEwmaMarkArgs {
    assetIndex: number;
    marketId: bigint | string;
    nowSlot: bigint | string;
    markE6: bigint | string;
    observationSequence: bigint | string;
}
declare function encodePushEwmaMark(args: PushEwmaMarkArgs): Uint8Array;
/**
 * ConfigureAuthMark (tag 62) — set auth-push mark oracle for a market asset.
 *
 * v18 wire (integration `a9318945`): tag(1) + asset_index(u16) + market_id(u64) +
 *   now_slot(u64) + initial_mark_e6(u64) + observation_sequence(u64) = 35 bytes total.
 *
 * BREAKING vs v17 (19-byte payload): adds `market_id` (right after
 * `asset_index`) and appends `observation_sequence`.
 *
 * Accounts: [0] oracle_authority (signer), [1] market (writable).
 *
 * Constraints (from v16_program.rs:10665):
 *   - initial_mark_e6 ∈ [1, MAX_ORACLE_PRICE]
 *   - Caller must be the asset's oracle_authority
 *
 * @param assetIndex       Asset slot index (u16).
 * @param marketId         The asset's market_id.
 * @param nowSlot          Current on-chain slot (u64).
 * @param initialMarkE6    Initial mark price × 1e6 (u64, must be > 0).
 * @param observationSequence  Strictly-increasing replay nonce (this asset's `oracle_observation` lane).
 *
 * @example
 * ```ts
 * const data = encodeConfigureAuthMark({
 *   assetIndex: 1, marketId: 1n, nowSlot: 300000000n, initialMarkE6: 50000000000n,
 *   observationSequence: nextObservationSequence,
 * });
 * assert(data.length === 35);
 * ```
 */
interface ConfigureAuthMarkArgs {
    assetIndex: number;
    marketId: bigint | string;
    nowSlot: bigint | string;
    initialMarkE6: bigint | string;
    observationSequence: bigint | string;
}
declare function encodeConfigureAuthMark(args: ConfigureAuthMarkArgs): Uint8Array;
/**
 * PushAuthMark (tag 63) — push a new auth-mark price observation.
 *
 * v18 wire (integration `a9318945`): tag(1) + asset_index(u16) + market_id(u64) +
 *   now_slot(u64) + mark_e6(u64) + observation_sequence(u64) = 35 bytes total.
 *
 * BREAKING vs v17 (19-byte payload): adds `market_id` (right after
 * `asset_index`) and appends `observation_sequence`.
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
 * @param marketId      The asset's market_id.
 * @param nowSlot       Current on-chain slot (u64).
 * @param markE6        New mark price × 1e6 (u64, must be > 0).
 * @param observationSequence  Strictly-increasing replay nonce (this asset's `oracle_observation` lane).
 *
 * @example
 * ```ts
 * const data = encodePushAuthMark({
 *   assetIndex: 1, marketId: 1n, nowSlot: 300000001n, markE6: 50100000000n,
 *   observationSequence: nextObservationSequence,
 * });
 * assert(data.length === 35);
 * ```
 */
interface PushAuthMarkArgs {
    assetIndex: number;
    marketId: bigint | string;
    nowSlot: bigint | string;
    markE6: bigint | string;
    observationSequence: bigint | string;
}
declare function encodePushAuthMark(args: PushAuthMarkArgs): Uint8Array;
/**
 * MatcherInitPassive — 78-byte `InitParams` payload sent to the MATCHER
 * PROGRAM (not wrapper) to initialize a passive LP matcher context.
 *
 * This is NOT a wrapper instruction. Program = matcher program address.
 * Accounts: [0] matcherDelegate (read-only PDA, signer), [1] matcherCtx (writable).
 *
 * Wire layout (78 bytes = {@link INIT_CTX_LEN}, byte-matched against
 * `percolator-match::vamm::InitParams::{parse,encode}` at
 * sync/v16-migration-backing-fee-cap@12bd671, and cross-checked against the
 * checked-in `specs/matcher-parity.json` `init_field_offsets` fixture, which
 * is generated straight from that source via `sdk_parity_fixtures`):
 *   [0]       = 2          (tag: MATCHER_INIT_VAMM_TAG, shared by Passive/vAMM init)
 *   [1]       = 0          (kind: 0 = Passive)
 *   [2..6]    = 0u32 LE    (trading_fee_bps)
 *   [6..10]   = 0u32 LE    (base_spread_bps)
 *   [10..14]  = 100u32 LE  (max_total_bps — 100 bps default fee+spread cap)
 *   [14..18]  = 0u32 LE    (impact_k_bps — vAMM only, unused for Passive)
 *   [18..34]  = 0          (liquidity_notional_e6, u128 LE — vAMM only)
 *   [34..50]  = max_fill_abs (u128 LE)
 *   [50..66]  = 0          (max_inventory_abs, u128 LE — 0 = unlimited)
 *   [66..68]  = 0u16 LE    (fee_to_insurance_bps)
 *   [68..70]  = 0u16 LE    (skew_spread_mult_bps)
 *   [70..78]  = lp_account_id (u64 LE)
 *   Total = 78 bytes
 *
 * GH#10 parity fix: the matcher's `process_init` now unconditionally rejects
 * `lp_account_id == 0` with `InvalidInstructionData` — a context created
 * without a bound lp_account_id had no cross-market spoof-guard binding at
 * all (`ctx.lp_account_id != 0 && call.lp_account_id != ctx.lp_account_id`
 * never triggered for it). The pre-fix 66-byte payload this function used to
 * emit falls short of {@link INIT_CTX_LEN}, so the matcher's `extended` check
 * treats it as the v3-compat shape and defaults `lp_account_id` to 0 —
 * meaning every call was rejected unconditionally against the v18 matcher.
 * `lpAccountId` is therefore now a required, non-zero argument.
 *
 * The matcher delegate PDA is derived via `deriveMatcherDelegate()` in pda.ts using
 * seeds ["matcher", market, accountB, accountBOwner, matcherProg, matcherCtx].
 * The caller passes the same numeric id it derived its delegate PDA from
 * (percolator-prog derives this as the low 8 bytes of the matcher delegate
 * pubkey) so `process_call`'s `call.lp_account_id == ctx.lp_account_id`
 * cross-market check binds correctly.
 *
 * @param maxFillAbs   Maximum absolute fill size (u128). Pass 2n**128n-1n for no limit
 *                     (the matcher clamps this to i128::MAX at init).
 * @param lpAccountId  Numeric LP account identifier (u64). MUST be non-zero — the
 *                     v18 matcher's `process_init` rejects `lp_account_id == 0`
 *                     unconditionally (GH#10).
 *
 * @example
 * ```ts
 * const data = encodeMatcherInitPassive({ maxFillAbs: 2n ** 128n - 1n, lpAccountId: 12345n });
 * assert(data.length === 78);
 * // send to matcherProgram, accounts: [delegate(signer), ctx(w)]
 * ```
 */
interface MatcherInitPassiveArgs {
    maxFillAbs: bigint | string;
    lpAccountId: bigint | string;
}
declare function encodeMatcherInitPassive(args: MatcherInitPassiveArgs): Uint8Array;
/**
 * WithdrawProtocolFee instruction data (tag 84, v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + amount(u128 LE) + authority_epoch(u64) = 25 bytes.
 *
 * BREAKING vs v17 (17-byte payload): appends `authority_epoch` (W4-AE-84) —
 * a CAS check against the market-wide `protocol_fee_authority_epoch` counter
 * (`PROTOCOL_FEE_AUTHORITY_EPOCH_OFF`, carved into asset-0's wrapper-slot
 * headroom at offset 600; distinct from any per-asset
 * `AssetControlSequencesV16.authority_epoch` lane, since
 * `protocol_fee_authority` is market-config-scoped, not asset-scoped).
 * Incremented by tag 85 (SetProtocolFeeAuthority). Pass the LIVE current
 * epoch, NOT current+1 — this closes an A->B->A replay window across an
 * intervening authority rotation.
 *
 * Pays out from the accrued-but-unwithdrawn protocol claim
 * (`protocol_fee_accrued_atoms - protocol_fee_withdrawn_atoms` on
 * WrapperConfigV17) to an external token account. Signer-gated on
 * `cfg.protocolFeeAuthority` (see `parseWrapperConfigV17`). The transfer is
 * clamped to what's actually available on-chain (engine surplus, vault
 * balance) and only the actually-transferred amount is marked withdrawn —
 * this never errors solely because the ledger raced ahead of availability.
 *
 * @param amount Atoms to withdraw (u128). Pass `0n` to withdraw all
 *               currently-available capacity.
 * @param authorityEpoch  Live-read current `protocol_fee_authority_epoch` (CAS, expected-current).
 *
 * @example
 * ```ts
 * const data = encodeWithdrawProtocolFee({ amount: 0n, authorityEpoch: 0n }); // withdraw-all
 * // accounts: ACCOUNTS_WITHDRAW_PROTOCOL_FEE from abi/accounts.ts
 * ```
 */
interface WithdrawProtocolFeeArgs {
    amount: bigint | string;
    authorityEpoch: bigint | string;
}
declare function encodeWithdrawProtocolFee(args: WithdrawProtocolFeeArgs): Uint8Array;
/**
 * SetProtocolFeeAuthority instruction data (tag 85).
 *
 * v17 wire: tag(1) + new_authority(32) = 33 bytes.
 *
 * Rotates `cfg.protocolFeeAuthority` on a single market. Gated on the
 * program's BPF upgrade authority (a `ProgramData` PDA read, NOT
 * marketauth/insurance_authority/any creator-facing gate) — see
 * ACCOUNTS_SET_PROTOCOL_FEE_AUTHORITY in abi/accounts.ts. No global fan-out;
 * a keeper script iterates markets for a mass rotation.
 *
 * @param newAuthority New protocol-fee-authority pubkey.
 *
 * @example
 * ```ts
 * const data = encodeSetProtocolFeeAuthority({ newAuthority: newTreasury });
 * ```
 */
interface SetProtocolFeeAuthorityArgs {
    newAuthority: PublicKey;
}
declare function encodeSetProtocolFeeAuthority(args: SetProtocolFeeAuthorityArgs): Uint8Array;
/**
 * On-chain fee-split constants, mirrored from `v16_program.rs::constants`.
 *
 * `T = trade_fee_base_bps` is the whole trade fee. It splits four ways at
 * every trade-fee credit site: a constant 2000 bps protocol skim, then the
 * three stored shares below, which are bps *of T* and must sum to exactly
 * `FEE_SHARE_TOTAL_BPS`.
 *
 * The floors are percentages of the post-protocol remainder (creator <= 45%,
 * LP >= 40%, insurance >= 15%) converted to bps-of-T by `pct * 8000`. They sum
 * to exactly 8000, i.e. they are precisely complementary — pushing creator
 * above its ceiling necessarily drags another leg under its floor.
 *
 * Defaults are written unconditionally at InitMarket and are never instruction
 * arguments, so a market that never calls UpdateFeeSplit still pays all four
 * legs correctly from its first trade.
 */
declare const FEE_SPLIT: {
    /** Constant protocol skim, bps of T. Compile-time in the program; not stored, not settable. */
    readonly PROTOCOL_FEE_BPS: 2000;
    /** The three stored shares must sum to exactly this (= 10_000 - PROTOCOL_FEE_BPS). */
    readonly FEE_SHARE_TOTAL_BPS: 8000;
    readonly DEFAULT_CREATOR_SHARE_BPS: 1600;
    readonly DEFAULT_LP_SHARE_BPS: 4800;
    readonly DEFAULT_INSURANCE_SHARE_BPS: 1600;
    /** Creator ceiling, bps of T (45% of the post-protocol remainder). */
    readonly MAX_CREATOR_SHARE_BPS: 3600;
    /** LP floor, bps of T (40% of the post-protocol remainder). */
    readonly MIN_LP_SHARE_BPS: 3200;
    /** Insurance/staker floor, bps of T (15% of the post-protocol remainder). */
    readonly MIN_INSURANCE_SHARE_BPS: 1200;
};
/**
 * Client-side mirror of `policy_v16::validate_fee_split`. Returns `null` when
 * the split would be accepted on-chain, otherwise a human-readable reason.
 *
 * Provided so a wizard/UI can reject a bad split before paying for a
 * transaction; the wrapper enforces the same rules regardless (Custom(52)
 * FeeSplitSumInvalid for the sum, Custom(51) FeeSplitFloorViolation for the
 * floors), so this is a convenience, never the security boundary.
 *
 * @param args The three candidate shares, in bps of T.
 * @returns `null` if valid, else a string describing the first violation.
 *
 * @example
 * ```ts
 * validateFeeSplit({ creatorShareBps: 1600, lpShareBps: 4800, insuranceShareBps: 1600 });
 * // => null (these are the on-chain defaults)
 * validateFeeSplit({ creatorShareBps: 4000, lpShareBps: 3200, insuranceShareBps: 800 });
 * // => "creatorShareBps 4000 exceeds MAX_CREATOR_SHARE_BPS 3600"
 * ```
 */
declare function validateFeeSplit(args: UpdateFeeSplitArgs): string | null;
/**
 * UpdateFeeSplit instruction data (tag 86, v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + creator_share_bps(u16 LE) + lp_share_bps(u16 LE) +
 * insurance_share_bps(u16 LE) + authority_epoch(u64) = 15 bytes.
 *
 * BREAKING vs v17 (7-byte payload): appends `authority_epoch` (W4-AE-EXTEND)
 * — a CAS check sharing asset-0's `AssetControlSequencesV16.authority_epoch`
 * lane (this tag is gated on `cfg.marketauth`, which asset-0's lane already
 * tracks rotations for via tag 32). Pass the LIVE current epoch, NOT
 * current+1.
 *
 * Sets the three stored fee shares. Gated on `cfg.marketauth` — see
 * ACCOUNTS_UPDATE_FEE_SPLIT in abi/accounts.ts. Shares are bps of T and must
 * sum to FEE_SHARE_TOTAL_BPS (8000) while satisfying the floors; use
 * {@link validateFeeSplit} to check before sending.
 *
 * ⚠ ORDERING: call this BEFORE `StakeInitPool`, which irreversibly rotates
 * `cfg.marketauth` to the stake-pool PDA. Afterwards a PDA cannot sign a
 * top-level transaction and this tag is reachable only via the stake program's
 * CPI proxy — see {@link encodeStakeAdminUpdateFeeSplit} (stake tag 25).
 *
 * @param creatorShareBps Creator's share of T in bps. Must be <= 3600.
 * @param lpShareBps LP vault's share of T in bps. Must be >= 3200.
 * @param insuranceShareBps Insurance/staker share of T in bps. Must be >= 1200.
 * @param authorityEpoch  Live-read current authority_epoch for asset 0 (CAS, expected-current).
 * @returns 15-byte instruction data buffer.
 *
 * @example
 * ```ts
 * // Restore the on-chain defaults explicitly.
 * const data = encodeUpdateFeeSplit({
 *   creatorShareBps: 1600,
 *   lpShareBps: 4800,
 *   insuranceShareBps: 1600,
 *   authorityEpoch: 0n,
 * });
 * // accounts: ACCOUNTS_UPDATE_FEE_SPLIT from abi/accounts.ts
 * ```
 */
interface UpdateFeeSplitArgs {
    creatorShareBps: number;
    lpShareBps: number;
    insuranceShareBps: number;
    authorityEpoch: bigint | string;
}
declare function encodeUpdateFeeSplit(args: UpdateFeeSplitArgs): Uint8Array;
/**
 * WithdrawInsuranceReserveToStake instruction data (tag 87).
 *
 * v17 wire: tag(1) = 1 byte. No arguments — the amount is
 * `insurance_reserve_accrued_atoms - insurance_reserve_withdrawn_atoms`,
 * clamped on-chain to engine-available surplus, and the destination is derived
 * rather than passed.
 *
 * Permissionless: any signer may crank it. The destination is `pool.vault`,
 * read out of the stake pool at `["stake_pool", market]` under the wrapper's
 * PINNED stake program id, so there is nothing for a caller to redirect.
 *
 * ⚠ Live-only. Rejects Recovery and Resolved (Custom 21 EngineLockActive) and
 * matured-Live. `ResolveMarket` is one-way and `WithdrawInsuranceAsset` (tag
 * 41/57) cannot reach this unbudgeted leg, so anything accrued but not pushed
 * before a market resolves is PERMANENTLY FORFEITED by stakers. Crank before
 * resolution.
 *
 * ⚠ A default (non-devnet) wrapper build has no pinned stake program id and
 * fails closed with Custom(60) StakeProgramNotPinned. There is no v17 mainnet
 * stake deployment.
 *
 * @returns 1-byte instruction data buffer.
 *
 * @example
 * ```ts
 * const data = encodeWithdrawInsuranceReserveToStake();
 * // accounts: ACCOUNTS_WITHDRAW_INSURANCE_RESERVE_TO_STAKE from abi/accounts.ts
 * ```
 */
declare function encodeWithdrawInsuranceReserveToStake(): Uint8Array;
/**
 * UpdateMaintenanceFeePerSlot instruction data (tag 88).
 *
 * v17 wire: tag(1) + maintenance_fee_per_slot(u128 LE) = 17 bytes.
 *
 * ⚠ THE PAYLOAD IS u128, NOT u64. The wrapper decodes it with `read_u128`,
 * matching the storage type (`WrapperConfigV16::maintenance_fee_per_slot`) and
 * InitMarket's own encoding. A u64 payload leaves 8 bytes unconsumed and the
 * wrapper rejects the instruction outright.
 *
 * Gated on `cfg.marketauth`. The wrapper range-checks against
 * `MAX_PROTOCOL_FEE_ABS` (1e36) and returns Custom(14) EngineInvalidConfig if
 * exceeded — the same bound InitMarket applies.
 *
 * Same StakeInitPool ordering caveat as tag 86; the proxy is
 * {@link encodeStakeAdminUpdateMaintenanceFeePerSlot} (stake tag 26).
 *
 * @param maintenanceFeePerSlot Fee charged per slot, u128. Default is 0
 *                              (maintenance fee disabled).
 * @returns 17-byte instruction data buffer.
 *
 * @example
 * ```ts
 * const data = encodeUpdateMaintenanceFeePerSlot({ maintenanceFeePerSlot: 0n });
 * // accounts: ACCOUNTS_UPDATE_MAINTENANCE_FEE_PER_SLOT from abi/accounts.ts
 * ```
 */
interface UpdateMaintenanceFeePerSlotArgs {
    maintenanceFeePerSlot: bigint | string;
}
declare function encodeUpdateMaintenanceFeePerSlot(args: UpdateMaintenanceFeePerSlotArgs): Uint8Array;
/**
 * UpdateTradeFeePolicy instruction data (tag 55, v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + trade_fee_base_bps(u64 LE) + policy_sequence(u64 LE) = 17 bytes.
 *
 * BREAKING vs v17 (9-byte payload): appends `policy_sequence` — a
 * strictly-increasing replay nonce (asset-0's `trade_fee` control-sequences
 * lane), NOT a CAS/current-epoch value.
 *
 * Sets `T`, the base trade fee that the four-way split divides. Gated on
 * ASSET 0's `insurance_authority`, NOT on `marketauth` — so unlike tags 86/88
 * this survives `StakeInitPool` but is stranded by `BindInsuranceAuthority`,
 * after which the proxy is {@link encodeStakeAdminUpdateTradeFeePolicy}
 * (stake tag 28).
 *
 * ⚠ Note the type asymmetry with tag 88: this decodes with `read_u64`, tag 88
 * with `read_u128`.
 *
 * Added 2026-07-20: IX_TAG.UpdateTradeFeePolicy existed but had no encoder,
 * which left stake tag 28's CPI target unrepresentable from the SDK.
 *
 * @param tradeFeeBaseBps Base trade fee in bps (u64).
 * @param policySequence  Strictly-increasing replay nonce (asset-0's `trade_fee` lane).
 * @returns 17-byte instruction data buffer.
 *
 * @example
 * ```ts
 * const data = encodeUpdateTradeFeePolicy({ tradeFeeBaseBps: 30n, policySequence: nextPolicySequence });
 * ```
 */
interface UpdateTradeFeePolicyArgs {
    tradeFeeBaseBps: bigint | string;
    policySequence: bigint | string;
}
declare function encodeUpdateTradeFeePolicy(args: UpdateTradeFeePolicyArgs): Uint8Array;
/**
 * ExpireBackingBucket instruction data (tag 89).
 *
 * v17 wire: tag(1) + domain(u16 LE) = 3 bytes. Verified against
 * v16_program.rs's tag-89 decode arm (`89 => Self::ExpireBackingBucket {
 * domain: read_u16(&mut rest)? }`) followed by the shared
 * `if !rest.is_empty()` guard — any trailing byte is rejected.
 *
 * PERMISSIONLESS. One account, the market, writable, and NO signer at all
 * (see ACCOUNTS_EXPIRE_BACKING_BUCKET). Any keeper can call it; there is no
 * authority to hold.
 *
 * ## Why this exists
 *
 * A realized loss reserves capital as counterparty backing, which opens the
 * source domain's bucket as `Fresh` with a fixed `expiry_slot`. Once that
 * expiry passes while the bucket is still `Fresh`, the domain becomes a DEAD
 * END in all three directions, permanently:
 *
 *   - settling a GAIN against it     -> Custom(19) EngineStale
 *   - reserving a further LOSS       -> Custom(21) EngineLockActive
 *   - `TopUpBackingBucket` to re-fund it -> Custom(21) EngineLockActive
 *
 * The bucket cannot even be paid to come back. Before tag 89 the wrapper had
 * no call site that reached the engine's own escape hatch
 * (`expire_source_backing_bucket_not_atomic`) on a LIVE market — the engine
 * used it only on the RESOLVED close path — so a lapse bricked the domain for
 * good. Tag 89 IS that missing call site.
 *
 * ## ⚠ This is routine maintenance, not an edge case — wire a keeper
 *
 * EVERY BACKED MARKET LAPSES EVENTUALLY. `fresh_counterparty_backing_expiry_slot`
 * returns the stored expiry unchanged on a live bucket, so the expiry is set
 * once when the bucket opens and is never extended. Seeding a long horizon
 * (e.g. MAX_BACKING_BUCKET_EXPIRY_SLOT) DEFERS the lapse; it does not prevent
 * it. Treat tag 89 as a standing keeper duty alongside the crank, not as an
 * incident-response tool: a keeper should scan live markets for domains whose
 * bucket is `Fresh` with `current_slot >= expiry_slot` and expire them. If
 * nobody cranks it, the first lapse silently bricks the domain and the failure
 * surfaces to users as an unexplained Custom(19)/Custom(21) on ordinary
 * settlement.
 *
 * ## Safety
 *
 * Permissionless is not an authority hole. The engine refuses the transition
 * unless the bucket is `Fresh` AND `now_slot >= expiry_slot`, and `now_slot`
 * is read from the runtime `Clock` (via
 * `authenticated_market_slot_or_fallback_view`), NEVER from a caller argument
 * — so no caller can force an early forfeiture. Moves no tokens.
 *
 * Expiry forfeits the lapsed principal to the junior pool. That is the
 * engine's documented expiry semantics, not a haircut invented by this
 * instruction; the alternative is the account never settling at all.
 *
 * ## Failure modes
 *
 * - Custom(21) EngineLockActive — the market is not Live (`mode != 0`). The
 *   resolved/wound-down path reaches the transition through the engine's own
 *   resolved-close sweep, so re-entering it from outside is refused.
 * - Custom(9) InvalidInstruction — `domain >= 2 * max_market_slots`.
 * - Custom(19) EngineStale — the engine declined: the bucket is not `Fresh`,
 *   or it is `Fresh` but has NOT yet lapsed. Fails closed, so calling this
 *   speculatively on a healthy domain is safe (it just reverts).
 *
 * @param domain Backing-bucket domain index (2*assetIndex for long,
 *               2*assetIndex+1 for short), u16. Must be
 *               `< 2 * max_market_slots`.
 * @returns 3-byte instruction data buffer.
 *
 * @example
 * ```ts
 * // Keeper: unbrick the long domain of asset 0 after its bucket lapsed.
 * const data = encodeExpireBackingBucket({ domain: 0 });
 * // accounts: ACCOUNTS_EXPIRE_BACKING_BUCKET — [market] writable, no signer
 * // beyond the fee payer.
 * ```
 */
interface ExpireBackingBucketArgs {
    domain: number;
}
declare function encodeExpireBackingBucket(args: ExpireBackingBucketArgs): Uint8Array;
/**
 * WithdrawCreatorFee instruction data (tag 90, v18 wire, integration `a9318945`).
 *
 * v18 wire: tag(1) + amount(u128 LE) + asset_index(u16 LE) + authority_epoch(u64 LE)
 *   = 27 bytes. Verified against percolator-prog `src/v16_program.rs`:
 *
 *   decode arm:  90 => Self::WithdrawCreatorFee { amount: read_u128(&mut rest)?,
 *                  asset_index: read_u16(&mut rest)?, authority_epoch: read_u64(&mut rest)? }
 *   tail guard:  if !rest.is_empty() { return Err(InvalidInstructionData) }
 *                -> total length is EXACTLY 27; any trailing byte is rejected
 *   encode arm:  out.push(90); push_u128(&mut out, amount); push_u16(&mut out, asset_index);
 *                push_u64(&mut out, authority_epoch)
 *
 * BREAKING vs v17 (17-byte, amount-only payload): GH#420 appends
 * `asset_index` (WHICH asset's creator fees — creator-fee accrual moved from
 * one global `WrapperConfigV16::creator_fee_claimable_atoms` counter to a
 * per-asset `AssetOracleProfileV16::creator_fee_claimable_atoms` field, so
 * the withdraw call must now say which asset it's draining) and
 * `authority_epoch` (W4-AE-EXTEND CAS, against THIS asset's OWN
 * `AssetControlSequencesV16.authority_epoch` lane — WithdrawCreatorFee's
 * authority is per-asset, unlike UpdateFeeSplit/UpdateInsuranceWithdrawPolicy
 * which gate on marketauth and share asset-0's lane). Pass the LIVE current
 * epoch, NOT current+1.
 *
 * Pays the market creator's accrued trade-fee share out of the market vault to
 * an external token account, debiting `creatorFeeClaimableAtoms` by exactly
 * `amount`. That counter is disjoint from the insurance domain budget (the loss
 * backstop): before this change the creator leg was credited INTO the backstop,
 * so a "claim fees" button was really a backstop withdrawal. Tag 90 cannot
 * touch the backstop, and tag 57 (WithdrawInsuranceAsset) cannot touch this
 * counter.
 *
 * ⚠ `amount: 0n` is REJECTED by the program (InvalidInstruction), NOT treated
 * as the "withdraw all" sentinel that {@link encodeWithdrawProtocolFee} (tag
 * 84) uses. To drain, read `creatorFeeClaimableAtoms` from
 * `parseWrapperConfigV17` and pass that exact value.
 *
 * ⚠ Over-claim is rejected, not clamped — there is no partial fill, and nothing
 * is debited on failure. If the vault's unbudgeted surplus is momentarily thin
 * the whole instruction fails closed (EngineLockActive); retry with less.
 *
 * ⚠ Authority is asset 0's `insurance_operator` and ONLY that (never
 * `cfg.marketauth`), so claiming still works on a staked market where
 * StakeInitPool has rotated `marketauth` to the stake-pool PDA.
 *
 * @param amount Atoms to claim (u128 on the wire; the on-chain counter is a
 *               u64, so anything above u64::MAX is an over-claim).
 * @param assetIndex      WHICH asset's creator fees to claim.
 * @param authorityEpoch  Live-read current authority_epoch for this asset (CAS, expected-current).
 *
 * @example
 * ```ts
 * const profile = parseAssetOracleProfileV17(marketAccount.data, profileOff);
 * // Drain asset 0's full claimable balance:
 * const data = encodeWithdrawCreatorFee({
 *   amount: profile.creatorFeeClaimableAtoms,
 *   assetIndex: 0,
 *   authorityEpoch: 0n,
 * });
 * // accounts: ACCOUNTS_WITHDRAW_CREATOR_FEE from abi/accounts.ts
 * ```
 */
interface WithdrawCreatorFeeArgs {
    amount: bigint | string;
    assetIndex: number;
    authorityEpoch: bigint | string;
}
declare function encodeWithdrawCreatorFee(args: WithdrawCreatorFeeArgs): Uint8Array;

/**
 * Account spec for building instruction account metas.
 * Each instruction has a fixed ordering that matches the Rust processor.
 */
interface AccountSpec {
    name: string;
    signer: boolean;
    writable: boolean;
}
/**
 * InitMarket (tag 0): 3 accounts.
 *
 * v17 wire account layout (v16_program.rs `handle_init_market`):
 *   [0] admin   signer, writable  (market admin; pays for the slab alloc)
 *   [1] slab    writable          (the market account)
 *   [2] mint    readonly          (collateral mint)
 *
 * GH#381: this template was still the v12 NINE-account shape — it additionally
 * listed `vault`, `tokenProgram`, `clock`, `rent`, `dummyAta` and `systemProgram`.
 * The first three entries were correctly ordered and Solana ignores surplus
 * accounts, so transactions still landed; the cost was that the template told an
 * integrator to derive and pass five accounts v17 never reads, including a
 * `dummyAta` that has no meaning in v17 at all.
 *
 * Verified against `handle_init_market`, which reads `account(accounts, 0..=2)`
 * and nothing further, and against upstream aeyakovenko/percolator-prog, whose
 * handler reads the same three.
 */
declare const ACCOUNTS_INIT_MARKET: readonly AccountSpec[];
/**
 * InitPortfolio (tag 2): 3 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_init_portfolio):
 *   [0] owner      signer, writable (portfolio owner; pays for alloc)
 *   [1] market     writable (market-group slab; must be program-owned)
 *   [2] portfolio  writable (portfolio PDA; must be program-owned)
 *
 * v12 clock sysvar, userAta, vault, tokenProgram are gone — v17
 * InitPortfolio does not transfer collateral and does not read the clock.
 */
declare const ACCOUNTS_INIT_USER: readonly AccountSpec[];
/**
 * InitLP: 6 accounts
 * Program at percolator.rs:6607 calls expect_len(accounts, 6).
 * The 6th account (accounts[5]) is the clock sysvar — used via Clock::from_account_info.
 * [0] user         signer, writable (LP owner; pays fee)
 * [1] slab         writable
 * [2] userAta      writable (collateral source for fee)
 * [3] vault        writable (collateral destination)
 * [4] tokenProgram read-only
 * [5] clock        read-only (SYSVAR_CLOCK_PUBKEY)
 */
declare const ACCOUNTS_INIT_LP: readonly AccountSpec[];
/**
 * Deposit (tag 3): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_deposit):
 *   [0] owner        signer (portfolio owner)
 *   [1] market       writable (market-group slab; must be program-owned)
 *   [2] portfolio    writable (portfolio PDA; must be program-owned)
 *   [3] sourceToken  writable (owner's collateral ATA)
 *   [4] vaultToken   writable (program vault token account)
 *   [5] tokenProgram read-only
 *
 * v12 stale accounts removed: clock sysvar. Portfolio account added at [2].
 * v17 amount is u128 (see instructions.ts encodeDepositCollateral).
 */
declare const ACCOUNTS_DEPOSIT_COLLATERAL: readonly AccountSpec[];
/**
 * Withdraw (tag 4): 7 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw):
 *   [0] owner          signer (portfolio owner)
 *   [1] market         writable (market-group slab; must be program-owned)
 *   [2] portfolio      writable (portfolio PDA; must be program-owned)
 *   [3] destToken      writable (owner's collateral ATA — destination)
 *   [4] vaultToken     writable (program vault token account — source)
 *   [5] vaultAuthority read-only (PDA that signs token CPI)
 *   [6] tokenProgram   read-only
 *
 * v12 stale accounts removed: clock sysvar, oracleIdx. Portfolio added at [2].
 * v17 amount is u128 (see instructions.ts encodeWithdrawCollateral).
 */
declare const ACCOUNTS_WITHDRAW_COLLATERAL: readonly AccountSpec[];
/**
 * E2 (native NFT-holder auth): the OPTIONAL trailing accounts that let the CURRENT
 * HOLDER of a position's bound NFT operate an NFT-escrowed position — deposit
 * (margin-defend), withdraw, trade_cpi/batch_trade_cpi, close_resolved,
 * claim_resolved_payout, convert/forfeit/rebalance. Append these to the base
 * account list when the signer is the NFT holder (not `portfolio.owner`); omit
 * them for the normal `owner == signer` path. The wrapper reads them as trailing
 * optional accounts and routes funds to the SIGNER (the holder), never the escrow PDA.
 *   [+0] nftRegistry  — `["nft_registry", marketGroup]` PDA (under the wrapper program)
 *   [+1] positionNft  — `["position_nft", portfolio, marketId_le]` PDA (the NFT program)
 *   [+2] signerNftAta — the signer's token account holding the bound NFT (amount == 1)
 */
declare const ACCOUNTS_NFT_HOLDER_AUTH: readonly AccountSpec[];
/**
 * Append the E2 NFT-holder-auth trio to any owner-gated account list, so the bound
 * NFT's holder can operate an escrowed position. No-op semantics for the wrapper
 * when the signer is the portfolio owner (it takes the fast path and ignores them).
 */
declare function withNftHolderAuth(base: readonly AccountSpec[]): AccountSpec[];
/**
 * KeeperCrank: 4 accounts
 * @deprecated v12.x only. Use ACCOUNTS_PERMISSIONLESS_CRANK in v17.
 */
declare const ACCOUNTS_KEEPER_CRANK: readonly AccountSpec[];
/**
 * PermissionlessCrank (tag 5): 3 fixed accounts + variable oracle tail.
 *
 * v17 wire account layout (v16_program.rs handle_permissionless_crank):
 *   [0] owner         signer, writable (keeper key; receives liquidation reward)
 *   [1] market        writable (the market-group slab)
 *   [2] portfolio     writable (the PORTFOLIO being cranked / liquidated)
 *   [3..] oracleTail  read-only oracle accounts (Pyth PriceUpdateV2 PDAs, one per asset)
 *
 * For liquidation with reward (action=1 and cfg.liquidation_cranker_fee_share_bps!=0),
 * the LAST oracle tail account must be the keeper's OWN portfolio (writable), so the
 * program can credit the liquidation fee there. The keeper portfolio must be owned by
 * the same program and have a different key from accounts[2].
 *
 * Use buildPermissionlessCrankKeys() (in keeper) to assemble the full account list
 * including oracle tail and optional keeper portfolio.
 */
declare const ACCOUNTS_PERMISSIONLESS_CRANK_BASE: readonly AccountSpec[];
/**
 * RestartAssetOracle (tag 69): 2 accounts.
 *
 * v17 wire account layout (v16_program.rs:9660 handle_restart_asset_oracle):
 *   [0] authority     signer (asset_admin for the target asset_index)
 *   [1] market        writable (the market-group slab)
 *
 * Gated by the asset's asset_admin key (per-asset in AssetOracleProfileV16).
 * Only callable when the asset lifecycle == ASSET_LIFECYCLE_RECOVERY.
 * Permissionless in the sense that any holder of asset_admin can call it.
 */
declare const ACCOUNTS_RESTART_ASSET_ORACLE: readonly AccountSpec[];
/**
 * TradeNoCpi (tag 6): 5 accounts.
 *
 * GH#381: the header said "tag 9". TradeNoCpi is tag 6; tag 9 is TopUpInsurance.
 * The accounts themselves were correct — only the tag in the prose was wrong.
 *
 * v17 wire account layout (v16_program.rs handle_trade_nocpi):
 *   [0] signerA   signer, writable (party A — portfolio owner)
 *   [1] signerB   signer, writable (party B — portfolio owner)
 *   [2] market    writable (market-group slab; program-owned)
 *   [3] accountA  writable (portfolio A; program-owned)
 *   [4] accountB  writable (portfolio B; program-owned)
 *
 * v12 stale accounts removed: lp, clock, oracle. market replaces slab.
 * signerB replaces lp (both portfolios must have live owner signers).
 */
declare const ACCOUNTS_TRADE_NOCPI: readonly AccountSpec[];
/**
 * LiquidateAtOracle: 4 accounts
 * Note: account[0] is unused but must be present
 */
declare const ACCOUNTS_LIQUIDATE_AT_ORACLE: readonly AccountSpec[];
/**
 * ClosePortfolio (tag 8): 3 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_close_portfolio):
 *   [0] owner      signer, writable (portfolio owner or marketauth on terminal cleanup)
 *   [1] market     writable (market-group slab; program-owned)
 *   [2] portfolio  writable (portfolio PDA being closed; program-owned)
 *
 * v12 stale accounts removed: vault, userAta, vaultPda, tokenProgram, clock, oracle.
 * v17 ClosePortfolio does not transfer collateral — it simply deregisters the
 * portfolio and closes the account back to the market slab.
 */
declare const ACCOUNTS_CLOSE_ACCOUNT: readonly AccountSpec[];
/**
 * TopUpInsurance (tag 9): 5 fixed accounts + 1 optional.
 *
 * v17 wire account layout (v16_program.rs handle_top_up_insurance):
 *   [0] signer       signer, writable (insurance authority for asset 0)
 *   [1] market       writable (market-group slab; program-owned)
 *   [2] sourceToken  writable (signer's collateral ATA — source)
 *   [3] vaultToken   writable (program vault token account — destination)
 *   [4] tokenProgram read-only
 *   [5] ledger       writable, optional (per-asset InsuranceLedger PDA)
 *
 * v12 stale accounts removed: clock sysvar (was at [5]).
 * v17 amount is u128 (see instructions.ts encodeTopUpInsurance).
 * Pass ledger PDA derived via deriveInsuranceLedger() when tracking
 * per-authority deposit principals; omit for simple vault top-ups.
 */
declare const ACCOUNTS_TOPUP_INSURANCE: readonly AccountSpec[];
/**
 * TopUpBackingBucket (tag 24): 5 accounts (+1 optional).
 *
 * v17 wire account layout (v16_program.rs handle_top_up_backing_bucket):
 *   [0] signer       signer, writable — must == the asset's backing_bucket_authority
 *   [1] market       writable (market-group slab; program-owned)
 *   [2] sourceToken  writable (signer's collateral ATA — source of the deposit)
 *   [3] vaultToken   writable (program vault token account — destination)
 *   [4] tokenProgram read-only
 *   [5] ledger       writable, optional (per-domain BackingDomainLedger PDA;
 *                    omit for a simple top-up with no ledger tracking)
 *
 * v17 amount/expiry are u128/u64 (see instructions.ts encodeTopUpBackingBucket).
 */
declare const ACCOUNTS_TOP_UP_BACKING_BUCKET: readonly AccountSpec[];
/**
 * WithdrawBackingBucket (tag 50): 7 accounts. The ledger is REQUIRED (percolator-prog#433).
 *
 * Safe to require ONLY because `TopUpBackingBucket` now CREATES this PDA, so one exists
 * before any withdrawal is possible. A first fix required it WITHOUT that creation path,
 * shipped, and stranded backing on every market with no LP vault — the account had to
 * already exist, and only the LP-vault handlers ever made one. The requirement and the
 * creation are one change; never ship the first without the second.
 *
 * Omitting [6] used to skip BOTH the principal-consistency guard and the principal
 * decrement: the vault paid out while `total_principal_atoms` stayed frozen.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw_backing_bucket):
 *   [0] authority      signer — the asset's backing_bucket_authority (or marketauth)
 *   [1] market         writable (market-group slab; program-owned)
 *   [2] destToken      writable (authority-OWNED token account — destination)
 *   [3] vaultToken     writable (program vault token account — source)
 *   [4] vaultAuthority read-only (PDA that signs the token CPI)
 *   [5] tokenProgram   read-only
 *   [6] ledger         writable, REQUIRED — `["lp_backing_ledger", market, domain_le_u16]`,
 *                      `expect_key`-pinned to that derivation
 */
declare const ACCOUNTS_WITHDRAW_BACKING_BUCKET: readonly AccountSpec[];
/**
 * UpdateBackingFeePolicy (tag 51): 2 accounts — the LP-yield on/off switch.
 *
 * v17 wire account layout (v16_program.rs handle_update_backing_fee_policy):
 *   [0] authority signer — the asset's insurance_authority (NOT marketauth,
 *                 so it stays callable by the creator wallet after the
 *                 launch flow rotates marketauth to the stake-pool PDA)
 *   [1] market    writable (market-group slab; program-owned)
 */
declare const ACCOUNTS_UPDATE_BACKING_FEE_POLICY: readonly AccountSpec[];
/**
 * WithdrawBackingBucketEarnings (tag 52): 7 accounts — ledger REQUIRED.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw_backing_bucket_earnings):
 *   [0] authority      signer — the asset's backing_bucket_authority (or marketauth)
 *   [1] market         writable (market-group slab; program-owned)
 *   [2] ledger         writable, REQUIRED (per-domain BackingDomainLedger PDA;
 *                      unlike tag 50 where it is an optional tail)
 *   [3] destToken      writable (authority-OWNED token account — destination)
 *   [4] vaultToken     writable (program vault token account — source)
 *   [5] vaultAuthority read-only (PDA that signs the token CPI)
 *   [6] tokenProgram   read-only
 */
declare const ACCOUNTS_WITHDRAW_BACKING_BUCKET_EARNINGS: readonly AccountSpec[];
/**
 * TradeCpi (tag 10): 7 fixed accounts + optional tail.
 *
 * v17 wire account layout (v16_program.rs handle_trade_cpi):
 *   [0] signerA          signer (party A — portfolio owner)
 *   [1] market           writable (market-group slab; program-owned)
 *   [2] accountA         writable (portfolio A; program-owned)
 *   [3] accountB         writable (portfolio B; program-owned)
 *   [4] matcherProg      read-only, executable (matcher program)
 *   [5] matcherCtx       writable (matcher context account; owned by matcherProg)
 *   [6] matcherDelegate  read-only (PDA derived by deriveMatcherDelegate())
 *   [7+] tail            additional accounts forwarded to matcher CPI
 *
 * v12 stale accounts removed: lpOwner, clock, oracle, lpPda.
 * matcherDelegate replaces lpPda — derive via deriveMatcherDelegate().
 * market replaces slab name.
 */
declare const ACCOUNTS_TRADE_CPI: readonly AccountSpec[];
/**
 * SetRiskThreshold: 2 accounts
 */
declare const ACCOUNTS_SET_RISK_THRESHOLD: readonly AccountSpec[];
/**
 * UpdateAdmin: 2 accounts
 */
declare const ACCOUNTS_UPDATE_ADMIN: readonly AccountSpec[];
/**
 * AcceptAdmin: 2 accounts (tag 82)
 * Second half of two-step admin transfer. The proposed new admin must sign to
 * complete the transfer. Program at percolator.rs:7994 calls expect_len(accounts, 2).
 * [0] pendingAdmin  signer, writable (must match config.pending_admin)
 * [1] slab          writable
 */
declare const ACCOUNTS_ACCEPT_ADMIN: readonly AccountSpec[];
/**
 * CloseSlab: 6 accounts
 * Drains vault and recovers rent after market is fully resolved and all accounts closed.
 * Program at percolator.rs:8033 calls expect_len(accounts, 6).
 * [0] dest            signer, writable (receives rent + drained vault tokens)
 * [1] slab            writable
 * [2] vault           writable (token account — drained)
 * [3] vaultAuthority  read-only (PDA that signs the drain transfer)
 * [4] destAta         writable (dest's token ATA receiving drained tokens)
 * [5] tokenProgram    read-only
 */
/**
 * CloseSlab for a market that has a SECONDARY collateral mint. 8 accounts.
 *
 * #381: `handle_close_slab` reads two MORE accounts — both `expect_writable` —
 * whenever `cfg.secondary_collateral_mint != [0u8; 32]`:
 *
 *   let secondary_close = if cfg_pre.secondary_collateral_mint != [0u8; 32] {
 *       let secondary_vault_token = account(accounts, 6)?;
 *       let secondary_dest_token  = account(accounts, 7)?;
 *
 * `ACCOUNTS_CLOSE_SLAB` above has six, so closing such a market fails with
 * `NotEnoughAccountKeys` — and only for markets that have used
 * `UpdateBaseUnitMints` (tag 60), which is why it went unnoticed.
 *
 * A separate template rather than two optional entries: the accounts are
 * required-or-forbidden, not optional. Passing them on a single-collateral
 * market is harmless (Solana ignores surplus accounts) but misleading, and the
 * caller already knows which market it holds.
 */
declare const ACCOUNTS_CLOSE_SLAB_SECONDARY: readonly AccountSpec[];
declare const ACCOUNTS_CLOSE_SLAB: readonly AccountSpec[];
/**
 * UpdateConfig: 3 accounts (canonical) or 4 (with oracle).
 * v12.19 wrapper at src/percolator.rs:9544 accepts either.
 * 3-account form: [admin(s+w), slab(w), clock].
 * 4-account form: [admin(s+w), slab(w), clock, oracle] (used when the wrapper
 * needs to re-read price during config commit). Default to the 3-account form;
 * callers that need oracle re-reads should append the oracle account themselves.
 */
declare const ACCOUNTS_UPDATE_CONFIG: readonly AccountSpec[];
/**
 * SetMaintenanceFee: 2 accounts
 */
declare const ACCOUNTS_SET_MAINTENANCE_FEE: readonly AccountSpec[];
/**
 * SetOraclePriceCap: 3 accounts.
 * v12.19 wrapper at src/percolator.rs:9654 calls accounts::expect_len(3).
 * Layout: [admin(s+w), slab(w), clock].
 */
declare const ACCOUNTS_SET_ORACLE_PRICE_CAP: readonly AccountSpec[];
/**
 * ResolveMarket (tag 19): 2 accounts.
 *
 * v17 wire account layout, VERIFIED against the deployed wrapper
 * percolator-prog@19d5d932 (program DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj),
 * `handle_resolve_market` at src/v16_program.rs:12269:
 *   [0] admin   signer            — `account(accounts, 0)` + `expect_signer(admin)`
 *   [1] market  writable          — `account(accounts, 1)` + `expect_writable` + `expect_owner`
 *
 * The v12.19 4-account layout this constant previously documented
 * ([admin(s+w), slab(w), clock, oracle], src/percolator.rs:9748) is stale on both
 * counts: the handler takes the slot from the `Clock::get()` syscall rather than a
 * clock account, and never touches an oracle account at all.
 *
 * `admin` is NOT writable: the handler calls `expect_signer(admin)` but never
 * `expect_writable(admin)`, and nothing debits it (ResolveMarket moves no
 * lamports). This matches ACCOUNTS_RESTART_ASSET_ORACLE, the closest analog —
 * also admin-gated, market-level, no token movement — which is
 * [authority(signer, !writable), market(writable)]. Marking a signer writable
 * when the program does not require it only widens the account's write lock.
 */
declare const ACCOUNTS_RESOLVE_MARKET: readonly AccountSpec[];
/**
 * WithdrawInsurance (tag 41): 6 fixed accounts + 1 optional.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw_insurance):
 *   [0] authority       signer, writable (insurance authority)
 *   [1] market          writable (market-group slab; program-owned)
 *   [2] destToken       writable (authority's collateral ATA — destination)
 *   [3] vaultToken      writable (program vault token account — source)
 *   [4] vaultAuthority  read-only (PDA that signs token CPI)
 *   [5] tokenProgram    read-only
 *   [6] ledger          writable, optional (per-authority InsuranceLedger PDA)
 *
 * v12 stale ordering fixed: vaultPda was at [5] after tokenProgram.
 * v17 layout: dest_token → vault_token → vault_authority → token_program.
 * Only callable on terminal markets (mode==1, materialized_portfolio_count==0).
 */
declare const ACCOUNTS_WITHDRAW_INSURANCE: readonly AccountSpec[];
/**
 * WithdrawInsuranceLimited (tag 23): 7 or 8 accounts.
 * On live markets the 8th oracle account is REQUIRED (upstream 8ce8d54):
 * the handler does a same-instruction accrue_market_to against the fresh
 * oracle price to prevent withdrawals against overstated insurance.
 * On resolved markets the oracle is frozen — 7 accounts suffice.
 */
declare const ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED: readonly AccountSpec[];
declare const ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE: readonly AccountSpec[];
/**
 * PauseMarket: 2 accounts
 */
declare const ACCOUNTS_PAUSE_MARKET: readonly AccountSpec[];
/**
 * UnpauseMarket: 2 accounts
 */
declare const ACCOUNTS_UNPAUSE_MARKET: readonly AccountSpec[];
/**
 * ReclaimEmptyAccount (tag 25): 2 accounts. Permissionless.
 * Wrapper: src/percolator.rs:10470.
 */
declare const ACCOUNTS_RECLAIM_EMPTY_ACCOUNT: readonly AccountSpec[];
/**
 * SettleAccount (tag 26): 3 accounts. Permissionless.
 * Wrapper: src/percolator.rs:10503.
 */
declare const ACCOUNTS_SETTLE_ACCOUNT: readonly AccountSpec[];
/**
 * DepositFeeCredits (tag 27): 6 accounts. Owner only.
 * Wrapper: src/percolator.rs:10557. SPL transfer requires userAta + vault writable.
 */
declare const ACCOUNTS_DEPOSIT_FEE_CREDITS: readonly AccountSpec[];
/**
 * ConvertReleasedPnl (tag 28): 3 base accounts + an optional NFT-holder trio.
 * Owner only. No token movement (internal PnL-bucket conversion within the
 * same portfolio).
 *
 * v17 wire account layout, VERIFIED against the deployed wrapper
 * percolator-prog@19d5d932 (program DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj):
 * `handle_convert_released_pnl` at src/v16_program.rs:11947 delegates its whole
 * account decode to `with_one_portfolio_view(program_id, accounts, true, ..)`
 * at src/v16_program.rs:17469, which reads:
 *   [0] owner      signer            — `expect_signer(owner)` (owner_must_sign = true)
 *   [1] market     writable          — `expect_writable` + `expect_owner`
 *   [2] portfolio  writable          — `expect_writable` + `expect_owner`
 *
 * The v12.19 4-account layout this constant previously documented
 * ([user(s+w), slab(w), clock, oracle], src/percolator.rs:10636) is stale: there
 * is no clock account (the handler needs no slot) and no oracle account.
 *
 * `owner` is NOT writable: `with_one_portfolio_view` calls `expect_signer(owner)`
 * but never `expect_writable(owner)`, and unlike ACCOUNTS_INIT_USER /
 * ACCOUNTS_CLOSE_ACCOUNT — whose owners ARE writable because they pay or receive
 * portfolio rent — this instruction moves no lamports at all.
 *
 * OPTIONAL NFT-HOLDER TRIO at base index 3: when the signer is not the owner but
 * holds the portfolio's bound (escrowed) position NFT, `with_one_portfolio_view`
 * reads `optional_nft_holder_accounts(accounts, 3)` and authorises via
 * `authorize_owner_or_nft_holder`. Compose it with `withNftHolderAuth()`:
 *   withNftHolderAuth(ACCOUNTS_CONVERT_RELEASED_PNL)
 */
declare const ACCOUNTS_CONVERT_RELEASED_PNL: readonly AccountSpec[];
/**
 * SetInsuranceWithdrawPolicy (tag 22): 2 accounts. Admin only.
 * Wrapper: src/percolator.rs:9990.
 */
declare const ACCOUNTS_SET_INSURANCE_WITHDRAW_POLICY: readonly AccountSpec[];
/**
 * UpdateAuthority (tag 83, v12.18.x 4-way split): 3 accounts.
 * Wrapper: src/percolator.rs:6876.
 *
 * Both the current authority and the new authority must sign. For burn
 * (`new_pubkey == default()`) the new account is still passed but does
 * not need to sign per wrapper L7036 region.
 */
declare const ACCOUNTS_UPDATE_AUTHORITY: readonly AccountSpec[];
/**
 * Build AccountMeta array from spec and provided pubkeys.
 *
 * Accepts either:
 *   - `PublicKey[]`  — ordered array, one entry per spec account (legacy form)
 *   - `Record<string, PublicKey>` — named map keyed by account `name` (preferred form)
 *
 * Named-map form resolves accounts by spec name so callers don't have to
 * remember the positional order, and errors clearly on missing names.
 */
declare function buildAccountMetas(spec: readonly AccountSpec[], keys: PublicKey[] | Record<string, PublicKey>): AccountMeta$1[];
/**
 * CreateInsuranceMint: 9 accounts
 * Creates SPL mint PDA for insurance LP tokens. Admin only, once per market.
 */
declare const ACCOUNTS_CREATE_INSURANCE_MINT: readonly AccountSpec[];
/**
 * DepositInsuranceLP: 8 accounts
 * Deposit collateral into insurance fund, receive LP tokens.
 */
declare const ACCOUNTS_DEPOSIT_INSURANCE_LP: readonly AccountSpec[];
/**
 * WithdrawInsuranceLP: 8 accounts
 * Burn LP tokens and withdraw proportional share of insurance fund.
 */
declare const ACCOUNTS_WITHDRAW_INSURANCE_LP: readonly AccountSpec[];
/**
 * LpVaultWithdraw: 10 accounts (tag 39, PERC-627 / GH#1926 / PERC-8287)
 *
 * Burn LP vault tokens and withdraw proportional collateral from the LP vault.
 *
 * accounts[9] = creatorLockPda is REQUIRED since percolator-prog PR#170.
 * Non-creator withdrawers must pass the derived PDA key; if no lock exists
 * on-chain the enforcement is a no-op. Omitting it was the bypass vector
 * fixed in GH#1926. Use `deriveCreatorLockPda(programId, slab)` to compute.
 *
 * Accounts:
 *  [0] withdrawer        signer, read-only
 *  [1] slab              writable
 *  [2] withdrawerAta     writable (collateral destination)
 *  [3] vault             writable (collateral source)
 *  [4] tokenProgram      read-only
 *  [5] lpVaultMint       writable (LP tokens burned from here)
 *  [6] withdrawerLpAta   writable (LP tokens source)
 *  [7] vaultAuthority    read-only (PDA that signs token transfers)
 *  [8] lpVaultState      writable
 *  [9] creatorLockPda    writable (REQUIRED — derived from ["creator_lock", slab])
 */
declare const ACCOUNTS_LP_VAULT_WITHDRAW: readonly AccountSpec[];
/**
 * FundMarketInsurance: 5 accounts (PERC-306)
 * Fund per-market isolated insurance balance.
 */
declare const ACCOUNTS_FUND_MARKET_INSURANCE: readonly AccountSpec[];
/**
 * SetInsuranceIsolation: 2 accounts (PERC-306)
 * Set max % of global fund this market can access.
 */
declare const ACCOUNTS_SET_INSURANCE_ISOLATION: readonly AccountSpec[];
/**
 * QueueWithdrawal: 5 accounts (PERC-309)
 * User queues a large LP withdrawal. Creates withdraw_queue PDA.
 */
declare const ACCOUNTS_QUEUE_WITHDRAWAL: readonly AccountSpec[];
/**
 * ClaimQueuedWithdrawal: 10 accounts (PERC-309)
 * Burns LP tokens and releases one epoch tranche of SOL.
 */
declare const ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL: readonly AccountSpec[];
/**
 * CancelQueuedWithdrawal: 3 accounts (PERC-309)
 * Cancels queue, closes withdraw_queue PDA, returns rent to user.
 */
declare const ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL: readonly AccountSpec[];
/**
 * ExecuteAdl: 4+ accounts (PERC-305, tag 50)
 * Permissionless — surgically close/reduce the most profitable position
 * when pnl_pos_tot > max_pnl_cap. For non-Hyperp markets with backup oracles,
 * pass additional oracle accounts at accounts[4..].
 */
declare const ACCOUNTS_EXECUTE_ADL: readonly AccountSpec[];
declare const ACCOUNTS_RESOLVE_PERMISSIONLESS: readonly AccountSpec[];
declare const ACCOUNTS_FORCE_CLOSE_RESOLVED: readonly AccountSpec[];
declare const ACCOUNTS_ADMIN_FORCE_CLOSE: readonly AccountSpec[];
/**
 * CloseStaleSlabs: 2 accounts (tag 51)
 * Admin closes a slab of an invalid/old layout and recovers rent SOL.
 */
declare const ACCOUNTS_CLOSE_STALE_SLABS: readonly AccountSpec[];
/**
 * ReclaimSlabRent: 2 accounts (tag 52)
 * Reclaim rent from an uninitialised slab. Both dest and slab must sign.
 */
declare const ACCOUNTS_RECLAIM_SLAB_RENT: readonly AccountSpec[];
/**
 * AuditCrank: 1 account (tag 53)
 * Permissionless. Verifies conservation invariants; pauses market on violation.
 */
declare const ACCOUNTS_AUDIT_CRANK: readonly AccountSpec[];
/**
 * AdvanceOraclePhase: 1 account
 * Permissionless — no signer required beyond fee payer.
 */
declare const ACCOUNTS_ADVANCE_ORACLE_PHASE: readonly AccountSpec[];
declare const ACCOUNTS_UPDATE_HYPERP_MARK: readonly AccountSpec[];
/**
 * CreateLpVault (tag 74): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_create_lp_vault):
 *   [0] admin          signer, writable (marketauth — pays for PDA creation)
 *   [1] market         read-only (market-group slab; program-owned)
 *   [2] registry       writable (LpVaultRegistry PDA — derived via deriveLpVaultRegistry())
 *   [3] lpMint         writable (LP share mint PDA — derived via deriveLpVaultMint())
 *   [4] systemProgram  read-only (required for create_account CPI)
 *   [5] tokenProgram   read-only
 *
 * v12 stale accounts removed: vaultAuthority, rent (Rent::get() used instead).
 * registry replaces lpVaultState; lpMint replaces lpVaultMint.
 */
declare const ACCOUNTS_CREATE_LP_VAULT: readonly AccountSpec[];
/**
 * DepositToLpVault (tag 75): 10 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_deposit_to_lp_vault):
 *   [0] depositor      signer, writable (LP depositor; pays for ledger creation)
 *   [1] market         writable (market-group slab; program-owned)
 *   [2] registry       writable (LpVaultRegistry PDA)
 *   [3] lpMint         writable (LP share mint PDA)
 *   [4] depositorLpAta writable (depositor's LP token ATA — receives minted shares)
 *   [5] sourceToken    writable (depositor's collateral ATA — source)
 *   [6] vaultToken     writable (program vault token account — destination)
 *   [7] ledger         writable (LpBackingLedger PDA; lazily created on first deposit)
 *   [8]  tokenProgram   read-only
 *   [9]  systemProgram  read-only (required for ledger create_account CPI)
 *   [10] siblingLedger  writable (LpBackingLedger PDA for `domain ^ 1`)
 *
 * v17 DUAL-DOMAIN: [10] is the OTHER pot's ledger. It is REQUIRED even when
 * uninitialised — NAV is summed across both pots, so omitting it understates NAV
 * and mints the depositor free shares at existing holders' expense. `ledger` at
 * [7] is always `registry.domain`'s; the instruction's `domain` argument selects
 * which of the two actually receives the backing.
 *
 * v12 stale accounts removed: vaultAuthority, lpVaultState. Added: ledger at [7],
 * systemProgram at [9]. registry replaces slab+lpVaultState. Reordered to match handler.
 */
declare const ACCOUNTS_LP_VAULT_DEPOSIT: readonly AccountSpec[];
/**
 * LpVaultCrankFees (tag 78): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_lp_vault_crank_fees):
 *   [0] cranker       signer, WRITABLE (permissionless; pays rent if the target
 *                     ledger must be created)
 *   [1] market        writable (market-group slab; program-owned)
 *   [2] registry      writable (LpVaultRegistry PDA)
 *   [3] ledger        writable (LpBackingLedger PDA for `registry.domain`)
 *   [4] siblingLedger writable (LpBackingLedger PDA for `domain ^ 1`)
 *   [5] systemProgram read-only (required to create a missing target ledger)
 *
 * v17 DUAL-DOMAIN: the instruction's `domain` argument picks which pot the fees
 * land in, and that pot's ledger is created on first use. Once deposits can be
 * routed, a vault whose money all went to the sibling has NO own-domain ledger,
 * so cranker had to become writable and the system program is now required.
 */
declare const ACCOUNTS_LP_VAULT_CRANK_FEES: readonly AccountSpec[];
/**
 * RebalanceLpVaultBacking (tag 91): 6 accounts.
 *
 * Moves IDLE (fresh, unliened) backing between the two pots of the vault's asset,
 * carrying ledger principal in lockstep. No tokens move.
 *
 *   [0] cranker       signer, WRITABLE (permissionless; pays rent if the
 *                     destination ledger must be created)
 *   [1] market        writable (market-group slab; program-owned)
 *   [2] registry      read-only (LpVaultRegistry PDA)
 *   [3] fromLedger    writable (LpBackingLedger PDA for `fromDomain`)
 *   [4] toLedger      writable (LpBackingLedger PDA for `toDomain`)
 *   [5] systemProgram read-only
 */
declare const ACCOUNTS_REBALANCE_LP_VAULT_BACKING: readonly AccountSpec[];
declare const ACCOUNTS_CHALLENGE_SETTLEMENT: readonly AccountSpec[];
declare const ACCOUNTS_RESOLVE_DISPUTE: readonly AccountSpec[];
declare const ACCOUNTS_DEPOSIT_LP_COLLATERAL: readonly AccountSpec[];
declare const ACCOUNTS_WITHDRAW_LP_COLLATERAL: readonly AccountSpec[];
declare const ACCOUNTS_SET_OFFSET_PAIR: readonly AccountSpec[];
declare const ACCOUNTS_ATTEST_CROSS_MARGIN: readonly AccountSpec[];
/**
 * SetOiImbalanceHardBlock: 2 accounts
 * Sets the OI imbalance hard-block threshold (admin only)
 */
declare const ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK: readonly AccountSpec[];
declare const ACCOUNTS_SET_MAX_PNL_CAP: readonly AccountSpec[];
declare const ACCOUNTS_SET_OI_CAP_MULTIPLIER: readonly AccountSpec[];
declare const ACCOUNTS_SET_DISPUTE_PARAMS: readonly AccountSpec[];
declare const ACCOUNTS_SET_LP_COLLATERAL_PARAMS: readonly AccountSpec[];
/**
 * MintPositionNft: 10 accounts
 * Creates a Token-2022 position NFT for an open position.
 */
declare const ACCOUNTS_MINT_POSITION_NFT: readonly AccountSpec[];
/**
 * TransferPositionOwnership: 8 accounts
 * Transfer position NFT and update on-chain owner. Requires pending_settlement == 0.
 */
declare const ACCOUNTS_TRANSFER_POSITION_OWNERSHIP: readonly AccountSpec[];
/**
 * BurnPositionNft: 7 accounts
 * Burns NFT and closes PositionNft + mint PDAs after position is closed.
 */
declare const ACCOUNTS_BURN_POSITION_NFT: readonly AccountSpec[];
/**
 * SetPendingSettlement: 3 accounts
 * Keeper/admin sets pending_settlement flag before funding transfer.
 * Protected by admin allowlist (GH#1475).
 */
declare const ACCOUNTS_SET_PENDING_SETTLEMENT: readonly AccountSpec[];
/**
 * ClearPendingSettlement: 3 accounts
 * Keeper/admin clears pending_settlement flag after KeeperCrank.
 * Protected by admin allowlist (GH#1475).
 */
declare const ACCOUNTS_CLEAR_PENDING_SETTLEMENT: readonly AccountSpec[];
declare const ACCOUNTS_TRANSFER_OWNERSHIP_CPI: readonly AccountSpec[];
/**
 * SetWalletCap: 2 accounts
 * Sets the per-wallet position cap (admin only). capE6=0 disables.
 */
declare const ACCOUNTS_SET_WALLET_CAP: readonly AccountSpec[];
declare const ACCOUNTS_RESCUE_ORPHAN_VAULT: readonly AccountSpec[];
declare const ACCOUNTS_CLOSE_ORPHAN_SLAB: readonly AccountSpec[];
/**
 * SetDexPool: 3 accounts
 * Admin pins the approved DEX pool address for a HYPERP market.
 * After this call, UpdateHyperpMark rejects any pool that does not match.
 */
declare const ACCOUNTS_SET_DEX_POOL: readonly AccountSpec[];
/**
 * InitMatcherCtx (tag 83): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_init_matcher_ctx):
 *   [0] lpOwner          signer (LP portfolio owner wallet)
 *   [1] market           read-only (program-owned market slab)
 *   [2] lpPortfolio      read-only (LP's portfolio; wrapper verifies provenance + owner)
 *   [3] matcherCtx       writable (320-byte account pre-created, owned by matcherProg)
 *   [4] matcherProg      read-only, executable (the external matcher program)
 *   [5] matcherDelegate  read-only (PDA derived via deriveMatcherDelegate(); wrapper signs it)
 *
 * PREREQUISITE: SetMatcherConfig (tag 68, enabled=1) must be called first — the wrapper
 * reads the LP portfolio's matcher config tail and verifies all three keys match before
 * calling the matcher CPI.
 *
 * The wrapper uses invoke_signed with the delegate seeds to make matcherDelegate a signer
 * in the inner CPI to the matcher's process_init (tag 2). No client-side signing of
 * matcherDelegate is needed — it is passed as a regular (non-signer) account here.
 */
declare const ACCOUNTS_INIT_MATCHER_CTX: readonly AccountSpec[];
/**
 * ConfigureHybridOracle (tag 34): 2 fixed accounts + variable oracle feed accounts.
 *
 * Fixed accounts:
 *   [0] oracleAuthority  signer (must be the asset's oracle_authority)
 *   [1] market           writable (program-owned market account)
 *
 * Dynamic accounts [2..2+oracle_leg_count]:
 *   oracle feed accounts (read-only). Pass 1-3 Pyth/on-chain price feed accounts
 *   matching the oracleLegFeeds pubkeys encoded in the instruction data.
 *
 * (v16_program.rs handle_configure_hybrid_oracle lines 10414-10438)
 */
declare const ACCOUNTS_CONFIGURE_HYBRID_ORACLE: readonly AccountSpec[];
/**
 * ConfigureEwmaMark (tag 35): 2 accounts.
 *
 *   [0] oracleAuthority  signer (must be the asset's oracle_authority)
 *   [1] market           writable (program-owned)
 *
 * No feed accounts needed — EWMA-mark is authority-pushed, not oracle-polled.
 * (v16_program.rs handle_configure_ewma_mark lines 10553-10557)
 */
declare const ACCOUNTS_CONFIGURE_EWMA_MARK: readonly AccountSpec[];
/**
 * PushEwmaMark (tag 36): 2 accounts.
 *
 *   [0] oracleAuthority  signer (must be the asset's oracle_authority)
 *   [1] market           writable (program-owned)
 *
 * (v16_program.rs handle_push_ewma_mark lines 10766-10770)
 */
declare const ACCOUNTS_PUSH_EWMA_MARK: readonly AccountSpec[];
/**
 * ConfigureAuthMark (tag 62): 2 accounts.
 *
 *   [0] oracleAuthority  signer (must be the asset's oracle_authority)
 *   [1] market           writable (program-owned)
 *
 * (v16_program.rs handle_configure_auth_mark lines 10660-10664)
 */
declare const ACCOUNTS_CONFIGURE_AUTH_MARK: readonly AccountSpec[];
/**
 * PushAuthMark (tag 63): 2 accounts.
 *
 *   [0] oracleAuthority  signer (must be the asset's oracle_authority)
 *   [1] market           writable (program-owned)
 *
 * (v16_program.rs handle_push_auth_mark lines 10842-10846)
 */
declare const ACCOUNTS_PUSH_AUTH_MARK: readonly AccountSpec[];
/**
 * SetMatcherConfig (tag 68): 3 accounts when disabling (enabled=0),
 * 6 accounts when enabling (enabled=1).
 *
 *   [0] lpOwner          signer (portfolio owner)
 *   [1] market           read-only (program-owned; owner-check only)
 *   [2] lpPortfolio      writable (program-owned portfolio)
 *   [3] matcherProg      read-only, executable (required when enabled=1 only)
 *   [4] matcherCtx       read-only (matcher context; owned by matcherProg; required when enabled=1)
 *   [5] matcherDelegate  read-only PDA (derived via deriveMatcherDelegate(); required when enabled=1)
 *
 * Note: accounts [3..5] are only validated by the on-chain handler when enabled=1.
 * When disabling (enabled=0), pass only accounts [0..2] or include [3..5] as no-ops.
 * (v16_program.rs handle_set_matcher_config lines 7516-7557)
 */
declare const ACCOUNTS_SET_MATCHER_CONFIG: readonly AccountSpec[];
/**
 * WithdrawProtocolFee (tag 84): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw_protocol_fee):
 *   [0] authority      signer, writable (must equal cfg.protocol_fee_authority)
 *   [1] market         writable (program-owned market-group slab)
 *   [2] destToken      writable (destination token account)
 *   [3] vaultToken     writable (program vault token account — source)
 *   [4] vaultAuthority read-only (PDA ["vault", market], derives via deriveVaultAuthority)
 *   [5] tokenProgram   read-only
 *
 * Pays out from the accrued-but-unwithdrawn protocol claim
 * (protocol_fee_accrued_atoms - protocol_fee_withdrawn_atoms). `amount == 0`
 * in the instruction data means "withdraw all currently-available capacity".
 * No insurance-withdraw-cooldown gate (that mechanism guards creator-facing
 * domain budgets; the protocol's claim is a separate, non-domain balance).
 */
declare const ACCOUNTS_WITHDRAW_PROTOCOL_FEE: readonly AccountSpec[];
/**
 * SetProtocolFeeAuthority (tag 85): 3 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_set_protocol_fee_authority):
 *   [0] upgradeAuthority signer (must equal the program's BPF upgrade authority)
 *   [1] programData      read-only (ProgramData PDA under bpf_loader_upgradeable,
 *                         seeds [program_id])
 *   [2] market            writable (program-owned market-group slab)
 *
 * Rotates cfg.protocol_fee_authority. Gated on the program's upgrade
 * authority — NOT marketauth, NOT insurance_authority, NOT any
 * creator-facing gate. No global fan-out: call once per market.
 */
declare const ACCOUNTS_SET_PROTOCOL_FEE_AUTHORITY: readonly AccountSpec[];
/**
 * UpdateFeeSplit (tag 86): 2 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_update_fee_split):
 *   [0] admin  signer   (must match cfg.marketauth via expect_live_authority)
 *   [1] market writable (program-owned market-group slab)
 *
 * Mirrors the neighbouring marketauth-gated single-field setters
 * (handle_update_fee_redirect_policy, handle_update_market_init_fee_policy) —
 * signer/writable/owner checks, then `expect_live_authority(&cfg.marketauth)`.
 *
 * ⚠ After `StakeInitPool` rotates cfg.marketauth to the stake-pool PDA, this
 * layout is unreachable at top level; use the stake CPI proxy (stake tag 25),
 * whose layout is ACCOUNTS_STAKE_ADMIN_UPDATE_FEE_SPLIT in solana/stake.ts.
 */
declare const ACCOUNTS_UPDATE_FEE_SPLIT: readonly AccountSpec[];
/**
 * WithdrawInsuranceReserveToStake (tag 87): 7 accounts.
 *
 * v17 wire account layout (v16_program.rs
 * handle_withdraw_insurance_reserve_to_stake):
 *   [0] cranker         signer   (permissionless — any signer, pays fees only)
 *   [1] market          writable (program-owned market-group slab)
 *   [2] stakePool       read-only (PDA ["stake_pool", market] under the
 *                        wrapper's PINNED stake program id; its owner is
 *                        asserted BEFORE any byte is read — the forgery gate)
 *   [3] stakeVault      writable (must equal pool.vault, read out of [2])
 *   [4] vaultToken      writable (this market's collateral vault token acct)
 *   [5] vaultAuthority  read-only (PDA derived by derive_vault_authority)
 *   [6] tokenProgram    read-only
 *
 * Note [2] is NOT writable — the wrapper only reads the pool to derive the
 * destination; percolator-stake's own AccrueFees is what later credits it.
 *
 * Failure codes are deliberately distinct so a keeper can tell the cases
 * apart: Custom(53) NoInsuranceReserveToClaim, Custom(54) StakePoolNotBound,
 * Custom(55) StakePoolOwnerMismatch, Custom(56) StakePoolAuthorityMismatch,
 * Custom(57) StakePoolMarketMismatch, Custom(58) StakePoolWrapperMismatch,
 * Custom(59) StakePoolModeMismatch, Custom(60) StakeProgramNotPinned.
 */
declare const ACCOUNTS_WITHDRAW_INSURANCE_RESERVE_TO_STAKE: readonly AccountSpec[];
/**
 * UpdateMaintenanceFeePerSlot (tag 88): 2 accounts.
 *
 * v17 wire account layout (v16_program.rs
 * handle_update_maintenance_fee_per_slot) — identical to tag 86:
 *   [0] admin  signer   (must match cfg.marketauth)
 *   [1] market writable (program-owned market-group slab)
 *
 * ⚠ The instruction payload is a u128, not a u64. See
 * encodeUpdateMaintenanceFeePerSlot in abi/instructions.ts.
 *
 * Same StakeInitPool reachability caveat as tag 86; proxy is stake tag 26.
 */
declare const ACCOUNTS_UPDATE_MAINTENANCE_FEE_PER_SLOT: readonly AccountSpec[];
/**
 * UpdateTradeFeePolicy (tag 55): 2 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_update_trade_fee_policy):
 *   [0] authority signer (must match ASSET 0's insurance_authority — NOT
 *                  cfg.marketauth)
 *   [1] market    writable (program-owned market-group slab)
 *
 * Mirrors ACCOUNTS_UPDATE_BACKING_FEE_POLICY (tag 51), which shares the
 * asset-0 insurance_authority gate. Stranded by BindInsuranceAuthority rather
 * than by StakeInitPool; proxy is stake tag 28.
 *
 * NOTE: `writable: true` on [0] matches the existing tag-51 spec and reflects
 * the authority normally also being the fee payer. The program itself only
 * calls `expect_signer(authority)` — it never writes to this account.
 */
declare const ACCOUNTS_UPDATE_TRADE_FEE_POLICY: readonly AccountSpec[];
/**
 * ExpireBackingBucket (tag 89): 1 account. PERMISSIONLESS.
 *
 * v17 wire account layout (v16_program.rs handle_expire_backing_bucket):
 *   [0] market writable (program-owned market-group slab)
 *
 * That is the WHOLE list. The handler reads `account(accounts, 0)` and applies
 * exactly `expect_writable` + `expect_owner(market, program_id)`. There is NO
 * `expect_signer` anywhere in it, and no token/vault/authority account — the
 * instruction moves no tokens. The transaction still needs a fee payer, but
 * that signer is not an account of this instruction and is not checked against
 * anything.
 *
 * This is deliberate: a bricked market must be recoverable by ANY keeper, not
 * only by an authority that may be a cold key or a stake-pool PDA. The
 * safety gate is the engine's own precondition (bucket `Fresh` AND lapsed
 * against the runtime `Clock`), not an authority check. See
 * encodeExpireBackingBucket in abi/instructions.ts for the keeper contract and
 * the failure codes — Custom(21) not-Live, Custom(9) domain out of range,
 * Custom(19) bucket not `Fresh`-and-lapsed.
 */
declare const ACCOUNTS_EXPIRE_BACKING_BUCKET: readonly AccountSpec[];
/**
 * WithdrawCreatorFee (tag 90): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw_creator_fee) —
 * BYTE-FOR-BYTE THE SAME SHAPE AS ACCOUNTS_WITHDRAW_PROTOCOL_FEE (tag 84);
 * only the authority the program checks [0] against differs:
 *   [0] authority      signer, writable (must equal ASSET 0's insurance_operator)
 *   [1] market         writable (program-owned market-group slab)
 *   [2] destToken      writable (destination token account, owned by [0])
 *   [3] vaultToken     writable (program vault token account — source)
 *   [4] vaultAuthority read-only (PDA ["vault", market], derives via deriveVaultAuthority)
 *   [5] tokenProgram   read-only
 *
 * The handler applies expect_signer([0]) + expect_writable([1],[2],[3]) +
 * expect_owner([1], program_id) + verify_token_program([5]) + expect_key on the
 * derived vault authority. `writable: true` on [0] mirrors the tag-84 spec and
 * reflects the authority normally also being the transaction fee payer; the
 * program itself only calls expect_signer on it.
 *
 * ⚠ AUTHORITY IS asset 0's `insurance_operator`, NOT `cfg.marketauth` — and it
 * does NOT accept marketauth as an alternate the way
 * verify_domain_withdrawal_preflight does. That divergence is deliberate: on a
 * staked market marketauth IS the stake-pool PDA, so accepting it would let the
 * pool claim the creator's revenue. It also means claiming keeps working after
 * StakeInitPool, since staking never rotates insurance_operator.
 *
 * Pays out of `creator_fee_claimable_atoms` (WrapperConfigV17 byte 568) by an
 * EXACT debit — no withdraw-all sentinel, no partial fill, no
 * insurance-withdraw cooldown or backstop-health gate (this counter is disjoint
 * from the loss backstop, so backstop gating does not apply).
 */
declare const ACCOUNTS_WITHDRAW_CREATOR_FEE: readonly AccountSpec[];
/**
 * CloseResolved (tag 30): 7 base accounts. SIGNED path — `owner` (accounts[0])
 * signs directly. Safe against both the deployed v18.0 wrapper and the staged
 * v18.1-security candidate; unaffected by percolator-prog#497/#498.
 *
 * v17 wire account layout, verified against `handle_close_resolved` in
 * `percolator-prog/src/v16_program.rs`, identical on deployed `a9318945` and
 * candidate `3262608b`:
 *   [0] owner          (not writable — no `expect_writable(owner)` in the handler;
 *                        used as the claimed portfolio owner / payout-ATA owner)
 *   [1] market         writable  — `expect_writable` + `expect_owner`
 *   [2] portfolio      writable  — `expect_writable` + `expect_owner`
 *   [3] destToken      writable  — only touched when `payout != 0`
 *   [4] vaultToken     writable  — only touched when `payout != 0`
 *   [5] vaultAuthority read-only — PDA `["vault", market]`, only touched when `payout != 0`
 *   [6] tokenProgram   read-only — only touched when `payout != 0`
 *
 * `owner` need not sign in general (`CloseResolved` is permissionless — anyone
 * may crank a resolved position closed once `group.header.mode == Resolved`),
 * EXCEPT while `cfg.force_close_delay_slots != 0` and that delay has not yet
 * elapsed since `resolved_slot`, in which case the handler calls
 * `expect_signer(owner)`. This constant models the base 7-account shape with
 * `owner` marked as a signer, matching the common "owner closes their own
 * position" flow; a permissionless/unsigned caller building this instruction
 * for a NON-escrowed portfolio may still pass this exact 7-account list with
 * `owner.isSigner` cleared and no trailing accounts — the v18.0/v18.1 handlers
 * both accept that shape identically for a non-escrowed portfolio. Use
 * `ACCOUNTS_CLOSE_RESOLVED_UNSIGNED` (HARD STOP — v18.1+ only) when the caller
 * cannot prove in advance that the portfolio isn't escrowed and wants the new
 * #497 registry proof to fail closed instead.
 *
 * The pre-existing E2 signed-NFT-holder path also applies to this instruction
 * (the handler's own comment reads "NFT trio at base 7"): compose it exactly
 * like every other E2 instruction via `withNftHolderAuth(ACCOUNTS_CLOSE_RESOLVED)`
 * for a 10-account list (`[7]=nftRegistry, [8]=positionNft, [9]=signerNftAta`)
 * when the CURRENT NFT HOLDER (not `portfolio.owner`) is the one signing.
 */
declare const ACCOUNTS_CLOSE_RESOLVED: readonly AccountSpec[];
/**
 * ClaimResolvedPayoutTopup (tag 46): 7 base accounts. SIGNED path — mirror of
 * `ACCOUNTS_CLOSE_RESOLVED` above; see that doc comment for the full account-by-
 * account rationale. `handle_claim_resolved_payout_topup` reads the identical
 * `account(accounts, 0..=6)` shape and is fully permissionless (no
 * `force_close_delay_slots` gate exists for this instruction — `owner` need
 * never sign for a non-escrowed portfolio).
 *
 * The pre-existing E2 signed-NFT-holder path applies here too:
 * `withNftHolderAuth(ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP)` for the 10-account
 * holder-signs variant (`[7]=nftRegistry, [8]=positionNft, [9]=signerNftAta`).
 */
declare const ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP: readonly AccountSpec[];
/**
 * percolator-prog#497/#498 single-account NftRegistry proof: `["nft_registry",
 * marketGroup]` PDA (derive with `deriveNftRegistry()` from `../solana/pda.js`),
 * read-only, presented alone (NOT the 3-account `ACCOUNTS_NFT_HOLDER_AUTH` trio)
 * so `require_signer_for_escrowed_terminal_payout` can confirm an unsigned
 * `CloseResolved` / `ClaimResolvedPayoutTopup` caller's portfolio is not bound
 * to NFT escrow. See the HARD STOP block above this section — do not use before
 * the v18.1-security wrapper deploy.
 */
declare const ACCOUNTS_NFT_ESCROW_PROOF: readonly AccountSpec[];
/**
 * Append the single-account #497/#498 NftRegistry proof to a base account list,
 * for the UNSIGNED `CloseResolved` / `ClaimResolvedPayoutTopup` call path.
 *
 * Unlike `withNftHolderAuth()` (which appends the 3-account trio so a signing
 * NFT holder can authorize an action), this appends exactly ONE account — the
 * registry alone proves the portfolio is not escrowed; it never claims holder
 * authorization, so no `positionNft` / `signerNftAta` accounts are needed or
 * read for this check.
 *
 * HARD STOP — do not call this to build a live instruction before the v18.1
 * wrapper deploy (tracks percolator-prog#498). See the HARD STOP block above.
 */
declare function withNftEscrowProof(base: readonly AccountSpec[]): AccountSpec[];
/**
 * CloseResolved (tag 30): UNSIGNED / permissionless path, 8 accounts —
 * `ACCOUNTS_CLOSE_RESOLVED` with `owner` NOT signing, plus the #497/#498
 * NftRegistry proof at index 7 (`withNftEscrowProof`).
 *
 * HARD STOP — do NOT merge a call site that uses this, and do NOT submit a
 * transaction built from it, before the `v18.1-security` wrapper (or whatever
 * supersedes it) is deployed (tracks percolator-prog#498 / #497). Against the
 * currently deployed v18.0 wrapper (`a9318945`), this account list does not add
 * the protection it is meant to enable: `require_signer_for_escrowed_terminal_payout`
 * does not exist on v18.0, so an escrowed portfolio's payout can still be
 * silently burned via this exact unsigned shape. Once v18.1 is live, this is
 * the correct 8-account list for a permissionless caller closing a resolved
 * position it does not own and cannot get a signature for.
 */
declare const ACCOUNTS_CLOSE_RESOLVED_UNSIGNED: readonly AccountSpec[];
/**
 * ClaimResolvedPayoutTopup (tag 46): UNSIGNED / permissionless path, 8
 * accounts — mirror of `ACCOUNTS_CLOSE_RESOLVED_UNSIGNED` above.
 *
 * HARD STOP — same constraint as `ACCOUNTS_CLOSE_RESOLVED_UNSIGNED`: do not
 * merge or use before the v18.1-security wrapper deploy (tracks
 * percolator-prog#498 / #497).
 */
declare const ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP_UNSIGNED: readonly AccountSpec[];
declare const WELL_KNOWN: {
    readonly tokenProgram: PublicKey;
    readonly clock: PublicKey;
    readonly rent: PublicKey;
    readonly systemProgram: PublicKey;
};

/**
 * Percolator v17 program error definitions.
 *
 * Source: v16_program.rs PercolatorError enum (lines 174-226 in v17 wrapper).
 * Ordinals 0-29 = toly base errors; 30-41 = fork LP-vault; 42-46 = fork NFT/B-3;
 * 47-48 = insurance withdrawal policy (F-1/F-2); 49 = EngineInsufficientInitialMargin;
 * 50 = LpVaultDepositBelowMinimumLiquidity (N7 dead-share floor); 51 =
 * FeeSplitFloorViolation (creator/LP/insurance split floor, meaning narrowed to
 * tag 86 — see its entry); 52-53 = fee-collection split; 54-60 =
 * load_bound_stake_pool diagnostics; 61 = AssetSlotAlreadyConfigured;
 * 62 = CreatorFeeOverClaim (creator fee claim, tag 90 — NOT yet deployed).
 *
 * Ordinals 0-61 read directly off the PercolatorError enum in
 * percolator-prog@10acb5ae, which is the source deployed to devnet wrapper
 * DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj (hash-verified
 * 6b2fda2363352aba0ef88abde0d398f9dd477b1208507e7e8393586ed5458931).
 * Ordinal 49 is CONFIRMED against that enum; an earlier "discriminant
 * tentative" TODO here is resolved.
 *
 * INVARIANT: ordinals must NOT be reordered (Rust enum discriminants are
 * sequential from 0). CI asserts each ordinal in tests/v16_kani.rs.
 *
 * v17 breaking changes vs v12.x:
 *   - Errors 0-29 have completely different names and semantics from v12.
 *   - Errors 30-41 are LP-vault (moved from v12.x range 30-41 to same ordinals).
 *   - Errors 42-46 are NFT/B-3 (new in v17).
 *   - v12.x errors 28-65 are entirely removed.
 */
interface ErrorInfo {
    name: string;
    hint: string;
}
declare const PERCOLATOR_ERRORS: Record<number, ErrorInfo>;
/**
 * Decode a custom program error code to its info.
 *
 * @param code Custom error code from `custom program error: 0x<hex>`.
 * @returns ErrorInfo with name and hint, or undefined if the code is not recognized.
 */
declare function decodeError(code: number): ErrorInfo | undefined;
/**
 * Get error name from code.
 *
 * @param code Custom error code.
 * @returns Human-readable error name, or "Unknown(<code>)" if not recognized.
 */
declare function getErrorName(code: number): string;
/**
 * Get actionable hint for error code.
 *
 * @param code Custom error code.
 * @returns Actionable hint string, or undefined if not recognized.
 */
declare function getErrorHint(code: number): string | undefined;
/**
 * Parse a custom program error from transaction logs.
 *
 * Looks for "Program ... failed: custom program error: 0x..." in the log lines.
 * Returns null if no custom error is found.
 *
 * @param logs Array of transaction log strings from the RPC response.
 * @returns Parsed error with code, name, and hint — or null if not found.
 *
 * @example
 * ```ts
 * const err = parseErrorFromLogs(txResult.meta?.logMessages ?? []);
 * if (err) console.error(`${err.name}: ${err.hint}`);
 * ```
 */
declare function parseErrorFromLogs(logs: string[]): {
    code: number;
    name: string;
    hint?: string;
} | null;

/**
 * Standalone percolator-nft program SDK module.
 *
 * This covers the NFT program at `PERCOLATOR_NFT_PROGRAM_ID` which is
 * separate from the main Percolator program. It handles:
 *   - MintPositionNft (tag 0)
 *   - BurnPositionNft (tag 1)
 *   - SettleFunding   (tag 2)
 *   - GetPositionValue (tag 3)
 *   - ExecuteTransferHook (tag 4, SPL interface — not called directly)
 *   - EmergencyBurn   (tag 5)
 *   - RepairExtraMetas (tag 6)
 *   - ReconcileBurnedNft (tag 7)
 *
 * PDA seeds (matches percolator-nft/src/state_v16.rs):
 *   PositionNft state : ["position_nft", portfolio_account, market_id_u64_LE]
 *   Mint authority    : ["mint_authority"]
 *
 * NOTE: the PositionNft seed is keyed on `market_id`, NOT `asset_index` — see
 * #108 and `deriveNftPda` below. This header claimed `asset_index_u16_LE` until
 * 2026-08-31; the code was always correct.
 */

/**
 * The standalone percolator-nft program (TransferHook + mint authority).
 *
 * Derived from `PROGRAM_IDS_V17.nft` rather than carrying its own literal, so this constant
 * and `program-ids.ts` cannot drift apart. They previously did: this defaulted to the MAINNET
 * address while every other id in the SDK is devnet, so any consumer importing it built
 * transactions against a program that does not exist on devnet and failed late with
 * "Account not found on-chain". The frontend hit exactly that and had to define its own
 * constant to work around it.
 */
declare const NFT_PROGRAM_ID: PublicKey;
declare function getNftProgramId(): PublicKey;
declare const NFT_IX_TAG: {
    readonly MintPositionNft: 0;
    readonly BurnPositionNft: 1;
    readonly SettleFunding: 2;
    readonly GetPositionValue: 3;
    readonly ExecuteTransferHook: 4;
    readonly EmergencyBurn: 5;
    readonly RepairExtraMetas: 6;
    readonly ReconcileBurnedNft: 7;
};
/** Encode MintPositionNft (tag 0). Data: tag(1) + asset_index(u16). */
declare function encodeNftMint(assetIndex: number): Uint8Array;
/** Encode BurnPositionNft (tag 1). Data: tag(1). */
declare function encodeNftBurn(): Uint8Array;
/** Encode SettleFunding (tag 2). Data: tag(1). */
declare function encodeNftSettleFunding(): Uint8Array;
/** Encode EmergencyBurn (tag 5). Data: tag(1). */
declare function encodeNftEmergencyBurn(): Uint8Array;
/**
 * Encode ReconcileBurnedNft (tag 7, #138). Data: tag(1). Permissionless: releases
 * a position stranded by an out-of-band Token-2022 Burn (supply==0, escrow not
 * released) back to the recorded last holder, then closes the PositionNft PDA.
 */
declare function encodeNftReconcile(): Uint8Array;
type AccountMeta = "s" | "w" | "sw" | "r";
/**
 * BUG FOUND + FIXED (2026-07-16, uncommitted, branch feat/protocol-fee-v17):
 * the shorthand `AccountMeta` codes above ("s"|"w"|"sw"|"r") are a DIFFERENT,
 * incompatible type from `AccountSpec` (`{name, signer, writable}`) used by
 * `buildAccountMetas()` in `./accounts.js`. Passing `ACCOUNTS_NFT_MINT` /
 * `ACCOUNTS_NFT_BURN` / etc. into `buildAccountMetas()` silently produces
 * `isSigner: undefined` and `isWritable: undefined` for every account
 * (`spec.signer` / `spec.writable` read off a plain string) — Solana coerces
 * both to falsy, so EVERY account in the built instruction ends up
 * non-signer/read-only. The NFT program's own writable/signer checks then
 * reject the transaction (confirmed live against the deployed NFT program:
 * MintPositionNft fails with `InvalidAccountData` at ~2.4k CU, before any
 * CPI — matching its `if !nft_pda.is_writable { return
 * Err(InvalidAccountData) }`-style guards in percolator-nft/src/processor.rs).
 *
 * Use `buildNftAccountMetas()` below with these shorthand arrays instead of
 * `buildAccountMetas()` from `./accounts.js`. No consumer in this repo (or
 * percolator-launch, grepped) was actually calling `buildAccountMetas()` with
 * these arrays and working — the only prior working reference
 * (playground/flowtest/07-nft-mint.ts) builds the account list by hand,
 * bypassing the mismatch entirely.
 */
declare function buildNftAccountMetas(spec: readonly AccountMeta[], keys: readonly PublicKey[]): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Account metas for MintPositionNft (tag 0). 12 accounts.
 *
 *   0. [signer, writable]  payer / position owner
 *   1. [writable]          PositionNft PDA (created)
 *   2. [writable, signer]  NFT mint (Token-2022, fresh keypair)
 *   3. [writable]          Owner's NFT ATA (created)
 *   4. [writable]          Portfolio account (#105: B-3 escrow CPI mutates owner)
 *   5. []                  Mint authority PDA
 *   6. []                  Token-2022 program
 *   7. []                  Associated token account program
 *   8. []                  System program
 *   9. [writable]          ExtraAccountMetaList PDA
 *  10. []                  Per-market NftRegistry PDA (#109 — was missing from this template)
 *  11. []                  Percolator wrapper program (#105 — escrow CPI target)
 *
 * #105 escrow-at-mint: mint now CPIs the wrapper's B-3 TransferPortfolioOwnership
 * to escrow the position to the NFT program's mint-authority PDA, so #4 must be
 * writable and #10/#11 are required.
 */
declare const ACCOUNTS_NFT_MINT: AccountMeta[];
/**
 * Account metas for BurnPositionNft (tag 1). 10 accounts.
 *
 *   0. [signer, writable]  NFT holder (rent recipient — receives the ATA, mint,
 *                          PositionNft PDA and ExtraAccountMetaList rent)
 *   1. [writable]  PositionNft PDA (closed)
 *   2. [writable]  NFT mint (supply → 0)
 *   3. [writable]  Holder's NFT ATA (closed)
 *   4. [writable]  Portfolio account (#105: UnwrapEscrowedPortfolio CPI mutates owner)
 *   5. []          Mint authority PDA
 *   6. []          Token-2022 program
 *   7. [writable]  ExtraAccountMetaList PDA (closed on burn — rent refunded to holder; #102)
 *   8. []          Per-market NftRegistry PDA (#105 — unwrap CPI)
 *   9. []          Percolator wrapper program (#105 — unwrap CPI target)
 *
 * #105 escrow-at-mint: burn now CPIs the wrapper's UnwrapEscrowedPortfolio to
 * release the escrow back to the holder, so #4 must be writable and #8/#9 are required.
 */
declare const ACCOUNTS_NFT_BURN: AccountMeta[];
/**
 * Account metas for EmergencyBurn (tag 5). 10 accounts.
 *
 *   0. [signer, writable]  NFT holder (rent recipient)
 *   1. [writable]  PositionNft PDA (closed)
 *   2. [writable]  NFT mint
 *   3. [writable]  Holder's NFT ATA
 *   4. [writable]  Portfolio account (#105: UnwrapEscrowedPortfolio CPI mutates owner)
 *   5. []          Mint authority PDA
 *   6. []          Token-2022 program
 *   7. [writable]  ExtraAccountMetaList PDA (closed on burn — rent refunded to holder; #102)
 *   8. []          Per-market NftRegistry PDA (#105 — unwrap CPI)
 *   9. []          Percolator wrapper program (#105 — unwrap CPI target)
 */
declare const ACCOUNTS_NFT_EMERGENCY_BURN: AccountMeta[];
/**
 * Account metas for ReconcileBurnedNft (tag 7, #138). 9 accounts. Permissionless.
 *
 *   0. [writable]  PositionNft PDA (closed)
 *   1. [writable]  NFT mint (Token-2022 — supply must be 0; closed, #182)
 *   2. [writable]  Portfolio account (escrow released to the last holder)
 *   3. []          Mint authority PDA (unwrap + mint-close CPI signer)
 *   4. []          Per-market NftRegistry PDA
 *   5. []          Percolator wrapper program (unwrap CPI target)
 *   6. [writable]  Recorded last-holder wallet (escrow + all rent recipient)
 *   7. [writable]  ExtraAccountMetaList PDA (closed, #182)
 *   8. []          Token-2022 program (mint-close CPI target, #182)
 *
 * dcccrypto/percolator-nft#182: Reconcile previously abandoned the NFT mint and
 * the ExtraAccountMetaList PDA — 7,676,880 lamports per NFT, unrecoverable,
 * because it closes the PositionNft PDA and every path that could later reclaim
 * those two requires it to still be live. Accounts 7 and 8 are REQUIRED rather
 * than optional: Reconcile is permissionless, irreversible and runs at most
 * once, so an opt-in could be defeated permanently by whoever called first.
 *
 * Forward-compatible with the currently deployed programs: their handler pulls
 * seven accounts off an iterator and never checks `accounts.len()`, so the two
 * extra metas are simply unread, and it never checks `nft_mint.is_writable`.
 * A nine-account call therefore behaves identically on both, which is why this
 * can ship ahead of the program change rather than behind it.
 */
declare const ACCOUNTS_NFT_RECONCILE: AccountMeta[];
/**
 * Derive the PositionNft state PDA.
 * Seeds: ["position_nft", portfolio_account, market_id_u64_LE]
 *
 * #108: the seed is keyed on the position-instance `marketId` (the engine's
 * monotonic, never-reused `legs[].market_id`), NOT `asset_index` — which the
 * engine reuses across close/re-open of the same asset and which therefore
 * aliased the PDA (a stale NFT could squat the slot and brick re-wrapping the
 * new position). Pass `marketId` = the active leg's `market_id` at mint, or the
 * NFT's stored `marketIdAtMint` for any later op.
 */
declare function deriveNftPda(portfolioAccount: PublicKey, marketId: bigint | number, programId?: PublicKey): [PublicKey, number];
/**
 * @deprecated v16 Position NFT mints are fresh signer keypairs, not PDAs.
 */
declare function deriveNftMint(_portfolioAccount: PublicKey, _assetIndex: number, _programId?: PublicKey): [PublicKey, number];
/**
 * Derive the program-wide mint authority PDA.
 * Seeds: ["mint_authority"]
 */
declare function deriveMintAuthority(programId?: PublicKey): [PublicKey, number];
/**
 * Derive the Token-2022 ExtraAccountMetaList PDA for a Position NFT mint.
 * Seeds: ["extra-account-metas", nft_mint]. This is account #9 of MintPositionNft
 * and (since #102) account #7 of BurnPositionNft / EmergencyBurn — the burn paths
 * close it and refund its rent to the holder.
 */
declare function deriveExtraAccountMetas(nftMint: PublicKey, programId?: PublicKey): [PublicKey, number];
/**
 * On-chain PositionNftV16 state (199 bytes, matches percolator-nft/src/state_v16.rs).
 *
 *   [0..8]     magic             u64 ("PERCNFT\0")
 *   [8]        version           u8
 *   [9]        bump              u8
 *   [10..42]   portfolio_account [u8; 32]
 *   [42..74]   nft_mint          [u8; 32]
 *   [74..78]   asset_index       u32 LE
 *   [78]       side_at_mint      u8
 *   [79..95]   basis_pos_q_at_mint i128
 *   [95..111]  f_snap_at_mint    i128
 *   [111..119] market_id_at_mint u64
 *   [119..127] epoch_snap_at_mint u64
 *   [127..159] position_owner_at_mint [u8; 32]
 *   [159..167] minted_at         i64
 *   [167..199] last_holder       [u8; 32]
 *
 * NOTE: [167..199] is `last_holder`, not reserved space. #138 claimed those
 * bytes for the field the transfer hook rewrites on every transfer, and
 * `ReconcileBurnedNft` reads it to decide who receives the released escrow and
 * the rent — it is account 6 of that instruction and cannot be derived, only
 * read from here.
 */
declare const POSITION_NFT_STATE_LEN = 199;
interface PositionNftState {
    version: number;
    bump: number;
    portfolioAccount: PublicKey;
    nftMint: PublicKey;
    assetIndex: number;
    sideAtMint: number;
    basisPosQAtMint: bigint;
    fSnapAtMint: bigint;
    marketIdAtMint: bigint;
    epochSnapAtMint: bigint;
    positionOwnerAtMint: PublicKey;
    /** Backward-compatible alias for positionOwnerAtMint. */
    positionOwner: PublicKey;
    mintedAt: bigint;
    /**
     * The wallet the transfer hook last recorded as holding this NFT (#138).
     *
     * This is the sole authorisation for `ReconcileBurnedNft`: the program
     * releases the escrowed portfolio and all rent to whichever account matches
     * it, and refuses any other. Supply it as account 6 of
     * `ACCOUNTS_NFT_RECONCILE` — there is no way to derive it.
     */
    lastHolder: PublicKey;
}
/**
 * Parse a PositionNft account from raw bytes.
 * @throws if data is shorter than POSITION_NFT_STATE_LEN (199 bytes) or has an invalid magic/version.
 */
declare function parsePositionNftAccount(data: Uint8Array): PositionNftState;

/**
 * Matcher v2 (P2) client ABI — additive to SDK 8.0.0.
 *
 * Source of truth: `percolator-match` branch `feat/p2-matcher-v2` @ `4a0f696`
 * (draft percolator-match#30): `src/v2.rs` (`CallExt`, `V2Config`, `V2Block`,
 * `validate_config`, `default_config_for_kind2`), `src/vamm.rs`
 * (`process_configure`, `SetParams::{parse,encode}`), `src/lib.rs`
 * (`FLAG_REQUESTED_FEE_*`). Every byte below is pinned by
 * `test/matcher-v2.test.ts` against the hex emitted by that branch's
 * `cargo run --bin sdk_parity_fixtures_v2`.
 *
 * STATUS: targets instructions NOT on the relaunch programs yet. The relaunch set is the
 * P1+P3 wrapper (`58e379f1`) + F-9 stake (`d13b5a9`); the matcher stays v1 (`4seJWjv3…` @
 * `12bd671`) unless P2 (percolator-match#30) ships with it. A v1 matcher rejects tag 5
 * (InvalidInstructionData) and any non-zero byte in 43..67 of a tag-0 call — only send
 * tag 5 / the call extension to a v2 matcher (see {@link isMatcherCtxV2}), and keep
 * `AssetRiskLimitsV17.matcher_ext_mode` / `max_requested_fee_bps` at 0 until then.
 *
 * P3 VAULT-OWNED LP: tag 5 can NEVER configure the vault LP's matcher context. Owner-proof
 * (auth 1) needs the LP OWNER to sign, and the vault LP's owner is the LP-vault registry PDA,
 * which nothing can sign for; auth 0 needs the wrapper's delegate PDA. The vault LP's matcher
 * params are set only through wrapper tag 95 (VaultLpSetMatcher, upgrade authority).
 *
 * @module matcher-v2
 */

/** Matcher instruction tag 5 — Configure (`MATCHER_CONFIGURE_TAG`). */
declare const MATCHER_CONFIGURE_TAG = 5;
/** Tag-5 auth mode 0: the ctx's `lp_pda` signs directly (direct, non-wrapper contexts). */
declare const MATCHER_CONFIGURE_AUTH_LP_PDA = 0;
/** Tag-5 auth mode 1: owner-proof — the LP owner signs and the matcher re-derives `lp_pda`. */
declare const MATCHER_CONFIGURE_AUTH_OWNER_PROOF = 1;
/** Header length for auth mode 0: `[5][0]`. */
declare const MATCHER_CONFIGURE_HEADER_LP_PDA_LEN = 2;
/** Header length for auth mode 1: `[5][1][wrapper 32][market 32][lp_portfolio 32][bump]` = 99. */
declare const MATCHER_CONFIGURE_HEADER_OWNER_PROOF_LEN = 99;
/** Tag-5 op 0: SetBackingFeeCap, payload `cap u16 LE` (0..=10000). */
declare const MATCHER_CONFIGURE_OP_BACKING_FEE_CAP = 0;
/** Tag-5 op 1: SetParams, payload = {@link MATCHER_SET_PARAMS_LEN} bytes. */
declare const MATCHER_CONFIGURE_OP_SET_PARAMS = 1;
/** Exact SetParams payload length (`SET_PARAMS_LEN`). `SetParams::parse` rejects any other length. */
declare const MATCHER_SET_PARAMS_LEN = 105;
/** Upper bound the matcher enforces on the backing fee cap (`BACKING_FEE_CAP_BPS_MAX`). */
declare const MATCHER_BACKING_FEE_CAP_BPS_MAX = 10000;
/** Matcher kinds (`MatcherKind`). 2 = Adaptive is new in v2. */
declare const MATCHER_KIND: {
    readonly Passive: 0;
    readonly Vamm: 1;
    readonly Adaptive: 2;
};
/** Union of valid matcher kind bytes. */
type MatcherKindValue = (typeof MATCHER_KIND)[keyof typeof MATCHER_KIND];
/** Offset of the 24-byte call extension inside a 67-byte tag-0 call (`CALL_EXT_OFFSET`). */
declare const MATCHER_CALL_EXT_OFFSET = 43;
/** Length of the call extension (`CALL_EXT_LEN`). */
declare const MATCHER_CALL_EXT_LEN = 24;
/** `ext_version` for this layout (`CALL_EXT_VERSION_V1`). 0 = legacy (all 24 bytes zero). */
declare const MATCHER_CALL_EXT_VERSION_V1 = 1;
/** Call-extension `ext_flags` bits (`EXT_FLAG_*`). Bits 5..7 must be 0. */
declare const MATCHER_CALL_EXT_FLAG: {
    readonly HEADROOM: 1;
    readonly MARK_SLOT: 2;
    readonly ACCEPTS_FEE_REQUEST: 4;
    readonly TAKER_REDUCING: 8;
    readonly EXEC_BAND: 16;
};
/** `FLAG_REQUESTED_FEE_SHIFT`: MatcherReturn `flags` bits 22..31 carry `requested_fee_bps`. */
declare const MATCHER_RETURN_FLAG_REQUESTED_FEE_SHIFT = 22;
/** `FLAG_REQUESTED_FEE_MASK` = `0x3ff << 22` (= 4290772992 as u32). */
declare const MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK: number;
/** `REQUESTED_FEE_BPS_MAX` = 1023. */
declare const MATCHER_REQUESTED_FEE_BPS_MAX = 1023;
/**
 * Known flag bits for a v2-aware wrapper (P1/P3) that accepts the fee-request channel.
 * The DEPLOYED v18.2 wrapper does not: it keeps {@link MATCHER_RETURN_KNOWN_FLAGS}.
 */
declare const MATCHER_RETURN_KNOWN_FLAGS_V2: number;
/** Ctx offset of the v2 block (`V2_BLOCK_CTX_OFFSET`), relative to byte 64 of the account. */
declare const MATCHER_V2_BLOCK_CTX_OFFSET = 178;
/** Absolute account offset of the v2 block marker byte (= 64 + 178). */
declare const MATCHER_V2_BLOCK_ACCOUNT_OFFSET = 242;
/** v2 block length (`V2_BLOCK_LEN`). */
declare const MATCHER_V2_BLOCK_LEN = 78;
/** v2 block marker value (`V2_BLOCK_VERSION`); 0 on every v1-created context. */
declare const MATCHER_V2_BLOCK_VERSION = 1;
/** v2 config flag bit0 `STALE_ALLOW_REDUCING` (`V2_FLAG_STALE_ALLOW_REDUCING`). */
declare const MATCHER_V2_FLAG_STALE_ALLOW_REDUCING = 1;
/** Matcher v2 custom error codes (`src/v2.rs`), attributed to the MATCHER program id. */
declare const MATCHER_V2_ERRORS: Readonly<Record<number, {
    name: string;
    hint: string;
}>>;
/**
 * Look up a matcher v2 custom error.
 *
 * @param code  `Custom(code)` returned by the MATCHER program.
 * @returns `{name, hint}` or `undefined` if not a matcher v2 code.
 * @example
 * ```ts
 * decodeMatcherV2Error(8002)?.name; // "ERR_STALE_MARK"
 * ```
 */
declare function decodeMatcherV2Error(code: number): {
    name: string;
    hint: string;
} | undefined;
/** `V2Config` — the v2 block's configuration fields (state fields are program-owned). */
interface MatcherV2Config {
    /** bit0 STALE_ALLOW_REDUCING. */
    flags: number;
    feeLoBps: number;
    feeHiBps: number;
    feeColdBps: number;
    volAMilli: number;
    /** 0 disables the quadratic term. */
    volBDen: number;
    /** 1..=10000. */
    volAlphaBps: number;
    /** u8: samples before the estimate replaces fee_cold. */
    volWarmup: number;
    /** u8: per-sample move cap in 10-bps units (>= 1). */
    volMoveCap10bps: number;
    /** >= 1. */
    volRefSlots: number;
    /** <= skewSpreadMultBps. */
    thinRebateMultBps: number;
    /** <= 5000. */
    skewCapBps: number;
    /** <= skewCapBps. */
    rebateCapBps: number;
    /** 0 = off. */
    maxMarkAgeSlots: number;
    /** 0 = off. */
    observedStaleSlots: number;
    /** u64; > 0 if skew or rebate is on. */
    skewRefInventory: bigint;
}
/** SetParams (tag 5 op 1) — full context parameters, 105 bytes on the wire. */
interface MatcherSetParams {
    kind: MatcherKindValue;
    /** Kinds 0/1 pricing; ignored by kind 2. */
    tradingFeeBps: number;
    baseSpreadBps: number;
    maxTotalBps: number;
    /** Kind 2: 10000 = exact constant-product; <= 100000. */
    impactKBps: number;
    /** u128. Kind 2: virtual CP depth. */
    liquidityNotionalE6: bigint;
    /** u128; u128::MAX is clamped to i128::MAX on-chain. 0 = zero-fill (kinds 1/2: `max_fill_abs == 0` fills nothing). */
    maxFillAbs: bigint;
    /** u128; 0 = UNLIMITED inventory. */
    maxInventoryAbs: bigint;
    feeToInsuranceBps: number;
    /** Kind 2: bps at |inventory| == skewRefInventory. Kinds 0/1: v1 meaning (|inventory_q|·mult/1e4, raw q units). */
    skewSpreadMultBps: number;
    /** Write a v2 block (required for kind 2; optional guard-only block for kinds 0/1). */
    enableV2: boolean;
    /** v2 block config. For kinds 0/1 every pricing field must be 0. */
    v2: MatcherV2Config;
}
/**
 * An all-zero v2 config (for `enableV2: false`, or a kinds-0/1 guard-only block
 * after setting `flags` / `maxMarkAgeSlots` / `observedStaleSlots`).
 *
 * @returns A fresh zeroed {@link MatcherV2Config}.
 * @example
 * ```ts
 * const v2 = { ...zeroMatcherV2Config(), maxMarkAgeSlots: 150, flags: MATCHER_V2_FLAG_STALE_ALLOW_REDUCING };
 * ```
 */
declare function zeroMatcherV2Config(): MatcherV2Config;
/** `MAX_IMPACT_K_BPS`. */
declare const MATCHER_V2_MAX_IMPACT_K_BPS = 100000;
/**
 * Port of `v2::default_config_for_kind2` — the conservative defaults a kind-2
 * context gets when created through the fixed tag-2 payload (wrapper tag 83).
 *
 * @param tradingFeeBps     Context trading_fee_bps (seeds fee_lo, floored at 10).
 * @param baseSpreadBps     Context base_spread_bps.
 * @param maxTotalBps       Context max_total_bps (fee_hi <= max_total − base).
 * @param skewSpreadMultBps Context skew slope (rebate slope = half of it).
 * @param maxInventoryAbs   Context max_inventory_abs (becomes skew_ref_inventory; 0 → u64::MAX).
 * @returns The derived {@link MatcherV2Config}.
 * @example
 * ```ts
 * const cfg = defaultMatcherV2ConfigForKind2(10, 50, 200, 50, 4000n); // == the P2 fixture
 * ```
 */
declare function defaultMatcherV2ConfigForKind2(tradingFeeBps: number, baseSpreadBps: number, maxTotalBps: number, skewSpreadMultBps: number, maxInventoryAbs: bigint): MatcherV2Config;
/**
 * Client-side mirror of `v2::validate_config` + the ctx `validate()` bounds that
 * SetParams must satisfy. Throws with the first violated rule (the program
 * would fail with InvalidAccountData / InvalidInstructionData).
 *
 * @param p  SetParams to check.
 * @returns void — throws on the first violation.
 * @example
 * ```ts
 * validateMatcherSetParams(params); // throws if the matcher would reject them
 * ```
 */
declare function validateMatcherSetParams(p: MatcherSetParams): void;
/**
 * Encode SetParams (tag 5 op 1 payload), byte-identical to `SetParams::encode`.
 * Validates first ({@link validateMatcherSetParams}).
 *
 * Layout: kind u8 @0, trading_fee u32 @1, base_spread u32 @5, max_total u32 @9,
 * impact_k u32 @13, liquidity u128 @17, max_fill u128 @33, max_inventory u128 @49,
 * fee_to_insurance u16 @65, skew_mult u16 @67, enable_v2 u8 @69, v2 flags u8 @70,
 * fee_lo/hi/cold/vol_a/vol_b/vol_alpha u16 @71..83, vol_warmup u8 @83,
 * vol_move_cap u8 @84, vol_ref/thin_rebate/skew_cap/rebate_cap/max_mark_age/observed_stale u16 @85..97,
 * skew_ref_inventory u64 @97 → 105 bytes.
 *
 * @param p  Parameters.
 * @returns 105-byte payload.
 * @example
 * ```ts
 * const payload = encodeMatcherSetParams({ kind: 2, ..., enableV2: true, v2: defaultMatcherV2ConfigForKind2(10, 50, 200, 50, 4000n) });
 * ```
 */
declare function encodeMatcherSetParams(p: MatcherSetParams): Uint8Array;
/** Owner-proof fields for tag 5 auth mode 1. */
interface MatcherOwnerProof {
    /** Wrapper program that derived `ctx.lp_pda` (devnet ETDLAdi…). */
    wrapperProgramId: PublicKey;
    market: PublicKey;
    lpPortfolio: PublicKey;
    /** Bump of the matcher-delegate PDA ({@link deriveMatcherDelegate} returns it). */
    bump: number;
}
/**
 * Tag 5 / auth 1 (owner proof) / op 0 SetBackingFeeCap. Wire:
 * `[5, 1, wrapper(32), market(32), lp_portfolio(32), bump, 0, cap u16 LE]` = 102 bytes.
 * Replaces the unreachable tag 4 (it needed a wrapper-delegate signature).
 *
 * @param proof   Owner-proof fields.
 * @param capBps  Backing fee cap, 0..=10000.
 * @returns 102-byte instruction data.
 * @example
 * ```ts
 * const data = encodeMatcherConfigureBackingFeeCap({ wrapperProgramId, market, lpPortfolio, bump }, 10_000);
 * ```
 */
declare function encodeMatcherConfigureBackingFeeCap(proof: MatcherOwnerProof, capBps: number): Uint8Array;
/**
 * Tag 5 / auth 1 (owner proof) / op 1 SetParams. Wire: 99-byte header + op(1) + 105 = 205 bytes.
 *
 * @param proof   Owner-proof fields.
 * @param params  SetParams (validated).
 * @returns 205-byte instruction data.
 * @example
 * ```ts
 * const data = encodeMatcherConfigureSetParams(proof, params);
 * ```
 */
declare function encodeMatcherConfigureSetParams(proof: MatcherOwnerProof, params: MatcherSetParams): Uint8Array;
/**
 * Account metas for tag 5 with owner proof: `[lp_owner (signer), matcher_ctx (writable)]`.
 *
 * @param lpOwner     LP portfolio owner (signs).
 * @param matcherCtx  Matcher context account.
 * @returns Two account metas in program order.
 * @example
 * ```ts
 * const keys = matcherConfigureOwnerProofAccounts(lpOwner, matcherCtx);
 * ```
 */
declare function matcherConfigureOwnerProofAccounts(lpOwner: PublicKey, matcherCtx: PublicKey): AccountMeta$1[];
/** Inputs to build a tag-5 owner-proof instruction; the bump is derived. */
interface MatcherConfigureIxArgs {
    matcherProgramId: PublicKey;
    wrapperProgramId: PublicKey;
    market: PublicKey;
    lpPortfolio: PublicKey;
    lpOwner: PublicKey;
    matcherCtx: PublicKey;
}
/**
 * Build the tag-5 SetBackingFeeCap instruction (owner proof; bump derived exactly as
 * the wrapper's matcher-delegate PDA). Send AFTER InitMatcherCtx (wrapper tag 83),
 * signed by the LP owner. Requires the matcher program to be upgraded to v2.
 *
 * @param a       Program ids + market/LP/ctx accounts.
 * @param capBps  0..=10000.
 * @returns TransactionInstruction for the matcher program.
 * @example
 * ```ts
 * const ix = buildMatcherConfigureBackingFeeCapIx({ matcherProgramId, wrapperProgramId, market, lpPortfolio, lpOwner, matcherCtx }, 10_000);
 * ```
 */
declare function buildMatcherConfigureBackingFeeCapIx(a: MatcherConfigureIxArgs, capBps: number): TransactionInstruction;
/**
 * Build the tag-5 SetParams instruction (owner proof). Requires the matcher v2 program.
 *
 * @param a       Program ids + market/LP/ctx accounts.
 * @param params  SetParams (validated client-side).
 * @returns TransactionInstruction for the matcher program.
 * @example
 * ```ts
 * const ix = buildMatcherConfigureSetParamsIx(args, { kind: 2, ..., enableV2: true, v2 });
 * ```
 */
declare function buildMatcherConfigureSetParamsIx(a: MatcherConfigureIxArgs, params: MatcherSetParams): TransactionInstruction;
/** Decoded / to-encode call extension. Omitted optional fields = flag clear, bytes 0. */
interface MatcherCallExt {
    /** HEADROOM: max |exec_size| (q) the wrapper accepts in this direction; u64::MAX = unbounded; 0 = zero-fill. */
    headroomQ?: bigint;
    /** MARK_SLOT: slot of the last fresh oracle observation behind oracle_price_e6. */
    markSlot?: bigint;
    /** ACCEPTS_FEE_REQUEST: the caller will read return bits 22..31. */
    acceptsFeeRequest: boolean;
    /** TAKER_REDUCING: the request only reduces the taker's position. */
    takerReducing: boolean;
    /** EXEC_BAND: the wrapper's oracle band on exec_price, bps (u16). */
    execBandBps?: number;
}
/**
 * Encode the 24-byte v1 call extension (`CallExt::encode`).
 *
 * @param ext  Extension fields.
 * @returns 24 bytes: ver, flags, exec_band u16, mark_slot u64, headroom u64, reserved u32.
 * @example
 * ```ts
 * const ext = encodeMatcherCallExt({ headroomQ: 1000n, markSlot: slot, acceptsFeeRequest: false, takerReducing: false });
 * ```
 */
declare function encodeMatcherCallExt(ext: MatcherCallExt): Uint8Array;
/**
 * Decode a 24-byte call extension with the matcher's own validation rules.
 * Returns `null` for the legacy all-zero block (ext_version 0).
 *
 * @param bytes   The 24 bytes (or a full 67-byte tag-0 call, sliced at 43).
 * @returns Decoded extension, or null for legacy.
 * @throws If version is unknown, reserved/unknown flag bits are set, or a field is non-zero without its flag.
 * @example
 * ```ts
 * const ext = decodeMatcherCallExt(call.subarray(43, 67));
 * ```
 */
declare function decodeMatcherCallExt(bytes: Uint8Array): MatcherCallExt | null;
/**
 * Extract `requested_fee_bps` (0..=1023) from a MatcherReturn `flags` word.
 * Non-zero only when the call set ACCEPTS_FEE_REQUEST and the fill was non-zero.
 *
 * @param flags  MatcherReturn.flags (u32).
 * @returns requested fee in bps.
 * @example
 * ```ts
 * const fee = decodeMatcherRequestedFeeBps(ret.flags);
 * ```
 */
declare function decodeMatcherRequestedFeeBps(flags: number): number;
/**
 * True if a matcher context account carries the v2 block marker
 * (`ctx[64..72] == "PERCMATC"` and `ctx[242] == 1`) — the doc's rule for when a
 * wrapper/client may send `ext_version = 1`.
 *
 * @param ctxAccountData  Raw matcher context account bytes (>= 320).
 * @returns Whether the ctx has an active v2 block.
 * @example
 * ```ts
 * if (isMatcherCtxV2(info.data)) sendExt = true;
 * ```
 */
declare function isMatcherCtxV2(ctxAccountData: Uint8Array): boolean;
/** Matcher tag-3 header length: `[3][n u8][req_id u64][lp_account_id u64]` (`MATCHER_BATCH_HEADER_LEN`). */
declare const MATCHER_BATCH_HEADER_LEN = 18;
/** Per-leg length: `asset u16, oracle_price_e6 u64, req_size i128` (`MATCHER_BATCH_LEG_LEN`). */
declare const MATCHER_BATCH_LEG_LEN = 26;
/** Legs per wrapper BatchTradeCpi (`MATCHER_BATCH_MAX_LEGS` in the wrapper; the P2 matcher itself allows 16). */
declare const WRAPPER_BATCH_MAX_LEGS = 11;
/**
 * Port of the wrapper's `risk_limits_v17::encode_matcher_call_ext` (P1+P3 FINAL `58e379f1`) — the
 * exact 24 bytes the wrapper appends per leg (TradeCpi and, since F-10, BatchTradeCpi). Mode 0 →
 * all zero (legacy). Mode 1 → version 1, flags HEADROOM|MARK_SLOT|EXEC_BAND (+TAKER_REDUCING,
 * +ACCEPTS_FEE_REQUEST), headroom saturated to u64::MAX.
 *
 * @param mode               `AssetRiskLimitsV17.matcher_ext_mode` (0 or 1).
 * @param markSlot           The asset's `last_good_oracle_slot`.
 * @param lpHeadroomQ        Headroom in Q (the batch route passes |leg.size_q|).
 * @param execBandBps        Effective exec band (bps).
 * @param takerReducing      Leg only reduces the taker.
 * @param acceptsFeeRequest  Fee-request channel (the wrapper passes false in batches).
 * @returns 24 bytes.
 * @example
 * ```ts
 * encodeWrapperMatcherCallExt(1, 505_000_000n, 1_000_000n, 300, false, false);
 * ```
 */
declare function encodeWrapperMatcherCallExt(mode: number, markSlot: bigint, lpHeadroomQ: bigint, execBandBps: number, takerReducing: boolean, acceptsFeeRequest: boolean): Uint8Array;
/** One matcher batch leg. */
interface MatcherBatchLeg {
    assetIndex: number;
    oraclePriceE6: bigint;
    /** Signed request size (i128). */
    reqSize: bigint;
}
/**
 * Encode the matcher tag-3 batch call exactly as the wrapper's `invoke_matcher_batch` builds it:
 * `[3][n][req_id u64][lp_account_id u64]` + n×(asset u16, oracle_price_e6 u64, req_size i128) +
 * (optional) n×24-byte call extensions, in leg order — `18 + 26n` legacy or `18 + 26n + 24n`,
 * the only two lengths the P2 matcher's `process_batch_call` accepts. For a TS reference matcher /
 * simulator; clients send the wrapper BatchTradeCpi ({@link encodeBatchTradeCpi}), not this.
 *
 * @param reqId        Request id.
 * @param lpAccountId  First 8 bytes of the matcher delegate PDA, LE (`matcher_lp_account_id`).
 * @param legs         1..=16 legs (the wrapper sends at most 11).
 * @param exts         Optional per-leg 24-byte extensions (must match `legs.length`).
 * @returns Instruction data for the matcher program.
 * @example
 * ```ts
 * encodeMatcherBatchCall(7n, lpId, [{ assetIndex: 0, oraclePriceE6: 1_000_000n, reqSize: 5n }], [encodeWrapperMatcherCallExt(1, slot, 5n, 300, false, false)]);
 * ```
 */
declare function encodeMatcherBatchCall(reqId: bigint, lpAccountId: bigint, legs: MatcherBatchLeg[], exts?: Uint8Array[]): Uint8Array;

/** P3 instruction tags (the live meanings of 94..=102 on a P3 wrapper). */
declare const IX_TAG_P3: Readonly<{
    readonly InitVaultLp: 94;
    readonly VaultLpSetMatcher: 95;
    readonly DepositJuniorTranche: 96;
    readonly WithdrawJuniorTranche: 97;
    readonly VaultLpRecall: 98;
    readonly SetVaultLpRisk: 99;
    readonly VaultLpConvertPnl: 100;
    readonly VaultLpSettleResolved: 101;
    readonly VaultLpReleaseSurplus: 102;
}>;
/** `VAULT_LP_MIN_JUNIOR_FLOOR_BPS` / `VAULT_LP_MAX_JUNIOR_FLOOR_BPS`. */
declare const VAULT_LP_JUNIOR_FLOOR_BPS_RANGE_P3: Readonly<{
    readonly min: 1000;
    readonly max: 10000;
}>;
/** `VAULT_LP_MAX_LEV_BPS` (5x). 0 means the 1x default `VAULT_LP_DEFAULT_MAX_LEV_BPS`. */
declare const VAULT_LP_MAX_LEV_BPS_P3 = 50000;
/** `VAULT_LP_DEFAULT_MAX_LEV_BPS` (1x). Tag 94 auto-pins the vault LP at this default (stored 0). */
declare const VAULT_LP_DEFAULT_MAX_LEV_BPS_P3 = 10000;
/**
 * `CANONICAL_VAULT_LP_MATCHER_PROGRAM` (devnet build only; tag 94 fails closed off-devnet with
 * VaultLpMatcherNotApproved). The ONE matcher program a vault LP is auto-pinned to at tag 94.
 */
declare const CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3 = "EDKKgRaVHna6FCxiY1kgMzegD9rpaN1nwJNSzAzeBUBX";
/**
 * `vault_lp_v18::PIN_*` — the matcher context tag 94 gives every vault LP (protocol constants;
 * the creator passes none of them). The upgrade authority may adjust later via tags 99/95.
 */
declare const VAULT_LP_PIN_P3: Readonly<{
    readonly MATCHER_KIND: 1;
    readonly TRADING_FEE_BPS: 10;
    readonly BASE_SPREAD_BPS: 10;
    readonly MAX_TOTAL_BPS: 100;
    readonly IMPACT_K_BPS: 50;
    readonly FEE_TO_INSURANCE_BPS: 0;
    readonly SKEW_SPREAD_MULT_BPS: 1;
    readonly TRADE_FEE_CAP_BPS: 10000;
    readonly LIQUIDITY_USD: 250000n;
    readonly MAX_FILL_USD: 5000n;
    readonly MAX_INVENTORY_USD: 25000n;
}>;
/** `vault_lp_v18::ENGINE_MAX_POSITION_ABS_Q` (= engine MAX_POSITION_ABS_Q). */
declare const ENGINE_MAX_POSITION_ABS_Q_P3 = 100000000000000n;
/**
 * Port of `vault_lp_v18::usd_to_q_capped`: `floor(usd·1e12 / price_e6)`, clamped to the engine
 * position bound; null when the price is 0 or the result is 0 (0 = UNLIMITED to the matcher).
 * @param usd      Notional in USD.
 * @param priceE6  Asset effective price (e6).
 * @returns Q or null.
 * @example
 * ```ts
 * usdToQCappedP3(5_000n, 1_000_000n); // 5_000_000_000n
 * ```
 */
declare function usdToQCappedP3(usd: bigint, priceE6: bigint): bigint | null;
/**
 * Port of `vault_lp_v18::pinned_matcher_caps`: the FINITE matcher caps tag 94 pins from the
 * asset's effective price at bind time. null = tag 94 fails (InvalidInstruction).
 * @param priceE6  Asset effective price (e6) at bind time.
 * @returns `{ liquidityNotionalE6, maxFillAbs, maxInventoryAbs }` or null.
 * @example
 * ```ts
 * pinnedMatcherCapsP3(1_000_000n); // { liquidityNotionalE6: 250_000_000_000n, maxFillAbs: 5_000_000_000n, maxInventoryAbs: 25_000_000_000n }
 * ```
 */
declare function pinnedMatcherCapsP3(priceE6: bigint): {
    liquidityNotionalE6: bigint;
    maxFillAbs: bigint;
    maxInventoryAbs: bigint;
} | null;
/**
 * InitVaultLp (tag 94): `u16 junior_floor_bps` (1000..=10000). 3 bytes.
 *
 * @param juniorFloorBps  Junior floor as bps of the senior claim.
 * @returns Instruction data.
 * @example
 * ```ts
 * const data = encodeInitVaultLpP3(2_000);
 * ```
 */
declare function encodeInitVaultLpP3(juniorFloorBps: number): Uint8Array;
/** VaultLpSetMatcher (tag 95) fields, in wire order. */
interface VaultLpSetMatcherArgsP3 {
    /** Live portfolio matcher sequence (CAS; EngineStale on mismatch). */
    expectedSequence: bigint;
    /** Live asset generation frontier (CAS). */
    assetGenerationFrontier: bigint;
    tradeFeeCapBps: number;
    expirySlot: bigint;
    /** Matcher kind (0 Passive, 1 vAMM, 2 Adaptive on a v2 matcher). */
    kind: number;
    tradingFeeBps: number;
    baseSpreadBps: number;
    maxTotalBps: number;
    impactKBps: number;
    liquidityNotionalE6: bigint;
    /** Must be non-zero (VaultLpMatcherNotApproved otherwise). */
    maxFillAbs: bigint;
    /** Must be non-zero (VaultLpMatcherNotApproved otherwise). */
    maxInventoryAbs: bigint;
    feeToInsuranceBps: number;
    skewSpreadMultBps: number;
}
/**
 * VaultLpSetMatcher (tag 95), upgrade-authority only. 96 bytes:
 * u64 expected_sequence, u64 asset_generation_frontier, u16 trade_fee_cap_bps, u64 expiry_slot,
 * u8 kind, u32 trading_fee_bps, u32 base_spread_bps, u32 max_total_bps, u32 impact_k_bps,
 * u128 liquidity_notional_e6, u128 max_fill_abs, u128 max_inventory_abs,
 * u16 fee_to_insurance_bps, u16 skew_spread_mult_bps.
 *
 * @param a  Fields.
 * @returns Instruction data.
 * @example
 * ```ts
 * const data = encodeVaultLpSetMatcherP3({ expectedSequence: 0n, assetGenerationFrontier: 1n, ... });
 * ```
 */
declare function encodeVaultLpSetMatcherP3(a: VaultLpSetMatcherArgsP3): Uint8Array;
/**
 * DepositJuniorTranche (tag 96): `u128 amount`. 17 bytes.
 * @param amount  Collateral atoms.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeDepositJuniorTrancheP3(1_000_000n);
 * ```
 */
declare function encodeDepositJuniorTrancheP3(amount: bigint): Uint8Array;
/**
 * WithdrawJuniorTranche (tag 97): `u128 amount`. 17 bytes.
 * @param amount  Collateral atoms.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeWithdrawJuniorTrancheP3(500_000n);
 * ```
 */
declare function encodeWithdrawJuniorTrancheP3(amount: bigint): Uint8Array;
/**
 * VaultLpRecall (tag 98, permissionless): `u128 amount, u16 target_domain`. 19 bytes.
 * @param amount        Atoms to recall from the vault LP into backing (> 0, <= senior shortfall).
 * @param targetDomain  Backing domain that receives it (the registry domain or its sibling).
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeVaultLpRecallP3(100n, 0);
 * ```
 */
declare function encodeVaultLpRecallP3(amount: bigint, targetDomain: number): Uint8Array;
/** SetVaultLpRisk (tag 99) fields, in wire order. */
interface SetVaultLpRiskArgsP3 {
    assetIndex: number;
    /** e9 per slot at 100% imbalance; 0 = skew funding off. */
    skewSlopeE9: bigint;
    /** e9 per slot cap; must be <= the market's max_abs_funding_e9_per_slot. */
    skewMaxE9: bigint;
    /** Leverage step-down N_cap in Q; 0 = off. */
    levCapQ: bigint;
    /** <= 10000. */
    levMaxImrBps: number;
    /** <= 50000; 0 = 1x default. */
    vaultLpMaxLevBps: number;
    /** The ONLY matcher program tag 95 accepts for this asset. */
    approvedMatcherProgram: PublicKey;
}
/**
 * SetVaultLpRisk (tag 99), upgrade-authority only. 73 bytes:
 * u16 asset_index, u64 skew_slope_e9, u64 skew_max_e9, u128 lev_cap_q, u16 lev_max_imr_bps,
 * u32 vault_lp_max_lev_bps, [u8;32] approved_matcher_program.
 *
 * @param a  Fields.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeSetVaultLpRiskP3({ assetIndex: 0, skewSlopeE9: 2000n, skewMaxE9: 900n, levCapQ: 0n, levMaxImrBps: 0, vaultLpMaxLevBps: 0, approvedMatcherProgram: MATCHER });
 * ```
 */
declare function encodeSetVaultLpRiskP3(a: SetVaultLpRiskArgsP3): Uint8Array;
/**
 * VaultLpConvertPnl (tag 100, permissionless): `u128 amount`. 17 bytes.
 * @param amount  Atoms of vault-LP PnL to convert to capital.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeVaultLpConvertPnlP3(1n);
 * ```
 */
declare function encodeVaultLpConvertPnlP3(amount: bigint): Uint8Array;
/**
 * VaultLpSettleResolved (tag 101, permissionless, Resolved): `u8 topup` (0 = close step, 1 = topup claim). 2 bytes.
 * P3 FINAL (`58e379f1`): moves NO SPL. The whole payout goes into the vault's own backing pot;
 * seniors exit through tag 77 and the junior through tag 102 (see `planResolvedVaultLpExitP3`).
 * @param topup  0 or 1.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeVaultLpSettleResolvedP3(0);
 * ```
 */
declare function encodeVaultLpSettleResolvedP3(topup: 0 | 1): Uint8Array;
/**
 * VaultLpReleaseSurplus (tag 102, junior owner): `u128 amount, u16 source_domain`. 19 bytes.
 * @param amount        Atoms (> 0, <= backing surplus over the senior claim).
 * @param sourceDomain  Backing domain the surplus is taken from.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeVaultLpReleaseSurplusP3(10n, 1);
 * ```
 */
declare function encodeVaultLpReleaseSurplusP3(amount: bigint, sourceDomain: number): Uint8Array;
/**
 * Tag 94 InitVaultLp (P3 FINAL `58e379f1`; accounts unchanged since `07a1d0eb`): 11 accounts,
 * marketauth only. SINGLE-ASSET markets only: the market must have exactly one configured asset
 * slot (`max_market_slots == 1`, i.e. created with `maxPortfolioAssets: 1`), else 86
 * VaultLpMultiAssetMarket; a second asset can never be activated afterwards. `authority` = the
 * market's marketauth, which becomes the junior owner. [0..7] as before, then AUTO-PIN:
 * [8] matcher program (must be CANONICAL_VAULT_LP_MATCHER_PROGRAM, else 81
 * VaultLpMatcherNotApproved), [9] matcher ctx (writable; pre-created, 320 B, owner = matcher,
 * zeroed), [10] matcher delegate PDA `["matcher", market, lp_portfolio, registry, matcher, ctx]`
 * (signs the matcher CPI via invoke_signed — NOT a transaction signer). The program approves the
 * canonical matcher, keeps the 1x exposure default and initialises the ctx with `VAULT_LP_PIN_P3`
 * + {@link pinnedMatcherCapsP3}. `lpPortfolio` must be pre-created (program-owned, portfolio length).
 */
declare const ACCOUNTS_INIT_VAULT_LP_P3: readonly AccountSpec[];
/** Tag 95: 8 accounts. `matcherDelegate` = deriveMatcherDelegate(wrapper, market, lp, registry, matcherProgram, matcherCtx). */
declare const ACCOUNTS_VAULT_LP_SET_MATCHER_P3: readonly AccountSpec[];
/** Tag 96: 7 accounts. */
declare const ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3: readonly AccountSpec[];
/** Tag 97: 11 accounts. */
declare const ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3: readonly AccountSpec[];
/** Tag 98: 8 accounts (permissionless; cranker pays rent if the target ledger is created). */
declare const ACCOUNTS_VAULT_LP_RECALL_P3: readonly AccountSpec[];
/** Tag 99: 3 accounts. */
declare const ACCOUNTS_SET_VAULT_LP_RISK_P3: readonly AccountSpec[];
/** Tag 100: 4 accounts (permissionless). */
declare const ACCOUNTS_VAULT_LP_CONVERT_PNL_P3: readonly AccountSpec[];
/**
 * Tag 101: 12 accounts (permissionless, Resolved). Accounts [7] juniorDestToken .. [10] tokenProgram
 * are still validated (junior dest must be owned by the junior owner) but NO SPL moves on the
 * FINAL head — the payout lands in the vault's own backing pot.
 */
declare const ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3: readonly AccountSpec[];
/** Tag 102: 7 accounts (Live). In Resolved mode append {@link ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3}. */
declare const ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3: readonly AccountSpec[];
/** Tag 102 Resolved-mode tail: [7] junior dest token (w), [8] vault token (w), [9] vault authority, [10] token program. */
declare const ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3: readonly AccountSpec[];

/**
 * P1 per-asset risk limits — wrapper tag 93 `SetAssetRiskLimits` and the `AssetRiskLimitsV17`
 * record. Additive to SDK 8.0.0.
 *
 * Source: percolator-prog `58e379f1` (the relaunch wrapper, P1 + P3), `src/v16_program.rs`:
 * decode arm `TAG_SET_ASSET_RISK_LIMITS` (93), its encoder (optional tail), `handle_set_asset_risk_limits`,
 * `state::AssetRiskLimitsV17` at wrapper-slot offset `ASSET_RISK_LIMITS_OFF` (608).
 *
 * @module risk-limits-p1
 */

/** P1 tag table. */
declare const IX_TAG_P1: Readonly<{
    readonly SetAssetRiskLimits: 93;
}>;
/** `risk_limits_v17::MAX_EXEC_BAND_BPS`. */
declare const MAX_EXEC_BAND_BPS_P1 = 10000;
/** `risk_limits_v17::MAX_LP_EXPOSURE_K_BPS`. */
declare const MAX_LP_EXPOSURE_K_BPS_P1 = 10000000;
/** Engine `MAX_OI_SIDE_Q`. */
declare const MAX_OI_SIDE_Q_P1 = 100000000000000n;
/** `state::MATCHER_EXT_MODE_V1` (the only non-zero mode). */
declare const MATCHER_EXT_MODE_V1_P1 = 1;
/** `risk_limits_v17::MAX_REQUESTED_FEE_BPS`. */
declare const MAX_REQUESTED_FEE_BPS_P1 = 1023;
/** Tag 93 fields. Every 0 means "use the protocol default" (see the record docs). */
interface SetAssetRiskLimitsArgsP1 {
    assetIndex: number;
    /** Execution-price band (bps); 0 = default. <= 10000. */
    execBandBps: number;
    /** LP exposure multiplier k (bps of equity); 0 = 1e8 / initial_margin_bps. <= 1e7. */
    lpExposureKBps: number;
    /** Auto-halt floor on the matcher LP's IM equity (atoms); 0 = halt only a depleted LP. */
    lpFloorAtoms: bigint;
    /** Max effective OI per side (Q); 0 = engine MAX_OI_SIDE_Q. <= 1e14. */
    sideOiCapQ: bigint;
    /** 0 = legacy call bytes; 1 = send the P2 ext block. Optional wire tail. Default 0. */
    matcherExtMode?: number;
    /**
     * P2 fee-request channel cap (bps); 0 = channel OFF. Optional wire tail. Default 0.
     * Keep 0 on the relaunch until the frontend ships with LIMITS_P2=1 and the matcher is v2 —
     * a non-zero value makes every trade with a non-zero quote fail for older app builds.
     */
    maxRequestedFeeBps?: number;
}
/**
 * Encode tag 93 exactly like the wrapper's own encoder: 41 bytes, then the optional tail —
 * `matcher_ext_mode` (u8) if either tail field is non-zero, then `max_requested_fee_bps`
 * (u16) if it is non-zero. The decoder reads a missing tail as 0.
 *
 * @param a  Fields (validated against the handler's bounds).
 * @returns 41, 42 or 44 bytes.
 * @example
 * ```ts
 * const data = encodeSetAssetRiskLimitsP1({ assetIndex: 0, execBandBps: 300, lpExposureKBps: 50_000,
 *   lpFloorAtoms: 250_000_000n, sideOiCapQ: 7_000_000_000n });
 * ```
 */
declare function encodeSetAssetRiskLimitsP1(a: SetAssetRiskLimitsArgsP1): Uint8Array;
/** Tag 93 accounts: `[upgrade_authority (s), ProgramData, market (w)]`. */
declare const ACCOUNTS_SET_ASSET_RISK_LIMITS_P1: readonly AccountSpec[];
/**
 * Build tag 93 (upgrade-authority gated; ProgramData derived from the wrapper id).
 *
 * @param programId         Wrapper program id.
 * @param market            Market account.
 * @param upgradeAuthority  The wrapper's upgrade authority (signer).
 * @param args              Fields.
 * @returns TransactionInstruction.
 * @example
 * ```ts
 * const ix = buildSetAssetRiskLimitsIxP1(WRAPPER, market, upgradeAuthority, { assetIndex: 0, ... });
 * ```
 */
declare function buildSetAssetRiskLimitsIxP1(programId: PublicKey, market: PublicKey, upgradeAuthority: PublicKey, args: SetAssetRiskLimitsArgsP1): TransactionInstruction;
/** Field offsets inside the 64-byte record (rustc layout of `state::AssetRiskLimitsV17`). */
declare const ASSET_RISK_LIMITS_FIELD_OFF_P1: Readonly<{
    readonly sideOiCapQ: 0;
    readonly lpFloorAtoms: 16;
    readonly lpExposureKBps: 32;
    readonly execBandBps: 36;
    readonly matcherExtMode: 38;
    readonly reserved0: 39;
    readonly maxRequestedFeeBps: 40;
    readonly reserved: 42;
}>;
/** `ASSET_RISK_LIMITS_LEN`. */
declare const ASSET_RISK_LIMITS_LEN_P1 = 64;
/** `ASSET_RISK_LIMITS_OFF` inside each asset's 1024-byte wrapper slot. */
declare const ASSET_RISK_LIMITS_SLOT_OFF_P1 = 608;
/**
 * Account offset of asset `i`'s record: 592 + 758 + 2325·i + 608 = 1958 + 2325·i.
 * @param assetIndex  Asset slot.
 * @returns Byte offset.
 * @example
 * ```ts
 * assetRiskLimitsAccountOffsetP1(0); // 1958
 * ```
 */
declare function assetRiskLimitsAccountOffsetP1(assetIndex: number): number;
/** Decoded `AssetRiskLimitsV17` (raw stored values; 0 = protocol default). */
interface AssetRiskLimitsP1 {
    sideOiCapQ: bigint;
    lpFloorAtoms: bigint;
    lpExposureKBps: number;
    execBandBps: number;
    matcherExtMode: number;
    /** 0 = fee-request channel OFF (required at relaunch). */
    maxRequestedFeeBps: number;
}
/**
 * Decode one 64-byte `AssetRiskLimitsV17` record.
 * @param rec  The 64 bytes.
 * @returns Decoded limits.
 * @example
 * ```ts
 * decodeAssetRiskLimitsRecordP1(bytes).maxRequestedFeeBps;
 * ```
 */
declare function decodeAssetRiskLimitsRecordP1(rec: Uint8Array): AssetRiskLimitsP1;
/**
 * Decode asset `i`'s `AssetRiskLimitsV17` from a raw market account (kind 1).
 * @param marketData  Raw market bytes.
 * @param assetIndex  Asset slot.
 * @returns Decoded limits.
 * @example
 * ```ts
 * if (decodeAssetRiskLimitsP1(info.data, 0).maxRequestedFeeBps !== 0) throw new Error("fee channel must be off");
 * ```
 */
declare function decodeAssetRiskLimitsP1(marketData: Uint8Array, assetIndex: number): AssetRiskLimitsP1;

/** Slab magic number ("PERCOLAT" as little-endian u64). */
declare const SLAB_MAGIC: bigint;
/**
 * Full slab layout descriptor. Returned by detectSlabLayout().
 * All engine field offsets are relative to engineOff.
 */
interface SlabLayout {
    version: 0 | 1 | 2;
    headerLen: number;
    configOffset: number;
    configLen: number;
    reservedOff: number;
    engineOff: number;
    accountSize: number;
    maxAccounts: number;
    bitmapWords: number;
    accountsOff: number;
    engineInsuranceOff: number;
    engineParamsOff: number;
    paramsSize: number;
    engineCurrentSlotOff: number;
    engineFundingIndexOff: number;
    engineLastFundingSlotOff: number;
    engineFundingRateBpsOff: number;
    engineMarkPriceOff: number;
    engineLastCrankSlotOff: number;
    engineMaxCrankStalenessOff: number;
    engineTotalOiOff: number;
    engineLongOiOff: number;
    engineShortOiOff: number;
    engineCTotOff: number;
    enginePnlPosTotOff: number;
    engineLiqCursorOff: number;
    engineGcCursorOff: number;
    engineLastSweepStartOff: number;
    engineLastSweepCompleteOff: number;
    engineCrankCursorOff: number;
    engineSweepStartIdxOff: number;
    engineLifetimeLiquidationsOff: number;
    engineLifetimeForceClosesOff: number;
    engineNetLpPosOff: number;
    engineLpSumAbsOff: number;
    engineLpMaxAbsOff: number;
    engineLpMaxAbsSweepOff: number;
    engineEmergencyOiModeOff: number;
    engineEmergencyStartSlotOff: number;
    engineLastBreakerSlotOff: number;
    engineBitmapOff: number;
    postBitmap: number;
    acctOwnerOff: number;
    hasInsuranceIsolation: boolean;
    engineInsuranceIsolatedOff: number;
    engineInsuranceIsolationBpsOff: number;
    configMarkEwmaOff?: number;
}
declare const ENGINE_OFF = 600;
declare const ENGINE_MARK_PRICE_OFF = 400;
/**
 * V2 slab tier sizes (small and large) for discovery.
 * V2 uses ENGINE_OFF=600, BITMAP_OFF=432, ACCOUNT_SIZE=248, postBitmap=18.
 * Sizes overlap with V1D (postBitmap=2) — disambiguation requires reading the version field.
 */
declare const SLAB_TIERS_V2: Readonly<{
    readonly small: {
        readonly maxAccounts: 256;
        readonly dataSize: 65088;
        readonly label: "Small";
        readonly description: "256 slots (V2 BPF intermediate)";
    };
    readonly large: {
        readonly maxAccounts: 4096;
        readonly dataSize: 1025568;
        readonly label: "Large";
        readonly description: "4,096 slots (V2 BPF intermediate)";
    };
}>;
/**
 * V1M slab tier sizes — mainnet-deployed V1 program (ESa89R5).
 * ENGINE_OFF=640, BITMAP_OFF=726, ACCOUNT_SIZE=248, postBitmap=18.
 * Expanded RiskParams (336 bytes) and trade_twap runtime fields.
 * Confirmed by on-chain probing of slab 8NY7rvQ (SOL/USDC Perpetual, 257512 bytes).
 */
declare const SLAB_TIERS_V1M: Record<string, {
    maxAccounts: number;
    dataSize: number;
    label: string;
    description: string;
}>;
/**
 * V1M2 slab tier sizes — mainnet program rebuilt from main@4861c56 with 312-byte accounts.
 * ENGINE_OFF=616, BITMAP_OFF=1008 (empirically verified from CCTegYZ...).
 * Engine struct is layout-identical to V_ADL; differs only in engineOff (616 vs 624).
 * Sizes are unique from V_ADL after the bitmap correction: medium=323312 vs V_ADL=323320.
 */
declare const SLAB_TIERS_V1M2: Record<string, {
    maxAccounts: number;
    dataSize: number;
    label: string;
    description: string;
}>;
/**
 * V_ADL slab tier sizes — PERC-8270/8271 ADL-upgraded program.
 * ENGINE_OFF=624, BITMAP_OFF=1008, ACCOUNT_SIZE=312, postBitmap=18.
 * New account layout adds ADL tracking fields (+64 bytes/account including alignment padding).
 * BPF SLAB_LEN verified by cargo build-sbf in PERC-8271: large (4096) = 1288320 bytes.
 */
declare const SLAB_TIERS_V_ADL: Record<string, {
    maxAccounts: number;
    dataSize: number;
    label: string;
    description: string;
}>;
/**
 * V_SETDEXPOOL slab tier sizes — PERC-SetDexPool security fix.
 * ENGINE_OFF=632, BITMAP_OFF=1008, ACCOUNT_SIZE=312, CONFIG_LEN=528.
 * e.g. large (4096 accts) = 1288336 bytes.
 */
declare const SLAB_TIERS_V_SETDEXPOOL: Record<string, {
    maxAccounts: number;
    dataSize: number;
    label: string;
    description: string;
}>;
/**
 * V12_1 slab tier sizes — percolator-core v12.1 merge.
 * ENGINE_OFF=648, BITMAP_OFF=1016, ACCOUNT_SIZE=320.
 * Verified by cargo build-sbf compile-time assertions.
 */
declare const SLAB_TIERS_V12_1: Record<string, {
    maxAccounts: number;
    dataSize: number;
    label: string;
    description: string;
}>;
/**
 * V12_15 slab tier sizes — percolator v12.15 (engine+prog sync).
 * ENGINE_OFF=624, BITMAP_OFF=862 (relative), ACCOUNT_SIZE=4400, postBitmap=18.
 * MAX_ACCOUNTS default changed from 4096 to 2048. Verified SLAB_LEN=1,128,448 for small (256).
 * Account layout completely redesigned with reserve cohort arrays.
 */
declare const SLAB_TIERS_V12_15: Record<string, {
    maxAccounts: number;
    dataSize: number;
    label: string;
    description: string;
}>;
/**
 * V12_17 slab tier sizes — percolator v12.17 (two-bucket warmup, per-side funding).
 * Uses SBF sizes (on-chain layout) for the dataSize values.
 * ENGINE_OFF=504 (SBF), ACCOUNT_SIZE=352 (SBF), BITMAP_OFF=712 (SBF), postBitmap=4.
 * RISK_BUF_LEN=160 appended after engine.
 * Supported tiers: small(256), medium(1024), large(4096).
 */
declare const SLAB_TIERS_V12_17: Record<string, {
    maxAccounts: number;
    dataSize: number;
    label: string;
    description: string;
}>;
/**
 * V12_19 slab tier sizes (probe-confirmed via cargo build-sbf compile-time
 * assertions on 2026-04-28). Used by `discoverMarkets` to filter program
 * accounts by dataSize. Without this tier set, v12.19 slabs (the only kind
 * the deployed mainnet program ESa89R5... produces post-2026-04-28 upgrade)
 * fall through to the memcmp fallback path with no layout hint.
 *
 * Sizes derived from V12_19_SIZES Map (defined earlier in this file at the
 * V12_19 layout block). Kept as Record for parity with other SLAB_TIERS_*
 * exports consumed by discovery.ts.
 */
declare const SLAB_TIERS_V12_19: Record<string, {
    maxAccounts: number;
    dataSize: number;
    label: string;
    description: string;
}>;
declare function detectSlabLayout(dataLen: number, data?: Uint8Array): SlabLayout | null;
/**
 * Legacy detectLayout for backward compat.
 * Returns { bitmapWords, accountsOff, maxAccounts } or null.
 *
 * GH#1238: previously recomputed accountsOff with hardcoded postBitmap=18, which gave a value
 * 16 bytes too large for V1D slabs (which use postBitmap=2). Now delegates directly to the
 * SlabLayout descriptor so each variant uses its own correct accountsOff.
 */
declare function detectLayout(dataLen: number): {
    bitmapWords: number;
    accountsOff: number;
    maxAccounts: number;
} | null;
interface SlabHeader {
    magic: bigint;
    version: number;
    bump: number;
    flags: number;
    resolved: boolean;
    paused: boolean;
    admin: PublicKey;
    nonce: bigint;
    lastThrUpdateSlot: bigint;
}
interface MarketConfig {
    collateralMint: PublicKey;
    vaultPubkey: PublicKey;
    indexFeedId: PublicKey;
    maxStalenessSlots: bigint;
    confFilterBps: number;
    vaultAuthorityBump: number;
    invert: number;
    unitScale: number;
    fundingHorizonSlots: bigint;
    fundingKBps: bigint;
    fundingInvScaleNotionalE6: bigint;
    fundingMaxPremiumBps: bigint;
    fundingMaxBpsPerSlot: bigint;
    threshFloor: bigint;
    threshRiskBps: bigint;
    threshUpdateIntervalSlots: bigint;
    threshStepBps: bigint;
    threshAlphaBps: bigint;
    threshMin: bigint;
    threshMax: bigint;
    threshMinStep: bigint;
    oracleAuthority: PublicKey;
    authorityPriceE6: bigint;
    authorityTimestamp: bigint;
    oraclePriceCapE2bps: bigint;
    lastEffectivePriceE6: bigint;
    oiCapMultiplierBps: bigint;
    maxPnlCap: bigint;
    adaptiveFundingEnabled: boolean;
    adaptiveScaleBps: number;
    adaptiveMaxFundingBps: bigint;
    marketCreatedSlot: bigint;
    oiRampSlots: bigint;
    /**
     * @stub Always 0n — not yet read from the on-chain MarketConfig struct.
     * Do not use for market-resolution logic until a parser is wired.
     */
    resolvedSlot: bigint;
    insuranceIsolationBps: number;
    /** PERC-622: Oracle phase (0=Nascent, 1=Growing, 2=Mature) */
    oraclePhase: number;
    /** PERC-622: Cumulative trade volume in e6 format */
    cumulativeVolumeE6: bigint;
    /** PERC-622: Slots elapsed from market creation to Phase 2 entry (u24) */
    phase2DeltaSlots: number;
    /**
     * PERC-SetDexPool: Admin-pinned DEX pool pubkey for HYPERP markets.
     * Null when reading old slabs (pre-SetDexPool configLen < 528) or when
     * SetDexPool has never been called (all-zero pubkey).
     * Non-null means the program will reject any UpdateHyperpMark that passes
     * a different pool account.
     */
    dexPool: PublicKey | null;
}
interface InsuranceFund {
    balance: bigint;
    feeRevenue: bigint;
    isolatedBalance: bigint;
    isolationBps: number;
}
interface RiskParams {
    /**
     * @deprecated Split into hMin/hMax in v12.15 RiskParams. On V12_15 slabs this field returns
     * hMin for backwards compatibility. On pre-v12.15 slabs hMin/hMax both mirror this value.
     */
    warmupPeriodSlots: bigint;
    maintenanceMarginBps: bigint;
    initialMarginBps: bigint;
    tradingFeeBps: bigint;
    maxAccounts: bigint;
    newAccountFee: bigint;
    riskReductionThreshold: bigint;
    maintenanceFeePerSlot: bigint;
    maxCrankStalenessSlots: bigint;
    liquidationFeeBps: bigint;
    liquidationFeeCap: bigint;
    liquidationBufferBps: bigint;
    minLiquidationAbs: bigint;
    /** Minimum initial deposit to open an account (V12_1+ only) */
    minInitialDeposit: bigint;
    /** Minimum nonzero maintenance margin requirement (V12_1+ only) */
    minNonzeroMmReq: bigint;
    /** Minimum nonzero initial margin requirement (V12_1+ only) */
    minNonzeroImReq: bigint;
    /** Insurance fund floor (V12_1+ only) */
    insuranceFloor: bigint;
    /** Minimum horizon slots (v12.15+). Replaces warmupPeriodSlots. 0n on pre-v12.15 slabs. */
    hMin: bigint;
    /** Maximum horizon slots (v12.15+). 0n on pre-v12.15 slabs. */
    hMax: bigint;
}
interface EngineState {
    vault: bigint;
    insuranceFund: InsuranceFund;
    currentSlot: bigint;
    fundingIndexQpbE6: bigint;
    lastFundingSlot: bigint;
    /**
     * Funding rate per slot. On pre-v12.15 slabs: i64 in BPS units.
     * On v12.15+ slabs: i128 in e9 units (field renamed `funding_rate_e9` on-chain).
     */
    fundingRateBpsPerSlotLast: bigint;
    /**
     * Funding rate in e9 units (i128). v12.15+ only.
     * 0n on pre-v12.15 slabs.
     */
    fundingRateE9: bigint;
    /**
     * Market mode. v12.15+ only. 0 = Live, 1 = Resolved. null on pre-v12.15 slabs.
     */
    marketMode: 0 | 1 | null;
    lastCrankSlot: bigint;
    maxCrankStalenessSlots: bigint;
    totalOpenInterest: bigint;
    longOi: bigint;
    shortOi: bigint;
    cTot: bigint;
    pnlPosTot: bigint;
    /**
     * Matured (settled) positive PnL total (u128). v12.15+ only. 0n on pre-v12.15 slabs.
     */
    pnlMaturedPosTot: bigint;
    liqCursor: number;
    gcCursor: number;
    lastSweepStartSlot: bigint;
    lastSweepCompleteSlot: bigint;
    crankCursor: number;
    sweepStartIdx: number;
    lifetimeLiquidations: bigint;
    lifetimeForceCloses: bigint;
    netLpPos: bigint;
    lpSumAbs: bigint;
    lpMaxAbs: bigint;
    lpMaxAbsSweep: bigint;
    emergencyOiMode: boolean;
    emergencyStartSlot: bigint;
    lastBreakerSlot: bigint;
    numUsedAccounts: number;
    nextAccountId: bigint;
    markPriceE6: bigint;
    /** last_oracle_price (u64, e6). V12_15+ only. 0n on pre-v12.15. */
    oraclePriceE6: bigint;
    /** Cumulative funding numerator for long side (i128). 0n on pre-v12.17. */
    fLongNum: bigint;
    /** Cumulative funding numerator for short side (i128). 0n on pre-v12.17. */
    fShortNum: bigint;
    /** Count of accounts with negative PnL. 0n on pre-v12.17. */
    negPnlAccountCount: bigint;
    /** Last funding-sample price (u64 e6). 0n on pre-v12.17. */
    fundPxLast: bigint;
    /** Matured positive PnL total (u128). v12.15+ only. 0n on pre-v12.15 slabs. */
    resolvedKLongTerminalDelta: bigint;
    /** Terminal K delta for short side (i128). 0n on pre-v12.17. */
    resolvedKShortTerminalDelta: bigint;
    /** Live oracle price used during resolution (u64 e6). 0n on pre-v12.17. */
    resolvedLivePrice: bigint;
}
declare enum AccountKind {
    User = 0,
    LP = 1
}
/** Parsed reserve cohort (64 bytes on-chain). Raw bytes; structure is program-internal. */
type ReserveCohortBytes = Uint8Array;
interface Account {
    kind: AccountKind;
    accountId: bigint;
    capital: bigint;
    pnl: bigint;
    reservedPnl: bigint;
    /** @deprecated Removed in v12.15. Always 0n on V12_15 slabs. */
    warmupStartedAtSlot: bigint;
    /** @deprecated Removed in v12.15. Always 0n on V12_15 slabs. */
    warmupSlopePerStep: bigint;
    positionSize: bigint;
    /** Entry price in e6 units. Present in V12_15 (offset 120) and V_ADL/V12_1_EP. -1 signals absent. */
    entryPrice: bigint;
    fundingIndex: bigint;
    matcherProgram: PublicKey;
    matcherContext: PublicKey;
    owner: PublicKey;
    feeCredits: bigint;
    /** @deprecated Removed in v12.15. Always 0n on V12_15 slabs. */
    lastFeeSlot: bigint;
    /** Total fees earned over account lifetime (u128). Present from v12.15. 0n on older layouts. */
    feesEarnedTotal: bigint;
    /**
     * Reserve cohorts array (v12.15+). Up to 62 cohorts of 64 bytes each.
     * `null` on pre-v12.15 slabs. Parse the raw bytes according to the on-chain ReserveCohort struct.
     */
    exactReserveCohorts: ReserveCohortBytes[] | null;
    /** Number of active reserve cohorts (0-62). null on pre-v12.15 slabs. */
    exactCohortCount: number | null;
    /** Overflow (oldest) cohort raw bytes. null on pre-v12.15 slabs or when not present. */
    overflowOlder: ReserveCohortBytes | null;
    /** True if overflowOlder contains valid data. null on pre-v12.15 slabs. */
    overflowOlderPresent: boolean | null;
    /** Overflow (newest) cohort raw bytes. null on pre-v12.15 slabs or when not present. */
    overflowNewest: ReserveCohortBytes | null;
    /** True if overflowNewest contains valid data. null on pre-v12.15 slabs. */
    overflowNewestPresent: boolean | null;
    /** Per-account cumulative funding snapshot (i128). 0n on pre-v12.17 slabs. */
    fSnap: bigint;
    /** ADL A-basis snapshot (u128). 0n on pre-v12.17 slabs. */
    adlABasis: bigint;
    /** ADL K-coefficient snapshot (i128). 0n on pre-v12.17 slabs. */
    adlKSnap: bigint;
    /** ADL epoch snapshot (u64). 0n on pre-v12.17 slabs. */
    adlEpochSnap: bigint;
    /** True if the scheduled warmup bucket is active. null on pre-v12.17. */
    schedPresent: boolean | null;
    /** Remaining unreleased quantity in scheduled bucket. null on pre-v12.17. */
    schedRemainingQ: bigint | null;
    /** Anchor quantity for scheduled bucket. null on pre-v12.17. */
    schedAnchorQ: bigint | null;
    /** Start slot for scheduled bucket. null on pre-v12.17. */
    schedStartSlot: bigint | null;
    /** Warmup horizon for scheduled bucket. null on pre-v12.17. */
    schedHorizon: bigint | null;
    /** Release quantity for scheduled bucket. null on pre-v12.17. */
    schedReleaseQ: bigint | null;
    /** True if the pending warmup bucket is active. null on pre-v12.17. */
    pendingPresent: boolean | null;
    /** Remaining unreleased quantity in pending bucket. null on pre-v12.17. */
    pendingRemainingQ: bigint | null;
    /** Warmup horizon for pending bucket. null on pre-v12.17. */
    pendingHorizon: bigint | null;
    /** Creation slot for pending bucket. null on pre-v12.17. */
    pendingCreatedSlot: bigint | null;
}
declare function fetchSlab(connection: Connection, slabPubkey: PublicKey, expectedOwner?: PublicKey): Promise<Uint8Array>;
declare const RAMP_START_BPS = 1000n;
declare const DEFAULT_OI_RAMP_SLOTS = 432000n;
declare function computeEffectiveOiCapBps(config: MarketConfig, currentSlot: bigint): bigint;
declare function readNonce(data: Uint8Array): bigint;
declare function readLastThrUpdateSlot(data: Uint8Array): bigint;
/**
 * Parse slab header (first 72 bytes — layout-independent).
 */
declare function parseHeader(data: Uint8Array): SlabHeader;
declare function parseConfig(data: Uint8Array, layoutHint?: SlabLayout | null): MarketConfig;
/**
 * Parse RiskParams from engine data. Layout-version aware.
 * For V0 slabs, extended params (risk_threshold, maintenance_fee, etc.) are
 * not present on-chain, so defaults (0) are returned.
 *
 * @param data - Slab data (may be a partial slice; pass layoutHint in that case)
 * @param layoutHint - Pre-detected layout to use; if omitted, detected from data.length.
 */
declare function parseParams(data: Uint8Array, layoutHint?: SlabLayout | null): RiskParams;
/**
 * Parse RiskEngine state (excluding accounts array). Layout-version aware.
 */
declare function parseEngine(data: Uint8Array): EngineState;
/**
 * Read bitmap to get list of used account indices.
 */
/**
 * Return all account indices whose bitmap bit is set (i.e. slot is in use).
 * Uses the layout-aware bitmap offset so V1_LEGACY slabs (bitmap at rel+672) are handled correctly.
 */
declare function parseUsedIndices(data: Uint8Array): number[];
/**
 * Check if a specific account index is used.
 */
declare function isAccountUsed(data: Uint8Array, idx: number): boolean;
/**
 * Calculate the maximum valid account index for a given slab size.
 */
declare function maxAccountIndex(dataLen: number): number;
/**
 * Parse a single account by index.
 */
declare function parseAccount(data: Uint8Array, idx: number): Account;
/**
 * v17 account magic ("PERCV16\0" as little-endian u64).
 * Stored at bytes [0..8] of every v17 percolator-owned account.
 * bytes[0..8] = [0x00, 0x36, 0x31, 0x56, 0x43, 0x52, 0x45, 0x50]
 */
declare const V17_MAGIC = 5784119745589622272n;
/**
 * v18 account version (u16 at offset 8).
 *
 * Bumped 17 -> 18 by the v16-migration integration (percolator-prog
 * `sync/integration-v16`@a9318945, `v16_program.rs:72` `pub const VERSION:
 * u16 = 18`) — the identity-binding overhaul (market_id/intent_id/
 * authority_epoch CAS binding), PortfolioAccountV16's +24B identity trailer
 * (9539 -> 9563), and the AssetOracleProfileV16/AssetControlSequencesV16
 * per-asset slot growth (512 -> 1024) are all account-layout/wire-breaking.
 * Fails closed on any pre-migration (VERSION=17) account — those must be
 * re-seeded (F-01), not read with this parser. The constant keeps its
 * `V17_`-prefixed name for source-compat with existing callers; only the
 * value changed.
 */
declare const V17_EXPECTED_VERSION = 18;
/**
 * v17 account-kind byte (offset 10 of the 16-byte header).
 *
 * The program's `check_header()` discriminates EVERY v17 percolator-owned
 * account SOLELY by this byte (percolator-prog `v16_program.rs` KIND_*):
 *   1 = MARKET, 2 = PORTFOLIO, 3 = BACKING_DOMAIN_LEDGER, 4 = INSURANCE_LEDGER,
 *   5 = LP_VAULT_REGISTRY, 6 = LP_REDEMPTION, 7 = NFT_REGISTRY.
 * Only KIND_MARKET (1) carries the WrapperConfigV16 block parsed during market
 * discovery — every other kind shares the same magic+version and would falsely
 * pass the looser {@link isV17Account} check (#264).
 */
declare const V17_KIND_MARKET = 1;
/** Byte offset of the v17 account-kind discriminator within the header. */
declare const V17_KIND_OFF = 10;
/**
 * v17 wrapper config block length (WrapperConfigV16 = 576 bytes).
 *
 * Growth history, each stage purely additive at the tail with all earlier
 * offsets UNCHANGED:
 *   432 -> 496  protocol-fee program change: `protocol_fee_authority` [32]
 *               @432, `protocol_fee_accrued_atoms` u128 @464,
 *               `protocol_fee_withdrawn_atoms` u128 @480.
 *   496 -> 576  fee-collection split (percolator-prog
 *               feat/protocol-fee-taker-only@2b3a6a65): four u128 counters
 *               @496/512/528/544, three u16 shares @560/562/564, then
 *               `_padding_split` [u8;10] @566.
 *
 * ⚠ FIELD ORDER IN THE 496->576 BLOCK IS LOAD-BEARING. The struct derives
 * `bytemuck::Pod`, which forbids IMPLICIT padding. 496 is a multiple of 16, so
 * it is u128-aligned; placing the u16 shares first would push the u128s to
 * offset 502 and force the compiler to insert implicit padding, failing the
 * Pod derive. Counters therefore come first, then the shares, then EXPLICIT
 * padding out to the 16-byte alignment boundary.
 *
 * Verified against `percolator-prog/src/v16_program.rs` — `WRAPPER_CONFIG_LEN:
 * usize = 576` at line 58, struct `WrapperConfigV16` at line 1057, with a
 * compile-time `assert!(size_of::<WrapperConfigV16>() == WRAPPER_CONFIG_LEN)`
 * at line 1159.
 *
 * ⚠ NOT YET DEPLOYED. The devnet wrapper DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj
 * still carries the 496-byte layout. Reading a market created by that build
 * with this decoder will throw "data too short"; a 576-byte read against a
 * 496-byte account is a length error, not a silent misparse.
 */
declare const V17_WRAPPER_CONFIG_LEN = 576;
/**
 * Byte offset of `creator_fee_claimable_atoms` (u64 LE) RELATIVE TO THE START
 * OF THE WrapperConfigV16 BLOCK. Absolute offset in a market-group account is
 * `V17_HEADER_LEN + V17_CREATOR_FEE_CLAIMABLE_OFF` = 16 + 568 = 584.
 *
 * ADDITIVE AND IN-PLACE: the field was carved out of the existing 10-byte
 * `_padding_split` tail at the only 8-aligned slot inside it, so
 * {@link V17_WRAPPER_CONFIG_LEN} stays 576, {@link V17_MARKET_GROUP_OFF} stays
 * 592, and NO pre-existing offset moves. Growing the config instead would have
 * shifted every asset-profile offset and bricked the already-deployed 576-byte
 * markets — a repeat of the 496→576 incident. If you ever find yourself
 * changing V17_WRAPPER_CONFIG_LEN because of this field, something is wrong.
 *
 * Source of truth: percolator-prog `src/v16_program.rs` struct
 * `WrapperConfigV16` (`creator_fee_claimable_atoms: u64` after
 * `_padding_split: [u8; 2]`), guarded on the Rust side by
 * `const _: () = assert!(size_of::<WrapperConfigV16>() == WRAPPER_CONFIG_LEN)`.
 */
declare const V17_CREATOR_FEE_CLAIMABLE_OFF = 568;
/**
 * v18 AssetOracleProfileV16 length (integration `a9318945`, `sync/integration-v16`).
 *
 * Grew 400 -> 512 across several PURELY ADDITIVE tail-append merges, none of
 * which moved any pre-existing offset (all confirmed by the wrapper's own
 * `const _: () = assert!(size_of::<AssetOracleProfileV16>() == ASSET_ORACLE_PROFILE_LEN)`
 * compile-time guard):
 *   400 -> 408  GH#420 `creator_fee_claimable_atoms: u64` (per-asset creator
 *               fee counter — see {@link AssetOracleProfileV17.creatorFeeClaimableAtoms}).
 *   408 -> 432  GH#444 `maintenance_fee_checkpoint_slot: u64` +
 *               `maintenance_fee_previous_rate: u128`.
 *   432 -> 464  zero-move-funding accrual: `funding_mark_e6`/
 *               `funding_mark_pending_e6`/`funding_mark_pending_slot` (3×u64)
 *               + `price_move_remainder_bps_num`(u16) carved from padding +
 *               explicit `_padding1`.
 *   464 -> 480  `terminal_slab_scan_progress: u128` (CloseSlab windowed scan cursor).
 *   480 -> 496  TB-1a `next_portfolio_id: u64` + explicit `_padding2`.
 *   496 -> 512  TB-3 `insurance_top_up: u64` + `backing_top_up: u64` (one-shot
 *               top-up replay nonces).
 * The fixed per-asset wrapper slot ({@link V17_ASSET_ORACLE_WRAPPER_LEN})
 * separately grew 512 -> 1024 (TB-2a, to fit `AssetControlSequencesV16` +
 * W4-AE-84's `protocol_fee_authority_epoch`) — see that constant's own doc
 * comment. `ASSET_ORACLE_PROFILE_LEN` itself (this constant) stops at 512;
 * [512, 1024) is the control-sequences region + spare headroom, not part of
 * the profile struct.
 */
declare const V17_ASSET_ORACLE_PROFILE_LEN = 512;
/**
 * v18 fixed per-asset wrapper slot size (integration `a9318945`). Grew
 * 512 -> 1024 (TB-2a, "asset control-sequences infra") to fit
 * `AssetControlSequencesV16` (88B, {@link V17_ASSET_CONTROL_SEQUENCES_LEN})
 * immediately after the profile, plus W4-AE-84's market-wide
 * `protocol_fee_authority_epoch` counter (8B,
 * {@link V17_PROTOCOL_FEE_AUTHORITY_EPOCH_OFF}) — 1024 was the smallest
 * engine-precedented `MarketWrapperPod` array length above 512 (the engine's
 * `impl_market_wrapper_pod_for_byte_arrays!` macro only covers a fixed list:
 * 0..=32, 64, 128, 256, 512, 1024).
 *
 * Layout inside this 1024-byte slot:
 *   [   0,  512) AssetOracleProfileV16 ({@link V17_ASSET_ORACLE_PROFILE_LEN})
 *   [ 512,  600) AssetControlSequencesV16 (88B, {@link V17_ASSET_CONTROL_SEQUENCES_OFF})
 *   [ 600,  608) protocol_fee_authority_epoch (8B, asset-0 slot only, {@link V17_PROTOCOL_FEE_AUTHORITY_EPOCH_OFF})
 *   [ 608, 1024) spare headroom (416B)
 */
declare const V17_ASSET_ORACLE_WRAPPER_LEN = 1024;
/**
 * v18 NEW: byte offset of `AssetControlSequencesV16` within each asset's
 * {@link V17_ASSET_ORACLE_WRAPPER_LEN}-byte wrapper slot. Collapses to
 * `= V17_ASSET_ORACLE_PROFILE_LEN` (TB-2a, matching upstream `ef3b1a55`'s own definition).
 */
declare const V17_ASSET_CONTROL_SEQUENCES_OFF = 512;
/**
 * v18 NEW: `size_of::<AssetControlSequencesV16>()` — 9 strictly-increasing
 * replay-nonce lanes (oracle_observation, backing_fee_long, backing_fee_short,
 * trade_fee, liquidation_fee, maintenance_fee, fee_redirect, market_init_fee,
 * permissionless_resolve) + TB-2b's `authority_epoch` CAS lane + an 8B
 * reserved tail, matching upstream `ef3b1a55`'s struct size exactly (88B total).
 */
declare const V17_ASSET_CONTROL_SEQUENCES_LEN = 88;
/**
 * v18 NEW (W4-AE-84): byte offset of the market-wide
 * `protocol_fee_authority_epoch` CAS counter, gating `WithdrawProtocolFee`
 * (tag 84) against a replayed signed withdrawal surviving an intervening
 * `SetProtocolFeeAuthority` (tag 85) A->B->A cycle. Market-wide, not
 * per-asset — only asset 0's copy is ever read or written (same precedent as
 * `AssetOracleProfileV16::maintenance_fee_checkpoint_slot`/
 * `terminal_slab_scan_progress`).
 */
declare const V17_PROTOCOL_FEE_AUTHORITY_EPOCH_OFF: number;
/** A single u64 counter — no struct needed. */
declare const V17_PROTOCOL_FEE_AUTHORITY_EPOCH_LEN = 8;
/** Decoded `AssetControlSequencesV16` — per-asset replay-nonce/CAS watermarks (v18 NEW, TB-2a/TB-2b). */
interface AssetControlSequencesV17 {
    /** Strictly-increasing replay nonce for ConfigureHybridOracle/ConfigureEwmaMark/PushEwmaMark/ConfigureAuthMark/PushAuthMark/RestartAssetOracle's `observation_sequence`. */
    oracleObservation: bigint;
    /** Strictly-increasing replay nonce for UpdateBackingFeePolicy's long-domain `policy_sequence`. */
    backingFeeLong: bigint;
    /** Strictly-increasing replay nonce for UpdateBackingFeePolicy's short-domain `policy_sequence`. */
    backingFeeShort: bigint;
    /** Strictly-increasing replay nonce for UpdateTradeFeePolicy's `policy_sequence`. */
    tradeFee: bigint;
    /** Strictly-increasing replay nonce for UpdateLiquidationFeePolicy's `policy_sequence`. */
    liquidationFee: bigint;
    /** Strictly-increasing replay nonce for UpdateMaintenanceFeePolicy's `policy_sequence`. */
    maintenanceFee: bigint;
    /** Strictly-increasing replay nonce for UpdateFeeRedirectPolicy's `policy_sequence`. */
    feeRedirect: bigint;
    /** Strictly-increasing replay nonce for UpdateMarketInitFeePolicy's `policy_sequence`. */
    marketInitFee: bigint;
    /** Strictly-increasing replay nonce for ConfigurePermissionlessResolve's `policy_sequence`. */
    permissionlessResolve: bigint;
    /**
     * CAS (compare-and-swap) counter for `UpdateAssetAuthority` (tag 65) and
     * every other tag CAS-bound to THIS asset's `authority_epoch` lane
     * (WithdrawBackingBucket-50, WithdrawBackingBucketEarnings-52,
     * WithdrawInsuranceAsset-57, UpdateFeeSplit-86, WithdrawCreatorFee-90,
     * UpdateInsuranceWithdrawPolicy-92 where applicable). Pass the value read
     * here as the LIVE current epoch — NOT current+1 — to every such
     * instruction's `authorityEpoch` argument.
     */
    authorityEpoch: bigint;
}
/**
 * Parse `AssetControlSequencesV16` for one asset within a v18 market account
 * (v18 NEW, TB-2a/TB-2b).
 *
 * @param data       Raw market-group account bytes.
 * @param assetSlotOff  Absolute byte offset where this asset's
 *   {@link V17_ASSET_ORACLE_WRAPPER_LEN}-byte wrapper slot starts (i.e. the
 *   SAME offset passed as `profileOff` to {@link parseAssetOracleProfileV17}).
 * @returns Decoded control-sequences state.
 * @throws If `data` is too short to hold the control-sequences region.
 */
declare function parseAssetControlSequencesV17(data: Uint8Array, assetSlotOff: number): AssetControlSequencesV17;
/**
 * Parse the market-wide `protocol_fee_authority_epoch` counter (v18 NEW,
 * W4-AE-84). Lives at a fixed offset inside ASSET 0's wrapper slot only —
 * pass asset 0's slot offset (the SAME value used for asset index 0's
 * {@link parseAssetOracleProfileV17}/{@link parseAssetControlSequencesV17} calls).
 *
 * @param data          Raw market-group account bytes.
 * @param asset0SlotOff Absolute byte offset where ASSET 0's wrapper slot starts.
 * @returns The live `protocol_fee_authority_epoch` value — pass this as
 *   `authorityEpoch` to {@link encodeWithdrawProtocolFee} (CAS, expected-current).
 */
declare function parseProtocolFeeAuthorityEpoch(data: Uint8Array, asset0SlotOff: number): bigint;
/** v17 header length (16 bytes: magic[8] + version[2] + kind[1] + pad[1] + reserved[4]). */
declare const V17_HEADER_LEN = 16;
/**
 * v17 market group config offset = HEADER_LEN + WRAPPER_CONFIG_LEN = 592
 * (was 512 pre-fee-split when WRAPPER_CONFIG_LEN was 496, and 448 before the
 * protocol-fee change when it was 432). DERIVED, never hardcoded — every
 * downstream offset in this file chains off it.
 */
declare const V17_MARKET_GROUP_OFF: number;
/**
 * v18 MarketGroupV16HeaderAccount size (758 bytes, UNCHANGED by the
 * v16-migration) and per-asset slot stride, verified against percolator-prog
 * `cargo run --example dump_layout` on integration branch
 * `sync/integration-v16`@a9318945.
 *
 * Per-asset slot stride grew 1797 -> 2325 (+528): `MARKET_ASSET_SLOT_LEN =
 * size_of::<Market<[u8; ASSET_ORACLE_WRAPPER_LEN]>>()` and
 * `ASSET_ORACLE_WRAPPER_LEN` itself grew 512 -> 1024 (+512, TB-2a's
 * `AssetControlSequencesV16` + W4-AE-84's `protocol_fee_authority_epoch` —
 * see {@link V17_ASSET_ORACLE_PROFILE_LEN}), and the engine-owned
 * `EngineAssetSlotV16Account` (the part of the slot AFTER the wrapper
 * prefix) independently grew 1285 -> 1301 (+16, one extra `u64` field inside
 * `AssetStateV16Account` — see {@link V17_ASSET_STATE_OI_LONG_REL}). Ground
 * truth: `cargo run --example dump_layout` printed `market slot stride=2325`
 * directly (not hand-derived from the two deltas above).
 */
declare const V17_MARKET_GROUP_LEN = 758;
declare const V17_MARKET_ASSET_SLOT_LEN = 2325;
/**
 * Exact byte length of a v17 market (slab) account for a given asset-slot capacity, matching the
 * program's state::market_account_len_for_capacity. v17 markets are DYNAMICALLY sized — the wrapper's
 * InitMarket validates that (len - V17_MARKET_GROUP_OFF - V17_MARKET_GROUP_LEN) is an exact multiple of
 * V17_MARKET_ASSET_SLOT_LEN, so a v12 SLAB_TIERS byte count (e.g. 992_568) makes InitMarket REVERT.
 * Size the account with this for maxPortfolioAssets (cap-1 = 3003, cap-14 = 26_364).
 */
declare function v17MarketAccountLen(maxPortfolioAssets: number): number;
/**
 * v18 portfolio account total length (integration `a9318945`,
 * `sync/integration-v16`) = HEADER_LEN(16) + PortfolioAccountV16Account(9419)
 * + PORTFOLIO_MATCHER_CONFIG_LEN(104) + PORTFOLIO_IDENTITY_TRAILER_LEN(24) =
 * 9563. Single source of truth for the System.createAccount size/rent: the
 * program's InitPortfolio reallocs UP to this and adds no lamports, so an
 * undersized createAccount (e.g. 2048) leaves the account below rent-exempt
 * -> InitPortfolio fails with InsufficientFundsForRent. (Matches the
 * keeper's getProgramAccounts dataSize filter.)
 *
 * FLAGGED DISCREPANCY vs the wrapper_scope spec summary (WRAPPER_SYNC_LOCKED_WIRE.md
 * says "was 9539", i.e. the v18 total minus ONLY TB-1a's +24B identity
 * trailer): this SDK's prior VERSION-17 value was 9347, not 9539. The full
 * 9347 -> 9563 delta (+216B) is NOT purely the wrapper's +24B trailer —
 * ground-truthed via `cargo run --example dump_layout` (offset_of! against
 * the pinned engine, `~/percolator` @ c141d47f) against BOTH the deployed
 * wrapper's engine snapshot and the integration branch's:
 *   - PortfolioAccountV16Account itself (engine-owned, percolator-core, NOT
 *     a wrapper-source change) grew 9227 -> 9419 (+192B): FOUR new
 *     `V16PodU128` fields (`funding_long_paid_atoms_total`,
 *     `funding_long_received_atoms_total`, `funding_short_paid_atoms_total`,
 *     `funding_short_received_atoms_total`, 64B) were inserted between
 *     `residual_received_atoms_total` and `fee_credits`, AND
 *     `PortfolioLegV16Account` gained a `kf_epoch_snap: V16PodU64` field
 *     (inserted between `f_snap` and `epoch_snap`), growing each of the 16
 *     legs 144 -> 152 bytes (128B across all legs). 64 + 128 = 192B,
 *     confirmed against the engine's own
 *     `assert!(size_of::<PortfolioAccountV16Account>() == 9419)` compile-time
 *     guard (`~/percolator/src/v16.rs`).
 *   - The wrapper's own +24B identity trailer (TB-1a: portfolio_id,
 *     matcher_sequence/expected_sequence, matcher_expiry_slot) accounts for
 *     the remaining 24B, confirmed against `PORTFOLIO_ACCOUNT_LEN == 9563`
 *     (`percolator-prog/src/v16_program.rs`, compile-time-asserted).
 * This is a real engine-crate delta this migration's own doc summary did not
 * enumerate — see {@link PortfolioV17} / {@link parsePortfolioV17} for how
 * the new fields are decoded.
 */
declare const V17_PORTFOLIO_ACCOUNT_LEN = 9563;
/** `PortfolioLegV16Account` grew 144 -> 152 bytes: see {@link V17_PORTFOLIO_ACCOUNT_LEN}'s doc comment. */
declare const V17_PORTFOLIO_LEG_SIZE = 152;
/**
 * The wrapper-owned identity trailer appended AFTER `PortfolioMatcherConfigV16`
 * (TB-1a): `portfolio_id: u64` + `matcher_sequence(expected_sequence): u64` +
 * `matcher_expiry_slot: u64` = 24 bytes total.
 */
declare const V17_PORTFOLIO_IDENTITY_TRAILER_LEN = 24;
/**
 * Parsed WrapperConfigV16 — the 496-byte v17 market config block.
 *
 * Field offsets follow SBF alignment (u128 align=8, not 16).
 * Full offset table (verified against v17 wrapper source v16_program.rs,
 * protocol-fee branch feat/protocol-fee-taker-only@626fb617):
 *   0   marketauth [32]
 *   32  collateral_mint [32]
 *   64  secondary_collateral_mint [32]
 *   96  maintenance_fee_per_slot u128
 *  112  permissionless_market_init_fee u128
 *  128  trade_fee_base_bps u64
 *  136  permissionless_resolve_stale_slots u64
 *  144  force_close_delay_slots u64
 *  152  last_good_oracle_slot u64
 *  160  insurance_withdraw_deposit_remaining u128
 *  176  insurance_withdraw_max_bps u16
 *  178  liquidation_cranker_fee_share_bps u16
 *  180  maintenance_cranker_fee_share_bps u16
 *  182  backing_trade_fee_bps_long u16
 *  184  unit_scale u32
 *  188  conf_filter_bps u16
 *  190  backing_trade_fee_bps_short u16
 *  192  insurance_withdraw_deposits_only u8
 *  193  oracle_mode u8
 *  194  oracle_leg_count u8
 *  195  oracle_leg_flags u8
 *  196  invert u8
 *  197  _padding0 u8
 *  198  free_market_slot_count u16
 *  200  insurance_withdraw_cooldown_slots u64
 *  208  last_insurance_withdraw_slot u64
 *  216  max_staleness_secs u64
 *  224  hybrid_soft_stale_slots u64
 *  232  mark_ewma_e6 u64
 *  240  mark_ewma_last_slot u64
 *  248  mark_ewma_halflife_slots u64
 *  256  mark_min_fee u64
 *  264  oracle_target_price_e6 u64
 *  272  oracle_target_publish_time i64
 *  280  oracle_leg_feeds [[u8;32];3] (96B)
 *  376  oracle_leg_prices_e6 [u64;3] (24B)
 *  400  oracle_leg_publish_times [i64;3] (24B)
 *  424  backing_trade_fee_policy_count u16
 *  426  backing_trade_fee_insurance_share_bps_long u16
 *  428  backing_trade_fee_insurance_share_bps_short u16
 *  430  fee_redirect_to_market_0_bps u16
 *  --- protocol-fee program change (additive tail, offsets 0..431 unchanged) ---
 *  432  protocol_fee_authority [32]
 *  464  protocol_fee_accrued_atoms u128
 *  480  protocol_fee_withdrawn_atoms u128
 *  --- fee-collection split (additive tail, offsets 0..495 unchanged) ---
 *  --- ORDER IS LOAD-BEARING: u128 counters MUST precede the u16 shares ---
 *  496  lp_fee_accrued_atoms u128
 *  512  lp_fee_withdrawn_atoms u128
 *  528  insurance_reserve_accrued_atoms u128
 *  544  insurance_reserve_withdrawn_atoms u128
 *  560  creator_share_bps u16
 *  562  lp_share_bps u16
 *  564  insurance_share_bps u16
 *  566  _padding_split [u8;2]              (was [u8;10] pre-creator-fee-claim)
 *  --- creator fee claim (2026-07-23) — IN-PLACE, consumes the pad tail ---
 *  568  creator_fee_claimable_atoms u64    (NEW; WRAPPER_CONFIG_LEN still 576)
 *  Total: 576
 */
interface WrapperConfigV17 {
    marketauth: PublicKey;
    collateralMint: PublicKey;
    secondaryCollateralMint: PublicKey;
    maintenanceFeePerSlot: bigint;
    permissionlessMarketInitFee: bigint;
    tradeFeeBps: bigint;
    permissionlessResolveStaleSlots: bigint;
    forceCloseDelaySlots: bigint;
    lastGoodOracleSlot: bigint;
    insuranceWithdrawDepositRemaining: bigint;
    insuranceWithdrawMaxBps: number;
    liquidationCrankerFeeShareBps: number;
    maintenanceCrankerFeeShareBps: number;
    backingTradeFeeBpsLong: number;
    unitScale: number;
    confFilterBps: number;
    backingTradeFeeBpsShort: number;
    insuranceWithdrawDepositsOnly: number;
    oracleMode: number;
    oracleLegCount: number;
    oracleLegFlags: number;
    invert: number;
    freeMarketSlotCount: number;
    insuranceWithdrawCooldownSlots: bigint;
    lastInsuranceWithdrawSlot: bigint;
    maxStalenessSecs: bigint;
    hybridSoftStaleSlots: bigint;
    markEwmaE6: bigint;
    markEwmaLastSlot: bigint;
    markEwmaHalflifeSlots: bigint;
    markMinFee: bigint;
    oracleTargetPriceE6: bigint;
    oracleTargetPublishTime: bigint;
    oracleLegFeeds: PublicKey[];
    oracleLegPricesE6: bigint[];
    oracleLegPublishTimes: bigint[];
    backingTradeFeePolicyCount: number;
    backingTradeFeeInsuranceShareBpsLong: number;
    backingTradeFeeInsuranceShareBpsShort: number;
    feeRedirectToMarket0Bps: number;
    /**
     * Destination pubkey for the protocol's accrued fee share. Set to a
     * hardcoded program-level constant at InitMarket; rotatable only via
     * SetProtocolFeeAuthority (tag 85, upgrade-authority-gated). NOT settable
     * by marketauth/insurance_authority/any creator-facing gate.
     */
    protocolFeeAuthority: PublicKey;
    /**
     * Cumulative atoms ever accrued to the protocol's claim (monotonic). Never
     * itself credited into any domain's insurance budget — tracks an
     * unbudgeted slice of header.insurance no insurance_operator can reach.
     */
    protocolFeeAccruedAtoms: bigint;
    /**
     * Cumulative atoms ever paid out via WithdrawProtocolFee (tag 84).
     * Monotonic, always <= protocolFeeAccruedAtoms. Claim capacity =
     * protocolFeeAccruedAtoms - protocolFeeWithdrawnAtoms.
     */
    protocolFeeWithdrawnAtoms: bigint;
    /**
     * Cumulative atoms accrued to the LP vault's claim (monotonic). Claimed via
     * LpVaultCrankFees (tag 78), which reclassifies them into LP backing
     * principal.
     *
     * ⚠ LP yield is JUNIOR at-risk backing capital, not a senior earnings claim:
     * it can be impaired by backing losses between crank and redemption.
     *
     * ⚠ Tag 78 is Live-only, so LP fees accrued on a market that later Resolves
     * can never be cranked. Outstanding = accrued - withdrawn.
     */
    lpFeeAccruedAtoms: bigint;
    /** Cumulative atoms already credited to the LP vault. <= lpFeeAccruedAtoms. */
    lpFeeWithdrawnAtoms: bigint;
    /**
     * Cumulative atoms accrued to the insurance/staker leg (monotonic). Claimed
     * via WithdrawInsuranceReserveToStake (tag 87), which transfers them to the
     * bound stake pool's vault.
     *
     * ⚠ Tag 87 is Live-only and ResolveMarket is one-way, so any
     * accrued-but-unwithdrawn amount is PERMANENTLY FORFEITED once the market
     * resolves — WithdrawInsuranceAsset cannot recover it, because this leg is
     * unbudgeted by construction. Keepers should crank before resolution.
     */
    insuranceReserveAccruedAtoms: bigint;
    /** Cumulative atoms already pushed to the stake vault. <= insuranceReserveAccruedAtoms. */
    insuranceReserveWithdrawnAtoms: bigint;
    /**
     * Creator's share of T in bps. Default 1600, ceiling MAX_CREATOR_SHARE_BPS
     * (3600). Lands in insurance_domain_budget; claimed via
     * WithdrawInsuranceAsset (tag 57).
     */
    creatorShareBps: number;
    /** LP vault's share of T in bps. Default 4800, floor MIN_LP_SHARE_BPS (3200). */
    lpShareBps: number;
    /**
     * Insurance/staker share of T in bps. Default 1600, floor
     * MIN_INSURANCE_SHARE_BPS (1200). Also absorbs all sub-atom rounding, since
     * split_trade_fee computes this leg as the remainder.
     */
    insuranceShareBps: number;
    /**
     * Creator's UNCLAIMED trade-fee revenue, in collateral atoms (u64 at
     * {@link V17_CREATOR_FEE_CLAIMABLE_OFF} = 568).
     *
     * This is the honest claimable balance a creator-claim UI should display.
     * Before the creator-fee-claim change the creator leg was credited into the
     * asset's insurance DOMAIN BUDGET — the loss backstop — so "creator earned X"
     * had no on-chain representation at all and a claim button was really a
     * backstop withdrawal. The leg now lands here instead and leaves the backstop
     * alone.
     *
     * ⚠ NOT MONOTONIC and NOT an accrued/withdrawn pair. Unlike the protocol / LP
     * / insurance legs above, this is a single live balance: trades add to it and
     * WithdrawCreatorFee (tag 90) is the only thing that subtracts from it. It
     * therefore CANNOT be used to derive lifetime creator revenue — only what is
     * claimable right now. (Forced by the 10-byte pad budget; see
     * V17_CREATOR_FEE_CLAIMABLE_OFF.)
     *
     * ⚠ Markets created by a pre-upgrade build read `0n` here: bytes 568..576
     * were explicit padding, so the value is well-defined rather than garbage,
     * and the counter simply accrues fresh after an in-place upgrade.
     */
    creatorFeeClaimableAtoms: bigint;
}
/**
 * Parse a v17 WrapperConfigV16 block from raw account data.
 *
 * The config block starts at offset `configOff` (default: V17_HEADER_LEN = 16).
 *
 * IMPORTANT: v17 uses a completely different account structure from v12.x slabs.
 * This function reads the 496-byte wrapper config block directly. It does NOT
 * validate the account header magic or version — callers must do that separately.
 *
 * @param data      Raw bytes of the market group account.
 * @param configOff Byte offset where the WrapperConfigV16 block starts (default 16).
 * @returns Parsed WrapperConfigV17 object.
 *
 * @example
 * ```ts
 * const accountInfo = await connection.getAccountInfo(marketGroupPubkey);
 * if (!accountInfo) throw new Error("account not found");
 * const magic = readU64FromBytes(accountInfo.data, 0);
 * if (magic !== V17_MAGIC) throw new Error("not a v17 account");
 * const config = parseWrapperConfigV17(accountInfo.data);
 * console.log(config.collateralMint.toBase58());
 * ```
 */
declare function parseWrapperConfigV17(data: Uint8Array, configOff?: number): WrapperConfigV17;
/**
 * Parsed AssetOracleProfileV16 — the 400-byte per-asset profile in a v17 asset slot.
 *
 * Field offsets (SBF alignment, verified against v16_program.rs AssetOracleProfileV16):
 *   0   oracle_mode u8
 *   1   oracle_leg_count u8
 *   2   oracle_leg_flags u8
 *   3   invert u8
 *   4   unit_scale u32
 *   8   conf_filter_bps u16
 *  10   backing_trade_fee_bps_long u16
 *  12   backing_trade_fee_bps_short u16
 *  14   backing_trade_fee_insurance_share_bps_long u16
 *  16   backing_trade_fee_insurance_share_bps_short u16
 *  18   _padding0 [u8;6]
 *  24   insurance_authority [32]
 *  56   insurance_operator [32]
 *  88   backing_bucket_authority [32]
 * 120   oracle_authority [32]
 * 152   max_staleness_secs u64
 * 160   hybrid_soft_stale_slots u64
 * 168   mark_ewma_e6 u64
 * 176   mark_ewma_last_slot u64
 * 184   mark_ewma_halflife_slots u64
 * 192   mark_min_fee u64
 * 200   oracle_target_price_e6 u64
 * 208   oracle_target_publish_time i64
 * 216   last_good_oracle_slot u64
 * 224   oracle_leg_feeds [[u8;32];3] (96B)
 * 320   oracle_leg_prices_e6 [u64;3] (24B)
 * 344   oracle_leg_publish_times [i64;3] (24B)
 * 368   asset_admin [32]  ← v17 NEW
 * Total: 400
 */
interface AssetOracleProfileV17 {
    oracleMode: number;
    oracleLegCount: number;
    oracleLegFlags: number;
    invert: number;
    unitScale: number;
    confFilterBps: number;
    backingTradeFeeBpsLong: number;
    backingTradeFeeBpsShort: number;
    backingTradeFeeInsuranceShareBpsLong: number;
    backingTradeFeeInsuranceShareBpsShort: number;
    insuranceAuthority: PublicKey;
    insuranceOperator: PublicKey;
    backingBucketAuthority: PublicKey;
    oracleAuthority: PublicKey;
    maxStalenessSecs: bigint;
    hybridSoftStaleSlots: bigint;
    markEwmaE6: bigint;
    markEwmaLastSlot: bigint;
    markEwmaHalflifeSlots: bigint;
    markMinFee: bigint;
    oracleTargetPriceE6: bigint;
    oracleTargetPublishTime: bigint;
    lastGoodOracleSlot: bigint;
    oracleLegFeeds: PublicKey[];
    oracleLegPricesE6: bigint[];
    oracleLegPublishTimes: bigint[];
    /** v17 NEW: asset_admin pubkey at offset 368. */
    assetAdmin: PublicKey;
    /** v18 NEW (GH#420, offset 400): this asset's unclaimed creator share of trade fees. Claim via {@link encodeWithdrawCreatorFee}. */
    creatorFeeClaimableAtoms: bigint;
    /** v18 NEW (GH#444, offset 408): slot at which `maintenance_fee_per_slot` last changed (asset-0 only; market-wide). */
    maintenanceFeeCheckpointSlot: bigint;
    /** v18 NEW (GH#444, offset 416): the maintenance fee rate in force before the last change (asset-0 only; market-wide). */
    maintenanceFeePreviousRate: bigint;
    /** v18 NEW (zero-move-funding, offset 432): mark whose premium applies at the engine asset's current slot. Zero = not-yet-initialized. */
    fundingMarkE6: bigint;
    /** v18 NEW (offset 440): first prospective mark that must not affect funding before its slot. */
    fundingMarkPendingE6: bigint;
    /** v18 NEW (offset 448): slot at which `fundingMarkPendingE6` takes effect. */
    fundingMarkPendingSlot: bigint;
    /** v18 NEW (offset 456): canonical price-move-cap numerator remainder carried across accrual calls. */
    priceMoveRemainderBpsNum: number;
    /** v18 NEW (offset 464): CloseSlab windowed terminal-slab-scan continuation cursor (asset-0 only; market-wide). 0 = start of scan. */
    terminalSlabScanProgress: bigint;
    /** v18 NEW (TB-1a, offset 480): market-scoped monotonic counter allocating each `InitPortfolio`'s `portfolio_id` (asset-0 only; market-wide). */
    nextPortfolioId: bigint;
    /** v18 NEW (TB-3, offset 496): one-shot replay nonce for TopUpInsurance(9)/TopUpInsuranceDomain(56) — asset-0 only, market-wide, shared by both entrypoints. */
    insuranceTopUp: bigint;
    /** v18 NEW (TB-3, offset 504): one-shot replay nonce for TopUpBackingBucket(24), keyed per-asset (`domain / 2`). */
    backingTopUp: bigint;
}
/**
 * Parse a v18 AssetOracleProfileV16 block from raw account data (integration
 * `a9318945`). See {@link V17_ASSET_ORACLE_PROFILE_LEN}'s doc comment for the
 * full 400 -> 512 tail-append history.
 *
 * @param data      Raw bytes containing the profile block.
 * @param profileOff Byte offset where the AssetOracleProfileV16 starts.
 * @returns Parsed AssetOracleProfileV17 object.
 */
declare function parseAssetOracleProfileV17(data: Uint8Array, profileOff: number): AssetOracleProfileV17;
/**
 * Check if a raw account buffer contains a v17 percolator account.
 *
 * @param data Raw account bytes.
 * @returns true if magic == V17_MAGIC and version == V17_EXPECTED_VERSION.
 */
declare function isV17Account(data: Uint8Array): boolean;
/**
 * Check if a raw account buffer is a v17 percolator MARKET account.
 *
 * Stricter than {@link isV17Account}: requires both that the account is a valid
 * v17 account (magic + version) AND that the kind byte at offset 10 is
 * {@link V17_KIND_MARKET}. Portfolio / ledger / registry accounts share the same
 * magic+version and so pass `isV17Account`, but they are NOT markets and do not
 * carry a WrapperConfigV16 block — market discovery must gate on this (#264).
 *
 * @param data Raw account bytes.
 * @returns true if the account is a v17 account whose kind == KIND_MARKET (1).
 */
declare function isV17MarketAccount(data: Uint8Array): boolean;
/**
 * Aggregated open-interest parsed from a v17 market group account.
 *
 * The v17 engine stores OI per-asset (per Market<T> slot) as oi_eff_long_q and
 * oi_eff_short_q in AssetStateV16Account. This parser sums across all capacity
 * slots in the account and also returns per-asset breakdown.
 *
 * All quantities are in token micro-units (raw, not scaled by decimals).
 */
interface V17MarketGroupOI {
    /** Group-level insurance reserve (u128, micro-units) */
    insuranceBalance: bigint;
    /** Sum of oi_eff_long_q across all asset slots */
    totalLongOiQ: bigint;
    /** Sum of oi_eff_short_q across all asset slots */
    totalShortOiQ: bigint;
    /** Per-slot breakdown (only slots where at least one side is non-zero) */
    assets: Array<{
        assetIndex: number;
        oiEffLongQ: bigint;
        oiEffShortQ: bigint;
    }>;
}
/**
 * Parse open-interest fields from a v17 market group account.
 *
 * Reads the group-level insurance balance from MarketGroupV16HeaderAccount and
 * iterates every asset-slot capacity to accumulate oi_eff_long_q / oi_eff_short_q
 * from AssetStateV16Account (the first sub-struct of EngineAssetSlotV16Account
 * which follows the 1024-byte wrapper T ({@link V17_ASSET_ORACLE_WRAPPER_LEN}) at the start of each slot).
 *
 * Relative offsets verified with `offset_of!` against the engine's own `#[repr(C)]`
 * structs (`percolator/src/v16.rs`): `MarketGroupV16HeaderAccount::insurance` @ 301,
 * `AssetStateV16Account::oi_eff_long_q` @ 289 (= 49 + 15 x 16), `oi_eff_short_q` @ 305. Every
 * `V16Pod*` field is an align-1 `[u8; N]` and the structs derive `bytemuck::Pod`
 * (which forbids implicit padding), so these are exact byte offsets.
 *
 * The absolute offsets below follow from the CURRENT wrapper layout —
 * WRAPPER_CONFIG_LEN = 576 and V17_MARKET_GROUP_OFF = 16 + 576 = 592
 * (`v16_program.rs` HEADER_LEN/WRAPPER_CONFIG_LEN, with a compile-time
 * `assert!(size_of::<WrapperConfigV16>() == WRAPPER_CONFIG_LEN)`):
 * - slots base:        V17_MARKET_GROUP_OFF(592) + V17_MARKET_GROUP_LEN(758) = 1350
 * - insurance:         592 + 301 = 893
 * - oi_eff_long_q(i):  1350 + i×2325 + 1024 + 289 = 2663 + i×2325
 * - oi_eff_short_q(i): 1350 + i×2325 + 1024 + 305 = 2679 + i×2325
 *
 * (Pre-v18 these read 273 / 289 over a 512-byte wrapper and 1797-byte slots; the
 * constants V17_ASSET_STATE_OI_LONG_REL / _SHORT_REL below were already moved to
 * 289 / 305 and checked against a live devnet slab with open interest - only this
 * comment still quoted the old numbers.)
 *
 * (This block previously quoted 432/496 and 448/512 from a pre-fee-split layout,
 * giving insurance @ 813. The CODE was always correct — it composes the named
 * constants — but the stated numbers were stale. Verified against the first real
 * v17 market on the new devnet deployment.)
 *
 * @param data  Raw bytes of the v17 market group account.
 * @returns Parsed V17MarketGroupOI — zero OI when no active positions exist.
 * @throws Error if the buffer is not a valid v17 market account or is too short.
 *
 * @example
 * ```ts
 * const info = await connection.getAccountInfo(marketGroupPk);
 * if (!isV17MarketAccount(new Uint8Array(info.data))) throw new Error("not v17");
 * const oi = parseMarketGroupV17OI(new Uint8Array(info.data));
 * console.log(`long OI: ${oi.totalLongOiQ}, short OI: ${oi.totalShortOiQ}`);
 * ```
 */
declare function parseMarketGroupV17OI(data: Uint8Array): V17MarketGroupOI;
/**
 * Decode `PortfolioMatcherConfigV16.control` (u64) into its three bit-packed
 * fields (TB-1a, ADOPT upstream b594bc21/6b627b43):
 *   bit 0        = enabled
 *   bits 1..49   = position_epoch (49 bits)
 *   bits 50..63  = trade_fee_cap_bps (14 bits, 0..=10000)
 *
 * A legacy pre-migration account only ever wrote 0 or 1 into this word (the
 * plain `enabled: u64` it used to be), which decodes correctly under this
 * scheme too — bit0 is unchanged, and the higher bits are naturally zero.
 *
 * @param control Raw u64 value of `PortfolioMatcherConfigV16.control`.
 */
declare function decodePortfolioMatcherControl(control: bigint): {
    enabled: boolean;
    positionEpoch: bigint;
    tradeFeeCapBps: number;
};
/** Per-leg decoded data returned by parsePortfolioV17. */
interface PortfolioLegV17 {
    active: boolean;
    assetIndex: number;
    marketId: bigint;
    /** 0 = long, 1 = short */
    side: number;
    basisPosQ: bigint;
    aBasis: bigint;
    kSnap: bigint;
    fSnap: bigint;
    /**
     * NEW (engine-owned, not in the migration's own spec summary — see
     * {@link V17_PORTFOLIO_ACCOUNT_LEN}'s doc comment): funding accrual epoch
     * snapshot, inserted between `fSnap` and `epochSnap`.
     */
    kfEpochSnap: bigint;
    epochSnap: bigint;
    lossWeight: bigint;
    bSnap: bigint;
    bRem: bigint;
    bEpochSnap: bigint;
    bStale: boolean;
    stale: boolean;
}
/** Per source-domain slot returned by parsePortfolioV17. */
interface PortfolioSourceDomainV17 {
    domain: number;
    sourceClaimMarketId: bigint;
    sourceClaimBoundNum: bigint;
    sourceClaimLienedNum: bigint;
    sourceClaimCounterpartyLienedNum: bigint;
    sourceClaimInsuranceLienedNum: bigint;
    sourceLienEffectiveReserved: bigint;
    sourceLienCounterpartyBackingNum: bigint;
    sourceLienInsuranceBackingNum: bigint;
    sourceLienFeeLastSlot: bigint;
    sourceClaimImpairedNum: bigint;
    sourceLienImpairedEffectiveReserved: bigint;
    sourceLienCapitalAtRiskFeeRevenue: bigint;
    sourceLienImpairedCapitalAtRiskFeeRevenue: bigint;
}
/** Decoded v17 PortfolioAccountV16Account. */
interface PortfolioV17 {
    /** Market group this portfolio belongs to. */
    marketGroupId: PublicKey;
    /** Portfolio account identity pubkey (immutable PDA). */
    portfolioAccountId: PublicKey;
    /** Owner wallet pubkey from the provenance header. */
    provenanceOwner: PublicKey;
    /** Portfolio owner (matches provenanceOwner for valid accounts). */
    owner: PublicKey;
    /** Collateral capital in atoms (u128). */
    capital: bigint;
    /** Unrealised P&L in atoms (i128). */
    pnl: bigint;
    /** Capital reserved for pending payout (u128). */
    reservedPnl: bigint;
    /** Genesis farming: cumulative crystallized loss atoms (u128). */
    residualCrystallizedLossAtomsTotal: bigint;
    /** Genesis farming: cumulative spent principal atoms (u128). */
    residualSpentPrincipalAtomsTotal: bigint;
    /** Genesis farming: cumulative received atoms (u128). */
    residualReceivedAtomsTotal: bigint;
    /**
     * NEW (engine-owned, not in the migration's own spec summary — see
     * {@link V17_PORTFOLIO_ACCOUNT_LEN}'s doc comment): cumulative funding
     * paid on long positions (u128).
     */
    fundingLongPaidAtomsTotal: bigint;
    /** NEW: cumulative funding received on long positions (u128). */
    fundingLongReceivedAtomsTotal: bigint;
    /** NEW: cumulative funding paid on short positions (u128). */
    fundingShortPaidAtomsTotal: bigint;
    /** NEW: cumulative funding received on short positions (u128). */
    fundingShortReceivedAtomsTotal: bigint;
    /** Fee credits (i128, can be negative). */
    feeCredits: bigint;
    /** Cancel-deposit escrow holding (u128). */
    cancelDepositEscrow: bigint;
    /** Slot when fees were last accrued. */
    lastFeeSlot: bigint;
    /** Bitmap of active leg slots (one u64 word for 16-asset portfolios). */
    activeBitmap: bigint;
    /** All 16 position leg slots (active or empty). */
    legs: PortfolioLegV17[];
    /** Up to 32 source-domain entries (sparse; unoccupied slots have domain=0 and all-zero fields). */
    sourceDomains: PortfolioSourceDomainV17[];
    /** External matcher program this portfolio routes trades through (PublicKey.default if unset). */
    matcherProgram: PublicKey;
    /** Matcher context account for matcherProgram (PublicKey.default if unset). */
    matcherContext: PublicKey;
    /** PDA the wrapper signs CPI calls to matcherProgram with (PublicKey.default if unset). */
    matcherDelegate: PublicKey;
    /** Whether the external matcher is enabled for this portfolio (SetMatcherConfig). Decoded from `control` bit 0. */
    matcherEnabled: boolean;
    /** v18 NEW: position-episode counter decoded from `control` bits 1..49 (TB-1a). */
    matcherPositionEpoch: bigint;
    /** v18 NEW: LP's maximum accepted market base fee in bps, decoded from `control` bits 50..63 (TB-1a). */
    matcherTradeFeeCapBps: number;
    /**
     * v18 NEW identity trailer (TB-1a, +24B after PortfolioMatcherConfigV16):
     * program-assigned, permanent, never-reused portfolio incarnation ID. Zero
     * on a not-yet-decoded/short buffer.
     */
    portfolioId: bigint;
    /**
     * v18 NEW: the portfolio's current matcher-sequence / replay-ordering
     * watermark (`expected_sequence` on the wire) — pass this LIVE value as
     * `expectedSequence` to every CAS-bound instruction that asks for it
     * (Deposit, Withdraw, ClosePortfolio, ConvertReleasedPnl,
     * CureAndCancelClose, ForfeitRecoveryLeg, RebalanceReduce,
     * SetMatcherConfig, and the trade tags).
     */
    matcherSequence: bigint;
    /** v18 NEW: slot at which the current matcher grant (SetMatcherConfig) stops being live; 0 = disabled/never granted. */
    matcherExpirySlot: bigint;
}
/**
 * Parse a v17 PortfolioAccountV16Account from raw account data.
 * Total account size: HEADER_LEN(16) + sizeof(PortfolioAccountV16Account).
 *
 * @param data - Raw account bytes from `connection.getAccountInfo`.
 * @returns Decoded portfolio state.
 * @throws If data is too short or magic does not match.
 *
 * @example
 * ```typescript
 * const info = await connection.getAccountInfo(portfolioPubkey);
 * const portfolio = parsePortfolioV17(new Uint8Array(info!.data));
 * console.log('capital:', portfolio.capital);
 * ```
 */
declare function parsePortfolioV17(data: Uint8Array): PortfolioV17;
/** Decoded v17 LpVaultRegistryV16 account. */
interface LpVaultRegistryV17 {
    marketGroup: PublicKey;
    lpMint: PublicKey;
    totalLpSharesOutstanding: bigint;
    insuranceFeeSnapshotAtoms: bigint;
    feeDistributionTotalAtoms: bigint;
    epoch: bigint;
    redemptionCooldownSlots: bigint;
    feeShareBps: number;
    oiReservationThresholdBps: number;
    domain: number;
    paused: boolean;
    version: number;
    bump: number;
    mintBump: number;
}
/**
 * Parse a v17 LpVaultRegistryV16 account from raw bytes.
 * Total account size: 176 bytes (HEADER_LEN=16 + struct=160).
 *
 * @param data - Raw account bytes.
 * @returns Decoded LP vault registry state.
 * @throws If data is shorter than 176 bytes.
 *
 * @example
 * ```typescript
 * const info = await connection.getAccountInfo(registryPubkey);
 * const registry = parseLpVaultRegistry(new Uint8Array(info!.data));
 * console.log('totalShares:', registry.totalLpSharesOutstanding);
 * ```
 */
declare function parseLpVaultRegistry(data: Uint8Array): LpVaultRegistryV17;
/** Decoded v17 LpRedemptionV16 account. */
interface LpRedemptionV17 {
    registry: PublicKey;
    redeemer: PublicKey;
    /** LP shares requested for redemption (u128). */
    shares: bigint;
    /** Slot when RequestRedeemLpShares was called. */
    requestSlot: bigint;
    version: number;
    bump: number;
}
/**
 * Parse a v17 LpRedemptionV16 account from raw bytes.
 * Total account size: 112 bytes (HEADER_LEN=16 + struct=96).
 *
 * @param data - Raw account bytes.
 * @returns Decoded LP redemption request state.
 * @throws If data is shorter than 112 bytes.
 *
 * @example
 * ```typescript
 * const info = await connection.getAccountInfo(redemptionPubkey);
 * const redemption = parseLpRedemption(new Uint8Array(info!.data));
 * console.log('shares:', redemption.shares, 'slot:', redemption.requestSlot);
 * ```
 */
declare function parseLpRedemption(data: Uint8Array): LpRedemptionV17;
/**
 * Parse all used accounts.
 */
declare function parseAllAccounts(data: Uint8Array): {
    idx: number;
    account: Account;
}[];

/**
 * Derive vault authority PDA.
 * Seeds: ["vault", slab_key]
 *
 * Mirrors `derive_vault_authority(program_id, market_key)` in
 * `percolator-prog/src/v16_program.rs:17339-17341`.
 */
declare function deriveVaultAuthority(programId: PublicKey, slab: PublicKey): [PublicKey, number];
/**
 * SPL Associated Token Account program.
 *
 * Mirrors `ASSOCIATED_TOKEN_PROGRAM_ID` in `v16_program.rs:17400-17401`, which the
 * wrapper declares locally for exactly one purpose: deriving the canonical vault.
 */
declare const ASSOCIATED_TOKEN_PROGRAM_ID: PublicKey;
/**
 * The legacy SPL Token program — the ONLY token program the v17 wrapper accepts.
 *
 * This is not a default that a Token-2022 mint can override. `verify_token_program`
 * (`v16_program.rs:17436-17441`) rejects any `token_program` account whose key is not
 * `spl_token::ID`, and `unpack_token_account` (`17443-17455`) rejects any token account
 * not *owned* by `spl_token::ID`. Token-2022 collateral is unusable end to end, so the
 * ATA's middle seed is always this program id.
 */
declare const PERCOLATOR_VAULT_TOKEN_PROGRAM_ID: PublicKey;
/**
 * Derive the CANONICAL vault token account for a market + collateral mint.
 *
 * The vault is the Associated Token Account of the market's `vault_authority` PDA:
 *
 * ```text
 * vault_authority = PDA(["vault", market],                          wrapperProgramId)
 * vault           = PDA([vault_authority, SPL_TOKEN_ID, mint],      ATA_PROGRAM_ID)
 * ```
 *
 * Mirrors `canonical_vault_address(vault_authority, mint)`
 * (`v16_program.rs:17404-17415`). The wrapper PINS this single address rather than
 * accepting any `vault_authority`-owned token account: `verify_vault_token_account`
 * (`17543-17563`) rejects a token account whose key is not exactly this, on top of the
 * mint/owner/state/delegate/close-authority checks. That pin is finding F-VAULT-FRAG —
 * without it an attacker could route deposits to a second `vault_authority`-owned account
 * and strand honest withdrawals against the canonical one.
 *
 * ⚠ The middle seed is ALWAYS the legacy SPL Token program
 * ({@link PERCOLATOR_VAULT_TOKEN_PROGRAM_ID}), never Token-2022 — the wrapper hard-pins
 * `spl_token::ID` in both `verify_token_program` and `unpack_token_account`. Deriving this
 * address with a detected token program would produce a key the program rejects with
 * `InvalidVaultAccount`, which reads as "bad vault" rather than "wrong derivation".
 *
 * Required by `WithdrawProtocolFee` (tag 84) at accounts[3] and
 * `WithdrawInsuranceReserveToStake` (tag 87) at accounts[4], plus every deposit/withdraw
 * token path.
 *
 * @param programId - The Percolator wrapper program ID (the market's owner).
 * @param market    - The v17 market group (slab) public key.
 * @param mint      - The market's collateral mint (`WrapperConfigV16::collateral_mint`).
 * @returns `[vaultTokenAccount, bump]` — the ATA address and its bump.
 *
 * @example
 * ```ts
 * const cfg = parseWrapperConfigV17(marketData);
 * const [vaultToken] = deriveCanonicalVault(WRAPPER_ID, marketPk, cfg.collateralMint);
 * ```
 */
declare function deriveCanonicalVault(programId: PublicKey, market: PublicKey, mint: PublicKey): [PublicKey, number];
/**
 * Derive the canonical vault ATA from an already-derived `vault_authority`.
 *
 * Split out from {@link deriveCanonicalVault} so callers that already hold the authority
 * (e.g. because they must also pass it as an account) do not re-run the "vault" PDA search.
 * Same derivation, same program pins — see {@link deriveCanonicalVault} for the rationale.
 *
 * @param vaultAuthority - The `["vault", market]` PDA under the wrapper program.
 * @param mint           - The market's collateral mint.
 * @returns `[vaultTokenAccount, bump]`
 *
 * @example
 * ```ts
 * const [auth] = deriveVaultAuthority(WRAPPER_ID, marketPk);
 * const [vault] = deriveCanonicalVaultForAuthority(auth, mintPk);
 * ```
 */
declare function deriveCanonicalVaultForAuthority(vaultAuthority: PublicKey, mint: PublicKey): [PublicKey, number];
/** Both halves of a market's vault, as required by tags 84 and 87. */
interface MarketVaultAccounts {
    /** `PDA(["vault", market], wrapperProgramId)` — SPL owner of the vault, and CPI signer. */
    vaultAuthority: PublicKey;
    /** Bump for `vaultAuthority`. The program re-derives it; callers never pass it. */
    vaultAuthorityBump: number;
    /** The canonical vault token account — `ATA(vaultAuthority, SPL_TOKEN, mint)`. */
    vaultToken: PublicKey;
    /** Bump for `vaultToken`. */
    vaultTokenBump: number;
    /** The token program that must be passed alongside — always legacy SPL Token. */
    tokenProgram: PublicKey;
}
/**
 * Derive every vault-side account a fee-withdrawal instruction needs, in one call.
 *
 * `WithdrawProtocolFee` (tag 84) and `WithdrawInsuranceReserveToStake` (tag 87) each take
 * the vault token account, the vault authority PDA and the token program as three separate
 * accounts that must agree with one another; deriving them together makes disagreement
 * impossible.
 *
 * Account positions:
 * - tag 84 (`v16_program.rs:10796-10815`): `[3] vaultToken (w)`, `[4] vaultAuthority`, `[5] tokenProgram`
 * - tag 87 (`v16_program.rs:11238-11258`): `[4] vaultToken (w)`, `[5] vaultAuthority`, `[6] tokenProgram`
 *
 * @param programId - The Percolator wrapper program ID.
 * @param market    - The v17 market group (slab) public key.
 * @param mint      - The market's collateral mint.
 * @returns The vault authority, the canonical vault token account, both bumps, and the token program.
 *
 * @example
 * ```ts
 * const v = deriveMarketVaultAccounts(WRAPPER_ID, marketPk, cfg.collateralMint);
 * const keys = [
 *   { pubkey: cranker.publicKey, isSigner: true,  isWritable: false },
 *   { pubkey: marketPk,          isSigner: false, isWritable: true  },
 *   { pubkey: destToken,         isSigner: false, isWritable: true  },
 *   { pubkey: v.vaultToken,      isSigner: false, isWritable: true  },
 *   { pubkey: v.vaultAuthority,  isSigner: false, isWritable: false },
 *   { pubkey: v.tokenProgram,    isSigner: false, isWritable: false },
 * ];
 * ```
 */
declare function deriveMarketVaultAccounts(programId: PublicKey, market: PublicKey, mint: PublicKey): MarketVaultAccounts;
/**
 * Derive insurance LP mint PDA (a.k.a. LP vault mint PDA).
 * Seeds: ["lp_vault_mint", slab_key]
 * Wrapper anchor: src/percolator.rs:2543 derive_lp_vault_mint.
 */
declare function deriveInsuranceLpMint(programId: PublicKey, slab: PublicKey): [PublicKey, number];
/**
 * Derive LP PDA for TradeCpi.
 * Seeds: ["lp", slab_key, lp_idx as u16 LE]
 */
declare function deriveLpPda(programId: PublicKey, slab: PublicKey, lpIdx: number): [PublicKey, number];
/** PumpSwap AMM program ID. */
declare const PUMPSWAP_PROGRAM_ID: PublicKey;
/** Raydium CLMM (Concentrated Liquidity) program ID. */
declare const RAYDIUM_CLMM_PROGRAM_ID: PublicKey;
/** Meteora DLMM (Dynamic Liquidity Market Maker) program ID. */
declare const METEORA_DLMM_PROGRAM_ID: PublicKey;
/** Pyth Push Oracle program on mainnet. */
declare const PYTH_PUSH_ORACLE_PROGRAM_ID: PublicKey;
/**
 * Seed used to derive the creator lock PDA.
 * Matches `creator_lock::CREATOR_LOCK_SEED` in percolator-prog.
 */
declare const CREATOR_LOCK_SEED = "creator_lock";
/**
 * Derive the creator lock PDA for a given slab.
 * Seeds: ["creator_lock", slab_key]
 *
 * This PDA is required as accounts[9] in every LpVaultWithdraw instruction
 * since percolator-prog PR#170 (GH#1926 / PERC-8287).
 * Non-creator withdrawers must pass this key; if no lock exists on-chain the
 * enforcement is a no-op. The SDK must ALWAYS include it — passing it is mandatory.
 *
 * @param programId - The percolator program ID.
 * @param slab      - The slab (market) public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [creatorLockPda] = deriveCreatorLockPda(PROGRAM_ID, slabKey);
 * ```
 */
declare function deriveCreatorLockPda(programId: PublicKey, slab: PublicKey): [PublicKey, number];
/**
 * Derive the LP Vault registry PDA.
 * Seeds: ["lp_vault", marketGroup]
 *
 * Required by: CreateLpVault (tag 74), DepositToLpVault (tag 75),
 * RequestRedeemLpShares (tag 76), ExecuteRedemption (tag 77),
 * LpVaultCrankFees (tag 78), SetLpVaultPaused (tag 79), CloseLpVault (tag 80).
 *
 * Matches `constants::LP_VAULT_REGISTRY_SEED = b"lp_vault"` in v16_program.rs.
 *
 * @param programId   - The Percolator program ID.
 * @param marketGroup - The market group (slab) public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [registryPda] = deriveLpVaultRegistry(PROGRAM_ID, marketGroupKey);
 * ```
 */
declare function deriveLpVaultRegistry(programId: PublicKey, marketGroup: PublicKey): [PublicKey, number];
/**
 * Derive the LP redemption ticket PDA for a specific redeemer.
 * Seeds: ["lp_redemption", registry, redeemer]
 *
 * Required by: RequestRedeemLpShares (tag 76), ExecuteRedemption (tag 77).
 *
 * Matches `constants::LP_REDEMPTION_SEED = b"lp_redemption"` in v16_program.rs
 * and `derive_lp_redemption(program_id, registry, redeemer)` at line 3111.
 *
 * @param programId - The Percolator program ID.
 * @param registry  - The LP Vault registry PDA (from deriveLpVaultRegistry).
 * @param redeemer  - The wallet public key of the redeemer.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [registryPda] = deriveLpVaultRegistry(PROGRAM_ID, marketGroupKey);
 * const [redemptionPda] = deriveLpRedemption(PROGRAM_ID, registryPda, walletKey);
 * ```
 */
declare function deriveLpRedemption(programId: PublicKey, registry: PublicKey, redeemer: PublicKey): [PublicKey, number];
/**
 * Derive the LP backing-domain ledger PDA.
 * Seeds: ["lp_backing_ledger", marketGroup, u16LE(domainIdx)]
 *
 * Required by: DepositToLpVault (tag 75) at accounts[7],
 * LpVaultCrankFees (tag 78) at accounts[3].
 *
 * Matches `constants::LP_BACKING_LEDGER_SEED = b"lp_backing_ledger"` and
 * `derive_lp_backing_ledger(program_id, market_group, domain: u16)` in v16_program.rs
 * (line 3127) — domain is encoded as 2-byte little-endian.
 *
 * @param programId   - The Percolator program ID.
 * @param marketGroup - The market group (slab) public key.
 * @param domainIdx   - The backing domain index as a u16 integer (0–65535).
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [ledgerPda] = deriveLpBackingLedger(PROGRAM_ID, marketGroupKey, 0);
 * ```
 */
declare function deriveLpBackingLedger(programId: PublicKey, marketGroup: PublicKey, domainIdx: number): [PublicKey, number];
/**
 * Derive the LP escrow SPL token account PDA.
 * Seeds: ["lp_escrow", marketGroup]
 *
 * The escrow is owned by the registry PDA and holds LP tokens during the
 * redemption window. Required by ExecuteRedemption (tag 77).
 *
 * Matches `constants::LP_ESCROW_SEED = b"lp_escrow"` and
 * `derive_lp_escrow(program_id, market_group)` in v16_program.rs (line 3157).
 *
 * @param programId   - The Percolator program ID.
 * @param marketGroup - The market group (slab) public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [escrowPda] = deriveLpEscrow(PROGRAM_ID, marketGroupKey);
 * ```
 */
declare function deriveLpEscrow(programId: PublicKey, marketGroup: PublicKey): [PublicKey, number];
/**
 * Derive the per-market NFT program-id registry PDA.
 * Seeds: ["nft_registry", marketGroup]
 *
 * Required by: SetNftProgramId (tag 73) and the wrapper's NFT B-3 CPI path
 * (TransferPortfolioOwnership, tag 72).
 *
 * Matches `constants::NFT_REGISTRY_SEED = b"nft_registry"` and
 * `derive_nft_registry(program_id, market_group)` in v16_program.rs (line 3274).
 *
 * @param programId   - The Percolator program ID.
 * @param marketGroup - The market group (slab) public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [nftRegistryPda] = deriveNftRegistry(PROGRAM_ID, marketGroupKey);
 * ```
 */
declare function deriveNftRegistry(programId: PublicKey, marketGroup: PublicKey): [PublicKey, number];
/**
 * Derive the matcher delegate PDA.
 * Seeds: ["matcher", market, accountB, accountBOwner, matcherProg, matcherCtx]
 * (all six seed segments are 32-byte public keys)
 *
 * Required by TradeCpi (tag 10) at accounts[6] and BatchTradeCpi (tag 67).
 * The program signs CPI calls to the external matcher program using this PDA.
 *
 * Matches `derive_matcher_delegate(program_id, market_key, maker_account,
 * maker_owner, matcher_program, matcher_context)` in v16_program.rs (line 13642).
 *
 * @param programId     - The Percolator program ID.
 * @param market        - The market (slab) public key.
 * @param accountB      - The maker/LP portfolio account public key.
 * @param accountBOwner - The owner of accountB.
 * @param matcherProg   - The external matcher program public key.
 * @param matcherCtx    - The matcher context account public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [delegatePda] = deriveMatcherDelegate(
 *   PROGRAM_ID,
 *   marketKey,
 *   accountBKey,
 *   accountBOwnerKey,
 *   matcherProgKey,
 *   matcherCtxKey,
 * );
 * ```
 */
declare function deriveMatcherDelegate(programId: PublicKey, market: PublicKey, accountB: PublicKey, accountBOwner: PublicKey, matcherProg: PublicKey, matcherCtx: PublicKey): [PublicKey, number];
declare function derivePythPushOraclePDA(feedIdHex: string): [PublicKey, number];

/**
 * Get the associated token address for an owner and mint.
 * Supports both standard SPL Token and Token2022 via optional tokenProgramId.
 */
declare function getAta(owner: PublicKey, mint: PublicKey, allowOwnerOffCurve?: boolean, tokenProgramId?: PublicKey): Promise<PublicKey>;
/**
 * Synchronous version of getAta.
 * Supports both standard SPL Token and Token2022 via optional tokenProgramId.
 */
declare function getAtaSync(owner: PublicKey, mint: PublicKey, allowOwnerOffCurve?: boolean, tokenProgramId?: PublicKey): PublicKey;
/**
 * Fetch token account info.
 * Supports both standard SPL Token and Token2022 via optional tokenProgramId.
 * Throws if account doesn't exist.
 */
declare function fetchTokenAccount(connection: Connection, address: PublicKey, tokenProgramId?: PublicKey): Promise<Account$1>;

/**
 * Read an environment variable safely. Returns `undefined` in browser
 * environments where `process` is not defined, avoiding a
 * `ReferenceError` crash at import time.
 */
declare function safeEnv(key: string): string | undefined;
/**
 * Centralized PROGRAM_ID configuration
 *
 * Default to environment variable, then fall back to network-specific defaults.
 * This prevents hard-coded program IDs scattered across the codebase.
 */
declare const PROGRAM_IDS: {
    readonly devnet: {
        readonly percolator: "ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB";
        readonly matcher: "EDKKgRaVHna6FCxiY1kgMzegD9rpaN1nwJNSzAzeBUBX";
    };
    readonly mainnet: {
        readonly percolator: "ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv";
        readonly matcher: "GDK8wx38kpiSVSfGTVNiSdptX3Z5R4kQyqh6Q3QX6wmi";
    };
};
/**
 * Devnet program IDs, historically named "v17" — stake/vault + nft deployed 2026-07-17,
 * matcher live in place. As of the v18.3 fresh-ID redeploy (SDK 8.0.0) the
 * `percolator` (wrapper) member below has been CUT OVER to the fresh devnet wrapper
 * (ETDLAdi…; previously GnwdeQr… in SDK 6.x/7.x), so this object is a SINGLE SOURCE OF TRUTH with PROGRAM_IDS.devnet: both
 * resolve the same active wrapper. There is no longer a second, divergent wrapper id.
 *
 * @deprecated Prefer PROGRAM_IDS.devnet / getProgramId("devnet"). PROGRAM_IDS_V17 and
 * PROGRAM_ID_V17 are retained only for back-compat with consumers that still import them;
 * `percolator`/PROGRAM_ID_V17 now point at the ACTIVE devnet wrapper (ETDLAdi…), NOT the
 * abandoned v18.0–v18.2 wrapper (GnwdeQr…) or v17 wrapper (DhSkE7u…). All-fresh relaunch (8.0.0): the
 * stake/vault (VmpVUArR…), nft (EMYT15LZ…) and matcher (EDKKgRaV…) members are NEW devnet addresses
 * (the old GCHhcgw… / CNGBPZR… / 4seJWjv3… stay with the untouched GnwdeQr world) and are the devnet
 * defaults consumed by stake.ts / abi/nft.ts.
 *
 * (An earlier 2026-06-26 triple — wrapper 69VUZ7a2..., vault 51CeUNpb..., nft 5TnritLt... —
 * was superseded before this.)
 */
declare const PROGRAM_IDS_V17: {
    /** ACTIVE devnet wrapper (ETDLAdi…) — v18.3 fresh-ID cutover (SDK 8.0.0) from the
     *  abandoned GnwdeQr… (v18.0–v18.2) and DhSkE7u… (v17) wrappers. Kept in this "v17"-named object as a single source of truth with
     *  PROGRAM_IDS.devnet.percolator; @deprecated alias, prefer PROGRAM_IDS.devnet. */
    readonly percolator: "ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB";
    /** Relaunch matcher (P2 4a0f696) — fresh devnet address (all-fresh relaunch, 8.0.0). */
    readonly matcher: "EDKKgRaVHna6FCxiY1kgMzegD9rpaN1nwJNSzAzeBUBX";
    /** Relaunch nft (v18.3 7c50d01) — fresh devnet address (all-fresh relaunch, 8.0.0). */
    readonly nft: "EMYT15LZWaP7Mmmm245kQPbrTyVjG16yZiU9kfNTF3GZ";
    /** Relaunch stake/vault (F-9, fresh-ID e0d72bd) — fresh devnet address (all-fresh relaunch, 8.0.0). */
    readonly vault: "VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w";
};
/**
 * The devnet wrapper PublicKey. As of the v18.3 fresh-ID cutover (SDK 8.0.0) this resolves to
 * the ACTIVE devnet wrapper (ETDLAdi…) — identical to getProgramId("devnet") — because
 * PROGRAM_IDS_V17.percolator was cut over. Retained (with its historical "V17" name) only for
 * back-compat with consumers that still import it.
 * @deprecated Prefer getProgramId("devnet") / PROGRAM_IDS.devnet.percolator.
 */
declare const PROGRAM_ID_V17: PublicKey;
type Network = "devnet" | "mainnet";
/**
 * Get the Percolator program ID for the current network
 *
 * Priority:
 * 1. PROGRAM_ID env var (explicit override)
 * 2. Network-specific default (NETWORK env var)
 * 3. Devnet default (safest fallback — bug bounty PERC-697)
 */
declare function getProgramId(network?: Network): PublicKey;
/**
 * Get the Matcher program ID for the current network
 */
declare function getMatcherProgramId(network?: Network): PublicKey;
/**
 * Get the current network from environment.
 *
 * SECURITY (PERC-697): Removed silent mainnet default.
 * Previously defaulted to "mainnet" when NETWORK was unset, which could cause
 * crank/keeper scripts run without env vars to silently target mainnet program IDs.
 *
 * Now defaults to "devnet" — the safer fallback for a devnet-first protocol.
 * Production deployments always set NETWORK explicitly via Railway/env.
 * For mainnet operations use networkValidation.ts (ensureNetworkConfigValid) which
 * enforces FORCE_MAINNET=1.
 */
declare function getCurrentNetwork(): Network;

/**
 * Static market registry — bundled list of known Percolator slab addresses.
 *
 * This is the tier-3 fallback for `discoverMarkets()`: when both
 * `getProgramAccounts` (tier 1) and the REST API (tier 2) are unavailable,
 * the SDK falls back to this bundled list to bootstrap market discovery.
 *
 * The addresses are fetched on-chain via `getMarketsByAddress`
 * (`getMultipleAccounts`), so all data is still verified on-chain.  The static
 * list only provides the *address directory* — no cached market data is used.
 *
 * ## Maintenance
 *
 * Update this list when new markets are deployed or old ones are retired.
 * Run `scripts/update-static-markets.ts` to regenerate from a permissive RPC
 * or the REST API.
 *
 * @module
 */

/**
 * A single entry in the static market registry.
 *
 * Only the slab address (base58) is required.  Optional metadata fields
 * (`symbol`, `name`) are provided for debugging/logging purposes only —
 * they are **not** used for on-chain data and may become stale.
 */
interface StaticMarketEntry {
    /** Base58-encoded slab account address. */
    slabAddress: string;
    /** Optional human-readable symbol (e.g. "SOL-PERP"). */
    symbol?: string;
    /** Optional descriptive name. */
    name?: string;
}
/**
 * Get the bundled static market list for a given network.
 *
 * Returns the built-in list merged with any entries added via
 * {@link registerStaticMarkets}.  Duplicates (by `slabAddress`) are removed
 * automatically — user-registered entries take precedence.
 *
 * @param network - Target network (`"mainnet"` or `"devnet"`)
 * @returns Array of static market entries (may be empty if no markets are known)
 *
 * @example
 * ```ts
 * import { getStaticMarkets } from "@percolator/sdk";
 *
 * const markets = getStaticMarkets("mainnet");
 * console.log(`${markets.length} known mainnet slab addresses`);
 * ```
 */
declare function getStaticMarkets(network: Network): StaticMarketEntry[];
/**
 * Register additional static market entries at runtime.
 *
 * Use this to inject known slab addresses before calling `discoverMarkets()`
 * so that tier-3 fallback has addresses to work with — especially useful
 * right after mainnet launch when the bundled list may be empty.
 *
 * Entries are deduplicated by `slabAddress` — calling this multiple times
 * with the same address is safe.
 *
 * @param network - Target network
 * @param entries - One or more static market entries to register
 *
 * @example
 * ```ts
 * import { registerStaticMarkets } from "@percolator/sdk";
 *
 * registerStaticMarkets("mainnet", [
 *   { slabAddress: "ABC123...", symbol: "SOL-PERP" },
 *   { slabAddress: "DEF456...", symbol: "ETH-PERP" },
 * ]);
 * ```
 */
declare function registerStaticMarkets(network: Network, entries: StaticMarketEntry[]): void;
/**
 * Clear all user-registered static market entries for a network.
 *
 * Useful in tests or when resetting state.
 *
 * @param network - Target network to clear (omit to clear all networks)
 */
declare function clearStaticMarkets(network?: Network): void;

/**
 * A discovered Percolator market from on-chain program accounts.
 */
interface DiscoveredMarket {
    slabAddress: PublicKey;
    /** The program that owns this slab account */
    programId: PublicKey;
    /**
     * v12.x slab header. Present when the market is a v12 slab account (PERCOLAT magic).
     * Absent (undefined) for v17 market group accounts (PERCV16\0 magic) — use configV17 instead.
     */
    header: SlabHeader;
    /**
     * v12.x market config parsed from the slab CONFIG region (536 bytes at offset 104).
     * Present for v12 slab accounts. Absent for v17 accounts — use configV17 instead.
     */
    config: MarketConfig;
    /**
     * v12.x engine state (bitmap, account counts).
     * Present for v12 slab accounts. Absent for v17 accounts.
     */
    engine: EngineState;
    /**
     * v12.x risk parameters.
     * Present for v12 slab accounts. Absent for v17 accounts.
     */
    params: RiskParams;
    /**
     * v17 wrapper config (WrapperConfigV16 struct, 496 bytes at header offset 16;
     * post-protocol-fee — was 432 bytes / VERSION 16 pre-protocol-fee).
     * Present when the market is a v17 market group account (PERCV16\0 magic).
     * Absent for v12 slab accounts.
     *
     * Use `isV17Market(m)` to narrow the type:
     * ```ts
     * if (m.configV17) {
     *   console.log(m.configV17.collateralMint.toBase58());
     * }
     * ```
     */
    configV17?: WrapperConfigV17;
}
/**
 * Slab tier definitions — V1 layout (all tiers upgraded as of 2026-03-13).
 * IMPORTANT: dataSize must match the compiled program's SLAB_LEN for that MAX_ACCOUNTS.
 * The on-chain program has a hardcoded SLAB_LEN — slab account data.len() must equal it exactly.
 *
 * Layout: HEADER(104) + CONFIG(536) + RiskEngine(variable by tier)
 *   ENGINE_OFF = 640  (HEADER=104 + CONFIG=536, padded to 8-byte align on SBF)
 *   RiskEngine = fixed(656) + bitmap(BW*8) + post_bitmap(18) + next_free(N*2) + pad + accounts(N*248)
 *
 * Values are empirically verified against on-chain initialized accounts (GH #1109):
 *   small  = 65,352  (256-acct program, verified on-chain post-V1 upgrade)
 *   medium = 257,448 (1024-acct program g9msRSV3, verified on-chain)
 *   large  = 1,025,832 (4096-acct program FxfD37s1, pre-PERC-118, matches slabDataSizeV1(4096) formula)
 *
 * NOTE: small program (FwfBKZXb) redeployed with --features small,devnet (2026-03-13).
 *       Large program FxfD37s1 is pre-PERC-118 — SLAB_LEN=1,025,832, matching formula.
 *       See GH #1109, GH #1112.
 *
 * History: Small was V0 (62_808) until 2026-03-13 program upgrade. V0 values preserved
 *          in SLAB_TIERS_V0 for discovery of legacy on-chain accounts.
 */
/**
 * Default slab tiers for the current mainnet program (v12.17).
 * These are used by useCreateMarket to allocate slab accounts of the correct size.
 * V12_17: two-bucket warmup, per-side funding, ACCOUNT_SIZE=352 (SBF).
 */
declare const SLAB_TIERS: {
    readonly small: {
        maxAccounts: number;
        dataSize: number;
        label: string;
        description: string;
    };
    readonly medium: {
        maxAccounts: number;
        dataSize: number;
        label: string;
        description: string;
    };
    readonly large: {
        maxAccounts: number;
        dataSize: number;
        label: string;
        description: string;
    };
};
/** @deprecated V0 slab sizes — kept for backward compatibility with old on-chain slabs */
declare const SLAB_TIERS_V0: {
    readonly small: {
        readonly maxAccounts: 256;
        readonly dataSize: 62808;
        readonly label: "Small";
        readonly description: "256 slots · ~0.44 SOL";
    };
    readonly medium: {
        readonly maxAccounts: 1024;
        readonly dataSize: 248760;
        readonly label: "Medium";
        readonly description: "1,024 slots · ~1.73 SOL";
    };
    readonly large: {
        readonly maxAccounts: 4096;
        readonly dataSize: 992568;
        readonly label: "Large";
        readonly description: "4,096 slots · ~6.90 SOL";
    };
};
/**
 * V1D slab sizes — actually-deployed devnet V1 program (ENGINE_OFF=424, BITMAP_OFF=624).
 * PR #1200 added V1D layout detection in slab.ts but discovery.ts ALL_TIERS was missing
 * these sizes, causing V1D slabs to fall through to the memcmp fallback with wrong dataSize
 * hints → detectSlabLayout returning null → parse failure (GH#1205).
 *
 * Sizes computed via computeSlabSize(ENGINE_OFF=424, BITMAP_OFF=624, ACCOUNT_SIZE=248, N, postBitmap=2):
 *   The V1D deployed program uses postBitmap=2 (free_head u16 only — no num_used/pad/next_account_id).
 *   This is 16 bytes smaller per tier than the SDK default (postBitmap=18). GH#1234.
 *   micro  =  17,064  (64 slots)
 *   small  =  65,088  (256 slots)
 *   medium = 257,184  (1,024 slots)
 *   large  = 1,025,568 (4,096 slots)
 */
declare const SLAB_TIERS_V1D: {
    readonly micro: {
        readonly maxAccounts: 64;
        readonly dataSize: 17064;
        readonly label: "Micro";
        readonly description: "64 slots (V1D devnet)";
    };
    readonly small: {
        readonly maxAccounts: 256;
        readonly dataSize: 65088;
        readonly label: "Small";
        readonly description: "256 slots (V1D devnet)";
    };
    readonly medium: {
        readonly maxAccounts: 1024;
        readonly dataSize: 257184;
        readonly label: "Medium";
        readonly description: "1,024 slots (V1D devnet)";
    };
    readonly large: {
        readonly maxAccounts: 4096;
        readonly dataSize: 1025568;
        readonly label: "Large";
        readonly description: "4,096 slots (V1D devnet)";
    };
};
/**
 * V1D legacy slab sizes — on-chain V1D slabs created before GH#1234 when the SDK assumed
 * postBitmap=18. These are 16 bytes larger per tier than SLAB_TIERS_V1D.
 * PR #1236 fixed postBitmap for new slabs (→2) but caused slab 6ZytbpV4 (65104 bytes,
 * top active market ~$15k 24h vol) to be unrecognized → "Failed to load market". GH#1237.
 *
 * Sizes computed via computeSlabSize(ENGINE_OFF=424, BITMAP_OFF=624, ACCOUNT_SIZE=248, N, postBitmap=18):
 *   micro  =  17,080  (64 slots)
 *   small  =  65,104  (256 slots)  ← slab 6ZytbpV4 TEST/USD
 *   medium = 257,200  (1,024 slots)
 *   large  = 1,025,584 (4,096 slots)
 */
declare const SLAB_TIERS_V1D_LEGACY: {
    readonly micro: {
        readonly maxAccounts: 64;
        readonly dataSize: 17080;
        readonly label: "Micro";
        readonly description: "64 slots (V1D legacy, postBitmap=18)";
    };
    readonly small: {
        readonly maxAccounts: 256;
        readonly dataSize: 65104;
        readonly label: "Small";
        readonly description: "256 slots (V1D legacy, postBitmap=18)";
    };
    readonly medium: {
        readonly maxAccounts: 1024;
        readonly dataSize: 257200;
        readonly label: "Medium";
        readonly description: "1,024 slots (V1D legacy, postBitmap=18)";
    };
    readonly large: {
        readonly maxAccounts: 4096;
        readonly dataSize: 1025584;
        readonly label: "Large";
        readonly description: "4,096 slots (V1D legacy, postBitmap=18)";
    };
};
/** @deprecated Alias — use SLAB_TIERS (already V1) */
declare const SLAB_TIERS_V1: {
    readonly small: {
        maxAccounts: number;
        dataSize: number;
        label: string;
        description: string;
    };
    readonly medium: {
        maxAccounts: number;
        dataSize: number;
        label: string;
        description: string;
    };
    readonly large: {
        maxAccounts: number;
        dataSize: number;
        label: string;
        description: string;
    };
};
/**
 * V_ADL slab tier sizes — PERC-8270/8271 ADL-upgraded program.
 * ENGINE_OFF=624, BITMAP_OFF=1006, ACCOUNT_SIZE=312, postBitmap=18.
 * New account layout adds ADL tracking fields (+64 bytes/account).
 * BPF SLAB_LEN verified by cargo build-sbf in PERC-8271: large (4096) = 1288304 bytes.
 */
declare const SLAB_TIERS_V_ADL_DISCOVERY: Record<string, {
    maxAccounts: number;
    dataSize: number;
    label: string;
    description: string;
}>;
type SlabTierKey = keyof typeof SLAB_TIERS;
/** Calculate slab data size for arbitrary account count.
 *
 * Layout (SBF, u128 align = 8):
 *   HEADER(104) + CONFIG(536) → ENGINE_OFF = 640
 *   RiskEngine fixed scalars: 656 bytes (PERC-299: +24 emergency OI, +32 long/short OI)
 *   + bitmap: ceil(N/64)*8
 *   + num_used_accounts(u16) + pad(6) + next_account_id(u64) + free_head(u16) = 18
 *   + next_free: N*2
 *   + pad to 8-byte alignment for Account array
 *   + accounts: N*248
 *
 * Must match the on-chain program's SLAB_LEN exactly.
 */
declare function slabDataSize(maxAccounts: number): number;
/**
 * Calculate slab data size for V1 layout (ENGINE_OFF=640).
 *
 * NOTE: This formula is accurate for small (256) and medium (1024) tiers but
 * underestimates large (4096) by 16 bytes — likely due to a padding/alignment
 * difference at high account counts or a post-PERC-118 struct addition in the
 * deployed binary. Always prefer the hardcoded SLAB_TIERS values (empirically
 * verified on-chain) over this formula for production use.
 */
declare function slabDataSizeV1(maxAccounts: number): number;
/**
 * Validate that a slab data size matches one of the known tier sizes.
 * Use this to catch tier↔program mismatches early (PERC-277).
 *
 * @param dataSize - The expected slab data size (from SLAB_TIERS[tier].dataSize)
 * @param programSlabLen - The program's compiled SLAB_LEN (from on-chain error logs or program introspection)
 * @returns true if sizes match, false if there's a mismatch
 */
declare function validateSlabTierMatch(dataSize: number, programSlabLen: number): boolean;
/**
 * Light engine parser that works with partial slab data (dataSlice, no accounts array).
 * Requires a layout hint (from detectSlabLayout on the actual slab size) to use correct offsets.
 *
 * @param data        — partial slab slice (HEADER_SLICE_LENGTH bytes)
 * @param layout      — SlabLayout from detectSlabLayout(actualDataSize). If null, falls back to V0.
 * @param maxAccounts — tier's max accounts for bitmap offset calculation
 */
declare function parseEngineLight(data: Uint8Array, layout: SlabLayout | null, maxAccounts?: number): EngineState;
/** Options for `discoverMarkets`. */
interface DiscoverMarketsOptions {
    /**
     * Run tier queries sequentially with per-tier retry on HTTP 429 instead of
     * firing all in parallel.  Reduces RPC rate-limit pressure at the cost of
     * slightly slower discovery (~14 round-trips instead of 1 concurrent batch).
     * Default: false (preserves original parallel behaviour).
     *
     * PERC-1650: keeper uses this flag to avoid 429 storms on its fallback RPC
     * (Helius starter tier).  Pass `sequential: true` from CrankService.discover().
     */
    sequential?: boolean;
    /**
     * Delay in ms between sequential tier queries (only used when sequential=true).
     * Default: 200 ms.
     */
    interTierDelayMs?: number;
    /**
     * Per-tier retry backoff delays on 429 (ms).  Jitter of up to +25% is applied.
     * Only used when sequential=true.  Default: [1_000, 3_000, 9_000, 27_000].
     */
    rateLimitBackoffMs?: number[];
    /**
     * In parallel mode (the default), cap how many tier RPC requests are in-flight
     * at once to avoid accidental RPC storms from client code.
     *
     * Default: 6
     */
    maxParallelTiers?: number;
    /**
     * Hard cap on how many tier dataSize queries are attempted.
     * Default: all known tiers.
     */
    maxTierQueries?: number;
    /**
     * Base URL of the Percolator REST API (e.g. `"https://percolatorlaunch.com/api"`).
     *
     * When set, `discoverMarkets` will fall back to the REST API's `GET /markets`
     * endpoint if `getProgramAccounts` fails or returns 0 results (common on public
     * mainnet RPCs that reject `getProgramAccounts`).
     *
     * The API returns slab addresses which are then fetched on-chain via
     * `getMarketsByAddress` (uses `getMultipleAccounts`, works on all RPCs).
     *
     * GH#59 / PERC-8424: Unblocks mainnet users without a Helius API key.
     *
     * @example
     * ```ts
     * const markets = await discoverMarkets(connection, programId, {
     *   apiBaseUrl: "https://percolatorlaunch.com/api",
     * });
     * ```
     */
    apiBaseUrl?: string;
    /**
     * Timeout in ms for the API fallback HTTP request.
     * Only used when `apiBaseUrl` is set.
     * Default: 10_000 (10 seconds).
     */
    apiTimeoutMs?: number;
    /**
     * Network hint for tier-3 static bundle fallback (`"mainnet"` or `"devnet"`).
     *
     * When both `getProgramAccounts` (tier 1) and the REST API (tier 2) fail,
     * `discoverMarkets` will fall back to a bundled static list of known slab
     * addresses for the specified network.  The addresses are fetched on-chain
     * via `getMarketsByAddress` (`getMultipleAccounts` — works on all RPCs).
     *
     * If not set, tier-3 fallback is disabled.
     *
     * The static list can be extended at runtime via `registerStaticMarkets()`.
     *
     * @see {@link registerStaticMarkets} to add addresses at runtime
     * @see {@link getStaticMarkets} to inspect the current static list
     *
     * @example
     * ```ts
     * const markets = await discoverMarkets(connection, programId, {
     *   apiBaseUrl: "https://percolatorlaunch.com/api",
     *   network: "mainnet",  // enables tier-3 static fallback
     * });
     * ```
     */
    network?: Network;
}
/**
 * Discover all Percolator markets owned by the given program.
 * Uses getProgramAccounts with dataSize filter + dataSlice to download only ~1400 bytes per slab.
 *
 * @param options.sequential - Run tier queries sequentially with 429 retry (PERC-1650).
 */
declare function discoverMarkets(connection: Connection, programId: PublicKey, options?: DiscoverMarketsOptions): Promise<DiscoveredMarket[]>;
/**
 * Options for `getMarketsByAddress`.
 */
interface GetMarketsByAddressOptions {
    /**
     * Maximum number of addresses per `getMultipleAccounts` RPC call.
     * Solana limits a single call to 100 accounts; callers may lower this
     * to reduce per-request payload size or avoid 429s.
     *
     * Default: 100 (Solana maximum).
     */
    batchSize?: number;
    /**
     * Delay in ms between batches when the address list exceeds `batchSize`.
     * Helps avoid rate-limiting on public RPCs.
     *
     * Default: 0 (no delay).
     */
    interBatchDelayMs?: number;
}
/**
 * Fetch and parse Percolator markets by their known slab addresses.
 *
 * Unlike `discoverMarkets()` — which uses `getProgramAccounts` and is blocked
 * on public mainnet RPCs — this function uses `getMultipleAccounts`, which works
 * on any RPC endpoint (including `api.mainnet-beta.solana.com`).
 *
 * Callers must already know the market slab addresses (e.g. from an indexer,
 * a hardcoded registry, or a previous `discoverMarkets` call on a permissive RPC).
 *
 * @param connection - Solana RPC connection
 * @param programId - The Percolator program that owns these slabs
 * @param addresses - Array of slab account public keys to fetch
 * @param options   - Optional batching/delay configuration
 * @returns Parsed markets for all valid slab accounts; invalid/missing accounts are silently skipped.
 *
 * @example
 * ```ts
 * import { getMarketsByAddress, getProgramId } from "@percolator/sdk";
 * import { Connection, PublicKey } from "@solana/web3.js";
 *
 * const connection = new Connection("https://api.mainnet-beta.solana.com");
 * const programId = getProgramId("mainnet");
 * const slabs = [
 *   new PublicKey("So11111111111111111111111111111111111111112"),
 *   // ... more known slab addresses
 * ];
 *
 * const markets = await getMarketsByAddress(connection, programId, slabs);
 * console.log(`Found ${markets.length} markets`);
 * ```
 */
declare function getMarketsByAddress(connection: Connection, programId: PublicKey, addresses: PublicKey[], options?: GetMarketsByAddressOptions): Promise<DiscoveredMarket[]>;
/**
 * Shape of a single market entry returned by the Percolator REST API
 * (`GET /markets`).  Only the fields needed for discovery are typed here;
 * the full API response may contain additional statistics fields.
 */
interface ApiMarketEntry {
    slab_address: string;
    symbol?: string;
    name?: string;
    decimals?: number;
    status?: string;
    [key: string]: unknown;
}
/** Options for {@link discoverMarketsViaApi}. */
interface DiscoverMarketsViaApiOptions {
    /**
     * Timeout in ms for the HTTP request to the REST API.
     * Default: 10_000 (10 seconds).
     */
    timeoutMs?: number;
    /**
     * Options forwarded to {@link getMarketsByAddress} for the on-chain fetch
     * step (batch size, inter-batch delay).
     */
    onChainOptions?: GetMarketsByAddressOptions;
}
/**
 * Discover Percolator markets by first querying the REST API for slab addresses,
 * then fetching full on-chain data via `getMarketsByAddress` (which uses
 * `getMultipleAccounts` — works on all RPCs including public mainnet nodes).
 *
 * This is the recommended discovery path for mainnet users who do not have a
 * Helius API key, since `getProgramAccounts` is rejected by public RPCs.
 *
 * The REST API acts as an address directory only — all market data is verified
 * on-chain via `getMarketsByAddress`, so the caller gets the same
 * `DiscoveredMarket[]` result as `discoverMarkets()`.
 *
 * @param connection - Solana RPC connection (any endpoint, including public)
 * @param programId - The Percolator program that owns the slabs
 * @param apiBaseUrl - Base URL of the Percolator REST API
 *                     (e.g. `"https://percolatorlaunch.com/api"`)
 * @param options - Optional timeout and on-chain fetch configuration
 * @returns Parsed markets for all valid slab accounts discovered via the API
 *
 * @example
 * ```ts
 * import { discoverMarketsViaApi, getProgramId } from "@percolator/sdk";
 * import { Connection } from "@solana/web3.js";
 *
 * const connection = new Connection("https://api.mainnet-beta.solana.com");
 * const programId = getProgramId("mainnet");
 * const markets = await discoverMarketsViaApi(
 *   connection,
 *   programId,
 *   "https://percolatorlaunch.com/api",
 * );
 * console.log(`Discovered ${markets.length} markets via API fallback`);
 * ```
 */
declare function discoverMarketsViaApi(connection: Connection, programId: PublicKey, apiBaseUrl: string, options?: DiscoverMarketsViaApiOptions): Promise<DiscoveredMarket[]>;
/** Options for {@link discoverMarketsViaStaticBundle}. */
interface DiscoverMarketsViaStaticBundleOptions {
    /**
     * Options forwarded to {@link getMarketsByAddress} for the on-chain fetch
     * step (batch size, inter-batch delay).
     */
    onChainOptions?: GetMarketsByAddressOptions;
}
/**
 * Discover Percolator markets from a static list of known slab addresses.
 *
 * This is the tier-3 (last-resort) fallback for `discoverMarkets()`.  It uses
 * a bundled list of known slab addresses and fetches their full account data
 * on-chain via `getMarketsByAddress` (`getMultipleAccounts` — works on all RPCs).
 *
 * The static list acts as an address directory only — all market data is verified
 * on-chain, so stale entries are silently skipped (the account won't have valid
 * magic bytes or will have been closed).
 *
 * @param connection - Solana RPC connection (any endpoint)
 * @param programId - The Percolator program that owns the slabs
 * @param entries   - Static market entries (typically from {@link getStaticMarkets})
 * @param options   - Optional on-chain fetch configuration
 * @returns Parsed markets for all valid slab accounts; stale/missing entries are skipped.
 *
 * @example
 * ```ts
 * import {
 *   discoverMarketsViaStaticBundle,
 *   getStaticMarkets,
 *   getProgramId,
 * } from "@percolator/sdk";
 * import { Connection } from "@solana/web3.js";
 *
 * const connection = new Connection("https://api.mainnet-beta.solana.com");
 * const programId = getProgramId("mainnet");
 * const entries = getStaticMarkets("mainnet");
 *
 * const markets = await discoverMarketsViaStaticBundle(
 *   connection,
 *   programId,
 *   entries,
 * );
 * console.log(`Recovered ${markets.length} markets from static bundle`);
 * ```
 */
declare function discoverMarketsViaStaticBundle(connection: Connection, programId: PublicKey, entries: StaticMarketEntry[], options?: DiscoverMarketsViaStaticBundleOptions): Promise<DiscoveredMarket[]>;

type DexType = "pumpswap" | "raydium-clmm" | "meteora-dlmm";
interface DexPoolInfo {
    dexType: DexType;
    poolAddress: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    baseVault?: PublicKey;
    quoteVault?: PublicKey;
}
/**
 * Detect DEX type from the program that owns the pool account.
 *
 * @param ownerProgramId - The program ID that owns the pool account
 * @returns The detected DEX type, or `null` if the owner is not a supported DEX program
 *
 * Supported DEX programs:
 * - PumpSwap (constant-product AMM)
 * - Raydium CLMM (concentrated liquidity)
 * - Meteora DLMM (discretized liquidity)
 */
declare function detectDexType(ownerProgramId: PublicKey): DexType | null;
/**
 * Parse a DEX pool account into a {@link DexPoolInfo} struct.
 *
 * @param dexType - The type of DEX (pumpswap, raydium-clmm, or meteora-dlmm)
 * @param poolAddress - The on-chain address of the pool account
 * @param data - Raw account data bytes
 * @returns Parsed pool info including mints and (for PumpSwap) vault addresses
 * @throws Error if data is too short for the given DEX type
 */
declare function parseDexPool(dexType: DexType, poolAddress: PublicKey, data: Uint8Array): DexPoolInfo;
/**
 * Compute the spot price from a DEX pool in e6 format (i.e., 1.0 = 1_000_000).
 *
 * **SECURITY NOTE:** DEX spot prices have no staleness or confidence checks and are
 * vulnerable to flash-loan manipulation within a single transaction. For high-value
 * markets, prefer Pyth or Chainlink oracles.
 *
 * @param dexType - The type of DEX
 * @param data - Raw pool account data
 * @param vaultData - For PumpSwap only: base and quote vault account data
 * @param decimals - Base/quote mint decimals. REQUIRED for meteora-dlmm and pumpswap
 *   (neither pool layout stores decimals inline in a form usable without a mint lookup);
 *   ignored for raydium-clmm (decimals are embedded in the pool account).
 * @param solPriceE6 - Current SOL/USD price in e6 format. Only consulted for PumpSwap
 *   pools whose quote mint is native WSOL (the vast majority of pump.fun pools) — see
 *   {@link computePumpSwapPriceE6} for the conversion. Ignored for all other dex types
 *   and for PumpSwap pools quoted in a non-WSOL mint.
 * @returns Price in e6 format. For pumpswap/raydium-clmm/meteora-dlmm quoted in USDC
 *   (or another USD-pegged stable), this is already a USD price. For pumpswap pools
 *   quoted in WSOL, this is a USD price ONLY if `solPriceE6` was supplied — otherwise
 *   {@link computePumpSwapPriceE6} throws rather than silently returning a token/SOL
 *   price mislabeled as USD.
 * @throws Error if data is too short, required params are missing, or computation fails
 */
declare function computeDexSpotPriceE6(dexType: DexType, data: Uint8Array, vaultData?: {
    base: Uint8Array;
    quote: Uint8Array;
}, decimals?: {
    base: number;
    quote: number;
}, solPriceE6?: bigint): bigint;
/**
 * Offset of the `decimals` byte in a standard SPL Mint account. Exported so
 * callers that batch-fetch several mint accounts in one `getMultipleAccountsInfo`
 * (e.g. to resolve PumpSwap base/quote decimals without N extra RPC round-trips)
 * can read this field directly instead of duplicating the magic number.
 */
declare const SPL_MINT_DECIMALS_OFFSET = 44;
/**
 * Read the `decimals` field of any SPL mint account (including native WSOL).
 *
 * This replaces `getMint(connection, mint).decimals` for callers that need to
 * supply decimals to {@link computeDexSpotPriceE6} for Meteora DLMM pools.
 * `getMint()` throws on native WSOL (`So11111111111111111111111111111111111111112`)
 * because the system account is not a valid token-program mint; this function
 * reads raw account data and extracts byte 44 directly, which works for all
 * SPL mints, Token-2022 mints, and native WSOL (which stores `9` at that byte).
 *
 * @param connection - Solana RPC connection
 * @param mint - The mint public key to query
 * @returns The `decimals` field value (0–255)
 * @throws Error if the account does not exist or is too short to hold a mint
 *
 * @example
 * ```ts
 * import { fetchMintDecimals, computeDexSpotPriceE6 } from "@percolator/sdk";
 *
 * const baseDecimals = await fetchMintDecimals(connection, pool.baseMint);
 * const quoteDecimals = await fetchMintDecimals(connection, pool.quoteMint);
 * const priceE6 = computeDexSpotPriceE6("meteora-dlmm", poolData, undefined, {
 *   base: baseDecimals,
 *   quote: quoteDecimals,
 * });
 * ```
 */
declare function fetchMintDecimals(connection: Connection, mint: PublicKey): Promise<number>;
/**
 * Native SOL mint — PumpSwap pools overwhelmingly quote in this. Exported so
 * callers can pre-check `parsed.quoteMint.equals(WSOL_MINT)` before deciding
 * whether a `solPriceE6` conversion is needed, without duplicating the address.
 */
declare const WSOL_MINT: PublicKey;

/**
 * Oracle account parsing utilities.
 *
 * Chainlink transmissions-account layout, taken from the DEPLOYED wrapper
 * percolator-prog@19d5d932 (`read_chainlink_price_e6`, src/v16_program.rs:5636)
 * so that this parser and the on-chain program agree byte-for-byte:
 *
 *   CHAINLINK_HEADER_SIZE   = 192
 *   offset   8: version (u8)                     CL_OFF_VERSION
 *   offset 138: decimals (u8)                    CL_OFF_DECIMALS
 *   offset 143: latest_round_id (u32 LE)         CL_OFF_LATEST_ROUND_ID
 *   offset 148: live_length (u32 LE)             CL_OFF_LIVE_LENGTH
 *   offset 200: transmission record              CL_OFF_TRANSMISSION = 8 + 192
 *     +0  (200): slot (u64 LE)                   CL_TRANS_OFF_SLOT
 *     +8  (208): timestamp (u32 LE, Unix secs)   CL_TRANS_OFF_TIMESTAMP
 *     +16 (216): answer (i128 LE)                CL_TRANS_OFF_ANSWER
 *
 * Minimum account size: 248 bytes = 8 + 192 + 48 (CHAINLINK_FEED_MIN_LEN).
 *
 * These utilities validate oracle data BEFORE parsing to prevent silent
 * propagation of stale or malformed Chainlink data as price.
 */
/**
 * Minimum buffer size to read Chainlink price data.
 * Mirrors the program's CHAINLINK_FEED_MIN_LEN = 8 + CHAINLINK_HEADER_SIZE(192) + 48.
 * The previous value (224) was smaller than the program's own floor, so the SDK
 * accepted buffers the chain rejects — and 224 cannot even hold the 16-byte
 * answer at offset 216.
 */
declare const CHAINLINK_MIN_SIZE = 248;
/** Maximum reasonable decimals for a price feed */
declare const MAX_DECIMALS = 18;
/** Offset of decimals field in Chainlink aggregator account */
declare const CHAINLINK_DECIMALS_OFFSET = 138;
/**
 * Offset of the transmission timestamp (u32 LE, Unix seconds).
 * = CL_OFF_TRANSMISSION(200) + CL_TRANS_OFF_TIMESTAMP(8).
 * NOTE: u32, not i64 — the program reads it with read_u32_le.
 */
declare const CHAINLINK_TIMESTAMP_OFFSET = 208;
/**
 * Offset of the latest answer.
 * = CL_OFF_TRANSMISSION(200) + CL_TRANS_OFF_ANSWER(16).
 */
declare const CHAINLINK_ANSWER_OFFSET = 216;
interface OraclePrice {
    price: bigint;
    decimals: number;
    /** Unix timestamp (seconds) of the last oracle update, if available. */
    updatedAt?: number;
}
interface ParseChainlinkOptions {
    /** Maximum allowed staleness in seconds. If the oracle update is older, an error is thrown. */
    maxStalenessSeconds?: number;
    /**
     * How far ahead of the local clock a publish timestamp may be before it is
     * treated as invalid rather than as clock skew. Defaults to 60s.
     * Only consulted when `maxStalenessSeconds` is set.
     */
    futureToleranceSeconds?: number;
}
/**
 * Parse price data from a Chainlink aggregator account buffer.
 *
 * Validates:
 * - Buffer is large enough to contain the required fields (>= 248 bytes, the
 *   program's own CHAINLINK_FEED_MIN_LEN)
 * - Decimals are in a reasonable range (0-18)
 * - Price is positive (non-zero)
 *
 * @param data - Raw account data from Chainlink aggregator
 * @param options - Optional staleness check (maxStalenessSeconds)
 * @returns Parsed oracle price with decimals and last-update timestamp
 * @throws if the buffer is invalid, contains unreasonable data, or (when
 *   maxStalenessSeconds is set) the last update is older than that bound
 */
declare function parseChainlinkPrice(data: Uint8Array, options?: ParseChainlinkOptions): OraclePrice;
/**
 * Validate that a buffer looks like a valid Chainlink aggregator account.
 * Returns true if the buffer passes all validation checks, false otherwise.
 * Use this for non-throwing validation.
 */
declare function isValidChainlinkOracle(data: Uint8Array): boolean;

/**
 * Token2022 (Token Extensions) program ID.
 */
declare const TOKEN_2022_PROGRAM_ID: PublicKey;
/**
 * Detect which token program owns a given mint account.
 * Returns the canonical program ID — TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID.
 *
 * #266: previously this returned `info.owner` verbatim, which FAILS OPEN — an
 * attacker-controlled account owned by an arbitrary program (or a non-mint
 * account) would be accepted and its owner propagated as the "token program",
 * letting a forged program be passed into a later token CPI. Now we branch on
 * the owner and accept ONLY the two real token programs, throwing otherwise.
 *
 * @throws if the mint account doesn't exist, or is not owned by SPL Token or
 *         Token-2022.
 */
declare function detectTokenProgram(connection: Connection, mint: PublicKey): Promise<PublicKey>;
/**
 * Check if a given token program ID is Token2022.
 */
declare function isToken2022(tokenProgramId: PublicKey): boolean;
/**
 * Check if a given token program ID is the standard SPL Token program.
 */
declare function isStandardToken(tokenProgramId: PublicKey): boolean;

/**
 * @module stake
 * Percolator Insurance LP Staking program — instruction encoders, PDA derivation, and account specs.
 *
 * Program: percolator-stake (dcccrypto/percolator-stake)
 * Deployed devnet:  VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w (fresh v17 triple,
 *   deployed 2026-07-17, hash-verified — see PROGRAM_IDS_V17.vault in
 *   `src/config/program-ids.ts`)
 * Deployed mainnet: DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F (unverified — no confirmed
 *   mainnet deployment of any stake/vault lineage found in the v17 planning docs as of
 *   this writing; treat as a placeholder until DevOps confirms)
 *
 * LINEAGE (as of 2026-07-17): the devnet address GCHhcgw... was deployed FRESH from
 * `~/v17/percolator-stake@1e08d35` (hash `0e9c2572...`) — the ADOPTED
 * `percolator-stake@feat/adopt-stake-lineage-plus-n7` lineage's instruction set, matching
 * this module's STAKE_IX tag table and decodeStakePool below exactly (no on-chain drift).
 * This is a NEW address, NOT an in-place upgrade of the old `51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ`
 * (which ran `percolator-vault@eb3ebe8` and is now SUPERSEDED / no longer the SDK default —
 * do not use it for new integrations).
 */

/**
 * Known stake program addresses per network.
 *
 * devnet: UPDATED from the SUPERSEDED `51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ`
 * (the old `percolator-vault@eb3ebe8` deployment) to the FRESH v17 devnet triple's
 * stake address `VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w`, deployed 2026-07-17
 * from `~/v17/percolator-stake@1e08d35` (hash `0e9c2572...`), cross-verified against
 * `PROGRAM_IDS_V17.vault` in `src/config/program-ids.ts` ("v17 vault — deployed
 * devnet 2026-07-17, hash-verified"). This is a NEW address (not an in-place upgrade
 * of the old 51CeUNpb... address, which is now superseded and should not be used for
 * new integrations) and already runs the ADOPTED `percolator-stake` lineage this
 * module targets — see the module doc above.
 *
 * mainnet: UNVERIFIED as *ours* — no confirmed mainnet stake/vault deployment exists
 * in any v17 planning doc (Percolator mainnet is still in prep). Do not treat this as
 * ground truth; prefer the STAKE_PROGRAM_ID env override on mainnet until DevOps
 * confirms.
 *
 * IMPORTANT: "unverified" does NOT mean "inert". Checked against mainnet RPC on
 * 2026-08-16, DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F is a LIVE, executable
 * BPFLoaderUpgradeable program. That is precisely why getStakeProgramId() must not
 * silently default to mainnet: an unconfigured browser caller would have resolved to
 * a real, executing mainnet program rather than failing safe.
 */
declare const STAKE_PROGRAM_IDS: {
    readonly devnet: "VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w";
    readonly mainnet: "DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F";
};
/**
 * Resolve the stake program ID for the given network.
 *
 * Priority:
 *  1. STAKE_PROGRAM_ID env var (explicit override — DevOps sets this for mainnet until constant is filled)
 *  2. Network-specific constant from STAKE_PROGRAM_IDS
 *
 * Throws a clear error on mainnet when no address is available so callers
 * surface the gap instead of silently hitting the devnet program.
 */
declare function getStakeProgramId(network?: 'devnet' | 'mainnet'): PublicKey;
/**
 * Default export — resolves for the current runtime network.
 * Use getStakeProgramId() with an explicit network argument where possible.
 *
 * @deprecated Direct use of STAKE_PROGRAM_ID is being phased out in favour of
 *   getStakeProgramId() so mainnet callers get a clear error rather than silently
 *   resolving to the devnet address.
 */
declare const STAKE_PROGRAM_ID: PublicKey;
declare const STAKE_IX: {
    readonly InitPool: 0;
    readonly Deposit: 1;
    readonly Withdraw: 2;
    readonly FlushToInsurance: 3;
    readonly UpdateConfig: 4;
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
    readonly ProposeAdmin: 5;
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
    readonly AcceptAdmin: 6;
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
    readonly ProposeCooldownIncrease: 7;
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
    readonly CommitCooldownIncrease: 8;
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
    readonly CancelCooldownIncrease: 9;
    /** @deprecated Alias for ProposeAdmin — the OLD percolator-vault semantics
     *  (one-step TransferAdmin) no longer apply; tag 5 is now ProposeAdmin. */
    readonly TransferAdmin: 5;
    /** @deprecated Alias for AcceptAdmin — the OLD percolator-vault semantics
     *  (AdminSetOracleAuthority) no longer apply; tag 6 is now AcceptAdmin. */
    readonly AdminSetOracleAuthority: 6;
    /** @deprecated Alias for ProposeCooldownIncrease — the OLD percolator-vault
     *  semantics (AdminSetRiskThreshold) no longer apply; tag 7 is now
     *  ProposeCooldownIncrease with a DIFFERENT wire format (u64, not removed-stub). */
    readonly AdminSetRiskThreshold: 7;
    /** @deprecated Alias for CommitCooldownIncrease — the OLD percolator-vault
     *  semantics (AdminSetMaintenanceFee) no longer apply; tag 8 is now
     *  CommitCooldownIncrease. */
    readonly AdminSetMaintenanceFee: 8;
    /** @deprecated Alias for CancelCooldownIncrease — the OLD percolator-vault
     *  semantics (AdminResolveMarket) no longer apply; tag 9 is now
     *  CancelCooldownIncrease. */
    readonly AdminResolveMarket: 9;
    /**
     * ReturnInsurance (tag 10) — unchanged wire/semantics vs the deployed
     * percolator-vault program: transfer withdrawn insurance back into the pool
     * vault (admin calls wrapper WithdrawInsurance directly first, then this
     * books admin-ATA -> pool-vault).
     */
    readonly ReturnInsurance: 10;
    /** @deprecated Legacy alias for ReturnInsurance. */
    readonly AdminWithdrawInsurance: 10;
    /** @deprecated Tombstoned in BOTH lineages (was an admin CPI proxy —
     *  SetInsurancePolicy). This tag rejects on-chain in the adopted lineage too. */
    readonly AdminSetInsurancePolicy: 11;
    /** PERC-272: Accrue trading fees to LP vault. Unchanged vs deployed vault. */
    readonly AccrueFees: 12;
    /** PERC-272: Init pool in trading LP mode. Unchanged vs deployed vault. */
    readonly InitTradingPool: 13;
    /** PERC-313: Set HWM config (enable + floor bps). Unchanged vs deployed vault. */
    readonly AdminSetHwmConfig: 14;
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
    readonly AdminSetTrancheConfig: 15;
    /**
     * DepositJunior (tag 16) — deposit into the junior (first-loss) tranche.
     * Same account shape as Deposit (tag 1).
     *
     * BREAKING vs the deployed percolator-vault program: tag 16 is UNHANDLED
     * there (rejects). Live only on the adopted lineage.
     *
     * Wire: tag(1) + amount(u64) = 9 bytes.
     */
    readonly DepositJunior: 16;
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
    readonly BindInsuranceAuthority: 19;
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
    readonly RotateInsuranceAuthority: 20;
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
    readonly BurnAssetAdmin: 21;
    /**
     * RotateInsuranceOperator (tag 22) — analogous to RotateInsuranceAuthority
     * (tag 20) but for `insurance_operator` (kind=2). Part of the no-lockout
     * migration sequence before a final BurnAssetAdmin. NEW in the adopted
     * lineage.
     *
     * Wire: tag(1) — no payload.
     * Accounts: [admin(signer), poolPda, vaultAuth, newTarget(signer), slab(writable), percolatorProgram]
     */
    readonly RotateInsuranceOperator: 22;
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
    readonly RecoverFlushedInsurance: 23;
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
    readonly AdminResolveMarketCpi: 24;
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
    readonly SetMarketResolved: 18;
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
    readonly AdminUpdateFeeSplit: 25;
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
    readonly AdminUpdateMaintenanceFeePerSlot: 26;
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
    readonly AdminUpdateBackingFeePolicy: 27;
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
    readonly AdminUpdateTradeFeePolicy: 28;
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
    readonly RecoverTerminalInsurance: 29;
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
    readonly AdminCloseSlab: 30;
};
/**
 * User-facing hint text for `StakeError` custom program error codes
 * (`ProgramError::Custom(code)`, `percolator-stake/src/error.rs`).
 *
 * Codes 0-24 mirror `error.rs`'s on-chain `error_hint()` fallback text.
 * Codes 25-27 (#242 cooldown-increase timelock) and 28
 * (`DepositBelowMinimumLiquidity`, N7 anti-inflation hardening) are new in
 * the ADOPTED lineage — 28 is the entry this table exists to add. NOTE:
 * the on-chain `error_hint()` itself has a gap (falls through to "Unknown
 * error" for 25-27 despite them being named enum variants); the hints below
 * for 25-27 are derived from `error.rs`'s doc comments, not copied from a
 * (missing) on-chain string.
 */
declare const STAKE_ERRORS: Record<number, string>;
/** Derive the stake pool PDA for a given slab (market). */
declare function deriveStakePool(slab: PublicKey, programId?: PublicKey): [PublicKey, number];
/** Derive the vault authority PDA (signs CPI, owns LP mint + vault). */
declare function deriveStakeVaultAuth(pool: PublicKey, programId?: PublicKey): [PublicKey, number];
/** Derive the per-user deposit PDA (tracks cooldown, deposit time). */
declare function deriveDepositPda(pool: PublicKey, user: PublicKey, programId?: PublicKey): [PublicKey, number];
/** Tag 0: InitPool — create stake pool for a slab. */
declare function encodeStakeInitPool(cooldownSlots: bigint | number, depositCap: bigint | number): Uint8Array;
/**
 * Tag 1: Deposit — deposit collateral, receive LP tokens.
 *
 * F-9 (percolator-stake #301): refused with `MarketResolved` (8) once the
 * wrapper market is Resolved, so nobody can buy in ahead of a terminal
 * insurance recovery (tag 29), and with `UnsupportedWrapperLayout` (32,
 * non-retryable) when the bound wrapper market is not the pinned VERSION-18 layout.
 */
declare function encodeStakeDeposit(amount: bigint | number): Uint8Array;
/** Tag 2: Withdraw — burn LP tokens, receive collateral (subject to cooldown). */
declare function encodeStakeWithdraw(lpAmount: bigint | number): Uint8Array;
/** Tag 3: FlushToInsurance — move collateral from stake vault to wrapper insurance. */
declare function encodeStakeFlushToInsurance(amount: bigint | number): Uint8Array;
/** Tag 4: UpdateConfig — update cooldown and/or deposit cap. */
declare function encodeStakeUpdateConfig(newCooldownSlots?: bigint | number, newDepositCap?: bigint | number): Uint8Array;
/**
 * Tag 5: ProposeAdmin — step 1 of two-step `pool.admin` rotation. The
 * CURRENT admin proposes `newAdmin` (written to `pool.pending_admin`); it
 * does not gain any authority until AcceptAdmin (tag 6) is called by that
 * key. Pass `PublicKey.default` (zero pubkey) to CANCEL an outstanding
 * proposal.
 *
 * Accounts: [currentAdmin(signer), poolPda(writable)]
 */
declare function encodeStakeProposeAdmin(newAdmin: PublicKey): Uint8Array;
/**
 * Tag 6: AcceptAdmin — step 2 of two-step `pool.admin` rotation. The
 * PENDING admin signs to become admin. Requires an outstanding proposal.
 *
 * Accounts: [pendingAdmin(signer), poolPda(writable)]
 */
declare function encodeStakeAcceptAdmin(): Uint8Array;
/**
 * Tag 7: ProposeCooldownIncrease — step 1 of the #242 cooldown-increase
 * timelock. Proposes a NEW (larger) `cooldownSlots`; does not take effect
 * until CommitCooldownIncrease is called after the on-chain timelock has
 * elapsed. A decrease/unchanged value is rejected (use UpdateConfig instead).
 *
 * Accounts: [admin(signer), poolPda(writable), clockSysvar]
 */
declare function encodeStakeProposeCooldownIncrease(newCooldownSlots: bigint | number): Uint8Array;
/**
 * Tag 8: CommitCooldownIncrease — step 2 of the #242 timelock. Applies the
 * pending cooldown increase; rejects if the timelock has not yet elapsed.
 *
 * Accounts: [admin(signer), poolPda(writable), clockSysvar]
 */
declare function encodeStakeCommitCooldownIncrease(): Uint8Array;
/**
 * Tag 9: CancelCooldownIncrease — withdraws an outstanding #242 cooldown
 * increase proposal.
 *
 * Accounts: [admin(signer), poolPda(writable)]
 */
declare function encodeStakeCancelCooldownIncrease(): Uint8Array;
/**
 * @deprecated The deployed percolator-vault program's one-step TransferAdmin
 * (tag 5) was removed on-chain there too (rejects). On the ADOPTED
 * percolator-stake lineage this module targets, tag 5 is the two-step
 * ProposeAdmin — use `encodeStakeProposeAdmin(newAdmin)` followed by the
 * proposed admin calling `encodeStakeAcceptAdmin()`. Throws.
 */
declare function encodeStakeTransferAdmin(): Uint8Array;
/**
 * @deprecated Tag 6 is AcceptAdmin in the adopted percolator-stake lineage
 * (this instruction, AdminSetOracleAuthority, was removed on-chain in both
 * lineages). Throws.
 */
declare function encodeStakeAdminSetOracleAuthority(newAuthority: PublicKey): Uint8Array;
/**
 * @deprecated Tag 7 is ProposeCooldownIncrease in the adopted percolator-stake
 * lineage (this instruction, AdminSetRiskThreshold, was removed on-chain in
 * both lineages). Throws.
 */
declare function encodeStakeAdminSetRiskThreshold(newThreshold: bigint | number): Uint8Array;
/**
 * @deprecated Tag 8 is CommitCooldownIncrease in the adopted percolator-stake
 * lineage (this instruction, AdminSetMaintenanceFee, was removed on-chain in
 * both lineages). Throws.
 */
declare function encodeStakeAdminSetMaintenanceFee(newFee: bigint | number): Uint8Array;
/**
 * @deprecated Tag 9 is CancelCooldownIncrease in the adopted percolator-stake
 * lineage (this instruction, AdminResolveMarket, was removed on-chain in both
 * lineages). Throws.
 */
declare function encodeStakeAdminResolveMarket(): Uint8Array;
/** Tag 10: ReturnInsurance — transfer withdrawn insurance back into the stake pool vault. */
declare function encodeStakeReturnInsurance(amount: bigint | number): Uint8Array;
/** @deprecated Legacy alias for tag 10. Current on-chain semantics are ReturnInsurance. */
declare function encodeStakeAdminWithdrawInsurance(amount: bigint | number): Uint8Array;
/** Tag 12: AccrueFees — permissionless: accrue trading fees to LP vault. */
declare function encodeStakeAccrueFees(): Uint8Array;
/** Tag 13: InitTradingPool — create pool in trading LP mode (pool_mode = 1). */
declare function encodeStakeInitTradingPool(cooldownSlots: bigint | number, depositCap: bigint | number): Uint8Array;
/** Tag 14 (PERC-313): AdminSetHwmConfig — enable HWM protection and set floor BPS. */
declare function encodeStakeAdminSetHwmConfig(enabled: boolean, hwmFloorBps: number): Uint8Array;
/**
 * Tag 15: AdminSetTrancheConfig — enable/configure senior-junior LP tranches.
 *
 * BREAKING vs the deployed percolator-vault program: tag 15 there is
 * BindInsuranceAuthority (moved to tag 19 in the adopted lineage — see
 * `encodeStakeBindInsuranceAuthority()`). Only send this against the ADOPTED
 * percolator-stake lineage; sending it against the currently-deployed vault
 * program would silently execute BindInsuranceAuthority instead.
 *
 * Wire: tag(1) + junior_fee_mult_bps(u16) = 3 bytes.
 * Accounts: [admin(signer), poolPda(writable)]
 */
declare function encodeStakeAdminSetTrancheConfig(juniorFeeMultBps: number): Uint8Array;
/**
 * Tag 16: DepositJunior — deposit into the junior (first-loss) tranche. Same
 * account shape as Deposit (tag 1) — see `StakeAccounts['deposit']`.
 *
 * BREAKING vs the deployed percolator-vault program: tag 16 is UNHANDLED
 * there (rejects). Live only on the ADOPTED percolator-stake lineage.
 *
 * Wire: tag(1) + amount(u64) = 9 bytes.
 */
declare function encodeStakeDepositJunior(amount: bigint | number): Uint8Array;
/**
 * Tag 18: SetMarketResolved — admin marks the pool as market-resolved
 * (blocks new deposits). Call after resolving the market on the wrapper
 * directly.
 *
 * BREAKING vs the deployed percolator-vault program: tag 18 is UNHANDLED
 * there (rejects). Live only on the ADOPTED percolator-stake lineage.
 *
 * Wire: tag(1) — no payload.
 * Accounts: [admin(signer), poolPda(writable)]
 */
declare function encodeStakeSetMarketResolved(): Uint8Array;
/**
 * Tag 19 (0x13): BindInsuranceAuthority — FIND-4 fix, MOVED from tag 15
 * (0x0F) in the deployed percolator-vault program.
 *
 * Binds the vault_auth PDA as BOTH the wrapper's asset-0 insurance_authority
 * AND insurance_operator (two CPIs to UpdateAssetAuthority, tag 65, kind=1
 * then kind=2) — a broader bind than the deployed vault program's
 * single-CPI version (insurance_authority only). Must be called once after
 * InitPool, before FlushToInsurance will work.
 *
 * Wire: tag(1) = 0x13 — no payload beyond the tag byte (1 byte total).
 *
 * @returns 1-byte Uint8Array `[0x13]`.
 *
 * @example
 * ```ts
 * const data = encodeStakeBindInsuranceAuthority();
 * // accounts: bindInsuranceAuthorityAccounts({ admin, poolPda, vaultAuth, slab, percolatorProgram })
 * ```
 */
declare function encodeStakeBindInsuranceAuthority(): Uint8Array;
/**
 * Account inputs for BindInsuranceAuthority (tag 19 / 0x13).
 *
 * @param admin               Current insurance_authority/insurance_operator (human admin wallet; outer tx signer).
 * @param poolPda             Stake pool PDA (derived via deriveStakePool()).
 * @param vaultAuth           Vault authority PDA (derived via deriveStakeVaultAuth()).
 * @param slab                Wrapper market-group slab (writable — needed for UpdateAssetAuthority CPI).
 * @param percolatorProgram   Wrapper program ID.
 */
interface BindInsuranceAuthorityAccounts {
    admin: PublicKey;
    poolPda: PublicKey;
    vaultAuth: PublicKey;
    slab: PublicKey;
    percolatorProgram: PublicKey;
}
/**
 * Build account keys for BindInsuranceAuthority (tag 19 / 0x13).
 *
 * Account order matches src/processor.rs process_bind_insurance_authority
 * (adopted lineage — same account shape as the deployed vault program's tag
 * 15, only the tag byte moved):
 *   [0] admin              signer, read-only  (current insurance_authority/insurance_operator)
 *   [1] pool_pda           writable           (stake pool PDA)
 *   [2] vault_auth         read-only          (new authority; signs via invoke_signed)
 *   [3] slab               writable           (wrapper market; needed for CPI)
 *   [4] percolator_program read-only          (wrapper program for CPI dispatch)
 *
 * @param a Named accounts.
 * @returns Array of `{pubkey, isSigner, isWritable}` in program-expected order.
 *
 * @example
 * ```ts
 * const [poolPda] = deriveStakePool(slab, stakeProgramId);
 * const [vaultAuth] = deriveStakeVaultAuth(poolPda, stakeProgramId);
 * const keys = bindInsuranceAuthorityAccounts({ admin, poolPda, vaultAuth, slab, percolatorProgram });
 * ```
 */
declare function bindInsuranceAuthorityAccounts(a: BindInsuranceAuthorityAccounts): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Tag 20: RotateInsuranceAuthority — admin-gated migration/incident escape
 * that moves the market's `insurance_authority` OFF our vault_auth PDA to an
 * admin-specified `newTarget`. NEW in the adopted lineage — no equivalent in
 * the deployed percolator-vault program (which has no un-bind escape).
 *
 * Wire: tag(1) — no payload.
 *
 * @returns 1-byte Uint8Array.
 *
 * @example
 * ```ts
 * const data = encodeStakeRotateInsuranceAuthority();
 * // accounts: rotateInsuranceAccounts({ admin, poolPda, vaultAuth, newTarget, slab, percolatorProgram })
 * ```
 */
declare function encodeStakeRotateInsuranceAuthority(): Uint8Array;
/**
 * Tag 22: RotateInsuranceOperator — analogous to RotateInsuranceAuthority
 * (tag 20) but for `insurance_operator` (kind=2). Part of the no-lockout
 * migration sequence before a final BurnAssetAdmin. NEW in the adopted
 * lineage.
 *
 * Wire: tag(1) — no payload.
 *
 * @returns 1-byte Uint8Array.
 *
 * @example
 * ```ts
 * const data = encodeStakeRotateInsuranceOperator();
 * // accounts: rotateInsuranceAccounts({ admin, poolPda, vaultAuth, newTarget, slab, percolatorProgram })
 * ```
 */
declare function encodeStakeRotateInsuranceOperator(): Uint8Array;
/**
 * Account inputs shared by RotateInsuranceAuthority (tag 20) and
 * RotateInsuranceOperator (tag 22) — identical 6-account shape.
 *
 * @param admin               Pool admin (outer tx signer; == pool.admin).
 * @param poolPda             Stake pool PDA.
 * @param vaultAuth           Vault authority PDA — the CURRENT authority/operator, signs via invoke_signed.
 * @param newTarget           The successor authority/operator — co-signs the outer tx.
 * @param slab                Wrapper market-group slab (writable — needed for the CPI).
 * @param percolatorProgram   Wrapper program ID.
 */
interface RotateInsuranceAccounts {
    admin: PublicKey;
    poolPda: PublicKey;
    vaultAuth: PublicKey;
    newTarget: PublicKey;
    slab: PublicKey;
    percolatorProgram: PublicKey;
}
/**
 * Build account keys for RotateInsuranceAuthority (tag 20) / RotateInsuranceOperator
 * (tag 22) — identical account order in both (src/processor.rs
 * process_rotate_insurance_authority / process_rotate_insurance_operator):
 *   [0] admin              signer, read-only  (== pool.admin)
 *   [1] pool_pda           read-only
 *   [2] vault_auth         read-only          (current authority/operator; signs via invoke_signed)
 *   [3] new_target         signer, read-only  (successor; co-signs the outer tx)
 *   [4] slab               writable           (wrapper market; needed for CPI)
 *   [5] percolator_program read-only          (wrapper program for CPI dispatch)
 *
 * @param a Named accounts.
 * @returns Array of `{pubkey, isSigner, isWritable}` in program-expected order.
 */
declare function rotateInsuranceAccounts(a: RotateInsuranceAccounts): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Tag 21: BurnAssetAdmin — IRREVERSIBLE removal of the admin's rotate-back
 * capability. CPIs UpdateAssetAuthority(kind=0 ASSET_ADMIN, new_pubkey=[0;32]).
 * After this, no key can rotate ANY per-asset authority back to an
 * admin-controlled key. Call ONCE per market, only after
 * BindInsuranceAuthority has completed. NEW in the adopted lineage.
 *
 * Wire: tag(1) — no payload.
 *
 * @returns 1-byte Uint8Array.
 *
 * @example
 * ```ts
 * const data = encodeStakeBurnAssetAdmin();
 * // accounts: burnAssetAdminAccounts({ admin, poolPda, vaultAuth, slab, percolatorProgram })
 * ```
 */
declare function encodeStakeBurnAssetAdmin(): Uint8Array;
/**
 * Account inputs for BurnAssetAdmin (tag 21).
 *
 * @param admin               Pool admin (outer tx signer; == pool.admin; current asset_admin).
 * @param poolPda             Stake pool PDA (writable — records the burn).
 * @param vaultAuth           Vault authority PDA (placeholder new_authority slot — not checked for the burn CPI).
 * @param slab                Wrapper market-group slab (writable — needed for the CPI).
 * @param percolatorProgram   Wrapper program ID.
 */
interface BurnAssetAdminAccounts {
    admin: PublicKey;
    poolPda: PublicKey;
    vaultAuth: PublicKey;
    slab: PublicKey;
    percolatorProgram: PublicKey;
}
/**
 * Build account keys for BurnAssetAdmin (tag 21) — src/processor.rs
 * process_burn_asset_admin:
 *   [0] admin              signer, writable   (current asset_admin == pool.admin)
 *   [1] pool_pda           writable           (records asset_admin_burned)
 *   [2] vault_auth         read-only          (placeholder new_authority slot)
 *   [3] slab               writable           (wrapper market; needed for CPI)
 *   [4] percolator_program read-only          (wrapper program for CPI dispatch)
 *
 * @param a Named accounts.
 * @returns Array of `{pubkey, isSigner, isWritable}` in program-expected order.
 */
declare function burnAssetAdminAccounts(a: BurnAssetAdminAccounts): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Tag 23: RecoverFlushedInsurance — PERMISSIONLESS recovery of tokens from
 * the wrapper's insurance fund back into the stake pool vault, via a CPI to
 * wrapper tag 57 `WithdrawInsuranceAsset` (gated on insurance_operator ==
 * vault_auth PDA — set by BindInsuranceAuthority tag 19). Survives
 * BurnAssetAdmin because tag 57 gates on insurance_operator, not asset_admin.
 * `amount` is capped on-chain to `total_flushed - total_returned`; funds can
 * only land in `pool.vault` (drain check on the CPI destination). NEW in the
 * adopted lineage.
 *
 * Wire: tag(1) + amount(u64) = 9 bytes.
 *
 * @param amount Atoms to recover (u64, non-zero, <= outstanding).
 *
 * @example
 * ```ts
 * const data = encodeStakeRecoverFlushedInsurance(1_000_000n);
 * // accounts: recoverFlushedInsuranceAccounts({ caller, poolPda, poolVault, vaultAuth,
 * //   wrapperMarket, wrapperVault, wrapperVaultAuth, tokenProgram, percolatorProgram })
 * ```
 */
declare function encodeStakeRecoverFlushedInsurance(amount: bigint | number): Uint8Array;
/**
 * Account inputs for RecoverFlushedInsurance (tag 23).
 *
 * @param caller             Permissionless caller — no signer check required.
 * @param poolPda             Stake pool PDA (writable).
 * @param poolVault           Pool vault token account — destination (writable, must equal pool.vault).
 * @param vaultAuth           Vault authority PDA — the insurance_operator; signs the CPI via invoke_signed.
 * @param wrapperMarket       Wrapper market/slab account (writable).
 * @param wrapperVault        Wrapper insurance vault token account — source (writable).
 * @param wrapperVaultAuth    Wrapper vault authority PDA.
 * @param tokenProgram        Token program.
 * @param percolatorProgram   Wrapper program ID.
 */
interface RecoverFlushedInsuranceAccounts {
    caller: PublicKey;
    poolPda: PublicKey;
    poolVault: PublicKey;
    vaultAuth: PublicKey;
    wrapperMarket: PublicKey;
    wrapperVault: PublicKey;
    wrapperVaultAuth: PublicKey;
    tokenProgram: PublicKey;
    percolatorProgram: PublicKey;
}
/**
 * Build account keys for RecoverFlushedInsurance (tag 23) — src/processor.rs
 * process_recover_flushed_insurance:
 *   [0] caller              (no signer check — permissionless)
 *   [1] pool_pda            writable
 *   [2] vault (pool vault)  writable   (destination; must equal pool.vault)
 *   [3] vault_auth          read-only  (signs the wrapper CPI via invoke_signed)
 *   [4] market (wrapper)    writable
 *   [5] wrapper_vault       writable   (source — wrapper insurance vault)
 *   [6] wrapper_vault_auth  read-only
 *   [7] token_program       read-only
 *   [8] percolator_program  read-only
 *
 * @param a Named accounts.
 * @returns Array of `{pubkey, isSigner, isWritable}` in program-expected order.
 */
declare function recoverFlushedInsuranceAccounts(a: RecoverFlushedInsuranceAccounts): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Tag 24: AdminResolveMarketCpi — CPI proxy for the wrapper's ResolveMarket
 * (wrapper tag 19). Only the pool PDA (bound as `cfg.marketauth` by InitPool)
 * can call the wrapper's ResolveMarket directly; this instruction has the
 * stake program sign that CPI via `invoke_signed` with the pool PDA seeds so
 * the (human) admin can trigger resolution. Does not mutate any local
 * stake-side state — call `encodeStakeSetMarketResolved()` (tag 18)
 * separately afterward for local bookkeeping.
 *
 * Wire: tag(1) = 24 — no payload beyond the tag byte.
 *
 * @returns 1-byte Uint8Array `[24]`.
 *
 * @example
 * ```ts
 * const data = encodeStakeAdminResolveMarketCpi();
 * // accounts: adminResolveMarketCpiAccounts({ admin, poolPda, slab, percolatorProgram })
 * ```
 */
declare function encodeStakeAdminResolveMarketCpi(): Uint8Array;
/**
 * Account inputs for AdminResolveMarketCpi (tag 24).
 *
 * @param admin               Pool admin (outer tx signer; == pool.admin).
 * @param poolPda             Stake pool PDA — signs the wrapper CPI via invoke_signed (marketauth).
 * @param slab                Wrapper market-group slab (writable — target of the ResolveMarket CPI).
 * @param percolatorProgram   Wrapper program ID (CPI target).
 */
interface AdminResolveMarketCpiAccounts {
    admin: PublicKey;
    poolPda: PublicKey;
    slab: PublicKey;
    percolatorProgram: PublicKey;
}
/**
 * Build account keys for AdminResolveMarketCpi (tag 24) — src/processor.rs
 * process_admin_resolve_market:
 *   [0] admin              signer, read-only  (== pool.admin)
 *   [1] pool_pda           read-only          (marketauth; signs the CPI via invoke_signed)
 *   [2] slab               writable           (wrapper market; ResolveMarket CPI target)
 *   [3] percolator_program read-only          (wrapper program for CPI dispatch)
 *
 * @param a Named accounts.
 * @returns Array of `{pubkey, isSigner, isWritable}` in program-expected order.
 */
declare function adminResolveMarketCpiAccounts(a: AdminResolveMarketCpiAccounts): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Encode AdminUpdateFeeSplit (stake tag 25) — CPI proxy for wrapper tag 86.
 *
 * Wire: tag(1) + creator_share_bps(u16 LE) + lp_share_bps(u16 LE) +
 * insurance_share_bps(u16 LE) = 7 bytes. The stake program rejects any payload
 * whose length is not exactly 6 bytes after the tag.
 *
 * Use this instead of `encodeUpdateFeeSplit` once `StakeInitPool` has rotated
 * `cfg.marketauth` to the pool PDA. Before that, call the wrapper directly.
 *
 * Share validation happens in the WRAPPER, not here: a split that does not sum
 * to 8000 surfaces as wrapper Custom(52) FeeSplitSumInvalid through the CPI,
 * and a floor breach as Custom(51) FeeSplitFloorViolation.
 *
 * @param creatorShareBps Creator's share of T in bps (<= 3600).
 * @param lpShareBps LP vault's share of T in bps (>= 3200).
 * @param insuranceShareBps Insurance/staker share of T in bps (>= 1200).
 * @returns 7-byte instruction data buffer.
 *
 * @example
 * ```ts
 * const data = encodeStakeAdminUpdateFeeSplit(1600, 4800, 1600);
 * const keys = adminUpdateFeeSplitAccounts({ admin, poolPda, slab, percolatorProgram });
 * ```
 */
declare function encodeStakeAdminUpdateFeeSplit(creatorShareBps: number, lpShareBps: number, insuranceShareBps: number): Uint8Array;
/**
 * Encode AdminUpdateMaintenanceFeePerSlot (stake tag 26) — CPI proxy for
 * wrapper tag 88.
 *
 * Wire: tag(1) + maintenance_fee_per_slot(u128 LE) = 17 bytes.
 *
 * ⚠ THE PAYLOAD IS u128, NOT u64. The stake program checks `rest.len() == 16`
 * and rejects otherwise; the wrapper then decodes with `read_u128`. Passing a
 * u64 fails at the stake program before the CPI is even attempted.
 *
 * @param maintenanceFeePerSlot Fee charged per slot, u128. Default on-chain is
 *                              0 (maintenance fee disabled). The wrapper
 *                              range-checks against MAX_PROTOCOL_FEE_ABS.
 * @returns 17-byte instruction data buffer.
 *
 * @example
 * ```ts
 * const data = encodeStakeAdminUpdateMaintenanceFeePerSlot(0n);
 * ```
 */
declare function encodeStakeAdminUpdateMaintenanceFeePerSlot(maintenanceFeePerSlot: bigint | number): Uint8Array;
/**
 * Encode AdminUpdateBackingFeePolicy (stake tag 27) — CPI proxy for wrapper
 * tag 51, signed by the `vault_auth` PDA.
 *
 * Wire: tag(1) + domain(u16 LE) + fee_bps(u16 LE) + insurance_share_bps(u16 LE)
 * = 7 bytes.
 *
 * @param domain Backing domain index (u16). `asset_index = domain / 2`.
 * @param feeBps Backing fee in bps (u16).
 * @param insuranceShareBps Insurance share of the backing fee in bps (u16).
 * @returns 7-byte instruction data buffer.
 *
 * @example
 * ```ts
 * const data = encodeStakeAdminUpdateBackingFeePolicy(0, 30, 5000);
 * const keys = adminUpdateBackingFeePolicyAccounts({
 *   admin, poolPda, vaultAuth, slab, percolatorProgram,
 * });
 * ```
 */
declare function encodeStakeAdminUpdateBackingFeePolicy(domain: number, feeBps: number, insuranceShareBps: number): Uint8Array;
/**
 * Encode AdminUpdateTradeFeePolicy (stake tag 28) — CPI proxy for wrapper tag
 * 55, signed by the `vault_auth` PDA.
 *
 * Wire: tag(1) + trade_fee_base_bps(u64 LE) = 9 bytes. The stake program
 * checks `rest.len() == 8`.
 *
 * Sets `T`, the base trade fee that the four-way split divides.
 *
 * @param tradeFeeBaseBps Base trade fee in bps (u64). The wrapper rejects
 *                        values above the market's `max_trading_fee_bps` or
 *                        above MAX_DYNAMIC_TRADE_FEE_BPS.
 * @returns 9-byte instruction data buffer.
 *
 * @example
 * ```ts
 * const data = encodeStakeAdminUpdateTradeFeePolicy(30n);
 * ```
 */
declare function encodeStakeAdminUpdateTradeFeePolicy(tradeFeeBaseBps: bigint | number): Uint8Array;
/**
 * Account inputs for the GROUP A proxies (stake tags 25 and 26), where the
 * wrapper gate is `cfg.marketauth` and the pool PDA signs the CPI.
 *
 * @param admin             Pool admin (outer tx signer; == pool.admin).
 * @param poolPda           Stake pool PDA — the marketauth; signs via invoke_signed.
 * @param slab              Wrapper market-group slab (writable — CPI target).
 * @param percolatorProgram Wrapper program ID (CPI target).
 */
interface StakeGroupAProxyAccounts {
    admin: PublicKey;
    poolPda: PublicKey;
    slab: PublicKey;
    percolatorProgram: PublicKey;
}
/**
 * Build account keys for the GROUP A proxies — src/processor.rs
 * `process_admin_update_fee_split` (tag 25) and
 * `process_admin_update_maintenance_fee_per_slot` (tag 26), which share an
 * identical layout:
 *   [0] admin              signer, read-only  (== pool.admin)
 *   [1] pool_pda           read-only          (marketauth; signs via invoke_signed)
 *   [2] slab               writable           (wrapper market; CPI target)
 *   [3] percolator_program read-only          (wrapper program for CPI dispatch)
 *
 * Identical to `adminResolveMarketCpiAccounts` (tag 24).
 *
 * @param a Named accounts.
 * @returns Array of `{pubkey, isSigner, isWritable}` in program-expected order.
 */
declare function stakeGroupAProxyAccounts(a: StakeGroupAProxyAccounts): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/** Account keys for AdminUpdateFeeSplit (stake tag 25). Alias of {@link stakeGroupAProxyAccounts}. */
declare const adminUpdateFeeSplitAccounts: typeof stakeGroupAProxyAccounts;
/** Account keys for AdminUpdateMaintenanceFeePerSlot (stake tag 26). Alias of {@link stakeGroupAProxyAccounts}. */
declare const adminUpdateMaintenanceFeePerSlotAccounts: typeof stakeGroupAProxyAccounts;
/**
 * Account inputs for the GROUP B proxies (stake tags 27 and 28), where the
 * wrapper gate is asset 0's `insurance_authority` and `vault_auth` signs.
 *
 * @param admin             Pool admin (outer tx signer; == pool.admin).
 * @param poolPda           Stake pool PDA — used to DERIVE and verify vaultAuth; NOT a signer.
 * @param vaultAuth         Vault authority PDA ['vault_auth', poolPda] — the
 *                          insurance_authority; signs via invoke_signed.
 * @param slab              Wrapper market-group slab (writable — CPI target).
 * @param percolatorProgram Wrapper program ID (CPI target).
 */
interface StakeGroupBProxyAccounts {
    admin: PublicKey;
    poolPda: PublicKey;
    vaultAuth: PublicKey;
    slab: PublicKey;
    percolatorProgram: PublicKey;
}
/**
 * Build account keys for the GROUP B proxies — src/processor.rs
 * `process_admin_update_backing_fee_policy` (tag 27) and
 * `process_admin_update_trade_fee_policy` (tag 28), which share an identical
 * layout:
 *   [0] admin              signer, read-only  (== pool.admin)
 *   [1] pool_pda           read-only          (derives/verifies vault_auth; NOT a signer)
 *   [2] vault_auth         read-only          (insurance_authority; signs via invoke_signed)
 *   [3] slab               writable           (wrapper market; CPI target)
 *   [4] percolator_program read-only          (wrapper program for CPI dispatch)
 *
 * Note the pool PDA sits at index 1 and does NOT sign here — that is the
 * difference from GROUP A, and getting it wrong makes the CPI fail its
 * authority check rather than fail loudly at the account level.
 *
 * @param a Named accounts.
 * @returns Array of `{pubkey, isSigner, isWritable}` in program-expected order.
 */
declare function stakeGroupBProxyAccounts(a: StakeGroupBProxyAccounts): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/** Account keys for AdminUpdateBackingFeePolicy (stake tag 27). Alias of {@link stakeGroupBProxyAccounts}. */
declare const adminUpdateBackingFeePolicyAccounts: typeof stakeGroupBProxyAccounts;
/** Account keys for AdminUpdateTradeFeePolicy (stake tag 28). Alias of {@link stakeGroupBProxyAccounts}. */
declare const adminUpdateTradeFeePolicyAccounts: typeof stakeGroupBProxyAccounts;
/** @deprecated Removed on-chain in stake v3. Throws instead of emitting a dead instruction. */
declare function encodeStakeAdminSetInsurancePolicy(authority: PublicKey, minWithdrawBase: bigint | number, maxWithdrawBps: number, cooldownSlots: bigint | number): Uint8Array;
/**
 * Decoded StakePool state (392 bytes on-chain — stake v3, current).
 * v2 adds `pending_admin` ([u8;32]) at offset 288 for the two-step admin-rotation
 * primitive (ProposeAdmin tag 5 / AcceptAdmin tag 6). Struct grew 352 → 384.
 * v3 (H-1 re-review fix, `percolator-stake@c5a901f`) appends
 * `total_recovered_from_wrapper` (u64) at the struct TAIL, offset 384..392 —
 * outside `_reserved`, which stays fixed at [320..384]. Struct grew 384 → 392;
 * no prior field offset shifts. Includes PERC-272 (fee yield), PERC-313 (HWM),
 * and PERC-303 (tranches).
 *
 * ⚠️ KNOWN BYTE-ALIASING BUG — **v3 and earlier ONLY; FIXED in v4.**
 *
 * percolator-stake `d0c6ecb` ("promote #242 cooldown timelock out of
 * `_reserved`") resolved this by giving both timelock fields real struct
 * fields at 392/400, leaving `_reserved[10..26]` to the HWM block alone. The
 * decoder is therefore version-aware: on a v4 buffer it reads the dedicated
 * fields and BOTH sets are trustworthy; on v3-and-earlier it keeps reading the
 * aliased `_reserved` slots, because those are the bytes the deployed program
 * actually writes. v3 is still the only DEPLOYED layout, so everything below
 * remains live reality today — it stops applying the moment stake redeploys.
 *
 * The original report (verified against `state.rs` on
 * feat/adopt-stake-lineage-plus-n7@9ec1c3a — a real on-chain bug, not an SDK
 * bug), retained because it describes every pool currently on devnet:
 *
 *   - PERC-313 HWM fields (`hwm_enabled` @[10], `hwm_floor_bps` @[11..13],
 *     `epoch_high_water_tvl` @[16..24], `hwm_last_epoch` @[24..32]) and the
 *     #242 cooldown-increase timelock fields (`pending_cooldown_slots`
 *     @[10..18], `cooldown_proposed_at_slot` @[18..26]) OVERLAP the SAME
 *     `_reserved` bytes [10..26]. `state.rs`'s own doc comment for the HWM
 *     block claims bytes [10..32] are HWM-only, but the timelock accessors
 *     (added later, #242) write into [10..18]/[18..26] regardless.
 *   - Practical effect: enabling HWM (`AdminSetHwmConfig`, tag 14) and using
 *     the cooldown-increase timelock (tags 7/8/9) on the SAME pool will
 *     corrupt each other's state — e.g. `hwm_floor_bps` (bytes [11..13]) sits
 *     inside `pending_cooldown_slots`'s u64 (bytes [10..18]), so committing a
 *     cooldown increase can silently rewrite the HWM floor, and vice versa.
 *   - This decoder reads both field sets as the raw bytes currently define
 *     them (matching on-chain reality); it does NOT attempt to reconcile or
 *     invalidate one set when the other is in use. Callers combining HWM and
 *     the cooldown timelock on one pool should treat both `hwm*` and
 *     `pendingCooldownSlots`/`cooldownProposedAtSlot` as UNRELIABLE and verify
 *     against a direct on-chain read before trusting either.
 */
interface StakePoolState {
    /**
     * Layout version byte, read from `_reserved[8]` (absolute 328, or 296 on v1).
     *
     * Exposed because several fields' MEANING depends on it, not just their
     * offset. Most important: on `version <= 3`, `pendingCooldownSlots` and
     * `cooldownProposedAtSlot` are read from `_reserved` bytes that the PERC-313
     * HWM block also owns, so on a pool with HWM configured they decode as
     * garbage — `cooldownProposedAtSlot` can read non-zero with no proposal ever
     * made, which is this interface's own documented "live proposal" sentinel.
     *
     * Gate on `version >= 4` before trusting either field, and before trusting
     * `hwmFloorBps`/`epochHighWaterTvl` on a pool that has used the timelock.
     */
    version: number;
    isInitialized: boolean;
    bump: number;
    vaultAuthorityBump: number;
    adminTransferred: boolean;
    marketResolved: boolean;
    slab: PublicKey;
    admin: PublicKey;
    collateralMint: PublicKey;
    lpMint: PublicKey;
    vault: PublicKey;
    totalDeposited: bigint;
    totalLpSupply: bigint;
    cooldownSlots: bigint;
    depositCap: bigint;
    totalFlushed: bigint;
    totalReturned: bigint;
    totalWithdrawn: bigint;
    percolatorProgram: PublicKey;
    /**
     * Pending admin for the two-step rotation (stake v2, offset 288).
     * `null` when no proposal is outstanding (all-zero bytes on-chain).
     * Set by ProposeAdmin (tag 5); consumed by AcceptAdmin (tag 6).
     */
    pendingAdmin: PublicKey | null;
    totalFeesEarned: bigint;
    lastFeeAccrualSlot: bigint;
    /**
     * @deprecated percolator-stake #290 (v18.2) repurposed these bytes (offset
     * 272) as {@link StakePoolState.mode0FeesAttributed}. Same value; kept so
     * existing readers compile.
     */
    lastVaultSnapshot: bigint;
    /**
     * percolator-stake #290: mode-0 fee-attribution cursor (offset 272) — the
     * cumulative wrapper tag-87 payout atoms already booked into
     * `totalFeesEarned`. Meaningful only when `feeAttributionArmed` is true; on
     * an un-armed (pre-#290) pool these bytes hold a stale vault snapshot.
     */
    mode0FeesAttributed: bigint;
    /** percolator-stake #290: `_reserved[60] == 1` — the attribution cursor is live. */
    feeAttributionArmed: boolean;
    poolMode: number;
    hwmEnabled: boolean;
    epochHighWaterTvl: bigint;
    hwmFloorBps: number;
    hwmLastEpoch: bigint;
    trancheEnabled: boolean;
    juniorBalance: bigint;
    juniorTotalLp: bigint;
    juniorFeeMultBps: number;
    /**
     * #242 timelock: the `cooldown_slots` INCREASE awaiting commit. Meaningful
     * only while `cooldownProposedAtSlot !== 0n`.
     *
     * v4: real struct field at absolute offset 392..400 — trustworthy.
     * v3 and earlier: read from `_reserved[10..18]`, which ⚠️ ALIASES the HWM
     * block — see the interface doc.
     */
    pendingCooldownSlots: bigint;
    /**
     * #242 timelock: the slot at which the pending cooldown increase was
     * proposed. `0n` = no active proposal.
     *
     * v4: real struct field at absolute offset 400..408 — trustworthy.
     * v3 and earlier: read from `_reserved[18..26]`, which ⚠️ ALIASES the HWM
     * block — see the interface doc.
     */
    cooldownProposedAtSlot: bigint;
    /**
     * Cumulative insurance loss a fully-exited junior tranche permanently
     * REALIZED (issue #161), from _reserved[51..59]. Subtracted from
     * total_pool_value() so recovered tokens don't windfall senior.
     */
    realizedJuniorLoss: bigint;
    /**
     * Whether BurnAssetAdmin (tag 21) has completed for this pool's market
     * (from _reserved[59]). Once true, stake-side rotate escapes (tags 20/22)
     * stay disabled — the wrapper roles cannot be moved back to an
     * admin-controlled key.
     */
    assetAdminBurned: boolean;
    /**
     * H-1 re-review fix (stake v3 and v4, `null` on v1/v2 pools): cumulative
     * collateral actually recovered from the WRAPPER via the tag-23
     * `RecoverFlushedInsurance` CPI (which itself CPIs the wrapper's tag-57
     * `WithdrawInsuranceAsset`) — the ONLY mechanism that pulls flushed
     * insurance back out of the wrapper. Real struct field at offset 384..392
     * (the tail, AFTER `_reserved`), NOT carved from `_reserved`.
     *
     * Deliberately separate from `totalReturned`, which is also bumped by two
     * mechanisms that do NOT recover funds from the wrapper (`ReturnInsurance`
     * tag 10 — the admin's own wallet tokens — and the #161 last-junior-exit
     * phantom write-off). `AdminResolveMarketCpi`/`SetMarketResolved` gate
     * market-resolution on `totalFlushed <= totalRecoveredFromWrapper`, not
     * `totalReturned` — see `state.rs@c5a901f` lines 133-159.
     */
    totalRecoveredFromWrapper: bigint | null;
}
/**
 * Size of StakePool on-chain (bytes) — v1 layout.
 * v1: 352 bytes = 288 bytes of fields + 64 bytes _reserved (no pending_admin field).
 * The _reserved block in v1 starts at offset 288; version byte = 1.
 *
 * LINEAGE NOTE: the ADOPTED percolator-stake lineage this module targets has
 * `CURRENT_VERSION = 3` unconditionally and is a "fresh-start cutover" (no
 * migration path — `state.rs@9ec1c3a` comment: "no v1 pools exist, so no
 * migration is needed"). v1/352-byte pools can only ever be observed as
 * LEGACY accounts from BEFORE the coordinated protocol-fee + stake-lineage
 * redeploy (which abandons every existing market/pool wholesale — VERSION
 * bump 16->17 on the wrapper fails closed on old accounts). This dual-length
 * detection exists purely to decode those pre-redeploy artifacts if you ever
 * need to; the ADOPTED program itself never creates a v1 pool.
 */
declare const STAKE_POOL_SIZE_V1 = 352;
/**
 * Size of StakePool on-chain (bytes) — v2 layout.
 * v2: 384 (stake v1 was 352; `pending_admin: [u8;32]` added at offset 288).
 * The _reserved block in v2 starts at offset 320; version byte = 2.
 * Verified via `core::mem::size_of::<StakePool>()` field-by-field against
 * `percolator-stake/src/state.rs@9ec1c3a` — 384 bytes exactly, no compiler
 * padding (every u64 field lands on an 8-aligned cumulative offset).
 *
 * SUPERSEDED by v3 (`STAKE_POOL_SIZE_V3`, 392 bytes) as of the H-1 re-review
 * fix (`percolator-stake@c5a901f`) — kept here only to decode pools created
 * between the v1->v2 and v2->v3 cutovers, and for any test/tooling code that
 * still needs to construct a v2-shaped buffer explicitly.
 */
declare const STAKE_POOL_SIZE_V2 = 384;
/**
 * Size of StakePool on-chain (bytes) — v3 layout.
 *
 * SUPERSEDED by v4 (`STAKE_POOL_SIZE_V4`, 408 bytes) as of percolator-stake
 * `d0c6ecb`. v3 is still the only layout DEPLOYED today — devnet holds 25
 * pools, all 392 bytes / version 3 — so this remains the layout the decoder
 * meets in practice until the stake redeploy.
 * v3: 392 (stake v2 was 384; `total_recovered_from_wrapper: u64` appended at
 * the STRUCT TAIL, offset 384..392 — NOT inside `_reserved`, which stays a
 * fixed 64 bytes at [320..384] in both v2 and v3; every prior field offset is
 * therefore unchanged from v2). Added for the H-1 re-review fix: gates
 * `AdminResolveMarket`/`SetMarketResolved` on cumulative collateral actually
 * recovered from the wrapper via the tag-23 `RecoverFlushedInsurance` CPI,
 * instead of the broader (and gameable) `total_returned` counter — see
 * `state.rs@c5a901f` lines 133-159 for the full rationale.
 * Verified via `core::mem::size_of::<StakePool>()` field-by-field against
 * `percolator-stake/src/state.rs@c5a901f` — 392 bytes exactly, no compiler
 * padding (the appended u64 lands on the already-8-aligned offset 384).
 */
declare const STAKE_POOL_SIZE_V3 = 392;
/**
 * Size of StakePool on-chain (bytes) for the v4 layout.
 *
 * percolator-stake `d0c6ecb` — "promote #242 cooldown timelock out of
 * `_reserved` (v4, 392 -> 408)" — moved `pending_cooldown_slots` and
 * `cooldown_proposed_at_slot` from `_reserved[10..26]` to real struct fields at
 * absolute 392 and 400, growing the account by 16 bytes. The wrapper matches:
 * `percolator-prog` `v16_program.rs` pins `STAKE_POOL_LEN = 408` and
 * `STAKE_POOL_VERSION = 4`.
 *
 * NOT YET DEPLOYED (as account DATA): devnet
 * `VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w` last checked with 25 pools,
 * all 392 bytes / version 3 — a program code upgrade doesn't resize existing
 * account data, only a fresh re-seed does. This is the layout `STAKE_POOL_SIZE`
 * aliases to on the v18-migration branch (see that constant's doc comment).
 */
declare const STAKE_POOL_SIZE_V4 = 408;
/**
 * Size of StakePool on-chain (bytes) — alias for the layout this SDK targets.
 *
 * v6.0.0 / v18-migration branch (sync/v16-migration-version18): re-pointed to
 * `STAKE_POOL_SIZE_V4` (408). This branch is the SDK for AFTER the
 * coordinated F-01 re-seed (see PortfolioAccountV16 9347->9563 above, bumped
 * unconditionally in the same commit for the same reason) — by the time this
 * major version is actually published and used, every pool will have been
 * recreated fresh by the v4-only stake program (`percolator-stake` main,
 * `CURRENT_VERSION = 4` unconditionally — there is no code path left to
 * create a v3/392 pool), so there will be no 392-byte pool left to match. The
 * wrapper's own KEEP_LIST already pins `STAKE_POOL_LEN = 408` /
 * `STAKE_POOL_VERSION = 4` (v16_program.rs), so this alias now agrees with
 * what its own CPI counterpart expects.
 *
 * `main` (the currently-published, pre-re-seed SDK) INTENTIONALLY keeps this
 * alias at `STAKE_POOL_SIZE_V3` (392) instead — see `6f00f5f`. That decision
 * is still correct there: `main` talks to the REAL, currently-addressable
 * pools, which — as of that commit — were all still 392 bytes on-chain
 * (existing account DATA isn't resized by a program code upgrade; only a
 * fresh re-seed recreates pools at their new size). Do not backport this
 * flip to `main` without re-checking that devnet has actually re-seeded.
 *
 * `decodeStakePool` accepting v4 was always a strict superset (widens what
 * decodes, changes no existing pool's meaning) — only this alias, used by
 * consumers as an EXACT `getProgramAccounts({ dataSize })` filter and as a
 * `data.length < SIZE` gate, needed the version-specific pin.
 *
 * Prefer the explicit `STAKE_POOL_SIZE_V{1,2,3,4}` constants in new code
 * when you need a specific layout version regardless of which one this
 * branch's alias currently points at.
 */
declare const STAKE_POOL_SIZE = 408;
declare const STAKE_POOL_DISCRIMINATOR: Uint8Array<ArrayBuffer>;
/**
 * Version byte of the StakePool layout this SDK targets — 4 on this
 * v18-migration branch (see `STAKE_POOL_SIZE` above for the full
 * `main`-vs-this-branch rationale; `main` stays pinned to 3).
 *
 * Matches `percolator-stake`'s own `CURRENT_VERSION` (4) and the wrapper's
 * `STAKE_POOL_VERSION` KEEP_LIST constant. `decodeStakePool` does not read
 * this constant — it derives the expected version from the buffer length —
 * so it is advisory only.
 */
declare const STAKE_POOL_CURRENT_VERSION = 4;
/**
 * Decode a StakePool account from raw data buffer.
 *
 * Supports v1 (352 bytes, no pending_admin, _reserved starts at 288), v2 (384
 * bytes, pending_admin at 288..320, _reserved starts at 320), and v3 (392
 * bytes, adds `total_recovered_from_wrapper: u64` at the struct tail,
 * offset 384..392 — outside `_reserved`, which stays at [320..384] in both
 * v2 and v3), and v4 (408 bytes, promoting the two #242 cooldown-timelock
 * fields out of `_reserved` into real struct fields at 392 and 400).
 * The layout version is detected from the data length before reading the
 * discriminator.
 *
 * v1/v2 support exists only to decode legacy pools created before the
 * coordinated protocol-fee + stake-lineage redeploy (v1) or before the H-1
 * re-review fix (v2) — see the `STAKE_POOL_SIZE_V1`/`STAKE_POOL_SIZE_V2` docs
 * for why the ADOPTED program never creates new v1/v2 pools going forward.
 * See the `StakePoolState` interface doc for the HWM / cooldown-timelock
 * byte-aliasing bug (a real on-chain `_reserved` layout collision, not an SDK
 * bug) that this decoder faithfully surfaces on v3-and-earlier pools and that
 * v4 fixes — which is why the two cooldown reads below are version-gated.
 *
 * Uses DataView for all u64/u16 reads — browser-safe.
 */
declare function decodeStakePool(data: Uint8Array): StakePoolState;
/** Size of StakeDeposit on-chain (bytes). */
declare const STAKE_DEPOSIT_SIZE = 152;
declare const STAKE_DEPOSIT_DISCRIMINATOR: Uint8Array<ArrayBuffer>;
/** Decoded StakeDeposit PDA state. */
interface StakeDepositState {
    isInitialized: boolean;
    bump: number;
    pool: PublicKey;
    user: PublicKey;
    lastDepositSlot: bigint;
    lpAmount: bigint;
}
/**
 * Decode a StakeDeposit PDA account from raw data.
 *
 * On-chain layout (152 bytes, percolator-stake/src/state.rs):
 *   [0]       is_initialized  u8
 *   [1]       bump            u8
 *   [2..8]    _padding
 *   [8..40]   pool            [u8; 32]
 *   [40..72]  user            [u8; 32]
 *   [72..80]  last_deposit_slot u64
 *   [80..88]  lp_amount       u64
 *   [88..152] _reserved
 */
declare function decodeDepositPda(data: Uint8Array): StakeDepositState;
interface StakeAccounts {
    /** InitPool accounts */
    initPool: {
        admin: PublicKey;
        slab: PublicKey;
        pool: PublicKey;
        lpMint: PublicKey;
        vault: PublicKey;
        vaultAuth: PublicKey;
        collateralMint: PublicKey;
        percolatorProgram: PublicKey;
    };
    /** Deposit accounts */
    deposit: {
        user: PublicKey;
        pool: PublicKey;
        userCollateralAta: PublicKey;
        vault: PublicKey;
        lpMint: PublicKey;
        userLpAta: PublicKey;
        vaultAuth: PublicKey;
        depositPda: PublicKey;
        /**
         * The pool's wrapper market (`pool.slab`, i.e. `decodeStakePool(...).slab`).
         * percolator-stake #290 (v18.2): REQUIRED for a mode-0 pool (every
         * `InitPool` pool) — the program reads the wrapper's tag-87 payout counter
         * from it before pricing LP and fails with `NotEnoughAccountKeys` without
         * it. Sent at account index 11. v18.1 stake ignores the extra trailing account.
         */
        slab: PublicKey;
    };
    /** Withdraw accounts */
    withdraw: {
        user: PublicKey;
        pool: PublicKey;
        userLpAta: PublicKey;
        lpMint: PublicKey;
        vault: PublicKey;
        userCollateralAta: PublicKey;
        vaultAuth: PublicKey;
        depositPda: PublicKey;
        /**
         * The pool's wrapper market (`pool.slab`). percolator-stake #290 (v18.2):
         * optional on-chain (index 10), but when absent a mode-0 withdrawal skips
         * the pending-fee accrual and redeems at the lower, not-yet-accrued price.
         * The SDK sends it whenever it is given. v18.1 stake ignores the extra trailing account.
         *
         * OMIT it (leave undefined) after the market has been retired by CloseSlab:
         * a CloseSlab tombstone at index 10 fails `InvalidAccount` (F-9 / #290).
         */
        slab?: PublicKey;
    };
    /** AccrueFees accounts (tag 12, permissionless) */
    accrueFees: {
        /** Any signer; the program only checks `is_signer`. */
        caller: PublicKey;
        pool: PublicKey;
        /** The pool's vault token account (`pool.vault`). */
        vault: PublicKey;
        /**
         * The pool's wrapper market (`pool.slab`). percolator-stake #290 (v18.2):
         * REQUIRED for mode 0 (index 4), ignored for mode 1.
         */
        slab: PublicKey;
    };
    /** FlushToInsurance accounts (CPI from stake → percolator) */
    flushToInsurance: {
        caller: PublicKey;
        pool: PublicKey;
        vault: PublicKey;
        vaultAuth: PublicKey;
        slab: PublicKey;
        wrapperVault: PublicKey;
        percolatorProgram: PublicKey;
    };
}
/**
 * Build account keys for InitPool instruction.
 * Returns array of {pubkey, isSigner, isWritable} in the order the program expects.
 *
 * @param a - Named accounts for the InitPool instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 */
declare function initPoolAccounts(a: StakeAccounts['initPool'], tokenProgramId?: PublicKey): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Build account keys for the Deposit (tag 1) and DepositJunior (tag 16)
 * instructions — both share one account shape.
 *
 * 12 accounts. Index 11 is the pool's wrapper market (`pool.slab`), added by
 * percolator-stake #290 (v18.2), which rejects a mode-0 deposit without it.
 * v18.1 stake reads only the first 11 and ignores the trailing account.
 *
 * @param a - Named accounts for the Deposit instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 * @returns Account metas in the order the program parses them.
 * @example
 * ```ts
 * const pool = decodeStakePool(poolInfo.data);
 * const keys = depositAccounts({ user, pool: poolPda, userCollateralAta, vault: pool.vault,
 *   lpMint: pool.lpMint, userLpAta, vaultAuth, depositPda, slab: pool.slab });
 * new TransactionInstruction({ programId, keys, data: encodeStakeDeposit(amount) });
 * ```
 */
declare function depositAccounts(a: StakeAccounts['deposit'], tokenProgramId?: PublicKey): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Build account keys for DepositJunior (tag 16). Identical to
 * {@link depositAccounts}: percolator-stake documents it as "same as Deposit,
 * including the #290 wrapper market at index 11".
 *
 * @param a - Named accounts (same shape as Deposit).
 * @param tokenProgramId - Token program to use. Defaults to SPL Token.
 * @returns Account metas in the order the program parses them.
 * @example
 * ```ts
 * const keys = depositJuniorAccounts({ ...depositArgs, slab: pool.slab });
 * new TransactionInstruction({ programId, keys, data: encodeStakeDepositJunior(amount) });
 * ```
 */
declare function depositJuniorAccounts(a: StakeAccounts['deposit'], tokenProgramId?: PublicKey): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Build account keys for Withdraw instruction.
 *
 * 11 accounts. Index 10 is the pool's wrapper market (`pool.slab`,
 * percolator-stake #290 / v18.2). It is optional on-chain, but without it a
 * mode-0 withdrawal skips the pending-fee accrual, so pass it whenever the market
 * is still live or resolved. After CloseSlab (the market is a tombstone) leave
 * `slab` undefined: 10 accounts, because a tombstone there fails `InvalidAccount`.
 * v18.1 stake ignores the trailing account.
 *
 * @param a - Named accounts for the Withdraw instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 * @returns Account metas in the order the program parses them.
 * @example
 * ```ts
 * const keys = withdrawAccounts({ user, pool: poolPda, userLpAta, lpMint: pool.lpMint,
 *   vault: pool.vault, userCollateralAta, vaultAuth, depositPda, slab: pool.slab });
 * ```
 */
declare function withdrawAccounts(a: StakeAccounts['withdraw'], tokenProgramId?: PublicKey): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Build account keys for AccrueFees (tag 12, permissionless).
 *
 * 5 accounts: [caller(signer), pool(writable), vault, clock, slab]. Index 4 is
 * the pool's wrapper market (`pool.slab`), REQUIRED for a mode-0 pool by
 * percolator-stake #290 (v18.2): a mode-0 pool books vault surplus only up to
 * the wrapper's not-yet-booked tag-87 payouts, read from that account. v18.1
 * stake reads only the first 4 and ignores it.
 *
 * @param a - Named accounts for the AccrueFees instruction.
 * @returns Account metas in the order the program parses them.
 * @example
 * ```ts
 * const pool = decodeStakePool(poolInfo.data);
 * const keys = accrueFeesAccounts({ caller: payer.publicKey, pool: poolPda,
 *   vault: pool.vault, slab: pool.slab });
 * new TransactionInstruction({ programId, keys, data: encodeStakeAccrueFees() });
 * ```
 */
declare function accrueFeesAccounts(a: StakeAccounts['accrueFees']): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Build account keys for FlushToInsurance instruction.
 *
 * @param a - Named accounts for the FlushToInsurance instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 */
declare function flushToInsuranceAccounts(a: StakeAccounts['flushToInsurance'], tokenProgramId?: PublicKey): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Tag 29: RecoverTerminalInsurance. Wire: `[29][amount u64 LE]` (9 bytes).
 *
 * @param amount  Atoms to pull through wrapper tag 41 (<= the tag-41 terminal
 *   capacity for `vault_auth`); 0 = book/sweep only.
 * @returns 9-byte instruction data.
 * @example
 * ```ts
 * const data = encodeStakeRecoverTerminalInsurance(5_000_000n);
 * ```
 */
declare function encodeStakeRecoverTerminalInsurance(amount: bigint | number): Uint8Array;
/**
 * Tag 30: AdminCloseSlab. Wire: `[30]` (1 byte).
 *
 * @returns 1-byte instruction data.
 * @example
 * ```ts
 * const data = encodeStakeAdminCloseSlab();
 * ```
 */
declare function encodeStakeAdminCloseSlab(): Uint8Array;
/** Account inputs for RecoverTerminalInsurance (tag 29). */
interface RecoverTerminalInsuranceAccounts {
    /** Any key — no signer check (permissionless). */
    caller: PublicKey;
    /** Stake pool PDA `["stake_pool", slab]` (writable). */
    pool: PublicKey;
    /** `pool.vault` — the ONLY destination (writable). */
    poolVault: PublicKey;
    /** `["vault_auth", pool]` — the asset-0 insurance_authority; signs the tag-41 CPI. */
    vaultAuth: PublicKey;
    /** `pool.slab` — the wrapper market (writable). */
    market: PublicKey;
    /** Wrapper vault: canonical ATA of the wrapper `["vault", market]` PDA (writable, source). */
    wrapperVault: PublicKey;
    /** Wrapper vault authority PDA `["vault", market]`. */
    wrapperVaultAuthority: PublicKey;
    /** `pool.percolator_program`. */
    wrapperProgram: PublicKey;
    /** OPTIONAL stray token account to sweep (pool mint, owner `vault_auth`, not `pool.vault`). */
    stray?: PublicKey;
    /** Token program (default SPL Token). */
    tokenProgram?: PublicKey;
}
/**
 * Account keys for RecoverTerminalInsurance (tag 29) — d13b5a9 (unchanged since f9b9190)
 * `process_recover_terminal_insurance`: 9 accounts, 10 with the optional stray.
 *   [0] caller (no signer) · [1] pool (w) · [2] pool vault (w) · [3] vault_auth ·
 *   [4] wrapper market (w) · [5] wrapper vault (w) · [6] wrapper vault authority ·
 *   [7] token program · [8] wrapper program · [9] stray (w, optional)
 *
 * @param a  Named accounts.
 * @returns Account metas in program order.
 * @example
 * ```ts
 * const keys = recoverTerminalInsuranceAccounts({ caller, pool, poolVault, vaultAuth, market,
 *   wrapperVault, wrapperVaultAuthority, wrapperProgram });
 * ```
 */
declare function recoverTerminalInsuranceAccounts(a: RecoverTerminalInsuranceAccounts): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/** Account inputs for AdminCloseSlab (tag 30). */
interface AdminCloseSlabAccounts {
    /** `pool.admin` — signer, receives the rent refund. */
    admin: PublicKey;
    /** Stake pool PDA (the wrapper marketauth; signs the CloseSlab CPI). */
    pool: PublicKey;
    /** `pool.slab` — the wrapper market (writable). */
    market: PublicKey;
    /** Wrapper vault token account (writable). */
    wrapperVault: PublicKey;
    /** Wrapper vault authority PDA. */
    wrapperVaultAuthority: PublicKey;
    /** A token account of the pool mint OWNED BY THE POOL PDA (CloseSlab dest). The caller creates it first (e.g. the pool PDA's ATA). */
    poolDestToken: PublicKey;
    /** Collateral mint (writable; read by CloseSlab only when it burns residue). */
    collateralMint: PublicKey;
    /** `pool.vault` — the sweep destination (writable). */
    poolVault: PublicKey;
    /** `pool.percolator_program`. */
    wrapperProgram: PublicKey;
    /** Token program (default SPL Token). */
    tokenProgram?: PublicKey;
}
/**
 * Account keys for AdminCloseSlab (tag 30) — d13b5a9 (unchanged since f9b9190) `process_admin_close_slab`, 10 accounts:
 *   [0] admin (s, w) · [1] pool (w) · [2] market (w) · [3] wrapper vault (w) ·
 *   [4] wrapper vault authority · [5] pool-PDA-owned token account (w) · [6] token program ·
 *   [7] collateral mint (w) · [8] pool vault (w) · [9] wrapper program.
 * Secondary-collateral markets are not supported.
 *
 * @param a  Named accounts.
 * @returns Account metas in program order.
 * @example
 * ```ts
 * const keys = adminCloseSlabAccounts({ admin, pool, market, wrapperVault, wrapperVaultAuthority,
 *   poolDestToken, collateralMint, poolVault, wrapperProgram });
 * ```
 */
declare function adminCloseSlabAccounts(a: AdminCloseSlabAccounts): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];

/**
 * @module adl
 * Percolator ADL (Auto-Deleveraging) client utilities.
 *
 * PERC-8278 / PERC-8312 / PERC-305: ADL is triggered when `pnl_pos_tot > max_pnl_cap`
 * on a market (PnL cap exceeded) AND the insurance fund is fully depleted (balance == 0).
 * The most profitable positions on the dominant side are deleveraged first.
 *
 * **Note on caller permissions:** `ExecuteAdl` (tag 50) requires the caller to be the
 * market admin/keeper key (`header.admin`). It is NOT permissionless despite the
 * instruction being structurally available to any signer.
 *
 * API surface:
 *  - fetchAdlRankedPositions() — fetch slab + rank all open positions by PnL%
 *  - rankAdlPositions()        — pure (no-RPC) variant for already-fetched slab bytes
 *  - isAdlTriggered()          — check if slab's pnl_pos_tot exceeds max_pnl_cap
 *  - buildAdlInstruction()     — unsupported in v17; throws a clear error
 *  - buildAdlTransaction()     — unsupported in v17 when an ADL target exists
 *  - parseAdlEvent()           — decode AdlEvent from transaction log lines
 *  - fetchAdlRankings()        — call /api/adl/rankings HTTP endpoint
 *  - AdlRankedPosition         — position record with adl_rank and computed pnlPct
 *  - AdlRankingResult          — full ranking with trigger status
 *  - AdlEvent                  — decoded on-chain AdlEvent log entry (tag 0xAD1E_0001)
 *  - AdlApiRanking             — single ranked position from /api/adl/rankings
 *  - AdlApiResult              — full result from /api/adl/rankings
 *  - AdlSide                   — "long" | "short"
 */

/** Position side derived from positionSize sign. */
type AdlSide = "long" | "short";
/**
 * A ranked open position for ADL purposes.
 * Positions are ranked descending by `pnlPct` — rank 0 is the most profitable
 * and will be deleveraged first.
 */
interface AdlRankedPosition {
    /** Account index in the slab (used as `targetIdx` in ExecuteAdl). */
    idx: number;
    /** Owner public key. */
    owner: PublicKey;
    /** Raw position size (i128 — negative = short, positive = long). */
    positionSize: bigint;
    /** Realised + mark-to-market PnL in lamports (i128 from slab). */
    pnl: bigint;
    /** Capital at entry in lamports (u128). */
    capital: bigint;
    /**
     * PnL as a fraction of capital, expressed as basis points (scaled × 10_000).
     * pnlPct = pnl * 10_000 / capital.
     * Higher = more profitable = deleveraged first.
     */
    pnlPct: bigint;
    /** Long or short. */
    side: AdlSide;
    /**
     * ADL rank among positions on the same side (0 = highest PnL%, deleveraged first).
     * `-1` if position size is zero (inactive).
     */
    adlRank: number;
}
/**
 * Result of `fetchAdlRankedPositions`.
 */
interface AdlRankingResult {
    /** All open (non-zero) user positions, sorted descending by PnLPct, ranked. */
    ranked: AdlRankedPosition[];
    /**
     * Longs ranked separately (adlRank within this subset).
     * Rank 0 = most profitable long = first to be deleveraged on a net-long market.
     */
    longs: AdlRankedPosition[];
    /**
     * Shorts ranked separately (adlRank within this subset).
     * Rank 0 = most profitable short (most negative pnlPct magnitude — i.e., highest
     * unrealised gain for the short-side holder).
     */
    shorts: AdlRankedPosition[];
    /** Whether ADL is currently triggered (pnlPosTot > maxPnlCap). */
    isTriggered: boolean;
    /** pnl_pos_tot from engine state. */
    pnlPosTot: bigint;
    /** max_pnl_cap from market config. */
    maxPnlCap: bigint;
    /**
     * The side with greater net open interest (engine.longOi vs engine.shortOi).
     *
     * `null` when the side cannot be determined — either engine state could not be
     * parsed at all, OR the detected slab layout carries no open-interest fields.
     * V0, V2 and v12.15 layouts set engineLongOiOff/engineShortOiOff to -1, and
     * parseEngine SUCCEEDS on those returning longOi = shortOi = 0n, so a naive
     * `shortOi > longOi` comparison would silently report "long" for a slab that
     * has no OI data at all. Callers must treat `null` as "unknown", not "long".
     *
     * Ties (equal, non-absent OI) resolve to "long". That is this SDK's own
     * convention, not an on-chain guarantee — the deployed wrapper
     * percolator-prog@19d5d932 emits no target_side log and exposes no tie rule.
     */
    dominantSide: AdlSide | null;
}
/**
 * Check whether ADL is currently triggered on a slab.
 *
 * ADL triggers when pnl_pos_tot > max_pnl_cap (max_pnl_cap must be > 0).
 *
 * @param slabData - Raw slab account bytes.
 * @returns true if ADL is triggered.
 *
 * @example
 * ```ts
 * const data = await fetchSlab(connection, slabKey);
 * if (isAdlTriggered(data)) {
 *   const ranking = await fetchAdlRankedPositions(connection, slabKey);
 * }
 * ```
 */
declare function isAdlTriggered(slabData: Uint8Array): boolean;
/**
 * Fetch a slab and rank all open user positions by PnL% for ADL targeting.
 *
 * Positions are ranked separately per side:
 * - Longs: rank 0 = highest positive PnL% (most profitable long)
 * - Shorts: rank 0 = highest negative PnL% by abs value (most profitable short)
 *
 * Rank ordering matches the on-chain ADL engine in percolator-prog (PERC-8273):
 * the position at rank 0 of the dominant side is deleveraged first.
 *
 * @param connection - Solana connection.
 * @param slab       - Slab (market) public key.
 * @returns AdlRankingResult with ranked longs, ranked shorts, and trigger status.
 *
 * @example
 * ```ts
 * const { ranked, longs, isTriggered } = await fetchAdlRankedPositions(connection, slabKey);
 * if (isTriggered && longs.length > 0) {
 *   const target = longs[0]; // highest PnL long
 *   const ix = buildAdlInstruction(caller, slabKey, oracleKey, programId, target.idx);
 * }
 * ```
 */
declare function fetchAdlRankedPositions(connection: Connection, slab: PublicKey): Promise<AdlRankingResult>;
/**
 * Pure (no-RPC) variant — rank positions from already-fetched slab bytes.
 * Useful when you already have the slab data (e.g., from a subscription).
 */
declare function rankAdlPositions(slabData: Uint8Array): AdlRankingResult;
/**
 * Unsupported in v17: `ExecuteAdl` transaction building is not available in
 * the v17 wrapper path. The ranking, trigger-check, HTTP API, and event parser
 * utilities remain available.
 *
 * This function is kept as a deprecated compatibility stub so consumers get a
 * deterministic error instead of a lower-level removed-instruction throw.
 *
 * @param caller     - Signer — must be the market keeper/admin authority.
 * @param slab       - Slab (market) public key.
 * @param oracle     - Primary oracle public key for this market.
 * @param programId  - Percolator program ID.
 * @param targetIdx  - Account index to deleverage (from `AdlRankedPosition.idx`).
 * @param backupOracles - Optional additional oracle accounts (non-Hyperp markets).
 * @deprecated ExecuteAdl transaction building is not supported in the v17 SDK.
 */
declare function buildAdlInstruction(_caller: PublicKey, _slab: PublicKey, _oracle: PublicKey, _programId: PublicKey, targetIdx: number, _backupOracles?: PublicKey[]): TransactionInstruction;
/**
 * Choose which ranked position an ADL should target.
 *
 * Exported so the selection rule can be tested directly: `buildAdlTransaction`
 * needs a live Connection and, on v17, cannot complete anyway (see its note), so
 * a test routed through it could not observe the choice.
 *
 * - An explicit `preferSide` always wins.
 * - Otherwise the dominant side's top-ranked position. NOTE this is an SDK
 *   heuristic, not an on-chain rule: the engine pinned to the deployed wrapper
 *   (percolator@f53be74a) contains no long-vs-short OI comparison and no notion
 *   of a "dominant side" at all. It is a reasonable default for a client picking
 *   a candidate, nothing more.
 * - When `dominantSide` is null (engine unparseable, or a layout with no OI
 *   fields such as V0/V2/v12.15) fall back to the overall top-ranked position
 *   rather than guessing a side.
 */
declare function selectAdlTarget(ranking: Pick<AdlRankingResult, "longs" | "shorts" | "ranked" | "dominantSide">, preferSide?: AdlSide): AdlRankedPosition | undefined;
/**
 * Convenience builder: fetch slab, rank positions, pick the highest-ranked
 * target on the given side, and return a ready-to-send `TransactionInstruction`.
 *
 * Returns `null` when ADL is not triggered or no eligible positions exist.
 *
 * NOTE (v17): this cannot produce a usable transaction on the deployed program.
 * When a target IS found it calls `buildAdlInstruction`, which throws
 * V17_ADL_UNSUPPORTED_MESSAGE — the deployed wrapper percolator-prog@19d5d932 has
 * no ExecuteAdl handler. (This module never calls `encodeExecuteAdl`; an earlier
 * revision of this note claimed it did, which was simply wrong.) It is kept for
 * v12 slabs and for when an equivalent v17 instruction lands; the target
 * selection in `selectAdlTarget` stays valid either way.
 *
 * @param connection    - Solana connection.
 * @param caller        - Signer — must be the market keeper/admin authority.
 * @param slab          - Slab (market) public key.
 * @param oracle        - Primary oracle public key.
 * @param programId     - Percolator program ID.
 * @param preferSide    - Optional: target "long" or "short" side only.
 *                        If omitted, picks the dominant side's (greater net OI)
 *                        top-ranked position — or the overall top-ranked position
 *                        when dominantSide is null (engine unparseable, or a
 *                        layout with no OI fields such as V0/V2/v12.15).
 * @param backupOracles - Optional extra oracle accounts.
 *
 * @example
 * ```ts
 * const ix = await buildAdlTransaction(
 *   connection, caller.publicKey, slabKey, oracleKey, PROGRAM_ID
 * );
 * if (ix) {
 *   await sendAndConfirmTransaction(connection, new Transaction().add(ix), [caller]);
 * }
 * ```
 */
declare function buildAdlTransaction(connection: Connection, caller: PublicKey, slab: PublicKey, oracle: PublicKey, programId: PublicKey, preferSide?: AdlSide, backupOracles?: PublicKey[]): Promise<TransactionInstruction | null>;
/**
 * Decoded on-chain AdlEvent emitted by the `ExecuteAdl` instruction handler.
 *
 * The on-chain handler emits via `sol_log_64(0xAD1E_0001, target_idx, price, closed_lo, closed_hi)`.
 * `sol_log_64` prints 5 decimal u64 values separated by spaces on a single "Program log:" line.
 *
 * Fields:
 * - `tag`       — always `0xAD1E_0001` (2970353665n)
 * - `targetIdx` — slab account index that was deleveraged
 * - `price`     — oracle price used (in market price units, e.g. e6)
 * - `closedAbs` — absolute size of the position closed (i128, reassembled from lo+hi u64 parts)
 *
 * @example
 * ```ts
 * const logs = tx.meta?.logMessages ?? [];
 * const event = parseAdlEvent(logs);
 * if (event) {
 *   console.log("ADL closed position", event.targetIdx, "size", event.closedAbs);
 * }
 * ```
 */
interface AdlEvent {
    /** Tag discriminator — always 0xAD1E_0001n (2970353665). */
    tag: bigint;
    /** Slab account index that was deleveraged. */
    targetIdx: number;
    /** Oracle price used for the deleverage (market-native units, e.g. lamports/e6). */
    price: bigint;
    /**
     * Absolute position size closed (reassembled from lo+hi u64).
     * This is the i128 absolute value — always non-negative.
     */
    closedAbs: bigint;
}
/**
 * Parse the AdlEvent from a transaction's log messages.
 *
 * Searches for a "Program log: <a> <b> <c> <d> <e>" line where the first
 * decimal value equals `0xAD1E_0001` (2970353665). Returns `null` if not found.
 *
 * @param logs - Array of log message strings (from `tx.meta.logMessages`).
 * @param percolatorProgramId - When supplied, only ADL events emitted directly
 *   by this program ID are accepted. Events from CPI-called programs (which can
 *   produce identical `Program log:` lines) are silently ignored. Pass the
 *   program ID used to send the transaction (e.g. `getProgramId().toBase58()`).
 *   Omit only in contexts where the full log has already been filtered.
 * @returns Decoded `AdlEvent` or `null` if the log is not present.
 *
 * @example
 * ```ts
 * const event = parseAdlEvent(tx.meta?.logMessages ?? [], getProgramId().toBase58());
 * if (event) {
 *   console.log(`ADL: idx=${event.targetIdx} price=${event.price} closed=${event.closedAbs}`);
 * }
 * ```
 */
declare function parseAdlEvent(logs: string[], percolatorProgramId?: string): AdlEvent | null;
/**
 * A single ranked position as returned by the /api/adl/rankings endpoint.
 */
interface AdlApiRanking {
    /** 1-based rank (1 = highest PnL%, first to be deleveraged). */
    rank: number;
    /** Slab account index. Pass as `targetIdx` to `buildAdlInstruction`. */
    idx: number;
    /** Absolute PnL (lamports) as a decimal string. */
    pnlAbs: string;
    /** Capital at entry (lamports) as a decimal string. */
    capital: string;
    /** PnL as millionths of capital (pnl * 1_000_000 / capital). */
    pnlPctMillionths: string;
}
/**
 * Full result from the /api/adl/rankings endpoint.
 */
interface AdlApiResult {
    slabAddress: string;
    /** pnl_pos_tot from slab engine state (decimal string). */
    pnlPosTot: string;
    /** max_pnl_cap from market config (decimal string, "0" if unconfigured). */
    maxPnlCap: string;
    /** Insurance fund balance (decimal string). */
    insuranceFundBalance: string;
    /** Insurance fund lifetime fee revenue (decimal string). */
    insuranceFundFeeRevenue: string;
    /** Insurance utilization in basis points (0–10000). */
    insuranceUtilizationBps: number;
    /** true if pnlPosTot > maxPnlCap. */
    capExceeded: boolean;
    /** true if insurance fund is fully depleted (balance == 0). */
    insuranceDepleted: boolean;
    /** true if utilization BPS exceeds the configured ADL threshold. */
    utilizationTriggered: boolean;
    /** true if ADL is needed (capExceeded or utilizationTriggered). */
    adlNeeded: boolean;
    /** Excess PnL above cap (decimal string). */
    excess: string;
    /** Ranked positions (empty if adlNeeded=false). */
    rankings: AdlApiRanking[];
}
/**
 * Fetch ADL rankings from the Percolator API.
 *
 * Calls `GET <apiBase>/api/adl/rankings?slab=<address>` and returns the
 * parsed result. Use this from the frontend or keeper to determine ADL
 * trigger status and pick the target index.
 *
 * @param apiBase  - Base URL of the Percolator API (e.g. `https://api.percolator.io`).
 * @param slab     - Slab (market) public key or base58 address string.
 * @param fetchFn  - Optional custom fetch implementation (defaults to global `fetch`).
 * @returns Parsed `AdlApiResult`.
 * @throws On HTTP error or JSON parse failure.
 *
 * @example
 * ```ts
 * const result = await fetchAdlRankings("https://api.percolator.io", slabKey);
 * if (result.adlNeeded && result.rankings.length > 0) {
 *   const target = result.rankings[0]; // rank 1 = highest PnL%
 *   const ix = buildAdlInstruction(caller, slabKey, oracleKey, PROGRAM_ID, target.idx);
 * }
 * ```
 */
declare function fetchAdlRankings(apiBase: string, slab: PublicKey | string, fetchFn?: typeof fetch): Promise<AdlApiResult>;

/**
 * @module backing-bucket
 * v17 source-domain backing-bucket state: the read path behind `ExpireBackingBucket` (tag 89).
 *
 * ## Why this module exists
 *
 * The SDK could already *encode* tag 89 but had no way to tell whether a bucket had
 * actually lapsed. A keeper with an encoder and no detector has two bad options: crank
 * every domain every cycle (paying for a guaranteed revert on every healthy domain), or
 * never crank at all (leaving lapsed domains bricked). This module supplies the missing
 * predicate.
 *
 * ## Why lapsing is routine, not exceptional
 *
 * A bucket's `expiry_slot` is fixed when the bucket opens and is **never extended while
 * it stays `Fresh`** — the engine's `fresh_counterparty_backing_expiry_slot`
 * (`percolator/src/v16.rs:6303-6310`) returns the stored value unchanged on a live
 * bucket and only computes a fresh horizon once the bucket is no longer
 * `Fresh`-and-unexpired. **Every backed market therefore lapses eventually.** Seeding a
 * far-future expiry defers the lapse; it does not prevent it.
 *
 * Once lapsed, the domain is a dead end in every direction until tag 89 runs:
 *
 * | Attempt against a lapsed domain | Result |
 * |---|---|
 * | settle a **loss** | `EngineLockActive` Custom(21) |
 * | settle a **gain** | `EngineStale` Custom(19) |
 * | `TopUpBackingBucket` (tag 24) to re-fund it | `EngineLockActive` Custom(21) |
 *
 * The gain path is `validate_source_domain_ledger_current` (`v16.rs:6294-6301`), which
 * returns `Stale` for exactly `status == Fresh && expiry_slot <= current_slot`. It cannot
 * even be paid to come back. Scanning for lapsed domains and expiring them is a standing
 * keeper duty, alongside the fee crank.
 *
 * ## Layout provenance
 *
 * Every offset below was produced by `offset_of!` against the engine's own `#[repr(C)]`
 * account structs (`percolator/src/v16.rs`), not inferred from field order:
 *
 * ```
 * EngineAssetSlotV16Account size=1285   backing_long @ 947   backing_short @ 1044
 * BackingBucketV16Account   size=97
 *     0 market_id            8 fresh_unliened_backing_num   24 valid_liened_backing_num
 *    40 consumed_liened...  56 impaired_liened...           72 utilization_fee_earnings
 *    88 expiry_slot         96 status
 * MarketGroupV16HeaderAccount  config @ 32   current_slot @ 613   mode @ 626
 * V16ConfigAccount             max_portfolio_assets @ 0   max_market_slots @ 2
 * ```
 *
 * Every `V16Pod*` field is an align-1 `[u8; N]` and every struct derives `bytemuck::Pod`
 * (which forbids implicit padding), so these are byte offsets with no alignment gaps.
 *
 * ## v18 update (v16-migration, integration `sync/integration-v16`@a9318945)
 *
 * Re-verified via `cargo run --example dump_layout` against the integration
 * branch's pinned engine (`~/percolator` @ c141d47f):
 *
 * ```
 * EngineAssetSlotV16Account size=1301   backing_long @ 963   backing_short @ 1060
 * ```
 *
 * `BackingBucketV16Account` itself is UNCHANGED (still 97 bytes, same field
 * offsets — re-verified against `~/percolator/src/v16.rs:7294`). The wrapper
 * slot preceding `EngineAssetSlotV16Account` grew 512 -> 1024
 * ({@link V17_ASSET_SLOT_WRAPPER_LEN}, see `slab.ts`'s
 * `V17_ASSET_ORACLE_WRAPPER_LEN`), and `EngineAssetSlotV16Account` itself
 * independently grew 1285 -> 1301 (+16 — the SAME undocumented extra
 * `AssetStateV16Account` field `slab.ts`'s `V17_ASSET_STATE_OI_LONG_REL`
 * doc comment flags), so `backing_long`/`backing_short`'s offsets relative
 * to the engine-slot start both shift +16 (947 -> 963, 1044 -> 1060).
 */
/** `MarketGroupV16HeaderAccount::config` (V16ConfigAccount), relative to the group header. */
declare const V17_GROUP_CONFIG_REL = 32;
/** `MarketGroupV16HeaderAccount::current_slot` (u64), relative to the group header. */
declare const V17_GROUP_CURRENT_SLOT_REL = 613;
/** `MarketGroupV16HeaderAccount::mode` (u8), relative to the group header. 0=Live, 1=Resolved, 2=Recovery. */
declare const V17_GROUP_MODE_REL = 626;
/** `V16ConfigAccount::max_market_slots` (u32), relative to the config block. */
declare const V17_CONFIG_MAX_MARKET_SLOTS_REL = 2;
/**
 * The wrapper oracle-storage prefix that precedes `EngineAssetSlotV16Account`
 * in `Market<T>`. v18 (integration `a9318945`): grew 512 -> 1024 — see this
 * module's own doc comment and `slab.ts`'s `V17_ASSET_ORACLE_WRAPPER_LEN`.
 */
declare const V17_ASSET_SLOT_WRAPPER_LEN = 1024;
/** `EngineAssetSlotV16Account::backing_long`, relative to the engine slot start. v18: 947 -> 963 (see module doc comment). */
declare const V17_ENGINE_BACKING_LONG_REL = 963;
/** `EngineAssetSlotV16Account::backing_short`, relative to the engine slot start. v18: 1044 -> 1060 (see module doc comment). */
declare const V17_ENGINE_BACKING_SHORT_REL = 1060;
/** `size_of::<BackingBucketV16Account>()`. */
declare const V17_BACKING_BUCKET_LEN = 97;
/** Market mode discriminant (`MarketGroupV16HeaderAccount::mode`). */
declare const V17_MARKET_MODE_LIVE = 0;
/**
 * `BackingBucketStatusV16` (`percolator/src/v16.rs:1674-1679`), a fieldless Rust enum
 * serialized as a single `u8` in declaration order.
 *
 * Only `Fresh` is expirable — see {@link isBackingBucketExpirable}.
 */
declare enum BackingBucketStatus {
    Empty = 0,
    Fresh = 1,
    Expired = 2,
    Impaired = 3
}
/** Human-readable name for a {@link BackingBucketStatus}, or `Unknown(n)` for an unmapped byte. */
declare function backingBucketStatusName(status: number): string;
/** One source-domain backing bucket, decoded from a v17 market account. */
interface BackingBucketV17 {
    /** Domain index. `domain = assetIndex * 2 + (side === "short" ? 1 : 0)`. */
    domain: number;
    /** `domain / 2` — the asset slot this domain belongs to. */
    assetIndex: number;
    /** `domain % 2` — even domains are LONG, odd domains are SHORT. */
    side: "long" | "short";
    /** `BackingBucketV16Account::market_id`. */
    marketId: bigint;
    /** Principal that is reserved but carries no lien. Forfeited to the junior pool on expiry. */
    freshUnlienedBackingNum: bigint;
    /** Principal under a live lien. Moves to `impairedLienedBackingNum` on expiry. */
    validLienedBackingNum: bigint;
    /** Principal already consumed by settlement. */
    consumedLienedBackingNum: bigint;
    /** Principal whose lien has been impaired. */
    impairedLienedBackingNum: bigint;
    /** Utilization fees accrued to this bucket. */
    utilizationFeeEarnings: bigint;
    /** Slot at which a `Fresh` bucket lapses. Fixed when the bucket opens; never extended. */
    expirySlot: bigint;
    /** Raw status byte. */
    status: number;
    /** `backingBucketStatusName(status)`. */
    statusName: string;
    /**
     * `status === Fresh && nowSlot >= expirySlot`.
     *
     * This is the *deadlock* condition — settlement against this domain fails in both
     * directions. It is necessary but NOT sufficient for tag 89; see {@link expirable},
     * which additionally applies the wrapper's mode and domain-bound gates.
     */
    lapsed: boolean;
    /**
     * `true` iff `ExpireBackingBucket` (tag 89) will be ACCEPTED for this domain right now.
     * See {@link isBackingBucketExpirable} for the full derivation.
     */
    expirable: boolean;
}
/** Whole-market backing-bucket snapshot, as returned by {@link parseBackingBucketsV17}. */
interface BackingBucketMarketState {
    /** `header.mode` — 0 Live, 1 Resolved, 2 Recovery. Tag 89 requires 0. */
    mode: number;
    /** `header.current_slot` — the engine's own monotone slot counter. */
    headerCurrentSlot: bigint;
    /**
     * `max(chainSlot, header.current_slot)` — the slot the program itself will use.
     * Mirrors `authenticated_market_slot_or_fallback_view` (`v16_program.rs:6332-6339`).
     */
    nowSlot: bigint;
    /** `config.max_market_slots` — the wrapper's domain bound is `max_market_slots * 2`. */
    maxMarketSlots: number;
    /** Asset slots physically present in the account buffer. */
    physicalAssetSlots: number;
    /**
     * `min(maxMarketSlots, physicalAssetSlots) * 2` — the number of domains that are BOTH
     * within the wrapper's declared bound and actually backed by bytes. Domains at or above
     * this index are never expirable; see {@link isBackingBucketExpirable}.
     */
    addressableDomainCount: number;
    /** One entry per addressable domain, ascending by `domain`. */
    buckets: BackingBucketV17[];
}
/** Context needed to evaluate the tag-89 acceptance predicate for a single bucket. */
interface BackingBucketExpiryContext {
    /** `header.mode`. */
    mode: number;
    /** `max(chainSlot, header.current_slot)`. */
    nowSlot: bigint;
    /** `min(config.max_market_slots, physicalAssetSlots) * 2`. */
    addressableDomainCount: number;
}
/**
 * Decide whether `ExpireBackingBucket` (tag 89) will be ACCEPTED for a domain.
 *
 * This predicate is the conjunction of every gate on the tag-89 path, read from the
 * program rather than from prose. In order of evaluation on chain:
 *
 * 1. **Live only.** `handle_expire_backing_bucket` (`v16_program.rs:10098-10100`):
 *    `if group.header.mode != 0 { return Err(EngineLockActive) }` → Custom(21). A resolved
 *    market reaches the same transition through the engine's own
 *    `realize_source_backed_claims_for_resolved_close_not_atomic` sweep.
 * 2. **Wrapper domain bound.** `v16_program.rs:10102-10105`:
 *    `if domain >= max_market_slots * 2 { return Err(InvalidInstruction) }` → Custom(9).
 * 3. **Engine domain bound.** `domain_asset_side` (`v16.rs:6043-6059`) rejects
 *    `domain >= configured_domain_count` and, separately, `asset_index >= markets.len()`
 *    → `InvalidLeg`. The second test is why `physicalAssetSlots` participates: a market
 *    may be *configured* for more slots than its account was *sized* for.
 * 4. **The lapse itself.** `expire_source_backing_bucket_not_atomic` (`v16.rs:6434-6440`):
 *    `if bucket.status != Fresh || now_slot < bucket.expiry_slot { return Err(Stale) }`
 *    → Custom(19). Note `>=`, not `>`: at exactly `nowSlot === expirySlot` the bucket is
 *    both deadlocked and expirable, and the two boundaries agree
 *    (`validate_source_domain_ledger_current` uses `expiry_slot <= current_slot`).
 *
 * `now_slot` is never caller-supplied — the program computes
 * `max(Clock::get().slot, header.current_slot)` itself
 * (`authenticated_market_slot_or_fallback_view`, `v16_program.rs:6332-6339`). Callers must
 * pass the same `max` in `ctx.nowSlot`. Using the chain slot alone is a **false negative**
 * whenever the engine counter runs ahead, and a false negative here means a domain stays
 * bricked. It cannot produce a false positive, because the program recomputes the same
 * `max` and no caller can lower it.
 *
 * **Not modelled:** the engine's `CounterUnderflow` arm (`v16.rs:6444-6449`), which fires
 * only if the domain's `SourceCreditState` has drifted below its own bucket's totals. That
 * is a broken-invariant state, not a reachable steady state, and gating on it would need
 * two more u128 reads to defend against something that indicates corruption anyway.
 *
 * @param bucket - A decoded bucket from {@link parseBackingBucketsV17}.
 * @param ctx    - Market-level gates: mode, resolved `nowSlot`, addressable domain count.
 * @returns `true` iff the program will accept tag 89 for `bucket.domain` right now.
 *
 * @example
 * ```ts
 * const state = parseBackingBucketsV17(marketData, { chainSlot: await conn.getSlot() });
 * for (const b of state.buckets) {
 *   if (isBackingBucketExpirable(b, state)) {
 *     await send(encodeExpireBackingBucket({ domain: b.domain }));
 *   }
 * }
 * ```
 */
declare function isBackingBucketExpirable(bucket: Pick<BackingBucketV17, "domain" | "status" | "expirySlot">, ctx: BackingBucketExpiryContext): boolean;
/** Options for {@link parseBackingBucketsV17}. */
interface ParseBackingBucketsOptions {
    /**
     * The current chain slot (`connection.getSlot()`).
     *
     * Omitting it is equivalent to the program's own fallback when `Clock::get()` fails:
     * `nowSlot` collapses to `header.current_slot`. That is safe (it can only under-report
     * lapses, never over-report them) but a keeper should always supply it — a market whose
     * `current_slot` lags produces false negatives, and a false negative leaves a domain
     * bricked.
     */
    chainSlot?: bigint | number;
}
/**
 * Decode every addressable source-domain backing bucket from a raw v17 market account.
 *
 * Reads `header.mode`, `header.current_slot` and `config.max_market_slots` once, then walks
 * the asset slots, emitting the LONG (`2i`) and SHORT (`2i+1`) bucket for each. Each bucket
 * carries both `lapsed` (the settlement deadlock condition) and `expirable` (whether tag 89
 * will actually be accepted) so a keeper never has to reconstruct the gates itself.
 *
 * @param data - Raw bytes of the v17 market group account.
 * @param opts - See {@link ParseBackingBucketsOptions}.
 * @returns The whole-market snapshot, including the resolved `nowSlot` used for the predicate.
 * @throws If the buffer is too short, or is not a v17 market account (bad magic/version/kind).
 *
 * @example
 * ```ts
 * const info = await connection.getAccountInfo(marketPk);
 * const state = parseBackingBucketsV17(new Uint8Array(info!.data), {
 *   chainSlot: await connection.getSlot(),
 * });
 * console.log(`${state.buckets.filter((b) => b.expirable).length} domain(s) need tag 89`);
 * ```
 */
declare function parseBackingBucketsV17(data: Uint8Array, opts?: ParseBackingBucketsOptions): BackingBucketMarketState;
/**
 * Convenience wrapper over {@link parseBackingBucketsV17}: the domains that need tag 89 now.
 *
 * Returns domain indices in ascending order, ready to feed straight into
 * `encodeExpireBackingBucket({ domain })`. Returns `[]` when there is nothing to do — the
 * common case on a healthy market, and the case in which a keeper must send nothing.
 *
 * @param data - Raw bytes of the v17 market group account.
 * @param opts - See {@link ParseBackingBucketsOptions}.
 * @returns Ascending list of expirable domain indices; empty when none are due.
 *
 * @example
 * ```ts
 * const domains = findExpirableBackingDomains(marketData, { chainSlot: slot });
 * for (const domain of domains) {
 *   tx.add(new TransactionInstruction({
 *     programId: WRAPPER_ID,
 *     keys: [{ pubkey: marketPk, isSigner: false, isWritable: true }],
 *     data: Buffer.from(encodeExpireBackingBucket({ domain })),
 *   }));
 * }
 * ```
 */
declare function findExpirableBackingDomains(data: Uint8Array, opts?: ParseBackingBucketsOptions): number[];

/**
 * Configuration for exponential-backoff retry on RPC calls.
 *
 * @example
 * ```ts
 * const retryConfig: RetryConfig = {
 *   maxRetries: 3,
 *   baseDelayMs: 500,
 *   maxDelayMs: 10_000,
 *   retryableStatusCodes: [429, 502, 503],
 * };
 * ```
 */
interface RetryConfig {
    /**
     * Maximum number of retry attempts after the initial request fails.
     * @default 3
     */
    maxRetries?: number;
    /**
     * Base delay in ms for exponential backoff.
     * Delay for attempt N is: `min(baseDelayMs * 2^N, maxDelayMs) + jitter`.
     * @default 500
     */
    baseDelayMs?: number;
    /**
     * Maximum delay in ms (backoff cap).
     * @default 10_000
     */
    maxDelayMs?: number;
    /**
     * Jitter factor (0–1). When non-zero, equal-jitter is applied: the computed
     * delay `raw` is split at its midpoint and a random value `[half, raw]` is
     * returned, bounding variance to 50 % of the backoff. Set to `0` to disable
     * jitter entirely (deterministic backoff).
     * @default 0.25
     */
    jitterFactor?: number;
    /**
     * HTTP status codes considered retryable.
     * Errors matching these codes (or containing their string representation)
     * will be retried.
     * @default [429, 502, 503, 504]
     */
    retryableStatusCodes?: number[];
}
/**
 * Configuration for a single RPC endpoint in the pool.
 *
 * @example
 * ```ts
 * const endpoint: RpcEndpointConfig = {
 *   url: "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
 *   weight: 10,
 *   label: "helius-primary",
 * };
 * ```
 */
interface RpcEndpointConfig {
    /** RPC endpoint URL. */
    url: string;
    /**
     * Relative weight for round-robin selection.
     * Higher weight = more requests routed here.
     * @default 1
     */
    weight?: number;
    /**
     * Human-readable label for logging / diagnostics.
     * @default url hostname
     */
    label?: string;
    /**
     * Extra `ConnectionConfig` options (commitment, confirmTransactionInitialTimeout, etc.)
     * merged into the Solana `Connection` constructor for this endpoint.
     */
    connectionConfig?: ConnectionConfig;
}
/**
 * Strategy for selecting the next RPC endpoint from the pool.
 *
 * - `"round-robin"` — weighted round-robin across healthy endpoints.
 * - `"failover"`    — use the first healthy endpoint; only advance on failure.
 */
type SelectionStrategy = "round-robin" | "failover";
/**
 * Full configuration for the RPC connection pool.
 *
 * @example
 * ```ts
 * import { RpcPool } from "@percolator/sdk";
 *
 * const pool = new RpcPool({
 *   endpoints: [
 *     { url: "https://mainnet.helius-rpc.com/?api-key=KEY", weight: 10, label: "helius" },
 *     { url: "https://api.mainnet-beta.solana.com", weight: 1, label: "public" },
 *   ],
 *   strategy: "failover",
 *   retry: { maxRetries: 3, baseDelayMs: 500 },
 *   requestTimeoutMs: 30_000,
 * });
 *
 * // Use like a Connection — same surface
 * const slot = await pool.call(conn => conn.getSlot());
 * ```
 */
interface RpcPoolConfig {
    /**
     * One or more RPC endpoints. At least one is required.
     * If a bare `string[]` is passed, each string is treated as `{ url: string }`.
     */
    endpoints: (RpcEndpointConfig | string)[];
    /**
     * How to pick the next endpoint.
     * @default "failover"
     */
    strategy?: SelectionStrategy;
    /**
     * Retry config applied to every `call()`.
     * Set to `false` to disable retries entirely.
     * @default { maxRetries: 3, baseDelayMs: 500 }
     */
    retry?: RetryConfig | false;
    /**
     * Per-request timeout in ms.  Applies an `AbortSignal` timeout to `Connection`
     * calls where supported, and is used as a deadline for the health probe.
     * @default 30_000
     */
    requestTimeoutMs?: number;
    /**
     * Default Solana commitment level for connections.
     * @default "confirmed"
     */
    commitment?: Commitment;
    /**
     * If true, `console.warn` diagnostic messages on retries, failovers, etc.
     * @default true
     */
    verbose?: boolean;
    /**
     * Time in ms after which a continuously unhealthy endpoint is automatically
     * restored to healthy so it can be retried. Set to 0 to disable time-based
     * recovery (the pool will still recover via `maybeRecoverEndpoints` when all
     * endpoints are exhausted).
     * @default 60_000
     */
    recoveryAfterMs?: number;
}
/**
 * Result of an RPC health probe.
 *
 * @example
 * ```ts
 * import { checkRpcHealth } from "@percolator/sdk";
 *
 * const health = await checkRpcHealth("https://api.mainnet-beta.solana.com");
 * console.log(`Slot: ${health.slot}, Latency: ${health.latencyMs}ms`);
 * if (!health.healthy) console.warn(`Unhealthy: ${health.error}`);
 * ```
 */
interface RpcHealthResult {
    /** The endpoint that was probed. */
    endpoint: string;
    /** Whether the probe succeeded (getSlot returned without error). */
    healthy: boolean;
    /** Round-trip latency in milliseconds (0 if unhealthy). */
    latencyMs: number;
    /** Current slot height (0 if unhealthy). */
    slot: number;
    /** Error message if the probe failed. */
    error?: string;
}
/**
 * Probe an RPC endpoint's health by calling `getSlot()` and measuring latency.
 *
 * @param endpoint  - RPC URL to probe
 * @param timeoutMs - Timeout in ms for the probe request (default: 5000)
 * @returns Health result with latency and slot height
 *
 * @example
 * ```ts
 * import { checkRpcHealth } from "@percolator/sdk";
 *
 * const result = await checkRpcHealth("https://api.mainnet-beta.solana.com", 3000);
 * if (result.healthy) {
 *   console.log(`Slot ${result.slot} — ${result.latencyMs}ms`);
 * } else {
 *   console.error(`RPC down: ${result.error}`);
 * }
 * ```
 */
declare function checkRpcHealth(endpoint: string, timeoutMs?: number): Promise<RpcHealthResult>;
/** Resolved defaults for RetryConfig. */
interface ResolvedRetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitterFactor: number;
    retryableStatusCodes: number[];
}
declare function resolveRetryConfig(cfg?: RetryConfig | false): ResolvedRetryConfig | null;
declare function normalizeEndpoint(ep: RpcEndpointConfig | string): RpcEndpointConfig;
declare function endpointLabel(ep: RpcEndpointConfig): string;
declare function isRetryable(err: unknown, codes: number[]): boolean;
declare function computeDelay(attempt: number, config: ResolvedRetryConfig): number;
/**
 * RPC connection pool with retry, failover, and round-robin support.
 *
 * Wraps one or more Solana RPC endpoints behind a single `call()` interface
 * that automatically retries transient errors and fails over to alternate
 * endpoints when one goes down.
 *
 * @example
 * ```ts
 * import { RpcPool } from "@percolator/sdk";
 *
 * const pool = new RpcPool({
 *   endpoints: [
 *     { url: "https://mainnet.helius-rpc.com/?api-key=KEY", weight: 10, label: "helius" },
 *     { url: "https://api.mainnet-beta.solana.com", weight: 1, label: "public" },
 *   ],
 *   strategy: "failover",
 *   retry: { maxRetries: 3 },
 *   requestTimeoutMs: 30_000,
 * });
 *
 * // Execute any Connection method through the pool
 * const slot = await pool.call(conn => conn.getSlot());
 *
 * // Or get a raw connection for one-off use
 * const conn = pool.getConnection();
 *
 * // Health check all endpoints
 * const results = await pool.healthCheck();
 * ```
 */
declare class RpcPool {
    private readonly endpoints;
    private readonly strategy;
    private readonly retryConfig;
    private readonly requestTimeoutMs;
    private readonly verbose;
    /** Time-based recovery window in ms (0 = disabled). */
    private readonly recoveryAfterMs;
    /** Round-robin index tracker. */
    private rrIndex;
    /** Consecutive failure threshold before marking an endpoint unhealthy. */
    private static readonly UNHEALTHY_THRESHOLD;
    /** Minimum endpoints before auto-recovery is attempted. */
    private static readonly MIN_HEALTHY;
    constructor(config: RpcPoolConfig);
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
    call<T>(fn: (connection: Connection) => Promise<T>): Promise<T>;
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
    getConnection(): Connection;
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
    healthCheck(timeoutMs?: number): Promise<RpcHealthResult[]>;
    /**
     * Get the number of endpoints in the pool.
     */
    get size(): number;
    /**
     * Get the number of currently healthy endpoints.
     */
    get healthyCount(): number;
    /**
     * Get endpoint labels and their current status.
     *
     * @returns Array of `{ label, url, healthy, failures, lastLatencyMs }`.
     */
    status(): Array<{
        label: string;
        url: string;
        healthy: boolean;
        failures: number;
        lastLatencyMs: number;
    }>;
    /**
     * Select the next endpoint based on strategy.
     * Returns -1 if no endpoint is available.
     */
    private selectEndpoint;
    /**
     * If all endpoints are unhealthy, reset them so we at least try again.
     */
    private maybeRecoverEndpoints;
}
/**
 * Execute an async function with exponential-backoff retry.
 *
 * Use this when you already have a `Connection` and just want retry logic
 * without a full pool.
 *
 * @param fn     - Async function to execute
 * @param config - Retry configuration (default: 3 retries, 500ms base delay)
 * @returns Result of `fn`
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```ts
 * import { withRetry } from "@percolator/sdk";
 * import { Connection } from "@solana/web3.js";
 *
 * const conn = new Connection("https://api.mainnet-beta.solana.com");
 * const slot = await withRetry(
 *   () => conn.getSlot(),
 *   { maxRetries: 3, baseDelayMs: 1000 },
 * );
 * ```
 */
declare function withRetry<T>(fn: () => Promise<T>, config?: RetryConfig): Promise<T>;
/** @internal — exposed for unit tests only */
declare const _internal: {
    readonly isRetryable: typeof isRetryable;
    readonly computeDelay: typeof computeDelay;
    readonly resolveRetryConfig: typeof resolveRetryConfig;
    readonly normalizeEndpoint: typeof normalizeEndpoint;
    readonly endpointLabel: typeof endpointLabel;
};

/**
 * Market lifecycle helpers (additive, SDK 8.0.0):
 *   - {@link buildRebalanceReduceIx} / {@link planReduceOnlyExit}: tag 44 RebalanceReduce,
 *     the owner-signed exit that works while a side is in the engine's ADL reduce-only state.
 *   - {@link planCloseSlabAttempt} / {@link isClosedMarketTombstone}: the safe CloseSlab
 *     retirement sequence (tag 84 → [tag 41] → tag 13).
 *
 * Wire + account orders verified against the deployed wrapper `6377376a`
 * (`src/v16_program.rs`: decode arms 13/41/44/84, `handle_close_slab`,
 * `handle_withdraw_insurance`, `handle_rebalance_reduce` → `with_one_portfolio_view`).
 *
 * @module market-lifecycle
 */

/**
 * RebalanceReduce (tag 44): 3 accounts, from `with_one_portfolio_view(owner_must_sign = true)`:
 *   [0] owner     signer (the portfolio owner)
 *   [1] market    writable
 *   [2] portfolio writable
 */
declare const ACCOUNTS_REBALANCE_REDUCE: readonly AccountSpec[];
/** Inputs for {@link buildRebalanceReduceIx}. */
interface RebalanceReduceIxArgs {
    programId: PublicKey;
    owner: PublicKey;
    market: PublicKey;
    portfolio: PublicKey;
    /** Live-read portfolio identity (PortfolioV17.portfolioId). */
    portfolioId: bigint;
    /** Live-read position epoch (PortfolioV17.matcherPositionEpoch). */
    positionEpoch: bigint;
    assetIndex: number;
    /** Quantity to reduce |position| by (u128, > 0). */
    reduceQ: bigint;
}
/**
 * Build a tag-44 RebalanceReduce instruction. The engine refuses `reduceQ == 0`
 * (InvalidInstruction) and, on a Live market, refuses once permissionless resolve
 * has matured (LockActive).
 *
 * @param a  Program id, accounts and CAS binding.
 * @returns TransactionInstruction signed by the portfolio owner.
 * @example
 * ```ts
 * const ix = buildRebalanceReduceIx({ programId, owner, market, portfolio, portfolioId, positionEpoch, assetIndex: 0, reduceQ });
 * ```
 */
declare function buildRebalanceReduceIx(a: RebalanceReduceIxArgs): TransactionInstruction;
/**
 * Plan a full reduce-only exit of one leg from the portfolio's raw bytes: reads the
 * live portfolioId / position epoch and the leg's |basisPosQ|, and returns the tag-44
 * instruction reducing it to zero. Returns null if there is no active leg on that asset.
 *
 * @param programId      Wrapper program id.
 * @param owner          Portfolio owner (signer).
 * @param market         Market account.
 * @param portfolio      Portfolio account.
 * @param portfolioData  Raw portfolio account bytes (fetched just before).
 * @param assetIndex     Asset to exit (default 0).
 * @returns `{ ix, reduceQ, side }` or null.
 * @example
 * ```ts
 * const plan = planReduceOnlyExit(WRAPPER, owner, market, portfolio, info.data, 0);
 * if (plan) await sendTx([plan.ix]);
 * ```
 */
declare function planReduceOnlyExit(programId: PublicKey, owner: PublicKey, market: PublicKey, portfolio: PublicKey, portfolioData: Uint8Array, assetIndex?: number): {
    ix: TransactionInstruction;
    reduceQ: bigint;
    side: "long" | "short";
} | null;
/** Header kind written by `write_closed_market_tombstone` (`KIND_CLOSED_MARKET`). */
declare const V17_KIND_CLOSED_MARKET = 8;
/**
 * True if a market account is a retired-market tombstone: CloseSlab shrinks the
 * account to the 16-byte header with kind {@link V17_KIND_CLOSED_MARKET} and keeps it
 * rent-exempt forever (anti address-reuse). A CloseSlab that returned Ok while the
 * account still has its full market layout did NOT retire it (windowed scan in progress
 * or budget re-credited) — retry with {@link planCloseSlabAttempt}.
 *
 * @param data  Raw market account bytes, or null if the account no longer exists.
 * @returns Whether the market is retired.
 * @example
 * ```ts
 * if (!isClosedMarketTombstone(info?.data ?? null)) { // retry }
 * ```
 */
declare function isClosedMarketTombstone(data: Uint8Array | null): boolean;
/** Inputs for one CloseSlab attempt. */
interface CloseSlabAttemptArgs {
    programId: PublicKey;
    market: PublicKey;
    /** Market collateral vault token account (owned by the vault-authority PDA). */
    vaultToken: PublicKey;
    /** CloseSlab signer (`dest`, must be the live marketauth) and its collateral ATA. */
    closer: PublicKey;
    closerDestToken: PublicKey;
    /** Live CAS value for tag 13 (asset-0 authority_epoch, current — not +1). */
    closeAuthorityEpoch: bigint;
    /**
     * Protocol leg (tag 84, amount 0 = all). Include whenever
     * protocol_fee_accrued − protocol_fee_withdrawn > 0 (tag 84 refuses when nothing is owed).
     * On P1, CloseSlab only retires if the protocol fee was claimed between attempts.
     */
    protocolFee?: {
        authority: PublicKey;
        destToken: PublicKey;
        authorityEpoch: bigint;
        owed: bigint;
    };
    /**
     * Insurance budget re-credited by a previous CloseSlab that returned Ok without
     * closing (tag 41, Resolved only, amount must be > 0, signed by the domain's
     * insurance_authority). On a stake-bound market that authority is the stake vault_auth
     * PDA, so this leg must go through the stake program's AdminWithdrawInsurance instead
     * — pass `amount: 0n` / omit and send that separately first.
     */
    insuranceRecredit?: {
        authority: PublicKey;
        destToken: PublicKey;
        amount: bigint;
        ledger?: PublicKey;
    };
    /**
     * The market has an Earn LP vault registry. CloseSlab can NEVER retire such a market:
     * the LP-vault dead-share floor (LP_VAULT_MINIMUM_LIQUIDITY) blocks the terminal scan by
     * design, so its slab rent is permanently unrecoverable. The planner throws.
     */
    hasLpVault: boolean;
    tokenProgram?: PublicKey;
}
/**
 * Plan ONE CloseSlab attempt as an ordered instruction list for a single transaction:
 *   1. tag 84 WithdrawProtocolFee(amount 0) — if a protocol fee is owed;
 *   2. tag 41 WithdrawInsurance(amount) — if a prior attempt re-credited the insurance budget;
 *   3. tag 13 CloseSlab(authority_epoch).
 * After sending, check {@link isClosedMarketTombstone}; if it is false, re-read the owed
 * protocol fee and the re-credited insurance budget and plan the next attempt.
 *
 * @param a  Attempt inputs (live-read CAS values and owed amounts).
 * @returns Ordered instructions (1–3).
 * @throws If `hasLpVault` is true (not retirable), or a leg has a non-positive amount.
 * @example
 * ```ts
 * const ixs = planCloseSlabAttempt({ programId, market, vaultToken, closer, closerDestToken, closeAuthorityEpoch,
 *   protocolFee: { authority, destToken, authorityEpoch, owed }, hasLpVault: false });
 * ```
 */
declare function planCloseSlabAttempt(a: CloseSlabAttemptArgs): TransactionInstruction[];

/**
 * P3 vault-owned LP — account decoders, PDAs, instruction builders, the bound-vault tail for
 * Earn tags 75/77/78, and the vault-LP refresh crank. Additive to SDK 8.0.0.
 *
 * Source: percolator-prog `feat/p3-vault-owned-lp` @ `5e4c15ff66a4176cf9b0204ef35aef6df058f018` (P3 candidate FINAL: senior draw, recall cap, pause 89, cross-pot 77, resolved-lock fixes A–D, worse-of 75/77 pricing)
 * (`state::{VaultLpStateV18, AssetVaultLpV18, read_asset_vault_lp}`, `load_bound_vault_lp_tail`,
 * `vault_lp_refresh_snapshot`). Offsets are pinned by `test/p3.test.ts` against rustc
 * `offset_of!` on the REAL P3 structs, and the per-asset record offset against a market
 * account built by the P3 crate itself.
 *
 * Relaunch wrapper = P1 + P3 (`5e4c15ff`). On an older v18.2 market every AssetVaultLpV18
 * record is zero ("no vault LP bound").
 *
 * @module p3-vault-lp
 */

/** `KIND_VAULT_LP_STATE`. */
declare const V18_KIND_VAULT_LP_STATE_P3 = 9;
/** `size_of::<VaultLpStateV18>()`. */
declare const VAULT_LP_STATE_BODY_LEN_P3 = 256;
/** `vault_lp_state_account_len()` = 16 + 256. */
declare const VAULT_LP_STATE_ACCOUNT_LEN_P3: number;
/** `ASSET_VAULT_LP_OFF` inside each asset's 1024-byte wrapper slot. */
declare const ASSET_VAULT_LP_SLOT_OFF_P3 = 896;
/** `ASSET_VAULT_LP_LEN`. */
declare const ASSET_VAULT_LP_LEN_P3 = 128;
/** `ASSET_VAULT_LP_FLAG_BOUND`. */
declare const ASSET_VAULT_LP_FLAG_BOUND_P3 = 1;
/** Account offset of `LpVaultRegistryV16._reserved[0]` = the "vault LP bound" flag (16 + 144). */
declare const LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3 = 160;
/** Account offsets of `VaultLpStateV18` fields (header included). */
declare const VAULT_LP_STATE_OFF_P3: Readonly<{
    readonly marketGroup: 16;
    readonly registry: 48;
    readonly lpPortfolio: 80;
    readonly juniorOwner: 112;
    readonly seniorClaimAtoms: 144;
    readonly juniorDepositedAtoms: 160;
    readonly juniorWithdrawnAtoms: 176;
    readonly seniorFeeCreditedAtoms: 192;
    readonly recalledAtoms: 208;
    readonly assetIndex: 224;
    readonly juniorFloorBps: 226;
    readonly seniorFeeShareBps: 228;
    readonly version: 230;
    readonly bump: 231;
    /** `_padding` [232..240) must be zero (program `validate_vault_lp_state`). */
    readonly padding: 232;
    /** P3 senior draw FINAL `d119eebd` (was `_reserved`). */
    readonly seniorDrawnAtoms: 240;
    readonly seniorDrawOutstandingAtoms: 256;
}>;
/** `ASSET_VAULT_LP_DRAW_OFF` inside each asset's wrapper slot (P3 senior draw FINAL `d119eebd`). */
declare const ASSET_VAULT_LP_DRAW_SLOT_OFF_P3 = 832;
/** `ASSET_VAULT_LP_DRAW_LEN` (`size_of::<AssetVaultLpDrawV18>()`); ends at {@link ASSET_VAULT_LP_SLOT_OFF_P3}. */
declare const ASSET_VAULT_LP_DRAW_LEN_P3 = 64;
/** Offsets of `AssetVaultLpV18` fields inside the 128-byte record. */
declare const ASSET_VAULT_LP_FIELD_OFF_P3: Readonly<{
    readonly vaultLpPortfolio: 0;
    readonly lpNetQ: 32;
    readonly levCapQ: 48;
    readonly lpNetSlot: 64;
    readonly skewSlopeE9: 72;
    readonly skewMaxE9: 80;
    readonly levMaxImrBps: 88;
    readonly flags: 90;
    readonly reserved0: 91;
    readonly vaultLpMaxLevBps: 92;
    readonly approvedMatcherProgram: 96;
}>;
/**
 * Account offset of asset `i`'s `AssetVaultLpV18` record in a market account:
 * `MARKET_GROUP_OFF + MARKET_GROUP_LEN + i·MARKET_ASSET_SLOT_LEN + 896` (= 2246 + 2325·i).
 *
 * @param assetIndex  Asset slot index.
 * @returns Byte offset.
 * @example
 * ```ts
 * assetVaultLpAccountOffsetP3(0); // 2246
 * ```
 */
declare function assetVaultLpAccountOffsetP3(assetIndex: number): number;
/**
 * Recommended compute-unit limits for P3 transactions (measured worst cases on the relaunch head,
 * security review 2026-09-30, with headroom). The runtime default is 200k per instruction, which
 * FAILS a vault-LP TradeCpi, a large CloseResolved and 101: always set an explicit limit.
 *   tradeCpi 600k (worst 405,386; matches the app's useTrade) · closeResolved 300k (worst 204k) ·
 *   vaultLpSettleResolved (101) 400k (worst 285k) · lpVaultCrankFees (78) 120k (worst 63k) ·
 *   keeperCrank 250k (worst 151k). Sum the limits when bundling several instructions.
 */
declare const RECOMMENDED_CU_P3: Readonly<{
    readonly tradeCpi: 600000;
    readonly closeResolved: 300000;
    readonly vaultLpSettleResolved: 400000;
    readonly lpVaultCrankFees: 120000;
    readonly keeperCrank: 250000;
}>;
/** `offset_of!(AssetStateV16Account, raw_oracle_target_price)` (rustc, engine `35ddd692`). */
declare const ASSET_STATE_RAW_ORACLE_TARGET_PRICE_OFF_P3 = 17;
/** `offset_of!(AssetStateV16Account, effective_price)` (rustc). */
declare const ASSET_STATE_EFFECTIVE_PRICE_OFF_P3 = 25;
/** Engine `POS_SCALE` (position quantity scale). */
declare const POS_SCALE_P3 = 1000000n;
/**
 * Read asset `assetIndex`'s engine prices: the lagging `effective_price` and the pending oracle
 * `raw_oracle_target_price` (the inputs of the `ede691b6` worse-of Earn pricing).
 * @param marketData  Market (slab) account data.
 * @param assetIndex  Asset slot index.
 * @returns `{ effectivePriceE6, rawOracleTargetPriceE6 }`.
 * @throws If the account is too short.
 * @example
 * ```ts
 * const { effectivePriceE6, rawOracleTargetPriceE6 } = readAssetPricesP3(slab.data, 0);
 * ```
 */
declare function readAssetPricesP3(marketData: Uint8Array, assetIndex: number): {
    effectivePriceE6: bigint;
    rawOracleTargetPriceE6: bigint;
};
/** Decoded `VaultLpStateV18` (PDA `["vault_lp", market]`). */
interface VaultLpStateP3 {
    marketGroup: PublicKey;
    registry: PublicKey;
    lpPortfolio: PublicKey;
    juniorOwner: PublicKey;
    /** C — the number that prices Earn shares while the junior is solvent. */
    seniorClaimAtoms: bigint;
    juniorDepositedAtoms: bigint;
    juniorWithdrawnAtoms: bigint;
    seniorFeeCreditedAtoms: bigint;
    recalledAtoms: bigint;
    assetIndex: number;
    juniorFloorBps: number;
    seniorFeeShareBps: number;
    version: number;
    bump: number;
    /** Cumulative senior backing moved into the vault LP's capital by booked draws (junior cover excluded). */
    seniorDrawnAtoms: bigint;
    /**
     * Senior loss still OUTSTANDING (C was cut by it; a later recovery restores C first). While
     * > 0 the vault LP's risk-increasing fills, 97 and 102 are halted.
     */
    seniorDrawOutstandingAtoms: bigint;
}
/**
 * Decode a `VaultLpStateV18` account (kind 9, >= 272 bytes). Mirrors `read_vault_lp_state`'s
 * header + validation (version 1, floor 1000..=10000, senior fee share 10000, zero padding).
 *
 * @param data  Raw account bytes.
 * @returns Decoded state.
 * @throws If the kind, length or any validated field is wrong.
 * @example
 * ```ts
 * const st = decodeVaultLpStateP3(info.data);
 * ```
 */
declare function decodeVaultLpStateP3(data: Uint8Array): VaultLpStateP3;
/** Decoded `AssetVaultLpDrawV18` (per asset, P3 senior draw FINAL `d119eebd`). */
interface AssetVaultLpDrawP3 {
    /** Pending (unbooked) draw out of the EVEN-domain pot (domain `2·asset`). */
    pendingOutEvenAtoms: bigint;
    /** Pending (unbooked) draw out of the ODD-domain pot (domain `2·asset + 1`). */
    pendingOutOddAtoms: bigint;
    /** Mirror of `VaultLpStateV18.senior_draw_outstanding_atoms` (fill-time halt). */
    outstandingMirrorAtoms: bigint;
    /** Pending moved atoms (junior cover + senior draw) not yet booked. */
    pendingMovedAtoms: bigint;
    /**
     * A draw is pending: the next 75/77/78/97/98/102 books it and needs the drawn pots' ledgers
     * WRITABLE (the SDK builders and {@link withBoundVaultLpTailP3} always pass them writable).
     */
    hasPendingDraw: boolean;
}
/**
 * Decode asset `assetIndex`'s `AssetVaultLpDrawV18` from a market account
 * (at {@link assetVaultLpAccountOffsetP3} − {@link ASSET_VAULT_LP_DRAW_LEN_P3}).
 * @param marketData  Market (slab) account data.
 * @param assetIndex  Asset slot index.
 * @returns The draw record.
 * @throws If the account is too short.
 * @example
 * ```ts
 * const draw = decodeAssetVaultLpDrawP3(slab.data, 0);
 * if (draw.hasPendingDraw) console.log("next Earn ix books the draw");
 * ```
 */
declare function decodeAssetVaultLpDrawP3(marketData: Uint8Array, assetIndex: number): AssetVaultLpDrawP3;
/** Decoded `AssetVaultLpV18`. */
interface AssetVaultLpP3 {
    /** null when no vault LP is bound on this asset. */
    vaultLpPortfolio: PublicKey | null;
    /** Vault LP signed position snapshot (engine Q); traders' net = −lpNetQ. */
    lpNetQ: bigint;
    levCapQ: bigint;
    lpNetSlot: bigint;
    skewSlopeE9: bigint;
    skewMaxE9: bigint;
    levMaxImrBps: number;
    flags: number;
    bound: boolean;
    /** Raw stored value; 0 means the 1x default. */
    vaultLpMaxLevBps: number;
    /** null = no matcher approved yet. */
    approvedMatcherProgram: PublicKey | null;
}
/**
 * Decode one 128-byte `AssetVaultLpV18` record (mirrors `validate_asset_vault_lp`).
 *
 * @param rec  The 128 bytes.
 * @returns Decoded record.
 * @throws On unknown flag bits, non-zero reserved byte, out-of-range caps, or bound ≠ (portfolio ≠ 0).
 * @example
 * ```ts
 * const r = decodeAssetVaultLpRecordP3(bytes);
 * ```
 */
declare function decodeAssetVaultLpRecordP3(rec: Uint8Array): AssetVaultLpP3;
/**
 * Decode asset `assetIndex`'s `AssetVaultLpV18` from a raw market account (kind 1).
 *
 * @param marketData  Raw market account bytes.
 * @param assetIndex  Asset slot.
 * @returns Decoded record (all-zero on a market without P3 state).
 * @example
 * ```ts
 * const r = decodeAssetVaultLpP3(marketInfo.data, 0);
 * if (r.bound) console.log(r.vaultLpPortfolio?.toBase58());
 * ```
 */
declare function decodeAssetVaultLpP3(marketData: Uint8Array, assetIndex: number): AssetVaultLpP3;
/**
 * True if an LP-vault registry account has its "vault LP bound" flag set (`_reserved[0] == 1`).
 * While bound, tags 75/77/78 REQUIRE the vault-LP tail ({@link withBoundVaultLpTailP3}).
 *
 * @param registryData  Raw LpVaultRegistry account bytes.
 * @returns Whether a vault LP is bound.
 * @throws If the flag byte is neither 0 nor 1.
 * @example
 * ```ts
 * if (isLpVaultRegistryBoundP3(reg.data)) ix = withBoundVaultLpTailP3(ix, ...);
 * ```
 */
declare function isLpVaultRegistryBoundP3(registryData: Uint8Array): boolean;
/**
 * `["vault_lp", market]` under the wrapper.
 * @param programId  Wrapper program id.
 * @param market     Market account.
 * @returns [pda, bump].
 * @example
 * ```ts
 * const [vaultLpState] = deriveVaultLpStateP3(WRAPPER, market);
 * ```
 */
declare function deriveVaultLpStateP3(programId: PublicKey, market: PublicKey): [PublicKey, number];
/** BPF upgradeable loader id. */
declare const BPF_LOADER_UPGRADEABLE_ID_P3: PublicKey;
/**
 * The wrapper's ProgramData account (`[program_id]` under the upgradeable loader) — required by
 * the upgrade-authority tags 95 and 99.
 * @param programId  Wrapper program id.
 * @returns [programData, bump].
 * @example
 * ```ts
 * const [programData] = deriveProgramDataAddressP3(WRAPPER);
 * ```
 */
declare function deriveProgramDataAddressP3(programId: PublicKey): [PublicKey, number];
/** Common market context for P3 builders. */
interface VaultLpMarketP3 {
    programId: PublicKey;
    market: PublicKey;
    /** `LpVaultRegistryV16.domain` — selects which backing ledger is "own". */
    registryDomain: number;
    /** The vault-owned LP portfolio. */
    lpPortfolio: PublicKey;
}
/** Matcher context size a tag-94 auto-pin needs (`MATCHER_CONTEXT_LEN`). */
declare const VAULT_LP_MATCHER_CTX_LEN_P3 = 320;
/**
 * Pre-create the matcher context tag 94 auto-pins: `SystemProgram.createAccount` of 320 zeroed
 * bytes owned by the matcher program. `matcherCtx` must be a fresh keypair and SIGN this
 * transaction. Send before (or in the same transaction as) {@link buildInitVaultLpIxP3}.
 *
 * @param payer           Funds the rent.
 * @param matcherCtx      New account address (fresh keypair's public key).
 * @param lamports        Rent-exempt minimum for 320 bytes (`getMinimumBalanceForRentExemption(320)`).
 * @param matcherProgram  Owner (default: the devnet canonical matcher EDKKgRaV…, all-fresh relaunch).
 * @returns SystemProgram createAccount instruction.
 * @example
 * ```ts
 * const ctx = Keypair.generate();
 * const lamports = await connection.getMinimumBalanceForRentExemption(VAULT_LP_MATCHER_CTX_LEN_P3);
 * const ixs = [buildCreateVaultLpMatcherCtxIxP3(payer, ctx.publicKey, lamports), buildInitVaultLpIxP3(m, marketauth, 2_000, ctx.publicKey)];
 * ```
 */
declare function buildCreateVaultLpMatcherCtxIxP3(payer: PublicKey, matcherCtx: PublicKey, lamports: number, matcherProgram?: PublicKey): TransactionInstruction;
/**
 * Tag 94 InitVaultLp (P3 FINAL `58e379f1`), marketauth only: the marketauth signs and becomes the
 * junior owner. SINGLE-ASSET markets only: create the market with `maxPortfolioAssets: 1`
 * (`max_market_slots == 1`), otherwise 86 VaultLpMultiAssetMarket. Auto-pins the vault LP to the canonical matcher: pass the pre-created `matcherCtx`
 * ({@link buildCreateVaultLpMatcherCtxIxP3}); the delegate PDA is derived with the REGISTRY as
 * the LP owner. On a stake-bound market the marketauth is the keyless stake-pool PDA, so bind
 * the vault LP before InitPool rotates it.
 *
 * @param m               Market context.
 * @param marketauth      The market's marketauth (signer; becomes the junior owner).
 * @param juniorFloorBps  1000..=10000.
 * @param matcherCtx      Pre-created 320-byte ctx owned by the matcher program (writable).
 * @param matcherProgram  Must be the canonical matcher (default: devnet EDKKgRaV…, all-fresh relaunch).
 * @returns Instruction (11 accounts).
 * @example
 * ```ts
 * const ix = buildInitVaultLpIxP3({ programId, market, registryDomain: 0, lpPortfolio }, marketauth, 2_000);
 * ```
 */
declare function buildInitVaultLpIxP3(m: VaultLpMarketP3, marketauth: PublicKey, juniorFloorBps: number, matcherCtx: PublicKey, matcherProgram?: PublicKey): TransactionInstruction;
/**
 * Tag 95 VaultLpSetMatcher (upgrade authority). The delegate is derived with the REGISTRY
 * as the LP owner, exactly as the handler does.
 *
 * @param m                 Market context.
 * @param upgradeAuthority  Wrapper upgrade authority (signer).
 * @param matcherProgram    Must equal the tag-99 approved matcher for the asset.
 * @param matcherCtx        Matcher context account (writable).
 * @param args              Wire fields.
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildVaultLpSetMatcherIxP3(m, upgradeAuthority, MATCHER, ctx, args);
 * ```
 */
declare function buildVaultLpSetMatcherIxP3(m: VaultLpMarketP3, upgradeAuthority: PublicKey, matcherProgram: PublicKey, matcherCtx: PublicKey, args: VaultLpSetMatcherArgsP3): TransactionInstruction;
/**
 * Tag 96 DepositJuniorTranche (junior owner).
 * @param m            Market context.
 * @param juniorOwner  Signer.
 * @param sourceToken  Junior's collateral token account.
 * @param vaultToken   Market collateral vault.
 * @param amount       Atoms.
 * @returns Instruction.
 * @example
 * ```ts
 * buildDepositJuniorTrancheIxP3(m, junior, juniorAta, vault, 1_000_000n);
 * ```
 */
declare function buildDepositJuniorTrancheIxP3(m: VaultLpMarketP3, juniorOwner: PublicKey, sourceToken: PublicKey, vaultToken: PublicKey, amount: bigint): TransactionInstruction;
/**
 * Tag 97 WithdrawJuniorTranche (junior owner). `destToken` must be owned by the junior.
 * Refused with 89 VaultLpPausedForSeniorDraw while a senior draw is pending/outstanding (`4b1a5d30`).
 * @param m            Market context.
 * @param juniorOwner  Signer.
 * @param destToken    Junior's collateral token account.
 * @param vaultToken   Market collateral vault.
 * @param amount       Atoms.
 * @returns Instruction.
 * @example
 * ```ts
 * buildWithdrawJuniorTrancheIxP3(m, junior, juniorAta, vault, 500_000n);
 * ```
 */
declare function buildWithdrawJuniorTrancheIxP3(m: VaultLpMarketP3, juniorOwner: PublicKey, destToken: PublicKey, vaultToken: PublicKey, amount: bigint): TransactionInstruction;
/**
 * Tag 98 VaultLpRecall (permissionless). Needed before a bound redemption when the value sits
 * in the LP: a Live 75/77 otherwise fails 88 VaultLpRedeemNeedsRecall (`d119eebd`).
 * `39b138c8` (D-P3-30) / `4b1a5d30`: `amount` is capped at `min(recall_limit, max(vault LP
 * POST-maintenance-fee certified equity, 0))` (above the cap: VaultLpRecallRefused); while a senior
 * draw is pending or outstanding the recall is refused with 89 VaultLpPausedForSeniorDraw (see
 * {@link decodeAssetVaultLpDrawP3}). The vault LP must be flat.
 * @param m             Market context.
 * @param cranker       Signer (pays rent if the target ledger is created).
 * @param amount        Atoms.
 * @param targetDomain  Receiving backing domain.
 * @returns Instruction.
 * @example
 * ```ts
 * buildVaultLpRecallIxP3(m, keeper, shortfall, m.registryDomain);
 * ```
 */
declare function buildVaultLpRecallIxP3(m: VaultLpMarketP3, cranker: PublicKey, amount: bigint, targetDomain: number): TransactionInstruction;
/**
 * Tag 99 SetVaultLpRisk (upgrade authority).
 * @param programId         Wrapper program id.
 * @param market            Market account.
 * @param upgradeAuthority  Signer.
 * @param args              Wire fields.
 * @returns Instruction.
 * @example
 * ```ts
 * buildSetVaultLpRiskIxP3(WRAPPER, market, upgradeAuthority, { assetIndex: 0, ... });
 * ```
 */
declare function buildSetVaultLpRiskIxP3(programId: PublicKey, market: PublicKey, upgradeAuthority: PublicKey, args: SetVaultLpRiskArgsP3): TransactionInstruction;
/**
 * Tag 100 VaultLpConvertPnl (permissionless).
 * @param m       Market context.
 * @param caller  Signer.
 * @param amount  Atoms.
 * @returns Instruction.
 * @example
 * ```ts
 * buildVaultLpConvertPnlIxP3(m, keeper, 1n);
 * ```
 */
declare function buildVaultLpConvertPnlIxP3(m: VaultLpMarketP3, caller: PublicKey, amount: bigint): TransactionInstruction;
/**
 * Tag 101 VaultLpSettleResolved (permissionless, Resolved). Replaces tags 30/46 for the vault LP.
 * Compute: set ≥ {@link RECOMMENDED_CU_P3}`.vaultLpSettleResolved` (400k; measured worst 285k). The
 * close step can be ProgressOnly several times while a large residual is chunked: repeat it until
 * the vault LP can be closed (tag 8).
 * P3 FINAL (`58e379f1`): moves NO SPL — the payout goes into the vault's own backing pot. The
 * `juniorDestToken` / `vaultToken` accounts are still required and validated. Exit order after
 * settlement: {@link planResolvedVaultLpExitP3} (78 → 77 per senior → 102 junior).
 * @param m                Market context.
 * @param caller           Signer.
 * @param juniorDestToken  Junior owner's collateral token account.
 * @param vaultToken       Market collateral vault.
 * @param topup            0 = close step, 1 = topup claim.
 * @returns Instruction.
 * @example
 * ```ts
 * buildVaultLpSettleResolvedIxP3(m, keeper, juniorAta, vault, 0);
 * ```
 */
declare function buildVaultLpSettleResolvedIxP3(m: VaultLpMarketP3, caller: PublicKey, juniorDestToken: PublicKey, vaultToken: PublicKey, topup: 0 | 1): TransactionInstruction;
/**
 * Tag 102 VaultLpReleaseSurplus (junior owner). Pass `resolved` for the Resolved-mode SPL payout tail.
 * Refused with 89 VaultLpPausedForSeniorDraw while a senior draw is outstanding (`4b1a5d30`);
 * Resolved: request at most physical − C (C keeps ≈1,005 atoms of dead-share dust), else 83.
 * @param m             Market context.
 * @param juniorOwner   Signer.
 * @param amount        Atoms.
 * @param sourceDomain  Backing domain.
 * @param resolved      Resolved-mode tail: junior dest token + market vault token.
 * @returns Instruction.
 * @example
 * ```ts
 * buildVaultLpReleaseSurplusIxP3(m, junior, 10n, 0);
 * ```
 */
declare function buildVaultLpReleaseSurplusIxP3(m: VaultLpMarketP3, juniorOwner: PublicKey, amount: bigint, sourceDomain: number, resolved?: {
    juniorDestToken: PublicKey;
    vaultToken: PublicKey;
}): TransactionInstruction;
/** Base account count each Earn tag must have before the P3 tail (tail index = this). */
declare const BOUND_VAULT_LP_TAIL_INDEX_P3: Readonly<{
    readonly 75: 11;
    readonly 77: 13;
    readonly 78: 6;
}>;
/**
 * Base-account slots of the two pot ledgers (own, sibling) per Earn tag. From percolator-prog
 * `d119eebd`, a pending senior draw is booked into BOTH pot ledgers before any instruction that
 * prices off C, so {@link withBoundVaultLpTailP3} forces these slots writable.
 */
declare const BOUND_VAULT_LP_LEDGER_SLOTS_P3: Readonly<{
    readonly 75: readonly [7, 10];
    readonly 77: readonly [8, 11];
    readonly 78: readonly [3, 4];
}>;
/** Options for {@link withBoundVaultLpTailP3}. */
interface BoundVaultLpTailOptsP3 {
    /**
     * Pass the 75/77 vault-LP tail account READ-ONLY. Default `false` (writable): on a Live market
     * a writable vault LP lets the program run the senior draw in the same instruction; a
     * read-only one with an undrawn deficit is refused with 87 VaultLpSeniorDrawRequired.
     * Ignored for tag 78 (no LP in its tail).
     */
    lpReadOnly?: boolean;
}
/**
 * Append the REQUIRED bound-vault tail to an Earn instruction (fail closed on a bound vault):
 * 75 DepositToLpVault → [11] vault_lp_state (w), [12] vault LP portfolio (w);
 * 77 ExecuteRedemption → [13] vault_lp_state (w), [14] vault LP portfolio (w);
 * 78 LpVaultCrankFees → [6] vault_lp_state (w).
 * The pot-ledger slots ({@link BOUND_VAULT_LP_LEDGER_SLOTS_P3}) are forced writable.
 *
 * P3 senior draw FINAL (`d119eebd`): the vault LP is WRITABLE by default so a Live 75/77 can run
 * the draw itself (otherwise 87 VaultLpSeniorDrawRequired); a pending draw is booked into both
 * pot ledgers (read-only ones fail closed). A 77 that needs value held in the vault LP's capital
 * returns 88 VaultLpRedeemNeedsRecall: send VaultLpRecall (98) first.
 * Tag 76 (RequestRedeemLpShares) takes no tail on P3.
 *
 * P3 FINAL (`58e379f1`), no wire change: in Resolved mode the tag-77 [14] vault LP is only
 * KEY-pinned (it may already be settled, closed and garbage-collected, so it is not required to
 * be wrapper-owned); tag 78 is additionally allowed in Resolved mode once the market is
 * terminal-flat (no materialized portfolio, c_tot == 0) — the [6] tail is still required.
 *
 * @param base         The unbound-form instruction (tag + exact base account count checked).
 * @param vaultLpState `["vault_lp", market]`.
 * @param lpPortfolio  The vault-owned LP portfolio (ignored for tag 78).
 * @param opts         {@link BoundVaultLpTailOptsP3} (default: vault LP writable).
 * @returns A new instruction with the tail appended.
 * @throws If the tag is not 75/77/78 or the base account count is wrong.
 * @example
 * ```ts
 * const ix = withBoundVaultLpTailP3(depositIx, vaultLpState, lpPortfolio);
 * ```
 */
declare function withBoundVaultLpTailP3(base: TransactionInstruction, vaultLpState: PublicKey, lpPortfolio: PublicKey, opts?: BoundVaultLpTailOptsP3): TransactionInstruction;
/**
 * Tag 77 ExecuteRedemption on a BOUND (P3) vault, fully assembled: 13 base accounts + the bound
 * tail. Security condition on `221cf006`: BOTH pot ledgers are ALWAYS writable ([8] registry-domain
 * ledger, [11] sibling). The program tops the chosen pot up from its sibling in the same
 * instruction only when both are writable; with a read-only one the top-up is skipped and a senior
 * larger than one pot gets 88 (Live) / 21 (Resolved) instead of exiting. The vault LP [14] is
 * writable too (a Live 77 runs the senior draw first; in Resolved it is only key-pinned).
 *
 * Accounts: 0 cranker [s,w] · 1 market [w] · 2 registry [w] · 3 redemption [w]
 * (`["lp_redemption", registry, redeemer]`) · 4 LP mint [w] · 5 escrow [w] · 6 market vault token [w]
 * · 7 vault authority · 8 own ledger [w] · 9 redeemer collateral ATA [w] · 10 token program ·
 * 11 sibling ledger [w] · 12 redeemer (rent destination) [w] · 13 vault_lp_state [w] · 14 vault LP [w].
 *
 * @param m             Market context (`registryDomain` picks the own ledger).
 * @param cranker       Signer (anyone; the payout always goes to the redeemer).
 * @param redeemer      The redemption's owner (`redemption.redeemer`).
 * @param redeemerDest  Redeemer's collateral token account (must be owned by the redeemer).
 * @param vaultToken    Market collateral vault token account.
 * @param sourceDomain  Pot to redeem from (the program tops it up from the sibling when short).
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildExecuteRedemptionIxP3(m, keeper, senior, seniorAta, vaultAta, m.registryDomain);
 * ```
 */
declare function buildExecuteRedemptionIxP3(m: VaultLpMarketP3, cranker: PublicKey, redeemer: PublicKey, redeemerDest: PublicKey, vaultToken: PublicKey, sourceDomain: number): TransactionInstruction;
/** Inputs for {@link buildVaultLpRefreshCrankIxP3}. */
interface VaultLpRefreshCrankArgsP3 {
    programId: PublicKey;
    cranker: PublicKey;
    market: PublicKey;
    vaultLpPortfolio: PublicKey;
    nowSlot: bigint;
    /** One hint per asset whose oracle accounts follow, in order. */
    observations: CrankObservationHint[];
    /** Read-only oracle accounts, in the order the observations describe. */
    oracleAccounts: PublicKey[];
}
/**
 * The vault-LP refresh crank: a permissionless tag-5 crank whose portfolio is the vault LP.
 * On P3 it refreshes the vault LP's health cert (clears VaultLpValuationStale, error 85, for
 * a following Earn 75/77) and re-snapshots `AssetVaultLpV18.lp_net_q` for skew funding
 * (`vault_lp_refresh_snapshot`). Prepend it in the same transaction.
 *
 * @param a  Crank inputs.
 * @returns Instruction.
 * @example
 * ```ts
 * const crank = buildVaultLpRefreshCrankIxP3({ programId, cranker, market, vaultLpPortfolio, nowSlot, observations: [{ assetIndex: 0, oracleAccounts: 0 }], oracleAccounts: [] });
 * ```
 */
declare function buildVaultLpRefreshCrankIxP3(a: VaultLpRefreshCrankArgsP3): TransactionInstruction;
/** `LP_VAULT_MINIMUM_LIQUIDITY` dead shares burned from the genesis deposit. */
declare const LP_VAULT_MINIMUM_LIQUIDITY_P3 = 1000n;
/** One backing pot's synced ledger counters (read the ledger AFTER a sync, i.e. as the program sees them). */
interface BackingPotTermsP3 {
    totalPrincipalAtoms: bigint;
    totalEarningsAtoms: bigint;
    totalEarningsWithdrawnAtoms: bigint;
    cumulativeLossAtoms: bigint;
    cumulativeRecoveryAtoms: bigint;
}
/**
 * `vault_pot_held_atoms` (P3 senior draw FINAL `d119eebd`): backing HELD by one pot =
 * floor((fresh_unliened_backing_num + valid_liened_backing_num) / BOUND_SCALE).
 * @param bucket  The pot's backing-bucket `_num` fields.
 * @returns Held atoms.
 * @example
 * ```ts
 * const held = vaultPotHeldAtomsP3({ freshUnlienedBackingNum: a, validLienedBackingNum: b });
 * ```
 */
declare function vaultPotHeldAtomsP3(bucket: {
    freshUnlienedBackingNum: bigint;
    validLienedBackingNum: bigint;
}): bigint;
/**
 * `vault_physical_idle_backing_atoms` (Resolved senior pricing): Σ floor(fresh_unliened_backing_num / BOUND_SCALE)
 * over both buckets (floored per bucket, as the program does).
 * @param freshUnlienedBackingNums  The two buckets' `fresh_unliened_backing_num`.
 * @returns Idle backing atoms.
 * @example
 * ```ts
 * vaultPhysicalIdleBackingAtomsP3([own.freshUnlienedBackingNum, sib.freshUnlienedBackingNum]);
 * ```
 */
declare function vaultPhysicalIdleBackingAtomsP3(freshUnlienedBackingNums: bigint[]): bigint;
/**
 * Bound-vault NAV, bit-exact with `lp_vault_combined_nav_parts_p3` / `vault_lp_v18::bound_vault_nav`
 * at percolator-prog `d119eebd` (P3 senior draw / B24): per pot the vault owns
 * `min(principal, held)`, where `held` = {@link vaultPotHeldAtomsP3}. Backing above a pot's
 * principal is the vault LP's settled loss reserved for winners, and backing below it is a real
 * loss. The ledgers' impairment counters are NOT used any more. LP earnings are floored per pot:
 * `floor((earnings − withdrawn)·fee_share_bps / 10000)`, saturating.
 *
 * BREAKING vs the pre-`d119eebd` port: the 4th argument is now the per-pot held backing
 * (`{ own, sibling }`), not one combined owned-backing total.
 *
 * @param own           Own-domain (registry.domain) ledger terms.
 * @param sibling       Sibling-domain (domain ^ 1) ledger terms.
 * @param feeShareBps   `registry.fee_share_bps` (<= 10000).
 * @param held          Held backing per pot ({@link vaultPotHeldAtomsP3} of each bucket).
 * @returns `{ availablePrincipal, lpEarnings, nav }`.
 * @example
 * ```ts
 * const { nav } = boundVaultNavFlooredP3(ownLedger, siblingLedger, registry.feeShareBps,
 *   { own: vaultPotHeldAtomsP3(ownBucket), sibling: vaultPotHeldAtomsP3(siblingBucket) });
 * ```
 */
declare function boundVaultNavFlooredP3(own: BackingPotTermsP3, sibling: BackingPotTermsP3, feeShareBps: number, held: {
    own: bigint;
    sibling: bigint;
}): {
    availablePrincipal: bigint;
    lpEarnings: bigint;
    nav: bigint;
};
/** One active vault-LP leg for {@link vaultLpEquityLagBoundsP3}. */
interface VaultLpLegPricesP3 {
    /** Signed `basis_pos_q` (positive = long); `|q|` is used (conservative upper bound). */
    basisPosQ: bigint;
    /** The leg's asset `effective_price` ({@link readAssetPricesP3}). */
    effectivePriceE6: bigint;
    /** The leg's asset `raw_oracle_target_price` ({@link readAssetPricesP3}). */
    rawOracleTargetPriceE6: bigint;
}
/**
 * `vault_lp_equity_lag_bounds_ro` (percolator-prog `ede691b6`, Earn front-run fix): the vault LP's
 * equity re-valued at the price WORSE for the vault (`worse`, prices a senior EXIT, tag 77) and at
 * the price BETTER for it (`better`, prices a senior ENTRY, tag 75, only while a draw is
 * outstanding), comparing each leg's lagging `effective_price` with the pending
 * `raw_oracle_target_price`. Per active leg, q = |basis_pos_q|, ceil per side:
 *   long:  adverse = ceil(q · max(0, eff − target) / POS_SCALE), favorable = ceil(q · max(0, target − eff) / POS_SCALE)
 *   short: adverse = ceil(q · max(0, target − eff) / POS_SCALE), favorable = ceil(q · max(0, eff − target) / POS_SCALE)
 *   worse = certifiedEquity − Σ adverse; better = certifiedEquity + Σ favorable.
 * A FLAT vault LP (no legs) has no lag: both = `capital + min(pnl,0) + min(fee_credits,0)`, floored at 0.
 * The program requires a CURRENT health certificate for a non-flat LP (else 85); this preview takes
 * the certificate's `certifiedEquity` as given.
 *
 * @param a  `legs` (active legs; empty = flat), `certifiedEquity` (non-flat), and `capital`/`pnl`/`feeCredits` (flat).
 * @returns `{ worse, better }` (signed atoms).
 * @example
 * ```ts
 * const { worse } = vaultLpEquityLagBoundsP3({ legs: [{ basisPosQ: -q, ...readAssetPricesP3(slab, 0) }], certifiedEquity: eq, capital: 0n, pnl: 0n, feeCredits: 0n });
 * ```
 */
declare function vaultLpEquityLagBoundsP3(a: {
    legs: VaultLpLegPricesP3[];
    certifiedEquity: bigint;
    capital: bigint;
    pnl: bigint;
    feeCredits: bigint;
}): {
    worse: bigint;
    better: bigint;
};
/**
 * `vault_lp_senior_pricing_claim(c, undrawn, junior_surplus)` = `c − max(0, undrawn − junior_surplus)` (saturating).
 * @param c              Senior claim C.
 * @param undrawn        Deficit not covered yet.
 * @param juniorSurplus  Pot backing above C that absorbs first.
 * @returns Pricing claim.
 * @example
 * ```ts
 * vaultLpSeniorPricingClaimP3(1_000n, 300n, 100n); // 800n
 * ```
 */
declare function vaultLpSeniorPricingClaimP3(c: bigint, undrawn: bigint, juniorSurplus: bigint): bigint;
/**
 * Senior value used by tag 77 on a bound vault (floored everywhere):
 * Resolved → `min(physicalIdleBacking, C)`. Live (`592a77e2`, E-1) → {@link liveExitSeniorValueP3}
 * (always at the worse-for-the-vault price; a negative bound cuts both the claim and the value).
 * `lpEquityWorse` = {@link vaultLpEquityLagBoundsP3}`.worse` (ignored when resolved).
 * Live precondition (`d119eebd`): the vault LP has NO undrawn deficit; otherwise the program
 * refuses 75/77 with 87 VaultLpSeniorDrawRequired (pass the vault LP writable, or crank it).
 * @param a  `nav` (floored, {@link boundVaultNavFlooredP3}), `seniorClaim` (C), `lpValue`,
 *           `resolved`, `physicalIdleBacking` (Σ fresh_unliened_backing_num / 1e12, Resolved only),
 *           `lpEquityWorse` (worse-of vault-LP equity; pass 0n when resolved).
 * @returns Senior tranche value (atoms).
 * @example
 * ```ts
 * const senior = boundVaultSeniorValueP3({ nav, seniorClaim: st.seniorClaimAtoms, lpValue, resolved: false, physicalIdleBacking: 0n, lpEquityWorse: worse });
 * ```
 */
declare function boundVaultSeniorValueP3(a: {
    nav: bigint;
    seniorClaim: bigint;
    lpValue: bigint;
    resolved: boolean;
    physicalIdleBacking: bigint;
    lpEquityWorse: bigint;
}): bigint;
/**
 * `vault_lp_v18::live_exit_senior_value` (percolator-prog `592a77e2`, security fix E-1): the Live 77
 * senior value, ALWAYS at the price worse for the vault (no `nav >= C` shortcut).
 *   worse >= 0: min(nav + min(lpValueAtEff, worse), C)
 *   worse <  0: d = −worse; C' = vaultLpSeniorPricingClaimP3(C, d, max(0, nav − C)); min(max(0, nav − d), C')
 * @param c              Senior claim C (after the 87 undrawn check).
 * @param nav            Floored bound-vault NAV.
 * @param lpValueAtEff   Vault-LP value at effective prices (0 when worse < 0).
 * @param lpEquityWorse  {@link vaultLpEquityLagBoundsP3}`.worse`.
 * @returns Senior value.
 * @example
 * ```ts
 * liveExitSeniorValueP3(1_000_000n, 800_000n, 200_000n, -100_000n); // 700_000n
 * ```
 */
declare function liveExitSeniorValueP3(c: bigint, nav: bigint, lpValueAtEff: bigint, lpEquityWorse: bigint): bigint;
/**
 * Tag-77 payout for `shares` on a bound vault: `floor(shares · senior / S)` (null when S == 0 or
 * shares > S — the program fails closed). Requires harvestable == 0 (bundle tag 78 first).
 * @param shares       Shares redeemed.
 * @param totalShares  `registry.total_lp_shares_outstanding` (S).
 * @param seniorValue  {@link boundVaultSeniorValueP3}.
 * @returns Atoms paid, or null.
 * @example
 * ```ts
 * boundVaultRedemptionAtomsP3(1_000n, 10_000n, 5_000n); // 500n
 * ```
 */
declare function boundVaultRedemptionAtomsP3(shares: bigint, totalShares: bigint, seniorValue: bigint): bigint | null;
/**
 * Tag-75 deposit quote on a bound vault: `C_eff = C + floor(H · senior_fee_share / 10000)`;
 * refused (VaultLpSeniorImpaired) when `nav + H < C_eff` and `nav + H + lpValue < C_eff`;
 * genesis (S == 0) refused (VaultLpHarvestPending) while H > 0, else 1:1 minus the 1000 dead
 * shares; otherwise `floor(amount · S / C_eff)`.
 * @param a  amount, totalShares (S), seniorClaim (C), harvestable (H), seniorFeeShareBps, nav (floored), lpValue.
 * @returns `{ ok: true, shares, minted, cEff }` or `{ ok: false, error }`.
 * @example
 * ```ts
 * const q = boundVaultDepositQuoteP3({ amount, totalShares, seniorClaim, harvestable, seniorFeeShareBps: 10_000, nav, lpValue });
 * ```
 */
declare function boundVaultDepositQuoteP3(a: {
    amount: bigint;
    totalShares: bigint;
    seniorClaim: bigint;
    harvestable: bigint;
    seniorFeeShareBps: number;
    nav: bigint;
    lpValue: bigint;
    /** `VaultLpStateP3.seniorDrawOutstandingAtoms`; when non-zero the entry is priced better-of (ede691b6). */
    seniorDrawOutstandingAtoms: bigint;
    /** {@link vaultLpEquityLagBoundsP3}`.better` (used only while a draw is outstanding). */
    lpEquityBetter: bigint;
}): {
    ok: true;
    shares: bigint;
    minted: bigint;
    cEff: bigint;
} | {
    ok: false;
    error: "VaultLpHarvestPending" | "VaultLpSeniorImpaired" | "LpVaultDepositBelowMinimumLiquidity" | "LpVaultZeroSharesMinted" | "EngineInvalidConfig";
};
/** Inputs for {@link planResolvedVaultLpExitP3}. */
interface ResolvedVaultLpExitArgsP3 {
    market: VaultLpMarketP3;
    /** Unbound-form tag-78 LpVaultCrankFees instruction (6 accounts; see ACCOUNTS_LP_VAULT_CRANK_FEES). */
    crankFeesIx: TransactionInstruction;
    /** Unbound-form tag-77 ExecuteRedemption instructions, one per senior (13 accounts each). */
    seniorRedemptionIxs: TransactionInstruction[];
    /** Junior release (tag 102, Resolved tail). Omit to plan the seniors only. */
    junior?: {
        juniorOwner: PublicKey;
        amount: bigint;
        sourceDomain: number;
        juniorDestToken: PublicKey;
        vaultToken: PublicKey;
    };
}
/**
 * Terminal exit of a bound vault on a Resolved market, in the program's required order:
 *   1. tag 78 LpVaultCrankFees (+[6] vault_lp_state tail) — Resolved + terminal-flat it harvests
 *      the fee leg and absorbs any claim-free residual into the pots (a no-op success otherwise);
 *   2. tag 77 ExecuteRedemption per senior (+[13] state, [14] vault LP tail; [14] is key-pinned
 *      and may be garbage-collected) — each senior should bundle step 1 in the SAME transaction
 *      (77 refuses with 84 VaultLpHarvestPending while fees are harvestable);
 *   3. tag 102 VaultLpReleaseSurplus for the junior, with the Resolved SPL tail — pays the
 *      remainder over C once seniors are out.
 * PRECONDITIONS: market Resolved and terminal-flat — the vault LP settled by tag 101 (moves no SPL
 * on this head) and closed by tag 8, no materialized portfolio, c_tot == 0.
 * Getting there: loop 101 (close step) and every trader's CloseResolved (tag 30) until each
 * portfolio can be closed by tag 8 — both can be ProgressOnly many times (rehearsals: 1,334 steps
 * at a 1-USDC chunk). Compute: 101 ≥ 400k, CloseResolved ≥ 300k, the [78, 77] pair ≥ 120k + the
 * 77 cost ({@link RECOMMENDED_CU_P3}); pass the 77s built by {@link buildExecuteRedemptionIxP3}.
 *
 * @param a  Market context, the unbound 78 / 77 instructions, and the optional junior release.
 * @returns `{ perSeniorTxs, junior }`: one `[78, 77]` instruction pair per senior, then the 102 ix (or null).
 * @example
 * ```ts
 * const plan = planResolvedVaultLpExitP3({ market: m, crankFeesIx, seniorRedemptionIxs, junior });
 * for (const ixs of plan.perSeniorTxs) await send(ixs);
 * if (plan.junior) await send([plan.junior]);
 * ```
 */
declare function planResolvedVaultLpExitP3(a: ResolvedVaultLpExitArgsP3): {
    perSeniorTxs: TransactionInstruction[][];
    junior: TransactionInstruction | null;
};
/** Account offset of `PortfolioAccountV16Account.resolved_payout_receipt` (HEADER_LEN + rustc offset_of; pinned by the parity fixture). */
declare const RESOLVED_RECEIPT_ACCOUNT_OFF_P3 = 9369;
/** `size_of::<ResolvedPayoutReceiptV16Account>()`. */
declare const RESOLVED_RECEIPT_LEN_P3 = 66;
/** Decoded `ResolvedPayoutReceiptV16Account`. */
interface ResolvedPayoutReceiptP3 {
    priorBoundContributionNum: bigint;
    liveReleasedFaceAtReceipt: bigint;
    terminalPositiveClaimFace: bigint;
    paidEffective: bigint;
    present: boolean;
    finalized: boolean;
    /** `present && !finalized`: a PARTIAL receipt that a tag-46 top-up finalises. */
    open: boolean;
}
/**
 * Decode a portfolio account's resolved payout receipt.
 * @param portfolioData  Portfolio account data (V17_PORTFOLIO_ACCOUNT_LEN bytes).
 * @returns The receipt.
 * @throws If the account is too short.
 * @example
 * ```ts
 * const r = decodeResolvedPayoutReceiptP3(info.data);
 * if (r.open) console.log("needs a tag-46 top-up");
 * ```
 */
declare function decodeResolvedPayoutReceiptP3(portfolioData: Uint8Array): ResolvedPayoutReceiptP3;
/**
 * Tag 46 ClaimResolvedPayoutTopup. Default = the PERMISSIONLESS form (owner NOT signing, the
 * market's `nft_registry` PDA at [7] as the #497 escrow proof; the payout still goes to the owner's
 * token account). `signed: true` builds the owner-signed 7-account form instead. Data = `[46]`.
 * An NFT-escrowed portfolio (owner = the NFT program's PDA) refuses the unsigned form (ExpectedSigner):
 * its holder must use the signed/holder-auth path.
 * @param a  programId, market, portfolio, owner, destToken (owner's collateral ATA), vaultToken, optional `signed`.
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildClaimResolvedPayoutTopupIxP3({ programId: W, market, portfolio, owner, destToken, vaultToken });
 * ```
 */
declare function buildClaimResolvedPayoutTopupIxP3(a: {
    programId: PublicKey;
    market: PublicKey;
    portfolio: PublicKey;
    owner: PublicKey;
    destToken: PublicKey;
    vaultToken: PublicKey;
    signed?: boolean;
}): TransactionInstruction;
/** A portfolio with a present, non-finalised resolved receipt. */
interface OpenResolvedReceiptP3 {
    portfolio: PublicKey;
    owner: PublicKey;
    receipt: ResolvedPayoutReceiptP3;
    /** The vault LP (owner = LP-vault registry PDA): settles via 101, never 46. */
    isVaultLp: boolean;
    /** Owner is off-curve (e.g. an NFT-escrow PDA): the permissionless 46 is refused; the holder must sign. */
    needsHolder: boolean;
}
/**
 * List every portfolio of `market` with an OPEN (present, non-finalised) resolved receipt, via
 * getProgramAccounts (dataSize + market at offset 16).
 * @param conn       Connection.
 * @param programId  Wrapper program id.
 * @param market     Market (slab) account.
 * @returns Open receipts (vault LP flagged, escrowed owners flagged).
 * @example
 * ```ts
 * const open = await listOpenResolvedReceiptsP3(conn, W, market);
 * ```
 */
declare function listOpenResolvedReceiptsP3(conn: Pick<Connection, "getProgramAccounts">, programId: PublicKey, market: PublicKey): Promise<OpenResolvedReceiptP3[]>;
/**
 * Tag 30 CloseResolved, permissionless form (owner unsigned, `nft_registry` at [7]); data
 * `[30][fee_rate_per_slot u128 = 0]`. The receipt-revisit fallback when a 46 is refused.
 * @param a  programId, market, portfolio, owner, destToken (owner's collateral ATA), vaultToken.
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildCloseResolvedUnsignedIxP3({ programId: W, market, portfolio, owner, destToken, vaultToken });
 * ```
 */
declare function buildCloseResolvedUnsignedIxP3(a: {
    programId: PublicKey;
    market: PublicKey;
    portfolio: PublicKey;
    owner: PublicKey;
    destToken: PublicKey;
    vaultToken: PublicKey;
}): TransactionInstruction;
/** One receipt-revisit step: try `topup46` first; if its simulation is refused, send `closeResolved`. */
interface ReceiptRevisitStepP3 {
    portfolio: PublicKey;
    owner: PublicKey;
    topup46: TransactionInstruction;
    closeResolved: TransactionInstruction;
}
/**
 * Plan one ROUND of the resolved-receipt revisit (percolator-prog 5e4c15ff rule): dilution comes
 * from ANY claimant whose pot-backed claim is still unreceipted, so after the claimants' closes and
 * after the vault LP's 101 settles, every portfolio whose receipt is present && !finalized gets a
 * tag 46 (or, if that is refused, a repeat CloseResolved) — and the caller REPEATS rounds (re-listing
 * with {@link listOpenResolvedReceiptsP3}) every cycle until none is open. Only then are the
 * portfolios closed (tag 8) and the seniors' 77 run (an open receipt blocks terminal-flat → 21).
 * The vault LP is excluded (it settles via 101); off-curve (NFT-escrowed) owners are returned in
 * `needsHolder` (the permissionless forms are refused for them).
 * @param a  programId, market, vaultToken, collateralMint, the open receipts of this round.
 * @returns `{ steps, needsHolder }` — `steps` empty ⇒ nothing left to revisit.
 * @example
 * ```ts
 * for (let round = 0; round < 50; round++) {
 *   const plan = planResolvedReceiptRevisitP3({ programId: W, market, vaultToken, collateralMint, open: await listOpenResolvedReceiptsP3(conn, W, market) });
 *   if (plan.steps.length === 0) break;
 *   for (const s of plan.steps) await sendFirstThatSimulates([s.topup46], [s.closeResolved]);
 * }
 * ```
 */
declare function planResolvedReceiptRevisitP3(a: {
    programId: PublicKey;
    market: PublicKey;
    vaultToken: PublicKey;
    collateralMint: PublicKey;
    open: OpenResolvedReceiptP3[];
}): {
    steps: ReceiptRevisitStepP3[];
    needsHolder: OpenResolvedReceiptP3[];
};

/**
 * Stake-bound market wind-down (F-9, percolator-stake #301 `d13b5a9`, the relaunch stake), additive to SDK 8.0.0.
 * The relaunch wrapper (P1+P3 `58e379f1`) keeps the v18.2 header/slot layout these offsets read
 * (VERSION 18, config 576, header 758, slot 2325) — the same layout d13b5a9's stake pins.
 *
 * - {@link decodeTerminalInsuranceCapacity}: the wrapper tag-41 terminal capacity for an asset's
 *   insurance authority (on a stake-bound market asset 0's authority is the pool's `vault_auth`),
 *   computed exactly as the deployed v18.2 wrapper (`6377376a`
 *   `terminal_insurance_withdraw_capacity_for_authority_view`) and engine (`35ddd692`
 *   `domain_insurance_withdraw_capacity` / `available_domain_insurance`) do.
 * - {@link buildRecoverTerminalInsuranceIx} / {@link buildAdminCloseSlabIx}: stake tags 29 / 30.
 * - {@link planStakeWindDown}: the ordered keeper/admin flow.
 *
 * Offsets are hand-derived from the engine `#[repr(C)]` structs (every field is a byte-array Pod,
 * so the layout is packed) and calibrated against offsets this SDK already verifies
 * (`insurance` @ header+301, `oi_eff_long_q` @ asset+289, header 758 B, engine slot 1301 B);
 * `test/stake-wind-down.test.ts` also checks them against live devnet v18 markets (header
 * `insurance_domain_budget_remaining_total` == Σ(budget − spent) over every domain).
 *
 * @module stake-wind-down
 */

/** MarketGroupV16HeaderAccount field offsets (relative to the header at account offset 592). */
declare const MARKET_GROUP_HEADER_OFF_V18: Readonly<{
    readonly vault: 285;
    readonly insurance: 301;
    readonly cTot: 317;
    readonly sourceInsuranceCreditReservedTotalAtoms: 445;
    readonly insuranceDomainBudgetRemainingTotal: 461;
    readonly materializedPortfolioCount: 517;
    readonly mode: 626;
}>;
/** EngineAssetSlotV16Account field offsets (relative to the engine slot = asset slot + 1024). */
declare const ENGINE_ASSET_SLOT_OFF_V18: Readonly<{
    readonly insuranceDomainBudgetLong: 515;
    readonly insuranceDomainBudgetShort: 531;
    readonly insuranceDomainSpentLong: 547;
    readonly insuranceDomainSpentShort: 563;
    /** InsuranceCreditReservationV16Account; `insurance_credit_reserved_num` is its first u128. */
    readonly insuranceReservationLong: 1157;
    readonly insuranceReservationShort: 1229;
}>;
/** Engine `BOUND_SCALE` (reservation `_num` fields are in 1e-12 atoms). */
declare const ENGINE_BOUND_SCALE = 1000000000000n;
/** Engine `MarketModeV16` byte. */
declare const MARKET_MODE_V18: Readonly<{
    readonly Live: 0;
    readonly Resolved: 1;
    readonly Recovery: 2;
}>;
/** One insurance domain (domain = 2·asset + side; long = 0, short = 1). */
interface InsuranceDomainBudget {
    domain: number;
    side: "long" | "short";
    budget: bigint;
    spent: bigint;
    /** ceil(insurance_credit_reserved_num / BOUND_SCALE). */
    reservedAtoms: bigint;
    /** budget − spent − reserved (saturating) — the engine's `budget_remaining`. */
    budgetRemaining: bigint;
    /** Engine `domain_insurance_withdraw_capacity`: min(globalAvailable, budgetRemaining, vault). */
    withdrawCapacity: bigint;
}
/** Decoded terminal-insurance state for one asset's insurance authority. */
interface TerminalInsuranceCapacity {
    assetIndex: number;
    /** Engine market mode byte (see {@link MARKET_MODE_V18}). */
    mode: number;
    resolved: boolean;
    vault: bigint;
    insurance: bigint;
    cTot: bigint;
    materializedPortfolioCount: bigint;
    sourceInsuranceCreditReservedTotalAtoms: bigint;
    /** insurance − source_insurance_credit_reserved_total (saturating). */
    globalAvailable: bigint;
    /** Header `insurance_domain_budget_remaining_total` (all assets). */
    headerBudgetRemainingTotal: bigint;
    /** Σ (budget − spent) over this asset's two domains. */
    assetBudgetRemaining: bigint;
    domains: [InsuranceDomainBudget, InsuranceDomainBudget];
    /**
     * The wrapper tag-41 terminal capacity for this asset's insurance authority:
     * min(Σ domain withdrawCapacity, globalAvailable, vault). Assumes no OTHER asset shares the
     * same insurance_authority (true for a stake-bound single-asset market). Send this as the
     * tag-29 `amount`; a larger value fails wrapper 21.
     */
    terminalCapacity: bigint;
}
/**
 * Decode the tag-41 terminal insurance capacity for asset `assetIndex`'s insurance authority
 * from a raw v18 market account. On a stake-bound market call it with asset 0: the result's
 * `terminalCapacity` is the tag-29 `amount` for {@link planStakeWindDown} step (b).
 *
 * @param marketData  Raw wrapper market account bytes (kind 1).
 * @param assetIndex  Asset slot (default 0).
 * @returns Budgets per domain, the header aggregates and the terminal capacity.
 * @throws If the account is not a market or is too short for the asset.
 * @example
 * ```ts
 * const cap = decodeTerminalInsuranceCapacity(marketInfo.data, 0);
 * if (cap.resolved && cap.terminalCapacity > 0n) amount = cap.terminalCapacity;
 * ```
 */
declare function decodeTerminalInsuranceCapacity(marketData: Uint8Array, assetIndex?: number): TerminalInsuranceCapacity;
/**
 * Build stake tag 29 RecoverTerminalInsurance.
 *
 * @param a       Stake program id + named accounts (`stray` optional).
 * @param amount  Atoms (use {@link decodeTerminalInsuranceCapacity}`.terminalCapacity`), or 0 to book/sweep only.
 * @returns TransactionInstruction (no signer required).
 * @example
 * ```ts
 * const ix = buildRecoverTerminalInsuranceIx({ stakeProgram, caller, pool, poolVault, vaultAuth, market,
 *   wrapperVault, wrapperVaultAuthority, wrapperProgram }, cap.terminalCapacity);
 * ```
 */
declare function buildRecoverTerminalInsuranceIx(a: RecoverTerminalInsuranceAccounts & {
    stakeProgram: PublicKey;
}, amount: bigint): TransactionInstruction;
/**
 * Build stake tag 30 AdminCloseSlab (signed by `pool.admin`). `poolDestToken` must already exist
 * (a pool-mint token account owned by the pool PDA).
 *
 * @param a  Stake program id + named accounts.
 * @returns TransactionInstruction.
 * @example
 * ```ts
 * const ix = buildAdminCloseSlabIx({ stakeProgram, admin, pool, market, wrapperVault, wrapperVaultAuthority,
 *   poolDestToken, collateralMint, poolVault, wrapperProgram });
 * ```
 */
declare function buildAdminCloseSlabIx(a: AdminCloseSlabAccounts & {
    stakeProgram: PublicKey;
}): TransactionInstruction;
/** One planned step. `onCustomError` maps a Custom(code) result to what the caller should do. */
type StakeWindDownStep = {
    step: "closePortfolios";
    ixs: TransactionInstruction[];
} | {
    step: "recoverTerminal";
    ix: TransactionInstruction;
    amount: bigint;
    onCustomError: Readonly<Record<number, "retryLater" | "done">>;
} | {
    step: "recoverTerminalBookOnly";
    ix: TransactionInstruction;
    onCustomError: Readonly<Record<number, "retryLater" | "done">>;
} | {
    step: "adminCloseSlab";
    ix: TransactionInstruction;
    /** Re-send `ix` while the market account is not a tombstone (`isClosedMarketTombstone`). */
    repeatUntil: "tombstone";
    /** Send before each repeat when a protocol fee is owed again (P1 re-books fee legs). */
    claimBetween: TransactionInstruction | null;
};
/** Inputs for {@link planStakeWindDown}. */
interface StakeWindDownArgs {
    stakeProgram: PublicKey;
    wrapperProgram: PublicKey;
    /** Keeper (tag 29 caller; no signature needed). */
    caller: PublicKey;
    /** `pool.admin` (tag 30 signer). */
    admin: PublicKey;
    pool: PublicKey;
    poolVault: PublicKey;
    vaultAuth: PublicKey;
    market: PublicKey;
    /** Raw market account bytes, read just before planning. */
    marketData: Uint8Array;
    wrapperVault: PublicKey;
    poolDestToken: PublicKey;
    collateralMint: PublicKey;
    /** Step (a): caller-built portfolio close-out instructions (may be empty). */
    closePortfolioIxs: TransactionInstruction[];
    /** Optional stray vault_auth-owned token account to sweep in the book-only step. */
    stray?: PublicKey;
    /** If set, a tag-84 WithdrawProtocolFee(amount 0 = all) claim is planned between tag-30 repeats. */
    protocolFee?: {
        authority: PublicKey;
        destToken: PublicKey;
        authorityEpoch: bigint;
    };
    tokenProgram?: PublicKey;
}
/**
 * Plan the F-9 wind-down of a stake-bound market once it is Resolved:
 *   (a) close portfolios (caller-supplied);
 *   (b) tag 29 with amount = asset-0 terminal capacity (skipped when 0) — wrapper 21 → retry later;
 *   (c) tag 29 with amount 0 (+ optional stray) — stake 31 NothingToRecover → done;
 *   (d) tag 30, repeated while the market is not a tombstone, with a tag-84 claim in between
 *       when protocol legs were re-booked.
 *
 * @param a  Accounts, market bytes and optional protocol-fee claim inputs.
 * @returns Ordered steps.
 * @throws If the market is not Resolved (tag 29 amount>0 and tag 30 would fail 30 MarketNotTerminal).
 * @example
 * ```ts
 * for (const s of planStakeWindDown(args)) { ... }
 * ```
 */
declare function planStakeWindDown(a: StakeWindDownArgs): StakeWindDownStep[];

interface BuildIxParams {
    programId: PublicKey;
    keys: AccountMeta$1[];
    data: Uint8Array | Buffer;
}
/**
 * Build a transaction instruction.
 */
declare function buildIx(params: BuildIxParams): TransactionInstruction;
interface TxResult {
    signature: string;
    slot: number;
    err: string | null;
    hint?: string;
    logs: string[];
    unitsConsumed?: number;
}
interface SimulateOrSendParams {
    connection: Connection;
    ix: TransactionInstruction;
    signers: Keypair[];
    simulate: boolean;
    commitment?: Commitment;
    computeUnitLimit?: number;
    /**
     * Heap frame to request, in bytes (Compute Budget). The v17 wrapper installs a 128 KB
     * BumpAllocator and makes its FIRST heap allocation near heap_base+128KB on every
     * instruction, so EVERY transaction touching the wrapper MUST request a 128 KB heap frame
     * or it aborts on-chain with ProgramFailedToComplete / "Access violation in heap section"
     * (#176). Defaults to 128 KB so wrapper txs work out of the box; pass 0 to omit. Must be a
     * multiple of 1024 in [32768, 262144].
     */
    heapFrameBytes?: number;
}
/**
 * The v17 wrapper's installed heap-frame size. EVERY transaction that touches the wrapper
 * MUST request this much heap or it aborts on-chain (#176). Default for `heapFrameBytes`.
 */
declare const V17_WRAPPER_HEAP_FRAME_BYTES: number;
declare function simulateOrSend(params: SimulateOrSendParams): Promise<TxResult>;
/**
 * Format transaction result for output.
 */
declare function formatResult(result: TxResult, jsonMode: boolean): string;

/**
 * @module lighthouse
 * Lighthouse v2 (Blowfish / Phantom wallet middleware) detection and mitigation.
 *
 * Lighthouse (program L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95) is an Anchor-based
 * wallet guard injected by Phantom and other Solana wallets via the Blowfish transaction
 * scanning service. It adds assertion instructions to transactions that verify account
 * state expectations (e.g., "this account should be empty" or "this account should have
 * X lamports").
 *
 * **Problem:** Lighthouse doesn't understand Percolator's slab accounts. When a slab
 * (e.g., ESa89R5 with 323,312 bytes) is passed as a TradeCpi account, Lighthouse injects
 * an assertion like `StateInvalidAddress` that expects `data_len == 0` (uninitialised).
 * The slab IS initialised, so the assertion fails with error 0x1900 (Anchor ConstraintAddress
 * = 6400 decimal). This causes the transaction to revert even though the Percolator program
 * logic is correct.
 *
 * **Solution:** The SDK provides utilities to:
 * 1. Detect Lighthouse instructions in a transaction
 * 2. Strip them before sending
 * 3. Classify 0x1900 errors as Lighthouse (not Percolator) errors
 * 4. Provide clear, actionable error messages for end users
 *
 * @example
 * ```ts
 * import { isLighthouseError, stripLighthouseInstructions, LIGHTHOUSE_PROGRAM_ID } from "@percolator/sdk";
 *
 * // Before sending: strip injected Lighthouse IXs
 * const cleanIxs = stripLighthouseInstructions(instructions);
 *
 * // After error: classify and give user-friendly message
 * if (isLighthouseError(error)) {
 *   console.warn("Wallet middleware blocked the transaction");
 * }
 * ```
 */

/**
 * Lighthouse v2 program ID (Blowfish/Phantom wallet guard).
 *
 * This is an immutable Anchor program deployed at slot 294,179,293.
 * Wallets like Phantom inject instructions from this program into user
 * transactions to enforce Blowfish security assertions.
 */
declare const LIGHTHOUSE_PROGRAM_ID: PublicKey;
/** Base58 string form for fast comparison without PublicKey instantiation. */
declare const LIGHTHOUSE_PROGRAM_ID_STR = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
/**
 * Anchor error code for ConstraintAddress (0x1900 = 6400 decimal).
 * This is NOT a Percolator error — it comes from Lighthouse's Anchor framework
 * when an account constraint check fails.
 */
declare const LIGHTHOUSE_CONSTRAINT_ADDRESS = 6400;
/**
 * Known Lighthouse/Anchor error codes that may appear in transaction logs.
 * All are in the Anchor error range (0x1770–0x1900+).
 */
declare const LIGHTHOUSE_ERROR_CODES: Set<6400 | 6000 | 6001 | 6002 | 6003 | 6016 | 6032 | 6033 | 6034 | 6035 | 6036 | 6037 | 6038 | 6039 | 6040 | 6041 | 6042 | 6043>;
/**
 * Check if a TransactionInstruction is from the Lighthouse program.
 *
 * @param ix - A Solana transaction instruction.
 * @returns `true` if the instruction's programId is Lighthouse.
 *
 * @example
 * ```ts
 * const hasLighthouse = instructions.some(isLighthouseInstruction);
 * ```
 */
declare function isLighthouseInstruction(ix: TransactionInstruction): boolean;
/**
 * Check if an error message or error object indicates a Lighthouse assertion failure.
 *
 * Detects:
 * - `custom program error: 0x1900` (Anchor ConstraintAddress from Lighthouse)
 * - References to the Lighthouse program ID in error text
 * - `"Custom": 6400` in JSON-encoded InstructionError
 * - Any Anchor error code in the LIGHTHOUSE_ERROR_CODES range when the
 *   failing program is Lighthouse (identified by program ID in logs)
 *
 * @param error - An Error object, error message string, or transaction logs array.
 * @returns `true` if the error appears to originate from Lighthouse, not Percolator.
 *
 * @example
 * ```ts
 * try {
 *   await sendTransaction(tx);
 * } catch (e) {
 *   if (isLighthouseError(e)) {
 *     // Retry with skipPreflight or notify user about wallet middleware
 *   }
 * }
 * ```
 */
declare function isLighthouseError(error: unknown): boolean;
/**
 * Check if transaction logs contain evidence of a Lighthouse failure.
 *
 * More precise than `isLighthouseError` on a string — examines the program
 * invocation chain to confirm the error originates from Lighthouse, not from
 * a Percolator instruction that happens to return a similar code.
 *
 * @param logs - Array of transaction log lines from `getTransaction()`.
 * @returns `true` if logs show a Lighthouse program failure.
 */
declare function isLighthouseFailureInLogs(logs: string[]): boolean;
/**
 * Remove all Lighthouse assertion instructions from an instruction array.
 *
 * Call this before building a Transaction to prevent Lighthouse assertion
 * failures. Safe to call even if no Lighthouse instructions are present.
 *
 * @param instructions - Array of transaction instructions.
 * @returns Filtered array with Lighthouse instructions removed.
 *
 * @example
 * ```ts
 * import { stripLighthouseInstructions } from "@percolator/sdk";
 *
 * const instructions = [crankIx, tradeIx]; // May have Lighthouse IXs mixed in
 * const clean = stripLighthouseInstructions(instructions);
 * const tx = new Transaction().add(...clean);
 * ```
 */
declare function stripLighthouseInstructions(instructions: TransactionInstruction[], percolatorProgramId?: PublicKey): TransactionInstruction[];
/**
 * Strip Lighthouse instructions from an already-built Transaction.
 *
 * Creates a new Transaction with the same recentBlockhash and feePayer
 * but without any Lighthouse instructions. The returned transaction is
 * unsigned and must be re-signed.
 *
 * @param transaction - A Transaction (signed or unsigned).
 * @returns A new Transaction without Lighthouse instructions, or the same
 *          transaction if no Lighthouse instructions were found.
 *
 * @example
 * ```ts
 * const signed = await wallet.signTransaction(tx);
 * if (hasLighthouseInstructions(signed)) {
 *   const clean = stripLighthouseFromTransaction(signed);
 *   const reSigned = await wallet.signTransaction(clean);
 *   await connection.sendRawTransaction(reSigned.serialize());
 * }
 * ```
 */
declare function stripLighthouseFromTransaction(transaction: Transaction, percolatorProgramId?: PublicKey): Transaction;
/**
 * Count Lighthouse instructions in an instruction array or transaction.
 *
 * @param ixsOrTx - Array of instructions or a Transaction.
 * @returns Number of Lighthouse instructions found.
 */
declare function countLighthouseInstructions(ixsOrTx: TransactionInstruction[] | Transaction): number;
/**
 * User-friendly error message for Lighthouse assertion failures.
 *
 * Suitable for display in UI toast/modal when `isLighthouseError()` returns true.
 */
declare const LIGHTHOUSE_USER_MESSAGE: string;
/**
 * Classify an error and return an appropriate user-facing message.
 *
 * If the error is from Lighthouse, returns the Lighthouse-specific message.
 * Otherwise returns `null` (callers should use their own error display).
 *
 * @param error - An Error, string, or logs array.
 * @returns User-facing message string, or `null` if not a Lighthouse error.
 */
declare function classifyLighthouseError(error: unknown): string | null;

/**
 * Coin-margined perpetual trade math utilities.
 *
 * On-chain PnL formula:
 *   mark_pnl = (oracle - entry) * abs_pos / oracle   (longs)
 *   mark_pnl = (entry - oracle) * abs_pos / oracle   (shorts)
 *
 * All prices are in e6 format (1 USD = 1_000_000).
 * All token amounts are in native units (e.g. lamports).
 */
/**
 * Compute mark-to-market PnL for an open position.
 */
declare function computeMarkPnl(positionSize: bigint, entryPrice: bigint, oraclePrice: bigint): bigint;
/**
 * Compute liquidation price given entry, capital, position and maintenance margin.
 * Uses pure BigInt arithmetic for precision (no Number() truncation).
 */
declare function computeLiqPrice(entryPrice: bigint, capital: bigint, positionSize: bigint, maintenanceMarginBps: bigint): bigint;
/**
 * Compute estimated liquidation price BEFORE opening a trade.
 * Accounts for trading fees reducing effective capital.
 */
declare function computePreTradeLiqPrice(oracleE6: bigint, margin: bigint, posSize: bigint, maintBps: bigint, feeBps: bigint, direction: "long" | "short"): bigint;
/**
 * Compute trading fee from notional value and fee rate in bps.
 */
declare function computeTradingFee(notional: bigint, tradingFeeBps: bigint): bigint;
/**
 * Dynamic fee tier configuration.
 */
interface FeeTierConfig {
    /** Base trading fee (Tier 1) in bps */
    baseBps: bigint;
    /** Tier 2 fee in bps (0 = disabled) */
    tier2Bps: bigint;
    /** Tier 3 fee in bps (0 = disabled) */
    tier3Bps: bigint;
    /** Notional threshold to enter Tier 2 (0 = tiered fees disabled) */
    tier2Threshold: bigint;
    /** Notional threshold to enter Tier 3 */
    tier3Threshold: bigint;
}
/**
 * Compute the effective fee rate in bps using the tiered fee schedule.
 *
 * Mirrors on-chain `compute_dynamic_fee_bps` logic:
 * - notional < tier2Threshold → baseBps (Tier 1)
 * - notional < tier3Threshold → tier2Bps (Tier 2)
 * - notional >= tier3Threshold → tier3Bps (Tier 3)
 *
 * If tier2Threshold == 0, tiered fees are disabled (flat baseBps).
 */
declare function computeDynamicFeeBps(notional: bigint, config: FeeTierConfig): bigint;
/**
 * Compute the dynamic trading fee for a given notional and tier config.
 *
 * Uses ceiling division to match on-chain behavior (prevents fee evasion
 * via micro-trades).
 */
declare function computeDynamicTradingFee(notional: bigint, config: FeeTierConfig): bigint;
/**
 * Fee split configuration.
 */
interface FeeSplitConfig {
    /** LP vault share in bps (0–10_000) */
    lpBps: bigint;
    /** Protocol treasury share in bps */
    protocolBps: bigint;
    /** Market creator share in bps */
    creatorBps: bigint;
}
/**
 * Compute fee split for a total fee amount.
 *
 * Returns [lpShare, protocolShare, creatorShare].
 * If all split params are 0, 100% goes to LP (legacy behavior).
 * Creator gets the rounding remainder to ensure total is preserved.
 */
declare function computeFeeSplit(totalFee: bigint, config: FeeSplitConfig): [bigint, bigint, bigint];
/**
 * Compute PnL as a percentage of capital.
 *
 * Uses BigInt scaling to avoid precision loss from Number(bigint) conversion.
 * Number(bigint) silently truncates values above 2^53, which can produce
 * incorrect percentages for large positions (e.g., tokens with 9 decimals
 * where capital > ~9M tokens in native units exceeds MAX_SAFE_INTEGER).
 */
declare function computePnlPercent(pnlTokens: bigint, capital: bigint): number;
/**
 * Estimate entry price including fee impact (slippage approximation).
 */
declare function computeEstimatedEntryPrice(oracleE6: bigint, tradingFeeBps: bigint, direction: "long" | "short"): bigint;
/**
 * Convert per-slot funding rate (bps) to annualized percentage.
 */
declare function computeFundingRateAnnualized(fundingRateBpsPerSlot: bigint): number;
/**
 * Compute margin required for a given notional and initial margin bps.
 */
declare function computeRequiredMargin(notional: bigint, initialMarginBps: bigint): bigint;
/**
 * Compute maximum leverage from initial margin bps, as an exact ratio.
 *
 * DISPLAY value: the result is fractional and therefore NOT safe to pass to
 * `BigInt()`. Any caller doing integer/native-unit arithmetic must use
 * {@link computeMaxLeverageFloor} instead.
 *
 * @throws Error if initialMarginBps is zero (infinite leverage is undefined)
 */
declare function computeMaxLeverage(initialMarginBps: bigint): number;
/**
 * Compute maximum leverage from initial margin bps, floored to a whole
 * multiplier — the conservative integer form used by risk/sizing math.
 *
 * Kept separate from {@link computeMaxLeverage} because that one is a display
 * value and may be fractional: `BigInt(3.3333)` throws `RangeError`. Rounding
 * DOWN also keeps client-side caps at or below what the program enforces, so a
 * caller can never build a position the chain would reject on leverage.
 *
 * @throws Error if initialMarginBps is zero (infinite leverage is undefined)
 */
declare function computeMaxLeverageFloor(initialMarginBps: bigint): bigint;

/**
 * Warmup leverage cap utilities.
 *
 * During the market warmup period, capital is released linearly over
 * `warmupPeriodSlots` slots, which constrains the effective leverage
 * and maximum position size available to traders.
 */
/**
 * Compute unlocked capital during the warmup period.
 *
 * Capital is released linearly over `warmupPeriodSlots` slots starting from
 * `warmupStartedAtSlot`. Before warmup starts (startSlot === 0) or if the
 * warmup period is 0, all capital is considered unlocked.
 *
 * @param totalCapital    - Total deposited capital (native units).
 * @param currentSlot     - The current on-chain slot.
 * @param warmupStartSlot - Slot at which warmup started (0 = not started).
 * @param warmupPeriodSlots - Total slots in the warmup period.
 * @returns The amount of capital currently unlocked.
 */
declare function computeWarmupUnlockedCapital(totalCapital: bigint, currentSlot: bigint, warmupStartSlot: bigint, warmupPeriodSlots: bigint): bigint;
/**
 * Compute the effective maximum leverage during the warmup period.
 *
 * During warmup, only unlocked capital can be used as margin. The effective
 * leverage relative to *total* capital is therefore capped at:
 *
 *   effectiveMaxLeverage = maxLeverage × (unlockedCapital / totalCapital)
 *
 * This returns a floored integer value (leverage is always a whole number
 * in the UI), with a minimum of 1x if any capital is unlocked.
 *
 * @param initialMarginBps   - Initial margin requirement in basis points.
 * @param totalCapital       - Total deposited capital (native units).
 * @param currentSlot        - The current on-chain slot.
 * @param warmupStartSlot    - Slot at which warmup started (0 = not started).
 * @param warmupPeriodSlots  - Total slots in the warmup period.
 * @returns The effective maximum leverage (integer, ≥ 1).
 */
declare function computeWarmupLeverageCap(initialMarginBps: bigint, totalCapital: bigint, currentSlot: bigint, warmupStartSlot: bigint, warmupPeriodSlots: bigint): number;
/**
 * Compute the maximum position size allowed during warmup.
 *
 * This is the unlocked capital multiplied by the base max leverage.
 * Unlike `computeWarmupLeverageCap` (which gives effective leverage
 * relative to total capital), this gives the absolute notional cap.
 *
 * @param initialMarginBps   - Initial margin requirement in basis points.
 * @param totalCapital       - Total deposited capital (native units).
 * @param currentSlot        - The current on-chain slot.
 * @param warmupStartSlot    - Slot at which warmup started (0 = not started).
 * @param warmupPeriodSlots  - Total slots in the warmup period.
 * @returns Maximum position size in native units.
 */
declare function computeWarmupMaxPositionSize(initialMarginBps: bigint, totalCapital: bigint, currentSlot: bigint, warmupStartSlot: bigint, warmupPeriodSlots: bigint): bigint;

/**
 * Input validation utilities for CLI commands.
 * Provides descriptive error messages for invalid input.
 */

declare class ValidationError extends Error {
    readonly field: string;
    constructor(field: string, message: string);
}
/**
 * Non-empty trimmed string of decimal digits only: `"0"` or `[1-9]\\d*` (no leading zeros
 * except a single zero). Rejects fractions, scientific notation, hex prefixes, and trailing junk.
 *
 * @param value - The string to validate.
 * @param field - The field name used in error messages.
 * @returns The trimmed, validated decimal string.
 */
declare function requireDecimalUIntString(value: string, field: string): string;
/**
 * Parse a decimal integer string into a BigInt, rejecting any non-decimal representation
 * (hex, scientific notation, underscores, fractions, leading zeros).
 *
 * Use this instead of the bare `BigInt(val)` cast when the input is user-supplied or
 * externally-sourced, to prevent silent acceptance of `"0x1"`, `"1e5"`, `"1_000"` etc.
 *
 * @param val - The string to parse. May be negative (e.g. `"-42"`).
 * @param caller - The calling function name, used in the error message.
 * @returns The parsed BigInt value.
 * @throws {Error} When `val` does not match the strict decimal integer format.
 *
 * @example
 * safeBigInt("123", "encU64")          // 123n
 * safeBigInt("-9223372036854775808", "encI64")  // i64 min
 * safeBigInt("0x1", "encU64")          // throws
 * safeBigInt("1e5", "encU128")         // throws
 */
declare function safeBigInt(val: string, caller: string): bigint;
/**
 * Validate a public key string.
 */
declare function validatePublicKey(value: string, field: string): PublicKey;
/**
 * Validate a non-negative integer index (u16 range for accounts).
 */
declare function validateIndex(value: string, field: string): number;
/**
 * Validate a non-negative amount (u64 range).
 */
declare function validateAmount(value: string, field: string): bigint;
/**
 * Validate a u128 value.
 */
declare function validateU128(value: string, field: string): bigint;
/**
 * Validate an i64 value.
 */
declare function validateI64(value: string, field: string): bigint;
/**
 * Validate an i128 value (trade sizes).
 */
declare function validateI128(value: string, field: string): bigint;
/**
 * Validate a basis points value (0-10000).
 */
declare function validateBps(value: string, field: string): number;
/**
 * Validate a u64 value.
 */
declare function validateU64(value: string, field: string): bigint;
/**
 * Validate a u16 value.
 */
declare function validateU16(value: string, field: string): number;

/**
 * Smart Price Router — automatic oracle selection for any token.
 *
 * Given a token mint, discovers all available price sources (DexScreener, Pyth, Jupiter),
 * ranks them by liquidity/reliability, and returns the best oracle config.
 */
type PriceSourceType = "pyth" | "dex" | "jupiter";
interface PriceSource {
    type: PriceSourceType;
    /** Pool address (dex), Pyth feed ID (pyth), or mint (jupiter) */
    address: string;
    /** DEX id for dex sources */
    dexId?: string;
    /** Pair label e.g. "SOL / USDC" */
    pairLabel?: string;
    /** USD liquidity depth — higher is better */
    liquidity: number;
    /** Latest spot price in USD */
    price: number;
    /** Confidence score 0-100 (composite of liquidity, staleness, reliability) */
    confidence: number;
}
interface PriceRouterResult {
    mint: string;
    bestSource: PriceSource | null;
    allSources: PriceSource[];
    /** ISO timestamp of resolution */
    resolvedAt: string;
}
/** Options for {@link resolvePrice}. */
interface ResolvePriceOptions {
    timeoutMs?: number;
}
declare const PYTH_SOLANA_FEEDS: Record<string, {
    symbol: string;
    mint: string;
}>;
declare function resolvePrice(mint: string, signal?: AbortSignal, options?: ResolvePriceOptions): Promise<PriceRouterResult>;

export { ACCOUNTS_ACCEPT_ADMIN, ACCOUNTS_ADMIN_FORCE_CLOSE, ACCOUNTS_ADVANCE_ORACLE_PHASE, ACCOUNTS_ATTEST_CROSS_MARGIN, ACCOUNTS_AUDIT_CRANK, ACCOUNTS_BURN_POSITION_NFT, ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL, ACCOUNTS_CHALLENGE_SETTLEMENT, ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL, ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP, ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP_UNSIGNED, ACCOUNTS_CLEAR_PENDING_SETTLEMENT, ACCOUNTS_CLOSE_ACCOUNT, ACCOUNTS_CLOSE_ORPHAN_SLAB, ACCOUNTS_CLOSE_RESOLVED, ACCOUNTS_CLOSE_RESOLVED_UNSIGNED, ACCOUNTS_CLOSE_SLAB, ACCOUNTS_CLOSE_SLAB_SECONDARY, ACCOUNTS_CLOSE_STALE_SLABS, ACCOUNTS_CONFIGURE_AUTH_MARK, ACCOUNTS_CONFIGURE_EWMA_MARK, ACCOUNTS_CONFIGURE_HYBRID_ORACLE, ACCOUNTS_CONVERT_RELEASED_PNL, ACCOUNTS_CREATE_INSURANCE_MINT, ACCOUNTS_CREATE_LP_VAULT, ACCOUNTS_DEPOSIT_COLLATERAL, ACCOUNTS_DEPOSIT_FEE_CREDITS, ACCOUNTS_DEPOSIT_INSURANCE_LP, ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3, ACCOUNTS_DEPOSIT_LP_COLLATERAL, ACCOUNTS_EXECUTE_ADL, ACCOUNTS_EXPIRE_BACKING_BUCKET, ACCOUNTS_FORCE_CLOSE_RESOLVED, ACCOUNTS_FUND_MARKET_INSURANCE, ACCOUNTS_INIT_LP, ACCOUNTS_INIT_MARKET, ACCOUNTS_INIT_MATCHER_CTX, ACCOUNTS_INIT_USER, ACCOUNTS_INIT_VAULT_LP_P3, ACCOUNTS_KEEPER_CRANK, ACCOUNTS_LIQUIDATE_AT_ORACLE, ACCOUNTS_LP_VAULT_CRANK_FEES, ACCOUNTS_LP_VAULT_DEPOSIT, ACCOUNTS_LP_VAULT_WITHDRAW, ACCOUNTS_MINT_POSITION_NFT, ACCOUNTS_NFT_BURN, ACCOUNTS_NFT_EMERGENCY_BURN, ACCOUNTS_NFT_ESCROW_PROOF, ACCOUNTS_NFT_HOLDER_AUTH, ACCOUNTS_NFT_MINT, ACCOUNTS_NFT_RECONCILE, ACCOUNTS_PAUSE_MARKET, ACCOUNTS_PERMISSIONLESS_CRANK_BASE, ACCOUNTS_PUSH_AUTH_MARK, ACCOUNTS_PUSH_EWMA_MARK, ACCOUNTS_QUEUE_WITHDRAWAL, ACCOUNTS_REBALANCE_LP_VAULT_BACKING, ACCOUNTS_REBALANCE_REDUCE, ACCOUNTS_RECLAIM_EMPTY_ACCOUNT, ACCOUNTS_RECLAIM_SLAB_RENT, ACCOUNTS_RESCUE_ORPHAN_VAULT, ACCOUNTS_RESOLVE_DISPUTE, ACCOUNTS_RESOLVE_MARKET, ACCOUNTS_RESOLVE_PERMISSIONLESS, ACCOUNTS_RESTART_ASSET_ORACLE, ACCOUNTS_SETTLE_ACCOUNT, ACCOUNTS_SET_ASSET_RISK_LIMITS_P1, ACCOUNTS_SET_DEX_POOL, ACCOUNTS_SET_DISPUTE_PARAMS, ACCOUNTS_SET_INSURANCE_ISOLATION, ACCOUNTS_SET_INSURANCE_WITHDRAW_POLICY, ACCOUNTS_SET_LP_COLLATERAL_PARAMS, ACCOUNTS_SET_MAINTENANCE_FEE, ACCOUNTS_SET_MATCHER_CONFIG, ACCOUNTS_SET_MAX_PNL_CAP, ACCOUNTS_SET_OFFSET_PAIR, ACCOUNTS_SET_OI_CAP_MULTIPLIER, ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK, ACCOUNTS_SET_ORACLE_PRICE_CAP, ACCOUNTS_SET_PENDING_SETTLEMENT, ACCOUNTS_SET_PROTOCOL_FEE_AUTHORITY, ACCOUNTS_SET_RISK_THRESHOLD, ACCOUNTS_SET_VAULT_LP_RISK_P3, ACCOUNTS_SET_WALLET_CAP, ACCOUNTS_TOPUP_INSURANCE, ACCOUNTS_TOP_UP_BACKING_BUCKET, ACCOUNTS_TRADE_CPI, ACCOUNTS_TRADE_NOCPI, ACCOUNTS_TRANSFER_OWNERSHIP_CPI, ACCOUNTS_TRANSFER_POSITION_OWNERSHIP, ACCOUNTS_UNPAUSE_MARKET, ACCOUNTS_UPDATE_ADMIN, ACCOUNTS_UPDATE_AUTHORITY, ACCOUNTS_UPDATE_BACKING_FEE_POLICY, ACCOUNTS_UPDATE_CONFIG, ACCOUNTS_UPDATE_FEE_SPLIT, ACCOUNTS_UPDATE_HYPERP_MARK, ACCOUNTS_UPDATE_MAINTENANCE_FEE_PER_SLOT, ACCOUNTS_UPDATE_TRADE_FEE_POLICY, ACCOUNTS_VAULT_LP_CONVERT_PNL_P3, ACCOUNTS_VAULT_LP_RECALL_P3, ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3, ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3, ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3, ACCOUNTS_VAULT_LP_SET_MATCHER_P3, ACCOUNTS_WITHDRAW_BACKING_BUCKET, ACCOUNTS_WITHDRAW_BACKING_BUCKET_EARNINGS, ACCOUNTS_WITHDRAW_COLLATERAL, ACCOUNTS_WITHDRAW_CREATOR_FEE, ACCOUNTS_WITHDRAW_INSURANCE, ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE, ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED, ACCOUNTS_WITHDRAW_INSURANCE_LP, ACCOUNTS_WITHDRAW_INSURANCE_RESERVE_TO_STAKE, ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3, ACCOUNTS_WITHDRAW_LP_COLLATERAL, ACCOUNTS_WITHDRAW_PROTOCOL_FEE, ASSET_AUTH_KIND, ASSET_RISK_LIMITS_FIELD_OFF_P1, ASSET_RISK_LIMITS_LEN_P1, ASSET_RISK_LIMITS_SLOT_OFF_P1, ASSET_STATE_EFFECTIVE_PRICE_OFF_P3, ASSET_STATE_RAW_ORACLE_TARGET_PRICE_OFF_P3, ASSET_VAULT_LP_DRAW_LEN_P3, ASSET_VAULT_LP_DRAW_SLOT_OFF_P3, ASSET_VAULT_LP_FIELD_OFF_P3, ASSET_VAULT_LP_FLAG_BOUND_P3, ASSET_VAULT_LP_LEN_P3, ASSET_VAULT_LP_SLOT_OFF_P3, ASSOCIATED_TOKEN_PROGRAM_ID, type Account, AccountKind, type AccountSpec, type AdlApiRanking, type AdlApiResult, type AdlEvent, type AdlRankedPosition, type AdlRankingResult, type AdlSide, type AdminCloseSlabAccounts, type AdminForceCloseArgs, type AdminResolveMarketCpiAccounts, type AllocateMarketArgs, type ApiMarketEntry, type AssetAuthKind, type AssetControlSequencesV17, type AssetOracleProfileV17, type AssetRiskLimitsP1, type AssetVaultLpDrawP3, type AssetVaultLpP3, BOUND_VAULT_LP_LEDGER_SLOTS_P3, BOUND_VAULT_LP_TAIL_INDEX_P3, BPF_LOADER_UPGRADEABLE_ID_P3, type BackingBucketExpiryContext, type BackingBucketMarketState, BackingBucketStatus, type BackingBucketV17, type BackingPotTermsP3, type BatchTradeCpiArgs, type BatchTradeCpiLeg, type BatchTradeNoCpiArgs, type BatchTradeNoCpiLeg, type BindInsuranceAuthorityAccounts, type BoundVaultLpTailOptsP3, type BuildIxParams, type BurnAssetAdminAccounts, type BurnPositionNftArgs, CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3, CHAINLINK_ANSWER_OFFSET, CHAINLINK_DECIMALS_OFFSET, CHAINLINK_MIN_SIZE, CHAINLINK_TIMESTAMP_OFFSET, CRANK_OBSERVATION_DECODE_MAX, CREATOR_LOCK_SEED, CTX_RETURN_OFFSET, CTX_VAMM_LEN, CTX_VAMM_OFFSET, type ClearPendingSettlementArgs, type CloseAccountArgs, type CloseSlabAttemptArgs, type ConfigureAuthMarkArgs, type ConfigureEwmaMarkArgs, type ConfigureHybridOracleArgs, type ConvertReleasedPnlArgs, CrankAction, type CrankObservationHint, type CreateLpVaultArgs, type CureAndCancelCloseArgs, DEFAULT_OI_RAMP_SLOTS, type DepositCollateralArgs, type DepositFeeCreditsArgs, type DexPoolInfo, type DexType, type DiscoverMarketsOptions, type DiscoverMarketsViaApiOptions, type DiscoverMarketsViaStaticBundleOptions, type DiscoveredMarket, ENGINE_ASSET_SLOT_OFF_V18, ENGINE_BOUND_SCALE, ENGINE_MARK_PRICE_OFF, ENGINE_MAX_POSITION_ABS_Q_P3, ENGINE_OFF, EXPECTED_SLAB_VERSION, type EngineState, type ErrorInfo, type ExecuteAdlArgs, type ExpireBackingBucketArgs, FEE_SPLIT, type FeeSplitConfig, type FeeTierConfig, type ForfeitRecoveryLegArgs, type GetMarketsByAddressOptions, HEX_RE, INIT_CTX_LEN, INIT_MATCHER_CTX_V17_LEN, IX_TAG, IX_TAG_P1, IX_TAG_P3, type InitLPArgs, type InitMarketArgs, type InitMarketExtendedTail, type InitMarketV17Args, type InitMatcherCtxArgs, type InitSharedVaultArgs, type InitUserArgs, type InsuranceDomainBudget, type InsuranceFund, type KeeperCrankArgs, LIGHTHOUSE_CONSTRAINT_ADDRESS, LIGHTHOUSE_ERROR_CODES, LIGHTHOUSE_PROGRAM_ID, LIGHTHOUSE_PROGRAM_ID_STR, LIGHTHOUSE_USER_MESSAGE, LP_VAULT_MINIMUM_LIQUIDITY_P3, LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3, type LiquidateAtOracleArgs, type LpRedemptionV17, type LpVaultRegistryV17, type LpVaultWithdrawArgs, MARKET_GROUP_HEADER_OFF_V18, MARKET_MODE_V18, MARK_PRICE_EMA_ALPHA_E6, MARK_PRICE_EMA_WINDOW_SLOTS, MATCHER_BACKING_FEE_CAP_BPS_MAX, MATCHER_BATCH_HEADER_LEN, MATCHER_BATCH_LEG_LEN, MATCHER_CALL_EXT_FLAG, MATCHER_CALL_EXT_LEN, MATCHER_CALL_EXT_OFFSET, MATCHER_CALL_EXT_VERSION_V1, MATCHER_CALL_LEN, MATCHER_CONFIGURE_AUTH_LP_PDA, MATCHER_CONFIGURE_AUTH_OWNER_PROOF, MATCHER_CONFIGURE_HEADER_LP_PDA_LEN, MATCHER_CONFIGURE_HEADER_OWNER_PROOF_LEN, MATCHER_CONFIGURE_OP_BACKING_FEE_CAP, MATCHER_CONFIGURE_OP_SET_PARAMS, MATCHER_CONFIGURE_TAG, MATCHER_CONTEXT_LEN, MATCHER_EXT_MODE_V1_P1, MATCHER_KIND, MATCHER_MAGIC, MATCHER_REQUESTED_FEE_BPS_MAX, MATCHER_RETURN_FLAG_BACKING_FEE_CAP_MASK, MATCHER_RETURN_FLAG_BACKING_FEE_CAP_SHIFT, MATCHER_RETURN_FLAG_PARTIAL_OK, MATCHER_RETURN_FLAG_REJECTED, MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK, MATCHER_RETURN_FLAG_REQUESTED_FEE_SHIFT, MATCHER_RETURN_FLAG_VALID, MATCHER_RETURN_KNOWN_FLAGS, MATCHER_RETURN_KNOWN_FLAGS_V2, MATCHER_RETURN_LEN, MATCHER_SET_PARAMS_LEN, MATCHER_V2_BLOCK_ACCOUNT_OFFSET, MATCHER_V2_BLOCK_CTX_OFFSET, MATCHER_V2_BLOCK_LEN, MATCHER_V2_BLOCK_VERSION, MATCHER_V2_ERRORS, MATCHER_V2_FLAG_STALE_ALLOW_REDUCING, MATCHER_V2_MAX_IMPACT_K_BPS, MAX_BACKING_BUCKET_EXPIRY_SLOT, MAX_DECIMALS, MAX_EXEC_BAND_BPS_P1, MAX_INSURANCE_WITHDRAW_COOLDOWN_SLOTS, MAX_LP_EXPOSURE_K_BPS_P1, MAX_OI_SIDE_Q_P1, MAX_REQUESTED_FEE_BPS_P1, METEORA_DLMM_PROGRAM_ID, type MarketConfig, type MarketVaultAccounts, type MatcherBatchLeg, type MatcherCallExt, type MatcherConfigureIxArgs, type MatcherInitPassiveArgs, type MatcherKindValue, type MatcherOwnerProof, type MatcherReturn, type MatcherSetParams, type MatcherV2Config, type MintPositionNftArgs, NFT_IX_TAG, NFT_PROGRAM_ID, type Network, ORACLE_PHASE_GROWING, ORACLE_PHASE_MATURE, ORACLE_PHASE_NASCENT, type OpenResolvedReceiptP3, type OraclePrice, PERCOLATOR_ERRORS, PERCOLATOR_VAULT_TOKEN_PROGRAM_ID, PHASE1_MIN_SLOTS, PHASE1_VOLUME_MIN_SLOTS, PHASE2_MATURITY_SLOTS, PHASE2_VOLUME_THRESHOLD, POSITION_NFT_STATE_LEN, POS_SCALE_P3, PROGRAM_IDS, PROGRAM_IDS_V17, PROGRAM_ID_V17, PUBLIC_B_CHUNK_ATOMS_UNLIMITED, PUMPSWAP_PROGRAM_ID, PYTH_PUSH_ORACLE_PROGRAM_ID, PYTH_RECEIVER_PROGRAM_ID, PYTH_SOLANA_FEEDS, type ParseBackingBucketsOptions, type ParseChainlinkOptions, type PermissionlessCrankArgs, type PortfolioLegV17, type PortfolioSourceDomainV17, type PortfolioV17, type PositionNftState, type PriceRouterResult, type PriceSource, type PriceSourceType, type PushAuthMarkArgs, type PushEwmaMarkArgs, type QueueWithdrawalSVArgs, RAMP_START_BPS, RAYDIUM_CLMM_PROGRAM_ID, RECOMMENDED_CU_P3, RENOUNCE_ADMIN_CONFIRMATION, RESOLVED_RECEIPT_ACCOUNT_OFF_P3, RESOLVED_RECEIPT_LEN_P3, RESOLVE_MODE_DEGENERATE, RESOLVE_MODE_ORDINARY, type RebalanceReduceArgs, type RebalanceReduceIxArgs, type ReceiptRevisitStepP3, type ReclaimEmptyAccountArgs, type RecoverFlushedInsuranceAccounts, type RecoverTerminalInsuranceAccounts, type ReserveCohortBytes, type ResolveMode, type ResolvePriceOptions, type ResolvedPayoutReceiptP3, type ResolvedVaultLpExitArgsP3, type RestartAssetOracleArgs, type RetryConfig, type RiskParams, type RotateInsuranceAccounts, type RpcEndpointConfig, type RpcHealthResult, RpcPool, type RpcPoolConfig, SLAB_MAGIC, SLAB_TIERS, SLAB_TIERS_V0, SLAB_TIERS_V1, SLAB_TIERS_V12_1, SLAB_TIERS_V12_15, SLAB_TIERS_V12_17, SLAB_TIERS_V12_19, SLAB_TIERS_V1D, SLAB_TIERS_V1D_LEGACY, SLAB_TIERS_V1M, SLAB_TIERS_V1M2, SLAB_TIERS_V2, SLAB_TIERS_V_ADL, SLAB_TIERS_V_ADL_DISCOVERY, SLAB_TIERS_V_SETDEXPOOL, SPL_MINT_DECIMALS_OFFSET, STAKE_DEPOSIT_DISCRIMINATOR, STAKE_DEPOSIT_SIZE, STAKE_ERRORS, STAKE_IX, STAKE_POOL_CURRENT_VERSION, STAKE_POOL_DISCRIMINATOR, STAKE_POOL_SIZE, STAKE_POOL_SIZE_V1, STAKE_POOL_SIZE_V2, STAKE_POOL_SIZE_V3, STAKE_POOL_SIZE_V4, STAKE_PROGRAM_ID, STAKE_PROGRAM_IDS, type SelectionStrategy, type SetAssetRiskLimitsArgsP1, type SetDisputeParamsArgs, type SetInsuranceWithdrawPolicyArgs, type SetLpCollateralParamsArgs, type SetMaintenanceFeeArgs, type SetMatcherConfigArgs, type SetMaxPnlCapArgs, type SetNftProgramIdArgs, type SetOiCapMultiplierArgs, type SetOraclePriceCapArgs, type SetPendingSettlementArgs, type SetProtocolFeeAuthorityArgs, type SetPythOracleArgs, type SetRiskThresholdArgs, type SetVaultLpRiskArgsP3, type SetWalletCapArgs, type SettleAccountArgs, type SimulateOrSendParams, type SlabHeader, type SlabLayout, type SlabTierKey, type StakeAccounts, type StakeDepositState, type StakeGroupAProxyAccounts, type StakeGroupBProxyAccounts, type StakePoolState, type StakeWindDownArgs, type StakeWindDownStep, type StaticMarketEntry, type SwapSecondaryForPrimaryArgs, TOKEN_2022_PROGRAM_ID, type TerminalInsuranceCapacity, type TopUpBackingBucketArgs, type TopUpInsuranceArgs, type TopUpInsuranceDomainArgs, type TradeCpiArgs, type TradeCpiV2Args, type TradeNoCpiArgs, type TransferOwnershipCpiArgs, type TransferPortfolioOwnershipArgs, type TransferPositionOwnershipArgs, type TxResult, UNRESOLVE_CONFIRMATION, type UnresolveMarketArgs, type UpdateAdminArgs, type UpdateAssetAuthorityArgs, type UpdateAssetLifecycleArgs, type UpdateAuthorityArgs, type UpdateBackingFeePolicyArgs, type UpdateBaseUnitMintsArgs, type UpdateConfigArgs, type UpdateFeeSplitArgs, type UpdateMaintenanceFeePerSlotArgs, type UpdateRiskParamsArgs, type UpdateTradeFeePolicyArgs, type V17MarketGroupOI, V17_ASSET_CONTROL_SEQUENCES_LEN, V17_ASSET_CONTROL_SEQUENCES_OFF, V17_ASSET_ORACLE_PROFILE_LEN, V17_ASSET_ORACLE_WRAPPER_LEN, V17_ASSET_SLOT_WRAPPER_LEN, V17_BACKING_BUCKET_LEN, V17_CONFIG_MAX_MARKET_SLOTS_REL, V17_CREATOR_FEE_CLAIMABLE_OFF, V17_ENGINE_BACKING_LONG_REL, V17_ENGINE_BACKING_SHORT_REL, V17_EXPECTED_VERSION, V17_GROUP_CONFIG_REL, V17_GROUP_CURRENT_SLOT_REL, V17_GROUP_MODE_REL, V17_HEADER_LEN, V17_KIND_CLOSED_MARKET, V17_KIND_MARKET, V17_KIND_OFF, V17_MAGIC, V17_MARKET_ASSET_SLOT_LEN, V17_MARKET_GROUP_LEN, V17_MARKET_GROUP_OFF, V17_MARKET_MODE_LIVE, V17_PORTFOLIO_ACCOUNT_LEN, V17_PORTFOLIO_IDENTITY_TRAILER_LEN, V17_PORTFOLIO_LEG_SIZE, V17_PROTOCOL_FEE_AUTHORITY_EPOCH_LEN, V17_PROTOCOL_FEE_AUTHORITY_EPOCH_OFF, V17_SLAB_MAGIC, V17_WRAPPER_CONFIG_LEN, V17_WRAPPER_HEAP_FRAME_BYTES, V18_KIND_VAULT_LP_STATE_P3, VAMM_MAGIC, VAULT_LP_DEFAULT_MAX_LEV_BPS_P3, VAULT_LP_JUNIOR_FLOOR_BPS_RANGE_P3, VAULT_LP_MATCHER_CTX_LEN_P3, VAULT_LP_MAX_LEV_BPS_P3, VAULT_LP_PIN_P3, VAULT_LP_STATE_ACCOUNT_LEN_P3, VAULT_LP_STATE_BODY_LEN_P3, VAULT_LP_STATE_OFF_P3, ValidationError, type VammMatcherParams, type VaultLpLegPricesP3, type VaultLpMarketP3, type VaultLpRefreshCrankArgsP3, type VaultLpSetMatcherArgsP3, type VaultLpStateP3, WELL_KNOWN, WRAPPER_BATCH_MAX_LEGS, WSOL_MINT, type WithdrawBackingBucketArgs, type WithdrawBackingBucketEarningsArgs, type WithdrawCollateralArgs, type WithdrawCreatorFeeArgs, type WithdrawInsuranceArgs, type WithdrawInsuranceAssetArgs, type WithdrawProtocolFeeArgs, type WrapperConfigV17, _internal, accrueFeesAccounts, adminCloseSlabAccounts, adminResolveMarketCpiAccounts, adminUpdateBackingFeePolicyAccounts, adminUpdateFeeSplitAccounts, adminUpdateMaintenanceFeePerSlotAccounts, adminUpdateTradeFeePolicyAccounts, assetRiskLimitsAccountOffsetP1, assetVaultLpAccountOffsetP3, backingBucketStatusName, bindInsuranceAuthorityAccounts, boundVaultDepositQuoteP3, boundVaultNavFlooredP3, boundVaultRedemptionAtomsP3, boundVaultSeniorValueP3, buildAccountMetas, buildAdlInstruction, buildAdlTransaction, buildAdminCloseSlabIx, buildClaimResolvedPayoutTopupIxP3, buildCloseResolvedUnsignedIxP3, buildCreateVaultLpMatcherCtxIxP3, buildDepositJuniorTrancheIxP3, buildExecuteRedemptionIxP3, buildInitVaultLpIxP3, buildIx, buildMatcherConfigureBackingFeeCapIx, buildMatcherConfigureSetParamsIx, buildNftAccountMetas, buildRebalanceReduceIx, buildRecoverTerminalInsuranceIx, buildSetAssetRiskLimitsIxP1, buildSetVaultLpRiskIxP3, buildVaultLpConvertPnlIxP3, buildVaultLpRecallIxP3, buildVaultLpRefreshCrankIxP3, buildVaultLpReleaseSurplusIxP3, buildVaultLpSetMatcherIxP3, buildVaultLpSettleResolvedIxP3, buildWithdrawJuniorTrancheIxP3, burnAssetAdminAccounts, checkPhaseTransition, checkRpcHealth, classifyLighthouseError, clearStaticMarkets, computeDexSpotPriceE6, computeDynamicFeeBps, computeDynamicTradingFee, computeEffectiveOiCapBps, computeEmaMarkPrice, computeEstimatedEntryPrice, computeFeeSplit, computeFundingRateAnnualized, computeLiqPrice, computeMarkPnl, computeMaxLeverage, computeMaxLeverageFloor, computePnlPercent, computePreTradeLiqPrice, computeRequiredMargin, computeTradingFee, computeVammQuote, computeWarmupLeverageCap, computeWarmupMaxPositionSize, computeWarmupUnlockedCapital, concatBytes, countLighthouseInstructions, decodeAssetRiskLimitsP1, decodeAssetRiskLimitsRecordP1, decodeAssetVaultLpDrawP3, decodeAssetVaultLpP3, decodeAssetVaultLpRecordP3, decodeDepositPda, decodeError, decodeMatcherCallExt, decodeMatcherRequestedFeeBps, decodeMatcherReturn, decodeMatcherV2Error, decodePortfolioMatcherControl, decodeResolvedPayoutReceiptP3, decodeStakePool, decodeTerminalInsuranceCapacity, decodeVaultLpStateP3, defaultMatcherV2ConfigForKind2, depositAccounts, depositJuniorAccounts, deriveCanonicalVault, deriveCanonicalVaultForAuthority, deriveCreatorLockPda, deriveDepositPda, deriveExtraAccountMetas, deriveInsuranceLpMint, deriveLpBackingLedger, deriveLpEscrow, deriveLpPda, deriveLpRedemption, deriveLpVaultRegistry, deriveMarketVaultAccounts, deriveMatcherDelegate, deriveMintAuthority, deriveNftMint, deriveNftPda, deriveNftRegistry, deriveProgramDataAddressP3, derivePythPriceUpdateAccount, derivePythPushOraclePDA, deriveStakePool, deriveStakeVaultAuth, deriveVaultAuthority, deriveVaultLpStateP3, detectDexType, detectLayout, detectSlabLayout, detectTokenProgram, discoverMarkets, discoverMarketsViaApi, discoverMarketsViaStaticBundle, encBool, encI128, encI64, encPubkey, encU128, encU16, encU32, encU64, encU8, encodeAcceptAdmin, encodeAdminForceClose, encodeAdvanceEpoch, encodeAdvanceOraclePhase, encodeAllocateMarket, encodeAttestCrossMargin, encodeAuditCrank, encodeBatchTradeCpi, encodeBatchTradeNoCpi, encodeBurnPositionNft, encodeCancelQueuedWithdrawal, encodeChallengeSettlement, encodeClaimEpochWithdrawal, encodeClaimQueuedWithdrawal, encodeClearPendingSettlement, encodeCloseAccount, encodeCloseLpVault, encodeCloseOrphanSlab, encodeCloseSlab, encodeCloseStaleSlabs, encodeConfigureAuthMark, encodeConfigureEwmaMark, encodeConfigureHybridOracle, encodeConvertReleasedPnl, encodeCreateInsuranceMint, encodeCreateLpVault, encodeCreateLpVaultV17, encodeCureAndCancelClose, encodeDepositCollateral, encodeDepositFeeCredits, encodeDepositInsuranceLP, encodeDepositJuniorTrancheP3, encodeDepositLpCollateral, encodeDepositToLpVault, encodeExecuteAdl, encodeExecuteRedemption, encodeExpireBackingBucket, encodeFeedId, encodeForceCloseResolved, encodeForfeitRecoveryLeg, encodeFundMarketInsurance, encodeInitLP, encodeInitMarket, encodeInitMatcherCtx, encodeInitSharedVault, encodeInitUser, encodeInitVaultLpP3, encodeKeeperCrank, encodeLiquidateAtOracle, encodeLpVaultCrankFees, encodeLpVaultDeposit, encodeLpVaultWithdraw, encodeMatcherBatchCall, encodeMatcherCallExt, encodeMatcherConfigureBackingFeeCap, encodeMatcherConfigureSetParams, encodeMatcherInitPassive, encodeMatcherReturn, encodeMatcherSetParams, encodeMintPositionNft, encodeNftBurn, encodeNftEmergencyBurn, encodeNftMint, encodeNftReconcile, encodeNftSettleFunding, encodePauseMarket, encodePermissionlessCrank, encodePushAuthMark, encodePushEwmaMark, encodeQueueWithdrawal, encodeQueueWithdrawalSV, encodeRebalanceLpVaultBacking, encodeRebalanceReduce, encodeReclaimEmptyAccount, encodeReclaimSlabRent, encodeRenounceAdmin, encodeRequestRedeemLpShares, encodeRescueOrphanVault, encodeResolveDispute, encodeResolveMarket, encodeResolvePermissionless, encodeRestartAssetOracle, encodeSetAssetRiskLimitsP1, encodeSetDexPool, encodeSetDisputeParams, encodeSetInsuranceIsolation, encodeSetInsuranceWithdrawPolicy, encodeSetLpCollateralParams, encodeSetLpVaultPaused, encodeSetMaintenanceFee, encodeSetMatcherConfig, encodeSetMaxPnlCap, encodeSetNftProgramId, encodeSetOffsetPair, encodeSetOiCapMultiplier, encodeSetOiImbalanceHardBlock, encodeSetOraclePriceCap, encodeSetPendingSettlement, encodeSetProtocolFeeAuthority, encodeSetPythOracle, encodeSetRiskThreshold, encodeSetVaultLpRiskP3, encodeSetWalletCap, encodeSettleAccount, encodeSlashCreationDeposit, encodeStakeAcceptAdmin, encodeStakeAccrueFees, encodeStakeAdminCloseSlab, encodeStakeAdminResolveMarket, encodeStakeAdminResolveMarketCpi, encodeStakeAdminSetHwmConfig, encodeStakeAdminSetInsurancePolicy, encodeStakeAdminSetMaintenanceFee, encodeStakeAdminSetOracleAuthority, encodeStakeAdminSetRiskThreshold, encodeStakeAdminSetTrancheConfig, encodeStakeAdminUpdateBackingFeePolicy, encodeStakeAdminUpdateFeeSplit, encodeStakeAdminUpdateMaintenanceFeePerSlot, encodeStakeAdminUpdateTradeFeePolicy, encodeStakeAdminWithdrawInsurance, encodeStakeBindInsuranceAuthority, encodeStakeBurnAssetAdmin, encodeStakeCancelCooldownIncrease, encodeStakeCommitCooldownIncrease, encodeStakeDeposit, encodeStakeDepositJunior, encodeStakeFlushToInsurance, encodeStakeInitPool, encodeStakeInitTradingPool, encodeStakeProposeAdmin, encodeStakeProposeCooldownIncrease, encodeStakeRecoverFlushedInsurance, encodeStakeRecoverTerminalInsurance, encodeStakeReturnInsurance, encodeStakeRotateInsuranceAuthority, encodeStakeRotateInsuranceOperator, encodeStakeSetMarketResolved, encodeStakeTransferAdmin, encodeStakeUpdateConfig, encodeStakeWithdraw, encodeSwapSecondaryForPrimary, encodeTopUpBackingBucket, encodeTopUpInsurance, encodeTopUpInsuranceDomain, encodeTradeCpi, encodeTradeCpiV2, encodeTradeNoCpi, encodeTransferOwnershipCpi, encodeTransferPortfolioOwnership, encodeTransferPositionOwnership, encodeUnpauseMarket, encodeUnresolveMarket, encodeUpdateAdmin, encodeUpdateAssetAuthority, encodeUpdateAssetLifecycle, encodeUpdateAuthority, encodeUpdateBackingFeePolicy, encodeUpdateBaseUnitMints, encodeUpdateConfig, encodeUpdateFeeSplit, encodeUpdateHyperpMark, encodeUpdateInsuranceWithdrawPolicy, encodeUpdateMaintenanceFeePerSlot, encodeUpdateMarkPrice, encodeUpdateRiskParams, encodeUpdateTradeFeePolicy, encodeVaultLpConvertPnlP3, encodeVaultLpRecallP3, encodeVaultLpReleaseSurplusP3, encodeVaultLpSetMatcherP3, encodeVaultLpSettleResolvedP3, encodeWithdrawBackingBucket, encodeWithdrawBackingBucketEarnings, encodeWithdrawCollateral, encodeWithdrawCreatorFee, encodeWithdrawInsurance, encodeWithdrawInsuranceAsset, encodeWithdrawInsuranceLP, encodeWithdrawInsuranceLimited, encodeWithdrawInsuranceReserveToStake, encodeWithdrawJuniorTrancheP3, encodeWithdrawLpCollateral, encodeWithdrawProtocolFee, encodeWrapperMatcherCallExt, fetchAdlRankedPositions, fetchAdlRankings, fetchMintDecimals, fetchSlab, fetchTokenAccount, findExpirableBackingDomains, flushToInsuranceAccounts, formatResult, getAta, getAtaSync, getCurrentNetwork, getErrorHint, getErrorName, getMarketsByAddress, getMatcherProgramId, getNftProgramId, getProgramId, getStakeProgramId, getStaticMarkets, initPoolAccounts, isAccountUsed, isAdlTriggered, isBackingBucketExpirable, isClosedMarketTombstone, isLighthouseError, isLighthouseFailureInLogs, isLighthouseInstruction, isLpVaultRegistryBoundP3, isMatcherCtxV2, isStandardToken, isToken2022, isV17Account, isV17MarketAccount, isValidChainlinkOracle, listOpenResolvedReceiptsP3, liveExitSeniorValueP3, matcherConfigureOwnerProofAccounts, maxAccountIndex, packOiCap, parseAccount, parseAdlEvent, parseAllAccounts, parseAssetControlSequencesV17, parseAssetOracleProfileV17, parseBackingBucketsV17, parseChainlinkPrice, parseConfig, parseDexPool, parseEngine, parseEngineLight, parseErrorFromLogs, parseHeader, parseLpRedemption, parseLpVaultRegistry, parseMarketGroupV17OI, parseParams, parsePortfolioV17, parsePositionNftAccount, parseProtocolFeeAuthorityEpoch, parseUsedIndices, parseWrapperConfigV17, pinnedMatcherCapsP3, planCloseSlabAttempt, planReduceOnlyExit, planResolvedReceiptRevisitP3, planResolvedVaultLpExitP3, planStakeWindDown, rankAdlPositions, readAssetPricesP3, readLastThrUpdateSlot, readNonce, recoverFlushedInsuranceAccounts, recoverTerminalInsuranceAccounts, registerStaticMarkets, requireDecimalUIntString, resolvePrice, rotateInsuranceAccounts, safeBigInt, safeEnv, selectAdlTarget, simulateOrSend, slabDataSize, slabDataSizeV1, stakeGroupAProxyAccounts, stakeGroupBProxyAccounts, stripLighthouseFromTransaction, stripLighthouseInstructions, usdToQCappedP3, v17MarketAccountLen, validateAmount, validateBps, validateFeeSplit, validateI128, validateI64, validateIndex, validateMatcherSetParams, validatePublicKey, validateSlabTierMatch, validateU128, validateU16, validateU64, vaultLpEquityLagBoundsP3, vaultLpSeniorPricingClaimP3, vaultPhysicalIdleBackingAtomsP3, vaultPotHeldAtomsP3, withBoundVaultLpTailP3, withNftEscrowProof, withNftHolderAuth, withRetry, withdrawAccounts, zeroMatcherV2Config };
