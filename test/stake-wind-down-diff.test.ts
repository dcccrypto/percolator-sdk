/**
 * Differential: decodeTerminalInsuranceCapacity (one DataView per call) vs the frozen per-field-DataView
 * reference, over 10k random buffers incl. short / truncated / offset-view buffers. Output and thrown
 * errors (class + message) must be identical.
 */
import { describe, it, expect } from "vitest";
import { decodeTerminalInsuranceCapacity as next } from "../src/solana/stake-wind-down.js";
import { decodeTerminalInsuranceCapacity as legacy } from "./helpers/stake-wind-down.legacy.js";
import { LAYOUT_V22 } from "../src/abi/layout.js";
import { stampMarket } from "./helpers/stamp.js";

let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };

const run = (f: typeof next, d: Uint8Array, a: number) => {
  try { return { ok: f(d, a) }; } catch (e) { return { err: `${(e as Error).constructor.name}: ${(e as Error).message}` }; }
};

describe("decodeTerminalInsuranceCapacity differential vs per-field-DataView reference", () => {
  it("10k random buffers: identical output and identical errors", () => {
    const FULL = 1 << 18;
    const base = new Uint8Array(FULL);
    for (let i = 0; i < FULL; i++) base[i] = rnd() & 0xff;
    let okCount = 0, errCount = 0;
    for (let n = 0; n < 10_000; n++) {
      const mode = n % 4;
      let len: number;
      if (mode === 0) len = FULL; // full
      else if (mode === 1) len = rnd() % FULL; // random truncation (usually short)
      else if (mode === 2) len = 16 + (rnd() % 200_000);
      else len = 0 + (rnd() % 64);
      const off = rnd() % 64; // non-zero byteOffset view
      const d = new Uint8Array(base.buffer, off, Math.min(len, FULL - off)).slice(0); // own copy
      for (let i = 0; i < d.length; i += 1 + (rnd() % 4096)) d[i] = rnd() & 0xff; // perturb
      if (n % 3 !== 0) stampMarket(d.length >= 16 ? d : new Uint8Array(16), LAYOUT_V22.version);
      const view = n % 5 === 0 ? new Uint8Array(d.buffer, d.byteOffset, d.length) : d;
      const asset = [0, 0, 1, 2, -1, 1.5, 7][n % 7];
      const a = run(next, view, asset), b = run(legacy, view, asset);
      expect(a).toEqual(b);
      if ("ok" in a) okCount++; else errCount++;
    }
    expect(okCount).toBeGreaterThan(500);
    expect(errCount).toBeGreaterThan(500);
  }, 120_000);

  it("offset-view (byteOffset != 0) full buffer decodes identically", () => {
    const big = new Uint8Array(1 << 19);
    for (let i = 0; i < big.length; i++) big[i] = rnd() & 0xff;
    const view = big.subarray(24, 24 + (1 << 18));
    stampMarket(view, LAYOUT_V22.version);
    expect(run(next, view, 0)).toEqual(run(legacy, view, 0));
    expect("ok" in run(next, view, 0)).toBe(true);
  });
});
