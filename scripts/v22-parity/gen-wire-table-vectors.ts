/**
 * Emit one "<id> <hex>" line per row of test/wire-size-v22/table.ts, for the Rust decode oracle
 * (sdk_wire_table_parity.rs). Unlike the table itself (hand-derived from the decoder source), the oracle
 * runs the REAL `Instruction::decode` on the SDK encoder's bytes, so a hand-transcription error cannot hide.
 *   npx tsx scripts/v22-parity/gen-wire-table-vectors.ts > wire-vectors.txt
 */
import { ROWS, parseSpec, valuesByName } from "../../test/wire-size-v22/table.js";

ROWS.forEach((row, i) => {
  const bytes = row.enc(valuesByName(parseSpec(row.spec)));
  const id = `${row.tag}:${row.name}:${i}:${row.form.replace(/\s+/g, "_")}`;
  process.stdout.write(`${id} ${Buffer.from(bytes).toString("hex")}\n`);
});
