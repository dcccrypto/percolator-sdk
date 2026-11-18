// Run: npx tsx bench/v22-wire-pda.bench.ts
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  deriveBondTrancheV22,
  deriveBondPositionV22,
  deriveInsuranceUnitsV22,
  deriveG9FeedAllowlistV22,
} from "../src/abi/v22-wire.js";

const N = Number(process.env.BENCH_N ?? 10_000);
const programId = Keypair.generate().publicKey;
const markets = Array.from({ length: 50 }, () => Keypair.generate().publicKey);
const owners = Array.from({ length: 50 }, () => Keypair.generate().publicKey);

const cases: Record<string, (i: number) => unknown> = {
  tranche: (i) => deriveBondTrancheV22(programId, markets[i % 50]),
  position: (i) => deriveBondPositionV22(programId, markets[i % 50], owners[(i * 7) % 50]),
  insurance: (i) => deriveInsuranceUnitsV22(programId, markets[i % 50]),
  g9: () => deriveG9FeedAllowlistV22(programId),
};

function time(fn: (i: number) => unknown): number {
  const t = process.hrtime.bigint();
  for (let i = 0; i < N; i++) fn(i);
  return Number(process.hrtime.bigint() - t) / 1000 / N;
}

for (const [name, fn] of Object.entries(cases)) {
  // "cold" = first pass (fills any memo); "warm" = second pass over the same 50 inputs.
  const cold = time(fn);
  const warm = time(fn);
  console.log(`${name.padEnd(10)} cold ${cold.toFixed(2)} us/call   warm ${warm.toFixed(2)} us/call`);
}
void PublicKey;
