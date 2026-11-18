import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable override of the geometry resolver: lets a test point the parser's
// readers at offsets the real (length-validated) geometry would never produce.
let override: ((g: any) => any) | null = null;
vi.mock("../src/abi/layout.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/abi/layout.js")>();
  return {
    ...actual,
    resolveMarketGeometry: (...args: any[]) => {
      const g = (actual.resolveMarketGeometry as any)(...args);
      return override ? override(g) : g;
    },
  };
});

import { parseBackingBucketsV17 } from "../src/solana/backing-bucket.js";
import { resolveMarketGeometry } from "../src/abi/layout.js";
import {
  V17_MAGIC,
  V17_MARKET_ASSET_SLOT_LEN,
  V17_MARKET_GROUP_LEN,
  V17_MARKET_GROUP_OFF,
  V17_EXPECTED_VERSION,
  V17_KIND_MARKET,
} from "../src/solana/slab.js";

function market(slots: number): Uint8Array {
  const buf = new Uint8Array(
    V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + slots * V17_MARKET_ASSET_SLOT_LEN,
  );
  new DataView(buf.buffer).setBigUint64(0, V17_MAGIC, true);
  new DataView(buf.buffer).setUint16(8, V17_EXPECTED_VERSION, true);
  buf[10] = V17_KIND_MARKET;
  // max_market_slots = slots (u32 at group + config + 2)
  const g = resolveMarketGeometry(buf, { parser: "t", strictLength: false });
  new DataView(buf.buffer).setUint32(
    g.groupOff + g.layout.group.config + g.layout.group.maxMarketSlotsInConfig,
    slots,
    true,
  );
  return buf;
}

describe("parseBackingBucketsV17 — bounds guards", () => {
  beforeEach(() => {
    override = null;
  });

  it("stops at a truncated trailing bucket instead of reading past the buffer", () => {
    // 2 addressable slots declared, but the tail holds only one full slot stride
    // minus the last slot's short bucket: loop must `break`, not throw.
    const full = market(1);
    const g = resolveMarketGeometry(full, { parser: "t", strictLength: false });
    const cut = g.engineOff(0) + g.layout.engineSlot.backingShort; // short bucket absent
    const short = full.slice(0, cut + 10);
    // Real geometry floors slotCount by length, so a partial slot is unreachable
    // there; force slotCount=1 to exercise the defensive guard.
    override = (gg) => ({ ...gg, slotCount: 1 });
    const st = parseBackingBucketsV17(short);
    expect(st.buckets.map((b) => b.side)).toEqual(["long"]);
  });

  it("readU8At throws when the mode byte is out of bounds", () => {
    const buf = market(1);
    override = (g) => ({ ...g, groupOff: 1_000_000 });
    expect(() => parseBackingBucketsV17(buf)).toThrow(/readU8At: out of bounds/);
  });

  it("readU64LEAt throws when current_slot is out of bounds", () => {
    const buf = market(1);
    override = (g) => ({
      ...g,
      layout: { ...g.layout, group: { ...g.layout.group, currentSlot: buf.length } },
    });
    expect(() => parseBackingBucketsV17(buf)).toThrow(/readU64LEAt: out of bounds/);
  });

  it("readU32LEAt throws when max_market_slots is out of bounds", () => {
    const buf = market(1);
    override = (g) => ({
      ...g,
      layout: { ...g.layout, group: { ...g.layout.group, maxMarketSlotsInConfig: buf.length } },
    });
    expect(() => parseBackingBucketsV17(buf)).toThrow(/readU32LEAt: out of bounds/);
  });
});
