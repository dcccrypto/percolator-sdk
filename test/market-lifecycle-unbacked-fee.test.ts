/**
 * planCloseSlabAttempt vs prog bc657392 (`src/v16_program.rs`) when the fee legs are NOT backed.
 *
 * CloseSlab refuses for owed fees only while they are still backed by the unbudgeted insurance pool:
 *   close_refused_for_fees(outstanding, pool) = min(outstanding, pool) > 0      (:14084)
 *   pool = insurance − source_reserved − budget_remaining_total − rent_unrouted (:26205-26218)
 * so with pool == 0 a Resolved, empty market closes with fees still "owed" (the comment at :26204 says the
 * unbacked remainder "must not wedge the close forever").
 *
 * But the fee claims themselves refuse at pool == 0:
 *   tag 84: protocol_fee_withdraw_amount → transfer = min(requested, pool, vault) == 0 → EngineLockActive (:48489)
 *   tag 90: amount > 0 (:24397) and withdraw_insurance_surplus_not_atomic(amount) needs surplus ≥ amount
 *           (engine percolator ebd4636d src/v16.rs:12218-12233: surplus also excludes rent_unrouted, so it equals
 *           CloseSlab's pool; amount > surplus → LockActive)
 * The planner puts 84/90 in the SAME transaction as tag 13, so one failing claim sinks the close: the app's
 * "retire market" button always fails although the program would retire the market. The AdminSigned
 * throw is likewise wrong at pool == 0 (CloseSlab does not refuse 71 there).
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  planCloseSlabAttempt,
  planPayeeGraceCloseSequenceV22,
  type CloseSlabAttemptArgs,
} from "../src/solana/market-lifecycle.js";

const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
const pk = (): PublicKey => Keypair.generate().publicKey;
const tags = (ixs: { data: Uint8Array }[]) => ixs.map((i) => i.data[0]);

const base: CloseSlabAttemptArgs = {
  programId: W, market: pk(), vaultToken: pk(), closer: pk(), closerDestToken: pk(),
  closeAuthorityEpoch: 2n, hasLpVault: false,
};
const fee = { authority: pk(), destToken: pk(), authorityEpoch: 5n, owed: 100n };
const payeeLeg = { assetIndex: 0, route: "Payee" as const, owed: 40n, authorityEpoch: 1n, payee: pk(), vaultMint: pk() };

describe("planCloseSlabAttempt with an unbacked fee pool (feeBackingAtoms = 0)", () => {
  it("drops tag 84: the program would refuse it (transfer 0 → EngineLockActive) and sink the CloseSlab", () => {
    expect(tags(planCloseSlabAttempt({ ...base, protocolFee: fee, feeBackingAtoms: 0n }))).toEqual([13]);
  });

  it("drops the payee claim (tag 90) for the same reason", () => {
    const ixs = planCloseSlabAttempt({ ...base, protocolFee: fee, creatorFees: [payeeLeg], feeBackingAtoms: 0n });
    expect(tags(ixs)).toEqual([13]);
  });

  it("does not throw for an AdminSigned pot: CloseSlab does not refuse 71 when nothing backs it", () => {
    const ixs = planCloseSlabAttempt({
      ...base,
      creatorFees: [{ assetIndex: 3, route: "AdminSigned", owed: 9n, authorityEpoch: 0n }],
      feeBackingAtoms: 0n,
    });
    expect(tags(ixs)).toEqual([13]);
  });

  it("keeps the insurance re-credit leg (tag 41 is a budget payout, not a fee leg)", () => {
    const ixs = planCloseSlabAttempt({
      ...base, protocolFee: fee, feeBackingAtoms: 0n,
      insuranceRecredit: { authority: pk(), destToken: pk(), amount: 5n },
    });
    expect(tags(ixs)).toEqual([41, 13]);
  });

  it("payee-grace tx2 drops its tag 84 too", () => {
    const [tx1, tx2] = planPayeeGraceCloseSequenceV22({ ...base, protocolFee: fee, creatorFees: [payeeLeg], feeBackingAtoms: 0n });
    expect(tags(tx1)).toEqual([13]);
    expect(tags(tx2)).toEqual([13]);
  });
});

describe("unchanged when the pool backs the fees or the caller does not pass it", () => {
  it("feeBackingAtoms > 0 keeps every leg", () => {
    expect(tags(planCloseSlabAttempt({ ...base, protocolFee: fee, creatorFees: [payeeLeg], feeBackingAtoms: 1n }))).toContain(84);
    expect(tags(planCloseSlabAttempt({ ...base, protocolFee: fee, creatorFees: [payeeLeg], feeBackingAtoms: 1n }))).toContain(90);
    expect(() => planCloseSlabAttempt({
      ...base, feeBackingAtoms: 1n,
      creatorFees: [{ assetIndex: 3, route: "AdminSigned", owed: 9n, authorityEpoch: 0n }],
    })).toThrow(/asset 3 owes 9/);
  });
  it("omitted feeBackingAtoms = previous behaviour", () => {
    expect(tags(planCloseSlabAttempt({ ...base, protocolFee: fee }))).toEqual([84, 13]);
  });
  it("rejects a negative feeBackingAtoms", () => {
    expect(() => planCloseSlabAttempt({ ...base, protocolFee: fee, feeBackingAtoms: -1n })).toThrow(/feeBackingAtoms/);
  });
});
