/** Band / rent decoders, lot helpers, version-keyed discovery and the "no bare VERSION 18" source scan. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import * as Band from "../src/abi/v22-band.js";
import * as Lot from "../src/abi/v22-lot.js";
import { LAYOUT_V21, LAYOUT_V22, UnknownLayoutError } from "../src/abi/layout.js";
import { getMarketsByAddress } from "../src/solana/discovery.js";
import { isV17Account, isV17MarketAccount, knownWrapperVersions, parseLpRedemption, parseLpVaultRegistry, unknownMarketVersion } from "../src/solana/slab.js";
import { stampHeader, stampMarket } from "./helpers/stamp.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-band-parity.json", import.meta.url), "utf8")) as {
  config: Record<string, number>; assetState: Record<string, number>; growth: Record<string, number>; vaultLp: Record<string, number>; configLen: number; assetStateLen: number;
  rows: { fn: string; in: string[]; out: string[] }[];
};
const put = (d: Uint8Array, o: number, v: bigint, bytes = 8) => { for (let i = 0; i < bytes; i++) d[o + i] = Number((v >> BigInt(8 * i)) & 0xffn); };

describe("band / rent offsets == the real crate", () => {
  it("layout row", () => {
    const B = LAYOUT_V22.bandRent!;
    expect(B.configLen).toBe(FX.configLen);
    expect(LAYOUT_V22.assetStateLen).toBe(FX.assetStateLen);
    expect(B.config).toEqual(FX.config);
    expect(B.assetState).toEqual(FX.assetState);
    expect(B.growth).toEqual(FX.growth);
    expect(B.vaultLp).toEqual(FX.vaultLp);
    expect(LAYOUT_V22.group.assetSlotCapacity - LAYOUT_V22.group.config).toBe(FX.configLen);
    expect(LAYOUT_V21.bandRent).toBeNull();
  });
  it("NEGATIVE CONTROL: a moved offset would not match", () => {
    expect({ ...LAYOUT_V22.bandRent!.config, bandBps: 250 }).not.toEqual(FX.config);
  });
  it("rent / users-side / width rows", () => {
    for (const r of FX.rows) {
      const I = r.in.map((x) => x);
      if (r.fn === "rentRate") {
        const [u, n, k, m] = [BigInt(I[0]), BigInt(I[1]), Number(I[2]), BigInt(I[3])];
        const a = Band.rentRateE9V22(u, n, k, m);
        expect([a === null ? null : a.toString(), Band.rentRateE9FailClosedV22(u, n, k, m).toString()], `rentRate ${I}`).toEqual(r.out);
      } else if (r.fn === "usersSide") {
        expect([Band.usersSideOiQV22(BigInt(I[0]), BigInt(I[1]), I[2] === "true").toString()]).toEqual(r.out);
      } else if (r.fn === "widthOk") {
        const w = Band.assetPriceLaggedV22; void w;
        expect([String(Band.bandFloorStuckV22({ bandBps: Number(I[1]), effectivePrice: BigInt(I[0]), targetPrice: 0n, oiEffLongQ: 1n, oiEffShortQ: 0n, maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 1_000_000n, pinSinceSlot: 1n }))]).toEqual([String(r.out[0] === "false")]);
      }
    }
    expect(FX.rows.length).toBeGreaterThan(500);
  });
});

function market(opts: { bandBps?: number; rentMax?: bigint; mark?: bigint; target?: bigint; oiLong?: bigint; pin?: bigint; move?: bigint; dt?: bigint; bound?: boolean; nCap?: bigint; kink?: number; lpNet?: bigint }): Uint8Array {
  const L = LAYOUT_V22, B = L.bandRent!;
  const d = stampMarket(new Uint8Array(L.marketGroupOff + L.marketGroupLen + L.assetSlotStride), 19);
  const cfg = L.marketGroupOff + L.group.config;
  put(d, cfg + B.config.bandBps, BigInt(opts.bandBps ?? 0)); put(d, cfg + B.config.bandMaxEpochSlots, 600n); put(d, cfg + B.config.bandMaxPinSlots, 9000n);
  put(d, cfg + B.config.rentMaxE9PerSlot, opts.rentMax ?? 0n); put(d, cfg + B.config.maxPriceMoveBpsPerSlot, opts.move ?? 4n); put(d, cfg + B.config.maxAccrualDtSlots, opts.dt ?? 100n);
  put(d, cfg + B.config.bandMaxPositionsPerSide, 256n); put(d, cfg + B.config.bandMinLegNotional, 100_000_000n);
  const e = L.marketGroupOff + L.marketGroupLen + L.wrapperSlotLen;
  put(d, e + L.assetState.effectivePrice, opts.mark ?? 1_000_000n); put(d, e + L.assetState.rawOracleTargetPrice, opts.target ?? opts.mark ?? 1_000_000n);
  put(d, e + L.assetState.oiEffLongQ, opts.oiLong ?? 0n, 16);
  put(d, e + B.assetState.bandPinSinceSlot, opts.pin ?? 0n);
  const s = L.marketGroupOff + L.marketGroupLen;
  put(d, s + L.wrapperSlot.growth + B.growth.rentKinkBps, BigInt(opts.kink ?? 0), 2); put(d, s + L.wrapperSlot.growth + B.growth.rentNCapQ, opts.nCap ?? 0n);
  d[s + L.wrapperSlot.vaultLp + B.vaultLp.flags] = opts.bound ? 1 : 0;
  put(d, s + L.wrapperSlot.vaultLp + B.vaultLp.lpNetQ, (opts.lpNet ?? 0n) & ((1n << 128n) - 1n), 16);
  return d;
}

describe("decoders and the wrapper's favourable-close rule", () => {
  it("decode round-trip through the layout row", () => {
    const d = market({ bandBps: 130, rentMax: 4321n, mark: 900n, target: 1000n, oiLong: 7n, pin: 55n, bound: true, nCap: 1000n, kink: 5000, lpNet: -3n });
    expect(Band.decodeBandConfigV22(d)).toMatchObject({ bandBps: 130, rentMaxE9PerSlot: 4321n, bandMaxEpochSlots: 600n, bandMaxPositionsPerSide: 256n, bandMinLegNotional: 100_000_000n });
    expect(Band.decodeAssetBandStateV22(d)).toMatchObject({ effectivePrice: 900n, rawOracleTargetPrice: 1000n, oiEffLongQ: 7n, bandPinSinceSlot: 55n });
    expect(Band.decodeAssetRentStateV22(d)).toEqual({ rentKinkBps: 5000, rentNCapQ: 1000n, vaultLpNetQ: -3n, vaultLpBound: true });
  });
  it("v2.1 / unknown VERSION is a typed error, never a misread", () => {
    expect(() => Band.decodeBandConfigV22(stampMarket(new Uint8Array(1350 + 2325), 18))).toThrow(UnknownLayoutError);
    expect(() => Band.decodeBandConfigV22(stampMarket(new Uint8Array(1398 + 2629), 20))).toThrow(UnknownLayoutError);
    expect(Band.tryReadBandRentViewV22(stampMarket(new Uint8Array(1350 + 2325), 18))).toBeNull();
    expect(Band.readBandRentViewV22(market({}))).toBeNull();
  });
  it("lag needs EXPOSURE: an unexposed asset is never lagged", () => {
    expect(Band.readBandRentViewV22(market({ bandBps: 130, mark: 900n, target: 1000n, oiLong: 0n }))!.price.lagging).toBe(false);
    expect(Band.readBandRentViewV22(market({ bandBps: 130, mark: 900n, target: 1000n, oiLong: 1n }))!.price.lagging).toBe(true);
  });
  it("favourable side: mark above target (price fell) refuses longs; below target refuses shorts (v16_program.rs reject_band_favourable_close_view)", () => {
    const base = { bandBps: 130, mark: 1_000_000n, oiLong: 1n };
    expect(Band.readBandRentViewV22(market({ ...base, target: 900_000n }))!.price.favourableCloseSide).toBe("long");
    expect(Band.readBandRentViewV22(market({ ...base, target: 1_100_000n }))!.price.favourableCloseSide).toBe("short");
    expect(Band.readBandRentViewV22(market({ ...base, target: 1_000_000n }))!.price.favourableCloseSide).toBeNull();
    const a = { bandBps: 130, effectivePrice: 1_000_000n, targetPrice: 900_000n, oiEffLongQ: 1n, oiEffShortQ: 0n, maxPriceMoveBpsPerSlot: 4n, maxAccrualDtSlots: 100n, pinSinceSlot: 0n };
    expect(Band.favourableCloseRefusedV22(a, 5n, -5n)).toBe(true); // long closing above the target: refused
    expect(Band.favourableCloseRefusedV22(a, -5n, 5n)).toBe(false); // short buying at the stale high price: the worse side, allowed
    expect(Band.favourableCloseRefusedV22(a, 5n, 3n)).toBe(false); // increasing, not reducing
    expect(Band.favourableCloseRefusedV22(a, 5n, -7n)).toBe(true); // flip: the closing part counts
    expect(Band.favourableCloseRefusedV22(a, 0n, 5n)).toBe(false); // opening
    expect(Band.favourableCloseRefusedV22({ ...a, bandBps: 0 }, 5n, -5n)).toBe(false); // off-band
  });
  it("floor-stuck exemption: dead zone (max step 0) or pinned on a narrow band lifts the refusal", () => {
    const a = { bandBps: 130, effectivePrice: 50n, targetPrice: 40n, oiEffLongQ: 1n, oiEffShortQ: 0n, maxPriceMoveBpsPerSlot: 4n, maxAccrualDtSlots: 100n, pinSinceSlot: 0n };
    // 50 * 4 * 100 / 10000 = 2 > 0: not a dead zone; width at 50 is < 32 ticks but the pin clock is not running -> NOT stuck
    expect(Band.bandFloorStuckV22(a)).toBe(false);
    expect(Band.favourableCloseRefusedV22(a, 5n, -5n)).toBe(true);
    expect(Band.bandFloorStuckV22({ ...a, pinSinceSlot: 9n })).toBe(true);
    expect(Band.favourableCloseRefusedV22({ ...a, pinSinceSlot: 9n }, 5n, -5n)).toBe(false);
    expect(Band.bandFloorStuckV22({ ...a, effectivePrice: 1_000_000n, maxPriceMoveBpsPerSlot: 0n })).toBe(true);
    expect(Band.bandFloorStuckV22({ ...a, bandBps: 0 })).toBe(false);
  });
  it("rent rates need a rent ceiling, a bound vault and a measured N_cap; users side excludes the LP leg", () => {
    const v = Band.readBandRentViewV22(market({ rentMax: 100n, bound: true, nCap: 1000n, kink: 5000, oiLong: 900n, lpNet: 0n }))!;
    expect(v.rentRates).toEqual({ enabled: true, long: 80n, short: 0n });
    expect(Band.readBandRentViewV22(market({ rentMax: 100n, bound: false, nCap: 1000n, kink: 5000, oiLong: 900n }))!.rentRates.long).toBe(0n);
    expect(Band.readBandRentViewV22(market({ rentMax: 100n, bound: true, nCap: 1000n, kink: 5000, oiLong: 900n, lpNet: 400n }))!.rentRates.long).toBe(0n);
    expect(Band.rentPercentPerDayV22(100n)).toBeGreaterThan(0);
  });
});

describe("lot helpers: one conversion, sizes never round up", () => {
  it("conversions", () => {
    expect(Lot.lotPriceToTokenE6V22(40_000_000n, 5)).toBe(400n);
    expect(Lot.tokenPriceToLotE6V22(400n, 5)).toBe(40_000_000n);
    expect(Lot.lotsToTokensV22(7n, 3)).toBe(7000n);
    expect(Lot.qToTokenQV22(3_000_000n, 2)).toBe(300_000_000n);
    expect(Lot.tokenQToQV22(1_234_567n, 3)).toEqual({ q: 1_234n, remainderTokenQ: 567n });
    expect(Lot.tokenQToQV22(-1_234_567n, 3)).toEqual({ q: -1_234n, remainderTokenQ: -567n });
    expect(Lot.quantizeQToLotsV22(2_999_999n)).toEqual({ q: 2_000_000n, remainderQ: 999_999n });
    expect(Lot.quantizeQToLotsV22(-2_999_999n)).toEqual({ q: -2_000_000n, remainderQ: -999_999n });
    expect(() => Lot.lotsToTokensV22(1n, 16)).toThrow();
  });
  it("property: converting a size to lots and back never exceeds the input", () => {
    for (let lotExp = 0; lotExp <= 15; lotExp += 3) for (const t of [0n, 1n, 9n, 10n ** 6n - 1n, 123_456_789_012n, -999n, -1_000_000_000n]) {
      const { q } = Lot.tokenQToQV22(t, lotExp);
      const back = Lot.qToTokenQV22(q, lotExp);
      expect((back < 0n ? -back : back) <= (t < 0n ? -t : t)).toBe(true);
      const qq = Lot.quantizeQToLotsV22(t).q;
      expect((qq < 0n ? -qq : qq) <= (t < 0n ? -t : t)).toBe(true);
    }
  });
  it("lot exponent is read VERSION-keyed", () => {
    const d = stampMarket(new Uint8Array(1398 + 2629), 19);
    d[LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen + LAYOUT_V22.wrapperSlot.profileLotExp] = 4;
    expect(Lot.lotExpOfMarketV22(d)).toBe(4);
    expect(Lot.lotExpOfMarketV22(stampMarket(new Uint8Array(1350 + 2325), 18))).toBe(0);
    expect(() => Lot.lotExpOfMarketV22(stampMarket(new Uint8Array(1398 + 2629), 20))).toThrow(UnknownLayoutError);
    d[LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen + LAYOUT_V22.wrapperSlot.profileLotExp] = 16;
    expect(() => Lot.lotExpOfMarketV22(d)).toThrow(RangeError);
  });
});

describe("version-keyed predicates and discovery", () => {
  const v19 = () => stampMarket(new Uint8Array(1398 + 2629), 19);
  it("predicates accept every known VERSION, refuse the rest", () => {
    expect(knownWrapperVersions()).toEqual([18, 19]);
    for (const v of [18, 19]) { expect(isV17Account(stampMarket(new Uint8Array(1500), v))).toBe(true); expect(isV17MarketAccount(stampMarket(new Uint8Array(1500), v))).toBe(true); }
    expect(isV17MarketAccount(stampMarket(new Uint8Array(1500), 20))).toBe(false);
    expect(unknownMarketVersion(stampMarket(new Uint8Array(1500), 20))).toBe(20);
    expect(unknownMarketVersion(v19())).toBeNull();
  });
  it("registry / redemption parsers accept v2.2 headers", () => {
    expect(() => parseLpVaultRegistry(stampHeader(new Uint8Array(176), 5, 19))).not.toThrow();
    expect(() => parseLpRedemption(stampHeader(new Uint8Array(128), 6, 19))).not.toThrow();
    expect(() => parseLpVaultRegistry(stampHeader(new Uint8Array(176), 5, 20))).toThrow(UnknownLayoutError);
  });
  it("getMarketsByAddress discovers v2.2, skips an unknown VERSION loudly, and does not fail the batch", async () => {
    const prog = Keypair.generate().publicKey;
    const [a, b, c] = [Keypair.generate().publicKey, Keypair.generate().publicKey, Keypair.generate().publicKey];
    const mk = (d: Uint8Array) => ({ data: Buffer.from(d), owner: prog, executable: false, lamports: 1 });
    const conn = { getMultipleAccountsInfo: async () => [mk(stampMarket(new Uint8Array(1500), 18)), mk(v19()), mk(stampMarket(new Uint8Array(1500), 20))] };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = await getMarketsByAddress(conn as never, prog, [a, b, c]);
    expect(out.map((m) => [m.slabAddress.toBase58(), m.wrapperVersion])).toEqual([[a.toBase58(), 18], [b.toBase58(), 19]]);
    expect(warn.mock.calls.some((x) => String(x[0]).includes("VERSION 20"))).toBe(true);
    warn.mockRestore();
    void PublicKey;
  });
});

describe("source scan: no bare VERSION 18 assertion", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === "__tests__" ? [] : walk(p)) : p.endsWith(".ts") ? [p] : []; });
  it("no `=== 18` / `!== 18` / `=== V17_EXPECTED_VERSION` comparison in src", () => {
    const bad: string[] = [];
    for (const f of walk(new URL("../src", import.meta.url).pathname)) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (/(===|!==|==|!=)\s*18\b/.test(code) || /\b18\s*(===|!==|==|!=)/.test(code) || /(===|!==)\s*V17_EXPECTED_VERSION\b/.test(code) || /V17_EXPECTED_VERSION\s*(===|!==)/.test(code)) bad.push(`${f.split("/src/")[1]}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
  it("NEGATIVE CONTROL: the scanner would catch one", () => {
    const re = (l: string) => /(===|!==|==|!=)\s*18\b/.test(l);
    expect(re("if (version !== 18) throw")).toBe(true);
    expect(re("const x = 184;")).toBe(false);
  });
});
