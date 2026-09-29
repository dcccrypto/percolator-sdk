/**
 * Tag 44 reduce-only exit + CloseSlab retirement plan. Wire/accounts verified against
 * the deployed wrapper 6377376a (decode arms 13/41/44/84; handle_rebalance_reduce →
 * with_one_portfolio_view; handle_close_slab; handle_withdraw_insurance).
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import {
  buildRebalanceReduceIx,
  planReduceOnlyExit,
  planCloseSlabAttempt,
  isClosedMarketTombstone,
  V17_KIND_CLOSED_MARKET,
} from "../src/solana/market-lifecycle.js";
import { deriveVaultAuthority } from "../src/solana/pda.js";
import { parsePortfolioV17 } from "../src/solana/slab.js";

const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
const pk = (): PublicKey => Keypair.generate().publicKey;

describe("tag 44 RebalanceReduce", () => {
  it("encodes tag 44 + portfolio_id u64 + position_epoch u64 + asset u16 + reduce_q u128 (35 B), 3 accounts", () => {
    const owner = pk(), market = pk(), portfolio = pk();
    const ix = buildRebalanceReduceIx({ programId: W, owner, market, portfolio, portfolioId: 7n, positionEpoch: 3n, assetIndex: 0, reduceQ: 296986477n });
    expect(ix.data.length).toBe(35);
    expect(ix.data[0]).toBe(44);
    const v = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
    expect(v.getBigUint64(1, true)).toBe(7n);
    expect(v.getBigUint64(9, true)).toBe(3n);
    expect(v.getUint16(17, true)).toBe(0);
    expect(v.getBigUint64(19, true)).toBe(296986477n);
    expect(ix.keys).toEqual([
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: portfolio, isSigner: false, isWritable: true },
    ]);
    expect(() => buildRebalanceReduceIx({ programId: W, owner, market, portfolio, portfolioId: 7n, positionEpoch: 3n, assetIndex: 0, reduceQ: 0n })).toThrow();
  });
  it("planReduceOnlyExit reads a real v18 portfolio (devnet fixture) and reduces the whole leg", () => {
    const fx = JSON.parse(readFileSync(new URL("./fixtures/portfolio-v18-active-leg.json", import.meta.url), "utf8")) as { dataBase64: string };
    const data = new Uint8Array(Buffer.from(fx.dataBase64, "base64"));
    const p = parsePortfolioV17(data);
    const leg = p.legs.find((l) => l.active)!;
    const owner = p.owner, market = pk(), portfolio = pk();
    const plan = planReduceOnlyExit(W, owner, market, portfolio, data, leg.assetIndex);
    expect(plan).not.toBeNull();
    expect(plan!.reduceQ).toBe(leg.basisPosQ < 0n ? -leg.basisPosQ : leg.basisPosQ);
    expect(plan!.side).toBe(leg.basisPosQ > 0n ? "long" : "short");
    const v = new DataView(plan!.ix.data.buffer, plan!.ix.data.byteOffset, plan!.ix.data.byteLength);
    expect(v.getBigUint64(1, true)).toBe(p.portfolioId);
    expect(v.getBigUint64(9, true)).toBe(p.matcherPositionEpoch);
    expect(planReduceOnlyExit(W, owner, market, portfolio, data, 5)).toBeNull();
  });
});

describe("CloseSlab retirement plan", () => {
  const market = pk(), vaultToken = pk(), closer = pk(), closerDestToken = pk();
  const fee = { authority: pk(), destToken: pk(), authorityEpoch: 0n, owed: 9_720_000n };
  const base = { programId: W, market, vaultToken, closer, closerDestToken, closeAuthorityEpoch: 2n, hasLpVault: false };

  it("orders 84 (amount 0) → 41 (re-credited amount) → 13 in one attempt", () => {
    const ledger = pk();
    const ixs = planCloseSlabAttempt({ ...base, protocolFee: fee, insuranceRecredit: { authority: pk(), destToken: pk(), amount: 123n, ledger } });
    expect(ixs.map((i) => i.data[0])).toEqual([84, 41, 13]);
    // 84: amount 0 = all, plus the protocol-fee authority epoch
    expect(ixs[0].data.length).toBe(1 + 16 + 8);
    expect(ixs[0].data.subarray(1, 17).every((b) => b === 0)).toBe(true);
    // 41: amount u128, optional ledger appended at [6]
    expect(ixs[1].data.length).toBe(17);
    expect(new DataView(ixs[1].data.buffer, ixs[1].data.byteOffset).getBigUint64(1, true)).toBe(123n);
    expect(ixs[1].keys.length).toBe(7);
    expect(ixs[1].keys[6].pubkey.equals(ledger)).toBe(true);
    // 13: authority_epoch, [dest(signer), slab, vault, vaultAuthority, destAta, tokenProgram]
    expect(ixs[2].data.length).toBe(9);
    expect(ixs[2].keys[0]).toEqual({ pubkey: closer, isSigner: true, isWritable: true });
    expect(ixs[2].keys[3].pubkey.equals(deriveVaultAuthority(W, market)[0])).toBe(true);
  });
  it("skips 84 when nothing is owed and 41 when nothing was re-credited", () => {
    expect(planCloseSlabAttempt({ ...base, protocolFee: { ...fee, owed: 0n } }).map((i) => i.data[0])).toEqual([13]);
    expect(planCloseSlabAttempt({ ...base, protocolFee: fee }).map((i) => i.data[0])).toEqual([84, 13]);
  });
  it("refuses a market with an Earn LP vault (never retirable; rent unrecoverable)", () => {
    expect(() => planCloseSlabAttempt({ ...base, hasLpVault: true })).toThrow(/never retire/);
  });
  it("isClosedMarketTombstone: 16-byte header with kind 8 (or gone) = retired; a full market = not retired", () => {
    const tomb = new Uint8Array(16);
    tomb[10] = V17_KIND_CLOSED_MARKET;
    expect(isClosedMarketTombstone(tomb)).toBe(true);
    expect(isClosedMarketTombstone(null)).toBe(true);
    const live = new Uint8Array(24600);
    live[10] = 1;
    expect(isClosedMarketTombstone(live)).toBe(false);
    const wrongKind = new Uint8Array(16);
    wrongKind[10] = 1;
    expect(isClosedMarketTombstone(wrongKind)).toBe(false);
  });
});
