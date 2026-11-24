/**
 * Market lifecycle helpers (additive, SDK 8.0.0):
 *   - {@link buildRebalanceReduceIx} / {@link planReduceOnlyExit}: tag 44 RebalanceReduce,
 *     the owner-signed exit that works while a side is in the engine's ADL reduce-only state.
 *   - {@link planCloseSlabAttempt} / {@link isClosedMarketTombstone}: the safe CloseSlab
 *     retirement sequence (tag 84 → [tag 41] → [tag 90 to a creator-fee payee] → tag 13).
 *
 * Wire + account orders verified against the deployed wrapper `6377376a`
 * (`src/v16_program.rs`: decode arms 13/41/44/84, `handle_close_slab`,
 * `handle_withdraw_insurance`, `handle_rebalance_reduce` → `with_one_portfolio_view`).
 *
 * @module market-lifecycle
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "./spl-token-lite.js";
import {
  encodeCloseSlab,
  encodeRebalanceReduce,
  encodeWithdrawInsurance,
  encodeWithdrawProtocolFee,
} from "../abi/instructions.js";
import {
  ACCOUNTS_CLOSE_SLAB,
  ACCOUNTS_WITHDRAW_INSURANCE,
  ACCOUNTS_WITHDRAW_PROTOCOL_FEE,
  buildAccountMetas,
} from "../abi/accounts.js";
import type { AccountSpec } from "../abi/accounts.js";
import type { CreatorFeeClaimRouteV22 } from "../abi/creator-fee-payee-v22.js";
import { buildClaimCreatorFeeToPayeeIxsV22 } from "./creator-fee-payee-v22.js";
import { deriveVaultAuthority } from "./pda.js";
import { assertClassicTokenProgram } from "./stake.js";
import { parsePortfolioV17, V17_HEADER_LEN, V17_KIND_OFF } from "./slab.js";

// ============================================================================
// Tag 44 RebalanceReduce
// ============================================================================

/**
 * RebalanceReduce (tag 44): 3 accounts, from `with_one_portfolio_view(owner_must_sign = true)`:
 *   [0] owner     signer (the portfolio owner)
 *   [1] market    writable
 *   [2] portfolio writable
 */
export const ACCOUNTS_REBALANCE_REDUCE: readonly AccountSpec[] = [
  { name: "owner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
] as const;

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
export function buildRebalanceReduceIx(a: RebalanceReduceIxArgs): TransactionInstruction {
  if (a.reduceQ <= 0n) throw new Error("buildRebalanceReduceIx: reduceQ must be > 0");
  return new TransactionInstruction({
    programId: a.programId,
    keys: buildAccountMetas(ACCOUNTS_REBALANCE_REDUCE, { owner: a.owner, market: a.market, portfolio: a.portfolio }),
    data: Buffer.from(
      encodeRebalanceReduce({ portfolioId: a.portfolioId, positionEpoch: a.positionEpoch, assetIndex: a.assetIndex, reduceQ: a.reduceQ }),
    ),
  });
}

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
export function planReduceOnlyExit(
  programId: PublicKey,
  owner: PublicKey,
  market: PublicKey,
  portfolio: PublicKey,
  portfolioData: Uint8Array,
  assetIndex = 0,
): { ix: TransactionInstruction; reduceQ: bigint; side: "long" | "short" } | null {
  const p = parsePortfolioV17(portfolioData);
  const leg = p.legs.find((l) => l.active && l.assetIndex === assetIndex && l.basisPosQ !== 0n);
  if (!leg) return null;
  const reduceQ = leg.basisPosQ < 0n ? -leg.basisPosQ : leg.basisPosQ;
  return {
    ix: buildRebalanceReduceIx({ programId, owner, market, portfolio, portfolioId: p.portfolioId, positionEpoch: p.matcherPositionEpoch, assetIndex, reduceQ }),
    reduceQ,
    side: leg.basisPosQ > 0n ? "long" : "short",
  };
}

// ============================================================================
// CloseSlab retirement plan
// ============================================================================

/** Header kind written by `write_closed_market_tombstone` (`KIND_CLOSED_MARKET`). */
export const V17_KIND_CLOSED_MARKET = 8;

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
export function isClosedMarketTombstone(data: Uint8Array | null): boolean {
  if (data === null) return true;
  return data.length === V17_HEADER_LEN && data[V17_KIND_OFF] === V17_KIND_CLOSED_MARKET;
}

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
   * protocol_fee_accrued − protocol_fee_withdrawn > 0 (tag 84 refuses when nothing is owed). The planner skips it when
   * {@link CloseSlabAttemptArgs.feeBackingAtoms} is 0n (tag 84 would refuse and the fee no longer blocks CloseSlab).
   * On P1, CloseSlab only retires if the protocol fee was claimed between attempts.
   */
  protocolFee?: { authority: PublicKey; destToken: PublicKey; authorityEpoch: bigint; owed: bigint };
  /**
   * Insurance budget re-credited by a previous CloseSlab that returned Ok without
   * closing (tag 41, Resolved only, amount must be > 0, signed by the domain's
   * insurance_authority). On a stake-bound market that authority is the stake vault_auth
   * PDA, so this leg must go through the stake program's AdminWithdrawInsurance instead
   * — pass `amount: 0n` / omit and send that separately first.
   */
  insuranceRecredit?: { authority: PublicKey; destToken: PublicKey; amount: bigint; ledger?: PublicKey };
  /**
   * The market has an Earn LP vault registry. CloseSlab can NEVER retire such a market:
   * the LP-vault dead-share floor (LP_VAULT_MINIMUM_LIQUIDITY) blocks the terminal scan by
   * design, so its slab rent is permanently unrecoverable. The planner throws.
   */
  hasLpVault: boolean;
  /** Classic SPL Token program only (default); anything else (e.g. Token-2022) throws. */
  tokenProgram?: PublicKey;
  /**
   * prog#587 (#644): every asset's creator-fee pot, as read by `readCreatorFeeClaimStateV22`. CloseSlab re-books a pot
   * only when it has NO claim path (burned admin, no payee); a pot with a recorded payee stays owed and CloseSlab
   * refuses (71) until tag 90 pays it. For each leg with `owed > 0`:
   *   - route "Payee", grace NOT over: the planner adds the permissionless claim (idempotent payee-ATA create + tag 90,
   *     signed by `closer`) BEFORE CloseSlab; `payee` and `vaultMint` are required;
   *   - route "Payee", `payeeGraceOver` (prog #651: 7 x 216,000 slots after `resolved_slot`): NO tag 90 (it may not land,
   *     e.g. a payee ATA with a delegate, and would sink the tx); this CloseSlab re-books the pot to the protocol leg and
   *     returns Ok WITHOUT closing; the next attempt claims it with tag 84 and closes ({@link planPayeeGraceCloseSequenceV22});
   *   - route "AdminSigned": the planner THROWS (only the live asset_admin can claim; CloseSlab would refuse 71), unless
   *     `feeBackingAtoms` is set and the protocol and payee claims (planned first, in any leg order) use it all up;
   *   - route "Refused": nothing to plan (CloseSlab re-books it to the protocol leg).
   * Omit to keep the pre-#587 plan (no creator-leg handling).
   */
  creatorFees?: readonly CloseSlabCreatorFeeLegV22[];
  /**
   * Market has a secondary collateral mint (`UpdateBaseUnitMints`, tag 60). `handle_close_slab` then reads two more
   * writable accounts (indices 6, 7: secondary vault token + the closer's secondary-mint ATA) and fails
   * NotEnoughAccountKeys without them (#381). Omit on single-collateral markets.
   */
  secondaryCollateral?: { vault: PublicKey; destAta: PublicKey };
  /**
   * The primary collateral mint, appended after the secondary pair (index 8, else 6). The handler requires it
   * (writable) only when CloseSlab burns/escheats unbudgeted insurance residue; surplus accounts are ignored, so pass it
   * whenever residue may exist.
   */
  residueMint?: PublicKey;
  /**
   * Wrapped-SOL (native) primary mint only: native residue cannot be burned, so the handler escheats it to the asset-0
   * insurance authority's ATA, read at `residueMint` index + 1 (:26352, writable, must equal that canonical ATA).
   * Requires `residueMint`.
   */
  residueEscheatDest?: PublicKey;
  /** prog #651: the payee grace is over (`readCreatorFeeClaimStateV22(data, i, nowSlot).payeeGraceOver`). Default false. */
  payeeGraceOver?: boolean;
  /**
   * The unbudgeted insurance pool that backs the fee legs, as CloseSlab computes it:
   * `insurance − source_insurance_credit_reserved_total − insurance_domain_budget_remaining_total − rent_unrouted`
   * (saturating). When it is `0n`, CloseSlab no longer refuses for owed fees (`min(outstanding, pool) > 0` is false), but
   * tag 84 (transfer 0 → EngineLockActive) and tag 90 (no surplus) both refuse, and in the same transaction they would
   * sink the close. So at `0n` the planner adds no tag 84 / tag 90 and does not throw for an AdminSigned pot.
   * Both claims spend this pool in plan order (tag 84 takes `min(owed, pool)`, tag 90 is an exact debit), so the planner
   * spends it as a budget: tag 84 first, then each payee claim capped at what is left; once nothing is left the remaining
   * legs are treated as at `0n`. Omit to keep the previous behaviour (every owed leg planned, no cap).
   */
  feeBackingAtoms?: bigint;
}

/** One asset's creator-fee leg for {@link planCloseSlabAttempt}. */
export interface CloseSlabCreatorFeeLegV22 {
  assetIndex: number;
  route: CreatorFeeClaimRouteV22;
  /** Owed atoms (asset 0 includes the legacy market-wide counter). */
  owed: bigint;
  /** Current `authority_epoch` of this asset (tag 90 checks it). */
  authorityEpoch: bigint;
  /** The recorded payee wallet (route "Payee"). */
  payee?: PublicKey;
  /** The market's collateral mint (route "Payee"). */
  vaultMint?: PublicKey;
  /**
   * Atoms to claim; default `owed`. Lower it only when the insurance surplus no longer backs the whole pot (tag 90
   * refuses an amount above it; CloseSlab then treats the unbacked remainder as unpayable). With
   * {@link CloseSlabAttemptArgs.feeBackingAtoms} set it is ignored (still validated): the planner claims exactly
   * `min(owed, backing left after tag 84 and earlier payee claims)`, since any less leaves backed atoms owed and CloseSlab
   * refuses 71.
   */
  amount?: bigint;
}

/**
 * Plan ONE CloseSlab attempt as an ordered instruction list for a single transaction:
 *   1. tag 84 WithdrawProtocolFee(amount 0) — if a protocol fee is owed;
 *   2. tag 41 WithdrawInsurance(amount) — if a prior attempt re-credited the insurance budget;
 *   3. per creator-fee leg routed to a payee with a non-zero pot: create the payee ATA (idempotent) + tag 90 to it;
 *   4. tag 13 CloseSlab(authority_epoch).
 * After sending, check {@link isClosedMarketTombstone}; if it is false, re-read the owed
 * protocol fee and the re-credited insurance budget and plan the next attempt.
 *
 * @param a  Attempt inputs (live-read CAS values and owed amounts).
 * After the payee grace (prog #651) a payee pot is NOT claimed here: this attempt's CloseSlab re-books it (Ok, not closed);
 * use {@link planPayeeGraceCloseSequenceV22} for the whole re-book → tag 84 → close sequence.
 *
 * @returns Ordered instructions (CloseSlab last).
 * @throws If `hasLpVault` is true (not retirable), a creator-fee leg is owed under a LIVE asset_admin (only that key can
 *   claim it; not thrown when `feeBackingAtoms` is 0n or the other claims use it all up), `feeBackingAtoms` is negative, a payee leg lacks `payee` / `vaultMint`, or a claim amount is non-positive or above `owed`.
 * @example
 * ```ts
 * const ixs = planCloseSlabAttempt({ programId, market, vaultToken, closer, closerDestToken, closeAuthorityEpoch,
 *   protocolFee: { authority, destToken, authorityEpoch, owed }, hasLpVault: false });
 * ```
 */
export function planCloseSlabAttempt(a: CloseSlabAttemptArgs): TransactionInstruction[] {
  if (a.hasLpVault) {
    throw new Error(
      "planCloseSlabAttempt: this market has an Earn LP vault — CloseSlab can never retire it (LP-vault dead-share floor, by design). Its slab rent is unrecoverable; do not promise reclaim.",
    );
  }
  const tokenProgram = a.tokenProgram ?? TOKEN_PROGRAM_ID;
  try {
    assertClassicTokenProgram(tokenProgram);
  } catch (e) {
    throw new Error(`planCloseSlabAttempt: ${(e as Error).message}`);
  }
  if (a.feeBackingAtoms !== undefined && a.feeBackingAtoms < 0n) {
    throw new Error(`planCloseSlabAttempt: feeBackingAtoms must be >= 0 (got ${a.feeBackingAtoms})`);
  }
  // Tag 84 and tag 90 spend the same pool, in plan order. Once nothing is left, CloseSlab no longer refuses for the
  // remaining legs, and any further tag 84 / tag 90 would fail and sink the tx. `undefined` = not tracked (no cap).
  let backing = a.feeBackingAtoms;
  const [vaultAuthority] = deriveVaultAuthority(a.programId, a.market);
  const ixs: TransactionInstruction[] = [];
  if (a.protocolFee && a.protocolFee.owed > 0n && backing !== 0n) {
    // amount 0 = all: the program transfers min(owed, pool, vault).
    if (backing !== undefined) backing -= a.protocolFee.owed < backing ? a.protocolFee.owed : backing;
    ixs.push(new TransactionInstruction({
      programId: a.programId,
      keys: buildAccountMetas(ACCOUNTS_WITHDRAW_PROTOCOL_FEE, {
        authority: a.protocolFee.authority, market: a.market, destToken: a.protocolFee.destToken,
        vaultToken: a.vaultToken, vaultAuthority, tokenProgram,
      }),
      data: Buffer.from(encodeWithdrawProtocolFee({ amount: 0n, authorityEpoch: a.protocolFee.authorityEpoch })),
    }));
  }
  if (a.insuranceRecredit && a.insuranceRecredit.amount > 0n) {
    const keys = buildAccountMetas(ACCOUNTS_WITHDRAW_INSURANCE, {
      authority: a.insuranceRecredit.authority, market: a.market, destToken: a.insuranceRecredit.destToken,
      vaultToken: a.vaultToken, vaultAuthority, tokenProgram,
    });
    if (a.insuranceRecredit.ledger) keys.push({ pubkey: a.insuranceRecredit.ledger, isSigner: false, isWritable: true });
    ixs.push(new TransactionInstruction({
      programId: a.programId, keys,
      data: Buffer.from(encodeWithdrawInsurance({ amount: a.insuranceRecredit.amount })),
    }));
  }
  // Payee legs first, whatever their order in `creatorFees`: they may drain the pool, and then an AdminSigned pot no
  // longer makes CloseSlab refuse (min(outstanding, 0) = 0). The AdminSigned check runs after the loop.
  let adminOwed: CloseSlabCreatorFeeLegV22 | undefined;
  for (const leg of a.creatorFees ?? []) {
    if (leg.owed <= 0n || leg.route === "Refused") continue;
    if (leg.route === "AdminSigned") {
      adminOwed ??= leg;
      continue;
    }
    if (backing === 0n) continue;
    // prog #651: after the grace this CloseSlab re-books the payee pot itself; a tag 90 that cannot land would sink the tx.
    if (a.payeeGraceOver) continue;
    if (!leg.payee || !leg.vaultMint) {
      throw new Error(`planCloseSlabAttempt: asset ${leg.assetIndex} routes its creator fee to a payee; pass payee and vaultMint`);
    }
    let amount = leg.amount ?? leg.owed;
    if (amount <= 0n || amount > leg.owed) {
      throw new Error(`planCloseSlabAttempt: asset ${leg.assetIndex} creator-fee claim ${amount} must be in (0, ${leg.owed}]`);
    }
    // tag 90 is an exact debit (no partial fill). With the pool known, claim exactly min(owed, backing left): less would
    // leave backed atoms owed and CloseSlab refuses 71 (:26287-26291); more would make tag 90 refuse.
    if (backing !== undefined) {
      amount = leg.owed < backing ? leg.owed : backing;
      backing -= amount;
    }
    ixs.push(...buildClaimCreatorFeeToPayeeIxsV22({
      programId: a.programId, market: a.market, caller: a.closer, assetIndex: leg.assetIndex, payee: leg.payee,
      vaultMint: leg.vaultMint, vaultToken: a.vaultToken, amount, authorityEpoch: leg.authorityEpoch,
    }));
  }
  if (adminOwed && backing !== 0n) {
    throw new Error(
      `planCloseSlabAttempt: asset ${adminOwed.assetIndex} owes ${adminOwed.owed} creator-fee atoms under a live asset_admin. Only that key can claim them (tag 90); CloseSlab refuses (71) until it does.`,
    );
  }
  const closeKeys = buildAccountMetas(ACCOUNTS_CLOSE_SLAB, {
    dest: a.closer, slab: a.market, vault: a.vaultToken, vaultAuthority, destAta: a.closerDestToken, tokenProgram,
  });
  if (a.secondaryCollateral) {
    closeKeys.push(
      { pubkey: a.secondaryCollateral.vault, isSigner: false, isWritable: true },
      { pubkey: a.secondaryCollateral.destAta, isSigner: false, isWritable: true },
    );
  }
  if (a.residueEscheatDest && !a.residueMint) {
    throw new Error("planCloseSlabAttempt: residueEscheatDest requires residueMint");
  }
  if (a.residueMint) closeKeys.push({ pubkey: a.residueMint, isSigner: false, isWritable: true });
  if (a.residueEscheatDest) closeKeys.push({ pubkey: a.residueEscheatDest, isSigner: false, isWritable: true });
  ixs.push(new TransactionInstruction({
    programId: a.programId,
    keys: closeKeys,
    data: Buffer.from(encodeCloseSlab(a.closeAuthorityEpoch)),
  }));
  return ixs;
}

/**
 * prog #651: the close sequence once the creator-fee payee grace is over and a payee pot is still unpaid. Two transactions,
 * sent in order (each one is atomic; check {@link isClosedMarketTombstone} after each):
 *   1. `planCloseSlabAttempt(a)` with `payeeGraceOver: true`: [tag 84 if a protocol fee is already owed] [tag 41] CloseSlab, which
 *      re-books the unpaid payee pot (and any other orphaned leg) to the protocol leg and returns Ok WITHOUT closing;
 *   2. tag 84 `WithdrawProtocolFee(amount 0 = all)` for the re-booked atoms, then CloseSlab, which closes.
 * If transaction 1 already closed the market (someone paid the payee in between, so nothing was re-booked), skip 2.
 * Tag 84 is signed by the protocol fee authority, so `a.protocolFee` (authority, destToken, authorityEpoch) is required;
 * `authorityEpoch` is the market-wide protocol-fee lane, which neither CloseSlab nor tag 84 advances.
 *
 * @param a  The attempt inputs; `payeeGraceOver` is forced true.
 * @returns `[tx1, tx2]` instruction lists.
 * @throws If `a.protocolFee` is missing, or anything {@link planCloseSlabAttempt} throws.
 * @example
 * ```ts
 * const [rebook, close] = planPayeeGraceCloseSequenceV22({ ...args, protocolFee: { authority, destToken, authorityEpoch, owed } });
 * ```
 */
export function planPayeeGraceCloseSequenceV22(a: CloseSlabAttemptArgs): [TransactionInstruction[], TransactionInstruction[]] {
  if (!a.protocolFee) {
    throw new Error("planPayeeGraceCloseSequenceV22: after the grace the payee pot is re-booked to the protocol leg; pass protocolFee so tag 84 can claim it");
  }
  const rebooked = (a.creatorFees ?? []).filter((l) => l.route === "Payee").reduce((t, l) => t + (l.owed > 0n ? l.owed : 0n), 0n);
  if (rebooked === 0n) {
    throw new Error("planPayeeGraceCloseSequenceV22: no unpaid payee pot to re-book; use planCloseSlabAttempt");
  }
  const tx1 = planCloseSlabAttempt({ ...a, payeeGraceOver: true });
  // tx1's tag 84 (if any) took the protocol leg owed before; after the re-book the leg owes exactly the payee pots.
  // tx1's tag 84 spent min(owed, pool) of the fee backing; tx2 sees only the rest.
  const owed1 = a.protocolFee.owed > 0n ? a.protocolFee.owed : 0n;
  const backing2 = a.feeBackingAtoms === undefined || a.feeBackingAtoms < 0n
    ? a.feeBackingAtoms
    : a.feeBackingAtoms - (owed1 < a.feeBackingAtoms ? owed1 : a.feeBackingAtoms);
  const tx2 = planCloseSlabAttempt({
    ...a,
    feeBackingAtoms: backing2,
    payeeGraceOver: true,
    creatorFees: [],
    insuranceRecredit: undefined,
    protocolFee: { ...a.protocolFee, owed: rebooked },
  });
  return [tx1, tx2];
}
