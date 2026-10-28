/**
 * percolator-stake v5 (Phase 4 item 6, first-loss insurance staking): wire, accounts, the
 * `StakePool` v5 decoder and the error table for codes 33 to 48.
 *
 * Source: percolator-stake `release/v22-stake` `49e27e7` (PR #304 `feat/v22-stake-v5` head `480fe29`
 * plus the layout PR #306): `src/instruction.rs` (`unpack` at 764..850, docs at 93..172 and 722..759 of that head),
 * `src/state.rs` (`StakePool`, offsets pinned by const asserts at 246..293), `src/error.rs` (33..45 at 113..149).
 * DRAFT, not deployed; stake v5 and wrapper v2.2 deploy TOGETHER (the stake fails closed on any
 * `InsuranceUnitsV20` kind / version / size / owner mismatch).
 *
 * The v1 / v2.1 stake surface (`STAKE_IX`, `STAKE_ERRORS`, `decodeStakePool` for pool versions 1..4)
 * is untouched; this module is additive. `decodeStakePool` refuses a v5 pool with a version error,
 * which is the correct fail-closed behaviour: use {@link decodeStakePoolV5}.
 *
 * @module v22-stake
 */
import { PublicKey } from "@solana/web3.js";
import type { AccountMeta } from "@solana/web3.js";
import type { ErrorInfo } from "./errors.js";
/** New stake tags (the stake program's own namespace, NOT the wrapper's). */
export declare const STAKE_IX_V5: Readonly<{
    readonly SyncInsuranceDeployment: 31;
    readonly ProposeDeployTarget: 32;
    readonly CommitDeployTarget: 33;
}>;
/** `StakePool` v5: 480 bytes, version byte (`_reserved[8]` at 328) = 5. */
export declare const STAKE_POOL_SIZE_V5 = 480;
export declare const STAKE_POOL_VERSION_V5 = 5;
/** Risk modes (`RISK_MODE_*`). */
export declare const STAKE_RISK_MODE: Readonly<{
    readonly Legacy: 0;
    readonly FirstLoss: 1;
    readonly FeeOnly: 2;
}>;
/** `CONSENT_VERSION_FIRST_LOSS` (round 2: 1 -> 2). A deposit must carry the pool's `consent_version`. */
export declare const CONSENT_VERSION_FIRST_LOSS_V5 = 2;
/** Deployment bounds (`state.rs` 333..343). */
export declare const DEPLOY_TARGET_MAX_BPS_V5 = 8000;
export declare const DEPLOY_TARGET_DEFAULT_BPS_V5 = 5000;
export declare const LIQUID_BUFFER_DEFAULT_BPS_V5 = 3000;
export declare const HYSTERESIS_DEFAULT_BPS_V5 = 500;
export declare const HYSTERESIS_MAX_BPS_V5 = 2000;
export declare const SYNC_COOLDOWN_DEFAULT_SLOTS_V5 = 150n;
/** The commit timelock is `max(pool.cooldown_slots, 216_000)` (S-6 / round 2). */
export declare const DEPLOY_TARGET_TIMELOCK_MIN_SLOTS_V5 = 216000n;
/** `StakePool` v5 field offsets (rustc `offset_of!`; the v1..v4 prefix is unchanged). */
export declare const STAKE_POOL_FIELD_OFF_V5: Readonly<{
    readonly isInitialized: 0;
    readonly slab: 8;
    readonly vault: 136;
    readonly percolatorProgram: 224;
    readonly poolMode: 280;
    readonly reserved: 320;
    readonly version: 328;
    readonly riskMode: 408;
    readonly consentVersion: 409;
    readonly deployTargetBps: 410;
    readonly liquidBufferBps: 412;
    readonly hysteresisBps: 414;
    readonly lastSyncSlot: 416;
    readonly pendingTargetBps: 424;
    readonly pendingTargetSlot: 432;
    readonly syncCooldownSlots: 440;
    readonly creatorForwardedAtoms: 448;
    readonly v5Reserved: 456;
}>;
/** Deployment parameters a FIRST_LOSS staker signs over (S-5: bound into the deposit consent). */
export interface StakeDeployParamsV5 {
    /** Target share of the pool deployed into insurance, bps, `<= 8_000`. */
    targetBps: number;
    /** Share kept liquid by a sync top-up, bps. */
    bufferBps: number;
    /** No sync while the deployed share is within this many bps of the target, `<= 2_000`. */
    hysteresisBps: number;
}
/**
 * InitPool v5 (stake tag 0, 23-byte payload): `[0][cooldown u64][cap u64][risk_mode u8][target u16][buffer u16][hyst u16]`.
 * `risk_mode` 1 FIRST_LOSS (target `<= 8_000`), 2 FEE_ONLY (target 0). The 16-byte legacy InitPool creates a
 * FIRST_LOSS pool with the defaults 50% / 30% / 5%. Mirrors `instruction.rs:769..791`.
 *
 * @param cooldownSlots  Withdrawal cooldown.
 * @param depositCap     Deposit cap (0 = uncapped).
 * @param riskMode       1 or 2.
 * @param p              Deployment parameters (target must be 0 for FEE_ONLY).
 * @returns 24 bytes (tag + 23).
 * @example
 * ```ts
 * encodeStakeInitPoolV5(216_000n, 0n, STAKE_RISK_MODE.FirstLoss, { targetBps: 5000, bufferBps: 3000, hysteresisBps: 500 });
 * ```
 */
export declare function encodeStakeInitPoolV5(cooldownSlots: bigint, depositCap: bigint, riskMode: 1 | 2, p: StakeDeployParamsV5): Uint8Array;
/**
 * Deposit with first-loss consent (stake tag 1, 15-byte payload):
 * `[1][amount u64][accept_first_loss_version u8][target u16][buffer u16][hyst u16]`. A FIRST_LOSS pool
 * REQUIRES this form with the version equal to `pool.consent_version` AND the deployment parameters the
 * staker accepts equal to the pool's (`target` = the larger of the committed and a pending target), else
 * `ConsentRequired` (33). The 9-byte form is refused on such a pool. Mirrors `instruction.rs:807..827`.
 *
 * @param amount   Collateral atoms.
 * @param p        The pool's current deployment parameters (read them from {@link decodeStakePoolV5}).
 * @param version  Consent version (default {@link CONSENT_VERSION_FIRST_LOSS_V5}).
 * @returns 16 bytes.
 * @example
 * ```ts
 * encodeStakeDepositWithConsentV5(1_000_000n, { targetBps: 5000, bufferBps: 3000, hysteresisBps: 500 });
 * ```
 */
export declare function encodeStakeDepositWithConsentV5(amount: bigint, p: StakeDeployParamsV5, version?: number): Uint8Array;
/**
 * The deployment parameters a deposit must sign over for `pool`: `target` is the LARGER of the committed
 * target and a pending one (S-5), so a staker cannot be surprised by a raise that commits after their deposit.
 *
 * @param pool  Decoded pool.
 * @returns The parameters to pass to {@link encodeStakeDepositWithConsentV5}.
 * @example
 * ```ts
 * const p = consentParamsForPoolV5(decodeStakePoolV5(info.data));
 * ```
 */
export declare function consentParamsForPoolV5(pool: StakePoolV5Fields): StakeDeployParamsV5;
/**
 * SyncInsuranceDeployment (stake tag 31): `[31]`. Permissionless, rate limited.
 *
 * @returns 1 byte.
 * @example
 * ```ts
 * encodeStakeSyncInsuranceDeploymentV5(); // [31]
 * ```
 */
export declare function encodeStakeSyncInsuranceDeploymentV5(): Uint8Array;
/**
 * ProposeDeployTarget (stake tag 32): `[32][target_bps u16]`. The admin may only LOWER the target; raising needs
 * the stake program's upgrade authority. Takes effect via CommitDeployTarget after the cooldown.
 *
 * @param targetBps  Proposed target, `<= 8_000`.
 * @returns 3 bytes.
 * @example
 * ```ts
 * encodeStakeProposeDeployTargetV5(4000);
 * ```
 */
export declare function encodeStakeProposeDeployTargetV5(targetBps: number): Uint8Array;
/**
 * CommitDeployTarget (stake tag 33): `[33]`. Permissionless once `pending_target_slot + max(cooldown, 216_000)` has passed.
 *
 * @returns 1 byte.
 * @example
 * ```ts
 * encodeStakeCommitDeployTargetV5(); // [33]
 * ```
 */
export declare function encodeStakeCommitDeployTargetV5(): Uint8Array;
/** Named account of a stake v5 instruction. */
export interface StakeAccountSpecV5 {
    name: string;
    signer: boolean;
    writable: boolean;
}
/**
 * Stake Deposit v5, FIRST_LOSS (14): `instruction.rs:106..135`. Mode-0 / legacy pools use `[0..11]` only (the
 * market at `[11]` is read-only there); a FIRST_LOSS pool needs `[11]` writable plus `[12]` units and `[13]` the wrapper.
 */
export declare const ACCOUNTS_STAKE_DEPOSIT_V5: readonly StakeAccountSpecV5[];
/** Stake Withdraw v5, FIRST_LOSS (14): `instruction.rs:150..172`. `[10]` market is REQUIRED and writable on first-loss pools. */
export declare const ACCOUNTS_STAKE_WITHDRAW_V5: readonly StakeAccountSpecV5[];
/** SyncInsuranceDeployment (11): `instruction.rs:722..739`. */
export declare const ACCOUNTS_STAKE_SYNC_V5: readonly StakeAccountSpecV5[];
/** ProposeDeployTarget (2 + optional program data to RAISE): `instruction.rs:741..751`. */
export declare const ACCOUNTS_STAKE_PROPOSE_DEPLOY_TARGET_V5: readonly StakeAccountSpecV5[];
/** CommitDeployTarget (3): `instruction.rs:752..759`. */
export declare const ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5: readonly StakeAccountSpecV5[];
/**
 * Resolve named keys to metas for any spec list.
 *
 * @param spec  Spec list.
 * @param keys  Keys by name (`systemProgram`, `tokenProgram` and `clock` default to the well-known ids).
 * @returns Metas in spec order.
 * @throws If a name is missing.
 * @example
 * ```ts
 * const metas = stakeMetasV5(ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5, { anyone, pool });
 * ```
 */
export declare function stakeMetasV5(spec: readonly StakeAccountSpecV5[], keys: Record<string, PublicKey>): AccountMeta[];
/** The v5 fields of a pool (the v1..v4 fields come from `decodeStakePool`). */
export interface StakePoolV5Fields {
    /** 0 legacy, 1 FIRST_LOSS, 2 FEE_ONLY. */
    riskMode: number;
    consentVersion: number;
    deployTargetBps: number;
    liquidBufferBps: number;
    hysteresisBps: number;
    lastSyncSlot: bigint;
    pendingTargetBps: bigint;
    /** 0 = no pending proposal. */
    pendingTargetSlot: bigint;
    syncCooldownSlots: bigint;
    creatorForwardedAtoms: bigint;
    /** `_v5_reserved[0]`: the pending target was proposed by the protocol authority (S-6). */
    pendingTargetByProtocol: boolean;
    /** S1: cumulative terminal surplus forwarded to the creator (`_v5_reserved[8..16]`, bytes 464..472). */
    creatorSurplusForwardedAtoms: bigint;
    /**
     * S2 backlog (`_v5_reserved[16..24]`, bytes 472..480): wrapper fee payouts received while the pool had no real staker. INFORMATIONAL since the
     * close-out rule: the atoms stay unbooked in the vault until the close, where they are part of the surplus that goes to the stakers (or is
     * recorded unclaimed) and are NEVER paid to the creator beyond the seed.
     */
    s2BacklogOwedAtoms: bigint;
    /**
     * Close-out rule: the insurance seed recorded at the tag 19 bind (u56 LE at 457..464), valid only when byte 333 bit 0 is set; `null` when no
     * close-out-rule bind recorded one (a pool bound before the build: the creator is owed nothing at close).
     */
    creatorSeedAtoms: bigint | null;
    /**
     * Close-out rule: terminal surplus that no real staker can own and that is not the creator's (zero real stakers): left unbooked in `pool.vault`
     * and recorded here, a full u64 (low 7 bytes at 281..288, high byte at 334). Never paid to the creator.
     */
    unclaimedAtoms: bigint;
    /** Close-out rule: everything the pool has sent to the creator, `creatorForwardedAtoms` (448) + `creatorSurplusForwardedAtoms` (464), saturating at u64::MAX. */
    creatorTotalForwardedAtoms: bigint;
}
/**
 * Close-out rule, the creator's share of one terminal `surplus`: `min(surplus, min(seed, creatorClassReleased) - forwarded)`, with the subtraction
 * saturating at 0. `creatorClassReleased` is the wrapper's creator-class value released on a unitised FIRST_LOSS market and `undefined` otherwise.
 * Port of stake `math::closeout_creator_share`.
 *
 * @param surplus                Vault balance above the booked pool value (atoms).
 * @param seed                   The recorded seed ({@link StakePoolV5.creatorSeedAtoms}, 0 when none).
 * @param forwarded              {@link StakePoolV5.creatorTotalForwardedAtoms}.
 * @param creatorClassReleased   Creator-class value released so far (first-loss units), or `undefined`.
 * @returns The creator's share (never above the seed or the surplus).
 * @example
 * ```ts
 * closeoutCreatorShare(7_000_000n, 5_000_000n, 0n); // 5_000_000n
 * ```
 */
export declare function closeoutCreatorShare(surplus: bigint, seed: bigint, forwarded: bigint, creatorClassReleased?: bigint): bigint;
/** Result of {@link closeoutSplit}. */
export interface CloseoutSplit {
    /** Back to the creator: at most the seed recorded at bind. */
    creator: bigint;
    /** Booked to the pool, split pro rata among the real stakers. */
    stakers: bigint;
    /** Left unbooked in `pool.vault` (no real staker), recorded as unclaimed; never the creator's. */
    unclaimed: bigint;
}
/**
 * Close-out rule, one settlement's split: `creator = closeoutCreatorShare(..)`; the rest goes to the stakers when real stakers exist, else it is
 * `unclaimed`. Always `creator + stakers + unclaimed == surplus` and `stakers == 0n || unclaimed == 0n`. Port of stake `math::closeout_split`.
 *
 * @param i  `surplus`, `seed`, `forwarded`, optional `creatorClassReleased`, and whether the pool has real stakers (LP supply above the dead shares).
 * @returns `{ creator, stakers, unclaimed }`.
 * @example
 * ```ts
 * closeoutSplit({ surplus: 7_600n, seed: 5_000n, forwarded: 0n, hasRealStakers: false }); // { creator: 5_000n, stakers: 0n, unclaimed: 2_600n }
 * ```
 */
export declare function closeoutSplit(i: {
    surplus: bigint;
    seed: bigint;
    forwarded: bigint;
    creatorClassReleased?: bigint;
    hasRealStakers: boolean;
}): CloseoutSplit;
/** Decoded v5 pool: the v5 fields plus the identity fields every consumer needs. */
export interface StakePoolV5 extends StakePoolV5Fields {
    slab: PublicKey;
    admin: PublicKey;
    collateralMint: PublicKey;
    lpMint: PublicKey;
    vault: PublicKey;
    percolatorProgram: PublicKey;
    totalDeposited: bigint;
    totalLpSupply: bigint;
    cooldownSlots: bigint;
    depositCap: bigint;
    totalFlushed: bigint;
    totalReturned: bigint;
    totalWithdrawn: bigint;
    poolMode: number;
    /** `_reserved[41..49]` (absolute 361): senior/junior split input for the dead-share helpers. */
    juniorTotalLp: bigint;
    /** `_reserved[61]` (absolute 381): R-1 dead-share floor flags; 0 = legacy. See `stakeDeadLp`. */
    floorFlags: number;
    /** `total_fees_earned` (offset 256): counted in the pool value. */
    totalFeesEarned: bigint;
    /** `_reserved[51..59]` (absolute 371): realized (forfeited) junior loss, subtracted from the pool value (issue #161). */
    realizedJuniorLoss: bigint;
}
/**
 * Decode a `StakePool` v5 account. Checks the length (`>= 480`), the discriminator and the version byte (`== 5`)
 * before reading anything, and the same risk-mode bounds the program enforces.
 *
 * @param data  Raw pool account bytes.
 * @returns The pool.
 * @throws On a short buffer, a wrong discriminator, a version other than 5, or an out-of-range risk mode / bps.
 * @example
 * ```ts
 * const pool = decodeStakePoolV5(info.data);
 * const consent = consentParamsForPoolV5(pool);
 * ```
 */
export declare function decodeStakePoolV5(data: Uint8Array): StakePoolV5;
/**
 * Slot at which a pending deploy target can be committed: `pending_target_slot + max(cooldown, 216_000)`.
 *
 * @param pool  Decoded pool.
 * @returns The slot, or `null` when nothing is pending.
 * @example
 * ```ts
 * const at = commitSlotForPendingTargetV5(pool);
 * ```
 */
export declare function commitSlotForPendingTargetV5(pool: Pick<StakePoolV5, "pendingTargetSlot" | "cooldownSlots">): bigint | null;
/**
 * StakeError codes 33 to 48 (v5), with the stable Rust variant name and a calm one-line user message.
 * Codes 0 to 32 are the v2.1 table (`STAKE_ERRORS`); {@link decodeStakeErrorV5} covers all of them. Note
 * `STAKE_ERRORS[32]` still says "VERSION 18": on a v2.2 stake it pins VERSION 19 (see the PR notes).
 */
export declare const STAKE_ERRORS_V5: Readonly<Record<number, ErrorInfo>>;
/**
 * Stable Rust variant names of StakeError 0..32 (percolator-stake `src/error.rs` @ aebbff6), for
 * attributing a stake failure by name. The user-facing text for these codes is `STAKE_ERRORS`.
 */
export declare const STAKE_ERROR_NAMES: Readonly<Record<number, string>>;
/**
 * Decode a stake error code (0..48) for a v5 program. Codes 33..48 come from {@link STAKE_ERRORS_V5}; the
 * rest are looked up by the caller in `STAKE_ERRORS` (returned as `undefined` here).
 *
 * @param code  Custom program error code.
 * @returns Name and message, or `undefined` for a code this table does not own.
 * @example
 * ```ts
 * decodeStakeErrorV5(33)?.name; // "ConsentRequired"
 * ```
 */
export declare function decodeStakeErrorV5(code: number): ErrorInfo | undefined;
/** The booked fields `StakePool::total_pool_value()` reads. */
export interface StakePoolValueFields {
    totalDeposited: bigint;
    totalWithdrawn: bigint;
    totalFlushed: bigint;
    totalReturned: bigint;
    totalFeesEarned: bigint;
    realizedJuniorLoss: bigint;
}
/** Result of {@link stakePoolValue}. All atoms. */
export interface StakePoolValue {
    /** `StakePool::total_pool_value()`: the vault-resident booked value (already net of everything flushed to insurance). */
    liquid: bigint;
    /** `floor(units_stake * insurance / units_total)`: the pool's stake-class insurance units at the reading passed. */
    deployed: bigint;
    /** `liquid + deployed`: the value the program prices LP shares against (`pool_value_v5`). */
    total: bigint;
    /** `min(liquid, vaultBalance)` (`liquid_withdrawal_ok`): the most a withdrawal can pay right now. Only when a vault balance was passed. */
    withdrawableNow?: bigint;
}
/**
 * v5 pool value INCLUDING the insurance the pool has deployed into the wrapper. Mirrors stake `math::deployed_value` and
 * `math::pool_value_v5`, with `liquid` mirroring `StakePool::total_pool_value()` (deposited - withdrawn - flushed + returned +
 * fees - realized junior loss, in a signed wide intermediate). Pass the EXIT reading (`snapInsuranceFreeAtoms`, what withdrawals and
 * the sync use) for what a leaver is paid, or the ENTRY reading (`snapInsuranceMintAtoms`, what deposits mint against) for deposit
 * pricing. The deployed part comes back to the vault through a sync recovery, so a payout must still fit `liquid`.
 *
 * @param pool       Decoded v5 pool (`decodeStakePoolV5`) or any object with the six booked fields.
 * @param insUnits   The wrapper `InsuranceUnitsV20` (`decodeInsuranceUnitsV20`): `unitsStake`, `unitsTotal`.
 * @param insurance  The insurance reading, atoms (`snapInsuranceFreeAtoms` or `snapInsuranceMintAtoms`).
 * @param vaultBalance  Optional SPL balance of `pool.vault`; adds `withdrawableNow = min(liquid, vaultBalance)`.
 * @returns `{ liquid, deployed, total }`, or `null` where the program fails closed (negative or u64-overflowing value,
 *          `unitsStake > unitsTotal`, a multiply beyond u128).
 * @example
 * ```ts
 * const v = stakePoolValue(decodeStakePoolV5(pool.data), decodeInsuranceUnitsV20(units.data), units.snapInsuranceFreeAtoms);
 * if (v) show(v.total);
 * ```
 */
export declare function stakePoolValue(pool: StakePoolValueFields, insUnits: {
    unitsStake: bigint;
    unitsTotal: bigint;
}, insurance: bigint, vaultBalance?: bigint): StakePoolValue | null;
/**
 * Collateral a burn of `lpAmount` LP pays, priced with the pool's OWN LP counter (`StakePool.totalLpSupply`, u64 @176, which includes the
 * 1,000 dead shares), NOT the SPL mint supply: `floor(lpAmount * (poolValue + 1) / (totalLpSupply + 1))` (stake
 * `math::calc_collateral_for_withdraw`, N7 virtual offset).
 *
 * @param lpAmount       LP tokens burned.
 * @param totalLpSupply  `pool.totalLpSupply`.
 * @param poolValue      {@link StakePoolValue}.total.
 * @returns Atoms, or `null` (zero supply or beyond u64).
 * @example
 * ```ts
 * collateralForLpV5(1_000n, pool.totalLpSupply, v.total);
 * ```
 */
export declare function collateralForLpV5(lpAmount: bigint, totalLpSupply: bigint, poolValue: bigint): bigint | null;
/** Result of {@link quoteStakeWithdrawNowV5}. All atoms except the LP amounts. */
export interface StakeWithdrawQuoteV5 {
    /** Collateral a burn of the staker's whole LP balance would pay at the exit reading (what the program prices). */
    redeemable: bigint;
    /** The most any withdrawal can pay now: `min(liquid, vaultBalance)` (processor.rs:1626 `liquid_withdrawal_ok`). */
    liquidCap: bigint;
    /** `min(redeemable, liquidCap)`: the max-button amount. */
    maxCollateralNow: bigint;
    /** Largest LP burn whose payout fits `liquidCap` (and the balance): what to send for "max now". */
    maxLpNow: bigint;
    /** True when the liquid cap, not the balance, limits the withdrawal (part of the pool is deployed as insurance). */
    capBinds: boolean;
    /** `redeemable - maxCollateralNow`: the part that returns when the deployed insurance is recovered. */
    deferred: bigint;
}
/**
 * Quote the most a FIRST_LOSS staker can withdraw right now. After an insurance loss part of the pool is deployed as wrapper insurance, and
 * stake `process_withdraw` refuses (`LiquidityBufferExhausted`, 36) any payout above the pool's liquid value (processor.rs:1626-1631), so the
 * full redeem value is not payable until a sync recovers it. Use `maxLpNow` for the max button and `capBinds` to show one calm line.
 *
 * @param pool          Decoded v5 pool (`decodeStakePoolV5`, needs `totalLpSupply` plus the six booked fields).
 * @param insUnits      The wrapper `InsuranceUnitsV20`: `unitsStake`, `unitsTotal`.
 * @param exitInsurance Exit reading, atoms (`snapInsuranceFreeAtoms`).
 * @param vaultBalance  SPL balance of `pool.vault`.
 * @param userLp        The staker's LP balance.
 * @param liveInsurance OPTIONAL live market insurance (`min(Σ decodeTerminalInsuranceCapacity(marketData).domains[].withdrawCapacity, .insurance)`, the wrapper's `ins_units_readings_view` free reading). `units.snapInsuranceFreeAtoms`
 *                      is only refreshed when someone touches the units account, so after an insurance loss it is STALE-HIGH and over-quotes
 *                      (devnet FGSFL 2026-10-20: quote 10.96M, program paid 8.35M). The program re-reads the live free reading inside the withdraw
 *                      and free = min(withdraw capacity, gross insurance), so the exit reading is clamped to `min(exitInsurance, liveInsurance)`: never higher than what the
 *                      program will use. A stale-LOW snapshot only under-quotes (safe).
 * @returns The quote, or `null` where the program fails closed (see {@link stakePoolValue}) or the pool has no LP supply.
 * @example
 * ```ts
 * const q = quoteStakeWithdrawNowV5(pool, units, units.snapInsuranceFreeAtoms, vaultBal, userLp);
 * if (q?.capBinds) note(`up to ${q.maxCollateralNow} can be withdrawn now`);
 * ```
 */
export declare function quoteStakeWithdrawNowV5(pool: StakePoolValueFields & {
    totalLpSupply: bigint;
}, insUnits: {
    unitsStake: bigint;
    unitsTotal: bigint;
}, exitInsurance: bigint, vaultBalance: bigint, userLp: bigint, liveInsurance?: bigint): StakeWithdrawQuoteV5 | null;
/**
 * The creator's collateral token account for `RecoverTerminalInsurance`: the classic-token ATA of `pool.admin` for the pool mint.
 * The processor accepts it whenever passed (owner must be `pool.admin`) and requires it when the settlement owes the creator, so
 * always include it for a v5 pool.
 *
 * @param pool  Decoded v5 pool.
 * @returns The ATA address.
 * @example
 * ```ts
 * buildRecoverTerminalInsuranceIx({ ...accts, insuranceUnits, creatorToken: creatorCollateralAtaV5(pool) }, 0n);
 * ```
 */
export declare function creatorCollateralAtaV5(pool: Pick<StakePoolV5, "admin" | "collateralMint">): PublicKey;
