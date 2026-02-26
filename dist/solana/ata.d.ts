import { Connection, PublicKey } from "@solana/web3.js";
import { Account } from "@solana/spl-token";
/**
 * Get the associated token address for an owner and mint.
 * Supports both standard SPL Token and Token2022 via optional tokenProgramId.
 */
export declare function getAta(owner: PublicKey, mint: PublicKey, tokenProgramId?: PublicKey): Promise<PublicKey>;
/**
 * Synchronous version of getAta.
 * Supports both standard SPL Token and Token2022 via optional tokenProgramId.
 */
export declare function getAtaSync(owner: PublicKey, mint: PublicKey, tokenProgramId?: PublicKey): PublicKey;
/**
 * Fetch token account info.
 * Supports both standard SPL Token and Token2022 via optional tokenProgramId.
 * Throws if account doesn't exist.
 */
export declare function fetchTokenAccount(connection: Connection, address: PublicKey, tokenProgramId?: PublicKey): Promise<Account>;
