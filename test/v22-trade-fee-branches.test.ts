/**
 * Branch + pin tests for src/abi/v22-trade-fee.ts (J-20261118-SDK-BUG-TRADEFEEWORSTPLUS1).
 *
 * Audit of four leads against percolator-match (feat/p2-matcher-v2 src/v2.rs, src/vamm.rs) and the engine
 * (percolator src/v16.rs V16ConfigAccount): none is a bug. These tests pin why:
 *  - the `+ 1` in matcherFeeWorstCaseBpsV22 is the matcher's own rounding (price_with_total_bps rounds a buy price UP,
 *    requested_fee_bps rounds UP again), reproduced here bit for bit;
 *  - the offsets 70 (engine max_trading_fee_bps) and 56 (matcher ctx max_total_bps) land on the real bytes;
 *  - an omitted matcherExtMode errs toward a higher ceiling (never a Custom 9), and coversWorstCase is the signal.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  computeTradeFeeBpsToSignV22,
  matcherFeeWorstCaseBpsV22,
  readTradeFeeInputsV22,
  ENGINE_CONFIG_MAX_TRADING_FEE_BPS_OFF,
  MATCHER_CTX_MAX_TOTAL_BPS_OFF,
  MATCHER_MAX_TOTAL_BPS_CEILING,
  TRADE_FEE_MARGIN_BPS_DEFAULT,
} from "../src/abi/v22-trade-fee.js";
import { CTX_VAMM_OFFSET } from "../src/abi/instructions.js";
import { resolveMarketGeometry } from "../src/abi/layout.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-qa-devnet-2026-10-11.json", import.meta.url), "utf8")) as {
  accounts: { accounts: Record<string, { dataBase64: string }> };
};
const acct = (k: string): Uint8Array => new Uint8Array(Buffer.from(FX.accounts.accounts[k]!.dataBase64, "base64"));

const BASE = { tradeFeeBaseBps: 30n, maxTradingFeeBps: 700n, maxRequestedFeeBps: 1023 };

// Matcher arithmetic, ported from percolator-match v2.rs (price_with_total_bps / requested_fee_bps).
const divCeil = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;
const matcherRequestedFeeBps = (oracle: bigint, total: bigint, takerBuys: boolean): bigint => {
  const price = takerBuys ? divCeil(oracle * (10_000n + total), 10_000n) : (oracle * (10_000n - total)) / 10_000n;
  const d = price > oracle ? price - oracle : oracle - price;
  return divCeil(d * 10_000n, oracle);
};

describe("lead 1: the +1 over max_total_bps is the matcher's rounding, not an off-by-one", () => {
  it("a buy at total bps t requests up to t+1 (price rounds up, then the fee rounds up); never more", () => {
    let sawPlusOne = false;
    for (const oracle of [1_000_001n, 3_333_333n, 87_654_321n, 150_000_000n, 69_420_123_456n]) {
      for (const total of [1n, 7n, 60n, 100n, 333n, 4999n, 9000n]) {
        for (const buys of [true, false]) {
          const req = matcherRequestedFeeBps(oracle, total, buys);
          expect(req).toBeLessThanOrEqual(total + 1n);
          if (req === total + 1n) sawPlusOne = true;
          // the SDK's worst case (uncapped by maxRequested) always admits it
          const worst = matcherFeeWorstCaseBpsV22({ ...BASE, matcherMaxTotalBps: Number(total) });
          expect(BigInt(worst)).toBeGreaterThanOrEqual(req < 1023n ? req : 1023n);
        }
      }
    }
    expect(sawPlusOne).toBe(true); // +1 is reachable, so dropping it would risk Custom 9
  });

  it("worst case = min(maxRequested, total + 1, 1023)", () => {
    expect(matcherFeeWorstCaseBpsV22({ ...BASE, maxRequestedFeeBps: 100, matcherMaxTotalBps: 60 })).toBe(61);
    expect(matcherFeeWorstCaseBpsV22({ ...BASE, maxRequestedFeeBps: 50, matcherMaxTotalBps: 60 })).toBe(50);
    expect(matcherFeeWorstCaseBpsV22({ ...BASE, matcherMaxTotalBps: 0 })).toBe(1);
  });

  it("max_total above the matcher ceiling (9000) is clipped to it, then to the 1023 wire limit", () => {
    expect(MATCHER_MAX_TOTAL_BPS_CEILING).toBe(9000);
    expect(matcherFeeWorstCaseBpsV22({ ...BASE, matcherMaxTotalBps: 50_000 })).toBe(1023);
    expect(matcherFeeWorstCaseBpsV22({ ...BASE, maxRequestedFeeBps: 5000, matcherMaxTotalBps: 9000 })).toBe(1023);
  });

  it("no matcher context: falls back to min(maxRequested, 1023)", () => {
    expect(matcherFeeWorstCaseBpsV22({ ...BASE, maxRequestedFeeBps: 400 })).toBe(400);
    expect(matcherFeeWorstCaseBpsV22(BASE)).toBe(1023);
  });
});

describe("lead 2: matcherExtMode omitted is treated as ON (safe direction)", () => {
  it("omitted = 1 gives the same ceiling as an explicit 1; any other mode is off", () => {
    const on = matcherFeeWorstCaseBpsV22({ ...BASE, maxRequestedFeeBps: 100 });
    expect(on).toBe(100);
    expect(matcherFeeWorstCaseBpsV22({ ...BASE, maxRequestedFeeBps: 100, matcherExtMode: 1 })).toBe(on);
    expect(matcherFeeWorstCaseBpsV22({ ...BASE, maxRequestedFeeBps: 100, matcherExtMode: 0 })).toBe(0);
    expect(matcherFeeWorstCaseBpsV22({ ...BASE, maxRequestedFeeBps: 100, matcherExtMode: 2 })).toBe(0);
  });

  it("assuming ON when it is off only raises the signed ceiling (charged fee is base + actual request)", () => {
    const assumedOn = computeTradeFeeBpsToSignV22({ ...BASE, maxRequestedFeeBps: 100 });
    const off = computeTradeFeeBpsToSignV22({ ...BASE, maxRequestedFeeBps: 100, matcherExtMode: 0 });
    expect(assumedOn.feeBps).toBeGreaterThanOrEqual(off.feeBps);
    expect(off.feeBps).toBe(30n + BigInt(TRADE_FEE_MARGIN_BPS_DEFAULT));
  });
});

describe("lead 3: clamp to max is signalled by coversWorstCase", () => {
  it("want above max: feeBps = max, coversWorstCase false", () => {
    const r = computeTradeFeeBpsToSignV22({ tradeFeeBaseBps: 30n, maxTradingFeeBps: 100n, maxRequestedFeeBps: 100, matcherMaxTotalBps: 100 });
    expect(r.feeBps).toBe(100n);
    expect(r.worstCaseFeeBps).toBe(130n);
    expect(r.coversWorstCase).toBe(false);
  });

  it("want exactly at max: feeBps = max and still covers when worst case <= max", () => {
    const r = computeTradeFeeBpsToSignV22({ tradeFeeBaseBps: 30n, maxTradingFeeBps: 135n, maxRequestedFeeBps: 100, matcherMaxTotalBps: 100 });
    expect(r.feeBps).toBe(135n);
    expect(r.coversWorstCase).toBe(true);
  });

  it("zero margin at worst case is exactly covered", () => {
    const r = computeTradeFeeBpsToSignV22({ ...BASE, maxRequestedFeeBps: 20 }, { marginBps: 0 });
    expect(r.feeBps).toBe(50n);
    expect(r.coversWorstCase).toBe(true);
  });

  it("an expected fee above the worst case is clipped to it; a lower one can leave coversWorstCase false", () => {
    const hi = computeTradeFeeBpsToSignV22({ ...BASE, maxRequestedFeeBps: 20 }, { expectedMatcherFeeBps: 900, marginBps: 0 });
    expect(hi.feeBps).toBe(50n);
    const lo = computeTradeFeeBpsToSignV22({ ...BASE, maxRequestedFeeBps: 20 }, { expectedMatcherFeeBps: 5, marginBps: 0 });
    expect(lo.feeBps).toBe(35n);
    expect(lo.coversWorstCase).toBe(false);
  });
});

describe("lead 4: offsets land on the real bytes", () => {
  it("constants", () => {
    expect(ENGINE_CONFIG_MAX_TRADING_FEE_BPS_OFF).toBe(70); // 2+4+16+16+8*4 (V16ConfigAccount up to max_trading_fee_bps)
    expect(MATCHER_CTX_MAX_TOTAL_BPS_OFF).toBe(56);
  });

  it("writing max_trading_fee_bps at base+70 and max_total_bps at ctx+64+56 is what the reader returns", () => {
    const market = acct("jupMarket").slice();
    const g = resolveMarketGeometry(market, { parser: "test", strictLength: false });
    const off = g.groupOff + g.layout.group.config + 70;
    new DataView(market.buffer).setBigUint64(off, 1234n, true);
    const ctx = acct("jupMatcherCtx").slice();
    new DataView(ctx.buffer).setUint32(CTX_VAMM_OFFSET + 56, 4321, true);
    const r = readTradeFeeInputsV22(market, 0, ctx);
    expect(r.maxTradingFeeBps).toBe(1234n);
    expect(r.matcherMaxTotalBps).toBe(4321);
  });
});

describe("readTradeFeeInputsV22 / compute validation branches", () => {
  it("no matcher context: matcherMaxTotalBps absent", () => {
    expect(readTradeFeeInputsV22(acct("jupMarket"), 0).matcherMaxTotalBps).toBeUndefined();
  });

  it("matcher context too short, and bad magic", () => {
    const ctx = acct("jupMatcherCtx");
    expect(() => readTradeFeeInputsV22(acct("jupMarket"), 0, ctx.slice(0, CTX_VAMM_OFFSET + 59))).toThrow(/too short/);
    const bad = ctx.slice();
    bad[CTX_VAMM_OFFSET] ^= 0xff;
    expect(() => readTradeFeeInputsV22(acct("jupMarket"), 0, bad)).toThrow(/bad magic/);
  });

  it("market shorter than the engine config field", () => {
    const market = acct("jupMarket");
    const g = resolveMarketGeometry(market, { parser: "test", strictLength: false });
    const cut = g.groupOff + g.layout.group.config + 70 + 4;
    expect(() => readTradeFeeInputsV22(market.slice(0, cut), 0)).toThrow();
  });

  it("rejects negative / non-integer inputs", () => {
    expect(() => matcherFeeWorstCaseBpsV22({ ...BASE, maxRequestedFeeBps: -1 })).toThrow(/maxRequestedFeeBps/);
    expect(() => matcherFeeWorstCaseBpsV22({ ...BASE, matcherMaxTotalBps: 1.5 })).toThrow(/matcherMaxTotalBps/);
    expect(() => computeTradeFeeBpsToSignV22(BASE, { utilFeeBps: -1 })).toThrow(/utilFeeBps/);
    expect(() => computeTradeFeeBpsToSignV22(BASE, { marginBps: 0.5 })).toThrow(/marginBps/);
    expect(() => computeTradeFeeBpsToSignV22(BASE, { expectedMatcherFeeBps: -3 })).toThrow(/expectedMatcherFeeBps/);
    expect(() => computeTradeFeeBpsToSignV22({ ...BASE, tradeFeeBaseBps: -1n })).toThrow(/non-negative/);
    expect(() => computeTradeFeeBpsToSignV22({ ...BASE, maxTradingFeeBps: -1n })).toThrow(/non-negative/);
  });
});
