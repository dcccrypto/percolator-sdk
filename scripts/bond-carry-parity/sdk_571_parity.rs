//! GH#571 (prog #649) bond coupon-carry SDK parity oracle. Copy into a checkout of percolator-prog at the PR head
//! (engine sibling at ENGINE_CI_SIBLING) as `src/bin/sdk_571_parity.rs` (never commit it there) and run:
//!   cargo run --release --quiet --bin sdk_571_parity -- <prog sha> <engine sha> > test/fixtures/bond-carry-571-parity.json
//!
//! Everything comes from the REAL crate: `state::BondTrancheV20` (rustc `size_of` / `offset_of!`), the program's own
//! `init_bond_tranche` / `write_bond_tranche` / `read_bond_tranche` (+ `validate_bond_tranche`), the method
//! `BondTrancheV20::claim_upper_bound_at`, and the pure `bond_v20` rules. The tag 108 / 110 / 78 steps below are the
//! handler bodies (`bond_settle_coupon_to`, `bond_deposit_core` + `handle_bond_deposit`, `bond_withdraw_live_core` /
//! the Resolved arm + `handle_bond_execute_withdraw`, `bond_coupon_take`) transcribed from `src/v16_program.rs`
//! line by line onto those real functions: the handlers themselves need `AccountInfo`s and are private, so they cannot
//! be called from a bin. A refused step reverts (the tranche is unchanged), as the transaction would.
use core::mem::{offset_of, size_of};
use percolator_prog::bond_v20 as b;
use percolator_prog::constants as c;
use percolator_prog::p4_rescue_ins as r;
use percolator_prog::state::{self, BondTrancheV20};

fn hex(x: &[u8]) -> String { x.iter().map(|v| format!("{v:02x}")).collect() }
fn o<T: ToString>(x: Option<T>) -> String { match x { Some(v) => format!("\"{}\"", v.to_string()), None => "null".into() } }

fn rec(t: &BondTrancheV20) -> (String, bool) {
    let mut a = vec![0u8; state::bond_tranche_account_len()];
    // init with a valid shell, then write the real record through the program's writer (validates)
    state::init_bond_tranche(&mut a, &shell(0, 800, 5_000)).unwrap();
    let ok = state::write_bond_tranche(&mut a, t).is_ok();
    if !ok {
        // the writer refused: lay the raw bytes down so the SDK decoder sees exactly what the program would refuse
        a[16..16 + size_of::<BondTrancheV20>()].copy_from_slice(bytemuck::bytes_of(t));
    }
    let reads = state::read_bond_tranche(&a).is_ok();
    (hex(&a), reads)
}

// ── handler transcriptions (src/v16_program.rs at the PR head) ──────────────────────────────────────────
fn settle_to(t: &mut BondTrancheV20, drawn: u128, now: u64, open_now: bool, zero_rem: bool) -> Option<u128> {
    let open = open_now && b::coupon_interval_clean(t.coupon_gate_seen, drawn);
    let rate = b::bond_coupon_rate_bps(t.coupon_bps_per_year, t.coupon_util_bonus_bps, 0);
    let (x, rem) = b::coupon_settle(t.c_b_atoms, t.coupon_unfunded_atoms, t.coupon_accrual_rem, rate, now.saturating_sub(t.last_coupon_slot), open, t.c_b_atoms)?;
    t.coupon_unfunded_atoms = t.coupon_unfunded_atoms.checked_add(x)?;
    t.c_b_atoms = t.c_b_atoms.checked_add(x)?;
    t.coupon_arrears_atoms = t.coupon_arrears_atoms.checked_add(x)?;
    t.coupon_accrual_rem = if zero_rem { 0 } else { rem };
    t.coupon_gate_seen = b::coupon_gate_seen(drawn, open_now);
    if now > t.last_coupon_slot { t.last_coupon_slot = now; }
    Some(x)
}

struct Env { now: u64, drawn: u128, v: u128, v_worse: u128, c_eff: u128, draw_out: u128, backstop: u128 }

/// tag 108: Ok((minted, settled x, K priced at)) or Err((code, settled x if the settlement ran, K)).
fn deposit(t: &mut BondTrancheV20, e: &Env, amount: u128) -> Result<(u128, u128, u128), (u32, Option<(u128, u128)>)> {
    if e.draw_out != 0 || e.backstop != 0 { return Err((89, None)); }
    let v = r::vault_value_net_of_backstop(e.v, e.backstop);
    let v_worse = r::vault_value_net_of_backstop(e.v_worse, e.backstop);
    if v_worse < e.c_eff || b::bond_impaired(v_worse, e.c_eff, t.c_b_atoms) { return Err((107, None)); }
    let mut n = *t;
    let open_now = n.c_b_atoms > 0;
    let x = settle_to(&mut n, e.drawn, e.now, open_now, true).ok_or((15, None))?;
    n.coupon_gate_seen = b::coupon_gate_seen(e.drawn, true);
    let k = n.c_b_atoms;
    let at = Some((x, k));
    if b::bond_impaired(v_worse, e.c_eff, k) { return Err((107, at)); }
    let split = b::tranche_split3(v, e.c_eff, k);
    let k_after = k.checked_add(amount).ok_or((15, at))?;
    if !b::bond_deposit_cap_ok_at_worse(v_worse, e.c_eff, k, k_after, n.bond_cap_bps_of_c) { return Err((123, at)); }
    let minted = b::bond_shares_for_deposit(amount, n.b_shares_total, split.bond).ok_or((107, at))?;
    if minted == 0 { return Err((124, at)); }
    n.coupon_unfunded_atoms = b::coupon_meter_after_deposit(n.coupon_unfunded_atoms, n.c_b_atoms, amount).ok_or((15, at))?;
    n.c_b_atoms = k_after;
    n.b_shares_total = n.b_shares_total.checked_add(minted).ok_or((15, at))?;
    n.principal_in_lp_atoms = n.principal_in_lp_atoms.checked_add(amount).ok_or((15, at))?;
    n.bond_drawn_outstanding_atoms = 0;
    *t = n;
    Ok((minted, x, k))
}

/// tag 110 (Live when `live`, else Resolved with `e.v_worse` = physical idle backing). Lock verdict is an input.
fn withdraw(t: &mut BondTrancheV20, e: &Env, shares: u128, live: bool, lock_ok: bool) -> Result<(u128, u128, u128), (u32, Option<u128>)> {
    if shares == 0 { return Err((109, None)); }
    let halt = e.draw_out.saturating_add(if live { e.backstop } else { 0 });
    if halt > 0 { return Err((89, None)); }
    let mut n = *t;
    let (x, value, impairment) = if live {
        let v_worse = r::vault_value_net_of_backstop(e.v_worse, e.backstop);
        let whole = !b::bond_impaired(v_worse, e.c_eff, n.c_b_atoms);
        let open_now = n.c_b_atoms > 0 && whole;
        let x = settle_to(&mut n, e.drawn, e.now, open_now, false).ok_or((15, None))?;
        let k = n.c_b_atoms;
        (x, b::tranche_split3(v_worse, e.c_eff, k).bond, b::bond_impairment(v_worse, e.c_eff, k))
    } else {
        let x = settle_to(&mut n, e.drawn, e.now, false, false).ok_or((15, None))?;
        let k = n.c_b_atoms;
        (x, b::resolved_bond_value(e.v_worse, e.c_eff, k), b::bond_impairment(e.v_worse, e.c_eff, k))
    };
    let payout = b::bond_atoms_for_redemption(shares, n.b_shares_total, value).ok_or((110, Some(x)))?;
    if live && !lock_ok { return Err((108, Some(x))); }
    let total = n.b_shares_total;
    n.c_b_atoms = b::bond_claim_after_redemption(n.c_b_atoms, shares, total).ok_or((25, Some(x)))?;
    n.coupon_unfunded_atoms = b::coupon_meter_after_redemption(n.coupon_unfunded_atoms, shares, total).ok_or((25, Some(x)))?;
    n.b_shares_total = total.checked_sub(shares).ok_or((25, Some(x)))?;
    if live { n.principal_in_lp_atoms = n.principal_in_lp_atoms.saturating_sub(payout); }
    n.bond_drawn_outstanding_atoms = if n.c_b_atoms == 0 { 0 } else { impairment };
    *t = n;
    Ok((payout, x, n.c_b_atoms))
}

/// tag 78's `bond_coupon_take` (util term 0: the bonus is forced 0). `bond_value` = the layer before the leg.
fn crank(t: &mut BondTrancheV20, e: &Env, live: bool, bond_value_in: u128, available: u128) -> Option<(u128, u128, u128, bool, bool)> {
    let k = t.c_b_atoms;
    let now = e.now;
    let draw = e.draw_out;
    let pre_open = live && k > 0 && draw == 0;
    let bond_value = if pre_open { bond_value_in } else { 0 };
    let open_now = b::coupon_gate_open(live, k, draw, bond_value);
    let open = open_now && b::coupon_interval_clean(t.coupon_gate_seen, e.drawn);
    let u_now: u16 = 0;
    let u_eff = if u_now < t.last_util_bps { u_now } else { t.last_util_bps };
    let rate = b::bond_coupon_rate_bps(t.coupon_bps_per_year, t.coupon_util_bonus_bps, u_eff);
    let (accrued, rem) = b::coupon_settle(k, t.coupon_unfunded_atoms, t.coupon_accrual_rem, rate, now.saturating_sub(t.last_coupon_slot), open, bond_value)?;
    t.c_b_atoms = k.checked_add(accrued)?;
    let r = t.coupon_arrears_atoms.checked_add(accrued)?;
    let u = t.coupon_unfunded_atoms.checked_add(accrued)?;
    t.coupon_accrual_rem = rem;
    let (coupon, rest, r_after) = if b::coupon_pay_open(open_now, live, k, draw) { b::coupon_pay_from_leg(available, r) } else { (0, available, r) };
    t.coupon_arrears_atoms = r_after;
    t.coupon_unfunded_atoms = u.saturating_sub(coupon);
    t.coupon_paid_total_atoms = t.coupon_paid_total_atoms.saturating_add(u64::try_from(coupon).unwrap_or(u64::MAX));
    if now > t.last_coupon_slot { t.last_coupon_slot = now; }
    t.coupon_gate_seen = b::coupon_gate_seen(e.drawn, open_now);
    t.last_util_bps = u_now;
    Some((coupon, rest, accrued, open_now, open))
}

fn shell(slot: u64, rate: u16, cap: u16) -> BondTrancheV20 {
    BondTrancheV20 { market_group: [9; 32], last_coupon_slot: slot, coupon_bps_per_year: rate, coupon_util_bonus_bps: 0, bond_cooldown_slots: 9_000, bond_cap_bps_of_c: cap, version: c::BOND_TRANCHE_VERSION, bump: 254, ..Default::default() }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut out = Vec::new();
    out.push(format!("\"prog\":\"{}\",\"engine\":\"{}\"", args.get(1).cloned().unwrap_or_default(), args.get(2).cloned().unwrap_or_default()));
    out.push(format!(
        "\"layout\":{{\"body\":{},\"accountLen\":{},\"version\":{},\"kind\":{},\"couponDenom\":\"{}\",\"off\":{{\"cBAtoms\":{},\"bSharesTotal\":{},\"principalInLpAtoms\":{},\"bondDrawnOutstandingAtoms\":{},\"lastCouponSlot\":{},\"couponBpsPerYear\":{},\"couponUtilBonusBps\":{},\"bondCooldownSlots\":{},\"bondCapBpsOfC\":{},\"version\":{},\"bump\":{},\"lastUtilBps\":{},\"padding\":{},\"couponPaidTotalAtoms\":{},\"couponArrearsAtoms\":{},\"couponUnfundedAtoms\":{},\"couponAccrualRem\":{},\"couponGateSeen\":{}}}}}",
        size_of::<BondTrancheV20>(), state::bond_tranche_account_len(), c::BOND_TRANCHE_VERSION, c::KIND_BOND_TRANCHE, b::COUPON_DENOM,
        offset_of!(BondTrancheV20, c_b_atoms), offset_of!(BondTrancheV20, b_shares_total), offset_of!(BondTrancheV20, principal_in_lp_atoms),
        offset_of!(BondTrancheV20, bond_drawn_outstanding_atoms), offset_of!(BondTrancheV20, last_coupon_slot), offset_of!(BondTrancheV20, coupon_bps_per_year),
        offset_of!(BondTrancheV20, coupon_util_bonus_bps), offset_of!(BondTrancheV20, bond_cooldown_slots), offset_of!(BondTrancheV20, bond_cap_bps_of_c),
        offset_of!(BondTrancheV20, version), offset_of!(BondTrancheV20, bump), offset_of!(BondTrancheV20, last_util_bps), offset_of!(BondTrancheV20, _padding),
        offset_of!(BondTrancheV20, coupon_paid_total_atoms), offset_of!(BondTrancheV20, coupon_arrears_atoms), offset_of!(BondTrancheV20, coupon_unfunded_atoms),
        offset_of!(BondTrancheV20, coupon_accrual_rem), offset_of!(BondTrancheV20, coupon_gate_seen),
    ));

    // ── records: the program's writer + reader verdicts ─────────────────────────────────────────────────────
    let full = BondTrancheV20 {
        market_group: [9; 32], c_b_atoms: 1_000_000_000_000_000_000_123, b_shares_total: 999_999_999_999_999_999_999, principal_in_lp_atoms: 5,
        bond_drawn_outstanding_atoms: 6, last_coupon_slot: 777, coupon_bps_per_year: 801, coupon_util_bonus_bps: 0, bond_cooldown_slots: 9_001,
        bond_cap_bps_of_c: 4_999, version: c::BOND_TRANCHE_VERSION, bump: 250, last_util_bps: 1234, _padding: [0; 2], coupon_paid_total_atoms: 4242,
        coupon_arrears_atoms: 0x0123_4567_89ab_cdef_1122_3344, coupon_unfunded_atoms: 0x0eed_dccb_baa9_9887, coupon_accrual_rem: (b::COUPON_DENOM - 1) as u64,
        coupon_gate_seen: (1u64 << 63) | 0x0102_0304_0506_0708,
    };
    let mut recs = Vec::new();
    let mut push = |name: &str, t: &BondTrancheV20| { let (h, ok) = rec(t); recs.push(format!("\"{name}\":{{\"hex\":\"{h}\",\"programReads\":{ok}}}")); };
    push("full", &full);
    push("genesis", &shell(42, 800, 5_000));
    push("v1Version", &BondTrancheV20 { version: 1, ..full });
    push("unfundedOverK", &BondTrancheV20 { coupon_unfunded_atoms: full.c_b_atoms + 1, ..full });
    push("unfundedEqK", &BondTrancheV20 { coupon_unfunded_atoms: full.c_b_atoms, ..full });
    push("remAtDenom", &BondTrancheV20 { coupon_accrual_rem: b::COUPON_DENOM as u64, ..full });
    push("receivableOnEmpty", &BondTrancheV20 { c_b_atoms: 0, b_shares_total: 0, coupon_unfunded_atoms: 0, coupon_arrears_atoms: 77, ..full });
    push("badPadding", &BondTrancheV20 { _padding: [0, 1], ..full });
    push("kWithoutB", &BondTrancheV20 { b_shares_total: 0, ..full });
    let (h, _) = rec(&full);
    let short128 = &h[..(16 + 128) * 2];
    let short144 = &h[..(16 + 144) * 2];
    recs.push(format!("\"truncated128\":{{\"hex\":\"{short128}\",\"programReads\":{}}}", state::read_bond_tranche(&unhex(short128)).is_ok()));
    recs.push(format!("\"truncated144\":{{\"hex\":\"{short144}\",\"programReads\":{}}}", state::read_bond_tranche(&unhex(short144)).is_ok()));
    out.push(format!("\"records\":{{{}}}", recs.join(",")));

    // ── pure rules ─────────────────────────────────────────────────────────────────────────────────────────
    let mut rows: Vec<String> = Vec::new();
    let d = b::COUPON_DENOM;
    let ks: [u128; 9] = [0, 1, 999, 100_000_000, 25_000_000_000, 1u128 << 64, 1u128 << 89, 1u128 << 100, u128::MAX];
    for &k in &ks {
        for &u in &[0u128, 3, 2_000_000, 1u128 << 60] {
            if u > k { continue; }
            for &rem in &[0u64, (d - 1) as u64] {
                for &rate in &[0u32, 800, 3_000] {
                    for &dt in &[0u64, 1, 432_000, b::SLOTS_PER_YEAR as u64, u64::MAX] {
                        for &(open, val) in &[(true, k), (false, k), (true, k / 2), (true, u128::MAX)] {
                            let r = b::coupon_settle(k, u, rem, rate, dt, open, val);
                            let s = match r { Some((x, r2)) => format!("\"{x}\",\"{r2}\""), None => "null".into() };
                            rows.push(format!("{{\"fn\":\"settle\",\"in\":[\"{k}\",\"{u}\",\"{rem}\",\"{rate}\",\"{dt}\",\"{open}\",\"{val}\"],\"out\":[{s}]}}"));
                        }
                    }
                }
            }
        }
    }
    for &k in &[0u128, 1, 1_000_000, 1u128 << 80] { for &rate in &[0u32, 800, 2_000] {
        rows.push(format!("{{\"fn\":\"cap\",\"in\":[\"{k}\",\"{rate}\"],\"out\":[{}]}}", o(b::coupon_arrears_cap(k, rate))));
    }}
    for &(k, u) in &[(0u128, 0u128), (10, 3), (3, 10), (u128::MAX, 1)] {
        rows.push(format!("{{\"fn\":\"funded\",\"in\":[\"{k}\",\"{u}\"],\"out\":[\"{}\"]}}", b::bond_funded_claim(k, u)));
    }
    for &drawn in &[0u128, 5, (1u128 << 63) - 1, 1u128 << 63, (1u128 << 64) + 7, u128::MAX] {
        for open in [true, false] {
            rows.push(format!("{{\"fn\":\"gateSeen\",\"in\":[\"{drawn}\",\"{open}\"],\"out\":[\"{}\"]}}", b::coupon_gate_seen(drawn, open)));
        }
        for &seen in &[0u64, 5, 1u64 << 63, (1u64 << 63) | 5, 7, u64::MAX >> 1] {
            rows.push(format!("{{\"fn\":\"intervalClean\",\"in\":[\"{seen}\",\"{drawn}\"],\"out\":[\"{}\"]}}", b::coupon_interval_clean(seen, drawn)));
        }
    }
    for &(av, r) in &[(0u128, 0u128), (1_000, 300), (1_000, 900), (1_001, u128::MAX), (u128::MAX, 5), (7, 0)] {
        let (cp, rest, r2) = b::coupon_pay_from_leg(av, r);
        rows.push(format!("{{\"fn\":\"payFromLeg\",\"in\":[\"{av}\",\"{r}\"],\"out\":[\"{cp}\",\"{rest}\",\"{r2}\"]}}"));
    }
    for &(u, k, a) in &[(0u128, 0u128, 5u128), (10, 1_000, 1), (10, 1_000, 999), (7, 3, 2), (1u128 << 100, (1u128 << 100) + 1, 1u128 << 40), (5, 9, 0)] {
        rows.push(format!("{{\"fn\":\"meterDeposit\",\"in\":[\"{u}\",\"{k}\",\"{a}\"],\"out\":[{}]}}", o(b::coupon_meter_after_deposit(u, k, a))));
    }
    for &(u, sh, tot) in &[(10u128, 1u128, 3u128), (10, 3, 3), (10, 4, 3), (10, 0, 0), (0, 5, 9), (u128::MAX, 2, 3)] {
        rows.push(format!("{{\"fn\":\"meterRedeem\",\"in\":[\"{u}\",\"{sh}\",\"{tot}\"],\"out\":[{}]}}", o(b::coupon_meter_after_redemption(u, sh, tot))));
    }
    for ao in [false, true] { for live in [false, true] { for &k in &[0u128, 1] { for &dr in &[0u128, 1] {
        rows.push(format!("{{\"fn\":\"payOpen\",\"in\":[\"{ao}\",\"{live}\",\"{k}\",\"{dr}\"],\"out\":[\"{}\"]}}", b::coupon_pay_open(ao, live, k, dr)));
    }}}}
    // claim_upper_bound_at, the real method on the real struct
    for &(k, u, rem, last, rate) in &[(0u128, 0u128, 0u64, 0u64, 800u16), (25_000_000_000, 0, 0, 100, 800), (25_000_000_000, 1_999_999_999, (d - 1) as u64, 100, 2_000), (1u128 << 89, 0, 5, 0, 2_000)] {
        let t = BondTrancheV20 { c_b_atoms: k, b_shares_total: k, coupon_unfunded_atoms: u, coupon_accrual_rem: rem, last_coupon_slot: last, ..shell(last, rate, 5_000) };
        for &now in &[0u64, last, last + 1, last + 9_000, last + 100_000_000, u64::MAX] {
            let r = t.claim_upper_bound_at(now).ok();
            rows.push(format!("{{\"fn\":\"upperBound\",\"in\":[\"{k}\",\"{u}\",\"{rem}\",\"{last}\",\"{rate}\",\"{now}\"],\"out\":[{}]}}", o(r)));
        }
    }
    out.push(format!("\"rules\":[{}]", rows.join(",")));

    // ── scenarios: handler sequences, tranche bytes after every step (program writer) ────────────────────────
    const USDC: u128 = 1_000_000;
    let mut scen = Vec::new();
    // each step: op, env, params, expected outputs, tranche hex after
    let mut run = |name: &str, mut t: BondTrancheV20, steps: Vec<(&str, Env, u128, u128)>| {
        let (h0, _) = rec(&t);
        let mut js = Vec::new();
        for (op, e, p1, p2) in steps {
            let env = format!("\"now\":\"{}\",\"drawn\":\"{}\",\"v\":\"{}\",\"vWorse\":\"{}\",\"cEff\":\"{}\",\"drawOut\":\"{}\",\"backstop\":\"{}\"", e.now, e.drawn, e.v, e.v_worse, e.c_eff, e.draw_out, e.backstop);
            let res = match op {
                "deposit" => match deposit(&mut t, &e, p1) {
                    Ok((m, x, k)) => format!("\"ok\":true,\"shares\":\"{m}\",\"settled\":\"{x}\",\"claimAtPrice\":\"{k}\""),
                    Err((code, at)) => format!("\"ok\":false,\"code\":{code},\"settled\":{},\"claimAtPrice\":{}", o(at.map(|a| a.0)), o(at.map(|a| a.1))),
                },
                "withdrawLive" | "withdrawLiveLocked" | "withdrawResolved" => {
                    let live = op != "withdrawResolved";
                    match withdraw(&mut t, &e, p1, live, op != "withdrawLiveLocked") {
                        Ok((pay, x, k)) => format!("\"ok\":true,\"atoms\":\"{pay}\",\"settled\":\"{x}\",\"claimAfter\":\"{k}\""),
                        Err((code, x)) => format!("\"ok\":false,\"code\":{code},\"settled\":{}", o(x)),
                    }
                }
                "crank" | "crankResolved" => match crank(&mut t, &e, op == "crank", p2, p1) {
                    Some((cp, rest, acc, on, op_)) => format!("\"ok\":true,\"coupon\":\"{cp}\",\"rest\":\"{rest}\",\"accrued\":\"{acc}\",\"openNow\":{on},\"open\":{op_}"),
                    None => "\"ok\":false,\"code\":15".into(),
                },
                _ => unreachable!(),
            };
            let (h, ok) = rec(&t);
            js.push(format!("{{\"op\":\"{op}\",{env},\"p1\":\"{p1}\",\"p2\":\"{p2}\",{res},\"after\":\"{h}\",\"afterReads\":{ok}}}"));
        }
        scen.push(format!("{{\"name\":\"{name}\",\"start\":\"{h0}\",\"steps\":[{}]}}", js.join(",")));
    };
    let e = |now: u64, drawn: u128, v: u128, vw: u128, c: u128| Env { now, drawn, v, v_worse: vw, c_eff: c, draw_out: 0, backstop: 0 };
    let big = 1_000_000 * USDC; let ceff = 500_000 * USDC;
    // 1. explainV E+B: incumbents 25k, newcomer 25k at H-1500, crank a fat leg at H, partial + full exits.
    run("newcomer_neutral_8pct", shell(0, 800, 5_000), vec![
        ("deposit", e(0, 0, big, big, ceff), 25_000 * USDC, 0),
        ("deposit", e(430_500, 0, big, big - 1, ceff), 25_000 * USDC, 0),
        ("deposit", e(430_501, 0, big, big, ceff), 1, 0),
        ("crank", e(432_000, 0, big, big, ceff), 1_000_000 * USDC, 60_000 * USDC),
        ("withdrawLive", e(441_000, 0, big, big, ceff), 10_000 * USDC, 0),
        ("withdrawLiveLocked", e(441_001, 0, big, big, ceff), 1_000 * USDC, 0),
        ("withdrawLive", e(900_000, 0, big, big, ceff), 1, 0),
    ]);
    // 2. grind: crank every slot on a small tranche with zero legs (remainder carried), then a dust leg.
    let mut st = vec![("deposit", e(10, 0, big, big, ceff), 100 * USDC, 0u128)];
    for s in 11..40u64 { st.push(("crank", e(s, 0, big, big, ceff), 0, 100 * USDC + 1_000)); }
    st.push(("crank", e(9_000, 0, big, big, ceff), 3, 100 * USDC + 1_000));
    run("crank_every_slot_carries_remainder", shell(10, 2_000, 5_000), st);
    // 3. gate memory: a senior draw booked between settlements forfeits the interval; impaired exit; draw halts.
    let mut drew = e(200_000, 0, big, big, ceff); drew.drawn = 5 * USDC; drew.draw_out = 0;
    let mut halted = e(210_000, 5 * USDC, big, big, ceff); halted.draw_out = 1;
    run("gate_memory_and_impairment", shell(0, 2_000, 5_000), vec![
        ("deposit", e(0, 0, big, big, ceff), 50_000 * USDC, 0),
        ("crank", e(100_000, 0, big, big, ceff), 0, 50_000 * USDC),
        ("deposit", drew, 1_000 * USDC, 0),
        ("withdrawLive", halted, 1 * USDC, 0),
        ("crank", e(300_000, 5 * USDC, big, big, ceff), 1_000, 10),
        ("withdrawLive", e(400_000, 5 * USDC, big, ceff + 20_000 * USDC, ceff), 5_000 * USDC, 0),
        ("crank", e(500_000, 5 * USDC, big, big, ceff), 2_000 * USDC, 60_000 * USDC),
        ("deposit", e(510_000, 5 * USDC, big, ceff + 10 * USDC, ceff), 1_000 * USDC, 0),
        ("deposit", e(520_000, 5 * USDC, big, ceff - 1, ceff), 1_000 * USDC, 0),
        ("deposit", e(530_000, 5 * USDC, big, ceff + 100_000 * USDC, ceff), 900_000 * USDC, 0),
    ]);
    // 4. cap meter: a year-plus quiet stretch hits the per-share cap; partial pay frees headroom; full exit; the
    //    receivable outlives the last bond and is paid from an empty tranche; resolved exit.
    run("cap_meter_full_exit_receivable_outlives", shell(0, 2_000, 5_000), vec![
        ("deposit", e(0, 0, big, big, ceff), 10_000 * USDC, 0),
        ("crank", e(100_000_000, 0, big, big, ceff), 0, 20_000 * USDC),
        ("crank", e(100_000_001, 0, big, big, ceff), 1_000 * USDC, 13_000 * USDC),
        ("deposit", e(100_100_000, 0, big, big, ceff), 5_000 * USDC, 0),
        ("withdrawLive", e(100_200_000, 0, big, big, ceff), 3_000 * USDC, 0),
        ("withdrawResolved", e(100_300_000, 0, big, big, ceff), 1_000 * USDC, 0),
        ("crankResolved", e(100_300_001, 0, big, big, ceff), 1_000 * USDC, 0),
    ]);
    // 5. full exit then the receivable is paid from an empty tranche; then a fresh genesis restarts U.
    run("empty_tranche_pays_receivable", shell(0, 1_000, 5_000), vec![
        ("deposit", e(0, 0, big, big, ceff), 7_777 * USDC, 0),
        ("withdrawLive", e(5_000_000, 0, big, big, ceff), 7_777 * USDC, 0),
        ("crank", e(5_000_001, 0, big, big, ceff), 40, 0),
        ("crank", e(5_000_002, 0, big, big, ceff), 100 * USDC, 0),
        ("deposit", e(6_000_000, 0, big, big, ceff), 1_000 * USDC, 0),
        ("withdrawLive", e(6_000_100, 0, big, big, ceff), 0, 0),
    ]);
    out.push(format!("\"scenarios\":[{}]", scen.join(",")));
    println!("{{{}}}", out.join(",\n"));
}

fn unhex(s: &str) -> Vec<u8> { (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect() }
