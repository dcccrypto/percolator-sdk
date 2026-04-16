import { fetchSlab, detectSlabLayout, parseHeader, parseConfig, parseEngine, parseAllAccounts, parseUsedIndices } from "./dist/index.js";
import { Connection, PublicKey } from "@solana/web3.js";

const SLAB = "5RfUzS1kpdhVb2CNGvE9UGdthsGbd354LoXSYjCFHv3R";
const rpc = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

async function main() {
  const conn = new Connection(rpc);
  const buf = await fetchSlab(conn, new PublicKey(SLAB));
  const layout = detectSlabLayout(buf.length, buf);
  
  const h = parseHeader(buf, layout);
  const c = parseConfig(buf, layout);
  const e = parseEngine(buf, layout);
  
  console.log("=== MARKET STATE ===");
  console.log(`Slab: ${SLAB}`);
  console.log(`Admin: ${h.admin.toBase58()}`);
  console.log(`Mint: ${c.collateralMint}`);
  console.log(`Vault: ${c.vaultPubkey}`);
  console.log(`DexPool: ${c.dexPool}`);
  console.log(`Vault balance: ${Number(e.vault)/1e6} USDC`);
  console.log(`Insurance fund: ${Number(e.insuranceFund.balance)/1e6} USDC`);
  console.log(`c_tot: ${Number(e.cTot)/1e6} USDC`);
  console.log(`pnl_pos_tot: ${Number(e.pnlPosTot)/1e6}`);
  console.log(`Oracle price: $${Number(e.oraclePriceE6)/1e6}`);
  console.log(`Market mode: ${e.marketMode === 0 ? 'LIVE' : e.marketMode === 1 ? 'RESOLVED' : 'UNKNOWN'}`);
  console.log(`Used accounts: ${e.numUsedAccounts}`);
  console.log(`Next account ID: ${e.nextAccountId}`);
  
  const all = parseAllAccounts(buf, layout);
  console.log(`\n=== ACCOUNTS (${all.length}) ===`);
  for (const { idx, account: a } of all) {
    console.log(`[${idx}] id=${a.accountId} kind=${a.kind===1?'LP':'User'} capital=${Number(a.capital)/1e6} pos=${a.positionSize} pnl=${Number(a.pnl)/1e6} owner=${a.owner.toBase58()}`);
  }

  // Check stake pool
  console.log("\n=== STAKE POOL ===");
  const stakePool = "5J6FeEm3DfmyoxBDhHfBEG2Sp8LPWQTYi3fDohMAKN8E";
  try {
    const stakeAcct = await conn.getAccountInfo(new PublicKey(stakePool));
    if (stakeAcct) {
      console.log(`Stake pool account: ${stakePool}`);
      console.log(`  Owner program: ${stakeAcct.owner.toBase58()}`);
      console.log(`  Data length: ${stakeAcct.data.length}`);
      console.log(`  Lamports: ${stakeAcct.lamports}`);
    } else {
      console.log(`Stake pool ${stakePool}: NOT FOUND`);
    }
  } catch(e) { console.log(`Stake pool check error: ${e.message}`); }
  
  // Check vault token balance
  const vaultAta = c.vaultPubkey;
  try {
    const tokenBalance = await conn.getTokenAccountBalance(new PublicKey(vaultAta));
    console.log(`\nVault ATA (${vaultAta}) token balance: ${tokenBalance.value.uiAmount} USDC`);
  } catch(e) { console.log(`Vault ATA check error: ${e.message}`); }
}

main().catch(e => { console.error(e); process.exit(1); });
