/**
 * v2.2 growth round 2 (R2.1 item 4): the on-chain DEX depth source.
 *
 * Source of truth (read, every offset and byte verified): wrapper branch `feat/v22-growth-dex-depth` (`percolator-prog-dex`) @ `e2c93138`:
 * `src/depth_src_v22.rs` (the `DepthSourceV22` record, pool allow-list, depth math) and `src/v16_program.rs` (tag 123 `SetDepthSource`,
 * PushAuthMark depth mode 2, PDA kind 16, error 129 `DepthSourceInvalid`).
 *
 * The upgrade authority pins ONE pool per market with tag 123 (PDA `["depth_src", market]`). A keeper (or anyone holding the oracle authority key)
 * then sends PushAuthMark mode 2: the 44-byte form with `depth_mode = 2`, `depth_e6 = 0`, and four more accounts. The wrapper reads the pool's own
 * reserves and computes the +-2% depth itself ({@link plus2PctDepthE6}), so nobody can inflate it; the source is "on-chain pool" (2), uncapped by
 * `attested_max_tier`.
 *
 * @module v22-depth-source
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { concatBytes, encU8, encU16, encU64 } from "./encode.js";
import { ACCOUNT_KIND, LAYOUT_V22, UnknownLayoutError, resolveLayout } from "./layout.js";
import type { LayoutTable } from "./layout.js";
import { buildAccountMetas } from "./accounts.js";
import type { AccountSpec } from "./accounts.js";
import { encodePushAuthMark } from "./instructions.js";
import type { PushAuthMarkArgs } from "./instructions.js";

/** Wrapper tag 123 `SetDepthSource` (`constants::TAG_SET_DEPTH_SOURCE`). */
export const TAG_SET_DEPTH_SOURCE_V22 = 123;
/** Tag 123 `op`: 0 clears the pin (mode 2 refused afterwards), 1 sets / replaces it. */
export const DEPTH_SOURCE_OP = Object.freeze({ Clear: 0, Set: 1 } as const);
/** Tag 123 instruction data length: `[123][op u8][asset_index u16][market_id u64]`. */
export const SET_DEPTH_SOURCE_LEN_V22 = 12;
/** PDA seed (`depth_src_v22::DEPTH_SOURCE_SEED`). */
export const DEPTH_SOURCE_SEED_V22 = "depth_src";
/** `depth_src_v22::DEPTH_SOURCE_VERSION`. */
export const DEPTH_SOURCE_VERSION_V22 = 1;
/** `size_of::<DepthSourceV22>()`. */
export const DEPTH_SOURCE_BODY_LEN_V22 = 256;
/** Account length: 16-byte header + 256-byte body (the wrapper requires this exact length). */
export const DEPTH_SOURCE_ACCOUNT_LEN_V22 = 16 + DEPTH_SOURCE_BODY_LEN_V22;
/** `flags` bit 0: the pin is in force (clear after a UA "clear": mode 2 is refused with 129). */
export const DEPTH_SRC_FLAG_ACTIVE = 1;
/** `flags` bit 1: the market's asset ("base") is the pool's side 1. */
export const DEPTH_SRC_FLAG_BASE_IS_SIDE1 = 2;
/** Mint decimals above this are refused. */
export const DEPTH_SRC_MAX_DECIMALS = 18;
/** `DepthSourceV22::amm_kind`. */
export const AMM_KIND_V22 = Object.freeze({ PumpSwap: 1, RaydiumCpmm: 2 } as const);
/** Allow-listed pool owners. The wrapper's devnet build also accepts the devnet Raydium CPMM; the mainnet build does not. */
export const DEPTH_AMM_PROGRAMS_V22 = Object.freeze({
  pumpSwap: new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"),
  raydiumCpmm: new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"),
  raydiumCpmmDevnet: new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb"),
} as const);

/**
 * Derive the depth-source PDA `["depth_src", market]`.
 *
 * @param programId  Wrapper program id.
 * @param market     Market (slab) account.
 * @returns `[pda, bump]`.
 * @example
 * ```ts
 * const [pin] = deriveDepthSourceV22(programId, market);
 * ```
 */
export function deriveDepthSourceV22(programId: PublicKey, market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(DEPTH_SOURCE_SEED_V22), market.toBuffer()], programId);
}

/** Decision 16 (prog#606): `["pool_claim", pool]`, kind 18, one growth market per spot pool. */
export const POOL_CLAIM_SEED_V22 = "pool_claim";

/**
 * The pool-claim PDA of `pool` (prog#606). Tag 123 op 1 creates / checks it at `[10]`; op 0 releases it at `[5]`.
 *
 * @param programId  Wrapper program id.
 * @param pool       The AMM pool account.
 * @returns `[pda, bump]`.
 */
export function derivePoolClaimV22(programId: PublicKey, pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(POOL_CLAIM_SEED_V22), pool.toBuffer()], programId);
}

/**
 * Tag 123 SetDepthSource data: `[123][op u8][asset_index u16 LE][market_id u64 LE]` (12 bytes). Upgrade authority only.
 *
 * @param op          0 = clear the pin, 1 = set / replace it.
 * @param assetIndex  The asset slot (`u16`); op 0 ignores it on chain.
 * @param marketId    The asset's generation (`u64`); op 0 ignores it on chain.
 * @returns 12 bytes.
 * @example
 * ```ts
 * encodeSetDepthSourceV22(1, 3, 0x0102030405060708n); // 7b 01 03 00 08 07 06 05 04 03 02 01
 * ```
 */
export function encodeSetDepthSourceV22(op: 0 | 1, assetIndex: number, marketId: bigint | string): Uint8Array {
  if (op !== DEPTH_SOURCE_OP.Clear && op !== DEPTH_SOURCE_OP.Set) throw new Error(`SetDepthSource op must be 0 (clear) or 1 (set), got ${String(op)}`);
  if (!Number.isInteger(assetIndex) || assetIndex < 0 || assetIndex > 0xffff) throw new Error(`assetIndex must be a u16, got ${assetIndex}`);
  return concatBytes(encU8(TAG_SET_DEPTH_SOURCE_V22), encU8(op), encU16(assetIndex), encU64(marketId));
}

/** The clear form of tag 123 (`op = 0`, asset 0, generation 0: a stale pin of a reused slot can always be cleared). */
export function encodeClearDepthSourceV22(assetIndex = 0, marketId: bigint | string = 0n): Uint8Array {
  return encodeSetDepthSourceV22(0, assetIndex, marketId);
}

/** Tag 123 accounts, common part `[0..4]` (the clear form carries only these). The market is WRITABLE (F-3: op 1 sets / op 0 clears `DEPTH_DEX_PINNED`). */
export const ACCOUNTS_SET_DEPTH_SOURCE_V22: readonly AccountSpec[] = [
  { name: "upgradeAuthority", signer: true, writable: true },
  { name: "programData", signer: false, writable: false },
  // v2.2 DEATH F-3 (wrapper 4db44b69, `expect_writable(market_ai)`, both ops): tag 123 writes the pin bit into the growth record.
  { name: "market", signer: false, writable: true },
  { name: "depthSource", signer: false, writable: true },
  { name: "systemProgram", signer: false, writable: false },
] as const;
/** Tag 123 op 1 tail `[5..9]`: the pool, its two vaults and the two mints ("base" = the market's asset). */
export const ACCOUNTS_SET_DEPTH_SOURCE_POOL_TAIL_V22: readonly AccountSpec[] = [
  { name: "pool", signer: false, writable: false },
  { name: "baseVault", signer: false, writable: false },
  { name: "quoteVault", signer: false, writable: false },
  { name: "baseMint", signer: false, writable: false },
  { name: "quoteMint", signer: false, writable: false },
] as const;
/** PushAuthMark mode 2 appends these four after `[0] oracleAuthority`, `[1] market` (all read-only). */
export const ACCOUNTS_PUSH_AUTH_MARK_DEX_TAIL_V22: readonly AccountSpec[] = [
  { name: "depthSource", signer: false, writable: false },
  { name: "pool", signer: false, writable: false },
  { name: "baseVault", signer: false, writable: false },
  { name: "quoteVault", signer: false, writable: false },
] as const;

const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

/** Arguments of {@link buildSetDepthSourceIxV22}. */
export interface SetDepthSourceArgsV22 {
  programId: PublicKey;
  /** The wrapper's upgrade authority (signer; pays the rent on first use). */
  upgradeAuthority: PublicKey;
  market: PublicKey;
  assetIndex: number;
  /** The asset's generation (`market_id`). */
  marketId: bigint | string;
  /** The AMM pool (owned by an allow-listed program). */
  pool: PublicKey;
  /** The pool's vault of the market's asset ("base") and of the other side ("quote"). */
  baseVault: PublicKey;
  quoteVault: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  /**
   * prog#606 pool claim: the pool the market is pinned to TODAY, when the new pin moves to a different pool (its claim is released at
   * `[11]`). Omit for a first pin or a re-pin of the same pool. Ignored by programs before #606 (extra accounts).
   */
  previousPool?: PublicKey;
}

/**
 * Tag 123 op 1: pin (or replace) the market's DEX depth source. 10 accounts. The wrapper refuses (129) a pool off the allow-list, vault / mint
 * keys that are not the pool's own, vaults that are not initialized token accounts of their mints, a refused Token-2022 extension, an asset mint
 * equal to the market's collateral mint, or a wrong PDA; non-authority: 8 `Unauthorized`.
 *
 * @param a  See {@link SetDepthSourceArgsV22}.
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildSetDepthSourceIxV22({ programId, upgradeAuthority, market, assetIndex: 0, marketId: 1n, pool, baseVault, quoteVault, baseMint, quoteMint });
 * ```
 */
export function buildSetDepthSourceIxV22(a: SetDepthSourceArgsV22): TransactionInstruction {
  const [programData] = PublicKey.findProgramAddressSync([a.programId.toBytes()], BPF_LOADER_UPGRADEABLE);
  const keys = [
    ...buildAccountMetas(ACCOUNTS_SET_DEPTH_SOURCE_V22, {
      upgradeAuthority: a.upgradeAuthority, programData, market: a.market, depthSource: deriveDepthSourceV22(a.programId, a.market)[0], systemProgram: SystemProgram.programId,
    }),
    ...buildAccountMetas(ACCOUNTS_SET_DEPTH_SOURCE_POOL_TAIL_V22, { pool: a.pool, baseVault: a.baseVault, quoteVault: a.quoteVault, baseMint: a.baseMint, quoteMint: a.quoteMint }),
    // prog#606: [10] the new pool's claim (created for this market; 129 if another market holds it).
    { pubkey: derivePoolClaimV22(a.programId, a.pool)[0], isSigner: false, isWritable: true },
  ];
  if (a.previousPool && !a.previousPool.equals(a.pool)) {
    // [11] the old pool's claim, released when the pin moves.
    keys.push({ pubkey: derivePoolClaimV22(a.programId, a.previousPool)[0], isSigner: false, isWritable: true });
  }
  return new TransactionInstruction({ programId: a.programId, keys, data: Buffer.from(encodeSetDepthSourceV22(1, a.assetIndex, a.marketId)) });
}

/**
 * Tag 123 op 0: clear the pin (PushAuthMark mode 2 is then refused with 129 until a new op 1). 5 accounts.
 *
 * @param programId         Wrapper program id.
 * @param upgradeAuthority  The wrapper's upgrade authority (signer).
 * @param market            Market account.
 * @param assetIndex        Ignored on chain for op 0 (default 0).
 * @param marketId          Ignored on chain for op 0 (default 0).
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildClearDepthSourceIxV22(programId, upgradeAuthority, market);
 * ```
 */
export function buildClearDepthSourceIxV22(
  programId: PublicKey,
  upgradeAuthority: PublicKey,
  market: PublicKey,
  assetIndex = 0,
  marketId: bigint | string = 0n,
  pinnedPool?: PublicKey,
): TransactionInstruction {
  const [programData] = PublicKey.findProgramAddressSync([programId.toBytes()], BPF_LOADER_UPGRADEABLE);
  const keys = buildAccountMetas(ACCOUNTS_SET_DEPTH_SOURCE_V22, {
    upgradeAuthority, programData, market, depthSource: deriveDepthSourceV22(programId, market)[0], systemProgram: SystemProgram.programId,
  });
  // prog#606: [5] the pinned pool's claim, released (required by #606 whenever the pin is active).
  if (pinnedPool) keys.push({ pubkey: derivePoolClaimV22(programId, pinnedPool)[0], isSigner: false, isWritable: true });
  return new TransactionInstruction({ programId, keys, data: Buffer.from(encodeClearDepthSourceV22(assetIndex, marketId)) });
}

/** Arguments of {@link buildPushAuthMarkDexIxV22}. */
export interface PushAuthMarkDexArgsV22 {
  programId: PublicKey;
  /** The asset's oracle authority (signer). */
  oracleAuthority: PublicKey;
  market: PublicKey;
  /** The tag 63 fields (no `depth`: mode 2 is implied). */
  push: Omit<PushAuthMarkArgs, "depth">;
  /** The pinned pool and its two vaults (must be exactly the pinned keys, else 129). */
  pool: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
}

/**
 * PushAuthMark mode 2: the 44-byte form (`depth_mode = 2`, `depth_e6 = 0`) with `[2] depth_src [3] pool [4] base_vault [5] quote_vault` after
 * `[0] oracle authority (signer)` and `[1] market (writable)`. One asset per instruction (several pushes in one transaction are several
 * instructions, each with its own four accounts). The wrapper stamps the depth with source 2 (no tier cap); any mismatch with the pin
 * writes nothing and answers 129 `DepthSourceInvalid`.
 *
 * @param a  See {@link PushAuthMarkDexArgsV22}.
 * @returns The instruction (44 data bytes, 6 accounts).
 * @example
 * ```ts
 * const ix = buildPushAuthMarkDexIxV22({ programId, oracleAuthority, market, push: { assetIndex: 0, marketId: 1n, nowSlot, markE6, observationSequence }, pool, baseVault, quoteVault });
 * ```
 */
export function buildPushAuthMarkDexIxV22(a: PushAuthMarkDexArgsV22): TransactionInstruction {
  const keys = [
    { pubkey: a.oracleAuthority, isSigner: true, isWritable: false },
    { pubkey: a.market, isSigner: false, isWritable: true },
    ...buildAccountMetas(ACCOUNTS_PUSH_AUTH_MARK_DEX_TAIL_V22, { depthSource: deriveDepthSourceV22(a.programId, a.market)[0], pool: a.pool, baseVault: a.baseVault, quoteVault: a.quoteVault }),
  ];
  return new TransactionInstruction({ programId: a.programId, keys, data: Buffer.from(encodePushAuthMark({ ...a.push, depth: { mode: 2, depthE6: 0n } })) });
}

// ============================================================================
// DepthSourceV22 (kind 16, ["depth_src", market], 16 + 256)
// ============================================================================

/** Decoded `DepthSourceV22` (`depth_src_v22.rs`, offsets pinned by const asserts there). */
export interface DepthSourceV22 {
  market: PublicKey;
  /** The pool's owner (allow-listed AMM program). */
  ammProgram: PublicKey;
  pool: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  /** The pinned asset generation. */
  marketId: bigint;
  /** Slot of the last SetDepthSource (informational). */
  setSlot: bigint;
  assetIndex: number;
  baseDecimals: number;
  quoteDecimals: number;
  flags: number;
  /** The pin is in force (`false` after a clear: mode 2 is refused). */
  active: boolean;
  /** The market's asset is the pool's side 1 (else side 0). */
  baseIsSide1: boolean;
  version: number;
  bump: number;
  /** 1 PumpSwap, 2 Raydium CPMM (0 on a cleared record). */
  ammKind: number;
}

function isZero(b: Uint8Array): boolean {
  for (const x of b) if (x !== 0) return false;
  return true;
}
function bad(msg: string): UnknownLayoutError {
  return new UnknownLayoutError("INVALID_RECORD", "decodeDepthSourceV22", `invalid account data: ${msg}`, { kind: ACCOUNT_KIND.DepthSource });
}

function ammKindFor(program: Uint8Array): number | null {
  const eq = (p: PublicKey): boolean => Buffer.compare(Buffer.from(program), Buffer.from(p.toBytes())) === 0;
  if (eq(DEPTH_AMM_PROGRAMS_V22.pumpSwap)) return AMM_KIND_V22.PumpSwap;
  if (eq(DEPTH_AMM_PROGRAMS_V22.raydiumCpmm) || eq(DEPTH_AMM_PROGRAMS_V22.raydiumCpmmDevnet)) return AMM_KIND_V22.RaydiumCpmm;
  return null;
}

/**
 * Decode a `DepthSourceV22` account with the wrapper's own validation (`validate_depth_source`): exact length, kind 16 header, version 1, a
 * non-zero market, zero reserved bytes, known flags; a cleared record must be all-zero but `market` / `version` / `bump`; an active one must name
 * an allow-listed program of the recorded kind, non-zero distinct keys (mints, vaults) and decimals <= 18.
 *
 * @param data   Raw account bytes (272).
 * @param table  Layout table (default {@link LAYOUT_V22}).
 * @returns The record.
 * @throws {@link UnknownLayoutError} on a wrong header / length or a record the wrapper would refuse.
 * @example
 * ```ts
 * const pin = decodeDepthSourceV22(info.data);
 * if (pin.active) console.log(pin.pool.toBase58());
 * ```
 */
export function decodeDepthSourceV22(data: Uint8Array, table: LayoutTable = LAYOUT_V22): DepthSourceV22 {
  const parser = "decodeDepthSourceV22";
  resolveLayout(data, { parser, kind: ACCOUNT_KIND.DepthSource, versions: [table.version] });
  if (data.length !== DEPTH_SOURCE_ACCOUNT_LEN_V22) throw new UnknownLayoutError("TOO_SHORT", parser, `depth source account must be ${DEPTH_SOURCE_ACCOUNT_LEN_V22} bytes, got ${data.length}`, { version: table.version, kind: ACCOUNT_KIND.DepthSource });
  const b = data.subarray(16, 16 + DEPTH_SOURCE_BODY_LEN_V22);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const key = (off: number): Uint8Array => b.subarray(off, off + 32);
  const flags = b[244] as number;
  const out: DepthSourceV22 = {
    market: new PublicKey(key(0)), ammProgram: new PublicKey(key(32)), pool: new PublicKey(key(64)), baseVault: new PublicKey(key(96)), quoteVault: new PublicKey(key(128)),
    baseMint: new PublicKey(key(160)), quoteMint: new PublicKey(key(192)), marketId: v.getBigUint64(224, true), setSlot: v.getBigUint64(232, true),
    assetIndex: v.getUint16(240, true), baseDecimals: b[242] as number, quoteDecimals: b[243] as number, flags,
    active: (flags & DEPTH_SRC_FLAG_ACTIVE) !== 0, baseIsSide1: (flags & DEPTH_SRC_FLAG_BASE_IS_SIDE1) !== 0, version: b[245] as number, bump: b[246] as number, ammKind: b[247] as number,
  };
  if (out.version !== DEPTH_SOURCE_VERSION_V22 || isZero(key(0)) || !isZero(b.subarray(248, 256)) || (flags & ~(DEPTH_SRC_FLAG_ACTIVE | DEPTH_SRC_FLAG_BASE_IS_SIDE1) & 0xff) !== 0) throw bad("depth source header invalid");
  if (!out.active) {
    const pinBytes = [b.subarray(32, 244)];
    if (!pinBytes.every(isZero) || flags !== 0 || out.ammKind !== 0) throw bad("a cleared depth source must have every pin field zero");
    return out;
  }
  const zero = (k: PublicKey): boolean => isZero(k.toBytes());
  if (ammKindFor(key(32)) !== out.ammKind || zero(out.pool) || zero(out.baseVault) || zero(out.quoteVault) || zero(out.baseMint) || zero(out.quoteMint)
    || out.baseMint.equals(out.quoteMint) || out.baseVault.equals(out.quoteVault) || out.baseDecimals > DEPTH_SRC_MAX_DECIMALS || out.quoteDecimals > DEPTH_SRC_MAX_DECIMALS) {
    throw bad("active depth source fails validation");
  }
  return out;
}

// ============================================================================
// Depth math (exact mirrors; identical to the keeper's plus2PctDepthE6)
// ============================================================================

const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;

/**
 * `floor(sqrt(n))`, exact for every u128 (`depth_src_v22::isqrt_u128`).
 *
 * @param n  Non-negative integer below 2^128.
 * @returns The integer square root.
 * @example
 * ```ts
 * isqrtU128(99n); // 9n
 * ```
 */
export function isqrtU128(n: bigint): bigint {
  if (n < 0n || n > U128_MAX) throw new Error("isqrtU128 input must be a u128");
  if (n < 2n) return n;
  const bits = n.toString(2).length;
  let x = 1n << BigInt(Math.ceil(bits / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/**
 * The exact +-2% depth of a constant-product pool from a reserve `R` valued in collateral atoms: `floor(R * (1 - 1/sqrt(1.02))) = R - m`, `m` the
 * smallest integer with `51 m^2 >= 50 R^2`. Rounds down, never overstated, full u64 width, no float. Port of `plus2pct_depth_e6`.
 *
 * @param r  Reserve value (collateral atoms), u64.
 * @returns Depth (atoms).
 * @example
 * ```ts
 * plus2PctDepthE6(1_000_000_000_000n); // 9_852_457_023n
 * ```
 */
export function plus2PctDepthE6(r: bigint): bigint {
  if (r < 0n || r > U64_MAX) throw new Error("plus2PctDepthE6 input must be a u64");
  if (r === 0n) return 0n;
  const q = r * r;
  const t = q - (q + 50n) / 51n; // q - ceil(q / 51)
  const m0 = isqrtU128(t);
  const a = m0 * m0;
  const ok = a >= q || q - a <= a / 50n;
  return r - (ok ? m0 : m0 + 1n);
}

/**
 * The reserve value `R` in collateral atoms. `quote-is-collateral`: the quote reserve. `base-at-mark`: `floor(base * mark / 10^(baseDecimals +
 * lotExp))` capped at u64::MAX (a cap only lowers the depth); `null` for a zero mark, decimals > 18 or `lotExp > 15`. Port of `reserve_value_e6`.
 *
 * @param path           Which side gives the value.
 * @param baseAtoms      The asset-side reserve.
 * @param quoteAtoms     The other side's reserve.
 * @param markE6         Per-lot mark (e6).
 * @param baseDecimals   The asset mint's decimals.
 * @param lotExp         The market's `lot_exp`.
 * @returns Value or `null`.
 * @example
 * ```ts
 * reserveValueE6("base-at-mark", 171_449_177_380_421n, 0n, 12_000_000n, 6, 4); // 205_739_012_856n
 * ```
 */
export function reserveValueE6(path: "quote-is-collateral" | "base-at-mark", baseAtoms: bigint, quoteAtoms: bigint, markE6: bigint, baseDecimals: number, lotExp: number): bigint | null {
  if (path === "quote-is-collateral") return quoteAtoms;
  if (markE6 === 0n || baseDecimals > DEPTH_SRC_MAX_DECIMALS || lotExp > 15) return null;
  const v = (baseAtoms * markE6) / 10n ** BigInt(baseDecimals + lotExp);
  return v > U64_MAX ? U64_MAX : v;
}
