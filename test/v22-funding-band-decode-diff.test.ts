import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as NewF from "../src/abi/v22-funding.js";
import * as NewB from "../src/abi/v22-band.js";
import * as OldF from "./helpers/legacy-v22-funding.js";
import * as OldB from "./helpers/legacy-v22-band.js";
import { LAYOUT_V22 } from "../src/abi/layout.js";
import { stampMarket } from "./helpers/stamp.js";

// Differential: the one-DataView-per-decode readers must give byte-identical results (or the same throw) as the
// per-field-DataView originals (copied verbatim into test/helpers/legacy-v22-*.ts).
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
const run = <T,>(f: () => T): { ok: T } | { err: string } => {
  try { return { ok: f() }; } catch (e) { return { err: `${(e as Error).constructor.name}: ${(e as Error).message}` }; }
};
const L = LAYOUT_V22;
const SLOTS = 4;
function randomMarket(r: () => number): Uint8Array {
  const extra = Math.floor(r() * 3) === 0 ? Math.floor(r() * 40) - 20 : 0;
  const d = new Uint8Array(L.marketGroupOff + L.marketGroupLen + L.assetSlotStride * SLOTS + extra);
  // Random pool bytes, then random sparse overwrites: cheap per buffer, still hits managed/bound/zero-mark branches.
  for (let i = 0; i < d.length; i += 4) {
    const w = Math.floor(r() * 2 ** 32);
    d[i] = w; d[i + 1] = w >>> 8; d[i + 2] = w >>> 16; d[i + 3] = w >>> 24;
  }
  for (let i = 0; i < d.length; i += 7) if (r() < 0.3) d[i] = 0;
  return stampMarket(d, 19);
}
const bigintSafe = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));

describe("funding/band decode: differential vs the per-field-DataView originals", () => {
  let mismatches = 0;
  const same = (a: unknown, b: unknown) => { if (bigintSafe(a) !== bigintSafe(b)) mismatches++; };
  it("10k randomized buffers", () => {
    const r = rng(0xc0ffee);
    let oks = 0;
    for (let n = 0; n < 10_000; n++) {
      const d = randomMarket(r);
      const idx = Math.floor(r() * (SLOTS + 1));
      // non-zero byteOffset view of the full market, with non-zero padding on both sides
      const big = new Uint8Array(d.length + 11).fill(0xab);
      big.set(d, 3);
      const sub = n % 5 === 0 ? big.subarray(3, 3 + d.length) : d;
      for (const b of [d, sub]) {
        const cases: [string, () => unknown, () => unknown][] = [
          ["funding", () => NewF.decodeMarketFundingV22(b), () => OldF.decodeMarketFundingV22(b)],
          ["cfg", () => NewB.decodeBandConfigV22(b), () => OldB.decodeBandConfigV22(b)],
          ["band", () => NewB.decodeAssetBandStateV22(b, idx), () => OldB.decodeAssetBandStateV22(b, idx)],
          ["rent", () => NewB.decodeAssetRentStateV22(b, idx), () => OldB.decodeAssetRentStateV22(b, idx)],
        ];
        for (const [, nf, of] of cases) {
          const a = run(nf), o = run(of);
          if ("ok" in a) oks++;
          same(a, o);
        }
      }
    }
    expect(mismatches).toBe(0);
    expect(oks).toBeGreaterThan(10_000);
  }, 120_000);
  it("existing real fixtures", () => {
    for (const f of ["v22-qa-overnight-2026-10-14.json"]) {
      const FX = JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
      for (const a of Object.values(FX.accounts) as { dataBase64: string }[]) {
        const b = new Uint8Array(Buffer.from(a.dataBase64, "base64"));
        same(run(() => NewF.decodeMarketFundingV22(b)), run(() => OldF.decodeMarketFundingV22(b)));
        same(run(() => NewB.decodeAssetBandStateV22(b, 0)), run(() => OldB.decodeAssetBandStateV22(b, 0)));
        same(run(() => NewB.decodeAssetRentStateV22(b, 0)), run(() => OldB.decodeAssetRentStateV22(b, 0)));
        same(run(() => NewB.decodeBandConfigV22(b)), run(() => OldB.decodeBandConfigV22(b)));
      }
    }
    expect(mismatches).toBe(0);
  });
});
