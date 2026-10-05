/**
 * Emit P2b encoder vectors ("<id> <hex>" per line) for the Rust parity oracle (`sdk_p2b_parity.rs`).
 * The inputs are mirrored in `test/p2b-earn.test.ts` (P2B_VECTOR_INPUTS), which re-encodes and
 * compares against the committed fixture.
 *
 *   npx tsx scripts/p2b-parity/gen-vectors.ts > vectors.txt
 */
import { P2B_VECTOR_INPUTS, encodeP2bVector } from "../../test/p2b-vector-inputs.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
for (const [id, input] of Object.entries(P2B_VECTOR_INPUTS)) {
  const b = encodeP2bVector(input);
  process.stdout.write(`${id} ${hex(b)}\n`);
  // negative controls: the decoder must reject a short and a long payload (the trailer forms
  // are length-selected, so only the plain tags get a __long that must fail)
  if (b.length > 1) process.stdout.write(`${id}__short ${hex(b.subarray(0, b.length - 1))}\n`);
  process.stdout.write(`${id}__long ${hex(b)}00\n`);
}
// A partial tag-99 dials trailer is NOT a legacy tag 99: the decoder treats any non-empty trailer as the dials form.
const legacy = encodeP2bVector(P2B_VECTOR_INPUTS.setRiskLegacy);
process.stdout.write(`setRiskV19__trailer2 ${hex(legacy)}8813\n`);
process.stdout.write(`setRiskV19__trailer6 ${hex(legacy)}881388138813\n`);
