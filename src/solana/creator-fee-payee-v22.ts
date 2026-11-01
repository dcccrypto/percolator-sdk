/**
 * v2.2 creator-fee payee (prog #587 / #644): instruction builders for tag 125 `SetCreatorFeePayee` and the
 * permissionless tag 90 claim to the payee, plus a market reader that returns, per asset, what tag 90 and CloseSlab
 * need. Wire, accounts and rules: {@link "../abi/creator-fee-payee-v22"}.
 *
 * @module creator-fee-payee-v22-builders
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { buildAccountMetas } from "../abi/accounts.js";
import { encodeWithdrawCreatorFee } from "../abi/instructions.js";
import {
  ACCOUNTS_SET_CREATOR_FEE_PAYEE_V22,
  ACCOUNTS_WITHDRAW_CREATOR_FEE_TO_PAYEE_V22,
  creatorFeeClaimRouteV22,
  creatorFeePayeeDestinationV22,
  deriveCreatorFeePayeeV22,
  encodeSetCreatorFeePayeeV22,
  hasCreatorFeePayeeFlagV22,
  MARKET_GROUP_RESOLVED_SLOT_OFF_V22,
  payeeGraceElapsedV22,
} from "../abi/creator-fee-payee-v22.js";
import type { CreatorFeeClaimRouteV22 } from "../abi/creator-fee-payee-v22.js";
import { resolveMarketGeometry } from "../abi/layout.js";
import { deriveVaultAuthority } from "./pda.js";
import { parseAssetControlSequencesV17, parseAssetOracleProfileV17, parseWrapperConfigV17 } from "./slab.js";

// ============================================================================
// Tag 125
// ============================================================================

/** Inputs for {@link buildSetCreatorFeePayeeIxV22}. */
export interface SetCreatorFeePayeeIxArgsV22 {
  programId: PublicKey;
  market: PublicKey;
  /** The asset's LIVE `asset_admin` (signer; pays the record's rent the first time). */
  assetAdmin: PublicKey;
  assetIndex: number;
  /** The asset's live generation (`engine.asset.market_id`). */
  marketId: bigint;
  payee: PublicKey;
  /** Live-read current `authority_epoch` of this asset (the program advances it by one). */
  authorityEpoch: bigint;
}

/**
 * Build tag 125 `SetCreatorFeePayee`. Send it BEFORE the stake `BurnAssetAdmin` (tag 21): after the burn no key can set
 * a payee, and the creator fee then has no claim path (CloseSlab re-books it to the protocol leg).
 *
 * @param a  See {@link SetCreatorFeePayeeIxArgsV22}.
 * @returns The instruction (4 accounts, 51 data bytes).
 * @example
 * ```ts
 * const ix = buildSetCreatorFeePayeeIxV22({ programId, market, assetAdmin: wallet, assetIndex: 0, marketId, payee: wallet, authorityEpoch });
 * ```
 */
export function buildSetCreatorFeePayeeIxV22(a: SetCreatorFeePayeeIxArgsV22): TransactionInstruction {
  const [payeeRecord] = deriveCreatorFeePayeeV22(a.programId, a.market, a.assetIndex);
  return new TransactionInstruction({
    programId: a.programId,
    keys: buildAccountMetas(ACCOUNTS_SET_CREATOR_FEE_PAYEE_V22, {
      assetAdmin: a.assetAdmin, market: a.market, payeeRecord, systemProgram: SystemProgram.programId,
    }),
    data: Buffer.from(encodeSetCreatorFeePayeeV22({
      assetIndex: a.assetIndex, marketId: a.marketId, payee: a.payee, authorityEpoch: a.authorityEpoch,
    })),
  });
}

// ============================================================================
// Tag 90, payee route
// ============================================================================

/** Inputs for {@link buildClaimCreatorFeeToPayeeIxsV22}. */
export interface ClaimCreatorFeeToPayeeArgsV22 {
  programId: PublicKey;
  market: PublicKey;
  /** Any signer (keeper, closer, the payee itself). Pays the payee ATA rent when `createPayeeAta` is on. */
  caller: PublicKey;
  assetIndex: number;
  /** The recorded payee (from {@link decodeCreatorFeePayeeV22} or the planner input). */
  payee: PublicKey;
  /** The market's collateral (vault) mint. */
  vaultMint: PublicKey;
  /** The market's vault token account. */
  vaultToken: PublicKey;
  /** Exact atoms to pay (> 0, <= this asset's pot; asset 0 also draws the legacy market-wide pot). */
  amount: bigint;
  /** Live-read current `authority_epoch` of this asset (check only, not advanced). */
  authorityEpoch: bigint;
  /** Prepend an idempotent create of the payee ATA (default true: tag 90 needs the account to exist). */
  createPayeeAta?: boolean;
}

/**
 * Build the permissionless creator-fee claim to the recorded payee (tag 90, 7 accounts): optional idempotent ATA create,
 * then tag 90 paying `creatorFeePayeeDestinationV22(payee, vaultMint)`. Valid only when the asset's `asset_admin` is
 * burned and p4 bit 3 is set (route "Payee"); otherwise the program refuses (live admin: 8 unless the caller is the
 * admin; burned without payee: 8).
 *
 * @param a  See {@link ClaimCreatorFeeToPayeeArgsV22}.
 * @returns 1 or 2 instructions, in order.
 * @throws If `amount` is not positive.
 * @example
 * ```ts
 * const ixs = buildClaimCreatorFeeToPayeeIxsV22({ programId, market, caller: keeper, assetIndex: 0, payee, vaultMint, vaultToken, amount: owed, authorityEpoch });
 * ```
 */
export function buildClaimCreatorFeeToPayeeIxsV22(a: ClaimCreatorFeeToPayeeArgsV22): TransactionInstruction[] {
  if (a.amount <= 0n) throw new Error("buildClaimCreatorFeeToPayeeIxsV22: amount must be > 0 (tag 90 refuses a zero claim)");
  const [payeeRecord] = deriveCreatorFeePayeeV22(a.programId, a.market, a.assetIndex);
  const [vaultAuthority] = deriveVaultAuthority(a.programId, a.market);
  const payeeToken = creatorFeePayeeDestinationV22(a.payee, a.vaultMint);
  const ixs: TransactionInstruction[] = [];
  if (a.createPayeeAta ?? true) {
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(a.caller, payeeToken, a.payee, a.vaultMint, TOKEN_PROGRAM_ID));
  }
  ixs.push(new TransactionInstruction({
    programId: a.programId,
    keys: buildAccountMetas(ACCOUNTS_WITHDRAW_CREATOR_FEE_TO_PAYEE_V22, {
      caller: a.caller, market: a.market, payeeToken, vaultToken: a.vaultToken, vaultAuthority,
      tokenProgram: TOKEN_PROGRAM_ID, payeeRecord,
    }),
    data: Buffer.from(encodeWithdrawCreatorFee({ amount: a.amount, assetIndex: a.assetIndex, authorityEpoch: a.authorityEpoch })),
  }));
  return ixs;
}

// ============================================================================
// Market reader
// ============================================================================

/** Per-asset creator-fee claim state read from a market account. */
export interface CreatorFeeClaimStateV22 {
  assetIndex: number;
  assetAdmin: PublicKey;
  /** p4 bit 3: a payee is recorded (read the record at {@link deriveCreatorFeePayeeV22} for the wallet). */
  payeeFlag: boolean;
  route: CreatorFeeClaimRouteV22;
  /** What tag 90 can pay for this asset: its own counter, plus (asset 0 only) the legacy market-wide counter. */
  owed: bigint;
  /** Current `authority_epoch` of this asset (tag 90 / tag 125 CAS input). */
  authorityEpoch: bigint;
  /** prog #651: the market is Resolved (engine mode 1). */
  resolved: boolean;
  /** prog #651: engine header `resolved_slot` (the grace anchor; meaningful once resolved). */
  resolvedSlot: bigint;
  /** prog #651: `payeeGraceElapsedV22(resolved, resolvedSlot, nowSlot)`; false when no `nowSlot` was given. */
  payeeGraceOver: boolean;
}

/**
 * Read one asset's creator-fee claim state from a v2.2 market account (profile `asset_admin`, `p4_flags`, the asset's
 * `creator_fee_claimable_atoms`, the legacy `WrapperConfig.creator_fee_claimable_atoms` for asset 0, and the asset's
 * authority epoch).
 *
 * @param marketData  Raw market account bytes.
 * @param assetIndex  Asset slot.
 * @param nowSlot     Current cluster slot (prog #651 grace); omit / null = grace treated as not over.
 * @returns The state.
 * @throws UnknownLayoutError if the account is not a known market layout; Error if the slot is not present.
 * @example
 * ```ts
 * const s = readCreatorFeeClaimStateV22(info.data, 0);
 * if (s.route === "Payee" && s.owed > 0n) { ... }
 * ```
 */
export function readCreatorFeeClaimStateV22(marketData: Uint8Array, assetIndex: number, nowSlot: bigint | null = null): CreatorFeeClaimStateV22 {
  const g = resolveMarketGeometry(marketData, { parser: "readCreatorFeeClaimStateV22", strictLength: false });
  if (!Number.isInteger(assetIndex) || assetIndex < 0 || assetIndex >= g.slotCount) {
    throw new Error(`readCreatorFeeClaimStateV22: asset ${assetIndex} is not present (${g.slotCount} slots)`);
  }
  const slot = g.slotOff(assetIndex);
  const profileOff = slot + g.layout.wrapperSlot.oracleProfile;
  const profile = parseAssetOracleProfileV17(marketData, profileOff);
  const payeeFlag = hasCreatorFeePayeeFlagV22(marketData[profileOff + g.layout.wrapperSlot.profileP4Flags]);
  const legacy = assetIndex === 0 ? parseWrapperConfigV17(marketData).creatorFeeClaimableAtoms : 0n;
  const dv = new DataView(marketData.buffer, marketData.byteOffset, marketData.byteLength);
  const resolved = marketData[g.groupOff + g.layout.group.mode] === 1;
  const resolvedSlot = dv.getBigUint64(g.groupOff + MARKET_GROUP_RESOLVED_SLOT_OFF_V22, true);
  return {
    assetIndex,
    assetAdmin: profile.assetAdmin,
    payeeFlag,
    route: creatorFeeClaimRouteV22(profile.assetAdmin, payeeFlag),
    owed: profile.creatorFeeClaimableAtoms + legacy,
    authorityEpoch: parseAssetControlSequencesV17(marketData, slot).authorityEpoch,
    resolved,
    resolvedSlot,
    payeeGraceOver: payeeGraceElapsedV22(resolved, resolvedSlot, nowSlot),
  };
}
