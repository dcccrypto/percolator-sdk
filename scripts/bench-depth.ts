// Bench: plus2PctDepthE6 over 200k mixed-magnitude u64 inputs. Prints median of 5 runs.
// Run: npx tsx scripts/bench-depth.ts
import { plus2PctDepthE6 } from "../src/abi/v22-depth-source.js";

const N = 200_000;
let s = 123456789n;
const inputs: bigint[] = [];
for (let i = 0; i < N; i++) {
  s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
  inputs.push(s >> BigInt(i % 40));
}
const times: number[] = [];
let sink = 0n;
for (let run = 0; run < 5; run++) {
  const t0 = performance.now();
  for (const r of inputs) sink ^= plus2PctDepthE6(r);
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const med = times[2];
console.log(`median ${med.toFixed(1)} ms (${((med * 1000) / N).toFixed(2)} us/call) runs=${times.map((t) => t.toFixed(0)).join(",")} checksum=${sink}`);
