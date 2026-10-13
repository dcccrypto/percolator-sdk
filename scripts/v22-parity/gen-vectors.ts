/**
 * Emit v2.2 encoder vectors ("<id> <hex>" per line) for the Rust parity oracle (sdk_v22_parity.rs).
 *   npx tsx scripts/v22-parity/gen-vectors.ts > vectors.txt
 * Each accepted vector also gets __short / __long negatives; V22_REFUSED vectors are emitted as-is.
 */
import { V22_REFUSED, V22_VECTORS } from "../../test/v22-vector-inputs.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
for (const [id, v] of Object.entries(V22_VECTORS)) {
  const b = v.build();
  process.stdout.write(`${id} ${hex(b)}\n`);
  if (b.length > 1) process.stdout.write(`${id}__short ${hex(b.subarray(0, b.length - 1))}\n`);
  process.stdout.write(`${id}__long ${hex(b)}00\n`);
}
for (const [id, f] of Object.entries(V22_REFUSED)) process.stdout.write(`refused_${id} ${hex(f())}\n`);
