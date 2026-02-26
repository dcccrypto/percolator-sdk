/**
 * @module stake
 * Percolator Insurance LP Staking program — instruction encoders, PDA derivation, and account specs.
 *
 * Program: percolator-stake (dcccrypto/percolator-stake)
 * Deployed devnet: 4mJ8Cas... (TODO: confirm full address from devops)
 */
import { PublicKey } from '@solana/web3.js';
/** Percolator Stake program ID (devnet). Update for mainnet. */
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
/** Tag 11: AdminSetInsurancePolicy — set withdrawal policy on wrapper. */
export declare function encodeStakeAdminSetInsurancePolicy(authority: PublicKey, minWithdrawBase: bigint | number, maxWithdrawBps: number, cooldownSlots: bigint | number): Buffer;
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
