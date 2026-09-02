# PHASE 1 — IX_TAG drift

Source-of-truth wrappers:
- v12.17 (mainnet pin): /tmp/wrapper-v12.17 @ 06f86fb (commit dated 2026-04-22).
- v12.19: /path/to/perc-sync/work/percolator-prog @ d760fc4.

SDK: /path/to/percolator-sdk/src/abi/instructions.ts:17.

## Per-tag verification table

| sdk key | sdk byte | v12.17 wrapper | v12.19 wrapper | drift |
|:---|---:|:---|:---|:---|
| InitMarket | 0 | tag 0 (1465) | tag 0 (1789) | VERIFIED both |
| InitUser | 1 | tag 1 (1559) | tag 1 (1894) | VERIFIED both |
| InitLP | 2 | tag 2 (1564) | tag 2 (1899) | VERIFIED both |
| DepositCollateral | 3 | tag 3 (1575) | tag 3 (1910) | VERIFIED both |
| WithdrawCollateral | 4 | tag 4 (1581) | tag 4 (1916) | VERIFIED both |
| KeeperCrank | 5 | tag 5 (1587) | tag 5 (1922) | VERIFIED both |
| TradeNoCpi | 6 | tag 6 (1633) | tag 6 (1968) | VERIFIED both |
| LiquidateAtOracle | 7 | tag 7 (1644) | tag 7 (1979) | VERIFIED both |
| CloseAccount | 8 | tag 8 (1649) | tag 8 (1984) | VERIFIED both |
| TopUpInsurance | 9 | tag 9 (1654) | tag 9 (1989) | VERIFIED both |
| TradeCpi | 10 | tag 10 (1659) | tag 10 (1994) | VERIFIED both |
| SetRiskThreshold | 11 | not present (rejected) | not present (rejected) | VERIFIED both (deprecated throw) |
| **UpdateAdmin** | **12** | **DELETED** (comment at v12.17 src/percolator.rs:1672 "Tag 12 (UpdateAdmin) deleted — use UpdateAuthority { kind: AUTHORITY_ADMIN } (tag 32)") | tag 12 (2018) | **BYTE_DRIFT_BLOCKING for v12.17.** SDK encodeUpdateAdmin sends tag 12. Mainnet (v12.17.7 ≈ 06f86fb) rejects with InvalidInstructionData. |
| CloseSlab | 13 | tag 13 (1674) | tag 13 (2023) | VERIFIED both |
| **UpdateConfig** | **14** | tag 14 (1678) — **5 fields incl. `tvl_insurance_cap_mult: u16` = 35 bytes total** | tag 14 (2027) — **5 fields incl. `tvl_insurance_cap_mult: u16` = 35 bytes total** | **BYTE_DRIFT_BLOCKING for v12.17 default mode.** SDK `encodeUpdateConfig` default = 33 bytes (4 fields). v12.17 wrapper requires 35 bytes; trailing-byte guard means 33-byte payload short-circuits with InvalidInstructionData. The `target: 'v12.19'` opt-in fixes it for v12.19 but v12.17 default is broken. |
| SetMaintenanceFee | 15 | not present (rejected) | not present (rejected) | VERIFIED both (deprecated throw) |
| (no key) | 16 | DELETED (comment "Tag 16 (SetOracleAuthority) deleted") | not present | VERIFIED both |
| (no key 17 in SDK) | 17 | **PushHyperpMark { price_e6: u64, timestamp: i64 }** present (1695) | not present (rejected) | **MISSING_ENCODER for v12.17.** SDK has no encodePushHyperpMark; comment at IX_TAG `// 16, 17 — removed in v1.0.0-beta.29 (Phase G admin-push oracle removal)` is wrong for v12.17 — tag 17 is live on mainnet. Severity ACCOUNT_SPEC_DRIFT_HIGH (no encoder available; callers stuck). |
| SetOraclePriceCap | 18 | tag 18 (1704) | tag 18 (2044) | VERIFIED both |
| ResolveMarket | 19 | tag 19 (1709) | tag 19 (2049) | VERIFIED both |
| WithdrawInsurance | 20 | tag 20 (1710) | tag 20 (2057) | VERIFIED both |
| AdminForceClose | 21 | tag 21 (1711) | tag 21 (2058) | VERIFIED both |
| **SetInsuranceWithdrawPolicy** | **22** | **DELETED** (v12.17 src/percolator.rs comment "Tag 22 (SetInsuranceWithdrawPolicy) deleted — policy was folded into config fields set at init/via UpdateConfig") | tag 22 (2066) | **BYTE_DRIFT_BLOCKING for v12.17.** SDK encodeSetInsuranceWithdrawPolicy sends tag 22 → mainnet rejects. |
| WithdrawInsuranceLimited | 23 | tag 23 (1725) | tag 23 (2084) | VERIFIED both |
| QueryLpFees | 24 | not present (deprecated comment) | not present | VERIFIED both |
| ReclaimEmptyAccount | 25 | tag 25 (1732) | tag 25 (2088) | VERIFIED both |
| SettleAccount | 26 | tag 26 (1736) | tag 26 (2092) | VERIFIED both |
| DepositFeeCredits | 27 | tag 27 (1741) | tag 27 (2097) | VERIFIED both |
| ConvertReleasedPnl | 28 | tag 28 (1747) | tag 28 (2103) | VERIFIED both |
| ResolvePermissionless | 29 | tag 29 (1753) | tag 29 (2109) | VERIFIED both |
| ForceCloseResolved | 30 | tag 30 (1754) | tag 30 (2110) | VERIFIED both |
| (no key 31 in SDK) | 31 | **CatchupAccrue (no payload)** present (1758) | not present (rejected) | **MISSING_ENCODER for v12.17.** SDK has no encodeCatchupAccrue; comment at IX_TAG `// Tag 31: gap (no decode arm on-chain)` is wrong for v12.17. Severity ACCOUNT_SPEC_DRIFT_HIGH. |
| (sdk has SetPythOracle = 32 throws) | 32 | **UpdateAuthority { kind: u8, new_pubkey: Pubkey }** present (1759) | tag 32 not in v12.19 (UpdateAuthority moved to tag 83) | **BYTE_DRIFT_BLOCKING for v12.17.** SDK has IX_TAG.SetPythOracle = 32 (deprecated-throw), but v12.17 wrapper accepts tag 32 as UpdateAuthority. SDK has no encodeUpdateAuthority that targets tag 32. The encodeUpdateAuthority SDK does have hardcodes IX_TAG.UpdateAuthority = 83, which mainnet rejects. |
| UpdateMarkPrice | 33 | not present (rejected) | not present (rejected) | VERIFIED both (deprecated throw) |
| UpdateHyperpMark | 34 | not present (rejected) | tag 34 (2114) | **TAG-NOT-LIVE on v12.17.** encodeUpdateHyperpMark sends 34 → mainnet rejects. |
| TradeCpiV2 | 35 | not present | not present | VERIFIED both |
| UnresolveMarket | 36 | not present | not present | VERIFIED both |
| CreateLpVault | 37 | not present | tag 37 (2183) | TAG-NOT-LIVE on v12.17 (defers to v12.19). |
| LpVaultDeposit | 38 | not present | tag 38 (2192) | TAG-NOT-LIVE on v12.17. |
| LpVaultWithdraw | 39 | not present | tag 39 (2196) | TAG-NOT-LIVE on v12.17. |
| LpVaultCrankFees | 40 | not present | tag 40 (2200) | TAG-NOT-LIVE on v12.17. |
| FundMarketInsurance | 41 | not present | tag 41 (2201) | TAG-NOT-LIVE on v12.17. |
| SetInsuranceIsolation | 42 | not present | not present | VERIFIED both (deprecated throw). |
| ChallengeSettlement | 43 | not present | tag 43 (2206) | TAG-NOT-LIVE on v12.17. |
| ResolveDispute | 44 | not present | tag 44 (2210) | TAG-NOT-LIVE on v12.17. |
| DepositLpCollateral | 45 | not present | tag 45 (2214) | TAG-NOT-LIVE on v12.17. |
| WithdrawLpCollateral | 46 | not present | tag 46 (2219) | TAG-NOT-LIVE on v12.17. |
| QueueWithdrawal | 47 | not present | tag 47 (2224) | TAG-NOT-LIVE on v12.17. |
| ClaimQueuedWithdrawal | 48 | not present | tag 48 (2228) | TAG-NOT-LIVE on v12.17. |
| CancelQueuedWithdrawal | 49 | not present | tag 49 (2229) | TAG-NOT-LIVE on v12.17. |
| ExecuteAdl | 50 | not present | tag 50 (2230) | TAG-NOT-LIVE on v12.17. |
| CloseStaleSlabs | 51 | not present | tag 51 (2234) | TAG-NOT-LIVE on v12.17. |
| ReclaimSlabRent | 52 | not present | tag 52 (2235) | TAG-NOT-LIVE on v12.17. |
| AuditCrank | 53 | not present | tag 53 (2236) | TAG-NOT-LIVE on v12.17. |
| SetOffsetPair | 54 | not present | tag 54 (2237) | TAG-NOT-LIVE on v12.17. |
| AttestCrossMargin | 55 | not present | tag 55 (2241) | TAG-NOT-LIVE on v12.17. |
| AdvanceOraclePhase | 56 | not present | tag 56 (2246) | TAG-NOT-LIVE on v12.17. |
| SlashCreationDeposit | 58 | not present | not present (gap stub) | VERIFIED both. |
| InitSharedVault | 59 | not present | tag 59 (2249) | TAG-NOT-LIVE on v12.17. |
| AllocateMarket | 60 | not present | tag 60 (2254) | TAG-NOT-LIVE on v12.17. |
| QueueWithdrawalSV | 61 | not present | tag 61 (2258) | TAG-NOT-LIVE on v12.17. |
| ClaimEpochWithdrawal | 62 | not present | tag 62 (2262) | TAG-NOT-LIVE on v12.17. |
| AdvanceEpoch | 63 | not present | tag 63 (2263) | TAG-NOT-LIVE on v12.17. |
| MintPositionNft | 64 | not present | tag 64 (2264) | TAG-NOT-LIVE on v12.17. |
| TransferPositionOwnership | 65 | not present | tag 65 (2268) | TAG-NOT-LIVE on v12.17. |
| BurnPositionNft | 66 | not present | tag 66 (2272) | TAG-NOT-LIVE on v12.17. |
| SetPendingSettlement | 67 | not present | tag 67 (2276) | TAG-NOT-LIVE on v12.17. |
| ClearPendingSettlement | 68 | not present | tag 68 (2280) | TAG-NOT-LIVE on v12.17. |
| TransferOwnershipCpi | 69 | not present | tag 69 (2284) | TAG-NOT-LIVE on v12.17. |
| SetWalletCap | 70 | not present | tag 70 (2294) | TAG-NOT-LIVE on v12.17. |
| SetOiImbalanceHardBlock | 71 | not present | tag 71 (2298) | TAG-NOT-LIVE on v12.17. |
| RescueOrphanVault | 72 | not present | tag 72 (2148) | TAG-NOT-LIVE on v12.17. |
| CloseOrphanSlab | 73 | not present | tag 73 (2149) | TAG-NOT-LIVE on v12.17. |
| SetDexPool | 74 | not present | tag 74 (2150) | TAG-NOT-LIVE on v12.17. |
| InitMatcherCtx | 75 | not present | tag 75 (2155) | TAG-NOT-LIVE on v12.17. |
| PauseMarket | 76 | not present | tag 76 (2115) | TAG-NOT-LIVE on v12.17. |
| UnpauseMarket | 77 | not present | tag 77 (2116) | TAG-NOT-LIVE on v12.17. |
| SetMaxPnlCap | 78 | not present | tag 78 (2117) | TAG-NOT-LIVE on v12.17. |
| SetOiCapMultiplier | 79 | not present | tag 79 (2122) | TAG-NOT-LIVE on v12.17. |
| SetDisputeParams | 80 | not present | tag 80 (2127) | TAG-NOT-LIVE on v12.17. |
| SetLpCollateralParams | 81 | not present | tag 81 (2133) | TAG-NOT-LIVE on v12.17. |
| AcceptAdmin | 82 | not present | tag 82 (2139) | TAG-NOT-LIVE on v12.17. |
| **UpdateAuthority** | **83** | not present (UpdateAuthority lives at tag 32 in v12.17) | tag 83 (2140) | **BYTE_DRIFT_BLOCKING for v12.17.** SDK encodeUpdateAuthority sends tag 83 → mainnet rejects. The UpdateAuthority instruction itself IS reachable on mainnet but at tag 32 with same `kind: u8 + new_pubkey: Pubkey` payload. |

## LiquidationPolicy enum byte (tag value = 0xFF for TouchOnly)

| sdk | wrapper | drift |
|:---|:---|:---|
| `FullClose: 0` (src/abi/instructions.ts:543) | `0 => FullClose` (v12.17 1615, v12.19 1950) | VERIFIED both |
| `ExactPartial: 1` (544) | `1 => ExactPartial(u128)` (v12.17 1616, v12.19 1951) | VERIFIED both |
| `TouchOnly: 0xFF` (545) | `0xFF => None` (v12.17 1620 region, v12.19 1955) | VERIFIED both |

## AUTHORITY_KIND const map

| sdk | wrapper | drift |
|:---|:---|:---|
| `Admin: 0` (src/abi/instructions.ts:2227) | `pub const AUTHORITY_ADMIN: u8 = 0` (both) | VERIFIED |
| `HyperpMark: 1` (2228) | `pub const AUTHORITY_HYPERP_MARK: u8 = 1` | VERIFIED |
| `Insurance: 2` (2229) | `pub const AUTHORITY_INSURANCE: u8 = 2` | VERIFIED |
| `InsuranceOperator: 4` (2230) | `pub const AUTHORITY_INSURANCE_OPERATOR: u8 = 4` | VERIFIED. Note kind=3 reserved per v12.18.x (close authority merged into admin per v12.17 enum comment). |

## Summary

| severity | count |
|:---|---:|
| BYTE_DRIFT_BLOCKING | 5 (UpdateAdmin@12, UpdateConfig 33-byte default, SetInsuranceWithdrawPolicy@22, UpdateAuthority@83, SetPythOracle@32 collision) |
| ACCOUNT_SPEC_DRIFT_HIGH (missing encoder for live tag) | 2 (PushHyperpMark@17, CatchupAccrue@31) |
| TAG-NOT-LIVE on v12.17 (encoder exists but mainnet rejects) | ~40 (everything tag 34+ except SetPythOracle/UpdateMarkPrice/TradeCpiV2/UnresolveMarket/SetInsuranceIsolation/SlashCreationDeposit which already throw) |
| VERIFIED | 33 |

The TAG-NOT-LIVE entries are not blocking per se (calling an unsupported encoder produces a benign rejection on mainnet, not silent corruption) but they do mean every fork-extended path is broken on v12.17.7. Severity assigned to those is "v12.19-only TAG_NOT_LIVE_v12_17" — a documentation/coverage concern.
