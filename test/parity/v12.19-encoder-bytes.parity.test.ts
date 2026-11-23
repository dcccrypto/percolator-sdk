/**
 * v12.19 → v17 encoder migration parity.
 *
 * This file was originally generated from wrapper target d760fc4 (PR #271,
 * branch sync/v12.19-wrapper). After the v17 convergence (SDK 3.0.0), the
 * v12.19-specific encoders (UpdateConfig tag 14, PERC-628 shared vault tags
 * 59-63 / SDK-v12 names) no longer emit bytes — they throw removedInstruction().
 *
 * These tests document the v17 migration:
 *   - v12.19 encoders that now throw are verified to throw
 *   - IX_TAG values that changed between v12.19 and v17 are asserted at v17 values
 *   - The still-live encoders (InitMarket) continue to pass unchanged
 */
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";

import {
  IX_TAG,
  encodeInitMarket,
  encodeUpdateConfig,
  encodeInitSharedVault,
  encodeAllocateMarket,
  encodeQueueWithdrawalSV,
  encodeClaimEpochWithdrawal,
  encodeAdvanceEpoch,
} from "../../src/abi/instructions.js";

const ZERO_FEED = "0000000000000000000000000000000000000000000000000000000000000000";

describe("v12.19 encoder byte parity", () => {
  // ---------------------------------------------------------------------------
  // UpdateConfig (tag 14) — REMOVED in v17
  // ---------------------------------------------------------------------------
  describe("UpdateConfig (tag 14)", () => {
    it("emits removedInstruction throw — UpdateConfig is not in v17", () => {
      // v12.19: emitted 35 bytes (4 funding fields + tvl_insurance_cap_mult u16)
      // v17: tag 14 has no decode arm → encoder throws removedInstruction
      expect(() =>
        encodeUpdateConfig({
          fundingHorizonSlots: 100n,
          fundingKBps: 5n,
          fundingMaxPremiumBps: 200n,
          fundingMaxBpsPerSlot: 10n,
          tvlInsuranceCapMult: 250,
        })
      ).toThrow(/not accepted/i);
    });

    it("omitted tvlInsuranceCapMult case also throws in v17", () => {
      expect(() =>
        encodeUpdateConfig({
          fundingHorizonSlots: 0n,
          fundingKBps: 0n,
          fundingMaxPremiumBps: 0n,
          fundingMaxBpsPerSlot: 0n,
        })
      ).toThrow(/not accepted/i);
    });
  });

  // ---------------------------------------------------------------------------
  // InitMarket (tag 0) — still live in v17, unchanged wire format
  // ---------------------------------------------------------------------------
  describe("InitMarket (tag 0)", () => {
    const baseArgs = {
      admin: PublicKey.default,
      collateralMint: PublicKey.default,
      indexFeedId: ZERO_FEED,
      maxStalenessSecs: 60n,
      confFilterBps: 50,
      invert: 0,
      unitScale: 0,
      initialMarkPriceE6: 0n,
      warmupPeriodSlots: 1000n,
      maintenanceMarginBps: 500n,
      initialMarginBps: 1000n,
      tradingFeeBps: 10n,
      maxAccounts: 1000n,
      newAccountFee: 1_000_000n,
      maintenanceFeePerSlot: 100n,
      maxCrankStalenessSlots: 50n,
      liquidationFeeBps: 100n,
      liquidationFeeCap: 10_000_000n,
      liquidationBufferBps: 50n,
      minLiquidationAbs: 1_000_000n,
      minNonzeroMmReq: 1000n,
      minNonzeroImReq: 2000n,
    };

    it("emits 203-byte payload (v17: INIT_MARKET_V17_LEN, no ext tail)", () => {
      // v17 BREAKING: payload reduced from 370 bytes (304 base + 66 ext tail) to 219 bytes, then to 203 when public_b_chunk_atoms was dropped (engine 083a0d08).
      // admin/collateralMint/feedId moved to account metas or ConfigureHybridOracle.
      const data = encodeInitMarket(baseArgs);
      expect(data.length).toBe(203);
      expect(data[0]).toBe(IX_TAG.InitMarket);
    });

    it("ignores deprecated v12.17 fields (maxInsuranceFloor, minOraclePriceCap, minInitialDeposit)", () => {
      const without = encodeInitMarket(baseArgs);
      const withDeprecated = encodeInitMarket({
        ...baseArgs,
        maxInsuranceFloor: 99999n,
        minOraclePriceCap: 88888n,
        minInitialDeposit: 77777n,
      });
      // v17: all these deprecated fields are silently ignored → both produce 203 bytes
      expect(without.length).toBe(203);
      expect(withDeprecated.length).toBe(203);
      expect(Buffer.from(without).equals(Buffer.from(withDeprecated))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // PERC-628 shared vault (v12 tags 59-63) — REMOVED in v17
  // In v17, these tags use v12 IX_TAG *values* 94-98, not 59-63.
  // The encoders throw removedInstruction().
  // ---------------------------------------------------------------------------
  describe("PERC-628 shared vault (tags 59-63)", () => {
    it("InitSharedVault throws removedInstruction (not in v17)", () => {
      expect(() =>
        encodeInitSharedVault({ epochDurationSlots: 1000n, maxMarketExposureBps: 500 })
      ).toThrow(/not accepted/i);
    });

    it("AllocateMarket throws removedInstruction (not in v17)", () => {
      expect(() =>
        encodeAllocateMarket({ amount: 1_000_000_000n })
      ).toThrow(/not accepted/i);
    });

    it("QueueWithdrawalSV throws removedInstruction (not in v17)", () => {
      expect(() =>
        encodeQueueWithdrawalSV({ lpAmount: 1000n })
      ).toThrow(/not accepted/i);
    });

    it("ClaimEpochWithdrawal throws removedInstruction (not in v17)", () => {
      expect(() =>
        encodeClaimEpochWithdrawal()
      ).toThrow(/not accepted/i);
    });

    it("AdvanceEpoch throws removedInstruction (not in v17)", () => {
      expect(() =>
        encodeAdvanceEpoch()
      ).toThrow(/not accepted/i);
    });
  });

  // ---------------------------------------------------------------------------
  // v17 IX_TAG sanity (replaces v12.19 sanity)
  // ---------------------------------------------------------------------------
  describe("v12.19 IX_TAG sanity", () => {
    it("UpdateAuthority is 32 in v17 (was 83 in v12.19)", () => {
      // v17 BREAKING: UpdateAuthority tag = 32, NO kind byte (v12.19 had tag 83 + kind byte)
      expect(IX_TAG.UpdateAuthority).toBe(32);
    });

    it("v12.19 PERC-628 tags (59-63) are reassigned in v17: SDK retains old values as deprecated", () => {
      // In v17, 59-63 are new toly instructions; the v12.19 PERC-628 encoders
      // moved to higher tag numbers in the SDK (94-98) to avoid collision.
      // These are all deprecated/removed (throw when called).
      expect(IX_TAG.InitSharedVault).toBe(94);   // v12.19 was 59
      expect(IX_TAG.AllocateMarket).toBe(95);    // v12.19 was 60
      expect(IX_TAG.QueueWithdrawalSV).toBe(96); // v12.19 was 61
      expect(IX_TAG.ClaimEpochWithdrawal).toBe(97); // v12.19 was 62
      expect(IX_TAG.AdvanceEpoch).toBe(98);      // v12.19 was 63
    });

    it("v17 tags 59-63 are new toly instructions (UpdateMarketInitFeePolicy=59, etc.)", () => {
      expect(IX_TAG.UpdateMarketInitFeePolicy).toBe(59);
      expect(IX_TAG.UpdateBaseUnitMints).toBe(60);
      expect(IX_TAG.SwapSecondaryForPrimary).toBe(61);
      expect(IX_TAG.ConfigureAuthMark).toBe(62);
      expect(IX_TAG.PushAuthMark).toBe(63);
    });

    it("WithdrawInsurance tag changed from 20 to 41 in v17", () => {
      expect(IX_TAG.WithdrawInsurance).toBe(41);
    });

    it("WithdrawInsuranceAsset (tag 57) is a new v17 instruction (was a gap in v12.x)", () => {
      expect(IX_TAG.WithdrawInsuranceAsset).toBe(57);
    });
  });
});
