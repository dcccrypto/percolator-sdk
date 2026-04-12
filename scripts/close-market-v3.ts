/**
 * close-market-v3.ts
 *
 * Closes the second mainnet market slab 12o3bXwBm9TxrMboFwNN2C9nzCuuCkwBthrjV2NQobQd
 * (wrong initial price $150, needs closing for recreation at $84).
 *
 * Flow: ResolveMarket -> CloseAccount(idx=0) -> WithdrawInsurance -> CloseSlab
 */
import 'dotenv/config';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { encodeCloseAccount, encodeWithdrawInsurance, encodeCloseSlab } from '../src/abi/instructions.js';
import { buildAccountMetas, ACCOUNTS_WITHDRAW_INSURANCE } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import { parseConfig, parseEngine, parseHeader, parseUsedIndices } from '../src/solana/slab.js';
import { deriveVaultAuthority, deriveKeeperFund } from '../src/solana/pda.js';
import fs from 'fs';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(HELIUS_RPC, 'confirmed');
const admin = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8')))
);
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('12o3bXwBm9TxrMboFwNN2C9nzCuuCkwBthrjV2NQobQd');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SYS = new PublicKey('11111111111111111111111111111111');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

async function main() {
  const SIMULATE = process.argv.includes('--simulate');

  const slabInfo = await conn.getAccountInfo(SLAB);
  if (!slabInfo) throw new Error('Slab not found: ' + SLAB.toBase58());
  const slabData = new Uint8Array(slabInfo.data);

  const header = parseHeader(slabData);
  const config = parseConfig(slabData);
  const engine = parseEngine(slabData);
  const usedIndices = parseUsedIndices(slabData);
  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const [keeperFund] = deriveKeeperFund(PROGRAM_ID, SLAB);
  const VAULT = config.vaultPubkey;
  const adminAta = await getAssociatedTokenAddress(USDC, admin.publicKey);

  console.log('Admin:', admin.publicKey.toBase58());
  console.log('Slab:', SLAB.toBase58());
  console.log('Vault:', VAULT.toBase58());
  console.log('VaultAuth:', vaultAuth.toBase58());
  console.log('KeeperFund:', keeperFund.toBase58());
  console.log('AdminATA:', adminAta.toBase58());
  console.log('');
  console.log('Slab state:');
  console.log('  resolved:', header.resolved);
  console.log('  vault USDC:', (Number(engine.vault) / 1e6).toFixed(2));
  console.log('  insurance USDC:', (Number(engine.insuranceFund.balance) / 1e6).toFixed(2));
  console.log('  usedIndices:', usedIndices);
  console.log('  slab rent:', (slabInfo.lamports / 1e9).toFixed(6), 'SOL');

  const adminSolBefore = await conn.getBalance(admin.publicKey);
  const adminUsdcInfo = await conn.getAccountInfo(adminAta);
  const adminUsdcBefore = adminUsdcInfo ? Number(adminUsdcInfo.data.readBigUInt64LE(64)) / 1e6 : 0;
  const kfInfo = await conn.getAccountInfo(keeperFund);

  console.log('');
  console.log('=== BALANCES BEFORE ===');
  console.log('Admin SOL:', (adminSolBefore / 1e9).toFixed(6));
  console.log('Admin USDC:', adminUsdcBefore.toFixed(2));
  console.log('KeeperFund SOL:', kfInfo ? (kfInfo.lamports / 1e9).toFixed(6) : '0');

  if (SIMULATE) console.log('\n*** SIMULATE MODE ***\n');

  const a = (p: PublicKey, s: boolean, w: boolean) => ({ pubkey: p, isSigner: s, isWritable: w });

  // ResolveMarket (tag 19)
  const resolveIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, false),
      a(SLAB, false, true),
      a(SYSVAR_CLOCK_PUBKEY, false, false),
      a(SYS, false, false),
    ],
    data: Buffer.from([19]),
  });

  // CloseAccount(idx=0)
  const closeAccountIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true),
      a(SLAB, false, true),
      a(VAULT, false, true),
      a(adminAta, false, true),
      a(vaultAuth, false, false),
      a(TOKEN_PROGRAM_ID, false, false),
      a(SYSVAR_CLOCK_PUBKEY, false, false),
      a(SYS, false, false),
    ],
    data: encodeCloseAccount({ userIdx: 0 }),
  });

  // WithdrawInsurance (tag 20)
  const withdrawInsuranceIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_WITHDRAW_INSURANCE, {
      admin: admin.publicKey,
      slab: SLAB,
      adminAta,
      vault: VAULT,
      tokenProgram: TOKEN_PROGRAM_ID,
      vaultPda: vaultAuth,
    }),
    data: encodeWithdrawInsurance(),
  });

  // CloseSlab (tag 13)
  const closeSlabIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true),
      a(SLAB, false, true),
      a(VAULT, false, true),
      a(vaultAuth, false, false),
      a(adminAta, false, true),
      a(TOKEN_PROGRAM, false, false),
    ],
    data: encodeCloseSlab(),
  });

  // NOTE: insurance was funded via FundMarketInsurance (tag 41) which goes to isolated balance.
  // WithdrawInsurance (tag 20) only handles general insurance. Skip it — CloseSlab handles all.
  const ixs: TransactionInstruction[] = [];
  if (!header.resolved) {
    if (usedIndices.length > 0) {
      console.log('Including: ResolveMarket, CloseAccount(idx=0), CloseSlab');
      ixs.push(resolveIx, closeAccountIx, closeSlabIx);
    } else {
      console.log('Including: ResolveMarket, CloseSlab');
      ixs.push(resolveIx, closeSlabIx);
    }
  } else {
    console.log('Already resolved — CloseAccount, CloseSlab');
    if (usedIndices.length > 0) ixs.push(closeAccountIx);
    ixs.push(closeSlabIx);
  }

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));
  for (const ix of ixs) tx.add(ix);

  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;

  if (SIMULATE) {
    tx.sign(admin);
    const res = await conn.simulateTransaction(tx, [admin]);
    console.log('Simulation:', !res.value.err ? 'SUCCESS' : JSON.stringify(res.value.err));
    console.log('CU:', res.value.unitsConsumed);
    if (res.value.logs) {
      const errLogs = res.value.logs.filter(l => l.includes('error') || l.includes('failed') || l.includes('Error'));
      if (errLogs.length > 0) console.log('Error logs:\n', errLogs.join('\n'));
      console.log('Last 20 logs:\n', res.value.logs.slice(-20).join('\n'));
    }
    return;
  }

  console.log('\nSubmitting close transaction...');
  const sig = await sendAndConfirmTransaction(conn, tx, [admin], {
    commitment: 'confirmed',
    maxRetries: 3,
  });

  console.log('\n=== CLOSE CONFIRMED ===');
  console.log('Signature:', sig);
  console.log('Explorer:', `https://explorer.solana.com/tx/${sig}`);

  const adminSolAfter = await conn.getBalance(admin.publicKey);
  const adminUsdcInfoAfter = await conn.getAccountInfo(adminAta);
  const adminUsdcAfter = adminUsdcInfoAfter ? Number(adminUsdcInfoAfter.data.readBigUInt64LE(64)) / 1e6 : 0;
  const slabAfter = await conn.getAccountInfo(SLAB);
  const kfAfter = await conn.getAccountInfo(keeperFund);

  console.log('');
  console.log('=== BALANCES AFTER ===');
  console.log('Admin SOL:', (adminSolAfter / 1e9).toFixed(6), `(delta: ${((adminSolAfter - adminSolBefore) / 1e9).toFixed(6)} SOL)`);
  console.log('Admin USDC:', adminUsdcAfter.toFixed(2), `(delta: ${(adminUsdcAfter - adminUsdcBefore).toFixed(2)} USDC)`);
  console.log('Slab:', slabAfter ? `STILL EXISTS (${slabAfter.lamports} lamports)` : 'CLOSED');
  console.log('KeeperFund:', kfAfter ? `still has ${(kfAfter.lamports / 1e9).toFixed(6)} SOL` : 'CLOSED');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
