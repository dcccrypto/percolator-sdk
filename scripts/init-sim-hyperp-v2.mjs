import { requireRpcUrl } from "./config.mjs";
// v2: full hyperp InitMarket sim with slab pre-allocation + vault ATA creation in the same tx.
// Read-only against mainnet program ESa89R5..., no signing, no sending.

import {
  Connection, PublicKey, Keypair, TransactionInstruction,
  TransactionMessage, VersionedTransaction, SystemProgram,
  SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { encodeInitMarket, deriveVaultAuthority } from '../dist/index.js';

const RPC = requireRpcUrl();
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const REAL_ADMIN = new PublicKey('7JVQvrAfzj3aasLxCkoLYX5KQcrb5nEZhUe5Qa8PvV5G');
const HYPERP_FEED = '0000000000000000000000000000000000000000000000000000000000000000';
const SLAB_LEN_SMALL = 96760;

const conn = new Connection(RPC, 'confirmed');

const slab = Keypair.generate();
const [vaultPda] = deriveVaultAuthority(PROGRAM_ID, slab.publicKey);
const vaultAta = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true);

const rent = await conn.getMinimumBalanceForRentExemption(SLAB_LEN_SMALL);

const initMarketData = encodeInitMarket({
  admin: REAL_ADMIN,
  collateralMint: USDC_MINT,
  indexFeedId: HYPERP_FEED,
  maxStalenessSecs: 60n, confFilterBps: 100, invert: 0, unitScale: 0,
  initialMarkPriceE6: 100_000_000n,
  maxMaintenanceFeePerSlot: 0n,
  // production-ish hyperp params, engine-math constrained
  maintenanceMarginBps: 500n,    // 5% maintenance margin
  initialMarginBps: 1000n,       // 10% initial margin
  tradingFeeBps: 5n,             // 0.05% trading fee
  maxAccounts: 256n,             // small tier
  newAccountFee: 1_000_000n,     // 1 USDC dust to spam-protect (wrapper-only, engine doesn't see)
  insuranceFloor: 0n,
  hMin: 1000n, hMax: 50_000n,    // realistic warmup window (~10 sec → 8 min)
  maxCrankStalenessSlots: 50n,
  liquidationFeeBps: 50n,        // 0.5% — fits envelope at mm=500
  liquidationFeeCap: 1_000_000_000_000n,
  // Engine envelope params — these must match small/safe values for solvency proof
  minLiquidationAbs: 0n,          // 0 keeps envelope tight — pct fee still applies
  liquidationBufferBps: 100n,
  minNonzeroMmReq: 21n,           // tiny dust thresholds — engine math friendly
  minNonzeroImReq: 22n,
  maintenanceFeePerSlot: 0n,
  // No explicit extendedTail — SDK v2.0.6+ auto-fills with wrapper defaults.
});

const initIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: REAL_ADMIN,             isSigner: true,  isWritable: true },  // 0 admin
    { pubkey: slab.publicKey,         isSigner: false, isWritable: true },  // 1 slab
    { pubkey: USDC_MINT,              isSigner: false, isWritable: false }, // 2 mint
    { pubkey: vaultAta,               isSigner: false, isWritable: false }, // 3 vault (ATA)
    { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false }, // 4 token
    { pubkey: SYSVAR_CLOCK_PUBKEY,    isSigner: false, isWritable: false }, // 5 clock
    { pubkey: SYSVAR_RENT_PUBKEY,     isSigner: false, isWritable: false }, // 6 rent
    { pubkey: vaultPda,               isSigner: false, isWritable: false }, // 7 dummyAta (= vault auth PDA per launch test)
    { pubkey: SystemProgram.programId,isSigner: false, isWritable: false }, // 8 system
  ],
  data: Buffer.from(initMarketData),
});

const ixs = [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
  SystemProgram.createAccount({
    fromPubkey: REAL_ADMIN,
    newAccountPubkey: slab.publicKey,
    lamports: rent,
    space: SLAB_LEN_SMALL,
    programId: PROGRAM_ID,
  }),
  createAssociatedTokenAccountInstruction(
    REAL_ADMIN,    // payer
    vaultAta,      // ata
    vaultPda,      // owner (must be vault PDA)
    USDC_MINT,
  ),
  initIx,
];

const blockhash = (await conn.getLatestBlockhash()).blockhash;
const message = new TransactionMessage({
  payerKey: REAL_ADMIN, recentBlockhash: blockhash, instructions: ixs,
}).compileToV0Message();
const tx = new VersionedTransaction(message);

console.log("Mode:        Hyperp (all-zero feed_id)");
console.log("Slab pubkey:", slab.publicKey.toBase58(), `(${SLAB_LEN_SMALL} bytes, ${(rent/1e9).toFixed(4)} SOL rent)`);
console.log("Vault PDA:  ", vaultPda.toBase58());
console.log("Vault ATA:  ", vaultAta.toBase58());
console.log("Payload len:", initMarketData.length, "bytes (expect 304)");
console.log("Tx size:    ", tx.serialize().length);
console.log("Ixs:         createAccount → createATA → InitMarket");
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
