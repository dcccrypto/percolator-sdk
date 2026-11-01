/**
 * Encoder inputs for the #587 parity oracle (scripts/creator-fee-payee-parity). Shared by the vector generator and
 * test/creator-fee-payee-v22.test.ts so the fixture and the test can never encode different inputs.
 */
import { encodeWithdrawCreatorFee } from "../src/abi/instructions.js";
import { encodeSetCreatorFeePayeeV22 } from "../src/abi/creator-fee-payee-v22.js";

const seq = (start: number): Uint8Array => Uint8Array.from({ length: 32 }, (_, i) => (start + i) & 0xff);

export interface PayeeVector {
  build: () => Uint8Array;
  variant: "SetCreatorFeePayee" | "WithdrawCreatorFee";
  tag: number;
  /** Fields the real decoder must report (strings, as the oracle prints them). */
  fields: Record<string, string>;
}

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

export const PAYEE_VECTORS: Record<string, PayeeVector> = {
  setPayee125Asset0: {
    build: () => encodeSetCreatorFeePayeeV22({ assetIndex: 0, marketId: 1n, payee: seq(1), authorityEpoch: 0n }),
    variant: "SetCreatorFeePayee", tag: 125,
    fields: { assetIndex: "0", marketId: "1", payeeHex: hex(seq(1)), authorityEpoch: "0" },
  },
  setPayee125Distinct: {
    build: () => encodeSetCreatorFeePayeeV22({ assetIndex: 0x0102, marketId: 0x1122334455667788n, payee: seq(0xa0), authorityEpoch: 0x0807060504030201n }),
    variant: "SetCreatorFeePayee", tag: 125,
    fields: { assetIndex: "258", marketId: String(0x1122334455667788n), payeeHex: hex(seq(0xa0)), authorityEpoch: String(0x0807060504030201n) },
  },
  setPayee125Max: {
    build: () => encodeSetCreatorFeePayeeV22({ assetIndex: 0xffff, marketId: (1n << 64n) - 1n, payee: new Uint8Array(32).fill(0xff), authorityEpoch: (1n << 64n) - 1n }),
    variant: "SetCreatorFeePayee", tag: 125,
    fields: { assetIndex: "65535", marketId: String((1n << 64n) - 1n), payeeHex: "ff".repeat(32), authorityEpoch: String((1n << 64n) - 1n) },
  },
  withdraw90PayeeRoute: {
    build: () => encodeWithdrawCreatorFee({ amount: 123_456_789n, assetIndex: 3, authorityEpoch: 7n }),
    variant: "WithdrawCreatorFee", tag: 90,
    fields: { amount: "123456789", assetIndex: "3", authorityEpoch: "7" },
  },
  withdraw90Wide: {
    build: () => encodeWithdrawCreatorFee({ amount: (1n << 64n) - 1n, assetIndex: 0x0201, authorityEpoch: 0x0102030405060708n }),
    variant: "WithdrawCreatorFee", tag: 90,
    fields: { amount: String((1n << 64n) - 1n), assetIndex: "513", authorityEpoch: String(0x0102030405060708n) },
  },
};

/** Raw byte strings the real decoder must refuse (built by hand; the SDK encoder refuses to make them). */
export const PAYEE_REFUSED: Record<string, () => Uint8Array> = {
  /** 125 with a 31-byte payee (50 bytes). */
  setPayee125Short: () => Uint8Array.from([125, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, ...seq(1).subarray(0, 31), 0, 0, 0, 0, 0, 0, 0, 0]),
  /** 90 in the pre-GH#420 17-byte form. */
  withdraw90Legacy17: () => Uint8Array.from([90, ...new Uint8Array(16).fill(1)]),
};

/** Fixed PDA / ATA inputs (32-byte fills). */
export const PAYEE_PDA_INPUTS = {
  programFill: 7,
  marketFills: [9, 0xab],
  assetIndexes: [0, 1, 255, 256, 65535],
  payeeFills: [3, 0xfe],
  mintFills: [5],
} as const;
