import { describe, it, expect, vi, afterEach } from "vitest";
import { RpcPool } from "../src/solana/rpc-pool.js";

afterEach(() => vi.useRealTimers());

function mk() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  const pool: any = new RpcPool({
    endpoints: ["http://a.invalid", "http://b.invalid"],
    recoveryAfterMs: 1000,
    verbose: false,
  });
  pool.endpoints[0].healthy = false;
  pool.endpoints[0].failures = 5;
  pool.endpoints[0].unhealthySince = Date.now();
  return pool;
}

describe("RpcPool recovery vs wall-clock step back", () => {
  it("unhealthy endpoint recovers after the window despite clock step back", () => {
    const pool = mk();
    vi.setSystemTime(new Date("2026-01-01T11:00:00Z"));
    vi.advanceTimersByTime(5000);
    pool.selectEndpoint();
    expect(pool.endpoints[0].healthy).toBe(true);
    expect(pool.endpoints[0].failures).toBe(0);
    expect(pool.endpoints[0].unhealthySince).toBeUndefined();
  });

  it("still holds the endpoint unhealthy inside the window (no clock change)", () => {
    const pool = mk();
    vi.advanceTimersByTime(500);
    pool.selectEndpoint();
    expect(pool.endpoints[0].healthy).toBe(false);
  });
});
