// Usage: npx tsx bench/growth-v19.bench.ts   (median of 30 runs, 1,000 records each)
import { decodeAssetGrowthRecordV19 } from "../src/abi/growth-v19.js";

export function buildRecords(n = 1000): Uint8Array[] {
  const out: Uint8Array[] = [];
  let s = 0x9e3779b9;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s);
  for (let i = 0; i < n; i++) {
    const r = new Uint8Array(120);
    for (let j = 0; j < 120; j++) r[j] = rnd() >>> 24;
    r[38] = 1 + (i % 3); // version != 0
    r[39] = i & 3; // flags: legacy / r3 / r3+vol
    r[44] = (i % 4) | (i & 4) | ((i & 8) << 3) | ((i & 16) << 3);
    out.push(r);
  }
  return out;
}

if (process.argv[1]?.endsWith("growth-v19.bench.ts")) {
  const recs = buildRecords();
  let sink = 0;
  const run = () => {
    const t = process.hrtime.bigint();
    for (const r of recs) sink += decodeAssetGrowthRecordV19(r)!.version;
    return Number(process.hrtime.bigint() - t) / 1e6;
  };
  for (let i = 0; i < 10; i++) run();
  const xs = Array.from({ length: 30 }, run).sort((a, b) => a - b);
  console.log(`median ${xs[15]!.toFixed(3)} ms / 1000 records (min ${xs[0]!.toFixed(3)}, sink ${sink})`);
}
