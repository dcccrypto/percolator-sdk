// Run: node --expose-gc --import tsx bench/dex-oracle.bench.ts [N=200000] [runs=5]
// DEX spot-price readers (src/solana/dex-oracle.ts). Each case cycles 1024 seeded
// valid buffers; reports median ops/s and median p50/p95 ns per call over `runs`
// runs (latency = hrtime per block of 100 calls / 100).
//
// meteora-dlmm price (hot):  binStep 1..400, all cached after warm-up.
// meteora-dlmm price (cold): binStep 1..10_000 over 1024 pools cycled in order,
//   more than the 512-entry squares cache, so every call rebuilds its table.
import { PublicKey } from "@solana/web3.js";
import { computeDexSpotPriceE6, parseDexPool, WSOL_MINT, type DexType } from "../src/solana/dex-oracle.js";

const N = Number(process.argv[2] ?? 200_000);
const RUNS = Number(process.argv[3] ?? 5);
const POOL = 1024;
const BLOCK = 100;

let s = 0x9e3779b9;
const u32 = () => {
  s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
  return s;
};
const int = (lo: number, hi: number) => lo + (u32() % (hi - lo + 1));
const fill = (b: Uint8Array) => { for (let i = 0; i < b.length; i++) b[i] = u32() & 0xff; };

interface Case {
  pool: Uint8Array;
  vault?: { base: Uint8Array; quote: Uint8Array };
  decimals?: { base: number; quote: number };
  sol?: bigint;
}

function token(amount: bigint): Uint8Array {
  const b = new Uint8Array(165);
  fill(b);
  new DataView(b.buffer).setBigUint64(64, amount, true);
  return b;
}

function pumpswap(): Case {
  const pool = new Uint8Array(301);
  fill(pool);
  if (int(0, 9) < 8) pool.set(WSOL_MINT.toBytes(), 75); // ~80% WSOL-quoted, like pump.fun
  return {
    pool,
    vault: { base: token(BigInt(int(1_000_000, 2 ** 31)) * 1000n), quote: token(BigInt(int(1_000_000_000, 2 ** 31))) },
    decimals: { base: int(0, 9), quote: int(0, 9) },
    sol: BigInt(int(50_000_000, 400_000_000)),
  };
}

function raydium(): Case {
  const pool = new Uint8Array(1544);
  fill(pool);
  pool[233] = int(0, 18);
  pool[234] = int(0, 18);
  const bits = int(40, 100);
  const sqrt = (1n << BigInt(bits - 1)) | (BigInt(u32()) << BigInt(Math.max(0, bits - 33)));
  const dv = new DataView(pool.buffer);
  dv.setBigUint64(253, sqrt & 0xffff_ffff_ffff_ffffn, true);
  dv.setBigUint64(261, sqrt >> 64n, true);
  return { pool };
}

function meteora(maxStep: number): Case {
  const pool = new Uint8Array(904);
  fill(pool);
  const step = int(1, maxStep);
  const maxId = Math.min(500_000, Math.floor(30 / Math.log10(1 + step / 10_000)));
  const dv = new DataView(pool.buffer);
  dv.setUint16(73, step, true);
  dv.setUint16(80, step, true);
  dv.setInt32(76, int(-maxId, maxId), true);
  return { pool, decimals: { base: int(0, 12), quote: int(0, 12) } };
}

function cases(kind: DexType, make: () => Case): Case[] {
  const out: Case[] = [];
  while (out.length < POOL) {
    const c = make();
    try {
      computeDexSpotPriceE6(kind, c.pool, c.vault, c.decimals, c.sol);
      out.push(c);
    } catch {
      // invalid draw (e.g. price below 1e-6): redraw
    }
  }
  return out;
}

const ADDR = new PublicKey(new Uint8Array(32).fill(1));
let sink = 0;
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

function bench(name: string, cs: Case[], f: (c: Case) => void) {
  for (let i = 0; i < 50_000; i++) f(cs[i % POOL]);
  const ops: number[] = [], p50: number[] = [], p95: number[] = [];
  for (let r = 0; r < RUNS; r++) {
    (globalThis as { gc?: () => void }).gc?.();
    const lat = new Array<number>(N / BLOCK);
    let k = 0;
    const t0 = process.hrtime.bigint();
    for (let b = 0; b < N / BLOCK; b++) {
      const t = process.hrtime.bigint();
      for (let j = 0; j < BLOCK; j++) f(cs[k++ % POOL]);
      lat[b] = Number(process.hrtime.bigint() - t) / BLOCK;
    }
    ops.push(N / (Number(process.hrtime.bigint() - t0) / 1e9));
    lat.sort((x, y) => x - y);
    p50.push(lat[Math.floor(lat.length * 0.5)]);
    p95.push(lat[Math.floor(lat.length * 0.95)]);
  }
  console.log(
    `${name.padEnd(30)} ${Math.round(med(ops)).toLocaleString().padStart(11)} ops/s  p50 ${med(p50).toFixed(0)} ns  p95 ${med(p95).toFixed(0)} ns`,
  );
}

const price = (kind: DexType) => (c: Case) => {
  sink += Number(computeDexSpotPriceE6(kind, c.pool, c.vault, c.decimals, c.sol) & 1n);
};
const parse = (kind: DexType) => (c: Case) => {
  sink += parseDexPool(kind, ADDR, c.pool).quoteMint ? 1 : 0;
};

const ps = cases("pumpswap", pumpswap);
const rc = cases("raydium-clmm", raydium);
const mHot = cases("meteora-dlmm", () => meteora(400));
const mCold = cases("meteora-dlmm", () => meteora(10_000));

console.log(`dex-oracle bench: ${N.toLocaleString()} calls x ${RUNS} runs, medians`);
bench("pumpswap parse", ps, parse("pumpswap"));
bench("pumpswap price", ps, price("pumpswap"));
bench("raydium-clmm parse", rc, parse("raydium-clmm"));
bench("raydium-clmm price", rc, price("raydium-clmm"));
bench("meteora-dlmm parse", mHot, parse("meteora-dlmm"));
bench("meteora-dlmm price (hot)", mHot, price("meteora-dlmm"));
bench("meteora-dlmm price (cold)", mCold, price("meteora-dlmm"));
if (sink === -1) console.log(sink);
