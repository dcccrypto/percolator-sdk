// Run: npx tsx bench/parse-error-logs.bench.ts   (100k calls over the corpus, median of 5; before = frozen copy)
import { parseErrorFromLogs as after } from "../src/abi/errors.js";
import { parseErrorFromLogs as before } from "../test/helpers/errors-before.js";
import { CORPUS } from "../test/helpers/errors-corpus.js";

const N = 100_000;
function time(fn: typeof after): number {
  const t = performance.now();
  let sink = 0;
  for (let i = 0; i < N; i++) if (fn(CORPUS[i % CORPUS.length])) sink++;
  if (sink < 0) throw new Error();
  return performance.now() - t;
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
time(before); time(after);
const b: number[] = [], a: number[] = [];
for (let r = 0; r < 5; r++) { b.push(time(before)); a.push(time(after)); }
const mb = med(b), ma = med(a);
console.log(`before ${mb.toFixed(1)}ms  after ${ma.toFixed(1)}ms  (100k calls, median of 5)  speedup ${(mb / ma).toFixed(2)}x  reduction ${((1 - ma / mb) * 100).toFixed(1)}%`);
