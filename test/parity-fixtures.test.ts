import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  IX_TAG,
  MATCHER_MAGIC,
  VAMM_MAGIC,
  MATCHER_CONTEXT_LEN,
  MATCHER_RETURN_LEN,
  MATCHER_CALL_LEN,
  INIT_CTX_LEN,
  CTX_VAMM_OFFSET,
  CTX_VAMM_LEN,
  CTX_RETURN_OFFSET,
} from "../src/abi/instructions.js";
import { POSITION_NFT_STATE_LEN } from "../src/abi/nft.js";
import { STAKE_IX, STAKE_POOL_SIZE } from "../src/solana/stake.js";

function loadJson<T>(filename: string): T {
  const fullPath = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "specs", filename);
  return JSON.parse(readFileSync(fullPath, "utf8")) as T;
}

describe("Rust parity fixtures", () => {
  it("wrapper instruction tags match percolator-prog", () => {
    const fixture = loadJson<{
      tags: Array<{ name: string; tag: number }>;
      gaps: number[];
    }>("wrapper-tags.json");

    // v17 SDK map: only v17 live instruction tags (verified against v17 percolator-prog)
    const sdkMap: Record<string, number> = {
      // Core tags 0-13
      InitMarket: IX_TAG.InitMarket,
      InitPortfolio: IX_TAG.InitPortfolio,
      InitLP: IX_TAG.InitLP,
      DepositCollateral: IX_TAG.DepositCollateral,
      WithdrawCollateral: IX_TAG.WithdrawCollateral,
      KeeperCrank: IX_TAG.KeeperCrank,
      TradeNoCpi: IX_TAG.TradeNoCpi,
      LiquidateAtOracle: IX_TAG.LiquidateAtOracle,
      CloseAccount: IX_TAG.CloseAccount,
      TopUpInsurance: IX_TAG.TopUpInsurance,
      TradeCpi: IX_TAG.TradeCpi,
      CloseSlab: IX_TAG.CloseSlab,
      // Sparse tags 19-80
      ResolveMarket: IX_TAG.ResolveMarket,
      TopUpBackingBucket: IX_TAG.TopUpBackingBucket,
      ConvertReleasedPnl: IX_TAG.ConvertReleasedPnl,
      CloseResolved: IX_TAG.CloseResolved,
      UpdateAuthority: IX_TAG.UpdateAuthority,
      ConfigureHybridOracle: IX_TAG.ConfigureHybridOracle,
      ConfigureEwmaMark: IX_TAG.ConfigureEwmaMark,
      PushEwmaMark: IX_TAG.PushEwmaMark,
      UpdateLiquidationFeePolicy: IX_TAG.UpdateLiquidationFeePolicy,
      ConfigurePermissionlessResolve: IX_TAG.ConfigurePermissionlessResolve,
      ResolveStalePermissionless: IX_TAG.ResolveStalePermissionless,
      UpdateAssetLifecycle: IX_TAG.UpdateAssetLifecycle,
      WithdrawInsurance: IX_TAG.WithdrawInsurance,
      CureAndCancelClose: IX_TAG.CureAndCancelClose,
      ForfeitRecoveryLeg: IX_TAG.ForfeitRecoveryLeg,
      RebalanceReduce: IX_TAG.RebalanceReduce,
      FinalizeResetSide: IX_TAG.FinalizeResetSide,
      ClaimResolvedPayoutTopup: IX_TAG.ClaimResolvedPayoutTopup,
      RefineResolvedUnreceiptedBound: IX_TAG.RefineResolvedUnreceiptedBound,
      SyncMaintenanceFee: IX_TAG.SyncMaintenanceFee,
      UpdateMaintenanceFeePolicy: IX_TAG.UpdateMaintenanceFeePolicy,
      WithdrawBackingBucket: IX_TAG.WithdrawBackingBucket,
      UpdateBackingFeePolicy: IX_TAG.UpdateBackingFeePolicy,
      WithdrawBackingBucketEarnings: IX_TAG.WithdrawBackingBucketEarnings,
      SyncBackingDomainLedger: IX_TAG.SyncBackingDomainLedger,
      SyncInsuranceLedger: IX_TAG.SyncInsuranceLedger,
      UpdateTradeFeePolicy: IX_TAG.UpdateTradeFeePolicy,
      TopUpInsuranceDomain: IX_TAG.TopUpInsuranceDomain,
      WithdrawInsuranceAsset: IX_TAG.WithdrawInsuranceAsset,
      UpdateFeeRedirectPolicy: IX_TAG.UpdateFeeRedirectPolicy,
      UpdateMarketInitFeePolicy: IX_TAG.UpdateMarketInitFeePolicy,
      UpdateBaseUnitMints: IX_TAG.UpdateBaseUnitMints,
      SwapSecondaryForPrimary: IX_TAG.SwapSecondaryForPrimary,
      ConfigureAuthMark: IX_TAG.ConfigureAuthMark,
      PushAuthMark: IX_TAG.PushAuthMark,
      ForceCloseAbandonedAsset: IX_TAG.ForceCloseAbandonedAsset,
      // v17 auth-overhaul toly tags (65-69)
      UpdateAssetAuthority: IX_TAG.UpdateAssetAuthority,
      BatchTradeNoCpi: IX_TAG.BatchTradeNoCpi,
      BatchTradeCpi: IX_TAG.BatchTradeCpi,
      SetMatcherConfig: IX_TAG.SetMatcherConfig,
      RestartAssetOracle: IX_TAG.RestartAssetOracle,
      // NFT / B-3 (72-73)
      TransferPortfolioOwnership: IX_TAG.TransferPortfolioOwnership,
      SetNftProgramId: IX_TAG.SetNftProgramId,
      // LP-vault (74-80)
      CreateLpVault: IX_TAG.CreateLpVault,
      DepositToLpVault: IX_TAG.DepositToLpVault,
      RequestRedeemLpShares: IX_TAG.RequestRedeemLpShares,
      ExecuteRedemption: IX_TAG.ExecuteRedemption,
      LpVaultCrankFees: IX_TAG.LpVaultCrankFees,
      SetLpVaultPaused: IX_TAG.SetLpVaultPaused,
      CloseLpVault: IX_TAG.CloseLpVault,
    };

    for (const entry of fixture.tags) {
      expect(sdkMap[entry.name], `${entry.name} tag mismatch`).toBe(entry.tag);
    }

    // v17: tag 57 is WithdrawInsuranceAsset (was a gap in v12.x)
    expect(IX_TAG).toHaveProperty("WithdrawInsuranceAsset");
    expect(IX_TAG.WithdrawInsuranceAsset).toBe(57);
    // v17 gaps include the removed v12.x range 14-18, 20-23 etc.
    expect(fixture.gaps).toContain(31);
  });

  it("stake tags and layout match percolator-stake", () => {
    const fixture = loadJson<{
      stake_pool_size: number;
      live_tags: Array<{ name: string; tag: number }>;
      removed_tags: number[];
      layout: {
        reserved_start: number;
        offsets: Record<string, number>;
      };
    }>("stake-parity.json");

    const sdkTags: Record<string, number> = {
      InitPool: STAKE_IX.InitPool,
      Deposit: STAKE_IX.Deposit,
      Withdraw: STAKE_IX.Withdraw,
      FlushToInsurance: STAKE_IX.FlushToInsurance,
      UpdateConfig: STAKE_IX.UpdateConfig,
      ReturnInsurance: STAKE_IX.ReturnInsurance,
      AccrueFees: STAKE_IX.AccrueFees,
      InitTradingPool: STAKE_IX.InitTradingPool,
      AdminSetHwmConfig: STAKE_IX.AdminSetHwmConfig,
      AdminSetTrancheConfig: STAKE_IX.AdminSetTrancheConfig,
      DepositJunior: STAKE_IX.DepositJunior,
      SetMarketResolved: STAKE_IX.SetMarketResolved,
    };

    expect(STAKE_POOL_SIZE).toBe(fixture.stake_pool_size);
    // v2 StakePool: pending_admin [u8;32] added at offset 288; _reserved shifts to 320.
    // All absolute offsets += 32 vs v1 (reserved_start was 288 in v1, now 320 in v2).
    expect(fixture.layout.reserved_start).toBe(320);
    expect(fixture.layout.offsets.market_resolved).toBe(329);  // 320 + 9
    expect(fixture.layout.offsets.hwm_enabled).toBe(330);      // 320 + 10
    expect(fixture.layout.offsets.hwm_floor_bps).toBe(331);    // 320 + 11
    expect(fixture.layout.offsets.epoch_high_water_tvl).toBe(336); // 320 + 16
    expect(fixture.layout.offsets.hwm_last_epoch).toBe(344);   // 320 + 24
    expect(fixture.layout.offsets.tranche_enabled).toBe(352);  // 320 + 32
    expect(fixture.layout.offsets.junior_balance).toBe(353);   // 320 + 33
    expect(fixture.layout.offsets.junior_total_lp).toBe(361);  // 320 + 41
    expect(fixture.layout.offsets.junior_fee_mult_bps).toBe(369); // 320 + 49

    for (const entry of fixture.live_tags) {
      expect(sdkTags[entry.name]).toBe(entry.tag);
    }

    expect(fixture.removed_tags).toEqual([5, 6, 7, 8, 9, 11, 17]);
  });

  it("PositionNft layout matches percolator-nft", () => {
    const fixture = loadJson<{
      position_nft_len: number;
      offsets: Record<string, number>;
    }>("nft-parity.json");

    expect(POSITION_NFT_STATE_LEN).toBe(fixture.position_nft_len);
    expect(fixture.offsets.portfolio_account).toBe(10);
    expect(fixture.offsets.nft_mint).toBe(42);
    expect(fixture.offsets.asset_index).toBe(74);
    expect(fixture.offsets.position_owner_at_mint).toBe(127);
    expect(fixture.offsets.reserved).toBe(167);
  });

  describe("matcher", () => {
    type MatcherParityFixture = {
      constants: {
        MATCHER_MAGIC_hex: string;
        MATCHER_ABI_VERSION: number;
        MATCHER_KIND_PASSIVE: number;
        MATCHER_KIND_VAMM: number;
        MATCHER_VERSION: number;
      };
      sizes: {
        MATCHER_CONTEXT_LEN: number;
        MATCHER_RETURN_LEN: number;
        MATCHER_CALL_LEN: number;
        INIT_CTX_LEN: number;
        CTX_VAMM_OFFSET: number;
        CTX_VAMM_LEN: number;
        CTX_RETURN_OFFSET: number;
        MatcherCtx_size: number;
      };
      self_checks: Record<string, boolean>;
    };

    it("magic, sizes, and self-checks match percolator-match", () => {
      const fixture = loadJson<MatcherParityFixture>("matcher-parity.json");

      // All fixture self-checks must pass (they're Rust compile-time assertions).
      for (const [name, ok] of Object.entries(fixture.self_checks)) {
        expect(ok, `fixture self-check ${name}`).toBe(true);
      }

      // MATCHER_MAGIC / VAMM_MAGIC: both SDK names point to the same constant.
      // The fixture stores it as a hex string — parse and compare.
      const fixtureMagic = BigInt(fixture.constants.MATCHER_MAGIC_hex);
      expect(VAMM_MAGIC).toBe(fixtureMagic);
      expect(MATCHER_MAGIC).toBe(fixtureMagic);

      // Layout size constants.
      expect(MATCHER_CONTEXT_LEN).toBe(fixture.sizes.MATCHER_CONTEXT_LEN);
      expect(MATCHER_RETURN_LEN).toBe(fixture.sizes.MATCHER_RETURN_LEN);
      expect(MATCHER_CALL_LEN).toBe(fixture.sizes.MATCHER_CALL_LEN);
      expect(INIT_CTX_LEN).toBe(fixture.sizes.INIT_CTX_LEN);
      expect(CTX_VAMM_OFFSET).toBe(fixture.sizes.CTX_VAMM_OFFSET);
      expect(CTX_VAMM_LEN).toBe(fixture.sizes.CTX_VAMM_LEN);
      expect(CTX_RETURN_OFFSET).toBe(fixture.sizes.CTX_RETURN_OFFSET);
    });
  });
});
