import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkBandSafetyLawV22, maxAcceptedRentE9PerSlotV22, type BandSafetyLawInputV22 } from "../src/abi/v22-band-safety-law.js";
import * as old from "./fixtures/v22-bsl/frozen-band-safety-law.js";

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/v22-bsl/parity.json", import.meta.url)), "utf8"),
) as { rows: { input: Record<string, unknown> }[] };
const revive = (o: Record<string, unknown>): BandSafetyLawInputV22 =>
  JSON.parse(JSON.stringify(o), (_k, v: unknown) => (typeof v === "string" && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v)) as BandSafetyLawInputV22;

const run = <T>(f: () => T): { v?: T; e?: string } => {
  try { return { v: f() }; } catch (e) { return { e: String(e) }; }
};

let seedState = 0x9e3779b9;
const rnd = (): number => { seedState ^= seedState << 13; seedState >>>= 0; seedState ^= seedState >>> 17; seedState ^= seedState << 5; seedState >>>= 0; return seedState / 2 ** 32; };
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const big = (a: bigint[]): bigint => pick(a) + BigInt(Math.floor(rnd() * 3)) - 1n;

function randomInput(): BandSafetyLawInputV22 {
  const nz = (a: bigint[]) => { const v = big(a); return v < 0n ? 0n : v; };
  const hasRent = rnd() < 0.9;
  const hasBand = hasRent && rnd() < 0.8;
  return {
    maxPortfolioAssets: pick([0, 1, 2, 8, 64]),
    maintenanceMarginBps: nz([0n, 500n, 1000n, 5000n, 10_000n]),
    initialMarginBps: nz([0n, 1000n, 2000n, 10_000n]),
    liquidationFeeBps: nz([0n, 50n, 300n]),
    liquidationFeeCap: nz([0n, 10_000_000_000n]),
    minLiquidationAbs: nz([0n, 1000n]),
    minNonzeroMmReq: nz([0n, 1_000_000n]),
    minNonzeroImReq: nz([0n, 2_000_000n]),
    maxPriceMoveBpsPerSlot: nz([0n, 1n, 5n, 50n]),
    maxAccrualDtSlots: nz([0n, 100n, 500n, 4000n]),
    maxAbsFundingE9PerSlot: nz([0n, 111n, 1000n]),
    minFundingLifetimeSlots: nz([0n, 500n, 5000n]),
    maintenanceFeePerSlot: rnd() < 0.9 ? 0n : 5n,
    initialPriceE6: rnd() < 0.1 ? null : nz([0n, 1_000_000n, 80_000_000n, 500_000_000n]),
    collateralDecimals: rnd() < 0.1 ? null : pick([0, 6, 9]),
    rent: hasRent ? { rentMaxE9PerSlot: pick([0, 5, 10, 100, 1000, 4000, 5000, 100_000]), rentKinkBps: pick([0, 5000, 8000, 10_000]) } : undefined,
    band: hasBand ? { bandBps: pick([0, 10, 130, 500, 2000]), bandMaxEpochSlots: pick([1, 100, 600, 5000]), bandMaxPinSlots: pick([0, 600, 9000]), bandMinLegNotional: nz([0n, 100_000_000n, 1_000_000_000n]) } : undefined,
  } as BandSafetyLawInputV22;
}

describe("Band Safety Law: new implementation deep-equals the frozen pre-perf copy", () => {
  it("every fixture row", () => {
    for (const row of fixture.rows) {
      const i = revive(row.input);
      expect(run(() => checkBandSafetyLawV22(i))).toEqual(run(() => old.checkBandSafetyLawV22(i)));
    }
  }, 60_000);

  it("5k random inputs (check)", () => {
    for (let n = 0; n < 5000; n++) {
      const i = randomInput();
      expect(run(() => checkBandSafetyLawV22(i))).toEqual(run(() => old.checkBandSafetyLawV22(i)));
    }
  }, 120_000);

  it("maxAcceptedRent: fixture rows with a rent block + random inputs", () => {
    const inputs = [...fixture.rows.map((r) => revive(r.input)), ...Array.from({ length: 300 }, randomInput)];
    for (const i of inputs) {
      expect(run(() => maxAcceptedRentE9PerSlotV22(i))).toEqual(run(() => old.maxAcceptedRentE9PerSlotV22(i)));
    }
  }, 300_000);
});
