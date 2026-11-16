/**
 * Slab decode bench: node-run script (tsx test/bench/slab-decode.bench.ts [modulePath]).
 * Decodes one v2.2 market slab and one full v2.2 portfolio 10,000 times each; prints ops/s per run and the
 * median of 5 runs. `modulePath` (optional) selects the slab module to measure (default src/solana/slab.ts).
 */
import { marketFixture, portfolioFixture } from "./slab-fixtures.js";
import { cpus } from "node:os";

const mod = await import(process.argv[2] ?? "../../src/solana/slab.js");
const market = marketFixture();
const portfolio = portfolioFixture();
const N = 10_000;
const RUNS = 5;

const L = (await import("../../src/abi/layout.js")).LAYOUTS_BY_VERSION.get(19)!;
const slotsBase = L.marketGroupOff + L.marketGroupLen;
function decodeMarketFull(d: Uint8Array): number {
  const cfg = mod.parseWrapperConfigV17(d);
  const oi = mod.parseMarketGroupV17OI(d);
  let n = oi.assets.length + (cfg.tradeFeeBps ? 1 : 0);
  for (let i = 0; i < 8; i++) {
    const so = slotsBase + i * L.assetSlotStride;
    n += mod.parseAssetOracleProfileV17(d, so) ? 1 : 0;
    n += mod.parseAssetControlSequencesV17(d, so) ? 1 : 0;
  }
  return n;
}

const cases: [string, () => unknown][] = [
  ["market v2.2 (cfg+OI+8x profile/ctl)", () => decodeMarketFull(market)],
  ["portfolio v2.2 (full)", () => mod.parsePortfolioV17(portfolio)],
];

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`machine: ${cpus()[0].model} x${cpus().length}, node ${process.version}`);
let sink = 0;
for (let w = 0; w < 2000; w++) for (const [, f] of cases) sink += f() ? 1 : 0;
const out: Record<string, number> = {};
for (const [name, f] of cases) {
  const runs: number[] = [];
  for (let r = 0; r < RUNS; r++) {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) sink += f() ? 1 : 0;
    runs.push(N / ((performance.now() - t0) / 1000));
  }
  out[name] = median(runs);
  console.log(`${name}: runs ops/s=[${runs.map((x) => Math.round(x)).join(", ")}] median=${Math.round(out[name])}`);
}
if (sink < 0) console.log(sink);
console.log(JSON.stringify(out));
