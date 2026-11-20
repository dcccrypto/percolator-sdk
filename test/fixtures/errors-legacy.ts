// FROZEN COPY of ONLY parseErrorFromLogs + knownProgramIds from src/abi/errors.ts at f221726 (pre-perf). Used as the oracle for the differential test and the bench. Do not edit.
// PERCOLATOR_ERRORS and getContextualErrorHint are imported from src (not under test here), so the oracle cannot drift on table edits.
/**
 * Percolator v17 program error definitions.
 *
 * Source: v16_program.rs PercolatorError enum (lines 174-226 in v17 wrapper).
 * Ordinals 0-29 = toly base errors; 30-41 = fork LP-vault; 42-46 = fork NFT/B-3;
 * 47-48 = insurance withdrawal policy (F-1/F-2); 49 = EngineInsufficientInitialMargin;
 * 50 = LpVaultDepositBelowMinimumLiquidity (N7 dead-share floor); 51 =
 * FeeSplitFloorViolation (creator/LP/insurance split floor, meaning narrowed to
 * tag 86 — see its entry); 52-53 = fee-collection split; 54-60 =
 * load_bound_stake_pool diagnostics; 61 = AssetSlotAlreadyConfigured;
 * 62 = CreatorFeeOverClaim (creator fee claim, tag 90 — NOT yet deployed).
 *
 * Ordinals 0-61 read directly off the PercolatorError enum in
 * percolator-prog@10acb5ae, which is the source deployed to devnet wrapper
 * DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj (hash-verified
 * 6b2fda2363352aba0ef88abde0d398f9dd477b1208507e7e8393586ed5458931).
 * Ordinal 49 is CONFIRMED against that enum; an earlier "discriminant
 * tentative" TODO here is resolved.
 *
 * INVARIANT: ordinals must NOT be reordered (Rust enum discriminants are
 * sequential from 0). CI asserts each ordinal in tests/v16_kani.rs.
 *
 * v17 breaking changes vs v12.x:
 *   - Errors 0-29 have completely different names and semantics from v12.
 *   - Errors 30-41 are LP-vault (moved from v12.x range 30-41 to same ordinals).
 *   - Errors 42-46 are NFT/B-3 (new in v17).
 *   - v12.x errors 28-65 are entirely removed.
 */
import type { PublicKey } from "@solana/web3.js";
import { PROGRAM_IDS, PROGRAM_IDS_DEVNET_V1, PROGRAM_IDS_DEVNET_V22, NFT_PROGRAM_IDS } from "../../src/config/program-ids.js";
import { STAKE_ERRORS, STAKE_PROGRAM_IDS } from "../../src/solana/stake.js";
import { STAKE_ERRORS_V5, STAKE_ERROR_NAMES } from "../../src/abi/v22-stake.js";
import { MATCHER_V2_ERRORS } from "../../src/abi/matcher-v2.js";
import { NFT_ERRORS, SPL_TOKEN_ERRORS } from "../../src/abi/nft-errors.js";
import { PERCOLATOR_ERRORS, getContextualErrorHint } from "../../src/abi/errors.js";
import type { ErrorInfo } from "../../src/abi/errors.js";

/** Max hex digits for `custom program error: 0x...` — Solana custom errors are u32. */
const CUSTOM_ERROR_HEX_MAX_LEN = 8;

/** Which program a custom error was attributed to. */
export type ErrorProgramKind = "wrapper" | "stake" | "nft" | "matcher" | "token" | "unknown";

/** Program ids to attribute errors to, in addition to the SDK's known deployments. */
export type ErrorProgramIds = Partial<Record<Exclude<ErrorProgramKind, "token" | "unknown">, readonly (PublicKey | string)[]>>;

/**
 * What the caller was doing, so a code with several meanings can get the right line.
 * `openLegs` is the number of open positions on the account (e.g. from parsePortfolioV17).
 */
export interface ErrorContext {
  action?: "trade" | "withdraw" | "deposit" | "resolve" | "other";
  openLegs?: number;
  /**
   * For `action: "resolve"` (tag 39): slots still to wait before the market can be resolved, or null when
   * permissionless resolve is disabled on the market. Take it from `staleResolveStatusV22(...).slotsRemaining`
   * (or pass `staleResolveErrorContextV22(status)` as the whole context).
   */
  staleSlotsRemaining?: bigint | number | null;
  /**
   * For `action: "trade"`: the trade is on a multi-asset market with a portfolio at >= 3 legs, where 19 means a
   * health certificate is not at the market's current epochs (Q-7; see buildMultiAssetTradeIxsV22).
   */
  healthCheckStale?: boolean;
}

/** Options for {@link parseErrorFromLogs}. */
export interface ParseErrorOptions {
  /** Extra program ids (fresh deployments, env overrides) to attribute by kind. */
  programIds?: ErrorProgramIds;
  /** Caller context for codes with several meanings (wrapper 9 and 19). */
  context?: ErrorContext;
}

/** A custom program error decoded from transaction logs. */
export interface ParsedProgramError {
  code: number;
  name: string;
  hint?: string;
  /** The program the failing log line names, decoded with that program's own error table. */
  program: ErrorProgramKind;
  /** Base58 id of the failing program, when the log line names one. */
  programId?: string;
}

const TOKEN_PROGRAM_IDS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];

function knownProgramIds(extra?: ErrorProgramIds): Map<string, ErrorProgramKind> {
  const m = new Map<string, ErrorProgramKind>();
  const add = (kind: ErrorProgramKind, ids: readonly (PublicKey | string | undefined)[]) => {
    for (const id of ids) {
      if (id === undefined) continue;
      m.set(typeof id === "string" ? id : id.toBase58(), kind);
    }
  };
  add("wrapper", [PROGRAM_IDS.devnet.percolator, PROGRAM_IDS.mainnet.percolator, PROGRAM_IDS_DEVNET_V22.percolator, PROGRAM_IDS_DEVNET_V1.percolator]);
  add("matcher", [PROGRAM_IDS.devnet.matcher, PROGRAM_IDS.mainnet.matcher, PROGRAM_IDS_DEVNET_V22.matcher, PROGRAM_IDS_DEVNET_V1.matcher]);
  add("stake", [STAKE_PROGRAM_IDS.devnet, STAKE_PROGRAM_IDS.mainnet, PROGRAM_IDS_DEVNET_V22.vault, PROGRAM_IDS_DEVNET_V1.vault]);
  add("nft", [NFT_PROGRAM_IDS.devnet, NFT_PROGRAM_IDS.mainnet, PROGRAM_IDS_DEVNET_V22.nft, PROGRAM_IDS_DEVNET_V1.nft]);
  add("token", TOKEN_PROGRAM_IDS);
  // Caller-declared ids win over the built-in sets.
  if (extra) {
    for (const kind of ["wrapper", "stake", "nft", "matcher"] as const) add(kind, extra[kind] ?? []);
  }
  return m;
}

function decodeForProgram(kind: ErrorProgramKind, code: number): ErrorInfo | undefined {
  switch (kind) {
    case "stake": {
      const v5 = STAKE_ERRORS_V5[code];
      if (v5) return v5;
      const hint = STAKE_ERRORS[code];
      const name = STAKE_ERROR_NAMES[code];
      return hint !== undefined && name !== undefined ? { name, hint } : undefined;
    }
    case "nft":
      return NFT_ERRORS[code];
    case "matcher":
      return MATCHER_V2_ERRORS[code];
    case "token":
      return SPL_TOKEN_ERRORS[code];
    case "wrapper":
    case "unknown":
      return PERCOLATOR_ERRORS[code];
  }
}

/**
 * Hint for a code a known non-wrapper program does not define. The matcher (percolator-match 2b08537a) defines
 * only Custom 8001..8005 and otherwise returns built-in errors, so e.g. "matcher 9" is not a matcher error: say so
 * instead of returning a bare Unknown(9) (and never borrow the wrapper's name for it).
 */
function unlistedCodeHint(program: ErrorProgramKind, code: number): string | undefined {
  if (program === "matcher") return `The matcher program returned code ${code}, which it does not define (its own codes are 8001-8005). If this was a trade, check the wrapper's error on the same transaction; otherwise the matcher build may not match this SDK.`;
  if (program === "stake" || program === "nft") return `The ${program} program returned code ${code}, which is not in this SDK's ${program} error table; the program build may be newer than this SDK.`;
  return undefined;
}

/**
 * Parse a custom program error from transaction logs and attribute it to the program that failed.
 *
 * The FIRST `Program <id> failed: custom program error: 0x..` line is used (the innermost failing
 * program of a CPI chain). The id on that line selects the error table: the wrapper's
 * (PERCOLATOR_ERRORS), the stake program's (STAKE_ERRORS + STAKE_ERRORS_V5), the NFT program's
 * (NFT_ERRORS), the matcher's (MATCHER_V2_ERRORS) or SPL Token's. Ids are the SDK's known
 * deployments (devnet v2.2 / v1, mainnet) plus `opts.programIds`. A program the SDK does not know,
 * or a log line without an id, falls back to the wrapper table (the legacy behaviour) and is
 * reported as `program: "unknown"`.
 *
 * @param logs  Array of transaction log strings from the RPC response.
 * @param opts  Extra program ids and caller context (see {@link ParseErrorOptions}).
 * @returns Parsed error with code, name, hint and program — or null if none is found.
 *
 * @example
 * ```ts
 * const err = parseErrorFromLogs(sim.value.logs ?? [], { context: { action: "withdraw", openLegs: 1 } });
 * if (err) console.error(`${err.program} ${err.name}: ${err.hint}`);
 * ```
 */
export function parseErrorFromLogs(logs: string[], opts?: ParseErrorOptions): ParsedProgramError | null {
  if (!Array.isArray(logs)) {
    return null;
  }
  const re = new RegExp(
    `custom program error: 0x([0-9a-fA-F]{1,${CUSTOM_ERROR_HEX_MAX_LEN}})(?![0-9a-fA-F])`,
    "i",
  );
  const programRe = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) failed:/;
  let known: Map<string, ErrorProgramKind> | undefined;
  for (const log of logs) {
    if (typeof log !== "string") {
      continue;
    }
    const match = log.match(re);
    if (match) {
      const code = parseInt(match[1], 16);
      if (!Number.isFinite(code) || code < 0 || code > 0xffff_ffff) {
        continue;
      }
      const programId = log.match(programRe)?.[1];
      known ??= knownProgramIds(opts?.programIds);
      const program: ErrorProgramKind = (programId !== undefined ? known.get(programId) : undefined) ?? "unknown";
      const info = decodeForProgram(program, code);
      const isWrapperTable = program === "wrapper" || program === "unknown";
      const hint = isWrapperTable && opts?.context ? getContextualErrorHint(code, opts.context) : info?.hint;
      return {
        code,
        name: info?.name ?? `Unknown(${code})`,
        hint: hint ?? unlistedCodeHint(program, code),
        program,
        ...(programId !== undefined ? { programId } : {}),
      };
    }
  }
  return null;
}
