import { concatBytes, encPubkey, encU8, encU16, encU32, encU64, encU128 } from "./encode.js";
const IX_TAG_P3 = Object.freeze({
  InitVaultLp: 94,
  VaultLpSetMatcher: 95,
  DepositJuniorTranche: 96,
  WithdrawJuniorTranche: 97,
  VaultLpRecall: 98,
  SetVaultLpRisk: 99,
  VaultLpConvertPnl: 100,
  VaultLpSettleResolved: 101,
  VaultLpReleaseSurplus: 102
});
const VAULT_LP_JUNIOR_FLOOR_BPS_RANGE_P3 = Object.freeze({ min: 1e3, max: 1e4 });
const VAULT_LP_MAX_LEV_BPS_P3 = 5e4;
const VAULT_LP_DEFAULT_MAX_LEV_BPS_P3 = 1e4;
const CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3 = "EDKKgRaVHna6FCxiY1kgMzegD9rpaN1nwJNSzAzeBUBX";
const VAULT_LP_PIN_P3 = Object.freeze({
  MATCHER_KIND: 1,
  // vAMM
  TRADING_FEE_BPS: 10,
  BASE_SPREAD_BPS: 10,
  MAX_TOTAL_BPS: 100,
  IMPACT_K_BPS: 50,
  FEE_TO_INSURANCE_BPS: 0,
  SKEW_SPREAD_MULT_BPS: 1,
  TRADE_FEE_CAP_BPS: 1e4,
  LIQUIDITY_USD: 250000n,
  MAX_FILL_USD: 5000n,
  MAX_INVENTORY_USD: 25000n
});
const ENGINE_MAX_POSITION_ABS_Q_P3 = 100000000000000n;
function usdToQCappedP3(usd, priceE6) {
  if (priceE6 === 0n) return null;
  let q = usd * 1000000000000n / priceE6;
  if (q > ENGINE_MAX_POSITION_ABS_Q_P3) q = ENGINE_MAX_POSITION_ABS_Q_P3;
  return q === 0n ? null : q;
}
function pinnedMatcherCapsP3(priceE6) {
  const maxFillAbs = usdToQCappedP3(VAULT_LP_PIN_P3.MAX_FILL_USD, priceE6);
  const maxInventoryAbs = usdToQCappedP3(VAULT_LP_PIN_P3.MAX_INVENTORY_USD, priceE6);
  if (maxFillAbs === null || maxInventoryAbs === null) return null;
  return { liquidityNotionalE6: VAULT_LP_PIN_P3.LIQUIDITY_USD * 1000000n, maxFillAbs, maxInventoryAbs };
}
const U16 = 65535;
const U32 = 4294967295;
const U64 = (1n << 64n) - 1n;
const U128 = (1n << 128n) - 1n;
function int(name, v, min, max) {
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${name} must be an integer in ${min}..=${max}, got ${v}`);
}
function big(name, v, max, min = 0n) {
  if (v < min || v > max) throw new Error(`${name} must be in ${min}..=${max}, got ${v}`);
}
function encodeInitVaultLpP3(juniorFloorBps) {
  int("juniorFloorBps", juniorFloorBps, VAULT_LP_JUNIOR_FLOOR_BPS_RANGE_P3.min, VAULT_LP_JUNIOR_FLOOR_BPS_RANGE_P3.max);
  return concatBytes(encU8(IX_TAG_P3.InitVaultLp), encU16(juniorFloorBps));
}
function encodeVaultLpSetMatcherP3(a) {
  big("expectedSequence", a.expectedSequence, U64);
  big("assetGenerationFrontier", a.assetGenerationFrontier, U64);
  int("tradeFeeCapBps", a.tradeFeeCapBps, 0, U16);
  big("expirySlot", a.expirySlot, U64);
  int("kind", a.kind, 0, 255);
  int("tradingFeeBps", a.tradingFeeBps, 0, U32);
  int("baseSpreadBps", a.baseSpreadBps, 0, U32);
  int("maxTotalBps", a.maxTotalBps, 0, U32);
  int("impactKBps", a.impactKBps, 0, U32);
  big("liquidityNotionalE6", a.liquidityNotionalE6, U128);
  big("maxFillAbs", a.maxFillAbs, U128, 1n);
  big("maxInventoryAbs", a.maxInventoryAbs, U128, 1n);
  int("feeToInsuranceBps", a.feeToInsuranceBps, 0, U16);
  int("skewSpreadMultBps", a.skewSpreadMultBps, 0, U16);
  return concatBytes(
    encU8(IX_TAG_P3.VaultLpSetMatcher),
    encU64(a.expectedSequence),
    encU64(a.assetGenerationFrontier),
    encU16(a.tradeFeeCapBps),
    encU64(a.expirySlot),
    encU8(a.kind),
    encU32(a.tradingFeeBps),
    encU32(a.baseSpreadBps),
    encU32(a.maxTotalBps),
    encU32(a.impactKBps),
    encU128(a.liquidityNotionalE6),
    encU128(a.maxFillAbs),
    encU128(a.maxInventoryAbs),
    encU16(a.feeToInsuranceBps),
    encU16(a.skewSpreadMultBps)
  );
}
function amountOnly(tag, name, amount) {
  big(name, amount, U128);
  return concatBytes(encU8(tag), encU128(amount));
}
function encodeDepositJuniorTrancheP3(amount) {
  return amountOnly(IX_TAG_P3.DepositJuniorTranche, "amount", amount);
}
function encodeWithdrawJuniorTrancheP3(amount) {
  return amountOnly(IX_TAG_P3.WithdrawJuniorTranche, "amount", amount);
}
function encodeVaultLpRecallP3(amount, targetDomain) {
  big("amount", amount, U128);
  int("targetDomain", targetDomain, 0, U16);
  return concatBytes(encU8(IX_TAG_P3.VaultLpRecall), encU128(amount), encU16(targetDomain));
}
function encodeSetVaultLpRiskP3(a) {
  int("assetIndex", a.assetIndex, 0, U16);
  big("skewSlopeE9", a.skewSlopeE9, U64);
  big("skewMaxE9", a.skewMaxE9, U64);
  big("levCapQ", a.levCapQ, U128);
  int("levMaxImrBps", a.levMaxImrBps, 0, 1e4);
  int("vaultLpMaxLevBps", a.vaultLpMaxLevBps, 0, VAULT_LP_MAX_LEV_BPS_P3);
  return concatBytes(
    encU8(IX_TAG_P3.SetVaultLpRisk),
    encU16(a.assetIndex),
    encU64(a.skewSlopeE9),
    encU64(a.skewMaxE9),
    encU128(a.levCapQ),
    encU16(a.levMaxImrBps),
    encU32(a.vaultLpMaxLevBps),
    encPubkey(a.approvedMatcherProgram)
  );
}
function encodeVaultLpConvertPnlP3(amount) {
  return amountOnly(IX_TAG_P3.VaultLpConvertPnl, "amount", amount);
}
function encodeVaultLpSettleResolvedP3(topup) {
  int("topup", topup, 0, 1);
  return concatBytes(encU8(IX_TAG_P3.VaultLpSettleResolved), encU8(topup));
}
function encodeVaultLpReleaseSurplusP3(amount, sourceDomain) {
  big("amount", amount, U128);
  int("sourceDomain", sourceDomain, 0, U16);
  return concatBytes(encU8(IX_TAG_P3.VaultLpReleaseSurplus), encU128(amount), encU16(sourceDomain));
}
const ACCOUNTS_INIT_VAULT_LP_P3 = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "matcherProgram", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherDelegate", signer: false, writable: false }
];
const ACCOUNTS_VAULT_LP_SET_MATCHER_P3 = [
  { name: "upgradeAuthority", signer: true, writable: false },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: false },
  { name: "vaultLpState", signer: false, writable: false },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "matcherProgram", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherDelegate", signer: false, writable: false }
];
const ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3 = [
  { name: "juniorOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3 = [
  { name: "juniorOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: false },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_VAULT_LP_RECALL_P3 = [
  { name: "cranker", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: false },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
const ACCOUNTS_SET_VAULT_LP_RISK_P3 = [
  { name: "upgradeAuthority", signer: true, writable: false },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_VAULT_LP_CONVERT_PNL_P3 = [
  { name: "caller", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "vaultLpState", signer: false, writable: false },
  { name: "lpPortfolio", signer: false, writable: true }
];
const ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3 = [
  { name: "caller", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: false },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "juniorDestToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false }
];
const ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3 = [
  { name: "juniorOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: false },
  { name: "vaultLpState", signer: false, writable: true },
  { name: "lpPortfolio", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true }
];
const ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3 = [
  { name: "juniorDestToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
export {
  ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3,
  ACCOUNTS_INIT_VAULT_LP_P3,
  ACCOUNTS_SET_VAULT_LP_RISK_P3,
  ACCOUNTS_VAULT_LP_CONVERT_PNL_P3,
  ACCOUNTS_VAULT_LP_RECALL_P3,
  ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3,
  ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3,
  ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3,
  ACCOUNTS_VAULT_LP_SET_MATCHER_P3,
  ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3,
  CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3,
  ENGINE_MAX_POSITION_ABS_Q_P3,
  IX_TAG_P3,
  VAULT_LP_DEFAULT_MAX_LEV_BPS_P3,
  VAULT_LP_JUNIOR_FLOOR_BPS_RANGE_P3,
  VAULT_LP_MAX_LEV_BPS_P3,
  VAULT_LP_PIN_P3,
  encodeDepositJuniorTrancheP3,
  encodeInitVaultLpP3,
  encodeSetVaultLpRiskP3,
  encodeVaultLpConvertPnlP3,
  encodeVaultLpRecallP3,
  encodeVaultLpReleaseSurplusP3,
  encodeVaultLpSetMatcherP3,
  encodeVaultLpSettleResolvedP3,
  encodeWithdrawJuniorTrancheP3,
  pinnedMatcherCapsP3,
  usdToQCappedP3
};
//# sourceMappingURL=p3.js.map