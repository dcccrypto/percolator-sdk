/**
 * Final sequence probe: verify each step in isolation.
 * TX1: Push + CloseAccount
 * TX2: Resolve
 * TX3: WithdrawInsurance
 * TX4: CloseSlab
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

async function sim(label: string, ixs: TransactionInstruction[], cuLimit = 400_000): Promise<boolean> {
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }));
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

  const slot = await conn.getSlot('confirmed');
  console.log('Slot:', slot);

  const pushIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(
      [{ name: 'authority', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
      { authority: admin.publicKey, slab: SLAB }
    ),
    data: encodePushOraclePrice({ priceE6: '106000000', timestamp: String(slot) }),
  });

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

  const withdrawInsuranceIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_WITHDRAW_INSURANCE, {
      admin: admin.publicKey, slab: SLAB,
      adminAta, vault: VAULT,
      tokenProgram: TOKEN_PROGRAM_ID, vaultPda: vaultAuth,
    }),
    data: encodeWithdrawInsurance(),
  });

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

  // Simulate TX1: Push + CloseAccount
  console.log('\n--- TX1: Push + CloseAccount ---');
  const tx1ok = await sim('TX1: Push+CloseAccount', [pushIx, closeAccountIx]);

  // Simulate TX2: Resolve
  console.log('\n--- TX2: Resolve (after CloseAccount) ---');
  await sim('TX2: Push+CloseAcct+Resolve', [pushIx, closeAccountIx, resolveIx]);

  // Simulate TX3: WithdrawInsurance (after Resolve)
  console.log('\n--- TX3: WithdrawInsurance (after Resolve) ---');
  await sim('TX3: Push+CloseAcct+Resolve+WithdrawIns', [pushIx, closeAccountIx, resolveIx, withdrawInsuranceIx]);

  // Simulate TX4: CloseSlab (after WithdrawInsurance)
  console.log('\n--- TX4: CloseSlab (after WithdrawInsurance) ---');
  await sim('TX4: Push+CloseAcct+Resolve+WithdrawIns+CloseSlab', [pushIx, closeAccountIx, resolveIx, withdrawInsuranceIx, closeSlabIx], 600_000);

  // Try alternative: after Resolve, RescueOrphanVault instead of WithdrawInsurance
  console.log('\n--- Alternative: Rescue + CloseOrphan (after Resolve) ---');
  await sim('Alt: Push+CloseAcct+Resolve+Rescue+CloseOrphan', [pushIx, closeAccountIx, resolveIx, rescueIx, closeOrphanIx], 600_000);

  // Test TX2 and TX3 in same tx
  console.log('\n--- Combined TX2+TX3: Resolve + WithdrawIns ---');
  await sim('Resolve+WithdrawIns', [pushIx, closeAccountIx, resolveIx, withdrawInsuranceIx]);
}

main().catch(console.error);
