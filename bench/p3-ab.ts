// A/B bench: frozen (base) vs current, interleaved rounds, median ns/op. Run: npx tsx bench/p3-ab.ts
import * as cur from "../src/abi/p3.js";
import * as old from "../test/helpers/p3-frozen.js";
const prices: bigint[] = Array.from({ length: 4096 }, () => BigInt(1 + Math.floor(Math.random() * 1e12)));
const m = { expectedSequence: 5n, assetGenerationFrontier: 7n, tradeFeeCapBps: 10000, expirySlot: 123456789n, kind: 1, tradingFeeBps: 10, baseSpreadBps: 10, maxTotalBps: 100, impactKBps: 50, liquidityNotionalE6: 250_000_000_000n, maxFillAbs: 5_000_000_000n, maxInventoryAbs: 25_000_000_000n, feeToInsuranceBps: 0, skewSpreadMultBps: 1 };
type M = typeof cur;
const cases: [string, number, (x: M) => (i: number) => unknown][] = [
  ["pinnedMatcherCapsP3", 1e6, x => i => x.pinnedMatcherCapsP3(prices[i & 4095])],
  ["encodeVaultLpSetMatcherP3", 1e5, x => () => x.encodeVaultLpSetMatcherP3(m)],
  ["encodeInitVaultLpP3", 1e5, x => i => x.encodeInitVaultLpP3(1000 + (i % 9000))],
  ["encodeDepositJuniorTrancheP3", 1e5, x => i => x.encodeDepositJuniorTrancheP3(BigInt(i) + 1n)],
  ["encodeVaultLpRecallP3", 1e5, x => i => x.encodeVaultLpRecallP3(BigInt(i) + 1n, i & 0xff)],
];
function time(n: number, f: (i: number) => unknown) { const s = process.hrtime.bigint(); for (let i = 0; i < n; i++) f(i); return Number(process.hrtime.bigint() - s) / n; }
const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
for (const [name, n, mk] of cases) {
  const fo = mk(old as unknown as M), fc = mk(cur);
  time(5000, fo); time(5000, fc);
  const o: number[] = [], c: number[] = [];
  for (let r = 0; r < 7; r++) { o.push(time(n, fo)); c.push(time(n, fc)); }
  const mo = med(o), mc = med(c);
  console.log(name.padEnd(30), "base", mo.toFixed(1).padStart(9), "new", mc.toFixed(1).padStart(9), "ns/op", `speedup ${(mo / mc).toFixed(2)}x (${((1 - mc / mo) * 100).toFixed(0)}% less)`);
}
