/**
 * Chainlink transmissions-account decoder: exact-byte tests.
 *
 * Offsets are written out as literals (not imported) so a drift in the
 * decoder's constants fails here. Layout: decimals u8 @138, timestamp u32 LE
 * @208, answer i128 LE @216, minimum length 248, plus the header fields the
 * program checks (discriminator, version @8, latest_round_id @143,
 * live_length @148, transmission slot @200).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseChainlinkPrice,
  isValidChainlinkOracle,
  CHAINLINK_MIN_SIZE,
  CHAINLINK_DECIMALS_OFFSET,
  CHAINLINK_TIMESTAMP_OFFSET,
  CHAINLINK_ANSWER_OFFSET,
  MAX_DECIMALS,
} from "../src/solana/oracle.js";

const NOW = 1_800_000_000;

// Header fields the program checks (percolator-prog rc23 read_chainlink_price_e12,
// v16_program.rs:12799-12816): discriminator, version, latest_round_id,
// live_length == 1, transmission slot.
const CL_DISC = [96, 179, 69, 66, 128, 129, 73, 117];
function writeHeader(b: Uint8Array): void {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  b.set(CL_DISC, 0);
  b[8] = 1; // version
  dv.setUint32(143, 1, true); // latest_round_id
  dv.setUint32(148, 1, true); // live_length
  dv.setBigUint64(200, 1n, true); // transmission slot
}

function feed(opts: { decimals?: number; ts?: number; answer?: bigint; len?: number } = {}): Uint8Array {
  const full = new Uint8Array(Math.max(opts.len ?? 248, 248));
  const dv = new DataView(full.buffer);
  writeHeader(full);
  full[138] = opts.decimals ?? 8;
  dv.setUint32(208, opts.ts ?? NOW, true);
  // two's-complement i128 LE
  const a = BigInt.asUintN(128, opts.answer ?? 100_000_000n);
  dv.setBigUint64(216, a & 0xffff_ffff_ffff_ffffn, true);
  dv.setBigUint64(224, a >> 64n, true);
  return full.slice(0, opts.len ?? 248);
}

describe("chainlink layout constants", () => {
  it("match the deployed wrapper offsets", () => {
    expect(CHAINLINK_MIN_SIZE).toBe(248);
    expect(CHAINLINK_DECIMALS_OFFSET).toBe(138);
    expect(CHAINLINK_TIMESTAMP_OFFSET).toBe(208);
    expect(CHAINLINK_ANSWER_OFFSET).toBe(216);
    expect(MAX_DECIMALS).toBe(18);
  });
});

describe("parseChainlinkPrice: bytes", () => {
  it("decodes decimals, answer and timestamp", () => {
    const r = parseChainlinkPrice(feed({ decimals: 6, ts: 1_700_000_123, answer: 123_456_789n }));
    expect(r).toEqual({ price: 123_456_789n, decimals: 6, updatedAt: 1_700_000_123 });
  });

  it("accepts exactly the minimum length and a longer buffer", () => {
    expect(parseChainlinkPrice(feed({ len: 248 })).price).toBe(100_000_000n);
    expect(parseChainlinkPrice(feed({ len: 4096 })).price).toBe(100_000_000n);
  });

  it("rejects 247 bytes and an empty buffer", () => {
    expect(() => parseChainlinkPrice(feed({ len: 247 }))).toThrow(/too small: 247 bytes \(need at least 248\)/);
    expect(() => parseChainlinkPrice(new Uint8Array(0))).toThrow(/too small: 0 bytes/);
  });

  it("rejects the old 224-byte floor (cannot hold the i128 answer)", () => {
    expect(() => parseChainlinkPrice(feed({ len: 224 }))).toThrow(/too small/);
  });

  it("decimals boundary: 0 and 18 ok, 19 and 255 rejected", () => {
    expect(parseChainlinkPrice(feed({ decimals: 0, answer: 1n })).decimals).toBe(0);
    expect(parseChainlinkPrice(feed({ decimals: 18 })).decimals).toBe(18);
    expect(() => parseChainlinkPrice(feed({ decimals: 19 }))).toThrow(/decimals out of range: 19 \(max 18\)/);
    expect(() => parseChainlinkPrice(feed({ decimals: 255 }))).toThrow(/out of range: 255/);
  });

  it("answer boundary: 1 ok; 0 and -1 rejected", () => {
    expect(parseChainlinkPrice(feed({ answer: 1n })).price).toBe(1n);
    expect(() => parseChainlinkPrice(feed({ answer: 0n }))).toThrow(/non-positive: 0/);
    expect(() => parseChainlinkPrice(feed({ answer: -1n }))).toThrow(/non-positive: -1/);
  });

  it("reads the full i128, not just the low 8 bytes", () => {
    // 18 decimals keeps these inside the program's MAX_ORACLE_PRICE ($1e6).
    const big = (1n << 79n) + 12345n; // ~$604,462
    expect(parseChainlinkPrice(feed({ decimals: 18, answer: big })).price).toBe(big);
    // u64 max in the low half, zero high half: positive, must not go negative
    const u64Max = (1n << 64n) - 1n;
    expect(parseChainlinkPrice(feed({ decimals: 18, answer: u64Max })).price).toBe(u64Max);
    // i64 max + 1 would be negative if only the low 8 bytes were read signed
    expect(parseChainlinkPrice(feed({ decimals: 18, answer: 1n << 63n })).price).toBe(1n << 63n);
  });

  it("range: the program's E12 / MAX_ORACLE_PRICE bounds (scale_decimal_to_e12)", () => {
    // exactly MAX_ORACLE_PRICE ($1,000,000) at 0 and 18 decimals is accepted
    expect(parseChainlinkPrice(feed({ decimals: 0, answer: 1_000_000n })).price).toBe(1_000_000n);
    expect(parseChainlinkPrice(feed({ decimals: 18, answer: 10n ** 24n })).price).toBe(10n ** 24n);
    // one E6 tick above MAX is refused
    expect(() => parseChainlinkPrice(feed({ decimals: 6, answer: 1_000_000_000_001n }))).toThrow(/outside the program's range/);
    // $1e-12 is the smallest E12 value; below it floors to 0 and is refused
    expect(parseChainlinkPrice(feed({ decimals: 18, answer: 1_000_000n })).price).toBe(1_000_000n);
    expect(() => parseChainlinkPrice(feed({ decimals: 18, answer: 999_999n }))).toThrow(/outside the program's range/);
    // i128 max at 0 decimals overflows the program's u128 scaling
    expect(() => parseChainlinkPrice(feed({ decimals: 0, answer: (1n << 127n) - 1n }))).toThrow(/overflows/);
    expect(() => parseChainlinkPrice(feed({ decimals: 18, answer: (1n << 127n) - 1n }))).toThrow(/outside the program's range/);
  });

  it("header: each field the program checks is refused when invalid", () => {
    const bad = (f: (b: Uint8Array, dv: DataView) => void) => {
      const b = feed();
      f(b, new DataView(b.buffer));
      return () => parseChainlinkPrice(b);
    };
    expect(bad((b) => (b[0] ^= 1))).toThrow(/discriminator/);
    expect(bad((b) => (b[8] = 0))).toThrow(/version is 0/);
    expect(bad((_b, dv) => dv.setUint32(143, 0, true))).toThrow(/latest_round_id=0/);
    expect(bad((_b, dv) => dv.setUint32(148, 0, true))).toThrow(/live_length is 0/);
    expect(bad((_b, dv) => dv.setUint32(148, 2, true))).toThrow(/live_length is 2/);
    expect(bad((_b, dv) => dv.setBigUint64(200, 0n, true))).toThrow(/slot is 0/);
  });

  it("i128 min is rejected as non-positive", () => {
    expect(() => parseChainlinkPrice(feed({ answer: -(1n << 127n) }))).toThrow(/non-positive/);
  });

  it("a zero timestamp is refused even when no staleness bound is set (the program refuses publish_time 0)", () => {
    expect(() => parseChainlinkPrice(feed({ ts: 0 }))).toThrow(/no valid publish timestamp/);
  });

  it("timestamp is u32: 0xFFFFFFFF is read unsigned", () => {
    expect(parseChainlinkPrice(feed({ ts: 0xffff_ffff })).updatedAt).toBe(4_294_967_295);
  });

  it("ignores bytes outside the checked fields", () => {
    const a = feed();
    const b = feed();
    b.fill(0xab, 9, 138); // after version, up to decimals
    b.fill(0xef, 139, 143); // between decimals and latest_round_id
    b.fill(0xef, 152, 200); // after live_length, up to the transmission slot
    b.fill(0x77, 212, 216); // between the u32 timestamp and the answer
    b.fill(0xcd, 232, 248); // after the answer
    expect(parseChainlinkPrice(b)).toEqual(parseChainlinkPrice(a));
  });

  it("works on a Uint8Array view with a non-zero byteOffset", () => {
    const inner = feed({ decimals: 9, answer: 777n });
    const outer = new Uint8Array(inner.length + 32);
    outer.set(inner, 32);
    const view = outer.subarray(32);
    expect(parseChainlinkPrice(view)).toMatchObject({ price: 777n, decimals: 9 });
  });
});

describe("parseChainlinkPrice: staleness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
  });
  afterEach(() => vi.useRealTimers());

  it("fresh feed passes; age equal to the bound passes; one second over fails", () => {
    expect(parseChainlinkPrice(feed({ ts: NOW - 10 }), { maxStalenessSeconds: 60 }).price).toBe(100_000_000n);
    expect(() => parseChainlinkPrice(feed({ ts: NOW - 60 }), { maxStalenessSeconds: 60 })).not.toThrow();
    expect(() => parseChainlinkPrice(feed({ ts: NOW - 61 }), { maxStalenessSeconds: 60 })).toThrow(
      /stale: last updated 61s ago \(max 60s\)/,
    );
  });

  it("zero timestamp is maximally stale, not exempt", () => {
    expect(() => parseChainlinkPrice(feed({ ts: 0 }), { maxStalenessSeconds: 60 })).toThrow(
      /no valid publish timestamp/,
    );
  });

  it("future timestamp: refused by default like the program (tolerance 0)", () => {
    expect(() => parseChainlinkPrice(feed({ ts: NOW }), { maxStalenessSeconds: 60 })).not.toThrow();
    expect(() => parseChainlinkPrice(feed({ ts: NOW + 1 }), { maxStalenessSeconds: 60 })).toThrow(
      /1s in the future \(tolerance 0s\)/,
    );
  });

  it("future timestamp: an explicit 60s clock-skew allowance is opt-in", () => {
    const skew = { maxStalenessSeconds: 60, futureToleranceSeconds: 60 };
    expect(() => parseChainlinkPrice(feed({ ts: NOW + 60 }), skew)).not.toThrow();
    expect(() => parseChainlinkPrice(feed({ ts: NOW + 61 }), skew)).toThrow(/61s in the future \(tolerance 60s\)/);
  });

  it("custom futureToleranceSeconds, including 0", () => {
    expect(() =>
      parseChainlinkPrice(feed({ ts: NOW + 300 }), { maxStalenessSeconds: 60, futureToleranceSeconds: 300 }),
    ).not.toThrow();
    expect(() =>
      parseChainlinkPrice(feed({ ts: NOW + 1 }), { maxStalenessSeconds: 60, futureToleranceSeconds: 0 }),
    ).toThrow(/1s in the future \(tolerance 0s\)/);
  });

  it("future tolerance is ignored when maxStalenessSeconds is unset", () => {
    expect(parseChainlinkPrice(feed({ ts: NOW + 100_000 }), { futureToleranceSeconds: 0 }).updatedAt).toBe(
      NOW + 100_000,
    );
  });

  it("maxStalenessSeconds: 0 is a real bound (not treated as unset)", () => {
    expect(() => parseChainlinkPrice(feed({ ts: NOW - 1 }), { maxStalenessSeconds: 0 })).toThrow(/stale/);
    expect(() => parseChainlinkPrice(feed({ ts: NOW }), { maxStalenessSeconds: 0 })).not.toThrow();
  });
});

describe("isValidChainlinkOracle", () => {
  it("true for a good feed, false for each failure class", () => {
    expect(isValidChainlinkOracle(feed())).toBe(true);
    expect(isValidChainlinkOracle(feed({ len: 247 }))).toBe(false);
    expect(isValidChainlinkOracle(feed({ decimals: 19 }))).toBe(false);
    expect(isValidChainlinkOracle(feed({ answer: 0n }))).toBe(false);
    expect(isValidChainlinkOracle(feed({ ts: 0 }))).toBe(false);
    const noDisc = feed();
    noDisc[0] = 0;
    expect(isValidChainlinkOracle(noDisc)).toBe(false);
  });
});
