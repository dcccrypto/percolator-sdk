/**
 * Micro-bench for the hot string->bigint/number validators.
 * Run: node --import tsx/esm test/bench/validation.bench.ts [legacy]
 * 1000 decimal amounts x 100 rounds x 5 validators = 500k calls; prints the median of 9 runs.
 */
import {
  validateAmount,
  validateU128,
  validateI64,
  validateBps,
  validateIndex,
} from "../../src/validation.js";
import * as legacy from "../validation-legacy.js";

const useLegacy = process.argv.includes("legacy");
const v = useLegacy ? legacy : { validateAmount, validateU128, validateI64, validateBps, validateIndex };

const inputs: string[] = [];
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 1000; i++) {
  const digits = 1 + Math.floor(rnd() * 18);
  let s = String(1 + Math.floor(rnd() * 9));
  for (let d = 1; d < digits; d++) s += Math.floor(rnd() * 10);
  inputs.push(s);
}
const small = inputs.map((s) => String(Number(s.slice(0, 4)) % 10001));

function once(): number {
  let sink = 0n;
  const c0 = process.cpuUsage();
  for (let r = 0; r < 100; r++) {
    for (let i = 0; i < 1000; i++) {
      const s = inputs[i]!;
      sink += v.validateAmount(s, "amount");
      sink += v.validateU128(s, "amount");
      sink += v.validateI64(s, "amount");
      sink += BigInt(v.validateBps(small[i]!, "bps"));
      sink += BigInt(v.validateIndex(small[i]!, "idx"));
    }
  }
  const cu = process.cpuUsage(c0);
  const dt = (cu.user + cu.system) / 1000; // CPU ms (robust to host load)
  if (sink === -1n) console.log(sink);
  return dt;
}

once(); // warm-up
const runs = Array.from({ length: 9 }, once).sort((a, b) => a - b);
console.log(
  `${useLegacy ? "legacy" : "current"} cpu-median=${runs[4]!.toFixed(1)}ms runs=${runs.map((x) => x.toFixed(0)).join(",")}`
);
