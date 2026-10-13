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
export declare const NFT_ERRORS: Readonly<Record<number, ErrorInfo>>;
/**
 * SPL Token / Token-2022 `TokenError` codes 0..19 (shared by both programs), attributed to the token
 * program id so a token failure (e.g. 1 = insufficient funds) is not decoded as a wrapper error.
 */
export declare const SPL_TOKEN_ERRORS: Readonly<Record<number, ErrorInfo>>;
