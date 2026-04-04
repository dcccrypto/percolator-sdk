import {
  Connection,
  type Commitment,
  type ConnectionConfig,
} from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

/**
 * Configuration for exponential-backoff retry on RPC calls.
 *
 * @example
 * ```ts
 * const retryConfig: RetryConfig = {
 *   maxRetries: 3,
 *   baseDelayMs: 500,
 *   maxDelayMs: 10_000,
 *   retryableStatusCodes: [429, 502, 503],
 * };
 * ```
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts after the initial request fails.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in ms for exponential backoff.
   * Delay for attempt N is: `min(baseDelayMs * 2^N, maxDelayMs) + jitter`.
   * @default 500
   */
  baseDelayMs?: number;

  /**
   * Maximum delay in ms (backoff cap).
   * @default 10_000
   */
  maxDelayMs?: number;

  /**
   * Jitter factor (0–1). Applied as random `[0, jitterFactor * delay]` addition.
   * @default 0.25
   */
  jitterFactor?: number;

  /**
   * HTTP status codes considered retryable.
   * Errors matching these codes (or containing their string representation)
   * will be retried.
   * @default [429, 502, 503, 504]
   */
  retryableStatusCodes?: number[];
}

/**
 * Configuration for a single RPC endpoint in the pool.
 *
 * @example
 * ```ts
 * const endpoint: RpcEndpointConfig = {
 *   url: "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
 *   weight: 10,
 *   label: "helius-primary",
 * };
 * ```
 */
export interface RpcEndpointConfig {
  /** RPC endpoint URL. */
  url: string;

  /**
   * Relative weight for round-robin selection.
   * Higher weight = more requests routed here.
   * @default 1
   */
  weight?: number;

  /**
   * Human-readable label for logging / diagnostics.
   * @default url hostname
   */
  label?: string;

  /**
   * Extra `ConnectionConfig` options (commitment, confirmTransactionInitialTimeout, etc.)
   * merged into the Solana `Connection` constructor for this endpoint.
   */
  connectionConfig?: ConnectionConfig;
}

/**
 * Strategy for selecting the next RPC endpoint from the pool.
 *
 * - `"round-robin"` — weighted round-robin across healthy endpoints.
 * - `"failover"`    — use the first healthy endpoint; only advance on failure.
 */
export type SelectionStrategy = "round-robin" | "failover";

/**
 * Full configuration for the RPC connection pool.
 *
 * @example
 * ```ts
 * import { RpcPool } from "@percolator/sdk";
 *
 * const pool = new RpcPool({
 *   endpoints: [
 *     { url: "https://mainnet.helius-rpc.com/?api-key=KEY", weight: 10, label: "helius" },
 *     { url: "https://api.mainnet-beta.solana.com", weight: 1, label: "public" },
 *   ],
 *   strategy: "failover",
 *   retry: { maxRetries: 3, baseDelayMs: 500 },
 *   requestTimeoutMs: 30_000,
 * });
 *
 * // Use like a Connection — same surface
 * const slot = await pool.call(conn => conn.getSlot());
 * ```
 */
export interface RpcPoolConfig {
  /**
   * One or more RPC endpoints. At least one is required.
   * If a bare `string[]` is passed, each string is treated as `{ url: string }`.
   */
  endpoints: (RpcEndpointConfig | string)[];

  /**
   * How to pick the next endpoint.
   * @default "failover"
   */
  strategy?: SelectionStrategy;

  /**
   * Retry config applied to every `call()`.
   * Set to `false` to disable retries entirely.
   * @default { maxRetries: 3, baseDelayMs: 500 }
   */
  retry?: RetryConfig | false;

  /**
   * Per-request timeout in ms.  Applies an `AbortSignal` timeout to `Connection`
   * calls where supported, and is used as a deadline for the health probe.
   * @default 30_000
   */
  requestTimeoutMs?: number;

  /**
   * Default Solana commitment level for connections.
   * @default "confirmed"
   */
  commitment?: Commitment;

  /**
   * If true, `console.warn` diagnostic messages on retries, failovers, etc.
   * @default true
   */
  verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Health Probe
// ---------------------------------------------------------------------------

/**
 * Result of an RPC health probe.
 *
 * @example
 * ```ts
 * import { checkRpcHealth } from "@percolator/sdk";
 *
 * const health = await checkRpcHealth("https://api.mainnet-beta.solana.com");
 * console.log(`Slot: ${health.slot}, Latency: ${health.latencyMs}ms`);
 * if (!health.healthy) console.warn(`Unhealthy: ${health.error}`);
 * ```
 */
export interface RpcHealthResult {
  /** The endpoint that was probed. */
  endpoint: string;
  /** Whether the probe succeeded (getSlot returned without error). */
  healthy: boolean;
  /** Round-trip latency in milliseconds (0 if unhealthy). */
  latencyMs: number;
  /** Current slot height (0 if unhealthy). */
  slot: number;
  /** Error message if the probe failed. */
  error?: string;
}

/**
 * Probe an RPC endpoint's health by calling `getSlot()` and measuring latency.
 *
 * @param endpoint  - RPC URL to probe
 * @param timeoutMs - Timeout in ms for the probe request (default: 5000)
 * @returns Health result with latency and slot height
 *
 * @example
 * ```ts
 * import { checkRpcHealth } from "@percolator/sdk";
 *
 * const result = await checkRpcHealth("https://api.mainnet-beta.solana.com", 3000);
 * if (result.healthy) {
 *   console.log(`Slot ${result.slot} — ${result.latencyMs}ms`);
 * } else {
 *   console.error(`RPC down: ${result.error}`);
 * }
 * ```
 */
export async function checkRpcHealth(
  endpoint: string,
  timeoutMs: number = 5_000,
): Promise<RpcHealthResult> {
  const conn = new Connection(endpoint, { commitment: "processed" });
  const start = performance.now();

  try {
    const slot = await Promise.race([
      conn.getSlot("processed"),
      rejectAfter<number>(timeoutMs, `Health probe timed out after ${timeoutMs}ms`),
    ]);

    const latencyMs = Math.round(performance.now() - start);
    return { endpoint, healthy: true, latencyMs, slot };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      endpoint,
      healthy: false,
      latencyMs,
      slot: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/** Resolved defaults for RetryConfig. */
interface ResolvedRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  retryableStatusCodes: number[];
}

function resolveRetryConfig(cfg?: RetryConfig | false): ResolvedRetryConfig | null {
  if (cfg === false) return null;
  const c = cfg ?? {};
  return {
    maxRetries: c.maxRetries ?? 3,
    baseDelayMs: c.baseDelayMs ?? 500,
    maxDelayMs: c.maxDelayMs ?? 10_000,
    jitterFactor: Math.max(0, Math.min(1, c.jitterFactor ?? 0.25)),
    retryableStatusCodes: c.retryableStatusCodes ?? [429, 502, 503, 504],
  };
}

function normalizeEndpoint(ep: RpcEndpointConfig | string): RpcEndpointConfig {
  if (typeof ep === "string") return { url: ep };
  return ep;
}

function endpointLabel(ep: RpcEndpointConfig): string {
  if (ep.label) return ep.label;
  try {
    return new URL(ep.url).hostname;
  } catch {
    return ep.url.slice(0, 40);
  }
}

function isRetryable(err: unknown, codes: number[]): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  for (const code of codes) {
    if (msg.includes(String(code))) return true;
  }
  // Generic network errors
  if (
    msg.toLowerCase().includes("rate limit") ||
    msg.toLowerCase().includes("too many requests") ||
    msg.toLowerCase().includes("econnreset") ||
    msg.toLowerCase().includes("econnrefused") ||
    msg.toLowerCase().includes("socket hang up") ||
    msg.toLowerCase().includes("network") ||
    msg.toLowerCase().includes("timeout") ||
    msg.toLowerCase().includes("abort")
  ) {
    return true;
  }
  return false;
}

function computeDelay(attempt: number, config: ResolvedRetryConfig): number {
  const raw = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs,
  );
  const jitter = Math.floor(Math.random() * raw * config.jitterFactor);
  return raw + jitter;
}

function rejectAfter<T>(ms: number, message: string): Promise<T> {
  return new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms),
  );
}

/** Sleep utility. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Redact sensitive query-string parameters (api-key, api_key, token, secret,
 * key, password) from a URL so it is safe for logging / status output.
 */
function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const sensitive = /^(api[-_]?key|token|secret|key|password)$/i;
    for (const k of [...u.searchParams.keys()]) {
      if (sensitive.test(k)) {
        u.searchParams.set(k, "***");
      }
    }
    return u.toString();
  } catch {
    // Not a valid URL — return as-is (unlikely for RPC endpoints).
    return raw;
  }
}

// ---------------------------------------------------------------------------
// RpcPool
// ---------------------------------------------------------------------------

/** Per-endpoint tracked state. */
interface EndpointState {
  config: RpcEndpointConfig;
  connection: Connection;
  label: string;
  weight: number;
  /** Consecutive failure count. Resets on success. */
  failures: number;
  /** Whether this endpoint is considered healthy. */
  healthy: boolean;
  /** Last probe latency (ms), -1 if never probed. */
  lastLatencyMs: number;
}

/**
 * RPC connection pool with retry, failover, and round-robin support.
 *
 * Wraps one or more Solana RPC endpoints behind a single `call()` interface
 * that automatically retries transient errors and fails over to alternate
 * endpoints when one goes down.
 *
 * @example
 * ```ts
 * import { RpcPool } from "@percolator/sdk";
 *
 * const pool = new RpcPool({
 *   endpoints: [
 *     { url: "https://mainnet.helius-rpc.com/?api-key=KEY", weight: 10, label: "helius" },
 *     { url: "https://api.mainnet-beta.solana.com", weight: 1, label: "public" },
 *   ],
 *   strategy: "failover",
 *   retry: { maxRetries: 3 },
 *   requestTimeoutMs: 30_000,
 * });
 *
 * // Execute any Connection method through the pool
 * const slot = await pool.call(conn => conn.getSlot());
 *
 * // Or get a raw connection for one-off use
 * const conn = pool.getConnection();
 *
 * // Health check all endpoints
 * const results = await pool.healthCheck();
 * ```
 */
export class RpcPool {
  private readonly endpoints: EndpointState[];
  private readonly strategy: SelectionStrategy;
  private readonly retryConfig: ResolvedRetryConfig | null;
  private readonly requestTimeoutMs: number;
  private readonly verbose: boolean;

  /** Round-robin index tracker. */
  private rrIndex: number = 0;

  /** Consecutive failure threshold before marking an endpoint unhealthy. */
  private static readonly UNHEALTHY_THRESHOLD = 3;

  /** Minimum endpoints before auto-recovery is attempted. */
  private static readonly MIN_HEALTHY = 1;

  constructor(config: RpcPoolConfig) {
    if (!config.endpoints || config.endpoints.length === 0) {
      throw new Error("RpcPool: at least one endpoint is required");
    }

    this.strategy = config.strategy ?? "failover";
    this.retryConfig = resolveRetryConfig(config.retry);
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
    this.verbose = config.verbose ?? true;

    const commitment = config.commitment ?? "confirmed";

    this.endpoints = config.endpoints.map(raw => {
      const ep = normalizeEndpoint(raw);
      const connConfig: ConnectionConfig = {
        commitment,
        ...ep.connectionConfig,
      };
      return {
        config: ep,
        connection: new Connection(ep.url, connConfig),
        label: endpointLabel(ep),
        weight: Math.max(1, ep.weight ?? 1),
        failures: 0,
        healthy: true,
        lastLatencyMs: -1,
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
  async call<T>(fn: (connection: Connection) => Promise<T>): Promise<T> {
    const maxAttempts = this.retryConfig ? this.retryConfig.maxRetries + 1 : 1;
    let lastError: unknown;

    // Track which endpoints we have tried in this call to avoid infinite loops.
    const triedEndpoints = new Set<number>();
    // Hard cap on total iterations to prevent amplification from attempt-- failovers
    const maxTotalIterations = maxAttempts + this.endpoints.length;
    let totalIterations = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (++totalIterations > maxTotalIterations) break;
      const epIdx = this.selectEndpoint(triedEndpoints);
      if (epIdx === -1) {
        // All endpoints exhausted
        break;
      }
      const ep = this.endpoints[epIdx];

      try {
        const result = await Promise.race([
          fn(ep.connection),
          rejectAfter<T>(this.requestTimeoutMs, `RPC request timed out after ${this.requestTimeoutMs}ms (${ep.label})`),
        ]);

        // Success — reset failure count
        ep.failures = 0;
        ep.healthy = true;
        return result;
      } catch (err) {
        lastError = err;
        ep.failures++;

        if (ep.failures >= RpcPool.UNHEALTHY_THRESHOLD) {
          ep.healthy = false;
          if (this.verbose) {
            console.warn(
              `[RpcPool] Endpoint ${ep.label} marked unhealthy after ${ep.failures} consecutive failures`,
            );
          }
        }

        const retryable = this.retryConfig
          ? isRetryable(err, this.retryConfig.retryableStatusCodes)
          : false;

        if (!retryable) {
          // For non-retryable errors in failover mode, try the next endpoint
          if (this.strategy === "failover" && this.endpoints.length > 1) {
            triedEndpoints.add(epIdx);
            // Don't count this as a retry attempt — just failover
            attempt--;
            if (triedEndpoints.size >= this.endpoints.length) break;
            continue;
          }
          throw err;
        }

        // Retryable error
        if (this.verbose) {
          console.warn(
            `[RpcPool] Retryable error on ${ep.label} (attempt ${attempt + 1}/${maxAttempts}):`,
            err instanceof Error ? err.message : err,
          );
        }

        // In failover mode, try next endpoint before retrying same one
        if (this.strategy === "failover" && this.endpoints.length > 1) {
          triedEndpoints.add(epIdx);
        }

        // Backoff before retry
        if (attempt < maxAttempts - 1 && this.retryConfig) {
          const delay = computeDelay(attempt, this.retryConfig);
          await sleep(delay);
        }
      }
    }

    // All attempts exhausted — try recovery before giving up
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
  getConnection(): Connection {
    const idx = this.selectEndpoint();
    if (idx === -1) {
      // All marked unhealthy — reset and use first
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
  async healthCheck(timeoutMs: number = 5_000): Promise<RpcHealthResult[]> {
    const results = await Promise.all(
      this.endpoints.map(async (ep) => {
        const result = await checkRpcHealth(ep.config.url, timeoutMs);
        ep.lastLatencyMs = result.latencyMs;
        ep.healthy = result.healthy;
        if (result.healthy) ep.failures = 0;
        return result;
      }),
    );
    return results;
  }

  /**
   * Get the number of endpoints in the pool.
   */
  get size(): number {
    return this.endpoints.length;
  }

  /**
   * Get the number of currently healthy endpoints.
   */
  get healthyCount(): number {
    return this.endpoints.filter(ep => ep.healthy).length;
  }

  /**
   * Get endpoint labels and their current status.
   *
   * @returns Array of `{ label, url, healthy, failures, lastLatencyMs }`.
   */
  status(): Array<{
    label: string;
    url: string;
    healthy: boolean;
    failures: number;
    lastLatencyMs: number;
  }> {
    return this.endpoints.map(ep => ({
      label: ep.label,
      url: redactUrl(ep.config.url),
      healthy: ep.healthy,
      failures: ep.failures,
      lastLatencyMs: ep.lastLatencyMs,
    }));
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Select the next endpoint based on strategy.
   * Returns -1 if no endpoint is available.
   */
  private selectEndpoint(exclude?: Set<number>): number {
    const healthy = this.endpoints
      .map((ep, i) => ({ ep, i }))
      .filter(({ ep, i }) => ep.healthy && !(exclude?.has(i)));

    if (healthy.length === 0) {
      // No healthy endpoints — try all non-excluded
      const remaining = this.endpoints
        .map((_, i) => i)
        .filter(i => !(exclude?.has(i)));
      return remaining.length > 0 ? remaining[0] : -1;
    }

    if (this.strategy === "failover") {
      // Return first healthy (by insertion order)
      return healthy[0].i;
    }

    // Weighted round-robin
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
  private maybeRecoverEndpoints(): void {
    const healthyCount = this.endpoints.filter(ep => ep.healthy).length;
    if (healthyCount < RpcPool.MIN_HEALTHY) {
      if (this.verbose) {
        console.warn("[RpcPool] All endpoints unhealthy — resetting for recovery");
      }
      for (const ep of this.endpoints) {
        ep.healthy = true;
        ep.failures = 0;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Standalone retry wrapper (for use without a full pool)
// ---------------------------------------------------------------------------

/**
 * Execute an async function with exponential-backoff retry.
 *
 * Use this when you already have a `Connection` and just want retry logic
 * without a full pool.
 *
 * @param fn     - Async function to execute
 * @param config - Retry configuration (default: 3 retries, 500ms base delay)
 * @returns Result of `fn`
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```ts
 * import { withRetry } from "@percolator/sdk";
 * import { Connection } from "@solana/web3.js";
 *
 * const conn = new Connection("https://api.mainnet-beta.solana.com");
 * const slot = await withRetry(
 *   () => conn.getSlot(),
 *   { maxRetries: 3, baseDelayMs: 1000 },
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: RetryConfig,
): Promise<T> {
  const resolved = resolveRetryConfig(config) ?? {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 10_000,
    jitterFactor: 0.25,
    retryableStatusCodes: [429, 502, 503, 504],
  };

  let lastError: unknown;
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

// ---------------------------------------------------------------------------
// Re-export helpers for testing
// ---------------------------------------------------------------------------

/** @internal — exposed for unit tests only */
export const _internal = {
  isRetryable,
  computeDelay,
  resolveRetryConfig,
  normalizeEndpoint,
  endpointLabel,
} as const;
