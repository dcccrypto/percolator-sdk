import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SPL_MINT_DECIMALS_OFFSET } from "./dex-oracle.js";

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
  return tokenProgramOf(await connection.getAccountInfo(mint), mint);
}

/** Owner check shared by {@link detectTokenProgram} and {@link fetchMintInfo}. */
function tokenProgramOf(info: AccountInfo<Buffer> | null, mint: PublicKey): PublicKey {
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
 * One-read form of `detectTokenProgram` + `fetchMintDecimals` for the same mint.
 *
 * Trade prep used to read the mint twice (once for its owner, once for its
 * decimals). This reads it once and returns both. Results and errors match
 * calling `detectTokenProgram(connection, mint)` and then
 * `fetchMintDecimals(connection, mint)` on the same account state.
 *
 * @throws if the mint account doesn't exist, is not owned by SPL Token or
 *         Token-2022, or is too short to hold a mint.
 */
export async function fetchMintInfo(
  connection: Connection,
  mint: PublicKey,
): Promise<{ tokenProgram: PublicKey; decimals: number }> {
  const info = await connection.getAccountInfo(mint);
  const tokenProgram = tokenProgramOf(info, mint);
  // tokenProgramOf threw on null, so info is non-null here.
  const data = info!.data;
  if (data.length <= SPL_MINT_DECIMALS_OFFSET) {
    throw new Error(
      `fetchMintDecimals: account data too short (${data.length} bytes) for mint ${mint.toBase58()}`,
    );
  }
  return { tokenProgram, decimals: data[SPL_MINT_DECIMALS_OFFSET] };
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
