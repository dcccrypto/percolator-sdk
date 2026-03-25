/**
 * @module stake
 * Percolator Insurance LP Staking program — instruction encoders, PDA derivation, and account specs.
 *
 * Program: percolator-stake (dcccrypto/percolator-stake)
 * Deployed devnet:  6aJb1F9CDCVWCNYFwj8aQsVb696YnW6J1FznteHq4Q6k
 * Deployed mainnet: (pending deployment — DevOps must set STAKE_PROGRAM_ID env var or deploy and update STAKE_PROGRAM_IDS.mainnet)
 */
import { PublicKey } from '@solana/web3.js';
/** Known stake program addresses per network. Mainnet is empty until deployed. */
export declare const STAKE_PROGRAM_IDS: {
    readonly devnet: "6aJb1F9CDCVWCNYFwj8aQsVb696YnW6J1FznteHq4Q6k";
    readonly mainnet: "";
};
/**
 * Resolve the stake program ID for the given network.
 *
 * Priority:
 *  1. STAKE_PROGRAM_ID env var (explicit override — DevOps sets this for mainnet until constant is filled)
 *  2. Network-specific constant from STAKE_PROGRAM_IDS
 *
 * Throws a clear error on mainnet when no address is available so callers
 * surface the gap instead of silently hitting the devnet program.
 */
export declare function getStakeProgramId(network?: 'devnet' | 'mainnet'): PublicKey;
/**
 * Default export — resolves for the current runtime network.
 * Use getStakeProgramId() with an explicit network argument where possible.
 *
 * @deprecated Direct use of STAKE_PROGRAM_ID is being phased out in favour of
 *   getStakeProgramId() so mainnet callers get a clear error rather than silently
 *   resolving to the devnet address.
 */
export declare const STAKE_PROGRAM_ID: PublicKey;
export declare const STAKE_IX: {
    readonly InitPool: 0;
    readonly Deposit: 1;
    readonly Withdraw: 2;
    readonly FlushToInsurance: 3;
    readonly UpdateConfig: 4;
    readonly TransferAdmin: 5;
    readonly AdminSetOracleAuthority: 6;
    readonly AdminSetRiskThreshold: 7;
    readonly AdminSetMaintenanceFee: 8;
    readonly AdminResolveMarket: 9;
    readonly AdminWithdrawInsurance: 10;
    readonly AdminSetInsurancePolicy: 11;
    /** PERC-272: Accrue trading fees to LP vault */
    readonly AccrueFees: 12;
    /** PERC-272: Init pool in trading LP mode */
    readonly InitTradingPool: 13;
    /** PERC-313: Set HWM config (enable + floor bps) */
    readonly AdminSetHwmConfig: 14;
    /** PERC-303: Enable/configure senior-junior LP tranches */
    readonly AdminSetTrancheConfig: 15;
    /** PERC-303: Deposit into junior (first-loss) tranche */
    readonly DepositJunior: 16;
};
/** Derive the stake pool PDA for a given slab (market). */
export declare function deriveStakePool(slab: PublicKey, programId?: PublicKey): [PublicKey, number];
/** Derive the vault authority PDA (signs CPI, owns LP mint + vault). */
export declare function deriveStakeVaultAuth(pool: PublicKey, programId?: PublicKey): [PublicKey, number];
/** Derive the per-user deposit PDA (tracks cooldown, deposit time). */
export declare function deriveDepositPda(pool: PublicKey, user: PublicKey, programId?: PublicKey): [PublicKey, number];
/** Tag 0: InitPool — create stake pool for a slab. */
export declare function encodeStakeInitPool(cooldownSlots: bigint | number, depositCap: bigint | number): Buffer;
/** Tag 1: Deposit — deposit collateral, receive LP tokens. */
export declare function encodeStakeDeposit(amount: bigint | number): Buffer;
/** Tag 2: Withdraw — burn LP tokens, receive collateral (subject to cooldown). */
export declare function encodeStakeWithdraw(lpAmount: bigint | number): Buffer;
/** Tag 3: FlushToInsurance — move collateral from stake vault to wrapper insurance. */
export declare function encodeStakeFlushToInsurance(amount: bigint | number): Buffer;
/** Tag 4: UpdateConfig — update cooldown and/or deposit cap. */
export declare function encodeStakeUpdateConfig(newCooldownSlots?: bigint | number, newDepositCap?: bigint | number): Buffer;
/** Tag 5: TransferAdmin — transfer wrapper admin to pool PDA. */
export declare function encodeStakeTransferAdmin(): Buffer;
/** Tag 6: AdminSetOracleAuthority — forward to wrapper via CPI. */
export declare function encodeStakeAdminSetOracleAuthority(newAuthority: PublicKey): Buffer;
/** Tag 7: AdminSetRiskThreshold — forward to wrapper via CPI. */
export declare function encodeStakeAdminSetRiskThreshold(newThreshold: bigint | number): Buffer;
/** Tag 8: AdminSetMaintenanceFee — forward to wrapper via CPI. */
export declare function encodeStakeAdminSetMaintenanceFee(newFee: bigint | number): Buffer;
/** Tag 9: AdminResolveMarket — forward to wrapper via CPI. */
export declare function encodeStakeAdminResolveMarket(): Buffer;
/** Tag 10: AdminWithdrawInsurance — withdraw insurance after market resolution. */
export declare function encodeStakeAdminWithdrawInsurance(amount: bigint | number): Buffer;
/** Tag 12: AccrueFees — permissionless: accrue trading fees to LP vault. */
export declare function encodeStakeAccrueFees(): Buffer;
/** Tag 13: InitTradingPool — create pool in trading LP mode (pool_mode = 1). */
export declare function encodeStakeInitTradingPool(cooldownSlots: bigint | number, depositCap: bigint | number): Buffer;
/** Tag 14 (PERC-313): AdminSetHwmConfig — enable HWM protection and set floor BPS. */
export declare function encodeStakeAdminSetHwmConfig(enabled: boolean, hwmFloorBps: number): Buffer;
/** Tag 15 (PERC-303): AdminSetTrancheConfig — enable senior/junior LP tranches. */
export declare function encodeStakeAdminSetTrancheConfig(juniorFeeMultBps: number): Buffer;
/** Tag 16 (PERC-303): DepositJunior — deposit into first-loss junior tranche. */
export declare function encodeStakeDepositJunior(amount: bigint | number): Buffer;
/** Tag 11: AdminSetInsurancePolicy — set withdrawal policy on wrapper. */
export declare function encodeStakeAdminSetInsurancePolicy(authority: PublicKey, minWithdrawBase: bigint | number, maxWithdrawBps: number, cooldownSlots: bigint | number): Buffer;
/**
 * Decoded StakePool state (352 bytes on-chain).
 * Includes PERC-272 (fee yield), PERC-313 (HWM), and PERC-303 (tranches).
 */
export interface StakePoolState {
    isInitialized: boolean;
    bump: number;
    vaultAuthorityBump: number;
    adminTransferred: boolean;
    slab: PublicKey;
    admin: PublicKey;
    collateralMint: PublicKey;
    lpMint: PublicKey;
    vault: PublicKey;
    totalDeposited: bigint;
    totalLpSupply: bigint;
    cooldownSlots: bigint;
    depositCap: bigint;
    totalFlushed: bigint;
    totalReturned: bigint;
    totalWithdrawn: bigint;
    percolatorProgram: PublicKey;
    totalFeesEarned: bigint;
    lastFeeAccrualSlot: bigint;
    lastVaultSnapshot: bigint;
    poolMode: number;
    hwmEnabled: boolean;
    epochHighWaterTvl: bigint;
    hwmFloorBps: number;
    trancheEnabled: boolean;
    juniorBalance: bigint;
    juniorTotalLp: bigint;
    juniorFeeMultBps: number;
}
/** Size of StakePool on-chain (bytes). */
export declare const STAKE_POOL_SIZE = 352;
/**
 * Decode a StakePool account from raw data buffer.
 * Uses DataView for all u64/u16 reads — browser-safe (no Buffer.readBigUInt64LE).
 */
export declare function decodeStakePool(data: Buffer | Uint8Array): StakePoolState;
export interface StakeAccounts {
    /** InitPool accounts */
    initPool: {
        admin: PublicKey;
        slab: PublicKey;
        pool: PublicKey;
        lpMint: PublicKey;
        vault: PublicKey;
        vaultAuth: PublicKey;
        collateralMint: PublicKey;
        percolatorProgram: PublicKey;
    };
    /** Deposit accounts */
    deposit: {
        user: PublicKey;
        pool: PublicKey;
        userCollateralAta: PublicKey;
        vault: PublicKey;
        lpMint: PublicKey;
        userLpAta: PublicKey;
        vaultAuth: PublicKey;
        depositPda: PublicKey;
    };
    /** Withdraw accounts */
    withdraw: {
        user: PublicKey;
        pool: PublicKey;
        userLpAta: PublicKey;
        lpMint: PublicKey;
        vault: PublicKey;
        userCollateralAta: PublicKey;
        vaultAuth: PublicKey;
        depositPda: PublicKey;
    };
    /** FlushToInsurance accounts (CPI from stake → percolator) */
    flushToInsurance: {
        caller: PublicKey;
        pool: PublicKey;
        vault: PublicKey;
        vaultAuth: PublicKey;
        slab: PublicKey;
        wrapperVault: PublicKey;
        percolatorProgram: PublicKey;
    };
}
/**
 * Build account keys for InitPool instruction.
 * Returns array of {pubkey, isSigner, isWritable} in the order the program expects.
 */
export declare function initPoolAccounts(a: StakeAccounts['initPool']): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Build account keys for Deposit instruction.
 */
export declare function depositAccounts(a: StakeAccounts['deposit']): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Build account keys for Withdraw instruction.
 */
export declare function withdrawAccounts(a: StakeAccounts['withdraw']): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Build account keys for FlushToInsurance instruction.
 */
export declare function flushToInsuranceAccounts(a: StakeAccounts['flushToInsurance']): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
