/**
 * v2.2 golden-vector inputs, shared by scripts/v22-parity/gen-vectors.ts (hex fed to the real-crate oracle) and
 * test/v22-parity.test.ts (re-encode, compare with the fixture). `fields` are the values the REAL decoder must
 * report (decimal strings); distinctive numbers make a swapped field order visible.
 */
import { PublicKey } from "@solana/web3.js";
import { encodeTradeCpi } from "../src/abi/instructions.js";
import {
  encodeBondDepositV22, encodeBondExecuteWithdrawV22, encodeBondRequestWithdrawV22, encodeEvictAndTradeCpiV22, encodeExecuteRedemptionV22,
  encodeInitBondTrancheV22, encodeInitInsuranceUnitsV22, encodeInitMarketV22, encodeInsuranceBackstopDrawV22, encodeRequestRedeemLpSharesV22,
  encodeRescueDepositV22, encodeSetG9FeedAllowlistV22, encodeSettleHoldingRentV22, encodeSweepBandDustLegV22,
} from "../src/abi/v22-wire.js";
import { P2B_INIT_MARKET_ARGS } from "./p2b-vector-inputs.js";

export interface V22Vector {
  tag: number;
  variant: string;
  build: () => Uint8Array;
  fields: Record<string, string>;
}

const U128 = 0x0102030405060708090a0b0c0d0e0f10n;
const U64 = 0x1122334455667788n;
const feed = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const RENT = { rentMaxE9PerSlot: 4_321, rentKinkBps: 6_543 };
const BAND = { bandBps: 130, bandMaxEpochSlots: 601, bandMaxPinSlots: 9_001, bandMinLegNotional: 100_000_007n };
const TRADE = {
  accountAPortfolioId: 11n, accountAPositionEpoch: 22n, accountBPortfolioId: 33n, accountBPositionEpoch: 44n, accountBMatcherSequence: 55n,
  assetIndex: 0x0102, marketId: 66n, sizeQ: -77n, feeBps: 8n, limitPrice: 99n, backingFeeCapBps: 1_234,
};
const mk = (trailer: Parameters<typeof encodeInitMarketV22>[1]) => () => encodeInitMarketV22(P2B_INIT_MARKET_ARGS, trailer);
const im = (extra: Record<string, string>) => ({ maxPortfolioAssets: "1", initialPrice: "1000000", ...extra });

export const V22_VECTORS: Record<string, V22Vector> = {
  initMarketGrowth4: { tag: 0, variant: "InitMarketV19", build: mk({ rGapBps: 400, lLaunchX100: 550 }), fields: im({ rGapBps: "400", lLaunchX100: "550" }) },
  initMarketLot5: { tag: 0, variant: "InitMarketLotV22", build: mk({ rGapBps: 400, lLaunchX100: 550, lotExp: 3 }), fields: im({ rGapBps: "400", lLaunchX100: "550", lotExp: "3" }) },
  initMarketRent10: { tag: 0, variant: "InitMarketV22", build: mk({ rGapBps: 400, lLaunchX100: 550, rent: RENT }), fields: im({ rGapBps: "400", lLaunchX100: "550", lotExp: "0", rentMaxE9PerSlot: "4321", rentKinkBps: "6543", bandBps: "0", bandMaxEpochSlots: "0", bandMaxPinSlots: "0", bandMinLegNotional: "0" }) },
  initMarketRentLot11: { tag: 0, variant: "InitMarketV22", build: mk({ rGapBps: 400, lLaunchX100: 550, lotExp: 15, rent: RENT }), fields: im({ rGapBps: "400", lLaunchX100: "550", lotExp: "15", rentMaxE9PerSlot: "4321", rentKinkBps: "6543", bandBps: "0", bandMaxEpochSlots: "0", bandMaxPinSlots: "0", bandMinLegNotional: "0" }) },
  initMarketBand28: { tag: 0, variant: "InitMarketV22", build: mk({ rGapBps: 0, lLaunchX100: 550, rent: RENT, band: BAND }), fields: im({ rGapBps: "0", lLaunchX100: "550", lotExp: "0", rentMaxE9PerSlot: "4321", rentKinkBps: "6543", bandBps: "130", bandMaxEpochSlots: "601", bandMaxPinSlots: "9001", bandMinLegNotional: "100000007" }) },
  initMarketBandLot29: { tag: 0, variant: "InitMarketV22", build: mk({ rGapBps: 0, lLaunchX100: 550, lotExp: 2, rent: RENT, band: BAND }), fields: im({ rGapBps: "0", lLaunchX100: "550", lotExp: "2", rentMaxE9PerSlot: "4321", rentKinkBps: "6543", bandBps: "130", bandMaxEpochSlots: "601", bandMaxPinSlots: "9001", bandMinLegNotional: "100000007" }) },
  request76: { tag: 76, variant: "RequestRedeemLpSharesV22", build: () => encodeRequestRedeemLpSharesV22({ shares: U128, minPayoutAtoms: U64, keeperOk: true }), fields: { shares: U128.toString(), minPayoutAtoms: U64.toString(), keeperOk: "1" } },
  request76NoKeeper: { tag: 76, variant: "RequestRedeemLpSharesV22", build: () => encodeRequestRedeemLpSharesV22({ shares: 5n, minPayoutAtoms: 1n, keeperOk: false }), fields: { shares: "5", minPayoutAtoms: "1", keeperOk: "0" } },
  execute77: { tag: 77, variant: "ExecuteRedemptionV22", build: () => encodeExecuteRedemptionV22({ domain: 0x0203, minPayoutAtoms: U64, nRefresh: 3 }), fields: { domain: "515", minPayoutAtoms: U64.toString(), nRefresh: "3" } },
  execute77FloorOnly: { tag: 77, variant: "ExecuteRedemptionV22", build: () => encodeExecuteRedemptionV22({ domain: 1, minPayoutAtoms: 7n, nRefresh: 0 }), fields: { domain: "1", minPayoutAtoms: "7", nRefresh: "0" } },
  execute77RefreshOnly: { tag: 77, variant: "ExecuteRedemptionV22", build: () => encodeExecuteRedemptionV22({ domain: 2, minPayoutAtoms: 0n, nRefresh: 8 }), fields: { domain: "2", minPayoutAtoms: "0", nRefresh: "8" } },
  settleRent106: { tag: 106, variant: "SettleHoldingRent", build: () => encodeSettleHoldingRentV22(0x0102, U64), fields: { assetIndex: "258", nowSlot: U64.toString() } },
  sweep118: { tag: 118, variant: "SweepBandDustLeg", build: () => encodeSweepBandDustLegV22(0x0304), fields: { assetIndex: "772" } },
  evict119: { tag: 119, variant: "EvictAndTradeCpi", build: () => encodeEvictAndTradeCpiV22(encodeTradeCpi(TRADE)), fields: { accountAPortfolioId: "11", accountBPortfolioId: "33", assetIndex: "258", marketId: "66", sizeQ: "-77", feeBps: "8", limitPrice: "99", backingFeeCapBps: "1234" } },
  initBond107: { tag: 107, variant: "InitBondTranche", build: () => encodeInitBondTrancheV22({ couponBps: 801, utilBonusBps: 0, cooldownSlots: 9_001, capBps: 4_999 }), fields: { couponBps: "801", utilBonusBps: "0", cooldownSlots: "9001", capBps: "4999" } },
  bondDeposit108: { tag: 108, variant: "BondDeposit", build: () => encodeBondDepositV22(U64, U128), fields: { amount: U64.toString(), minShares: U128.toString() } },
  bondRequest109: { tag: 109, variant: "BondRequestWithdraw", build: () => encodeBondRequestWithdrawV22(U128), fields: { shares: U128.toString() } },
  bondExecute110: { tag: 110, variant: "BondExecuteWithdraw", build: () => encodeBondExecuteWithdrawV22(U64, 0x0102), fields: { minOut: U64.toString(), sourceDomain: "258" } },
  backstopDraw111: { tag: 111, variant: "InsuranceBackstopDraw", build: () => encodeInsuranceBackstopDrawV22(0, U128), fields: { mode: "0", maxAmount: U128.toString() } },
  backstopRestore111: { tag: 111, variant: "InsuranceBackstopDraw", build: () => encodeInsuranceBackstopDrawV22(1, 9n), fields: { mode: "1", maxAmount: "9" } },
  backstopPropose111: { tag: 111, variant: "InsuranceBackstopDraw", build: () => encodeInsuranceBackstopDrawV22(2, 0n), fields: { mode: "2", maxAmount: "0" } },
  rescue112: { tag: 112, variant: "RescueDeposit", build: () => encodeRescueDepositV22(0, U64, U128), fields: { tranche: "0", amount: U64.toString(), minShares: U128.toString() } },
  initUnits116: { tag: 116, variant: "InitInsuranceUnits", build: () => encodeInitInsuranceUnitsV22(), fields: {} },
  g9Allowlist2: { tag: 117, variant: "SetG9FeedAllowlist", build: () => encodeSetG9FeedAllowlistV22([feed(1), feed(2)]), fields: { count: "2", keysHex: "01".repeat(32) + "," + "02".repeat(32) } },
  g9Allowlist0: { tag: 117, variant: "SetG9FeedAllowlist", build: () => encodeSetG9FeedAllowlistV22([]), fields: { count: "0", keysHex: "" } },
};

/** Raw hex the REAL decoder must REFUSE (the SDK encoders refuse the same inputs; tested separately). */
const h = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const base = () => encodeInitMarketV22(P2B_INIT_MARKET_ARGS, { rGapBps: 400, lLaunchX100: 550 }).subarray(0, encodeInitMarketV22(P2B_INIT_MARKET_ARGS, { rGapBps: 400, lLaunchX100: 550 }).length - 4);
const cat = (...a: Uint8Array[]) => Uint8Array.from(a.flatMap((x) => [...x]));
export const V22_REFUSED: Record<string, () => Uint8Array> = {
  initMarketLotZero5: () => cat(base(), h("9001"), h("2602"), h("00")),
  initMarketTrailer6: () => cat(base(), h("9001"), h("2602"), h("0000")),
  initMarketTrailer12: () => cat(base(), h("9001"), h("2602"), h("00000000000000")),
  initMarketBandZeroBps: () => cat(encodeInitMarketV22(P2B_INIT_MARKET_ARGS, { rGapBps: 0, lLaunchX100: 550, rent: RENT, band: BAND }).subarray(0, -18), h("0000"), h("58020000"), h("28230000"), h("0700000000000000")),
  initMarketZeroLaunch: () => cat(base(), h("9001"), h("0000")),
  request76ZeroFloor: () => cat(h("4c"), new Uint8Array(16).fill(1), new Uint8Array(8), h("01")),
  request76KeeperTwo: () => cat(h("4c"), new Uint8Array(16).fill(1), new Uint8Array(8).fill(1), h("02")),
  execute77AllZero: () => h("4d" + "0100" + "00".repeat(9)),
  execute77Refresh9: () => h("4d" + "0100" + "0100000000000000" + "09"),
  g9Allowlist17: () => cat(h("75" + "11"), new Uint8Array(17 * 32).fill(1)),
  tag113Reserved: () => h("71"),
  tag114Reserved: () => h("72"),
  tag115Reserved: () => h("73"),
};
