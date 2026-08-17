/**
 * Oracle account parsing utilities.
 *
 * Chainlink transmissions-account layout, taken from the DEPLOYED wrapper
 * percolator-prog@19d5d932 (`read_chainlink_price_e6`, src/v16_program.rs:5636)
 * so that this parser and the on-chain program agree byte-for-byte:
 *
 *   CHAINLINK_HEADER_SIZE   = 192
 *   offset   8: version (u8)                     CL_OFF_VERSION
 *   offset 138: decimals (u8)                    CL_OFF_DECIMALS
 *   offset 143: latest_round_id (u32 LE)         CL_OFF_LATEST_ROUND_ID
 *   offset 148: live_length (u32 LE)             CL_OFF_LIVE_LENGTH
 *   offset 200: transmission record              CL_OFF_TRANSMISSION = 8 + 192
 *     +0  (200): slot (u64 LE)                   CL_TRANS_OFF_SLOT
 *     +8  (208): timestamp (u32 LE, Unix secs)   CL_TRANS_OFF_TIMESTAMP
 *     +16 (216): answer (i128 LE)                CL_TRANS_OFF_ANSWER
 *
 * Minimum account size: 248 bytes = 8 + 192 + 48 (CHAINLINK_FEED_MIN_LEN).
 *
 * These utilities validate oracle data BEFORE parsing to prevent silent
 * propagation of stale or malformed Chainlink data as price.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum buffer size to read Chainlink price data.
 * Mirrors the program's CHAINLINK_FEED_MIN_LEN = 8 + CHAINLINK_HEADER_SIZE(192) + 48.
 * The previous value (224) was smaller than the program's own floor, so the SDK
 * accepted buffers the chain rejects — and 224 cannot even hold the 16-byte
 * answer at offset 216.
 */
const CHAINLINK_MIN_SIZE = 248; // 8 + 192 + 48

/** Maximum reasonable decimals for a price feed */
const MAX_DECIMALS = 18;

/** Offset of decimals field in Chainlink aggregator account */
const CHAINLINK_DECIMALS_OFFSET = 138;

/**
 * Offset of the transmission timestamp (u32 LE, Unix seconds).
 * = CL_OFF_TRANSMISSION(200) + CL_TRANS_OFF_TIMESTAMP(8).
 * NOTE: u32, not i64 — the program reads it with read_u32_le.
 */
const CHAINLINK_TIMESTAMP_OFFSET = 208;

/**
 * Offset of the latest answer.
 * = CL_OFF_TRANSMISSION(200) + CL_TRANS_OFF_ANSWER(16).
 */
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
  /**
   * How far ahead of the local clock a publish timestamp may be before it is
   * treated as invalid rather than as clock skew. Defaults to 60s.
   * Only consulted when `maxStalenessSeconds` is set.
   */
  futureToleranceSeconds?: number;
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

function readBigUint64LE(data: Uint8Array, off: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(off, true);
}

function readU32LE(data: Uint8Array, off: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(off, true);
}

/**
 * Default tolerance for a publish timestamp that appears to be in the future.
 *
 * The program compares the feed timestamp against the on-chain clock
 * (`now_unix_ts`) and rejects a negative age. This runs off-chain against
 * `Date.now()`, which is the CLIENT's clock, so an ordinary few seconds of skew
 * between a user's machine and the cluster would otherwise reject a perfectly
 * healthy feed. Allow a small window before treating "in the future" as a fault.
 */
const DEFAULT_FUTURE_TOLERANCE_SECONDS = 60;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse price data from a Chainlink aggregator account buffer.
 *
 * Validates:
 * - Buffer is large enough to contain the required fields (>= 248 bytes, the
 *   program's own CHAINLINK_FEED_MIN_LEN)
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

  // The program reads the answer as a full i128 LE (read_i128_le at
  // v16_program.rs:5657). Reconstruct the same i128 from its low (unsigned) and
  // high (signed) halves rather than reading only the low 8 bytes, which would
  // silently truncate a large answer into a different price than the chain sees.
  //
  // No i64 ceiling is imposed here: that would be STRICTER than the chain. The
  // program feeds the whole i128 to scale_decimal_to_e6 (v16_program.rs:5557),
  // which rejects only `mantissa <= 0`, and then bounds the SCALED result against
  // MAX_ORACLE_PRICE — so a large mantissa with high `decimals` is perfectly valid
  // on-chain. `price` is a bigint and holds the full i128 range.
  const answer =
    (readBigInt64LE(data, CHAINLINK_ANSWER_OFFSET + 8) << 64n) |
    readBigUint64LE(data, CHAINLINK_ANSWER_OFFSET);
  if (answer <= 0n) {
    throw new Error(
      `Oracle price is non-positive: ${answer}`
    );
  }
  const price = answer;

  // Transmission timestamp: u32 LE at offset 208 (see the layout note above).
  const updatedAt = readU32LE(data, CHAINLINK_TIMESTAMP_OFFSET);

  if (options?.maxStalenessSeconds !== undefined) {
    // Mirror the program, which rejects `publish_time <= 0` outright rather than
    // skipping the check: a zero timestamp means the feed has never published,
    // which is maximally stale, not exempt from staleness.
    if (updatedAt <= 0) {
      throw new Error(
        `Oracle has no valid publish timestamp (updatedAt=${updatedAt})`
      );
    }
    const now = Math.floor(Date.now() / 1000);
    const age = now - updatedAt;
    // The program rejects a negative age, but it measures against the on-chain
    // clock. We only have the local one, so a couple of seconds of ordinary skew
    // must not condemn a healthy feed — only an implausible jump ahead should.
    const futureTolerance =
      options.futureToleranceSeconds ?? DEFAULT_FUTURE_TOLERANCE_SECONDS;
    if (age < -futureTolerance) {
      throw new Error(
        `Oracle publish timestamp is ${-age}s in the future (tolerance ${futureTolerance}s) — ` +
        `check the feed or the local clock`
      );
    }
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
