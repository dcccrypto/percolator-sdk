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
import { legE12InRangeV22, MAX_ORACLE_EXPO_ABS_V22, pythLegE12V22 } from "../abi/v22-lot.js";

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
   * treated as invalid rather than as clock skew. Defaults to 0, like the
   * program, which refuses any publish time after its clock (OracleStale).
   * Pass a positive value (e.g. 60) to opt in to a client clock-skew allowance.
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
 * (`now_unix_ts`) and rejects a negative age (percolator-prog rc23
 * `v16_program.rs:12819`), so the default is 0: the SDK refuses what the
 * program refuses. This runs off-chain against `Date.now()`, the CLIENT's
 * clock; a caller that wants to tolerate skew between the local machine and
 * the cluster must opt in with `futureToleranceSeconds`.
 */
const DEFAULT_FUTURE_TOLERANCE_SECONDS = 0;

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
  assertChainlinkHeader(data);

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
    // NaN makes both comparisons below false, which would skip the check the
    // caller asked for. Fail closed instead.
    if (Number.isNaN(options.maxStalenessSeconds)) {
      throw new Error("maxStalenessSeconds is NaN");
    }
    if (Number.isNaN(options.futureToleranceSeconds)) {
      throw new Error("futureToleranceSeconds is NaN");
    }
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
    // The program rejects a negative age (against the on-chain clock). The
    // default tolerance is 0 to match it; a caller can opt in to a client
    // clock-skew allowance with futureToleranceSeconds.
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
  assertChainlinkAnswerInRange(price, decimals);

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

// ---------------------------------------------------------------------------
// percolator-prog rc23 oracle readers (src/v16_program.rs, feat/v22-rc23-2026-10-22)
// ---------------------------------------------------------------------------

/** Chainlink Transmissions account discriminator (program CHAINLINK_DISC, v16_program.rs:12453). */
const CHAINLINK_DISCRIMINATOR = [96, 179, 69, 66, 128, 129, 73, 117];
const U128_MAX = (1n << 128n) - 1n;

function view(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function hasPrefix(data: Uint8Array, disc: readonly number[]): boolean {
  for (let i = 0; i < disc.length; i++) if (data[i] !== disc[i]) return false;
  return true;
}

function readI128(v: DataView, off: number): bigint {
  return (v.getBigInt64(off + 8, true) << 64n) | v.getBigUint64(off, true);
}

/** The Chainlink header checks of `read_chainlink_price_e12` (v16_program.rs:12799-12816). The caller has checked the length. */
function assertChainlinkHeader(data: Uint8Array): void {
  if (!hasPrefix(data, CHAINLINK_DISCRIMINATOR)) throw new Error("Oracle account is not a Chainlink transmissions account (discriminator mismatch)");
  const v = view(data);
  const version = data[8];
  const latestRoundId = v.getUint32(143, true);
  const liveLength = v.getUint32(148, true);
  const slot = v.getBigUint64(200, true);
  const ts = v.getUint32(CHAINLINK_TIMESTAMP_OFFSET, true);
  if (version === 0) throw new Error("Chainlink feed version is 0");
  if (latestRoundId === 0) throw new Error("Chainlink feed has no round (latest_round_id=0)");
  if (liveLength !== 1) throw new Error(`Chainlink feed live_length is ${liveLength} (the program requires 1)`);
  if (slot === 0n) throw new Error("Chainlink transmission slot is 0");
  if (ts <= 0) throw new Error(`Oracle has no valid publish timestamp (updatedAt=${ts})`);
}

/** `scale_decimal_to_e12` + `leg_e12_in_range` (v16_program.rs:12671-12687, 12550-12552). */
function assertChainlinkAnswerInRange(answer: bigint, decimals: number): void {
  const e12 = decimals >= 12 ? answer / 10n ** BigInt(decimals - 12) : answer * 10n ** BigInt(12 - decimals);
  if (e12 > U128_MAX) throw new Error(`Oracle price ${answer} (decimals ${decimals}) overflows the program's E12 scaling`);
  if (!legE12InRangeV22(e12)) {
    throw new Error(`Oracle price ${answer} (decimals ${decimals}) is outside the program's range (0 < price at E12, price <= MAX_ORACLE_PRICE at E6)`);
  }
}

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

function checkReadOptions(o: OracleReadOptions): void {
  if (!Number.isSafeInteger(o.nowUnixTs)) throw new Error(`nowUnixTs must be an integer, got ${o.nowUnixTs}`);
  if (!Number.isSafeInteger(o.maxStalenessSecs) || o.maxStalenessSecs < 0) throw new Error(`maxStalenessSecs must be a non-negative integer, got ${o.maxStalenessSecs}`);
  if (!Number.isInteger(o.confFilterBps) || o.confFilterBps < 0 || o.confFilterBps > 10_000) throw new Error(`confFilterBps must be 0..=10000, got ${o.confFilterBps}`);
}

function checkAge(publishTime: bigint, o: OracleReadOptions, what: string): void {
  const age = BigInt(o.nowUnixTs) - publishTime;
  if (age < 0n) throw new Error(`OracleStale: ${what} publish time is ${-age}s after now`);
  if (age > BigInt(o.maxStalenessSecs)) throw new Error(`OracleStale: ${what} is ${age}s old (max ${o.maxStalenessSecs}s)`);
}

/** Pyth PriceUpdateV2 layout (program v16_program.rs:12434-12439). */
const PYTH_PRICE_UPDATE_V2_MIN_LEN = 134;
const PYTH_PRICE_UPDATE_V2_DISCRIMINATOR = [0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd];
const PYTH_OFF_VERIFICATION_LEVEL = 40;
const PYTH_OFF_MESSAGE = 41;
const PYTH_VERIFICATION_FULL = 1;

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
export function parsePythPriceUpdateV2(data: Uint8Array, o: OracleReadOptions & { feedId: Uint8Array }): OracleLegE12 {
  checkReadOptions(o);
  if (o.feedId.length !== 32) throw new Error(`feedId must be 32 bytes, got ${o.feedId.length}`);
  if (data.length < PYTH_PRICE_UPDATE_V2_MIN_LEN) throw new Error(`InvalidAccountData: PriceUpdateV2 is ${data.length} bytes (need ${PYTH_PRICE_UPDATE_V2_MIN_LEN})`);
  if (!hasPrefix(data, PYTH_PRICE_UPDATE_V2_DISCRIMINATOR)) throw new Error("OracleInvalid: not a Pyth PriceUpdateV2 account (discriminator mismatch)");
  if (data[PYTH_OFF_VERIFICATION_LEVEL] !== PYTH_VERIFICATION_FULL) throw new Error("OracleInvalid: PriceUpdateV2 verification level is not Full");
  const m = PYTH_OFF_MESSAGE;
  for (let i = 0; i < 32; i++) if (data[m + i] !== o.feedId[i]) throw new Error("InvalidOracleKey: PriceUpdateV2 feed id does not match");
  const v = view(data);
  const price = v.getBigInt64(m + 32, true);
  const conf = v.getBigUint64(m + 40, true);
  const exponent = v.getInt32(m + 48, true);
  const publishTime = v.getBigInt64(m + 52, true);
  if (price <= 0n || exponent < -MAX_ORACLE_EXPO_ABS_V22 || exponent > MAX_ORACLE_EXPO_ABS_V22) {
    throw new Error(`OracleInvalid: Pyth price ${price} exponent ${exponent}`);
  }
  checkAge(publishTime, o, "Pyth update");
  if (o.confFilterBps !== 0 && conf * 10_000n > price * BigInt(o.confFilterBps)) {
    throw new Error(`OracleConfTooWide: conf ${conf} > ${o.confFilterBps} bps of price ${price}`);
  }
  const priceE12 = pythLegE12V22(price, exponent);
  if (priceE12 === null) throw new Error(`OracleInvalid: Pyth price ${price}e${exponent} is outside the program's E12 range`);
  return { priceE12, publishTime: Number(publishTime) };
}

/** Switchboard On-Demand PullFeedAccountData layout (program v16_program.rs:12441-12451). */
const SWITCHBOARD_DISCRIMINATOR = [196, 27, 108, 196, 10, 215, 219, 40];
const SWITCHBOARD_MIN_LEN = 3_208;
const SB_OFF_FEED_HASH = 8 + 2_112;
const SB_OFF_MIN_SAMPLE_SIZE = 8 + 2_207;
const SB_OFF_LAST_UPDATE = 8 + 2_208;
const SB_OFF_VALUE = 8 + 2_256;
const SB_OFF_STD_DEV = 8 + 2_272;
const SB_OFF_NUM_SAMPLES = 8 + 2_352;
const SB_OFF_SUBMISSION_IDX = 8 + 2_353;
const SB_OFF_RESULT_SLOT = 8 + 2_360;
const SB_OFF_SUBMISSION_TS = 8 + 2_944;
const SB_MAX_SUBMISSIONS = 32;
/** Switchboard values are 1e18-scaled; the program divides by 1e6 to reach E12 (v16_program.rs:12764). */
const SB_E18_PER_E12 = 1_000_000n;

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
export function parseSwitchboardPullFeedPrice(data: Uint8Array, o: OracleReadOptions): OracleLegE12 {
  checkReadOptions(o);
  if (data.length < SWITCHBOARD_MIN_LEN) throw new Error(`InvalidAccountData: PullFeed is ${data.length} bytes (need ${SWITCHBOARD_MIN_LEN})`);
  if (!hasPrefix(data, SWITCHBOARD_DISCRIMINATOR)) throw new Error("OracleInvalid: not a Switchboard PullFeed account (discriminator mismatch)");
  const v = view(data);
  let feedHashZero = true;
  for (let i = 0; i < 32; i++) if (data[SB_OFF_FEED_HASH + i] !== 0) feedHashZero = false;
  const minSample = data[SB_OFF_MIN_SAMPLE_SIZE];
  const lastUpdate = v.getBigInt64(SB_OFF_LAST_UPDATE, true);
  const value = readI128(v, SB_OFF_VALUE);
  const stdDev = readI128(v, SB_OFF_STD_DEV);
  const numSamples = data[SB_OFF_NUM_SAMPLES];
  const subIdx = data[SB_OFF_SUBMISSION_IDX];
  const resultSlot = v.getBigUint64(SB_OFF_RESULT_SLOT, true);
  if (
    feedHashZero || minSample === 0 || numSamples < minSample || subIdx >= SB_MAX_SUBMISSIONS ||
    resultSlot === 0n || lastUpdate <= 0n || value <= 0n || stdDev < 0n
  ) {
    throw new Error("OracleInvalid: Switchboard feed result is not valid");
  }
  const publishTime = v.getBigInt64(SB_OFF_SUBMISSION_TS + subIdx * 8, true);
  if (publishTime <= 0n) throw new Error("OracleStale: Switchboard submission has no timestamp");
  checkAge(publishTime, o, "Switchboard submission");
  if (o.confFilterBps !== 0 && stdDev * 10_000n > value * BigInt(o.confFilterBps)) {
    throw new Error(`OracleConfTooWide: std_dev ${stdDev} > ${o.confFilterBps} bps of value ${value}`);
  }
  const priceE12 = value / SB_E18_PER_E12;
  if (!legE12InRangeV22(priceE12)) throw new Error(`OracleInvalid: Switchboard value ${value} is outside the program's E12 range`);
  return { priceE12, publishTime: Number(publishTime) };
}

// Re-export constants for consumers
export { CHAINLINK_MIN_SIZE, CHAINLINK_DECIMALS_OFFSET, CHAINLINK_TIMESTAMP_OFFSET, CHAINLINK_ANSWER_OFFSET, MAX_DECIMALS };
