/**
 * Dump raw bytes around the oracle authority fields in the slab config.
 * oracleAuthority is at offset 320 (from our inspection).
 * authorityPriceE6 should be at 352 (32 bytes pubkey + 8 bytes price).
 * authorityTimestamp should be at 360.
 */
import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { parseConfig } from '../src/solana/slab.js';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(HELIUS_RPC, 'confirmed');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');

function readU64LE(data: Uint8Array, off: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset + off, 8);
  return view.getBigUint64(0, true);
}

function readI64LE(data: Uint8Array, off: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset + off, 8);
  return view.getBigInt64(0, true);
}

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const data = new Uint8Array(info!.data);

  // Search for the admin pubkey bytes in the config region
  // Admin: 7JVQvrAfzj3aasLxCkoLYX5KQcrb5nEZhUe5Qa8PvV5G
  // First byte of admin key from raw dump: 5d a1 1f 1a 4c 0c 42 e1...
  const adminFirstBytes = [0x5d, 0xa1, 0x1f, 0x1a];

  let oracleAuthOff = -1;
  for (let i = 0; i < data.length - 32; i++) {
    if (data[i] === adminFirstBytes[0] && data[i+1] === adminFirstBytes[1] &&
        data[i+2] === adminFirstBytes[2] && data[i+3] === adminFirstBytes[3]) {
      oracleAuthOff = i;
      console.log(`Found admin pubkey at byte ${i}`);
    }
  }

  if (oracleAuthOff === -1) {
    console.log('Admin pubkey not found!');
    return;
  }

  // The last occurrence should be the oracleAuthority field
  // Dump bytes around it
  console.log(`\nBytes around oracleAuthority (at ${oracleAuthOff}):`);
  for (let i = oracleAuthOff - 16; i <= oracleAuthOff + 80; i += 8) {
    const slice = Array.from(data.slice(i, i+8)).map(b => b.toString(16).padStart(2,'0')).join(' ');
    const u64 = readU64LE(data, i);
    const i64 = readI64LE(data, i);
    console.log(`  [${i}]: ${slice} | u64=${u64} | i64=${i64}`);
  }

  // SDK-parsed values
  const config = parseConfig(data) as any;
  console.log('\nSDK parsed:');
  console.log('  oracleAuthority:', config.oracleAuthority?.toBase58?.());
  console.log('  authorityPriceE6:', config.authorityPriceE6?.toString?.());
  console.log('  authorityTimestamp:', config.authorityTimestamp?.toString?.());

  // Try reading at oracleAuthOff + 32 (price) and + 40 (timestamp)
  const priceAtExpected = readU64LE(data, oracleAuthOff + 32);
  const tsAtExpected = readI64LE(data, oracleAuthOff + 40);
  console.log(`\nManual read at oracleAuthOff+32: ${priceAtExpected} (expected ~106000000)`);
  console.log(`Manual read at oracleAuthOff+40: ${tsAtExpected} (expected unix timestamp ~1775782445)`);

  // Check if the Unix timestamp we pushed is visible anywhere in the config region
  const targetTs = 1775782445n;
  console.log(`\nSearching for timestamp ${targetTs} (0x${targetTs.toString(16)}) in bytes 72-700...`);
  for (let i = 72; i < Math.min(700, data.length - 8); i++) {
    const v = readU64LE(data, i);
    if (v === targetTs || v === BigInt(Math.floor(Date.now() / 1000) - 60)) {
      console.log(`  Found near-match at byte ${i}: ${v}`);
    }
  }
}

main().catch(console.error);
