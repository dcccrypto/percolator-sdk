/** Bench v22-math hot functions, reference vs current, 100k inputs, median of 5. Run: npx tsx scripts/bench-v22-math.ts */
import { defaultMinPayoutV22, displayPriceV22, lotExpForTokenPriceV22, tokensToLotsV22 } from "../src/abi/v22-math.js";
import { defaultMinPayoutRef, displayPriceRef, lotExpForTokenPriceRef, tokensToLotsRef } from "../test/helpers/v22-math-ref.js";

let seed = 12345;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const N = 100_000;
// prices 1e-6..1e6 (e6 units: 1n..1e12n), log-uniform
const prices = Array.from({ length: N }, () => BigInt(Math.max(1, Math.floor(10 ** (rnd() * 12)))));
const exps = Array.from({ length: N }, () => Math.floor(rnd() * 16));
const marks = prices.map((p, i) => p * 10n ** BigInt(exps[i]!));
const sizes = Array.from({ length: N }, () => BigInt(Math.floor(10 ** (rnd() * 15))) + 1n);

let sink = 0;
function medPair(a: () => void, b: () => void): [number, number] {
  for (let w = 0; w < 3; w++) { a(); b(); } // warm both before timing
  const ta: number[] = [], tb: number[] = [];
  for (let r = 0; r < 5; r++) {
    let s = performance.now(); a(); ta.push(performance.now() - s);
    s = performance.now(); b(); tb.push(performance.now() - s);
  }
  return [ta.sort((x, y) => x - y)[2]!, tb.sort((x, y) => x - y)[2]!];
}
const cases: [string, () => void, () => void][] = [
  ["defaultMinPayoutV22", () => { for (let i = 0; i < N; i++) sink += Number(defaultMinPayoutRef(sizes[i]!) & 1n); }, () => { for (let i = 0; i < N; i++) sink += Number(defaultMinPayoutV22(sizes[i]!) & 1n); }],
  ["lotExpForTokenPriceV22", () => { for (let i = 0; i < N; i++) sink += lotExpForTokenPriceRef(prices[i]!) ?? 0; }, () => { for (let i = 0; i < N; i++) sink += lotExpForTokenPriceV22(prices[i]!) ?? 0; }],
  ["displayPriceV22", () => { for (let i = 0; i < N; i++) sink += displayPriceRef(marks[i]!, exps[i]!).length; }, () => { for (let i = 0; i < N; i++) sink += displayPriceV22(marks[i]!, exps[i]!).length; }],
  ["tokensToLotsV22", () => { for (let i = 0; i < N; i++) sink += Number(tokensToLotsRef(sizes[i]!, exps[i]!).lots & 1n); }, () => { for (let i = 0; i < N; i++) sink += Number(tokensToLotsV22(sizes[i]!, exps[i]!).lots & 1n); }],
];
console.log("function | before ms | after ms | gain");
for (const [name, a, b] of cases) {
  const [before, after] = medPair(a, b);
  console.log(`${name} | ${before.toFixed(2)} | ${after.toFixed(2)} | ${(((before - after) / before) * 100).toFixed(1)}%`);
}
if (sink === -1) console.log(sink);
