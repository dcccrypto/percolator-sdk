/**
 * Stake PDA derivation benchmark.
 *
 *   pnpm exec tsx scripts/bench-stake-pda.ts
 *
 * 20k calls over 50 random slabs (explicit programId) after warm-up; prints us/call.
 */
import { PublicKey } from "@solana/web3.js";
import { deriveStakePool, deriveStakeVaultAuth, deriveDepositPda } from "../src/solana/stake.js";

let seed = 0x1234abcd;
function rnd(): number {
  seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
  return seed;
}
function key(): PublicKey {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = rnd() & 0xff;
  return new PublicKey(b);
}

const programId = new PublicKey("DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F");
const slabs = Array.from({ length: 50 }, key);
const user = key();
const N = 20000;

function bench(name: string, fn: (i: number) => unknown): void {
  for (let i = 0; i < 500; i++) fn(i);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) fn(i);
  const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
  console.log(`${name.padEnd(22)} ${us.toFixed(3)} us/call`);
}

bench("deriveStakePool", (i) => deriveStakePool(slabs[i % 50], programId));
const pools = slabs.map((s) => deriveStakePool(s, programId)[0]);
bench("deriveStakeVaultAuth", (i) => deriveStakeVaultAuth(pools[i % 50], programId));
bench("deriveDepositPda", (i) => deriveDepositPda(pools[i % 50], user, programId));
