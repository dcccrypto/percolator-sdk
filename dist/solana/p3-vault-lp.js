import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { buildAccountMetas, ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP } from "../abi/accounts.js";
import { encodeExecuteRedemption, encodePermissionlessCrank } from "../abi/instructions.js";
import {
  ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3,
  ACCOUNTS_INIT_VAULT_LP_P3,
  ACCOUNTS_SET_VAULT_LP_RISK_P3,
  ACCOUNTS_VAULT_LP_CONVERT_PNL_P3,
  ACCOUNTS_VAULT_LP_RECALL_P3,
  ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3,
  ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3,
  ACCOUNTS_VAULT_LP_SET_MATCHER_P3,
  ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3,
  ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3,
  encodeDepositJuniorTrancheP3,
  encodeInitVaultLpP3,
  encodeSetVaultLpRiskP3,
  encodeVaultLpConvertPnlP3,
  encodeVaultLpRecallP3,
  encodeVaultLpReleaseSurplusP3,
  encodeVaultLpSetMatcherP3,
  encodeVaultLpSettleResolvedP3,
  encodeWithdrawJuniorTrancheP3,
  CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3
} from "../abi/p3.js";
import { deriveInsuranceLpMint, deriveLpBackingLedger, deriveLpEscrow, deriveLpRedemption, deriveLpVaultRegistry, deriveMatcherDelegate, deriveNftRegistry, deriveVaultAuthority } from "./pda.js";
import {
  V17_HEADER_LEN,
  V17_KIND_OFF,
  V17_MARKET_ASSET_SLOT_LEN,
  V17_MARKET_GROUP_LEN,
  V17_MARKET_GROUP_OFF,
  V17_PORTFOLIO_ACCOUNT_LEN
} from "./slab.js";
const V18_KIND_VAULT_LP_STATE_P3 = 9;
const VAULT_LP_STATE_BODY_LEN_P3 = 256;
const VAULT_LP_STATE_ACCOUNT_LEN_P3 = V17_HEADER_LEN + VAULT_LP_STATE_BODY_LEN_P3;
const ASSET_VAULT_LP_SLOT_OFF_P3 = 896;
const ASSET_VAULT_LP_LEN_P3 = 128;
const ASSET_VAULT_LP_FLAG_BOUND_P3 = 1;
const LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3 = 160;
const VAULT_LP_STATE_OFF_P3 = Object.freeze({
  marketGroup: 16,
  registry: 48,
  lpPortfolio: 80,
  juniorOwner: 112,
  seniorClaimAtoms: 144,
  juniorDepositedAtoms: 160,
  juniorWithdrawnAtoms: 176,
  seniorFeeCreditedAtoms: 192,
  recalledAtoms: 208,
  assetIndex: 224,
  juniorFloorBps: 226,
  seniorFeeShareBps: 228,
  version: 230,
  bump: 231,
  /** `_padding` [232..240) must be zero (program `validate_vault_lp_state`). */
  padding: 232,
  /** P3 senior draw FINAL `d119eebd` (was `_reserved`). */
  seniorDrawnAtoms: 240,
  seniorDrawOutstandingAtoms: 256
});
const ASSET_VAULT_LP_DRAW_SLOT_OFF_P3 = 832;
const ASSET_VAULT_LP_DRAW_LEN_P3 = 64;
const ASSET_VAULT_LP_FIELD_OFF_P3 = Object.freeze({
  vaultLpPortfolio: 0,
  lpNetQ: 32,
  levCapQ: 48,
  lpNetSlot: 64,
  skewSlopeE9: 72,
  skewMaxE9: 80,
  levMaxImrBps: 88,
  flags: 90,
  reserved0: 91,
  vaultLpMaxLevBps: 92,
  approvedMatcherProgram: 96
});
function assetVaultLpAccountOffsetP3(assetIndex) {
  if (!Number.isInteger(assetIndex) || assetIndex < 0) throw new Error(`assetIndex must be a non-negative integer, got ${assetIndex}`);
  return V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + assetIndex * V17_MARKET_ASSET_SLOT_LEN + ASSET_VAULT_LP_SLOT_OFF_P3;
}
const RECOMMENDED_CU_P3 = Object.freeze({
  tradeCpi: 6e5,
  closeResolved: 3e5,
  vaultLpSettleResolved: 4e5,
  lpVaultCrankFees: 12e4,
  keeperCrank: 25e4
});
const ASSET_STATE_RAW_ORACLE_TARGET_PRICE_OFF_P3 = 17;
const ASSET_STATE_EFFECTIVE_PRICE_OFF_P3 = 25;
const POS_SCALE_P3 = 1000000n;
const ASSET_SLOT_WRAPPER_LEN_P3 = 1024;
function readAssetPricesP3(marketData, assetIndex) {
  if (!Number.isInteger(assetIndex) || assetIndex < 0) throw new Error(`assetIndex must be a non-negative integer, got ${assetIndex}`);
  const base = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + assetIndex * V17_MARKET_ASSET_SLOT_LEN + ASSET_SLOT_WRAPPER_LEN_P3;
  if (marketData.length < base + ASSET_STATE_EFFECTIVE_PRICE_OFF_P3 + 8) throw new Error(`market data too short for asset ${assetIndex}`);
  const v = new DataView(marketData.buffer, marketData.byteOffset, marketData.byteLength);
  return {
    rawOracleTargetPriceE6: v.getBigUint64(base + ASSET_STATE_RAW_ORACLE_TARGET_PRICE_OFF_P3, true),
    effectivePriceE6: v.getBigUint64(base + ASSET_STATE_EFFECTIVE_PRICE_OFF_P3, true)
  };
}
function view(d) {
  return new DataView(d.buffer, d.byteOffset, d.byteLength);
}
function u128(v, o) {
  return v.getBigUint64(o + 8, true) << 64n | v.getBigUint64(o, true);
}
function i128(v, o) {
  const x = u128(v, o);
  return x >= 1n << 127n ? x - (1n << 128n) : x;
}
function key(d, o) {
  return new PublicKey(d.subarray(o, o + 32));
}
function decodeVaultLpStateP3(data) {
  if (data.length < VAULT_LP_STATE_ACCOUNT_LEN_P3) throw new Error(`VaultLpStateV18: need ${VAULT_LP_STATE_ACCOUNT_LEN_P3} bytes, got ${data.length}`);
  if (data[V17_KIND_OFF] !== V18_KIND_VAULT_LP_STATE_P3) throw new Error(`VaultLpStateV18: kind ${data[V17_KIND_OFF]} != 9`);
  const v = view(data);
  const O = VAULT_LP_STATE_OFF_P3;
  const st = {
    marketGroup: key(data, O.marketGroup),
    registry: key(data, O.registry),
    lpPortfolio: key(data, O.lpPortfolio),
    juniorOwner: key(data, O.juniorOwner),
    seniorClaimAtoms: u128(v, O.seniorClaimAtoms),
    juniorDepositedAtoms: u128(v, O.juniorDepositedAtoms),
    juniorWithdrawnAtoms: u128(v, O.juniorWithdrawnAtoms),
    seniorFeeCreditedAtoms: u128(v, O.seniorFeeCreditedAtoms),
    recalledAtoms: u128(v, O.recalledAtoms),
    assetIndex: v.getUint16(O.assetIndex, true),
    juniorFloorBps: v.getUint16(O.juniorFloorBps, true),
    seniorFeeShareBps: v.getUint16(O.seniorFeeShareBps, true),
    version: data[O.version],
    bump: data[O.bump],
    seniorDrawnAtoms: u128(v, O.seniorDrawnAtoms),
    seniorDrawOutstandingAtoms: u128(v, O.seniorDrawOutstandingAtoms)
  };
  const padZero = data.subarray(O.padding, O.padding + 8).every((b) => b === 0);
  if (st.version !== 1 || st.juniorFloorBps < 1e3 || st.juniorFloorBps > 1e4 || st.seniorFeeShareBps !== 1e4 || !padZero) {
    throw new Error("VaultLpStateV18: invalid (version/floor/fee share/padding) \u2014 the program would reject it too");
  }
  return st;
}
function decodeAssetVaultLpDrawP3(marketData, assetIndex) {
  const off = assetVaultLpAccountOffsetP3(assetIndex) - ASSET_VAULT_LP_DRAW_LEN_P3;
  if (marketData.length < off + ASSET_VAULT_LP_DRAW_LEN_P3) throw new Error(`AssetVaultLpDrawV18: market data too short for asset ${assetIndex}`);
  const v = view(marketData);
  const r = {
    pendingOutEvenAtoms: u128(v, off),
    pendingOutOddAtoms: u128(v, off + 16),
    outstandingMirrorAtoms: u128(v, off + 32),
    pendingMovedAtoms: u128(v, off + 48)
  };
  return { ...r, hasPendingDraw: r.pendingMovedAtoms !== 0n || r.pendingOutEvenAtoms !== 0n || r.pendingOutOddAtoms !== 0n };
}
function decodeAssetVaultLpRecordP3(rec) {
  if (rec.length !== ASSET_VAULT_LP_LEN_P3) throw new Error(`AssetVaultLpV18 record must be 128 bytes, got ${rec.length}`);
  const v = view(rec);
  const F = ASSET_VAULT_LP_FIELD_OFF_P3;
  const zero32 = (o) => rec.subarray(o, o + 32).every((b) => b === 0);
  const flags = rec[F.flags];
  const bound = (flags & ASSET_VAULT_LP_FLAG_BOUND_P3) !== 0;
  const out = {
    vaultLpPortfolio: zero32(F.vaultLpPortfolio) ? null : key(rec, F.vaultLpPortfolio),
    lpNetQ: i128(v, F.lpNetQ),
    levCapQ: u128(v, F.levCapQ),
    lpNetSlot: v.getBigUint64(F.lpNetSlot, true),
    skewSlopeE9: v.getBigUint64(F.skewSlopeE9, true),
    skewMaxE9: v.getBigUint64(F.skewMaxE9, true),
    levMaxImrBps: v.getUint16(F.levMaxImrBps, true),
    flags,
    bound,
    vaultLpMaxLevBps: v.getUint32(F.vaultLpMaxLevBps, true),
    approvedMatcherProgram: zero32(F.approvedMatcherProgram) ? null : key(rec, F.approvedMatcherProgram)
  };
  if ((flags & ~ASSET_VAULT_LP_FLAG_BOUND_P3) !== 0 || rec[F.reserved0] !== 0 || out.vaultLpMaxLevBps > 5e4 || out.levMaxImrBps > 1e4 || bound !== (out.vaultLpPortfolio !== null)) {
    throw new Error("AssetVaultLpV18: invalid record \u2014 the program would reject it too");
  }
  return out;
}
function decodeAssetVaultLpP3(marketData, assetIndex) {
  if (marketData[V17_KIND_OFF] !== 1) throw new Error(`not a market account (kind ${marketData[V17_KIND_OFF]})`);
  const off = assetVaultLpAccountOffsetP3(assetIndex);
  if (marketData.length < off + ASSET_VAULT_LP_LEN_P3) throw new Error(`market account too short for asset ${assetIndex}`);
  return decodeAssetVaultLpRecordP3(marketData.subarray(off, off + ASSET_VAULT_LP_LEN_P3));
}
function isLpVaultRegistryBoundP3(registryData) {
  const b = registryData[LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3];
  if (b !== 0 && b !== 1) throw new Error(`registry bound flag must be 0|1, got ${b}`);
  return b === 1;
}
function deriveVaultLpStateP3(programId, market) {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode("vault_lp"), market.toBytes()], programId);
}
const BPF_LOADER_UPGRADEABLE_ID_P3 = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
function deriveProgramDataAddressP3(programId) {
  return PublicKey.findProgramAddressSync([programId.toBytes()], BPF_LOADER_UPGRADEABLE_ID_P3);
}
function ledgers(programId, market, registryDomain) {
  return {
    ledger: deriveLpBackingLedger(programId, market, registryDomain)[0],
    siblingLedger: deriveLpBackingLedger(programId, market, registryDomain ^ 1)[0]
  };
}
function ix(programId, spec, keys, data, extra = []) {
  return new TransactionInstruction({ programId, keys: [...buildAccountMetas(spec, keys), ...extra], data: Buffer.from(data) });
}
const VAULT_LP_MATCHER_CTX_LEN_P3 = 320;
function buildCreateVaultLpMatcherCtxIxP3(payer, matcherCtx, lamports, matcherProgram = new PublicKey(CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3)) {
  return SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: matcherCtx, lamports, space: VAULT_LP_MATCHER_CTX_LEN_P3, programId: matcherProgram });
}
function buildInitVaultLpIxP3(m, marketauth, juniorFloorBps, matcherCtx, matcherProgram = new PublicKey(CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3)) {
  const [registry] = deriveLpVaultRegistry(m.programId, m.market);
  const [matcherDelegate] = deriveMatcherDelegate(m.programId, m.market, m.lpPortfolio, registry, matcherProgram, matcherCtx);
  return ix(m.programId, ACCOUNTS_INIT_VAULT_LP_P3, {
    authority: marketauth,
    market: m.market,
    registry,
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    systemProgram: SystemProgram.programId,
    ...ledgers(m.programId, m.market, m.registryDomain),
    matcherProgram,
    matcherCtx,
    matcherDelegate
  }, encodeInitVaultLpP3(juniorFloorBps));
}
function buildVaultLpSetMatcherIxP3(m, upgradeAuthority, matcherProgram, matcherCtx, args) {
  const [registry] = deriveLpVaultRegistry(m.programId, m.market);
  const [matcherDelegate] = deriveMatcherDelegate(m.programId, m.market, m.lpPortfolio, registry, matcherProgram, matcherCtx);
  return ix(m.programId, ACCOUNTS_VAULT_LP_SET_MATCHER_P3, {
    upgradeAuthority,
    programData: deriveProgramDataAddressP3(m.programId)[0],
    market: m.market,
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    matcherProgram,
    matcherCtx,
    matcherDelegate
  }, encodeVaultLpSetMatcherP3(args));
}
function buildDepositJuniorTrancheIxP3(m, juniorOwner, sourceToken, vaultToken, amount) {
  return ix(m.programId, ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3, {
    juniorOwner,
    market: m.market,
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    sourceToken,
    vaultToken,
    tokenProgram: TOKEN_PROGRAM_ID
  }, encodeDepositJuniorTrancheP3(amount));
}
function buildWithdrawJuniorTrancheIxP3(m, juniorOwner, destToken, vaultToken, amount) {
  return ix(m.programId, ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3, {
    juniorOwner,
    market: m.market,
    registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain),
    destToken,
    vaultToken,
    vaultAuthority: deriveVaultAuthority(m.programId, m.market)[0],
    tokenProgram: TOKEN_PROGRAM_ID
  }, encodeWithdrawJuniorTrancheP3(amount));
}
function buildVaultLpRecallIxP3(m, cranker, amount, targetDomain) {
  return ix(m.programId, ACCOUNTS_VAULT_LP_RECALL_P3, {
    cranker,
    market: m.market,
    registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain),
    systemProgram: SystemProgram.programId
  }, encodeVaultLpRecallP3(amount, targetDomain));
}
function buildSetVaultLpRiskIxP3(programId, market, upgradeAuthority, args) {
  return ix(programId, ACCOUNTS_SET_VAULT_LP_RISK_P3, {
    upgradeAuthority,
    programData: deriveProgramDataAddressP3(programId)[0],
    market
  }, encodeSetVaultLpRiskP3(args));
}
function buildVaultLpConvertPnlIxP3(m, caller, amount) {
  return ix(m.programId, ACCOUNTS_VAULT_LP_CONVERT_PNL_P3, {
    caller,
    market: m.market,
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio
  }, encodeVaultLpConvertPnlP3(amount));
}
function buildVaultLpSettleResolvedIxP3(m, caller, juniorDestToken, vaultToken, topup) {
  return ix(m.programId, ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3, {
    caller,
    market: m.market,
    registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain),
    juniorDestToken,
    vaultToken,
    vaultAuthority: deriveVaultAuthority(m.programId, m.market)[0],
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId
  }, encodeVaultLpSettleResolvedP3(topup));
}
function buildVaultLpReleaseSurplusIxP3(m, juniorOwner, amount, sourceDomain, resolved) {
  const extra = resolved ? buildAccountMetas(ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3, {
    juniorDestToken: resolved.juniorDestToken,
    vaultToken: resolved.vaultToken,
    vaultAuthority: deriveVaultAuthority(m.programId, m.market)[0],
    tokenProgram: TOKEN_PROGRAM_ID
  }) : [];
  return ix(m.programId, ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3, {
    juniorOwner,
    market: m.market,
    registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0],
    lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain)
  }, encodeVaultLpReleaseSurplusP3(amount, sourceDomain), extra);
}
const BOUND_VAULT_LP_TAIL_INDEX_P3 = Object.freeze({ 75: 11, 77: 13, 78: 6 });
const BOUND_VAULT_LP_LEDGER_SLOTS_P3 = Object.freeze({ 75: [7, 10], 77: [8, 11], 78: [3, 4] });
function withBoundVaultLpTailP3(base, vaultLpState, lpPortfolio, opts = {}) {
  const tag = base.data[0];
  if (tag !== 75 && tag !== 77 && tag !== 78) throw new Error(`withBoundVaultLpTailP3: tag ${tag} takes no vault-LP tail (only 75/77/78)`);
  const want = BOUND_VAULT_LP_TAIL_INDEX_P3[tag];
  if (base.keys.length !== want) throw new Error(`withBoundVaultLpTailP3: tag ${tag} must have exactly ${want} base accounts, got ${base.keys.length}`);
  const ledgerSlots = BOUND_VAULT_LP_LEDGER_SLOTS_P3[tag];
  const keys = base.keys.map((k, i) => ledgerSlots.includes(i) ? { ...k, isWritable: true } : k);
  keys.push({ pubkey: vaultLpState, isSigner: false, isWritable: true });
  if (tag !== 78) keys.push({ pubkey: lpPortfolio, isSigner: false, isWritable: opts.lpReadOnly !== true });
  return new TransactionInstruction({ programId: base.programId, keys, data: base.data });
}
function buildExecuteRedemptionIxP3(m, cranker, redeemer, redeemerDest, vaultToken, sourceDomain) {
  const [registry] = deriveLpVaultRegistry(m.programId, m.market);
  const { ledger, siblingLedger } = ledgers(m.programId, m.market, m.registryDomain);
  const w = (pubkey, isSigner = false) => ({ pubkey, isSigner, isWritable: true });
  const r = (pubkey) => ({ pubkey, isSigner: false, isWritable: false });
  const base = new TransactionInstruction({
    programId: m.programId,
    data: Buffer.from(encodeExecuteRedemption({ domain: sourceDomain })),
    keys: [
      w(cranker, true),
      w(m.market),
      w(registry),
      w(deriveLpRedemption(m.programId, registry, redeemer)[0]),
      w(deriveInsuranceLpMint(m.programId, m.market)[0]),
      w(deriveLpEscrow(m.programId, m.market)[0]),
      w(vaultToken),
      r(deriveVaultAuthority(m.programId, m.market)[0]),
      w(ledger),
      w(redeemerDest),
      r(TOKEN_PROGRAM_ID),
      w(siblingLedger),
      w(redeemer)
    ]
  });
  return withBoundVaultLpTailP3(base, deriveVaultLpStateP3(m.programId, m.market)[0], m.lpPortfolio);
}
function buildVaultLpRefreshCrankIxP3(a) {
  const want = a.observations.reduce((s, o) => s + o.oracleAccounts, 0);
  if (want !== a.oracleAccounts.length) throw new Error(`observations name ${want} oracle accounts, got ${a.oracleAccounts.length}`);
  return new TransactionInstruction({
    programId: a.programId,
    keys: [
      { pubkey: a.cranker, isSigner: true, isWritable: true },
      { pubkey: a.market, isSigner: false, isWritable: true },
      { pubkey: a.vaultLpPortfolio, isSigner: false, isWritable: true },
      ...a.oracleAccounts.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }))
    ],
    data: Buffer.from(encodePermissionlessCrank({ nowSlot: a.nowSlot, observations: a.observations }))
  });
}
const BOUND_SCALE_P3 = 1000000000000n;
const LP_VAULT_MINIMUM_LIQUIDITY_P3 = 1000n;
const sat = (a, b) => a > b ? a - b : 0n;
const minB = (a, b) => a < b ? a : b;
function vaultPotHeldAtomsP3(bucket) {
  return (bucket.freshUnlienedBackingNum + bucket.validLienedBackingNum) / BOUND_SCALE_P3;
}
function vaultPhysicalIdleBackingAtomsP3(freshUnlienedBackingNums) {
  return freshUnlienedBackingNums.reduce((t, n) => t + n / BOUND_SCALE_P3, 0n);
}
function boundVaultNavFlooredP3(own, sibling, feeShareBps, held) {
  if (!Number.isInteger(feeShareBps) || feeShareBps < 0 || feeShareBps > 1e4) throw new Error("feeShareBps must be 0..=10000");
  const earn = (p) => sat(p.totalEarningsAtoms, p.totalEarningsWithdrawnAtoms) * BigInt(feeShareBps) / 10000n;
  const availablePrincipal = minB(own.totalPrincipalAtoms, held.own) + minB(sibling.totalPrincipalAtoms, held.sibling);
  const lpEarnings = earn(own) + earn(sibling);
  return { availablePrincipal, lpEarnings, nav: availablePrincipal + lpEarnings };
}
const ceilDiv = (n, d) => (n + d - 1n) / d;
function vaultLpEquityLagBoundsP3(a) {
  if (a.legs.length === 0) {
    const e = a.capital + (a.pnl < 0n ? a.pnl : 0n) + (a.feeCredits < 0n ? a.feeCredits : 0n);
    const eq = e <= 0n ? 0n : e;
    return { worse: eq, better: eq };
  }
  let adverse = 0n;
  let favorable = 0n;
  for (const l of a.legs) {
    const q = l.basisPosQ < 0n ? -l.basisPosQ : l.basisPosQ;
    const up = l.rawOracleTargetPriceE6 > l.effectivePriceE6 ? l.rawOracleTargetPriceE6 - l.effectivePriceE6 : 0n;
    const down = l.effectivePriceE6 > l.rawOracleTargetPriceE6 ? l.effectivePriceE6 - l.rawOracleTargetPriceE6 : 0n;
    const [adv, fav] = l.basisPosQ >= 0n ? [down, up] : [up, down];
    adverse += ceilDiv(q * adv, POS_SCALE_P3);
    favorable += ceilDiv(q * fav, POS_SCALE_P3);
  }
  return { worse: a.certifiedEquity - adverse, better: a.certifiedEquity + favorable };
}
function vaultLpSeniorPricingClaimP3(c, undrawn, juniorSurplus) {
  const loss = undrawn > juniorSurplus ? undrawn - juniorSurplus : 0n;
  return c > loss ? c - loss : 0n;
}
function boundVaultSeniorValueP3(a) {
  if (a.resolved) return minB(a.physicalIdleBacking, a.seniorClaim);
  return liveExitSeniorValueP3(a.seniorClaim, a.nav, a.lpEquityWorse >= 0n ? a.lpValue : 0n, a.lpEquityWorse);
}
function liveExitSeniorValueP3(c, nav, lpValueAtEff, lpEquityWorse) {
  if (lpEquityWorse >= 0n) return minB(nav + minB(lpValueAtEff, lpEquityWorse), c);
  const d = -lpEquityWorse;
  const cP = vaultLpSeniorPricingClaimP3(c, d, nav > c ? nav - c : 0n);
  return minB(nav > d ? nav - d : 0n, cP);
}
function boundVaultRedemptionAtomsP3(shares, totalShares, seniorValue) {
  if (totalShares === 0n || shares > totalShares) return null;
  return shares * seniorValue / totalShares;
}
function boundVaultDepositQuoteP3(a) {
  if (a.totalShares === 0n && a.harvestable !== 0n) return { ok: false, error: "VaultLpHarvestPending" };
  let cEff = a.seniorClaim + a.harvestable * BigInt(a.seniorFeeShareBps) / 10000n;
  const navH = a.nav + a.harvestable;
  if (a.seniorDrawOutstandingAtoms !== 0n) {
    const vBetter = navH + (a.lpEquityBetter > 0n ? a.lpEquityBetter : 0n);
    const above = vBetter > cEff ? vBetter - cEff : 0n;
    cEff += minB(above, a.seniorDrawOutstandingAtoms);
  }
  if (navH < cEff && navH + a.lpValue < cEff) return { ok: false, error: "VaultLpSeniorImpaired" };
  let shares;
  if (a.totalShares === 0n) shares = a.amount;
  else if (cEff === 0n) return { ok: false, error: "EngineInvalidConfig" };
  else shares = a.amount * a.totalShares / cEff;
  if (shares === 0n) return { ok: false, error: "LpVaultZeroSharesMinted" };
  const minted = a.totalShares === 0n ? shares - LP_VAULT_MINIMUM_LIQUIDITY_P3 : shares;
  if (minted <= 0n) return { ok: false, error: "LpVaultDepositBelowMinimumLiquidity" };
  return { ok: true, shares, minted, cEff };
}
function planResolvedVaultLpExitP3(a) {
  const [vaultLpState] = deriveVaultLpStateP3(a.market.programId, a.market.market);
  const crank = withBoundVaultLpTailP3(a.crankFeesIx, vaultLpState, a.market.lpPortfolio);
  const perSeniorTxs = a.seniorRedemptionIxs.map((r) => [crank, withBoundVaultLpTailP3(r, vaultLpState, a.market.lpPortfolio)]);
  const junior = a.junior ? buildVaultLpReleaseSurplusIxP3(a.market, a.junior.juniorOwner, a.junior.amount, a.junior.sourceDomain, {
    juniorDestToken: a.junior.juniorDestToken,
    vaultToken: a.junior.vaultToken
  }) : null;
  return { perSeniorTxs, junior };
}
const RESOLVED_RECEIPT_ACCOUNT_OFF_P3 = 9369;
const RESOLVED_RECEIPT_LEN_P3 = 66;
function decodeResolvedPayoutReceiptP3(portfolioData) {
  const o = RESOLVED_RECEIPT_ACCOUNT_OFF_P3;
  if (portfolioData.length < o + RESOLVED_RECEIPT_LEN_P3) throw new Error(`portfolio data too short for the resolved receipt (${portfolioData.length} B)`);
  const v = new DataView(portfolioData.buffer, portfolioData.byteOffset, portfolioData.byteLength);
  const present = portfolioData[o + 64] !== 0;
  const finalized = portfolioData[o + 65] !== 0;
  return {
    priorBoundContributionNum: u128(v, o),
    liveReleasedFaceAtReceipt: u128(v, o + 16),
    terminalPositiveClaimFace: u128(v, o + 32),
    paidEffective: u128(v, o + 48),
    present,
    finalized,
    open: present && !finalized
  };
}
function buildClaimResolvedPayoutTopupIxP3(a) {
  const keys = buildAccountMetas(ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP, {
    owner: a.owner,
    market: a.market,
    portfolio: a.portfolio,
    destToken: a.destToken,
    vaultToken: a.vaultToken,
    vaultAuthority: deriveVaultAuthority(a.programId, a.market)[0],
    tokenProgram: TOKEN_PROGRAM_ID
  });
  if (!a.signed) {
    keys[0] = { pubkey: a.owner, isSigner: false, isWritable: false };
    keys.push({ pubkey: deriveNftRegistry(a.programId, a.market)[0], isSigner: false, isWritable: false });
  }
  return new TransactionInstruction({ programId: a.programId, keys, data: Buffer.from([46]) });
}
async function listOpenResolvedReceiptsP3(conn, programId, market) {
  const accs = await conn.getProgramAccounts(programId, {
    commitment: "confirmed",
    filters: [{ dataSize: V17_PORTFOLIO_ACCOUNT_LEN }, { memcmp: { offset: 16, bytes: market.toBase58() } }]
  });
  const [registry] = deriveLpVaultRegistry(programId, market);
  const out = [];
  for (const { pubkey, account } of accs) {
    const data = new Uint8Array(account.data);
    const receipt = decodeResolvedPayoutReceiptP3(data);
    if (!receipt.open) continue;
    const owner = new PublicKey(data.subarray(80, 112));
    out.push({ portfolio: pubkey, owner, receipt, isVaultLp: owner.equals(registry), needsHolder: !PublicKey.isOnCurve(owner.toBytes()) && !owner.equals(registry) });
  }
  return out;
}
function buildCloseResolvedUnsignedIxP3(a) {
  const ix2 = buildClaimResolvedPayoutTopupIxP3(a);
  return new TransactionInstruction({ programId: a.programId, keys: ix2.keys, data: Buffer.alloc(17, 0).fill(30, 0, 1) });
}
function planResolvedReceiptRevisitP3(a) {
  const steps = [];
  const needsHolder = [];
  for (const r of a.open) {
    if (r.isVaultLp) continue;
    if (r.needsHolder) {
      needsHolder.push(r);
      continue;
    }
    const destToken = getAssociatedTokenAddressSync(a.collateralMint, r.owner, false, TOKEN_PROGRAM_ID);
    const base = { programId: a.programId, market: a.market, portfolio: r.portfolio, owner: r.owner, destToken, vaultToken: a.vaultToken };
    steps.push({ portfolio: r.portfolio, owner: r.owner, topup46: buildClaimResolvedPayoutTopupIxP3(base), closeResolved: buildCloseResolvedUnsignedIxP3(base) });
  }
  return { steps, needsHolder };
}
export {
  ASSET_STATE_EFFECTIVE_PRICE_OFF_P3,
  ASSET_STATE_RAW_ORACLE_TARGET_PRICE_OFF_P3,
  ASSET_VAULT_LP_DRAW_LEN_P3,
  ASSET_VAULT_LP_DRAW_SLOT_OFF_P3,
  ASSET_VAULT_LP_FIELD_OFF_P3,
  ASSET_VAULT_LP_FLAG_BOUND_P3,
  ASSET_VAULT_LP_LEN_P3,
  ASSET_VAULT_LP_SLOT_OFF_P3,
  BOUND_VAULT_LP_LEDGER_SLOTS_P3,
  BOUND_VAULT_LP_TAIL_INDEX_P3,
  BPF_LOADER_UPGRADEABLE_ID_P3,
  LP_VAULT_MINIMUM_LIQUIDITY_P3,
  LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3,
  POS_SCALE_P3,
  RECOMMENDED_CU_P3,
  RESOLVED_RECEIPT_ACCOUNT_OFF_P3,
  RESOLVED_RECEIPT_LEN_P3,
  V18_KIND_VAULT_LP_STATE_P3,
  VAULT_LP_MATCHER_CTX_LEN_P3,
  VAULT_LP_STATE_ACCOUNT_LEN_P3,
  VAULT_LP_STATE_BODY_LEN_P3,
  VAULT_LP_STATE_OFF_P3,
  assetVaultLpAccountOffsetP3,
  boundVaultDepositQuoteP3,
  boundVaultNavFlooredP3,
  boundVaultRedemptionAtomsP3,
  boundVaultSeniorValueP3,
  buildClaimResolvedPayoutTopupIxP3,
  buildCloseResolvedUnsignedIxP3,
  buildCreateVaultLpMatcherCtxIxP3,
  buildDepositJuniorTrancheIxP3,
  buildExecuteRedemptionIxP3,
  buildInitVaultLpIxP3,
  buildSetVaultLpRiskIxP3,
  buildVaultLpConvertPnlIxP3,
  buildVaultLpRecallIxP3,
  buildVaultLpRefreshCrankIxP3,
  buildVaultLpReleaseSurplusIxP3,
  buildVaultLpSetMatcherIxP3,
  buildVaultLpSettleResolvedIxP3,
  buildWithdrawJuniorTrancheIxP3,
  decodeAssetVaultLpDrawP3,
  decodeAssetVaultLpP3,
  decodeAssetVaultLpRecordP3,
  decodeResolvedPayoutReceiptP3,
  decodeVaultLpStateP3,
  deriveProgramDataAddressP3,
  deriveVaultLpStateP3,
  isLpVaultRegistryBoundP3,
  listOpenResolvedReceiptsP3,
  liveExitSeniorValueP3,
  planResolvedReceiptRevisitP3,
  planResolvedVaultLpExitP3,
  readAssetPricesP3,
  vaultLpEquityLagBoundsP3,
  vaultLpSeniorPricingClaimP3,
  vaultPhysicalIdleBackingAtomsP3,
  vaultPotHeldAtomsP3,
  withBoundVaultLpTailP3
};
//# sourceMappingURL=p3-vault-lp.js.map