// DRAFT (fails on feat/v22-sdk-growth e4acaa84). parseChainlinkPrice (src/solana/oracle.ts:128-203) vs
// read_chainlink_price_e12 (v16_program.rs:12783-12823) + scale_decimal_to_e12 (12671-12687).
//   M5 header validity (12799-12816): discriminator, version != 0, latest_round_id != 0, live_length == 1,
//      transmission slot != 0, publish_time > 0. The SDK checks none of these (publish_time only when a staleness
//      bound is passed).
//   M6 range (12550-12552 via 12683): an answer whose E12 value is 0, whose e6 is above MAX_ORACLE_PRICE, or whose
//      scaling overflows u128 is refused; the SDK returns it.
//   M7 future timestamp (12819): the program refuses age < 0; the SDK tolerates 60 s by default (documented clock-skew
//      allowance, oracle.ts:98-107). Kept as a decision row: either default the tolerance to 0 or keep and document.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseChainlinkPrice } from "../src/solana/oracle.js";
import { clBytes, NOW } from "./oracle-vs-prog-fixtures.js";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW * 1000); });
afterEach(() => vi.useRealTimers());
const ok = { answer: 15_000_000_000n, decimals: 8 };

describe("M5 parseChainlinkPrice refuses the header states the program refuses", () => {
  it("control: a healthy feed parses", () => expect(parseChainlinkPrice(clBytes(ok), { maxStalenessSeconds: 60 }).price).toBe(15_000_000_000n));
  it.each([
    ["C-ver0     version 0", { ...ok, version: 0 }],
    ["C-round0   latest_round_id 0", { ...ok, round: 0 }],
    ["C-live2    live_length 2", { ...ok, live: 2 }],
    ["C-slot0    transmission slot 0", { ...ok, slot: 0n }],
    ["C-baddisc  wrong discriminator", { ...ok, disc: false }],
  ])("%s", (_l, o) => expect(() => parseChainlinkPrice(clBytes(o), { maxStalenessSeconds: 60 })).toThrow());
  it("C-ts0-nostale: timestamp 0 refused even without a staleness bound", () => expect(() => parseChainlinkPrice(clBytes({ ...ok, ts: 0 }))).toThrow());
});

describe("M6 parseChainlinkPrice refuses answers outside the program's E12 / MAX_ORACLE_PRICE range", () => {
  it("control: $1,000,000 at 0 decimals (= MAX_ORACLE_PRICE e6) parses", () => expect(parseChainlinkPrice(clBytes({ answer: 1_000_000n, decimals: 0 })).price).toBe(1_000_000n));
  it.each([
    ["C-sub-e12  $1e-13 (E12 floor 0)", { answer: 100_000n, decimals: 18 }],
    ["C-gt-max   $1e13+1", { answer: 10_000_000_000_001n, decimals: 0 }],
    ["C-i128max  u128 overflow in scaling", { answer: (1n << 127n) - 1n, decimals: 0 }],
  ])("%s", (_l, o) => expect(() => parseChainlinkPrice(clBytes(o))).toThrow());
});

describe("M7 future publish time (decision row)", () => {
  it("C-age=-1: refused like the program with the default options", () => {
    expect(() => parseChainlinkPrice(clBytes({ ...ok, age: -1 }), { maxStalenessSeconds: 60 })).toThrow();
  });
});
