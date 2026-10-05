/**
 * P2b Earn as counterparty — PDA, instruction builders and account decoders (tag 103, tag 99
 * dials form, `VaultLpExtV19`, the non-bound tag-77 redeemer signature).
 *
 * Source: percolator-prog PR #526 at `d9e3e2d7` (see `abi/p2b-earn.ts`). DRAFT, not deployed.
 *
 * COUPLING (wrapper review I-3): the program, SDK and keeper ship together. Once any tag 103 (or the
 * tag-99 dials form) has created the ext and raised the registry flag, a client that omits the ext
 * from 98 / 97 / bound 78 fails closed, and a bound 77 needs a prior harvest, so every redemption on
 * that market would break. On a Live NON-bound vault tag 77 also needs `[12]` = the redeemer as a
 * SIGNER, so a keeper can no longer execute someone else's 77.
 *
 * @module p2b-earn
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { AccountMeta, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { buildAccountMetas } from "../abi/accounts.js";
import { encodeExecuteRedemption } from "../abi/instructions.js";
import {
  ACCOUNTS_SET_VAULT_LP_RISK_V19_P2B,
  ACCOUNTS_VAULT_LP_ALLOCATE_P2B,
  KIND_VAULT_LP_EXT_P2B,
  LP_VAULT_REGISTRY_EXT_FLAG_OFF_P2B,
  U128_MAX_P2B,
  VAULT_LP_EXT_ACCOUNT_LEN_P2B,
  VAULT_LP_EXT_FIELD_OFF_P2B,
  VAULT_LP_EXT_SEED_P2B,
  VAULT_LP_EXT_VERSION_P2B,
  ALLOC_ALPHA_MAX_BPS_P2B,
  ALLOC_BUFFER_MIN_BPS_P2B,
  encodeSetVaultLpRiskV19P2b,
  encodeVaultLpAllocateP2b,
} from "../abi/p2b-earn.js";
import type { SetVaultLpRiskV19ArgsP2b } from "../abi/p2b-earn.js";
import { deriveInsuranceLpMint, deriveLpBackingLedger, deriveLpEscrow, deriveLpRedemption, deriveLpVaultRegistry, deriveVaultAuthority } from "./pda.js";
import { deriveProgramDataAddressP3, deriveVaultLpStateP3, withBoundVaultLpTailP3 } from "./p3-vault-lp.js";
import type { VaultLpMarketP3 } from "./p3-vault-lp.js";
import { V17_EXPECTED_VERSION, V17_KIND_OFF, V17_MAGIC } from "./slab.js";

/**
 * Derive the per-market `VaultLpExtV19` PDA: `["vault_lp_ext", market]`.
 *
 * @param programId  Wrapper program id.
 * @param market     Market account.
 * @returns `[pda, bump]`.
 * @example
 * ```ts
 * const [ext] = deriveVaultLpExtP2b(WRAPPER, market);
 * ```
 */
export function deriveVaultLpExtP2b(programId: PublicKey, market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode(VAULT_LP_EXT_SEED_P2B), market.toBytes()], programId);
}

/**
 * True if an LP-vault registry has its "VaultLpExtV19 exists" flag set (`_reserved[1] == 1`, account
 * byte 161). While set, tags 98 / 97 / bound 78 REQUIRE the ext account.
 *
 * @param registryData  Raw LpVaultRegistry account bytes.
 * @returns Whether the ext exists.
 * @throws If the flag byte is neither 0 nor 1 (the program rejects it too) or the account is short.
 * @example
 * ```ts
 * const m: VaultLpMarketP3 = { ...base, vaultLpExt: isLpVaultRegistryExtP2b(reg.data) ? deriveVaultLpExtP2b(P, market)[0] : undefined };
 * ```
 */
export function isLpVaultRegistryExtP2b(registryData: Uint8Array): boolean {
  if (registryData.length <= LP_VAULT_REGISTRY_EXT_FLAG_OFF_P2B) throw new Error("registry account too short for the ext flag");
  const b = registryData[LP_VAULT_REGISTRY_EXT_FLAG_OFF_P2B];
  if (b !== 0 && b !== 1) throw new Error(`registry ext flag must be 0|1, got ${b}`);
  return b === 1;
}

/** Decoded `VaultLpExtV19`. */
export interface VaultLpExtV19 {
  marketGroup: PublicKey;
  /** Senior principal sitting in the vault LP's capital because of tag 103 (minus tag-98 recalls). */
  allocatedAtoms: bigint;
  /** Cumulative LP-fee atoms the G6 waterfall routed to the junior cushion (locked against 97 up to the target). */
  cushionAccruedAtoms: bigint;
  allocatedTotalAtoms: bigint;
  deallocatedTotalAtoms: bigint;
  /** Allocation fraction of C_eff (<= 5000 until L3). */
  allocAlphaBps: number;
  /** Redemption buffer kept liquid in the pots (>= 3000). */
  allocBufferBps: number;
  cushionTargetBps: number;
  cushionShareBps: number;
  version: number;
  bump: number;
}

function dv(d: Uint8Array): DataView {
  return new DataView(d.buffer, d.byteOffset, d.byteLength);
}
function u128At(v: DataView, o: number): bigint {
  return (v.getBigUint64(o + 8, true) << 64n) | v.getBigUint64(o, true);
}

/**
 * Decode a `VaultLpExtV19` account (kind 10, 144 bytes), mirroring `read_vault_lp_ext`'s header and
 * `validate_vault_lp_ext` (version 1, non-zero market, alpha <= 5000, buffer in [3000, 10000],
 * cushion target / share <= 10000 and both-or-neither, zero padding and reserved).
 *
 * @param data  Raw account bytes (header included).
 * @returns Decoded ext.
 * @throws If the magic, kind, length or any validated field is wrong.
 * @example
 * ```ts
 * const info = await conn.getAccountInfo(deriveVaultLpExtP2b(P, market)[0]);
 * const ext = decodeVaultLpExtV19(info!.data);
 * ```
 */
export function decodeVaultLpExtV19(data: Uint8Array): VaultLpExtV19 {
  if (data.length < VAULT_LP_EXT_ACCOUNT_LEN_P2B) throw new Error(`VaultLpExtV19: need ${VAULT_LP_EXT_ACCOUNT_LEN_P2B} bytes, got ${data.length}`);
  const v = dv(data);
  if (v.getBigUint64(0, true) !== V17_MAGIC) throw new Error("VaultLpExtV19: invalid v17 magic");
  if (v.getUint16(8, true) !== V17_EXPECTED_VERSION) throw new Error(`VaultLpExtV19: invalid v17 version ${v.getUint16(8, true)}`);
  if (data[V17_KIND_OFF] !== KIND_VAULT_LP_EXT_P2B) throw new Error(`VaultLpExtV19: kind ${data[V17_KIND_OFF]} != ${KIND_VAULT_LP_EXT_P2B}`);
  const B = 16;
  const F = VAULT_LP_EXT_FIELD_OFF_P2B;
  const marketGroup = new PublicKey(data.subarray(B + F.marketGroup, B + F.marketGroup + 32));
  const out: VaultLpExtV19 = {
    marketGroup,
    allocatedAtoms: u128At(v, B + F.allocatedAtoms),
    cushionAccruedAtoms: u128At(v, B + F.cushionAccruedAtoms),
    allocatedTotalAtoms: u128At(v, B + F.allocatedTotalAtoms),
    deallocatedTotalAtoms: u128At(v, B + F.deallocatedTotalAtoms),
    allocAlphaBps: v.getUint16(B + F.allocAlphaBps, true),
    allocBufferBps: v.getUint16(B + F.allocBufferBps, true),
    cushionTargetBps: v.getUint16(B + F.cushionTargetBps, true),
    cushionShareBps: v.getUint16(B + F.cushionShareBps, true),
    version: data[B + F.version],
    bump: data[B + F.bump],
  };
  const zero = (o: number, n: number): boolean => data.subarray(B + o, B + o + n).every((b) => b === 0);
  if (
    out.version !== VAULT_LP_EXT_VERSION_P2B || marketGroup.equals(PublicKey.default) ||
    out.allocAlphaBps > ALLOC_ALPHA_MAX_BPS_P2B || out.allocBufferBps < ALLOC_BUFFER_MIN_BPS_P2B || out.allocBufferBps > 10_000 ||
    out.cushionTargetBps > 10_000 || out.cushionShareBps > 10_000 || (out.cushionTargetBps === 0) !== (out.cushionShareBps === 0) ||
    !zero(F.padding, 6) || !zero(F.reserved, 16)
  ) {
    throw new Error("VaultLpExtV19: invalid record — the program would reject it too");
  }
  return out;
}

/**
 * Fetch and decode a market's ext. `null` when the account does not exist (no ext yet: the keeper's
 * first tag 103 or the tag-99 dials form creates it).
 *
 * @param conn       Connection (only `getAccountInfo` is used).
 * @param programId  Wrapper program id.
 * @param market     Market account.
 * @returns The decoded ext or null.
 * @example
 * ```ts
 * const ext = await fetchVaultLpExtP2b(conn, WRAPPER, market);
 * ```
 */
export async function fetchVaultLpExtP2b(conn: Pick<Connection, "getAccountInfo">, programId: PublicKey, market: PublicKey): Promise<VaultLpExtV19 | null> {
  const info = await conn.getAccountInfo(deriveVaultLpExtP2b(programId, market)[0]);
  if (!info) return null;
  return decodeVaultLpExtV19(new Uint8Array(info.data));
}

/**
 * Build tag 103 VaultLpAllocate (permissionless, Live). The ext PDA is derived and always passed
 * (the first call creates it, the cranker paying rent). `amount` defaults to `u128::MAX`: the
 * program clamps to `min(alpha*C_eff - allocated, drawable - buffer*C_eff)`.
 *
 * Compute: tag 103 runs a full certificate refresh of the vault LP; budget it like tag 77
 * ({@link RECOMMENDED_CU_P3}). Send it only on a bound market (`isLpVaultRegistryBoundP3`); Custom 100
 * means "no room right now", not a failure of the client.
 *
 * @param m        Market context (`registryDomain`, `lpPortfolio`).
 * @param cranker  Signer; pays the ext rent on the first call.
 * @param amount   Atoms requested (default `u128::MAX`).
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildVaultLpAllocateIxP2b(m, keeper.publicKey);
 * ```
 */
export function buildVaultLpAllocateIxP2b(m: VaultLpMarketP3, cranker: PublicKey, amount: bigint = U128_MAX_P2B): TransactionInstruction {
  return new TransactionInstruction({
    programId: m.programId,
    keys: buildAccountMetas(ACCOUNTS_VAULT_LP_ALLOCATE_P2B, {
      cranker, market: m.market, registry: deriveLpVaultRegistry(m.programId, m.market)[0],
      vaultLpState: deriveVaultLpStateP3(m.programId, m.market)[0], lpPortfolio: m.lpPortfolio,
      ledger: deriveLpBackingLedger(m.programId, m.market, m.registryDomain)[0],
      siblingLedger: deriveLpBackingLedger(m.programId, m.market, m.registryDomain ^ 1)[0],
      vaultLpExt: deriveVaultLpExtP2b(m.programId, m.market)[0], systemProgram: SystemProgram.programId,
    }),
    data: Buffer.from(encodeVaultLpAllocateP2b(amount)),
  });
}

/**
 * Build tag 99 in its dials form (81 bytes, 6 accounts): the legacy risk fields plus the allocation
 * and cushion dials; creates the ext on first use. Upgrade-authority only; the authority pays rent.
 *
 * @param programId         Wrapper program id.
 * @param market            Market account.
 * @param upgradeAuthority  Signer (writable).
 * @param args              Fields and dials.
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildSetVaultLpRiskV19IxP2b(WRAPPER, market, ua, { ...risk, allocAlphaBps: 5000, allocBufferBps: 3000, cushionTargetBps: 0, cushionShareBps: 0 });
 * ```
 */
export function buildSetVaultLpRiskV19IxP2b(programId: PublicKey, market: PublicKey, upgradeAuthority: PublicKey, args: SetVaultLpRiskV19ArgsP2b): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: buildAccountMetas(ACCOUNTS_SET_VAULT_LP_RISK_V19_P2B, {
      upgradeAuthority, programData: deriveProgramDataAddressP3(programId)[0], market,
      registry: deriveLpVaultRegistry(programId, market)[0], vaultLpExt: deriveVaultLpExtP2b(programId, market)[0],
      systemProgram: SystemProgram.programId,
    }),
    data: Buffer.from(encodeSetVaultLpRiskV19P2b(args)),
  });
}

/**
 * Tag 78 LpVaultCrankFees on a BOUND vault, ext-aware: `base` (the 6-account unbound form) plus
 * `[6] vault_lp_state (w)`, and, once the ext exists, `[7] ext (w)` and `[8] vault LP (w)`.
 * Equivalent to `withBoundVaultLpTailP3(base, state, lp, { vaultLpExt })`.
 *
 * @param base  Unbound-form tag-78 instruction (6 accounts).
 * @param m     Market context; set `m.vaultLpExt` once the registry ext flag is set.
 * @returns The instruction with the tail.
 * @example
 * ```ts
 * const ix = withCrankFeesBoundTailP2b(crankFeesIx, { ...m, vaultLpExt });
 * ```
 */
export function withCrankFeesBoundTailP2b(base: TransactionInstruction, m: VaultLpMarketP3): TransactionInstruction {
  return withBoundVaultLpTailP3(base, deriveVaultLpStateP3(m.programId, m.market)[0], m.lpPortfolio, { vaultLpExt: m.vaultLpExt });
}

/**
 * Tag 77 ExecuteRedemption on a NON-bound vault: 13 accounts, with `[12]` = the redeemer, a SIGNER by
 * default. A Live non-bound exit is priced on E3, whose claim term can sit in a touch-order dip, so
 * the program refuses (`ExpectedSigner`) unless the redeemer signs (review H-1(b)): a keeper can no
 * longer execute someone else's 77. In Resolved mode the signature is not required
 * (`redeemerSigns: false`).
 *
 * Accounts: 0 cranker [s,w] · 1 market [w] · 2 registry [w] · 3 redemption [w] · 4 LP mint [w] ·
 * 5 escrow [w] · 6 vault token [w] · 7 vault authority · 8 own ledger [w] · 9 redeemer ATA [w] ·
 * 10 token program · 11 sibling ledger [w] · 12 redeemer (rent destination) [w, signer].
 *
 * @param m             Market context (`registryDomain` picks the own ledger; `lpPortfolio` unused).
 * @param cranker       Fee payer / signer; may equal the redeemer.
 * @param redeemer      The redemption's owner.
 * @param redeemerDest  Redeemer's collateral token account.
 * @param vaultToken    Market collateral vault token account.
 * @param sourceDomain  Pot to redeem from.
 * @param opts          `redeemerSigns` (default true).
 * @returns Instruction.
 * @example
 * ```ts
 * const ix = buildExecuteRedemptionIxNonBoundP2b(m, user, user, userAta, vaultAta, m.registryDomain);
 * // the transaction must be signed by `user`
 * ```
 */
export function buildExecuteRedemptionIxNonBoundP2b(
  m: Pick<VaultLpMarketP3, "programId" | "market" | "registryDomain">, cranker: PublicKey, redeemer: PublicKey, redeemerDest: PublicKey,
  vaultToken: PublicKey, sourceDomain: number, opts: { redeemerSigns?: boolean } = {},
): TransactionInstruction {
  const [registry] = deriveLpVaultRegistry(m.programId, m.market);
  const w = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: true });
  const r = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: false, isWritable: false });
  return new TransactionInstruction({
    programId: m.programId,
    data: Buffer.from(encodeExecuteRedemption({ domain: sourceDomain })),
    keys: [
      w(cranker, true), w(m.market), w(registry), w(deriveLpRedemption(m.programId, registry, redeemer)[0]),
      w(deriveInsuranceLpMint(m.programId, m.market)[0]), w(deriveLpEscrow(m.programId, m.market)[0]), w(vaultToken),
      r(deriveVaultAuthority(m.programId, m.market)[0]), w(deriveLpBackingLedger(m.programId, m.market, m.registryDomain)[0]),
      w(redeemerDest), r(TOKEN_PROGRAM_ID), w(deriveLpBackingLedger(m.programId, m.market, m.registryDomain ^ 1)[0]),
      w(redeemer, opts.redeemerSigns !== false),
    ],
  });
}
