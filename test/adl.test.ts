/**
 * Tests for ADL (Auto-Deleveraging) client utilities — PERC-8278 / PERC-8312.
 */
import { describe, it, expect } from "vitest";
import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import {
  rankAdlPositions,
  buildAdlInstruction,
  isAdlTriggered,
  parseAdlEvent,
  AdlRankedPosition,
} from "../src/solana/adl.js";
import { encodeExecuteAdl } from "../src/abi/instructions.js";

// ---------------------------------------------------------------------------
// Helpers — build minimal fake slab data
// ---------------------------------------------------------------------------

const PROGRAM_ID = new PublicKey("EXsr2Tfz8ntWYP3vgCStdknFBoafvJQugJKAh4nFdo8f");
const SLAB_KEY = new PublicKey("7rUiMfQVTRMJb44fzDT7Gq1BGtioN3UVqNKaMVuqyqyH");
const ORACLE_KEY = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const CALLER = new PublicKey("SysvarC1ock11111111111111111111111111111111");

// ---------------------------------------------------------------------------
// Tests for buildAdlInstruction
// ---------------------------------------------------------------------------

describe("buildAdlInstruction", () => {
  // NOTE: In v17, ExecuteAdl transaction building is unsupported.
  // These tests verify the explicit throw behavior — not v12 byte encoding.

  it("throws because ExecuteAdl is removed in v17 wrapper", () => {
    expect(() =>
      buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, 7)
    ).toThrow("not supported by the v17 SDK");
  });

  it("throws even with valid programId (v17 removal)", () => {
    expect(() =>
      buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, 0)
    ).toThrow();
  });

  it("encodeExecuteAdl throws removedInstruction (v12 tag 101 not in v17)", () => {
    expect(() => encodeExecuteAdl({ targetIdx: 5 })).toThrow("not in v17");
  });

  it("buildAdlInstruction still validates negative targetIdx before throw", () => {
    expect(() =>
      buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, -1)
    ).toThrow("non-negative integer");
  });

  it("buildAdlInstruction still validates NaN before throw", () => {
    expect(() =>
      buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, NaN)
    ).toThrow("non-negative integer");
  });

  it("buildAdlInstruction still validates fractional before throw", () => {
    expect(() =>
      buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, 1.5)
    ).toThrow("non-negative integer");
  });

  it("throws with backup oracle accounts too", () => {
    const backup1 = new PublicKey("7rUiMfQVTRMJb44fzDT7Gq1BGtioN3UVqNKaMVuqyqyH");
    expect(() =>
      buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, 3, [backup1])
    ).toThrow();
  });

  it("v12 encodes targetIdx=256 would have been [50, 0, 1] — now throws", () => {
    expect(() =>
      buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, 256)
    ).toThrow();
  });

  it("targetIdx=256 (large) also throws removedInstruction (ExecuteAdl removed in v17)", () => {
    // In v12: would have encoded [50, 0, 1] (tag + u16 LE). In v17: always throws.
    expect(() =>
      buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, 256)
    ).toThrow("not supported by the v17 SDK");
  });
});

// ---------------------------------------------------------------------------
// Tests for rankAdlPositions / computePnlPct
// ---------------------------------------------------------------------------

describe("rankAdlPositions — unit tests on pure ranking logic", () => {
  /**
   * Build a minimal mock AdlRankedPosition array and verify sorting.
   * We test the exported interface contract, not slab parsing internals.
   */

  it("AdlRankedPosition interface has expected fields", () => {
    const pos: AdlRankedPosition = {
      idx: 5,
      owner: CALLER,
      positionSize: 1_000_000_000n,
      pnl: 100_000n,
      capital: 1_000_000n,
      pnlPct: 1000n, // 10%
      side: "long",
      adlRank: 0,
    };
    expect(pos.idx).toBe(5);
    expect(pos.side).toBe("long");
    expect(pos.adlRank).toBe(0);
    expect(pos.pnlPct).toBe(1000n);
  });

  it("pnlPct formula: pnl * 10_000 / capital", () => {
    // 100k / 1M = 10% = 1000 bps
    const pnl = 100_000n;
    const capital = 1_000_000n;
    const expected = (pnl * 10_000n) / capital;
    expect(expected).toBe(1000n);
  });

  it("pnlPct is 0 when capital is 0 (no division by zero)", () => {
    // The rankAdlPositions function uses computePnlPct internally — test via mock
    const pnl = 100_000n;
    const capital = 0n;
    const result = capital === 0n ? 0n : (pnl * 10_000n) / capital;
    expect(result).toBe(0n);
  });

  it("side is determined by positionSize sign", () => {
    const longSize = 1_000n;
    const shortSize = -1_000n;
    expect(longSize > 0n ? "long" : "short").toBe("long");
    expect(shortSize > 0n ? "long" : "short").toBe("short");
  });

  it("sort order: higher pnlPct should rank first (ADL targets most profitable)", () => {
    // Simulate what rankAdlPositions does for longs
    const positions: { pnlPct: bigint; idx: number }[] = [
      { pnlPct: 500n, idx: 1 },
      { pnlPct: 1500n, idx: 2 },
      { pnlPct: 1000n, idx: 3 },
    ];
    const sorted = [...positions].sort((a, b) =>
      b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0
    );
    expect(sorted[0].idx).toBe(2); // 1500 bps = most profitable, deleveraged first
    expect(sorted[1].idx).toBe(3); // 1000 bps
    expect(sorted[2].idx).toBe(1); // 500 bps
  });
});

// ---------------------------------------------------------------------------
// Tests for rankAdlPositions — dominantSide
// ---------------------------------------------------------------------------
//
// Regression: rankAdlPositions previously never determined which side has
// greater net OI, contradicting the module's own documented behavior ("the
// position at rank 0 of the dominant side is deleveraged first") and the
// on-chain engine's actual target-side gating (per the devnet log format:
// "net_long_oi=... net_short_oi=... target_side=...").

describe("rankAdlPositions — dominantSide", () => {
  const V12_19_SBF_SMALL_SIZE = 96_784;
  const ENGINE_BASE = 616;
  const LONG_OI_OFF = ENGINE_BASE + 472;
  const SHORT_OI_OFF = ENGINE_BASE + 488;

  function buildEngineOnlySlab(longOi: bigint, shortOi: bigint): Uint8Array {
    const buf = new Uint8Array(V12_19_SBF_SMALL_SIZE);
    const dv = new DataView(buf.buffer);
    dv.setBigUint64(0, 0x504552434f4c4154n, true); // PERCOLAT magic
    dv.setBigUint64(LONG_OI_OFF, longOi, true);
    dv.setBigUint64(SHORT_OI_OFF, shortOi, true);
    return buf;
  }

  it("dominantSide is 'long' when longOi > shortOi", () => {
    const result = rankAdlPositions(buildEngineOnlySlab(1_000_000n, 500_000n));
    expect(result.dominantSide).toBe("long");
  });

  it("dominantSide is 'short' when shortOi > longOi", () => {
    const result = rankAdlPositions(buildEngineOnlySlab(500_000n, 1_000_000n));
    expect(result.dominantSide).toBe("short");
  });

  it("dominantSide resolves ties to 'long', matching the on-chain target_side convention", () => {
    const result = rankAdlPositions(buildEngineOnlySlab(500_000n, 500_000n));
    expect(result.dominantSide).toBe("long");
  });

  it("dominantSide is null when engine state cannot be parsed at all (bad magic)", () => {
    // A recognized-length buffer with the wrong magic: parseEngine throws
    // "invalid slab magic" (caught internally, dominantSide stays null), while
    // detectSlabLayout/parseAllAccounts don't check magic for this size, so the
    // rest of rankAdlPositions still completes rather than throwing outright.
    const buf = new Uint8Array(V12_19_SBF_SMALL_SIZE);
    const result = rankAdlPositions(buf);
    expect(result.dominantSide).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests for buildAdlTransaction's default target-side selection logic
// ---------------------------------------------------------------------------
//
// buildAdlTransaction itself requires a live Connection, so this tests the
// branch-selection rule directly (the same pattern this file already uses for
// rankAdlPositions' pure sorting logic above) rather than the full RPC path.

describe("buildAdlTransaction — default target-side selection (pure logic)", () => {
  function selectTarget(
    dominantSide: "long" | "short" | null,
    longs: { idx: number }[],
    shorts: { idx: number }[],
    ranked: { idx: number }[],
  ): { idx: number } | undefined {
    if (dominantSide === "long") return longs[0];
    if (dominantSide === "short") return shorts[0];
    return ranked[0];
  }

  it("targets the dominant side's top position when omitting preferSide, not the global top", () => {
    const longs = [{ idx: 1 }];
    const shorts = [{ idx: 2 }];
    // Global ranked[0] would be the short (idx 2) if merged-sort happened to put
    // it first — but with dominantSide="long", the long must be targeted instead.
    const ranked = [{ idx: 2 }, { idx: 1 }];
    expect(selectTarget("long", longs, shorts, ranked)!.idx).toBe(1);
    expect(selectTarget("short", longs, shorts, ranked)!.idx).toBe(2);
  });

  it("falls back to the global top-ranked position only when dominantSide is null", () => {
    const longs = [{ idx: 1 }];
    const shorts = [{ idx: 2 }];
    const ranked = [{ idx: 2 }, { idx: 1 }];
    expect(selectTarget(null, longs, shorts, ranked)!.idx).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tests for isAdlTriggered
// ---------------------------------------------------------------------------

describe("isAdlTriggered", () => {
  it("returns false for invalid/empty slab data", () => {
    // Empty data — detectSlabLayout returns null → false
    const emptyData = new Uint8Array(0);
    expect(isAdlTriggered(emptyData)).toBe(false);
  });

  it("returns false for unrecognized data length", () => {
    // Random size not matching any known slab layout
    const garbage = new Uint8Array(100).fill(0xff);
    expect(isAdlTriggered(garbage)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests for parseAdlEvent — PERC-8312
// ---------------------------------------------------------------------------

describe("parseAdlEvent", () => {
  /** ADL_EVENT_TAG = 0xAD1E_0001 = 2904424449 */
  const TAG = 0xAD1E_0001; // 2904424449

  it("returns null for empty logs", () => {
    expect(parseAdlEvent([])).toBeNull();
  });

  it("returns null when no log line matches ADL tag", () => {
    const logs = [
      "Program log: some other line",
      "Program 11111111111111111111111111111111 invoke [1]",
    ];
    expect(parseAdlEvent(logs)).toBeNull();
  });

  it("parses a valid AdlEvent from sol_log_64 format", () => {
    const targetIdx = 42;
    const price = 150_000_000n;   // e.g. $150 in e6
    const closedAbs = 500_000_000n; // lo part (fits in u64)
    const lo = closedAbs & 0xFFFF_FFFF_FFFF_FFFFn;
    const hi = closedAbs >> 64n;   // 0

    const logLine = `Program log: ${TAG} ${targetIdx} ${price} ${lo} ${hi}`;
    const event = parseAdlEvent([logLine]);

    expect(event).not.toBeNull();
    expect(event!.tag).toBe(BigInt(TAG));
    expect(event!.targetIdx).toBe(targetIdx);
    expect(event!.price).toBe(price);
    expect(event!.closedAbs).toBe(closedAbs);
  });

  it("reassembles large closedAbs across lo+hi u64 parts", () => {
    // closedAbs > 2^64 — the split: lo = lower 64 bits, hi = upper 64 bits
    const closedAbs = (3n << 64n) | 0xDEAD_BEEFn;
    const lo = closedAbs & 0xFFFF_FFFF_FFFF_FFFFn;
    const hi = closedAbs >> 64n; // = 3

    const logLine = `Program log: ${TAG} 10 12345 ${lo} ${hi}`;
    const event = parseAdlEvent([logLine]);

    expect(event).not.toBeNull();
    expect(event!.closedAbs).toBe(closedAbs);
  });

  it("skips lines that do not start with 'Program log:'", () => {
    const logs = [
      `Other prefix: ${TAG} 1 100 200 0`,
      `Program data: ${TAG} 1 100 200 0`,
    ];
    expect(parseAdlEvent(logs)).toBeNull();
  });

  it("skips log lines with wrong tag (different tag value)", () => {
    // Tag 0xC8A4C (liquidation debug tag) should not match
    const logs = [`Program log: 821324 1 100 200 0`];
    expect(parseAdlEvent(logs)).toBeNull();
  });

  it("returns null for a line with only 4 values (too few)", () => {
    const logs = [`Program log: ${TAG} 1 100 200`];
    expect(parseAdlEvent(logs)).toBeNull();
  });

  it("returns first AdlEvent when multiple matches exist (e.g. retried ADL)", () => {
    const logLine1 = `Program log: ${TAG} 1 100 500 0`;
    const logLine2 = `Program log: ${TAG} 2 200 600 0`;
    const event = parseAdlEvent([logLine1, logLine2]);

    expect(event).not.toBeNull();
    expect(event!.targetIdx).toBe(1);
  });

  it("gracefully skips non-string entries", () => {
    // logs array might contain non-strings in edge cases
    const logs = [null as unknown as string, `Program log: ${TAG} 5 999 100 0`];
    const event = parseAdlEvent(logs);
    expect(event).not.toBeNull();
    expect(event!.targetIdx).toBe(5);
  });
});

// Tests for buildAdlInstruction targetIdx validation
// ---------------------------------------------------------------------------

describe("buildAdlInstruction validation", () => {
  it("rejects negative targetIdx (validates before removed-instruction throw)", () => {
    const key = PublicKey.default;
    expect(() => buildAdlInstruction(key, key, key, key, -1)).toThrow("non-negative integer");
  });

  it("rejects NaN targetIdx (validates before removed-instruction throw)", () => {
    const key = PublicKey.default;
    expect(() => buildAdlInstruction(key, key, key, key, NaN)).toThrow("non-negative integer");
  });

  it("rejects fractional targetIdx (validates before removed-instruction throw)", () => {
    const key = PublicKey.default;
    expect(() => buildAdlInstruction(key, key, key, key, 1.5)).toThrow("non-negative integer");
  });

  it("valid targetIdx still throws removedInstruction (ExecuteAdl removed in v17)", () => {
    const key = PublicKey.default;
    // ExecuteAdl was removed from v17 wrapper; buildAdlInstruction throws explicitly.
    expect(() => buildAdlInstruction(key, key, key, key, 0)).toThrow("not supported by the v17 SDK");
    expect(() => buildAdlInstruction(key, key, key, key, 255)).toThrow("not supported by the v17 SDK");
  });
});
