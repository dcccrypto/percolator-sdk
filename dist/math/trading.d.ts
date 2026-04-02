/**
 * Coin-margined perpetual trade math utilities.
 *
 * On-chain PnL formula:
 *   mark_pnl = (oracle - entry) * abs_pos / oracle   (longs)
 *   mark_pnl = (entry - oracle) * abs_pos / oracle   (shorts)
 *
 * All prices are in e6 format (1 USD = 1_000_000).
 * All token amounts are in native units (e.g. lamports).
 */
/**
 * Compute mark-to-market PnL for an open position.
 */
export declare function computeMarkPnl(positionSize: bigint, entryPrice: bigint, oraclePrice: bigint): bigint;
/**
 * Compute liquidation price given entry, capital, position and maintenance margin.
 * Uses pure BigInt arithmetic for precision (no Number() truncation).
 */
export declare function computeLiqPrice(entryPrice: bigint, capital: bigint, positionSize: bigint, maintenanceMarginBps: bigint): bigint;
/**
 * Compute estimated liquidation price BEFORE opening a trade.
 * Accounts for trading fees reducing effective capital.
 */
export declare function computePreTradeLiqPrice(oracleE6: bigint, margin: bigint, posSize: bigint, maintBps: bigint, feeBps: bigint, direction: "long" | "short"): bigint;
/**
 * Compute trading fee from notional value and fee rate in bps.
 */
export declare function computeTradingFee(notional: bigint, tradingFeeBps: bigint): bigint;
/**
 * Dynamic fee tier configuration.
 */
export interface FeeTierConfig {
    /** Base trading fee (Tier 1) in bps */
    baseBps: bigint;
    /** Tier 2 fee in bps (0 = disabled) */
    tier2Bps: bigint;
    /** Tier 3 fee in bps (0 = disabled) */
    tier3Bps: bigint;
    /** Notional threshold to enter Tier 2 (0 = tiered fees disabled) */
    tier2Threshold: bigint;
    /** Notional threshold to enter Tier 3 */
    tier3Threshold: bigint;
}
/**
 * Compute the effective fee rate in bps using the tiered fee schedule.
 *
 * Mirrors on-chain `compute_dynamic_fee_bps` logic:
 * - notional < tier2Threshold → baseBps (Tier 1)
 * - notional < tier3Threshold → tier2Bps (Tier 2)
 * - notional >= tier3Threshold → tier3Bps (Tier 3)
 *
 * If tier2Threshold == 0, tiered fees are disabled (flat baseBps).
 */
export declare function computeDynamicFeeBps(notional: bigint, config: FeeTierConfig): bigint;
/**
 * Compute the dynamic trading fee for a given notional and tier config.
 *
 * Uses ceiling division to match on-chain behavior (prevents fee evasion
 * via micro-trades).
 */
export declare function computeDynamicTradingFee(notional: bigint, config: FeeTierConfig): bigint;
/**
 * Fee split configuration.
 */
export interface FeeSplitConfig {
    /** LP vault share in bps (0–10_000) */
    lpBps: bigint;
    /** Protocol treasury share in bps */
    protocolBps: bigint;
    /** Market creator share in bps */
    creatorBps: bigint;
}
/**
 * Compute fee split for a total fee amount.
 *
 * Returns [lpShare, protocolShare, creatorShare].
 * If all split params are 0, 100% goes to LP (legacy behavior).
 * Creator gets the rounding remainder to ensure total is preserved.
 */
export declare function computeFeeSplit(totalFee: bigint, config: FeeSplitConfig): [bigint, bigint, bigint];
/**
 * Compute PnL as a percentage of capital.
 *
 * Uses BigInt scaling to avoid precision loss from Number(bigint) conversion.
 * Number(bigint) silently truncates values above 2^53, which can produce
 * incorrect percentages for large positions (e.g., tokens with 9 decimals
 * where capital > ~9M tokens in native units exceeds MAX_SAFE_INTEGER).
 */
export declare function computePnlPercent(pnlTokens: bigint, capital: bigint): number;
/**
 * Estimate entry price including fee impact (slippage approximation).
 */
export declare function computeEstimatedEntryPrice(oracleE6: bigint, tradingFeeBps: bigint, direction: "long" | "short"): bigint;
/**
 * Convert per-slot funding rate (bps) to annualized percentage.
 */
export declare function computeFundingRateAnnualized(fundingRateBpsPerSlot: bigint): number;
/**
 * Compute margin required for a given notional and initial margin bps.
 */
export declare function computeRequiredMargin(notional: bigint, initialMarginBps: bigint): bigint;
/**
 * Compute maximum leverage from initial margin bps.
 *
 * @throws Error if initialMarginBps is zero (infinite leverage is undefined)
 */
export declare function computeMaxLeverage(initialMarginBps: bigint): number;
