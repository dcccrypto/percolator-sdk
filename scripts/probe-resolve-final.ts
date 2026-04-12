/**
 * Probe ResolveMarket with correct account layout:
 * accounts[0]: admin (signer, writable)
 * accounts[1]: slab (writable)
 * accounts[2]: SYSVAR_CLOCK (clock sysvar)
 * accounts[3]: oracle account (any, not read for hyperp mode)
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { encodePushOraclePrice, encodeCloseAccount, encodeCloseSlab, encodeWithdrawInsurance } from '../src/abi/instructions.js';
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
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

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

  // Push oracle instruction (keeps authorityPriceE6 fresh)
  const slot = await conn.getSlot('confirmed');
  const pushIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(
      [{ name: 'authority', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
      { authority: admin.publicKey, slab: SLAB }
    ),
    data: encodePushOraclePrice({ priceE6: '106000000', timestamp: String(slot) }),
  });

  // CloseAccount instruction
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
      a(SYS, false, false), // oracle = any
    ],
    data: encodeCloseAccount({ userIdx: 0 }),
  });

  // ResolveMarket with CORRECT account layout for hyperp mode:
  // [0] admin, [1] slab, [2] clock sysvar, [3] oracle (any for hyperp)
  const resolveIxCorrect = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, false),  // admin (signer)
      a(SLAB, false, true),             // slab (writable)
      a(SYSVAR_CLOCK_PUBKEY, false, false), // clock (accounts[2])
      a(SYS, false, false),             // oracle (accounts[3], any for hyperp)
    ],
    data: Buffer.from([19]),
  });

  const resolveIxCorrectWrit = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true),   // admin (signer, writable)
      a(SLAB, false, true),             // slab (writable)
      a(SYSVAR_CLOCK_PUBKEY, false, false),
      a(SYS, false, false),
    ],
    data: Buffer.from([19]),
  });

  // CloseSlab (6-accounts)
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

  // WithdrawInsurance
  const withdrawInsuranceIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_WITHDRAW_INSURANCE, {
      admin: admin.publicKey, slab: SLAB,
      adminAta, vault: VAULT,
      tokenProgram: TOKEN_PROGRAM_ID, vaultPda: vaultAuth,
    }),
    data: encodeWithdrawInsurance(),
  });

  // RescueOrphanVault (tag 72)
  const rescueIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, false), a(SLAB, false, false),
      a(adminAta, false, true), a(VAULT, false, true),
      a(TOKEN_PROGRAM_ID, false, false), a(vaultAuth, false, false),
    ],
    data: Buffer.from([72]),
  });

  // CloseOrphanSlab (tag 73)
  const closeOrphanIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true), a(VAULT, false, false),
    ],
    data: Buffer.from([73]),
  });

  console.log('--- Test: Resolve with CLOCK as accounts[2] ---');
  // Without CloseAccount first (just resolve directly)
  await sim('Resolve alone (clock+sys)', [resolveIxCorrect]);
  await sim('Push+Resolve alone (clock+sys)', [pushIx, resolveIxCorrect]);

  console.log('\n--- After CloseAccount ---');
  await sim('Push+CloseAcct+Resolve(clock+sys, not-writable)', [pushIx, closeAccountIx, resolveIxCorrect]);
  await sim('Push+CloseAcct+Resolve(clock+sys, writable)', [pushIx, closeAccountIx, resolveIxCorrectWrit]);

  console.log('\n--- After Resolve: CloseSlab ---');
  await sim('Push+CloseAcct+Resolve+CloseSlab6', [pushIx, closeAccountIx, resolveIxCorrectWrit, closeSlabIx]);
  await sim('Push+CloseAcct+Resolve+WithdrawIns+CloseSlab6', [pushIx, closeAccountIx, resolveIxCorrectWrit, withdrawInsuranceIx, closeSlabIx]);

  console.log('\n--- After Resolve: RescueOrphanVault + CloseOrphanSlab ---');
  await sim('Push+CloseAcct+Resolve+Rescue72+CloseOrphan73', [pushIx, closeAccountIx, resolveIxCorrectWrit, rescueIx, closeOrphanIx]);
}

main().catch(console.error);
