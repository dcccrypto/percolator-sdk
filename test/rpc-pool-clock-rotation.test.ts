import { describe, it, expect, vi, afterEach } from "vitest";
import { RpcPool } from "../src/solana/rpc-pool.js";

afterEach(() => {
  vi.useRealTimers();
});

const URL_A = "https://a.example.com";
const URL_B = "https://b.example.com";

// Drive every endpoint unhealthy without the pool's exhaustion reset kicking in:
// fail each endpoint directly via a callback that throws, using single-endpoint
// pools is not possible for two endpoints, so poke the state the same way call() does.
function markAllUnhealthy(pool: RpcPool) {
  const eps = (pool as unknown as { endpoints: Array<{ healthy: boolean; failures: number; unhealthySince?: number }> }).endpoints;
  for (const ep of eps) {
    ep.healthy = false;
    ep.failures = 3;
    ep.unhealthySince = Date.now();
  }
}

describe("RpcPool recovery vs backwards clock step", () => {
  it("restores an unhealthy endpoint after the wall clock steps backwards", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    const pool = new RpcPool({ endpoints: [URL_A, URL_B], retry: false, recoveryAfterMs: 1_000 });
    const eps = (pool as unknown as { endpoints: Array<{ healthy: boolean; unhealthySince?: number }> }).endpoints;
    eps[0].healthy = false;
    eps[0].unhealthySince = Date.now();
    // NTP step back by one hour
    vi.setSystemTime(new Date("2026-01-01T11:00:00Z"));
    // Re-stamped on first selection (treated as expired), restored after recoveryAfterMs on the new clock.
    pool.getConnection();
    vi.setSystemTime(new Date("2026-01-01T11:00:02Z"));
    pool.getConnection();
    expect(pool.status()[0].healthy).toBe(true);
  });
});

describe("RpcPool all-unhealthy rotation", () => {
  it("rotates across endpoints across requests instead of always hitting the first", async () => {
    const pool = new RpcPool({ endpoints: [URL_A, URL_B], retry: false, recoveryAfterMs: 0 });
    markAllUnhealthy(pool);
    const seen = new Set<string>();
    const select = (pool as unknown as { selectEndpoint: () => number }).selectEndpoint.bind(pool);
    for (let i = 0; i < 4; i++) seen.add(String(select()));
    expect(seen.size).toBe(2);
  });
});
