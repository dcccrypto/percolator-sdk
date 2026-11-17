pub const DEPTH_SRC_MAX_DECIMALS: u8 = 18; mod constants { pub const LOT_EXP_MAX: u8 = 15; }

/// `floor(sqrt(n))`, exact (Newton from a power-of-two over-estimate; at most ~8 iterations).
pub fn isqrt_u128(n: u128) -> u128 {
    if n < 2 {
        return n;
    }
    let bits = 128 - n.leading_zeros();
    let mut x: u128 = 1u128 << bits.div_ceil(2); // >= sqrt(n), <= 2^64
    loop {
        let y = (x + n / x) >> 1;
        if y >= x {
            return x;
        }
        x = y;
    }
}

/// `51 m^2 >= 50 r^2` evaluated exactly in u128 for every `m <= r <= u64::MAX`:
/// with `a = m^2`, `q = r^2`: true when `a >= q`, else `51a >= 50q  <=>  50(q - a) <= a
/// <=>  q - a <= floor(a / 50)`.
#[inline]
pub fn depth_pred(m: u64, r: u64) -> bool {
    let a = (m as u128) * (m as u128);
    let q = (r as u128) * (r as u128);
    if a >= q {
        return true;
    }
    q - a <= a / 50
}

/// The exact +2% depth of a constant-product pool from a reserve `r` valued in collateral atoms:
/// `floor(r * (1 - 1/sqrt(1.02))) = r - m`, `m` the smallest integer with `51 m^2 >= 50 r^2`.
/// Rounded DOWN (never overstated); full u64 width, no overflow, no float. Identical to the
/// keeper's `plus2PctDepthE6`.
pub fn plus2pct_depth_e6(r: u64) -> u64 {
    if r == 0 {
        return 0;
    }
    let q = (r as u128) * (r as u128);
    // floor(50 q / 51) = q - ceil(q / 51)
    let t = q - q.div_ceil(51);
    // m0 = floor(sqrt(t)): 51 m0^2 <= 50 q, and 51 (m0+1)^2 > 50 q, so m is m0 or m0 + 1.
    let m0 = isqrt_u128(t) as u64; // m0 < r
    let m = if depth_pred(m0, r) { m0 } else { m0 + 1 };
    r - m
}

/// Which side gives the reserve value (see the module doc).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ValuePath {
    /// The quote mint is the market's collateral mint: the quote reserve in atoms.
    QuoteIsCollateral,
    /// Otherwise: the base reserve at the market's per-lot mark.
    BaseAtMark,
}

/// The reserve value `R` in collateral atoms. `BaseAtMark`:
/// `floor(base_atoms * mark_e6 / 10^(base_decimals + lot_exp))`, capped at `u64::MAX` (a cap only
/// lowers the depth). `None` when the exponent is out of range (decimals > 18 or lot_exp > 15;
/// both refused earlier) or the mark is 0.
pub fn reserve_value_e6(
    path: ValuePath,
    base_atoms: u64,
    quote_atoms: u64,
    mark_e6: u64,
    base_decimals: u8,
    lot_exp: u8,
) -> Option<u64> {
    match path {
        ValuePath::QuoteIsCollateral => Some(quote_atoms),
        ValuePath::BaseAtMark => {
            if mark_e6 == 0
                || base_decimals > DEPTH_SRC_MAX_DECIMALS
                || lot_exp > constants::LOT_EXP_MAX
            {
                return None;
            }
            let e = base_decimals as u32 + lot_exp as u32; // <= 33
            let v = (base_atoms as u128) * (mark_e6 as u128) / 10u128.pow(e);
            Some(if v > u64::MAX as u128 { u64::MAX } else { v as u64 })
        }
    }
}

// ── PushAuthMark depth-mode decode ─────────────────────────────────────────────────────────

