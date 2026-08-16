/**
 * Oracle parsing/validation tests
 *
 * Tests for parseChainlinkPrice() which extracts price data from
 * Chainlink aggregator account buffers with proper validation.
 *
 * Ported from Toly's percolator-cli (aeyakovenko/percolator-cli, Feb 16 2026)
 * with adaptations for browser-compatible Uint8Array API.
 */

import {
  parseChainlinkPrice,
  isValidChainlinkOracle,
  CHAINLINK_MIN_SIZE,
  CHAINLINK_DECIMALS_OFFSET,
  CHAINLINK_TIMESTAMP_OFFSET,
  CHAINLINK_ANSWER_OFFSET,
} from "../src/solana/oracle.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function assertThrows(fn: () => void, expectedMsg: string, testName: string): void {
  try {
    fn();
    throw new Error(`FAIL: ${testName} - expected to throw`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("FAIL:")) {
      throw e;
    }
    if (e instanceof Error && e.message.includes(expectedMsg)) {
      // OK
    } else {
      throw new Error(`FAIL: ${testName} - expected "${expectedMsg}" in error, got: ${e}`);
    }
  }
}

/**
 * Build a valid Chainlink transmissions buffer for testing.
 * Layout: decimals at offset 138 (u8), answer at offset 216 (i128 LE).
 *
 * The answer is written as a full little-endian i128 — low u64 then the
 * sign-extended high i64 — because that is what the deployed program reads
 * (read_i128_le, v16_program.rs:5657). Writing only the low 8 bytes would leave
 * a negative answer encoded as a huge positive i128.
 */
function buildChainlinkBuffer(decimals: number, answer: bigint, size = 256): Uint8Array {
  const buf = new Uint8Array(size);
  buf[CHAINLINK_DECIMALS_OFFSET] = decimals;
  const dv = new DataView(buf.buffer);
  dv.setBigUint64(CHAINLINK_ANSWER_OFFSET, BigInt.asUintN(64, answer), true);
  dv.setBigInt64(CHAINLINK_ANSWER_OFFSET + 8, answer >> 64n, true);
  return buf;
}

console.log("Testing Chainlink oracle parsing...\n");

// --- parseChainlinkPrice ---

// Valid oracle data
{
  const buf = buildChainlinkBuffer(8, 10012345678n); // $100.12345678
  const result = parseChainlinkPrice(buf);
  assert(result.decimals === 8, "decimals parsed correctly");
  assert(result.price === 10012345678n, "price parsed correctly");
  console.log("✓ parses valid oracle data");
}

// Different decimal values
{
  const buf6 = buildChainlinkBuffer(6, 100_000_000n);
  const r6 = parseChainlinkPrice(buf6);
  assert(r6.decimals === 6, "6 decimals");
  assert(r6.price === 100_000_000n, "price with 6 decimals");

  const buf0 = buildChainlinkBuffer(0, 42n);
  const r0 = parseChainlinkPrice(buf0);
  assert(r0.decimals === 0, "0 decimals");
  assert(r0.price === 42n, "price with 0 decimals");

  console.log("✓ handles various decimal values");
}

// Accepts 18 decimals (maximum)
{
  const buf18 = buildChainlinkBuffer(18, 1000n);
  const r18 = parseChainlinkPrice(buf18);
  assert(r18.decimals === 18, "accepts 18 decimals");
  console.log("✓ accepts 18 decimals");
}

// Accepts a buffer at exactly the program's minimum length (248)
{
  const minimal = buildChainlinkBuffer(8, 1000n, CHAINLINK_MIN_SIZE);
  const minResult = parseChainlinkPrice(minimal);
  assert(minResult.price === 1000n, "accepts minimal 248-byte buffer");
  console.log("✓ accepts minimal 248-byte buffer");
}

// Rejects undersized buffers
{
  assertThrows(
    () => parseChainlinkPrice(new Uint8Array(100)),
    "too small",
    "rejects buffer < 248 bytes"
  );
  assertThrows(
    () => parseChainlinkPrice(new Uint8Array(247)),
    "too small",
    "rejects buffer of exactly 247 bytes"
  );
  console.log("✓ rejects undersized buffers");
}

// Rejects empty buffer
{
  assertThrows(
    () => parseChainlinkPrice(new Uint8Array(0)),
    "too small",
    "rejects empty buffer"
  );
  console.log("✓ rejects empty buffer");
}

// Rejects zero price
{
  assertThrows(
    () => parseChainlinkPrice(buildChainlinkBuffer(8, 0n)),
    "non-positive",
    "rejects zero price"
  );
  console.log("✓ rejects zero price");
}

// Rejects negative price
{
  assertThrows(
    () => parseChainlinkPrice(buildChainlinkBuffer(8, -100n)),
    "non-positive",
    "rejects negative price"
  );
  console.log("✓ rejects negative price");
}

// Rejects decimals > 18
{
  assertThrows(
    () => parseChainlinkPrice(buildChainlinkBuffer(19, 1000n)),
    "decimals",
    "rejects decimals > 18"
  );
  assertThrows(
    () => parseChainlinkPrice(buildChainlinkBuffer(255, 1000n)),
    "decimals",
    "rejects decimals = 255"
  );
  console.log("✓ rejects unreasonable decimals");
}

// --- Staleness check ---
// Regression for the staleness check that was added in fb9083e and silently
// dropped in a later, unrelated commit (af46df6). The module docstring claims
// "validate oracle data BEFORE parsing to prevent silent propagation of stale
// ... data" — this must actually be enforced when maxStalenessSeconds is passed.

console.log("\nTesting staleness check...\n");

// The timestamp is written at the LITERAL offset and width the deployed program
// uses — CL_OFF_TRANSMISSION(200) + CL_TRANS_OFF_TIMESTAMP(8) = 208, u32 LE
// (percolator-prog@19d5d932 src/v16_program.rs:5367-5369). Deliberately NOT
// CHAINLINK_TIMESTAMP_OFFSET: writing at whatever offset the implementation
// happens to read makes the test tautological — it would pass even if the
// parser read a reserved byte that is always zero on a real feed.
const PROGRAM_TIMESTAMP_OFFSET = 208;

function buildChainlinkBufferWithTimestamp(decimals: number, answer: bigint, updatedAt: number): Uint8Array {
  const buf = buildChainlinkBuffer(decimals, answer);
  const dv = new DataView(buf.buffer);
  dv.setUint32(PROGRAM_TIMESTAMP_OFFSET, updatedAt, true);
  return buf;
}

{
  const now = Math.floor(Date.now() / 1000);
  const fresh = buildChainlinkBufferWithTimestamp(8, 10012345678n, now);
  const result = parseChainlinkPrice(fresh, { maxStalenessSeconds: 60 });
  assert(result.updatedAt === now, `fresh oracle updatedAt: expected ${now}, got ${result.updatedAt}`);
  console.log("✓ fresh oracle within maxStalenessSeconds does not throw");
}

{
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const stale = buildChainlinkBufferWithTimestamp(8, 10012345678n, thirtyDaysAgo);
  assertThrows(
    () => parseChainlinkPrice(stale, { maxStalenessSeconds: 60 }),
    "stale",
    "rejects oracle older than maxStalenessSeconds"
  );
  console.log("✓ stale oracle beyond maxStalenessSeconds throws");
}

{
  // No maxStalenessSeconds passed: must not throw regardless of age (backward compatible),
  // but updatedAt should still be populated for callers that want to check it themselves.
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const stale = buildChainlinkBufferWithTimestamp(8, 10012345678n, thirtyDaysAgo);
  const result = parseChainlinkPrice(stale);
  assert(result.updatedAt === thirtyDaysAgo, "updatedAt populated even without maxStalenessSeconds");
  console.log("✓ updatedAt exposed without throwing when maxStalenessSeconds is omitted");
}

{
  // The offset must be the program's. A buffer whose timestamp is written ONLY
  // at the old 168 offset must NOT be read as fresh — with the previous
  // (i64 @ 168) implementation this buffer parsed as updatedAt = now and the
  // staleness check silently passed on an otherwise-blank feed.
  const now = Math.floor(Date.now() / 1000);
  const wrongOffset = buildChainlinkBuffer(8, 10012345678n);
  new DataView(wrongOffset.buffer).setBigInt64(168, BigInt(now), true);
  assertThrows(
    () => parseChainlinkPrice(wrongOffset, { maxStalenessSeconds: 60 }),
    "publish timestamp",
    "a timestamp written only at the old offset 168 is not treated as fresh"
  );
  console.log("✓ timestamp is read at the program's offset 208, not 168");
}

{
  // A zero timestamp means the feed has never published. The program rejects
  // `publish_time <= 0` outright; the SDK must not treat it as exempt.
  const neverPublished = buildChainlinkBuffer(8, 10012345678n);
  assertThrows(
    () => parseChainlinkPrice(neverPublished, { maxStalenessSeconds: 60 }),
    "publish timestamp",
    "rejects a feed with no publish timestamp instead of skipping the check"
  );
  console.log("✓ zero timestamp is rejected, not skipped");
}

{
  // A small forward skew is ordinary client-clock drift, NOT a fault: the program
  // compares against the ON-CHAIN clock, which we cannot read here.
  const nearFuture = buildChainlinkBufferWithTimestamp(8, 10012345678n, Math.floor(Date.now() / 1000) + 5);
  const skewed = parseChainlinkPrice(nearFuture, { maxStalenessSeconds: 60 });
  assert(skewed.price === 10012345678n, "a few seconds of clock skew must not reject a healthy feed");
  console.log("✓ small forward clock skew tolerated");

  // An implausible jump ahead is still rejected.
  const farFuture = buildChainlinkBufferWithTimestamp(8, 10012345678n, Math.floor(Date.now() / 1000) + 3600);
  assertThrows(
    () => parseChainlinkPrice(farFuture, { maxStalenessSeconds: 60 }),
    "future",
    "rejects a publish timestamp far in the future"
  );
  console.log("✓ far-future timestamp rejected");

  // The tolerance is configurable.
  const t = parseChainlinkPrice(farFuture, { maxStalenessSeconds: 60, futureToleranceSeconds: 7200 });
  assert(t.price === 10012345678n, "an explicit tolerance widens the window");
  console.log("✓ futureToleranceSeconds honoured");
}

{
  // The answer is i128 on-chain and the program imposes NO i64 ceiling — it feeds
  // the whole mantissa to scale_decimal_to_e6 and bounds only the SCALED result.
  // So a large mantissa must parse, at its full i128 value, not be rejected and
  // not be truncated to its low 64 bits.
  const bigAnswer = (1n << 64n) + 12345n;
  const big = buildChainlinkBufferWithTimestamp(18, bigAnswer, Math.floor(Date.now() / 1000));
  const parsed = parseChainlinkPrice(big, { maxStalenessSeconds: 60 });
  assert(
    parsed.price === bigAnswer,
    `i128 answer must round-trip in full: expected ${bigAnswer}, got ${parsed.price}`,
  );
  assert(parsed.price > (1n << 63n) - 1n, "value genuinely exceeds i64, so truncation would show");
  console.log("✓ large i128 answer parsed in full (no i64 ceiling — matches the program)");
}

// --- isValidChainlinkOracle ---

console.log("\nTesting isValidChainlinkOracle...\n");

{
  assert(isValidChainlinkOracle(buildChainlinkBuffer(8, 10012345678n)) === true, "valid oracle returns true");
  assert(isValidChainlinkOracle(new Uint8Array(100)) === false, "too-small returns false");
  assert(isValidChainlinkOracle(buildChainlinkBuffer(8, 0n)) === false, "zero price returns false");
  assert(isValidChainlinkOracle(buildChainlinkBuffer(255, 1000n)) === false, "bad decimals returns false");
  console.log("✓ isValidChainlinkOracle works correctly");
}

// --- Constants ---

console.log("\nTesting exported constants...\n");

{
  // Pinned to the deployed wrapper percolator-prog@19d5d932:
  // CHAINLINK_FEED_MIN_LEN = 8 + CHAINLINK_HEADER_SIZE(192) + 48 = 248,
  // CL_OFF_DECIMALS = 138, CL_OFF_TRANSMISSION(200) + CL_TRANS_OFF_TIMESTAMP(8) = 208,
  // CL_OFF_TRANSMISSION(200) + CL_TRANS_OFF_ANSWER(16) = 216.
  assert(CHAINLINK_MIN_SIZE === 248, "CHAINLINK_MIN_SIZE = 248");
  assert(CHAINLINK_DECIMALS_OFFSET === 138, "CHAINLINK_DECIMALS_OFFSET = 138");
  assert(CHAINLINK_TIMESTAMP_OFFSET === 208, "CHAINLINK_TIMESTAMP_OFFSET = 208");
  assert(CHAINLINK_ANSWER_OFFSET === 216, "CHAINLINK_ANSWER_OFFSET = 216");
  console.log("✓ exported constants correct");
}

console.log("\n✅ All oracle tests passed!");
