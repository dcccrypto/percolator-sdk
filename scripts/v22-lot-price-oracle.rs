// Differential oracle for src/abi/v22-lot.ts pythPriceToLotE6V22.
// Logic copied VERBATIM (single-leg, unit_scale 1, invert 0) from percolator-prog
// origin/feat/v22-rc23-2026-10-22 src/v16_program.rs:
//   read_pyth_price_e12   :12579-12630 (scale = expo+12; checked_mul / truncating div; leg_e12_in_range)
//   leg_e12_in_range      :12550-12552
//   compose_price_e12_to_e6 :12882-12945 (num*10^lot / (1e6*unit_scale), floor once, 0 / > MAX => OracleInvalid)
//   MAX_EXPO_ABS = 18     :12440 ; MAX_ORACLE_PRICE = 1e12 (engine; kani shim lib.rs:3); LOT_EXP_MAX = 15
// U256 in the prog is replaced by u128 with checked ops: for one leg the numerator is <= 1e18 * 1e15 = 1e33 < 2^128.
//
// Build/run:  rustc -O scripts/v22-lot-price-oracle.rs -o /tmp/v22lot && /tmp/v22lot > test/fixtures/v22-lot-price-prog.txt
// Output line: "<price> <expo> <lotExp> <ok:value | err:kind>"
const MAX_ORACLE_PRICE: u128 = 1_000_000_000_000;
const LEG_E12_PER_E6: u128 = 1_000_000;
const MAX_EXPO_ABS: i32 = 18;
const LOT_EXP_MAX: u8 = 15;

fn leg_e12_in_range(out: u128) -> bool {
    out != 0 && out / LEG_E12_PER_E6 <= MAX_ORACLE_PRICE
}

fn run(price: i64, exponent: i32, lot_exp: u8) -> Result<u64, &'static str> {
    // read_pyth_price_e12
    if price <= 0 || exponent < -MAX_EXPO_ABS || exponent > MAX_EXPO_ABS {
        return Err("OracleInvalid");
    }
    let price_u = price as u128;
    let scale = exponent + 12;
    let out = if scale >= 0 {
        price_u
            .checked_mul(10u128.pow(scale as u32))
            .ok_or("EngineArithmeticOverflow")?
    } else {
        price_u / 10u128.pow((-scale) as u32)
    };
    if !leg_e12_in_range(out) {
        return Err("OracleInvalid");
    }
    // compose_price_e12_to_e6 (one leg)
    if lot_exp > LOT_EXP_MAX {
        return Err("EngineInvalidConfig");
    }
    let numerator = out
        .checked_mul(10u128.pow(lot_exp as u32))
        .ok_or("EngineArithmeticOverflow")?;
    let denominator = LEG_E12_PER_E6 * 1u128;
    let p = numerator / denominator;
    if p != 0 && p <= MAX_ORACLE_PRICE {
        Ok(p as u64)
    } else {
        Err("OracleInvalid")
    }
}

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
}

fn emit(price: i64, expo: i32, lot: u8) {
    match run(price, expo, lot) {
        Ok(v) => println!("{} {} {} ok:{}", price, expo, lot, v),
        Err(k) => println!("{} {} {} err:{}", price, expo, lot, k),
    }
}

fn main() {
    // edges
    let edge_prices: [i64; 9] = [1, 2, 9, 999_999, 1_000_000, 1_000_001, 3_000, i64::MAX, 12_345];
    for &p in edge_prices.iter() {
        for e in -18..=18 {
            for l in 0..=15u8 {
                emit(p, e, l);
            }
        }
    }
    // 20,000 random: log-uniform magnitude so every scale regime is hit
    let mut r = Rng(0x5eed_1234_abcd_0001);
    for _ in 0..20_000 {
        let bits = 1 + (r.next() % 63) as u32; // 1..=63 bits
        let mut p = (r.next() >> (64 - bits)) as i64;
        if p == 0 {
            p = 1;
        }
        let expo = -14 + (r.next() % 17) as i32; // -14..=2: includes finer-than-1e-12 and positive
        let lot = (r.next() % 16) as u8;
        emit(p, expo, lot);
    }
}
