/** P2b lock exits: tags 104/105, episode record, h-lock byte, codes 120..122 (percolator-prog #525). */
import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  IX_TAG_P2B, encodeAdlWindDown, buildAdlWindDownIx, encodeSetAdlWindDownMaxSlots, decodeAdlEpisodeRecord,
  adlEpisodeSlotsRemaining, isBankruptcyHlockActive, decodeBankruptcyHlock, adlWindDownDustNotionalAtoms,
  ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS, adlEpisodeKey,
} from "../src/abi/p2b-lock-exits.js";
import { PERCOLATOR_ERRORS } from "../src/abi/errors.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

describe("P2b tags", () => {
  it("tag 104 wire = [104, now u64, asset u16, portfolio_id u64, position_epoch u64] (27 B)", () => {
    expect(IX_TAG_P2B.AdlWindDown).toBe(104);
    const d = encodeAdlWindDown({ nowSlot: 1n, assetIndex: 0, portfolioId: 7n, positionEpoch: 2n });
    expect(d.length).toBe(27);
    expect(hex(d)).toBe("68" + "0100000000000000" + "0000" + "0700000000000000" + "0200000000000000");
  });
  it("tag 104 accounts: no signer; mint at [3]; oracle accounts after", () => {
    const k = () => Keypair.generate().publicKey;
    const ix = buildAdlWindDownIx(k(), { caller: k(), market: k(), portfolio: k(), collateralMint: k() },
      { nowSlot: 0n, assetIndex: 0, portfolioId: 1n, positionEpoch: 0n }, [k()]);
    expect(ix.keys.length).toBe(5);
    expect(ix.keys.every((m) => !m.isSigner)).toBe(true);
    expect(ix.keys[1].isWritable && ix.keys[2].isWritable).toBe(true);
  });
  it("tag 105 wire = [105, asset u16, max u32]; only 1..=9000", () => {
    expect(hex(encodeSetAdlWindDownMaxSlots({ assetIndex: 0, maxEpisodeSlots: 300 }))).toBe("69" + "0000" + "2c010000");
    expect(() => encodeSetAdlWindDownMaxSlots({ assetIndex: 0, maxEpisodeSlots: 0 })).toThrow();
    expect(() => encodeSetAdlWindDownMaxSlots({ assetIndex: 0, maxEpisodeSlots: 9001 })).toThrow();
  });
});

describe("episode record (risk-limits bytes 42..64)", () => {
  it("decodes the rustc layout (P2b owns 44..64) and computes remaining slots", () => {
    const rec = new Uint8Array(64);
    const v = new DataView(rec.buffer);
    rec[42] = 0x34; rec[43] = 0x12; // senior floor (prog #526): not P2b's, ignored
    const mid = 0x51234n;
    const [kl, ks] = adlEpisodeKey(mid, 3n, 4n);
    v.setUint32(44, 0, true);
    v.setBigUint64(48, 1000n, true);
    v.setUint32(56, kl, true);
    v.setUint32(60, ks, true);
    const ep = decodeAdlEpisodeRecord(rec);
    expect(ep).toMatchObject({ maxEpisodeSlots: 0, effectiveMaxEpisodeSlots: ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS, sinceSlot: 1000n, epochKeyLong: kl, epochKeyShort: ks });
    expect(adlEpisodeSlotsRemaining(ep, mid, 3n, 4n, 1000n)).toBe(9000n);
    expect(adlEpisodeSlotsRemaining(ep, mid, 3n, 4n, 10_000n)).toBe(0n);
    expect(adlEpisodeSlotsRemaining(ep, mid + 1n, 3n, 4n, 10_000n)).toBeNull(); // new market: re-arms
    expect(adlEpisodeSlotsRemaining(ep, mid, 4n, 4n, 10_000n)).toBeNull(); // a reset happened
  });
  it("adlEpisodeKey matches the program's mix (pinned vector)", () => {
    // processor::adl_episode_key(1, 0, 0): mix = 1 * 0x9E3779B1
    expect(adlEpisodeKey(1n, 0n, 0n)).toEqual([0x9e3779b1, 0x79b19e37]);
  });
  it("dust bound is 10^decimals", () => {
    expect(adlWindDownDustNotionalAtoms(6)).toBe(1_000_000n);
    expect(adlWindDownDustNotionalAtoms(9)).toBe(1_000_000_000n);
  });
});

describe("h-lock byte", () => {
  it("active iff non-zero; attribution decoded", () => {
    expect(isBankruptcyHlockActive(0)).toBe(false);
    expect(isBankruptcyHlockActive(5)).toBe(true);
    expect(decodeBankruptcyHlock(1)).toEqual({ active: true, unattributed: true, domains: [] });
    expect(decodeBankruptcyHlock(0b101)).toEqual({ active: true, unattributed: false, domains: [1] });
    expect(decodeBankruptcyHlock(0b111)).toEqual({ active: true, unattributed: false, domains: [0, 1] });
    expect(() => decodeBankruptcyHlock(2)).toThrow();
  });
});

describe("lock codes", () => {
  it("120..122 named; 21 unchanged", () => {
    expect(PERCOLATOR_ERRORS[120].name).toBe("EngineAdlReduceOnly");
    expect(PERCOLATOR_ERRORS[121].name).toBe("EngineLossStale");
    expect(PERCOLATOR_ERRORS[122].name).toBe("EarnExitWouldUnderBackClaims");
    expect(PERCOLATOR_ERRORS[21].name).toBe("EngineLockActive");
  });
});
