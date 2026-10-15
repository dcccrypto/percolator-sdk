import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);
async function detectTokenProgram(connection, mint) {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint account not found: ${mint.toBase58()}`);
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  throw new Error(
    `Account ${mint.toBase58()} is not a token mint: owner ${info.owner.toBase58()} is neither SPL Token (${TOKEN_PROGRAM_ID.toBase58()}) nor Token-2022 (${TOKEN_2022_PROGRAM_ID.toBase58()})`
  );
}
function isToken2022(tokenProgramId) {
  return tokenProgramId.equals(TOKEN_2022_PROGRAM_ID);
}
function isStandardToken(tokenProgramId) {
  return tokenProgramId.equals(TOKEN_PROGRAM_ID);
}
export {
  TOKEN_2022_PROGRAM_ID,
  detectTokenProgram,
  isStandardToken,
  isToken2022
};
//# sourceMappingURL=token-program.js.map