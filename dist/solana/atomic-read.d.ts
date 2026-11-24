/**
 * One-slot (atomic) reads for quotes that combine several accounts.
 *
 * The pure quote combinators (`quoteStakeWithdrawNowV5`, `nonboundVaultPricingFromAccountsP2b`,
 * `vaultLpEquityLagBoundsP3` + `boundVaultRedemptionAtomsP3`, `computeDexSpotPriceE6`) are exact for inputs from ONE
 * slot, but they take each account separately. A caller that reads those accounts with one `getAccountInfo` each can
 * straddle an on-chain event (a sync, a deposit, a crank, a swap) and get a quote no slot ever had: measured up to
 * +/-150% on the vault-LP lag bound (a false deficit), +/-50% on a stake withdraw, a false 3,333 bps par-minus-E3
 * alert, -20%/+25% on a bound exit and 10% on a PumpSwap spot price (J-20261120-SDK-REPORT-MIXEDSLOTSNAPSHOT).
 *
 * The helpers here read every money input of a quote with ONE `getMultipleAccountsInfoAndContext` call, so all of them
 * come from one slot, return that slot, and accept `minContextSlot` so a poller (or an `RpcPool` failover) never moves
 * backwards. The pure combinators are unchanged; these helpers only own the read.
 *
 * Some account addresses live inside another account (a registry's `domain` picks the ledger PDAs, a VaultLpState
 * names the vault-LP portfolio, a PumpSwap pool names its vaults). Those identity fields are fixed at init, so the
 * helpers resolve them with a small first read when the caller does not pass them, then re-check them inside the
 * one-slot read. Pass them (or the resolved keys) to make a poll exactly one RPC call.
 */
import type { AccountInfo, Commitment, PublicKey, RpcResponseAndContext } from "@solana/web3.js";
import type { StakePoolV5, StakeWithdrawQuoteV5 } from "../abi/v22-stake.js";
import type { InsuranceUnitsV20 } from "../abi/v22-state.js";
import type { NonboundVaultPricingP2b } from "../abi/p2b-earn.js";
import type { DexType } from "./dex-oracle.js";
/** The one Connection method the atomic helpers use (a web3.js `Connection` satisfies it). */
export interface AtomicReadConnection {
    getMultipleAccountsInfoAndContext(publicKeys: PublicKey[], config?: {
        commitment?: Commitment;
        minContextSlot?: number;
    }): Promise<RpcResponseAndContext<(AccountInfo<Buffer | Uint8Array> | null)[]>>;
}
/** Options for {@link readAccountsAtomic} and the `fetch…` helpers built on it. */
export interface AtomicReadOptions {
    /** Commitment for the read (the connection's default when omitted). */
    commitment?: Commitment;
    /**
     * The lowest slot the answer may come from. Pass the `slot` of the previous result when polling, so a lagging RPC
     * node (or an `RpcPool` failover to one) can never serve an older state. The RPC refuses a lower slot; the helper
     * also throws if a node answers below it anyway.
     */
    minContextSlot?: number;
}
/** Result of {@link readAccountsAtomic}. */
export interface AtomicAccounts {
    /** The slot every account was read at (`context.slot`). */
    slot: number;
    /** One entry per key, in key order; `null` for an account that does not exist. */
    accounts: (AccountInfo<Buffer | Uint8Array> | null)[];
}
/** `getMultipleAccounts` takes at most 100 keys per call; above that one call cannot cover the read. */
export declare const ATOMIC_READ_MAX_KEYS = 100;
/**
 * Read several accounts at ONE slot with a single `getMultipleAccountsInfoAndContext` call, and return that slot.
 * Use it for any value computed from two or more accounts: separate `getAccountInfo` calls can each come from a
 * different slot.
 *
 * @param connection  A web3.js `Connection` (or anything with `getMultipleAccountsInfoAndContext`). With an `RpcPool`,
 *                    run the whole helper inside one `pool.call((c) => …)` so the read goes to one endpoint.
 * @param keys        1..=100 account addresses.
 * @param opts        `commitment`, `minContextSlot`.
 * @returns `{ slot, accounts }`, `accounts[i]` for `keys[i]` (null when missing).
 * @throws If `keys` is empty or longer than 100, the RPC returns the wrong number of accounts, or answers below
 *         `minContextSlot`.
 * @example
 * ```ts
 * const { slot, accounts: [market, registry] } = await readAccountsAtomic(connection, [marketPk, registryPk], { minContextSlot: lastSlot });
 * ```
 */
export declare function readAccountsAtomic(connection: AtomicReadConnection, keys: readonly PublicKey[], opts?: AtomicReadOptions): Promise<AtomicAccounts>;
/** Accounts for {@link fetchStakeWithdrawQuoteV5}. */
export interface StakeWithdrawAccountsV5 {
    /** The v5 StakePool. */
    pool: PublicKey;
    /** The wrapper InsuranceUnitsV20 the pool is deployed into. */
    insuranceUnits: PublicKey;
    /** `pool.vault` (SPL token account). */
    vault: PublicKey;
    /** The staker's LP token account (a missing account reads as 0 LP). */
    userLp: PublicKey;
    /**
     * OPTIONAL market account: when passed, the exit reading is clamped to the live free insurance
     * (`min(Σ domains[].withdrawCapacity, insurance)` of {@link decodeTerminalInsuranceCapacity}), read in the same slot.
     */
    market?: PublicKey;
    /** Asset of `market` whose insurance domains to read (default 0, the stake-bound asset). */
    assetIndex?: number;
}
/** Result of {@link fetchStakeWithdrawQuoteV5}. */
export interface StakeWithdrawQuoteAtSlotV5 extends StakeWithdrawQuoteV5 {
    /** The slot every input was read at. */
    slot: number;
    pool: StakePoolV5;
    insuranceUnits: InsuranceUnitsV20;
    vaultBalance: bigint;
    userLp: bigint;
    /** The exit reading the quote used (`snapInsuranceFreeAtoms`, clamped to the live reading when `market` was passed). */
    exitInsurance: bigint;
}
/**
 * {@link quoteStakeWithdrawNowV5} with every input read at ONE slot. Reading the pool and the insurance units
 * separately across a `SyncInsuranceDeployment` counts the deployed insurance twice or not at all (measured +/-50% on
 * `redeemable`).
 *
 * @param connection  Connection ({@link AtomicReadConnection}).
 * @param accounts    {@link StakeWithdrawAccountsV5}.
 * @param opts        `commitment`, `minContextSlot`.
 * @returns The quote plus its `slot` and decoded inputs, or `null` where the program fails closed (see
 *          {@link quoteStakeWithdrawNowV5}).
 * @throws If the pool, units, vault or (when passed) market account is missing or fails its decoder, or `vault` is not `pool.vault`.
 * @example
 * ```ts
 * const q = await fetchStakeWithdrawQuoteV5(connection, { pool, insuranceUnits, vault: poolState.vault, userLp: ata });
 * if (q) maxButton(q.maxLpNow), lastSlot = q.slot;
 * ```
 */
export declare function fetchStakeWithdrawQuoteV5(connection: AtomicReadConnection, accounts: StakeWithdrawAccountsV5, opts?: AtomicReadOptions): Promise<StakeWithdrawQuoteAtSlotV5 | null>;
/** Options for {@link fetchNonboundVaultPricingP2b}. */
export interface NonboundVaultPricingFetchOptsP2b extends AtomicReadOptions {
    /**
     * The registry's `domain` (fixed at init). Pass it (e.g. from the last result) to make the read one RPC call;
     * without it the helper first reads the registry to learn it. Either way it is re-checked in the one-slot read.
     */
    domain?: number;
}
/** Result of {@link fetchNonboundVaultPricingP2b}. */
export interface NonboundVaultPricingAtSlotP2b extends NonboundVaultPricingP2b {
    /** The slot every input was read at. */
    slot: number;
    registry: PublicKey;
    domain: number;
    feeShareBps: number;
    /** `registry.total_lp_shares_outstanding` from the same slot (for `lpAtomsForRedemptionP2b` / `lpSharesForDepositP2b`). */
    totalLpSharesOutstanding: bigint;
}
/**
 * {@link nonboundVaultPricingFromAccountsP2b} with the market, the LP-vault registry and both backing ledgers read at
 * ONE slot. Reading the market before a deposit and the ledgers after it shows a par-minus-E3 gap that does not exist
 * (measured: a false 3,333 bps R3-M1 alert and +/-33% share quotes).
 *
 * @param connection  Connection ({@link AtomicReadConnection}).
 * @param programId   Wrapper program id.
 * @param market      Market account (the registry and ledger PDAs are derived from it).
 * @param opts        `domain`, `commitment`, `minContextSlot`.
 * @returns The pricing plus `slot`, `domain`, `feeShareBps` and the share count S from the same slot.
 * @throws If the market or registry is missing, the registry is BOUND (use {@link fetchBoundVaultExitQuoteP3}), or
 *         `opts.domain` does not match the registry.
 * @example
 * ```ts
 * const p = await fetchNonboundVaultPricingP2b(connection, PROGRAM_ID, market, { domain: last?.domain, minContextSlot: last?.slot });
 * health.parMinusE3Bps = p.parMinusE3Bps;
 * const out = lpAtomsForRedemptionP2b(shares, p.totalLpSharesOutstanding, p.exitNavAtoms);
 * ```
 */
export declare function fetchNonboundVaultPricingP2b(connection: AtomicReadConnection, programId: PublicKey, market: PublicKey, opts?: NonboundVaultPricingFetchOptsP2b): Promise<NonboundVaultPricingAtSlotP2b>;
/** The fixed addresses a bound vault's exit quote reads ({@link resolveBoundVaultKeysP3}). */
export interface BoundVaultKeysP3 {
    vaultLpState: PublicKey;
    registry: PublicKey;
    /** `VaultLpState.lp_portfolio`. */
    lpPortfolio: PublicKey;
    /** `registry.domain`. */
    domain: number;
    ownLedger: PublicKey;
    siblingLedger: PublicKey;
}
/**
 * Resolve the fixed addresses of a bound vault (they never change after init) with one read of the VaultLpState and
 * the registry. Cache the result and pass it as `keys` to {@link fetchBoundVaultExitQuoteP3} so each poll is one call.
 *
 * @param connection  Connection ({@link AtomicReadConnection}).
 * @param programId   Wrapper program id.
 * @param market      Market account.
 * @param opts        `commitment`, `minContextSlot`.
 * @returns {@link BoundVaultKeysP3}.
 * @throws If either account is missing, the VaultLpState names another registry, or the registry is not bound.
 * @example
 * ```ts
 * const keys = await resolveBoundVaultKeysP3(connection, PROGRAM_ID, market);
 * ```
 */
export declare function resolveBoundVaultKeysP3(connection: AtomicReadConnection, programId: PublicKey, market: PublicKey, opts?: AtomicReadOptions): Promise<BoundVaultKeysP3>;
/** Options for {@link fetchBoundVaultExitQuoteP3}. */
export interface BoundVaultExitQuoteOptsP3 extends AtomicReadOptions {
    /** Senior shares to redeem (tag 77). */
    shares: bigint;
    /** Cached {@link resolveBoundVaultKeysP3} result; without it the helper resolves the keys first (one extra read). */
    keys?: BoundVaultKeysP3;
}
/** Result of {@link fetchBoundVaultExitQuoteP3}. All values from one `slot`. */
export interface BoundVaultExitQuoteP3 {
    slot: number;
    keys: BoundVaultKeysP3;
    /** Market `header.mode == 1` (Resolved): seniors are priced on physical idle backing. */
    resolved: boolean;
    /** S, `registry.total_lp_shares_outstanding`. */
    totalShares: bigint;
    /** C, `VaultLpState.senior_claim_atoms`. */
    seniorClaim: bigint;
    /** Floored bound-vault NAV ({@link boundVaultNavFlooredP3}). */
    nav: bigint;
    /** The vault LP's health-certificate `certified_equity` (signed atoms). */
    certifiedEquity: bigint;
    /**
     * The certificate is usable here: `valid`, not stale, and certified for the current active-leg set. The program also
     * requires the certificate epochs to equal the market's (not checked here); when they do not, tag 77 fails with 85
     * until a vault-LP refresh crank (`buildVaultLpRefreshCrankIxP3`).
     */
    certUsable: boolean;
    /** {@link vaultLpEquityLagBoundsP3} `.worse` (prices the exit). Negative = a deficit at the worse price. */
    lpEquityWorse: bigint;
    /** {@link vaultLpEquityLagBoundsP3} `.better` (prices a tag-75 entry while a draw is outstanding). */
    lpEquityBetter: bigint;
    /** The vault LP's value at effective prices (`vault_lp_value_atoms`); null when the certificate is not usable on a non-flat LP. */
    lpValueAtEff: bigint | null;
    /** `VaultLpState.backstop_outstanding_atoms`: senior to the seniors, netted off the live vault value. */
    backstopOutstandingAtoms: bigint;
    /** `VaultLpState.senior_draw_outstanding_atoms`. */
    seniorDrawOutstandingAtoms: bigint;
    /** Senior tranche value tag 77 prices on; null in Live when the vault LP cannot be valued (`lpValueAtEff` null: tag 77 fails 85). */
    seniorValue: bigint | null;
    /** `floor(shares · seniorValue / S)`; null when S == 0, shares > S, or `seniorValue` is null. */
    redemptionAtoms: bigint | null;
}
/**
 * The tag-77 senior exit quote of a BOUND vault with every input read at ONE slot: the registry share count S, the
 * VaultLpState claim C, both backing ledgers and pot buckets (NAV), and the vault-LP portfolio's legs and health
 * certificate against the market's effective / target prices. Reading the portfolio after a crank and the market
 * before it double-counts the pending price move (measured: `lpEquityWorse` -20,000 USDC against a true +40,000, a
 * false deficit); reading S and C across a senior deposit misprices the payout by -20% / +25%.
 *
 * Model: the existing SDK previews ({@link boundVaultNavFlooredP3}, {@link vaultLpEquityLagBoundsP3},
 * {@link liveExitSeniorValueP3} net of the backstop, {@link boundVaultRedemptionAtomsP3}). Not modelled: pending
 * harvestable fees (tag 77 then fails VaultLpHarvestPending; bundle tag 78 first), an undrawn senior deficit (87;
 * crank the draw first) and the certificate epochs (85; see `certUsable`).
 *
 * @param connection  Connection ({@link AtomicReadConnection}).
 * @param programId   Wrapper program id.
 * @param market      Market account.
 * @param opts        `shares`, cached `keys`, `commitment`, `minContextSlot`.
 * @returns {@link BoundVaultExitQuoteP3}.
 * @throws If an account is missing or fails its decoder, the registry is not bound, or the cached keys no longer match.
 * @example
 * ```ts
 * const keys = await resolveBoundVaultKeysP3(connection, PROGRAM_ID, market);
 * const q = await fetchBoundVaultExitQuoteP3(connection, PROGRAM_ID, market, { shares, keys, minContextSlot: last?.slot });
 * if (q.lpEquityWorse < 0n) note("the vault LP is in deficit at the pending price");
 * ```
 */
export declare function fetchBoundVaultExitQuoteP3(connection: AtomicReadConnection, programId: PublicKey, market: PublicKey, opts: BoundVaultExitQuoteOptsP3): Promise<BoundVaultExitQuoteP3>;
/** Options for {@link fetchDexSpotPriceE6}. */
export interface DexSpotPriceFetchOpts extends AtomicReadOptions {
    /** PumpSwap: cached `{ baseVault, quoteVault }` from `parseDexPool` (fixed at pool init); saves the first read. */
    vaults?: {
        baseVault: PublicKey;
        quoteVault: PublicKey;
    };
    /** Forwarded to {@link computeDexSpotPriceE6}. */
    solPriceE6?: bigint;
}
/**
 * {@link computeDexSpotPriceE6} with the pool and (PumpSwap) both reserve vaults read at ONE slot. Reading the base
 * vault before a swap and the quote vault after it gives a price no slot had (measured 10% off both snapshots for a
 * swap worth 10% of the quote reserves). Raydium CLMM and Meteora DLMM price from the pool account alone.
 *
 * @param connection  Connection ({@link AtomicReadConnection}).
 * @param dexType     `"pumpswap" | "raydium-clmm" | "meteora-dlmm"`.
 * @param pool        Pool account.
 * @param decimals    Mint decimals (PumpSwap, Meteora; see {@link computeDexSpotPriceE6}).
 * @param opts        PumpSwap `vaults`, `solPriceE6`, `commitment`, `minContextSlot`.
 * @returns `{ priceE6, slot }`.
 * @throws If an account is missing, the pool no longer names the cached vaults, or the price is not positive.
 * @example
 * ```ts
 * const { priceE6, slot } = await fetchDexSpotPriceE6(connection, "pumpswap", poolPk, { base: 6, quote: 9 });
 * ```
 */
export declare function fetchDexSpotPriceE6(connection: AtomicReadConnection, dexType: DexType, pool: PublicKey, decimals?: {
    base: number;
    quote: number;
}, opts?: DexSpotPriceFetchOpts): Promise<{
    priceE6: bigint;
    slot: number;
}>;
