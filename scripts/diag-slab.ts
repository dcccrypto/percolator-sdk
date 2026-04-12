import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { parseEngine, parseHeader } from '../src/solana/slab.js';

async function main() {
  const conn = new Connection('https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa', 'confirmed');
  const SLAB = new PublicKey('F8BbnGhUV14Chr5NtGMhM9cGMCANrtsQwBmGN96S8PV8');
  const info = await conn.getAccountInfo(SLAB);
  if (!info) throw new Error('Slab not found');
  const data = new Uint8Array(info.data);
  const header = parseHeader(data);
  const engine = parseEngine(data);
  console.log('header.admin:', header.admin.toBase58());
  console.log('oracleAuthority:', engine.oracleAuthority?.toBase58() ?? 'undefined');
  console.log('authorityPriceE6:', engine.authorityPriceE6?.toString() ?? 'undefined');
  console.log('authorityTimestamp:', engine.authorityTimestamp?.toString() ?? 'undefined');
}

main().catch(e => { console.error(e); process.exit(1); });
