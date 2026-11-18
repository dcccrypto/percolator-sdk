/**
 * Case generator for the tag 39 real-path differential. Usage:
 *   tsx scripts/stale-resolve-cases.ts <base.bin> <cases.json>
 * <base.bin> = market bytes dumped from the prog test harness (tests/stale_resolve_diff.rs, STALE_BASE_OUT).
 * Offsets come from the SDK's own layout, so the real program reading these bytes also validates the SDK offsets.
 * Then run the driver with STALE_CASES=<cases.json> STALE_RESULTS=<results.json> and pack with
 * scripts/stale-resolve-pack.ts (or see the fixture header in test/stale-resolve-bpf-diff-v22.test.ts).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolveMarketGeometry } from "../src/abi/layout.js";

const U64 = (1n << 64n) - 1n;
export const MODES = [0, 1, 2];
export const CURS = [0n, 100n, U64];
export const LGS = [0n, 100n, U64 - 1n];
export const STS = [0n, 1n, 50n, U64];
export const CLUSTERS = [0n, 99n, 100n, 150n, U64];

const le = (v: bigint): string => {
  let s = "";
  for (let i = 0; i < 8; i++) s += Number((v >> BigInt(8 * i)) & 0xffn).toString(16).padStart(2, "0");
  return s;
};

const base = new Uint8Array(readFileSync(process.argv[2]!));
const g = resolveMarketGeometry(base, { parser: "gen", strictLength: false });
const OFF = { mode: g.groupOff + g.layout.group.mode, cur: g.groupOff + g.layout.group.currentSlot, st: 16 + 136, lg: 16 + 152 };
const cases = [];
for (const mode of MODES) for (const cur of CURS) for (const lg of LGS) for (const st of STS) for (const cluster of CLUSTERS) {
  cases.push({
    mode, cur: String(cur), lg: String(lg), st: String(st), cluster: String(cluster),
    diffs: [[OFF.mode, mode.toString(16).padStart(2, "0")], [OFF.cur, le(cur)], [OFF.st, le(st)], [OFF.lg, le(lg)]],
  });
}
writeFileSync(process.argv[3]!, JSON.stringify(cases));
console.log(`${cases.length} cases`);
