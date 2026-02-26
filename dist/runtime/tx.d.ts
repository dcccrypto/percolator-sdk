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
}
/**
 * Simulate or send a transaction.
 * Returns consistent output for both modes.
 */
export declare function simulateOrSend(params: SimulateOrSendParams): Promise<TxResult>;
/**
 * Format transaction result for output.
 */
export declare function formatResult(result: TxResult, jsonMode: boolean): string;
