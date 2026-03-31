import { describe, it, expect } from "vitest";
import {
  PERCOLATOR_ERRORS,
  decodeError,
  getErrorName,
  getErrorHint,
  parseErrorFromLogs,
} from "../src/abi/errors.js";

// ============================================================================
// Error table completeness
// ============================================================================

describe("PERCOLATOR_ERRORS table", () => {
  it("has contiguous error codes from 0 to 65", () => {
    for (let i = 0; i <= 65; i++) {
      expect(PERCOLATOR_ERRORS[i]).toBeDefined();
      expect(PERCOLATOR_ERRORS[i].name).toBeTruthy();
      expect(PERCOLATOR_ERRORS[i].hint).toBeTruthy();
    }
  });

  it("every error has a non-empty name", () => {
    for (const [_code, info] of Object.entries(PERCOLATOR_ERRORS)) {
      expect(info.name.length).toBeGreaterThan(0);
    }
  });

  it("every error has a non-empty hint", () => {
    for (const [_code, info] of Object.entries(PERCOLATOR_ERRORS)) {
      expect(info.hint.length).toBeGreaterThan(0);
    }
  });

  it("all error names are unique", () => {
    const names = Object.values(PERCOLATOR_ERRORS).map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("well-known error codes map to expected names", () => {
    expect(PERCOLATOR_ERRORS[0].name).toBe("InvalidMagic");
    expect(PERCOLATOR_ERRORS[6].name).toBe("OracleStale");
    expect(PERCOLATOR_ERRORS[13].name).toBe("EngineInsufficientBalance");
    expect(PERCOLATOR_ERRORS[14].name).toBe("EngineUndercollateralized");
    expect(PERCOLATOR_ERRORS[18].name).toBe("EngineOverflow");
    expect(PERCOLATOR_ERRORS[22].name).toBe("EngineRiskReductionOnlyMode");
    expect(PERCOLATOR_ERRORS[27].name).toBe("HyperpTradeNoCpiDisabled");
    expect(PERCOLATOR_ERRORS[33].name).toBe("MarketPaused");
    expect(PERCOLATOR_ERRORS[34].name).toBe("AdminRenounceNotAllowed");
    expect(PERCOLATOR_ERRORS[44].name).toBe("LpVaultNoNewFees");
    expect(PERCOLATOR_ERRORS[45].name).toBe("SafetyValveDominantSideBlocked");
    expect(PERCOLATOR_ERRORS[59].name).toBe("OiImbalanceHardBlock");
    expect(PERCOLATOR_ERRORS[60].name).toBe("EngineInvalidEntryPrice");
  });
});

// ============================================================================
// decodeError
// ============================================================================

describe("decodeError", () => {
  it("returns error info for valid code 0", () => {
    const info = decodeError(0);
    expect(info).toBeDefined();
    expect(info!.name).toBe("InvalidMagic");
  });

  it("returns error info for code 33 (MarketPaused)", () => {
    const info = decodeError(33);
    expect(info).toBeDefined();
    expect(info!.name).toBe("MarketPaused");
  });

  it("returns error info for code 34 (AdminRenounceNotAllowed)", () => {
    const info = decodeError(34);
    expect(info).toBeDefined();
    expect(info!.name).toBe("AdminRenounceNotAllowed");
  });

  it("returns error info for code 45 (SafetyValveDominantSideBlocked)", () => {
    const info = decodeError(45);
    expect(info).toBeDefined();
    expect(info!.name).toBe("SafetyValveDominantSideBlocked");  });
  it("returns undefined for unknown code", () => {
    expect(decodeError(10_000)).toBeUndefined();
    expect(decodeError(-1)).toBeUndefined();
    expect(decodeError(66)).toBeUndefined();  });

  it("returns error info for PERC extension codes 45 and 59", () => {
    expect(decodeError(45)!.name).toBe("SafetyValveDominantSideBlocked");
    expect(decodeError(59)!.name).toBe("OiImbalanceHardBlock");  });});
// ============================================================================
// getErrorName
// ============================================================================

describe("getErrorName", () => {
  it("returns name for valid code", () => {
    expect(getErrorName(0)).toBe("InvalidMagic");
    expect(getErrorName(13)).toBe("EngineInsufficientBalance");
  });

  it("returns Unknown(...) for unknown codes", () => {
    expect(getErrorName(999)).toBe("Unknown(999)");
    expect(getErrorName(100)).toBe("Unknown(100)");
  });
});

// ============================================================================
// getErrorHint
// ============================================================================

describe("getErrorHint", () => {
  it("returns hint for valid code", () => {
    const hint = getErrorHint(6);
    expect(hint).toBeDefined();
    expect(hint).toContain("Oracle price is too old");
  });

  it("returns undefined for unknown code", () => {
    expect(getErrorHint(500)).toBeUndefined();
  });
});

// ============================================================================
// parseErrorFromLogs
// ============================================================================

describe("parseErrorFromLogs", () => {
  it("parses hex error code from standard Solana log format", () => {
    const logs = [
      "Program log: Instruction: TradeNoCpi",
      "Program 11111111111111111111111111111111 failed: custom program error: 0xd",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(13); // 0xd = 13
    expect(result!.name).toBe("EngineInsufficientBalance");
    expect(result!.hint).toContain("Not enough collateral");
  });

  it("parses code 0x0 (InvalidMagic)", () => {
    const logs = [
      "Program xyz failed: custom program error: 0x0",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0);
    expect(result!.name).toBe("InvalidMagic");
  });

  it("parses multi-digit hex code 0x21 (MarketPaused = 33)", () => {
    const logs = [
      "Program xyz failed: custom program error: 0x21",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(33);
    expect(result!.name).toBe("MarketPaused");
  });

  it("parses uppercase hex code", () => {
    const logs = [
      "Program xyz failed: custom program error: 0xE",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(14); // EngineUndercollateralized
    expect(result!.name).toBe("EngineUndercollateralized");
  });

  it("returns null for logs without error", () => {
    const logs = [
      "Program log: Instruction: InitUser",
      "Program 11111111111111111111111111111111 consumed 50000 of 200000 compute units",
      "Program 11111111111111111111111111111111 success",
    ];
    expect(parseErrorFromLogs(logs)).toBeNull();
  });

  it("returns null for empty logs", () => {
    expect(parseErrorFromLogs([])).toBeNull();
  });

  it("handles unknown error codes gracefully", () => {
    const logs = [
      "Program xyz failed: custom program error: 0xff",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(255);
    expect(result!.name).toBe("Unknown(255)");
    expect(result!.hint).toBeUndefined();
  });

  it("returns first error if multiple errors in logs", () => {
    const logs = [
      "Program A failed: custom program error: 0x6",
      "Program B failed: custom program error: 0xd",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(6); // OracleStale — the first one
  });

  it("returns null for non-array input (does not throw)", () => {
    expect(parseErrorFromLogs(null as unknown as string[])).toBeNull();
    expect(parseErrorFromLogs(undefined as unknown as string[])).toBeNull();
  });

  it("skips non-string log lines", () => {
    const logs = [123, "Program x failed: custom program error: 0x5"] as unknown as string[];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(5);
  });

  it("does not match unbounded hex (avoids bogus precision-loss codes)", () => {
    const logs = [
      "Program x failed: custom program error: 0x100000000",
    ];
    expect(parseErrorFromLogs(logs)).toBeNull();
  });

  it("matches exactly 8 hex digits (u32 max)", () => {
    const logs = [
      "Program x failed: custom program error: 0xffffffff",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0xffff_ffff);
    expect(result!.name).toBe("Unknown(4294967295)");
  });
});
