/**
 * Probe: Push oracle → CloseAccount → ResolveMarket (various variants)
 * After CloseAccount, cTot=0, numUsed=0. Does ResolveMarket succeed then?
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { encodePushOraclePrice, encodeCloseAccount, encodeWithdrawInsurance, encodeCloseSlab } from '../src/abi/instructions.js';
import { buildAccountMetas, ACCOUNTS_WITHDRAW_INSURANCE } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import { parseConfig } from '../src/solana/slab.js';
import { deriveVaultAuthority } from '../src/solana/pda.js';
import fs from 'fs';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(HELIUS_RPC, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SYS = new PublicKey('11111111111111111111111111111111');

async function sim(label: string, ixs: TransactionInstruction[]): Promise<boolean> {
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
  for (const ix of ixs) tx.add(ix);
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  tx.sign(admin);
  const res = await conn.simulateTransaction(tx, [admin]);
  const ok = !res.value.err;
  const logs = res.value.logs?.filter(l => !l.includes('ComputeBudget')) ?? [];
  const lastLogs = logs.filter(l => l.includes('ESa89') || l.includes('log:') || l.includes('error')).slice(-5);
  console.log(`[${label}]: ${ok ? 'SUCCESS' : JSON.stringify(res.value.err)} | CU: ${res.value.unitsConsumed}`);
  if (!ok) console.log('  Logs:', lastLogs.join(' | '));
  return ok;
}

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const slabData = new Uint8Array(info!.data);
  const config = parseConfig(slabData);
  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const VAULT = config.vaultPubkey;
  const adminAta = await getAssociatedTokenAddress(USDC, admin.publicKey);

  const a = (p: PublicKey, s: boolean, w: boolean) => ({ pubkey: p, isSigner: s, isWritable: w });

  // Get fresh slot for oracle timestamp
  const slot = await conn.getSlot('confirmed');
  console.log('Current slot:', slot);

  // Push oracle instruction (keeps oracle fresh during simulation)
  const pushIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(
      [{ name: 'authority', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
      { authority: admin.publicKey, slab: SLAB }
    ),
    data: encodePushOraclePrice({ priceE6: '106000000', timestamp: String(slot) }),
  });

  // CloseAccount instruction (LP idx 0, admin is the LP owner)
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
      a(SYS, false, false), // oracle = SystemProgram (any works)
    ],
    data: encodeCloseAccount({ userIdx: 0 }),
  });

  // ResolveMarket variants to try after CloseAccount:
  const resolveIx2 = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [a(admin.publicKey, true, false), a(SLAB, false, true)],
    data: Buffer.from([19]),
  });

  const resolveIx2w = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [a(admin.publicKey, true, true), a(SLAB, false, true)],
    data: Buffer.from([19]),
  });

  const resolveIx3 = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [a(admin.publicKey, true, true), a(SLAB, false, true), a(admin.publicKey, false, false)],
    data: Buffer.from([19]),
  });

  const resolveIx4sys = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [a(admin.publicKey, true, true), a(SLAB, false, true), a(admin.publicKey, false, false), a(SYS, false, false)],
    data: Buffer.from([19]),
  });

  const resolveIx4vault = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [a(admin.publicKey, true, true), a(SLAB, false, true), a(admin.publicKey, false, false), a(VAULT, false, true)],
    data: Buffer.from([19]),
  });

  // CloseSlab variants (after CloseAccount, with or without Resolve)
  const closeSlabIx6 = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true), a(VAULT, false, true),
      a(vaultAuth, false, false), a(adminAta, false, true),
      a(new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), false, false),
    ],
    data: encodeCloseSlab(),
  });

  const closeSlabIx2 = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [a(admin.publicKey, true, true), a(SLAB, false, true)],
    data: encodeCloseSlab(),
  });

  // WithdrawInsurance instruction
  const withdrawInsuranceIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_WITHDRAW_INSURANCE, {
      admin: admin.publicKey, slab: SLAB,
      adminAta, vault: VAULT,
      tokenProgram: TOKEN_PROGRAM_ID, vaultPda: vaultAuth,
    }),
    data: encodeWithdrawInsurance(),
  });

  // Test sequences:
  console.log('\n--- After CloseAccount, try ResolveMarket ---');
  await sim('Push+CloseAcct+Resolve2(not-writable)', [pushIx, closeAccountIx, resolveIx2]);
  await sim('Push+CloseAcct+Resolve2(writable)', [pushIx, closeAccountIx, resolveIx2w]);
  await sim('Push+CloseAcct+Resolve3', [pushIx, closeAccountIx, resolveIx3]);
  await sim('Push+CloseAcct+Resolve4(sys)', [pushIx, closeAccountIx, resolveIx4sys]);
  await sim('Push+CloseAcct+Resolve4(vault)', [pushIx, closeAccountIx, resolveIx4vault]);

  console.log('\n--- After CloseAccount, try CloseSlab directly (skip Resolve) ---');
  await sim('Push+CloseAcct+CloseSlab6', [pushIx, closeAccountIx, closeSlabIx6]);
  await sim('Push+CloseAcct+CloseSlab2', [pushIx, closeAccountIx, closeSlabIx2]);

  console.log('\n--- Full sequence: Push+CloseAcct+WithdrawIns+Resolve+CloseSlab ---');
  await sim('Push+CloseAcct+WithdrawIns+Resolve2w+CloseSlab6', [pushIx, closeAccountIx, withdrawInsuranceIx, resolveIx2w, closeSlabIx6]);
  await sim('Push+CloseAcct+WithdrawIns+Resolve2w+CloseSlab2', [pushIx, closeAccountIx, withdrawInsuranceIx, resolveIx2w, closeSlabIx2]);

  // RescueOrphanVault and CloseOrphanSlab (tags 72, 73) - alternate path without Resolve
  const rescueIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, false), a(SLAB, false, false),
      a(adminAta, false, true), a(VAULT, false, true),
      a(TOKEN_PROGRAM_ID, false, false), a(vaultAuth, false, false),
    ],
    data: Buffer.from([72]),
  });

  const closeOrphanIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true), a(VAULT, false, false),
    ],
    data: Buffer.from([73]),
  });

  console.log('\n--- Rescue/Orphan path (no Resolve) ---');
  await sim('Push+CloseAcct+RescueVault72', [pushIx, closeAccountIx, rescueIx]);
  await sim('Push+CloseAcct+RescueVault72+CloseOrphan73', [pushIx, closeAccountIx, rescueIx, closeOrphanIx]);
}

main().catch(console.error);
