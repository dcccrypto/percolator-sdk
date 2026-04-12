import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { parseHeader, parseConfig, parseEngine, parseUsedIndices, detectSlabLayout } from '../src/solana/slab.js';
import { deriveVaultAuthority, deriveKeeperFund } from '../src/solana/pda.js';
import { getAtaSync } from '../src/solana/ata.js';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(RPC, 'confirmed');

const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const ADMIN = new PublicKey('7JVQvrAfzj3aasLxCkoLYX5KQcrb5nEZhUe5Qa8PvV5G');

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  if (!info) { console.error('slab not found'); process.exit(1); }
  const data = new Uint8Array(info.data);
  console.log('slab lamports:', info.lamports, '(', (info.lamports / 1e9).toFixed(6), 'SOL)');
  console.log('slab data len:', data.length);

  const layout = detectSlabLayout(data.length, data);
  console.log('layout:', layout);

  const header = parseHeader(data);
  console.log('admin:', header.admin.toBase58());
  console.log('resolved:', header.resolved);
  console.log('paused:', header.paused);
  console.log('flags raw:', (header as any).flags);

  const config = parseConfig(data);
  console.log('collateralMint:', config.collateralMint.toBase58());
  console.log('vaultPubkey:', config.vaultPubkey.toBase58());
  console.log('indexFeedId:', config.indexFeedId);
  // oracle authority and price fields - check various possible field names
  const cfgAny = config as any;
  console.log('oracleAuthority:', cfgAny.oracleAuthority?.toBase58?.() ?? cfgAny.oracle_authority ?? 'N/A');
  console.log('authorityPriceE6:', cfgAny.authorityPriceE6?.toString?.() ?? cfgAny.authority_price_e6?.toString?.() ?? 'N/A');
  console.log('Full config keys:', Object.keys(config));

  const engine = parseEngine(data);
  console.log('vault (collateral balance raw):', engine.vault.toString());
  console.log('insurance balance raw:', engine.insuranceFund.balance.toString());
  console.log('c_tot:', engine.cTot.toString());
  console.log('numUsedAccounts:', engine.numUsedAccounts);

  const used = parseUsedIndices(data);
  console.log('used account indices:', used);

  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const [keeperFund] = deriveKeeperFund(PROGRAM_ID, SLAB);
  console.log('vaultAuthority PDA:', vaultAuth.toBase58());
  console.log('keeperFund PDA:', keeperFund.toBase58());

  const adminAta = getAtaSync(ADMIN, USDC_MINT);
  console.log('admin USDC ATA:', adminAta.toBase58());

  // Check keeper fund balance
  const kfInfo = await conn.getAccountInfo(keeperFund);
  console.log('keeperFund lamports:', kfInfo?.lamports ?? 0);

  // Check vault token balance
  const vaultInfo = await conn.getTokenAccountBalance(config.vaultPubkey).catch(() => null);
  if (vaultInfo) {
    console.log('vault USDC balance:', vaultInfo.value.uiAmount, 'USDC (raw:', vaultInfo.value.amount, ')');
  }

  // Check admin USDC ATA
  const adminAtaInfo = await conn.getTokenAccountBalance(adminAta).catch(() => null);
  if (adminAtaInfo) {
    console.log('admin USDC ATA balance:', adminAtaInfo.value.uiAmount);
  } else {
    console.log('admin USDC ATA: does not exist yet (needs create)');
  }

  // Dump first 384 bytes to inspect oracle fields
  console.log('\nRaw bytes (first 384):');
  for (let i = 0; i < Math.min(384, data.length); i += 16) {
    const slice = Array.from(data.slice(i, i+16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`  [${i.toString().padStart(3)}]: ${slice}`);
  }
}

main().catch(console.error);
