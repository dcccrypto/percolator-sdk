import { decodeWrapperEventTokenV22, wrapperEventTokensV22 } from "../../src/abi/v22-fill-events.js";
import { CORPUS_WRAPPER, realisticLogs, rng } from "../support/v22-fill-events-corpus.js";

// 60k realistic tx log arrays; end to end = wrapperEventTokensV22 + decodeWrapperEventTokenV22 on every token. Median of 5 runs.
const r = rng(1);
const corpus = Array.from({ length: 60000 }, () => realisticLogs(r));
let sink = 0;
function run(): number {
  const t0 = process.hrtime.bigint();
  for (const logs of corpus) {
    const t = wrapperEventTokensV22(logs, CORPUS_WRAPPER);
    if (!t.ok) continue;
    for (const tok of t.tokens) if ("event" in decodeWrapperEventTokenV22(tok)) sink++;
  }
  return Number(process.hrtime.bigint() - t0) / 1e6;
}
run(); // warmup
const runs = Array.from({ length: 5 }, run).sort((a, b) => a - b);
const med = runs[2];
console.log(`logs=${corpus.length} events=${sink / 6} runs(ms)=${runs.map((x) => x.toFixed(0)).join(",")} median=${med.toFixed(0)}ms (${((med * 1000) / corpus.length).toFixed(2)} us/log)`);
