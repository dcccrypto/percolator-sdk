/**
 * parseChainlinkPrice: a NaN staleness bound must fail closed.
 *
 * `age > NaN` and `age < -NaN` are always false, so before the fix a caller
 * that passed `maxStalenessSeconds: NaN` (e.g. `Number(cfg.maxAge)` with the
 * setting missing) asked for a staleness check and silently got none: a feed
 * a month old came back as a good price. Same for `futureToleranceSeconds`.
 *
 * Layout used here: decimals u8 @138, timestamp u32 LE @208, answer i128 LE
 * @216, min length 248 (see oracle-chainlink-bytes.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseChainlinkPrice } from "../src/solana/oracle.js";

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

function feed(ts: number): Uint8Array {
  const b = new Uint8Array(248);
  const dv = new DataView(b.buffer);
  writeHeader(b);
  b[138] = 8;
  dv.setUint32(208, ts, true);
  dv.setBigUint64(216, 100_000_000n, true);
  return b;
}

describe("parseChainlinkPrice with a NaN bound", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
  });
  afterEach(() => vi.useRealTimers());

  it("rejects maxStalenessSeconds: NaN on a 30-day-old feed", () => {
    const stale = feed(NOW - 30 * 86_400);
    expect(() => parseChainlinkPrice(stale, { maxStalenessSeconds: NaN })).toThrow(
      /maxStalenessSeconds/,
    );
  });

  it("rejects maxStalenessSeconds: NaN even on a fresh feed", () => {
    expect(() => parseChainlinkPrice(feed(NOW), { maxStalenessSeconds: NaN })).toThrow(
      /maxStalenessSeconds/,
    );
  });

  it("rejects futureToleranceSeconds: NaN on a far-future timestamp", () => {
    const future = feed(NOW + 86_400);
    expect(() =>
      parseChainlinkPrice(future, { maxStalenessSeconds: 60, futureToleranceSeconds: NaN }),
    ).toThrow(/futureToleranceSeconds/);
  });

  it("still accepts a fresh feed with a normal bound", () => {
    expect(parseChainlinkPrice(feed(NOW - 5), { maxStalenessSeconds: 60 }).price).toBe(100_000_000n);
  });

  it("still skips the check when no bound is given", () => {
    expect(parseChainlinkPrice(feed(NOW - 30 * 86_400)).updatedAt).toBe(NOW - 30 * 86_400);
  });
});
