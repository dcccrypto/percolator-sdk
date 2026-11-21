import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "./spl-token-lite.js";
/**
 * Token2022 (Token Extensions) program ID.
 * (Defined in the local spl-token shim so the SDK has a single instance.)
 */
export { TOKEN_2022_PROGRAM_ID };
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
export declare function detectTokenProgram(connection: Connection, mint: PublicKey): Promise<PublicKey>;
/**
 * Check if a given token program ID is Token2022.
 */
export declare function isToken2022(tokenProgramId: PublicKey): boolean;
/**
 * Check if a given token program ID is the standard SPL Token program.
 */
export declare function isStandardToken(tokenProgramId: PublicKey): boolean;
