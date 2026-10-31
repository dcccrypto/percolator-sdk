/**
 * #636 / #636b (percolator-prog PRs #640 + #641, merged together into rc23 as ONE ABI change): the LP-stop NAV is
 * sampled AT every flow that moves vault-LP value, so the flow handlers now take the market's leverage guard
 * (`["lev_guard", market]`) and the vault-LP ext (`["vault_lp_ext", market]`) as trailing accounts.
 *
 * Both are REQUIRED and PDA-checked on a growth market (`asset_growth_view(asset).is_some()`): a missing guard, or
 * another account in its slot, is refused with Custom(134) `LevGuardInvalid`; a missing ext (once the guard is live)
 * with `VaultLpNotBound`. On a non-growth market, or while the guard PDA is not yet initialised, the program skips
 * the sample, so appending them ALWAYS is correct and needs no growth probe (the builders below always do).
 *
 * Exact tails, read from the handlers at percolator-prog 780013c8 (`src/v16_program.rs`; `lev_nav_flow_begin` /
 * `lev_nav_flow_end` / `lev_flow_counters`):
 *
 * | tag | handler | pre-#640 list | new tail (w = writable) |
 * |---|---|---|---|
 * | 96 DepositJuniorTranche | `lev_nav_flow_begin(.., 7, 8, ..)` | 7 | `[7]` guard w, `[8]` ext w |
 * | 97 WithdrawJuniorTranche | `(.., 13, 11, ..)` | 11 (+`[11]` ext, +`[12]` bond tranche) | `[11]` ext w (now always), `[12]` bond tranche or a pad, `[13]` guard w |
 * | 98 VaultLpRecall | `(.., 9, 8, ..)` | 8 (+`[8]` ext) | `[8]` ext w (now always), `[9]` guard w |
 * | 102 VaultLpReleaseSurplus, Live | `(.., 13, 12, ..)` | 7 | `[7..11]` pads, `[12]` ext w, `[13]` guard w (Resolved: unchanged, not read) |
 * | 103 VaultLpAllocate | `(.., 10, 7, ..)` | 9 (+`[9]` bond tranche) | `[9]` bond tranche or a pad, `[10]` guard w |
 * | 108 BondDeposit | `(.., 14, 13, ..)` | 13 | `[13]` ext w, `[14]` guard w |
 * | 110 BondExecuteWithdraw | `(.., 14, 13, ..)` | 13 | `[13]` ext w, `[14]` guard w (Live; Resolved does not read them) |
 * | 111 InsuranceBackstopDraw, modes 0/1/3 | `lev_find_idx(accounts, 7, pda)` | 7 + units + feeds | ext w and guard w anywhere in `[7..]` (found by key); mode 2 unchanged |
 *
 * Writability: the guard is `expect_writable` whenever it is live (the sample is stored into it); the ext is written by
 * 98 / 103 (allocation counter) and by 102 / 108 / 110 / 111 (the #641 `other_flow` counters), and is passed writable
 * everywhere for one rule. A pad is the system program, read-only (what the program's own tests pass).
 *
 * @module v22-nav-flow
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
/** The subset of the v2.2 market context the flow tails need (structurally `MarketV22`). */
export interface NavFlowMarketV22 {
    /** v2.2 wrapper program id. */
    programId: PublicKey;
    market: PublicKey;
    /** `LpVaultRegistryV16.domain`: selects the own / sibling backing ledger. */
    registryDomain: number;
    /** The vault-owned LP portfolio. */
    lpPortfolio?: PublicKey;
    /** Ignored by the flow tails: the ext PDA is always derived (it is required at its PDA on a growth market). */
    vaultLpExt?: PublicKey;
}
/**
 * Account positions of the #636 / #636b flow tails (index = position in the account list). `base` is the account count
 * a caller built before #640; `full` the count after. `bondSlot`: the bond tranche on a bond market, else a pad.
 * Tag 111 has no fixed slots (`byKey`: the program searches `[7..]` by PDA).
 */
export declare const NAV_FLOW_TAILS_V22: Readonly<{
    readonly 96: Readonly<{
        base: 7;
        guard: 7;
        ext: 8;
        full: 9;
    }>;
    readonly 97: Readonly<{
        base: 11;
        ext: 11;
        bondSlot: 12;
        guard: 13;
        full: 14;
    }>;
    readonly 98: Readonly<{
        base: 8;
        ext: 8;
        guard: 9;
        full: 10;
    }>;
    readonly 102: Readonly<{
        base: 7;
        pads: readonly [7, 8, 9, 10, 11];
        ext: 12;
        guard: 13;
        full: 14;
        resolvedBase: 11;
    }>;
    readonly 103: Readonly<{
        base: 9;
        ext: 7;
        bondSlot: 9;
        guard: 10;
        full: 11;
    }>;
    readonly 108: Readonly<{
        base: 13;
        ext: 13;
        guard: 14;
        full: 15;
    }>;
    readonly 110: Readonly<{
        base: 13;
        ext: 13;
        guard: 14;
        full: 15;
    }>;
    readonly 111: Readonly<{
        base: 7;
        byKey: true;
        modes: readonly [0, 1, 3];
    }>;
}>;
/** A tag that takes the #636 flow tail. */
export type NavFlowTagV22 = 96 | 97 | 98 | 102 | 103 | 108 | 110 | 111;
/** One compute-unit limit for a flow tag, with the measured numbers it is sized from. */
export interface NavFlowComputeV22 {
    /** Compute-unit limit to request (always explicit: never rely on the 200k default). */
    units: number;
    /** Highest consumption measured with the #640 / #641 binaries (LiteSVM, real BPF), in CU. */
    measuredWorst: number;
    /** Where the measurement comes from and why the limit has the headroom it has. */
    note: string;
}
/**
 * Compute-unit limits for the flow tags after #640 / #641. Every number is at least 2x the worst measured case.
 * Measurements: prog PR #640 body (author, LiteSVM, rc23 tip -> PR), the independent attack `att-640`
 * (bond world, CUREC), PR #641 body; tag 103 also has a devnet reading (~230k on the pre-#640 wrapper, SDK
 * `buildVaultLpAllocateIxP2b` doc) to which the measured +45k of the flow sample is added. The LiteSVM worlds hold
 * 1-2 vault-LP legs; the vault-LP certificate refresh grows with legs, hence the 2x floor.
 */
export declare const NAV_FLOW_COMPUTE_UNITS_V22: Readonly<Record<NavFlowTagV22, NavFlowComputeV22>>;
/**
 * The two PDAs every flow tail carries.
 *
 * @param programId  v2.2 wrapper program id.
 * @param market     Market account.
 * @returns `{ guard: ["lev_guard", market], ext: ["vault_lp_ext", market] }`.
 * @example
 * ```ts
 * const { guard, ext } = navFlowAccountsV22(PROGRAM_ID, market);
 * ```
 */
export declare function navFlowAccountsV22(programId: PublicKey, market: PublicKey): {
    guard: PublicKey;
    ext: PublicKey;
};
/**
 * Bring a flow-tag instruction to its #640 / #641 account list. Accepts the pre-#640 forms the existing builders
 * produce (see {@link NAV_FLOW_TAILS_V22} `base`, plus the optional ext / bond slots) and returns the full list:
 * fills the ext (derived, writable) where it was optional, pads an absent bond-tranche slot, appends the guard
 * (writable). Idempotent: an instruction that already carries the full tail is returned unchanged. Tag 102 in its
 * Resolved form (11 / 12 accounts) and tag 111 mode 2 (PROPOSE) are returned unchanged (the program does not read
 * the tail there).
 *
 * @param base       The instruction (tag byte first; program id must be the v2.2 wrapper).
 * @param market     Market account (the PDAs are derived from `base.programId` and it).
 * @returns A new instruction with the tail.
 * @throws If the tag takes no flow tail, the account count is not one of the known forms, or a slot that must hold
 *   the ext / guard holds another key.
 * @example
 * ```ts
 * const ix = withNavFlowTailV22(buildVaultLpAllocateIxP2b(m, keeper, U128_MAX_P2B, { bondTranche: bond }), m.market);
 * ```
 */
export declare function withNavFlowTailV22(base: TransactionInstruction, market: PublicKey): TransactionInstruction;
/**
 * DepositJuniorTranche (tag 96), v2.2 #640 form: 7 base accounts, `[7]` lev guard (w), `[8]` vault ext (w).
 * Budget {@link NAV_FLOW_COMPUTE_UNITS_V22}`[96]`.
 *
 * @param m            Market context (`lpPortfolio` required).
 * @param juniorOwner  Signer (the vault-LP state's `junior_owner`).
 * @param sourceToken  Junior's collateral token account.
 * @param vaultToken   Market collateral vault token account.
 * @param amount       Atoms.
 * @returns Instruction (9 accounts).
 * @example
 * ```ts
 * const ix = buildDepositJuniorTrancheIxV22(m, creator, creatorAta, vaultAta, 1_000_000n);
 * ```
 */
export declare function buildDepositJuniorTrancheIxV22(m: NavFlowMarketV22, juniorOwner: PublicKey, sourceToken: PublicKey, vaultToken: PublicKey, amount: bigint): TransactionInstruction;
/**
 * VaultLpRecall (tag 98, permissionless), v2.2 #640 form: 8 base accounts, `[8]` vault ext (w, always), `[9]` lev guard (w).
 * Budget {@link NAV_FLOW_COMPUTE_UNITS_V22}`[98]`.
 *
 * @param m             Market context (`lpPortfolio` required).
 * @param cranker       Signer (pays rent if the target ledger is created).
 * @param amount        Atoms.
 * @param targetDomain  Receiving backing domain.
 * @returns Instruction (10 accounts).
 * @example
 * ```ts
 * const ix = buildVaultLpRecallIxV22(m, keeper, shortfall, m.registryDomain);
 * ```
 */
export declare function buildVaultLpRecallIxV22(m: NavFlowMarketV22, cranker: PublicKey, amount: bigint, targetDomain: number): TransactionInstruction;
/**
 * VaultLpReleaseSurplus (tag 102, junior owner) in LIVE mode, v2.2 #641 form: 7 base accounts, `[7..11]` pads (the
 * Resolved SPL slots, not read when Live), `[12]` vault ext (w), `[13]` lev guard (w). For a Resolved market use
 * `buildVaultLpReleaseSurplusIxP3(.., resolved)` (+ `withBondTailV22` on a bond market): unchanged by #641.
 * Budget {@link NAV_FLOW_COMPUTE_UNITS_V22}`[102]`.
 *
 * @param m             Market context (`lpPortfolio` required).
 * @param juniorOwner   Signer.
 * @param amount        Atoms.
 * @param sourceDomain  Backing domain the surplus is released from.
 * @returns Instruction (14 accounts).
 * @example
 * ```ts
 * const ix = buildVaultLpReleaseSurplusLiveIxV22(m, creator, surplus, m.registryDomain);
 * ```
 */
export declare function buildVaultLpReleaseSurplusLiveIxV22(m: NavFlowMarketV22, juniorOwner: PublicKey, amount: bigint, sourceDomain: number): TransactionInstruction;
/**
 * VaultLpAllocate (tag 103, permissionless keeper crank), v2.2 #640 form: 9 base accounts (`[7]` ext), `[9]` the bond
 * tranche on a bond market (else a pad), `[10]` lev guard (w). Tag 103 measured up to 207k CU after #640 (above the
 * 200k default): ALWAYS request {@link NAV_FLOW_COMPUTE_UNITS_V22}`[103]` (600k).
 *
 * @param m        Market context (`lpPortfolio` required).
 * @param cranker  Signer; pays the ext rent on the first call.
 * @param amount   Atoms requested (`u128::MAX` = as much as the program allows).
 * @param opts     `bondTranche: true` on a bond market (registry bond flag set).
 * @returns Instruction (11 accounts).
 * @example
 * ```ts
 * const ix = buildVaultLpAllocateIxV22(m, keeper.publicKey, U128_MAX_P2B, { bondTranche: bond });
 * ```
 */
export declare function buildVaultLpAllocateIxV22(m: NavFlowMarketV22, cranker: PublicKey, amount: bigint, opts?: {
    bondTranche?: boolean;
}): TransactionInstruction;
/**
 * Whether `ix` already carries the #636 flow tail (the lev guard of `market` at its slot, or anywhere in `[7..]` for 111).
 *
 * @param ix      Instruction of a flow tag.
 * @param market  Market account.
 * @returns `true` when the guard is present where the program reads it.
 * @example
 * ```ts
 * if (!hasNavFlowTailV22(ix, market)) ix = withNavFlowTailV22(ix, market);
 * ```
 */
export declare function hasNavFlowTailV22(ix: TransactionInstruction, market: PublicKey): boolean;
