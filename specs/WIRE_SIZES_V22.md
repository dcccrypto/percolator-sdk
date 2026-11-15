# v2.2 instruction wire table

Source: `dcccrypto/percolator-prog` @ `feat/v22-rc23-2026-10-22` (d27f3d73), `src/v16_program.rs`, `Instruction::decode` (lines 10065-10963).
The decoder rejects trailing bytes (line 10958), so the length is exact. `len` includes the tag byte. Offsets are from byte 0 (tag at 0).
Generated from `test/wire-size-v22/table.ts` (`pnpm exec tsx scripts/gen-wire-size-doc.ts > specs/WIRE_SIZES_V22.md`); checked by `test/wire-size-v22.test.ts`.

| tag | name | form | len | fields (offset:type) | program line |
|---|---|---|---|---|---|
| 0 | InitMarket | base | 219 | 1:u16 3:u64 11:u64 19:u64 27:u128 43:u128 59:u64 67:u64 75:u64 83:u64 91:u64 99:u128 115:u128 131:u64 139:u64 147:u64 155:u64 163:u64 171:u64 179:u64 187:u128 203:u128 | v16_program.rs:10070 |
| 0 | InitMarketV19 | base + growth(4) = 223 B | 223 | 1:u16 3:u64 11:u64 19:u64 27:u128 43:u128 59:u64 67:u64 75:u64 83:u64 91:u64 99:u128 115:u128 131:u64 139:u64 147:u64 155:u64 163:u64 171:u64 179:u64 187:u128 203:u128 219:u16 221:u16 | v16_program.rs:10070 |
| 0 | InitMarketV22 | base + growth(4) + lot(1) = 224 B | 224 | 1:u16 3:u64 11:u64 19:u64 27:u128 43:u128 59:u64 67:u64 75:u64 83:u64 91:u64 99:u128 115:u128 131:u64 139:u64 147:u64 155:u64 163:u64 171:u64 179:u64 187:u128 203:u128 219:u16 221:u16 223:u8 | v16_program.rs:10070 |
| 0 | InitMarketV22 | base + growth(4) + rent(6) = 229 B | 229 | 1:u16 3:u64 11:u64 19:u64 27:u128 43:u128 59:u64 67:u64 75:u64 83:u64 91:u64 99:u128 115:u128 131:u64 139:u64 147:u64 155:u64 163:u64 171:u64 179:u64 187:u128 203:u128 219:u16 221:u16 223:u32 227:u16 | v16_program.rs:10070 |
| 0 | InitMarketV22 | base + growth(4) + lot(1) + rent(6) = 230 B | 230 | 1:u16 3:u64 11:u64 19:u64 27:u128 43:u128 59:u64 67:u64 75:u64 83:u64 91:u64 99:u128 115:u128 131:u64 139:u64 147:u64 155:u64 163:u64 171:u64 179:u64 187:u128 203:u128 219:u16 221:u16 223:u8 224:u32 228:u16 | v16_program.rs:10070 |
| 0 | InitMarketV22 | base + growth(4) + rent(6) + band(18) = 247 B | 247 | 1:u16 3:u64 11:u64 19:u64 27:u128 43:u128 59:u64 67:u64 75:u64 83:u64 91:u64 99:u128 115:u128 131:u64 139:u64 147:u64 155:u64 163:u64 171:u64 179:u64 187:u128 203:u128 219:u16 221:u16 223:u32 227:u16 229:u16 231:u32 235:u32 239:u64 | v16_program.rs:10070 |
| 0 | InitMarketV22 | base + growth(4) + lot(1) + rent(6) + band(18) = 248 B | 248 | 1:u16 3:u64 11:u64 19:u64 27:u128 43:u128 59:u64 67:u64 75:u64 83:u64 91:u64 99:u128 115:u128 131:u64 139:u64 147:u64 155:u64 163:u64 171:u64 179:u64 187:u128 203:u128 219:u16 221:u16 223:u8 224:u32 228:u16 230:u16 232:u32 236:u32 240:u64 | v16_program.rs:10070 |
| 1 | InitPortfolio | bare | 1 | - | v16_program.rs:10170 |
| 3 | Deposit | fixed | 33 | 1:u64 9:u64 17:u128 | v16_program.rs:10171 |
| 4 | Withdraw | fixed | 33 | 1:u64 9:u64 17:u128 | v16_program.rs:10176 |
| 5 | PermissionlessCrank | 2 observations | 16 | 1:u64 9:u8 10:u16 12:u8 13:u16 15:u8 | v16_program.rs:10181 |
| 6 | TradeNoCpi | fixed | 77 | 1:u64 9:u64 17:u64 25:u64 33:u16 35:u64 43:i128 59:u64 67:u64 75:u16 | v16_program.rs:10199 |
| 8 | ClosePortfolio | fixed | 25 | 1:u64 9:u64 17:u64 | v16_program.rs:10277 |
| 9 | TopUpInsurance | fixed | 41 | 1:u64 9:u64 17:u64 25:u128 | v16_program.rs:10287 |
| 10 | TradeCpi | fixed | 85 | 1:u64 9:u64 17:u64 25:u64 33:u64 41:u16 43:u64 51:i128 67:u64 75:u64 83:u16 | v16_program.rs:10211 |
| 13 | CloseSlab | fixed | 9 | 1:u64 | v16_program.rs:10300 |
| 19 | ResolveMarket | fixed | 17 | 1:u64 9:u64 | v16_program.rs:10303 |
| 24 | TopUpBackingBucket | fixed | 51 | 1:u16 3:u64 11:u64 19:u64 27:u128 43:u64 | v16_program.rs:10307 |
| 28 | ConvertReleasedPnl | fixed | 33 | 1:u64 9:u64 17:u128 | v16_program.rs:10321 |
| 30 | CloseResolved | permissionless form via buildCloseResolvedUnsignedIxP3 (fee_rate = 0) | 17 | 1:u128 | v16_program.rs:10326 |
| 32 | UpdateAuthority | fixed | 41 | 1:pk 33:u64 | v16_program.rs:10329 |
| 34 | ConfigureHybridOracle | fixed | 172 | 1:u16 3:u64 11:u64 19:i64 27:u8 28:u8 29:u64 37:u64 45:u64 53:u64 61:u8 62:u32 66:u16 68:pk 100:pk 132:pk 164:u64 | v16_program.rs:10454 |
| 35 | ConfigureEwmaMark | fixed | 51 | 1:u16 3:u64 11:u64 19:u64 27:u64 35:u64 43:u64 | v16_program.rs:10475 |
| 36 | PushEwmaMark | fixed | 35 | 1:u16 3:u64 11:u64 19:u64 27:u64 | v16_program.rs:10484 |
| 39 | ResolveStalePermissionless | fixed | 9 | 1:u64 | v16_program.rs:10451 |
| 40 | UpdateAssetLifecycle | fixed | 180 | 1:u8 2:u16 4:u64 12:u64 20:u64 28:u64 36:u128 52:pk 84:pk 116:pk 148:pk | v16_program.rs:10491 |
| 41 | WithdrawInsurance | fixed | 17 | 1:u128 | v16_program.rs:10504 |
| 42 | CureAndCancelClose | fixed | 33 | 1:u64 9:u64 17:u128 | v16_program.rs:10513 |
| 43 | ForfeitRecoveryLeg | fixed | 35 | 1:u64 9:u64 17:u16 19:u128 | v16_program.rs:10518 |
| 44 | RebalanceReduce | fixed | 35 | 1:u64 9:u64 17:u16 19:u128 | v16_program.rs:10524 |
| 46 | ClaimResolvedPayoutTopup | bare via buildClaimResolvedPayoutTopupIxP3 | 1 | - | v16_program.rs:10534 |
| 50 | WithdrawBackingBucket | fixed | 35 | 1:u16 3:u64 11:u128 27:u64 | v16_program.rs:10315 |
| 51 | UpdateBackingFeePolicy | fixed | 23 | 1:u16 3:u64 11:u16 13:u16 15:u64 | v16_program.rs:10348 |
| 52 | WithdrawBackingBucketEarnings | fixed | 35 | 1:u16 3:u64 11:u128 27:u64 | v16_program.rs:10435 |
| 55 | UpdateTradeFeePolicy | fixed | 17 | 1:u64 9:u64 | v16_program.rs:10355 |
| 56 | TopUpInsuranceDomain | fixed | 43 | 1:u16 3:u64 11:u64 19:u64 27:u128 | v16_program.rs:10293 |
| 57 | WithdrawInsuranceAsset | fixed | 35 | 1:u16 3:u64 11:u128 27:u64 | v16_program.rs:10507 |
| 60 | UpdateBaseUnitMints | fixed | 73 | 1:pk 33:pk 65:u64 | v16_program.rs:10372 |
| 61 | SwapSecondaryForPrimary | fixed | 25 | 1:u128 17:u64 | v16_program.rs:10377 |
| 62 | ConfigureAuthMark | fixed | 35 | 1:u16 3:u64 11:u64 19:u64 27:u64 | v16_program.rs:10381 |
| 63 | PushAuthMark | no depth | 35 | 1:u16 3:u64 11:u64 19:u64 27:u64 | v16_program.rs:10388 |
| 63 | PushAuthMarkDepth | G8 depth tail (44 B total) | 44 | 1:u16 3:u64 11:u64 19:u64 27:u64 35:u8 36:u64 | v16_program.rs:10388 |
| 65 | UpdateAssetAuthority | fixed | 52 | 1:u16 3:u64 11:u8 12:pk 44:u64 | v16_program.rs:10333 |
| 66 | BatchTradeNoCpi | 1 leg, then 4 x u64 account trailer | 76 | 1:u8 2:u16 4:u64 12:i128 28:u64 36:u64 44:u64 52:u64 60:u64 68:u64 | v16_program.rs:10224 |
| 67 | BatchTradeCpi | 1 leg, u128 slippage, u128 fee, 4 x u64, u64 seq | 116 | 1:u8 2:u16 4:u64 12:i128 28:u64 36:u64 44:u128 60:u128 76:u64 84:u64 92:u64 100:u64 108:u64 | v16_program.rs:10244 |
| 68 | SetMatcherConfig | fixed | 36 | 1:u64 9:u64 17:u64 25:u8 26:u16 28:u64 | v16_program.rs:10269 |
| 69 | RestartAssetOracle | fixed | 35 | 1:u16 3:u64 11:u64 19:u64 27:u64 | v16_program.rs:10428 |
| 72 | TransferPortfolioOwnership | fixed | 35 | 1:pk 33:u16 | v16_program.rs:10611 |
| 73 | SetNftProgramId | fixed | 33 | 1:pk | v16_program.rs:10615 |
| 74 | CreateLpVault | fixed | 15 | 1:u16 3:u64 11:u16 13:u16 | v16_program.rs:10542 |
| 75 | DepositToLpVault | fixed | 19 | 1:u128 17:u16 | v16_program.rs:10548 |
| 76 | RequestRedeemLpShares | v2.2 (shares, floor, keeper_ok) = 26 B | 26 | 1:u128 17:u64 25:u8 | v16_program.rs:10557 |
| 76 | RequestRedeemLpShares | legacy 17 B (shares only): RETIRED by the program (line 10565) **(SDK emits a rejected shape)** | 17 | 1:u128 | v16_program.rs:10557 |
| 77 | ExecuteRedemption | legacy domain only = 3 B | 3 | 1:u16 | v16_program.rs:10583 |
| 77 | ExecuteRedemptionV22 | domain, floor, n_refresh = 12 B | 12 | 1:u16 3:u64 11:u8 | v16_program.rs:10583 |
| 78 | LpVaultCrankFees | fixed | 3 | 1:u16 | v16_program.rs:10602 |
| 79 | SetLpVaultPaused | fixed | 2 | 1:u8 | v16_program.rs:10605 |
| 80 | CloseLpVault | bare | 1 | - | v16_program.rs:10608 |
| 83 | InitMatcherCtx | fixed | 70 | 1:u8 2:u32 6:u32 10:u32 14:u32 18:u128 34:u128 50:u128 66:u16 68:u16 | v16_program.rs:10621 |
| 84 | WithdrawProtocolFee | fixed | 25 | 1:u128 17:u64 | v16_program.rs:10646 |
| 85 | SetProtocolFeeAuthority | fixed | 33 | 1:pk | v16_program.rs:10650 |
| 86 | UpdateFeeSplit | fixed | 15 | 1:u16 3:u16 5:u16 7:u64 | v16_program.rs:10709 |
| 87 | WithdrawInsuranceReserveToStake | bare | 1 | - | v16_program.rs:10715 |
| 88 | UpdateMaintenanceFeePerSlot | fixed | 17 | 1:u128 | v16_program.rs:10716 |
| 89 | ExpireBackingBucket | fixed | 3 | 1:u16 | v16_program.rs:10719 |
| 90 | WithdrawCreatorFee | fixed | 27 | 1:u128 17:u16 19:u64 | v16_program.rs:10728 |
| 91 | RebalanceLpVaultBacking | fixed | 21 | 1:u16 3:u16 5:u128 | v16_program.rs:10552 |
| 92 | UpdateInsuranceWithdrawPolicy | fixed | 18 | 1:u8 2:u64 10:u64 | v16_program.rs:10363 |
| 93 | SetAssetRiskLimits | 41 B base (no tail) | 41 | 1:u16 3:u16 5:u32 9:u128 25:u128 | v16_program.rs:10653 |
| 93 | SetAssetRiskLimits | base + ext_mode u8 + max_requested_fee u16 = 44 B | 44 | 1:u16 3:u16 5:u32 9:u128 25:u128 41:u8 42:u16 | v16_program.rs:10653 |
| 93 | SetAssetRiskLimitsV19 | base(44) + lambda u32, kink u16 = 50 B | 50 | 1:u16 3:u16 5:u32 9:u128 25:u128 41:u8 42:u16 44:u32 48:u16 | v16_program.rs:10653 |
| 93 | SetAssetRiskLimitsV19 | base(44) + lambda, kink, util_fee_max u16 = 52 B | 52 | 1:u16 3:u16 5:u32 9:u128 25:u128 41:u8 42:u16 44:u32 48:u16 50:u16 | v16_program.rs:10653 |
| 93 | SetAssetRiskLimitsV22Tiers | base(44) + lambda, kink, util_fee_max, tiers(18), attested_max_tier u8 = 71 B | 71 | 1:u16 3:u16 5:u32 9:u128 25:u128 41:u8 42:u16 44:u32 48:u16 50:u16 52:u32 56:u32 60:u32 64:u16 66:u16 68:u16 70:u8 | v16_program.rs:10653 |
| 94 | InitVaultLp | junior floor only = 3 B | 3 | 1:u16 | v16_program.rs:10733 |
| 94 | InitVaultLpV19 | floor + l_launch = 5 B | 5 | 1:u16 3:u16 | v16_program.rs:10733 |
| 94 | InitVaultLpV22Tiers | floor + l_launch + tiers(18) = 23 B | 23 | 1:u16 3:u16 5:u32 9:u32 13:u32 17:u16 19:u16 21:u16 | v16_program.rs:10733 |
| 95 | VaultLpSetMatcher | fixed | 96 | 1:u64 9:u64 17:u16 19:u64 27:u8 28:u32 32:u32 36:u32 40:u32 44:u128 60:u128 76:u128 92:u16 94:u16 | v16_program.rs:10758 |
| 96 | DepositJuniorTranche | fixed | 17 | 1:u128 | v16_program.rs:10774 |
| 97 | WithdrawJuniorTranche | fixed | 17 | 1:u128 | v16_program.rs:10777 |
| 98 | VaultLpRecall | fixed | 19 | 1:u128 17:u16 | v16_program.rs:10780 |
| 99 | SetVaultLpRisk | base = 73 B | 73 | 1:u16 3:u64 11:u64 19:u128 35:u16 37:u32 41:pk | v16_program.rs:10784 |
| 99 | SetVaultLpRiskV19 | base + 4 x u16 dials = 81 B | 81 | 1:u16 3:u64 11:u64 19:u128 35:u16 37:u32 41:pk 73:u16 75:u16 77:u16 79:u16 | v16_program.rs:10784 |
| 100 | VaultLpConvertPnl | fixed | 17 | 1:u128 | v16_program.rs:10818 |
| 101 | VaultLpSettleResolved | fixed | 2 | 1:u8 | v16_program.rs:10821 |
| 102 | VaultLpReleaseSurplus | fixed | 19 | 1:u128 17:u16 | v16_program.rs:10824 |
| 103 | VaultLpAllocate | fixed | 17 | 1:u128 | v16_program.rs:10840 |
| 104 | AdlWindDown | fixed | 27 | 1:u64 9:u16 11:u64 19:u64 | v16_program.rs:10828 |
| 105 | SetAdlWindDownMaxSlots | fixed | 7 | 1:u16 3:u32 | v16_program.rs:10834 |
| 106 | SettleHoldingRent | fixed | 11 | 1:u16 3:u64 | v16_program.rs:10881 |
| 107 | InitBondTranche | fixed | 11 | 1:u16 3:u16 5:u32 9:u16 | v16_program.rs:10843 |
| 108 | BondDeposit | fixed | 25 | 1:u64 9:u128 | v16_program.rs:10849 |
| 109 | BondRequestWithdraw | fixed | 17 | 1:u128 | v16_program.rs:10853 |
| 110 | BondExecuteWithdraw | fixed | 11 | 1:u64 9:u16 | v16_program.rs:10856 |
| 111 | InsuranceBackstopDraw | fixed | 18 | 1:u8 2:u128 | v16_program.rs:10860 |
| 112 | RescueDeposit | fixed | 26 | 1:u8 2:u64 10:u128 | v16_program.rs:10864 |
| 116 | InitInsuranceUnits | bare | 1 | - | v16_program.rs:10869 |
| 117 | SetG9FeedAllowlist | count u8 + 2 x 32 B | 66 | 1:u8 2:pk 34:pk | v16_program.rs:10870 |
| 118 | SweepBandDustLeg | fixed | 3 | 1:u16 | v16_program.rs:10885 |
| 119 | EvictAndTradeCpi | tag + TradeCpi body (84 B) = 85 B | 85 | 1:u64 9:u64 17:u64 25:u64 33:u64 41:u16 43:u64 51:i128 67:u64 75:u64 83:u16 | v16_program.rs:10888 |
| 120 | ProposeG9FeedAllowlist | count u8 + 1 x (feed 32 + owner 32) | 66 | 1:u8 2:pk 34:pk | v16_program.rs:10901 |
| 121 | CommitG9FeedAllowlist | bare | 1 | - | v16_program.rs:10914 |
| 122 | InitLpShareMetadata | generic (n = 0) | 2 | 1:u8 | v16_program.rs:10915 |
| 122 | InitLpShareMetadata | ticker 'ABCD' (n = 4) | 6 | 1:u8 2:u8 3:u8 4:u8 5:u8 | v16_program.rs:10915 |
| 123 | SetDepthSource | fixed (12 B) | 12 | 1:u8 2:u16 4:u64 | v16_program.rs:10943 |
| 124 | LevGuard | op 0 INIT: t0 u64 | 10 | 1:u8 2:u64 | v16_program.rs:10926 |
| 124 | LevGuard | op 1 SET_RISK_KEY: key 32 B | 34 | 1:u8 2:pk | v16_program.rs:10926 |
| 124 | LevGuard | op 2 REPORT: 4 x u16 | 10 | 1:u8 2:u16 4:u16 6:u16 8:u16 | v16_program.rs:10926 |
| 124 | LevGuard | op 3 TIGHTEN: nothing | 2 | 1:u8 | v16_program.rs:10926 |
| 124 | LevGuard | op 4 POKE: nothing | 2 | 1:u8 | v16_program.rs:10926 |
| 124 | LevGuard | op 5 LP_STOP: nothing | 2 | 1:u8 | v16_program.rs:10926 |
| 124 | LevGuard | op 6 SET_T0: t0 u64 | 10 | 1:u8 2:u64 | v16_program.rs:10926 |
| 125 | SetCreatorFeePayee | fixed | 51 | 1:u16 3:u64 11:pk 43:u64 | v16_program.rs:10722 |

## Tags the program decodes with no SDK encoder

| tag | name | len | program line |
|---|---|---|---|
| 37 | UpdateLiquidationFeePolicy | 11 (u16, u64) | v16_program.rs:10340 |
| 38 | ConfigurePermissionlessResolve | 33 (4 x u64) | v16_program.rs:10445 |
| 45 | FinalizeResetSide | 4 (u16, u8) | v16_program.rs:10530 |
| 47 | RefineResolvedUnreceiptedBound | 17 (u128) | v16_program.rs:10535 |
| 48 | SyncMaintenanceFee | 9 (u64) | v16_program.rs:10538 |
| 49 | UpdateMaintenanceFeePolicy | 11 (u16, u64) | v16_program.rs:10344 |
| 53 | SyncBackingDomainLedger | 3 (u16) | v16_program.rs:10441 |
| 54 | SyncInsuranceLedger | 1 | v16_program.rs:10444 |
| 58 | UpdateFeeRedirectPolicy | 11 (u16, u64) | v16_program.rs:10359 |
| 59 | UpdateMarketInitFeePolicy | 25 (u128, u64) | v16_program.rs:10368 |
| 64 | ForceCloseAbandonedAsset | 27 (u16, u64, u128) | v16_program.rs:10423 |
| 81 | CancelRedemption | 1 | v16_program.rs:10609 |
| 82 | UnwrapEscrowedPortfolio | 33 (32 B pubkey) | v16_program.rs:10618 |
