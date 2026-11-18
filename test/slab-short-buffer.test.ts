/**
 * Truncated / short buffers must surface each slab decoder's OWN Error (message names the decoder and the
 * needed length), never a raw TypeError/RangeError from DataView access. Fail-before test for SDK-PERF-SLABPARSE.
 */
import { describe, expect, it } from "vitest";
import * as s from "../src/solana/slab.js";

const CASES: [string, (d: Uint8Array) => unknown, RegExp][] = [
  ["parseHeader", (d) => s.parseHeader(d), /too short for header: \d+ < 72|Invalid slab magic/],
  ["parseConfig", (d) => s.parseConfig(d), /parseConfig|too short|Unrecognized|\d+/],
  ["parseParams", (d) => s.parseParams(d), /parseParams|too short|\d+/],
  ["parseEngine", (d) => s.parseEngine(d), /parseEngine|Unrecognized slab data length: \d+|too short/],
  ["parseAccount", (d) => s.parseAccount(d, 0), /Unrecognized slab data length: \d+|too short|out of range/],
  ["parseAllAccounts", (d) => s.parseAllAccounts(d), /\d+/],
  ["parseAssetControlSequencesV17", (d) => s.parseAssetControlSequencesV17(d, 16), /parseAssetControlSequencesV17: data too short — need \d+ bytes, got \d+/],
  ["parseWrapperConfigV17", (d) => s.parseWrapperConfigV17(d), /parseWrapperConfigV17: data too short — need \d+ bytes, got \d+/],
  ["parseAssetOracleProfileV17", (d) => s.parseAssetOracleProfileV17(d, 16), /parseAssetOracleProfileV17: data too short — need \d+ bytes, got \d+/],
  ["parseMarketGroupV17OI", (d) => s.parseMarketGroupV17OI(d), /parseMarketGroupV17OI|too short|\d+/],
  ["parsePortfolioV17", (d) => s.parsePortfolioV17(d), /parsePortfolioV17: data too short \(\d+ < \d+\)/],
  ["parseLpVaultRegistry", (d) => s.parseLpVaultRegistry(d), /parseLpVaultRegistry: data too short \(\d+ < \d+\)/],
  ["parseLpRedemption", (d) => s.parseLpRedemption(d), /parseLpRedemption: data too short \(\d+ < \d+\)/],
];

function views(len: number): Uint8Array[] {
  const base = new Uint8Array(len + 64);
  return [new Uint8Array(len), base.subarray(13, 13 + len), detached(len)];
}

/** A view whose ArrayBuffer was transferred away: length reads 0 and `new DataView(...)` itself throws TypeError. */
function detached(len: number): Uint8Array {
  const u = new Uint8Array(len);
  structuredClone(u.buffer, { transfer: [u.buffer] });
  return u;
}

describe("slab decoders: short buffers throw the decoder's own Error", () => {
  for (const [name, fn, re] of CASES) {
    for (const len of [0, 1, 7, 8, 40, 71, 100]) {
      it(`${name} len=${len}`, () => {
        for (const d of views(len)) {
          let err: unknown;
          try { fn(d); } catch (e) { err = e; }
          expect(err, `${name} must throw`).toBeInstanceOf(Error);
          expect(err, "raw TypeError leaked").not.toBeInstanceOf(TypeError);
          expect(err, "raw RangeError leaked").not.toBeInstanceOf(RangeError);
          expect((err as Error).message).toMatch(re);
        }
      });
    }
  }
});
