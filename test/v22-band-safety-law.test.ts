import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as sdk from "../src/index.js";
import {
  BSL_OCCUPANCY_RENT_MULTIPLE_RC23,
  bandWorstAdverseBpsV22,
  checkBandSafetyLawV22,
  maxAcceptedRentE9PerSlotV22,
  type BandSafetyLawInputV22,
} from "../src/abi/v22-band-safety-law.js";
import { bandRGapBps } from "../src/abi/growth-v19.js";

interface ParityRow { id: string; input: Record<string, unknown>; x5: string; base: string }
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/v22-bsl/parity.json", import.meta.url)), "utf8"),
) as { rows: ParityRow[] };

const revive = (o: Record<string, unknown>): BandSafetyLawInputV22 =>
  JSON.parse(JSON.stringify(o), (_k, v: unknown) => (typeof v === "string" && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v)) as BandSafetyLawInputV22;

/**
 * What the pre-check must say for a program answer:
 * - "ok" or Custom(94) (the growth block, AFTER the rent/band words were accepted) -> ok;
 * - Custom(105) / Custom(106) -> that code;
 * - InvalidAccountData (the engine refuses the base config at init) -> code null (base config invalid).
 * Anything else (ProgramFailedToComplete: the validator ran out of compute) is not a verdict of the law.
 */
function expected(program: string): "ok" | 105 | 106 | null | "skip" {
  if (program === "ok" || program === "Custom(94)") return "ok";
  if (program === "Custom(105)") return 105;
  if (program === "Custom(106)") return 106;
  if (program.includes("InvalidAccountData")) return null;
  return "skip";
}
const got = (r: ReturnType<typeof checkBandSafetyLawV22>): "ok" | 105 | 106 | null => (r.ok ? "ok" : r.code);

const seedPilot: BandSafetyLawInputV22 = {
  maxPortfolioAssets: 1, maintenanceMarginBps: 1000n, initialMarginBps: 2000n, liquidationFeeBps: 50n,
  liquidationFeeCap: 10_000_000_000n, minLiquidationAbs: 0n, minNonzeroMmReq: 1_000_000n, minNonzeroImReq: 2_000_000n,
  maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 500n, maxAbsFundingE9PerSlot: 111n, minFundingLifetimeSlots: 500n,
  rent: { rentMaxE9PerSlot: 100, rentKinkBps: 5000 },
  band: { bandBps: 130, bandMaxEpochSlots: 600, bandMaxPinSlots: 9000, bandMinLegNotional: 100_000_000n },
};

describe("Band Safety Law pre-check: parity with the program (LiteSVM, real .so)", () => {
  it("fixture is large and covers every verdict on both programs", () => {
    expect(fixture.rows.length).toBeGreaterThan(1500);
    for (const prog of ["x5", "base"] as const) {
      const v = new Set(fixture.rows.map((r) => expected(r[prog])));
      for (const k of ["ok", 105, 106, null] as const) expect(v.has(k), `${prog} has ${String(k)}`).toBe(true);
    }
    expect(fixture.rows.filter((r) => r.x5 === "Custom(106)" && r.base === "ok").length).toBeGreaterThan(50);
  });

  for (const [prog, k] of [["x5", BSL_OCCUPANCY_RENT_MULTIPLE_RC23], ["base", 1n]] as const) {
    it(`every row matches ${prog === "x5" ? "rc23 34996503 (x5)" : "bbaa0e7b (x1)"}`, () => {
      const mismatches: string[] = [];
      let compared = 0;
      for (const row of fixture.rows) {
        const want = expected(row[prog]);
        if (want === "skip") continue;
        compared++;
        const g = got(checkBandSafetyLawV22(revive(row.input), { occupancyRentMultiple: k }));
        if (g !== want) mismatches.push(`${row.id}: program ${row[prog]} sdk ${String(g)}`);
      }
      expect(mismatches).toEqual([]);
      expect(compared).toBeGreaterThan(1500);
    });
  }
});

describe("Band Safety Law pre-check: the decided settings", () => {
  it("the seed's band pilot (CHILLHOUSE / swordcat) passes both rules; its rent ceiling is 2000 under x5", () => {
    expect(checkBandSafetyLawV22(seedPilot).ok).toBe(true);
    expect(checkBandSafetyLawV22(seedPilot, { occupancyRentMultiple: 1n }).ok).toBe(true);
    expect(maxAcceptedRentE9PerSlotV22(seedPilot)).toBe(2000n);
    expect(maxAcceptedRentE9PerSlotV22(seedPilot, { occupancyRentMultiple: 1n })).toBe(10_000n);
  });

  it("names the rule: x5 occupancy (106), band law (105), rent block (106)", () => {
    const r = checkBandSafetyLawV22({ ...seedPilot, rent: { rentMaxE9PerSlot: 2001, rentKinkBps: 5000 } });
    expect(r).toMatchObject({ ok: false, code: 106, rule: "occupancy-law" });
    const b = checkBandSafetyLawV22({ ...seedPilot, band: { ...seedPilot.band!, bandBps: 400 } });
    expect(b).toMatchObject({ ok: false, code: 105, rule: "band-shape-or-law" });
    const k = checkBandSafetyLawV22({ ...seedPilot, rent: { rentMaxE9PerSlot: 100, rentKinkBps: 8001 } });
    expect(k).toMatchObject({ ok: false, code: 106, rule: "rent-block" });
  });

  it("no rent block and no band: nothing to check", () => {
    const { rent: _r, band: _b, ...plain } = seedPilot;
    expect(checkBandSafetyLawV22(plain).ok).toBe(true);
    expect(() => checkBandSafetyLawV22({ ...plain, band: seedPilot.band })).toThrow(RangeError);
  });

  it("rejects malformed input", () => {
    expect(() => checkBandSafetyLawV22({ ...seedPilot, maintenanceMarginBps: -1n })).toThrow(RangeError);
    expect(() => checkBandSafetyLawV22(seedPilot, { occupancyRentMultiple: 0n })).toThrow(RangeError);
  });

  it("G(d) agrees with the SDK's bandRGapBps on 1..=2000", () => {
    for (let d = 1n; d <= 2000n; d++) expect(bandWorstAdverseBpsV22(d)).toBe(bandRGapBps(d));
    expect(bandWorstAdverseBpsV22(0n)).toBeNull();
    expect(bandWorstAdverseBpsV22(2001n)).toBeNull();
  });

  it("is exported from the package root", () => {
    expect(sdk.checkBandSafetyLawV22).toBe(checkBandSafetyLawV22);
    expect(sdk.maxAcceptedRentE9PerSlotV22).toBe(maxAcceptedRentE9PerSlotV22);
  });

  it("has no imports (consumers vendor a byte-identical copy) and its sha256 is pinned", () => {
    const p = fileURLToPath(new URL("../src/abi/v22-band-safety-law.ts", import.meta.url));
    const src = readFileSync(p);
    expect(/^\s*import\s/m.test(src.toString("utf8"))).toBe(false);
    expect(createHash("sha256").update(src).digest("hex")).toBe(V22_BSL_SHA256);
  });
});

/** Pinned: the app (`app/lib/v22/sdk/v22-band-safety-law.ts`) and the seed kit (`relaunch/v22/v22-band-safety-law.ts`) carry this exact file. */
const V22_BSL_SHA256 = "cf96931c39c1b024b492a881acb3937814ddb908fdc6348529e18d6045c97f09";
