import { PublicKey } from "@solana/web3.js";
/**
 * Instruction tags - exact match to Rust src/tags.rs.
 *
 * ⚠️ NEVER reorder, remove, or reuse a tag number.
 * Always append new instructions at the end, matching tags.rs.
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
    readonly UpdateRiskParams: 22;
    readonly RenounceAdmin: 23;
    readonly CreateInsuranceMint: 24;
    readonly DepositInsuranceLP: 25;
    readonly WithdrawInsuranceLP: 26;
    readonly PauseMarket: 27;
    readonly UnpauseMarket: 28;
    /** Two-step admin transfer: new admin accepts the proposal (PERC-110). */
    readonly AcceptAdmin: 29;
    /** Set insurance withdrawal policy on a resolved market (PERC-110). */
    readonly SetInsuranceWithdrawPolicy: 30;
    /** Withdraw limited amount from insurance fund per policy (PERC-110). */
    readonly WithdrawInsuranceLimited: 31;
    /** Configure on-chain Pyth oracle for a market (PERC-117). */
    readonly SetPythOracle: 32;
    /** Update mark price EMA (PERC-118, reserved). */
    readonly UpdateMarkPrice: 33;
    /** Update Hyperp mark from DEX oracle (PERC-119). */
    readonly UpdateHyperpMark: 34;
    /** Optimised TradeCpi with caller-provided PDA bump (PERC-154). */
    readonly TradeCpiV2: 35;
    /** Unresolve a market: clear RESOLVED flag, re-enable trading (PERC-273). */
    readonly UnresolveMarket: 36;
    /** Create LP vault: initialise state PDA + SPL mint for LP shares (PERC-272). */
    readonly CreateLpVault: 37;
    /** Deposit into LP vault: transfer SOL → vault, mint LP shares (PERC-272). */
    readonly LpVaultDeposit: 38;
    /** Withdraw from LP vault: burn LP shares, receive SOL (PERC-272). */
    readonly LpVaultWithdraw: 39;
    /** Permissionless crank: distribute accrued fee revenue to LP vault (PERC-272). */
    readonly LpVaultCrankFees: 40;
    /** Fund per-market isolated insurance balance (PERC-306). */
    readonly FundMarketInsurance: 41;
    /** Set insurance isolation BPS for a market (PERC-306). */
    readonly SetInsuranceIsolation: 42;
    /** Challenge settlement price during dispute window (PERC-314). */
    readonly ChallengeSettlement: 43;
    /** Resolve dispute (admin adjudication) (PERC-314). */
    readonly ResolveDispute: 44;
    /** Deposit LP vault tokens as perp collateral (PERC-315). */
    readonly DepositLpCollateral: 45;
    /** Withdraw LP collateral (position must be closed) (PERC-315). */
    readonly WithdrawLpCollateral: 46;
    /** Queue a large LP withdrawal (PERC-309). */
    readonly QueueWithdrawal: 47;
    /** Claim one epoch tranche from queued withdrawal (PERC-309). */
    readonly ClaimQueuedWithdrawal: 48;
    /** Cancel queued withdrawal, refund remaining (PERC-309). */
    readonly CancelQueuedWithdrawal: 49;
    /** Auto-deleverage: surgically close profitable positions when PnL cap hit (PERC-305). */
    readonly ExecuteAdl: 50;
    /** Close a stale slab (wrong size from old layout) and recover rent SOL. */
    readonly CloseStateSlab: 51;
    /** Reclaim rent from an uninitialised slab (magic = 0). */
    readonly ReclaimSlabRent: 52;
    /** Permissionless on-chain audit crank: verify conservation invariants. */
    readonly AuditCrank: 53;
    /** Admin: configure cross-market margin offset for a pair of slabs. */
    readonly SetOffsetPair: 54;
    /** Permissionless: attest user positions across two slabs for portfolio margin. */
    readonly AttestCrossMargin: 55;
    /** PERC-622: Advance oracle phase (permissionless crank). */
    readonly AdvanceOraclePhase: 56;
    /** PERC-623: Top up keeper fund (permissionless). */
    readonly TopupKeeperFund: 57;
    /** PERC-629: Slash creation deposit. */
    readonly SlashCreationDeposit: 58;
    /** PERC-628: Initialise the global shared vault. */
    readonly InitSharedVault: 59;
    /** PERC-628: Allocate virtual liquidity to a market. */
    readonly AllocateMarket: 60;
    /** PERC-628: Queue a withdrawal request for the current epoch. */
    readonly QueueWithdrawalSv: 61;
    /** PERC-628: Claim a queued withdrawal after epoch elapses. */
    readonly ClaimEpochWithdrawal: 62;
    /** PERC-628: Advance the shared vault epoch (permissionless crank). */
    readonly AdvanceEpoch: 63;
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
    warmupPeriodSlots: bigint | string;
    maintenanceMarginBps: bigint | string;
    initialMarginBps: bigint | string;
    tradingFeeBps: bigint | string;
    maxAccounts: bigint | string;
    newAccountFee: bigint | string;
    riskReductionThreshold: bigint | string;
    maintenanceFeePerSlot: bigint | string;
    maxCrankStalenessSlots: bigint | string;
    liquidationFeeBps: bigint | string;
    liquidationFeeCap: bigint | string;
    liquidationBufferBps: bigint | string;
    minLiquidationAbs: bigint | string;
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
 * KeeperCrank instruction data (4 bytes)
 * Funding rate is computed on-chain from LP inventory.
 */
export interface KeeperCrankArgs {
    callerIdx: number;
    allowPanic: boolean;
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
 * TradeCpi instruction data (21 bytes)
 */
export interface TradeCpiArgs {
    lpIdx: number;
    userIdx: number;
    size: bigint | string;
}
export declare function encodeTradeCpi(args: TradeCpiArgs): Uint8Array;
/**
 * SetRiskThreshold instruction data (17 bytes)
 */
export interface SetRiskThresholdArgs {
    newThreshold: bigint | string;
}
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
 * UpdateConfig instruction data
 * Updates funding and threshold parameters at runtime (admin only)
 */
export interface UpdateConfigArgs {
    fundingHorizonSlots: bigint | string;
    fundingKBps: bigint | string;
    fundingInvScaleNotionalE6: bigint | string;
    fundingMaxPremiumBps: bigint | string;
    fundingMaxBpsPerSlot: bigint | string;
    threshFloor: bigint | string;
    threshRiskBps: bigint | string;
    threshUpdateIntervalSlots: bigint | string;
    threshStepBps: bigint | string;
    threshAlphaBps: bigint | string;
    threshMin: bigint | string;
    threshMax: bigint | string;
    threshMinStep: bigint | string;
}
export declare function encodeUpdateConfig(args: UpdateConfigArgs): Uint8Array;
/**
 * SetMaintenanceFee instruction data (17 bytes)
 */
export interface SetMaintenanceFeeArgs {
    newFee: bigint | string;
}
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
export declare function encodePushOraclePrice(args: PushOraclePriceArgs): Uint8Array;
/**
 * SetOraclePriceCap instruction data (9 bytes)
 * Set oracle price circuit breaker cap (admin only).
 * max_change_e2bps in 0.01 bps units (1_000_000 = 100%). 0 = disabled.
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
 * UpdateRiskParams instruction data (17 or 25 bytes)
 * Update initial and maintenance margin BPS (admin only).
 *
 * R2-S13: The Rust program uses `data.len() >= 25` to detect the optional
 * tradingFeeBps field, so variable-length encoding is safe. When tradingFeeBps
 * is omitted, the data is 17 bytes (tag + 2×u64). When included, 25 bytes.
 */
export interface UpdateRiskParamsArgs {
    initialMarginBps: bigint | string;
    maintenanceMarginBps: bigint | string;
    tradingFeeBps?: bigint | string;
}
export declare function encodeUpdateRiskParams(args: UpdateRiskParamsArgs): Uint8Array;
/**
 * RenounceAdmin instruction data (1 byte)
 * Irreversibly set admin to all zeros. After this, all admin-only instructions fail.
 */
export declare function encodeRenounceAdmin(): Uint8Array;
/**
 * CreateInsuranceMint instruction data (1 byte)
 * Creates the SPL mint PDA for insurance LP tokens. Admin only, once per market.
 */
export declare function encodeCreateInsuranceMint(): Uint8Array;
/**
 * DepositInsuranceLP instruction data (9 bytes)
 * Deposit collateral into insurance fund, receive LP tokens proportional to share.
 */
export interface DepositInsuranceLPArgs {
    amount: bigint | string;
}
export declare function encodeDepositInsuranceLP(args: DepositInsuranceLPArgs): Uint8Array;
/**
 * WithdrawInsuranceLP instruction data (9 bytes)
 * Burn LP tokens and withdraw proportional share of insurance fund.
 */
export interface WithdrawInsuranceLPArgs {
    lpAmount: bigint | string;
}
export declare function encodeWithdrawInsuranceLP(args: WithdrawInsuranceLPArgs): Uint8Array;
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
 * SetPythOracle (Tag 32) — switch a market to Pyth-pinned mode.
 *
 * After this instruction:
 * - oracle_authority is cleared → PushOraclePrice is disabled
 * - index_feed_id is set to feed_id → validated on every price read
 * - max_staleness_secs and conf_filter_bps are updated
 * - All price reads go directly to read_pyth_price_e6() with on-chain
 *   staleness + confidence + feed-ID validation (no silent fallback)
 *
 * Instruction data: tag(1) + feed_id(32) + max_staleness_secs(8) + conf_filter_bps(2) = 43 bytes
 *
 * Accounts:
 *   0. [signer, writable] Admin
 *   1. [writable]         Slab
 */
export interface SetPythOracleArgs {
    /** 32-byte Pyth feed ID. All zeros is invalid (reserved for Hyperp mode). */
    feedId: Uint8Array;
    /** Maximum age of Pyth price in seconds before OracleStale is returned. Must be > 0. */
    maxStalenessSecs: bigint;
    /** Max confidence/price ratio in bps (0 = no confidence check). */
    confFilterBps: number;
}
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
 * UpdateMarkPrice (Tag 33) — permissionless EMA mark price crank.
 *
 * Reads the current oracle price on-chain, applies 8-hour EMA smoothing
 * with circuit breaker, and writes result to authority_price_e6.
 *
 * Instruction data: 1 byte (tag only — all params read from on-chain state)
 *
 * Accounts:
 *   0. [writable] Slab
 *   1. []         Oracle account (Pyth PriceUpdateV2 / Chainlink / DEX AMM)
 *   2. []         Clock sysvar (SysvarC1ock11111111111111111111111111111111)
 *   3..N []       Remaining accounts (PumpSwap vaults, etc. if needed)
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
 * AdvanceOraclePhase (Tag 56, PERC-622) — permissionless crank.
 * Transitions market through Phase 1→2→3 based on time + volume milestones.
 * Instruction data: 1 byte (tag only — all params read from on-chain state).
 */
export declare function encodeAdvanceOraclePhase(): Uint8Array;
/**
 * TopupKeeperFund (Tag 57, PERC-623) — permissionless top-up.
 * Transfers `amount` lamports from signer into the per-slab keeper fund PDA.
 *
 * Instruction data layout: tag(1) + amount(8) = 9 bytes
 *
 * Accounts:
 *   0. [signer, writable] Payer
 *   1. [writable]         KeeperFund PDA ["keeper_fund", slab]
 *   2. []                 Slab
 *   3. []                 System program
 */
export declare function encodeTopupKeeperFund(args: {
    amount: bigint | string;
}): Uint8Array;
/**
 * SlashCreationDeposit (Tag 58, PERC-629) — slash anti-spam deposit.
 * Burns / redistributes the creation deposit for an abusive market.
 * Instruction data: 1 byte (tag only).
 *
 * Accounts:
 *   0. [signer] Admin
 *   1. [writable] Slab
 *   2. [writable] CreationDeposit PDA ["creation_deposit", slab]
 */
export declare function encodeSlashCreationDeposit(): Uint8Array;
/**
 * InitSharedVault (Tag 59, PERC-628) — initialise the global shared vault.
 * Creates the SharedVault state PDA and associated token accounts.
 * Instruction data: 1 byte (tag only — vault config read from InitMarket args).
 *
 * Accounts:
 *   0. [signer, writable] Admin
 *   1. [writable]         SharedVault PDA ["shared_vault"]
 *   2. []                 System program
 *   3. []                 Token program
 */
export declare function encodeInitSharedVault(): Uint8Array;
/**
 * AllocateMarket (Tag 60, PERC-628) — allocate virtual liquidity to a market.
 * Sets the market's allocation from the shared vault.
 *
 * Instruction data layout: tag(1) + allocationLamports(8) = 9 bytes
 *
 * Accounts:
 *   0. [signer] Admin
 *   1. [writable] SharedVault PDA
 *   2. [writable] MarketAllocation PDA ["mkt_alloc", slab]
 *   3. [] Slab
 */
export declare function encodeAllocateMarket(args: {
    allocationLamports: bigint | string;
}): Uint8Array;
/**
 * QueueWithdrawalSv (Tag 61, PERC-628) — queue a shared-vault withdrawal request.
 *
 * Instruction data layout: tag(1) + shares(8) = 9 bytes
 *
 * Accounts:
 *   0. [signer, writable] User
 *   1. [writable]         SharedVault PDA
 *   2. [writable]         WithdrawalRequest PDA ["sv_withdrawal", user, epoch]
 *   3. []                 System program
 */
export declare function encodeQueueWithdrawalSv(args: {
    shares: bigint | string;
}): Uint8Array;
/**
 * ClaimEpochWithdrawal (Tag 62, PERC-628) — claim a queued withdrawal after epoch elapses.
 * Instruction data: 1 byte (tag only — epoch derived from PDA).
 *
 * Accounts:
 *   0. [signer, writable] User (recipient)
 *   1. [writable]         SharedVault PDA
 *   2. [writable]         WithdrawalRequest PDA
 */
export declare function encodeClaimEpochWithdrawal(): Uint8Array;
/**
 * AdvanceEpoch (Tag 63, PERC-628) — advance the shared vault epoch (permissionless crank).
 * Settles pending withdrawals from the previous epoch.
 * Instruction data: 1 byte (tag only).
 *
 * Accounts:
 *   0. [signer] Cranker (anyone)
 *   1. [writable] SharedVault PDA
 *   2. [] Clock sysvar
 */
export declare function encodeAdvanceEpoch(): Uint8Array;
