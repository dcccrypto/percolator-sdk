/**
 * percolator-nft custom error codes (`NftError`, `percolator-nft/src/error.rs`), attributed to the NFT
 * program id. Verified against percolator-nft `b257417` (the v2.2 fresh devnet NFT `27LWmR72…`); the enum
 * is append-only, so 0..27 are stable.
 *
 * Kept in its own module (no env reads at import) so `parseErrorFromLogs` can use it without
 * importing `abi/nft.ts`, whose NFT_PROGRAM_ID resolution runs at import time.
 */
import type { ErrorInfo } from "./errors.js";

/** NftError 0..27, one calm line each. */
export const NFT_ERRORS: Readonly<Record<number, ErrorInfo>> = Object.freeze({
  0: { name: "PositionNotOpen", hint: "There is no open position to wrap as an NFT." },
  1: { name: "NftAlreadyMinted", hint: "An NFT has already been minted for this position." },
  2: { name: "InvalidNftPda", hint: "The position NFT account does not match its expected address." },
  3: { name: "InvalidSlabOwner", hint: "The market account is not owned by a Percolator program." },
  4: { name: "SlabDataTooShort", hint: "The market account is too short to read the position." },
  5: { name: "UserIndexOutOfRange", hint: "The account index is out of range for this market." },
  6: { name: "PositionMismatch", hint: "The position changed since the NFT was minted." },
  7: { name: "NotNftHolder", hint: "Only the NFT holder can do this." },
  8: { name: "FundingOverflow", hint: "Funding settlement overflowed; nothing was changed." },
  9: { name: "InvalidMintAuthority", hint: "The NFT mint authority is not this program's PDA." },
  10: { name: "UnrecognizedSlabLayout", hint: "The market layout version is not recognised by the NFT program." },
  11: { name: "PositionInLiquidation", hint: "The position is being liquidated and cannot be transferred." },
  12: { name: "FundingNotSettled", hint: "Settle funding before transferring this position NFT." },
  13: { name: "InvalidPercolatorProgram", hint: "The transfer named a program that is not a known Percolator wrapper." },
  14: { name: "PositionNotClosed", hint: "Close the position fully before burning its NFT." },
  15: { name: "InvalidExtraAccountMetas", hint: "The transfer-hook account list does not match its expected address." },
  16: { name: "InvalidTokenAccount", hint: "The source or destination token account is not valid for this NFT." },
  17: { name: "UnauthorizedDirectInvocation", hint: "The transfer hook can only be called by the token program." },
  18: { name: "LpAccountNotAllowed", hint: "LP accounts cannot be wrapped as a position NFT." },
  19: { name: "InvalidAccountId", hint: "The account slot was reused by a different account." },
  20: { name: "SlotReused", hint: "This position's slot now belongs to a different owner; the NFT is no longer valid for it." },
  21: { name: "InvalidPortfolioOwner", hint: "The portfolio is not owned by a known Percolator wrapper." },
  22: { name: "LegNotActive", hint: "This portfolio has no open position on that market." },
  23: { name: "PortfolioDecodeFailed", hint: "The portfolio account could not be read (layout check failed)." },
  24: { name: "TransferBlocked", hint: "This position cannot be transferred right now (closing, resolved or stale)." },
  25: { name: "MarketIdMismatch", hint: "The position slot was closed and reused by a newer position." },
  26: { name: "RegistryNotConfigured", hint: "This market has no NFT registry for this program, so the NFT could never be transferred." },
  27: { name: "MultiLegNotWrappable", hint: "Only a portfolio with a single open position can be wrapped as an NFT." },
}) as Readonly<Record<number, ErrorInfo>>;

/**
 * SPL Token / Token-2022 `TokenError` codes 0..19 (shared by both programs), attributed to the token
 * program id so a token failure (e.g. 1 = insufficient funds) is not decoded as a wrapper error.
 */
export const SPL_TOKEN_ERRORS: Readonly<Record<number, ErrorInfo>> = Object.freeze({
  0: { name: "NotRentExempt", hint: "Token account is not rent-exempt." },
  1: { name: "InsufficientFunds", hint: "Not enough tokens in the source account." },
  2: { name: "InvalidMint", hint: "Invalid token mint." },
  3: { name: "MintMismatch", hint: "The token account is for a different mint." },
  4: { name: "OwnerMismatch", hint: "The token account owner does not match." },
  5: { name: "FixedSupply", hint: "This token has a fixed supply." },
  6: { name: "AlreadyInUse", hint: "The token account is already initialized." },
  7: { name: "InvalidNumberOfProvidedSigners", hint: "Wrong number of multisig signers provided." },
  8: { name: "InvalidNumberOfRequiredSigners", hint: "Wrong number of required multisig signers." },
  9: { name: "UninitializedState", hint: "The token account is not initialized (create the associated token account first)." },
  10: { name: "NativeNotSupported", hint: "This instruction does not support native SOL tokens." },
  11: { name: "NonNativeHasBalance", hint: "Non-native token account still has a balance." },
  12: { name: "InvalidInstruction", hint: "Invalid token instruction." },
  13: { name: "InvalidState", hint: "Token account state is invalid for this instruction." },
  14: { name: "Overflow", hint: "Token amount overflow." },
  15: { name: "AuthorityTypeNotSupported", hint: "This authority type is not supported." },
  16: { name: "MintCannotFreeze", hint: "This mint cannot freeze accounts." },
  17: { name: "AccountFrozen", hint: "The token account is frozen." },
  18: { name: "MintDecimalsMismatch", hint: "Mint decimals do not match." },
  19: { name: "NonNativeNotSupported", hint: "This instruction only supports native SOL tokens." },
}) as Readonly<Record<number, ErrorInfo>>;
