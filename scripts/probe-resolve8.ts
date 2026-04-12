import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { encodeSetOracleAuthority, encodePushOraclePrice, encodeCloseAccount } from '../src/abi/instructions.js';
import { ACCOUNTS_CLOSE_ACCOUNT, buildAccountMetas } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import { parseConfig, parseAccount } from '../src/solana/slab.js';
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
  const lpAccount = parseAccount(slabData, 0);
  const lpOwnerAta = await getAssociatedTokenAddress(USDC, lpAccount.owner);

  const a = (p: PublicKey, s: boolean, w: boolean) => ({ pubkey: p, isSigner: s, isWritable: w });

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

  const closeAcctIx = buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_CLOSE_ACCOUNT, {
      user: admin.publicKey, slab: SLAB, vault: VAULT,
      userAta: lpOwnerAta, vaultPda: vaultAuth,
      tokenProgram: TOKEN_PROGRAM_ID, clock: SYSVAR_CLOCK_PUBKEY,
      oracle: new PublicKey('7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE'),
    }),
    data: encodeCloseAccount({ userIdx: 0 }),
  });

  // After CloseAccount, try Resolve with the in-sim state where LP is closed
  // This tests: does Resolve work when all accounts are zero?
  console.log('Testing: CloseAccount → SetAuth → Push → Resolve (4 accounts)');

  const resolveIx4 = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false),
      a(new PublicKey('11111111111111111111111111111111'), false, false),
    ],
    data: Buffer.from([19]),
  });

  await sim('CloseAcct+SetAuth+Push+Resolve4', [closeAcctIx, setAuthIx, pushIx, resolveIx4]);

  // Try resolve after close with just 2 accounts (admin writable=false from existing scripts)
  const resolveIx2 = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, false), a(SLAB, false, true),
    ],
    data: Buffer.from([19]),
  });

  await sim('CloseAcct+SetAuth+Push+Resolve2(not-writable)', [closeAcctIx, setAuthIx, pushIx, resolveIx2]);

  // Try with admin writable=true 2 accounts
  const resolveIx2w = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
    ],
    data: Buffer.from([19]),
  });

  await sim('CloseAcct+SetAuth+Push+Resolve2(writable)', [closeAcctIx, setAuthIx, pushIx, resolveIx2w]);

  // Try: maybe RescueOrphanVault works after CloseAccount (LP closed but market not resolved)
  const rescueIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      a(admin.publicKey, true, false), a(SLAB, false, false),
      a(lpOwnerAta, false, true), a(VAULT, false, true),
      a(TOKEN_PROGRAM_ID, false, false), a(vaultAuth, false, false),
    ],
    data: Buffer.from([72]),
  });

  await sim('CloseAcct+RescueOrphanVault(no resolve)', [closeAcctIx, rescueIx]);

  // Maybe after SetAuth+Push, 2-account resolve works even without CloseAccount?
  await sim('SetAuth+Push+Resolve2(not-writable)', [setAuthIx, pushIx, resolveIx2]);
  await sim('SetAuth+Push+Resolve2(writable)', [setAuthIx, pushIx, resolveIx2w]);
}

main().catch(console.error);
