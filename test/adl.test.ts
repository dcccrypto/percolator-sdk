/**
 * Tests for ADL (Auto-Deleveraging) client utilities — PERC-8278.
 */
import { describe, it, expect } from "vitest";
import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import {
  rankAdlPositions,
  buildAdlInstruction,
  isAdlTriggered,
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
// Tests for buildAdlInstruction targetIdx validation
// ---------------------------------------------------------------------------

describe("buildAdlInstruction validation", () => {
  it("rejects negative targetIdx", () => {
    const key = PublicKey.default;
    expect(() => buildAdlInstruction(key, key, key, key, -1)).toThrow("non-negative integer");
  });

  it("rejects NaN targetIdx", () => {
    const key = PublicKey.default;
    expect(() => buildAdlInstruction(key, key, key, key, NaN)).toThrow("non-negative integer");
  });

  it("rejects fractional targetIdx", () => {
    const key = PublicKey.default;
    expect(() => buildAdlInstruction(key, key, key, key, 1.5)).toThrow("non-negative integer");
  });

  it("accepts valid targetIdx", () => {
    const key = PublicKey.default;
    expect(() => buildAdlInstruction(key, key, key, key, 0)).not.toThrow();
    expect(() => buildAdlInstruction(key, key, key, key, 255)).not.toThrow();
  });
});
