// Bench: N=300 builds x 3 runs, median ms, over a realistic working set of 8 markets.
// Run: npx tsx bench/p3-lock-exits-pda.ts
import { Keypair, PublicKey } from "@solana/web3.js";
import { buildDepositJuniorTrancheIxP3, buildSetVaultLpRiskIxP3 } from "../src/solana/p3-vault-lp.js";
import { buildSetAdlWindDownMaxSlotsIx } from "../src/abi/p2b-lock-exits.js";

const N = 300;
const kp = () => Keypair.generate().publicKey;
const pid = kp();
const markets = Array.from({ length: 8 }, kp);
const auth = kp(), lp = kp(), a = kp(), b = kp();
const riskArgs: any = { assetIndex: 0, skewSlopeE9: 0n, skewMaxE9: 0n, levCapQ: 0n, levMaxImrBps: 0, vaultLpMaxLevBps: 0, approvedMatcherProgram: kp() };

function time(f: (i: number) => void): number {
  const runs: number[] = [];
  for (let r = 0; r < 3; r++) {
    const t = performance.now();
    for (let i = 0; i < N; i++) f(i);
    runs.push(performance.now() - t);
  }
  runs.sort((x, y) => x - y);
  return runs[1];
}

const out: Record<string, number> = {};
out["p3 buildDepositJuniorTrancheIxP3 (vault_lp PDA)"] = time(i =>
  buildDepositJuniorTrancheIxP3({ programId: pid, market: markets[i % 8], lpPortfolio: lp, registryDomain: 0 } as any, auth, a, b, 1n));
try {
  out["p3 buildSetVaultLpRiskIxP3 (programData PDA)"] = time(i => buildSetVaultLpRiskIxP3(pid, markets[i % 8], auth, riskArgs));
} catch (e) { console.log("risk builder skipped:", (e as Error).message); }
out["p2b buildSetAdlWindDownMaxSlotsIx (programData PDA)"] = time(i =>
  buildSetAdlWindDownMaxSlotsIx(pid, markets[i % 8], auth, { assetIndex: 0, maxEpisodeSlots: 300 }));
for (const [k, v] of Object.entries(out)) console.log(`${k}: median ${v.toFixed(1)} ms / ${N} builds`);
