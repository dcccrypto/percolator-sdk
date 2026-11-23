// Read-only: decode the pending redemption PDAs found by discover.ts, and find real LP holders for a few
// vaults via a Token-program getProgramAccounts (mint memcmp) — getTokenLargestAccounts is 429'd on public devnet.
// Usage: npx tsx scripts/lp-redeem-floored-devnet-sim/holders.ts out/discover.json > out/holders.json
import { readFileSync } from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

const RPC = process.env.LPSIM_RPC ?? "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX = Number(process.env.LPSIM_HOLDER_VAULTS ?? 12);

async function main() {
  const disc = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const byReg = new Map<string, any>(disc.registries.map((r: any) => [r.registry, r]));
  const slot = await conn.getSlot("confirmed");
  const pending: any[] = [];
  for (const k of [...disc.redemptions112, ...disc.redemptions128]) {
    await sleep(800);
    const a = await conn.getAccountInfo(new PublicKey(k));
    if (!a) continue;
    const b = Buffer.from(a.data);
    const registry = new PublicKey(b.subarray(16, 48)).toBase58();
    const redeemer = new PublicKey(b.subarray(48, 80));
    const reg = byReg.get(registry);
    const row: any = {
      redemption: k, len: b.length, registry, market: reg?.market ?? null, redeemer: redeemer.toBase58(),
      shares: (b.readBigUInt64LE(80) + (b.readBigUInt64LE(88) << 64n)).toString(), requestSlot: b.readBigUInt64LE(96).toString(),
      minPayoutStored: b.length >= 128 ? b.readBigUInt64LE(112).toString() : null, keeperOkStored: b.length >= 128 ? b[120] : null,
    };
    if (reg) {
      const ata = getAssociatedTokenAddressSync(new PublicKey(reg.lpMint), redeemer, true);
      await sleep(800);
      const t = await conn.getAccountInfo(ata);
      row.redeemerLpAta = ata.toBase58();
      row.redeemerLpBalance = t ? Buffer.from(t.data).readBigUInt64LE(64).toString() : null;
    }
    pending.push(row);
  }
  const holders: any[] = [];
  // Vaults with the most shares first (most likely to have a non-escrow holder).
  const regs = [...disc.registries].sort((a: any, b: any) => (BigInt(b.totalShares) > BigInt(a.totalShares) ? 1 : -1)).slice(0, MAX);
  for (const r of regs) {
    await sleep(2500);
    try {
      const accs = await conn.getProgramAccounts(TOKEN_PROGRAM_ID, { filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: r.lpMint } }] });
      const rows = accs.map(({ pubkey, account }) => {
        const d = Buffer.from(account.data);
        return { ata: pubkey.toBase58(), owner: new PublicKey(d.subarray(32, 64)).toBase58(), amount: d.readBigUInt64LE(64).toString() };
      }).filter((x) => x.amount !== "0" && x.owner !== r.registry);
      holders.push({ registry: r.registry, market: r.market, lpMint: r.lpMint, holders: rows });
    } catch (e) { holders.push({ registry: r.registry, error: String(e).slice(0, 200) }); }
  }
  console.log(JSON.stringify({ rpc: RPC, slot, pending, holders }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
