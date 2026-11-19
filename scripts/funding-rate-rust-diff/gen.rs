// Generator for test/fixtures/funding-rate-rust-diff/table.json
// Run: rustc --edition 2021 -O gen.rs -o /tmp/gen && /tmp/gen > table.json
//
// Functions below are COPIED VERBATIM from percolator-prog branch feat/v22-rc23-2026-10-22
// commit d27f3d73b1a704bc398cdd27f400c12bd421e562:
//   premium_funding_rate_e9  src/v16_program.rs:13129-13147 (policy_v16)
//   skew_funding_rate_e9     src/vault_lp_v18.rs:272-297
//   combine_funding_rate_e9  src/vault_lp_v18.rs:301-312
// FUNDING_DEN = 1_000_000_000 (percolator engine src/lib.rs:19).

const FUNDING_DEN: u128 = 1_000_000_000;

fn premium_funding_rate_e9(mark_e6: u64, index_e6: u64, max_abs_rate_e9: u64) -> Option<i128> {
    if max_abs_rate_e9 == 0 || mark_e6 == 0 || index_e6 == 0 || mark_e6 == index_e6 {
        return Some(0);
    }
    let premium_e9 = (mark_e6.abs_diff(index_e6) as u128).checked_mul(FUNDING_DEN)? / index_e6 as u128;
    let bounded = core::cmp::min(premium_e9, max_abs_rate_e9 as u128);
    let signed = i128::try_from(bounded).ok()?;
    if mark_e6 > index_e6 {
        Some(signed)
    } else {
        Some(-signed)
    }
}

pub fn skew_funding_rate_e9(lp_net_q: i128, oi_side_q: u128, slope_e9: u64, max_e9: u64) -> i128 {
    if slope_e9 == 0 || max_e9 == 0 || lp_net_q == 0 || oi_side_q == 0 {
        return 0;
    }
    let abs = lp_net_q.unsigned_abs();
    let share_num = if abs > oi_side_q { oi_side_q } else { abs };
    let mag = match (slope_e9 as u128).checked_mul(share_num) {
        Some(p) => p / oi_side_q,
        None => return 0,
    };
    let capped = if mag > max_e9 as u128 { max_e9 as u128 } else { mag };
    let signed = capped as i128;
    if lp_net_q < 0 {
        signed
    } else {
        -signed
    }
}

pub fn combine_funding_rate_e9(premium_e9: i128, skew_e9: i128, max_abs_e9: u64) -> i128 {
    let max = max_abs_e9 as i128;
    let sum = premium_e9.saturating_add(skew_e9);
    if sum > max {
        max
    } else if sum < -max {
        -max
    } else {
        sum
    }
}

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn u128(&mut self) -> u128 {
        ((self.next() as u128) << 64) | self.next() as u128
    }
    fn pick(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

const U64_B: [u64; 9] = [0, 1, 2, 999_999, 1_000_000, 1_000_000_000, u64::MAX / 2, u64::MAX - 1, u64::MAX];
const I128_B: [i128; 9] = [0, 1, -1, 100_000_000_000_000, -100_000_000_000_000, i128::MAX, i128::MIN, i128::MIN + 1, u64::MAX as i128];
const U128_B: [u128; 9] = [0, 1, 1_000, 100_000_000_000_000, 100_000_000_000_001, u64::MAX as u128, (u64::MAX as u128) + 1, u128::MAX / 2, u128::MAX];

fn u64_any(r: &mut Rng) -> u64 {
    match r.pick(4) {
        0 => U64_B[r.pick(U64_B.len())],
        1 => r.next() >> (r.next() % 64),
        2 => r.next() % 10_000_000, // realistic e6 prices
        _ => r.next(),
    }
}
fn i128_any(r: &mut Rng) -> i128 {
    match r.pick(4) {
        0 => I128_B[r.pick(I128_B.len())],
        1 => (r.u128() >> (r.next() % 128)) as i128 * if r.next() & 1 == 0 { 1 } else { -1 },
        2 => (r.next() % 200_000_000_000_000) as i128 - 100_000_000_000_000,
        _ => r.u128() as i128,
    }
}
fn u128_any(r: &mut Rng) -> u128 {
    match r.pick(4) {
        0 => U128_B[r.pick(U128_B.len())],
        1 => r.u128() >> (r.next() % 128),
        2 => (r.next() % 100_000_000_000_000) as u128 + 1,
        _ => r.u128(),
    }
}

fn main() {
    let mut r = Rng(0x9E37_79B9_7F4A_7C15);
    let mut out = String::new();
    out.push_str("{\n\"prog_commit\":\"d27f3d73b1a704bc398cdd27f400c12bd421e562\",\n");
    out.push_str("\"premium\":[\n");
    let n = 8000;
    for i in 0..n {
        let (mut m, mut x, c) = (u64_any(&mut r), u64_any(&mut r), u64_any(&mut r));
        if i % 7 == 0 {
            x = m; // mark == index
        } else if i % 11 == 0 {
            m = x.wrapping_add(r.next() % 1000); // near-equal
        }
        let res = premium_funding_rate_e9(m, x, c);
        let rs = match res { Some(v) => format!("\"{}\"", v), None => "null".to_string() };
        out.push_str(&format!("[\"{}\",\"{}\",\"{}\",{}]{}\n", m, x, c, rs, if i + 1 < n { "," } else { "" }));
    }
    out.push_str("],\n\"skew\":[\n");
    let n = 8000;
    for i in 0..n {
        let lp = i128_any(&mut r);
        let mut oi = u128_any(&mut r);
        if i % 5 == 0 {
            oi = lp.unsigned_abs().max(1); // exactly balanced
        }
        let (s, m) = (u64_any(&mut r), u64_any(&mut r));
        let v = skew_funding_rate_e9(lp, oi, s, m);
        out.push_str(&format!("[\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"]{}\n", lp, oi, s, m, v, if i + 1 < n { "," } else { "" }));
    }
    out.push_str("],\n\"combine\":[\n");
    let n = 6000;
    for i in 0..n {
        let (p, s, m) = (i128_any(&mut r), i128_any(&mut r), u64_any(&mut r));
        let v = combine_funding_rate_e9(p, s, m);
        out.push_str(&format!("[\"{}\",\"{}\",\"{}\",\"{}\"]{}\n", p, s, m, v, if i + 1 < n { "," } else { "" }));
    }
    out.push_str("]\n}\n");
    print!("{}", out);
}
