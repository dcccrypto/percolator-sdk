import {
  Connection,
  PublicKey,
  TransactionInstruction,
  Transaction,
  Keypair,
  SendOptions,
  Commitment,
  AccountMeta,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { parseErrorFromLogs } from "../abi/errors.js";

export interface BuildIxParams {
  programId: PublicKey;
  keys: AccountMeta[];
  data: Uint8Array | Buffer;
}

/**
 * Build a transaction instruction.
 */
export function buildIx(params: BuildIxParams): TransactionInstruction {
  return new TransactionInstruction({
    programId: params.programId,
    keys: params.keys,
    // TransactionInstruction types expect Buffer, but Uint8Array works at runtime.
    // Cast to avoid Buffer polyfill issues in the browser.
    data: params.data as Buffer,
  });
}

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
  computeUnitLimit?: number; // Custom compute unit limit (default: 200,000, max: 1,400,000)
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
 * Simulate or send a transaction.
 * Returns consistent output for both modes.
 */
/** Solana per-transaction compute unit ceiling (Compute Budget program). */
const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;

/**
 * The v17 wrapper's installed heap-frame size. EVERY transaction that touches the wrapper
 * MUST request this much heap or it aborts on-chain (#176). Default for `heapFrameBytes`.
 */
export const V17_WRAPPER_HEAP_FRAME_BYTES = 128 * 1024;
/** Compute Budget heap-frame bounds: [32 KB, 256 KB], must be a multiple of 1024. */
const MIN_HEAP_FRAME_BYTES = 32 * 1024;
const MAX_HEAP_FRAME_BYTES = 256 * 1024;

export async function simulateOrSend(
  params: SimulateOrSendParams
): Promise<TxResult> {
  const {
    connection,
    ix,
    signers,
    simulate,
    commitment,
    computeUnitLimit,
    heapFrameBytes = V17_WRAPPER_HEAP_FRAME_BYTES,
  } = params;
  // #311: default actual sends to "finalized" so callers don't treat a "confirmed" (but not
  // yet finalized) transaction as settled — a reorg within the ~13s finalization window can
  // reverse it. Simulation-only calls keep "confirmed" (no on-chain state mutated).
  const effectiveCommitment = commitment ?? (simulate ? "confirmed" : "finalized");

  if (typeof simulate !== "boolean") {
    throw new Error("simulateOrSend: simulate must be explicitly set to true or false");
  }

  if (!signers.length) {
    throw new Error("simulateOrSend: at least one signer is required");
  }

  if (computeUnitLimit !== undefined) {
    if (
      typeof computeUnitLimit !== "number" ||
      !Number.isInteger(computeUnitLimit) ||
      computeUnitLimit < 1 ||
      computeUnitLimit > MAX_COMPUTE_UNIT_LIMIT
    ) {
      throw new Error(
        `computeUnitLimit must be an integer in [1, ${MAX_COMPUTE_UNIT_LIMIT}]`,
      );
    }
  }

  if (heapFrameBytes !== 0) {
    if (
      typeof heapFrameBytes !== "number" ||
      !Number.isInteger(heapFrameBytes) ||
      heapFrameBytes % 1024 !== 0 ||
      heapFrameBytes < MIN_HEAP_FRAME_BYTES ||
      heapFrameBytes > MAX_HEAP_FRAME_BYTES
    ) {
      throw new Error(
        `heapFrameBytes must be 0 or a multiple of 1024 in [${MIN_HEAP_FRAME_BYTES}, ${MAX_HEAP_FRAME_BYTES}]`,
      );
    }
  }

  const tx = new Transaction();

  // #176: the v17 wrapper needs a 128 KB heap frame on every tx (its BumpAllocator's first
  // allocation lands near heap_base+128KB). Request it by default so wrapper calls don't
  // abort on-chain; callers send `heapFrameBytes: 0` to opt out for non-wrapper txs.
  if (heapFrameBytes !== 0) {
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: heapFrameBytes }));
  }

  // Add compute budget instruction if custom limit is specified
  if (computeUnitLimit !== undefined) {
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnitLimit,
      })
    );
  }

  tx.add(ix);
  const latestBlockhash = await connection.getLatestBlockhash(effectiveCommitment);
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = signers[0].publicKey;

  if (simulate) {
    try {
      tx.sign(...signers);
      const result = await connection.simulateTransaction(tx, signers);
      const logs = result.value.logs ?? [];
      let err: string | null = null;
      let hint: string | undefined;

      if (result.value.err) {
        const parsed = parseErrorFromLogs(logs);
        if (parsed) {
          err = `${parsed.name} (0x${parsed.code.toString(16)})`;
          hint = parsed.hint;
        } else {
          err = JSON.stringify(result.value.err);
        }
      }

      return {
        signature: "(simulated)",
        slot: result.context.slot,
        err,
        hint,
        logs,
        unitsConsumed: result.value.unitsConsumed ?? undefined,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        signature: "(simulated)",
        slot: 0,
        err: message,
        logs: [],
      };
    }
  }

  // Send
  const options: SendOptions = {
    skipPreflight: false,
    preflightCommitment: effectiveCommitment,
  };

  // sendTransaction is its own try/catch: only here is it true that no
  // signature was ever produced, so signature: "" is the correct result.
  let signature: string;
  try {
    signature = await connection.sendTransaction(tx, signers, options);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      signature: "",
      slot: 0,
      err: message,
      logs: [],
    };
  }

  // Fetch logs at the same finality level used for confirmation.
  // getTransaction only accepts Finality ("confirmed" | "finalized"); map anything
  // weaker than "finalized" to "confirmed" — the safest valid fallback.
  const txFinality = effectiveCommitment === "finalized" ? "finalized" : "confirmed";

  try {
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      effectiveCommitment
    );

    const txInfo = await connection.getTransaction(signature, {
      commitment: txFinality,
      maxSupportedTransactionVersion: 0,
    });

    const logs = txInfo?.meta?.logMessages ?? [];
    let err: string | null = null;
    let hint: string | undefined;

    if (confirmation.value.err) {
      const parsed = parseErrorFromLogs(logs);
      if (parsed) {
        err = `${parsed.name} (0x${parsed.code.toString(16)})`;
        hint = parsed.hint;
      } else {
        err = JSON.stringify(confirmation.value.err);
      }
    }

    return {
      signature,
      slot: txInfo?.slot ?? 0,
      err,
      hint,
      logs,
    };
  } catch (e: unknown) {
    // confirmTransaction/getTransaction threw (e.g. TransactionExpiredBlockheightExceededError
    // on an ordinary RPC timeout) — this does NOT mean the transaction failed to land,
    // only that we didn't observe confirmation in time. Previously this branch discarded
    // the real signature obtained above and returned signature: "", which left the caller
    // with no way to check whether it's safe to retry — for a non-idempotent operation
    // (deposit/withdraw/trade) a naive retry-on-error could then double-submit a
    // transaction that had actually already landed. Check the real on-chain status before
    // reporting failure, and always return the real signature so the caller can verify
    // it themselves even if this fallback check also fails.
    const message = e instanceof Error ? e.message : String(e);
    try {
      const status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });
      if (status.value) {
        const txInfo = await connection.getTransaction(signature, {
          commitment: txFinality,
          maxSupportedTransactionVersion: 0,
        });
        const logs = txInfo?.meta?.logMessages ?? [];
        let err: string | null = null;
        let hint: string | undefined;
        if (status.value.err) {
          const parsed = parseErrorFromLogs(logs);
          if (parsed) {
            err = `${parsed.name} (0x${parsed.code.toString(16)})`;
            hint = parsed.hint;
          } else {
            err = JSON.stringify(status.value.err);
          }
        }
        return {
          signature,
          slot: txInfo?.slot ?? status.context.slot,
          err,
          hint,
          logs,
        };
      }
    } catch {
      // Status lookup itself failed too — fall through to the ambiguous result below,
      // which still carries the real signature instead of discarding it.
    }
    return {
      signature,
      slot: 0,
      err: `confirmation status unknown (${message}) — the transaction may have already landed; check signature ${signature} before retrying`,
      logs: [],
    };
  }
}

/**
 * Format transaction result for output.
 */
export function formatResult(result: TxResult, jsonMode: boolean): string {
  if (jsonMode) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  if (result.err) {
    lines.push(`Error: ${result.err}`);
    if (result.hint) {
      lines.push(`Hint: ${result.hint}`);
    }
    if (result.unitsConsumed !== undefined) {
      lines.push(`Compute Units: ${result.unitsConsumed.toLocaleString()}`);
    }
    if (result.logs.length > 0) {
      lines.push("Logs:");
      result.logs.forEach((log) => lines.push(`  ${log}`));
    }
  } else {
    lines.push(`Signature: ${result.signature}`);
    lines.push(`Slot: ${result.slot}`);
    if (result.unitsConsumed !== undefined) {
      lines.push(`Compute Units: ${result.unitsConsumed.toLocaleString()}`);
    }
    if (result.signature !== "(simulated)") {
      lines.push(`Explorer: https://explorer.solana.com/tx/${result.signature}`);
    }
  }

  return lines.join("\n");
}
