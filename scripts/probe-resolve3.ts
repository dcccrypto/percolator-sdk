import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { encodeResolveMarket, encodePushOraclePrice } from '../src/abi/instructions.js';
import { parseConfig, parseHeader, parseEngine } from '../src/solana/slab.js';
import { deriveVaultAuthority, deriveKeeperFund } from '../src/solana/pda.js';
import { getAtaSync } from '../src/solana/ata.js';
import fs from 'fs';

const conn = new Connection(process.env.RPC_URL!, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

async function tryIx(label: string, data: Uint8Array, keys: Array<{pubkey: PublicKey; isSigner: boolean; isWritable: boolean}>) {
  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data: Buffer.from(data) });
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  tx.add(ix);
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  tx.sign(admin);
  const res = await conn.simulateTransaction(tx, [admin]);
  const ok = !res.value.err;
  console.log(`\n[${label}] err:`, JSON.stringify(res.value.err), ok ? 'SUCCESS' : '');
  const filtered = res.value.logs?.filter(l => !l.includes('ComputeBudget')) ?? [];
  if (!ok || true) console.log('Logs:', filtered.join('\n'));
  return ok;
}

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const slabData = new Uint8Array(info!.data);
  const config = parseConfig(slabData);
  const header = parseHeader(slabData);
  const engine = parseEngine(slabData);
  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const [keeperFund] = deriveKeeperFund(PROGRAM_ID, SLAB);
  const adminAta = getAtaSync(admin.publicKey, USDC);

  console.log('header.resolved:', header.resolved);
  console.log('engine.vault:', engine.vault.toString());
  console.log('engine.insuranceFund.balance:', engine.insuranceFund.balance.toString());

  const VAULT = config.vaultPubkey;
  const TP = TOKEN_PROGRAM_ID;

  // The "InvalidArgument" likely means the oracle authority check — the deployed program
  // may require the oracle authority account (which is the admin itself when set to admin)
  // or requires authority_price_e6 to be set first via PushOraclePrice

  // Try: admin, slab, oracle/authority, adminAta (4 accts)
  const PYTH = new PublicKey('7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE');

  await tryIx('4-accts: admin+slab+oracleAuth+adminAta', encodeResolveMarket(), [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: SLAB, isSigner: false, isWritable: true },
    { pubkey: admin.publicKey, isSigner: true, isWritable: false }, // oracle authority = admin
    { pubkey: adminAta, isSigner: false, isWritable: true },
  ]);

  // Try: admin, slab, oracleAuth (admin), vault
  await tryIx('4-accts: admin+slab+adminAsOracle+vault', encodeResolveMarket(), [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: SLAB, isSigner: false, isWritable: true },
    { pubkey: admin.publicKey, isSigner: true, isWritable: false },
    { pubkey: VAULT, isSigner: false, isWritable: false },
  ]);

  // WithdrawInsurance is tag 20. Try tag 20 with 6-acct layout and see if it passes resolve too
  // Look at the "authority_price_e6" field - maybe resolve checks that price is set on the slab.
  // The error "InvalidArgument" on resolve might mean the oracle price hasn't been pushed.
  // Let's try PushOraclePrice first (tag 17): [authority(signer,writable), slab(writable)]
  const pushData = encodePushOraclePrice({ priceE6: '150000000000', timestamp: String(Math.floor(Date.now() / 1000)) });
  const pushOk = await tryIx('PushOraclePrice(admin-as-authority)', pushData, [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: SLAB, isSigner: false, isWritable: true },
  ]);

  if (pushOk) {
    // Now retry resolve
    await tryIx('ResolveMarket after push (2 accts)', encodeResolveMarket(), [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: SLAB, isSigner: false, isWritable: true },
    ]);
  }

  // Try CloseStaleSlabs (tag 51) with just admin + slab
  const { encodeU8 } = await import('../src/abi/encode.js');
  const closeStaleData = new Uint8Array([51]); // CloseStaleSlabs tag
  await tryIx('CloseStaleSlabs(tag=51): admin+slab', closeStaleData, [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: SLAB, isSigner: false, isWritable: true },
  ]);
}

main().catch(console.error);
