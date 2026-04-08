/**
 * @module adl
 * Percolator ADL (Auto-Deleveraging) client utilities.
 *
 * PERC-8278 / PERC-8312 / PERC-305: ADL is triggered when `pnl_pos_tot > max_pnl_cap`
 * on a market (PnL cap exceeded) AND the insurance fund is fully depleted (balance == 0).
 * The most profitable positions on the dominant side are deleveraged first.
 *
 * **Note on caller permissions:** `ExecuteAdl` (tag 50) requires the caller to be the
 * market admin/keeper key (`header.admin`). It is NOT permissionless despite the
 * instruction being structurally available to any signer.
 *
 * API surface:
 *  - fetchAdlRankedPositions() — fetch slab + rank all open positions by PnL%
 *  - rankAdlPositions()        — pure (no-RPC) variant for already-fetched slab bytes
 *  - isAdlTriggered()          — check if slab's pnl_pos_tot exceeds max_pnl_cap
 *  - buildAdlInstruction()     — build a single ExecuteAdl TransactionInstruction
 *  - buildAdlTransaction()     — fetch + rank + pick top target + return instruction
 *  - parseAdlEvent()           — decode AdlEvent from transaction log lines
 *  - fetchAdlRankings()        — call /api/adl/rankings HTTP endpoint
 *  - AdlRankedPosition         — position record with adl_rank and computed pnlPct
 *  - AdlRankingResult          — full ranking with trigger status
 *  - AdlEvent                  — decoded on-chain AdlEvent log entry (tag 0xAD1E_0001)
 *  - AdlApiRanking             — single ranked position from /api/adl/rankings
 *  - AdlApiResult              — full result from /api/adl/rankings
 *  - AdlSide                   — "long" | "short"
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  AccountMeta,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import {
  fetchSlab,
  parseAllAccounts,
  parseEngine,
  parseConfig,
  detectSlabLayout,
  AccountKind,
  Account,
  SlabLayout,
} from "./slab.js";
import { encodeExecuteAdl } from "../abi/instructions.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Position side derived from positionSize sign. */
export type AdlSide = "long" | "short";

/**
 * A ranked open position for ADL purposes.
 * Positions are ranked descending by `pnlPct` — rank 0 is the most profitable
 * and will be deleveraged first.
 */
export interface AdlRankedPosition {
  /** Account index in the slab (used as `targetIdx` in ExecuteAdl). */
  idx: number;
  /** Owner public key. */
  owner: PublicKey;
  /** Raw position size (i128 — negative = short, positive = long). */
  positionSize: bigint;
  /** Realised + mark-to-market PnL in lamports (i128 from slab). */
  pnl: bigint;
  /** Capital at entry in lamports (u128). */
  capital: bigint;
  /**
   * PnL as a fraction of capital, expressed as basis points (scaled × 10_000).
   * pnlPct = pnl * 10_000 / capital.
   * Higher = more profitable = deleveraged first.
   */
  pnlPct: bigint;
  /** Long or short. */
  side: AdlSide;
  /**
   * ADL rank among positions on the same side (0 = highest PnL%, deleveraged first).
   * `-1` if position size is zero (inactive).
   */
  adlRank: number;
}

/**
 * Result of `fetchAdlRankedPositions`.
 */
export interface AdlRankingResult {
  /** All open (non-zero) user positions, sorted descending by PnLPct, ranked. */
  ranked: AdlRankedPosition[];
  /**
   * Longs ranked separately (adlRank within this subset).
   * Rank 0 = most profitable long = first to be deleveraged on a net-long market.
   */
  longs: AdlRankedPosition[];
  /**
   * Shorts ranked separately (adlRank within this subset).
   * Rank 0 = most profitable short (most negative pnlPct magnitude — i.e., highest
   * unrealised gain for the short-side holder).
   */
  shorts: AdlRankedPosition[];
  /** Whether ADL is currently triggered (pnlPosTot > maxPnlCap). */
  isTriggered: boolean;
  /** pnl_pos_tot from engine state. */
  pnlPosTot: bigint;
  /** max_pnl_cap from market config. */
  maxPnlCap: bigint;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute PnL% in basis points for a position.
 * Returns 0n when capital is 0 to avoid division by zero.
 */
function computePnlPct(pnl: bigint, capital: bigint): bigint {
  if (capital === 0n) return 0n;
  return (pnl * 10_000n) / capital;
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Check whether ADL is currently triggered on a slab.
 *
 * ADL triggers when pnl_pos_tot > max_pnl_cap (max_pnl_cap must be > 0).
 *
 * @param slabData - Raw slab account bytes.
 * @returns true if ADL is triggered.
 *
 * @example
 * ```ts
 * const data = await fetchSlab(connection, slabKey);
 * if (isAdlTriggered(data)) {
 *   const ranking = await fetchAdlRankedPositions(connection, slabKey);
 * }
 * ```
 */
export function isAdlTriggered(slabData: Uint8Array): boolean {
  const layout = detectSlabLayout(slabData.length);
  if (!layout) {
    throw new Error(
      `isAdlTriggered: unrecognized slab layout (${slabData.length} bytes). ` +
      `Cannot determine ADL status — update the SDK or check the data source.`,
    );
  }
  const engine = parseEngine(slabData);
  if (engine.pnlPosTot === 0n) return false;
  const config = parseConfig(slabData, layout);
  if (config.maxPnlCap === 0n) return false;
  return engine.pnlPosTot > config.maxPnlCap;
}

/**
 * Fetch a slab and rank all open user positions by PnL% for ADL targeting.
 *
 * Positions are ranked separately per side:
 * - Longs: rank 0 = highest positive PnL% (most profitable long)
 * - Shorts: rank 0 = highest negative PnL% by abs value (most profitable short)
 *
 * Rank ordering matches the on-chain ADL engine in percolator-prog (PERC-8273):
 * the position at rank 0 of the dominant side is deleveraged first.
 *
 * @param connection - Solana connection.
 * @param slab       - Slab (market) public key.
 * @returns AdlRankingResult with ranked longs, ranked shorts, and trigger status.
 *
 * @example
 * ```ts
 * const { ranked, longs, isTriggered } = await fetchAdlRankedPositions(connection, slabKey);
 * if (isTriggered && longs.length > 0) {
 *   const target = longs[0]; // highest PnL long
 *   const ix = buildAdlInstruction(caller, slabKey, oracleKey, programId, target.idx);
 * }
 * ```
 */
export async function fetchAdlRankedPositions(
  connection: Connection,
  slab: PublicKey
): Promise<AdlRankingResult> {
  const data = await fetchSlab(connection, slab);
  return rankAdlPositions(data);
}

/**
 * Pure (no-RPC) variant — rank positions from already-fetched slab bytes.
 * Useful when you already have the slab data (e.g., from a subscription).
 */
export function rankAdlPositions(slabData: Uint8Array): AdlRankingResult {
  const layout = detectSlabLayout(slabData.length);

  let pnlPosTot = 0n;
  try {
    const engine = parseEngine(slabData);
    pnlPosTot = engine.pnlPosTot;
  } catch (err) {
    console.warn(
      `[rankAdlPositions] parseEngine failed:`,
      err instanceof Error ? err.message : err,
    );
  }

  let maxPnlCap = 0n;
  let isTriggered = false;
  if (layout) {
    try {
      const config = parseConfig(slabData, layout);
      maxPnlCap = config.maxPnlCap;
      isTriggered = maxPnlCap > 0n && pnlPosTot > maxPnlCap;
    } catch {
      // If config parse fails, leave isTriggered=false; ranking still useful.
    }
  }

  // Parse all used accounts.
  const accounts = parseAllAccounts(slabData);

  // Build ranked position list (user accounts with non-zero position only).
  const positions: AdlRankedPosition[] = [];
  for (const { idx, account } of accounts) {
    if (account.kind !== AccountKind.User) continue;
    if (account.positionSize === 0n) continue;

    // Determine side from sign convention: long (> 0), short (< 0).
    // If positionSize is 0, it was already skipped above.
    const side: AdlSide = account.positionSize > 0n ? "long" : "short";

    // Validate sign convention: longs must be positive, shorts must be negative.
    if (side === "long" && account.positionSize <= 0n) {
      console.warn(`[fetchAdlRankedPositions] account idx=${idx}: side=long but positionSize=${account.positionSize}`);
      continue;
    }
    if (side === "short" && account.positionSize >= 0n) {
      console.warn(`[fetchAdlRankedPositions] account idx=${idx}: side=short but positionSize=${account.positionSize}`);
      continue;
    }

    // For shorts, positionSize is negative — PnL computation is symmetric:
    // a short profits when price falls, so pnl stored in the slab already
    // reflects mark-to-market gain/loss for both sides.
    const pnlPct = computePnlPct(account.pnl, account.capital);

    positions.push({
      idx,
      owner: account.owner,
      positionSize: account.positionSize,
      pnl: account.pnl,
      capital: account.capital,
      pnlPct,
      side,
      adlRank: -1, // assigned below
    });
  }

  // Rank longs: descending pnlPct (most profitable first).
  const longs = positions
    .filter(p => p.side === "long")
    .sort((a, b) => (b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0));
  longs.forEach((p, i) => { p.adlRank = i; });

  // Rank shorts: descending pnlPct (most profitable short = highest pnlPct
  // magnitude, but pnlPct can be negative; sort descending still puts
  // the "least negative" aka "most profitable" short first).
  const shorts = positions
    .filter(p => p.side === "short")
    .sort((a, b) => (b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0));
  shorts.forEach((p, i) => { p.adlRank = i; });

  // Overall ranked list = longs + shorts merged, still sorted by pnlPct desc.
  const ranked = [...longs, ...shorts].sort(
    (a, b) => (b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0)
  );

  return { ranked, longs, shorts, isTriggered, pnlPosTot, maxPnlCap };
}

/**
 * Build a single `ExecuteAdl` TransactionInstruction (tag 50, PERC-305).
 *
 * Does NOT fetch the slab or check trigger status — use `fetchAdlRankedPositions`
 * first to determine the correct `targetIdx`.
 *
 * **Caller requirement:** The on-chain handler requires the caller to be the market
 * admin/keeper authority (`header.admin`). Passing any other signer will result in
 * `EngineUnauthorized`.
 *
 * @param caller     - Signer — must be the market keeper/admin authority.
 * @param slab       - Slab (market) public key.
 * @param oracle     - Primary oracle public key for this market.
 * @param programId  - Percolator program ID.
 * @param targetIdx  - Account index to deleverage (from `AdlRankedPosition.idx`).
 * @param backupOracles - Optional additional oracle accounts (non-Hyperp markets).
 *
 * @example
 * ```ts
 * import { fetchAdlRankedPositions, buildAdlInstruction } from "@percolator/sdk";
 *
 * const { longs, isTriggered } = await fetchAdlRankedPositions(connection, slabKey);
 * if (isTriggered && longs.length > 0) {
 *   const ix = buildAdlInstruction(
 *     caller.publicKey, slabKey, oracleKey, PROGRAM_ID, longs[0].idx
 *   );
 *   await sendAndConfirmTransaction(connection, new Transaction().add(ix), [caller]);
 * }
 * ```
 */
export function buildAdlInstruction(
  caller: PublicKey,
  slab: PublicKey,
  oracle: PublicKey,
  programId: PublicKey,
  targetIdx: number,
  backupOracles: PublicKey[] = []
): TransactionInstruction {
  if (!Number.isInteger(targetIdx) || targetIdx < 0) {
    throw new Error(
      `buildAdlInstruction: targetIdx must be a non-negative integer, got ${targetIdx}`,
    );
  }
  const dataBytes = encodeExecuteAdl({ targetIdx });
  const data = Buffer.from(dataBytes);

  const keys: AccountMeta[] = [
    { pubkey: caller, isSigner: true, isWritable: false },
    { pubkey: slab, isSigner: false, isWritable: true },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: oracle, isSigner: false, isWritable: false },
    ...backupOracles.map(k => ({ pubkey: k, isSigner: false, isWritable: false })),
  ];

  return new TransactionInstruction({ keys, programId, data });
}

/**
 * Convenience builder: fetch slab, rank positions, pick the highest-ranked
 * target on the given side, and return a ready-to-send `TransactionInstruction`.
 *
 * Returns `null` when ADL is not triggered or no eligible positions exist.
 *
 * @param connection    - Solana connection.
 * @param caller        - Signer — must be the market keeper/admin authority.
 * @param slab          - Slab (market) public key.
 * @param oracle        - Primary oracle public key.
 * @param programId     - Percolator program ID.
 * @param preferSide    - Optional: target "long" or "short" side only.
 *                        If omitted, picks the overall top-ranked position.
 * @param backupOracles - Optional extra oracle accounts.
 *
 * @example
 * ```ts
 * const ix = await buildAdlTransaction(
 *   connection, caller.publicKey, slabKey, oracleKey, PROGRAM_ID
 * );
 * if (ix) {
 *   await sendAndConfirmTransaction(connection, new Transaction().add(ix), [caller]);
 * }
 * ```
 */
export async function buildAdlTransaction(
  connection: Connection,
  caller: PublicKey,
  slab: PublicKey,
  oracle: PublicKey,
  programId: PublicKey,
  preferSide?: AdlSide,
  backupOracles: PublicKey[] = []
): Promise<TransactionInstruction | null> {
  const ranking = await fetchAdlRankedPositions(connection, slab);

  if (!ranking.isTriggered) return null;

  let target: AdlRankedPosition | undefined;
  if (preferSide === "long") {
    target = ranking.longs[0];
  } else if (preferSide === "short") {
    target = ranking.shorts[0];
  } else {
    target = ranking.ranked[0];
  }

  if (!target) return null;

  return buildAdlInstruction(caller, slab, oracle, programId, target.idx, backupOracles);
}

// ---------------------------------------------------------------------------
// AdlEvent — on-chain log decoder (PERC-8312)
// ---------------------------------------------------------------------------

/**
 * Decoded on-chain AdlEvent emitted by the `ExecuteAdl` instruction handler.
 *
 * The on-chain handler emits via `sol_log_64(0xAD1E_0001, target_idx, price, closed_lo, closed_hi)`.
 * `sol_log_64` prints 5 decimal u64 values separated by spaces on a single "Program log:" line.
 *
 * Fields:
 * - `tag`       — always `0xAD1E_0001` (2970353665n)
 * - `targetIdx` — slab account index that was deleveraged
 * - `price`     — oracle price used (in market price units, e.g. e6)
 * - `closedAbs` — absolute size of the position closed (i128, reassembled from lo+hi u64 parts)
 *
 * @example
 * ```ts
 * const logs = tx.meta?.logMessages ?? [];
 * const event = parseAdlEvent(logs);
 * if (event) {
 *   console.log("ADL closed position", event.targetIdx, "size", event.closedAbs);
 * }
 * ```
 */
export interface AdlEvent {
  /** Tag discriminator — always 0xAD1E_0001n (2970353665). */
  tag: bigint;
  /** Slab account index that was deleveraged. */
  targetIdx: number;
  /** Oracle price used for the deleverage (market-native units, e.g. lamports/e6). */
  price: bigint;
  /**
   * Absolute position size closed (reassembled from lo+hi u64).
   * This is the i128 absolute value — always non-negative.
   */
  closedAbs: bigint;
}

/** Magic discriminator for the ADL event log line. */
const ADL_EVENT_TAG = 0xAD1E_0001n;

/**
 * Parse the AdlEvent from a transaction's log messages.
 *
 * Searches for a "Program log: <a> <b> <c> <d> <e>" line where the first
 * decimal value equals `0xAD1E_0001` (2970353665). Returns `null` if not found.
 *
 * @param logs - Array of log message strings (from `tx.meta.logMessages`).
 * @returns Decoded `AdlEvent` or `null` if the log is not present.
 *
 * @example
 * ```ts
 * const event = parseAdlEvent(tx.meta?.logMessages ?? []);
 * if (event) {
 *   console.log(`ADL: idx=${event.targetIdx} price=${event.price} closed=${event.closedAbs}`);
 * }
 * ```
 */
export function parseAdlEvent(logs: string[]): AdlEvent | null {
  for (const line of logs) {
    if (typeof line !== "string") continue;
    // sol_log_64 emits: "Program log: a b c d e" (5 space-separated decimals)
    const match = line.match(
      /^Program log: (\d+) (\d+) (\d+) (\d+) (\d+)$/,
    );
    if (!match) continue;

    let tag: bigint;
    try {
      tag = BigInt(match[1]);
    } catch {
      continue;
    }

    if (tag !== ADL_EVENT_TAG) continue;

    try {
      const targetIdxBig = BigInt(match[2]);
      // Validate that targetIdx fits in u16 range before converting to Number
      if (targetIdxBig < 0n || targetIdxBig > 65535n) {
        continue;
      }
      const targetIdx = Number(targetIdxBig);
      const price = BigInt(match[3]);
      const closedLo = BigInt(match[4]);
      const closedHi = BigInt(match[5]);
      // Reassemble i128 from lo/hi u64 parts (little-endian split).
      const closedAbs = (closedHi << 64n) | closedLo;
      return { tag, targetIdx, price, closedAbs };
    } catch {
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// fetchAdlRankings — HTTP client for /api/adl/rankings (PERC-8312)
// ---------------------------------------------------------------------------

/**
 * A single ranked position as returned by the /api/adl/rankings endpoint.
 */
export interface AdlApiRanking {
  /** 1-based rank (1 = highest PnL%, first to be deleveraged). */
  rank: number;
  /** Slab account index. Pass as `targetIdx` to `buildAdlInstruction`. */
  idx: number;
  /** Absolute PnL (lamports) as a decimal string. */
  pnlAbs: string;
  /** Capital at entry (lamports) as a decimal string. */
  capital: string;
  /** PnL as millionths of capital (pnl * 1_000_000 / capital). */
  pnlPctMillionths: string;
}

/**
 * Full result from the /api/adl/rankings endpoint.
 */
export interface AdlApiResult {
  slabAddress: string;
  /** pnl_pos_tot from slab engine state (decimal string). */
  pnlPosTot: string;
  /** max_pnl_cap from market config (decimal string, "0" if unconfigured). */
  maxPnlCap: string;
  /** Insurance fund balance (decimal string). */
  insuranceFundBalance: string;
  /** Insurance fund lifetime fee revenue (decimal string). */
  insuranceFundFeeRevenue: string;
  /** Insurance utilization in basis points (0–10000). */
  insuranceUtilizationBps: number;
  /** true if pnlPosTot > maxPnlCap. */
  capExceeded: boolean;
  /** true if insurance fund is fully depleted (balance == 0). */
  insuranceDepleted: boolean;
  /** true if utilization BPS exceeds the configured ADL threshold. */
  utilizationTriggered: boolean;
  /** true if ADL is needed (capExceeded or utilizationTriggered). */
  adlNeeded: boolean;
  /** Excess PnL above cap (decimal string). */
  excess: string;
  /** Ranked positions (empty if adlNeeded=false). */
  rankings: AdlApiRanking[];
}

/**
 * Fetch ADL rankings from the Percolator API.
 *
 * Calls `GET <apiBase>/api/adl/rankings?slab=<address>` and returns the
 * parsed result. Use this from the frontend or keeper to determine ADL
 * trigger status and pick the target index.
 *
 * @param apiBase  - Base URL of the Percolator API (e.g. `https://api.percolator.io`).
 * @param slab     - Slab (market) public key or base58 address string.
 * @param fetchFn  - Optional custom fetch implementation (defaults to global `fetch`).
 * @returns Parsed `AdlApiResult`.
 * @throws On HTTP error or JSON parse failure.
 *
 * @example
 * ```ts
 * const result = await fetchAdlRankings("https://api.percolator.io", slabKey);
 * if (result.adlNeeded && result.rankings.length > 0) {
 *   const target = result.rankings[0]; // rank 1 = highest PnL%
 *   const ix = buildAdlInstruction(caller, slabKey, oracleKey, PROGRAM_ID, target.idx);
 * }
 * ```
 */
export async function fetchAdlRankings(
  apiBase: string,
  slab: PublicKey | string,
  fetchFn: typeof fetch = fetch,
): Promise<AdlApiResult> {
  const slabStr = typeof slab === "string" ? slab : slab.toBase58();
  const base = apiBase.replace(/\/$/, "");
  const url = `${base}/api/adl/rankings?slab=${encodeURIComponent(slabStr)}`;

  const res = await fetchFn(url);
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(
      `fetchAdlRankings: HTTP ${res.status} from ${url}${body ? ` — ${body}` : ""}`,
    );
  }

  const json: unknown = await res.json();

  // Runtime validation — the API response shape is not guaranteed
  if (typeof json !== "object" || json === null) {
    throw new Error("fetchAdlRankings: API returned non-object response");
  }
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj.rankings)) {
    throw new Error("fetchAdlRankings: API response missing rankings array");
  }
  for (const entry of obj.rankings) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("fetchAdlRankings: invalid ranking entry (not an object)");
    }
    const r = entry as Record<string, unknown>;
    if (typeof r.idx !== "number" || !Number.isInteger(r.idx) || r.idx < 0) {
      throw new Error(`fetchAdlRankings: invalid ranking idx: ${r.idx}`);
    }
  }

  return json as AdlApiResult;
}
