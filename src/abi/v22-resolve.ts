/**
 * ResolveStalePermissionless (tag 39): anyone can permanently resolve a market whose oracle has been
 * stale for at least `permissionless_resolve_stale_slots` (18,000 slots, ~72 min, on the v2.2 markets).
 *
 * Verified against percolator-prog RC 6c078a0e (= the v2.2 fresh devnet wrapper 81ed7fdf minus two id lines),
 * `src/v16_program.rs`:
 *   decode   `39 => Self::ResolveStalePermissionless { now_slot: read_u64(&mut rest)? }`, then `rest` must be
 *            empty (InvalidInstructionData otherwise) — the wire is exactly `[39, now_slot u64 LE]`, 9 bytes;
 *   encode   `out.push(39); push_u64(&mut out, now_slot);`;
 *   handler  `handle_resolve_stale_permissionless`: accounts[0] = market (writable, owned by the wrapper).
 *            No signer is checked (the fee payer is enough). Refusals, in order:
 *              mode != Live                                   -> 21 EngineLockActive (already resolved)
 *              Clock slot < header.current_slot               -> 19 EngineStale
 *              !permissionless_stale_matured(cfg, Clock slot) -> 27 OracleStale (not matured yet)
 *            where matured = stale_slots != 0 && slot - cfg.last_good_oracle_slot >= stale_slots.
 *            `now_slot` is only a fallback: the program uses the Clock slot when the sysvar is available.
 * A price push before resolution moves `last_good_oracle_slot` and un-matures the market.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { concatBytes, encU8, encU64 } from "./encode.js";
import { IX_TAG } from "./instructions.js";
import { resolveMarketGeometry } from "./layout.js";
import { parseWrapperConfigV17 } from "../solana/slab.js";
import type { ErrorContext } from "./errors.js";

/** Account list of tag 39 (one account). */
export const ACCOUNTS_RESOLVE_STALE_PERMISSIONLESS_V22 = Object.freeze([
  Object.freeze({ name: "market", signer: false, writable: true }),
] as const);

const U64_MAX = (1n << 64n) - 1n;

/**
 * Encode ResolveStalePermissionless (tag 39): `[39, now_slot u64 LE]`, 9 bytes.
 *
 * @param nowSlot  The caller's current slot (fallback only; the program reads the Clock).
 * @returns 9 bytes.
 * @throws If `nowSlot` is not a u64.
 * @example
 * ```ts
 * encodeResolveStalePermissionless(await connection.getSlot()); // Uint8Array(9) [39, ...]
 * ```
 */
export function encodeResolveStalePermissionless(nowSlot: bigint | number): Uint8Array {
  const s = typeof nowSlot === "number" ? BigInt(nowSlot) : nowSlot;
  if (typeof nowSlot === "number" && !Number.isSafeInteger(nowSlot)) throw new Error(`nowSlot ${nowSlot} is not a safe integer; pass a bigint`);
  if (s < 0n || s > U64_MAX) throw new Error(`nowSlot ${s} is not a u64`);
  return concatBytes(encU8(IX_TAG.ResolveStalePermissionless), encU64(s));
}

/** Alias of {@link encodeResolveStalePermissionless} with the v2.2 suffix used by the other v22 encoders. */
export const encodeResolveStalePermissionlessV22 = encodeResolveStalePermissionless;

/**
 * Build the tag-39 instruction. Permissionless: no signer other than the fee payer.
 *
 * @param programId  Wrapper program id (devnet v2.2: `PROGRAM_IDS_DEVNET_V22.percolator`).
 * @param market     The stale market (slab) account.
 * @param nowSlot    The caller's current slot.
 * @returns The instruction.
 * @example
 * ```ts
 * const ix = buildResolveStalePermissionlessIxV22(getProgramId("devnet"), market, BigInt(await connection.getSlot()));
 * const tx = new Transaction().add(ix); // fee payer signs; no other signer
 * ```
 */
export function buildResolveStalePermissionlessIxV22(programId: PublicKey, market: PublicKey, nowSlot: bigint | number): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [{ pubkey: market, isSigner: false, isWritable: true }],
    data: Buffer.from(encodeResolveStalePermissionless(nowSlot)),
  });
}

/** Whether tag 39 would pass on this market at `nowSlot`, and if not the code it would return. */
export interface StaleResolveStatusV22 {
  /** Raw market mode byte (0 = Live). */
  mode: number;
  /** `permissionless_resolve_stale_slots` (0 = permissionless resolve disabled). */
  staleSlots: bigint;
  /** `last_good_oracle_slot`. */
  lastGoodOracleSlot: bigint;
  /** Slot at which the market matures, or null when disabled. */
  maturesAtSlot: bigint | null;
  /** Slots still to wait until maturity at `nowSlot` (0 when matured), or null when disabled. */
  slotsRemaining: bigint | null;
  /** True when tag 39 would resolve the market at `nowSlot`. */
  canResolve: boolean;
  /** The refusal code tag 39 would return (21 resolved, 19 slot behind, 27 not matured), or null. */
  refusalCode: 21 | 19 | 27 | null;
}

/**
 * Predict tag 39 on a market from its account data (same checks and order as the handler).
 *
 * @param marketData  Raw market account bytes.
 * @param nowSlot     The cluster slot to evaluate at.
 * @returns The status.
 * @example
 * ```ts
 * const st = staleResolveStatusV22(info.data, BigInt(await connection.getSlot()));
 * if (st.canResolve) await sendTx(buildResolveStalePermissionlessIxV22(programId, market, slot));
 * ```
 */
export function staleResolveStatusV22(marketData: Uint8Array, nowSlot: bigint): StaleResolveStatusV22 {
  const g = resolveMarketGeometry(marketData, { parser: "staleResolveStatusV22", strictLength: false });
  const dv = new DataView(marketData.buffer, marketData.byteOffset, marketData.byteLength);
  const mode = marketData[g.groupOff + g.layout.group.mode];
  const currentSlot = dv.getBigUint64(g.groupOff + g.layout.group.currentSlot, true);
  const cfg = parseWrapperConfigV17(marketData);
  const staleSlots = cfg.permissionlessResolveStaleSlots;
  const lastGood = cfg.lastGoodOracleSlot;
  const maturesAtSlot = staleSlots === 0n ? null : lastGood + staleSlots;
  const matured = staleSlots !== 0n && (nowSlot > lastGood ? nowSlot - lastGood : 0n) >= staleSlots;
  let refusalCode: StaleResolveStatusV22["refusalCode"] = null;
  if (mode !== 0) refusalCode = 21;
  else if (nowSlot < currentSlot) refusalCode = 19;
  else if (!matured) refusalCode = 27;
  const slotsRemaining = maturesAtSlot === null ? null : maturesAtSlot > nowSlot ? maturesAtSlot - nowSlot : 0n;
  return { mode, staleSlots, lastGoodOracleSlot: lastGood, maturesAtSlot, slotsRemaining, canResolve: refusalCode === null, refusalCode };
}

/**
 * The error context for a failed tag 39, so `parseErrorFromLogs` / `getContextualErrorHint` can say how long
 * is left instead of the generic stale-price text for 27.
 *
 * @param status  From {@link staleResolveStatusV22}.
 * @returns `{ action: "resolve", staleSlotsRemaining }`.
 * @example
 * ```ts
 * const st = staleResolveStatusV22(info.data, slot);
 * const err = parseErrorFromLogs(sim.value.logs ?? [], { context: staleResolveErrorContextV22(st) });
 * // 27 -> "This market's price has not been stale for long enough to resolve yet: 17,271 more slots ..."
 * ```
 */
export function staleResolveErrorContextV22(status: Pick<StaleResolveStatusV22, "slotsRemaining">): ErrorContext {
  return { action: "resolve", staleSlotsRemaining: status.slotsRemaining };
}
