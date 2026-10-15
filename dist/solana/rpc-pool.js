import {
  Connection
} from "@solana/web3.js";
async function checkRpcHealth(endpoint, timeoutMs = 5e3) {
  const start = performance.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
        params: [{ commitment: "processed" }]
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      return { endpoint, healthy: false, latencyMs, slot: 0, error: `HTTP ${res.status}` };
    }
    const json = await res.json();
    if (json?.error || typeof json?.result !== "number") {
      return {
        endpoint,
        healthy: false,
        latencyMs,
        slot: 0,
        error: json?.error?.message ?? "invalid getSlot response"
      };
    }
    return { endpoint, healthy: true, latencyMs, slot: json.result };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      endpoint,
      healthy: false,
      latencyMs,
      slot: 0,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
function resolveRetryConfig(cfg) {
  if (cfg === false) return null;
  const c = cfg ?? {};
  return {
    maxRetries: c.maxRetries ?? 3,
    baseDelayMs: c.baseDelayMs ?? 500,
    maxDelayMs: c.maxDelayMs ?? 1e4,
    jitterFactor: Math.max(0, Math.min(1, c.jitterFactor ?? 0.25)),
    retryableStatusCodes: c.retryableStatusCodes ?? [429, 502, 503, 504]
  };
}
function normalizeEndpoint(ep) {
  if (typeof ep === "string") return { url: ep };
  return ep;
}
function endpointLabel(ep) {
  if (ep.label) return ep.label;
  try {
    return new URL(ep.url).hostname;
  } catch {
    return ep.url.slice(0, 40);
  }
}
function isRetryable(err, codes) {
  if (!err) return false;
  const errName = err?.name;
  if (errName === "AbortError" || errName === "TimeoutError") return false;
  const msg = err instanceof Error ? err.message : String(err);
  for (const code of codes) {
    const pattern = new RegExp(`(?<![0-9])${code}(?![0-9])`);
    if (pattern.test(msg)) return true;
  }
  const lower = msg.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("too many requests") || lower.includes("bad gateway") || lower.includes("service unavailable") || lower.includes("econnreset") || lower.includes("econnrefused") || lower.includes("socket hang up") || lower.includes("network") || lower.includes("timeout") || // #248: only a genuine connection-abort network error (ECONNABORTED) is retryable.
  // The broad "abort" substring previously also matched deliberate AbortSignal/timeout
  // cancellations (handled by the name check above) → infinite retry.
  lower.includes("econnaborted")) {
    return true;
  }
  return false;
}
function computeDelay(attempt, config) {
  const raw = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs
  );
  if (config.jitterFactor === 0) return raw;
  const half = Math.floor(raw / 2);
  return half + Math.floor(Math.random() * (raw - half + 1));
}
function rejectAfter(ms, message) {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function redactUrl(raw) {
  try {
    const u = new URL(raw);
    const sensitive = /^(api[-_]?key|access[-_]?token|auth[-_]?token|token|secret|key|password|bearer|credential|jwt)$/i;
    for (const k of [...u.searchParams.keys()]) {
      if (sensitive.test(k)) {
        u.searchParams.set(k, "***");
      }
    }
    return u.toString();
  } catch {
    return raw;
  }
}
class RpcPool {
  endpoints;
  strategy;
  retryConfig;
  requestTimeoutMs;
  verbose;
  /** Time-based recovery window in ms (0 = disabled). */
  recoveryAfterMs;
  /** Round-robin index tracker. */
  rrIndex = 0;
  /** Consecutive failure threshold before marking an endpoint unhealthy. */
  static UNHEALTHY_THRESHOLD = 3;
  /** Minimum endpoints before auto-recovery is attempted. */
  static MIN_HEALTHY = 1;
  constructor(config) {
    if (!config.endpoints || config.endpoints.length === 0) {
      throw new Error("RpcPool: at least one endpoint is required");
    }
    this.strategy = config.strategy ?? "failover";
    this.retryConfig = resolveRetryConfig(config.retry);
    this.requestTimeoutMs = config.requestTimeoutMs ?? 3e4;
    this.verbose = config.verbose ?? true;
    this.recoveryAfterMs = config.recoveryAfterMs ?? 6e4;
    const commitment = config.commitment ?? "confirmed";
    this.endpoints = config.endpoints.map((raw) => {
      const ep = normalizeEndpoint(raw);
      const connConfig = {
        commitment,
        ...ep.connectionConfig
      };
      return {
        config: ep,
        connection: new Connection(ep.url, connConfig),
        label: endpointLabel(ep),
        weight: Math.max(1, ep.weight ?? 1),
        failures: 0,
        healthy: true,
        lastLatencyMs: -1
      };
    });
  }
  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------
  /**
   * Execute a function against a pooled connection with automatic retry
   * and failover.
   *
   * @param fn - Async function that receives a `Connection` and returns a result.
   * @returns The result of `fn`.
   * @throws The last error if all retries and failovers are exhausted.
   *
   * @example
   * ```ts
   * const balance = await pool.call(c => c.getBalance(pubkey));
   * const markets = await pool.call(c => discoverMarkets(c, programId, opts));
   * ```
   */
  async call(fn) {
    const maxAttempts = this.retryConfig ? this.retryConfig.maxRetries + 1 : 1;
    let lastError;
    const triedEndpoints = /* @__PURE__ */ new Set();
    const maxTotalIterations = maxAttempts + this.endpoints.length;
    let totalIterations = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (++totalIterations > maxTotalIterations) break;
      const epIdx = this.selectEndpoint(triedEndpoints);
      if (epIdx === -1) {
        break;
      }
      const ep = this.endpoints[epIdx];
      const timeout = rejectAfter(this.requestTimeoutMs, `RPC request timed out after ${this.requestTimeoutMs}ms (${ep.label})`);
      try {
        const result = await Promise.race([
          fn(ep.connection),
          timeout.promise
        ]);
        ep.failures = 0;
        ep.healthy = true;
        ep.unhealthySince = void 0;
        return result;
      } catch (err) {
        lastError = err;
        ep.failures++;
        if (ep.failures >= RpcPool.UNHEALTHY_THRESHOLD) {
          ep.healthy = false;
          ep.unhealthySince = ep.unhealthySince ?? Date.now();
          if (this.verbose) {
            console.warn(
              `[RpcPool] Endpoint ${ep.label} marked unhealthy after ${ep.failures} consecutive failures`
            );
          }
        }
        const retryable = this.retryConfig ? isRetryable(err, this.retryConfig.retryableStatusCodes) : false;
        if (!retryable) {
          if (this.strategy === "failover" && this.endpoints.length > 1) {
            triedEndpoints.add(epIdx);
            attempt--;
            if (triedEndpoints.size >= this.endpoints.length) break;
            continue;
          }
          throw err;
        }
        if (this.verbose) {
          console.warn(
            `[RpcPool] Retryable error on ${ep.label} (attempt ${attempt + 1}/${maxAttempts}):`,
            err instanceof Error ? err.message : err
          );
        }
        if (this.strategy === "failover" && this.endpoints.length > 1) {
          triedEndpoints.add(epIdx);
        }
        if (attempt < maxAttempts - 1 && this.retryConfig) {
          const delay = computeDelay(attempt, this.retryConfig);
          await sleep(delay);
        }
      } finally {
        timeout.cancel();
      }
    }
    this.maybeRecoverEndpoints();
    throw lastError ?? new Error("RpcPool: all endpoints exhausted");
  }
  /**
   * Get a raw `Connection` from the current preferred endpoint.
   * Useful when you need to pass a Connection to external code.
   *
   * NOTE: This bypasses retry and failover logic. Prefer `call()`.
   *
   * @returns Solana Connection from the current preferred endpoint.
   *
   * @example
   * ```ts
   * const conn = pool.getConnection();
   * const balance = await conn.getBalance(pubkey);
   * ```
   */
  getConnection() {
    const idx = this.selectEndpoint();
    if (idx === -1) {
      this.maybeRecoverEndpoints();
      return this.endpoints[0].connection;
    }
    return this.endpoints[idx].connection;
  }
  /**
   * Run a health check against all endpoints in the pool.
   *
   * @param timeoutMs - Per-endpoint probe timeout (default: 5000)
   * @returns Array of health results, one per endpoint.
   *
   * @example
   * ```ts
   * const results = await pool.healthCheck();
   * for (const r of results) {
   *   console.log(`${r.endpoint}: ${r.healthy ? 'UP' : 'DOWN'} (${r.latencyMs}ms, slot ${r.slot})`);
   * }
   * ```
   */
  async healthCheck(timeoutMs = 5e3) {
    const results = await Promise.all(
      this.endpoints.map(async (ep) => {
        const result = await checkRpcHealth(ep.config.url, timeoutMs);
        ep.lastLatencyMs = result.latencyMs;
        ep.healthy = result.healthy;
        if (result.healthy) {
          ep.failures = 0;
          ep.unhealthySince = void 0;
        }
        result.endpoint = redactUrl(result.endpoint);
        return result;
      })
    );
    return results;
  }
  /**
   * Get the number of endpoints in the pool.
   */
  get size() {
    return this.endpoints.length;
  }
  /**
   * Get the number of currently healthy endpoints.
   */
  get healthyCount() {
    return this.endpoints.filter((ep) => ep.healthy).length;
  }
  /**
   * Get endpoint labels and their current status.
   *
   * @returns Array of `{ label, url, healthy, failures, lastLatencyMs }`.
   */
  status() {
    return this.endpoints.map((ep) => ({
      label: ep.label,
      url: redactUrl(ep.config.url),
      healthy: ep.healthy,
      failures: ep.failures,
      lastLatencyMs: ep.lastLatencyMs
    }));
  }
  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------
  /**
   * Select the next endpoint based on strategy.
   * Returns -1 if no endpoint is available.
   */
  selectEndpoint(exclude) {
    if (this.recoveryAfterMs > 0) {
      const now = Date.now();
      for (const ep of this.endpoints) {
        if (!ep.healthy && ep.unhealthySince !== void 0 && now - ep.unhealthySince >= this.recoveryAfterMs) {
          ep.healthy = true;
          ep.failures = 0;
          ep.unhealthySince = void 0;
          if (this.verbose) {
            console.warn(`[RpcPool] Endpoint ${ep.label} restored after ${this.recoveryAfterMs}ms recovery window`);
          }
        }
      }
    }
    const healthy = this.endpoints.map((ep, i) => ({ ep, i })).filter(({ ep, i }) => ep.healthy && !exclude?.has(i));
    if (healthy.length === 0) {
      const remaining = this.endpoints.map((_, i) => i).filter((i) => !exclude?.has(i));
      return remaining.length > 0 ? remaining[0] : -1;
    }
    if (this.strategy === "failover") {
      return healthy[0].i;
    }
    const totalWeight = healthy.reduce((sum, { ep }) => sum + ep.weight, 0);
    this.rrIndex = (this.rrIndex + 1) % totalWeight;
    let cumulative = 0;
    for (const { ep, i } of healthy) {
      cumulative += ep.weight;
      if (this.rrIndex < cumulative) return i;
    }
    return healthy[healthy.length - 1].i;
  }
  /**
   * If all endpoints are unhealthy, reset them so we at least try again.
   */
  maybeRecoverEndpoints() {
    const healthyCount = this.endpoints.filter((ep) => ep.healthy).length;
    if (healthyCount < RpcPool.MIN_HEALTHY) {
      if (this.verbose) {
        console.warn("[RpcPool] All endpoints unhealthy \u2014 resetting for recovery");
      }
      for (const ep of this.endpoints) {
        ep.healthy = true;
        ep.failures = 0;
        ep.unhealthySince = void 0;
      }
    }
  }
}
async function withRetry(fn, config) {
  const resolved = resolveRetryConfig(config) ?? {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 1e4,
    jitterFactor: 0.25,
    retryableStatusCodes: [429, 502, 503, 504]
  };
  let lastError;
  const maxAttempts = resolved.maxRetries + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err, resolved.retryableStatusCodes)) {
        throw err;
      }
      if (attempt < maxAttempts - 1) {
        const delay = computeDelay(attempt, resolved);
        await sleep(delay);
      }
    }
  }
  throw lastError ?? new Error("withRetry: all attempts exhausted");
}
const _internal = {
  isRetryable,
  computeDelay,
  resolveRetryConfig,
  normalizeEndpoint,
  endpointLabel
};
export {
  RpcPool,
  _internal,
  checkRpcHealth,
  withRetry
};
//# sourceMappingURL=rpc-pool.js.map