/**
 * Slab decode bench: `npx tsx test/bench/slab-decode.bench.ts`.
 * Decodes one v2.2 market slab (config + OI + 8x oracle-profile/control-sequence) and one full v2.2 portfolio
 * 10,000 times each, for the FROZEN pre-change decoder (slab-reference.ts) and the current src/solana/slab.ts.
 * 5 rounds, reference and current alternating inside each round so machine load drift hits both equally.
 * ops/s uses process CPU time (user+system), not wall time, so a busy machine does not skew it.
 * Prints per-round ops/s, the median of 5, and the change.
 */
import { LAYOUTS_BY_VERSION } from "../../src/abi/layout.js";
import * as cur from "../../src/solana/slab.js";
import * as ref from "./slab-reference.js";
import { marketFixture, portfolioFixture } from "./slab-fixtures.js";
import { cpus } from "node:os";

type Mod = typeof cur;
const market = marketFixture();
const portfolio = portfolioFixture();
const L = LAYOUTS_BY_VERSION.get(19)!;
const slotsBase = L.marketGroupOff + L.marketGroupLen;
const N = 10_000;
const RUNS = 5;

function decodeMarket(mod: Mod): number {
  const cfg = mod.parseWrapperConfigV17(market);
  const oi = mod.parseMarketGroupV17OI(market);
  let n = oi.assets.length + (cfg.tradeFeeBps ? 1 : 0);
  for (let i = 0; i < 8; i++) {
    const so = slotsBase + i * L.assetSlotStride;
    n += mod.parseAssetOracleProfileV17(market, so) ? 1 : 0;
    n += mod.parseAssetControlSequencesV17(market, so) ? 1 : 0;
  }
  return n;
}
const decodePortfolio = (mod: Mod) => mod.parsePortfolioV17(portfolio);

const cases: [string, (m: Mod) => unknown][] = [
  ["market v2.2 (cfg+OI+8x profile/ctl)", decodeMarket],
  ["portfolio v2.2 (full)", decodePortfolio],
];
const cpuSec = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1e6; };
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
let sink = 0;
function run(f: (m: Mod) => unknown, m: Mod): number {
  const t0 = cpuSec();
  for (let i = 0; i < N; i++) sink += f(m) ? 1 : 0;
  return N / (cpuSec() - t0);
}

console.log(`machine: ${cpus()[0].model} x${cpus().length}, node ${process.version}`);
for (let w = 0; w < 3000; w++) for (const [, f] of cases) { sink += f(ref as Mod) ? 1 : 0; sink += f(cur) ? 1 : 0; }
for (const [name, f] of cases) {
  const a: number[] = [], b: number[] = [];
  for (let r = 0; r < RUNS; r++) { a.push(run(f, ref as Mod)); b.push(run(f, cur)); }
  const ma = median(a), mb = median(b);
  console.log(`${name}\n  before runs=[${a.map(Math.round)}] median=${Math.round(ma)} ops/s\n  after  runs=[${b.map(Math.round)}] median=${Math.round(mb)} ops/s\n  change ${((mb / ma - 1) * 100).toFixed(1)}%`);
}
if (sink < 0) console.log(sink);
