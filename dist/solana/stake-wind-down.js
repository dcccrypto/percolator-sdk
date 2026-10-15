import { TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ACCOUNTS_WITHDRAW_PROTOCOL_FEE, buildAccountMetas } from "../abi/accounts.js";
import { encodeWithdrawProtocolFee } from "../abi/instructions.js";
import {
  adminCloseSlabAccounts,
  encodeStakeAdminCloseSlab,
  encodeStakeRecoverTerminalInsurance,
  recoverTerminalInsuranceAccounts
} from "./stake.js";
import { deriveVaultAuthority } from "./pda.js";
import { V17_KIND_OFF, V17_MARKET_ASSET_SLOT_LEN, V17_MARKET_GROUP_LEN, V17_MARKET_GROUP_OFF } from "./slab.js";
const MARKET_GROUP_HEADER_OFF_V18 = Object.freeze({
  vault: 285,
  insurance: 301,
  cTot: 317,
  sourceInsuranceCreditReservedTotalAtoms: 445,
  insuranceDomainBudgetRemainingTotal: 461,
  materializedPortfolioCount: 517,
  mode: 626
});
const ENGINE_ASSET_SLOT_OFF_V18 = Object.freeze({
  insuranceDomainBudgetLong: 515,
  insuranceDomainBudgetShort: 531,
  insuranceDomainSpentLong: 547,
  insuranceDomainSpentShort: 563,
  /** InsuranceCreditReservationV16Account; `insurance_credit_reserved_num` is its first u128. */
  insuranceReservationLong: 1157,
  insuranceReservationShort: 1229
});
const ASSET_WRAPPER_LEN = 1024;
const ENGINE_BOUND_SCALE = 1000000000000n;
const MARKET_MODE_V18 = Object.freeze({ Live: 0, Resolved: 1, Recovery: 2 });
function u128(d, o) {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return v.getBigUint64(o + 8, true) << 64n | v.getBigUint64(o, true);
}
function u64(d, o) {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(o, true);
}
const min = (a, b) => a < b ? a : b;
const subSat = (a, b) => a > b ? a - b : 0n;
const ceilDiv = (a, b) => (a + b - 1n) / b;
function decodeTerminalInsuranceCapacity(marketData, assetIndex = 0) {
  if (marketData[V17_KIND_OFF] !== 1) throw new Error(`not a market account (kind ${marketData[V17_KIND_OFF]})`);
  const H = V17_MARKET_GROUP_OFF;
  const hdr = MARKET_GROUP_HEADER_OFF_V18;
  const slotBase = H + V17_MARKET_GROUP_LEN + assetIndex * V17_MARKET_ASSET_SLOT_LEN + ASSET_WRAPPER_LEN;
  const E = ENGINE_ASSET_SLOT_OFF_V18;
  if (!Number.isInteger(assetIndex) || assetIndex < 0 || marketData.length < slotBase + E.insuranceReservationShort + 16) {
    throw new Error(`market account too short for asset ${assetIndex}`);
  }
  const vault = u128(marketData, H + hdr.vault);
  const insurance = u128(marketData, H + hdr.insurance);
  const sourceReserved = u128(marketData, H + hdr.sourceInsuranceCreditReservedTotalAtoms);
  const globalAvailable = subSat(insurance, sourceReserved);
  const mode = marketData[H + hdr.mode];
  const dom = (side) => {
    const L = side === "long";
    const budget = u128(marketData, slotBase + (L ? E.insuranceDomainBudgetLong : E.insuranceDomainBudgetShort));
    const spent = u128(marketData, slotBase + (L ? E.insuranceDomainSpentLong : E.insuranceDomainSpentShort));
    const reservedAtoms = ceilDiv(u128(marketData, slotBase + (L ? E.insuranceReservationLong : E.insuranceReservationShort)), ENGINE_BOUND_SCALE);
    const budgetRemaining = subSat(subSat(budget, spent), reservedAtoms);
    return {
      domain: assetIndex * 2 + (L ? 0 : 1),
      side,
      budget,
      spent,
      reservedAtoms,
      budgetRemaining,
      withdrawCapacity: min(min(globalAvailable, budgetRemaining), vault)
    };
  };
  const domains = [dom("long"), dom("short")];
  const sum = domains[0].withdrawCapacity + domains[1].withdrawCapacity;
  return {
    assetIndex,
    mode,
    resolved: mode === MARKET_MODE_V18.Resolved,
    vault,
    insurance,
    cTot: u128(marketData, H + hdr.cTot),
    materializedPortfolioCount: u64(marketData, H + hdr.materializedPortfolioCount),
    sourceInsuranceCreditReservedTotalAtoms: sourceReserved,
    globalAvailable,
    headerBudgetRemainingTotal: u128(marketData, H + hdr.insuranceDomainBudgetRemainingTotal),
    assetBudgetRemaining: subSat(domains[0].budget, domains[0].spent) + subSat(domains[1].budget, domains[1].spent),
    domains,
    terminalCapacity: min(min(sum, globalAvailable), vault)
  };
}
function buildRecoverTerminalInsuranceIx(a, amount) {
  return new TransactionInstruction({
    programId: a.stakeProgram,
    keys: recoverTerminalInsuranceAccounts(a),
    data: Buffer.from(encodeStakeRecoverTerminalInsurance(amount))
  });
}
function buildAdminCloseSlabIx(a) {
  return new TransactionInstruction({
    programId: a.stakeProgram,
    keys: adminCloseSlabAccounts(a),
    data: Buffer.from(encodeStakeAdminCloseSlab())
  });
}
function planStakeWindDown(a) {
  const cap = decodeTerminalInsuranceCapacity(a.marketData, 0);
  if (!cap.resolved) throw new Error(`planStakeWindDown: market mode ${cap.mode} is not Resolved (1)`);
  const tokenProgram = a.tokenProgram ?? TOKEN_PROGRAM_ID;
  const [wrapperVaultAuthority] = deriveVaultAuthority(a.wrapperProgram, a.market);
  const base = {
    stakeProgram: a.stakeProgram,
    caller: a.caller,
    pool: a.pool,
    poolVault: a.poolVault,
    vaultAuth: a.vaultAuth,
    market: a.market,
    wrapperVault: a.wrapperVault,
    wrapperVaultAuthority,
    wrapperProgram: a.wrapperProgram,
    tokenProgram
  };
  const steps = [{ step: "closePortfolios", ixs: a.closePortfolioIxs }];
  if (cap.terminalCapacity > 0n) {
    steps.push({
      step: "recoverTerminal",
      amount: cap.terminalCapacity,
      ix: buildRecoverTerminalInsuranceIx(base, cap.terminalCapacity),
      onCustomError: Object.freeze({ 21: "retryLater", 31: "done" })
    });
  }
  steps.push({
    step: "recoverTerminalBookOnly",
    ix: buildRecoverTerminalInsuranceIx({ ...base, stray: a.stray }, 0n),
    onCustomError: Object.freeze({ 31: "done" })
  });
  const claim = a.protocolFee ? new TransactionInstruction({
    programId: a.wrapperProgram,
    keys: buildAccountMetas(ACCOUNTS_WITHDRAW_PROTOCOL_FEE, {
      authority: a.protocolFee.authority,
      market: a.market,
      destToken: a.protocolFee.destToken,
      vaultToken: a.wrapperVault,
      vaultAuthority: wrapperVaultAuthority,
      tokenProgram
    }),
    data: Buffer.from(encodeWithdrawProtocolFee({ amount: 0n, authorityEpoch: a.protocolFee.authorityEpoch }))
  }) : null;
  steps.push({
    step: "adminCloseSlab",
    repeatUntil: "tombstone",
    claimBetween: claim,
    ix: buildAdminCloseSlabIx({
      stakeProgram: a.stakeProgram,
      admin: a.admin,
      pool: a.pool,
      market: a.market,
      wrapperVault: a.wrapperVault,
      wrapperVaultAuthority,
      poolDestToken: a.poolDestToken,
      collateralMint: a.collateralMint,
      poolVault: a.poolVault,
      wrapperProgram: a.wrapperProgram,
      tokenProgram
    })
  });
  return steps;
}
export {
  ENGINE_ASSET_SLOT_OFF_V18,
  ENGINE_BOUND_SCALE,
  MARKET_GROUP_HEADER_OFF_V18,
  MARKET_MODE_V18,
  buildAdminCloseSlabIx,
  buildRecoverTerminalInsuranceIx,
  decodeTerminalInsuranceCapacity,
  planStakeWindDown
};
//# sourceMappingURL=stake-wind-down.js.map