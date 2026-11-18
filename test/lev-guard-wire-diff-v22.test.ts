/**
 * Real-path differential for `src/abi/lev-guard-v22.ts` against percolator-prog
 * `feat/v22-rc23-2026-10-22` (the base, BEFORE prog#721's sliding 1-h window).
 *
 * `fixtures/v22/lev-guard-wire-prog-rc23.json` is written by `fixtures/v22/lev-guard-wire-gen.rs`
 * (a Rust example run against the real prog): 5,000 instructions encoded by `Instruction::encode`,
 * 1,300 guard accounts written by `state::write_lev_guard` (300 deliberately corrupted, validity from
 * `state::read_lev_guard`), 2,000 keys with `lev_guard_v22::key_tag`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  LEV_GUARD_ACCOUNT_LEN_V22, LEV_GUARD_FIELD_OFF_V22, LEV_GUARD_KEY_TAG_LEN_V22, LEV_GUARD_REC_LEN_PRE_BURST_V22,
  LEV_GUARD_REC_LEN_V22, LEV_GUARD_TOUCHED_CAP_V22, LEV_GUARD_TOUCHED_LEN_V22, LEV_GUARD_OP_V22,
  decodeLevGuardV22, encodeLevGuardInitV22, encodeLevGuardPokeV22, encodeLevGuardLpStopV22, encodeLevGuardReportV22,
  encodeLevGuardSetRiskKeyV22, encodeLevGuardSetT0V22, encodeLevGuardTightenV22, levKeyTagV22,
} from "../src/abi/lev-guard-v22.js";

interface Fx {
  recLen: number; accountLen: number; touchedLen: number; keyTagLen: number; touchedCap: number; flagsKnown: number;
  instructions: { hex: string; op: number; t0: string; key: string; report: number[]; reportOk: boolean }[];
  undecodable: string[];
  accounts: { hex: string; valid: boolean; corrupt: string }[];
  keys: { key: string; tag: string }[];
}
const fx: Fx = JSON.parse(readFileSync(new URL("../fixtures/v22/lev-guard-wire-prog-rc23.json", import.meta.url), "utf8"));
const unhex = (h: string): Uint8Array => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const leBig = (b: Uint8Array): bigint => BigInt("0x" + (hex(Uint8Array.from(b).reverse()) || "0"));

function sdkEncode(i: Fx["instructions"][number]): Uint8Array {
  switch (i.op) {
    case 0: return encodeLevGuardInitV22(BigInt(i.t0));
    case 1: return encodeLevGuardSetRiskKeyV22(unhex(i.key));
    case 2: return encodeLevGuardReportV22({ jDumpBps: i.report[0], mIndBps: i.report[1], lCapX100: i.report[2], nMultBps: i.report[3] });
    case 3: return encodeLevGuardTightenV22();
    case 4: return encodeLevGuardPokeV22();
    case 5: return encodeLevGuardLpStopV22();
    default: return encodeLevGuardSetT0V22(BigInt(i.t0));
  }
}
/** Full account = fixture prefix (header + record + touchedN tags) zero-extended to the account length. */
function fullAccount(h: string): Uint8Array {
  const a = new Uint8Array(fx.accountLen);
  a.set(unhex(h));
  return a;
}

describe("lev-guard wire differential vs prog rc23 (pre-#721)", () => {
  it("pins the lengths", () => {
    expect(fx.recLen).toBe(LEV_GUARD_REC_LEN_V22);
    expect(LEV_GUARD_REC_LEN_V22).toBe(360);
    expect(LEV_GUARD_REC_LEN_PRE_BURST_V22).toBe(344);
    expect(fx.accountLen).toBe(LEV_GUARD_ACCOUNT_LEN_V22);
    expect(fx.touchedLen).toBe(LEV_GUARD_TOUCHED_LEN_V22);
    expect(fx.keyTagLen).toBe(LEV_GUARD_KEY_TAG_LEN_V22);
    expect(fx.touchedCap).toBe(LEV_GUARD_TOUCHED_CAP_V22);
    expect(LEV_GUARD_ACCOUNT_LEN_V22).toBe(4472);
    expect(LEV_GUARD_ACCOUNT_LEN_V22 - LEV_GUARD_REC_LEN_V22 + LEV_GUARD_REC_LEN_PRE_BURST_V22).toBe(4456);
    expect(LEV_GUARD_FIELD_OFF_V22.burstVarPeakX100).toBe(LEV_GUARD_REC_LEN_PRE_BURST_V22);
  });

  it("encodes >= 5,000 prog instructions byte for byte", () => {
    expect(fx.instructions.length).toBeGreaterThanOrEqual(5000);
    const ops = new Set<number>();
    let n = 0;
    for (const i of fx.instructions) {
      ops.add(i.op);
      if (i.op === 2 && !i.reportOk) {
        // the SDK refuses a report the handler would answer Custom(134) for; prog's wire codec itself does not
        expect(() => sdkEncode(i)).toThrow();
        continue;
      }
      if (i.op === 6 && BigInt(i.t0) === 0n) { expect(() => sdkEncode(i)).toThrow(); continue; }
      expect(hex(sdkEncode(i)), `op ${i.op} ${i.hex}`).toBe(i.hex);
      n++;
    }
    expect(ops.size).toBe(7);
    expect(n).toBeGreaterThan(4500);
    // the op numbers
    expect(Object.values(LEV_GUARD_OP_V22)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("the all-zero risk key null encodes as 32 zero bytes like prog", () => {
    const z = fx.instructions.find((i) => i.op === 1 && /^0+$/.test(i.key))!;
    expect(hex(encodeLevGuardSetRiskKeyV22(null))).toBe(z.hex);
  });

  it("prog refuses unknown ops / truncated bodies; the SDK only emits ops prog accepts", () => {
    expect(fx.undecodable.length).toBe(500);
    for (const h of fx.undecodable) {
      const b = unhex(h);
      const ok = fx.instructions.some((i) => i.hex === h);
      expect(ok).toBe(false);
      expect(b[0]).toBe(124);
    }
  });

  it("decodes 1,300 prog-written accounts: validity and every field", () => {
    expect(fx.accounts.length).toBeGreaterThanOrEqual(1300);
    const F = LEV_GUARD_FIELD_OFF_V22;
    const seen = new Set<number>();
    let valid = 0;
    for (const a of fx.accounts) {
      const data = fullAccount(a.hex);
      if (!a.valid) {
        expect(() => decodeLevGuardV22(data), a.corrupt).toThrow();
        continue;
      }
      valid++;
      const g = decodeLevGuardV22(data);
      seen.add(g.flags);
      const r = data.subarray(16);
      const v = new DataView(data.buffer, data.byteOffset);
      const u16 = (o: number) => v.getUint16(16 + o, true);
      const u64 = (o: number) => v.getBigUint64(16 + o, true);
      const u128 = (o: number) => leBig(r.subarray(o, o + 16));
      expect(g.market.toBytes()).toEqual(r.subarray(F.market, F.market + 32));
      expect(g.riskKey.toBytes()).toEqual(r.subarray(F.riskKey, F.riskKey + 32));
      expect(g.t0Slot).toBe(u64(F.t0Slot));
      expect(g.assetIndex).toBe(u16(F.assetIndex));
      expect([g.version, g.bump, g.flags]).toEqual([1, r[F.bump], r[F.flags]]);
      expect(g.roundActive).toBe(r[F.roundActive] === 1);
      expect(g.roundLpLong).toBe(r[F.roundLpLong] === 1);
      expect([g.repJDumpBps, g.repMIndBps, g.repLCapX100, g.repNMultBps]).toEqual([u16(F.repJDumpBps), u16(F.repMIndBps), u16(F.repLCapX100), u16(F.repNMultBps)]);
      expect(g.repSlot).toBe(u64(F.repSlot));
      expect([g.holderDumpBps, g.roundKeepBps, g.touchedN]).toEqual([u16(F.holderDumpBps), u16(F.roundKeepBps), u16(F.touchedN)]);
      expect(g.holderDumpSlot).toBe(u64(F.holderDumpSlot));
      for (const k of ["pbLastPx", "pbLastSlot", "pbRefPx", "pbRefSlot", "pbFreezeUntil", "pbOracleUntil", "navBucketStart", "navLastSlot", "roundId", "roundOpenSlot", "burstPeakSlot"] as const) {
        expect(g[k], k).toBe(u64(F[k]));
      }
      expect(g.frozenLX100).toBe(u16(F.frozenLX100));
      for (const k of ["frozenNQ", "navps", "navLastEquity", "navLastIn", "navLastOut", "navPeakCur", "navPeakPrev", "navRef", "roundTargetQ"] as const) {
        expect(g[k], k).toBe(u128(F[k]));
      }
      expect(g.burstVarPeakX100).toBe(v.getUint32(16 + F.burstVarPeakX100, true));
      expect(g.touchedTags.length).toBe(g.touchedN);
      for (let i = 0; i < g.touchedN; i++) {
        const o = 16 + LEV_GUARD_REC_LEN_V22 + 16 * i;
        expect(g.touchedTags[i]).toBe(leBig(data.subarray(o, o + 16)));
      }
      // pre-burst view of the same record (344 B): burst memory reads 0, the rest unchanged
      if (r[F.pad3] === 0 && g.touchedN <= 16) {
        const pre = new Uint8Array(16 + 344 + LEV_GUARD_TOUCHED_LEN_V22);
        pre.set(data.subarray(0, 16 + 344));
        pre.set(data.subarray(16 + 360, 16 + 360 + 16 * g.touchedN), 16 + 344);
        const p = decodeLevGuardV22(pre);
        expect(p.burstVarPeakX100).toBe(0);
        expect(p.burstPeakSlot).toBe(0n);
        expect({ ...p, burstVarPeakX100: 0, burstPeakSlot: 0n }).toEqual({ ...g, burstVarPeakX100: 0, burstPeakSlot: 0n });
      }
    }
    expect(valid).toBe(1000);
    // every flag combination prog's validate_guard accepts (bits 0..2) must decode
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("levKeyTag equals prog key_tag for 2,000 keys", () => {
    expect(fx.keys.length).toBeGreaterThanOrEqual(1000);
    for (const k of fx.keys) {
      expect(levKeyTagV22(new PublicKey(unhex(k.key)))).toBe(leBig(unhex(k.tag)));
    }
  });
});
