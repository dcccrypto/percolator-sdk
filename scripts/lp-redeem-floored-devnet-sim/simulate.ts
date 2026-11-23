// RequestRedeemLpShares (tag 76) floored v2.2 form vs deprecated 17-byte form, simulated against the
// DEPLOYED devnet v2.2 wrapper. simulateTransaction ONLY (sigVerify false, replaceRecentBlockhash true):
// nothing is signed by a real key and nothing is ever sent.
//
// Usage: npx tsx scripts/lp-redeem-floored-devnet-sim/simulate.ts out/discover.json > out/simulate.json
//
// Cases per vault:
//   T-floored / T-legacy   redeemer = a fresh throwaway keypair (no SOL, no LP ATA); fee payer = a funded
//                          account (impersonated, unsigned). Shows decode vs refusal only.
//   H-floored / H-legacy   redeemer = a real LP-share holder (impersonated). Floored form should succeed.
//   Q-quote / Q-slippage   [76 floored + 77 ExecuteRedemption v2.2] in one tx: floor 1 gives the quote
//                          (redeemer collateral balance delta); floor quote+1 must be refused Custom(117).
import { readFileSync } from "node:fs";
import {
  ComputeBudgetProgram, Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PROGRAM_IDS_DEVNET_V22, buildRequestRedeemLpSharesIxV22, buildExecuteRedemptionIxV22, encodeRequestRedeemLpShares,
  parseConfig, parseLpVaultRegistry, deriveLpVaultRegistry, deriveLpRedemption, classifyRedemptionSimulationV22, type MarketV22,
} from "../../src/index.js";

const RPC = process.env.LPSIM_RPC ?? "https://api.devnet.solana.com";
const conn = new Connection(RPC, { commitment: "confirmed", disableRetryOnRateLimit: false });
const PROGRAM = new PublicKey(PROGRAM_IDS_DEVNET_V22.percolator);
const MAX_VAULTS = Number(process.env.LPSIM_MAX_VAULTS ?? 6);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

function errCode(err: any): { ixIndex: number | null; code: string | number | null } {
  if (!err) return { ixIndex: null, code: null };
  const ie = err.InstructionError;
  if (Array.isArray(ie)) return { ixIndex: ie[0], code: typeof ie[1] === "string" ? ie[1] : ie[1]?.Custom ?? JSON.stringify(ie[1]) };
  return { ixIndex: null, code: typeof err === "string" ? err : JSON.stringify(err) };
}

async function sim(name: string, payer: PublicKey, ixs: TransactionInstruction[], signers: Keypair[], watch: PublicKey[] = []) {
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: "11111111111111111111111111111111",
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...ixs],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  if (signers.length) tx.sign(signers); // throwaway only; every other signature slot stays zero (sigVerify false)
  await sleep(1200);
  const r = await conn.simulateTransaction(tx, {
    sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed",
    ...(watch.length ? { accounts: { encoding: "base64", addresses: watch.map((k) => k.toBase58()) } } : {}),
  });
  const v = r.value;
  const logs = v.logs ?? [];
  const { ixIndex, code } = errCode(v.err);
  return {
    name, err: v.err ?? null, ixIndex, code, unitsConsumed: v.unitsConsumed ?? null, logs,
    classified: classifyRedemptionSimulationV22({ err: v.err, logs }),
    watched: (v.accounts ?? []).map((a, i) => ({ key: watch[i].toBase58(), exists: !!a, data: a ? (a.data as any)[0] : null })),
  };
}

// SPL token account amount at offset 64 (u64 LE).
function tokenAmount(b64: string | null): bigint | null {
  if (!b64) return null;
  const b = Buffer.from(b64, "base64");
  return b.length >= 72 ? b.readBigUInt64LE(64) : null;
}

async function funded(): Promise<PublicKey> {
  // A funded system account for the throwaway cases' fee payer: the fee payer of a recent tx on the program.
  const sigs = await conn.getSignaturesForAddress(PROGRAM, { limit: 5 });
  for (const s of sigs) {
    await sleep(800);
    const t = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    const k = t?.transaction.message.staticAccountKeys[0];
    if (k) return k;
  }
  throw new Error("no funded fee payer found");
}

async function main() {
  const disc = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const regs: any[] = disc.registries.filter((r: any) => r.pdaMatches && !r.parseError);
  // Prefer vaults that have a real holder; then the rest.
  regs.sort((a, b) => Number((b.holders?.length ?? 0) > 0) - Number((a.holders?.length ?? 0) > 0));
  const feePayer = await funded();
  const throwaway = Keypair.generate();
  const results: any[] = [];
  for (const d of regs.slice(0, MAX_VAULTS)) {
    const market = new PublicKey(d.market);
    const registry = new PublicKey(d.registry);
    await sleep(800);
    const regInfo = await conn.getAccountInfo(registry);
    const reg = parseLpVaultRegistry(new Uint8Array(regInfo!.data));
    const m: MarketV22 = { programId: PROGRAM, market, registryDomain: reg.domain };
    const vault: any = { registry: d.registry, market: d.market, lpMint: reg.lpMint.toBase58(), domain: reg.domain, cooldownSlots: reg.redemptionCooldownSlots.toString(), paused: reg.paused, totalShares: reg.totalLpSharesOutstanding.toString(), cases: [] };

    // --- T: throwaway redeemer --------------------------------------------------------------
    const tAta = getAssociatedTokenAddressSync(reg.lpMint, throwaway.publicKey, true);
    const tFloored = buildRequestRedeemLpSharesIxV22(m, throwaway.publicKey, tAta, 1_000n, 990n, false);
    const tLegacy = new TransactionInstruction({ programId: PROGRAM, keys: tFloored.keys, data: Buffer.from(encodeRequestRedeemLpShares({ shares: 1_000n })) });
    vault.cases.push({ form: "floored-26", redeemer: "throwaway", dataLen: tFloored.data.length, dataHex: hex(tFloored.data), ...(await sim("T-floored", feePayer, [tFloored], [throwaway])) });
    vault.cases.push({ form: "legacy-17", redeemer: "throwaway", dataLen: tLegacy.data.length, dataHex: hex(tLegacy.data), ...(await sim("T-legacy", feePayer, [tLegacy], [throwaway])) });

    // --- H: real LP holder (impersonated) --------------------------------------------------
    const escrow = (d.holders ?? []).find((h: any) => h.owner === d.registry);
    const h = (d.holders ?? []).find((x: any) => x.owner && x.owner !== d.registry && !x.error);
    vault.holder = h ? { owner: h.owner, ata: h.ata, amount: h.amount } : null;
    if (escrow) vault.escrowBalance = escrow.amount;
    if (h) {
      const owner = new PublicKey(h.owner);
      const ata = new PublicKey(h.ata);
      const [redemption] = deriveLpRedemption(PROGRAM, registry, owner);
      await sleep(800);
      vault.holderPendingRedemption = (await conn.getAccountInfo(redemption)) !== null;
      const shares = BigInt(h.amount) < 1_000_000n ? BigInt(h.amount) : 1_000_000n;
      const hFloored = buildRequestRedeemLpSharesIxV22(m, owner, ata, shares, 1n, false);
      const hLegacy = new TransactionInstruction({ programId: PROGRAM, keys: hFloored.keys, data: Buffer.from(encodeRequestRedeemLpShares({ shares })) });
      vault.cases.push({ form: "floored-26", redeemer: "holder", shares: shares.toString(), minPayout: "1", dataLen: hFloored.data.length, dataHex: hex(hFloored.data), ...(await sim("H-floored", owner, [hFloored], [], [redemption])) });
      vault.cases.push({ form: "legacy-17", redeemer: "holder", shares: shares.toString(), dataLen: hLegacy.data.length, dataHex: hex(hLegacy.data), ...(await sim("H-legacy", owner, [hLegacy], [])) });

      // --- Q: quote then floor above the quote (76 + 77 in one tx) ---------------------------
      await sleep(800);
      const slab = await conn.getAccountInfo(market);
      let cfg: any = null;
      try { cfg = parseConfig(new Uint8Array(slab!.data)); } catch (e) { vault.configError = String(e); }
      if (cfg) {
        const dest = getAssociatedTokenAddressSync(cfg.collateralMint, owner, true);
        await sleep(800);
        const destInfo = await conn.getAccountInfo(dest);
        const before = destInfo ? Buffer.from(destInfo.data).readBigUInt64LE(64) : null;
        vault.redeemerDest = { key: dest.toBase58(), exists: !!destInfo, before: before?.toString() ?? null };
        const pair = (floor: bigint) => [
          buildRequestRedeemLpSharesIxV22(m, owner, ata, shares, floor, false),
          buildExecuteRedemptionIxV22(m, owner, owner, dest, cfg.vaultPubkey, reg.domain, { minPayoutAtoms: floor }),
        ];
        const q = await sim("Q-quote", owner, pair(1n), [], [dest]);
        const after = tokenAmount(q.watched[0]?.data ?? null);
        const quote = before !== null && after !== null && q.err === null ? after - before : null;
        vault.cases.push({ form: "floored-26+77", redeemer: "holder", minPayout: "1", quote: quote?.toString() ?? null, ...q, watched: undefined });
        if (quote !== null) {
          const s = await sim("Q-slippage", owner, pair(quote + 1n), [], []);
          vault.cases.push({ form: "floored-26+77", redeemer: "holder", minPayout: (quote + 1n).toString(), quote: quote.toString(), ...s, watched: undefined });
        }
      }
    }
    results.push(vault);
  }
  console.log(JSON.stringify({ rpc: RPC, program: PROGRAM.toBase58(), throwaway: throwaway.publicKey.toBase58(), feePayerForThrowawayCases: feePayer.toBase58(), at: new Date().toISOString(), vaults: results }, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
