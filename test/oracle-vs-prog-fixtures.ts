// Shared byte builders for the oracle-vs-prog draft tests (layouts: percolator-prog rc23 4a5065f5, src/v16_program.rs:12434-12463).
export const NOW = 1_700_000_000;
export const FEED = new Uint8Array(32).fill(7);
const PYTH_DISC = [0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd];
const CL_DISC = [96, 179, 69, 66, 128, 129, 73, 117];
export const SB_DISC = [196, 27, 108, 196, 10, 215, 219, 40];

/** Pyth PriceUpdateV2: disc[8] .. verification_level@40, borsh PriceFeedMessage@41 (feed_id, price i64, conf u64, exponent i32, publish_time i64). */
export function pythBytes(o: { price: bigint; conf?: bigint; expo: number; age?: number; verif?: number; disc?: boolean }): Uint8Array {
  const b = new Uint8Array(134); const v = new DataView(b.buffer);
  if (o.disc !== false) PYTH_DISC.forEach((x, i) => (b[i] = x));
  b[40] = o.verif ?? 1; b.set(FEED, 41);
  v.setBigInt64(73, o.price, true); v.setBigUint64(81, o.conf ?? 0n, true); v.setInt32(89, o.expo, true);
  v.setBigInt64(93, BigInt(NOW - (o.age ?? 0)), true);
  return b;
}

/** Chainlink Transmissions: disc, version@8, decimals@138, latest_round_id@143, live_length@148, slot@200, ts u32@208, answer i128@216. */
export function clBytes(o: { answer: bigint; decimals: number; age?: number; ts?: number; version?: number; round?: number; live?: number; slot?: bigint; disc?: boolean }): Uint8Array {
  const b = new Uint8Array(248); const v = new DataView(b.buffer);
  if (o.disc !== false) CL_DISC.forEach((x, i) => (b[i] = x));
  b[8] = o.version ?? 1; b[138] = o.decimals; v.setUint32(143, o.round ?? 5, true); v.setUint32(148, o.live ?? 1, true);
  v.setBigUint64(200, o.slot ?? 123n, true); v.setUint32(208, o.ts ?? NOW - (o.age ?? 0), true);
  v.setBigUint64(216, o.answer & ((1n << 64n) - 1n), true); v.setBigInt64(224, o.answer >> 64n, true);
  return b;
}

/** Switchboard On-Demand PullFeed (3208 B): offsets src/v16_program.rs:12443-12451. */
export function sbBytes(o: { value: bigint; std?: bigint; age?: number }): Uint8Array {
  const b = new Uint8Array(3208); const v = new DataView(b.buffer);
  SB_DISC.forEach((x, i) => (b[i] = x)); b.fill(9, 8 + 2112, 8 + 2144);
  b[8 + 2207] = 1; b[8 + 2352] = 1; b[8 + 2353] = 0; v.setBigUint64(8 + 2360, 99n, true); v.setBigInt64(8 + 2208, BigInt(NOW), true);
  const w = (off: number, x: bigint) => { v.setBigUint64(off, x & ((1n << 64n) - 1n), true); v.setBigInt64(off + 8, x >> 64n, true); };
  w(8 + 2256, o.value); w(8 + 2272, o.std ?? 0n); v.setBigInt64(8 + 2944, BigInt(NOW - (o.age ?? 0)), true);
  return b;
}
