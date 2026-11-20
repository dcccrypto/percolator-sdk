/**
 * ONE lot conversion for every consumer (app, keeper, indexer). A v2.2 market's base unit is a LOT of `10^lot_exp`
 * tokens: every mark and `initial_price` is PER LOT and every position `q` is IN LOTS (`POS_SCALE` per lot). The engine,
 * matcher and wrapper convert nothing.
 *
 *   price per token  = mark_e6 / 1e6 / 10^lotExp
 *   size in tokens   = q / POS_SCALE * 10^lotExp
 *   size in lots (q) = trunc(tokens / 10^lotExp)        (the remainder is reported, NEVER rounded up into the size)
 *
 * No function here rounds a size UP: sizes truncate toward zero. (An earlier app helper accepted "within 2 Q of the
 * next lot" as that lot; that rounds a size up and is deliberately not part of the SDK. Quantise first, then show the
 * remainder.)
 *
 * @module v22-lot
 */
import { resolveMarketGeometry } from "./layout.js";
import { LOT_EXP_MAX_V22 } from "./v22-wire.js";
import { MAX_ORACLE_PRICE_V22 } from "./v22-math.js";

/** Engine position scale: Q units per lot (per token when `lotExp` is 0). */
export const POS_SCALE_V22 = 1_000_000n;

function assertLotExp(lotExp: number): void {
  if (!Number.isInteger(lotExp) || lotExp < 0 || lotExp > LOT_EXP_MAX_V22) throw new Error(`lotExp must be 0..=${LOT_EXP_MAX_V22}, got ${lotExp}`);
}
const pow10 = (k: number): bigint => 10n ** BigInt(k);

/**
 * Read a market's lot exponent (profile byte +19 of the asset's wrapper slot). 0 on a v2.1 market (the byte is zero
 * there) and on a market without lots.
 *
 * @param data        Raw market account bytes.
 * @param assetIndex  Asset slot (default 0).
 * @returns `lot_exp` 0..=15.
 * @throws {@link UnknownLayoutError} for an unknown VERSION / a malformed account; `RangeError` for a missing slot or a byte above 15.
 * @example
 * ```ts
 * const lotExp = lotExpOfMarketV22(info.data);
 * ```
 */
export function lotExpOfMarketV22(data: Uint8Array, assetIndex = 0): number {
  const g = resolveMarketGeometry(data, { parser: "lotExpOfMarketV22", strictLength: false });
  if (!Number.isInteger(assetIndex) || assetIndex < 0 || assetIndex >= g.slotCount) throw new RangeError(`asset ${assetIndex} is not present`);
  const v = data[g.slotOff(assetIndex) + g.layout.wrapperSlot.profileLotExp];
  if (v > LOT_EXP_MAX_V22) throw new RangeError(`lot_exp byte ${v} is above ${LOT_EXP_MAX_V22}`);
  return v;
}

/**
 * Per-lot e6 price to the per-TOKEN e6 price (integer, rounded DOWN). `lotExp` 0 returns the input.
 *
 * @param perLotE6  Per-lot price, e6.
 * @param lotExp    Market `lot_exp`.
 * @returns Per-token price, e6.
 * @example
 * ```ts
 * lotPriceToTokenE6V22(40_000_000n, 5); // 400n
 * ```
 */
export function lotPriceToTokenE6V22(perLotE6: bigint, lotExp: number): bigint {
  assertLotExp(lotExp);
  return perLotE6 / pow10(lotExp);
}

/**
 * Per-token e6 price to the per-lot e6 price (exact).
 *
 * @param perTokenE6  Per-token price, e6.
 * @param lotExp      Market `lot_exp`.
 * @returns Per-lot price, e6.
 * @example
 * ```ts
 * tokenPriceToLotE6V22(400n, 5); // 40_000_000n
 * ```
 */
export function tokenPriceToLotE6V22(perTokenE6: bigint, lotExp: number): bigint {
  assertLotExp(lotExp);
  return perTokenE6 * pow10(lotExp);
}

/**
 * Engine Q (in lots, signed or not) to token-scaled Q (`POS_SCALE` per TOKEN): `q * 10^lotExp`. Exact.
 *
 * @param q        Engine Q in lots.
 * @param lotExp   Market `lot_exp`.
 * @returns Q per token.
 * @example
 * ```ts
 * qToTokenQV22(3_000_000n, 2); // 300_000_000n
 * ```
 */
export function qToTokenQV22(q: bigint, lotExp: number): bigint {
  assertLotExp(lotExp);
  return q * pow10(lotExp);
}

/**
 * A size typed in tokens (Q per token, `POS_SCALE` = 1e6) to engine Q in lots, truncating TOWARD ZERO. The remainder
 * (same sign) is what cannot be expressed in lots: show it, never send it.
 *
 * @param tokenQ  Size in token-scaled Q.
 * @param lotExp  Market `lot_exp`.
 * @returns `{ q, remainderTokenQ }` with `|q * 10^lotExp| <= |tokenQ|` always.
 * @example
 * ```ts
 * tokenQToQV22(1_234_567n, 3); // { q: 1_234n, remainderTokenQ: 567n }
 * ```
 */
export function tokenQToQV22(tokenQ: bigint, lotExp: number): { q: bigint; remainderTokenQ: bigint } {
  assertLotExp(lotExp);
  const f = pow10(lotExp);
  return { q: tokenQ / f, remainderTokenQ: tokenQ % f };
}

/**
 * Quantise an engine Q to WHOLE lots, truncating toward zero (`POS_SCALE` Q per lot). No tolerance: a size one Q short
 * of a lot is NOT a lot.
 *
 * @param q  Engine Q.
 * @returns `{ q, remainderQ }` with `|q| <= |input|`.
 * @example
 * ```ts
 * quantizeQToLotsV22(2_999_999n); // { q: 2_000_000n, remainderQ: 999_999n }
 * ```
 */
export function quantizeQToLotsV22(q: bigint): { q: bigint; remainderQ: bigint } {
  const whole = (q / POS_SCALE_V22) * POS_SCALE_V22;
  return { q: whole, remainderQ: q - whole };
}

/**
 * Lots to tokens (exact): `lots * 10^lotExp`.
 *
 * @param lots    Whole lots.
 * @param lotExp  Market `lot_exp`.
 * @returns Whole tokens.
 * @example
 * ```ts
 * lotsToTokensV22(7n, 3); // 7000n
 * ```
 */
export function lotsToTokensV22(lots: bigint, lotExp: number): bigint {
  assertLotExp(lotExp);
  return lots * pow10(lotExp);
}

/**
 * Read `lot_exp` from an asset oracle profile block (profile byte +19, `_padding0[0]`).
 *
 * @param data        Bytes containing the profile.
 * @param profileOff  Offset where the AssetOracleProfileV16 starts.
 * @returns `lot_exp` 0..=15.
 * @throws `RangeError` if the block is short or the byte is above 15.
 * @example
 * ```ts
 * lotExpOfProfileV22(slab, profileOff);
 * ```
 */
export function lotExpOfProfileV22(data: Uint8Array, profileOff: number): number {
  const at = profileOff + 19;
  if (at >= data.length) throw new RangeError("profile block is too short to hold lot_exp");
  const v = data[at];
  if (v > LOT_EXP_MAX_V22) throw new RangeError(`lot_exp byte ${v} is above ${LOT_EXP_MAX_V22}`);
  return v;
}

/**
 * Convert a Pyth-style `price * 10^expo` quote into the engine per-lot e6 price: `floor(price * 10^(expo + 6 + lotExp))`.
 * Mirrors the single-leg path of prog #711: read at E12 (truncating, so feeds finer than expo -12 lose digits), then `* 10^lotExp` floored once to E6.
 * 0 means the program would refuse it (OracleInvalid): the leg is outside the program's E12 range
 * ({@link pythLegE12V22}: `|expo| > 18`, E12 value 0, or above `MAX_ORACLE_PRICE`), or the per-lot price is 0 or above
 * `MAX_ORACLE_PRICE` ({@link composeOraclePriceE6V22}). At lot 0 a price below 1e-6 is unreadable; use a market with a
 * larger `lotExp`. No `invert` / `unit_scale` here: use {@link composeOraclePriceE6V22} for those markets.
 *
 * @param price   Pyth integer price (> 0).
 * @param expo    Pyth exponent (usually negative).
 * @param lotExp  Market `lot_exp`.
 * @returns Per-lot e6 price (floored), possibly 0.
 * @example
 * ```ts
 * pythPriceToLotE6V22(3_000n, -10, 6); // 300_000n  ($3e-7 per token)
 * pythPriceToLotE6V22(3_000n, -10, 0); // 0n
 * ```
 */
export function pythPriceToLotE6V22(price: bigint, expo: number, lotExp: number): bigint {
  assertLotExp(lotExp);
  if (price <= 0n) throw new Error("price must be > 0");
  // Program order: the leg is read at E12 (truncating feeds finer than 1e-12), then * 10^lot / 1e6 floors once.
  const e12 = pythLegE12V22(price, expo);
  return e12 === null ? 0n : (composeOraclePriceE6V22([e12], 0, 0, 0, lotExp) ?? 0n);
}

/** Program `MAX_EXPO_ABS` (percolator-prog rc23 `src/v16_program.rs:12440`): a Pyth exponent or Chainlink decimals above 18 is refused. */
export const MAX_ORACLE_EXPO_ABS_V22 = 18;
/** E12 units per E6 unit (program `LEG_E12_PER_E6`). */
const LEG_E12_PER_E6 = 1_000_000n;
const E12 = 1_000_000_000_000n;
const U128_MAX = (1n << 128n) - 1n;
const U256_MAX = (1n << 256n) - 1n;
/** Program `ORACLE_LEG_CAP` and the multi-leg divide flags (`v16_program.rs:819-831`). */
const ORACLE_LEG_CAP = 3;
const FLAG_DIV2 = 1;
const FLAG_DIV3 = 2;
const FLAGS_MASK = FLAG_DIV2 | FLAG_DIV3;

/**
 * Program `leg_e12_in_range` (`v16_program.rs:12550-12552`): an oracle leg at E12 is usable only when it is non-zero and its
 * E6 floor is at most `MAX_ORACLE_PRICE`.
 *
 * @param e12  Leg price at E12.
 * @returns `true` when the program accepts the leg.
 * @example
 * ```ts
 * legE12InRangeV22(150_000_000_000_000n); // true ($150)
 * ```
 */
export function legE12InRangeV22(e12: bigint): boolean {
  return e12 !== 0n && e12 / LEG_E12_PER_E6 <= MAX_ORACLE_PRICE_V22;
}

/**
 * Pyth `price * 10^expo` to the program's E12 leg value, like `read_pyth_price_e12` (`v16_program.rs:12606-12627`):
 * `|expo| <= 18`, price > 0, scaled to E12 (truncating below 1e-12), then {@link legE12InRangeV22}.
 *
 * @param price  Pyth integer price.
 * @param expo   Pyth exponent.
 * @returns The E12 leg, or `null` when the program would refuse it (OracleInvalid / overflow).
 * @example
 * ```ts
 * pythLegE12V22(15_000_000_000n, -8); // 150_000_000_000_000n
 * pythLegE12V22(1n, -19);             // null (|expo| > 18)
 * ```
 */
export function pythLegE12V22(price: bigint, expo: number): bigint | null {
  if (price <= 0n || !Number.isInteger(expo) || expo < -MAX_ORACLE_EXPO_ABS_V22 || expo > MAX_ORACLE_EXPO_ABS_V22) return null;
  const scale = expo + 12;
  const out = scale >= 0 ? price * pow10(scale) : price / pow10(-scale);
  if (out > U128_MAX) return null;
  return legE12InRangeV22(out) ? out : null;
}

/**
 * Compose 1 to 3 E12 oracle legs into the engine per-lot e6 price, like the program's `compose_price_e12_to_e6`
 * (`v16_program.rs:12882-12945`). Everything is rounded ONCE at the end:
 * legs multiply (or divide, per `flags`: bit 0 = leg 2 divides, bit 1 = leg 3 divides), `invert` swaps to `1e24 * d / n`,
 * then `* 10^lotExp / (1e6 * max(unitScale, 1))`, floored.
 *
 * @param legsE12    Leg prices at E12 (each must pass {@link legE12InRangeV22}).
 * @param flags      Multi-leg divide flags (0 for a single leg).
 * @param invert     Profile `invert` (0 or 1).
 * @param unitScale  Profile `unit_scale` (0 and 1 both mean "no scaling").
 * @param lotExp     Market `lot_exp`.
 * @returns Per-lot e6 price, or `null` when the program would refuse it (a leg out of range, overflow, or a result of
 *   0 or above `MAX_ORACLE_PRICE`: OracleInvalid / EngineArithmeticOverflow).
 * @throws `Error` for a config the program refuses as EngineInvalidConfig (0 or more than 3 legs, `invert > 1`, bad flags,
 *   `lotExp` above 15).
 * @example
 * ```ts
 * composeOraclePriceE6V22([150_000_000_000_000n], 0, 1, 0, 0);    // 6_666n   (1 / $150)
 * composeOraclePriceE6V22([150_000_000_000_000n], 0, 0, 1000, 0); // 150_000n ($150 / 1000)
 * ```
 */
export function composeOraclePriceE6V22(legsE12: readonly bigint[], flags: number, invert: number, unitScale: number, lotExp: number): bigint | null {
  const n = legsE12.length;
  if (
    n === 0 || n > ORACLE_LEG_CAP ||
    !Number.isInteger(flags) || (flags & ~FLAGS_MASK) !== 0 || (n === 1 && flags !== 0) || (n === 2 && (flags & FLAG_DIV3) !== 0) ||
    (invert !== 0 && invert !== 1) ||
    !Number.isInteger(unitScale) || unitScale < 0 || unitScale > 0xffff_ffff
  ) {
    throw new Error(`invalid oracle compose config (legs=${n}, flags=${flags}, invert=${invert}, unitScale=${unitScale})`);
  }
  assertLotExp(lotExp);
  if (legsE12.some((p) => !legE12InRangeV22(p))) return null;
  let num = legsE12[0];
  let den = 1n;
  for (let i = 1; i < n; i++) {
    const divides = i === 1 ? (flags & FLAG_DIV2) !== 0 : (flags & FLAG_DIV3) !== 0;
    if (divides) {
      num *= E12;
      den *= legsE12[i];
    } else {
      num *= legsE12[i];
      den *= E12;
    }
    if (num > U256_MAX || den > U256_MAX) return null;
  }
  if (invert === 1) {
    const inv = den * E12 * E12;
    if (inv > U256_MAX) return null;
    den = num;
    num = inv;
  }
  num *= pow10(lotExp);
  den *= LEG_E12_PER_E6 * BigInt(Math.max(unitScale, 1));
  if (num > U256_MAX || den > U256_MAX) return null;
  const p = num / den;
  return p !== 0n && p <= MAX_ORACLE_PRICE_V22 ? p : null;
}
