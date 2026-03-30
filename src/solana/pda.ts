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

// ---------------------------------------------------------------------------
// Creator Lock PDA (PERC-627)
// ---------------------------------------------------------------------------

/**
 * Seed used to derive the creator lock PDA.
 * Matches `creator_lock::CREATOR_LOCK_SEED` in percolator-prog.
 */
export const CREATOR_LOCK_SEED = "creator_lock";

/**
 * Derive the creator lock PDA for a given slab.
 * Seeds: ["creator_lock", slab_key]
 *
 * This PDA is required as accounts[9] in every LpVaultWithdraw instruction
 * since percolator-prog PR#170 (GH#1926 / PERC-8287).
 * Non-creator withdrawers must pass this key; if no lock exists on-chain the
 * enforcement is a no-op. The SDK must ALWAYS include it — passing it is mandatory.
 *
 * @param programId - The percolator program ID.
 * @param slab      - The slab (market) public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [creatorLockPda] = deriveCreatorLockPda(PROGRAM_ID, slabKey);
 * ```
 */
export function deriveCreatorLockPda(
  programId: PublicKey,
  slab: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode(CREATOR_LOCK_SEED), slab.toBytes()],
    programId
  );
}

/**
 * Derive the Pyth Push Oracle PDA for a given feed ID.
 * Seeds: [shard_id(u16 LE, always 0), feed_id(32 bytes)]
 * Program: pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT
 */
export function derivePythPushOraclePDA(feedIdHex: string): [PublicKey, number] {
  const feedId = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    feedId[i] = parseInt(feedIdHex.substring(i * 2, i * 2 + 2), 16);
  }
  const shardBuf = new Uint8Array(2); // shard_id = 0 (u16 LE)
  return PublicKey.findProgramAddressSync(
    [shardBuf, feedId],
    PYTH_PUSH_ORACLE_PROGRAM_ID,
  );
}
