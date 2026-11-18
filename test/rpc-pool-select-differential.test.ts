import { describe, it, expect } from "vitest";
import { RpcPool } from "../src/solana/rpc-pool.js";

/** Verbatim copy of the pre-optimisation selectEndpoint body (array-based). */
function oldSelect(pool: any, exclude?: Set<number>): number {
  if (pool.recoveryAfterMs > 0) {
    const now = Date.now();
    for (const ep of pool.endpoints) {
      if (!ep.healthy && ep.unhealthySince !== undefined && now - ep.unhealthySince >= pool.recoveryAfterMs) {
        ep.healthy = true;
        ep.failures = 0;
        ep.unhealthySince = undefined;
      }
    }
  }
  const healthy = pool.endpoints
    .map((ep: any, i: number) => ({ ep, i }))
    .filter(({ ep, i }: any) => ep.healthy && !exclude?.has(i));
  if (healthy.length === 0) {
    const remaining = pool.endpoints.map((_: any, i: number) => i).filter((i: number) => !exclude?.has(i));
    return remaining.length > 0 ? remaining[0] : -1;
  }
  if (pool.strategy === "failover") return healthy[0].i;
  const totalWeight = healthy.reduce((sum: number, { ep }: any) => sum + ep.weight, 0);
  pool.rrIndex = (pool.rrIndex + 1) % totalWeight;
  let cumulative = 0;
  for (const { ep, i } of healthy) {
    cumulative += ep.weight;
    if (pool.rrIndex < cumulative) return i;
  }
  return healthy[healthy.length - 1].i;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("RpcPool.selectEndpoint differential vs old array implementation", () => {
  it("chooses identical indices (and rrIndex) over 10k randomized states", { timeout: 60_000 }, () => {
    const r = rng(0xc0ffee);
    const now = Date.now();
    let picks = 0;
    const cache = new Map<string, any[]>();
    for (let c = 0; c < 10_000; c++) {
      const n = 1 + Math.floor(r() * 8);
      const strategy = r() < 0.5 ? "failover" : "round-robin";
      const recoveryAfterMs = r() < 0.3 ? 0 : 1000;
      const key = `${n}|${strategy}|${recoveryAfterMs}`;
      const mk = () =>
        new RpcPool({
          endpoints: Array.from({ length: n }, (_, i) => ({ url: `http://127.0.0.1:${9000 + i}` })),
          strategy,
          recoveryAfterMs,
          verbose: false,
        });
      // Connection construction is slow: reuse pools per shape, reset state below.
      let pr = cache.get(key);
      if (!pr) cache.set(key, (pr = [mk(), mk()]));
      const [a, b] = pr as any[];
      // random weights, health, unhealthy ages (some past the recovery window)
      for (let i = 0; i < n; i++) {
        const w = 1 + Math.floor(r() * 5);
        const healthy = r() < 0.6;
        const since = r() < 0.5 ? now - Math.floor(r() * 2000) : undefined;
        for (const p of [a, b]) {
          p.endpoints[i].weight = w;
          p.endpoints[i].healthy = healthy;
          p.endpoints[i].failures = healthy ? 0 : 3;
          p.endpoints[i].unhealthySince = healthy ? undefined : since;
        }
      }
      const rr0 = Math.floor(r() * 50);
      a.rrIndex = rr0;
      b.rrIndex = rr0;
      for (let k = 0; k < 6; k++) {
        let ex: Set<number> | undefined;
        const m = r();
        if (m < 0.4) ex = undefined;
        else {
          ex = new Set<number>();
          for (let i = -1; i <= n; i++) if (r() < 0.4) ex.add(i);
        }
        const got = (a as any).selectEndpoint(ex);
        const want = oldSelect(b, ex);
        expect(got).toBe(want);
        expect(a.rrIndex).toBe(b.rrIndex);
        picks++;
        // mutate health between calls to exercise state evolution
        if (r() < 0.3) {
          const i = Math.floor(r() * n);
          const h = r() < 0.5;
          for (const p of [a, b]) {
            p.endpoints[i].healthy = h;
            p.endpoints[i].unhealthySince = h ? undefined : Date.now();
          }
        }
      }
    }
    expect(picks).toBe(60_000);
  });
});
