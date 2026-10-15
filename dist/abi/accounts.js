import {
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
const ACCOUNTS_INIT_MARKET = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "mint", signer: false, writable: false }
];
const ACCOUNTS_INIT_USER = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true }
];
const ACCOUNTS_INIT_LP = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false }
];
const ACCOUNTS_DEPOSIT_COLLATERAL = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_WITHDRAW_COLLATERAL = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_NFT_HOLDER_AUTH = [
  { name: "nftRegistry", signer: false, writable: false },
  { name: "positionNft", signer: false, writable: false },
  { name: "signerNftAta", signer: false, writable: false }
];
function withNftHolderAuth(base) {
  return [...base, ...ACCOUNTS_NFT_HOLDER_AUTH];
}
const ACCOUNTS_KEEPER_CRANK = [
  { name: "caller", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
const ACCOUNTS_PERMISSIONLESS_CRANK_BASE = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true }
];
const ACCOUNTS_RESTART_ASSET_ORACLE = [
  { name: "authority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_TRADE_NOCPI = [
  { name: "signerA", signer: true, writable: true },
  { name: "signerB", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "accountA", signer: false, writable: true },
  { name: "accountB", signer: false, writable: true }
];
const ACCOUNTS_LIQUIDATE_AT_ORACLE = [
  { name: "unused", signer: false, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
const ACCOUNTS_CLOSE_ACCOUNT = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true }
];
const ACCOUNTS_TOPUP_INSURANCE = [
  { name: "signer", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_TOP_UP_BACKING_BUCKET = [
  { name: "signer", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  // #433: [5] ledger is REQUIRED and [6] systemProgram lets the handler CREATE it when it
  // does not exist yet. That creation is what makes requiring the ledger on
  // WithdrawBackingBucket safe — see ACCOUNTS_WITHDRAW_BACKING_BUCKET. The signer pays rent.
  { name: "ledger", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
const ACCOUNTS_WITHDRAW_BACKING_BUCKET = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "ledger", signer: false, writable: true }
];
const ACCOUNTS_UPDATE_BACKING_FEE_POLICY = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_WITHDRAW_BACKING_BUCKET_EARNINGS = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_TRADE_CPI = [
  { name: "signerA", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "accountA", signer: false, writable: true },
  { name: "accountB", signer: false, writable: true },
  { name: "matcherProg", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherDelegate", signer: false, writable: false }
];
const ACCOUNTS_SET_RISK_THRESHOLD = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_UPDATE_ADMIN = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_ACCEPT_ADMIN = [
  { name: "pendingAdmin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_CLOSE_SLAB_SECONDARY = [
  { name: "dest", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "destAta", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "secondaryVault", signer: false, writable: true },
  { name: "secondaryDestAta", signer: false, writable: true }
];
const ACCOUNTS_CLOSE_SLAB = [
  { name: "dest", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "destAta", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_UPDATE_CONFIG = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false }
];
const ACCOUNTS_SET_MAINTENANCE_FEE = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_SET_ORACLE_PRICE_CAP = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false }
];
const ACCOUNTS_RESOLVE_MARKET = [
  { name: "admin", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_WITHDRAW_INSURANCE = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED = [
  { name: "authority", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "authorityAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "vaultPda", signer: false, writable: false },
  { name: "clock", signer: false, writable: false }
];
const ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE = [
  ...ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED,
  { name: "oracle", signer: false, writable: false }
];
const ACCOUNTS_PAUSE_MARKET = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_UNPAUSE_MARKET = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_RECLAIM_EMPTY_ACCOUNT = [
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false }
];
const ACCOUNTS_SETTLE_ACCOUNT = [
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
const ACCOUNTS_DEPOSIT_FEE_CREDITS = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false }
];
const ACCOUNTS_CONVERT_RELEASED_PNL = [
  { name: "owner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true }
];
const ACCOUNTS_SET_INSURANCE_WITHDRAW_POLICY = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_UPDATE_AUTHORITY = [
  { name: "currentAuthority", signer: true, writable: false },
  { name: "newAuthority", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
function buildAccountMetas(spec, keys) {
  let keysArray;
  if (Array.isArray(keys)) {
    keysArray = keys;
  } else {
    keysArray = spec.map((s) => {
      const key = keys[s.name];
      if (!key) {
        throw new Error(
          `buildAccountMetas: missing key for account "${s.name}". Provided keys: [${Object.keys(keys).join(", ")}]`
        );
      }
      return key;
    });
  }
  if (keysArray.length !== spec.length) {
    throw new Error(
      `Account count mismatch: expected ${spec.length}, got ${keysArray.length}`
    );
  }
  return spec.map((s, i) => ({
    pubkey: keysArray[i],
    isSigner: s.signer,
    isWritable: s.writable
  }));
}
const ACCOUNTS_CREATE_INSURANCE_MINT = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: false },
  { name: "insLpMint", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "collateralMint", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "rent", signer: false, writable: false },
  { name: "payer", signer: true, writable: true }
];
const ACCOUNTS_DEPOSIT_INSURANCE_LP = [
  { name: "depositor", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "depositorAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "insLpMint", signer: false, writable: true },
  { name: "depositorLpAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false }
];
const ACCOUNTS_WITHDRAW_INSURANCE_LP = [
  { name: "withdrawer", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "withdrawerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "insLpMint", signer: false, writable: true },
  { name: "withdrawerLpAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false }
];
const ACCOUNTS_LP_VAULT_WITHDRAW = [
  { name: "withdrawer", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "withdrawerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpVaultMint", signer: false, writable: true },
  { name: "withdrawerLpAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true },
  { name: "creatorLockPda", signer: false, writable: true }
];
const ACCOUNTS_FUND_MARKET_INSURANCE = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "adminAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_SET_INSURANCE_ISOLATION = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_QUEUE_WITHDRAWAL = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "lpVaultState", signer: false, writable: false },
  { name: "withdrawQueue", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
const ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "withdrawQueue", signer: false, writable: true },
  { name: "lpVaultMint", signer: false, writable: true },
  { name: "userLpAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "userAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true }
];
const ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: false },
  { name: "withdrawQueue", signer: false, writable: true }
];
const ACCOUNTS_EXECUTE_ADL = [
  { name: "caller", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
const ACCOUNTS_RESOLVE_PERMISSIONLESS = [
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
const ACCOUNTS_FORCE_CLOSE_RESOLVED = [
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
const ACCOUNTS_ADMIN_FORCE_CLOSE = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false }
];
const ACCOUNTS_CLOSE_STALE_SLABS = [
  { name: "dest", signer: true, writable: true },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_RECLAIM_SLAB_RENT = [
  { name: "dest", signer: true, writable: true },
  { name: "slab", signer: true, writable: true }
];
const ACCOUNTS_AUDIT_CRANK = [
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_ADVANCE_ORACLE_PHASE = [
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_UPDATE_HYPERP_MARK = [
  { name: "slab", signer: false, writable: true },
  { name: "dexPool", signer: false, writable: false },
  { name: "clock", signer: false, writable: false }
];
const ACCOUNTS_CREATE_LP_VAULT = [
  { name: "admin", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "lpMint", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_LP_VAULT_DEPOSIT = [
  { name: "depositor", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "lpMint", signer: false, writable: true },
  { name: "depositorLpAta", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false },
  { name: "siblingLedger", signer: false, writable: true }
];
const ACCOUNTS_LP_VAULT_CRANK_FEES = [
  { name: "cranker", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
const ACCOUNTS_REBALANCE_LP_VAULT_BACKING = [
  { name: "cranker", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: false },
  { name: "fromLedger", signer: false, writable: true },
  { name: "toLedger", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
const ACCOUNTS_CHALLENGE_SETTLEMENT = [
  { name: "challenger", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "dispute", signer: false, writable: true },
  { name: "challengerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false }
];
const ACCOUNTS_RESOLVE_DISPUTE = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "dispute", signer: false, writable: true },
  { name: "challengerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_DEPOSIT_LP_COLLATERAL = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userLpAta", signer: false, writable: true },
  { name: "lpVaultMint", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpEscrow", signer: false, writable: true }
];
const ACCOUNTS_WITHDRAW_LP_COLLATERAL = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userLpAta", signer: false, writable: true },
  { name: "lpVaultMint", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpEscrow", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false }
];
const ACCOUNTS_SET_OFFSET_PAIR = [
  { name: "admin", signer: true, writable: true },
  { name: "slabA", signer: false, writable: true },
  { name: "slabB", signer: false, writable: true },
  { name: "pairPda", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false }
];
const ACCOUNTS_ATTEST_CROSS_MARGIN = [
  { name: "payer", signer: true, writable: true },
  { name: "slabA", signer: false, writable: true },
  { name: "slabB", signer: false, writable: true },
  { name: "attestation", signer: false, writable: true },
  { name: "pairPda", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false }
];
const ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_SET_MAX_PNL_CAP = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_SET_OI_CAP_MULTIPLIER = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_SET_DISPUTE_PARAMS = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_SET_LP_COLLATERAL_PARAMS = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_MINT_POSITION_NFT = [
  { name: "payer", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "positionNftPda", signer: false, writable: true },
  { name: "nftMint", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "owner", signer: true, writable: false },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "token2022Program", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false },
  { name: "rent", signer: false, writable: false }
];
const ACCOUNTS_TRANSFER_POSITION_OWNERSHIP = [
  { name: "currentOwner", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "positionNftPda", signer: false, writable: true },
  { name: "nftMint", signer: false, writable: true },
  { name: "currentOwnerAta", signer: false, writable: true },
  { name: "newOwnerAta", signer: false, writable: true },
  { name: "newOwner", signer: false, writable: false },
  { name: "token2022Program", signer: false, writable: false }
];
const ACCOUNTS_BURN_POSITION_NFT = [
  { name: "owner", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "positionNftPda", signer: false, writable: true },
  { name: "nftMint", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "token2022Program", signer: false, writable: false }
];
const ACCOUNTS_SET_PENDING_SETTLEMENT = [
  { name: "keeper", signer: true, writable: false },
  { name: "slab", signer: false, writable: false },
  { name: "positionNftPda", signer: false, writable: true }
];
const ACCOUNTS_CLEAR_PENDING_SETTLEMENT = [
  { name: "keeper", signer: true, writable: false },
  { name: "slab", signer: false, writable: false },
  { name: "positionNftPda", signer: false, writable: true }
];
const ACCOUNTS_TRANSFER_OWNERSHIP_CPI = [
  { name: "caller", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "nftProgram", signer: false, writable: false }
];
const ACCOUNTS_SET_WALLET_CAP = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true }
];
const ACCOUNTS_RESCUE_ORPHAN_VAULT = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "adminAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "vaultPda", signer: false, writable: false }
];
const ACCOUNTS_CLOSE_ORPHAN_SLAB = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true }
];
const ACCOUNTS_SET_DEX_POOL = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "poolAccount", signer: false, writable: false }
];
const ACCOUNTS_INIT_MATCHER_CTX = [
  { name: "lpOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: false },
  { name: "lpPortfolio", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherProg", signer: false, writable: false },
  { name: "matcherDelegate", signer: false, writable: false }
];
const ACCOUNTS_CONFIGURE_HYBRID_ORACLE = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
  // [2..] oracle feed accounts appended by caller per oracle_leg_count
];
const ACCOUNTS_CONFIGURE_EWMA_MARK = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_PUSH_EWMA_MARK = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_CONFIGURE_AUTH_MARK = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_PUSH_AUTH_MARK = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_SET_MATCHER_CONFIG = [
  { name: "lpOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: false },
  { name: "lpPortfolio", signer: false, writable: true },
  // When enabled=1, also pass:
  { name: "matcherProg", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: false },
  { name: "matcherDelegate", signer: false, writable: false }
];
const ACCOUNTS_WITHDRAW_PROTOCOL_FEE = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_SET_PROTOCOL_FEE_AUTHORITY = [
  { name: "upgradeAuthority", signer: true, writable: false },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_UPDATE_FEE_SPLIT = [
  { name: "admin", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_WITHDRAW_INSURANCE_RESERVE_TO_STAKE = [
  { name: "cranker", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "stakePool", signer: false, writable: false },
  { name: "stakeVault", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_UPDATE_MAINTENANCE_FEE_PER_SLOT = [
  { name: "admin", signer: true, writable: false },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_UPDATE_TRADE_FEE_POLICY = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_EXPIRE_BACKING_BUCKET = [
  { name: "market", signer: false, writable: true }
];
const ACCOUNTS_WITHDRAW_CREATOR_FEE = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_CLOSE_RESOLVED = [
  { name: "owner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP = [
  { name: "owner", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
];
const ACCOUNTS_NFT_ESCROW_PROOF = [
  { name: "nftRegistry", signer: false, writable: false }
];
function withNftEscrowProof(base) {
  return [...base, ...ACCOUNTS_NFT_ESCROW_PROOF];
}
const ACCOUNTS_CLOSE_RESOLVED_UNSIGNED = withNftEscrowProof([
  { name: "owner", signer: false, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
]);
const ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP_UNSIGNED = withNftEscrowProof([
  { name: "owner", signer: false, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false }
]);
const WELL_KNOWN = {
  tokenProgram: TOKEN_PROGRAM_ID,
  clock: SYSVAR_CLOCK_PUBKEY,
  rent: SYSVAR_RENT_PUBKEY,
  systemProgram: SystemProgram.programId
};
export {
  ACCOUNTS_ACCEPT_ADMIN,
  ACCOUNTS_ADMIN_FORCE_CLOSE,
  ACCOUNTS_ADVANCE_ORACLE_PHASE,
  ACCOUNTS_ATTEST_CROSS_MARGIN,
  ACCOUNTS_AUDIT_CRANK,
  ACCOUNTS_BURN_POSITION_NFT,
  ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL,
  ACCOUNTS_CHALLENGE_SETTLEMENT,
  ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL,
  ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP,
  ACCOUNTS_CLAIM_RESOLVED_PAYOUT_TOPUP_UNSIGNED,
  ACCOUNTS_CLEAR_PENDING_SETTLEMENT,
  ACCOUNTS_CLOSE_ACCOUNT,
  ACCOUNTS_CLOSE_ORPHAN_SLAB,
  ACCOUNTS_CLOSE_RESOLVED,
  ACCOUNTS_CLOSE_RESOLVED_UNSIGNED,
  ACCOUNTS_CLOSE_SLAB,
  ACCOUNTS_CLOSE_SLAB_SECONDARY,
  ACCOUNTS_CLOSE_STALE_SLABS,
  ACCOUNTS_CONFIGURE_AUTH_MARK,
  ACCOUNTS_CONFIGURE_EWMA_MARK,
  ACCOUNTS_CONFIGURE_HYBRID_ORACLE,
  ACCOUNTS_CONVERT_RELEASED_PNL,
  ACCOUNTS_CREATE_INSURANCE_MINT,
  ACCOUNTS_CREATE_LP_VAULT,
  ACCOUNTS_DEPOSIT_COLLATERAL,
  ACCOUNTS_DEPOSIT_FEE_CREDITS,
  ACCOUNTS_DEPOSIT_INSURANCE_LP,
  ACCOUNTS_DEPOSIT_LP_COLLATERAL,
  ACCOUNTS_EXECUTE_ADL,
  ACCOUNTS_EXPIRE_BACKING_BUCKET,
  ACCOUNTS_FORCE_CLOSE_RESOLVED,
  ACCOUNTS_FUND_MARKET_INSURANCE,
  ACCOUNTS_INIT_LP,
  ACCOUNTS_INIT_MARKET,
  ACCOUNTS_INIT_MATCHER_CTX,
  ACCOUNTS_INIT_USER,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_LIQUIDATE_AT_ORACLE,
  ACCOUNTS_LP_VAULT_CRANK_FEES,
  ACCOUNTS_LP_VAULT_DEPOSIT,
  ACCOUNTS_LP_VAULT_WITHDRAW,
  ACCOUNTS_MINT_POSITION_NFT,
  ACCOUNTS_NFT_ESCROW_PROOF,
  ACCOUNTS_NFT_HOLDER_AUTH,
  ACCOUNTS_PAUSE_MARKET,
  ACCOUNTS_PERMISSIONLESS_CRANK_BASE,
  ACCOUNTS_PUSH_AUTH_MARK,
  ACCOUNTS_PUSH_EWMA_MARK,
  ACCOUNTS_QUEUE_WITHDRAWAL,
  ACCOUNTS_REBALANCE_LP_VAULT_BACKING,
  ACCOUNTS_RECLAIM_EMPTY_ACCOUNT,
  ACCOUNTS_RECLAIM_SLAB_RENT,
  ACCOUNTS_RESCUE_ORPHAN_VAULT,
  ACCOUNTS_RESOLVE_DISPUTE,
  ACCOUNTS_RESOLVE_MARKET,
  ACCOUNTS_RESOLVE_PERMISSIONLESS,
  ACCOUNTS_RESTART_ASSET_ORACLE,
  ACCOUNTS_SETTLE_ACCOUNT,
  ACCOUNTS_SET_DEX_POOL,
  ACCOUNTS_SET_DISPUTE_PARAMS,
  ACCOUNTS_SET_INSURANCE_ISOLATION,
  ACCOUNTS_SET_INSURANCE_WITHDRAW_POLICY,
  ACCOUNTS_SET_LP_COLLATERAL_PARAMS,
  ACCOUNTS_SET_MAINTENANCE_FEE,
  ACCOUNTS_SET_MATCHER_CONFIG,
  ACCOUNTS_SET_MAX_PNL_CAP,
  ACCOUNTS_SET_OFFSET_PAIR,
  ACCOUNTS_SET_OI_CAP_MULTIPLIER,
  ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK,
  ACCOUNTS_SET_ORACLE_PRICE_CAP,
  ACCOUNTS_SET_PENDING_SETTLEMENT,
  ACCOUNTS_SET_PROTOCOL_FEE_AUTHORITY,
  ACCOUNTS_SET_RISK_THRESHOLD,
  ACCOUNTS_SET_WALLET_CAP,
  ACCOUNTS_TOPUP_INSURANCE,
  ACCOUNTS_TOP_UP_BACKING_BUCKET,
  ACCOUNTS_TRADE_CPI,
  ACCOUNTS_TRADE_NOCPI,
  ACCOUNTS_TRANSFER_OWNERSHIP_CPI,
  ACCOUNTS_TRANSFER_POSITION_OWNERSHIP,
  ACCOUNTS_UNPAUSE_MARKET,
  ACCOUNTS_UPDATE_ADMIN,
  ACCOUNTS_UPDATE_AUTHORITY,
  ACCOUNTS_UPDATE_BACKING_FEE_POLICY,
  ACCOUNTS_UPDATE_CONFIG,
  ACCOUNTS_UPDATE_FEE_SPLIT,
  ACCOUNTS_UPDATE_HYPERP_MARK,
  ACCOUNTS_UPDATE_MAINTENANCE_FEE_PER_SLOT,
  ACCOUNTS_UPDATE_TRADE_FEE_POLICY,
  ACCOUNTS_WITHDRAW_BACKING_BUCKET,
  ACCOUNTS_WITHDRAW_BACKING_BUCKET_EARNINGS,
  ACCOUNTS_WITHDRAW_COLLATERAL,
  ACCOUNTS_WITHDRAW_CREATOR_FEE,
  ACCOUNTS_WITHDRAW_INSURANCE,
  ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE,
  ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED,
  ACCOUNTS_WITHDRAW_INSURANCE_LP,
  ACCOUNTS_WITHDRAW_INSURANCE_RESERVE_TO_STAKE,
  ACCOUNTS_WITHDRAW_LP_COLLATERAL,
  ACCOUNTS_WITHDRAW_PROTOCOL_FEE,
  WELL_KNOWN,
  buildAccountMetas,
  withNftEscrowProof,
  withNftHolderAuth
};
//# sourceMappingURL=accounts.js.map