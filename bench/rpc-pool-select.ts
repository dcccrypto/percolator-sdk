/**
 * Bench for RpcPool.selectEndpoint (private; reached via cast).
 * Run: node --expose-gc node_modules/.bin/tsx bench/rpc-pool-select.ts
 * Reports ns/call and young-gen GC count (scavenges) per scenario as an
 * allocation proxy.
 */
import { PerformanceObserver, constants } from "node:perf_hooks";
import { RpcPool } from "../src/solana/rpc-pool.js";

let gcs = 0;
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) {
    if ((e as any).detail?.kind === constants.NODE_PERFORMANCE_GC_MINOR || (e as any).kind === constants.NODE_PERFORMANCE_GC_MINOR) gcs++;
  }
}).observe({ entryTypes: ["gc"] });

const N = 1_000_000;

function mk(n: number, strategy: "failover" | "round-robin") {
  return new RpcPool({
    endpoints: Array.from({ length: n }, (_, i) => ({ url: `http://127.0.0.1:${9000 + i}`, weight: (i % 3) + 1 })),
    strategy,
    verbose: false,
  });
}

type Scn = { name: string; unhealthy: (n: number) => number[]; exclude?: (n: number) => Set<number> | undefined };
const scns: Scn[] = [
  { name: "all-healthy", unhealthy: () => [] },
  { name: "1-unhealthy", unhealthy: () => [0] },
  { name: "all-unhealthy", unhealthy: (n) => Array.from({ length: n }, (_, i) => i) },
  { name: "healthy+exclude", unhealthy: () => [], exclude: () => new Set([0]) },
];

console.log("endpoints strategy scenario ns/call minorGCs");
for (const n of [3, 8]) {
  for (const strategy of ["failover", "round-robin"] as const) {
    for (const s of scns) {
      const pool: any = mk(n, strategy);
      for (const i of s.unhealthy(n)) {
        pool.endpoints[i].healthy = false;
        pool.endpoints[i].unhealthySince = Date.now();
      }
      const ex = s.exclude?.(n);
      for (let i = 0; i < 50_000; i++) pool.selectEndpoint(ex); // warmup
      (globalThis as any).gc?.();
      await new Promise((r) => setTimeout(r, 20));
      const g0 = gcs;
      const t0 = process.hrtime.bigint();
      let sink = 0;
      for (let i = 0; i < N; i++) sink += pool.selectEndpoint(ex);
      const t1 = process.hrtime.bigint();
      await new Promise((r) => setTimeout(r, 20));
      console.log(`${n} ${strategy} ${s.name} ${(Number(t1 - t0) / N).toFixed(1)} ${gcs - g0} (sink ${sink})`);
    }
  }
}
