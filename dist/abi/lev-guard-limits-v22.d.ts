/**
 * v2.2 leverage guard (tag 124): the OPEN rules a client needs to quote what the program allows, ported bit-exact from
 * percolator-prog `feat/v22-rc23-2026-10-22` @ `02524b05`: `src/lev_guard_v22.rs` (pure rules) and `lev_trade_post` in
 * `src/v16_program.rs` (how a risk-increasing TradeCpi fill is judged). Refusals there are error 133 (`LevGuardRefused`, log
 * `lev_guard_refused <why>`), or 132 (`LevGuardRequired`) when the market needs a guard and none is appended / valid.
 *
 * Order of the program's checks after a fill that increases the taker's risk (taker != LP):
 *  1. guard required (growth flag bit 2, or a mainnet build on a clamp-enforced market) and missing / invalid -> 132;
 *  2. `age < 6 h` -> `age_under_6h`;
 *  3. a live W1 round and `|LP after| > |LP before|` -> `lp_stop_round`;
 *  4. the price band observes the target price (may start a freeze / m_oracle IN this transaction);
 *  5. leverage: `equity >= ceil(floor(|taker after|·P/1e6) · IMR / 1e4)`, `IMR = max(engine IMR, ceil(1e6 / L_eff))`,
 *     `L_eff = min(L_now, max(L_floor, min(L_trader, l_cap)·[3/4 m_oracle] ∧ [frozen L]))` -> `leverage`;
 *  6. size: `|LP after| > |LP before|` and `|LP after| > n_eff` -> `size`;
 *  7. short (taker after < 0): users' short notional `> longs·min(1, MMR/m) + β·C_m/m` -> `short_dump_cap`.
 * Each is a separate refusal, so the limit in force is the tightest of all of them.
 */
import type { LevAgeBandV22, LevGuardV22 } from "./lev-guard-v22.js";
import type { LevReportAgeV22 } from "./lev-guard-v22.js";
/** `growth_v19::GROWTH_FLAG_LEV_GUARD`: growth `flags` bit 2, set by tag 124 op 0 INIT. */
export declare const GROWTH_FLAG_LEV_GUARD_V22 = 4;
export declare const LEV_SLOTS_PER_HOUR = 9000n;
export declare const LEV_SLOTS_PER_DAY = 216000n;
export declare const LEV_J_DUMP_DEFAULT_DAY_BPS = 3500;
export declare const LEV_J_DUMP_DEFAULT_WEEK_BPS = 2000;
export declare const LEV_M_IND_DEFAULT_YOUNG_BPS = 5000;
export declare const LEV_J_DUMP_STALE_OLD_BPS = 1000;
export declare const LEV_M_IND_STALE_OLD_BPS = 2500;
export declare const LEV_HOLDER_PROOF_SLOTS = 216000n;
export declare const LEV_L_FLOOR_X100 = 200;
export declare const LEV_Z_NUM = 233n;
export declare const LEV_Z_DEN = 100n;
export declare const LEV_PHI_OPEN_BPS = 30n;
export declare const LEV_M_ORACLE_NUM = 3;
export declare const LEV_M_ORACLE_DEN = 4;
export declare const LEV_N_FLOOR_USD = 200n;
export declare const LEV_BETA_YOUNG_BPS = 1000;
export declare const LEV_BETA_BPS = 5000;
export declare const LEV_BURST_VAR_FLOOR_DIV = 4;
export declare const LEV_BURST_HALF_LIFE_SLOTS: bigint;
export declare const LEV_BREAKER_SAMPLE_BPS = 1000n;
export declare const LEV_BREAKER_HOUR_BPS = 3000n;
export declare const LEV_ABNORMAL_SIGMA_MULT = 4n;
export declare const LEV_FREEZE_SLOTS = 9000n;
export declare const LEV_M_ORACLE_SLOTS = 216000n;
/** `lev_profile_v22::VOL_PROFILE_LIVE` (false at 02524b05): the vol-profile open floor is wired but changes nothing. */
export declare const LEV_VOL_PROFILE_LIVE = false;
/** `Overlay`: `lCapX100` 0xFFFF = none. */
export interface LevOverlayV22 {
    jDumpBps: number;
    mIndBps: number;
    lCapX100: number;
    nMultBps: number;
}
/** `default_overlay(band, rep)`. */
export declare function levDefaultOverlayV22(band: LevAgeBandV22, rep: LevReportAgeV22): LevOverlayV22;
/** The guard fields {@link levMergeOverlayV22} reads. */
export type LevOverlayFieldsV22 = Pick<LevGuardV22, "repJDumpBps" | "repMIndBps" | "repLCapX100" | "repNMultBps" | "repSlot" | "holderDumpBps" | "holderDumpSlot" | "mintAuthLive" | "freezeAuthLive">;
/**
 * `merge_overlay(band, report, perm, now)`: tighten-only (j, m max; l_cap, n_mult min).
 *
 * @example
 * ```ts
 * levMergeOverlayV22("Week", guard, slot).jDumpBps; // >= 2000
 * ```
 */
export declare function levMergeOverlayV22(band: LevAgeBandV22, g: LevOverlayFieldsV22, nowSlot: bigint): LevOverlayV22;
/** `l_floor_x100`: `min(2x, L_eng)`. */
export declare const levLFloorX100V22: (lEngX100: number) => number;
/**
 * `l_trader_x100`: `floor(1e6 / (MMR + 30 + isqrt_ceil(ceil(σ·233/100)² + J²)))`, saturating at u16; σ `null` reads 0.
 *
 * @example
 * ```ts
 * levLTraderX100V22(500n, null, 3500); // 248 (2.48x: Day band, no vol data)
 * ```
 */
export declare function levLTraderX100V22(mmrBps: bigint, sigma1hBps: bigint | null, jumpBps: number): number;
/** `l_overlay_x100`: `min(existing, max(L_floor, min(L_trader, l_cap)·[3/4], [frozen]))`; never above `existing`. */
export declare function levLOverlayX100V22(existingX100: number, lTraderX100: number, lCapX100: number, mOracle: boolean, frozenX100: number | null, lEngX100: number): number;
/** `n_overlay_q`: 0 under 6 h, else `min(n_cap, max(n_cap·n_mult, min(n_cap, n_floor)), [frozen])`. */
export declare function levNOverlayQV22(nCapQ_: bigint, band: LevAgeBandV22, nMultBps: number, nFloorQ: bigint, frozenQ: bigint | null): bigint;
export declare const levBetaBpsV22: (band: LevAgeBandV22) => number;
export declare const levMTailBpsV22: (band: LevAgeBandV22) => number;
/** `m_dump_bps`: `max(m_ind_rug (100 % under 7 d), 1 %, m_tail)`. */
export declare function levMDumpBpsV22(band: LevAgeBandV22, mIndBps: number): number;
/** `short_users_cap_notional`: `long_users · min(1, MMR/m) + β·C_m/m` (collateral atoms, floors). */
export declare function levShortUsersCapNotionalV22(longUsersNotional: bigint, cM: bigint, mmrBps: bigint, band: LevAgeBandV22, mIndBps: number): bigint;
/** `burst_decay`: halved per whole 7-day half-life, linear inside it. */
export declare function levBurstDecayV22(peak: number, elapsed: bigint): number;
/** `burst_update`: a new high (>= the decayed peak) restarts the clock. */
export declare function levBurstUpdateV22(peak: number, peakSlot: bigint, varNow: number, nowSlot: bigint): [number, bigint];
/** `burst_var_eff`: `max(var_now, decayed_peak / 4)`. */
export declare function levBurstVarEffV22(peak: number, peakSlot: bigint, varNow: number, nowSlot: bigint): number;
/** `PriceBand` (the guard's `pb_*` fields). */
export interface LevPriceBandV22 {
    lastPx: bigint;
    lastSlot: bigint;
    refPx: bigint;
    refSlot: bigint;
    freezeUntil: bigint;
    oracleUntil: bigint;
}
export type LevTripV22 = "None" | "Freeze" | "Breaker";
export declare const levPriceBandOfV22: (g: Pick<LevGuardV22, "pbLastPx" | "pbLastSlot" | "pbRefPx" | "pbRefSlot" | "pbFreezeUntil" | "pbOracleUntil">) => LevPriceBandV22;
/** `move_bps`: `ceil(|a − b|·1e4 / b)`; `b == 0` = a full move. */
export declare function levMoveBpsV22(a: bigint, b: bigint): bigint;
/** `observe_price`: fold one mark sample; a trip extends the freeze (and m_oracle on a breaker). */
export declare function levObservePriceV22(b: LevPriceBandV22, px: bigint, nowSlot: bigint, sigma1hBps: bigint | null): {
    band: LevPriceBandV22;
    trip: LevTripV22;
};
export declare const levFrozenV22: (b: LevPriceBandV22, nowSlot: bigint) => boolean;
export declare const levMOracleOnV22: (b: LevPriceBandV22, nowSlot: bigint) => boolean;
/** The market numbers `lev_trade_post` reads (all from the market account + the bound LP). */
export interface LevGuardOpenInputV22 {
    /** The decoded guard, or `null` when the account is absent / undecodable / for another market or asset. */
    guard: LevGuardV22 | null;
    /** The program requires a guard on this asset: growth `flags & 0x04`, or a mainnet build on a clamp-enforced market. */
    guardRequired: boolean;
    nowSlot: bigint;
    /** `l_now`: the growth ceiling in force (x100), the same number the growth gate uses (with the rc23 caps). */
    lNowX100: number;
    /** `n_now`: G8 `N_cap` (Q) with the rc23 κ / λ caps. */
    nCapQ: bigint;
    /** Engine `effective_price` (the notional price). */
    priceE6: bigint;
    /** `lev_target_price`: the oracle target (raw target, else effective) the price band samples. */
    targetPriceE6: bigint;
    /** Growth record: `vol_has_data()` and `vol_var_x100()`. */
    volHasData: boolean;
    volVarX100: number;
    mmrBps: bigint;
    engineImrBps: bigint;
    /** Growth `l_tier_x100` (`L_eng` of the floor). */
    lTierX100: number;
    collateralDecimals: number;
    /** The bound LP's conservative equity `C_m` (atoms). */
    cM: bigint;
    oiEffLongQ: bigint;
    oiEffShortQ: bigint;
    /** The LP's effective signed position BEFORE the fill (Q). */
    lpEffQ: bigint;
    posScale?: bigint;
}
export type LevGuardBlockV22 = "guard-missing" | "age-under-6h";
/** What the guard allows for a risk-increasing open right now (`applies` false = no guard rules on this market). */
export interface LevGuardOpenLimitsV22 {
    applies: boolean;
    /** Every risk-increasing open is refused: 132 (guard missing) or 133 `age_under_6h`. */
    blocked: LevGuardBlockV22 | null;
    /** First slot opens are allowed when `blocked === "age-under-6h"` (`t0 + 54 000`). */
    opensAtSlot: bigint | null;
    band: LevAgeBandV22 | null;
    roundLive: boolean;
    overlay: LevOverlayV22 | null;
    /** `L_eff` x100 (after the in-transaction price-band sample). */
    lEffX100: number;
    /** The leverage check's IMR (bps). */
    imrBps: bigint | null;
    /** `n_eff` (Q). */
    nEffQ: bigint;
    /** The largest `|LP after|` a fill that grows the LP may reach: `|LP before|` during a W1 round, else `max(|LP before|, n_eff)`. */
    lpAbsMaxQ: bigint;
    /** A freeze / breaker is in force for this fill (incl. one the fill's own sample would start). */
    frozen: boolean;
    mOracle: boolean;
}
/**
 * The guard's open limits for the market right now (the taker-independent part of `lev_trade_post`).
 *
 * @example
 * ```ts
 * const lim = levGuardOpenLimitsV22({ guard, guardRequired: true, nowSlot, lNowX100: 500, nCapQ, ... });
 * if (lim.blocked === "age-under-6h") console.log(`opens at slot ${lim.opensAtSlot}`);
 * ```
 */
export declare function levGuardOpenLimitsV22(i: LevGuardOpenInputV22): LevGuardOpenLimitsV22;
/**
 * The guard's leverage check (`leverage_gate_ok`): `equity >= ceil(floor(|after|·P/1e6) · IMR / 1e4)`; an IMR above 100% fails.
 */
export declare function levGuardLeverageOkV22(lim: LevGuardOpenLimitsV22, takerEquity: bigint, takerAfterAbsQ: bigint, priceE6: bigint, posScale?: bigint): boolean;
/** The largest `|taker after|` (Q) the leverage check admits at `takerEquity` (atoms). */
export declare function levGuardMaxPositionQV22(lim: LevGuardOpenLimitsV22, takerEquity: bigint, priceE6: bigint, posScale?: bigint): bigint | null;
/** The short-cap check for a fill that leaves the taker short (`short_dump_cap`); true when it passes or does not apply. */
export declare function levGuardShortCapOkV22(lim: LevGuardOpenLimitsV22, i: LevGuardOpenInputV22, takerEffQ: bigint, signedFill: bigint): boolean;
/**
 * The largest fill (Q, unsigned) in `direction` the guard's SIZE rule (LP net, W1 round) and SHORT cap admit, for a taker at
 * `takerEffQ`. Leverage is separate ({@link levGuardMaxPositionQV22}): it depends on the taker's equity. `null` = no guard rules.
 */
export declare function levGuardMaxFillQV22(lim: LevGuardOpenLimitsV22, i: LevGuardOpenInputV22, direction: "long" | "short", takerEffQ: bigint): bigint | null;
export type LevGuardRefusalV22 = "guard_required" | "age_under_6h" | "lp_stop_round" | "leverage" | "size" | "short_dump_cap";
/**
 * Mirror of `lev_trade_post` for one fill: which check refuses it (in the program's order), or `null` when it passes / the fill does
 * not increase the taker's risk (closes are never checked).
 */
export declare function levGuardRefusalV22(lim: LevGuardOpenLimitsV22, i: LevGuardOpenInputV22, takerEffQ: bigint, signedFill: bigint, takerEquityAfter: bigint): LevGuardRefusalV22 | null;
