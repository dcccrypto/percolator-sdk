import type { AccountSpec } from "./accounts.js";
import type { PublicKey } from "@solana/web3.js";
/** Instruction tags this module adds. 104/105 live in `p2b-lock-exits`. */
export declare const IX_TAG_P2B_EARN: Readonly<{
    readonly VaultLpAllocate: 103;
}>;
/** `constants::KIND_VAULT_LP_EXT`: the account kind byte (header byte 10) of a `VaultLpExtV19`. */
export declare const KIND_VAULT_LP_EXT_P2B = 10;
/** `size_of::<VaultLpExtV19>()`. The account is `HEADER_LEN (16) + 128 = 144` bytes. */
export declare const VAULT_LP_EXT_BODY_LEN_P2B = 128;
/** `state::vault_lp_ext_account_len()`. */
export declare const VAULT_LP_EXT_ACCOUNT_LEN_P2B: number;
/** `constants::VAULT_LP_EXT_VERSION`. */
export declare const VAULT_LP_EXT_VERSION_P2B = 1;
/** `constants::VAULT_LP_EXT_SEED`: the PDA is `["vault_lp_ext", market]`. */
export declare const VAULT_LP_EXT_SEED_P2B = "vault_lp_ext";
/**
 * Account offset of `LpVaultRegistryV16._reserved[1]` (16 + 144 + 1): 1 once the market's ext
 * exists. From then on tags 98, 97 and 78 REQUIRE the ext account (fail closed).
 */
export declare const LP_VAULT_REGISTRY_EXT_FLAG_OFF_P2B = 161;
/** `vault_lp_v18::ALLOC_ALPHA_DEFAULT_BPS` / `ALLOC_ALPHA_MAX_BPS` (hard maximum until L3). */
export declare const ALLOC_ALPHA_DEFAULT_BPS_P2B = 5000;
export declare const ALLOC_ALPHA_MAX_BPS_P2B = 5000;
/** `vault_lp_v18::ALLOC_BUFFER_DEFAULT_BPS` / `ALLOC_BUFFER_MIN_BPS`. */
export declare const ALLOC_BUFFER_DEFAULT_BPS_P2B = 3000;
export declare const ALLOC_BUFFER_MIN_BPS_P2B = 3000;
/** `vault_lp_v18::ALLOC_MIN_JUNIOR_BPS` (L-3): tag 103 needs a junior of at least 5% of C_eff. */
export declare const ALLOC_MIN_JUNIOR_BPS_P2B = 500;
/** `AssetVaultLpV18::p2b_flags` bit 0: creator fees not vested (cushion below target). */
export declare const ASSET_VAULT_LP_P2B_CREATOR_FEE_VESTING_P2B = 1;
/** `engine BOUND_SCALE`: backing `_num` fields are in 1e-12 atoms. */
export declare const BOUND_SCALE_P2B = 1000000000000n;
/**
 * VaultLpAllocate (tag 103, permissionless, Live only): `u128 amount`. 17 bytes.
 *
 * Moves `min(amount, alpha*C_eff - allocated, drawable - ceil(buffer*C_eff))` of Earn principal
 * from the vault's pots into the bound vault LP's engine capital (the inverse of tag 98). The
 * program CLAMPS `amount`, so a keeper passes {@link U128_MAX_P2B} to mean "as much as the room
 * allows". Refused with Custom 100 (`VaultLpAllocateRefused`) during a draw, when impaired, with
 * an insolvent LP, a junior below 5% of C_eff, or with no room: a keeper treats 100 as "skip".
 *
 * @param amount  Atoms requested (> 0; the program refuses 0 with 100).
 * @returns Instruction data.
 * @example
 * ```ts
 * const data = encodeVaultLpAllocateP2b(U128_MAX_P2B); // [103, ff * 16]
 * ```
 */
export declare function encodeVaultLpAllocateP2b(amount: bigint): Uint8Array;
/** `u128::MAX`: pass as the tag-103 `amount` to take whatever the program's limit allows. */
export declare const U128_MAX_P2B: bigint;
/**
 * Tag 103 accounts (9). `registry` is writable because the first allocation CREATES the ext and
 * raises the registry flag; `ext` is `["vault_lp_ext", market]` (writable; created with the
 * defaults alpha 50% / buffer 30% / cushion off if it does not exist, the cranker paying rent).
 */
export declare const ACCOUNTS_VAULT_LP_ALLOCATE_P2B: readonly AccountSpec[];
/** The four allocation / cushion dials carried by tag 99's 8-byte trailer. */
export interface VaultLpDialsP2b {
    /** Allocation fraction of C_eff, bps. `0..=ALLOC_ALPHA_MAX_BPS_P2B` (5000 until L3). */
    allocAlphaBps: number;
    /** Redemption buffer kept liquid, bps. `ALLOC_BUFFER_MIN_BPS_P2B..=10000`. */
    allocBufferBps: number;
    /** G6 cushion target, bps of C_eff. `0..=10000`; zero iff `cushionShareBps` is zero. */
    cushionTargetBps: number;
    /** G6 share of each LP fee leg routed to the cushion, bps. `0..=10000`. */
    cushionShareBps: number;
}
/**
 * Validate the dials with the wrapper's own bounds (`p2b_set_vault_lp_dials`).
 * @param d  Dials.
 * @throws If the program would refuse them (InvalidInstruction).
 * @example
 * ```ts
 * assertVaultLpDialsP2b({ allocAlphaBps: 5000, allocBufferBps: 3000, cushionTargetBps: 0, cushionShareBps: 0 });
 * ```
 */
export declare function assertVaultLpDialsP2b(d: VaultLpDialsP2b): void;
/** Tag 99 base fields (identical to {@link SetVaultLpRiskArgsP3}); repeated so this module stands alone. */
export interface SetVaultLpRiskV19ArgsP2b extends VaultLpDialsP2b {
    assetIndex: number;
    skewSlopeE9: bigint;
    skewMaxE9: bigint;
    levCapQ: bigint;
    levMaxImrBps: number;
    vaultLpMaxLevBps: number;
    approvedMatcherProgram: PublicKey;
}
/**
 * SetVaultLpRisk (tag 99) with the Phase 2b trailing dials: the 73-byte legacy body, then
 * `u16 alloc_alpha_bps, u16 alloc_buffer_bps, u16 cushion_target_bps, u16 cushion_share_bps`.
 * 81 bytes. The wrapper decodes ANY non-empty trailer as the dials form, so a partial trailer is
 * an error on chain; this encoder always writes all four. Upgrade-authority only.
 *
 * @param a  Fields.
 * @returns 81 bytes.
 * @example
 * ```ts
 * const data = encodeSetVaultLpRiskV19P2b({ ...legacy, allocAlphaBps: 5000, allocBufferBps: 3000, cushionTargetBps: 0, cushionShareBps: 0 });
 * ```
 */
export declare function encodeSetVaultLpRiskV19P2b(a: SetVaultLpRiskV19ArgsP2b): Uint8Array;
/**
 * Tag 99 accounts, dials form (6): the base three, then `registry` (w), `vaultLpExt` (w, created on
 * first use) and the system program. The upgrade authority PAYS the ext rent, so it is WRITABLE
 * here (it is read-only in the legacy 3-account form).
 */
export declare const ACCOUNTS_SET_VAULT_LP_RISK_V19_P2B: readonly AccountSpec[];
/**
 * Index of the ext account in each ext-governed tag, ONCE the registry's ext flag is set:
 * 98 recall `[8]`, 97 junior withdraw `[11]`, bound 78 crank fees `[7]` (then `[8]` the vault LP
 * portfolio). Equal to the number of base accounts of the tag (8 / 11 / 7 with the bound `[6]`).
 */
export declare const VAULT_LP_EXT_TAIL_INDEX_P2B: Readonly<{
    readonly 97: 11;
    readonly 98: 8;
    readonly 78: 7;
}>;
/** Offsets inside the 128-byte `VaultLpExtV19` body (rustc `offset_of!`; add 16 for the account). */
export declare const VAULT_LP_EXT_FIELD_OFF_P2B: Readonly<{
    readonly marketGroup: 0;
    readonly allocatedAtoms: 32;
    readonly cushionAccruedAtoms: 48;
    readonly allocatedTotalAtoms: 64;
    readonly deallocatedTotalAtoms: 80;
    readonly allocAlphaBps: 96;
    readonly allocBufferBps: 98;
    readonly cushionTargetBps: 100;
    readonly cushionShareBps: 102;
    readonly version: 104;
    readonly bump: 105;
    readonly padding: 106;
    readonly reserved: 112;
}>;
/** Record offset (inside the 64-byte `AssetRiskLimitsV17`) of `p2b_senior_floor_code` (u16 LE). */
export declare const P2B_SENIOR_FLOOR_RECORD_OFF = 42;
/** Asset-slot offset of the code (`ASSET_RISK_LIMITS_OFF 608 + 42`). */
export declare const P2B_SENIOR_FLOOR_SLOT_OFF = 650;
/**
 * Port of `vault_lp_v18::senior_floor_decode`: `(code & 1023) << (code >> 10)`. The program
 * stores the senior floor `T = C - nav` as a 6-bit exponent / 10-bit mantissa CEILING code, so
 * `decode(encode(v)) >= v` and `<= v*(1 + 2^-9) + 1`. 0 = no floor.
 *
 * @param code  The 16-bit code (record bytes 42..44, little-endian).
 * @returns The floor in atoms.
 * @example
 * ```ts
 * seniorFloorDecodeP2b(1023); // 1023n
 * ```
 */
export declare function seniorFloorDecodeP2b(code: number): bigint;
/**
 * Port of `vault_lp_v18::senior_floor_encode` (ceiling; saturates to `0xffff` above
 * `1023 * 2^63`). Provided for tests and previews; only the program writes the code.
 *
 * @param v  Floor in atoms.
 * @returns The 16-bit code.
 * @example
 * ```ts
 * seniorFloorEncodeP2b(1025n); // 0x0401 + 1 -> ceiling
 * ```
 */
export declare function seniorFloorEncodeP2b(v: bigint): number;
/**
 * Decode `p2b_senior_floor_code` from one 64-byte `AssetRiskLimitsV17` record and return the floor.
 * @param rec  The 64 record bytes.
 * @returns `{ code, floorAtoms }`; `floorAtoms == 0n` means no floor is armed.
 * @example
 * ```ts
 * const { floorAtoms } = decodeSeniorFloorRecordP2b(rec);
 * ```
 */
export declare function decodeSeniorFloorRecordP2b(rec: Uint8Array): {
    code: number;
    floorAtoms: bigint;
};
/**
 * Q2 halt rule (`vault_lp_v18::senior_capital_halt`): a risk-increasing vault-LP fill is refused
 * (Custom 103) while its conservative equity after the fill is below the floor.
 * @param lpConservativeEquity  LP equity with no credit for positive PnL.
 * @param floor                 {@link seniorFloorDecodeP2b} of the stored code.
 * @returns True when the fill would be refused.
 * @example
 * ```ts
 * seniorCapitalHaltP2b(99n, 100n); // true
 * ```
 */
export declare function seniorCapitalHaltP2b(lpConservativeEquity: bigint, floor: bigint): boolean;
/**
 * `vault_lp_v18::vault_lp_alloc_limit`: the most tag 103 may move now,
 * `min(floor(alpha*C_eff) - allocated, drawable - ceil(buffer*C_eff))`, both saturating at 0.
 * `null` on an out-of-range dial (the program then refuses with 100).
 *
 * @param cEff       Effective senior claim.
 * @param allocated  `VaultLpExtV19.allocated_atoms` AFTER the L-2 write-down ({@link allocWrittenDownP2b}).
 * @param drawable   The pots' vault-owned, unreserved fresh backing (both pots).
 * @param alphaBps   Ext alpha.
 * @param bufferBps  Ext buffer.
 * @returns Atoms, or null.
 * @example
 * ```ts
 * vaultLpAllocLimitP2b(1_000n, 0n, 1_000n, 5_000, 3_000); // 500n
 * ```
 */
export declare function vaultLpAllocLimitP2b(cEff: bigint, allocated: bigint, drawable: bigint, alphaBps: number, bufferBps: number): bigint | null;
/**
 * `vault_lp_v18::vault_lp_alloc_admitted`: tag 103 is refused during a senior draw (outstanding
 * or pending), when impaired (`V < C_eff`), or with an insolvent LP.
 * @param drawOutstanding  `VaultLpStateV18.senior_draw_outstanding_atoms`.
 * @param drawPending      Any pending draw on the asset's draw record.
 * @param vaultValue       V = NAV + H + LP value.
 * @param cEff             Effective senior claim.
 * @param lpEquity         Vault LP certified equity (signed).
 * @returns Admitted?
 * @example
 * ```ts
 * vaultLpAllocAdmittedP2b(0n, false, 1_000n, 1_000n, 0n); // true
 * ```
 */
export declare function vaultLpAllocAdmittedP2b(drawOutstanding: bigint, drawPending: boolean, vaultValue: bigint, cEff: bigint, lpEquity: bigint): boolean;
/**
 * `vault_lp_v18::alloc_junior_ok` (L-3): `V - C_eff >= ceil(5% * C_eff)`.
 * @param vaultValue  V.
 * @param cEff        Effective senior claim.
 * @returns Whether a first-loss buffer exists.
 * @example
 * ```ts
 * allocJuniorOkP2b(10_500n, 10_000n); // true
 * ```
 */
export declare function allocJuniorOkP2b(vaultValue: bigint, cEff: bigint): boolean;
/**
 * `vault_lp_v18::alloc_written_down` (L-2): the allocation counter is capped at the LP's value.
 * @param allocated  Stored counter.
 * @param lpValue    Vault LP certified equity floored at 0.
 * @returns Counter after the write-down.
 * @example
 * ```ts
 * allocWrittenDownP2b(5_000n, 0n); // 0n
 * ```
 */
export declare function allocWrittenDownP2b(allocated: bigint, lpValue: bigint): bigint;
/**
 * `vault_lp_v18::vault_lp_dealloc`: the counter after a tag-98 recall of `recalled` atoms.
 * @param allocated  Stored counter.
 * @param recalled   Atoms recalled.
 * @returns Counter, saturating at 0.
 * @example
 * ```ts
 * vaultLpDeallocP2b(500n, 700n); // 0n
 * ```
 */
export declare function vaultLpDeallocP2b(allocated: bigint, recalled: bigint): bigint;
/**
 * `vault_lp_v18::vault_lp_alloc_split`: how tag 103 takes `moved` from the two pots, proportional
 * to each pot's drawable backing with the floor on the SMALLER pot. `null` if `moved` exceeds both pots.
 * @param moved   Atoms moved.
 * @param dEven   Even-domain drawable.
 * @param dOdd    Odd-domain drawable.
 * @returns `[takeEven, takeOdd]` or null.
 * @example
 * ```ts
 * vaultLpAllocSplitP2b(100n, 300n, 100n); // [75n, 25n]
 * ```
 */
export declare function vaultLpAllocSplitP2b(moved: bigint, dEven: bigint, dOdd: bigint): [bigint, bigint] | null;
/**
 * `vault_lp_v18::a4_capacity_lock_ok` (code 101 `VaultLpCapacityLocked`): an operation that
 * lowers the vault LP's capital may not leave `N_cap(after) < |LP_eff|`.
 * @param nCapBefore  N_cap before.
 * @param nCapAfter   N_cap after.
 * @param lpEffAbs    |LP effective position|.
 * @returns Allowed?
 * @example
 * ```ts
 * a4CapacityLockOkP2b(10n, 5n, 6n); // false
 * ```
 */
export declare function a4CapacityLockOkP2b(nCapBefore: bigint, nCapAfter: bigint, lpEffAbs: bigint): boolean;
/**
 * `vault_lp_v18::live_bound_principal_portion` (H-2): a Live bound senior payout's principal
 * portion, `min(payout, available)`. The remainder sits in the vault LP and needs a recall first.
 * @param atomsOut   Payout.
 * @param available  The pots' available principal.
 * @returns Principal portion.
 * @example
 * ```ts
 * liveBoundPrincipalPortionP2b(7_000n, 5_000n); // 5000n
 * ```
 */
export declare function liveBoundPrincipalPortionP2b(atomsOut: bigint, available: bigint): bigint;
/**
 * `vault_lp_v18::cushion_split`: split one harvested LP-fee leg into `[senior, cushion]`.
 * @param available          Harvested leg.
 * @param cushionShareBps    Ext share.
 * @param cushionTargetBps   Ext target.
 * @param cEff               Effective senior claim.
 * @param juniorLevel        `V - C_eff` excluding this leg.
 * @returns `[senior, cushion]`, summing to `available`.
 * @example
 * ```ts
 * cushionSplitP2b(1_000n, 5_000, 1_000, 10_000n, 900n); // [900n, 100n]
 * ```
 */
export declare function cushionSplitP2b(available: bigint, cushionShareBps: number, cushionTargetBps: number, cEff: bigint, juniorLevel: bigint): [bigint, bigint];
/**
 * `vault_lp_v18::cushion_locked`: the cushion tag 97 may not withdraw, `min(accrued, ceil(target*C_eff))`.
 * @param cushionAccrued    `VaultLpExtV19.cushion_accrued_atoms`.
 * @param cEff              Effective senior claim.
 * @param cushionTargetBps  Ext target.
 * @returns Locked atoms.
 * @example
 * ```ts
 * cushionLockedP2b(5_000n, 10_000n, 1_000); // 1000n
 * ```
 */
export declare function cushionLockedP2b(cushionAccrued: bigint, cEff: bigint, cushionTargetBps: number): bigint;
/**
 * `vault_lp_v18::creator_fee_vested`: creator discretionary fees vest only at or above the
 * cushion target (always, when the cushion is off). Tag 90 returns 102 otherwise.
 * @param juniorLevel       `V - C_eff`.
 * @param cEff              Effective senior claim.
 * @param cushionShareBps   Ext share.
 * @param cushionTargetBps  Ext target.
 * @returns Vested?
 * @example
 * ```ts
 * creatorFeeVestedP2b(999n, 10_000n, 5_000, 1_000); // false
 * ```
 */
export declare function creatorFeeVestedP2b(juniorLevel: bigint, cEff: bigint, cushionShareBps: number, cushionTargetBps: number): boolean;
/** `KIND_BACKING_DOMAIN_LEDGER`: header kind of an `["lp_backing_ledger", market, domain]` account. */
export declare const KIND_BACKING_DOMAIN_LEDGER_P2B = 3;
/** `size_of::<BackingDomainLedgerAccountV16>()`; the account is `16 + 224 = 240` bytes (the program requires EXACTLY this length). */
export declare const BACKING_DOMAIN_LEDGER_BODY_LEN_P2B = 224;
export declare const BACKING_DOMAIN_LEDGER_ACCOUNT_LEN_P2B: number;
/** Field offsets inside the 224-byte ledger body (add 16 for the account). */
export declare const BACKING_DOMAIN_LEDGER_FIELD_OFF_P2B: Readonly<{
    readonly marketGroup: 0;
    readonly authority: 32;
    readonly totalPrincipalAtoms: 64;
    readonly totalDepositedAtoms: 80;
    readonly totalPrincipalWithdrawnAtoms: 96;
    readonly totalEarningsAtoms: 112;
    readonly totalEarningsWithdrawnAtoms: 128;
    readonly lastObservedBucketEarningsAtoms: 144;
    readonly cumulativeLossAtoms: 160;
    readonly cumulativeRecoveryAtoms: 176;
    readonly lastObservedUnavailablePrincipalAtoms: 192;
    readonly domain: 208;
    readonly padding: 210;
    readonly marketId: 216;
}>;
/** `EngineAssetSlotV16Account::source_credit_long` / `_short`, relative to the engine slot start (the backing buckets follow at 963 / 1060). */
export declare const SOURCE_CREDIT_REL_P2B: Readonly<{
    readonly long: 595;
    readonly short: 779;
}>;
/** `size_of::<SourceCreditStateV16Account>()`. */
export declare const SOURCE_CREDIT_LEN_P2B = 184;
/** Field offsets inside one `SourceCreditStateV16Account` (the `_num` fields are u128 in 1e-12 atoms). */
export declare const SOURCE_CREDIT_FIELD_OFF_P2B: Readonly<{
    readonly positiveClaimBoundNum: 0;
    readonly exactPositiveClaimNum: 16;
    readonly freshReservedBackingNum: 32;
    readonly spentBackingNum: 48;
    readonly providerReceivableNum: 64;
    readonly validLienedBackingNum: 80;
    readonly impairedLienedBackingNum: 96;
    readonly insuranceCreditReservedNum: 112;
    readonly validLienedInsuranceNum: 128;
    readonly impairedLienedInsuranceNum: 144;
    readonly creditRateNum: 160;
    readonly creditEpoch: 176;
}>;
/** Field offsets inside one `BackingBucketV16Account` (97 bytes); the bucket starts at engine-slot `963` (long) / `1060` (short). */
export declare const BACKING_BUCKET_FIELD_OFF_P2B: Readonly<{
    readonly marketId: 0;
    readonly freshUnlienedBackingNum: 8;
    readonly validLienedBackingNum: 24;
    readonly consumedLienedBackingNum: 40;
    readonly impairedLienedBackingNum: 56;
    readonly utilizationFeeEarnings: 72;
    readonly expirySlot: 88;
    readonly status: 96;
}>;
/**
 * `vault_lp_v18::pot_physical_net_atoms`: a pot's physical backing net of the claims it owes,
 * `floor((fresh_unliened + valid_liened) / scale) - ceil(max(0, claims - insuranceCover) / scale)`,
 * saturating at 0. Floor on the backing, ceil on the claims: never overstates.
 *
 * @param freshUnlienedNum  `bucket.fresh_unliened_backing_num`.
 * @param validLienedNum    `bucket.valid_liened_backing_num`.
 * @param claimBoundNum     `source.positive_claim_bound_num`.
 * @param insuranceCoverNum {@link insuranceCoverNumP2b}.
 * @param scale             `BOUND_SCALE` (default 1e12).
 * @returns Atoms.
 * @example
 * ```ts
 * potPhysicalNetAtomsP2b(1_180n, 0n, 180n, 0n, 1n); // 1000n
 * ```
 */
export declare function potPhysicalNetAtomsP2b(freshUnlienedNum: bigint, validLienedNum: bigint, claimBoundNum: bigint, insuranceCoverNum: bigint, scale?: bigint): bigint;
/**
 * The part of a source's positive-claim bound that insurance (not the pot) owes:
 * `insurance_credit_reserved_num - (valid_liened_insurance_num + impaired_liened_insurance_num)`, saturating.
 * @param insuranceCreditReservedNum  `source.insurance_credit_reserved_num`.
 * @param validLienedInsuranceNum     `source.valid_liened_insurance_num`.
 * @param impairedLienedInsuranceNum  `source.impaired_liened_insurance_num`.
 * @returns The cover in `_num` units.
 * @example
 * ```ts
 * insuranceCoverNumP2b(180n, 0n, 0n); // 180n
 * ```
 */
export declare function insuranceCoverNumP2b(insuranceCreditReservedNum: bigint, validLienedInsuranceNum: bigint, impairedLienedInsuranceNum: bigint): bigint;
/**
 * E3 (`vault_lp_v18::nonbound_pot_available`): a non-bound pot's EXIT value, `min(ledger
 * principal, physical net of claims)`. Tag 77 prices on this.
 * @param principal    `ledger.total_principal_atoms`.
 * @param physicalNet  {@link potPhysicalNetAtomsP2b}.
 * @returns Atoms.
 * @example
 * ```ts
 * nonboundPotAvailableE3P2b(1_000n, 820n); // 820n
 * ```
 */
export declare function nonboundPotAvailableE3P2b(principal: bigint, physicalNet: bigint): bigint;
/**
 * H-1 (`vault_lp_v18::nonbound_pot_entry_available`): a non-bound pot's ENTRY value is PAR, the
 * ledger principal. Tag 75 prices on this. It moves only with principal flows, so it is never
 * below the exit reading: every entry-to-exit round trip is non-positive.
 * @param principal  `ledger.total_principal_atoms`.
 * @returns The principal.
 * @example
 * ```ts
 * nonboundPotEntryAvailableP2b(1_000n); // 1000n
 * ```
 */
export declare function nonboundPotEntryAvailableP2b(principal: bigint): bigint;
/** One non-bound pot's inputs for {@link nonboundVaultPricingP2b}. */
export interface NonboundPotP2b {
    /** `ledger.total_principal_atoms` (after the program's own sync). */
    totalPrincipalAtoms: bigint;
    totalEarningsAtoms: bigint;
    totalEarningsWithdrawnAtoms: bigint;
    /** {@link potPhysicalNetAtomsP2b} of the pot's bucket and source. */
    physicalNetAtoms: bigint;
}
/** Result of {@link nonboundVaultPricingP2b}. */
export interface NonboundVaultPricingP2b {
    /** Combined ENTRY NAV (par per pot + LP earnings): what a tag-75 deposit is priced on. */
    entryNavAtoms: bigint;
    /** Combined EXIT NAV (E3 per pot + LP earnings): what a tag-77 redemption is priced on. */
    exitNavAtoms: bigint;
    /** `entryNav - exitNav` (>= 0 always): the par - E3 gap (R3-M1 alert quantity). */
    parMinusE3Atoms: bigint;
    /** The gap as bps of the entry NAV (0 when the entry NAV is 0). */
    parMinusE3Bps: number;
}
/**
 * Port of `lp_vault_combined_nav_rule` for a non-bound vault, both readings at once:
 * `nav = sum over the two pots of (available + floor((earnings - withdrawn) * fee_share / 10000))`
 * where `available` is par (entry) or E3 (exit). Use it to show "entry value vs current exit
 * value" and to monitor the R3-M1 par - E3 gap.
 *
 * @param own          Own-domain pot.
 * @param sibling      Sibling pot.
 * @param feeShareBps  `registry.fee_share_bps` (<= 10000).
 * @returns Entry / exit NAV and their gap.
 * @example
 * ```ts
 * const p = nonboundVaultPricingP2b(own, sib, registry.feeShareBps);
 * if (p.parMinusE3Bps > 100) warn("exit is priced > 1% under entry");
 * ```
 */
export declare function nonboundVaultPricingP2b(own: NonboundPotP2b, sibling: NonboundPotP2b, feeShareBps: number): NonboundVaultPricingP2b;
/**
 * Engine `lp_shares_for_deposit`: `floor(amount * totalShares / nav)`; 1:1 with no shares.
 * @param amount       Deposit atoms.
 * @param totalShares  Shares outstanding.
 * @param navAtoms     ENTRY NAV ({@link NonboundVaultPricingP2b.entryNavAtoms}).
 * @returns Shares minted (null when the program would refuse: nav 0 with shares, or 0 shares).
 * @example
 * ```ts
 * lpSharesForDepositP2b(1_000n, 10_000n, 10_000n); // 1000n
 * ```
 */
export declare function lpSharesForDepositP2b(amount: bigint, totalShares: bigint, navAtoms: bigint): bigint | null;
/**
 * Engine `lp_atoms_for_redemption`: `floor(shares * nav / totalShares)`.
 * @param shares       Shares redeemed.
 * @param totalShares  Shares outstanding.
 * @param navAtoms     EXIT NAV ({@link NonboundVaultPricingP2b.exitNavAtoms}).
 * @returns Atoms, or null when the program would refuse (no shares, or shares > total).
 * @example
 * ```ts
 * lpAtomsForRedemptionP2b(1_000n, 10_000n, 9_900n); // 990n
 * ```
 */
export declare function lpAtomsForRedemptionP2b(shares: bigint, totalShares: bigint, navAtoms: bigint): bigint | null;
/** What the app shows a non-bound Earn holder: what the shares cost vs what they exit for now. */
export interface EntryVsExitP2b {
    /** Value of the holder's shares at the ENTRY reading (par). */
    entryValueAtoms: bigint;
    /** Value of the holder's shares at the EXIT reading (E3): what tag 77 would pay now (before the per-pot cap). */
    exitValueAtoms: bigint;
    /** `entryValue - exitValue` (>= 0): the holder's current exit haircut. */
    haircutAtoms: bigint;
    /** The haircut as bps of the entry value. */
    haircutBps: number;
}
/**
 * "Entry price vs current exit value" for `shares` of a non-bound Earn vault.
 *
 * @param shares       The holder's LP shares.
 * @param totalShares  Shares outstanding (registry `total_lp_shares_outstanding`).
 * @param pricing      {@link nonboundVaultPricingP2b} result.
 * @returns Entry value, exit value and the haircut.
 * @example
 * ```ts
 * const v = entryVsExitP2b(myShares, registry.totalLpSharesOutstanding, pricing);
 * // "Worth 1,000.00 at entry price, 992.20 if you exit now"
 * ```
 */
export declare function entryVsExitP2b(shares: bigint, totalShares: bigint, pricing: NonboundVaultPricingP2b): EntryVsExitP2b;
