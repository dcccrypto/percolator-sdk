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
 * ResolveMarket (tag 19): 2 accounts (inferred — see confidence note below).
 *
 * The v12.19 4-account layout this constant previously documented
 * ([admin(s+w), slab(w), clock, oracle], src/percolator.rs:9748) is stale: its
 * paired encoder `encodeResolveMarket` was confirmed rewritten for v17
 * (instructions.ts) — "v17 wire: tag(1) only... BREAKING vs v12.x ... the mode
 * byte has been REMOVED" — but this account spec was never updated to match,
 * unlike every other v17-rewritten spec in this file.
 *
 * INFERENCE, not a confirmed v17 wrapper read (no percolator-prog source is
 * available in this repo to verify directly): every one of the 13 other specs
 * in this file carrying a "v17 wire account layout" comment explicitly drops
 * `clock` and `oracle` as standalone accounts with no exception (e.g.
 * ACCOUNTS_TRADE_NOCPI: "v12 stale accounts removed: lp, clock, oracle";
 * ACCOUNTS_CLOSE_PORTFOLIO: "...clock, oracle"). The closest structural analog,
 * ACCOUNTS_RESTART_ASSET_ORACLE — also an admin-gated, market-level,
 * no-token-movement instruction — is exactly [authority(signer), market(w)].
 * Before relying on this in production, verify against an actual v17
 * `handle_resolve_market` decode (devnet dry-run or program source).
 */
export const ACCOUNTS_RESOLVE_MARKET: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
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
 * ConvertReleasedPnl (tag 28): 3 accounts (inferred — see confidence note below).
 * Owner only. No token movement (internal PnL-bucket conversion within the
 * same portfolio).
 *
 * The v12.19 4-account layout this constant previously documented
 * ([user(s+w), slab(w), clock, oracle], src/percolator.rs:10636) is stale.
 * Its paired encoder, `encodeConvertReleasedPnl`, was confirmed rewritten for
 * v17 (instructions.ts): "BREAKING vs v12.x: userIdx(u16) removed... v17
 * portfolios are identified by account key alone" — and that same comment
 * points back to this exact constant ("Accounts: see
 * ACCOUNTS_CONVERT_RELEASED_PNL"), but this spec was never updated to add the
 * account-key-identified portfolio the encoder's own doc describes.
 *
 * INFERENCE, not a confirmed v17 wrapper read (no percolator-prog source is
 * available in this repo to verify directly). Basis: ConvertReleasedPnl is
 * owner-initiated and moves no real tokens, the exact same category as
 * ACCOUNTS_INIT_USER (InitPortfolio) and ACCOUNTS_CLOSE_ACCOUNT
 * (ClosePortfolio) — both confirmed v17-rewritten to the identical 3-account
 * shape [owner(signer,w), market(w), portfolio(w)], with v12 clock/oracle/userIdx
 * dropped for the same "account-key, not index" reason this encoder's doc cites.
 * Before relying on this in production, verify against an actual v17
 * `handle_convert_released_pnl` decode (devnet dry-run or program source).
 */
export const ACCOUNTS_CONVERT_RELEASED_PNL: readonly AccountSpec[] = [
  { name: "owner", signer: true, writable: true },
  { name: "market", signer: false, writable: true },
  { name: "portfolio", signer: false, writable: true },
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
  { name: "market", signer: false, writable: false },
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
 *   [8] tokenProgram   read-only
 *   [9] systemProgram  read-only (required for ledger create_account CPI)
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
] as const;

/**
 * LpVaultCrankFees (tag 78): 4 accounts.
 *
 * v17 wire account layout (v16_program.rs handle_lp_vault_crank_fees):
 *   [0] cranker   signer, read-only (permissionless — any signer)
 *   [1] market    writable (market-group slab; program-owned)
 *   [2] registry  writable (LpVaultRegistry PDA)
 *   [3] ledger    writable (LpBackingLedger PDA)
 *
 * v12 stale accounts replaced: slab and lpVaultState were 2 accounts.
 * v17 requires 4: cranker signer + market + registry + ledger.
 */
export const ACCOUNTS_LP_VAULT_CRANK_FEES: readonly AccountSpec[] = [
  { name: "cranker", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "registry", signer: false, writable: true },
  { name: "ledger", signer: false, writable: true },
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
// InitMatcherCtx (tag 75)
// ============================================================================

/**
 * InitMatcherCtx: 5 accounts
 * Admin CPI-initializes the matcher context account for an LP slot.
 * The LP PDA signs via invoke_signed in the program — it must be included in
 * the transaction's account list even though it carries 0 lamports.
 */
export const ACCOUNTS_INIT_MATCHER_CTX: readonly AccountSpec[] = [
  { name: "admin", signer: true, writable: false },
  { name: "slab", signer: false, writable: false },
  { name: "matcherCtx", signer: false, writable: true },
  { name: "matcherProg", signer: false, writable: false },
  { name: "lpPda", signer: false, writable: false },
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
// WELL-KNOWN PROGRAM/SYSVAR KEYS
// ============================================================================

export const WELL_KNOWN = {
  tokenProgram: TOKEN_PROGRAM_ID,
  clock: SYSVAR_CLOCK_PUBKEY,
  rent: SYSVAR_RENT_PUBKEY,
  systemProgram: SystemProgram.programId,
} as const;
