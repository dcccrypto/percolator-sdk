import { describe, it, expect } from "vitest";
import {
  parseMarketGroupV17OI,
  V17_MAGIC,
  V17_EXPECTED_VERSION,
  V17_KIND_MARKET,
  V17_MARKET_GROUP_OFF,
  V17_MARKET_GROUP_LEN,
  V17_MARKET_ASSET_SLOT_LEN,
} from "../slab.js";

// V17_KIND_OFF = 10 (magic[8] + version[2])
const V17_KIND_OFF = 10;

// Absolute offset of insurance within the account = V17_MARKET_GROUP_OFF + 301
const INS_ABS_OFF = V17_MARKET_GROUP_OFF + 301;

// Slot base starts at V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN
const SLOTS_BASE = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN; // 1206

// EngineAssetSlotV16Account starts after wrapper T (512 bytes).
// oi_eff_long_q is at AssetStateV16Account+273, oi_eff_short_q at +289.
const WRAPPER_SIZE = 512;
const OI_LONG_REL = 273;
const OI_SHORT_REL = 289;

/**
 * Build a minimal synthetic v17 market account with known field values.
 *
 * The buffer is exactly sized for numSlots slots and has the v17 header,
 * insurance balance, and per-slot OI fields written at the offsets defined
 * by the struct layout spec.
 */
function makeV17Buf(opts: {
  numSlots?: number;
  slotOIs?: Array<{ long: bigint; short: bigint }>;
  insurance?: bigint;
}): Uint8Array {
  const {
    numSlots = 1,
    slotOIs = [{ long: 1000n, short: 500n }],
    insurance = 9876n,
  } = opts;

  const len =
    SLOTS_BASE + numSlots * V17_MARKET_ASSET_SLOT_LEN;
  const buf = new Uint8Array(len);
  const view = new DataView(buf.buffer);

  // Header: magic (u64 LE), version (u16 LE), kind (u8).
  view.setBigUint64(0, V17_MAGIC, true);
  view.setUint16(8, V17_EXPECTED_VERSION, true);
  buf[V17_KIND_OFF] = V17_KIND_MARKET;

  // Insurance (u128 LE) at absolute offset 749.
  view.setBigUint64(INS_ABS_OFF, insurance & 0xffff_ffff_ffff_ffffn, true);
  view.setBigUint64(INS_ABS_OFF + 8, insurance >> 64n, true);

  // OI fields for each slot.
  for (let i = 0; i < numSlots; i++) {
    const slotBase = SLOTS_BASE + i * V17_MARKET_ASSET_SLOT_LEN;
    const { long, short } = slotOIs[i] ?? { long: 0n, short: 0n };

    const longOff = slotBase + WRAPPER_SIZE + OI_LONG_REL;
    view.setBigUint64(longOff, long & 0xffff_ffff_ffff_ffffn, true);
    view.setBigUint64(longOff + 8, long >> 64n, true);

    const shortOff = slotBase + WRAPPER_SIZE + OI_SHORT_REL;
    view.setBigUint64(shortOff, short & 0xffff_ffff_ffff_ffffn, true);
    view.setBigUint64(shortOff + 8, short >> 64n, true);
  }

  return buf;
}

describe("parseMarketGroupV17OI", () => {
  it("parses single-slot OI and insurance balance", () => {
    const buf = makeV17Buf({
      numSlots: 1,
      slotOIs: [{ long: 1000n, short: 500n }],
      insurance: 9876n,
    });
    const oi = parseMarketGroupV17OI(buf);
    expect(oi.insuranceBalance).toBe(9876n);
    expect(oi.totalLongOiQ).toBe(1000n);
    expect(oi.totalShortOiQ).toBe(500n);
    expect(oi.assets).toHaveLength(1);
    expect(oi.assets[0]).toEqual({
      assetIndex: 0,
      oiEffLongQ: 1000n,
      oiEffShortQ: 500n,
    });
  });

  it("aggregates OI across multiple slots", () => {
    const buf = makeV17Buf({
      numSlots: 3,
      slotOIs: [
        { long: 100n, short: 50n },
        { long: 200n, short: 100n },
        { long: 0n, short: 0n }, // inactive slot — excluded from assets[]
      ],
    });
    const oi = parseMarketGroupV17OI(buf);
    expect(oi.totalLongOiQ).toBe(300n);
    expect(oi.totalShortOiQ).toBe(150n);
    // Slot 2 has zero OI — must not appear in assets[].
    expect(oi.assets).toHaveLength(2);
    expect(oi.assets[0]).toMatchObject({ assetIndex: 0, oiEffLongQ: 100n, oiEffShortQ: 50n });
    expect(oi.assets[1]).toMatchObject({ assetIndex: 1, oiEffLongQ: 200n, oiEffShortQ: 100n });
  });

  it("returns zero OI and empty assets[] for all-empty slots", () => {
    const buf = makeV17Buf({
      numSlots: 2,
      slotOIs: [
        { long: 0n, short: 0n },
        { long: 0n, short: 0n },
      ],
    });
    const oi = parseMarketGroupV17OI(buf);
    expect(oi.totalLongOiQ).toBe(0n);
    expect(oi.totalShortOiQ).toBe(0n);
    expect(oi.assets).toHaveLength(0);
  });

  it("handles large (u128-range) OI values without overflow", () => {
    // Use a value that exceeds Number.MAX_SAFE_INTEGER to confirm bigint handling.
    const bigLong = 2n ** 96n + 7n;
    const bigShort = 2n ** 80n + 3n;
    const buf = makeV17Buf({
      numSlots: 1,
      slotOIs: [{ long: bigLong, short: bigShort }],
      insurance: 2n ** 100n,
    });
    const oi = parseMarketGroupV17OI(buf);
    expect(oi.totalLongOiQ).toBe(bigLong);
    expect(oi.totalShortOiQ).toBe(bigShort);
    expect(oi.insuranceBalance).toBe(2n ** 100n);
  });

  it("throws for a non-v17 account (wrong magic)", () => {
    const buf = new Uint8Array(4000).fill(0);
    expect(() => parseMarketGroupV17OI(buf)).toThrow(
      "not a v17 market account",
    );
  });

  it("throws for a buffer that is too short", () => {
    const buf = new Uint8Array(100).fill(0);
    expect(() => parseMarketGroupV17OI(buf)).toThrow("buffer too short");
  });

  it("throws for a v17 account with wrong kind (portfolio, not market)", () => {
    const buf = makeV17Buf({ numSlots: 1 });
    // Overwrite kind byte to 2 (portfolio) so isV17MarketAccount returns false.
    buf[V17_KIND_OFF] = 2;
    expect(() => parseMarketGroupV17OI(buf)).toThrow(
      "not a v17 market account",
    );
  });
});
