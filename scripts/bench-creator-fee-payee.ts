// Bench: 10k (derive PDA + derive payee ATA + encode + decode) over 100 markets, median of 5.
// Run: npx tsx scripts/bench-creator-fee-payee.ts
import { Keypair } from "@solana/web3.js";
// BENCH_IMPL=<path to an alternate copy of the module> benches that instead (used for the before number).
const M = await import(process.env.BENCH_IMPL ?? "../src/abi/creator-fee-payee-v22.js");
const { CREATOR_FEE_PAYEE_ACCOUNT_LEN_V22, creatorFeePayeeDestinationV22, decodeCreatorFeePayeeV22, deriveCreatorFeePayeeV22, encodeSetCreatorFeePayeeV22 } = M;
import { ACCOUNT_KIND } from "../src/abi/layout.js";
import { stampHeader } from "../test/helpers/stamp.js";

const programId = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const N = 100;
const ITER = 10_000;
const markets = Array.from({ length: N }, () => Keypair.generate().publicKey);
const payees = Array.from({ length: N }, () => Keypair.generate().publicKey);
const records = markets.map((m, i) => {
  const d = new Uint8Array(CREATOR_FEE_PAYEE_ACCOUNT_LEN_V22);
  stampHeader(d, ACCOUNT_KIND.CreatorFeePayee, 19);
  d.set(m.toBytes(), 16);
  d.set(payees[i].toBytes(), 48);
  d[80] = i;
  d[82] = 1;
  return d;
});

function once(): number {
  const t = performance.now();
  let sink = 0;
  for (let i = 0; i < ITER; i++) {
    const k = i % N;
    const [pda] = deriveCreatorFeePayeeV22(programId, markets[k], k);
    const ata = creatorFeePayeeDestinationV22(payees[k], mint);
    const data = encodeSetCreatorFeePayeeV22({ assetIndex: k, marketId: 1n, payee: payees[k], authorityEpoch: 0n });
    const rec = decodeCreatorFeePayeeV22(records[k]);
    sink += pda.toBytes()[0] + ata.toBytes()[0] + data[1] + rec.bump;
  }
  if (sink < 0) console.log(sink);
  return performance.now() - t;
}

const runs = Array.from({ length: 5 }, once).sort((a, b) => a - b);
console.log(JSON.stringify({ runsMs: runs.map((x) => +x.toFixed(1)), medianMs: +runs[2].toFixed(1) }));
