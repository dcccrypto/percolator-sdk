import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { encodeCloseSlab } from '../src/abi/instructions.js';
import { ACCOUNTS_CLOSE_SLAB, buildAccountMetas } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import { parseConfig } from '../src/solana/slab.js';
import { deriveVaultAuthority, deriveKeeperFund } from '../src/solana/pda.js';
import { getAtaSync } from '../src/solana/ata.js';
import fs from 'fs';

const conn = new Connection(process.env.RPC_URL!, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

async function sim(label: string, keys: Array<{pubkey: PublicKey; isSigner: boolean; isWritable: boolean}>): Promise<{err: string|null; units: number}> {
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: Buffer.from(encodeCloseSlab()),
  });
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
  tx.add(ix);
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  tx.sign(admin);
  const res = await conn.simulateTransaction(tx, [admin]);
  const ok = !res.value.err;
  const errStr = JSON.stringify(res.value.err);
  console.log(`[${label}(${keys.length} accts)]: ${ok ? 'SUCCESS' : errStr}`);
  if (ok) {
    const filtered = res.value.logs?.filter(l => !l.includes('ComputeBudget')) ?? [];
    console.log('  Logs:', filtered.join(' | '));
  }
  return { err: errStr, units: res.value.unitsConsumed ?? 0 };
}

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const slabData = new Uint8Array(info!.data);
  const config = parseConfig(slabData);
  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const [keeperFund] = deriveKeeperFund(PROGRAM_ID, SLAB);
  const adminAta = getAtaSync(admin.publicKey, USDC);
  const VAULT = config.vaultPubkey;

  const base = { pubkey: admin.publicKey, isSigner: true, isWritable: true };
  const slabMeta = { pubkey: SLAB, isSigner: false, isWritable: true };
  const vaultMeta = { pubkey: VAULT, isSigner: false, isWritable: true };
  const vaultAuthMeta = { pubkey: vaultAuth, isSigner: false, isWritable: false };
  const tpMeta = { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false };
  const adminAtaMeta = { pubkey: adminAta, isSigner: false, isWritable: true };
  const kfMeta = { pubkey: keeperFund, isSigner: false, isWritable: true };
  const sysMeta = { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false };

  // Find how many accounts needed to transition from NotEnoughAccountKeys to something else
  await sim('admin+slab', [base, slabMeta]);
  await sim('admin+slab+vault', [base, slabMeta, vaultMeta]);
  await sim('admin+slab+adminAta', [base, slabMeta, adminAtaMeta]);
  await sim('admin+slab+vault+tp', [base, slabMeta, vaultMeta, tpMeta]);
  await sim('admin+slab+vault+tp+vaultAuth', [base, slabMeta, vaultMeta, tpMeta, vaultAuthMeta]);
  await sim('admin+slab+adminAta+vault+tp+vaultAuth', [base, slabMeta, adminAtaMeta, vaultMeta, tpMeta, vaultAuthMeta]);
  await sim('admin+slab+adminAta+vault+tp+vaultAuth+kf', [base, slabMeta, adminAtaMeta, vaultMeta, tpMeta, vaultAuthMeta, kfMeta]);
  await sim('admin+slab+adminAta+vault+tp+vaultAuth+kf+sys', [base, slabMeta, adminAtaMeta, vaultMeta, tpMeta, vaultAuthMeta, kfMeta, sysMeta]);
}

main().catch(console.error);
