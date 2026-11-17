/**
 * Interleaved A/B (reference vs current) in one process so host load hits both equally.
 * Run: npx tsx bench/lev-guard-v22.ab.bench.ts
 * Reports median CPU ms per 20k ops for each side and the median per-round ratio (ref/new), 9 rounds.
 */
import * as oldM from "../test/fixtures/lev-guard-v22-reference.js";
import * as newM from "../src/abi/lev-guard-v22.js";
import { makeInputs } from "../test/fixtures/lev-guard-v22-inputs.js";

const N = 20_000;
const ROUNDS = 9;
const inp = makeInputs(N, 0xc0ffee);
let sink = 0;
const cpu = (fn: () => void): number => {
  const t0 = process.cpuUsage();
  fn();
  const d = process.cpuUsage(t0);
  return (d.user + d.system) / 1000;
};
const med = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

type M = typeof oldM;
const cases: [string, (m: M) => () => void][] = [
  ["decodeLevGuardV22", (m) => () => { for (const d of inp.accounts) sink ^= m.decodeLevGuardV22(d).touchedN; }],
  ["encodeLevGuardInitV22", (m) => () => { for (const t of inp.t0s) sink ^= m.encodeLevGuardInitV22(t)[9]; }],
  ["encodeLevGuardSetT0V22", (m) => () => { for (const t of inp.t0s) sink ^= m.encodeLevGuardSetT0V22(t > 0n ? t : 1n)[9]; }],
  ["encodeLevGuardSetRiskKeyV22", (m) => () => { for (const k of inp.keys) sink ^= m.encodeLevGuardSetRiskKeyV22(k)[33]; }],
  ["encodeLevGuardReportV22", (m) => () => { for (const r of inp.reports) sink ^= m.encodeLevGuardReportV22(r)[9]; }],
  ["encodeLevGuardTightenV22", (m) => () => { for (let i = 0; i < N; i++) sink ^= m.encodeLevGuardTightenV22()[1]; }],
  ["encodeLevGuardPokeV22", (m) => () => { for (let i = 0; i < N; i++) sink ^= m.encodeLevGuardPokeV22()[1]; }],
  ["encodeLevGuardLpStopV22", (m) => () => { for (let i = 0; i < N; i++) sink ^= m.encodeLevGuardLpStopV22()[1]; }],
  ["levKeyTagV22", (m) => () => { for (const k of inp.pubkeys) sink ^= Number(m.levKeyTagV22(k) & 0xffn); }],
];
for (const [name, mk] of cases) {
  const fo = mk(oldM), fn = mk(newM as unknown as M);
  fo(); fn(); fo(); fn();
  const o: number[] = [], n: number[] = [], ratio: number[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const a = i % 2 ? cpu(fn) : cpu(fo);
    const b = i % 2 ? cpu(fo) : cpu(fn);
    const [x, y] = i % 2 ? [b, a] : [a, b]; // x = old, y = new
    o.push(x); n.push(y); ratio.push(x / y);
  }
  console.log(`${name}: old ${med(o).toFixed(2)} ms, new ${med(n).toFixed(2)} ms, median ratio ${med(ratio).toFixed(2)}x`);
}
if (sink === 0x7fffffff) console.log("");
