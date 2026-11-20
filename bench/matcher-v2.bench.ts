// Run: npx tsx bench/matcher-v2.bench.ts   (3 runs per case, median ops/s reported)
import { Keypair } from "@solana/web3.js";
import {
  buildMatcherConfigureBackingFeeCapIx,
  buildMatcherConfigureSetParamsIx,
  decodeMatcherCallExt,
  encodeMatcherCallExt,
  encodeMatcherBatchCall,
  isMatcherCtxV2,
  defaultMatcherV2ConfigForKind2,
  type MatcherConfigureIxArgs,
} from "../src/abi/matcher-v2.js";

const k = () => Keypair.generate().publicKey;
const args: MatcherConfigureIxArgs = {
  matcherProgramId: k(), wrapperProgramId: k(), market: k(), lpPortfolio: k(), lpOwner: k(), matcherCtx: k(),
};
const ctx = new Uint8Array(4096);
new DataView(ctx.buffer).setBigUint64(64, 0x504552434d415443n, true);
ctx[242] = 1;
const ext = encodeMatcherCallExt({ headroomQ: 5n, markSlot: 9n, execBandBps: 300, takerReducing: true, acceptsFeeRequest: false });
const legs = [0, 1, 2, 3].map((i) => ({ assetIndex: i, oraclePriceE6: 1_000_000n + BigInt(i), reqSize: i % 2 ? -5n : 7n }));
const exts = legs.map(() => ext);
void defaultMatcherV2ConfigForKind2;

const cases: Record<string, () => void> = {
  "buildBackingFeeCapIx": () => { buildMatcherConfigureBackingFeeCapIx(args, 10_000); },
  "decodeMatcherCallExt": () => { decodeMatcherCallExt(ext); },
  "isMatcherCtxV2": () => { isMatcherCtxV2(ctx); },
  "encodeMatcherBatchCall": () => { encodeMatcherBatchCall(7n, 9n, legs, exts); },
};
void buildMatcherConfigureSetParamsIx;

for (const [name, fn] of Object.entries(cases)) {
  const runs: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 200; i++) fn();
    const t0 = performance.now();
    let n = 0;
    while (performance.now() - t0 < 500) { for (let i = 0; i < 50; i++) fn(); n += 50; }
    runs.push(n / ((performance.now() - t0) / 1000));
  }
  runs.sort((a, b) => a - b);
  console.log(`${name.padEnd(26)} median ${Math.round(runs[1]).toLocaleString()} ops/s`);
}
