const CHAINLINK_MIN_SIZE = 248;
const MAX_DECIMALS = 18;
const CHAINLINK_DECIMALS_OFFSET = 138;
const CHAINLINK_TIMESTAMP_OFFSET = 208;
const CHAINLINK_ANSWER_OFFSET = 216;
function readU8(data, off) {
  return data[off];
}
function readBigInt64LE(data, off) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigInt64(off, true);
}
function readBigUint64LE(data, off) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(off, true);
}
function readU32LE(data, off) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(off, true);
}
const DEFAULT_FUTURE_TOLERANCE_SECONDS = 60;
function parseChainlinkPrice(data, options) {
  if (data.length < CHAINLINK_MIN_SIZE) {
    throw new Error(
      `Oracle account data too small: ${data.length} bytes (need at least ${CHAINLINK_MIN_SIZE})`
    );
  }
  const decimals = readU8(data, CHAINLINK_DECIMALS_OFFSET);
  if (decimals > MAX_DECIMALS) {
    throw new Error(
      `Oracle decimals out of range: ${decimals} (max ${MAX_DECIMALS})`
    );
  }
  const answer = readBigInt64LE(data, CHAINLINK_ANSWER_OFFSET + 8) << 64n | readBigUint64LE(data, CHAINLINK_ANSWER_OFFSET);
  if (answer <= 0n) {
    throw new Error(
      `Oracle price is non-positive: ${answer}`
    );
  }
  const price = answer;
  const updatedAt = readU32LE(data, CHAINLINK_TIMESTAMP_OFFSET);
  if (options?.maxStalenessSeconds !== void 0) {
    if (updatedAt <= 0) {
      throw new Error(
        `Oracle has no valid publish timestamp (updatedAt=${updatedAt})`
      );
    }
    const now = Math.floor(Date.now() / 1e3);
    const age = now - updatedAt;
    const futureTolerance = options.futureToleranceSeconds ?? DEFAULT_FUTURE_TOLERANCE_SECONDS;
    if (age < -futureTolerance) {
      throw new Error(
        `Oracle publish timestamp is ${-age}s in the future (tolerance ${futureTolerance}s) \u2014 check the feed or the local clock`
      );
    }
    if (age > options.maxStalenessSeconds) {
      throw new Error(
        `Oracle price is stale: last updated ${age}s ago (max ${options.maxStalenessSeconds}s)`
      );
    }
  }
  return { price, decimals, updatedAt: updatedAt > 0 ? updatedAt : void 0 };
}
function isValidChainlinkOracle(data) {
  try {
    parseChainlinkPrice(data);
    return true;
  } catch {
    return false;
  }
}
export {
  CHAINLINK_ANSWER_OFFSET,
  CHAINLINK_DECIMALS_OFFSET,
  CHAINLINK_MIN_SIZE,
  CHAINLINK_TIMESTAMP_OFFSET,
  MAX_DECIMALS,
  isValidChainlinkOracle,
  parseChainlinkPrice
};
//# sourceMappingURL=oracle.js.map