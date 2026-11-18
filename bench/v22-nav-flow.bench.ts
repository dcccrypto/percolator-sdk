// Run: npx tsx bench/v22-nav-flow.bench.ts   (N=10k hasNavFlowTailV22 + withNavFlowTailV22 over 50 markets, median of 5)
import { Keypair } from "@solana/web3.js";
import { buildVaultLpAllocateIxP2b } from "../src/solana/p2b-earn.js";
import { hasNavFlowTailV22, withNavFlowTailV22 } from "../src/solana/v22-nav-flow.js";

const N = Number(process.env.BENCH_N ?? 10_000);
const programId = Keypair.generate().publicKey;
const keeper = Keypair.generate().publicKey;
const lp = Keypair.generate().publicKey;
const markets = Array.from({ length: 50 }, () => Keypair.generate().publicKey);
const ixs = markets.map((market) =>
  buildVaultLpAllocateIxP2b({ programId, market, registryDomain: 1, lpPortfolio: lp }, keeper, 1n));

function run(): number {
  const t = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    const j = i % 50;
    hasNavFlowTailV22(ixs[j]!, markets[j]!);
    withNavFlowTailV22(ixs[j]!, markets[j]!);
  }
  return N / (Number(process.hrtime.bigint() - t) / 1e9);
}
const runs = Array.from({ length: 5 }, run).sort((a, b) => a - b);
console.log(`has+with pairs/s (median of 5): ${Math.round(runs[2]!)}  [runs: ${runs.map((r) => Math.round(r)).join(", ")}]`);
