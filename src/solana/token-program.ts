import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

/**
 * Token2022 (Token Extensions) program ID.
 */
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);

/**
 * Detect which token program owns a given mint account.
 * Returns the canonical program ID — TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID.
 *
 * #266: previously this returned `info.owner` verbatim, which FAILS OPEN — an
 * attacker-controlled account owned by an arbitrary program (or a non-mint
 * account) would be accepted and its owner propagated as the "token program",
 * letting a forged program be passed into a later token CPI. Now we branch on
 * the owner and accept ONLY the two real token programs, throwing otherwise.
 *
 * @throws if the mint account doesn't exist, or is not owned by SPL Token or
 *         Token-2022.
 */
export async function detectTokenProgram(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint account not found: ${mint.toBase58()}`);

  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;

  throw new Error(
    `Account ${mint.toBase58()} is not a token mint: owner ${info.owner.toBase58()} ` +
      `is neither SPL Token (${TOKEN_PROGRAM_ID.toBase58()}) nor ` +
      `Token-2022 (${TOKEN_2022_PROGRAM_ID.toBase58()})`,
  );
}

/**
 * Check if a given token program ID is Token2022.
 */
export function isToken2022(tokenProgramId: PublicKey): boolean {
  return tokenProgramId.equals(TOKEN_2022_PROGRAM_ID);
}

/**
 * Check if a given token program ID is the standard SPL Token program.
 */
export function isStandardToken(tokenProgramId: PublicKey): boolean {
  return tokenProgramId.equals(TOKEN_PROGRAM_ID);
}

/**
 * Throws unless `tokenProgram` is the classic SPL Token program. The close /
 * wind-down planners move vault balances with plain `Transfer`, which a
 * Token-2022 mint (e.g. with a TransferFee extension) would short-change.
 */
export function assertClassicTokenProgram(fn: string, tokenProgram: PublicKey): void {
  if (!tokenProgram.equals(TOKEN_PROGRAM_ID)) {
    throw new Error(
      `${fn}: tokenProgram ${tokenProgram.toBase58()} is not the classic SPL Token program (${TOKEN_PROGRAM_ID.toBase58()}); Token-2022 mints (e.g. TransferFee) are not supported here and would mis-account the vault.`,
    );
  }
}
