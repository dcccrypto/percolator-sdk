/**
 * v2.2 tag 122 `InitLpShareMetadata` instruction builder and PDAs (percolator-prog `docs/v22-lp-share-mint.md`).
 *
 * Account list (9 with a ticker, 7 without): `[0]` payer (signer, writable; funds the record, never handed to Metaplex), `[1]` registry,
 * `[2]` LP share mint, `[3]` Metaplex metadata PDA (w), `[4]` Metaplex program, `[5]` system program, `[6]` fee-payer PDA (w), and only for
 * the ticker form `[7]` the market and `[8]` `config.marketauth` (signer). `[0]` and `[8]` may be the same wallet.
 *
 * @module v22-lp-share
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
/** Metaplex metadata PDA of `mint`: `["metadata", metaqbxx..., mint]` under the Token Metadata program. */
export declare function deriveLpShareMetadataPdaV22(mint: PublicKey): [PublicKey, number];
/** The wrapper's transient fee-payer PDA `["lp_share_meta_payer", mint]` (funded by the caller, drained back in the same instruction). */
export declare function deriveLpShareMetaPayerPdaV22(programId: PublicKey, mint: PublicKey): [PublicKey, number];
export interface InitLpShareMetadataArgsV22 {
    programId: PublicKey;
    market: PublicKey;
    /** Funds the record (needs 30,000,000 lamports held; ~15.1M is the net cost). Signer. */
    payer: PublicKey;
    /** `""` = generic form (anyone). 1..=8 of A-Z 0-9 = ticker form, which also needs `marketauth`. */
    ticker?: string;
    /** `config.marketauth` of the market; REQUIRED for the ticker form (signs the wrapper instruction only). */
    marketauth?: PublicKey;
}
/**
 * Tag 122. Throws on a ticker the program would refuse, or a ticker without `marketauth`.
 * @returns The instruction (7 accounts generic, 9 with a ticker).
 */
export declare function buildInitLpShareMetadataIxV22(a: InitLpShareMetadataArgsV22): TransactionInstruction;
