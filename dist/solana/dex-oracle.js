import { PublicKey } from "@solana/web3.js";
import {
  PUMPSWAP_PROGRAM_ID,
  RAYDIUM_CLMM_PROGRAM_ID,
  METEORA_DLMM_PROGRAM_ID
} from "./pda.js";
function detectDexType(ownerProgramId) {
  if (ownerProgramId.equals(PUMPSWAP_PROGRAM_ID)) return "pumpswap";
  if (ownerProgramId.equals(RAYDIUM_CLMM_PROGRAM_ID)) return "raydium-clmm";
  if (ownerProgramId.equals(METEORA_DLMM_PROGRAM_ID)) return "meteora-dlmm";
  return null;
}
function parseDexPool(dexType, poolAddress, data) {
  switch (dexType) {
    case "pumpswap":
      return parsePumpSwapPool(poolAddress, data);
    case "raydium-clmm":
      return parseRaydiumClmmPool(poolAddress, data);
    case "meteora-dlmm":
      return parseMeteoraPool(poolAddress, data);
  }
}
function computeDexSpotPriceE6(dexType, data, vaultData, decimals, solPriceE6) {
  switch (dexType) {
    case "pumpswap":
      if (!vaultData) throw new Error("PumpSwap requires vaultData (base and quote vault accounts)");
      if (!decimals) {
        throw new Error("PumpSwap requires decimals { base, quote } (mint decimals)");
      }
      return computePumpSwapPriceE6(data, vaultData, decimals, solPriceE6);
    case "raydium-clmm":
      return computeRaydiumClmmPriceE6(data);
    case "meteora-dlmm":
      if (!decimals) {
        throw new Error("Meteora DLMM requires decimals { base, quote } (mint decimals)");
      }
      return computeMeteoraDlmmPriceE6(data, decimals.base, decimals.quote);
  }
}
const SPL_MINT_DECIMALS_OFFSET = 44;
async function fetchMintDecimals(connection, mint) {
  const info = await connection.getAccountInfo(mint);
  if (!info) {
    throw new Error(`fetchMintDecimals: account not found for mint ${mint.toBase58()}`);
  }
  if (info.data.length <= SPL_MINT_DECIMALS_OFFSET) {
    throw new Error(
      `fetchMintDecimals: account data too short (${info.data.length} bytes) for mint ${mint.toBase58()}`
    );
  }
  return info.data[SPL_MINT_DECIMALS_OFFSET];
}
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const PUMPSWAP_MIN_LEN = 203;
function parsePumpSwapPool(poolAddress, data) {
  if (data.length < PUMPSWAP_MIN_LEN) {
    throw new Error(`PumpSwap pool data too short: ${data.length} < ${PUMPSWAP_MIN_LEN}`);
  }
  return {
    dexType: "pumpswap",
    poolAddress,
    baseMint: new PublicKey(data.slice(43, 75)),
    quoteMint: new PublicKey(data.slice(75, 107)),
    baseVault: new PublicKey(data.slice(139, 171)),
    quoteVault: new PublicKey(data.slice(171, 203))
  };
}
const SPL_TOKEN_AMOUNT_MIN_LEN = 72;
function computePumpSwapPriceE6(poolData, vaultData, decimals, solPriceE6) {
  if (poolData.length < PUMPSWAP_MIN_LEN) {
    throw new Error(`PumpSwap pool data too short: ${poolData.length} < ${PUMPSWAP_MIN_LEN}`);
  }
  if (vaultData.base.length < SPL_TOKEN_AMOUNT_MIN_LEN) {
    throw new Error(`PumpSwap base vault data too short: ${vaultData.base.length} < ${SPL_TOKEN_AMOUNT_MIN_LEN}`);
  }
  if (vaultData.quote.length < SPL_TOKEN_AMOUNT_MIN_LEN) {
    throw new Error(`PumpSwap quote vault data too short: ${vaultData.quote.length} < ${SPL_TOKEN_AMOUNT_MIN_LEN}`);
  }
  assertTokenDecimals("PumpSwap", "base", decimals.base);
  assertTokenDecimals("PumpSwap", "quote", decimals.quote);
  const baseDv = new DataView(vaultData.base.buffer, vaultData.base.byteOffset, vaultData.base.byteLength);
  const quoteDv = new DataView(vaultData.quote.buffer, vaultData.quote.byteOffset, vaultData.quote.byteLength);
  const baseAmount = readU64LE(baseDv, 64);
  const quoteAmount = readU64LE(quoteDv, 64);
  if (baseAmount === 0n) {
    throw new Error(
      "PumpSwap pool has zero base reserves \u2014 uninitialized or fully drained; refusing to report a price"
    );
  }
  const baseScale = 10n ** BigInt(decimals.base);
  const quoteScale = 10n ** BigInt(decimals.quote);
  const quotePerBaseE6 = quoteAmount * baseScale * 1000000n / (quoteScale * baseAmount);
  const quoteMint = new PublicKey(poolData.slice(75, 107));
  if (quoteMint.equals(WSOL_MINT)) {
    if (solPriceE6 === void 0) {
      throw new Error(
        "PumpSwap: pool is WSOL-quoted but no solPriceE6 was supplied \u2014 cannot convert to USD. Pass the current SOL/USD price (e6) to computeDexSpotPriceE6."
      );
    }
    return quotePerBaseE6 * solPriceE6 / 1000000n;
  }
  return quotePerBaseE6;
}
const RAYDIUM_CLMM_MIN_LEN = 269;
function parseRaydiumClmmPool(poolAddress, data) {
  if (data.length < RAYDIUM_CLMM_MIN_LEN) {
    throw new Error(`Raydium CLMM pool data too short: ${data.length} < ${RAYDIUM_CLMM_MIN_LEN}`);
  }
  return {
    dexType: "raydium-clmm",
    poolAddress,
    baseMint: new PublicKey(data.slice(73, 105)),
    quoteMint: new PublicKey(data.slice(105, 137))
  };
}
const MAX_TOKEN_DECIMALS = 24;
function assertTokenDecimals(dexName, label, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_TOKEN_DECIMALS) {
    throw new Error(
      `${dexName}: ${label} decimals out of range (${decimals}); expected integer 0..${MAX_TOKEN_DECIMALS}`
    );
  }
}
function computeRaydiumClmmPriceE6(data) {
  if (data.length < RAYDIUM_CLMM_MIN_LEN) {
    throw new Error(`Raydium CLMM data too short: ${data.length} < ${RAYDIUM_CLMM_MIN_LEN}`);
  }
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decimals0 = data[233];
  const decimals1 = data[234];
  if (decimals0 > MAX_TOKEN_DECIMALS || decimals1 > MAX_TOKEN_DECIMALS) {
    throw new Error(
      `Raydium CLMM: decimals out of range (${decimals0}, ${decimals1}); max ${MAX_TOKEN_DECIMALS}`
    );
  }
  const sqrtPriceX64 = readU128LE(dv, 253);
  if (sqrtPriceX64 === 0n) {
    throw new Error(
      "Raydium CLMM pool has sqrt_price_x64 = 0 \u2014 uninitialized; refusing to report a price"
    );
  }
  const sq1e6 = sqrtPriceX64 * sqrtPriceX64 * 1000000n;
  const decimalDiff = 6 + decimals0 - decimals1;
  const adjustedDiff = decimalDiff - 6;
  if (adjustedDiff >= 0) {
    return sq1e6 * 10n ** BigInt(adjustedDiff) >> 128n;
  } else {
    return sq1e6 / ((1n << 128n) * 10n ** BigInt(-adjustedDiff));
  }
}
const METEORA_DLMM_MIN_LEN = 152;
function parseMeteoraPool(poolAddress, data) {
  if (data.length < METEORA_DLMM_MIN_LEN) {
    throw new Error(`Meteora DLMM pool data too short: ${data.length} < ${METEORA_DLMM_MIN_LEN}`);
  }
  return {
    dexType: "meteora-dlmm",
    poolAddress,
    baseMint: new PublicKey(data.slice(88, 120)),
    quoteMint: new PublicKey(data.slice(120, 152))
  };
}
const MAX_BIN_STEP = 1e4;
const MAX_ACTIVE_ID_ABS = 5e5;
function computeMeteoraDlmmPriceE6(data, decimalsBase, decimalsQuote) {
  if (data.length < METEORA_DLMM_MIN_LEN) {
    throw new Error(`Meteora DLMM data too short: ${data.length} < ${METEORA_DLMM_MIN_LEN}`);
  }
  assertTokenDecimals("Meteora DLMM", "base", decimalsBase);
  assertTokenDecimals("Meteora DLMM", "quote", decimalsQuote);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const binStep = dv.getUint16(80, true);
  const activeId = dv.getInt32(76, true);
  if (binStep === 0) {
    throw new Error(
      "Meteora DLMM pair has binStep = 0 \u2014 uninitialized; refusing to report a price"
    );
  }
  if (binStep > MAX_BIN_STEP) {
    throw new Error(`Meteora DLMM: binStep ${binStep} exceeds max ${MAX_BIN_STEP}`);
  }
  if (Math.abs(activeId) > MAX_ACTIVE_ID_ABS) {
    throw new Error(
      `Meteora DLMM: |activeId| ${Math.abs(activeId)} exceeds max ${MAX_ACTIVE_ID_ABS}`
    );
  }
  const SCALE = 1000000000000000000n;
  const base = SCALE + BigInt(binStep) * SCALE / 10000n;
  const isNeg = activeId < 0;
  let exp = isNeg ? BigInt(-activeId) : BigInt(activeId);
  let result = SCALE;
  let b = base;
  while (exp > 0n) {
    if (exp & 1n) {
      result = result * b / SCALE;
    }
    exp >>= 1n;
    if (exp > 0n) {
      b = b * b / SCALE;
    }
  }
  const diff = decimalsBase - decimalsQuote;
  if (isNeg) {
    if (result === 0n) {
      throw new Error(
        "Meteora DLMM inverse-price computation produced a zero divisor; refusing to report a price"
      );
    }
    const num = 1000000000000000000000000n;
    if (diff >= 0) {
      return num * 10n ** BigInt(diff) / result;
    }
    return num / (result * 10n ** BigInt(-diff));
  } else {
    if (diff >= 0) {
      return result * 10n ** BigInt(diff) / 1000000000000n;
    }
    return result / (1000000000000n * 10n ** BigInt(-diff));
  }
}
function readU64LE(dv, offset) {
  const lo = BigInt(dv.getUint32(offset, true));
  const hi = BigInt(dv.getUint32(offset + 4, true));
  return lo | hi << 32n;
}
function readU128LE(dv, offset) {
  const lo = readU64LE(dv, offset);
  const hi = readU64LE(dv, offset + 8);
  return lo | hi << 64n;
}
export {
  SPL_MINT_DECIMALS_OFFSET,
  WSOL_MINT,
  computeDexSpotPriceE6,
  detectDexType,
  fetchMintDecimals,
  parseDexPool
};
//# sourceMappingURL=dex-oracle.js.map