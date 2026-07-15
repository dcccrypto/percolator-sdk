/**
 * @module stake
 * Percolator Insurance LP Staking program — instruction encoders, PDA derivation, and account specs.
 *
 * Program: percolator-stake (dcccrypto/percolator-stake)
 * Deployed devnet:  51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ
 * Deployed mainnet: DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F (unverified — no confirmed
 *   mainnet deployment of any stake/vault lineage found in the v17 planning docs as of
 *   this writing; treat as a placeholder until DevOps confirms)
 *
 * LINEAGE (as of 2026-07-14, see ~/v17/RESEARCH-issue6-lineage.md): the devnet address
 * 51CeUNpb... currently runs `percolator-vault@eb3ebe8` (`find4-insurance-authority-bind`).
 * The ADOPTED go-forward lineage is `percolator-stake@feat/adopt-stake-lineage-plus-n7`
 * (HEAD 9ec1c3a) — a same-address BPF upgrade of 51CeUNpb..., NOT a new deployment. This
 * module's STAKE_IX tag table and decodeStakePool below already reflect the ADOPTED
 * lineage's instruction set, which is a BREAKING change vs what 51CeUNpb... currently
 * runs on-chain until that upgrade lands (coordinate with the wrapper protocol-fee
 * redeploy — both require the same full market re-seed, see the RESEARCH doc §3).
 */

import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
export { TOKEN_2022_PROGRAM_ID };
import { safeEnv } from '../config/program-ids.js';
import { concatBytes } from '../abi/encode.js';

// ═══════════════════════════════════════════════════════════════
// Program ID — network-conditional (mirrors program-ids.ts pattern)
// ═══════════════════════════════════════════════════════════════

/**
 * Known stake program addresses per network.
 *
 * devnet: FIXED from the stale/wrong-lineage `6aJb1F9CDCVWCNYFwj8aQsVb696YnW6J1FznteHq4Q6k`
 * (an address that does not match any pinned deployment in the v17 planning docs) to
 * `51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ` — the actually-deployed devnet
 * stake/vault program, cross-verified against `PROGRAM_IDS_V17.vault` in
 * `src/config/program-ids.ts` ("v17 vault — deployed devnet 2026-06-26") and every
 * pinned reference in `~/v17/DECISIONS-LEDGER.md` / `~/v17/CONSOLIDATED-PLAN.md` /
 * `~/v17/RESEARCH-issue6-lineage.md`. This address currently runs
 * `percolator-vault@eb3ebe8`; it will be upgraded IN PLACE (same address) to the
 * ADOPTED `percolator-stake` lineage this module targets — see the module doc above.
 *
 * mainnet: UNVERIFIED — no confirmed mainnet stake/vault deployment found in any
 * v17 planning doc (Percolator mainnet is still in prep). Do not treat this as ground
 * truth; prefer the STAKE_PROGRAM_ID env override on mainnet until DevOps confirms.
 */
export const STAKE_PROGRAM_IDS = {
  devnet: '51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ',
  mainnet: 'DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F',
} as const;
Object.freeze(STAKE_PROGRAM_IDS);

/**
 * Resolve the stake program ID for the given network.
 *
 * Priority:
 *  1. STAKE_PROGRAM_ID env var (explicit override — DevOps sets this for mainnet until constant is filled)
 *  2. Network-specific constant from STAKE_PROGRAM_IDS
 *
 * Throws a clear error on mainnet when no address is available so callers
 * surface the gap instead of silently hitting the devnet program.
 */
export function getStakeProgramId(network?: 'devnet' | 'mainnet'): PublicKey {
  // Only consult the env override when no explicit network arg is provided.
  // An explicit network argument always wins so tests and multi-network callers
  // are not silently redirected to a DevOps-set override address.
  if (!network) {
    const override = safeEnv('STAKE_PROGRAM_ID');
    if (override) {
      console.warn(
        `[percolator-sdk] STAKE_PROGRAM_ID env override active: ${override} — ensure this points to a trusted program`,
      );
      return new PublicKey(override);
    }
  }

  const detectedNetwork =
    network ??
    (() => {
      const n = safeEnv('NEXT_PUBLIC_DEFAULT_NETWORK')?.toLowerCase() ??
                safeEnv('NETWORK')?.toLowerCase() ?? '';
      if (n === 'mainnet' || n === 'mainnet-beta') return 'mainnet' as const;
      if (n === 'devnet') return 'devnet' as const;
      // In browser bundles, process.env is empty (env vars aren't inlined into
      // third-party SDK code). Default to mainnet to match the app's fail-closed
      // behavior — devnet must be opted into explicitly.
      if (typeof window !== 'undefined') return 'mainnet' as const;
      return 'devnet' as const;
    })();

  const id = STAKE_PROGRAM_IDS[detectedNetwork];
  if (!id) {
    throw new Error(
      `Stake program not deployed on ${detectedNetwork}. ` +
      `Set STAKE_PROGRAM_ID env var or wait for DevOps to deploy and update STAKE_PROGRAM_IDS.mainnet.`,
    );
  }
  return new PublicKey(id);
}

/**
 * Default export — resolves for the current runtime network.
 * Use getStakeProgramId() with an explicit network argument where possible.
 *
 * @deprecated Direct use of STAKE_PROGRAM_ID is being phased out in favour of
 *   getStakeProgramId() so mainnet callers get a clear error rather than silently
 *   resolving to the devnet address.
 */
export const STAKE_PROGRAM_ID = new PublicKey(STAKE_PROGRAM_IDS.devnet);

// ═══════════════════════════════════════════════════════════════
// Instruction Tags — ADOPTED percolator-stake lineage
// (feat/adopt-stake-lineage-plus-n7, HEAD 9ec1c3a, src/instruction.rs)
//
// BREAKING vs the CURRENTLY-DEPLOYED percolator-vault@eb3ebe8 program at the
// same address (51CeUNpb...): tags 5-9 are completely repurposed (were admin
// CPI proxies / TransferAdmin, now two-step admin rotation + #242 cooldown
// timelock), tag 15 moves from BindInsuranceAuthority to AdminSetTrancheConfig,
// BindInsuranceAuthority moves to 19, tags 16/18 go live (were unhandled), and
// tags 20-23 are new. See ~/v17/RESEARCH-issue6-lineage.md §1.1 for the full
// side-by-side tag-delta table this was verified against.
// ═══════════════════════════════════════════════════════════════

export const STAKE_IX = {
  InitPool: 0,
  Deposit: 1,
  Withdraw: 2,
  FlushToInsurance: 3,
  UpdateConfig: 4,
  /**
   * ProposeAdmin (tag 5) — step 1 of two-step `pool.admin` rotation. The
   * CURRENT admin proposes a new admin (written to `pool.pending_admin`); the
   * proposed admin gains no authority until AcceptAdmin (tag 6). Proposing the
   * zero pubkey CANCELS an outstanding proposal.
   *
   * BREAKING vs the deployed percolator-vault program: tag 5 there is the
   * removed `TransferAdmin` (one-step, rejects on-chain). Do NOT confuse with
   * wrapper marketauth rotation (a completely different key, done via the
   * wrapper's own UpdateAuthority tag 32, CPI'd from stake InitPool).
   *
   * Wire: tag(1) + new_admin(32) = 33 bytes.
   * Accounts: [currentAdmin(signer), poolPda(writable)]
   */
  ProposeAdmin: 5,
  /**
   * AcceptAdmin (tag 6) — step 2 of two-step `pool.admin` rotation. The
   * PENDING admin signs to take ownership; requires an outstanding proposal
   * and the signer to equal `pool.pending_admin`.
   *
   * BREAKING vs the deployed percolator-vault program: tag 6 there is the
   * removed `AdminSetOracleAuthority` (rejects on-chain).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [pendingAdmin(signer), poolPda(writable)]
   */
  AcceptAdmin: 6,
  /**
   * ProposeCooldownIncrease (tag 7) — step 1 of the #242 cooldown-increase
   * timelock. Proposes a NEW (larger) `cooldown_slots`; takes effect only
   * after CommitCooldownIncrease is called >= TIMELOCK_SLOTS later, guaranteeing
   * LP holders an exit window. A decrease/unchanged value is rejected here
   * (use UpdateConfig, which applies decreases immediately).
   *
   * BREAKING vs the deployed percolator-vault program: tag 7 there is the
   * removed `AdminSetRiskThreshold` (rejects on-chain).
   *
   * Wire: tag(1) + new_cooldown_slots(u64) = 9 bytes.
   * Accounts: [admin(signer), poolPda(writable), clockSysvar]
   */
  ProposeCooldownIncrease: 7,
  /**
   * CommitCooldownIncrease (tag 8) — step 2 of the #242 timelock. Applies the
   * pending cooldown increase; rejects if TIMELOCK_SLOTS has not elapsed.
   *
   * BREAKING vs the deployed percolator-vault program: tag 8 there is the
   * removed `AdminSetMaintenanceFee` (rejects on-chain).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda(writable), clockSysvar]
   */
  CommitCooldownIncrease: 8,
  /**
   * CancelCooldownIncrease (tag 9) — withdraws an outstanding #242 cooldown
   * proposal.
   *
   * BREAKING vs the deployed percolator-vault program: tag 9 there is the
   * removed `AdminResolveMarket` (rejects on-chain).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda(writable)]
   */
  CancelCooldownIncrease: 9,
  /** @deprecated Alias for ProposeAdmin — the OLD percolator-vault semantics
   *  (one-step TransferAdmin) no longer apply; tag 5 is now ProposeAdmin. */
  TransferAdmin: 5,
  /** @deprecated Alias for AcceptAdmin — the OLD percolator-vault semantics
   *  (AdminSetOracleAuthority) no longer apply; tag 6 is now AcceptAdmin. */
  AdminSetOracleAuthority: 6,
  /** @deprecated Alias for ProposeCooldownIncrease — the OLD percolator-vault
   *  semantics (AdminSetRiskThreshold) no longer apply; tag 7 is now
   *  ProposeCooldownIncrease with a DIFFERENT wire format (u64, not removed-stub). */
  AdminSetRiskThreshold: 7,
  /** @deprecated Alias for CommitCooldownIncrease — the OLD percolator-vault
   *  semantics (AdminSetMaintenanceFee) no longer apply; tag 8 is now
   *  CommitCooldownIncrease. */
  AdminSetMaintenanceFee: 8,
  /** @deprecated Alias for CancelCooldownIncrease — the OLD percolator-vault
   *  semantics (AdminResolveMarket) no longer apply; tag 9 is now
   *  CancelCooldownIncrease. */
  AdminResolveMarket: 9,
  /**
   * ReturnInsurance (tag 10) — unchanged wire/semantics vs the deployed
   * percolator-vault program: transfer withdrawn insurance back into the pool
   * vault (admin calls wrapper WithdrawInsurance directly first, then this
   * books admin-ATA -> pool-vault).
   */
  ReturnInsurance: 10,
  /** @deprecated Legacy alias for ReturnInsurance. */
  AdminWithdrawInsurance: 10,
  /** @deprecated Tombstoned in BOTH lineages (was an admin CPI proxy —
   *  SetInsurancePolicy). This tag rejects on-chain in the adopted lineage too. */
  AdminSetInsurancePolicy: 11,
  /** PERC-272: Accrue trading fees to LP vault. Unchanged vs deployed vault. */
  AccrueFees: 12,
  /** PERC-272: Init pool in trading LP mode. Unchanged vs deployed vault. */
  InitTradingPool: 13,
  /** PERC-313: Set HWM config (enable + floor bps). Unchanged vs deployed vault. */
  AdminSetHwmConfig: 14,
  /**
   * AdminSetTrancheConfig (tag 15) — enable/configure senior-junior LP
   * tranches. Sets `junior_fee_mult_bps`.
   *
   * BREAKING vs the deployed percolator-vault program: tag 15 there is
   * BindInsuranceAuthority (moved to tag 19 in the adopted lineage — see
   * below). Sending this payload against the DEPLOYED vault program would
   * execute BindInsuranceAuthority instead; only send it against the
   * ADOPTED percolator-stake lineage.
   *
   * Wire: tag(1) + junior_fee_mult_bps(u16) = 3 bytes.
   * Accounts: [admin(signer), poolPda(writable)]
   */
  AdminSetTrancheConfig: 15,
  /**
   * DepositJunior (tag 16) — deposit into the junior (first-loss) tranche.
   * Same account shape as Deposit (tag 1).
   *
   * BREAKING vs the deployed percolator-vault program: tag 16 is UNHANDLED
   * there (rejects). Live only on the adopted lineage.
   *
   * Wire: tag(1) + amount(u64) = 9 bytes.
   */
  DepositJunior: 16,
  /**
   * BindInsuranceAuthority (tag 19 / 0x13) — FIND-4 fix, MOVED from tag 15
   * (0x0F) in the deployed percolator-vault program.
   *
   * Binds the vault_auth PDA as BOTH the wrapper's asset-0 insurance_authority
   * AND insurance_operator via two CPIs to UpdateAssetAuthority (tag 65,
   * kind=1 INSURANCE then kind=2 INSURANCE_OPERATOR) — the adopted lineage
   * binds both in one call, unlike the deployed vault program which only
   * bound insurance_authority. The human admin signs the outer tx as the
   * current authority/operator; vault_auth signs via invoke_signed.
   *
   * Wire: tag(1) = 0x13 — no payload beyond the tag byte.
   * Accounts: [admin(signer), poolPda, vaultAuth, slab(writable), percolatorProgram]
   */
  BindInsuranceAuthority: 19,
  /**
   * RotateInsuranceAuthority (tag 20) — admin-gated migration/incident
   * escape that moves the market's `insurance_authority` OFF our vault_auth
   * PDA to an admin-specified `newTarget`. The PDA signs as the CURRENT
   * authority (invoke_signed); newTarget co-signs the outer tx as the NEW
   * authority. NEW in the adopted lineage — no equivalent in the deployed
   * percolator-vault program (which has no un-bind escape at all).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda, vaultAuth, newTarget(signer), slab(writable), percolatorProgram]
   */
  RotateInsuranceAuthority: 20,
  /**
   * BurnAssetAdmin (tag 21) — IRREVERSIBLE removal of the admin's rotate-back
   * capability. CPIs UpdateAssetAuthority(kind=0 ASSET_ADMIN, new_pubkey=[0;32]).
   * After this, no key can rotate ANY per-asset authority back to an
   * admin-controlled key. Call ONCE per market, only after BindInsuranceAuthority
   * has completed. NEW in the adopted lineage.
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer, writable), poolPda(writable), vaultAuth(placeholder), slab(writable), percolatorProgram]
   */
  BurnAssetAdmin: 21,
  /**
   * RotateInsuranceOperator (tag 22) — analogous to RotateInsuranceAuthority
   * (tag 20) but for `insurance_operator` (kind=2). Part of the no-lockout
   * migration sequence before a final BurnAssetAdmin. NEW in the adopted
   * lineage.
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda, vaultAuth, newTarget(signer), slab(writable), percolatorProgram]
   */
  RotateInsuranceOperator: 22,
  /**
   * RecoverFlushedInsurance (tag 23) — PERMISSIONLESS recovery of tokens from
   * the wrapper's insurance fund back into the stake pool vault, via a CPI to
   * wrapper tag 57 `WithdrawInsuranceAsset` (gated on insurance_operator ==
   * vault_auth PDA). Survives BurnAssetAdmin because tag 57 gates on
   * insurance_operator, not asset_admin. `amount` capped to
   * `total_flushed - total_returned`; funds can only land in `pool.vault`.
   * NEW in the adopted lineage.
   *
   * Wire: tag(1) + amount(u64) = 9 bytes.
   * Accounts: [caller(no signer check), poolPda(writable), poolVault(writable),
   *   vaultAuth, wrapperMarket(writable), wrapperVault(writable), wrapperVaultAuth,
   *   tokenProgram, percolatorProgram]
   */
  RecoverFlushedInsurance: 23,
  /**
   * SetMarketResolved (tag 18) — admin marks the pool as market-resolved
   * (blocks new deposits). Call after resolving the market on the wrapper
   * directly.
   *
   * BREAKING vs the deployed percolator-vault program: tag 18 is UNHANDLED
   * there (rejects). Live only on the adopted lineage.
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda(writable)]
   */
  SetMarketResolved: 18,
} as const;
Object.freeze(STAKE_IX);

// ═══════════════════════════════════════════════════════════════
// Error hint table — StakeError (src/error.rs, ADOPTED percolator-stake lineage)
// ═══════════════════════════════════════════════════════════════

/**
 * User-facing hint text for `StakeError` custom program error codes
 * (`ProgramError::Custom(code)`, `percolator-stake/src/error.rs`).
 *
 * Codes 0-24 mirror `error.rs`'s on-chain `error_hint()` fallback text.
 * Codes 25-27 (#242 cooldown-increase timelock) and 28
 * (`DepositBelowMinimumLiquidity`, N7 anti-inflation hardening) are new in
 * the ADOPTED lineage — 28 is the entry this table exists to add. NOTE:
 * the on-chain `error_hint()` itself has a gap (falls through to "Unknown
 * error" for 25-27 despite them being named enum variants); the hints below
 * for 25-27 are derived from `error.rs`'s doc comments, not copied from a
 * (missing) on-chain string.
 */
export const STAKE_ERRORS: Record<number, string> = {
  0: "Pool already initialized — use a different slab address or check if InitPool was already called",
  1: "Pool not initialized — call InitPool first to create the stake pool",
  2: "Unauthorized — you must be the pool admin to perform this action",
  3: "Cooldown not elapsed — wait for the cooldown period before withdrawing again",
  4: "Insufficient LP tokens — you don't have enough LP tokens to burn",
  5: "Zero amount — deposit and withdrawal amounts must be greater than zero",
  6: "Arithmetic overflow — pool values exceeded u64 bounds, operation blocked",
  7: "Invalid mint — LP mint doesn't match the pool's LP mint",
  8: "Market is resolved — no new deposits allowed after resolution",
  9: "Deposit cap exceeded — pool has reached its maximum deposit limit",
  10: "Invalid PDA — account is not a valid PDA for the expected seed",
  11: "Deprecated (was AdminAlreadyTransferred) — code kept for stable numbering; should not occur",
  12: "Deprecated (was AdminNotTransferred) — code kept for stable numbering; should not occur",
  13: "Insufficient vault balance — vault doesn't have enough collateral for this withdrawal",
  14: "Invalid percolator program — percolator program ID doesn't match",
  15: "CPI to percolator failed — the cross-program invoke to percolator failed",
  16: "Invalid account — account is not owned by the expected program or is not writable",
  17: "Pool mode mismatch — operation not valid for this pool's mode (e.g., AccrueFees on insurance pool)",
  18: "Withdrawal blocked — would breach high-water mark floor protection",
  19: "Tranches not enabled — senior/junior tranches are not enabled on this pool",
  20: "Junior balance insufficient — junior tranche doesn't have enough balance for this operation",
  21: "Wrong tranche — deposit already belongs to a different tranche",
  22: "Zero shares minted — deposit amount too small to mint any LP at the current share price; increase the amount",
  23: "No pending admin — there is no admin transfer to accept (propose one first, or it was cancelled)",
  24: "Insurance loss outstanding — junior tranche deposits are paused until the flushed insurance is returned (total_flushed > total_returned)",
  25: "Cooldown increase requires timelock — a cooldown_slots INCREASE must go through ProposeCooldownIncrease -> wait -> CommitCooldownIncrease, not UpdateConfig (decreases are still immediate via UpdateConfig)",
  26: "Timelock not elapsed — CommitCooldownIncrease was called before the required timelock window had passed since ProposeCooldownIncrease; LP holders are still inside their exit window",
  27: "No pending cooldown proposal — CommitCooldownIncrease / CancelCooldownIncrease called with no active ProposeCooldownIncrease proposal outstanding",
  28: "Deposit below minimum liquidity — the pool's first-ever deposit must exceed MINIMUM_LIQUIDITY so a permanent dead-share floor can be locked (N7 anti-inflation hardening); deposit a larger amount",
};
Object.freeze(STAKE_ERRORS);

// ═══════════════════════════════════════════════════════════════
// PDA Derivation
// ═══════════════════════════════════════════════════════════════

const TEXT = new TextEncoder();

/** Derive the stake pool PDA for a given slab (market). */
export function deriveStakePool(slab: PublicKey, programId?: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode('stake_pool'), slab.toBytes()],    programId ?? getStakeProgramId(),  );
}

/** Derive the vault authority PDA (signs CPI, owns LP mint + vault). */
export function deriveStakeVaultAuth(pool: PublicKey, programId?: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode('vault_auth'), pool.toBytes()],    programId ?? getStakeProgramId(),  );
}

/** Derive the per-user deposit PDA (tracks cooldown, deposit time). */
export function deriveDepositPda(pool: PublicKey, user: PublicKey, programId?: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode('stake_deposit'), pool.toBytes(), user.toBytes()],    programId ?? getStakeProgramId(),  );
}

// ═══════════════════════════════════════════════════════════════
// Browser-safe binary helpers (DataView, no Node.js Buffer dependency)// ═══════════════════════════════════════════════════════════════

/** Read a u64 little-endian from a Uint8Array at the given offset. */
function readU64LE(data: Uint8Array, off: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(off, /* littleEndian= */ true);
}

/** Read a u16 little-endian from a Uint8Array at the given offset. */
function readU16LE(data: Uint8Array, off: number): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getUint16(off, /* littleEndian= */ true);
}

function requireDiscriminator(
  accountName: string,
  data: Uint8Array,
  offset: number,
  expected: Uint8Array,
): void {
  for (let i = 0; i < expected.length; i += 1) {
    if (data[offset + i] !== expected[i]) {
      throw new Error(`${accountName} invalid discriminator`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Instruction Encoders
// ═══════════════════════════════════════════════════════════════

function u64Le(v: bigint | number): Uint8Array {
  if (typeof v === "number" && !Number.isSafeInteger(v)) {
    throw new Error(`u64Le: number ${v} exceeds Number.MAX_SAFE_INTEGER — use BigInt`);
  }

  const big = BigInt(v);
  if (big < 0n) throw new Error(`u64Le: value must be non-negative, got ${big}`);
  if (big > 0xFFFF_FFFF_FFFF_FFFFn) throw new Error(`u64Le: value exceeds u64 max`);
  const arr = new Uint8Array(8);
  new DataView(arr.buffer).setBigUint64(0, big, true);  return arr;
}

function u128Le(v: bigint | number): Uint8Array {
  if (typeof v === "number" && !Number.isSafeInteger(v)) {
    throw new Error(`u128Le: number ${v} exceeds Number.MAX_SAFE_INTEGER — use BigInt`);
  }

  const big = BigInt(v);
  if (big < 0n) throw new Error(`u128Le: value must be non-negative, got ${big}`);
  if (big > (1n << 128n) - 1n) throw new Error(`u128Le: value exceeds u128 max`);
  const arr = new Uint8Array(16);
  const view = new DataView(arr.buffer);  view.setBigUint64(0, big & 0xFFFFFFFFFFFFFFFFn, true);
  view.setBigUint64(8, big >> 64n, true);
  return arr;
}

function u16Le(v: number): Uint8Array {
  if (!Number.isInteger(v) || v < 0 || v > 0xFFFF) throw new Error(`u16Le: value out of u16 range (0..65535), got ${v}`);  const arr = new Uint8Array(2);  new DataView(arr.buffer).setUint16(0, v, true);
  return arr;
}

/** Tag 0: InitPool — create stake pool for a slab. */
export function encodeStakeInitPool(cooldownSlots: bigint | number, depositCap: bigint | number): Uint8Array {
  return concatBytes(
    new Uint8Array([STAKE_IX.InitPool]),
    u64Le(cooldownSlots),
    u64Le(depositCap),
  );
}

/** Tag 1: Deposit — deposit collateral, receive LP tokens. */
export function encodeStakeDeposit(amount: bigint | number): Uint8Array {
  return concatBytes(new Uint8Array([STAKE_IX.Deposit]), u64Le(amount));
}

/** Tag 2: Withdraw — burn LP tokens, receive collateral (subject to cooldown). */
export function encodeStakeWithdraw(lpAmount: bigint | number): Uint8Array {
  return concatBytes(new Uint8Array([STAKE_IX.Withdraw]), u64Le(lpAmount));
}

/** Tag 3: FlushToInsurance — move collateral from stake vault to wrapper insurance. */
export function encodeStakeFlushToInsurance(amount: bigint | number): Uint8Array {
  return concatBytes(new Uint8Array([STAKE_IX.FlushToInsurance]), u64Le(amount));
}

/** Tag 4: UpdateConfig — update cooldown and/or deposit cap. */
export function encodeStakeUpdateConfig(
  newCooldownSlots?: bigint | number,
  newDepositCap?: bigint | number,
): Uint8Array {
  return concatBytes(
    new Uint8Array([STAKE_IX.UpdateConfig]),
    new Uint8Array([newCooldownSlots != null ? 1 : 0]),
    u64Le(newCooldownSlots ?? 0n),
    new Uint8Array([newDepositCap != null ? 1 : 0]),
    u64Le(newDepositCap ?? 0n),
  );
}

function removedStakeInstruction(name: string, tag: number): never {
  throw new Error(
    `${name} (stake tag ${tag}) was removed on-chain in percolator-stake v3 and must not be sent.`,
  );
}

/**
 * Tag 5: ProposeAdmin — step 1 of two-step `pool.admin` rotation. The
 * CURRENT admin proposes `newAdmin` (written to `pool.pending_admin`); it
 * does not gain any authority until AcceptAdmin (tag 6) is called by that
 * key. Pass `PublicKey.default` (zero pubkey) to CANCEL an outstanding
 * proposal.
 *
 * Accounts: [currentAdmin(signer), poolPda(writable)]
 */
export function encodeStakeProposeAdmin(newAdmin: PublicKey): Uint8Array {
  return concatBytes(
    new Uint8Array([STAKE_IX.ProposeAdmin]),
    newAdmin.toBytes(),
  );
}

/**
 * Tag 6: AcceptAdmin — step 2 of two-step `pool.admin` rotation. The
 * PENDING admin signs to become admin. Requires an outstanding proposal.
 *
 * Accounts: [pendingAdmin(signer), poolPda(writable)]
 */
export function encodeStakeAcceptAdmin(): Uint8Array {
  return new Uint8Array([STAKE_IX.AcceptAdmin]);
}

/**
 * Tag 7: ProposeCooldownIncrease — step 1 of the #242 cooldown-increase
 * timelock. Proposes a NEW (larger) `cooldownSlots`; does not take effect
 * until CommitCooldownIncrease is called after the on-chain timelock has
 * elapsed. A decrease/unchanged value is rejected (use UpdateConfig instead).
 *
 * Accounts: [admin(signer), poolPda(writable), clockSysvar]
 */
export function encodeStakeProposeCooldownIncrease(newCooldownSlots: bigint | number): Uint8Array {
  return concatBytes(
    new Uint8Array([STAKE_IX.ProposeCooldownIncrease]),
    u64Le(newCooldownSlots),
  );
}

/**
 * Tag 8: CommitCooldownIncrease — step 2 of the #242 timelock. Applies the
 * pending cooldown increase; rejects if the timelock has not yet elapsed.
 *
 * Accounts: [admin(signer), poolPda(writable), clockSysvar]
 */
export function encodeStakeCommitCooldownIncrease(): Uint8Array {
  return new Uint8Array([STAKE_IX.CommitCooldownIncrease]);
}

/**
 * Tag 9: CancelCooldownIncrease — withdraws an outstanding #242 cooldown
 * increase proposal.
 *
 * Accounts: [admin(signer), poolPda(writable)]
 */
export function encodeStakeCancelCooldownIncrease(): Uint8Array {
  return new Uint8Array([STAKE_IX.CancelCooldownIncrease]);
}

/**
 * @deprecated The deployed percolator-vault program's one-step TransferAdmin
 * (tag 5) was removed on-chain there too (rejects). On the ADOPTED
 * percolator-stake lineage this module targets, tag 5 is the two-step
 * ProposeAdmin — use `encodeStakeProposeAdmin(newAdmin)` followed by the
 * proposed admin calling `encodeStakeAcceptAdmin()`. Throws.
 */
export function encodeStakeTransferAdmin(): Uint8Array {
  throw new Error(
    'encodeStakeTransferAdmin: tag 5 is ProposeAdmin (two-step rotation) in the adopted ' +
    'percolator-stake lineage — use encodeStakeProposeAdmin(newAdmin) + encodeStakeAcceptAdmin() instead.',
  );
}

/**
 * @deprecated Tag 6 is AcceptAdmin in the adopted percolator-stake lineage
 * (this instruction, AdminSetOracleAuthority, was removed on-chain in both
 * lineages). Throws.
 */
export function encodeStakeAdminSetOracleAuthority(newAuthority: PublicKey): Uint8Array {
  void newAuthority;
  throw new Error(
    'encodeStakeAdminSetOracleAuthority: tag 6 is AcceptAdmin in the adopted percolator-stake ' +
    'lineage — use encodeStakeAcceptAdmin() instead.',
  );
}

/**
 * @deprecated Tag 7 is ProposeCooldownIncrease in the adopted percolator-stake
 * lineage (this instruction, AdminSetRiskThreshold, was removed on-chain in
 * both lineages). Throws.
 */
export function encodeStakeAdminSetRiskThreshold(newThreshold: bigint | number): Uint8Array {
  void newThreshold;
  throw new Error(
    'encodeStakeAdminSetRiskThreshold: tag 7 is ProposeCooldownIncrease in the adopted ' +
    'percolator-stake lineage — use encodeStakeProposeCooldownIncrease(newCooldownSlots) instead.',
  );
}

/**
 * @deprecated Tag 8 is CommitCooldownIncrease in the adopted percolator-stake
 * lineage (this instruction, AdminSetMaintenanceFee, was removed on-chain in
 * both lineages). Throws.
 */
export function encodeStakeAdminSetMaintenanceFee(newFee: bigint | number): Uint8Array {
  void newFee;
  throw new Error(
    'encodeStakeAdminSetMaintenanceFee: tag 8 is CommitCooldownIncrease in the adopted ' +
    'percolator-stake lineage — use encodeStakeCommitCooldownIncrease() instead.',
  );
}

/**
 * @deprecated Tag 9 is CancelCooldownIncrease in the adopted percolator-stake
 * lineage (this instruction, AdminResolveMarket, was removed on-chain in both
 * lineages). Throws.
 */
export function encodeStakeAdminResolveMarket(): Uint8Array {
  throw new Error(
    'encodeStakeAdminResolveMarket: tag 9 is CancelCooldownIncrease in the adopted ' +
    'percolator-stake lineage — use encodeStakeCancelCooldownIncrease() instead.',
  );
}

/** Tag 10: ReturnInsurance — transfer withdrawn insurance back into the stake pool vault. */
export function encodeStakeReturnInsurance(amount: bigint | number): Uint8Array {
  return concatBytes(
    new Uint8Array([STAKE_IX.ReturnInsurance]),
    u64Le(amount),
  );
}

/** @deprecated Legacy alias for tag 10. Current on-chain semantics are ReturnInsurance. */
export function encodeStakeAdminWithdrawInsurance(amount: bigint | number): Uint8Array {
  return encodeStakeReturnInsurance(amount);
}

/** Tag 12: AccrueFees — permissionless: accrue trading fees to LP vault. */
export function encodeStakeAccrueFees(): Uint8Array {
  return new Uint8Array([STAKE_IX.AccrueFees]);
}

/** Tag 13: InitTradingPool — create pool in trading LP mode (pool_mode = 1). */
export function encodeStakeInitTradingPool(cooldownSlots: bigint | number, depositCap: bigint | number): Uint8Array {
  return concatBytes(
    new Uint8Array([STAKE_IX.InitTradingPool]),
    u64Le(cooldownSlots),
    u64Le(depositCap),
  );
}

/** Tag 14 (PERC-313): AdminSetHwmConfig — enable HWM protection and set floor BPS. */
export function encodeStakeAdminSetHwmConfig(
  enabled: boolean,
  hwmFloorBps: number,
): Uint8Array {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminSetHwmConfig]),
    new Uint8Array([enabled ? 1 : 0]),
    u16Le(hwmFloorBps),
  );
}

/**
 * Tag 15: AdminSetTrancheConfig — enable/configure senior-junior LP tranches.
 *
 * BREAKING vs the deployed percolator-vault program: tag 15 there is
 * BindInsuranceAuthority (moved to tag 19 in the adopted lineage — see
 * `encodeStakeBindInsuranceAuthority()`). Only send this against the ADOPTED
 * percolator-stake lineage; sending it against the currently-deployed vault
 * program would silently execute BindInsuranceAuthority instead.
 *
 * Wire: tag(1) + junior_fee_mult_bps(u16) = 3 bytes.
 * Accounts: [admin(signer), poolPda(writable)]
 */
export function encodeStakeAdminSetTrancheConfig(juniorFeeMultBps: number): Uint8Array {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminSetTrancheConfig]),
    u16Le(juniorFeeMultBps),
  );
}

/**
 * Tag 16: DepositJunior — deposit into the junior (first-loss) tranche. Same
 * account shape as Deposit (tag 1) — see `StakeAccounts['deposit']`.
 *
 * BREAKING vs the deployed percolator-vault program: tag 16 is UNHANDLED
 * there (rejects). Live only on the ADOPTED percolator-stake lineage.
 *
 * Wire: tag(1) + amount(u64) = 9 bytes.
 */
export function encodeStakeDepositJunior(amount: bigint | number): Uint8Array {
  return concatBytes(new Uint8Array([STAKE_IX.DepositJunior]), u64Le(amount));
}

/**
 * Tag 18: SetMarketResolved — admin marks the pool as market-resolved
 * (blocks new deposits). Call after resolving the market on the wrapper
 * directly.
 *
 * BREAKING vs the deployed percolator-vault program: tag 18 is UNHANDLED
 * there (rejects). Live only on the ADOPTED percolator-stake lineage.
 *
 * Wire: tag(1) — no payload.
 * Accounts: [admin(signer), poolPda(writable)]
 */
export function encodeStakeSetMarketResolved(): Uint8Array {
  return new Uint8Array([STAKE_IX.SetMarketResolved]);
}

/**
 * Tag 19 (0x13): BindInsuranceAuthority — FIND-4 fix, MOVED from tag 15
 * (0x0F) in the deployed percolator-vault program.
 *
 * Binds the vault_auth PDA as BOTH the wrapper's asset-0 insurance_authority
 * AND insurance_operator (two CPIs to UpdateAssetAuthority, tag 65, kind=1
 * then kind=2) — a broader bind than the deployed vault program's
 * single-CPI version (insurance_authority only). Must be called once after
 * InitPool, before FlushToInsurance will work.
 *
 * Wire: tag(1) = 0x13 — no payload beyond the tag byte (1 byte total).
 *
 * @returns 1-byte Uint8Array `[0x13]`.
 *
 * @example
 * ```ts
 * const data = encodeStakeBindInsuranceAuthority();
 * // accounts: bindInsuranceAuthorityAccounts({ admin, poolPda, vaultAuth, slab, percolatorProgram })
 * ```
 */
export function encodeStakeBindInsuranceAuthority(): Uint8Array {
  return new Uint8Array([STAKE_IX.BindInsuranceAuthority]);
}

/**
 * Account inputs for BindInsuranceAuthority (tag 19 / 0x13).
 *
 * @param admin               Current insurance_authority/insurance_operator (human admin wallet; outer tx signer).
 * @param poolPda             Stake pool PDA (derived via deriveStakePool()).
 * @param vaultAuth           Vault authority PDA (derived via deriveStakeVaultAuth()).
 * @param slab                Wrapper market-group slab (writable — needed for UpdateAssetAuthority CPI).
 * @param percolatorProgram   Wrapper program ID.
 */
export interface BindInsuranceAuthorityAccounts {
  admin: PublicKey;
  poolPda: PublicKey;
  vaultAuth: PublicKey;
  slab: PublicKey;
  percolatorProgram: PublicKey;
}

/**
 * Build account keys for BindInsuranceAuthority (tag 19 / 0x13).
 *
 * Account order matches src/processor.rs process_bind_insurance_authority
 * (adopted lineage — same account shape as the deployed vault program's tag
 * 15, only the tag byte moved):
 *   [0] admin              signer, read-only  (current insurance_authority/insurance_operator)
 *   [1] pool_pda           writable           (stake pool PDA)
 *   [2] vault_auth         read-only          (new authority; signs via invoke_signed)
 *   [3] slab               writable           (wrapper market; needed for CPI)
 *   [4] percolator_program read-only          (wrapper program for CPI dispatch)
 *
 * @param a Named accounts.
 * @returns Array of `{pubkey, isSigner, isWritable}` in program-expected order.
 *
 * @example
 * ```ts
 * const [poolPda] = deriveStakePool(slab, stakeProgramId);
 * const [vaultAuth] = deriveStakeVaultAuth(poolPda, stakeProgramId);
 * const keys = bindInsuranceAuthorityAccounts({ admin, poolPda, vaultAuth, slab, percolatorProgram });
 * ```
 */
export function bindInsuranceAuthorityAccounts(
  a: BindInsuranceAuthorityAccounts,
): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] {
  return [
    { pubkey: a.admin,             isSigner: true,  isWritable: false },
    { pubkey: a.poolPda,           isSigner: false, isWritable: true  },
    { pubkey: a.vaultAuth,         isSigner: false, isWritable: false },
    { pubkey: a.slab,              isSigner: false, isWritable: true  },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false },
  ];
}

/**
 * Tag 20: RotateInsuranceAuthority — admin-gated migration/incident escape
 * that moves the market's `insurance_authority` OFF our vault_auth PDA to an
 * admin-specified `newTarget`. NEW in the adopted lineage — no equivalent in
 * the deployed percolator-vault program (which has no un-bind escape).
 *
 * Wire: tag(1) — no payload.
 *
 * @returns 1-byte Uint8Array.
 *
 * @example
 * ```ts
 * const data = encodeStakeRotateInsuranceAuthority();
 * // accounts: rotateInsuranceAccounts({ admin, poolPda, vaultAuth, newTarget, slab, percolatorProgram })
 * ```
 */
export function encodeStakeRotateInsuranceAuthority(): Uint8Array {
  return new Uint8Array([STAKE_IX.RotateInsuranceAuthority]);
}

/**
 * Tag 22: RotateInsuranceOperator — analogous to RotateInsuranceAuthority
 * (tag 20) but for `insurance_operator` (kind=2). Part of the no-lockout
 * migration sequence before a final BurnAssetAdmin. NEW in the adopted
 * lineage.
 *
 * Wire: tag(1) — no payload.
 *
 * @returns 1-byte Uint8Array.
 *
 * @example
 * ```ts
 * const data = encodeStakeRotateInsuranceOperator();
 * // accounts: rotateInsuranceAccounts({ admin, poolPda, vaultAuth, newTarget, slab, percolatorProgram })
 * ```
 */
export function encodeStakeRotateInsuranceOperator(): Uint8Array {
  return new Uint8Array([STAKE_IX.RotateInsuranceOperator]);
}

/**
 * Account inputs shared by RotateInsuranceAuthority (tag 20) and
 * RotateInsuranceOperator (tag 22) — identical 6-account shape.
 *
 * @param admin               Pool admin (outer tx signer; == pool.admin).
 * @param poolPda             Stake pool PDA.
 * @param vaultAuth           Vault authority PDA — the CURRENT authority/operator, signs via invoke_signed.
 * @param newTarget           The successor authority/operator — co-signs the outer tx.
 * @param slab                Wrapper market-group slab (writable — needed for the CPI).
 * @param percolatorProgram   Wrapper program ID.
 */
export interface RotateInsuranceAccounts {
  admin: PublicKey;
  poolPda: PublicKey;
  vaultAuth: PublicKey;
  newTarget: PublicKey;
  slab: PublicKey;
  percolatorProgram: PublicKey;
}

/**
 * Build account keys for RotateInsuranceAuthority (tag 20) / RotateInsuranceOperator
 * (tag 22) — identical account order in both (src/processor.rs
 * process_rotate_insurance_authority / process_rotate_insurance_operator):
 *   [0] admin              signer, read-only  (== pool.admin)
 *   [1] pool_pda           read-only
 *   [2] vault_auth         read-only          (current authority/operator; signs via invoke_signed)
 *   [3] new_target         signer, read-only  (successor; co-signs the outer tx)
 *   [4] slab               writable           (wrapper market; needed for CPI)
 *   [5] percolator_program read-only          (wrapper program for CPI dispatch)
 *
 * @param a Named accounts.
 * @returns Array of `{pubkey, isSigner, isWritable}` in program-expected order.
 */
export function rotateInsuranceAccounts(
  a: RotateInsuranceAccounts,
): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] {
  return [
    { pubkey: a.admin,             isSigner: true,  isWritable: false },
    { pubkey: a.poolPda,           isSigner: false, isWritable: false },
    { pubkey: a.vaultAuth,         isSigner: false, isWritable: false },
    { pubkey: a.newTarget,         isSigner: true,  isWritable: false },
    { pubkey: a.slab,              isSigner: false, isWritable: true  },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false },
  ];
}

/**
 * Tag 21: BurnAssetAdmin — IRREVERSIBLE removal of the admin's rotate-back
 * capability. CPIs UpdateAssetAuthority(kind=0 ASSET_ADMIN, new_pubkey=[0;32]).
 * After this, no key can rotate ANY per-asset authority back to an
 * admin-controlled key. Call ONCE per market, only after
 * BindInsuranceAuthority has completed. NEW in the adopted lineage.
 *
 * Wire: tag(1) — no payload.
 *
 * @returns 1-byte Uint8Array.
 *
 * @example
 * ```ts
 * const data = encodeStakeBurnAssetAdmin();
 * // accounts: burnAssetAdminAccounts({ admin, poolPda, vaultAuth, slab, percolatorProgram })
 * ```
 */
export function encodeStakeBurnAssetAdmin(): Uint8Array {
  return new Uint8Array([STAKE_IX.BurnAssetAdmin]);
}

/**
 * Account inputs for BurnAssetAdmin (tag 21).
 *
 * @param admin               Pool admin (outer tx signer; == pool.admin; current asset_admin).
 * @param poolPda             Stake pool PDA (writable — records the burn).
 * @param vaultAuth           Vault authority PDA (placeholder new_authority slot — not checked for the burn CPI).
 * @param slab                Wrapper market-group slab (writable — needed for the CPI).
 * @param percolatorProgram   Wrapper program ID.
 */
export interface BurnAssetAdminAccounts {
  admin: PublicKey;
  poolPda: PublicKey;
  vaultAuth: PublicKey;
  slab: PublicKey;
  percolatorProgram: PublicKey;
}

/**
 * Build account keys for BurnAssetAdmin (tag 21) — src/processor.rs
 * process_burn_asset_admin:
 *   [0] admin              signer, writable   (current asset_admin == pool.admin)
 *   [1] pool_pda           writable           (records asset_admin_burned)
 *   [2] vault_auth         read-only          (placeholder new_authority slot)
 *   [3] slab               writable           (wrapper market; needed for CPI)
 *   [4] percolator_program read-only          (wrapper program for CPI dispatch)
 *
 * @param a Named accounts.
 * @returns Array of `{pubkey, isSigner, isWritable}` in program-expected order.
 */
export function burnAssetAdminAccounts(
  a: BurnAssetAdminAccounts,
): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] {
  return [
    { pubkey: a.admin,             isSigner: true,  isWritable: true  },
    { pubkey: a.poolPda,           isSigner: false, isWritable: true  },
    { pubkey: a.vaultAuth,         isSigner: false, isWritable: false },
    { pubkey: a.slab,              isSigner: false, isWritable: true  },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false },
  ];
}

/**
 * Tag 23: RecoverFlushedInsurance — PERMISSIONLESS recovery of tokens from
 * the wrapper's insurance fund back into the stake pool vault, via a CPI to
 * wrapper tag 57 `WithdrawInsuranceAsset` (gated on insurance_operator ==
 * vault_auth PDA — set by BindInsuranceAuthority tag 19). Survives
 * BurnAssetAdmin because tag 57 gates on insurance_operator, not asset_admin.
 * `amount` is capped on-chain to `total_flushed - total_returned`; funds can
 * only land in `pool.vault` (drain check on the CPI destination). NEW in the
 * adopted lineage.
 *
 * Wire: tag(1) + amount(u64) = 9 bytes.
 *
 * @param amount Atoms to recover (u64, non-zero, <= outstanding).
 *
 * @example
 * ```ts
 * const data = encodeStakeRecoverFlushedInsurance(1_000_000n);
 * // accounts: recoverFlushedInsuranceAccounts({ caller, poolPda, poolVault, vaultAuth,
 * //   wrapperMarket, wrapperVault, wrapperVaultAuth, tokenProgram, percolatorProgram })
 * ```
 */
export function encodeStakeRecoverFlushedInsurance(amount: bigint | number): Uint8Array {
  return concatBytes(
    new Uint8Array([STAKE_IX.RecoverFlushedInsurance]),
    u64Le(amount),
  );
}

/**
 * Account inputs for RecoverFlushedInsurance (tag 23).
 *
 * @param caller             Permissionless caller — no signer check required.
 * @param poolPda             Stake pool PDA (writable).
 * @param poolVault           Pool vault token account — destination (writable, must equal pool.vault).
 * @param vaultAuth           Vault authority PDA — the insurance_operator; signs the CPI via invoke_signed.
 * @param wrapperMarket       Wrapper market/slab account (writable).
 * @param wrapperVault        Wrapper insurance vault token account — source (writable).
 * @param wrapperVaultAuth    Wrapper vault authority PDA.
 * @param tokenProgram        Token program.
 * @param percolatorProgram   Wrapper program ID.
 */
export interface RecoverFlushedInsuranceAccounts {
  caller: PublicKey;
  poolPda: PublicKey;
  poolVault: PublicKey;
  vaultAuth: PublicKey;
  wrapperMarket: PublicKey;
  wrapperVault: PublicKey;
  wrapperVaultAuth: PublicKey;
  tokenProgram: PublicKey;
  percolatorProgram: PublicKey;
}

/**
 * Build account keys for RecoverFlushedInsurance (tag 23) — src/processor.rs
 * process_recover_flushed_insurance:
 *   [0] caller              (no signer check — permissionless)
 *   [1] pool_pda            writable
 *   [2] vault (pool vault)  writable   (destination; must equal pool.vault)
 *   [3] vault_auth          read-only  (signs the wrapper CPI via invoke_signed)
 *   [4] market (wrapper)    writable
 *   [5] wrapper_vault       writable   (source — wrapper insurance vault)
 *   [6] wrapper_vault_auth  read-only
 *   [7] token_program       read-only
 *   [8] percolator_program  read-only
 *
 * @param a Named accounts.
 * @returns Array of `{pubkey, isSigner, isWritable}` in program-expected order.
 */
export function recoverFlushedInsuranceAccounts(
  a: RecoverFlushedInsuranceAccounts,
): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] {
  return [
    { pubkey: a.caller,             isSigner: false, isWritable: false },
    { pubkey: a.poolPda,            isSigner: false, isWritable: true  },
    { pubkey: a.poolVault,          isSigner: false, isWritable: true  },
    { pubkey: a.vaultAuth,          isSigner: false, isWritable: false },
    { pubkey: a.wrapperMarket,      isSigner: false, isWritable: true  },
    { pubkey: a.wrapperVault,       isSigner: false, isWritable: true  },
    { pubkey: a.wrapperVaultAuth,   isSigner: false, isWritable: false },
    { pubkey: a.tokenProgram,       isSigner: false, isWritable: false },
    { pubkey: a.percolatorProgram,  isSigner: false, isWritable: false },
  ];
}

/** @deprecated Removed on-chain in stake v3. Throws instead of emitting a dead instruction. */
export function encodeStakeAdminSetInsurancePolicy(
  authority: PublicKey,
  minWithdrawBase: bigint | number,
  maxWithdrawBps: number,
  cooldownSlots: bigint | number,
): Uint8Array {
  void authority;
  void minWithdrawBase;
  void maxWithdrawBps;
  void cooldownSlots;
  return removedStakeInstruction('encodeStakeAdminSetInsurancePolicy', STAKE_IX.AdminSetInsurancePolicy);
}

// ═══════════════════════════════════════════════════════════════
// On-Chain State Layout — StakePool decoded fields
// ═══════════════════════════════════════════════════════════════

/**
 * Decoded StakePool state (384 bytes on-chain — stake v2).
 * v2 adds `pending_admin` ([u8;32]) at offset 288 for the two-step admin-rotation
 * primitive (ProposeAdmin tag 5 / AcceptAdmin tag 6). Struct grew 352 → 384.
 * Includes PERC-272 (fee yield), PERC-313 (HWM), and PERC-303 (tranches).
 *
 * ⚠️ KNOWN BYTE-ALIASING BUG in the ADOPTED percolator-stake lineage's
 * `_reserved` layout (verified against `state.rs` on
 * feat/adopt-stake-lineage-plus-n7@9ec1c3a — this is a real on-chain bug, not
 * an SDK bug; flagged upstream, not fixed here since this module only decodes
 * whatever bytes the program actually writes):
 *
 *   - PERC-313 HWM fields (`hwm_enabled` @[10], `hwm_floor_bps` @[11..13],
 *     `epoch_high_water_tvl` @[16..24], `hwm_last_epoch` @[24..32]) and the
 *     #242 cooldown-increase timelock fields (`pending_cooldown_slots`
 *     @[10..18], `cooldown_proposed_at_slot` @[18..26]) OVERLAP the SAME
 *     `_reserved` bytes [10..26]. `state.rs`'s own doc comment for the HWM
 *     block claims bytes [10..32] are HWM-only, but the timelock accessors
 *     (added later, #242) write into [10..18]/[18..26] regardless.
 *   - Practical effect: enabling HWM (`AdminSetHwmConfig`, tag 14) and using
 *     the cooldown-increase timelock (tags 7/8/9) on the SAME pool will
 *     corrupt each other's state — e.g. `hwm_floor_bps` (bytes [11..13]) sits
 *     inside `pending_cooldown_slots`'s u64 (bytes [10..18]), so committing a
 *     cooldown increase can silently rewrite the HWM floor, and vice versa.
 *   - This decoder reads both field sets as the raw bytes currently define
 *     them (matching on-chain reality); it does NOT attempt to reconcile or
 *     invalidate one set when the other is in use. Callers combining HWM and
 *     the cooldown timelock on one pool should treat both `hwm*` and
 *     `pendingCooldownSlots`/`cooldownProposedAtSlot` as UNRELIABLE and verify
 *     against a direct on-chain read before trusting either.
 */
export interface StakePoolState {
  isInitialized: boolean;
  bump: number;
  vaultAuthorityBump: number;
  adminTransferred: boolean;
  marketResolved: boolean;

  slab: PublicKey;
  admin: PublicKey;
  collateralMint: PublicKey;
  lpMint: PublicKey;
  vault: PublicKey;

  totalDeposited: bigint;
  totalLpSupply: bigint;
  cooldownSlots: bigint;
  depositCap: bigint;
  totalFlushed: bigint;
  totalReturned: bigint;
  totalWithdrawn: bigint;

  percolatorProgram: PublicKey;

  /**
   * Pending admin for the two-step rotation (stake v2, offset 288).
   * `null` when no proposal is outstanding (all-zero bytes on-chain).
   * Set by ProposeAdmin (tag 5); consumed by AcceptAdmin (tag 6).
   */
  pendingAdmin: PublicKey | null;

  // PERC-272: Fee yield fields
  totalFeesEarned: bigint;
  lastFeeAccrualSlot: bigint;
  lastVaultSnapshot: bigint;
  poolMode: number;

  // _reserved layout (64 bytes) — ADOPTED lineage (state.rs@9ec1c3a):
  // [0..8]   discriminator
  // [8]      version
  // [9]      market_resolved
  // [10..18] #242 pending_cooldown_slots (u64)   ⚠️ ALIASES hwm_enabled/hwm_floor_bps, see interface doc
  // [18..26] #242 cooldown_proposed_at_slot (u64) ⚠️ ALIASES epoch_high_water_tvl, see interface doc
  // [10]     PERC-313 hwm_enabled                 ⚠️ ALIASES pending_cooldown_slots's first byte
  // [11..13] PERC-313 hwm_floor_bps (u16)          ⚠️ ALIASES pending_cooldown_slots
  // [16..24] PERC-313 epoch_high_water_tvl (u64)   ⚠️ ALIASES cooldown_proposed_at_slot (partial)
  // [24..32] PERC-313 hwm_last_epoch (u64)
  // [32]     PERC-303 tranche_enabled
  // [33..41] PERC-303 junior_balance (u64)
  // [41..49] PERC-303 junior_total_lp (u64)
  // [49..51] PERC-303 junior_fee_mult_bps (u16)
  // [51..59] N-realized_junior_loss (u64) — issue #161
  // [59]     asset_admin_burned (BurnAssetAdmin tag 21 completion flag)
  // [60..64] free

  // PERC-313: HWM fields (from _reserved[10..32] — see aliasing warning above)
  hwmEnabled: boolean;
  epochHighWaterTvl: bigint;
  hwmFloorBps: number;
  hwmLastEpoch: bigint;

  // PERC-303: Tranche fields (from _reserved[32..51])
  trancheEnabled: boolean;
  juniorBalance: bigint;
  juniorTotalLp: bigint;
  juniorFeeMultBps: number;

  /**
   * #242 timelock: the `cooldown_slots` INCREASE awaiting commit (from
   * _reserved[10..18]). Meaningful only while `cooldownProposedAtSlot !== 0n`.
   * ⚠️ Aliases HWM bytes — see interface doc.
   */
  pendingCooldownSlots: bigint;
  /**
   * #242 timelock: the slot at which the pending cooldown increase was
   * proposed (from _reserved[18..26]). `0n` = no active proposal.
   * ⚠️ Aliases HWM bytes — see interface doc.
   */
  cooldownProposedAtSlot: bigint;
  /**
   * Cumulative insurance loss a fully-exited junior tranche permanently
   * REALIZED (issue #161), from _reserved[51..59]. Subtracted from
   * total_pool_value() so recovered tokens don't windfall senior.
   */
  realizedJuniorLoss: bigint;
  /**
   * Whether BurnAssetAdmin (tag 21) has completed for this pool's market
   * (from _reserved[59]). Once true, stake-side rotate escapes (tags 20/22)
   * stay disabled — the wrapper roles cannot be moved back to an
   * admin-controlled key.
   */
  assetAdminBurned: boolean;
}

/**
 * Size of StakePool on-chain (bytes) — v1 layout.
 * v1: 352 bytes = 288 bytes of fields + 64 bytes _reserved (no pending_admin field).
 * The _reserved block in v1 starts at offset 288; version byte = 1.
 *
 * LINEAGE NOTE: the ADOPTED percolator-stake lineage this module targets has
 * `CURRENT_VERSION = 2` unconditionally and is a "fresh-start cutover" (no
 * migration path — `state.rs@9ec1c3a` comment: "no v1 pools exist, so no
 * migration is needed"). v1/352-byte pools can only ever be observed as
 * LEGACY accounts from BEFORE the coordinated protocol-fee + stake-lineage
 * redeploy (which abandons every existing market/pool wholesale — VERSION
 * bump 16->17 on the wrapper fails closed on old accounts). This dual-length
 * detection exists purely to decode those pre-redeploy artifacts if you ever
 * need to; the ADOPTED program itself never creates a v1 pool.
 */
export const STAKE_POOL_SIZE_V1 = 352;

/**
 * Size of StakePool on-chain (bytes) — v2 layout (current, and the ONLY
 * layout the ADOPTED percolator-stake lineage ever creates).
 * v2: 384 (stake v1 was 352; `pending_admin: [u8;32]` added at offset 288).
 * The _reserved block in v2 starts at offset 320; version byte = 2.
 * Verified via `core::mem::size_of::<StakePool>()` field-by-field against
 * `percolator-stake/src/state.rs@9ec1c3a` — 384 bytes exactly, no compiler
 * padding (every u64 field lands on an 8-aligned cumulative offset).
 */
export const STAKE_POOL_SIZE = 384;
export const STAKE_POOL_DISCRIMINATOR = new Uint8Array([0x53, 0x50, 0x4f, 0x4f, 0x4c, 0x5f, 0x56, 0x31]);
export const STAKE_POOL_CURRENT_VERSION = 2;

/**
 * Decode a StakePool account from raw data buffer.
 *
 * Supports both v1 (352 bytes, no pending_admin, _reserved starts at 288) and
 * v2 (384 bytes, pending_admin at 288..320, _reserved starts at 320). The layout
 * version is detected from the data length before reading the discriminator.
 *
 * v1 support exists only to decode legacy pools created before the
 * coordinated protocol-fee + stake-lineage redeploy — see the
 * `STAKE_POOL_SIZE_V1` doc for why the ADOPTED program never creates new v1
 * pools. See the `StakePoolState` interface doc for a known HWM /
 * cooldown-timelock byte-aliasing bug this decoder faithfully surfaces
 * (not an SDK bug — a real on-chain `_reserved` layout collision).
 *
 * Uses DataView for all u64/u16 reads — browser-safe.
 */
export function decodeStakePool(data: Uint8Array): StakePoolState {
  const isV2 = data.length >= STAKE_POOL_SIZE;
  const isV1 = !isV2 && data.length >= STAKE_POOL_SIZE_V1;
  if (!isV2 && !isV1) {
    throw new Error(`StakePool data too short: ${data.length} < ${STAKE_POOL_SIZE_V1}`);
  }

  // _reserved block starts at 288 for v1, 320 for v2.
  const reservedOffset = isV2 ? 320 : 288;
  requireDiscriminator("StakePool", data, reservedOffset, STAKE_POOL_DISCRIMINATOR);
  const version = data[reservedOffset + 8];
  const expectedVersion = isV2 ? 2 : 1;
  if (version !== expectedVersion) {
    throw new Error(`StakePool unsupported version: ${version} !== ${expectedVersion}`);
  }

  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let off = 0;
  const isInitialized = bytes[off] === 1; off += 1;
  const bump = bytes[off]; off += 1;
  const vaultAuthorityBump = bytes[off]; off += 1;
  const adminTransferred = bytes[off] === 1; off += 1;
  off += 4; // _padding

  const slab = new PublicKey(bytes.subarray(off, off + 32)); off += 32;
  const admin = new PublicKey(bytes.subarray(off, off + 32)); off += 32;
  const collateralMint = new PublicKey(bytes.subarray(off, off + 32)); off += 32;
  const lpMint = new PublicKey(bytes.subarray(off, off + 32)); off += 32;
  const vault = new PublicKey(bytes.subarray(off, off + 32)); off += 32;

  const totalDeposited = readU64LE(bytes, off); off += 8;
  const totalLpSupply = readU64LE(bytes, off); off += 8;
  const cooldownSlots = readU64LE(bytes, off); off += 8;
  const depositCap = readU64LE(bytes, off); off += 8;
  const totalFlushed = readU64LE(bytes, off); off += 8;
  const totalReturned = readU64LE(bytes, off); off += 8;
  const totalWithdrawn = readU64LE(bytes, off); off += 8;

  const percolatorProgram = new PublicKey(bytes.subarray(off, off + 32)); off += 32;

  // PERC-272 fields (offset 256..288 in both v1 and v2)
  const totalFeesEarned = readU64LE(bytes, off); off += 8;
  const lastFeeAccrualSlot = readU64LE(bytes, off); off += 8;
  const lastVaultSnapshot = readU64LE(bytes, off); off += 8;
  const poolMode = bytes[off]; off += 1;
  off += 7; // _mode_padding  (off is now 288)

  // stake v2 only: pending_admin [u8;32] at offset 288 (ProposeAdmin/AcceptAdmin two-step rotation).
  // v1 has no pending_admin — the _reserved block begins immediately at offset 288.
  let pendingAdmin: PublicKey | null = null;
  if (isV2) {
    const pendingAdminBytes = bytes.subarray(off, off + 32); off += 32;
    pendingAdmin = pendingAdminBytes.every(b => b === 0)
      ? null
      : new PublicKey(pendingAdminBytes);
  }

  // _reserved (64 bytes): starts at 288 (v1) or 320 (v2)
  const reservedStart = off;
  // _reserved[8] = version (skipped)
  // _reserved[9] = market_resolved
  // PERC-313: _reserved[10] = hwm_enabled, [11..13] = hwm_floor_bps (u16),
  // [16..24] = epoch_high_water_tvl (u64), [24..32] = hwm_last_epoch (u64)
  const marketResolved = bytes[reservedStart + 9] === 1;
  const hwmEnabled = bytes[reservedStart + 10] === 1;
  const hwmFloorBps = readU16LE(bytes, reservedStart + 11);
  const epochHighWaterTvl = readU64LE(bytes, reservedStart + 16);
  const hwmLastEpoch = readU64LE(bytes, reservedStart + 24);

  // PERC-303: _reserved[32] = tranche_enabled, [33..41] = junior_balance, [41..49] = junior_total_lp, [49..51] = junior_fee_mult_bps
  const trancheEnabled = bytes[reservedStart + 32] === 1;
  const juniorBalance = readU64LE(bytes, reservedStart + 33);
  const juniorTotalLp = readU64LE(bytes, reservedStart + 41);
  const juniorFeeMultBps = readU16LE(bytes, reservedStart + 49);

  // #242 timelock: _reserved[10..18] = pending_cooldown_slots, [18..26] = cooldown_proposed_at_slot.
  // ⚠️ ALIASES the HWM fields above — see StakePoolState's doc comment.
  const pendingCooldownSlots = readU64LE(bytes, reservedStart + 10);
  const cooldownProposedAtSlot = readU64LE(bytes, reservedStart + 18);

  // N-realized_junior_loss (issue #161) at _reserved[51..59]; asset_admin_burned flag at [59].
  const realizedJuniorLoss = readU64LE(bytes, reservedStart + 51);
  const assetAdminBurned = bytes[reservedStart + 59] === 1;

  return {
    isInitialized,
    bump,
    vaultAuthorityBump,
    adminTransferred,
    marketResolved,
    slab,
    admin,
    collateralMint,
    lpMint,
    vault,
    totalDeposited,
    totalLpSupply,
    cooldownSlots,
    depositCap,
    totalFlushed,
    totalReturned,
    totalWithdrawn,
    percolatorProgram,
    pendingAdmin,
    totalFeesEarned,
    lastFeeAccrualSlot,
    lastVaultSnapshot,
    poolMode,
    hwmEnabled,
    epochHighWaterTvl,
    hwmFloorBps,
    hwmLastEpoch,
    trancheEnabled,
    juniorBalance,
    juniorTotalLp,
    juniorFeeMultBps,
    pendingCooldownSlots,
    cooldownProposedAtSlot,
    realizedJuniorLoss,
    assetAdminBurned,
  };
}

// ═══════════════════════════════════════════════════════════════
// StakeDeposit PDA decoder
// ═══════════════════════════════════════════════════════════════

/** Size of StakeDeposit on-chain (bytes). */
export const STAKE_DEPOSIT_SIZE = 152;
export const STAKE_DEPOSIT_DISCRIMINATOR = new Uint8Array([0x53, 0x44, 0x45, 0x50, 0x5f, 0x56, 0x31, 0x00]);
const STAKE_DEPOSIT_RESERVED_OFFSET = 88;

/** Decoded StakeDeposit PDA state. */
export interface StakeDepositState {
  isInitialized: boolean;
  bump: number;
  pool: PublicKey;
  user: PublicKey;
  lastDepositSlot: bigint;
  lpAmount: bigint;
}

/**
 * Decode a StakeDeposit PDA account from raw data.
 *
 * On-chain layout (152 bytes, percolator-stake/src/state.rs):
 *   [0]       is_initialized  u8
 *   [1]       bump            u8
 *   [2..8]    _padding
 *   [8..40]   pool            [u8; 32]
 *   [40..72]  user            [u8; 32]
 *   [72..80]  last_deposit_slot u64
 *   [80..88]  lp_amount       u64
 *   [88..152] _reserved
 */
export function decodeDepositPda(data: Uint8Array): StakeDepositState {
  if (data.length < STAKE_DEPOSIT_SIZE) {
    throw new Error(`StakeDeposit data too short: ${data.length} < ${STAKE_DEPOSIT_SIZE}`);
  }
  requireDiscriminator("StakeDeposit", data, STAKE_DEPOSIT_RESERVED_OFFSET, STAKE_DEPOSIT_DISCRIMINATOR);
  return {
    isInitialized: data[0] === 1,
    bump: data[1],
    pool: new PublicKey(data.subarray(8, 40)),
    user: new PublicKey(data.subarray(40, 72)),
    lastDepositSlot: readU64LE(data, 72),
    lpAmount: readU64LE(data, 80),
  };
}

// ═══════════════════════════════════════════════════════════════
// Account Specs (for building TransactionInstructions)
// ═══════════════════════════════════════════════════════════════

export interface StakeAccounts {
  /** InitPool accounts */
  initPool: {
    admin: PublicKey;
    slab: PublicKey;
    pool: PublicKey;
    lpMint: PublicKey;
    vault: PublicKey;
    vaultAuth: PublicKey;
    collateralMint: PublicKey;
    percolatorProgram: PublicKey;
  };
  /** Deposit accounts */
  deposit: {
    user: PublicKey;
    pool: PublicKey;
    userCollateralAta: PublicKey;
    vault: PublicKey;
    lpMint: PublicKey;
    userLpAta: PublicKey;
    vaultAuth: PublicKey;
    depositPda: PublicKey;
  };
  /** Withdraw accounts */
  withdraw: {
    user: PublicKey;
    pool: PublicKey;
    userLpAta: PublicKey;
    lpMint: PublicKey;
    vault: PublicKey;
    userCollateralAta: PublicKey;
    vaultAuth: PublicKey;
    depositPda: PublicKey;
  };
  /** FlushToInsurance accounts (CPI from stake → percolator) */
  flushToInsurance: {
    caller: PublicKey;
    pool: PublicKey;
    vault: PublicKey;
    vaultAuth: PublicKey;
    slab: PublicKey;
    wrapperVault: PublicKey;
    percolatorProgram: PublicKey;
  };
}

/**
 * Build account keys for InitPool instruction.
 * Returns array of {pubkey, isSigner, isWritable} in the order the program expects.
 *
 * @param a - Named accounts for the InitPool instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 */
export function initPoolAccounts(
  a: StakeAccounts['initPool'],
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID,
) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: true },
    { pubkey: a.slab, isSigner: false, isWritable: true },  // writable: InitPool CPIs UpdateAuthority which writes the slab
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.collateralMint, isSigner: false, isWritable: false },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];
}

/**
 * Build account keys for Deposit instruction.
 *
 * @param a - Named accounts for the Deposit instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 */
export function depositAccounts(
  a: StakeAccounts['deposit'],
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID,
) {
  return [
    { pubkey: a.user, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.userCollateralAta, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.userLpAta, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.depositPda, isSigner: false, isWritable: true },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
}

/**
 * Build account keys for Withdraw instruction.
 *
 * @param a - Named accounts for the Withdraw instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 */
export function withdrawAccounts(
  a: StakeAccounts['withdraw'],
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID,
) {
  return [
    { pubkey: a.user, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.userLpAta, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.userCollateralAta, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.depositPda, isSigner: false, isWritable: true },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
  ];
}

/**
 * Build account keys for FlushToInsurance instruction.
 *
 * @param a - Named accounts for the FlushToInsurance instruction.
 * @param tokenProgramId - Token program to use. Defaults to SPL Token. Pass
 *   `TOKEN_2022_PROGRAM_ID` for Token-2022 collateral mints.
 */
export function flushToInsuranceAccounts(
  a: StakeAccounts['flushToInsurance'],
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID,
) {
  return [
    { pubkey: a.caller, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVault, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
  ];
}
