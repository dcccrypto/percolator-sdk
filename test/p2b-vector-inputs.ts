/**
 * Shared P2b parity inputs: used by scripts/p2b-parity/gen-vectors.ts (to produce the hex the Rust
 * oracle decodes) and by test/p2b-earn.test.ts (to re-encode and compare with the fixture).
 */
import { PublicKey } from "@solana/web3.js";
import { encodeSetVaultLpRiskP3 } from "../src/abi/p3.js";
import { encodeInitMarketV19, encodeInitVaultLpV19, encodeSetAssetRiskLimitsV19 } from "../src/abi/growth-v19.js";
import { encodeInitMarket } from "../src/abi/instructions.js";
import type { InitMarketV17Args } from "../src/abi/instructions.js";
import { encodeAdlWindDown, encodeSetAdlWindDownMaxSlots } from "../src/abi/p2b-lock-exits.js";
import { encodeSetVaultLpRiskV19P2b, encodeVaultLpAllocateP2b, U128_MAX_P2B } from "../src/abi/p2b-earn.js";
import type { VaultLpDialsP2b } from "../src/abi/p2b-earn.js";

export const P2B_MATCHER = new PublicKey("4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT");

const RISK = {
  assetIndex: 3, skewSlopeE9: 2_000n, skewMaxE9: 900n, levCapQ: 40_000_000_000n, levMaxImrBps: 5_000,
  vaultLpMaxLevBps: 20_000, approvedMatcherProgram: P2B_MATCHER,
} as const;

export const P2B_INIT_MARKET_ARGS = {
  maxPortfolioAssets: 1, hMin: 10n, hMax: 100n, initialPrice: 1_000_000n, minNonzeroMmReq: 10n, minNonzeroImReq: 20n,
  maintenanceMarginBps: 500n, initialMarginBps: 1_000n, maxTradingFeeBps: 100n, tradeFeeBaseBps: 10n, liquidationFeeBps: 50n,
  liquidationFeeCap: 1_000_000n, minLiquidationAbs: 100n, maxPriceMoveBpsPerSlot: 4n, maxAccrualDtSlots: 100n,
  maxAbsFundingE9PerSlot: 1_000n, minFundingLifetimeSlots: 0n, maxAccountBSettlementChunks: 10n, maxBankruptCloseChunks: 10n,
  maxBankruptCloseLifetimeSlots: 500n, publicBChunkAtoms: 1_000_000n, maintenanceFeePerSlot: 0n,
} as unknown as InitMarketV17Args;

export type P2bVectorInput =
  | { kind: "allocate"; amount: bigint }
  | { kind: "setRiskLegacy" }
  | ({ kind: "setRiskV19" } & VaultLpDialsP2b)
  | { kind: "adlWindDown"; nowSlot: bigint; assetIndex: number; portfolioId: bigint; positionEpoch: bigint }
  | { kind: "setAdlMax"; assetIndex: number; maxEpisodeSlots: number }
  | { kind: "initVaultLpV19"; juniorFloorBps: number; lLaunchX100: number }
  | { kind: "setAssetRiskLimitsV19"; assetIndex: number; lambdaBps: number; kinkBps: number; utilFeeMaxBps: number }
  | { kind: "initMarketV19"; rGapBps: number; lLaunchX100: number }
  | { kind: "initMarketLegacy" };

export const P2B_VECTOR_INPUTS: Record<string, P2bVectorInput> = {
  allocate_max: { kind: "allocate", amount: U128_MAX_P2B },
  allocate_one: { kind: "allocate", amount: 1n },
  allocate_mid: { kind: "allocate", amount: 0x0102030405060708090a0b0c0d0e0f10n },
  setRiskLegacy: { kind: "setRiskLegacy" },
  setRiskV19_defaults: { kind: "setRiskV19", allocAlphaBps: 5_000, allocBufferBps: 3_000, cushionTargetBps: 0, cushionShareBps: 0 },
  setRiskV19_cushion: { kind: "setRiskV19", allocAlphaBps: 4_321, allocBufferBps: 3_500, cushionTargetBps: 1_000, cushionShareBps: 5_000 },
  setRiskV19_zeroAlpha: { kind: "setRiskV19", allocAlphaBps: 0, allocBufferBps: 10_000, cushionTargetBps: 10_000, cushionShareBps: 10_000 },
  adlWindDown: { kind: "adlWindDown", nowSlot: 507_300_000n, assetIndex: 0, portfolioId: 0x1122334455667788n, positionEpoch: 9n },
  setAdlMax_default: { kind: "setAdlMax", assetIndex: 0, maxEpisodeSlots: 9_000 },
  setAdlMax_tight: { kind: "setAdlMax", assetIndex: 2, maxEpisodeSlots: 300 },
  initVaultLpV19: { kind: "initVaultLpV19", juniorFloorBps: 2_000, lLaunchX100: 550 },
  setAssetRiskLimitsV19_6B: { kind: "setAssetRiskLimitsV19", assetIndex: 0, lambdaBps: 10_000, kinkBps: 5_000, utilFeeMaxBps: 0 },
  setAssetRiskLimitsV19_8B: { kind: "setAssetRiskLimitsV19", assetIndex: 1, lambdaBps: 7_500, kinkBps: 4_000, utilFeeMaxBps: 800 },
  initMarketLegacy: { kind: "initMarketLegacy" },
  initMarketV19: { kind: "initMarketV19", rGapBps: 400, lLaunchX100: 550 },
};

/**
 * Encode one vector with the SDK.
 * @param i  Vector input.
 * @returns Instruction data.
 */
export function encodeP2bVector(i: P2bVectorInput): Uint8Array {
  switch (i.kind) {
    case "allocate": return encodeVaultLpAllocateP2b(i.amount);
    case "setRiskLegacy": return encodeSetVaultLpRiskP3(RISK);
    case "setRiskV19": return encodeSetVaultLpRiskV19P2b({ ...RISK, ...i });
    case "adlWindDown": return encodeAdlWindDown(i);
    case "setAdlMax": return encodeSetAdlWindDownMaxSlots(i);
    case "initVaultLpV19": return encodeInitVaultLpV19(i.juniorFloorBps, i.lLaunchX100);
    case "setAssetRiskLimitsV19": return encodeSetAssetRiskLimitsV19(i.assetIndex, i.lambdaBps, i.kinkBps, i.utilFeeMaxBps);
    case "initMarketV19": return encodeInitMarketV19(P2B_INIT_MARKET_ARGS, i.rGapBps, i.lLaunchX100);
    case "initMarketLegacy": return encodeInitMarket(P2B_INIT_MARKET_ARGS);
  }
}
