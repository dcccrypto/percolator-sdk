/**
 * Side measurement: error of the 1e18 truncating pow used by computeMeteoraDlmmPriceE6
 * vs an exact rational reference. Reporting only; the SDK result is not changed.
 *
 *   pnpm exec tsx scripts/dlmm-precision.ts
 *
 * Reference: price_e6 = floor(1e6 * ((10000+bs)/10000)^n) for n >= 0, and
 *            floor(1e6 * (10000/(10000+bs))^n) for n < 0 (decimals diff 0), computed
 * exactly with BigInt rationals. Reported: max abs error in e6 units, max relative error.
 */
import { computeDexSpotPriceE6 } from "../src/solana/dex-oracle.js";

function pool(id: number, step: number): Uint8Array {
  const d = new Uint8Array(216);
  const dv = new DataView(d.buffer);
  dv.setInt32(76, id, true);
  dv.setUint16(80, step, true);
  return d;
}

const steps = [1, 2, 5, 10, 25, 50, 80, 100, 250, 1000];
const ids = [1, 2, 7, 60, 255, 800, 2000, 5000, 20000, 50000];
let maxAbsSmall = 0n, maxAbs = 0n, maxRel = 0, worst = "", n = 0;
for (const bs of steps) {
  for (const mag of ids) {
    for (const sign of [1, -1]) {
      const id = sign * mag;
      let got: bigint;
      try {
        got = computeDexSpotPriceE6("meteora-dlmm", pool(id, bs), undefined, { base: 6, quote: 6 });
      } catch {
        continue; // fails closed (price < 1e-6 or no precision); nothing to compare
      }
      const num = BigInt(10000 + bs) ** BigInt(mag);
      const den = 10000n ** BigInt(mag);
      const exact = sign > 0 ? (num * 1_000_000n) / den : (den * 1_000_000n) / num;
      const abs = got > exact ? got - exact : exact - got;
      // relative error against the exact rational (scaled to avoid float overflow)
      const rel = exact === 0n ? 0 : Number((abs * 10n ** 18n) / exact) / 1e18;
      n++;
      if (abs > maxAbs) maxAbs = abs;
      if (exact < 10n ** 12n && abs > maxAbsSmall) maxAbsSmall = abs; // prices below 1e6 (e6 ratio)
      if (rel > maxRel) { maxRel = rel; worst = `binStep=${bs} activeId=${id}`; }
    }
  }
}
console.log(`cases compared: ${n}`);
console.log(`max abs error (e6 units), prices < 1e6: ${maxAbsSmall}`);
console.log(`max abs error digits (huge prices): ${maxAbs.toString().length}`);
console.log(`max relative error: ${maxRel.toExponential(3)} at ${worst}`);
