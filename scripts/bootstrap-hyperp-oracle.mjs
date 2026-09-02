import { requireAdminKeypairPath, requireRpcUrl } from "./config.mjs";
// Bootstrap fix: send UpdateHyperpMark on its own (no Crank bundled) so the
// new market's oracle picks up a fresh slot timestamp. After this lands,
// the keeper's bundled UpdateHyperpMark+Crank tx should pass freshness check.

import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
  sendAndConfirmTransaction, ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import { encodeUpdateHyperpMark } from '../dist/index.js';
import fs from 'fs';

const RPC = requireRpcUrl();
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('H7CVBttJmyAiae3bsKSCz8DbrPtKwMhs4NeFmQ9okhpz');
const POOL = new PublicKey('3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv');
const ADMIN_KEYPAIR_PATH = requireAdminKeypairPath();

const conn = new Connection(RPC, 'confirmed');
const admin = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, 'utf8'))));

console.log('Sending solo UpdateHyperpMark...');

const tx = new Transaction();
tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));
tx.add(new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: SLAB,                isSigner: false, isWritable: true },
    { pubkey: POOL,                isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    // Raydium CLMM: no remaining accounts needed
  ],
  data: Buffer.from(encodeUpdateHyperpMark()),
}));

const { blockhash } = await conn.getLatestBlockhash('confirmed');
tx.recentBlockhash = blockhash;
tx.feePayer = admin.publicKey;

const sig = await sendAndConfirmTransaction(conn, tx, [admin], { commitment: 'confirmed', maxRetries: 3 });
console.log(`  Sig: ${sig}`);
console.log(`  Solscan: https://solscan.io/tx/${sig}`);
