/**
 * v2.2 leverage guard (wrapper tag 124): PDA helpers, instruction builders for ops 0 to 6, and the helper that
 * appends the guard to a TradeCpi / EvictAndTradeCpi instruction. Data and account rules: {@link "../abi/lev-guard-v22"}.
 *
 * @module lev-guard-v22-builders
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { AccountMeta } from "@solana/web3.js";
import { buildAccountMetas } from "../abi/accounts.js";
import {
  ACCOUNTS_LEV_GUARD_ADMIN_V22, ACCOUNTS_LEV_GUARD_INIT_V22, ACCOUNTS_LEV_GUARD_LP_STOP_V22, ACCOUNTS_LEV_GUARD_POKE_V22,
  ACCOUNTS_LEV_GUARD_REPORT_V22, ACCOUNTS_LEV_GUARD_TIGHTEN_V22, LEV_GUARD_SEEDS_V22,
  encodeLevGuardInitV22, encodeLevGuardLpStopV22, encodeLevGuardPokeV22, encodeLevGuardReportV22, encodeLevGuardSetRiskKeyV22,
  encodeLevGuardSetT0V22, encodeLevGuardTightenV22,
} from "../abi/lev-guard-v22.js";
import type { LevGuardReportV22 } from "../abi/lev-guard-v22.js";
import { IX_TAG_EXTENDED_V22, IX_TAG_V22 } from "../abi/v22-wire.js";
import { BPF_LOADER_UPGRADEABLE_ID_P3 } from "./p3-vault-lp.js";

const enc = new TextEncoder();
const w = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: false, isWritable: true });
const r = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: false, isWritable: false });

// ============================================================================
// PDAs
// ============================================================================

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
export function deriveLevGuardV22(programId: PublicKey, market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode(LEV_GUARD_SEEDS_V22.guard), market.toBytes()], programId);
}

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
export function deriveVaultLpStateV22(programId: PublicKey, market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode(LEV_GUARD_SEEDS_V22.vaultLpState), market.toBytes()], programId);
}

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
export function deriveVaultLpExtV22(programId: PublicKey, market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode(LEV_GUARD_SEEDS_V22.vaultLpExt), market.toBytes()], programId);
}

/**
 * Depth-source pin PDA, seeds `["depth_src", market]` (written by tag 123; op 3 TIGHTEN reads it).
 *
 * @param programId  Wrapper program id.
 * @param market     Market account.
 * @returns `[pda, bump]`.
 * @example
 * ```ts
 * const [pin] = deriveDepthSourceV22(PROGRAM_ID, market);
 * ```
 */
export function deriveDepthSourceV22(programId: PublicKey, market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode(LEV_GUARD_SEEDS_V22.depthSource), market.toBytes()], programId);
}

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
export function deriveProgramDataV22(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([programId.toBytes()], BPF_LOADER_UPGRADEABLE_ID_P3);
}

// ============================================================================
// Builders
// ============================================================================

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
export function buildLevGuardInitIxV22(c: LevGuardCtxV22, authority: PublicKey, t0: bigint = 0n): TransactionInstruction {
  const keys = buildAccountMetas(ACCOUNTS_LEV_GUARD_INIT_V22, {
    authority, programData: deriveProgramDataV22(c.programId)[0], market: c.market, guard: deriveLevGuardV22(c.programId, c.market)[0],
    systemProgram: SystemProgram.programId,
  });
  return new TransactionInstruction({ programId: c.programId, keys, data: Buffer.from(encodeLevGuardInitV22(t0)) });
}

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
export function buildLevGuardSetRiskKeyIxV22(c: LevGuardCtxV22, upgradeAuthority: PublicKey, key: PublicKey | Uint8Array | null): TransactionInstruction {
  return adminIx(c, upgradeAuthority, encodeLevGuardSetRiskKeyV22(key));
}

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
export function buildLevGuardSetT0IxV22(c: LevGuardCtxV22, upgradeAuthority: PublicKey, t0: bigint): TransactionInstruction {
  return adminIx(c, upgradeAuthority, encodeLevGuardSetT0V22(t0));
}

function adminIx(c: LevGuardCtxV22, upgradeAuthority: PublicKey, data: Uint8Array): TransactionInstruction {
  const keys = buildAccountMetas(ACCOUNTS_LEV_GUARD_ADMIN_V22, {
    upgradeAuthority, programData: deriveProgramDataV22(c.programId)[0], market: c.market, guard: deriveLevGuardV22(c.programId, c.market)[0],
  });
  return new TransactionInstruction({ programId: c.programId, keys, data: Buffer.from(data) });
}

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
export function buildLevGuardReportIxV22(c: LevGuardCtxV22, riskKey: PublicKey, report: LevGuardReportV22): TransactionInstruction {
  const keys = buildAccountMetas(ACCOUNTS_LEV_GUARD_REPORT_V22, { riskKey, market: c.market, guard: deriveLevGuardV22(c.programId, c.market)[0] });
  return new TransactionInstruction({ programId: c.programId, keys, data: Buffer.from(encodeLevGuardReportV22(report)) });
}

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
export function buildLevGuardTightenIxV22(c: LevGuardCtxV22, caller: PublicKey, o: LevGuardTightenOptsV22): TransactionInstruction {
  const keys = buildAccountMetas(ACCOUNTS_LEV_GUARD_TIGHTEN_V22, {
    caller, market: c.market, guard: deriveLevGuardV22(c.programId, c.market)[0], depthSource: deriveDepthSourceV22(c.programId, c.market)[0],
    baseMint: o.baseMint, poolBaseVault: o.poolBaseVault,
  });
  if (o.holderTokenAccount) keys.push(r(o.holderTokenAccount));
  return new TransactionInstruction({ programId: c.programId, keys, data: Buffer.from(encodeLevGuardTightenV22()) });
}

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
export function buildLevGuardPokeIxV22(c: LevGuardCtxV22, caller: PublicKey, o: LevGuardPokeOptsV22): TransactionInstruction {
  const keys = buildAccountMetas(ACCOUNTS_LEV_GUARD_POKE_V22, {
    caller, market: c.market, guard: deriveLevGuardV22(c.programId, c.market)[0], vaultLpPortfolio: o.vaultLpPortfolio,
  });
  if (o.sampleNav) keys.push(r(deriveVaultLpStateV22(c.programId, c.market)[0]), r(deriveVaultLpExtV22(c.programId, c.market)[0]));
  return new TransactionInstruction({ programId: c.programId, keys, data: Buffer.from(encodeLevGuardPokeV22()) });
}

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
export function buildLevGuardLpStopIxV22(c: LevGuardCtxV22, caller: PublicKey, vaultLpPortfolio: PublicKey, opposing: readonly PublicKey[] = []): TransactionInstruction {
  const keys = buildAccountMetas(ACCOUNTS_LEV_GUARD_LP_STOP_V22, {
    caller, market: c.market, guard: deriveLevGuardV22(c.programId, c.market)[0], vaultLpPortfolio,
    vaultLpState: deriveVaultLpStateV22(c.programId, c.market)[0], vaultLpExt: deriveVaultLpExtV22(c.programId, c.market)[0],
  });
  for (const p of opposing) keys.push(w(p));
  return new TransactionInstruction({ programId: c.programId, keys, data: Buffer.from(encodeLevGuardLpStopV22()) });
}

// ============================================================================
// TradeCpi / EvictAndTradeCpi tail
// ============================================================================

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
export function withLevGuardTailV22(ix: TransactionInstruction, market: PublicKey): TransactionInstruction {
  const tag = ix.data[0];
  const marketIdx = tag === IX_TAG_EXTENDED_V22.TradeCpi ? 1 : tag === IX_TAG_V22.EvictAndTradeCpi ? 2 : -1;
  if (marketIdx < 0) throw new Error(`withLevGuardTailV22: expected TradeCpi (10) or EvictAndTradeCpi (119), got tag ${tag}`);
  if (!ix.keys[marketIdx]?.pubkey.equals(market)) throw new Error("withLevGuardTailV22: market is not at the expected account index of this instruction");
  const [guard] = deriveLevGuardV22(ix.programId, market);
  const last = ix.keys[ix.keys.length - 1];
  if (last.pubkey.equals(guard)) return ix;
  return new TransactionInstruction({ programId: ix.programId, keys: [...ix.keys, w(guard)], data: ix.data });
}
