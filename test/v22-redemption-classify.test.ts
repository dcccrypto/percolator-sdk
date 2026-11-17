/** classifyRedemptionSimulationV22: real-shaped simulateTransaction results (leads 1-4 of J-20261117-SDK-BUG-REDEMPTIONCLASSIFY). */
import { describe, expect, it } from "vitest";
import { classifyRedemptionSimulationV22 as classify, payoutFromBalancesV22 } from "../src/solana/v22.js";
import { PROGRAM_IDS_DEVNET_V22 } from "../src/config/program-ids.js";

const W = String(PROGRAM_IDS_DEVNET_V22.percolator);
const MATCHER = String(PROGRAM_IDS_DEVNET_V22.matcher);
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const wrapperFail = (hex: string) => [
  `Program ${W} invoke [1]`,
  "Program log: ExecuteRedemption",
  `Program ${W} consumed 40000 of 400000 compute units`,
  `Program ${W} failed: custom program error: 0x${hex}`,
];

describe("lead 1: truncated / missing logs", () => {
  it("Custom 117 in err with 'Log truncated' is belowMinPayout", () => {
    const logs = [`Program ${W} invoke [1]`, "Log truncated"];
    expect(classify({ err: { InstructionError: [2, { Custom: 117 }] }, logs })).toEqual({ kind: "belowMinPayout", code: 117 });
  });
  it("Custom 118 in err with no logs is notLossCurrent", () => {
    expect(classify({ err: { InstructionError: [2, { Custom: 118 }] }, logs: [] })).toEqual({ kind: "notLossCurrent", code: 118 });
  });
});

describe("lead 2: CPI shadowing", () => {
  it("a token-program 0x75 at depth 2 is not the wrapper's 117", () => {
    const logs = [
      `Program ${W} invoke [1]`,
      `Program ${TOKEN} invoke [2]`,
      `Program ${TOKEN} failed: custom program error: 0x75`,
      `Program ${W} failed: custom program error: 0x75`,
    ];
    expect(classify({ err: { InstructionError: [2, { Custom: 117 }] }, logs }).kind).toBe("other");
  });
  it("a matcher 0x76 at depth 2 is not the wrapper's 118", () => {
    const logs = [
      `Program ${W} invoke [1]`,
      `Program ${MATCHER} invoke [2]`,
      `Program ${MATCHER} failed: custom program error: 0x76`,
      `Program ${W} failed: custom program error: 0x76`,
    ];
    expect(classify({ err: { InstructionError: [2, { Custom: 118 }] }, logs }).kind).toBe("other");
  });
  it("a plain wrapper 117 still classifies", () => {
    expect(classify({ err: { InstructionError: [2, { Custom: 117 }] }, logs: wrapperFail("75") })).toEqual({ kind: "belowMinPayout", code: 117 });
  });
});

describe("lead 3: unserializable err", () => {
  it("BigInt in err does not throw", () => {
    expect(() => classify({ err: { InstructionError: [0, { Custom: 5n }] }, logs: wrapperFail("5") })).not.toThrow();
  });
  it("circular err does not throw", () => {
    const e: Record<string, unknown> = {};
    e.self = e;
    expect(() => classify({ err: e, logs: [] })).not.toThrow();
  });
});

describe("lead 4: payoutFromBalancesV22", () => {
  it("throws on equal balances with a stable message", () => {
    expect(() => payoutFromBalancesV22(5n, 5n)).toThrow(/paid nothing/);
  });
});
