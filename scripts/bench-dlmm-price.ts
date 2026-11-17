/**
 * Meteora DLMM spot-price benchmark.
 *
 *   pnpm exec tsx scripts/bench-dlmm-price.ts
 *
 * 45 vectors (active_id x bin_step), decimals 9/6, 4000 rounds = 180,000 calls of
 * computeDexSpotPriceE6('meteora-dlmm', ...). The measurement is repeated 5 times
 * (after a warmup) and the median ops/s is printed, plus an FNV checksum over every
 * returned price so before/after outputs can be compared.
 */
import { computeDexSpotPriceE6 } from "../src/solana/dex-oracle.js";

const ACTIVE_IDS = [-5000, -800, -60, -1, 0, 1, 60, 800, 5000];
const BIN_STEPS = [1, 10, 25, 80, 100];
const ROUNDS = 4000;
const RUNS = 5;

const vectors: Uint8Array[] = [];
for (const id of ACTIVE_IDS) {
  for (const step of BIN_STEPS) {
    const d = new Uint8Array(216);
    const dv = new DataView(d.buffer);
    dv.setInt32(76, id, true);
    dv.setUint16(80, step, true);
    vectors.push(d);
  }
}
const dec = { base: 9, quote: 6 };

function once(): { ops: number; sum: bigint } {
  let sum = 0n;
  const t0 = process.hrtime.bigint();
  for (let r = 0; r < ROUNDS; r++) {
    for (const v of vectors) {
      // Extreme vectors legitimately fail closed (price < 1e-6); that path is part of the cost.
      let p: bigint;
      try {
        p = computeDexSpotPriceE6("meteora-dlmm", v, undefined, dec);
      } catch {
        p = -1n;
      }
      if (r === 0) sum = (sum * 1000003n + p) & 0xffffffffffffffffn;
    }
  }
  const sec = Number(process.hrtime.bigint() - t0) / 1e9;
  return { ops: (ROUNDS * vectors.length) / sec, sum };
}

once(); // warmup
const runs: number[] = [];
let checksum = 0n;
for (let i = 0; i < RUNS; i++) {
  const r = once();
  runs.push(r.ops);
  checksum = r.sum;
}
const sorted = [...runs].sort((a, b) => a - b);
console.log(`calls/run=${ROUNDS * vectors.length}`);
console.log(`runs ops/s: ${runs.map((x) => Math.round(x)).join(" / ")}`);
console.log(`median ops/s: ${Math.round(sorted[2])}`);
console.log(`checksum: ${checksum.toString(16)}`);
