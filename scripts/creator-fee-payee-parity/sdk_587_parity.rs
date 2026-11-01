//! prog#587 (#644) SDK parity oracle: tag 125 SetCreatorFeePayee, the tag 90 payee route, the payee PDA / record,
//! p4 bit 3, error 136 and the pure routing rules. Copy into a checkout of percolator-prog (feat/v22-rc23-2026-10-22,
//! engine sibling at ENGINE_CI_SIBLING) as `src/bin/sdk_587_parity.rs` (never commit it there) and run:
//!   npx tsx scripts/creator-fee-payee-parity/gen-vectors.ts > vectors.txt
//!   CARGO_BUILD_JOBS=3 cargo run --quiet --bin sdk_587_parity -- vectors.txt <prog sha> <engine sha> > creator-fee-payee-parity.json
//! Uses the REAL crate: `ix::Instruction::{decode, encode}`, `state::{derive_creator_fee_payee, write_creator_fee_payee,
//! read_creator_fee_payee, creator_fee_payee_account_len}`, `constants::*`, `PercolatorError as u32` and the pure rules of
//! `creator_fee_payee_v22`. Two derivations are private to the processor and are reproduced here VERBATIM from
//! `src/v16_program.rs` (`derive_vault_authority`, `canonical_vault_address`): they are marked below.
use percolator_prog::constants as c;
use percolator_prog::creator_fee_payee_v22 as p;
use percolator_prog::error::PercolatorError as E;
use percolator_prog::ix::Instruction as I;
use percolator_prog::state;
use solana_program::pubkey::Pubkey;

fn hex(x: &[u8]) -> String { x.iter().map(|v| format!("{v:02x}")).collect() }
fn unhex(s: &str) -> Vec<u8> { (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect() }

// VERBATIM from processor::derive_vault_authority (private).
fn derive_vault_authority(program_id: &Pubkey, market_key: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"vault", market_key.as_ref()], program_id)
}
// VERBATIM from processor::canonical_vault_address (private), incl. the ATA program constant.
const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey = solana_program::pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
fn canonical_vault_address(vault_authority: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[vault_authority.as_ref(), spl_token::ID.as_ref(), mint.as_ref()], &ASSOCIATED_TOKEN_PROGRAM_ID).0
}

fn decoded(ix: &I) -> Option<String> {
    Some(match ix {
        I::SetCreatorFeePayee { asset_index, market_id, payee, authority_epoch } => format!(
            "{{\"variant\":\"SetCreatorFeePayee\",\"tag\":{},\"assetIndex\":\"{asset_index}\",\"marketId\":\"{market_id}\",\"payeeHex\":\"{}\",\"authorityEpoch\":\"{authority_epoch}\"}}",
            c::TAG_SET_CREATOR_FEE_PAYEE, hex(payee)),
        I::WithdrawCreatorFee { amount, asset_index, authority_epoch } => format!(
            "{{\"variant\":\"WithdrawCreatorFee\",\"tag\":90,\"amount\":\"{amount}\",\"assetIndex\":\"{asset_index}\",\"authorityEpoch\":\"{authority_epoch}\"}}"),
        _ => return None,
    })
}

fn b(x: bool) -> &'static str { if x { "true" } else { "false" } }
fn route(r: p::ClaimRoute) -> &'static str {
    match r { p::ClaimRoute::AdminSigned => "AdminSigned", p::ClaimRoute::Payee => "Payee", p::ClaimRoute::Refused => "Refused" }
}

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args.next().expect("vectors.txt");
    let prog_sha = args.next().expect("prog sha");
    let engine_sha = args.next().expect("engine sha");
    let mut out: Vec<String> = vec![format!("\"prog\":\"{prog_sha}\""), format!("\"engine\":\"{engine_sha}\"")];

    // 1. instruction vectors: decode with the real decoder, re-encode with the real encoder.
    let mut vecs = Vec::new();
    for line in std::fs::read_to_string(&path).unwrap().lines().filter(|l| !l.trim().is_empty()) {
        let (id, h) = line.split_once(' ').unwrap();
        let bytes = unhex(h.trim());
        let dec = I::decode(&bytes);
        let rr = match &dec {
            Ok(ix) => decoded(ix).map(|d| format!("{{\"ok\":true,\"decoded\":{d}}}")).unwrap_or("{\"ok\":true,\"decoded\":null}".into()),
            Err(e) => format!("{{\"ok\":false,\"err\":\"{e:?}\"}}"),
        };
        let re = dec.ok().map(|ix| hex(&ix.encode())).unwrap_or_default();
        vecs.push(format!("\"{id}\":{{\"hex\":\"{}\",\"rust\":{rr},\"rustReencodedHex\":\"{re}\"}}", h.trim()));
    }
    out.push(format!("\"vectors\":{{{}}}", vecs.join(",")));

    // 2. constants.
    out.push(format!(
        "\"constants\":{{\"tag\":{},\"kind\":{},\"p4Flag\":{},\"p4FlagsIdx\":{},\"version\":{},\"bodyLen\":{},\"accountLen\":{},\"seed\":\"{}\",\"errorInvalid\":{},\"errorUnauthorized\":{},\"errorFeesOutstanding\":{}}}",
        c::TAG_SET_CREATOR_FEE_PAYEE, c::KIND_CREATOR_FEE_PAYEE, c::P4_FLAG_CREATOR_FEE_PAYEE, c::PROFILE_P4_FLAGS_IDX,
        p::CREATOR_FEE_PAYEE_VERSION, core::mem::size_of::<p::CreatorFeePayeeV22>(), state::creator_fee_payee_account_len(),
        String::from_utf8(p::CREATOR_FEE_PAYEE_SEED.to_vec()).unwrap(),
        E::CreatorFeePayeeInvalid as u32, E::Unauthorized as u32, E::CloseSlabFeesOutstanding as u32,
    ));

    // 2b. the fields `readCreatorFeeClaimStateV22` reads (rustc offset_of!, relative to their structs).
    use core::mem::offset_of;
    out.push(format!(
        "\"offsets\":{{\"profileAssetAdmin\":{},\"profileCreatorFeeClaimable\":{},\"profileP4Flags\":{},\"configCreatorFeeClaimable\":{},\"controlSequencesOff\":{},\"controlAuthorityEpoch\":{},\"headerLen\":{}}}",
        offset_of!(state::AssetOracleProfileV16, asset_admin), offset_of!(state::AssetOracleProfileV16, creator_fee_claimable_atoms),
        offset_of!(state::AssetOracleProfileV16, _padding0) + c::PROFILE_P4_FLAGS_IDX,
        offset_of!(state::WrapperConfigV16, creator_fee_claimable_atoms), c::ASSET_CONTROL_SEQUENCES_OFF,
        offset_of!(state::AssetControlSequencesV16, authority_epoch), c::HEADER_LEN,
    ));

    // 3. PDAs, vault authority, payee destination ATA.
    let program = Pubkey::new_from_array([7u8; 32]);
    let mut pdas = Vec::new();
    for mf in [9u8, 0xab] {
        let market = Pubkey::new_from_array([mf; 32]);
        let (va, vb) = derive_vault_authority(&program, &market);
        for idx in [0u16, 1, 255, 256, 65535] {
            let (pda, bump) = state::derive_creator_fee_payee(&program, &market, idx);
            pdas.push(format!("{{\"market\":\"{market}\",\"assetIndex\":{idx},\"pda\":\"{pda}\",\"bump\":{bump},\"vaultAuthority\":\"{va}\",\"vaultAuthorityBump\":{vb}}}"));
        }
    }
    out.push(format!("\"program\":\"{program}\""));
    out.push(format!("\"pdas\":[{}]", pdas.join(",")));
    let mut atas = Vec::new();
    for pf in [3u8, 0xfe] {
        let payee = Pubkey::new_from_array([pf; 32]);
        let mint = Pubkey::new_from_array([5u8; 32]);
        atas.push(format!("{{\"payee\":\"{payee}\",\"mint\":\"{mint}\",\"ata\":\"{}\"}}", canonical_vault_address(&payee, &mint)));
    }
    // A PDA (off-curve) payee: the vault authority of market 9 (the program refuses it as a payee at set time, but the
    // derivation itself must still agree for off-curve keys).
    let va9 = derive_vault_authority(&program, &Pubkey::new_from_array([9u8; 32])).0;
    let mint = Pubkey::new_from_array([5u8; 32]);
    atas.push(format!("{{\"payee\":\"{va9}\",\"mint\":\"{mint}\",\"ata\":\"{}\"}}", canonical_vault_address(&va9, &mint)));
    out.push(format!("\"atas\":[{}]", atas.join(",")));

    // 4. records: the real writer's bytes, and the real reader's verdict on mutations.
    let len = state::creator_fee_payee_account_len();
    let market = Pubkey::new_from_array([9u8; 32]);
    let (_, bump) = state::derive_creator_fee_payee(&program, &market, 258);
    let rec = state::CreatorFeePayeeV22 {
        market: market.to_bytes(), payee: [0xcdu8; 32], asset_index: 258, version: p::CREATOR_FEE_PAYEE_VERSION, bump, _reserved: [0u8; 4],
    };
    let mut good = vec![0u8; len];
    state::write_creator_fee_payee(&mut good, &rec, true).expect("writer");
    let mut cases: Vec<(&str, Vec<u8>)> = vec![("good", good.clone())];
    let mut m = good.clone(); m[16 + 66] = 2; cases.push(("badVersion", m));
    let mut m = good.clone(); for x in &mut m[16 + 32..16 + 64] { *x = 0; } cases.push(("zeroPayee", m));
    let mut m = good.clone(); for x in &mut m[16..16 + 32] { *x = 0; } cases.push(("zeroMarket", m));
    let mut m = good.clone(); m[16 + 70] = 1; cases.push(("reservedNonZero", m));
    let mut m = good.clone(); m[10] = c::KIND_CREATOR_FEE_PAYEE + 1; cases.push(("wrongKind", m));
    let mut m = good.clone(); m.push(0); cases.push(("long", m));
    let mut m = good.clone(); m.pop(); cases.push(("short", m));
    let mut m = good.clone(); m[0] ^= 1; cases.push(("badMagic", m));
    let mut recs = Vec::new();
    for (id, data) in &cases {
        let r = state::read_creator_fee_payee(data);
        let body = match r {
            Ok(r) => format!(
                "\"ok\":true,\"market\":\"{}\",\"payee\":\"{}\",\"assetIndex\":{},\"version\":{},\"bump\":{}",
                Pubkey::new_from_array(r.market), Pubkey::new_from_array(r.payee), r.asset_index, r.version, r.bump),
            Err(e) => format!("\"ok\":false,\"err\":\"{e:?}\""),
        };
        recs.push(format!("\"{id}\":{{\"hex\":\"{}\",{body}}}", hex(data)));
    }
    out.push(format!("\"records\":{{{}}}", recs.join(",")));

    // 5. pure rules.
    let z = [0u8; 32];
    let a = [1u8; 32];
    let s2 = [2u8; 32];
    let pa = [3u8; 32];
    let pb = [4u8; 32];
    let va = [5u8; 32];
    let mut rules = Vec::new();
    for (admin, flag) in [(z, false), (z, true), (a, false), (a, true)] {
        rules.push(format!("{{\"fn\":\"claim_route\",\"admin\":\"{}\",\"flag\":{},\"out\":\"{}\"}}", hex(&admin), b(flag), route(p::claim_route(&admin, flag))));
        for pot in [0u64, 1, u64::MAX] {
            rules.push(format!("{{\"fn\":\"creator_pot_orphaned\",\"admin\":\"{}\",\"flag\":{},\"pot\":\"{pot}\",\"out\":{}}}", hex(&admin), b(flag), b(p::creator_pot_orphaned(&admin, flag, pot))));
        }
    }
    for f in [0u8, 1, 4, 8, 0x0f, 0xf7, 0xff] {
        rules.push(format!("{{\"fn\":\"has_payee_bit\",\"p4\":{f},\"out\":{}}}", b(p::has_payee_bit(f))));
        rules.push(format!("{{\"fn\":\"with_payee_bit\",\"p4\":{f},\"on\":true,\"out\":{}}}", p::with_payee_bit(f, true)));
        rules.push(format!("{{\"fn\":\"with_payee_bit\",\"p4\":{f},\"on\":false,\"out\":{}}}", p::with_payee_bit(f, false)));
    }
    let cur_opts: [Option<[u8; 32]>; 3] = [None, Some(pa), Some(pb)];
    for admin in [z, a] {
        for signer in [a, s2] {
            for cur in cur_opts.iter() {
                for newp in [z, pa, pb, va] {
                    let out = p::payee_update_allowed(&admin, &signer, cur.as_ref(), &newp, &va);
                    rules.push(format!(
                        "{{\"fn\":\"payee_update_allowed\",\"admin\":\"{}\",\"signer\":\"{}\",\"current\":{},\"new\":\"{}\",\"vaultAuthority\":\"{}\",\"out\":{}}}",
                        hex(&admin), hex(&signer), cur.map(|k| format!("\"{}\"", hex(&k))).unwrap_or("null".into()), hex(&newp), hex(&va), b(out)));
                }
            }
        }
    }
    out.push(format!("\"rules\":[{}]", rules.join(",")));
    println!("{{{}}}", out.join(","));
}
