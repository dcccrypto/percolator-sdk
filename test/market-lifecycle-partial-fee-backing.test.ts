/**
 * planCloseSlabAttempt when the unbudgeted insurance pool backs the fee legs only PARTIALLY.
 *
 * Tag 84 and tag 90 draw from the same pool, and the planner puts both in the CloseSlab transaction:
 *   tag 84 (amount 0 = all): transfer = min(owed, pool, vault), paid via withdraw_insurance_surplus_not_atomic, which
 *     lowers `insurance` and so the pool (prog v16_program.rs handle_withdraw_protocol_fee, engine v16.rs
 *     withdraw_insurance_surplus_delta);
 *   tag 90: EXACT debit, no partial fill: amount > remaining surplus → EngineLockActive ("the protocol/LP/stake legs
 *     draw from the same pool", handle_withdraw_creator_fee doc).
 * So with pool 100, protocol owed 100 and a payee pot of 40, [84, ATA, 90, 13] always fails at tag 90, although
 * [84, 13] closes: after tag 84 the pool is 0 and CloseSlab no longer refuses (min(outstanding, 0) == 0).
 * The planner must spend `feeBackingAtoms` in order: tag 84 takes min(owed, backing), then each payee claim is capped
 * at what is left, and a leg with nothing left is treated like the fully unbacked case.
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { planCloseSlabAttempt, planPayeeGraceCloseSequenceV22, type CloseSlabAttemptArgs } from "../src/solana/market-lifecycle.js";

const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
const pk = (): PublicKey => Keypair.generate().publicKey;
const own = (ixs: TransactionInstruction[]) => ixs.filter((i) => i.programId.equals(W));
const tags = (ixs: TransactionInstruction[]) => own(ixs).map((i) => i.data[0]);
const u128 = (d: Uint8Array, o: number) => {
  const b = Buffer.from(d);
  return b.readBigUInt64LE(o) + (b.readBigUInt64LE(o + 8) << 64n);
};
const tag90Amounts = (ixs: TransactionInstruction[]) => own(ixs).filter((i) => i.data[0] === 90).map((i) => u128(i.data, 1));

const base: CloseSlabAttemptArgs = {
  programId: W, market: pk(), vaultToken: pk(), closer: pk(), closerDestToken: pk(),
  closeAuthorityEpoch: 2n, hasLpVault: false,
};
const fee = { authority: pk(), destToken: pk(), authorityEpoch: 5n, owed: 100n };
const payee = (assetIndex: number, owed: bigint, amount?: bigint) => ({
  assetIndex, route: "Payee" as const, owed, authorityEpoch: 1n, payee: pk(), vaultMint: pk(), ...(amount === undefined ? {} : { amount }),
});

describe("planCloseSlabAttempt with a partially backed fee pool", () => {
  it("drops tag 90 when tag 84 spends the whole pool (pool 100, protocol 100, payee 40)", () => {
    const ixs = planCloseSlabAttempt({ ...base, protocolFee: fee, creatorFees: [payee(0, 40n)], feeBackingAtoms: 100n });
    expect(tags(ixs)).toEqual([84, 13]);
    expect(ixs).toHaveLength(2); // no orphan payee-ATA create either
  });

  it("caps the payee claim at what tag 84 leaves (pool 120 → tag 90 of 20)", () => {
    const ixs = planCloseSlabAttempt({ ...base, protocolFee: fee, creatorFees: [payee(0, 40n)], feeBackingAtoms: 120n });
    expect(tags(ixs)).toEqual([84, 90, 13]);
    expect(tag90Amounts(ixs)).toEqual([20n]);
  });

  it("keeps the full claim when the pool backs everything (pool 140)", () => {
    const ixs = planCloseSlabAttempt({ ...base, protocolFee: fee, creatorFees: [payee(0, 40n)], feeBackingAtoms: 140n });
    expect(tag90Amounts(ixs)).toEqual([40n]);
  });

  it("spends the remainder across payee legs in order and drops the ones left unbacked", () => {
    const ixs = planCloseSlabAttempt({
      ...base, protocolFee: fee, feeBackingAtoms: 130n,
      creatorFees: [payee(0, 20n), payee(1, 20n), payee(2, 20n)],
    });
    expect(tag90Amounts(ixs)).toEqual([20n, 10n]);
    expect(tags(ixs)).toEqual([84, 90, 90, 13]);
  });

  it("keeps an explicit smaller amount that fits", () => {
    const ixs = planCloseSlabAttempt({ ...base, protocolFee: fee, creatorFees: [payee(0, 40n, 15n)], feeBackingAtoms: 120n });
    expect(tag90Amounts(ixs)).toEqual([15n]);
  });

  it("payee-only pot larger than the pool claims the pool (no tag 84 owed)", () => {
    const ixs = planCloseSlabAttempt({ ...base, creatorFees: [payee(0, 40n)], feeBackingAtoms: 25n });
    expect(tags(ixs)).toEqual([90, 13]);
    expect(tag90Amounts(ixs)).toEqual([25n]);
  });

  it("does not throw for an AdminSigned pot that tag 84 left unbacked, but still throws while it is backed", () => {
    const admin = { assetIndex: 3, route: "AdminSigned" as const, owed: 9n, authorityEpoch: 0n };
    expect(tags(planCloseSlabAttempt({ ...base, protocolFee: fee, creatorFees: [admin], feeBackingAtoms: 100n }))).toEqual([84, 13]);
    expect(() => planCloseSlabAttempt({ ...base, protocolFee: fee, creatorFees: [admin], feeBackingAtoms: 101n })).toThrow(/asset 3 owes 9/);
  });

  it("tag 41 is a budget payout and does not consume the fee backing", () => {
    const ixs = planCloseSlabAttempt({
      ...base, protocolFee: fee, creatorFees: [payee(0, 40n)], feeBackingAtoms: 140n,
      insuranceRecredit: { authority: pk(), destToken: pk(), amount: 50n },
    });
    expect(tags(ixs)).toEqual([84, 41, 90, 13]);
    expect(tag90Amounts(ixs)).toEqual([40n]);
  });

  it("payee-grace tx2 only claims what tx1's tag 84 left in the pool", () => {
    const leg = { ...payee(0, 40n) };
    const [a1, a2] = planPayeeGraceCloseSequenceV22({ ...base, protocolFee: fee, creatorFees: [leg], feeBackingAtoms: 100n });
    expect(tags(a1)).toEqual([84, 13]);
    expect(tags(a2)).toEqual([13]); // tx1's tag 84 spent the whole pool; a tx2 tag 84 would transfer 0 → EngineLockActive
    const [b1, b2] = planPayeeGraceCloseSequenceV22({ ...base, protocolFee: fee, creatorFees: [leg], feeBackingAtoms: 120n });
    expect(tags(b1)).toEqual([84, 13]);
    expect(tags(b2)).toEqual([84, 13]);
  });

  it("omitted feeBackingAtoms keeps the previous plan (no cap)", () => {
    const ixs = planCloseSlabAttempt({ ...base, protocolFee: fee, creatorFees: [payee(0, 40n)] });
    expect(tags(ixs)).toEqual([84, 90, 13]);
    expect(tag90Amounts(ixs)).toEqual([40n]);
  });
});
