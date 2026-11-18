// Run: npx tsx bench/encode-ix.bench.ts   (median ms over 3 runs)
import { encU64 } from "../src/abi/encode.js";
import {
  encodeTradeNoCpi,
  encodeDepositCollateral,
  encodePermissionlessCrank,
  encodeWithdrawCollateral,
  encodeCloseAccount,
} from "../src/abi/instructions.js";

const N = 10_000;
function median(xs: number[]): number {
  return [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
}
function time(fn: () => void): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

const trade = {
  accountAPortfolioId: 11n, accountAPositionEpoch: 3n,
  accountBPortfolioId: 12n, accountBPositionEpoch: 4n,
  assetIndex: 2, marketId: 7n, sizeQ: -123_456_789n,
  execPrice: 65_000_000_000n, feeBps: 10n, backingFeeCapBps: 25,
};
const deposit = { portfolioId: 11n, expectedSequence: 99n, amount: 1_000_000_000n };
const withdraw = { portfolioId: 11n, expectedSequence: 99n, amount: 500_000n };
const crank = {
  nowSlot: 300_000_000n,
  observations: [
    { assetIndex: 0, oracleAccounts: 1 },
    { assetIndex: 1, oracleAccounts: 1 },
    { assetIndex: 2, oracleAccounts: 2 },
  ],
};
const close = { portfolioId: 11n, expectedSequence: 99n, positionEpoch: 3n };

function ixRun(): void {
  for (let i = 0; i < N; i++) {
    // "liquidate" (tag 7) is removed in v17 and throws; liquidations go via crank.
    encodeTradeNoCpi(trade as never);
    encodeDepositCollateral(deposit);
    encodePermissionlessCrank(crank as never);
    encodeWithdrawCollateral(withdraw);
    encodeCloseAccount(close as never);
  }
}
function u64Run(): void {
  for (let i = 0; i < 1_000_000; i++) encU64(BigInt(i) * 1_000_003n);
}

for (let w = 0; w < 2; w++) { ixRun(); u64Run(); } // warmup
const ix: number[] = [], u: number[] = [];
for (let r = 0; r < 3; r++) { ix.push(time(ixRun)); u.push(time(u64Run)); }
console.log(JSON.stringify({
  ix_5x10k_median_ms: +median(ix).toFixed(2), ix_runs: ix.map((x) => +x.toFixed(1)),
  encU64_1M_median_ms: +median(u).toFixed(2), u64_runs: u.map((x) => +x.toFixed(1)),
}));
