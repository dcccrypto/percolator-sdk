/**
 * LIQ-DIAG (2026-10-17, E2E-B B1): the permissionless way to liquidate / refresh a bankrupt, never-refreshed account.
 *
 * The program accrues an asset by at most `max_accrual_dt_slots` (500 or 125 on the v2.2 devnet markets) per
 * observation crank, and refuses every refresh with Custom(22) EngineNonProgress while the asset still lags. So after
 * any gap (a keeper outage, an account nobody refreshed) a lone refresh, an observe-through-the-trader, or
 * `[one LP observe, refresh]` all fail 22 or do nothing. The sequence that works:
 *
 *   [ PermissionlessCrank(observe, observations = the asset) x N     N = ceil(gap / max_accrual_dt)
 *     PermissionlessCrank(target, [])                                 refresh; the wrapper's F1 follow-on then runs ONE
 *                                                                     liquidation step in the same instruction when the
 *                                                                     refresh leaves the account below maintenance ]
 *
 * (reproduced in LiteSVM, percolator-prog test/v22-liq-catchup-repro-2026-10-17 `liq_diag_*`). The observation cranks
 * may target any portfolio of the market (the keeper uses the vault LP; pass it as `observePortfolio`).
 *
 * Compute: an observation crank is ~30k CU; the refresh with its follow-on liquidation is measured up to ~1.1M at
 * the leg cap. So a gap of more than {@link MAX_OBSERVES_WITH_REFRESH_V22} windows is split: catch-up-only
 * transactions of up to {@link MAX_OBSERVES_PER_TX_V22} observation cranks first (send them in order), the final
 * transaction last. Client rules: simulate each transaction first; the counts are computed from the slot you pass
 * (`readSlot`), and a chain that crosses another window before landing makes the final tx refuse 22 -- re-read the
 * market and call this again (an extra observation after the asset caught up is itself refused 22).
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { decodeMarketFundingV22 } from "../abi/v22-funding.js";
import { buildRefreshCrankIxV22 } from "./v22-multi-asset-trade.js";
import { computeBudgetPrelude } from "./v22.js";

/** Compute units of one observation (catch-up) crank (measured ~30k). */
export const OBSERVE_CRANK_CU_V22 = 30_000;
/** Compute units reserved for the refresh + F1 follow-on liquidation (measured up to 1,098,281, +66k hook = 1.164M). */
export const REFRESH_AND_LIQUIDATE_CU_V22 = 1_164_000;
/** Compute-unit limit of every transaction this builder returns. */
export const CATCHUP_TX_COMPUTE_UNITS_V22 = 1_400_000;
/** Observation cranks per catch-up-only transaction (compute 40 x 30k = 1.2M; the legacy tx size also fits 40). */
export const MAX_OBSERVES_PER_TX_V22 = 40;
/** Observation cranks that still leave room for the refresh + follow-on in the same transaction. */
export const MAX_OBSERVES_WITH_REFRESH_V22 = Math.floor((CATCHUP_TX_COMPUTE_UNITS_V22 - REFRESH_AND_LIQUIDATE_CU_V22 - 20_000) / OBSERVE_CRANK_CU_V22);

/** Inputs of {@link buildCatchUpAndRefreshIxsV22}. */
export interface CatchUpAndRefreshInputV22 {
  /** Wrapper program id. */
  programId: PublicKey;
  market: PublicKey;
  /** Raw market account bytes (read at `readSlot`; VERSION 19). */
  marketData: Uint8Array;
  /** Fee payer / signer of every crank (permissionless: any wallet). */
  cranker: PublicKey;
  /** The portfolio to refresh (and liquidate when it is below maintenance). */
  portfolio: PublicKey;
  /** The chain slot `marketData` was read at (RPC `context.slot`). */
  readSlot: bigint;
  /** Portfolio the observation cranks target. Default: `portfolio`. The keeper uses the vault LP. */
  observePortfolio?: PublicKey;
  /** Asset indices to observe (every asset the target holds a leg on). Default `[0]`. The OLDEST of them sets the gap. */
  assets?: readonly number[];
  /** Add a second no-observation crank after the refresh (needed only when the F1 follow-on does not cover the account: more than 3 legs). Default false. */
  liquidationCrank?: boolean;
  /**
   * bigtest F2: the market's bound vault-LP portfolio ({@link boundVaultLpPortfolioV22}), appended to the refresh /
   * liquidation cranks so a clean liquidation is matched against the vault LP and does not latch the asset ADL
   * reduce-only. Not added to the observation cranks. Requires the wrapper feature (see {@link RefreshCrankOptsV22}).
   */
  vaultLpCounterparty?: PublicKey;
}

/** One transaction of the plan. */
export interface CatchUpTxV22 {
  kind: "catchup" | "final";
  /** Compute-budget prelude followed by the cranks. */
  instructions: TransactionInstruction[];
  computeUnitLimit: number;
  observeCranks: number;
  /** True only on the final transaction. */
  refreshes: boolean;
}

/** Result of {@link buildCatchUpAndRefreshIxsV22}: send `txs` in order, simulating each first. */
export interface CatchUpAndRefreshPlanV22 {
  txs: CatchUpTxV22[];
  /** `readSlot - oldest slot_last` over the observed assets. */
  gapSlots: bigint;
  maxAccrualDtSlots: bigint;
  /** Total observation cranks = max(1, ceil(gap / max_accrual_dt)). */
  totalObserveCranks: number;
}

/**
 * Build the observation cranks + refresh that a third party sends to liquidate a bankrupt, unrefreshed account.
 *
 * @param input  See {@link CatchUpAndRefreshInputV22}.
 * @returns Transactions to send in order (catch-up-only first, the final tx with the refresh last).
 * @throws If the market is not VERSION 19, `maxAccrualDtSlots` is 0, or an asset index is out of range.
 * @example
 * ```ts
 * const plan = buildCatchUpAndRefreshIxsV22({ programId, market, marketData: info.data, readSlot: BigInt(ctx.slot), cranker: wallet.publicKey, portfolio, observePortfolio: lpPortfolio });
 * for (const tx of plan.txs) await simulateThenSend(new Transaction().add(...tx.instructions));
 * ```
 */
export function buildCatchUpAndRefreshIxsV22(input: CatchUpAndRefreshInputV22): CatchUpAndRefreshPlanV22 {
  const f = decodeMarketFundingV22(input.marketData);
  if (f.maxAccrualDtSlots <= 0n) throw new Error("buildCatchUpAndRefreshIxsV22: market max_accrual_dt_slots is 0");
  const assets = input.assets && input.assets.length > 0 ? [...input.assets] : [0];
  let oldest: bigint | null = null;
  for (const a of assets) {
    const st = f.assets[a];
    if (!st) throw new Error(`buildCatchUpAndRefreshIxsV22: asset ${a} is outside the market's ${f.assets.length} slots`);
    if (oldest === null || st.slotLast < oldest) oldest = st.slotLast;
  }
  const gap = input.readSlot > oldest! ? input.readSlot - oldest! : 0n;
  const dt = f.maxAccrualDtSlots;
  const windows = (gap + dt - 1n) / dt;
  const total = Number(windows < 1n ? 1n : windows);
  const observe = input.observePortfolio ?? input.portfolio;
  const observeIx = () => buildRefreshCrankIxV22(input.programId, input.market, input.cranker, observe, assets);
  const refreshIx = () =>
    buildRefreshCrankIxV22(input.programId, input.market, input.cranker, input.portfolio, [], { vaultLpCounterparty: input.vaultLpCounterparty });

  const finalObserves = Math.min(total, MAX_OBSERVES_WITH_REFRESH_V22);
  let remaining = total - finalObserves;
  const txs: CatchUpTxV22[] = [];
  while (remaining > 0) {
    const n = Math.min(remaining, MAX_OBSERVES_PER_TX_V22);
    txs.push({
      kind: "catchup",
      instructions: [...computeBudgetPrelude(CATCHUP_TX_COMPUTE_UNITS_V22), ...Array.from({ length: n }, observeIx)],
      computeUnitLimit: CATCHUP_TX_COMPUTE_UNITS_V22,
      observeCranks: n,
      refreshes: false,
    });
    remaining -= n;
  }
  const cranks = [...Array.from({ length: finalObserves }, observeIx), refreshIx(), ...(input.liquidationCrank ? [refreshIx()] : [])];
  txs.push({
    kind: "final",
    instructions: [...computeBudgetPrelude(CATCHUP_TX_COMPUTE_UNITS_V22), ...cranks],
    computeUnitLimit: CATCHUP_TX_COMPUTE_UNITS_V22,
    observeCranks: finalObserves,
    refreshes: true,
  });
  return { txs, gapSlots: gap, maxAccrualDtSlots: dt, totalObserveCranks: total };
}
