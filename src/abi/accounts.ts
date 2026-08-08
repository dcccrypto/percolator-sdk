import {
  PublicKey,
  AccountMeta,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

/**
 * Account spec for building instruction account metas.
 * Each instruction has a fixed ordering that matches the Rust processor.
 */
export interface AccountSpec {
  name: string;
  signer: boolean;
  writable: boolean;
}

// ============================================================================
// ACCOUNT ORDERINGS - Single source of truth
// ============================================================================

/**
 * InitMarket: 9 accounts (Pyth Pull - feed_id is in instruction data, not as accounts)
 */
export const ACCOUNTS_INIT_MARKET: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "mint", signer: false, writable: false },
  { name: "vault", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
  { name: "rent", signer: false, writable: false },
  { name: "dummyAta", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false },
] as const;

/**
 * InitPortfolio (tag 2): 3 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_init_portfolio):
 *   [0] owner      signer, writable (portfolio owner; pays for alloc)
 *   [1] market     writable (market-group slab; must be program-owned)
 *   [2] portfolio  writable (portfolio PDA; must be program-owned)
 *
 * v12 clock sysvar, userAta, vault, tokenProgram are gone — v17
 * InitPortfolio does not transfer collateral and does not read the clock.
 */
export const ACCOUNTS_INIT_USER: readonly AccountSpec[] = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
] as const;

/**
 * InitLP: 6 accounts
 * Program at percolator.rs:6607 calls expect_len(accounts, 6).
 * The 6th account (accounts[5]) is the clock sysvar — used via Clock::from_account_info.
 * [0] user         signer, writable (LP owner; pays fee)
 * [1] slab         writable
 * [2] userAta      writable (collateral source for fee)
 * [3] vault        writable (collateral destination)
 * [4] tokenProgram read-only
 * [5] clock        read-only (SYSVAR_CLOCK_PUBKEY)
 */
export const ACCOUNTS_INIT_LP: readonly AccountSpec[] = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
] as const;

/**
 * Deposit (tag 3): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_deposit):
 *   [0] owner        signer (portfolio owner)
 *   [1] market       writable (market-group slab; must be program-owned)
 *   [2] portfolio    writable (portfolio PDA; must be program-owned)
 *   [3] sourceToken  writable (owner's collateral ATA)
 *   [4] vaultToken   writable (program vault token account)
 *   [5] tokenProgram read-only
 *
 * v12 stale accounts removed: clock sysvar. Portfolio account added at [2].
 * v17 amount is u128 (see instructions.ts encodeDepositCollateral).
 */
export const ACCOUNTS_DEPOSIT_COLLATERAL: readonly AccountSpec[] = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * Withdraw (tag 4): 7 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw):
 *   [0] owner          signer (portfolio owner)
 *   [1] market         writable (market-group slab; must be program-owned)
 *   [2] portfolio      writable (portfolio PDA; must be program-owned)
 *   [3] destToken      writable (owner's collateral ATA — destination)
 *   [4] vaultToken     writable (program vault token account — source)
 *   [5] vaultAuthority read-only (PDA that signs token CPI)
 *   [6] tokenProgram   read-only
 *
 * v12 stale accounts removed: clock sysvar, oracleIdx. Portfolio added at [2].
 * v17 amount is u128 (see instructions.ts encodeWithdrawCollateral).
 */
export const ACCOUNTS_WITHDRAW_COLLATERAL: readonly AccountSpec[] = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * E2 (native NFT-holder auth): the OPTIONAL trailing accounts that let the CURRENT
 * HOLDER of a position's bound NFT operate an NFT-escrowed position — deposit
 * (margin-defend), withdraw, trade_cpi/batch_trade_cpi, close_resolved,
 * claim_resolved_payout, convert/forfeit/rebalance. Append these to the base
 * account list when the signer is the NFT holder (not `portfolio.owner`); omit
 * them for the normal `owner == signer` path. The wrapper reads them as trailing
 * optional accounts and routes funds to the SIGNER (the holder), never the escrow PDA.
 *   [+0] nftRegistry  — `["nft_registry", marketGroup]` PDA (under the wrapper program)
 *   [+1] positionNft  — `["position_nft", portfolio, marketId_le]` PDA (the NFT program)
 *   [+2] signerNftAta — the signer's token account holding the bound NFT (amount == 1)
 */
export const ACCOUNTS_NFT_HOLDER_AUTH: readonly AccountSpec[] = [
  { name: "nftRegistry", signer: false, writable: false },
  { name: "positionNft", signer: false, writable: false },
  { name: "signerNftAta", signer: false, writable: false },
] as const;

/**
 * Append the E2 NFT-holder-auth trio to any owner-gated account list, so the bound
 * NFT's holder can operate an escrowed position. No-op semantics for the wrapper
 * when the signer is the portfolio owner (it takes the fast path and ignores them).
 */
export function withNftHolderAuth(base: readonly AccountSpec[]): AccountSpec[] {
  return [...base, ...ACCOUNTS_NFT_HOLDER_AUTH];
}

/**
 * KeeperCrank: 4 accounts
 * @deprecated v12.x only. Use ACCOUNTS_PERMISSIONLESS_CRANK in v17.
 */
export const ACCOUNTS_KEEPER_CRANK: readonly AccountSpec[] = [
  { name: "caller", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false },
] as const;

/**
 * PermissionlessCrank (tag 5): 3 fixed accounts + variable oracle tail.
 *
 * v17 wire account layout (v16_program.rs handle_permissionless_crank):
 *   [0] owner         signer, writable (keeper key; receives liquidation reward)
 *   [1] market        writable (the market-group slab)
 *   [2] portfolio     writable (the PORTFOLIO being cranked / liquidated)
 *   [3..] oracleTail  read-only oracle accounts (Pyth PriceUpdateV2 PDAs, one per asset)
 *
 * For liquidation with reward (action=1 and cfg.liquidation_cranker_fee_share_bps!=0),
 * the LAST oracle tail account must be the keeper's OWN portfolio (writable), so the
 * program can credit the liquidation fee there. The keeper portfolio must be owned by
 * the same program and have a different key from accounts[2].
 *
 * Use buildPermissionlessCrankKeys() (in keeper) to assemble the full account list
 * including oracle tail and optional keeper portfolio.
 */
export const ACCOUNTS_PERMISSIONLESS_CRANK_BASE: readonly AccountSpec[] = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
] as const;

/**
 * RestartAssetOracle (tag 69): 2 accounts.
 *
 * v17 wire account layout (v16_program.rs:9660 handle_restart_asset_oracle):
 *   [0] authority     signer (asset_admin for the target asset_index)
 *   [1] market        writable (the market-group slab)
 *
 * Gated by the asset's asset_admin key (per-asset in AssetOracleProfileV16).
 * Only callable when the asset lifecycle == ASSET_LIFECYCLE_RECOVERY.
 * Permissionless in the sense that any holder of asset_admin can call it.
 */
export const ACCOUNTS_RESTART_ASSET_ORACLE: readonly AccountSpec[] = [
  { name: "authority", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
] as const;


/**
 * TradeNoCpi (tag 9): 5 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_trade_nocpi):
 *   [0] signerA   signer, writable (party A — portfolio owner)
 *   [1] signerB   signer, writable (party B — portfolio owner)
 *   [2] market    writable (market-group slab; program-owned)
 *   [3] accountA  writable (portfolio A; program-owned)
 *   [4] accountB  writable (portfolio B; program-owned)
 *
 * v12 stale accounts removed: lp, clock, oracle. market replaces slab.
 * signerB replaces lp (both portfolios must have live owner signers).
 */
export const ACCOUNTS_TRADE_NOCPI: readonly AccountSpec[] = [
  { name: "signerA", signer: true, writable: true },
  { name: "signerB", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "accountA", signer: false, writable: true },
  { name: "accountB", signer: false, writable: true },
] as const;

/**
 * LiquidateAtOracle: 4 accounts
 * Note: account[0] is unused but must be present
 */
export const ACCOUNTS_LIQUIDATE_AT_ORACLE: readonly AccountSpec[] = [
  { name: "unused", signer: false, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false },
] as const;

/**
 * ClosePortfolio (tag 8): 3 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_close_portfolio):
 *   [0] owner      signer, writable (portfolio owner or marketauth on terminal cleanup)
 *   [1] market     writable (market-group slab; program-owned)
 *   [2] portfolio  writable (portfolio PDA being closed; program-owned)
 *
 * v12 stale accounts removed: vault, userAta, vaultPda, tokenProgram, clock, oracle.
 * v17 ClosePortfolio does not transfer collateral — it simply deregisters the
 * portfolio and closes the account back to the market slab.
 */
export const ACCOUNTS_CLOSE_ACCOUNT: readonly AccountSpec[] = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
] as const;

/**
 * TopUpInsurance (tag 9): 5 fixed accounts + 1 optional.
 *
 * v17 wire account layout (v16_program.rs handle_top_up_insurance):
 *   [0] signer       signer, writable (insurance authority for asset 0)
 *   [1] market       writable (market-group slab; program-owned)
 *   [2] sourceToken  writable (signer's collateral ATA — source)
 *   [3] vaultToken   writable (program vault token account — destination)
 *   [4] tokenProgram read-only
 *   [5] ledger       writable, optional (per-asset InsuranceLedger PDA)
 *
 * v12 stale accounts removed: clock sysvar (was at [5]).
 * v17 amount is u128 (see instructions.ts encodeTopUpInsurance).
 * Pass ledger PDA derived via deriveInsuranceLedger() when tracking
 * per-authority deposit principals; omit for simple vault top-ups.
 */
export const ACCOUNTS_TOPUP_INSURANCE: readonly AccountSpec[] = [
  { name: "signer", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * TopUpBackingBucket (tag 24): 5 accounts (+1 optional).
 *
 * v17 wire account layout (v16_program.rs handle_top_up_backing_bucket):
 *   [0] signer       signer, writable — must == the asset's backing_bucket_authority
 *   [1] market       writable (market-group slab; program-owned)
 *   [2] sourceToken  writable (signer's collateral ATA — source of the deposit)
 *   [3] vaultToken   writable (program vault token account — destination)
 *   [4] tokenProgram read-only
 *   [5] ledger       writable, optional (per-domain BackingDomainLedger PDA;
 *                    omit for a simple top-up with no ledger tracking)
 *
 * v17 amount/expiry are u128/u64 (see instructions.ts encodeTopUpBackingBucket).
 */
export const ACCOUNTS_TOP_UP_BACKING_BUCKET: readonly AccountSpec[] = [
  { name: "signer", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "sourceToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * WithdrawBackingBucket (tag 50): 6 fixed accounts + optional ledger.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw_backing_bucket):
 *   [0] authority      signer — the asset's backing_bucket_authority (or marketauth)
 *   [1] market         writable (market-group slab; program-owned)
 *   [2] destToken      writable (authority-OWNED token account — destination)
 *   [3] vaultToken     writable (program vault token account — source)
 *   [4] vaultAuthority read-only (PDA that signs the token CPI)
 *   [5] tokenProgram   read-only
 *   [6] ledger         writable, optional (per-domain BackingDomainLedger PDA)
 */
export const ACCOUNTS_WITHDRAW_BACKING_BUCKET: readonly AccountSpec[] = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * UpdateBackingFeePolicy (tag 51): 2 accounts — the LP-yield on/off switch.
 *
 * v17 wire account layout (v16_program.rs handle_update_backing_fee_policy):
 *   [0] authority signer — the asset's insurance_authority (NOT marketauth,
 *                 so it stays callable by the creator wallet after the
 *                 launch flow rotates marketauth to the stake-pool PDA)
 *   [1] market    writable (market-group slab; program-owned)
 */
export const ACCOUNTS_UPDATE_BACKING_FEE_POLICY: readonly AccountSpec[] = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
] as const;

/**
 * WithdrawBackingBucketEarnings (tag 52): 7 accounts — ledger REQUIRED.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw_backing_bucket_earnings):
 *   [0] authority      signer — the asset's backing_bucket_authority (or marketauth)
 *   [1] market         writable (market-group slab; program-owned)
 *   [2] ledger         writable, REQUIRED (per-domain BackingDomainLedger PDA;
 *                      unlike tag 50 where it is an optional tail)
 *   [3] destToken      writable (authority-OWNED token account — destination)
 *   [4] vaultToken     writable (program vault token account — source)
 *   [5] vaultAuthority read-only (PDA that signs the token CPI)
 *   [6] tokenProgram   read-only
 */
export const ACCOUNTS_WITHDRAW_BACKING_BUCKET_EARNINGS: readonly AccountSpec[] = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * TradeCpi (tag 10): 7 fixed accounts + optional tail.
 *
 * v17 wire account layout (v16_program.rs handle_trade_cpi):
 *   [0] signerA          signer (party A — portfolio owner)
 *   [1] market           writable (market-group slab; program-owned)
 *   [2] accountA         writable (portfolio A; program-owned)
 *   [3] accountB         writable (portfolio B; program-owned)
 *   [4] matcherProg      read-only, executable (matcher program)
 *   [5] matcherCtx       writable (matcher context account; owned by matcherProg)
 *   [6] matcherDelegate  read-only (PDA derived by deriveMatcherDelegate())
 *   [7+] tail            additional accounts forwarded to matcher CPI
 *
 * v12 stale accounts removed: lpOwner, clock, oracle, lpPda.
 * matcherDelegate replaces lpPda — derive via deriveMatcherDelegate().
 * market replaces slab name.
 */
export const ACCOUNTS_TRADE_CPI: readonly AccountSpec[] = [
  { name: "signerA", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "accountA", signer: false, writable: true },
  { name: "accountB", signer: false, writable: true },
  { name: "matcherProg", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherDelegate", signer: false, writable: false },
] as const;

/**
 * SetRiskThreshold: 2 accounts
 */
export const ACCOUNTS_SET_RISK_THRESHOLD: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
] as const;

/**
 * UpdateAdmin: 2 accounts
 */
export const ACCOUNTS_UPDATE_ADMIN: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
] as const;

/**
 * AcceptAdmin: 2 accounts (tag 82)
 * Second half of two-step admin transfer. The proposed new admin must sign to
 * complete the transfer. Program at percolator.rs:7994 calls expect_len(accounts, 2).
 * [0] pendingAdmin  signer, writable (must match config.pending_admin)
 * [1] slab          writable
 */
export const ACCOUNTS_ACCEPT_ADMIN: readonly AccountSpec[] = [
  { name: "pendingAdmin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
] as const;

/**
 * CloseSlab: 6 accounts
 * Drains vault and recovers rent after market is fully resolved and all accounts closed.
 * Program at percolator.rs:8033 calls expect_len(accounts, 6).
 * [0] dest            signer, writable (receives rent + drained vault tokens)
 * [1] slab            writable
 * [2] vault           writable (token account — drained)
 * [3] vaultAuthority  read-only (PDA that signs the drain transfer)
 * [4] destAta         writable (dest's token ATA receiving drained tokens)
 * [5] tokenProgram    read-only
 */
export const ACCOUNTS_CLOSE_SLAB: readonly AccountSpec[] = [
  { name: "dest", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "destAta", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * UpdateConfig: 3 accounts (canonical) or 4 (with oracle).
 * v12.19 wrapper at src/percolator.rs:9544 accepts either.
 * 3-account form: [admin(s+w), slab(w), clock].
 * 4-account form: [admin(s+w), slab(w), clock, oracle] (used when the wrapper
 * needs to re-read price during config commit). Default to the 3-account form;
 * callers that need oracle re-reads should append the oracle account themselves.
 */
export const ACCOUNTS_UPDATE_CONFIG: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
] as const;

/**
 * SetMaintenanceFee: 2 accounts
 */
export const ACCOUNTS_SET_MAINTENANCE_FEE: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
] as const;

/**
 * SetOraclePriceCap: 3 accounts.
 * v12.19 wrapper at src/percolator.rs:9654 calls accounts::expect_len(3).
 * Layout: [admin(s+w), slab(w), clock].
 */
export const ACCOUNTS_SET_ORACLE_PRICE_CAP: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
] as const;

/**
 * ResolveMarket: 4 accounts.
 * v12.19 wrapper at src/percolator.rs:9748 calls accounts::expect_len(4).
 * Layout: [admin(s+w), slab(w), clock, oracle].
 */
export const ACCOUNTS_RESOLVE_MARKET: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false },
] as const;

/**
 * WithdrawInsurance (tag 41): 6 fixed accounts + 1 optional.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw_insurance):
 *   [0] authority       signer, writable (insurance authority)
 *   [1] market          writable (market-group slab; program-owned)
 *   [2] destToken       writable (authority's collateral ATA — destination)
 *   [3] vaultToken      writable (program vault token account — source)
 *   [4] vaultAuthority  read-only (PDA that signs token CPI)
 *   [5] tokenProgram    read-only
 *   [6] ledger          writable, optional (per-authority InsuranceLedger PDA)
 *
 * v12 stale ordering fixed: vaultPda was at [5] after tokenProgram.
 * v17 layout: dest_token → vault_token → vault_authority → token_program.
 * Only callable on terminal markets (mode==1, materialized_portfolio_count==0).
 */
export const ACCOUNTS_WITHDRAW_INSURANCE: readonly AccountSpec[] = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * WithdrawInsuranceLimited (tag 23): 7 or 8 accounts.
 * On live markets the 8th oracle account is REQUIRED (upstream 8ce8d54):
 * the handler does a same-instruction accrue_market_to against the fresh
 * oracle price to prevent withdrawals against overstated insurance.
 * On resolved markets the oracle is frozen — 7 accounts suffice.
 */
export const ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED: readonly AccountSpec[] = [
  { name: "authority", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "authorityAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "vaultPda", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
] as const;

export const ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE: readonly AccountSpec[] = [
  ...ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED,
  { name: "oracle", signer: false, writable: false },
] as const;

/**
 * PauseMarket: 2 accounts
 */
export const ACCOUNTS_PAUSE_MARKET: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
] as const;

/**
 * UnpauseMarket: 2 accounts
 */
export const ACCOUNTS_UNPAUSE_MARKET: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
] as const;

// ============================================================================
// G-3 / G-4 / G-2 fixes (audit-2026-04-27): missing ACCOUNTS_ specs.
// Wrapper handlers at src/percolator.rs:10470 (reclaim), 10503 (settle),
// 10557 (deposit_fee_credits), 10636 (convert_released_pnl), 9990
// (set_insurance_withdraw_policy), 6876 (update_authority).
// ============================================================================

/**
 * ReclaimEmptyAccount (tag 25): 2 accounts. Permissionless.
 * Wrapper: src/percolator.rs:10470.
 */
export const ACCOUNTS_RECLAIM_EMPTY_ACCOUNT: readonly AccountSpec[] = [
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
] as const;

/**
 * SettleAccount (tag 26): 3 accounts. Permissionless.
 * Wrapper: src/percolator.rs:10503.
 */
export const ACCOUNTS_SETTLE_ACCOUNT: readonly AccountSpec[] = [
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false },
] as const;

/**
 * DepositFeeCredits (tag 27): 6 accounts. Owner only.
 * Wrapper: src/percolator.rs:10557. SPL transfer requires userAta + vault writable.
 */
export const ACCOUNTS_DEPOSIT_FEE_CREDITS: readonly AccountSpec[] = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
] as const;

/**
 * ConvertReleasedPnl (tag 28): 4 accounts. Owner only.
 * Wrapper: src/percolator.rs:10636.
 */
export const ACCOUNTS_CONVERT_RELEASED_PNL: readonly AccountSpec[] = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false },
] as const;

/**
 * SetInsuranceWithdrawPolicy (tag 22): 2 accounts. Admin only.
 * Wrapper: src/percolator.rs:9990.
 */
export const ACCOUNTS_SET_INSURANCE_WITHDRAW_POLICY: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
] as const;

/**
 * UpdateAuthority (tag 83, v12.18.x 4-way split): 3 accounts.
 * Wrapper: src/percolator.rs:6876.
 *
 * Both the current authority and the new authority must sign. For burn
 * (`new_pubkey == default()`) the new account is still passed but does
 * not need to sign per wrapper L7036 region.
 */
export const ACCOUNTS_UPDATE_AUTHORITY: readonly AccountSpec[] = [
  { name: "currentAuthority", signer: true, writable: false },
  { name: "newAuthority", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
] as const;

// ============================================================================
// ACCOUNT META BUILDERS
// ============================================================================

/**
 * Build AccountMeta array from spec and provided pubkeys.
 *
 * Accepts either:
 *   - `PublicKey[]`  — ordered array, one entry per spec account (legacy form)
 *   - `Record<string, PublicKey>` — named map keyed by account `name` (preferred form)
 *
 * Named-map form resolves accounts by spec name so callers don't have to
 * remember the positional order, and errors clearly on missing names.
 */
export function buildAccountMetas(
  spec: readonly AccountSpec[],
  keys: PublicKey[] | Record<string, PublicKey>
): AccountMeta[] {
  let keysArray: PublicKey[];

  if (Array.isArray(keys)) {
    keysArray = keys;
  } else {
    // Named map: resolve by spec name
    keysArray = spec.map((s) => {
      const key = (keys as Record<string, PublicKey>)[s.name];
      if (!key) {
        throw new Error(
          `buildAccountMetas: missing key for account "${s.name}". ` +
          `Provided keys: [${Object.keys(keys).join(", ")}]`
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
    isWritable: s.writable,
  }));
}

/**
 * CreateInsuranceMint: 9 accounts
 * Creates SPL mint PDA for insurance LP tokens. Admin only, once per market.
 */
export const ACCOUNTS_CREATE_INSURANCE_MINT: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: false },
  { name: "insLpMint", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "collateralMint", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "rent", signer: false, writable: false },
  { name: "payer", signer: true, writable: true },
] as const;

/**
 * DepositInsuranceLP: 8 accounts
 * Deposit collateral into insurance fund, receive LP tokens.
 */
export const ACCOUNTS_DEPOSIT_INSURANCE_LP: readonly AccountSpec[] = [
  { name: "depositor", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "depositorAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "insLpMint", signer: false, writable: true },
  { name: "depositorLpAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
] as const;

/**
 * WithdrawInsuranceLP: 8 accounts
 * Burn LP tokens and withdraw proportional share of insurance fund.
 */
export const ACCOUNTS_WITHDRAW_INSURANCE_LP: readonly AccountSpec[] = [
  { name: "withdrawer", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "withdrawerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "insLpMint", signer: false, writable: true },
  { name: "withdrawerLpAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
] as const;

// ============================================================================
// PERC-627 / GH#1926: LpVaultWithdraw (tag 39)
// ============================================================================

/**
 * LpVaultWithdraw: 10 accounts (tag 39, PERC-627 / GH#1926 / PERC-8287)
 *
 * Burn LP vault tokens and withdraw proportional collateral from the LP vault.
 *
 * accounts[9] = creatorLockPda is REQUIRED since percolator-prog PR#170.
 * Non-creator withdrawers must pass the derived PDA key; if no lock exists
 * on-chain the enforcement is a no-op. Omitting it was the bypass vector
 * fixed in GH#1926. Use `deriveCreatorLockPda(programId, slab)` to compute.
 *
 * Accounts:
 *  [0] withdrawer        signer, read-only
 *  [1] slab              writable
 *  [2] withdrawerAta     writable (collateral destination)
 *  [3] vault             writable (collateral source)
 *  [4] tokenProgram      read-only
 *  [5] lpVaultMint       writable (LP tokens burned from here)
 *  [6] withdrawerLpAta   writable (LP tokens source)
 *  [7] vaultAuthority    read-only (PDA that signs token transfers)
 *  [8] lpVaultState      writable
 *  [9] creatorLockPda    writable (REQUIRED — derived from ["creator_lock", slab])
 */
export const ACCOUNTS_LP_VAULT_WITHDRAW: readonly AccountSpec[] = [
  { name: "withdrawer", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "withdrawerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpVaultMint", signer: false, writable: true },
  { name: "withdrawerLpAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true },
  { name: "creatorLockPda", signer: false, writable: true },
] as const;

/**
 * FundMarketInsurance: 5 accounts (PERC-306)
 * Fund per-market isolated insurance balance.
 */
export const ACCOUNTS_FUND_MARKET_INSURANCE: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "adminAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * SetInsuranceIsolation: 2 accounts (PERC-306)
 * Set max % of global fund this market can access.
 */
export const ACCOUNTS_SET_INSURANCE_ISOLATION: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
] as const;

// ============================================================================
// PERC-309: QueueWithdrawal / ClaimQueuedWithdrawal / CancelQueuedWithdrawal
// ============================================================================

/**
 * QueueWithdrawal: 5 accounts (PERC-309)
 * User queues a large LP withdrawal. Creates withdraw_queue PDA.
 */
export const ACCOUNTS_QUEUE_WITHDRAWAL: readonly AccountSpec[] = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "lpVaultState", signer: false, writable: false },
  { name: "withdrawQueue", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false },
] as const;

/**
 * ClaimQueuedWithdrawal: 10 accounts (PERC-309)
 * Burns LP tokens and releases one epoch tranche of SOL.
 */
export const ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL: readonly AccountSpec[] = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "withdrawQueue", signer: false, writable: true },
  { name: "lpVaultMint", signer: false, writable: true },
  { name: "userLpAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "userAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true },
] as const;

/**
 * CancelQueuedWithdrawal: 3 accounts (PERC-309)
 * Cancels queue, closes withdraw_queue PDA, returns rent to user.
 */
export const ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL: readonly AccountSpec[] = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: false },
  { name: "withdrawQueue", signer: false, writable: true },
] as const;

// ============================================================================
// PERC-305: ExecuteAdl (tag 50) — Auto-Deleverage
// ============================================================================

/**
 * ExecuteAdl: 4+ accounts (PERC-305, tag 50)
 * Permissionless — surgically close/reduce the most profitable position
 * when pnl_pos_tot > max_pnl_cap. For non-Hyperp markets with backup oracles,
 * pass additional oracle accounts at accounts[4..].
 */
export const ACCOUNTS_EXECUTE_ADL: readonly AccountSpec[] = [
  { name: "caller", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false },
] as const;

export const ACCOUNTS_RESOLVE_PERMISSIONLESS: readonly AccountSpec[] = [
  { name: "slab", signer: false, writable: true },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false },
] as const;

export const ACCOUNTS_FORCE_CLOSE_RESOLVED: readonly AccountSpec[] = [
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false },
] as const;

export const ACCOUNTS_ADMIN_FORCE_CLOSE: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
  { name: "oracle", signer: false, writable: false },
] as const;

// ============================================================================
// CloseStaleSlabs (tag 51) / ReclaimSlabRent (tag 52)
// ============================================================================

/**
 * CloseStaleSlabs: 2 accounts (tag 51)
 * Admin closes a slab of an invalid/old layout and recovers rent SOL.
 */
export const ACCOUNTS_CLOSE_STALE_SLABS: readonly AccountSpec[] = [
  { name: "dest", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
] as const;

/**
 * ReclaimSlabRent: 2 accounts (tag 52)
 * Reclaim rent from an uninitialised slab. Both dest and slab must sign.
 */
export const ACCOUNTS_RECLAIM_SLAB_RENT: readonly AccountSpec[] = [
  { name: "dest", signer: true, writable: true },
  { name: "slab", signer: true, writable: true },
] as const;

// ============================================================================
// AuditCrank (tag 53) — Permissionless invariant check
// ============================================================================

/**
 * AuditCrank: 1 account (tag 53)
 * Permissionless. Verifies conservation invariants; pauses market on violation.
 */
export const ACCOUNTS_AUDIT_CRANK: readonly AccountSpec[] = [
  { name: "slab", signer: false, writable: true },
] as const;

// ============================================================================
// PERC-622: AdvanceOraclePhase (permissionless)
// ============================================================================

/**
 * AdvanceOraclePhase: 1 account
 * Permissionless — no signer required beyond fee payer.
 */
export const ACCOUNTS_ADVANCE_ORACLE_PHASE: readonly AccountSpec[] = [
  { name: "slab", signer: false, writable: true },
] as const;

export const ACCOUNTS_UPDATE_HYPERP_MARK: readonly AccountSpec[] = [
  { name: "slab", signer: false, writable: true },
  { name: "dexPool", signer: false, writable: false },
  { name: "clock", signer: false, writable: false },
] as const;

/**
 * CreateLpVault (tag 74): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_create_lp_vault):
 *   [0] admin          signer, writable (marketauth — pays for PDA creation)
 *   [1] market         read-only (market-group slab; program-owned)
 *   [2] registry       writable (LpVaultRegistry PDA — derived via deriveLpVaultRegistry())
 *   [3] lpMint         writable (LP share mint PDA — derived via deriveLpVaultMint())
 *   [4] systemProgram  read-only (required for create_account CPI)
 *   [5] tokenProgram   read-only
 *
 * v12 stale accounts removed: vaultAuthority, rent (Rent::get() used instead).
 * registry replaces lpVaultState; lpMint replaces lpVaultMint.
 */
export const ACCOUNTS_CREATE_LP_VAULT: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "lpMint", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * DepositToLpVault (tag 75): 10 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_deposit_to_lp_vault):
 *   [0] depositor      signer, writable (LP depositor; pays for ledger creation)
 *   [1] market         writable (market-group slab; program-owned)
 *   [2] registry       writable (LpVaultRegistry PDA)
 *   [3] lpMint         writable (LP share mint PDA)
 *   [4] depositorLpAta writable (depositor's LP token ATA — receives minted shares)
 *   [5] sourceToken    writable (depositor's collateral ATA — source)
 *   [6] vaultToken     writable (program vault token account — destination)
 *   [7] ledger         writable (LpBackingLedger PDA; lazily created on first deposit)
 *   [8]  tokenProgram   read-only
 *   [9]  systemProgram  read-only (required for ledger create_account CPI)
 *   [10] siblingLedger  writable (LpBackingLedger PDA for `domain ^ 1`)
 *
 * v17 DUAL-DOMAIN: [10] is the OTHER pot's ledger. It is REQUIRED even when
 * uninitialised — NAV is summed across both pots, so omitting it understates NAV
 * and mints the depositor free shares at existing holders' expense. `ledger` at
 * [7] is always `registry.domain`'s; the instruction's `domain` argument selects
 * which of the two actually receives the backing.
 *
 * v12 stale accounts removed: vaultAuthority, lpVaultState. Added: ledger at [7],
 * systemProgram at [9]. registry replaces slab+lpVaultState. Reordered to match handler.
 */
export const ACCOUNTS_LP_VAULT_DEPOSIT: readonly AccountSpec[] = [
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
  { name: "siblingLedger", signer: false, writable: true },
] as const;

/**
 * LpVaultCrankFees (tag 78): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_lp_vault_crank_fees):
 *   [0] cranker       signer, WRITABLE (permissionless; pays rent if the target
 *                     ledger must be created)
 *   [1] market        writable (market-group slab; program-owned)
 *   [2] registry      writable (LpVaultRegistry PDA)
 *   [3] ledger        writable (LpBackingLedger PDA for `registry.domain`)
 *   [4] siblingLedger writable (LpBackingLedger PDA for `domain ^ 1`)
 *   [5] systemProgram read-only (required to create a missing target ledger)
 *
 * v17 DUAL-DOMAIN: the instruction's `domain` argument picks which pot the fees
 * land in, and that pot's ledger is created on first use. Once deposits can be
 * routed, a vault whose money all went to the sibling has NO own-domain ledger,
 * so cranker had to become writable and the system program is now required.
 */
export const ACCOUNTS_LP_VAULT_CRANK_FEES: readonly AccountSpec[] = [
  { name: "cranker", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
  { name: "siblingLedger", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false },
] as const;

/**
 * RebalanceLpVaultBacking (tag 91): 6 accounts.
 *
 * Moves IDLE (fresh, unliened) backing between the two pots of the vault's asset,
 * carrying ledger principal in lockstep. No tokens move.
 *
 *   [0] cranker       signer, WRITABLE (permissionless; pays rent if the
 *                     destination ledger must be created)
 *   [1] market        writable (market-group slab; program-owned)
 *   [2] registry      read-only (LpVaultRegistry PDA)
 *   [3] fromLedger    writable (LpBackingLedger PDA for `fromDomain`)
 *   [4] toLedger      writable (LpBackingLedger PDA for `toDomain`)
 *   [5] systemProgram read-only
 */
export const ACCOUNTS_REBALANCE_LP_VAULT_BACKING: readonly AccountSpec[] = [
  { name: "cranker", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: false },
  { name: "fromLedger", signer: false, writable: true },
  { name: "toLedger", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false },
] as const;

export const ACCOUNTS_CHALLENGE_SETTLEMENT: readonly AccountSpec[] = [
  { name: "challenger", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "dispute", signer: false, writable: true },
  { name: "challengerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false },
] as const;

export const ACCOUNTS_RESOLVE_DISPUTE: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "dispute", signer: false, writable: true },
  { name: "challengerAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

export const ACCOUNTS_DEPOSIT_LP_COLLATERAL: readonly AccountSpec[] = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userLpAta", signer: false, writable: true },
  { name: "lpVaultMint", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpEscrow", signer: false, writable: true },
] as const;

export const ACCOUNTS_WITHDRAW_LP_COLLATERAL: readonly AccountSpec[] = [
  { name: "user", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "userLpAta", signer: false, writable: true },
  { name: "lpVaultMint", signer: false, writable: false },
  { name: "lpVaultState", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "lpEscrow", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
] as const;

export const ACCOUNTS_SET_OFFSET_PAIR: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slabA", signer: false, writable: true },
  { name: "slabB", signer: false, writable: true },
  { name: "pairPda", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false },
] as const;

export const ACCOUNTS_ATTEST_CROSS_MARGIN: readonly AccountSpec[] = [
  { name: "payer", signer: true, writable: true },
  { name: "slabA", signer: false, writable: true },
  { name: "slabB", signer: false, writable: true },
  { name: "attestation", signer: false, writable: true },
  { name: "pairPda", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false },
] as const;

// ============================================================================
// PERC-8110: SetOiImbalanceHardBlock
// ============================================================================

/**
 * SetOiImbalanceHardBlock: 2 accounts
 * Sets the OI imbalance hard-block threshold (admin only)
 */
export const ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
] as const;

export const ACCOUNTS_SET_MAX_PNL_CAP: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
] as const;

export const ACCOUNTS_SET_OI_CAP_MULTIPLIER: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
] as const;

export const ACCOUNTS_SET_DISPUTE_PARAMS: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
] as const;

export const ACCOUNTS_SET_LP_COLLATERAL_PARAMS: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
] as const;

// ============================================================================
// PERC-608: Position NFT Instructions (tags 64–69)
// ============================================================================

/**
 * MintPositionNft: 10 accounts
 * Creates a Token-2022 position NFT for an open position.
 */
export const ACCOUNTS_MINT_POSITION_NFT: readonly AccountSpec[] = [
  { name: "payer", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "positionNftPda", signer: false, writable: true },
  { name: "nftMint", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "owner", signer: true, writable: false },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "token2022Program", signer: false, writable: false },
  { name: "systemProgram", signer: false, writable: false },
  { name: "rent", signer: false, writable: false },
] as const;

/**
 * TransferPositionOwnership: 8 accounts
 * Transfer position NFT and update on-chain owner. Requires pending_settlement == 0.
 */
export const ACCOUNTS_TRANSFER_POSITION_OWNERSHIP: readonly AccountSpec[] = [
  { name: "currentOwner", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "positionNftPda", signer: false, writable: true },
  { name: "nftMint", signer: false, writable: true },
  { name: "currentOwnerAta", signer: false, writable: true },
  { name: "newOwnerAta", signer: false, writable: true },
  { name: "newOwner", signer: false, writable: false },
  { name: "token2022Program", signer: false, writable: false },
] as const;

/**
 * BurnPositionNft: 7 accounts
 * Burns NFT and closes PositionNft + mint PDAs after position is closed.
 */
export const ACCOUNTS_BURN_POSITION_NFT: readonly AccountSpec[] = [
  { name: "owner", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "positionNftPda", signer: false, writable: true },
  { name: "nftMint", signer: false, writable: true },
  { name: "ownerAta", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "token2022Program", signer: false, writable: false },
] as const;

/**
 * SetPendingSettlement: 3 accounts
 * Keeper/admin sets pending_settlement flag before funding transfer.
 * Protected by admin allowlist (GH#1475).
 */
export const ACCOUNTS_SET_PENDING_SETTLEMENT: readonly AccountSpec[] = [
  { name: "keeper", signer: true, writable: false },
  { name: "slab", signer: false, writable: false },
  { name: "positionNftPda", signer: false, writable: true },
] as const;

/**
 * ClearPendingSettlement: 3 accounts
 * Keeper/admin clears pending_settlement flag after KeeperCrank.
 * Protected by admin allowlist (GH#1475).
 */
export const ACCOUNTS_CLEAR_PENDING_SETTLEMENT: readonly AccountSpec[] = [
  { name: "keeper", signer: true, writable: false },
  { name: "slab", signer: false, writable: false },
  { name: "positionNftPda", signer: false, writable: true },
] as const;

export const ACCOUNTS_TRANSFER_OWNERSHIP_CPI: readonly AccountSpec[] = [
  { name: "caller", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "nftProgram", signer: false, writable: false },
] as const;

// ============================================================================
// PERC-8111: SetWalletCap
// ============================================================================

/**
 * SetWalletCap: 2 accounts
 * Sets the per-wallet position cap (admin only). capE6=0 disables.
 */
export const ACCOUNTS_SET_WALLET_CAP: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
] as const;

export const ACCOUNTS_RESCUE_ORPHAN_VAULT: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "adminAta", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
  { name: "tokenProgram", signer: false, writable: false },
  { name: "vaultPda", signer: false, writable: false },
] as const;

export const ACCOUNTS_CLOSE_ORPHAN_SLAB: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "slab", signer: false, writable: true },
  { name: "vault", signer: false, writable: true },
] as const;

// ============================================================================
// PERC-SetDexPool: SetDexPool (tag 74)
// ============================================================================

/**
 * SetDexPool: 3 accounts
 * Admin pins the approved DEX pool address for a HYPERP market.
 * After this call, UpdateHyperpMark rejects any pool that does not match.
 */
export const ACCOUNTS_SET_DEX_POOL: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: true },
  { name: "poolAccount", signer: false, writable: false },
] as const;

// ============================================================================
// InitMatcherCtx (tag 83) — v17 wire
//
// CONFIRMED (forensic rebuild + live simulateTransaction, 2026-07-15, see
// ~/v17/DECISIONS-LEDGER.md "Pinned deployed revisions" section): the DEPLOYED
// wrapper (69VUZ7… = percolator-prog@e26c97a4) HAS InitMatcherCtx live at tag
// 83. The protocol-fee instructions below were renumbered to 84/85
// (WithdrawProtocolFee, SetProtocolFeeAuthority) specifically to keep this
// tag free for InitMatcherCtx — see ACCOUNTS_WITHDRAW_PROTOCOL_FEE /
// ACCOUNTS_SET_PROTOCOL_FEE_AUTHORITY below.
// ============================================================================

/**
 * InitMatcherCtx (tag 83): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_init_matcher_ctx):
 *   [0] lpOwner          signer (LP portfolio owner wallet)
 *   [1] market           read-only (program-owned market slab)
 *   [2] lpPortfolio      read-only (LP's portfolio; wrapper verifies provenance + owner)
 *   [3] matcherCtx       writable (320-byte account pre-created, owned by matcherProg)
 *   [4] matcherProg      read-only, executable (the external matcher program)
 *   [5] matcherDelegate  read-only (PDA derived via deriveMatcherDelegate(); wrapper signs it)
 *
 * PREREQUISITE: SetMatcherConfig (tag 68, enabled=1) must be called first — the wrapper
 * reads the LP portfolio's matcher config tail and verifies all three keys match before
 * calling the matcher CPI.
 *
 * The wrapper uses invoke_signed with the delegate seeds to make matcherDelegate a signer
 * in the inner CPI to the matcher's process_init (tag 2). No client-side signing of
 * matcherDelegate is needed — it is passed as a regular (non-signer) account here.
 */
export const ACCOUNTS_INIT_MATCHER_CTX: readonly AccountSpec[] = [
  { name: "lpOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: false },
  { name: "lpPortfolio", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherProg", signer: false, writable: false },
  { name: "matcherDelegate", signer: false, writable: false },
] as const;

// ============================================================================
// TASK A — oracle-config account specs (tags 34, 35, 36, 62, 63)
// ============================================================================

/**
 * ConfigureHybridOracle (tag 34): 2 fixed accounts + variable oracle feed accounts.
 *
 * Fixed accounts:
 *   [0] oracleAuthority  signer (must be the asset's oracle_authority)
 *   [1] market           writable (program-owned market account)
 *
 * Dynamic accounts [2..2+oracle_leg_count]:
 *   oracle feed accounts (read-only). Pass 1-3 Pyth/on-chain price feed accounts
 *   matching the oracleLegFeeds pubkeys encoded in the instruction data.
 *
 * (v16_program.rs handle_configure_hybrid_oracle lines 10414-10438)
 */
export const ACCOUNTS_CONFIGURE_HYBRID_ORACLE: readonly AccountSpec[] = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  // [2..] oracle feed accounts appended by caller per oracle_leg_count
] as const;

/**
 * ConfigureEwmaMark (tag 35): 2 accounts.
 *
 *   [0] oracleAuthority  signer (must be the asset's oracle_authority)
 *   [1] market           writable (program-owned)
 *
 * No feed accounts needed — EWMA-mark is authority-pushed, not oracle-polled.
 * (v16_program.rs handle_configure_ewma_mark lines 10553-10557)
 */
export const ACCOUNTS_CONFIGURE_EWMA_MARK: readonly AccountSpec[] = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
] as const;

/**
 * PushEwmaMark (tag 36): 2 accounts.
 *
 *   [0] oracleAuthority  signer (must be the asset's oracle_authority)
 *   [1] market           writable (program-owned)
 *
 * (v16_program.rs handle_push_ewma_mark lines 10766-10770)
 */
export const ACCOUNTS_PUSH_EWMA_MARK: readonly AccountSpec[] = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
] as const;

/**
 * ConfigureAuthMark (tag 62): 2 accounts.
 *
 *   [0] oracleAuthority  signer (must be the asset's oracle_authority)
 *   [1] market           writable (program-owned)
 *
 * (v16_program.rs handle_configure_auth_mark lines 10660-10664)
 */
export const ACCOUNTS_CONFIGURE_AUTH_MARK: readonly AccountSpec[] = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
] as const;

/**
 * PushAuthMark (tag 63): 2 accounts.
 *
 *   [0] oracleAuthority  signer (must be the asset's oracle_authority)
 *   [1] market           writable (program-owned)
 *
 * (v16_program.rs handle_push_auth_mark lines 10842-10846)
 */
export const ACCOUNTS_PUSH_AUTH_MARK: readonly AccountSpec[] = [
  { name: "oracleAuthority", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
] as const;

// ============================================================================
// TASK B — SetMatcherConfig account spec (tag 68)
// ============================================================================

/**
 * SetMatcherConfig (tag 68): 3 accounts when disabling (enabled=0),
 * 6 accounts when enabling (enabled=1).
 *
 *   [0] lpOwner          signer (portfolio owner)
 *   [1] market           read-only (program-owned; owner-check only)
 *   [2] lpPortfolio      writable (program-owned portfolio)
 *   [3] matcherProg      read-only, executable (required when enabled=1 only)
 *   [4] matcherCtx       read-only (matcher context; owned by matcherProg; required when enabled=1)
 *   [5] matcherDelegate  read-only PDA (derived via deriveMatcherDelegate(); required when enabled=1)
 *
 * Note: accounts [3..5] are only validated by the on-chain handler when enabled=1.
 * When disabling (enabled=0), pass only accounts [0..2] or include [3..5] as no-ops.
 * (v16_program.rs handle_set_matcher_config lines 7516-7557)
 */
export const ACCOUNTS_SET_MATCHER_CONFIG: readonly AccountSpec[] = [
  { name: "lpOwner", signer: true, writable: false },
  { name: "market", signer: false, writable: false },
  { name: "lpPortfolio", signer: false, writable: true },
  // When enabled=1, also pass:
  { name: "matcherProg", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: false },
  { name: "matcherDelegate", signer: false, writable: false },
] as const;

// ============================================================================
// Protocol-fee program change (tags 84/85) — v17 wire, WrapperConfigV16 496B
// See ~/v17/PROTOCOL-FEE-DESIGN.md §3. Verified against
// percolator-prog/src/v16_program.rs (feat/protocol-fee-taker-only@626fb617)
// handle_withdraw_protocol_fee / handle_set_protocol_fee_authority.
//
// Renumbered 2026-07-15 (83→84, 84→85) to keep tag 83 reserved for
// InitMatcherCtx (see ACCOUNTS_INIT_MATCHER_CTX above and
// ~/v17/DECISIONS-LEDGER.md, "Pinned deployed revisions").
// ============================================================================

/**
 * WithdrawProtocolFee (tag 84): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw_protocol_fee):
 *   [0] authority      signer, writable (must equal cfg.protocol_fee_authority)
 *   [1] market         writable (program-owned market-group slab)
 *   [2] destToken      writable (destination token account)
 *   [3] vaultToken     writable (program vault token account — source)
 *   [4] vaultAuthority read-only (PDA ["vault", market], derives via deriveVaultAuthority)
 *   [5] tokenProgram   read-only
 *
 * Pays out from the accrued-but-unwithdrawn protocol claim
 * (protocol_fee_accrued_atoms - protocol_fee_withdrawn_atoms). `amount == 0`
 * in the instruction data means "withdraw all currently-available capacity".
 * No insurance-withdraw-cooldown gate (that mechanism guards creator-facing
 * domain budgets; the protocol's claim is a separate, non-domain balance).
 */
export const ACCOUNTS_WITHDRAW_PROTOCOL_FEE: readonly AccountSpec[] = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * SetProtocolFeeAuthority (tag 85): 3 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_set_protocol_fee_authority):
 *   [0] upgradeAuthority signer (must equal the program's BPF upgrade authority)
 *   [1] programData      read-only (ProgramData PDA under bpf_loader_upgradeable,
 *                         seeds [program_id])
 *   [2] market            writable (program-owned market-group slab)
 *
 * Rotates cfg.protocol_fee_authority. Gated on the program's upgrade
 * authority — NOT marketauth, NOT insurance_authority, NOT any
 * creator-facing gate. No global fan-out: call once per market.
 */
export const ACCOUNTS_SET_PROTOCOL_FEE_AUTHORITY: readonly AccountSpec[] = [
  { name: "upgradeAuthority", signer: true, writable: false },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: true },
] as const;

// ============================================================================
// v17 FEE-COLLECTION SPLIT (tags 86/87/88)
// percolator-prog feat/protocol-fee-taker-only@2b3a6a65
// ============================================================================

/**
 * UpdateFeeSplit (tag 86): 2 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_update_fee_split):
 *   [0] admin  signer   (must match cfg.marketauth via expect_live_authority)
 *   [1] market writable (program-owned market-group slab)
 *
 * Mirrors the neighbouring marketauth-gated single-field setters
 * (handle_update_fee_redirect_policy, handle_update_market_init_fee_policy) —
 * signer/writable/owner checks, then `expect_live_authority(&cfg.marketauth)`.
 *
 * ⚠ After `StakeInitPool` rotates cfg.marketauth to the stake-pool PDA, this
 * layout is unreachable at top level; use the stake CPI proxy (stake tag 25),
 * whose layout is ACCOUNTS_STAKE_ADMIN_UPDATE_FEE_SPLIT in solana/stake.ts.
 */
export const ACCOUNTS_UPDATE_FEE_SPLIT: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
] as const;

/**
 * WithdrawInsuranceReserveToStake (tag 87): 7 accounts.
 *
 * v17 wire account layout (v16_program.rs
 * handle_withdraw_insurance_reserve_to_stake):
 *   [0] cranker         signer   (permissionless — any signer, pays fees only)
 *   [1] market          writable (program-owned market-group slab)
 *   [2] stakePool       read-only (PDA ["stake_pool", market] under the
 *                        wrapper's PINNED stake program id; its owner is
 *                        asserted BEFORE any byte is read — the forgery gate)
 *   [3] stakeVault      writable (must equal pool.vault, read out of [2])
 *   [4] vaultToken      writable (this market's collateral vault token acct)
 *   [5] vaultAuthority  read-only (PDA derived by derive_vault_authority)
 *   [6] tokenProgram    read-only
 *
 * Note [2] is NOT writable — the wrapper only reads the pool to derive the
 * destination; percolator-stake's own AccrueFees is what later credits it.
 *
 * Failure codes are deliberately distinct so a keeper can tell the cases
 * apart: Custom(53) NoInsuranceReserveToClaim, Custom(54) StakePoolNotBound,
 * Custom(55) StakePoolOwnerMismatch, Custom(56) StakePoolAuthorityMismatch,
 * Custom(57) StakePoolMarketMismatch, Custom(58) StakePoolWrapperMismatch,
 * Custom(59) StakePoolModeMismatch, Custom(60) StakeProgramNotPinned.
 */
export const ACCOUNTS_WITHDRAW_INSURANCE_RESERVE_TO_STAKE: readonly AccountSpec[] = [
  { name: "cranker", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "stakePool", signer: false, writable: false },
  { name: "stakeVault", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

/**
 * UpdateMaintenanceFeePerSlot (tag 88): 2 accounts.
 *
 * v17 wire account layout (v16_program.rs
 * handle_update_maintenance_fee_per_slot) — identical to tag 86:
 *   [0] admin  signer   (must match cfg.marketauth)
 *   [1] market writable (program-owned market-group slab)
 *
 * ⚠ The instruction payload is a u128, not a u64. See
 * encodeUpdateMaintenanceFeePerSlot in abi/instructions.ts.
 *
 * Same StakeInitPool reachability caveat as tag 86; proxy is stake tag 26.
 */
export const ACCOUNTS_UPDATE_MAINTENANCE_FEE_PER_SLOT: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
] as const;

/**
 * UpdateTradeFeePolicy (tag 55): 2 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_update_trade_fee_policy):
 *   [0] authority signer (must match ASSET 0's insurance_authority — NOT
 *                  cfg.marketauth)
 *   [1] market    writable (program-owned market-group slab)
 *
 * Mirrors ACCOUNTS_UPDATE_BACKING_FEE_POLICY (tag 51), which shares the
 * asset-0 insurance_authority gate. Stranded by BindInsuranceAuthority rather
 * than by StakeInitPool; proxy is stake tag 28.
 *
 * NOTE: `writable: true` on [0] matches the existing tag-51 spec and reflects
 * the authority normally also being the fee payer. The program itself only
 * calls `expect_signer(authority)` — it never writes to this account.
 */
export const ACCOUNTS_UPDATE_TRADE_FEE_POLICY: readonly AccountSpec[] = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
] as const;

/**
 * ExpireBackingBucket (tag 89): 1 account. PERMISSIONLESS.
 *
 * v17 wire account layout (v16_program.rs handle_expire_backing_bucket):
 *   [0] market writable (program-owned market-group slab)
 *
 * That is the WHOLE list. The handler reads `account(accounts, 0)` and applies
 * exactly `expect_writable` + `expect_owner(market, program_id)`. There is NO
 * `expect_signer` anywhere in it, and no token/vault/authority account — the
 * instruction moves no tokens. The transaction still needs a fee payer, but
 * that signer is not an account of this instruction and is not checked against
 * anything.
 *
 * This is deliberate: a bricked market must be recoverable by ANY keeper, not
 * only by an authority that may be a cold key or a stake-pool PDA. The
 * safety gate is the engine's own precondition (bucket `Fresh` AND lapsed
 * against the runtime `Clock`), not an authority check. See
 * encodeExpireBackingBucket in abi/instructions.ts for the keeper contract and
 * the failure codes — Custom(21) not-Live, Custom(9) domain out of range,
 * Custom(19) bucket not `Fresh`-and-lapsed.
 */
export const ACCOUNTS_EXPIRE_BACKING_BUCKET: readonly AccountSpec[] = [
  { name: "market", signer: false, writable: true },
] as const;

// ============================================================================
// v17 CREATOR FEE CLAIM (tag 90)
// percolator-prog, 2026-07-23 creator-fee-claim design §3.
// ============================================================================

/**
 * WithdrawCreatorFee (tag 90): 6 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_withdraw_creator_fee) —
 * BYTE-FOR-BYTE THE SAME SHAPE AS ACCOUNTS_WITHDRAW_PROTOCOL_FEE (tag 84);
 * only the authority the program checks [0] against differs:
 *   [0] authority      signer, writable (must equal ASSET 0's insurance_operator)
 *   [1] market         writable (program-owned market-group slab)
 *   [2] destToken      writable (destination token account, owned by [0])
 *   [3] vaultToken     writable (program vault token account — source)
 *   [4] vaultAuthority read-only (PDA ["vault", market], derives via deriveVaultAuthority)
 *   [5] tokenProgram   read-only
 *
 * The handler applies expect_signer([0]) + expect_writable([1],[2],[3]) +
 * expect_owner([1], program_id) + verify_token_program([5]) + expect_key on the
 * derived vault authority. `writable: true` on [0] mirrors the tag-84 spec and
 * reflects the authority normally also being the transaction fee payer; the
 * program itself only calls expect_signer on it.
 *
 * ⚠ AUTHORITY IS asset 0's `insurance_operator`, NOT `cfg.marketauth` — and it
 * does NOT accept marketauth as an alternate the way
 * verify_domain_withdrawal_preflight does. That divergence is deliberate: on a
 * staked market marketauth IS the stake-pool PDA, so accepting it would let the
 * pool claim the creator's revenue. It also means claiming keeps working after
 * StakeInitPool, since staking never rotates insurance_operator.
 *
 * Pays out of `creator_fee_claimable_atoms` (WrapperConfigV17 byte 568) by an
 * EXACT debit — no withdraw-all sentinel, no partial fill, no
 * insurance-withdraw cooldown or backstop-health gate (this counter is disjoint
 * from the loss backstop, so backstop gating does not apply).
 */
export const ACCOUNTS_WITHDRAW_CREATOR_FEE: readonly AccountSpec[] = [
  { name: "authority", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "destToken", signer: false, writable: true },
  { name: "vaultToken", signer: false, writable: true },
  { name: "vaultAuthority", signer: false, writable: false },
  { name: "tokenProgram", signer: false, writable: false },
] as const;

// ============================================================================
// WELL-KNOWN PROGRAM/SYSVAR KEYS
// ============================================================================

export const WELL_KNOWN = {
  tokenProgram: TOKEN_PROGRAM_ID,
  clock: SYSVAR_CLOCK_PUBKEY,
  rent: SYSVAR_RENT_PUBKEY,
  systemProgram: SystemProgram.programId,
} as const;
