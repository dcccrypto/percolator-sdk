// RequestRedeemLpShares (tag 76) floored v2.2 form vs deprecated 17-byte form, simulated against the
// DEPLOYED devnet v2.2 wrapper. simulateTransaction ONLY (sigVerify false, replaceRecentBlockhash true):
// nothing is signed by a real key and nothing is ever sent.
//
// Usage: npx tsx scripts/lp-redeem-floored-devnet-sim/simulate.ts out/discover.json out/holders.json > out/simulate.json
//
// Cases per vault:
//   T-floored / T-legacy   redeemer = a fresh throwaway keypair (no SOL, no LP ATA); fee payer = the vault's
//                          holder wallet (impersonated, unsigned). Shows decode vs refusal only.
//   H-floored / H-legacy   redeemer = a real LP-share holder (impersonated). Floored form should succeed.
//   P-floor1 / P-above     every vault has a 150-slot cooldown, so 76+77 cannot share a tx. Instead tag 77
//                          runs on the EXISTING on-chain v2.2 (128-byte) requests, redeemer impersonated:
//                          wire floor 1 gives the quote (or 117 if the stored floor already exceeds it);
//                          wire floor quote+1 must be refused Custom(117) RedemptionBelowMinPayout.
import { readFileSync } from "node:fs";
import {
  ComputeBudgetProgram, Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PROGRAM_IDS_DEVNET_V22, buildRequestRedeemLpSharesIxV22, buildExecuteRedemptionIxV22, encodeRequestRedeemLpShares,
  parseWrapperConfigV17, deriveVaultAuthority, deriveVaultLpStateP3, decodeVaultLpStateP3, parseLpVaultRegistry, deriveLpVaultRegistry, deriveLpRedemption, classifyRedemptionSimulationV22, type MarketV22,
} from "../../src/index.js";

const RPC = process.env.LPSIM_RPC ?? "https://api.devnet.solana.com";
const conn = new Connection(RPC, { commitment: "confirmed", disableRetryOnRateLimit: false });
const PROGRAM = new PublicKey(PROGRAM_IDS_DEVNET_V22.percolator);
const MAX_VAULTS = Number(process.env.LPSIM_MAX_VAULTS ?? 6);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function rpc<T>(f: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await f(); } catch (e) {
      if (i >= 10 || !/429|Too Many/i.test(String(e))) throw e;
      await sleep(3000 * (i + 1));
    }
  }
}
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
  const r = await rpc(() => conn.simulateTransaction(tx, {
    sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed",
    ...(watch.length ? { accounts: { encoding: "base64", addresses: watch.map((k) => k.toBase58()) } } : {}),
  }));
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

async function main() {
  const disc = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const hold = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const hBy = new Map<string, any[]>(hold.holders.filter((x: any) => !x.error).map((x: any) => [x.registry, x.holders]));
  const regs: any[] = disc.registries.filter((r: any) => r.pdaMatches && !r.parseError && (hBy.get(r.registry)?.length ?? 0) > 0)
    .map((r: any) => ({ ...r, holders: hBy.get(r.registry) }));
  const throwaway = Keypair.generate();
  const results: any[] = [];
  for (const d of regs.slice(0, process.env.LPSIM_ONLY_PENDING ? 0 : MAX_VAULTS)) {
    const market = new PublicKey(d.market);
    const registry = new PublicKey(d.registry);
    await sleep(800);
    const regInfo = await rpc(() => conn.getAccountInfo(registry));
    const reg = parseLpVaultRegistry(new Uint8Array(regInfo!.data));
    const m: MarketV22 = { programId: PROGRAM, market, registryDomain: reg.domain };
    const vault: any = { registry: d.registry, market: d.market, lpMint: reg.lpMint.toBase58(), domain: reg.domain, cooldownSlots: reg.redemptionCooldownSlots.toString(), paused: reg.paused, totalShares: reg.totalLpSharesOutstanding.toString(), cases: [] };

    // Fee payer for the throwaway cases: the vault's real holder wallet (impersonated, unsigned).
    const feePayer = new PublicKey(d.holders[0].owner);
    // --- T: throwaway redeemer --------------------------------------------------------------
    const tAta = getAssociatedTokenAddressSync(reg.lpMint, throwaway.publicKey, true);
    const tFloored = buildRequestRedeemLpSharesIxV22(m, throwaway.publicKey, tAta, 1_000n, 990n, false);
    const tLegacy = new TransactionInstruction({ programId: PROGRAM, keys: tFloored.keys, data: Buffer.from(encodeRequestRedeemLpShares({ shares: 1_000n })) });
    vault.cases.push({ form: "floored-26", redeemer: "throwaway", dataLen: tFloored.data.length, dataHex: hex(tFloored.data), ...(await sim("T-floored", feePayer, [tFloored], [throwaway])) });
    vault.cases.push({ form: "legacy-17", redeemer: "throwaway", dataLen: tLegacy.data.length, dataHex: hex(tLegacy.data), ...(await sim("T-legacy", feePayer, [tLegacy], [throwaway])) });

    // --- H: real LP holder (impersonated) --------------------------------------------------
    const h = d.holders[0];
    vault.holder = { owner: h.owner, ata: h.ata, amount: h.amount };
    if (h) {
      const owner = new PublicKey(h.owner);
      const ata = new PublicKey(h.ata);
      const [redemption] = deriveLpRedemption(PROGRAM, registry, owner);
      await sleep(800);
      vault.holderPendingRedemption = (await rpc(() => conn.getAccountInfo(redemption))) !== null;
      const shares = BigInt(h.amount) < 1_000_000n ? BigInt(h.amount) : 1_000_000n;
      const hFloored = buildRequestRedeemLpSharesIxV22(m, owner, ata, shares, 1n, false);
      const hLegacy = new TransactionInstruction({ programId: PROGRAM, keys: hFloored.keys, data: Buffer.from(encodeRequestRedeemLpShares({ shares })) });
      vault.cases.push({ form: "floored-26", redeemer: "holder", shares: shares.toString(), minPayout: "1", dataLen: hFloored.data.length, dataHex: hex(hFloored.data), ...(await sim("H-floored", owner, [hFloored], [], [redemption])) });
      vault.cases.push({ form: "legacy-17", redeemer: "holder", shares: shares.toString(), dataLen: hLegacy.data.length, dataHex: hex(hLegacy.data), ...(await sim("H-legacy", owner, [hLegacy], [], [redemption])) });

    }
    results.push(vault);
  }

  // --- P: existing on-chain v2.2 requests (cooldown elapsed): tag 77 quote at floor 1, then quote + 1 ----
  const pendingOut: any[] = [];
  for (const p of hold.pending.filter((x: any) => x.len === 128 && x.market)) {
    const market = new PublicKey(p.market);
    const registry = new PublicKey(p.registry);
    const redeemer = new PublicKey(p.redeemer);
    await sleep(800);
    const reg = parseLpVaultRegistry(new Uint8Array((await rpc(() => conn.getAccountInfo(registry)))!.data));
    const m: MarketV22 = { programId: PROGRAM, market, registryDomain: reg.domain };
    await sleep(800);
    const slab = await rpc(() => conn.getAccountInfo(market));
    const row: any = { ...p };
    let cfg: any = null;
    try { cfg = parseWrapperConfigV17(new Uint8Array(slab!.data)); } catch (e) { row.configError = String(e); pendingOut.push(row); continue; }
    // Market collateral vault = the collateral-mint ATA of the market's vault authority PDA.
    cfg.vaultPubkey = getAssociatedTokenAddressSync(cfg.collateralMint, deriveVaultAuthority(PROGRAM, market)[0], true);
    const dest = getAssociatedTokenAddressSync(cfg.collateralMint, redeemer, true);
    await sleep(800);
    const destInfo = await rpc(() => conn.getAccountInfo(dest));
    const before = destInfo ? Buffer.from(destInfo.data).readBigUInt64LE(64) : null;
    row.redeemerDest = { key: dest.toBase58(), exists: !!destInfo, before: before?.toString() ?? null };
    row.vaultToken = cfg.vaultPubkey.toBase58();
    // A BOUND vault (P3) needs the [13] vault_lp_state / [14] vault LP portfolio tail.
    await sleep(800);
    const vls = await rpc(() => conn.getAccountInfo(deriveVaultLpStateP3(PROGRAM, market)[0]));
    let boundLpPortfolio: PublicKey | undefined;
    if (vls) { try { boundLpPortfolio = decodeVaultLpStateP3(new Uint8Array(vls.data)).lpPortfolio; } catch (e) { row.vaultLpStateError = String(e); } }
    row.bound = boundLpPortfolio ? boundLpPortfolio.toBase58() : null;
    const exec = (floor: bigint) => buildExecuteRedemptionIxV22(m, redeemer, redeemer, dest, cfg.vaultPubkey, reg.domain, { minPayoutAtoms: floor, boundLpPortfolio });
    row.cases = [];
    const q = await sim("P-floor1", redeemer, [exec(1n)], [], [dest]);
    const after = tokenAmount(q.watched[0]?.data ?? null);
    const quote = before !== null && after !== null && q.err === null ? after - before : null;
    row.cases.push({ minPayoutWire: "1", quote: quote?.toString() ?? null, dataHex: hex(exec(1n).data), ...q, watched: undefined });
    const above = quote !== null ? quote + 1n : BigInt(p.minPayoutStored) + 1_000_000_000_000n;
    const s2 = await sim("P-above-quote", redeemer, [exec(above)], [], []);
    row.cases.push({ minPayoutWire: above.toString(), quote: quote?.toString() ?? null, dataHex: hex(exec(above).data), ...s2 });
    pendingOut.push(row);
  }
  console.log(JSON.stringify({ rpc: RPC, program: PROGRAM.toBase58(), throwaway: throwaway.publicKey.toBase58(), feePayerForThrowawayCases: "the vault holder wallet (vault.holder.owner)", at: new Date().toISOString(), vaults: results, pending: pendingOut }, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
