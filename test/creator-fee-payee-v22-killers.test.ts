/**
 * Mutation killers for the 6 survivors (S06, S18, S21, A19, A26, A31) of the hand-written mutation run on
 * src/solana/creator-fee-payee-v22.ts + src/abi/creator-fee-payee-v22.ts against test/creator-fee-payee-v22.test.ts
 * (job SDK-REPORT-CREATORFEEPAYEETESTMUT). Each test fails on exactly its own mutant and passes on clean source.
 * Rust references are prog 9a0ff591 src/creator_fee_payee_v22.rs (the pinned parity oracle).
 */
import { readFileSync } from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import * as P from "../src/abi/creator-fee-payee-v22.js";
import * as B from "../src/solana/creator-fee-payee-v22.js";
import { LAYOUT_V22, UnknownLayoutError } from "../src/abi/layout.js";
import { stampMarket } from "./helpers/stamp.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/creator-fee-payee-parity.json", import.meta.url), "utf8")) as {
  offsets: Record<string, number>;
  records: Record<string, { hex: string }>;
};
const unhex = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s, "hex"));
const pk = (): PublicKey => Keypair.generate().publicKey;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

function market(n: number): Uint8Array {
  const L = LAYOUT_V22;
  return stampMarket(new Uint8Array(L.marketGroupOff + L.marketGroupLen + n * L.assetSlotStride), L.version);
}
function setEpoch(d: Uint8Array, i: number, epoch: bigint): void {
  const L = LAYOUT_V22;
  const slot = L.marketGroupOff + L.marketGroupLen + i * L.assetSlotStride;
  new DataView(d.buffer).setBigUint64(slot + L.wrapperSlot.controlSequences + FX.offsets.controlAuthorityEpoch, epoch, true);
}

describe("creator-fee payee killers", () => {
  // K-S06: the ATA create is funded by the caller (the signer), never by the payee (not a signer on tag 90).
  it("K-S06: the payee ATA create is paid by the caller, who signs", () => {
    const programId = pk(), mkt = pk(), caller = pk(), payee = pk(), mint = pk(), vaultToken = pk();
    const [ata] = B.buildClaimCreatorFeeToPayeeIxsV22({ programId, market: mkt, caller, assetIndex: 0, payee, vaultMint: mint, vaultToken, amount: 1n, authorityEpoch: 0n });
    expect(ata.keys[0].pubkey.toBase58()).toBe(caller.toBase58());
    expect([ata.keys[0].isSigner, ata.keys[0].isWritable]).toEqual([true, true]);
  });

  // K-S18: the reader takes authority_epoch from THIS asset's control block (tag 90 / 125 CAS input).
  it("K-S18: authorityEpoch is per asset, not asset 0's", () => {
    const d = market(3);
    setEpoch(d, 0, 11n);
    setEpoch(d, 1, 22n);
    setEpoch(d, 2, 33n);
    expect([0, 1, 2].map((i) => B.readCreatorFeeClaimStateV22(d, i).authorityEpoch)).toEqual([11n, 22n, 33n]);
  });

  // K-S21: a negative or fractional index must not read bytes outside / misaligned to a slot.
  it("K-S21: negative and non-integer asset indexes are refused", () => {
    const d = market(2);
    expect(() => B.readCreatorFeeClaimStateV22(d, -1)).toThrow(/not present/);
    expect(() => B.readCreatorFeeClaimStateV22(d, 0.5)).toThrow(/not present/);
    expect(() => B.readCreatorFeeClaimStateV22(d, Number.NaN)).toThrow(/not present/);
  });

  // K-A19: Rust `is_valid` requires `_reserved == [0u8; 4]` (bytes 68..72); the fixture only flips byte 70.
  it("K-A19: a non-zero byte anywhere in reserved[0..4] is refused", () => {
    const good = unhex(FX.records.good.hex);
    expect(() => P.decodeCreatorFeePayeeV22(good)).not.toThrow();
    for (let i = 0; i < 4; i++) {
      const m = Uint8Array.from(good);
      m[16 + P.CREATOR_FEE_PAYEE_FIELD_OFF_V22.reserved + i] = 1;
      expect(() => P.decodeCreatorFeePayeeV22(m), `reserved[${i}]`).toThrow(/reserved/);
    }
  });

  // K-A26: Rust uses `resolved_slot.checked_add(GRACE)`: an end of exactly u64::MAX does not overflow and can elapse.
  it("K-A26: grace end == u64::MAX still elapses at now == u64::MAX; end overflow never elapses", () => {
    const rs = U64_MAX - P.CREATOR_PAYEE_GRACE_SLOTS_V22;
    expect(P.payeeGraceElapsedV22(true, rs, U64_MAX)).toBe(true);
    expect(P.payeeGraceElapsedV22(true, rs, U64_MAX - 1n)).toBe(false);
    expect(P.payeeGraceElapsedV22(true, rs + 1n, U64_MAX)).toBe(false);
  });

  // K-A31: callers branch on UnknownLayoutError.code; a short record is TOO_SHORT, a long one BAD_LENGTH.
  it("K-A31: short / long records carry distinct layout error codes", () => {
    const code = (h: string): string | undefined => {
      try { P.decodeCreatorFeePayeeV22(unhex(h)); } catch (e) { return e instanceof UnknownLayoutError ? e.code : "other"; }
      return undefined;
    };
    expect(code(FX.records.short.hex)).toBe("TOO_SHORT");
    expect(code(FX.records.long.hex)).toBe("BAD_LENGTH");
  });
});
