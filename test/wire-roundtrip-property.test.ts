/**
 * Round-trip property test for every v2.2 instruction encoder in the wire table
 * (test/wire-size-v22/table.ts, program decoder v16_program.rs `Instruction::decode`).
 *
 * wire-size-v22.test.ts checks each row once with one fixed value per field. This file
 * re-runs every row with boundary and seeded-random values for each field that the table does not pin:
 *   0, 1, type max, signed min / max / -1, and 8 seeded random values per type.
 * The encoded bytes are decoded with an independent DataView reader and must equal the input exactly.
 *
 * An encoder is allowed to REJECT a value (it throws; that is SDK validation such as a bps cap).
 * It is not allowed to ACCEPT a value and then emit different bytes (truncation, wrap, wrong offset,
 * or a changed length). Rejections are counted and printed so over-strict validation is visible.
 */
import { describe, it, expect, afterAll } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { ROWS, SIZE, parseSpec, valuesByName, expectedLength, type Field, type FieldType } from "./wire-size-v22/table.js";

const SEED_COUNT = 8;

// Deterministic xorshift128+ so failures reproduce.
function rng(seed: number) {
  let s0 = BigInt(seed) * 0x9e3779b97f4a7c15n & 0xffffffffffffffffn || 1n;
  let s1 = 0xbf58476d1ce4e5b9n;
  const M = 0xffffffffffffffffn;
  return (): bigint => {
    let x = s0;
    const y = s1;
    s0 = y;
    x ^= (x << 23n) & M;
    s1 = x ^ y ^ (x >> 17n) ^ (y >> 26n);
    return (s1 + y) & M;
  };
}

const ZERO_RNG = () => 0n;
const BITS: Record<Exclude<FieldType, "pk">, number> = { u8: 8, u16: 16, u32: 32, u64: 64, u128: 128, i64: 64, i128: 128 };
const SIGNED = (t: FieldType) => t === "i64" || t === "i128";

function candidates(type: FieldType, next: () => bigint): (bigint | number | PublicKey)[] {
  if (type === "pk") {
    const out: PublicKey[] = [new PublicKey(new Uint8Array(32)), new PublicKey(new Uint8Array(32).fill(0xff))];
    for (let i = 0; i < SEED_COUNT; i++) {
      const b = new Uint8Array(32);
      for (let j = 0; j < 4; j++) new DataView(b.buffer).setBigUint64(j * 8, next(), true);
      out.push(new PublicKey(b));
    }
    return out;
  }
  const bits = BITS[type];
  const signed = SIGNED(type);
  const vals: bigint[] = signed
    ? [0n, 1n, -1n, (1n << BigInt(bits - 1)) - 1n, -(1n << BigInt(bits - 1))]
    : [0n, 1n, (1n << BigInt(bits)) - 1n];
  for (let i = 0; i < SEED_COUNT; i++) {
    let v = 0n;
    for (let k = 0; k < bits; k += 64) v = (v << 64n) | next();
    v &= (1n << BigInt(bits)) - 1n;
    if (signed && v >= 1n << BigInt(bits - 1)) v -= 1n << BigInt(bits);
    vals.push(v);
  }
  return type === "u8" || type === "u16" || type === "u32" ? vals.map(Number) : vals;
}

function readField(dv: DataView, off: number, type: FieldType, bytes: Uint8Array): bigint | number | string {
  switch (type) {
    case "u8": return dv.getUint8(off);
    case "u16": return dv.getUint16(off, true);
    case "u32": return dv.getUint32(off, true);
    case "u64": return dv.getBigUint64(off, true);
    case "i64": return dv.getBigInt64(off, true);
    case "u128": return (dv.getBigUint64(off + 8, true) << 64n) | dv.getBigUint64(off, true);
    case "i128": return (dv.getBigInt64(off + 8, true) << 64n) | dv.getBigUint64(off, true);
    case "pk": return new PublicKey(bytes.slice(off, off + 32)).toBase58();
  }
}

const norm = (v: bigint | number | PublicKey) => (v instanceof PublicKey ? v.toBase58() : v);

/** Pinned in the table with `=value` (enum, cap or version byte): the encoder validates it, so leave it alone. */
const isPinned = (spec: string, name: string) => new RegExp(`(^|\\s)${name}:[a-z0-9]+=`).test(spec);

/** (tag, field, value) triples actually compared; reported in afterAll and must stay constant across refactors. */
let triples = 0;

/**
 * Compare encoded bytes to the input fields. Mismatches are collected (not asserted per value) so the
 * hot loop stays cheap; the test asserts the list is empty once per row.
 */
function check(row: (typeof ROWS)[number], fields: Field[], bytes: Uint8Array, bad: string[]) {
  triples += 2;
  if (bytes[0] !== row.tag) bad.push(`tag byte ${bytes[0]} != ${row.tag}`);
  const want = expectedLength(fields);
  if (bytes.length !== want) bad.push(`length ${bytes.length} != ${want}`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 1;
  for (const f of fields) {
    triples++;
    const got = readField(dv, off, f.type, bytes);
    const exp = norm(f.value);
    if (got !== exp) bad.push(`${f.name}:${f.type} at offset ${off}: got ${String(got)} want ${String(exp)}`);
    off += SIZE[f.type];
  }
}

const stats = { rows: 0, rowsWithFreeFields: 0, accepted: 0, rejected: 0 };
const rejectedByRow: string[] = [];

/** Encode once; null when the encoder rejects (throws a non-TypeError). TypeErrors are test bugs and propagate. */
function tryEncode(row: (typeof ROWS)[number], fields: Field[]): Uint8Array | null {
  try { return row.enc(valuesByName(fields)); } catch (e) { if (e instanceof TypeError) throw e; return null; }
}

describe("v2.2 instruction encoders round-trip boundary and random values", () => {
  ROWS.forEach((row, rowIdx) => {
    if (row.mismatch) return; // legacy shape the program rejects; covered by it.fails in wire-size-v22.test.ts
    it(`tag ${row.tag} ${row.name} [${row.form}]`, () => {
      const base = parseSpec(row.spec);
      const pinned = base.map((f) => isPinned(row.spec, f.name));
      const free = base.filter((_, i) => !pinned[i]);
      stats.rows++;
      if (free.length) stats.rowsWithFreeFields++;
      const next = rng(1000 + rowIdx);
      let accepted = 0;
      let rejected = 0;
      const bad: string[] = [];
      const run = (fields: Field[]) => {
        const bytes = tryEncode(row, fields);
        if (!bytes) { rejected++; return; }
        accepted++;
        check(row, fields, bytes, bad);
      };

      // 1) Vary one field at a time (others at table default): isolates the field under test.
      for (const target of free) {
        const idx = base.indexOf(target);
        for (const v of candidates(target.type, next)) {
          const fields = base.slice();
          fields[idx] = { ...target, value: v };
          run(fields);
        }
      }
      // 2) All free fields at once, seeded random, to catch cross-field offset bleed.
      for (let i = 0; i < SEED_COUNT; i++) {
        run(base.map((f, k) => { if (pinned[k]) return f; const c = candidates(f.type, next); return { ...f, value: c[c.length - SEED_COUNT + i] }; }));
      }
      // 3) All free fields at max, then all at zero. Boundary entries are fixed (c[0..2|4]); no draws needed
      //    (nothing is drawn after this point, so skipping the draws leaves every earlier value unchanged).
      for (const pick of ["max", "zero"] as const) {
        run(base.map((f, k) => {
          if (pinned[k]) return f;
          const c = candidates(f.type, ZERO_RNG);
          return { ...f, value: pick === "zero" ? c[0] : f.type === "pk" ? c[1] : SIGNED(f.type) ? c[3] : c[2] };
        }));
      }
      stats.accepted += accepted;
      stats.rejected += rejected;
      if (rejected) rejectedByRow.push(`tag ${row.tag} ${row.name}[${row.form}]: ${rejected} rejected / ${accepted} accepted`);
      expect(bad.slice(0, 5), "round-trip mismatches").toEqual([]);
      // Every row must actually exercise the encoder with something other than the fixed table value.
      if (free.length) expect(accepted, "no boundary/random value was accepted").toBeGreaterThan(0);
    });
  });

  afterAll(() => {
    process.stderr.write(
      `[roundtrip] rows=${stats.rows} withFreeFields=${stats.rowsWithFreeFields} accepted=${stats.accepted} rejected=${stats.rejected} triples=${triples}\n` +
        rejectedByRow.join("\n") + "\n",
    );
  });
});
