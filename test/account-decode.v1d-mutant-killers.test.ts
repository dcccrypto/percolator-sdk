/**
 * Mutation killers for the V1D-pre306 decode (65088 B devnet slab, percolator-prog f7a2e8ab +
 * engine a235a5f2). Each case pins a survivor of the J-20261124-SDK-REPORT-ACCOUNTDECODEV1DMISDECODEMUT
 * run (M04 M05 M17 M25 M40 M41 M42 M43) by writing sentinels into a copy of the real slab.
 * Offsets are typed from engine a235a5f2 src/percolator.rs (Account, RiskParams, InsuranceFund),
 * not imported from the SDK.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AccountKind, detectSlabLayout, parseAccount, parseConfig, parseEngine, parseParams,
} from "../src/solana/slab.js";

const dir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "fixtures", "accounts");
const fx = JSON.parse(readFileSync(resolve(dir, "devnet-wrapper-slab-v1d.json"), "utf8")) as {
  data_base64: string; total_data_length: number;
};
const data = new Uint8Array(fx.total_data_length);
data.set(Buffer.from(fx.data_base64, "base64"), 0);
const copy = (): Uint8Array => new Uint8Array(data);
function put(d: Uint8Array, abs: number, value: bigint, bytes: number): void {
  let v = value < 0n ? (1n << BigInt(bytes * 8)) + value : value;
  for (let i = 0; i < bytes; i++) { d[abs + i] = Number(v & 0xffn); v >>= 8n; }
}
const ENGINE = 456;
const ACCOUNTS = 1600;

describe("V1D killers", () => {
  // kills M04 (V2 probe dropped) and M05 (version read at offset 4 instead of 8)
  it("a 65088 B slab with header version u32@8 = 2 is V2, not V1D", () => {
    const d = copy();
    put(d, 8, 2n, 4);
    const l = detectSlabLayout(d.length, d)!;
    expect(l.version).toBe(2);
    expect(l.engineOff).toBe(600);
    // and version 1 stays V1D
    expect(detectSlabLayout(data.length, data)!.engineOff).toBe(456);
  });

  // kills M17 (hasInsuranceIsolation true reads isolation at engine-1, overlapping the vault)
  it("isolation fields stay 0 even when the vault is nonzero", () => {
    const d = copy();
    put(d, ENGINE + 0, 1_000_000n, 16);
    const e = parseEngine(d);
    expect(e.vault).toBe(1_000_000n);
    expect(e.insuranceFund.isolatedBalance).toBe(0n);
    expect(e.insuranceFund.isolationBps).toBe(0);
    expect(detectSlabLayout(d.length, d)!.hasInsuranceIsolation).toBe(false);
  });

  // kills M25 (paramsSize < 144 drops the extended RiskParams)
  it("extended RiskParams are read at engine+48+{56,88,96,104,120,128}", () => {
    const d = copy();
    const P = ENGINE + 48;
    put(d, P + 56, 61n, 16);
    put(d, P + 88, 62n, 8);
    put(d, P + 96, 63n, 8);
    put(d, P + 104, (1n << 64n) | 64n, 16);
    put(d, P + 120, 65n, 8);
    put(d, P + 128, 66n, 16);
    const p = parseParams(d);
    expect([p.riskReductionThreshold, p.maxCrankStalenessSlots, p.liquidationFeeBps,
      p.liquidationFeeCap, p.liquidationBufferBps, p.minLiquidationAbs])
      .toEqual([61n, 62n, 63n, (1n << 64n) | 64n, 65n, 66n]);
  });

  // kills M40 (V1D config skips 32 B of funding-extension fields before the thresholds)
  it("config tail on the real bytes: authority / last effective price 1e6, cap 10_000, thresh risk 200", () => {
    const c = parseConfig(data);
    expect(c.authorityPriceE6).toBe(1_000_000n);
    expect(c.lastEffectivePriceE6).toBe(1_000_000n);
    expect(c.oraclePriceCapE2bps).toBe(10_000n);
    expect(c.threshRiskBps).toBe(200n);
  });

  // kills M41 (248 B account routed to ADL offsets), M42 (position +8), M43 (capital +8)
  it("account slot 0: capital/pnl/reserved/position/entry/fee_credits at the a235a5f2 offsets", () => {
    const d = copy();
    const A = ACCOUNTS;
    put(d, A + 0, 7n, 8);                    // account_id
    put(d, A + 8, (2n << 64n) | 5n, 16);     // capital U128
    d[A + 24] = 1;                           // kind = LP
    put(d, A + 32, -123_456n, 16);           // pnl I128
    put(d, A + 48, 99n, 8);                  // reserved_pnl u64
    put(d, A + 56, 4_242n, 8);               // warmup_started_at_slot (must not leak into reserved_pnl)
    put(d, A + 80, -(3n << 64n) - 1n, 16);   // position_size I128
    put(d, A + 96, 55_000_000n, 8);          // entry_price
    put(d, A + 216, 777n, 16);               // fee_credits
    const a = parseAccount(d, 0);
    expect(a.accountId).toBe(7n);
    expect(a.capital).toBe((2n << 64n) | 5n);
    expect(a.kind).toBe(AccountKind.LP);
    expect(a.pnl).toBe(-123_456n);
    expect(a.reservedPnl).toBe(99n);
    expect(a.warmupStartedAtSlot).toBe(4_242n);
    expect(a.positionSize).toBe(-(3n << 64n) - 1n);
    expect(a.entryPrice).toBe(55_000_000n);
    expect(a.feeCredits).toBe(777n);
  });

  // engine a235a5f2 InsuranceFund is {balance: U128, fee_revenue: U128}; before the fix the SDK
  // returned feeRevenue 0n for every 65088 B V1D slab.
  it("fee_revenue is the U128 at engine+32 (and balance stays at engine+16)", () => {
    const d = copy();
    put(d, ENGINE + 16, 4_444n, 16);
    put(d, ENGINE + 32, (1n << 64n) | 5_555n, 16);
    const e = parseEngine(d);
    expect(e.insuranceFund.balance).toBe(4_444n);
    expect(e.insuranceFund.feeRevenue).toBe((1n << 64n) | 5_555n);
    expect(e.insuranceFund.isolatedBalance).toBe(0n);
  });
});
