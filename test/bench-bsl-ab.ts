import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import * as nw from "../src/abi/v22-band-safety-law.js";
import * as old from "./fixtures/v22-bsl/frozen-band-safety-law.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/v22-bsl/parity.json", import.meta.url), "utf8")) as { rows: { input: Record<string, unknown> }[] };
const rv = (o: Record<string, unknown>): any => JSON.parse(JSON.stringify(o), (_k, v) => (typeof v === "string" && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v));
const rows = fx.rows.map((r) => rv(r.input));
const seed = rv({ maxPortfolioAssets: 1, maintenanceMarginBps: "1000n", initialMarginBps: "2000n", liquidationFeeBps: "50n", liquidationFeeCap: "10000000000n", minLiquidationAbs: "0n", minNonzeroMmReq: "1000000n", minNonzeroImReq: "2000000n", maxPriceMoveBpsPerSlot: "1n", maxAccrualDtSlots: "500n", maxAbsFundingE9PerSlot: "111n", minFundingLifetimeSlots: "500n", maintenanceFeePerSlot: "0n", initialPriceE6: "80000000n", collateralDecimals: 6, rent: { rentMaxE9PerSlot: 100, rentKinkBps: 5000 }, band: { bandBps: 130, bandMaxEpochSlots: 600, bandMaxPinSlots: 9000, bandMinLegNotional: "100000000n" } });
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const t = (f: () => void) => { const s = performance.now(); f(); return performance.now() - s; };
const grid = (m: any) => () => { for (const r of rows) { try { m.checkBandSafetyLawV22(r); } catch {} } };
const bis = (m: any) => () => { for (let i = 0; i < 200; i++) m.maxAcceptedRentE9PerSlotV22(seed); };
const R: Record<string, number[]> = { oldGrid: [], newGrid: [], oldBis: [], newBis: [] };
for (let k = 0; k < 5; k++) {
  R.oldGrid.push(t(grid(old))); R.newGrid.push(t(grid(nw)));
  R.oldBis.push(t(bis(old))); R.newBis.push(t(bis(nw)));
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, +med(v).toFixed(1)]))));
