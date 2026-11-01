/**
 * Decoders for the account types the v2.2 wrapper adds: `BondTrancheV20`, `BondPositionV20`,
 * `InsuranceUnitsV20` (192 B body), `G9FeedAllowlistV22`, and the 128-byte redemption request
 * (`LpRedemptionV16` + `LpRedemptionExtV22`).
 *
 * Every decoder runs the VERSION guard first ({@link resolveLayout}: magic, VERSION, kind) and then
 * applies the SAME reachable-state validation the program applies when it reads the account
 * (`state::validate_bond_tranche` and friends, `v16_program.rs:6828..7230`): an account the program
 * would refuse is refused here with a typed {@link UnknownLayoutError}, never partially decoded.
 * Sizes come from {@link LAYOUT_V22} only.
 *
 * @module v22-state
 */
import { PublicKey } from "@solana/web3.js";
import type { LayoutTable } from "./layout.js";
/** `BOND_TRANCHE_VERSION` (GH#571 layout v2; v1 was 128 B and is refused). */
export declare const BOND_TRANCHE_VERSION_V22 = 2;
/** `bond_v20::COUPON_DENOM` = `10_000 * SLOTS_PER_YEAR`; the carried remainder is always below it. */
export declare const BOND_COUPON_DENOM_V22: bigint;
/**
 * Decoded `BondTrancheV20` v2 (`v16_program.rs` `state::BondTrancheV20`, 176 B; offsets pinned by the const asserts
 * there). GH#571 (cumulative coupon): `cBAtoms` is the WHOLE claim `K` (deposits + every settled coupon - redeemed
 * slices), `couponArrearsAtoms` the receivable `R`, `couponUnfundedAtoms` the per-share cap meter `U`,
 * `couponAccrualRem` the carried sub-atom numerator and `couponGateSeen` the gate memory of the last settlement.
 */
export interface BondTrancheV20 {
    marketGroup: PublicKey;
    /** `K`: the bonds' whole claim (deposits + every SETTLED coupon - redeemed pro-rata slices). Shares price at `K / B`. */
    cBAtoms: bigint;
    /** `B`: bond shares outstanding. */
    bSharesTotal: bigint;
    principalInLpAtoms: bigint;
    /** Informational mirror of the impairment; nothing prices off it. */
    bondDrawnOutstandingAtoms: bigint;
    /** Every slot up to it is settled into `K` / `R` (or forfeited while the gate was closed). */
    lastCouponSlot: bigint;
    couponBpsPerYear: number;
    couponUtilBonusBps: number;
    bondCooldownSlots: number;
    bondCapBpsOfC: number;
    version: number;
    bump: number;
    lastUtilBps: number;
    /** Cumulative coupon atoms PAID by fee legs (tag 78; saturating u64; a readout only). */
    couponPaidTotalAtoms: bigint;
    /** `R`: settled coupon (already inside `K`) no fee leg has funded yet; what the fee legs still owe the junior. */
    couponArrearsAtoms: bigint;
    /** `U`: the cap meter, unfunded coupon carried by the current shares (`U <= K`). */
    couponUnfundedAtoms: bigint;
    /** Carried sub-atom accrual numerator (`< BOND_COUPON_DENOM_V22`). */
    couponAccrualRem: bigint;
    /** Gate memory: low 63 bits = `senior_drawn_atoms` at the last settlement; bit 63 = the gate was CLOSED then. */
    couponGateSeen: bigint;
}
/** Field offsets inside the 176-byte body (rustc `offset_of!`; add 16 for the account). */
export declare const BOND_TRANCHE_FIELD_OFF_V22: Readonly<{
    readonly marketGroup: 0;
    readonly cBAtoms: 32;
    readonly bSharesTotal: 48;
    readonly principalInLpAtoms: 64;
    readonly bondDrawnOutstandingAtoms: 80;
    readonly lastCouponSlot: 96;
    readonly couponBpsPerYear: 104;
    readonly couponUtilBonusBps: 106;
    readonly bondCooldownSlots: 108;
    readonly bondCapBpsOfC: 112;
    readonly version: 114;
    readonly bump: 115;
    readonly lastUtilBps: 116;
    readonly padding: 118;
    readonly couponPaidTotalAtoms: 120;
    readonly couponArrearsAtoms: 128;
    readonly couponUnfundedAtoms: 144;
    readonly couponAccrualRem: 160;
    readonly couponGateSeen: 168;
}>;
/**
 * Decode a bond tranche account (layout v2, GH#571).
 *
 * A v1 account (128-byte body, `version == 1`) and the intermediate 144-byte form are refused, exactly as the program
 * refuses them (`InvalidAccountLen` for the short body, `InvalidAccountData` for the version): bond markets are
 * re-seeded, there is no in-place migration.
 *
 * @param data   Raw account bytes (`16 + 176`).
 * @param table  Layout table (default {@link LAYOUT_V22}).
 * @returns The tranche.
 * @throws {@link UnknownLayoutError} on a wrong header, short data (`TOO_SHORT`, e.g. a v1 / 144 B account) or an
 *   invalid record (`version != 2`, dials outside `bond_config_ok`, `K == 0` xor `B == 0`, non-zero padding,
 *   `last_util_bps > 10000`, `couponAccrualRem >= COUPON_DENOM`, `U > K`).
 * @example
 * ```ts
 * const t = decodeBondTrancheV20(info.data);
 * ```
 */
export declare function decodeBondTrancheV20(data: Uint8Array, table?: LayoutTable): BondTrancheV20;
/** Decoded `BondPositionV20` (`v16_program.rs:6949..6962`). */
export interface BondPositionV20 {
    owner: PublicKey;
    shares: bigint;
    /** Requested for withdrawal (tag 109); still counted in `B` until tag 110. */
    pendingWithdrawShares: bigint;
    requestSlot: bigint;
    version: number;
    bump: number;
}
/** Field offsets inside the 96-byte body. */
export declare const BOND_POSITION_FIELD_OFF_V22: Readonly<{
    readonly owner: 0;
    readonly shares: 32;
    readonly pendingWithdrawShares: 48;
    readonly requestSlot: 64;
    readonly version: 72;
    readonly bump: 73;
    readonly padding: 74;
    readonly reserved: 80;
}>;
/**
 * Decode a bond position account.
 *
 * @param data   Raw account bytes (`16 + 96`).
 * @param table  Layout table (default {@link LAYOUT_V22}).
 * @returns The position.
 * @throws {@link UnknownLayoutError} on a wrong header, short data, `pending > shares`, a zero owner or
 *   non-zero padding / reserved bytes.
 * @example
 * ```ts
 * const p = decodeBondPositionV20(info.data);
 * ```
 */
export declare function decodeBondPositionV20(data: Uint8Array, table?: LayoutTable): BondPositionV20;
/** Decoded `InsuranceUnitsV20` (`v16_program.rs:7052..7100`; stake v5 pins the same offsets). */
export interface InsuranceUnitsV20 {
    marketGroup: PublicKey;
    /** `U = units_stake + units_creator`. */
    unitsTotal: bigint;
    unitsStake: bigint;
    unitsCreator: bigint;
    /** G9 insurance lent to the vault LP, owed back first. Part of the MINT (entry) reading only. */
    backstopReceivableAtoms: bigint;
    /** Entry reading at `snapSlot`: asset-0 budgets remaining + receivable. */
    snapInsuranceMintAtoms: bigint;
    /** Exit reading at `snapSlot`: asset-0 withdraw capacity. */
    snapInsuranceFreeAtoms: bigint;
    snapSlot: bigint;
    version: number;
    bump: number;
    /** Creator-class value paid to the stake pool's vault at terminal (never decreases). */
    creatorPaidToStakeAtoms: bigint;
    /** Slot of the open G9 proposal (tag 111 mode 2); 0 = none. */
    g9PendingSlot: bigint;
    g9Epoch: bigint;
    g9EpochDrawnAtoms: bigint;
}
/** Field offsets inside the 192-byte body (rustc `offset_of!`; add 16 for the account). */
export declare const INSURANCE_UNITS_FIELD_OFF_V22: Readonly<{
    readonly marketGroup: 0;
    readonly unitsTotal: 32;
    readonly unitsStake: 48;
    readonly unitsCreator: 64;
    readonly backstopReceivableAtoms: 80;
    readonly snapInsuranceMintAtoms: 96;
    readonly snapInsuranceFreeAtoms: 112;
    readonly snapSlot: 128;
    readonly version: 136;
    readonly bump: 137;
    readonly padding: 138;
    readonly creatorPaidToStakeAtoms: 144;
    readonly g9PendingSlot: 160;
    readonly g9Epoch: 168;
    readonly g9EpochDrawnAtoms: 176;
}>;
/**
 * Decode an insurance-units ledger.
 *
 * @param data   Raw account bytes (`16 + 192`).
 * @param table  Layout table (default {@link LAYOUT_V22}).
 * @returns The ledger.
 * @throws {@link UnknownLayoutError} on a wrong header, short data (a 160-byte round-1 ledger is refused),
 *   `units_stake + units_creator != units_total`, a zero market or non-zero padding.
 * @example
 * ```ts
 * const u = decodeInsuranceUnitsV20(info.data);
 * ```
 */
export declare function decodeInsuranceUnitsV20(data: Uint8Array, table?: LayoutTable): InsuranceUnitsV20;
/** Decoded `G9FeedAllowlistV22` (`v16_program.rs`, #539: owner-pinned entries plus one timelocked pending proposal). */
export interface G9FeedAllowlistV22 {
    count: number;
    version: number;
    bump: number;
    /** The first `count` listed feeds. */
    keys: PublicKey[];
    /** The owner pinned for each listed feed (same order as `keys`). */
    owners: PublicKey[];
    /** Entries of the open proposal (0 = none). */
    pendingCount: number;
    /** Slot of the open proposal (0 = none); a commit needs `now >= pendingSlot + G9_ALLOWLIST_TIMELOCK_SLOTS` (216,000). */
    pendingSlot: bigint;
    pendingKeys: PublicKey[];
    pendingOwners: PublicKey[];
}
/**
 * Decode the G9 feed allowlist (feed + pinned owner per entry, plus the pending proposal).
 *
 * Body (2,064 B, align 1): count u8, version u8, bump u8, pending_count u8, pad[4], pending_slot u64 LE, keys[16][32],
 * owners[16][32], pending_keys[16][32], pending_owners[16][32].
 *
 * @param data   Raw account bytes (`16 + 2064`).
 * @param table  Layout table (default {@link LAYOUT_V22}).
 * @returns The allowlist.
 * @throws {@link UnknownLayoutError} on a wrong header, short data, `count`/`pending_count` > 16, non-zero padding, a
 *   zero or duplicate listed key, or a non-zero unlisted slot (keys or owners).
 */
export declare function decodeG9FeedAllowlistV22(data: Uint8Array, table?: LayoutTable): G9FeedAllowlistV22;
/** Decoded redemption request, both account lengths. */
export interface LpRedemptionV22 {
    registry: PublicKey;
    redeemer: PublicKey;
    shares: bigint;
    requestSlot: bigint;
    version: number;
    bump: number;
    /** `true` when the account is the 128-byte v2.2 form (the request was made with the extended tag 76). */
    extended: boolean;
    /** The redeemer's stored payout floor (atoms); 0 for a legacy request. */
    minPayoutAtoms: bigint;
    /** `true` when anyone may execute (strictly loss-gated, at the stored floor); `false` for a legacy request. */
    keeperOk: boolean;
}
/**
 * Decode a redemption request of either length. A request shorter than 128 bytes reads the extension as
 * all-zero (no floor, redeemer-only), exactly like `state::read_lp_redemption_ext`; a 128-byte request
 * with `keeper_ok > 1` or non-zero reserved bytes is refused. Any `getProgramAccounts` filter on the
 * request must accept BOTH lengths (112 and 128) and `memcmp` the kind byte.
 *
 * @param data   Raw account bytes.
 * @param table  Layout table (default {@link LAYOUT_V22}).
 * @returns The request.
 * @throws {@link UnknownLayoutError} on a wrong header or short data / an invalid extension.
 * @example
 * ```ts
 * const r = decodeLpRedemptionV22(info.data);
 * if (r.extended) console.log("floor", r.minPayoutAtoms);
 * ```
 */
export declare function decodeLpRedemptionV22(data: Uint8Array, table?: LayoutTable): LpRedemptionV22;
/**
 * The two valid `dataSize` values of a redemption request, for `getProgramAccounts` filters.
 *
 * @param table  Layout table (default {@link LAYOUT_V22}).
 * @returns `[legacy, v22]` account lengths (112 and 128).
 * @example
 * ```ts
 * const sizes = redemptionDataSizesV22(); // [112, 128]
 * ```
 */
export declare function redemptionDataSizesV22(table?: LayoutTable): [number, number];
