/** Deterministic random inputs for the lev-guard-v22 bench and differential test. */
import { PublicKey } from "@solana/web3.js";

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Inputs {
  accounts: Uint8Array[];
  t0s: bigint[];
  keys: (Uint8Array | PublicKey | null)[];
  pubkeys: PublicKey[];
  reports: { jDumpBps: number; mIndBps: number; lCapX100: number; nMultBps: number }[];
}

/** Valid guard account (4472 or 4456 bytes) with random fields. */
function account(r: () => number, burst: boolean): Uint8Array {
  const rec = burst ? 360 : 344;
  const d = new Uint8Array(16 + rec + 4096);
  const dv = new DataView(d.buffer);
  const rb = (): number => Math.floor(r() * 256);
  // header: filled by the caller via LAYOUT_V22 conventions (see makeHeader)
  for (let i = 16; i < d.length; i++) d[i] = rb();
  const b = 16;
  d[b + 74] = 1; // version
  d[b + 76] = Math.floor(r() * 4); // flags
  d[b + 77] = r() < 0.5 ? 1 : 0;
  d[b + 78] = r() < 0.5 ? 1 : 0;
  d[b + 79] = 0;
  dv.setUint16(b + 80, Math.floor(r() * 10001), true);
  dv.setUint16(b + 82, Math.floor(r() * 10001), true);
  dv.setUint16(b + 86, Math.floor(r() * 10001), true);
  dv.setUint16(b + 98, Math.floor(r() * 10001), true);
  const n = r() < 0.1 ? 256 : r() < 0.1 ? 0 : Math.floor(r() * 257);
  dv.setUint16(b + 100, n, true);
  d.fill(0, b + 102, b + 104);
  d.fill(0, b + 162, b + 168);
  if (burst) d.fill(0, b + 348, b + 352);
  return d;
}

export function makeInputs(n: number, seed: number, header?: Uint8Array): Inputs {
  const r = rng(seed);
  const hdr = header ?? defaultHeader();
  const accounts: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    const d = account(r, i % 5 !== 0);
    d.set(hdr, 0);
    accounts.push(d);
  }
  const u64 = (): bigint => (BigInt(Math.floor(r() * 2 ** 32)) << 32n) | BigInt(Math.floor(r() * 2 ** 32));
  const t0s: bigint[] = [0n, 1n, (1n << 64n) - 1n];
  while (t0s.length < n) t0s.push(u64());
  const keys: Inputs["keys"] = [null, new Uint8Array(32)];
  const pubkeys: PublicKey[] = [];
  while (pubkeys.length < n) {
    const k = new Uint8Array(32);
    for (let j = 0; j < 32; j++) k[j] = Math.floor(r() * 256);
    pubkeys.push(new PublicKey(k));
    if (keys.length < n) keys.push(pubkeys.length % 2 ? k : pubkeys[pubkeys.length - 1]);
  }
  const reports: Inputs["reports"] = [
    { jDumpBps: 0, mIndBps: 0, lCapX100: 0, nMultBps: 0 },
    { jDumpBps: 10000, mIndBps: 10000, lCapX100: 65535, nMultBps: 10000 },
  ];
  while (reports.length < n) {
    reports.push({
      jDumpBps: Math.floor(r() * 10001), mIndBps: Math.floor(r() * 10001),
      lCapX100: Math.floor(r() * 65536), nMultBps: Math.floor(r() * 10001),
    });
  }
  return { accounts, t0s, keys, pubkeys, reports };
}

import { ACCOUNT_KIND, LAYOUT_V22, WRAPPER_ACCOUNT_MAGIC } from "../../src/abi/layout.js";

export function defaultHeader(): Uint8Array {
  const h = new Uint8Array(16);
  const v = new DataView(h.buffer);
  v.setBigUint64(0, WRAPPER_ACCOUNT_MAGIC, true);
  v.setUint16(8, LAYOUT_V22.version, true);
  h[10] = ACCOUNT_KIND.LevGuard;
  return h;
}
