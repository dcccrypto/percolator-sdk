//! Differential fixture for sdk `src/abi/lev-guard-v22.ts` (job J-20261118-SDK-BUG-LEVGUARDV22WIREDIFF).
//! Usage: cargo run --example lev_guard_wire_fixture -- <seed> <out.json>
//! Every byte comes from the REAL program code: `Instruction::{encode,decode}`, `state::write_lev_guard`,
//! `state::read_lev_guard`, `lev_guard_v22::key_tag`.
use percolator_prog::{ix::Instruction, lev_guard_v22 as lg, state};

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        // splitmix64
        self.0 = self.0.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
    fn fill(&mut self, b: &mut [u8]) {
        for x in b.iter_mut() {
            *x = self.next() as u8;
        }
    }
    /// edge-biased u64
    fn u64e(&mut self) -> u64 {
        match self.below(8) {
            0 => 0,
            1 => u64::MAX,
            2 => 1,
            3 => self.below(1000),
            _ => self.next(),
        }
    }
    fn u16e(&mut self) -> u16 {
        match self.below(8) {
            0 => 0,
            1 => u16::MAX,
            2 => 10_000,
            3 => 10_001,
            _ => self.next() as u16,
        }
    }
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let seed: u64 = a[1].parse().unwrap();
    let out = &a[2];
    let mut r = Rng(seed);

    // ---- instructions: 5,000 valid wire forms + 500 undecodable ones ----
    let mut ixs = String::new();
    let n_ix = 5_000;
    for i in 0..n_ix {
        let op = (i % 7) as u8; // even coverage of every op
        let t0 = if op == 0 || op == 6 { r.u64e() } else { 0 };
        let mut key = [0u8; 32];
        if op == 1 {
            match r.below(4) {
                0 => {}
                _ => r.fill(&mut key),
            }
        }
        let mut report = [0u16; 4];
        if op == 2 {
            for x in report.iter_mut() {
                *x = r.u16e();
            }
        }
        let ix = Instruction::LevGuard { op, t0, key, report };
        let bytes = ix.encode();
        // the real decoder must round-trip its own encoding
        match Instruction::decode(&bytes) {
            Ok(Instruction::LevGuard { op: o2, t0: t2, key: k2, report: r2 }) => {
                assert!(o2 == op && t2 == t0 && k2 == key && r2 == report, "prog round trip");
            }
            _ => panic!("prog cannot decode its own encoding"),
        }
        if !ixs.is_empty() {
            ixs.push(',');
        }
        ixs.push_str(&format!(
            "{{\"hex\":\"{}\",\"op\":{},\"t0\":\"{}\",\"key\":\"{}\",\"report\":[{},{},{},{}],\"reportOk\":{}}}",
            hex(&bytes), op, t0, hex(&key), report[0], report[1], report[2], report[3],
            report[0] <= 10_000 && report[1] <= 10_000 && report[3] <= 10_000
        ));
    }
    // undecodable: unknown ops, truncated bodies
    let mut bad = String::new();
    for i in 0..500u64 {
        let mut v = vec![124u8];
        match i % 3 {
            0 => v.push((7 + r.below(249)) as u8),
            1 => {
                let op = [0u8, 1, 2, 6][r.below(4) as usize];
                v.push(op);
                let full = match op { 0 | 6 => 8, 1 => 32, _ => 8 };
                let mut body = vec![0u8; r.below(full as u64) as usize];
                r.fill(&mut body);
                v.extend(body);
            }
            _ => {}
        }
        if i % 3 == 2 {
            v.truncate(1); // tag only
        }
        let rej = Instruction::decode(&v).is_err();
        assert!(rej, "expected the prog to refuse {:?}", v);
        if !bad.is_empty() {
            bad.push(',');
        }
        bad.push_str(&format!("\"{}\"", hex(&v)));
    }

    // ---- records: 1,000 accounts through the real writer, 300 corrupted ----
    let mut recs = String::new();
    let n_rec = 1_300;
    for i in 0..n_rec {
        let mut g: lg::LevGuardV22 = bytemuck::Zeroable::zeroed();
        let mut raw = [0u8; 360];
        r.fill(&mut raw);
        g = *bytemuck::from_bytes(&raw);
        g.version = 1;
        g.flags &= lg::GUARD_FLAGS_KNOWN;
        if i % 4 == 0 {
            g.flags = [0, 1, 2, 4, 5, 6, 7, 3][r.below(8) as usize] ; // force every flag combo
        }
        g.round_active &= 1;
        g.round_lp_long &= 1;
        g._pad0 = 0;
        g._pad1 = [0; 2];
        g._pad2 = [0; 6];
        g._pad3 = [0; 4];
        g.touched_n = match r.below(50) { 0 => 256, 1 => 255, 2 | 3 | 4 => 0, _ => r.below(17) as u16 };
        g.round_keep_bps = (r.below(10_001)) as u16;
        g.rep_j_dump_bps = (r.below(10_001)) as u16;
        g.rep_m_ind_bps = (r.below(10_001)) as u16;
        g.rep_n_mult_bps = (r.below(10_001)) as u16;
        let mut acct = vec![0u8; state::lev_guard_account_len()];
        state::write_lev_guard(&mut acct, &g, true).expect("valid record writes");
        // touched set: random bytes
        {
            let t = state::lev_guard_touched_mut(&mut acct).unwrap();
            r.fill(t);
        }
        let mut corrupted = "";
        if i >= 1_000 {
            // corrupt one validated field to a value validate_guard must refuse
            let o = 16;
            match i % 10 {
                0 => { acct[o + 74] = 2; corrupted = "version"; }
                1 => { acct[o + 76] |= 8; corrupted = "flags-bit3"; }
                2 => { acct[o + 77] = 2; corrupted = "round_active"; }
                3 => { acct[o + 78] = 2; corrupted = "round_lp_long"; }
                4 => { acct[o + 100..o + 102].copy_from_slice(&257u16.to_le_bytes()); corrupted = "touched_n"; }
                5 => { acct[o + 98..o + 100].copy_from_slice(&10_001u16.to_le_bytes()); corrupted = "keep"; }
                6 => { acct[o + 80..o + 82].copy_from_slice(&10_001u16.to_le_bytes()); corrupted = "j_dump"; }
                7 => { acct[o + 79] = 1; corrupted = "pad0"; }
                8 => { acct[o + 163] = 1; corrupted = "pad2"; }
                _ => { acct[o + 349] = 1; corrupted = "pad3"; }
            }
        }
        let valid = state::read_lev_guard(&acct).is_ok();
        assert_eq!(valid, corrupted.is_empty(), "corruption {corrupted} must flip validity");
        if !recs.is_empty() {
            recs.push(',');
        }
        recs.push_str(&format!("{{\"hex\":\"{}\",\"valid\":{},\"corrupt\":\"{}\"}}", hex(&acct[..376 + 16 * (g.touched_n as usize)]), valid, corrupted));
    }

    // ---- keys ----
    let mut keys = String::new();
    for i in 0..2_000 {
        let mut k = [0u8; 32];
        match i % 8 {
            0 => {}
            1 => k = [0xff; 32],
            _ => r.fill(&mut k),
        }
        let t = lg::key_tag(&k);
        assert_eq!(&t[..], &k[..lg::KEY_TAG_LEN]);
        if !keys.is_empty() {
            keys.push(',');
        }
        keys.push_str(&format!("{{\"key\":\"{}\",\"tag\":\"{}\"}}", hex(&k), hex(&t)));
    }

    let json = format!(
        "{{\"seed\":{},\"progBranch\":\"feat/v22-rc23-2026-10-22\",\"recLen\":{},\"accountLen\":{},\"touchedLen\":{},\"keyTagLen\":{},\"touchedCap\":{},\"flagsKnown\":{},\"instructions\":[{}],\"undecodable\":[{}],\"accounts\":[{}],\"keys\":[{}]}}",
        seed, lg::LEV_GUARD_REC_LEN, state::lev_guard_account_len(), lg::LEV_GUARD_TOUCHED_LEN, lg::KEY_TAG_LEN, lg::W1_TOUCHED_CAP, lg::GUARD_FLAGS_KNOWN,
        ixs, bad, recs, keys
    );
    std::fs::write(out, json).unwrap();
    println!("wrote {} ({} bytes)", out, std::fs::metadata(out).unwrap().len());
}
