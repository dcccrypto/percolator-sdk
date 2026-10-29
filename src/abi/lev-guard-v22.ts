/**
 * v2.2 leverage guard (wrapper tag 124): instruction data encoders, account lists, the `LevGuardV22`
 * account decoder (header kind 17) and the small derived reads a UI or keeper needs.
 *
 * Source of truth: `percolator-prog` branch `fix/v22-lev-audit-2026-10-28` (on `feat/v22-rc23-2026-10-22` a0c1337d),
 * `src/lev_guard_v22.rs` (record, constants, ops) and `src/v16_program.rs` (`Instruction::LevGuard` decode / encode,
 * `handle_lev_guard`, `lev_guard_split`, `lev_trade_post`), and the ledger spec `v22-lev-guard-wire-spec-2026-10-28.md`.
 * Nothing here is deployed.
 *
 * @module lev-guard-v22
 */
import { PublicKey } from "@solana/web3.js";
import { concatBytes, encU16, encU64, encU8 } from "./encode.js";
import type { AccountSpec } from "./accounts.js";
import { ACCOUNT_KIND, LAYOUT_V22, UnknownLayoutError, resolveLayout } from "./layout.js";
import type { LayoutTable } from "./layout.js";

// ============================================================================
// Constants
// ============================================================================

/** Wrapper instruction tag (`constants::TAG_LEV_GUARD`). */
export const TAG_LEV_GUARD_V22 = 124;

/** Tag 124 ops (`lev_guard_v22::OP_*`). */
export const LEV_GUARD_OP_V22 = Object.freeze({
  Init: 0,
  SetRiskKey: 1,
  Report: 2,
  Tighten: 3,
  Poke: 4,
  LpStop: 5,
  SetT0: 6,
} as const);
export type LevGuardOpV22 = (typeof LEV_GUARD_OP_V22)[keyof typeof LEV_GUARD_OP_V22];

/** PDA seeds (`LEV_GUARD_SEED`, `VAULT_LP_STATE_SEED`, `VAULT_LP_EXT_SEED`, `DEPTH_SOURCE_SEED`). */
export const LEV_GUARD_SEEDS_V22 = Object.freeze({
  guard: "lev_guard",
  vaultLpState: "vault_lp",
  vaultLpExt: "vault_lp_ext",
  depthSource: "depth_src",
} as const);

/** Record length (`LEV_GUARD_REC_LEN`). */
export const LEV_GUARD_REC_LEN_V22 = 360;
/** The record before prog#605 (burst memory): 344 B, account 4456. The decoder accepts both. */
export const LEV_GUARD_REC_LEN_PRE_BURST_V22 = 344;
/**
 * Tag width (`KEY_TAG_LEN`, prog#610/#611). The tag is a portfolio address PREFIX and is that
 * account's identity in the touched set, so the width is a security parameter: at 8 bytes a
 * birthday search over client-chosen portfolio addresses costs ~2^32, at 16 it costs ~2^64.
 */
export const LEV_GUARD_KEY_TAG_LEN_V22 = 16;
/** Touched-set capacity (`W1_TOUCHED_CAP`). */
export const LEV_GUARD_TOUCHED_CAP_V22 = 256;
/** Touched-set byte length (`KEY_TAG_LEN * W1_TOUCHED_CAP`): 4096, unchanged by the widening. */
export const LEV_GUARD_TOUCHED_LEN_V22 = LEV_GUARD_KEY_TAG_LEN_V22 * LEV_GUARD_TOUCHED_CAP_V22;
/** Body length (record + touched set). */
export const LEV_GUARD_BODY_LEN_V22 = LEV_GUARD_REC_LEN_V22 + LEV_GUARD_TOUCHED_LEN_V22;
/** Account length: 16-byte header + body = 4472 (prog#605 burst memory; 4456 before it). */
export const LEV_GUARD_ACCOUNT_LEN_V22 = 16 + LEV_GUARD_BODY_LEN_V22;
/** The only record version (`LEV_GUARD_VERSION`). */
export const LEV_GUARD_VERSION_V22 = 1;

/** `flags` bits. */
export const LEV_GUARD_FLAG_V22 = Object.freeze({ MINT_AUTH_LIVE: 1, FREEZE_AUTH_LIVE: 2 } as const);

/** Slots per hour / day (`SLOTS_PER_HOUR`, `SLOTS_PER_DAY`). */
export const LEV_SLOTS_PER_HOUR_V22 = 9_000n;
export const LEV_SLOTS_PER_DAY_V22 = 216_000n;
/** Age thresholds: no opens below 6 h; day below 24 h; week below 7 d; month below 30 d; mature after. */
export const LEV_AGE_NO_OPEN_SLOTS_V22 = 6n * LEV_SLOTS_PER_HOUR_V22;
export const LEV_AGE_DAY_SLOTS_V22 = LEV_SLOTS_PER_DAY_V22;
export const LEV_AGE_WEEK_SLOTS_V22 = 7n * LEV_SLOTS_PER_DAY_V22;
export const LEV_AGE_MONTH_SLOTS_V22 = 30n * LEV_SLOTS_PER_DAY_V22;
/** A risk report is fresh for 3 h and held (last value used) to 24 h. */
export const LEV_REPORT_FRESH_SLOTS_V22 = 3n * LEV_SLOTS_PER_HOUR_V22;
export const LEV_REPORT_HELD_SLOTS_V22 = LEV_SLOTS_PER_DAY_V22;
/** NAV per share fixed point (`NAV_ONE`). */
export const LEV_NAV_ONE_V22 = 1_000_000_000_000n;
/** A W1 round blocks LP-growing fills for this many slots after it opens (`W1_ROUND_SLOTS`, 9 000). */
export const LEV_W1_ROUND_SLOTS_V22 = 9_000n;
/** Max value of every bps field in a report (`report_ok`). */
export const LEV_REPORT_BPS_MAX_V22 = 10_000;

// ============================================================================
// Instruction data
// ============================================================================

const U16 = 0xffff;
function u16In(name: string, v: number, max = U16): void {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${name} must be an integer in 0..=${max}, got ${v}`);
}
function slotIn(name: string, v: bigint, min: bigint): void {
  if (typeof v !== "bigint" || v < min || v > (1n << 64n) - 1n) throw new Error(`${name} must be a u64 bigint >= ${min}, got ${String(v)}`);
}

/**
 * Op 0 INIT data: `[124, 0, t0: u64 LE]` (10 bytes).
 *
 * @param t0  Token start slot. `0n` = the current slot (what a creator passes); only the program's upgrade authority may pass an earlier slot.
 * @returns Instruction data.
 * @throws If `t0` is not a u64.
 * @example
 * ```ts
 * const data = encodeLevGuardInitV22(0n);
 * ```
 */
export function encodeLevGuardInitV22(t0: bigint = 0n): Uint8Array {
  slotIn("t0", t0, 0n);
  return concatBytes(encU8(TAG_LEV_GUARD_V22), encU8(LEV_GUARD_OP_V22.Init), encU64(t0));
}

/**
 * Op 1 SET_RISK_KEY data: `[124, 1, key: [u8; 32]]` (34 bytes). Upgrade authority only.
 *
 * @param key  The holder risk key; `null` or 32 zero bytes = no key (reports refused).
 * @returns Instruction data.
 * @throws If a byte array is not 32 bytes.
 * @example
 * ```ts
 * const data = encodeLevGuardSetRiskKeyV22(riskKeyPubkey);
 * ```
 */
export function encodeLevGuardSetRiskKeyV22(key: PublicKey | Uint8Array | null): Uint8Array {
  const k = key === null ? new Uint8Array(32) : key instanceof PublicKey ? key.toBytes() : key;
  if (k.length !== 32) throw new Error(`risk key must be 32 bytes, got ${k.length}`);
  return concatBytes(encU8(TAG_LEV_GUARD_V22), encU8(LEV_GUARD_OP_V22.SetRiskKey), k);
}

/** Op 2 REPORT fields. Each bps field is at most 10 000. */
export interface LevGuardReportV22 {
  /** Largest plausible holder dump as a price drop (bps). */
  jDumpBps: number;
  /** Insider / holder dump size used by the short-side cap (bps of price). */
  mIndBps: number;
  /** Leverage cap x100 (0 = no cap from the report; any u16). */
  lCapX100: number;
  /** Size multiplier on the size cap (bps, 10 000 = none). */
  nMultBps: number;
}

/**
 * Op 2 REPORT data: `[124, 2, j_dump_bps u16, m_ind_bps u16, l_cap_x100 u16, n_mult_bps u16]` (10 bytes), all LE.
 *
 * @param r  The report.
 * @returns Instruction data.
 * @throws If a bps field exceeds 10 000 or `lCapX100` is not a u16 (the program answers `Custom(134)` otherwise).
 * @example
 * ```ts
 * const data = encodeLevGuardReportV22({ jDumpBps: 2000, mIndBps: 5000, lCapX100: 0, nMultBps: 10000 });
 * ```
 */
export function encodeLevGuardReportV22(r: LevGuardReportV22): Uint8Array {
  u16In("jDumpBps", r.jDumpBps, LEV_REPORT_BPS_MAX_V22);
  u16In("mIndBps", r.mIndBps, LEV_REPORT_BPS_MAX_V22);
  u16In("lCapX100", r.lCapX100);
  u16In("nMultBps", r.nMultBps, LEV_REPORT_BPS_MAX_V22);
  return concatBytes(
    encU8(TAG_LEV_GUARD_V22), encU8(LEV_GUARD_OP_V22.Report),
    encU16(r.jDumpBps), encU16(r.mIndBps), encU16(r.lCapX100), encU16(r.nMultBps),
  );
}

/**
 * Op 3 TIGHTEN data: `[124, 3]`.
 * @returns Instruction data.
 * @example
 * ```ts
 * const data = encodeLevGuardTightenV22();
 * ```
 */
export function encodeLevGuardTightenV22(): Uint8Array {
  return concatBytes(encU8(TAG_LEV_GUARD_V22), encU8(LEV_GUARD_OP_V22.Tighten));
}

/**
 * Op 4 POKE data: `[124, 4]`.
 * @returns Instruction data.
 * @example
 * ```ts
 * const data = encodeLevGuardPokeV22();
 * ```
 */
export function encodeLevGuardPokeV22(): Uint8Array {
  return concatBytes(encU8(TAG_LEV_GUARD_V22), encU8(LEV_GUARD_OP_V22.Poke));
}

/**
 * Op 5 LP_STOP (W1) data: `[124, 5]`.
 * @returns Instruction data.
 * @example
 * ```ts
 * const data = encodeLevGuardLpStopV22();
 * ```
 */
export function encodeLevGuardLpStopV22(): Uint8Array {
  return concatBytes(encU8(TAG_LEV_GUARD_V22), encU8(LEV_GUARD_OP_V22.LpStop));
}

/**
 * Op 6 SET_T0 data: `[124, 6, t0: u64 LE]` (10 bytes). Upgrade authority only; the program requires `0 < t0 <= now`.
 *
 * @param t0  Non-zero token start slot.
 * @returns Instruction data.
 * @throws If `t0` is zero or not a u64.
 * @example
 * ```ts
 * const data = encodeLevGuardSetT0V22(250_000_000n);
 * ```
 */
export function encodeLevGuardSetT0V22(t0: bigint): Uint8Array {
  slotIn("t0", t0, 1n);
  return concatBytes(encU8(TAG_LEV_GUARD_V22), encU8(LEV_GUARD_OP_V22.SetT0), encU64(t0));
}

// ============================================================================
// Account lists (order = the Rust handler's `account(accounts, i)`; names are the buildAccountMetas keys)
// ============================================================================

/** Op 0 INIT (5): `[0]` market authority (creator) or upgrade authority, signer and writable (payer). */
export const ACCOUNTS_LEV_GUARD_INIT_V22: readonly AccountSpec[] = [
  { name: "authority", signer: true, writable: true },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "guard", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false },
] as const;

/** Op 1 SET_RISK_KEY / op 6 SET_T0 (4): the upgrade authority signs; the program's `expect_writable` is on the guard only. */
export const ACCOUNTS_LEV_GUARD_ADMIN_V22: readonly AccountSpec[] = [
  { name: "upgradeAuthority", signer: true, writable: false },
  { name: "programData", signer: false, writable: false },
  { name: "market", signer: false, writable: false },
  { name: "guard", signer: false, writable: true },
] as const;

/** Op 2 REPORT (3): the risk key signs. */
export const ACCOUNTS_LEV_GUARD_REPORT_V22: readonly AccountSpec[] = [
  { name: "riskKey", signer: true, writable: false },
  { name: "market", signer: false, writable: false },
  { name: "guard", signer: false, writable: true },
] as const;

/**
 * Op 3 TIGHTEN (6 + optional holder token account): `[0]` any (listed as the signer so the fee payer is a signer; the handler never reads it),
 * `[3]` depth-source pin PDA, `[4]` the pinned base mint, `[5]` the pinned pool base vault, `[6]` an optional holder token account.
 */
export const ACCOUNTS_LEV_GUARD_TIGHTEN_V22: readonly AccountSpec[] = [
  { name: "caller", signer: true, writable: false },
  { name: "market", signer: false, writable: false },
  { name: "guard", signer: false, writable: true },
  { name: "depthSource", signer: false, writable: false },
  { name: "baseMint", signer: false, writable: false },
  { name: "poolBaseVault", signer: false, writable: false },
] as const;

/**
 * Op 4 POKE (4 required): market and the bound vault-LP portfolio are writable (mutable views). With NAV sampling the tail is
 * `[4]` vault_lp_state and `[5]` the vault_lp_ext PDA (REQUIRED whenever `[4]` is passed; an empty account is fine if the ext does not exist yet).
 */
export const ACCOUNTS_LEV_GUARD_POKE_V22: readonly AccountSpec[] = [
  { name: "caller", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "guard", signer: false, writable: true },
  { name: "vaultLpPortfolio", signer: false, writable: true },
] as const;

/**
 * Op 5 LP_STOP / W1 (6 + opposing user portfolios): market, guard and vault-LP portfolio writable; `[4]` vault_lp_state, `[5]` vault_lp_ext PDA;
 * `[6..]` the opposing user portfolios to cut (all writable), at most as many as fit the transaction.
 */
export const ACCOUNTS_LEV_GUARD_LP_STOP_V22: readonly AccountSpec[] = [
  { name: "caller", signer: true, writable: false },
  { name: "market", signer: false, writable: true },
  { name: "guard", signer: false, writable: true },
  { name: "vaultLpPortfolio", signer: false, writable: true },
  { name: "vaultLpState", signer: false, writable: false },
  { name: "vaultLpExt", signer: false, writable: false },
] as const;

// ============================================================================
// Account decoder
// ============================================================================

/** Field offsets INSIDE the 360-byte record (rustc `offset_of!`; add 16 for the account). */
export const LEV_GUARD_FIELD_OFF_V22 = Object.freeze({
  market: 0, riskKey: 32, t0Slot: 64, assetIndex: 72, version: 74, bump: 75, flags: 76, roundActive: 77, roundLpLong: 78, pad0: 79,
  repJDumpBps: 80, repMIndBps: 82, repLCapX100: 84, repNMultBps: 86, repSlot: 88,
  holderDumpBps: 96, roundKeepBps: 98, touchedN: 100, pad1: 102, holderDumpSlot: 104,
  pbLastPx: 112, pbLastSlot: 120, pbRefPx: 128, pbRefSlot: 136, pbFreezeUntil: 144, pbOracleUntil: 152,
  frozenLX100: 160, pad2: 162, frozenNQ: 168,
  navps: 184, navLastEquity: 200, navLastIn: 216, navLastOut: 232, navPeakCur: 248, navPeakPrev: 264, navRef: 280,
  navBucketStart: 296, navLastSlot: 304, roundId: 312, roundTargetQ: 320, roundOpenSlot: 336,
  burstVarPeakX100: 344, pad3: 348, burstPeakSlot: 352,
} as const);

/** Decoded `LevGuardV22`. u64 fields are `bigint`, u128 fields `bigint`, u8 / u16 fields `number`. */
export interface LevGuardV22 {
  market: PublicKey;
  /** The holder risk key; all-zero = none. */
  riskKey: PublicKey;
  /** T0: the earliest slot the program vouches for as the token's start. */
  t0Slot: bigint;
  assetIndex: number;
  version: number;
  bump: number;
  flags: number;
  /** Bit 0 of `flags`: the pinned base mint was last seen with a live mint authority. */
  mintAuthLive: boolean;
  /** Bit 1 of `flags`: ... a live freeze authority. */
  freezeAuthLive: boolean;
  /** W1: a stop round is open. */
  roundActive: boolean;
  /** W1: the LP side when the round opened. */
  roundLpLong: boolean;
  repJDumpBps: number;
  repMIndBps: number;
  repLCapX100: number;
  repNMultBps: number;
  /** Authenticated slot of the last report; 0 = never reported. */
  repSlot: bigint;
  holderDumpBps: number;
  roundKeepBps: number;
  touchedN: number;
  holderDumpSlot: bigint;
  pbLastPx: bigint;
  pbLastSlot: bigint;
  pbRefPx: bigint;
  pbRefSlot: bigint;
  pbFreezeUntil: bigint;
  pbOracleUntil: bigint;
  frozenLX100: number;
  frozenNQ: bigint;
  /** NAV per share, scale {@link LEV_NAV_ONE_V22} (1e12). */
  navps: bigint;
  navLastEquity: bigint;
  navLastIn: bigint;
  navLastOut: bigint;
  navPeakCur: bigint;
  navPeakPrev: bigint;
  navRef: bigint;
  navBucketStart: bigint;
  navLastSlot: bigint;
  roundId: bigint;
  roundTargetQ: bigint;
  /** Slot the current W1 round opened (record offset 336). */
  roundOpenSlot: bigint;
  /** Burst memory (decision 28, prog#605): the running peak of the market's vol variance (x100) (record offset 344). */
  burstVarPeakX100: number;
  /** Slot the burst peak was set (record offset 352); the peak is read decayed with a 7-day half-life. */
  burstPeakSlot: bigint;
  /**
   * The first `touchedN` tags of the touched set: the first `LEV_GUARD_KEY_TAG_LEN_V22` bytes of
   * each cut portfolio key, as a LE unsigned integer. Compare with `levKeyTagV22`, never by
   * truncating a key yourself.
   */
  touchedTags: bigint[];
}

function u128At(v: DataView, off: number): bigint {
  return (v.getBigUint64(off + 8, true) << 64n) | v.getBigUint64(off, true);
}
function allZero(b: Uint8Array): boolean {
  for (const x of b) if (x !== 0) return false;
  return true;
}

/**
 * Decode a leverage guard account (`16 + 360 + 4096 = 4472` bytes, header kind 17). Mirrors the program's `validate_guard`
 * (version 1, only known flag bits, booleans 0/1, `touched_n <= 256`, `round_keep_bps <= 10 000`, report bps in range, padding zero).
 *
 * @param data   Raw account bytes.
 * @param table  Layout table (default {@link LAYOUT_V22}); only its header version is used.
 * @returns The decoded guard.
 * @throws {@link UnknownLayoutError} on a wrong header / kind, a short account, or a record that fails validation.
 * @example
 * ```ts
 * const g = decodeLevGuardV22(info.data);
 * const band = levAgeBandV22(g.t0Slot, BigInt(slot));
 * ```
 */
export function decodeLevGuardV22(data: Uint8Array, table: LayoutTable = LAYOUT_V22): LevGuardV22 {
  const parser = "decodeLevGuardV22";
  const L = resolveLayout(data, { parser, kind: ACCOUNT_KIND.LevGuard, versions: [table.version] });
  const b = L.headerLen;
  if (b !== 16) throw new UnknownLayoutError("INVALID_RECORD", parser, `invalid account data: header length ${b} != 16`, { kind: ACCOUNT_KIND.LevGuard });
  // Exact lengths only (security review M-1): 4456 (record 344, prog#604) or 4472 (record 360, prog#605 burst
  // memory). Anything else is refused rather than decoded at shifted offsets.
  const recLen = data.length - b - LEV_GUARD_TOUCHED_LEN_V22;
  if (recLen !== LEV_GUARD_REC_LEN_V22 && recLen !== LEV_GUARD_REC_LEN_PRE_BURST_V22) {
    throw new UnknownLayoutError(
      data.length < b + LEV_GUARD_REC_LEN_PRE_BURST_V22 + LEV_GUARD_TOUCHED_LEN_V22 ? "TOO_SHORT" : "INVALID_RECORD",
      parser,
      `lev guard account length ${data.length}: expected ${b + LEV_GUARD_REC_LEN_PRE_BURST_V22 + LEV_GUARD_TOUCHED_LEN_V22} or ${LEV_GUARD_ACCOUNT_LEN_V22}`,
      { version: L.version, kind: ACCOUNT_KIND.LevGuard },
    );
  }
  const burst = recLen === LEV_GUARD_REC_LEN_V22;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const F = LEV_GUARD_FIELD_OFF_V22;
  const u16 = (o: number): number => v.getUint16(b + o, true);
  const u64 = (o: number): bigint => v.getBigUint64(b + o, true);
  const u128 = (o: number): bigint => u128At(v, b + o);
  const flags = data[b + F.flags];
  const g: LevGuardV22 = {
    market: new PublicKey(data.slice(b + F.market, b + F.market + 32)),
    riskKey: new PublicKey(data.slice(b + F.riskKey, b + F.riskKey + 32)),
    t0Slot: u64(F.t0Slot),
    assetIndex: u16(F.assetIndex),
    version: data[b + F.version],
    bump: data[b + F.bump],
    flags,
    mintAuthLive: (flags & LEV_GUARD_FLAG_V22.MINT_AUTH_LIVE) !== 0,
    freezeAuthLive: (flags & LEV_GUARD_FLAG_V22.FREEZE_AUTH_LIVE) !== 0,
    roundActive: data[b + F.roundActive] === 1,
    roundLpLong: data[b + F.roundLpLong] === 1,
    repJDumpBps: u16(F.repJDumpBps),
    repMIndBps: u16(F.repMIndBps),
    repLCapX100: u16(F.repLCapX100),
    repNMultBps: u16(F.repNMultBps),
    repSlot: u64(F.repSlot),
    holderDumpBps: u16(F.holderDumpBps),
    roundKeepBps: u16(F.roundKeepBps),
    touchedN: u16(F.touchedN),
    holderDumpSlot: u64(F.holderDumpSlot),
    pbLastPx: u64(F.pbLastPx),
    pbLastSlot: u64(F.pbLastSlot),
    pbRefPx: u64(F.pbRefPx),
    pbRefSlot: u64(F.pbRefSlot),
    pbFreezeUntil: u64(F.pbFreezeUntil),
    pbOracleUntil: u64(F.pbOracleUntil),
    frozenLX100: u16(F.frozenLX100),
    frozenNQ: u128(F.frozenNQ),
    navps: u128(F.navps),
    navLastEquity: u128(F.navLastEquity),
    navLastIn: u128(F.navLastIn),
    navLastOut: u128(F.navLastOut),
    navPeakCur: u128(F.navPeakCur),
    navPeakPrev: u128(F.navPeakPrev),
    navRef: u128(F.navRef),
    navBucketStart: u64(F.navBucketStart),
    navLastSlot: u64(F.navLastSlot),
    roundId: u64(F.roundId),
    roundTargetQ: u128(F.roundTargetQ),
    roundOpenSlot: u64(F.roundOpenSlot),
    burstVarPeakX100: burst ? v.getUint32(b + F.burstVarPeakX100, true) : 0,
    burstPeakSlot: burst ? u64(F.burstPeakSlot) : 0n,
    touchedTags: [],
  };
  const rawBool = (o: number): boolean => data[b + o] <= 1;
  const bad =
    g.version !== LEV_GUARD_VERSION_V22 ||
    (flags & ~(LEV_GUARD_FLAG_V22.MINT_AUTH_LIVE | LEV_GUARD_FLAG_V22.FREEZE_AUTH_LIVE)) !== 0 ||
    !rawBool(F.roundActive) || !rawBool(F.roundLpLong) ||
    g.touchedN > LEV_GUARD_TOUCHED_CAP_V22 || g.roundKeepBps > 10_000 ||
    g.repJDumpBps > 10_000 || g.repMIndBps > 10_000 || g.repNMultBps > 10_000 ||
    data[b + F.pad0] !== 0 || !allZero(data.subarray(b + F.pad1, b + F.pad1 + 2)) || !allZero(data.subarray(b + F.pad2, b + F.pad2 + 6)) ||
    (burst && !allZero(data.subarray(b + F.pad3, b + F.pad3 + 4)));
  if (bad) throw new UnknownLayoutError("INVALID_RECORD", parser, "invalid account data: lev guard fails the program's validate_guard", { kind: ACCOUNT_KIND.LevGuard });
  const t = b + recLen;
  for (let i = 0; i < g.touchedN; i++) g.touchedTags.push(u128At(v, t + LEV_GUARD_KEY_TAG_LEN_V22 * i));
  return g;
}

/**
 * The tag the program stores for a cut portfolio: the first `LEV_GUARD_KEY_TAG_LEN_V22` bytes of
 * its key as a LE unsigned integer (`key_tag`).
 *
 * The tag is a PREFIX, so it is not a collision-free identity; 16 bytes puts a birthday search at
 * ~2^64 (prog#610). Always derive it with this function so the width stays in one place.
 *
 * @param key  Portfolio account key.
 * @returns The tag as an unsigned integer up to 2^128.
 * @example
 * ```ts
 * const cut = guard.touchedTags.includes(levKeyTagV22(portfolio));
 * ```
 */
export function levKeyTagV22(key: PublicKey): bigint {
  // toBytes() is a fresh copy; never read `.buffer` of a Node pooled Buffer (it ignores byteOffset).
  const b = key.toBytes();
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return u128At(v, 0);
}

// ============================================================================
// Derived reads
// ============================================================================

/** The token's age band (`AgeBand`). */
export type LevAgeBandV22 = "NoOpen" | "Day" | "Week" | "Month" | "Mature";

/**
 * Age band from the guard's T0 and the current slot (`lev_guard_v22::age_band`). A T0 in the future reads age 0 and fails closed to `NoOpen`.
 *
 * @param t0Slot   Guard `t0Slot`.
 * @param nowSlot  Current slot.
 * @returns `NoOpen` under 6 h (54 000 slots), `Day` under 24 h, `Week` under 7 d, `Month` under 30 d, else `Mature`.
 * @example
 * ```ts
 * levAgeBandV22(100n, 100n + 54_000n); // "Day"
 * ```
 */
export function levAgeBandV22(t0Slot: bigint, nowSlot: bigint): LevAgeBandV22 {
  if (nowSlot < t0Slot) return "NoOpen";
  const age = nowSlot - t0Slot;
  if (age < LEV_AGE_NO_OPEN_SLOTS_V22) return "NoOpen";
  if (age < LEV_AGE_DAY_SLOTS_V22) return "Day";
  if (age < LEV_AGE_WEEK_SLOTS_V22) return "Week";
  if (age < LEV_AGE_MONTH_SLOTS_V22) return "Month";
  return "Mature";
}

/** Whether the band is under 7 days old (`AgeBand::young`: NoOpen, Day or Week). */
export function levAgeBandIsYoungV22(band: LevAgeBandV22): boolean {
  return band === "NoOpen" || band === "Day" || band === "Week";
}

/** Freshness of the holder risk report (`ReportAge`). */
export type LevReportAgeV22 = "None" | "Fresh" | "Held" | "Stale";

/**
 * Report freshness (`lev_guard_v22::report_age`): `None` when never reported (slot 0), `Fresh` within 27 000 slots (3 h), `Held`
 * within 216 000 (24 h), else `Stale`; a report stamped in the future is `Stale`.
 *
 * @param repSlot  Guard `repSlot`.
 * @param nowSlot  Current slot.
 * @returns The freshness class.
 * @example
 * ```ts
 * levReportAgeV22(g.repSlot, BigInt(slot));
 * ```
 */
export function levReportAgeV22(repSlot: bigint, nowSlot: bigint): LevReportAgeV22 {
  if (repSlot === 0n) return "None";
  if (nowSlot < repSlot) return "Stale";
  const a = nowSlot - repSlot;
  if (a <= LEV_REPORT_FRESH_SLOTS_V22) return "Fresh";
  if (a <= LEV_REPORT_HELD_SLOTS_V22) return "Held";
  return "Stale";
}

/** The NAV fields {@link levLpStopTriggeredV22} reads. */
export type LevNavFieldsV22 = Pick<LevGuardV22, "navps" | "navPeakCur" | "navPeakPrev" | "navRef">;

/**
 * Whether the LP stop holds (`lp_stop_triggered`): `2 * navps <= max(peak_cur, peak_prev)` or `2 * navps <= nav_ref`. A state that
 * was never initialised (`navps == 0` and `navRef == 0`) never fires.
 *
 * @param g  The guard (or any object with the four NAV fields).
 * @returns True when op 5 (W1) would open a round (the program may still find nothing to cut and answer 135).
 * @example
 * ```ts
 * if (levLpStopTriggeredV22(guard)) { /* keeper: send op 5 *\/ }
 * ```
 */
export function levLpStopTriggeredV22(g: LevNavFieldsV22): boolean {
  if (g.navps === 0n && g.navRef === 0n) return false;
  const twice = g.navps * 2n;
  const peak = g.navPeakCur > g.navPeakPrev ? g.navPeakCur : g.navPeakPrev;
  return twice <= peak || twice <= g.navRef;
}

/**
 * Whether a W1 round is live (`w1_round_live`): `round_active == 1` and `now - round_open_slot <= 9 000`. While live, a fill that
 * grows the LP's net is refused with error 133 (log `lev_guard_refused lp_stop_round`).
 *
 * @param g        The guard (or its `roundActive` / `roundOpenSlot`).
 * @param nowSlot  Current slot.
 * @returns True while the round blocks LP-growing fills.
 * @example
 * ```ts
 * levW1RoundLiveV22(guard, BigInt(slot));
 * ```
 */
export function levW1RoundLiveV22(g: Pick<LevGuardV22, "roundActive" | "roundOpenSlot">, nowSlot: bigint): boolean {
  if (!g.roundActive) return false;
  const d = nowSlot > g.roundOpenSlot ? nowSlot - g.roundOpenSlot : 0n;
  return d <= LEV_W1_ROUND_SLOTS_V22;
}
