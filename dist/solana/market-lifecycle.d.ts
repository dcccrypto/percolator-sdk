/**
 * Market lifecycle helpers (additive, SDK 8.0.0):
 *   - {@link buildRebalanceReduceIx} / {@link planReduceOnlyExit}: tag 44 RebalanceReduce,
 *     the owner-signed exit that works while a side is in the engine's ADL reduce-only state.
 *   - {@link planCloseSlabAttempt} / {@link isClosedMarketTombstone}: the safe CloseSlab
 *     retirement sequence (tag 84 → [tag 41] → tag 13).
 *
 * Wire + account orders verified against the deployed wrapper `6377376a`
 * (`src/v16_program.rs`: decode arms 13/41/44/84, `handle_close_slab`,
 * `handle_withdraw_insurance`, `handle_rebalance_reduce` → `with_one_portfolio_view`).
 *
 * @module market-lifecycle
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { AccountSpec } from "../abi/accounts.js";
/**
 * RebalanceReduce (tag 44): 3 accounts, from `with_one_portfolio_view(owner_must_sign = true)`:
 *   [0] owner     signer (the portfolio owner)
 *   [1] market    writable
 *   [2] portfolio writable
 */
export declare const ACCOUNTS_REBALANCE_REDUCE: readonly AccountSpec[];
/** Inputs for {@link buildRebalanceReduceIx}. */
export interface RebalanceReduceIxArgs {
    programId: PublicKey;
    owner: PublicKey;
    market: PublicKey;
    portfolio: PublicKey;
    /** Live-read portfolio identity (PortfolioV17.portfolioId). */
    portfolioId: bigint;
    /** Live-read position epoch (PortfolioV17.matcherPositionEpoch). */
    positionEpoch: bigint;
    assetIndex: number;
    /** Quantity to reduce |position| by (u128, > 0). */
    reduceQ: bigint;
}
/**
 * Build a tag-44 RebalanceReduce instruction. The engine refuses `reduceQ == 0`
 * (InvalidInstruction) and, on a Live market, refuses once permissionless resolve
 * has matured (LockActive).
 *
 * @param a  Program id, accounts and CAS binding.
 * @returns TransactionInstruction signed by the portfolio owner.
 * @example
 * ```ts
 * const ix = buildRebalanceReduceIx({ programId, owner, market, portfolio, portfolioId, positionEpoch, assetIndex: 0, reduceQ });
 * ```
 */
export declare function buildRebalanceReduceIx(a: RebalanceReduceIxArgs): TransactionInstruction;
/**
 * Plan a full reduce-only exit of one leg from the portfolio's raw bytes: reads the
 * live portfolioId / position epoch and the leg's |basisPosQ|, and returns the tag-44
 * instruction reducing it to zero. Returns null if there is no active leg on that asset.
 *
 * @param programId      Wrapper program id.
 * @param owner          Portfolio owner (signer).
 * @param market         Market account.
 * @param portfolio      Portfolio account.
 * @param portfolioData  Raw portfolio account bytes (fetched just before).
 * @param assetIndex     Asset to exit (default 0).
 * @returns `{ ix, reduceQ, side }` or null.
 * @example
 * ```ts
 * const plan = planReduceOnlyExit(WRAPPER, owner, market, portfolio, info.data, 0);
 * if (plan) await sendTx([plan.ix]);
 * ```
 */
export declare function planReduceOnlyExit(programId: PublicKey, owner: PublicKey, market: PublicKey, portfolio: PublicKey, portfolioData: Uint8Array, assetIndex?: number): {
    ix: TransactionInstruction;
    reduceQ: bigint;
    side: "long" | "short";
} | null;
/** Header kind written by `write_closed_market_tombstone` (`KIND_CLOSED_MARKET`). */
export declare const V17_KIND_CLOSED_MARKET = 8;
/**
 * True if a market account is a retired-market tombstone: CloseSlab shrinks the
 * account to the 16-byte header with kind {@link V17_KIND_CLOSED_MARKET} and keeps it
 * rent-exempt forever (anti address-reuse). A CloseSlab that returned Ok while the
 * account still has its full market layout did NOT retire it (windowed scan in progress
 * or budget re-credited) — retry with {@link planCloseSlabAttempt}.
 *
 * @param data  Raw market account bytes, or null if the account no longer exists.
 * @returns Whether the market is retired.
 * @example
 * ```ts
 * if (!isClosedMarketTombstone(info?.data ?? null)) { // retry }
 * ```
 */
export declare function isClosedMarketTombstone(data: Uint8Array | null): boolean;
/** Inputs for one CloseSlab attempt. */
export interface CloseSlabAttemptArgs {
    programId: PublicKey;
    market: PublicKey;
    /** Market collateral vault token account (owned by the vault-authority PDA). */
    vaultToken: PublicKey;
    /** CloseSlab signer (`dest`, must be the live marketauth) and its collateral ATA. */
    closer: PublicKey;
    closerDestToken: PublicKey;
    /** Live CAS value for tag 13 (asset-0 authority_epoch, current — not +1). */
    closeAuthorityEpoch: bigint;
    /**
     * Protocol leg (tag 84, amount 0 = all). Include whenever
     * protocol_fee_accrued − protocol_fee_withdrawn > 0 (tag 84 refuses when nothing is owed).
     * On P1, CloseSlab only retires if the protocol fee was claimed between attempts.
     */
    protocolFee?: {
        authority: PublicKey;
        destToken: PublicKey;
        authorityEpoch: bigint;
        owed: bigint;
    };
    /**
     * Insurance budget re-credited by a previous CloseSlab that returned Ok without
     * closing (tag 41, Resolved only, amount must be > 0, signed by the domain's
     * insurance_authority). On a stake-bound market that authority is the stake vault_auth
     * PDA, so this leg must go through the stake program's AdminWithdrawInsurance instead
     * — pass `amount: 0n` / omit and send that separately first.
     */
    insuranceRecredit?: {
        authority: PublicKey;
        destToken: PublicKey;
        amount: bigint;
        ledger?: PublicKey;
    };
    /**
     * The market has an Earn LP vault registry. CloseSlab can NEVER retire such a market:
     * the LP-vault dead-share floor (LP_VAULT_MINIMUM_LIQUIDITY) blocks the terminal scan by
     * design, so its slab rent is permanently unrecoverable. The planner throws.
     */
    hasLpVault: boolean;
    tokenProgram?: PublicKey;
}
/**
 * Plan ONE CloseSlab attempt as an ordered instruction list for a single transaction:
 *   1. tag 84 WithdrawProtocolFee(amount 0) — if a protocol fee is owed;
 *   2. tag 41 WithdrawInsurance(amount) — if a prior attempt re-credited the insurance budget;
 *   3. tag 13 CloseSlab(authority_epoch).
 * After sending, check {@link isClosedMarketTombstone}; if it is false, re-read the owed
 * protocol fee and the re-credited insurance budget and plan the next attempt.
 *
 * @param a  Attempt inputs (live-read CAS values and owed amounts).
 * @returns Ordered instructions (1–3).
 * @throws If `hasLpVault` is true (not retirable), or a leg has a non-positive amount.
 * @example
 * ```ts
 * const ixs = planCloseSlabAttempt({ programId, market, vaultToken, closer, closerDestToken, closeAuthorityEpoch,
 *   protocolFee: { authority, destToken, authorityEpoch, owed }, hasLpVault: false });
 * ```
 */
export declare function planCloseSlabAttempt(a: CloseSlabAttemptArgs): TransactionInstruction[];
