/**
 * Percolator v17 program error definitions.
 *
 * Source: v16_program.rs PercolatorError enum (lines 174-226 in v17 wrapper).
 * Ordinals 0-29 = toly base errors; 30-41 = fork LP-vault; 42-46 = fork NFT/B-3;
 * 47-48 = insurance withdrawal policy (F-1/F-2); 49 = EngineInsufficientInitialMargin;
 * 50 = LpVaultDepositBelowMinimumLiquidity (N7 dead-share floor); 51 =
 * FeeSplitFloorViolation (creator/LP/insurance split floor, meaning narrowed to
 * tag 86 — see its entry); 52-53 = fee-collection split; 54-60 =
 * load_bound_stake_pool diagnostics; 61 = AssetSlotAlreadyConfigured;
 * 62 = CreatorFeeOverClaim (creator fee claim, tag 90 — NOT yet deployed).
 *
 * Ordinals 0-61 read directly off the PercolatorError enum in
 * percolator-prog@10acb5ae, which is the source deployed to devnet wrapper
 * DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj (hash-verified
 * 6b2fda2363352aba0ef88abde0d398f9dd477b1208507e7e8393586ed5458931).
 * Ordinal 49 is CONFIRMED against that enum; an earlier "discriminant
 * tentative" TODO here is resolved.
 *
 * INVARIANT: ordinals must NOT be reordered (Rust enum discriminants are
 * sequential from 0). CI asserts each ordinal in tests/v16_kani.rs.
 *
 * v17 breaking changes vs v12.x:
 *   - Errors 0-29 have completely different names and semantics from v12.
 *   - Errors 30-41 are LP-vault (moved from v12.x range 30-41 to same ordinals).
 *   - Errors 42-46 are NFT/B-3 (new in v17).
 *   - v12.x errors 28-65 are entirely removed.
 */
import type { PublicKey } from "@solana/web3.js";
import { PROGRAM_IDS, PROGRAM_IDS_DEVNET_V1, PROGRAM_IDS_DEVNET_V22, NFT_PROGRAM_IDS } from "../config/program-ids.js";
import { STAKE_ERRORS, STAKE_PROGRAM_IDS } from "../solana/stake.js";
import { STAKE_ERRORS_V5, STAKE_ERROR_NAMES } from "./v22-stake.js";
import { MATCHER_V2_ERRORS } from "./matcher-v2.js";
import { NFT_ERRORS, SPL_TOKEN_ERRORS } from "./nft-errors.js";

export interface ErrorInfo {
  name: string;
  hint: string;
}

export const PERCOLATOR_ERRORS: Record<number, ErrorInfo> = {
  // ── toly base errors (0-29) ─────────────────────────────────────────────────
  0: {
    name: "InvalidMagic",
    hint: "Account magic mismatch — not a v17 percolator account. Check the market group address.",
  },
  1: {
    name: "InvalidVersion",
    hint: "Account version mismatch. Expected VERSION=17 (WrapperConfigV16 576B after the fee-collection split; 496B before it). The program may need upgrading, or the account predates the protocol-fee redeploy.",
  },
  2: {
    name: "AlreadyInitialized",
    hint: "Account is already initialized. Use a different account or check the market group address.",
  },
  3: {
    name: "NotInitialized",
    hint: "Account is not initialized. Run InitMarket first.",
  },
  4: {
    name: "InvalidAccountKind",
    hint: "Wrong account kind (market group vs portfolio vs insurance-ledger). Check account addresses.",
  },
  5: {
    name: "InvalidAccountLen",
    hint: "Account data length is incorrect. The account may be from a different program version.",
  },
  6: {
    name: "ExpectedSigner",
    hint: "Missing required signature. Ensure the correct authority wallet is signing.",
  },
  7: {
    name: "ExpectedWritable",
    hint: "Account must be marked writable. This is likely a client-side account-list bug.",
  },
  8: {
    name: "Unauthorized",
    hint: "Not authorized for this operation. Check marketauth or asset_admin authority.",
  },
  9: {
    name: "InvalidInstruction",
    // Q-1 (2026-10-11): the wrapper returns 9 for many argument checks, not only an unknown tag. On a
    // trade (tag 10 TradeCpi, 6 TradeNoCpi, 66/67 batch) the reachable causes in wrapper RC 6c078a0e are:
    // signed fee_bps < trade_fee_base_bps; fee_bps > the market's max_trading_fee_bps; base + the
    // matcher's requested fee > fee_bps (or > the protocol cap); the fill missed limit_price; and a
    // 5th open position on a cap-4 portfolio. Use getContextualErrorHint(9, { action: "trade" }) for
    // the trade wording and computeTradeFeeBpsToSignV22() for the fee to sign.
    hint: "The program refused this instruction's arguments. On a trade: your max fee is below the market's base fee plus the matcher's fee (or above the market maximum), the fill missed your limit price, or the trade would open a 5th position. Otherwise an argument is out of range or the SDK and program versions are mismatched.",
  },
  10: {
    name: "InvalidMint",
    hint: "Token mint does not match the market's collateral mint.",
  },
  11: {
    name: "InvalidTokenAccount",
    hint: "Token account is invalid. Ensure you have a correctly configured ATA.",
  },
  12: {
    name: "InvalidVaultAccount",
    hint: "Vault account is invalid or does not match the market vault PDA.",
  },
  13: {
    name: "InvalidTokenProgram",
    hint: "Invalid token program. Expected SPL Token or Token-2022.",
  },
  14: {
    name: "EngineInvalidConfig",
    hint: "Engine config is invalid. A required config field is missing or out of range.",
  },
  15: {
    name: "EngineArithmeticOverflow",
    hint: "Arithmetic overflow in engine calculation. Try a smaller amount or position size.",
  },
  16: {
    name: "EngineProvenanceMismatch",
    hint: "Portfolio provenance mismatch — the portfolio was not created for this market group.",
  },
  17: {
    name: "EngineHiddenLeg",
    hint: "Engine detected a hidden leg (unexpected zero-size outstanding position). Internal error.",
  },
  18: {
    name: "EngineInvalidLeg",
    hint: "Engine received an invalid trade leg. Check asset_index and size.",
  },
  19: {
    name: "EngineStale",
    // P-2 (2026-10-11): a withdrawal from an account with open positions refuses with 19 on v2.2; the
    // old "mark price has not been updated" text sent users to wait for a price that was never the
    // problem. getContextualErrorHint(19, { action: "withdraw", openLegs }) gives the precise line.
    hint: "Positions on this account need to be brought current first. If you are withdrawing with open positions, close them first; otherwise a crank must catch the market up — retry shortly.",
  },
  20: {
    name: "EngineBStale",
    hint: "Engine B-side (batch) position stale. The batch crank needs to run.",
  },
  21: {
    name: "EngineLockActive",
    hint: "Engine lock is active — a close or recovery is in progress. Wait for it to complete.",
  },
  22: {
    name: "EngineNonProgress",
    hint: "Engine operation made no progress. This usually means a crank was called with nothing to do.",
  },
  23: {
    name: "EngineRecoveryRequired",
    hint: "Engine requires a recovery crank before normal operations can resume.",
  },
  24: {
    name: "EngineCounterOverflow",
    hint: "Engine counter overflow — too many assets or positions. Contact support.",
  },
  25: {
    name: "EngineCounterUnderflow",
    hint: "Engine counter underflow — attempted to decrement a zero counter. Internal error.",
  },
  26: {
    name: "OracleInvalid",
    hint: "Oracle data is invalid. Check the oracle account is a valid Pyth PriceUpdateV2 feed.",
  },
  27: {
    name: "OracleStale",
    hint: "Oracle price is stale. Wait for the oracle to publish a fresh price.",
  },
  28: {
    name: "OracleConfTooWide",
    // Wrapper `OracleConfTooWide` (percolator-prog v16_program.rs:11285, :11414): the Pyth confidence interval exceeds the
    // market's `conf_filter_bps`. Plain user text; nothing moved.
    hint: "The price feed is too uncertain right now, so the market is not accepting this action. Nothing was changed. Wait a moment and try again.",
  },
  29: {
    name: "InvalidOracleKey",
    // Wrapper `InvalidOracleKey` (percolator-prog v16_program.rs:11274, :11370, :11433): the price account (or Pyth feed id)
    // passed with the instruction is not the one this market is configured to use. Plain user text; nothing moved.
    hint: "The price account sent with this transaction is not the one this market uses. Nothing was changed. Refresh the page and try again; if it keeps happening, the app is out of date.",
  },
  // ── Fork LP-vault errors (30-41) ─────────────────────────────────────────────
  30: {
    name: "LpVaultAlreadyExists",
    hint: "LP vault already created for this asset domain. Each domain can only have one LP vault.",
  },
  31: {
    name: "LpVaultNotFound",
    hint: "LP vault does not exist for this asset domain. Call CreateLpVault (tag 74) first.",
  },
  32: {
    name: "LpVaultPaused",
    hint: "LP vault is paused. Wait for the vault to be unpaused by the admin.",
  },
  33: {
    name: "LpVaultSharesOutstanding",
    hint: "Cannot close LP vault — shares are still outstanding. All redeemers must exit first.",
  },
  34: {
    name: "LpVaultZeroAmount",
    hint: "LP vault deposit or redemption amount must be greater than zero.",
  },
  35: {
    name: "LpVaultInsufficientShares",
    hint: "Insufficient LP vault shares to redeem. Check your share balance.",
  },
  36: {
    name: "LpVaultCooldownActive",
    hint: "LP vault redemption cooldown is still active. Wait for the cooldown period to elapse.",
  },
  37: {
    name: "LpVaultOiReservationViolated",
    hint: "LP vault deposit would violate the OI reservation limit. The vault has insufficient capacity.",
  },
  38: {
    name: "LpVaultNoFeesToCrank",
    hint: "No new fees to distribute to the LP vault. Wait for more trading activity. On a LIVE bound vault, bundle tag 78 before 75/77 ONLY when fees are harvestable (otherwise the bundle fails with 38; without it a harvestable backlog fails with 84). On a Resolved terminal-flat bound market 78 is a no-op success.",
  },
  39: {
    name: "LpVaultSupplyMismatch",
    hint: "LP vault share supply / capital mismatch. Internal invariant violation — please report.",
  },
  40: {
    name: "LpVaultAuthorityMismatch",
    hint: "LP vault authority mismatch. The vault belongs to a different market group or admin.",
  },
  41: {
    name: "LpVaultZeroSharesMinted",
    hint: "First LP deposit minted zero shares (capital too small relative to existing NAV). Deposit a larger amount.",
  },
  // ── Fork NFT / B-3 errors (42-46) ────────────────────────────────────────────
  42: {
    name: "NftRegistryNotFound",
    hint: "NFT registry not found. Call SetNftProgramId (tag 73) to register the percolator-nft program first.",
  },
  43: {
    name: "NftPortfolioNotTransferable",
    hint: "Portfolio is not in a transferable state. Ensure the portfolio has no open positions or pending operations.",
  },
  44: {
    name: "NftTransferSelfOrZero",
    hint: "Cannot transfer portfolio to the zero address or to the current owner.",
  },
  45: {
    name: "NftInvalidMintAuthority",
    hint: "NFT mint authority mismatch. The percolator-nft program may not match the registered NFT program ID.",
  },
  46: {
    name: "NftPortfolioProvenance",
    hint: "Portfolio provenance mismatch for NFT transfer. The portfolio was not created for this market group.",
  },
  // ── Insurance withdrawal policy enforcement (F-1 / F-2) (47-48) ─────────────
  // Source: v16_program.rs PercolatorError variants appended after NftPortfolioProvenance.
  47: {
    name: "InsuranceWithdrawCooldownActive",
    hint: "Insurance withdrawal cooldown is still active (F-1). Wait for the cooldown period to elapse before withdrawing.",
  },
  48: {
    name: "InsuranceWithdrawCeilingExceeded",
    hint: "Insurance withdrawal would exceed the deposits-only ceiling (F-2). Reduce the withdrawal amount or wait for more deposits.",
  },
  // ── EngineInsufficientInitialMargin (49) ─────────────────────────────────────
  // Ordinal 49 CONFIRMED against the PercolatorError enum in
  // percolator-prog@10acb5ae (appended after InsuranceWithdrawCeilingExceeded=48,
  // before LpVaultDepositBelowMinimumLiquidity=50). This is a distinct error for
  // initial-margin failure, previously collapsed into the opaque
  // EngineInvalidConfig=14.
  49: {
    name: "EngineInsufficientInitialMargin",
    hint: "Insufficient initial margin for this trade or position open. Deposit more collateral or reduce the position size.",
  },
  // ── BUG-2 / N7: LP vault genesis dead-share floor (50) ───────────────────
  // Source: v16_program.rs PercolatorError variant appended after
  // EngineInsufficientInitialMargin=49 (confirmed on-chain 2026-07-16 against
  // fresh wrapper DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj, commit a3cb4390).
  50: {
    name: "LpVaultDepositBelowMinimumLiquidity",
    hint: "The LP vault's true first deposit must exceed LP_VAULT_MINIMUM_LIQUIDITY so a permanent dead-share floor can be locked (N7 anti-inflation hardening). Increase the first deposit amount.",
  },
  // ── Fee-split floor enforcement (51) ──────────────────────────────────────
  // Source: v16_program.rs PercolatorError variant appended after
  // LpVaultDepositBelowMinimumLiquidity=50 (confirmed on-chain 2026-07-16
  // against fresh wrapper DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj, commit
  // a3cb4390).
  //
  // ⚠ MEANING NARROWED as of percolator-prog@10acb5ae (devnet 2026-07-22).
  // This code originally came from `policy_v16::fee_split_floor_ok`, a
  // TOLERANCE-based check on the two-rate (trade_fee_base_bps +
  // backing_fee_bps) split raised from UpdateBackingFeePolicy (tag 51) /
  // UpdateTradeFeePolicy. That function is RETIRED and has no live call sites.
  // The ordinal is REUSED (not vacated — it is wire-visible) and is now raised
  // only by `policy_v16::validate_fee_split` from UpdateFeeSplit (tag 86),
  // EXACTLY and with no tolerance, against the bps floors below.
  51: {
    name: "FeeSplitFloorViolation",
    hint: "UpdateFeeSplit (tag 86) shares violate the on-chain floors: creator_share_bps must be <= 3600 (45% of the 8000 remainder), lp_share_bps >= 3200 (40%), insurance_share_bps >= 1200 (15%). Enforced exactly, with no rounding tolerance. Use validateFeeSplit() before sending. Note the shares must ALSO sum to exactly 8000 — that separate failure is Custom(52) FeeSplitSumInvalid.",
  },
  // ── Fee-collection split (52-53) ──────────────────────────────────────────
  // Source: v16_program.rs PercolatorError variants appended after
  // FeeSplitFloorViolation=51 on percolator-prog
  // feat/protocol-fee-taker-only@2b3a6a65. DEPLOYED as of 2026-07-22: the
  // devnet wrapper DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj now carries
  // percolator-prog@10acb5ae (hash 6b2fda2363352aba0ef88abde0d398f9dd477b12
  // 08507e7e8393586ed5458931), so 52-61 are observable on-chain.
  52: {
    name: "FeeSplitSumInvalid",
    hint: "UpdateFeeSplit (tag 86) shares do not sum to exactly FEE_SHARE_TOTAL_BPS (8000 = 10_000 - PROTOCOL_FEE_BPS). creator_share_bps + lp_share_bps + insurance_share_bps must equal 8000. Use validateFeeSplit() before sending.",
  },
  53: {
    name: "NoInsuranceReserveToClaim",
    hint: "WithdrawInsuranceReserveToStake (tag 87) was called with nothing available (insurance_reserve_accrued_atoms == insurance_reserve_withdrawn_atoms). Not an error condition for a keeper — the leg is simply already fully pushed; back off and retry after more trade volume.",
  },
  // ── load_bound_stake_pool diagnostics (54-60) ─────────────────────────────
  // Source: v16_program.rs, same branch. These seven previously ALL returned
  // Unauthorized, which left a keeper unable to tell "this market never bound a
  // pool" from "someone pointed a forged pool at us". Each failure of tag 87's
  // destination-resolution now has its own code.
  //
  // ⚠ ORDINAL 55 CHANGED MEANING during development: it was briefly
  // StakePoolAssetAdminNotBurned, an ineffective mitigation that has been
  // removed. That variant existed only on an unmerged branch and was NEVER
  // deployed, so no on-chain consumer has ever observed the old meaning.
  54: {
    name: "StakePoolNotBound",
    hint: "Asset 0's insurance_authority is still zero: no stake pool has ever been bound to this market, so there is no staker constituency owed the insurance leg. Call the stake program's BindInsuranceAuthority (stake tag 19) first — it is required, or the insurance/staker leg has no exit.",
  },
  55: {
    name: "StakePoolOwnerMismatch",
    hint: "The supplied stake-pool account is not owned by the wrapper's pinned STAKE_PROGRAM_ID. THIS IS THE FORGERY GATE — it is checked before any byte of the account is read. Pass the pool PDA ['stake_pool', market] derived under the canonical stake program (devnet v2.2 wrapper 6kpg2wi7… pins 7JrgAUHi4PxaRv5JKHoGAxodDFbozYexpERei66Xgq4V; v1 close-only wrapper ETDLAdi… pins VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w).",
  },
  56: {
    name: "StakePoolAuthorityMismatch",
    hint: "The PDA ['vault_auth', pool] derived under the pool account's owning program does not equal the bound insurance_authority. The supplied pool is not the one that bound itself to this market.",
  },
  57: {
    name: "StakePoolMarketMismatch",
    hint: "The stake pool's own stored `slab` field does not name this market. You passed a pool belonging to a different market.",
  },
  58: {
    name: "StakePoolWrapperMismatch",
    hint: "The stake pool's stored `percolator_program` (its CPI target) is not this wrapper deployment. The pool was initialized against a different wrapper program id.",
  },
  59: {
    name: "StakePoolModeMismatch",
    hint: "The stake pool is not in insurance-LP mode (pool_mode != 0). Trading-mode pools carry no FlushToInsurance loss exposure, so they are not owed the insurance/staker fee leg.",
  },
  60: {
    name: "StakeProgramNotPinned",
    hint: "This wrapper build has no pinned stake program id, so WithdrawInsuranceReserveToStake (tag 87) has no destination it is willing to trust and refuses to move tokens. Emitted by every non-devnet build: v17 percolator-stake has no mainnet deployment. The atoms stay safe in header.insurance.",
  },
  // ── Program bug fixes, 2026-07-22 (61) ────────────────────────────────────
  // Source: v16_program.rs PercolatorError variant appended after
  // StakeProgramNotPinned=60, percolator-prog@10acb5ae. DEPLOYED to devnet
  // wrapper DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj (hash-verified
  // 6b2fda2363352aba0ef88abde0d398f9dd477b1208507e7e8393586ed5458931).
  61: {
    name: "AssetSlotAlreadyConfigured",
    hint: "UpdateAssetLifecycle(ACTIVATE) named an asset slot BELOW max_market_slots that is already configured and live (Active / DrainOnly / Recovery). Only two activations are legal: APPEND at asset_index == max_market_slots, or RE-ACTIVATE a slot whose lifecycle is Retired. InitMarket pre-configures slots 0..max_portfolio_assets, so on a market created with max_portfolio_assets > 1 every one of those slots hits this. Previously surfaced as the misleading Custom(21) EngineLockActive.",
  },
  // ── Creator fee claim, 2026-07-24 (62) ────────────────────────────────────
  // Source: v16_program.rs PercolatorError variant appended after
  // AssetSlotAlreadyConfigured=61. Ordinals 0-61 are unmoved (pinned by
  // v16_cu.rs::v17_new_error_ordinals_are_appended_at_the_tail and
  // v16_fee_split.rs::fee_split_error_ordinals_are_pinned).
  // ⚠ NOT YET DEPLOYED — this ships with the creator-fee-claim wrapper
  // upgrade (tag 90 WithdrawCreatorFee). Against the currently-deployed
  // wrapper this code is unreachable.
  62: {
    name: "CreatorFeeOverClaim",
    hint: "WithdrawCreatorFee (tag 90) requested more than the market has accrued: amount > creator_fee_claimable_atoms (WrapperConfigV16 bytes 568..576, u64 LE). The claim is exact-amount — it does NOT partial-fill, and nothing is debited on rejection. Read the current claimable balance and retry with amount <= it. Note the distinct codes on this handler: Custom(9) InvalidInstruction for amount == 0 (tag 90 does not use tag 84's '0 means withdraw everything' convention), and Custom(25) EngineCounterUnderflow only for the fail-closed internal checked_sub, which is unreachable behind this check and would indicate a broken invariant.",
  },

  // ── LP-vault reachability guard, 2026-08-29 (63) ───────────────────────────
  // Source: v16_program.rs PercolatorError variant appended after
  // CreatorFeeOverClaim=62. Ordinals 0-62 are unmoved.
  // ✅ DEPLOYED to devnet 2026-08-29 — wrapper 02326f4f, sha c9827970bf02098b,
  // slot 490057417, verified byte-identical.
  63: {
    name: "LpVaultBackingBucketNotEmpty",
    hint: "CreateLpVault (tag 74) targeted a domain whose backing bucket is ALREADY funded at an expiry that is not LP_VAULT_BACKING_EXPIRY_SLOT (u64::MAX/2). The range check on `domain` passed; this is the separate REACHABILITY check, and it fires BEFORE the registry PDA takes backing_bucket_authority so a refusal leaves the existing bucket owner intact. Without it the vault would be created dead: DepositToLpVault refuses for the whole remaining term on the expiry mismatch, the provider who funded that bucket can no longer withdraw because the authority is gone, and the only exit is CloseLpVault — which permanently forfeits this market's ability to ever have an LP vault, because it leaves the LP share mint on-chain and CreateLpVault requires both PDAs to be system-owned and empty. Fix: pick a domain whose bucket is Empty, or wait for the existing backing to expire. Do NOT confuse this with Custom(9) InvalidInstruction, which this handler also returns for an out-of-range domain (domain >= configured_slots * 2) and for fee_share_bps / oi_reservation_threshold_bps > 10_000.",
  },

  // ── Deployed v18.2 (6377376a) — appended after 63 ─────────────────────────
  64: {
    name: "RentExemptRequired",
    hint: "CloseSlab's tail must leave CLOSED_MARKET_TOMBSTONE_RENT_LAMPORTS in the market account so the closed-market tombstone (header KIND_CLOSED_MARKET = 8) stays rent-exempt forever (anti address-reuse, upstream d57411f8). Only fires if the market account holds fewer lamports than that floor at close — not reachable on a normally-funded market.",
  },
  65: {
    name: "AssetGenerationMismatch",
    hint: "A caller-supplied market_id / expected_market_id / asset_generation_frontier did not match the asset slot's current generation (AssetStateV16.market_id / header.next_market_id). The instruction was built against an older generation of this slot. Re-read the live values and rebuild.",
  },

  // ── P1 wrapper safety release — part of the relaunch wrapper (P1+P3 @ 58e379f1). ──
  // Appended, ordinals 0-65 unmoved.
  66: {
    name: "ExecPriceOutsideOracleBand",
    hint: "P1: the matcher's fill price lies outside reference ± band (reference = the oracle_price_e6 the wrapper handed the matcher). limit_price == 0 now means 'any price inside the band', not any price. Retry smaller or when the quote is inside the band; a v2 matcher with EXEC_BAND clips instead.",
  },
  67: {
    name: "SameOwnerTrade",
    hint: "P1: the taker's portfolio owner equals the matcher LP's owner, or the traded asset's asset_admin (the market creator). Trade from a different wallet (hygiene rule; not a sybil defence).",
  },
  68: {
    name: "LpExposureCapExceeded",
    hint: "P1: this fill would leave the LP's |position| × mark above k × LP initial-margin equity on the asset. Trade smaller, or wait for the LP to add capital / reduce inventory.",
  },
  69: {
    name: "LpFloorHalt",
    hint: "P1 auto-halt: the matcher LP's initial-margin equity is at or below the protocol floor, so risk-increasing fills are refused. Reducing fills and closes still work.",
  },
  70: {
    name: "ProtocolSideOiCapExceeded",
    hint: "P1: the protocol-set per-asset side open-interest cap (tag 93 SetAssetRiskLimits) would be exceeded on this side. Trade the other side, smaller, or later.",
  },
  71: {
    name: "CloseSlabFeesOutstanding",
    hint: "P1 F4: CloseSlab refused because protocol / creator / LP / staker fee legs are still owed. Claim them first — tag 84 WithdrawProtocolFee, tag 90 WithdrawCreatorFee — and sweep the staker leg (tag 87, allowed on a terminal-empty resolved market). Nothing is burned. planCloseSlabAttempt() orders these for you.",
  },

  // ── P3 vault-owned LP — part of the relaunch wrapper (P1+P3 @ 58e379f1). ──
  // Appended after P1's 66-71 (P3 is stacked on P1); ordinals verified by name
  // against the P3 enum (`PercolatorError::X as u32`) in test/p3.test.ts.
  72: {
    name: "VaultLpAlreadyBound",
    hint: "P3 tag 94: this vault (or asset) already has a bound vault LP.",
  },
  73: {
    name: "VaultLpNotBound",
    hint: "P3: a vault-LP instruction on a vault with no bound vault LP, or the passed vault_lp_state / vault LP portfolio does not match the registry (check the tail accounts on 75/77/78).",
  },
  74: {
    name: "VaultLpSeniorImpaired",
    hint: "P3 Earn deposit (tag 75) refused: the senior tranche is impaired (vault value < senior claim). New money would buy into a loss the junior did not cover. Wait for the junior to be topped up (tag 96) or the LP to recover.",
  },
  75: {
    name: "VaultLpJuniorWithdrawRefused",
    hint: "P3 tag 97: junior withdrawal over the junior surplus minus the floor (ceil(C_eff * junior_floor_bps / 10000)), or the backing pots do not fully cover the senior claim.",
  },
  76: {
    name: "VaultLpRecallRefused",
    hint: "P3 tag 98: recall of zero, or more than the senior liquidity shortfall.",
  },
  77: {
    name: "VaultLpExclusiveCounterparty",
    hint: "P3: on a bound asset only the vault LP may take new risk. Refused: (a) a matcher (TradeCpi/BatchTradeCpi) fill that grows an LP other than the bound vault LP; (b) any TradeNoCpi / BatchTradeNoCpi fill that grows EITHER portfolio's position on a bound asset — the vault LP is never a NoCpi party (its owner, the registry PDA, cannot sign), so direct P2P trading on a bound P3 asset can only reduce. Reducing fills still work.",
  },
  78: {
    name: "VaultLpLeverageStepDown",
    hint: "P3 leverage step-down: the taker's conservative equity does not cover the crowded-book initial margin for this fill. Add collateral or trade smaller.",
  },
  79: {
    name: "VaultLpBoundCannotClose",
    hint: "P3: CloseLpVault (tag 80) on a vault with a bound vault LP.",
  },
  80: {
    name: "VaultLpExposureCapExceeded",
    hint: "P3-H2: this fill would leave |vault LP position| * mark above the protocol leverage cap on the vault LP's conservative equity (AssetVaultLpV18.vault_lp_max_lev_bps, default 1x). Trade smaller or wait for the junior to add capital.",
  },
  81: {
    name: "VaultLpMatcherNotApproved",
    hint: "P3-H2 tag 95: the matcher program is not the tag-99 approved matcher for this asset, or max_fill_abs / max_inventory_abs is 0 (unbounded is refused).",
  },
  82: {
    name: "VaultLpUseSettleResolved",
    hint: "P3-H1: CloseResolved (30) / ClaimResolvedPayoutTopup (46) on the vault LP portfolio. Use VaultLpSettleResolved (tag 101): senior shortfall into backing, residual to the junior owner.",
  },
  83: {
    name: "VaultLpReleaseRefused",
    hint: "P3-M1 tag 102: release of zero, or of more than the backing surplus over the senior claim (nav - C; Resolved: physical - C).",
  },
  84: {
    name: "VaultLpHarvestPending",
    hint: "P3-L1/K1: LP fees are harvestable (H > 0), or (Resolved, terminal-flat, f0b990e1) a terminal residual or stray pot backing is not yet absorbed. A genesis Earn deposit, or a redemption on a bound vault, must be preceded by tag 78 LpVaultCrankFees in the same transaction (planResolvedVaultLpExitP3 orders 78 before every 77).",
  },
  85: {
    name: "VaultLpValuationStale",
    hint: "P3-L2: the vault LP holds inventory and its health certificate is not current, so the vault cannot be valued. Prepend a permissionless tag-5 crank of the vault LP (buildVaultLpRefreshCrankIxP3).",
  },
  86: {
    name: "VaultLpMultiAssetMarket",
    hint: "P3 F14-Q2: a vault LP needs a single-ASSET market. Tag 94 InitVaultLp requires exactly one configured asset slot (max_market_slots == 1 — create the market with maxPortfolioAssets: 1), and on a bound market no other asset may be activated (UpdateAssetLifecycle), traded risk-increasing or backed. The terminal residual is market-wide and is credited to the one vault.",
  },
  87: {
    name: "VaultLpSeniorDrawRequired",
    hint: "P3 senior draw: an engine step would open a bankrupt close on the vault LP (winners haircut) while the vault's own pots can still fund its undrawn deficit. Crank the vault LP first (PermissionlessCrank tag 5 draws senior backing into it; pass both pot ledgers writable), then retry.",
  },
  88: {
    name: "VaultLpRedeemNeedsRecall",
    hint: "P3 B24: a senior redemption (75/77) on a LIVE bound vault needs more than the chosen pot holds (backing or pot principal), because part of the senior value sits in the vault LP's capital. Run VaultLpRecall (tag 98, permissionless, vault LP flat) first, or redeem fewer shares. In RESOLVED mode the same per-pot shortfall is EngineLockActive (21): size each redemption to one pot's idle backing and repeat on the other pot.",
  },
  89: {
    name: "VaultLpPausedForSeniorDraw",
    hint: "P3 senior draw: PAUSED because Earn is covering a vault-LP loss (a senior draw is pending or outstanding). The vault LP's risk-increasing fills, junior withdraw (97), recall (98) and junior release (102) are halted until the seniors are restored (a later recovery restores C first). Check decodeAssetVaultLpDrawP3 / VaultLpStateP3.seniorDrawOutstandingAtoms; retry after the draw is booked and recovered.",
  },
  90: {
    name: "VaultLpBindRequiresFlatAsset",
    hint: "P3 (592286b4): VaultLp bind (tag 94) refused because the asset already has open interest. Positions that predate the vault LP are trader-vs-trader and can leave its winners short / block terminal-flat. Bind the vault at market creation, before any trade (the relaunch seed and the wizard do).",
  },
  91: {
    name: "LpVaultTargetPotImpaired",
    hint: "Non-bound Earn vault, deposits paused (wrapper 7a3ac04c NAV floor + its H-1 successor): DepositToLpVault (tag 75) is refused while a backing pot's net impairment (cumulative loss minus recovery) exceeds its principal (7a3ac04c: the target pot; H-1: either pot), or while the share price has collapsed (nav * 1000 < total shares). Depositing then would be absorbed by the excess loss or would mint almost every share at a near-zero price. Nothing moved; withdrawals (tag 77) still work. Retry once the vault recovers. Do NOT send RebalanceLpVaultBacking (91) into an over-impaired pot to clear it: under the floor that only moves holders' value into that pot.",
  },
  92: {
    name: "GrowthLeverageExceeded",
    hint: "Max leverage on this side is lower right now: this market's liquidity is in use. Reducing or closing is always allowed. growth-v19: a risk-increasing fill on a growth-enabled asset left the taker's conservative equity (no credit for positive PnL) below the dynamic initial margin (the launch ceiling IMR(L_ceil), stepped up on the crowded side as the LP's capacity fills). Reduce the size or add margin. Use quoteMaxLeverage() to preview.",
  },
  93: {
    name: "GrowthCapacityFull",
    // Wrapper `GrowthCapacityFull` = 93 (percolator-prog v16_program.rs:1678, raised at :41601): a crowd-side
    // risk-increasing fill would take the LP past its capacity N_cap = lambda * C_m / P, the LP's capital or the price is 0,
    // or the market's bankruptcy h-lock is latched. The thin side, reductions and closes stay open.
    hint: "New positions on this side are paused: the market's capacity is full. Reducing or closing your position is always allowed. You can also open on the other side, or try again later when room frees up.",
  },
  94: {
    name: "GrowthInvalidConfig",
    hint: "growth-v19: invalid growth configuration. InitMarket with a growth block: MMR < r_gap + liquidation fee, r_gap == 0, r_gap below max_price_move_bps_per_slot * 50, l_launch outside [1x, tier max], or max_abs_funding_e9_per_slot == 0 on a single-slot market. InitVaultLp (94) with an l_launch on an asset whose growth block is off or outside the tier.",
  },
  95: {
    name: "GrowthNeedsLpCounterparty",
    hint: "Open against the market maker: trade through the book. growth-v19: on a growth asset every risk-increasing fill must face the asset's bound vault LP. A fill between two non-LP portfolios, between two LPs, or against any other LP may only reduce or close.",
  },
  96: {
    name: "GrowthBatchTooManyLegs",
    hint: "Split this order into batches of at most 10 markets. growth-v19: a BatchTradeCpi carrying a leg on a growth-enabled asset is limited to GROWTH_BATCH_MAX_LEGS (10) legs (compute budget). Nothing was executed.",
  },
  97: {
    name: "GrowthRequiresBoundVaultLp",
    hint: "This market is not open for new positions. Reducing or closing is always allowed. growth-v19: opens on a growth-enabled asset are admitted only when the asset has a bound vault LP (P3); capacity is measured on the users' open interest against that LP.",
  },
  98: {
    name: "GrowthUtilisationFeeNotCovered",
    hint: "This side is busy: raise your max fee to cover the utilisation fee (see the quote). growth-v19 N-2: an open into a side above its utilisation kink pays a utilisation fee to the market maker, and the signed fee_bps (or the market's fee cap) does not cover base + matcher fee + that fee. Use previewGrowthOpenFee(). Closing is never charged.",
  },
  99: {
    name: "GrowthUtilisationFeeRequiresTradeCpi",
    hint: "Place this order on its own (not in a batch). growth-v19 N-2: a batch leg that opens into a side above its utilisation kink owes a utilisation fee only a single TradeCpi can pay. Closes and opens below the kink can still be batched.",
  },
  // P2b Earn allocation (percolator-prog #526): explicit discriminants 100..=103.
  100: {
    name: "VaultLpAllocateRefused",
    hint: "Nothing to allocate right now. Tag 103 VaultLpAllocate was refused: a senior draw is outstanding or pending, the vault is impaired (V < C_eff), the vault LP is insolvent, the junior is below 5% of C_eff, the market is not Live, the requested amount is 0, or the alpha / buffer room is 0. Nothing moved. A keeper treats this as 'skip this crank' and retries next cycle.",
  },
  101: {
    name: "VaultLpCapacityLocked",
    hint: "Capital is backing open positions; try again once the market's LP has closed them. Lowering the vault LP's capital (junior withdraw 97, recall 98) would leave its growth capacity N_cap below its open inventory (A4 lock).",
  },
  102: {
    name: "VaultLpCreatorFeeVesting",
    hint: "Creator fees unlock when the market's first-loss cushion reaches its target. Tag 90 is refused while the G6 junior cushion is below its target (AssetVaultLpP3.creatorFeeVesting).",
  },
  103: {
    name: "VaultLpSeniorCapitalHalt",
    hint: "This side is paused while the market's first-loss capital is rebuilt; closing is always allowed. The junior is exhausted (V < C_eff), so the vault LP is trading senior capital and its risk-increasing fills are halted (Q2); reductions, closes and thin-side opens are not. Compare the LP's conservative equity with seniorFloorDecodeP2b(p2b_senior_floor_code).",
  },
  // v2.2 Phase 4 (percolator-prog release/v22-wrapper b4390fe0; waves A #527, B #533, C #530, D #531):
  // explicit discriminants 104..=119 plus 123/124. Each message is ONE calm line for the user; the
  // creator-tooling codes say what to fix. Wording follows the wave docs (Wave A `v22-wave-a-wire.md`,
  // Wave B `v22-band-defaults-and-product-copy.md`, the Rust doc comments) where they give copy.
  104: {
    name: "PriceBandPinned",
    // P-4 (2026-10-11, ledger v22-diag-p4-band-close): on a close, 104 means the close is favourable TO THE CLOSER
    // while the band is pinned/lagged (`reject_band_favourable_close_view`, wrapper RC 6c078a0e): a long reducing while
    // target < pinned price, a short reducing while target > pinned price. The opposite close is allowed (the closer
    // takes the worse price). 104 is also an accrual refusal (price outside the band / duration pin).
    // Minor (QA 2026-10-11): the favourable-close refusal applies whenever the price is LAGGING its target
    // (`asset_price_lagged_view`), not only when it is pinned at the band edge, so the copy does not say "pinned".
    hint: "The market price hasn't caught up yet, so a close on this side would get a better price than the market. Try again shortly. (Closing in the other direction, at the worse price, is allowed.)",
  },
  105: {
    name: "PriceBandConfigInvalid",
    hint: "This market's price-band settings are not valid; check the band width, epoch, pin window and minimum position size.",
  },
  106: {
    name: "HoldingRentConfigInvalid",
    hint: "This market's holding-rent settings are not valid; the rate must be 0 or at least 10, and the kink at most 80%.",
  },
  107: {
    name: "BondTrancheImpaired",
    hint: "Bond deposits are paused while the bond tranche is below par.",
  },
  108: {
    name: "BondCapacityLocked",
    hint: "Withdrawable when the market's open interest is below the capacity your bond backs.",
  },
  109: {
    name: "BondWithdrawCooldown",
    hint: "Your bond withdrawal is still cooling down; try again after the cooldown set for this market.",
  },
  110: {
    name: "BondConfigInvalid",
    hint: "These bond settings, or this bond position, are not valid for this market.",
  },
  111: {
    name: "PriceBandPositionCap",
    hint: "This market is full on this side; try again shortly.",
  },
  112: {
    name: "PriceBandTooNarrow",
    hint: "This market is close-only at this price.",
  },
  113: {
    name: "PriceBandLegBelowMinNotional",
    hint: "Below the minimum position size: trade at least the market minimum, or close fully.",
  },
  114: {
    name: "RescueRefused",
    hint: "This market cannot be recapitalised right now; try again once it has refreshed.",
  },
  115: {
    name: "RescueNavFloor",
    hint: "This market can no longer be recapitalised; it will be wound down.",
  },
  116: {
    name: "InsuranceBackstopRefused",
    hint: "The insurance fund is not available for this right now; nothing was moved.",
  },
  117: {
    name: "RedemptionBelowMinPayout",
    hint: "The exit price moved below your minimum; retry or lower it.",
  },
  118: {
    name: "ExitRequiresLossCurrent",
    hint: "Refreshing positions before your exit; retry shortly.",
  },
  119: {
    name: "LotConfigInvalid",
    hint: "This market's lot size is not valid; choose a lot exponent from 1 to 15 so the launch price is between 10 and 10,000 per lot.",
  },
  123: {
    name: "BondDepositAboveCap",
    hint: "This market's bond tranche is full.",
  },
  124: {
    name: "BondSlippage",
    hint: "The bond price moved past your minimum; retry or lower it.",
  },
  // R-10 (G9 allowlist timelock) and v2.2 QA item P-1 (named position-cap refusal), percolator-prog
  // fix/v22-p1-position-cap-error: explicit discriminants 125..=127, appended after 124. 126/127 are the
  // names for what used to surface as the generic Custom(9) on a position-cap refusal; a bare 9 still
  // decodes as before (cap < 4 markets and other refusals still answer 9/17).
  125: {
    name: "G9AllowlistTimelock",
    hint: "This feed-allowlist change is still in its waiting period. Operators: propose, wait the delay, then commit; removals alone apply immediately.",
  },
  126: {
    name: "PositionCapReached",
    hint: "This account already holds the maximum number of positions on this market. Close one first.",
  },
  127: {
    name: "CounterpartyPositionCapReached",
    hint: "The other side of this trade is at its position limit, which is not caused by your account. Try another asset or try again later.",
  },
  // v2.2 growth G8 (spec v22-growth-overnight-2026-10-14 section 1.3): explicit discriminant 128, appended after 127. A
  // PushAuthMark (tag 63) 44-byte push whose depth_mode is not 0 (none) or 1 (keeper-attested).
  128: {
    name: "DepthInputInvalid",
    hint: "The price update carried an invalid liquidity reading.",
  },
  // v2.2 growth round 2 (percolator-prog): explicit discriminants 129 and 130, appended after 128.
  129: {
    name: "DepthSourceInvalid",
    hint: "The on-chain liquidity source for this market was refused (wrong pool, vault, mint or pin). Nothing was written.",
  },
  130: {
    name: "GrowthTierConfigInvalid",
    hint: "The market's leverage tier settings are out of bounds: thresholds must rise (T1 < T2 < T3) and leverage must not fall between tiers.",
  },
  // v2.2 leverage guard (percolator-prog fix/v22-lev-audit-2026-10-28 on feat/v22-rc23-2026-10-22 a0c1337d): explicit
  // discriminants 131..=135. Wire: ledger v22-lev-guard-wire-spec-2026-10-28.
  131: {
    name: "CreatorStakeBelowMinimum",
    hint: "The creator stake must be 0 or at least $500. No Earn allocation runs below that.",
  },
  132: {
    name: "LevGuardRequired",
    hint: "This market needs its leverage guard account on opening trades. Update the app and retry.",
  },
  133: {
    name: "LevGuardRefused",
    hint: "The leverage guard refused this open: the token is under 6 hours old, or the leverage or size is above the current safety limit, or the price just moved sharply, or the short side is capped. Reduce size or leverage, or try later.",
  },
  134: {
    name: "LevGuardInvalid",
    hint: "The leverage guard instruction was malformed (operation, data, signer or accounts). This is a client bug.",
  },
  135: {
    name: "LpStopNotTriggered",
    hint: "The liquidity-provider stop does not hold right now, or there is nothing left to cut.",
  },
  // P2b E7 (percolator-prog #525, engine #276): explicit discriminants 120..=122; each was Custom(21).
  120: {
    name: "EngineAdlReduceOnly",
    hint: "This market is close-only while it rebalances after an auto-deleverage. You can reduce or close; new positions reopen once it resets.",
  },
  121: {
    name: "EngineLossStale",
    hint: "Positions are being refreshed after a price move. Opening is paused until the refresh lands; closing still works. Retry shortly.",
  },
  122: {
    name: "EarnExitWouldUnderBackClaims",
    hint: "This withdrawal would leave open winning positions under-backed. Try a smaller amount, or retry after those positions close or settle.",
  },
};
for (const v of Object.values(PERCOLATOR_ERRORS)) Object.freeze(v);
Object.freeze(PERCOLATOR_ERRORS);

/**
 * Decode a custom program error code to its info.
 *
 * @param code Custom error code from `custom program error: 0x<hex>`.
 * @returns ErrorInfo with name and hint, or undefined if the code is not recognized.
 */
export function decodeError(code: number): ErrorInfo | undefined {
  return PERCOLATOR_ERRORS[code];
}

/**
 * Get error name from code.
 *
 * @param code Custom error code.
 * @returns Human-readable error name, or "Unknown(<code>)" if not recognized.
 */
export function getErrorName(code: number): string {
  return PERCOLATOR_ERRORS[code]?.name ?? `Unknown(${code})`;
}

/**
 * Get actionable hint for error code.
 *
 * @param code Custom error code.
 * @returns Actionable hint string, or undefined if not recognized.
 */
export function getErrorHint(code: number): string | undefined {
  return PERCOLATOR_ERRORS[code]?.hint;
}

/** Max hex digits for `custom program error: 0x...` — Solana custom errors are u32. */
const CUSTOM_ERROR_HEX_MAX_LEN = 8;

/** Which program a custom error was attributed to. */
export type ErrorProgramKind = "wrapper" | "stake" | "nft" | "matcher" | "token" | "unknown";

/** Program ids to attribute errors to, in addition to the SDK's known deployments. */
export type ErrorProgramIds = Partial<Record<Exclude<ErrorProgramKind, "token" | "unknown">, readonly (PublicKey | string)[]>>;

/**
 * What the caller was doing, so a code with several meanings can get the right line.
 * `openLegs` is the number of open positions on the account (e.g. from parsePortfolioV17).
 */
export interface ErrorContext {
  action?: "trade" | "withdraw" | "deposit" | "resolve" | "other";
  openLegs?: number;
  /**
   * For `action: "resolve"` (tag 39): slots still to wait before the market can be resolved, or null when
   * permissionless resolve is disabled on the market. Take it from `staleResolveStatusV22(...).slotsRemaining`
   * (or pass `staleResolveErrorContextV22(status)` as the whole context).
   */
  staleSlotsRemaining?: bigint | number | null;
  /**
   * For `action: "trade"`: the trade is on a multi-asset market with a portfolio at >= 3 legs, where 19 means a
   * health certificate is not at the market's current epochs (Q-7; see buildMultiAssetTradeIxsV22).
   */
  healthCheckStale?: boolean;
}

/** Options for {@link parseErrorFromLogs}. */
export interface ParseErrorOptions {
  /** Extra program ids (fresh deployments, env overrides) to attribute by kind. */
  programIds?: ErrorProgramIds;
  /** Caller context for codes with several meanings (wrapper 9 and 19). */
  context?: ErrorContext;
}

/** A custom program error decoded from transaction logs. */
export interface ParsedProgramError {
  code: number;
  name: string;
  hint?: string;
  /** The program the failing log line names, decoded with that program's own error table. */
  program: ErrorProgramKind;
  /** Base58 id of the failing program, when the log line names one. */
  programId?: string;
}

const TOKEN_PROGRAM_IDS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];

function knownProgramIds(extra?: ErrorProgramIds): Map<string, ErrorProgramKind> {
  const m = new Map<string, ErrorProgramKind>();
  const add = (kind: ErrorProgramKind, ids: readonly (PublicKey | string | undefined)[]) => {
    for (const id of ids) {
      if (id === undefined) continue;
      m.set(typeof id === "string" ? id : id.toBase58(), kind);
    }
  };
  add("wrapper", [PROGRAM_IDS.devnet.percolator, PROGRAM_IDS.mainnet.percolator, PROGRAM_IDS_DEVNET_V22.percolator, PROGRAM_IDS_DEVNET_V1.percolator]);
  add("matcher", [PROGRAM_IDS.devnet.matcher, PROGRAM_IDS.mainnet.matcher, PROGRAM_IDS_DEVNET_V22.matcher, PROGRAM_IDS_DEVNET_V1.matcher]);
  add("stake", [STAKE_PROGRAM_IDS.devnet, STAKE_PROGRAM_IDS.mainnet, PROGRAM_IDS_DEVNET_V22.vault, PROGRAM_IDS_DEVNET_V1.vault]);
  add("nft", [NFT_PROGRAM_IDS.devnet, NFT_PROGRAM_IDS.mainnet, PROGRAM_IDS_DEVNET_V22.nft, PROGRAM_IDS_DEVNET_V1.nft]);
  add("token", TOKEN_PROGRAM_IDS);
  // Caller-declared ids win over the built-in sets.
  if (extra) {
    for (const kind of ["wrapper", "stake", "nft", "matcher"] as const) add(kind, extra[kind] ?? []);
  }
  return m;
}

function decodeForProgram(kind: ErrorProgramKind, code: number): ErrorInfo | undefined {
  switch (kind) {
    case "stake": {
      const v5 = STAKE_ERRORS_V5[code];
      if (v5) return v5;
      const hint = STAKE_ERRORS[code];
      const name = STAKE_ERROR_NAMES[code];
      return hint !== undefined && name !== undefined ? { name, hint } : undefined;
    }
    case "nft":
      return NFT_ERRORS[code];
    case "matcher":
      return MATCHER_V2_ERRORS[code];
    case "token":
      return SPL_TOKEN_ERRORS[code];
    case "wrapper":
    case "unknown":
      return PERCOLATOR_ERRORS[code];
  }
}

/**
 * Hint for a code a known non-wrapper program does not define. The matcher (percolator-match 2b08537a) defines
 * only Custom 8001..8005 and otherwise returns built-in errors, so e.g. "matcher 9" is not a matcher error: say so
 * instead of returning a bare Unknown(9) (and never borrow the wrapper's name for it).
 */
function unlistedCodeHint(program: ErrorProgramKind, code: number): string | undefined {
  if (program === "matcher") return `The matcher program returned code ${code}, which it does not define (its own codes are 8001-8005). If this was a trade, check the wrapper's error on the same transaction; otherwise the matcher build may not match this SDK.`;
  if (program === "stake" || program === "nft") return `The ${program} program returned code ${code}, which is not in this SDK's ${program} error table; the program build may be newer than this SDK.`;
  return undefined;
}

/**
 * A hint for a wrapper error code that takes the caller's context into account. Codes with one meaning
 * return their table hint unchanged.
 *
 * @param code     Wrapper custom error code.
 * @param context  What the caller was doing (see {@link ErrorContext}).
 * @returns The hint, or undefined for an unknown code.
 * @example
 * ```ts
 * getContextualErrorHint(19, { action: "withdraw", openLegs: 1 });
 * // "Close your open positions first, then withdraw. ..."
 * getContextualErrorHint(9, { action: "trade" });
 * ```
 */
export function getContextualErrorHint(code: number, context?: ErrorContext): string | undefined {
  if (code === 9 && context?.action === "trade") {
    return "Trade refused: your max fee must cover the market's base fee plus the matcher's fee (and stay at or below the market maximum), the fill must meet your limit price, and an account can hold at most 4 positions. Sign the fee from computeTradeFeeBpsToSignV22() and retry, or close a position first.";
  }
  if (code === 19 && context?.action === "trade" && context.healthCheckStale === true) {
    return "This account's health check is out of date for this market — the trade needs to refresh both sides first. Build it with buildMultiAssetTradeIxsV22 (refresh the market maker, then this account, then the market maker again, then trade).";
  }
  if (code === 19 && context?.action === "withdraw" && (context.openLegs ?? 0) > 0) {
    return "Close your open positions first, then withdraw. Withdrawals from an account with open positions are refused.";
  }
  if (code === 27 && context?.action === "resolve") {
    const rem = context.staleSlotsRemaining;
    if (rem === null) return "This market cannot be resolved this way: permissionless resolve is turned off for it.";
    if (rem !== undefined && BigInt(rem) > 0n) {
      const n = BigInt(rem);
      const mins = Number(n) / 150; // ~2.5 slots/s
      const approx = mins >= 1 ? `about ${Math.ceil(mins)} min` : "under a minute";
      return `This market's price has not been stale for long enough to resolve yet: ${n.toLocaleString("en-US")} more slots (${approx}) without a price update are needed. A new price update restarts the wait.`;
    }
    return "This market's price has not been stale for long enough to resolve yet. A new price update restarts the wait; try again later.";
  }
  if (code === 21 && context?.action === "resolve") return "This market is already resolved.";
  // Tag 39 returns 19 (EngineStale) only if the cluster Clock is behind the market's recorded slot (v16_program.rs:26847); the
  // instruction's own now_slot is ignored, so a past or zero now_slot gives 27, not 19.
  if (code === 19 && context?.action === "resolve") return "The network clock is behind this market's last update. Wait a few seconds and try again.";
  return PERCOLATOR_ERRORS[code]?.hint;
}

/**
 * Parse a custom program error from transaction logs and attribute it to the program that failed.
 *
 * The FIRST `Program <id> failed: custom program error: 0x..` line is used (the innermost failing
 * program of a CPI chain). The id on that line selects the error table: the wrapper's
 * (PERCOLATOR_ERRORS), the stake program's (STAKE_ERRORS + STAKE_ERRORS_V5), the NFT program's
 * (NFT_ERRORS), the matcher's (MATCHER_V2_ERRORS) or SPL Token's. Ids are the SDK's known
 * deployments (devnet v2.2 / v1, mainnet) plus `opts.programIds`. A program the SDK does not know,
 * or a log line without an id, falls back to the wrapper table (the legacy behaviour) and is
 * reported as `program: "unknown"`.
 *
 * @param logs  Array of transaction log strings from the RPC response.
 * @param opts  Extra program ids and caller context (see {@link ParseErrorOptions}).
 * @returns Parsed error with code, name, hint and program — or null if none is found.
 *
 * @example
 * ```ts
 * const err = parseErrorFromLogs(sim.value.logs ?? [], { context: { action: "withdraw", openLegs: 1 } });
 * if (err) console.error(`${err.program} ${err.name}: ${err.hint}`);
 * ```
 */
export function parseErrorFromLogs(logs: string[], opts?: ParseErrorOptions): ParsedProgramError | null {
  if (!Array.isArray(logs)) {
    return null;
  }
  const re = new RegExp(
    `custom program error: 0x([0-9a-fA-F]{1,${CUSTOM_ERROR_HEX_MAX_LEN}})(?![0-9a-fA-F])`,
    "i",
  );
  const programRe = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) failed:/;
  let known: Map<string, ErrorProgramKind> | undefined;
  for (const log of logs) {
    if (typeof log !== "string") {
      continue;
    }
    const match = log.match(re);
    if (match) {
      const code = parseInt(match[1], 16);
      if (!Number.isFinite(code) || code < 0 || code > 0xffff_ffff) {
        continue;
      }
      const programId = log.match(programRe)?.[1];
      known ??= knownProgramIds(opts?.programIds);
      const program: ErrorProgramKind = (programId !== undefined ? known.get(programId) : undefined) ?? "unknown";
      const info = decodeForProgram(program, code);
      const isWrapperTable = program === "wrapper" || program === "unknown";
      const hint = isWrapperTable && opts?.context ? getContextualErrorHint(code, opts.context) : info?.hint;
      return {
        code,
        name: info?.name ?? `Unknown(${code})`,
        hint: hint ?? unlistedCodeHint(program, code),
        program,
        ...(programId !== undefined ? { programId } : {}),
      };
    }
  }
  return null;
}
