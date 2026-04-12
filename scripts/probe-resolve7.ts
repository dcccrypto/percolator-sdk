import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { encodeSetOracleAuthority, encodePushOraclePrice } from '../src/abi/instructions.js';
import { buildAccountMetas } from '../src/abi/accounts.js';
import { buildIx } from '../src/runtime/tx.js';
import { deriveVaultAuthority } from '../src/solana/pda.js';
import { derivePythPushOraclePDA } from '../src/solana/pda.js';
import fs from 'fs';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(HELIUS_RPC, 'confirmed');
const admin = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync('/Users/khubair/.percolator-mainnet/keys/deploy-authority.json', 'utf8'))));
const PROGRAM_ID = new PublicKey('ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');

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
  const lastLogs = logs.filter(l => l.includes('ESa89') || l.includes('Program log')).slice(-5);
  console.log(`[${label}]: ${ok ? 'SUCCESS' : errStr}`);
  if (!ok) console.log('  Logs:', lastLogs.join(' | '));
  return ok;
}

async function main() {
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

  // The deployed program for ResolveMarket with authority_price_e6 set:
  // accounts[0] = admin (signer, writable)
  // accounts[1] = slab (writable)
  // accounts[2] = oracle_authority (the one who set the price — must be admin)
  // accounts[3] = ???
  //
  // InvalidArgument at accounts[3] means the program validates accounts[3]
  // The program may be checking: accounts[3].key == config.index_feed_pyth_pda
  // With indexFeedId=zeros, the Pyth PDA derived from zero feed = ?

  // Zero feed ID Pyth PDA
  const zeroFeedId = '0'.repeat(64);
  let pythZeroPda: PublicKey;
  try {
    const [pda] = derivePythPushOraclePDA(zeroFeedId);
    pythZeroPda = pda;
    console.log('Pyth zero feed PDA:', pythZeroPda.toBase58());
  } catch {
    pythZeroPda = PublicKey.default;
  }

  // Try 4 accounts with zero-feed Pyth PDA
  await sim('Resolve 4: admin+slab+adminAsOracle+pythZeroPDA', [
    ...prefix,
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false), a(pythZeroPda, false, false)
    ], data: Buffer.from([19]) })
  ]);

  // Try with SystemProgram as 4th acct (zero key)
  await sim('Resolve 4: admin+slab+adminOracle+systemProg', [
    ...prefix,
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false), a(new PublicKey('11111111111111111111111111111111'), false, false)
    ], data: Buffer.from([19]) })
  ]);

  // Try just 4 with admin twice (since oracle authority = admin)
  await sim('Resolve 4: admin+slab+adminOracle+adminAgain', [
    ...prefix,
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false), a(admin.publicKey, false, false)
    ], data: Buffer.from([19]) })
  ]);

  // Try 5 accounts
  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  await sim('Resolve 5: admin+slab+adminOracle+sys+vaultAuth', [
    ...prefix,
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false),
      a(new PublicKey('11111111111111111111111111111111'), false, false),
      a(vaultAuth, false, false),
    ], data: Buffer.from([19]) })
  ]);

  // ALTERNATIVE: Maybe oracle authority acts as both accounts[0] and accounts[2]?
  // And accounts[3] is the slab's own Pyth oracle PDA?
  // Try with admin signed as oracle_authority as 3rd account writable/signer
  await sim('Resolve 4: admin+slab+adminOracle(signer)+sys', [
    ...prefix,
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, true, false), // oracle authority as signer
      a(new PublicKey('11111111111111111111111111111111'), false, false),
    ], data: Buffer.from([19]) })
  ]);

  // Maybe the program tries to CPI to the oracle program with accounts[3]?
  // Try Pyth program as accounts[3]
  const PYTH_PROGRAM = new PublicKey('pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT');
  await sim('Resolve 4: admin+slab+adminOracle+pythProgram', [
    ...prefix,
    new TransactionInstruction({ programId: PROGRAM_ID, keys: [
      a(admin.publicKey, true, true), a(SLAB, false, true),
      a(admin.publicKey, false, false), a(PYTH_PROGRAM, false, false),
    ], data: Buffer.from([19]) })
  ]);
}

main().catch(console.error);
