// E1 of J-20261120-SDK-REPORT-DEVNETSIMULATEBUILDERS: a System-program failure inside a wrapper CPI must be named by the
// System program's table, not as wrapper code 1 (InvalidVersion). Logs copied from a devnet simulate (InitInsuranceUnits,
// tag 116, unfunded payer), 2026-11-20.
import { describe, expect, it } from "vitest";
import { parseErrorFromLogs } from "../src/abi/errors.js";

const LOGS = [
  "Program ComputeBudget111111111111111111111111111111 invoke [1]",
  "Program ComputeBudget111111111111111111111111111111 success",
  "Program 6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM invoke [1]",
  "Program 11111111111111111111111111111111 invoke [2]",
  "Transfer: insufficient lamports 0, need 1706880",
  "Program 11111111111111111111111111111111 failed: custom program error: 0x1",
  "Program 6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM consumed 11914 of 1399700 compute units",
  "Program 6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM failed: custom program error: 0x1",
];

describe("parseErrorFromLogs: System program errors", () => {
  it("names System error 1 inside a wrapper CPI as ResultWithNegativeLamports, not wrapper InvalidVersion", () => {
    const e = parseErrorFromLogs(LOGS);
    expect(e).not.toBeNull();
    expect(e!.program).toBe("system");
    expect(e!.programId).toBe("11111111111111111111111111111111");
    expect(e!.code).toBe(1);
    expect(e!.name).toBe("ResultWithNegativeLamports");
    expect(e!.name).not.toBe("InvalidVersion");
  });

  it("ignores wrapper context hints for a System failure", () => {
    const e = parseErrorFromLogs(LOGS, { context: { action: "deposit" } });
    expect(e!.hint).toMatch(/enough SOL/);
  });

  it("the wrapper's own code 1 is still InvalidVersion", () => {
    const e = parseErrorFromLogs(["Program 6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM failed: custom program error: 0x1"]);
    expect(e!.program).toBe("wrapper");
    expect(e!.name).toBe("InvalidVersion");
  });

  it("an undefined System code falls back to Unknown(n)", () => {
    const e = parseErrorFromLogs(["Program 11111111111111111111111111111111 failed: custom program error: 0x63"]);
    expect(e!.program).toBe("system");
    expect(e!.name).toBe("Unknown(99)");
  });
});
