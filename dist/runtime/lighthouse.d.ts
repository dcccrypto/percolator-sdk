/**
 * @module lighthouse
 * Lighthouse v2 (Blowfish / Phantom wallet middleware) detection and mitigation.
 *
 * Lighthouse (program L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95) is a native (non-Anchor)
 * wallet guard injected by Phantom and other Solana wallets via the Blowfish transaction
 * scanning service. It adds assertion instructions to transactions that verify account
 * state expectations (e.g., "this account should be empty" or "this account should have
 * X lamports").
 *
 * **Problem:** Lighthouse doesn't understand Percolator's slab accounts. When a slab
 * (e.g., ESa89R5 with 323,312 bytes) is passed as a TradeCpi account, Lighthouse injects
 * an assertion like `StateInvalidAddress` that expects `data_len == 0` (uninitialised).
 * The slab IS initialised, so a multi-assert instruction fails with error 0x1900 (Lighthouse multi-assert AssertionFailed
 * = 6400 decimal). This causes the transaction to revert even though the Percolator program
 * logic is correct.
 *
 * **Solution:** The SDK provides utilities to:
 * 1. Detect Lighthouse instructions in a transaction
 * 2. Strip them before sending
 * 3. Classify 0x1900 errors as Lighthouse (not Percolator) errors
 * 4. Provide clear, actionable error messages for end users
 *
 * @example
 * ```ts
 * import { isLighthouseError, stripLighthouseInstructions, LIGHTHOUSE_PROGRAM_ID } from "@percolator/sdk";
 *
 * // Before sending: strip injected Lighthouse IXs
 * const cleanIxs = stripLighthouseInstructions(instructions);
 *
 * // After error: classify and give user-friendly message
 * if (isLighthouseError(error)) {
 *   console.warn("Wallet middleware blocked the transaction");
 * }
 * ```
 */
import { PublicKey, TransactionInstruction, Transaction } from "@solana/web3.js";
/**
 * Lighthouse v2 program ID (Blowfish/Phantom wallet guard).
 *
 * This is an immutable native program deployed at slot 294,179,293.
 * Wallets like Phantom inject instructions from this program into user
 * transactions to enforce Blowfish security assertions.
 */
export declare const LIGHTHOUSE_PROGRAM_ID: PublicKey;
/** Base58 string form for fast comparison without PublicKey instantiation. */
export declare const LIGHTHOUSE_PROGRAM_ID_STR = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
/**
 * Lighthouse multi-assert AssertionFailed at assertion index 0 (0x1900 = 6400).
 * Lighthouse maps a failed assertion i of a multi-assert instruction to
 * Custom(0x1900 + i) (`map_multi_err`). It is NOT an Anchor code and NOT a
 * Percolator error. (Name kept for compatibility.)
 */
export declare const LIGHTHOUSE_CONSTRAINT_ADDRESS = 6400;
/**
 * Lighthouse's own custom error codes: `LighthouseError` 6000..6016 plus
 * 0x1900 (multi-assert index 0; index i is 0x1900 + i). Lighthouse is a native
 * program, not Anchor. Source: Jac0xb/lighthouse@4c579479
 * programs/lighthouse/src/error.rs:23-78.
 */
export declare const LIGHTHOUSE_ERROR_CODES: Set<6400 | 6000 | 6001 | 6002 | 6003 | 6004 | 6005 | 6006 | 6007 | 6008 | 6009 | 6010 | 6011 | 6012 | 6013 | 6014 | 6015 | 6016>;
/**
 * Check if a TransactionInstruction is from the Lighthouse program.
 *
 * @param ix - A Solana transaction instruction.
 * @returns `true` if the instruction's programId is Lighthouse.
 *
 * @example
 * ```ts
 * const hasLighthouse = instructions.some(isLighthouseInstruction);
 * ```
 */
export declare function isLighthouseInstruction(ix: TransactionInstruction): boolean;
/**
 * Check if an error message or error object indicates a Lighthouse assertion failure.
 *
 * Detects:
 * - `custom program error: 0x1900` (Lighthouse multi-assert AssertionFailed)
 * - References to the Lighthouse program ID in error text (not counting
 *   invoke/consumed/success lines of a Lighthouse ix that completed)
 * - `"Custom": 6400` in JSON-encoded InstructionError
 * - Any code (LIGHTHOUSE_ERROR_CODES or other) when the
 *   failing program is Lighthouse (identified by program ID in logs)
 *
 * @param error - An Error object, error message string, or transaction logs array.
 * @returns `true` if the error appears to originate from Lighthouse, not Percolator.
 *
 * @example
 * ```ts
 * try {
 *   await sendTransaction(tx);
 * } catch (e) {
 *   if (isLighthouseError(e)) {
 *     // Retry with skipPreflight or notify user about wallet middleware
 *   }
 * }
 * ```
 */
export declare function isLighthouseError(error: unknown): boolean;
/**
 * Check if transaction logs contain evidence of a Lighthouse failure.
 *
 * More precise than `isLighthouseError` on a string — examines the program
 * invocation chain to confirm the error originates from Lighthouse, not from
 * a Percolator instruction that happens to return a similar code.
 *
 * @param logs - Array of transaction log lines from `getTransaction()`.
 * @returns `true` if logs show a Lighthouse program failure.
 */
export declare function isLighthouseFailureInLogs(logs: string[]): boolean;
/**
 * Remove all Lighthouse assertion instructions from an instruction array.
 *
 * Call this before building a Transaction to prevent Lighthouse assertion
 * failures. Safe to call even if no Lighthouse instructions are present.
 *
 * @param instructions - Array of transaction instructions.
 * @returns Filtered array with Lighthouse instructions removed.
 *
 * @example
 * ```ts
 * import { stripLighthouseInstructions } from "@percolator/sdk";
 *
 * const instructions = [crankIx, tradeIx]; // May have Lighthouse IXs mixed in
 * const clean = stripLighthouseInstructions(instructions);
 * const tx = new Transaction().add(...clean);
 * ```
 */
export declare function stripLighthouseInstructions(instructions: TransactionInstruction[], percolatorProgramId?: PublicKey): TransactionInstruction[];
/**
 * Strip Lighthouse instructions from an already-built Transaction.
 *
 * Creates a new Transaction with the same recentBlockhash and feePayer
 * but without any Lighthouse instructions. The returned transaction is
 * unsigned and must be re-signed.
 *
 * @param transaction - A Transaction (signed or unsigned).
 * @returns A new Transaction without Lighthouse instructions, or the same
 *          transaction if no Lighthouse instructions were found.
 *
 * @example
 * ```ts
 * const signed = await wallet.signTransaction(tx);
 * if (hasLighthouseInstructions(signed)) {
 *   const clean = stripLighthouseFromTransaction(signed);
 *   const reSigned = await wallet.signTransaction(clean);
 *   await connection.sendRawTransaction(reSigned.serialize());
 * }
 * ```
 */
export declare function stripLighthouseFromTransaction(transaction: Transaction, percolatorProgramId?: PublicKey): Transaction;
/**
 * Count Lighthouse instructions in an instruction array or transaction.
 *
 * @param ixsOrTx - Array of instructions or a Transaction.
 * @returns Number of Lighthouse instructions found.
 */
export declare function countLighthouseInstructions(ixsOrTx: TransactionInstruction[] | Transaction): number;
/**
 * User-friendly error message for Lighthouse assertion failures.
 *
 * Suitable for display in UI toast/modal when `isLighthouseError()` returns true.
 */
export declare const LIGHTHOUSE_USER_MESSAGE: string;
/**
 * Classify an error and return an appropriate user-facing message.
 *
 * If the error is from Lighthouse, returns the Lighthouse-specific message.
 * Otherwise returns `null` (callers should use their own error display).
 *
 * @param error - An Error, string, or logs array.
 * @returns User-facing message string, or `null` if not a Lighthouse error.
 */
export declare function classifyLighthouseError(error: unknown): string | null;
