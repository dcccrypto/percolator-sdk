import { Connection, type ConnectionConfig } from "@solana/web3.js";
/**
 * Optional deadline for an SDK RPC flow.
 *
 * Both fields are optional. With neither set the flow behaves exactly as before (no SDK deadline).
 * With either set, the flow rejects with an {@link RpcDeadlineError} once the deadline passes, and it
 * starts no new RPC request after that point.
 *
 * The deadline bounds the caller, not the request already on the wire: web3.js 1.x gives no way to
 * cancel an in-flight request from outside the `Connection`. To also cut the socket, build the
 * `Connection` with {@link createTimeoutConnection}.
 */
export interface RpcDeadlineOptions {
    /** Abort the flow when this signal fires (for example the signal `RpcPool.call` hands to `fn`). */
    signal?: AbortSignal;
    /** Overall budget for the flow, in ms. Must be a positive finite number. */
    timeoutMs?: number;
}
/** Thrown when an SDK RPC flow passes its {@link RpcDeadlineOptions} deadline or its signal aborts. */
export declare class RpcDeadlineError extends Error {
    readonly label: string;
    readonly reason: "timeout" | "aborted";
    readonly timeoutMs?: number;
    constructor(label: string, reason: "timeout" | "aborted", timeoutMs?: number, cause?: unknown);
}
/**
 * Default overall deadline for `simulateOrSend`'s confirmation step (`confirmTimeoutMs`), in ms.
 *
 * On a healthy RPC web3.js always ends confirmation by itself: it resolves, or it throws once the blockhash
 * expires (about 60-90 s after `getLatestBlockhash`). This deadline only fires when the RPC stops serving
 * `getBlockHeight` as well, the case in which web3.js would otherwise poll forever.
 */
export declare const DEFAULT_CONFIRM_TIMEOUT_MS = 120000;
/** Bound on `simulateOrSend`'s fallback `getSignatureStatus` lookup after a confirm failure, in ms. */
export declare const SIGNATURE_STATUS_LOOKUP_TIMEOUT_MS = 30000;
/** Default per-request timeout of {@link createTimeoutFetch} / {@link createTimeoutConnection}, in ms. */
export declare const DEFAULT_RPC_REQUEST_TIMEOUT_MS = 30000;
/** @internal A live deadline: `signal` aborts with an {@link RpcDeadlineError}; call `dispose` when done. */
export interface Deadline {
    signal: AbortSignal | undefined;
    dispose(): void;
}
/**
 * @internal Combine a caller signal and/or a timeout into one signal whose reason is an RpcDeadlineError.
 * Returns `signal: undefined` (and sets no timer) when neither is given.
 */
export declare function startDeadline(label: string, o: RpcDeadlineOptions | undefined, timeoutName?: string): Deadline;
/**
 * @internal Settle with `p`, or reject with `signal.reason` as soon as `signal` aborts. A rejection of `p`
 * after the abort is handled here, so an abandoned request can never become an unhandled rejection.
 */
export declare function raceSignal<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T>;
/**
 * @internal Run `fn` under the deadline in `o`. With no deadline this is exactly `fn(undefined)`. Otherwise
 * `fn` gets the deadline signal (check it with `signal?.throwIfAborted()` before each new request) and the
 * returned promise rejects with an {@link RpcDeadlineError} as soon as the deadline passes.
 */
export declare function withRpcDeadline<T>(label: string, o: RpcDeadlineOptions | undefined, fn: (signal: AbortSignal | undefined) => Promise<T>): Promise<T>;
type FetchLike = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>;
/**
 * Wrap `fetch` so each request (headers AND body) is aborted after `timeoutMs`.
 *
 * Node's built-in fetch only has undici's 300 s idle timers, which an RPC that trickles a byte every
 * few minutes never trips; this bound is a wall-clock bound on the whole request.
 */
export declare function createTimeoutFetch(timeoutMs?: number, baseFetch?: FetchLike): FetchLike;
/**
 * Build a `Connection` whose every HTTP request is bounded by `requestTimeoutMs` (default 30 s).
 *
 * This bounds all RPC calls made through the connection, including the ones the SDK does not wrap and
 * web3.js's own confirmation polling. A caller-supplied `config.fetch` is kept and wrapped.
 *
 * Without a `config.fetch`, requests go through the global `fetch`, which ignores `config.httpAgent`
 * (and web3.js's own keep-alive agent). Pass a `fetch` that honours your agent if you need one.
 */
export declare function createTimeoutConnection(endpoint: string, config?: ConnectionConfig & {
    requestTimeoutMs?: number;
}): Connection;
export {};
