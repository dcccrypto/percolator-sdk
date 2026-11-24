/** P2b lock exits: tags 104/105, episode record, h-lock byte, codes 120..122 (percolator-prog #525). */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  IX_TAG_P2B, encodeAdlWindDown, buildAdlWindDownIx, encodeSetAdlWindDownMaxSlots, decodeAdlEpisodeRecord,
  adlEpisodeSlotsRemaining, isBankruptcyHlockActive, decodeBankruptcyHlock, adlWindDownDustNotionalAtoms,
  ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS, ADL_WIND_DOWN_MAX_MARK_AGE_SLOTS, adlEpisodeKey,
  ADL_EPISODE_FIELD_OFF, ACCOUNTS_ADL_WIND_DOWN, ACCOUNTS_SET_ADL_WIND_DOWN_MAX_SLOTS, buildSetAdlWindDownMaxSlotsIx,
  decodeAdlEpisode,
} from "../src/abi/p2b-lock-exits.js";
import { PERCOLATOR_ERRORS } from "../src/abi/errors.js";
import { assetRiskLimitsAccountOffsetP1, ASSET_RISK_LIMITS_LEN_P1 } from "../src/abi/risk-limits-p1.js";
import { V17_MARKET_GROUP_OFF, V17_MARKET_GROUP_LEN, V17_MARKET_ASSET_SLOT_LEN } from "../src/solana/slab.js";
import { stampMarket } from "./helpers/stamp.js";
import { LAYOUTS_BY_VERSION } from "../src/abi/layout.js";

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

// Offsets below are taken from percolator-prog feat/v22-rc23-2026-10-22 src/v16_program.rs
// (read only): the compile-time `offset_of!` asserts at ~3399-3405 and ASSET_ADL_EPISODE_OFF == 652.
describe("wire/layout pinned to the v2.2 program source", () => {
  it("episode field offsets (offset_of! asserts: 44 / 48 / 56 / 60)", () => {
    expect(ADL_EPISODE_FIELD_OFF).toEqual({ maxEpisodeSlots: 44, sinceSlot: 48, epochKeyLong: 56, epochKeyShort: 60 });
    // ASSET_RISK_LIMITS_OFF (608) + 44 == ASSET_ADL_EPISODE_OFF (652); 20 bytes end at the 64-byte record end
    expect(608 + ADL_EPISODE_FIELD_OFF.maxEpisodeSlots).toBe(652);
    expect(ADL_EPISODE_FIELD_OFF.epochKeyShort + 4).toBe(ASSET_RISK_LIMITS_LEN_P1);
  });
  it("every episode field decodes from its own distinct bytes (a shifted offset fails)", () => {
    const rec = new Uint8Array(64);
    const v = new DataView(rec.buffer);
    v.setUint32(44, 0x11111111, true);
    v.setBigUint64(48, 0x2222222233333333n, true);
    v.setUint32(56, 0x44444444, true);
    v.setUint32(60, 0x55555555, true);
    expect(decodeAdlEpisodeRecord(rec)).toEqual({
      maxEpisodeSlots: 0x11111111, effectiveMaxEpisodeSlots: 0x11111111,
      sinceSlot: 0x2222222233333333n, epochKeyLong: 0x44444444, epochKeyShort: 0x55555555,
    });
  });
  it("constants: default bound 9000, mark age 150, tags 104/105", () => {
    expect(ADL_WIND_DOWN_DEFAULT_MAX_EPISODE_SLOTS).toBe(9_000);
    expect(ADL_WIND_DOWN_MAX_MARK_AGE_SLOTS).toBe(150);
    expect(IX_TAG_P2B).toEqual({ AdlWindDown: 104, SetAdlWindDownMaxSlots: 105 });
  });
  it("tag 104 field order/offsets: now@1 asset@9 portfolio@11 epoch@19", () => {
    const d = encodeAdlWindDown({ nowSlot: 0x0102030405060708n, assetIndex: 0xa1b2, portfolioId: 0x1112131415161718n, positionEpoch: 0x2122232425262728n });
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    expect([d[0], v.getBigUint64(1, true), v.getUint16(9, true), v.getBigUint64(11, true), v.getBigUint64(19, true)])
      .toEqual([104, 0x0102030405060708n, 0xa1b2, 0x1112131415161718n, 0x2122232425262728n]);
  });
  it("tag 105 field offsets: asset@1 max@3 (7 B)", () => {
    const d = encodeSetAdlWindDownMaxSlots({ assetIndex: 0xa1b2, maxEpisodeSlots: 0x2328 });
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    expect(d.length).toBe(7);
    expect([d[0], v.getUint16(1, true), v.getUint32(3, true)]).toEqual([105, 0xa1b2, 0x2328]);
  });
});

describe("encoder guards and bounds", () => {
  const ok = { nowSlot: 1n, portfolioId: 1n, positionEpoch: 1n };
  it("tag 104 rejects bad assetIndex, accepts 0 and 0xffff", () => {
    for (const bad of [-1, 0x10000, 1.5, NaN]) expect(() => encodeAdlWindDown({ ...ok, assetIndex: bad })).toThrow("bad assetIndex");
    expect(encodeAdlWindDown({ ...ok, assetIndex: 0xffff }).length).toBe(27);
    expect(encodeAdlWindDown({ ...ok, assetIndex: 0 }).length).toBe(27);
  });
  it("tag 104 accepts string u64 inputs", () => {
    expect(hex(encodeAdlWindDown({ nowSlot: "1", assetIndex: 0, portfolioId: "7", positionEpoch: "2" })))
      .toBe(hex(encodeAdlWindDown({ nowSlot: 1n, assetIndex: 0, portfolioId: 7n, positionEpoch: 2n })));
  });
  it("tag 105 bound is inclusive 1..=9000 and integer-only", () => {
    expect(encodeSetAdlWindDownMaxSlots({ assetIndex: 0, maxEpisodeSlots: 1 }).length).toBe(7);
    expect(encodeSetAdlWindDownMaxSlots({ assetIndex: 0, maxEpisodeSlots: 9000 }).length).toBe(7);
    for (const bad of [0, 9001, -1, 1.5, NaN]) expect(() => encodeSetAdlWindDownMaxSlots({ assetIndex: 0, maxEpisodeSlots: bad })).toThrow("maxEpisodeSlots must be in 1..=9000");
  });
  it("dust bound caps decimals at 30 (program: decimals.min(30))", () => {
    expect(adlWindDownDustNotionalAtoms(0)).toBe(1n);
    expect(adlWindDownDustNotionalAtoms(30)).toBe(10n ** 30n);
    expect(adlWindDownDustNotionalAtoms(255)).toBe(10n ** 30n);
  });
});

describe("instruction builders", () => {
  const k = () => Keypair.generate().publicKey;
  it("tag 104 account order/flags match ACCOUNTS_ADL_WIND_DOWN; oracles read-only trailing", () => {
    expect(ACCOUNTS_ADL_WIND_DOWN.map((a) => a.name)).toEqual(["caller", "market", "portfolio", "collateralMint"]);
    const keys = { caller: k(), market: k(), portfolio: k(), collateralMint: k() };
    const o1 = k(), o2 = k();
    const pid = k();
    const ix = buildAdlWindDownIx(pid, keys, { nowSlot: 5n, assetIndex: 1, portfolioId: 2n, positionEpoch: 3n }, [o1, o2]);
    expect(ix.programId.equals(pid)).toBe(true);
    expect(ix.keys.map((m) => m.pubkey.toBase58())).toEqual([keys.caller, keys.market, keys.portfolio, keys.collateralMint, o1, o2].map((p) => p.toBase58()));
    expect(ix.keys.map((m) => m.isWritable)).toEqual([false, true, true, false, false, false]);
    expect(hex(ix.data)).toBe(hex(encodeAdlWindDown({ nowSlot: 5n, assetIndex: 1, portfolioId: 2n, positionEpoch: 3n })));
  });
  it("tag 104 without oracle accounts has exactly 4 keys", () => {
    const ix = buildAdlWindDownIx(k(), { caller: k(), market: k(), portfolio: k(), collateralMint: k() }, { nowSlot: 0n, assetIndex: 0, portfolioId: 1n, positionEpoch: 0n });
    expect(ix.keys.length).toBe(4);
  });
  it("tag 105: [authority signer, ProgramData PDA, market writable]", () => {
    expect(ACCOUNTS_SET_ADL_WIND_DOWN_MAX_SLOTS.map((a) => a.name)).toEqual(["upgradeAuthority", "programData", "market"]);
    const pid = k(), market = k(), auth = k();
    const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const [pd] = PublicKey.findProgramAddressSync([pid.toBytes()], loader);
    const ix = buildSetAdlWindDownMaxSlotsIx(pid, market, auth, { assetIndex: 2, maxEpisodeSlots: 300 });
    expect(ix.programId.equals(pid)).toBe(true);
    expect(ix.keys.map((m) => m.pubkey.toBase58())).toEqual([auth, pd, market].map((p) => p.toBase58()));
    expect(ix.keys.map((m) => [m.isSigner, m.isWritable])).toEqual([[true, false], [false, false], [false, true]]);
    expect(hex(ix.data)).toBe("69" + "0200" + "2c010000");
  });
  it("tag 105 builder propagates the 1..=9000 guard", () => {
    expect(() => buildSetAdlWindDownMaxSlotsIx(k(), k(), k(), { assetIndex: 0, maxEpisodeSlots: 0 })).toThrow("maxEpisodeSlots must be in 1..=9000");
  });
});

describe("episode record guards and slots remaining", () => {
  it("decodeAdlEpisodeRecord rejects non-64-byte records", () => {
    expect(() => decodeAdlEpisodeRecord(new Uint8Array(63))).toThrow("record must be 64 bytes, got 63");
    expect(() => decodeAdlEpisodeRecord(new Uint8Array(65))).toThrow("got 65");
  });
  it("honours a stored override and a subarray view with a byteOffset", () => {
    const big = new Uint8Array(100);
    const rec = big.subarray(10, 74);
    new DataView(rec.buffer, rec.byteOffset, 64).setUint32(44, 300, true);
    expect(decodeAdlEpisodeRecord(rec)).toMatchObject({ maxEpisodeSlots: 300, effectiveMaxEpisodeSlots: 300 });
  });
  it("slots remaining: unarmed (no record), mid-episode, exact boundary", () => {
    const [kl, ks] = adlEpisodeKey(9n, 1n, 2n);
    const base = { maxEpisodeSlots: 100, effectiveMaxEpisodeSlots: 100, sinceSlot: 50n, epochKeyLong: kl, epochKeyShort: ks };
    expect(adlEpisodeSlotsRemaining({ ...base, sinceSlot: 0n }, 9n, 1n, 2n, 60n)).toBeNull();
    expect(adlEpisodeSlotsRemaining(base, 9n, 1n, 2n, 60n)).toBe(90n);
    expect(adlEpisodeSlotsRemaining(base, 9n, 1n, 2n, 149n)).toBe(1n);
    expect(adlEpisodeSlotsRemaining(base, 9n, 1n, 2n, 150n)).toBe(0n); // program: now - since >= n
    expect(adlEpisodeSlotsRemaining(base, 9n, 1n, 3n, 60n)).toBeNull(); // short epoch moved
  });
  it("episode key: 64-bit market id folds hi^lo; epochs use low 32 bits; short word is rotl16(mix)", () => {
    const mid = (0xdeadbeefn << 32n) | 0x12345678n;
    const mix = Math.imul((0xdeadbeef ^ 0x12345678) >>> 0, 0x9e3779b1) >>> 0;
    const rot = ((mix << 16) | (mix >>> 16)) >>> 0;
    expect(adlEpisodeKey(mid, (7n << 32n) | 5n, 6n)).toEqual([(5 ^ mix) >>> 0, (6 ^ rot) >>> 0]);
  });
});

describe("decodeAdlEpisode (raw market account)", () => {
  const mk = (n: number) => {
    const m = new Uint8Array(V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + n * V17_MARKET_ASSET_SLOT_LEN);
    stampMarket(m);
    return m;
  };
  it("reads asset i's episode at the asset record offset (asset 0 vs 1 are distinct)", () => {
    const m = mk(2);
    const v = new DataView(m.buffer);
    const o1 = assetRiskLimitsAccountOffsetP1(1);
    v.setUint32(o1 + 44, 77, true);
    v.setBigUint64(o1 + 48, 4242n, true);
    v.setUint32(o1 + 56, 0xaabbccdd, true);
    v.setUint32(o1 + 60, 0x01020304, true);
    expect(decodeAdlEpisode(m, 1)).toEqual({ maxEpisodeSlots: 77, effectiveMaxEpisodeSlots: 77, sinceSlot: 4242n, epochKeyLong: 0xaabbccdd, epochKeyShort: 0x01020304 });
    expect(decodeAdlEpisode(m, 0)).toMatchObject({ maxEpisodeSlots: 0, sinceSlot: 0n, effectiveMaxEpisodeSlots: 9000 });
  });
  it("asset slot episode byte offset is 652 inside the slot (ASSET_ADL_EPISODE_OFF)", () => {
    const m = mk(1);
    const slotBase = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN;
    new DataView(m.buffer).setUint32(slotBase + 652, 5, true);
    expect(decodeAdlEpisode(m, 0).maxEpisodeSlots).toBe(5);
  });
  it("throws when the account is too short for the asset", () => {
    const m = mk(1);
    expect(() => decodeAdlEpisode(m, 1)).toThrow("market account too short for asset 1");
  });
  it("throws on a non-market buffer", () => {
    expect(() => decodeAdlEpisode(new Uint8Array(10), 0)).toThrow();
  });
});

describe("h-lock edge cases", () => {
  it("top domain bit and unattributed distinctions", () => {
    expect(decodeBankruptcyHlock(0)).toEqual({ active: false, unattributed: false, domains: [] });
    expect(decodeBankruptcyHlock(0b1111_1111)).toEqual({ active: true, unattributed: false, domains: [0, 1, 2, 3, 4, 5, 6] });
    for (const even of [2, 4, 254]) expect(() => decodeBankruptcyHlock(even)).toThrow("bit 0 clear");
    expect(isBankruptcyHlockActive(255)).toBe(true);
  });
});

// Mutation killers for the 6 real survivors in the P2b lock-exit mutation report (M38/M47/M57/M60/M63/M65).
// M48 (`>= end` vs `> end`) and M54 (`d < 8` on a u8) are equivalent mutants and have no killer.
describe("p2b mutation-survivor killers", () => {
  // M38: prog v16_program.rs:3405 `adl_episode_since_slot: u64`
  it("sinceSlot is read unsigned (u64 top bit)", () => {
    const rec = new Uint8Array(64);
    new DataView(rec.buffer).setBigUint64(48, 1n << 63n, true);
    expect(decodeAdlEpisodeRecord(rec).sinceSlot).toBe(1n << 63n);
  });
  // M47: prog v16_program.rs:24941 `(epoch_long as u32) ^ mix`
  it("episode key truncates a >2^53 epoch to its low 32 bits", () => {
    const [kl] = adlEpisodeKey(1n, (1n << 53n) + 1n, 0n);
    expect(kl).toBe((1 ^ 0x9e3779b1) >>> 0);
  });
  // M57: the length guard itself, not the 64-byte record check behind it
  it("market one byte short of asset 0's record -> 'market account too short'", () => {
    const off = assetRiskLimitsAccountOffsetP1(0);
    const m = stampMarket(new Uint8Array(off + 63));
    expect(() => decodeAdlEpisode(m, 0)).toThrow("market account too short for asset 0");
    const ok = stampMarket(new Uint8Array(off + 64));
    expect(decodeAdlEpisode(ok, 0).effectiveMaxEpisodeSlots).toBe(9000);
  });
  // M60: each of 120/121/122 carries its own hint
  it("120/121/122 hints describe their own code", () => {
    expect(PERCOLATOR_ERRORS[120].hint).toMatch(/close-only/i);
    expect(PERCOLATOR_ERRORS[121].hint).toMatch(/refresh/i);
    expect(PERCOLATOR_ERRORS[122].hint).toMatch(/under-backed/i);
    expect(PERCOLATOR_ERRORS[120].hint).not.toBe(PERCOLATOR_ERRORS[121].hint);
  });
  // M63: a VERSION 19 (v2.2) market uses its own slot geometry, not the v2.1 default
  it("v2.2 (VERSION 19) market: episode read at the v2.2 asset offset", () => {
    const L = LAYOUTS_BY_VERSION.get(19)!;
    const m = stampMarket(new Uint8Array(L.marketGroupOff + L.marketGroupLen + 2 * L.assetSlotStride), 19);
    const o1 = assetRiskLimitsAccountOffsetP1(1, L);
    expect(o1).not.toBe(assetRiskLimitsAccountOffsetP1(1));
    const v = new DataView(m.buffer);
    v.setUint32(o1 + 44, 77, true);
    v.setBigUint64(o1 + 48, 4242n, true);
    expect(decodeAdlEpisode(m, 1)).toMatchObject({ maxEpisodeSlots: 77, sinceSlot: 4242n });
  });
  // M65: engine v16.rs:30456 `bankruptcy_hlock_is_active(wire) = wire != 0`
  it("h-lock active iff non-zero, even for a malformed even byte", () => {
    expect(isBankruptcyHlockActive(2)).toBe(true);
    expect(isBankruptcyHlockActive(4)).toBe(true);
  });
});
