/**
 * Stake-bound market wind-down (F-9, percolator-stake #301 `d13b5a9`, the relaunch stake), additive to SDK 8.0.0.
 * The relaunch wrapper (P1+P3 `424fe7e4`) keeps the v18.2 header/slot layout these offsets read
 * (VERSION 18, config 576, header 758, slot 2325) — the same layout d13b5a9's stake pins.
 *
 * - {@link decodeTerminalInsuranceCapacity}: the wrapper tag-41 terminal capacity for an asset's
 *   insurance authority (on a stake-bound market asset 0's authority is the pool's `vault_auth`),
 *   computed exactly as the deployed v18.2 wrapper (`6377376a`
 *   `terminal_insurance_withdraw_capacity_for_authority_view`) and engine (`35ddd692`
 *   `domain_insurance_withdraw_capacity` / `available_domain_insurance`) do.
 * - {@link buildRecoverTerminalInsuranceIx} / {@link buildAdminCloseSlabIx}: stake tags 29 / 30.
 * - {@link planStakeWindDown}: the ordered keeper/admin flow.
 *
 * Offsets are hand-derived from the engine `#[repr(C)]` structs (every field is a byte-array Pod,
 * so the layout is packed) and calibrated against offsets this SDK already verifies
 * (`insurance` @ header+301, `oi_eff_long_q` @ asset+289, header 758 B, engine slot 1301 B);
 * `test/stake-wind-down.test.ts` also checks them against live devnet v18 markets (header
 * `insurance_domain_budget_remaining_total` == Σ(budget − spent) over every domain).
 *
 * @module stake-wind-down
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { AdminCloseSlabAccounts, RecoverTerminalInsuranceAccounts } from "./stake.js";
/** MarketGroupV16HeaderAccount field offsets (relative to the header at account offset 592). */
export declare const MARKET_GROUP_HEADER_OFF_V18: Readonly<{
    readonly vault: 285;
    readonly insurance: 301;
    readonly cTot: 317;
    readonly sourceInsuranceCreditReservedTotalAtoms: 445;
    readonly insuranceDomainBudgetRemainingTotal: 461;
    readonly materializedPortfolioCount: 517;
    readonly mode: 626;
}>;
/** EngineAssetSlotV16Account field offsets (relative to the engine slot = asset slot + 1024). */
export declare const ENGINE_ASSET_SLOT_OFF_V18: Readonly<{
    readonly insuranceDomainBudgetLong: 515;
    readonly insuranceDomainBudgetShort: 531;
    readonly insuranceDomainSpentLong: 547;
    readonly insuranceDomainSpentShort: 563;
    /** InsuranceCreditReservationV16Account; `insurance_credit_reserved_num` is its first u128. */
    readonly insuranceReservationLong: 1157;
    readonly insuranceReservationShort: 1229;
}>;
/** Engine `BOUND_SCALE` (reservation `_num` fields are in 1e-12 atoms). */
export declare const ENGINE_BOUND_SCALE = 1000000000000n;
/** Engine `MarketModeV16` byte. */
export declare const MARKET_MODE_V18: Readonly<{
    readonly Live: 0;
    readonly Resolved: 1;
    readonly Recovery: 2;
}>;
/** One insurance domain (domain = 2·asset + side; long = 0, short = 1). */
export interface InsuranceDomainBudget {
    domain: number;
    side: "long" | "short";
    budget: bigint;
    spent: bigint;
    /** ceil(insurance_credit_reserved_num / BOUND_SCALE). */
    reservedAtoms: bigint;
    /** budget − spent − reserved (saturating) — the engine's `budget_remaining`. */
    budgetRemaining: bigint;
    /** Engine `domain_insurance_withdraw_capacity`: min(globalAvailable, budgetRemaining, vault). */
    withdrawCapacity: bigint;
}
/** Decoded terminal-insurance state for one asset's insurance authority. */
export interface TerminalInsuranceCapacity {
    assetIndex: number;
    /** Engine market mode byte (see {@link MARKET_MODE_V18}). */
    mode: number;
    resolved: boolean;
    vault: bigint;
    insurance: bigint;
    cTot: bigint;
    materializedPortfolioCount: bigint;
    sourceInsuranceCreditReservedTotalAtoms: bigint;
    /** insurance − source_insurance_credit_reserved_total (saturating). */
    globalAvailable: bigint;
    /** Header `insurance_domain_budget_remaining_total` (all assets). */
    headerBudgetRemainingTotal: bigint;
    /** Σ (budget − spent) over this asset's two domains. */
    assetBudgetRemaining: bigint;
    domains: [InsuranceDomainBudget, InsuranceDomainBudget];
    /**
     * The wrapper tag-41 terminal capacity for this asset's insurance authority:
     * min(Σ domain withdrawCapacity, globalAvailable, vault). Assumes no OTHER asset shares the
     * same insurance_authority (true for a stake-bound single-asset market). Send this as the
     * tag-29 `amount`; a larger value fails wrapper 21.
     */
    terminalCapacity: bigint;
}
/**
 * Decode the tag-41 terminal insurance capacity for asset `assetIndex`'s insurance authority
 * from a raw v18 market account. On a stake-bound market call it with asset 0: the result's
 * `terminalCapacity` is the tag-29 `amount` for {@link planStakeWindDown} step (b).
 *
 * @param marketData  Raw wrapper market account bytes (kind 1).
 * @param assetIndex  Asset slot (default 0).
 * @returns Budgets per domain, the header aggregates and the terminal capacity.
 * @throws If the account is not a market or is too short for the asset.
 * @example
 * ```ts
 * const cap = decodeTerminalInsuranceCapacity(marketInfo.data, 0);
 * if (cap.resolved && cap.terminalCapacity > 0n) amount = cap.terminalCapacity;
 * ```
 */
export declare function decodeTerminalInsuranceCapacity(marketData: Uint8Array, assetIndex?: number): TerminalInsuranceCapacity;
/**
 * Build stake tag 29 RecoverTerminalInsurance.
 *
 * @param a       Stake program id + named accounts (`stray` optional).
 * @param amount  Atoms (use {@link decodeTerminalInsuranceCapacity}`.terminalCapacity`), or 0 to book/sweep only.
 * @returns TransactionInstruction (no signer required).
 * @example
 * ```ts
 * const ix = buildRecoverTerminalInsuranceIx({ stakeProgram, caller, pool, poolVault, vaultAuth, market,
 *   wrapperVault, wrapperVaultAuthority, wrapperProgram }, cap.terminalCapacity);
 * ```
 */
export declare function buildRecoverTerminalInsuranceIx(a: RecoverTerminalInsuranceAccounts & {
    stakeProgram: PublicKey;
}, amount: bigint): TransactionInstruction;
/**
 * Build stake tag 30 AdminCloseSlab (signed by `pool.admin`). `poolDestToken` must already exist
 * (a pool-mint token account owned by the pool PDA).
 *
 * @param a  Stake program id + named accounts.
 * @returns TransactionInstruction.
 * @example
 * ```ts
 * const ix = buildAdminCloseSlabIx({ stakeProgram, admin, pool, market, wrapperVault, wrapperVaultAuthority,
 *   poolDestToken, collateralMint, poolVault, wrapperProgram });
 * ```
 */
export declare function buildAdminCloseSlabIx(a: AdminCloseSlabAccounts & {
    stakeProgram: PublicKey;
}): TransactionInstruction;
/** One planned step. `onCustomError` maps a Custom(code) result to what the caller should do. */
export type StakeWindDownStep = {
    step: "closePortfolios";
    ixs: TransactionInstruction[];
} | {
    step: "recoverTerminal";
    ix: TransactionInstruction;
    amount: bigint;
    onCustomError: Readonly<Record<number, "retryLater" | "done">>;
} | {
    step: "recoverTerminalBookOnly";
    ix: TransactionInstruction;
    onCustomError: Readonly<Record<number, "retryLater" | "done">>;
} | {
    step: "adminCloseSlab";
    ix: TransactionInstruction;
    /** Re-send `ix` while the market account is not a tombstone (`isClosedMarketTombstone`). */
    repeatUntil: "tombstone";
    /** Send before each repeat when a protocol fee is owed again (P1 re-books fee legs). */
    claimBetween: TransactionInstruction | null;
};
/** Inputs for {@link planStakeWindDown}. */
export interface StakeWindDownArgs {
    stakeProgram: PublicKey;
    wrapperProgram: PublicKey;
    /** Keeper (tag 29 caller; no signature needed). */
    caller: PublicKey;
    /** `pool.admin` (tag 30 signer). */
    admin: PublicKey;
    pool: PublicKey;
    poolVault: PublicKey;
    vaultAuth: PublicKey;
    market: PublicKey;
    /** Raw market account bytes, read just before planning. */
    marketData: Uint8Array;
    wrapperVault: PublicKey;
    poolDestToken: PublicKey;
    collateralMint: PublicKey;
    /** Step (a): caller-built portfolio close-out instructions (may be empty). */
    closePortfolioIxs: TransactionInstruction[];
    /** Optional stray vault_auth-owned token account to sweep in the book-only step. */
    stray?: PublicKey;
    /** If set, a tag-84 WithdrawProtocolFee(amount 0 = all) claim is planned between tag-30 repeats. */
    protocolFee?: {
        authority: PublicKey;
        destToken: PublicKey;
        authorityEpoch: bigint;
    };
    tokenProgram?: PublicKey;
}
/**
 * Plan the F-9 wind-down of a stake-bound market once it is Resolved:
 *   (a) close portfolios (caller-supplied);
 *   (b) tag 29 with amount = asset-0 terminal capacity (skipped when 0) — wrapper 21 → retry later;
 *   (c) tag 29 with amount 0 (+ optional stray) — stake 31 NothingToRecover → done;
 *   (d) tag 30, repeated while the market is not a tombstone, with a tag-84 claim in between
 *       when protocol legs were re-booked.
 *
 * @param a  Accounts, market bytes and optional protocol-fee claim inputs.
 * @returns Ordered steps.
 * @throws If the market is not Resolved (tag 29 amount>0 and tag 30 would fail 30 MarketNotTerminal).
 * @example
 * ```ts
 * for (const s of planStakeWindDown(args)) { ... }
 * ```
 */
export declare function planStakeWindDown(a: StakeWindDownArgs): StakeWindDownStep[];
