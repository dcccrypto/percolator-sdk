/**
 * v2.2 withdraw limits: the most the program will actually pay for a collateral withdrawal (tag 4) and a junior tranche
 * withdrawal (tag 97), computed the way prog rc23 / engine rc23 admit them.
 *
 * Sources (rc23): prog `percolator-prog` feat/v22-rc23-2026-10-22 @ 4a5065f5 (`src/v16_program.rs`, `src/bond_v20.rs`,
 * `src/vault_lp_v18.rs`, `src/lev_guard_v22.rs`); engine `percolator` feat/v22-engine-rc23-2026-10-22 @ 3e5970f3 (`src/v16.rs`).
 *
 * Both helpers are pure: the caller reads the accounts (portfolio, market config, vault token account) and passes the
 * numbers in. The engine withdraw is FLAT-ONLY (`withdraw_not_atomic`, v16.rs:25925-25927): there is no
 * margin-after-withdraw path, so any active leg makes the limit 0, however much margin is free.
 */

import { bpsCeilV22, bpsFloorV22, trancheSplit3V22, bondWithdrawLockOkV22 } from "./v22-math.js";

const U64_MAX = (1n << 64n) - 1n;

const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);
const absBig = (x: bigint): bigint => (x < 0n ? -x : x);

/** A whole-instruction refusal: the program pays 0 for every amount. `code` is the `PercolatorError` custom code. */
export interface WithdrawRefusalV22<C extends number = number, N extends string = string> {
  code: C;
  name: N;
}

/**
 * The maintenance-fee step every withdraw runs first (prog `collect_maintenance_fee_before_value_debit_view` → engine
 * `sync_account_fee_to_slot_not_atomic` v16.rs:25865-25910): with a fee due, settle a loss from capital, then charge
 * `min(rate * (now - last_fee_slot), capital)` unless PnL is still negative. Throws when a rate is set without both slots, so
 * a missing input cannot silently drop the fee (the quote would then be too high).
 */
function chargeMaintenanceFee(capital: bigint, pnl: bigint, rate: bigint, nowSlot?: bigint, lastFeeSlot?: bigint): { capital: bigint; pnl: bigint; fee: bigint } {
  if (rate <= 0n) return { capital, pnl, fee: 0n };
  if (nowSlot === undefined || lastFeeSlot === undefined) throw new Error("maintenance fee rate set: pass nowSlot and lastFeeSlot");
  if (nowSlot <= lastFeeSlot) return { capital, pnl, fee: 0n };
  if (pnl < 0n) {
    const paid = min(capital, -pnl);
    capital -= paid;
    pnl += paid;
  }
  // charge_account_fee_current_not_atomic (24890-24930): nothing is charged while PnL is still negative.
  if (pnl < 0n) return { capital, pnl, fee: 0n };
  const fee = min(rate * (nowSlot - lastFeeSlot), capital);
  return { capital: capital - fee, pnl, fee };
}

// ───────────────────────────── collateral: Withdraw (tag 4) ─────────────────────────────

/** Inputs of {@link maxWithdrawCollateralV22}. Atoms unless noted. */
export interface CollateralWithdrawInputV22 {
  /** Portfolio `capital` (before the maintenance fee this withdraw crystallizes). */
  capital: bigint;
  /** Portfolio `pnl` (signed). Positive PnL, released or still warming up, is never payable through tag 4. */
  pnl: bigint;
  /** Portfolio `fee_credits` (signed, always `<= 0` on chain; its magnitude is fee debt). */
  feeCredits: bigint;
  /** True when the portfolio has any active leg (`!active_bitmap_is_empty`). The engine refuses (EngineStale). */
  hasActiveLegs: boolean;
  /** True when a forced-close ledger is active (not canceled, not finalized-inert). The engine refuses (EngineLockActive). */
  closeLedgerActive?: boolean;
  /** Market mode is Live. Tag 4 is Live-only; resolved funds exit through CloseResolved. */
  live: boolean;
  /** Live, but the permissionless resolve has matured (`permissionless_resolve_matured_now_view`): OracleStale. */
  resolveMatured?: boolean;
  /** Fee slot: `max(Clock.slot, market header current_slot)` (prog 14290-14297) at landing. Required when `maintenanceFeePerSlot > 0`. */
  nowSlot?: bigint;
  /** Portfolio `last_fee_slot` (required when `maintenanceFeePerSlot > 0`). */
  lastFeeSlot?: bigint;
  /** Market `maintenance_fee_per_slot` (0 = off). The rate-checkpoint leg (prog 28810-28826) is not modelled: after a rate cut, read the portfolio after a fee crank. */
  maintenanceFeePerSlot?: bigint;
  /** SPL balance of the market vault token account. Omit to skip this cap. */
  vaultTokenBalance?: bigint;
}

/** Result of {@link maxWithdrawCollateralV22}. */
export interface CollateralWithdrawQuoteV22 {
  /** The most atoms the program pays (0 when refused). Use it for the max button and for display. */
  maxAtoms: bigint;
  /**
   * The `amount` to put in the instruction for "withdraw max". Equal to `capital` (the pre-fee capital) when the max is the
   * whole post-fee capital and PnL is not negative: the program then pays the post-fee capital at the landing slot
   * (v16_program.rs:17964-17968), so a few more slots of maintenance fee cannot make the max request fail. Otherwise equal to
   * `maxAtoms` (which a later landing slot with more fee can still refuse: re-quote, or leave a margin).
   */
  maxRequestAmount: bigint;
  /** Maintenance fee the withdraw crystallizes first (prog 17958). */
  feeAtoms: bigint;
  /** Capital after the negative-PnL settlement and the fee. */
  capitalAfterFee: bigint;
  /** What bounds `maxAtoms`: post-fee capital, fee debt (`equity_after >= 0`), the vault token balance, or a refusal. */
  binding: "capital" | "equity" | "vault" | "refused";
  refusal:
    | WithdrawRefusalV22<14, "EngineInvalidConfig">
    | WithdrawRefusalV22<19, "EngineStale">
    | WithdrawRefusalV22<21, "EngineLockActive">
    | WithdrawRefusalV22<27, "OracleStale">
    | null;
}

/**
 * The most collateral a v2.2 portfolio can withdraw through tag 4 (`Withdraw`), in the program's order
 * (prog `handle_withdraw` v16_program.rs:17866-17985 → engine `withdraw_not_atomic` v16.rs:25913-25975):
 *
 * 1. Live only (17896-17898) and not resolve-matured (17924): otherwise 0.
 * 2. The engine is flat-only: any active leg → EngineStale (25925-25927); an active close ledger → EngineLockActive (25936-25942).
 *    There is no initial/maintenance-margin-after-withdraw path, so an open position at any margin level pays 0.
 * 3. Negative PnL settles from capital first (25943; engine settle `paid = min(capital, -pnl)`); PnL still negative → 0.
 * 4. The maintenance fee `min(rate * (now - last_fee_slot), capital)` is charged from capital first (prog 17958).
 * 5. Only capital pays: `amount <= capital` (25944-25946). Positive PnL (warmup or released) needs ConvertReleasedPnl first.
 * 6. `capital - amount + pnl - |fee_credits| >= 0` (25953-25960).
 * 7. The vault token account must hold the amount (17979-17980).
 *
 * Not modelled: the rate-checkpoint leg of the fee sync (prog 28810-28826) and the engine `c_tot` / vault counter underflow
 * (both consistent on a healthy market).
 *
 * @param i  See {@link CollateralWithdrawInputV22}.
 * @returns The quote. `maxAtoms` never exceeds u64.
 * @example
 * ```ts
 * const q = maxWithdrawCollateralV22({ capital, pnl, feeCredits, hasActiveLegs, live: true, nowSlot, lastFeeSlot, maintenanceFeePerSlot, vaultTokenBalance });
 * buildWithdraw(q.maxRequestAmount);
 * ```
 */
export function maxWithdrawCollateralV22(i: CollateralWithdrawInputV22): CollateralWithdrawQuoteV22 {
  const refused = (refusal: NonNullable<CollateralWithdrawQuoteV22["refusal"]>, feeAtoms = 0n, capitalAfterFee = i.capital): CollateralWithdrawQuoteV22 => ({
    maxAtoms: 0n,
    maxRequestAmount: 0n,
    feeAtoms,
    capitalAfterFee,
    binding: "refused",
    refusal,
  });
  if (!i.live) return refused({ code: 21, name: "EngineLockActive" });
  if (i.resolveMatured) return refused({ code: 27, name: "OracleStale" });

  // prog 17958: the fee is crystallized first.
  const f = chargeMaintenanceFee(i.capital, i.pnl, i.maintenanceFeePerSlot ?? 0n, i.nowSlot, i.lastFeeSlot);
  let capital = f.capital;
  let pnl = f.pnl;
  const feeAtoms = f.fee;
  const settle = (): void => {
    if (pnl >= 0n) return;
    const paid = min(capital, -pnl);
    capital -= paid;
    pnl += paid;
  };

  if (i.hasActiveLegs) return refused({ code: 19, name: "EngineStale" }, feeAtoms, capital);
  if (i.closeLedgerActive) return refused({ code: 21, name: "EngineLockActive" }, feeAtoms, capital);
  settle(); // 25943
  if (pnl < 0n) return refused({ code: 21, name: "EngineLockActive" }, feeAtoms, capital); // 25944

  let maxAtoms = capital;
  let binding: CollateralWithdrawQuoteV22["binding"] = "capital";
  const equityRoom = capital + pnl - absBig(i.feeCredits); // equity_after >= 0  <=>  amount <= capital + pnl - |fc|
  if (equityRoom < maxAtoms) {
    // equity_after < 0 for every positive amount → InvalidConfig (v16.rs:25953-25960)
    if (equityRoom <= 0n) return refused({ code: 14, name: "EngineInvalidConfig" }, feeAtoms, capital);
    maxAtoms = equityRoom;
    binding = "equity";
  }
  if (i.vaultTokenBalance !== undefined && i.vaultTokenBalance < maxAtoms) {
    maxAtoms = i.vaultTokenBalance < 0n ? 0n : i.vaultTokenBalance;
    binding = "vault";
  }
  if (maxAtoms > U64_MAX) maxAtoms = U64_MAX;
  // The withdraw-all path (amount == pre-fee capital) pays the capital left after the FEE step at the landing slot. It is
  // only the max when nothing else binds, the pre-fee capital fits the u64 amount, and the PnL is not negative: a loss is
  // settled from capital by the engine AFTER the program picks the amount (unless a fee was charged), so with pnl < 0 the
  // pre-fee capital would be refused (v16.rs:25944-25946).
  const maxRequestAmount = binding === "capital" && maxAtoms > 0n && i.pnl >= 0n && i.capital <= U64_MAX ? i.capital : maxAtoms;
  return { maxAtoms, maxRequestAmount, feeAtoms, capitalAfterFee: capital, binding, refusal: null };
}

// ───────────────────────────── junior tranche: WithdrawJuniorTranche (tag 97) ─────────────────────────────

/** Inputs of {@link maxWithdrawJuniorV22}. Atoms unless noted. Read them AFTER cranking the maintenance fee if you can. */
export interface JuniorWithdrawInputV22 {
  /** Market mode is Live (tag 97 is Live-only). */
  live: boolean;
  /** Live, but the permissionless resolve has matured. */
  resolveMatured?: boolean;
  /** Any asset's mark still lags its target (`reject_market_price_lagged_view`): EngineLockActive. */
  priceLagged?: boolean;
  /** `senior_draw_outstanding_atoms + backstop_outstanding_atoms`: the junior exit halts (89) while non-zero. */
  seniorDrawOutstandingAtoms?: bigint;
  backstopOutstandingAtoms?: bigint;
  /** Backing NAV of the pots (`lp_vault_combined_nav_parts_p3(..).1`). */
  nav: bigint;
  /** `lp_vault_harvestable_fee_atoms`. */
  harvestableFeeAtoms: bigint;
  /** `vault_lp_value_atoms` of the bound vault LP. */
  lpValueAtoms: bigint;
  /** `VaultLpStateV18::senior_claim_atoms`. */
  seniorClaimAtoms: bigint;
  /** `VaultLpStateV18::senior_fee_share_bps`. */
  seniorFeeShareBps: number;
  /** Bond claim upper bound at the landing slot (`bondClaimUpperBoundAtV22(tranche, now)`); 0 without a bond tranche. */
  bondClaimUpperBound?: bigint;
  /** `VaultLpExtV19::cushion_accrued_atoms` and `cushion_target_bps`; omit without the ext (no cushion lock). */
  cushion?: { accruedAtoms: bigint; targetBps: number };
  /** `VaultLpStateV18::junior_floor_bps`. */
  juniorFloorBps: number;
  /** SPL balance of the market vault token account. */
  vaultTokenBalance: bigint;
  /**
   * The vault LP portfolio the engine withdraw debits (flat-only, capital-only). `lastFeeSlot` + `nowSlot` +
   * `maintenanceFeePerSlot`: tag 97 crystallizes the LP's maintenance fee before it reads the value (v16_program.rs:38781);
   * the fee comes off the LP's capital, and a charged fee clears the LP's health cert, so the value becomes its conservative
   * equity `max(0, capital + min(pnl,0) + min(fc,0))` (positive PnL no longer counts).
   */
  lp: { capital: bigint; pnl: bigint; feeCredits?: bigint; hasActiveLegs: boolean; lastFeeSlot?: bigint };
  /** Fee slot: `max(Clock.slot, market header current_slot)` (prog 14290-14297). Required with `maintenanceFeePerSlot > 0`. */
  nowSlot?: bigint;
  /** Market `maintenance_fee_per_slot` (0 = off). The rate-checkpoint leg (prog 28810-28826) is not modelled: after a rate change, read the LP after a fee crank. */
  maintenanceFeePerSlot?: bigint;
  /**
   * Growth assets only: the open-interest lock. `nCapAfter(amount)` is the LP capacity left after `amount`
   * (`growth_n_cap_for_view(c_m - amount)`); it must be monotone non-increasing in `amount`. Omit when growth is off.
   */
  oiLock?: { nCapAfter: (amount: bigint) => bigint; oiLongQ: bigint; oiShortQ: bigint; lpEffAbsQ: bigint };
  /** Creator minimum stake (`lev_min_creator_stake_view`): the junior's value after the withdraw must be 0 or at least this. */
  creatorStakeMinAtoms?: bigint;
}

/** Result of {@link maxWithdrawJuniorV22}. */
export interface JuniorWithdrawQuoteV22 {
  /** The largest `amount` tag 97 accepts (0 when refused). */
  maxAtoms: bigint;
  /** The junior layer of the waterfall now (`tranche_split3(v, c_eff, bond).junior`). */
  junior: bigint;
  /** Floor plus locked cushion that stays behind. */
  reservedAtoms: bigint;
  refusal:
    | WithdrawRefusalV22<19, "EngineStale">
    | WithdrawRefusalV22<21, "EngineLockActive">
    | WithdrawRefusalV22<27, "OracleStale">
    | WithdrawRefusalV22<75, "VaultLpJuniorWithdrawRefused">
    | WithdrawRefusalV22<89, "VaultLpPausedForSeniorDraw">
    | WithdrawRefusalV22<131, "CreatorStakeBelowMinimum">
    | null;
}

/**
 * The most a junior owner can withdraw with tag 97 (`WithdrawJuniorTranche`, prog v16_program.rs:38670-38880), in the
 * program's order: Live only; halt while a senior draw / backstop is outstanding (89); price lag and resolve-matured
 * refusals; `junior_withdraw_allowed3` (bond_v20.rs:127-147): the pots alone cover `C_eff`
 * (`nav + harvestable >= C_eff`) and `amount + cushion_locked + ceil(C_eff * floor_bps) <= junior`; the open-interest lock
 * (growth assets); the creator-stake minimum (`junior_stake_ok`: value after is 0 or >= min); then the flat-only engine
 * withdraw from the vault LP's capital; and the vault token balance.
 *
 * `C_eff = senior_claim + floor(harvestable * senior_fee_share_bps)` and `v = nav + harvestable + lp_value`
 * (vault_lp_v18.rs:93-105). The maintenance fee the instruction crystallizes on the vault LP first (38781) is taken off
 * the LP's capital and its value when `nowSlot`, `lp.lastFeeSlot` and `maintenanceFeePerSlot` are passed.
 *
 * @param i  See {@link JuniorWithdrawInputV22}.
 * @returns The quote.
 * @example
 * ```ts
 * const q = maxWithdrawJuniorV22({ live: true, nav, harvestableFeeAtoms, lpValueAtoms, seniorClaimAtoms, seniorFeeShareBps, juniorFloorBps, vaultTokenBalance, lp });
 * ```
 */
export function maxWithdrawJuniorV22(i: JuniorWithdrawInputV22): JuniorWithdrawQuoteV22 {
  const out = (maxAtoms: bigint, junior: bigint, reservedAtoms: bigint, refusal: JuniorWithdrawQuoteV22["refusal"]): JuniorWithdrawQuoteV22 => ({
    maxAtoms,
    junior,
    reservedAtoms,
    refusal,
  });
  if (!i.live) return out(0n, 0n, 0n, { code: 21, name: "EngineLockActive" });
  if ((i.seniorDrawOutstandingAtoms ?? 0n) + (i.backstopOutstandingAtoms ?? 0n) > 0n) return out(0n, 0n, 0n, { code: 89, name: "VaultLpPausedForSeniorDraw" });
  if (i.priceLagged) return out(0n, 0n, 0n, { code: 21, name: "EngineLockActive" });
  if (i.resolveMatured) return out(0n, 0n, 0n, { code: 27, name: "OracleStale" });

  // 38781: the LP's maintenance fee is crystallized before any value is read.
  const lpFee = chargeMaintenanceFee(i.lp.capital, i.lp.pnl, i.maintenanceFeePerSlot ?? 0n, i.nowSlot, i.lp.lastFeeSlot);
  // A charge clears the LP's health cert (engine charge_account_fee_current_not_atomic), so `vault_lp_value_atoms`
  // (v16_program.rs:35863-35893) falls back to conservative_equity(capital, pnl, fc) = max(0, capital + min(pnl,0) + min(fc,0)):
  // positive PnL a cert counted is no longer in the value.
  let lpValue = i.lpValueAtoms;
  if (lpFee.fee > 0n) {
    const fc = i.lp.feeCredits ?? 0n;
    const ce = lpFee.capital + (lpFee.pnl < 0n ? lpFee.pnl : 0n) + (fc < 0n ? fc : 0n);
    lpValue = ce > 0n ? ce : 0n;
  }
  const senFee = bpsFloorV22(i.harvestableFeeAtoms, i.seniorFeeShareBps);
  if (senFee === null) return out(0n, 0n, 0n, { code: 75, name: "VaultLpJuniorWithdrawRefused" });
  const cEff = i.seniorClaimAtoms + senFee;
  const cover = i.nav + i.harvestableFeeAtoms;
  const v = i.nav + i.harvestableFeeAtoms + lpValue;
  const bond = i.bondClaimUpperBound ?? 0n;
  const junior = trancheSplit3V22(v, cEff, bond).junior;
  let locked = 0n;
  if (i.cushion) {
    const target = bpsCeilV22(cEff, i.cushion.targetBps);
    if (target === null) return out(0n, junior, 0n, { code: 75, name: "VaultLpJuniorWithdrawRefused" });
    locked = min(i.cushion.accruedAtoms, target);
  }
  const floor = bpsCeilV22(cEff, i.juniorFloorBps);
  if (floor === null) return out(0n, junior, 0n, { code: 75, name: "VaultLpJuniorWithdrawRefused" });
  const reserved = floor + locked;
  if (cover < cEff || junior <= reserved) return out(0n, junior, reserved, { code: 75, name: "VaultLpJuniorWithdrawRefused" });
  let maxAtoms = junior - reserved;

  // Engine withdraw (flat-only, capital-only), v16.rs:25913-25975.
  if (i.lp.hasActiveLegs) return out(0n, junior, reserved, { code: 19, name: "EngineStale" });
  let cap = lpFee.capital;
  let pnl = lpFee.pnl;
  if (pnl < 0n) {
    const paid = min(cap, -pnl);
    cap -= paid;
    pnl += paid;
  }
  if (pnl < 0n) return out(0n, junior, reserved, { code: 21, name: "EngineLockActive" });
  const equityRoom = cap + pnl - absBig(i.lp.feeCredits ?? 0n);
  maxAtoms = min(maxAtoms, min(cap, equityRoom < 0n ? 0n : equityRoom));
  maxAtoms = min(maxAtoms, i.vaultTokenBalance < 0n ? 0n : i.vaultTokenBalance);
  if (maxAtoms > U64_MAX) maxAtoms = U64_MAX;

  // Open-interest lock: largest amount whose capacity after still covers OI and the LP's inventory (monotone in amount).
  if (i.oiLock && maxAtoms > 0n) {
    const lock = i.oiLock;
    const ok = (a: bigint): boolean => bondWithdrawLockOkV22(lock.nCapAfter(a), lock.oiLongQ, lock.oiShortQ, lock.lpEffAbsQ);
    if (!ok(maxAtoms)) {
      let lo = 0n;
      let hi = maxAtoms;
      while (lo < hi) {
        const mid = (lo + hi + 1n) / 2n;
        if (ok(mid)) lo = mid;
        else hi = mid - 1n;
      }
      maxAtoms = lo === 0n || !ok(lo) ? 0n : lo;
    }
  }

  // Creator stake: value after must be 0 (a full exit) or >= the minimum. Value after = junior - amount here (amount <= junior).
  const minStake = i.creatorStakeMinAtoms ?? 0n;
  if (minStake > 0n && maxAtoms > 0n) {
    const after = (a: bigint): bigint => trancheSplit3V22(v > a ? v - a : 0n, cEff, bond).junior;
    if (after(maxAtoms) !== 0n && after(maxAtoms) < minStake) {
      const room = junior - minStake;
      maxAtoms = room > 0n ? min(maxAtoms, room) : 0n;
      if (maxAtoms === 0n) return out(0n, junior, reserved, { code: 131, name: "CreatorStakeBelowMinimum" });
    }
  }
  return out(maxAtoms, junior, reserved, maxAtoms === 0n ? { code: 75, name: "VaultLpJuniorWithdrawRefused" } : null);
}
