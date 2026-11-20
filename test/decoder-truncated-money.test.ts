// Truncated-account tests from the decoder truncation fuzz (J-20261120-SDK-REPORT-DECODERTRUNCFUZZ).
// Same bug class as #598 (backing-bucket): a truncated account (short RPC read / dataSlice) must throw
// UnknownLayoutError TOO_SHORT, never return a plausible value with money fields zeroed or dropped.
// Run: npx vitest run --maxWorkers=4 test/decoder-truncated-money.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  decodeMarketFundingV22,
  parseMarketGroupV17OI,
  parsePortfolioV17,
  resolveMarketGeometry,
  resolvePortfolioLayout,
  UnknownLayoutError,
} from "../src/index.js";

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
// Live devnet v2.2 market (VERSION 19), 5 asset slots, max_market_slots = 5.
const MARKET = new Uint8Array(Buffer.from(fx("v22-q7-devnet-2026-10-12.json").accounts.market, "base64"));
// Live devnet v18 portfolio with one active leg and a non-zero residual loss total.
const PORTFOLIO = new Uint8Array(Buffer.from(fx("portfolio-v18-active-leg.json").dataBase64, "base64"));

const g = resolveMarketGeometry(MARKET, { parser: "test" });
/** The market cut to `n` whole asset slots: what a short read / dataSlice returns. */
const marketWithSlots = (n: number) => MARKET.slice(0, g.slotsBase + n * g.layout.assetSlotStride);

function expectTooShort(f: () => unknown) {
  let err: unknown;
  let got: unknown;
  try {
    got = f();
  } catch (e) {
    err = e;
  }
  expect(got, "decoder returned a value for a truncated account").toBeUndefined();
  expect(err).toBeInstanceOf(UnknownLayoutError);
  expect((err as UnknownLayoutError).code).toBe("TOO_SHORT");
}

describe("decodeMarketFundingV22 on a truncated market (src/abi/v22-funding.ts)", () => {
  it("sanity: the full market decodes all 5 assets with asset 2 OI = 120", () => {
    const f = decodeMarketFundingV22(MARKET);
    expect(f.assets).toHaveLength(5);
    expect(f.assets[2]!.oiEffLongQ).toBe(120n);
  });
  it("a market cut to 2 of its 5 slots throws TOO_SHORT instead of returning 2 assets", () => {
    expectTooShort(() => decodeMarketFundingV22(marketWithSlots(2)));
  });
  it("a market cut mid-slot throws TOO_SHORT instead of silently dropping the partial slot", () => {
    expectTooShort(() => decodeMarketFundingV22(MARKET.slice(0, MARKET.length - 1)));
  });
});

describe("parseMarketGroupV17OI on a truncated market (src/solana/slab.ts)", () => {
  it("sanity: the full market totals 861631 long / short OI", () => {
    const oi = parseMarketGroupV17OI(MARKET);
    expect([oi.totalLongOiQ, oi.totalShortOiQ]).toEqual([861631n, 861631n]);
  });
  it("a market cut to 1 slot throws TOO_SHORT instead of reporting total OI 91372", () => {
    expectTooShort(() => parseMarketGroupV17OI(marketWithSlots(1)));
  });
  it("a market cut to the group header throws TOO_SHORT instead of reporting zero OI", () => {
    expectTooShort(() => parseMarketGroupV17OI(marketWithSlots(0)));
  });
});

describe("parsePortfolioV17 on a truncated portfolio (src/solana/slab.ts)", () => {
  const full = parsePortfolioV17(PORTFOLIO);
  const P = resolvePortfolioLayout(PORTFOLIO, { parser: "test" }).portfolio;
  it("sanity: the full portfolio has 1 active leg and residual loss 49635439", () => {
    expect(full.legs.filter((l) => l.active)).toHaveLength(1);
    expect(full.residualCrystallizedLossAtomsTotal).toBe(49635439n);
  });
  it("a 200-byte prefix throws TOO_SHORT instead of returning residual loss 0n", () => {
    expectTooShort(() => parsePortfolioV17(PORTFOLIO.slice(0, 200)));
  });
  it("a cut inside the active leg throws TOO_SHORT instead of returning the portfolio with no open position", () => {
    const i = full.legs.findIndex((l) => l.active);
    const cut = P.legsOff + i * P.legStride + P.legStride - 1;
    expectTooShort(() => parsePortfolioV17(PORTFOLIO.slice(0, cut)));
  });
  it("one byte short throws TOO_SHORT (the program never hands out a short portfolio)", () => {
    expectTooShort(() => parsePortfolioV17(PORTFOLIO.slice(0, PORTFOLIO.length - 1)));
  });
});
