/**
 * close-market.ts
 *
 * Closes the mainnet market slab FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC
 * in a SINGLE transaction and reclaims all SOL for program redeployment.
 *
 * Discovered account layouts (from Rust source + simulation probing):
 *   PushOraclePrice (tag 17): [authority(signer,w), slab(w)]
 *   CloseAccount (tag 8):     [user(signer,w), slab(w), vault(w), userAta(w),
 *                               vaultPda(ro), tokenProgram, clock, oracle(any)]
 *   ResolveMarket (tag 19):   [admin(signer), slab(w), clock(sysvar), oracle(any)]
 *   WithdrawInsurance (tag 20):[admin(signer,w), slab(w), adminAta(w), vault(w),
 *                               tokenProgram, vaultPda(ro)]
 *   CloseSlab (tag 13):       [admin(signer,w), slab(w), vault(w), vaultPda(ro),
 *                               adminAta(w), tokenProgram]
 *
 * The slab is in hyperp mode (indexFeedId=zeros) so:
 *   - ResolveMarket does NOT check oracle staleness
 *   - authority_timestamp is irrelevant
 *   - The oracle account[3] in ResolveMarket can be any account (SystemProgram)
 *   - CloseSlab zeroes the 290KB slab = needs 1.4M CU
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
import { encodePushOraclePrice, encodeCloseAccount, encodeWithdrawInsurance, encodeCloseSlab } from '../src/abi/instructions.js';
import { buildAccountMetas, ACCOUNTS_WITHDRAW_INSURANCE } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import { parseConfig, parseEngine, parseHeader, parseUsedIndices } from '../src/solana/slab.js';
import { deriveVaultAuthority, deriveKeeperFund } from '../src/solana/pda.js';
import fs from 'fs';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(HELIUS_RPC, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SYS = new PublicKey('11111111111111111111111111111111');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

async function main() {
  const SIMULATE = process.argv.includes('--simulate');

  const slabInfo = await conn.getAccountInfo(SLAB);
  if (!slabInfo) throw new Error('Slab not found');
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
  console.log('');
  console.log('Slab state:');
  console.log('  resolved:', header.resolved);
  console.log('  paused:', header.paused);
  console.log('  vault USDC (raw):', engine.vault.toString());
  console.log('  insurance USDC (raw):', engine.insuranceFund.balance.toString());
  console.log('  numUsed:', engine.numUsedAccounts, '| usedIndices:', usedIndices);
  console.log('  slab rent:', (slabInfo.lamports / 1e9).toFixed(6), 'SOL');
  console.log('');
  console.log('PDAs:');
  console.log('  vaultAuth:', vaultAuth.toBase58());
  console.log('  keeperFund:', keeperFund.toBase58());
  console.log('  adminAta:', adminAta.toBase58());
  console.log('  vault:', VAULT.toBase58());
  console.log('');

  const adminSolBefore = await conn.getBalance(admin.publicKey);
  const adminUsdcBefore = await conn.getTokenAccountBalance(adminAta).catch(() => null);
  const keeperFundInfo = await conn.getAccountInfo(keeperFund);
  console.log('Admin balances before:');
  console.log('  SOL:', (adminSolBefore / 1e9).toFixed(6));
  console.log('  USDC:', adminUsdcBefore?.value.uiAmount ?? 0);
  console.log('  keeperFund SOL:', keeperFundInfo ? (keeperFundInfo.lamports / 1e9).toFixed(6) : '0');
  console.log('');

  if (SIMULATE) console.log('*** SIMULATE MODE ***\n');

  // Get fresh slot for oracle timestamp
  const slot = await conn.getSlot('confirmed');
  console.log('Slot for oracle push:', slot);

  const a = (p: PublicKey, s: boolean, w: boolean) => ({ pubkey: p, isSigner: s, isWritable: w });

  // Instruction 1: PushOraclePrice (keeps authority_price_e6 fresh for hyperp mode)
  const pushIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(
      [{ name: 'authority', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
      { authority: admin.publicKey, slab: SLAB }
    ),
    data: encodePushOraclePrice({ priceE6: '106000000', timestamp: String(slot) }),
  });

  // Instruction 2: CloseAccount (LP idx=0, admin is LP owner)
  const closeAccountIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true),       // user (signer, writable) = LP owner = admin
      a(SLAB, false, true),                 // slab (writable)
      a(VAULT, false, true),                // vault (writable)
      a(adminAta, false, true),             // userAta (writable) = admin USDC ATA
      a(vaultAuth, false, false),           // vaultPda (readonly)
      a(TOKEN_PROGRAM_ID, false, false),    // tokenProgram
      a(SYSVAR_CLOCK_PUBKEY, false, false), // clock
      a(SYS, false, false),                 // oracle (any works for hyperp/admin-oracle)
    ],
    data: encodeCloseAccount({ userIdx: 0 }),
  });

  // Instruction 3: ResolveMarket
  // Requires: [admin(signer), slab(w), clock(sysvar), oracle(any)]
  // Hyperp mode: no staleness check, oracle account is loaded but not validated
  const resolveIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, false),      // admin (signer)
      a(SLAB, false, true),                 // slab (writable)
      a(SYSVAR_CLOCK_PUBKEY, false, false), // clock (required by program)
      a(SYS, false, false),                 // oracle (any for hyperp mode)
    ],
    data: Buffer.from([19]),
  });

  // Instruction 4: WithdrawInsurance (drain 1 USDC insurance fund)
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

  // Instruction 5: CloseSlab (zeros 290KB slab, transfers rent to admin)
  // Requires vault.amount = 0 and insurance.balance = 0 first
  const closeSlabIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true),    // admin (signer, writable) = dest
      a(SLAB, false, true),              // slab (writable)
      a(VAULT, false, true),             // vault (writable)
      a(vaultAuth, false, false),        // vaultPda (readonly)
      a(adminAta, false, true),          // adminAta (writable) = dest_ata
      a(TOKEN_PROGRAM, false, false),    // tokenProgram
    ],
    data: encodeCloseSlab(),
  });

  // Build the transaction
  const ixs: TransactionInstruction[] = [];

  if (!header.resolved) {
    if (usedIndices.includes(0)) {
      console.log('Including: PushOraclePrice, CloseAccount(idx=0), ResolveMarket, WithdrawInsurance, CloseSlab');
      ixs.push(pushIx, closeAccountIx, resolveIx, withdrawInsuranceIx, closeSlabIx);
    } else {
      console.log('No LP accounts — Including: ResolveMarket, WithdrawInsurance, CloseSlab');
      ixs.push(resolveIx, withdrawInsuranceIx, closeSlabIx);
    }
  } else {
    console.log('Already resolved — Including: WithdrawInsurance (if needed), CloseSlab');
    if (engine.insuranceFund.balance > 0n) ixs.push(withdrawInsuranceIx);
    ixs.push(closeSlabIx);
  }

  const tx = new Transaction();
  // 1.4M CU needed (CloseSlab zeros 290KB)
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));
  for (const ix of ixs) tx.add(ix);

  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;

  if (SIMULATE) {
    tx.sign(admin);
    const res = await conn.simulateTransaction(tx, [admin]);
    const ok = !res.value.err;
    console.log('\nSimulation result:', ok ? 'SUCCESS' : JSON.stringify(res.value.err));
    console.log('CU consumed:', res.value.unitsConsumed);
    if (!ok) {
      const errLogs = res.value.logs?.filter(l => l.includes('error') || l.includes('failed') || l.includes('ESa89')).slice(-10) ?? [];
      console.log('Error logs:', errLogs.join('\n'));
    }
    return;
  }

  // Execute on-chain
  console.log('\nSubmitting transaction...');
  const sig = await sendAndConfirmTransaction(conn, tx, [admin], {
    commitment: 'confirmed',
    maxRetries: 3,
  });
  console.log('\nTransaction confirmed!');
  console.log('Signature:', sig);
  console.log('Explorer:', `https://explorer.solana.com/tx/${sig}`);

  // Final balances
  console.log('\n--- Final Balances ---');
  const adminSolAfter = await conn.getBalance(admin.publicKey);
  const adminUsdcAfter = await conn.getTokenAccountBalance(adminAta).catch(() => null);
  const slabAfter = await conn.getAccountInfo(SLAB);
  const kfAfter = await conn.getAccountInfo(keeperFund);

  console.log('Admin SOL:', (adminSolAfter / 1e9).toFixed(6), `(gained ${((adminSolAfter - adminSolBefore) / 1e9).toFixed(6)} SOL)`);
  console.log('Admin USDC:', adminUsdcAfter?.value.uiAmount ?? 0);
  console.log('Slab account:', slabAfter ? `STILL EXISTS (${slabAfter.lamports} lamports)` : 'CLOSED');
  console.log('KeeperFund:', kfAfter ? `still has ${(kfAfter.lamports / 1e9).toFixed(6)} SOL` : 'CLOSED');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
