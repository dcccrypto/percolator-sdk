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

/** Encode MintPositionNft (tag 0). Data: tag(1) + asset_index(u16). */
export function encodeNftMint(assetIndex: number): Uint8Array {
  const assetIndexBuf = u16Buf(assetIndex, "assetIndex");
  const buf = new Uint8Array(3);
  buf[0] = NFT_IX_TAG.MintPositionNft;
  buf.set(assetIndexBuf, 1);
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
 *   4. []                  Portfolio account
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

function u16Buf(value: number, label: string): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${label} must be a u16`);
  }
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, value, true);
  return buf;
}

/**
 * Derive the PositionNft state PDA.
 * Seeds: ["position_nft", portfolio_account, asset_index_u16_LE]
 */
export function deriveNftPda(
  portfolioAccount: PublicKey,
  assetIndex: number,
  programId: PublicKey = NFT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode("position_nft"), portfolioAccount.toBytes(), u16Buf(assetIndex, "assetIndex")],
    programId,
  );
}

/**
 * @deprecated v16 Position NFT mints are fresh signer keypairs, not PDAs.
 */
export function deriveNftMint(
  _portfolioAccount: PublicKey,
  _assetIndex: number,
  _programId: PublicKey = NFT_PROGRAM_ID,
): [PublicKey, number] {
  throw new Error("deriveNftMint: v16 NFT mint is a fresh signer keypair, not a PDA");
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
export const POSITION_NFT_STATE_LEN = 199;
const POSITION_NFT_MAGIC = 0x5045_5243_4e46_5400n;
const POSITION_NFT_VERSION = 2;

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
 * @throws if data is shorter than POSITION_NFT_STATE_LEN (199 bytes) or has an invalid magic/version.
 */
export function parsePositionNftAccount(data: Uint8Array): PositionNftState {
  if (data.length < POSITION_NFT_STATE_LEN) {
    throw new Error(
      `PositionNft account too small: ${data.length} < ${POSITION_NFT_STATE_LEN}`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getBigUint64(0, true);
  if (magic !== POSITION_NFT_MAGIC) {
    throw new Error("PositionNft account has invalid magic");
  }
  if (data[8] !== POSITION_NFT_VERSION) {
    throw new Error(`PositionNft account has invalid version: ${data[8]}`);
  }

  const positionOwnerAtMint = new PublicKey(data.subarray(127, 159));

  return {
    version: data[8],
    bump: data[9],
    portfolioAccount: new PublicKey(data.subarray(10, 42)),
    nftMint: new PublicKey(data.subarray(42, 74)),
    assetIndex: view.getUint32(74, true),
    sideAtMint: data[78],
    basisPosQAtMint: readI128FromView(view, 79),
    fSnapAtMint: readI128FromView(view, 95),
    marketIdAtMint: view.getBigUint64(111, true),
    epochSnapAtMint: view.getBigUint64(119, true),
    positionOwnerAtMint,
    positionOwner: positionOwnerAtMint,
    mintedAt: view.getBigInt64(159, true),
  };
}
