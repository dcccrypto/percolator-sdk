/**
 * staleResolveStatusV22 boundary table, encoding percolator-prog (feat/v22-rc23-2026-10-22) tag 39:
 *   v16_program.rs:29266 handle_resolve_stale_permissionless:
 *     mode != 0 -> EngineLockActive (21); slot < header.current_slot -> EngineStale (19);
 *     !permissionless_stale_matured -> OracleStale (27)
 *   v16_program.rs:12514 permissionless_stale_matured:
 *     stale != 0 && now.saturating_sub(last_good) >= stale
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const cfg = { permissionlessResolveStaleSlots: 0n, lastGoodOracleSlot: 0n };
vi.mock("../src/solana/slab.js", () => ({ parseWrapperConfigV17: () => ({ ...cfg }) }));

import { staleResolveStatusV22 } from "../src/abi/v22-resolve.js";
import { resolveMarketGeometry } from "../src/abi/layout.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-qa-devnet-2026-10-11.json", import.meta.url), "utf8")) as {
  accounts: { accounts: Record<string, { dataBase64: string }> };
};
const base = new Uint8Array(Buffer.from(FX.accounts.accounts["solV0Market"]!.dataBase64, "base64"));

function market(mode: number, currentSlot: bigint): Uint8Array {
  const d = new Uint8Array(base);
  const g = resolveMarketGeometry(d, { parser: "t", strictLength: false });
  d[g.groupOff + g.layout.group.mode] = mode;
  new DataView(d.buffer).setBigUint64(g.groupOff + g.layout.group.currentSlot, currentSlot, true);
  return d;
}

const MAX = (1n << 64n) - 1n;
// [label, lastGood, stale, now, expected refusal]
const rows: [string, bigint, bigint, bigint, 27 | null][] = [
  ["stale 0 never matures", 0n, 0n, MAX, 27],
  ["all zero except stale=1", 0n, 1n, 0n, 27],
  ["now == lastGood + stale (>= boundary)", 10n, 5n, 15n, null],
  ["now == lastGood + stale - 1", 10n, 5n, 14n, 27],
  ["now == lastGood + stale + 1", 10n, 5n, 16n, null],
  ["now == lastGood, stale 1", 7n, 1n, 7n, 27],
  ["now < lastGood saturates to 0", 100n, 1n, 5n, 27],
  ["now < lastGood, lastGood max", MAX, 1n, 0n, 27],
  ["lastGood 0, stale 1, now 1", 0n, 1n, 1n, null],
  ["lastGood 0, stale max, now max", 0n, MAX, MAX, null],
  ["lastGood 0, stale max, now max-1", 0n, MAX, MAX - 1n, 27],
  ["lastGood+stale overflows u64, now max: never matures", 5n, MAX, MAX, 27],
  ["lastGood max, stale 1, now max", MAX, 1n, MAX, 27],
  ["lastGood max, stale max, now max", MAX, MAX, MAX, 27],
];

describe("staleResolveStatusV22 vs prog tag 39", () => {
  beforeEach(() => { cfg.permissionlessResolveStaleSlots = 0n; cfg.lastGoodOracleSlot = 0n; });

  it.each(rows)("maturity: %s", (_l, lastGood, stale, now, refusal) => {
    cfg.lastGoodOracleSlot = lastGood; cfg.permissionlessResolveStaleSlots = stale;
    const st = staleResolveStatusV22(market(0, 0n), now);
    expect(st.refusalCode).toBe(refusal);
    expect(st.canResolve).toBe(refusal === null);
    expect(st.maturesAtSlot).toBe(stale === 0n ? null : lastGood + stale);
    expect(st.slotsRemaining).toBe(stale === 0n ? null : (lastGood + stale > now ? lastGood + stale - now : 0n));
  });

  it("refusal order: mode (21) beats slot (19) beats maturity (27)", () => {
    cfg.lastGoodOracleSlot = 0n; cfg.permissionlessResolveStaleSlots = 100n;
    expect(staleResolveStatusV22(market(1, 50n), 10n).refusalCode).toBe(21);
    expect(staleResolveStatusV22(market(0, 50n), 10n).refusalCode).toBe(19);
    expect(staleResolveStatusV22(market(0, 50n), 50n).refusalCode).toBe(27);
    expect(staleResolveStatusV22(market(0, 50n), 100n).refusalCode).toBe(null);
  });

  it("slot 19 boundary: now == currentSlot passes, now == currentSlot-1 refuses; unmatured + early slot -> 19", () => {
    cfg.lastGoodOracleSlot = 0n; cfg.permissionlessResolveStaleSlots = 1n;
    expect(staleResolveStatusV22(market(0, MAX), MAX).refusalCode).toBe(null);
    expect(staleResolveStatusV22(market(0, MAX), MAX - 1n).refusalCode).toBe(19);
    expect(staleResolveStatusV22(market(0, 1n), 0n).refusalCode).toBe(19);
  });

  it("wireNowSlot is ignored and reported", () => {
    cfg.permissionlessResolveStaleSlots = 1n;
    expect(staleResolveStatusV22(market(0, 0n), 5n)).toMatchObject({ wireNowSlot: null, wireNowSlotIgnored: false });
    expect(staleResolveStatusV22(market(0, 0n), 5n, 5)).toMatchObject({ wireNowSlot: 5n, wireNowSlotIgnored: false });
    expect(staleResolveStatusV22(market(0, 0n), 5n, 0n)).toMatchObject({ wireNowSlot: 0n, wireNowSlotIgnored: true });
  });
});
