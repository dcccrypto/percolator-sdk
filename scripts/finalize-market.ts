/**
 * finalize-market.ts
 *
 * Completes the post-creation steps for slab 12o3bXwBm9TxrMboFwNN2C9nzCuuCkwBthrjV2NQobQd:
 *   1. TopUpInsurance: add 9 USDC to bring total to ~10 USDC
 *   2. TopUpKeeperFund: add 0.1 SOL to keeper fund
 *   3. SetOracleAuthority: zero out oracle authority (confirm hyperp mode)
 *
 * Uses Helius RPC to avoid rate limits.
 */
import 'dotenv/config';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import fs from 'fs';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(HELIUS_RPC, 'confirmed');
const admin = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8')))
);
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('12o3bXwBm9TxrMboFwNN2C9nzCuuCkwBthrjV2NQobQd');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

async function sendTx(name: string, tx: Transaction, signers: Keypair[]) {
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  const sig = await sendAndConfirmTransaction(conn, tx, signers, { commitment: 'confirmed', maxRetries: 5 });
  console.log(`${name}: ${sig}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${sig}`);
  return sig;
}

async function main() {
  const SIMULATE = process.argv.includes('--simulate');

  // Derive PDAs
  const { PublicKey: PK } = await import('@solana/web3.js');
  const enc = new TextEncoder();
  const [vaultAuth] = PublicKey.findProgramAddressSync(
    [enc.encode('vault'), SLAB.toBytes()], PROGRAM_ID
  );
  const [keeperFund] = PublicKey.findProgramAddressSync(
    [enc.encode('keeper_fund'), SLAB.toBytes()], PROGRAM_ID
  );
  const adminAta = await getAssociatedTokenAddress(USDC, admin.publicKey);

  // Read vault from slab config
  const slabInfo = await conn.getAccountInfo(SLAB);
  if (!slabInfo) throw new Error('Slab not found');
  // Config starts at offset 48: collateral_mint(32) + vault(32)
  // Use parseConfig from SDK
  const { parseConfig, parseEngine } = await import('../src/solana/slab.js');
  const slabData = new Uint8Array(slabInfo.data);
  const config = parseConfig(slabData);
  const engine = parseEngine(slabData);
  const VAULT = config.vaultPubkey;

  console.log('Slab:', SLAB.toBase58());
  console.log('VaultAuth:', vaultAuth.toBase58());
  console.log('KeeperFund:', keeperFund.toBase58());
  console.log('Vault:', VAULT.toBase58());
  console.log('AdminATA:', adminAta.toBase58());
  console.log('');
  console.log('Current insurance:', (Number(engine.insuranceFund.balance) / 1e6).toFixed(2), 'USDC');

  const adminSolBefore = await conn.getBalance(admin.publicKey);
  const kfInfo = await conn.getAccountInfo(keeperFund);
  const adminUsdcRaw = await conn.getAccountInfo(adminAta);
  const adminUsdc = adminUsdcRaw ? Number(adminUsdcRaw.data.readBigUInt64LE(64)) / 1e6 : 0;

  console.log('Admin SOL:', (adminSolBefore / 1e9).toFixed(6));
  console.log('Admin USDC:', adminUsdc.toFixed(2));
  console.log('KeeperFund SOL:', kfInfo ? (kfInfo.lamports / 1e9).toFixed(6) : '0');
  console.log('');

  const a = (p: PublicKey, s: boolean, w: boolean) => ({ pubkey: p, isSigner: s, isWritable: w });

  // TX1: TopUpInsurance — add 9 USDC (9_000_000 raw) to reach ~10 USDC
  // Instruction tag 9, data: [9, amount as u64 LE]
  // Accounts: [admin(signer), slab(writable), adminAta(writable), vault(writable), vaultPda(ro), tokenProgram]
  const insuranceAmount = 9_000_000n; // 9 USDC
  const insuranceData = Buffer.alloc(9);
  insuranceData.writeUInt8(9, 0); // tag = TopUpInsurance
  insuranceData.writeBigUInt64LE(insuranceAmount, 1);

  // FundMarketInsurance (tag 41) — per-market isolated insurance
  // Accounts: [admin(signer,writable), slab(writable), admin_ata(writable), vault(writable), token_program]
  const topUpInsuranceIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true),    // admin (signer, writable)
      a(SLAB, false, true),              // slab (writable)
      a(adminAta, false, true),          // admin_ata (writable)
      a(VAULT, false, true),             // vault (writable)
      a(TOKEN_PROGRAM, false, false),    // token_program
    ],
    data: insuranceData,
  });
  // Update instruction tag to FundMarketInsurance (41)
  insuranceData.writeUInt8(41, 0);

  // TX2: TopUpKeeperFund — add 0.1 SOL
  // Instruction tag 57, data: [57, amount as u64 LE]
  // Accounts: [payer(signer,writable), slab(ro), keeperFund(writable), systemProgram]
  const keeperFundAmount = 100_000_000n; // 0.1 SOL in lamports
  const keeperFundData = Buffer.alloc(9);
  keeperFundData.writeUInt8(57, 0); // tag = TopUpKeeperFund
  keeperFundData.writeBigUInt64LE(keeperFundAmount, 1);

  const topUpKeeperFundIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true),    // payer (signer, writable)
      a(SLAB, false, true),              // slab (writable)
      a(keeperFund, false, true),        // keeperFund (writable)
      a(SystemProgram.programId, false, false), // systemProgram
    ],
    data: keeperFundData,
  });

  // TX3: SetOracleAuthority to zeros (confirm hyperp mode)
  // Instruction tag 16, data: [16, 32 zero bytes]
  // Accounts: [admin(signer), slab(writable)]
  const setOracleAuthorityData = Buffer.alloc(33);
  setOracleAuthorityData.writeUInt8(16, 0); // tag = SetOracleAuthority
  // Remaining 32 bytes are zeros = clear oracle authority

  const setOracleAuthorityIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, false),   // admin (signer)
      a(SLAB, false, true),              // slab (writable)
    ],
    data: setOracleAuthorityData,
  });

  if (SIMULATE) {
    // Simulate all three together
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }));
    tx.add(topUpInsuranceIx);
    tx.add(topUpKeeperFundIx);
    tx.add(setOracleAuthorityIx);
    const { blockhash } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = admin.publicKey;
    tx.sign(admin);
    const res = await conn.simulateTransaction(tx, [admin]);
    const ok = !res.value.err;
    console.log('Simulation:', ok ? 'SUCCESS' : JSON.stringify(res.value.err));
    console.log('CU:', res.value.unitsConsumed);
    if (res.value.logs) {
      console.log('Logs:\n', res.value.logs.join('\n'));
    }
    return;
  }

  // Execute sequentially
  console.log('--- TX1: TopUpInsurance (9 USDC) ---');
  const tx1 = new Transaction();
  tx1.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }));
  tx1.add(topUpInsuranceIx);
  const sig1 = await sendTx('TopUpInsurance', tx1, [admin]);

  console.log('--- TX2: TopUpKeeperFund (0.1 SOL) ---');
  const tx2 = new Transaction();
  tx2.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }));
  tx2.add(topUpKeeperFundIx);
  const sig2 = await sendTx('TopUpKeeperFund', tx2, [admin]);

  console.log('--- TX3: SetOracleAuthority (zeros = hyperp) ---');
  const tx3 = new Transaction();
  tx3.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }));
  tx3.add(setOracleAuthorityIx);
  const sig3 = await sendTx('SetOracleAuthority', tx3, [admin]);

  // Final state
  const adminSolAfter = await conn.getBalance(admin.publicKey);
  const kfAfter = await conn.getAccountInfo(keeperFund);
  const slabAfter = await conn.getAccountInfo(SLAB);
  const slabDataAfter = new Uint8Array(slabAfter!.data);
  const engineAfter = parseEngine(slabDataAfter);

  console.log('');
  console.log('=== FINAL STATE ===');
  console.log('Admin SOL:', (adminSolAfter / 1e9).toFixed(6));
  console.log('KeeperFund SOL:', kfAfter ? (kfAfter.lamports / 1e9).toFixed(6) : '0');
  console.log('Insurance USDC:', (Number(engineAfter.insuranceFund.balance) / 1e6).toFixed(2));
  console.log('Vault USDC:', (Number(engineAfter.vault) / 1e6).toFixed(2));
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
