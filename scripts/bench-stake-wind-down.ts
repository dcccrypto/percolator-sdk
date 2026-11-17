/**
 * Bench: decodeTerminalInsuranceCapacity (stake-wind-down.ts), the per-refresh decode the Earn page /
 * keeper loop calls on a market account. N=100k decodes, ops/s, median of 5 runs.
 *
 *   pnpm exec tsx scripts/bench-stake-wind-down.ts
 */
import { decodeTerminalInsuranceCapacity } from "../src/solana/stake-wind-down.js";
import { LAYOUT_V22 } from "../src/abi/layout.js";
import { stampMarket } from "../test/helpers/stamp.js";

let seed = 0x1234abcd;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };
const len = 1 << 20; // generous: covers header + asset slot 0 for any layout
const d = new Uint8Array(len);
for (let i = 0; i < len; i++) d[i] = rnd() & 0xff;
stampMarket(d, LAYOUT_V22.version);

const N = 100_000;
const runs: number[] = [];
let sink = 0n;
for (let r = 0; r < 6; r++) {
  const t0 = performance.now();
  for (let i = 0; i < N; i++) sink += decodeTerminalInsuranceCapacity(d, 0).terminalCapacity;
  const dt = performance.now() - t0;
  if (r > 0) runs.push(N / (dt / 1000)); // run 0 is warmup
}
runs.sort((a, b) => a - b);
console.log(`decodeTerminalInsuranceCapacity N=${N} median ${Math.round(runs[2]).toLocaleString()} ops/s (min ${Math.round(runs[0])}, max ${Math.round(runs[4])}) sink=${sink % 1000n}`);
