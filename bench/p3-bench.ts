import { pinnedMatcherCapsP3, encodeVaultLpSetMatcherP3, encodeSetVaultLpRiskP3, encodeDepositJuniorTrancheP3, encodeVaultLpRecallP3, encodeInitVaultLpP3 } from "../src/abi/p3.js";
function t(name: string, n: number, f: (i: number) => unknown) {
  for (let i = 0; i < 2000; i++) f(i);
  const s = process.hrtime.bigint(); let x: unknown;
  for (let i = 0; i < n; i++) x = f(i);
  const e = Number(process.hrtime.bigint() - s);
  console.log(name.padEnd(28), (e / n).toFixed(1), "ns/op"); return x;
}
const prices: bigint[] = Array.from({ length: 4096 }, () => BigInt(1 + Math.floor(Math.random() * 1e12)));
t("pinnedMatcherCapsP3", 1e6, i => pinnedMatcherCapsP3(prices[i & 4095]));
const m = { expectedSequence: 5n, assetGenerationFrontier: 7n, tradeFeeCapBps: 10000, expirySlot: 123456789n, kind: 1, tradingFeeBps: 10, baseSpreadBps: 10, maxTotalBps: 100, impactKBps: 50, liquidityNotionalE6: 250_000_000_000n, maxFillAbs: 5_000_000_000n, maxInventoryAbs: 25_000_000_000n, feeToInsuranceBps: 0, skewSpreadMultBps: 1 };
t("encodeVaultLpSetMatcherP3", 1e5, () => encodeVaultLpSetMatcherP3(m));
t("encodeInitVaultLpP3", 1e5, i => encodeInitVaultLpP3(1000 + (i % 9000)));
t("encodeDepositJuniorTrancheP3", 1e5, i => encodeDepositJuniorTrancheP3(BigInt(i) + 1n));
t("encodeVaultLpRecallP3", 1e5, i => encodeVaultLpRecallP3(BigInt(i) + 1n, i & 0xff));
