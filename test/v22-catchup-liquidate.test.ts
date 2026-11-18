/**
 * LIQ-DIAG 2026-10-17: buildCatchUpAndRefreshIxsV22 on REAL devnet market bytes (test/fixtures/v22-q7-devnet-2026-10-12.json,
 * market 2xhsLP9N, 5 assets). Reference behaviour: percolator-prog test/v22-liq-catchup-repro-2026-10-17 `liq_diag_*` (LiteSVM:
 * a bankrupt, never-refreshed long is liquidated by N observation cranks + one refresh in one tx; every shorter shape is 22).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  buildCatchUpAndRefreshIxsV22, decodeMarketFundingV22, PROGRAM_IDS_DEVNET_V22,
  MAX_OBSERVES_PER_TX_V22, MAX_OBSERVES_WITH_REFRESH_V22, CATCHUP_TX_COMPUTE_UNITS_V22,
} from "../src/index.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-q7-devnet-2026-10-12.json", import.meta.url), "utf8")) as { market: string; portfolio: string; lp: string; owner: string; accounts: { market: string } };
const marketData = new Uint8Array(Buffer.from(FX.accounts.market, "base64"));
const W = new PublicKey(PROGRAM_IDS_DEVNET_V22.percolator), MKT = new PublicKey(FX.market), P = new PublicKey(FX.portfolio), LP = new PublicKey(FX.lp), OWNER = new PublicKey(FX.owner);
const f = decodeMarketFundingV22(marketData);
const DT = f.maxAccrualDtSlots;
const SL = f.assets[0]!.slotLast;
const plan = (gap: bigint, extra: Record<string, unknown> = {}) => buildCatchUpAndRefreshIxsV22({ programId: W, market: MKT, marketData, cranker: OWNER, portfolio: P, observePortfolio: LP, readSlot: SL + gap, ...extra });
const cranks = (ixs: { data: Uint8Array; keys: { pubkey: PublicKey }[]; programId: PublicKey }[]) => ixs.filter((i) => i.programId.equals(W));
/** tag(1) nowSlot(8) count(1) then (assetIndex u16, oracleAccounts u8) x count */
const decodePermissionlessCrank = (d: Uint8Array): { observations: { assetIndex: number }[] } => {
  expect(d[0]).toBe(5);
  const n = d[9]!;
  return { observations: Array.from({ length: n }, (_, i) => ({ assetIndex: d[10 + i * 3]! | (d[11 + i * 3]! << 8) })) };
};
const portfolioOf = (i: { keys: { pubkey: PublicKey }[] }) => i.keys[2]!.pubkey;

describe("buildCatchUpAndRefreshIxsV22 (real market bytes)", () => {
  it("fixture sanity: the market has a positive accrual window", () => {
    expect(DT).toBeGreaterThan(0n);
  });
  it("gap inside one window: ONE observe + the refresh (a lone refresh would be refused 22)", () => {
    const p = plan(DT - 1n);
    expect(p.totalObserveCranks).toBe(1);
    expect(p.txs).toHaveLength(1);
    const c = cranks(p.txs[0]!.instructions as never);
    expect(c).toHaveLength(2);
    expect(portfolioOf(c[0]!).equals(LP)).toBe(true);
    expect(portfolioOf(c[1]!).equals(P)).toBe(true);
    expect(p.txs[0]!.computeUnitLimit).toBe(CATCHUP_TX_COMPUTE_UNITS_V22);
  });
  it("gap of 3 windows + 1 slot: ceil = 4 observes then the refresh, in one tx", () => {
    const p = plan(DT * 3n + 1n);
    expect(p.totalObserveCranks).toBe(4);
    expect(p.txs).toHaveLength(1);
    expect(p.txs[0]).toMatchObject({ kind: "final", observeCranks: 4, refreshes: true });
    const c = cranks(p.txs[0]!.instructions as never);
    expect(c).toHaveLength(5);
    expect(c.slice(0, 4).every((i) => portfolioOf(i).equals(LP))).toBe(true);
    expect(portfolioOf(c[4]!).equals(P)).toBe(true);
  });
  it("exact multiple of the window: no extra observe (an observe after the asset caught up is refused 22)", () => {
    expect(plan(DT * 5n).totalObserveCranks).toBe(5);
  });
  it("gap 0 or a read slot behind slot_last: still ONE observe (a refresh needs the accrual in its own tx)", () => {
    expect(plan(0n).totalObserveCranks).toBe(1);
    expect(buildCatchUpAndRefreshIxsV22({ programId: W, market: MKT, marketData, cranker: OWNER, portfolio: P, readSlot: SL - 10n }).totalObserveCranks).toBe(1);
  });
  it("beyond one tx's compute: catch-up-only txs first, the final tx last, counts add up", () => {
    const gap = DT * 100n;
    const p = plan(gap);
    expect(p.totalObserveCranks).toBe(100);
    expect(p.txs.slice(0, -1).every((t) => t.kind === "catchup" && !t.refreshes && t.observeCranks <= MAX_OBSERVES_PER_TX_V22)).toBe(true);
    const last = p.txs[p.txs.length - 1]!;
    expect(last).toMatchObject({ kind: "final", refreshes: true });
    expect(last.observeCranks).toBeLessThanOrEqual(MAX_OBSERVES_WITH_REFRESH_V22);
    expect(p.txs.reduce((s, t) => s + t.observeCranks, 0)).toBe(100);
    expect(cranks(last.instructions as never).length).toBe(last.observeCranks + 1);
    for (const t of p.txs.slice(0, -1)) expect(cranks(t.instructions as never).every((i) => portfolioOf(i).equals(LP))).toBe(true);
  });
  it("the refresh is a tag-5 crank with NO observations; the observes carry the asset", () => {
    const p = plan(DT + 1n, { assets: [0] });
    const c = cranks(p.txs[0]!.instructions as never);
    const dec = c.map((i) => decodePermissionlessCrank(i.data));
    expect(dec[0]!.observations.map((o) => o.assetIndex)).toEqual([0]);
    expect(dec[dec.length - 1]!.observations).toEqual([]);
  });
  it("multi-asset: the OLDEST observed asset sets the gap and every observe carries every asset", () => {
    const sl = f.assets.map((a) => a.slotLast);
    const oldest = sl.reduce((a, b) => (a < b ? a : b));
    const p = buildCatchUpAndRefreshIxsV22({ programId: W, market: MKT, marketData, cranker: OWNER, portfolio: P, readSlot: oldest + DT * 2n, assets: [0, 1, 2, 3, 4] });
    expect(p.gapSlots).toBe(oldest + DT * 2n - oldest);
    expect(p.totalObserveCranks).toBe(2);
    const c = cranks(p.txs[0]!.instructions as never);
    expect(decodePermissionlessCrank(c[0]!.data).observations.map((o) => o.assetIndex)).toEqual([0, 1, 2, 3, 4]);
  });
  it("liquidationCrank adds a second no-observation crank on the target (>3-leg accounts)", () => {
    expect(cranks(plan(10n).txs[0]!.instructions as never)).toHaveLength(2);
    const c = cranks(plan(10n, { liquidationCrank: true }).txs[0]!.instructions as never);
    expect(c).toHaveLength(3);
    expect(portfolioOf(c[2]!).equals(P)).toBe(true);
  });
  it("rejects an asset index outside the market and a non-v2.2 market", () => {
    expect(() => plan(1n, { assets: [9] })).toThrow(/outside the market/);
    expect(() => buildCatchUpAndRefreshIxsV22({ programId: W, market: MKT, marketData: new Uint8Array(100), cranker: OWNER, portfolio: P, readSlot: 1n })).toThrow();
  });
});

describe("buildCatchUpAndRefreshIxsV22 (guard: max_accrual_dt_slots = 0)", () => {
  it("throws when the market's max_accrual_dt_slots is zero", async () => {
    const { resolveMarketGeometry } = await import("../src/abi/layout.js");
    const g = resolveMarketGeometry(marketData, { parser: "test", strictLength: false });
    const patched = new Uint8Array(marketData);
    // OFF_CFG_MAX_ACCRUAL_DT = 118 inside the market config (src/abi/v22-funding.ts)
    new DataView(patched.buffer).setBigUint64(g.groupOff + g.layout.group.config + 118, 0n, true);
    expect(decodeMarketFundingV22(patched).maxAccrualDtSlots).toBe(0n);
    expect(() => buildCatchUpAndRefreshIxsV22({ programId: W, market: MKT, marketData: patched, cranker: OWNER, portfolio: P, readSlot: SL + 10n }))
      .toThrow(/max_accrual_dt_slots is 0/);
  });
});
