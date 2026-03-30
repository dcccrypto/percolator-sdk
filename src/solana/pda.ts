import { PublicKey } from "@solana/web3.js";

const textEncoder = new TextEncoder();

/**
 * Derive vault authority PDA.
 * Seeds: ["vault", slab_key]
 */
export function deriveVaultAuthority(
  programId: PublicKey,
  slab: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("vault"), slab.toBytes()],
    programId
  );
}

/**
 * Derive insurance LP mint PDA.
 * Seeds: ["ins_lp", slab_key]
 */
export function deriveInsuranceLpMint(
  programId: PublicKey,
  slab: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("ins_lp"), slab.toBytes()],
    programId
  );
}

/**
 * Derive LP PDA for TradeCpi.
 * Seeds: ["lp", slab_key, lp_idx as u16 LE]
 */
export function deriveLpPda(
  programId: PublicKey,
  slab: PublicKey,
  lpIdx: number
): [PublicKey, number] {
  const idxBuf = new Uint8Array(2);
  new DataView(idxBuf.buffer).setUint16(0, lpIdx, true);
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("lp"), slab.toBytes(), idxBuf],
    programId
  );
}

/**
 * Derive keeper fund PDA.
 * Seeds: ["keeper_fund", slab_key]
 */
export function deriveKeeperFund(
  programId: PublicKey,
  slab: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("keeper_fund"), slab.toBytes()],
    programId
  );
}

// ---------------------------------------------------------------------------
// DEX Program IDs
// ---------------------------------------------------------------------------

/** PumpSwap AMM program ID. */
export const PUMPSWAP_PROGRAM_ID = new PublicKey(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);

/** Raydium CLMM (Concentrated Liquidity) program ID. */
export const RAYDIUM_CLMM_PROGRAM_ID = new PublicKey(
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"
);

/** Meteora DLMM (Dynamic Liquidity Market Maker) program ID. */
export const METEORA_DLMM_PROGRAM_ID = new PublicKey(
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
);

// ---------------------------------------------------------------------------
// Pyth Push Oracle
// ---------------------------------------------------------------------------

/** Pyth Push Oracle program on mainnet. */
export const PYTH_PUSH_ORACLE_PROGRAM_ID = new PublicKey(
  "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT"
);

/** 32-byte feed id as 64 hex digits (optionally prefixed with `0x`). */
const PYTH_FEED_ID_HEX_LEN = 64;

function normalizePythFeedIdHex(feedIdHex: string): string {
  let s = feedIdHex.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) {
    s = s.slice(2);
  }
  return s;
}

/**
 * Derive the Pyth Push Oracle PDA for a given feed ID.
 * Seeds: [shard_id(u16 LE, always 0), feed_id(32 bytes)]
 * Program: pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT
 */
export function derivePythPushOraclePDA(feedIdHex: string): [PublicKey, number] {
  const normalized = normalizePythFeedIdHex(feedIdHex);
  if (normalized.length !== PYTH_FEED_ID_HEX_LEN) {
    throw new Error(
      `derivePythPushOraclePDA: feedIdHex must be ${PYTH_FEED_ID_HEX_LEN} hex digits (32 bytes); got length ${normalized.length}`,
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(
      "derivePythPushOraclePDA: feedIdHex must contain only hexadecimal digits",
    );
  }
  const feedId = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    feedId[i] = parseInt(normalized.substring(i * 2, i * 2 + 2), 16);
  }
  const shardBuf = new Uint8Array(2); // shard_id = 0 (u16 LE)
  return PublicKey.findProgramAddressSync(
    [shardBuf, feedId],
    PYTH_PUSH_ORACLE_PROGRAM_ID,
  );
}
