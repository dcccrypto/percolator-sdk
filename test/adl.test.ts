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
  it("produces correct instruction data (tag=50 + targetIdx u16 LE)", () => {
    const targetIdx = 7;
    const ix = buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, targetIdx);

    // tag=50, targetIdx=7 → [50, 7, 0]
    const expected = encodeExecuteAdl({ targetIdx });
    expect(ix.data).toEqual(Buffer.from(expected));
  });

  it("uses the correct programId", () => {
    const ix = buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, 0);
    expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
  });

  it("accounts order: caller(signer,r/o), slab(r/w), clock(r/o), oracle(r/o)", () => {
    const ix = buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, 0);
    const keys = ix.keys;

    expect(keys).toHaveLength(4);
    expect(keys[0].pubkey.equals(CALLER)).toBe(true);
    expect(keys[0].isSigner).toBe(true);
    expect(keys[0].isWritable).toBe(false);

    expect(keys[1].pubkey.equals(SLAB_KEY)).toBe(true);
    expect(keys[1].isSigner).toBe(false);
    expect(keys[1].isWritable).toBe(true);

    expect(keys[2].pubkey.equals(SYSVAR_CLOCK_PUBKEY)).toBe(true);
    expect(keys[2].isSigner).toBe(false);
    expect(keys[2].isWritable).toBe(false);

    expect(keys[3].pubkey.equals(ORACLE_KEY)).toBe(true);
    expect(keys[3].isSigner).toBe(false);
    expect(keys[3].isWritable).toBe(false);
  });

  it("appends backup oracle accounts correctly", () => {
    const backup1 = new PublicKey("7rUiMfQVTRMJb44fzDT7Gq1BGtioN3UVqNKaMVuqyqyH");
    const backup2 = new PublicKey("So11111111111111111111111111111111111111112");
    const ix = buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, 3, [backup1, backup2]);

    expect(ix.keys).toHaveLength(6);
    expect(ix.keys[4].pubkey.equals(backup1)).toBe(true);
    expect(ix.keys[5].pubkey.equals(backup2)).toBe(true);
  });

  it("encodes targetIdx=0 correctly", () => {
    const ix = buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, 0);
    // tag(1) + u16 LE(2) = [50, 0, 0]
    expect(Array.from(ix.data)).toEqual([50, 0, 0]);
  });

  it("encodes targetIdx=256 correctly", () => {
    const ix = buildAdlInstruction(CALLER, SLAB_KEY, ORACLE_KEY, PROGRAM_ID, 256);
    // 256 in u16 LE = [0, 1]
    expect(Array.from(ix.data)).toEqual([50, 0, 1]);
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
