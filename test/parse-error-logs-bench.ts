// Run: npx tsx test/parse-error-logs-bench.ts
// Compares the frozen legacy parseErrorFromLogs with the current one on real-shaped log arrays.
import { parseErrorFromLogs as legacy } from "./fixtures/errors-legacy.js";
import { parseErrorFromLogs as current } from "../src/abi/errors.js";
import { PROGRAM_IDS_DEVNET_V22 } from "../src/config/program-ids.js";

const W = String(PROGRAM_IDS_DEVNET_V22.percolator);
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const noise = (n: number, off = 0) =>
  Array.from({ length: n }, (_, i) =>
    i % 3 === 0 ? `Program ${W} invoke [1]` : i % 3 === 1 ? `Program log: Instruction: Step${i + off}` : `Program ${W} consumed ${1000 + i} of 200000 compute units`,
  );
const mk = (n: number, tail: string[]) => [...noise(n - tail.length), ...tail];
const cases: Record<string, string[]> = {
  "20 lines, error at end": mk(20, [`Program ${W} failed: custom program error: 0x13`]),
  "60 lines, error at end": mk(60, [`Program ${W} failed: custom program error: 0x1b`]),
  "40 lines, no error": noise(40),
  "CPI token failed at end": mk(30, [`Program ${TOKEN} failed: custom program error: 0x1`, `Program ${W} failed: custom program error: 0x1`]),
};
const N = Number(process.env.ITERS ?? 20000);
function run(name: string, fn: (l: string[]) => unknown, logs: string[]) {
  for (let i = 0; i < 2000; i++) fn(logs);
  const best: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t = process.hrtime.bigint();
    for (let i = 0; i < N; i++) fn(logs);
    best.push(Number(process.hrtime.bigint() - t) / N);
  }
  return Math.min(...best);
}
function countRegExp(fn: (l: string[]) => unknown, logs: string[]) {
  const Orig = globalThis.RegExp;
  let n = 0;
  globalThis.RegExp = new Proxy(Orig, { construct(t, a) { n++; return Reflect.construct(t, a); } }) as RegExpConstructor;
  try { fn(logs); } finally { globalThis.RegExp = Orig; }
  return n;
}
console.log("case | legacy ns/call | current ns/call | speedup | RegExp constructions/call (legacy -> current)");
for (const [name, logs] of Object.entries(cases)) {
  const a = run("legacy", legacy, logs), b = run("current", current, logs);
  console.log(`${name} | ${a.toFixed(0)} | ${b.toFixed(0)} | ${(a / b).toFixed(2)}x | ${countRegExp(legacy, logs)} -> ${countRegExp(current, logs)}`);
}
