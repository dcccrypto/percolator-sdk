import { PublicKey } from "@solana/web3.js";
/**
 * Encode u8 (1 byte)
 */
export declare function encU8(val: number): Uint8Array;
/**
 * Encode u16 little-endian (2 bytes)
 */
export declare function encU16(val: number): Uint8Array;
/**
 * Encode u32 little-endian (4 bytes)
 */
export declare function encU32(val: number): Uint8Array;
/**
 * Encode u64 little-endian (8 bytes)
 * Input: bigint or string (decimal)
 */
export declare function encU64(val: bigint | string): Uint8Array;
/**
 * Encode i64 little-endian (8 bytes), two's complement
 * Input: bigint or string (decimal, may be negative)
 */
export declare function encI64(val: bigint | string): Uint8Array;
/**
 * Encode u128 little-endian (16 bytes)
 * Input: bigint or string (decimal)
 */
export declare function encU128(val: bigint | string): Uint8Array;
/**
 * Encode i128 little-endian (16 bytes), two's complement
 * Input: bigint or string (decimal, may be negative)
 */
export declare function encI128(val: bigint | string): Uint8Array;
/**
 * Encode a PublicKey (32 bytes)
 * Input: PublicKey or base58 string
 */
export declare function encPubkey(val: PublicKey | string): Uint8Array;
/**
 * Encode a boolean as u8 (0 = false, 1 = true)
 */
export declare function encBool(val: boolean): Uint8Array;
/**
 * Concatenate multiple Uint8Arrays (replaces Buffer.concat)
 */
export declare function concatBytes(...arrays: Uint8Array[]): Uint8Array;
