//! v2.2 band / rent SDK parity oracle (second bin; same setup as sdk_v22_parity.rs):
//!   CARGO_BUILD_JOBS=3 cargo run --quiet --bin sdk_v22_band_parity > v22-band-parity.json
//! prog#572 (#647, rc23 34996503): + the occupancy offsets (engine `stored_pos_count_*` / `slot_last`, asset-0 profile
//! `state::OCC_PROFILE_BYTES`, `AssetVaultLpV18::vault_lp_portfolio`, portfolio `last_fee_slot`), the pure `growth_v19::occ_*`
//! rows, and `occ` scenarios: `occ_clock_accrue_view` + `occ_charge_view` (private, need AccountInfo) transcribed onto the
//! real pub fns, with the program's own profile writer (`state::write_profile_bytes_preserving_occupancy`) run on the bytes.
use core::mem::offset_of;
use percolator::{AssetStateV16Account, PortfolioAccountV16Account, V16ConfigAccount};
use percolator_prog::growth_v19 as g;
use percolator_prog::state::{self, AssetGrowthV19, AssetOracleProfileV16, AssetVaultLpV18};

fn kv(xs: &[(&str, usize)]) -> String { xs.iter().map(|(n, v)| format!("\"{n}\":{v}")).collect::<Vec<_>>().join(",") }
fn o<T: ToString>(x: Option<T>) -> String { match x { Some(v) => format!("\"{}\"", v.to_string()), None => "null".into() } }

fn main() {
    let cfg = [
        ("maxAccrualDtSlots", offset_of!(V16ConfigAccount, max_accrual_dt_slots)), ("maxPriceMoveBpsPerSlot", offset_of!(V16ConfigAccount, max_price_move_bps_per_slot)),
        ("bandBps", offset_of!(V16ConfigAccount, band_bps)), ("bandMaxEpochSlots", offset_of!(V16ConfigAccount, band_max_epoch_slots)),
        ("bandMaxPinSlots", offset_of!(V16ConfigAccount, band_max_pin_slots)), ("rentMaxE9PerSlot", offset_of!(V16ConfigAccount, rent_max_e9_per_slot)),
        ("bandMaxPositionsPerSide", offset_of!(V16ConfigAccount, band_max_positions_per_side)), ("bandMinLegNotional", offset_of!(V16ConfigAccount, band_min_leg_notional)),
    ];
    let st = [
        ("bandAnchorPrice", offset_of!(AssetStateV16Account, band_anchor_price)), ("bandAnchorSlot", offset_of!(AssetStateV16Account, band_anchor_slot)),
        ("bandEpoch", offset_of!(AssetStateV16Account, band_epoch)), ("bandUncertifiedLong", offset_of!(AssetStateV16Account, band_uncertified_long)),
        ("bandUncertifiedShort", offset_of!(AssetStateV16Account, band_uncertified_short)), ("bandLiqPendingLong", offset_of!(AssetStateV16Account, band_liq_pending_long)),
        ("bandLiqPendingShort", offset_of!(AssetStateV16Account, band_liq_pending_short)), ("bandPinSinceSlot", offset_of!(AssetStateV16Account, band_pin_since_slot)),
        ("rentIndexLongNum", offset_of!(AssetStateV16Account, rent_index_long_num)), ("rentIndexShortNum", offset_of!(AssetStateV16Account, rent_index_short_num)),
        ("rentUnroutedAtoms", offset_of!(AssetStateV16Account, rent_unrouted_atoms)),
    ];
    let gr = [("rentKinkBps", offset_of!(AssetGrowthV19, rent_kink_bps)), ("rentNCapQ", offset_of!(AssetGrowthV19, rent_n_cap_q))];
    let vl = [("lpNetQ", offset_of!(AssetVaultLpV18, lp_net_q)), ("flags", offset_of!(AssetVaultLpV18, flags))];
    let mut rows = Vec::new();
    for &u in &[0u128, 1, 400, 800, 801, 999, 1000, 5_000, 1u128 << 70] {
        for &n in &[0u128, 1000, 1_000_000] {
            for &k in &[0u16, 5_000, 8_000, 10_000, 10_001] {
                for &m in &[0u64, 10, 4_321, 10_000] {
                    rows.push(format!("{{\"fn\":\"rentRate\",\"in\":[\"{u}\",\"{n}\",\"{k}\",\"{m}\"],\"out\":[{},\"{}\"]}}", o(g::rent_rate_e9(u, n, k, m)), g::rent_rate_e9_fail_closed(u, n, k, m)));
                }
            }
        }
    }
    for &oi in &[0u128, 50, 100, 1000] {
        for &lp in &[0i128, 30, -30, 500, -500] {
            for &long in &[true, false] {
                rows.push(format!("{{\"fn\":\"usersSide\",\"in\":[\"{oi}\",\"{lp}\",\"{long}\"],\"out\":[\"{}\"]}}", g::users_side_oi_q(oi, lp, long)));
            }
        }
    }
    for &a in &[1u64, 100, 1_000, 76, 77, 123_100, 1_000_000] {
        for &d in &[1u64, 130, 2000] {
            rows.push(format!("{{\"fn\":\"widthOk\",\"in\":[\"{a}\",\"{d}\"],\"out\":[\"{}\"]}}", percolator::band_rent::band_width_ok(a, d).unwrap()));
        }
    }
    // ── prog#572 occupancy ────────────────────────────────────────────────────────────────────
    let occ_off = [
        ("storedPosCountLong", offset_of!(AssetStateV16Account, stored_pos_count_long)), ("storedPosCountShort", offset_of!(AssetStateV16Account, stored_pos_count_short)),
        ("slotLast", offset_of!(AssetStateV16Account, slot_last)),
        ("profileClockSlot", state::OCC_PROFILE_BYTES.start), ("profileClockLong", state::OCC_PROFILE_BYTES.start + 8), ("profileClockShort", state::OCC_PROFILE_BYTES.start + 16),
        ("profileClockEnd", state::OCC_PROFILE_BYTES.end),
        ("profileCheckpointSlotField", offset_of!(AssetOracleProfileV16, maintenance_fee_checkpoint_slot)), ("profilePreviousRateField", offset_of!(AssetOracleProfileV16, maintenance_fee_previous_rate)),
        ("vaultLpPortfolio", offset_of!(AssetVaultLpV18, vault_lp_portfolio)),
        ("portfolioLastFeeSlot", offset_of!(PortfolioAccountV16Account, last_fee_slot)),
    ];
    let consts = format!("\"RENT_OCC_KNEE_BPS\":\"{}\",\"RENT_OCC_CAP_DOMAIN\":\"{}\",\"OCC_RAMP_ONE\":\"{}\",\"OCC_REF_MIN_LEG_MULTIPLE\":\"{}\",\"OCC_BSL_RENT_MULTIPLE\":\"{}\",\"OCC_CK_TAG\":\"{}\"",
        g::RENT_OCC_KNEE_BPS, g::RENT_OCC_CAP_DOMAIN, g::OCC_RAMP_ONE, g::OCC_REF_MIN_LEG_MULTIPLE, g::OCC_BSL_RENT_MULTIPLE, g::OCC_CK_TAG);
    let mut occ = Vec::new();
    let caps = [0u64, 1, 7, 20, 100, 255, 256, 257, 1000, 1 << 16, (1 << 16) + 1, u32::MAX as u64, u64::MAX];
    let maxes = [0u64, 1, 3, 100, 4_321, 1 << 32, u64::MAX];
    for &cap in &caps {
        let mut counts: Vec<u64> = vec![0, 1, 2, 3, 5, 6, 7, 8, 17, 18, 19, 20, 21, 85, 86, 87, 99, 100, 101, 217, 218, 219, 220, 230, 254, 255, 256, 257, 300, 1000, 55_705, 55_706, 65_535, 65_536, 65_537, u64::MAX];
        if cap > 2 { counts.extend([cap / 2, cap - 2, cap - 1, cap, cap.saturating_add(1)]); }
        counts.sort(); counts.dedup();
        for &c in &counts {
            for &m in &maxes {
                occ.push(format!("{{\"fn\":\"occRamp\",\"in\":[\"{c}\",\"{cap}\",\"{m}\"],\"out\":[\"{}\"]}}", g::occ_ramp(c, cap, m)));
            }
        }
    }
    for c in 0..=260u64 {
        occ.push(format!("{{\"fn\":\"occRampQ32\",\"in\":[\"{c}\",\"256\"],\"out\":[\"{}\"]}}", g::occ_ramp_q32(c, 256)));
    }
    for &r in &[0u64, 1, 100, 749, 10_000, u64::MAX] {
        for &m in &[0u64, 1, 10_000_000, 100_000_000, u64::MAX] {
            occ.push(format!("{{\"fn\":\"occFullNum\",\"in\":[\"{r}\",\"{m}\"],\"out\":[\"{}\"]}}", g::occ_full_num(r, m)));
        }
    }
    for &c in &[0u64, 1, 1 << 32, (7u64 << 32) + 12345, u64::MAX - 5, u64::MAX] {
        for &r in &[0u64, 1, 1 << 31, (1 << 32) - 1, 1 << 32, (1 << 32) + 1, u64::MAX] {
            for &dt in &[0u64, 1, 2, 1_000, 216_000, u64::MAX] {
                occ.push(format!("{{\"fn\":\"occClockAdvance\",\"in\":[\"{c}\",\"{r}\",\"{dt}\"],\"out\":[\"{}\"]}}", g::occ_clock_advance(c, r, dt)));
            }
        }
    }
    let ints = [0u64, 1, 2, 77, (1 << 31) + 3, (1 << 32) - 1, 1 << 32, (1 << 32) + 9, u64::MAX];
    for &ci in &ints {
        for &sh in &[false, true] {
            occ.push(format!("{{\"fn\":\"occCkEncode\",\"in\":[\"{ci}\",\"{sh}\"],\"out\":[\"{}\"]}}", g::occ_ck_encode(ci, sh)));
        }
    }
    let mut cks: Vec<u64> = vec![0, 1, 2, 3, 300_000_000, (1 << 63) - 1, u64::MAX, g::OCC_CK_TAG, g::OCC_CK_TAG | 1];
    for &ci in &[0u64, 1, 5, 77, 78, (1 << 32) - 1] { cks.push(g::occ_ck_encode(ci, false)); cks.push(g::occ_ck_encode(ci, true)); }
    for &ck in &cks {
        for &sh in &[false, true] {
            for &now in &[0u64, 1, 5, 77, 78, (1 << 32) - 1, u64::MAX] {
                occ.push(format!("{{\"fn\":\"occCkDecode\",\"in\":[\"{ck}\",\"{sh}\",\"{now}\"],\"out\":[{}]}}", o(g::occ_ck_decode(ck, sh, now))));
            }
        }
    }
    let fulls = [0u128, 1, 999_999_999, 1_000_000_000, 4_000_000_000, 400_000_000_000, g::occ_full_num(10_000, u64::MAX)];
    for &ck in &cks {
        for &sh in &[false, true] {
            for &cq in &[0u64, 1 << 32, (5u64 << 32) + 7, 77u64 << 32, (78u64 << 32) + (1 << 31), u64::MAX] {
                for &f in &fulls {
                    let (nck, due) = g::occ_charge_step(ck, sh, cq, f);
                    occ.push(format!("{{\"fn\":\"occChargeStep\",\"in\":[\"{ck}\",\"{sh}\",\"{cq}\",\"{f}\"],\"out\":[\"{nck}\",\"{due}\"]}}"));
                }
            }
        }
    }
    let scen = occ_scenarios();
    println!("{{\"config\":{{{}}},\"assetState\":{{{}}},\"growth\":{{{}}},\"vaultLp\":{{{}}},\"configLen\":{},\"assetStateLen\":{},\"rows\":[{}],\"occupancy\":{{{}}},\"occConsts\":{{{}}},\"occRows\":[{}],\"occScenarios\":[{}]}}",
        kv(&cfg), kv(&st), kv(&gr), kv(&vl), core::mem::size_of::<V16ConfigAccount>(), core::mem::size_of::<AssetStateV16Account>(), rows.join(","),
        kv(&occ_off), consts, occ.join(","), scen.join(","));
}

fn hex(x: &[u8]) -> String { x.iter().map(|v| format!("{v:02x}")).collect() }

/// prog#572 scenarios. `occ_clock_accrue_view` / `occ_charge_view` (v16_program.rs @ 34996503) are private and take
/// the market view, so their bodies are transcribed here onto the REAL pub fns (`g::occ_*`), and the clock bytes live in
/// a real `AssetOracleProfileV16` buffer written through the program's own `state::write_profile_bytes_preserving_occupancy`
/// (a stale profile copy is written back after every touch, as the trade handler does: the clocks must survive it).
/// Each step: `{slot, nLong, nShort, legs: [[ck, short|null], ...]}` -> profile bytes (+408..+432) and per leg
/// `(ck', due)` as `occ_charge_view` leaves them (the engine's capital clamp is not modelled: due is the request).
fn occ_scenarios() -> Vec<String> {
    use percolator_prog::constants::ASSET_ORACLE_PROFILE_LEN;
    struct Sc { name: &'static str, cap: u64, rent: u64, min_leg: u64, lp_bound: bool, steps: Vec<(u64, u64, u64)>, sides: Vec<Option<bool>> }
    let scs = vec![
        Sc { name: "knee_then_full", cap: 256, rent: 100, min_leg: 10_000_000, lp_bound: true,
             steps: vec![(1000, 200, 0), (1100, 218, 3), (1500, 230, 256), (2000, 256, 256), (2001, 256, 100), (9000, 256, 100), (9001, 0, 0)],
             sides: vec![Some(false), Some(true), None] },
        Sc { name: "small_cap_rounding", cap: 7, rent: 749, min_leg: 3, lp_bound: true,
             steps: vec![(5, 6, 7), (6, 7, 7), (50, 7, 6), (1_000_000, 7, 7), (1_000_001, 7, 7)],
             sides: vec![Some(false), Some(true)] },
        Sc { name: "no_lp_frozen", cap: 256, rent: 100, min_leg: 10_000_000, lp_bound: false,
             steps: vec![(10, 256, 256), (5000, 256, 256)], sides: vec![Some(false)] },
        Sc { name: "rent_off", cap: 256, rent: 0, min_leg: 10_000_000, lp_bound: true,
             steps: vec![(10, 256, 256), (5000, 256, 256)], sides: vec![Some(true)] },
        Sc { name: "slot_not_forward", cap: 256, rent: 100, min_leg: 10_000_000, lp_bound: true,
             steps: vec![(100, 256, 256), (100, 256, 256), (90, 256, 256), (400, 240, 250)], sides: vec![Some(false), Some(true)] },
    ];
    let mut out = Vec::new();
    for sc in scs {
        let full_num = g::occ_full_num(sc.rent, sc.min_leg);
        let mut buf = vec![0u8; ASSET_ORACLE_PROFILE_LEN];
        let r = state::OCC_PROFILE_BYTES;
        let rd = |b: &[u8], o: usize| u64::from_le_bytes(b[o..o + 8].try_into().unwrap());
        let mut cks: Vec<u64> = vec![0; sc.sides.len()];
        let mut steps = Vec::new();
        for (slot, nl, ns) in sc.steps.iter().copied() {
            // A stale profile copy read BEFORE the hook (the trade handler's pattern).
            let stale: AssetOracleProfileV16 = bytemuck::pod_read_unaligned(&buf[..ASSET_ORACLE_PROFILE_LEN]);
            // occ_clock_accrue_view
            let last = rd(&buf, r.start);
            let mut cl = rd(&buf, r.start + 8);
            let mut cs = rd(&buf, r.start + 16);
            if slot > last {
                if last != 0 && full_num != 0 && sc.lp_bound {
                    let dt = slot - last;
                    cl = g::occ_clock_advance(cl, g::occ_ramp_q32(nl, sc.cap), dt);
                    cs = g::occ_clock_advance(cs, g::occ_ramp_q32(ns, sc.cap), dt);
                }
                buf[r.start..r.start + 8].copy_from_slice(&slot.to_le_bytes());
                buf[r.start + 8..r.start + 16].copy_from_slice(&cl.to_le_bytes());
                buf[r.start + 16..r.start + 24].copy_from_slice(&cs.to_le_bytes());
            }
            // occ_charge_view per leg (slot_last != 0 assumed; this leg is not the vault LP)
            let mut legs = Vec::new();
            for (i, side) in sc.sides.iter().enumerate() {
                let ck = cks[i];
                let (nck, due) = match side {
                    None => (if ck & g::OCC_CK_TAG != 0 { 0 } else { ck }, 0u128),
                    Some(short) => {
                        let c_now = if *short { cs } else { cl };
                        if full_num == 0 || !sc.lp_bound { (g::occ_ck_encode(c_now >> 32, *short), 0) } else { g::occ_charge_step(ck, *short, c_now, full_num) }
                    }
                };
                cks[i] = nck;
                legs.push(format!("[\"{ck}\",{},\"{nck}\",\"{due}\"]", match side { None => "null".to_string(), Some(s) => s.to_string() }));
            }
            // the stale copy written back through the program's band-market asset-0 writer
            state::write_profile_bytes_preserving_occupancy(&mut buf, &stale, true).unwrap();
            steps.push(format!("{{\"slot\":\"{slot}\",\"nLong\":\"{nl}\",\"nShort\":\"{ns}\",\"profileOcc\":\"{}\",\"legs\":[{}]}}", hex(&buf[r.clone()]), legs.join(",")));
        }
        out.push(format!("{{\"name\":\"{}\",\"cap\":\"{}\",\"rentMax\":\"{}\",\"minLeg\":\"{}\",\"lpBound\":{},\"fullNum\":\"{}\",\"sides\":[{}],\"steps\":[{}]}}",
            sc.name, sc.cap, sc.rent, sc.min_leg, sc.lp_bound, full_num,
            sc.sides.iter().map(|s| match s { None => "null".to_string(), Some(x) => x.to_string() }).collect::<Vec<_>>().join(","), steps.join(",")));
    }
    out
}
