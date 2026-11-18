// Usage: npx tsx scripts/bench-v22-funding-band-decode.ts [N=100000]
// Compares the current src decoders (one DataView per decode) against the legacy copies (one DataView per field read,
// test/helpers/legacy-v22-*.ts) on a fully populated market buffer. Also counts DataView constructions per decode.
import * as NewF from "../src/abi/v22-funding.js";
import * as NewB from "../src/abi/v22-band.js";
import * as OldF from "../test/helpers/legacy-v22-funding.js";
import * as OldB from "../test/helpers/legacy-v22-band.js";
import { LAYOUT_V22, resolveMarketGeometry } from "../src/abi/layout.js";
import { stampMarket } from "../test/helpers/stamp.js";

const N = Number(process.argv[2] ?? 100_000);
const SLOTS = 16;
const L = LAYOUT_V22;
const d = new Uint8Array(L.marketGroupOff + L.marketGroupLen + L.assetSlotStride * SLOTS);
let s = 12345;
for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = (s >>> 24) & 0x7f; }
stampMarket(d, 19);
const g = resolveMarketGeometry(d, { parser: "bench", strictLength: false });
if (g.slotCount !== SLOTS) throw new Error(`slotCount ${g.slotCount}`);
for (let i = 0; i < SLOTS; i++) d[g.slotOff(i) + g.layout.wrapperSlot.oracleProfile] = 2;

function all(F: typeof NewF, B: typeof NewB) {
  return () => {
    F.decodeMarketFundingV22(d);
    B.decodeBandConfigV22(d);
    for (let i = 0; i < 4; i++) { B.decodeAssetBandStateV22(d, i); B.decodeAssetRentStateV22(d, i); }
  };
}
const RealDV = DataView; let dvCount = 0;
(globalThis as any).DataView = class extends RealDV { constructor(...a: ConstructorParameters<typeof DataView>) { super(...a); dvCount++; } };
const run = (name: string, fn: () => void) => {
  for (let i = 0; i < 2000; i++) fn();
  dvCount = 0; fn(); const perDecode = dvCount;
  (globalThis as any).DataView = RealDV;
  global.gc?.();
  const h0 = process.memoryUsage().heapUsed; const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${name}: ${N} iters ${ms.toFixed(0)} ms, ${(N / (ms / 1000)).toFixed(0)} ops/s, DataView allocs/iter ${perDecode}, heap delta ${((process.memoryUsage().heapUsed - h0) / 1e6).toFixed(1)} MB`);
  (globalThis as any).DataView = class extends RealDV { constructor(...a: ConstructorParameters<typeof DataView>) { super(...a); dvCount++; } };
};
// funding-only and band-only are included in the combined iteration (1 funding (16 assets) + 1 config + 4 band + 4 rent per iter)
run("legacy", all(OldF as any, OldB as any));
run("new   ", all(NewF, NewB));
run("legacy", all(OldF as any, OldB as any));
run("new   ", all(NewF, NewB));
