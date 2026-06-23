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
    configMarkEwmaOff?: number;
}
export declare const ENGINE_OFF = 600;
export declare const ENGINE_MARK_PRICE_OFF = 400;
/**
 * V2 slab tier sizes (small and large) for discovery.
 * V2 uses ENGINE_OFF=600, BITMAP_OFF=432, ACCOUNT_SIZE=248, postBitmap=18.
 * Sizes overlap with V1D (postBitmap=2) — disambiguation requires reading the version field.
 */
export declare const SLAB_TIERS_V2: Readonly<{
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
export declare const SLAB_TIERS_V12_19: Record<string, {
    maxAccounts: number;
    dataSize: number;
    label: string;
    description: string;
}>;
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
export declare function fetchSlab(connection: Connection, slabPubkey: PublicKey, expectedOwner?: PublicKey): Promise<Uint8Array>;
export declare const RAMP_START_BPS = 1000n;
export declare const DEFAULT_OI_RAMP_SLOTS = 432000n;
export declare function computeEffectiveOiCapBps(config: MarketConfig, currentSlot: bigint): bigint;
export declare function readNonce(data: Uint8Array): bigint;
export declare function readLastThrUpdateSlot(data: Uint8Array): bigint;
/**
 * Parse slab header (first 72 bytes — layout-independent).
 */
export declare function parseHeader(data: Uint8Array): SlabHeader;
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
 * v17 account magic ("PERCV16\0" as little-endian u64).
 * Stored at bytes [0..8] of every v17 percolator-owned account.
 * bytes[0..8] = [0x00, 0x36, 0x31, 0x56, 0x43, 0x52, 0x45, 0x50]
 */
export declare const V17_MAGIC = 5784119745589622272n;
/** v17 account version (u16 at offset 8). */
export declare const V17_EXPECTED_VERSION = 16;
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
export declare const V17_KIND_MARKET = 1;
/** Byte offset of the v17 account-kind discriminator within the header. */
export declare const V17_KIND_OFF = 10;
/** v17 wrapper config block length (WrapperConfigV16 = 432 bytes). */
export declare const V17_WRAPPER_CONFIG_LEN = 432;
/** v17 AssetOracleProfileV16 length (400 bytes). */
export declare const V17_ASSET_ORACLE_PROFILE_LEN = 400;
/** v17 header length (16 bytes: magic[8] + version[2] + kind[1] + pad[1] + reserved[4]). */
export declare const V17_HEADER_LEN = 16;
/** v17 market group config offset = HEADER_LEN + WRAPPER_CONFIG_LEN = 448. */
export declare const V17_MARKET_GROUP_OFF: number;
/**
 * v17 MarketGroupV16HeaderAccount size (758 bytes) and per-asset slot stride (1797 bytes),
 * verified against percolator-prog `cargo run --example dump_layout`.
 */
export declare const V17_MARKET_GROUP_LEN = 758;
export declare const V17_MARKET_ASSET_SLOT_LEN = 1797;
/**
 * Exact byte length of a v17 market (slab) account for a given asset-slot capacity, matching the
 * program's state::market_account_len_for_capacity. v17 markets are DYNAMICALLY sized — the wrapper's
 * InitMarket validates that (len - V17_MARKET_GROUP_OFF - V17_MARKET_GROUP_LEN) is an exact multiple of
 * V17_MARKET_ASSET_SLOT_LEN, so a v12 SLAB_TIERS byte count (e.g. 992_568) makes InitMarket REVERT.
 * Size the account with this for maxPortfolioAssets (cap-1 = 3003, cap-14 = 26_364).
 */
export declare function v17MarketAccountLen(maxPortfolioAssets: number): number;
/**
 * v17 portfolio account total length = HEADER_LEN(16) + PortfolioAccountV16Account(9227) +
 * PORTFOLIO_MATCHER_CONFIG_LEN(104) = 9347. Single source of truth for the System.createAccount
 * size/rent: the program's InitPortfolio reallocs UP to this and adds no lamports, so an undersized
 * createAccount (e.g. 2048) leaves the account below rent-exempt → InitPortfolio fails with
 * InsufficientFundsForRent. (Matches the keeper's getProgramAccounts dataSize filter.)
 */
export declare const V17_PORTFOLIO_ACCOUNT_LEN = 9347;
/**
 * Parsed WrapperConfigV16 — the 432-byte v17 market config block.
 *
 * Field offsets follow SBF alignment (u128 align=8, not 16).
 * Full offset table (verified against v17 wrapper source v16_program.rs):
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
 *  Total: 432
 */
export interface WrapperConfigV17 {
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
}
/**
 * Parse a v17 WrapperConfigV16 block from raw account data.
 *
 * The config block starts at offset `configOff` (default: V17_HEADER_LEN = 16).
 *
 * IMPORTANT: v17 uses a completely different account structure from v12.x slabs.
 * This function reads the 432-byte wrapper config block directly. It does NOT
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
export declare function parseWrapperConfigV17(data: Uint8Array, configOff?: number): WrapperConfigV17;
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
export interface AssetOracleProfileV17 {
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
}
/**
 * Parse a v17 AssetOracleProfileV16 block from raw account data.
 *
 * @param data      Raw bytes containing the profile block.
 * @param profileOff Byte offset where the AssetOracleProfileV16 starts.
 * @returns Parsed AssetOracleProfileV17 object.
 */
export declare function parseAssetOracleProfileV17(data: Uint8Array, profileOff: number): AssetOracleProfileV17;
/**
 * Check if a raw account buffer contains a v17 percolator account.
 *
 * @param data Raw account bytes.
 * @returns true if magic == V17_MAGIC and version == V17_EXPECTED_VERSION.
 */
export declare function isV17Account(data: Uint8Array): boolean;
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
export declare function isV17MarketAccount(data: Uint8Array): boolean;
/** Per-leg decoded data returned by parsePortfolioV17. */
export interface PortfolioLegV17 {
    active: boolean;
    assetIndex: number;
    marketId: bigint;
    /** 0 = long, 1 = short */
    side: number;
    basisPosQ: bigint;
    aBasis: bigint;
    kSnap: bigint;
    fSnap: bigint;
    epochSnap: bigint;
    lossWeight: bigint;
    bSnap: bigint;
    bRem: bigint;
    bEpochSnap: bigint;
    bStale: boolean;
    stale: boolean;
}
/** Per source-domain slot returned by parsePortfolioV17. */
export interface PortfolioSourceDomainV17 {
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
export interface PortfolioV17 {
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
export declare function parsePortfolioV17(data: Uint8Array): PortfolioV17;
/** Decoded v17 LpVaultRegistryV16 account. */
export interface LpVaultRegistryV17 {
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
export declare function parseLpVaultRegistry(data: Uint8Array): LpVaultRegistryV17;
/** Decoded v17 LpRedemptionV16 account. */
export interface LpRedemptionV17 {
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
export declare function parseLpRedemption(data: Uint8Array): LpRedemptionV17;
/**
 * Parse all used accounts.
 */
export declare function parseAllAccounts(data: Uint8Array): {
    idx: number;
    account: Account;
}[];
