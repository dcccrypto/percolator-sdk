/**
 * P3 vault-owned LP — account decoders, PDAs, instruction builders, the bound-vault tail for
 * Earn tags 75/77/78, and the vault-LP refresh crank. Additive to SDK 8.0.0.
 *
 * Source: percolator-prog `feat/p3-vault-owned-lp` @ `b2b2559e62e08a96b978a2d81a67991c93bc6061`
 * (`state::{VaultLpStateV18, AssetVaultLpV18, read_asset_vault_lp}`, `load_bound_vault_lp_tail`,
 * `vault_lp_refresh_snapshot`). Offsets are pinned by `test/p3.test.ts` against rustc
 * `offset_of!` on the REAL P3 structs, and the per-asset record offset against a market
 * account built by the P3 crate itself.
 *
 * Relaunch wrapper = P1 + P3 (`b2b2559e`). On an older v18.2 market every AssetVaultLpV18
 * record is zero ("no vault LP bound").
 *
 * @module p3-vault-lp
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { AccountMeta } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { buildAccountMetas } from "../abi/accounts.js";
import type { AccountSpec } from "../abi/accounts.js";
import { encodePermissionlessCrank } from "../abi/instructions.js";
import type { CrankObservationHint } from "../abi/instructions.js";
import {
  ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3,
  ACCOUNTS_INIT_VAULT_LP_P3,
  ACCOUNTS_SET_VAULT_LP_RISK_P3,
  ACCOUNTS_VAULT_LP_CONVERT_PNL_P3,
  ACCOUNTS_VAULT_LP_RECALL_P3,
  ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3,
  ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3,
  ACCOUNTS_VAULT_LP_SET_MATCHER_P3,
  ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3,
  ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3,
  encodeDepositJuniorTrancheP3,
  encodeInitVaultLpP3,
  encodeSetVaultLpRiskP3,
  encodeVaultLpConvertPnlP3,
  encodeVaultLpRecallP3,
  encodeVaultLpReleaseSurplusP3,
  encodeVaultLpSetMatcherP3,
  encodeVaultLpSettleResolvedP3,
  encodeWithdrawJuniorTrancheP3,
} from "../abi/p3.js";
import type { SetVaultLpRiskArgsP3, VaultLpSetMatcherArgsP3 } from "../abi/p3.js";
import { deriveLpBackingLedger, deriveLpVaultRegistry, deriveMatcherDelegate, deriveVaultAuthority } from "./pda.js";
import {
  V17_HEADER_LEN,
  V17_KIND_OFF,
  V17_MARKET_ASSET_SLOT_LEN,
  V17_MARKET_GROUP_LEN,
  V17_MARKET_GROUP_OFF,
} from "./slab.js";

// ============================================================================
// Layout constants (verified against P3 rustc layout)
// ============================================================================

/** `KIND_VAULT_LP_STATE`. */
export const V18_KIND_VAULT_LP_STATE_P3 = 9;
/** `size_of::<VaultLpStateV18>()`. */
export const VAULT_LP_STATE_BODY_LEN_P3 = 256;
/** `vault_lp_state_account_len()` = 16 + 256. */
export const VAULT_LP_STATE_ACCOUNT_LEN_P3 = V17_HEADER_LEN + VAULT_LP_STATE_BODY_LEN_P3;
/** `ASSET_VAULT_LP_OFF` inside each asset's 1024-byte wrapper slot. */
export const ASSET_VAULT_LP_SLOT_OFF_P3 = 896;
/** `ASSET_VAULT_LP_LEN`. */
export const ASSET_VAULT_LP_LEN_P3 = 128;
/** `ASSET_VAULT_LP_FLAG_BOUND`. */
export const ASSET_VAULT_LP_FLAG_BOUND_P3 = 1;
/** Account offset of `LpVaultRegistryV16._reserved[0]` = the "vault LP bound" flag (16 + 144). */
export const LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3 = 160;

/** Account offsets of `VaultLpStateV18` fields (header included). */
export const VAULT_LP_STATE_OFF_P3 = Object.freeze({
  marketGroup: 16, registry: 48, lpPortfolio: 80, juniorOwner: 112,
  seniorClaimAtoms: 144, juniorDepositedAtoms: 160, juniorWithdrawnAtoms: 176,
  seniorFeeCreditedAtoms: 192, recalledAtoms: 208, assetIndex: 224, juniorFloorBps: 226,
  seniorFeeShareBps: 228, version: 230, bump: 231,
} as const);

/** Offsets of `AssetVaultLpV18` fields inside the 128-byte record. */
export const ASSET_VAULT_LP_FIELD_OFF_P3 = Object.freeze({
  vaultLpPortfolio: 0, lpNetQ: 32, levCapQ: 48, lpNetSlot: 64, skewSlopeE9: 72, skewMaxE9: 80,
  levMaxImrBps: 88, flags: 90, reserved0: 91, vaultLpMaxLevBps: 92, approvedMatcherProgram: 96,
} as const);

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
export function assetVaultLpAccountOffsetP3(assetIndex: number): number {
  if (!Number.isInteger(assetIndex) || assetIndex < 0) throw new Error(`assetIndex must be a non-negative integer, got ${assetIndex}`);
  return V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + assetIndex * V17_MARKET_ASSET_SLOT_LEN + ASSET_VAULT_LP_SLOT_OFF_P3;
}

// ============================================================================
// Decoders
// ============================================================================

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

function view(d: Uint8Array): DataView {
  return new DataView(d.buffer, d.byteOffset, d.byteLength);
}
function u128(v: DataView, o: number): bigint {
  return (v.getBigUint64(o + 8, true) << 64n) | v.getBigUint64(o, true);
}
function i128(v: DataView, o: number): bigint {
  const x = u128(v, o);
  return x >= 1n << 127n ? x - (1n << 128n) : x;
}
function key(d: Uint8Array, o: number): PublicKey {
  return new PublicKey(d.subarray(o, o + 32));
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
export function decodeVaultLpStateP3(data: Uint8Array): VaultLpStateP3 {
  if (data.length < VAULT_LP_STATE_ACCOUNT_LEN_P3) throw new Error(`VaultLpStateV18: need ${VAULT_LP_STATE_ACCOUNT_LEN_P3} bytes, got ${data.length}`);
  if (data[V17_KIND_OFF] !== V18_KIND_VAULT_LP_STATE_P3) throw new Error(`VaultLpStateV18: kind ${data[V17_KIND_OFF]} != 9`);
  const v = view(data);
  const O = VAULT_LP_STATE_OFF_P3;
  const st: VaultLpStateP3 = {
    marketGroup: key(data, O.marketGroup), registry: key(data, O.registry), lpPortfolio: key(data, O.lpPortfolio),
    juniorOwner: key(data, O.juniorOwner), seniorClaimAtoms: u128(v, O.seniorClaimAtoms),
    juniorDepositedAtoms: u128(v, O.juniorDepositedAtoms), juniorWithdrawnAtoms: u128(v, O.juniorWithdrawnAtoms),
    seniorFeeCreditedAtoms: u128(v, O.seniorFeeCreditedAtoms), recalledAtoms: u128(v, O.recalledAtoms),
    assetIndex: v.getUint16(O.assetIndex, true), juniorFloorBps: v.getUint16(O.juniorFloorBps, true),
    seniorFeeShareBps: v.getUint16(O.seniorFeeShareBps, true), version: data[O.version], bump: data[O.bump],
  };
  const tailZero = data.subarray(232, VAULT_LP_STATE_ACCOUNT_LEN_P3).every((b) => b === 0);
  if (st.version !== 1 || st.juniorFloorBps < 1_000 || st.juniorFloorBps > 10_000 || st.seniorFeeShareBps !== 10_000 || !tailZero) {
    throw new Error("VaultLpStateV18: invalid (version/floor/fee share/padding) — the program would reject it too");
  }
  return st;
}

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
export function decodeAssetVaultLpRecordP3(rec: Uint8Array): AssetVaultLpP3 {
  if (rec.length !== ASSET_VAULT_LP_LEN_P3) throw new Error(`AssetVaultLpV18 record must be 128 bytes, got ${rec.length}`);
  const v = view(rec);
  const F = ASSET_VAULT_LP_FIELD_OFF_P3;
  const zero32 = (o: number): boolean => rec.subarray(o, o + 32).every((b) => b === 0);
  const flags = rec[F.flags];
  const bound = (flags & ASSET_VAULT_LP_FLAG_BOUND_P3) !== 0;
  const out: AssetVaultLpP3 = {
    vaultLpPortfolio: zero32(F.vaultLpPortfolio) ? null : key(rec, F.vaultLpPortfolio),
    lpNetQ: i128(v, F.lpNetQ), levCapQ: u128(v, F.levCapQ), lpNetSlot: v.getBigUint64(F.lpNetSlot, true),
    skewSlopeE9: v.getBigUint64(F.skewSlopeE9, true), skewMaxE9: v.getBigUint64(F.skewMaxE9, true),
    levMaxImrBps: v.getUint16(F.levMaxImrBps, true), flags, bound,
    vaultLpMaxLevBps: v.getUint32(F.vaultLpMaxLevBps, true),
    approvedMatcherProgram: zero32(F.approvedMatcherProgram) ? null : key(rec, F.approvedMatcherProgram),
  };
  if ((flags & ~ASSET_VAULT_LP_FLAG_BOUND_P3) !== 0 || rec[F.reserved0] !== 0 || out.vaultLpMaxLevBps > 50_000 ||
    out.levMaxImrBps > 10_000 || bound !== (out.vaultLpPortfolio !== null)) {
    throw new Error("AssetVaultLpV18: invalid record — the program would reject it too");
  }
  return out;
}

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
export function decodeAssetVaultLpP3(marketData: Uint8Array, assetIndex: number): AssetVaultLpP3 {
  if (marketData[V17_KIND_OFF] !== 1) throw new Error(`not a market account (kind ${marketData[V17_KIND_OFF]})`);
  const off = assetVaultLpAccountOffsetP3(assetIndex);
  if (marketData.length < off + ASSET_VAULT_LP_LEN_P3) throw new Error(`market account too short for asset ${assetIndex}`);
  return decodeAssetVaultLpRecordP3(marketData.subarray(off, off + ASSET_VAULT_LP_LEN_P3));
}

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
export function isLpVaultRegistryBoundP3(registryData: Uint8Array): boolean {
  const b = registryData[LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3];
  if (b !== 0 && b !== 1) throw new Error(`registry bound flag must be 0|1, got ${b}`);
  return b === 1;
}

// ============================================================================
// PDAs
// ============================================================================

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
export function deriveVaultLpStateP3(programId: PublicKey, market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode("vault_lp"), market.toBytes()], programId);
}

/** BPF upgradeable loader id. */
export const BPF_LOADER_UPGRADEABLE_ID_P3 = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

/**
 * The wrapper's ProgramData account (`[program_id]` under the upgradeable loader) — required by
 * the upgrade-authority tags 95 and 99.
 * @param programId  Wrapper program id.
 * @returns [programData, bump].
 * @example
 * ```ts
 * const [programData] = deriveProgramDataAddressP3(WRAPPER);
 * ```
 */
export function deriveProgramDataAddressP3(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([programId.toBytes()], BPF_LOADER_UPGRADEABLE_ID_P3);
}

/** Own + sibling backing-ledger PDAs for a registry domain (`sibling = domain ^ 1`). */
function ledgers(programId: PublicKey, market: PublicKey, registryDomain: number): { ledger: PublicKey; siblingLedger: PublicKey } {
  return {
    ledger: deriveLpBackingLedger(programId, market, registryDomain)[0],
    siblingLedger: deriveLpBackingLedger(programId, market, registryDomain ^ 1)[0],
  };
}

function ix(programId: PublicKey, spec: readonly AccountSpec[], keys: Record<string, PublicKey>, data: Uint8Array, extra: AccountMeta[] = []): TransactionInstruction {
  return new TransactionInstruction({ programId, keys: [...buildAccountMetas(spec, keys), ...extra], data: Buffer.from(data) });
}

// ============================================================================
// Instruction builders (tags 94..=102)
// ============================================================================

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
 * Tag 94 InitVaultLp, path A only: the marketauth signs and becomes the junior owner. (The
 * upgrade-authority path B is removed from the relaunch P3.) On a stake-bound market the
 * marketauth is the keyless stake-pool PDA, so bind the vault LP before InitPool rotates it.
 *
 * @param m               Market context.
 * @param marketauth      The market's marketauth (signer; becomes the junior owner).
 * @param juniorFloorBps  1000..=10000.
 * @returns Instruction (8 accounts).
 * @example
 * ```ts
 * const ix = buildInitVaultLpIxP3({ programId, market, registryDomain: 0, lpPortfolio }, marketauth, 2_000);
 * ```
 */
export function buildInitVaultLpIxP3(m: VaultLpMarketP3, marketauth: PublicKey, juniorFloorBps: number): TransactionInstruction {
  return ix(m.programId, ACCOUNTS_INIT_VAULT_LP_P3, {
    authority: marketauth, market: m.market, registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0], lpPortfolio: m.lpPortfolio,
    systemProgram: SystemProgram.programId, ...ledgers(m.programId, m.market, m.registryDomain),
  }, encodeInitVaultLpP3(juniorFloorBps));
}

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
export function buildVaultLpSetMatcherIxP3(
  m: VaultLpMarketP3, upgradeAuthority: PublicKey, matcherProgram: PublicKey, matcherCtx: PublicKey, args: VaultLpSetMatcherArgsP3,
): TransactionInstruction {
  const [registry] = deriveLpVaultRegistry(m.programId, m.market);
  const [matcherDelegate] = deriveMatcherDelegate(m.programId, m.market, m.lpPortfolio, registry, matcherProgram, matcherCtx);
  return ix(m.programId, ACCOUNTS_VAULT_LP_SET_MATCHER_P3, {
    upgradeAuthority, programData: deriveProgramDataAddressP3(m.programId)[0], market: m.market,
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0], lpPortfolio: m.lpPortfolio,
    matcherProgram, matcherCtx, matcherDelegate,
  }, encodeVaultLpSetMatcherP3(args));
}

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
export function buildDepositJuniorTrancheIxP3(m: VaultLpMarketP3, juniorOwner: PublicKey, sourceToken: PublicKey, vaultToken: PublicKey, amount: bigint): TransactionInstruction {
  return ix(m.programId, ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3, {
    juniorOwner, market: m.market, vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0], lpPortfolio: m.lpPortfolio,
    sourceToken, vaultToken, tokenProgram: TOKEN_PROGRAM_ID,
  }, encodeDepositJuniorTrancheP3(amount));
}

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
export function buildWithdrawJuniorTrancheIxP3(m: VaultLpMarketP3, juniorOwner: PublicKey, destToken: PublicKey, vaultToken: PublicKey, amount: bigint): TransactionInstruction {
  return ix(m.programId, ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3, {
    juniorOwner, market: m.market, registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0], lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain), destToken, vaultToken,
    vaultAuthority: deriveVaultAuthority(m.programId, m.market)[0], tokenProgram: TOKEN_PROGRAM_ID,
  }, encodeWithdrawJuniorTrancheP3(amount));
}

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
export function buildVaultLpRecallIxP3(m: VaultLpMarketP3, cranker: PublicKey, amount: bigint, targetDomain: number): TransactionInstruction {
  return ix(m.programId, ACCOUNTS_VAULT_LP_RECALL_P3, {
    cranker, market: m.market, registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0], lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain), systemProgram: SystemProgram.programId,
  }, encodeVaultLpRecallP3(amount, targetDomain));
}

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
export function buildSetVaultLpRiskIxP3(programId: PublicKey, market: PublicKey, upgradeAuthority: PublicKey, args: SetVaultLpRiskArgsP3): TransactionInstruction {
  return ix(programId, ACCOUNTS_SET_VAULT_LP_RISK_P3, {
    upgradeAuthority, programData: deriveProgramDataAddressP3(programId)[0], market,
  }, encodeSetVaultLpRiskP3(args));
}

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
export function buildVaultLpConvertPnlIxP3(m: VaultLpMarketP3, caller: PublicKey, amount: bigint): TransactionInstruction {
  return ix(m.programId, ACCOUNTS_VAULT_LP_CONVERT_PNL_P3, {
    caller, market: m.market, vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0], lpPortfolio: m.lpPortfolio,
  }, encodeVaultLpConvertPnlP3(amount));
}

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
export function buildVaultLpSettleResolvedIxP3(m: VaultLpMarketP3, caller: PublicKey, juniorDestToken: PublicKey, vaultToken: PublicKey, topup: 0 | 1): TransactionInstruction {
  return ix(m.programId, ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3, {
    caller, market: m.market, registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0], lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain), juniorDestToken, vaultToken,
    vaultAuthority: deriveVaultAuthority(m.programId, m.market)[0], tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }, encodeVaultLpSettleResolvedP3(topup));
}

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
export function buildVaultLpReleaseSurplusIxP3(
  m: VaultLpMarketP3, juniorOwner: PublicKey, amount: bigint, sourceDomain: number,
  resolved?: { juniorDestToken: PublicKey; vaultToken: PublicKey },
): TransactionInstruction {
  const extra = resolved
    ? buildAccountMetas(ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_RESOLVED_TAIL_P3, {
      juniorDestToken: resolved.juniorDestToken, vaultToken: resolved.vaultToken,
      vaultAuthority: deriveVaultAuthority(m.programId, m.market)[0], tokenProgram: TOKEN_PROGRAM_ID,
    })
    : [];
  return ix(m.programId, ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3, {
    juniorOwner, market: m.market, registry: deriveLpVaultRegistry(m.programId, m.market)[0],
    vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0], lpPortfolio: m.lpPortfolio,
    ...ledgers(m.programId, m.market, m.registryDomain),
  }, encodeVaultLpReleaseSurplusP3(amount, sourceDomain), extra);
}

// ============================================================================
// Bound-vault tail for Earn tags 75 / 77 / 78
// ============================================================================

/** Base account count each Earn tag must have before the P3 tail (tail index = this). */
export const BOUND_VAULT_LP_TAIL_INDEX_P3 = Object.freeze({ 75: 11, 77: 13, 78: 6 } as const);

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
export function withBoundVaultLpTailP3(base: TransactionInstruction, vaultLpState: PublicKey, lpPortfolio: PublicKey): TransactionInstruction {
  const tag = base.data[0];
  if (tag !== 75 && tag !== 77 && tag !== 78) throw new Error(`withBoundVaultLpTailP3: tag ${tag} takes no vault-LP tail (only 75/77/78)`);
  const want = BOUND_VAULT_LP_TAIL_INDEX_P3[tag];
  if (base.keys.length !== want) throw new Error(`withBoundVaultLpTailP3: tag ${tag} must have exactly ${want} base accounts, got ${base.keys.length}`);
  const tail: AccountMeta[] = [{ pubkey: vaultLpState, isSigner: false, isWritable: true }];
  if (tag !== 78) tail.push({ pubkey: lpPortfolio, isSigner: false, isWritable: false });
  return new TransactionInstruction({ programId: base.programId, keys: [...base.keys, ...tail], data: base.data });
}

// ============================================================================
// Vault-LP refresh crank (tag 5 on the vault LP portfolio)
// ============================================================================

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
export function buildVaultLpRefreshCrankIxP3(a: VaultLpRefreshCrankArgsP3): TransactionInstruction {
  const want = a.observations.reduce((s, o) => s + o.oracleAccounts, 0);
  if (want !== a.oracleAccounts.length) throw new Error(`observations name ${want} oracle accounts, got ${a.oracleAccounts.length}`);
  return new TransactionInstruction({
    programId: a.programId,
    keys: [
      { pubkey: a.cranker, isSigner: true, isWritable: true },
      { pubkey: a.market, isSigner: false, isWritable: true },
      { pubkey: a.vaultLpPortfolio, isSigner: false, isWritable: true },
      ...a.oracleAccounts.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })),
    ],
    data: Buffer.from(encodePermissionlessCrank({ nowSlot: a.nowSlot, observations: a.observations })),
  });
}
