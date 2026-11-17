/**
 * Bench for resolveMarketGeometry on a 43,974 B v2.2 market buffer.
 *   pnpm exec tsx scripts/bench-geometry.ts   # ns/op, median of 5 runs
 */
import { LAYOUT_V22, resolveMarketGeometry } from "../src/abi/layout.js";
import { stampMarket } from "../test/helpers/stamp.js";

const len = LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen + 16 * LAYOUT_V22.assetSlotStride;
const buf = new Uint8Array(len);
stampMarket(buf, LAYOUT_V22.version);
const N = 100_000;
const median = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
let sink = 0;
function run(): number {
  const t = process.hrtime.bigint();
  for (let n = 0; n < N; n++) sink += resolveMarketGeometry(buf, { parser: "bench", strictLength: false }).slotCount;
  return Number(process.hrtime.bigint() - t) / N;
}
run(); run();
const r: number[] = [];
for (let i = 0; i < 5; i++) r.push(run());
console.log(`bufLen=${len} resolveMarketGeometry ns/op median=${median([...r]).toFixed(1)} runs=${r.map((x) => x.toFixed(1))}`);
if (sink === -1) console.log(sink);
