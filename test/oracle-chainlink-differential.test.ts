/**
 * Differential test: parseChainlinkPrice / isValidChainlinkOracle vs a frozen
 * copy of the pre-DataView-hoist implementation (test/fixtures/oracle-reference.ts).
 * Output and thrown messages must be identical on random + truncated buffers.
 */
import { describe, expect, it, vi } from "vitest";
import * as cur from "../src/solana/oracle.js";
import * as ref from "./fixtures/oracle-reference.js";

const FROZEN_NOW_MS = 1_800_000_000_000;

// deterministic xorshift32
let seed = 0x9e3779b9;
function rnd(): number {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed;
}

function run<T>(f: () => T): { ok: true; v: T } | { ok: false; msg: string } {
  try { return { ok: true, v: f() }; } catch (e) { return { ok: false, msg: (e as Error).message }; }
}

function makeBuf(): { buf: Uint8Array; opts?: cur.ParseChainlinkOptions } {
  const len = rnd() % 4 === 0 ? rnd() % 300 : 248 + (rnd() % 40);
  const backing = new Uint8Array(len + 16);
  for (let i = 0; i < backing.length; i++) backing[i] = rnd() & 0xff;
  // subarray view with non-zero byteOffset to exercise offset handling
  const buf = backing.subarray(rnd() % 8, 8 + len - (rnd() % 8 === 0 ? 1 : 0));
  if (buf.length >= 248) {
    const mode = rnd() % 5;
    if (mode > 0) buf[138] = rnd() % 22; // decimals, mostly plausible
    if (mode > 1) { // plausible timestamp
      new DataView(buf.buffer, buf.byteOffset, buf.byteLength).setUint32(
        208, mode === 2 ? 0 : Math.floor(FROZEN_NOW_MS / 1000) - (rnd() % 7200) + 30, true);
    }
    if (mode === 3) buf.fill(0, 216, 232); // zero answer
    if (mode === 4) buf[231] &= 0x7f; // positive high half
  }
  let opts: cur.ParseChainlinkOptions | undefined;
  const o = rnd() % 6;
  if (o === 1) opts = { maxStalenessSeconds: 3600 };
  if (o === 2) opts = { maxStalenessSeconds: 60, futureToleranceSeconds: 5 };
  if (o === 3) opts = { maxStalenessSeconds: NaN };
  if (o === 4) opts = { maxStalenessSeconds: 10, futureToleranceSeconds: NaN };
  return { buf, opts };
}

describe("oracle differential vs reference", () => {
  it("matches on 30k random/truncated buffers (values and thrown messages)", () => {
    // Freeze the clock so staleness messages cannot differ across a second tick.
    vi.spyOn(Date, "now").mockReturnValue(FROZEN_NOW_MS);
    const diffs: string[] = [];
    let mismatches = 0, okCount = 0, errCount = 0;
    const msgs = new Set<string>();
    for (let i = 0; i < 30_000; i++) {
      const { buf, opts } = makeBuf();
      // staleness paths read Date.now(); both calls are within the same second in practice
      const a = run(() => cur.parseChainlinkPrice(buf, opts));
      const b = run(() => ref.parseChainlinkPrice(buf, opts));
      const ser = (x: unknown) => JSON.stringify(x, (_, v) => (typeof v === "bigint" ? `${v}n` : v));
      if (ser(a) !== ser(b)) diffs.push(ser(a) + " vs " + ser(b));
      if (JSON.stringify(a, (_, v) => (typeof v === "bigint" ? `${v}n` : v)) !==
          JSON.stringify(b, (_, v) => (typeof v === "bigint" ? `${v}n` : v))) mismatches++;
      if (cur.isValidChainlinkOracle(buf) !== ref.isValidChainlinkOracle(buf)) mismatches++;
      if (a.ok) okCount++; else { errCount++; msgs.add(a.msg.replace(/\d+/g, "N")); }
    }
    if (mismatches) console.log(diffs.join("\n"));
    vi.restoreAllMocks();
    expect(mismatches).toBe(0);
    expect(okCount).toBeGreaterThan(1000);
    expect(errCount).toBeGreaterThan(1000);
    expect(msgs.size).toBeGreaterThanOrEqual(5);
  }, 120_000);
});
