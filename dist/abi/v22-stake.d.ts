/**
 * percolator-stake v5 (Phase 4 item 6, first-loss insurance staking): wire, accounts, the
 * `StakePool` v5 decoder and the error table for codes 33 to 45.
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
}
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
 * StakeError codes 33 to 45 (v5), with the stable Rust variant name and a calm one-line user message.
 * Codes 0 to 32 are the v2.1 table (`STAKE_ERRORS`); {@link decodeStakeErrorV5} covers all of them. Note
 * `STAKE_ERRORS[32]` still says "VERSION 18": on a v2.2 stake it pins VERSION 19 (see the PR notes).
 */
export declare const STAKE_ERRORS_V5: Readonly<Record<number, ErrorInfo>>;
/**
 * Decode a stake error code (0..45) for a v5 program. Codes 33..45 come from {@link STAKE_ERRORS_V5}; the
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
