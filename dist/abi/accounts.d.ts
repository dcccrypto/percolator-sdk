import { PublicKey, AccountMeta } from "@solana/web3.js";
/**
 * Account spec for building instruction account metas.
 * Each instruction has a fixed ordering that matches the Rust processor.
 */
export interface AccountSpec {
    name: string;
    signer: boolean;
    writable: boolean;
}
/**
 * InitMarket: 9 accounts (Pyth Pull - feed_id is in instruction data, not as accounts)
 */
export declare const ACCOUNTS_INIT_MARKET: readonly AccountSpec[];
/**
 * InitUser: 5 accounts (clock/oracle removed in commit 410f947)
 */
export declare const ACCOUNTS_INIT_USER: readonly AccountSpec[];
/**
 * InitLP: 5 accounts (clock/oracle removed in commit 410f947)
 */
export declare const ACCOUNTS_INIT_LP: readonly AccountSpec[];
/**
 * DepositCollateral: 6 accounts
 */
export declare const ACCOUNTS_DEPOSIT_COLLATERAL: readonly AccountSpec[];
/**
 * WithdrawCollateral: 8 accounts
 */
export declare const ACCOUNTS_WITHDRAW_COLLATERAL: readonly AccountSpec[];
/**
 * KeeperCrank: 4 accounts
 */
export declare const ACCOUNTS_KEEPER_CRANK: readonly AccountSpec[];
/**
 * TradeNoCpi: 4 accounts (PERC-199: clock sysvar removed — uses Clock::get() syscall)
 */
export declare const ACCOUNTS_TRADE_NOCPI: readonly AccountSpec[];
/**
 * LiquidateAtOracle: 4 accounts
 * Note: account[0] is unused but must be present
 */
export declare const ACCOUNTS_LIQUIDATE_AT_ORACLE: readonly AccountSpec[];
/**
 * CloseAccount: 8 accounts
 */
export declare const ACCOUNTS_CLOSE_ACCOUNT: readonly AccountSpec[];
/**
 * TopUpInsurance: 5 accounts
 */
export declare const ACCOUNTS_TOPUP_INSURANCE: readonly AccountSpec[];
/**
 * TradeCpi: 7 accounts (PERC-199: clock sysvar removed — uses Clock::get() syscall)
 */
export declare const ACCOUNTS_TRADE_CPI: readonly AccountSpec[];
/**
 * SetRiskThreshold: 2 accounts
 */
export declare const ACCOUNTS_SET_RISK_THRESHOLD: readonly AccountSpec[];
/**
 * UpdateAdmin: 2 accounts
 */
export declare const ACCOUNTS_UPDATE_ADMIN: readonly AccountSpec[];
/**
 * CloseSlab: 2 accounts
 */
export declare const ACCOUNTS_CLOSE_SLAB: readonly AccountSpec[];
/**
 * UpdateConfig: 2 accounts
 */
export declare const ACCOUNTS_UPDATE_CONFIG: readonly AccountSpec[];
/**
 * SetMaintenanceFee: 2 accounts
 */
export declare const ACCOUNTS_SET_MAINTENANCE_FEE: readonly AccountSpec[];
/**
 * SetOracleAuthority: 2 accounts
 * Sets the oracle price authority (admin only)
 */
export declare const ACCOUNTS_SET_ORACLE_AUTHORITY: readonly AccountSpec[];
/**
 * SetOraclePriceCap: 2 accounts
 * Set oracle price circuit breaker cap (admin only)
 */
export declare const ACCOUNTS_SET_ORACLE_PRICE_CAP: readonly AccountSpec[];
/**
 * PushOraclePrice: 2 accounts
 * Push oracle price (oracle authority only)
 */
export declare const ACCOUNTS_PUSH_ORACLE_PRICE: readonly AccountSpec[];
/**
 * ResolveMarket: 2 accounts
 * Resolves a binary/premarket (admin only)
 */
export declare const ACCOUNTS_RESOLVE_MARKET: readonly AccountSpec[];
/**
 * WithdrawInsurance: 6 accounts
 * Withdraw insurance fund after market resolution (admin only)
 */
export declare const ACCOUNTS_WITHDRAW_INSURANCE: readonly AccountSpec[];
/**
 * PauseMarket: 2 accounts
 */
export declare const ACCOUNTS_PAUSE_MARKET: readonly AccountSpec[];
/**
 * UnpauseMarket: 2 accounts
 */
export declare const ACCOUNTS_UNPAUSE_MARKET: readonly AccountSpec[];
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
export declare function buildAccountMetas(spec: readonly AccountSpec[], keys: PublicKey[] | Record<string, PublicKey>): AccountMeta[];
/**
 * CreateInsuranceMint: 9 accounts
 * Creates SPL mint PDA for insurance LP tokens. Admin only, once per market.
 */
export declare const ACCOUNTS_CREATE_INSURANCE_MINT: readonly AccountSpec[];
/**
 * DepositInsuranceLP: 8 accounts
 * Deposit collateral into insurance fund, receive LP tokens.
 */
export declare const ACCOUNTS_DEPOSIT_INSURANCE_LP: readonly AccountSpec[];
/**
 * WithdrawInsuranceLP: 8 accounts
 * Burn LP tokens and withdraw proportional share of insurance fund.
 */
export declare const ACCOUNTS_WITHDRAW_INSURANCE_LP: readonly AccountSpec[];
/**
 * FundMarketInsurance: 5 accounts (PERC-306)
 * Fund per-market isolated insurance balance.
 */
export declare const ACCOUNTS_FUND_MARKET_INSURANCE: readonly AccountSpec[];
/**
 * SetInsuranceIsolation: 2 accounts (PERC-306)
 * Set max % of global fund this market can access.
 */
export declare const ACCOUNTS_SET_INSURANCE_ISOLATION: readonly AccountSpec[];
/**
 * ExecuteAdl: NOT IMPLEMENTED ON-CHAIN (PERC-305 pending).
 * Tag 43 is ChallengeSettlement (PERC-314). This constant is retained
 * for reference only — do NOT use it to build instructions.
 * @deprecated PERC-305 is not deployed. Using this would invoke ChallengeSettlement.
 */
export declare const ACCOUNTS_EXECUTE_ADL: readonly AccountSpec[];
/**
 * AdvanceOraclePhase: 1 account
 * Permissionless — no signer required beyond fee payer.
 */
export declare const ACCOUNTS_ADVANCE_ORACLE_PHASE: readonly AccountSpec[];
/**
 * TopUpKeeperFund: 3 accounts
 * Permissionless — anyone can fund. Transfers lamports directly (no system program).
 */
export declare const ACCOUNTS_TOPUP_KEEPER_FUND: readonly AccountSpec[];
export declare const WELL_KNOWN: {
    readonly tokenProgram: PublicKey;
    readonly clock: PublicKey;
    readonly rent: PublicKey;
    readonly systemProgram: PublicKey;
};
