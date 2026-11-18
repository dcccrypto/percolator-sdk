/**
 * Bench: readTradeFeeInputsV22 on the real devnet v2.2 market + matcher ctx fixture.
 * N=10k reads per sample, median of 10 samples.
 * Run: npx tsx bench/trade-fee-read.bench.ts
 */
import { readFileSync } from "node:fs";
import { readTradeFeeInputsV22 } from "../src/abi/v22-trade-fee.js";

const FX = JSON.parse(readFileSync(new URL("../test/fixtures/v22-qa-devnet-2026-10-11.json", import.meta.url), "utf8"));
const acct = (k: string): Uint8Array => new Uint8Array(Buffer.from(FX.accounts.accounts[k].dataBase64, "base64"));
const market = acct("jupMarket");
const ctx = acct("jupMatcherCtx");

const N = 10_000;
const SAMPLES = 10;
let sink = 0n;
for (let i = 0; i < 2000; i++) sink += readTradeFeeInputsV22(market, 0, ctx).tradeFeeBaseBps; // warm-up
const times: number[] = [];
for (let s = 0; s < SAMPLES; s++) {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) sink += readTradeFeeInputsV22(market, 0, ctx).tradeFeeBaseBps;
  times.push(Number(process.hrtime.bigint() - t0) / 1e6);
}
times.sort((a, b) => a - b);
const median = (times[4]! + times[5]!) / 2;
console.log(`readTradeFeeInputsV22 N=${N} median-of-${SAMPLES}: ${median.toFixed(2)} ms (${((median * 1e3) / N).toFixed(2)} us/read) [sink=${sink}]`);
