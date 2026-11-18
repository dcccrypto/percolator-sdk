mod ref_;
use ref_::*;

struct R(u64);
impl R {
    fn n(&mut self) -> u64 { self.0 ^= self.0 << 13; self.0 ^= self.0 >> 7; self.0 ^= self.0 << 17; self.0 }
    fn u128(&mut self) -> u128 { ((self.n() as u128) << 64) | self.n() as u128 }
    // mixed magnitudes: edge values, small, log-uniform
    fn mag64(&mut self) -> u64 {
        match self.n() % 6 { 0 => 0, 1 => u64::MAX - (self.n() % 3), 2 => self.n() % 100, _ => self.n() >> (self.n() % 64) }
    }
    fn mag128(&mut self) -> u128 {
        match self.n() % 6 { 0 => 0, 1 => u128::MAX - (self.n() % 3) as u128, 2 => (self.n() % 100) as u128, _ => self.u128() >> (self.n() % 128) }
    }
    fn peak(&mut self) -> u32 {
        match self.n() % 5 { 0 => u32::MAX, 1 => u32::MAX - (self.n() % 4) as u32, 2 => (self.n() % 50) as u32, _ => (self.n() as u32) >> (self.n() % 32) }
    }
    fn elapsed(&mut self) -> u64 {
        let hl = BURST_HALF_LIFE_SLOTS;
        match self.n() % 6 {
            0 => 0,
            1 => hl * (30 + self.n() % 5) + self.n() % hl, // 30..34 half-lives incl 31/32 boundary
            2 => hl * (self.n() % 36),
            3 => hl * (self.n() % 36) + hl - 1,
            4 => self.n() >> (self.n() % 64),
            _ => self.n() % (hl * 34),
        }
    }
}
fn band(i: u64) -> AgeBand { match i % 5 { 0 => AgeBand::NoOpen, 1 => AgeBand::Day, 2 => AgeBand::Week, 3 => AgeBand::Month, _ => AgeBand::Mature } }

fn main() {
    let n: usize = std::env::args().nth(1).map(|s| s.parse().unwrap()).unwrap_or(50_000);
    let mut r = R(0x9E3779B97F4A7C15);
    for _ in 0..n { let p = r.peak(); let e = r.elapsed(); println!("decay {} {} {}", p, e, burst_decay(p, e)); }
    for _ in 0..n {
        let p = r.peak(); let ps = r.elapsed() % (1 << 40); let v = r.peak();
        let now = if r.n() % 4 == 0 { ps.saturating_sub(r.n() % 1000) } else { ps.saturating_add(r.elapsed() % (1 << 40)) };
        let (a, b) = burst_update(p, ps, v, now); println!("update {} {} {} {} {} {}", p, ps, v, now, a, b);
    }
    for _ in 0..n {
        let p = r.peak(); let ps = r.elapsed() % (1 << 40); let v = r.peak();
        let now = if r.n() % 4 == 0 { ps.saturating_sub(r.n() % 1000) } else { ps.saturating_add(r.elapsed() % (1 << 40)) };
        println!("vareff {} {} {} {} {}", p, ps, v, now, burst_var_eff(p, ps, v, now));
    }
    for _ in 0..n {
        let long = r.mag128(); let cm = r.mag128(); let mmr = r.mag64(); let b = r.n(); let m = (r.n() % 70000) as u16;
        println!("shortcap {} {} {} {} {} {}", long, cm, mmr, b % 5, m, short_users_cap_notional(long, cm, mmr, band(b), m));
    }
    for _ in 0..n {
        let mmr = r.mag64(); let s = if r.n() % 5 == 0 { None } else { Some(r.mag64()) }; let j = (r.n() % 70000) as u16;
        let j = if r.n() % 3 == 0 { 0 } else { j };
        println!("ltrader {} {} {} {}", mmr, s.map(|x| x as i128).unwrap_or(-1), j, l_trader_x100(mmr, s, j));
    }
    for _ in 0..n {
        let ex = r.n() as u16; let lt = r.n() as u16; let lc = if r.n() % 3 == 0 { 0xffff } else { r.n() as u16 };
        let mo = r.n() % 2 == 0; let fz = if r.n() % 2 == 0 { None } else { Some(r.n() as u16) }; let le = r.n() as u16;
        println!("loverlay {} {} {} {} {} {} {}", ex, lt, lc, mo as u8, fz.map(|x| x as i32).unwrap_or(-1), le, l_overlay_x100(ex, lt, lc, mo, fz, le));
    }
    for _ in 0..n {
        let cap = r.mag128() >> (r.n() % 40); let b = r.n(); let m = (r.n() % 70000) as u16; let fl = r.mag128() >> (r.n() % 60);
        let fz: Option<u128> = if r.n() % 2 == 0 { None } else { Some(r.mag128() >> (r.n() % 60)) };
        println!("noverlay {} {} {} {} {} {}", cap, b % 5, m, fl, fz.map(|x| x.to_string()).unwrap_or("-1".into()), n_overlay_q(cap, band(b), m, fl, fz));
    }
}
