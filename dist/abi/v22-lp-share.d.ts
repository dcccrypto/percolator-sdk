/**
 * v2.2 LP / Earn share token identity (tag 122 `InitLpShareMetadata`): ticker rules, the name / symbol / uri the wrapper writes, and a
 * reader for the Metaplex metadata record it creates.
 *
 * Source of truth: percolator-prog `release/v22-wrapper-rem` `src/lp_share_meta_v22.rs` and `docs/v22-lp-share-mint.md` (security review
 * 2026-10-08, R1-R11). Pure functions; the instruction builder and PDAs are in `../solana/v22-lp-share.ts`.
 *
 * The ticker is chosen by the market creator and is NOT verified by Percolator. The record is cosmetic: no instruction of the program reads it.
 *
 * @module v22-lp-share
 */
import { PublicKey } from "@solana/web3.js";
import type { AccountSpec } from "./accounts.js";
export declare const LP_SHARE_TICKER_MAX_V22 = 8;
export declare const LP_SHARE_NAME_PREFIX_V22 = "Percolator Earn Share ";
export declare const LP_SHARE_NAME_MARKET_CHARS_V22 = 8;
export declare const LP_SHARE_GENERIC_SYMBOL_V22 = "pEARN";
export declare const LP_SHARE_TICKER_NAME_PREFIX_V22 = "Percolator Earn ";
export declare const LP_SHARE_TICKER_NAME_MARKET_CHARS_V22 = 6;
export declare const LP_SHARE_SYMBOL_PREFIX_V22 = "pe";
/** Metaplex field limits the wrapper pins. */
export declare const MPL_MAX_NAME_LEN_V22 = 32;
export declare const MPL_MAX_SYMBOL_LEN_V22 = 10;
export declare const MPL_MAX_URI_LEN_V22 = 200;
/** Build-time constants of the wrapper (`lp_share_meta_v22.rs`). The uri a record carries is fixed at birth by the program build. */
export declare const LP_SHARE_URI_BASE_DEVNET_V22 = "https://play.percolator.trade";
/** FOUNDER DECISION pending (the builder's default); confirm before a mainnet build. */
export declare const LP_SHARE_URI_BASE_MAINNET_V22 = "https://percolator.trade";
export declare const LP_SHARE_URI_PATH_V22 = "/api/earn-share/";
/** Lamports the caller must HOLD to create a record (net cost is ~15.1M; the rest comes back in the same instruction). */
export declare const LP_SHARE_META_FUND_LAMPORTS_V22 = 30000000n;
/** Metaplex Token Metadata program. */
export declare const METAPLEX_TOKEN_METADATA_PROGRAM_ID_V22: PublicKey;
/**
 * Reduce a market symbol to the ticker the wrapper accepts: uppercase, drop every character outside `A-Z 0-9`, keep the first 8.
 * An empty result means "send the generic form" (`n = 0`); the program never truncates, it refuses.
 * @example lpShareTickerFromSymbolV22("1000pepe") === "1000PEPE"; lpShareTickerFromSymbolV22("$wif-2") === "WIF2"; lpShareTickerFromSymbolV22("日本") === ""
 */
export declare function lpShareTickerFromSymbolV22(symbol: string | null | undefined): string;
/** The program's ticker check: 1..=8 bytes, each `A-Z` or `0-9`. */
export declare function isLpShareTickerV22(ticker: string): boolean;
export interface LpShareIdentityV22 {
    name: string;
    symbol: string;
    uri: string;
    /** `true` = ticker form (immutable record), `false` = generic (mutable). */
    ticker: boolean;
}
/**
 * The name, symbol and uri the wrapper writes for `market`. Ticker form when `ticker` is non-empty (throws if it is not
 * {@link isLpShareTickerV22}); generic form otherwise. `uriBase` is the build's constant (devnet or mainnet).
 */
export declare function lpShareIdentityV22(market: PublicKey, ticker: string, uriBase?: string): LpShareIdentityV22;
/** The fields of a Metaplex `MetadataV1` the share endpoint and the app need. Strings have their NUL padding trimmed. */
export interface LpShareMetadataRecordV22 {
    updateAuthority: PublicKey;
    mint: PublicKey;
    name: string;
    symbol: string;
    uri: string;
    isMutable: boolean;
}
/**
 * Read a Metaplex metadata account. Strict: returns `null` (never throws) for anything that does not parse as a `MetadataV1`
 * (wrong key byte, a string over the Metaplex limit, bad option tags, truncation). The caller must still check the account owner
 * (Metaplex program), `updateAuthority` (the registry PDA) and `mint` (the share mint) before trusting name / symbol: a record that is
 * not ours says whatever its creator wanted.
 */
export declare function parseLpShareMetadataRecordV22(data: Uint8Array): LpShareMetadataRecordV22 | null;
/**
 * InitLpShareMetadata (tag 122) accounts: 7 for the generic form (ticker length 0), 9 with a ticker.
 * `[7]` market and `[8]` marketauth (signer) are only passed when the data carries a ticker ({@link ACCOUNTS_INIT_LP_SHARE_METADATA_TICKER_TAIL}).
 */
export declare const ACCOUNTS_INIT_LP_SHARE_METADATA: readonly AccountSpec[];
/** Extra accounts of the ticker form of tag 122: market (read-only) then marketauth (signer). */
export declare const ACCOUNTS_INIT_LP_SHARE_METADATA_TICKER_TAIL: readonly AccountSpec[];
