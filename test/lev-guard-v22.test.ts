/**
 * v2.2 leverage guard (tag 124): byte-exact encoders (hand-computed from `Instruction::LevGuard::encode` in percolator-prog
 * fix/v22-lev-audit-2026-10-28), account flags, PDAs, the 4456-byte decoder, derived reads, and the TradeCpi guard tail.
 * No Rust-encoded parity fixture: the prog's sdk_parity_fixtures has no tag-124 vectors yet (bytes below follow the encode source).
 */
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import * as G from "../src/abi/lev-guard-v22.js";
import * as B from "../src/solana/lev-guard-v22.js";
import { ACCOUNT_KIND, LAYOUT_V22, UnknownLayoutError, WRAPPER_ACCOUNT_MAGIC } from "../src/abi/layout.js";
import { encodeTradeCpi } from "../src/abi/instructions.js";
import { buildEvictAndTradeCpiIxV22 } from "../src/solana/v22.js";
import { encodeEvictAndTradeCpiV22 } from "../src/abi/v22-wire.js";
import { decodeWrapperEventV22 } from "../src/abi/v22-fill-events.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const pk = (): PublicKey => Keypair.generate().publicKey;
const PROGRAM = new PublicKey("11111111111111111111111111111112");
const MARKET = pk();
const C = { programId: PROGRAM, market: MARKET };

describe("tag 124 data, byte-exact", () => {
  it("op 0 INIT / op 6 SET_T0: [124, op, u64 LE]", () => {
    expect(hex(G.encodeLevGuardInitV22(0n))).toBe("7c000000000000000000");
    expect(hex(G.encodeLevGuardInitV22(0x0102030405060708n))).toBe("7c000807060504030201");
    expect(hex(G.encodeLevGuardSetT0V22(250_000_000n))).toBe("7c0680b2e60e00000000");
    expect(() => G.encodeLevGuardSetT0V22(0n)).toThrow();
    expect(() => G.encodeLevGuardInitV22(1n << 64n)).toThrow();
  });
  it("op 1 SET_RISK_KEY: [124, 1, 32 bytes]; null = zeros", () => {
    const k = new Uint8Array(32).map((_, i) => i + 1);
    expect(hex(G.encodeLevGuardSetRiskKeyV22(k))).toBe("7c01" + hex(k));
    expect(hex(G.encodeLevGuardSetRiskKeyV22(null))).toBe("7c01" + "00".repeat(32));
    expect(G.encodeLevGuardSetRiskKeyV22(new PublicKey(k))).toHaveLength(34);
    expect(() => G.encodeLevGuardSetRiskKeyV22(new Uint8Array(31))).toThrow();
  });
  it("op 2 REPORT: four u16 LE in order j_dump, m_ind, l_cap_x100, n_mult", () => {
    expect(hex(G.encodeLevGuardReportV22({ jDumpBps: 0x0102, mIndBps: 0x0304, lCapX100: 0x0506, nMultBps: 0x0708 }))).toBe("7c020201040306050807");
    expect(hex(G.encodeLevGuardReportV22({ jDumpBps: 2000, mIndBps: 5000, lCapX100: 0, nMultBps: 10000 }))).toBe("7c02d007881300001027");
    expect(() => G.encodeLevGuardReportV22({ jDumpBps: 10_001, mIndBps: 0, lCapX100: 0, nMultBps: 0 })).toThrow();
    expect(() => G.encodeLevGuardReportV22({ jDumpBps: 0, mIndBps: 0, lCapX100: 65_536, nMultBps: 0 })).toThrow();
    expect(G.encodeLevGuardReportV22({ jDumpBps: 0, mIndBps: 0, lCapX100: 65_535, nMultBps: 10_000 })).toHaveLength(10);
  });
  it("ops 3, 4, 5 carry no payload", () => {
    expect(hex(G.encodeLevGuardTightenV22())).toBe("7c03");
    expect(hex(G.encodeLevGuardPokeV22())).toBe("7c04");
    expect(hex(G.encodeLevGuardLpStopV22())).toBe("7c05");
  });
});

describe("PDAs", () => {
  it("match findProgramAddressSync with the spec seeds", () => {
    const t = (s: string): Uint8Array => new TextEncoder().encode(s);
    expect(B.deriveLevGuardV22(PROGRAM, MARKET)[0].equals(PublicKey.findProgramAddressSync([t("lev_guard"), MARKET.toBytes()], PROGRAM)[0])).toBe(true);
    expect(B.deriveVaultLpStateV22(PROGRAM, MARKET)[0].equals(PublicKey.findProgramAddressSync([t("vault_lp"), MARKET.toBytes()], PROGRAM)[0])).toBe(true);
    expect(B.deriveVaultLpExtV22(PROGRAM, MARKET)[0].equals(PublicKey.findProgramAddressSync([t("vault_lp_ext"), MARKET.toBytes()], PROGRAM)[0])).toBe(true);
    expect(B.deriveDepthSourceV22(PROGRAM, MARKET)[0].equals(PublicKey.findProgramAddressSync([t("depth_src"), MARKET.toBytes()], PROGRAM)[0])).toBe(true);
    expect(B.deriveProgramDataV22(PROGRAM)[0].equals(PublicKey.findProgramAddressSync([PROGRAM.toBytes()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0])).toBe(true);
    const all = [B.deriveLevGuardV22, B.deriveVaultLpStateV22, B.deriveVaultLpExtV22, B.deriveDepthSourceV22].map((f) => f(PROGRAM, MARKET)[0].toBase58());
    expect(new Set(all).size).toBe(4);
  });
});

describe("builders: account order and flags", () => {
  const flags = (ix: TransactionInstruction): string[] => ix.keys.map((k) => (k.isSigner ? "s" : "-") + (k.isWritable ? "w" : "-"));
  const guard = B.deriveLevGuardV22(PROGRAM, MARKET)[0];
  it("op 0 INIT", () => {
    const a = pk();
    const ix = B.buildLevGuardInitIxV22(C, a, 5n);
    expect(ix.programId.equals(PROGRAM)).toBe(true);
    expect(hex(ix.data)).toBe(hex(G.encodeLevGuardInitV22(5n)));
    expect(flags(ix)).toEqual(["sw", "--", "-w", "-w", "--"]);
    expect(ix.keys.map((k) => k.pubkey.toBase58())).toEqual([a, B.deriveProgramDataV22(PROGRAM)[0], MARKET, guard, new PublicKey("11111111111111111111111111111111")].map((x) => x.toBase58()));
  });
  it("op 1 / 6", () => {
    const ua = pk();
    for (const ix of [B.buildLevGuardSetRiskKeyIxV22(C, ua, null), B.buildLevGuardSetT0IxV22(C, ua, 9n)]) {
      expect(flags(ix)).toEqual(["s-", "--", "--", "-w"]);
      expect(ix.keys[0].pubkey.equals(ua)).toBe(true);
      expect(ix.keys[3].pubkey.equals(guard)).toBe(true);
    }
  });
  it("op 2 REPORT", () => {
    const k = pk();
    const ix = B.buildLevGuardReportIxV22(C, k, { jDumpBps: 1, mIndBps: 2, lCapX100: 3, nMultBps: 4 });
    expect(flags(ix)).toEqual(["s-", "--", "-w"]);
    expect(ix.keys.map((x) => x.pubkey.toBase58())).toEqual([k, MARKET, guard].map((x) => x.toBase58()));
  });
  it("op 3 TIGHTEN, with and without the holder token account", () => {
    const [mint, vault, holder] = [pk(), pk(), pk()];
    const ix = B.buildLevGuardTightenIxV22(C, pk(), { baseMint: mint, poolBaseVault: vault });
    expect(flags(ix)).toEqual(["s-", "--", "-w", "--", "--", "--"]);
    expect(ix.keys[3].pubkey.equals(B.deriveDepthSourceV22(PROGRAM, MARKET)[0])).toBe(true);
    const ix2 = B.buildLevGuardTightenIxV22(C, pk(), { baseMint: mint, poolBaseVault: vault, holderTokenAccount: holder });
    expect(ix2.keys).toHaveLength(7);
    expect(flags(ix2)[6]).toBe("--");
  });
  it("op 4 POKE: NAV sampling adds vault_lp_state at [4] AND vault_lp_ext at [5]", () => {
    const p = pk();
    const a = B.buildLevGuardPokeIxV22(C, pk(), { vaultLpPortfolio: p });
    expect(flags(a)).toEqual(["s-", "-w", "-w", "-w"]);
    const b = B.buildLevGuardPokeIxV22(C, pk(), { vaultLpPortfolio: p, sampleNav: true });
    expect(b.keys).toHaveLength(6);
    expect(b.keys[4].pubkey.equals(B.deriveVaultLpStateV22(PROGRAM, MARKET)[0])).toBe(true);
    expect(b.keys[5].pubkey.equals(B.deriveVaultLpExtV22(PROGRAM, MARKET)[0])).toBe(true);
  });
  it("op 5 LP_STOP: ext always at [5], opposing portfolios writable from [6]", () => {
    const [p, v1, v2] = [pk(), pk(), pk()];
    const ix = B.buildLevGuardLpStopIxV22(C, pk(), p, [v1, v2]);
    expect(flags(ix)).toEqual(["s-", "-w", "-w", "-w", "--", "--", "-w", "-w"]);
    expect(ix.keys[5].pubkey.equals(B.deriveVaultLpExtV22(PROGRAM, MARKET)[0])).toBe(true);
    expect(ix.keys[6].pubkey.equals(v1)).toBe(true);
    expect(B.buildLevGuardLpStopIxV22(C, pk(), p).keys).toHaveLength(6);
  });
});

/** Build a synthetic guard account with a distinct value in every field. */
function synth(): { data: Uint8Array; market: PublicKey; riskKey: PublicKey } {
  const data = new Uint8Array(G.LEV_GUARD_ACCOUNT_LEN_V22);
  const v = new DataView(data.buffer);
  v.setBigUint64(0, WRAPPER_ACCOUNT_MAGIC, true);
  v.setUint16(8, LAYOUT_V22.version, true);
  data[10] = 17;
  const market = pk(), riskKey = pk();
  const r = 16;
  data.set(market.toBytes(), r + 0);
  data.set(riskKey.toBytes(), r + 32);
  v.setBigUint64(r + 64, 111_111n, true);
  v.setUint16(r + 72, 3, true);
  data[r + 74] = 1; data[r + 75] = 254; data[r + 76] = 3; data[r + 77] = 1; data[r + 78] = 1;
  v.setUint16(r + 80, 2000, true); v.setUint16(r + 82, 5000, true); v.setUint16(r + 84, 400, true); v.setUint16(r + 86, 7500, true);
  v.setBigUint64(r + 88, 222_222n, true);
  v.setUint16(r + 96, 1234, true); v.setUint16(r + 98, 4321, true); v.setUint16(r + 100, 2, true);
  v.setBigUint64(r + 104, 333_333n, true);
  [112, 120, 128, 136, 144, 152].forEach((o, i) => v.setBigUint64(r + o, BigInt(1000 + i), true));
  v.setUint16(r + 160, 150, true);
  const u128 = (o: number, x: bigint): void => { v.setBigUint64(r + o, x & ((1n << 64n) - 1n), true); v.setBigUint64(r + o + 8, x >> 64n, true); };
  u128(168, (7n << 64n) + 9n);
  [184, 200, 216, 232, 248, 264, 280].forEach((o, i) => u128(o, BigInt(i + 1) * 1_000_000_000_000n));
  v.setBigUint64(r + 296, 5555n, true); v.setBigUint64(r + 304, 6666n, true); v.setBigUint64(r + 312, 42n, true);
  u128(320, (1n << 100n) + 5n);
  v.setBigUint64(r + 336, 777_777n, true);
  v.setBigUint64(r + 344, 0xdeadbeefn, true);
  v.setBigUint64(r + 352, 0xcafen, true);
  return { data, market, riskKey };
}

describe("LevGuardV22 decoder", () => {
  it("length is 4456 = 16 + 344 + 512*8 and the kind is 17", () => {
    expect(G.LEV_GUARD_ACCOUNT_LEN_V22).toBe(4456);
    expect(G.LEV_GUARD_REC_LEN_V22).toBe(344);
    expect(ACCOUNT_KIND.LevGuard).toBe(17);
  });
  it("round-trips every field at the documented offset", () => {
    const { data, market, riskKey } = synth();
    const g = G.decodeLevGuardV22(data);
    expect(g.market.equals(market)).toBe(true);
    expect(g.riskKey.equals(riskKey)).toBe(true);
    expect(g).toMatchObject({
      t0Slot: 111_111n, assetIndex: 3, version: 1, bump: 254, flags: 3, mintAuthLive: true, freezeAuthLive: true, roundActive: true, roundLpLong: true,
      repJDumpBps: 2000, repMIndBps: 5000, repLCapX100: 400, repNMultBps: 7500, repSlot: 222_222n,
      holderDumpBps: 1234, roundKeepBps: 4321, touchedN: 2, holderDumpSlot: 333_333n,
      pbLastPx: 1000n, pbLastSlot: 1001n, pbRefPx: 1002n, pbRefSlot: 1003n, pbFreezeUntil: 1004n, pbOracleUntil: 1005n,
      frozenLX100: 150, frozenNQ: (7n << 64n) + 9n,
      navps: 1n * 10n ** 12n, navLastEquity: 2n * 10n ** 12n, navLastIn: 3n * 10n ** 12n, navLastOut: 4n * 10n ** 12n,
      navPeakCur: 5n * 10n ** 12n, navPeakPrev: 6n * 10n ** 12n, navRef: 7n * 10n ** 12n,
      navBucketStart: 5555n, navLastSlot: 6666n, roundId: 42n, roundTargetQ: (1n << 100n) + 5n, roundOpenSlot: 777_777n,
      touchedTags: [0xdeadbeefn, 0xcafen],
    });
    // offsets asserted independently of the decoder's own table
    expect(G.LEV_GUARD_FIELD_OFF_V22).toMatchObject({ t0Slot: 64, repJDumpBps: 80, holderDumpSlot: 104, pbLastPx: 112, frozenNQ: 168, navps: 184, navRef: 280, roundId: 312, roundTargetQ: 320, roundOpenSlot: 336 });
  });
  it("touched tag matches the first 8 key bytes", () => {
    const k = pk();
    expect(G.levKeyTagV22(k)).toBe(new DataView(k.toBytes().buffer).getBigUint64(0, true));
  });
  it("refuses wrong kind, short data, bad version, unknown flag bit, nonzero padding, touched_n > 512", () => {
    const mk = (f: (d: Uint8Array) => void): Uint8Array => { const s = synth().data; f(s); return s; };
    expect(() => G.decodeLevGuardV22(mk((d) => { d[10] = 16; }))).toThrow(UnknownLayoutError);
    expect(() => G.decodeLevGuardV22(synth().data.slice(0, 4455))).toThrow(UnknownLayoutError);
    expect(() => G.decodeLevGuardV22(synth().data.slice(0, 4448))).toThrow(UnknownLayoutError); // the pre-night 336-byte-record length
    expect(() => G.decodeLevGuardV22(mk((d) => { d[16 + 74] = 2; }))).toThrow(UnknownLayoutError);
    expect(() => G.decodeLevGuardV22(mk((d) => { d[16 + 76] = 4; }))).toThrow(UnknownLayoutError);
    expect(() => G.decodeLevGuardV22(mk((d) => { d[16 + 79] = 1; }))).toThrow(UnknownLayoutError);
    expect(() => G.decodeLevGuardV22(mk((d) => { d[16 + 165] = 1; }))).toThrow(UnknownLayoutError);
    expect(() => G.decodeLevGuardV22(mk((d) => { new DataView(d.buffer).setUint16(16 + 100, 513, true); }))).toThrow(UnknownLayoutError);
    expect(() => G.decodeLevGuardV22(mk((d) => { new DataView(d.buffer).setUint16(16 + 80, 10_001, true); }))).toThrow(UnknownLayoutError);
  });
});

describe("derived reads", () => {
  it("age band thresholds (6 h = 54 000, 24 h, 7 d, 30 d) and a future T0 fails closed", () => {
    const t0 = 1_000n;
    expect(G.levAgeBandV22(t0, t0)).toBe("NoOpen");
    expect(G.levAgeBandV22(t0, t0 + 53_999n)).toBe("NoOpen");
    expect(G.levAgeBandV22(t0, t0 + 54_000n)).toBe("Day");
    expect(G.levAgeBandV22(t0, t0 + 215_999n)).toBe("Day");
    expect(G.levAgeBandV22(t0, t0 + 216_000n)).toBe("Week");
    expect(G.levAgeBandV22(t0, t0 + 1_511_999n)).toBe("Week");
    expect(G.levAgeBandV22(t0, t0 + 1_512_000n)).toBe("Month");
    expect(G.levAgeBandV22(t0, t0 + 6_479_999n)).toBe("Month");
    expect(G.levAgeBandV22(t0, t0 + 6_480_000n)).toBe("Mature");
    expect(G.levAgeBandV22(t0, 10n)).toBe("NoOpen");
    expect(G.levAgeBandIsYoungV22("Week")).toBe(true);
    expect(G.levAgeBandIsYoungV22("Month")).toBe(false);
  });
  it("report freshness: none / fresh <= 27 000 / held <= 216 000 / stale; future is stale", () => {
    expect(G.levReportAgeV22(0n, 99n)).toBe("None");
    expect(G.levReportAgeV22(100n, 100n + 27_000n)).toBe("Fresh");
    expect(G.levReportAgeV22(100n, 100n + 27_001n)).toBe("Held");
    expect(G.levReportAgeV22(100n, 100n + 216_000n)).toBe("Held");
    expect(G.levReportAgeV22(100n, 100n + 216_001n)).toBe("Stale");
    expect(G.levReportAgeV22(100n, 50n)).toBe("Stale");
  });
  it("LP stop: 2*navps <= max(peaks) or <= ref; uninitialised never fires", () => {
    const base = { navps: 500n, navPeakCur: 1000n, navPeakPrev: 400n, navRef: 0n };
    expect(G.levLpStopTriggeredV22(base)).toBe(true); // 1000 <= 1000
    expect(G.levLpStopTriggeredV22({ ...base, navps: 501n })).toBe(false);
    expect(G.levLpStopTriggeredV22({ ...base, navps: 501n, navPeakCur: 400n, navPeakPrev: 1002n })).toBe(true); // prev peak counts
    expect(G.levLpStopTriggeredV22({ navps: 501n, navPeakCur: 0n, navPeakPrev: 0n, navRef: 1002n })).toBe(true); // reference
    expect(G.levLpStopTriggeredV22({ navps: 501n, navPeakCur: 0n, navPeakPrev: 0n, navRef: 1001n })).toBe(false);
    expect(G.levLpStopTriggeredV22({ navps: 0n, navPeakCur: 5n, navPeakPrev: 5n, navRef: 0n })).toBe(false);
  });
  it("W1 round live: active and within 9 000 slots of the open slot", () => {
    expect(G.levW1RoundLiveV22({ roundActive: true, roundOpenSlot: 100n }, 9_100n)).toBe(true);
    expect(G.levW1RoundLiveV22({ roundActive: true, roundOpenSlot: 100n }, 9_101n)).toBe(false);
    expect(G.levW1RoundLiveV22({ roundActive: false, roundOpenSlot: 100n }, 101n)).toBe(false);
  });
});

describe("guard tail on TradeCpi / EvictAndTradeCpi", () => {
  const tradeIx = (): TransactionInstruction => new TransactionInstruction({
    programId: PROGRAM,
    keys: [pk(), MARKET, pk(), pk(), pk(), pk(), pk()].map((p, i) => ({ pubkey: p, isSigner: i === 0, isWritable: i === 1 || i === 2 || i === 3 || i === 5 })),
    data: Buffer.from(encodeTradeCpi({ accountAPortfolioId: 1n, accountAPositionEpoch: 1n, accountBPortfolioId: 2n, accountBPositionEpoch: 1n, accountBMatcherSequence: 1n, assetIndex: 0, marketId: 1n, sizeQ: 1n, feeBps: 0n, limitPrice: 0n, backingFeeCapBps: 0 })),
  });
  const guard = B.deriveLevGuardV22(PROGRAM, MARKET)[0];
  it("TradeCpi: guard is appended last, writable, non-signer; input not mutated; idempotent", () => {
    const t = tradeIx();
    const out = B.withLevGuardTailV22(t, MARKET);
    expect(out.keys).toHaveLength(8);
    expect(out.keys[7]).toEqual({ pubkey: guard, isSigner: false, isWritable: true });
    expect(t.keys).toHaveLength(7);
    expect(out.data.equals(t.data)).toBe(true);
    expect(B.withLevGuardTailV22(out, MARKET).keys).toHaveLength(8);
  });
  it("EvictAndTradeCpi: guard stays last whichever order the helpers run", () => {
    const victim = pk();
    const a = B.withLevGuardTailV22(buildEvictAndTradeCpiIxV22(tradeIx(), victim), MARKET);
    expect(a.data[0]).toBe(119);
    expect(a.keys[0].pubkey.equals(victim)).toBe(true);
    expect(a.keys[a.keys.length - 1].pubkey.equals(guard)).toBe(true);
    const b = buildEvictAndTradeCpiIxV22(B.withLevGuardTailV22(tradeIx(), MARKET), victim);
    expect(b.keys[b.keys.length - 1].pubkey.equals(guard)).toBe(true);
    expect(b.keys).toHaveLength(a.keys.length);
    expect(hex(encodeEvictAndTradeCpiV22(new Uint8Array([10, 0])))).toBe("7700");
  });
  it("refuses other tags and a wrong market", () => {
    const t = tradeIx();
    expect(() => B.withLevGuardTailV22(new TransactionInstruction({ programId: PROGRAM, keys: t.keys, data: Buffer.from([11, 0]) }), MARKET)).toThrow(/TradeCpi/);
    expect(() => B.withLevGuardTailV22(t, pk())).toThrow(/market/);
  });
});

describe("fill event reason 8 (LP stop)", () => {
  it("decodes a REDUCE record with reason 8 and ix_tag 124; 6, 7 and 9 stay skipped", () => {
    const b = new Uint8Array(134);
    const v = new DataView(b.buffer);
    b[0] = 2; b[1] = 1; b[2] = 124; b[109] = 8;
    v.setBigInt64(110, -5n, true); v.setBigUint64(126, 123n, true);
    const e = decodeWrapperEventV22(b);
    expect("event" in e && e.event).toMatchObject({ kind: "reduce", ixTag: 124, reason: 8, priceE6: 123n });
    for (const bad of [0, 6, 7, 9]) { b[109] = bad; expect(decodeWrapperEventV22(b)).toEqual({ skip: "unknown-reduce-reason" }); }
  });
});
