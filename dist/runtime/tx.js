import {
  TransactionInstruction,
  Transaction,
  ComputeBudgetProgram
} from "@solana/web3.js";
import { parseErrorFromLogs } from "../abi/errors.js";
const CONFIRMATION_RANK = {
  processed: 0,
  confirmed: 1,
  finalized: 2
};
function requiredConfirmationRank(commitment) {
  switch (commitment) {
    case "confirmed":
    case "single":
    case "singleGossip":
      return CONFIRMATION_RANK.confirmed;
    case "finalized":
    case "max":
    case "root":
      return CONFIRMATION_RANK.finalized;
    case "processed":
    case "recent":
    default:
      return CONFIRMATION_RANK.processed;
  }
}
function meetsCommitment(observed, required) {
  if (!observed) return false;
  return CONFIRMATION_RANK[observed] >= requiredConfirmationRank(required);
}
function buildIx(params) {
  return new TransactionInstruction({
    programId: params.programId,
    keys: params.keys,
    // TransactionInstruction types expect Buffer, but Uint8Array works at runtime.
    // Cast to avoid Buffer polyfill issues in the browser.
    data: params.data
  });
}
const MAX_COMPUTE_UNIT_LIMIT = 14e5;
const V17_WRAPPER_HEAP_FRAME_BYTES = 128 * 1024;
const MIN_HEAP_FRAME_BYTES = 32 * 1024;
const MAX_HEAP_FRAME_BYTES = 256 * 1024;
async function simulateOrSend(params) {
  const {
    connection,
    ix,
    signers,
    simulate,
    commitment,
    computeUnitLimit,
    heapFrameBytes = V17_WRAPPER_HEAP_FRAME_BYTES
  } = params;
  const effectiveCommitment = commitment ?? (simulate ? "confirmed" : "finalized");
  if (typeof simulate !== "boolean") {
    throw new Error("simulateOrSend: simulate must be explicitly set to true or false");
  }
  if (!signers.length) {
    throw new Error("simulateOrSend: at least one signer is required");
  }
  if (computeUnitLimit !== void 0) {
    if (typeof computeUnitLimit !== "number" || !Number.isInteger(computeUnitLimit) || computeUnitLimit < 1 || computeUnitLimit > MAX_COMPUTE_UNIT_LIMIT) {
      throw new Error(
        `computeUnitLimit must be an integer in [1, ${MAX_COMPUTE_UNIT_LIMIT}]`
      );
    }
  }
  if (heapFrameBytes !== 0) {
    if (typeof heapFrameBytes !== "number" || !Number.isInteger(heapFrameBytes) || heapFrameBytes % 1024 !== 0 || heapFrameBytes < MIN_HEAP_FRAME_BYTES || heapFrameBytes > MAX_HEAP_FRAME_BYTES) {
      throw new Error(
        `heapFrameBytes must be 0 or a multiple of 1024 in [${MIN_HEAP_FRAME_BYTES}, ${MAX_HEAP_FRAME_BYTES}]`
      );
    }
  }
  const tx = new Transaction();
  if (heapFrameBytes !== 0) {
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: heapFrameBytes }));
  }
  if (computeUnitLimit !== void 0) {
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnitLimit
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
      let err = null;
      let hint;
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
        unitsConsumed: result.value.unitsConsumed ?? void 0
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        signature: "(simulated)",
        slot: 0,
        err: message,
        logs: []
      };
    }
  }
  const options = {
    skipPreflight: false,
    preflightCommitment: effectiveCommitment
  };
  let signature;
  try {
    signature = await connection.sendTransaction(tx, signers, options);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      signature: "",
      slot: 0,
      err: message,
      logs: []
    };
  }
  const txFinality = effectiveCommitment === "finalized" ? "finalized" : "confirmed";
  try {
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      },
      effectiveCommitment
    );
    const txInfo = await connection.getTransaction(signature, {
      commitment: txFinality,
      maxSupportedTransactionVersion: 0
    });
    const logs = txInfo?.meta?.logMessages ?? [];
    let err = null;
    let hint;
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
      logs
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      const status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true
      });
      if (status.value && meetsCommitment(status.value.confirmationStatus, effectiveCommitment)) {
        const txInfo = await connection.getTransaction(signature, {
          commitment: txFinality,
          maxSupportedTransactionVersion: 0
        });
        const logs = txInfo?.meta?.logMessages ?? [];
        let err = null;
        let hint;
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
          // `SignatureStatus.slot` is the slot the transaction was PROCESSED in.
          // `status.context.slot` is the RPC's head slot at query time — a
          // different, much later number — so it must not be used as the tx slot.
          slot: txInfo?.slot ?? status.value.slot,
          err,
          hint,
          logs
        };
      }
      if (status.value) {
        const observed = status.value.confirmationStatus ?? "unknown";
        return {
          signature,
          slot: status.value.slot,
          err: `confirmation status unknown (${message}) \u2014 transaction is only "${observed}" but "${effectiveCommitment}" was required; it may still be dropped or may settle. Check signature ${signature} before retrying`,
          logs: []
        };
      }
    } catch {
    }
    return {
      signature,
      slot: 0,
      err: `confirmation status unknown (${message}) \u2014 the transaction may have already landed; check signature ${signature} before retrying`,
      logs: []
    };
  }
}
function formatResult(result, jsonMode) {
  if (jsonMode) {
    return JSON.stringify(result, null, 2);
  }
  const lines = [];
  if (result.err) {
    lines.push(`Error: ${result.err}`);
    if (result.hint) {
      lines.push(`Hint: ${result.hint}`);
    }
    if (result.unitsConsumed !== void 0) {
      lines.push(`Compute Units: ${result.unitsConsumed.toLocaleString()}`);
    }
    if (result.logs.length > 0) {
      lines.push("Logs:");
      result.logs.forEach((log) => lines.push(`  ${log}`));
    }
  } else {
    lines.push(`Signature: ${result.signature}`);
    lines.push(`Slot: ${result.slot}`);
    if (result.unitsConsumed !== void 0) {
      lines.push(`Compute Units: ${result.unitsConsumed.toLocaleString()}`);
    }
    if (result.signature !== "(simulated)") {
      lines.push(`Explorer: https://explorer.solana.com/tx/${result.signature}`);
    }
  }
  return lines.join("\n");
}
export {
  V17_WRAPPER_HEAP_FRAME_BYTES,
  buildIx,
  formatResult,
  simulateOrSend
};
//# sourceMappingURL=tx.js.map