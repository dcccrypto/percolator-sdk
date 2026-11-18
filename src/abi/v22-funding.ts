/**
 * v2.2 FUNDING state decoder: per asset, the long / short funding indices (engine `k_*` and `f_*_num`), the funding rate
 * the wrapper would apply right now (premium + skew, clamped), and the market's `max_abs_funding_e9_per_slot`.
 *
 * SIGN CONVENTION (engine `kernel_funding_index_deltas`, percolator `src/v16.rs:2054-2073`, wrapper
 * `vault_lp_v18::skew_funding_rate_e9` doc, percolator-prog `src/vault_lp_v18.rs:239-246`):
 *
 *   - rate_e9 > 0  =>  LONGS PAY SHORTS. `f_long_num` moves DOWN (more negative), `f_short_num` moves UP, by equal
 *     magnitude when both sides have `a == ADL_ONE`. The long side's `k_*`/`f_*` is a cumulative PnL-per-unit index, so a
 *     falling long index is a loss for every long and a rising short index is a gain for every short.
 *   - rate_e9 < 0  =>  SHORTS PAY LONGS (`f_long_num` up, `f_short_num` down).
 *   - Premium part: mark above the index (effective price) gives a positive rate (longs pay); mark below gives negative.
 *   - Skew part: a SHORT vault LP (`lp_net_q < 0`, i.e. the crowd is net LONG) gives a positive rate: longs pay, and the
 *     vault LP (short) receives. A LONG vault LP gives a negative rate.
 *
 * UNITS: `rateE9PerSlot` is a fraction of notional per slot, scaled by 1e9 (`FUNDING_DEN`). `111` means 111e-9 of notional
 * per slot. Over a day (216,000 slots at 400 ms) that is {@link fundingRatePercentPerDayV22}. The index words are NOT
 * rates: they are cumulative sums `rate_e9 * dt * price_e6 * (a / FUNDING_DEN)` (with `a == ADL_ONE = 1e15` that is
 * `rate_e9 * dt * price_e6 * 1e6`); read two snapshots and use {@link impliedFundingRateE9V22} for the average rate between them.
 *
 * The rate is NOT stored on chain. The wrapper recomputes it on every crank / trade (`permissionless_funding_rate_e9_view`,
 * percolator-prog `v16_program.rs:43502`): `premium_funding_rate_e9(mark, index, max_abs) + vault-LP skew`, clamped to
 * `+-max_abs_funding_e9_per_slot` (`combine_funding_rate_e9`). It applies only while both sides have open interest
 * (`balanced_exposure`, engine `v16.rs:3029`). {@link decodeMarketFundingV22} ports that formula over the account bytes.
 *
 * Offsets (v2.2 / wrapper VERSION 19 only; pinned on a real devnet market in `test/v22-qa-overnight.test.ts`):
 *   - `V16ConfigAccount.max_abs_funding_e9_per_slot`: config + 126 (u64), `min_funding_lifetime_slots` +134, `max_accrual_dt_slots` +118
 *     (engine `v16.rs:8006-8020` field order; config starts at `marketGroupOff + group.config`).
 *   - `AssetStateV16Account` (engine slot start): `effective_price` +25, `fund_px_last` +33, `slot_last` +41, `a_long` +49,
 *     `a_short` +65, `k_long` +81, `k_short` +97, `f_long_num` +113, `f_short_num` +129, `kf_epoch_long` +145, `kf_epoch_short` +153,
 *     `oi_eff_long_q` +289, `oi_eff_short_q` +305 (engine `v16.rs:5377` field order; i128/u128 little endian).
 *   - `AssetOracleProfileV16` (wrapper slot start): `oracle_mode` +0, `mark_ewma_e6` +168, `funding_mark_e6` +432,
 *     `funding_mark_pending_e6` +440, `funding_mark_pending_slot` +448 (percolator-prog `v16_program.rs:2635-2743`).
 *   - `AssetVaultLpV18` (wrapper slot + 896): `lp_net_q` +32 (i128), `skew_slope_e9` +72, `skew_max_e9` +80, `flags` +90 (bit 0 bound).
 *
 * @module v22-funding
 */
import { resolveMarketGeometry, UnknownLayoutError } from "./layout.js";
import { SLOTS_PER_YEAR_V22 } from "./v22-wire.js";

/** Engine `FUNDING_DEN`: the divisor of every `*_e9` rate. */
export const FUNDING_DEN_V22 = 1_000_000_000n;
/** Engine `ADL_ONE`: the unscaled value of a side's `a` (`a_long` / `a_short`). */
export const ADL_ONE_V22 = 1_000_000_000_000_000n;
/** Slots per day at 400 ms slots. */
export const FUNDING_SLOTS_PER_DAY_V22 = SLOTS_PER_YEAR_V22 / 365n;

const OFF_CFG_MAX_ACCRUAL_DT = 118;
const OFF_CFG_MAX_ABS_FUNDING = 126;
const OFF_CFG_MIN_FUNDING_LIFETIME = 134;

const A_EFFECTIVE_PRICE = 25;
const A_FUND_PX_LAST = 33;
const A_SLOT_LAST = 41;
const A_A_LONG = 49;
const A_A_SHORT = 65;
const A_K_LONG = 81;
const A_K_SHORT = 97;
const A_F_LONG = 113;
const A_F_SHORT = 129;
const A_KF_EPOCH_LONG = 145;
const A_KF_EPOCH_SHORT = 153;
const A_OI_LONG = 289;
const A_OI_SHORT = 305;

const P_ORACLE_MODE = 0;
const P_MARK_EWMA = 168;
const P_FUNDING_MARK = 432;
const P_FUNDING_MARK_PENDING = 440;
const P_FUNDING_MARK_PENDING_SLOT = 448;

const V_LP_NET_Q = 32;
const V_SKEW_SLOPE = 72;
const V_SKEW_MAX = 80;
const V_FLAGS = 90;

/** `ORACLE_MODE_*` values that make the wrapper compute a funding rate (`profile_is_price_managed`): hybrid 1, EWMA mark 2, auth mark 3. */
const PRICE_MANAGED_MODES = new Set([1, 2, 3]);

const dv = (d: Uint8Array): DataView => new DataView(d.buffer, d.byteOffset, d.byteLength);
const u64 = (v: DataView, o: number): bigint => v.getBigUint64(o, true);
const u128 = (v: DataView, o: number): bigint => (v.getBigUint64(o + 8, true) << 64n) | v.getBigUint64(o, true);
const i128 = (v: DataView, o: number): bigint => (v.getBigInt64(o + 8, true) << 64n) + v.getBigUint64(o, true);

/** Who pays at the current rate. */
export type FundingPayerV22 = "longs" | "shorts" | "none";

/** One asset's funding state. */
export interface AssetFundingV22 {
  assetIndex: number;
  /** Cumulative mark-to-market index, long side (`k_long`). Equal and opposite to `kShort` while `a == ADL_ONE`. */
  kLong: bigint;
  /** Cumulative mark-to-market index, short side (`k_short`). */
  kShort: bigint;
  /** Cumulative funding index numerator, long side (`f_long_num`). FALLS when longs pay (rate > 0). */
  fLongNum: bigint;
  /** Cumulative funding index numerator, short side (`f_short_num`). RISES when longs pay (rate > 0). */
  fShortNum: bigint;
  /** Epoch of the K/F indices, long side (`kf_epoch_long`). Indices reset when it changes. */
  kfEpochLong: bigint;
  kfEpochShort: bigint;
  /** Side scale factors (`a_long`, `a_short`); {@link ADL_ONE_V22} until a side is shrunk by an ADL. */
  aLong: bigint;
  aShort: bigint;
  /** Last price the funding accrual used (`fund_px_last`, e6). */
  fundPxLast: bigint;
  /** The asset's committed mark (`effective_price`, e6): the premium's INDEX. */
  effectivePriceE6: bigint;
  /** Slot of the asset's last accrual (`slot_last`). */
  slotLast: bigint;
  oiEffLongQ: bigint;
  oiEffShortQ: bigint;
  /** Oracle mode byte (0 manual, 1 hybrid, 2 EWMA mark, 3 auth mark). Funding is computed only for 1 to 3. */
  oracleMode: number;
  /** The mark the premium compares with the index: `funding_mark_e6` (or `mark_ewma_e6` when the checkpoint is 0). */
  fundingMarkE6: bigint;
  /** True when a prospective mark is pending past `slotLast`: the wrapper then derives a counterfactual index, so `rateE9PerSlot` is approximate. */
  pendingMark: boolean;
  /** The vault LP is bound on this asset. */
  vaultLpBound: boolean;
  /** Vault LP signed position (engine Q). Negative = the crowd is net long. */
  lpNetQ: bigint;
  skewSlopeE9: bigint;
  skewMaxE9: bigint;
  /** Premium component, e9 per slot, signed (positive: mark above index, longs pay). */
  premiumRateE9PerSlot: bigint;
  /** Vault-LP skew component, e9 per slot, signed (positive: crowd net long, longs pay). */
  skewRateE9PerSlot: bigint;
  /** The rate the wrapper applies, e9 per slot, signed, clamped to `+-maxAbsFundingE9PerSlot`. Positive: longs pay shorts. */
  rateE9PerSlot: bigint;
  /** `"longs"` when the rate is positive, `"shorts"` when negative, `"none"` at zero. */
  payer: FundingPayerV22;
  /** True when both sides have open interest (the engine applies funding only then). */
  fundingActive: boolean;
}

/** The market's funding config plus every asset's state. */
export interface MarketFundingV22 {
  /** `max_abs_funding_e9_per_slot`: the bound on `|rate|`, e9 of notional per slot. 0 disables funding. */
  maxAbsFundingE9PerSlot: bigint;
  minFundingLifetimeSlots: bigint;
  maxAccrualDtSlots: bigint;
  assets: AssetFundingV22[];
}

/**
 * `policy_v16::premium_funding_rate_e9` (percolator-prog `v16_program.rs:11752`): signed, bounded premium of the mark over the index.
 *
 * @param markE6       Mark (`funding_mark_e6`).
 * @param indexE6      Index (`effective_price`).
 * @param maxAbsRateE9 `max_abs_funding_e9_per_slot`.
 * @returns Signed rate, e9 per slot. Positive when the mark is above the index (longs pay).
 * @example
 * ```ts
 * premiumFundingRateE9V22(110n, 100n, 200_000_000n); // 100_000_000n (10% premium, under the cap); a cap of 20_000_000n gives 20_000_000n
 * ```
 */
export function premiumFundingRateE9V22(markE6: bigint, indexE6: bigint, maxAbsRateE9: bigint): bigint {
  if (maxAbsRateE9 === 0n || markE6 === 0n || indexE6 === 0n || markE6 === indexE6) return 0n;
  const diff = markE6 > indexE6 ? markE6 - indexE6 : indexE6 - markE6;
  const premium = (diff * FUNDING_DEN_V22) / indexE6;
  const bounded = premium < maxAbsRateE9 ? premium : maxAbsRateE9;
  return markE6 > indexE6 ? bounded : -bounded;
}

/**
 * `vault_lp_v18::skew_funding_rate_e9` (percolator-prog `src/vault_lp_v18.rs:247`): the vault-LP skew component.
 * A SHORT vault LP (`lpNetQ < 0`, crowd net long) gives a positive rate (longs pay).
 *
 * @param lpNetQ    Vault LP signed position.
 * @param oiSideQ   `max(oi_eff_long_q, oi_eff_short_q)`.
 * @param slopeE9   `skew_slope_e9`.
 * @param maxE9     `skew_max_e9`.
 * @returns Signed rate, e9 per slot.
 * @example
 * ```ts
 * skewFundingRateE9V22(-500n, 1000n, 100n, 1000n); // 50n
 * ```
 */
export function skewFundingRateE9V22(lpNetQ: bigint, oiSideQ: bigint, slopeE9: bigint, maxE9: bigint): bigint {
  if (slopeE9 === 0n || maxE9 === 0n || lpNetQ === 0n || oiSideQ === 0n) return 0n;
  const abs = lpNetQ < 0n ? -lpNetQ : lpNetQ;
  const share = abs > oiSideQ ? oiSideQ : abs;
  const mag = (slopeE9 * share) / oiSideQ;
  const capped = mag > maxE9 ? maxE9 : mag;
  return lpNetQ < 0n ? capped : -capped;
}

/**
 * `vault_lp_v18::combine_funding_rate_e9`: premium + skew, clamped to `+-maxAbsE9`.
 *
 * @param premiumE9  Premium component.
 * @param skewE9     Skew component.
 * @param maxAbsE9   `max_abs_funding_e9_per_slot`.
 * @returns The applied rate, e9 per slot.
 * @example
 * ```ts
 * combineFundingRateE9V22(100n, 50n, 111n); // 111n
 * ```
 */
export function combineFundingRateE9V22(premiumE9: bigint, skewE9: bigint, maxAbsE9: bigint): bigint {
  const sum = premiumE9 + skewE9;
  if (sum > maxAbsE9) return maxAbsE9;
  if (sum < -maxAbsE9) return -maxAbsE9;
  return sum;
}

/**
 * Decode the funding state of every asset of a v2.2 market account.
 *
 * @param marketData  Raw market account bytes (wrapper VERSION 19).
 * @returns Config bound plus per-asset indices, rate components, applied rate and payer.
 * @throws {UnknownLayoutError} If the account is not a v2.2 (VERSION 19) market.
 * @example
 * ```ts
 * const f = decodeMarketFundingV22(info.data);
 * const sol = f.assets[0];
 * // sol.rateE9PerSlot > 0n  =>  longs pay shorts; sol.fLongNum falls and sol.fShortNum rises each accrual.
 * console.log(fundingRatePercentPerDayV22(sol.rateE9PerSlot), "% of notional per day, max", f.maxAbsFundingE9PerSlot);
 * ```
 */
export function decodeMarketFundingV22(marketData: Uint8Array): MarketFundingV22 {
  const g = resolveMarketGeometry(marketData, { parser: "decodeMarketFundingV22", strictLength: false });
  if (g.layout.version !== 19) {
    throw new UnknownLayoutError("UNKNOWN_VERSION", "decodeMarketFundingV22", `needs a v2.2 market (VERSION 19), got VERSION ${g.layout.version}`, { version: g.layout.version });
  }
  const v = dv(marketData);
  const cfg = g.groupOff + g.layout.group.config;
  const maxAbs = u64(v, cfg + OFF_CFG_MAX_ABS_FUNDING);
  const assets: AssetFundingV22[] = [];
  for (let i = 0; i < g.slotCount; i++) {
    const ws = g.slotOff(i);
    const es = g.engineOff(i);
    const wrapperProfile = ws + g.layout.wrapperSlot.oracleProfile;
    const vaultLp = ws + g.layout.wrapperSlot.vaultLp;
    const oracleMode = marketData[wrapperProfile + P_ORACLE_MODE]!;
    const effective = u64(v, es + A_EFFECTIVE_PRICE);
    const slotLast = u64(v, es + A_SLOT_LAST);
    const oiL = u128(v, es + A_OI_LONG);
    const oiS = u128(v, es + A_OI_SHORT);
    const mark = u64(v, wrapperProfile + P_FUNDING_MARK);
    const markEwma = u64(v, wrapperProfile + P_MARK_EWMA);
    const pendingE6 = u64(v, wrapperProfile + P_FUNDING_MARK_PENDING);
    const pendingSlot = u64(v, wrapperProfile + P_FUNDING_MARK_PENDING_SLOT);
    const activeMark = mark !== 0n ? mark : markEwma;
    const bound = (marketData[vaultLp + V_FLAGS]! & 1) === 1;
    const slope = u64(v, vaultLp + V_SKEW_SLOPE);
    const skewMax = u64(v, vaultLp + V_SKEW_MAX);
    const lpNetQ = i128(v, vaultLp + V_LP_NET_Q);
    const managed = PRICE_MANAGED_MODES.has(oracleMode);
    const premium = managed ? premiumFundingRateE9V22(activeMark, effective, maxAbs) : 0n;
    const skew = managed && maxAbs !== 0n && bound && slope !== 0n ? skewFundingRateE9V22(lpNetQ, oiL > oiS ? oiL : oiS, slope, skewMax) : 0n;
    const rate = managed && maxAbs !== 0n ? combineFundingRateE9V22(premium, skew, maxAbs) : 0n;
    assets.push({
      assetIndex: i,
      kLong: i128(v, es + A_K_LONG),
      kShort: i128(v, es + A_K_SHORT),
      fLongNum: i128(v, es + A_F_LONG),
      fShortNum: i128(v, es + A_F_SHORT),
      kfEpochLong: u64(v, es + A_KF_EPOCH_LONG),
      kfEpochShort: u64(v, es + A_KF_EPOCH_SHORT),
      aLong: u128(v, es + A_A_LONG),
      aShort: u128(v, es + A_A_SHORT),
      fundPxLast: u64(v, es + A_FUND_PX_LAST),
      effectivePriceE6: effective,
      slotLast,
      oiEffLongQ: oiL,
      oiEffShortQ: oiS,
      oracleMode,
      fundingMarkE6: activeMark,
      pendingMark: pendingE6 !== 0n && pendingSlot > slotLast,
      vaultLpBound: bound,
      lpNetQ,
      skewSlopeE9: slope,
      skewMaxE9: skewMax,
      premiumRateE9PerSlot: premium,
      skewRateE9PerSlot: skew,
      rateE9PerSlot: rate,
      payer: rate > 0n ? "longs" : rate < 0n ? "shorts" : "none",
      fundingActive: oiL !== 0n && oiS !== 0n,
    });
  }
  return {
    maxAbsFundingE9PerSlot: maxAbs,
    minFundingLifetimeSlots: u64(v, cfg + OFF_CFG_MIN_FUNDING_LIFETIME),
    maxAccrualDtSlots: u64(v, cfg + OFF_CFG_MAX_ACCRUAL_DT),
    assets,
  };
}

/**
 * A per-slot e9 funding rate as a percent of notional per day (400 ms slots). Positive: longs pay shorts.
 *
 * @param rateE9PerSlot  Signed rate, e9 per slot.
 * @returns Percent of notional per day, signed.
 * @example
 * ```ts
 * fundingRatePercentPerDayV22(111n); // 2.3976 (%/day)
 * ```
 */
export function fundingRatePercentPerDayV22(rateE9PerSlot: bigint): number {
  return (Number(rateE9PerSlot) / 1e9) * Number(FUNDING_SLOTS_PER_DAY_V22) * 100;
}

/**
 * Average funding rate that moved a side's `f_*_num` index between two snapshots of the SAME epoch, from the SHORT index
 * (positive delta means longs paid). Inverts `delta = rate_e9 * dt * price_e6 * (a / FUNDING_DEN)`; exact when the price was
 * constant over the interval and `a` is the side's scale, otherwise a price-weighted average (use the mean of `fund_px_last`).
 *
 * @param deltaFShortNum  `f_short_num(after) - f_short_num(before)`.
 * @param dtSlots         Slots between the snapshots (`slot_last` difference).
 * @param priceE6         Price used over the interval (e6).
 * @param aShort          `a_short` (default {@link ADL_ONE_V22}).
 * @returns Average signed rate in e9 per slot (positive: longs paid shorts). Rounds toward zero. 0 when `dtSlots` or `priceE6` is 0.
 * @example
 * ```ts
 * const r = impliedFundingRateE9V22(f1.fShortNum - f0.fShortNum, f1.slotLast - f0.slotLast, f1.effectivePriceE6);
 * ```
 */
export function impliedFundingRateE9V22(deltaFShortNum: bigint, dtSlots: bigint, priceE6: bigint, aShort: bigint = ADL_ONE_V22): bigint {
  if (dtSlots <= 0n || priceE6 <= 0n || aShort <= 0n) return 0n;
  return (deltaFShortNum * FUNDING_DEN_V22) / (dtSlots * priceE6 * aShort);
}
