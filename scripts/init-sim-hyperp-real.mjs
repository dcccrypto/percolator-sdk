import { requireRpcUrl } from "./config.mjs";
// Real-params hyperp InitMarket sim — uses the EXACT defaults from
// percolator-launch/scripts/create-market.ts to verify the production
// param set passes engine validation against the deployed v12.19 wrapper.
//
// Read-only against mainnet program ESa89R5..., no signing, no sending.

import {
  Connection, PublicKey, Keypair, TransactionInstruction,
  TransactionMessage, VersionedTransaction, SystemProgram,
  SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { encodeInitMarket, deriveVaultAuthority, SLAB_TIERS_V12_19 } from '../dist/index.js';

const RPC = requireRpcUrl();
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const REAL_ADMIN = new PublicKey('7JVQvrAfzj3aasLxCkoLYX5KQcrb5nEZhUe5Qa8PvV5G');
const HYPERP_FEED = '0000000000000000000000000000000000000000000000000000000000000000';

// Slab size — SDK probe-confirmed deployed v12.19 small tier.
const SLAB_LEN_SMALL = SLAB_TIERS_V12_19.small.dataSize;

const conn = new Connection(RPC, 'confirmed');

const slab = Keypair.generate();
const [vaultPda] = deriveVaultAuthority(PROGRAM_ID, slab.publicKey);
const vaultAta = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true);

const rent = await conn.getMinimumBalanceForRentExemption(SLAB_LEN_SMALL);

// ============================================================================
// EXACT PARAMS FROM create-market.ts DEFAULT_RISK_PARAMS + DEFAULT_INIT_EXTRA
// ============================================================================
const initMarketData = encodeInitMarket({
  admin: REAL_ADMIN,
  collateralMint: USDC_MINT,
  indexFeedId: HYPERP_FEED,
  // Hyperp mode header
  maxStalenessSecs: 120n,
  confFilterBps: 0,
  invert: 0,
  unitScale: 0,
  initialMarkPriceE6: 150_000_000n,  // $150 SOL placeholder
  // DEFAULT_INIT_EXTRA
  maxInsuranceFloor: 1_000_000_000_000n,  // 1M USDC
  minOraclePriceCap: 500n,                 // 5% min
  // DEFAULT_RISK_PARAMS
  hMin: 150n,
  hMax: 600n,
  maintenanceMarginBps: 500n,
  initialMarginBps: 1000n,
  tradingFeeBps: 10n,
  maxAccounts: 256n,
  newAccountFee: 1_000_000n,
  maintenanceFeePerSlot: 0n,
  maxCrankStalenessSlots: 300n,
  liquidationFeeBps: 50n,
  liquidationFeeCap: 100_000_000n,
  minLiquidationAbs: 100n,
  minInitialDeposit: 2_000_000n,
  minNonzeroMmReq: 100_000n,
  minNonzeroImReq: 500_000n,
  insuranceFloor: 0n,
  // SDK auto-fills extended tail with wrapper defaults (v2.0.6+)
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
    { pubkey: vaultPda,               isSigner: false, isWritable: false }, // 7 dummyAta
    { pubkey: SystemProgram.programId,isSigner: false, isWritable: false }, // 8 system
  ],
  data: Buffer.from(initMarketData),
});

const ixs = [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
  SystemProgram.createAccount({
    fromPubkey: REAL_ADMIN,
    newAccountPubkey: slab.publicKey,
    lamports: rent,
    space: SLAB_LEN_SMALL,
    programId: PROGRAM_ID,
  }),
  createAssociatedTokenAccountInstruction(
    REAL_ADMIN,
    vaultAta,
    vaultPda,
    USDC_MINT,
  ),
  initIx,
];

const blockhash = (await conn.getLatestBlockhash()).blockhash;
const message = new TransactionMessage({
  payerKey: REAL_ADMIN, recentBlockhash: blockhash, instructions: ixs,
}).compileToV0Message();
const tx = new VersionedTransaction(message);

console.log("Mode:        Hyperp (real production params from create-market.ts)");
console.log("Slab pubkey:", slab.publicKey.toBase58(), `(${SLAB_LEN_SMALL} bytes, ${(rent/1e9).toFixed(4)} SOL rent)`);
console.log("Vault PDA:  ", vaultPda.toBase58());
console.log("Vault ATA:  ", vaultAta.toBase58());
console.log("Payload len:", initMarketData.length, "bytes (expect 370)");
console.log("Tx size:    ", tx.serialize().length);
console.log("Ixs:         CU+price → createAccount → createATA → InitMarket");
console.log();
console.log("Engine envelope check (manual):");
console.log("  liqFeeBps + 400 + 10 =", 50 + 400 + 10, "<= mm =", 500, "?", (50 + 400 + 10) <= 500 ? "YES" : "NO");
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
