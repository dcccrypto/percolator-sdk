import { requireAdminKeypairPath, requireRpcUrl } from "./config.mjs";
// Authorized one-shot SOL transfer: admin -> keeper wallet, 0.2 SOL.
import {
  Connection, Keypair, PublicKey, Transaction,
  SystemProgram, sendAndConfirmTransaction,
} from '@solana/web3.js';
import fs from 'fs';

const RPC = requireRpcUrl();
const ADMIN_KEYPAIR_PATH = requireAdminKeypairPath();
const KEEPER_PUBKEY = new PublicKey('8y7sXswvGo6fWa4daCnxaE3znaFoBs6QJXLTzCLYXotV');
const AMOUNT_LAMPORTS = 200_000_000; // 0.2 SOL

const conn = new Connection(RPC, 'confirmed');
const admin = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, 'utf8'))));

console.log(`Admin:  ${admin.publicKey.toBase58()}`);
console.log(`Keeper: ${KEEPER_PUBKEY.toBase58()}`);
console.log(`Amount: ${AMOUNT_LAMPORTS / 1e9} SOL`);
console.log();

const before = {
  admin: await conn.getBalance(admin.publicKey),
  keeper: await conn.getBalance(KEEPER_PUBKEY),
};
console.log(`Admin SOL before:  ${(before.admin / 1e9).toFixed(6)}`);
console.log(`Keeper SOL before: ${(before.keeper / 1e9).toFixed(6)}`);

const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: admin.publicKey,
    toPubkey: KEEPER_PUBKEY,
    lamports: AMOUNT_LAMPORTS,
  }),
);
const { blockhash } = await conn.getLatestBlockhash('confirmed');
tx.recentBlockhash = blockhash;
tx.feePayer = admin.publicKey;

console.log('\nSending...');
const sig = await sendAndConfirmTransaction(conn, tx, [admin], { commitment: 'confirmed', maxRetries: 3 });
console.log(`Sig: ${sig}`);
console.log(`Solscan: https://solscan.io/tx/${sig}`);

const after = {
  admin: await conn.getBalance(admin.publicKey),
  keeper: await conn.getBalance(KEEPER_PUBKEY),
};
console.log();
console.log(`Admin SOL after:  ${(after.admin / 1e9).toFixed(6)} (delta ${((after.admin - before.admin) / 1e9).toFixed(6)})`);
console.log(`Keeper SOL after: ${(after.keeper / 1e9).toFixed(6)} (delta +${((after.keeper - before.keeper) / 1e9).toFixed(6)})`);
