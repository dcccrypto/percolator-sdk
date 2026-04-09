/**
 * Warmup leverage cap utilities.
 *
 * During the market warmup period, capital is released linearly over
 * `warmupPeriodSlots` slots, which constrains the effective leverage
 * and maximum position size available to traders.
 */

import { computeMaxLeverage } from "./trading.js";

// =============================================================================
// Warmup leverage cap utilities
// =============================================================================

/**
 * Compute unlocked capital during the warmup period.
 *
 * Capital is released linearly over `warmupPeriodSlots` slots starting from
 * `warmupStartedAtSlot`. Before warmup starts (startSlot === 0) or if the
 * warmup period is 0, all capital is considered unlocked.
 *
 * @param totalCapital    - Total deposited capital (native units).
 * @param currentSlot     - The current on-chain slot.
 * @param warmupStartSlot - Slot at which warmup started (0 = not started).
 * @param warmupPeriodSlots - Total slots in the warmup period.
 * @returns The amount of capital currently unlocked.
 */
export function computeWarmupUnlockedCapital(
  totalCapital: bigint,
  currentSlot: bigint,
  warmupStartSlot: bigint,
  warmupPeriodSlots: bigint,
): bigint {
  // No warmup configured or not started → all capital available
  if (warmupPeriodSlots === 0n || warmupStartSlot === 0n) return totalCapital;
  if (totalCapital <= 0n) return 0n;

  const elapsed = currentSlot > warmupStartSlot
    ? currentSlot - warmupStartSlot
    : 0n;

  // Warmup complete
  if (elapsed >= warmupPeriodSlots) return totalCapital;

  // Linear unlock: totalCapital * elapsed / warmupPeriodSlots
  return (totalCapital * elapsed) / warmupPeriodSlots;
}

/**
 * Compute the effective maximum leverage during the warmup period.
 *
 * During warmup, only unlocked capital can be used as margin. The effective
 * leverage relative to *total* capital is therefore capped at:
 *
 *   effectiveMaxLeverage = maxLeverage × (unlockedCapital / totalCapital)
 *
 * This returns a floored integer value (leverage is always a whole number
 * in the UI), with a minimum of 1x if any capital is unlocked.
 *
 * @param initialMarginBps   - Initial margin requirement in basis points.
 * @param totalCapital       - Total deposited capital (native units).
 * @param currentSlot        - The current on-chain slot.
 * @param warmupStartSlot    - Slot at which warmup started (0 = not started).
 * @param warmupPeriodSlots  - Total slots in the warmup period.
 * @returns The effective maximum leverage (integer, ≥ 1).
 */
export function computeWarmupLeverageCap(
  initialMarginBps: bigint,
  totalCapital: bigint,
  currentSlot: bigint,
  warmupStartSlot: bigint,
  warmupPeriodSlots: bigint,
): number {
  if (initialMarginBps <= 0n) {
    throw new Error("computeWarmupLeverageCap: initialMarginBps must be positive");
  }
  const maxLev = computeMaxLeverage(initialMarginBps);

  // No warmup or warmup not started → full leverage
  if (warmupPeriodSlots === 0n || warmupStartSlot === 0n) return maxLev;
  if (totalCapital <= 0n) return 1;

  const unlocked = computeWarmupUnlockedCapital(
    totalCapital,
    currentSlot,
    warmupStartSlot,
    warmupPeriodSlots,
  );

  if (unlocked <= 0n) return 1; // At least 1x if nothing unlocked yet (slot 0 edge)

  // Effective leverage = maxLev * (unlocked / total), floored, min 1
  const scaledResult = (BigInt(maxLev) * unlocked) / totalCapital;

  // Ensure conversion to Number doesn't silently truncate for very large values
  if (scaledResult > BigInt(Number.MAX_SAFE_INTEGER)) {
    console.warn(
      `[computeWarmupLeverageCap] Warning: effective leverage ${scaledResult} exceeds MAX_SAFE_INTEGER, ` +
      `returning MAX_SAFE_INTEGER as a safety bound`,
    );
    return Number.MAX_SAFE_INTEGER;
  }

  const effectiveLev = Number(scaledResult);
  return Math.max(1, effectiveLev);
}

/**
 * Compute the maximum position size allowed during warmup.
 *
 * This is the unlocked capital multiplied by the base max leverage.
 * Unlike `computeWarmupLeverageCap` (which gives effective leverage
 * relative to total capital), this gives the absolute notional cap.
 *
 * @param initialMarginBps   - Initial margin requirement in basis points.
 * @param totalCapital       - Total deposited capital (native units).
 * @param currentSlot        - The current on-chain slot.
 * @param warmupStartSlot    - Slot at which warmup started (0 = not started).
 * @param warmupPeriodSlots  - Total slots in the warmup period.
 * @returns Maximum position size in native units.
 */
export function computeWarmupMaxPositionSize(
  initialMarginBps: bigint,
  totalCapital: bigint,
  currentSlot: bigint,
  warmupStartSlot: bigint,
  warmupPeriodSlots: bigint,
): bigint {
  const maxLev = computeMaxLeverage(initialMarginBps);
  const unlocked = computeWarmupUnlockedCapital(
    totalCapital,
    currentSlot,
    warmupStartSlot,
    warmupPeriodSlots,
  );
  return unlocked * BigInt(maxLev);
}

/**
 * Warmup progress information for a position.
 */
export interface WarmupProgress {
  /** PnL available for withdrawal right now (not locked by warmup). */
  maturedPnl: bigint;
  /** PnL still locked until warmup completes. */
  reservedPnl: bigint;
  /** Progress toward full warmup as a basis point (0–10,000). */
  progressBps: bigint;
  /** Slots remaining until full warmup (0 if fully matured). */
  slotsRemaining: bigint;
}

/**
 * Compute PnL warmup progress for a position.
 *
 * During the warmup period, a position's unrealized PnL is linearly released.
 * The portion available for withdrawal grows over time. This utility shows:
 * - How much PnL is currently available (matured)
 * - How much is still locked (reserved)
 * - Progress toward full maturation (as %)
 * - Slots remaining
 *
 * Users can display a progress bar or "unlocks in X slots" message to give
 * transparency into when their PnL becomes withdrawable.
 *
 * @param currentSlot        - Current on-chain slot (from engine state).
 * @param warmupStartedAtSlot - Slot when this position's warmup started.
 * @param warmupPeriodSlots  - Total warmup duration in slots (from market config).
 * @param pnl                - Total realized + unrealized PnL (from account).
 * @param reservedPnl        - PnL locked during warmup (from account).
 * @returns WarmupProgress with matured/reserved PnL, progress %, and slots remaining.
 *
 * @example
 * ```ts
 * const progress = computeWarmupProgress(
 *   10000n,      // current slot
 *   9000n,       // warmup started at slot 9000
 *   2000n,       // warmup period = 2000 slots
 *   1000000000n, // pnl = 1 SOL
 *   600000000n   // reserved = 0.6 SOL (60% still locked)
 * );
 * // Returns:
 * // maturedPnl: 400000000n    (0.4 SOL available)
 * // reservedPnl: 600000000n   (0.6 SOL locked)
 * // progressBps: 5000n        (50% complete)
 * // slotsRemaining: 1000n     (1000 slots until fully mature)
 * ```
 */
export function computeWarmupProgress(
  currentSlot: bigint,
  warmupStartedAtSlot: bigint,
  warmupPeriodSlots: bigint,
  pnl: bigint,
  reservedPnl: bigint,
): WarmupProgress {
  // Guard: no warmup or hasn't started → all PnL is mature
  if (warmupPeriodSlots === 0n || warmupStartedAtSlot === 0n) {
    return {
      maturedPnl: pnl > 0n ? pnl : 0n,
      reservedPnl: 0n,
      progressBps: 10000n, // 100%
      slotsRemaining: 0n,
    };
  }

  const elapsed = currentSlot >= warmupStartedAtSlot
    ? currentSlot - warmupStartedAtSlot
    : 0n;

  // If warmup complete, all PnL is mature
  if (elapsed >= warmupPeriodSlots) {
    return {
      maturedPnl: pnl > 0n ? pnl : 0n,
      reservedPnl: 0n,
      progressBps: 10000n, // 100%
      slotsRemaining: 0n,
    };
  }

  // Progress: how much of the warmup period has elapsed
  const progressBps = (elapsed * 10000n) / warmupPeriodSlots;
  const slotsRemaining = warmupPeriodSlots - elapsed;

  // Matured PnL = pnl minus the on-chain reserved amount.
  // The time-based linear release (pnl * progress%) is the theoretical cap,
  // but the actual available amount is determined by what's still reserved.
  const timeReleased = pnl > 0n ? ((pnl * progressBps) / 10000n) : 0n;
  const fromReserved = pnl > 0n && pnl > reservedPnl ? pnl - reservedPnl : 0n;
  // Use the lesser of time-released and unreserved to avoid overstating
  const maturedPnl = timeReleased < fromReserved ? timeReleased : fromReserved;

  const locked = reservedPnl > 0n ? reservedPnl : 0n;

  return {
    maturedPnl,
    reservedPnl: locked,
    progressBps,
    slotsRemaining,
  };
}
