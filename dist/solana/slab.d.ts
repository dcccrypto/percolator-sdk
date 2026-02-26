import { Connection, PublicKey } from "@solana/web3.js";
/**
 * Slab header (72 bytes)
 */
export interface SlabHeader {
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
/**
 * Market config (starts at offset 72)
 * Layout: collateral_mint(32) + vault_pubkey(32) + index_feed_id(32)
 *         + max_staleness_secs(8) + conf_filter_bps(2) + vault_authority_bump(1) + invert(1) + unit_scale(4)
 */
export interface MarketConfig {
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
}
/**
 * Fetch raw slab account data.
 */
export declare function fetchSlab(connection: Connection, slabPubkey: PublicKey): Promise<Uint8Array>;
/**
 * Parse slab header (first 64 bytes).
 */
export declare function parseHeader(data: Uint8Array): SlabHeader;
/**
 * Parse market config (starts at byte 72).
 * Layout: collateral_mint(32) + vault_pubkey(32) + index_feed_id(32)
 *         + max_staleness_secs(8) + conf_filter_bps(2) + vault_authority_bump(1) + invert(1) + unit_scale(4)
 */
export declare function parseConfig(data: Uint8Array): MarketConfig;
/**
 * Read nonce from slab header reserved field.
 */
export declare function readNonce(data: Uint8Array): bigint;
/**
 * Read last threshold update slot from slab header reserved field.
 */
export declare function readLastThrUpdateSlot(data: Uint8Array): bigint;
export declare function detectLayout(dataLen: number): {
    bitmapWords: number;
    accountsOff: number;
    maxAccounts: number;
} | null;
export interface InsuranceFund {
    balance: bigint;
    feeRevenue: bigint;
}
export interface RiskParams {
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
}
export interface EngineState {
    vault: bigint;
    insuranceFund: InsuranceFund;
    currentSlot: bigint;
    fundingIndexQpbE6: bigint;
    lastFundingSlot: bigint;
    fundingRateBpsPerSlotLast: bigint;
    lastCrankSlot: bigint;
    maxCrankStalenessSlots: bigint;
    totalOpenInterest: bigint;
    cTot: bigint;
    pnlPosTot: bigint;
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
    numUsedAccounts: number;
    nextAccountId: bigint;
}
export declare enum AccountKind {
    User = 0,
    LP = 1
}
export interface Account {
    kind: AccountKind;
    accountId: bigint;
    capital: bigint;
    pnl: bigint;
    reservedPnl: bigint;
    warmupStartedAtSlot: bigint;
    warmupSlopePerStep: bigint;
    positionSize: bigint;
    entryPrice: bigint;
    fundingIndex: bigint;
    matcherProgram: PublicKey;
    matcherContext: PublicKey;
    owner: PublicKey;
    feeCredits: bigint;
    lastFeeSlot: bigint;
}
/**
 * Parse RiskParams from engine data.
 * Note: invert/unitScale are in MarketConfig, not RiskParams.
 */
export declare function parseParams(data: Uint8Array): RiskParams;
/**
 * Parse RiskEngine state (excluding accounts array).
 */
export declare function parseEngine(data: Uint8Array): EngineState;
/**
 * Read bitmap to get list of used account indices.
 */
export declare function parseUsedIndices(data: Uint8Array): number[];
/**
 * Check if a specific account index is used.
 */
export declare function isAccountUsed(data: Uint8Array, idx: number): boolean;
/**
 * Calculate the maximum valid account index for a given slab size.
 */
export declare function maxAccountIndex(dataLen: number): number;
/**
 * Parse a single account by index.
 */
export declare function parseAccount(data: Uint8Array, idx: number): Account;
/**
 * Parse all used accounts.
 * Filters out indices that would be beyond the slab's account storage capacity.
 */
export declare function parseAllAccounts(data: Uint8Array): {
    idx: number;
    account: Account;
}[];
