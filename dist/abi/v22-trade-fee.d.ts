/** Offset of `max_trading_fee_bps` (u64) inside the engine `V16ConfigAccount` (engine 3ce4cbd1, packed Pod). */
export declare const ENGINE_CONFIG_MAX_TRADING_FEE_BPS_OFF = 70;
/** Offset of `max_total_bps` (u32) inside the matcher context's vAMM block (percolator-match `MatcherCtx`). */
export declare const MATCHER_CTX_MAX_TOTAL_BPS_OFF = 56;
/** The matcher clips its total spread at min(max_total_bps, 9000) (`quote_adaptive`). */
export declare const MATCHER_MAX_TOTAL_BPS_CEILING = 9000;
/** Default safety margin (bps) added above base + matcher fee, still bounded by the market maximum. */
export declare const TRADE_FEE_MARGIN_BPS_DEFAULT = 5;
/** On-chain inputs for {@link computeTradeFeeBpsToSignV22}. */
export interface TradeFeeInputsV22 {
    /** Wrapper config `trade_fee_base_bps`. */
    tradeFeeBaseBps: bigint;
    /** Engine config `max_trading_fee_bps` (the program's maximum for any signed fee). */
    maxTradingFeeBps: bigint;
    /** Asset's P1 `max_requested_fee_bps` (0 = the matcher fee channel is off). */
    maxRequestedFeeBps: number;
    /** Asset's P1 `matcher_ext_mode` (the channel needs 1). Omitted = treated as 1. */
    matcherExtMode?: number;
    /** Matcher context `max_total_bps`, when known (tightens the worst-case request). */
    matcherMaxTotalBps?: number;
}
/** Options for {@link computeTradeFeeBpsToSignV22}. */
export interface TradeFeeOptionsV22 {
    /**
     * The matcher fee from a fresh quote (bps). When given, the signed fee is base + this + margin instead of
     * the worst case; a fill that requests more than that then fails with 9, so keep a margin.
     */
    expectedMatcherFeeBps?: number;
    /** Utilisation fee (bps) for an open above the kink (growth assets; see previewGrowthOpenFee). */
    utilFeeBps?: number;
    /** Margin above base + matcher fee (+ util). Default {@link TRADE_FEE_MARGIN_BPS_DEFAULT}. */
    marginBps?: number;
}
/** Result of {@link computeTradeFeeBpsToSignV22}. */
export interface TradeFeeToSignV22 {
    /** The `fee_bps` to sign: min(base + matcher fee + util + margin, maxFeeBps). */
    feeBps: bigint;
    /** Lowest admissible signature (the base fee); below it the program returns 9. */
    minFeeBps: bigint;
    /** The program's maximum (`max_trading_fee_bps`); above it the program returns 9. */
    maxFeeBps: bigint;
    /** Largest matcher fee the program can accept on this asset (0 when the channel is off). */
    matcherFeeWorstCaseBps: number;
    /** base + worst-case matcher fee + util: the fee that admits every fill the program can accept. */
    worstCaseFeeBps: bigint;
    /** True when `feeBps` covers `worstCaseFeeBps` (no fill can fail on the fee cap). */
    coversWorstCase: boolean;
}
/**
 * The largest matcher fee (bps) the wrapper can accept for this asset.
 *
 * @param i  Inputs (see {@link TradeFeeInputsV22}).
 * @returns 0 when the fee channel is off, else min(max_requested_fee_bps, matcher max_total_bps + 1, 1023).
 * @example
 * ```ts
 * matcherFeeWorstCaseBpsV22({ tradeFeeBaseBps: 30n, maxTradingFeeBps: 500n, maxRequestedFeeBps: 100, matcherMaxTotalBps: 60 }); // 61
 * ```
 */
export declare function matcherFeeWorstCaseBpsV22(i: TradeFeeInputsV22): number;
/**
 * Compute the max fee (`fee_bps`) to sign on a matcher trade so the program does not refuse it with
 * Custom(9): base fee + the matcher's fee (+ utilisation fee) + a margin, bounded by the market's
 * `max_trading_fee_bps`. Apps should use this instead of signing the base fee alone.
 *
 * @param i     On-chain inputs (read them with {@link readTradeFeeInputsV22}).
 * @param opts  Optional quote-based matcher fee, utilisation fee and margin.
 * @returns The fee to sign and its bounds.
 * @throws If the market's base fee exceeds its maximum (no signature can pass).
 * @example
 * ```ts
 * const inputs = readTradeFeeInputsV22(marketInfo.data, 0, matcherCtxInfo.data);
 * const { feeBps } = computeTradeFeeBpsToSignV22(inputs);
 * const data = encodeTradeCpi({ ...args, feeBps });
 * ```
 */
export declare function computeTradeFeeBpsToSignV22(i: TradeFeeInputsV22, opts?: TradeFeeOptionsV22): TradeFeeToSignV22;
/**
 * Read the inputs of {@link computeTradeFeeBpsToSignV22} from raw account data.
 *
 * @param marketData      Raw market (slab) account bytes.
 * @param assetIndex      Asset slot being traded.
 * @param matcherCtxData  Raw matcher context account bytes (optional; adds `matcherMaxTotalBps`).
 * @returns The inputs.
 * @throws On a non-market account, or a matcher context whose magic is not "PERCMATC".
 * @example
 * ```ts
 * const [m, ctx] = await connection.getMultipleAccountsInfo([market, matcherCtx]);
 * const inputs = readTradeFeeInputsV22(m!.data, 0, ctx?.data);
 * ```
 */
export declare function readTradeFeeInputsV22(marketData: Uint8Array, assetIndex: number, matcherCtxData?: Uint8Array): TradeFeeInputsV22;
