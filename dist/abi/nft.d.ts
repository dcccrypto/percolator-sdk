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
 * PDA seeds (matches percolator-nft/src/state_v16.rs):
 *   PositionNft state : ["position_nft", portfolio_account, asset_index_u16_LE]
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
/** Encode MintPositionNft (tag 0). Data: tag(1) + asset_index(u16). */
export declare function encodeNftMint(assetIndex: number): Uint8Array;
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
 *   4. []                  Portfolio account
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
 * Seeds: ["position_nft", portfolio_account, asset_index_u16_LE]
 */
export declare function deriveNftPda(portfolioAccount: PublicKey, assetIndex: number, programId?: PublicKey): [PublicKey, number];
/**
 * @deprecated v16 Position NFT mints are fresh signer keypairs, not PDAs.
 */
export declare function deriveNftMint(_portfolioAccount: PublicKey, _assetIndex: number, _programId?: PublicKey): [PublicKey, number];
/**
 * Derive the program-wide mint authority PDA.
 * Seeds: ["mint_authority"]
 */
export declare function deriveMintAuthority(programId?: PublicKey): [PublicKey, number];
/**
 * On-chain PositionNftV16 state (199 bytes, matches percolator-nft/src/state_v16.rs).
 *
 *   [0..8]     magic             u64 ("PERCNFT\0")
 *   [8]        version           u8
 *   [9]        bump              u8
 *   [10..42]   portfolio_account [u8; 32]
 *   [42..74]   nft_mint          [u8; 32]
 *   [74..78]   asset_index       u32 LE
 *   [78]       side_at_mint      u8
 *   [79..95]   basis_pos_q_at_mint i128
 *   [95..111]  f_snap_at_mint    i128
 *   [111..119] market_id_at_mint u64
 *   [119..127] epoch_snap_at_mint u64
 *   [127..159] position_owner_at_mint [u8; 32]
 *   [159..167] minted_at         i64
 *   [167..199] _reserved
 */
export declare const POSITION_NFT_STATE_LEN = 199;
export interface PositionNftState {
    version: number;
    bump: number;
    portfolioAccount: PublicKey;
    nftMint: PublicKey;
    assetIndex: number;
    sideAtMint: number;
    basisPosQAtMint: bigint;
    fSnapAtMint: bigint;
    marketIdAtMint: bigint;
    epochSnapAtMint: bigint;
    positionOwnerAtMint: PublicKey;
    /** Backward-compatible alias for positionOwnerAtMint. */
    positionOwner: PublicKey;
    mintedAt: bigint;
}
/**
 * Parse a PositionNft account from raw bytes.
 * @throws if data is shorter than POSITION_NFT_STATE_LEN (199 bytes) or has an invalid magic/version.
 */
export declare function parsePositionNftAccount(data: Uint8Array): PositionNftState;
export {};
