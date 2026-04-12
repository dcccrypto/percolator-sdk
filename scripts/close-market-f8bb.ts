/**
 * close-market-f8bb.ts
 *
 * Closes the mainnet market slab F8BbnGhUV14Chr5NtGMhM9cGMCANrtsQwBmGN96S8PV8
 * and reclaims all SOL + vault USDC.
 *
 * Flow:
 *   1. PushOraclePrice  — keep authority_price_e6 fresh (hyperp mode)
 *   2. CloseAccount(0)  — close the 1 active LP account (idx 0)
 *   3. ResolveMarket    — mark market resolved
 *   4. WithdrawInsurance — drain 10 USDC insurance fund
 *   5. CloseSlab        — zero 290KB slab, recover rent + vault USDC
 *
 * Slab header admin is at offset 16 (not 12) — confirmed in parseHeader.
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
import {
  encodePushOraclePrice,
  encodeCloseAccount,
  encodeWithdrawInsurance,
  encodeCloseSlab,
} from '../src/abi/instructions.js';
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
const SLAB = new PublicKey('F8BbnGhUV14Chr5NtGMhM9cGMCANrtsQwBmGN96S8PV8');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SYS = new PublicKey('11111111111111111111111111111111');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

async function main() {
  const SIMULATE = process.argv.includes('--simulate');

  const slabInfo = await conn.getAccountInfo(SLAB);
  if (!slabInfo) throw new Error('Slab not found on-chain');
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

  const slot = await conn.getSlot('confirmed');
  console.log('Slot for oracle push:', slot);

  const a = (p: PublicKey, s: boolean, w: boolean) => ({ pubkey: p, isSigner: s, isWritable: w });

  // Ix1: PushOraclePrice — keeps authority_price_e6 fresh for hyperp mode
  const pushIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(
      [{ name: 'authority', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
      { authority: admin.publicKey, slab: SLAB }
    ),
    data: encodePushOraclePrice({ priceE6: '84000000', timestamp: String(slot) }),
  });

  // Ix2: CloseAccount (LP idx=0, admin is LP owner)
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

  // Ix3: ResolveMarket — [admin(signer), slab(w), clock, oracle(any)]
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

  // Ix4: WithdrawInsurance — drain insurance fund
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

  // Ix5: CloseSlab — zeros 290KB, transfers rent + remaining USDC to admin
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

  // Select which instructions to include based on current slab state
  const ixs: TransactionInstruction[] = [];

  // Note: PushOraclePrice requires oracle_authority to match; in Hyperp mode
  // with zeroed oracle_authority it will fail with EngineUnauthorized.
  // ResolveMarket and CloseAccount in hyperp mode do not check oracle staleness.

  if (!header.resolved) {
    if (usedIndices.includes(0)) {
      console.log('Including: CloseAccount(idx=0), ResolveMarket, WithdrawInsurance, CloseSlab');
      ixs.push(closeAccountIx, resolveIx, withdrawInsuranceIx, closeSlabIx);
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
      const errLogs = res.value.logs
        ?.filter(l => l.includes('error') || l.includes('failed') || l.includes('ESa89'))
        .slice(-15) ?? [];
      console.log('Error logs:\n', errLogs.join('\n'));
    } else {
      console.log('Last logs:', res.value.logs?.slice(-5).join('\n'));
    }
    return;
  }

  console.log('\nSubmitting transaction...');
  const sig = await sendAndConfirmTransaction(conn, tx, [admin], {
    commitment: 'confirmed',
    maxRetries: 3,
  });
  console.log('\nTransaction confirmed!');
  console.log('Signature:', sig);
  console.log('Explorer:', `https://explorer.solana.com/tx/${sig}`);
  console.log('Solscan:', `https://solscan.io/tx/${sig}`);

  const adminSolAfter = await conn.getBalance(admin.publicKey);
  const adminUsdcAfter = await conn.getTokenAccountBalance(adminAta).catch(() => null);
  const slabAfter = await conn.getAccountInfo(SLAB);
  const kfAfter = await conn.getAccountInfo(keeperFund);

  console.log('\n--- Final Balances ---');
  console.log('Admin SOL:', (adminSolAfter / 1e9).toFixed(6), `(delta ${((adminSolAfter - adminSolBefore) / 1e9).toFixed(6)} SOL)`);
  console.log('Admin USDC:', adminUsdcAfter?.value.uiAmount ?? 0);
  console.log('Slab account:', slabAfter ? `STILL EXISTS (${slabAfter.lamports} lamports)` : 'CLOSED (expected)');
  console.log('KeeperFund:', kfAfter ? `still has ${(kfAfter.lamports / 1e9).toFixed(6)} SOL` : 'CLOSED');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
