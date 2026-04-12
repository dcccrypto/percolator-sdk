import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { encodeResolveMarket, encodePushOraclePrice } from '../src/abi/instructions.js';
import { parseConfig, parseHeader } from '../src/solana/slab.js';
import fs from 'fs';

const conn = new Connection(process.env.RPC_URL!, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');
// Pyth SOL/USD price account on mainnet (the Push Oracle update account)
const PYTH = new PublicKey('7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE');

async function tryResolve(label: string, keys: Array<{pubkey: PublicKey; isSigner: boolean; isWritable: boolean}>) {
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: Buffer.from(encodeResolveMarket()),
  });
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  tx.add(ix);
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  tx.sign(admin);
  const res = await conn.simulateTransaction(tx, [admin]);
  console.log(`\n[${label}] err:`, JSON.stringify(res.value.err));
  const filtered = res.value.logs?.filter(l => !l.includes('ComputeBudget')) ?? [];
  console.log('Logs:', filtered.join('\n'));
}

async function main() {
  // Try 2 accounts (current)
  await tryResolve('2-accts: admin+slab', [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: SLAB, isSigner: false, isWritable: true },
  ]);

  // Try 3 accounts with oracle
  await tryResolve('3-accts: admin+slab+pyth', [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: SLAB, isSigner: false, isWritable: true },
    { pubkey: PYTH, isSigner: false, isWritable: false },
  ]);

  // Try 3 accounts with system program
  await tryResolve('3-accts: admin+slab+system', [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: SLAB, isSigner: false, isWritable: true },
    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
  ]);
}

main().catch(console.error);
