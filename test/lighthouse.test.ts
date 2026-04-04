import { describe, it, expect } from "vitest";
import { PublicKey, TransactionInstruction, Transaction } from "@solana/web3.js";
import {
  LIGHTHOUSE_PROGRAM_ID,
  LIGHTHOUSE_PROGRAM_ID_STR,
  LIGHTHOUSE_CONSTRAINT_ADDRESS,
  isLighthouseInstruction,
  isLighthouseError,
  isLighthouseFailureInLogs,
  stripLighthouseInstructions,
  stripLighthouseFromTransaction,
  countLighthouseInstructions,
  classifyLighthouseError,
  LIGHTHOUSE_USER_MESSAGE,
} from "../src/runtime/lighthouse.js";

import {
  parseErrorFromLogs,
  isAnchorErrorCode,
} from "../src/abi/errors.js";

// ============================================================================
// Helpers
// ============================================================================

const PERCOLATOR_PROGRAM_ID = new PublicKey("PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD");
const SOME_SLAB = new PublicKey("ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv");

function makeLighthouseIx(): TransactionInstruction {
  return new TransactionInstruction({
    programId: LIGHTHOUSE_PROGRAM_ID,
    keys: [{ pubkey: SOME_SLAB, isSigner: false, isWritable: false }],
    data: Buffer.from([0x01, 0x02, 0x03]), // arbitrary assertion data
  });
}

function makePercolatorIx(): TransactionInstruction {
  return new TransactionInstruction({
    programId: PERCOLATOR_PROGRAM_ID,
    keys: [{ pubkey: SOME_SLAB, isSigner: false, isWritable: true }],
    data: Buffer.from([0x06, 0x00, 0x00, 0x01, 0x00]), // TradeCpi example
  });
}

// ============================================================================
// Constants
// ============================================================================

describe("Lighthouse constants", () => {
  it("LIGHTHOUSE_PROGRAM_ID matches base58 string", () => {
    expect(LIGHTHOUSE_PROGRAM_ID.toBase58()).toBe(LIGHTHOUSE_PROGRAM_ID_STR);
  });

  it("LIGHTHOUSE_CONSTRAINT_ADDRESS is 0x1900 (6400)", () => {
    expect(LIGHTHOUSE_CONSTRAINT_ADDRESS).toBe(0x1900);
    expect(LIGHTHOUSE_CONSTRAINT_ADDRESS).toBe(6400);
  });
});

// ============================================================================
// isLighthouseInstruction
// ============================================================================

describe("isLighthouseInstruction", () => {
  it("returns true for a Lighthouse instruction", () => {
    expect(isLighthouseInstruction(makeLighthouseIx())).toBe(true);
  });

  it("returns false for a Percolator instruction", () => {
    expect(isLighthouseInstruction(makePercolatorIx())).toBe(false);
  });
});

// ============================================================================
// isLighthouseError
// ============================================================================

describe("isLighthouseError", () => {
  it("detects 0x1900 in error message", () => {
    expect(isLighthouseError("custom program error: 0x1900")).toBe(true);
    expect(isLighthouseError("failed: custom program error: 0x1900")).toBe(true);
    expect(isLighthouseError("custom program error: 0X1900")).toBe(true);
  });

  it("detects Lighthouse program ID in error message", () => {
    expect(
      isLighthouseError(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed: something`),
    ).toBe(true);
  });

  it("detects JSON InstructionError format with Custom:6400", () => {
    const jsonErr = '{"InstructionError":[3,{"Custom":6400}]}';
    expect(isLighthouseError(jsonErr)).toBe(true);
  });

  it("does NOT flag Percolator error codes", () => {
    expect(isLighthouseError("custom program error: 0x0")).toBe(false);
    expect(isLighthouseError("custom program error: 0x10")).toBe(false);
    expect(isLighthouseError('{"Custom":16}')).toBe(false);
  });

  it("handles Error objects", () => {
    expect(isLighthouseError(new Error("custom program error: 0x1900"))).toBe(true);
    expect(isLighthouseError(new Error("some other error"))).toBe(false);
  });

  it("handles null/undefined", () => {
    expect(isLighthouseError(null)).toBe(false);
    expect(isLighthouseError(undefined)).toBe(false);
  });
});

// ============================================================================
// isLighthouseFailureInLogs
// ============================================================================

describe("isLighthouseFailureInLogs", () => {
  it("detects Lighthouse failure in program invocation chain", () => {
    const logs = [
      "Program PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD invoke [1]",
      "Program log: Instruction: TradeCpiV2",
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} invoke [2]`,
      "Program log: Result (Failed): Some(323312) == Some(0)",
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed: custom program error: 0x1900`,
    ];
    expect(isLighthouseFailureInLogs(logs)).toBe(true);
  });

  it("does NOT flag when Lighthouse succeeds", () => {
    const logs = [
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} invoke [1]`,
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} success`,
      "Program PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD invoke [2]",
      "Program PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD success",
    ];
    expect(isLighthouseFailureInLogs(logs)).toBe(false);
  });

  it("handles empty/null logs", () => {
    expect(isLighthouseFailureInLogs([])).toBe(false);
    expect(isLighthouseFailureInLogs(null as unknown as string[])).toBe(false);
  });

  it("detects explicit Lighthouse failed line", () => {
    const logs = [
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed: custom program error: 0x1790`,
    ];
    expect(isLighthouseFailureInLogs(logs)).toBe(true);
  });
});

// ============================================================================
// stripLighthouseInstructions
// ============================================================================

describe("stripLighthouseInstructions", () => {
  it("removes Lighthouse instructions, keeps Percolator ones", () => {
    const ixs = [makeLighthouseIx(), makePercolatorIx(), makeLighthouseIx()];
    const clean = stripLighthouseInstructions(ixs);
    expect(clean).toHaveLength(1);
    expect(clean[0].programId.equals(PERCOLATOR_PROGRAM_ID)).toBe(true);
  });

  it("returns same array reference if no Lighthouse instructions", () => {
    const ixs = [makePercolatorIx()];
    const clean = stripLighthouseInstructions(ixs);
    // Note: filter always returns a new array, but contents should match
    expect(clean).toHaveLength(1);
    expect(clean[0].programId.equals(PERCOLATOR_PROGRAM_ID)).toBe(true);
  });

  it("returns empty array if all instructions are Lighthouse", () => {
    const ixs = [makeLighthouseIx(), makeLighthouseIx()];
    const clean = stripLighthouseInstructions(ixs);
    expect(clean).toHaveLength(0);
  });

  it("handles empty array", () => {
    expect(stripLighthouseInstructions([])).toHaveLength(0);
  });
});

// ============================================================================
// stripLighthouseFromTransaction
// ============================================================================

describe("stripLighthouseFromTransaction", () => {
  it("returns same transaction if no Lighthouse instructions", () => {
    const tx = new Transaction();
    tx.add(makePercolatorIx());
    const result = stripLighthouseFromTransaction(tx);
    expect(result).toBe(tx); // same reference
  });

  it("creates new transaction without Lighthouse instructions", () => {
    const tx = new Transaction();
    tx.recentBlockhash = "11111111111111111111111111111111";
    tx.feePayer = SOME_SLAB;
    tx.add(makeLighthouseIx());
    tx.add(makePercolatorIx());
    tx.add(makeLighthouseIx());

    const clean = stripLighthouseFromTransaction(tx);
    expect(clean).not.toBe(tx);
    expect(clean.instructions).toHaveLength(1);
    expect(clean.instructions[0].programId.equals(PERCOLATOR_PROGRAM_ID)).toBe(true);
    expect(clean.recentBlockhash).toBe(tx.recentBlockhash);
    expect(clean.feePayer?.equals(SOME_SLAB)).toBe(true);
  });
});

// ============================================================================
// countLighthouseInstructions
// ============================================================================

describe("countLighthouseInstructions", () => {
  it("counts Lighthouse instructions in array", () => {
    const ixs = [makeLighthouseIx(), makePercolatorIx(), makeLighthouseIx()];
    expect(countLighthouseInstructions(ixs)).toBe(2);
  });

  it("counts Lighthouse instructions in Transaction", () => {
    const tx = new Transaction();
    tx.add(makeLighthouseIx());
    tx.add(makePercolatorIx());
    expect(countLighthouseInstructions(tx)).toBe(1);
  });

  it("returns 0 when none present", () => {
    expect(countLighthouseInstructions([makePercolatorIx()])).toBe(0);
    expect(countLighthouseInstructions([])).toBe(0);
  });
});

// ============================================================================
// classifyLighthouseError
// ============================================================================

describe("classifyLighthouseError", () => {
  it("returns user message for Lighthouse errors", () => {
    const msg = classifyLighthouseError("custom program error: 0x1900");
    expect(msg).toBe(LIGHTHOUSE_USER_MESSAGE);
  });

  it("returns null for non-Lighthouse errors", () => {
    expect(classifyLighthouseError("custom program error: 0x10")).toBeNull();
    expect(classifyLighthouseError("some random error")).toBeNull();
  });
});

// ============================================================================
// parseErrorFromLogs — Lighthouse classification
// ============================================================================

describe("parseErrorFromLogs — Lighthouse vs Percolator", () => {
  it("classifies 0x1900 as Lighthouse when inside Lighthouse invocation", () => {
    const logs = [
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} invoke [1]`,
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed: custom program error: 0x1900`,
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0x1900);
    expect(result!.name).toContain("Lighthouse");
    expect(result!.source).toBe("lighthouse");
    expect(result!.hint).toContain("Blowfish");
  });

  it("classifies 0x1900 as Lighthouse even without explicit invocation tracking", () => {
    // The code is in the Anchor range (>= 0x1770), so it's always classified as Lighthouse
    const logs = [
      "Program failed: custom program error: 0x1900",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("lighthouse");
  });

  it("classifies 0x1790 (ConstraintMut) as Lighthouse", () => {
    const logs = [
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed: custom program error: 0x1790`,
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0x1790);
    expect(result!.name).toBe("Lighthouse:ConstraintMut");
    expect(result!.source).toBe("lighthouse");
  });

  it("classifies Percolator error 0x10 correctly", () => {
    const logs = [
      "Program PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD failed: custom program error: 0x10",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(16);
    expect(result!.name).toBe("EngineInvalidMatchingEngine");
    expect(result!.source).toBe("percolator");
  });

  it("classifies Percolator ADL errors (61-65)", () => {
    for (const code of [61, 62, 63, 64, 65]) {
      const hex = code.toString(16);
      const logs = [
        `Program failed: custom program error: 0x${hex}`,
      ];
      const result = parseErrorFromLogs(logs);
      expect(result).not.toBeNull();
      expect(result!.code).toBe(code);
      expect(result!.source).toBe("percolator");
    }
  });

  it("returns source=unknown for codes outside both ranges", () => {
    const logs = [
      "Program failed: custom program error: 0xBEEF",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0xBEEF);
    expect(result!.source).toBe("unknown");
  });
});

// ============================================================================
// isAnchorErrorCode
// ============================================================================

describe("isAnchorErrorCode", () => {
  it("returns true for Anchor error range", () => {
    expect(isAnchorErrorCode(0x1770)).toBe(true);
    expect(isAnchorErrorCode(0x1900)).toBe(true);
    expect(isAnchorErrorCode(0x1FFF)).toBe(true);
  });

  it("returns false for Percolator error codes", () => {
    expect(isAnchorErrorCode(0)).toBe(false);
    expect(isAnchorErrorCode(16)).toBe(false);
    expect(isAnchorErrorCode(65)).toBe(false);
  });

  it("returns false for codes above Anchor range", () => {
    expect(isAnchorErrorCode(0x2000)).toBe(false);
    expect(isAnchorErrorCode(0xBEEF)).toBe(false);
  });
});

// ============================================================================
// Real-world scenario: PERC-8442 reproduction
// ============================================================================

describe("PERC-8442: L2TEx 0x1900 on ESa89R5 slab", () => {
  it("correctly identifies the real-world failure as Lighthouse, not Percolator", () => {
    // Actual log pattern from mainnet Apr 3-4 2026
    const logs = [
      "Program ComputeBudget111111111111111111111111111111 invoke [1]",
      "Program ComputeBudget111111111111111111111111111111 success",
      "Program PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD invoke [1]",
      "Program log: Instruction: KeeperCrank",
      "Program PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD success",
      "Program PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD invoke [1]",
      "Program log: Instruction: TradeCpiV2",
      "Program PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD success",
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} invoke [1]`,
      "Program log: Result (Failed): Some(323312) == Some(0)",
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed: custom program error: 0x1900`,
    ];

    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0x1900);
    expect(result!.source).toBe("lighthouse");
    expect(result!.name).toContain("Lighthouse");
    expect(result!.name).toContain("ConstraintAddress");

    // isLighthouseFailureInLogs should also detect it
    expect(isLighthouseFailureInLogs(logs)).toBe(true);
  });

  it("instruction stripping prevents the failure", () => {
    // Simulate what a wallet injects: Lighthouse assertion after trade
    const ixs = [
      makePercolatorIx(), // KeeperCrank
      makePercolatorIx(), // TradeCpiV2
      makeLighthouseIx(), // Injected assertion on ESa89R5 slab
    ];

    expect(countLighthouseInstructions(ixs)).toBe(1);

    const clean = stripLighthouseInstructions(ixs);
    expect(clean).toHaveLength(2);
    expect(countLighthouseInstructions(clean)).toBe(0);

    // All remaining instructions are Percolator
    for (const ix of clean) {
      expect(ix.programId.equals(PERCOLATOR_PROGRAM_ID)).toBe(true);
    }
  });

  it("error classification gives actionable user message", () => {
    const error = new Error(
      'Transaction simulation failed: {"InstructionError":[3,{"Custom":6400}]}\n' +
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed: custom program error: 0x1900`,
    );

    expect(isLighthouseError(error)).toBe(true);

    const userMsg = classifyLighthouseError(error);
    expect(userMsg).not.toBeNull();
    expect(userMsg).toContain("Blowfish");
    expect(userMsg).toContain("Lighthouse");
    expect(userMsg).toContain("Backpack");
  });
});
