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
/**
 * Minimum buffer size to read Chainlink price data.
 * Mirrors the program's CHAINLINK_FEED_MIN_LEN = 8 + CHAINLINK_HEADER_SIZE(192) + 48.
 * The previous value (224) was smaller than the program's own floor, so the SDK
 * accepted buffers the chain rejects — and 224 cannot even hold the 16-byte
 * answer at offset 216.
 */
declare const CHAINLINK_MIN_SIZE = 248;
/** Maximum reasonable decimals for a price feed */
declare const MAX_DECIMALS = 18;
/** Offset of decimals field in Chainlink aggregator account */
declare const CHAINLINK_DECIMALS_OFFSET = 138;
/**
 * Offset of the transmission timestamp (u32 LE, Unix seconds).
 * = CL_OFF_TRANSMISSION(200) + CL_TRANS_OFF_TIMESTAMP(8).
 * NOTE: u32, not i64 — the program reads it with read_u32_le.
 */
declare const CHAINLINK_TIMESTAMP_OFFSET = 208;
/**
 * Offset of the latest answer.
 * = CL_OFF_TRANSMISSION(200) + CL_TRANS_OFF_ANSWER(16).
 */
declare const CHAINLINK_ANSWER_OFFSET = 216;
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
export declare function parseChainlinkPrice(data: Uint8Array, options?: ParseChainlinkOptions): OraclePrice;
/**
 * Validate that a buffer looks like a valid Chainlink aggregator account.
 * Returns true if the buffer passes all validation checks, false otherwise.
 * Use this for non-throwing validation.
 */
export declare function isValidChainlinkOracle(data: Uint8Array): boolean;
export { CHAINLINK_MIN_SIZE, CHAINLINK_DECIMALS_OFFSET, CHAINLINK_TIMESTAMP_OFFSET, CHAINLINK_ANSWER_OFFSET, MAX_DECIMALS };
