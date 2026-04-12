import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { encodeCloseSlab, encodeWithdrawInsurance } from '../src/abi/instructions.js';
import { ACCOUNTS_CLOSE_SLAB, ACCOUNTS_WITHDRAW_INSURANCE, buildAccountMetas } from '../src/abi/accounts.js';
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
  console.log(`\n[${label}]: ${ok ? 'SUCCESS' : JSON.stringify(res.value.err)}`);
  const filtered = res.value.logs?.filter(l => !l.includes('ComputeBudget')) ?? [];
  console.log('Logs:', filtered.join('\n'));
  return ok;
}

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const slabData = new Uint8Array(info!.data);
  const config = parseConfig(slabData);
  const [vaultAuth] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const [keeperFund] = deriveKeeperFund(PROGRAM_ID, SLAB);
  const adminAta = getAtaSync(admin.publicKey, USDC);
  const VAULT = config.vaultPubkey;

  // Try CloseSlab as-is (no prior resolve) — maybe it works with active accounts?
  const csData = encodeCloseSlab();
  const csKeys = buildAccountMetas(ACCOUNTS_CLOSE_SLAB, { admin: admin.publicKey, slab: SLAB });
  const csIx = buildIx({ programId: PROGRAM_ID, keys: csKeys, data: csData });

  // With no extra accounts
  await sim('CloseSlab(2-accts, no-resolve)', [csIx]);

  // WithdrawInsurance alone
  const wiData = encodeWithdrawInsurance();
  const wiKeys = buildAccountMetas(ACCOUNTS_WITHDRAW_INSURANCE, {
    admin: admin.publicKey, slab: SLAB, adminAta, vault: VAULT,
    tokenProgram: TOKEN_PROGRAM_ID, vaultPda: vaultAuth,
  });
  const wiIx = buildIx({ programId: PROGRAM_ID, keys: wiKeys, data: wiData });
  await sim('WithdrawInsurance alone (no resolve)', [wiIx]);

  // Try CloseSlab with keeperFund as remaining account (3-accts total)
  const csIxWithKF = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      ...csKeys,
      { pubkey: keeperFund, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(csData),
  });
  await sim('CloseSlab(+keeperFund remaining)', [csIxWithKF]);

  // What if we do CloseSlab right after CloseAccount but without resolve?
  // This tells us if CloseSlab requires resolved=true or just all_accounts_closed
}

main().catch(console.error);
