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
 * TradeNoCpi: 5 accounts
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
 * TradeCpi: 8 accounts
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
 * Keys must be provided in the same order as the spec.
 */
export declare function buildAccountMetas(spec: readonly AccountSpec[], keys: PublicKey[]): AccountMeta[];
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
export declare const WELL_KNOWN: {
    readonly tokenProgram: PublicKey;
    readonly clock: PublicKey;
    readonly rent: PublicKey;
    readonly systemProgram: PublicKey;
};
