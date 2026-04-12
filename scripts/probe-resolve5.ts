import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { encodeSetOracleAuthority, encodePushOraclePrice, encodeResolveMarket } from '../src/abi/instructions.js';
import { ACCOUNTS_SET_ORACLE_AUTHORITY, ACCOUNTS_PUSH_ORACLE_PRICE, buildAccountMetas } from '../src/abi/accounts.js';
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
  const errStr = JSON.stringify(res.value.err);
  const filtered = res.value.logs?.filter(l => !l.includes('ComputeBudget')) ?? [];
  // Only print the last program invocation logs
  const lastProgramLogs = filtered.filter(l => l.includes('ESa89R'));
  console.log(`[${label}]: ${ok ? 'SUCCESS' : errStr} | units: ${res.value.unitsConsumed}`);
  if (!ok) console.log('  Logs:', lastProgramLogs.join(' | '));
  return ok;
}

async function tryResolve(label: string, prependIxs: TransactionInstruction[], resolveKeys: Array<{pubkey: PublicKey; isSigner: boolean; isWritable: boolean}>) {
  const resolveIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: resolveKeys,
    data: Buffer.from(encodeResolveMarket()),
  });
  return sim(label, [...prependIxs, resolveIx]);
}

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const slabData = new Uint8Array(info!.data);
  const config = parseConfig(slabData);
  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const [keeperFund] = deriveKeeperFund(PROGRAM_ID, SLAB);
  const adminAta = getAtaSync(admin.publicKey, USDC);
  const VAULT = config.vaultPubkey;

  const setAuthData = encodeSetOracleAuthority({ newAuthority: admin.publicKey });
  const setAuthKeys = buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, { admin: admin.publicKey, slab: SLAB });
  const setAuthIx = buildIx({ programId: PROGRAM_ID, keys: setAuthKeys, data: setAuthData });

  const pushData = encodePushOraclePrice({ priceE6: '140000000000', timestamp: String(Math.floor(Date.now() / 1000)) });
  const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, { authority: admin.publicKey, slab: SLAB });
  const pushIx = buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData });

  const prefix = [setAuthIx, pushIx];
  const base = { pubkey: admin.publicKey, isSigner: true, isWritable: true };
  const slabMeta = { pubkey: SLAB, isSigner: false, isWritable: true };
  const vaultMeta = { pubkey: VAULT, isSigner: false, isWritable: true };
  const vaultAuthMeta = { pubkey: vaultAuth, isSigner: false, isWritable: false };
  const tpMeta = { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false };
  const adminAtaMeta = { pubkey: adminAta, isSigner: false, isWritable: true };
  const kfMeta = { pubkey: keeperFund, isSigner: false, isWritable: true };

  // 4-account variations
  await tryResolve('4: admin+slab+vault+tokenProg', prefix, [base, slabMeta, vaultMeta, tpMeta]);
  await tryResolve('4: admin+slab+adminAta+tokenProg', prefix, [base, slabMeta, adminAtaMeta, tpMeta]);
  await tryResolve('5: admin+slab+vault+tokenProg+vaultAuth', prefix, [base, slabMeta, vaultMeta, tpMeta, vaultAuthMeta]);
  await tryResolve('5: admin+slab+adminAta+vault+vaultAuth', prefix, [base, slabMeta, adminAtaMeta, vaultMeta, vaultAuthMeta]);
  await tryResolve('6: admin+slab+adminAta+vault+tokenProg+vaultAuth', prefix, [base, slabMeta, adminAtaMeta, vaultMeta, tpMeta, vaultAuthMeta]);
  await tryResolve('7: admin+slab+adminAta+vault+tokenProg+vaultAuth+kf', prefix, [base, slabMeta, adminAtaMeta, vaultMeta, tpMeta, vaultAuthMeta, kfMeta]);
}

main().catch(console.error);
