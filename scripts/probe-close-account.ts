/**
 * Probe CloseAccount with various oracle account options.
 * The slab has indexFeedId=zeros (SystemProgram) and oracleAuthority=admin with authorityPriceE6 set.
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { encodeCloseAccount } from '../src/abi/instructions.js';
import { ACCOUNTS_CLOSE_ACCOUNT, buildAccountMetas } from '../src/abi/accounts.js';
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
// Standard Pyth SOL/USD push oracle
const PYTH_SOL_USD = new PublicKey('7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE');
// SystemProgram
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
  const lastLogs = logs.filter(l => l.includes('ESa89') || l.includes('log:') || l.includes('error') || l.includes('Custom')).slice(-5);
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

  const closeData = encodeCloseAccount({ userIdx: 0 });

  // Standard 8-account CloseAccount with Pyth SOL/USD oracle
  await sim('CloseAccount(pyth-sol-usd oracle)', [
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        a(admin.publicKey, true, true),   // user (signer, writable)
        a(SLAB, false, true),             // slab (writable)
        a(VAULT, false, true),            // vault (writable)
        a(adminAta, false, true),         // userAta (writable)
        a(vaultAuth, false, false),       // vaultPda (readonly)
        a(TOKEN_PROGRAM_ID, false, false),// tokenProgram
        a(SYSVAR_CLOCK_PUBKEY, false, false), // clock
        a(PYTH_SOL_USD, false, false),    // oracle (Pyth SOL/USD)
      ],
      data: closeData,
    })
  ]);

  // CloseAccount with admin as oracle (since oracleAuthority=admin)
  await sim('CloseAccount(admin as oracle)', [
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        a(admin.publicKey, true, true),
        a(SLAB, false, true),
        a(VAULT, false, true),
        a(adminAta, false, true),
        a(vaultAuth, false, false),
        a(TOKEN_PROGRAM_ID, false, false),
        a(SYSVAR_CLOCK_PUBKEY, false, false),
        a(admin.publicKey, false, false), // oracle = admin
      ],
      data: closeData,
    })
  ]);

  // CloseAccount with SystemProgram as oracle (since indexFeedId=zeros)
  await sim('CloseAccount(system as oracle)', [
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        a(admin.publicKey, true, true),
        a(SLAB, false, true),
        a(VAULT, false, true),
        a(adminAta, false, true),
        a(vaultAuth, false, false),
        a(TOKEN_PROGRAM_ID, false, false),
        a(SYSVAR_CLOCK_PUBKEY, false, false),
        a(SYS, false, false), // oracle = SystemProgram
      ],
      data: closeData,
    })
  ]);

  // CloseAccount with SLAB itself as oracle (unusual but worth trying)
  await sim('CloseAccount(slab as oracle)', [
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        a(admin.publicKey, true, true),
        a(SLAB, false, true),
        a(VAULT, false, true),
        a(adminAta, false, true),
        a(vaultAuth, false, false),
        a(TOKEN_PROGRAM_ID, false, false),
        a(SYSVAR_CLOCK_PUBKEY, false, false),
        a(SLAB, false, false), // oracle = SLAB itself
      ],
      data: closeData,
    })
  ]);

  // Maybe oracle is not needed (7-account variant)
  await sim('CloseAccount(7-acct no oracle)', [
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        a(admin.publicKey, true, true),
        a(SLAB, false, true),
        a(VAULT, false, true),
        a(adminAta, false, true),
        a(vaultAuth, false, false),
        a(TOKEN_PROGRAM_ID, false, false),
        a(SYSVAR_CLOCK_PUBKEY, false, false),
      ],
      data: closeData,
    })
  ]);

  // 6-account (no clock, no oracle)
  await sim('CloseAccount(6-acct no clock no oracle)', [
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        a(admin.publicKey, true, true),
        a(SLAB, false, true),
        a(VAULT, false, true),
        a(adminAta, false, true),
        a(vaultAuth, false, false),
        a(TOKEN_PROGRAM_ID, false, false),
      ],
      data: closeData,
    })
  ]);

  // Maybe ResolveMarket can work FIRST (with authorityPriceE6 set on-chain)
  // even though LP is still active? Try various resolve account combos:
  // The issue might be the program checks cTot == 0 before resolve.
  // But let's also try: maybe the AdminForceClose (tag 21) or ForceSettle (other tag) works
  await sim('AdminForceClose(tag 21) 2-accts', [
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        a(admin.publicKey, true, true),
        a(SLAB, false, true),
      ],
      data: Buffer.from([21]),
    })
  ]);

  // Tag 22
  await sim('tag22 2-accts', [
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [a(admin.publicKey, true, true), a(SLAB, false, true)],
      data: Buffer.from([22]),
    })
  ]);

  // Tag 23
  await sim('tag23 2-accts', [
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [a(admin.publicKey, true, true), a(SLAB, false, true)],
      data: Buffer.from([23]),
    })
  ]);
}

main().catch(console.error);
