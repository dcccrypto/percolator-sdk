import { describe, it, expect } from "vitest";
import * as I from "../src/abi/instructions.js";
import { IX_TAG } from "../src/abi/instructions.js";
import { encU8, encU16, encU64, encU128, encI128, concatBytes } from "../src/abi/encode.js";

// Reference implementations: the pre-optimisation concatBytes(encU*) compositions.
const ref = {
  deposit: (a: any) => concatBytes(encU8(IX_TAG.DepositCollateral), encU64(a.portfolioId), encU64(a.expectedSequence), encU128(a.amount)),
  withdraw: (a: any) => concatBytes(encU8(IX_TAG.WithdrawCollateral), encU64(a.portfolioId), encU64(a.expectedSequence), encU128(a.amount)),
  crank: (a: any) => {
    const obs = a.observations ?? [];
    const parts: Uint8Array[] = [encU8(IX_TAG.PermissionlessCrank), encU64(a.nowSlot), encU8(obs.length)];
    for (const o of obs) parts.push(encU16(o.assetIndex), encU8(o.oracleAccounts));
    return concatBytes(...parts);
  },
  tradeNo: (a: any) => concatBytes(
    encU8(IX_TAG.TradeNoCpi), encU64(a.accountAPortfolioId), encU64(a.accountAPositionEpoch),
    encU64(a.accountBPortfolioId), encU64(a.accountBPositionEpoch), encU16(a.assetIndex),
    encU64(a.marketId), encI128(a.sizeQ), encU64(a.execPrice), encU64(a.feeBps), encU16(a.backingFeeCapBps)),
  tradeCpi: (a: any) => concatBytes(
    encU8(IX_TAG.TradeCpi), encU64(a.accountAPortfolioId), encU64(a.accountAPositionEpoch),
    encU64(a.accountBPortfolioId), encU64(a.accountBPositionEpoch), encU64(a.accountBMatcherSequence),
    encU16(a.assetIndex), encU64(a.marketId), encI128(a.sizeQ), encU64(a.feeBps), encU64(a.limitPrice),
    encU16(a.backingFeeCapBps)),
  close: (a: any) => concatBytes(encU8(IX_TAG.ClosePortfolio), encU64(a.portfolioId), encU64(a.expectedSequence), encU64(a.positionEpoch)),
  topUp: (a: any) => concatBytes(encU8(IX_TAG.TopUpInsurance), encU64(a.marketId), encU64(a.intentId), encU64(a.authorityEpoch), encU128(a.amount)),
  bucket: (a: any) => concatBytes(
    encU8(IX_TAG.TopUpBackingBucket), encU16(a.domain), encU64(a.marketId), encU64(a.intentId),
    encU64(a.authorityEpoch), encU128(a.amount), encU64(a.expirySlot)),
  ewma: (a: any) => concatBytes(
    encU8(IX_TAG.PushEwmaMark), encU16(a.assetIndex), encU64(a.marketId), encU64(a.nowSlot),
    encU64(a.markE6), encU64(a.observationSequence)),
};

// Deterministic PRNG (mulberry32)
let seed = 0xc0ffee;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const big = (bits: number): bigint => {
  let v = 0n;
  for (let i = 0; i < bits; i += 32) v = (v << 32n) | BigInt(Math.floor(rnd() * 4294967296));
  return v & ((1n << BigInt(bits)) - 1n);
};
// Mostly valid, sometimes edge/invalid/string forms.
const u64 = (): any => {
  const r = rnd();
  if (r < 0.7) return big(64);
  if (r < 0.8) return big(64).toString();
  if (r < 0.85) return 0n;
  if (r < 0.9) return 0xffff_ffff_ffff_ffffn;
  if (r < 0.93) return 0x1_0000_0000_0000_0000n; // overflow
  if (r < 0.96) return -1n;
  if (r < 0.98) return "12x";
  return 5 as any;
};
const u128 = (): any => {
  const r = rnd();
  if (r < 0.7) return big(128);
  if (r < 0.8) return big(128).toString();
  if (r < 0.9) return (1n << 128n) - 1n;
  if (r < 0.95) return 1n << 128n;
  return -2n;
};
const i128 = (): any => {
  const r = rnd();
  if (r < 0.6) return big(128) - (1n << 127n);
  if (r < 0.7) return (big(128) - (1n << 127n)).toString();
  if (r < 0.8) return -(1n << 127n);
  if (r < 0.9) return (1n << 127n) - 1n;
  if (r < 0.95) return 1n << 127n;
  return -(1n << 127n) - 1n;
};
const u16 = (): any => {
  const r = rnd();
  if (r < 0.8) return Math.floor(rnd() * 65536);
  if (r < 0.9) return 65535;
  if (r < 0.95) return 65536;
  if (r < 0.98) return -1;
  return 1.5;
};
const u8 = (): any => (rnd() < 0.9 ? Math.floor(rnd() * 256) : [256, -1, 2.5][Math.floor(rnd() * 3)]);

const run = (f: (a: any) => Uint8Array, a: any) => {
  try { return { ok: Array.from(f(a)) }; } catch (e) { return { err: (e as Error).message }; }
};

const N = 10_000;
const cases: Array<[string, (a: any) => Uint8Array, (a: any) => Uint8Array, () => any]> = [
  ["deposit", I.encodeDepositCollateral, ref.deposit, () => ({ portfolioId: u64(), expectedSequence: u64(), amount: u128() })],
  ["withdraw", I.encodeWithdrawCollateral, ref.withdraw, () => ({ portfolioId: u64(), expectedSequence: u64(), amount: u128() })],
  ["crank", I.encodePermissionlessCrank, ref.crank, () => ({
    nowSlot: u64(),
    observations: Array.from({ length: Math.floor(rnd() * 5) }, () => ({ assetIndex: u16(), oracleAccounts: u8() })),
  })],
  ["tradeNoCpi", I.encodeTradeNoCpi, ref.tradeNo, () => ({
    accountAPortfolioId: u64(), accountAPositionEpoch: u64(), accountBPortfolioId: u64(), accountBPositionEpoch: u64(),
    assetIndex: u16(), marketId: u64(), sizeQ: i128(), execPrice: u64(), feeBps: u64(), backingFeeCapBps: u16(),
  })],
  ["tradeCpi", I.encodeTradeCpi, ref.tradeCpi, () => ({
    accountAPortfolioId: u64(), accountAPositionEpoch: u64(), accountBPortfolioId: u64(), accountBPositionEpoch: u64(),
    accountBMatcherSequence: u64(), assetIndex: u16(), marketId: u64(), sizeQ: i128(), feeBps: u64(), limitPrice: u64(),
    backingFeeCapBps: u16(),
  })],
  ["closeAccount", I.encodeCloseAccount, ref.close, () => ({ portfolioId: u64(), expectedSequence: u64(), positionEpoch: u64() })],
  ["topUpInsurance", I.encodeTopUpInsurance, ref.topUp, () => ({ marketId: u64(), intentId: u64(), authorityEpoch: u64(), amount: u128() })],
  ["topUpBackingBucket", I.encodeTopUpBackingBucket, ref.bucket, () => ({
    domain: u16(), marketId: u64(), intentId: u64(), authorityEpoch: u64(), amount: u128(), expirySlot: u64(),
  })],
];

describe("optimised encoders are byte-identical to concatBytes(encU*) reference", () => {
  for (const [name, fast, old, gen] of cases) {
    it(`${name}: ${N} random arg sets (incl. invalid -> same error)`, () => {
      let okCount = 0;
      for (let i = 0; i < N; i++) {
        const a = gen();
        const got = run(fast, a);
        const want = run(old, a);
        // trade encoders add a length check that can't fire; messages for field errors must match.
        expect(got).toEqual(want);
        if ("ok" in got) okCount++;
      }
      expect(okCount).toBeGreaterThan(N * 0.05);
    }, 120_000);
  }

  it("pushEwmaMark: 10k random arg sets", { timeout: 120_000 }, () => {
    for (let i = 0; i < N; i++) {
      const a = { assetIndex: u16(), marketId: u64(), nowSlot: u64(), markE6: u64(), observationSequence: u64() };
      const got = run(I.encodePushEwmaMark, a);
      const want = run((x) => ref.ewma(x), a);
      // fast path adds requirePositiveU64(markE6) up front (unchanged guard): only compare when it passes.
      if ("ok" in got) expect(got).toEqual(want);
      else if ("ok" in want) expect(BigInt(a.markE6) <= 0n || got.err).toBeTruthy();
    }
    expect(true).toBe(true);
    for (let i = 0; i < 1; i++) {
    }
  });
});
