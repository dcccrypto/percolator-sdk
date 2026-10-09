/**
 * v2.2 wrapper events: FILL, REDUCE, MOVE (incl. MOVE sub 4 `G9_RESTORE_PNL`) and the strict log attribution rule.
 *
 * Source of truth: percolator-prog `release/v22-wrapper-rem` `docs/v22-fill-events.md` and `src/fill_events_v22.rs`
 * (reference decoder `tests/support/fill_events.rs`). Nothing here is read from an account: events live only in a
 * transaction's `logMessages`.
 *
 * TRUST MODEL (read before indexing; the first published attribution rule was forgeable):
 *  1. Only successful transactions (`meta.err == null`): {@link decodeTxEventsV22} takes `succeeded` and returns
 *     `status: "failed"` otherwise.
 *  2. Each `logMessages` element is ONE atomic line. A `Program data: ` token is attributed to the wrapper only when the
 *     program on TOP of the runtime's frame stack at that line is the wrapper id you pin (not one read from the
 *     transaction). The stack is pushed ONLY by a full-line `Program <32-byte base58 key> invoke [n]` with `n` ==
 *     stack depth + 1, and popped ONLY by exactly `Program <key on top> success` or a line starting
 *     `Program <key on top> failed: `. ANY inconsistency makes the whole transaction's events UNKNOWN (never "no events").
 *  3. `requested_q` and `quoted_price_e6` are NOT the wrapper's statement (instruction data / the matcher's reply): display
 *     only, never volume, PnL or charts. Volume is `executed_q` at `price_e6`.
 *  4. Unknown kinds, versions, MOVE subs and REDUCE reasons, and known kinds whose length does not match, are SKIPPED
 *     (reported in `skipped`), never thrown and never guessed at.
 *  5. `Log truncated` anywhere, or null/empty logs: the events are UNKNOWN. Reconcile from account state.
 *  6. Check `market` against your registry and `assetGen` against the asset's current generation before accepting an event.
 *
 * @module v22-fill-events
 */
import { PublicKey } from "@solana/web3.js";
export declare const EVENT_KIND_FILL_V22 = 1;
export declare const EVENT_KIND_REDUCE_V22 = 2;
export declare const EVENT_KIND_MOVE_V22 = 3;
export declare const EVENT_VERSION_V22 = 1;
/** Header of every event: kind, version, ix_tag (u8 each) + market (32). */
export declare const EVENT_HEADER_LEN_V22 = 35;
export declare const FILL_FIXED_LEN_V22 = 100;
export declare const FILL_REC_LEN_V22 = 75;
export declare const REDUCE_LEN_V22 = 134;
export declare const MOVE_LEN_V22 = 62;
/** `MAX_FILL_RECS_PER_LINE`. The wrapper accepts at most 4 legs per batch since #546, so a line has at most 4 records today. */
export declare const FILL_MAX_RECS_PER_LINE_V22 = 11;
/** `asset_index` of a MOVE that names no asset. */
export declare const MOVE_NO_ASSET_V22 = 65535;
/** The exact element the runtime's log collector inserts once when its 10,000-byte budget is hit. */
export declare const LOG_TRUNCATED_V22 = "Log truncated";
/** FILL record `flags` bits. A decoder must not reject an unknown bit or combination. */
export declare const FILL_FLAG_V22: Readonly<{
    CLIPPED: 1;
    PARTIAL: 2;
    ZERO: 4;
    MATCHER: 8;
}>;
/** REDUCE `reason`. Units differ: 1 = basis units; 2 and 3 = ADL-effective units; 4 and 5 = size traded against the vault LP. */
export declare const REDUCE_REASON_V22: Readonly<{
    readonly REBALANCE_REDUCE: 1;
    readonly ADL_WIND_DOWN: 2;
    readonly LIQUIDATION: 3;
    readonly DUST_SWEEP: 4;
    readonly EVICTION: 5;
}>;
export type ReduceReasonV22 = (typeof REDUCE_REASON_V22)[keyof typeof REDUCE_REASON_V22];
/** MOVE `sub`. */
export declare const MOVE_SUB_V22: Readonly<{
    readonly EARN_EXIT: 1;
    readonly G9: 2;
    readonly RENT_ROUTED: 3;
    readonly G9_RESTORE_PNL: 4;
}>;
export type MoveSubV22 = (typeof MOVE_SUB_V22)[keyof typeof MOVE_SUB_V22];
/** One record of a FILL line (75 bytes). */
export interface FillRecordV22 {
    assetIndex: number;
    /** The asset's `market_id` (generation): a reused asset index is unambiguous. */
    assetGen: bigint;
    flags: number;
    /** UNTRUSTED (copied from the instruction data). Display only. */
    requestedQ: bigint;
    /** The size that executed (0 on a zero fill). Positive = `taker` long. Engine position units (POS_SCALE 1e6). */
    executedQ: bigint;
    /** The price the position was BOOKED at (e6). On a zero fill: the reference price only. */
    priceE6: bigint;
    /** UNTRUSTED (the matcher's quote, or the wire price on NoCpi). 0 when no matcher answered. Never a price for volume, PnL or charts. */
    quotedPriceE6: bigint;
    /** TOTAL engine trade fee across BOTH portfolios (not the taker's alone, not protocol revenue); saturates at u64::MAX. */
    feeAtoms: bigint;
    /** Backing-domain fee charged on top (single trades only; 0 in batches). */
    backingFeeAtoms: bigint;
}
interface EventBaseV22 {
    /** The wrapper tag of the HANDLER that emitted it (10 inside 119, 5 for the pre-crank inside 77): match to instructions by log position. */
    ixTag: number;
    market: PublicKey;
}
export interface FillEventV22 extends EventBaseV22 {
    kind: "fill";
    /** `account_a`: the fee payer and, on a matcher route, the signing taker. */
    taker: PublicKey;
    /** `account_b`: the counterparty (the LP on a matcher route). */
    lp: PublicKey;
    records: FillRecordV22[];
}
export interface ReduceEventV22 extends EventBaseV22 {
    kind: "reduce";
    portfolio: PublicKey;
    /** The bound vault LP for forced closes; the all-zero key for a unilateral reduction. */
    counterparty: PublicKey;
    assetIndex: number;
    assetGen: bigint;
    reason: ReduceReasonV22;
    /** Signed change of the portfolio's position (a long being reduced is negative). Unit depends on `reason`. */
    signedReducedQ: bigint;
    priceE6: bigint;
}
/** MOVE with its `a`/`b`/`c` words named per `sub`. Raw words are always kept. */
interface MoveBaseV22 extends EventBaseV22 {
    kind: "move";
    /** 0xFFFF = none. */
    assetIndex: number;
    a: bigint;
    b: bigint;
    c: bigint;
}
export interface MoveEarnExitV22 extends MoveBaseV22 {
    sub: 1;
    principalAtoms: bigint;
    earningsAtoms: bigint;
    sharesBurned: bigint;
}
/** Mode 0 draw (insurance -> vault LP capital) or mode 1 capital-only restore (vault LP capital -> insurance). Mode 3 is never here. */
export interface MoveG9V22 extends MoveBaseV22 {
    sub: 2;
    amountAtoms: bigint;
    receivableAfterAtoms: bigint;
    mode: 0 | 1;
}
export interface MoveRentRoutedV22 extends MoveBaseV22 {
    sub: 3;
    routedAtoms: bigint;
}
/**
 * G9 restore, mode 3: repaid from the vault LP's released profit first, capital for the remainder. ALWAYS this sub for mode 3,
 * also when the profit part is 0. Amount repaid into insurance = `fromProfitAtoms + fromCapitalAtoms`; the vault LP's PnL fell by
 * the first, its capital by the second.
 */
export interface MoveG9RestorePnlV22 extends MoveBaseV22 {
    sub: 4;
    fromProfitAtoms: bigint;
    fromCapitalAtoms: bigint;
    receivableAfterAtoms: bigint;
}
export type MoveEventV22 = MoveEarnExitV22 | MoveG9V22 | MoveRentRoutedV22 | MoveG9RestorePnlV22;
export type WrapperEventV22 = FillEventV22 | ReduceEventV22 | MoveEventV22;
/** Why one token was skipped (it never throws). */
export type SkipReasonV22 = "malformed" | "unknown-kind" | "unknown-version" | "bad-length" | "unknown-reduce-reason" | "unknown-move-sub" | "bad-g9-mode";
/** Why a transaction's events are UNKNOWN (never "no events"). */
export type UnknownReasonV22 = "no-logs" | "truncated" | "bad-invoke-depth" | "bad-return" | "data-outside-frame" | "unclosed-frame";
/**
 * Decode ONE event payload (the raw bytes behind one base64 token). `kind` and `version` are bytes 0 and 1 in every version and are
 * checked before any length. Returns `{ skip }` (never throws) for an unknown kind, version, MOVE sub, REDUCE reason, or a known kind
 * with the wrong length. Do not guess at the fields of a skipped event.
 */
export declare function decodeWrapperEventV22(b: Uint8Array): {
    event: WrapperEventV22;
} | {
    skip: SkipReasonV22;
};
/** Decode one base64 token (the text after `Program data: `). A token that is not base64 is `malformed`. */
export declare function decodeWrapperEventTokenV22(token: string): {
    event: WrapperEventV22;
} | {
    skip: SkipReasonV22;
};
export type WrapperTokensV22 = {
    ok: true;
    tokens: string[];
} | {
    ok: false;
    unknown: UnknownReasonV22;
};
/**
 * The strict frame walk. Returns the base64 tokens whose frame is `wrapper` (pinned by YOU, never read from the transaction), or
 * `{ ok: false, unknown }` on ANY inconsistency. Each element of `logs` is atomic: it is never joined with its neighbours and never
 * split on a newline.
 */
export declare function wrapperEventTokensV22(logs: readonly string[] | null | undefined, wrapper: PublicKey): WrapperTokensV22;
/** What a transaction's logs say about wrapper events. */
export type TxEventsV22 = {
    status: "failed";
} | {
    status: "unknown";
    reason: UnknownReasonV22;
} | {
    status: "known";
    events: WrapperEventV22[];
    skipped: SkipReasonV22[];
};
/**
 * The indexer entry point.
 * @param succeeded  `meta.err == null`. A failed transaction's events describe nothing that happened: `{ status: "failed" }`.
 * @param logs       `meta.logMessages` (null when the RPC kept none: UNKNOWN, not "no fill").
 * @param wrapper    The wrapper program id, pinned in your configuration.
 * @returns `known` with the events in log order (plus the reasons any wrapper token was skipped), or `unknown`. On `unknown`
 *   re-read the affected portfolios from account state and record DERIVED fills (price and fee unknown); never record "no fill".
 */
export declare function decodeTxEventsV22(succeeded: boolean, logs: readonly string[] | null | undefined, wrapper: PublicKey): TxEventsV22;
export {};
