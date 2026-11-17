// Run: npx tsx test/bench/p3-vault-lp-pda.bench.ts
import { Keypair } from "@solana/web3.js";
import { deriveVaultLpStateP3, deriveProgramDataAddressP3 } from "../../src/solana/p3-vault-lp.js";

const programId = Keypair.generate().publicKey;
const markets = Array.from({ length: 50 }, () => Keypair.generate().publicKey);
const N = 20_000;

function bench(name: string, fn: (i: number) => unknown): void {
  for (let i = 0; i < 200; i++) fn(i);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) fn(i);
  const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
  console.log(`${name}: ${us.toFixed(2)} us/call`);
}

bench("deriveVaultLpStateP3", (i) => deriveVaultLpStateP3(programId, markets[i % 50]));
bench("deriveProgramDataAddressP3", () => deriveProgramDataAddressP3(programId));
