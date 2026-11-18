/**
 * Coin-margined perpetual trade math utilities.
 *
 * On-chain PnL formula:
 *   mark_pnl = (oracle - entry) * abs_pos / oracle   (longs)
 *   mark_pnl = (entry - oracle) * abs_pos / oracle   (shorts)
 *
 * All prices are in e6 format (1 USD = 1_000_000).
 * All token amounts are in native units (e.g. lamports).
 */

/**
 * Compute mark-to-market PnL for an open position.
 */
export function computeMarkPnl(
  positionSize: bigint,
  entryPrice: bigint,
  oraclePrice: bigint,
): bigint {
  if (positionSize === 0n || oraclePrice === 0n) return 0n;
  const absPos = positionSize < 0n ? -positionSize : positionSize;
  const diff =
    positionSize > 0n
      ? oraclePrice - entryPrice
      : entryPrice - oraclePrice;
  return (diff * absPos) / oraclePrice;
}

/**
 * Compute liquidation price given entry, capital, position and maintenance margin.
 * Uses pure BigInt arithmetic for precision (no Number() truncation).
 */
export function computeLiqPrice(
  entryPrice: bigint,
  capital: bigint,
  positionSize: bigint,
  maintenanceMarginBps: bigint,
): bigint {
  if (positionSize === 0n || entryPrice === 0n) return 0n;
  const absPos = positionSize < 0n ? -positionSize : positionSize;
  // capitalPerUnit scaled by 1e6 for precision
  const capitalPerUnitE6 = (capital * 1_000_000n) / absPos;

  // v22 engine: equity = capital + q * (P - entry); liquidatable when
  // equity < maint * q * P. Solving for P (per-unit c = capital / q):
  //   long:  P = (entry - c) / (1 - maint)
  //   short: P = (entry + c) / (1 + maint)
  if (positionSize > 0n) {
    // With >= 100% maintenance margin a long is liquidatable at any price.
    if (maintenanceMarginBps >= 10000n) {
      return entryPrice > capitalPerUnitE6 ? 18446744073709551615n : 0n;
    }
    // Single division on the exact numerator: pre-truncating capital/q to an
    // integer e6 price loses up to 1/(1-maint) price units at high maintenance.
    const num = entryPrice * absPos - capital * 1_000_000n;
    if (num <= 0n) return 0n;
    return (num * 10000n) / (absPos * (10000n - maintenanceMarginBps));
  }
  const shortLiq =
    ((entryPrice * absPos + capital * 1_000_000n) * 10000n) / (absPos * (10000n + maintenanceMarginBps));
  return shortLiq > 0n ? shortLiq : 0n;
}

/**
 * Compute estimated liquidation price BEFORE opening a trade.
 * Accounts for trading fees reducing effective capital.
 */
export function computePreTradeLiqPrice(
  oracleE6: bigint,
  margin: bigint,
  posSize: bigint,
  maintBps: bigint,
  feeBps: bigint,
  direction: "long" | "short",
): bigint {
  if (oracleE6 === 0n || margin === 0n || posSize === 0n) return 0n;
  const absPos = posSize < 0n ? -posSize : posSize;
  const signedPos = direction === "long" ? absPos : -absPos;
  // Fee adjusts the effective entry price, not the capital.
  // For longs: you pay more (oracle + fee) → worse entry → closer liquidation.
  // For shorts: you receive less (oracle - fee) → worse entry → closer liquidation.
  const feeAdjust = (oracleE6 * feeBps) / 10000n;
  let adjustedEntry: bigint;
  if (direction === "long") {
    adjustedEntry = oracleE6 + feeAdjust;
  } else {
    // Clamp short entry to 1n — a zero or negative entry price is nonsensical
    // and causes computeLiqPrice to return 0n ("no liquidation risk") when
    // feeBps >= 10000, misleading the UI into showing the position is safe.
    const shortEntry = oracleE6 - feeAdjust;
    adjustedEntry = shortEntry > 0n ? shortEntry : 1n;
  }
  return computeLiqPrice(adjustedEntry, margin, signedPos, maintBps);
}

/**
 * Compute trading fee from notional value and fee rate in bps.
 */
export function computeTradingFee(
  notional: bigint,
  tradingFeeBps: bigint,
): bigint {
  // Ceiling per side, as the program's two_sided_trade_fee_paid_cap does.
  if (notional <= 0n || tradingFeeBps <= 0n) return 0n;
  return (notional * tradingFeeBps + 9999n) / 10000n;
}

/**
 * Dynamic fee tier configuration.
 */
export interface FeeTierConfig {
  /** Base trading fee (Tier 1) in bps */
  baseBps: bigint;
  /** Tier 2 fee in bps (0 = disabled) */
  tier2Bps: bigint;
  /** Tier 3 fee in bps (0 = disabled) */
  tier3Bps: bigint;
  /** Notional threshold to enter Tier 2 (0 = tiered fees disabled) */
  tier2Threshold: bigint;
  /** Notional threshold to enter Tier 3 */
  tier3Threshold: bigint;
}

/**
 * Compute the effective fee rate in bps using the tiered fee schedule.
 *
 * Mirrors on-chain `compute_dynamic_fee_bps` logic:
 * - notional < tier2Threshold → baseBps (Tier 1)
 * - notional < tier3Threshold → tier2Bps (Tier 2)
 * - notional >= tier3Threshold → tier3Bps (Tier 3)
 *
 * If tier2Threshold == 0, tiered fees are disabled (flat baseBps).
 */
export function computeDynamicFeeBps(
  notional: bigint,
  config: FeeTierConfig,
): bigint {
  if (config.tier2Threshold === 0n) return config.baseBps;
  // A tier with 0 bps is disabled and inherits the tier below it.
  const tier2 = config.tier2Bps === 0n ? config.baseBps : config.tier2Bps;
  const tier3 = config.tier3Bps === 0n ? tier2 : config.tier3Bps;
  if (config.tier3Threshold > 0n && notional >= config.tier3Threshold) return tier3;
  if (notional >= config.tier2Threshold) return tier2;
  return config.baseBps;
}

/**
 * Compute the dynamic trading fee for a given notional and tier config.
 *
 * Uses ceiling division to match on-chain behavior (prevents fee evasion
 * via micro-trades).
 */
export function computeDynamicTradingFee(
  notional: bigint,
  config: FeeTierConfig,
): bigint {
  const feeBps = computeDynamicFeeBps(notional, config);
  if (notional <= 0n || feeBps <= 0n) return 0n;
  return (notional * feeBps + 9999n) / 10000n;
}

/**
 * Fee split configuration.
 */
export interface FeeSplitConfig {
  /** LP vault share in bps (0–10_000) */
  lpBps: bigint;
  /** Protocol treasury share in bps */
  protocolBps: bigint;
  /** Market creator share in bps */
  creatorBps: bigint;
}

/**
 * Compute fee split for a total fee amount.
 *
 * Returns [lpShare, protocolShare, creatorShare].
 * If all split params are 0, 100% goes to LP (legacy behavior).
 * Creator gets the rounding remainder to ensure total is preserved.
 */
export function computeFeeSplit(
  totalFee: bigint,
  config: FeeSplitConfig,
): [bigint, bigint, bigint] {
  if (config.lpBps === 0n && config.protocolBps === 0n && config.creatorBps === 0n) {
    return [totalFee, 0n, 0n];
  }
  const totalBps = config.lpBps + config.protocolBps + config.creatorBps;
  if (config.lpBps < 0n || config.protocolBps < 0n || config.creatorBps < 0n) {
    throw new Error("computeFeeSplit: bps values must be non-negative");
  }
  if (totalBps !== 10000n) {
    throw new Error(`computeFeeSplit: bps values must sum to 10000, got ${totalBps}`);
  }

  const lp = (totalFee * config.lpBps) / 10000n;
  const protocol = (totalFee * config.protocolBps) / 10000n;
  const creator = totalFee - lp - protocol;
  return [lp, protocol, creator];
}

/**
 * Compute PnL as a percentage of capital.
 *
 * Uses BigInt scaling to avoid precision loss from Number(bigint) conversion.
 * Number(bigint) silently truncates values above 2^53, which can produce
 * incorrect percentages for large positions (e.g., tokens with 9 decimals
 * where capital > ~9M tokens in native units exceeds MAX_SAFE_INTEGER).
 */
export function computePnlPercent(
  pnlTokens: bigint,
  capital: bigint,
): number {
  if (capital === 0n) return 0;
  const scaledPct = (pnlTokens * 10_000n) / capital;
  // Clamp rather than throw: values outside MAX_SAFE_INTEGER represent effectively
  // infinite gain/loss for display purposes; returning a clamped sentinel prevents
  // unhandled exceptions from crashing the UI on large positions.
  const MAX_DISPLAY = BigInt(Number.MAX_SAFE_INTEGER);
  if (scaledPct > MAX_DISPLAY) return Number.MAX_SAFE_INTEGER / 100;
  if (scaledPct < -MAX_DISPLAY) return -(Number.MAX_SAFE_INTEGER / 100);
  return Number(scaledPct) / 100;
}

/**
 * Estimate entry price including fee impact (slippage approximation).
 */
export function computeEstimatedEntryPrice(
  oracleE6: bigint,
  tradingFeeBps: bigint,
  direction: "long" | "short",
): bigint {
  if (oracleE6 === 0n) return 0n;
  const feeImpact = (oracleE6 * tradingFeeBps) / 10000n;
  if (direction === "long") return oracleE6 + feeImpact;
  // Clamp to 1 to prevent underflow — a zero or negative entry price is nonsensical
  // and would cause computePreTradeLiqPrice to report "no liquidation risk" (liqPrice=0)
  // when fee >= 100%, misleading the UI.
  const shortEntry = oracleE6 - feeImpact;
  return shortEntry > 0n ? shortEntry : 1n;
}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(-Number.MAX_SAFE_INTEGER);

/**
 * Convert per-slot funding rate (bps) to annualized percentage.
 */
export function computeFundingRateAnnualized(
  fundingRateBpsPerSlot: bigint,
): number {
  // Clamp rather than throw: extreme funding rates are display-only values;
  // returning +/-Infinity is correct JS behaviour and prevents uncaught exceptions.
  if (fundingRateBpsPerSlot > MAX_SAFE_BIGINT) return Infinity;
  if (fundingRateBpsPerSlot < MIN_SAFE_BIGINT) return -Infinity;
  const bpsPerSlot = Number(fundingRateBpsPerSlot);
  const slotsPerYear = 2.5 * 60 * 60 * 24 * 365; // ~400ms slots
  return (bpsPerSlot * slotsPerYear) / 100;
}

/**
 * Compute margin required for a given notional and initial margin bps.
 */
export function computeRequiredMargin(
  notional: bigint,
  initialMarginBps: bigint,
): bigint {
  return (notional * initialMarginBps) / 10000n;
}

/**
 * Compute maximum leverage from initial margin bps, as an exact ratio.
 *
 * DISPLAY value: the result is fractional and therefore NOT safe to pass to
 * `BigInt()`. Any caller doing integer/native-unit arithmetic must use
 * {@link computeMaxLeverageFloor} instead.
 *
 * @throws Error if initialMarginBps is zero (infinite leverage is undefined)
 */
export function computeMaxLeverage(initialMarginBps: bigint): number {
  if (initialMarginBps <= 0n) {
    throw new Error("computeMaxLeverage: initialMarginBps must be positive");
  }
  // Use floating-point division so fractional leverage is preserved.
  // BigInt floor division (10000n / initialMarginBps) silently truncates:
  // e.g. 3000 bps (33.3% margin) -> 3x instead of 3.33x, a 10% UI error.
  return 10000 / Number(initialMarginBps);
}

/**
 * Compute maximum leverage from initial margin bps, floored to a whole
 * multiplier — the conservative integer form used by risk/sizing math.
 *
 * Kept separate from {@link computeMaxLeverage} because that one is a display
 * value and may be fractional: `BigInt(3.3333)` throws `RangeError`. Rounding
 * DOWN also keeps client-side caps at or below what the program enforces, so a
 * caller can never build a position the chain would reject on leverage.
 *
 * @throws Error if initialMarginBps is zero (infinite leverage is undefined)
 */
export function computeMaxLeverageFloor(initialMarginBps: bigint): bigint {
  if (initialMarginBps <= 0n) {
    throw new Error("computeMaxLeverageFloor: initialMarginBps must be positive");
  }
  return 10000n / initialMarginBps;
}
