/**
 * Parity for the two log-scan speedups in src/runtime/lighthouse.ts:
 * - isLighthouseFailureInLogs skips lines without the program ID and uses
 *   hoisted "Program <ID> invoke|success|failed" constants;
 * - isLighthouseError runs the "Program <id> failed" regex only when the
 *   message contains "failed".
 * The reference functions below are the pre-change bodies, copied verbatim.
 * Inputs are the perf-bench log shapes plus edge lines.
 */
import { describe, it, expect } from "vitest";
import {
  LIGHTHOUSE_PROGRAM_ID_STR as L,
  isLighthouseError,
  isLighthouseFailureInLogs,
} from "../src/runtime/lighthouse.js";

const P = "PERCopuL6d4mMhAPGvVSfyFMuDe22p3vBE3Nz24SSXD";
const OTHER = "Stake11111111111111111111111111111111111111";

// ---- pre-change reference (verbatim) ----
const LIGHTHOUSE_BENIGN_LINE = new RegExp(
  `Program ${L} (?:invoke \\[\\d+\\]|success|consumed \\d+ of \\d+ compute units)`,
  "g",
);
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
function refIsLighthouseError(error: unknown): boolean {
  const msg = extractErrorMessage(error);
  if (!msg) return false;
  const failed = [...msg.matchAll(/Program\s+([1-9A-HJ-NP-Za-km-z]{32,44})\s+failed/g)];
  if (failed.length > 0) {
    return failed.some((m) => m[1] === L);
  }
  if (msg.includes(L)) {
    const invokes = msg.split(`Program ${L} invoke [`).length - 1;
    const successes = msg.split(`Program ${L} success`).length - 1;
    const rest = msg.replace(LIGHTHOUSE_BENIGN_LINE, "");
    if (invokes > successes || rest.includes(L)) return true;
  }
  if (/custom\s+program\s+error:\s*0x1900\b/i.test(msg)) return true;
  if (/"Custom"\s*:\s*6400\b/.test(msg) && /InstructionError/i.test(msg)) return true;
  return false;
}
function refIsLighthouseFailureInLogs(logs: string[]): boolean {
  if (!Array.isArray(logs)) return false;
  let lighthouseDepth = 0;
  for (const line of logs) {
    if (typeof line !== "string") continue;
    if (line.includes(`Program ${L} invoke`)) {
      lighthouseDepth++;
      continue;
    }
    if (line.includes(`Program ${L} success`)) {
      if (lighthouseDepth > 0) lighthouseDepth--;
      continue;
    }
    if (line.includes(`Program ${L} failed`)) {
      return true;
    }
  }
  return false;
}

// ---- inputs: the bench log shape ----
function logs(lines: number, lh: number, lhFails = false): string[] {
  const out: string[] = [];
  const lhBlock = (fail: boolean) => [
    `Program ${L} invoke [1]`,
    `Program ${L} consumed 1234 of 199000 compute units`,
    fail ? `Program ${L} failed: custom program error: 0x1900` : `Program ${L} success`,
  ];
  for (let j = 0; j < lh; j++) out.push(...lhBlock(false));
  let i = 0;
  while (out.length < lines - (lhFails ? 3 : 0)) {
    out.push(i % 4 === 0 ? `Program ${P} invoke [1]` : i % 4 === 3 ? `Program ${P} success` : `Program log: step ${i} ok, value=${i * 31}`);
    i++;
  }
  if (lhFails) out.push(...lhBlock(true));
  return out.slice(0, lines);
}

const logSets: string[][] = [];
for (const n of [10, 100, 1000]) for (const lh of [0, 1, 3]) for (const f of [false, true]) logSets.push(logs(n, lh, f));
logSets.push(
  [],
  [`Program ${P} failed: custom program error: 0x1900`],
  [`Program ${OTHER} failed: custom program error: 0x1900`, `Program ${L} invoke [2]`],
  [`Program ${L} invoke [1]`, `Program ${L} Failed: x`],
  [`Program log: ${L}`, `${L} failed`, `Program  ${L} failed`],
  [`Program ${L} failed`, `Program ${L} invoke [1]`],
  [`Program ${L} success`, `Program ${L} success`, `Program ${L} failed: 0x1771`],
  [`Program ${L}invoke`, `xProgram ${L} invoke [1]`],
  [`Program ${P} invoke [1]`, `Program ${L} invoke [2]`, `Program ${L} consumed 9 of 9 compute units`],
  [`Program ${P} invoke [1]`, `Program ${P} failed`],
  [`custom program error: 0x1900`],
  [`Program ${P}    failed`, `Program\t${L}\nfailed`],
  [`{"InstructionError":[0,{"Custom":6400}]}`],
  [`Program ${L} invoke [1]`, `Program ${L} success`, `Program log: failed to parse`],
);

describe("lighthouse log-scan speedups keep the old results", () => {
  it("isLighthouseFailureInLogs matches the reference on every input", () => {
    const bad = logSets.filter((l) => isLighthouseFailureInLogs(l) !== refIsLighthouseFailureInLogs(l));
    expect(bad).toEqual([]);
    // Non-string entries and non-arrays are still ignored.
    const mixed = [1, null, `Program ${L} failed`] as unknown as string[];
    expect(isLighthouseFailureInLogs(mixed)).toBe(refIsLighthouseFailureInLogs(mixed));
    expect(isLighthouseFailureInLogs("x" as unknown as string[])).toBe(false);
  });

  it("isLighthouseError matches the reference on joined logs, single lines and error shapes", () => {
    const inputs: unknown[] = [];
    for (const l of logSets) {
      inputs.push(l.join("\n"), new Error(l.join(" ")), { message: l.join("\n") }, { logs: l });
      for (const line of l.slice(0, 50)) inputs.push(line);
    }
    inputs.push(undefined, "", 0, { a: 1 });
    const bad = inputs.filter((x) => isLighthouseError(x) !== refIsLighthouseError(x));
    expect(bad).toEqual([]);
  });

  it("the corpus exercises both answers of each function", () => {
    const f = logSets.map(isLighthouseFailureInLogs);
    expect(f).toContain(true);
    expect(f).toContain(false);
    const e = logSets.map((l) => isLighthouseError(l.join("\n")));
    expect(e).toContain(true);
    expect(e).toContain(false);
  });
});
