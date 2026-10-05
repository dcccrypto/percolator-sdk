import { Connection, PublicKey, Keypair, TransactionInstruction } from "@solana/web3.js";
/** First byte of every v1 transaction (SIMD-0385: `129`). */
export declare const TX_V1_VERSION_BYTE = 129;
/** Maximum serialized v1 transaction size (SIMD-0296). */
export declare const TX_V1_MAX_BYTES = 4096;
/** Maximum serialized legacy / v0 transaction size (IPv6 MTU 1280 - 48 header bytes). */
export declare const TX_LEGACY_MAX_BYTES = 1232;
/** Maximum addresses (accounts) in one v1 transaction. */
export declare const TX_V1_MAX_ADDRESSES = 64;
/** Maximum instructions in one v1 transaction. */
export declare const TX_V1_MAX_INSTRUCTIONS = 64;
/** Maximum signatures in one v1 transaction. */
export declare const TX_V1_MAX_SIGNATURES = 12;
/** Per-transaction compute unit ceiling (unchanged in v1). */
export declare const TX_MAX_COMPUTE_UNITS = 1400000;
/** Default per-transaction loaded-accounts-data-size ceiling (64 MiB). */
export declare const TX_MAX_LOADED_ACCOUNTS_DATA_BYTES: number;
/** Heap-size bounds in v1 (SIMD-0385): multiple of 1 KiB in [32 KiB, 256 KiB]. */
export declare const TX_V1_MIN_HEAP_BYTES: number;
export declare const TX_V1_MAX_HEAP_BYTES: number;
/**
 * Feature-gate account of Transaction v1 (SIMD-0385 + SIMD-0296). The account exists and holds
 * `Some(activation_slot)` once active (verified on devnet and mainnet-beta, 2026-10-05).
 */
export declare const TX_V1_FEATURE_ID: PublicKey;
/** Transaction wire formats the helper can emit. */
export type TxFormat = "v1" | "v0" | "legacy";
/**
 * The v1 transaction config (replaces ComputeBudget instructions).
 *
 * `computeUnitLimit` is required: an unset limit is 0 in v1 and the transaction cannot run.
 */
export interface V1Config {
    /** Requested compute unit limit, 1..{@link TX_MAX_COMPUTE_UNITS}. */
    computeUnitLimit: number;
    /**
     * Requested loaded-accounts-data-size limit in bytes, 1..64 MiB. Defaults to 64 MiB, the legacy
     * default, so behaviour matches a legacy transaction that sets no limit.
     */
    loadedAccountsDataSizeLimit?: number;
    /**
     * TOTAL priority fee in lamports (not micro-lamports per CU). Omit or 0 for none.
     * See {@link priorityFeeLamportsFromMicroPerCu}.
     */
    priorityFeeLamports?: bigint | number;
    /**
     * Heap size in bytes (multiple of 1024 in [32768, 262144]). Omit for the 32 KiB default.
     * Every Percolator wrapper transaction needs 131072 ({@link V17_WRAPPER_HEAP_FRAME_BYTES}).
     */
    heapSizeBytes?: number;
}
/**
 * Convert a legacy micro-lamports-per-CU price into the v1 total-lamports priority fee.
 * Legacy charged `price * cuLimit / 1e6` (rounded up) on the REQUESTED limit, so the total is the same.
 *
 * @param microLamportsPerCu - Compute unit price in micro-lamports.
 * @param computeUnitLimit - The requested compute unit limit.
 * @returns Total priority fee in lamports (rounded up).
 * @example
 * priorityFeeLamportsFromMicroPerCu(50_000, 400_000) // 20_000n
 */
export declare function priorityFeeLamportsFromMicroPerCu(microLamportsPerCu: number | bigint, computeUnitLimit: number | bigint): bigint;
/** Result of compiling instructions for v1. */
export interface CompiledV1Message {
    /** Message bytes (what signers sign), no signatures. */
    message: Uint8Array;
    /** Address table in message order; the first `numRequiredSignatures` are signers. */
    accountKeys: PublicKey[];
    numRequiredSignatures: number;
    numReadonlySigned: number;
    numReadonlyUnsigned: number;
    /** Serialized size including `numRequiredSignatures * 64` signature bytes. */
    txBytes: number;
}
/**
 * Compile instructions into a v1 message.
 *
 * Account ordering follows the legacy rule: writable signers (payer first), readonly signers,
 * writable non-signers, readonly non-signers. Program ids are readonly non-signers unless the
 * same key is also used as a writable account.
 *
 * @param params.payer - Fee payer (first signer, writable).
 * @param params.instructions - Instructions, in execution order. ComputeBudget instructions are rejected: they are ignored by v1 and would silently drop the budget.
 * @param params.recentBlockhash - Lifetime specifier (base58 blockhash).
 * @param params.config - v1 config (compute budget).
 * @returns The compiled message and its accounting.
 * @throws If any v1 limit is violated (64 addresses, 64 instructions, 12 signers, 4096 bytes).
 * @example
 * const c = compileV1Message({ payer, instructions: [ix], recentBlockhash, config: { computeUnitLimit: 200_000, heapSizeBytes: 131072 } });
 */
export declare function compileV1Message(params: {
    payer: PublicKey;
    instructions: readonly TransactionInstruction[];
    recentBlockhash: string;
    config: V1Config;
}): CompiledV1Message;
/**
 * Sign a compiled v1 message with the given keypairs and return the wire bytes.
 * Slots with no matching keypair are left zero-filled (a partially-signed tx, to be completed by a wallet).
 *
 * @param compiled - Output of {@link compileV1Message}.
 * @param signers - Keypairs for any of the required signer slots.
 * @returns The serialized v1 transaction (message then signatures).
 * @example
 * const wire = signV1Message(compiled, [payerKeypair]);
 */
export declare function signV1Message(compiled: CompiledV1Message, signers: readonly Keypair[]): Uint8Array;
/**
 * Decode the transaction signature (the first signature, base58) of v1 wire bytes.
 *
 * @param wire - Serialized v1 transaction.
 * @returns The base58 transaction id.
 */
export declare function v1TransactionSignature(wire: Uint8Array): string;
/** Compute-budget parameters shared by every format. */
export interface BudgetParams {
    computeUnitLimit: number;
    /** Legacy-style price in micro-lamports per CU; converted to total lamports for v1. */
    priorityMicroLamportsPerCu?: number;
    /** Heap in bytes; 0/undefined = none. Wrapper txs: {@link V17_WRAPPER_HEAP_FRAME_BYTES}. */
    heapBytes?: number;
    /** v1 only: loaded accounts data size limit. */
    loadedAccountsDataSizeLimit?: number;
}
/** v1 config derived from format-neutral budget params. */
export declare function v1ConfigFromBudget(b: BudgetParams): V1Config;
/** Legacy / v0 ComputeBudget prelude equivalent to a budget. */
export declare function computeBudgetInstructions(b: BudgetParams): TransactionInstruction[];
/**
 * Exact serialized size of `instructions` in the given format, including the budget (instructions for
 * legacy/v0, config bytes for v1) and one 64-byte signature per required signer.
 * v0 is measured without address lookup tables.
 *
 * @param format - Wire format.
 * @param payer - Fee payer.
 * @param instructions - Payload instructions (no ComputeBudget).
 * @param budget - Budget.
 * @returns Size in bytes.
 * @throws If the instructions cannot be compiled into that format at all.
 * @example
 * measureTxBytes("v1", payer, [ix], { computeUnitLimit: 400_000, heapBytes: 131072 }) // e.g. 301
 */
export declare function measureTxBytes(format: TxFormat, payer: PublicKey, instructions: readonly TransactionInstruction[], budget: BudgetParams): number;
/**
 * One atomic unit of work for {@link packInstructionGroups}: its instructions are never split across
 * transactions (e.g. one market's PushAuthMark, or a crank + its dependent ix).
 */
export interface PackGroup<T = unknown> {
    /** Instructions of this unit, in order. */
    instructions: readonly TransactionInstruction[];
    /** Estimated compute units this unit consumes. */
    computeUnits: number;
    /** Caller payload carried through to the plan (market id, etc). */
    tag?: T;
}
/** One planned transaction. */
export interface PackedTx<T = unknown> {
    groups: PackGroup<T>[];
    instructions: TransactionInstruction[];
    /** Sum of the groups' compute units. */
    computeUnits: number;
    /** Exact serialized size of this transaction in the planned format. */
    bytes: number;
    /** Distinct accounts incl. programs and payer. */
    accounts: number;
}
/** Limits for {@link packInstructionGroups}. Defaults come from the format. */
export interface PackOptions {
    format: TxFormat;
    payer: PublicKey;
    /** Maximum bytes (default 4096 for v1, 1232 otherwise). */
    maxBytes?: number;
    /** Compute-unit ceiling per tx (default 1,400,000). */
    maxComputeUnits?: number;
    /** Max groups per tx (default unbounded). */
    maxGroups?: number;
    /** Safety margin subtracted from maxBytes (default 0). */
    byteMargin?: number;
    /** Fixed compute-unit overhead added to the limit (default 0). */
    budget?: Omit<BudgetParams, "computeUnitLimit">;
    /** Extra CU headroom multiplier applied to the summed estimate for the limit (default 1). */
    cuHeadroom?: number;
}
/**
 * Greedy, order-preserving, size-aware packing: groups are appended to the current transaction until
 * adding the next would exceed the byte limit, the account limit (64), the instruction limit (64),
 * the compute-unit ceiling, or `maxGroups`; then a new transaction starts.
 *
 * Sizes are exact (the real compile is used on every step), so a returned plan never exceeds
 * `maxBytes`. A single group that alone exceeds a limit throws, since it could never be sent.
 *
 * @param groups - Atomic units, in priority order.
 * @param opts - Format, payer and limits.
 * @returns Planned transactions, covering every group exactly once, in order.
 * @throws If a single group alone does not fit.
 * @example
 * const plan = packInstructionGroups(markets.map((m) => ({ instructions: [pushIx(m)], computeUnits: 12_000, tag: m })), { format: "v1", payer });
 * plan.length // transactions needed
 */
export declare function packInstructionGroups<T = unknown>(groups: readonly PackGroup<T>[], opts: PackOptions): PackedTx<T>[];
/** `TX_V1` flag: `auto` = use v1 when the cluster supports it, `on` = require v1, `off` = never. */
export type TxV1Mode = "auto" | "on" | "off";
/**
 * Parse a `TX_V1` style flag. Unknown / empty values fall back to `fallback`.
 *
 * @param raw - Raw env string.
 * @param fallback - Value for missing/invalid input (default `"auto"`).
 * @returns The mode.
 */
export declare function parseTxV1Mode(raw: string | undefined | null, fallback?: TxV1Mode): TxV1Mode;
/**
 * True when feature-gate account data records an activation (`Option<u64>` = `Some`).
 *
 * @param data - Raw account data of the feature account (9 bytes when set or unset).
 * @returns Whether the feature is active.
 */
export declare function isFeatureAccountActive(data: Uint8Array | null | undefined): boolean;
/** Minimal connection surface the detector needs (a web3.js `Connection` satisfies it). */
export interface V1DetectConnection {
    getAccountInfo(pubkey: PublicKey): Promise<{
        data: Uint8Array;
    } | null>;
}
/**
 * Detect whether the cluster behind `connection` has Transaction v1 active, by reading the feature-gate
 * account (read-only). The result is cached per connection for `ttlMs`. An RPC failure is reported as
 * `false` (so callers fall back to v0/legacy) and is NOT cached.
 *
 * A positive result says the CLUSTER accepts v1; it does not prove that every RPC node, sender service or
 * wallet in front of it does. Use the send-time fallback ({@link isTxV1FormatRejection}) for that.
 *
 * @param connection - Connection (or a stub with `getAccountInfo`).
 * @param ttlMs - Cache lifetime, default 10 minutes.
 * @returns true if active.
 * @example
 * if (await detectTxV1Support(connection)) { /* build v1 *\/ }
 */
export declare function detectTxV1Support(connection: V1DetectConnection, ttlMs?: number): Promise<boolean>;
/**
 * Resolve the format to use for a `TX_V1` mode.
 *
 * @param mode - `auto|on|off`.
 * @param clusterSupportsV1 - From {@link detectTxV1Support}.
 * @param fallback - Format when v1 is not used (default `"legacy"`).
 * @returns The format. In `on` mode with an unsupporting cluster this throws instead of silently downgrading.
 */
export declare function resolveTxFormat(mode: TxV1Mode, clusterSupportsV1: boolean, fallback?: Exclude<TxFormat, "v1">): TxFormat;
/**
 * Classify an RPC send/simulate error as "the node/cluster rejected the v1 FORMAT" (as opposed to the
 * transaction failing on-chain). Only these should trigger a repack-and-retry as v0/legacy; a program
 * error must never cause a resend.
 *
 * @param err - Thrown error, JSON-RPC error object or message string.
 * @returns true if the failure is a format rejection.
 */
export declare function isTxV1FormatRejection(err: unknown): boolean;
/** Result of a raw v1 simulation. */
export interface V1SimulationResult {
    err: unknown;
    logs: string[];
    unitsConsumed?: number;
    loadedAccountsDataSize?: number;
}
/** Options for raw JSON-RPC calls. */
export interface RawRpcOptions {
    /** Extra headers (e.g. Origin for a key-restricted endpoint). */
    headers?: Record<string, string>;
    /** Injected fetch (tests). */
    fetchImpl?: typeof fetch;
}
/**
 * Simulate v1 wire bytes (read-only). `sigVerify` is off so an unsigned/partially signed message can be
 * simulated, and the blockhash is replaced so a stale one does not mask the real result.
 *
 * @param connection - Connection whose `rpcEndpoint` is used.
 * @param wire - Serialized v1 transaction.
 * @param o - Raw RPC options.
 * @returns Simulation outcome.
 * @throws On JSON-RPC level errors (decode/sanitize failures), which {@link isTxV1FormatRejection} classifies.
 */
export declare function simulateV1(connection: Connection, wire: Uint8Array, o?: RawRpcOptions): Promise<V1SimulationResult>;
/**
 * Send v1 wire bytes. Returns the signature string reported by the node.
 *
 * @param connection - Connection whose `rpcEndpoint` is used.
 * @param wire - Serialized, fully signed v1 transaction.
 * @param opts - `skipPreflight` / `maxRetries` plus raw RPC options.
 * @returns Transaction signature.
 * @throws On any JSON-RPC error. Format rejections satisfy {@link isTxV1FormatRejection}.
 */
export declare function sendV1(connection: Connection, wire: Uint8Array, opts?: RawRpcOptions & {
    skipPreflight?: boolean;
    maxRetries?: number;
    preflightCommitment?: "processed" | "confirmed" | "finalized";
}): Promise<string>;
/** Structural subset of a wallet-adapter `Adapter`. */
export interface WalletVersionInfo {
    /** `null`/`undefined` = legacy only (wallet-adapter convention). */
    supportedTransactionVersions?: ReadonlySet<unknown> | null;
}
/**
 * True only when the wallet explicitly advertises v1 (`supportedTransactionVersions` contains `1`).
 * Wallets must advertise only after they can fully parse and sign v1; an absent or legacy/0-only set is
 * treated as "no", which is the safe direction (the caller then uses v0/legacy).
 *
 * @param wallet - A wallet-adapter `Adapter` (or any object with `supportedTransactionVersions`).
 * @returns Whether v1 user-signing may be attempted.
 * @example
 * const useV1 = walletSupportsV1(wallet?.adapter);
 */
export declare function walletSupportsV1(wallet: WalletVersionInfo | null | undefined): boolean;
/** Outcome of one transaction sent by {@link sendGroupsAdaptive}. */
export interface AdaptiveTxResult<T = unknown> {
    /** Format actually used. */
    format: TxFormat;
    /** Tags of the groups carried by this tx (from {@link PackGroup.tag}). */
    tags: (T | undefined)[];
    /** Exact serialized bytes. */
    bytes: number;
    /** Signature when the send was accepted by the node. */
    signature?: string;
    /** Error message when the send failed (on-chain failures included). */
    error?: string;
    /** True when this tx was produced by repacking after a v1 rejection. */
    afterFallback: boolean;
}
/** Aggregate result. */
export interface AdaptiveResult<T = unknown> {
    results: AdaptiveTxResult<T>[];
    /** Number of transactions sent (accepted or failed). */
    txCount: number;
    /** Format the cycle started in. */
    initialFormat: TxFormat;
    /** True if a v1 rejection forced a fallback mid-run. */
    fellBack: boolean;
    /** Transactions the same groups would have needed in the fallback format (for observability). */
    baselineTxCount: number;
}
/** Parameters for {@link sendGroupsAdaptive}. */
export interface AdaptiveSendParams<T = unknown> {
    connection: Connection;
    /** Fee payer + any other signers (payer first). */
    signers: readonly Keypair[];
    groups: readonly PackGroup<T>[];
    mode: TxV1Mode;
    /** Format used when v1 is off / unsupported / rejected. Default `legacy`. */
    fallbackFormat?: Exclude<TxFormat, "v1">;
    /** Budget template (CU is derived per tx from the packed groups). */
    budget?: Omit<BudgetParams, "computeUnitLimit">;
    /** CU headroom multiplier over the summed estimate. Default 1.2. */
    cuHeadroom?: number;
    /** Max groups per tx in addition to byte/CU/account limits. */
    maxGroups?: number;
    /** Override cluster detection (tests / known clusters). */
    clusterSupportsV1?: boolean;
    /**
     * Custom transport. Receives the signed wire bytes and the format; must return the signature or throw.
     * Use this to route through Helius Sender or another sender. Default: raw `sendTransaction`.
     */
    sender?: (wire: Uint8Array, format: TxFormat) => Promise<string>;
    /** Called after each tx attempt. */
    onTx?: (r: AdaptiveTxResult<T>) => void;
    /** Stop after the first failed (non-format) send. Default false: remaining txs are still attempted. */
    stopOnError?: boolean;
}
/**
 * Plan and send `groups` in as few transactions as the format allows.
 *
 * - `mode` `off` -> fallback format; `auto` -> v1 iff {@link detectTxV1Support}; `on` -> v1, throws when the cluster reports it inactive.
 * - If a v1 send is rejected for FORMAT reasons ({@link isTxV1FormatRejection}), the remaining groups are repacked
 *   in the fallback format and sending continues. On-chain failures never trigger a fallback or a resend.
 *
 * Failure atomicity is per transaction, exactly as before: a failed tx fails its groups together.
 *
 * @param p - See {@link AdaptiveSendParams}.
 * @returns Per-transaction results and the tx-count comparison.
 * @example
 * const out = await sendGroupsAdaptive({ connection, signers: [keeper], groups, mode: parseTxV1Mode(process.env.TX_V1), budget: { heapBytes: 131072, priorityMicroLamportsPerCu: 50_000 } });
 * console.log(out.txCount, "vs", out.baselineTxCount);
 */
export declare function sendGroupsAdaptive<T = unknown>(p: AdaptiveSendParams<T>): Promise<AdaptiveResult<T>>;
