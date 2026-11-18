/**
 * Bench for src/abi/v22-state.ts decoders: N synthetic valid records per decoder, median of 5 runs.
 * Run: npx tsx scripts/bench-v22-state.ts [N=20000]
 */
import { ACCOUNT_KIND, LAYOUT_V22, WRAPPER_ACCOUNT_MAGIC } from "../src/abi/layout.js";
// Same-process A/B: "old" is the pre-optimisation copy (test/helpers/v22-state-legacy.ts), "new" is src.
const oldM = await import("../test/helpers/v22-state-legacy.js");
const newM = await import("../src/abi/v22-state.js");

function rnd32(seed: number): Uint8Array {
  const o = new Uint8Array(32);
  let s = (seed + 1) >>> 0;
  for (let i = 0; i < 32; i++) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    o[i] = (s >>> 8) & 0xff;
  }
  o[0] |= 1;
  return o;
}
function mk(kind: number, len: number): { buf: Uint8Array; dv: DataView } {
  const buf = new Uint8Array(len);
  const dv = new DataView(buf.buffer);
  dv.setBigUint64(0, WRAPPER_ACCOUNT_MAGIC, true);
  dv.setUint16(8, LAYOUT_V22.version, true);
  buf[10] = kind;
  return { buf, dv };
}
export function validTranche(i: number): Uint8Array {
  const { buf, dv } = mk(ACCOUNT_KIND.BondTranche, 192);
  buf.set(rnd32(i), 16);
  dv.setBigUint64(16 + 32, 1000n + BigInt(i), true);
  dv.setBigUint64(16 + 48, 1000n, true);
  dv.setUint16(16 + 104, 100, true);
  dv.setUint32(16 + 108, 10_000, true);
  dv.setUint16(16 + 112, 100, true);
  buf[16 + 114] = 2;
  return buf;
}
export function validPosition(i: number): Uint8Array {
  const { buf, dv } = mk(ACCOUNT_KIND.BondPosition, 112);
  buf.set(rnd32(i), 16);
  dv.setBigUint64(16 + 32, 500n, true);
  buf[16 + 72] = 1;
  return buf;
}
export function validInsurance(i: number): Uint8Array {
  const { buf, dv } = mk(ACCOUNT_KIND.InsuranceUnits, 208);
  buf.set(rnd32(i), 16);
  dv.setBigUint64(16 + 32, 30n, true);
  dv.setBigUint64(16 + 48, 10n, true);
  dv.setBigUint64(16 + 64, 20n, true);
  buf[16 + 136] = 1;
  return buf;
}
export function validRedemption(i: number, ext: boolean): Uint8Array {
  const { buf } = mk(ACCOUNT_KIND.LpRedemption, ext ? 128 : 112);
  buf.set(rnd32(i), 16);
  buf.set(rnd32(i + 7), 48);
  buf[16 + 88] = 1;
  return buf;
}
export function validAllowlist(i: number, n = 16): Uint8Array {
  const { buf } = mk(ACCOUNT_KIND.G9FeedAllowlist, 16 + 2064);
  const b = 16;
  buf[b] = n; buf[b + 1] = 1; buf[b + 3] = n;
  for (let s = 0; s < 4; s++) for (let k = 0; k < n; k++) buf.set(rnd32(i * 100 + s * 16 + k), b + 16 + 32 * (s * 16 + k));
  return buf;
}

const N = Number(process.argv[2] ?? 20000);
const POOL = 256;
const ROUNDS = 5;
type Fn = (b: Uint8Array) => unknown;
const med = (t: number[]) => [...t].sort((x, y) => x - y)[Math.floor(t.length / 2)];
function time(fn: Fn, bufs: Uint8Array[], n: number): number {
  const s = performance.now();
  for (let i = 0; i < n; i++) fn(bufs[i % POOL]);
  return performance.now() - s;
}
function bench(name: string, bufs: Uint8Array[], fo: Fn, fn: Fn, n: number): void {
  time(fo, bufs, 1500); time(fn, bufs, 1500);
  const to: number[] = [], tn: number[] = [];
  for (let r = 0; r < ROUNDS; r++) { to.push(time(fo, bufs, n)); tn.push(time(fn, bufs, n)); } // alternate to cancel machine drift
  const mo = med(to), mn = med(tn);
  console.log(`${name.padEnd(20)} old ${mo.toFixed(1).padStart(8)} ms  new ${mn.toFixed(1).padStart(8)} ms  / ${n}   ${(mo / mn).toFixed(2)}x   (${((mo * 1000) / n).toFixed(2)} -> ${((mn * 1000) / n).toFixed(2)} us/rec)`);
}
const mkPool = (f: (i: number) => Uint8Array) => Array.from({ length: POOL }, (_, i) => f(i));
const G9N = Math.max(1000, Math.floor(N / 4)); // 64-key records are ~25x heavier; scale the count
bench("bondTranche", mkPool(validTranche), oldM.decodeBondTrancheV20, newM.decodeBondTrancheV20, N);
bench("bondPosition", mkPool(validPosition), oldM.decodeBondPositionV20, newM.decodeBondPositionV20, N);
bench("insuranceUnits", mkPool(validInsurance), oldM.decodeInsuranceUnitsV20, newM.decodeInsuranceUnitsV20, N);
bench("redemption(ext)", mkPool((i) => validRedemption(i, true)), oldM.decodeLpRedemptionV22, newM.decodeLpRedemptionV22, N);
bench("redemption(legacy)", mkPool((i) => validRedemption(i, false)), oldM.decodeLpRedemptionV22, newM.decodeLpRedemptionV22, N);
bench("g9Allowlist(16x4)", mkPool((i) => validAllowlist(i)), oldM.decodeG9FeedAllowlistV22, newM.decodeG9FeedAllowlistV22, G9N);
