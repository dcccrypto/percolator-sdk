//! v2.2 SDK parity oracle. Copy into a checkout of percolator-prog (release/v22-wrapper-rem, engine sibling
//! release/v22-engine-rem) as `src/bin/sdk_v22_parity.rs` (never commit it there) and run:
//!   CARGO_BUILD_JOBS=3 cargo run --quiet --bin sdk_v22_parity -- vectors.txt > v22-parity.json
//! Uses the REAL crate: `ix::Instruction::{decode, encode}`, `state::*`, rustc `offset_of!`, `PercolatorError as u32`,
//! and the pure rules of `bond_v20`, `p4_rescue_ins`, `wave_a_v22` and the engine `band_rent`.
use core::mem::{offset_of, size_of};
use percolator::{
    AssetStateV16Account, EngineAssetSlotV16Account, MarketGroupV16HeaderAccount, PortfolioAccountV16Account, PortfolioLegV16Account,
};
use percolator_prog::bond_v20 as b;
use percolator_prog::constants as c;
use percolator_prog::error::PercolatorError as E;
use percolator_prog::ix::Instruction as I;
use percolator_prog::p4_rescue_ins as r;
use percolator_prog::state;
use percolator_prog::wave_a_v22 as w;
use solana_program::pubkey::Pubkey;

fn hex(x: &[u8]) -> String { x.iter().map(|v| format!("{v:02x}")).collect() }
fn unhex(s: &str) -> Vec<u8> { (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect() }
fn o<T: ToString>(x: Option<T>) -> String { match x { Some(v) => format!("\"{}\"", v.to_string()), None => "null".into() } }
fn kv(xs: &[(&str, usize)]) -> String { xs.iter().map(|(n, v)| format!("\"{n}\":{v}")).collect::<Vec<_>>().join(",") }

fn trade(t: &I) -> String {
    match t {
        I::TradeCpi { account_a_portfolio_id, account_b_portfolio_id, asset_index, market_id, size_q, fee_bps, limit_price, backing_fee_cap_bps, .. } => format!(
            "\"accountAPortfolioId\":\"{account_a_portfolio_id}\",\"accountBPortfolioId\":\"{account_b_portfolio_id}\",\"assetIndex\":\"{asset_index}\",\"marketId\":\"{market_id}\",\"sizeQ\":\"{size_q}\",\"feeBps\":\"{fee_bps}\",\"limitPrice\":\"{limit_price}\",\"backingFeeCapBps\":\"{backing_fee_cap_bps}\""),
        _ => String::new(),
    }
}
fn mk(m: &I) -> String {
    match m { I::InitMarket { max_portfolio_assets, initial_price, .. } => format!("\"maxPortfolioAssets\":\"{max_portfolio_assets}\",\"initialPrice\":\"{initial_price}\""), _ => String::new() }
}

fn decoded(ix: &I) -> Option<String> {
    Some(match ix {
        I::InitMarketV19 { market, growth_r_gap_bps, growth_l_launch_x100 } => format!("{{\"variant\":\"InitMarketV19\",\"tag\":0,{},\"rGapBps\":\"{growth_r_gap_bps}\",\"lLaunchX100\":\"{growth_l_launch_x100}\"}}", mk(market)),
        I::InitMarketLotV22 { market, growth_r_gap_bps, growth_l_launch_x100, lot_exp } => format!("{{\"variant\":\"InitMarketLotV22\",\"tag\":0,{},\"rGapBps\":\"{growth_r_gap_bps}\",\"lLaunchX100\":\"{growth_l_launch_x100}\",\"lotExp\":\"{lot_exp}\"}}", mk(market)),
        I::InitMarketV22 { market, growth_r_gap_bps, growth_l_launch_x100, lot_exp, phase4 } => format!(
            "{{\"variant\":\"InitMarketV22\",\"tag\":0,{},\"rGapBps\":\"{growth_r_gap_bps}\",\"lLaunchX100\":\"{growth_l_launch_x100}\",\"lotExp\":\"{lot_exp}\",\"rentMaxE9PerSlot\":\"{}\",\"rentKinkBps\":\"{}\",\"bandBps\":\"{}\",\"bandMaxEpochSlots\":\"{}\",\"bandMaxPinSlots\":\"{}\",\"bandMinLegNotional\":\"{}\"}}",
            mk(market), phase4.rent_max_e9_per_slot, phase4.rent_kink_bps, phase4.band_bps, phase4.band_max_epoch_slots, phase4.band_max_pin_slots, phase4.band_min_leg_notional),
        I::RequestRedeemLpSharesV22 { shares, min_payout_atoms, keeper_ok } => format!("{{\"variant\":\"RequestRedeemLpSharesV22\",\"tag\":76,\"shares\":\"{shares}\",\"minPayoutAtoms\":\"{min_payout_atoms}\",\"keeperOk\":\"{keeper_ok}\"}}"),
        I::ExecuteRedemptionV22 { domain, min_payout_atoms, n_refresh } => format!("{{\"variant\":\"ExecuteRedemptionV22\",\"tag\":77,\"domain\":\"{domain}\",\"minPayoutAtoms\":\"{min_payout_atoms}\",\"nRefresh\":\"{n_refresh}\"}}"),
        I::SettleHoldingRent { asset_index, now_slot } => format!("{{\"variant\":\"SettleHoldingRent\",\"tag\":106,\"assetIndex\":\"{asset_index}\",\"nowSlot\":\"{now_slot}\"}}"),
        I::SweepBandDustLeg { asset_index } => format!("{{\"variant\":\"SweepBandDustLeg\",\"tag\":118,\"assetIndex\":\"{asset_index}\"}}"),
        I::EvictAndTradeCpi { trade: t } => format!("{{\"variant\":\"EvictAndTradeCpi\",\"tag\":119,{}}}", trade(t)),
        I::InitBondTranche { coupon_bps, util_bonus_bps, cooldown_slots, cap_bps } => format!("{{\"variant\":\"InitBondTranche\",\"tag\":107,\"couponBps\":\"{coupon_bps}\",\"utilBonusBps\":\"{util_bonus_bps}\",\"cooldownSlots\":\"{cooldown_slots}\",\"capBps\":\"{cap_bps}\"}}"),
        I::BondDeposit { amount, min_shares } => format!("{{\"variant\":\"BondDeposit\",\"tag\":108,\"amount\":\"{amount}\",\"minShares\":\"{min_shares}\"}}"),
        I::BondRequestWithdraw { shares } => format!("{{\"variant\":\"BondRequestWithdraw\",\"tag\":109,\"shares\":\"{shares}\"}}"),
        I::BondExecuteWithdraw { min_out, source_domain } => format!("{{\"variant\":\"BondExecuteWithdraw\",\"tag\":110,\"minOut\":\"{min_out}\",\"sourceDomain\":\"{source_domain}\"}}"),
        I::InsuranceBackstopDraw { mode, max_amount } => format!("{{\"variant\":\"InsuranceBackstopDraw\",\"tag\":111,\"mode\":\"{mode}\",\"maxAmount\":\"{max_amount}\"}}"),
        I::RescueDeposit { tranche, amount, min_shares } => format!("{{\"variant\":\"RescueDeposit\",\"tag\":112,\"tranche\":\"{tranche}\",\"amount\":\"{amount}\",\"minShares\":\"{min_shares}\"}}"),
        I::InitInsuranceUnits => "{\"variant\":\"InitInsuranceUnits\",\"tag\":116}".to_string(),
        I::ProposeG9FeedAllowlist { entries } => format!("{{\"variant\":\"ProposeG9FeedAllowlist\",\"tag\":120,\"count\":\"{}\",\"pairsHex\":\"{}\"}}", entries.len(), entries.iter().map(|(k, o)| format!("{}{}", hex(k), hex(o))).collect::<Vec<_>>().join(",")),
        I::CommitG9FeedAllowlist => "{\"variant\":\"CommitG9FeedAllowlist\",\"tag\":121}".to_string(),
        I::InitLpShareMetadata { ticker_len, ticker } => format!("{{\"variant\":\"InitLpShareMetadata\",\"tag\":122,\"tickerLen\":\"{}\",\"tickerHex\":\"{}\"}}", ticker_len, hex(&ticker[..*ticker_len as usize])),
        I::SetG9FeedAllowlist { keys } => format!("{{\"variant\":\"SetG9FeedAllowlist\",\"tag\":117,\"count\":\"{}\",\"keysHex\":\"{}\"}}", keys.len(), keys.iter().map(|k| hex(k)).collect::<Vec<_>>().join(",")),
        _ => return None,
    })
}

fn main() {
    let path = std::env::args().nth(1).expect("vectors.txt");
    let mut out: Vec<String> = Vec::new();

    let mut vecs = Vec::new();
    for line in std::fs::read_to_string(path).unwrap().lines().filter(|l| !l.trim().is_empty()) {
        let mut it = line.split_whitespace();
        let (id, h) = (it.next().unwrap(), it.next().unwrap());
        let bytes = unhex(h);
        let dec = I::decode(&bytes);
        let rr = match &dec {
            Ok(ix) => decoded(ix).map(|d| format!("{{\"ok\":true,\"decoded\":{d}}}")).unwrap_or("{\"ok\":true,\"decoded\":null}".into()),
            Err(e) => format!("{{\"ok\":false,\"err\":\"{e:?}\"}}"),
        };
        let re = dec.ok().map(|ix| hex(&ix.encode())).unwrap_or_default();
        vecs.push(format!("\"{id}\":{{\"hex\":\"{h}\",\"rust\":{rr},\"rustReencodedHex\":\"{re}\"}}"));
    }
    out.push(format!("\"vectors\":{{{}}}", vecs.join(",")));

    // errors
    let errs: Vec<(&str, u32)> = vec![
        ("PriceBandPinned", E::PriceBandPinned as u32), ("PriceBandConfigInvalid", E::PriceBandConfigInvalid as u32), ("HoldingRentConfigInvalid", E::HoldingRentConfigInvalid as u32),
        ("BondTrancheImpaired", E::BondTrancheImpaired as u32), ("BondCapacityLocked", E::BondCapacityLocked as u32), ("BondWithdrawCooldown", E::BondWithdrawCooldown as u32),
        ("BondConfigInvalid", E::BondConfigInvalid as u32), ("PriceBandPositionCap", E::PriceBandPositionCap as u32), ("PriceBandTooNarrow", E::PriceBandTooNarrow as u32),
        ("PriceBandLegBelowMinNotional", E::PriceBandLegBelowMinNotional as u32), ("RescueRefused", E::RescueRefused as u32), ("RescueNavFloor", E::RescueNavFloor as u32),
        ("InsuranceBackstopRefused", E::InsuranceBackstopRefused as u32), ("RedemptionBelowMinPayout", E::RedemptionBelowMinPayout as u32),
        ("ExitRequiresLossCurrent", E::ExitRequiresLossCurrent as u32), ("LotConfigInvalid", E::LotConfigInvalid as u32), ("BondDepositAboveCap", E::BondDepositAboveCap as u32),
        ("BondSlippage", E::BondSlippage as u32),
    ];
    out.push(format!("\"errors\":{{{}}}", errs.iter().map(|(n, x)| format!("\"{n}\":{x}")).collect::<Vec<_>>().join(",")));

    // layout
    let h = c::HEADER_LEN;
    let g = |f: usize| f;
    let group = [
        ("assetSlotCapacity", offset_of!(MarketGroupV16HeaderAccount, asset_slot_capacity)), ("vault", offset_of!(MarketGroupV16HeaderAccount, vault)),
        ("insurance", offset_of!(MarketGroupV16HeaderAccount, insurance)), ("cTot", offset_of!(MarketGroupV16HeaderAccount, c_tot)),
        ("sourceInsuranceCreditReservedTotalAtoms", offset_of!(MarketGroupV16HeaderAccount, source_insurance_credit_reserved_total_atoms)),
        ("insuranceDomainBudgetRemainingTotal", offset_of!(MarketGroupV16HeaderAccount, insurance_domain_budget_remaining_total)),
        ("materializedPortfolioCount", offset_of!(MarketGroupV16HeaderAccount, materialized_portfolio_count)),
        ("currentSlot", offset_of!(MarketGroupV16HeaderAccount, current_slot)), ("mode", offset_of!(MarketGroupV16HeaderAccount, mode)),
        ("config", offset_of!(MarketGroupV16HeaderAccount, config)),
    ];
    let astate = [
        ("rawOracleTargetPrice", offset_of!(AssetStateV16Account, raw_oracle_target_price)), ("effectivePrice", offset_of!(AssetStateV16Account, effective_price)),
        ("oiEffLongQ", offset_of!(AssetStateV16Account, oi_eff_long_q)), ("oiEffShortQ", offset_of!(AssetStateV16Account, oi_eff_short_q)),
    ];
    let eslot = [
        ("insuranceDomainBudgetLong", offset_of!(EngineAssetSlotV16Account, insurance_domain_budget_long)), ("insuranceDomainBudgetShort", offset_of!(EngineAssetSlotV16Account, insurance_domain_budget_short)),
        ("insuranceDomainSpentLong", offset_of!(EngineAssetSlotV16Account, insurance_domain_spent_long)), ("insuranceDomainSpentShort", offset_of!(EngineAssetSlotV16Account, insurance_domain_spent_short)),
        ("sourceCreditLong", offset_of!(EngineAssetSlotV16Account, source_credit_long)), ("sourceCreditShort", offset_of!(EngineAssetSlotV16Account, source_credit_short)),
        ("backingLong", offset_of!(EngineAssetSlotV16Account, backing_long)), ("backingShort", offset_of!(EngineAssetSlotV16Account, backing_short)),
        ("insuranceReservationLong", offset_of!(EngineAssetSlotV16Account, insurance_reservation_long)), ("insuranceReservationShort", offset_of!(EngineAssetSlotV16Account, insurance_reservation_short)),
        ("kfDriftLong", offset_of!(EngineAssetSlotV16Account, kf_drift_long)), ("kfDriftShort", offset_of!(EngineAssetSlotV16Account, kf_drift_short)),
    ];
    let leg = [
        ("active", offset_of!(PortfolioLegV16Account, active)), ("assetIndex", offset_of!(PortfolioLegV16Account, asset_index)), ("marketId", offset_of!(PortfolioLegV16Account, market_id)),
        ("side", offset_of!(PortfolioLegV16Account, side)), ("basisPosQ", offset_of!(PortfolioLegV16Account, basis_pos_q)), ("aBasis", offset_of!(PortfolioLegV16Account, a_basis)),
        ("kSnap", offset_of!(PortfolioLegV16Account, k_snap)), ("fSnap", offset_of!(PortfolioLegV16Account, f_snap)), ("kRemNum", offset_of!(PortfolioLegV16Account, k_rem_num)),
        ("fRemNum", offset_of!(PortfolioLegV16Account, f_rem_num)), ("kfEpochSnap", offset_of!(PortfolioLegV16Account, kf_epoch_snap)), ("epochSnap", offset_of!(PortfolioLegV16Account, epoch_snap)),
        ("lossWeight", offset_of!(PortfolioLegV16Account, loss_weight)), ("bSnap", offset_of!(PortfolioLegV16Account, b_snap)), ("bRem", offset_of!(PortfolioLegV16Account, b_rem)),
        ("bEpochSnap", offset_of!(PortfolioLegV16Account, b_epoch_snap)), ("bStale", offset_of!(PortfolioLegV16Account, b_stale)), ("stale", offset_of!(PortfolioLegV16Account, stale)),
        ("bandEpochSnap", offset_of!(PortfolioLegV16Account, band_epoch_snap)), ("bandLiqPending", offset_of!(PortfolioLegV16Account, band_liq_pending)),
        ("rentSnap", offset_of!(PortfolioLegV16Account, rent_snap)), ("rentCarry", offset_of!(PortfolioLegV16Account, rent_carry)),
    ];
    let pf = [
        ("legs", h + offset_of!(PortfolioAccountV16Account, legs)), ("sourceDomains", h + offset_of!(PortfolioAccountV16Account, source_domains)),
        ("resolvedPayoutReceipt", h + offset_of!(PortfolioAccountV16Account, resolved_payout_receipt)),
        ("provenanceHeader", h + offset_of!(PortfolioAccountV16Account, provenance_header)),
    ];
    out.push(format!(
        "\"layout\":{{\"headerLen\":{h},\"wrapperConfigLen\":{},\"marketGroupOff\":{},\"marketGroupLen\":{},\"assetSlotStride\":{},\"wrapperSlotLen\":{},\"engineSlotLen\":{},\"assetStateLen\":{},\"portfolioAccountLen\":{},\"legStride\":{},\"portfolioMatcherConfigOff\":{},\"wrapperVersion\":{},\"engineDiscriminator\":{},\"riskLimitsSlotOff\":{},\"growthSlotOff\":{},\"vaultLpSlotOff\":{},\"vaultLpDrawSlotOff\":{},\"redemptionBody\":{},\"redemptionExtBody\":{},\"bondTrancheBody\":{},\"bondPositionBody\":{},\"insuranceUnitsBody\":{},\"g9AllowlistBody\":{},\"group\":{{{}}},\"assetState\":{{{}}},\"engineSlot\":{{{}}},\"leg\":{{{}}},\"portfolio\":{{{}}}}}",
        c::WRAPPER_CONFIG_LEN, c::MARKET_GROUP_OFF, c::MARKET_GROUP_LEN, c::MARKET_ASSET_SLOT_LEN, c::ASSET_ORACLE_WRAPPER_LEN, size_of::<EngineAssetSlotV16Account>(), size_of::<AssetStateV16Account>(),
        c::PORTFOLIO_ACCOUNT_LEN, size_of::<PortfolioLegV16Account>(), c::PORTFOLIO_MATCHER_CONFIG_OFF + h, c::VERSION, percolator::V16_LAYOUT_DISCRIMINATOR,
        c::ASSET_RISK_LIMITS_OFF, c::ASSET_GROWTH_OFF, c::ASSET_VAULT_LP_OFF, c::ASSET_VAULT_LP_DRAW_OFF,
        size_of::<state::LpRedemptionV16>(), size_of::<state::LpRedemptionExtV22>(), size_of::<state::BondTrancheV20>(), size_of::<state::BondPositionV20>(), size_of::<state::InsuranceUnitsV20>(), size_of::<state::G9FeedAllowlistV22>(),
        kv(&group.iter().map(|(n, v)| (*n, g(*v))).collect::<Vec<_>>()), kv(&astate), kv(&eslot), kv(&leg), kv(&pf)));

    // constants
    out.push(format!(
        "\"constants\":{{\"refreshMax\":{},\"refreshBaseWeight\":{},\"refreshWeightBudget\":{},\"exitDipBps\":{},\"lotExpMax\":{},\"lotPriceFloorE6\":{},\"bondCouponMaxBps\":{},\"bondUtilBonusMaxBps\":{},\"bondCooldownMin\":{},\"bondCooldownMax\":{},\"bondCapMaxBps\":{},\"bondCouponMaxLegBps\":{},\"slotsPerYear\":{},\"rescueNavFloorBps\":{},\"rescueMinAtoms\":{},\"rescueMaxMult\":{},\"insUnitsGenesisMin\":{},\"backstopCapBps\":{},\"g9Delay\":{},\"g9ExecWindow\":{},\"g9EpochSlots\":{},\"g9EpochCapBps\":{},\"restoreImBufferBps\":{},\"g9FeedCap\":{},\"p4InsUnitsRequired\":{},\"p4ExitRequiresLossCurrent\":{},\"kindBondTranche\":{},\"kindBondPosition\":{},\"kindInsuranceUnits\":{},\"kindG9\":{},\"bandMaxBps\":{},\"bandMinEpoch\":{},\"bandMinPinEpochs\":{},\"bandMaxPositions\":{},\"minBandWidthTicks\":{},\"genesisFloorMultiple\":{},\"maxRentE9\":{},\"rentMinE9\":{},\"rentMaxKinkBps\":{},\"bandMinLegTokens\":{},\"bandEvictMaxVictim\":{},\"bandEvictNotional\":{},\"tagSettleRent\":{},\"tagSweep\":{},\"tagEvict\":{},\"tagBond\":[{},{},{},{}],\"tagBackstop\":{},\"tagRescue\":{},\"tagUnits\":{},\"tagG9\":{}}}",
        c::REDEMPTION_REFRESH_MAX, c::REDEMPTION_REFRESH_BASE_WEIGHT, c::REDEMPTION_REFRESH_WEIGHT_BUDGET, w::EXIT_DIP_BPS, c::LOT_EXP_MAX, c::LOT_PRICE_FLOOR_E6,
        b::BOND_COUPON_MAX_BPS, b::BOND_UTIL_BONUS_MAX_BPS, b::BOND_COOLDOWN_MIN_SLOTS, b::BOND_COOLDOWN_MAX_SLOTS, b::BOND_CAP_MAX_BPS, b::BOND_COUPON_MAX_LEG_BPS, b::SLOTS_PER_YEAR,
        r::RESCUE_NAV_FLOOR_BPS, r::RESCUE_MIN_ATOMS, r::RESCUE_MAX_MULT, r::INS_UNITS_GENESIS_MIN_ATOMS, r::BACKSTOP_CAP_BPS, r::G9_DELAY_SLOTS, r::G9_EXEC_WINDOW_SLOTS, r::G9_EPOCH_SLOTS, r::G9_EPOCH_CAP_BPS,
        r::RESTORE_IM_BUFFER_BPS, c::G9_FEED_ALLOWLIST_CAP, c::P4_FLAG_INS_UNITS_REQUIRED, c::P4_FLAG_EXIT_REQUIRES_LOSS_CURRENT,
        c::KIND_BOND_TRANCHE, c::KIND_BOND_POSITION, c::KIND_INSURANCE_UNITS, c::KIND_G9_FEED_ALLOWLIST,
        percolator::band_rent::MAX_BAND_BPS, percolator::band_rent::BAND_MIN_EPOCH_SLOTS, percolator::band_rent::BAND_MIN_PIN_EPOCHS, percolator::band_rent::BAND_MAX_POSITIONS_PER_SIDE,
        percolator::band_rent::MIN_BAND_WIDTH_TICKS, percolator::band_rent::BAND_GENESIS_FLOOR_MULTIPLE, percolator::band_rent::MAX_RENT_E9_PER_SLOT,
        percolator_prog::growth_v19::RENT_MIN_E9_PER_SLOT, percolator_prog::growth_v19::RENT_MAX_KINK_BPS, percolator_prog::growth_v19::BAND_MIN_LEG_NOTIONAL_TOKENS,
        c::BAND_EVICT_MAX_VICTIM_MULTIPLE, c::BAND_EVICT_NOTIONAL_MULTIPLE,
        c::TAG_SETTLE_HOLDING_RENT, c::TAG_SWEEP_BAND_DUST_LEG, c::TAG_EVICT_AND_TRADE_CPI, c::TAG_INIT_BOND_TRANCHE, c::TAG_BOND_DEPOSIT, c::TAG_BOND_REQUEST_WITHDRAW, c::TAG_BOND_EXECUTE_WITHDRAW,
        c::TAG_INSURANCE_BACKSTOP_DRAW, c::TAG_RESCUE_DEPOSIT, c::TAG_INIT_INSURANCE_UNITS, c::TAG_SET_G9_FEED_ALLOWLIST));

    // PDAs
    let program = Pubkey::new_from_array([7u8; 32]);
    let mut pdas = Vec::new();
    for m in [1u8, 2, 200] {
        let market = Pubkey::new_from_array([m; 32]);
        let owner = Pubkey::new_from_array([m ^ 0x55; 32]);
        let (t, tb) = state::derive_bond_tranche(&program, &market);
        let (p, pb) = state::derive_bond_position(&program, &market, &owner);
        let (u, ub) = state::derive_insurance_units(&program, &market);
        pdas.push(format!("{{\"program\":\"{program}\",\"market\":\"{market}\",\"owner\":\"{owner}\",\"tranche\":\"{t}\",\"tb\":{tb},\"position\":\"{p}\",\"pb\":{pb},\"units\":\"{u}\",\"ub\":{ub}}}"));
    }
    let (gl, gb) = state::derive_g9_feed_allowlist(&program);
    out.push(format!("\"pdas\":[{}],\"g9Pda\":{{\"pda\":\"{gl}\",\"bump\":{gb}}}", pdas.join(",")));

    // accounts written by the program's own init/write functions
    let mut accts = Vec::new();
    let tr = state::BondTrancheV20 { market_group: [9; 32], c_b_atoms: 1_000_000_000_000_000_000_000, b_shares_total: 999_999_999_999_999_999_999, principal_in_lp_atoms: 5, bond_drawn_outstanding_atoms: 6, last_coupon_slot: 777, coupon_bps_per_year: 801, coupon_util_bonus_bps: 0, bond_cooldown_slots: 9_001, bond_cap_bps_of_c: 4_999, version: 1, bump: 250, last_util_bps: 1234, _padding: [0; 2], coupon_paid_total_atoms: 4242 };
    let mut a = vec![0u8; state::bond_tranche_account_len()]; state::init_bond_tranche(&mut a, &tr).unwrap();
    accts.push(format!("\"bondTranche\":{{\"hex\":\"{}\",\"programReads\":{}}}", hex(&a), state::read_bond_tranche(&a).is_ok()));
    let mut bad = a.clone(); bad[16 + 114 - 114 + 118] = 1; // padding byte
    accts.push(format!("\"bondTrancheBadPad\":{{\"hex\":\"{}\",\"programReads\":{}}}", hex(&bad), state::read_bond_tranche(&bad).is_ok()));
    let ps = state::BondPositionV20 { owner: [8; 32], shares: 123_456_789_012_345_678_901, pending_withdraw_shares: 7, request_slot: 99, version: 1, bump: 251, _padding: [0; 6], _reserved: [0; 16] };
    let mut a = vec![0u8; state::bond_position_account_len()]; state::init_bond_position(&mut a, &ps).unwrap();
    accts.push(format!("\"bondPosition\":{{\"hex\":\"{}\",\"programReads\":{}}}", hex(&a), state::read_bond_position(&a).is_ok()));
    let mut bad = a.clone(); bad[16 + 48] = 0xff; bad[16 + 49] = 0xff; // pending > shares? set high bytes
    for i in 0..16 { bad[16 + 48 + i] = 0xff; }
    accts.push(format!("\"bondPositionPendingOverShares\":{{\"hex\":\"{}\",\"programReads\":{}}}", hex(&bad), state::read_bond_position(&bad).is_ok()));
    let mut un = state::InsuranceUnitsV20 { market_group: [7; 32], units_total: 30, units_stake: 10, units_creator: 20, backstop_receivable_atoms: 1, snap_insurance_mint_atoms: 2, snap_insurance_free_atoms: 3, snap_slot: 4, version: 1, bump: 249, creator_paid_to_stake_atoms: 5, g9_pending_slot: 6, g9_epoch: 7, g9_epoch_drawn_atoms: 8, ..Default::default() };
    un.units_total = 30;
    let mut a = vec![0u8; state::insurance_units_account_len()]; state::init_insurance_units(&mut a, &un).unwrap();
    accts.push(format!("\"insuranceUnits\":{{\"hex\":\"{}\",\"programReads\":{}}}", hex(&a), state::read_insurance_units(&a).is_ok()));
    let mut bad = a.clone(); bad[16 + 32] = 31; // total != stake + creator
    accts.push(format!("\"insuranceUnitsBadTotal\":{{\"hex\":\"{}\",\"programReads\":{}}}", hex(&bad), state::read_insurance_units(&bad).is_ok()));
    let mut al: state::G9FeedAllowlistV22 = bytemuck::Zeroable::zeroed();
    al.count = 2; al.version = c::G9_FEED_ALLOWLIST_VERSION; al.bump = 254; al.keys[0] = [1; 32]; al.keys[1] = [2; 32];
    let mut a = vec![0u8; state::g9_feed_allowlist_account_len()]; state::write_g9_feed_allowlist(&mut a, &al).unwrap();
    accts.push(format!("\"g9Allowlist\":{{\"hex\":\"{}\",\"programReads\":{}}}", hex(&a), state::read_g9_feed_allowlist(&a).is_ok()));
    let mut bad = a.clone(); bad[16 + 8 + 32 * 5] = 1; // unlisted slot non-zero
    accts.push(format!("\"g9AllowlistUnlistedSet\":{{\"hex\":\"{}\",\"programReads\":{}}}", hex(&bad), state::read_g9_feed_allowlist(&bad).is_ok()));
    // redemption legacy and v2.2
    let rd = state::LpRedemptionV16 { registry: [3; 32], redeemer: [4; 32], shares: 55, request_slot: 66, version: c::LP_VAULT_VERSION, bump: 5, _padding: [0; 6] };
    let mut a = vec![0u8; state::lp_redemption_account_len()]; state::init_lp_redemption(&mut a, &rd).unwrap();
    accts.push(format!("\"redemptionLegacy\":{{\"hex\":\"{}\"}}", hex(&a)));
    let mut a2 = vec![0u8; state::lp_redemption_v22_account_len()]; state::init_lp_redemption(&mut a2, &rd).unwrap();
    state::write_lp_redemption_ext(&mut a2, &state::LpRedemptionExtV22 { min_payout_atoms: 0x1122334455667788, keeper_ok: 1, _reserved: [0; 7] }).unwrap();
    accts.push(format!("\"redemptionV22\":{{\"hex\":\"{}\",\"extOk\":{}}}", hex(&a2), state::read_lp_redemption_ext(&a2).is_ok()));
    let mut bad = a2.clone(); bad[112 + 8] = 2;
    accts.push(format!("\"redemptionV22BadKeeper\":{{\"hex\":\"{}\",\"extOk\":{}}}", hex(&bad), state::read_lp_redemption_ext(&bad).is_ok()));
    out.push(format!("\"accounts\":{{{}}}", accts.join(",")));

    // pure rules: fixed input rows, outputs from the real functions
    let mut rows: Vec<String> = Vec::new();
    let vals: [u128; 6] = [0, 1, 150, 10_000, 1_000_000_007, 1u128 << 70];
    for &v in &vals { for &cs in &[0u128, 800, 1_000_000] { for &cb in &[0u128, 150, 500_000] {
        let t = b::tranche_split3(v, cs, cb);
        rows.push(format!("{{\"fn\":\"split3\",\"in\":[\"{v}\",\"{cs}\",\"{cb}\"],\"out\":[\"{}\",\"{}\",\"{}\"]}}", t.senior, t.bond, t.junior));
        rows.push(format!("{{\"fn\":\"impaired\",\"in\":[\"{v}\",\"{cs}\",\"{cb}\"],\"out\":[\"{}\"]}}", b::bond_impaired(v, cs, cb)));
    }}}
    for &(a_, tot, val) in &[(1000u128, 0u128, 0u128), (1000, 5000, 4000), (7, 3, 0), (1u128 << 60, 1u128 << 59, 3)] {
        rows.push(format!("{{\"fn\":\"bondShares\",\"in\":[\"{a_}\",\"{tot}\",\"{val}\"],\"out\":[{}]}}", o(b::bond_shares_for_deposit(a_, tot, val))));
        rows.push(format!("{{\"fn\":\"bondAtoms\",\"in\":[\"{a_}\",\"{tot}\",\"{val}\"],\"out\":[{}]}}", o(b::bond_atoms_for_redemption(a_, tot, val))));
        rows.push(format!("{{\"fn\":\"claimAfter\",\"in\":[\"{a_}\",\"{tot}\",\"{val}\"],\"out\":[{}]}}", o(b::bond_claim_after_redemption(a_, tot, val))));
        rows.push(format!("{{\"fn\":\"insTopup\",\"in\":[\"{a_}\",\"{tot}\",\"{val}\"],\"out\":[{}]}}", o(r::ins_units_for_topup(a_, tot, val))));
        rows.push(format!("{{\"fn\":\"insBurn\",\"in\":[\"{a_}\",\"{tot}\",\"{val}\"],\"out\":[{}]}}", o(r::ins_units_to_burn(a_, tot, val))));
        rows.push(format!("{{\"fn\":\"insValue\",\"in\":[\"{a_}\",\"{tot}\",\"{val}\"],\"out\":[{}]}}", o(r::ins_units_value(a_, tot, val))));
        rows.push(format!("{{\"fn\":\"mintAdm\",\"in\":[\"{a_}\",\"{tot}\",\"{val}\",\"5000\"],\"out\":[\"{}\"]}}", r::ins_mint_admissible(a_, tot, val, 5000)));
        rows.push(format!("{{\"fn\":\"coupon\",\"in\":[\"{a_}\",\"800\",\"{}\"],\"out\":[{}]}}", tot as u64, o(b::coupon_due(a_, 800, tot as u64))));
        rows.push(format!("{{\"fn\":\"couponSplit\",\"in\":[\"{a_}\",\"{tot}\"],\"out\":[\"{}\",\"{}\"]}}", b::bond_coupon_split(a_, tot).0, b::bond_coupon_split(a_, tot).1));
        rows.push(format!("{{\"fn\":\"parAtoms\",\"in\":[\"{a_}\",\"{tot}\",\"{val}\"],\"out\":[{}]}}", o(w::par_atoms(a_, tot, val))));
        rows.push(format!("{{\"fn\":\"dip\",\"in\":[\"{a_}\",\"{tot}\"],\"out\":[\"{}\"]}}", w::dip_floor_ok(a_, tot)));
        rows.push(format!("{{\"fn\":\"rescueShares\",\"in\":[\"{a_}\",\"{tot}\",\"{val}\"],\"out\":[{}]}}", o(r::rescue_shares(a_, tot, val))));
        rows.push(format!("{{\"fn\":\"rescueDelta\",\"in\":[\"{a_}\",\"{tot}\",\"{val}\"],\"out\":[{}]}}", o(r::rescue_claim_delta(a_, tot, val))));
        rows.push(format!("{{\"fn\":\"backstop\",\"in\":[\"{a_}\",\"{tot}\",\"{val}\",\"3\"],\"out\":[\"{}\"]}}", r::backstop_draw_amount(a_, tot, val, 3, 5000)));
        rows.push(format!("{{\"fn\":\"epochRoom\",\"in\":[\"{a_}\",\"{tot}\"],\"out\":[\"{}\"]}}", r::g9_epoch_room(a_, tot, 2000)));
    }
    for &(x, v, par, s) in &[(100_000_000u128, 800_000_000u128, 1_000_000_000u128, 1000u128), (99_999_999, 800_000_000, 1_000_000_000, 1000), (100_000_000, 40_000_000, 1_000_000_000, 1000), (100_000_000, 1_000_000_000, 1_000_000_000, 1000), (100_000_000, 0, 1_000_000_000, 1000), (8_000_000_001, 800_000_000, 1_000_000_000, 1000), (100_000_000, 800_000_000, 1_000_000_000, 0)] {
        let res = match r::rescue_admitted(x, v, par, s) { Ok(()) => "Ok".to_string(), Err(e) => format!("{e:?}") };
        rows.push(format!("{{\"fn\":\"rescueAdmitted\",\"in\":[\"{x}\",\"{v}\",\"{par}\",\"{s}\"],\"out\":[\"{res}\"]}}"));
    }
    for &(pend, now) in &[(0u64, 5u64), (1000, 5000), (1000, 10_000), (1000, 10_500), (1000, 19_999), (1000, 20_000), (1000, 25_000)] {
        rows.push(format!("{{\"fn\":\"g9Delay\",\"in\":[\"{pend}\",\"{now}\"],\"out\":[\"{}\"]}}", r::g9_delay_elapsed(pend, now)));
        rows.push(format!("{{\"fn\":\"g9Open\",\"in\":[\"{pend}\",\"{now}\"],\"out\":[\"{}\"]}}", r::g9_proposal_open(pend, now)));
        rows.push(format!("{{\"fn\":\"cooldown\",\"in\":[\"{now}\",\"{pend}\",\"9000\"],\"out\":[\"{}\"]}}", b::bond_cooldown_elapsed(now, pend, 9000)));
    }
    for &(cb, cs, jun, cap) in &[(500u128, 800u128, 200u128, 5000u16), (501, 800, 200, 5000), (0, 0, 0, 1)] {
        rows.push(format!("{{\"fn\":\"capOk\",\"in\":[\"{cb}\",\"{cs}\",\"{jun}\",\"{cap}\"],\"out\":[\"{}\"]}}", b::bond_cap_ok(cb, cs, jun, cap)));
    }
    for &(n, l, s, lp) in &[(Some(100u128), 40u128, 60u128, 10u128), (Some(59), 40, 60, 10), (None, 0, 0, 0), (None, 1, 0, 0)] {
        rows.push(format!("{{\"fn\":\"lockOk\",\"in\":[{},\"{l}\",\"{s}\",\"{lp}\"],\"out\":[\"{}\"]}}", o(n), b::bond_withdraw_lock_ok(n, l, s, lp)));
    }
    for &(oi, n) in &[(0u128, 0u128), (5, 0), (50, 100), (200, 100)] {
        rows.push(format!("{{\"fn\":\"utilBps\",\"in\":[\"{oi}\",\"{n}\"],\"out\":[\"{}\"]}}", b::bond_util_bps(oi, n)));
    }
    for &(nv, lv, lw) in &[(1000u128, 200u128, 150i128), (1000, 200, 300), (1000, 200, -400), (1000, 200, -4000)] {
        rows.push(format!("{{\"fn\":\"valueWorse\",\"in\":[\"{nv}\",\"{lv}\",\"{lw}\"],\"out\":[\"{}\"]}}", b::vault_value_worse(nv, lv, lw)));
    }
    for d in [1u64, 10, 130, 500, 2000] {
        rows.push(format!("{{\"fn\":\"bandMinWide\",\"in\":[\"{d}\"],\"out\":[{}]}}", o(percolator::band_rent::band_min_wide_anchor(d).unwrap())));
        for a in [1_000u64, 123_100, 1_000_000, 999_999_999_999] {
            let bb = percolator::band_rent::band_bounds(a, d).unwrap();
            rows.push(format!("{{\"fn\":\"bandBounds\",\"in\":[\"{a}\",\"{d}\"],\"out\":[\"{}\",\"{}\"]}}", bb.0, bb.1));
            rows.push(format!("{{\"fn\":\"bandGenesis\",\"in\":[\"{a}\",\"{d}\"],\"out\":[\"{}\"]}}", percolator::band_rent::band_genesis_price_ok(a, d).unwrap()));
        }
    }
    for l in 0u32..=20 { rows.push(format!("{{\"fn\":\"refreshWeight\",\"in\":[\"{l}\"],\"out\":[\"{}\"]}}", w::refresh_weight(l))); }
    out.push(format!("\"rules\":[{}]", rows.join(",")));

    println!("{{{}}}", out.join(",\n"));
}
