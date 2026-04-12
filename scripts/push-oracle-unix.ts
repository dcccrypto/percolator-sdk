/**
 * Push oracle price with CURRENT UNIX TIMESTAMP (seconds since epoch).
 * The program compares authority_timestamp to clock.unix_timestamp (Unix seconds).
 * max_staleness_secs for this slab = 120 seconds.
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { encodePushOraclePrice } from '../src/abi/instructions.js';
import { buildAccountMetas } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import { parseConfig } from '../src/solana/slab.js';
import fs from 'fs';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(HELIUS_RPC, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');

async function main() {
  const SIMULATE = process.argv.includes('--simulate');

  // Read current slab state
  const info = await conn.getAccountInfo(SLAB);
  const config = parseConfig(new Uint8Array(info!.data));
  const cfgAny = config as any;
  console.log('Current oracleAuthority:', cfgAny.oracleAuthority?.toBase58?.());
  console.log('Current authorityPriceE6:', cfgAny.authorityPriceE6?.toString?.());
  console.log('Current authorityTimestamp:', cfgAny.authorityTimestamp?.toString?.());
  console.log('maxStalenessSlots (SDK name):', cfgAny.maxStalenessSlots?.toString?.());

  const unixNow = BigInt(Math.floor(Date.now() / 1000));
  console.log('\nUnix now:', unixNow.toString());
  console.log('This will be stored as authority_timestamp, compared to clock.unix_timestamp');

  // Price: use existing price ~$106 to avoid circuit breaker issues
  const priceE6 = '106000000'; // $106

  const pushData = encodePushOraclePrice({
    priceE6,
    timestamp: unixNow.toString(),
  });

  const pushKeys = buildAccountMetas(
    [{ name: 'authority', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
    { authority: admin.publicKey, slab: SLAB }
  );
  const pushIx = buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData });

  if (SIMULATE) {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
    tx.add(pushIx);
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = admin.publicKey;
    tx.sign(admin);
    const res = await conn.simulateTransaction(tx, [admin]);
    console.log('\nSimulate:', res.value.err ? JSON.stringify(res.value.err) : 'SUCCESS');
    return;
  }

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));
  tx.add(pushIx);
  const sig = await sendAndConfirmTransaction(conn, tx, [admin], { commitment: 'confirmed' });
  console.log('\nPushOraclePrice sig:', sig);
  console.log('Explorer:', `https://explorer.solana.com/tx/${sig}`);

  // Verify new state
  const info2 = await conn.getAccountInfo(SLAB);
  const config2 = parseConfig(new Uint8Array(info2!.data));
  const cfg2: any = config2;
  console.log('\nNew authorityTimestamp:', cfg2.authorityTimestamp?.toString?.());
  console.log('New authorityPriceE6:', cfg2.authorityPriceE6?.toString?.());
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
