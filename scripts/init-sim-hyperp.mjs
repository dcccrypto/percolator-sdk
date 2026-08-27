import { requireRpcUrl } from "./config.mjs";
// Hyperp variant of InitMarket simulation. all-zero feed_id selects hyperp mode.
// Read-only against mainnet program ESa89R5..., no signing, no sending.

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
const HYPERP_FEED = '0000000000000000000000000000000000000000000000000000000000000000';

const conn = new Connection(RPC, 'confirmed');

const slab = Keypair.generate();
const [vault] = deriveVaultAuthority(slab.publicKey, PROGRAM_ID);

const initMarketData = encodeInitMarket({
  admin: REAL_ADMIN,
  collateralMint: USDC_MINT,
  indexFeedId: HYPERP_FEED,                  // all-zeros = hyperp mode
  maxStalenessSecs: 60n, confFilterBps: 100, invert: 0, unitScale: 0,
  initialMarkPriceE6: 100_000_000n,          // ~100 USDC seed price for hyperp
  maxMaintenanceFeePerSlot: 0n,
  maintenanceMarginBps: 500n, initialMarginBps: 1000n,
  tradingFeeBps: 5n, maxAccounts: 256n,
  newAccountFee: 1_000_000n, insuranceFloor: 0n,
  hMin: 1000n, hMax: 50_000n, maxCrankStalenessSlots: 100n,
  liquidationFeeBps: 100n, liquidationFeeCap: 10_000_000n,
  minLiquidationAbs: 1_000_000n, liquidationBufferBps: 500n,
  minNonzeroMmReq: 1_000_000n, minNonzeroImReq: 2_000_000n,
  maintenanceFeePerSlot: 0n,
});

const ix = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: REAL_ADMIN,             isSigner: true,  isWritable: true },
    { pubkey: slab.publicKey,         isSigner: false, isWritable: true },
    { pubkey: USDC_MINT,              isSigner: false, isWritable: false },
    { pubkey: vault,                  isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY,    isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY,     isSigner: false, isWritable: false },
    { pubkey: REAL_ADMIN,             isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId,isSigner: false, isWritable: false },
  ],
  data: Buffer.from(initMarketData),
});

const blockhash = (await conn.getLatestBlockhash()).blockhash;
const message = new TransactionMessage({
  payerKey: REAL_ADMIN, recentBlockhash: blockhash, instructions: [ix],
}).compileToV0Message();
const tx = new VersionedTransaction(message);

console.log("Mode:        Hyperp (all-zero feed_id)");
console.log("Slab pubkey:", slab.publicKey.toBase58());
console.log("Vault PDA:  ", vault.toBase58());
console.log("Payload len:", initMarketData.length, "bytes (expect 304)");
console.log("Tx size:    ", tx.serialize().length);
console.log("Payload sha:", await crypto.subtle.digest('SHA-256', initMarketData).then(b => Buffer.from(b).toString('hex').slice(0,16)));
console.log();

const sim = await conn.simulateTransaction(tx, {
  sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed',
});
console.log("err:", JSON.stringify(sim.value.err));
console.log("unitsConsumed:", sim.value.unitsConsumed);
if (sim.value.logs) {
  console.log("logs:");
  sim.value.logs.forEach(l => console.log("  ", l));
}
