import type { LayoutTable } from "./layout.js";
import type { InitMarketV17Args, InitMarketArgs } from "./instructions.js";
import type { MatcherCallExt } from "./matcher-v2.js";
/** `growth_v19::BPS`. */
export declare const GROWTH_BPS = 10000n;
/** `growth_v19::MAX_IMR_BPS` (100% initial margin = 1x). */
export declare const GROWTH_MAX_IMR_BPS = 10000n;
/** `growth_v19::LEVERAGE_X100_ONE` (1x). */
export declare const GROWTH_LEVERAGE_X100_ONE = 100;
/** `growth_v19::MAX_LAMBDA_BPS` (10x of capital). */
export declare const GROWTH_MAX_LAMBDA_BPS = 100000;
/**
 * Tag-93 growth trailer bounds WITHOUT the epoch clamp (`growth_dials_ok(false, ..)`, the only mode
 * enabled today): lambda in [1, 10_000], kink in [0, 5_000]. With the clamp (`EPOCH_CLAMP_ENFORCED`,
 * not yet enabled) the wrapper would allow lambda up to 100_000 and kink up to 10_000.
 */
export declare const GROWTH_DIALS_NO_CLAMP_MAX_LAMBDA_BPS = 10000;
/** See {@link GROWTH_DIALS_NO_CLAMP_MAX_LAMBDA_BPS}. */
export declare const GROWTH_DIALS_NO_CLAMP_MAX_KINK_BPS = 5000;
/** `DEPTH_MULT`: the ext-v3 liquidity depth multiple of `lambda * C_m / 1e4`. */
export declare const GROWTH_DEPTH_MULT = 4n;
/** Engine `MAX_POSITION_ABS_Q` (1e14): upper clamp of the ext-v3 `inventory_cap_q`. */
export declare const GROWTH_MAX_POSITION_ABS_Q = 100000000000000n;
/** Tag 94 on a growth asset pins `matcher_ext_mode = 1` (P2 call extension on). */
export declare const GROWTH_PIN_MATCHER_EXT_MODE = 1;
/**
 * Tag 94 on a growth asset pins a requested-fee cap of 100 bps: the taker's signed `fee_bps` must
 * cover the base fee plus up to this much (the matcher's spread is paid to the LP as a fee).
 */
export declare const GROWTH_PIN_MAX_REQUESTED_FEE_BPS = 100;
/** Tag 94 on a growth asset pins an LP floor of 1_000_000 atoms ($1 on a 6-decimal mint). */
export declare const GROWTH_PIN_LP_FLOOR_ATOMS = 1000000n;
/** Tag 94 on a growth asset binds a kind-2 (adaptive) matcher context. */
export declare const GROWTH_PIN_MATCHER_KIND = 2;
/** `AssetGrowthV19::version` of an enabled block (`GROWTH_VERSION`). */
export declare const GROWTH_VERSION = 1;
/** Engine `POS_SCALE` used by `n_cap_q` callers. */
export declare const GROWTH_POS_SCALE = 1000000n;
/** `ASSET_GROWTH_OFF`: record offset inside each asset's 1024-byte wrapper slot. */
export declare const ASSET_GROWTH_SLOT_OFF = 672;
/** `ASSET_GROWTH_LEN`. */
export declare const ASSET_GROWTH_LEN = 120;
/** `AssetGrowthV19::version` field offset (the one-byte OFF fast path reads only this). */
export declare const ASSET_GROWTH_VERSION_FIELD_OFF = 38;
/** Length of one wrapper asset slot (same stride base as `AssetRiskLimitsV17`). */
export declare const ASSET_WRAPPER_SLOT_LEN = 1024;
/**
 * Field offsets inside the 120-byte `AssetGrowthV19` record (rustc `repr(C)`, no u128), as of the v2.2 controller round
 * (percolator-prog `feat/v22-growth-controller` @ `666df893`, `offset_of!` asserts `src/v16_program.rs` "Round 3 item 4 allocation claims").
 * Bytes 0..4 / 4..8 are the volatility EWMA and the rent stamp ONLY when `flags` bit 0 ({@link GROWTH_FLAG_R3_LAYOUT}) is set; a record
 * without it (written by the combined build or earlier) still holds the retired `c_launch_atoms` u64 there
 * ({@link ASSET_GROWTH_LEGACY_FIELD_OFF}). Bytes 30..38 are the time-weighted depth window (were the dead growth-1 dials, always 0).
 */
export declare const ASSET_GROWTH_FIELD_OFF: Readonly<{
    readonly volVarX100: 0;
    readonly rentStamp64: 4;
    readonly ceilSlot: 8;
    readonly lambdaBps: 16;
    readonly lLaunchX100: 20;
    readonly lTierX100: 22;
    readonly ceilX100: 24;
    readonly kinkBps: 26;
    readonly rGapBps: 28;
    readonly depthTwCur: 30;
    readonly depthTwPrev: 34;
    readonly version: 38;
    readonly flags: 39;
    readonly utilFeeMaxBps: 40;
    readonly reserved: 42;
}>;
/**
 * The PRE-controller meaning of the reused bytes (records with `flags == 0`: the combined build `153c62fc` and f6e7180d). `cLaunchAtoms`
 * (u64 at 0..8) is retired: the program reads it as "no volatility data, no rent stamp" until the first push migrates the record. The four
 * dials at 30..38 were validated 0 and are now the depth window (bucket 0 = no history). Kept so tooling can still name the old bytes.
 */
export declare const ASSET_GROWTH_LEGACY_FIELD_OFF: Readonly<{
    readonly cLaunchAtoms: 0;
    readonly allocAlphaBps: 30;
    readonly allocBufferBps: 32;
    readonly cushionTargetBps: 34;
    readonly cushionShareBps: 36;
}>;
/**
 * v2.2 G8 depth fields, relative to the record start (inside the formerly reserved bytes; 42..44 = rent kink, 48..56 = rent
 * N_cap). Kept apart from {@link ASSET_GROWTH_FIELD_OFF}, which is pinned against the crate's `offset_of!` fixture.
 */
export declare const ASSET_GROWTH_DEPTH_FIELD_OFF: Readonly<{
    readonly depthSource: 44;
    readonly attestedMaxTier: 45;
    readonly collateralDecimalsP1: 46;
    readonly depthE6: 56;
    readonly depthSlot: 64;
    readonly depthPrevE6: 72;
    readonly depthLastGoodE6: 80;
    readonly depthLastGoodSlot: 88;
    readonly tierThresholdUsd: 96;
    readonly tierLeverageX100: 108;
    readonly depthRiseSlot64: 114;
    readonly depthTwBucket: 118;
}>;
/** N-2: utilisation fee at `u = 1` when the per-asset dial is 0 (bps of the opening notional). */
export declare const GROWTH_UTIL_FEE_DEFAULT_BPS = 500;
/** N-2: hard ceiling of the per-asset utilisation-fee dial. */
export declare const GROWTH_UTIL_FEE_HARD_MAX_BPS = 2000;
/** `R_GAP_MIN_LIQUIDATION_SLOTS` (L-2): liquidation latency, in slots, behind the `r_gap` floor. */
export declare const R_GAP_MIN_LIQUIDATION_SLOTS = 50n;
/** `GROWTH_BATCH_MAX_LEGS`: a BatchTradeCpi carrying ANY growth leg is refused above this many legs. */
export declare const GROWTH_BATCH_MAX_LEGS = 10;
/** `EXT_FLAG_TAKER_REDUCING` (byte 1, bit 3). */
export declare const MATCHER_CALL_EXT_FLAG_TAKER_REDUCING = 8;
/** `CALL_EXT_V3_VERSION`. */
export declare const MATCHER_CALL_EXT_VERSION_V3 = 3;
/** v2 block length (24-byte v1 + i128 lp_position_q). */
export declare const MATCHER_CALL_EXT_V2_LEN = 40;
/** v3 block length (v2 + u128 inventory_cap_q + u128 liquidity_notional_e6). */
export declare const MATCHER_CALL_EXT_V3_LEN = 72;
/** `CALL_EXT_VERSION_V2`. */
export declare const MATCHER_CALL_EXT_VERSION_V2 = 2;
type Num = bigint | number;
/**
 * The stored time-weighted depth window (`growth_v19::DepthWindow`; record bytes 30..34, 34..38, 118..120).
 * `bucketP1 == 0` = no window history (every record written before the controller round).
 */
export interface DepthWindow {
    /** Minimum fresh reading in the current 750-slot bucket, WHOLE collateral tokens (floor). */
    curTokens: number;
    /** Minimum of the previous adjacent bucket, or {@link DEPTH_TW_ABSENT} (`u32::MAX`). */
    prevTokens: number;
    /** `(slot / 750) % 65,535 + 1`; 0 = no history. */
    bucketP1: number;
}
/** Decoded `AssetGrowthV19` (version != 0). */
export interface AssetGrowthV19 {
    /**
     * @deprecated Retired by the controller round (bytes 0..8 now carry the volatility EWMA and the rent stamp). Legacy records
     * (`flags` bit 0 clear) still hold the old `c_launch_atoms` there and it is returned here; on a migrated record this is `0n`.
     * Nothing on chain reads it.
     */
    cLaunchAtoms: bigint;
    /** `flags` bit 0 ({@link GROWTH_FLAG_R3_LAYOUT}): bytes 0..8 hold controller data (variance + rent stamp). */
    r3Layout: boolean;
    /** `flags` bit 1 ({@link GROWTH_FLAG_VOL_DATA}): the variance has at least one sample (else the volatility term reads "no data" = launch). */
    volHasData: boolean;
    /** Round 3 item 6 (bytes 0..4, u32): EWMA variance of the authenticated mark, bps^2 per slot x100. 0 unless {@link AssetGrowthV19.r3Layout} (`vol_var_x100()`). */
    volVarX100: number;
    /** Round 3 item 7 (bytes 4..8, u32): rent-snapshot stamp `slot / 64 + 1` of the last applied fall; 0 = none (and on a legacy record). */
    rentStamp64: number;
    /** Round 3 item 4: the time-weighted depth window (`depth_tw()`). */
    depthTw: DepthWindow;
    /** Slot of the last ceiling change. */
    ceilSlot: bigint;
    /** `N_cap = lambda * C_m / P`; 10_000 = 1x of capital. */
    lambdaBps: number;
    /** Creator's starting leverage cap, x100. */
    lLaunchX100: number;
    /** Protocol tier maximum, x100 (floor(1e6 / engine IMR) at enable time). */
    lTierX100: number;
    /** Current graduated ceiling, x100 (== launch while graduation is off). */
    ceilX100: number;
    /** Utilisation kink u_k (bps). */
    kinkBps: number;
    /** Worst move between liquidation opportunities (bps). */
    rGapBps: number;
    version: number;
    /** Raw `flags` byte 39 (bits 0..1 only; bit 1 requires bit 0: {@link growthFlagsOk}). */
    flags: number;
    /** Item 2: the holding-fee rent kink u_k (bps, bytes 42..44). */
    rentKinkBps: number;
    /** Item 2 (+ round 3 item 7 smoothing): the rent `N_cap` snapshot (engine Q, bytes 48..56); 0 = not measured. */
    rentNCapQ: bigint;
    /** N-2: stored utilisation-fee dial at `u = 1` (bps); 0 = {@link GROWTH_UTIL_FEE_DEFAULT_BPS}. */
    utilFeeMaxBps: number;
    /** v2.2 G8: source of the stored depth (byte 44 bits 0-1): 0 = none, 1 = keeper-attested (PushAuthMark mode 1), 2 = on-chain DEX pool (mode 2). */
    depthSource: number;
    /** R2.1 (W-M1): byte 44 bit 7 `DEPTH_EVER`: a fresh effective depth was seen once; the depth cap then never switches off. */
    depthEver: boolean;
    /** Byte 44 bit 2 `DEPTH_PREV_REAL`: the sample before the stored one was a real reading (a 0 included), not an absent one. */
    depthPrevReal: boolean;
    /**
     * v2.2 DEATH F-3: byte 44 bit 6 {@link DEPTH_DEX_PINNED}: the asset's depth is pinned to an on-chain DEX pool (tag 123 op 1, or any
     * PushAuthMark mode-2 reading). While set, a mode-1 (keeper-attested) push is refused whole with 129 `DepthSourceInvalid`, mark included.
     */
    depthDexPinned: boolean;
    /** R2.1: highest venue tier keeper-attested depth may earn (45; 0 = protocol default 1, max 3). */
    attestedMaxTier: number;
    /** v2.2 G8: last pushed +-2% depth, USD e6 (collateral 6 decimals). 0 when absent. */
    depthE6: bigint;
    /** v2.2 G8: slot of the last depth push. */
    depthSlot: bigint;
    /** v2.2 G8: the depth before the last push (effective depth is the min of the two). */
    depthPrevE6: bigint;
    /**
     * R2.1 (80) + R2-M1: the RATE-LIMITED last good depth (collateral atoms): rises at most 2x per 9,000-slot epoch, falls at once; the sticky
     * cap's input and, with the fresh reading, the usable depth every tier and cap reads ({@link usableDepthE6}).
     */
    depthLastGoodE6: bigint;
    /** R2.1 (88): slot of that sample. */
    depthLastGoodSlot: bigint;
    /** R2-L2 (46): the collateral mint's decimals + 1 as stored (0 = a pre-R2-L2 record, read as 6 decimals). */
    collateralDecimalsP1: number;
    /** R2-L2: the collateral mint's decimals (byte 46; 6 when unset). Tier thresholds are whole collateral tokens scaled by this. */
    collateralDecimals: number;
    /** R2-M1 / D-L2 (114, u32 LE): the slot of the last rise of {@link AssetGrowthV19.depthLastGoodE6} in 64-slot units (`slot / 64`, saturating). */
    depthRiseSlot64: number;
    /** R2.1 (96): per-market tier thresholds in WHOLE COLLATERAL TOKENS (T1, T2, T3; $ on 6-decimal USD collateral); 0 = default 25,000 / 100,000 / 500,000. */
    tierThresholdUsd: Triple<number>;
    /** R2.1 (108): per-tier max leverage x100 (L1, L2, L3); 0 = default `min(5x / 10x / 20x, L_tier)`. */
    tierLeverageX100: Triple<number>;
}
/**
 * Decode one 120-byte `AssetGrowthV19` record.
 *
 * @param rec  The 120 bytes (record only, not the slot).
 * @returns The decoded record, or `null` when `version == 0` (growth OFF; the wrapper reads only
 *          the version byte on this path and treats the whole record as inert).
 * @example
 * ```ts
 * const g = decodeAssetGrowthRecordV19(slot.subarray(672, 792));
 * if (g === null) { // growth off: engine leverage applies }
 * ```
 */
export declare function decodeAssetGrowthRecordV19(rec: Uint8Array): AssetGrowthV19 | null;
/**
 * Decode the growth record from one 1024-byte asset wrapper slot (record at slot + 672).
 *
 * @param slot  The asset's wrapper slot (>= 792 bytes; normally 1024).
 * @returns Decoded record or `null` when growth is OFF.
 * @example
 * ```ts
 * decodeAssetGrowthFromSlotV19(marketData.subarray(slotStart, slotStart + 1024));
 * ```
 */
export declare function decodeAssetGrowthFromSlotV19(slot: Uint8Array): AssetGrowthV19 | null;
/**
 * Absolute account offset of asset `i`'s `AssetGrowthV19`: 592 + 758 + 2325·i + 672 = 2022 + 2325·i
 * (the same slot base as `AssetRiskLimitsV17` at slot + 608, see `assetRiskLimitsAccountOffsetP1`).
 *
 * @param assetIndex  Asset slot index.
 * @param layout      Layout table of the account's VERSION (default LAYOUT_V21; LAYOUT_V22 for v2.2).
 * @returns Byte offset into the market account.
 * @example
 * ```ts
 * assetGrowthAccountOffsetV19(0); // 2022
 * ```
 */
export declare function assetGrowthAccountOffsetV19(assetIndex: number, layout?: LayoutTable): number;
/**
 * Decode asset `i`'s growth record from a raw market account (kind 1).
 *
 * @param marketData  Raw market account bytes.
 * @param assetIndex  Asset slot.
 * @returns Decoded record or `null` when growth is OFF.
 * @example
 * ```ts
 * const g = decodeAssetGrowthV19(info.data, 0);
 * ```
 */
export declare function decodeAssetGrowthV19(marketData: Uint8Array, assetIndex: number): AssetGrowthV19 | null;
/**
 * `ceil(1_000_000 / l_x100)`: the IMR (bps) of a leverage cap. Port of `imr_bps_for_leverage_x100`.
 *
 * @param lX100  Leverage x100 (550 = 5.5x).
 * @returns IMR in bps, or `null` below 1x.
 * @example
 * ```ts
 * imrBpsForLeverageX100(550); // 1819n (18.18% rounded UP)
 * ```
 */
export declare function imrBpsForLeverageX100(lX100: Num): bigint | null;
/**
 * `floor(1_000_000 / imr)` saturated at `u16::MAX`: the tier leverage (x100) of an IMR. Port of
 * `leverage_x100_for_imr_bps`.
 *
 * @param imrBps  IMR in bps.
 * @returns Leverage x100, or `null` for an IMR of 0 or above 100%.
 * @example
 * ```ts
 * leverageX100ForImrBps(1000n); // 1000n (10x)
 * ```
 */
export declare function leverageX100ForImrBps(imrBps: Num): bigint | null;
/**
 * `base = max(engine IMR, IMR(L_ceil))`. Port of `ceiling_imr_bps`.
 *
 * @param engineImrBps  Engine initial margin (bps).
 * @param lCeilX100     Leverage ceiling x100.
 * @returns Base IMR in bps, or `null` (fail closed) on a corrupt engine IMR or ceiling below 1x.
 * @example
 * ```ts
 * ceilingImrBps(1000n, 550); // 1819n
 * ceilingImrBps(2000n, 1000); // 2000n (never looser than the engine)
 * ```
 */
export declare function ceilingImrBps(engineImrBps: Num, lCeilX100: Num): bigint | null;
/**
 * `N_cap_q = floor(c_m * lambda_bps * pos_scale / (10_000 * price_e6))`. Port of `n_cap_q`.
 * Overflow is checked at the Rust widths (u128 intermediates), failing closed.
 *
 * @param cM          Conservative LP equity (atoms).
 * @param lambdaBps   Lambda (bps, 10_000 = 1x).
 * @param priceE6     Price (e6).
 * @param posScale    Engine `POS_SCALE` (default 1_000_000n).
 * @returns Capacity in Q, or `null` on a zero price or u128 overflow.
 * @example
 * ```ts
 * nCapQ(1_746_000_000n, 10_000n, 1_000_000n); // 1_746_000_000n
 * ```
 */
export declare function nCapQ(cM: bigint, lambdaBps: Num, priceE6: bigint, posScale?: bigint): bigint | null;
/**
 * `liquidity_notional_e6` the wrapper hands the matcher (ext v3): `floor(c_m * lambda * DEPTH_MULT / 1e4)`
 * with `DEPTH_MULT = 4`. Port of `liquidity_notional_e6`.
 *
 * @param cM         Conservative LP equity (atoms).
 * @param lambdaBps  Lambda (bps).
 * @returns The depth, or `null` on u128 overflow.
 * @example
 * ```ts
 * liquidityNotionalE6(1_000_000_000n, 10_000n); // 4_000_000_000n
 * ```
 */
export declare function liquidityNotionalE6(cM: bigint, lambdaBps: Num): bigint | null;
/**
 * The `(inventory_cap_q, liquidity_notional_e6)` pair the wrapper puts in the matcher ext v3
 * (`growth_matcher_caps_view`): both 0 while the bankruptcy h-lock is latched; otherwise
 * `cap = min(N_cap, 1e14)` (0 on a zero price / overflow) and `liquidity = 0` when `cap == 0`, else
 * `4 * lambda * C_m / 1e4`.
 *
 * @param g            Decoded growth record (only `lambdaBps` is used).
 * @param cM           Conservative LP equity (atoms), see {@link conservativeEquity}.
 * @param priceE6      Effective price (e6).
 * @param hlockActive  Bankruptcy h-lock latched.
 * @param posScale     Engine `POS_SCALE` (default 1_000_000n).
 * @returns Caps ready for {@link encodeMatcherCallExtV3}.
 * @example
 * ```ts
 * growthMatcherCapsV3(g, 1_000_000_000n, 1_000_000n, false); // { inventoryCapQ: 1_000_000_000n, liquidityNotionalE6: 4_000_000_000n }
 * ```
 */
export declare function growthMatcherCapsV3(g: Pick<AssetGrowthV19, "lambdaBps">, cM: bigint, priceE6: bigint, hlockActive: boolean, posScale?: bigint): MatcherCallExtCapsV3;
/**
 * Kinked dynamic IMR for a crowd-joining fill. Port of `dyn_imr_bps`. `null` == refused
 * (GrowthCapacityFull): `n_cap` is 0, `lp_abs_after > n_cap` (u > 1), a corrupt input or a u128
 * overflow. Q3 (wrapper 5993a5c1): `u == 1` exactly is ADMITTED, at 100% IMR (the headroom clip and
 * the matcher's `<= cap` inventory check agree, so no crowd fill leaves `|LP| > N_cap`).
 *
 * `lp*1e4 <= kink*n` -> base; else `base + ceil((1e4 - base) * (lp*1e4 - kink*n) / (n * (1e4 - kink)))`,
 * clamped to 10_000.
 *
 * @param lpAbsAfter  |LP| after the fill (Q).
 * @param nCap        Capacity `N_cap_q`.
 * @param baseImr     Base IMR (bps).
 * @param kinkBps     Kink u_k (bps).
 * @returns Dynamic IMR in bps or `null` (refused).
 * @example
 * ```ts
 * dynImrBps(720_000n, 1_000_000n, 1_000n, 5_000n); // 4960n
 * ```
 */
export declare function dynImrBps(lpAbsAfter: bigint, nCap: bigint, baseImr: Num, kinkBps: Num): bigint | null;
/**
 * Capacity utilisation `u = |lp| / n_cap` in bps (floored, `lp*1e4 / n_cap`). Display only: the
 * gate itself compares exact integers (see {@link dynImrBps}).
 *
 * @param lpAbs  |LP| (Q).
 * @param nCap   Capacity (Q).
 * @returns bps (may exceed 10_000 when over capacity), or `null` when `nCap == 0`.
 * @example
 * ```ts
 * utilizationBps(720_000n, 1_000_000n); // 7200n
 * ```
 */
export declare function utilizationBps(lpAbs: bigint, nCap: bigint): bigint | null;
/**
 * Conservative equity `C_m = max(0, capital + min(pnl, 0) + min(feeCredits, 0))` (no credit for
 * positive PnL or positive fee credits).
 *
 * @param capital     LP capital (atoms).
 * @param pnl         LP PnL (signed).
 * @param feeCredits  LP fee credits (signed).
 * @returns Non-negative conservative equity.
 * @example
 * ```ts
 * conservativeEquity(1_000n, -200n, 0n); // 800n
 * ```
 */
export declare function conservativeEquity(capital: bigint, pnl: bigint, feeCredits: bigint): bigint;
/** G8: a depth reading older than this many slots counts as absent (`DEPTH_MAX_AGE_SLOTS`). */
export declare const DEPTH_MAX_AGE_SLOTS = 150n;
/** `AssetGrowthV19.depthSource` values (bits 0-1 of byte 44): 0 none, 1 keeper-attested (PushAuthMark mode 1), 2 on-chain DEX pool (mode 2). */
export declare const DEPTH_SOURCE: Readonly<{
    readonly None: 0;
    readonly Attested: 1;
    readonly OnChainPool: 2;
}>;
/** `DEPTH_SOURCE_MASK`: the source bits of byte 44. */
export declare const DEPTH_SOURCE_MASK = 3;
/** `DEPTH_EVER` (byte 44 bit 7): a fresh effective depth was seen at least once (sticky; cleared only by the wrapper's restart reset). */
export declare const DEPTH_EVER = 128;
/**
 * `DEPTH_PREV_REAL` (byte 44 bit 2): the PREVIOUS sample (`depth_prev_e6`) was a REAL reading (source 1 or 2, a 0 included), not an absent one
 * (35 B push, mode 0, never). With the source bits (which say the same of the CURRENT sample) a real reading of 0 is told apart from "absent".
 */
export declare const DEPTH_PREV_REAL = 4;
/** PushAuthMark 44 B `depth_mode`: 0 none, 1 keeper-attested, 2 on-chain DEX pool (`depth_e6` must be 0, four trailing accounts). */
export declare const DEPTH_MODE: Readonly<{
    readonly None: 0;
    readonly Attested: 1;
    readonly OnChainDex: 2;
}>;
/**
 * `DEPTH_DEX_PINNED` (byte 44 bit 6, v2.2 DEATH F-3 / SEC-RC L-2): the asset's depth is PINNED to an on-chain DEX pool. Set by tag 123
 * `SetDepthSource` op 1 and by every PushAuthMark mode-2 reading; cleared only by tag 123 op 0 (or on the old asset when a pin is replaced).
 * Survives every depth / graduation write and the I-1 reset. Not a source bit ({@link depthSourceOf} masks it out). While set, a mode-1
 * (keeper-attested) depth is refused with 129 `DepthSourceInvalid` and NOTHING is written, the mark included.
 */
export declare const DEPTH_DEX_PINNED = 64;
/** One whole USD of 6-decimal collateral, in atoms. */
export declare const GROWTH_USD_ATOMS = 1000000n;
/** Protocol-default tier thresholds, whole USD of +-2% depth (T1, T2, T3): what a stored 0 means. */
export declare const TIER_THRESHOLD_DEFAULT_USD: readonly [number, number, number];
/** Floors an explicit threshold may not go below (a creator cannot set $1 tiers), whole USD. */
export declare const TIER_THRESHOLD_FLOOR_USD: readonly [number, number, number];
/** Protocol-default per-tier maximum leverage x100 (5x / 10x / 20x, before `min(.., L_tier)`): what a stored 0 means. */
export declare const TIER_LEVERAGE_DEFAULT_X100: readonly [number, number, number];
/** `attested_max_tier` stored 0 = this default (1). */
export declare const ATTESTED_MAX_TIER_DEFAULT = 1;
/** Highest liquidity tier. */
export declare const GROWTH_MAX_TIER = 3;
/** The sticky cap halves once per this many slots of staleness (one ratchet epoch). */
export declare const DEPTH_STICKY_EPOCH_SLOTS = 9000n;
/** Tier thresholds at the protocol defaults, USD e6 (round-1 name, kept). */
export declare const DEPTH_TIER_THRESHOLDS_E6: readonly [bigint, bigint, bigint];
/** Highest tier a keeper-attested depth can reach by default (`ATTESTED_MAX_TIER_DEFAULT`); the upgrade authority can raise it to 3 per market. */
export declare const DEPTH_ATTESTED_MAX_TIER = 1;
/** `BOOK_DEPTH_BAND_BPS`: the band the book depth is measured in (+-2%). */
export declare const BOOK_DEPTH_BAND_BPS = 200;
/** `vault_lp_v18::PIN_TRADING_FEE_BPS` / `PIN_BASE_SPREAD_BPS` / `PIN_MAX_TOTAL_BPS` / `PIN_IMPACT_K_BPS`: the kind-2 matcher parameters tag 94 pins. */
export declare const GROWTH_PIN_TRADING_FEE_BPS = 10;
export declare const GROWTH_PIN_BASE_SPREAD_BPS = 10;
export declare const GROWTH_PIN_MAX_TOTAL_BPS = 100;
export declare const GROWTH_PIN_IMPACT_K_BPS = 50;
/** Engine `MAX_BAND_BPS`. */
export declare const BAND_MAX_BPS = 2000n;
/** `RATCHET_STEP_X100` (+1x per ratchet epoch). */
export declare const GROWTH_RATCHET_STEP_X100 = 100;
/** `RATCHET_EPOCH_SLOTS` (~1 h). */
export declare const GROWTH_RATCHET_EPOCH_SLOTS = 9000n;
/** Nominal slot time used only for "in ~N min" display (the chain targets 400 ms). */
export declare const GROWTH_SLOT_MS = 400;
/** A fixed-size triple (tier 1, 2, 3). */
export type Triple<T> = readonly [T, T, T];
/** Source bits (0 none, 1 attested, 2 DEX) of `depth_source`. */
export declare function depthSourceOf(depthSourceByte: number): number;
/** Whether `DEPTH_EVER` is set. */
export declare function depthEver(depthSourceByte: number): boolean;
/**
 * Record validator: only bits 0-1 (source <= 2), bit 2 ({@link DEPTH_PREV_REAL}), bit 6 ({@link DEPTH_DEX_PINNED}) and bit 7 may be set.
 * Port of `growth_v19::depth_source_byte_ok` (wrapper 4db44b69).
 *
 * @param depthSourceByte  Byte 44 of the growth record.
 * @returns Whether the program accepts it.
 * @example
 * ```ts
 * depthSourceByteOk(0xc6); // true (DEX | PREV_REAL | PINNED | EVER)
 * depthSourceByteOk(0x08); // false (bits 3-5 must be 0)
 * ```
 */
export declare function depthSourceByteOk(depthSourceByte: number): boolean;
/**
 * Whether byte 44 carries {@link DEPTH_DEX_PINNED}. Port of `growth_v19::depth_dex_pinned`.
 *
 * @param depthSourceByte  Byte 44 of the growth record.
 * @returns `true` while the asset's depth is pinned to its DEX pool.
 * @example
 * ```ts
 * depthDexPinned(0xc6); // true
 * depthDexPinned(0x86); // false
 * ```
 */
export declare function depthDexPinned(depthSourceByte: number): boolean;
/**
 * Whether a decoded growth record is DEX-pinned (a mode-1 push on it is refused whole with 129). `null` (growth off) is never pinned: the
 * wrapper's tag 123 writes no bit there and the push guard only runs on a growth record.
 *
 * @param record  A decoded record ({@link decodeAssetGrowthRecordV19} / {@link decodeAssetGrowthV19}), or `null` for growth off.
 * @returns `true` iff the record exists and its pin bit is set.
 * @example
 * ```ts
 * const g = decodeAssetGrowthV19(marketData, 0);
 * const mode = isDexPinned(g) ? DEPTH_MODE.OnChainDex : DEPTH_MODE.Attested;
 * ```
 */
export declare function isDexPinned(record: Pick<AssetGrowthV19, "depthDexPinned"> | null): boolean;
/**
 * F-3: may a PushAuthMark carrying depth `mode` (`null` = the 35-byte form, no depth) land on an asset whose byte 44 is `depthSourceByte`?
 * Everything is allowed except a keeper-attested depth (mode 1) on a DEX-pinned asset. Port of `growth_v19::depth_push_mode_allowed`.
 * (Any mode other than 0 / 1 / 2 is refused earlier, with 128 `DepthInputInvalid`; this predicate does not model that.)
 *
 * @param depthSourceByte  Byte 44 of the growth record.
 * @param mode             The 44-byte form's `depth_mode`, or `null` for the 35-byte form.
 * @returns `false` exactly when the wrapper would refuse the push with 129 for the pin.
 * @example
 * ```ts
 * depthPushModeAllowed(0x41, DEPTH_MODE.Attested); // false
 * depthPushModeAllowed(0x41, DEPTH_MODE.OnChainDex); // true
 * depthPushModeAllowed(0x41, null); // true (35 B)
 * ```
 */
export declare function depthPushModeAllowed(depthSourceByte: number, mode: number | null): boolean;
/**
 * Effective depth: `min(depth, depthPrev)` (a one-push spike buys nothing), and 0 (absent) when either read is 0, the last push
 * is older than {@link DEPTH_MAX_AGE_SLOTS}, or `depthSlot` is after `now` (fail closed). Port of `effective_depth_e6`.
 *
 * @param depthE6      Stored depth (USD e6).
 * @param depthPrevE6  The depth before it.
 * @param depthSlot    Slot of the last push.
 * @param nowSlot      Current slot.
 * @returns Effective depth, 0n when absent.
 * @example
 * ```ts
 * effectiveDepthE6(30_000_000_000n, 28_000_000_000n, 1_000n, 1_100n); // 28_000_000_000n
 * ```
 */
export declare function effectiveDepthE6(depthE6: bigint, depthPrevE6: bigint, depthSlot: bigint, nowSlot: bigint): bigint;
/**
 * The FRESH reading the tiers and the capacity cap use (coordinator ruling "most conservative wins"). `null` = absent: stale (> 150 slots), a
 * future stamp, the current sample absent (35 B push / mode 0 / never: source bits none), or the first REAL sample of a pair (previous one
 * absent). Otherwise `min(current, previous)` where a REAL 0 counts as 0: a real reading of 0 (attested or DEX, depth 0) is `0n` AT ONCE;
 * a later positive reading restores a positive value only after its own min-of-two. Port of `fresh_depth_e6`.
 *
 * @param depthE6          Stored depth.
 * @param depthPrevE6      The depth before it.
 * @param depthSlot        Slot of the last push.
 * @param depthSourceByte  Byte 44 (source bits 0-1, {@link DEPTH_PREV_REAL} bit 2).
 * @param nowSlot          Current slot.
 * @returns The fresh reading (0n possible), or `null` when absent.
 * @example
 * ```ts
 * freshDepthE6(0n, 5n, 100n, 1 | DEPTH_PREV_REAL, 100n); // 0n: a real zero closes opens at once
 * freshDepthE6(0n, 5n, 100n, 0, 100n); // null: a 35 B push is absent, not zero
 * ```
 */
export declare function freshDepthE6(depthE6: bigint, depthPrevE6: bigint, depthSlot: bigint, depthSourceByte: number, nowSlot: bigint): bigint | null;
/** The stored depth state of one asset (`AssetGrowthV19` bytes 44, 56..96). */
export interface DepthState {
    depthE6: bigint;
    depthSlot: bigint;
    depthPrevE6: bigint;
    /** Byte 44: bits 0-1 source of the stored depth (none = an absent sample), bit 2 {@link DEPTH_PREV_REAL}, bit 7 {@link DEPTH_EVER}. */
    depthSource: number;
    /** The RATE-LIMITED last good depth (R2-M1). */
    lastGoodE6: bigint;
    lastGoodSlot: bigint;
    /** R2-M1 / D-L2: stamp (`slot / 64`) of the last rise of `lastGoodE6` (bytes 114..118). */
    riseSlot64: number;
    /** Round 3 item 4 (GAP-5): the time-weighted two-bucket window (bytes 30..38, 118..120). Omitted = no history (a legacy record). */
    tw?: DepthWindow;
}
/**
 * The wrapper's depth writer (every PushAuthMark form). Port of `depth_push_update`. `source` none / unknown is an ABSENT sample; a REAL reading
 * (source 1 or 2) of 0 is a real zero depth. A later-slot push stores the new sample and the old one becomes `prev` (with {@link DEPTH_PREV_REAL}
 * = it was real); a same-slot (or earlier) push can only lower the stored depth, keeps `prev` (W-L2), and at a tie of zeros the real zero
 * beats an absent one. A fresh reading ({@link freshDepthE6}, a real 0 included) sets {@link DEPTH_EVER} and updates the last good depth to its
 * RATE-LIMITED value, stamped with the sample's slot. Controller round (item 4, GAP-5): the fresh reading first enters the time-weighted window
 * ({@link depthTwUpdate}, whole tokens, floor) and the rate limiter is fed `w = min(window minimum, fresh)` with `riseOk` = the window spans a full
 * adjacent bucket pair ({@link depthTwFull}); `lastGoodSlot` is the limiter's returned slot (held through a real zero, D2).
 * Port of `growth_v19::depth_push_update` (`666df893`).
 *
 * @param st          Stored state (`tw` omitted = no window history).
 * @param source      The new reading's source (0 none, 1 attested, 2 DEX; others are absent).
 * @param newDepthE6  The new depth (ignored for an absent sample).
 * @param nowSlot     Authenticated slot of the push.
 * @param seedE6      The market's T1 in atoms minus 1 (`tierThresholdsE6(..)[0] - 1n`; `depth_seed_e6`).
 * @param unitAtoms   One whole collateral token in atoms (`collateral_unit_atoms`; default 10^6 = 6-decimal collateral).
 * @returns The new state (always with `tw`).
 * @example
 * ```ts
 * depthPushUpdate({ depthE6: 0n, depthSlot: 0n, depthPrevE6: 0n, depthSource: 0, lastGoodE6: 0n, lastGoodSlot: 0n, riseSlot64: 0 }, 1, 0n, 100n, 24_999_999_999n).lastGoodE6; // 0n, DEPTH_EVER set
 * ```
 */
export declare function depthPushUpdate(st: DepthState, source: number, newDepthE6: bigint, nowSlot: bigint, seedE6: bigint, unitAtoms?: bigint): DepthState;
/**
 * Sticky depth (W-M1): `lastGood >> k`, `k = floor((now - lastGoodSlot) / 9000)`; 0 once `k >= 64`. A `lastGoodSlot` after `now`
 * reads as age 0. Port of `sticky_depth_e6`.
 *
 * @param lastGoodE6    `depth_last_good_e6`.
 * @param lastGoodSlot  `depth_last_good_slot`.
 * @param nowSlot       Current slot.
 * @returns The decayed depth (USD e6).
 * @example
 * ```ts
 * stickyDepthE6(150_000_000_000n, 0n, 18_000n); // 37_500_000_000n (two hours stale: a quarter)
 * ```
 */
export declare function stickyDepthE6(lastGoodE6: bigint, lastGoodSlot: bigint, nowSlot: bigint): bigint;
/**
 * The depth the capacity cap uses on a clamp-enforced market: a fresh reading ({@link freshDepthE6}; a real 0 caps at 0 at once); else, once
 * {@link DEPTH_EVER}, `min(sticky depth, last window minimum)` (the cap stays and decays towards 0, never "uncapped"; a real zero still in the
 * window keeps it at 0); else `null` (never had a depth: no depth cap). Port of `growth_v19::cap_depth_e6` (`666df893`).
 *
 * @param depthSourceByte  Byte 44.
 * @param fresh            The USABLE reading ({@link usableDepthE6}; `null` = absent).
 * @param lastGoodE6       `depth_last_good_e6`.
 * @param lastGoodSlot     `depth_last_good_slot`.
 * @param nowSlot          Current slot.
 * @param twMinE6          {@link depthTwMinAtoms} of the stored window; `null` (default) = no window history (round-2 behaviour).
 * @returns Cap depth (USD e6) or `null` for no depth cap.
 * @example
 * ```ts
 * capDepthE6(0x81, null, 100_000_000_000n, 0n, 9_000n); // 50_000_000_000n
 * capDepthE6(0x80, null, 1_000n, 100n, 200n, 0n); // 0n: a zero in the window
 * ```
 */
export declare function capDepthE6(depthSourceByte: number, fresh: bigint | null, lastGoodE6: bigint, lastGoodSlot: bigint, nowSlot: bigint, twMinE6?: bigint | null): bigint | null;
/**
 * D-L1: the largest collateral decimals a GROWTH market accepts (`MAX_COLLATERAL_DECIMALS` = 12; InitMarket refuses more with 94
 * `GrowthInvalidConfig`; byte 46 holds decimals + 1 and the record validator bounds it at 13). Above it the tier thresholds and the depths they are
 * compared with saturate u64.
 */
export declare const GROWTH_MAX_COLLATERAL_DECIMALS = 12;
/**
 * D-L1: whether a collateral mint with `decimals` can carry a growth / band market.
 *
 * @param decimals  The collateral mint's decimals.
 * @returns `true` for 0..=12.
 * @example
 * ```ts
 * growthCollateralDecimalsOk(9); // true
 * growthCollateralDecimalsOk(13); // false: the wrapper answers 94
 * ```
 */
export declare function growthCollateralDecimalsOk(decimals: number): boolean;
/** `DEPTH_BOOTSTRAP_DIV`: the depth rate limiter's bootstrap floor is `T1 / 16` (the level a market climbs back to out of a real 0). */
export declare const DEPTH_BOOTSTRAP_DIV = 16n;
/** `collateral_decimals_of`: byte 46 is decimals + 1; 0 = a record written before R2-L2, read as 6. */
export declare function collateralDecimalsOf(storedP1: number): number;
/** `whole_token_atoms`: `10^decimals` (decimals clamped to 18). */
export declare function wholeTokenAtoms(decimals: number): bigint;
/** `DEPTH_RISE_STAMP_SLOTS`: the unit of the stored last-rise stamp (64 slots). */
export declare const DEPTH_RISE_STAMP_SLOTS = 64n;
/** `depth_rise_stamp`: the stored stamp of a rise at `slot`, `slot / 64`, saturating at u32::MAX. */
export declare function depthRiseStamp(slot: bigint): number;
/**
 * D-L2: whether a new depth rise is allowed at `slot`: at least 9,000 slots after the LAST RISE, measured against the latest slot the stamp can stand
 * for (`stamp * 64 + 63`), so the window is never shorter than 9,000 slots whatever the rounding and independent of calendar-epoch boundaries. A
 * saturated stamp never opens the window (fails closed). Port of `depth_rise_window_open`.
 *
 * @param riseSlot64  Stored stamp ({@link AssetGrowthV19.depthRiseSlot64}).
 * @param slot        Slot of the new reading's sample.
 * @returns Whether a rise is allowed.
 * @example
 * ```ts
 * depthRiseWindowOpen(depthRiseStamp(8_999n), 9_000n); // false: a calendar boundary is not a window
 * ```
 */
export declare function depthRiseWindowOpen(riseSlot64: number, slot: bigint): boolean;
/**
 * R2-M1 + D-L2 + controller round item 4 (GAP-5, D-I1, D2): the rate-limited last good depth after a fresh sample folded into the window. `w` is the
 * TIME-WEIGHTED window minimum (`min(window min, fresh)`), `riseOk` = the window spans a full adjacent bucket pair ({@link depthTwFull}).
 * - the market's FIRST fresh reading (`ever` false): `min(w, seed / 16)` (D-I1; round 2 seeded `T1 - 1`), a rise;
 * - `w == 0` (a real zero in the window): `lastGood` and its slot are HELD (D2; the zero still caps every reader at 0 through the window);
 * - otherwise against `base = stickyDepthE6(lastGood, lastGoodSlot, slot)`: `w <= base` -> `w` at once (rise stamp kept); `w > base` with `riseOk` and
 *   the rise window open ({@link depthRiseWindowOpen}) -> `min(w, max(2 * base, seed / 16))`, a rise; otherwise `base`.
 *
 * Port of `growth_v19::depth_rate_limited` (`666df893`).
 *
 * @param ever          `DEPTH_EVER` already set.
 * @param lastGoodE6    Stored rate-limited depth.
 * @param lastGoodSlot  Its slot (the sticky decay clock).
 * @param riseSlot64    Stamp (`slot / 64`) of the last rise.
 * @param w             The window-minimum reading (collateral atoms).
 * @param riseOk        The window spans a full adjacent bucket pair.
 * @param slot          Slot of the reading's sample.
 * @param seedE6        T1 in atoms minus 1.
 * @returns `{ lastGoodE6, riseSlot64, lastGoodSlot }`.
 * @example
 * ```ts
 * // seed $25k -> floor $1,562.5; one doubling per 9,000 slots once the window is full
 * depthRateLimited(true, 24_999_999_999n, 9_062n, 0, 500_000_000_000_000n, true, 9_063n, 24_999_999_999n).lastGoodE6; // 49_999_999_998n
 * ```
 */
export declare function depthRateLimited(ever: boolean, lastGoodE6: bigint, lastGoodSlot: bigint, riseSlot64: number, w: bigint, riseOk: boolean, slot: bigint, seedE6: bigint): {
    lastGoodE6: bigint;
    riseSlot64: number;
    lastGoodSlot: bigint;
};
/**
 * The depth every reader uses (tiers and the capacity cap): `min(fresh reading, rate-limited last good, time-weighted window minimum)`; `null`
 * while there is no fresh reading (the sticky path then applies). Port of `growth_v19::usable_depth_e6` (`666df893`).
 *
 * @param fresh       {@link freshDepthE6}.
 * @param lastGoodE6  {@link AssetGrowthV19.depthLastGoodE6}.
 * @param twMinE6     {@link depthTwMinAtoms} of the stored window; `null` (default) = no window history: round 2's `min(fresh, lastGood)` exactly.
 * @returns Usable depth or `null`.
 * @example
 * ```ts
 * usableDepthE6(500_000_000_000n, 25_000_000_000n); // 25_000_000_000n
 * usableDepthE6(500_000_000_000n, 25_000_000_000n, 2_000_000_000n); // 2_000_000_000n
 * ```
 */
export declare function usableDepthE6(fresh: bigint | null, lastGoodE6: bigint, twMinE6?: bigint | null): bigint | null;
/** `DEPTH_TW_BUCKET_SLOTS`: one window bucket (~5 min). The window is the current and the previous bucket. A rise needs a full adjacent pair, so
 * depth must be pushed at least once per 750 slots or the rate-limited depth can never rise (security review F-8 liveness note). */
export declare const DEPTH_TW_BUCKET_SLOTS = 750n;
/** `DEPTH_TW_BUCKET_RING`: the stored bucket code is `(slot / 750) % 65,535 + 1` (wraps after ~227 days). */
export declare const DEPTH_TW_BUCKET_RING = 65535n;
/** `DEPTH_TW_ABSENT`: `prevTokens` value meaning "no previous bucket" (`u32::MAX`). Real readings saturate at `u32::MAX - 1`. */
export declare const DEPTH_TW_ABSENT = 4294967295;
/** The all-zero window (no history). */
export declare const DEPTH_TW_EMPTY: DepthWindow;
/**
 * The stored bucket code of `slot`. Port of `depth_tw_bucket_p1`.
 * @param slot  Slot.
 * @returns `(slot / 750) % 65,535 + 1`.
 * @example
 * ```ts
 * depthTwBucketP1(749n); // 1
 * ```
 */
export declare function depthTwBucketP1(slot: bigint): number;
/**
 * Atoms -> whole tokens (floor), saturating at `u32::MAX - 1` (never the absent marker); 0 when `unitAtoms` is 0. Port of `depth_tokens_floor`.
 * @param depthAtoms  Depth in collateral atoms.
 * @param unitAtoms   One whole token in atoms.
 * @returns Whole tokens.
 * @example
 * ```ts
 * depthTokensFloor(1_999_999n, 1_000_000n); // 1
 * ```
 */
export declare function depthTokensFloor(depthAtoms: bigint, unitAtoms: bigint): number;
/**
 * Fold one FRESH sample into the window: same bucket -> `cur = min(cur, r)`; the next bucket -> `prev = cur, cur = r`; otherwise (first sample, or a
 * gap of more than one bucket) -> `prev = ABSENT, cur = r`. Port of `depth_tw_update`.
 * @param w        Stored window.
 * @param rTokens  The sample in whole tokens ({@link depthTokensFloor}).
 * @param slot     Sample slot.
 * @returns The new window.
 * @example
 * ```ts
 * depthTwUpdate(DEPTH_TW_EMPTY, 100, 5n); // { curTokens: 100, prevTokens: DEPTH_TW_ABSENT, bucketP1: 1 }
 * ```
 */
export declare function depthTwUpdate(w: DepthWindow, rTokens: number, slot: bigint): DepthWindow;
/**
 * The window minimum in ATOMS, `min(cur, prev)` (an absent prev is `u32::MAX`, so it never wins); `null` without history. Saturating multiply.
 * Port of `depth_tw_min_atoms`.
 * @param w          Window.
 * @param unitAtoms  One whole token in atoms.
 * @returns Atoms or `null`.
 * @example
 * ```ts
 * depthTwMinAtoms({ curTokens: 500, prevTokens: 40, bucketP1: 2 }, 1_000_000n); // 40_000_000n
 * ```
 */
export declare function depthTwMinAtoms(w: DepthWindow, unitAtoms: bigint): bigint | null;
/**
 * Validator: bucket 0 means an all-zero window; with history the current minimum is never the absent marker and the bucket code is in `1..=65,535`.
 * Port of `depth_tw_window_ok` (part of `validate_asset_growth`).
 * @param w  Window.
 * @returns Whether the program accepts it.
 * @example
 * ```ts
 * depthTwWindowOk(DEPTH_TW_EMPTY); // true
 * ```
 */
export declare function depthTwWindowOk(w: DepthWindow): boolean;
/**
 * SEC-RC L-1: a depth window (bucket code != 0) exists only in the round-3 layout (`flags` bit 0). The wrapper refuses a record with flags 0
 * and a window (`validate_asset_growth`). Port of `growth_v19::depth_tw_layout_ok` (wrapper 4db44b69).
 *
 * @param flags  Byte 39.
 * @param w      The record's depth window.
 * @returns Whether the program accepts the combination.
 * @example
 * ```ts
 * depthTwLayoutOk(0, { curTokens: 5, prevTokens: DEPTH_TW_ABSENT, bucketP1: 3 }); // false
 * depthTwLayoutOk(GROWTH_FLAG_R3_LAYOUT, { curTokens: 5, prevTokens: DEPTH_TW_ABSENT, bucketP1: 3 }); // true
 * ```
 */
export declare function depthTwLayoutOk(flags: number, w: DepthWindow): boolean;
/**
 * Whether the window spans a full adjacent bucket pair (a RISE of the rate-limited depth needs it). Port of `depth_tw_full`.
 * @param w  Window.
 * @returns `bucketP1 != 0 && prevTokens != ABSENT`.
 * @example
 * ```ts
 * depthTwFull({ curTokens: 500, prevTokens: 40, bucketP1: 2 }); // true
 * ```
 */
export declare function depthTwFull(w: DepthWindow): boolean;
/**
 * R2-L1: the rent `N_cap` snapshot (0 means "not measured", rent 0). When the DEPTH cap is what makes N_cap 0 (a real 0 reading or a fully decayed
 * sticky cap) the snapshot is 1, so open interest pays the maximum rent, never 0. Otherwise `min(nCap, u64::MAX)`. Port of `rent_snapshot_n_cap_q`.
 *
 * @param nCapQ          N_cap in Q.
 * @param depthCapZero   The depth cap is 0.
 * @returns The snapshot.
 * @example
 * ```ts
 * rentSnapshotNCapQ(0n, true); // 1n (maximum rent)
 * ```
 */
export declare function rentSnapshotNCapQ(nCapQ: bigint, depthCapZero: boolean): bigint;
/**
 * Per-market thresholds in collateral ATOMS. The stored values are WHOLE COLLATERAL TOKENS (0 = default 25,000 / 100,000 / 500,000; $ on 6-decimal
 * USD collateral), scaled by `10^collateralDecimals` and saturating at u64::MAX. Port of `tier_thresholds` (R2-L2).
 *
 * @param storedTokens        `tier_threshold_usd` (T1, T2, T3), whole collateral tokens.
 * @param collateralDecimals  The collateral mint's decimals ({@link AssetGrowthV19.collateralDecimals}; default 6).
 * @returns Thresholds in collateral atoms.
 * @example
 * ```ts
 * tierThresholdsE6([0, 0, 0]); // [25_000_000_000n, 100_000_000_000n, 500_000_000_000n]
 * tierThresholdsE6([0, 0, 0], 9)[0]; // 25_000_000_000_000n
 * ```
 */
export declare function tierThresholdsE6(storedTokens: Triple<number | bigint>, collateralDecimals?: number): Triple<bigint>;
/**
 * Raw tier of a depth against thresholds: 0 below T1 (and always for 0), 1 from T1, 2 from T2, 3 from T3. Port of `depth_tier_for`.
 *
 * @param depthE6        Depth (USD e6).
 * @param thresholdsE6   {@link tierThresholdsE6}.
 * @returns 0..3.
 * @example
 * ```ts
 * depthTierFor(100_000_000_000n, tierThresholdsE6([0, 0, 0])); // 2
 * ```
 */
export declare function depthTierFor(depthE6: bigint, thresholdsE6: Triple<bigint>): number;
/** `attested_max_tier` in force: stored 0 = {@link ATTESTED_MAX_TIER_DEFAULT} (1), at most 3. Port of `attested_max_tier_eff`. */
export declare function attestedMaxTierEff(stored: number): number;
/**
 * Venue tier (how hard the price source is to move): from the EFFECTIVE depth and the stored depth's source. On-chain pool (2): no
 * cap. Keeper-attested (1): capped at `attested_max_tier` (default 1). None: 0. Port of `venue_tier`.
 *
 * @param effectiveDepth        {@link effectiveDepthE6}.
 * @param depthSourceByte       Byte 44 (the source is bits 0-1).
 * @param thresholdsE6          {@link tierThresholdsE6}.
 * @param attestedMaxTierStored `attested_max_tier` as stored (0 = default).
 * @returns 0..3.
 * @example
 * ```ts
 * venueTier(600_000_000_000n, 1, tierThresholdsE6([0, 0, 0]), 0); // 1 (attested depth is capped)
 * venueTier(600_000_000_000n, 2, tierThresholdsE6([0, 0, 0]), 0); // 3 (on-chain pool)
 * ```
 */
export declare function venueTier(effectiveDepth: bigint, depthSourceByte: number, thresholdsE6: Triple<bigint>, attestedMaxTierStored: number): number;
/**
 * Book depth from the pinned matcher model (pure core of `book_depth_from_pins`): the notional the LP book fills within +-2% of the
 * oracle given its capacity notional. `maxTotal < 200` -> the whole capacity; else `fixed >= 200` -> 0; else
 * `min(cap, floor(D * (200 - fixed) / (k + 200 - fixed)))` with `D = 4 * cap` (saturating; a u128 product overflow reads 0).
 *
 * @param capE6         Capacity notional (atoms).
 * @param fixedBps      Base spread + trading fee (bps).
 * @param impactKBps    Matcher impact k (bps).
 * @param maxTotalBps   Matcher max total (bps).
 * @returns Book depth (atoms).
 * @example
 * ```ts
 * bookDepthFromPins(100_000_000_000n, 20, 50, 100); // 100_000_000_000n
 * ```
 */
export declare function bookDepthFromPins(capE6: bigint, fixedBps: number, impactKBps: number, maxTotalBps: number): bigint;
/**
 * The book's capacity notional for the book tier: `floor(C_m * min(storedLambda, 1x) / 1e4)`, computed overflow-free as the wrapper does
 * (monotone in `C_m`). Port of `book_capacity_e6`.
 *
 * @param cM                Conservative LP equity (atoms).
 * @param storedLambdaBps   `lambda_bps` as stored.
 * @returns Capacity notional (atoms).
 * @example
 * ```ts
 * bookCapacityE6(120_000_000_000n, 10_000); // 120_000_000_000n
 * ```
 */
export declare function bookCapacityE6(cM: bigint, storedLambdaBps: Num): bigint;
/**
 * Book depth of the bound vault LP with conservative equity `cM`, from the pinned kind-2 parameters (fixed = 10 + 10 bps, k = 50, max
 * total 100): exactly {@link bookCapacityE6}. Saturates at u64::MAX. Port of `book_depth_e6`.
 *
 * @param cM               Conservative LP equity (atoms).
 * @param storedLambdaBps  `lambda_bps` as stored.
 * @returns Book depth (USD e6).
 * @example
 * ```ts
 * bookDepthE6(30_000_000_000n, 30_000); // 30_000_000_000n (lambda above 1x does not count)
 * ```
 */
export declare function bookDepthE6(cM: bigint, storedLambdaBps: Num): bigint;
/** Book tier: {@link depthTierFor} of {@link bookDepthE6}. Port of `book_tier`. */
export declare function bookTier(cM: bigint, storedLambdaBps: Num, thresholdsE6: Triple<bigint>): number;
/** `tier = min(venue, book)`. Port of `combined_tier`. */
export declare function combinedTier(venue: number, book: number): number;
/**
 * Per-market leverage table x100 `[L0, L1, L2, L3]`. `L0 = min(L_launch, L_tier)`; `Li` is the stored value or `min(default_i, L_tier)`
 * when 0, clamped into `[L_{i-1}, L_tier]`, so it is monotone and never above `L_tier`. Port of `tier_leverage`.
 *
 * @param storedX100  `tier_leverage_x100` (L1, L2, L3; 0 = default).
 * @param lLaunchX100 Creator's launch leverage x100.
 * @param lTierX100   Protocol tier maximum x100 (from the engine IMR).
 * @returns The four-entry table.
 * @example
 * ```ts
 * tierLeverage([0, 0, 0], 500, 2000); // [500, 500, 1000, 2000]
 * ```
 */
export declare function tierLeverage(storedX100: Triple<number>, lLaunchX100: number, lTierX100: number): [number, number, number, number];
/** `L_table(tier)` (tiers above 3 read as 3). Port of `l_table_x100`. */
export declare function lTableX100(tier: number, table: readonly [number, number, number, number]): number;
/**
 * Tier-config bounds, exactly the wrapper's `tier_config_ok` (the setters refuse with 130 `GrowthTierConfigInvalid`). Each group is
 * all-zero (protocol defaults) or, with its zeros read as the defaults: thresholds `T1 < T2 < T3` and `>= $5k / $20k / $100k`; leverage
 * `L_launch <= L1 <= L2 <= L3 <= L_tier` (a 0 reads as `min(default, L_tier)`). Prefer {@link validateTierConfig} for messages.
 *
 * @param thresholdsUsd  T1, T2, T3 whole USD.
 * @param leverageX100   L1, L2, L3 x100.
 * @param lLaunchX100    Launch leverage x100.
 * @param lTierX100      Tier maximum x100.
 * @returns Whether the wrapper would accept the table.
 * @example
 * ```ts
 * tierConfigOk([5_000, 20_000, 100_000], [500, 1_000, 2_000], 500, 2_000); // true
 * tierConfigOk([1, 2, 3], [0, 0, 0], 500, 2_000); // false (below the floors)
 * ```
 */
export declare function tierConfigOk(thresholdsUsd: Triple<number>, leverageX100: Triple<number>, lLaunchX100: number, lTierX100: number): boolean;
/** `attested_max_tier` bound: 0 (default) ..= 3. Port of `attested_max_tier_ok`. */
export declare function attestedMaxTierOk(v: number): boolean;
/** A tier block as on the wire (tag 94 bind block, tag 93 trailer). */
export interface TierConfig {
    /** T1, T2, T3 whole USD of +-2% depth (u32; 0 = protocol default $25k / $100k / $500k). */
    thresholdUsd: Triple<number>;
    /** L1, L2, L3 max leverage x100 (u16; 0 = default `min(5x / 10x / 20x, L_tier)`). */
    leverageX100: Triple<number>;
}
/**
 * Tag 94 merge rule: a stored (upgrade-authority preset) field that is non-zero is kept; a zero field takes the creator's value. The
 * merged table is then bounded by {@link tierConfigOk}. Port of `tier_config_merge_at_bind`.
 *
 * @param stored   The table already on the record.
 * @param creator  The creator's block.
 * @returns The merged table.
 * @example
 * ```ts
 * mergeTierConfigAtBind({ thresholdUsd: [0, 0, 0], leverageX100: [0, 0, 0] }, { thresholdUsd: [10_000, 0, 0], leverageX100: [0, 0, 0] }).thresholdUsd[0]; // 10000
 * ```
 */
export declare function mergeTierConfigAtBind(stored: TierConfig, creator: TierConfig): TierConfig;
/** One problem found by {@link validateTierConfig}. */
export interface TierConfigIssue {
    /** Which part is wrong. */
    field: "thresholds" | "leverage" | "attestedMaxTier" | "collateral";
    /** Machine code. */
    code: "not-an-integer" | "collateral-decimals" | "below-floor" | "not-rising" | "below-launch" | "above-market-maximum" | "out-of-range";
    /** Tier 1..3 the issue is about, when it is about one. */
    tier?: 1 | 2 | 3;
    /** Calm one-line message for the app (no bps, no x100). */
    message: string;
}
/** Input of {@link validateTierConfig}. */
export interface ValidateTierConfigInput {
    /** T1..T3 whole USD; omitted or all 0 = protocol defaults. */
    thresholdsUsd?: Triple<number>;
    /** L1..L3 x100; omitted or all 0 = defaults. */
    leverageX100?: Triple<number>;
    /** Creator's launch leverage x100. */
    lLaunchX100: number;
    /** The market's built-in maximum x100 (`floor(1e6 / engine IMR)`). */
    lTierX100: number;
    /** Optional `attested_max_tier` (upgrade authority only). */
    attestedMaxTier?: number;
    /**
     * R2-L2: the tier thresholds and floors are whole COLLATERAL TOKENS, scaled on chain by the collateral mint's decimals. Messages say "$" only when
     * the collateral is a 6-decimal USD-like token (`decimals === 6 && usdLike === true`); otherwise they say "tokens" (or `symbol`). The bounds
     * themselves do not depend on the decimals.
     */
    collateral?: {
        decimals?: number;
        usdLike?: boolean;
        symbol?: string;
    };
}
/** Result of {@link validateTierConfig}. */
export interface TierConfigValidation {
    /** `true` iff the wrapper accepts the table (equals {@link tierConfigOk} and {@link attestedMaxTierOk}). */
    ok: boolean;
    issues: TierConfigIssue[];
}
/**
 * Client-side check of a per-market tier table with the wrapper's exact bounds, so the app can show an error BEFORE signing (the chain
 * answers 130 `GrowthTierConfigInvalid`). Floors $5k / $20k / $100k, thresholds strictly rising, and `L_launch <= L1 <= L2 <= L3 <= L_tier`,
 * zeros read as the defaults, an all-zero group = defaults. `ok` is exactly the wrapper's verdict.
 *
 * @param i  See {@link ValidateTierConfigInput}.
 * @returns `{ ok, issues }`; each issue carries a calm one-line message.
 * @example
 * ```ts
 * validateTierConfig({ thresholdsUsd: [1_000, 20_000, 100_000], lLaunchX100: 500, lTierX100: 2_000 });
 * // { ok: false, issues: [{ field: "thresholds", code: "below-floor", tier: 1, message: "Tier 1 pool depth must be at least $5,000." }] }
 * ```
 */
export declare function validateTierConfig(i: ValidateTierConfigInput): TierConfigValidation;
/** `lambda_depth` (bps): 1x at tiers 0 and 1, 2x at tier 2, 3x at tier 3. */
export declare function lambdaDepthBps(tier: number): number;
/** `kappa_depth` (bps of the depth): 0.5 at tier 0, 1 at tiers 1 and 2, 2 at tier 3. */
export declare function kappaDepthBps(tier: number): number;
/** Alias of {@link kappaDepthBps} (round-1 name). */
export declare const kappaDepth: typeof kappaDepthBps;
/** `lambda_eff = min(stored lambda, lambda_depth(tier))`. Port of `lambda_eff_bps`. */
export declare function lambdaEffBps(storedLambdaBps: number, tier: number): number;
/**
 * Depth capacity notional `floor(kappa * depth / 1e4)` (atoms) of the cap depth; `null` = no depth cap. Port of `depth_notional_cap_e6`.
 *
 * @param tier      Combined tier.
 * @param capDepth  {@link capDepthE6}.
 * @returns Notional or `null`.
 * @example
 * ```ts
 * depthNotionalCapE6(2, 150_000_000_000n); // 150_000_000_000n
 * ```
 */
export declare function depthNotionalCapE6(tier: number, capDepth: bigint | null): bigint | null;
/** Depth cap on `N_cap` in engine Q (rounds down; `U128_MAX` only when there is no cap depth; 0 on a zero price). Port of `depth_cap_q`. */
export declare function depthCapQ(tier: number, capDepth: bigint | null, priceE6: bigint, posScale?: bigint): bigint;
/** Inputs of {@link nCapG8Q}. */
export interface NCapG8Input {
    /** Epoch clamp enforced on this market ({@link clampEnforced}). */
    clamp: boolean;
    /** Conservative LP equity (atoms). */
    cM: bigint;
    /** Stored lambda (bps). */
    lambdaBps: number;
    /** Combined tier (0 off the clamp). */
    tier: number;
    /** {@link capDepthE6} (fresh or sticky); `null` = no depth cap. */
    capDepth: bigint | null;
    priceE6: bigint;
    posScale?: bigint;
    /**
     * Controller round item 5: the SMOOTHED κ / λ_depth ({@link smoothDials}, as {@link GrowthCeilingView.dials}). Omitted = the step values at
     * `tier` (`kappaDepthBps(tier)` / `lambdaDepthBps(tier)`), i.e. `n_cap_g8_q`; given = `n_cap_g8_q_dials`, what the program reads since `666df893`.
     */
    dials?: {
        kappaBps: number;
        lambdaDepthBps: number;
    };
}
/**
 * G8 `N_cap`. Off a clamp-enforced market: exactly growth-1 `nCapQ(cM, stored lambda)`. On one: `min(nCapQ(cM, lambda_eff), depth cap)` with
 * the cap depth fresh or sticky (so a missing reading never lifts the cap). `null` where `nCapQ` is. Port of `n_cap_g8_q`.
 *
 * @param i  See {@link NCapG8Input}.
 * @returns Capacity in Q, or `null` (zero price / overflow).
 * @example
 * ```ts
 * nCapG8Q({ clamp: true, cM: 120_000_000_000n, lambdaBps: 20_000, tier: 2, capDepth: 150_000_000_000n, priceE6: 1_000_000n }); // 150_000_000_000n
 * ```
 */
export declare function nCapG8Q(i: NCapG8Input): bigint | null;
/**
 * `depth_cap_q` with an explicit κ (bps): `n_cap_q(floor(depth * κ / 1e4), 1x, P)`; `U128_MAX` with no cap depth, 0 on a zero price.
 * Port of `growth_v19::depth_cap_q_kappa`.
 *
 * @param kappaBps  κ in bps (smoothed or a step value).
 * @param capDepth  {@link capDepthE6}.
 * @param priceE6   Price.
 * @param posScale  Engine POS_SCALE.
 * @returns Q.
 * @example
 * ```ts
 * depthCapQKappa(5_000, 100_000_000n, 1_000_000n); // 50_000_000n
 * ```
 */
export declare function depthCapQKappa(kappaBps: number, capDepth: bigint | null, priceE6: bigint, posScale?: bigint): bigint;
/**
 * G8 ext-v3 `(inventoryCapQ, liquidityNotionalE6)`. Off the clamp or with no cap depth: the growth-1 caps at the lambda {@link nCapG8Q}
 * uses. With a cap depth (fresh or sticky): `cap = min(N_cap(lambda_eff), depth cap, engine limit)` and the liquidity is
 * `DEPTH_MULT` times the SMALLER capacity notional. Port of `growth_matcher_caps_g8`.
 *
 * @param i  {@link NCapG8Input} plus `hlockActive` and the engine position limit (default {@link GROWTH_MAX_POSITION_ABS_Q}).
 * @returns Caps for {@link encodeMatcherCallExtV3}.
 * @example
 * ```ts
 * growthMatcherCapsG8({ clamp: true, hlockActive: false, cM: 1_000_000_000n, lambdaBps: 10_000, tier: 0, capDepth: null, priceE6: 1_000_000n });
 * ```
 */
export declare function growthMatcherCapsG8(i: NCapG8Input & {
    hlockActive: boolean;
    maxPositionAbsQ?: bigint;
}): MatcherCallExtCapsV3;
/** `KAPPA_TABLE_BPS`: κ by tier, 0.5 / 1 / 1 / 2 (the step values of {@link kappaDepthBps}; the curve's anchor values). */
export declare const KAPPA_TABLE_BPS: readonly [bigint, bigint, bigint, bigint];
/** `LAMBDA_DEPTH_TABLE_BPS`: λ_depth by tier, 1x / 1x / 2x / 3x (the step values of {@link lambdaDepthBps}; the curve's anchor values). */
export declare const LAMBDA_DEPTH_TABLE_BPS: readonly [bigint, bigint, bigint, bigint];
/** `LOG2_FRAC_BITS`: fractional bits of the fixed-point log2 ({@link log2Q16}). */
export declare const LOG2_FRAC_BITS = 16;
/** `CURVE_ANCHOR0_DIV`: the implicit anchor 0 sits at `T1 / 4` and carries the tier-0 value of each table (launch, κ 0.5, λ 1x). */
export declare const CURVE_ANCHOR0_DIV = 4n;
/**
 * Fixed-point `log2(x)` in Q.16: `(floor(log2 x) << 16) | 16 fractional bits`, `null` for 0 (and, fail closed, for anything outside u64).
 * The integer part is exact (bit length); the fraction is the first 16 binary digits of `log2(m)` for the 32-bit normalised mantissa
 * `m in [2^31, 2^32)`, by 16 squarings with a floor at every step. Monotone non-decreasing, exact at powers of two. Port of
 * `growth_v19::log2_q16` (bit-exact).
 *
 * @param x  A u64 value.
 * @returns The Q.16 log2 (a u32), or `null` for 0 / out of range.
 * @example
 * ```ts
 * log2Q16(3n);     // 103_872 (floor(log2(3) * 2^16))
 * log2Q16(1_024n); // 655_360 (10 << 16)
 * ```
 */
export declare function log2Q16(x: bigint): number | null;
/**
 * The four curve anchors (atoms) of a market's thresholds: `[T1 / 4, T1, T2, T3]`. Port of `growth_v19::curve_anchors`.
 *
 * @param thresholdsE6  {@link tierThresholdsE6}.
 * @returns `[a0, a1, a2, a3]`.
 * @example
 * ```ts
 * curveAnchors([25_000n, 100_000n, 500_000n]); // [6_250n, 25_000n, 100_000n, 500_000n]
 * ```
 */
export declare function curveAnchors(thresholdsE6: Triple<bigint>): [bigint, bigint, bigint, bigint];
/**
 * Where a depth sits on the curve (`growth_v19::CurvePos`): `seg` = anchors met (0 = below anchor 0, 4 = at or past T3); for `seg` 1..3 the
 * value is `t[seg-1] + floor((t[seg] - t[seg-1]) * num / den)` with `num <= den`; `den == 0` = flat at `t[seg-1]`; `seg == 0xFF` = an
 * arithmetic failure (reads `t[0]`).
 */
export interface CurvePos {
    seg: number;
    num: number;
    den: number;
}
/** `CURVE_POS_FAIL`: a failed computation; {@link curveValue} reads `t[0]` (launch, κ 0.5, λ 1x). */
export declare const CURVE_POS_FAIL: Readonly<CurvePos>;
/**
 * The curve position of depth `d` (atoms). An anchor is met when `d >= anchor`, the anchor is not saturated (`u64::MAX`, D-L1) and not 0; a
 * depth of 0 meets nothing. Interpolation is on log2: `num = log2(d) - log2(lo)`, `den = log2(hi) - log2(lo)` (Q.16), capped `num <= den`,
 * so the value is EXACTLY the table at every anchor. A saturated or non-increasing next anchor gives `den = 0` (flat at the lower value).
 * A depth outside u64 (never on chain) fails closed to {@link CURVE_POS_FAIL}. Port of `growth_v19::curve_pos` (bit-exact).
 *
 * @param d             Depth (collateral atoms).
 * @param thresholdsE6  Thresholds (atoms, {@link tierThresholdsE6}).
 * @returns {@link CurvePos}.
 * @example
 * ```ts
 * curvePos(50_000n, [25_000n, 100_000n, 500_000n]); // { seg: 2, num: 65_536, den: 131_072 } (half-way in log2)
 * ```
 */
export declare function curvePos(d: bigint, thresholdsE6: Triple<bigint>): CurvePos;
/**
 * The curve value of a 4-entry table (index = tier) at a position: `t[0]` below anchor 0 (and on {@link CURVE_POS_FAIL}), `t[3]` at or past T3,
 * else floor-interpolated between the two neighbouring entries. A decreasing pair (never produced) reads the smaller value. Never above
 * `max(t)`. Port of `growth_v19::curve_value` (bit-exact: the Rust u64 / u128 products are exact, so one bigint form covers both).
 *
 * @param p  {@link curvePos}.
 * @param t  4-entry table (u64 values).
 * @returns The value.
 * @example
 * ```ts
 * curveValue({ seg: 2, num: 65_536, den: 131_072 }, [500n, 500n, 1_000n, 2_000n]); // 750n (7.5x)
 * ```
 */
export declare function curveValue(p: CurvePos, t: readonly [bigint, bigint, bigint, bigint]): bigint;
/**
 * `curveValue(curvePos(d, th), t)`: the LEADING curve (leverage). Port of `growth_v19::curve_u64`. Since percolator-prog 21b8ccfd κ / λ_depth
 * read the lagging curve ({@link curveLagU64}), not this.
 *
 * @param d             Depth (atoms).
 * @param thresholdsE6  Thresholds (atoms).
 * @param t             4-entry table.
 * @returns The curve value at `d`.
 * @example
 * ```ts
 * curveU64(200_000n, [25_000n, 100_000n, 500_000n], [500n, 500n, 1_000n, 2_000n]); // 1_430n (14.30x)
 * ```
 */
export declare function curveU64(d: bigint, thresholdsE6: Triple<bigint>, t: readonly [bigint, bigint, bigint, bigint]): bigint;
/**
 * `KAPPA_LAG_TOP_MUL`: the lagging capacity curve's top segment is `[T3, 4·T3)` (security review M-1). Port of `growth_v19::KAPPA_LAG_TOP_MUL`.
 */
export declare const KAPPA_LAG_TOP_MUL = 4n;
/**
 * The LAGGING curve position (κ / λ_depth; percolator-prog 21b8ccfd, security review M-1: continuous but never looser than the round-2 step
 * anywhere). The lag anchors `[T1, T2, T3, 4·T3]` are the leading anchors `[T1/4, T1, T2, T3]` shifted one place: for `lead.seg` 1..3 the lag
 * position is the same fraction one segment down (no log2); at or past T3 (`lead.seg == 4`) it is the place on `[T3, 4·T3)` (`4·T3`
 * saturating at u64: a saturated top anchor is never met and the segment is flat at `t[2]`, fail closed). Below T1 the value is `t[0]`; each
 * step value is reached at the NEXT anchor. {@link CURVE_POS_FAIL} stays the failure position (reads `t[0]`). Port of
 * `growth_v19::curve_pos_lag` (bit-exact).
 *
 * @param lead          The leading position, `curvePos(d, thresholdsE6)`.
 * @param d             The same depth (atoms).
 * @param thresholdsE6  Thresholds (atoms).
 * @returns The lagging {@link CurvePos}.
 * @example
 * ```ts
 * const th: [bigint, bigint, bigint] = [25_000n, 100_000n, 500_000n];
 * curvePosLag(curvePos(50_000n, th), 50_000n, th); // { seg: 1, num: 65_536, den: 131_072 } (half-way from t[0] to t[1])
 * ```
 */
export declare function curvePosLag(lead: CurvePos, d: bigint, thresholdsE6: Triple<bigint>): CurvePos;
/**
 * `curveValue(curvePosLag(curvePos(d, th), d, th), t)`: the lagging capacity curve (κ / λ_depth). Port of `growth_v19::curve_lag_u64`.
 *
 * @param d             Depth (atoms).
 * @param thresholdsE6  Thresholds (atoms).
 * @param t             4-entry table.
 * @returns The lagging curve value at `d`.
 * @example
 * ```ts
 * curveLagU64(200_000n, [25_000n, 100_000n, 500_000n], LAMBDA_DEPTH_TABLE_BPS); // 14_306n (the step there: 20_000)
 * curveLagU64(50_000n, [25_000n, 100_000n, 500_000n], KAPPA_TABLE_BPS);         // 7_500n (the step there: 10_000)
 * ```
 */
export declare function curveLagU64(d: bigint, thresholdsE6: Triple<bigint>, t: readonly [bigint, bigint, bigint, bigint]): bigint;
/**
 * The venue depth the curve reads: a DEX reading as is; a keeper-attested one clamped to the anchor of `m = attestedMaxTierEff` (`T_m`, where
 * the curve equals `L_m`, so it never exceeds `L_m`); no source: 0. Port of `growth_v19::venue_depth_capped` (continuous leverage: the cap
 * is the anchor itself, `T_m`, no longer `T_{m+1} - 1`).
 *
 * @param effectiveDepthE6       The usable depth (0 when absent).
 * @param depthSourceByte        Byte 44.
 * @param thresholdsE6           Thresholds (atoms).
 * @param attestedMaxTierStored  Byte 45.
 * @returns Depth for the venue curve.
 * @example
 * ```ts
 * venueDepthCapped(600_000n, DEPTH_SOURCE.Attested, [25_000n, 100_000n, 500_000n], 0); // 25_000n (default max tier 1: exactly L1)
 * ```
 */
export declare function venueDepthCapped(effectiveDepthE6: bigint, depthSourceByte: number, thresholdsE6: Triple<bigint>, attestedMaxTierStored: number): bigint;
/** The growth dials (`growth_v19::SmoothDials`): leverage on the leading curve, κ / λ_depth on the lagging curve (21b8ccfd). */
export interface SmoothDials {
    /** Leverage signal x100 = min(curve_L(venue), curve_L(book)) (leading curve; BEFORE the volatility term). */
    lSignalX100: number;
    /** κ (bps of the cap depth) = min(lag_κ(venue), lag_κ(book)) ({@link curveLagU64}: never looser than the step). */
    kappaBps: number;
    /** λ_depth (bps) = min(lag_λ(venue), lag_λ(book)) ({@link curveLagU64}: never looser than the step). */
    lambdaDepthBps: number;
}
/**
 * The dials at a (venue, book) depth pair plus the venue-only leverage curve value (the push writer's fall-only upper bound, `>= lSignalX100`).
 * The leverage signal is `min(curve(venue), curve(book))` on the LEADING curve; κ / λ_depth are the same min on the LAGGING curve
 * ({@link curvePosLag}, security review M-1: never looser than the step). Port of `growth_v19::smooth_dials_and_venue_l` (21b8ccfd).
 *
 * @param venueDepthE6  {@link venueDepthCapped}.
 * @param bookDepthE6   {@link bookDepthE6} of the bound LP (0 without `C_m`).
 * @param thresholdsE6  Thresholds (atoms).
 * @param lTableX100    `[L0..L3]` ({@link tierLeverage}).
 * @returns `{ dials, venueLX100 }`.
 * @example
 * ```ts
 * smoothDialsAndVenueL(600_000n, 50_000n, [25_000n, 100_000n, 500_000n], [500, 500, 1_000, 2_000]);
 * // { dials: { lSignalX100: 750, kappaBps: 7_500, lambdaDepthBps: 10_000 }, venueLX100: 2_000 }
 * ```
 */
export declare function smoothDialsAndVenueL(venueDepthE6: bigint, bookDepthE6: bigint, thresholdsE6: Triple<bigint>, lTableX100: readonly [number, number, number, number]): {
    dials: SmoothDials;
    venueLX100: number;
};
/**
 * The dials at a (venue, book) depth pair: leverage on the leading curve (equal to the tier table at each anchor, log-interpolated between
 * them), κ / λ_depth on the lagging curve. Port of `growth_v19::smooth_dials`.
 *
 * @param venueDepthE6  {@link venueDepthCapped}.
 * @param bookDepthE6   {@link bookDepthE6} of the bound LP (0 without `C_m`).
 * @param thresholdsE6  Thresholds (atoms).
 * @param lTableX100    `[L0..L3]` ({@link tierLeverage}).
 * @returns Dials.
 * @example
 * ```ts
 * smoothDials(110_000n, 600_000n, [25_000n, 100_000n, 500_000n], [500, 500, 1_000, 2_000]); // { lSignalX100: 1_059, kappaBps: 10_000, lambdaDepthBps: 10_592 }
 * ```
 */
export declare function smoothDials(venueDepthE6: bigint, bookDepthE6: bigint, thresholdsE6: Triple<bigint>, lTableX100: readonly [number, number, number, number]): SmoothDials;
/**
 * The smallest depth (atoms) at which the leverage curve reaches `targetX100`, or `null` when it never does (above `t[3]` or a flat /
 * saturated segment). Display helper for "Nx at $D pool depth"; monotone search over the bit-exact {@link curveU64}, so the answer is exactly
 * what the program reads (not an approximation of it).
 *
 * @param targetX100    Leverage x100 to reach.
 * @param thresholdsE6  Thresholds (atoms).
 * @param lTableX100    `[L0..L3]`.
 * @returns Depth (atoms), `0n` when `t[0]` already reaches it, or `null`.
 * @example
 * ```ts
 * curveDepthForLeverageX100(750, [25_000n, 100_000n, 500_000n], [500, 500, 1_000, 2_000]); // 50_000n
 * ```
 */
export declare function curveDepthForLeverageX100(targetX100: number, thresholdsE6: Triple<bigint>, lTableX100: readonly [number, number, number, number]): bigint | null;
/**
 * LEGACY (removed from the program by continuous leverage, `e699d7da`): round 3 item 5's 25% tier ramp. NOT what the program reads any
 * more; kept only so the parity suite can prove a stale mirror is caught (negative control). Do not use.
 *
 * @deprecated Use {@link curveU64}.
 * @param d      Depth (atoms).
 * @param th     Thresholds (atoms).
 * @param table  4-entry table.
 * @returns The old ramped value.
 * @example
 * ```ts
 * tierRampU64(110_000n, [25_000n, 100_000n, 500_000n], [500n, 500n, 1_000n, 2_000n]); // 700n (the old ramp; the program now reads 1_059n)
 * ```
 */
export declare function tierRampU64(d: bigint, th: Triple<bigint>, table: readonly [bigint, bigint, bigint, bigint]): bigint;
/** LEGACY: the removed ramp's span divisor. @deprecated The program no longer has it (continuous leverage). */
export declare const TIER_RAMP_DIV = 4n;
/** `VOL_EWMA_SHIFT`: EWMA weight 1/16 PER PUSH (not per unit of time; security review F-4). */
export declare const VOL_EWMA_SHIFT = 4;
/** `VOL_Z`: z of the volatility term. */
export declare const VOL_Z = 3n;
/** `VOL_MOVE_CAP_BPS`: one move is capped at 100% for the arithmetic. */
export declare const VOL_MOVE_CAP_BPS = 10000n;
/** `VOL_VAR_SEED_X100`: the first sample seeds `max(sample, 2,500)` ((5 bps)^2 per slot x100). */
export declare const VOL_VAR_SEED_X100 = 2500;
/** `GROWTH_FLAG_R3_LAYOUT`: `flags` bit 0, bytes 0..8 hold controller data (variance 0..4, rent stamp 4..8). Clear = legacy `c_launch`. */
export declare const GROWTH_FLAG_R3_LAYOUT = 1;
/** `GROWTH_FLAG_VOL_DATA`: `flags` bit 1, the variance has at least one sample (requires bit 0). */
export declare const GROWTH_FLAG_VOL_DATA = 2;
/**
 * Validator for the `flags` byte: only bits 0-1, and bit 1 only with bit 0 (0x00 / 0x01 / 0x03). Port of `growth_v19::growth_flags_ok`.
 * @param flags  Byte 39.
 * @returns Whether the program accepts it (it refuses the whole record otherwise).
 * @example
 * ```ts
 * growthFlagsOk(0x02); // false
 * ```
 */
export declare function growthFlagsOk(flags: number): boolean;
/**
 * One squared move, bps^2 per slot x100: `ceil(min(ceil(|p - p0| * 1e4 / p0), 1e4)^2 * 100 / dt)`; `null` with no previous mark or `dt == 0`.
 * Port of `growth_v19::vol_sample_x100`.
 * @param prevMarkE6  Previous authenticated mark.
 * @param markE6      This mark.
 * @param dtSlots     Slots between them.
 * @returns Sample or `null`.
 * @example
 * ```ts
 * volSampleX100(1_000_000n, 1_010_000n, 10n); // 100_000n
 * ```
 */
export declare function volSampleX100(prevMarkE6: bigint, markE6: bigint, dtSlots: bigint): bigint | null;
/**
 * The EWMA update (u32, saturating): the first sample seeds `max(sample, 2,500)`; later `var + ceil((sample - var) / 16)` on a rise,
 * `var - floor((var - sample) / 16)` on a fall (never understates). Port of `growth_v19::vol_update_x100`.
 * @param varX100     Stored variance.
 * @param hasData     `flags` bit 1.
 * @param sampleX100  {@link volSampleX100}.
 * @returns New variance.
 * @example
 * ```ts
 * volUpdateX100(1_600, true, 0n); // 1500
 * ```
 */
export declare function volUpdateX100(varX100: number, hasData: boolean, sampleX100: bigint): number;
/**
 * `ceil(sqrt(x))` for a non-negative bigint (exact; `isqrt_ceil_u128` after security review F-8, so `isqrtCeil(2) == 2`).
 * @param x  Non-negative integer.
 * @returns Ceiling square root.
 * @example
 * ```ts
 * isqrtCeil(17n); // 5n
 * ```
 */
export declare function isqrtCeil(x: bigint): bigint;
/**
 * σ over the horizon, bps: `ceil(sqrt(ceil(var * h / 100)))`, saturating at u64. Port of `growth_v19::sigma_h_bps`.
 * @param varX100  Variance x100.
 * @param hSlots   Horizon `H = 2 * band_max_epoch_slots` (saturating).
 * @returns σ_H bps.
 * @example
 * ```ts
 * sigmaHBps(2_500, 1_200n); // 174n
 * ```
 */
export declare function sigmaHBps(varX100: number, hSlots: bigint): bigint;
/**
 * The volatility leverage ceiling x100: `floor(1e6 / max(engine IMR, 3 * σ_H + liq fee))`, `0xffff` on a zero denominator, saturating at u16.
 * Port of `growth_v19::l_vol_x100`.
 * @param engineImrBps   Engine `initial_margin_bps`.
 * @param sigmaHBps_     {@link sigmaHBps}.
 * @param liqFeeBps      Engine `liquidation_fee_bps`.
 * @returns L_vol x100.
 * @example
 * ```ts
 * lVolX100(500n, 174n, 50n); // 1748 (17.48x)
 * ```
 */
export declare function lVolX100(engineImrBps: bigint, sigmaHBps_: bigint, liqFeeBps: bigint): number;
/**
 * The leverage signal with the volatility term: `min(lSignal, L_vol)`; no data (`null`) -> launch (`table[0]`). Port of `growth_v19::l_signal_with_vol`.
 * @param lSignalX100  Smoothed signal ({@link SmoothDials.lSignalX100}).
 * @param vol          {@link lVolX100}, or `null` when the record has no volatility data.
 * @param launchX100   `L_table[0]`.
 * @returns Signal x100.
 * @example
 * ```ts
 * lSignalWithVol(2_000, null, 500); // 500: no data -> launch
 * ```
 */
export declare function lSignalWithVol(lSignalX100: number, vol: number | null, launchX100: number): number;
/** Engine-config inputs of the volatility term (`growth_g8_ctx_view`). */
export interface GrowthVolInputs {
    /** Engine `initial_margin_bps`. */
    engineImrBps: bigint;
    /** Engine `liquidation_fee_bps`. */
    liquidationFeeBps: bigint;
    /** Engine `band_max_epoch_slots` (the horizon is twice it). */
    bandMaxEpochSlots: bigint;
}
/**
 * `L_vol` of a decoded record exactly as `growth_g8_ctx_view` computes it: `null` without volatility data (the caller then uses launch), else
 * `lVolX100(IMR, sigmaHBps(var, 2 * band_max_epoch_slots), liq fee)`.
 * @param g    Decoded growth record.
 * @param cfg  Engine config inputs.
 * @returns L_vol x100 or `null`.
 * @example
 * ```ts
 * growthLVolX100(g, { engineImrBps: 500n, liquidationFeeBps: 50n, bandMaxEpochSlots: 600n });
 * ```
 */
export declare function growthLVolX100(g: Pick<AssetGrowthV19, "volHasData" | "volVarX100">, cfg: GrowthVolInputs): number | null;
/** `STRESS_NONE`. */
export declare const STRESS_NONE = 0;
/** `STRESS_DRAW`: a senior draw / G9 backstop outstanding: target capped one tier below. */
export declare const STRESS_DRAW = 1;
/** `STRESS_ADL`: REAL ADL (an engine side mode != Normal): two tiers below. */
export declare const STRESS_ADL = 2;
/** `STRESS_HLOCK`: the bankruptcy h-lock: launch. */
export declare const STRESS_HLOCK = 3;
/**
 * D1(a): real ADL is an engine side mode other than Normal (0) on either side; the A factor alone is not read. Port of `growth_v19::real_adl`.
 * @param modeLong   Engine `mode_long`.
 * @param modeShort  Engine `mode_short`.
 * @returns Whether either side is in ADL.
 * @example
 * ```ts
 * realAdl(0, 2); // true
 * ```
 */
export declare function realAdl(modeLong: number, modeShort: number): boolean;
/**
 * The graded stress level (highest wins). Port of `growth_v19::stress_level`.
 * @param drawOutstanding  `outstanding_mirror_atoms != 0 || pending_moved_atoms != 0` on the asset's draw record.
 * @param realAdl_         {@link realAdl}.
 * @param hlock            The market's bankruptcy h-lock is latched.
 * @returns 0..3.
 * @example
 * ```ts
 * stressLevel(true, true, false); // STRESS_ADL
 * ```
 */
export declare function stressLevel(drawOutstanding: boolean, realAdl_: boolean, hlock: boolean): number;
/**
 * The STEPPED stress cap on the target x100: none (`0xffff`) at level 0; `table[max(tier - s, 0)]` for s = 1 (draw) / 2 (ADL); `table[0]` under the
 * h-lock. What every program reader uses (percolator-prog 21b8ccfd, security review M-2: under stress the target is `min(leverage curve,
 * this)` at the discrete COMBINED tier; the push writer passes the venue tier). Port of `growth_v19::stress_cap_x100`.
 * @param stress  Level 0..3.
 * @param tier    Combined tier (step).
 * @param table   `[L0..L3]`.
 * @returns Cap x100.
 * @example
 * ```ts
 * stressCapX100(STRESS_DRAW, 3, [500, 500, 1_000, 2_000]); // 1000
 * ```
 */
export declare function stressCapX100(stress: number, tier: number, table: readonly [number, number, number, number]): number;
/**
 * @deprecated Removed from the program at percolator-prog 21b8ccfd (security review M-2: the stress cap is STEPPED again, {@link stressCapX100}).
 * 3198539a's continuous stress cap, kept verbatim as the negative control of the parity suite; no SDK reader calls it.
 *
 * The leverage curve read `s` segments down at the SAME fractional position. Level 0: none (`0xffff`); the h-lock (>= 3): launch; a draw (1) /
 * real ADL (2) at segment 1..3 with `seg - 1 >= s`: `table[seg-1-s] + floor((table[seg-s] - table[seg-1-s]) * num / den)`; at or past T3:
 * `table[3 - s]`; below that (incl. below anchor 0 and {@link CURVE_POS_FAIL}): `table[0]`.
 *
 * @param stress  Level 0..3 ({@link stressLevel}).
 * @param p       Curve position ({@link curvePos}).
 * @param table   `[L0..L3]`.
 * @returns Cap x100.
 * @example
 * ```ts
 * stressCapCurveX100(STRESS_DRAW, curvePos(200_000n, [25_000n, 100_000n, 500_000n]), [500, 500, 1_000, 2_000]); // 715 (the program's stepped cap: 500)
 * ```
 */
export declare function stressCapCurveX100(stress: number, p: CurvePos, table: readonly [number, number, number, number]): number;
/** `RENT_SNAPSHOT_FALL_SLOTS`: the rent `N_cap` snapshot falls at most 2x per 900 slots. */
export declare const RENT_SNAPSHOT_FALL_SLOTS = 900n;
/**
 * The rent stamp of `slot`: `slot / 64 + 1`, saturating (never 0). Port of `growth_v19::rent_stamp64_of`.
 * @param slot  Slot.
 * @returns Stamp.
 * @example
 * ```ts
 * rentStamp64Of(6_400n); // 101
 * ```
 */
export declare function rentStamp64Of(slot: bigint): number;
/**
 * Item 7 (GAP-10): the rent snapshot a writer stores. A rise or a first measurement (`prev == 0`) applies at once, stamp kept; a fall is
 * `max(new, prev >> k)` with `k` = whole 900-slot windows since the latest slot the stamp stands for (`(stamp - 1) * 64 + 63`; a never-stamped
 * snapshot gets one halving at once), stamped now; `k == 0` holds `prev`. Port of `growth_v19::rent_snapshot_smooth`.
 *
 * @param prev     Stored `rent_n_cap_q`.
 * @param stamp64  Stored rent stamp ({@link AssetGrowthV19.rentStamp64}; 0 = none, incl. a legacy record).
 * @param next     The new snapshot ({@link rentSnapshotNCapQ}).
 * @param nowSlot  Current slot.
 * @returns `{ snapshot, stamp64 }`.
 * @example
 * ```ts
 * rentSnapshotSmooth(1_000n, 0, 1n, 6_400n); // { snapshot: 500n, stamp64: 101 }
 * ```
 */
export declare function rentSnapshotSmooth(prev: bigint, stamp64: number, next: bigint, nowSlot: bigint): {
    snapshot: bigint;
    stamp64: number;
};
/**
 * Item 7 (GAP-13c) bind guard: on a clamp-enforced market with a measured depth, one minimum band leg must fit in the tier-0 depth capacity,
 * `minLeg <= floor(κ0 * capDepth)`; `null` (never measured) passes. Tag 94 refuses with GrowthInvalidConfig otherwise.
 * Port of `growth_v19::band_min_leg_fits_depth`.
 * @param bandMinLegNotional  The band's minimum leg notional (atoms).
 * @param capDepth            {@link capDepthE6}.
 * @returns Whether the bind passes.
 * @example
 * ```ts
 * bandMinLegFitsDepth(10_000_000n, 10_000_000n); // false: 0.5 x $10 < $10
 * ```
 */
export declare function bandMinLegFitsDepth(bandMinLegNotional: bigint, capDepth: bigint | null): boolean;
/**
 * The engine's worst two-epoch adverse move for a band: `G(d) = ceil((1e4 + d)^2 / (1e4 - d)) - 1e4` bps
 * (engine `band_rent::band_worst_adverse_bps`; wrapper `band_r_gap_bps`).
 *
 * @param bandBps  Engine `band_bps` (1..=2000).
 * @returns `G(d)`, or `null` when `d` is out of range or `G` does not fit u16 (as the wrapper).
 * @example
 * ```ts
 * bandRGapBps(1_000n); // 3445n
 * ```
 */
export declare function bandRGapBps(bandBps: Num): bigint | null;
/**
 * Is the epoch clamp program-enforced for this market? True iff the engine `band_bps != 0` and the stored growth
 * `r_gap_bps` equals `G(band_bps)` (a mismatch fails closed to "not enforced").
 *
 * @param bandBps  Engine `config.band_bps` (0 = no band).
 * @param rGapBps  `AssetGrowthV19.rGapBps`.
 * @returns Whether graduation, the loosening dials and the depth tiers are allowed on this market.
 * @example
 * ```ts
 * clampEnforced(1_000, 3445); // true
 * clampEnforced(0, 400); // false
 * ```
 */
export declare function clampEnforced(bandBps: Num, rGapBps: Num): boolean;
/** Graduation in force: the clamp predicate, a band, and a tier >= 1 (`graduation_on`). */
export declare function graduationOn(clamp: boolean, bandBps: Num, tier: number): boolean;
/**
 * Live ceiling target (x100), R2.1 + controller round item 3: graduation on and `stress < h-lock`:
 * `min(L_tier, max(L_launch, min(L_signal, stressCap)))`; otherwise `min(L_launch, L_tier)`. `L_signal` is the smoothed, volatility-capped signal
 * ({@link GrowthCeilingView.lSignalX100}; `L_table(tier)` at step values) and `stressCap` the graded cap ({@link stressCapX100}).
 * Port of `growth_v19::target_ceiling_x100` (`666df893`).
 *
 * @param graduation     {@link graduationOn}.
 * @param stress         Stress level 0..3 ({@link stressLevel}). A legacy boolean `forceDown` is accepted: `true` reads as the h-lock (launch).
 * @param lLaunchX100    Launch leverage x100.
 * @param lTierX100      Tier maximum x100.
 * @param lSignalX100    The leverage signal x100 (round-2 name `lTableTierX100`).
 * @param stressCapX100_ {@link stressCapX100} (default `0xffff` = no cap).
 * @returns Target x100.
 * @example
 * ```ts
 * targetCeilingX100(true, STRESS_NONE, 500, 2_000, 1_000); // 1000
 * targetCeilingX100(true, STRESS_DRAW, 500, 2_000, 2_000, 1_000); // 1000: draw -> one tier down
 * ```
 */
export declare function targetCeilingX100(graduation: boolean, stress: number | boolean, lLaunchX100: number, lTierX100: number, lSignalX100: number, stressCapX100_?: number): number;
/**
 * Ceiling the gate applies (x100). Off the clamp: `min(L_launch, L_tier)` (growth-1). On it: `min(stored ratcheted ceiling, live target)` -- UP
 * gradually (only through the ratchet) and DOWN AT ONCE: stale / zero / missing depth, a depth collapse, draw / ADL stress, the h-lock or a lower
 * tier table all bind in the same read (security review F-1 fix A). Port of `growth_v19::ceiling_in_force_x100`.
 *
 * @param clamp        {@link clampEnforced}.
 * @param storedCeilX100 `ceil_x100`.
 * @param targetX100   {@link targetCeilingX100}.
 * @param lLaunchX100  Launch leverage x100.
 * @param lTierX100    Tier maximum x100.
 * @returns Ceiling x100.
 * @example
 * ```ts
 * ceilingInForceX100(true, 700, 1_000, 500, 2_000); // 700
 * ceilingInForceX100(true, 2_000, 500, 500, 2_000); // 500: down at once
 * ```
 */
export declare function ceilingInForceX100(clamp: boolean, storedCeilX100: number, targetX100: number, lLaunchX100: number, lTierX100: number): number;
/**
 * Ratchet the stored ceiling toward a target: UP GRADUALLY (+1x per 9,000 slots), DOWN AT ONCE (to the target in one call, stamped `now`); an
 * unchanged ceiling keeps its stamp; under the h-lock (`stress >= STRESS_HLOCK`) the target is the floor (launch). Graded draw / ADL stress only
 * chooses the TARGET ({@link stressCapX100}); there is no per-call descent limit. Port of `growth_v19::ratchet_ceiling_x100` (`666df893`).
 *
 * @param prevCeilX100 Stored ceiling x100.
 * @param prevSlot     Stored stamp.
 * @param targetX100   Target x100.
 * @param floorX100    Floor (launch) x100.
 * @param stress       Stress level (a legacy boolean `forceDown`: `true` = h-lock).
 * @param nowSlot      Current slot.
 * @returns `{ ceilX100, ceilSlot }`.
 * @example
 * ```ts
 * ratchetCeilingX100(500, 0n, 1_000, 500, STRESS_NONE, 9_000n); // { ceilX100: 600, ceilSlot: 9000n }
 * ```
 */
export declare function ratchetCeilingX100(prevCeilX100: number, prevSlot: bigint, targetX100: number, floorX100: number, stress: number | boolean, nowSlot: bigint): {
    ceilX100: number;
    ceilSlot: bigint;
};
/** `MIN_C_LAUNCH_ATOMS`: the recorded launch capital is never below $1,000 of 6-decimal collateral. */
export declare const GROWTH_MIN_C_LAUNCH_ATOMS = 1000000000n;
/**
 * `c_launch_atoms_for(C_m)`: `max(C_m, $1,000)`.
 * @deprecated Retired by the controller round: nothing on chain records or reads `c_launch` any more (its bytes carry the volatility EWMA and the
 * rent stamp). Kept for tooling that inspects legacy records.
 */
export declare function cLaunchAtomsFor(cM: bigint): bigint;
/** Inputs of {@link graduationRatchet} / {@link graduationFallOnly}. */
export interface GraduationWriterInput {
    prevCeilX100: number;
    prevSlot: bigint;
    graduation: boolean;
    /** Stress level 0..3 ({@link stressLevel}). */
    stress?: number;
    /** @deprecated Round-2 flag: `true` reads as the h-lock (launch). Ignored when `stress` is given. */
    forceDown?: boolean;
    lLaunchX100: number;
    lTierX100: number;
    /** The leverage signal x100 (smoothed + volatility; the venue ramp for the fall-only writer). */
    lTableTierX100: number;
    /** {@link stressCapX100} at the writer's tier (default `0xffff` = none). */
    stressCapX100?: number;
    nowSlot: bigint;
}
/**
 * The ratchet writer at a site with the bound LP's `C_m` in hand (clamp-enforced markets; tags 5 / 78 / fills / 103 / 106): ratchets toward
 * {@link targetCeilingX100} (falls to it at once, rises <= +1x per 9,000 slots). The retired `c_launch` snapshot is gone (controller round item 6).
 * Port of `growth_v19::graduation_ratchet` (`666df893`).
 *
 * @param i  {@link GraduationWriterInput}.
 * @returns `{ ceilX100, ceilSlot }`.
 * @example
 * ```ts
 * graduationRatchet({ prevCeilX100: 500, prevSlot: 0n, graduation: true, stress: STRESS_NONE, lLaunchX100: 500, lTierX100: 2_000, lTableTierX100: 1_000, nowSlot: 9_000n });
 * // { ceilX100: 600, ceilSlot: 9000n }
 * ```
 */
export declare function graduationRatchet(i: GraduationWriterInput): {
    ceilX100: number;
    ceilSlot: bigint;
};
/**
 * The fall-only ratchet (PushAuthMark: the depth changed, no `C_m` in hand). The caller passes the VENUE tier's graduation, the venue leverage ramp
 * (with the volatility term) and the stress cap at the venue tier: an upper bound of the real target, so the stored ceiling only ever falls here,
 * to that bound at once, stamped `now`. Port of `growth_v19::graduation_fall_only` (`666df893`).
 *
 * @param i  {@link GraduationWriterInput}.
 * @returns `{ ceilX100, ceilSlot }`.
 * @example
 * ```ts
 * graduationFallOnly({ prevCeilX100: 2_000, prevSlot: 7n, graduation: true, stress: STRESS_HLOCK, lLaunchX100: 500, lTierX100: 2_000, lTableTierX100: 1_000, nowSlot: 99n });
 * // { ceilX100: 500, ceilSlot: 99n }
 * ```
 */
export declare function graduationFallOnly(i: GraduationWriterInput): {
    ceilX100: number;
    ceilSlot: bigint;
};
/** What raises the ceiling next. */
export interface NextUnlock {
    /**
     * `depth`: only the pool depth is short. `backing`: only the market backing is short. `both`: both are short ("10x unlocks at $100k pool
     * depth and $100k market backing"). `ratchet`: the target is already higher; the ceiling climbs +1x per hour ("next step in ~N min").
     * `none`: nothing more to unlock (or graduation is off for this market).
     */
    kind: "depth" | "backing" | "both" | "ratchet" | "none";
    /** The liquidity tier whose requirements are named (`depth` / `backing` / `both`). */
    tier?: number;
    /** Pool depth the tier needs, in whole COLLATERAL TOKENS (the market's own threshold; $ on 6-decimal USD collateral). */
    depthUsd?: number;
    /** Market backing (LP equity) the tier needs, whole collateral tokens, rounded up; accounts for the market's lambda below 1x. */
    backingUsd?: number;
    /** Alias of the tier's pool-depth threshold (round-1 field), whole collateral tokens. */
    thresholdUsd?: number;
    /**
     * R2-M1: the pool depth is already there (the fresh reading reaches the threshold) but the rate limit still holds the usable depth below it (it
     * rises at most 2x per hour). `depthEtaSlots` / `depthEtaMinutes` then say when the usable depth reaches the threshold if the readings stay up.
     */
    depthRateLimited?: boolean;
    depthEtaSlots?: bigint;
    depthEtaMinutes?: number;
    /** The ceiling (x100) reached: at the tier unlock, or the next ratchet step. */
    leverageX100?: number;
    /**
     * True when keeper-reported depth can never reach this tier on this market (`attested_max_tier` is below it): the tier needs an
     * on-chain pool reading (SetDepthSource + PushAuthMark mode 2).
     */
    needsOnChainDepth?: boolean;
    /** `ratchet`: slots until the next step is allowed (0 = on the next write). */
    etaSlots?: bigint;
    /** `ratchet`: the same in whole minutes, rounded up (display "next step in about N min"). */
    etaMinutes?: number;
    /**
     * The pool depth (whole collateral tokens, rounded up) at which this tier's leverage is reached IN FULL. Continuous leverage (`e699d7da`): the
     * curve equals the tier's table value exactly at its threshold, so this is the threshold itself (it was the end of round 3's 25% ramp);
     * below it the leverage is already log-interpolated toward this value ({@link curveDepthForLeverageX100} for any intermediate value).
     */
    fullDepthUsd?: number;
}
/** Everything derived from the growth record + band + depth + LP equity for the app. */
/** `KAPPA_CAP_NUM / KAPPA_CAP_DEN`: κ_cap = fee · 0.5 · 101.5 = `floor(fee_bps · 1015 / 20)` (growth_v19 S-3). */
export declare const KAPPA_CAP_NUM = 1015;
export declare const KAPPA_CAP_DEN = 20;
/** `KAPPA_CAP_FALLBACK_FEE_BPS`: the pool fee is not plumbed (`growth_g8_ctx_view` passes `None`), so every market reads 5 bps => κ_cap 253 bps. */
export declare const KAPPA_CAP_FALLBACK_FEE_BPS = 5;
/** `lev_guard_v22::W1_LIVE` (false at 02524b05): before W1 ships λ_eff is also capped at 1.0. */
export declare const LEV_W1_LIVE = false;
/** `LAMBDA_CAP_PRE_W1_BPS`: λ_eff ≤ 1.0 until W1. */
export declare const LAMBDA_CAP_PRE_W1_BPS = 10000;
/** `LAMBDA_VOL_HORIZON_SLOTS`: σ for λ_vol over 72 h before W1 (24 h after). */
export declare const LAMBDA_VOL_HORIZON_SLOTS: bigint;
/**
 * `growth_v19::kappa_cap_bps`: the κ cap (bps of depth) of a pool with fee `feeBps`, rounded DOWN.
 *
 * @param feeBps  Pool fee (bps).
 * @returns `floor(feeBps * 1015 / 20)`.
 * @example
 * ```ts
 * kappaCapBps(5); // 253
 * ```
 */
export declare function kappaCapBps(feeBps: number): number;
/**
 * `growth_v19::kappa_eff_bps`: `min(κ_tier, kappaCapBps(fee))`, an unknown fee (`null`) reading {@link KAPPA_CAP_FALLBACK_FEE_BPS}. Tighten-only.
 *
 * @param kappaTierBps  κ from the dials (lagging curve).
 * @param feeBps        Pool fee, or `null` (what the program passes today).
 * @returns κ_eff (bps).
 * @example
 * ```ts
 * kappaEffBps(10_000, null); // 253
 * ```
 */
export declare function kappaEffBps(kappaTierBps: number, feeBps: number | null): number;
/**
 * `lev_guard_v22::lambda_vol_bps`: `λ_vol = 0.95 / (2·σ_H)` = `floor(47_500_000 / σ_bps)`; σ 0 = no cap.
 *
 * @param sigmaHBps_  σ over {@link LAMBDA_VOL_HORIZON_SLOTS} (bps).
 * @returns λ_vol (bps), `Number.MAX_SAFE_INTEGER` for no cap.
 */
export declare function lambdaVolBps(sigmaHBps_: bigint): number;
/**
 * `lev_guard_v22::lambda_fallback_bps`: `min(λ, [1.0 before W1], λ_vol)`. Tighten-only.
 *
 * @param lambdaEffBps  λ_depth from the dials.
 * @param sigmaHBps_    σ over {@link LAMBDA_VOL_HORIZON_SLOTS} (bps).
 * @returns The capped λ_depth (bps).
 * @example
 * ```ts
 * lambdaFallbackBps(20_000, sigmaHBps(2_500, 648_000n)); // 10_000 (the 1.0 cap binds; λ_vol ~11,800)
 * ```
 */
export declare function lambdaFallbackBps(lambdaEffBps: number, sigmaHBps_: bigint): number;
/**
 * The two rc23 lines of `growth_g8_ctx_view` on a clamp-enforced market: κ ← `kappaEffBps(κ, None)`, λ_depth ←
 * `lambdaFallbackBps(λ_depth, σ_72h)` with σ from the stored variance, the seed variance without data (fails closed).
 *
 * @param dials  The dials from {@link smoothDialsAndVenueL}.
 * @param g      The growth record (its variance).
 * @returns The capped dials (leverage signal unchanged).
 */
export declare function rc23CapDials(dials: SmoothDials, g: Pick<AssetGrowthV19, "volHasData" | "volVarX100">): SmoothDials;
/** Options of {@link growthCeilingView}. */
export interface GrowthCeilingOptions {
    /**
     * Apply the rc23 κ / λ caps ({@link rc23CapDials}). Default `true` (the program this file tracks). `false` quotes a wrapper that predates
     * them (prog #594 / #599 not deployed); the caps only ever tighten, so `true` never over-quotes either program.
     */
    rc23Caps?: boolean;
}
export interface GrowthCeilingView {
    /** Combined tier `min(venue, book)`; 0 off the clamp. */
    tier: number;
    venueTier: number;
    bookTier: number;
    /** Book depth of the bound LP ({@link bookDepthE6}); 0 when `cM` is unknown. */
    bookDepthE6: bigint;
    /** The USABLE depth ({@link usableDepthE6} = min(fresh reading, rate-limited last good); 0n when absent or a real zero). */
    effectiveDepthE6: bigint;
    /** The fresh min-of-two reading before the rate limit ({@link freshDepthE6}); `null` when absent. */
    freshDepthE6: bigint | null;
    /** The collateral mint's decimals the thresholds are scaled by. */
    collateralDecimals: number;
    /** The depth the capacity cap uses (fresh, sticky, or `null` for none). */
    capDepthE6: bigint | null;
    /** This market's thresholds in collateral atoms. */
    thresholdsE6: Triple<bigint>;
    /** This market's leverage table x100 `[L0, L1, L2, L3]`. */
    table: readonly [number, number, number, number];
    clampEnforced: boolean;
    /** Graduation above `L_launch` is allowed (clamp enforced and tier >= 1). */
    graduationOn: boolean;
    /** Live target before the stored-ratchet minimum. */
    targetX100: number;
    /** What the gate reads. */
    ceilingX100: number;
    /** Controller round: the graded stress level used (0 none, 1 draw, 2 real ADL, 3 h-lock). */
    stress: number;
    /** The graded stress cap in force: the STEPPED {@link stressCapX100} at the combined tier (21b8ccfd, review M-2; `0xffff` = none / off the clamp). */
    stressCapX100: number;
    /** The dials: leverage on the leading curve (`lSignalX100`, BEFORE the volatility term), κ / λ_depth on the lagging curve (feed the capacity). Tier-0 values off the clamp. */
    dials: SmoothDials;
    /** The venue-only leverage curve value x100 (the push writer's fall-only upper bound, `>= dials.lSignalX100`); 0 off the clamp. */
    venueLX100: number;
    /** Item 6: `L_vol` x100, or `null` without volatility data (the signal then falls back to launch). */
    lVolX100: number | null;
    /** The leverage signal the target reads: `min(dials.lSignalX100, L_vol)` (launch with no volatility data). */
    lSignalX100: number;
    /** The record has volatility data but no {@link GrowthVolInputs} were passed: the view failed closed to launch. */
    volInputsMissing: boolean;
    /** The venue depth the curve reads ({@link venueDepthCapped}). */
    venueDepthE6: bigint;
    /** Item 4: the time-weighted window minimum (atoms), `null` without history. */
    depthTwMinE6: bigint | null;
    /** The next thing that raises the ceiling: the ratchet step when the target is already higher, else the tier requirements. */
    nextUnlock: NextUnlock;
    /** The next tier's requirements regardless of the ratchet. */
    nextTierUnlock: NextUnlock;
    /**
     * λ_eff every stored-λ reader uses (`growth_capacity_lambda_view`: the P1 LP cap 68, the P3-H2 vault-LP cap 80, the bond / junior
     * locks): `min(stored λ, dials.lambdaDepthBps)` on a clamp-enforced market, the stored λ off it.
     */
    lambdaEffBps: number;
}
/**
 * Derive tier, ceiling and next unlock for one asset, exactly as the wrapper's gate does (`growth_g8_ctx_view` + `growth_ceiling_x100`,
 * percolator-prog `666df893`): usable depth = `min(fresh, rate-limited last good, window minimum)`; `tier = min(venue, book)` (step tiers, for
 * graduation and the STEPPED stress cap, 21b8ccfd review M-2); the dials `min(curve(venue), curve(book))`: leverage on the continuous curve, κ / λ_depth on
 * the lagging curve (21b8ccfd review M-1); the leverage signal capped by `L_vol` (launch with no volatility data); `ceiling = min(stored, target)` on a
 * clamp-enforced market.
 *
 * @param g          Decoded growth record.
 * @param bandBps    Engine `band_bps`.
 * @param nowSlot    Current slot.
 * @param cM         Conservative LP equity (atoms), or `null` when the LP is not in hand (the book tier reads 0: never looser).
 * @param stress     Stress level ({@link stressLevel}); a legacy boolean `forceDown` is accepted (`true` = h-lock, launch).
 * @param vol        Engine config for the volatility term ({@link GrowthVolInputs}). Required for an exact ceiling once the record has volatility
 *                   data; omitted -> the view fails closed to launch and sets `volInputsMissing`.
 * @param opts       {@link GrowthCeilingOptions} (rc23 κ / λ caps, on by default).
 * @returns {@link GrowthCeilingView}.
 * @example
 * ```ts
 * const v = growthCeilingView(g, 1000, slot, cM, stressLevel(drawOut, realAdl(mL, mS), hlock), { engineImrBps: 500n, liquidationFeeBps: 50n, bandMaxEpochSlots: 600n });
 * if (v.nextUnlock.kind === "both") console.log(`${v.nextUnlock.leverageX100! / 100}x unlocks at $${v.nextUnlock.depthUsd} pool depth and $${v.nextUnlock.backingUsd} market backing`);
 * ```
 */
export declare function growthCeilingView(g: AssetGrowthV19, bandBps: number, nowSlot: bigint, cM: bigint | null, stress: number | boolean, vol?: GrowthVolInputs, opts?: GrowthCeilingOptions): GrowthCeilingView;
/** Inputs of {@link quoteMaxLeverage}. */
export interface QuoteMaxLeverageInput {
    /** Engine initial margin (bps) of the asset. */
    engineImrBps: bigint;
    /** Decoded growth record, or `null` when growth is OFF. */
    growth: AssetGrowthV19 | null;
    /** LP capital (atoms). */
    lpCapital: bigint;
    /** LP PnL (signed). */
    lpPnl: bigint;
    /** LP fee credits (signed). */
    lpFeeCredits: bigint;
    /** LP's ADL-effective signed position (Q). */
    lpEffectivePositionQ: bigint;
    /**
     * N-1 (wrapper re-verification fix): the asset has a BOUND P3 vault LP and the LP above IS it.
     * Growth opens are admitted only then (otherwise error 97 / 95); `false` => both sides closed.
     */
    assetBound: boolean;
    /** Asset `oi_eff_long_q` (engine, ADL-effective, includes the vault LP's own leg). */
    oiEffLongQ: bigint;
    /** Asset `oi_eff_short_q`. */
    oiEffShortQ: bigint;
    /** Oracle price (e6). */
    priceE6: bigint;
    /** The market's bankruptcy h-lock is latched: crowd side is closed (the thin side stays open). */
    bankruptcyHlockActive: boolean;
    /** Engine `POS_SCALE` (default 1_000_000n). */
    posScale?: bigint;
    /**
     * v2.2 growth: engine `band_bps` and the current slot. When present the quote applies the combined tier (lambda_eff, the fresh or sticky
     * kappa depth cap), graduation and the stored ratchet; when absent it is the growth-1 quote (`min(L_launch, L_tier)`, no depth).
     */
    v22?: {
        bandBps: number;
        nowSlot: bigint;
        /** Controller round item 3: a senior draw / G9 backstop outstanding on the asset (`outstanding_mirror_atoms != 0 || pending_moved_atoms != 0`). */
        drawOutstanding?: boolean;
        /** Engine side modes (`mode_long`, `mode_short`): any non-zero is REAL ADL ({@link realAdl}). */
        modeLong?: number;
        modeShort?: number;
        /** Item 6: engine `liquidation_fee_bps` and `band_max_epoch_slots` for `L_vol` (the IMR is `engineImrBps`). Omitted on a record with volatility data -> launch (fail closed). */
        vol?: {
            liquidationFeeBps: bigint;
            bandMaxEpochSlots: bigint;
        };
        /** rc23 κ / λ caps ({@link GrowthCeilingOptions.rc23Caps}); default `true`. */
        rc23Caps?: boolean;
    };
}
/** Why a side is closed. */
export type GrowthClosedReason = "hlock" | "capacity-zero" | "capacity-full" | "invalid-config" | "not-bound";
/** Result of {@link quoteMaxLeverage}. */
export interface MaxLeverageQuote {
    side: "long" | "short";
    /** The taker's fill on this side grows |LP| (LP short/flat for longs; LP long/flat for shorts). */
    crowd: boolean;
    /** `true` -> new risk on this side is refused (GrowthCapacityFull). */
    closed: boolean;
    closedReason: GrowthClosedReason | null;
    /** Max leverage x100 (550 = 5.5x); 0 when closed. */
    maxLeverageX100: number;
    /** The IMR (bps) the quote is based on: ceiling IMR (thin side) or the marginal dynamic IMR (crowd side). */
    imrBps: bigint | null;
    /**
     * `u = OI_users(this side) / N_cap` in bps (N-1: the users' open interest on this side, NOT the
     * LP's net); `null` when growth is off or capacity is 0.
     */
    utilizationBps: bigint | null;
    /** `N_cap_q`; `null` when growth is off or the price is 0. */
    nCapQ: bigint | null;
    /** Whether growth-v19 is on for this asset. */
    growthOn: boolean;
    /**
     * Marginal capacity on this side, `N_cap - OI_users(side)` (Q): the TradeCpi clip. 0 when this
     * side is closed, INCLUDING `OI_users == N_cap` (a fill landing exactly on N_cap is admitted at
     * u == 1, but no NEW room is left). Both sides have one since N-1. `null` when growth is off.
     */
    headroomQ: bigint | null;
    /**
     * M-1: always `true`. On a growth asset a strict reduce or close is never clipped or refused for
     * growth CAPACITY: not for N_cap, the LP floor, closed mode or the h-lock (the wrapper marks such
     * legs TAKER_REDUCING from the ADL-effective position). On a single TradeCpi a FLIP is clipped to
     * its closing part; the opening part needs a new order, which faces the gate. Every `closed`
     * above applies to NEW risk only. NOT a promise that every close fills: (a) the ENGINE's own
     * initial margin on the LP still applies (an LP that cannot carry the position refuses, Custom 49:
     * "the market maker can't take this close right now"), and (b) a NoCpi close into a counterparty
     * that OPENS is refused as a whole (95): close against the book (TradeCpi) instead.
     */
    reduceOnlyCapacityExempt: true;
    /**
     * N-2: the utilisation-fee rate (bps of the opening notional) at this side's CURRENT utilisation
     * (0 at or below the kink; `null` when growth is off or the side is closed). Any open pushes u up, so it
     * pays at least this: use {@link previewGrowthOpenFee} for the exact charge and the fee to sign.
     */
    utilisationFeeBps: number | null;
    /** v2.2: the ceiling in force (x100): `min(stored, live target)`; the growth-1 `min(L_launch, L_tier)` without `v22` input; 0 when growth is off. */
    ceilingX100: number;
    /** v2.2: liquidity tier 0..3 = `min(venue, book)` (0 without `v22` input). */
    tier: number;
    /** v2.2: the pool-depth (venue) tier and the market-backing (book) tier behind {@link MaxLeverageQuote.tier}. */
    venueTier: number;
    bookTier: number;
    /** v2.2: the depth the capacity cap used (fresh reading, or the decayed last good one after the readings stopped); `null` = none ever. */
    capDepthE6: bigint | null;
    /**
     * v2.2: what raises the ceiling next: the ratchet step when the target is already higher (`{ kind: "ratchet", leverageX100: 700, etaMinutes: 41 }`),
     * else the tier requirements, naming BOTH when both bind (`{ kind: "both", depthUsd: 100000, backingUsd: 100000, leverageX100: 1000 }`).
     */
    nextUnlock: NextUnlock;
    /** v2.2: the next tier's requirements regardless of any climb in progress. */
    nextTierUnlock: NextUnlock;
    /** v2.2: graduation above `L_launch` is allowed (clamp enforced and tier >= 1). */
    graduationOn: boolean;
    /** λ_eff of the P1 LP cap / P3-H2 cap ({@link GrowthCeilingView.lambdaEffBps}); the stored λ without the v2.2 input; null with growth off. */
    lambdaEffBps: number | null;
}
/**
 * Quote the maximum leverage a taker can open on `side` right now.
 *
 * Crowd detection: taker long => the LP goes shorter. A side is "crowd" iff the taker's fill on it
 * grows |LP|: LP short or flat => longs crowd; LP long or flat => shorts crowd (a flat LP: both).
 * Ceiling `L_ceil = min(l_launch, l_tier)` growth-1; with `v22` input (clamp-enforced band market) `min(stored ratcheted ceiling, target)` where
 * `target = min(L_tier, max(L_launch, L_table(tier)))` and `tier = min(venue tier, book tier)` (R2.1; see {@link growthCeilingView}).
 * N-1 (wrapper re-verification fix): opens need the asset's BOUND vault LP (`assetBound`, else
 * closed "not-bound"), and capacity is the USERS' open interest on each side
 * (`usersSideOiQ`), capped at `N_cap` on BOTH sides, so `|LP| <= N_cap` after any sequence.
 * Thin side: `1e6 / ceilingImr`, closed when its users OI is at `N_cap`. Crowd side: closed if the
 * h-lock is active, `N_cap == 0` (also a zero price) or users OI `>= N_cap`; otherwise the MARGINAL
 * leverage at the current utilisation, `floor(1e6 / dynImr(OI_users, N_cap, base, kink))`.
 * Growth OFF => `floor(1e6 / engineImr)`.
 *
 * IMPORTANT: on-chain the check runs on the POST-TRADE users OI (`OI_users + fill`), and the
 * requirement is evaluated at that larger utilisation. This quote uses the current OI, so it is
 * an UPPER BOUND for any order that grows the crowd; a large order can be refused (92/93) even
 * when quoted. Reductions and closes are never checked, clipped or refused for capacity
 * (`reduceOnlyCapacityExempt`, with the two stated exceptions): `closed` means NEW risk on that
 * side only (a flip is clipped to its closing part on a single TradeCpi). Every risk-increasing
 * fill must face the bound vault LP (error 95), so NoCpi trades between two non-LPs can only reduce.
 *
 * @param input  Market/LP state (see {@link QuoteMaxLeverageInput}).
 * @param side   Taker side.
 * @returns {@link MaxLeverageQuote}.
 * @example
 * ```ts
 * const q = quoteMaxLeverage({ engineImrBps: 1000n, growth, lpCapital: 1_746_000_000n, lpPnl: 0n,
 *   lpFeeCredits: 0n, lpEffectivePositionQ: -720_000_000n, priceE6: 1_000_000n, bankruptcyHlockActive: false,
 *   assetBound: true, oiEffLongQ: 720_000_000n, oiEffShortQ: 720_000_000n }, "long");
 * q.maxLeverageX100; // marginal leverage x100
 * ```
 */
export declare function quoteMaxLeverage(input: QuoteMaxLeverageInput, side: "long" | "short"): MaxLeverageQuote;
/**
 * N-1: the users' (everyone but the vault LP) ADL-effective open interest on one side. Port of
 * the wrapper's `users_side_oi_q` (saturating).
 *
 * @param oiEffSideQ     The asset's `oi_eff_long_q` (long) or `oi_eff_short_q` (short).
 * @param vaultLpEffQ    The vault LP's ADL-effective signed position.
 * @param longSide       Which side.
 * @returns Users OI on that side (Q).
 * @example
 * ```ts
 * usersSideOiQ(1_000n, 400n, true); // 600n (the LP's own long leg removed)
 * ```
 */
export declare function usersSideOiQ(oiEffSideQ: bigint, vaultLpEffQ: bigint, longSide: boolean): bigint;
/**
 * N-2: the utilisation fee (bps) an open pays when it leaves its side's users OI at
 * `usersOiAfterQ`: 0 at or below the kink, `ceil(max * (u - u_k) / (1 - u_k))` above, capped at
 * `max`. Port of `growth_v19::utilisation_fee_bps`; `null` when `nCap == 0`.
 *
 * @param usersOiAfterQ  Users OI on the taker's side after the open (Q).
 * @param nCapQ          `N_cap` (Q).
 * @param kinkBps        The growth kink (bps).
 * @param maxFeeBps      The utilisation fee at u = 1 (`utilFeeMaxEffectiveBps(record)`).
 * @returns The fee in bps, or `null`.
 * @example
 * ```ts
 * utilisationFeeBps(700n, 1_000n, 5_000, 500); // 200
 * ```
 */
export declare function utilisationFeeBps(usersOiAfterQ: bigint, nCapQ: bigint, kinkBps: number, maxFeeBps: number): number | null;
/**
 * N-2: the utilisation-fee dial in force (a stored 0 means the protocol default).
 *
 * @param stored  `AssetGrowthV19.utilFeeMaxBps`.
 * @returns bps at u = 1.
 * @example
 * ```ts
 * utilFeeMaxEffectiveBps(0); // 500
 * ```
 */
export declare function utilFeeMaxEffectiveBps(stored: number): number;
/**
 * N-2: the OPENING part of a taker fill (`|after|` for a flip, `|after - before|` for an open or
 * grow, 0 for a reduce / close). Port of `growth_v19::opening_part_q`.
 *
 * @param beforeQ  Taker's ADL-effective position before (Q).
 * @param afterQ   After (Q).
 * @returns Opening part (Q).
 * @example
 * ```ts
 * openingPartQ(-100n, 50n); // 50n
 * ```
 */
export declare function openingPartQ(beforeQ: bigint, afterQ: bigint): bigint;
/** Result of {@link previewGrowthOpenFee}. */
export interface GrowthOpenFeePreview {
    /** The opening part of the order (Q); 0 for a close / reduce. */
    openingQ: bigint;
    /** Users OI on the order's side after it fills (Q). */
    usersOiAfterQ: bigint;
    /** Utilisation fee as a rate on the WHOLE fill (bps), exactly what the wrapper charges. */
    utilFeeBps: number;
    /**
     * Minimum `fee_bps` the taker must sign on TradeCpi for this order, excluding the matcher's own
     * requested fee (add up to {@link GROWTH_PIN_MAX_REQUESTED_FEE_BPS} for the kind-2 quote).
     */
    minSignedFeeBpsExMatcher: bigint;
    /** A BatchTradeCpi leg with `utilFeeBps > 0` is refused (99): use TradeCpi. */
    batchAllowed: boolean;
}
/**
 * N-2 fee preview for a growth open on a BOUND asset (the vault LP is the counterparty): the
 * utilisation fee the wrapper will charge and the fee the taker must sign. Closes / reduces never
 * pay it. Evaluated at the CURRENT N_cap and users OI (the wrapper uses the same pre-fill numbers).
 *
 * @param input        The quote inputs (see {@link QuoteMaxLeverageInput}).
 * @param takerEffQ    Taker's ADL-effective signed position on the asset (Q).
 * @param sizeQ        Signed order size (Q).
 * @param tradeFeeBaseBps  The market's `trade_fee_base_bps`.
 * @returns {@link GrowthOpenFeePreview}.
 * @example
 * ```ts
 * const p = previewGrowthOpenFee(input, 0n, 100_000_000n, 30n);
 * p.minSignedFeeBpsExMatcher; // 30 + utilisation fee
 * ```
 */
export declare function previewGrowthOpenFee(input: QuoteMaxLeverageInput, takerEffQ: bigint, sizeQ: bigint, tradeFeeBaseBps: bigint): GrowthOpenFeePreview;
/**
 * L-2 floor on the creator-declared `r_gap`: `max_price_move_bps_per_slot * 50`. Port of
 * `r_gap_floor_bps` (the wrapper fails closed on u64 overflow; so does this).
 *
 * @param maxPriceMoveBpsPerSlot  Engine per-slot price limit (bps).
 * @returns The minimum `r_gap_bps`.
 * @example
 * ```ts
 * rGapFloorBps(4n); // 200n
 * ```
 */
export declare function rGapFloorBps(maxPriceMoveBpsPerSlot: bigint): bigint;
/**
 * Client guard for the batch cap: a BatchTradeCpi carrying any growth leg is refused above
 * {@link GROWTH_BATCH_MAX_LEGS} legs (every leg then sends the 72-byte ext v3; CU headroom).
 *
 * @param legCount        Number of legs in the batch.
 * @param anyGrowthLeg    Whether at least one leg's asset has growth ON.
 * @returns void; throws when the wrapper would refuse (96 GrowthBatchTooManyLegs).
 * @example
 * ```ts
 * assertGrowthBatchLegs(11, true); // throws
 * ```
 */
export declare function assertGrowthBatchLegs(legCount: number, anyGrowthLeg: boolean): void;
/**
 * Tag 0 InitMarket with the growth trailer: the existing {@link encodeInitMarket} bytes followed by
 * `u16 r_gap_bps` and `u16 l_launch_x100` (both must be non-zero, else the wrapper returns
 * InvalidInstructionData). Without the trailer tag 0 is byte-for-byte legacy.
 *
 * @param args           InitMarket arguments (same as {@link encodeInitMarket}).
 * @param rGapBps        Worst move between liquidation opportunities (bps), > 0.
 * @param lLaunchX100    Creator's starting leverage cap x100, > 0 (program also bounds it to the tier).
 * @param collateralDecimals  Optional: the collateral mint's decimals; more than 12 throws (D-L1, the wrapper answers 94).
 * @returns Legacy bytes + 4 trailer bytes.
 * @example
 * ```ts
 * const data = encodeInitMarketV19(args, 500, 550);
 * ```
 */
export declare function encodeInitMarketV19(args: InitMarketV17Args | InitMarketArgs, rGapBps: number, lLaunchX100: number, collateralDecimals?: number): Uint8Array;
/**
 * Tag 94 InitVaultLp with the growth trailer: `[94, u16 junior_floor_bps, u16 l_launch_x100]`
 * (5 bytes; `l_launch_x100` non-zero). Writes the creator's launch cap at bind on a growth asset.
 *
 * @param juniorFloorBps  Junior floor bps (the wrapper enforces its own range).
 * @param lLaunchX100     Starting leverage cap x100, > 0.
 * @returns 5 bytes.
 * @example
 * ```ts
 * encodeInitVaultLpV19(2000, 550); // [94, 0xd0, 0x07, 0x26, 0x02]
 * ```
 */
export declare function encodeInitVaultLpV19(juniorFloorBps: number, lLaunchX100: number): Uint8Array;
/**
 * Tag 93 SetAssetRiskLimitsV19 (growth dials only, upgrade-authority). Wire: `[93, asset_index u16]`,
 * then the rest of the 44-byte legacy body (incl. tag) ALL ZERO (it exists only for wire disambiguation: the wrapper refuses
 * a non-zero body with Custom(9), never applies it, and a dial change leaves the asset's risk limits
 * untouched), then `u32 growth_lambda_bps` + `u16 growth_kink_bps`: 50 bytes including the tag.
 *
 * Bounds enforced client-side (= wrapper `growth_dials_ok(false, ..)`, no epoch clamp):
 * lambda in [1, 10_000], kink in [0, 5_000].
 *
 * @param assetIndex  Asset slot (must be a growth-enabled asset on-chain).
 * @param lambdaBps   `lambda_bps`, 1..=10_000.
 * @param kinkBps     Kink u_k, 0..=5_000.
 * @returns 50 bytes.
 * @example
 * ```ts
 * encodeSetAssetRiskLimitsV19(0, 10_000, 5_000);
 * ```
 */
export declare function encodeSetAssetRiskLimitsV19(assetIndex: number, lambdaBps: number, kinkBps: number, utilFeeMaxBps?: number): Uint8Array;
/** Wire length of a tier block: `[T1 u32][T2 u32][T3 u32][L1 u16][L2 u16][L3 u16]` (`TIER_CONFIG_WIRE_LEN`). */
export declare const TIER_CONFIG_WIRE_LEN = 18;
/** Length of the tag 93 growth trailer with the tier block: `[lambda u32][kink u16][util_fee u16]` + tier block + `attested_max_tier u8`. */
export declare const SET_ASSET_RISK_LIMITS_TIERS_TRAILER_LEN = 27;
/**
 * Tag 94 InitVaultLp with the growth trailer AND the creator's tier block: `[94, junior_floor u16, l_launch_x100 u16, T1 u32, T2 u32,
 * T3 u32, L1 u16, L2 u16, L3 u16]` (23 bytes). Merged field by field under any upgrade-authority preset (a non-zero preset field is kept) and
 * bounded by the wrapper's `tier_config_ok`, else 130 `GrowthTierConfigInvalid` (the bind reverts). The creator can never set `attested_max_tier`.
 * Throws client-side on a table {@link validateTierConfig} refuses (given `lTierX100`, pass it to check before signing).
 *
 * @param juniorFloorBps  Junior floor bps (u16).
 * @param lLaunchX100     Starting leverage cap x100, > 0.
 * @param tiers           T1..T3 whole USD and L1..L3 x100 (0 = protocol default).
 * @param lTierX100       Optional: the market's built-in maximum x100; when given the table is validated before it is encoded.
 * @returns 23 bytes.
 * @example
 * ```ts
 * encodeInitVaultLpV22Tiers(2000, 500, { thresholdUsd: [25_000, 100_000, 500_000], leverageX100: [500, 1_000, 2_000] }, 2_000);
 * ```
 */
export declare function encodeInitVaultLpV22Tiers(juniorFloorBps: number, lLaunchX100: number, tiers: TierConfig, lTierX100?: number): Uint8Array;
/**
 * Tag 93 SetAssetRiskLimitsV22Tiers (upgrade authority): the dials AND the per-market tier table AND `attested_max_tier`. Wire: `[93,
 * asset_index u16]`, 41 zero bytes (the legacy body, never applied), then the 27-byte trailer `[lambda u32][kink u16][util_fee_max u16 (0 =
 * unchanged)][T1 u32][T2 u32][T3 u32][L1 u16][L2 u16][L3 u16][attested_max_tier u8]`: 71 bytes. The table is REPLACED as given (0 = default);
 * a change never jumps the ceiling (it moves the target, the ratchet climbs +1x per hour, down is at once). The wrapper bounds the dials
 * with its band-aware box (this encoder only checks the u32 / u16 ranges and `lambda >= 1`); the table with `tier_config_ok` and
 * `attested_max_tier <= 3`, else 130. Pass `lTierX100` to check the table before signing.
 *
 * @param assetIndex       Asset slot.
 * @param lambdaBps        `lambda_bps` (u32, >= 1; the wrapper's box is band-dependent).
 * @param kinkBps          Kink u_k (u16).
 * @param tiers            Tier table (T1..T3 whole USD, L1..L3 x100; 0 = default).
 * @param attestedMaxTier  0 (default 1) ..= 3: the highest venue tier keeper-attested depth may earn.
 * @param utilFeeMaxBps    0 = unchanged.
 * @param lTierX100        Optional: the market's built-in maximum x100 and `lLaunchX100`, to validate the table first.
 * @returns 71 bytes.
 * @example
 * ```ts
 * encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, { thresholdUsd: [0, 0, 0], leverageX100: [0, 0, 0] }, 1);
 * ```
 */
export declare function encodeSetAssetRiskLimitsV22Tiers(assetIndex: number, lambdaBps: number, kinkBps: number, tiers: TierConfig, attestedMaxTier: number, utilFeeMaxBps?: number, check?: {
    lLaunchX100: number;
    lTierX100: number;
}): Uint8Array;
/** v2 call-extension fields: the v1 block plus the LP's signed position. */
export interface MatcherCallExtV2 extends MatcherCallExt {
    /** i128 `lp_position_q` (the LP's engine position; `i128::MIN` is refused by the matcher). */
    lpPositionQ: bigint;
}
/**
 * Encode the 40-byte v2 block (`CallExt::encode_v2`): the v1 24-byte block with byte 0 = 2, then the
 * i128 `lp_position_q` at 24..40.
 *
 * @param ext  v1 fields + `lpPositionQ`.
 * @returns 40 bytes.
 * @example
 * ```ts
 * encodeMatcherCallExtV2({ ...v1, lpPositionQ: -1_234_567n });
 * ```
 */
export declare function encodeMatcherCallExtV2(ext: MatcherCallExtV2): Uint8Array;
/** v3 caps. */
export interface MatcherCallExtCapsV3 {
    /** `inventory_cap_q` (Q): 0 means CLOSED to LP growth (NOT unlimited). Must fit i128. */
    inventoryCapQ: bigint;
    /** `liquidity_notional_e6`: the depth `min(ctx, ext)` (0 = keep the context value). */
    liquidityNotionalE6: bigint;
}
/**
 * Encode the 72-byte v3 block (`CallExt::encode_v3` / `growth_v19::encode_ext_v3_from_v2`): the
 * 40-byte v2 block with byte 0 = 3, then `u128 inventory_cap_q` @40 and `u128 liquidity_notional_e6`
 * @56. `inventory_cap_q == 0` means the LP-growth side is CLOSED, not unlimited.
 *
 * @param ext   v2 fields (v1 block + `lpPositionQ`).
 * @param caps  Capital-derived caps.
 * @returns 72 bytes.
 * @example
 * ```ts
 * const b = encodeMatcherCallExtV3({ headroomQ, markSlot, execBandBps: 500, takerReducing: true, acceptsFeeRequest: true, lpPositionQ },
 *   { inventoryCapQ: nCap, liquidityNotionalE6: depth });
 * ```
 */
export declare function encodeMatcherCallExtV3(ext: MatcherCallExtV2, caps: MatcherCallExtCapsV3): Uint8Array;
/**
 * Wrap an existing 40-byte v2 block into v3 (port of `encode_ext_v3_from_v2`).
 *
 * @param v2    A 40-byte v2 block (byte 0 is overwritten with 3).
 * @param caps  Capital-derived caps.
 * @returns 72 bytes.
 * @example
 * ```ts
 * encodeMatcherCallExtV3FromV2(v2Block, { inventoryCapQ: 25_000_000_000n, liquidityNotionalE6: 1_746_000_000n });
 * ```
 */
export declare function encodeMatcherCallExtV3FromV2(v2: Uint8Array, caps: MatcherCallExtCapsV3): Uint8Array;
/**
 * Port of `ext_v3_mark_taker_reducing` (M-1): the wrapper sets TAKER_REDUCING (byte 1 bit 3) on a
 * growth leg's v3 block, in any ext mode, whenever the leg only reduces the taker (strictly, or a
 * flip already clipped to its close). The matcher then never clips it for LP capacity.
 *
 * @param v3            72-byte v3 block.
 * @param takerReducing Whether the leg only reduces the taker.
 * @returns A copy with the flag set when `takerReducing`.
 * @example
 * ```ts
 * markExtV3TakerReducing(block, true)[1] & 0x08; // 8
 * ```
 */
export declare function markExtV3TakerReducing(v3: Uint8Array, takerReducing: boolean): Uint8Array;
/** Re-exported for convenience: u64 max (headroom saturation). */
export declare const GROWTH_U64_MAX: bigint;
export {};
