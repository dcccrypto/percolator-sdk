import { computeMaxLeverageFloor } from "./trading.js";
function computeWarmupUnlockedCapital(totalCapital, currentSlot, warmupStartSlot, warmupPeriodSlots) {
  if (warmupPeriodSlots === 0n || warmupStartSlot === 0n) return totalCapital;
  if (totalCapital <= 0n) return 0n;
  const elapsed = currentSlot > warmupStartSlot ? currentSlot - warmupStartSlot : 0n;
  if (elapsed >= warmupPeriodSlots) return totalCapital;
  return totalCapital * elapsed / warmupPeriodSlots;
}
function computeWarmupLeverageCap(initialMarginBps, totalCapital, currentSlot, warmupStartSlot, warmupPeriodSlots) {
  const maxLev = computeMaxLeverageFloor(initialMarginBps);
  if (warmupPeriodSlots === 0n || warmupStartSlot === 0n) return Number(maxLev);
  if (totalCapital <= 0n) return 1;
  const unlocked = computeWarmupUnlockedCapital(
    totalCapital,
    currentSlot,
    warmupStartSlot,
    warmupPeriodSlots
  );
  if (unlocked <= 0n) return 1;
  const effectiveLev = Number(maxLev * unlocked / totalCapital);
  return Math.max(1, effectiveLev);
}
function computeWarmupMaxPositionSize(initialMarginBps, totalCapital, currentSlot, warmupStartSlot, warmupPeriodSlots) {
  const maxLev = computeMaxLeverageFloor(initialMarginBps);
  const unlocked = computeWarmupUnlockedCapital(
    totalCapital,
    currentSlot,
    warmupStartSlot,
    warmupPeriodSlots
  );
  return unlocked * maxLev;
}
export {
  computeWarmupLeverageCap,
  computeWarmupMaxPositionSize,
  computeWarmupUnlockedCapital
};
//# sourceMappingURL=warmup.js.map