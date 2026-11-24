// DRAFT (fails on feat/v22-sdk-growth e4acaa84): three oracle paths the program has and the SDK does not.
//   M3 Pyth PriceUpdateV2 reader (v16_program.rs:12579-12629): disc, Full verification, |expo|<=18, staleness
//      age in [0, max], conf*10000 <= price*conf_bps. The SDK has only pythPriceToLotE6V22(price, expo, lot), with no
//      staleness / confidence / verification gate, so a stale, wide or partially-verified update is priced.
//   M4 compose (v16_program.rs:12882-12945): invert (d*1e24/n) and unit_scale (/max(unit_scale,1)) rounded ONCE.
//      The SDK has no compose; the only converter ignores invert and unit_scale.
//   M9 Switchboard On-Demand reader (v16_program.rs:12707-12769): no SDK reader at all.
// Names below are PROPOSED exports; the tests fail first on "not a function".
import { beforeEach, describe, expect, it } from "vitest";
import * as oracle from "../src/solana/oracle.js";
import * as lot from "../src/abi/v22-lot.js";
import { FEED, NOW, pythBytes, sbBytes } from "./oracle-vs-prog-fixtures.js";

type PythReader = (data: Uint8Array, o: { feedId: Uint8Array; nowUnixTs: number; maxStalenessSecs: number; confFilterBps: number }) => { priceE12: bigint; publishTime: number };
type Compose = (legsE12: bigint[], flags: number, invert: number, unitScale: number, lotExp: number) => bigint | null;
type SbReader = (data: Uint8Array, o: { nowUnixTs: number; maxStalenessSecs: number; confFilterBps: number }) => { priceE12: bigint; publishTime: number };

describe("M3 Pyth PriceUpdateV2 reader matches read_pyth_price_e12", () => {
  const read = (oracle as Record<string, unknown>).parsePythPriceUpdateV2 as PythReader;
  const o = (conf = 0) => ({ feedId: FEED, nowUnixTs: NOW, maxStalenessSecs: 60, confFilterBps: conf });
  beforeEach(() => expect(typeof read, "proposed export missing").toBe("function"));
  it("P-age=max: accepted at exactly the limit", () => expect(read(pythBytes({ price: 150_000_000n, expo: -6, age: 60 }), o()).priceE12).toBe(150_000_000_000_000n));
  it("P-age=max+1: OracleStale", () => expect(() => read(pythBytes({ price: 150_000_000n, expo: -6, age: 61 }), o())).toThrow());
  it("P-age=-1: OracleStale (future publish)", () => expect(() => read(pythBytes({ price: 150_000_000n, expo: -6, age: -1 }), o())).toThrow());
  it("P-conf=edge: conf exactly 2% at 200 bps accepted", () => expect(read(pythBytes({ price: 150_000_000n, conf: 3_000_000n, expo: -6 }), o(200)).priceE12).toBe(150_000_000_000_000n));
  it("P-conf=edge+1: OracleConfTooWide", () => expect(() => read(pythBytes({ price: 150_000_000n, conf: 3_000_001n, expo: -6 }), o(200))).toThrow());
  it("P-partial: verification level != Full refused", () => expect(() => read(pythBytes({ price: 150_000_000n, expo: -6, verif: 0 }), o())).toThrow());
  it("P-baddisc: wrong discriminator refused", () => expect(() => read(pythBytes({ price: 150_000_000n, expo: -6, disc: false }), o())).toThrow());
});

describe("M4 compose matches compose_price_e12_to_e6 (invert / unit_scale, one rounding)", () => {
  const compose = (lot as Record<string, unknown>).composeOraclePriceE6V22 as Compose;
  beforeEach(() => expect(typeof compose, "proposed export missing").toBe("function"));
  it.each([
    ["I-sol     $150 inverted", [150_000_000_000_000n], 1, 0, 0, 6_666n],
    ["I-round   $3 inverted", [3_000_000_000_000n], 1, 0, 0, 333_333n],
    ["I-tiny-ok $3e-6 inverted", [3_000_000n], 1, 0, 0, 333_333_333_333n],
    ["U-1000    $150 / 1000", [150_000_000_000_000n], 0, 1000, 0, 150_000n],
    ["IU-both   $150 inverted / 1000", [150_000_000_000_000n], 1, 1000, 0, 6n],
    ["I-tiny    $3e-7 inverted = $3.3M > MAX", [300_000n], 1, 0, 0, null],
  ])("%s", (_l, legs, invert, unitScale, lotExp, want) => {
    expect(compose(legs as bigint[], 0, invert as number, unitScale as number, lotExp as number)).toBe(want);
  });
});

describe("M9 Switchboard On-Demand reader matches read_switchboard_price_e12", () => {
  const read = (oracle as Record<string, unknown>).parseSwitchboardPullFeedPrice as SbReader;
  const o = (conf = 0) => ({ nowUnixTs: NOW, maxStalenessSecs: 60, confFilterBps: conf });
  beforeEach(() => expect(typeof read, "proposed export missing").toBe("function"));
  it("S-150: 150e18 -> 150e12 at E12", () => expect(read(sbBytes({ value: 150n * 10n ** 18n }), o()).priceE12).toBe(150_000_000_000_000n));
  it("S-age=max+1: stale", () => expect(() => read(sbBytes({ value: 150n * 10n ** 18n, age: 61 }), o())).toThrow());
  it("S-conf=edge+1: std_dev too wide", () => expect(() => read(sbBytes({ value: 150n * 10n ** 18n, std: 3n * 10n ** 18n + 1n }), o(200))).toThrow());
});
