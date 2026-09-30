/**
 * P3 vault-owned LP — account decoders, PDAs, instruction builders, the bound-vault tail for
 * Earn tags 75/77/78, and the vault-LP refresh crank. Additive to SDK 8.0.0.
 *
 * Source: percolator-prog `feat/p3-vault-owned-lp` @ `424fe7e473bec1154eacde1ac8bd7e190b526fd2`
 * (`state::{VaultLpStateV18, AssetVaultLpV18, read_asset_vault_lp}`, `load_bound_vault_lp_tail`,
 * `vault_lp_refresh_snapshot`). Offsets are pinned by `test/p3.test.ts` against rustc
 * `offset_of!` on the REAL P3 structs, and the per-asset record offset against a market
 * account built by the P3 crate itself.
 *
 * Relaunch wrapper = P1 + P3 (`424fe7e4`). On an older v18.2 market every AssetVaultLpV18
 * record is zero ("no vault LP bound").
 *
 * @module p3-vault-lp
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { CrankObservationHint } from "../abi/instructions.js";
import type { SetVaultLpRiskArgsP3, VaultLpSetMatcherArgsP3 } from "../abi/p3.js";
/** `KIND_VAULT_LP_STATE`. */
export declare const V18_KIND_VAULT_LP_STATE_P3 = 9;
/** `size_of::<VaultLpStateV18>()`. */
export declare const VAULT_LP_STATE_BODY_LEN_P3 = 256;
/** `vault_lp_state_account_len()` = 16 + 256. */
export declare const VAULT_LP_STATE_ACCOUNT_LEN_P3: number;
/** `ASSET_VAULT_LP_OFF` inside each asset's 1024-byte wrapper slot. */
export declare const ASSET_VAULT_LP_SLOT_OFF_P3 = 896;
/** `ASSET_VAULT_LP_LEN`. */
export declare const ASSET_VAULT_LP_LEN_P3 = 128;
/** `ASSET_VAULT_LP_FLAG_BOUND`. */
export declare const ASSET_VAULT_LP_FLAG_BOUND_P3 = 1;
/** Account offset of `LpVaultRegistryV16._reserved[0]` = the "vault LP bound" flag (16 + 144). */
export declare const LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3 = 160;
/** Account offsets of `VaultLpStateV18` fields (header included). */
export declare const VAULT_LP_STATE_OFF_P3: Readonly<{
    readonly marketGroup: 16;
    readonly registry: 48;
    readonly lpPortfolio: 80;
    readonly juniorOwner: 112;
    readonly seniorClaimAtoms: 144;
    readonly juniorDepositedAtoms: 160;
    readonly juniorWithdrawnAtoms: 176;
    readonly seniorFeeCreditedAtoms: 192;
    readonly recalledAtoms: 208;
    readonly assetIndex: 224;
    readonly juniorFloorBps: 226;
    readonly seniorFeeShareBps: 228;
    readonly version: 230;
    readonly bump: 231;
}>;
/** Offsets of `AssetVaultLpV18` fields inside the 128-byte record. */
export declare const ASSET_VAULT_LP_FIELD_OFF_P3: Readonly<{
    readonly vaultLpPortfolio: 0;
    readonly lpNetQ: 32;
    readonly levCapQ: 48;
    readonly lpNetSlot: 64;
    readonly skewSlopeE9: 72;
    readonly skewMaxE9: 80;
    readonly levMaxImrBps: 88;
    readonly flags: 90;
    readonly reserved0: 91;
    readonly vaultLpMaxLevBps: 92;
    readonly approvedMatcherProgram: 96;
}>;
/**
 * Account offset of asset `i`'s `AssetVaultLpV18` record in a market account:
 * `MARKET_GROUP_OFF + MARKET_GROUP_LEN + i·MARKET_ASSET_SLOT_LEN + 896` (= 2246 + 2325·i).
 *
 * @param assetIndex  Asset slot index.
 * @returns Byte offset.
 * @example
 * ```ts
 * assetVaultLpAccountOffsetP3(0); // 2246
 * ```
 */
export declare function assetVaultLpAccountOffsetP3(assetIndex: number): number;
/** Decoded `VaultLpStateV18` (PDA `["vault_lp", market]`). */
export interface VaultLpStateP3 {
    marketGroup: PublicKey;
    registry: PublicKey;
    lpPortfolio: PublicKey;
    juniorOwner: PublicKey;
    /** C — the number that prices Earn shares while the junior is solvent. */
    seniorClaimAtoms: bigint;
    juniorDepositedAtoms: bigint;
    juniorWithdrawnAtoms: bigint;
    seniorFeeCreditedAtoms: bigint;
    recalledAtoms: bigint;
    assetIndex: number;
    juniorFloorBps: number;
    seniorFeeShareBps: number;
    version: number;
    bump: number;
}
/**
 * Decode a `VaultLpStateV18` account (kind 9, >= 272 bytes). Mirrors `read_vault_lp_state`'s
 * header + validation (version 1, floor 1000..=10000, senior fee share 10000, zero padding).
 *
 * @param data  Raw account bytes.
 * @returns Decoded state.
 * @throws If the kind, length or any validated field is wrong.
 * @example
 * ```ts
 * const st = decodeVaultLpStateP3(info.data);
 * ```
 */
export declare function decodeVaultLpStateP3(data: Uint8Array): VaultLpStateP3;
/** Decoded `AssetVaultLpV18`. */
export interface AssetVaultLpP3 {
    /** null when no vault LP is bound on this asset. */
    vaultLpPortfolio: PublicKey | null;
    /** Vault LP signed position snapshot (engine Q); traders' net = −lpNetQ. */
    lpNetQ: bigint;
    levCapQ: bigint;
    lpNetSlot: bigint;
    skewSlopeE9: bigint;
    skewMaxE9: bigint;
    levMaxImrBps: number;
    flags: number;
    bound: boolean;
    /** Raw stored value; 0 means the 1x default. */
    vaultLpMaxLevBps: number;
    /** null = no matcher approved yet. */
    approvedMatcherProgram: PublicKey | null;
}
/**
 * Decode one 128-byte `AssetVaultLpV18` record (mirrors `validate_asset_vault_lp`).
 *
 * @param rec  The 128 bytes.
 * @returns Decoded record.
 * @throws On unknown flag bits, non-zero reserved byte, out-of-range caps, or bound ≠ (portfolio ≠ 0).
 * @example
 * ```ts
 * const r = decodeAssetVaultLpRecordP3(bytes);
 * ```
 */
export declare function decodeAssetVaultLpRecordP3(rec: Uint8Array): AssetVaultLpP3;
/**
 * Decode asset `assetIndex`'s `AssetVaultLpV18` from a raw market account (kind 1).
 *
 * @param marketData  Raw market account bytes.
 * @param assetIndex  Asset slot.
 * @returns Decoded record (all-zero on a market without P3 state).
 * @example
 * ```ts
 * const r = decodeAssetVaultLpP3(marketInfo.data, 0);
 * if (r.bound) console.log(r.vaultLpPortfolio?.toBase58());
 * ```
 */
export declare function decodeAssetVaultLpP3(marketData: Uint8Array, assetIndex: number): AssetVaultLpP3;
/**
 * True if an LP-vault registry account has its "vault LP bound" flag set (`_reserved[0] == 1`).
 * While bound, tags 75/77/78 REQUIRE the vault-LP tail ({@link withBoundVaultLpTailP3}).
 *
 * @param registryData  Raw LpVaultRegistry account bytes.
 * @returns Whether a vault LP is bound.
 * @throws If the flag byte is neither 0 nor 1.
 * @example
 * ```ts
 * if (isLpVaultRegistryBoundP3(reg.data)) ix = withBoundVaultLpTailP3(ix, ...);
 * ```
 */
export declare function isLpVaultRegistryBoundP3(registryData: Uint8Array): boolean;
/**
 * `["vault_lp", market]` under the wrapper.
 * @param programId  Wrapper program id.
 * @param market     Market account.
 * @returns [pda, bump].
 * @example
 * ```ts
 * const [vaultLpState] = deriveVaultLpStateP3(WRAPPER, market);
 * ```
 */
export declare function deriveVaultLpStateP3(programId: PublicKey, market: PublicKey): [PublicKey, number];
/** BPF upgradeable loader id. */
export declare const BPF_LOADER_UPGRADEABLE_ID_P3: PublicKey;
/**
 * The wrapper's ProgramData account (`[program_id]` under the upgradeable loader) — required by
 * the upgrade-authority tags 94 (path B), 95 and 99.
 * @param programId  Wrapper program id.
 * @returns [programData, bump].
 * @example
 * ```ts
 * const [programData] = deriveProgramDataAddressP3(WRAPPER);
 * ```
 */
export declare function deriveProgramDataAddressP3(programId: PublicKey): [PublicKey, number];
/** Common market context for P3 builders. */
export interface VaultLpMarketP3 {
    programId: PublicKey;
    market: PublicKey;
    /** `LpVaultRegistryV16.domain` — selects which backing ledger is "own". */
    registryDomain: number;
    /** The vault-owned LP portfolio. */
    lpPortfolio: PublicKey;
}
/**
 * Tag 94 InitVaultLp. Path A: `authority` = marketauth (becomes the junior owner). Path B: pass
 * `juniorOwner` (signer) and `authority` = the wrapper upgrade authority.
 *
 * @param m               Market context.
 * @param authority       Signer (marketauth or upgrade authority).
 * @param juniorFloorBps  1000..=10000.
 * @param juniorOwner     Path B only: the signing junior owner.
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildInitVaultLpIxP3({ programId, market, registryDomain: 0, lpPortfolio }, marketauth, 2_000);
 * ```
 */
export declare function buildInitVaultLpIxP3(m: VaultLpMarketP3, authority: PublicKey, juniorFloorBps: number, juniorOwner?: PublicKey): TransactionInstruction;
/**
 * Tag 95 VaultLpSetMatcher (upgrade authority). The delegate is derived with the REGISTRY
 * as the LP owner, exactly as the handler does.
 *
 * @param m                 Market context.
 * @param upgradeAuthority  Wrapper upgrade authority (signer).
 * @param matcherProgram    Must equal the tag-99 approved matcher for the asset.
 * @param matcherCtx        Matcher context account (writable).
 * @param args              Wire fields.
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildVaultLpSetMatcherIxP3(m, upgradeAuthority, MATCHER, ctx, args);
 * ```
 */
export declare function buildVaultLpSetMatcherIxP3(m: VaultLpMarketP3, upgradeAuthority: PublicKey, matcherProgram: PublicKey, matcherCtx: PublicKey, args: VaultLpSetMatcherArgsP3): TransactionInstruction;
/**
 * Tag 96 DepositJuniorTranche (junior owner).
 * @param m            Market context.
 * @param juniorOwner  Signer.
 * @param sourceToken  Junior's collateral token account.
 * @param vaultToken   Market collateral vault.
 * @param amount       Atoms.
 * @returns Instruction.
 * @example
 * ```ts
 * buildDepositJuniorTrancheIxP3(m, junior, juniorAta, vault, 1_000_000n);
 * ```
 */
export declare function buildDepositJuniorTrancheIxP3(m: VaultLpMarketP3, juniorOwner: PublicKey, sourceToken: PublicKey, vaultToken: PublicKey, amount: bigint): TransactionInstruction;
/**
 * Tag 97 WithdrawJuniorTranche (junior owner). `destToken` must be owned by the junior.
 * @param m            Market context.
 * @param juniorOwner  Signer.
 * @param destToken    Junior's collateral token account.
 * @param vaultToken   Market collateral vault.
 * @param amount       Atoms.
 * @returns Instruction.
 * @example
 * ```ts
 * buildWithdrawJuniorTrancheIxP3(m, junior, juniorAta, vault, 500_000n);
 * ```
 */
export declare function buildWithdrawJuniorTrancheIxP3(m: VaultLpMarketP3, juniorOwner: PublicKey, destToken: PublicKey, vaultToken: PublicKey, amount: bigint): TransactionInstruction;
/**
 * Tag 98 VaultLpRecall (permissionless). Needed before a bound redemption when the value sits
 * in the LP (redemption otherwise fails EngineLockActive).
 * @param m             Market context.
 * @param cranker       Signer (pays rent if the target ledger is created).
 * @param amount        Atoms.
 * @param targetDomain  Receiving backing domain.
 * @returns Instruction.
 * @example
 * ```ts
 * buildVaultLpRecallIxP3(m, keeper, shortfall, m.registryDomain);
 * ```
 */
export declare function buildVaultLpRecallIxP3(m: VaultLpMarketP3, cranker: PublicKey, amount: bigint, targetDomain: number): TransactionInstruction;
/**
 * Tag 99 SetVaultLpRisk (upgrade authority).
 * @param programId         Wrapper program id.
 * @param market            Market account.
 * @param upgradeAuthority  Signer.
 * @param args              Wire fields.
 * @returns Instruction.
 * @example
 * ```ts
 * buildSetVaultLpRiskIxP3(WRAPPER, market, upgradeAuthority, { assetIndex: 0, ... });
 * ```
 */
export declare function buildSetVaultLpRiskIxP3(programId: PublicKey, market: PublicKey, upgradeAuthority: PublicKey, args: SetVaultLpRiskArgsP3): TransactionInstruction;
/**
 * Tag 100 VaultLpConvertPnl (permissionless).
 * @param m       Market context.
 * @param caller  Signer.
 * @param amount  Atoms.
 * @returns Instruction.
 * @example
 * ```ts
 * buildVaultLpConvertPnlIxP3(m, keeper, 1n);
 * ```
 */
export declare function buildVaultLpConvertPnlIxP3(m: VaultLpMarketP3, caller: PublicKey, amount: bigint): TransactionInstruction;
/**
 * Tag 101 VaultLpSettleResolved (permissionless, Resolved). Replaces tags 30/46 for the vault LP.
 * @param m                Market context.
 * @param caller           Signer.
 * @param juniorDestToken  Junior owner's collateral token account.
 * @param vaultToken       Market collateral vault.
 * @param topup            0 = close step, 1 = topup claim.
 * @returns Instruction.
 * @example
 * ```ts
 * buildVaultLpSettleResolvedIxP3(m, keeper, juniorAta, vault, 0);
 * ```
 */
export declare function buildVaultLpSettleResolvedIxP3(m: VaultLpMarketP3, caller: PublicKey, juniorDestToken: PublicKey, vaultToken: PublicKey, topup: 0 | 1): TransactionInstruction;
/**
 * Tag 102 VaultLpReleaseSurplus (junior owner). Pass `resolved` for the Resolved-mode SPL payout tail.
 * @param m             Market context.
 * @param juniorOwner   Signer.
 * @param amount        Atoms.
 * @param sourceDomain  Backing domain.
 * @param resolved      Resolved-mode tail: junior dest token + market vault token.
 * @returns Instruction.
 * @example
 * ```ts
 * buildVaultLpReleaseSurplusIxP3(m, junior, 10n, 0);
 * ```
 */
export declare function buildVaultLpReleaseSurplusIxP3(m: VaultLpMarketP3, juniorOwner: PublicKey, amount: bigint, sourceDomain: number, resolved?: {
    juniorDestToken: PublicKey;
    vaultToken: PublicKey;
}): TransactionInstruction;
/** Base account count each Earn tag must have before the P3 tail (tail index = this). */
export declare const BOUND_VAULT_LP_TAIL_INDEX_P3: Readonly<{
    readonly 75: 11;
    readonly 77: 13;
    readonly 78: 6;
}>;
/**
 * Append the REQUIRED bound-vault tail to an Earn instruction (fail closed on a bound vault):
 * 75 DepositToLpVault → [11] vault_lp_state (w), [12] vault LP portfolio;
 * 77 ExecuteRedemption → [13] vault_lp_state (w), [14] vault LP portfolio;
 * 78 LpVaultCrankFees → [6] vault_lp_state (w).
 * Tag 76 (RequestRedeemLpShares) takes no tail on P3.
 *
 * @param base         The unbound-form instruction (tag + exact base account count checked).
 * @param vaultLpState `["vault_lp", market]`.
 * @param lpPortfolio  The vault-owned LP portfolio (ignored for tag 78).
 * @returns A new instruction with the tail appended.
 * @throws If the tag is not 75/77/78 or the base account count is wrong.
 * @example
 * ```ts
 * const ix = withBoundVaultLpTailP3(depositIx, vaultLpState, lpPortfolio);
 * ```
 */
export declare function withBoundVaultLpTailP3(base: TransactionInstruction, vaultLpState: PublicKey, lpPortfolio: PublicKey): TransactionInstruction;
/** Inputs for {@link buildVaultLpRefreshCrankIxP3}. */
export interface VaultLpRefreshCrankArgsP3 {
    programId: PublicKey;
    cranker: PublicKey;
    market: PublicKey;
    vaultLpPortfolio: PublicKey;
    nowSlot: bigint;
    /** One hint per asset whose oracle accounts follow, in order. */
    observations: CrankObservationHint[];
    /** Read-only oracle accounts, in the order the observations describe. */
    oracleAccounts: PublicKey[];
}
/**
 * The vault-LP refresh crank: a permissionless tag-5 crank whose portfolio is the vault LP.
 * On P3 it refreshes the vault LP's health cert (clears VaultLpValuationStale, error 85, for
 * a following Earn 75/77) and re-snapshots `AssetVaultLpV18.lp_net_q` for skew funding
 * (`vault_lp_refresh_snapshot`). Prepend it in the same transaction.
 *
 * @param a  Crank inputs.
 * @returns Instruction.
 * @example
 * ```ts
 * const crank = buildVaultLpRefreshCrankIxP3({ programId, cranker, market, vaultLpPortfolio, nowSlot, observations: [{ assetIndex: 0, oracleAccounts: 0 }], oracleAccounts: [] });
 * ```
 */
export declare function buildVaultLpRefreshCrankIxP3(a: VaultLpRefreshCrankArgsP3): TransactionInstruction;
