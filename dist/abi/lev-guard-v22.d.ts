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
import type { AccountSpec } from "./accounts.js";
import type { LayoutTable } from "./layout.js";
/** Wrapper instruction tag (`constants::TAG_LEV_GUARD`). */
export declare const TAG_LEV_GUARD_V22 = 124;
/** Tag 124 ops (`lev_guard_v22::OP_*`). */
export declare const LEV_GUARD_OP_V22: Readonly<{
    readonly Init: 0;
    readonly SetRiskKey: 1;
    readonly Report: 2;
    readonly Tighten: 3;
    readonly Poke: 4;
    readonly LpStop: 5;
    readonly SetT0: 6;
}>;
export type LevGuardOpV22 = (typeof LEV_GUARD_OP_V22)[keyof typeof LEV_GUARD_OP_V22];
/** PDA seeds (`LEV_GUARD_SEED`, `VAULT_LP_STATE_SEED`, `VAULT_LP_EXT_SEED`, `DEPTH_SOURCE_SEED`). */
export declare const LEV_GUARD_SEEDS_V22: Readonly<{
    readonly guard: "lev_guard";
    readonly vaultLpState: "vault_lp";
    readonly vaultLpExt: "vault_lp_ext";
    readonly depthSource: "depth_src";
}>;
/** Record length (`LEV_GUARD_REC_LEN`). */
export declare const LEV_GUARD_REC_LEN_V22 = 360;
/** The record before prog#605 (burst memory): 344 B, account 4456. The decoder accepts both. */
export declare const LEV_GUARD_REC_LEN_PRE_BURST_V22 = 344;
/** Touched-set capacity (`W1_TOUCHED_CAP`). */
export declare const LEV_GUARD_TOUCHED_CAP_V22 = 512;
/** Touched-set byte length (`8 * W1_TOUCHED_CAP`). */
export declare const LEV_GUARD_TOUCHED_LEN_V22: number;
/** Body length (record + touched set). */
export declare const LEV_GUARD_BODY_LEN_V22: number;
/** Account length: 16-byte header + body = 4472 (prog#605 burst memory; 4456 before it). */
export declare const LEV_GUARD_ACCOUNT_LEN_V22: number;
/** The only record version (`LEV_GUARD_VERSION`). */
export declare const LEV_GUARD_VERSION_V22 = 1;
/** `flags` bits. */
export declare const LEV_GUARD_FLAG_V22: Readonly<{
    readonly MINT_AUTH_LIVE: 1;
    readonly FREEZE_AUTH_LIVE: 2;
}>;
/** Slots per hour / day (`SLOTS_PER_HOUR`, `SLOTS_PER_DAY`). */
export declare const LEV_SLOTS_PER_HOUR_V22 = 9000n;
export declare const LEV_SLOTS_PER_DAY_V22 = 216000n;
/** Age thresholds: no opens below 6 h; day below 24 h; week below 7 d; month below 30 d; mature after. */
export declare const LEV_AGE_NO_OPEN_SLOTS_V22: bigint;
export declare const LEV_AGE_DAY_SLOTS_V22 = 216000n;
export declare const LEV_AGE_WEEK_SLOTS_V22: bigint;
export declare const LEV_AGE_MONTH_SLOTS_V22: bigint;
/** A risk report is fresh for 3 h and held (last value used) to 24 h. */
export declare const LEV_REPORT_FRESH_SLOTS_V22: bigint;
export declare const LEV_REPORT_HELD_SLOTS_V22 = 216000n;
/** NAV per share fixed point (`NAV_ONE`). */
export declare const LEV_NAV_ONE_V22 = 1000000000000n;
/** A W1 round blocks LP-growing fills for this many slots after it opens (`W1_ROUND_SLOTS`, 9 000). */
export declare const LEV_W1_ROUND_SLOTS_V22 = 9000n;
/** Max value of every bps field in a report (`report_ok`). */
export declare const LEV_REPORT_BPS_MAX_V22 = 10000;
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
export declare function encodeLevGuardInitV22(t0?: bigint): Uint8Array;
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
export declare function encodeLevGuardSetRiskKeyV22(key: PublicKey | Uint8Array | null): Uint8Array;
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
export declare function encodeLevGuardReportV22(r: LevGuardReportV22): Uint8Array;
/**
 * Op 3 TIGHTEN data: `[124, 3]`.
 * @returns Instruction data.
 * @example
 * ```ts
 * const data = encodeLevGuardTightenV22();
 * ```
 */
export declare function encodeLevGuardTightenV22(): Uint8Array;
/**
 * Op 4 POKE data: `[124, 4]`.
 * @returns Instruction data.
 * @example
 * ```ts
 * const data = encodeLevGuardPokeV22();
 * ```
 */
export declare function encodeLevGuardPokeV22(): Uint8Array;
/**
 * Op 5 LP_STOP (W1) data: `[124, 5]`.
 * @returns Instruction data.
 * @example
 * ```ts
 * const data = encodeLevGuardLpStopV22();
 * ```
 */
export declare function encodeLevGuardLpStopV22(): Uint8Array;
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
export declare function encodeLevGuardSetT0V22(t0: bigint): Uint8Array;
/** Op 0 INIT (5): `[0]` market authority (creator) or upgrade authority, signer and writable (payer). */
export declare const ACCOUNTS_LEV_GUARD_INIT_V22: readonly AccountSpec[];
/** Op 1 SET_RISK_KEY / op 6 SET_T0 (4): the upgrade authority signs; the program's `expect_writable` is on the guard only. */
export declare const ACCOUNTS_LEV_GUARD_ADMIN_V22: readonly AccountSpec[];
/** Op 2 REPORT (3): the risk key signs. */
export declare const ACCOUNTS_LEV_GUARD_REPORT_V22: readonly AccountSpec[];
/**
 * Op 3 TIGHTEN (6 + optional holder token account): `[0]` any (listed as the signer so the fee payer is a signer; the handler never reads it),
 * `[3]` depth-source pin PDA, `[4]` the pinned base mint, `[5]` the pinned pool base vault, `[6]` an optional holder token account.
 */
export declare const ACCOUNTS_LEV_GUARD_TIGHTEN_V22: readonly AccountSpec[];
/**
 * Op 4 POKE (4 required): market and the bound vault-LP portfolio are writable (mutable views). With NAV sampling the tail is
 * `[4]` vault_lp_state and `[5]` the vault_lp_ext PDA (REQUIRED whenever `[4]` is passed; an empty account is fine if the ext does not exist yet).
 */
export declare const ACCOUNTS_LEV_GUARD_POKE_V22: readonly AccountSpec[];
/**
 * Op 5 LP_STOP / W1 (6 + opposing user portfolios): market, guard and vault-LP portfolio writable; `[4]` vault_lp_state, `[5]` vault_lp_ext PDA;
 * `[6..]` the opposing user portfolios to cut (all writable), at most as many as fit the transaction.
 */
export declare const ACCOUNTS_LEV_GUARD_LP_STOP_V22: readonly AccountSpec[];
/** Field offsets INSIDE the 360-byte record (rustc `offset_of!`; add 16 for the account). */
export declare const LEV_GUARD_FIELD_OFF_V22: Readonly<{
    readonly market: 0;
    readonly riskKey: 32;
    readonly t0Slot: 64;
    readonly assetIndex: 72;
    readonly version: 74;
    readonly bump: 75;
    readonly flags: 76;
    readonly roundActive: 77;
    readonly roundLpLong: 78;
    readonly pad0: 79;
    readonly repJDumpBps: 80;
    readonly repMIndBps: 82;
    readonly repLCapX100: 84;
    readonly repNMultBps: 86;
    readonly repSlot: 88;
    readonly holderDumpBps: 96;
    readonly roundKeepBps: 98;
    readonly touchedN: 100;
    readonly pad1: 102;
    readonly holderDumpSlot: 104;
    readonly pbLastPx: 112;
    readonly pbLastSlot: 120;
    readonly pbRefPx: 128;
    readonly pbRefSlot: 136;
    readonly pbFreezeUntil: 144;
    readonly pbOracleUntil: 152;
    readonly frozenLX100: 160;
    readonly pad2: 162;
    readonly frozenNQ: 168;
    readonly navps: 184;
    readonly navLastEquity: 200;
    readonly navLastIn: 216;
    readonly navLastOut: 232;
    readonly navPeakCur: 248;
    readonly navPeakPrev: 264;
    readonly navRef: 280;
    readonly navBucketStart: 296;
    readonly navLastSlot: 304;
    readonly roundId: 312;
    readonly roundTargetQ: 320;
    readonly roundOpenSlot: 336;
    readonly burstVarPeakX100: 344;
    readonly pad3: 348;
    readonly burstPeakSlot: 352;
}>;
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
    /** The first `touchedN` tags of the touched set (first 8 bytes of each cut portfolio key, as a LE u64). */
    touchedTags: bigint[];
}
/**
 * Decode a leverage guard account (`16 + 360 + 4096 = 4472` bytes, header kind 17). Mirrors the program's `validate_guard`
 * (version 1, only known flag bits, booleans 0/1, `touched_n <= 512`, `round_keep_bps <= 10 000`, report bps in range, padding zero).
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
export declare function decodeLevGuardV22(data: Uint8Array, table?: LayoutTable): LevGuardV22;
/**
 * The tag the program stores for a cut portfolio: the first 8 bytes of its key as a LE u64 (`key_tag`).
 *
 * @param key  Portfolio account key.
 * @returns The u64 tag.
 * @example
 * ```ts
 * const cut = guard.touchedTags.includes(levKeyTagV22(portfolio));
 * ```
 */
export declare function levKeyTagV22(key: PublicKey): bigint;
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
export declare function levAgeBandV22(t0Slot: bigint, nowSlot: bigint): LevAgeBandV22;
/** Whether the band is under 7 days old (`AgeBand::young`: NoOpen, Day or Week). */
export declare function levAgeBandIsYoungV22(band: LevAgeBandV22): boolean;
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
export declare function levReportAgeV22(repSlot: bigint, nowSlot: bigint): LevReportAgeV22;
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
export declare function levLpStopTriggeredV22(g: LevNavFieldsV22): boolean;
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
export declare function levW1RoundLiveV22(g: Pick<LevGuardV22, "roundActive" | "roundOpenSlot">, nowSlot: bigint): boolean;
