/**
 * planCloseSlabAttempt vs prog rc23 5386dd94 (`src/v16_program.rs`) when the fee legs are NOT backed.
 *
 * CloseSlab refuses for owed fees only while they are still backed by the unbudgeted insurance pool:
 *   close_refused_for_fees(outstanding, pool) = min(outstanding, pool) > 0      (:14105-14107, refusal :26287-26291)
 *   pool = insurance − source_reserved − budget_remaining_total − rent_unrouted (:26273-26286)
 * so with pool == 0 a Resolved, empty market closes with fees still "owed" (the comment at :26272 says the
 * unbacked remainder "must not wedge the close forever").
 *
 * But the fee claims themselves refuse at pool == 0:
 *   tag 84: protocol_fee_withdraw_amount → transfer = min(requested, pool, vault) == 0 → EngineLockActive (:48630-48633)
 *   tag 90: amount > 0 (:24465) and withdraw_insurance_surplus_not_atomic(amount) needs surplus ≥ amount
 *           (engine percolator 282d7dc2 src/v16.rs:15303-15313, :15352: surplus also excludes rent_unrouted, so it
 *           equals CloseSlab's pool; amount > surplus → LockActive)
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
    // tag 84 spends min(owed, pool) first, so tag 90 needs pool > protocol owed (see market-lifecycle-partial-fee-backing).
    expect(tags(planCloseSlabAttempt({ ...base, protocolFee: fee, creatorFees: [payeeLeg], feeBackingAtoms: 101n }))).toContain(90);
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

// tag 90 data: [tag u8][amount u128 LE][asset u16 LE]...
const progIxs = (ixs: { programId: PublicKey; data: Uint8Array }[]) => ixs.filter((i) => i.programId.equals(W));
const claim90 = (ixs: { programId: PublicKey; data: Uint8Array }[]) => progIxs(ixs).filter((i) => i.data[0] === 90).map((i) => {
  let v = 0n; for (let k = 16; k >= 1; k--) v = (v << 8n) | BigInt(i.data[k]);
  return { asset: i.data[17] | (i.data[18] << 8), amount: v };
});

describe("partly backed pool: the plan must leave nothing backed and owed (rc23 :26287-26291)", () => {
  const P = { route: "Payee" as const, authorityEpoch: 0n, payee: pk(), vaultMint: pk() };

  it("a caller amount below what the pool backs is raised, else CloseSlab refuses 71 (diff case 2: pool 7729, owed 173, amount 161)", () => {
    const ixs = planCloseSlabAttempt({ ...base, feeBackingAtoms: 7729n, creatorFees: [{ ...P, assetIndex: 1, owed: 173n, amount: 161n }] });
    expect(claim90(ixs)).toEqual([{ asset: 1, amount: 173n }]);
  });

  it("a caller amount is still capped at the backing left (diff case 186 shape)", () => {
    const ixs = planCloseSlabAttempt({
      ...base, feeBackingAtoms: 50n, protocolFee: { ...fee, owed: 20n },
      creatorFees: [{ ...P, assetIndex: 1, owed: 33n, amount: 10n }, { ...P, assetIndex: 2, owed: 111n }],
    });
    // tag 84 takes 20; asset 1 gets min(33, 30) = 30; asset 2 gets nothing (pool drained).
    expect(claim90(ixs)).toEqual([{ asset: 1, amount: 30n }]);
  });

  it("an AdminSigned pot listed before a payee pot that drains the pool does not throw (diff case 16: pool 3)", () => {
    const ixs = planCloseSlabAttempt({
      ...base, feeBackingAtoms: 3n,
      creatorFees: [
        { ...P, assetIndex: 1, owed: 0n },
        { assetIndex: 2, route: "AdminSigned", owed: 240n, authorityEpoch: 0n },
        { ...P, assetIndex: 3, owed: 111n },
      ],
    });
    expect(claim90(ixs)).toEqual([{ asset: 3, amount: 3n }]);
    expect(progIxs(ixs).map((i) => i.data[0])).toEqual([90, 13]);
  });

  it("leg order does not matter (diff case 219: pool 38, AdminSigned first)", () => {
    const legs = [
      { assetIndex: 1, route: "AdminSigned" as const, owed: 280n, authorityEpoch: 0n },
      { ...P, assetIndex: 2, owed: 290n },
      { ...P, assetIndex: 3, owed: 245n },
    ];
    const fwd = planCloseSlabAttempt({ ...base, feeBackingAtoms: 38n, creatorFees: legs });
    const rev = planCloseSlabAttempt({ ...base, feeBackingAtoms: 38n, creatorFees: [...legs].reverse() });
    expect(claim90(fwd)).toEqual([{ asset: 2, amount: 38n }]);
    expect(claim90(rev)).toEqual([{ asset: 3, amount: 38n }]);
  });

  it("still throws when backing is left after every payee claim", () => {
    expect(() => planCloseSlabAttempt({
      ...base, feeBackingAtoms: 300n,
      creatorFees: [{ assetIndex: 1, route: "AdminSigned", owed: 10n, authorityEpoch: 0n }, { ...P, assetIndex: 2, owed: 5n }],
    })).toThrow(/asset 1 owes 10/);
  });

  it("without feeBackingAtoms a caller amount is kept and AdminSigned still throws (no pool known)", () => {
    expect(claim90(planCloseSlabAttempt({ ...base, creatorFees: [{ ...P, assetIndex: 1, owed: 173n, amount: 161n }] })))
      .toEqual([{ asset: 1, amount: 161n }]);
    expect(() => planCloseSlabAttempt({
      ...base, creatorFees: [{ ...P, assetIndex: 1, owed: 5n }, { assetIndex: 2, route: "AdminSigned", owed: 1n, authorityEpoch: 0n }],
    })).toThrow(/asset 2 owes 1/);
  });
});
