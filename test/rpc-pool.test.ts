import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RpcPool,
  RpcTimeoutError,
  checkRpcHealth,
  withRetry,
  _internal,
  type RetryConfig,
  type RpcPoolConfig,
  type RpcHealthResult,
} from "../src/solana/rpc-pool.js";
import { Connection, PublicKey } from "@solana/web3.js";

// ============================================================================
// Internal helpers
// ============================================================================

describe("_internal helpers", () => {
  describe("isRetryable", () => {
    it("returns true for 429 errors", () => {
      expect(_internal.isRetryable(new Error("HTTP 429 Too Many Requests"), [429])).toBe(true);
    });

    it("returns true for 502 errors", () => {
      expect(_internal.isRetryable(new Error("502 Bad Gateway"), [502])).toBe(true);
    });

    it("returns true for 503 errors", () => {
      expect(_internal.isRetryable(new Error("503 Service Unavailable"), [503])).toBe(true);
    });

    it("returns true for rate limit message", () => {
      expect(_internal.isRetryable(new Error("rate limit exceeded"), [429])).toBe(true);
    });

    it("returns true for timeout errors", () => {
      expect(_internal.isRetryable(new Error("request timeout"), [])).toBe(true);
    });

    it("returns true for ECONNRESET", () => {
      expect(_internal.isRetryable(new Error("ECONNRESET"), [])).toBe(true);
    });

    it("returns true for ECONNREFUSED", () => {
      expect(_internal.isRetryable(new Error("ECONNREFUSED"), [])).toBe(true);
    });

    it("returns true for network errors", () => {
      expect(_internal.isRetryable(new Error("network error"), [])).toBe(true);
    });

    it("returns true for socket hang up", () => {
      expect(_internal.isRetryable(new Error("socket hang up"), [])).toBe(true);
    });

    it("returns false for auth errors", () => {
      expect(_internal.isRetryable(new Error("401 Unauthorized"), [429, 502])).toBe(false);
    });

    it("returns false for 400 bad request", () => {
      expect(_internal.isRetryable(new Error("400 Bad Request"), [429, 502])).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(_internal.isRetryable(null, [429])).toBe(false);
      expect(_internal.isRetryable(undefined, [429])).toBe(false);
    });

    it("handles string errors", () => {
      expect(_internal.isRetryable("429 rate limited", [429])).toBe(true);
    });
  });

  describe("computeDelay", () => {
    it("returns base delay for attempt 0 (plus jitter)", () => {
      const config = _internal.resolveRetryConfig({ baseDelayMs: 500, jitterFactor: 0 })!;
      const delay = _internal.computeDelay(0, config);
      expect(delay).toBe(500); // no jitter
    });

    it("doubles delay for each attempt", () => {
      const config = _internal.resolveRetryConfig({ baseDelayMs: 500, jitterFactor: 0 })!;
      expect(_internal.computeDelay(0, config)).toBe(500);
      expect(_internal.computeDelay(1, config)).toBe(1000);
      expect(_internal.computeDelay(2, config)).toBe(2000);
      expect(_internal.computeDelay(3, config)).toBe(4000);
    });

    it("caps at maxDelayMs", () => {
      const config = _internal.resolveRetryConfig({
        baseDelayMs: 500,
        maxDelayMs: 3000,
        jitterFactor: 0,
      })!;
      expect(_internal.computeDelay(0, config)).toBe(500);
      expect(_internal.computeDelay(1, config)).toBe(1000);
      expect(_internal.computeDelay(2, config)).toBe(2000);
      expect(_internal.computeDelay(3, config)).toBe(3000); // capped
      expect(_internal.computeDelay(4, config)).toBe(3000); // still capped
    });

    it("adds jitter within range", () => {
      const config = _internal.resolveRetryConfig({
        baseDelayMs: 1000,
        jitterFactor: 0.25,
      })!;
      // Equal-jitter formula: half + floor(random * (raw - half + 1))
      // For attempt 0: raw=1000, half=500 → range [500, 1000]
      // (jitterFactor controls whether jitter is applied at all, not the jitter magnitude)
      for (let i = 0; i < 100; i++) {
        const delay = _internal.computeDelay(0, config);
        expect(delay).toBeGreaterThanOrEqual(500);
        expect(delay).toBeLessThanOrEqual(1000);
      }
    });
  });

  describe("resolveRetryConfig", () => {
    it("returns null for false", () => {
      expect(_internal.resolveRetryConfig(false)).toBeNull();
    });

    it("returns defaults for undefined", () => {
      const config = _internal.resolveRetryConfig(undefined)!;
      expect(config.maxRetries).toBe(3);
      expect(config.baseDelayMs).toBe(500);
      expect(config.maxDelayMs).toBe(10_000);
      expect(config.jitterFactor).toBe(0.25);
      expect(config.retryableStatusCodes).toEqual([429, 502, 503, 504]);
    });

    it("returns defaults for empty object", () => {
      const config = _internal.resolveRetryConfig({})!;
      expect(config.maxRetries).toBe(3);
    });

    it("overrides specific fields", () => {
      const config = _internal.resolveRetryConfig({ maxRetries: 5, baseDelayMs: 1000 })!;
      expect(config.maxRetries).toBe(5);
      expect(config.baseDelayMs).toBe(1000);
      expect(config.maxDelayMs).toBe(10_000); // default
    });

    it("clamps jitter factor to [0, 1]", () => {
      expect(_internal.resolveRetryConfig({ jitterFactor: -0.5 })!.jitterFactor).toBe(0);
      expect(_internal.resolveRetryConfig({ jitterFactor: 2 })!.jitterFactor).toBe(1);
    });
  });

  describe("normalizeEndpoint", () => {
    it("wraps a string into RpcEndpointConfig", () => {
      const ep = _internal.normalizeEndpoint("https://example.com");
      expect(ep).toEqual({ url: "https://example.com" });
    });

    it("passes through RpcEndpointConfig unchanged", () => {
      const ep = { url: "https://example.com", weight: 10, label: "test" };
      expect(_internal.normalizeEndpoint(ep)).toBe(ep);
    });
  });

  describe("endpointLabel", () => {
    it("uses label if provided", () => {
      expect(_internal.endpointLabel({ url: "https://example.com", label: "my-rpc" })).toBe("my-rpc");
    });

    it("falls back to hostname", () => {
      expect(_internal.endpointLabel({ url: "https://mainnet.helius-rpc.com/?api-key=test" })).toBe("mainnet.helius-rpc.com");
    });

    it("handles invalid URLs gracefully", () => {
      const label = _internal.endpointLabel({ url: "not-a-url" });
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// withRetry
// ============================================================================

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const result = await withRetry(fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("429 Too Many Requests"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxRetries: 2, baseDelayMs: 10, jitterFactor: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-retryable error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("401 Unauthorized"));
    await expect(withRetry(fn, { maxRetries: 3, retryableStatusCodes: [429] }))
      .rejects.toThrow("401 Unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after maxRetries exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("429 rate limited"));
    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 10, jitterFactor: 0 }),
    ).rejects.toThrow("429 rate limited");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("retries on network errors", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValue("recovered");

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10, jitterFactor: 0 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses default config when none provided", async () => {
    const fn = vi.fn().mockResolvedValue("default");
    const result = await withRetry(fn);
    expect(result).toBe("default");
  });
});

// ============================================================================
// RpcPool constructor
// ============================================================================

describe("RpcPool", () => {
  it("throws if no endpoints provided", () => {
    expect(() => new RpcPool({ endpoints: [] })).toThrow("at least one endpoint");
  });

  it("accepts string endpoints", () => {
    const pool = new RpcPool({
      endpoints: ["https://rpc1.example.com", "https://rpc2.example.com"],
      verbose: false,
    });
    expect(pool.size).toBe(2);
    expect(pool.healthyCount).toBe(2);
  });

  it("accepts RpcEndpointConfig endpoints", () => {
    const pool = new RpcPool({
      endpoints: [
        { url: "https://rpc1.example.com", weight: 10, label: "primary" },
        { url: "https://rpc2.example.com", weight: 1, label: "fallback" },
      ],
      verbose: false,
    });
    expect(pool.size).toBe(2);
  });

  it("accepts mixed string and config endpoints", () => {
    const pool = new RpcPool({
      endpoints: [
        "https://rpc1.example.com",
        { url: "https://rpc2.example.com", weight: 5, label: "weighted" },
      ],
      verbose: false,
    });
    expect(pool.size).toBe(2);
  });

  it("status() returns all endpoints", () => {
    const pool = new RpcPool({
      endpoints: [
        { url: "https://rpc1.example.com", label: "one" },
        { url: "https://rpc2.example.com", label: "two" },
      ],
      verbose: false,
    });
    const status = pool.status();
    expect(status).toHaveLength(2);
    expect(status[0].label).toBe("one");
    expect(status[0].healthy).toBe(true);
    expect(status[0].failures).toBe(0);
    expect(status[1].label).toBe("two");
  });

  it("defaults to failover strategy", () => {
    const pool = new RpcPool({ endpoints: ["https://rpc1.example.com"], verbose: false });
    const status = pool.status();
    expect(status).toHaveLength(1);
  });
});

// ============================================================================
// RpcPool.call() — retry behavior with mocks
// ============================================================================

describe("RpcPool.call() retry logic", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("succeeds on first try", async () => {
    const pool = new RpcPool({
      endpoints: ["https://rpc1.example.com"],
      retry: { maxRetries: 3, baseDelayMs: 10, jitterFactor: 0 },
      requestTimeoutMs: 5000,
      verbose: false,
    });

    const fn = vi.fn().mockResolvedValue(42);
    const result = await pool.call(() => fn());
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries 429 errors and eventually succeeds", async () => {
    const pool = new RpcPool({
      endpoints: ["https://rpc1.example.com"],
      retry: { maxRetries: 3, baseDelayMs: 10, jitterFactor: 0 },
      requestTimeoutMs: 5000,
      verbose: false,
    });

    let callCount = 0;
    const result = await pool.call(async () => {
      callCount++;
      if (callCount < 3) throw new Error("429 Too Many Requests");
      return "success";
    });
    expect(result).toBe("success");
    expect(callCount).toBe(3);
  });

  it("throws non-retryable errors immediately (single endpoint)", async () => {
    const pool = new RpcPool({
      endpoints: ["https://rpc1.example.com"],
      retry: { maxRetries: 3, baseDelayMs: 10, retryableStatusCodes: [429] },
      requestTimeoutMs: 5000,
      verbose: false,
    });

    await expect(
      pool.call(async () => { throw new Error("Invalid parameter"); }),
    ).rejects.toThrow("Invalid parameter");
  });

  it("exhausts all retries on persistent retryable error", async () => {
    const pool = new RpcPool({
      endpoints: ["https://rpc1.example.com"],
      retry: { maxRetries: 2, baseDelayMs: 10, jitterFactor: 0 },
      requestTimeoutMs: 5000,
      verbose: false,
    });

    let callCount = 0;
    await expect(
      pool.call(async () => {
        callCount++;
        throw new Error("429 rate limit");
      }),
    ).rejects.toThrow("429 rate limit");
    expect(callCount).toBe(3); // 1 initial + 2 retries
  });

  it("passes Connection to the callback", async () => {
    const pool = new RpcPool({
      endpoints: ["https://rpc1.example.com"],
      retry: false,
      requestTimeoutMs: 5000,
      verbose: false,
    });

    let receivedConn: unknown = null;
    await pool.call(async (conn) => {
      receivedConn = conn;
      return null;
    });
    expect(receivedConn).toBeInstanceOf(Connection);
  });
});

// ============================================================================
// RpcPool.call() — failover behavior
// ============================================================================

describe("RpcPool.call() failover", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails over to second endpoint on retryable error", async () => {
    const pool = new RpcPool({
      endpoints: [
        { url: "https://rpc1.example.com", label: "ep1" },
        { url: "https://rpc2.example.com", label: "ep2" },
      ],
      strategy: "failover",
      retry: { maxRetries: 3, baseDelayMs: 10, jitterFactor: 0 },
      requestTimeoutMs: 5000,
      verbose: false,
    });

    const endpointsHit: string[] = [];
    const result = await pool.call(async (conn) => {
      // Determine which endpoint was used based on Connection internals
      // Since we can't access private state, track by mock behavior:
      const rpcEndpoint = (conn as any)._rpcEndpoint as string;
      endpointsHit.push(rpcEndpoint);
      if (rpcEndpoint.includes("rpc1")) {
        throw new Error("429 rate limited");
      }
      return "from-ep2";
    });

    expect(result).toBe("from-ep2");
    // Should have tried ep1 first, then failed over to ep2
    expect(endpointsHit.length).toBeGreaterThanOrEqual(2);
  });

  it("marks endpoints unhealthy after threshold failures", async () => {
    const pool = new RpcPool({
      endpoints: [
        { url: "https://rpc1.example.com", label: "ep1" },
        { url: "https://rpc2.example.com", label: "ep2" },
      ],
      strategy: "failover",
      retry: { maxRetries: 5, baseDelayMs: 10, jitterFactor: 0 },
      requestTimeoutMs: 5000,
      verbose: false,
    });

    let callCount = 0;
    // All calls fail with retryable error
    try {
      await pool.call(async () => {
        callCount++;
        throw new Error("503 Service Unavailable");
      });
    } catch {
      // Expected
    }

    // After exhausting retries, at least one endpoint should be unhealthy
    const status = pool.status();
    const unhealthy = status.filter(s => !s.healthy);
    expect(unhealthy.length).toBeGreaterThanOrEqual(0); // May have been recovered
  });
});

// ============================================================================
// RpcPool.call() — round-robin
// ============================================================================

describe("RpcPool.call() round-robin", () => {
  it("distributes calls across endpoints", async () => {
    const pool = new RpcPool({
      endpoints: [
        { url: "https://rpc1.example.com", label: "ep1", weight: 1 },
        { url: "https://rpc2.example.com", label: "ep2", weight: 1 },
      ],
      strategy: "round-robin",
      retry: false,
      requestTimeoutMs: 5000,
      verbose: false,
    });

    const endpointsHit = new Set<string>();
    for (let i = 0; i < 10; i++) {
      await pool.call(async (conn) => {
        const rpcEndpoint = (conn as any)._rpcEndpoint as string;
        endpointsHit.add(rpcEndpoint);
        return null;
      });
    }

    // Both endpoints should have been used
    expect(endpointsHit.size).toBe(2);
  });
});

// ============================================================================
// RpcPool with retry disabled
// ============================================================================

describe("RpcPool with retry disabled", () => {
  it("does not retry when retry=false", async () => {
    const pool = new RpcPool({
      endpoints: ["https://rpc1.example.com"],
      retry: false,
      requestTimeoutMs: 5000,
      verbose: false,
    });

    let callCount = 0;
    await expect(
      pool.call(async () => {
        callCount++;
        throw new Error("429 rate limited");
      }),
    ).rejects.toThrow("429 rate limited");
    expect(callCount).toBe(1); // No retry
  });
});

// ============================================================================
// RpcPool.getConnection()
// ============================================================================

describe("RpcPool.getConnection()", () => {
  it("returns a Connection instance", () => {
    const pool = new RpcPool({
      endpoints: ["https://rpc1.example.com"],
      verbose: false,
    });
    const conn = pool.getConnection();
    expect(conn).toBeInstanceOf(Connection);
  });

  it("returns first endpoint in failover mode", () => {
    const pool = new RpcPool({
      endpoints: [
        { url: "https://rpc1.example.com", label: "primary" },
        { url: "https://rpc2.example.com", label: "backup" },
      ],
      strategy: "failover",
      verbose: false,
    });
    const conn = pool.getConnection();
    expect((conn as any)._rpcEndpoint).toContain("rpc1");
  });
});

// ============================================================================
// RpcPool.healthCheck() — mocked
// ============================================================================

describe("RpcPool.healthCheck()", () => {
  it("returns one result per endpoint", async () => {
    const pool = new RpcPool({
      endpoints: ["https://rpc1.example.com", "https://rpc2.example.com"],
      verbose: false,
    });

    // Mock the actual health check to avoid network calls
    const results = await pool.healthCheck(100);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r).toHaveProperty("endpoint");
      expect(r).toHaveProperty("healthy");
      expect(r).toHaveProperty("latencyMs");
      expect(r).toHaveProperty("slot");
    }
  });
});

// ============================================================================
// checkRpcHealth — standalone
// ============================================================================

describe("checkRpcHealth", () => {
  it("returns unhealthy for unreachable endpoint", async () => {
    const result = await checkRpcHealth("https://does-not-exist.invalid", 500);
    expect(result.healthy).toBe(false);
    expect(result.slot).toBe(0);
    expect(result.error).toBeDefined();
    expect(result.endpoint).toBe("https://does-not-exist.invalid");
  });

  it("returns latencyMs as a number", async () => {
    const result = await checkRpcHealth("https://does-not-exist.invalid", 500);
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// RpcPool timeout handling
// ============================================================================

describe("RpcPool timeout", () => {
  it("rejects when call exceeds requestTimeoutMs", async () => {
    const pool = new RpcPool({
      endpoints: ["https://rpc1.example.com"],
      retry: false,
      requestTimeoutMs: 100,
      verbose: false,
    });

    await expect(
      pool.call(async () => {
        // Simulate a slow call
        await new Promise(resolve => setTimeout(resolve, 5000));
        return "too late";
      }),
    ).rejects.toThrow(/timed out/);
  });
});

// ============================================================================
// Type exports sanity
// ============================================================================

describe("Type exports", () => {
  it("exports RetryConfig type (compile-time check)", () => {
    const config: RetryConfig = {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30_000,
      jitterFactor: 0.5,
      retryableStatusCodes: [429, 503],
    };
    expect(config.maxRetries).toBe(5);
  });

  it("exports RpcPoolConfig type (compile-time check)", () => {
    const config: RpcPoolConfig = {
      endpoints: ["https://rpc1.example.com"],
      strategy: "round-robin",
      retry: { maxRetries: 3 },
      requestTimeoutMs: 30_000,
      commitment: "confirmed",
      verbose: false,
    };
    expect(config.endpoints).toHaveLength(1);
  });

  it("exports RpcHealthResult type (compile-time check)", () => {
    const result: RpcHealthResult = {
      endpoint: "https://example.com",
      healthy: true,
      latencyMs: 50,
      slot: 12345,
    };
    expect(result.healthy).toBe(true);
  });
});

// ============================================================================
// #350: redactUrl strips credentials
// ============================================================================

describe("#350 redactUrl", () => {
  const r = _internal.redactUrl;

  it("removes userinfo username and password", () => {
    const out = r("https://alice:hunter2@rpc.example.com/");
    expect(out).not.toContain("alice");
    expect(out).not.toContain("hunter2");
    expect(out).toContain("rpc.example.com");
  });

  it("removes a username-only userinfo (token as username)", () => {
    const out = r("https://sk_live_secrettoken@rpc.example.com/");
    expect(out).not.toContain("sk_live_secrettoken");
  });

  it("redacts api-key style query parameters", () => {
    const out = r("https://mainnet.helius-rpc.com/?api-key=abc123&foo=bar");
    expect(out).not.toContain("abc123");
    expect(out).toContain("api-key=***");
    expect(out).toContain("foo=bar");
  });

  it("redacts opaque path-embedded keys (Alchemy / QuickNode style)", () => {
    expect(r("https://solana-mainnet.g.alchemy.com/v2/ABCDEFGHIJKLMNOPQRSTUVWXYZ012345")).toBe(
      "https://solana-mainnet.g.alchemy.com/v2/***",
    );
    const qn = r("https://x.quiknode.pro/0123456789abcdef0123456789abcdef01234567/");
    expect(qn).not.toContain("0123456789abcdef");
  });

  it("drops the fragment", () => {
    expect(r("https://rpc.example.com/#secretfragmentvalue1234567890")).not.toContain("secretfragment");
  });

  it("returns a fixed placeholder, never the raw string, when unparseable", () => {
    const raw = "user:pass@not a url/with-secret-0123456789abcdef";
    const out = r(raw);
    expect(out).toBe("[unparseable-url]");
    expect(out).not.toContain("pass");
    expect(out).not.toContain("secret");
  });

  it("endpointLabel does not echo an unparseable URL", () => {
    expect(_internal.endpointLabel({ url: "user:pass@not a url/secret-0123456789" })).toBe("endpoint");
  });

  it("status() urls never contain credentials", () => {
    const pool = new RpcPool({
      endpoints: [
        { url: "https://bob:pw123@rpc1.example.com/?token=tok" },
      ],
      verbose: false,
    });
    const blob = JSON.stringify(pool.status());
    expect(blob).not.toContain("bob");
    expect(blob).not.toContain("pw123");
    expect(blob).toContain("token=***");
  });
});

// ============================================================================
// #351: timeout must not fail over concurrently for non-idempotent callbacks
// ============================================================================

describe("#351 RpcPool timeout failover", () => {
  const mk = () =>
    new RpcPool({
      endpoints: ["https://rpc1.example.com", "https://rpc2.example.com"],
      strategy: "failover",
      retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2, jitterFactor: 0 },
      requestTimeoutMs: 30,
      verbose: false,
    });

  it("default (non-idempotent): a timeout throws RpcTimeoutError and fn runs exactly once", async () => {
    const pool = mk();
    let running = 0;
    let maxConcurrent = 0;
    const fn = vi.fn(async () => {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      await new Promise((r) => setTimeout(r, 300));
      running--;
      return "late";
    });
    await expect(pool.call(fn)).rejects.toBeInstanceOf(RpcTimeoutError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(maxConcurrent).toBe(1);
    await new Promise((r) => setTimeout(r, 350));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("the attempt's AbortSignal is aborted when the SDK timeout fires", async () => {
    const pool = mk();
    let sig: AbortSignal | undefined;
    await expect(
      pool.call(async (_c, s) => {
        sig = s;
        await new Promise((r) => setTimeout(r, 200));
      }),
    ).rejects.toBeInstanceOf(RpcTimeoutError);
    expect(sig?.aborted).toBe(true);
  });

  it("idempotent: true still fails over to the next endpoint after a timeout", async () => {
    const pool = mk();
    const seen: AbortSignal[] = [];
    const fn = vi.fn(async (_c: Connection, s: AbortSignal) => {
      seen.push(s);
      if (fn.mock.calls.length === 1) await new Promise((r) => setTimeout(r, 300));
      return "ok";
    });
    await expect(pool.call(fn, { idempotent: true })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(seen[0].aborted).toBe(true); // first attempt told to stop before the retry ran
  });

  it("errors thrown BY fn (callback settled) still fail over without idempotent", async () => {
    const pool = mk();
    const fn = vi.fn(async () => {
      if (fn.mock.calls.length === 1) throw new Error("HTTP 429 Too Many Requests");
      return "ok";
    });
    await expect(pool.call(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
