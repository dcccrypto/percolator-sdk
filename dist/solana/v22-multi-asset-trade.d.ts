/**
 * Q-7 (2026-10-12): the transaction shape for trading on a MULTI-ASSET v2.2 market once a portfolio holds
 * >= 3 legs.
 *
 * Wrapper RC 6c078a0e, `ensure_trade_portfolio_current_for_requests_view` (v16_program.rs:40913, called for
 * account_a AND account_b): a trade portfolio with >= `WRAPPER_PRE_CRANK_MIN_LEGS` (= max(cap - 1, 1) = 3)
 * active legs must hold a health certificate at the market's CURRENT (oracle, funding, risk, asset-set) epochs,
 * else the trade (opens AND closes) returns 19 EngineStale. A refresh crank that settles PnL bumps the market
 * risk epoch, so refreshing the taker invalidates the LP's certificate and vice versa. The shape that satisfies
 * it, in ONE transaction (ledger v22-devnet-fresh §7c; reference script percolator-ops
 * relaunch/v22/fresh/q7-multi-asset-trade.ts @ 1a117658):
 *
 *   [ PermissionlessCrank(LP, observations = every asset)   accrue + certify the LP
 *     PermissionlessCrank(peer, [])  x n                    OPEN only: other positioned portfolios stale on the asset (else 121)
 *     PermissionlessCrank(taker, [])                        settle + certify the taker (bumps the risk epoch)
 *     PermissionlessCrank(LP, [])                           re-certify the LP at the new epoch
 *     TradeCpi ]
 *
 * with a 1,400,000 CU limit (measured 1.13M - 1.38M at 3-4 legs) and the wrapper heap. Client rules: simulate
 * first; drop a crank refused 22 (already current); if the trade is still 19 append one more refresh (taker,
 * then LP, alternating) — {@link refineMultiAssetTradePlanV22} applies them.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
/** `WRAPPER_PRE_CRANK_MIN_LEGS`: active legs at which a trade portfolio needs a current health certificate (3). */
export declare const WRAPPER_PRE_CRANK_MIN_LEGS_V22: number;
/** Compute-unit limit for the multi-asset trade shape (measured 1,126,791 - 1,376,127 CU at 3-4 legs on devnet). */
export declare const MULTI_ASSET_TRADE_COMPUTE_UNITS_V22 = 1400000;
/** Extra refresh cranks {@link refineMultiAssetTradePlanV22} may append when the trade is still refused 19. */
export declare const MULTI_ASSET_TRADE_MAX_EXTRA_CRANKS_V22 = 4;
/** One refresh crank of the plan. */
export interface MultiAssetCrankV22 {
    role: "lpObserve" | "peer" | "taker" | "lp";
    portfolio: PublicKey;
    /** Asset indices observed by this crank (empty = refresh only). */
    observations: number[];
}
/** Inputs of {@link buildMultiAssetTradeIxsV22}. */
export interface MultiAssetTradeInputV22 {
    /** Wrapper program id. */
    programId: PublicKey;
    market: PublicKey;
    /** Raw market account bytes (for the number of asset slots). */
    marketData: Uint8Array;
    /** Signer of the cranks (the taker's wallet; any signer works, the crank is permissionless). */
    cranker: PublicKey;
    takerPortfolio: PublicKey;
    /** Raw taker portfolio bytes. */
    takerData: Uint8Array;
    lpPortfolio: PublicKey;
    /** Raw LP portfolio bytes. */
    lpData: Uint8Array;
    /** The TradeCpi / TradeNoCpi instruction to run after the refreshes (built by the caller). */
    tradeIx: TransactionInstruction;
    /** For an OPEN: other positioned portfolios that are stale on the traded asset (each gets a refresh; else 121). */
    stalePeers?: readonly PublicKey[];
    /** Assets the first LP crank observes. Default: every configured asset slot of the market. */
    observeAssets?: readonly number[];
    /** Force the path instead of deciding from the leg counts. */
    forcePath?: "simple" | "multiAsset";
}
/** The plan: what to send and why. */
export interface MultiAssetTradePlanV22 {
    /** `simple`: single-asset market or both portfolios below 3 legs (no refresh needed); `multiAsset`: the Q-7 shape. */
    path: "simple" | "multiAsset";
    programId: PublicKey;
    market: PublicKey;
    cranker: PublicKey;
    takerPortfolio: PublicKey;
    lpPortfolio: PublicKey;
    /** Refresh cranks, in order (empty on the simple path). */
    cranks: MultiAssetCrankV22[];
    tradeIx: TransactionInstruction;
    /** ComputeBudget instructions (heap + unit limit); empty on the simple path (use your usual trade budget). */
    budgetIxs: TransactionInstruction[];
    /** `[...budgetIxs, ...cranks, tradeIx]`, ready for one transaction. */
    instructions: TransactionInstruction[];
    /** Compute-unit limit requested (undefined on the simple path). */
    computeUnitLimit?: number;
    /** Facts behind the decision. */
    marketSlots: number;
    takerActiveLegs: number;
    lpActiveLegs: number;
    /** Extra refreshes appended by {@link refineMultiAssetTradePlanV22} so far. */
    extraCranks: number;
}
/**
 * Build one PermissionlessCrank (tag 5) refresh of `portfolio`, observing `observations`.
 *
 * @param programId     Wrapper program id.
 * @param market        Market account.
 * @param cranker       Signer.
 * @param portfolio     Portfolio to refresh.
 * @param observations  Asset indices to observe (empty = refresh only).
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildRefreshCrankIxV22(programId, market, wallet, lpPortfolio, [0, 1, 2, 3, 4]);
 * ```
 */
export declare function buildRefreshCrankIxV22(programId: PublicKey, market: PublicKey, cranker: PublicKey, portfolio: PublicKey, observations?: readonly number[]): TransactionInstruction;
/**
 * Build the instruction sequence for a trade (open or close) from the market, taker and LP state. On a
 * multi-asset market where the taker or the LP holds >= 3 legs it returns the Q-7 shape
 * `[budget, crank LP (observe all), crank peers, crank taker, crank LP, trade]` with the 1.4M CU limit;
 * on a single-asset market, or with both below 3 legs, it returns the trade alone (`path: "simple"`).
 * Simulate the result and pass a failure to {@link refineMultiAssetTradePlanV22}.
 *
 * @param i  See {@link MultiAssetTradeInputV22}.
 * @returns The plan; send `plan.instructions` in one transaction.
 * @example
 * ```ts
 * let plan = buildMultiAssetTradeIxsV22({ programId, market, marketData, cranker: wallet, takerPortfolio, takerData, lpPortfolio, lpData, tradeIx });
 * for (let n = 0; n < 8; n++) {
 *   const sim = await simulate(plan.instructions);
 *   if (!sim.value.err) break;
 *   const next = refineMultiAssetTradePlanV22(plan, sim.value.err);
 *   if (next.action === "fail") throw new Error(parseErrorFromLogs(sim.value.logs ?? [], { context: { action: "trade", healthCheckStale: true } })?.hint);
 *   if (next.action === "wait") await sleep(700);
 *   plan = next.plan;
 * }
 * ```
 */
export declare function buildMultiAssetTradeIxsV22(i: MultiAssetTradeInputV22): MultiAssetTradePlanV22;
/** What to do after a failed simulation of a plan. */
export type MultiAssetTradeRefinementV22 = {
    action: "retry";
    plan: MultiAssetTradePlanV22;
    reason: string;
} | {
    action: "wait";
    plan: MultiAssetTradePlanV22;
    reason: string;
} | {
    action: "fail";
    plan: MultiAssetTradePlanV22;
    code: number | null;
    reason: string;
};
/**
 * Apply the client rules to a failed simulation of `plan.instructions`:
 *   - a refresh crank refused 22 (already current) is dropped — except the first, observing crank: wait a slot and retry;
 *   - the trade refused 19 gets one more refresh appended (taker, then LP, alternating; at most 4);
 *   - a 19 on the simple path is a failure here: rebuild the plan from fresh account data;
 *   - anything else is a real refusal.
 *
 * @param plan  The plan that was simulated.
 * @param err   `simulateTransaction(...).value.err` (e.g. `{ InstructionError: [4, { Custom: 22 }] }`).
 * @returns `retry` with the adjusted plan, `wait` (retry the same plan after ~1 slot), or `fail`.
 * @example
 * ```ts
 * const next = refineMultiAssetTradePlanV22(plan, sim.value.err);
 * ```
 */
export declare function refineMultiAssetTradePlanV22(plan: MultiAssetTradePlanV22, err: unknown): MultiAssetTradeRefinementV22;
