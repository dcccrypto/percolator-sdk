/**
 * Discovery decode benchmark: feeds discoverMarkets() 1,000 synthetic accounts through a mock
 * connection (no network) and prints the median CPU ms per 1,000 accounts over 20 runs.
 *
 *   pnpm exec tsx scripts/bench-discovery.ts
 *   pnpm exec tsx scripts/bench-discovery.ts --dump out.json   # every decoded field, for old-vs-new cmp
 *
 * Fixtures mirror test/discovery-branches.test.ts: legacy-magic slabs at each known tier dataSize
 * (the 1940-byte dataSlice the real scan fetches) with seeded pseudo-random body bytes, plus v17
 * market-group accounts. The mock returns each tier's accounts only for its dataSize filter.
 */
import { writeFileSync } from "node:fs";
import { PublicKey, type Connection } from "@solana/web3.js";
import { discoverMarkets, SLAB_TIERS, SLAB_TIERS_V0, SLAB_TIERS_V1D } from "../src/solana/discovery.js";
import { SLAB_TIERS_V2, SLAB_TIERS_V12_1, SLAB_TIERS_V12_19, SLAB_TIERS_V_ADL } from "../src/solana/slab.js";

const MAGIC = [0x54, 0x41, 0x4c, 0x4f, 0x43, 0x52, 0x45, 0x50];
const V17_MAGIC = [0x00, 0x36, 0x31, 0x56, 0x43, 0x52, 0x45, 0x50];
const SLICE = 1940;
const TOTAL = 1000;
const RUNS = 20;

let seed = 0x1234abcd;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };

const programId = new PublicKey(new Uint8Array(32).fill(7));
function pk(i: number): PublicKey {
  const b = new Uint8Array(32);
  b[0] = i & 0xff; b[1] = (i >> 8) & 0xff; b[2] = 1;
  return new PublicKey(b);
}
function body(len: number): Uint8Array {
  const b = new Uint8Array(len);
  for (let i = 0; i < len; i++) b[i] = rnd() & 0xff;
  return b;
}

const tiers = [
  ...Object.values(SLAB_TIERS), ...Object.values(SLAB_TIERS_V0), ...Object.values(SLAB_TIERS_V1D),
  ...Object.values(SLAB_TIERS_V2), ...Object.values(SLAB_TIERS_V12_1), ...Object.values(SLAB_TIERS_V12_19),
  ...Object.values(SLAB_TIERS_V_ADL),
];
const bySize = new Map<number, { dataSize: number; maxAccounts: number }>();
for (const t of tiers) bySize.set(t.dataSize, t);
const sizes = [...bySize.values()];

const byDataSize = new Map<number, Array<{ pubkey: PublicKey; account: { data: Uint8Array; owner: PublicKey; lamports: number; executable: boolean } }>>();
for (let i = 0; i < TOTAL; i++) {
  const isV17 = i % 10 === 9;
  const t = sizes[i % sizes.length];
  const data = body(SLICE);
  let size: number;
  if (isV17) {
    data.set(V17_MAGIC, 0);
    data[8] = 17 + 0; data[9] = 0; data[10] = 1;
    size = t.dataSize; // reaches the loop via a tier query by coincidence of size
  } else {
    data.set(MAGIC, 0);
    size = t.dataSize;
  }
  const arr = byDataSize.get(size) ?? [];
  arr.push({ pubkey: pk(i), account: { data, owner: programId, lamports: 1, executable: false } });
  byDataSize.set(size, arr);
}

const conn = {
  getProgramAccounts: async (_p: PublicKey, opts: any) => byDataSize.get(opts?.filters?.[0]?.dataSize) ?? [],
  getMultipleAccountsInfo: async () => [],
} as unknown as Connection;

const origWarn = console.warn;
console.warn = () => {};

const replacer = (_k: string, v: unknown) =>
  typeof v === "bigint" ? `${v}n` : v instanceof PublicKey ? v.toBase58() : v;

const first = await discoverMarkets(conn, programId, { maxParallelTiers: 64 });
const times: number[] = [];
for (let r = 0; r < RUNS + 3; r++) {
  const c0 = process.cpuUsage();
  await discoverMarkets(conn, programId, { maxParallelTiers: 64 });
  const c1 = process.cpuUsage(c0);
  const dt = (c1.user + c1.system) / 1000; // CPU ms: stable on a loaded host (wall time is not)
  if (r >= 3) times.push(dt); // 3 warmup runs
}
console.warn = origWarn;
times.sort((a, b) => a - b);
const median = (times[RUNS / 2 - 1] + times[RUNS / 2]) / 2;
console.log(`accounts fed: ${TOTAL}, markets decoded: ${first.length}`);
console.log(`discoverMarkets median ${median.toFixed(2)} CPU ms / 1000 accounts (min ${times[0].toFixed(2)}, max ${times[RUNS - 1].toFixed(2)}, ${RUNS} runs)`);

const di = process.argv.indexOf("--dump");
if (di > 0) writeFileSync(process.argv[di + 1], JSON.stringify(first, replacer));
