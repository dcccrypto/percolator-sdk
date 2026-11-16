/**
 * matcher-v2 encode/decode bench: `pnpm exec tsx scripts/bench-matcher-v2.ts`
 * Fixed seed; 50k decodes + 50k encodes per run, 5 runs, prints median ops/sec.
 * Inputs are built from the module's own encoders so the same bytes feed every run.
 */
import {
  decodeMatcherCallExt, encodeMatcherBatchCall, encodeMatcherCallExt, encodeMatcherConfigureSetParams, encodeMatcherSetParams,
} from "../src/abi/matcher-v2.js";
import { genCallExt, genLegs, genOwnerProof, genSetParams, makeRng } from "../test/helpers/matcher-v2-gen.js";

const N = 50_000;
const r = makeRng(0xc0ffee);
const proof = genOwnerProof(r);
const sets = Array.from({ length: 256 }, () => genSetParams(r));
const exts = Array.from({ length: 256 }, () => genCallExt(r));
const batches = Array.from({ length: 256 }, () => genLegs(r));
const encodedExts = exts.map((e) => encodeMatcherCallExt(e));
const calls67 = encodedExts.map((e) => { const c = new Uint8Array(67); c.set(e, 43); return c; });

function median(a: number[]): number { return [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!; }
let sink = 0;
function run(label: string, fn: (i: number) => number): number {
  const rates: number[] = [];
  for (let k = 0; k < 5; k++) {
    const t = performance.now();
    for (let i = 0; i < N; i++) sink += fn(i);
    rates.push(N / ((performance.now() - t) / 1000));
  }
  const m = median(rates);
  console.log(`${label.padEnd(28)} ${Math.round(m).toLocaleString().padStart(12)} ops/s`);
  return m;
}
// warm up
for (let i = 0; i < 20_000; i++) sink += decodeMatcherCallExt(encodedExts[i & 255]!)?.execBandBps ?? 0;

const res = {
  decodeCallExt: run("decodeMatcherCallExt(24)", (i) => decodeMatcherCallExt(encodedExts[i & 255]!)?.execBandBps ?? 0),
  decodeCallExt67: run("decodeMatcherCallExt(67)", (i) => decodeMatcherCallExt(calls67[i & 255]!)?.execBandBps ?? 0),
  encodeCallExt: run("encodeMatcherCallExt", (i) => encodeMatcherCallExt(exts[i & 255]!)[1]!),
  encodeSetParams: run("encodeMatcherSetParams", (i) => encodeMatcherSetParams(sets[i & 255]!)[0]!),
  encodeConfigureSetParams: run("encodeConfigureSetParams", (i) => encodeMatcherConfigureSetParams(proof, sets[i & 255]!)[0]!),
  encodeBatch: run("encodeMatcherBatchCall", (i) => { const b = batches[i & 255]!; return encodeMatcherBatchCall(1n, 2n, b.legs, b.exts)[0]!; }),
};
console.log("sink", sink);
console.log(JSON.stringify(res));
