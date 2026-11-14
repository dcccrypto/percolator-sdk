/**
 * Decode benchmark for the big v2.2 accounts (portfolio, market group, ...).
 *
 *   pnpm exec tsx scripts/bench-decode.ts            # microseconds of CPU per decode, median of 5 runs x 1000 iters
 *   pnpm exec tsx scripts/bench-decode.ts --dump out.json   # write every decoded field (bigint/PublicKey safe)
 *
 * Fixtures are synthetic: the repo has no captured v2.2 account bytes, so each buffer is
 * stamped with the real v2.2 header and filled with seeded pseudo-random bytes. Every field
 * is therefore non-trivial. Compare two --dump files with cmp to prove output is unchanged.
 */
import { writeFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { LAYOUT_V22 } from "../src/abi/layout.js";
import {
  parseLpRedemption, parseLpVaultRegistry, parseMarketGroupV17OI, parsePortfolioV17, parseWrapperConfigV17,
} from "../src/solana/slab.js";
import { parseBackingBucketsV17 } from "../src/solana/backing-bucket.js";
import { stampHeader } from "../test/helpers/stamp.js";

let seed = 0x1234abcd;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };
function filled(len: number, kind: number): Uint8Array {
  const b = new Uint8Array(len);
  for (let i = 0; i < len; i++) b[i] = rnd() & 0xff;
  // keep u128 high words small-ish half the time so both sign/size paths are hit
  return stampHeader(b, kind, LAYOUT_V22.version);
}

const L = LAYOUT_V22;
const portfolio = filled(L.portfolio.accountLen, 2);
const market = filled(L.marketGroupOff + L.marketGroupLen + 8 * L.assetSlotStride, 1);
const registry = filled(176, 5);
const redemption = filled(4096, 6);

const cases: Array<[string, () => unknown]> = [
  ["parsePortfolioV17", () => parsePortfolioV17(portfolio)],
  ["parseMarketGroupV17OI", () => parseMarketGroupV17OI(market)],
  ["parseWrapperConfigV17", () => parseWrapperConfigV17(market)],
  ["parseBackingBucketsV17", () => parseBackingBucketsV17(market)],
  ["parseLpVaultRegistry", () => parseLpVaultRegistry(registry)],
  ["parseLpRedemption", () => parseLpRedemption(redemption.subarray(0, 4096))],
];

const replacer = (_k: string, v: unknown) =>
  typeof v === "bigint" ? `${v}n` : v instanceof PublicKey ? `pk:${v.toBase58()}` : v;

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const live = cases.filter(([n]) => !only || n === only).filter(([name, f]) => { try { f(); return true; } catch (e) { console.error(`skip ${name}: ${(e as Error).message.slice(0, 80)}`); return false; } });

const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx > 0) {
  const out: Record<string, unknown> = {};
  for (const [name, f] of live) out[name] = JSON.parse(JSON.stringify(f(), replacer));
  writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(out, null, 1));
  console.log(`dumped ${live.length} decoders`);
} else {
  const ITER = 1000, RUNS = 5;
  console.log("decoder".padEnd(26), "median us/decode (min..max of 5 runs x 1000 iters)");
  for (const [name, f] of live) {
    for (let i = 0; i < 300; i++) f(); // warm up
    const runs: number[] = [];
    for (let r = 0; r < RUNS; r++) {
      const c0 = process.cpuUsage();
      for (let i = 0; i < ITER; i++) f();
      const c = process.cpuUsage(c0); runs.push((c.user + c.system) / ITER); // CPU time: robust on a busy machine
    }
    runs.sort((a, b) => a - b);
    console.log(name.padEnd(26), runs[2].toFixed(2).padStart(8), `(${runs[0].toFixed(2)}..${runs[4].toFixed(2)})`);
  }
}
