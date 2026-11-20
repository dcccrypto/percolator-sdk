// TEST ORACLE (from report J-20261120-SDK-REPORT-DIFF-WITHDRAWLIMITVSPROG, sdk-withdraw-limit-vs-prog-20261120).
// TS port of the program-side withdraw admission, line by line with citations, so the SDK withdraw-limit
// helpers can be run against it on the same edge states. Brute force on purpose (binary search over the
// real admission path), independent of the closed forms in src/abi/v22-withdraw.ts.
//
// Sources (scratch worktrees, detached):
//   PROG   percolator-prog  feat/v22-rc23-2026-10-22        @ 4a5065f5   src/v16_program.rs, src/bond_v20.rs
//   ENGINE percolator       feat/v22-engine-rc23-2026-10-22  @ 3e5970f3   src/v16.rs
//   STAKE  percolator-stake release/v22-stake               @ 9712e3c    src/processor.rs, src/math.rs, src/state.rs

export type Res = { ok: true; paid: bigint } | { ok: false; err: string };
const U64_MAX = (1n << 64n) - 1n;

// ───────────────────────────── collateral: Withdraw (tag 4) ─────────────────────────────

export interface MarketState {
  mode: "Live" | "Resolved" | "Recovery";
  /** permissionless_resolve_matured_now_view (PROG v16_program.rs:14436) */
  resolveMatured: boolean;
  nowSlot: bigint;
  /** cfg.maintenance_fee_per_slot */
  maintFeePerSlot: bigint;
  /** SPL balance of the market vault token account */
  vaultTokenBalance: bigint;
  /** engine header.vault and c_tot (only underflow checks) */
  engineVault: bigint;
  cTot: bigint;
}

export interface PortfolioState {
  capital: bigint;
  pnl: bigint; // i128 (realized + unrealized booked into pnl by refresh; positive part includes un-released / "warmup" PnL)
  feeCredits: bigint; // i128, always <= 0 (ENGINE v16.rs:29365-29370 validate_fee_credits)
  activeLegs: boolean; // !active_bitmap_is_empty
  closeLedgerActive: boolean; // close_progress != EMPTY && !canceled && !is_finalized_inert
  lastFeeSlot: bigint;
}

/** ENGINE v16.rs:2050-2066 kernel_settle_principal + v16.rs:24531-24583 settle_negative_pnl_from_principal_core_not_atomic */
function settleNegativePnl(p: PortfolioState, m: MarketState): void {
  if (p.pnl >= 0n) return; // 24536
  const loss = -p.pnl; // 2055
  const paid = p.capital < loss ? p.capital : loss; // 2056
  p.capital -= paid; // 2057
  m.cTot -= paid; // 2060
  p.pnl += paid; // 2062
}

/** ENGINE v16.rs:24890-24930 charge_account_fee_current_not_atomic */
function chargeFee(p: PortfolioState, m: MarketState, requested: bigint): bigint {
  if (requested === 0n || p.pnl < 0n) return 0n; // 24895
  const charged = requested < p.capital ? requested : p.capital; // 24898
  p.capital -= charged; // 24903
  m.cTot -= charged; // 24909
  return charged;
}

/**
 * PROG v16_program.rs:15741-15761 collect_maintenance_fee_to_slot_before_value_debit_view
 *   -> 28797 sync_maintenance_fee_checkpointed (no checkpoint modelled: one leg at current rate, 28834-28837)
 *   -> ENGINE v16.rs:25865-25910 sync_account_fee_to_slot_not_atomic (flat Live account: anchor = now, 25879-25885)
 */
function collectMaintenanceFee(p: PortfolioState, m: MarketState): void {
  if (m.mode !== "Live" || m.maintFeePerSlot === 0n) return; // 15747
  if (m.nowSlot <= p.lastFeeSlot) return; // 25886 fee_anchor <= last_fee_slot
  const dt = m.nowSlot - p.lastFeeSlot; // 25889
  const fee = m.maintFeePerSlot * dt; // 25890
  settleNegativePnl(p, m); // 25903
  chargeFee(p, m, fee); // 25904
  p.lastFeeSlot = m.nowSlot; // 25905
}

/** ENGINE v16.rs:28313-28323 account_equity_from_parts: capital + pnl - |fee_credits| */
function equityFromParts(capital: bigint, pnl: bigint, feeCredits: bigint): bigint {
  return capital + pnl - (feeCredits < 0n ? -feeCredits : feeCredits);
}

/** ENGINE v16.rs:25913-25975 withdraw_not_atomic */
export function engineWithdraw(m: MarketState, p: PortfolioState, amount: bigint): Res {
  if (amount === 0n) return { ok: true, paid: 0n }; // 25918-25920
  if (m.mode !== "Live") return { ok: false, err: "LockActive (engine not Live) v16.rs:25922" };
  if (p.activeLegs) return { ok: false, err: "Stale (active leg) v16.rs:25925-25927" };
  if (p.closeLedgerActive) return { ok: false, err: "LockActive (close ledger) v16.rs:25936-25942" };
  settleNegativePnl(p, m); // 25943
  if (p.pnl < 0n || amount > p.capital) return { ok: false, err: "LockActive (pnl<0 or amount>capital) v16.rs:25944-25946" };
  const post = p.capital - amount; // 25947-25952
  if (equityFromParts(post, p.pnl, p.feeCredits) < 0n) return { ok: false, err: "InvalidConfig (equity_after<0) v16.rs:25953-25960" };
  if (m.cTot < amount || m.engineVault < amount) return { ok: false, err: "CounterUnderflow v16.rs:25963-25975" };
  p.capital = post;
  m.cTot -= amount;
  m.engineVault -= amount;
  return { ok: true, paid: amount };
}

/** PROG v16_program.rs:17866-17985 handle_withdraw (value path only; account/key checks assumed valid) */
export function progWithdraw(m0: MarketState, p0: PortfolioState, amount: bigint): Res {
  const m = { ...m0 };
  const p = { ...p0 };
  if (m.mode !== "Live") return { ok: false, err: "EngineLockActive (mode) v16_program.rs:17896-17898" };
  if (amount === 0n) return { ok: true, paid: 0n }; // 17912-17914
  if (amount > U64_MAX) return { ok: false, err: "amount_to_u64 v16_program.rs:17915" };
  if (m.resolveMatured) return { ok: false, err: "OracleStale (resolve matured) v16_program.rs:17924 -> 14432-14440" };
  const capitalBeforeFee = p.capital; // 17957
  collectMaintenanceFee(p, m); // 17958
  const withdrawn = amount === capitalBeforeFee ? p.capital : amount; // 17964-17968 (withdraw-all keeps working after the fee)
  const r = engineWithdraw(m, p, withdrawn); // 17969-17971
  if (!r.ok) return r;
  if (m.vaultTokenBalance < withdrawn) return { ok: false, err: "InvalidTokenAccount (vault short) v16_program.rs:17979-17980 -> 50796-50800" };
  return { ok: true, paid: withdrawn };
}

/** Most atoms the program will ACTUALLY PAY for any requested amount (monotone search + the withdraw-all special case). */
export function progMaxWithdraw(m: MarketState, p: PortfolioState): bigint {
  let best = 0n;
  const all = progWithdraw(m, p, p.capital);
  if (all.ok) best = all.paid;
  let lo = 0n;
  let hi = p.capital; // a request can never pay more than the pre-fee capital
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    const r = mid === p.capital ? { ok: false as const, err: "skip special" } : progWithdraw(m, p, mid);
    if (r.ok) lo = mid;
    else hi = mid - 1n;
  }
  return lo > best ? lo : best;
}

// ───────────────────────────── stake v5 FIRST_LOSS withdraw ─────────────────────────────

export interface StakePoolState {
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  totalFlushed: bigint;
  totalReturned: bigint;
  totalFeesEarned: bigint;
  realizedJuniorLoss: bigint;
  totalLpSupply: bigint;
  cooldownSlots: bigint;
  poolMode: 0 | 1;
  /** mode 0: wrapper_paid - mode0_fees_attributed (STAKE processor.rs accrue_fees_inner, #290) */
  attributableFees: bigint;
}
export interface StakeCtx {
  nowSlot: bigint;
  lastDepositSlot: bigint;
  depositLp: bigint;
  vaultBalance: bigint;
  unitsStake: bigint;
  unitsTotal: bigint;
  /** units.snap_free re-read inside the withdraw (v5_read_units) */
  snapFree: bigint;
}

/** STAKE state.rs:1074-1104 total_pool_value */
function stakeLiquid(p: StakePoolState): bigint | null {
  const v = p.totalDeposited - p.totalWithdrawn - p.totalFlushed + p.totalReturned + p.totalFeesEarned - p.realizedJuniorLoss;
  return v < 0n || v > U64_MAX ? null : v;
}

/** STAKE processor.rs:1339-1600 process_withdraw, FIRST_LOSS (v5) branch, no tranches, HWM off (HWM cannot be set on FIRST_LOSS: processor.rs:3056-3059). */
export function stakeWithdraw(pool0: StakePoolState, c: StakeCtx, lpAmount: bigint): Res {
  const pool = { ...pool0 };
  if (lpAmount === 0n) return { ok: false, err: "ZeroAmount processor.rs:1345" };
  if (c.nowSlot < c.lastDepositSlot + pool.cooldownSlots) return { ok: false, err: "CooldownNotElapsed processor.rs:1501-1507" };
  if (lpAmount > c.depositLp) return { ok: false, err: "InsufficientLpTokens processor.rs:1508-1510" };
  // processor.rs:1520 pre_accrue_fee_modes -> 2691-2727 -> accrue_fees_inner 2766-2830 (real holders assumed)
  {
    const liq = stakeLiquid(pool);
    if (liq === null) return { ok: false, err: "Overflow" };
    const surplus = c.vaultBalance > liq ? c.vaultBalance - liq : 0n; // 2775
    const delta = pool.poolMode === 0 ? (surplus < pool.attributableFees ? surplus : pool.attributableFees) : surplus; // 2777-2797
    pool.totalFeesEarned += delta;
  }
  // processor.rs:1543-1569
  let deployed = 0n; // math.rs:549-558 deployed_value
  if (c.unitsTotal !== 0n) {
    if (c.unitsStake > c.unitsTotal) return { ok: false, err: "Overflow (units)" };
    deployed = (c.unitsStake * c.snapFree) / c.unitsTotal;
  }
  const liquid = stakeLiquid(pool);
  if (liquid === null) return { ok: false, err: "Overflow" };
  const pv = liquid + deployed; // math.rs:584-586
  // math.rs:108-127 calc_collateral_for_withdraw, VIRTUAL_ASSETS = VIRTUAL_SHARES = 1 (math.rs:39-40)
  const w = (lpAmount * (pv + 1n)) / (pool.totalLpSupply + 1n);
  if (!(w <= liquid && w <= c.vaultBalance)) return { ok: false, err: "LiquidityBufferExhausted processor.rs:1559-1566 (math.rs:645-647)" };
  if (w === 0n) return { ok: false, err: "ZeroAmount processor.rs:1579-1581" };
  return { ok: true, paid: w };
}

/** Largest collateral the stake program pays for any LP burn <= the deposit's LP (monotone in lp). Returns [atoms, lp]. */
export function stakeMax(pool: StakePoolState, c: StakeCtx): [bigint, bigint] {
  let lo = 0n;
  let hi = c.depositLp;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if (stakeWithdraw(pool, c, mid).ok) lo = mid;
    else hi = mid - 1n;
  }
  if (lo === 0n) return [0n, 0n];
  const r = stakeWithdraw(pool, c, lo);
  return [r.ok ? r.paid : 0n, lo];
}

// ───────────────────────────── bond: BondExecuteWithdraw (tag 110) Live ─────────────────────────────

export interface BondLiveState {
  shares: bigint; // pending_withdraw_shares
  bSharesTotal: bigint;
  cB: bigint; // K (coupon assumed already settled to now, rate 0, so the settle is a no-op)
  cooldownElapsed: boolean;
  seniorDrawOutstanding: bigint;
  backstopOutstanding: bigint;
  nav: bigint;
  seniorClaim: bigint; // st.senior_claim_atoms (c_eff on the Live bond path, v16_program.rs:43941)
  harvestableFee: bigint;
  undrawnDeficit: bigint;
  vWorse: bigint; // vault_value_net_of_backstop(vault_value_worse(..))
  nCapAfter: bigint | null;
  oiLong: bigint;
  oiShort: bigint;
  lpEffAbs: bigint;
  // vault LP portfolio for the engine withdraw
  lpCapital: bigint;
  lpPnl: bigint;
  lpActiveLegs: boolean;
  lpFeeCredits?: bigint;
}

/** PROG v16_program.rs:43712-43760 (outer gates) + 43900-43998 bond_withdraw_live_core + ENGINE withdraw_not_atomic */
export function progBondWithdrawLive(s: BondLiveState): Res {
  if (s.shares === 0n || !s.cooldownElapsed) return { ok: false, err: "BondWithdrawCooldown v16_program.rs:43742-43743" };
  if (s.seniorDrawOutstanding + s.backstopOutstanding > 0n) return { ok: false, err: "VaultLpPausedForSeniorDraw (halt) v16_program.rs:43802-43806" };
  if (s.harvestableFee !== 0n) return { ok: false, err: "VaultLpHarvestPending v16_program.rs:43924-43926" };
  if (s.nav < s.seniorClaim) return { ok: false, err: "BondCapacityLocked (nav < c_eff) v16_program.rs:43944-43946" };
  if (s.undrawnDeficit !== 0n) return { ok: false, err: "VaultLpSeniorDrawRequired v16_program.rs:43947-43949" };
  // bond_v20.rs:88-101 tranche_split3, 191-196 bond_atoms_for_redemption
  const senior = s.vWorse < s.seniorClaim ? s.vWorse : s.seniorClaim;
  const rest = s.vWorse - senior;
  const bond = rest < s.cB ? rest : s.cB;
  if (s.bSharesTotal === 0n || s.shares > s.bSharesTotal) return { ok: false, err: "BondConfigInvalid" };
  const payout = (s.shares * bond) / s.bSharesTotal; // 43968-43970
  // bond_v20.rs:246-258 bond_withdraw_lock_ok, checked at 43988
  const side = s.oiLong > s.oiShort ? s.oiLong : s.oiShort;
  const need = side > s.lpEffAbs ? side : s.lpEffAbs;
  const lockOk = s.nCapAfter === null ? need === 0n : s.nCapAfter >= need;
  if (!lockOk) return { ok: false, err: "BondCapacityLocked (OI lock) v16_program.rs:43988-43990" };
  if (payout !== 0n) {
    // 43992 group.withdraw_not_atomic(&mut lp, payout)
    if (s.lpActiveLegs) return { ok: false, err: "EngineStale (vault LP has an active leg) v16.rs:25925-25927 via v16_program.rs:43992" };
    let cap = s.lpCapital;
    let pnl = s.lpPnl;
    if (pnl < 0n) {
      const paid = cap < -pnl ? cap : -pnl;
      cap -= paid;
      pnl += paid;
    }
    if (pnl < 0n || payout > cap) return { ok: false, err: "EngineLockActive (payout > LP capital) v16.rs:25944-25946 via v16_program.rs:43992" };
    if (equityFromParts(cap - payout, pnl, s.lpFeeCredits ?? 0n) < 0n) return { ok: false, err: "InvalidConfig (equity_after<0) v16.rs:25953-25960 via 43992" };
  }
  return { ok: true, paid: payout };
}

// ───────────────────────────── LP vault junior: WithdrawJuniorTranche (tag 97) Live ─────────────────────────────
// Added for the fix PR (J-20261120-SDK-FIX-WITHDRAWLIMITVSPROG). PROG v16_program.rs:38670-38880.

export interface JuniorState {
  live: boolean;
  drawOutstanding: bigint; // senior_draw_outstanding + backstop_outstanding (38760-38762)
  nav: bigint;
  harvestable: bigint;
  lpValue: bigint;
  seniorClaim: bigint;
  seniorFeeShareBps: bigint;
  bondClaim: bigint; // claim_upper_bound_at(now) (38744-38747)
  cushion: { accrued: bigint; targetBps: bigint } | null; // ext [11] (38739)
  juniorFloorBps: bigint;
  vaultToken: bigint;
  lpCapital: bigint;
  lpPnl: bigint;
  lpActiveLegs: boolean;
  lpFeeCredits: bigint; // <= 0
  maintFeePerSlot: bigint;
  nowSlot: bigint;
  lpLastFeeSlot: bigint;
  creatorMin: bigint | null; // lev_min_creator_stake_view
}

const bpsFloor = (x: bigint, bps: bigint) => (x * bps) / 10_000n; // vault_lp_v18 bps_floor
const bpsCeil = (x: bigint, bps: bigint) => (x * bps + 9_999n) / 10_000n; // vault_lp_v18 bps_ceil
function split3(v: bigint, cs: bigint, cb: bigint) {
  const senior = v < cs ? v : cs;
  const rest = v - senior;
  const bond = rest < cb ? rest : cb;
  return { senior, bond, junior: rest - bond }; // bond_v20.rs:88-101
}

export function progJuniorWithdraw(s: JuniorState, amount: bigint, skipCreatorMin = false): Res {
  if (amount === 0n) return { ok: false, err: "LpVaultZeroAmount 38694-38696" };
  if (!s.live) return { ok: false, err: "EngineLockActive (mode) 38718-38720" };
  if (amount > U64_MAX) return { ok: false, err: "amount_to_u64 38735" };
  if (s.vaultToken < amount) return { ok: false, err: "require_token_balance 38736" };
  if (s.drawOutstanding > 0n) return { ok: false, err: "VaultLpPausedForSeniorDraw 38760-38762" };
  // 38781 collect_maintenance_fee_before_value_debit_view on the vault LP (same engine path as collectMaintenanceFee above)
  let lpCapital = s.lpCapital;
  let lpPnl = s.lpPnl;
  let lpValue = s.lpValue;
  if (s.maintFeePerSlot !== 0n && s.nowSlot > s.lpLastFeeSlot) {
    if (lpPnl < 0n) {
      const paid = lpCapital < -lpPnl ? lpCapital : -lpPnl;
      lpCapital -= paid;
      lpPnl += paid;
    }
    if (lpPnl >= 0n) {
      const fee = s.maintFeePerSlot * (s.nowSlot - s.lpLastFeeSlot);
      const charged = fee < lpCapital ? fee : lpCapital;
      lpCapital -= charged;
      // a charge clears the health cert (engine charge_account_fee_current_not_atomic), so vault_lp_value_atoms takes the
      // flat path: conservative_equity(capital, pnl, fc) = max(0, capital + min(pnl,0) + min(fc,0)) (v16_program.rs:35884-35889)
      if (charged > 0n) {
        const ce = lpCapital + (lpPnl < 0n ? lpPnl : 0n) + (s.lpFeeCredits < 0n ? s.lpFeeCredits : 0n);
        lpValue = ce > 0n ? ce : 0n;
      }
    }
  }
  const cover = s.nav + s.harvestable; // 38799-38801
  const cEff = s.seniorClaim + bpsFloor(s.harvestable, s.seniorFeeShareBps); // 38802-38807 effective_senior_claim
  const v = s.nav + s.harvestable + lpValue; // 38809 vault_value
  const locked = s.cushion ? (s.cushion.accrued < bpsCeil(cEff, s.cushion.targetBps) ? s.cushion.accrued : bpsCeil(cEff, s.cushion.targetBps)) : 0n; // 38812-38820
  const gated = amount + locked; // 38821-38823
  // bond_v20.rs:127-147 junior_withdraw_allowed3
  if (cover < cEff) return { ok: false, err: "VaultLpJuniorWithdrawRefused (cover < C_eff) 38824" };
  const junior = split3(v, cEff, s.bondClaim).junior;
  if (gated + bpsCeil(cEff, s.juniorFloorBps) > junior) return { ok: false, err: "VaultLpJuniorWithdrawRefused (floor) 38824" };
  // 38854-38858 lev_require_creator_stake / junior_stake_ok
  if (s.creatorMin !== null && !skipCreatorMin) {
    const after = split3(v > amount ? v - amount : 0n, cEff, s.bondClaim).junior;
    if (!(after === 0n || after >= s.creatorMin)) return { ok: false, err: "CreatorStakeBelowMinimum 45684" };
  }
  // 38859 group.withdraw_not_atomic(&mut lp, amount) — flat-only, capital-only
  if (s.lpActiveLegs) return { ok: false, err: "EngineStale v16.rs:25925-25927" };
  let cap = lpCapital;
  let pnl = lpPnl;
  if (pnl < 0n) {
    const paid = cap < -pnl ? cap : -pnl;
    cap -= paid;
    pnl += paid;
  }
  if (pnl < 0n || amount > cap) return { ok: false, err: "EngineLockActive v16.rs:25944-25946" };
  if (equityFromParts(cap - amount, pnl, s.lpFeeCredits) < 0n) return { ok: false, err: "InvalidConfig v16.rs:25953-25960" };
  return { ok: true, paid: amount };
}

/**
 * Largest amount tag 97 accepts. Every gate but the creator minimum caps the amount from above (monotone), so search those
 * first (X); the creator minimum refuses a gap (junior - min, junior), so if X falls in it, search again with every gate.
 */
export function progJuniorMax(s: JuniorState, hiBound: bigint): bigint {
  const search = (hi0: bigint, skip: boolean) => {
    let lo = 0n;
    let hi = hi0;
    while (lo < hi) {
      const mid = (lo + hi + 1n) / 2n;
      if (progJuniorWithdraw(s, mid, skip).ok) lo = mid;
      else hi = mid - 1n;
    }
    return lo;
  };
  const x = search(hiBound, true);
  if (x === 0n || progJuniorWithdraw(s, x).ok) return x;
  return search(x, false);
}
