/**
 * parseChainlinkPrice throughput.
 * Run: npx tsx bench/oracle-decode.bench.ts   (prints median ns/op of 5 runs)
 */
import { parseChainlinkPrice } from "../src/solana/oracle.js";

const N = 400_000;
const bufs: Uint8Array[] = [];
for (let s = 0; s < 64; s++) {
  const b = new Uint8Array(256);
  const dv = new DataView(b.buffer);
  b[138] = 6 + (s % 4);
  dv.setBigUint64(216, 10_012_345_678n + BigInt(s), true);
  dv.setBigInt64(224, 0n, true);
  dv.setUint32(208, 1_700_000_000 + s, true);
  bufs.push(b);
}

let sink = 0n;
function run(): number {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) sink += parseChainlinkPrice(bufs[i & 63]).price;
  return Number(process.hrtime.bigint() - t0) / N;
}
run(); // warmup
const runs = Array.from({ length: 5 }, run).sort((a, b) => a - b);
console.log(`runs ns/op: ${runs.map((r) => r.toFixed(1)).join(", ")}`);
console.log(`median ns/op: ${runs[2].toFixed(1)} (N=${N}, sink=${sink})`);
