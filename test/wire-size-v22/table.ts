/**
 * Per-tag wire table for the v2.2 wrapper instruction decoder.
 *
 * Source of truth: dcccrypto/percolator-prog, branch feat/v22-rc23-2026-10-22
 * (commit d27f3d73), file src/v16_program.rs, `Instruction::decode` (lines 10065-10963).
 * The decoder ends with `if !rest.is_empty() { return Err(InvalidInstructionData) }` (line 10958),
 * so the data length must be EXACT: too short fails a read, too long fails that check.
 *
 * Each row:
 *   tag      wrapper instruction tag (first byte)
 *   name     program enum variant
 *   prog     program `file:line` of the decode arm (v16_program.rs)
 *   form     which grammar form of the arm this row exercises
 *   spec     field layout AFTER the tag byte, in wire order: `sdkArgName:type[=value]`
 *   enc      the SDK encoder call, given the generated field values by name
 *
 * Types: u8 u16 u32 u64 u128 i64 i128 pk (32 bytes). Total data length = 1 + sum of field sizes.
 * Rows with a repeated group (batch legs, key lists) pin one concrete count.
 */
import { PublicKey } from "@solana/web3.js";
import * as ix from "../../src/abi/instructions.js";
import * as w22 from "../../src/abi/v22-wire.js";
import * as p3 from "../../src/abi/p3.js";
import * as p2b from "../../src/abi/p2b-earn.js";
import * as p2bl from "../../src/abi/p2b-lock-exits.js";
import * as gv from "../../src/abi/growth-v19.js";
import * as p1 from "../../src/abi/risk-limits-p1.js";
import * as lg from "../../src/abi/lev-guard-v22.js";
import * as ds from "../../src/abi/v22-depth-source.js";
import * as cfp from "../../src/abi/creator-fee-payee-v22.js";
import * as rs from "../../src/abi/v22-resolve.js";
import * as p3v from "../../src/solana/p3-vault-lp.js";

export const PROG_BRANCH = "feat/v22-rc23-2026-10-22";
export const PROG_FILE = "src/v16_program.rs";

export type FieldType = "u8" | "u16" | "u32" | "u64" | "u128" | "i64" | "i128" | "pk";
export const SIZE: Record<FieldType, number> = {
  u8: 1, u16: 2, u32: 4, u64: 8, u128: 16, i64: 8, i128: 16, pk: 32,
};

export interface Row {
  tag: number;
  name: string;
  prog: number; // line of the decode arm in v16_program.rs
  form: string;
  spec: string;
  enc: (o: any) => Uint8Array;
  /**
   * Documented SDK-side defect: the SDK emits a shape the program's decoder REJECTS
   * (InvalidInstructionData). `spec` describes what the SDK emits; it is checked for self-consistency,
   * and a separate `it.fails` asserts the SDK should not emit it.
   */
  mismatch?: string;
}

export interface Field { name: string; type: FieldType; value: bigint | number | PublicKey }

/** Deterministic, distinct, in-range value per field slot (override with `=value`). */
function autoValue(type: FieldType, i: number): bigint | number | PublicKey {
  switch (type) {
    case "u8": return 3 + (i % 5);
    case "u16": return 100 + i;
    case "u32": return 1000 + i;
    case "u64": return 1_000_000_007n + BigInt(i) * 1_000_003n;
    case "u128": return (1n << 70n) + BigInt(i);
    case "i64": return -(1n << 40n) - BigInt(i);
    case "i128": return -(1n << 65n) - BigInt(i);
    case "pk": return new PublicKey(new Uint8Array(32).fill(i + 1));
  }
}

export function parseSpec(spec: string): Field[] {
  return spec
    .split(/\s+/)
    .filter(Boolean)
    .map((tok, i) => {
      const [name, rest] = tok.split(":");
      const [type, ov] = rest.split("=");
      const t = type as FieldType;
      let value = autoValue(t, i);
      if (ov !== undefined) value = t === "u8" || t === "u16" || t === "u32" ? Number(ov) : BigInt(ov);
      return { name, type: t, value };
    });
}

export function valuesByName(fields: Field[]): Record<string, any> {
  const o: Record<string, any> = {};
  for (const f of fields) o[f.name] = f.value;
  return o;
}

export function expectedLength(fields: Field[]): number {
  return 1 + fields.reduce((n, f) => n + SIZE[f.type], 0);
}

const L = (o: any, ...ks: string[]) => ks.map((k) => o[k]);
const hex = (o: any, k: string) => o[k];
void hex;

/** 18-byte tier block (TIER_CONFIG_WIRE_LEN, growth_v19.rs:1849): 3 x u32 thresholds, 3 x u16 leverages. */
const TIER_SPEC = "t0:u32=1000 t1:u32=2000 t2:u32=3000 l0:u16=200 l1:u16=300 l2:u16=400";
const tiers = (o: any) => ({ thresholdUsd: [o.t0, o.t1, o.t2] as [number, number, number], leverageX100: [o.l0, o.l1, o.l2] as [number, number, number] });

const INIT_MARKET_SPEC =
  "maxPortfolioAssets:u16=4 hMin:u64 hMax:u64 initialPrice:u64 minNonzeroMmReq:u128 minNonzeroImReq:u128 " +
  "maintenanceMarginBps:u64 initialMarginBps:u64 maxTradingFeeBps:u64 tradeFeeBaseBps:u64 liquidationFeeBps:u64 " +
  "liquidationFeeCap:u128 minLiquidationAbs:u128 maxPriceMoveBpsPerSlot:u64 maxAccrualDtSlots:u64 " +
  "maxAbsFundingE9PerSlot:u64 minFundingLifetimeSlots:u64 maxAccountBSettlementChunks:u64 " +
  "maxBankruptCloseChunks:u64 maxBankruptCloseLifetimeSlots:u64 publicBChunkAtoms:u128 maintenanceFeePerSlot:u128";
const initArgs = (o: any) => o;

/** InitMarket base with values the growth/band encoders accept (r_gap floor = move x 50, MMR >= r_gap + liq fee). */
const INIT_OK = INIT_MARKET_SPEC
  .replace("maxPortfolioAssets:u16=4", "maxPortfolioAssets:u16=1")
  .replace("maintenanceMarginBps:u64", "maintenanceMarginBps:u64=2000")
  .replace("initialMarginBps:u64", "initialMarginBps:u64=3000")
  .replace("liquidationFeeBps:u64", "liquidationFeeBps:u64=50")
  .replace("maxPriceMoveBpsPerSlot:u64", "maxPriceMoveBpsPerSlot:u64=1");
const GROWTH = "rGapBps:u16=100 lLaunchX100:u16=500";
const LOT = "lotExp:u8=3";
const RENT = "rentMaxE9PerSlot:u32=100 rentKinkBps:u16=5000";
const BAND = "bandBps:u16=300 bandMaxEpochSlots:u32=200 bandMaxPinSlots:u32=2000 bandMinLegNotional:u64=100000000";
const trailer = (o: any) => ({
  rGapBps: o.rGapBps, lLaunchX100: o.lLaunchX100,
  ...(o.lotExp !== undefined ? { lotExp: o.lotExp } : {}),
  ...(o.rentMaxE9PerSlot !== undefined ? { rent: { rentMaxE9PerSlot: o.rentMaxE9PerSlot, rentKinkBps: o.rentKinkBps } } : {}),
  ...(o.bandBps !== undefined ? { band: { bandBps: o.bandBps, bandMaxEpochSlots: o.bandMaxEpochSlots, bandMaxPinSlots: o.bandMaxPinSlots, bandMinLegNotional: o.bandMinLegNotional } } : {}),
});
const PK0 = new PublicKey(new Uint8Array(32).fill(9));
const claimData = () => p3v.buildClaimResolvedPayoutTopupIxP3({ programId: PK0, market: PK0, portfolio: PK0, owner: PK0, destToken: PK0, vaultToken: PK0 }).data;
const closeResolvedData = () => p3v.buildCloseResolvedUnsignedIxP3({ programId: PK0, market: PK0, portfolio: PK0, owner: PK0, destToken: PK0, vaultToken: PK0 }).data;

const TRADE_ACCTS = "accountAPortfolioId:u64 accountAPositionEpoch:u64 accountBPortfolioId:u64 accountBPositionEpoch:u64";

export const ROWS: Row[] = [
  { tag: 0, name: "InitMarket", prog: 10070, form: "base", spec: INIT_MARKET_SPEC, enc: (o) => ix.encodeInitMarket(initArgs(o)) },
  { tag: 0, name: "InitMarketV19", prog: 10070, form: "base + growth(4) = 223 B", spec: `${INIT_OK} ${GROWTH}`, enc: (o) => gv.encodeInitMarketV19(o, o.rGapBps, o.lLaunchX100) },
  { tag: 0, name: "InitMarketV22", prog: 10070, form: "base + growth(4) + lot(1) = 224 B", spec: `${INIT_OK} ${GROWTH} ${LOT}`, enc: (o) => w22.encodeInitMarketV22(o, trailer(o)) },
  { tag: 0, name: "InitMarketV22", prog: 10070, form: "base + growth(4) + rent(6) = 229 B", spec: `${INIT_OK} ${GROWTH} ${RENT}`, enc: (o) => w22.encodeInitMarketV22(o, trailer(o)) },
  { tag: 0, name: "InitMarketV22", prog: 10070, form: "base + growth(4) + lot(1) + rent(6) = 230 B", spec: `${INIT_OK} ${GROWTH} ${LOT} ${RENT}`, enc: (o) => w22.encodeInitMarketV22(o, trailer(o)) },
  { tag: 0, name: "InitMarketV22", prog: 10070, form: "base + growth(4) + rent(6) + band(18) = 247 B", spec: `${INIT_OK} ${GROWTH} ${RENT} ${BAND}`, enc: (o) => w22.encodeInitMarketV22(o, trailer(o)) },
  { tag: 0, name: "InitMarketV22", prog: 10070, form: "base + growth(4) + lot(1) + rent(6) + band(18) = 248 B", spec: `${INIT_OK} ${GROWTH} ${LOT} ${RENT} ${BAND}`, enc: (o) => w22.encodeInitMarketV22(o, trailer(o)) },
  { tag: 30, name: "CloseResolved", prog: 10326, form: "permissionless form via buildCloseResolvedUnsignedIxP3 (fee_rate = 0)", spec: "feeRatePerSlot:u128=0", enc: () => closeResolvedData() },
  { tag: 46, name: "ClaimResolvedPayoutTopup", prog: 10534, form: "bare via buildClaimResolvedPayoutTopupIxP3", spec: "", enc: () => claimData() },
  { tag: 1, name: "InitPortfolio", prog: 10170, form: "bare", spec: "", enc: () => ix.encodeInitUser() },
  { tag: 3, name: "Deposit", prog: 10171, form: "fixed", spec: "portfolioId:u64 expectedSequence:u64 amount:u128", enc: (o) => ix.encodeDepositCollateral(o) },
  { tag: 4, name: "Withdraw", prog: 10176, form: "fixed", spec: "portfolioId:u64 expectedSequence:u64 amount:u128", enc: (o) => ix.encodeWithdrawCollateral(o) },
  {
    tag: 5, name: "PermissionlessCrank", prog: 10181, form: "2 observations",
    spec: "nowSlot:u64 n:u8=2 a0:u16=7 c0:u8=1 a1:u16=9 c1:u8=2",
    enc: (o) => ix.encodePermissionlessCrank({ nowSlot: o.nowSlot, observations: [{ assetIndex: o.a0, oracleAccounts: o.c0 }, { assetIndex: o.a1, oracleAccounts: o.c1 }] }),
  },
  { tag: 6, name: "TradeNoCpi", prog: 10199, form: "fixed", spec: `${TRADE_ACCTS} assetIndex:u16 marketId:u64 sizeQ:i128 execPrice:u64 feeBps:u64 backingFeeCapBps:u16`, enc: (o) => ix.encodeTradeNoCpi(o) },
  { tag: 10, name: "TradeCpi", prog: 10211, form: "fixed", spec: "accountAPortfolioId:u64 accountAPositionEpoch:u64 accountBPortfolioId:u64 accountBPositionEpoch:u64 accountBMatcherSequence:u64 assetIndex:u16 marketId:u64 sizeQ:i128 feeBps:u64 limitPrice:u64 backingFeeCapBps:u16", enc: (o) => ix.encodeTradeCpi(o) },
  {
    tag: 66, name: "BatchTradeNoCpi", prog: 10224, form: "1 leg, then 4 x u64 account trailer",
    spec: "n:u8=1 assetIndex:u16 marketId:u64 sizeQ:i128 execPrice:u64 feeBps:u64=25 accountAPortfolioId:u64 accountAPositionEpoch:u64 accountBPortfolioId:u64 accountBPositionEpoch:u64",
    enc: (o) => ix.encodeBatchTradeNoCpi({ legs: [{ assetIndex: o.assetIndex, marketId: o.marketId, sizeQ: o.sizeQ, execPrice: o.execPrice, feeBps: o.feeBps }], accountAPortfolioId: o.accountAPortfolioId, accountAPositionEpoch: o.accountAPositionEpoch, accountBPortfolioId: o.accountBPortfolioId, accountBPositionEpoch: o.accountBPositionEpoch }),
  },
  {
    tag: 67, name: "BatchTradeCpi", prog: 10244, form: "1 leg, u128 slippage, u128 fee, 4 x u64, u64 seq",
    spec: "n:u8=1 assetIndex:u16 marketId:u64 sizeQ:i128 feeBps:u64=25 limitPrice:u64 maxSlippageAtoms:u128 maxFeeAtoms:u128 accountAPortfolioId:u64 accountAPositionEpoch:u64 accountBPortfolioId:u64 accountBPositionEpoch:u64 accountBMatcherSequence:u64",
    enc: (o) => ix.encodeBatchTradeCpi({ legs: [{ assetIndex: o.assetIndex, marketId: o.marketId, sizeQ: o.sizeQ, feeBps: o.feeBps, limitPrice: o.limitPrice }], maxSlippageAtoms: o.maxSlippageAtoms, maxFeeAtoms: o.maxFeeAtoms, accountAPortfolioId: o.accountAPortfolioId, accountAPositionEpoch: o.accountAPositionEpoch, accountBPortfolioId: o.accountBPortfolioId, accountBPositionEpoch: o.accountBPositionEpoch, accountBMatcherSequence: o.accountBMatcherSequence }),
  },
  { tag: 68, name: "SetMatcherConfig", prog: 10269, form: "fixed", spec: "portfolioId:u64 expectedSequence:u64 assetGenerationFrontier:u64 enabled:u8=1 tradeFeeCapBps:u16 expirySlot:u64", enc: (o) => ix.encodeSetMatcherConfig(o) },
  { tag: 8, name: "ClosePortfolio", prog: 10277, form: "fixed", spec: "portfolioId:u64 expectedSequence:u64 positionEpoch:u64", enc: (o) => ix.encodeCloseAccount(o) },
  { tag: 9, name: "TopUpInsurance", prog: 10287, form: "fixed", spec: "marketId:u64 intentId:u64 authorityEpoch:u64 amount:u128", enc: (o) => ix.encodeTopUpInsurance(o) },
  { tag: 56, name: "TopUpInsuranceDomain", prog: 10293, form: "fixed", spec: "domain:u16 marketId:u64 intentId:u64 authorityEpoch:u64 amount:u128", enc: (o) => ix.encodeTopUpInsuranceDomain(o) },
  { tag: 13, name: "CloseSlab", prog: 10300, form: "fixed", spec: "authorityEpoch:u64", enc: (o) => ix.encodeCloseSlab(o.authorityEpoch) },
  { tag: 19, name: "ResolveMarket", prog: 10303, form: "fixed", spec: "assetGenerationFrontier:u64 authorityEpoch:u64", enc: (o) => ix.encodeResolveMarket(o) },
  { tag: 24, name: "TopUpBackingBucket", prog: 10307, form: "fixed", spec: "domain:u16 marketId:u64 intentId:u64 authorityEpoch:u64 amount:u128 expirySlot:u64", enc: (o) => ix.encodeTopUpBackingBucket(o) },
  { tag: 50, name: "WithdrawBackingBucket", prog: 10315, form: "fixed", spec: "domain:u16 marketId:u64 amount:u128 authorityEpoch:u64", enc: (o) => ix.encodeWithdrawBackingBucket(o) },
  { tag: 28, name: "ConvertReleasedPnl", prog: 10321, form: "fixed", spec: "portfolioId:u64 positionEpoch:u64 amount:u128", enc: (o) => ix.encodeConvertReleasedPnl(o) },
  { tag: 32, name: "UpdateAuthority", prog: 10329, form: "fixed", spec: "newPubkey:pk authorityEpoch:u64", enc: (o) => ix.encodeUpdateAuthority(o) },
  { tag: 65, name: "UpdateAssetAuthority", prog: 10333, form: "fixed", spec: "assetIndex:u16 marketId:u64 kind:u8=2 newPubkey:pk authorityEpoch:u64", enc: (o) => ix.encodeUpdateAssetAuthority(o) },
  { tag: 51, name: "UpdateBackingFeePolicy", prog: 10348, form: "fixed", spec: "domain:u16 marketId:u64 feeBps:u16 insuranceShareBps:u16 policySequence:u64", enc: (o) => ix.encodeUpdateBackingFeePolicy(o) },
  { tag: 55, name: "UpdateTradeFeePolicy", prog: 10355, form: "fixed", spec: "tradeFeeBaseBps:u64 policySequence:u64", enc: (o) => ix.encodeUpdateTradeFeePolicy(o) },
  { tag: 92, name: "UpdateInsuranceWithdrawPolicy", prog: 10363, form: "fixed", spec: "depositsOnly:u8=1 cooldownSlots:u64 authorityEpoch:u64", enc: (o) => ix.encodeUpdateInsuranceWithdrawPolicy(o) },
  { tag: 60, name: "UpdateBaseUnitMints", prog: 10372, form: "fixed", spec: "primaryMint:pk secondaryMint:pk authorityEpoch:u64", enc: (o) => ix.encodeUpdateBaseUnitMints(o) },
  { tag: 61, name: "SwapSecondaryForPrimary", prog: 10377, form: "fixed", spec: "amount:u128 authorityEpoch:u64", enc: (o) => ix.encodeSwapSecondaryForPrimary(o) },
  { tag: 62, name: "ConfigureAuthMark", prog: 10381, form: "fixed", spec: "assetIndex:u16 marketId:u64 nowSlot:u64 initialMarkE6:u64 observationSequence:u64", enc: (o) => ix.encodeConfigureAuthMark(o) },
  { tag: 63, name: "PushAuthMark", prog: 10388, form: "no depth", spec: "assetIndex:u16 marketId:u64 nowSlot:u64 markE6:u64 observationSequence:u64", enc: (o) => ix.encodePushAuthMark(o) },
  {
    tag: 63, name: "PushAuthMarkDepth", prog: 10388, form: "G8 depth tail (44 B total)",
    spec: "assetIndex:u16 marketId:u64 nowSlot:u64 markE6:u64 observationSequence:u64 depthMode:u8=1 depthE6:u64",
    enc: (o) => ix.encodePushAuthMark({ assetIndex: o.assetIndex, marketId: o.marketId, nowSlot: o.nowSlot, markE6: o.markE6, observationSequence: o.observationSequence, depth: { mode: o.depthMode, depthE6: o.depthE6 } }),
  },
  { tag: 69, name: "RestartAssetOracle", prog: 10428, form: "fixed", spec: "assetIndex:u16 marketId:u64 nowSlot:u64 initialPrice:u64 observationSequence:u64", enc: (o) => ix.encodeRestartAssetOracle(o) },
  { tag: 52, name: "WithdrawBackingBucketEarnings", prog: 10435, form: "fixed", spec: "domain:u16 marketId:u64 amount:u128 authorityEpoch:u64", enc: (o) => ix.encodeWithdrawBackingBucketEarnings(o) },
  { tag: 39, name: "ResolveStalePermissionless", prog: 10451, form: "fixed", spec: "nowSlot:u64", enc: (o) => rs.encodeResolveStalePermissionless(o.nowSlot) },
  {
    tag: 34, name: "ConfigureHybridOracle", prog: 10454, form: "fixed",
    spec: "assetIndex:u16 marketId:u64 nowSlot:u64 nowUnixTs:i64 oracleLegCount:u8=1 oracleLegFlags:u8=2 maxStalenessSecs:u64 hybridSoftStaleSlots:u64 markEwmaHalflifeSlots:u64 markMinFee:u64 invert:u8=0 unitScale:u32 confFilterBps:u16 feed0:pk feed1:pk feed2:pk observationSequence:u64",
    enc: (o) => ix.encodeConfigureHybridOracle({ ...o, oracleLegFeeds: [o.feed0, o.feed1, o.feed2] } as any),
  },
  { tag: 35, name: "ConfigureEwmaMark", prog: 10475, form: "fixed", spec: "assetIndex:u16 marketId:u64 nowSlot:u64 initialMarkE6:u64 markEwmaHalflifeSlots:u64 markMinFee:u64 observationSequence:u64", enc: (o) => ix.encodeConfigureEwmaMark(o) },
  { tag: 36, name: "PushEwmaMark", prog: 10484, form: "fixed", spec: "assetIndex:u16 marketId:u64 nowSlot:u64 markE6:u64 observationSequence:u64", enc: (o) => ix.encodePushEwmaMark(o) },
  { tag: 40, name: "UpdateAssetLifecycle", prog: 10491, form: "fixed", spec: "action:u8=1 assetIndex:u16 marketId:u64 authorityEpoch:u64 nowSlot:u64 initialPrice:u64 maxInitFee:u128 insuranceAuthority:pk insuranceOperator:pk backingBucketAuthority:pk oracleAuthority:pk", enc: (o) => ix.encodeUpdateAssetLifecycle(o) },
  { tag: 41, name: "WithdrawInsurance", prog: 10504, form: "fixed", spec: "amount:u128", enc: (o) => ix.encodeWithdrawInsurance(o) },
  { tag: 57, name: "WithdrawInsuranceAsset", prog: 10507, form: "fixed", spec: "assetIndex:u16 marketId:u64 amount:u128 authorityEpoch:u64", enc: (o) => ix.encodeWithdrawInsuranceAsset(o) },
  { tag: 42, name: "CureAndCancelClose", prog: 10513, form: "fixed", spec: "portfolioId:u64 positionEpoch:u64 optionalDeposit:u128", enc: (o) => ix.encodeCureAndCancelClose(o) },
  { tag: 43, name: "ForfeitRecoveryLeg", prog: 10518, form: "fixed", spec: "portfolioId:u64 positionEpoch:u64 assetIndex:u16 bLossAtomBudget:u128", enc: (o) => ix.encodeForfeitRecoveryLeg(o) },
  { tag: 44, name: "RebalanceReduce", prog: 10524, form: "fixed", spec: "portfolioId:u64 positionEpoch:u64 assetIndex:u16 reduceQ:u128", enc: (o) => ix.encodeRebalanceReduce(o) },
  { tag: 74, name: "CreateLpVault", prog: 10542, form: "fixed", spec: "feeShareBps:u16 redemptionCooldownSlots:u64 oiReservationThresholdBps:u16 domain:u16", enc: (o) => ix.encodeCreateLpVaultV17(o) },
  { tag: 75, name: "DepositToLpVault", prog: 10548, form: "fixed", spec: "amount:u128 domain:u16", enc: (o) => ix.encodeDepositToLpVault(o) },
  { tag: 91, name: "RebalanceLpVaultBacking", prog: 10552, form: "fixed", spec: "fromDomain:u16 toDomain:u16 amount:u128", enc: (o) => ix.encodeRebalanceLpVaultBacking(o) },
  {
    tag: 76, name: "RequestRedeemLpShares", prog: 10557, form: "v2.2 (shares, floor, keeper_ok) = 26 B",
    spec: "shares:u128 minPayoutAtoms:u64 keeperOk:u8=1",
    enc: (o) => w22.encodeRequestRedeemLpSharesV22({ shares: o.shares, minPayoutAtoms: o.minPayoutAtoms, keeperOk: o.keeperOk === 1 }),
  },
  {
    tag: 76, name: "RequestRedeemLpShares", prog: 10557, form: "legacy 17 B (shares only): RETIRED by the program (line 10565)",
    spec: "shares:u128", enc: (o) => ix.encodeRequestRedeemLpShares(o),
    mismatch: "encodeRequestRedeemLpShares emits the retired 17-byte form; program decode returns InvalidInstructionData (v16_program.rs:10565). Already @deprecated in the SDK (kept for pre-v2.2 programs), so this is known, not a new bug.",
  },
  { tag: 77, name: "ExecuteRedemption", prog: 10583, form: "legacy domain only = 3 B", spec: "domain:u16", enc: (o) => ix.encodeExecuteRedemption(o) },
  { tag: 77, name: "ExecuteRedemptionV22", prog: 10583, form: "domain, floor, n_refresh = 12 B", spec: "domain:u16 minPayoutAtoms:u64 nRefresh:u8=2", enc: (o) => w22.encodeExecuteRedemptionV22(o) },
  { tag: 78, name: "LpVaultCrankFees", prog: 10602, form: "fixed", spec: "domain:u16", enc: (o) => ix.encodeLpVaultCrankFees(o) },
  { tag: 79, name: "SetLpVaultPaused", prog: 10605, form: "fixed", spec: "paused:u8=1", enc: (o) => ix.encodeSetLpVaultPaused(o) },
  { tag: 80, name: "CloseLpVault", prog: 10608, form: "bare", spec: "", enc: () => ix.encodeCloseLpVault() },
  { tag: 72, name: "TransferPortfolioOwnership", prog: 10611, form: "fixed", spec: "newOwner:pk assetIndex:u16", enc: (o) => ix.encodeTransferPortfolioOwnership(o) },
  { tag: 73, name: "SetNftProgramId", prog: 10615, form: "fixed", spec: "nftProgramId:pk", enc: (o) => ix.encodeSetNftProgramId(o) },
  {
    tag: 83, name: "InitMatcherCtx", prog: 10621, form: "fixed",
    spec: "kind:u8=1 tradingFeeBps:u32 baseSpreadBps:u32 maxTotalBps:u32 impactKBps:u32 liquidityNotionalE6:u128 maxFillAbs:u128 maxInventoryAbs:u128 feeToInsuranceBps:u16 skewSpreadMultBps:u16",
    enc: (o) => ix.encodeInitMatcherCtx(o),
  },
  { tag: 84, name: "WithdrawProtocolFee", prog: 10646, form: "fixed", spec: "amount:u128 authorityEpoch:u64", enc: (o) => ix.encodeWithdrawProtocolFee(o) },
  { tag: 85, name: "SetProtocolFeeAuthority", prog: 10650, form: "fixed", spec: "newAuthority:pk", enc: (o) => ix.encodeSetProtocolFeeAuthority(o) },
  {
    tag: 93, name: "SetAssetRiskLimits", prog: 10653, form: "41 B base (no tail)",
    spec: "assetIndex:u16 execBandBps:u16 lpExposureKBps:u32 lpFloorAtoms:u128 sideOiCapQ:u128=5000000000",
    enc: (o) => p1.encodeSetAssetRiskLimitsP1(o),
  },
  {
    tag: 93, name: "SetAssetRiskLimits", prog: 10653, form: "base + ext_mode u8 + max_requested_fee u16 = 44 B",
    spec: "assetIndex:u16 execBandBps:u16 lpExposureKBps:u32 lpFloorAtoms:u128 sideOiCapQ:u128=5000000000 matcherExtMode:u8=1 maxRequestedFeeBps:u16=50",
    enc: (o) => p1.encodeSetAssetRiskLimitsP1(o),
  },
  {
    tag: 93, name: "SetAssetRiskLimitsV19", prog: 10653, form: "base(44) + lambda u32, kink u16 = 50 B",
    spec: "assetIndex:u16 execBandBps:u16=0 lpExposureKBps:u32=0 lpFloorAtoms:u128=0 sideOiCapQ:u128=0 matcherExtMode:u8=0 maxRequestedFeeBps:u16=0 lambdaBps:u32=500 kinkBps:u16=4000",
    enc: (o) => gv.encodeSetAssetRiskLimitsV19(o.assetIndex, o.lambdaBps, o.kinkBps),
  },
  {
    tag: 93, name: "SetAssetRiskLimitsV19", prog: 10653, form: "base(44) + lambda, kink, util_fee_max u16 = 52 B",
    spec: "assetIndex:u16 execBandBps:u16=0 lpExposureKBps:u32=0 lpFloorAtoms:u128=0 sideOiCapQ:u128=0 matcherExtMode:u8=0 maxRequestedFeeBps:u16=0 lambdaBps:u32=500 kinkBps:u16=4000 utilFeeMaxBps:u16=600",
    enc: (o) => gv.encodeSetAssetRiskLimitsV19(o.assetIndex, o.lambdaBps, o.kinkBps, o.utilFeeMaxBps),
  },
  {
    tag: 93, name: "SetAssetRiskLimitsV22Tiers", prog: 10653, form: "base(44) + lambda, kink, util_fee_max, tiers(18), attested_max_tier u8 = 71 B",
    spec: `assetIndex:u16 execBandBps:u16=0 lpExposureKBps:u32=0 lpFloorAtoms:u128=0 sideOiCapQ:u128=0 matcherExtMode:u8=0 maxRequestedFeeBps:u16=0 lambdaBps:u32=500 kinkBps:u16=4000 utilFeeMaxBps:u16=600 ${TIER_SPEC} attestedMaxTier:u8=2`,
    enc: (o) => gv.encodeSetAssetRiskLimitsV22Tiers(o.assetIndex, o.lambdaBps, o.kinkBps, tiers(o), o.attestedMaxTier, o.utilFeeMaxBps),
  },
  { tag: 86, name: "UpdateFeeSplit", prog: 10709, form: "fixed", spec: "creatorShareBps:u16 lpShareBps:u16 insuranceShareBps:u16 authorityEpoch:u64", enc: (o) => ix.encodeUpdateFeeSplit(o) },
  { tag: 87, name: "WithdrawInsuranceReserveToStake", prog: 10715, form: "bare", spec: "", enc: () => ix.encodeWithdrawInsuranceReserveToStake() },
  { tag: 88, name: "UpdateMaintenanceFeePerSlot", prog: 10716, form: "fixed", spec: "maintenanceFeePerSlot:u128", enc: (o) => ix.encodeUpdateMaintenanceFeePerSlot(o) },
  { tag: 89, name: "ExpireBackingBucket", prog: 10719, form: "fixed", spec: "domain:u16", enc: (o) => ix.encodeExpireBackingBucket(o) },
  { tag: 125, name: "SetCreatorFeePayee", prog: 10722, form: "fixed", spec: "assetIndex:u16 marketId:u64 payee:pk authorityEpoch:u64", enc: (o) => cfp.encodeSetCreatorFeePayeeV22(o) },
  { tag: 90, name: "WithdrawCreatorFee", prog: 10728, form: "fixed", spec: "amount:u128 assetIndex:u16 authorityEpoch:u64", enc: (o) => ix.encodeWithdrawCreatorFee(o) },
  { tag: 94, name: "InitVaultLp", prog: 10733, form: "junior floor only = 3 B", spec: "juniorFloorBps:u16=1000", enc: (o) => p3.encodeInitVaultLpP3(o.juniorFloorBps) },
  { tag: 94, name: "InitVaultLpV19", prog: 10733, form: "floor + l_launch = 5 B", spec: "juniorFloorBps:u16=1000 lLaunchX100:u16=500", enc: (o) => gv.encodeInitVaultLpV19(o.juniorFloorBps, o.lLaunchX100) },
  { tag: 94, name: "InitVaultLpV22Tiers", prog: 10733, form: "floor + l_launch + tiers(18) = 23 B", spec: `juniorFloorBps:u16=1000 lLaunchX100:u16=500 ${TIER_SPEC}`, enc: (o) => gv.encodeInitVaultLpV22Tiers(o.juniorFloorBps, o.lLaunchX100, tiers(o)) },
  {
    tag: 95, name: "VaultLpSetMatcher", prog: 10758, form: "fixed",
    spec: "expectedSequence:u64 assetGenerationFrontier:u64 tradeFeeCapBps:u16 expirySlot:u64 kind:u8=1 tradingFeeBps:u32 baseSpreadBps:u32 maxTotalBps:u32 impactKBps:u32 liquidityNotionalE6:u128 maxFillAbs:u128 maxInventoryAbs:u128 feeToInsuranceBps:u16 skewSpreadMultBps:u16",
    enc: (o) => p3.encodeVaultLpSetMatcherP3(o),
  },
  { tag: 96, name: "DepositJuniorTranche", prog: 10774, form: "fixed", spec: "amount:u128", enc: (o) => p3.encodeDepositJuniorTrancheP3(o.amount) },
  { tag: 97, name: "WithdrawJuniorTranche", prog: 10777, form: "fixed", spec: "amount:u128", enc: (o) => p3.encodeWithdrawJuniorTrancheP3(o.amount) },
  { tag: 98, name: "VaultLpRecall", prog: 10780, form: "fixed", spec: "amount:u128 targetDomain:u16", enc: (o) => p3.encodeVaultLpRecallP3(o.amount, o.targetDomain) },
  {
    tag: 99, name: "SetVaultLpRisk", prog: 10784, form: "base = 73 B",
    spec: "assetIndex:u16 skewSlopeE9:u64 skewMaxE9:u64 levCapQ:u128 levMaxImrBps:u16 vaultLpMaxLevBps:u32 approvedMatcherProgram:pk",
    enc: (o) => p3.encodeSetVaultLpRiskP3(o),
  },
  {
    tag: 99, name: "SetVaultLpRiskV19", prog: 10784, form: "base + 4 x u16 dials = 81 B",
    spec: "assetIndex:u16 skewSlopeE9:u64 skewMaxE9:u64 levCapQ:u128 levMaxImrBps:u16 vaultLpMaxLevBps:u32 approvedMatcherProgram:pk allocAlphaBps:u16=2000 allocBufferBps:u16=4000 cushionTargetBps:u16=1500 cushionShareBps:u16=500",
    enc: (o) => p2b.encodeSetVaultLpRiskV19P2b(o),
  },
  { tag: 100, name: "VaultLpConvertPnl", prog: 10818, form: "fixed", spec: "amount:u128", enc: (o) => p3.encodeVaultLpConvertPnlP3(o.amount) },
  { tag: 101, name: "VaultLpSettleResolved", prog: 10821, form: "fixed", spec: "topup:u8=1", enc: (o) => p3.encodeVaultLpSettleResolvedP3(o.topup) },
  { tag: 102, name: "VaultLpReleaseSurplus", prog: 10824, form: "fixed", spec: "amount:u128 sourceDomain:u16", enc: (o) => p3.encodeVaultLpReleaseSurplusP3(o.amount, o.sourceDomain) },
  { tag: 104, name: "AdlWindDown", prog: 10828, form: "fixed", spec: "nowSlot:u64 assetIndex:u16 portfolioId:u64 positionEpoch:u64", enc: (o) => p2bl.encodeAdlWindDown(o) },
  { tag: 105, name: "SetAdlWindDownMaxSlots", prog: 10834, form: "fixed", spec: "assetIndex:u16 maxEpisodeSlots:u32", enc: (o) => p2bl.encodeSetAdlWindDownMaxSlots(o) },
  { tag: 103, name: "VaultLpAllocate", prog: 10840, form: "fixed", spec: "amount:u128", enc: (o) => p2b.encodeVaultLpAllocateP2b(o.amount) },
  { tag: 107, name: "InitBondTranche", prog: 10843, form: "fixed", spec: "couponBps:u16=500 utilBonusBps:u16=0 cooldownSlots:u32=10000 capBps:u16=3000", enc: (o) => w22.encodeInitBondTrancheV22(o) },
  { tag: 108, name: "BondDeposit", prog: 10849, form: "fixed", spec: "amount:u64 minShares:u128", enc: (o) => w22.encodeBondDepositV22(o.amount, o.minShares) },
  { tag: 109, name: "BondRequestWithdraw", prog: 10853, form: "fixed", spec: "shares:u128", enc: (o) => w22.encodeBondRequestWithdrawV22(o.shares) },
  { tag: 110, name: "BondExecuteWithdraw", prog: 10856, form: "fixed", spec: "minOut:u64 sourceDomain:u16", enc: (o) => w22.encodeBondExecuteWithdrawV22(o.minOut, o.sourceDomain) },
  { tag: 111, name: "InsuranceBackstopDraw", prog: 10860, form: "fixed", spec: "mode:u8=2 maxAmount:u128", enc: (o) => w22.encodeInsuranceBackstopDrawV22(o.mode, o.maxAmount) },
  { tag: 112, name: "RescueDeposit", prog: 10864, form: "fixed", spec: "tranche:u8=0 amount:u64 minShares:u128", enc: (o) => w22.encodeRescueDepositV22(o.tranche, o.amount, o.minShares) },
  { tag: 116, name: "InitInsuranceUnits", prog: 10869, form: "bare", spec: "", enc: () => w22.encodeInitInsuranceUnitsV22() },
  {
    tag: 117, name: "SetG9FeedAllowlist", prog: 10870, form: "count u8 + 2 x 32 B",
    spec: "count:u8=2 k0:pk k1:pk", enc: (o) => w22.encodeSetG9FeedAllowlistV22([o.k0, o.k1]),
  },
  { tag: 106, name: "SettleHoldingRent", prog: 10881, form: "fixed", spec: "assetIndex:u16 nowSlot:u64", enc: (o) => w22.encodeSettleHoldingRentV22(o.assetIndex, o.nowSlot) },
  { tag: 118, name: "SweepBandDustLeg", prog: 10885, form: "fixed", spec: "assetIndex:u16", enc: (o) => w22.encodeSweepBandDustLegV22(o.assetIndex) },
  {
    tag: 119, name: "EvictAndTradeCpi", prog: 10888, form: "tag + TradeCpi body (84 B) = 85 B",
    spec: "accountAPortfolioId:u64 accountAPositionEpoch:u64 accountBPortfolioId:u64 accountBPositionEpoch:u64 accountBMatcherSequence:u64 assetIndex:u16 marketId:u64 sizeQ:i128 feeBps:u64 limitPrice:u64 backingFeeCapBps:u16",
    enc: (o) => w22.encodeEvictAndTradeCpiV22(ix.encodeTradeCpi(o)),
  },
  {
    tag: 120, name: "ProposeG9FeedAllowlist", prog: 10901, form: "count u8 + 1 x (feed 32 + owner 32)",
    spec: "count:u8=1 feed:pk owner:pk", enc: (o) => w22.encodeProposeG9FeedAllowlistV22([{ feed: o.feed, owner: o.owner }]),
  },
  { tag: 121, name: "CommitG9FeedAllowlist", prog: 10914, form: "bare", spec: "", enc: () => w22.encodeCommitG9FeedAllowlistV22() },
  { tag: 122, name: "InitLpShareMetadata", prog: 10915, form: "generic (n = 0)", spec: "n:u8=0", enc: () => w22.encodeInitLpShareMetadataV22("") },
  { tag: 122, name: "InitLpShareMetadata", prog: 10915, form: "ticker 'ABCD' (n = 4)", spec: "n:u8=4 t0:u8=65 t1:u8=66 t2:u8=67 t3:u8=68", enc: () => w22.encodeInitLpShareMetadataV22("ABCD") },
  { tag: 123, name: "SetDepthSource", prog: 10943, form: "fixed (12 B)", spec: "op:u8=1 assetIndex:u16 marketId:u64", enc: (o) => ds.encodeSetDepthSourceV22(o.op, o.assetIndex, o.marketId) },
  { tag: 124, name: "LevGuard", prog: 10926, form: "op 0 INIT: t0 u64", spec: "op:u8=0 t0:u64", enc: (o) => lg.encodeLevGuardInitV22(o.t0) },
  { tag: 124, name: "LevGuard", prog: 10926, form: "op 1 SET_RISK_KEY: key 32 B", spec: "op:u8=1 key:pk", enc: (o) => lg.encodeLevGuardSetRiskKeyV22(o.key) },
  { tag: 124, name: "LevGuard", prog: 10926, form: "op 2 REPORT: 4 x u16", spec: "op:u8=2 jDumpBps:u16=100 mIndBps:u16=200 lCapX100:u16=300 nMultBps:u16=400", enc: (o) => lg.encodeLevGuardReportV22(o) },
  { tag: 124, name: "LevGuard", prog: 10926, form: "op 3 TIGHTEN: nothing", spec: "op:u8=3", enc: () => lg.encodeLevGuardTightenV22() },
  { tag: 124, name: "LevGuard", prog: 10926, form: "op 4 POKE: nothing", spec: "op:u8=4", enc: () => lg.encodeLevGuardPokeV22() },
  { tag: 124, name: "LevGuard", prog: 10926, form: "op 5 LP_STOP: nothing", spec: "op:u8=5", enc: () => lg.encodeLevGuardLpStopV22() },
  { tag: 124, name: "LevGuard", prog: 10926, form: "op 6 SET_T0: t0 u64", spec: "op:u8=6 t0:u64", enc: (o) => lg.encodeLevGuardSetT0V22(o.t0) },
];

/**
 * Tags the v2.2 decoder accepts for which the SDK has NO encoder at all (so there is no SDK wire to
 * check). Not mismatches. (Tags 30 and 46 are emitted only by instruction builders in
 * src/solana/p3-vault-lp.ts; they are table rows above, checked through `ix.data`.) `len` is the exact program data length (tag included).
 */
/** Shapes the program decoder refuses outright (tag, exact data length, program line of the refusal). */
export const REJECTED_SHAPES: { tag: number; len: number; prog: number }[] = [
  // AUD-S1-18: the legacy 17-byte RequestRedeemLpShares (no payout floor) is RETIRED.
  { tag: 76, len: 17, prog: 10565 },
];

export const NO_SDK_ENCODER: { tag: number; name: string; prog: number; len: string }[] = [
  { tag: 37, name: "UpdateLiquidationFeePolicy", prog: 10340, len: "11 (u16, u64)" },
  { tag: 38, name: "ConfigurePermissionlessResolve", prog: 10445, len: "33 (4 x u64)" },
  { tag: 45, name: "FinalizeResetSide", prog: 10530, len: "4 (u16, u8)" },
  { tag: 47, name: "RefineResolvedUnreceiptedBound", prog: 10535, len: "17 (u128)" },
  { tag: 48, name: "SyncMaintenanceFee", prog: 10538, len: "9 (u64)" },
  { tag: 49, name: "UpdateMaintenanceFeePolicy", prog: 10344, len: "11 (u16, u64)" },
  { tag: 53, name: "SyncBackingDomainLedger", prog: 10441, len: "3 (u16)" },
  { tag: 54, name: "SyncInsuranceLedger", prog: 10444, len: "1" },
  { tag: 58, name: "UpdateFeeRedirectPolicy", prog: 10359, len: "11 (u16, u64)" },
  { tag: 59, name: "UpdateMarketInitFeePolicy", prog: 10368, len: "25 (u128, u64)" },
  { tag: 64, name: "ForceCloseAbandonedAsset", prog: 10423, len: "27 (u16, u64, u128)" },
  { tag: 81, name: "CancelRedemption", prog: 10609, len: "1" },
  { tag: 82, name: "UnwrapEscrowedPortfolio", prog: 10618, len: "33 (32 B pubkey)" },
];

void L;

/**
 * Every tag with an arm in `Instruction::decode` (v16_program.rs:10065-10963), extracted from the
 * arms there (constants resolved from the `TAG_*` consts at v16_program.rs:455-676 and 1149-1246).
 * Any other first byte is `InvalidInstructionData`. 102 tags.
 */
export const PROGRAM_TAGS: number[] = [0, 1, 3, 4, 5, 6, 8, 9, 10, 13, 19, 24, 28, 30, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125];
