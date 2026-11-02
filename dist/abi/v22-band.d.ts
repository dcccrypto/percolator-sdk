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
/** `RENT_OCC_KNEE_BPS`: at or below 85% of the side cap a side pays no occupancy charge. */
export declare const RENT_OCC_KNEE_BPS_V22 = 8500;
/** `RENT_OCC_CAP_DOMAIN`: past the knee a cap above 2^16 fails closed to the full charge. */
export declare const RENT_OCC_CAP_DOMAIN_V22: bigint;
/** `OCC_RAMP_ONE`: the Q32 ramp of a full side. */
export declare const OCC_RAMP_ONE_V22: bigint;
/** `OCC_REF_MIN_LEG_MULTIPLE`: the reference leg of `F_full`, in multiples of `band_min_leg_notional` (the tag-119 bound). */
export declare const OCC_REF_MIN_LEG_MULTIPLE_V22 = 4n;
/** `OCC_BSL_RENT_MULTIPLE`: InitMarket validates the Band Safety Law at `rent_max * 5` on band markets (else 106). */
export declare const OCC_BSL_RENT_MULTIPLE_V22 = 5n;
/** `OCC_CK_TAG`: bit 63 of a portfolio's `last_fee_slot` marks an occupancy checkpoint (band markets, while Live). */
export declare const OCC_CK_TAG_V22: bigint;
/**
 * `growth_v19::occ_ramp`: the occupancy ramp scaled to `max`. 0 when `cap == 0` or `max == 0` or at / below the knee;
 * past it `ceil(max * x^2)` with `x = (o - k) / (1 - k)`, clamped to `1..=max`; `max` at a full side or a cap above
 * {@link RENT_OCC_CAP_DOMAIN_V22}. Inputs are u64 (`count`, `cap`, `max`).
 *
 * @param count  Stored positions on the side (`stored_pos_count_*`).
 * @param cap    `band_max_positions_per_side` (0 = band off).
 * @param max    Scale (`OCC_RAMP_ONE` for the Q32 ramp).
 * @returns The ramp, `0..=max`.
 * @example
 * ```ts
 * occRampV22(256n, 256n, 100n); // 100n (full side)
 * occRampV22(217n, 256n, 100n); // 0n (217 / 256 < 85%)
 * ```
 */
export declare function occRampV22(count: bigint, cap: bigint, max: bigint): bigint;
/**
 * `growth_v19::occ_ramp_q32`: `occRampV22(count, cap, 2^32)`.
 *
 * @param count  Stored positions on the side.
 * @param cap    `band_max_positions_per_side`.
 * @returns Q32 ramp (`2^32` = a full side).
 * @example
 * ```ts
 * occRampQ32V22(256n, 256n); // 4294967296n
 * ```
 */
export declare function occRampQ32V22(count: bigint, cap: bigint): bigint;
/**
 * `growth_v19::occ_full_num`: `F_full * 1e9` = `rent_max * 4 * band_min_leg_notional` (saturating u128): atoms x 1e9 one leg pays
 * per slot at a full side.
 *
 * @param rentMaxE9PerSlot     `rent_max_e9_per_slot`.
 * @param bandMinLegNotional   `band_min_leg_notional` (collateral atoms).
 * @returns `F_full * 1e9`.
 * @example
 * ```ts
 * occFullNumV22(100n, 10_000_000n); // 4_000_000_000n = 4 atoms per slot at a full side
 * ```
 */
export declare function occFullNumV22(rentMaxE9PerSlot: bigint, bandMinLegNotional: bigint): bigint;
/**
 * `growth_v19::occ_clock_advance`: `C + min(ramp, 2^32) * dt` (Q32.32 full-occupancy slots), saturating at u64::MAX.
 *
 * @param cQ32     Side clock.
 * @param rampQ32  Side ramp ({@link occRampQ32V22}).
 * @param dt       Slots.
 * @returns The advanced clock.
 * @example
 * ```ts
 * occClockAdvanceV22(0n, 1n << 32n, 10n); // 10n << 32n
 * ```
 */
export declare function occClockAdvanceV22(cQ32: bigint, rampQ32: bigint, dt: bigint): bigint;
/**
 * `growth_v19::occ_ck_encode`: the checkpoint word `TAG | (cInt & u32::MAX) << 1 | short`.
 *
 * @param cInt   Clock integer part (`C >> 32`).
 * @param short  Leg side.
 * @returns The `last_fee_slot` word.
 * @example
 * ```ts
 * occCkEncodeV22(5n, true); // (1n << 63n) | 11n
 * ```
 */
export declare function occCkEncodeV22(cInt: bigint, short: boolean): bigint;
/**
 * `growth_v19::occ_ck_decode`: the clock integer a checkpoint holds when it is a checkpoint of THIS side not ahead of the clock.
 *
 * @param ck        `last_fee_slot`.
 * @param short     Leg side.
 * @param cIntNow   Current clock integer part.
 * @returns The clock integer, or `null` (untagged, other side, or ahead).
 * @example
 * ```ts
 * occCkDecodeV22(occCkEncodeV22(5n, false), false, 9n); // 5n
 * ```
 */
export declare function occCkDecodeV22(ck: bigint, short: boolean, cIntNow: bigint): bigint | null;
/**
 * `growth_v19::occ_charge_step`: one charge of a leg, `{ checkpoint, due }`. A word that is not this leg's checkpoint
 * re-anchors at the clock and charges 0; otherwise `due = floor(fullNum * (C_now - C_ck) / 1e9)` (a zero due keeps the
 * old checkpoint so the fraction carries).
 *
 * @param ck        `last_fee_slot`.
 * @param short     Leg side.
 * @param cQ32Now   The side clock now (Q32.32).
 * @param fullNum   {@link occFullNumV22}.
 * @returns New checkpoint and atoms due (before the engine's capital clamp).
 * @example
 * ```ts
 * occChargeStepV22(occCkEncodeV22(0n, false), false, 10n << 32n, 4_000_000_000n); // { checkpoint: occCkEncodeV22(10n, false), due: 40n }
 * ```
 */
export declare function occChargeStepV22(ck: bigint, short: boolean, cQ32Now: bigint, fullNum: bigint): {
    checkpoint: bigint;
    due: bigint;
};
/**
 * Read a portfolio's `last_fee_slot` as a prog#572 occupancy checkpoint. On band markets, while Live, the word is
 * `TAG(bit 63) | clockInt << 1 | short` once the account holds a leg; anywhere else it is a real slot (or 0) and this
 * returns `null`. A tagged value is NOT a slot: never compare it with a clock slot.
 *
 * @param lastFeeSlot  The portfolio's `last_fee_slot` (`PortfolioV17.lastFeeSlot`).
 * @returns `{ short, clockInt }`, or `null` for an untagged word.
 * @example
 * ```ts
 * decodeOccupancyCheckpointV22(pf.lastFeeSlot); // { short: false, clockInt: 12n } on a band market leg
 * ```
 */
export declare function decodeOccupancyCheckpointV22(lastFeeSlot: bigint): {
    short: boolean;
    clockInt: bigint;
} | null;
/** A band market's per-side occupancy clocks (asset-0 profile +408..+432). */
export interface OccupancyClocksV22 {
    /** Slot of the last accrual (`maintenance_fee_checkpoint_slot` bytes). 0 = never accrued. */
    lastSlot: bigint;
    /** `C_long`, Q32.32 full-occupancy slots (low 8 B of `maintenance_fee_previous_rate`). */
    longQ32: bigint;
    /** `C_short` (high 8 B). */
    shortQ32: bigint;
}
/**
 * Reinterpret an asset-0 oracle profile's GH#444 fields on a band market: there `maintenanceFeeCheckpointSlot` is the
 * occupancy clocks' last slot and `maintenanceFeePreviousRate` packs `C_long | C_short << 64`. Only meaningful when the
 * market's `band_bps != 0` (a band market's maintenance fee is always 0, so the bytes are never a fee checkpoint there).
 *
 * @param p  `{ maintenanceFeeCheckpointSlot, maintenanceFeePreviousRate }` from `parseAssetOracleProfileV17` (asset 0).
 * @returns The clocks.
 * @example
 * ```ts
 * if (cfg.bandBps !== 0) occupancyClocksFromProfileV22(parseAssetOracleProfileV17(data, off));
 * ```
 */
export declare function occupancyClocksFromProfileV22(p: {
    maintenanceFeeCheckpointSlot: bigint;
    maintenanceFeePreviousRate: bigint;
}): OccupancyClocksV22;
/** Inputs of the occupancy clock / charge mirror. */
export interface OccupancyParamsV22 {
    /** `band_max_positions_per_side` (0 when the band is off). */
    cap: bigint;
    /** {@link occFullNumV22} of the config. */
    fullNum: bigint;
    /** A vault LP is bound on asset 0 (the charge's destination; without one the clocks are frozen). */
    lpBound: boolean;
    /** `stored_pos_count_long` / `_short` (the counts in force since `lastSlot`). */
    countLong: bigint;
    countShort: bigint;
}
/**
 * Mirror of `occ_clock_accrue_view`: the clocks brought to `nowSlot` with the counts as they stand. Only the slot moves
 * when rent is off, no vault LP is bound, or the clocks were never stamped (`lastSlot == 0`); nothing moves when
 * `nowSlot <= lastSlot`. (The program accrues only on a Live band market.)
 *
 * @param clocks   Stored clocks.
 * @param p        Params.
 * @param nowSlot  Slot of the touch.
 * @returns The clocks the next touch would write.
 * @example
 * ```ts
 * occupancyClocksAtV22(clocks, params, currentSlot);
 * ```
 */
export declare function occupancyClocksAtV22(clocks: OccupancyClocksV22, p: OccupancyParamsV22, nowSlot: bigint): OccupancyClocksV22;
/**
 * Mirror of `occ_charge_view` for one portfolio: what the next touch at `nowSlot` would request (atoms, before the engine
 * takes `min(due, capital)`, and 0 while the account's PnL is negative) and the checkpoint it would leave. The vault LP
 * never pays (`isVaultLp`), nor does anything while rent is off / no LP is bound (both re-anchor). A flat portfolio drops
 * a tagged checkpoint.
 *
 * @param lastFeeSlot  The portfolio's `last_fee_slot`.
 * @param side         The leg's side on asset 0, `null` when flat.
 * @param clocks       Stored clocks ({@link decodeOccupancyStateV22}).
 * @param p            Params.
 * @param nowSlot      Slot of the touch.
 * @param isVaultLp    The portfolio is the bound vault LP.
 * @returns `{ checkpoint, due }`.
 * @example
 * ```ts
 * const { due } = occupancyDueV22(pf.lastFeeSlot, "long", occ.clocks, occ.params, slot);
 * ```
 */
export declare function occupancyDueV22(lastFeeSlot: bigint, side: "long" | "short" | null, clocks: OccupancyClocksV22, p: OccupancyParamsV22, nowSlot: bigint, isVaultLp?: boolean): {
    checkpoint: bigint;
    due: bigint;
};
/**
 * The occupancy QUOTE per side: what one leg pays per slot right now, `ramp_q32(count, cap) * fullNum / 2^32` in atoms x 1e9
 * (divide by 1e9 for atoms). Every leg on a side pays the same, whatever its notional. 0 on a side at or below 85% of the
 * cap, when rent is off, or with no bound vault LP.
 *
 * @param p  Params.
 * @returns `{ long, short }` atoms x 1e9 per slot per leg (floored), `rampQ32Long/Short`, and `fullE9` (the full-side figure).
 * @example
 * ```ts
 * const q = occupancyRatesV22(occ.params); const atomsPerDay = (q.long * BigInt(SLOTS_PER_DAY_V22)) / 1_000_000_000n;
 * ```
 */
export declare function occupancyRatesV22(p: OccupancyParamsV22): {
    long: bigint;
    short: bigint;
    rampQ32Long: bigint;
    rampQ32Short: bigint;
    fullE9: bigint;
};
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
/**
 * `rent_rates_view`: per-side UTILISATION rent rates, e9 of notional per slot (0 without a rent ceiling, a bound vault or a
 * measured `N_cap`). Since prog#572 a band market's legs also pay a flat per-slot occupancy charge past 85% of the side cap:
 * see {@link occupancyRatesFromStateV22} (not included here, as in the program).
 */
export declare function rentRatesFromStateV22(cfg: BandConfigV22, asset: AssetBandStateV22, rent: AssetRentStateV22): {
    long: bigint;
    short: bigint;
};
/** prog#572 occupancy state of a band market (asset 0). */
export interface OccupancyStateV22 {
    /** Band on, market Live, rent on, vault LP bound: legs past the knee are being charged. */
    enabled: boolean;
    /** `group.mode == 0` (the program accrues / charges only while Live). */
    live: boolean;
    params: OccupancyParamsV22;
    clocks: OccupancyClocksV22;
    /** The bound vault LP portfolio (32 bytes; all zero when none). It never pays. */
    vaultLpPortfolio: Uint8Array;
    /** `slot_last` of asset 0 (the program skips a charge while it is 0). */
    assetSlotLast: bigint;
}
/**
 * Decode a band market's occupancy state: the side counts, the clocks in asset 0's profile (+408..+432), the vault LP
 * binding and the `F_full` numerator. Returns `null` on a market without a band (`band_bps == 0`): there the profile
 * bytes are GH#444's maintenance-fee checkpoint, not clocks.
 *
 * @param data  Raw market account bytes.
 * @returns The state, or `null` on a non-band market.
 * @throws {@link UnknownLayoutError} for unknown / v2.1 layouts.
 * @example
 * ```ts
 * const occ = decodeOccupancyStateV22(info.data); if (occ?.enabled) occupancyRatesV22(occ.params);
 * ```
 */
export declare function decodeOccupancyStateV22(data: Uint8Array): OccupancyStateV22 | null;
/**
 * prog#572 occupancy QUOTE next to {@link rentRatesFromStateV22}: per side, the flat amount ONE leg pays per slot right now,
 * `ramp_q32(count, cap) * rent_max * 4 * band_min_leg_notional / 2^32`, in atoms x 1e9 per slot (floored). All zero when
 * the charge is off (not Live, rent off, no bound vault LP, at / below the knee); the vault LP itself never pays.
 *
 * @param occ  {@link decodeOccupancyStateV22} (`null` = no band: all zero).
 * @returns `{ long, short }` atoms x 1e9 per slot per leg, the Q32 ramps and `fullE9` (a full side's figure).
 * @example
 * ```ts
 * const q = occupancyRatesFromStateV22(decodeOccupancyStateV22(info.data));
 * const atomsPerDayLong = (q.long * BigInt(SLOTS_PER_DAY_V22)) / 1_000_000_000n;
 * ```
 */
export declare function occupancyRatesFromStateV22(occ: OccupancyStateV22 | null): ReturnType<typeof occupancyRatesV22>;
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
    /**
     * prog#572: the flat per-slot occupancy charge per leg (band markets past 85% of the side cap), atoms x 1e9 per slot,
     * on top of `rentRates` (per notional). `null` on a market without a band (asset 0 only: band markets are single-asset).
     */
    occupancy: (ReturnType<typeof occupancyRatesV22> & {
        enabled: boolean;
        cap: bigint;
        countLong: bigint;
        countShort: bigint;
    }) | null;
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
