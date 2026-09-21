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
export declare const V17_EXPECTED_VERSION = 18;
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
export declare const V17_WRAPPER_CONFIG_LEN = 576;
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
export declare const V17_CREATOR_FEE_CLAIMABLE_OFF = 568;
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
export declare const V17_ASSET_ORACLE_PROFILE_LEN = 512;
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
export declare const V17_ASSET_ORACLE_WRAPPER_LEN = 1024;
/**
 * v18 NEW: byte offset of `AssetControlSequencesV16` within each asset's
 * {@link V17_ASSET_ORACLE_WRAPPER_LEN}-byte wrapper slot. Collapses to
 * `= V17_ASSET_ORACLE_PROFILE_LEN` (TB-2a, matching upstream `ef3b1a55`'s own definition).
 */
export declare const V17_ASSET_CONTROL_SEQUENCES_OFF = 512;
/**
 * v18 NEW: `size_of::<AssetControlSequencesV16>()` — 9 strictly-increasing
 * replay-nonce lanes (oracle_observation, backing_fee_long, backing_fee_short,
 * trade_fee, liquidation_fee, maintenance_fee, fee_redirect, market_init_fee,
 * permissionless_resolve) + TB-2b's `authority_epoch` CAS lane + an 8B
 * reserved tail, matching upstream `ef3b1a55`'s struct size exactly (88B total).
 */
export declare const V17_ASSET_CONTROL_SEQUENCES_LEN = 88;
/**
 * v18 NEW (W4-AE-84): byte offset of the market-wide
 * `protocol_fee_authority_epoch` CAS counter, gating `WithdrawProtocolFee`
 * (tag 84) against a replayed signed withdrawal surviving an intervening
 * `SetProtocolFeeAuthority` (tag 85) A->B->A cycle. Market-wide, not
 * per-asset — only asset 0's copy is ever read or written (same precedent as
 * `AssetOracleProfileV16::maintenance_fee_checkpoint_slot`/
 * `terminal_slab_scan_progress`).
 */
export declare const V17_PROTOCOL_FEE_AUTHORITY_EPOCH_OFF: number;
/** A single u64 counter — no struct needed. */
export declare const V17_PROTOCOL_FEE_AUTHORITY_EPOCH_LEN = 8;
/** Decoded `AssetControlSequencesV16` — per-asset replay-nonce/CAS watermarks (v18 NEW, TB-2a/TB-2b). */
export interface AssetControlSequencesV17 {
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
export declare function parseAssetControlSequencesV17(data: Uint8Array, assetSlotOff: number): AssetControlSequencesV17;
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
export declare function parseProtocolFeeAuthorityEpoch(data: Uint8Array, asset0SlotOff: number): bigint;
/** v17 header length (16 bytes: magic[8] + version[2] + kind[1] + pad[1] + reserved[4]). */
export declare const V17_HEADER_LEN = 16;
/**
 * v17 market group config offset = HEADER_LEN + WRAPPER_CONFIG_LEN = 592
 * (was 512 pre-fee-split when WRAPPER_CONFIG_LEN was 496, and 448 before the
 * protocol-fee change when it was 432). DERIVED, never hardcoded — every
 * downstream offset in this file chains off it.
 */
export declare const V17_MARKET_GROUP_OFF: number;
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
export declare const V17_MARKET_GROUP_LEN = 758;
export declare const V17_MARKET_ASSET_SLOT_LEN = 2325;
/**
 * Exact byte length of a v17 market (slab) account for a given asset-slot capacity, matching the
 * program's state::market_account_len_for_capacity. v17 markets are DYNAMICALLY sized — the wrapper's
 * InitMarket validates that (len - V17_MARKET_GROUP_OFF - V17_MARKET_GROUP_LEN) is an exact multiple of
 * V17_MARKET_ASSET_SLOT_LEN, so a v12 SLAB_TIERS byte count (e.g. 992_568) makes InitMarket REVERT.
 * Size the account with this for maxPortfolioAssets (cap-1 = 3003, cap-14 = 26_364).
 */
export declare function v17MarketAccountLen(maxPortfolioAssets: number): number;
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
export declare const V17_PORTFOLIO_ACCOUNT_LEN = 9563;
/** `PortfolioLegV16Account` grew 144 -> 152 bytes: see {@link V17_PORTFOLIO_ACCOUNT_LEN}'s doc comment. */
export declare const V17_PORTFOLIO_LEG_SIZE = 152;
/**
 * The wrapper-owned identity trailer appended AFTER `PortfolioMatcherConfigV16`
 * (TB-1a): `portfolio_id: u64` + `matcher_sequence(expected_sequence): u64` +
 * `matcher_expiry_slot: u64` = 24 bytes total.
 */
export declare const V17_PORTFOLIO_IDENTITY_TRAILER_LEN = 24;
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
/**
 * Aggregated open-interest parsed from a v17 market group account.
 *
 * The v17 engine stores OI per-asset (per Market<T> slot) as oi_eff_long_q and
 * oi_eff_short_q in AssetStateV16Account. This parser sums across all capacity
 * slots in the account and also returns per-asset breakdown.
 *
 * All quantities are in token micro-units (raw, not scaled by decimals).
 */
export interface V17MarketGroupOI {
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
 * which follows the 512-byte wrapper T at the start of each slot).
 *
 * Relative offsets verified with `offset_of!` against the engine's own `#[repr(C)]`
 * structs (`percolator/src/v16.rs`): `MarketGroupV16HeaderAccount::insurance` @ 301,
 * `AssetStateV16Account::oi_eff_long_q` @ 273, `oi_eff_short_q` @ 289. Every
 * `V16Pod*` field is an align-1 `[u8; N]` and the structs derive `bytemuck::Pod`
 * (which forbids implicit padding), so these are exact byte offsets.
 *
 * The absolute offsets below follow from the CURRENT wrapper layout —
 * WRAPPER_CONFIG_LEN = 576 and V17_MARKET_GROUP_OFF = 16 + 576 = 592
 * (`v16_program.rs` HEADER_LEN/WRAPPER_CONFIG_LEN, with a compile-time
 * `assert!(size_of::<WrapperConfigV16>() == WRAPPER_CONFIG_LEN)`):
 * - slots base:        V17_MARKET_GROUP_OFF(592) + V17_MARKET_GROUP_LEN(758) = 1350
 * - insurance:         592 + 301 = 893
 * - oi_eff_long_q(i):  1350 + i×1797 + 512 + 273 = 2135 + i×1797
 * - oi_eff_short_q(i): 1350 + i×1797 + 512 + 289 = 2151 + i×1797
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
export declare function parseMarketGroupV17OI(data: Uint8Array): V17MarketGroupOI;
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
export declare function decodePortfolioMatcherControl(control: bigint): {
    enabled: boolean;
    positionEpoch: bigint;
    tradeFeeCapBps: number;
};
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
