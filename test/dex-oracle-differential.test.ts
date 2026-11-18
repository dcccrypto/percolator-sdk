import { describe, it, expect, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });
import { Keypair, PublicKey } from "@solana/web3.js";
import * as cur from "../src/solana/dex-oracle.js";
import * as old from "./fixtures/dex-oracle-frozen.js";
import { PUMPSWAP_ANSEM_B64, METEORA_WSOL_USDC_B64 } from "./fixtures/dex-pool-fixtures.js";

// Deterministic PRNG (mulberry32)
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(0xdec0de);
const ri = (n: number) => Math.floor(R() * n);
function rbig(bits: number): bigint {
  let v = 0n;
  for (let i = 0; i < bits; i += 32) v = (v << 32n) | BigInt(ri(2 ** 32));
  return v & ((1n << BigInt(bits)) - 1n);
}
function pick<T>(xs: T[]): T {
  return xs[ri(xs.length)];
}

/** Run f on both modules; outcomes must match exactly (value or error message). */
function outcome<T>(f: () => T): string {
  try {
    return "ok:" + String(f());
  } catch (e) {
    return "err:" + (e as Error).message;
  }
}

const b64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const tokenAcct = (amount: bigint, len = 165) => {
  const b = new Uint8Array(len);
  if (len >= 72) new DataView(b.buffer).setBigUint64(64, amount, true);
  return b;
};
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

function pumpPool(quote: Uint8Array | null): Uint8Array {
  const d = b64(PUMPSWAP_ANSEM_B64);
  if (quote) d.set(quote, 75);
  return d;
}

describe("dex-oracle differential vs frozen ce60634", () => {
  it("real fixtures: parse + price identical", () => {
    const pump = b64(PUMPSWAP_ANSEM_B64);
    const met = b64(METEORA_WSOL_USDC_B64);
    const a = cur.parseDexPool("pumpswap", WSOL, pump);
    const b = old.parseDexPool("pumpswap", WSOL, pump);
    expect(a.baseMint.toBase58()).toBe(b.baseMint.toBase58());
    expect(a.quoteMint.toBase58()).toBe(b.quoteMint.toBase58());
    expect(a.baseVault!.toBase58()).toBe(b.baseVault!.toBase58());
    expect(a.quoteVault!.toBase58()).toBe(b.quoteVault!.toBase58());
    const ma = cur.parseDexPool("meteora-dlmm", WSOL, met);
    const mb = old.parseDexPool("meteora-dlmm", WSOL, met);
    expect(ma.baseMint.toBase58()).toBe(mb.baseMint.toBase58());
    expect(ma.quoteMint.toBase58()).toBe(mb.quoteMint.toBase58());
    const v = { base: tokenAcct(3_892_192_026_206n), quote: tokenAcct(15_062_049_237_081n) };
    expect(cur.computeDexSpotPriceE6("pumpswap", pump, v, { base: 6, quote: 9 }, 77_728_195n)).toBe(300_730n);
    expect(
      cur.computeDexSpotPriceE6("meteora-dlmm", met, undefined, { base: 9, quote: 6 }),
    ).toBe(old.computeDexSpotPriceE6("meteora-dlmm", met, undefined, { base: 9, quote: 6 }));
  });

  it("PumpSwap: 12k random reserves/decimals/quote mints incl. zero/garbage", () => {
    const nonWsol = Keypair.generate().publicKey.toBytes();
    let n = 0, refusals = 0;
    for (let i = 0; i < 12_000; i++) {
      const pool = pumpPool(R() < 0.5 ? WSOL.toBytes() : nonWsol);
      const amt = () => pick([0n, 1n, rbig(8), rbig(40), rbig(64), (1n << 64n) - 1n]);
      const base = tokenAcct(amt(), pick([165, 72, 71, 200]));
      const quote = tokenAcct(amt(), pick([165, 72, 71]));
      const dec = () => pick([0, 6, 9, 18, ri(25), 24, 25, -1, 1.5, 255, NaN]);
      const decimals = { base: dec(), quote: dec() };
      const sol = pick([undefined, 0n, 77_728_195n, rbig(40)]);
      const pd = R() < 0.03 ? pool.subarray(0, 202) : pool;
      const args = [pd, { base, quote }, decimals, sol] as const;
      const x = outcome(() => cur.computeDexSpotPriceE6("pumpswap", args[0], args[1], args[2], args[3]));
      const y = outcome(() => old.computeDexSpotPriceE6("pumpswap", args[0], args[1], args[2], args[3]));
      expect(x).toBe(y);
      if (x.startsWith("err:")) refusals++;
      n++;
    }
    expect(n).toBe(12_000);
    expect(refusals).toBeGreaterThan(500);
  });

  it("Raydium CLMM: 12k random sqrtPrice/decimals incl. zero/out-of-range", () => {
    let refusals = 0;
    for (let i = 0; i < 12_000; i++) {
      const d = new Uint8Array(pick([300, 269, 268]));
      d[233] = pick([0, 6, 9, 18, ri(25), 24, 25, 255]);
      d[234] = pick([0, 6, 9, 18, ri(25), 24, 25, 255]);
      if (d.length >= 269) {
        const sq = pick([0n, 1n, rbig(32), rbig(64), rbig(100), (1n << 128n) - 1n]);
        const dv = new DataView(d.buffer);
        dv.setBigUint64(253, sq & ((1n << 64n) - 1n), true);
        dv.setBigUint64(261, sq >> 64n, true);
      }
      const x = outcome(() => cur.computeDexSpotPriceE6("raydium-clmm", d));
      const y = outcome(() => old.computeDexSpotPriceE6("raydium-clmm", d));
      expect(x).toBe(y);
      if (x.startsWith("err:")) refusals++;
    }
    expect(refusals).toBeGreaterThan(500);
  });

  it("Meteora DLMM: 12k random bin_step/active_id/decimals incl. zero/garbage", () => {
    let refusals = 0;
    for (let i = 0; i < 12_000; i++) {
      const d = b64(METEORA_WSOL_USDC_B64);
      const dv = new DataView(d.buffer);
      dv.setUint16(80, pick([0, 1, 4, 25, 100, ri(10_001), 10_000, 10_001, 65535]), true);
      dv.setInt32(76, pick([0, 1, -1, -6616, ri(40_001) - 20_000, 500_001, -500_001, 2147483647, -2147483648]), true);
      const dec = () => pick([0, 6, 9, 18, ri(25), 24, 25, -3]);
      const decimals = { base: dec(), quote: dec() };
      // |activeId| at the 500k cap with a large bin_step produces multi-megabyte BigInts
      // (pre-existing, same in both impls); cap extremes to bin_step 1 so the suite stays fast.
      if (R() < 0.02) {
        dv.setUint16(80, 1, true);
        dv.setInt32(76, pick([500_000, -500_000]), true);
      }
      const dd = R() < 0.02 ? d.subarray(0, 151) : d;
      const x = outcome(() => cur.computeDexSpotPriceE6("meteora-dlmm", dd, undefined, decimals));
      const y = outcome(() => old.computeDexSpotPriceE6("meteora-dlmm", dd, undefined, decimals));
      expect(x).toBe(y);
      if (x.startsWith("err:")) refusals++;
    }
    expect(refusals).toBeGreaterThan(500);
  });

  it("parseDexPool: random buffers, all dex types, identical keys/errors", () => {
    for (let i = 0; i < 3000; i++) {
      const len = pick([0, 100, 151, 152, 202, 203, 268, 269, 301]);
      const d = new Uint8Array(len);
      for (let j = 0; j < len; j++) d[j] = ri(256);
      for (const t of ["pumpswap", "raydium-clmm", "meteora-dlmm"] as const) {
        const f = (m: typeof cur) =>
          outcome(() => {
            const p = m.parseDexPool(t, WSOL, d);
            return [p.baseMint, p.quoteMint, p.baseVault, p.quoteVault].map((k) => k?.toBase58()).join(",");
          });
        expect(f(cur)).toBe(f(old as unknown as typeof cur));
      }
    }
  });
});
