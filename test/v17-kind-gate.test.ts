/**
 * Regression tests for #264 — v17 market discovery must reject non-market
 * accounts. The looser `isV17Account` check accepts ANY v17 account (same
 * magic + version), so a portfolio / ledger / registry account would falsely
 * be treated as a market. `isV17MarketAccount` additionally requires the
 * kind byte at offset 10 to equal V17_KIND_MARKET (1).
 */

import { describe, it, expect } from "vitest";
import {
  isV17Account,
  isV17MarketAccount,
  V17_KIND_MARKET,
  V17_MAGIC,
  V17_EXPECTED_VERSION,
} from "../src/solana/slab.js";

/** Build a minimal v17 header (16 bytes) with the given kind byte. */
function v17Header(kind: number, opts?: { magic?: bigint; version?: number; len?: number }): Uint8Array {
  const len = opts?.len ?? 16;
  const buf = new Uint8Array(len);
  const v = new DataView(buf.buffer);
  v.setBigUint64(0, opts?.magic ?? V17_MAGIC, true); // magic [0..8]
  v.setUint16(8, opts?.version ?? V17_EXPECTED_VERSION, true); // version [8..10]
  buf[10] = kind; // kind [10]
  return buf;
}

describe("#264 — isV17MarketAccount kind gate", () => {
  it("V17_KIND_MARKET is 1 (matches percolator-prog KIND_MARKET)", () => {
    expect(V17_KIND_MARKET).toBe(1);
  });

  it("accepts a v17 MARKET account (kind == 1)", () => {
    const data = v17Header(V17_KIND_MARKET);
    expect(isV17Account(data)).toBe(true);
    expect(isV17MarketAccount(data)).toBe(true);
  });

  it("rejects a v17 PORTFOLIO account (kind == 2) that passes the loose check", () => {
    const data = v17Header(2);
    // The vulnerability: the loose check passes...
    expect(isV17Account(data)).toBe(true);
    // ...but the strict market gate rejects it.
    expect(isV17MarketAccount(data)).toBe(false);
  });

  it("rejects every non-market v17 kind (3..7)", () => {
    for (const kind of [3, 4, 5, 6, 7]) {
      const data = v17Header(kind);
      expect(isV17Account(data)).toBe(true);
      expect(isV17MarketAccount(data)).toBe(false);
    }
  });

  it("rejects a kind-1 buffer that is NOT a v17 account (bad magic)", () => {
    const data = v17Header(V17_KIND_MARKET, { magic: 0xdeadbeefn });
    expect(isV17Account(data)).toBe(false);
    expect(isV17MarketAccount(data)).toBe(false);
  });

  it("rejects a kind-1 buffer with the wrong version", () => {
    const data = v17Header(V17_KIND_MARKET, { version: 12 });
    expect(isV17MarketAccount(data)).toBe(false);
  });

  it("rejects buffers too short to hold the kind byte", () => {
    // 10 bytes: magic + version present, kind byte (offset 10) missing.
    const short = v17Header(V17_KIND_MARKET, { len: 10 });
    expect(isV17MarketAccount(short)).toBe(false);
    expect(isV17MarketAccount(new Uint8Array(0))).toBe(false);
  });
});
