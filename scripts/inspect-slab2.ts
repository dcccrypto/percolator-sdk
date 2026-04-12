import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { parseConfig, parseEngine } from '../src/solana/slab.js';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=ecfc91c7-b704-4c37-b10e-a277392830aa';
const conn = new Connection(HELIUS_RPC, 'confirmed');
const SLAB = new PublicKey('FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC');

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  const data = new Uint8Array(info!.data);
  const config = parseConfig(data);
  const engine = parseEngine(data);

  const cfgAny = config as any;
  console.log('maxStalenessSlots:', cfgAny.maxStalenessSlots?.toString?.());
  console.log('confFilterBps:', cfgAny.confFilterBps?.toString?.());
  console.log('oracleAuthority:', cfgAny.oracleAuthority?.toBase58?.());
  console.log('authorityPriceE6:', cfgAny.authorityPriceE6?.toString?.());
  console.log('authorityTimestamp:', cfgAny.authorityTimestamp?.toString?.());
  console.log('lastEffectivePriceE6:', cfgAny.lastEffectivePriceE6?.toString?.());
  console.log('oraclePriceCapE2bps:', cfgAny.oraclePriceCapE2bps?.toString?.());
  console.log('indexFeedId (raw):', cfgAny.indexFeedId?.toBase58?.() ?? cfgAny.indexFeedId);
  console.log('invert:', cfgAny.invert);
  console.log('unitScale:', cfgAny.unitScale?.toString?.());

  // Current slot
  const slot = await conn.getSlot();
  console.log('\nCurrent slot:', slot);
  console.log('If authorityTimestamp is a slot, staleness check: slot - authorityTimestamp =', slot - Number(cfgAny.authorityTimestamp));

  // Engine state
  console.log('\nnumUsedAccounts:', engine.numUsedAccounts);
  console.log('cTot:', engine.cTot?.toString());
  console.log('vault:', engine.vault?.toString());
}

main().catch(console.error);
