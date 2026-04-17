import { PublicKey } from "@solana/web3.js";
/**
 * Oracle price constraints.
 * Maximum oracle price that can be pushed to the on-chain oracle authority.
 */
export declare const MAX_ORACLE_PRICE = 1000000000000n;
/**
 * Instruction tags - exact match to Rust ix::Instruction::decode
 */
export declare const IX_TAG: {
    readonly InitMarket: 0;
    readonly InitUser: 1;
    readonly InitLP: 2;
    readonly DepositCollateral: 3;
    readonly WithdrawCollateral: 4;
    readonly KeeperCrank: 5;
    readonly TradeNoCpi: 6;
    readonly LiquidateAtOracle: 7;
    readonly CloseAccount: 8;
    readonly TopUpInsurance: 9;
    readonly TradeCpi: 10;
    readonly SetRiskThreshold: 11;
    readonly UpdateAdmin: 12;
    readonly CloseSlab: 13;
    readonly UpdateConfig: 14;
    readonly SetMaintenanceFee: 15;
    readonly SetOracleAuthority: 16;
    readonly PushOraclePrice: 17;
    readonly SetOraclePriceCap: 18;
    readonly ResolveMarket: 19;
    readonly WithdrawInsurance: 20;
    readonly AdminForceClose: 21;
    readonly SetInsuranceWithdrawPolicy: 22;
    /** @deprecated Use SetInsuranceWithdrawPolicy */ readonly UpdateRiskParams: 22;
    readonly WithdrawInsuranceLimited: 23;
    /** @deprecated Use WithdrawInsuranceLimited */ readonly RenounceAdmin: 23;
    readonly QueryLpFees: 24;
    readonly ReclaimEmptyAccount: 25;
    readonly SettleAccount: 26;
    readonly DepositFeeCredits: 27;
    readonly ConvertReleasedPnl: 28;
    readonly ResolvePermissionless: 29;
    /** @deprecated Use ResolvePermissionless */ readonly AcceptAdmin: 29;
    readonly ForceCloseResolved: 30;
    readonly SetPythOracle: 32;
    readonly UpdateMarkPrice: 33;
    readonly UpdateHyperpMark: 34;
    readonly TradeCpiV2: 35;
    readonly UnresolveMarket: 36;
    readonly CreateLpVault: 37;
    readonly LpVaultDeposit: 38;
    readonly LpVaultWithdraw: 39;
    readonly LpVaultCrankFees: 40;
    /** PERC-306: Fund per-market isolated insurance balance */
    readonly FundMarketInsurance: 41;
    /** PERC-306: Set insurance isolation BPS for a market */
    readonly SetInsuranceIsolation: 42;
    /** PERC-314: Challenge settlement price during dispute window */
    readonly ChallengeSettlement: 43;
    /** PERC-314: Resolve dispute (admin adjudication) */
    readonly ResolveDispute: 44;
    /** PERC-315: Deposit LP vault tokens as perp collateral */
    readonly DepositLpCollateral: 45;
    /** PERC-315: Withdraw LP collateral (position must be closed) */
    readonly WithdrawLpCollateral: 46;
    /** PERC-309: Queue a large LP withdrawal (user; creates withdraw_queue PDA). */
    readonly QueueWithdrawal: 47;
    /** PERC-309: Claim one epoch tranche from a queued LP withdrawal (user). */
    readonly ClaimQueuedWithdrawal: 48;
    /** PERC-309: Cancel a queued withdrawal, refund remaining LP tokens (user). */
    readonly CancelQueuedWithdrawal: 49;
    /** PERC-305: Auto-deleverage — surgically close profitable positions when PnL cap is exceeded (permissionless). */
    readonly ExecuteAdl: 50;
    /** Close a stale slab of an invalid/old layout and recover rent SOL (admin only). */
    readonly CloseStaleSlabs: 51;
    /** Reclaim rent from an uninitialised slab whose market creation failed mid-flow. Slab must sign. */
    readonly ReclaimSlabRent: 52;
    /** Permissionless on-chain audit crank: verifies conservation invariants and pauses market on violation. */
    readonly AuditCrank: 53;
    /** Cross-Market Portfolio Margining: SetOffsetPair */
    readonly SetOffsetPair: 54;
    /** Cross-Market Portfolio Margining: AttestCrossMargin */
    readonly AttestCrossMargin: 55;
    /** PERC-622: Advance oracle phase (permissionless crank) */
    readonly AdvanceOraclePhase: 56;
    /** PERC-629: Slash a market creator's deposit (permissionless) */
    readonly SlashCreationDeposit: 58;
    /** PERC-628: Initialize the global shared vault (admin) */
    readonly InitSharedVault: 59;
    /** PERC-628: Allocate virtual liquidity to a market (admin) */
    readonly AllocateMarket: 60;
    /** PERC-628: Queue a withdrawal for the current epoch */
    readonly QueueWithdrawalSV: 61;
    /** PERC-628: Claim a queued withdrawal after epoch elapses */
    readonly ClaimEpochWithdrawal: 62;
    /** PERC-628: Advance the shared vault epoch (permissionless crank) */
    readonly AdvanceEpoch: 63;
    /** PERC-608: Mint a Position NFT for a user's open position. */
    readonly MintPositionNft: 64;
    /** PERC-608: Transfer position ownership via the NFT (keeper-gated). */
    readonly TransferPositionOwnership: 65;
    /** PERC-608: Burn the Position NFT when a position is closed. */
    readonly BurnPositionNft: 66;
    /** PERC-608: Keeper sets pending_settlement flag before a funding transfer. */
    readonly SetPendingSettlement: 67;
    /** PERC-608: Keeper clears pending_settlement flag after KeeperCrank. */
    readonly ClearPendingSettlement: 68;
    /** PERC-608: Internal CPI call from percolator-nft TransferHook to update on-chain owner. */
    readonly TransferOwnershipCpi: 69;
    /** PERC-8111: Set per-wallet position cap (admin only, cap_e6=0 disables). */
    readonly SetWalletCap: 70;
    /** PERC-8110: Set OI imbalance hard-block threshold (admin only). */
    readonly SetOiImbalanceHardBlock: 71;
    /** PERC-8270: Rescue orphan vault — recover tokens from a closed market's vault (admin). */
    readonly RescueOrphanVault: 72;
    /** PERC-8270: Close orphan slab — reclaim rent from a slab whose market closed unexpectedly (admin). */
    readonly CloseOrphanSlab: 73;
    /** PERC-SetDexPool: Pin admin-approved DEX pool address for a HYPERP market (admin). */
    readonly SetDexPool: 74;
    /** CPI to the matcher program to initialize a matcher context account for an LP slot. Admin-only. */
    readonly InitMatcherCtx: 75;
    /** PauseMarket (tag 76): admin emergency pause. Blocks Trade/Deposit/Withdraw/InitUser. */
    readonly PauseMarket: 76;
    /** UnpauseMarket (tag 77): admin unpause. Re-enables all operations. */
    readonly UnpauseMarket: 77;
    /** PERC-305 / SECURITY(H-4): Set PnL cap for ADL pre-check (admin only). */
    readonly SetMaxPnlCap: 78;
    /** PERC-309: Set OI cap multiplier for LP withdrawal limits (admin only). Packed u64. */
    readonly SetOiCapMultiplier: 79;
    /** PERC-314: Set dispute params (window_slots + bond_amount, admin only). */
    readonly SetDisputeParams: 80;
    /** PERC-315: Set LP collateral params (enabled + ltv_bps, admin only). */
    readonly SetLpCollateralParams: 81;
};
/**
 * InitMarket instruction data (256 bytes total)
 * Layout: tag(1) + admin(32) + mint(32) + indexFeedId(32) +
 *         maxStaleSecs(8) + confFilter(2) + invert(1) + unitScale(4) +
 *         RiskParams(144)
 *
 * Note: indexFeedId is the Pyth Pull feed ID (32 bytes hex), NOT an oracle pubkey.
 * The program validates PriceUpdateV2 accounts against this feed ID at runtime.
 */
export interface InitMarketArgs {
    admin: PublicKey | string;
    collateralMint: PublicKey | string;
    indexFeedId: string;
    maxStalenessSecs: bigint | string;
    confFilterBps: number;
    invert: number;
    unitScale: number;
    initialMarkPriceE6: bigint | string;
    maxMaintenanceFeePerSlot?: bigint | string;
    maxInsuranceFloor?: bigint | string;
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
    minInitialDeposit: bigint | string;
    minNonzeroMmReq: bigint | string;
    minNonzeroImReq: bigint | string;
}
export declare function encodeInitMarket(args: InitMarketArgs): Uint8Array;
/**
 * InitUser instruction data (9 bytes)
 */
export interface InitUserArgs {
    feePayment: bigint | string;
}
export declare function encodeInitUser(args: InitUserArgs): Uint8Array;
/**
 * InitLP instruction data (73 bytes)
 */
export interface InitLPArgs {
    matcherProgram: PublicKey | string;
    matcherContext: PublicKey | string;
    feePayment: bigint | string;
}
export declare function encodeInitLP(args: InitLPArgs): Uint8Array;
/**
 * DepositCollateral instruction data (11 bytes)
 */
export interface DepositCollateralArgs {
    userIdx: number;
    amount: bigint | string;
}
export declare function encodeDepositCollateral(args: DepositCollateralArgs): Uint8Array;
/**
 * WithdrawCollateral instruction data (11 bytes)
 */
export interface WithdrawCollateralArgs {
    userIdx: number;
    amount: bigint | string;
}
export declare function encodeWithdrawCollateral(args: WithdrawCollateralArgs): Uint8Array;
/**
 * Liquidation policy for KeeperCrank candidates (v12.17 two-phase crank).
 *
 * On-chain wire tags:
 *   0x00 = FullClose — liquidate the entire position
 *   0x01 = ExactPartial(u128) — reduce position by exactly `quantity` units
 *   0xFF = TouchOnly — accrue fees / sweep dust, do NOT liquidate
 */
export declare const LiquidationPolicyTag: {
    readonly FullClose: 0;
    readonly ExactPartial: 1;
    readonly TouchOnly: 255;
};
export type KeeperCrankCandidate = {
    policy: typeof LiquidationPolicyTag.FullClose;
    idx: number;
} | {
    policy: typeof LiquidationPolicyTag.ExactPartial;
    idx: number;
    quantity: bigint | string;
} | {
    policy: typeof LiquidationPolicyTag.TouchOnly;
    idx: number;
};
/**
 * KeeperCrank instruction data (v12.17 two-phase crank).
 *
 * Wire format: tag(1) + caller_idx(u16) + format_version=1(u8) +
 *   candidates: [ idx(u16) + policy_tag(u8) [+ quantity(u128) if ExactPartial] ]*
 *
 * Empty candidates list = simple crank (accrue funding, sweep dust).
 * With candidates = targeted liquidation/touch pass.
 */
export interface KeeperCrankArgs {
    callerIdx: number;
    candidates?: KeeperCrankCandidate[];
}
export declare function encodeKeeperCrank(args: KeeperCrankArgs): Uint8Array;
/**
 * TradeNoCpi instruction data (21 bytes)
 */
export interface TradeNoCpiArgs {
    lpIdx: number;
    userIdx: number;
    size: bigint | string;
}
export declare function encodeTradeNoCpi(args: TradeNoCpiArgs): Uint8Array;
/**
 * LiquidateAtOracle instruction data (3 bytes)
 */
export interface LiquidateAtOracleArgs {
    targetIdx: number;
}
export declare function encodeLiquidateAtOracle(args: LiquidateAtOracleArgs): Uint8Array;
/**
 * CloseAccount instruction data (3 bytes)
 */
export interface CloseAccountArgs {
    userIdx: number;
}
export declare function encodeCloseAccount(args: CloseAccountArgs): Uint8Array;
/**
 * TopUpInsurance instruction data (9 bytes)
 */
export interface TopUpInsuranceArgs {
    amount: bigint | string;
}
export declare function encodeTopUpInsurance(args: TopUpInsuranceArgs): Uint8Array;
/**
 * TradeCpi instruction data (29 bytes)
 *
 * v12.17: limit_price_e6 is now REQUIRED (slippage protection).
 * Set to 0 to accept any price (no slippage protection).
 * For buys: tx reverts if execution price > limitPriceE6.
 * For sells: tx reverts if execution price < limitPriceE6.
 */
export interface TradeCpiArgs {
    lpIdx: number;
    userIdx: number;
    size: bigint | string;
    /** Limit price in e6 units. 0 = no limit (accept any price). */
    limitPriceE6: bigint | string;
}
export declare function encodeTradeCpi(args: TradeCpiArgs): Uint8Array;
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
export declare function encodeTradeCpiV2(args: TradeCpiV2Args): Uint8Array;
/**
 * @deprecated Tag 36 removed in v12.17. Will fail on-chain with InvalidInstructionData.
 */
export interface UnresolveMarketArgs {
    confirmation: bigint | string;
}
/** @deprecated Tag 36 removed in v12.17. Will fail on-chain. */
export declare function encodeUnresolveMarket(args: UnresolveMarketArgs): Uint8Array;
/**
 * @deprecated Tag 11 removed in v12.17. Insurance floor is now set at InitMarket.
 * Sending this instruction will fail with InvalidInstructionData.
 */
export interface SetRiskThresholdArgs {
    newThreshold: bigint | string;
}
/** @deprecated Tag 11 removed in v12.17. Will fail on-chain. */
export declare function encodeSetRiskThreshold(args: SetRiskThresholdArgs): Uint8Array;
/**
 * UpdateAdmin instruction data (33 bytes)
 */
export interface UpdateAdminArgs {
    newAdmin: PublicKey | string;
}
export declare function encodeUpdateAdmin(args: UpdateAdminArgs): Uint8Array;
/**
 * CloseSlab instruction data (1 byte)
 */
export declare function encodeCloseSlab(): Uint8Array;
/**
 * UpdateConfig instruction data (33 bytes)
 *
 * v12.17: Only 4 funding parameters. Threshold/insurance parameters are set
 * at InitMarket and updated via dedicated instructions (SetRiskThreshold removed).
 * fundingInvScaleNotionalE6 removed (now computed on-chain from LP state).
 */
export interface UpdateConfigArgs {
    fundingHorizonSlots: bigint | string;
    fundingKBps: bigint | string;
    fundingMaxPremiumBps: bigint | string;
    fundingMaxBpsPerSlot: bigint | string;
}
export declare function encodeUpdateConfig(args: UpdateConfigArgs): Uint8Array;
/**
 * @deprecated Tag 15 removed in v12.17. Maintenance fee is set at InitMarket only.
 * Sending this instruction will fail with InvalidInstructionData.
 */
export interface SetMaintenanceFeeArgs {
    newFee: bigint | string;
}
/** @deprecated Tag 15 removed in v12.17. Will fail on-chain. */
export declare function encodeSetMaintenanceFee(args: SetMaintenanceFeeArgs): Uint8Array;
/**
 * SetOracleAuthority instruction data (33 bytes)
 * Sets the oracle price authority. Pass zero pubkey to disable and require Pyth/Chainlink.
 */
export interface SetOracleAuthorityArgs {
    newAuthority: PublicKey | string;
}
export declare function encodeSetOracleAuthority(args: SetOracleAuthorityArgs): Uint8Array;
/**
 * PushOraclePrice instruction data (17 bytes)
 * Push a new oracle price (oracle authority only).
 * The price should be in e6 format and already include any inversion/scaling.
 */
export interface PushOraclePriceArgs {
    priceE6: bigint | string;
    timestamp: bigint | string;
}
/**
 * Encode PushOraclePrice instruction data with validation.
 *
 * Validates oracle price constraints:
 * - Price cannot be zero (division by zero in on-chain engine)
 * - Price cannot exceed MAX_ORACLE_PRICE (prevents overflow in price math)
 *
 * @param args - PushOraclePrice arguments
 * @returns Encoded instruction data (17 bytes)
 * @throws Error if price is 0 or exceeds MAX_ORACLE_PRICE
 */
export declare function encodePushOraclePrice(args: PushOraclePriceArgs): Uint8Array;
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
export declare function encodeSetOraclePriceCap(args: SetOraclePriceCapArgs): Uint8Array;
/**
 * ResolveMarket instruction data (1 byte)
 * Resolves a binary/premarket - sets RESOLVED flag, positions force-closed via crank.
 * Requires admin oracle price (authority_price_e6) to be set first.
 */
export declare function encodeResolveMarket(): Uint8Array;
/**
 * WithdrawInsurance instruction data (1 byte)
 * Withdraw insurance fund to admin (requires RESOLVED and all positions closed).
 */
export declare function encodeWithdrawInsurance(): Uint8Array;
/**
 * AdminForceClose instruction data (3 bytes)
 * Force-close any position at oracle price (admin only, skips margin checks).
 */
export interface AdminForceCloseArgs {
    targetIdx: number;
}
export declare function encodeAdminForceClose(args: AdminForceCloseArgs): Uint8Array;
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
export declare function encodeUpdateRiskParams(args: UpdateRiskParamsArgs): Uint8Array;
/**
 * On-chain confirmation code for RenounceAdmin (must match program constant).
 * ASCII "RENOUNCE" as u64 LE = 0x52454E4F554E4345.
 */
export declare const RENOUNCE_ADMIN_CONFIRMATION = 5928230587143701317n;
/**
 * On-chain confirmation code for UnresolveMarket (must match program constant).
 */
export declare const UNRESOLVE_CONFIRMATION = 16045690984503054900n;
/**
 * @deprecated Tag 23 is now WithdrawInsuranceLimited in v12.17.
 * This encoder sends the confirmation code as a withdrawal amount — DANGEROUS.
 * Use encodeWithdrawInsuranceLimited instead.
 */
export declare function encodeRenounceAdmin(): Uint8Array;
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
export declare function encodeLpVaultWithdraw(args: LpVaultWithdrawArgs): Uint8Array;
/**
 * PauseMarket instruction data (1 byte)
 * Pauses the market — disables trading, deposits, and withdrawals.
 */
export declare function encodePauseMarket(): Uint8Array;
/**
 * UnpauseMarket instruction data (1 byte)
 * Unpauses the market — re-enables trading, deposits, and withdrawals.
 */
export declare function encodeUnpauseMarket(): Uint8Array;
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
export declare function encodeSetPythOracle(args: SetPythOracleArgs): Uint8Array;
/**
 * Derive the expected Pyth PriceUpdateV2 account address for a given feed ID.
 * Uses PDA seeds: [shard_id(2), feed_id(32)] under the Pyth Receiver program.
 *
 * @param feedId  32-byte Pyth feed ID
 * @param shardId Shard index (default 0 for mainnet/devnet)
 */
export declare const PYTH_RECEIVER_PROGRAM_ID = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
export declare function derivePythPriceUpdateAccount(feedId: Uint8Array, shardId?: number): Promise<string>;
/**
 * @deprecated Tag 33 removed in v12.17. Use UpdateHyperpMark (tag 34) for DEX-oracle markets.
 * Sending this instruction will fail with InvalidInstructionData.
 */
export declare function encodeUpdateMarkPrice(): Uint8Array;
/**
 * Mark price EMA parameters (must match program/src/percolator.rs constants).
 */
export declare const MARK_PRICE_EMA_WINDOW_SLOTS = 72000n;
export declare const MARK_PRICE_EMA_ALPHA_E6: bigint;
/**
 * Compute the next EMA mark price step (TypeScript mirror of the on-chain function).
 */
export declare function computeEmaMarkPrice(markPrevE6: bigint, oracleE6: bigint, dtSlots: bigint, alphaE6?: bigint, capE2bps?: bigint): bigint;
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
export declare function encodeUpdateHyperpMark(): Uint8Array;
/**
 * Fund per-market isolated insurance balance.
 * Accounts: [admin(signer,writable), slab(writable), admin_ata(writable), vault(writable), token_program]
 */
export declare function encodeFundMarketInsurance(args: {
    amount: bigint;
}): Uint8Array;
/**
 * Set insurance isolation BPS for a market.
 * Accounts: [admin(signer), slab(writable)]
 */
export declare function encodeSetInsuranceIsolation(args: {
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
export declare function encodeQueueWithdrawal(args: {
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
export declare function encodeClaimQueuedWithdrawal(): Uint8Array;
/**
 * CancelQueuedWithdrawal (Tag 49, PERC-309) — cancel a queued withdrawal, refund remaining LP.
 *
 * Closes the withdraw_queue PDA and returns its rent lamports to the user.
 * The queued LP amount that was not yet claimed is NOT refunded — it is burned.
 * Use only to abandon a partial withdrawal.
 *
 * Accounts: [user(signer,writable), slab, withdrawQueue(writable)]
 */
export declare function encodeCancelQueuedWithdrawal(): Uint8Array;
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
export declare function encodeExecuteAdl(args: ExecuteAdlArgs): Uint8Array;
/**
 * CloseStaleSlabs (Tag 51) — close a slab of an invalid/old layout and recover rent SOL.
 *
 * Admin only. Skips slab_guard; validates header magic + admin authority instead.
 * Use for slabs created by old program layouts (e.g. pre-PERC-120 devnet deploys)
 * whose size does not match any current valid tier.
 *
 * Accounts: [dest(signer,writable), slab(writable)]
 */
export declare function encodeCloseStaleSlabs(): Uint8Array;
/**
 * ReclaimSlabRent (Tag 52) — reclaim rent from an uninitialised slab.
 *
 * For use when market creation failed mid-flow (slab funded but InitMarket not called).
 * The slab account must sign (proves the caller holds the slab keypair).
 * Cannot close an initialised slab (magic == PERCOLAT) — use CloseSlab (tag 13).
 *
 * Accounts: [dest(signer,writable), slab(signer,writable)]
 */
export declare function encodeReclaimSlabRent(): Uint8Array;
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
export declare function encodeAuditCrank(): Uint8Array;
/**
 * Parsed vAMM matcher parameters (from on-chain matcher context account)
 */
export interface VammMatcherParams {
    mode: number;
    tradingFeeBps: number;
    baseSpreadBps: number;
    maxTotalBps: number;
    impactKBps: number;
    liquidityNotionalE6: bigint;
}
/** Magic bytes identifying a vAMM matcher context: "PERCMATC" as u64 LE */
export declare const VAMM_MAGIC = 5784119745439683651n;
/** Offset into matcher context where vAMM params start */
export declare const CTX_VAMM_OFFSET = 64;
/**
 * Compute execution price for a given LP quote.
 * For buys (isLong=true): price above oracle.
 * For sells (isLong=false): price below oracle.
 */
export declare function computeVammQuote(params: VammMatcherParams, oraclePriceE6: bigint, tradeSize: bigint, isLong: boolean): bigint;
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
export declare function encodeAdvanceOraclePhase(): Uint8Array;
/** Oracle phase constants matching on-chain values */
export declare const ORACLE_PHASE_NASCENT = 0;
export declare const ORACLE_PHASE_GROWING = 1;
export declare const ORACLE_PHASE_MATURE = 2;
/** Phase transition thresholds (must match program constants) */
export declare const PHASE1_MIN_SLOTS = 648000n;
export declare const PHASE1_VOLUME_MIN_SLOTS = 36000n;
export declare const PHASE2_VOLUME_THRESHOLD = 100000000000n;
export declare const PHASE2_MATURITY_SLOTS = 3024000n;
/**
 * Check if an oracle phase transition is due (TypeScript mirror of on-chain logic).
 *
 * @returns [newPhase, shouldTransition]
 */
export declare function checkPhaseTransition(currentSlot: bigint, marketCreatedSlot: bigint, oraclePhase: number, cumulativeVolumeE6: bigint, phase2DeltaSlots: number, hasMatureOracle: boolean): [number, boolean];
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
export declare function encodeSlashCreationDeposit(): Uint8Array;
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
export declare function encodeInitSharedVault(args: InitSharedVaultArgs): Uint8Array;
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
export declare function encodeAllocateMarket(args: AllocateMarketArgs): Uint8Array;
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
export declare function encodeQueueWithdrawalSV(args: QueueWithdrawalSVArgs): Uint8Array;
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
export declare function encodeClaimEpochWithdrawal(): Uint8Array;
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
export declare function encodeAdvanceEpoch(): Uint8Array;
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
export declare function encodeSetOiImbalanceHardBlock(args: {
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
export interface MintPositionNftArgs {
    userIdx: number;
}
export declare function encodeMintPositionNft(args: MintPositionNftArgs): Uint8Array;
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
export declare function encodeTransferPositionOwnership(args: TransferPositionOwnershipArgs): Uint8Array;
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
export declare function encodeBurnPositionNft(args: BurnPositionNftArgs): Uint8Array;
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
export declare function encodeSetPendingSettlement(args: SetPendingSettlementArgs): Uint8Array;
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
export declare function encodeClearPendingSettlement(args: ClearPendingSettlementArgs): Uint8Array;
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
export declare function encodeTransferOwnershipCpi(args: TransferOwnershipCpiArgs): Uint8Array;
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
export declare function encodeSetWalletCap(args: SetWalletCapArgs): Uint8Array;
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
export declare function encodeInitMatcherCtx(args: InitMatcherCtxArgs): Uint8Array;
/** SetInsuranceWithdrawPolicy (tag 22): authority + min_withdraw_base + max_withdraw_bps + cooldown_slots */
export interface SetInsuranceWithdrawPolicyArgs {
    authority: PublicKey | string;
    minWithdrawBase: bigint | string;
    maxWithdrawBps: number;
    cooldownSlots: bigint | string;
}
export declare function encodeSetInsuranceWithdrawPolicy(args: SetInsuranceWithdrawPolicyArgs): Uint8Array;
/** WithdrawInsuranceLimited (tag 23): amount */
export declare function encodeWithdrawInsuranceLimited(args: {
    amount: bigint | string;
}): Uint8Array;
/** ResolvePermissionless (tag 29): no args */
export declare function encodeResolvePermissionless(): Uint8Array;
/** ForceCloseResolved (tag 30): user_idx */
export declare function encodeForceCloseResolved(args: {
    userIdx: number;
}): Uint8Array;
/** CreateLpVault (tag 37): fee_share_bps + util_curve_enabled */
export declare function encodeCreateLpVault(args: {
    feeShareBps: bigint | string;
    utilCurveEnabled?: boolean;
}): Uint8Array;
/** LpVaultDeposit (tag 38): amount */
export declare function encodeLpVaultDeposit(args: {
    amount: bigint | string;
}): Uint8Array;
/** LpVaultCrankFees (tag 40): no args */
export declare function encodeLpVaultCrankFees(): Uint8Array;
/** ChallengeSettlement (tag 43): proposed_price_e6 */
export declare function encodeChallengeSettlement(args: {
    proposedPriceE6: bigint | string;
}): Uint8Array;
/** ResolveDispute (tag 44): accept (0 = reject, 1 = accept) */
export declare function encodeResolveDispute(args: {
    accept: number;
}): Uint8Array;
/** DepositLpCollateral (tag 45): user_idx + lp_amount */
export declare function encodeDepositLpCollateral(args: {
    userIdx: number;
    lpAmount: bigint | string;
}): Uint8Array;
/** WithdrawLpCollateral (tag 46): user_idx + lp_amount */
export declare function encodeWithdrawLpCollateral(args: {
    userIdx: number;
    lpAmount: bigint | string;
}): Uint8Array;
/** SetOffsetPair (tag 54): offset_bps */
export declare function encodeSetOffsetPair(args: {
    offsetBps: number;
}): Uint8Array;
/** AttestCrossMargin (tag 55): user_idx_a + user_idx_b */
export declare function encodeAttestCrossMargin(args: {
    userIdxA: number;
    userIdxB: number;
}): Uint8Array;
/** RescueOrphanVault (tag 72): no args */
export declare function encodeRescueOrphanVault(): Uint8Array;
/** CloseOrphanSlab (tag 73): no args */
export declare function encodeCloseOrphanSlab(): Uint8Array;
/** SetDexPool (tag 74): pool pubkey */
export declare function encodeSetDexPool(args: {
    pool: PublicKey | string;
}): Uint8Array;
/** CreateInsuranceMint: creates the insurance LP mint PDA (tag 37, same as CreateLpVault) */
export declare function encodeCreateInsuranceMint(): Uint8Array;
/** DepositInsuranceLP: deposit collateral, receive LP tokens (tag 38, same as LpVaultDeposit) */
export declare function encodeDepositInsuranceLP(args: {
    amount: bigint | string;
}): Uint8Array;
/** WithdrawInsuranceLP: burn LP tokens, withdraw collateral (tag 39, same as LpVaultWithdraw) */
export declare function encodeWithdrawInsuranceLP(args: {
    lpAmount: bigint | string;
}): Uint8Array;
/**
 * SetMaxPnlCap (Tag 78, PERC-305 / SECURITY(H-4)) — set the PnL cap for ADL
 * pre-check (admin only). When `pnl_pos_tot <= max_pnl_cap`, ADL returns
 * early (no deleveraging needed).
 *
 * `capE6 = 0` disables the cap (ADL always runs when insurance is depleted).
 *
 * Instruction data: tag(1) + cap(u64, 8) = 9 bytes
 */
export interface SetMaxPnlCapArgs {
    /** PnL cap in engine quote units (e.g., 1_000_000 = $1 e6). 0 = cap disabled. */
    cap: bigint | string;
}
export declare function encodeSetMaxPnlCap(args: SetMaxPnlCapArgs): Uint8Array;
/**
 * SetOiCapMultiplier (Tag 79, PERC-309) — set the OI cap multiplier for LP
 * withdrawal limits (admin only). Packed u64:
 *   lo 32 bits: multiplier_bps (e.g., 15000 = 1.5× soft cap in stressed state)
 *   hi 32 bits: soft_cap_bps   (e.g., 8000  = 80% base cap)
 *
 * `packed = 0` disables enforcement (no cap on LP withdrawals).
 *
 * Instruction data: tag(1) + packed(u64, 8) = 9 bytes
 */
export interface SetOiCapMultiplierArgs {
    /** Packed u64: lo32 = multiplier_bps, hi32 = soft_cap_bps. 0 = disabled. */
    packed: bigint | string;
}
export declare function encodeSetOiCapMultiplier(args: SetOiCapMultiplierArgs): Uint8Array;
/** Convenience: pack (multiplier_bps, soft_cap_bps) into the u64 expected by SetOiCapMultiplier. */
export declare function packOiCap(multiplierBps: number, softCapBps: number): bigint;
/**
 * SetDisputeParams (Tag 80, PERC-314) — configure settlement dispute window
 * and bond (admin only).
 *
 * - `windowSlots = 0` disables disputes (ChallengeSettlement returns
 *   DisputeWindowClosed). Max: 2_000_000 slots (≈ 8 days at 400ms slots) to
 *   prevent DoS via absurd freezes.
 * - `bondAmount` (collateral tokens): refunded on dispute upheld, forfeited
 *   on reject. 0 = no bond required.
 *
 * Instruction data: tag(1) + window_slots(u64, 8) + bond_amount(u64, 8) = 17 bytes
 */
export interface SetDisputeParamsArgs {
    /** Dispute window in slots. 0 = disputes disabled. Max 2_000_000. */
    windowSlots: bigint | string;
    /** Bond required to open a dispute (collateral units). 0 = no bond. */
    bondAmount: bigint | string;
}
export declare function encodeSetDisputeParams(args: SetDisputeParamsArgs): Uint8Array;
/**
 * SetLpCollateralParams (Tag 81, PERC-315) — configure LP token collateral
 * acceptance (admin only).
 *
 * - `enabled = 0`: DepositLpCollateral rejects all new deposits.
 * - `enabled = 1`: deposits allowed, subject to `ltvBps` haircut on value.
 * - `ltvBps` max 10_000 (100%). Typical: 5000 (50% LTV).
 *
 * Instruction data: tag(1) + enabled(u8, 1) + ltv_bps(u16, 2) = 4 bytes
 */
export interface SetLpCollateralParamsArgs {
    /** 0 = disabled (blocks new deposits), 1 = enabled. */
    enabled: number;
    /** LTV in bps (0-10000). 5000 = 50% LTV. */
    ltvBps: number;
}
export declare function encodeSetLpCollateralParams(args: SetLpCollateralParamsArgs): Uint8Array;
