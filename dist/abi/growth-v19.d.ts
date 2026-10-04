import type { InitMarketV17Args, InitMarketArgs } from "./instructions.js";
import type { MatcherCallExt } from "./matcher-v2.js";
import type { SetAssetRiskLimitsArgsP1 } from "./risk-limits-p1.js";
/** `growth_v19::BPS`. */
export declare const GROWTH_BPS = 10000n;
/** `growth_v19::MAX_IMR_BPS` (100% initial margin = 1x). */
export declare const GROWTH_MAX_IMR_BPS = 10000n;
/** `growth_v19::LEVERAGE_X100_ONE` (1x). */
export declare const GROWTH_LEVERAGE_X100_ONE = 100;
/** `growth_v19::MAX_LAMBDA_BPS` (10x of capital). */
export declare const GROWTH_MAX_LAMBDA_BPS = 100000;
/** Tag-93 growth trailer bound: kink in [0, 5_000] (program-enforced; plan §2.1). */
export declare const GROWTH_MAX_KINK_BPS_TAG93 = 5000;
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
/** Field offsets inside the 120-byte `AssetGrowthV19` record (rustc `repr(C)`, no u128). */
export declare const ASSET_GROWTH_FIELD_OFF: Readonly<{
    readonly cLaunchAtoms: 0;
    readonly ceilSlot: 8;
    readonly lambdaBps: 16;
    readonly lLaunchX100: 20;
    readonly lTierX100: 22;
    readonly ceilX100: 24;
    readonly kinkBps: 26;
    readonly rGapBps: 28;
    readonly allocAlphaBps: 30;
    readonly allocBufferBps: 32;
    readonly cushionTargetBps: 34;
    readonly cushionShareBps: 36;
    readonly version: 38;
    readonly flags: 39;
    readonly reserved: 40;
}>;
/** `CALL_EXT_V3_VERSION`. */
export declare const MATCHER_CALL_EXT_VERSION_V3 = 3;
/** v2 block length (24-byte v1 + i128 lp_position_q). */
export declare const MATCHER_CALL_EXT_V2_LEN = 40;
/** v3 block length (v2 + u128 inventory_cap_q + u128 liquidity_notional_e6). */
export declare const MATCHER_CALL_EXT_V3_LEN = 72;
/** `CALL_EXT_VERSION_V2`. */
export declare const MATCHER_CALL_EXT_VERSION_V2 = 2;
type Num = bigint | number;
/** Decoded `AssetGrowthV19` (version != 0). */
export interface AssetGrowthV19 {
    /** Junior risk capital at launch (atoms); 0 = not recorded. */
    cLaunchAtoms: bigint;
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
    allocAlphaBps: number;
    allocBufferBps: number;
    cushionTargetBps: number;
    cushionShareBps: number;
    version: number;
    flags: number;
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
 * @returns Byte offset into the market account.
 * @example
 * ```ts
 * assetGrowthAccountOffsetV19(0); // 2022
 * ```
 */
export declare function assetGrowthAccountOffsetV19(assetIndex: number): number;
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
 * `liquidity_notional_e6` the wrapper hands the matcher: `floor(c_m * lambda / 1e4)`. Port of
 * `liquidity_notional_e6`.
 *
 * @param cM         Conservative LP equity (atoms).
 * @param lambdaBps  Lambda (bps).
 * @returns The depth, or `null` on u128 overflow.
 * @example
 * ```ts
 * liquidityNotionalE6(1_746_000_000n, 10_000n); // 1_746_000_000n
 * ```
 */
export declare function liquidityNotionalE6(cM: bigint, lambdaBps: Num): bigint | null;
/**
 * Kinked dynamic IMR for a crowd-joining fill. Port of `dyn_imr_bps`. `null` == refused
 * (GrowthCapacityFull): `n_cap` is 0, `lp_abs_after >= n_cap` (u >= 1 is REFUSED, exactly as in
 * the wrapper: `u == 1` does not get the 100% IMR), a corrupt input or a u128 overflow.
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
    /** Oracle price (e6). */
    priceE6: bigint;
    /** The market's bankruptcy h-lock is latched: crowd side is closed. */
    bankruptcyHlockActive: boolean;
    /** Engine `POS_SCALE` (default 1_000_000n). */
    posScale?: bigint;
}
/** Why a side is closed. */
export type GrowthClosedReason = "hlock" | "capacity-zero" | "capacity-full" | "invalid-config";
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
    /** `|LP| / N_cap` in bps; `null` when growth is off or capacity is 0. */
    utilizationBps: bigint | null;
    /** `N_cap_q`; `null` when growth is off or the price is 0. */
    nCapQ: bigint | null;
    /** Whether growth-v19 is on for this asset. */
    growthOn: boolean;
}
/**
 * Quote the maximum leverage a taker can open on `side` right now.
 *
 * Crowd detection: taker long => the LP goes shorter. A side is "crowd" iff the taker's fill on it
 * grows |LP|: LP short or flat => longs crowd; LP long or flat => shorts crowd (a flat LP: both).
 * Ceiling `L_ceil = min(l_launch, l_tier)` (graduation is compiled off in the wrapper). Thin side:
 * `1e6 / ceilingImr`. Crowd side: closed if the h-lock is active, `N_cap == 0` (also a zero price)
 * or `|LP| >= N_cap`; otherwise the MARGINAL leverage at the current utilisation,
 * `floor(1e6 / dynImr(|LP|, N_cap, base, kink))`. Growth OFF => `floor(1e6 / engineImr)`.
 *
 * IMPORTANT: on-chain the check runs on the POST-TRADE LP position (`|LP| + fill`), and the
 * requirement is evaluated at that larger utilisation. This quote uses the current `|LP|`, so it is
 * an UPPER BOUND for any order that grows the crowd; a large order can be refused (92/93) even
 * when quoted. Reductions and closes are never checked.
 *
 * @param input  Market/LP state (see {@link QuoteMaxLeverageInput}).
 * @param side   Taker side.
 * @returns {@link MaxLeverageQuote}.
 * @example
 * ```ts
 * const q = quoteMaxLeverage({ engineImrBps: 1000n, growth, lpCapital: 1_746_000_000n, lpPnl: 0n,
 *   lpFeeCredits: 0n, lpEffectivePositionQ: -720_000_000n, priceE6: 1_000_000n, bankruptcyHlockActive: false }, "long");
 * q.maxLeverageX100; // marginal leverage x100
 * ```
 */
export declare function quoteMaxLeverage(input: QuoteMaxLeverageInput, side: "long" | "short"): MaxLeverageQuote;
/**
 * Tag 0 InitMarket with the growth trailer: the existing {@link encodeInitMarket} bytes followed by
 * `u16 r_gap_bps` and `u16 l_launch_x100` (both must be non-zero, else the wrapper returns
 * InvalidInstructionData). Without the trailer tag 0 is byte-for-byte legacy.
 *
 * @param args           InitMarket arguments (same as {@link encodeInitMarket}).
 * @param rGapBps        Worst move between liquidation opportunities (bps), > 0.
 * @param lLaunchX100    Creator's starting leverage cap x100, > 0 (program also bounds it to the tier).
 * @returns Legacy bytes + 4 trailer bytes.
 * @example
 * ```ts
 * const data = encodeInitMarketV19(args, 500, 550);
 * ```
 */
export declare function encodeInitMarketV19(args: InitMarketV17Args | InitMarketArgs, rGapBps: number, lLaunchX100: number): Uint8Array;
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
/** Tag 93 growth trailer fields (upgrade-authority only). */
export interface SetAssetRiskLimitsGrowthV19 {
    /** `lambda_bps` in [1, 100_000]. The task spec bounds it to [1, 10_000]; the wrapper constant `MAX_LAMBDA_BPS` is 100_000 (see PR notes). */
    growthLambdaBps: number;
    /** Kink u_k in [0, 5_000]. */
    growthKinkBps: number;
}
/**
 * Tag 93 SetAssetRiskLimits with the growth trailer (UA-only). The FULL legacy body is always
 * present in this form (41 bytes + `matcher_ext_mode` u8 + `max_requested_fee_bps` u16 = 44),
 * followed by `u32 growth_lambda_bps` + `u16 growth_kink_bps` = 50 bytes including the tag.
 *
 * Bounds enforced client-side: lambda in [1, 10_000] (plan), kink in [0, 5_000].
 *
 * @param a       Legacy tag-93 fields (the optional tail defaults to 0, but is ALWAYS emitted).
 * @param growth  Growth trailer.
 * @returns 50 bytes.
 * @example
 * ```ts
 * encodeSetAssetRiskLimitsV19({ assetIndex: 0, execBandBps: 300, lpExposureKBps: 0, lpFloorAtoms: 0n, sideOiCapQ: 0n },
 *   { growthLambdaBps: 10_000, growthKinkBps: 5_000 });
 * ```
 */
export declare function encodeSetAssetRiskLimitsV19(a: SetAssetRiskLimitsArgsP1, growth: SetAssetRiskLimitsGrowthV19): Uint8Array;
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
/** Re-exported for convenience: u64 max (headroom saturation). */
export declare const GROWTH_U64_MAX: bigint;
export {};
