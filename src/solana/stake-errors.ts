// Web3-free home of the stake program id strings and the stake error table. `stake.ts`
// re-exports both unchanged; `abi/errors.ts` imports them from here so parsing errors does not
// pull @solana/web3.js into a bundle.

import { PROGRAM_IDS_DEVNET_V22 } from '../config/program-id-strings.js';

/**
 * Known stake program addresses per network.
 *
 * devnet (SDK 9.0.0-candidate): the v2.2 fresh devnet stake program `7JrgAUHi4PxaRv5JKHoGAxodDFbozYexpERei66Xgq4V`
 * (= PROGRAM_IDS_DEVNET_V22.vault; pinned as STAKE_PROGRAM_ID by the v2.2 wrapper 6kpg2wi7…). The previous
 * default `VmpVUArR…` belongs to the v1 / close-only ETDLAdi… world — see PROGRAM_IDS_DEVNET_V1.
 * The history below is kept as a record.
 *
 * devnet: UPDATED from the SUPERSEDED `51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ`
 * (the old `percolator-vault@eb3ebe8` deployment) to the FRESH v17 devnet triple's
 * stake address `VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w`, deployed 2026-07-17
 * from `~/v17/percolator-stake@1e08d35` (hash `0e9c2572...`), cross-verified against
 * `PROGRAM_IDS_V17.vault` in `src/config/program-ids.ts` ("v17 vault — deployed
 * devnet 2026-07-17, hash-verified"). This is a NEW address (not an in-place upgrade
 * of the old 51CeUNpb... address, which is now superseded and should not be used for
 * new integrations) and already runs the ADOPTED `percolator-stake` lineage this
 * module targets — see the module doc above.
 *
 * mainnet: UNVERIFIED as *ours* — no confirmed mainnet stake/vault deployment exists
 * in any v17 planning doc (Percolator mainnet is still in prep). Do not treat this as
 * ground truth; prefer the STAKE_PROGRAM_ID env override on mainnet until DevOps
 * confirms.
 *
 * IMPORTANT: "unverified" does NOT mean "inert". Checked against mainnet RPC on
 * 2026-08-16, DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F is a LIVE, executable
 * BPFLoaderUpgradeable program. That is precisely why getStakeProgramId() must not
 * silently default to mainnet: an unconfigured browser caller would have resolved to
 * a real, executing mainnet program rather than failing safe.
 */
export const STAKE_PROGRAM_IDS = {
  devnet: PROGRAM_IDS_DEVNET_V22.vault, // 7JrgAUHi… — v2.2 fresh devnet stake (v5); see program-ids.ts
  mainnet: 'DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F',
} as const;
Object.freeze(STAKE_PROGRAM_IDS);

// ═══════════════════════════════════════════════════════════════
// Error hint table — StakeError (src/error.rs, ADOPTED percolator-stake lineage)
// ═══════════════════════════════════════════════════════════════

/**
 * User-facing hint text for `StakeError` custom program error codes
 * (`ProgramError::Custom(code)`, `percolator-stake/src/error.rs`).
 *
 * Codes 0-24 mirror `error.rs`'s on-chain `error_hint()` fallback text.
 * Codes 25-27 (#242 cooldown-increase timelock) and 28
 * (`DepositBelowMinimumLiquidity`, N7 anti-inflation hardening) are new in
 * the ADOPTED lineage — 28 is the entry this table exists to add. NOTE:
 * the on-chain `error_hint()` itself has a gap (falls through to "Unknown
 * error" for 25-27 despite them being named enum variants); the hints below
 * for 25-27 are derived from `error.rs`'s doc comments, not copied from a
 * (missing) on-chain string.
 */
export const STAKE_ERRORS: Record<number, string> = {
  0: "Pool already initialized — use a different slab address or check if InitPool was already called",
  1: "Pool not initialized — call InitPool first to create the stake pool",
  2: "Unauthorized — you must be the pool admin to perform this action",
  3: "Cooldown not elapsed — wait for the cooldown period before withdrawing again",
  4: "Insufficient LP tokens — you don't have enough LP tokens to burn",
  5: "Zero amount — deposit and withdrawal amounts must be greater than zero",
  6: "Arithmetic overflow — pool values exceeded u64 bounds, operation blocked",
  7: "Invalid mint — LP mint doesn't match the pool's LP mint",
  8: "Market is resolved — no new deposits allowed after resolution",
  9: "Deposit cap exceeded — pool has reached its maximum deposit limit",
  10: "Invalid PDA — account is not a valid PDA for the expected seed",
  11: "Deprecated (was AdminAlreadyTransferred) — code kept for stable numbering; should not occur",
  12: "Deprecated (was AdminNotTransferred) — code kept for stable numbering; should not occur",
  13: "Insufficient vault balance — vault doesn't have enough collateral for this withdrawal",
  14: "Invalid percolator program — percolator program ID doesn't match",
  15: "CPI to percolator failed — the cross-program invoke to percolator failed",
  16: "Invalid account — account is not owned by the expected program or is not writable",
  17: "Pool mode mismatch — operation not valid for this pool's mode (e.g., AccrueFees on insurance pool)",
  18: "Withdrawal blocked — would breach high-water mark floor protection",
  19: "Tranches not enabled — senior/junior tranches are not enabled on this pool",
  20: "Junior balance insufficient — junior tranche doesn't have enough balance for this operation",
  21: "Wrong tranche — deposit already belongs to a different tranche",
  22: "Zero shares minted — deposit amount too small to mint any LP at the current share price; increase the amount",
  23: "No pending admin — there is no admin transfer to accept (propose one first, or it was cancelled)",
  24: "Insurance loss outstanding — junior tranche deposits are paused until the flushed insurance is returned (total_flushed > total_returned)",
  25: "Cooldown increase requires timelock — a cooldown_slots INCREASE must go through ProposeCooldownIncrease -> wait -> CommitCooldownIncrease, not UpdateConfig (decreases are still immediate via UpdateConfig)",
  26: "Timelock not elapsed — CommitCooldownIncrease was called before the required timelock window had passed since ProposeCooldownIncrease; LP holders are still inside their exit window",
  27: "No pending cooldown proposal — CommitCooldownIncrease / CancelCooldownIncrease called with no active ProposeCooldownIncrease proposal outstanding",
  28: "Deposit below minimum liquidity — the first deposit into an EMPTY pool, senior tranche or junior tranche must exceed MINIMUM_LIQUIDITY (1,000 atoms) so a permanent dead-share floor can be locked for that sub-pool (N7 anti-inflation hardening; each sub-pool locks its own floor); nothing is locked on refusal; deposit a larger amount",
  // percolator-stake `NoRealLpHolders` = 29 (src/error.rs:93, raised in processor.rs:2960 by AccrueFees): the pool's LP supply is only
  // the N7 dead-share floor (real_lp_supply() == 0: total_lp_supply minus the per-sub-pool dead floors), so there is nobody to pay fees to.
  // Nothing is booked; the fee tokens stay in the vault until the first accrual after a real staker deposits.
  29: "No real LP holders yet: nobody has staked in this pool, so there are no fees to share. Nothing was changed. Fees are booked after the first real deposit.",
  30: "Market not terminal (F-9) — RecoverTerminalInsurance (tag 29) needs the wrapper market Resolved or a CloseSlab tombstone, and a non-zero amount needs Resolved (not Closed); AdminCloseSlab (tag 30) needs Resolved. While Live, use RecoverFlushedInsurance (tag 23)",
  32: "Unsupported wrapper layout (F-9, NOT retryable) — the bound wrapper market account is not the layout this stake program pins (magic, VERSION 18, kind, minimum length, a known mode byte), so its engine mode cannot be trusted. RecoverTerminalInsurance (29), AdminCloseSlab (30) and the mode-0 Deposit/DepositJunior path refuse. A wrapper layout bump needs a coordinated stake upgrade; retrying will not help",
  31: "Nothing to recover (F-9) — RecoverTerminalInsurance moved no tokens and booked nothing (amount 0, no stray account, no unbooked vault surplus). Keepers should treat this as done",
};
Object.freeze(STAKE_ERRORS);
