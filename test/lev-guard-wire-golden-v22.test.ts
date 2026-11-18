/**
 * Wire differential for `src/abi/lev-guard-v22.ts` against percolator-prog `feat/v22-rc23-2026-10-22`
 * (d27f3d73, the base BEFORE prog#721's sliding 1-h window).
 *
 * HONESTY NOTE: these vectors were DERIVED FROM THE RUST SOURCE BY HAND, not produced by running it.
 * The Rust fixture generator (`fixtures/v22/lev-guard-wire-gen.rs`) could not be built in time (debug build of
 * the prog's Solana dependency graph was still compiling after ~60 min on a saturated machine). Sources read:
 *  - `Instruction::LevGuard` decode (src/v16_program.rs:10926-10941) and encode (:12155-12170):
 *      [124, op] then op 0 / 6 -> u64 LE t0; op 1 -> 32 key bytes; op 2 -> 4 x u16 LE; ops 3/4/5 -> nothing.
 *  - `LevGuardV22` repr(C) struct (src/lev_guard_v22.rs:921-980): offsets below, copied from its `// N` comments
 *    (NOT from the SDK table), `validate_guard` (:1114), `key_tag` (:789).
 * The independent reference below (`refEncode`, `refRecord`) is written from that source; the SDK must match it.
 */
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { LAYOUT_V22, WRAPPER_ACCOUNT_MAGIC } from "../src/abi/layout.js";
import {
  LEV_GUARD_ACCOUNT_LEN_V22, LEV_GUARD_FIELD_OFF_V22, LEV_GUARD_REC_LEN_PRE_BURST_V22, LEV_GUARD_REC_LEN_V22,
  decodeLevGuardV22, encodeLevGuardInitV22, encodeLevGuardLpStopV22, encodeLevGuardPokeV22, encodeLevGuardReportV22,
  encodeLevGuardSetRiskKeyV22, encodeLevGuardSetT0V22, encodeLevGuardTightenV22, levKeyTagV22,
} from "../src/abi/lev-guard-v22.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const U64 = (1n << 64n) - 1n;

// ---- independent reference (from the Rust encode) ----
const le = (x: bigint, n: number): number[] => Array.from({ length: n }, (_, i) => Number((x >> BigInt(8 * i)) & 0xffn));
type Ix = { op: number; t0?: bigint; key?: Uint8Array; report?: number[] };
function refEncode(i: Ix): string {
  const out = [124, i.op];
  if (i.op === 0 || i.op === 6) out.push(...le(i.t0 ?? 0n, 8));
  else if (i.op === 1) out.push(...(i.key ?? new Uint8Array(32)));
  else if (i.op === 2) for (const r of i.report ?? [0, 0, 0, 0]) out.push(...le(BigInt(r), 2));
  return Buffer.from(out).toString("hex");
}
function sdkEncode(i: Ix): Uint8Array {
  switch (i.op) {
    case 0: return encodeLevGuardInitV22(i.t0 ?? 0n);
    case 1: return encodeLevGuardSetRiskKeyV22(i.key ?? null);
    case 2: { const r = i.report!; return encodeLevGuardReportV22({ jDumpBps: r[0], mIndBps: r[1], lCapX100: r[2], nMultBps: r[3] }); }
    case 3: return encodeLevGuardTightenV22();
    case 4: return encodeLevGuardPokeV22();
    case 5: return encodeLevGuardLpStopV22();
    default: return encodeLevGuardSetT0V22(i.t0!);
  }
}
/** Prog-side decode of the wire (decode :10926-10941), as a reference parser. */
function refDecode(b: Uint8Array): Ix | null {
  if (b[0] !== 124 || b.length < 2) return null;
  const op = b[1];
  const rest = b.subarray(2);
  const u = (o: number, n: number): bigint => rest.subarray(o, o + n).reduceRight((a, x) => (a << 8n) | BigInt(x), 0n);
  if (op === 0 || op === 6) return rest.length < 8 ? null : { op, t0: u(0, 8) };
  if (op === 1) return rest.length < 32 ? null : { op, key: rest.slice(0, 32) };
  if (op === 2) return rest.length < 8 ? null : { op, report: [0, 2, 4, 6].map((o) => Number(u(o, 2))) };
  if (op >= 3 && op <= 5) return { op };
  return null;
}

// xorshift64* seeded RNG
function rng(seed: bigint): () => bigint {
  let s = seed;
  return () => { s ^= s >> 12n; s ^= (s << 25n) & U64; s ^= s >> 27n; return (s * 0x2545f4914f6cdd1dn) & U64; };
}

describe("lev-guard wire vs prog rc23 source (hand-derived golden vectors)", () => {
  // 44 pinned vectors: [label, hex-from-Rust-source-by-hand, producer]
  const K1 = new Uint8Array(32).fill(0x11);
  const KSEQ = Uint8Array.from({ length: 32 }, (_, i) => i);
  const GOLD: [string, string, () => Uint8Array][] = [
    ["init t0=0", "7c000000000000000000", () => encodeLevGuardInitV22(0n)],
    ["init default", "7c000000000000000000", () => encodeLevGuardInitV22()],
    ["init t0=1", "7c000100000000000000", () => encodeLevGuardInitV22(1n)],
    ["init t0=255", "7c00ff00000000000000", () => encodeLevGuardInitV22(255n)],
    ["init t0=256", "7c000001000000000000", () => encodeLevGuardInitV22(256n)],
    ["init t0=0x0102030405060708", "7c000807060504030201", () => encodeLevGuardInitV22(0x0102030405060708n)],
    ["init t0=2^32", "7c000000000001000000", () => encodeLevGuardInitV22(1n << 32n)],
    ["init t0=2^63", "7c000000000000000080", () => encodeLevGuardInitV22(1n << 63n)],
    ["init t0=u64::MAX", "7c00ffffffffffffffff", () => encodeLevGuardInitV22(U64)],
    ["init t0=250_000_000", "7c0080b2e60e00000000", () => encodeLevGuardInitV22(250_000_000n)],
    ["set_t0 =1", "7c060100000000000000", () => encodeLevGuardSetT0V22(1n)],
    ["set_t0 =255", "7c06ff00000000000000", () => encodeLevGuardSetT0V22(255n)],
    ["set_t0 =65536", "7c060000010000000000", () => encodeLevGuardSetT0V22(65536n)],
    ["set_t0 =u64::MAX", "7c06ffffffffffffffff", () => encodeLevGuardSetT0V22(U64)],
    ["set_t0 =250_000_000", "7c0680b2e60e00000000", () => encodeLevGuardSetT0V22(250_000_000n)],
    ["set_t0 =0x0102030405060708", "7c060807060504030201", () => encodeLevGuardSetT0V22(0x0102030405060708n)],
    ["set_risk_key null", "7c01" + "00".repeat(32), () => encodeLevGuardSetRiskKeyV22(null)],
    ["set_risk_key zeros", "7c01" + "00".repeat(32), () => encodeLevGuardSetRiskKeyV22(new Uint8Array(32))],
    ["set_risk_key 0x11..", "7c01" + "11".repeat(32), () => encodeLevGuardSetRiskKeyV22(K1)],
    ["set_risk_key ff..", "7c01" + "ff".repeat(32), () => encodeLevGuardSetRiskKeyV22(new Uint8Array(32).fill(255))],
    ["set_risk_key 00..1f", "7c01" + Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join(""), () => encodeLevGuardSetRiskKeyV22(KSEQ)],
    ["set_risk_key PublicKey", "7c01" + "11".repeat(32), () => encodeLevGuardSetRiskKeyV22(new PublicKey(K1))],
    ["report all 0", "7c020000000000000000", () => encodeLevGuardReportV22({ jDumpBps: 0, mIndBps: 0, lCapX100: 0, nMultBps: 0 })],
    ["report 10000s", "7c02" + "1027".repeat(4), () => encodeLevGuardReportV22({ jDumpBps: 10000, mIndBps: 10000, lCapX100: 10000, nMultBps: 10000 })],
    ["report 1,2,3,4", "7c020100020003000400", () => encodeLevGuardReportV22({ jDumpBps: 1, mIndBps: 2, lCapX100: 3, nMultBps: 4 })],
    ["report 255,256,257,258", "7c02ff0000010101" + "0201", () => encodeLevGuardReportV22({ jDumpBps: 255, mIndBps: 256, lCapX100: 257, nMultBps: 258 })],
    ["report lCap=65535", "7c0200000000ffff0000", () => encodeLevGuardReportV22({ jDumpBps: 0, mIndBps: 0, lCapX100: 65535, nMultBps: 0 })],
    ["report lCap=10001", "7c02" + "0000" + "0000" + "1127" + "0000", () => encodeLevGuardReportV22({ jDumpBps: 0, mIndBps: 0, lCapX100: 10001, nMultBps: 0 })],
    ["report j=2000 m=5000 l=0 n=10000", "7c02d0078813" + "00001027", () => encodeLevGuardReportV22({ jDumpBps: 2000, mIndBps: 5000, lCapX100: 0, nMultBps: 10000 })],
    ["report j=9999", "7c020f27" + "000000000000", () => encodeLevGuardReportV22({ jDumpBps: 9999, mIndBps: 0, lCapX100: 0, nMultBps: 0 })],
    ["report n=1 only", "7c02" + "000000000000" + "0100", () => encodeLevGuardReportV22({ jDumpBps: 0, mIndBps: 0, lCapX100: 0, nMultBps: 1 })],
    ["report m=0x1234", "7c02" + "0000" + "3412" + "0000" + "0000", () => encodeLevGuardReportV22({ jDumpBps: 0, mIndBps: 0x1234, lCapX100: 0, nMultBps: 0 })],
    ["tighten", "7c03", encodeLevGuardTightenV22],
    ["poke", "7c04", encodeLevGuardPokeV22],
    ["lp_stop", "7c05", encodeLevGuardLpStopV22],
  ];
  it("pinned vectors: SDK bytes equal the bytes derived from the Rust encode", () => {
    let n = 0;
    for (const [label, h0, f] of GOLD) {
      const h = h0;
      expect(hex(f()), label).toBe(h);
      expect(refEncode(refDecode(Uint8Array.from(Buffer.from(h, "hex")))!), `${label} ref round trip`).toBe(h);
      n++;
    }
    expect(n).toBeGreaterThanOrEqual(34);
  });

  it("boundaries the SDK refuses are exactly the ones the prog handler refuses / the SDK documents", () => {
    expect(() => encodeLevGuardSetT0V22(0n)).toThrow(); // handler requires 0 < t0
    expect(() => encodeLevGuardInitV22(U64 + 1n)).toThrow();
    expect(() => encodeLevGuardInitV22(-1n)).toThrow();
    expect(() => encodeLevGuardSetRiskKeyV22(new Uint8Array(31))).toThrow();
    expect(() => encodeLevGuardSetRiskKeyV22(new Uint8Array(33))).toThrow();
    // validate: report_ok = j,m,n <= 10_000 (lCap any u16)
    expect(() => encodeLevGuardReportV22({ jDumpBps: 10001, mIndBps: 0, lCapX100: 0, nMultBps: 0 })).toThrow();
    expect(() => encodeLevGuardReportV22({ jDumpBps: 0, mIndBps: 10001, lCapX100: 0, nMultBps: 0 })).toThrow();
    expect(() => encodeLevGuardReportV22({ jDumpBps: 0, mIndBps: 0, lCapX100: 0, nMultBps: 10001 })).toThrow();
    expect(() => encodeLevGuardReportV22({ jDumpBps: 0, mIndBps: 0, lCapX100: 65536, nMultBps: 0 })).toThrow();
    expect(() => encodeLevGuardReportV22({ jDumpBps: -1, mIndBps: 0, lCapX100: 0, nMultBps: 0 })).toThrow();
  });

  it("seeded property: 5,000 instructions encode == reference encode and the prog-side decode round-trips", () => {
    const r = rng(0x1ee7c0ffeen);
    const edge64 = (): bigint => { const k = Number(r() % 8n); return k === 0 ? 0n : k === 1 ? U64 : k === 2 ? 1n : k === 3 ? r() % 1000n : r(); };
    const edge16 = (): number => { const k = Number(r() % 8n); return k === 0 ? 0 : k === 1 ? 10000 : k === 2 ? 1 : k === 3 ? 9999 : Number(r() % 10001n); };
    const ops = new Set<number>();
    let n = 0;
    for (let i = 0; i < 5000; i++) {
      const op = i % 7;
      ops.add(op);
      const ix: Ix = { op };
      if (op === 0) ix.t0 = edge64();
      if (op === 6) { ix.t0 = edge64(); if (ix.t0 === 0n) ix.t0 = 1n; }
      if (op === 1) { ix.key = new Uint8Array(32); if (r() % 4n) for (let j = 0; j < 32; j++) ix.key[j] = Number(r() & 0xffn); }
      if (op === 2) ix.report = [edge16(), edge16(), Number(r() & 0xffffn), edge16()];
      const got = sdkEncode(ix);
      expect(hex(got), `op ${op} #${i}`).toBe(refEncode(ix));
      const back = refDecode(got)!;
      expect(refEncode(back)).toBe(hex(got));
      n++;
    }
    expect(ops.size).toBe(7);
    expect(n).toBe(5000);
  });

  it("prog decode refuses unknown ops and short bodies; none are SDK-producible", () => {
    for (let op = 7; op < 256; op++) expect(refDecode(Uint8Array.of(124, op))).toBeNull();
    expect(refDecode(Uint8Array.of(124))).toBeNull();
    expect(refDecode(Uint8Array.of(124, 0, 1, 2, 3))).toBeNull();
    expect(refDecode(Uint8Array.of(124, 1, ...new Array(31).fill(0)))).toBeNull();
    expect(refDecode(Uint8Array.of(124, 2, 0, 0, 0, 0, 0, 0, 0))).toBeNull();
  });
});

// ---- records ----
/** Offsets copied from the `// N` comments of `struct LevGuardV22` in src/lev_guard_v22.rs (NOT from the SDK). */
const R = {
  market: 0, riskKey: 32, t0: 64, asset: 72, version: 74, bump: 75, flags: 76, roundActive: 77, roundLpLong: 78, pad0: 79,
  rj: 80, rm: 82, rl: 84, rn: 86, repSlot: 88, holder: 96, keep: 98, touchedN: 100, pad1: 102, holderSlot: 104,
  pb: [112, 120, 128, 136, 144, 152], frozenL: 160, pad2: 162, frozenN: 168,
  u128s: { navps: 184, navLastEquity: 200, navLastIn: 216, navLastOut: 232, navPeakCur: 248, navPeakPrev: 264, navRef: 280, roundTargetQ: 320 },
  navBucket: 296, navLast: 304, roundId: 312, roundOpen: 336, burstVar: 344, pad3: 348, burstSlot: 352,
};
const REC_FULL = 360, TOUCHED = 16 * 256, HDR = 16;

describe("lev-guard record layout vs prog rc23 struct (hand-derived offsets)", () => {
  it("pins lengths: 344 B pre-burst, 360 B burst, account 4472 / 4456", () => {
    expect(LEV_GUARD_REC_LEN_V22).toBe(REC_FULL);
    expect(LEV_GUARD_REC_LEN_PRE_BURST_V22).toBe(344);
    expect(LEV_GUARD_ACCOUNT_LEN_V22).toBe(HDR + REC_FULL + TOUCHED);
    expect(LEV_GUARD_ACCOUNT_LEN_V22).toBe(4472);
    expect(LEV_GUARD_FIELD_OFF_V22.burstVarPeakX100).toBe(344); // the pre-burst record ends where burst memory starts
  });

  it("SDK offset table == struct offsets", () => {
    const F = LEV_GUARD_FIELD_OFF_V22 as Record<string, number>;
    const expectOff: Record<string, number> = {
      market: R.market, riskKey: R.riskKey, t0Slot: R.t0, assetIndex: R.asset, version: R.version, bump: R.bump, flags: R.flags,
      roundActive: R.roundActive, roundLpLong: R.roundLpLong, pad0: R.pad0, repJDumpBps: R.rj, repMIndBps: R.rm, repLCapX100: R.rl,
      repNMultBps: R.rn, repSlot: R.repSlot, holderDumpBps: R.holder, roundKeepBps: R.keep, touchedN: R.touchedN, pad1: R.pad1,
      holderDumpSlot: R.holderSlot, pbLastPx: 112, pbLastSlot: 120, pbRefPx: 128, pbRefSlot: 136, pbFreezeUntil: 144, pbOracleUntil: 152,
      frozenLX100: R.frozenL, pad2: R.pad2, frozenNQ: R.frozenN, ...R.u128s, navBucketStart: R.navBucket, navLastSlot: R.navLast,
      roundId: R.roundId, roundOpenSlot: R.roundOpen, burstVarPeakX100: R.burstVar, pad3: R.pad3, burstPeakSlot: R.burstSlot,
    };
    for (const [k, o] of Object.entries(expectOff)) expect(F[k], k).toBe(o);
    expect(Object.keys(F).sort()).toEqual(Object.keys(expectOff).sort());
  });

  function build(r: () => bigint, recLen: number): { data: Uint8Array; exp: Record<string, bigint | number | boolean>; touched: bigint[] } {
    const data = new Uint8Array(HDR + recLen + TOUCHED);
    const v = new DataView(data.buffer);
    v.setBigUint64(0, WRAPPER_ACCOUNT_MAGIC, true);
    v.setUint16(8, LAYOUT_V22.version, true);
    data[10] = 17; // KIND_LEV_GUARD
    const b = HDR;
    const fillBytes = (o: number, n: number): void => { for (let i = 0; i < n; i++) data[b + o + i] = Number(r() & 0xffn); };
    const w64 = (o: number): bigint => { const x = r(); v.setBigUint64(b + o, x, true); return x; };
    const w128 = (o: number): bigint => { const lo = r(), hi = r(); v.setBigUint64(b + o, lo, true); v.setBigUint64(b + o + 8, hi, true); return (hi << 64n) | lo; };
    const w16 = (o: number, max: number): number => { const x = Number(r() % BigInt(max + 1)); v.setUint16(b + o, x, true); return x; };
    fillBytes(R.market, 32); fillBytes(R.riskKey, 32);
    const e: Record<string, bigint | number | boolean> = {};
    e.t0Slot = w64(R.t0); e.assetIndex = w16(R.asset, 65535);
    data[b + R.version] = 1; data[b + R.bump] = Number(r() & 0xffn);
    const flags = Number(r() % 8n); data[b + R.flags] = flags; e.flags = flags;
    const ra = Number(r() % 2n), rl = Number(r() % 2n); data[b + R.roundActive] = ra; data[b + R.roundLpLong] = rl;
    e.roundActive = ra === 1; e.roundLpLong = rl === 1;
    e.repJDumpBps = w16(R.rj, 10000); e.repMIndBps = w16(R.rm, 10000); e.repLCapX100 = w16(R.rl, 65535); e.repNMultBps = w16(R.rn, 10000);
    e.repSlot = w64(R.repSlot); e.holderDumpBps = w16(R.holder, 65535); e.roundKeepBps = w16(R.keep, 10000);
    const tn = Number(r() % 3n === 0n ? 256n : r() % 20n); v.setUint16(b + R.touchedN, tn, true); e.touchedN = tn;
    e.holderDumpSlot = w64(R.holderSlot);
    ["pbLastPx", "pbLastSlot", "pbRefPx", "pbRefSlot", "pbFreezeUntil", "pbOracleUntil"].forEach((k, i) => { e[k] = w64(R.pb[i]); });
    e.frozenLX100 = w16(R.frozenL, 65535); e.frozenNQ = w128(R.frozenN);
    for (const [k, o] of Object.entries(R.u128s)) e[k] = w128(o);
    e.navBucketStart = w64(R.navBucket); e.navLastSlot = w64(R.navLast); e.roundId = w64(R.roundId); e.roundOpenSlot = w64(R.roundOpen);
    if (recLen === REC_FULL) { const bv = Number(r() & 0xffffffffn); v.setUint32(b + R.burstVar, bv, true); e.burstVarPeakX100 = bv; e.burstPeakSlot = w64(R.burstSlot); }
    else { e.burstVarPeakX100 = 0; e.burstPeakSlot = 0n; }
    const touched: bigint[] = [];
    for (let i = 0; i < tn; i++) { touched.push(w128(recLen + 16 * i)); }
    return { data, exp: e, touched };
  }
  const camel = (k: string): string => k;

  for (const recLen of [REC_FULL, 344]) {
    it(`1,000 random ${recLen}-byte-record accounts decode to every field`, { timeout: 120_000 }, () => {
      const r = rng(recLen === REC_FULL ? 0xabcdef12345n : 0x777n);
      for (let i = 0; i < 1000; i++) {
        const { data, exp, touched } = build(r, recLen);
        let g: Record<string, unknown>;
        try { g = decodeLevGuardV22(data) as unknown as Record<string, unknown>; } catch (err) {
          throw new Error(`case ${i}: ${JSON.stringify(exp, (_k, x) => (typeof x === "bigint" ? String(x) : x))}`, { cause: err });
        }
        for (const [k, x] of Object.entries(exp)) expect(g[camel(k)], `#${i} ${k}`).toBe(x);
        expect((g.market as PublicKey).toBytes()).toEqual(data.slice(HDR + R.market, HDR + R.market + 32));
        expect((g.riskKey as PublicKey).toBytes()).toEqual(data.slice(HDR + R.riskKey, HDR + R.riskKey + 32));
        expect(g.version).toBe(1);
        expect(g.permProven).toBe(((exp.flags as number) & 4) !== 0);
        expect(g.mintAuthLive).toBe(((exp.flags as number) & 1) !== 0);
        expect(g.freezeAuthLive).toBe(((exp.flags as number) & 2) !== 0);
        expect(g.touchedTags).toEqual(touched);
      }
    });
  }

  it("refuses what validate_guard refuses (each corruption alone), and wrong lengths", () => {
    const r = rng(99n);
    const base = (): Uint8Array => { const x = build(r, REC_FULL); new DataView(x.data.buffer).setUint16(HDR + R.touchedN, 3, true); return x.data; };
    const poke = (f: (d: Uint8Array, v: DataView) => void): void => { const d = base(); f(d, new DataView(d.buffer)); expect(() => decodeLevGuardV22(d)).toThrow(); };
    poke((d) => { d[HDR + R.version] = 2; });
    poke((d) => { d[HDR + R.version] = 0; });
    poke((d) => { d[HDR + R.flags] |= 8; });
    poke((d) => { d[HDR + R.flags] = 0x80; });
    poke((d) => { d[HDR + R.roundActive] = 2; });
    poke((d) => { d[HDR + R.roundLpLong] = 2; });
    poke((d, v) => v.setUint16(HDR + R.touchedN, 257, true));
    poke((d, v) => v.setUint16(HDR + R.keep, 10001, true));
    poke((d, v) => v.setUint16(HDR + R.rj, 10001, true));
    poke((d, v) => v.setUint16(HDR + R.rm, 10001, true));
    poke((d, v) => v.setUint16(HDR + R.rn, 10001, true));
    poke((d) => { d[HDR + R.pad0] = 1; });
    poke((d) => { d[HDR + R.pad1 + 1] = 1; });
    poke((d) => { d[HDR + R.pad2 + 5] = 1; });
    poke((d) => { d[HDR + R.pad3 + 3] = 1; });
    poke((d) => { d[10] = 16; }); // wrong kind
    expect(() => decodeLevGuardV22(base().subarray(0, 4471))).toThrow();
    expect(() => decodeLevGuardV22(new Uint8Array(4473))).toThrow();
    // boundaries the prog accepts must decode: touched_n = 256, keep = 10000, bps = 10000
    const ok = build(r, REC_FULL);
    const dv = new DataView(ok.data.buffer);
    dv.setUint16(HDR + R.touchedN, 256, true); dv.setUint16(HDR + R.keep, 10000, true); dv.setUint16(HDR + R.rj, 10000, true);
    expect(decodeLevGuardV22(ok.data).touchedTags.length).toBe(256);
  });

  it("levKeyTag == first 16 key bytes as LE u128 (prog key_tag) for 1,000 random keys + edges", () => {
    const r = rng(0x5eedn);
    const keys: Uint8Array[] = [new Uint8Array(32), new Uint8Array(32).fill(255)];
    for (let i = 0; i < 998; i++) keys.push(Uint8Array.from({ length: 32 }, () => Number(r() & 0xffn)));
    for (const k of keys) {
      let t = 0n;
      for (let i = 15; i >= 0; i--) t = (t << 8n) | BigInt(k[i]); // key_tag copies key[..16]; the account stores them LE
      expect(levKeyTagV22(new PublicKey(k))).toBe(t);
    }
    expect(keys.length).toBe(1000);
  });
});
