/**
 * Probe the full closing sequence using the correct account layouts
 * from the existing mainnet scripts.
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { encodeCloseAccount, encodeResolveMarket, encodeSetOracleAuthority, encodePushOraclePrice } from '../src/abi/instructions.js';
import { ACCOUNTS_CLOSE_ACCOUNT, buildAccountMetas } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import { parseConfig, parseUsedIndices, parseAccount } from '../src/solana/slab.js';
import { deriveVaultAuthority } from '../src/solana/pda.js';
import fs from 'fs';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(HELIUS_RPC, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

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
  console.log(`[${label}]: ${ok ? 'SUCCESS' : JSON.stringify(res.value.err)}`);
  if (!ok) {
    const logs = res.value.logs?.filter(l => !l.includes('ComputeBudget')) ?? [];
    console.log('  Logs:', logs.slice(-4).join(' | '));
  }
  return ok;
}

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const slabData = new Uint8Array(info!.data);
  const config = parseConfig(slabData);
  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const VAULT = config.vaultPubkey;
  const adminAta = await getAssociatedTokenAddress(USDC, admin.publicKey);
  const lpAccount = parseAccount(slabData, 0);
  const lpOwnerAta = await getAssociatedTokenAddress(USDC, lpAccount.owner);

  // Build CloseAccount for LP idx=0
  const closeAcctKeys = buildAccountMetas(ACCOUNTS_CLOSE_ACCOUNT, {
    user: admin.publicKey,
    slab: SLAB,
    vault: VAULT,
    userAta: lpOwnerAta,
    vaultPda: vaultAuth,
    tokenProgram: TOKEN_PROGRAM_ID,
    clock: SYSVAR_CLOCK_PUBKEY,
    oracle: new PublicKey('7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE'),
  });
  const closeAcctIx = buildIx({
    programId: PROGRAM_ID,
    keys: closeAcctKeys,
    data: encodeCloseAccount({ userIdx: 0 }),
  });

  // Build SetOracleAuthority + PushOraclePrice
  const setAuthIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(
      [{ name: 'admin', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
      { admin: admin.publicKey, slab: SLAB }
    ),
    data: encodeSetOracleAuthority({ newAuthority: admin.publicKey }),
  });

  const pushIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(
      [{ name: 'authority', signer: true, writable: true }, { name: 'slab', signer: false, writable: true }],
      { authority: admin.publicKey, slab: SLAB }
    ),
    data: encodePushOraclePrice({ priceE6: '140000000000', timestamp: String(Math.floor(Date.now() / 1000)) }),
  });

  // Build ResolveMarket with admin NOT writable (from existing scripts)
  const resolveIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: false },
      { pubkey: SLAB, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([19]),
  });

  // Build CloseSlab (6 accounts from close-slab-proper.ts)
  const closeSlabIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: SLAB, isSigner: false, isWritable: true },
      { pubkey: VAULT, isSigner: false, isWritable: true },
      { pubkey: vaultAuth, isSigner: false, isWritable: false },
      { pubkey: adminAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([13]),
  });

  // Build RescueOrphanVault (tag 72) from rescue-usdc.ts pattern
  const rescueVaultIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: false },
      { pubkey: SLAB, isSigner: false, isWritable: false },
      { pubkey: adminAta, isSigner: false, isWritable: true },
      { pubkey: VAULT, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: vaultAuth, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([72]),
  });

  // Build CloseOrphanSlab (tag 73)
  const closeOrphanIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: SLAB, isSigner: false, isWritable: true },
      { pubkey: VAULT, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([73]),
  });

  // Test sequences
  console.log('=== Sequence 1: CloseAccount → ResolveMarket ===');
  await sim('CloseAcct(0) alone', [closeAcctIx]);
  await sim('ResolveMarket alone (admin not-writable)', [resolveIx]);
  await sim('SetOracleAuth+Push+Resolve (admin not-writable)', [setAuthIx, pushIx, resolveIx]);

  console.log('\n=== Sequence 2: CloseAccount → RescueVault → CloseOrphan ===');
  // Can we rescue vault without resolving first?
  await sim('RescueOrphanVault (no resolve)', [rescueVaultIx]);
  await sim('CloseAcct → RescueVault', [closeAcctIx, rescueVaultIx]);
  await sim('CloseAcct → RescueVault → CloseOrphanSlab', [closeAcctIx, rescueVaultIx, closeOrphanIx]);

  console.log('\n=== Sequence 3: CloseAccount → Resolve → CloseSlab ===');
  await sim('CloseAcct → SetAuth+Push+Resolve → CloseSlab', [closeAcctIx, setAuthIx, pushIx, resolveIx, closeSlabIx]);

  console.log('\n=== Sequence 4: CloseAccount → Resolve → RescueVault → CloseOrphan ===');
  await sim('CloseAcct → SetAuth+Push+Resolve', [closeAcctIx, setAuthIx, pushIx, resolveIx]);
}

main().catch(console.error);
