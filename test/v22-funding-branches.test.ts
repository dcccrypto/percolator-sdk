/**
 * Branch coverage for src/abi/v22-funding.ts: sign handling, clamps and every short-circuit of the pure math, compared
 * with a bigint model of the prog rc23 Rust (percolator-prog feat/v22-rc23-2026-10-22):
 *   - `premium_funding_rate_e9`  src/v16_program.rs:13129-13147
 *   - `skew_funding_rate_e9`     src/vault_lp_v18.rs:272-297
 *   - `combine_funding_rate_e9`  src/vault_lp_v18.rs:301-312
 * and the decoder over a real devnet market with patched bytes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  premiumFundingRateE9V22, skewFundingRateE9V22, combineFundingRateE9V22, impliedFundingRateE9V22,
  decodeMarketFundingV22, fundingRatePercentPerDayV22, ADL_ONE_V22, FUNDING_DEN_V22,
} from "../src/index.js";
import { resolveMarketGeometry } from "../src/abi/layout.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-q7-devnet-2026-10-12.json", import.meta.url), "utf8")) as { accounts: { market: string } };
const base = new Uint8Array(Buffer.from(FX.accounts.market, "base64"));

// Reference models: line-for-line ports of the Rust.
const refPremium = (mark: bigint, idx: bigint, max: bigint): bigint => {
  if (max === 0n || mark === 0n || idx === 0n || mark === idx) return 0n;
  const d = mark > idx ? mark - idx : idx - mark;
  const p = (d * 1_000_000_000n) / idx;
  const b = p < max ? p : max;
  return mark > idx ? b : -b;
};
const refSkew = (lp: bigint, oi: bigint, slope: bigint, max: bigint): bigint => {
  if (slope === 0n || max === 0n || lp === 0n || oi === 0n) return 0n;
  const abs = lp < 0n ? -lp : lp;
  const share = abs > oi ? oi : abs;
  const mag = (slope * share) / oi;
  const capped = mag > max ? max : mag;
  return lp < 0n ? capped : -capped;
};
const refCombine = (p: bigint, s: bigint, max: bigint): bigint => {
  const sum = p + s;
  return sum > max ? max : sum < -max ? -max : sum;
};

describe("v22-funding pure math vs prog rc23", () => {
  it("premiumFundingRateE9V22 edge table", () => {
    const U64 = (1n << 64n) - 1n;
    for (const mark of [0n, 1n, 90n, 100n, 110n, 1_000_000n, U64])
      for (const idx of [0n, 1n, 100n, 7n, U64])
        for (const max of [0n, 1n, 20_000_000n, 200_000_000n, U64])
          expect(premiumFundingRateE9V22(mark, idx, max), `${mark}/${idx}/${max}`).toBe(refPremium(mark, idx, max));
    expect(premiumFundingRateE9V22(90n, 100n, 200_000_000n)).toBe(-100_000_000n); // below index: negative
    expect(premiumFundingRateE9V22(110n, 100n, 20_000_000n)).toBe(20_000_000n); // capped
    expect(premiumFundingRateE9V22(90n, 100n, 20_000_000n)).toBe(-20_000_000n);
  });
  it("skewFundingRateE9V22 edge table, incl. the mag > max cap", () => {
    for (const lp of [0n, -1n, 1n, -500n, 500n, -5000n, 5000n, -(10n ** 30n), 10n ** 30n])
      for (const oi of [0n, 1n, 1000n, 10n ** 14n])
        for (const slope of [0n, 1n, 100n, 5000n, (1n << 64n) - 1n])
          for (const max of [0n, 1n, 40n, 1000n])
            expect(skewFundingRateE9V22(lp, oi, slope, max), `${lp}/${oi}/${slope}/${max}`).toBe(refSkew(lp, oi, slope, max));
    expect(skewFundingRateE9V22(-1000n, 1000n, 5000n, 40n)).toBe(40n); // short LP, capped
    expect(skewFundingRateE9V22(1000n, 1000n, 5000n, 40n)).toBe(-40n); // long LP, capped
  });
  it("combineFundingRateE9V22 clamps both sides and passes through", () => {
    for (const p of [-300n, -100n, 0n, 100n, 300n])
      for (const s of [-300n, -5n, 0n, 5n, 300n])
        for (const m of [0n, 50n, 111n, 1000n]) expect(combineFundingRateE9V22(p, s, m)).toBe(refCombine(p, s, m));
    expect(combineFundingRateE9V22(-100n, -50n, 111n)).toBe(-111n);
  });
  it("impliedFundingRateE9V22 guards and default aShort", () => {
    const a = ADL_ONE_V22;
    expect(impliedFundingRateE9V22(10n, 0n, 5n)).toBe(0n);
    expect(impliedFundingRateE9V22(10n, -1n, 5n)).toBe(0n);
    expect(impliedFundingRateE9V22(10n, 1n, 0n)).toBe(0n);
    expect(impliedFundingRateE9V22(10n, 1n, -5n)).toBe(0n);
    expect(impliedFundingRateE9V22(10n, 1n, 5n, 0n)).toBe(0n);
    expect(impliedFundingRateE9V22(10n, 1n, 5n, -1n)).toBe(0n);
    // round trip: rate 111, dt 10, price 2e6, a = ADL_ONE  =>  delta = rate*dt*price*a/DEN
    const delta = (111n * 10n * 2_000_000n * a) / FUNDING_DEN_V22;
    expect(impliedFundingRateE9V22(delta, 10n, 2_000_000n)).toBe(111n);
    expect(impliedFundingRateE9V22(delta, 10n, 2_000_000n, a)).toBe(111n);
    expect(impliedFundingRateE9V22(-delta, 10n, 2_000_000n)).toBe(-111n);
    expect(impliedFundingRateE9V22(delta + 1n, 10n, 2_000_000n)).toBe(111n); // rounds toward zero
    expect(impliedFundingRateE9V22(-delta - 1n, 10n, 2_000_000n)).toBe(-111n);
  });
  it("fundingRatePercentPerDayV22 sign", () => {
    expect(fundingRatePercentPerDayV22(0n)).toBe(0);
    expect(fundingRatePercentPerDayV22(-111n)).toBeCloseTo(-fundingRatePercentPerDayV22(111n), 12);
    expect(fundingRatePercentPerDayV22(111n)).toBeCloseTo(2.3976, 3);
  });
});

describe("decodeMarketFundingV22 branches", () => {
  const g = resolveMarketGeometry(base, { parser: "t", strictLength: false });
  const cfg = g.groupOff + g.layout.group.config;
  const patch = (f: (v: DataView, o: { cfg: number; es: number; wp: number; vl: number }, d: Uint8Array) => void): Uint8Array => {
    const d = base.slice();
    const v = new DataView(d.buffer);
    f(v, { cfg, es: g.engineOff(0), wp: g.slotOff(0) + g.layout.wrapperSlot.oracleProfile, vl: g.slotOff(0) + g.layout.wrapperSlot.vaultLp }, d);
    return d;
  };
  const setI128 = (v: DataView, o: number, x: bigint): void => {
    v.setBigUint64(o, x & ((1n << 64n) - 1n), true);
    v.setBigInt64(o + 8, x >> 64n, true);
  };
  const setU128 = (v: DataView, o: number, x: bigint): void => {
    v.setBigUint64(o, x & ((1n << 64n) - 1n), true);
    v.setBigUint64(o + 8, x >> 64n, true);
  };
  /** managed mode, max 1e8, bound vault LP; caller sets mark/index/lp/oi. */
  const setup = (mark: bigint, ewma: bigint, eff: bigint, lp: bigint, oiL: bigint, oiS: bigint, extra?: (v: DataView, o: { es: number; wp: number; vl: number }, d: Uint8Array) => void) =>
    decodeMarketFundingV22(patch((v, o, d) => {
      v.setBigUint64(o.cfg + 126, 100_000_000n, true);
      d[o.wp] = 2;
      v.setBigUint64(o.wp + 432, mark, true);
      v.setBigUint64(o.wp + 168, ewma, true);
      v.setBigUint64(o.es + 25, eff, true);
      setU128(v, o.es + 289, oiL);
      setU128(v, o.es + 305, oiS);
      d[o.vl + 90] = 1;
      v.setBigUint64(o.vl + 72, 50_000_000n, true);
      v.setBigUint64(o.vl + 80, 30_000_000n, true);
      setI128(v, o.vl + 32, lp);
      extra?.(v, o, d);
    })).assets[0]!;

  it("funding mark falls back to mark_ewma when funding_mark is 0", () => {
    const a = setup(0n, 110n, 100n, 0n, 1000n, 1000n);
    expect(a.fundingMarkE6).toBe(110n);
    expect(a.premiumRateE9PerSlot).toBe(refPremium(110n, 100n, 100_000_000n));
    const b = setup(120n, 110n, 100n, 0n, 1000n, 1000n);
    expect(b.fundingMarkE6).toBe(120n);
  });
  it("sign handling: longs pay / shorts pay / none, and the skew adds with its own sign", () => {
    const pos = setup(110n, 0n, 100n, 0n, 1000n, 1000n);
    expect(pos.rateE9PerSlot).toBe(100_000_000n);
    expect(pos.payer).toBe("longs");
    const neg = setup(90n, 0n, 100n, 0n, 1000n, 1000n);
    expect(neg.rateE9PerSlot).toBe(-100_000_000n);
    expect(neg.payer).toBe("shorts");
    const zero = setup(100n, 0n, 100n, 0n, 1000n, 1000n);
    expect(zero.rateE9PerSlot).toBe(0n);
    expect(zero.payer).toBe("none");
    // short vault LP, crowd long: skew positive; long LP: negative
    const sk = setup(100n, 0n, 100n, -500n, 1000n, 400n);
    expect(sk.skewRateE9PerSlot).toBe(refSkew(-500n, 1000n, 50_000_000n, 30_000_000n));
    expect(sk.skewRateE9PerSlot).toBe(25_000_000n);
    expect(sk.payer).toBe("longs");
    const skNeg = setup(100n, 0n, 100n, 500n, 400n, 1000n);
    expect(skNeg.skewRateE9PerSlot).toBe(-25_000_000n);
    expect(skNeg.payer).toBe("shorts");
    // oiS > oiL picks the larger side; skew capped by skewMax; combined clamped to maxAbs
    const capped = setup(110n, 0n, 100n, -10_000n, 1000n, 1000n);
    expect(capped.skewRateE9PerSlot).toBe(30_000_000n);
    expect(capped.rateE9PerSlot).toBe(100_000_000n);
  });
  it("skew is 0 when the vault LP is unbound, slope is 0, or maxAbs is 0", () => {
    const unbound = setup(100n, 0n, 100n, -500n, 1000n, 1000n, (v, o, d) => { d[o.vl + 90] = 0; });
    expect(unbound.vaultLpBound).toBe(false);
    expect(unbound.skewRateE9PerSlot).toBe(0n);
    const noSlope = setup(100n, 0n, 100n, -500n, 1000n, 1000n, (v, o) => v.setBigUint64(o.vl + 72, 0n, true));
    expect(noSlope.skewRateE9PerSlot).toBe(0n);
    const noMax = setup(110n, 0n, 100n, -500n, 1000n, 1000n, (v) => v.setBigUint64(cfg + 126, 0n, true));
    expect(noMax.skewRateE9PerSlot).toBe(0n);
    expect(noMax.premiumRateE9PerSlot).toBe(0n);
    expect(noMax.rateE9PerSlot).toBe(0n);
    expect(noMax.payer).toBe("none");
  });
  it("unmanaged oracle modes (0 and >3) compute no premium, skew or rate", () => {
    for (const mode of [0, 4, 255]) {
      const a = setup(110n, 0n, 100n, -500n, 1000n, 1000n, (_v, o, d) => { d[o.wp] = mode; });
      expect(a.oracleMode).toBe(mode);
      expect([a.premiumRateE9PerSlot, a.skewRateE9PerSlot, a.rateE9PerSlot]).toEqual([0n, 0n, 0n]);
      expect(a.payer).toBe("none");
    }
    for (const mode of [1, 2, 3]) expect(setup(110n, 0n, 100n, 0n, 1000n, 1000n, (_v, o, d) => { d[o.wp] = mode; }).payer).toBe("longs");
  });
  it("fundingActive needs both sides' OI; pendingMark needs a nonzero pending mark past slot_last", () => {
    expect(setup(100n, 0n, 100n, 0n, 0n, 5n).fundingActive).toBe(false);
    expect(setup(100n, 0n, 100n, 0n, 5n, 0n).fundingActive).toBe(false);
    expect(setup(100n, 0n, 100n, 0n, 5n, 5n).fundingActive).toBe(true);
    const pend = (e6: bigint, slot: bigint, last: bigint) =>
      setup(100n, 0n, 100n, 0n, 5n, 5n, (v, o) => {
        v.setBigUint64(o.wp + 440, e6, true);
        v.setBigUint64(o.wp + 448, slot, true);
        v.setBigUint64(o.es + 41, last, true);
      }).pendingMark;
    expect(pend(0n, 20n, 10n)).toBe(false);
    expect(pend(7n, 10n, 10n)).toBe(false);
    expect(pend(7n, 9n, 10n)).toBe(false);
    expect(pend(7n, 11n, 10n)).toBe(true);
  });
  it("negative i128 indices and lp_net_q decode with sign", () => {
    const a = setup(100n, 0n, 100n, -(10n ** 20n), 5n, 5n, (v, o) => {
      setI128(v, o.es + 113, -123_456_789_012_345_678_901n);
      setI128(v, o.es + 129, 123_456_789_012_345_678_901n);
    });
    expect(a.lpNetQ).toBe(-(10n ** 20n));
    expect(a.fLongNum).toBe(-123_456_789_012_345_678_901n);
    expect(a.fShortNum).toBe(123_456_789_012_345_678_901n);
  });
  it("short and wrong-version buffers throw", () => {
    expect(() => decodeMarketFundingV22(base.slice(0, 100))).toThrow();
    const v18 = base.slice();
    new DataView(v18.buffer).setUint16(8, 18, true);
    expect(() => decodeMarketFundingV22(v18)).toThrow();
  });
});
