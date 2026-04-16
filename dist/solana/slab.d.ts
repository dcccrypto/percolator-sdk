import { Connection, PublicKey } from "@solana/web3.js";
/** Slab magic number ("PERCOLAT" as little-endian u64). */
export declare const SLAB_MAGIC: bigint;
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
    postBitmap: number;
    acctOwnerOff: number;
    hasInsuranceIsolation: boolean;
    engineInsuranceIsolatedOff: number;
    engineInsuranceIsolationBpsOff: number;
}
export declare const ENGINE_OFF = 600;
export declare const ENGINE_MARK_PRICE_OFF = 400;
/**
 * V2 slab tier sizes (small and large) for discovery.
 * V2 uses ENGINE_OFF=600, BITMAP_OFF=432, ACCOUNT_SIZE=248, postBitmap=18.
 * Sizes overlap with V1D (postBitmap=2) — disambiguation requires reading the version field.
 */
export declare const SLAB_TIERS_V2: {
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
};
/**
 * V1M slab tier sizes — mainnet-deployed V1 program (ESa89R5).
 * ENGINE_OFF=640, BITMAP_OFF=726, ACCOUNT_SIZE=248, postBitmap=18.
 * Expanded RiskParams (336 bytes) and trade_twap runtime fields.
 * Confirmed by on-chain probing of slab 8NY7rvQ (SOL/USDC Perpetual, 257512 bytes).
 */
export declare const SLAB_TIERS_V1M: Record<string, {
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
export declare const SLAB_TIERS_V1M2: Record<string, {
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
export declare const SLAB_TIERS_V_ADL: Record<string, {
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
export declare const SLAB_TIERS_V_SETDEXPOOL: Record<string, {
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
export declare const SLAB_TIERS_V12_1: Record<string, {
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
export declare const SLAB_TIERS_V12_15: Record<string, {
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
export declare const SLAB_TIERS_V12_17: Record<string, {
    maxAccounts: number;
    dataSize: number;
    label: string;
    description: string;
}>;
/**
 * Detect the slab layout version from the raw account data length.
 * Returns the full SlabLayout descriptor, or null if the size is unrecognised.
 * Checks V12_15, V12_1_EP, V12_1, V_SETDEXPOOL, V1M2, V_ADL, V1M, V0, V1D, V1D-legacy, V1, and V1-legacy sizes.
 *
 * When `data` is provided and the size matches V1D, the version field at offset 8 is read
 * to disambiguate V2 slabs (which produce identical sizes to V1D with postBitmap=2).
 * V2 slabs have version===2 at offset 8 (u32 LE).
 *
 * @param dataLen - The slab account data length in bytes
 * @param data    - Optional raw slab data for version-field disambiguation
 */
export declare function detectSlabLayout(dataLen: number, data?: Uint8Array): SlabLayout | null;
/**
 * Legacy detectLayout for backward compat.
 * Returns { bitmapWords, accountsOff, maxAccounts } or null.
 *
 * GH#1238: previously recomputed accountsOff with hardcoded postBitmap=18, which gave a value
 * 16 bytes too large for V1D slabs (which use postBitmap=2). Now delegates directly to the
 * SlabLayout descriptor so each variant uses its own correct accountsOff.
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
    /** @deprecated Removed in V12_1 — always 0 */ fundingPremiumWeightBps: bigint;
    /** @deprecated Removed in V12_1 — always 0 */ fundingSettlementIntervalSlots: bigint;
    /** @deprecated Removed in V12_1 — always 0 */ fundingPremiumDampeningE6: bigint;
    /** @deprecated Removed in V12_1 — always 0 */ fundingPremiumMaxBpsPerSlot: bigint;
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
export interface InsuranceFund {
    balance: bigint;
    feeRevenue: bigint;
    isolatedBalance: bigint;
    isolationBps: number;
}
export interface RiskParams {
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
export interface EngineState {
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
export declare enum AccountKind {
    User = 0,
    LP = 1
}
/** Parsed reserve cohort (64 bytes on-chain). Raw bytes; structure is program-internal. */
export type ReserveCohortBytes = Uint8Array;
export interface Account {
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
 *
 * @param data - Slab data (may be a partial slice for discovery; pass layoutHint in that case)
 * @param layoutHint - Pre-detected layout to use; if omitted, detected from data.length.
 */
export declare function parseConfig(data: Uint8Array, layoutHint?: SlabLayout | null): MarketConfig;
/**
 * Parse RiskParams from engine data. Layout-version aware.
 * For V0 slabs, extended params (risk_threshold, maintenance_fee, etc.) are
 * not present on-chain, so defaults (0) are returned.
 *
 * @param data - Slab data (may be a partial slice; pass layoutHint in that case)
 * @param layoutHint - Pre-detected layout to use; if omitted, detected from data.length.
 */
export declare function parseParams(data: Uint8Array, layoutHint?: SlabLayout | null): RiskParams;
/**
 * Parse RiskEngine state (excluding accounts array). Layout-version aware.
 */
export declare function parseEngine(data: Uint8Array): EngineState;
/**
 * Read bitmap to get list of used account indices.
 */
/**
 * Return all account indices whose bitmap bit is set (i.e. slot is in use).
 * Uses the layout-aware bitmap offset so V1_LEGACY slabs (bitmap at rel+672) are handled correctly.
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
