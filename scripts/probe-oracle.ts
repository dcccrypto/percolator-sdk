import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { encodeSetOracleAuthority, encodePushOraclePrice, encodeResolveMarket } from '../src/abi/instructions.js';
import { ACCOUNTS_SET_ORACLE_AUTHORITY, ACCOUNTS_PUSH_ORACLE_PRICE, ACCOUNTS_RESOLVE_MARKET, buildAccountMetas } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import fs from 'fs';

const conn = new Connection(process.env.RPC_URL!, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');

async function sim(label: string, ixs: TransactionInstruction[]): Promise<boolean> {
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  for (const ix of ixs) tx.add(ix);
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  tx.sign(admin);
  const res = await conn.simulateTransaction(tx, [admin]);
  const ok = !res.value.err;
  console.log(`\n[${label}] err:`, JSON.stringify(res.value.err), ok ? 'SUCCESS' : '');
  const filtered = res.value.logs?.filter(l => !l.includes('ComputeBudget')) ?? [];
  console.log('Logs:', filtered.join('\n'));
  return ok;
}

async function main() {
  // Step 1: SetOracleAuthority to admin
  const setAuthData = encodeSetOracleAuthority({ newAuthority: admin.publicKey });
  const setAuthKeys = buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, {
    admin: admin.publicKey,
    slab: SLAB,
  });
  const setAuthIx = buildIx({ programId: PROGRAM_ID, keys: setAuthKeys, data: setAuthData });
  const setOk = await sim('SetOracleAuthority(admin)', [setAuthIx]);

  if (!setOk) {
    console.log('SetOracleAuthority failed — trying to push with zero authority');
  }

  // Step 2: PushOraclePrice with a price (SOL=~140 USD, expressed in e6 => 140_000_000)
  // Also try as part of same tx as SetOracleAuthority
  const pushData = encodePushOraclePrice({
    priceE6: '140000000000',  // $140,000 e6 => $140 USD
    timestamp: String(Math.floor(Date.now() / 1000))
  });
  const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, {
    authority: admin.publicKey,
    slab: SLAB,
  });
  const pushIx = buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData });

  // Try push after set in same tx
  await sim('SetOracleAuth+PushOraclePrice combined', [setAuthIx, pushIx]);

  // Try resolve after set+push in same tx
  const resolveData = encodeResolveMarket();
  const resolveKeys = buildAccountMetas(ACCOUNTS_RESOLVE_MARKET, {
    admin: admin.publicKey,
    slab: SLAB,
  });
  const resolveIx = buildIx({ programId: PROGRAM_ID, keys: resolveKeys, data: resolveData });
  await sim('SetOracleAuth+Push+Resolve combined', [setAuthIx, pushIx, resolveIx]);
}

main().catch(console.error);
