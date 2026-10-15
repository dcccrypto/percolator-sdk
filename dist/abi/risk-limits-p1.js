import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { concatBytes, encU8, encU16, encU32, encU128 } from "./encode.js";
import { buildAccountMetas } from "./accounts.js";
const IX_TAG_P1 = Object.freeze({ SetAssetRiskLimits: 93 });
const MAX_EXEC_BAND_BPS_P1 = 1e4;
const MAX_LP_EXPOSURE_K_BPS_P1 = 1e7;
const MAX_OI_SIDE_Q_P1 = 100000000000000n;
const MATCHER_EXT_MODE_V1_P1 = 1;
const MAX_REQUESTED_FEE_BPS_P1 = 1023;
function int(name, v, max) {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${name} must be an integer in 0..=${max}, got ${v}`);
}
function encodeSetAssetRiskLimitsP1(a) {
  const ext = a.matcherExtMode ?? 0;
  const fee = a.maxRequestedFeeBps ?? 0;
  int("assetIndex", a.assetIndex, 65535);
  int("execBandBps", a.execBandBps, MAX_EXEC_BAND_BPS_P1);
  int("lpExposureKBps", a.lpExposureKBps, MAX_LP_EXPOSURE_K_BPS_P1);
  int("matcherExtMode", ext, MATCHER_EXT_MODE_V1_P1);
  int("maxRequestedFeeBps", fee, MAX_REQUESTED_FEE_BPS_P1);
  if (a.lpFloorAtoms < 0n || a.lpFloorAtoms > (1n << 128n) - 1n) throw new Error("lpFloorAtoms out of u128 range");
  if (a.sideOiCapQ < 0n || a.sideOiCapQ > MAX_OI_SIDE_Q_P1) throw new Error(`sideOiCapQ must be in 0..=${MAX_OI_SIDE_Q_P1}`);
  const parts = [
    encU8(IX_TAG_P1.SetAssetRiskLimits),
    encU16(a.assetIndex),
    encU16(a.execBandBps),
    encU32(a.lpExposureKBps),
    encU128(a.lpFloorAtoms),
    encU128(a.sideOiCapQ)
  ];
  if (ext !== 0 || fee !== 0) parts.push(encU8(ext));
  if (fee !== 0) parts.push(encU16(fee));
  return concatBytes(...parts);
}
const ACCOUNTS_SET_ASSET_RISK_LIMITS_P1 = [
  { name: "upgradeAuthority", signer: true, writable: false },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: true }
];
const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
function buildSetAssetRiskLimitsIxP1(programId, market, upgradeAuthority, args) {
  const [programData] = PublicKey.findProgramAddressSync([programId.toBytes()], BPF_LOADER_UPGRADEABLE);
  return new TransactionInstruction({
    programId,
    keys: buildAccountMetas(ACCOUNTS_SET_ASSET_RISK_LIMITS_P1, { upgradeAuthority, programData, market }),
    data: Buffer.from(encodeSetAssetRiskLimitsP1(args))
  });
}
const ASSET_RISK_LIMITS_FIELD_OFF_P1 = Object.freeze({
  sideOiCapQ: 0,
  lpFloorAtoms: 16,
  lpExposureKBps: 32,
  execBandBps: 36,
  matcherExtMode: 38,
  reserved0: 39,
  maxRequestedFeeBps: 40,
  reserved: 42
});
const ASSET_RISK_LIMITS_LEN_P1 = 64;
const ASSET_RISK_LIMITS_SLOT_OFF_P1 = 608;
function assetRiskLimitsAccountOffsetP1(assetIndex) {
  if (!Number.isInteger(assetIndex) || assetIndex < 0) throw new Error(`bad assetIndex ${assetIndex}`);
  return 592 + 758 + 2325 * assetIndex + ASSET_RISK_LIMITS_SLOT_OFF_P1;
}
function decodeAssetRiskLimitsRecordP1(rec) {
  if (rec.length !== ASSET_RISK_LIMITS_LEN_P1) throw new Error(`AssetRiskLimitsV17 record must be 64 bytes, got ${rec.length}`);
  const v = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
  const u128 = (o) => v.getBigUint64(o + 8, true) << 64n | v.getBigUint64(o, true);
  const F = ASSET_RISK_LIMITS_FIELD_OFF_P1;
  return {
    sideOiCapQ: u128(F.sideOiCapQ),
    lpFloorAtoms: u128(F.lpFloorAtoms),
    lpExposureKBps: v.getUint32(F.lpExposureKBps, true),
    execBandBps: v.getUint16(F.execBandBps, true),
    matcherExtMode: rec[F.matcherExtMode],
    maxRequestedFeeBps: v.getUint16(F.maxRequestedFeeBps, true)
  };
}
function decodeAssetRiskLimitsP1(marketData, assetIndex) {
  if (marketData[10] !== 1) throw new Error(`not a market account (kind ${marketData[10]})`);
  const off = assetRiskLimitsAccountOffsetP1(assetIndex);
  if (marketData.length < off + ASSET_RISK_LIMITS_LEN_P1) throw new Error(`market account too short for asset ${assetIndex}`);
  return decodeAssetRiskLimitsRecordP1(marketData.subarray(off, off + ASSET_RISK_LIMITS_LEN_P1));
}
export {
  ACCOUNTS_SET_ASSET_RISK_LIMITS_P1,
  ASSET_RISK_LIMITS_FIELD_OFF_P1,
  ASSET_RISK_LIMITS_LEN_P1,
  ASSET_RISK_LIMITS_SLOT_OFF_P1,
  IX_TAG_P1,
  MATCHER_EXT_MODE_V1_P1,
  MAX_EXEC_BAND_BPS_P1,
  MAX_LP_EXPOSURE_K_BPS_P1,
  MAX_OI_SIDE_Q_P1,
  MAX_REQUESTED_FEE_BPS_P1,
  assetRiskLimitsAccountOffsetP1,
  buildSetAssetRiskLimitsIxP1,
  decodeAssetRiskLimitsP1,
  decodeAssetRiskLimitsRecordP1,
  encodeSetAssetRiskLimitsP1
};
//# sourceMappingURL=risk-limits-p1.js.map