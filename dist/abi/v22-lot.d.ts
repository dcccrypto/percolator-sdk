/** Engine position scale: Q units per lot (per token when `lotExp` is 0). */
export declare const POS_SCALE_V22 = 1000000n;
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
export declare function lotExpOfMarketV22(data: Uint8Array, assetIndex?: number): number;
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
export declare function lotPriceToTokenE6V22(perLotE6: bigint, lotExp: number): bigint;
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
export declare function tokenPriceToLotE6V22(perTokenE6: bigint, lotExp: number): bigint;
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
export declare function qToTokenQV22(q: bigint, lotExp: number): bigint;
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
export declare function tokenQToQV22(tokenQ: bigint, lotExp: number): {
    q: bigint;
    remainderTokenQ: bigint;
};
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
export declare function quantizeQToLotsV22(q: bigint): {
    q: bigint;
    remainderQ: bigint;
};
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
export declare function lotsToTokensV22(lots: bigint, lotExp: number): bigint;
