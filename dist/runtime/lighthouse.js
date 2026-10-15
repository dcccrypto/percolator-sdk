import { PublicKey, Transaction } from "@solana/web3.js";
const LIGHTHOUSE_PROGRAM_ID = new PublicKey(
  "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95"
);
const LIGHTHOUSE_PROGRAM_ID_STR = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
const LIGHTHOUSE_CONSTRAINT_ADDRESS = 6400;
const LIGHTHOUSE_ERROR_CODES = /* @__PURE__ */ new Set([
  6e3,
  // InstructionMissing
  6001,
  // InstructionFallbackNotFound
  6002,
  // InstructionDidNotDeserialize
  6003,
  // InstructionDidNotSerialize
  6016,
  // IdlInstructionStub
  6032,
  // ConstraintMut
  6033,
  // ConstraintHasOne
  6034,
  // ConstraintSigner
  6035,
  // ConstraintRaw
  6036,
  // ConstraintOwner
  6037,
  // ConstraintRentExempt
  6038,
  // ConstraintSeeds
  6039,
  // ConstraintExecutable
  6040,
  // ConstraintState
  6041,
  // ConstraintAssociated
  6042,
  // ConstraintAssociatedInit
  6043,
  // ConstraintClose
  6400
  // ConstraintAddress (the one we hit most often)
]);
function isLighthouseInstruction(ix) {
  return ix.programId.equals(LIGHTHOUSE_PROGRAM_ID);
}
function isLighthouseError(error) {
  const msg = extractErrorMessage(error);
  if (!msg) return false;
  if (msg.includes(LIGHTHOUSE_PROGRAM_ID_STR)) return true;
  if (/custom\s+program\s+error:\s*0x1900\b/i.test(msg)) return true;
  if (/"Custom"\s*:\s*6400\b/.test(msg) && /InstructionError/i.test(msg)) return true;
  return false;
}
function isLighthouseFailureInLogs(logs) {
  if (!Array.isArray(logs)) return false;
  let lighthouseDepth = 0;
  for (const line of logs) {
    if (typeof line !== "string") continue;
    if (line.includes(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} invoke`)) {
      lighthouseDepth++;
      continue;
    }
    if (line.includes(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} success`)) {
      if (lighthouseDepth > 0) lighthouseDepth--;
      continue;
    }
    if (line.includes(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed`)) {
      return true;
    }
  }
  return false;
}
function stripLighthouseInstructions(instructions, percolatorProgramId) {
  if (percolatorProgramId) {
    const hasPercolatorIx = instructions.some(
      (ix) => ix.programId.equals(percolatorProgramId)
    );
    if (!hasPercolatorIx) {
      return instructions;
    }
  }
  return instructions.filter((ix) => !isLighthouseInstruction(ix));
}
function stripLighthouseFromTransaction(transaction, percolatorProgramId) {
  if (percolatorProgramId) {
    const hasPercolatorIx = transaction.instructions.some(
      (ix) => ix.programId.equals(percolatorProgramId)
    );
    if (!hasPercolatorIx) return transaction;
  }
  const hasLighthouse = transaction.instructions.some(isLighthouseInstruction);
  if (!hasLighthouse) return transaction;
  const clean = new Transaction();
  clean.recentBlockhash = transaction.recentBlockhash;
  clean.feePayer = transaction.feePayer;
  for (const ix of transaction.instructions) {
    if (!isLighthouseInstruction(ix)) {
      clean.add(ix);
    }
  }
  return clean;
}
function countLighthouseInstructions(ixsOrTx) {
  const instructions = Array.isArray(ixsOrTx) ? ixsOrTx : ixsOrTx.instructions;
  return instructions.filter(isLighthouseInstruction).length;
}
const LIGHTHOUSE_USER_MESSAGE = "Your wallet's transaction guard (Blowfish/Lighthouse) is blocking this transaction. This is a known compatibility issue \u2014 the transaction itself is valid. Try one of these workarounds:\n1. Disable transaction simulation in your wallet settings\n2. Use a wallet without Blowfish protection (e.g., Backpack, Solflare)\n3. The SDK will automatically retry without the guard";
function classifyLighthouseError(error) {
  if (isLighthouseError(error)) {
    return LIGHTHOUSE_USER_MESSAGE;
  }
  return null;
}
function extractErrorMessage(error) {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return null;
  }
}
export {
  LIGHTHOUSE_CONSTRAINT_ADDRESS,
  LIGHTHOUSE_ERROR_CODES,
  LIGHTHOUSE_PROGRAM_ID,
  LIGHTHOUSE_PROGRAM_ID_STR,
  LIGHTHOUSE_USER_MESSAGE,
  classifyLighthouseError,
  countLighthouseInstructions,
  isLighthouseError,
  isLighthouseFailureInLogs,
  isLighthouseInstruction,
  stripLighthouseFromTransaction,
  stripLighthouseInstructions
};
//# sourceMappingURL=lighthouse.js.map