/**
 * @module stake
 * Percolator Insurance LP Staking program — instruction encoders, PDA derivation, and account specs.
 *
 * Program: percolator-stake (dcccrypto/percolator-stake)
 * Deployed devnet:  6aJb1F9CDCVWCNYFwj8aQsVb696YnW6J1FznteHq4Q6k
 * Deployed mainnet: DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F
 */

import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { safeEnv } from '../config/program-ids.js';
import { concatBytes } from '../abi/encode.js';

// ═══════════════════════════════════════════════════════════════
// Program ID — network-conditional (mirrors program-ids.ts pattern)
// ═══════════════════════════════════════════════════════════════

/** Known stake program addresses per network. Mainnet is empty until deployed. */
export const STAKE_PROGRAM_IDS = {
  devnet: '6aJb1F9CDCVWCNYFwj8aQsVb696YnW6J1FznteHq4Q6k',
  mainnet: 'DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F',
} as const;

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
  const override = safeEnv('STAKE_PROGRAM_ID');
  if (override) {
    console.warn(
      `[percolator-sdk] STAKE_PROGRAM_ID env override active: ${override} — ensure this points to a trusted program`,
    );
    return new PublicKey(override);
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
// Instruction Tags (match src/instruction.rs)
// ═══════════════════════════════════════════════════════════════

export const STAKE_IX = {
  InitPool: 0,
  Deposit: 1,
  Withdraw: 2,
  FlushToInsurance: 3,
  UpdateConfig: 4,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  TransferAdmin: 5,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  AdminSetOracleAuthority: 6,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  AdminSetRiskThreshold: 7,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  AdminSetMaintenanceFee: 8,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  AdminResolveMarket: 9,
  /** Current on-chain tag 10: transfer withdrawn insurance back into the pool vault. */
  ReturnInsurance: 10,
  /** @deprecated Legacy alias for ReturnInsurance. */
  AdminWithdrawInsurance: 10,
  /** @deprecated Removed on-chain in stake v3. This tag now rejects. */
  AdminSetInsurancePolicy: 11,
  /** PERC-272: Accrue trading fees to LP vault */
  AccrueFees: 12,
  /** PERC-272: Init pool in trading LP mode */
  InitTradingPool: 13,
  /** PERC-313: Set HWM config (enable + floor bps) */
  AdminSetHwmConfig: 14,
  /** PERC-303: Enable/configure senior-junior LP tranches */
  AdminSetTrancheConfig: 15,
  /** PERC-303: Deposit into junior (first-loss) tranche */
  DepositJunior: 16,
  /** Mark the pool as resolved after the wrapper market has been resolved directly. */
  SetMarketResolved: 18,
} as const;

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

// ═══════════════════════════════════════════════════════════════
// Instruction Encoders
// ═══════════════════════════════════════════════════════════════

function u64Le(v: bigint | number): Uint8Array {
  const big = BigInt(v);
  if (big < 0n) throw new Error(`u64Le: value must be non-negative, got ${big}`);
  if (big > 0xFFFF_FFFF_FFFF_FFFFn) throw new Error(`u64Le: value exceeds u64 max`);
  const arr = new Uint8Array(8);
  new DataView(arr.buffer).setBigUint64(0, big, true);  return arr;
}

function u128Le(v: bigint | number): Uint8Array {
  const big = BigInt(v);
  if (big < 0n) throw new Error(`u128Le: value must be non-negative, got ${big}`);
  if (big > (1n << 128n) - 1n) throw new Error(`u128Le: value exceeds u128 max`);
  const arr = new Uint8Array(16);
  const view = new DataView(arr.buffer);  view.setBigUint64(0, big & 0xFFFFFFFFFFFFFFFFn, true);
  view.setBigUint64(8, big >> 64n, true);
  return arr;
}

function u16Le(v: number): Uint8Array {
  if (v < 0 || v > 0xFFFF) throw new Error(`u16Le: value out of u16 range (0..65535), got ${v}`);  const arr = new Uint8Array(2);  new DataView(arr.buffer).setUint16(0, v, true);
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

/** @deprecated Removed on-chain in stake v3. Throws instead of emitting a dead instruction. */
export function encodeStakeTransferAdmin(): Uint8Array {
  return removedStakeInstruction('encodeStakeTransferAdmin', STAKE_IX.TransferAdmin);
}

/** @deprecated Removed on-chain in stake v3. Throws instead of emitting a dead instruction. */
export function encodeStakeAdminSetOracleAuthority(newAuthority: PublicKey): Uint8Array {
  void newAuthority;
  return removedStakeInstruction('encodeStakeAdminSetOracleAuthority', STAKE_IX.AdminSetOracleAuthority);
}

/** @deprecated Removed on-chain in stake v3. Throws instead of emitting a dead instruction. */
export function encodeStakeAdminSetRiskThreshold(newThreshold: bigint | number): Uint8Array {
  void newThreshold;
  return removedStakeInstruction('encodeStakeAdminSetRiskThreshold', STAKE_IX.AdminSetRiskThreshold);
}

/** @deprecated Removed on-chain in stake v3. Throws instead of emitting a dead instruction. */
export function encodeStakeAdminSetMaintenanceFee(newFee: bigint | number): Uint8Array {
  void newFee;
  return removedStakeInstruction('encodeStakeAdminSetMaintenanceFee', STAKE_IX.AdminSetMaintenanceFee);
}

/** @deprecated Removed on-chain in stake v3. Throws instead of emitting a dead instruction. */
export function encodeStakeAdminResolveMarket(): Uint8Array {
  return removedStakeInstruction('encodeStakeAdminResolveMarket', STAKE_IX.AdminResolveMarket);
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

/** Tag 15 (PERC-303): AdminSetTrancheConfig — enable senior/junior LP tranches. */
export function encodeStakeAdminSetTrancheConfig(juniorFeeMultBps: number): Uint8Array {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminSetTrancheConfig]),
    u16Le(juniorFeeMultBps),
  );
}

/** Tag 16 (PERC-303): DepositJunior — deposit into first-loss junior tranche. */
export function encodeStakeDepositJunior(amount: bigint | number): Uint8Array {
  return concatBytes(new Uint8Array([STAKE_IX.DepositJunior]), u64Le(amount));
}

/** Tag 18: SetMarketResolved — blocks new deposits after the wrapper market is resolved. */
export function encodeStakeSetMarketResolved(): Uint8Array {
  return new Uint8Array([STAKE_IX.SetMarketResolved]);
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
 * Decoded StakePool state (352 bytes on-chain).
 * Includes PERC-272 (fee yield), PERC-313 (HWM), and PERC-303 (tranches).
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

  // PERC-272: Fee yield fields
  totalFeesEarned: bigint;
  lastFeeAccrualSlot: bigint;
  lastVaultSnapshot: bigint;
  poolMode: number;

  // _reserved layout (64 bytes):
  // [0..8]   discriminator
  // [8]      version
  // [9]      market_resolved
  // [10..32] PERC-313 HWM
  // [32..51] PERC-303 tranches
  // [51..64] free

  // PERC-313: HWM fields (from _reserved[10..32])
  hwmEnabled: boolean;
  epochHighWaterTvl: bigint;
  hwmFloorBps: number;
  hwmLastEpoch: bigint;

  // PERC-303: Tranche fields (from _reserved[32..51])
  trancheEnabled: boolean;
  juniorBalance: bigint;
  juniorTotalLp: bigint;
  juniorFeeMultBps: number;
}

/** Size of StakePool on-chain (bytes). */
export const STAKE_POOL_SIZE = 352;

/**
 * Decode a StakePool account from raw data buffer. * Uses DataView for all u64/u16 reads — browser-safe.
 */
export function decodeStakePool(data: Uint8Array): StakePoolState {
  if (data.length < STAKE_POOL_SIZE) {
    throw new Error(`StakePool data too short: ${data.length} < ${STAKE_POOL_SIZE}`);
  }
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);  let off = 0;
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

  // PERC-272 fields
  const totalFeesEarned = readU64LE(bytes, off); off += 8;
  const lastFeeAccrualSlot = readU64LE(bytes, off); off += 8;
  const lastVaultSnapshot = readU64LE(bytes, off); off += 8;
  const poolMode = bytes[off]; off += 1;
  off += 7; // _mode_padding

  // _reserved (64 bytes) starts at off
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
  };
}

// ═══════════════════════════════════════════════════════════════
// StakeDeposit PDA decoder
// ═══════════════════════════════════════════════════════════════

/** Size of StakeDeposit on-chain (bytes). */
export const STAKE_DEPOSIT_SIZE = 152;

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
 */
export function initPoolAccounts(a: StakeAccounts['initPool']) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: true },
    { pubkey: a.slab, isSigner: false, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.collateralMint, isSigner: false, isWritable: false },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];
}

/**
 * Build account keys for Deposit instruction.
 */
export function depositAccounts(a: StakeAccounts['deposit']) {
  return [
    { pubkey: a.user, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.userCollateralAta, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.userLpAta, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.depositPda, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
}

/**
 * Build account keys for Withdraw instruction.
 */
export function withdrawAccounts(a: StakeAccounts['withdraw']) {
  return [
    { pubkey: a.user, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.userLpAta, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.userCollateralAta, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.depositPda, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
  ];
}

/**
 * Build account keys for FlushToInsurance instruction.
 */
export function flushToInsuranceAccounts(a: StakeAccounts['flushToInsurance']) {
  return [
    { pubkey: a.caller, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVault, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
}
