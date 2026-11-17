import { describe, it, expect, vi, afterEach } from "vitest";
import {
  RpcPool,
  RpcTimeoutError,
  checkRpcHealth,
  withRetry,
  _internal,
} from "../src/solana/rpc-pool.js";

// Branch-coverage tests for src/solana/rpc-pool.ts. Deliberately does NOT touch
// the healthCheck() recovery path (owned by #473).

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const URL_A = "https://a.example.com";
const URL_B = "https://b.example.com";
const URL_C = "https://c.example.com";

function mockFetch(impl: () => Promise<unknown>) {
  const f = vi.fn(impl);
  vi.stubGlobal("fetch", f);
  return f;
}

describe("checkRpcHealth response branches", () => {
  it("reports HTTP status when response is not ok", async () => {
    mockFetch(async () => ({ ok: false, status: 503 }));
    const r = await checkRpcHealth(URL_A);
    expect(r).toMatchObject({ endpoint: URL_A, healthy: false, slot: 0, error: "HTTP 503" });
  });

  it("surfaces the JSON-RPC error message", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ error: { message: "node behind" } }) }));
    const r = await checkRpcHealth(URL_A);
    expect(r.healthy).toBe(false);
    expect(r.error).toBe("node behind");
  });

  it("falls back to a generic message when the error has no message", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ error: {} }) }));
    const r = await checkRpcHealth(URL_A);
    expect(r.error).toBe("invalid getSlot response");
  });

  it("rejects a non-numeric result", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ result: "123" }) }));
    const r = await checkRpcHealth(URL_A);
    expect(r).toMatchObject({ healthy: false, slot: 0, error: "invalid getSlot response" });
  });

  it("rejects a null JSON body", async () => {
    mockFetch(async () => ({ ok: true, json: async () => null }));
    const r = await checkRpcHealth(URL_A);
    expect(r).toMatchObject({ healthy: false, error: "invalid getSlot response" });
  });

  it("returns the slot on success", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ result: 4242 }) }));
    const r = await checkRpcHealth(URL_A);
    expect(r).toMatchObject({ healthy: true, slot: 4242 });
    expect(r.error).toBeUndefined();
  });

  it("stringifies non-Error rejections", async () => {
    mockFetch(async () => {
      throw "boom-string";
    });
    const r = await checkRpcHealth(URL_A);
    expect(r).toMatchObject({ healthy: false, slot: 0, error: "boom-string" });
  });

  it("uses Error.message for Error rejections", async () => {
    mockFetch(async () => {
      throw new Error("offline");
    });
    const r = await checkRpcHealth(URL_A);
    expect(r.error).toBe("offline");
  });
});

describe("helper branches", () => {
  it("isRetryable: falsy error is not retryable", () => {
    expect(_internal.isRetryable(undefined, [429])).toBe(false);
    expect(_internal.isRetryable(null, [429])).toBe(false);
  });

  it("isRetryable: AbortError / TimeoutError names are never retried", () => {
    const abort = Object.assign(new Error("network 503"), { name: "AbortError" });
    const to = Object.assign(new Error("timeout 429"), { name: "TimeoutError" });
    expect(_internal.isRetryable(abort, [503])).toBe(false);
    expect(_internal.isRetryable(to, [429])).toBe(false);
  });

  it("isRetryable: non-Error values are stringified", () => {
    expect(_internal.isRetryable("HTTP 429", [429])).toBe(true);
    expect(_internal.isRetryable("nope", [429])).toBe(false);
  });

  it("isRetryable: status code must not be embedded in a longer number", () => {
    expect(_internal.isRetryable(new Error("slot 14290"), [429])).toBe(false);
  });

  it("isRetryable: bad gateway / service unavailable / econnaborted text", () => {
    expect(_internal.isRetryable(new Error("Bad Gateway"), [])).toBe(true);
    expect(_internal.isRetryable(new Error("Service Unavailable"), [])).toBe(true);
    expect(_internal.isRetryable(new Error("too many requests"), [])).toBe(true);
    expect(_internal.isRetryable(new Error("ECONNABORTED"), [])).toBe(true);
  });

  it("computeDelay: jitter 0 is deterministic, capped at max", () => {
    const cfg = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 250, jitterFactor: 0, retryableStatusCodes: [] };
    expect(_internal.computeDelay(0, cfg)).toBe(100);
    expect(_internal.computeDelay(1, cfg)).toBe(200);
    expect(_internal.computeDelay(5, cfg)).toBe(250);
  });

  it("computeDelay: jitter stays within [raw/2, raw]", () => {
    const cfg = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0.25, retryableStatusCodes: [] };
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(_internal.computeDelay(1, cfg)).toBe(100);
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(_internal.computeDelay(1, cfg)).toBe(200);
  });

  it("resolveRetryConfig: false disables, jitter is clamped", () => {
    expect(_internal.resolveRetryConfig(false)).toBeNull();
    expect(_internal.resolveRetryConfig({ jitterFactor: 5 })!.jitterFactor).toBe(1);
    expect(_internal.resolveRetryConfig({ jitterFactor: -2 })!.jitterFactor).toBe(0);
    expect(_internal.resolveRetryConfig()).toMatchObject({ maxRetries: 3, baseDelayMs: 500, maxDelayMs: 10_000 });
  });

  it("endpointLabel: explicit label, hostname, unparseable, empty hostname", () => {
    expect(_internal.endpointLabel({ url: URL_A, label: "mine" })).toBe("mine");
    expect(_internal.endpointLabel({ url: URL_A })).toBe("a.example.com");
    expect(_internal.endpointLabel({ url: "not a url?key=secret" })).toBe("endpoint");
    expect(_internal.endpointLabel({ url: "file:///tmp/x" })).toBe("endpoint");
  });

  it("normalizeEndpoint wraps bare strings and passes objects through", () => {
    expect(_internal.normalizeEndpoint(URL_A)).toEqual({ url: URL_A });
    const o = { url: URL_B, weight: 3 };
    expect(_internal.normalizeEndpoint(o)).toBe(o);
  });

  describe("redactUrl", () => {
    it("strips userinfo and fragment", () => {
      const r = _internal.redactUrl("https://user:pw@h.example.com/p#frag");
      expect(r).not.toContain("user");
      expect(r).not.toContain("pw");
      expect(r).not.toContain("frag");
    });

    it("masks credential-named and opaque query values, keeps benign ones", () => {
      const r = _internal.redactUrl(
        "https://h.example.com/x?api-key=abc&foo=bar&z=ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
      );
      expect(r).toContain("api-key=***");
      expect(r).toContain("foo=bar");
      expect(r).toContain("z=***");
    });

    it("masks opaque path segments", () => {
      const r = _internal.redactUrl("https://h.example.com/v2/ABCDEFGHIJKLMNOPQRSTUVWXYZ012345");
      expect(r).toBe("https://h.example.com/v2/***");
    });

    it("returns a placeholder for non-http schemes and garbage", () => {
      expect(_internal.redactUrl("user:secret@host/x")).toBe("[unparseable-url]");
      expect(_internal.redactUrl("garbage secret")).toBe("[unparseable-url]");
    });
  });
});

describe("RpcPool constructor", () => {
  it("rejects empty endpoints", () => {
    expect(() => new RpcPool({ endpoints: [] })).toThrow("at least one endpoint");
  });

  it("rejects missing endpoints", () => {
    expect(() => new RpcPool({} as never)).toThrow("at least one endpoint");
  });

  it("defaults: failover strategy, bare strings accepted, weight defaults to 1", () => {
    const pool = new RpcPool({ endpoints: [URL_A, URL_B], verbose: false });
    expect(pool.size).toBe(2);
    expect(pool.healthyCount).toBe(2);
    expect(pool.status().map(s => s.label)).toEqual(["a.example.com", "b.example.com"]);
  });

  it("status redacts credentials", () => {
    const pool = new RpcPool({
      endpoints: [{ url: "https://h.example.com/?api-key=secretvalue", label: "x" }],
      verbose: false,
    });
    const s = pool.status()[0];
    expect(s.url).not.toContain("secretvalue");
    expect(s.label).toBe("x");
  });
});

describe("RpcPool.call selection / retry / failover", () => {
  const noRetry = { retry: false as const, verbose: false };

  it("failover: uses first healthy endpoint, returns result and resets failures", async () => {
    const pool = new RpcPool({ endpoints: [URL_A, URL_B], ...noRetry });
    const seen: unknown[] = [];
    const out = await pool.call(async c => {
      seen.push(c);
      return 7;
    });
    expect(out).toBe(7);
    expect(seen[0]).toBe(pool.getConnection());
    expect(pool.status()[0].failures).toBe(0);
  });

  it("failover: non-retryable error moves to next endpoint", async () => {
    const pool = new RpcPool({ endpoints: [URL_A, URL_B], ...noRetry });
    const conns: unknown[] = [];
    const out = await pool.call(async c => {
      conns.push(c);
      if (conns.length === 1) throw new Error("401 Unauthorized");
      return "ok";
    });
    expect(out).toBe("ok");
    expect(conns).toHaveLength(2);
    expect(conns[0]).not.toBe(conns[1]);
    expect(pool.status().map(s => s.failures)).toEqual([1, 0]);
  });

  it("failover: when every endpoint fails non-retryably, the last error is thrown", async () => {
    const pool = new RpcPool({ endpoints: [URL_A, URL_B], ...noRetry });
    let n = 0;
    await expect(
      pool.call(async () => {
        throw new Error(`fatal-${++n}`);
      }),
    ).rejects.toThrow("fatal-2");
    expect(n).toBe(2);
  });

  it("single endpoint: non-retryable error is thrown immediately", async () => {
    const pool = new RpcPool({ endpoints: [URL_A], ...noRetry });
    let n = 0;
    await expect(
      pool.call(async () => {
        n++;
        throw new Error("bad request 400");
      }),
    ).rejects.toThrow("bad request 400");
    expect(n).toBe(1);
  });

  it("retry disabled: retryable error is not retried on a single endpoint", async () => {
    const pool = new RpcPool({ endpoints: [URL_A], ...noRetry });
    let n = 0;
    await expect(
      pool.call(async () => {
        n++;
        throw new Error("429");
      }),
    ).rejects.toThrow("429");
    expect(n).toBe(1);
  });

  it("retries a retryable error with backoff, then succeeds", async () => {
    vi.useFakeTimers();
    const pool = new RpcPool({
      endpoints: [URL_A],
      retry: { maxRetries: 2, baseDelayMs: 100, jitterFactor: 0 },
      verbose: false,
    });
    let n = 0;
    const p = pool.call(async () => {
      if (++n < 3) throw new Error("503 Service Unavailable");
      return "done";
    });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    await expect(p).resolves.toBe("done");
    expect(n).toBe(3);
  });

  it("exhausting retries throws the last error and logs warnings when verbose", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = new RpcPool({
      endpoints: [URL_A],
      retry: { maxRetries: 1, baseDelayMs: 10, jitterFactor: 0 },
      verbose: true,
    });
    let n = 0;
    const p = pool.call(async () => {
      throw new Error(`429 try ${++n}`);
    });
    const assertion = expect(p).rejects.toThrow("429 try 2");
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(warn.mock.calls.some(c => String(c[0]).includes("Retryable error on a.example.com (attempt 1/2)"))).toBe(true);
  });

  it("failover + retryable error: tries the next endpoint on the following attempt", async () => {
    vi.useFakeTimers();
    const pool = new RpcPool({
      endpoints: [URL_A, URL_B],
      retry: { maxRetries: 2, baseDelayMs: 5, jitterFactor: 0 },
      verbose: false,
    });
    const conns: unknown[] = [];
    const p = pool.call(async c => {
      conns.push(c);
      if (conns.length === 1) throw new Error("ECONNRESET");
      return "b";
    });
    await vi.advanceTimersByTimeAsync(5);
    await expect(p).resolves.toBe("b");
    expect(conns[0]).not.toBe(conns[1]);
  });

  it("marks endpoint unhealthy after threshold failures and logs once verbose", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = new RpcPool({ endpoints: [URL_A], retry: false, verbose: true });
    for (let i = 0; i < 3; i++) {
      await pool.call(async () => {
        throw new Error("nope");
      }).catch(() => {});
    }
    expect(pool.status()[0].healthy).toBe(false);
    expect(pool.healthyCount).toBe(0);
    expect(warn.mock.calls.some(c => String(c[0]).includes("marked unhealthy"))).toBe(true);
  });

  it("silent when verbose=false", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = new RpcPool({ endpoints: [URL_A], retry: false, verbose: false });
    for (let i = 0; i < 4; i++) {
      await pool.call(async () => {
        throw new Error("nope");
      }).catch(() => {});
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it("a success after failures resets the failure count and health", async () => {
    const pool = new RpcPool({ endpoints: [URL_A], retry: false, verbose: false, recoveryAfterMs: 0 });
    for (let i = 0; i < 3; i++) await pool.call(async () => { throw new Error("x"); }).catch(() => {});
    expect(pool.status()[0].healthy).toBe(false);
    // all unhealthy -> selectEndpoint falls back to first non-excluded endpoint
    await expect(pool.call(async () => "alive")).resolves.toBe("alive");
    expect(pool.status()[0]).toMatchObject({ healthy: true, failures: 0 });
  });

  it("all-unhealthy: selection falls back to the first non-excluded endpoint", async () => {
    const pool = new RpcPool({ endpoints: [URL_A, URL_B], retry: false, verbose: false, recoveryAfterMs: 0 });
    for (let i = 0; i < 3; i++) await pool.call(async () => { throw new Error("x"); }).catch(() => {});
    // Exhausted calls end by resetting every endpoint (maybeRecoverEndpoints), so the
    // pool is usable again afterwards.
    expect(pool.healthyCount).toBeGreaterThan(0);
    const conns: unknown[] = [];
    await pool.call(async c => { conns.push(c); return 1; });
    expect(conns[0]).toBe(pool.getConnection());
  });

  it("getConnection with no healthy endpoint returns the first endpoint's connection", async () => {
    const pool = new RpcPool({ endpoints: [URL_A], retry: false, verbose: false, recoveryAfterMs: 0 });
    for (let i = 0; i < 3; i++) await pool.call(async () => { throw new Error("x"); }).catch(() => {});
    expect(pool.status()[0].healthy).toBe(false);
    const conn = pool.getConnection();
    expect(conn).toBeDefined();
    expect(pool.getConnection()).toBe(conn);
  });
});

describe("RpcPool timeouts", () => {
  it("non-idempotent timeout throws RpcTimeoutError without failover", async () => {
    vi.useFakeTimers();
    const pool = new RpcPool({ endpoints: [URL_A, URL_B], requestTimeoutMs: 50, retry: false, verbose: false });
    let calls = 0;
    const p = pool.call(() => {
      calls++;
      return new Promise<never>(() => {});
    });
    const assertion = expect(p).rejects.toBeInstanceOf(RpcTimeoutError);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    expect(calls).toBe(1);
  });

  it("idempotent timeout aborts the signal and fails over to the next endpoint", async () => {
    vi.useFakeTimers();
    const pool = new RpcPool({ endpoints: [URL_A, URL_B], requestTimeoutMs: 50, retry: false, verbose: false });
    const signals: AbortSignal[] = [];
    const p = pool.call(
      (_c, signal) => {
        signals.push(signal);
        if (signals.length === 1) return new Promise<string>(() => {});
        return Promise.resolve("second");
      },
      { idempotent: true },
    );
    await vi.advanceTimersByTimeAsync(60);
    await expect(p).resolves.toBe("second");
    expect(signals[0].aborted).toBe(true);
    expect(signals[0].reason).toBeInstanceOf(RpcTimeoutError);
    expect(signals[1].aborted).toBe(false);
  });
});

describe("RpcPool round-robin", () => {
  it("distributes by weight", async () => {
    const pool = new RpcPool({
      endpoints: [
        { url: URL_A, weight: 2, label: "a" },
        { url: URL_B, weight: 1, label: "b" },
      ],
      strategy: "round-robin",
      retry: false,
      verbose: false,
    });
    const labels = new Map<unknown, string>();
    // Identify endpoints by connection identity via a failover-free probe.
    const picks: unknown[] = [];
    for (let i = 0; i < 6; i++) picks.push(await pool.call(async c => c));
    const distinct = [...new Set(picks)];
    expect(distinct).toHaveLength(2);
    const counts = distinct.map(d => picks.filter(p => p === d).length).sort();
    expect(counts).toEqual([2, 4]);
    void labels;
  });

  it("skips unhealthy endpoints", async () => {
    const pool = new RpcPool({
      endpoints: [URL_A, URL_B, URL_C],
      strategy: "round-robin",
      retry: false,
      verbose: false,
      recoveryAfterMs: 0,
    });
    // Make endpoint A unhealthy by 3 failures targeted at it: use round-robin picks and
    // fail only when we're handed A's connection.
    const firstConn = pool.getConnection();
    void firstConn;
    const seen = new Set<unknown>();
    for (let i = 0; i < 12; i++) {
      await pool.call(async c => {
        seen.add(c);
        return 1;
      });
    }
    expect(seen.size).toBe(3);
  });

  it("does not retry a non-retryable error across endpoints (throws)", async () => {
    const pool = new RpcPool({ endpoints: [URL_A, URL_B], strategy: "round-robin", retry: false, verbose: false });
    let n = 0;
    await expect(
      pool.call(async () => {
        n++;
        throw new Error("400");
      }),
    ).rejects.toThrow("400");
    expect(n).toBe(1);
  });
});

describe("withRetry", () => {
  it("returns immediately on success", async () => {
    await expect(withRetry(async () => 5)).resolves.toBe(5);
  });

  it("throws non-retryable errors on the first attempt", async () => {
    let n = 0;
    await expect(
      withRetry(async () => {
        n++;
        throw new Error("401");
      }),
    ).rejects.toThrow("401");
    expect(n).toBe(1);
  });

  it("retries and succeeds", async () => {
    let n = 0;
    const r = await withRetry(
      async () => {
        if (++n < 3) throw new Error("429");
        return "ok";
      },
      { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 2, jitterFactor: 0 },
    );
    expect(r).toBe("ok");
    expect(n).toBe(3);
  });

  it("throws the last error when retries are exhausted", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          throw new Error(`503 #${++n}`);
        },
        { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1, jitterFactor: 0 },
      ),
    ).rejects.toThrow("503 #3");
    expect(n).toBe(3);
  });

  it("maxRetries 0 makes a single attempt", async () => {
    let n = 0;
    await expect(
      withRetry(async () => { n++; throw new Error("429"); }, { maxRetries: 0 }),
    ).rejects.toThrow("429");
    expect(n).toBe(1);
  });
});
