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
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { AccountInfo, Commitment, Connection } from "@solana/web3.js";
/** SPL Token program id (spl-token `TOKEN_PROGRAM_ID`). */
export declare const TOKEN_PROGRAM_ID: PublicKey;
/** Token-2022 program id (spl-token `TOKEN_2022_PROGRAM_ID`). */
export declare const TOKEN_2022_PROGRAM_ID: PublicKey;
/** Associated Token Account program id (spl-token `ASSOCIATED_TOKEN_PROGRAM_ID`). */
export declare const ASSOCIATED_TOKEN_PROGRAM_ID: PublicKey;
/** Base class, mirrors spl-token `TokenError`. */
export declare abstract class TokenError extends Error {
    constructor(message?: string);
}
/** Owner passed to ATA derivation is a PDA and `allowOwnerOffCurve` was false. */
export declare class TokenOwnerOffCurveError extends TokenError {
    name: string;
}
/** Account does not exist. */
export declare class TokenAccountNotFoundError extends TokenError {
    name: string;
}
/** Account is not owned by the expected token program. */
export declare class TokenInvalidAccountOwnerError extends TokenError {
    name: string;
}
/** Account data has the wrong length for a token account. */
export declare class TokenInvalidAccountSizeError extends TokenError {
    name: string;
}
/** Account data has a Token-2022 account-type byte that is not `Account`. */
export declare class TokenInvalidAccountError extends TokenError {
    name: string;
}
/** spl-token `getAssociatedTokenAddressSync`. */
export declare function getAssociatedTokenAddressSync(mint: PublicKey, owner: PublicKey, allowOwnerOffCurve?: boolean, programId?: PublicKey, associatedTokenProgramId?: PublicKey): PublicKey;
/** spl-token `getAssociatedTokenAddress` (async form, same result). */
export declare function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey, allowOwnerOffCurve?: boolean, programId?: PublicKey, associatedTokenProgramId?: PublicKey): Promise<PublicKey>;
/** spl-token `createAssociatedTokenAccountIdempotentInstruction` (ATA ix tag 1). */
export declare function createAssociatedTokenAccountIdempotentInstruction(payer: PublicKey, associatedToken: PublicKey, owner: PublicKey, mint: PublicKey, programId?: PublicKey, associatedTokenProgramId?: PublicKey): TransactionInstruction;
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
export declare const ACCOUNT_SIZE = 165;
/** spl-token `unpackAccount`: same checks, same order, same fields. */
export declare function unpackAccount(address: PublicKey, info: AccountInfo<Buffer> | null, programId?: PublicKey): Account;
/** spl-token `getAccount`. */
export declare function getAccount(connection: Connection, address: PublicKey, commitment?: Commitment, programId?: PublicKey): Promise<Account>;
