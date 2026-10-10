/**
 * Stake-pool dead-share (MINIMUM_LIQUIDITY) accounting, mirroring `StakePool::dead_lp`,
 * `real_lp_supply`, `real_senior_lp`, `real_junior_lp` and `has_real_lp_holders` in
 * percolator-stake `src/state.rs` (fix/v22-stake-last-junior-residual @ aebbff6).
 *
 * Each sub-pool (senior, junior) can lock `MINIMUM_LIQUIDITY` dead shares, so a tranche pool
 * holds 0, 1000 or 2000 dead shares. The floors are recorded in `StakePool._reserved[61]`
 * (absolute byte 381 on v2+ pools: `_reserved` starts at 320; 349 on v1, where it starts at 288).
 *
 * @module
 */
/** `MINIMUM_LIQUIDITY` — dead shares locked per sub-pool (`state.rs`). */
export declare const STAKE_MINIMUM_LIQUIDITY = 1000n;
/** Index of the floor-flags byte inside `StakePool._reserved`. */
export declare const STAKE_FLOOR_FLAGS_RESERVED_INDEX = 61;
/** `FLOOR_SENIOR`: senior supply (`total_lp_supply - junior_total_lp`) holds one dead floor. */
export declare const FLOOR_SENIOR = 1;
/** `FLOOR_JUNIOR`: `junior_total_lp` holds one dead floor. */
export declare const FLOOR_JUNIOR = 2;
/** The pool fields the dead-share helpers read. */
export interface StakeDeadLpInput {
    totalLpSupply: bigint;
    juniorTotalLp: bigint;
    /** Raw `_reserved[61]`. `0` with `totalLpSupply > 0` = legacy pool (pre-fix program). */
    floorFlags: number;
}
/**
 * Dead LP per sub-pool, or `null` for a legacy pool (flags 0: one floor somewhere in the supply).
 * Mirrors `StakePool::dead_lp`.
 */
export declare function stakeDeadLp(pool: Pick<StakeDeadLpInput, "floorFlags">): {
    senior: bigint;
    junior: bigint;
} | null;
/** Senior sub-pool supply: `total_lp_supply - junior_total_lp` (saturating), as `senior_total_lp()`. */
export declare function stakeSeniorTotalLp(pool: Pick<StakeDeadLpInput, "totalLpSupply" | "juniorTotalLp">): bigint;
/** `real_senior_lp`: senior supply minus senior dead; legacy pools: the senior supply. */
export declare function stakeRealSeniorLp(pool: StakeDeadLpInput): bigint;
/** `real_junior_lp`: `junior_total_lp` minus junior dead; legacy pools: `junior_total_lp`. */
export declare function stakeRealJuniorLp(pool: StakeDeadLpInput): bigint;
/**
 * `real_lp_supply`: `total - senior_dead - junior_dead` (saturating); legacy pools (flags 0):
 * `total - 1000` (saturating), the pre-fix rule.
 */
export declare function stakeRealLpSupply(pool: Pick<StakeDeadLpInput, "totalLpSupply" | "floorFlags">): bigint;
/** `has_real_lp_holders`: `real_lp_supply() > 0`. The program refuses AccrueFees (error 29) when false. */
export declare function stakeHasRealLpHolders(pool: Pick<StakeDeadLpInput, "totalLpSupply" | "floorFlags">): boolean;
