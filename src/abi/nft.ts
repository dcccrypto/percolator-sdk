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
import { safeEnv } from "../config/program-ids.js";

// ---------------------------------------------------------------------------
// Program ID
// ---------------------------------------------------------------------------

const NFT_PROGRAM_OVERRIDE = safeEnv("NFT_PROGRAM_ID");

/** The standalone percolator-nft program (TransferHook + mint authority). */
export const NFT_PROGRAM_ID = new PublicKey(
  NFT_PROGRAM_OVERRIDE ?? "FqhKJT9gtScjrmfUuRMjeg7cXNpif1fqsy5Jh65tJmTS",
);

export function getNftProgramId(): PublicKey {
  return NFT_PROGRAM_ID;
}

// ---------------------------------------------------------------------------
// Instruction tags (standalone NFT program — NOT the main Percolator tags)
// ---------------------------------------------------------------------------

export const NFT_IX_TAG = {
  MintPositionNft: 0,
  BurnPositionNft: 1,
  SettleFunding: 2,
  GetPositionValue: 3,
  ExecuteTransferHook: 4,
  EmergencyBurn: 5,
} as const;

// ---------------------------------------------------------------------------
// Instruction encoders
// ---------------------------------------------------------------------------

/** Encode MintPositionNft (tag 0). Data: tag(1) + user_idx(2). */
export function encodeNftMint(userIdx: number): Uint8Array {
  const buf = new Uint8Array(3);
  buf[0] = NFT_IX_TAG.MintPositionNft;
  buf[1] = userIdx & 0xff;
  buf[2] = (userIdx >> 8) & 0xff;
  return buf;
}

/** Encode BurnPositionNft (tag 1). Data: tag(1). */
export function encodeNftBurn(): Uint8Array {
  return new Uint8Array([NFT_IX_TAG.BurnPositionNft]);
}

/** Encode SettleFunding (tag 2). Data: tag(1). */
export function encodeNftSettleFunding(): Uint8Array {
  return new Uint8Array([NFT_IX_TAG.SettleFunding]);
}

/** Encode EmergencyBurn (tag 5). Data: tag(1). */
export function encodeNftEmergencyBurn(): Uint8Array {
  return new Uint8Array([NFT_IX_TAG.EmergencyBurn]);
}

// ---------------------------------------------------------------------------
// Account meta templates
// ---------------------------------------------------------------------------

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
export const ACCOUNTS_NFT_MINT: AccountMeta[] = [
  "sw", "w", "sw", "w", "r", "r", "r", "r", "r", "w",
];

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
export const ACCOUNTS_NFT_BURN: AccountMeta[] = [
  "s", "w", "w", "w", "r", "r", "r",
];

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
export const ACCOUNTS_NFT_EMERGENCY_BURN: AccountMeta[] = [
  "s", "w", "w", "w", "r", "r", "r",
];

// ---------------------------------------------------------------------------
// PDA derivation
// ---------------------------------------------------------------------------

const TEXT = new TextEncoder();

function idxBuf(userIdx: number): Uint8Array {
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, userIdx, true);
  return buf;
}

/**
 * Derive the PositionNft state PDA.
 * Seeds: ["position_nft", slab, user_idx_u16_LE]
 */
export function deriveNftPda(
  slab: PublicKey,
  userIdx: number,
  programId: PublicKey = NFT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode("position_nft"), slab.toBytes(), idxBuf(userIdx)],
    programId,
  );
}

/**
 * Derive the PositionNft mint PDA.
 * Seeds: ["position_nft_mint", slab, user_idx_u16_LE]
 */
export function deriveNftMint(
  slab: PublicKey,
  userIdx: number,
  programId: PublicKey = NFT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode("position_nft_mint"), slab.toBytes(), idxBuf(userIdx)],
    programId,
  );
}

/**
 * Derive the program-wide mint authority PDA.
 * Seeds: ["mint_authority"]
 */
export function deriveMintAuthority(
  programId: PublicKey = NFT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode("mint_authority")],
    programId,
  );
}

// ---------------------------------------------------------------------------
// Account parser
// ---------------------------------------------------------------------------

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
 *   [160..208] _reserved
 */
export const POSITION_NFT_STATE_LEN = 208;

export interface PositionNftState {
  version: number;
  bump: number;
  slab: PublicKey;
  userIdx: number;
  nftMint: PublicKey;
  entryPriceE6: bigint;
  positionSize: bigint;
  isLong: boolean;
  positionBasisQ: bigint;
  lastFundingIndexE18: bigint;
  mintedAt: bigint;
  accountId: bigint;
}

/**
 * Read a little-endian signed i128 from a DataView at `offset`.
 *
 * Both 64-bit halves are read as UNSIGNED to avoid the sign-extension that
 * `getBigInt64` applies to the low half. If bit 127 of the combined 128-bit
 * value is set the result is negative and two's-complement sign extension is
 * applied explicitly.
 *
 * Bug fixed (S-3): the prior code used `getBigInt64` for the low half, which
 * returns a *signed* BigInt. When bit 63 of the low half is set the value is
 * negative (e.g. -1 rather than 0xffffffffffffffff), so OR-ing it with the
 * shifted high half collapses the sign bit into all high bits and corrupts the
 * result.
 *
 * @param view   DataView wrapping the raw account bytes
 * @param offset Byte offset of the i128 field (little-endian)
 * @returns      Signed BigInt in the range [-2^127, 2^127)
 */
function readI128FromView(view: DataView, offset: number): bigint {
  const lo = view.getBigUint64(offset, true);
  const hi = view.getBigUint64(offset + 8, true);
  const unsigned = (hi << 64n) | lo;
  const SIGN_BIT = 1n << 127n;
  if (unsigned >= SIGN_BIT) {
    return unsigned - (1n << 128n);
  }
  return unsigned;
}

/**
 * Parse a PositionNft account from raw bytes.
 * @throws if data is shorter than POSITION_NFT_STATE_LEN (208 bytes).
 */
export function parsePositionNftAccount(data: Uint8Array): PositionNftState {
  if (data.length < POSITION_NFT_STATE_LEN) {
    throw new Error(
      `PositionNft account too small: ${data.length} < ${POSITION_NFT_STATE_LEN}`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  return {
    version: data[8],
    bump: data[9],
    slab: new PublicKey(data.subarray(16, 48)),
    userIdx: view.getUint16(48, true),
    nftMint: new PublicKey(data.subarray(56, 88)),
    entryPriceE6: view.getBigUint64(88, true),
    positionSize: view.getBigUint64(96, true),
    isLong: data[104] === 1,
    positionBasisQ: readI128FromView(view, 112),
    lastFundingIndexE18: readI128FromView(view, 128),
    mintedAt: view.getBigInt64(144, true),
    accountId: view.getBigUint64(152, true),
  };
}
