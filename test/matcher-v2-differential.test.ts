/**
 * Differential: optimised matcher-v2 encoders/decoder vs the verbatim pre-optimisation copy
 * (test/helpers/matcher-v2-base.ts), over 50k seeded random valid inputs each.
 */
import { describe, expect, it } from "vitest";
import {
  decodeMatcherCallExt, encodeMatcherBatchCall, encodeMatcherCallExt, encodeMatcherConfigureBackingFeeCap,
  encodeMatcherConfigureSetParams, encodeMatcherSetParams,
} from "../src/abi/matcher-v2.js";
import {
  baseDecodeCallExt, baseEncodeBatchCall, baseEncodeCallExt, baseEncodeConfigureBackingFeeCap, baseEncodeConfigureSetParams,
  baseEncodeMatcherSetParams,
} from "./helpers/matcher-v2-base.js";
import { genCallExt, genLegs, genOwnerProof, genSetParams, makeRng } from "./helpers/matcher-v2-gen.js";

const N = 50_000;
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

describe("matcher-v2 differential vs base implementation", () => {
  it("SetParams + Configure encodes are byte-identical (50k)", () => {
    const r = makeRng(1);
    const proofs = Array.from({ length: 64 }, () => genOwnerProof(r));
    for (let i = 0; i < N; i++) {
      const p = genSetParams(r);
      const proof = proofs[i & 63]!;
      if (!same(encodeMatcherSetParams(p), baseEncodeMatcherSetParams(p))) throw new Error(`SetParams mismatch @${i}`);
      if (!same(encodeMatcherConfigureSetParams(proof, p), baseEncodeConfigureSetParams(proof, p))) throw new Error(`Configure mismatch @${i}`);
      const cap = r.int(0, 10000);
      if (!same(encodeMatcherConfigureBackingFeeCap(proof, cap), baseEncodeConfigureBackingFeeCap(proof, cap))) throw new Error(`Cap mismatch @${i}`);
    }
  }, 120_000);

  it("call ext encode byte-identical; decode deep-equal for valid and arbitrary 24/67-byte input (50k)", () => {
    const r = makeRng(2);
    for (let i = 0; i < N; i++) {
      const e = genCallExt(r);
      const enc = encodeMatcherCallExt(e);
      if (!same(enc, baseEncodeCallExt(e))) throw new Error(`CallExt encode mismatch @${i}`);
      expect(decodeMatcherCallExt(enc)).toStrictEqual(baseDecodeCallExt(enc));
      // arbitrary / mutated bytes: same result or same error message
      const raw = i % 3 === 0 ? r.bytes(24) : Uint8Array.from(enc, (b, k) => (r.int(0, 15) === 0 && k < 24 ? r.int(0, 255) : b));
      const full = i % 2 === 0 ? raw : (() => { const c = new Uint8Array(67); c.set(raw, 43); return c; })();
      let a: unknown, b: unknown;
      try { a = decodeMatcherCallExt(full); } catch (x) { a = (x as Error).message; }
      try { b = baseDecodeCallExt(full); } catch (x) { b = (x as Error).message; }
      expect(a).toStrictEqual(b);
    }
  }, 120_000);

  it("batch call byte-identical incl. negative and out-of-i128 sizes (50k)", () => {
    const r = makeRng(3);
    for (let i = 0; i < N; i++) {
      const { legs, exts } = genLegs(r);
      if (i % 50 === 0) legs[0]!.reqSize = r.bool() ? (1n << 127n) : -(1n << 127n);
      if (!same(encodeMatcherBatchCall(7n, 9n, legs, exts), baseEncodeBatchCall(7n, 9n, legs, exts))) throw new Error(`Batch mismatch @${i}`);
    }
  }, 120_000);
});
