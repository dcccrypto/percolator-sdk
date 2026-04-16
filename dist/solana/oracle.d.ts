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
/** Minimum buffer size to read Chainlink price data */
declare const CHAINLINK_MIN_SIZE = 224;
/** Maximum reasonable decimals for a price feed */
declare const MAX_DECIMALS = 18;
/** Offset of decimals field in Chainlink aggregator account */
declare const CHAINLINK_DECIMALS_OFFSET = 138;
/** Offset of latest answer in Chainlink aggregator account */
declare const CHAINLINK_ANSWER_OFFSET = 216;
export interface OraclePrice {
    price: bigint;
    decimals: number;
}
/**
 * Parse price data from a Chainlink aggregator account buffer.
 *
 * Validates:
 * - Buffer is large enough to contain the required fields (≥ 224 bytes)
 * - Decimals are in a reasonable range (0-18)
 * - Price is positive (non-zero)
 *
 * @param data - Raw account data from Chainlink aggregator
 * @returns Parsed oracle price with decimals
 * @throws if the buffer is invalid or contains unreasonable data
 */
export declare function parseChainlinkPrice(data: Uint8Array): OraclePrice;
/**
 * Validate that a buffer looks like a valid Chainlink aggregator account.
 * Returns true if the buffer passes all validation checks, false otherwise.
 * Use this for non-throwing validation.
 */
export declare function isValidChainlinkOracle(data: Uint8Array): boolean;
export { CHAINLINK_MIN_SIZE, CHAINLINK_DECIMALS_OFFSET, CHAINLINK_ANSWER_OFFSET, MAX_DECIMALS };
