//! P3 SDK parity oracle. Copy into a checkout of percolator-prog
//! `feat/p3-vault-owned-lp` as `src/bin/sdk_p3_parity.rs` (do NOT commit it there) and run:
//!   cargo run --quiet --bin sdk_p3_parity -- vectors.txt > p3-parity.json
//! Uses the REAL P3 crate: `ix::Instruction::decode`, `state::{VaultLpStateV18, AssetVaultLpV18,
//! read_asset_vault_lp, market_account_len_for_capacity}`, `error::PercolatorError`.
use core::mem::{offset_of, size_of};
use percolator_prog::constants as c;
use percolator_prog::error::PercolatorError as E;
use percolator_prog::ix::Instruction as I;
use percolator_prog::state::{self, AssetVaultLpV18, VaultLpStateV18};

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
fn unhex(s: &str) -> Vec<u8> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

fn decoded(ix: &I) -> Option<String> {
    Some(match ix {
        I::InitVaultLp { junior_floor_bps } => format!("{{\"tag\":94,\"juniorFloorBps\":\"{junior_floor_bps}\"}}"),
        I::VaultLpSetMatcher { expected_sequence, asset_generation_frontier, trade_fee_cap_bps, expiry_slot, kind,
            trading_fee_bps, base_spread_bps, max_total_bps, impact_k_bps, liquidity_notional_e6, max_fill_abs,
            max_inventory_abs, fee_to_insurance_bps, skew_spread_mult_bps } => format!(
            "{{\"tag\":95,\"expectedSequence\":\"{expected_sequence}\",\"assetGenerationFrontier\":\"{asset_generation_frontier}\",\"tradeFeeCapBps\":\"{trade_fee_cap_bps}\",\"expirySlot\":\"{expiry_slot}\",\"kind\":\"{kind}\",\"tradingFeeBps\":\"{trading_fee_bps}\",\"baseSpreadBps\":\"{base_spread_bps}\",\"maxTotalBps\":\"{max_total_bps}\",\"impactKBps\":\"{impact_k_bps}\",\"liquidityNotionalE6\":\"{liquidity_notional_e6}\",\"maxFillAbs\":\"{max_fill_abs}\",\"maxInventoryAbs\":\"{max_inventory_abs}\",\"feeToInsuranceBps\":\"{fee_to_insurance_bps}\",\"skewSpreadMultBps\":\"{skew_spread_mult_bps}\"}}"),
        I::DepositJuniorTranche { amount } => format!("{{\"tag\":96,\"amount\":\"{amount}\"}}"),
        I::WithdrawJuniorTranche { amount } => format!("{{\"tag\":97,\"amount\":\"{amount}\"}}"),
        I::VaultLpRecall { amount, target_domain } => format!("{{\"tag\":98,\"amount\":\"{amount}\",\"targetDomain\":\"{target_domain}\"}}"),
        I::SetVaultLpRisk { asset_index, skew_slope_e9, skew_max_e9, lev_cap_q, lev_max_imr_bps, vault_lp_max_lev_bps, approved_matcher_program } => format!(
            "{{\"tag\":99,\"assetIndex\":\"{asset_index}\",\"skewSlopeE9\":\"{skew_slope_e9}\",\"skewMaxE9\":\"{skew_max_e9}\",\"levCapQ\":\"{lev_cap_q}\",\"levMaxImrBps\":\"{lev_max_imr_bps}\",\"vaultLpMaxLevBps\":\"{vault_lp_max_lev_bps}\",\"approvedMatcherProgramHex\":\"{}\"}}", hex(approved_matcher_program)),
        I::VaultLpConvertPnl { amount } => format!("{{\"tag\":100,\"amount\":\"{amount}\"}}"),
        I::VaultLpSettleResolved { topup } => format!("{{\"tag\":101,\"topup\":\"{topup}\"}}"),
        I::VaultLpReleaseSurplus { amount, source_domain } => format!("{{\"tag\":102,\"amount\":\"{amount}\",\"sourceDomain\":\"{source_domain}\"}}"),
        I::PermissionlessCrank { now_slot, observations } => format!(
            "{{\"tag\":5,\"nowSlot\":\"{now_slot}\",\"observations\":[{}]}}",
            observations.iter().map(|o| format!("[{},{}]", o.asset_index, o.oracle_accounts)).collect::<Vec<_>>().join(",")),
        _ => return None,
    })
}

fn main() {
    let path = std::env::args().nth(1).expect("vectors.txt");
    let mut out: Vec<String> = Vec::new();

    // ── instruction round-trips (TS encoder hex → real decoder) ─────────────
    let mut vecs = Vec::new();
    for line in std::fs::read_to_string(path).unwrap().lines().filter(|l| !l.trim().is_empty()) {
        let mut it = line.split_whitespace();
        let (id, h) = (it.next().unwrap(), it.next().unwrap());
        let bytes = unhex(h);
        let r = match I::decode(&bytes) {
            Ok(ix) => decoded(&ix).map(|d| format!("{{\"ok\":true,\"decoded\":{d}}}")).unwrap_or("{\"ok\":true,\"decoded\":null}".into()),
            Err(e) => format!("{{\"ok\":false,\"err\":\"{e:?}\"}}"),
        };
        vecs.push(format!("\"{id}\":{{\"hex\":\"{h}\",\"rust\":{r}}}"));
    }
    out.push(format!("\"vectors\":{{{}}}", vecs.join(",")));

    // ── errors, by NAME from the final (P1 + P3) enum ────────────────────────
    let errs: [(&str, u32); 24] = [
        ("ExecPriceOutsideOracleBand", E::ExecPriceOutsideOracleBand as u32), ("SameOwnerTrade", E::SameOwnerTrade as u32),
        ("LpExposureCapExceeded", E::LpExposureCapExceeded as u32), ("LpFloorHalt", E::LpFloorHalt as u32),
        ("ProtocolSideOiCapExceeded", E::ProtocolSideOiCapExceeded as u32), ("CloseSlabFeesOutstanding", E::CloseSlabFeesOutstanding as u32),
        ("VaultLpAlreadyBound", E::VaultLpAlreadyBound as u32), ("VaultLpNotBound", E::VaultLpNotBound as u32),
        ("VaultLpSeniorImpaired", E::VaultLpSeniorImpaired as u32), ("VaultLpJuniorWithdrawRefused", E::VaultLpJuniorWithdrawRefused as u32),
        ("VaultLpRecallRefused", E::VaultLpRecallRefused as u32), ("VaultLpExclusiveCounterparty", E::VaultLpExclusiveCounterparty as u32),
        ("VaultLpLeverageStepDown", E::VaultLpLeverageStepDown as u32), ("VaultLpBoundCannotClose", E::VaultLpBoundCannotClose as u32),
        ("VaultLpExposureCapExceeded", E::VaultLpExposureCapExceeded as u32), ("VaultLpMatcherNotApproved", E::VaultLpMatcherNotApproved as u32),
        ("VaultLpUseSettleResolved", E::VaultLpUseSettleResolved as u32), ("VaultLpReleaseRefused", E::VaultLpReleaseRefused as u32),
        ("VaultLpHarvestPending", E::VaultLpHarvestPending as u32), ("VaultLpValuationStale", E::VaultLpValuationStale as u32),
        ("VaultLpMultiAssetMarket", E::VaultLpMultiAssetMarket as u32),
        ("VaultLpSeniorDrawRequired", E::VaultLpSeniorDrawRequired as u32), ("VaultLpRedeemNeedsRecall", E::VaultLpRedeemNeedsRecall as u32), ("VaultLpPausedForSeniorDraw", E::VaultLpPausedForSeniorDraw as u32),
    ];
    out.push(format!("\"errors\":{{{}}}", errs.iter().map(|(n, v)| format!("\"{n}\":{v}")).collect::<Vec<_>>().join(",")));

    // ── layout (rustc offset_of on the real structs; account offset = +HEADER_LEN) ──
    let h = c::HEADER_LEN;
    let vs = [
        ("marketGroup", offset_of!(VaultLpStateV18, market_group)), ("registry", offset_of!(VaultLpStateV18, registry)),
        ("lpPortfolio", offset_of!(VaultLpStateV18, lp_portfolio)), ("juniorOwner", offset_of!(VaultLpStateV18, junior_owner)),
        ("seniorClaimAtoms", offset_of!(VaultLpStateV18, senior_claim_atoms)), ("juniorDepositedAtoms", offset_of!(VaultLpStateV18, junior_deposited_atoms)),
        ("juniorWithdrawnAtoms", offset_of!(VaultLpStateV18, junior_withdrawn_atoms)), ("seniorFeeCreditedAtoms", offset_of!(VaultLpStateV18, senior_fee_credited_atoms)),
        ("recalledAtoms", offset_of!(VaultLpStateV18, recalled_atoms)), ("assetIndex", offset_of!(VaultLpStateV18, asset_index)),
        ("juniorFloorBps", offset_of!(VaultLpStateV18, junior_floor_bps)), ("seniorFeeShareBps", offset_of!(VaultLpStateV18, senior_fee_share_bps)),
        ("version", offset_of!(VaultLpStateV18, version)), ("bump", offset_of!(VaultLpStateV18, bump)),
        ("padding", offset_of!(VaultLpStateV18, _padding)),
        ("seniorDrawnAtoms", offset_of!(VaultLpStateV18, senior_drawn_atoms)),
        ("seniorDrawOutstandingAtoms", offset_of!(VaultLpStateV18, senior_draw_outstanding_atoms)),
    ];
    let dr = [
        ("pendingOutEvenAtoms", offset_of!(state::AssetVaultLpDrawV18, pending_out_even_atoms)),
        ("pendingOutOddAtoms", offset_of!(state::AssetVaultLpDrawV18, pending_out_odd_atoms)),
        ("outstandingMirrorAtoms", offset_of!(state::AssetVaultLpDrawV18, outstanding_mirror_atoms)),
        ("pendingMovedAtoms", offset_of!(state::AssetVaultLpDrawV18, pending_moved_atoms)),
    ];
    let av = [
        ("vaultLpPortfolio", offset_of!(AssetVaultLpV18, vault_lp_portfolio)), ("lpNetQ", offset_of!(AssetVaultLpV18, lp_net_q)),
        ("levCapQ", offset_of!(AssetVaultLpV18, lev_cap_q)), ("lpNetSlot", offset_of!(AssetVaultLpV18, lp_net_slot)),
        ("skewSlopeE9", offset_of!(AssetVaultLpV18, skew_slope_e9)), ("skewMaxE9", offset_of!(AssetVaultLpV18, skew_max_e9)),
        ("levMaxImrBps", offset_of!(AssetVaultLpV18, lev_max_imr_bps)), ("flags", offset_of!(AssetVaultLpV18, flags)),
        ("reserved0", offset_of!(AssetVaultLpV18, _reserved0)), ("vaultLpMaxLevBps", offset_of!(AssetVaultLpV18, vault_lp_max_lev_bps)),
        ("approvedMatcherProgram", offset_of!(AssetVaultLpV18, approved_matcher_program)),
    ];
    let j = |xs: &[(&str, usize)], add: usize| xs.iter().map(|(n, o)| format!("\"{n}\":{}", o + add)).collect::<Vec<_>>().join(",");
    out.push(format!(
        "\"layout\":{{\"headerLen\":{h},\"vaultLpStateBodyLen\":{},\"vaultLpStateAccountLen\":{},\"kindVaultLpState\":{},\"assetVaultLpLen\":{},\"assetVaultLpSlotOff\":{},\"flagBound\":{},\"registryReservedOff\":{},\"vaultLpStateAccountOff\":{{{}}},\"assetVaultLpFieldOff\":{{{}}},\"assetVaultLpDrawSlotOff\":{},\"assetVaultLpDrawLen\":{},\"assetVaultLpDrawFieldOff\":{{{}}}}}",
        size_of::<VaultLpStateV18>(), state::vault_lp_state_account_len(), c::KIND_VAULT_LP_STATE, c::ASSET_VAULT_LP_LEN,
        c::ASSET_VAULT_LP_OFF, state::ASSET_VAULT_LP_FLAG_BOUND, h + offset_of!(state::LpVaultRegistryV16, _reserved), j(&vs, h), j(&av, 0),
        c::ASSET_VAULT_LP_DRAW_OFF, size_of::<state::AssetVaultLpDrawV18>(), j(&dr, 0)));

    // ── resolved payout receipt (5544302a partial-receipt sweep): account offsets, by rustc ──
    out.push(format!(
        "\"portfolioReceipt\":{{\"closeProgressAccountOff\":{},\"receiptAccountOff\":{},\"receiptLen\":{},\"priorBoundContributionNum\":{},\"liveReleasedFaceAtReceipt\":{},\"terminalPositiveClaimFace\":{},\"paidEffective\":{},\"present\":{},\"finalized\":{}}}",
        c::HEADER_LEN + offset_of!(percolator::PortfolioAccountV16Account, close_progress),
        c::HEADER_LEN + offset_of!(percolator::PortfolioAccountV16Account, resolved_payout_receipt),
        size_of::<percolator::ResolvedPayoutReceiptV16Account>(),
        offset_of!(percolator::ResolvedPayoutReceiptV16Account, prior_bound_contribution_num),
        offset_of!(percolator::ResolvedPayoutReceiptV16Account, live_released_face_at_receipt),
        offset_of!(percolator::ResolvedPayoutReceiptV16Account, terminal_positive_claim_face),
        offset_of!(percolator::ResolvedPayoutReceiptV16Account, paid_effective),
        offset_of!(percolator::ResolvedPayoutReceiptV16Account, present),
        offset_of!(percolator::ResolvedPayoutReceiptV16Account, finalized)));

    // ── worse-of pricing inputs (ede691b6): engine AssetStateV16Account price fields, by rustc ──
    out.push(format!(
        "\"assetPriceOffsets\":{{\"rawOracleTargetPriceInAssetState\":{},\"effectivePriceInAssetState\":{},\"assetStateInEngineSlot\":{},\"posScale\":\"{}\"}}",
        offset_of!(percolator::AssetStateV16Account, raw_oracle_target_price),
        offset_of!(percolator::AssetStateV16Account, effective_price),
        offset_of!(percolator::EngineAssetSlotV16Account, asset),
        percolator::POS_SCALE));

    // ── per-asset account offset: plant a record where the SDK formula says, read it back with
    //    the program's own read_asset_vault_lp on a correctly-sized market buffer ──
    let cap = 4usize;
    let len = state::market_account_len_for_capacity(cap).unwrap();
    let mut rows = Vec::new();
    for i in 0..cap {
        let sdk_off = 592 + 758 + i * 2325 + 896; // V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + i*V17_MARKET_ASSET_SLOT_LEN + 896
        let mut data = vec![0u8; len];
        data[0..8].copy_from_slice(&c::MAGIC.to_le_bytes());
        data[8..10].copy_from_slice(&c::VERSION.to_le_bytes());
        data[10] = c::KIND_MARKET;
        let mut rec = AssetVaultLpV18::default();
        rec.vault_lp_portfolio = [0xA0 + i as u8; 32];
        rec.flags = state::ASSET_VAULT_LP_FLAG_BOUND;
        rec.lp_net_q = -1_234_567_890_123 - i as i128;
        rec.lev_cap_q = 40_000_000_000;
        rec.lp_net_slot = 505_580_400 + i as u64;
        rec.skew_slope_e9 = 2_000;
        rec.skew_max_e9 = 900;
        rec.lev_max_imr_bps = 5_000;
        rec.vault_lp_max_lev_bps = 20_000;
        rec.approved_matcher_program = [0x5a; 32];
        let bytes = bytemuck::bytes_of(&rec);
        data[sdk_off..sdk_off + bytes.len()].copy_from_slice(bytes);
        let back = state::read_asset_vault_lp(&data, i);
        rows.push(format!("{{\"asset\":{i},\"sdkOffset\":{sdk_off},\"programReadsSame\":{},\"recordHex\":\"{}\"}}",
            back.map(|b| b == rec).unwrap_or(false), hex(bytes)));
    }
    out.push(format!("\"assetVaultLpOffsets\":{{\"marketLenCap4\":{len},\"rows\":[{}]}}", rows.join(",")));

    // ── a valid VaultLpStateV18 account written by the program's own init ────
    let st = VaultLpStateV18 {
        market_group: [1; 32], registry: [2; 32], lp_portfolio: [3; 32], junior_owner: [4; 32],
        senior_claim_atoms: 123_456_789_012_345, junior_deposited_atoms: 50_000_000, junior_withdrawn_atoms: 7,
        senior_fee_credited_atoms: 999, recalled_atoms: 42, asset_index: 3, junior_floor_bps: 2_000,
        senior_fee_share_bps: c::VAULT_LP_SENIOR_FEE_SHARE_BPS, version: c::VAULT_LP_STATE_VERSION, bump: 254,
        ..Default::default()
    };
    let mut acct = vec![0u8; state::vault_lp_state_account_len()];
    state::init_vault_lp_state(&mut acct, &st).unwrap();
    out.push(format!("\"vaultLpStateAccountHex\":\"{}\"", hex(&acct)));

    println!("{{\"p3Sha\":\"58e379f1aa24f99de3b6625ef7e150ce80c93687\",{}}}", out.join(","));
}
