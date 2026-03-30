import { Connection, PublicKey } from "@solana/web3.js";
/**
 * Token2022 (Token Extensions) program ID.
 */
export declare const TOKEN_2022_PROGRAM_ID: PublicKey;
/**
 * Detect which token program owns a given mint account.
 * Returns the owner program ID (TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID).
 * Throws if the mint account doesn't exist.
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
