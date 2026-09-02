import { requireRpcUrl } from "./config.mjs";
import { Connection, PublicKey } from '@solana/web3.js';
import { parseConfig, parseHeader } from '../dist/index.js';

const conn = new Connection(requireRpcUrl(), 'confirmed');
const SLAB = new PublicKey('H7CVBttJmyAiae3bsKSCz8DbrPtKwMhs4NeFmQ9okhpz');
const info = await conn.getAccountInfo(SLAB);
const data = new Uint8Array(info.data);
const header = parseHeader(data);
const config = parseConfig(data);

console.log('header.paused:        ', header.paused);
console.log('header.slabLen:       ', data.length);
console.log('config.collateralMint:', config.collateralMint?.toBase58());
console.log('config.indexFeedId:   ', config.indexFeedId?.toBase58?.() ?? config.indexFeedId);
console.log('config.oracleAuth:    ', config.oracleAuthority?.toBase58());
console.log('config.dexPool:       ', config.dexPool?.toBase58() ?? '(undefined)');
console.log('config.lastEffectivePriceE6:', config.lastEffectivePriceE6?.toString());
console.log('config.authorityPriceE6:    ', config.authorityPriceE6?.toString());
console.log('config.authorityTimestamp:  ', config.authorityTimestamp?.toString());
console.log('config.maxStalenessSecs:    ', config.maxStalenessSecs?.toString());
console.log('config.invert:        ', config.invert);
console.log('config keys:          ', Object.keys(config).filter(k => /slot|mark|hyperp/i.test(k)));
for (const k of Object.keys(config)) {
  if (/slot|mark|hyperp/i.test(k)) {
    console.log(`  ${k} =`, typeof config[k] === 'bigint' ? config[k].toString() : config[k]);
  }
}
const slot = await conn.getSlot('confirmed');
console.log('current_slot:         ', slot);
