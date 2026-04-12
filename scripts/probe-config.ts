import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { parseConfig, parseHeader, detectSlabLayout } from '../src/solana/slab.js';
import fs from 'fs';

const conn = new Connection(process.env.RPC_URL!, 'confirmed');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const data = new Uint8Array(info!.data);

  const layout = detectSlabLayout(data.length, data);
  console.log('Layout version:', layout?.version);
  console.log('configOffset:', layout?.configOffset);
  console.log('configLen:', layout?.configLen);

  // Parse raw bytes around the config to find oracle_authority field
  // Config starts at configOff:
  // [0..32]  collateralMint
  // [32..64] vaultPubkey
  // [64..96] indexFeedId (Pyth feed id bytes, not a pubkey)
  // [96..104] maxStalenessSlots (u64)
  // [104..106] confFilterBps (u16)
  // [106]    vaultAuthorityBump (u8)
  // [107]    invert (u8)
  // [108..112] unitScale (u32)
  // Then risk params, then oracle_authority somewhere...

  const configOff = layout!.configOffset;

  // Print raw bytes in hex chunks from config for manual inspection
  const slice = data.slice(configOff, configOff + 200);
  for (let i = 0; i < 200; i += 32) {
    const chunk = slice.slice(i, i + 32);
    const hex = Buffer.from(chunk).toString('hex');
    const asKey = new PublicKey(chunk).toBase58();
    console.log(`config+${i}: ${hex}`);
    if (asKey !== '11111111111111111111111111111111' && chunk.some(b => b !== 0)) {
      console.log(`  -> pubkey: ${asKey}`);
    }
  }

  // Look for the oracle_authority field (should be a pubkey somewhere in config)
  // Try to find admin pubkey in config (which might indicate oracle_authority = admin)
  const ADMIN = '7JVQvrAfzj3aasLxCkoLYX5KQcrb5nEZhUe5Qa8PvV5G';
  const adminPk = new PublicKey(ADMIN);
  const adminBytes = adminPk.toBytes();

  for (let i = configOff; i < configOff + layout!.configLen - 32; i++) {
    let match = true;
    for (let j = 0; j < 32; j++) {
      if (data[i+j] !== adminBytes[j]) { match = false; break; }
    }
    if (match) {
      console.log(`Found admin pubkey at config offset ${i - configOff} (abs ${i})`);
    }
  }
}

main().catch(console.error);
