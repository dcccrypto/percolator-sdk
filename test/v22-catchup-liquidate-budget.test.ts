/**
 * Liveness of liquidation on stale markets: the CU the final tx asks for must fit its limit, and every planned tx must
 * serialize inside the 1232-byte packet limit. Real market bytes (test/fixtures/v22-q7-devnet-2026-10-12.json).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  buildCatchUpAndRefreshIxsV22, decodeMarketFundingV22, PROGRAM_IDS_DEVNET_V22,
  OBSERVE_CRANK_CU_V22, REFRESH_AND_LIQUIDATE_CU_V22, CATCHUP_TX_COMPUTE_UNITS_V22,
} from "../src/index.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-q7-devnet-2026-10-12.json", import.meta.url), "utf8")) as { market: string; portfolio: string; lp: string; owner: string; accounts: { market: string } };
const marketData = new Uint8Array(Buffer.from(FX.accounts.market, "base64"));
const W = new PublicKey(PROGRAM_IDS_DEVNET_V22.percolator), MKT = new PublicKey(FX.market), P = new PublicKey(FX.portfolio), LP = new PublicKey(FX.lp), OWNER = new PublicKey(FX.owner);
const f = decodeMarketFundingV22(marketData);
const DT = f.maxAccrualDtSlots;
const SL = f.assets[0]!.slotLast;
const plan = (gap: bigint, extra: Record<string, unknown> = {}) => buildCatchUpAndRefreshIxsV22({ programId: W, market: MKT, marketData, cranker: OWNER, portfolio: P, observePortfolio: LP, readSlot: SL + gap, ...extra });

const sizeOf = (ixs: Parameters<Transaction["add"]>) => {
  const tx = new Transaction({ feePayer: OWNER, recentBlockhash: Keypair.generate().publicKey.toBase58() });
  tx.add(...ixs);
  return tx.serializeMessage().length + 1 + 64; // message + sig count + one signature
};
/** Worst-case CU of a tx: observes at OBSERVE_CRANK_CU_V22 each, each refresh at the full REFRESH_AND_LIQUIDATE_CU_V22. */
const cuOf = (t: { observeCranks: number; refreshes: boolean }, refreshIxs: number) =>
  t.observeCranks * OBSERVE_CRANK_CU_V22 + (t.refreshes ? refreshIxs * REFRESH_AND_LIQUIDATE_CU_V22 : 0);

describe("catch-up plan budgets", () => {
  it("every planned tx serializes within 1232 bytes (legacy message, real payer + blockhash)", () => {
    for (const gap of [0n, DT, DT * 7n, DT * 8n, DT * 100n, DT * 500n]) {
      for (const liquidationCrank of [false, true]) {
        for (const t of plan(gap, { liquidationCrank, vaultLpCounterparty: Keypair.generate().publicKey }).txs) {
          expect(sizeOf(t.instructions as never)).toBeLessThanOrEqual(1232);
        }
      }
    }
  });
  it("liquidationCrank: no tx asks for more worst-case CU than its limit", () => {
    for (const gap of [0n, DT * 3n, DT * 100n]) {
      const p = plan(gap, { liquidationCrank: true });
      for (const t of p.txs) {
        const refreshIxs = t.instructions.filter((i) => (i.data as Uint8Array)[9] === 0).length;
        expect(cuOf(t, refreshIxs)).toBeLessThanOrEqual(CATCHUP_TX_COMPUTE_UNITS_V22);
      }
    }
  });
  it("liquidationCrank: the second refresh is a tx after the first one, and the plan still ends with a refresh", () => {
    const p = plan(DT * 3n, { liquidationCrank: true });
    expect(p.txs.length).toBe(2);
    expect(p.txs[p.txs.length - 1]).toMatchObject({ kind: "final", refreshes: true, observeCranks: 0 });
  });
  it("duplicate assets are deduped (they would only bloat every crank)", () => {
    const a = plan(DT + 1n, { assets: [0, 0, 1, 1] }).txs[0]!.instructions[2]!;
    const b = plan(DT + 1n, { assets: [0, 1] }).txs[0]!.instructions[2]!;
    expect(Buffer.from(a.data)).toEqual(Buffer.from(b.data));
  });
});
