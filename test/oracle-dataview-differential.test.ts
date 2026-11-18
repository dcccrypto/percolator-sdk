import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseChainlinkPrice } from "../src/solana/oracle.js";
import { parseChainlinkPrice as legacyParse } from "./helpers/oracle-legacy.js";

type Out = { ok: true; v: unknown } | { ok: false; e: string };
function run(fn: typeof parseChainlinkPrice, b: Uint8Array, o?: object): Out {
  try {
    return { ok: true, v: fn(b, o) };
  } catch (e) {
    return { ok: false, e: (e as Error).message };
  }
}

// xorshift32, deterministic
let st = 0x9e3779b9;
const rnd = () => {
  st ^= st << 13; st >>>= 0;
  st ^= st >>> 17;
  st ^= st << 5; st >>>= 0;
  return st;
};

function fixtures(): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const dir of ["fixtures/accounts", "test/fixtures"]) {
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith(".json")) continue;
      try {
        const j = JSON.parse(readFileSync(`${dir}/${n}`, "utf8"));
        const d = j?.data ?? j?.account?.data ?? j?.value?.data;
        const b64 = Array.isArray(d) ? d[0] : typeof d === "string" ? d : null;
        if (b64) out.push(new Uint8Array(Buffer.from(b64, "base64")));
      } catch { /* not an account fixture */ }
    }
  }
  return out;
}

describe("parseChainlinkPrice: single-DataView == legacy per-read DataView", () => {
  // Freeze the clock so staleness messages cannot differ by a tick between calls.
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-18T00:00:00Z")); });
  afterAll(() => { vi.useRealTimers(); });

  it("matches on 12000 random buffers (values and thrown errors)", () => {
    const optsList = [
      undefined,
      { maxStalenessSeconds: 3600 },
      { maxStalenessSeconds: 1e9, futureToleranceSeconds: 5 },
      { maxStalenessSeconds: NaN },
    ];
    let ok = 0, err = 0;
    for (let i = 0; i < 12000; i++) {
      const len = i % 5 === 0 ? rnd() % 300 : 248 + (rnd() % 64);
      const b = new Uint8Array(len);
      for (let k = 0; k < len; k++) b[k] = rnd() & 0xff;
      if (len > 138 && i % 3) b[138] = rnd() % 20; // mostly plausible decimals
      if (len >= 232 && i % 4 === 0) b.fill(0, 224, 232); // small positive/zero answers
      if (len >= 232 && i % 7 === 0) b.fill(0xff, 224, 232); // negative answers
      if (len > 212 && i % 6 === 0) new DataView(b.buffer).setUint32(208, Math.floor(Date.now() / 1000) - (rnd() % 7200), true);
      for (const o of optsList) {
        const a = run(legacyParse, b, o), c = run(parseChainlinkPrice, b, o);
        expect(c).toEqual(a);
        a.ok ? ok++ : err++;
      }
    }
    expect(ok).toBeGreaterThan(1000);
    expect(err).toBeGreaterThan(1000);
  }, 120_000);

  it("matches on views with non-zero byteOffset (subarray of a larger buffer)", () => {
    for (let i = 0; i < 1000; i++) {
      const big = new Uint8Array(400);
      for (let k = 0; k < 400; k++) big[k] = rnd() & 0xff;
      big[7 + 138] = rnd() % 19;
      const v = big.subarray(7, 7 + 248 + (rnd() % 100));
      expect(run(parseChainlinkPrice, v)).toEqual(run(legacyParse, v));
    }
  });

  it("matches on every account fixture in the repo", () => {
    for (const b of fixtures()) expect(run(parseChainlinkPrice, b)).toEqual(run(legacyParse, b));
  });
});
