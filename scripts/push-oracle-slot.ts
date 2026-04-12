/**
 * Push oracle price with CURRENT SLOT as timestamp (not Unix time).
 * The program stores authorityTimestamp as a slot and checks staleness
 * by comparing current_slot - authorityTimestamp <= maxStalenessSlots.
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { encodePushOraclePrice } from '../src/abi/instructions.js';
import { buildAccountMetas } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import fs from 'fs';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(HELIUS_RPC, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');

async function main() {
  const SIMULATE = process.argv.includes('--simulate');

  // Get current slot to use as timestamp
  const currentSlot = await conn.getSlot('confirmed');
  console.log('Current slot:', currentSlot);
  console.log('Admin:', admin.publicKey.toBase58());
  console.log('Slab:', SLAB.toBase58());

  // Use current slot as timestamp (not Unix time)
  // Price: SOL ~$106 but use a round number
  const priceE6 = '106000000'; // $106 as e6
  console.log(`Price: $${parseInt(priceE6) / 1e6}, timestamp: slot ${currentSlot}`);

  const pushData = encodePushOraclePrice({
    priceE6,
    timestamp: String(currentSlot),
  });

  const pushKeys = buildAccountMetas(
    [{ name: 'authority', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
    { authority: admin.publicKey, slab: SLAB }
  );
  const pushIx = buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData });

  if (SIMULATE) {
    const { Transaction: Tx, ComputeBudgetProgram: CB } = await import('@solana/web3.js');
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
    tx.add(pushIx);
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = admin.publicKey;
    tx.sign(admin);
    const res = await conn.simulateTransaction(tx, [admin]);
    console.log('Simulate result:', res.value.err ? JSON.stringify(res.value.err) : 'SUCCESS');
    console.log('Logs:', res.value.logs?.slice(-5));
    return;
  }

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));
  tx.add(pushIx);
  const sig = await sendAndConfirmTransaction(conn, tx, [admin], { commitment: 'confirmed' });
  console.log('PushOraclePrice sig:', sig);
  console.log('Explorer:', `https://explorer.solana.com/tx/${sig}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
