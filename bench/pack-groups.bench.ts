/**
 * packInstructionGroups benchmark. Run: npx tsx bench/pack-groups.bench.ts
 * 200 groups, 1 ix each, 2 keys (1 shared), 24-byte data, default limits, median of 7.
 */
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { packInstructionGroups, type PackGroup, type TxFormat } from "../src/runtime/txv1.js";

const payer = Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey;
const PROG = new PublicKey(new Uint8Array(32).fill(9));
const SHARED = new PublicKey(new Uint8Array(32).fill(5));

const groups: PackGroup[] = Array.from({ length: 200 }, (_, i) => {
  const own = new PublicKey(Uint8Array.from({ length: 32 }, (_, j) => (j < 2 ? (i >> (8 * j)) & 255 : 77)));
  return {
    instructions: [
      new TransactionInstruction({
        programId: PROG,
        keys: [
          { pubkey: SHARED, isSigner: false, isWritable: true },
          { pubkey: own, isSigner: false, isWritable: true },
        ],
        data: Buffer.alloc(24, i & 255),
      }),
    ],
    computeUnits: 10_000,
  };
});

for (const format of ["v1", "legacy", "v0"] as TxFormat[]) {
  const times: number[] = [];
  let txs = 0;
  for (let r = 0; r < 7; r++) {
    const t = performance.now();
    txs = packInstructionGroups(groups, { format, payer }).length;
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  console.log(`${format.padEnd(6)} ${txs} txs  median ${times[3]!.toFixed(0)} ms`);
}
