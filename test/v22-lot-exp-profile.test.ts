import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { parseAssetOracleProfileV17 } from "../src/solana/slab.js";
import { V17_ASSET_ORACLE_PROFILE_LEN } from "../src/solana/slab.js";
import {
  lotExpOfProfileV22, pythPriceToLotE6V22, lotPriceToTokenE6V22, tokenPriceToLotE6V22, lotsToTokensV22,
  tokenQToQV22, qToTokenQV22, displayPriceV22,
  ORACLE_MODE_V22, lotAllowedForOracleModeV22, encodeInitMarketTrailerV22,
} from "../src/abi/index.js";

const profile = (lot: number, mode = 0) => {
  const d = new Uint8Array(V17_ASSET_ORACLE_PROFILE_LEN + 8);
  d[8 + 0] = mode;
  d[8 + 19] = lot;
  return d;
};

describe("lot_exp decode from the asset oracle profile", () => {
  it("reads byte +19 at lot 0 and lot 6", () => {
    expect(parseAssetOracleProfileV17(profile(0), 8).lotExp).toBe(0);
    expect(parseAssetOracleProfileV17(profile(6, 1), 8).lotExp).toBe(6);
    expect(lotExpOfProfileV22(profile(15), 8)).toBe(15);
  });
  it("rejects a byte above 15 and a short block", () => {
    expect(() => lotExpOfProfileV22(profile(16), 8)).toThrow(RangeError);
    expect(() => lotExpOfProfileV22(new Uint8Array(10), 0)).toThrow(RangeError);
  });
});

describe("price / size helpers at lot 0 and lot 6", () => {
  it("Pyth $3e-7: unreadable at lot 0, 300000 at lot 6", () => {
    expect(pythPriceToLotE6V22(3_000n, -10, 0)).toBe(0n);
    expect(pythPriceToLotE6V22(3_000n, -10, 6)).toBe(300_000n);
  });
  it("expo finer than -12 truncates at E12 first, like the program", () => {
    expect(pythPriceToLotE6V22(12_345n, -14, 15)).toBe(123_000_000_000n);
  });
  it("lot 0 is the per-token e6 price unchanged", () => {
    expect(pythPriceToLotE6V22(150_000_000n, -8, 0)).toBe(1_500_000n);
    expect(lotPriceToTokenE6V22(1_234_567n, 0)).toBe(1_234_567n);
    expect(tokenPriceToLotE6V22(1_234_567n, 0)).toBe(1_234_567n);
    expect(displayPriceV22(1_234_567n, 0)).toBe("1.234567");
    expect(lotsToTokensV22(7n, 0)).toBe(7n);
    expect(qToTokenQV22(5n, 0)).toBe(5n);
  });
  it("lot 6: per-token price = e6 / 1e6 / 1e6", () => {
    expect(displayPriceV22(300_000n, 6)).toBe("0.0000003");
    expect(tokenPriceToLotE6V22(1n, 6)).toBe(1_000_000n);
    expect(lotPriceToTokenE6V22(300_000n, 6)).toBe(0n);
    expect(lotsToTokensV22(3n, 6)).toBe(3_000_000n);
    expect(tokenQToQV22(2_500_000_000_000n, 6)).toEqual({ q: 2_500_000n, remainderTokenQ: 0n });
    expect(tokenQToQV22(2_500_000_000_001n, 6)).toEqual({ q: 2_500_000n, remainderTokenQ: 1n });
  });
});

describe("InitMarket trailer: lot vs oracle mode (prog profile_lot_and_p4_bytes_ok, #711)", () => {
  const t = { rGapBps: 500, lLaunchX100: 550, lotExp: 6 };
  it("accepts a lot on Manual, Hybrid and AuthMark, refuses it on EWMA", () => {
    for (const m of [ORACLE_MODE_V22.Manual, ORACLE_MODE_V22.Hybrid, ORACLE_MODE_V22.AuthMark]) {
      expect(lotAllowedForOracleModeV22(m, 6)).toBe(true);
      expect(encodeInitMarketTrailerV22({ ...t, oracleMode: m })).toEqual(encodeInitMarketTrailerV22(t));
    }
    expect(lotAllowedForOracleModeV22(ORACLE_MODE_V22.EwmaMark, 6)).toBe(false);
    expect(() => encodeInitMarketTrailerV22({ ...t, oracleMode: ORACLE_MODE_V22.EwmaMark })).toThrow(/EWMA/);
  });
  it("lot 0 is allowed on every mode", () => {
    for (const m of [0, 1, 2, 3]) expect(lotAllowedForOracleModeV22(m, 0)).toBe(true);
    expect(lotAllowedForOracleModeV22(1, 16)).toBe(false);
  });
  it("lot 0 regression: no-lot trailer bytes are unchanged (4 bytes, oracleMode ignored)", () => {
    const base = encodeInitMarketTrailerV22({ rGapBps: 500, lLaunchX100: 550 });
    expect(Array.from(base)).toEqual([0xf4, 0x01, 0x26, 0x02]);
    expect(encodeInitMarketTrailerV22({ rGapBps: 500, lLaunchX100: 550, oracleMode: ORACLE_MODE_V22.EwmaMark })).toEqual(base);
    expect(Array.from(encodeInitMarketTrailerV22(t))).toEqual([0xf4, 0x01, 0x26, 0x02, 6]);
    expect(() => encodeInitMarketTrailerV22({ ...t, lotExp: 0 })).toThrow();
  });
});
