/**
 * Probe ResolveMarket after oracle authority and price are set on-chain.
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { parseConfig, parseEngine } from '../src/solana/slab.js';
import { deriveVaultAuthority } from '../src/solana/pda.js';
import { getAtaSync } from '../src/solana/ata.js';
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
  const lastLogs = logs.filter(l => l.includes('ESa89') || l.includes('log:')).slice(-4);
  console.log(`[${label}]: ${ok ? 'SUCCESS' : JSON.stringify(res.value.err)} | CU: ${res.value.unitsConsumed}`);
  if (!ok) console.log('  Logs:', lastLogs.join(' | '));
  return ok;
}

async function main() {
  // Check actual on-chain slab state now
  const info = await conn.getAccountInfo(SLAB);
  const slabData = new Uint8Array(info!.data);
  const config = parseConfig(slabData);
  const engine = parseEngine(slabData);
  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const VAULT = config.vaultPubkey;
  const adminAta = getAtaSync(admin.publicKey, USDC);

  console.log('On-chain slab state after oracle push:');
  console.log('  vault:', engine.vault.toString());
  console.log('  insuranceFund.balance:', engine.insuranceFund.balance.toString());

  const a = (p: PublicKey, s: boolean, w: boolean) => ({ pubkey: p, isSigner: s, isWritable: w });

  // Now ResolveMarket WITHOUT the sim prefix (oracle is set on-chain)
  await sim('ResolveMarket 2-accts (admin not-writable)', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, false), a(SLAB, false, true),
    ], data: Buffer.from([19]) })
  ]);

  await sim('ResolveMarket 2-accts (admin writable)', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
    ], data: Buffer.from([19]) })
  ]);

  await sim('ResolveMarket 3-accts: admin+slab+adminOracle', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false),
    ], data: Buffer.from([19]) })
  ]);

  await sim('ResolveMarket 4-accts: admin+slab+adminOracle+sys', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false),
      a(new PublicKey('11111111111111111111111111111111'), false, false),
    ], data: Buffer.from([19]) })
  ]);

  await sim('ResolveMarket 4-accts: admin+slab+adminOracle+vault', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false), a(VAULT, false, true),
    ], data: Buffer.from([19]) })
  ]);

  await sim('ResolveMarket 4-accts: admin+slab+adminOracle+adminAta', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false), a(adminAta, false, true),
    ], data: Buffer.from([19]) })
  ]);

  // Try 5 accounts with vault and token program
  await sim('ResolveMarket 5: admin+slab+oracle+vault+tp', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false), a(VAULT, false, true),
      a(TOKEN_PROGRAM_ID, false, false),
    ], data: Buffer.from([19]) })
  ]);

  // Try 6 accounts: full withdraw-insurance-like layout
  await sim('ResolveMarket 6: admin+slab+oracle+adminAta+vault+tp+vaultAuth', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false), a(adminAta, false, true),
      a(VAULT, false, true), a(TOKEN_PROGRAM_ID, false, false),
    ], data: Buffer.from([19]) })
  ]);

  await sim('ResolveMarket 7: admin+slab+oracle+adminAta+vault+tp+vaultAuth', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false), a(adminAta, false, true),
      a(VAULT, false, true), a(TOKEN_PROGRAM_ID, false, false), a(vaultAuth, false, false),
    ], data: Buffer.from([19]) })
  ]);
}

main().catch(console.error);
