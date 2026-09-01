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
    hint: "Unknown instruction tag. The SDK and program versions may be mismatched.",
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
    hint: "Engine position is stale — the market mark price has not been updated recently.",
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
    hint: "Oracle confidence interval too wide. Wait for more stable market conditions.",
  },
  29: {
    name: "InvalidOracleKey",
    hint: "Oracle account key does not match the market's configured oracle feed ID.",
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
    hint: "No new fees to distribute to the LP vault. Wait for more trading activity.",
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
    hint: "The supplied stake-pool account is not owned by the wrapper's pinned STAKE_PROGRAM_ID. THIS IS THE FORGERY GATE — it is checked before any byte of the account is read. Pass the pool PDA ['stake_pool', market] derived under the canonical stake program (devnet GCHhcgwPyrai8SWHEVWw3odedguFXEtJobNnWSfWBCU3).",
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
    hint: "CreateLpVault (tag 72) targeted a domain whose backing bucket is ALREADY funded at an expiry that is not LP_VAULT_BACKING_EXPIRY_SLOT (u64::MAX/2). The range check on `domain` passed; this is the separate REACHABILITY check, and it fires BEFORE the registry PDA takes backing_bucket_authority so a refusal leaves the existing bucket owner intact. Without it the vault would be created dead: DepositToLpVault refuses for the whole remaining term on the expiry mismatch, the provider who funded that bucket can no longer withdraw because the authority is gone, and the only exit is CloseLpVault — which permanently forfeits this market's ability to ever have an LP vault, because it leaves the LP share mint on-chain and CreateLpVault requires both PDAs to be system-owned and empty. Fix: pick a domain whose bucket is Empty, or wait for the existing backing to expire. Do NOT confuse this with Custom(9) InvalidInstruction, which this handler also returns for an out-of-range domain (domain >= configured_slots * 2) and for fee_share_bps / oi_reservation_threshold_bps > 10_000.",
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

/**
 * Parse a custom program error from transaction logs.
 *
 * Looks for "Program ... failed: custom program error: 0x..." in the log lines.
 * Returns null if no custom error is found.
 *
 * @param logs Array of transaction log strings from the RPC response.
 * @returns Parsed error with code, name, and hint — or null if not found.
 *
 * @example
 * ```ts
 * const err = parseErrorFromLogs(txResult.meta?.logMessages ?? []);
 * if (err) console.error(`${err.name}: ${err.hint}`);
 * ```
 */
export function parseErrorFromLogs(logs: string[]): {
  code: number;
  name: string;
  hint?: string;
} | null {
  if (!Array.isArray(logs)) {
    return null;
  }
  const re = new RegExp(
    `custom program error: 0x([0-9a-fA-F]{1,${CUSTOM_ERROR_HEX_MAX_LEN}})(?![0-9a-fA-F])`,
    "i",
  );
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
      const info = decodeError(code);
      return {
        code,
        name: info?.name ?? `Unknown(${code})`,
        hint: info?.hint,
      };
    }
  }
  return null;
}
