pub const BPS: u128 = 10_000;

// ── time (slots; 400 ms per slot, the convention every growth constant already uses) ────────

pub const SLOTS_PER_HOUR: u64 = 9_000;
pub const SLOTS_PER_DAY: u64 = 216_000;
/// D-j: no opens before the token is 6 h old.
pub const AGE_NO_OPEN_SLOTS: u64 = 6 * SLOTS_PER_HOUR;
/// D-k: the 35 % dump default runs to 24 h.
pub const AGE_DAY_SLOTS: u64 = SLOTS_PER_DAY;
/// G1 / D-l: young-token rules (20 % dump default, β 0.1, m_ind 100 % for the rug case) to 7 d.
pub const AGE_WEEK_SLOTS: u64 = 7 * SLOTS_PER_DAY;
/// Sims §13 `m_tail`: 100 % under 30 d, 50 % after (no Pyth).
pub const AGE_MONTH_SLOTS: u64 = 30 * SLOTS_PER_DAY;

/// The age bands every new-token rule reads.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum AgeBand {
    /// `age < 6 h` (D-j): no opens at all, closes only.
    NoOpen,
    /// `6 h <= age < 24 h` (D-k): J_dump default 35 %.
    Day,
    /// `24 h <= age < 7 d` (G1): J_dump default 20 %; β 0.1 (D-l); m_ind 100 % for the rug (G4).
    Week,
    /// `7 d <= age < 30 d`: m_tail 100 %.
    Month,
    /// `age >= 30 d`: m_tail 50 %.
    Mature,
}

/// The token's age band. `t0_slot` is the guard's T0 (the earliest slot the program can vouch
/// for: the guard's creation, or an upgrade-authority backdate). A T0 in the future (clock or
/// data fault) reads age 0 and fails closed to `NoOpen`.
pub fn age_band(t0_slot: u64, now: u64) -> AgeBand {
    let age = now.saturating_sub(t0_slot);
    if now < t0_slot || age < AGE_NO_OPEN_SLOTS {
        AgeBand::NoOpen
    } else if age < AGE_DAY_SLOTS {
        AgeBand::Day
    } else if age < AGE_WEEK_SLOTS {
        AgeBand::Week
    } else if age < AGE_MONTH_SLOTS {
        AgeBand::Month
    } else {
        AgeBand::Mature
    }
}

impl AgeBand {
    /// Under 7 d (G1, G4, D-l).
    pub fn young(self) -> bool {
        self <= AgeBand::Week
    }
}
fn max16(a: u16, b: u16) -> u16 {
    if a > b { a } else { b }
}
fn min16(a: u16, b: u16) -> u16 {
    if a < b { a } else { b }
}
fn cap_bps(x: u16) -> u16 {
    min16(x, 10_000)
}
pub const L_FLOOR_X100: u16 = 200;
pub fn l_floor_x100(l_eng_x100: u16) -> u16 {
    min16(L_FLOOR_X100, l_eng_x100)
}

// ── trader leverage with the dump term (plan v2 §3 LEVERAGE) ─────────────────────────────────

/// z = 2.33 over 1 h (decision 2), as a ratio 233 / 100.
pub const Z_NUM: u64 = 233;
pub const Z_DEN: u64 = 100;
/// φ_open: the opening cost in the cushion (levmodel `PHI_OPEN` = 0.30 %).
pub const PHI_OPEN_BPS: u64 = 30;

/// `L_trader = 1 / (MMR + φ_open + sqrt((z·σ_1h)² + J²))`, x100, floored (tighter). `sigma_1h_bps`
/// `None` (no volatility data) reads 0 here: the existing controller already pins a market with
/// no data at launch, and this term is a `min` on top of it.
pub fn l_trader_x100(mmr_bps: u64, sigma_1h_bps: Option<u64>, jump_bps: u16) -> u16 {
    let zs = sigma_1h_bps.unwrap_or(0).saturating_mul(Z_NUM).div_ceil(Z_DEN) as u128;
    let j = jump_bps as u128;
    let cushion = isq::isqrt_ceil_u128(zs.saturating_mul(zs).saturating_add(j * j));
    let den = (mmr_bps as u128).saturating_add(PHI_OPEN_BPS as u128).saturating_add(cushion);
    if den == 0 {
        return u16::MAX;
    }
    let l = 1_000_000u128 / den;
    if l > u16::MAX as u128 { u16::MAX } else { l as u16 }
}

/// Decision 25 / G8: after a breaker trip, `m_oracle = 0.75` on leverage for 24 h.
pub const M_ORACLE_NUM: u32 = 3;
pub const M_ORACLE_DEN: u32 = 4;

/// The leverage ceiling in force with the overlay (x100):
/// `min(existing, max(L_floor, min(L_trader, l_cap)·m_oracle, [frozen])))`. NEVER above
/// `existing` (tighten-only); the floor only lifts the NEW term.
pub fn l_overlay_x100(
    existing_x100: u16,
    l_trader_x100: u16,
    l_cap_x100: u16,
    m_oracle: bool,
    frozen_x100: Option<u16>,
    l_eng_x100: u16,
) -> u16 {
    let mut t = min16(l_trader_x100, l_cap_x100);
    if m_oracle {
        t = ((t as u32) * M_ORACLE_NUM / M_ORACLE_DEN) as u16;
    }
    if let Some(f) = frozen_x100 {
        t = min16(t, f);
    }
    let t = max16(l_floor_x100(l_eng_x100), t);
    min16(existing_x100, t)
}

// ── size: age rule, report multiplier, N_floor (D-d, D-j) ────────────────────────────────────

/// D-d `N_floor` in collateral notional: $200 (whole tokens of the $1 collateral, scaled by the
/// collateral decimals at the call site).
pub const N_FLOOR_USD: u64 = 200;

/// The capacity in force with the overlay (Q): `0` under 6 h (D-j, overrides the floor), else
/// `min(n_cap, max(n_cap·n_mult, min(n_cap, n_floor)), [frozen])`. Never above `n_cap`.
pub fn n_overlay_q(n_cap_q: u128, band: AgeBand, n_mult_bps: u16, n_floor_q: u128, frozen_q: Option<u128>) -> u128 {
    if band == AgeBand::NoOpen {
        return 0;
    }
    let scaled = n_cap_q / BPS * (cap_bps(n_mult_bps) as u128)
        + (n_cap_q % BPS) * (cap_bps(n_mult_bps) as u128) / BPS;
    let floor = if n_floor_q < n_cap_q { n_floor_q } else { n_cap_q };
    let mut v = if scaled > floor { scaled } else { floor };
    if let Some(f) = frozen_q {
        // A freeze never lifts the floor above itself and never raises: min with the snapshot.
        if f < v {
            v = f;
        }
    }
    if v > n_cap_q { n_cap_q } else { v }
}

// ── short side: the corrected dump cap (sims §13, D-l, G4) ───────────────────────────────────

/// β (bps): 0.1 under 7 d (D-l), 0.5 after.
pub const BETA_YOUNG_BPS: u16 = 1_000;
pub const BETA_BPS: u16 = 5_000;
pub fn beta_bps(band: AgeBand) -> u16 {
    if band.young() { BETA_YOUNG_BPS } else { BETA_BPS }
}

/// `m_tail` (bps): 100 % under 30 d, 50 % older (no Pyth confirmation exists in v2.2).
pub fn m_tail_bps(band: AgeBand) -> u16 {
    if band < AgeBand::Mature { 10_000 } else { 5_000 }
}

/// The dump size the short cap uses: `max(m_ind_rug, 1 %, m_tail)` with `m_ind_rug = 100 %`
/// under 7 d (G4: a rug is a 100 % dump).
pub fn m_dump_bps(band: AgeBand, m_ind_bps: u16) -> u16 {
    let rug = if band.young() { 10_000 } else { cap_bps(m_ind_bps) };
    max16(max16(rug, 100), m_tail_bps(band))
}

/// The users' short notional allowed (collateral atoms):
/// `long_users · min(1, MMR/m) + β·C_m/m` (sims §13 decision 15, β per D-l).
pub fn short_users_cap_notional(long_users_notional: u128, c_m: u128, mmr_bps: u64, band: AgeBand, m_ind_bps: u16) -> u128 {
    let m = m_dump_bps(band, m_ind_bps) as u128; // >= 100, never 0
    let off_bps = core::cmp::min(BPS, (mmr_bps as u128).saturating_mul(BPS) / m);
    let offset = mul_div_floor_sat(long_users_notional, off_bps, BPS);
    let dump = mul_div_floor_sat(c_m, beta_bps(band) as u128, m);
    offset.saturating_add(dump)
}

// ── burst memory (decision 28, sims MC-2b; night 2026-10-28 P2) ───────────────────────────────

/// `σ_eff ≥ k·σ_peak` with k = 0.5, i.e. on the variance `var_eff ≥ var_peak / 4`.
pub const BURST_VAR_FLOOR_DIV: u32 = 4;
/// The peak's half-life: 7 days (plan §13; the H8 fix of the sim).
pub const BURST_HALF_LIFE_SLOTS: u64 = 7 * SLOTS_PER_DAY;

/// The stored peak decayed over `elapsed` slots: halved per whole half-life, then LINEAR inside the
/// current half-life (`p·(1 − f/2)`, f ∈ [0, 1)), which is never below the exact `p·2^(−f)`: it decays no
/// faster than the sim's exponential (tighter, never looser).
pub fn burst_decay(peak: u32, elapsed: u64) -> u32 {
    let halvings = elapsed / BURST_HALF_LIFE_SLOTS;
    if halvings >= 32 {
        return 0;
    }
    let p = (peak >> halvings) as u64;
    let rem = elapsed % BURST_HALF_LIFE_SLOTS;
    // p - p·rem/(2·HL), rounded so the result stays >= the exact value (subtract the floor).
    let cut = p.saturating_mul(rem) / (2 * BURST_HALF_LIFE_SLOTS);
    (p - cut) as u32
}

/// Fold the current variance into the memory. A new high (>= the decayed peak) restarts the clock;
/// otherwise the stored peak and slot are kept (decay is read from the original high, so repeated
/// samples never compound the linear segments). A slot behind the peak's (clock fault) reads elapsed 0.
pub fn burst_update(peak: u32, peak_slot: u64, var_now: u32, now: u64) -> (u32, u64) {
    let eff = burst_decay(peak, now.saturating_sub(peak_slot));
    if var_now >= eff {
        (var_now, now)
    } else {
        (peak, peak_slot)
    }
}

/// The variance the leverage term uses: `max(var_now, decayed_peak / 4)`. Tighten-only (>= var_now).
pub fn burst_var_eff(peak: u32, peak_slot: u64, var_now: u32, now: u64) -> u32 {
    let floor = burst_decay(peak, now.saturating_sub(peak_slot)) / BURST_VAR_FLOOR_DIV;
    if floor > var_now { floor } else { var_now }
}

// ── price band: the on-chain mirror of the keeper breaker (decision 25, G8) ──────────────────
/// `floor(a · b / d)` saturating at u128::MAX; `d == 0` reads 0 (callers never pass it).
pub fn mul_div_floor_sat(a: u128, b: u128, d: u128) -> u128 {
    if d == 0 {
        return 0;
    }
    match a.checked_mul(b) {
        Some(p) => p / d,
        None => {
            // (a / d) · b + (a % d) · b / d, each saturating.
            let hi = (a / d).saturating_mul(b);
            let lo = match (a % d).checked_mul(b) {
                Some(p) => p / d,
                None => u128::MAX,
            };
            hi.saturating_add(lo)
        }
    }
}
mod isq {
pub fn isqrt_ceil_u128(x: u128) -> u128 {
    if x < 2 {
        return x;
    }
    // floor sqrt by Newton
    let mut r = x;
    let mut y = x / 2 + (x & 1); // ceil(x / 2) < x for x >= 2, and never overflows
    while y < r {
        r = y;
        y = (r + x / r) / 2;
    }
    if r * r == x { r } else { r + 1 }
}
}
