/**
 * Oracle account parsing utilities.
 *
 * Chainlink aggregator layout on Solana (from Toly's percolator-cli):
 *   offset 138: decimals (u8)
 *   offset 216: latest answer (i64 LE)
 *
 * Minimum account size: 224 bytes (offset 216 + 8 bytes for i64).
 *
 * These utilities validate oracle data BEFORE parsing to prevent silent
 * propagation of stale or malformed Chainlink data as price.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum buffer size to read Chainlink price data */
const CHAINLINK_MIN_SIZE = 224; // 216 + 8

/** Maximum reasonable decimals for a price feed */
const MAX_DECIMALS = 18;

/** Offset of decimals field in Chainlink aggregator account */
const CHAINLINK_DECIMALS_OFFSET = 138;

/** Offset of updated_at timestamp (i64 LE, Unix seconds) in Chainlink aggregator */
const CHAINLINK_TIMESTAMP_OFFSET = 168;

/** Offset of latest answer in Chainlink aggregator account */
const CHAINLINK_ANSWER_OFFSET = 216;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OraclePrice {
  price: bigint;
  decimals: number;
  /** Unix timestamp (seconds) of the last oracle update, if available. */
  updatedAt?: number;
}

export interface ParseChainlinkOptions {
  /** Maximum allowed staleness in seconds. If the oracle update is older, an error is thrown. */
  maxStalenessSeconds?: number;
}

// ---------------------------------------------------------------------------
// Browser-compatible read helpers using DataView
// ---------------------------------------------------------------------------

function readU8(data: Uint8Array, off: number): number {
  return data[off];
}

function readBigInt64LE(data: Uint8Array, off: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigInt64(off, true);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse price data from a Chainlink aggregator account buffer.
 *
 * Validates:
 * - Buffer is large enough to contain the required fields (≥ 224 bytes)
 * - Decimals are in a reasonable range (0-18)
 * - Price is positive (non-zero)
 *
 * @param data - Raw account data from Chainlink aggregator
 * @param options - Optional staleness check (maxStalenessSeconds)
 * @returns Parsed oracle price with decimals and last-update timestamp
 * @throws if the buffer is invalid, contains unreasonable data, or (when
 *   maxStalenessSeconds is set) the last update is older than that bound
 */
export function parseChainlinkPrice(data: Uint8Array, options?: ParseChainlinkOptions): OraclePrice {
  if (data.length < CHAINLINK_MIN_SIZE) {
    throw new Error(
      `Oracle account data too small: ${data.length} bytes (need at least ${CHAINLINK_MIN_SIZE})`
    );
  }

  const decimals = readU8(data, CHAINLINK_DECIMALS_OFFSET);
  if (decimals > MAX_DECIMALS) {
    throw new Error(
      `Oracle decimals out of range: ${decimals} (max ${MAX_DECIMALS})`
    );
  }

  const price = readBigInt64LE(data, CHAINLINK_ANSWER_OFFSET);
  if (price <= 0n) {
    throw new Error(
      `Oracle price is non-positive: ${price}`
    );
  }

  // Read updated_at timestamp (i64 LE at offset 168)
  const updatedAtBig = readBigInt64LE(data, CHAINLINK_TIMESTAMP_OFFSET);
  const updatedAt = Number(updatedAtBig);

  if (options?.maxStalenessSeconds !== undefined && updatedAt > 0) {
    const now = Math.floor(Date.now() / 1000);
    const age = now - updatedAt;
    if (age > options.maxStalenessSeconds) {
      throw new Error(
        `Oracle price is stale: last updated ${age}s ago (max ${options.maxStalenessSeconds}s)`
      );
    }
  }

  return { price, decimals, updatedAt: updatedAt > 0 ? updatedAt : undefined };
}

/**
 * Validate that a buffer looks like a valid Chainlink aggregator account.
 * Returns true if the buffer passes all validation checks, false otherwise.
 * Use this for non-throwing validation.
 */
export function isValidChainlinkOracle(data: Uint8Array): boolean {
  try {
    parseChainlinkPrice(data);
    return true;
  } catch {
    return false;
  }
}

// Re-export constants for consumers
export { CHAINLINK_MIN_SIZE, CHAINLINK_DECIMALS_OFFSET, CHAINLINK_TIMESTAMP_OFFSET, CHAINLINK_ANSWER_OFFSET, MAX_DECIMALS };
