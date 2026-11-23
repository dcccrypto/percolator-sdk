// Read-only discovery of v2.2 devnet LP vaults (registries), pending redemptions and LP holders.
// Usage: npx tsx scripts/lp-redeem-floored-devnet-sim/discover.ts > scripts/lp-redeem-floored-devnet-sim/out/discover.json
import { Connection, PublicKey } from "@solana/web3.js";
import { PROGRAM_IDS_DEVNET_V22, parseLpVaultRegistry, deriveLpVaultRegistry } from "../../src/index.js";

const RPC = process.env.LPSIM_RPC ?? "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");
const PROGRAM = new PublicKey(PROGRAM_IDS_DEVNET_V22.percolator);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const regs = await conn.getProgramAccounts(PROGRAM, { filters: [{ dataSize: 176 }] });
  const out: any[] = [];
  for (const { pubkey, account } of regs) {
    let r;
    try { r = parseLpVaultRegistry(new Uint8Array(account.data)); } catch (e) { out.push({ registry: pubkey.toBase58(), parseError: String(e) }); continue; }
    const expected = deriveLpVaultRegistry(PROGRAM, r.marketGroup)[0];
    let supply: string | null = null; let holders: any[] = [];
    try {
      await sleep(1000);
      supply = (await conn.getTokenSupply(r.lpMint)).value.amount;
      await sleep(1000);
      const largest = await conn.getTokenLargestAccounts(r.lpMint);
      for (const a of largest.value.slice(0, 5)) {
        if (a.amount === "0") continue;
        await sleep(800);
        const info = await conn.getParsedAccountInfo(a.address);
        const owner = (info.value?.data as any)?.parsed?.info?.owner ?? null;
        holders.push({ ata: a.address.toBase58(), owner, amount: a.amount });
      }
    } catch (e) { holders = [{ error: String(e) }]; }
    out.push({
      registry: pubkey.toBase58(), pdaMatches: expected.equals(pubkey), market: r.marketGroup.toBase58(), lpMint: r.lpMint.toBase58(),
      totalShares: r.totalLpSharesOutstanding.toString(), cooldown: r.redemptionCooldownSlots.toString(), domain: r.domain, paused: r.paused, version: r.version,
      supply, holders,
    });
  }
  const red112 = await conn.getProgramAccounts(PROGRAM, { filters: [{ dataSize: 112 }], dataSlice: { offset: 0, length: 0 } });
  const red128 = await conn.getProgramAccounts(PROGRAM, { filters: [{ dataSize: 128 }], dataSlice: { offset: 0, length: 0 } });
  console.log(JSON.stringify({ rpc: RPC, program: PROGRAM.toBase58(), registries: out, redemptions112: red112.map((x) => x.pubkey.toBase58()), redemptions128: red128.map((x) => x.pubkey.toBase58()) }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
