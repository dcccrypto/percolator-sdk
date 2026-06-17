import { Connection, type Commitment, type ConnectionConfig } from "@solana/web3.js";
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
    /**
     * Time in ms after which an unhealthy endpoint is given another chance.
     * Prevents permanently blacklisting endpoints after transient outages.
     * Set to 0 to disable periodic recovery.
     * @default 60_000
     */
    recoveryAfterMs?: number;
}
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
export declare function checkRpcHealth(endpoint: string, timeoutMs?: number): Promise<RpcHealthResult>;
/** Resolved defaults for RetryConfig. */
interface ResolvedRetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitterFactor: number;
    retryableStatusCodes: number[];
}
declare function resolveRetryConfig(cfg?: RetryConfig | false): ResolvedRetryConfig | null;
declare function normalizeEndpoint(ep: RpcEndpointConfig | string): RpcEndpointConfig;
declare function endpointLabel(ep: RpcEndpointConfig): string;
declare function isRetryable(err: unknown, codes: number[]): boolean;
declare function computeDelay(attempt: number, config: ResolvedRetryConfig): number;
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
export declare class RpcPool {
    private readonly endpoints;
    private readonly strategy;
    private readonly retryConfig;
    private readonly requestTimeoutMs;
    private readonly verbose;
    private readonly recoveryAfterMs;
    /** Round-robin index tracker. */
    private rrIndex;
    /** Consecutive failure threshold before marking an endpoint unhealthy. */
    private static readonly UNHEALTHY_THRESHOLD;
    /** Minimum endpoints before auto-recovery is attempted. */
    private static readonly MIN_HEALTHY;
    constructor(config: RpcPoolConfig);
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
    call<T>(fn: (connection: Connection) => Promise<T>): Promise<T>;
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
    getConnection(): Connection;
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
    healthCheck(timeoutMs?: number): Promise<RpcHealthResult[]>;
    /**
     * Get the number of endpoints in the pool.
     */
    get size(): number;
    /**
     * Get the number of currently healthy endpoints.
     */
    get healthyCount(): number;
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
    }>;
    /**
     * Select the next endpoint based on strategy.
     * Returns -1 if no endpoint is available.
     */
    private selectEndpoint;
    /**
     * If all endpoints are unhealthy, reset them so we at least try again.
     */
    private maybeRecoverEndpoints;
}
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
export declare function withRetry<T>(fn: () => Promise<T>, config?: RetryConfig): Promise<T>;
/** @internal — exposed for unit tests only */
export declare const _internal: {
    readonly isRetryable: typeof isRetryable;
    readonly computeDelay: typeof computeDelay;
    readonly resolveRetryConfig: typeof resolveRetryConfig;
    readonly normalizeEndpoint: typeof normalizeEndpoint;
    readonly endpointLabel: typeof endpointLabel;
};
export {};
