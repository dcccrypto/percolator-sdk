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

    const sdkMap: Record<string, number> = {
      InitMarket: IX_TAG.InitMarket,
      InitUser: IX_TAG.InitUser,
      InitLP: IX_TAG.InitLP,
      DepositCollateral: IX_TAG.DepositCollateral,
      WithdrawCollateral: IX_TAG.WithdrawCollateral,
      KeeperCrank: IX_TAG.KeeperCrank,
      TradeNoCpi: IX_TAG.TradeNoCpi,
      LiquidateAtOracle: IX_TAG.LiquidateAtOracle,
      CloseAccount: IX_TAG.CloseAccount,
      TopUpInsurance: IX_TAG.TopUpInsurance,
      TradeCpi: IX_TAG.TradeCpi,
      SetRiskThreshold: IX_TAG.SetRiskThreshold,
      UpdateAdmin: IX_TAG.UpdateAdmin,
      CloseSlab: IX_TAG.CloseSlab,
      UpdateConfig: IX_TAG.UpdateConfig,
      SetMaintenanceFee: IX_TAG.SetMaintenanceFee,
      SetOraclePriceCap: IX_TAG.SetOraclePriceCap,
      ResolveMarket: IX_TAG.ResolveMarket,
      WithdrawInsurance: IX_TAG.WithdrawInsurance,
      AdminForceClose: IX_TAG.AdminForceClose,
      SetInsuranceWithdrawPolicy: IX_TAG.SetInsuranceWithdrawPolicy,
      WithdrawInsuranceLimited: IX_TAG.WithdrawInsuranceLimited,
      QueryLpFees: IX_TAG.QueryLpFees,
      ReclaimEmptyAccount: IX_TAG.ReclaimEmptyAccount,
      SettleAccount: IX_TAG.SettleAccount,
      DepositFeeCredits: IX_TAG.DepositFeeCredits,
      ConvertReleasedPnl: IX_TAG.ConvertReleasedPnl,
      ResolvePermissionless: IX_TAG.ResolvePermissionless,
      ForceCloseResolved: IX_TAG.ForceCloseResolved,
      SetPythOracle: IX_TAG.SetPythOracle,
      UpdateMarkPrice: IX_TAG.UpdateMarkPrice,
      UpdateHyperpMark: IX_TAG.UpdateHyperpMark,
      TradeCpiV2: IX_TAG.TradeCpiV2,
      UnresolveMarket: IX_TAG.UnresolveMarket,
      CreateLpVault: IX_TAG.CreateLpVault,
      LpVaultDeposit: IX_TAG.LpVaultDeposit,
      LpVaultWithdraw: IX_TAG.LpVaultWithdraw,
      LpVaultCrankFees: IX_TAG.LpVaultCrankFees,
      FundMarketInsurance: IX_TAG.FundMarketInsurance,
      SetInsuranceIsolation: IX_TAG.SetInsuranceIsolation,
      ChallengeSettlement: IX_TAG.ChallengeSettlement,
      ResolveDispute: IX_TAG.ResolveDispute,
      DepositLpCollateral: IX_TAG.DepositLpCollateral,
      WithdrawLpCollateral: IX_TAG.WithdrawLpCollateral,
      QueueWithdrawal: IX_TAG.QueueWithdrawal,
      ClaimQueuedWithdrawal: IX_TAG.ClaimQueuedWithdrawal,
      CancelQueuedWithdrawal: IX_TAG.CancelQueuedWithdrawal,
      ExecuteAdl: IX_TAG.ExecuteAdl,
      CloseStaleSlabs: IX_TAG.CloseStaleSlabs,
      ReclaimSlabRent: IX_TAG.ReclaimSlabRent,
      AuditCrank: IX_TAG.AuditCrank,
      SetOffsetPair: IX_TAG.SetOffsetPair,
      AttestCrossMargin: IX_TAG.AttestCrossMargin,
      AdvanceOraclePhase: IX_TAG.AdvanceOraclePhase,
      SlashCreationDeposit: IX_TAG.SlashCreationDeposit,
      InitSharedVault: IX_TAG.InitSharedVault,
      AllocateMarket: IX_TAG.AllocateMarket,
      QueueWithdrawalSV: IX_TAG.QueueWithdrawalSV,
      ClaimEpochWithdrawal: IX_TAG.ClaimEpochWithdrawal,
      AdvanceEpoch: IX_TAG.AdvanceEpoch,
      MintPositionNft: IX_TAG.MintPositionNft,
      TransferPositionOwnership: IX_TAG.TransferPositionOwnership,
      BurnPositionNft: IX_TAG.BurnPositionNft,
      SetPendingSettlement: IX_TAG.SetPendingSettlement,
      ClearPendingSettlement: IX_TAG.ClearPendingSettlement,
      TransferOwnershipCpi: IX_TAG.TransferOwnershipCpi,
      SetWalletCap: IX_TAG.SetWalletCap,
      SetOiImbalanceHardBlock: IX_TAG.SetOiImbalanceHardBlock,
      RescueOrphanVault: IX_TAG.RescueOrphanVault,
      CloseOrphanSlab: IX_TAG.CloseOrphanSlab,
      SetDexPool: IX_TAG.SetDexPool,
      InitMatcherCtx: IX_TAG.InitMatcherCtx,
      PauseMarket: IX_TAG.PauseMarket,
      UnpauseMarket: IX_TAG.UnpauseMarket,
      SetMaxPnlCap: IX_TAG.SetMaxPnlCap,
      SetOiCapMultiplier: IX_TAG.SetOiCapMultiplier,
      SetDisputeParams: IX_TAG.SetDisputeParams,
      SetLpCollateralParams: IX_TAG.SetLpCollateralParams,
      AcceptAdmin: IX_TAG.AcceptAdmin,
    };

    for (const entry of fixture.tags) {
      expect(sdkMap[entry.name]).toBe(entry.tag);
    }

    expect(IX_TAG).not.toHaveProperty("57");
    expect(fixture.gaps).toEqual([31, 57]);
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
    expect(fixture.layout.reserved_start).toBe(288);
    expect(fixture.layout.offsets.market_resolved).toBe(297);
    expect(fixture.layout.offsets.hwm_enabled).toBe(298);
    expect(fixture.layout.offsets.hwm_floor_bps).toBe(299);
    expect(fixture.layout.offsets.epoch_high_water_tvl).toBe(304);
    expect(fixture.layout.offsets.hwm_last_epoch).toBe(312);
    expect(fixture.layout.offsets.tranche_enabled).toBe(320);
    expect(fixture.layout.offsets.junior_balance).toBe(321);
    expect(fixture.layout.offsets.junior_total_lp).toBe(329);
    expect(fixture.layout.offsets.junior_fee_mult_bps).toBe(337);

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
    expect(fixture.offsets.position_owner).toBe(160);
    expect(fixture.offsets.reserved).toBe(192);
    expect(fixture.offsets.nft_mint).toBe(56);
    expect(fixture.offsets.user_idx).toBe(48);
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
