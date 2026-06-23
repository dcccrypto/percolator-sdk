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
