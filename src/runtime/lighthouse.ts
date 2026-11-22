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
 * The slab IS initialised, so the assertion fails with error 0x1900 (Lighthouse multi-assert AssertionFailed
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

// ============================================================================
// Constants
// ============================================================================

/**
 * Lighthouse v2 program ID (Blowfish/Phantom wallet guard).
 *
 * This is an immutable native program deployed at slot 294,179,293.
 * Wallets like Phantom inject instructions from this program into user
 * transactions to enforce Blowfish security assertions.
 */
export const LIGHTHOUSE_PROGRAM_ID = new PublicKey(
  "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95",
);

/** Base58 string form for fast comparison without PublicKey instantiation. */
export const LIGHTHOUSE_PROGRAM_ID_STR = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";

/**
 * Lighthouse multi-assert AssertionFailed at assertion index 0 (0x1900 = 6400).
 * Lighthouse maps a failed assertion i of a multi-assert instruction to
 * Custom(0x1900 + i) (`map_multi_err`). It is NOT an Anchor code and NOT a
 * Percolator error. (Name kept for compatibility.)
 */
export const LIGHTHOUSE_CONSTRAINT_ADDRESS = 0x1900;

/**
 * Lighthouse's own custom error codes: `LighthouseError` 6000..6016 plus
 * 0x1900 (multi-assert index 0; index i is 0x1900 + i). Lighthouse is a native
 * program, not Anchor. Source: Jac0xb/lighthouse@4c579479
 * programs/lighthouse/src/error.rs:23-78.
 */
export const LIGHTHOUSE_ERROR_CODES = new Set([
  0x1770, // 6000 InvalidInstructionData
  0x1771, // 6001 AssertionFailed (single assertion)
  0x1772, // 6002 NotEnoughAccounts
  0x1773, // 6003 BumpNotFound
  0x1774, // 6004 AccountBorrowFailed
  0x1775, // 6005 RangeOutOfBounds
  0x1776, // 6006 IndexOutOfBounds
  0x1777, // 6007 FailedToDeserialize
  0x1778, // 6008 FailedToSerialize
  0x1779, // 6009 AccountOwnerMismatch
  0x177a, // 6010 AccountKeyMismatch
  0x177b, // 6011 AccountNotInitialized
  0x177c, // 6012 AccountOwnerValidationFailed
  0x177d, // 6013 AccountFundedValidationFailed
  0x177e, // 6014 AccountDiscriminatorValidationFailed
  0x177f, // 6015 AccountValidationFailed
  0x1780, // 6016 CrossProgramInvokeViolation
  0x1900, // 6400 AssertionFailed, multi-assert index 0 (the one we hit most often)
] as const);

// ============================================================================
// Detection
// ============================================================================

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
export function isLighthouseInstruction(ix: TransactionInstruction): boolean {
  return ix.programId.equals(LIGHTHOUSE_PROGRAM_ID);
}

/**
 * Check if an error message or error object indicates a Lighthouse assertion failure.
 *
 * Detects:
 * - `custom program error: 0x1900` (Lighthouse multi-assert AssertionFailed)
 * - References to the Lighthouse program ID in error text
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
export function isLighthouseError(error: unknown): boolean {
  const msg = extractErrorMessage(error);
  if (!msg) return false;

  // A 0x1900 / 6400 code attributed to another program (e.g. Anchor
  // ConstraintAddress in a stake/matcher/DEX program) is not Lighthouse.
  // If the message names failing programs, only Lighthouse failing counts.
  const failed = [...msg.matchAll(/Program\s+([1-9A-HJ-NP-Za-km-z]{32,44})\s+failed/g)];
  if (failed.length > 0) {
    return failed.some((m) => m[1] === LIGHTHOUSE_PROGRAM_ID_STR);
  }

  // Direct program ID reference
  if (msg.includes(LIGHTHOUSE_PROGRAM_ID_STR)) return true;

  // 0x1900 hex error code (case-insensitive)
  if (/custom\s+program\s+error:\s*0x1900\b/i.test(msg)) return true;

  // JSON InstructionError format: {"Custom": 6400}
  if (/"Custom"\s*:\s*6400\b/.test(msg) && /InstructionError/i.test(msg)) return true;

  return false;
}

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
export function isLighthouseFailureInLogs(logs: string[]): boolean {
  if (!Array.isArray(logs)) return false;

  let lighthouseDepth = 0;

  for (const line of logs) {
    if (typeof line !== "string") continue;

    // Track Lighthouse program invocation depth
    if (line.includes(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} invoke`)) {
      lighthouseDepth++;
      continue;
    }

    // Lighthouse program returned success — decrement depth
    if (line.includes(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} success`)) {
      if (lighthouseDepth > 0) lighthouseDepth--;
      continue;
    }

    // Only report failure when the Lighthouse program itself explicitly fails
    if (line.includes(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed`)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Stripping / Mitigation
// ============================================================================

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
export function stripLighthouseInstructions(
  instructions: TransactionInstruction[],
  percolatorProgramId?: PublicKey,
): TransactionInstruction[] {
  // When a programId is provided, refuse to strip guards from transactions
  // that don't contain any Percolator instructions — prevents misuse on
  // arbitrary transactions where Lighthouse guards are legitimate protection.
  if (percolatorProgramId) {
    const hasPercolatorIx = instructions.some(
      (ix) => ix.programId.equals(percolatorProgramId),
    );
    if (!hasPercolatorIx) {
      return instructions; // no Percolator instructions — leave guards intact
    }
  }
  return instructions.filter((ix) => !isLighthouseInstruction(ix));
}

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
export function stripLighthouseFromTransaction(
  transaction: Transaction,
  percolatorProgramId?: PublicKey,
): Transaction {
  // When a programId is provided, refuse to strip guards from transactions
  // that don't contain any Percolator instructions.
  if (percolatorProgramId) {
    const hasPercolatorIx = transaction.instructions.some(
      (ix) => ix.programId.equals(percolatorProgramId),
    );
    if (!hasPercolatorIx) return transaction;
  }

  const hasLighthouse = transaction.instructions.some(isLighthouseInstruction);
  if (!hasLighthouse) return transaction;

  const clean = new Transaction();
  clean.recentBlockhash = transaction.recentBlockhash;
  clean.feePayer = transaction.feePayer;
  // Preserve expiry / durable-nonce context so retries can still confirm.
  clean.lastValidBlockHeight = transaction.lastValidBlockHeight;
  clean.nonceInfo = transaction.nonceInfo;
  clean.minNonceContextSlot = transaction.minNonceContextSlot;
  // Old signatures sign the pre-strip message and are invalid now; keep the
  // signer slots (unsigned) so callers know who must re-sign.
  for (const ix of transaction.instructions) {
    if (!isLighthouseInstruction(ix)) {
      clean.add(ix);
    }
  }
  // Only keep slots still required by the remaining message (web3.js throws
  // "unknown signer" otherwise).
  const needed = (pk: PublicKey) =>
    !!clean.feePayer?.equals(pk) ||
    clean.instructions.some((ix) =>
      ix.keys.some((k) => k.isSigner && k.pubkey.equals(pk)),
    );
  clean.signatures = transaction.signatures
    .filter((s) => needed(s.publicKey))
    .map((s) => ({ publicKey: s.publicKey, signature: null }));

  return clean;
}

/**
 * Count Lighthouse instructions in an instruction array or transaction.
 *
 * @param ixsOrTx - Array of instructions or a Transaction.
 * @returns Number of Lighthouse instructions found.
 */
export function countLighthouseInstructions(
  ixsOrTx: TransactionInstruction[] | Transaction,
): number {
  const instructions = Array.isArray(ixsOrTx) ? ixsOrTx : ixsOrTx.instructions;
  return instructions.filter(isLighthouseInstruction).length;
}

// ============================================================================
// User-facing error messages
// ============================================================================

/**
 * User-friendly error message for Lighthouse assertion failures.
 *
 * Suitable for display in UI toast/modal when `isLighthouseError()` returns true.
 */
export const LIGHTHOUSE_USER_MESSAGE =
  "Your wallet's transaction guard (Blowfish/Lighthouse) is blocking this transaction. " +
  "This is a known compatibility issue — the transaction itself is valid. " +
  "Try one of these workarounds:\n" +
  "1. Disable transaction simulation in your wallet settings\n" +
  "2. Use a wallet without Blowfish protection (e.g., Backpack, Solflare)\n" +
  "3. The SDK will automatically retry without the guard";

/**
 * Classify an error and return an appropriate user-facing message.
 *
 * If the error is from Lighthouse, returns the Lighthouse-specific message.
 * Otherwise returns `null` (callers should use their own error display).
 *
 * @param error - An Error, string, or logs array.
 * @returns User-facing message string, or `null` if not a Lighthouse error.
 */
export function classifyLighthouseError(error: unknown): string | null {
  if (isLighthouseError(error)) {
    return LIGHTHOUSE_USER_MESSAGE;
  }
  return null;
}

// ============================================================================
// Internal helpers
// ============================================================================

function extractErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return null;
  }
}
