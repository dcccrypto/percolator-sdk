/**
 * Security regression PoC — SDK V22 resolved receipt false-negative.
 * Reproduces current b554d95da14b9e4317fe36371c9a1e95e13d22d4.
 *
 * Run from the repository root after saving as test/v22-resolved-receipt-filter.security.test.ts:
 * pnpm exec vitest run test/v22-resolved-receipt-filter.security.test.ts --reporter=verbose
 *
 * EXPECTED UNPATCHED: 1 intentionally failing RED test, 2 passing controls.
 * EXPECTED PATCHED:   6 passing tests, including mixed-layout and RPC-failure controls.
 *
 * No actual RPC requests or state-changing operations are performed.
 */
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { LAYOUT_V21, LAYOUT_V22, type LayoutTable } from "../src/abi/layout.js";
import {
  decodeResolvedPayoutReceiptP3,
  listOpenResolvedReceiptsP3,
} from "../src/solana/p3-vault-lp.js";
import { stampPortfolio } from "./helpers/stamp.js";

const programId = Keypair.generate().publicKey;
const market = Keypair.generate().publicKey;
const owner = Keypair.generate().publicKey;
const portfolio = Keypair.generate().publicKey;

function portfolioWithOpenReceipt(layout: LayoutTable): Uint8Array {
  const data = stampPortfolio(new Uint8Array(layout.portfolio.accountLen), layout.version);
  data.set(market.toBytes(), 16);
  data.set(owner.toBytes(), 80);
  const rec = layout.portfolio.resolvedPayoutReceiptOff;
  new DataView(data.buffer).setBigUint64(rec + 48, 777n, true);
  data[rec + 64] = 1; // present
  data[rec + 65] = 0; // not finalized
  return data;
}

/** Mock applies the actual dataSize filter; unlike the existing P3 test mock. */
function rpcWithOnePortfolio(data: Uint8Array) {
  const observed: number[] = [];
  const conn = {
    async getProgramAccounts(_program: PublicKey, options: { filters?: Array<{ dataSize?: number; memcmp?: { offset: number; bytes: string } }> }) {
      const filters = options.filters ?? [];
      const size = filters.find((x) => x.dataSize !== undefined)?.dataSize;
      if (size !== undefined) observed.push(size);
      const marketFilter = filters.find((x) => x.memcmp?.offset === 16)?.memcmp;
      if (size !== data.length || (marketFilter && marketFilter.bytes !== market.toBase58())) return [];
      return [{ pubkey: portfolio, account: { data: Buffer.from(data) } }];
    },
  };
  return { conn: conn as unknown as Parameters<typeof listOpenResolvedReceiptsP3>[0], observed };
}

describe("SDK V22 resolved-receipt discovery: dataSize filter", () => {
  it("RED — default discovery must not silently omit a VERSION-19 open receipt", async () => {
    const data = portfolioWithOpenReceipt(LAYOUT_V22);
    expect(LAYOUT_V22.portfolio.accountLen).toBe(10_607);
    expect(decodeResolvedPayoutReceiptP3(data).open).toBe(true); // receipt is provably present
    const { conn, observed } = rpcWithOnePortfolio(data);
    const results = await listOpenResolvedReceiptsP3(conn, programId, market);
    // CURRENT RESULT: observed [9563], results []; this assertion FAILS on unfixed HEAD.
    expect(observed).toContain(LAYOUT_V22.portfolio.accountLen);
    expect(results.map((r) => r.portfolio.toBase58())).toContain(portfolio.toBase58());
  });

  it("POSITIVE CONTROL — explicit LAYOUT_V22 finds the same open receipt", async () => {
    const data = portfolioWithOpenReceipt(LAYOUT_V22);
    const { conn, observed } = rpcWithOnePortfolio(data);
    const results = await listOpenResolvedReceiptsP3(conn, programId, market, LAYOUT_V22);
    expect(observed).toEqual([10_607]);
    expect(results).toHaveLength(1);
    expect(results[0]!.receipt).toMatchObject({ present: true, finalized: false, open: true, paidEffective: 777n });
  });

  it("NEGATIVE CONTROL — V21 legacy behavior still correctly finds a V21 receipt", async () => {
    const data = portfolioWithOpenReceipt(LAYOUT_V21);
    const { conn, observed } = rpcWithOnePortfolio(data);
    const results = await listOpenResolvedReceiptsP3(conn, programId, market);
    expect(observed).toEqual([9_563, 10_607]);
    expect(results).toHaveLength(1);
    expect(results[0]!.receipt.open).toBe(true);
  });
  it("EXPLICIT V21 — preserves the old single-query behavior", async () => {
    const data = portfolioWithOpenReceipt(LAYOUT_V21);
    const { conn, observed } = rpcWithOnePortfolio(data);
    const rows = await listOpenResolvedReceiptsP3(conn, programId, market, LAYOUT_V21);
    expect(observed).toEqual([9_563]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.receipt.open).toBe(true);
  });

  it("MIXED V21/V22 — default discovery returns open receipts of both layouts", async () => {
    const p21 = Keypair.generate().publicKey;
    const p22 = Keypair.generate().publicKey;
    const v21 = portfolioWithOpenReceipt(LAYOUT_V21);
    const v22 = portfolioWithOpenReceipt(LAYOUT_V22);
    const requests: number[] = [];
    const conn = {
      async getProgramAccounts(_program: PublicKey, options: { filters?: Array<{ dataSize?: number }> }) {
        const n = options.filters?.find((f) => f.dataSize !== undefined)?.dataSize;
        if (n !== undefined) requests.push(n);
        if (n === v21.length) return [{ pubkey: p21, account: { data: Buffer.from(v21) } }];
        if (n === v22.length) return [{ pubkey: p22, account: { data: Buffer.from(v22) } }];
        return [];
      },
    } as unknown as Parameters<typeof listOpenResolvedReceiptsP3>[0];
    const rows = await listOpenResolvedReceiptsP3(conn, programId, market);
    expect(requests).toEqual([9_563, 10_607]);
    expect(rows.map((r) => r.portfolio.toBase58()).sort()).toEqual([p21, p22].map((p) => p.toBase58()).sort());
  });

  it("FAIL CLOSED — second layout RPC error must not become a false empty result", async () => {
    const conn = {
      async getProgramAccounts(_program: PublicKey, options: { filters?: Array<{ dataSize?: number }> }) {
        const n = options.filters?.find((f) => f.dataSize !== undefined)?.dataSize;
        if (n === LAYOUT_V22.portfolio.accountLen) throw new Error("injected V22 RPC failure");
        return [];
      },
    } as unknown as Parameters<typeof listOpenResolvedReceiptsP3>[0];
    await expect(listOpenResolvedReceiptsP3(conn, programId, market)).rejects.toThrow("injected V22 RPC failure");
  });

});
