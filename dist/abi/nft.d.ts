/**
 * Standalone percolator-nft program SDK module.
 *
 * This covers the NFT program at `PERCOLATOR_NFT_PROGRAM_ID` which is
 * separate from the main Percolator program. It handles:
 *   - MintPositionNft (tag 0)
 *   - BurnPositionNft (tag 1)
 *   - SettleFunding   (tag 2)
 *   - GetPositionValue (tag 3)
 *   - ExecuteTransferHook (tag 4, SPL interface — not called directly)
 *   - EmergencyBurn   (tag 5)
 *
 * PDA seeds (matches percolator-nft/src/state.rs):
 *   PositionNft state : ["position_nft",      slab, user_idx_u16_LE]
 *   PositionNft mint  : ["position_nft_mint", slab, user_idx_u16_LE]
 *   Mint authority    : ["mint_authority"]
 */
import { PublicKey } from "@solana/web3.js";
/** The standalone percolator-nft program (TransferHook + mint authority). */
export declare const NFT_PROGRAM_ID: PublicKey;
export declare function getNftProgramId(): PublicKey;
export declare const NFT_IX_TAG: {
    readonly MintPositionNft: 0;
    readonly BurnPositionNft: 1;
    readonly SettleFunding: 2;
    readonly GetPositionValue: 3;
    readonly ExecuteTransferHook: 4;
    readonly EmergencyBurn: 5;
};
/** Encode MintPositionNft (tag 0). Data: tag(1) + user_idx(2). */
export declare function encodeNftMint(userIdx: number): Uint8Array;
/** Encode BurnPositionNft (tag 1). Data: tag(1). */
export declare function encodeNftBurn(): Uint8Array;
/** Encode SettleFunding (tag 2). Data: tag(1). */
export declare function encodeNftSettleFunding(): Uint8Array;
/** Encode EmergencyBurn (tag 5). Data: tag(1). */
export declare function encodeNftEmergencyBurn(): Uint8Array;
type AccountMeta = "s" | "w" | "sw" | "r";
/**
 * Account metas for MintPositionNft (tag 0).
 *
 *   0. [signer, writable]  payer / position owner
 *   1. [writable]          PositionNft PDA (created)
 *   2. [writable, signer]  NFT mint (Token-2022, fresh keypair)
 *   3. [writable]          Owner's NFT ATA (created)
 *   4. []                  Slab account
 *   5. []                  Mint authority PDA
 *   6. []                  Token-2022 program
 *   7. []                  Associated token account program
 *   8. []                  System program
 *   9. [writable]          ExtraAccountMetaList PDA
 */
export declare const ACCOUNTS_NFT_MINT: AccountMeta[];
/**
 * Account metas for BurnPositionNft (tag 1).
 *
 *   0. [signer]    NFT holder
 *   1. [writable]  PositionNft PDA (closed)
 *   2. [writable]  NFT mint (supply → 0)
 *   3. [writable]  Holder's NFT ATA (closed)
 *   4. []          Slab account
 *   5. []          Mint authority PDA
 *   6. []          Token-2022 program
 */
export declare const ACCOUNTS_NFT_BURN: AccountMeta[];
/**
 * Account metas for EmergencyBurn (tag 5).
 *
 *   0. [signer]    NFT holder
 *   1. [writable]  PositionNft PDA (closed)
 *   2. [writable]  NFT mint
 *   3. [writable]  Holder's NFT ATA
 *   4. []          Slab account
 *   5. []          Mint authority PDA
 *   6. []          Token-2022 program
 */
export declare const ACCOUNTS_NFT_EMERGENCY_BURN: AccountMeta[];
/**
 * Derive the PositionNft state PDA.
 * Seeds: ["position_nft", slab, user_idx_u16_LE]
 */
export declare function deriveNftPda(slab: PublicKey, userIdx: number, programId?: PublicKey): [PublicKey, number];
/**
 * Derive the PositionNft mint PDA.
 * Seeds: ["position_nft_mint", slab, user_idx_u16_LE]
 */
export declare function deriveNftMint(slab: PublicKey, userIdx: number, programId?: PublicKey): [PublicKey, number];
/**
 * Derive the program-wide mint authority PDA.
 * Seeds: ["mint_authority"]
 */
export declare function deriveMintAuthority(programId?: PublicKey): [PublicKey, number];
/**
 * On-chain PositionNft state (208 bytes, matches percolator-nft/src/state.rs).
 *
 *   [0..8]     magic             u64
 *   [8]        version           u8
 *   [9]        bump              u8
 *   [10..16]   _pad0
 *   [16..48]   slab              [u8; 32]
 *   [48..50]   user_idx          u16 LE
 *   [50..56]   _pad1
 *   [56..88]   nft_mint          [u8; 32]
 *   [88..96]   entry_price_e6    u64
 *   [96..104]  position_size     u64
 *   [104]      is_long           u8
 *   [105..112] _pad2
 *   [112..128] position_basis_q  i128
 *   [128..144] last_funding_index_e18  i128
 *   [144..152] minted_at         i64
 *   [152..160] account_id        u64
 *   [160..192] position_owner    [u8; 32]
 *   [192..208] _reserved
 */
export declare const POSITION_NFT_STATE_LEN = 208;
export interface PositionNftState {
    version: number;
    bump: number;
    slab: PublicKey;
    userIdx: number;
    nftMint: PublicKey;
    positionOwner: PublicKey;
    entryPriceE6: bigint;
    positionSize: bigint;
    isLong: boolean;
    positionBasisQ: bigint;
    lastFundingIndexE18: bigint;
    mintedAt: bigint;
    accountId: bigint;
}
/**
 * Parse a PositionNft account from raw bytes.
 * @throws if data is shorter than POSITION_NFT_STATE_LEN (208 bytes).
 */
export declare function parsePositionNftAccount(data: Uint8Array): PositionNftState;
export {};
