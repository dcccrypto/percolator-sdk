/**
 * Local replacement for the handful of `@solana/spl-token` helpers the SDK uses.
 *
 * Why: importing `@solana/spl-token` at runtime loads ~151 extra modules (its own
 * 125 ESM files plus `@solana/codecs-*`, `spl-token-metadata`/`-group`,
 * `buffer-layout-utils`, `bignumber.js`). That was about half of the SDK's cold
 * import (~280 ms CPU, ~1.5 s wall on a busy box, ~2.4 MB heap) for six trivial
 * names. See the SDK cold-import report of 2026-11-21.
 *
 * Every helper here is a line-for-line port of `@solana/spl-token@0.4.14`
 * (`constants.js`, `state/mint.js`, `state/account.js`,
 * `instructions/associatedTokenAccount.js`, `errors.js`). `test/spl-token-lite-parity.test.ts`
 * checks each one byte for byte against the real package (kept as a devDependency).
 *
 * Difference from spl-token: the error classes below are local, so
 * `err instanceof (spl-token's) TokenOwnerOffCurveError` is false. `err.name` is identical.
 *
 * Internal module: not re-exported from the package barrel.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { AccountInfo, Commitment, Connection } from "@solana/web3.js";

/** SPL Token program id (spl-token `TOKEN_PROGRAM_ID`). */
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
/** Token-2022 program id (spl-token `TOKEN_2022_PROGRAM_ID`). */
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
/** Associated Token Account program id (spl-token `ASSOCIATED_TOKEN_PROGRAM_ID`). */
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** Base class, mirrors spl-token `TokenError`. */
export abstract class TokenError extends Error {
  constructor(message?: string) {
    super(message);
  }
}
/** Owner passed to ATA derivation is a PDA and `allowOwnerOffCurve` was false. */
export class TokenOwnerOffCurveError extends TokenError {
  name = "TokenOwnerOffCurveError";
}
/** Account does not exist. */
export class TokenAccountNotFoundError extends TokenError {
  name = "TokenAccountNotFoundError";
}
/** Account is not owned by the expected token program. */
export class TokenInvalidAccountOwnerError extends TokenError {
  name = "TokenInvalidAccountOwnerError";
}
/** Account data has the wrong length for a token account. */
export class TokenInvalidAccountSizeError extends TokenError {
  name = "TokenInvalidAccountSizeError";
}
/** Account data has a Token-2022 account-type byte that is not `Account`. */
export class TokenInvalidAccountError extends TokenError {
  name = "TokenInvalidAccountError";
}

/** spl-token `getAssociatedTokenAddressSync`. */
export function getAssociatedTokenAddressSync(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  programId: PublicKey = TOKEN_PROGRAM_ID,
  associatedTokenProgramId: PublicKey = ASSOCIATED_TOKEN_PROGRAM_ID,
): PublicKey {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBuffer())) throw new TokenOwnerOffCurveError();
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId,
  );
  return address;
}

/** spl-token `getAssociatedTokenAddress` (async form, same result). */
export async function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  programId: PublicKey = TOKEN_PROGRAM_ID,
  associatedTokenProgramId: PublicKey = ASSOCIATED_TOKEN_PROGRAM_ID,
): Promise<PublicKey> {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBuffer())) throw new TokenOwnerOffCurveError();
  const [address] = await PublicKey.findProgramAddress(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId,
  );
  return address;
}

/** spl-token `createAssociatedTokenAccountIdempotentInstruction` (ATA ix tag 1). */
export function createAssociatedTokenAccountIdempotentInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  programId: PublicKey = TOKEN_PROGRAM_ID,
  associatedTokenProgramId: PublicKey = ASSOCIATED_TOKEN_PROGRAM_ID,
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    programId: associatedTokenProgramId,
    data: Buffer.from([1]),
  });
}

/** Decoded token account; same shape as spl-token `Account`. */
export interface Account {
  address: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  delegate: PublicKey | null;
  delegatedAmount: bigint;
  isInitialized: boolean;
  isFrozen: boolean;
  isNative: boolean;
  rentExemptReserve: bigint | null;
  closeAuthority: PublicKey | null;
  tlvData: Buffer;
}

/** spl-token `ACCOUNT_SIZE` (AccountLayout.span). */
export const ACCOUNT_SIZE = 165;
/** spl-token `MULTISIG_SIZE`; a 355-byte account is a multisig, not a token account. */
const MULTISIG_SIZE = 355;
/** spl-token `ACCOUNT_TYPE_SIZE` and `AccountType.Account`. */
const ACCOUNT_TYPE_SIZE = 1;
const ACCOUNT_TYPE_ACCOUNT = 2;
/** spl-token `AccountState`. */
const STATE_UNINITIALIZED = 0;
const STATE_FROZEN = 2;

/** spl-token `unpackAccount`: same checks, same order, same fields. */
export function unpackAccount(
  address: PublicKey,
  info: AccountInfo<Buffer> | null,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): Account {
  if (!info) throw new TokenAccountNotFoundError();
  if (!info.owner.equals(programId)) throw new TokenInvalidAccountOwnerError();
  if (info.data.length < ACCOUNT_SIZE) throw new TokenInvalidAccountSizeError();

  // AccountLayout: mint(32) owner(32) amount u64 delegateOption u32 delegate(32) state u8
  // isNativeOption u32 isNative u64 delegatedAmount u64 closeAuthorityOption u32 closeAuthority(32)
  const d = info.data;
  const dv = new DataView(d.buffer, d.byteOffset, ACCOUNT_SIZE);
  const key = (o: number) => new PublicKey(d.slice(o, o + 32));
  const delegateOption = dv.getUint32(72, true);
  const state = d[108];
  const isNativeOption = dv.getUint32(109, true);
  const closeAuthorityOption = dv.getUint32(129, true);

  let tlvData = Buffer.alloc(0);
  if (d.length > ACCOUNT_SIZE) {
    if (d.length === MULTISIG_SIZE) throw new TokenInvalidAccountSizeError();
    if (d[ACCOUNT_SIZE] != ACCOUNT_TYPE_ACCOUNT) throw new TokenInvalidAccountError();
    tlvData = d.slice(ACCOUNT_SIZE + ACCOUNT_TYPE_SIZE);
  }

  return {
    address,
    mint: key(0),
    owner: key(32),
    amount: dv.getBigUint64(64, true),
    delegate: delegateOption ? key(76) : null,
    delegatedAmount: dv.getBigUint64(121, true),
    isInitialized: state !== STATE_UNINITIALIZED,
    isFrozen: state === STATE_FROZEN,
    isNative: !!isNativeOption,
    rentExemptReserve: isNativeOption ? dv.getBigUint64(113, true) : null,
    closeAuthority: closeAuthorityOption ? key(133) : null,
    tlvData,
  };
}

/** spl-token `getAccount`. */
export async function getAccount(
  connection: Connection,
  address: PublicKey,
  commitment?: Commitment,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): Promise<Account> {
  const info = await connection.getAccountInfo(address, commitment);
  return unpackAccount(address, info, programId);
}
