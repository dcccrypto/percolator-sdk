/**
 * Differential test: the optimised resolveMarketGeometry / readWrapperHeader must match a FROZEN copy of the
 * pre-optimisation implementation (base 9666228) on varied real-layout buffers: same geometry, same errors.
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_KIND,
  LAYOUT_V21,
  LAYOUT_V22,
  LAYOUTS_BY_VERSION,
  UnknownLayoutError,
  WRAPPER_ACCOUNT_MAGIC,
  readWrapperHeader,
  resolveMarketGeometry,
  type LayoutTable,
  type MarketGeometryOptions,
} from "../src/abi/layout.js";

// ---- FROZEN COPY (do not edit) ----
const dvF = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);
function frozenHeader(data: Uint8Array, parser = "readWrapperHeader") {
  if (data.length < 16) throw new UnknownLayoutError("TOO_SHORT", parser, `data too short (${data.length} < 16)`);
  const v = dvF(data);
  return { magic: v.getBigUint64(0, true), version: v.getUint16(8, true), kind: data[10] };
}
function frozenResolveLayout(data: Uint8Array, opts: { parser: string; kind?: number; versions?: readonly number[]; registry?: ReadonlyMap<number, LayoutTable> }): LayoutTable {
  const { parser } = opts;
  const { magic, version, kind } = frozenHeader(data, parser);
  if (magic !== WRAPPER_ACCOUNT_MAGIC) throw new UnknownLayoutError("BAD_MAGIC", parser, "invalid v17 magic", { version, kind });
  const registry = opts.registry ?? LAYOUTS_BY_VERSION;
  const table = registry.get(version);
  const allowed = opts.versions === undefined || opts.versions.includes(version);
  if (!table || !allowed) {
    const known = (opts.versions ?? [...registry.keys()]).join(", ");
    throw new UnknownLayoutError("UNKNOWN_VERSION", parser, `invalid v17 version (${version} is not a known layout; this SDK decodes VERSION ${known}). Refusing to read it with another layout's offsets.`, { version, kind });
  }
  if (opts.kind !== undefined && kind !== opts.kind) {
    throw new UnknownLayoutError("WRONG_KIND", parser, `invalid v17 account kind (${kind} !== ${opts.kind})`, { version, kind });
  }
  return table;
}
function frozenGeometry(data: Uint8Array, opts: MarketGeometryOptions) {
  const registry = opts.registry ?? LAYOUTS_BY_VERSION;
  let minEnd = Infinity;
  for (const t of registry.values()) minEnd = Math.min(minEnd, t.marketGroupOff + t.marketGroupLen);
  if (data.length < minEnd) {
    throw new UnknownLayoutError("TOO_SHORT", opts.parser, `buffer too short: need >= ${minEnd} bytes, got ${data.length}`);
  }
  let layout: LayoutTable;
  try {
    layout = frozenResolveLayout(data, { parser: opts.parser, kind: ACCOUNT_KIND.Market, versions: opts.versions, registry: opts.registry });
  } catch (e) {
    if (e instanceof UnknownLayoutError && (e.code === "BAD_MAGIC" || e.code === "WRONG_KIND" || e.code === "UNKNOWN_VERSION")) {
      throw new UnknownLayoutError(e.code, opts.parser, `${e.code === "WRONG_KIND" ? `not a market account (kind ${e.kind}); ` : ""}not a v17 market account (bad magic, version, or kind): ${e.message.slice(opts.parser.length + 2)}`, { version: e.version, kind: e.kind });
    }
    throw e;
  }
  const groupOff = layout.marketGroupOff;
  const slotsBase = groupOff + layout.marketGroupLen;
  if (data.length < slotsBase) {
    throw new UnknownLayoutError("TOO_SHORT", opts.parser, `buffer too short: need >= ${slotsBase} bytes for a VERSION ${layout.version} market, got ${data.length}`, { version: layout.version, kind: ACCOUNT_KIND.Market });
  }
  const tail = data.length - slotsBase;
  if ((opts.strictLength ?? true) && tail % layout.assetSlotStride !== 0) {
    throw new UnknownLayoutError("BAD_LENGTH", opts.parser, `market length ${data.length} is not ${slotsBase} + n x ${layout.assetSlotStride} (VERSION ${layout.version}); refusing to guess the layout from the length`, { version: layout.version, kind: ACCOUNT_KIND.Market });
  }
  const stride = layout.assetSlotStride;
  return {
    layout, groupOff, slotsBase, slotCount: Math.floor(tail / stride),
    slotOff: (i: number) => slotsBase + i * stride,
    engineOff: (i: number) => slotsBase + i * stride + layout.wrapperSlotLen,
  };
}
// ---- END FROZEN COPY ----

function outcome<T>(f: () => T): unknown {
  try {
    const g: any = f();
    if (g && typeof g.slotOff === "function") {
      return { ok: { layout: g.layout.version, layoutRef: LAYOUTS_BY_VERSION.get(g.layout.version) === g.layout || g.layout.version === 77, groupOff: g.groupOff, slotsBase: g.slotsBase, slotCount: g.slotCount, so: [0, 1, 7, 15].map((i) => [g.slotOff(i), g.engineOff(i)]) } };
    }
    return { ok: g };
  } catch (e) {
    const x = e as UnknownLayoutError;
    return { err: { name: x.name, message: x.message, code: x.code, parser: x.parser, version: x.version, discriminator: x.discriminator, kind: x.kind, own: Object.keys(x) } };
  }
}

let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };

function build(len: number, version: number, kind: number, magicOk = true): Uint8Array {
  const b = new Uint8Array(len);
  for (let i = 0; i < Math.min(len, 64); i++) b[i] = rnd() & 0xff; // only the header region is read by the guard
  if (len >= 16) {
    const dv = new DataView(b.buffer);
    dv.setBigUint64(0, magicOk ? WRAPPER_ACCOUNT_MAGIC : (BigInt(rnd()) << 32n) | BigInt(rnd()), true);
    dv.setUint16(8, version, true);
    b[10] = kind;
  }
  return b;
}

describe("resolveMarketGeometry differential vs frozen base copy", () => {
  const extra: LayoutTable = { ...LAYOUT_V22, version: 77, marketGroupLen: 100, assetSlotStride: 1000 };
  const registries = [undefined, new Map<number, LayoutTable>([[77, extra]]), new Map<number, LayoutTable>([[18, LAYOUT_V21], [77, extra]])];
  const lens = new Set<number>([0, 1, 15, 16, 17, 100, 591, 592]);
  for (const L of [LAYOUT_V21, LAYOUT_V22, extra]) {
    const base = L.marketGroupOff + L.marketGroupLen;
    for (const n of [0, 1, 2, 16]) for (const d of [-1, 0, 1, 7]) lens.add(base + n * L.assetSlotStride + d);
    lens.add(base - 1);
    lens.add(base - 2);
  }
  const versions = [0, 18, 19, 77, 65535];
  const kinds = [0, 1, 2, 255];

  it("matches on the cross product (versions x kinds x lengths x options x registries)", () => {
    let n = 0;
    for (const len of lens) {
      for (const version of versions) {
        for (const kind of kinds) {
          const buf = build(len, version, kind);
          for (const registry of registries) {
            for (const strictLength of [undefined, true, false]) {
              for (const vs of [undefined, [19], [18, 19]] as const) {
                const opts: MarketGeometryOptions = { parser: "diff", strictLength, versions: vs, registry };
                expect(outcome(() => resolveMarketGeometry(buf, opts))).toEqual(outcome(() => frozenGeometry(buf, opts)));
                n++;
              }
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(5_000);
  }, 120_000);

  it("matches on bad magic, sub-array views with byteOffset, and a real 43,974 B v2.2 buffer", () => {
    const real = build(LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen + 16 * LAYOUT_V22.assetSlotStride, LAYOUT_V22.version, ACCOUNT_KIND.Market);
    expect(real.length).toBe(43_974);
    const o = { parser: "real", strictLength: false } as const;
    expect(outcome(() => resolveMarketGeometry(real, o))).toEqual(outcome(() => frozenGeometry(real, o)));
    expect((outcome(() => resolveMarketGeometry(real, o)) as any).ok.slotCount).toBe(16);
    for (let i = 0; i < 300; i++) {
      const buf = build(1400 + (rnd() % 20000), [18, 19][rnd() & 1], rnd() % 3, (rnd() & 3) !== 0);
      expect(outcome(() => resolveMarketGeometry(buf, o))).toEqual(outcome(() => frozenGeometry(buf, o)));
      const padded = new Uint8Array(buf.length + 13);
      padded.set(buf, 13);
      const view = padded.subarray(13);
      expect(outcome(() => resolveMarketGeometry(view, { parser: "v" }))).toEqual(outcome(() => frozenGeometry(buf, { parser: "v" })));
    }
  });

  it("magic differs in a single byte (every position, incl. sign bit bytes)", () => {
    const good = build(LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen, LAYOUT_V22.version, ACCOUNT_KIND.Market);
    for (let p = 0; p < 8; p++) for (const bit of [0, 7]) {
      const b = good.slice();
      b[p] ^= 1 << bit;
      expect(outcome(() => resolveMarketGeometry(b, { parser: "m" }))).toEqual(outcome(() => frozenGeometry(b, { parser: "m" })));
    }
  });

  it("readWrapperHeader equals the frozen header read", () => {
    for (let i = 0; i < 2000; i++) {
      const b = build(rnd() % 40, rnd() & 0xffff, rnd() & 0xff, (rnd() & 1) === 0);
      expect(outcome(() => readWrapperHeader(b, "h"))).toEqual(outcome(() => frozenHeader(b, "h")));
    }
  });
});
