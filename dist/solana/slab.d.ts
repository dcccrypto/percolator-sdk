import { Connection, PublicKey } from "@solana/web3.js";
/**
 * Full slab layout descriptor. Returned by detectSlabLayout().
 * All engine field offsets are relative to engineOff.
 */
export interface SlabLayout {
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
    hasInsuranceIsolation: boolean;
    engineInsuranceIsolatedOff: number;
    engineInsuranceIsolationBpsOff: number;
}
export declare const ENGINE_OFF = 640;
export declare const ENGINE_MARK_PRICE_OFF = 400;
/**
 * Detect slab layout version from data length.
 * Returns a full SlabLayout descriptor or null if unrecognized.
 */
export declare function detectSlabLayout(dataLen: number): SlabLayout | null;
/**
 * Legacy detectLayout for backward compat.
 * Returns { bitmapWords, accountsOff, maxAccounts } or null.
 */
export declare function detectLayout(dataLen: number): {
    bitmapWords: number;
    accountsOff: number;
    maxAccounts: number;
} | null;
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
    fundingPremiumWeightBps: bigint;
    fundingSettlementIntervalSlots: bigint;
    fundingPremiumDampeningE6: bigint;
    fundingPremiumMaxBpsPerSlot: bigint;
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
    resolvedSlot: bigint;
    insuranceIsolationBps: number;
}
export interface InsuranceFund {
    balance: bigint;
    feeRevenue: bigint;
    isolatedBalance: bigint;
    isolationBps: number;
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
    longOi: bigint;
    shortOi: bigint;
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
    emergencyOiMode: boolean;
    emergencyStartSlot: bigint;
    lastBreakerSlot: bigint;
    numUsedAccounts: number;
    nextAccountId: bigint;
    markPriceE6: bigint;
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
export declare function fetchSlab(connection: Connection, slabPubkey: PublicKey): Promise<Uint8Array>;
export declare const RAMP_START_BPS = 1000n;
export declare const DEFAULT_OI_RAMP_SLOTS = 432000n;
export declare function computeEffectiveOiCapBps(config: MarketConfig, currentSlot: bigint): bigint;
export declare function readNonce(data: Uint8Array): bigint;
export declare function readLastThrUpdateSlot(data: Uint8Array): bigint;
/**
 * Parse slab header (first 72 bytes — layout-independent).
 */
export declare function parseHeader(data: Uint8Array): SlabHeader;
/**
 * Parse market config. Layout-version aware.
 * For V0 slabs, fields beyond the basic config are read if present in the data,
 * otherwise defaults are returned.
 */
export declare function parseConfig(data: Uint8Array): MarketConfig;
/**
 * Parse RiskParams from engine data. Layout-version aware.
 * For V0 slabs, extended params (risk_threshold, maintenance_fee, etc.) are
 * not present on-chain, so defaults (0) are returned.
 */
export declare function parseParams(data: Uint8Array): RiskParams;
/**
 * Parse RiskEngine state (excluding accounts array). Layout-version aware.
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
 */
export declare function parseAllAccounts(data: Uint8Array): {
    idx: number;
    account: Account;
}[];
