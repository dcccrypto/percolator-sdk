import { bench, describe } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  deriveVaultAuthority,
  deriveCanonicalVault,
  deriveCanonicalVaultForAuthority,
  deriveInsuranceLpMint,
  deriveLpPda,
  deriveCreatorLockPda,
  deriveLpVaultRegistry,
  deriveLpRedemption,
  deriveLpBackingLedger,
  deriveLpEscrow,
  deriveNftRegistry,
  deriveMatcherDelegate,
  derivePythPushOraclePDA,
} from "../src/solana/pda.js";

const N = Number(process.env.PDA_BENCH_N ?? 10_000);
const kp = () => Keypair.generate().publicKey;
const program = kp();
const hot: PublicKey[] = Array.from({ length: 16 }, kp);
// Cold keys are pre-generated so key generation is not measured; each is used once per pass.
const cold: PublicKey[] = Array.from({ length: 200 }, kp);
const feeds = Array.from({ length: 16 }, (_, i) =>
  Buffer.from(new Uint8Array(32).fill(i + 1)).toString("hex"),
);

// ~98% hot keys, ~2% cold keys (realistic: few markets, many calls).
function pick(i: number): PublicKey {
  return i % 50 === 0 ? cold[(i / 50) % cold.length] : hot[i % hot.length];
}

const cases: Record<string, (i: number) => unknown> = {
  deriveVaultAuthority: (i) => deriveVaultAuthority(program, pick(i)),
  deriveCanonicalVault: (i) => deriveCanonicalVault(program, pick(i), hot[0]),
  deriveCanonicalVaultForAuthority: (i) => deriveCanonicalVaultForAuthority(pick(i), hot[1]),
  deriveInsuranceLpMint: (i) => deriveInsuranceLpMint(program, pick(i)),
  deriveLpPda: (i) => deriveLpPda(program, pick(i), i % 8),
  deriveCreatorLockPda: (i) => deriveCreatorLockPda(program, pick(i)),
  deriveLpVaultRegistry: (i) => deriveLpVaultRegistry(program, pick(i)),
  deriveLpRedemption: (i) => deriveLpRedemption(program, pick(i), hot[i % 4]),
  deriveLpBackingLedger: (i) => deriveLpBackingLedger(program, pick(i), i % 4),
  deriveLpEscrow: (i) => deriveLpEscrow(program, pick(i)),
  deriveNftRegistry: (i) => deriveNftRegistry(program, pick(i)),
  deriveMatcherDelegate: (i) => deriveMatcherDelegate(program, pick(i), hot[1], hot[2], hot[3], hot[4]),
  derivePythPushOraclePDA: (i) => derivePythPushOraclePDA(i % 50 === 0 ? "ab".repeat(31) + (i % 256).toString(16).padStart(2, "0") : feeds[i % feeds.length]),
};

describe(`pda derivations (${N} calls each, hot+cold mix)`, () => {
  for (const [name, fn] of Object.entries(cases)) {
    bench(`${name} x${N}`, () => {
      for (let i = 0; i < N; i++) fn(i);
    }, { iterations: 1, warmupIterations: 0, time: 0 });
  }
});
