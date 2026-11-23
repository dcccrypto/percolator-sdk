/**
 * isLighthouseError must not blame the wallet guard when the only mention of
 * the Lighthouse program id is a Lighthouse ix that RAN AND SUCCEEDED
 * ("invoke [1]" ... "success") before a Percolator ix failed, and the text has
 * no "Program <id> failed" line (truncated logs, or an "Error processing
 * Instruction N: custom program error: 0x.." string). A false "Lighthouse"
 * makes an app strip the guards and resend.
 */
import { describe, it, expect } from "vitest";
import {
  LIGHTHOUSE_PROGRAM_ID_STR as LH,
  isLighthouseError,
  classifyLighthouseError,
} from "../src/runtime/lighthouse.js";

const PERC = "PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD";

// Lighthouse guard ran first and passed; Percolator then failed. Logs were cut
// before the "Program PERC failed" line (validator log limit).
const truncatedLogs = [
  "Program ComputeBudget111111111111111111111111111111 invoke [1]",
  "Program ComputeBudget111111111111111111111111111111 success",
  `Program ${LH} invoke [1]`,
  `Program ${LH} consumed 3120 of 1399850 compute units`,
  `Program ${LH} success`,
  `Program ${PERC} invoke [1]`,
  "Program log: Instruction: TradeCpiV2",
  "Log truncated",
];

describe("isLighthouseError: Lighthouse id only in invoke/success lines", () => {
  it("truncated logs: Lighthouse succeeded, no failed line -> not Lighthouse", () => {
    expect(isLighthouseError(truncatedLogs)).toBe(false);
    expect(classifyLighthouseError(truncatedLogs)).toBeNull();
  });

  it("'Error processing Instruction N' string with Lighthouse-success logs -> not Lighthouse", () => {
    const err = new Error(
      "Transaction simulation failed: Error processing Instruction 2: custom program error: 0xe\n" +
        truncatedLogs.join("\n"),
    );
    expect(isLighthouseError(err)).toBe(false);
  });

  it("several Lighthouse ixs, all succeeded -> not Lighthouse", () => {
    const logs = [
      `Program ${LH} invoke [1]`,
      `Program ${LH} success`,
      `Program ${LH} invoke [1]`,
      `Program ${LH} consumed 1 of 2 compute units`,
      `Program ${LH} success`,
      "Error processing Instruction 3: custom program error: 0x1",
    ];
    expect(isLighthouseError(logs)).toBe(false);
  });

  // Unchanged behaviour (guards against over-fixing).
  it("Lighthouse invoked but never reached success (cut mid-guard) -> still Lighthouse", () => {
    expect(isLighthouseError([`Program ${LH} invoke [1]`, "Log truncated"])).toBe(true);
  });

  it("Lighthouse id outside invoke/success lines -> still Lighthouse", () => {
    expect(isLighthouseError(`Program ${LH} failed: custom program error: 0x1771`)).toBe(true);
    expect(isLighthouseError(`assertion by ${LH} rejected the tx`)).toBe(true);
  });

  it("full logs with Percolator failed line stay non-Lighthouse", () => {
    const logs = [
      ...truncatedLogs.slice(0, -1),
      `Program ${PERC} failed: custom program error: 0xe`,
    ];
    expect(isLighthouseError(logs)).toBe(false);
  });

  it("0x1900 with a successful Lighthouse ix is still decided by the code rule", () => {
    const logs = [
      `Program ${LH} invoke [1]`,
      `Program ${LH} success`,
      "Error processing Instruction 1: custom program error: 0x1900",
    ];
    expect(isLighthouseError(logs)).toBe(true);
  });
});
