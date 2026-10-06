/**
 * v2.2 instruction builders, account-list helpers, compute-budget presets, the Earn exit helper and
 * the atomic launch-bundle builder.
 *
 * Wire bytes live in `abi/v22-wire.ts` (golden-vector tested against the real wrapper crate); this
 * module only assembles them with the account lists the Rust handlers read. v1 (`ETDLAdi`) and v2.1
 * builders are untouched: callers opt into v2.2 by calling these and by targeting the v2.2 program id.
 *
 * @module v22
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { InitBondTrancheArgs } from "../abi/v22-wire.js";
import type { LayoutTable } from "../abi/layout.js";
import type { BudgetParams, TxFormat } from "../runtime/txv1.js";
/** Market context shared by the vault builders. */
export interface MarketV22 {
    /** v2.2 wrapper program id. */
    programId: PublicKey;
    market: PublicKey;
    /** `LpVaultRegistryV16.domain`: selects the own / sibling backing ledger. */
    registryDomain: number;
    /** The vault-owned LP portfolio (bound vaults). */
    lpPortfolio?: PublicKey;
    /** `["vault_lp_ext", market]` once the registry's ext flag is set. */
    vaultLpExt?: PublicKey;
}
/** One preset: a compute-unit limit, where the number comes from, and the heap. */
export interface ComputePresetV22 {
    /** Compute-unit limit to request. */
    units: number;
    /** `measured`: a worst case from the wave docs; `estimated`: a conservative bound, SIMULATE then size from `unitsConsumed`. */
    basis: "measured" | "estimated";
    /** Where the number comes from. */
    note: string;
}
/**
 * Compute-unit presets for the heavy v2.2 instructions. The runtime default (200k) always fails these. Every
 * wrapper transaction also needs the 128 KiB heap ({@link V17_WRAPPER_HEAP_FRAME_BYTES}), which
 * {@link computeBudgetPrelude} requests.
 *
 * Only the tag-77 and batch numbers are MEASURED (Wave A doc / ledger). The bond, rescue, G9 and rent
 * numbers are ESTIMATES scaled from the measured Earn instructions (`RECOMMENDED_CU_P3`: 77 non-refreshing ~
 * 285k..400k): simulate first and size from `unitsConsumed` x 1.2.
 */
export declare const COMPUTE_PRESETS_V22: Readonly<Record<string, ComputePresetV22>>;
/**
 * ComputeBudget prelude (heap + unit limit + optional price) for a preset, in the legacy / v0 instruction form.
 * For v1 transactions put the same numbers in the config (`v1ConfigFromBudget`).
 *
 * @param presetOrUnits  A preset name, or an explicit unit limit.
 * @param opts           `priorityMicroLamportsPerCu` and `heapBytes` (default the wrapper's 128 KiB).
 * @returns Instructions to prepend.
 * @example
 * ```ts
 * const tx = new Transaction().add(...computeBudgetPrelude("executeRedemptionRefresh"), executeIx);
 * ```
 */
export declare function computeBudgetPrelude(presetOrUnits: keyof typeof COMPUTE_PRESETS_V22 | number, opts?: {
    priorityMicroLamportsPerCu?: number;
    heapBytes?: number;
}): TransactionInstruction[];
/** Inputs shared by the tag 76 / 77 builders. */
export interface RedemptionAccountsV22 {
    market: MarketV22;
    redeemer: PublicKey;
}
/**
 * RequestRedeemLpShares v2.2 (tag 76): the floor and `keeper_ok` ride in the wire; the request PDA is created
 * 128 bytes long.
 *
 * @param m               Market context.
 * @param redeemer        Redeemer (signer, pays the PDA rent).
 * @param redeemerLpAta   Redeemer's LP-share token account.
 * @param shares          LP shares.
 * @param minPayoutAtoms  Payout floor (non-zero); use {@link defaultMinPayoutV22} on a simulated quote.
 * @param keeperOk        Allow an unsigned (keeper) execution, loss-gated and at the floor.
 * @returns Instruction (8 accounts).
 * @example
 * ```ts
 * const ix = buildRequestRedeemLpSharesIxV22(m, user, userLpAta, shares, defaultMinPayoutV22(quote), false);
 * ```
 */
export declare function buildRequestRedeemLpSharesIxV22(m: Pick<MarketV22, "programId" | "market">, redeemer: PublicKey, redeemerLpAta: PublicKey, shares: bigint, minPayoutAtoms: bigint, keeperOk?: boolean): TransactionInstruction;
/** Options for {@link buildExecuteRedemptionIxV22}. */
export interface ExecuteRedemptionOptsV22 {
    /** Payout floor on the wire; the program uses `max(wire, stored)`. */
    minPayoutAtoms: bigint;
    /**
     * Stale positioned portfolios of the vault's asset to refresh inline, in priority order (writable at
     * `[13..13+n]`). NON-bound Live vaults only. Use {@link selectRefreshPortfoliosV22} to respect the leg budget.
     */
    refresh?: readonly PublicKey[];
    /** The vault asset's oracle accounts (none for AuthMark), passed after the refresh accounts. */
    oracleAccounts?: readonly PublicKey[];
    /** `[12]` redeemer signs: required on a Live non-bound exit unless the request stored `keeper_ok` (default true). */
    redeemerSigns?: boolean;
    /** Bound vaults: `[13] vault_lp_state`, `[14]` the vault LP portfolio (never combined with `refresh`). */
    boundLpPortfolio?: PublicKey;
}
/**
 * ExecuteRedemption v2.2 (tag 77), fully assembled. Account list: the 13 base accounts, then EITHER the bound
 * vault tail (`[13] vault_lp_state`, `[14]` vault LP; `refresh` must be empty) OR the inline refresh portfolios
 * and the oracle tail. Both pot ledgers are writable (the program tops the chosen pot up from its sibling).
 *
 * Always SIMULATE first, read the payout from the token balance change (or the 117 / 118 error) and only then send
 * with an explicit {@link COMPUTE_PRESETS_V22} `executeRedemptionRefresh` limit: a compute overrun aborts the whole
 * transaction and is NOT a program error (see {@link classifyRedemptionSimulationV22}).
 *
 * @param m             Market context.
 * @param cranker       Fee payer / signer (may equal the redeemer).
 * @param redeemer      The request's owner.
 * @param redeemerDest  Redeemer's collateral token account.
 * @param vaultToken    Market collateral vault token account.
 * @param sourceDomain  Pot to redeem from.
 * @param o             See {@link ExecuteRedemptionOptsV22}.
 * @returns Instruction.
 * @throws If the refresh list exceeds 8, is combined with a bound vault, or the leg budget cannot be checked here
 *   (the program re-checks `sum(3 + legs) <= 34`).
 * @example
 * ```ts
 * const ix = buildExecuteRedemptionIxV22(m, user, user, userAta, vaultAta, m.registryDomain, { minPayoutAtoms: floor, refresh: stale });
 * ```
 */
export declare function buildExecuteRedemptionIxV22(m: MarketV22, cranker: PublicKey, redeemer: PublicKey, redeemerDest: PublicKey, vaultToken: PublicKey, sourceDomain: number, o: ExecuteRedemptionOptsV22): TransactionInstruction;
/** A positioned portfolio that may need an inline refresh. */
export interface RefreshCandidateV22 {
    key: PublicKey;
    /** Active legs (popcount of `active_bitmap`). */
    legs: number;
}
/** Inputs of {@link planEarnExitV22}. */
export interface EarnExitPlanInputV22 {
    market: MarketV22;
    /** Fee payer; may equal the redeemer. */
    cranker: PublicKey;
    redeemer: PublicKey;
    redeemerLpAta: PublicKey;
    redeemerDest: PublicKey;
    vaultToken: PublicKey;
    sourceDomain: number;
    shares: bigint;
    /** Positioned portfolios on the vault's asset that are stale, in priority order (liquidating first). Non-bound Live only. */
    staleCandidates?: readonly RefreshCandidateV22[];
    oracleAccounts?: readonly PublicKey[];
    /** Bound vault: the vault LP portfolio (no inline refresh on a bound vault). */
    boundLpPortfolio?: PublicKey;
    /** Request with `keeper_ok = 1`. */
    keeperOk?: boolean;
}
/** The product of {@link planEarnExitV22}. */
export interface EarnExitPlanV22 {
    /** Portfolios chosen for the inline refresh (<= 8, `sum(3 + legs) <= 34`). */
    refreshSelected: PublicKey[];
    /** Stale portfolios that did not fit: crank them with tag 5 earlier, wait for the keeper sweep, or use `keeper_ok`. */
    refreshDeferred: PublicKey[];
    /** Leg weight of the selection. */
    refreshWeight: number;
    /** A tag 77 with a floor of 1 atom for `simulateTransaction` (the payout is read from the balance change). */
    simulationIx: TransactionInstruction;
    /** Compute-unit limit to use for BOTH the simulation and the send. */
    computeUnits: number;
    /**
     * Build the final pair from the simulated payout: the floor defaults to `quote - 5 bps`
     * ({@link defaultMinPayoutV22}) and goes on BOTH the tag-76 trailer and the tag-77 wire.
     */
    finalize(quotedPayout: bigint, slippageBps?: number): {
        requestIx: TransactionInstruction;
        executeIx: TransactionInstruction;
        minPayoutAtoms: bigint;
    };
}
/**
 * Plan a two-step Earn exit: choose the refresh accounts by leg weight, build the simulation instruction, and
 * return a `finalize` that turns the simulated payout into the tag-76 / tag-77 pair with the default floor.
 *
 * @param i  See {@link EarnExitPlanInputV22}.
 * @returns The plan.
 * @example
 * ```ts
 * const plan = planEarnExitV22({ market, cranker: user, redeemer: user, redeemerLpAta, redeemerDest, vaultToken, sourceDomain: market.registryDomain, shares, staleCandidates });
 * // 1. simulate plan.simulationIx with computeBudgetPrelude(plan.computeUnits); quote = balance delta
 * const { requestIx, executeIx } = plan.finalize(quote);
 * ```
 */
export declare function planEarnExitV22(i: EarnExitPlanInputV22): EarnExitPlanV22;
/**
 * The payout of a simulated redemption, from the redeemer's token balance before and after.
 *
 * @param before  Redeemer collateral balance before (atoms).
 * @param after   Balance in the simulated post-state.
 * @returns The payout.
 * @throws If the balance did not increase.
 * @example
 * ```ts
 * const quote = payoutFromBalancesV22(0n, 1_000_000n);
 * ```
 */
export declare function payoutFromBalancesV22(before: bigint, after: bigint): bigint;
/** Classification of a simulated / failed tag 77. */
export type RedemptionSimulationKindV22 = "ok" | "belowMinPayout" | "notLossCurrent" | "computeBudgetExceeded" | "other";
/**
 * Classify a simulation result of a tag 77: 117 (floor not met: retry or lower it), 118 (book not loss-current:
 * wait for a refresh), a compute overrun (NEVER 118: it is not a program error, raise the unit limit), or other.
 *
 * @param r  `{ err, logs }` from `simulateTransaction` (`err` is the raw value or null).
 * @returns The kind and the program error code when there is one.
 * @example
 * ```ts
 * const k = classifyRedemptionSimulationV22({ err: sim.value.err, logs: sim.value.logs ?? [] });
 * ```
 */
export declare function classifyRedemptionSimulationV22(r: {
    err: unknown;
    logs: readonly string[];
}): {
    kind: RedemptionSimulationKindV22;
    code?: number;
};
/**
 * SettleHoldingRent (tag 106), permissionless.
 *
 * @param m                 Market context (`lpPortfolio` required).
 * @param caller            Signer.
 * @param portfolio         Portfolio to settle (may equal the vault LP portfolio).
 * @param assetIndex        Asset slot.
 * @param nowSlot           Caller slot.
 * @param oracleAccounts    The asset's oracle accounts per its profile.
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildSettleHoldingRentIxV22(m, keeper, portfolio, 0, slot, [pythFeed]);
 * ```
 */
export declare function buildSettleHoldingRentIxV22(m: MarketV22, caller: PublicKey, portfolio: PublicKey, assetIndex: number, nowSlot: bigint, oracleAccounts?: readonly PublicKey[]): TransactionInstruction;
/**
 * SweepBandDustLeg (tag 118), permissionless; accounts `[caller][market w][portfolio w][bound vault LP w]`. KEEPER: leave
 * it OFF on a live market whose wrapper predates the bilateral fix.
 *
 * @param m           Market context (`lpPortfolio` required).
 * @param caller      Signer.
 * @param portfolio   The portfolio holding the dust leg.
 * @param assetIndex  Asset slot.
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildSweepBandDustLegIxV22(m, keeper, portfolio, 0);
 * ```
 */
export declare function buildSweepBandDustLegIxV22(m: MarketV22, caller: PublicKey, portfolio: PublicKey, assetIndex: number): TransactionInstruction;
/**
 * EvictAndTradeCpi (tag 119): turn a built TradeCpi instruction into the evicting form by prepending the victim
 * portfolio (writable) and swapping the tag. Use it when an open on a FULL side (256 legs) fails with 111: name a
 * victim leg that is (a) at most 4x the market's minimum position size and (b) at most half the taker's size.
 *
 * @param tradeCpiIx  The complete TradeCpi instruction (tag 10).
 * @param victim      The victim's portfolio account.
 * @returns The tag-119 instruction.
 * @throws If `tradeCpiIx` is not a TradeCpi.
 * @example
 * ```ts
 * const ix = buildEvictAndTradeCpiIxV22(tradeIx, victimPortfolio);
 * ```
 */
export declare function buildEvictAndTradeCpiIxV22(tradeCpiIx: TransactionInstruction, victim: PublicKey): TransactionInstruction;
/**
 * InitBondTranche (tag 107). `payer` pays the tranche (and the ext, when absent). The `authority` is the
 * marketauth or the wrapper upgrade authority; pass `upgradeAuthorityProgramData: true` when it is NOT the marketauth
 * (the program data account is then appended as `[8]`). Must run BEFORE the first Earn deposit, in the same
 * transaction as the vault launch ({@link buildLaunchBundleV22}).
 *
 * @param m          Market context (`vaultLpExt` required: `["vault_lp_ext", market]`).
 * @param authority  Signer.
 * @param payer      Rent payer (signer).
 * @param a          Dials.
 * @param opts       `upgradeAuthority` flag.
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildInitBondTrancheIxV22(m, marketauth, marketauth, { couponBps: 800, utilBonusBps: 0, cooldownSlots: 9_000, capBps: 5_000 });
 * ```
 */
export declare function buildInitBondTrancheIxV22(m: MarketV22, authority: PublicKey, payer: PublicKey, a: InitBondTrancheArgs, opts?: {
    upgradeAuthority?: boolean;
}): TransactionInstruction;
/**
 * BondDeposit (tag 108): the SPL `amount` becomes vault-LP engine capital; shares mint at par. Refused while the fee leg
 * is unharvested (bundle 78 first), the tranche is impaired (107), above the cap (123) or below `minShares` (124).
 *
 * @param m           Market context (`lpPortfolio` required).
 * @param depositor   Signer (pays the position rent on first deposit).
 * @param sourceToken Depositor's collateral token account.
 * @param vaultToken  Market collateral vault token account.
 * @param amount      Atoms.
 * @param minShares   Slippage floor.
 * @returns Instruction (13 accounts).
 * @example
 * ```ts
 * const ix = buildBondDepositIxV22(m, user, userAta, vaultAta, 1_000_000n, quote.minShares!);
 * ```
 */
export declare function buildBondDepositIxV22(m: MarketV22, depositor: PublicKey, sourceToken: PublicKey, vaultToken: PublicKey, amount: bigint, minShares: bigint): TransactionInstruction;
/**
 * BondRequestWithdraw (tag 109); 0 shares cancels.
 *
 * @param m       Market context.
 * @param holder  Signer.
 * @param shares  Shares to request.
 * @returns Instruction (4 accounts).
 * @example
 * ```ts
 * const ix = buildBondRequestWithdrawIxV22(m, holder, 500n);
 * ```
 */
export declare function buildBondRequestWithdrawIxV22(m: Pick<MarketV22, "programId" | "market">, holder: PublicKey, shares: bigint): TransactionInstruction;
/**
 * BondExecuteWithdraw (tag 110). Live: paid from the vault LP's capital (needs a FLAT vault LP and the OI lock);
 * Resolved: paid from `sourceDomain`'s pot.
 *
 * @param m             Market context (`lpPortfolio` required).
 * @param holder        Signer.
 * @param destToken     Holder's collateral token account.
 * @param vaultToken    Market collateral vault token account.
 * @param minOut        Slippage floor.
 * @param sourceDomain  Pot for a Resolved exit (ignored when Live).
 * @returns Instruction (13 accounts).
 * @example
 * ```ts
 * const ix = buildBondExecuteWithdrawIxV22(m, holder, holderAta, vaultAta, quote.minOut!, 0);
 * ```
 */
export declare function buildBondExecuteWithdrawIxV22(m: MarketV22, holder: PublicKey, destToken: PublicKey, vaultToken: PublicKey, minOut: bigint, sourceDomain: number): TransactionInstruction;
/**
 * Append the bond tranche to an existing-tag instruction on a BOND market (REQUIRED once the registry's bond
 * flag is set; fail closed otherwise): 78 `[9]` (writable; build 78 with the ext + a WRITABLE vault LP `[8]` first,
 * see `withCrankFeesBoundTailP2b`), 97 `[12]`, 102 (Resolved) `[11]`, 103 `[9]`.
 *
 * @param base     The instruction built WITHOUT the tranche (exact key count checked).
 * @param tranche  `["bond_tranche", market]`.
 * @returns A new instruction with the tranche appended.
 * @throws If the tag takes no bond tail or the key count is not the one the tail index expects.
 * @example
 * ```ts
 * const ix = withBondTailV22(crankFeesIxWithExt, deriveBondTrancheV22(programId, market)[0]);
 * ```
 */
export declare function withBondTailV22(base: TransactionInstruction, tranche: PublicKey): TransactionInstruction;
/**
 * Append the `InsuranceUnitsV20` account to an asset-0 insurance instruction on a UNITS market (fail closed without
 * it): tags 9, 56, 57, 41, 101. The program finds it by its PDA anywhere after the base accounts, so it is appended
 * LAST (after the optional insurance ledger).
 *
 * @param base   The instruction (tag 9 / 56 / 57 / 41 / 101).
 * @param units  `["ins_units", market]`.
 * @returns A new instruction with the writable units account appended.
 * @throws If the tag does not take it, the account is already present, or the base is shorter than the tag's minimum.
 * @example
 * ```ts
 * const ix = withInsuranceUnitsTailV22(topUpIx, deriveInsuranceUnitsV22(programId, market)[0]);
 * ```
 */
export declare function withInsuranceUnitsTailV22(base: TransactionInstruction, units: PublicKey): TransactionInstruction;
/**
 * InsuranceBackstopDraw (tag 111, G9), permissionless. `tail` carries what the program searches for in `[7..]`: the units
 * account is appended automatically; pass any Hybrid-leg feed accounts and the allowlist for modes 0 and 2 on a mainnet
 * build via `extraTail`.
 *
 * @param m           Market context (`lpPortfolio` required).
 * @param cranker     Signer.
 * @param mode        0 DRAW, 1 RESTORE, 2 PROPOSE.
 * @param maxAmount   Cap in atoms.
 * @param extraTail   Leg feed accounts and `["g9_feeds"]` (read-only).
 * @returns Instruction.
 * @example
 * ```ts
 * const propose = buildInsuranceBackstopDrawIxV22(m, keeper, 2, 0n, legFeeds);
 * ```
 */
export declare function buildInsuranceBackstopDrawIxV22(m: MarketV22, cranker: PublicKey, mode: 0 | 1 | 2, maxAmount: bigint, extraTail?: readonly PublicKey[]): TransactionInstruction;
/**
 * RescueDeposit (tag 112): buy senior shares at the certified IMPAIRED value. Accounts as tag 75; bound vaults append
 * `[11] vault_lp_state` and `[12]` the vault LP portfolio. Only tranche 0 is accepted on chain today.
 *
 * @param m             Market context (`lpPortfolio` for a bound vault).
 * @param rescuer       Signer.
 * @param rescuerLpAta  Rescuer's LP-share token account.
 * @param sourceToken   Rescuer's collateral token account.
 * @param vaultToken    Market collateral vault token account.
 * @param amount        Atoms.
 * @param minShares     Slippage floor.
 * @param tranche       0 = senior.
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildRescueDepositIxV22(m, user, userLpAta, userAta, vaultAta, 100_000_000n, quote.minShares!);
 * ```
 */
export declare function buildRescueDepositIxV22(m: MarketV22, rescuer: PublicKey, rescuerLpAta: PublicKey, sourceToken: PublicKey, vaultToken: PublicKey, amount: bigint, minShares: bigint, tranche?: number): TransactionInstruction;
/**
 * InitInsuranceUnits (tag 116), permissionless: creates the units ledger on first use, refreshes its snapshot afterwards
 * (the stake program CPIs this before pricing).
 *
 * @param m      Market context.
 * @param payer  Signer.
 * @returns Instruction (4 accounts).
 * @example
 * ```ts
 * const ix = buildInitInsuranceUnitsIxV22(m, payer);
 * ```
 */
export declare function buildInitInsuranceUnitsIxV22(m: Pick<MarketV22, "programId" | "market">, payer: PublicKey): TransactionInstruction;
/**
 * SetG9FeedAllowlist (tag 117), upgrade authority only.
 *
 * @param programId         Wrapper program id.
 * @param upgradeAuthority  Signer (pays the rent on first use).
 * @param keys              Switchboard feed keys (<= 16).
 * @returns Instruction (4 accounts).
 * @example
 * ```ts
 * const ix = buildSetG9FeedAllowlistIxV22(programId, authority, [feedA]);
 * ```
 */
export declare function buildSetG9FeedAllowlistIxV22(programId: PublicKey, upgradeAuthority: PublicKey, keys: readonly PublicKey[]): TransactionInstruction;
/** Thrown when the launch bundle cannot be sent as ONE transaction. Splitting it reopens the N-2 front-run. */
export declare class LaunchBundleTooLargeError extends Error {
    readonly bytes: number | null;
    readonly limit: number;
    constructor(bytes: number | null, limit: number);
}
/** Inputs of {@link buildLaunchBundleV22}. */
export interface LaunchBundleInputV22 {
    /** Fee payer. */
    payer: PublicKey;
    /**
     * `SystemProgram.createAccount` instructions the bundle needs first (the matcher context, 320 B; the vault-LP portfolio,
     * `LAYOUT_V22.portfolio.accountLen` B). They sign with their new keypairs, so the transaction needs those signatures.
     */
    createAccounts: readonly TransactionInstruction[];
    /** Tag 74 CreateLpVault. */
    createVaultLp: TransactionInstruction;
    /** Tag 94 InitVaultLp. */
    initVaultLp: TransactionInstruction;
    /** Tag 107 InitBondTranche. */
    initBondTranche: TransactionInstruction;
    /** Cluster supports v1 transactions (`detectTxV1Support`). */
    supportsV1: boolean;
    /** Compute-unit limit (default {@link COMPUTE_PRESETS_V22} `launchBundle`). */
    computeUnits?: number;
    priorityMicroLamportsPerCu?: number;
}
/** A planned launch transaction. */
export interface LaunchBundlePlanV22 {
    /** `v1` when supported and it fits, else `legacy`. */
    format: TxFormat;
    /** Payload instructions in order (no ComputeBudget; add {@link computeBudgetPrelude} for legacy). */
    instructions: TransactionInstruction[];
    /** Exact serialized size in the chosen format, with the budget and every required signature. */
    bytes: number;
    /** The limit it was checked against (4096 for v1, 1232 for legacy). */
    limit: number;
    /** Budget to use. */
    budget: BudgetParams;
}
/**
 * Plan the launch bundle as ONE transaction, in order `[createAccount...] 74, 94, 107`. Prefers a v1 transaction
 * (4,096 B) when the cluster supports it; otherwise a legacy transaction that must fit in 1,232 B. NEVER splits: the
 * Wave C security review (N-2) showed that any split lets a minimum-size Earn deposit slip in and refuses tag 107
 * forever. A Squads launch must wrap the whole bundle in ONE vault transaction.
 *
 * NOTE: the wave docs call the first instruction "69 CreateLpVault"; the wrapper's `TAG_CREATE_LP_VAULT` is 74 (69 is
 * RestartAssetOracle). This builder checks for 74, 94, 107.
 *
 * @param i  See {@link LaunchBundleInputV22}.
 * @returns The plan.
 * @throws {@link LaunchBundleTooLargeError} when it does not fit even in the best available format; a plain `Error`
 *   when an instruction is not the expected tag.
 * @example
 * ```ts
 * const plan = buildLaunchBundleV22({ payer, createAccounts: [ctxIx, lpPortfolioIx], createVaultLp, initVaultLp, initBondTranche, supportsV1: false });
 * ```
 */
export declare function buildLaunchBundleV22(i: LaunchBundleInputV22): LaunchBundlePlanV22;
/**
 * `SystemProgram.createAccount` for the vault-LP portfolio that tag 94 expects pre-created: program-owned,
 * `portfolio.accountLen` bytes of the chosen layout (10,091 on the provisional v2.2 table).
 *
 * @param payer       Funds the rent.
 * @param portfolio   New account (fresh keypair; it must sign).
 * @param lamports    `getMinimumBalanceForRentExemption(layout.portfolio.accountLen)`.
 * @param programId   The wrapper program id.
 * @param layout      Layout table (default {@link LAYOUT_V22}).
 * @returns The createAccount instruction.
 * @example
 * ```ts
 * const ix = buildCreateLpPortfolioIxV22(payer, lpKp.publicKey, lamports, programId);
 * ```
 */
export declare function buildCreateLpPortfolioIxV22(payer: PublicKey, portfolio: PublicKey, lamports: number, programId: PublicKey, layout?: LayoutTable): TransactionInstruction;
/**
 * `SystemProgram.createAccount` for ANY v2.2 portfolio (trader or vault LP): a TOP-LEVEL system instruction of EXACTLY
 * `layout.portfolio.accountLen` bytes, owned by the wrapper. The program cannot realloc past 10,240 B, so every client
 * must create portfolios at the exact length (10,603 on variant B, 10,091 on stage A); a wrong length fails.
 *
 * @param payer      Funds the rent.
 * @param portfolio  New account (fresh keypair; it must sign).
 * @param lamports   `getMinimumBalanceForRentExemption(layout.portfolio.accountLen)`.
 * @param programId  The wrapper program id.
 * @param layout     Layout row (default {@link LAYOUT_V22}).
 * @returns The createAccount instruction.
 * @example
 * ```ts
 * const ix = buildCreatePortfolioAccountIxV22(payer, kp.publicKey, await conn.getMinimumBalanceForRentExemption(portfolioAccountLenV22()), programId);
 * ```
 */
export declare function buildCreatePortfolioAccountIxV22(payer: PublicKey, portfolio: PublicKey, lamports: number, programId: PublicKey, layout?: LayoutTable): TransactionInstruction;
/**
 * The exact portfolio account length of a layout row.
 *
 * @param layout  Layout row (default {@link LAYOUT_V22}).
 * @returns `PORTFOLIO_ACCOUNT_LEN`.
 * @example
 * ```ts
 * portfolioAccountLenV22(); // 10603 on variant B
 * ```
 */
export declare function portfolioAccountLenV22(layout?: LayoutTable): number;
