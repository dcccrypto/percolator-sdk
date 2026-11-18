/**
 * Pure table test: `staleResolveStatusV22` vs an independent model of percolator-prog
 * (feat/v22-rc23-2026-10-22 @ d27f3d73) `handle_resolve_stale_permissionless` (v16_program.rs:29266) and
 * `oracle_v16::permissionless_stale_matured` (v16_program.rs:12514).
 *
 * Handler order: mode != 0 -> 21 (EngineLockActive); clock < group.current_slot -> 19 (EngineStale);
 * !matured -> 27 (OracleStale); else resolves. matured = stale_slots != 0 && clock.saturating_sub(last_good) >= stale_slots.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { staleResolveStatusV22 } from "../src/index.js";
import { resolveMarketGeometry } from "../src/abi/layout.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-qa-devnet-2026-10-11.json", import.meta.url), "utf8")) as {
  accounts: { accounts: Record<string, { dataBase64: string }> };
};
const base = new Uint8Array(Buffer.from(FX.accounts.accounts["solV0Market"]!.dataBase64, "base64"));
const g = resolveMarketGeometry(base, { parser: "t", strictLength: false });
const CFG = 16; // V17_HEADER_LEN
const OFF = { mode: g.groupOff + g.layout.group.mode, cur: g.groupOff + g.layout.group.currentSlot, st: CFG + 136, lg: CFG + 152 };

const U64 = (1n << 64n) - 1n;
function market(mode: number, cur: bigint, lg: bigint, st: bigint): Uint8Array {
  const d = base.slice();
  const dv = new DataView(d.buffer);
  d[OFF.mode] = mode;
  dv.setBigUint64(OFF.cur, cur, true);
  dv.setBigUint64(OFF.lg, lg, true);
  dv.setBigUint64(OFF.st, st, true);
  return d;
}
/** Independent model, written straight from the Rust. */
function prog(mode: number, cur: bigint, lg: bigint, st: bigint, clock: bigint): "ok" | 19 | 21 | 27 {
  if (mode !== 0) return 21;
  if (clock < cur) return 19;
  const sat = clock >= lg ? clock - lg : 0n;
  if (!(st !== 0n && sat >= st)) return 27;
  return "ok";
}

const slots = [0n, 1n, 99n, 100n, 101n, 1_000n, U64 - 1n, U64];
const stales = [0n, 1n, 100n, U64 - 1n, U64];
const modes = [0, 1, 2, 255];

describe("staleResolveStatusV22 handler order (table)", () => {
  it("sanity: offsets decode back", () => {
    const st = staleResolveStatusV22(market(0, 7n, 11n, 13n), 5n);
    expect(st).toMatchObject({ mode: 0, staleSlots: 13n, lastGoodOracleSlot: 11n });
  });

  it("mode precedes clock precedes maturity (explicit rows)", () => {
    // mode!=0 wins over everything
    expect(staleResolveStatusV22(market(1, 50n, 0n, 1n), 0n).refusalCode).toBe(21);
    // live, clock < current_slot wins over maturity
    expect(staleResolveStatusV22(market(0, 50n, 0n, 1n), 49n).refusalCode).toBe(19);
    // live, clock ok, stale_slots == 0: never matures
    expect(staleResolveStatusV22(market(0, 0n, 0n, 0n), U64)).toMatchObject({ refusalCode: 27, slotsRemaining: null, maturesAtSlot: null });
    // exactly at maturity resolves, one before does not
    expect(staleResolveStatusV22(market(0, 0n, 100n, 50n), 150n)).toMatchObject({ canResolve: true, slotsRemaining: 0n });
    expect(staleResolveStatusV22(market(0, 0n, 100n, 50n), 149n)).toMatchObject({ refusalCode: 27, slotsRemaining: 1n });
    // last_good in the future of the clock: saturating_sub = 0 -> not matured
    expect(staleResolveStatusV22(market(0, 0n, 500n, 1n), 100n).refusalCode).toBe(27);
  });

  it("matches the model on the full cross product incl. u64 edges", () => {
    let n = 0;
    const bad: string[] = [];
    for (const mode of modes) for (const cur of slots) for (const lg of slots) for (const st of stales) for (const clock of slots) {
      n++;
      const want = prog(mode, cur, lg, st, clock);
      const got = staleResolveStatusV22(market(mode, cur, lg, st), clock);
      const gotC = got.canResolve ? "ok" : got.refusalCode;
      if (gotC !== want) bad.push(`mode=${mode} cur=${cur} lg=${lg} st=${st} clock=${clock}: prog=${want} sdk=${gotC}`);
    }
    expect(n).toBe(modes.length * slots.length ** 3 * stales.length);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it("slotsRemaining is consistent with maturity for live, in-clock markets", () => {
    for (const lg of slots) for (const st of stales) for (const clock of slots) {
      const s = staleResolveStatusV22(market(0, 0n, lg, st), clock);
      if (st === 0n) { expect(s.slotsRemaining).toBeNull(); continue; }
      expect(s.slotsRemaining === 0n).toBe(s.canResolve);
    }
  });
});
