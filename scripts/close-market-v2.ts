/**
 * close-market-v2.ts
 *
 * Closes the mainnet market slab Cnz9xQJBurijM7PgQz5n4asVzPEEhAZM2wTUWdRdSiP7
 * (the current live market at $150 wrong price) and reclaims ALL SOL + USDC.
 *
 * Flow:
 *   1. PushOraclePrice (keep price fresh for hyperp mode)
 *   2. CloseAccount(idx=0) — close LP account, reclaim LP USDC to adminAta
 *   3. ResolveMarket (tag 19) — mark market as resolved
 *   4. WithdrawInsurance (tag 20) — drain insurance USDC to adminAta
 *   5. CloseSlab (tag 13) — zero 290KB slab, return rent + remaining vault to admin
 *
 * Needs 1.4M CU (CloseSlab zeroes 290KB).
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
const admin = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8')))
);
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
// The current live slab (wrong price $150, needs closing)
const SLAB = new PublicKey('Cnz9xQJBurijM7PgQz5n4asVzPEEhAZM2wTUWdRdSiP7');
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
  console.log('KeeperFund (derived):', keeperFund.toBase58());
  console.log('AdminATA:', adminAta.toBase58());
  console.log('');
  console.log('Slab state:');
  console.log('  resolved:', header.resolved);
  console.log('  paused:', header.paused);
  console.log('  flags:', header.flags);
  console.log('  vault USDC (raw):', engine.vault.toString(), '=', (Number(engine.vault) / 1e6).toFixed(2), 'USDC');
  console.log('  insurance USDC (raw):', engine.insuranceFund.balance.toString(), '=', (Number(engine.insuranceFund.balance) / 1e6).toFixed(2), 'USDC');
  console.log('  numUsedAccounts:', engine.numUsedAccounts, '| usedIndices:', usedIndices);
  console.log('  slab rent:', (slabInfo.lamports / 1e9).toFixed(6), 'SOL');
  console.log('');

  // Balances before
  const adminSolBefore = await conn.getBalance(admin.publicKey);
  const adminUsdcBefore = await conn.getTokenAccountBalance(adminAta).catch(() => null);
  const keeperFundInfo = await conn.getAccountInfo(keeperFund);
  const vaultBalance = await conn.getTokenAccountBalance(VAULT).catch(() => null);
  const kfMentioned = await conn.getAccountInfo(new PublicKey('AA1F1NQj1nc2JxksQqgaRVcE8EGpSPpn8pWUXKQYDD3r'));

  console.log('=== BALANCES BEFORE ===');
  console.log('Admin SOL:', (adminSolBefore / 1e9).toFixed(6));
  console.log('Admin USDC:', adminUsdcBefore?.value.uiAmount ?? 'no ATA');
  console.log('Vault USDC:', vaultBalance?.value.uiAmount ?? 'no vault');
  console.log('KeeperFund (derived):', keeperFundInfo ? (keeperFundInfo.lamports / 1e9).toFixed(6) + ' SOL' : 'not found');
  console.log('KeeperFund AA1F1 (task mention):', kfMentioned ? (kfMentioned.lamports / 1e9).toFixed(6) + ' SOL' : 'not found');
  console.log('');

  if (SIMULATE) console.log('*** SIMULATE MODE ***\n');

  const slot = await conn.getSlot('confirmed');
  console.log('Current slot:', slot);

  const a = (p: PublicKey, s: boolean, w: boolean) => ({ pubkey: p, isSigner: s, isWritable: w });

  // Instruction 1: PushOraclePrice (keeps authority_price_e6 fresh so ResolveMarket accepts it)
  const pushIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(
      [{ name: 'authority', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
      { authority: admin.publicKey, slab: SLAB }
    ),
    data: encodePushOraclePrice({ priceE6: '84000000', timestamp: String(slot) }),
  });

  // Instruction 2: CloseAccount (LP idx=0, admin is LP owner)
  const closeAccountIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true),       // user (signer, writable) = LP owner = admin
      a(SLAB, false, true),                 // slab (writable)
      a(VAULT, false, true),                // vault (writable)
      a(adminAta, false, true),             // userAta (writable)
      a(vaultAuth, false, false),           // vaultPda (readonly)
      a(TOKEN_PROGRAM_ID, false, false),    // tokenProgram
      a(SYSVAR_CLOCK_PUBKEY, false, false), // clock
      a(SYS, false, false),                 // oracle (any for hyperp mode)
    ],
    data: encodeCloseAccount({ userIdx: 0 }),
  });

  // Instruction 3: ResolveMarket
  const resolveIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, false),      // admin (signer)
      a(SLAB, false, true),                 // slab (writable)
      a(SYSVAR_CLOCK_PUBKEY, false, false), // clock
      a(SYS, false, false),                 // oracle (any for hyperp mode)
    ],
    data: Buffer.from([19]),
  });

  // Instruction 4: WithdrawInsurance
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

  // Instruction 5: CloseSlab (zeros 290KB slab, returns rent + vault to admin)
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

  // Build instruction set
  // NOTE: oracle_authority is ZEROED (hyperp mode) so PushOraclePrice is disabled.
  // CloseAccount requires oracle not stale, so we ResolveMarket first, THEN CloseAccount.
  // After resolution, CloseAccount uses the resolved price (no staleness check).
  const ixs: TransactionInstruction[] = [];

  if (!header.resolved) {
    if (usedIndices.length > 0) {
      // ResolveMarket first so CloseAccount can use resolved price (no staleness check)
      console.log('Including: ResolveMarket, CloseAccount(idx=0), WithdrawInsurance, CloseSlab');
      ixs.push(resolveIx, closeAccountIx, withdrawInsuranceIx, closeSlabIx);
    } else {
      console.log('No LP accounts — Including: ResolveMarket, WithdrawInsurance, CloseSlab');
      ixs.push(resolveIx, withdrawInsuranceIx, closeSlabIx);
    }
  } else {
    console.log('Already resolved — Including: CloseAccount(idx=0), WithdrawInsurance, CloseSlab');
    if (usedIndices.length > 0) ixs.push(closeAccountIx);
    if (engine.insuranceFund.balance > 0n) ixs.push(withdrawInsuranceIx);
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
    const ok = !res.value.err;
    console.log('\nSimulation result:', ok ? 'SUCCESS' : JSON.stringify(res.value.err));
    console.log('CU consumed:', res.value.unitsConsumed);
    if (res.value.logs) {
      const errLogs = res.value.logs.filter(l => l.includes('error') || l.includes('failed') || l.includes('Error') || l.includes('ESa89'));
      if (errLogs.length > 0) console.log('Error logs:\n', errLogs.join('\n'));
      // Print last 20 logs
      console.log('Last 20 logs:\n', res.value.logs.slice(-20).join('\n'));
    }
    return;
  }

  console.log('\nSubmitting close transaction...');
  const sig = await sendAndConfirmTransaction(conn, tx, [admin], {
    commitment: 'confirmed',
    maxRetries: 3,
  });

  console.log('\n=== CLOSE TRANSACTION CONFIRMED ===');
  console.log('Signature:', sig);
  console.log('Explorer:', `https://explorer.solana.com/tx/${sig}`);

  // Final balances
  const adminSolAfter = await conn.getBalance(admin.publicKey);
  const adminUsdcAfter = await conn.getTokenAccountBalance(adminAta).catch(() => null);
  const slabAfter = await conn.getAccountInfo(SLAB);
  const kfAfter = await conn.getAccountInfo(keeperFund);

  console.log('');
  console.log('=== BALANCES AFTER ===');
  console.log('Admin SOL:', (adminSolAfter / 1e9).toFixed(6), `(delta: ${((adminSolAfter - adminSolBefore) / 1e9).toFixed(6)} SOL)`);
  console.log('Admin USDC:', adminUsdcAfter?.value.uiAmount ?? 'no ATA');
  console.log('Slab account:', slabAfter ? `STILL EXISTS (${slabAfter.lamports} lamports)` : 'CLOSED');
  console.log('KeeperFund (derived):', kfAfter ? `still has ${(kfAfter.lamports / 1e9).toFixed(6)} SOL` : 'CLOSED');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
