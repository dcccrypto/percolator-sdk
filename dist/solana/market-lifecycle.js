import { TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  encodeCloseSlab,
  encodeRebalanceReduce,
  encodeWithdrawInsurance,
  encodeWithdrawProtocolFee
} from "../abi/instructions.js";
import {
  ACCOUNTS_CLOSE_SLAB,
  ACCOUNTS_WITHDRAW_INSURANCE,
  ACCOUNTS_WITHDRAW_PROTOCOL_FEE,
  buildAccountMetas
} from "../abi/accounts.js";
import { deriveVaultAuthority } from "./pda.js";
import { parsePortfolioV17, V17_HEADER_LEN, V17_KIND_OFF } from "./slab.js";
const ACCOUNTS_REBALANCE_REDUCE = [
  { name: "owner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true }
];
function buildRebalanceReduceIx(a) {
  if (a.reduceQ <= 0n) throw new Error("buildRebalanceReduceIx: reduceQ must be > 0");
  return new TransactionInstruction({
    programId: a.programId,
    keys: buildAccountMetas(ACCOUNTS_REBALANCE_REDUCE, { owner: a.owner, market: a.market, portfolio: a.portfolio }),
    data: Buffer.from(
      encodeRebalanceReduce({ portfolioId: a.portfolioId, positionEpoch: a.positionEpoch, assetIndex: a.assetIndex, reduceQ: a.reduceQ })
    )
  });
}
function planReduceOnlyExit(programId, owner, market, portfolio, portfolioData, assetIndex = 0) {
  const p = parsePortfolioV17(portfolioData);
  const leg = p.legs.find((l) => l.active && l.assetIndex === assetIndex && l.basisPosQ !== 0n);
  if (!leg) return null;
  const reduceQ = leg.basisPosQ < 0n ? -leg.basisPosQ : leg.basisPosQ;
  return {
    ix: buildRebalanceReduceIx({ programId, owner, market, portfolio, portfolioId: p.portfolioId, positionEpoch: p.matcherPositionEpoch, assetIndex, reduceQ }),
    reduceQ,
    side: leg.basisPosQ > 0n ? "long" : "short"
  };
}
const V17_KIND_CLOSED_MARKET = 8;
function isClosedMarketTombstone(data) {
  if (data === null) return true;
  return data.length === V17_HEADER_LEN && data[V17_KIND_OFF] === V17_KIND_CLOSED_MARKET;
}
function planCloseSlabAttempt(a) {
  if (a.hasLpVault) {
    throw new Error(
      "planCloseSlabAttempt: this market has an Earn LP vault \u2014 CloseSlab can never retire it (LP-vault dead-share floor, by design). Its slab rent is unrecoverable; do not promise reclaim."
    );
  }
  const tokenProgram = a.tokenProgram ?? TOKEN_PROGRAM_ID;
  const [vaultAuthority] = deriveVaultAuthority(a.programId, a.market);
  const ixs = [];
  if (a.protocolFee && a.protocolFee.owed > 0n) {
    ixs.push(new TransactionInstruction({
      programId: a.programId,
      keys: buildAccountMetas(ACCOUNTS_WITHDRAW_PROTOCOL_FEE, {
        authority: a.protocolFee.authority,
        market: a.market,
        destToken: a.protocolFee.destToken,
        vaultToken: a.vaultToken,
        vaultAuthority,
        tokenProgram
      }),
      data: Buffer.from(encodeWithdrawProtocolFee({ amount: 0n, authorityEpoch: a.protocolFee.authorityEpoch }))
    }));
  }
  if (a.insuranceRecredit && a.insuranceRecredit.amount > 0n) {
    const keys = buildAccountMetas(ACCOUNTS_WITHDRAW_INSURANCE, {
      authority: a.insuranceRecredit.authority,
      market: a.market,
      destToken: a.insuranceRecredit.destToken,
      vaultToken: a.vaultToken,
      vaultAuthority,
      tokenProgram
    });
    if (a.insuranceRecredit.ledger) keys.push({ pubkey: a.insuranceRecredit.ledger, isSigner: false, isWritable: true });
    ixs.push(new TransactionInstruction({
      programId: a.programId,
      keys,
      data: Buffer.from(encodeWithdrawInsurance({ amount: a.insuranceRecredit.amount }))
    }));
  }
  ixs.push(new TransactionInstruction({
    programId: a.programId,
    keys: buildAccountMetas(ACCOUNTS_CLOSE_SLAB, {
      dest: a.closer,
      slab: a.market,
      vault: a.vaultToken,
      vaultAuthority,
      destAta: a.closerDestToken,
      tokenProgram
    }),
    data: Buffer.from(encodeCloseSlab(a.closeAuthorityEpoch))
  }));
  return ixs;
}
export {
  ACCOUNTS_REBALANCE_REDUCE,
  V17_KIND_CLOSED_MARKET,
  buildRebalanceReduceIx,
  isClosedMarketTombstone,
  planCloseSlabAttempt,
  planReduceOnlyExit
};
//# sourceMappingURL=market-lifecycle.js.map