import type { AccountSpec } from "./accounts.js";
import type { PublicKey } from "@solana/web3.js";
/** P3 instruction tags (the live meanings of 94..=102 on a P3 wrapper). */
export declare const IX_TAG_P3: Readonly<{
    readonly InitVaultLp: 94;
    readonly VaultLpSetMatcher: 95;
    readonly DepositJuniorTranche: 96;
    readonly WithdrawJuniorTranche: 97;
    readonly VaultLpRecall: 98;
    readonly SetVaultLpRisk: 99;
    readonly VaultLpConvertPnl: 100;
    readonly VaultLpSettleResolved: 101;
    readonly VaultLpReleaseSurplus: 102;
}>;
/** `VAULT_LP_MIN_JUNIOR_FLOOR_BPS` / `VAULT_LP_MAX_JUNIOR_FLOOR_BPS`. */
export declare const VAULT_LP_JUNIOR_FLOOR_BPS_RANGE_P3: Readonly<{
    readonly min: 1000;
    readonly max: 10000;
}>;
/** `VAULT_LP_MAX_LEV_BPS` (5x). 0 means the 1x default `VAULT_LP_DEFAULT_MAX_LEV_BPS`. */
export declare const VAULT_LP_MAX_LEV_BPS_P3 = 50000;
/** `VAULT_LP_DEFAULT_MAX_LEV_BPS` (1x). */
export declare const VAULT_LP_DEFAULT_MAX_LEV_BPS_P3 = 10000;
/**
 * InitVaultLp (tag 94): `u16 junior_floor_bps` (1000..=10000). 3 bytes.
 *
 * @param juniorFloorBps  Junior floor as bps of the senior claim.
 * @returns Instruction data.
 * @example
 * ```ts
 * const data = encodeInitVaultLpP3(2_000);
 * ```
 */
export declare function encodeInitVaultLpP3(juniorFloorBps: number): Uint8Array;
/** VaultLpSetMatcher (tag 95) fields, in wire order. */
export interface VaultLpSetMatcherArgsP3 {
    /** Live portfolio matcher sequence (CAS; EngineStale on mismatch). */
    expectedSequence: bigint;
    /** Live asset generation frontier (CAS). */
    assetGenerationFrontier: bigint;
    tradeFeeCapBps: number;
    expirySlot: bigint;
    /** Matcher kind (0 Passive, 1 vAMM, 2 Adaptive on a v2 matcher). */
    kind: number;
    tradingFeeBps: number;
    baseSpreadBps: number;
    maxTotalBps: number;
    impactKBps: number;
    liquidityNotionalE6: bigint;
    /** Must be non-zero (VaultLpMatcherNotApproved otherwise). */
    maxFillAbs: bigint;
    /** Must be non-zero (VaultLpMatcherNotApproved otherwise). */
    maxInventoryAbs: bigint;
    feeToInsuranceBps: number;
    skewSpreadMultBps: number;
}
/**
 * VaultLpSetMatcher (tag 95), upgrade-authority only. 96 bytes:
 * u64 expected_sequence, u64 asset_generation_frontier, u16 trade_fee_cap_bps, u64 expiry_slot,
 * u8 kind, u32 trading_fee_bps, u32 base_spread_bps, u32 max_total_bps, u32 impact_k_bps,
 * u128 liquidity_notional_e6, u128 max_fill_abs, u128 max_inventory_abs,
 * u16 fee_to_insurance_bps, u16 skew_spread_mult_bps.
 *
 * @param a  Fields.
 * @returns Instruction data.
 * @example
 * ```ts
 * const data = encodeVaultLpSetMatcherP3({ expectedSequence: 0n, assetGenerationFrontier: 1n, ... });
 * ```
 */
export declare function encodeVaultLpSetMatcherP3(a: VaultLpSetMatcherArgsP3): Uint8Array;
/**
 * DepositJuniorTranche (tag 96): `u128 amount`. 17 bytes.
 * @param amount  Collateral atoms.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeDepositJuniorTrancheP3(1_000_000n);
 * ```
 */
export declare function encodeDepositJuniorTrancheP3(amount: bigint): Uint8Array;
/**
 * WithdrawJuniorTranche (tag 97): `u128 amount`. 17 bytes.
 * @param amount  Collateral atoms.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeWithdrawJuniorTrancheP3(500_000n);
 * ```
 */
export declare function encodeWithdrawJuniorTrancheP3(amount: bigint): Uint8Array;
/**
 * VaultLpRecall (tag 98, permissionless): `u128 amount, u16 target_domain`. 19 bytes.
 * @param amount        Atoms to recall from the vault LP into backing (> 0, <= senior shortfall).
 * @param targetDomain  Backing domain that receives it (the registry domain or its sibling).
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeVaultLpRecallP3(100n, 0);
 * ```
 */
export declare function encodeVaultLpRecallP3(amount: bigint, targetDomain: number): Uint8Array;
/** SetVaultLpRisk (tag 99) fields, in wire order. */
export interface SetVaultLpRiskArgsP3 {
    assetIndex: number;
    /** e9 per slot at 100% imbalance; 0 = skew funding off. */
    skewSlopeE9: bigint;
    /** e9 per slot cap; must be <= the market's max_abs_funding_e9_per_slot. */
    skewMaxE9: bigint;
    /** Leverage step-down N_cap in Q; 0 = off. */
    levCapQ: bigint;
    /** <= 10000. */
    levMaxImrBps: number;
    /** <= 50000; 0 = 1x default. */
    vaultLpMaxLevBps: number;
    /** The ONLY matcher program tag 95 accepts for this asset. */
    approvedMatcherProgram: PublicKey;
}
/**
 * SetVaultLpRisk (tag 99), upgrade-authority only. 73 bytes:
 * u16 asset_index, u64 skew_slope_e9, u64 skew_max_e9, u128 lev_cap_q, u16 lev_max_imr_bps,
 * u32 vault_lp_max_lev_bps, [u8;32] approved_matcher_program.
 *
 * @param a  Fields.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeSetVaultLpRiskP3({ assetIndex: 0, skewSlopeE9: 2000n, skewMaxE9: 900n, levCapQ: 0n, levMaxImrBps: 0, vaultLpMaxLevBps: 0, approvedMatcherProgram: MATCHER });
 * ```
 */
export declare function encodeSetVaultLpRiskP3(a: SetVaultLpRiskArgsP3): Uint8Array;
/**
 * VaultLpConvertPnl (tag 100, permissionless): `u128 amount`. 17 bytes.
 * @param amount  Atoms of vault-LP PnL to convert to capital.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeVaultLpConvertPnlP3(1n);
 * ```
 */
export declare function encodeVaultLpConvertPnlP3(amount: bigint): Uint8Array;
/**
 * VaultLpSettleResolved (tag 101, permissionless, Resolved): `u8 topup` (0 = close step, 1 = topup claim). 2 bytes.
 * @param topup  0 or 1.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeVaultLpSettleResolvedP3(0);
 * ```
 */
export declare function encodeVaultLpSettleResolvedP3(topup: 0 | 1): Uint8Array;
/**
 * VaultLpReleaseSurplus (tag 102, junior owner): `u128 amount, u16 source_domain`. 19 bytes.
 * @param amount        Atoms (> 0, <= backing surplus over the senior claim).
 * @param sourceDomain  Backing domain the surplus is taken from.
 * @returns Instruction data.
 * @example
 * ```ts
 * encodeVaultLpReleaseSurplusP3(10n, 1);
 * ```
 */
export declare function encodeVaultLpReleaseSurplusP3(amount: bigint, sourceDomain: number): Uint8Array;
/**
 * Tag 94, path A (marketauth = junior owner): 8 accounts. Path B (protocol names a signing
 * junior): append {@link ACCOUNTS_INIT_VAULT_LP_PATH_B_TAIL_P3} ([8] ProgramData, [9] junior owner signer)
 * and make [0] the upgrade authority. `lpPortfolio` must be pre-created (program-owned, portfolio length).
 */
export declare const ACCOUNTS_INIT_VAULT_LP_P3: readonly AccountSpec[];
/** Tag 94 path B tail. */
export declare const ACCOUNTS_INIT_VAULT_LP_PATH_B_TAIL_P3: readonly AccountSpec[];
/** Tag 95: 8 accounts. `matcherDelegate` = deriveMatcherDelegate(wrapper, market, lp, registry, matcherProgram, matcherCtx). */
export declare const ACCOUNTS_VAULT_LP_SET_MATCHER_P3: readonly AccountSpec[];
/** Tag 96: 7 accounts. */
export declare const ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3: readonly AccountSpec[];
/** Tag 97: 11 accounts. */
export declare const ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3: readonly AccountSpec[];
/** Tag 98: 8 accounts (permissionless; cranker pays rent if the target ledger is created). */
export declare const ACCOUNTS_VAULT_LP_RECALL_P3: readonly AccountSpec[];
/** Tag 99: 3 accounts. */
export declare const ACCOUNTS_SET_VAULT_LP_RISK_P3: readonly AccountSpec[];
/** Tag 100: 4 accounts (permissionless). */
export declare const ACCOUNTS_VAULT_LP_CONVERT_PNL_P3: readonly AccountSpec[];
/** Tag 101: 12 accounts (permissionless, Resolved). `juniorDestToken` must be owned by the junior owner. */
export declare const ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3: readonly AccountSpec[];
/** Tag 102: 7 accounts (Live). In Resolved mode append {@link ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3}. */
export declare const ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3: readonly AccountSpec[];
/** Tag 102 Resolved-mode tail: [7] junior dest token (w), [8] vault token (w), [9] vault authority, [10] token program. */
export declare const ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3: readonly AccountSpec[];
