//! P2b SDK parity oracle. Copy into a checkout of percolator-prog (#526 head, with the engine
//! sibling at `feat/p2b-lock-exits`) as `src/bin/sdk_p2b_parity.rs` (do NOT commit it there) and run:
//!   cargo run --quiet --bin sdk_p2b_parity -- vectors.txt > p2b-parity.json
//! Uses the REAL crate: `ix::Instruction::decode`, `state::{VaultLpExtV19, AssetRiskLimitsV17,
//! AssetVaultLpV18, AssetGrowthV19, init_vault_lp_ext, derive_vault_lp_ext}`, rustc `offset_of!`,
//! `error::PercolatorError::X as u32` and the pure rules in `vault_lp_v18`.
use core::mem::{offset_of, size_of};
use percolator_prog::constants as c;
use percolator_prog::error::PercolatorError as E;
use percolator_prog::ix::Instruction as I;
use percolator_prog::state::{self, AssetGrowthV19, AssetRiskLimitsV17, AssetVaultLpV18, VaultLpExtV19};
use percolator_prog::vault_lp_v18 as v;
use solana_program::pubkey::Pubkey;

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
fn unhex(s: &str) -> Vec<u8> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}
fn opt<T: ToString>(x: Option<T>) -> String {
    match x {
        Some(v) => format!("\"{}\"", v.to_string()),
        None => "null".into(),
    }
}

fn decoded(ix: &I) -> Option<String> {
    Some(match ix {
        I::VaultLpAllocate { amount } => format!("{{\"variant\":\"VaultLpAllocate\",\"tag\":103,\"amount\":\"{amount}\"}}"),
        I::SetVaultLpRisk { asset_index, skew_slope_e9, skew_max_e9, lev_cap_q, lev_max_imr_bps, vault_lp_max_lev_bps, approved_matcher_program } => format!(
            "{{\"variant\":\"SetVaultLpRisk\",\"tag\":99,\"assetIndex\":\"{asset_index}\",\"skewSlopeE9\":\"{skew_slope_e9}\",\"skewMaxE9\":\"{skew_max_e9}\",\"levCapQ\":\"{lev_cap_q}\",\"levMaxImrBps\":\"{lev_max_imr_bps}\",\"vaultLpMaxLevBps\":\"{vault_lp_max_lev_bps}\",\"approvedMatcherProgramHex\":\"{}\"}}", hex(approved_matcher_program)),
        I::SetVaultLpRiskV19 { asset_index, skew_slope_e9, skew_max_e9, lev_cap_q, lev_max_imr_bps, vault_lp_max_lev_bps, approved_matcher_program, alloc_alpha_bps, alloc_buffer_bps, cushion_target_bps, cushion_share_bps } => format!(
            "{{\"variant\":\"SetVaultLpRiskV19\",\"tag\":99,\"assetIndex\":\"{asset_index}\",\"skewSlopeE9\":\"{skew_slope_e9}\",\"skewMaxE9\":\"{skew_max_e9}\",\"levCapQ\":\"{lev_cap_q}\",\"levMaxImrBps\":\"{lev_max_imr_bps}\",\"vaultLpMaxLevBps\":\"{vault_lp_max_lev_bps}\",\"approvedMatcherProgramHex\":\"{}\",\"allocAlphaBps\":\"{alloc_alpha_bps}\",\"allocBufferBps\":\"{alloc_buffer_bps}\",\"cushionTargetBps\":\"{cushion_target_bps}\",\"cushionShareBps\":\"{cushion_share_bps}\"}}", hex(approved_matcher_program)),
        I::AdlWindDown { now_slot, asset_index, portfolio_id, position_epoch } => format!(
            "{{\"variant\":\"AdlWindDown\",\"tag\":104,\"nowSlot\":\"{now_slot}\",\"assetIndex\":\"{asset_index}\",\"portfolioId\":\"{portfolio_id}\",\"positionEpoch\":\"{position_epoch}\"}}"),
        I::SetAdlWindDownMaxSlots { asset_index, max_episode_slots } => format!(
            "{{\"variant\":\"SetAdlWindDownMaxSlots\",\"tag\":105,\"assetIndex\":\"{asset_index}\",\"maxEpisodeSlots\":\"{max_episode_slots}\"}}"),
        I::InitVaultLpV19 { junior_floor_bps, l_launch_x100 } => format!(
            "{{\"variant\":\"InitVaultLpV19\",\"tag\":94,\"juniorFloorBps\":\"{junior_floor_bps}\",\"lLaunchX100\":\"{l_launch_x100}\"}}"),
        I::SetAssetRiskLimitsV19 { limits, growth_lambda_bps, growth_kink_bps, growth_util_fee_max_bps } => {
            let inner = match &**limits {
                I::SetAssetRiskLimits { asset_index, exec_band_bps, lp_exposure_k_bps, lp_floor_atoms, side_oi_cap_q, matcher_ext_mode, max_requested_fee_bps } => format!(
                    "{{\"assetIndex\":\"{asset_index}\",\"execBandBps\":\"{exec_band_bps}\",\"lpExposureKBps\":\"{lp_exposure_k_bps}\",\"lpFloorAtoms\":\"{lp_floor_atoms}\",\"sideOiCapQ\":\"{side_oi_cap_q}\",\"matcherExtMode\":\"{matcher_ext_mode}\",\"maxRequestedFeeBps\":\"{max_requested_fee_bps}\"}}"),
                _ => "null".into(),
            };
            format!("{{\"variant\":\"SetAssetRiskLimitsV19\",\"tag\":93,\"limits\":{inner},\"lambdaBps\":\"{growth_lambda_bps}\",\"kinkBps\":\"{growth_kink_bps}\",\"utilFeeMaxBps\":\"{growth_util_fee_max_bps}\"}}")
        }
        I::InitMarketV19 { market, growth_r_gap_bps, growth_l_launch_x100 } => {
            let inner = match &**market {
                I::InitMarket { maintenance_margin_bps, liquidation_fee_bps, max_price_move_bps_per_slot, max_abs_funding_e9_per_slot, max_portfolio_assets, .. } => format!(
                    "{{\"maintenanceMarginBps\":\"{maintenance_margin_bps}\",\"liquidationFeeBps\":\"{liquidation_fee_bps}\",\"maxPriceMoveBpsPerSlot\":\"{max_price_move_bps_per_slot}\",\"maxAbsFundingE9PerSlot\":\"{max_abs_funding_e9_per_slot}\",\"maxPortfolioAssets\":\"{max_portfolio_assets}\"}}"),
                _ => "null".into(),
            };
            format!("{{\"variant\":\"InitMarketV19\",\"tag\":0,\"market\":{inner},\"rGapBps\":\"{growth_r_gap_bps}\",\"lLaunchX100\":\"{growth_l_launch_x100}\"}}")
        }
        I::InitMarket { maintenance_margin_bps, liquidation_fee_bps, max_price_move_bps_per_slot, max_abs_funding_e9_per_slot, max_portfolio_assets, .. } => format!(
            "{{\"variant\":\"InitMarket\",\"tag\":0,\"maintenanceMarginBps\":\"{maintenance_margin_bps}\",\"liquidationFeeBps\":\"{liquidation_fee_bps}\",\"maxPriceMoveBpsPerSlot\":\"{max_price_move_bps_per_slot}\",\"maxAbsFundingE9PerSlot\":\"{max_abs_funding_e9_per_slot}\",\"maxPortfolioAssets\":\"{max_portfolio_assets}\"}}"),
        _ => return None,
    })
}

fn main() {
    let path = std::env::args().nth(1).expect("vectors.txt");
    let mut out: Vec<String> = Vec::new();

    // ── instruction round-trips (TS encoder hex -> real decoder) ─────────────
    let mut vecs = Vec::new();
    for line in std::fs::read_to_string(path).unwrap().lines().filter(|l| !l.trim().is_empty()) {
        let mut it = line.split_whitespace();
        let (id, h) = (it.next().unwrap(), it.next().unwrap());
        let bytes = unhex(h);
        let r = match I::decode(&bytes) {
            Ok(ix) => decoded(&ix).map(|d| format!("{{\"ok\":true,\"decoded\":{d}}}")).unwrap_or("{\"ok\":true,\"decoded\":null}".into()),
            Err(e) => format!("{{\"ok\":false,\"err\":\"{e:?}\"}}"),
        };
        // the real encoder must reproduce the SDK bytes for every accepted vector
        let re = I::decode(&bytes).ok().map(|ix| hex(&ix.encode())).unwrap_or_default();
        vecs.push(format!("\"{id}\":{{\"hex\":\"{h}\",\"rust\":{r},\"rustReencodedHex\":\"{re}\"}}"));
    }
    out.push(format!("\"vectors\":{{{}}}", vecs.join(",")));

    // ── errors by NAME ───────────────────────────────────────────────────────
    let errs: [(&str, u32); 8] = [
        ("VaultLpAllocateRefused", E::VaultLpAllocateRefused as u32), ("VaultLpCapacityLocked", E::VaultLpCapacityLocked as u32),
        ("VaultLpCreatorFeeVesting", E::VaultLpCreatorFeeVesting as u32), ("VaultLpSeniorCapitalHalt", E::VaultLpSeniorCapitalHalt as u32),
        ("EngineAdlReduceOnly", E::EngineAdlReduceOnly as u32), ("EngineLossStale", E::EngineLossStale as u32),
        ("EarnExitWouldUnderBackClaims", E::EarnExitWouldUnderBackClaims as u32), ("GrowthUtilisationFeeRequiresTradeCpi", E::GrowthUtilisationFeeRequiresTradeCpi as u32),
    ];
    out.push(format!("\"errors\":{{{}}}", errs.iter().map(|(n, x)| format!("\"{n}\":{x}")).collect::<Vec<_>>().join(",")));

    // ── layout (rustc offset_of; account offset = +HEADER_LEN where it is an account) ──
    let h = c::HEADER_LEN;
    let ext = [
        ("marketGroup", offset_of!(VaultLpExtV19, market_group)), ("allocatedAtoms", offset_of!(VaultLpExtV19, allocated_atoms)),
        ("cushionAccruedAtoms", offset_of!(VaultLpExtV19, cushion_accrued_atoms)), ("allocatedTotalAtoms", offset_of!(VaultLpExtV19, allocated_total_atoms)),
        ("deallocatedTotalAtoms", offset_of!(VaultLpExtV19, deallocated_total_atoms)), ("allocAlphaBps", offset_of!(VaultLpExtV19, alloc_alpha_bps)),
        ("allocBufferBps", offset_of!(VaultLpExtV19, alloc_buffer_bps)), ("cushionTargetBps", offset_of!(VaultLpExtV19, cushion_target_bps)),
        ("cushionShareBps", offset_of!(VaultLpExtV19, cushion_share_bps)), ("version", offset_of!(VaultLpExtV19, version)),
        ("bump", offset_of!(VaultLpExtV19, bump)), ("padding", offset_of!(VaultLpExtV19, _padding)), ("reserved", offset_of!(VaultLpExtV19, _reserved)),
    ];
    let rl = [
        ("sideOiCapQ", offset_of!(AssetRiskLimitsV17, side_oi_cap_q)), ("lpFloorAtoms", offset_of!(AssetRiskLimitsV17, lp_floor_atoms)),
        ("lpExposureKBps", offset_of!(AssetRiskLimitsV17, lp_exposure_k_bps)), ("execBandBps", offset_of!(AssetRiskLimitsV17, exec_band_bps)),
        ("matcherExtMode", offset_of!(AssetRiskLimitsV17, matcher_ext_mode)), ("reserved0", offset_of!(AssetRiskLimitsV17, _reserved0)),
        ("maxRequestedFeeBps", offset_of!(AssetRiskLimitsV17, max_requested_fee_bps)), ("p2bSeniorFloorCode", offset_of!(AssetRiskLimitsV17, p2b_senior_floor_code)),
        ("adlMaxEpisodeSlots", offset_of!(AssetRiskLimitsV17, adl_max_episode_slots)), ("adlEpisodeSinceSlot", offset_of!(AssetRiskLimitsV17, adl_episode_since_slot)),
        ("adlEpisodeEpochLong", offset_of!(AssetRiskLimitsV17, adl_episode_epoch_long)), ("adlEpisodeEpochShort", offset_of!(AssetRiskLimitsV17, adl_episode_epoch_short)),
    ];
    let gr = [
        ("cLaunchAtoms", offset_of!(AssetGrowthV19, c_launch_atoms)), ("ceilSlot", offset_of!(AssetGrowthV19, ceil_slot)),
        ("lambdaBps", offset_of!(AssetGrowthV19, lambda_bps)), ("lLaunchX100", offset_of!(AssetGrowthV19, l_launch_x100)),
        ("lTierX100", offset_of!(AssetGrowthV19, l_tier_x100)), ("ceilX100", offset_of!(AssetGrowthV19, ceil_x100)),
        ("kinkBps", offset_of!(AssetGrowthV19, kink_bps)), ("rGapBps", offset_of!(AssetGrowthV19, r_gap_bps)),
        ("allocAlphaBps", offset_of!(AssetGrowthV19, alloc_alpha_bps)), ("allocBufferBps", offset_of!(AssetGrowthV19, alloc_buffer_bps)),
        ("cushionTargetBps", offset_of!(AssetGrowthV19, cushion_target_bps)), ("cushionShareBps", offset_of!(AssetGrowthV19, cushion_share_bps)),
        ("version", offset_of!(AssetGrowthV19, version)), ("flags", offset_of!(AssetGrowthV19, flags)), ("utilFeeMaxBps", offset_of!(AssetGrowthV19, util_fee_max_bps)),
    ];
    let j = |xs: &[(&str, usize)]| xs.iter().map(|(n, o)| format!("\"{n}\":{o}")).collect::<Vec<_>>().join(",");
    out.push(format!(
        "\"layout\":{{\"headerLen\":{h},\"vaultLpExtBodyLen\":{},\"vaultLpExtAccountLen\":{},\"kindVaultLpExt\":{},\"vaultLpExtVersion\":{},\"vaultLpExtSeed\":\"{}\",\"registryExtFlagAccountOff\":{},\"registryBoundFlagAccountOff\":{},\"assetRiskLimitsOff\":{},\"assetRiskLimitsLen\":{},\"p2bSeniorFloorSlotOff\":{},\"p2bSeniorFloorLen\":{},\"adlEpisodeSlotOff\":{},\"assetVaultLpSlotOff\":{},\"assetVaultLpLen\":{},\"p2bFlagsRecordOff\":{},\"p2bCreatorFeeVestingBit\":{},\"assetGrowthSlotOff\":{},\"assetGrowthLen\":{},\"vaultLpExtFieldOff\":{{{}}},\"assetRiskLimitsFieldOff\":{{{}}},\"assetGrowthFieldOff\":{{{}}}}}",
        size_of::<VaultLpExtV19>(), state::vault_lp_ext_account_len(), c::KIND_VAULT_LP_EXT, c::VAULT_LP_EXT_VERSION,
        String::from_utf8(c::VAULT_LP_EXT_SEED.to_vec()).unwrap(),
        h + offset_of!(state::LpVaultRegistryV16, _reserved) + c::VAULT_LP_REGISTRY_EXT_FLAG_IDX,
        h + offset_of!(state::LpVaultRegistryV16, _reserved) + c::VAULT_LP_REGISTRY_BOUND_FLAG_IDX,
        c::ASSET_RISK_LIMITS_OFF, c::ASSET_RISK_LIMITS_LEN, c::P2B_SENIOR_FLOOR_OFF, c::P2B_SENIOR_FLOOR_LEN, c::ASSET_RISK_LIMITS_OFF + 44,
        c::ASSET_VAULT_LP_OFF, c::ASSET_VAULT_LP_LEN, offset_of!(AssetVaultLpV18, p2b_flags), state::ASSET_VAULT_LP_P2B_CREATOR_FEE_VESTING,
        c::ASSET_GROWTH_OFF, c::ASSET_GROWTH_LEN, j(&ext), j(&rl), j(&gr)));

    // ── dials / constants ────────────────────────────────────────────────────
    out.push(format!(
        "\"constants\":{{\"allocAlphaDefaultBps\":{},\"allocAlphaMaxBps\":{},\"allocBufferDefaultBps\":{},\"allocBufferMinBps\":{},\"allocMinJuniorBps\":{},\"adlWindDownDefaultMaxEpisodeSlots\":{},\"adlWindDownMaxMarkAgeSlots\":{},\"boundScale\":\"{}\"}}",
        v::ALLOC_ALPHA_DEFAULT_BPS, v::ALLOC_ALPHA_MAX_BPS, v::ALLOC_BUFFER_DEFAULT_BPS, v::ALLOC_BUFFER_MIN_BPS, v::ALLOC_MIN_JUNIOR_BPS,
        state::ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS, state::ADL_WIND_DOWN_MAX_MARK_AGE_SLOTS, percolator::BOUND_SCALE));

    // ── PDA: derive_vault_lp_ext on fixed keys ───────────────────────────────
    let program = Pubkey::new_from_array([7u8; 32]);
    let mut pdas = Vec::new();
    for m in [1u8, 2, 200] {
        let market = Pubkey::new_from_array([m; 32]);
        let (pda, bump) = state::derive_vault_lp_ext(&program, &market);
        pdas.push(format!("{{\"program\":\"{}\",\"market\":\"{}\",\"pda\":\"{}\",\"bump\":{bump}}}", program, market, pda));
    }
    out.push(format!("\"pdas\":[{}]", pdas.join(",")));

    // ── VaultLpExtV19 accounts written by the program's own init ─────────────
    let mut accts = Vec::new();
    for (name, x) in [
        ("default", state::default_vault_lp_ext([9u8; 32], 253)),
        ("custom", VaultLpExtV19 {
            market_group: [0xAB; 32], allocated_atoms: 123_456_789_012_345_678_901u128, cushion_accrued_atoms: 4_000_000_000_000_000_000u128,
            allocated_total_atoms: 987_654_321_098_765_432_109u128, deallocated_total_atoms: 11u128, alloc_alpha_bps: 4_321, alloc_buffer_bps: 3_500,
            cushion_target_bps: 1_000, cushion_share_bps: 5_000, version: c::VAULT_LP_EXT_VERSION, bump: 250, _padding: [0; 6], _reserved: [0; 16],
        }),
    ] {
        let mut acct = vec![0u8; state::vault_lp_ext_account_len()];
        state::init_vault_lp_ext(&mut acct, &x).unwrap();
        let back = state::read_vault_lp_ext(&acct).map(|b| b == x).unwrap_or(false);
        accts.push(format!("\"{name}\":{{\"hex\":\"{}\",\"programReadsSame\":{back}}}", hex(&acct)));
    }
    // an ext the program REJECTS (alpha above the hard max): the SDK decoder must reject it too
    let mut bad = vec![0u8; state::vault_lp_ext_account_len()];
    state::init_vault_lp_ext(&mut bad, &state::default_vault_lp_ext([9u8; 32], 1)).unwrap();
    let alpha_off = h + offset_of!(VaultLpExtV19, alloc_alpha_bps);
    bad[alpha_off..alpha_off + 2].copy_from_slice(&5_001u16.to_le_bytes());
    accts.push(format!("\"badAlpha\":{{\"hex\":\"{}\",\"programReadsSame\":{}}}", hex(&bad), state::read_vault_lp_ext(&bad).is_ok()));
    out.push(format!("\"vaultLpExt\":{{{}}}", accts.join(",")));

    // ── AssetRiskLimitsV17 / AssetVaultLpV18 / AssetGrowthV19 records as the program lays them out ──
    let mut rl_rec = AssetRiskLimitsV17::default();
    rl_rec.side_oi_cap_q = 7_000_000_000;
    rl_rec.lp_floor_atoms = 250_000_000;
    rl_rec.lp_exposure_k_bps = 50_000;
    rl_rec.exec_band_bps = 300;
    rl_rec.matcher_ext_mode = 1;
    rl_rec.max_requested_fee_bps = 100;
    rl_rec.p2b_senior_floor_code = 0x1234u16.to_le_bytes();
    rl_rec.adl_max_episode_slots = 300;
    rl_rec.adl_episode_since_slot = 507_300_123;
    rl_rec.adl_episode_epoch_long = 0xDEADBEEF;
    rl_rec.adl_episode_epoch_short = 0x0BADF00D;
    let mut vlp = AssetVaultLpV18::default();
    vlp.vault_lp_portfolio = [0xA1; 32];
    vlp.flags = state::ASSET_VAULT_LP_FLAG_BOUND;
    vlp.p2b_flags = state::ASSET_VAULT_LP_P2B_CREATOR_FEE_VESTING;
    vlp.lp_net_q = -5;
    vlp.vault_lp_max_lev_bps = 20_000;
    vlp.approved_matcher_program = [0x5a; 32];
    out.push(format!(
        "\"records\":{{\"riskLimitsHex\":\"{}\",\"riskLimitsValidates\":{},\"vaultLpHex\":\"{}\"}}",
        hex(bytemuck::bytes_of(&rl_rec)), state::validate_asset_risk_limits(&rl_rec).is_ok(), hex(bytemuck::bytes_of(&vlp))));

    // ── Q2 senior floor code: the program's own encode / decode ──────────────
    let big: u128 = 1023u128 << 63;
    let vals: Vec<u128> = vec![0, 1, 1023, 1024, 1025, 2047, 2048, 999_999, 5_000_000_000, u64::MAX as u128, big, big + 1, 1u128 << 120, u128::MAX];
    out.push(format!("\"seniorFloorEncode\":[{}]", vals.iter().map(|x| format!("{{\"v\":\"{x}\",\"code\":{},\"decoded\":\"{}\"}}", v::senior_floor_encode(*x), v::senior_floor_decode(v::senior_floor_encode(*x)))).collect::<Vec<_>>().join(",")));
    out.push(format!("\"seniorFloorDecode\":[{}]", [0u16, 1, 1023, 1024, 0x0401, 0x1234, 0xFC00, 0xFFFF].iter().map(|x| format!("{{\"code\":{x},\"floor\":\"{}\"}}", v::senior_floor_decode(*x))).collect::<Vec<_>>().join(",")));

    // ── pure rules (inputs in the fixture; the SDK port must agree on every row) ──
    let mut rows = Vec::new();
    let allocs: [(u128, u128, u128, u16, u16); 9] = [
        (1_000, 0, 1_000, 5_000, 3_000), (1_000, 500, 500, 5_000, 3_000), (1_000, 0, 600, 5_000, 3_000), (1_000, 0, 300, 5_000, 3_000),
        (10_000, 4_999, 99_999, 5_000, 3_001), (1_000, 0, 1_000, 5_001, 3_000), (1_000, 0, 1_000, 5_000, 2_999), (1_000, 0, 1_000, 5_000, 10_001), (7, 0, 100, 3_333, 3_000),
    ];
    for (c_eff, alloc, drawable, a, b) in allocs {
        rows.push(format!("{{\"cEff\":\"{c_eff}\",\"allocated\":\"{alloc}\",\"drawable\":\"{drawable}\",\"alpha\":{a},\"buffer\":{b},\"limit\":{}}}", opt(v::vault_lp_alloc_limit(c_eff, alloc, drawable, a, b))));
    }
    out.push(format!("\"allocLimit\":[{}]", rows.join(",")));
    rows.clear();
    for (out_, pend, val, ceff, eq) in [(0u128, false, 1_000u128, 1_000u128, 0i128), (1, false, 1_000, 1_000, 0), (0, true, 1_000, 1_000, 0), (0, false, 999, 1_000, 0), (0, false, 1_000, 1_000, -1), (0, false, 1_001, 1_000, 5)] {
        rows.push(format!("{{\"outstanding\":\"{out_}\",\"pending\":{pend},\"v\":\"{val}\",\"cEff\":\"{ceff}\",\"lpEquity\":\"{eq}\",\"admitted\":{}}}", v::vault_lp_alloc_admitted(out_, pend, val, ceff, eq)));
    }
    out.push(format!("\"allocAdmitted\":[{}]", rows.join(",")));
    rows.clear();
    for (val, ceff) in [(10_500u128, 10_000u128), (10_499, 10_000), (0, 0), (1_000, 0), (500, 10_000), (10_000, 10_000), (10_001, 10_001)] {
        rows.push(format!("{{\"v\":\"{val}\",\"cEff\":\"{ceff}\",\"ok\":{}}}", v::alloc_junior_ok(val, ceff)));
    }
    out.push(format!("\"allocJuniorOk\":[{}]", rows.join(",")));
    rows.clear();
    for (a, l) in [(5_000u128, 6_500u128), (5_000, 0), (0, 5), (5_000, 5_000), (u128::MAX, 1)] {
        rows.push(format!("{{\"allocated\":\"{a}\",\"lpValue\":\"{l}\",\"writtenDown\":\"{}\"}}", v::alloc_written_down(a, l)));
    }
    out.push(format!("\"allocWrittenDown\":[{}]", rows.join(",")));
    rows.clear();
    for (a, r) in [(500u128, 700u128), (500, 200), (0, 1), (u128::MAX, u128::MAX), (10, 0)] {
        rows.push(format!("{{\"allocated\":\"{a}\",\"recalled\":\"{r}\",\"after\":\"{}\"}}", v::vault_lp_dealloc(a, r)));
    }
    out.push(format!("\"dealloc\":[{}]", rows.join(",")));
    rows.clear();
    for (m, e, o) in [(100u128, 300u128, 100u128), (0, 5, 5), (400, 300, 100), (401, 300, 100), (7, 3, 3), (1, 0, 5), (5, 0, 5), (6, 0, 5), (999, 1_000_000, 1)] {
        let r = v::vault_lp_alloc_split(m, e, o);
        rows.push(format!("{{\"moved\":\"{m}\",\"dEven\":\"{e}\",\"dOdd\":\"{o}\",\"split\":{}}}", match r { Some((a, b)) => format!("[\"{a}\",\"{b}\"]"), None => "null".into() }));
    }
    out.push(format!("\"allocSplit\":[{}]", rows.join(",")));
    rows.clear();
    for (b, a, l) in [(10u128, 5u128, 5u128), (10, 5, 6), (10, 10, 99), (10, 11, 0), (0, 0, 0)] {
        rows.push(format!("{{\"before\":\"{b}\",\"after\":\"{a}\",\"lpEffAbs\":\"{l}\",\"ok\":{}}}", v::a4_capacity_lock_ok(b, a, l)));
    }
    out.push(format!("\"a4\":[{}]", rows.join(",")));
    rows.clear();
    for (o, a) in [(900u128, 5_000u128), (7_000, 5_000), (5_000, 5_000), (0, 0)] {
        rows.push(format!("{{\"out\":\"{o}\",\"available\":\"{a}\",\"principal\":\"{}\"}}", v::live_bound_principal_portion(o, a)));
    }
    out.push(format!("\"liveBoundPrincipal\":[{}]", rows.join(",")));
    rows.clear();
    // (fresh, valid, claims, ins_cover, scale)
    for (f, vl, cl, ic, s) in [(1_000u128, 0u128, 0u128, 0u128, 1u128), (1_180, 0, 180, 0, 1), (1_000, 0, 180, 180, 1), (1_999, 0, 1, 0, 1_000), (3_000_000_000_000, 500_000_000_000, 1_500_000_000_001, 0, 1_000_000_000_000), (5, 5, 99, 0, 0), (100, 100, 50, 80, 1), (1_000, 0, 5_000, 0, 1)] {
        rows.push(format!("{{\"fresh\":\"{f}\",\"valid\":\"{vl}\",\"claims\":\"{cl}\",\"insCover\":\"{ic}\",\"scale\":\"{s}\",\"net\":\"{}\"}}", v::pot_physical_net_atoms(f, vl, cl, ic, s)));
    }
    out.push(format!("\"potPhysicalNet\":[{}]", rows.join(",")));
    rows.clear();
    for (p, n) in [(1_000u128, 1_000u128), (1_000, 820), (1_000, 1_100), (0, 5), (5, 0)] {
        rows.push(format!("{{\"principal\":\"{p}\",\"physicalNet\":\"{n}\",\"exit\":\"{}\",\"entry\":\"{}\"}}", v::nonbound_pot_available(p, n), v::nonbound_pot_entry_available(p)));
    }
    out.push(format!("\"nonboundPot\":[{}]", rows.join(",")));
    rows.clear();
    for (av, sh, tg, ce, jl) in [(1_000u128, 5_000u16, 1_000u16, 10_000u128, 900u128), (1_000, 5_000, 1_000, 10_000, 1_000), (1_000, 0, 1_000, 10_000, 0), (1_000, 5_000, 0, 10_000, 0), (7, 10_000, 10_000, 3, 0), (1_000, 9_999, 3, 777, 1)] {
        let r = v::cushion_split(av, sh, tg, ce, jl);
        rows.push(format!("{{\"available\":\"{av}\",\"share\":{sh},\"target\":{tg},\"cEff\":\"{ce}\",\"juniorLevel\":\"{jl}\",\"split\":{}}}", match r { Some((a, b)) => format!("[\"{a}\",\"{b}\"]"), None => "null".into() }));
    }
    out.push(format!("\"cushionSplit\":[{}]", rows.join(",")));
    rows.clear();
    for (acc, ce, tg) in [(5_000u128, 10_000u128, 1_000u16), (500, 10_000, 1_000), (0, 10_000, 1_000), (5_000, 10_000, 0), (5_000, 3, 3)] {
        rows.push(format!("{{\"accrued\":\"{acc}\",\"cEff\":\"{ce}\",\"target\":{tg},\"locked\":{}}}", opt(v::cushion_locked(acc, ce, tg))));
    }
    out.push(format!("\"cushionLocked\":[{}]", rows.join(",")));
    rows.clear();
    for (jl, ce, sh, tg) in [(999u128, 10_000u128, 5_000u16, 1_000u16), (1_000, 10_000, 5_000, 1_000), (0, 10_000, 0, 1_000), (0, 10_000, 5_000, 0), (1, 3, 1, 1)] {
        rows.push(format!("{{\"juniorLevel\":\"{jl}\",\"cEff\":\"{ce}\",\"share\":{sh},\"target\":{tg},\"vested\":{}}}", v::creator_fee_vested(jl, ce, sh, tg)));
    }
    out.push(format!("\"creatorFeeVested\":[{}]", rows.join(",")));
    rows.clear();
    for (eq, fl) in [(99u128, 100u128), (100, 100), (0, 0), (0, 1), (5, 4)] {
        rows.push(format!("{{\"equity\":\"{eq}\",\"floor\":\"{fl}\",\"halt\":{}}}", v::senior_capital_halt(eq, fl)));
    }
    out.push(format!("\"seniorCapitalHalt\":[{}]", rows.join(",")));

    // ── P2b lock exits (#525): episode key and dust bound, by the program's own functions ──
    let mut rows = Vec::new();
    for (mid, el, es) in [(0u64, 0u64, 0u64), (1, 0, 0), (0xDEAD_BEEF_0000_0001, 5, 7), (u64::MAX, u64::MAX, u64::MAX), (0x1_0000_0000, 3, 4), (42, 0x1_0000_0001, 0xFFFF_FFFF_0000_0002)] {
        let (kl, ks) = percolator_prog::processor::adl_episode_key(mid, el, es);
        rows.push(format!("{{\"marketId\":\"{mid}\",\"epochLong\":\"{el}\",\"epochShort\":\"{es}\",\"keyLong\":{kl},\"keyShort\":{ks}}}"));
    }
    out.push(format!("\"adlEpisodeKey\":[{}]", rows.join(",")));
    out.push(format!("\"adlDust\":[{}]", [0u8, 1, 6, 9, 18, 30, 31, 200].iter().map(|d| format!("{{\"decimals\":{d},\"dust\":\"{}\"}}", state::adl_wind_down_dust_notional_atoms(*d))).collect::<Vec<_>>().join(",")));

    // ── backing-domain ledger + the per-pot engine records the non-bound pricing reads ──
    {
        use percolator::{BackingBucketV16Account as BK, EngineAssetSlotV16Account as ES, SourceCreditStateV16Account as SC};
        type Mk = percolator::Market<state::AssetOracleStorageV16>;
        let led = state::BackingDomainLedgerAccountV16::default();
        let _ = &led;
        let lf = [
            ("marketGroup", offset_of!(state::BackingDomainLedgerAccountV16, market_group)), ("authority", offset_of!(state::BackingDomainLedgerAccountV16, authority)),
            ("totalPrincipalAtoms", offset_of!(state::BackingDomainLedgerAccountV16, total_principal_atoms)), ("totalDepositedAtoms", offset_of!(state::BackingDomainLedgerAccountV16, total_deposited_atoms)),
            ("totalPrincipalWithdrawnAtoms", offset_of!(state::BackingDomainLedgerAccountV16, total_principal_withdrawn_atoms)), ("totalEarningsAtoms", offset_of!(state::BackingDomainLedgerAccountV16, total_earnings_atoms)),
            ("totalEarningsWithdrawnAtoms", offset_of!(state::BackingDomainLedgerAccountV16, total_earnings_withdrawn_atoms)), ("lastObservedBucketEarningsAtoms", offset_of!(state::BackingDomainLedgerAccountV16, last_observed_bucket_earnings_atoms)),
            ("cumulativeLossAtoms", offset_of!(state::BackingDomainLedgerAccountV16, cumulative_loss_atoms)), ("cumulativeRecoveryAtoms", offset_of!(state::BackingDomainLedgerAccountV16, cumulative_recovery_atoms)),
            ("lastObservedUnavailablePrincipalAtoms", offset_of!(state::BackingDomainLedgerAccountV16, last_observed_unavailable_principal_atoms)), ("domain", offset_of!(state::BackingDomainLedgerAccountV16, domain)),
            ("padding", offset_of!(state::BackingDomainLedgerAccountV16, _padding)), ("marketId", offset_of!(state::BackingDomainLedgerAccountV16, market_id)),
        ];
        let sf = [
            ("positiveClaimBoundNum", offset_of!(SC, positive_claim_bound_num)), ("exactPositiveClaimNum", offset_of!(SC, exact_positive_claim_num)),
            ("freshReservedBackingNum", offset_of!(SC, fresh_reserved_backing_num)), ("spentBackingNum", offset_of!(SC, spent_backing_num)),
            ("providerReceivableNum", offset_of!(SC, provider_receivable_num)), ("validLienedBackingNum", offset_of!(SC, valid_liened_backing_num)),
            ("impairedLienedBackingNum", offset_of!(SC, impaired_liened_backing_num)), ("insuranceCreditReservedNum", offset_of!(SC, insurance_credit_reserved_num)),
            ("validLienedInsuranceNum", offset_of!(SC, valid_liened_insurance_num)), ("impairedLienedInsuranceNum", offset_of!(SC, impaired_liened_insurance_num)),
            ("creditRateNum", offset_of!(SC, credit_rate_num)), ("creditEpoch", offset_of!(SC, credit_epoch)),
        ];
        let bf = [
            ("marketId", offset_of!(BK, market_id)), ("freshUnlienedBackingNum", offset_of!(BK, fresh_unliened_backing_num)), ("validLienedBackingNum", offset_of!(BK, valid_liened_backing_num)),
            ("consumedLienedBackingNum", offset_of!(BK, consumed_liened_backing_num)), ("impairedLienedBackingNum", offset_of!(BK, impaired_liened_backing_num)),
            ("utilizationFeeEarnings", offset_of!(BK, utilization_fee_earnings)), ("expirySlot", offset_of!(BK, expiry_slot)), ("status", offset_of!(BK, status)),
        ];
        // absolute offsets of asset i's records in a market account, straight from rustc
        let abs = |i: usize, rel: usize| c::MARKET_GROUP_OFF + size_of::<percolator::MarketGroupV16HeaderAccount>() + i * size_of::<Mk>() + offset_of!(Mk, engine) + rel;
        let rows: Vec<String> = (0..4usize).map(|i| format!("{{\"asset\":{i},\"sourceCreditLong\":{},\"sourceCreditShort\":{},\"backingLong\":{},\"backingShort\":{}}}",
            abs(i, offset_of!(ES, source_credit_long)), abs(i, offset_of!(ES, source_credit_short)), abs(i, offset_of!(ES, backing_long)), abs(i, offset_of!(ES, backing_short)))).collect();
        out.push(format!(
            "\"potLayout\":{{\"kindLedger\":{},\"ledgerAccountLen\":{},\"ledgerBodyLen\":{},\"marketGroupOff\":{},\"marketGroupHeaderLen\":{},\"assetSlotLen\":{},\"engineOffInSlot\":{},\"sourceCreditLen\":{},\"bucketLen\":{},\"ledgerFieldOff\":{{{}}},\"sourceCreditFieldOff\":{{{}}},\"bucketFieldOff\":{{{}}},\"assetOffsets\":[{}]}}",
            c::KIND_BACKING_DOMAIN_LEDGER, state::backing_domain_ledger_account_len(), size_of::<state::BackingDomainLedgerAccountV16>(), c::MARKET_GROUP_OFF,
            size_of::<percolator::MarketGroupV16HeaderAccount>(), size_of::<Mk>(), offset_of!(Mk, engine), size_of::<SC>(), size_of::<BK>(), j(&lf), j(&sf), j(&bf), rows.join(",")));
        // a ledger the program wrote itself
        let l = state::BackingDomainLedgerAccountV16 {
            market_group: [3; 32], authority: [4; 32], total_principal_atoms: 123_456_789_012_345_678_901u128, total_deposited_atoms: 200_000_000_000_000_000_000u128,
            total_principal_withdrawn_atoms: 5, total_earnings_atoms: 777_000_000_000_000_000_000u128, total_earnings_withdrawn_atoms: 11, last_observed_bucket_earnings_atoms: 700_000_000_000_000_000_000u128,
            cumulative_loss_atoms: 42, cumulative_recovery_atoms: 7, last_observed_unavailable_principal_atoms: 35, domain: 3, _padding: [0; 6], market_id: 9_876_543_210,
        };
        let mut acct = vec![0u8; state::backing_domain_ledger_account_len()];
        state::init_backing_domain_ledger(&mut acct, &l).unwrap();
        out.push(format!("\"ledgerAccountHex\":\"{}\"", hex(&acct)));
        // source credit / bucket records as the engine lays them out (planted by the SDK-side test at the rustc offsets)
        let mut sc = SC::from_runtime(&percolator::SourceCreditStateV16::EMPTY);
        sc.positive_claim_bound_num = percolator::V16PodU128::new(180_000_000_000_000u128);
        sc.insurance_credit_reserved_num = percolator::V16PodU128::new(30_000_000_000_000u128);
        sc.valid_liened_insurance_num = percolator::V16PodU128::new(1_000_000_000_000u128);
        sc.impaired_liened_insurance_num = percolator::V16PodU128::new(2_000_000_000_000u128);
        let mut bk = BK::from_runtime(&percolator::BackingBucketV16::default());
        bk.fresh_unliened_backing_num = percolator::V16PodU128::new(1_180_000_000_000_000u128);
        bk.valid_liened_backing_num = percolator::V16PodU128::new(5_000_000_000_000u128);
        bk.utilization_fee_earnings = percolator::V16PodU128::new(900_000_000_000_000_000_000u128);
        bk.market_id = percolator::V16PodU64::new(77);
        out.push(format!("\"potRecords\":{{\"sourceCreditHex\":\"{}\",\"bucketHex\":\"{}\"}}", hex(bytemuck::bytes_of(&sc)), hex(bytemuck::bytes_of(&bk))));
    }

    println!("{{\"p2bSha\":\"d9e3e2d72c8734ecc9d99905f3cebbb090b61154\",{}}}", out.join(","));
}
