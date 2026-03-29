import { PublicKey } from "@solana/web3.js";
import {
  encU8,
  encU16,
  encU32,
  encU64,
  encI64,
  encU128,
  encI128,
  encPubkey,
  concatBytes,
} from "./encode.js";

/**
 * Instruction tags - exact match to Rust ix::Instruction::decode
 */
export const IX_TAG = {
  InitMarket: 0,
  InitUser: 1,
  InitLP: 2,
  DepositCollateral: 3,
  WithdrawCollateral: 4,
  KeeperCrank: 5,
  TradeNoCpi: 6,
  LiquidateAtOracle: 7,
  CloseAccount: 8,
  TopUpInsurance: 9,
  TradeCpi: 10,
  SetRiskThreshold: 11,
  UpdateAdmin: 12,
  CloseSlab: 13,
  UpdateConfig: 14,
  SetMaintenanceFee: 15,
  SetOracleAuthority: 16,
  PushOraclePrice: 17,
  SetOraclePriceCap: 18,
  ResolveMarket: 19,
  WithdrawInsurance: 20,
  AdminForceClose: 21,
  UpdateRiskParams: 22,
  RenounceAdmin: 23,
  CreateInsuranceMint: 24,
  DepositInsuranceLP: 25,
  WithdrawInsuranceLP: 26,
  PauseMarket: 27,
  UnpauseMarket: 28,
  AcceptAdmin: 29,
  SetInsuranceWithdrawPolicy: 30,
  WithdrawInsuranceLimited: 31,
  SetPythOracle: 32,
  UpdateMarkPrice: 33,
  UpdateHyperpMark: 34,
  TradeCpiV2: 35,
  UnresolveMarket: 36,
  CreateLpVault: 37,
  LpVaultDeposit: 38,
  LpVaultWithdraw: 39,
  LpVaultCrankFees: 40,
  /** PERC-306: Fund per-market isolated insurance balance */
  FundMarketInsurance: 41,
  /** PERC-306: Set insurance isolation BPS for a market */
  SetInsuranceIsolation: 42,
  // Tag 43 is ChallengeSettlement on-chain (PERC-314).
  // PERC-305 (ExecuteAdl) is NOT implemented on-chain — do NOT assign tag 43 here.
  // When PERC-305 is implemented, assign a new unused tag (≥47).
  /** PERC-314: Challenge settlement price during dispute window */
  ChallengeSettlement: 43,
  /** PERC-314: Resolve dispute (admin adjudication) */
  ResolveDispute: 44,
  /** PERC-315: Deposit LP vault tokens as perp collateral */
  DepositLpCollateral: 45,
  /** PERC-315: Withdraw LP collateral (position must be closed) */
  WithdrawLpCollateral: 46,
  // Tags 47-53 reserved
  /** Cross-Market Portfolio Margining: SetOffsetPair */
  SetOffsetPair: 54,
  /** Cross-Market Portfolio Margining: AttestCrossMargin */
  AttestCrossMargin: 55,
  /** PERC-622: Advance oracle phase (permissionless crank) */
  AdvanceOraclePhase: 56,
  /** PERC-623: Top up a market's keeper fund (permissionless) */
  TopUpKeeperFund: 57,
  /** PERC-629: Slash a market creator's deposit (permissionless) */
  SlashCreationDeposit: 58,
  /** PERC-628: Initialize the global shared vault (admin) */
  InitSharedVault: 59,
  /** PERC-628: Allocate virtual liquidity to a market (admin) */
  AllocateMarket: 60,
  /** PERC-628: Queue a withdrawal for the current epoch */
  QueueWithdrawalSV: 61,
  /** PERC-628: Claim a queued withdrawal after epoch elapses */
  ClaimEpochWithdrawal: 62,
  /** PERC-628: Advance the shared vault epoch (permissionless crank) */
  AdvanceEpoch: 63,
  /** PERC-608: Mint a Position NFT for a user's open position. */
  MintPositionNft: 64,
  /** PERC-608: Transfer position ownership via the NFT (keeper-gated). */
  TransferPositionOwnership: 65,
  /** PERC-608: Burn the Position NFT when a position is closed. */
  BurnPositionNft: 66,
  /** PERC-608: Keeper sets pending_settlement flag before a funding transfer. */
  SetPendingSettlement: 67,
  /** PERC-608: Keeper clears pending_settlement flag after KeeperCrank. */
  ClearPendingSettlement: 68,
  /** PERC-608: Internal CPI call from percolator-nft TransferHook to update on-chain owner. */
  TransferOwnershipCpi: 69,
  /** PERC-8111: Set per-wallet position cap (admin only, cap_e6=0 disables). */
  SetWalletCap: 70,
  /** PERC-8110: Set OI imbalance hard-block threshold (admin only). */
  SetOiImbalanceHardBlock: 71,
} as const;

/**
 * InitMarket instruction data (256 bytes total)
 * Layout: tag(1) + admin(32) + mint(32) + indexFeedId(32) +
 *         maxStaleSecs(8) + confFilter(2) + invert(1) + unitScale(4) +
 *         RiskParams(144)
 *
 * Note: indexFeedId is the Pyth Pull feed ID (32 bytes hex), NOT an oracle pubkey.
 * The program validates PriceUpdateV2 accounts against this feed ID at runtime.
 */
export interface InitMarketArgs {
  admin: PublicKey | string;
  collateralMint: PublicKey | string;
  indexFeedId: string;           // Pyth feed ID (hex string, 64 chars without 0x prefix). All zeros = Hyperp mode.
  maxStalenessSecs: bigint | string;  // Max staleness in SECONDS (Pyth Pull uses unix timestamps)
  confFilterBps: number;
  invert: number;              // 0 = no inversion, 1 = invert oracle price (USD/SOL -> SOL/USD)
  unitScale: number;           // Lamports per unit (0 = no scaling, e.g. 1000 = 1 SOL = 1,000,000 units)
  initialMarkPriceE6: bigint | string;  // Initial mark price (required non-zero for Hyperp mode)
  warmupPeriodSlots: bigint | string;
  maintenanceMarginBps: bigint | string;
  initialMarginBps: bigint | string;
  tradingFeeBps: bigint | string;
  maxAccounts: bigint | string;
  newAccountFee: bigint | string;
  riskReductionThreshold: bigint | string;
  maintenanceFeePerSlot: bigint | string;
  maxCrankStalenessSlots: bigint | string;
  liquidationFeeBps: bigint | string;
  liquidationFeeCap: bigint | string;
  liquidationBufferBps: bigint | string;
  minLiquidationAbs: bigint | string;
}

/**
 * Encode a Pyth feed ID (hex string) to 32-byte Uint8Array.
 */
function encodeFeedId(feedId: string): Uint8Array {
  // Remove 0x prefix if present
  const hex = feedId.startsWith("0x") ? feedId.slice(2) : feedId;
  if (hex.length !== 64) {
    throw new Error(`Invalid feed ID length: expected 64 hex chars, got ${hex.length}`);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 64; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function encodeInitMarket(args: InitMarketArgs): Uint8Array {
  // Layout: tag(1) + admin(32) + mint(32) + index_feed_id(32) + max_staleness_secs(8) +
  //         conf_filter_bps(2) + invert(1) + unit_scale(4) + initial_mark_price_e6(8) + RiskParams(...)
  // Note: _reserved field is only in MarketConfig on-chain, not in instruction data
  return concatBytes(
    encU8(IX_TAG.InitMarket),
    encPubkey(args.admin),
    encPubkey(args.collateralMint),
    encodeFeedId(args.indexFeedId),   // index_feed_id (32 bytes) - all zeros for Hyperp mode
    encU64(args.maxStalenessSecs),    // max_staleness_secs (Pyth Pull uses unix timestamps)
    encU16(args.confFilterBps),
    encU8(args.invert),
    encU32(args.unitScale),
    encU64(args.initialMarkPriceE6),  // initial_mark_price_e6 (required non-zero for Hyperp)
    encU64(args.warmupPeriodSlots),
    encU64(args.maintenanceMarginBps),
    encU64(args.initialMarginBps),
    encU64(args.tradingFeeBps),
    encU64(args.maxAccounts),
    encU128(args.newAccountFee),
    encU128(args.riskReductionThreshold),
    encU128(args.maintenanceFeePerSlot),
    encU64(args.maxCrankStalenessSlots),
    encU64(args.liquidationFeeBps),
    encU128(args.liquidationFeeCap),
    encU64(args.liquidationBufferBps),
    encU128(args.minLiquidationAbs),
  );
}

/**
 * InitUser instruction data (9 bytes)
 */
export interface InitUserArgs {
  feePayment: bigint | string;
}

export function encodeInitUser(args: InitUserArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.InitUser), encU64(args.feePayment));
}

/**
 * InitLP instruction data (73 bytes)
 */
export interface InitLPArgs {
  matcherProgram: PublicKey | string;
  matcherContext: PublicKey | string;
  feePayment: bigint | string;
}

export function encodeInitLP(args: InitLPArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.InitLP),
    encPubkey(args.matcherProgram),
    encPubkey(args.matcherContext),
    encU64(args.feePayment),
  );
}

/**
 * DepositCollateral instruction data (11 bytes)
 */
export interface DepositCollateralArgs {
  userIdx: number;
  amount: bigint | string;
}

export function encodeDepositCollateral(args: DepositCollateralArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.DepositCollateral),
    encU16(args.userIdx),
    encU64(args.amount),
  );
}

/**
 * WithdrawCollateral instruction data (11 bytes)
 */
export interface WithdrawCollateralArgs {
  userIdx: number;
  amount: bigint | string;
}

export function encodeWithdrawCollateral(args: WithdrawCollateralArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.WithdrawCollateral),
    encU16(args.userIdx),
    encU64(args.amount),
  );
}

/**
 * KeeperCrank instruction data (4 bytes)
 * Funding rate is computed on-chain from LP inventory.
 */
export interface KeeperCrankArgs {
  callerIdx: number;
  allowPanic: boolean;
}

export function encodeKeeperCrank(args: KeeperCrankArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.KeeperCrank),
    encU16(args.callerIdx),
    encU8(args.allowPanic ? 1 : 0),
  );
}

/**
 * TradeNoCpi instruction data (21 bytes)
 */
export interface TradeNoCpiArgs {
  lpIdx: number;
  userIdx: number;
  size: bigint | string;
}

export function encodeTradeNoCpi(args: TradeNoCpiArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.TradeNoCpi),
    encU16(args.lpIdx),
    encU16(args.userIdx),
    encI128(args.size),
  );
}

/**
 * LiquidateAtOracle instruction data (3 bytes)
 */
export interface LiquidateAtOracleArgs {
  targetIdx: number;
}

export function encodeLiquidateAtOracle(args: LiquidateAtOracleArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.LiquidateAtOracle),
    encU16(args.targetIdx),
  );
}

/**
 * CloseAccount instruction data (3 bytes)
 */
export interface CloseAccountArgs {
  userIdx: number;
}

export function encodeCloseAccount(args: CloseAccountArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.CloseAccount), encU16(args.userIdx));
}

/**
 * TopUpInsurance instruction data (9 bytes)
 */
export interface TopUpInsuranceArgs {
  amount: bigint | string;
}

export function encodeTopUpInsurance(args: TopUpInsuranceArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.TopUpInsurance), encU64(args.amount));
}

/**
 * TradeCpi instruction data (21 bytes)
 */
export interface TradeCpiArgs {
  lpIdx: number;
  userIdx: number;
  size: bigint | string;
}

export function encodeTradeCpi(args: TradeCpiArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.TradeCpi),
    encU16(args.lpIdx),
    encU16(args.userIdx),
    encI128(args.size),
  );
}

/**
 * TradeCpiV2 instruction data (22 bytes) — PERC-154 optimized trade CPI.
 *
 * Same as TradeCpi but includes a caller-provided PDA bump byte.
 * Uses create_program_address instead of find_program_address,
 * saving ~1500 CU per trade. The bump should be obtained once via
 * deriveLpPda() and cached for the lifetime of the market.
 */
export interface TradeCpiV2Args {
  lpIdx: number;
  userIdx: number;
  size: bigint | string;
  bump: number;
}

export function encodeTradeCpiV2(args: TradeCpiV2Args): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.TradeCpiV2),
    encU16(args.lpIdx),
    encU16(args.userIdx),
    encI128(args.size),
    encU8(args.bump),
  );
}

/**
 * SetRiskThreshold instruction data (17 bytes)
 */
export interface SetRiskThresholdArgs {
  newThreshold: bigint | string;
}

export function encodeSetRiskThreshold(args: SetRiskThresholdArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.SetRiskThreshold),
    encU128(args.newThreshold),
  );
}

/**
 * UpdateAdmin instruction data (33 bytes)
 */
export interface UpdateAdminArgs {
  newAdmin: PublicKey | string;
}

export function encodeUpdateAdmin(args: UpdateAdminArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.UpdateAdmin), encPubkey(args.newAdmin));
}

/**
 * CloseSlab instruction data (1 byte)
 */
export function encodeCloseSlab(): Uint8Array {
  return encU8(IX_TAG.CloseSlab);
}

/**
 * UpdateConfig instruction data
 * Updates funding and threshold parameters at runtime (admin only)
 */
export interface UpdateConfigArgs {
  // Funding parameters
  fundingHorizonSlots: bigint | string;
  fundingKBps: bigint | string;
  fundingInvScaleNotionalE6: bigint | string;
  fundingMaxPremiumBps: bigint | string;
  fundingMaxBpsPerSlot: bigint | string;
  // Threshold parameters
  threshFloor: bigint | string;
  threshRiskBps: bigint | string;
  threshUpdateIntervalSlots: bigint | string;
  threshStepBps: bigint | string;
  threshAlphaBps: bigint | string;
  threshMin: bigint | string;
  threshMax: bigint | string;
  threshMinStep: bigint | string;
}

export function encodeUpdateConfig(args: UpdateConfigArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.UpdateConfig),
    encU64(args.fundingHorizonSlots),
    encU64(args.fundingKBps),
    encU128(args.fundingInvScaleNotionalE6),
    encI64(args.fundingMaxPremiumBps),  // Rust: i64 (can be negative)
    encI64(args.fundingMaxBpsPerSlot),  // Rust: i64 (can be negative)
    encU128(args.threshFloor),
    encU64(args.threshRiskBps),
    encU64(args.threshUpdateIntervalSlots),
    encU64(args.threshStepBps),
    encU64(args.threshAlphaBps),
    encU128(args.threshMin),
    encU128(args.threshMax),
    encU128(args.threshMinStep),
  );
}

/**
 * SetMaintenanceFee instruction data (17 bytes)
 */
export interface SetMaintenanceFeeArgs {
  newFee: bigint | string;
}

export function encodeSetMaintenanceFee(args: SetMaintenanceFeeArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.SetMaintenanceFee),
    encU128(args.newFee),
  );
}

/**
 * SetOracleAuthority instruction data (33 bytes)
 * Sets the oracle price authority. Pass zero pubkey to disable and require Pyth/Chainlink.
 */
export interface SetOracleAuthorityArgs {
  newAuthority: PublicKey | string;
}

export function encodeSetOracleAuthority(args: SetOracleAuthorityArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.SetOracleAuthority),
    encPubkey(args.newAuthority),
  );
}

/**
 * PushOraclePrice instruction data (17 bytes)
 * Push a new oracle price (oracle authority only).
 * The price should be in e6 format and already include any inversion/scaling.
 */
export interface PushOraclePriceArgs {
  priceE6: bigint | string;
  timestamp: bigint | string;
}

export function encodePushOraclePrice(args: PushOraclePriceArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.PushOraclePrice),
    encU64(args.priceE6),
    encI64(args.timestamp),
  );
}

/**
 * SetOraclePriceCap instruction data (9 bytes)
 * Set oracle price circuit breaker cap (admin only).
 * max_change_e2bps in 0.01 bps units (1_000_000 = 100%). 0 = disabled.
 */
export interface SetOraclePriceCapArgs {
  maxChangeE2bps: bigint | string;
}

export function encodeSetOraclePriceCap(args: SetOraclePriceCapArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.SetOraclePriceCap),
    encU64(args.maxChangeE2bps),
  );
}

/**
 * ResolveMarket instruction data (1 byte)
 * Resolves a binary/premarket - sets RESOLVED flag, positions force-closed via crank.
 * Requires admin oracle price (authority_price_e6) to be set first.
 */
export function encodeResolveMarket(): Uint8Array {
  return encU8(IX_TAG.ResolveMarket);
}

/**
 * WithdrawInsurance instruction data (1 byte)
 * Withdraw insurance fund to admin (requires RESOLVED and all positions closed).
 */
export function encodeWithdrawInsurance(): Uint8Array {
  return encU8(IX_TAG.WithdrawInsurance);
}

/**
 * AdminForceClose instruction data (3 bytes)
 * Force-close any position at oracle price (admin only, skips margin checks).
 */
export interface AdminForceCloseArgs {
  targetIdx: number;
}

export function encodeAdminForceClose(args: AdminForceCloseArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.AdminForceClose),
    encU16(args.targetIdx),
  );
}

/**
 * UpdateRiskParams instruction data (17 or 25 bytes)
 * Update initial and maintenance margin BPS (admin only).
 *
 * R2-S13: The Rust program uses `data.len() >= 25` to detect the optional
 * tradingFeeBps field, so variable-length encoding is safe. When tradingFeeBps
 * is omitted, the data is 17 bytes (tag + 2×u64). When included, 25 bytes.
 */
export interface UpdateRiskParamsArgs {
  initialMarginBps: bigint | string;
  maintenanceMarginBps: bigint | string;
  tradingFeeBps?: bigint | string;
}

export function encodeUpdateRiskParams(args: UpdateRiskParamsArgs): Uint8Array {
  const parts = [
    encU8(IX_TAG.UpdateRiskParams),
    encU64(args.initialMarginBps),
    encU64(args.maintenanceMarginBps),
  ];
  if (args.tradingFeeBps !== undefined) {
    parts.push(encU64(args.tradingFeeBps));
  }
  return concatBytes(...parts);
}

/**
 * RenounceAdmin instruction data (1 byte)
 * Irreversibly set admin to all zeros. After this, all admin-only instructions fail.
 */
export function encodeRenounceAdmin(): Uint8Array {
  return encU8(IX_TAG.RenounceAdmin);
}

/**
 * CreateInsuranceMint instruction data (1 byte)
 * Creates the SPL mint PDA for insurance LP tokens. Admin only, once per market.
 */
export function encodeCreateInsuranceMint(): Uint8Array {
  return encU8(IX_TAG.CreateInsuranceMint);
}

/**
 * DepositInsuranceLP instruction data (9 bytes)
 * Deposit collateral into insurance fund, receive LP tokens proportional to share.
 */
export interface DepositInsuranceLPArgs {
  amount: bigint | string;
}

export function encodeDepositInsuranceLP(args: DepositInsuranceLPArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.DepositInsuranceLP), encU64(args.amount));
}

/**
 * WithdrawInsuranceLP instruction data (9 bytes)
 * Burn LP tokens and withdraw proportional share of insurance fund.
 */
export interface WithdrawInsuranceLPArgs {
  lpAmount: bigint | string;
}

export function encodeWithdrawInsuranceLP(args: WithdrawInsuranceLPArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.WithdrawInsuranceLP), encU64(args.lpAmount));
}

/**
 * PauseMarket instruction data (1 byte)
 * Pauses the market — disables trading, deposits, and withdrawals.
 */
export function encodePauseMarket(): Uint8Array {
  return encU8(IX_TAG.PauseMarket);
}

/**
 * UnpauseMarket instruction data (1 byte)
 * Unpauses the market — re-enables trading, deposits, and withdrawals.
 */
export function encodeUnpauseMarket(): Uint8Array {
  return encU8(IX_TAG.UnpauseMarket);
}

// ============================================================================
// PERC-117: Pyth Oracle CPI Instructions
// ============================================================================

/**
 * SetPythOracle (Tag 32) — switch a market to Pyth-pinned mode.
 *
 * After this instruction:
 * - oracle_authority is cleared → PushOraclePrice is disabled
 * - index_feed_id is set to feed_id → validated on every price read
 * - max_staleness_secs and conf_filter_bps are updated
 * - All price reads go directly to read_pyth_price_e6() with on-chain
 *   staleness + confidence + feed-ID validation (no silent fallback)
 *
 * Instruction data: tag(1) + feed_id(32) + max_staleness_secs(8) + conf_filter_bps(2) = 43 bytes
 *
 * Accounts:
 *   0. [signer, writable] Admin
 *   1. [writable]         Slab
 */
export interface SetPythOracleArgs {
  /** 32-byte Pyth feed ID. All zeros is invalid (reserved for Hyperp mode). */
  feedId: Uint8Array;
  /** Maximum age of Pyth price in seconds before OracleStale is returned. Must be > 0. */
  maxStalenessSecs: bigint;
  /** Max confidence/price ratio in bps (0 = no confidence check). */
  confFilterBps: number;
}

export function encodeSetPythOracle(args: SetPythOracleArgs): Uint8Array {
  if (args.feedId.length !== 32) throw new Error('feedId must be 32 bytes');
  if (args.maxStalenessSecs <= 0n) throw new Error('maxStalenessSecs must be > 0');

  const buf = new Uint8Array(43);
  const dv = new DataView(buf.buffer);

  // Tag 32 (SetPythOracle)
  buf[0] = 32;
  buf.set(args.feedId, 1);
  dv.setBigUint64(33, args.maxStalenessSecs, /* little-endian */ true);
  dv.setUint16(41, args.confFilterBps, true);

  return buf;
}

/**
 * Derive the expected Pyth PriceUpdateV2 account address for a given feed ID.
 * Uses PDA seeds: [shard_id(2), feed_id(32)] under the Pyth Receiver program.
 *
 * @param feedId  32-byte Pyth feed ID
 * @param shardId Shard index (default 0 for mainnet/devnet)
 */
export const PYTH_RECEIVER_PROGRAM_ID = 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ';

export async function derivePythPriceUpdateAccount(
  feedId: Uint8Array,
  shardId = 0,
): Promise<string> {
  const { PublicKey } = await import('@solana/web3.js');
  const shardBuf = new Uint8Array(2);
  new DataView(shardBuf.buffer).setUint16(0, shardId, true);
  const [pda] = PublicKey.findProgramAddressSync(
    [shardBuf, feedId],
    new PublicKey(PYTH_RECEIVER_PROGRAM_ID),
  );
  return pda.toBase58();
}

// Add SetPythOracle to the tag registry
(IX_TAG as Record<string, number>)['SetPythOracle'] = 32;

// PERC-118: Mark Price EMA Instructions
// ============================================================================

// Tag 33 — permissionless mark price EMA crank
(IX_TAG as Record<string, number>)['UpdateMarkPrice'] = 33;

/**
 * UpdateMarkPrice (Tag 33) — permissionless EMA mark price crank.
 *
 * Reads the current oracle price on-chain, applies 8-hour EMA smoothing
 * with circuit breaker, and writes result to authority_price_e6.
 *
 * Instruction data: 1 byte (tag only — all params read from on-chain state)
 *
 * Accounts:
 *   0. [writable] Slab
 *   1. []         Oracle account (Pyth PriceUpdateV2 / Chainlink / DEX AMM)
 *   2. []         Clock sysvar (SysvarC1ock11111111111111111111111111111111)
 *   3..N []       Remaining accounts (PumpSwap vaults, etc. if needed)
 */
export function encodeUpdateMarkPrice(): Uint8Array {
  return new Uint8Array([33]);
}

/**
 * Mark price EMA parameters (must match program/src/percolator.rs constants).
 */
export const MARK_PRICE_EMA_WINDOW_SLOTS = 72_000n;
export const MARK_PRICE_EMA_ALPHA_E6 = 2_000_000n / (MARK_PRICE_EMA_WINDOW_SLOTS + 1n);

/**
 * Compute the next EMA mark price step (TypeScript mirror of the on-chain function).
 */
export function computeEmaMarkPrice(
  markPrevE6: bigint,
  oracleE6: bigint,
  dtSlots: bigint,
  alphaE6 = MARK_PRICE_EMA_ALPHA_E6,
  capE2bps = 0n,
): bigint {
  if (oracleE6 === 0n) return markPrevE6;
  if (markPrevE6 === 0n || dtSlots === 0n) return oracleE6;

  let oracleClamped = oracleE6;
  if (capE2bps > 0n) {
    const maxDelta = (markPrevE6 * capE2bps * dtSlots) / 1_000_000n;
    const lo = markPrevE6 > maxDelta ? markPrevE6 - maxDelta : 0n;
    const hi = markPrevE6 + maxDelta;
    if (oracleClamped < lo) oracleClamped = lo;
    if (oracleClamped > hi) oracleClamped = hi;
  }

  const effectiveAlpha = alphaE6 * dtSlots > 1_000_000n ? 1_000_000n : alphaE6 * dtSlots;
  const oneMinusAlpha = 1_000_000n - effectiveAlpha;

  return (oracleClamped * effectiveAlpha + markPrevE6 * oneMinusAlpha) / 1_000_000n;
}

// PERC-119: Hyperp EMA Oracle for Permissionless Tokens
// ============================================================================

// Tag 34 — permissionless Hyperp mark price oracle (reads DEX AMM pool)
(IX_TAG as Record<string, number>)['UpdateHyperpMark'] = 34;

/**
 * UpdateHyperpMark (Tag 34) — permissionless Hyperp EMA oracle crank.
 *
 * Reads the spot price from a PumpSwap, Raydium CLMM, or Meteora DLMM pool,
 * applies 8-hour EMA smoothing with circuit breaker, and writes the new mark
 * to authority_price_e6 on the slab.
 *
 * This is the core mechanism for permissionless token markets — no Pyth or
 * Chainlink feed is needed. The DEX AMM IS the oracle.
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [writable] Slab
 *   1. []         DEX pool account (PumpSwap / Raydium CLMM / Meteora DLMM)
 *   2. []         Clock sysvar (SysvarC1ock11111111111111111111111111111111)
 *   3..N []       Remaining accounts (e.g. PumpSwap vault0 + vault1)
 */
export function encodeUpdateHyperpMark(): Uint8Array {
  return new Uint8Array([34]);
}

// ============================================================================
// PERC-306: Per-Market Insurance Isolation
// ============================================================================

/**
 * Fund per-market isolated insurance balance.
 * Accounts: [admin(signer,writable), slab(writable), admin_ata(writable), vault(writable), token_program]
 */
export function encodeFundMarketInsurance(args: { amount: bigint }): Uint8Array {
  return concatBytes(encU8(IX_TAG.FundMarketInsurance), encU64(args.amount));
}

/**
 * Set insurance isolation BPS for a market.
 * Accounts: [admin(signer), slab(writable)]
 */
export function encodeSetInsuranceIsolation(args: { bps: number }): Uint8Array {
  return concatBytes(encU8(IX_TAG.SetInsuranceIsolation), encU16(args.bps));
}

// ============================================================================
// PERC-305: Partial Auto-Deleveraging — NOT YET IMPLEMENTED ON-CHAIN
// ============================================================================
// encodeExecuteAdl() has been REMOVED. The on-chain program does NOT have an
// ExecuteAdl instruction. Tag 43 is ChallengeSettlement (PERC-314).
// Calling the old encodeExecuteAdl() would have invoked ChallengeSettlement
// with a garbled data layout — a critical security vulnerability (PERC-319).
//
// When PERC-305 is implemented on-chain, add the encoder here with a new
// unused tag (≥47). See tags.rs for the single source of truth.
// ============================================================================

// ============================================================================
// SMART PRICE ROUTER — quote computation for LP selection
// ============================================================================

/**
 * Parsed vAMM matcher parameters (from on-chain matcher context account)
 */
export interface VammMatcherParams {
  mode: number;                    // 0 = Passive, 1 = vAMM
  tradingFeeBps: number;
  baseSpreadBps: number;
  maxTotalBps: number;
  impactKBps: number;
  liquidityNotionalE6: bigint;
}

/** Magic bytes identifying a vAMM matcher context: "PERCMATC" as u64 LE */
export const VAMM_MAGIC = 0x5045_5243_4d41_5443n;

/** Offset into matcher context where vAMM params start */
export const CTX_VAMM_OFFSET = 64;

const BPS_DENOM = 10_000n;

/**
 * Compute execution price for a given LP quote.
 * For buys (isLong=true): price above oracle.
 * For sells (isLong=false): price below oracle.
 */
export function computeVammQuote(
  params: VammMatcherParams,
  oraclePriceE6: bigint,
  tradeSize: bigint,
  isLong: boolean,
): bigint {
  const absSize = tradeSize < 0n ? -tradeSize : tradeSize;
  const absNotionalE6 = (absSize * oraclePriceE6) / 1_000_000n;

  // Impact for vAMM mode
  let impactBps = 0n;
  if (params.mode === 1 && params.liquidityNotionalE6 > 0n) {
    impactBps = (absNotionalE6 * BigInt(params.impactKBps)) / params.liquidityNotionalE6;
  }

  // Total = base_spread + trading_fee + impact, capped at max_total
  const maxTotal = BigInt(params.maxTotalBps);
  const baseFee = BigInt(params.baseSpreadBps) + BigInt(params.tradingFeeBps);
  const maxImpact = maxTotal > baseFee ? maxTotal - baseFee : 0n;
  const clampedImpact = impactBps < maxImpact ? impactBps : maxImpact;
  let totalBps = baseFee + clampedImpact;
  if (totalBps > maxTotal) totalBps = maxTotal;

  if (isLong) {
    return (oraclePriceE6 * (BPS_DENOM + totalBps)) / BPS_DENOM;
  } else {
    // Prevent underflow: if totalBps >= BPS_DENOM, price would go negative
    if (totalBps >= BPS_DENOM) return 1n; // minimum 1 micro-dollar
    return (oraclePriceE6 * (BPS_DENOM - totalBps)) / BPS_DENOM;
  }
}

// ============================================================================
// PERC-622: AdvanceOraclePhase (permissionless crank)
// ============================================================================

/**
 * AdvanceOraclePhase (Tag 56) — permissionless oracle phase advancement.
 *
 * Checks if a market should transition from Phase 0→1→2 based on
 * time elapsed and cumulative volume. Anyone can call this.
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [writable] Slab
 */
export function encodeAdvanceOraclePhase(): Uint8Array {
  return encU8(IX_TAG.AdvanceOraclePhase);
}

/** Oracle phase constants matching on-chain values */
export const ORACLE_PHASE_NASCENT = 0;
export const ORACLE_PHASE_GROWING = 1;
export const ORACLE_PHASE_MATURE = 2;

/** Phase transition thresholds (must match program constants) */
export const PHASE1_MIN_SLOTS = 648_000n;         // ~72h at 400ms
export const PHASE1_VOLUME_MIN_SLOTS = 36_000n;    // ~4h at 400ms
export const PHASE2_VOLUME_THRESHOLD = 100_000_000_000n; // $100K in e6
export const PHASE2_MATURITY_SLOTS = 3_024_000n;   // ~14 days at 400ms

/**
 * Check if an oracle phase transition is due (TypeScript mirror of on-chain logic).
 *
 * @returns [newPhase, shouldTransition]
 */
export function checkPhaseTransition(
  currentSlot: bigint,
  marketCreatedSlot: bigint,
  oraclePhase: number,
  cumulativeVolumeE6: bigint,
  phase2DeltaSlots: number,
  hasMatureOracle: boolean,
): [number, boolean] {
  switch (oraclePhase) {
    case 0: {
      const elapsed = currentSlot - (marketCreatedSlot > 0n ? marketCreatedSlot : currentSlot);
      const timeReady = elapsed >= PHASE1_MIN_SLOTS;
      const volumeReady = elapsed >= PHASE1_VOLUME_MIN_SLOTS
        && cumulativeVolumeE6 >= PHASE2_VOLUME_THRESHOLD;
      if (timeReady || volumeReady) {
        return [ORACLE_PHASE_GROWING, true];
      }
      return [ORACLE_PHASE_NASCENT, false];
    }
    case 1: {
      if (hasMatureOracle) return [ORACLE_PHASE_MATURE, true];
      const phase2Start = marketCreatedSlot + BigInt(phase2DeltaSlots);
      const elapsedSincePhase2 = currentSlot - phase2Start;
      if (elapsedSincePhase2 >= PHASE2_MATURITY_SLOTS) {
        return [ORACLE_PHASE_MATURE, true];
      }
      return [ORACLE_PHASE_GROWING, false];
    }
    default:
      return [ORACLE_PHASE_MATURE, false];
  }
}

// ============================================================================
// PERC-623: Keeper Fund Instructions
// ============================================================================

/**
 * TopUpKeeperFund (Tag 57) — permissionless keeper fund top-up.
 *
 * Instruction data: tag(1) + amount(8) = 9 bytes
 *
 * Accounts:
 *   0. [signer, writable] Funder
 *   1. [writable]         Slab
 *   2. [writable]         Keeper fund PDA
 *   3. []                 System program
 */
export interface TopUpKeeperFundArgs {
  amount: bigint | string;
}

export function encodeTopUpKeeperFund(args: TopUpKeeperFundArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.TopUpKeeperFund), encU64(args.amount));
}

// Note: WithdrawKeeperReward does NOT exist as a separate instruction.
// Keeper rewards are paid automatically during KeeperCrank (tag 5).
// The keeper fund PDA is debited in-place when a successful crank is executed.

// ============================================================================
// PERC-629: Dynamic Creation Deposit
// ============================================================================

/**
 * SlashCreationDeposit (Tag 58) — permissionless: slash a market creator's deposit
 * after the spam grace period has elapsed (PERC-629).
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [signer]           Caller (anyone)
 *   1. []                 Slab
 *   2. [writable]         Creator history PDA
 *   3. [writable]         Insurance vault
 *   4. [writable]         Treasury
 *   5. []                 System program
 */
export function encodeSlashCreationDeposit(): Uint8Array {
  return encU8(IX_TAG.SlashCreationDeposit);
}

// ============================================================================
// PERC-628: Elastic Shared Vault + Epoch Withdrawals
// ============================================================================

/**
 * InitSharedVault (Tag 59) — admin: create the global shared vault PDA (PERC-628).
 *
 * Instruction data: tag(1) + epochDurationSlots(8) + maxMarketExposureBps(2) = 11 bytes
 *
 * Accounts:
 *   0. [signer]           Admin
 *   1. [writable]         Shared vault PDA
 *   2. []                 System program
 */
export interface InitSharedVaultArgs {
  epochDurationSlots: bigint | string;
  maxMarketExposureBps: number;
}

export function encodeInitSharedVault(args: InitSharedVaultArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.InitSharedVault),
    encU64(args.epochDurationSlots),
    encU16(args.maxMarketExposureBps),
  );
}

/**
 * AllocateMarket (Tag 60) — admin: allocate virtual liquidity from the shared vault
 * to a market (PERC-628).
 *
 * Instruction data: tag(1) + amount(16) = 17 bytes
 *
 * Accounts:
 *   0. [signer]           Admin
 *   1. []                 Slab
 *   2. [writable]         Shared vault PDA
 *   3. [writable]         Market alloc PDA
 *   4. []                 System program
 */
export interface AllocateMarketArgs {
  amount: bigint | string;
}

export function encodeAllocateMarket(args: AllocateMarketArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.AllocateMarket), encU128(args.amount));
}

/**
 * QueueWithdrawalSV (Tag 61) — user: queue a withdrawal request for the current
 * epoch (PERC-628). Tokens are locked until the epoch elapses.
 *
 * Instruction data: tag(1) + lpAmount(8) = 9 bytes
 *
 * Accounts:
 *   0. [signer]           User
 *   1. [writable]         Shared vault PDA
 *   2. [writable]         Withdraw request PDA
 *   3. []                 System program
 */
export interface QueueWithdrawalSVArgs {
  lpAmount: bigint | string;
}

export function encodeQueueWithdrawalSV(args: QueueWithdrawalSVArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.QueueWithdrawalSV), encU64(args.lpAmount));
}

/**
 * ClaimEpochWithdrawal (Tag 62) — user: claim a queued withdrawal after the epoch
 * has elapsed (PERC-628). Receives pro-rata collateral from the vault.
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [signer]           User
 *   1. [writable]         Shared vault PDA
 *   2. [writable]         Withdraw request PDA
 *   3. []                 Slab
 *   4. [writable]         Vault
 *   5. [writable]         User ATA
 *   6. []                 Vault authority
 *   7. []                 Token program
 */
export function encodeClaimEpochWithdrawal(): Uint8Array {
  return encU8(IX_TAG.ClaimEpochWithdrawal);
}

/**
 * AdvanceEpoch (Tag 63) — permissionless crank: move the shared vault to the next
 * epoch once `epoch_duration_slots` have elapsed (PERC-628).
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [signer]           Caller (anyone)
 *   1. [writable]         Shared vault PDA
 */
export function encodeAdvanceEpoch(): Uint8Array {
  return encU8(IX_TAG.AdvanceEpoch);
}

// PERC-628: Tag 63 ─────────────────────────────────────────────────────────

// PERC-8110 ────────────────────────────────────────────────────────────────

/**
 * SetOiImbalanceHardBlock (Tag 71, PERC-8110) — set OI imbalance hard-block threshold (admin only).
 *
 * When `|long_oi − short_oi| / total_oi * 10_000 >= threshold_bps`, any new trade that would
 * *increase* the imbalance is rejected with `OiImbalanceHardBlock` (error code 59).
 *
 * - `threshold_bps = 0`: hard block disabled.
 * - `threshold_bps = 8_000`: block trades that push skew above 80%.
 * - `threshold_bps = 10_000`: never allow >100% skew (always blocks one side when oi > 0).
 *
 * Instruction data layout: tag(1) + threshold_bps(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer]   admin
 *   1. [writable] slab
 *
 * @example
 * ```ts
 * const ix = new TransactionInstruction({
 *   programId: PROGRAM_ID,
 *   keys: buildAccountMetas(ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK, { admin, slab }),
 *   data: Buffer.from(encodeSetOiImbalanceHardBlock({ thresholdBps: 8_000 })),
 * });
 * ```
 */
export function encodeSetOiImbalanceHardBlock(args: { thresholdBps: number }): Uint8Array {
  if (args.thresholdBps < 0 || args.thresholdBps > 10_000) {
    throw new Error(`encodeSetOiImbalanceHardBlock: thresholdBps must be 0–10_000, got ${args.thresholdBps}`);
  }
  return concatBytes(encU8(IX_TAG.SetOiImbalanceHardBlock), encU16(args.thresholdBps));
}

// ============================================================================
// PERC-608 — Position NFT instructions (tags 64–69)
// ============================================================================

/**
 * MintPositionNft (Tag 64, PERC-608) — mint a Token-2022 NFT representing a position.
 *
 * Creates a PositionNft PDA + Token-2022 mint with metadata, then mints 1 NFT to the
 * position owner's ATA. The NFT represents ownership of `user_idx` in the slab.
 *
 * Instruction data layout: tag(1) + user_idx(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer, writable] payer
 *   1. [writable]         slab
 *   2. [writable]         position_nft PDA  (created — seeds: ["pos_nft", slab, user_idx])
 *   3. [writable]         nft_mint PDA      (created)
 *   4. [writable]         owner_ata         (Token-2022 ATA for owner)
 *   5. [signer]           owner             (must match engine account owner)
 *   6. []                 vault_authority PDA
 *   7. []                 token_2022_program
 *   8. []                 system_program
 *   9. []                 rent sysvar
 *
 * @example
 * ```ts
 * const ix = new TransactionInstruction({
 *   programId: PROGRAM_ID,
 *   keys: buildAccountMetas(ACCOUNTS_MINT_POSITION_NFT, [payer, slab, nftPda, nftMint, ownerAta, owner, vaultAuth, TOKEN_2022_PROGRAM_ID, SystemProgram.programId, SYSVAR_RENT_PUBKEY]),
 *   data: Buffer.from(encodeMintPositionNft({ userIdx: 5 })),
 * });
 * ```
 */
export interface MintPositionNftArgs {
  userIdx: number;
}

export function encodeMintPositionNft(args: MintPositionNftArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.MintPositionNft), encU16(args.userIdx));
}

/**
 * TransferPositionOwnership (Tag 65, PERC-608) — transfer an open position to a new owner.
 *
 * Transfers the Token-2022 NFT from current owner to new owner and updates the on-chain
 * engine account's owner field. Requires `pending_settlement == 0`.
 *
 * Instruction data layout: tag(1) + user_idx(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer, writable] current_owner
 *   1. [writable]         slab
 *   2. [writable]         position_nft PDA
 *   3. [writable]         nft_mint PDA
 *   4. [writable]         current_owner_ata  (source Token-2022 ATA)
 *   5. [writable]         new_owner_ata      (destination Token-2022 ATA)
 *   6. []                 new_owner
 *   7. []                 token_2022_program
 */
export interface TransferPositionOwnershipArgs {
  userIdx: number;
}

export function encodeTransferPositionOwnership(args: TransferPositionOwnershipArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.TransferPositionOwnership), encU16(args.userIdx));
}

/**
 * BurnPositionNft (Tag 66, PERC-608) — burn the Position NFT when a position is closed.
 *
 * Burns the NFT, closes the PositionNft PDA and the mint PDA, returning rent to the owner.
 * Can only be called after the position is fully closed (size == 0).
 *
 * Instruction data layout: tag(1) + user_idx(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer, writable] owner
 *   1. [writable]         slab
 *   2. [writable]         position_nft PDA  (closed — rent to owner)
 *   3. [writable]         nft_mint PDA      (closed via Token-2022 close_account)
 *   4. [writable]         owner_ata         (Token-2022 ATA, balance burned)
 *   5. []                 vault_authority PDA
 *   6. []                 token_2022_program
 */
export interface BurnPositionNftArgs {
  userIdx: number;
}

export function encodeBurnPositionNft(args: BurnPositionNftArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.BurnPositionNft), encU16(args.userIdx));
}

/**
 * SetPendingSettlement (Tag 67, PERC-608) — keeper sets the pending_settlement flag.
 *
 * Called by the keeper/admin before performing a funding settlement transfer.
 * Blocks NFT transfers until ClearPendingSettlement is called.
 * Admin-only (protected by GH#1475 keeper allowlist guard).
 *
 * Instruction data layout: tag(1) + user_idx(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer]   keeper / admin
 *   1. []         slab  (read — for PDA verification + admin check)
 *   2. [writable] position_nft PDA
 */
export interface SetPendingSettlementArgs {
  userIdx: number;
}

export function encodeSetPendingSettlement(args: SetPendingSettlementArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.SetPendingSettlement), encU16(args.userIdx));
}

/**
 * ClearPendingSettlement (Tag 68, PERC-608) — keeper clears the pending_settlement flag.
 *
 * Called by the keeper/admin after KeeperCrank has run and funding is settled.
 * Admin-only (protected by GH#1475 keeper allowlist guard).
 *
 * Instruction data layout: tag(1) + user_idx(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer]   keeper / admin
 *   1. []         slab  (read — for PDA verification + admin check)
 *   2. [writable] position_nft PDA
 */
export interface ClearPendingSettlementArgs {
  userIdx: number;
}

export function encodeClearPendingSettlement(args: ClearPendingSettlementArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.ClearPendingSettlement), encU16(args.userIdx));
}

/**
 * TransferOwnershipCpi (Tag 69, PERC-608) — internal CPI target for percolator-nft TransferHook.
 *
 * Called by the Token-2022 TransferHook on the percolator-nft program during an NFT transfer.
 * Updates the engine account's owner field to the new_owner public key.
 * NOT intended for direct external use — always called via Token-2022 CPI.
 *
 * Instruction data layout: tag(1) + user_idx(2) + new_owner(32) = 35 bytes
 *
 * Accounts:
 *   0. [signer]   nft TransferHook program (CPI caller)
 *   1. [writable] slab
 *   (remaining accounts per Token-2022 ExtraAccountMeta spec)
 */
export interface TransferOwnershipCpiArgs {
  userIdx: number;
  newOwner: PublicKey | string;
}

export function encodeTransferOwnershipCpi(args: TransferOwnershipCpiArgs): Uint8Array {
  return concatBytes(
    encU8(IX_TAG.TransferOwnershipCpi),
    encU16(args.userIdx),
    encPubkey(args.newOwner),
  );
}

// ============================================================================
// PERC-8111 — SetWalletCap (tag 70)
// ============================================================================

/**
 * SetWalletCap (Tag 70, PERC-8111) — set the per-wallet position cap (admin only).
 *
 * Limits the maximum absolute position size any single wallet may hold on this market.
 * Enforced on every trade (TradeNoCpi + TradeCpi) after execute_trade.
 *
 * - `capE6 = 0`: disable per-wallet cap (no limit, default).
 * - `capE6 > 0`: max |position_size| in e6 units ($1 = 1_000_000).
 *   Phase 1 launch value: 1_000_000_000n ($1,000).
 *
 * When a trade would breach the cap, the on-chain error `WalletPositionCapExceeded`
 * (error code 58) is returned.
 *
 * Instruction data layout: tag(1) + cap_e6(8) = 9 bytes
 *
 * Accounts:
 *   0. [signer]   admin
 *   1. [writable] slab
 *
 * @example
 * ```ts
 * // Set $1K per-wallet cap
 * const ix = new TransactionInstruction({
 *   programId: PROGRAM_ID,
 *   keys: buildAccountMetas(ACCOUNTS_SET_WALLET_CAP, [admin, slab]),
 *   data: Buffer.from(encodeSetWalletCap({ capE6: 1_000_000_000n })),
 * });
 *
 * // Disable cap
 * const disableIx = new TransactionInstruction({
 *   programId: PROGRAM_ID,
 *   keys: buildAccountMetas(ACCOUNTS_SET_WALLET_CAP, [admin, slab]),
 *   data: Buffer.from(encodeSetWalletCap({ capE6: 0n })),
 * });
 * ```
 */
export interface SetWalletCapArgs {
  /** Max position size in e6 units. 0 = disabled. $1 = 1_000_000n, $1K = 1_000_000_000n. */
  capE6: bigint | string;
}

export function encodeSetWalletCap(args: SetWalletCapArgs): Uint8Array {
  return concatBytes(encU8(IX_TAG.SetWalletCap), encU64(args.capE6));
}
