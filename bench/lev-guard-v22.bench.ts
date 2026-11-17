/**
 * Plain-node bench: lev-guard-v22 encoders + decodeLevGuardV22 + levKeyTagV22.
 * Run: [LEV_MODULE=../test/fixtures/lev-guard-v22-reference.js] npx tsx bench/lev-guard-v22.bench.ts
 * 20k random valid inputs (+ boundaries) per function, median of 5 runs, process CPU time (ms per 20k ops).
 */
import { PublicKey } from "@solana/web3.js";
import { makeInputs } from "../test/fixtures/lev-guard-v22-inputs.js";

const mod = await import(process.env.LEV_MODULE ?? "../src/abi/lev-guard-v22.js");
const N = 20_000;
const RUNS = 5;
const inp = makeInputs(N, 0xc0ffee);
let sink = 0;

function cpuMs(fn: () => void): number {
  const t0 = process.cpuUsage();
  fn();
  const d = process.cpuUsage(t0);
  return (d.user + d.system) / 1000;
}
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const cases: [string, () => void][] = [
  ["decodeLevGuardV22", () => { for (const d of inp.accounts) sink ^= mod.decodeLevGuardV22(d).touchedN; }],
  ["encodeLevGuardInitV22", () => { for (const t of inp.t0s) sink ^= mod.encodeLevGuardInitV22(t)[9]; }],
  ["encodeLevGuardSetT0V22", () => { for (const t of inp.t0s) sink ^= mod.encodeLevGuardSetT0V22(t > 0n ? t : 1n)[9]; }],
  ["encodeLevGuardSetRiskKeyV22", () => { for (const k of inp.keys) sink ^= mod.encodeLevGuardSetRiskKeyV22(k)[33]; }],
  ["encodeLevGuardReportV22", () => { for (const r of inp.reports) sink ^= mod.encodeLevGuardReportV22(r)[9]; }],
  ["encodeLevGuardTightenV22", () => { for (let i = 0; i < N; i++) sink ^= mod.encodeLevGuardTightenV22()[1]; }],
  ["encodeLevGuardPokeV22", () => { for (let i = 0; i < N; i++) sink ^= mod.encodeLevGuardPokeV22()[1]; }],
  ["encodeLevGuardLpStopV22", () => { for (let i = 0; i < N; i++) sink ^= mod.encodeLevGuardLpStopV22()[1]; }],
  ["levKeyTagV22", () => { for (const k of inp.pubkeys) sink ^= Number(mod.levKeyTagV22(k) & 0xffn); }],
];
void PublicKey;
for (const [name, fn] of cases) {
  fn(); fn(); // warmup
  const runs = Array.from({ length: RUNS }, () => cpuMs(fn));
  console.log(`${name}: median ${median(runs).toFixed(2)} ms/${N} ops (runs: ${runs.map((r) => r.toFixed(1)).join(",")})`);
}
if (sink === 0x7fffffff) console.log("");
