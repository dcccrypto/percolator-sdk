/**
 * Bench: creator-fee-payee-v22 derivations + decode. 1k markets x 4 assets.
 * Run: npx tsx test/bench/creator-fee-payee.bench.ts   (prints ns/op)
 * "cold" = first pass over fresh keys (no memo hits possible); "warm" = same keys re-queried (app refresh).
 */
import { PublicKey } from "@solana/web3.js";
import { webcrypto } from "node:crypto";
import { ACCOUNT_KIND, LAYOUT_V22 } from "../../src/abi/layout.js";
import {
  CREATOR_FEE_PAYEE_ACCOUNT_LEN_V22,
  creatorFeePayeeDestinationV22,
  decodeCreatorFeePayeeV22,
  deriveCreatorFeePayeeV22,
} from "../../src/abi/creator-fee-payee-v22.js";
import { stampHeader } from "../helpers/stamp.js";

const rnd32 = (): Uint8Array => webcrypto.getRandomValues(new Uint8Array(32));
const rnd = (): PublicKey => new PublicKey(rnd32());
const N_MARKETS = 1000;
const ASSETS = 4;
const programId = rnd();
const mint = rnd();
const markets = Array.from({ length: N_MARKETS }, rnd);
const payees = Array.from({ length: N_MARKETS * ASSETS }, rnd);
const records = payees.map((p, i) => {
  const d = stampHeader(new Uint8Array(CREATOR_FEE_PAYEE_ACCOUNT_LEN_V22), ACCOUNT_KIND.CreatorFeePayee, LAYOUT_V22.version);
  d.set(markets[(i / ASSETS) | 0].toBytes(), 16);
  d.set(p.toBytes(), 48);
  d[80] = i % ASSETS;
  d[82] = 1; // record version
  d[83] = 255; // bump
  return d;
});

function time(label: string, ops: number, fn: () => void): void {
  const t0 = process.hrtime.bigint();
  fn();
  const ns = Number(process.hrtime.bigint() - t0) / ops;
  console.log(`${label.padEnd(24)} ${ns.toFixed(0).padStart(9)} ns/op  (${ops} ops)`);
}
const ops = N_MARKETS * ASSETS;
const derive = (ms: PublicKey[]): void => { for (const m of ms) for (let a = 0; a < ASSETS; a++) deriveCreatorFeePayeeV22(programId, m, a); };
const dest = (ps: PublicKey[]): void => { for (const p of ps) creatorFeePayeeDestinationV22(p, mint); };
const decode = (): void => { for (const r of records) decodeCreatorFeePayeeV22(r); };

// JIT warmup on throwaway keys (does not populate the measured key set)
derive(Array.from({ length: 50 }, rnd));
dest(Array.from({ length: 200 }, rnd));
decode();
time("derive payee cold", ops, () => derive(markets));
time("derive payee warm", ops, () => derive(markets));
time("dest ATA cold", ops, () => dest(payees));
time("dest ATA warm", ops, () => dest(payees));
time("decode", ops, decode);
