/**
 * v2.2 leverage guard (wrapper tag 124): PDA helpers, instruction builders for ops 0 to 6, and the helper that
 * appends the guard to a TradeCpi / EvictAndTradeCpi instruction. Data and account rules: {@link "../abi/lev-guard-v22"}.
 *
 * @module lev-guard-v22-builders
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { LevGuardReportV22 } from "../abi/lev-guard-v22.js";
/**
 * Leverage guard PDA, seeds `["lev_guard", market]`.
 *
 * @param programId  Wrapper program id.
 * @param market     Market account.
 * @returns `[pda, bump]`.
 * @example
 * ```ts
 * const [guard] = deriveLevGuardV22(PROGRAM_ID, market);
 * ```
 */
export declare function deriveLevGuardV22(programId: PublicKey, market: PublicKey): [PublicKey, number];
/**
 * Vault-LP state PDA, seeds `["vault_lp", market]` (same as `deriveVaultLpStateP3`).
 *
 * @param programId  Wrapper program id.
 * @param market     Market account.
 * @returns `[pda, bump]`.
 * @example
 * ```ts
 * const [state] = deriveVaultLpStateV22(PROGRAM_ID, market);
 * ```
 */
export declare function deriveVaultLpStateV22(programId: PublicKey, market: PublicKey): [PublicKey, number];
/**
 * Vault-LP ext PDA, seeds `["vault_lp_ext", market]`. Ops 4 and 5 need it whenever vault_lp_state is passed (it may be empty).
 *
 * @param programId  Wrapper program id.
 * @param market     Market account.
 * @returns `[pda, bump]`.
 * @example
 * ```ts
 * const [ext] = deriveVaultLpExtV22(PROGRAM_ID, market);
 * ```
 */
export declare function deriveVaultLpExtV22(programId: PublicKey, market: PublicKey): [PublicKey, number];
/**
 * The wrapper's ProgramData account, seeds `[program_id]` under the upgradeable loader (same as `deriveProgramDataAddressP3`).
 *
 * @param programId  Wrapper program id.
 * @returns `[pda, bump]`.
 * @example
 * ```ts
 * const [pd] = deriveProgramDataV22(PROGRAM_ID);
 * ```
 */
export declare function deriveProgramDataV22(programId: PublicKey): [PublicKey, number];
/** Common context. */
export interface LevGuardCtxV22 {
    programId: PublicKey;
    market: PublicKey;
}
/**
 * Op 0 INIT. `authority` is the market authority (creator) or the upgrade authority; it signs and pays the guard's rent.
 *
 * @param c          Program and market.
 * @param authority  Signer, writable.
 * @param t0         0n (default) = now; only the upgrade authority may pass an earlier slot.
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildLevGuardInitIxV22({ programId, market }, creator);
 * ```
 */
export declare function buildLevGuardInitIxV22(c: LevGuardCtxV22, authority: PublicKey, t0?: bigint): TransactionInstruction;
/**
 * Op 1 SET_RISK_KEY (upgrade authority signs).
 *
 * @param c                 Program and market.
 * @param upgradeAuthority  Signer.
 * @param key               The risk key, or `null` for none.
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildLevGuardSetRiskKeyIxV22({ programId, market }, ua, riskKey);
 * ```
 */
export declare function buildLevGuardSetRiskKeyIxV22(c: LevGuardCtxV22, upgradeAuthority: PublicKey, key: PublicKey | Uint8Array | null): TransactionInstruction;
/**
 * Op 6 SET_T0 (upgrade authority signs; `0 < t0 <= now`).
 *
 * @param c                 Program and market.
 * @param upgradeAuthority  Signer.
 * @param t0                The token start slot.
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildLevGuardSetT0IxV22({ programId, market }, ua, 250_000_000n);
 * ```
 */
export declare function buildLevGuardSetT0IxV22(c: LevGuardCtxV22, upgradeAuthority: PublicKey, t0: bigint): TransactionInstruction;
/**
 * Op 2 REPORT (the risk key signs).
 *
 * @param c        Program and market.
 * @param riskKey  Signer; must equal the guard's `risk_key`.
 * @param report   The report fields.
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildLevGuardReportIxV22({ programId, market }, riskKey, { jDumpBps: 2000, mIndBps: 5000, lCapX100: 0, nMultBps: 10000 });
 * ```
 */
export declare function buildLevGuardReportIxV22(c: LevGuardCtxV22, riskKey: PublicKey, report: LevGuardReportV22): TransactionInstruction;
/** Op 3 inputs. */
export interface LevGuardTightenOptsV22 {
    /** The depth-source pin's pinned base mint. */
    baseMint: PublicKey;
    /** The depth-source pin's pinned pool base vault. */
    poolBaseVault: PublicKey;
    /** Optional holder token account (`[6]`). */
    holderTokenAccount?: PublicKey;
}
/**
 * Op 3 TIGHTEN (permissionless).
 *
 * @param c       Program and market.
 * @param caller  Any key; listed as signer (fee payer).
 * @param o       The pinned mint and vault, and an optional holder token account.
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildLevGuardTightenIxV22({ programId, market }, payer, { baseMint, poolBaseVault });
 * ```
 */
export declare function buildLevGuardTightenIxV22(c: LevGuardCtxV22, caller: PublicKey, o: LevGuardTightenOptsV22): TransactionInstruction;
/** Op 4 inputs. */
export interface LevGuardPokeOptsV22 {
    /** The bound vault-LP portfolio (writable). */
    vaultLpPortfolio: PublicKey;
    /**
     * Sample NAV too: appends `vault_lp_state` at `[4]` AND the `vault_lp_ext` PDA at `[5]` (the program requires both together; the ext may be
     * an empty account). Default false = price band only.
     */
    sampleNav?: boolean;
}
/**
 * Op 4 POKE (permissionless): samples the price band, and NAV when `sampleNav`.
 *
 * @param c       Program and market.
 * @param caller  Any key; listed as signer (fee payer).
 * @param o       Portfolio and options.
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildLevGuardPokeIxV22({ programId, market }, payer, { vaultLpPortfolio, sampleNav: true });
 * ```
 */
export declare function buildLevGuardPokeIxV22(c: LevGuardCtxV22, caller: PublicKey, o: LevGuardPokeOptsV22): TransactionInstruction;
/**
 * Op 5 LP_STOP / W1 (permissionless): cuts the listed opposing portfolios (all writable).
 *
 * @param c                 Program and market.
 * @param caller            Any key; listed as signer (fee payer).
 * @param vaultLpPortfolio  The vault-LP portfolio (writable).
 * @param opposing          Opposing user portfolios to cut (writable), may be empty.
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildLevGuardLpStopIxV22({ programId, market }, payer, vaultLpPortfolio, victims);
 * ```
 */
export declare function buildLevGuardLpStopIxV22(c: LevGuardCtxV22, caller: PublicKey, vaultLpPortfolio: PublicKey, opposing?: readonly PublicKey[]): TransactionInstruction;
/**
 * Append the leverage guard (writable, non-signer) as the LAST account of a TradeCpi (tag 10) or EvictAndTradeCpi (tag 119) instruction.
 * Without it a risk-increasing fill on a guarded market fails `Custom(132)`; reduce-only fills do not need it. Call it after every other
 * account is in place (after {@link buildEvictAndTradeCpiIxV22}, which prepends the victim, or before it: the guard stays last either way).
 * Idempotent: an instruction whose last key is already the guard is returned as is. The input is not mutated.
 *
 * @param ix      A TradeCpi or EvictAndTradeCpi instruction.
 * @param market  The market the trade is on (`ix.keys[1]` for TradeCpi, `ix.keys[2]` for EvictAndTradeCpi is checked against it).
 * @returns A new instruction with the guard appended.
 * @throws If the data tag is not 10 or 119, or the market key is not where the tag puts it.
 * @example
 * ```ts
 * const ix = withLevGuardTailV22(buildTradeCpiIx(...), market);
 * ```
 */
export declare function withLevGuardTailV22(ix: TransactionInstruction, market: PublicKey): TransactionInstruction;
