/**
 * Emit #587 encoder vectors ("<id> <hex>" per line) for the Rust parity oracle (sdk_587_parity.rs).
 *   npx tsx scripts/creator-fee-payee-parity/gen-vectors.ts > vectors.txt
 * Each accepted vector also gets __short / __long negatives; PAYEE_REFUSED vectors are emitted as-is.
 */
import { PAYEE_REFUSED, PAYEE_VECTORS } from "../../test/creator-fee-payee-vector-inputs.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
for (const [id, v] of Object.entries(PAYEE_VECTORS)) {
  const b = v.build();
  process.stdout.write(`${id} ${hex(b)}\n`);
  process.stdout.write(`${id}__short ${hex(b.subarray(0, b.length - 1))}\n`);
  process.stdout.write(`${id}__long ${hex(b)}00\n`);
}
for (const [id, f] of Object.entries(PAYEE_REFUSED)) process.stdout.write(`refused_${id} ${hex(f())}\n`);
