import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { parseConfig, parseHeader, detectSlabLayout } from '../src/solana/slab.js';

const conn = new Connection(process.env.RPC_URL!, 'confirmed');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const data = new Uint8Array(info!.data);

  const layout = detectSlabLayout(data.length, data);
  const configOff = layout!.configOffset;
  const configLen = layout!.configLen;

  // Dump all pubkey-shaped chunks in the config
  console.log(`Config: off=${configOff}, len=${configLen}`);
  const known: Record<string, string> = {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC_MINT',
    '25VncbGiso7EABgaW2D8Vgh1dQFdCTNTgPcAg9cddaTe': 'VAULT',
    '11111111111111111111111111111111': 'ZERO/SYSTEM',
    '7JVQvrAfzj3aasLxCkoLYX5KQcrb5nEZhUe5Qa8PvV5G': 'ADMIN',
    'H9mrkCHp85GDZ12m8akNiKnqx8tiXPhFeCmyaYH73DZk': 'VAULT_AUTHORITY',
    '7X6KTJ3c2S8yBtXnk57gJqf22nyuU8oy9pi1tXdi4A6H': 'KEEPER_FUND',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'TOKEN_PROGRAM',
    'SysvarC1ock11111111111111111111111111111111': 'CLOCK',
  };

  // Print EVERY 32-byte aligned chunk in config as a pubkey
  for (let off = 0; off < configLen; off += 4) {
    if (off + 32 > configLen) break;
    const chunk = data.slice(configOff + off, configOff + off + 32);
    if (chunk.every(b => b === 0)) continue; // skip zeros
    if (chunk.filter(b => b === 0).length > 28) continue; // mostly zeros
    const pk = new PublicKey(chunk).toBase58();
    const label = known[pk] ?? '';
    console.log(`  config+${off}: ${pk} ${label ? '(' + label + ')' : ''}`);
  }

  // Also look at configOff+96+ for specific fields
  // V1 Config layout (from SDK source):
  // 0-32:   collateralMint
  // 32-64:  vaultPubkey
  // 64-96:  indexFeedId (bytes, used as Pyth feed ID, not a pubkey per se)
  // 96-104: maxStalenessSlots u64
  // 104-106: confFilterBps u16
  // 106:    vaultAuthorityBump u8
  // 107:    invert u8
  // 108-112: unitScale u32
  // 112-...: fundingHorizonSlots, fundingKBps, ... (risk params embedded in config for V1?)
  // Eventually there should be an oracle_authority pubkey field

  // Let's search for any pubkey in the config that matches a known program or key
  console.log('\nFull config dump by 32-byte chunks:');
  for (let off = 0; off < configLen - 32; off += 32) {
    const chunk = data.slice(configOff + off, configOff + off + 32);
    const pk = new PublicKey(chunk).toBase58();
    const label = known[pk] ?? '';
    console.log(`  config+${off}: ${pk} ${label}`);
  }
}

main().catch(console.error);
