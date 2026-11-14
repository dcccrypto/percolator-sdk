/**
 * Wire-size / field-offset test: every v2.2 instruction tag the SDK can encode, checked against
 * the table of what the wrapper decoder reads (test/wire-size-v22/table.ts).
 *
 * Table source: dcccrypto/percolator-prog @ feat/v22-rc23-2026-10-22 (ab85662),
 * src/v16_program.rs `Instruction::decode` (lines 10052-10950). The decoder rejects any trailing
 * byte (line 10945), so the encoded length has to match exactly, and each field has to sit at the
 * offset the decoder reads it from.
 *
 * For each row: byte 0 is the tag, total length is 1 + sum of the field sizes, and every field is
 * read back at its cumulative offset with an independent DataView reader.
 *
 * Rows marked `mismatch` are real SDK/program disagreements (the SDK emits a shape the decoder
 * rejects). The failing assertion is kept as `it.fails`, so the suite stays green while the bug is
 * on record; when the SDK is fixed, `it.fails` turns red and the marker must be removed.
 */
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { ROWS, NO_SDK_ENCODER, PROGRAM_TAGS, REJECTED_SHAPES, SIZE, parseSpec, valuesByName, expectedLength, PROG_FILE, PROG_BRANCH, type Field } from "./wire-size-v22/table.js";

function readField(dv: DataView, off: number, f: Field, bytes: Uint8Array): bigint | number | string {
  switch (f.type) {
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

function want(f: Field): bigint | number | string {
  return f.value instanceof PublicKey ? f.value.toBase58() : f.value;
}

function verify(row: (typeof ROWS)[number]) {
  const fields = parseSpec(row.spec);
  const bytes = row.enc(valuesByName(fields));
  expect(bytes[0], `tag byte (${PROG_FILE}:${row.prog})`).toBe(row.tag);
  expect(bytes.length, `data length (${PROG_FILE}:${row.prog}), want 1 + ${fields.map((f) => SIZE[f.type]).join(" + ")}`).toBe(expectedLength(fields));
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 1;
  for (const f of fields) {
    expect(readField(dv, off, f, bytes), `${f.name} at offset ${off}`).toBe(want(f));
    off += SIZE[f.type];
  }
  expect(off).toBe(bytes.length);
}

describe(`SDK encoders vs v2.2 decoder table (${PROG_BRANCH})`, () => {
  for (const row of ROWS) {
    const title = `tag ${row.tag} ${row.name} [${row.form}] — ${PROG_FILE}:${row.prog}`;
    it(title, () => verify(row));
    if (row.mismatch) {
      // Documented bug (see `mismatch` in table.ts): the SDK emits a shape the program refuses.
      it.fails(`tag ${row.tag} SDK must not emit a shape the program rejects [${row.form}]`, () => {
        const bytes = row.enc(valuesByName(parseSpec(row.spec)));
        const bad = REJECTED_SHAPES.find((r) => r.tag === bytes[0] && r.len === bytes.length);
        expect(bad, `${row.mismatch}`).toBeUndefined();
      });
    }
  }

  it("no SDK row without a mismatch marker emits a shape the program rejects", () => {
    for (const row of ROWS.filter((r) => !r.mismatch)) {
      const bytes = row.enc(valuesByName(parseSpec(row.spec)));
      const bad = REJECTED_SHAPES.find((r) => r.tag === bytes[0] && r.len === bytes.length);
      expect(bad, `tag ${row.tag} ${row.form}`).toBeUndefined();
    }
  });

  it("every program decoder tag is either tested here or listed as having no SDK encoder", () => {
    const covered = new Set([...ROWS.map((r) => r.tag), ...NO_SDK_ENCODER.map((n) => n.tag)]);
    expect([...covered].sort((a, b) => a - b)).toEqual(PROGRAM_TAGS);
    expect(PROGRAM_TAGS.length).toBe(102);
  });

  it("table has no duplicate (tag, form) rows", () => {
    const keys = ROWS.map((r) => `${r.tag}|${r.form}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("no tag is both encodable and listed as having no SDK encoder", () => {
    const encodable = new Set(ROWS.map((r) => r.tag));
    for (const n of NO_SDK_ENCODER) expect(encodable.has(n.tag), `tag ${n.tag}`).toBe(false);
  });
});
