/**
 * Smart Price Router — automatic oracle selection for any token.
 *
 * Given a token mint, discovers all available price sources (DexScreener, Pyth, Jupiter),
 * ranks them by liquidity/reliability, and returns the best oracle config.
 */
export type PriceSourceType = "pyth" | "dex" | "jupiter";
export interface PriceSource {
    type: PriceSourceType;
    /** Pool address (dex), Pyth feed ID (pyth), or mint (jupiter) */
    address: string;
    /** DEX id for dex sources */
    dexId?: string;
    /** Pair label e.g. "SOL / USDC" */
    pairLabel?: string;
    /** USD liquidity depth — higher is better */
    liquidity: number;
    /** Latest spot price in USD */
    price: number;
    /** Confidence score 0-100 (composite of liquidity, staleness, reliability) */
    confidence: number;
}
export interface PriceRouterResult {
    mint: string;
    bestSource: PriceSource | null;
    allSources: PriceSource[];
    /** ISO timestamp of resolution */
    resolvedAt: string;
}
export declare const PYTH_SOLANA_FEEDS: Record<string, {
    symbol: string;
    mint: string;
}>;
export declare function resolvePrice(mint: string, signal?: AbortSignal): Promise<PriceRouterResult>;
