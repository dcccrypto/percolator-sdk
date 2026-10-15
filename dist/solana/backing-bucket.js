import {
  V17_MARKET_GROUP_OFF,
  V17_MARKET_GROUP_LEN,
  V17_MARKET_ASSET_SLOT_LEN,
  isV17MarketAccount
} from "./slab.js";
function readU8At(data, off) {
  if (off + 1 > data.length) throw new Error(`readU8At: out of bounds at ${off}`);
  return data[off];
}
function readU32LEAt(data, off) {
  if (off + 4 > data.length) throw new Error(`readU32LEAt: out of bounds at ${off}`);
  return new DataView(data.buffer, data.byteOffset + off, 4).getUint32(0, true);
}
function readU64LEAt(data, off) {
  if (off + 8 > data.length) throw new Error(`readU64LEAt: out of bounds at ${off}`);
  return new DataView(data.buffer, data.byteOffset + off, 8).getBigUint64(0, true);
}
function readU128LEAt(data, off) {
  if (off + 16 > data.length) throw new Error(`readU128LEAt: out of bounds at ${off}`);
  const dv = new DataView(data.buffer, data.byteOffset + off, 16);
  const lo = dv.getBigUint64(0, true);
  const hi = dv.getBigUint64(8, true);
  return hi << 64n | lo;
}
const V17_GROUP_CONFIG_REL = 32;
const V17_GROUP_CURRENT_SLOT_REL = 613;
const V17_GROUP_MODE_REL = 626;
const V17_CONFIG_MAX_MARKET_SLOTS_REL = 2;
const V17_ASSET_SLOT_WRAPPER_LEN = 1024;
const V17_ENGINE_BACKING_LONG_REL = 963;
const V17_ENGINE_BACKING_SHORT_REL = 1060;
const V17_BACKING_BUCKET_LEN = 97;
const BB_MARKET_ID = 0;
const BB_FRESH_UNLIENED = 8;
const BB_VALID_LIENED = 24;
const BB_CONSUMED_LIENED = 40;
const BB_IMPAIRED_LIENED = 56;
const BB_UTILIZATION_FEE = 72;
const BB_EXPIRY_SLOT = 88;
const BB_STATUS = 96;
const V17_MARKET_MODE_LIVE = 0;
var BackingBucketStatus = /* @__PURE__ */ ((BackingBucketStatus2) => {
  BackingBucketStatus2[BackingBucketStatus2["Empty"] = 0] = "Empty";
  BackingBucketStatus2[BackingBucketStatus2["Fresh"] = 1] = "Fresh";
  BackingBucketStatus2[BackingBucketStatus2["Expired"] = 2] = "Expired";
  BackingBucketStatus2[BackingBucketStatus2["Impaired"] = 3] = "Impaired";
  return BackingBucketStatus2;
})(BackingBucketStatus || {});
function backingBucketStatusName(status) {
  switch (status) {
    case 0 /* Empty */:
      return "Empty";
    case 1 /* Fresh */:
      return "Fresh";
    case 2 /* Expired */:
      return "Expired";
    case 3 /* Impaired */:
      return "Impaired";
    default:
      return `Unknown(${status})`;
  }
}
function isBackingBucketExpirable(bucket, ctx) {
  if (ctx.mode !== V17_MARKET_MODE_LIVE) return false;
  if (bucket.domain < 0 || bucket.domain >= ctx.addressableDomainCount) return false;
  if (bucket.status !== 1 /* Fresh */) return false;
  return ctx.nowSlot >= bucket.expirySlot;
}
function parseBackingBucketsV17(data, opts = {}) {
  const MIN_LEN = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseBackingBucketsV17: buffer too short \u2014 need >= ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  if (!isV17MarketAccount(data)) {
    throw new Error(
      "parseBackingBucketsV17: not a v17 market account (bad magic, version, or kind)"
    );
  }
  const groupOff = V17_MARKET_GROUP_OFF;
  const mode = readU8At(data, groupOff + V17_GROUP_MODE_REL);
  const headerCurrentSlot = readU64LEAt(data, groupOff + V17_GROUP_CURRENT_SLOT_REL);
  const maxMarketSlots = readU32LEAt(
    data,
    groupOff + V17_GROUP_CONFIG_REL + V17_CONFIG_MAX_MARKET_SLOTS_REL
  );
  const chainSlot = opts.chainSlot === void 0 ? 0n : BigInt(opts.chainSlot);
  if (chainSlot < 0n) {
    throw new Error(`parseBackingBucketsV17: chainSlot must be non-negative, got ${chainSlot}`);
  }
  const nowSlot = chainSlot > headerCurrentSlot ? chainSlot : headerCurrentSlot;
  const slotsBase = groupOff + V17_MARKET_GROUP_LEN;
  const physicalAssetSlots = Math.max(
    0,
    Math.floor((data.length - slotsBase) / V17_MARKET_ASSET_SLOT_LEN)
  );
  const addressableAssetSlots = Math.min(maxMarketSlots, physicalAssetSlots);
  const addressableDomainCount = addressableAssetSlots * 2;
  const ctx = { mode, nowSlot, addressableDomainCount };
  const buckets = [];
  for (let assetIndex = 0; assetIndex < addressableAssetSlots; assetIndex++) {
    const engineBase = slotsBase + assetIndex * V17_MARKET_ASSET_SLOT_LEN + V17_ASSET_SLOT_WRAPPER_LEN;
    for (const side of ["long", "short"]) {
      const bucketOff = engineBase + (side === "long" ? V17_ENGINE_BACKING_LONG_REL : V17_ENGINE_BACKING_SHORT_REL);
      if (bucketOff + V17_BACKING_BUCKET_LEN > data.length) break;
      const domain = assetIndex * 2 + (side === "short" ? 1 : 0);
      const status = readU8At(data, bucketOff + BB_STATUS);
      const expirySlot = readU64LEAt(data, bucketOff + BB_EXPIRY_SLOT);
      const lapsed = status === 1 /* Fresh */ && nowSlot >= expirySlot;
      const bucket = {
        domain,
        assetIndex,
        side,
        marketId: readU64LEAt(data, bucketOff + BB_MARKET_ID),
        freshUnlienedBackingNum: readU128LEAt(data, bucketOff + BB_FRESH_UNLIENED),
        validLienedBackingNum: readU128LEAt(data, bucketOff + BB_VALID_LIENED),
        consumedLienedBackingNum: readU128LEAt(data, bucketOff + BB_CONSUMED_LIENED),
        impairedLienedBackingNum: readU128LEAt(data, bucketOff + BB_IMPAIRED_LIENED),
        utilizationFeeEarnings: readU128LEAt(data, bucketOff + BB_UTILIZATION_FEE),
        expirySlot,
        status,
        statusName: backingBucketStatusName(status),
        lapsed,
        expirable: false
      };
      bucket.expirable = isBackingBucketExpirable(bucket, ctx);
      buckets.push(bucket);
    }
  }
  return {
    mode,
    headerCurrentSlot,
    nowSlot,
    maxMarketSlots,
    physicalAssetSlots,
    addressableDomainCount,
    buckets
  };
}
function findExpirableBackingDomains(data, opts = {}) {
  return parseBackingBucketsV17(data, opts).buckets.filter((b) => b.expirable).map((b) => b.domain);
}
export {
  BackingBucketStatus,
  V17_ASSET_SLOT_WRAPPER_LEN,
  V17_BACKING_BUCKET_LEN,
  V17_CONFIG_MAX_MARKET_SLOTS_REL,
  V17_ENGINE_BACKING_LONG_REL,
  V17_ENGINE_BACKING_SHORT_REL,
  V17_GROUP_CONFIG_REL,
  V17_GROUP_CURRENT_SLOT_REL,
  V17_GROUP_MODE_REL,
  V17_MARKET_MODE_LIVE,
  backingBucketStatusName,
  findExpirableBackingDomains,
  isBackingBucketExpirable,
  parseBackingBucketsV17
};
//# sourceMappingURL=backing-bucket.js.map