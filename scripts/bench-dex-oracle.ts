// Bench: decode + price real PumpSwap / Meteora pool fixtures (+ a Raydium CLMM account).
// Usage: tsx scripts/bench-dex-oracle.ts [modulePath]   (default ../src/solana/dex-oracle.ts)
import { PUMPSWAP_ANSEM_B64, METEORA_WSOL_USDC_B64 } from "../test/fixtures/dex-pool-fixtures.js";

const modPath = process.argv[2] ?? "../src/solana/dex-oracle.ts";
const m = await import(modPath);
const ITER = 100_000;

const b64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const pump = b64(PUMPSWAP_ANSEM_B64);
const meteora = b64(METEORA_WSOL_USDC_B64);

function tokenAcct(amount: bigint): Uint8Array {
  const b = new Uint8Array(165);
  new DataView(b.buffer).setBigUint64(64, amount, true);
  return b;
}
const base = tokenAcct(3_892_192_026_206n);
const quote = tokenAcct(15_062_049_237_081n);

const ray = new Uint8Array(300);
ray[233] = 9;
ray[234] = 6;
new DataView(ray.buffer).setBigUint64(253, 5_000_000_000_000_000_000n, true);

const cases: Record<string, () => unknown> = {
  pumpswap: () => m.computeDexSpotPriceE6("pumpswap", pump, { base, quote }, { base: 6, quote: 9 }, 77_728_195n),
  raydium: () => m.computeDexSpotPriceE6("raydium-clmm", ray),
  meteora: () => m.computeDexSpotPriceE6("meteora-dlmm", meteora, undefined, { base: 9, quote: 6 }),
  parse_pumpswap: () => m.parseDexPool("pumpswap", m.WSOL_MINT, pump),
  parse_meteora: () => m.parseDexPool("meteora-dlmm", m.WSOL_MINT, meteora),
};

const out: Record<string, number> = {};
for (const [name, fn] of Object.entries(cases)) {
  for (let i = 0; i < 5000; i++) fn(); // warm
  const runs: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t = process.hrtime.bigint();
    for (let i = 0; i < ITER; i++) fn();
    runs.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  runs.sort((a, b) => a - b);
  out[name] = Math.round(runs[2] * 10) / 10;
}
console.log(JSON.stringify({ module: modPath, iterations: ITER, medianMsOf5: out }));
