// Web3-free home of the v5 stake error tables. `v22-stake.ts` re-exports both unchanged;
// `errors.ts` imports them from here so parsing errors does not pull @solana/web3.js into a bundle.

import type { ErrorInfo } from "./errors.js";

/**
 * StakeError codes 33 to 48 (v5), with the stable Rust variant name and a calm one-line user message.
 * Codes 0 to 32 are the v2.1 table (`STAKE_ERRORS`); {@link decodeStakeErrorV5} covers all of them. Note
 * `STAKE_ERRORS[32]` still says "VERSION 18": on a v2.2 stake it pins VERSION 19 (see the PR notes).
 */
export const STAKE_ERRORS_V5: Readonly<Record<number, ErrorInfo>> = Object.freeze({
  33: { name: "ConsentRequired", hint: "Please review and accept the current risk text, then try again." },
  34: { name: "DeprecatedV5", hint: "This action was removed in stake v5; deployment now happens through the automatic sync." },
  35: { name: "InsuranceUnitsInvalid", hint: "The market's insurance record is not available right now; try again in a moment." },
  36: { name: "LiquidityBufferExhausted", hint: "This withdrawal is larger than the liquid part of the pool; the rest returns after the next sync." },
  37: { name: "SyncCooldownActive", hint: "The pool was synced a moment ago; try again shortly." },
  38: { name: "InvalidDeployConfig", hint: "These deployment settings are not allowed for this pool." },
  39: { name: "NotProtocolAuthority", hint: "Raising the deployment target needs the protocol authority." },
  40: { name: "NoPendingDeployTarget", hint: "There is no pending target to apply yet, or its waiting period has not ended." },
  41: { name: "NotSupportedOnFirstLoss", hint: "This feature is not available on a first-loss pool." },
  42: { name: "AssetAdminNotBurned", hint: "The market admin must be burned before this pool can deploy into insurance." },
  43: { name: "NothingToSync", hint: "Nothing to sync: the pool is already close to its target." },
  44: { name: "InsuranceReadingsDiverged", hint: "The market's insurance is lent out right now; deposits and syncs wait until it is repaid. When binding a pool: the market has unsettled positions; crank and refresh every open position in the same transaction as the bind, or bind before the market has positions." },
  45: { name: "InsuranceUnitsMismatch", hint: "The market's insurance record did not update as expected; nothing was changed." },
  46: { name: "CreatorAccountRequired", hint: "The market creator's token account is needed to return their insurance seed." },
  47: { name: "InsuranceCustodyNotBound", hint: "The pool must hold the market's insurance authority and operator before the market admin can be burned; bind the pool first." },
  48: { name: "MultiAssetMarketNotSupported", hint: "A staking pool can only bind a single-asset market; this market can no longer take one. Bind before a second asset can be added." },
}) as Readonly<Record<number, ErrorInfo>>;

/**
 * Stable Rust variant names of StakeError 0..32 (percolator-stake `src/error.rs` @ aebbff6), for
 * attributing a stake failure by name. The user-facing text for these codes is `STAKE_ERRORS`.
 */
export const STAKE_ERROR_NAMES: Readonly<Record<number, string>> = Object.freeze({
  0: "AlreadyInitialized", 1: "NotInitialized", 2: "Unauthorized", 3: "CooldownNotElapsed",
  4: "InsufficientLpTokens", 5: "ZeroAmount", 6: "Overflow", 7: "InvalidMint", 8: "MarketResolved",
  9: "DepositCapExceeded", 10: "InvalidPda", 11: "DeprecatedAdminAlreadyTransferred",
  12: "DeprecatedAdminNotTransferred", 13: "InsufficientVaultBalance", 14: "InvalidPercolatorProgram",
  15: "CpiFailed", 16: "InvalidAccount", 17: "InvalidPoolMode", 18: "WithdrawalBelowHwmFloor",
  19: "TrancheNotEnabled", 20: "JuniorBalanceInsufficient", 21: "WrongTranche", 22: "ZeroSharesMinted",
  23: "NoPendingAdmin", 24: "InsuranceLossOutstanding", 25: "CooldownIncreaseRequiresTimelock",
  26: "TimelockNotElapsed", 27: "NoPendingCooldownProposal", 28: "DepositBelowMinimumLiquidity",
  29: "NoRealLpHolders", 30: "MarketNotTerminal", 31: "NothingToRecover", 32: "UnsupportedWrapperLayout",
}) as Readonly<Record<number, string>>;
