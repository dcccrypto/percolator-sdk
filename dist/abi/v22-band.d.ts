import type { LayoutTable } from "./layout.js";
/** Slots per day at 400 ms slots (`SLOTS_PER_YEAR / 365`). */
export declare const SLOTS_PER_DAY_V22: number;
/**
 * `growth_v19::rent_rate_e9`: per-slot rent rate in e9 of notional. `null` on `n_cap == 0`, a kink above 100% or overflow.
 *
 * @param usersOiSideQ  Users' open interest on the side.
 * @param nCapQ         `rent_n_cap_q`.
 * @param kinkBps       `rent_kink_bps`.
 * @param maxE9PerSlot  `rent_max_e9_per_slot`.
 * @returns Rate, or `null`.
 * @example
 * ```ts
 * rentRateE9V22(900n, 1000n, 5000, 100n); // ceil(100 * (9000 - 5000) / 5000) = 80n
 * ```
 */
export declare function rentRateE9V22(usersOiSideQ: bigint, nCapQ: bigint, kinkBps: number, maxE9PerSlot: bigint): bigint | null;
/**
 * `rent_rate_e9_fail_closed`: `rentRateE9V22` or the ceiling when it is `null` (overflow must not switch rent off).
 *
 * @param usersOiSideQ  Users' open interest on the side.
 * @param nCapQ         `rent_n_cap_q`.
 * @param kinkBps       `rent_kink_bps`.
 * @param maxE9PerSlot  `rent_max_e9_per_slot`.
 * @returns Rate.
 * @example
 * ```ts
 * rentRateE9FailClosedV22(1n, 0n, 0, 77n); // 77n
 * ```
 */
export declare function rentRateE9FailClosedV22(usersOiSideQ: bigint, nCapQ: bigint, kinkBps: number, maxE9PerSlot: bigint): bigint;
/**
 * `growth_v19::users_side_oi_q`: the side's open interest without the vault LP's own leg.
 *
 * @param oiSideQ     Side open interest.
 * @param vaultLpEffQ Vault LP net position (signed).
 * @param longSide    `true` for the long side.
 * @returns Users' open interest.
 * @example
 * ```ts
 * usersSideOiQV22(100n, 30n, true); // 70n
 * ```
 */
export declare function usersSideOiQV22(oiSideQ: bigint, vaultLpEffQ: bigint, longSide: boolean): bigint;
/**
 * Rent as a percent of notional per day for a per-slot e9 rate (0.04 = 0.04%).
 *
 * @param rateE9PerSlot  Rate.
 * @returns Percent per day.
 * @example
 * ```ts
 * rentPercentPerDayV22(100n);
 * ```
 */
export declare function rentPercentPerDayV22(rateE9PerSlot: bigint): number;
/** Inputs for {@link assetPriceLaggedV22} and the rules built on it. */
export interface BandAssetInputs {
    bandBps: number;
    /** `effective_price` (the mark, per lot e6). */
    effectivePrice: bigint;
    /** `raw_oracle_target_price`. */
    targetPrice: bigint;
    oiEffLongQ: bigint;
    oiEffShortQ: bigint;
    maxPriceMoveBpsPerSlot: bigint;
    maxAccrualDtSlots: bigint;
    /** `band_pin_since_slot` (0 = not pinned). */
    pinSinceSlot: bigint;
}
/**
 * `asset_price_lagged_view`: the asset is EXPOSED (open interest on either side) and its mark differs from its target.
 * An unexposed asset is never lagged. (The wrapper applies this gate on band markets only, `band_bps != 0`.)
 *
 * @param a  Asset inputs.
 * @returns `true` when lagged.
 * @example
 * ```ts
 * assetPriceLaggedV22({ ...inputs, oiEffLongQ: 0n, oiEffShortQ: 0n }); // false
 * ```
 */
export declare function assetPriceLaggedV22(a: BandAssetInputs): boolean;
/**
 * `band_floor_stuck_view`: the price can no longer move toward its target: the cap law's per-accrual step at `P_last`
 * is 0 ticks, OR the pin clock is running and the band at `P_last` is narrower than 32 ticks. Band markets only.
 * Returns `true` when the width cannot be evaluated (the wrapper errors there; the SDK says "let the chain decide").
 *
 * @param a  Asset inputs.
 * @returns `true` when stuck.
 * @example
 * ```ts
 * bandFloorStuckV22({ ...inputs, maxPriceMoveBpsPerSlot: 0n });
 * ```
 */
export declare function bandFloorStuckV22(a: BandAssetInputs): boolean;
/**
 * `reject_band_favourable_close_view`: would the wrapper refuse this fill with 104 (`PriceBandPinned`)? Only the
 * REDUCING part of a fill matters (a reduce, a close, or the closing part of a flip). While the mark lags its target a
 * close may land at `P_last` only on the WORSE side for the closer: a long sells at `P_last`, favourable iff the target is
 * below it; a short buys, favourable iff the target is above it. The floor-stuck exemption lifts the refusal.
 *
 * @param a               Asset inputs.
 * @param positionBefore  The account's signed position before the fill.
 * @param delta           Signed change.
 * @returns `true` when refused (104).
 * @example
 * ```ts
 * favourableCloseRefusedV22(asset, 5n, -5n);
 * ```
 */
export declare function favourableCloseRefusedV22(a: BandAssetInputs, positionBefore: bigint, delta: bigint): boolean;
/** Decoded band / rent config words. */
export interface BandConfigV22 {
    maxAccrualDtSlots: bigint;
    maxPriceMoveBpsPerSlot: bigint;
    /** 0 = no band. */
    bandBps: number;
    bandMaxEpochSlots: bigint;
    bandMaxPinSlots: bigint;
    /** 0 = no rent. */
    rentMaxE9PerSlot: bigint;
    bandMaxPositionsPerSide: bigint;
    bandMinLegNotional: bigint;
}
/** Decoded asset band / rent words. */
export interface AssetBandStateV22 {
    effectivePrice: bigint;
    rawOracleTargetPrice: bigint;
    bandAnchorPrice: bigint;
    bandAnchorSlot: bigint;
    bandEpoch: bigint;
    bandUncertifiedLong: bigint;
    bandUncertifiedShort: bigint;
    bandLiqPendingLong: bigint;
    bandLiqPendingShort: bigint;
    /** 0 = not pinned. */
    bandPinSinceSlot: bigint;
    rentIndexLongNum: bigint;
    rentIndexShortNum: bigint;
    rentUnroutedAtoms: bigint;
    oiEffLongQ: bigint;
    oiEffShortQ: bigint;
}
/** Decoded rent fields of the growth record and the vault LP record. */
export interface AssetRentStateV22 {
    rentKinkBps: number;
    rentNCapQ: bigint;
    vaultLpNetQ: bigint;
    vaultLpBound: boolean;
}
/**
 * Decode the config's band / rent words.
 *
 * @param data  Raw market account bytes.
 * @returns The words.
 * @throws {@link UnknownLayoutError} for an unknown VERSION or a v2.1 market.
 * @example
 * ```ts
 * const c = decodeBandConfigV22(info.data); if (c.bandBps !== 0) { }
 * ```
 */
export declare function decodeBandConfigV22(data: Uint8Array): BandConfigV22;
/**
 * Decode asset `assetIndex`'s band / rent words from the engine slot (plus the mark, target and open interest).
 *
 * @param data        Raw market account bytes.
 * @param assetIndex  Asset slot.
 * @returns The words.
 * @throws {@link UnknownLayoutError} / `RangeError` for a bad layout or slot.
 * @example
 * ```ts
 * const s = decodeAssetBandStateV22(info.data, 0);
 * ```
 */
export declare function decodeAssetBandStateV22(data: Uint8Array, assetIndex?: number): AssetBandStateV22;
/**
 * Decode the rent fields of the growth record (`rent_kink_bps`, `rent_n_cap_q`) and the vault LP record (`lp_net_q`, bound flag).
 *
 * @param data        Raw market account bytes.
 * @param assetIndex  Asset slot.
 * @returns The fields.
 * @throws {@link UnknownLayoutError} / `RangeError` for a bad layout or slot.
 * @example
 * ```ts
 * const r = decodeAssetRentStateV22(info.data, 0);
 * ```
 */
export declare function decodeAssetRentStateV22(data: Uint8Array, assetIndex?: number): AssetRentStateV22;
/** `rent_rates_view`: per-side rent rates, e9 of notional per slot (0 without a rent ceiling, a bound vault or a measured `N_cap`). */
export declare function rentRatesFromStateV22(cfg: BandConfigV22, asset: AssetBandStateV22, rent: AssetRentStateV22): {
    long: bigint;
    short: bigint;
};
/** The band + rent view of one asset. */
export interface BandRentViewV22 {
    assetIndex: number;
    config: BandConfigV22;
    asset: AssetBandStateV22;
    rent: AssetRentStateV22;
    band: {
        enabled: boolean;
        recoveryMinutes: number;
    };
    price: {
        markE6: bigint;
        targetE6: bigint;
        /** The wrapper's lag predicate: exposed AND mark != target, band markets only. */
        lagging: boolean;
        /** Mirror of `band_floor_stuck_view`: while stuck the wrapper does NOT refuse the favourable close. */
        floorStuck: boolean;
        /** The side whose close is refused (104) right now; `null` when nothing is refused. */
        favourableCloseSide: "long" | "short" | null;
    };
    rentRates: {
        enabled: boolean;
        long: bigint;
        short: bigint;
    };
}
/**
 * Compose the band / rent view of an asset. Returns `null` for a market with neither a band nor a holding fee.
 *
 * @param data        Raw market account bytes.
 * @param assetIndex  Asset slot.
 * @returns The view, or `null`.
 * @throws {@link UnknownLayoutError} for unknown / v2.1 layouts (use {@link tryReadBandRentViewV22} to never throw).
 * @example
 * ```ts
 * const v = readBandRentViewV22(info.data); if (v?.price.favourableCloseSide === "long") warn();
 * ```
 */
export declare function readBandRentViewV22(data: Uint8Array, assetIndex?: number): BandRentViewV22 | null;
/**
 * {@link readBandRentViewV22} that never throws: `null` for anything that is not a readable v2.2 band / rent market.
 *
 * @param data        Raw market account bytes (or null).
 * @param assetIndex  Asset slot.
 * @returns The view or `null`.
 * @example
 * ```ts
 * const v = tryReadBandRentViewV22(info?.data);
 * ```
 */
export declare function tryReadBandRentViewV22(data: Uint8Array | null | undefined, assetIndex?: number): BandRentViewV22 | null;
/** Layout rows that carry band words (for callers that branch on version). */
export declare function layoutHasBandRentV22(layout?: LayoutTable | undefined): boolean;
