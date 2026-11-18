// Bench: derive pool + vaultAuth + deposit PDAs for 50 slabs x 20 users, 300 repeats.
// Reports median ms over 3 runs. Run: npx tsx scripts/bench-stake-pda.ts
import { Keypair, PublicKey } from "@solana/web3.js";
import { deriveStakePool, deriveStakeVaultAuth, deriveDepositPda } from "../src/solana/stake.js";

const SLABS = 50, USERS = 20, REPEATS = Number(process.env.REPEATS ?? 300), RUNS = 3;
const programId = Keypair.generate().publicKey;
const slabs = Array.from({ length: SLABS }, () => Keypair.generate().publicKey);
const users = Array.from({ length: USERS }, () => Keypair.generate().publicKey);

function once(): { ms: number; sum: number } {
  let sum = 0;
  const t = performance.now();
  for (let r = 0; r < REPEATS; r++) {
    for (const s of slabs) {
      const [pool] = deriveStakePool(s, programId);
      const [va] = deriveStakeVaultAuth(pool, programId);
      sum += va.toBytes()[0];
      for (const u of users) sum += deriveDepositPda(pool, u, programId)[1];
    }
  }
  return { ms: performance.now() - t, sum };
}
const times: number[] = [];
let checksum = 0;
for (let i = 0; i < RUNS; i++) { const r = once(); times.push(r.ms); checksum = r.sum; }
times.sort((a, b) => a - b);
console.log(JSON.stringify({ runsMs: times, medianMs: times[1], checksum, PublicKey: !!PublicKey }));
