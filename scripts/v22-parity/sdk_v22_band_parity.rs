//! v2.2 band / rent SDK parity oracle (second bin; same setup as sdk_v22_parity.rs):
//!   CARGO_BUILD_JOBS=3 cargo run --quiet --bin sdk_v22_band_parity > v22-band-parity.json
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
    println!("{{\"config\":{{{}}},\"assetState\":{{{}}},\"growth\":{{{}}},\"vaultLp\":{{{}}},\"configLen\":{},\"assetStateLen\":{},\"rows\":[{}]}}",
        kv(&cfg), kv(&st), kv(&gr), kv(&vl), core::mem::size_of::<V16ConfigAccount>(), core::mem::size_of::<AssetStateV16Account>(), rows.join(","));
}
