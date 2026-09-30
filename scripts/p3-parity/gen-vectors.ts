/**
 * Emit P3 encoder vectors ("<id> <hex>" per line) for the Rust parity oracle
 * (`sdk_p3_parity.rs`). The inputs here are mirrored in `test/p3.test.ts` (P3_VECTOR_INPUTS),
 * which re-encodes and compares against the committed fixture.
 *
 *   npx tsx scripts/p3-parity/gen-vectors.ts > vectors.txt
 */
import { P3_VECTOR_INPUTS, encodeP3Vector } from "../../test/p3-vector-inputs.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
for (const [id, input] of Object.entries(P3_VECTOR_INPUTS)) {
  const b = encodeP3Vector(input);
  process.stdout.write(`${id} ${hex(b)}\n`);
  // negative controls: the decoder must reject a short and a long payload
  if (b.length > 1) process.stdout.write(`${id}__short ${hex(b.subarray(0, b.length - 1))}\n`);
  process.stdout.write(`${id}__long ${hex(b)}00\n`);
}
