import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { encodeResolveMarket } from '../src/abi/instructions.js';
import { parseConfig } from '../src/solana/slab.js';
import { deriveVaultAuthority, deriveKeeperFund } from '../src/solana/pda.js';
import { getAtaSync } from '../src/solana/ata.js';
import fs from 'fs';

const conn = new Connection(process.env.RPC_URL!, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

async function tryResolve(label: string, keys: Array<{pubkey: PublicKey; isSigner: boolean; isWritable: boolean}>) {
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: Buffer.from(encodeResolveMarket()),
  });
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  tx.add(ix);
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  tx.sign(admin);
  const res = await conn.simulateTransaction(tx, [admin]);
  console.log(`\n[${label}] err:`, JSON.stringify(res.value.err));
  const filtered = res.value.logs?.filter(l => !l.includes('ComputeBudget')) ?? [];
  console.log('Logs:', filtered.join('\n'));
  return !res.value.err;
}

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const slabData = new Uint8Array(info!.data);
  const config = parseConfig(slabData);
  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const [keeperFund] = deriveKeeperFund(PROGRAM_ID, SLAB);
  const adminAta = getAtaSync(admin.publicKey, USDC);

  const VAULT = config.vaultPubkey;
  const TP = TOKEN_PROGRAM_ID;
  const SYS = new PublicKey('11111111111111111111111111111111');
  const PYTH = new PublicKey('7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE');

  // Try 4+ accounts with vault etc (maybe deployed ResolveMarket includes WithdrawInsurance-like accounts)
  await tryResolve('4-accts: admin+slab+adminAta+vault', [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: SLAB, isSigner: false, isWritable: true },
    { pubkey: adminAta, isSigner: false, isWritable: true },
    { pubkey: VAULT, isSigner: false, isWritable: true },
  ]);

  await tryResolve('6-accts: admin+slab+adminAta+vault+tokenProg+vaultPda', [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: SLAB, isSigner: false, isWritable: true },
    { pubkey: adminAta, isSigner: false, isWritable: true },
    { pubkey: VAULT, isSigner: false, isWritable: true },
    { pubkey: TP, isSigner: false, isWritable: false },
    { pubkey: vaultAuth, isSigner: false, isWritable: false },
  ]);

  // Maybe the on-chain program combines ResolveMarket with WithdrawInsurance
  // Try ACCOUNTS_WITHDRAW_INSURANCE layout: admin, slab, adminAta, vault, tokenProgram, vaultPda
  // with resolve tag
  await tryResolve('5-accts: admin+slab+adminAta+vault+tokenProg', [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: SLAB, isSigner: false, isWritable: true },
    { pubkey: adminAta, isSigner: false, isWritable: true },
    { pubkey: VAULT, isSigner: false, isWritable: true },
    { pubkey: TP, isSigner: false, isWritable: false },
  ]);

  // Try with keeper fund too
  await tryResolve('7-accts: admin+slab+adminAta+vault+tokenProg+vaultPda+keeperFund', [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: SLAB, isSigner: false, isWritable: true },
    { pubkey: adminAta, isSigner: false, isWritable: true },
    { pubkey: VAULT, isSigner: false, isWritable: true },
    { pubkey: TP, isSigner: false, isWritable: false },
    { pubkey: vaultAuth, isSigner: false, isWritable: false },
    { pubkey: keeperFund, isSigner: false, isWritable: true },
  ]);
}

main().catch(console.error);
