import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { encodeSetOracleAuthority, encodePushOraclePrice, encodeResolveMarket } from '../src/abi/instructions.js';
import { buildAccountMetas } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import { parseConfig } from '../src/solana/slab.js';
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
  const errStr = JSON.stringify(res.value.err);
  const logs = res.value.logs?.filter(l => !l.includes('ComputeBudget')) ?? [];
  const lastLogs = logs.slice(-5);
  console.log(`[${label}]: ${ok ? 'SUCCESS' : errStr}`);
  if (!ok) console.log('  Logs:', lastLogs.join(' | '));
  return ok;
}

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const slabData = new Uint8Array(info!.data);
  const config = parseConfig(slabData);
  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const adminAta = getAtaSync(admin.publicKey, USDC);
  const VAULT = config.vaultPubkey;

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

  const prefix = [setAuthIx, pushIx];
  const a = (p: PublicKey, s: boolean, w: boolean) => ({ pubkey: p, isSigner: s, isWritable: w });

  // In-sim: oracle auth is now set to admin, price is set.
  // Try ResolveMarket with admin as the oracle authority account (3rd acct)
  // The program might need oracle_authority as a signer/read to validate the price.

  // 3-account: admin(signer,writable), slab(writable), admin(oracle-auth, not-signer)
  await sim('Resolve 3: admin+slab+adminAsOracleRead', [
    ...prefix,
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true), a(admin.publicKey, false, false)
    ], data: Buffer.from([19]) })
  ]);

  // 3-account with admin not-writable
  await sim('Resolve 3: admin(not-writable)+slab+admin(oracle)', [
    ...prefix,
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, false), a(SLAB, false, true), a(admin.publicKey, false, false)
    ], data: Buffer.from([19]) })
  ]);

  // 4-account: admin, slab, oracle-auth, vault
  await sim('Resolve 4: admin+slab+oracleAuth+vault', [
    ...prefix,
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true), a(admin.publicKey, false, false), a(VAULT, false, true)
    ], data: Buffer.from([19]) })
  ]);

  // What if the slab needs ForceCloseResolved (tag 30) first?
  // ForceCloseResolved closes positions after market is resolved
  // Try CloseSlab directly — maybe admin oracle prevents resolve but CloseSlab can work with resolved?
  // Actually let's try tag 21 (AdminForceClose)
  await sim('AdminForceClose(tag=21) alone', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true)
    ], data: Buffer.from([21]) })
  ]);

  // Try UnresolveMarket (tag 36) to check if slab is in some weird state
  await sim('UnresolveMarket(tag=36) test', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true)
    ], data: Buffer.from([36]) })
  ]);

  // Maybe CloseSlab (tag 13) works after ALL accounts are closed even without resolve?
  // 6-account CloseSlab: admin, slab, vault_ata, vault_pda, admin_ata, token_program
  await sim('CloseSlab 6-accts (no resolve)', [
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true), a(VAULT, false, true),
      a(vaultAuth, false, false), a(adminAta, false, true), a(new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), false, false),
    ], data: Buffer.from([13]) })
  ]);
}

main().catch(console.error);
