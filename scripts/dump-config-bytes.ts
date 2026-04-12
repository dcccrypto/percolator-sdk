/**
 * Dump raw bytes of the slab config region (bytes 72-700) with labels.
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

  // oracleAuthority is at byte 328 (from previous analysis)
  // Let's look at bytes 328-500
  console.log('Bytes 316-500:');
  for (let i = 316; i <= 500; i += 8) {
    const slice = Array.from(data.slice(i, i+8)).map(b => b.toString(16).padStart(2,'0')).join(' ');
    const u64 = readU64LE(data, i);
    const i64 = readI64LE(data, i);
    console.log(`  [${i.toString().padStart(3)}]: ${slice} | u64=${u64.toString().padStart(20)} | i64=${i64}`);
  }

  // Known values to find:
  console.log('\nKnown values to find:');
  console.log('  authorityPriceE6 = 106000000 (0x6553600)');
  console.log('  The Unix timestamp we just pushed: ~1775782445 (0x69d84a2d)');

  // Search for 106000000 = 0x6553600
  const target = 106000000n;
  for (let i = 72; i < 700; i += 8) {
    if (readU64LE(data, i) === target) {
      console.log(`\n  Found authorityPriceE6=${target} at byte ${i}`);
      // Show surrounding bytes
      for (let j = i-8; j <= i+32; j += 8) {
        const sl = Array.from(data.slice(j, j+8)).map(b => b.toString(16).padStart(2,'0')).join(' ');
        console.log(`    [${j}]: ${sl} | u64=${readU64LE(data, j)} | i64=${readI64LE(data, j)}`);
      }
    }
  }

  // Search for timestamp ~1775782445 (pushed in previous tx)
  const tsNow = BigInt(Math.floor(Date.now() / 1000));
  for (let i = 72; i < 700; i++) {
    const v = readU64LE(data, i);
    // Check if value is close to current Unix time (within 120 seconds)
    if (v > tsNow - 200n && v <= tsNow) {
      console.log(`\n  Found near-now timestamp at byte ${i}: ${v} (${Number(tsNow - v)}s ago)`);
    }
  }
}

main().catch(console.error);
