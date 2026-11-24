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
     * treated as invalid rather than as clock skew. Defaults to 0, like the
     * program, which refuses any publish time after its clock (OracleStale).
     * Pass a positive value (e.g. 60) to opt in to a client clock-skew allowance.
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
 * - The header the program checks (percolator-prog rc23 `read_chainlink_price_e12`,
 *   v16_program.rs:12799-12816): discriminator, version != 0,
 *   latest_round_id != 0, live_length == 1, transmission slot != 0 and a
 *   publish timestamp > 0 (always, not only with a staleness bound)
 * - The answer scales into the program's E12 range (`scale_decimal_to_e12`,
 *   v16_program.rs:12671-12687): E12 value non-zero and at most
 *   MAX_ORACLE_PRICE at E6, with no u128 overflow
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
/** A price read the way the program reads it: the leg at E12 and its publish time (Unix seconds). */
export interface OracleLegE12 {
    /** Leg price at E12 (already passed the program's `leg_e12_in_range`). Compose with `composeOraclePriceE6V22`. */
    priceE12: bigint;
    /** Publish time, Unix seconds. */
    publishTime: number;
}
/** Inputs the program takes from the market profile and the clock. */
export interface OracleReadOptions {
    /** Clock time, Unix seconds. Use the cluster clock (`Clock.unix_timestamp`) to match the program exactly. */
    nowUnixTs: number;
    /** Profile `max_staleness_secs`. Age must be in `[0, max]`; a publish time after `now` is refused. */
    maxStalenessSecs: number;
    /** Profile `conf_filter_bps` (0 = no confidence filter, max 10000). */
    confFilterBps: number;
}
/**
 * Read a Pyth Receiver `PriceUpdateV2` account the way the program does (`read_pyth_price_e12`,
 * percolator-prog rc23 v16_program.rs:12579-12629): discriminator, Full verification, feed id, `price > 0`,
 * `|exponent| <= 18`, age in `[0, maxStalenessSecs]`, `conf * 10000 <= price * confFilterBps` (when the filter is on),
 * then the price at E12 inside `leg_e12_in_range`.
 *
 * @param data  Raw `PriceUpdateV2` account bytes.
 * @param o     Expected feed id (32 bytes), clock and profile filters.
 * @returns The E12 leg and its publish time.
 * @throws `Error` for every update the program refuses (message starts with the program error: OracleInvalid,
 *   InvalidOracleKey, OracleStale, OracleConfTooWide).
 * @example
 * ```ts
 * const { priceE12 } = parsePythPriceUpdateV2(info.data, { feedId, nowUnixTs, maxStalenessSecs: 60, confFilterBps: 200 });
 * const markE6 = composeOraclePriceE6V22([priceE12], 0, profile.invert, profile.unitScale, lotExp);
 * ```
 */
export declare function parsePythPriceUpdateV2(data: Uint8Array, o: OracleReadOptions & {
    feedId: Uint8Array;
}): OracleLegE12;
/**
 * Read a Switchboard On-Demand `PullFeedAccountData` account the way the program does (`read_switchboard_price_e12`,
 * percolator-prog rc23 v16_program.rs:12707-12769): discriminator, feed hash set, `min_sample_size > 0`,
 * `num_samples >= min_sample_size`, submission index < 32, result slot and last update non-zero, value > 0,
 * std_dev >= 0, age of the indexed submission in `[0, maxStalenessSecs]`, `std_dev * 10000 <= value * confFilterBps`
 * (when the filter is on), then `value / 1e6` at E12 inside `leg_e12_in_range`.
 *
 * @param data  Raw PullFeed account bytes.
 * @param o     Clock and profile filters.
 * @returns The E12 leg and its publish time.
 * @throws `Error` for every feed the program refuses (OracleInvalid, OracleStale, OracleConfTooWide).
 * @example
 * ```ts
 * const { priceE12 } = parseSwitchboardPullFeedPrice(info.data, { nowUnixTs, maxStalenessSecs: 60, confFilterBps: 0 });
 * ```
 */
export declare function parseSwitchboardPullFeedPrice(data: Uint8Array, o: OracleReadOptions): OracleLegE12;
export { CHAINLINK_MIN_SIZE, CHAINLINK_DECIMALS_OFFSET, CHAINLINK_TIMESTAMP_OFFSET, CHAINLINK_ANSWER_OFFSET, MAX_DECIMALS };
