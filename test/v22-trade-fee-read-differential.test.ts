/**
 * Differential: the optimised readTradeFeeInputsV22 vs the original composition
 * (resolveMarketGeometry + parseWrapperConfigV17 + decodeAssetRiskLimitsP1), on 2,000 random
 * valid and malformed buffers: identical results and identical thrown messages.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  readTradeFeeInputsV22, ENGINE_CONFIG_MAX_TRADING_FEE_BPS_OFF, MATCHER_CTX_MAX_TOTAL_BPS_OFF, type TradeFeeInputsV22,
} from "../src/abi/v22-trade-fee.js";
import { resolveMarketGeometry } from "../src/abi/layout.js";
import { decodeAssetRiskLimitsP1 } from "../src/abi/risk-limits-p1.js";
import { CTX_VAMM_OFFSET, VAMM_MAGIC } from "../src/abi/instructions.js";
import { parseWrapperConfigV17 } from "../src/solana/slab.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-qa-devnet-2026-10-11.json", import.meta.url), "utf8"));
const acct = (k: string): Uint8Array => new Uint8Array(Buffer.from(FX.accounts.accounts[k].dataBase64, "base64"));

function reference(marketData: Uint8Array, assetIndex: number, ctxData?: Uint8Array): TradeFeeInputsV22 {
  const g = resolveMarketGeometry(marketData, { parser: "readTradeFeeInputsV22", strictLength: false });
  const cfgOff = g.groupOff + g.layout.group.config + ENGINE_CONFIG_MAX_TRADING_FEE_BPS_OFF;
  if (marketData.length < cfgOff + 8) throw new Error("readTradeFeeInputsV22: market account too short for the engine config");
  const dv = new DataView(marketData.buffer, marketData.byteOffset, marketData.byteLength);
  const maxTradingFeeBps = dv.getBigUint64(cfgOff, true);
  const tradeFeeBaseBps = parseWrapperConfigV17(marketData).tradeFeeBps;
  const risk = decodeAssetRiskLimitsP1(marketData, assetIndex);
  const out: TradeFeeInputsV22 = { tradeFeeBaseBps, maxTradingFeeBps, maxRequestedFeeBps: risk.maxRequestedFeeBps, matcherExtMode: risk.matcherExtMode };
  if (ctxData !== undefined) {
    if (ctxData.length < CTX_VAMM_OFFSET + MATCHER_CTX_MAX_TOTAL_BPS_OFF + 4) throw new Error("readTradeFeeInputsV22: matcher context too short");
    const c = new DataView(ctxData.buffer, ctxData.byteOffset, ctxData.byteLength);
    if (c.getBigUint64(CTX_VAMM_OFFSET, true) !== VAMM_MAGIC) throw new Error("readTradeFeeInputsV22: not a matcher context (bad magic)");
    out.matcherMaxTotalBps = c.getUint32(CTX_VAMM_OFFSET + MATCHER_CTX_MAX_TOTAL_BPS_OFF, true);
  }
  return out;
}

function run(f: () => TradeFeeInputsV22): { ok: true; v: TradeFeeInputsV22 } | { ok: false; msg: string } {
  try { return { ok: true, v: f() }; } catch (e) { return { ok: false, msg: (e as Error).message }; }
}

// mulberry32
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("readTradeFeeInputsV22 differential vs original composition", () => {
  it("2,000 random valid and malformed buffers: identical results and errors", () => {
    const market = acct("jupMarket");
    const ctx = acct("jupMatcherCtx");
    const r = rng(0x22fee);
    const ri = (n: number): number => Math.floor(r() * n);
    let okCount = 0, errCount = 0;
    const msgs = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      let m = market.slice();
      let c: Uint8Array | undefined = r() < 0.7 ? ctx.slice() : undefined;
      const kind = ri(8);
      if (kind === 1) m = m.slice(0, ri(m.length + 1)); // truncate anywhere
      else if (kind === 2) m = m.slice(0, 16 + ri(700)); // truncate near the header / wrapper config
      else if (kind === 3) m[ri(16)] ^= 1 + ri(255); // corrupt magic/version/kind header
      else if (kind === 4) m = m.slice(0, m.length - ri(3000)); // trim tail slots
      else if (kind === 5) { const n = 1 + ri(40); for (let k = 0; k < n; k++) m[ri(m.length)] = ri(256); } // random bytes
      else if (kind === 6) { const x = new Uint8Array(m.length + ri(64)); x.set(m); m = x; } // extend
      // kind 0, 7: valid
      // randomise the fee fields in valid-shaped buffers too
      if (kind === 0 || kind === 7) for (let k = 0; k < 16; k++) { const o = 16 + 128 + ri(8); if (o < m.length) m[o] = ri(256); }
      if (c && r() < 0.3) {
        const cm = ri(4);
        if (cm === 0) c = c.slice(0, ri(c.length + 1));
        else if (cm === 1) c[CTX_VAMM_OFFSET + ri(8)] ^= 1 + ri(255);
        else if (cm === 2) c[CTX_VAMM_OFFSET + MATCHER_CTX_MAX_TOTAL_BPS_OFF + ri(4)] = ri(256);
        else c = new Uint8Array(0);
      }
      // sub-view with a non-zero byteOffset sometimes
      if (r() < 0.2) { const pad = new Uint8Array(m.length + 8); pad.set(m, 8); m = pad.subarray(8); }
      const assetIndex = [0, 0, 0, 1, 2, 7, 63, 1000, -1, 1.5, NaN][ri(11)]!;
      const a = run(() => readTradeFeeInputsV22(m, assetIndex, c));
      const b = run(() => reference(m, assetIndex, c));
      expect(a).toEqual(b);
      if (a.ok) okCount++; else { errCount++; msgs.add(a.msg.replace(/\d+/g, "N")); }
    }
    expect(okCount).toBeGreaterThan(300);
    expect(errCount).toBeGreaterThan(300);
    expect(msgs.size).toBeGreaterThanOrEqual(4);
  });
});
