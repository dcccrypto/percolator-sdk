function computeMarkPnl(positionSize, entryPrice, oraclePrice) {
  if (positionSize === 0n || oraclePrice === 0n) return 0n;
  const absPos = positionSize < 0n ? -positionSize : positionSize;
  const diff = positionSize > 0n ? oraclePrice - entryPrice : entryPrice - oraclePrice;
  return diff * absPos / oraclePrice;
}
function computeLiqPrice(entryPrice, capital, positionSize, maintenanceMarginBps) {
  if (positionSize === 0n || entryPrice === 0n) return 0n;
  const absPos = positionSize < 0n ? -positionSize : positionSize;
  const capitalPerUnitE6 = capital * 1000000n / absPos;
  if (positionSize > 0n) {
    const adjusted = capitalPerUnitE6 * 10000n / (10000n + maintenanceMarginBps);
    const liq = entryPrice - adjusted;
    return liq > 0n ? liq : 0n;
  } else {
    if (maintenanceMarginBps >= 10000n) return 18446744073709551615n;
    const adjusted = capitalPerUnitE6 * 10000n / (10000n - maintenanceMarginBps);
    return entryPrice + adjusted;
  }
}
function computePreTradeLiqPrice(oracleE6, margin, posSize, maintBps, feeBps, direction) {
  if (oracleE6 === 0n || margin === 0n || posSize === 0n) return 0n;
  const absPos = posSize < 0n ? -posSize : posSize;
  const signedPos = direction === "long" ? absPos : -absPos;
  const feeAdjust = oracleE6 * feeBps / 10000n;
  let adjustedEntry;
  if (direction === "long") {
    adjustedEntry = oracleE6 + feeAdjust;
  } else {
    const shortEntry = oracleE6 - feeAdjust;
    adjustedEntry = shortEntry > 0n ? shortEntry : 1n;
  }
  return computeLiqPrice(adjustedEntry, margin, signedPos, maintBps);
}
function computeTradingFee(notional, tradingFeeBps) {
  return notional * tradingFeeBps / 10000n;
}
function computeDynamicFeeBps(notional, config) {
  if (config.tier2Threshold === 0n) return config.baseBps;
  if (config.tier3Threshold > 0n && notional >= config.tier3Threshold) return config.tier3Bps;
  if (notional >= config.tier2Threshold) return config.tier2Bps;
  return config.baseBps;
}
function computeDynamicTradingFee(notional, config) {
  const feeBps = computeDynamicFeeBps(notional, config);
  if (notional <= 0n || feeBps <= 0n) return 0n;
  return (notional * feeBps + 9999n) / 10000n;
}
function computeFeeSplit(totalFee, config) {
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
  const lp = totalFee * config.lpBps / 10000n;
  const protocol = totalFee * config.protocolBps / 10000n;
  const creator = totalFee - lp - protocol;
  return [lp, protocol, creator];
}
function computePnlPercent(pnlTokens, capital) {
  if (capital === 0n) return 0;
  const scaledPct = pnlTokens * 10000n / capital;
  const MAX_DISPLAY = BigInt(Number.MAX_SAFE_INTEGER);
  if (scaledPct > MAX_DISPLAY) return Number.MAX_SAFE_INTEGER / 100;
  if (scaledPct < -MAX_DISPLAY) return -(Number.MAX_SAFE_INTEGER / 100);
  return Number(scaledPct) / 100;
}
function computeEstimatedEntryPrice(oracleE6, tradingFeeBps, direction) {
  if (oracleE6 === 0n) return 0n;
  const feeImpact = oracleE6 * tradingFeeBps / 10000n;
  if (direction === "long") return oracleE6 + feeImpact;
  const shortEntry = oracleE6 - feeImpact;
  return shortEntry > 0n ? shortEntry : 1n;
}
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(-Number.MAX_SAFE_INTEGER);
function computeFundingRateAnnualized(fundingRateBpsPerSlot) {
  if (fundingRateBpsPerSlot > MAX_SAFE_BIGINT) return Infinity;
  if (fundingRateBpsPerSlot < MIN_SAFE_BIGINT) return -Infinity;
  const bpsPerSlot = Number(fundingRateBpsPerSlot);
  const slotsPerYear = 2.5 * 60 * 60 * 24 * 365;
  return bpsPerSlot * slotsPerYear / 100;
}
function computeRequiredMargin(notional, initialMarginBps) {
  return notional * initialMarginBps / 10000n;
}
function computeMaxLeverage(initialMarginBps) {
  if (initialMarginBps <= 0n) {
    throw new Error("computeMaxLeverage: initialMarginBps must be positive");
  }
  return 1e4 / Number(initialMarginBps);
}
function computeMaxLeverageFloor(initialMarginBps) {
  if (initialMarginBps <= 0n) {
    throw new Error("computeMaxLeverageFloor: initialMarginBps must be positive");
  }
  return 10000n / initialMarginBps;
}
export {
  computeDynamicFeeBps,
  computeDynamicTradingFee,
  computeEstimatedEntryPrice,
  computeFeeSplit,
  computeFundingRateAnnualized,
  computeLiqPrice,
  computeMarkPnl,
  computeMaxLeverage,
  computeMaxLeverageFloor,
  computePnlPercent,
  computePreTradeLiqPrice,
  computeRequiredMargin,
  computeTradingFee
};
//# sourceMappingURL=trading.js.map