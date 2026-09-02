import { requireRpcUrl } from "./config.mjs";
// Variant 2: use real-existing admin pubkey 7JVQvr... as payer (DO NOT SIGN — read-only).
// Goal: get past preflight to see actual program execution logs.

import {
  Connection, PublicKey, Keypair, TransactionInstruction,
  TransactionMessage, VersionedTransaction, SystemProgram,
  SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { encodeInitMarket, deriveVaultAuthority } from '../dist/index.js';

const RPC = requireRpcUrl();
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const REAL_ADMIN = new PublicKey('7JVQvrAfzj3aasLxCkoLYX5KQcrb5nEZhUe5Qa8PvV5G');
const PYTH_SOL_USD = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

const conn = new Connection(RPC, 'confirmed');

const slab = Keypair.generate();
const [vault] = deriveVaultAuthority(slab.publicKey, PROGRAM_ID);

const initMarketData = encodeInitMarket({
  admin: REAL_ADMIN,
  collateralMint: USDC_MINT,
  indexFeedId: PYTH_SOL_USD,
  maxStalenessSecs: 60n, confFilterBps: 100, invert: 0, unitScale: 0,
  initialMarkPriceE6: 0n, maxMaintenanceFeePerSlot: 0n,
  maintenanceMarginBps: 500n, initialMarginBps: 1000n,
  tradingFeeBps: 5n, maxAccounts: 256n,
  newAccountFee: 0n, insuranceFloor: 0n,
  hMin: 60n, hMax: 600n, maxCrankStalenessSlots: 100n,
  liquidationFeeBps: 50n, liquidationFeeCap: 1_000_000n,
  minLiquidationAbs: 100_000n, liquidationBufferBps: 0n,
  minNonzeroMmReq: 100_000n, minNonzeroImReq: 200_000n,
  maintenanceFeePerSlot: 0n,
});

const ix = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: REAL_ADMIN,         isSigner: true,  isWritable: true },
    { pubkey: slab.publicKey,     isSigner: false, isWritable: true },
    { pubkey: USDC_MINT,          isSigner: false, isWritable: false },
    { pubkey: vault,              isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY,isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: REAL_ADMIN,         isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.from(initMarketData),
});

const blockhash = (await conn.getLatestBlockhash()).blockhash;
const message = new TransactionMessage({
  payerKey: REAL_ADMIN, recentBlockhash: blockhash, instructions: [ix],
}).compileToV0Message();
const tx = new VersionedTransaction(message);
// Do NOT sign. sigVerify=false will skip.

console.log("Slab pubkey:", slab.publicKey.toBase58());
console.log("Vault PDA:  ", vault.toBase58());
console.log("Tx size:    ", tx.serialize().length);
console.log("Payload sha:", await crypto.subtle.digest('SHA-256', initMarketData).then(b => Buffer.from(b).toString('hex').slice(0,16)));
console.log();

const sim = await conn.simulateTransaction(tx, {
  sigVerify: false,
  replaceRecentBlockhash: true,
  commitment: 'confirmed',
});
console.log("err:", sim.value.err);
console.log("unitsConsumed:", sim.value.unitsConsumed);
if (sim.value.logs) {
  console.log("logs:");
  sim.value.logs.forEach(l => console.log("  ", l));
}
