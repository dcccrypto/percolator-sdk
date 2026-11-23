/**
 * Byte-exact tests for the remaining branches of src/abi/instructions.ts:
 *  - encodeInitMarket v12 compat shim (hMin/hMax fallbacks, extendedTail defaults)
 *  - encodeFeedId (0x prefix / bare / invalid input)
 *  - derivePythPriceUpdateAccount argument guards
 *
 * Decoding uses an independent DataView reader, never the SDK enc* helpers.
 */
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import * as ix from "../src/abi/instructions.js";

const { IX_TAG } = ix;

function decodeInitMarket(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0;
  const u8 = () => dv.getUint8(o++);
  const u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  const u64 = () => { const v = dv.getBigUint64(o, true); o += 8; return v; };
  const u128 = () => { const lo = u64(); const hi = u64(); return (hi << 64n) | lo; };
  const r = {
    len: b.length,
    tag: u8(),
    maxPortfolioAssets: u16(),
    hMin: u64(), hMax: u64(), price: u64(),
    mmReq: u128(), imReq: u128(),
    mmBps: u64(), imBps: u64(), maxTradingFeeBps: u64(), tradeFeeBaseBps: u64(), liqFeeBps: u64(),
    liqCap: u128(), minLiq: u128(),
    maxPriceMove: u64(), maxAccrualDt: u64(), maxFunding: u64(), minFundingLife: u64(),
    bSettleChunks: u64(), bankruptChunks: u64(), bankruptLife: u64(),
    maintFee: u128(), // upstream 083a0d08: no public_b_chunk_atoms before it
  };
  expect(o, "trailing/missing bytes").toBe(b.length);
  return r;
}

const baseV12 = {
  admin: PublicKey.default,
  collateralMint: PublicKey.default,
  indexFeedId: "00".repeat(32),
  maxStalenessSecs: 60n,
  confFilterBps: 100,
  invert: 0,
  unitScale: 0,
  initialMarkPriceE6: 1_500_000n,
  maintenanceMarginBps: 500n,
  initialMarginBps: 1000n,
  tradingFeeBps: 12n,
  maxAccounts: "256",
  newAccountFee: 0n,
  maintenanceFeePerSlot: 77n,
  maxCrankStalenessSlots: 300n,
  liquidationFeeBps: 50n,
  liquidationFeeCap: 10_000n,
  minLiquidationAbs: 5n,
  minNonzeroMmReq: 11n,
  minNonzeroImReq: 22n,
};

describe("encodeInitMarket v12 compat shim", () => {
  it("falls back to warmupPeriodSlots for hMin/hMax and defaults the tail", () => {
    const d = decodeInitMarket(
      ix.encodeInitMarket({ ...baseV12, warmupPeriodSlots: 4242n } as any),
    );
    expect(d).toEqual({
      len: 203,
      tag: IX_TAG.InitMarket,
      maxPortfolioAssets: 256,
      hMin: 4242n, hMax: 4242n, price: 1_500_000n,
      mmReq: 11n, imReq: 22n,
      mmBps: 500n, imBps: 1000n, maxTradingFeeBps: 12n, tradeFeeBaseBps: 12n, liqFeeBps: 50n,
      liqCap: 10_000n, minLiq: 5n,
      maxPriceMove: 4n, maxAccrualDt: 300n, maxFunding: 1000n, minFundingLife: 0n,
      bSettleChunks: 10n, bankruptChunks: 10n, bankruptLife: 500n,
      maintFee: 77n,
    });
  });

  it("explicit hMin/hMax win over warmup; extendedTail overrides price-move and funding", () => {
    const d = decodeInitMarket(
      ix.encodeInitMarket({
        ...baseV12,
        maxAccounts: 64n,
        warmupPeriodSlots: 9n,
        hMin: 3n,
        hMax: 7n,
        extendedTail: { maxPriceMoveBpsPerSlot: 25n, fundingMaxBpsPerSlot: 33n },
      } as any),
    );
    expect(d.maxPortfolioAssets).toBe(64);
    expect(d.hMin).toBe(3n);
    expect(d.hMax).toBe(7n);
    expect(d.maxPriceMove).toBe(25n);
    expect(d.maxFunding).toBe(33n);
    expect(d.maxAccrualDt).toBe(300n);
  });

  it("defaults hMin/hMax to 0 when neither hMin/hMax nor warmup is given", () => {
    const d = decodeInitMarket(ix.encodeInitMarket(baseV12 as any));
    expect(d.hMin).toBe(0n);
    expect(d.hMax).toBe(0n);
    expect(d.tag).toBe(IX_TAG.InitMarket);
  });
});

describe("encodeFeedId", () => {
  const hex = "ab".repeat(16) + "01".repeat(16);
  const expected = new Uint8Array([...Array(16).fill(0xab), ...Array(16).fill(0x01)]);

  it("decodes a bare 64-char hex string", () => {
    expect(Array.from(ix.encodeFeedId(hex))).toEqual(Array.from(expected));
  });
  it("strips a 0x prefix", () => {
    expect(Array.from(ix.encodeFeedId("0x" + hex))).toEqual(Array.from(expected));
  });
  it("rejects wrong length and non-hex input with distinct messages", () => {
    expect(() => ix.encodeFeedId("abcd")).toThrow('got "4 chars"');
    expect(() => ix.encodeFeedId("zz".repeat(32))).toThrow('got "non-hex characters"');
  });
});

describe("derivePythPriceUpdateAccount guards", () => {
  const feed = new Uint8Array(32).fill(7);

  it("derives the PDA from [shard_le_u16, feed] under the Pyth receiver", async () => {
    const shard = 258; // 0x0102 -> bytes 02 01
    const [expected] = PublicKey.findProgramAddressSync(
      [new Uint8Array([0x02, 0x01]), feed],
      new PublicKey(ix.PYTH_RECEIVER_PROGRAM_ID),
    );
    expect(await ix.derivePythPriceUpdateAccount(feed, shard)).toBe(expected.toBase58());
    const [def] = PublicKey.findProgramAddressSync(
      [new Uint8Array([0, 0]), feed],
      new PublicKey(ix.PYTH_RECEIVER_PROGRAM_ID),
    );
    expect(await ix.derivePythPriceUpdateAccount(feed)).toBe(def.toBase58());
  });

  it("rejects bad feed ids (wrong length, non-Uint8Array)", async () => {
    await expect(ix.derivePythPriceUpdateAccount(new Uint8Array(31))).rejects.toThrow(/got 31/);
    await expect(ix.derivePythPriceUpdateAccount(undefined as any)).rejects.toThrow(/got invalid/);
  });

  it("rejects non-u16 shard ids", async () => {
    await expect(ix.derivePythPriceUpdateAccount(feed, -1)).rejects.toThrow(/u16/);
    await expect(ix.derivePythPriceUpdateAccount(feed, 0x10000)).rejects.toThrow(/u16/);
    await expect(ix.derivePythPriceUpdateAccount(feed, 1.5)).rejects.toThrow(/u16/);
  });
});
