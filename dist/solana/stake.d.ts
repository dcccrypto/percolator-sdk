/**
 * @module stake
 * Percolator Insurance LP Staking program — instruction encoders, PDA derivation, and account specs.
 *
 * Program: percolator-stake (dcccrypto/percolator-stake)
 * Deployed devnet:  6aJb1F9CDCVWCNYFwj8aQsVb696YnW6J1FznteHq4Q6k
 * Deployed mainnet: DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F
 */
import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
export { TOKEN_2022_PROGRAM_ID };
/** Known stake program addresses per network. Mainnet is empty until deployed. */
export declare const STAKE_PROGRAM_IDS: {
    readonly devnet: "6aJb1F9CDCVWCNYFwj8aQsVb696YnW6J1FznteHq4Q6k";
    readonly mainnet: "DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F";
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
    /** Step 1 of two-step stake admin rotation. */
    readonly ProposeAdmin: 5;
    /** Step 2 of two-step stake admin rotation. */
    readonly AcceptAdmin: 6;
    /** @deprecated Legacy one-step admin transfer name. Use ProposeAdmin. */
    readonly TransferAdmin: 5;
    /** @deprecated Legacy admin CPI proxy name. Tag 6 is now AcceptAdmin. */
    readonly AdminSetOracleAuthority: 6;
    /** #242: ProposeCooldownIncrease — step 1 of the cooldown-increase timelock. */
    readonly ProposeCooldownIncrease: 7;
    /** #242: CommitCooldownIncrease — step 2; applies the increase after TIMELOCK_SLOTS. */
    readonly CommitCooldownIncrease: 8;
    /** #242: CancelCooldownIncrease — withdraw a pending cooldown proposal. */
    readonly CancelCooldownIncrease: 9;
    /** @deprecated Tag 7 reclaimed for ProposeCooldownIncrease (#242). Old admin CPI proxy;
     *  its encoder still throws as a migration safety net. */
    readonly AdminSetRiskThreshold: 7;
    /** @deprecated Tag 8 reclaimed for CommitCooldownIncrease (#242). Encoder still throws. */
    readonly AdminSetMaintenanceFee: 8;
    /** @deprecated Tag 9 reclaimed for CancelCooldownIncrease (#242). Encoder still throws. */
    readonly AdminResolveMarket: 9;
    /** Current on-chain tag 10: transfer withdrawn insurance back into the pool vault. */
    readonly ReturnInsurance: 10;
    /** @deprecated Legacy alias for ReturnInsurance. */
    readonly AdminWithdrawInsurance: 10;
    /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
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
    /** Mark the pool as resolved after the wrapper market has been resolved directly. */
    readonly SetMarketResolved: 18;
};
/** Derive the stake pool PDA for a given slab (market). */
export declare function deriveStakePool(slab: PublicKey, programId?: PublicKey): [PublicKey, number];
/** Derive the vault authority PDA (signs CPI, owns LP mint + vault). */
export declare function deriveStakeVaultAuth(pool: PublicKey, programId?: PublicKey): [PublicKey, number];
/** Derive the per-user deposit PDA (tracks cooldown, deposit time). */
export declare function deriveDepositPda(pool: PublicKey, user: PublicKey, programId?: PublicKey): [PublicKey, number];
/** Tag 0: InitPool — create stake pool for a slab. */
export declare function encodeStakeInitPool(cooldownSlots: bigint | number, depositCap: bigint | number): Uint8Array;
/** Tag 1: Deposit — deposit collateral, receive LP tokens. */
export declare function encodeStakeDeposit(amount: bigint | number): Uint8Array;
/** Tag 2: Withdraw — burn LP tokens, receive collateral (subject to cooldown). */
export declare function encodeStakeWithdraw(lpAmount: bigint | number): Uint8Array;
/** Tag 3: FlushToInsurance — move collateral from stake vault to wrapper insurance. */
export declare function encodeStakeFlushToInsurance(amount: bigint | number): Uint8Array;
/** Tag 4: UpdateConfig — update cooldown and/or deposit cap. */
export declare function encodeStakeUpdateConfig(newCooldownSlots?: bigint | number, newDepositCap?: bigint | number): Uint8Array;
/** Tag 5: ProposeAdmin — current admin proposes a pending admin. */
export declare function encodeStakeProposeAdmin(newAdmin: PublicKey): Uint8Array;
/** Tag 6: AcceptAdmin — pending admin accepts ownership. */
export declare function encodeStakeAcceptAdmin(): Uint8Array;
/** @deprecated Legacy one-step admin transfer name. Use encodeStakeProposeAdmin instead. */
export declare function encodeStakeTransferAdmin(): Uint8Array;
/** @deprecated Removed admin CPI proxy. Tag 6 is now encodeStakeAcceptAdmin. */
export declare function encodeStakeAdminSetOracleAuthority(newAuthority: PublicKey): Uint8Array;
/** Tag 7: ProposeCooldownIncrease (#242) — admin proposes a LARGER cooldown_slots; it
 *  takes effect only via CommitCooldownIncrease after TIMELOCK_SLOTS (~48h), giving LP
 *  holders an exit window. Accounts: [admin signer, pool writable, clock sysvar]. */
export declare function encodeStakeProposeCooldownIncrease(newCooldownSlots: bigint | number): Uint8Array;
/** Tag 8: CommitCooldownIncrease (#242) — apply the pending increase (only after the
 *  timelock window). Accounts: [admin signer, pool writable, clock sysvar]. */
export declare function encodeStakeCommitCooldownIncrease(): Uint8Array;
/** Tag 9: CancelCooldownIncrease (#242) — withdraw a pending proposal.
 *  Accounts: [admin signer, pool writable]. */
export declare function encodeStakeCancelCooldownIncrease(): Uint8Array;
/** @deprecated Tag 7 is now ProposeCooldownIncrease (#242). This old admin-CPI-proxy name
 *  is retained only as a migration safety net — it throws rather than emitting a tx. Use
 *  encodeStakeProposeCooldownIncrease for the live tag-7 instruction. */
export declare function encodeStakeAdminSetRiskThreshold(newThreshold: bigint | number): Uint8Array;
/** @deprecated Tag 8 is now CommitCooldownIncrease (#242). Retained as a throwing safety
 *  net; use encodeStakeCommitCooldownIncrease. */
export declare function encodeStakeAdminSetMaintenanceFee(newFee: bigint | number): Uint8Array;
/** @deprecated Tag 9 is now CancelCooldownIncrease (#242). Retained as a throwing safety
 *  net; use encodeStakeCancelCooldownIncrease. */
export declare function encodeStakeAdminResolveMarket(): Uint8Array;
/** Tag 10: ReturnInsurance — transfer withdrawn insurance back into the stake pool vault. */
export declare function encodeStakeReturnInsurance(amount: bigint | number): Uint8Array;
/** @deprecated Legacy alias for tag 10. Current on-chain semantics are ReturnInsurance. */
export declare function encodeStakeAdminWithdrawInsurance(amount: bigint | number): Uint8Array;
/** Tag 12: AccrueFees — permissionless: accrue trading fees to LP vault. */
export declare function encodeStakeAccrueFees(): Uint8Array;
/** Tag 13: InitTradingPool — create pool in trading LP mode (pool_mode = 1). */
export declare function encodeStakeInitTradingPool(cooldownSlots: bigint | number, depositCap: bigint | number): Uint8Array;
/** Tag 14 (PERC-313): AdminSetHwmConfig — enable HWM protection and set floor BPS. */
export declare function encodeStakeAdminSetHwmConfig(enabled: boolean, hwmFloorBps: number): Uint8Array;
/** Tag 15 (PERC-303): AdminSetTrancheConfig — enable senior/junior LP tranches. */
export declare function encodeStakeAdminSetTrancheConfig(juniorFeeMultBps: number): Uint8Array;
/** Tag 16 (PERC-303): DepositJunior — deposit into first-loss junior tranche. */
export declare function encodeStakeDepositJunior(amount: bigint | number): Uint8Array;
/** Tag 18: SetMarketResolved — blocks new deposits after the wrapper market is resolved. */
export declare function encodeStakeSetMarketResolved(): Uint8Array;
/** @deprecated Removed on-chain in stake v3. Throws instead of emitting a dead instruction. */
export declare function encodeStakeAdminSetInsurancePolicy(authority: PublicKey, minWithdrawBase: bigint | number, maxWithdrawBps: number, cooldownSlots: bigint | number): Uint8Array;
/**
 * Decoded StakePool state (384 bytes on-chain — stake v2).
 * v2 adds `pending_admin` ([u8;32]) at offset 288 for the two-step admin-rotation
 * primitive (ProposeAdmin tag 5 / AcceptAdmin tag 6). Struct grew 352 → 384.
 * Includes PERC-272 (fee yield), PERC-313 (HWM), and PERC-303 (tranches).
 */
export interface StakePoolState {
    isInitialized: boolean;
    bump: number;
    vaultAuthorityBump: number;
    adminTransferred: boolean;
    marketResolved: boolean;
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
    /**
     * Pending admin for the two-step rotation (stake v2, offset 288).
     * `null` when no proposal is outstanding (all-zero bytes on-chain).
     * Set by ProposeAdmin (tag 5); consumed by AcceptAdmin (tag 6).
     */
    pendingAdmin: PublicKey | null;
    totalFeesEarned: bigint;
    lastFeeAccrualSlot: bigint;
    lastVaultSnapshot: bigint;
    poolMode: number;
    hwmEnabled: boolean;
    epochHighWaterTvl: bigint;
    hwmFloorBps: number;
    hwmLastEpoch: bigint;
    trancheEnabled: boolean;
    juniorBalance: bigint;
    juniorTotalLp: bigint;
    juniorFeeMultBps: number;
}
/**
 * Size of StakePool on-chain (bytes).
 * v2: 384 (stake v1 was 352; `pending_admin: [u8;32]` added at offset 288).
 */
export declare const STAKE_POOL_SIZE = 384;
export declare const STAKE_POOL_DISCRIMINATOR: Uint8Array<ArrayBuffer>;
export declare const STAKE_POOL_CURRENT_VERSION = 2;
/**
 * Decode a StakePool account from raw data buffer. * Uses DataView for all u64/u16 reads — browser-safe.
 */
export declare function decodeStakePool(data: Uint8Array): StakePoolState;
/** Size of StakeDeposit on-chain (bytes). */
export declare const STAKE_DEPOSIT_SIZE = 152;
export declare const STAKE_DEPOSIT_DISCRIMINATOR: Uint8Array<ArrayBuffer>;
/** Decoded StakeDeposit PDA state. */
export interface StakeDepositState {
    isInitialized: boolean;
    bump: number;
    pool: PublicKey;
    user: PublicKey;
    lastDepositSlot: bigint;
    lpAmount: bigint;
}
/**
 * Decode a StakeDeposit PDA account from raw data.
 *
 * On-chain layout (152 bytes, percolator-stake/src/state.rs):
 *   [0]       is_initialized  u8
 *   [1]       bump            u8
 *   [2..8]    _padding
 *   [8..40]   pool            [u8; 32]
 *   [40..72]  user            [u8; 32]
 *   [72..80]  last_deposit_slot u64
 *   [80..88]  lp_amount       u64
 *   [88..152] _reserved
 */
export declare function decodeDepositPda(data: Uint8Array): StakeDepositState;
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
 *
 * @param a - Named accounts for the InitPool instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 */
export declare function initPoolAccounts(a: StakeAccounts['initPool'], tokenProgramId?: PublicKey): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Build account keys for Deposit instruction.
 *
 * @param a - Named accounts for the Deposit instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 */
export declare function depositAccounts(a: StakeAccounts['deposit'], tokenProgramId?: PublicKey): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Build account keys for Withdraw instruction.
 *
 * @param a - Named accounts for the Withdraw instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 */
export declare function withdrawAccounts(a: StakeAccounts['withdraw'], tokenProgramId?: PublicKey): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
/**
 * Build account keys for FlushToInsurance instruction.
 *
 * @param a - Named accounts for the FlushToInsurance instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 */
export declare function flushToInsuranceAccounts(a: StakeAccounts['flushToInsurance'], tokenProgramId?: PublicKey): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
}[];
