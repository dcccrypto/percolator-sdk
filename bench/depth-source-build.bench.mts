import { Keypair, PublicKey } from "@solana/web3.js";
const { buildPushAuthMarkDexIxV22, buildSetDepthSourceIxV22, buildClearDepthSourceIxV22 } = await import(process.env.SRC ?? "../src/abi/v22-depth-source.js");
const k = () => Keypair.generate().publicKey;
const programId = k(), auth = k();
const markets = Array.from({ length: 50 }, k), pool = k(), bv = k(), qv = k(), bm = k(), qm = k();
const N = Number(process.env.N ?? 10000);
function run() {
  const t = performance.now();
  for (let i = 0; i < N; i++) {
    const m = markets[i % 50];
    buildPushAuthMarkDexIxV22({ programId, oracleAuthority: auth, market: m, push: { assetIndex: 0, marketId: 1n, nowSlot: 1n, markE6: 1n, observationSequence: 1n } as any, pool, baseVault: bv, quoteVault: qv });
    buildSetDepthSourceIxV22({ programId, upgradeAuthority: auth, market: m, assetIndex: 0, marketId: 1n, pool, baseVault: bv, quoteVault: qv, baseMint: bm, quoteMint: qm } as any);
    buildClearDepthSourceIxV22(programId, auth, m, 0, 0n, pool);
  }
  return performance.now() - t;
}
const r = Array.from({ length: Number(process.env.RUNS ?? 5) }, run).sort((a, b) => a - b);
console.log("runs ms", r.map(x => x.toFixed(0)).join(","), "median", r[r.length >> 1].toFixed(0));
