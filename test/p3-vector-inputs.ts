/**
 * Shared P3 parity inputs: used by scripts/p3-parity/gen-vectors.ts (to produce the hex the
 * Rust oracle decodes) and by test/p3.test.ts (to re-encode and compare with the fixture).
 */
import { PublicKey } from "@solana/web3.js";
import {
  encodeDepositJuniorTrancheP3,
  encodeInitVaultLpP3,
  encodeSetVaultLpRiskP3,
  encodeVaultLpConvertPnlP3,
  encodeVaultLpRecallP3,
  encodeVaultLpReleaseSurplusP3,
  encodeVaultLpSetMatcherP3,
  encodeVaultLpSettleResolvedP3,
  encodeWithdrawJuniorTrancheP3,
} from "../src/abi/p3.js";
import type { SetVaultLpRiskArgsP3, VaultLpSetMatcherArgsP3 } from "../src/abi/p3.js";
import { encodePermissionlessCrank } from "../src/abi/instructions.js";

const U128_MAX = (1n << 128n) - 1n;
const U64_MAX = (1n << 64n) - 1n;

export type P3VectorInput =
  | { tag: 94; juniorFloorBps: number }
  | ({ tag: 95 } & VaultLpSetMatcherArgsP3)
  | { tag: 96 | 97 | 100; amount: bigint }
  | { tag: 98; amount: bigint; targetDomain: number }
  | ({ tag: 99 } & SetVaultLpRiskArgsP3)
  | { tag: 101; topup: 0 | 1 }
  | { tag: 102; amount: bigint; sourceDomain: number }
  | { tag: 5; nowSlot: bigint; observations: { assetIndex: number; oracleAccounts: number }[] };

export const P3_MATCHER = new PublicKey("4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT");

export const P3_VECTOR_INPUTS: Record<string, P3VectorInput> = {
  initVaultLp_min: { tag: 94, juniorFloorBps: 1_000 },
  initVaultLp_max: { tag: 94, juniorFloorBps: 10_000 },
  setMatcher: {
    tag: 95, expectedSequence: 0x0102030405060708n, assetGenerationFrontier: 7n, tradeFeeCapBps: 10_000,
    expirySlot: U64_MAX, kind: 2, tradingFeeBps: 10, baseSpreadBps: 50, maxTotalBps: 200, impactKBps: 10_000,
    liquidityNotionalE6: 1_000_000_000n, maxFillAbs: 1_000n, maxInventoryAbs: U128_MAX, feeToInsuranceBps: 0x1234,
    skewSpreadMultBps: 50,
  },
  depositJunior: { tag: 96, amount: 1_000_000_000_000_000_000_000n },
  withdrawJunior: { tag: 97, amount: 1n },
  recall: { tag: 98, amount: U128_MAX, targetDomain: 1 },
  setRisk: {
    tag: 99, assetIndex: 3, skewSlopeE9: 2_000n, skewMaxE9: U64_MAX, levCapQ: 40_000_000_000n, levMaxImrBps: 5_000,
    vaultLpMaxLevBps: 50_000, approvedMatcherProgram: P3_MATCHER,
  },
  convertPnl: { tag: 100, amount: 0x0f0e0d0c0b0a09080706050403020100n },
  settleResolved_close: { tag: 101, topup: 0 },
  settleResolved_topup: { tag: 101, topup: 1 },
  releaseSurplus: { tag: 102, amount: 99n, sourceDomain: 0xbeef },
  refreshCrank: { tag: 5, nowSlot: 505_580_400n, observations: [{ assetIndex: 0, oracleAccounts: 1 }, { assetIndex: 2, oracleAccounts: 0 }] },
};

/**
 * Encode one vector with the SDK encoder for its tag.
 * @param v  Vector input.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeP3Vector(P3_VECTOR_INPUTS.recall);
 * ```
 */
export function encodeP3Vector(v: P3VectorInput): Uint8Array {
  switch (v.tag) {
    case 94: return encodeInitVaultLpP3(v.juniorFloorBps);
    case 95: return encodeVaultLpSetMatcherP3(v);
    case 96: return encodeDepositJuniorTrancheP3(v.amount);
    case 97: return encodeWithdrawJuniorTrancheP3(v.amount);
    case 98: return encodeVaultLpRecallP3(v.amount, v.targetDomain);
    case 99: return encodeSetVaultLpRiskP3(v);
    case 100: return encodeVaultLpConvertPnlP3(v.amount);
    case 101: return encodeVaultLpSettleResolvedP3(v.topup);
    case 102: return encodeVaultLpReleaseSurplusP3(v.amount, v.sourceDomain);
    case 5: return encodePermissionlessCrank({ nowSlot: v.nowSlot, observations: v.observations });
  }
}
