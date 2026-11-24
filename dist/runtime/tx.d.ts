import { Connection, PublicKey, TransactionInstruction, Keypair, Commitment, AccountMeta } from "@solana/web3.js";
export interface BuildIxParams {
    programId: PublicKey;
    keys: AccountMeta[];
    data: Uint8Array | Buffer;
}
/**
 * Build a transaction instruction.
 */
export declare function buildIx(params: BuildIxParams): TransactionInstruction;
export interface TxResult {
    signature: string;
    slot: number;
    err: string | null;
    hint?: string;
    logs: string[];
    unitsConsumed?: number;
}
export interface SimulateOrSendParams {
    connection: Connection;
    ix: TransactionInstruction;
    signers: Keypair[];
    simulate: boolean;
    commitment?: Commitment;
    computeUnitLimit?: number;
    /**
     * Heap frame to request, in bytes (Compute Budget). The v17 wrapper installs a 128 KB
     * BumpAllocator and makes its FIRST heap allocation near heap_base+128KB on every
     * instruction, so EVERY transaction touching the wrapper MUST request a 128 KB heap frame
     * or it aborts on-chain with ProgramFailedToComplete / "Access violation in heap section"
     * (#176). Defaults to 128 KB so wrapper txs work out of the box; pass 0 to omit. Must be a
     * multiple of 1024 in [32768, 262144].
     */
    heapFrameBytes?: number;
    /**
     * Abort the whole call when this signal fires (e.g. the signal `RpcPool.call` hands to `fn`).
     * Default: none.
     */
    signal?: AbortSignal;
    /**
     * Overall deadline for the whole call (blockhash, simulate or send, confirm, log fetch), in ms.
     * Default: none. Before the send, passing it throws {@link RpcDeadlineError} (blockhash) or returns
     * it as `err` (simulate). After the send, the result keeps the real signature and says the outcome is
     * unknown, as for any other confirm failure.
     */
    timeoutMs?: number;
    /**
     * Deadline for the confirmation step alone, in ms. Default: {@link DEFAULT_CONFIRM_TIMEOUT_MS} (120 s).
     * On a healthy RPC confirmation ends well before this (it confirms, or the blockhash expires after
     * about 60-90 s). It only fires when the RPC stops serving `getBlockHeight` too, where web3.js would
     * otherwise poll forever.
     */
    confirmTimeoutMs?: number;
}
/**
 * The v17 wrapper's installed heap-frame size. EVERY transaction that touches the wrapper
 * MUST request this much heap or it aborts on-chain (#176). Default for `heapFrameBytes`.
 */
export declare const V17_WRAPPER_HEAP_FRAME_BYTES: number;
export declare function simulateOrSend(params: SimulateOrSendParams): Promise<TxResult>;
/**
 * Format transaction result for output.
 */
export declare function formatResult(result: TxResult, jsonMode: boolean): string;
