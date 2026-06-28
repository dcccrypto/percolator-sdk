import { Connection, PublicKey } from "@solana/web3.js";
import {
  PUMPSWAP_PROGRAM_ID,
  RAYDIUM_CLMM_PROGRAM_ID,
  METEORA_DLMM_PROGRAM_ID,
} from "./pda.js";

export type DexType = "pumpswap" | "raydium-clmm" | "meteora-dlmm";

export interface DexPoolInfo {
  dexType: DexType;
  poolAddress: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseVault?: PublicKey;  // PumpSwap only
  quoteVault?: PublicKey; // PumpSwap only
}

/**
 * Detect DEX type from the program that owns the pool account.
 *
 * @param ownerProgramId - The program ID that owns the pool account
 * @returns The detected DEX type, or `null` if the owner is not a supported DEX program
 *
 * Supported DEX programs:
 * - PumpSwap (constant-product AMM)
 * - Raydium CLMM (concentrated liquidity)
 * - Meteora DLMM (discretized liquidity)
 */
export function detectDexType(ownerProgramId: PublicKey): DexType | null {
  if (ownerProgramId.equals(PUMPSWAP_PROGRAM_ID)) return "pumpswap";
  if (ownerProgramId.equals(RAYDIUM_CLMM_PROGRAM_ID)) return "raydium-clmm";
  if (ownerProgramId.equals(METEORA_DLMM_PROGRAM_ID)) return "meteora-dlmm";
  return null;
}

/**
 * Parse a DEX pool account into a {@link DexPoolInfo} struct.
 *
 * @param dexType - The type of DEX (pumpswap, raydium-clmm, or meteora-dlmm)
 * @param poolAddress - The on-chain address of the pool account
 * @param data - Raw account data bytes
 * @returns Parsed pool info including mints and (for PumpSwap) vault addresses
 * @throws Error if data is too short for the given DEX type
 */
export function parseDexPool(
  dexType: DexType,
  poolAddress: PublicKey,
  data: Uint8Array,
): DexPoolInfo {
  switch (dexType) {
    case "pumpswap":
      return parsePumpSwapPool(poolAddress, data);
    case "raydium-clmm":
      return parseRaydiumClmmPool(poolAddress, data);
    case "meteora-dlmm":
      return parseMeteoraPool(poolAddress, data);
  }
}

/**
 * Compute the spot price from a DEX pool in e6 format (i.e., 1.0 = 1_000_000).
 *
 * **SECURITY NOTE:** DEX spot prices have no staleness or confidence checks and are
 * vulnerable to flash-loan manipulation within a single transaction. For high-value
 * markets, prefer Pyth or Chainlink oracles.
 *
 * @param dexType - The type of DEX
 * @param data - Raw pool account data
 * @param vaultData - For PumpSwap only: base and quote vault account data
 * @returns Price in e6 format (quote per base token)
 * @throws Error if data is too short or computation fails
 */
export function computeDexSpotPriceE6(
  dexType: DexType,
  data: Uint8Array,
  vaultData?: { base: Uint8Array; quote: Uint8Array },
  decimals?: { base: number; quote: number },
): bigint {
  switch (dexType) {
    case "pumpswap":
      if (!vaultData) throw new Error("PumpSwap requires vaultData (base and quote vault accounts)");
      return computePumpSwapPriceE6(data, vaultData);
    case "raydium-clmm":
      return computeRaydiumClmmPriceE6(data);
    case "meteora-dlmm":
      // #226: Meteora's LbPair does not store token decimals inline, so the caller MUST
      // supply them (fetched from the base/quote mints). Without the decimal adjustment
      // the mark price is wrong by 10^(decBase-decQuote) → mass mispricing/liquidations.
      if (!decimals) {
        throw new Error("Meteora DLMM requires decimals { base, quote } (mint decimals)");
      }
      return computeMeteoraDlmmPriceE6(data, decimals.base, decimals.quote);
  }
}

// ============================================================================
// Mint decimals helper
// ============================================================================

/** Offset of the `decimals` byte in a standard SPL Mint account. */
const SPL_MINT_DECIMALS_OFFSET = 44;

/**
 * Read the `decimals` field of any SPL mint account (including native WSOL).
 *
 * This replaces `getMint(connection, mint).decimals` for callers that need to
 * supply decimals to {@link computeDexSpotPriceE6} for Meteora DLMM pools.
 * `getMint()` throws on native WSOL (`So11111111111111111111111111111111111111112`)
 * because the system account is not a valid token-program mint; this function
 * reads raw account data and extracts byte 44 directly, which works for all
 * SPL mints, Token-2022 mints, and native WSOL (which stores `9` at that byte).
 *
 * @param connection - Solana RPC connection
 * @param mint - The mint public key to query
 * @returns The `decimals` field value (0–255)
 * @throws Error if the account does not exist or is too short to hold a mint
 *
 * @example
 * ```ts
 * import { fetchMintDecimals, computeDexSpotPriceE6 } from "@percolator/sdk";
 *
 * const baseDecimals = await fetchMintDecimals(connection, pool.baseMint);
 * const quoteDecimals = await fetchMintDecimals(connection, pool.quoteMint);
 * const priceE6 = computeDexSpotPriceE6("meteora-dlmm", poolData, undefined, {
 *   base: baseDecimals,
 *   quote: quoteDecimals,
 * });
 * ```
 */
export async function fetchMintDecimals(
  connection: Connection,
  mint: PublicKey,
): Promise<number> {
  const info = await connection.getAccountInfo(mint);
  if (!info) {
    throw new Error(`fetchMintDecimals: account not found for mint ${mint.toBase58()}`);
  }
  if (info.data.length <= SPL_MINT_DECIMALS_OFFSET) {
    throw new Error(
      `fetchMintDecimals: account data too short (${info.data.length} bytes) for mint ${mint.toBase58()}`,
    );
  }
  return info.data[SPL_MINT_DECIMALS_OFFSET];
}

// ============================================================================
// PumpSwap
// ============================================================================

const PUMPSWAP_MIN_LEN = 195;

/**
 * Parse a PumpSwap constant-product AMM pool account.
 * @internal
 */
function parsePumpSwapPool(poolAddress: PublicKey, data: Uint8Array): DexPoolInfo {
  if (data.length < PUMPSWAP_MIN_LEN) {
    throw new Error(`PumpSwap pool data too short: ${data.length} < ${PUMPSWAP_MIN_LEN}`);
  }
  return {
    dexType: "pumpswap",
    poolAddress,
    baseMint: new PublicKey(data.slice(35, 67)),
    quoteMint: new PublicKey(data.slice(67, 99)),
    baseVault: new PublicKey(data.slice(131, 163)),
    quoteVault: new PublicKey(data.slice(163, 195)),
  };
}

const SPL_TOKEN_AMOUNT_MIN_LEN = 72;

/**
 * Compute PumpSwap price: quote_amount * 1e6 / base_amount.
 * @internal
 */
function computePumpSwapPriceE6(
  _poolData: Uint8Array,
  vaultData: { base: Uint8Array; quote: Uint8Array },
): bigint {
  if (vaultData.base.length < SPL_TOKEN_AMOUNT_MIN_LEN) {
    throw new Error(`PumpSwap base vault data too short: ${vaultData.base.length} < ${SPL_TOKEN_AMOUNT_MIN_LEN}`);
  }
  if (vaultData.quote.length < SPL_TOKEN_AMOUNT_MIN_LEN) {
    throw new Error(`PumpSwap quote vault data too short: ${vaultData.quote.length} < ${SPL_TOKEN_AMOUNT_MIN_LEN}`);
  }

  const baseDv = new DataView(vaultData.base.buffer, vaultData.base.byteOffset, vaultData.base.byteLength);
  const quoteDv = new DataView(vaultData.quote.buffer, vaultData.quote.byteOffset, vaultData.quote.byteLength);

  const baseAmount = readU64LE(baseDv, 64);
  const quoteAmount = readU64LE(quoteDv, 64);

  if (baseAmount === 0n) return 0n;
  return (quoteAmount * 1_000_000n) / baseAmount;
}

// ============================================================================
// Raydium CLMM
// ============================================================================

const RAYDIUM_CLMM_MIN_LEN = 269; // need at least through sqrt_price_x64 (253 + 16)

/**
 * Parse a Raydium CLMM (concentrated liquidity) pool account.
 * @internal
 */
function parseRaydiumClmmPool(poolAddress: PublicKey, data: Uint8Array): DexPoolInfo {
  if (data.length < RAYDIUM_CLMM_MIN_LEN) {
    throw new Error(`Raydium CLMM pool data too short: ${data.length} < ${RAYDIUM_CLMM_MIN_LEN}`);
  }
  return {
    dexType: "raydium-clmm",
    poolAddress,
    baseMint: new PublicKey(data.slice(73, 105)),
    quoteMint: new PublicKey(data.slice(105, 137)),
  };
}

/**
 * Compute Raydium CLMM spot price from sqrt_price_x64 (Q64.64 fixed-point).
 *
 * Formula: `price_e6 = (sqrt^2 / 2^128) * 10^(6 + decimals0 - decimals1)`
 *
 * Uses a precision-preserving approach: scales sqrt by 1e6 before shifting,
 * preventing zero results for micro-priced tokens (memecoins where sqrt < 2^64).
 *
 * @internal
 */
const MAX_TOKEN_DECIMALS = 24;

function assertTokenDecimals(dexName: string, label: string, decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_TOKEN_DECIMALS) {
    throw new Error(
      `${dexName}: ${label} decimals out of range (${decimals}); expected integer 0..${MAX_TOKEN_DECIMALS}`,
    );
  }
}

function computeRaydiumClmmPriceE6(data: Uint8Array): bigint {
  if (data.length < RAYDIUM_CLMM_MIN_LEN) {
    throw new Error(`Raydium CLMM data too short: ${data.length} < ${RAYDIUM_CLMM_MIN_LEN}`);
  }
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const decimals0 = data[233];
  const decimals1 = data[234];

  if (decimals0 > MAX_TOKEN_DECIMALS || decimals1 > MAX_TOKEN_DECIMALS) {
    throw new Error(
      `Raydium CLMM: decimals out of range (${decimals0}, ${decimals1}); max ${MAX_TOKEN_DECIMALS}`,
    );
  }

  const sqrtPriceX64 = readU128LE(dv, 253);

  if (sqrtPriceX64 === 0n) return 0n;

  // #210: defer truncation to a single shift at the very end. The previous form
  // truncated twice (`>> 64` then `>> 64`) BEFORE applying the decimal scale, so for
  // low-priced / large-decimal-asymmetry assets (e.g. decimals0=18, decimals1=6) the
  // raw value truncated to 0n before being scaled up by 10^12 — silently returning 0n.
  // Fold the decimal scale into the numerator/denominator and truncate exactly ONCE.
  // BigInt is arbitrary-precision, so the squared term cannot overflow.
  //   priceE6 = (sqrtPriceX64 / 2^64)^2 * 1e6 * 10^adjustedDiff
  //           = sqrtPriceX64^2 * 1e6 * 10^adjustedDiff  >> 128
  const sq1e6 = sqrtPriceX64 * sqrtPriceX64 * 1_000_000n;

  const decimalDiff = 6 + decimals0 - decimals1;
  const adjustedDiff = decimalDiff - 6;

  if (adjustedDiff >= 0) {
    return (sq1e6 * 10n ** BigInt(adjustedDiff)) >> 128n;
  } else {
    return sq1e6 / ((1n << 128n) * 10n ** BigInt(-adjustedDiff));
  }
}

// ============================================================================
// Meteora DLMM
// ============================================================================

// Meteora DLMM LbPair struct layout (Anchor discriminator = 8 bytes):
//   [0:8]   discriminator
//   [8:40]  parameters     (StaticParameters, 32 bytes)
//   [40:72] v_parameters   (VariableParameters, 32 bytes)
//   [72]    bump_seed      u8
//   [73:75] bin_step_seed  [u8;2]
//   [75]    pair_type      u8
//   [76:80] active_id      i32
//   [80:82] bin_step       u16
//   [82]    status         u8
//   [83]    require_base_factor_seed  u8
//   [84:86] base_factor_seed [u8;2]
//   [86]    activation_type u8
//   [87]    creator_pool_on_off_control u8
//   [88:120] token_x_mint  Pubkey  ← corrected from erroneous 81
//   [120:152] token_y_mint Pubkey  ← corrected from erroneous 113
//   [152:184] reserve_x    Pubkey
//   [184:216] reserve_y    Pubkey
const METEORA_DLMM_MIN_LEN = 152; // need through end of token_y_mint (120 + 32)

/**
 * Parse a Meteora DLMM (discretized liquidity) pool account.
 *
 * Reads `token_x_mint` at byte 88 and `token_y_mint` at byte 120, matching the
 * on-chain `LbPair` struct layout (verified against mainnet pool
 * `5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6` — WSOL/USDC, Jun 2026).
 *
 * @internal
 */
function parseMeteoraPool(poolAddress: PublicKey, data: Uint8Array): DexPoolInfo {
  if (data.length < METEORA_DLMM_MIN_LEN) {
    throw new Error(`Meteora DLMM pool data too short: ${data.length} < ${METEORA_DLMM_MIN_LEN}`);
  }
  return {
    dexType: "meteora-dlmm",
    poolAddress,
    baseMint: new PublicKey(data.slice(88, 120)),
    quoteMint: new PublicKey(data.slice(120, 152)),
  };
}

/**
 * Compute Meteora DLMM spot price from active_id and bin_step.
 *
 * Formula: `price = (1 + bin_step/10000) ^ active_id`
 *
 * Uses binary exponentiation with 1e18 fixed-point precision, then converts to e6.
 * For negative active_id, computes the inverse.
 *
 * @internal
 */
const MAX_BIN_STEP = 10_000;
const MAX_ACTIVE_ID_ABS = 500_000;

function computeMeteoraDlmmPriceE6(
  data: Uint8Array,
  decimalsBase: number,
  decimalsQuote: number,
): bigint {
  if (data.length < METEORA_DLMM_MIN_LEN) {
    throw new Error(`Meteora DLMM data too short: ${data.length} < ${METEORA_DLMM_MIN_LEN}`);
  }
  assertTokenDecimals("Meteora DLMM", "base", decimalsBase);
  assertTokenDecimals("Meteora DLMM", "quote", decimalsQuote);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // bin_step is at offset 80 (u16 LE), not 73 which is bin_step_seed ([u8;2]).
  // They happen to encode the same integer for most pools (explaining why the
  // old code produced correct prices), but reading the correct field is required
  // for correctness once those fields diverge.
  const binStep = dv.getUint16(80, true);
  const activeId = dv.getInt32(76, true);

  if (binStep === 0) return 0n;
  if (binStep > MAX_BIN_STEP) {
    throw new Error(`Meteora DLMM: binStep ${binStep} exceeds max ${MAX_BIN_STEP}`);
  }
  if (Math.abs(activeId) > MAX_ACTIVE_ID_ABS) {
    throw new Error(
      `Meteora DLMM: |activeId| ${Math.abs(activeId)} exceeds max ${MAX_ACTIVE_ID_ABS}`,
    );
  }

  const SCALE = 1_000_000_000_000_000_000n; // 1e18
  const base = SCALE + (BigInt(binStep) * SCALE) / 10_000n;

  const isNeg = activeId < 0;
  let exp = isNeg ? BigInt(-activeId) : BigInt(activeId);

  let result = SCALE;
  let b = base;

  while (exp > 0n) {
    if (exp & 1n) {
      result = (result * b) / SCALE;
    }
    exp >>= 1n;
    if (exp > 0n) {
      b = (b * b) / SCALE;
    }
  }

  // #226: the bin formula yields the price of ONE ATOMIC base unit in ATOMIC quote
  // units (lamport-per-lamport), exactly like Raydium's sqrt_price. Convert to a
  // human/E6 price by multiplying by 10^(decimalsBase - decimalsQuote) — without this
  // the mark price is wrong by that factor for any pair with asymmetric decimals.
  // Apply the decimal scale and divide ONCE at the end (deferred truncation, like the
  // Raydium #210 fix) so sub-1e-6 micro-prices aren't truncated to 0n. BigInt is
  // arbitrary-precision, so the intermediate products cannot overflow.
  const diff = decimalsBase - decimalsQuote;

  if (isNeg) {
    if (result === 0n) return 0n;
    // price_e6 = (1e24 / result) * 10^diff   [1e24 = 1e18 (inverse) * 1e6 (e6 scale)]
    const num = 1_000_000_000_000_000_000_000_000n; // 1e24
    if (diff >= 0) {
      return (num * 10n ** BigInt(diff)) / result;
    }
    return num / (result * 10n ** BigInt(-diff));
  } else {
    // price_e6 = (result / 1e12) * 10^diff
    if (diff >= 0) {
      return (result * 10n ** BigInt(diff)) / 1_000_000_000_000n;
    }
    return result / (1_000_000_000_000n * 10n ** BigInt(-diff));
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Read a little-endian u64 from a DataView. */
function readU64LE(dv: DataView, offset: number): bigint {
  const lo = BigInt(dv.getUint32(offset, true));
  const hi = BigInt(dv.getUint32(offset + 4, true));
  return lo | (hi << 32n);
}

/** Read a little-endian u128 from a DataView. */
function readU128LE(dv: DataView, offset: number): bigint {
  const lo = readU64LE(dv, offset);
  const hi = readU64LE(dv, offset + 8);
  return lo | (hi << 64n);
}
