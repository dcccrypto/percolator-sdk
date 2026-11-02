//! v2.2 band / rent SDK parity oracle (second bin; same setup as sdk_v22_parity.rs):
//!   CARGO_BUILD_JOBS=3 cargo run --quiet --bin sdk_v22_band_parity > v22-band-parity.json
//! prog#572 per NOTIONAL (#653, rc23 178fedc4): + `stored_pos_count_*` offsets, the growth record's `version`, the real
//! `growth_v19::rent_occupancy_rate_e9` / `rent_side_rate_e9` rows, and `rentRatesView` rows: `rent_rates_view` is private and
//! takes the market view, so its gates and inputs are transcribed here onto the real pub fns (`users_side_oi_q`, `rent_side_rate_e9`).
use core::mem::offset_of;
use percolator::{AssetStateV16Account, V16ConfigAccount};
use percolator_prog::growth_v19 as g;
use percolator_prog::state::{AssetGrowthV19, AssetVaultLpV18};

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
        ("storedPosCountLong", offset_of!(AssetStateV16Account, stored_pos_count_long)), ("storedPosCountShort", offset_of!(AssetStateV16Account, stored_pos_count_short)),
    ];
    let gr = [("rentKinkBps", offset_of!(AssetGrowthV19, rent_kink_bps)), ("rentNCapQ", offset_of!(AssetGrowthV19, rent_n_cap_q)), ("version", offset_of!(AssetGrowthV19, version))];
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
    // ── prog#572 per notional ─────────────────────────────────────────────────────────────────
    let consts = format!("\"RENT_OCC_KNEE_BPS\":\"{}\",\"RENT_OCC_CAP_DOMAIN\":\"{}\"", g::RENT_OCC_KNEE_BPS, g::RENT_OCC_CAP_DOMAIN);
    let mut occ = Vec::new();
    for &cap in &[0u64, 1, 7, 20, 100, 255, 256, 257, 1000, 1 << 16, (1 << 16) + 1, u32::MAX as u64, u64::MAX] {
        let mut counts: Vec<u64> = vec![0, 1, 2, 3, 5, 6, 7, 8, 17, 18, 19, 20, 21, 85, 86, 87, 99, 100, 101, 217, 218, 219, 220, 230, 254, 255, 256, 257, 300, 1000, 55_705, 55_706, 65_535, 65_536, 65_537, u64::MAX];
        if cap > 2 { counts.extend([cap / 2, cap - 2, cap - 1, cap, cap.saturating_add(1)]); }
        counts.sort(); counts.dedup();
        for &c in &counts {
            for &m in &[0u64, 1, 3, 100, 4_321, 10_000, 1 << 32, u64::MAX] {
                occ.push(format!("{{\"fn\":\"rentOcc\",\"in\":[\"{c}\",\"{cap}\",\"{m}\"],\"out\":[\"{}\"]}}", g::rent_occupancy_rate_e9(c, cap, m)));
            }
        }
    }
    for c in 0..=260u64 {
        occ.push(format!("{{\"fn\":\"rentOcc\",\"in\":[\"{c}\",\"256\",\"10000\"],\"out\":[\"{}\"]}}", g::rent_occupancy_rate_e9(c, 256, 10_000)));
    }
    for &u in &[0u128, 1, 400, 800, 801, 999, 1000, 5_000, 1u128 << 70, u128::MAX] {
        for &n in &[0u128, 1000, 1_000_000] {
            for &k in &[0u16, 5_000, 8_000, 10_000, 10_001] {
                for &m in &[0u64, 10, 4_321, 10_000] {
                    for &(c, cap) in &[(0u64, 0u64), (256, 0), (217, 256), (218, 256), (230, 256), (250, 256), (256, 256), (300, 256), (6, 7), (1, 1 << 17)] {
                        occ.push(format!("{{\"fn\":\"rentSide\",\"in\":[\"{u}\",\"{n}\",\"{k}\",\"{m}\",\"{c}\",\"{cap}\"],\"out\":[\"{}\"]}}", g::rent_side_rate_e9(u, n, k, m, c, cap)));
                    }
                }
            }
        }
    }
    // `rent_rates_view` (v16_program.rs @ 178fedc4), gates and inputs transcribed onto the real fns.
    let rates_view = |rent_max: u64, version: u8, bound: bool, n_cap_q: u64, kink: u16, oi_l: u128, oi_s: u128, lp: i128, n_l: u64, n_s: u64, band_bps: u64, cap_cfg: u64| -> (u64, u64) {
        if rent_max == 0 || version == 0 || !bound || n_cap_q == 0 { return (0, 0); }
        let n_cap = n_cap_q as u128;
        let (ul, us) = (g::users_side_oi_q(oi_l, lp, true), g::users_side_oi_q(oi_s, lp, false));
        let cap = if band_bps == 0 { 0 } else { cap_cfg };
        (g::rent_side_rate_e9(ul, n_cap, kink, rent_max, n_l, cap), g::rent_side_rate_e9(us, n_cap, kink, rent_max, n_s, cap))
    };
    let mut view = Vec::new();
    for &rm in &[0u64, 100, 10_000] { for &ver in &[0u8, 1] { for &bound in &[false, true] { for &nc in &[0u64, 1000] {
        for &(oi_l, oi_s, lp) in &[(0u128, 0u128, 0i128), (900, 100, 0), (1000, 100, 250), (100, 1000, -250), (1000, 1000, 2000), (5000, 0, 0)] {
            for &(n_l, n_s) in &[(0u64, 0u64), (217, 218), (230, 256), (256, 240), (300, 0)] {
                for &(bb, cap) in &[(0u64, 256u64), (130, 256), (130, 0)] {
                    let (l, s) = rates_view(rm, ver, bound, nc, 5_000, oi_l, oi_s, lp, n_l, n_s, bb, cap);
                    view.push(format!("{{\"in\":{{\"rentMax\":\"{rm}\",\"version\":{ver},\"bound\":{bound},\"nCap\":\"{nc}\",\"kink\":5000,\"oiLong\":\"{oi_l}\",\"oiShort\":\"{oi_s}\",\"lpNet\":\"{lp}\",\"nLong\":\"{n_l}\",\"nShort\":\"{n_s}\",\"bandBps\":{bb},\"cap\":\"{cap}\"}},\"out\":[\"{l}\",\"{s}\"]}}"));
                }
            }
        }
    }}}}
    println!("{{\"config\":{{{}}},\"assetState\":{{{}}},\"growth\":{{{}}},\"vaultLp\":{{{}}},\"configLen\":{},\"assetStateLen\":{},\"rows\":[{}],\"occConsts\":{{{}}},\"occRows\":[{}],\"rentRatesView\":[{}]}}",
        kv(&cfg), kv(&st), kv(&gr), kv(&vl), core::mem::size_of::<V16ConfigAccount>(), core::mem::size_of::<AssetStateV16Account>(), rows.join(","), consts, occ.join(","), view.join(","));
}
