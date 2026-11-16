/**
 * Encoder micro-benchmark for the hottest src/abi/instructions.ts encoders.
 *
 * Run: pnpm vitest bench --run --config vitest.bench.config.ts
 * Or standalone table (100k calls each): pnpm tsx test/bench/instructions-encode.bench.ts
 */
import { bench, describe } from "vitest";
import {
  encodeTradeCpi,
  encodeTradeNoCpi,
  encodeDepositCollateral,
  encodeWithdrawCollateral,
  encodePermissionlessCrank,
  encodePushEwmaMark,
  encodeCloseAccount,
  encodeTopUpInsurance,
  encodeTopUpBackingBucket,
} from "../../src/abi/instructions.js";

export const CASES: Array<[string, () => Uint8Array]> = [
  ["encodeTradeCpi", () => encodeTradeCpi({
    accountAPortfolioId: 1n, accountAPositionEpoch: 2n, accountBPortfolioId: 3n,
    accountBPositionEpoch: 4n, accountBMatcherSequence: 5n, assetIndex: 1,
    marketId: 7n, sizeQ: -123456789n, feeBps: 10n, limitPrice: 50_000_000n, backingFeeCapBps: 30,
  })],
  ["encodeTradeNoCpi", () => encodeTradeNoCpi({
    accountAPortfolioId: 1n, accountAPositionEpoch: 2n, accountBPortfolioId: 3n,
    accountBPositionEpoch: 4n, assetIndex: 1, marketId: 7n, sizeQ: 123456789n,
    execPrice: 50_000_000n, feeBps: 10n, backingFeeCapBps: 30,
  })],
  ["encodeDepositCollateral", () => encodeDepositCollateral({ portfolioId: 1n, expectedSequence: 9n, amount: 1_000_000n })],
  ["encodeWithdrawCollateral", () => encodeWithdrawCollateral({ portfolioId: 1n, expectedSequence: 9n, amount: 500_000n })],
  ["encodePermissionlessCrank(4obs)", () => encodePermissionlessCrank({
    nowSlot: 300_000_000n,
    observations: [0, 1, 2, 3].map((i) => ({ assetIndex: i, oracleAccounts: 2 })),
  })],
  ["encodePushEwmaMark", () => encodePushEwmaMark({
    assetIndex: 1, marketId: 1n, nowSlot: 300_000_001n, markE6: 50_100_000_000n, observationSequence: 12n,
  })],
  ["encodeCloseAccount", () => encodeCloseAccount({ portfolioId: 1n, expectedSequence: 9n, positionEpoch: 3n })],
  ["encodeTopUpInsurance", () => encodeTopUpInsurance({ marketId: 1n, intentId: 2n, authorityEpoch: 3n, amount: 1_000n })],
  ["encodeTopUpBackingBucket", () => encodeTopUpBackingBucket({
    domain: 1, marketId: 1n, intentId: 2n, authorityEpoch: 3n, amount: 1_000n, expirySlot: 400_000_000n,
  })],
  ["encodePermissionlessCrank(0obs)", () => encodePermissionlessCrank({ nowSlot: 300_000_000n, observations: [] })],
];

// Standalone table mode: `pnpm tsx test/bench/instructions-encode.bench.ts`
const TABLE_MODE = process.argv[1]?.endsWith("instructions-encode.bench.ts");
if (TABLE_MODE) {
  const N = 100_000;
  console.log("encoder".padEnd(36), "ns/call");
  for (const [name, fn] of CASES) {
    for (let i = 0; i < 20_000; i++) fn();
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) fn();
    const ns = Number(process.hrtime.bigint() - t0) / N;
    console.log(name.padEnd(36), ns.toFixed(0));
  }
}

if (!TABLE_MODE) {
  describe("instructions encode", () => {
    for (const [name, fn] of CASES) {
      bench(name, () => { fn(); });
    }
  });
}
