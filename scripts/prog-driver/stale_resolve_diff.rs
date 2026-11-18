//! Scratch differential driver (J-20261118-SDK-TEST-STALERESOLVEDIFF): runs tag 39 on the real BPF for a list of cases.
//! STALE_BASE_OUT=<path>  : write the base market bytes and stop.
//! STALE_CASES=<in.json> STALE_RESULTS=<out.json> : for every case apply its byte diffs to the base market, warp the Clock
//! to `cluster`, send ResolveStalePermissionless with a unique wire now_slot, record "ok" or the Custom code.
mod indep_harness;
use indep_harness::*;
use percolator_prog::ix::Instruction as ProgInstruction;
use solana_sdk::instruction::AccountMeta;

fn hex_to_bytes(h: &str) -> Vec<u8> {
    (0..h.len() / 2).map(|i| u8::from_str_radix(&h[i * 2..i * 2 + 2], 16).unwrap()).collect()
}

#[test]
fn stale_resolve_real_path() {
    let mut env = V16CuEnv::new();
    let acct = env.svm.get_account(&env.market).unwrap();
    if let Ok(p) = std::env::var("STALE_BASE_OUT") {
        std::fs::write(p, &acct.data).unwrap();
        return;
    }
    let (Ok(cin), Ok(cout)) = (std::env::var("STALE_CASES"), std::env::var("STALE_RESULTS")) else { return };
    let cases: serde_json::Value = serde_json::from_slice(&std::fs::read(cin).unwrap()).unwrap();
    let mut out = Vec::new();
    let mut counter: u64 = 1;
    for c in cases.as_array().unwrap() {
        let mut a = acct.clone();
        for d in c["diffs"].as_array().unwrap() {
            let off = d[0].as_u64().unwrap() as usize;
            let b = hex_to_bytes(d[1].as_str().unwrap());
            a.data[off..off + b.len()].copy_from_slice(&b);
        }
        env.svm.set_account(env.market, a).unwrap();
        let cluster: u64 = c["cluster"].as_str().unwrap().parse().unwrap();
        env.svm.warp_to_slot(cluster);
        env.svm.expire_blockhash();
        counter += 1;
        let m = env.market;
        let r = env.send(ProgInstruction::ResolveStalePermissionless { now_slot: counter }, vec![AccountMeta::new(m, false)], &[]);
        let s = match r {
            Ok(_) => "ok".to_string(),
            Err(e) => match custom_code(&e) {
                Some(k) => k.to_string(),
                None => format!("ERR:{}", e.chars().take(120).collect::<String>()),
            },
        };
        out.push(serde_json::Value::String(s));
    }
    std::fs::write(cout, serde_json::to_vec(&out).unwrap()).unwrap();
}
