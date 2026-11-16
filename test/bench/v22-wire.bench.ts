import { bench, describe } from "vitest";
import {
  encodeInitMarketTrailerV22,
  encodeRequestRedeemLpSharesV22,
  encodeExecuteRedemptionV22,
  encodeSettleHoldingRentV22,
  encodeBondDepositV22,
  encodeRescueDepositV22,
  bandDefaultsV22,
} from "../../src/abi/v22-wire.js";

const trailer = {
  rGapBps: 0,
  lLaunchX100: 550,
  lotExp: 3,
  rent: { rentMaxE9PerSlot: 100, rentKinkBps: 5000 },
  band: bandDefaultsV22(6),
};

describe("v22-wire encoders", () => {
  bench("encodeInitMarketTrailerV22 (full)", () => {
    encodeInitMarketTrailerV22(trailer);
  });
  bench("encodeRequestRedeemLpSharesV22", () => {
    encodeRequestRedeemLpSharesV22({ shares: 1_000_000n, minPayoutAtoms: 990_000n, keeperOk: true });
  });
  bench("encodeExecuteRedemptionV22", () => {
    encodeExecuteRedemptionV22({ domain: 1, minPayoutAtoms: 989_505n, nRefresh: 2 });
  });
  bench("encodeSettleHoldingRentV22", () => {
    encodeSettleHoldingRentV22(0, 123_456_789n);
  });
  bench("encodeBondDepositV22", () => {
    encodeBondDepositV22(5_000_000n, 4_900_000n);
  });
  bench("encodeRescueDepositV22", () => {
    encodeRescueDepositV22(0, 5_000_000n, 4_900_000n);
  });
});
