import { describe, it, expect } from "vitest";
import { Keypair, PublicKey, TransactionInstruction, Transaction } from "@solana/web3.js";
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
  LIGHTHOUSE_ERROR_CODES,
} from "../src/runtime/lighthouse.js";

import {
  parseErrorFromLogs,
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
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed: custom program error: 0x1771`,
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

  it("preserves lastValidBlockHeight, nonceInfo, minNonceContextSlot and signer slots", () => {
    const signer = Keypair.generate();
    const tx = new Transaction();
    tx.recentBlockhash = "11111111111111111111111111111111";
    tx.feePayer = SOME_SLAB;
    tx.lastValidBlockHeight = 123;
    tx.minNonceContextSlot = 77;
    tx.nonceInfo = {
      nonce: "11111111111111111111111111111111",
      nonceInstruction: makePercolatorIx(),
    };
    tx.add(
      new TransactionInstruction({
        programId: PERCOLATOR_PROGRAM_ID,
        keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: false }],
        data: Buffer.alloc(1),
      }),
    );
    tx.add(makeLighthouseIx());
    tx.signatures = [{ publicKey: signer.publicKey, signature: Buffer.alloc(64, 1) }];

    const clean = stripLighthouseFromTransaction(tx);
    expect(clean.lastValidBlockHeight).toBe(123);
    expect(clean.minNonceContextSlot).toBe(77);
    expect(clean.nonceInfo).toBe(tx.nonceInfo);
    expect(clean.signatures).toHaveLength(1);
    expect(clean.signatures[0].publicKey.equals(signer.publicKey)).toBe(true);
    // stale signature must not be carried over (message changed)
    expect(clean.signatures[0].signature).toBeNull();
  });
});

describe("isLighthouseError: foreign-program 0x1900", () => {
  it("is false when another program reports 0x1900", () => {
    expect(
      isLighthouseError(
        "Program Stake11111111111111111111111111111111111 failed: custom program error: 0x1900",
      ),
    ).toBe(false);
  });
  it("is false when Lighthouse only appears as a successful invoke", () => {
    expect(
      isLighthouseError(
        `Program ${LIGHTHOUSE_PROGRAM_ID_STR} invoke [1]\nProgram ${LIGHTHOUSE_PROGRAM_ID_STR} success\n` +
          "Program Stake11111111111111111111111111111111111 failed: custom program error: 0x1900",
      ),
    ).toBe(false);
  });
  it("stays true for Lighthouse program failures", () => {
    expect(
      isLighthouseError(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed: custom program error: 0x1900`),
    ).toBe(true);
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

describe("parseErrorFromLogs — error code extraction", () => {
  it("extracts 0x1900 error code from Lighthouse failure log", () => {
    const logs = [
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} invoke [1]`,
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed: custom program error: 0x1900`,
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0x1900);
    // 0x1900 is not a known Percolator error, so name is Unknown(6400)
    expect(result!.name).toBe("Unknown(6400)");
  });

  it("extracts 0x1900 error code without invocation context", () => {
    const logs = [
      "Program failed: custom program error: 0x1900",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0x1900);
  });

  it("extracts 0x1771 error code", () => {
    const logs = [
      `Program ${LIGHTHOUSE_PROGRAM_ID_STR} failed: custom program error: 0x1771`,
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0x1771);
  });

  it("resolves Percolator error 0x10 to EngineProvenanceMismatch (v17 code 16)", () => {
    // v17: code 16 = EngineProvenanceMismatch (was EngineInvalidMatchingEngine in v12.x)
    const logs = [
      "Program PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD failed: custom program error: 0x10",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(16);
    expect(result!.name).toBe("EngineProvenanceMismatch");
  });

  it("v17: Percolator errors 137+ return Unknown(...) — past the v2.2 error table (104-119 and 123-124 are the Phase 4 block, 120-122 the P2b lock exits)", () => {
    // In v12.x, codes 61-65 were ADL-specific errors (EngineSideBlocked etc.).
    // In v17 none of those MEANINGS survive, but THREE of those ordinals have
    // since been reused: 61 by AssetSlotAlreadyConfigured
    // (percolator-prog@10acb5ae), 62 by CreatorFeeOverClaim (creator-fee claim,
    // tag 90), and 63 by LpVaultBackingBucketNotEmpty (LP-vault reachability
    // guard, DEPLOYED 2026-08-29, wrapper 02326f4f). So only 64-65 are still
    // undefined → Unknown(N).
    //
    // The v12 MEANINGS remaining gone is the invariant; the slots being EMPTY
    // never was. Each reuse narrows this loop by one.
    const named = parseErrorFromLogs(["Program failed: custom program error: 0x5b"]);
    expect(named?.code).toBe(91);
    expect(named?.name).toBe("LpVaultTargetPotImpaired");
    for (const code of [137, 138]) {
      const hex = code.toString(16);
      const logs = [
        `Program failed: custom program error: 0x${hex}`,
      ];
      const result = parseErrorFromLogs(logs);
      expect(result).not.toBeNull();
      expect(result!.code).toBe(code);
      expect(result!.name).toBe(`Unknown(${code})`);
    }
  });

  it("v17: code 61 (0x3d) resolves to AssetSlotAlreadyConfigured, not the v12 ADL meaning", () => {
    const result = parseErrorFromLogs(["Program failed: custom program error: 0x3d"]);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(61);
    expect(result!.name).toBe("AssetSlotAlreadyConfigured");
  });

  it("returns Unknown name for codes not in PERCOLATOR_ERRORS", () => {
    const logs = [
      "Program failed: custom program error: 0xBEEF",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0xBEEF);
    expect(result!.name).toBe("Unknown(48879)");
  });
});

// ============================================================================
// Real-world scenario: PERC-8442 reproduction
// ============================================================================

describe("PERC-8442: L2TEx 0x1900 on ESa89R5 slab", () => {
  it("correctly identifies the real-world failure via parseErrorFromLogs and isLighthouseFailureInLogs", () => {
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

    // parseErrorFromLogs extracts the error code (no source classification in v12.17)
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0x1900);

    // isLighthouseFailureInLogs should detect it via Lighthouse program ID in logs
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

// Branch coverage additions
const PERC_RANDOM = Keypair.generate().publicKey;
const mkIx = (programId: PublicKey) =>
  new TransactionInstruction({ programId, keys: [], data: Buffer.alloc(0) });

describe("lighthouse: error-message extraction branches", () => {
  it("detects a plain string", () => {
    expect(isLighthouseError("custom program error: 0x1900")).toBe(true);
  });

  it("reads .message from non-Error objects", () => {
    expect(isLighthouseError({ message: "custom program error: 0x1900" })).toBe(true);
    expect(isLighthouseError({ message: "custom program error: 0x1" })).toBe(false);
  });

  it("JSON-stringifies objects without a message", () => {
    expect(
      isLighthouseError({ InstructionError: [0, { Custom: 6400 }] }),
    ).toBe(true);
    // Custom 6400 without InstructionError context is not enough
    expect(isLighthouseError({ other: { Custom: 6400 } })).toBe(false);
  });

  it("returns false when JSON.stringify throws (circular / bigint)", () => {
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    expect(isLighthouseError(circ)).toBe(false);
    expect(isLighthouseError({ n: 1n })).toBe(false);
  });

  it("returns false for falsy and empty-message inputs", () => {
    for (const v of [0, "", false, null, undefined, new Error("")]) {
      expect(isLighthouseError(v)).toBe(false);
    }
  });

  it("returns false for non-object primitives that are truthy", () => {
    // number 5 -> JSON "5": no Lighthouse signature
    expect(isLighthouseError(5)).toBe(false);
  });

  it("classifyLighthouseError maps object errors", () => {
    expect(classifyLighthouseError({ message: LIGHTHOUSE_PROGRAM_ID_STR })).toBe(
      LIGHTHOUSE_USER_MESSAGE,
    );
    expect(classifyLighthouseError(undefined)).toBeNull();
  });
});

describe("lighthouse: log scanning branches", () => {
  const id = LIGHTHOUSE_PROGRAM_ID_STR;

  it("returns false for non-array input", () => {
    expect(isLighthouseFailureInLogs("nope" as unknown as string[])).toBe(false);
    expect(isLighthouseFailureInLogs(undefined as unknown as string[])).toBe(false);
  });

  it("skips non-string entries", () => {
    const logs = [42, null, { a: 1 }, `Program ${id} failed: x`] as unknown as string[];
    expect(isLighthouseFailureInLogs(logs)).toBe(true);
  });

  it("success without a prior invoke does not underflow or flag", () => {
    expect(isLighthouseFailureInLogs([`Program ${id} success`])).toBe(false);
  });

  it("invoke/success pairs are not failures", () => {
    expect(
      isLighthouseFailureInLogs([
        `Program ${id} invoke [1]`,
        `Program ${id} success`,
        `Program ${PERC_RANDOM.toBase58()} failed: custom program error: 0x1900`,
      ]),
    ).toBe(false);
  });

  it("invoke followed by failed is a failure", () => {
    expect(
      isLighthouseFailureInLogs([`Program ${id} invoke [1]`, `Program ${id} failed: boom`]),
    ).toBe(true);
  });
});

describe("lighthouse: strip with percolatorProgramId guard", () => {
  it("instructions: leaves guards intact when no Percolator ix is present", () => {
    const ixs = [mkIx(LIGHTHOUSE_PROGRAM_ID), mkIx(Keypair.generate().publicKey)];
    expect(stripLighthouseInstructions(ixs, PERC_RANDOM)).toBe(ixs);
  });

  it("instructions: strips when a Percolator ix is present", () => {
    const ixs = [mkIx(LIGHTHOUSE_PROGRAM_ID), mkIx(PERC_RANDOM), mkIx(LIGHTHOUSE_PROGRAM_ID)];
    const out = stripLighthouseInstructions(ixs, PERC_RANDOM);
    expect(out).toHaveLength(1);
    expect(out[0].programId.equals(PERC_RANDOM)).toBe(true);
  });

  it("transaction: returns same tx when no Percolator ix is present", () => {
    const tx = new Transaction().add(mkIx(LIGHTHOUSE_PROGRAM_ID));
    expect(stripLighthouseFromTransaction(tx, PERC_RANDOM)).toBe(tx);
  });

  it("transaction: strips and preserves blockhash/feePayer when Percolator ix present", () => {
    const payer = Keypair.generate().publicKey;
    const tx = new Transaction().add(mkIx(LIGHTHOUSE_PROGRAM_ID), mkIx(PERC_RANDOM));
    tx.recentBlockhash = "11111111111111111111111111111111";
    tx.feePayer = payer;
    const out = stripLighthouseFromTransaction(tx, PERC_RANDOM);
    expect(out).not.toBe(tx);
    expect(out.instructions).toHaveLength(1);
    expect(out.recentBlockhash).toBe(tx.recentBlockhash);
    expect(out.feePayer?.equals(payer)).toBe(true);
  });

  it("transaction: no Lighthouse ix returns same tx even with Percolator ix", () => {
    const tx = new Transaction().add(mkIx(PERC_RANDOM));
    expect(stripLighthouseFromTransaction(tx, PERC_RANDOM)).toBe(tx);
  });
});

describe("lighthouse: error code table", () => {
  it("contains the constraint-address code and 18 entries", () => {
    expect(LIGHTHOUSE_ERROR_CODES.has(LIGHTHOUSE_CONSTRAINT_ADDRESS)).toBe(true);
    expect(LIGHTHOUSE_ERROR_CODES.size).toBe(18);
  });
});
