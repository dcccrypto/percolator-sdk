/**
 * Tag 44 reduce-only exit + CloseSlab retirement plan. Wire/accounts verified against
 * the deployed wrapper 6377376a (decode arms 13/41/44/84; handle_rebalance_reduce →
 * with_one_portfolio_view; handle_close_slab; handle_withdraw_insurance).
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import {
  buildRebalanceReduceIx,
  planReduceOnlyExit,
  planCloseSlabAttempt,
  planPayeeGraceCloseSequenceV22,
  type CloseSlabAttemptArgs,
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

  it("rejects a Token-2022 tokenProgram (TransferFee mints would mis-account the vault); classic is fine", () => {
    const t22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    expect(() => planCloseSlabAttempt({ ...base, tokenProgram: t22 })).toThrow(/classic SPL Token program/);
    expect(() => planCloseSlabAttempt({ ...base, tokenProgram: TOKEN_PROGRAM_ID })).not.toThrow();
  });

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

// ---- creator-fee legs + payee-grace sequence ----
const cfMarket = pk(), cfVaultToken = pk(), cfCloser = pk(), cfCloserDest = pk();
const payee = pk(), vaultMint = pk();
const base: CloseSlabAttemptArgs = { programId: W, market: cfMarket, vaultToken: cfVaultToken, closer: cfCloser, closerDestToken: cfCloserDest, closeAuthorityEpoch: 2n, hasLpVault: false };
const fee = { authority: pk(), destToken: pk(), authorityEpoch: 5n, owed: 100n };
const tags = (ixs: { data: Uint8Array }[]) => ixs.map((i) => i.data[0]);

describe("planCloseSlabAttempt creator-fee legs", () => {
  it("skips legs with owed <= 0 and Refused legs", () => {
    const ixs = planCloseSlabAttempt({
      ...base,
      creatorFees: [
        { assetIndex: 0, route: "Payee", owed: 0n, authorityEpoch: 0n },
        { assetIndex: 1, route: "Refused", owed: 9n, authorityEpoch: 0n },
      ],
    });
    expect(tags(ixs)).toEqual([13]);
  });

  it("skips a Payee leg once the grace is over (no tag 90)", () => {
    const ixs = planCloseSlabAttempt({
      ...base,
      payeeGraceOver: true,
      creatorFees: [{ assetIndex: 0, route: "Payee", owed: 9n, authorityEpoch: 0n, payee, vaultMint }],
    });
    expect(tags(ixs)).toEqual([13]);
  });

  it("still throws AdminSigned after grace-over (grace only skips Payee)", () => {
    expect(() =>
      planCloseSlabAttempt({
        ...base,
        payeeGraceOver: true,
        creatorFees: [{ assetIndex: 3, route: "AdminSigned", owed: 9n, authorityEpoch: 0n }],
      }),
    ).toThrow(/asset 3 owes 9/);
  });

  it("requires payee and vaultMint on a Payee leg", () => {
    const leg = { assetIndex: 2, route: "Payee" as const, owed: 9n, authorityEpoch: 0n };
    expect(() => planCloseSlabAttempt({ ...base, creatorFees: [{ ...leg, vaultMint }] })).toThrow(/pass payee and vaultMint/);
    expect(() => planCloseSlabAttempt({ ...base, creatorFees: [{ ...leg, payee }] })).toThrow(/pass payee and vaultMint/);
  });

  it("rejects a claim amount that is non-positive or above owed", () => {
    const leg = { assetIndex: 0, route: "Payee" as const, owed: 9n, authorityEpoch: 0n, payee, vaultMint };
    expect(() => planCloseSlabAttempt({ ...base, creatorFees: [{ ...leg, amount: 0n }] })).toThrow(/must be in \(0, 9\]/);
    expect(() => planCloseSlabAttempt({ ...base, creatorFees: [{ ...leg, amount: 10n }] })).toThrow(/must be in \(0, 9\]/);
  });

  it("accepts a partial amount and defaults to owed", () => {
    const leg = { assetIndex: 0, route: "Payee" as const, owed: 9n, authorityEpoch: 0n, payee, vaultMint };
    const partial = planCloseSlabAttempt({ ...base, creatorFees: [{ ...leg, amount: 4n }] });
    const full = planCloseSlabAttempt({ ...base, creatorFees: [leg] });
    expect(partial.length).toBe(full.length);
    expect(tags(partial).at(-1)).toBe(13);
    expect(tags(partial)).toContain(90);
    expect(Buffer.from(partial[partial.length - 2].data).equals(Buffer.from(full[full.length - 2].data))).toBe(false);
  });

  it("uses an explicit classic tokenProgram and rejects any other program", () => {
    const ixs = planCloseSlabAttempt({ ...base, tokenProgram: TOKEN_PROGRAM_ID });
    expect(ixs[0].keys.some((k) => k.pubkey.equals(TOKEN_PROGRAM_ID))).toBe(true);
    expect(() => planCloseSlabAttempt({ ...base, tokenProgram: pk() })).toThrow(/classic SPL Token program/);
  });

  it("ignores insuranceRecredit with amount 0 and omits the ledger key when absent", () => {
    expect(tags(planCloseSlabAttempt({ ...base, insuranceRecredit: { authority: pk(), destToken: pk(), amount: 0n } }))).toEqual([13]);
    const ixs = planCloseSlabAttempt({ ...base, insuranceRecredit: { authority: pk(), destToken: pk(), amount: 5n } });
    expect(tags(ixs)).toEqual([41, 13]);
    expect(ixs[0].keys.length).toBe(6);
  });
});

describe("planPayeeGraceCloseSequenceV22", () => {
  const payeeLeg = { assetIndex: 0, route: "Payee" as const, owed: 40n, authorityEpoch: 1n, payee, vaultMint };

  it("requires protocolFee", () => {
    expect(() => planPayeeGraceCloseSequenceV22({ ...base, creatorFees: [payeeLeg] })).toThrow(/pass protocolFee/);
  });

  it("throws when there is no unpaid payee pot", () => {
    expect(() => planPayeeGraceCloseSequenceV22({ ...base, protocolFee: fee })).toThrow(/no unpaid payee pot/);
    expect(() =>
      planPayeeGraceCloseSequenceV22({
        ...base,
        protocolFee: fee,
        creatorFees: [
          { ...payeeLeg, owed: 0n },
          { assetIndex: 1, route: "Refused", owed: 7n, authorityEpoch: 0n },
        ],
      }),
    ).toThrow(/no unpaid payee pot/);
  });

  it("returns [tx1: 84,41,13 without tag 90] and [tx2: 84 for the re-booked sum, 13]", () => {
    const [tx1, tx2] = planPayeeGraceCloseSequenceV22({
      ...base,
      protocolFee: fee,
      insuranceRecredit: { authority: pk(), destToken: pk(), amount: 3n },
      creatorFees: [
        payeeLeg,
        { ...payeeLeg, assetIndex: 1, owed: 2n },
        { assetIndex: 2, route: "Refused", owed: 99n, authorityEpoch: 0n },
      ],
    });
    expect(tags(tx1)).toEqual([84, 41, 13]);
    expect(tags(tx2)).toEqual([84, 13]);
    // tx2 keeps the protocol authority epoch (u128 amount 0 then epoch)
    expect(tx2[0].data.length).toBe(1 + 16 + 8);
    expect(new DataView(tx2[0].data.buffer, tx2[0].data.byteOffset).getBigUint64(17, true)).toBe(5n);
  });

  it("tx1 is just CloseSlab when no protocol fee is owed yet", () => {
    const [tx1, tx2] = planPayeeGraceCloseSequenceV22({
      ...base,
      protocolFee: { ...fee, owed: 0n },
      creatorFees: [payeeLeg],
    });
    expect(tags(tx1)).toEqual([13]);
    expect(tags(tx2)).toEqual([84, 13]);
  });
});
