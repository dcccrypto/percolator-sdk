import { PublicKey } from "@solana/web3.js";
import {
  parseHeader,
  parseConfig,
  parseParams,
  detectSlabLayout,
  isV17MarketAccount,
  parseWrapperConfigV17,
  SLAB_TIERS_V1M,
  SLAB_TIERS_V1M2,
  SLAB_TIERS_V2,
  SLAB_TIERS_V_ADL,
  SLAB_TIERS_V12_1,
  SLAB_TIERS_V12_15,
  SLAB_TIERS_V12_17,
  SLAB_TIERS_V12_19,
  SLAB_TIERS_V_SETDEXPOOL
} from "./slab.js";
import { getStaticMarkets } from "./static-markets.js";
const ENGINE_BITMAP_OFF = 656;
const ENGINE_BITMAP_OFF_V0 = 320;
const MAGIC_BYTES = new Uint8Array([84, 65, 76, 79, 67, 82, 69, 80]);
const V17_MAGIC_BYTES = new Uint8Array([0, 54, 49, 86, 67, 82, 69, 80]);
const SLAB_TIERS = {
  small: SLAB_TIERS_V12_17["small"],
  medium: SLAB_TIERS_V12_17["medium"],
  large: SLAB_TIERS_V12_17["large"]
};
const SLAB_TIERS_V0 = {
  small: { maxAccounts: 256, dataSize: 62808, label: "Small", description: "256 slots \xB7 ~0.44 SOL" },
  medium: { maxAccounts: 1024, dataSize: 248760, label: "Medium", description: "1,024 slots \xB7 ~1.73 SOL" },
  large: { maxAccounts: 4096, dataSize: 992568, label: "Large", description: "4,096 slots \xB7 ~6.90 SOL" }
};
const SLAB_TIERS_V1D = {
  micro: { maxAccounts: 64, dataSize: 17064, label: "Micro", description: "64 slots (V1D devnet)" },
  small: { maxAccounts: 256, dataSize: 65088, label: "Small", description: "256 slots (V1D devnet)" },
  medium: { maxAccounts: 1024, dataSize: 257184, label: "Medium", description: "1,024 slots (V1D devnet)" },
  large: { maxAccounts: 4096, dataSize: 1025568, label: "Large", description: "4,096 slots (V1D devnet)" }
};
const SLAB_TIERS_V1D_LEGACY = {
  micro: { maxAccounts: 64, dataSize: 17080, label: "Micro", description: "64 slots (V1D legacy, postBitmap=18)" },
  small: { maxAccounts: 256, dataSize: 65104, label: "Small", description: "256 slots (V1D legacy, postBitmap=18)" },
  medium: { maxAccounts: 1024, dataSize: 257200, label: "Medium", description: "1,024 slots (V1D legacy, postBitmap=18)" },
  large: { maxAccounts: 4096, dataSize: 1025584, label: "Large", description: "4,096 slots (V1D legacy, postBitmap=18)" }
};
const SLAB_TIERS_V1 = SLAB_TIERS;
const SLAB_TIERS_V_ADL_DISCOVERY = SLAB_TIERS_V_ADL;
function slabDataSize(maxAccounts) {
  const ENGINE_OFF_V0 = 480;
  const ENGINE_BITMAP_OFF_V02 = 320;
  const ACCOUNT_SIZE_V0 = 240;
  const bitmapBytes = Math.ceil(maxAccounts / 64) * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = ENGINE_BITMAP_OFF_V02 + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOff = Math.ceil(preAccountsLen / 8) * 8;
  return ENGINE_OFF_V0 + accountsOff + maxAccounts * ACCOUNT_SIZE_V0;
}
function slabDataSizeV1(maxAccounts) {
  const ENGINE_OFF_V1 = 640;
  const ENGINE_BITMAP_OFF_V1 = 656;
  const ACCOUNT_SIZE_V1 = 248;
  const bitmapBytes = Math.ceil(maxAccounts / 64) * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = ENGINE_BITMAP_OFF_V1 + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOff = Math.ceil(preAccountsLen / 8) * 8;
  return ENGINE_OFF_V1 + accountsOff + maxAccounts * ACCOUNT_SIZE_V1;
}
function validateSlabTierMatch(dataSize, programSlabLen) {
  return dataSize === programSlabLen;
}
const ALL_SLAB_SIZES = [
  ...Object.values(SLAB_TIERS).map((t) => t.dataSize),
  ...Object.values(SLAB_TIERS_V0).map((t) => t.dataSize),
  ...Object.values(SLAB_TIERS_V1D).map((t) => t.dataSize),
  ...Object.values(SLAB_TIERS_V1D_LEGACY).map((t) => t.dataSize),
  ...Object.values(SLAB_TIERS_V1M).map((t) => t.dataSize),
  ...Object.values(SLAB_TIERS_V_ADL).map((t) => t.dataSize)
];
const SLAB_DATA_SIZE = SLAB_TIERS.large.dataSize;
const HEADER_SLICE_LENGTH = 1940;
function dv(data) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}
function readU16LE(data, off) {
  return dv(data).getUint16(off, true);
}
function readU64LE(data, off) {
  return dv(data).getBigUint64(off, true);
}
function readI64LE(data, off) {
  return dv(data).getBigInt64(off, true);
}
function readU128LE(buf, offset) {
  const lo = readU64LE(buf, offset);
  const hi = readU64LE(buf, offset + 8);
  return hi << 64n | lo;
}
function readI128LE(buf, offset) {
  const lo = readU64LE(buf, offset);
  const hi = readU64LE(buf, offset + 8);
  const unsigned = hi << 64n | lo;
  const SIGN_BIT = 1n << 127n;
  if (unsigned >= SIGN_BIT) return unsigned - (1n << 128n);
  return unsigned;
}
function parseEngineLight(data, layout, maxAccounts = 4096) {
  const isV0 = !layout || layout.version === 0;
  const base = layout ? layout.engineOff : 480;
  const bitmapOff = layout ? layout.engineBitmapOff : ENGINE_BITMAP_OFF_V0;
  const minLen = base + bitmapOff;
  if (data.length < minLen) {
    throw new Error(`Slab data too short for engine light parse: ${data.length} < ${minLen}`);
  }
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const numUsedOff = bitmapOff + bitmapWords * 8;
  const nextAccountIdOff = Math.ceil((numUsedOff + 2) / 8) * 8;
  const canReadNumUsed = data.length >= base + numUsedOff + 2;
  const canReadNextId = data.length >= base + nextAccountIdOff + 8;
  if (isV0) {
    return {
      vault: readU128LE(data, base + 0),
      insuranceFund: {
        balance: readU128LE(data, base + 16),
        feeRevenue: readU128LE(data, base + 32),
        isolatedBalance: 0n,
        isolationBps: 0
      },
      currentSlot: readU64LE(data, base + 104),
      fundingIndexQpbE6: readI128LE(data, base + 112),
      lastFundingSlot: readU64LE(data, base + 128),
      fundingRateBpsPerSlotLast: readI64LE(data, base + 136),
      fundingRateE9: 0n,
      marketMode: null,
      lastCrankSlot: readU64LE(data, base + 144),
      maxCrankStalenessSlots: readU64LE(data, base + 152),
      totalOpenInterest: readU128LE(data, base + 160),
      longOi: 0n,
      shortOi: 0n,
      cTot: readU128LE(data, base + 176),
      pnlPosTot: readU128LE(data, base + 192),
      pnlMaturedPosTot: 0n,
      liqCursor: readU16LE(data, base + 208),
      gcCursor: readU16LE(data, base + 210),
      lastSweepStartSlot: readU64LE(data, base + 216),
      lastSweepCompleteSlot: readU64LE(data, base + 224),
      crankCursor: readU16LE(data, base + 232),
      sweepStartIdx: readU16LE(data, base + 234),
      lifetimeLiquidations: readU64LE(data, base + 240),
      lifetimeForceCloses: readU64LE(data, base + 248),
      netLpPos: readI128LE(data, base + 256),
      lpSumAbs: readU128LE(data, base + 272),
      lpMaxAbs: readU128LE(data, base + 288),
      lpMaxAbsSweep: 0n,
      emergencyOiMode: false,
      emergencyStartSlot: 0n,
      lastBreakerSlot: 0n,
      markPriceE6: 0n,
      // V0 engine has no mark_price field
      oraclePriceE6: 0n,
      fLongNum: 0n,
      fShortNum: 0n,
      negPnlAccountCount: 0n,
      fundPxLast: 0n,
      resolvedKLongTerminalDelta: 0n,
      resolvedKShortTerminalDelta: 0n,
      resolvedLivePrice: 0n,
      numUsedAccounts: canReadNumUsed ? readU16LE(data, base + numUsedOff) : 0,
      nextAccountId: canReadNextId ? readU64LE(data, base + nextAccountIdOff) : 0n
    };
  }
  if (layout !== null) {
    const l = layout;
    const hasInsuranceIsolation = l.engineInsuranceIsolatedOff >= 0 && l.engineInsuranceIsolationBpsOff >= 0;
    const u16At = (off) => off >= 0 ? readU16LE(data, base + off) : 0;
    const u64At = (off) => off >= 0 ? readU64LE(data, base + off) : 0n;
    const i64At = (off) => off >= 0 ? readI64LE(data, base + off) : 0n;
    const u128At = (off) => off >= 0 ? readU128LE(data, base + off) : 0n;
    const i128At = (off) => off >= 0 ? readI128LE(data, base + off) : 0n;
    return {
      vault: readU128LE(data, base + 0),
      insuranceFund: {
        balance: readU128LE(data, base + l.engineInsuranceOff),
        feeRevenue: readU128LE(data, base + l.engineInsuranceOff + 16),
        isolatedBalance: hasInsuranceIsolation ? readU128LE(data, base + l.engineInsuranceIsolatedOff) : 0n,
        isolationBps: hasInsuranceIsolation ? readU16LE(data, base + l.engineInsuranceIsolationBpsOff) : 0
      },
      currentSlot: readU64LE(data, base + l.engineCurrentSlotOff),
      // engineFundingIndexOff is -1 on V12_15/17/19 (this field doesn't exist in those
      // engine structs) — guard the same way the heavy parser does (slab.ts parseEngine)
      // or `base + (-1)` reads 16 bytes starting one byte before the engine region.
      fundingIndexQpbE6: l.engineFundingIndexOff >= 0 ? l.engineLastFundingSlotOff >= 0 && l.engineLastFundingSlotOff - l.engineFundingIndexOff === 8 ? BigInt(readI64LE(data, base + l.engineFundingIndexOff)) : readI128LE(data, base + l.engineFundingIndexOff) : 0n,
      lastFundingSlot: u64At(l.engineLastFundingSlotOff),
      fundingRateBpsPerSlotLast: i64At(l.engineFundingRateBpsOff),
      fundingRateE9: 0n,
      marketMode: null,
      lastCrankSlot: u64At(l.engineLastCrankSlotOff),
      maxCrankStalenessSlots: u64At(l.engineMaxCrankStalenessOff),
      totalOpenInterest: u128At(l.engineTotalOiOff),
      longOi: u128At(l.engineLongOiOff),
      shortOi: u128At(l.engineShortOiOff),
      cTot: readU128LE(data, base + l.engineCTotOff),
      pnlPosTot: readU128LE(data, base + l.enginePnlPosTotOff),
      pnlMaturedPosTot: 0n,
      liqCursor: u16At(l.engineLiqCursorOff),
      gcCursor: u16At(l.engineGcCursorOff),
      lastSweepStartSlot: u64At(l.engineLastSweepStartOff),
      lastSweepCompleteSlot: u64At(l.engineLastSweepCompleteOff),
      crankCursor: u16At(l.engineCrankCursorOff),
      sweepStartIdx: u16At(l.engineSweepStartIdxOff),
      lifetimeLiquidations: u64At(l.engineLifetimeLiquidationsOff),
      lifetimeForceCloses: u64At(l.engineLifetimeForceClosesOff),
      netLpPos: i128At(l.engineNetLpPosOff),
      lpSumAbs: u128At(l.engineLpSumAbsOff),
      lpMaxAbs: u128At(l.engineLpMaxAbsOff),
      lpMaxAbsSweep: u128At(l.engineLpMaxAbsSweepOff),
      emergencyOiMode: l.engineEmergencyOiModeOff >= 0 ? data[base + l.engineEmergencyOiModeOff] !== 0 : false,
      emergencyStartSlot: u64At(l.engineEmergencyStartSlotOff),
      lastBreakerSlot: u64At(l.engineLastBreakerSlotOff),
      markPriceE6: u64At(l.engineMarkPriceOff),
      oraclePriceE6: 0n,
      fLongNum: 0n,
      fShortNum: 0n,
      negPnlAccountCount: 0n,
      fundPxLast: 0n,
      resolvedKLongTerminalDelta: 0n,
      resolvedKShortTerminalDelta: 0n,
      resolvedLivePrice: 0n,
      numUsedAccounts: canReadNumUsed ? readU16LE(data, base + numUsedOff) : 0,
      nextAccountId: canReadNextId ? readU64LE(data, base + nextAccountIdOff) : 0n
    };
  }
  throw new Error(`parseEngineLight: unrecognized slab layout (isV0=${isV0})`);
}
function isRateLimitError(err) {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("too many requests");
}
function withJitter(delayMs) {
  const half = Math.floor(delayMs / 2);
  return half + Math.floor(Math.random() * (delayMs - half + 1));
}
async function discoverMarkets(connection, programId, options = {}) {
  const {
    sequential = false,
    interTierDelayMs = 200,
    rateLimitBackoffMs = [1e3, 3e3, 9e3, 27e3],
    maxParallelTiers = 6
  } = options;
  const ALL_TIERS_RAW = [
    ...Object.values(SLAB_TIERS),
    // v12.17 (default)
    ...Object.values(SLAB_TIERS_V12_19),
    // v12.19 (deployed mainnet)
    ...Object.values(SLAB_TIERS_V12_17),
    // v12.17 (explicit)
    ...Object.values(SLAB_TIERS_V12_15),
    // v12.15
    ...Object.values(SLAB_TIERS_V12_1),
    // v12.1
    ...Object.values(SLAB_TIERS_V0),
    ...Object.values(SLAB_TIERS_V1D),
    ...Object.values(SLAB_TIERS_V1D_LEGACY),
    ...Object.values(SLAB_TIERS_V2),
    ...Object.values(SLAB_TIERS_V1M),
    ...Object.values(SLAB_TIERS_V1M2),
    ...Object.values(SLAB_TIERS_V_ADL),
    ...Object.values(SLAB_TIERS_V_SETDEXPOOL)
  ];
  const tierBySize = /* @__PURE__ */ new Map();
  for (const tier of ALL_TIERS_RAW) {
    const existing = tierBySize.get(tier.dataSize);
    if (!existing || tier.maxAccounts > existing.maxAccounts) {
      tierBySize.set(tier.dataSize, tier);
    }
  }
  const ALL_TIERS = [...tierBySize.values()];
  let rawAccounts = [];
  async function fetchTierWithRetry(tier) {
    for (let attempt = 0; attempt <= rateLimitBackoffMs.length; attempt++) {
      try {
        const results = await connection.getProgramAccounts(programId, {
          filters: [{ dataSize: tier.dataSize }],
          dataSlice: { offset: 0, length: HEADER_SLICE_LENGTH }
        });
        return results.map((entry) => ({ ...entry, maxAccounts: tier.maxAccounts, dataSize: tier.dataSize }));
      } catch (err) {
        if (isRateLimitError(err) && attempt < rateLimitBackoffMs.length) {
          const delay = withJitter(rateLimitBackoffMs[attempt]);
          console.warn(
            `[discoverMarkets] 429 on tier dataSize=${tier.dataSize} attempt=${attempt + 1}, backing off ${delay}ms`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        console.warn(
          `[discoverMarkets] Tier query failed (dataSize=${tier.dataSize}, attempt=${attempt + 1}):`,
          err instanceof Error ? err.message : err
        );
        return [];
      }
    }
    return [];
  }
  const maxTierQueries = options.maxTierQueries ?? ALL_TIERS.length;
  const tiersToQuery = ALL_TIERS.slice(0, maxTierQueries);
  const effectiveMaxParallelTiers = Math.max(1, Number.isFinite(maxParallelTiers) ? maxParallelTiers : 6);
  try {
    if (sequential) {
      for (let i = 0; i < tiersToQuery.length; i++) {
        const tier = tiersToQuery[i];
        const entries = await fetchTierWithRetry(tier);
        rawAccounts.push(...entries);
        if (i < tiersToQuery.length - 1) {
          await new Promise((r) => setTimeout(r, interTierDelayMs));
        }
      }
    } else {
      for (let offset = 0; offset < tiersToQuery.length; offset += effectiveMaxParallelTiers) {
        const chunk = tiersToQuery.slice(offset, offset + effectiveMaxParallelTiers);
        const queries = chunk.map(
          (tier) => connection.getProgramAccounts(programId, {
            filters: [{ dataSize: tier.dataSize }],
            dataSlice: { offset: 0, length: HEADER_SLICE_LENGTH }
          }).then(
            (results2) => results2.map((entry) => ({
              ...entry,
              maxAccounts: tier.maxAccounts,
              dataSize: tier.dataSize
            }))
          )
        );
        const results = await Promise.allSettled(queries);
        for (const result of results) {
          if (result.status === "fulfilled") {
            for (const entry of result.value) {
              rawAccounts.push(entry);
            }
          } else {
            console.warn(
              "[discoverMarkets] Tier query rejected:",
              result.reason instanceof Error ? result.reason.message : result.reason
            );
          }
        }
      }
    }
    try {
      const v17Results = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: Buffer.from(V17_MAGIC_BYTES).toString("base64"),
              encoding: "base64"
            }
          }
        ],
        dataSlice: { offset: 0, length: HEADER_SLICE_LENGTH }
      });
      for (const e of v17Results) {
        rawAccounts.push({ ...e, maxAccounts: 0, dataSize: e.account.data.length });
      }
    } catch {
    }
    if (rawAccounts.length === 0) {
      console.warn("[discoverMarkets] dataSize filters returned 0 markets, falling back to memcmp");
      const fallback = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: "F6P2QNqpQV5"
              // base58 of TALOCREP (u64 LE magic)
            }
          }
        ]
      });
      rawAccounts = [...fallback].map((e) => {
        const len = e.account.data.length;
        const lay = detectSlabLayout(len, new Uint8Array(e.account.data));
        return { ...e, maxAccounts: lay?.maxAccounts ?? 4096, dataSize: len };
      });
    }
  } catch (err) {
    console.warn(
      "[discoverMarkets] dataSize filters failed, falling back to memcmp:",
      err instanceof Error ? err.message : err
    );
    try {
      const fallback = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: "F6P2QNqpQV5"
              // base58 of TALOCREP (u64 LE magic)
            }
          }
        ]
      });
      rawAccounts = [...fallback].map((e) => {
        const len = e.account.data.length;
        const lay = detectSlabLayout(len, new Uint8Array(e.account.data));
        return { ...e, maxAccounts: lay?.maxAccounts ?? 4096, dataSize: len };
      });
    } catch (memcmpErr) {
      console.warn(
        "[discoverMarkets] memcmp fallback also failed:",
        memcmpErr instanceof Error ? memcmpErr.message : memcmpErr
      );
    }
  }
  if (rawAccounts.length === 0 && options.apiBaseUrl) {
    console.warn(
      "[discoverMarkets] RPC discovery returned 0 markets, falling back to REST API"
    );
    try {
      const apiResult = await discoverMarketsViaApi(
        connection,
        programId,
        options.apiBaseUrl,
        { timeoutMs: options.apiTimeoutMs }
      );
      if (apiResult.length > 0) {
        return apiResult;
      }
      console.warn(
        "[discoverMarkets] REST API returned 0 markets, checking tier-3 static bundle"
      );
    } catch (apiErr) {
      console.warn(
        "[discoverMarkets] API fallback also failed:",
        apiErr instanceof Error ? apiErr.message : apiErr
      );
    }
  }
  if (rawAccounts.length === 0 && options.network) {
    const staticEntries = getStaticMarkets(options.network);
    if (staticEntries.length > 0) {
      console.warn(
        `[discoverMarkets] Tier 1+2 failed, falling back to static bundle (${staticEntries.length} addresses for ${options.network})`
      );
      try {
        return await discoverMarketsViaStaticBundle(
          connection,
          programId,
          staticEntries
        );
      } catch (staticErr) {
        console.warn(
          "[discoverMarkets] Static bundle fallback also failed:",
          staticErr instanceof Error ? staticErr.message : staticErr
        );
      }
    } else {
      console.warn(
        `[discoverMarkets] Static bundle has 0 entries for ${options.network} \u2014 skipping tier 3`
      );
    }
  }
  const accounts = rawAccounts;
  const markets = [];
  const seenPubkeys = /* @__PURE__ */ new Set();
  for (const { pubkey, account, maxAccounts, dataSize } of accounts) {
    const pkStr = pubkey.toBase58();
    if (seenPubkeys.has(pkStr)) continue;
    seenPubkeys.add(pkStr);
    const data = new Uint8Array(account.data);
    if (isV17MarketAccount(data)) {
      try {
        const configV17 = parseWrapperConfigV17(data);
        markets.push({
          slabAddress: pubkey,
          programId,
          header: {},
          config: {},
          engine: {},
          params: {},
          configV17
        });
      } catch (err) {
        console.warn(
          `[discoverMarkets] Failed to parse v17 account ${pkStr}:`,
          err instanceof Error ? err.message : err
        );
      }
      continue;
    }
    let valid = true;
    for (let i = 0; i < MAGIC_BYTES.length; i++) {
      if (data[i] !== MAGIC_BYTES[i]) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    const layout = detectSlabLayout(dataSize, data);
    if (!layout) {
      console.warn(
        `[discoverMarkets] Skipping account ${pkStr}: unrecognized layout for dataSize=${dataSize}`
      );
      continue;
    }
    try {
      const header = parseHeader(data);
      const config = parseConfig(data, layout);
      const engine = parseEngineLight(data, layout, maxAccounts);
      const params = parseParams(data, layout);
      markets.push({ slabAddress: pubkey, programId, header, config, engine, params });
    } catch (err) {
      console.warn(
        `[discoverMarkets] Failed to parse account ${pubkey.toBase58()}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return markets;
}
async function getMarketsByAddress(connection, programId, addresses, options = {}) {
  if (addresses.length === 0) return [];
  const {
    batchSize = 100,
    interBatchDelayMs = 0
  } = options;
  const effectiveBatchSize = Math.max(1, Math.min(batchSize, 100));
  const fetched = [];
  for (let offset = 0; offset < addresses.length; offset += effectiveBatchSize) {
    const batch = addresses.slice(offset, offset + effectiveBatchSize);
    const response = await connection.getMultipleAccountsInfo(batch);
    for (let i = 0; i < batch.length; i++) {
      const info = response[i];
      if (info && info.data) {
        if (!info.owner.equals(programId)) {
          console.warn(
            `[getMarketsByAddress] Skipping ${batch[i].toBase58()}: owner mismatch (expected ${programId.toBase58()}, got ${info.owner.toBase58()})`
          );
          continue;
        }
        fetched.push({ pubkey: batch[i], data: info.data });
      }
    }
    if (interBatchDelayMs > 0 && offset + effectiveBatchSize < addresses.length) {
      await new Promise((r) => setTimeout(r, interBatchDelayMs));
    }
  }
  const markets = [];
  for (const entry of fetched) {
    if (!entry) continue;
    const { pubkey, data: rawData } = entry;
    const data = new Uint8Array(rawData);
    if (isV17MarketAccount(data)) {
      try {
        const configV17 = parseWrapperConfigV17(data);
        markets.push({
          slabAddress: pubkey,
          programId,
          header: {},
          config: {},
          engine: {},
          params: {},
          configV17
        });
      } catch (err) {
        console.warn(
          `[getMarketsByAddress] Failed to parse v17 account ${pubkey.toBase58()}:`,
          err instanceof Error ? err.message : err
        );
      }
      continue;
    }
    let valid = true;
    for (let i = 0; i < MAGIC_BYTES.length; i++) {
      if (data[i] !== MAGIC_BYTES[i]) {
        valid = false;
        break;
      }
    }
    if (!valid) {
      console.warn(
        `[getMarketsByAddress] Skipping ${pubkey.toBase58()}: invalid magic bytes`
      );
      continue;
    }
    const layout = detectSlabLayout(data.length, data);
    if (!layout) {
      console.warn(
        `[getMarketsByAddress] Skipping ${pubkey.toBase58()}: unrecognized layout for dataSize=${data.length}`
      );
      continue;
    }
    try {
      const header = parseHeader(data);
      const config = parseConfig(data, layout);
      const engine = parseEngineLight(data, layout, layout.maxAccounts);
      const params = parseParams(data, layout);
      markets.push({ slabAddress: pubkey, programId, header, config, engine, params });
    } catch (err) {
      console.warn(
        `[getMarketsByAddress] Failed to parse account ${pubkey.toBase58()}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return markets;
}
async function discoverMarketsViaApi(connection, programId, apiBaseUrl, options = {}) {
  const { timeoutMs = 1e4, onChainOptions } = options;
  const base = apiBaseUrl.replace(/\/+$/, "");
  const url = `${base}/markets`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(
      `[discoverMarketsViaApi] API returned ${response.status} ${response.statusText} from ${url}`
    );
  }
  const body = await response.json();
  const apiMarkets = body.markets;
  if (!Array.isArray(apiMarkets) || apiMarkets.length === 0) {
    console.warn("[discoverMarketsViaApi] API returned 0 markets");
    return [];
  }
  const addresses = [];
  for (const entry of apiMarkets) {
    if (!entry.slab_address || typeof entry.slab_address !== "string") continue;
    try {
      addresses.push(new PublicKey(entry.slab_address));
    } catch {
      console.warn(
        `[discoverMarketsViaApi] Skipping invalid slab address: ${entry.slab_address}`
      );
    }
  }
  if (addresses.length === 0) {
    console.warn("[discoverMarketsViaApi] No valid slab addresses from API");
    return [];
  }
  console.log(
    `[discoverMarketsViaApi] API returned ${addresses.length} slab addresses, fetching on-chain data`
  );
  return getMarketsByAddress(connection, programId, addresses, onChainOptions);
}
async function discoverMarketsViaStaticBundle(connection, programId, entries, options = {}) {
  if (entries.length === 0) return [];
  const addresses = [];
  for (const entry of entries) {
    if (!entry.slabAddress || typeof entry.slabAddress !== "string") continue;
    try {
      addresses.push(new PublicKey(entry.slabAddress));
    } catch {
      console.warn(
        `[discoverMarketsViaStaticBundle] Skipping invalid slab address: ${entry.slabAddress}`
      );
    }
  }
  if (addresses.length === 0) {
    console.warn("[discoverMarketsViaStaticBundle] No valid slab addresses in static bundle");
    return [];
  }
  console.log(
    `[discoverMarketsViaStaticBundle] Fetching ${addresses.length} slab addresses on-chain`
  );
  return getMarketsByAddress(connection, programId, addresses, options.onChainOptions);
}
export {
  SLAB_TIERS,
  SLAB_TIERS_V0,
  SLAB_TIERS_V1,
  SLAB_TIERS_V1D,
  SLAB_TIERS_V1D_LEGACY,
  SLAB_TIERS_V_ADL_DISCOVERY,
  discoverMarkets,
  discoverMarketsViaApi,
  discoverMarketsViaStaticBundle,
  getMarketsByAddress,
  parseEngineLight,
  slabDataSize,
  slabDataSizeV1,
  validateSlabTierMatch
};
//# sourceMappingURL=discovery.js.map