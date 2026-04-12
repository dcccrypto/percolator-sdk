/**
 * Set oracle authority to admin and push a price.
 * This makes the slab ready for ResolveMarket with an admin-set price.
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { encodeSetOracleAuthority, encodePushOraclePrice } from '../src/abi/instructions.js';
import { buildAccountMetas } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import fs from 'fs';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(HELIUS_RPC, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');

async function sendIx(label: string, ix: any) {
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));
  tx.add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [admin], { commitment: 'confirmed' });
  console.log(`[${label}] sig: ${sig}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${sig}`);
  return sig;
}

async function main() {
  const SIMULATE = process.argv.includes('--simulate');

  if (SIMULATE) {
    console.log('*** DRY RUN ***');
    return;
  }

  console.log('Admin:', admin.publicKey.toBase58());
  console.log('Slab:', SLAB.toBase58());

  // Step 1: SetOracleAuthority to admin
  console.log('\nStep 1: SetOracleAuthority(admin)...');
  const setAuthData = encodeSetOracleAuthority({ newAuthority: admin.publicKey });
  const setAuthKeys = buildAccountMetas(
    [{ name: 'admin', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
    { admin: admin.publicKey, slab: SLAB }
  );
  await sendIx('SetOracleAuthority', buildIx({ programId: PROGRAM_ID, keys: setAuthKeys, data: setAuthData }));

  // Step 2: PushOraclePrice (SOL = ~$140 USD, priceE6 = 140_000_000 * 1e6 = 1.4e14? No...)
  // priceE6 means the price in micro-units. For USDC collateral, SOL price in USDC:
  // SOL = $140 → priceE6 = 140 * 1_000_000 = 140_000_000 (since e6 = multiplied by 10^6)
  // This is the price per unit of the index asset.
  console.log('\nStep 2: PushOraclePrice...');
  const pushData = encodePushOraclePrice({
    priceE6: '140000000',  // $140 USD expressed as 140 * 10^6 = 140,000,000
    timestamp: String(Math.floor(Date.now() / 1000))
  });
  const pushKeys = buildAccountMetas(
    [{ name: 'authority', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
    { authority: admin.publicKey, slab: SLAB }
  );
  await sendIx('PushOraclePrice', buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData }));

  console.log('\nOracle authority set and price pushed. Slab should now have authority_price_e6 != 0.');
  console.log('Now try ResolveMarket probes again.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
