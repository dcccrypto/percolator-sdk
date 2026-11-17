/**
 * Differential test: optimised src/abi/p3.ts vs a frozen copy of the pre-optimisation module
 * (test/helpers/p3-frozen.ts). Output bytes / values / thrown messages must be identical.
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as cur from "../src/abi/p3.js";
import * as old from "./helpers/p3-frozen.js";

let seed = 0x9e3779b9;
function rnd(): number { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; }
function rbig(bits: number): bigint {
  const n = 1 + Math.floor(rnd() * bits);
  let v = 0n;
  for (let i = 0; i < n; i += 32) v = (v << 32n) | BigInt(Math.floor(rnd() * 4294967296));
  return v & ((1n << BigInt(n)) - 1n);
}
const U64 = (1n << 64n) - 1n, U128 = (1n << 128n) - 1n;
const bigEdges = [0n, 1n, 2n, U64 - 1n, U64, U64 + 1n, U128 - 1n, U128, U128 + 1n, -1n, 1n << 63n, 1n << 127n];
const numEdges = [0, 1, 2, 255, 256, 999, 1000, 10000, 10001, 65535, 65536, 4294967295, 4294967296, -1, 1.5, NaN, Infinity];
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const rb = (bits = 128) => (rnd() < 0.3 ? pick(bigEdges) : rbig(bits));
const rn = (max: number) => (rnd() < 0.3 ? pick(numEdges) : Math.floor(rnd() * (max + 1)));

function run<T>(f: () => T): { ok: true; v: T } | { ok: false; e: string } {
  try { return { ok: true, v: f() }; } catch (e) { return { ok: false, e: (e as Error).message }; }
}
const ser = (r: ReturnType<typeof run>): string =>
  r.ok ? "ok:" + JSON.stringify(r.v, (_k, v) => (typeof v === "bigint" ? `${v}n` : v instanceof Uint8Array ? `u8:${Buffer.from(v).toString("hex")}` : v)) : "err:" + r.e;
// Cheap string comparison; only call expect() on a mismatch (expect per case is far too slow for 20k+ cases).
function same(a: () => unknown, b: () => unknown): number {
  const x = ser(run(a)), y = ser(run(b));
  if (x !== y) expect(y).toBe(x);
  return 1;
}
const N = 20_000;

describe("p3 differential vs frozen copy", { timeout: 300_000 }, () => {
  it("usdToQCappedP3 / pinnedMatcherCapsP3 over random + boundary prices", () => {
    const prices = [0n, 1n, 2n, 3n, 1_000_000n, 5_000_000_000n, 50_000_000_000n, 250_000_000_000n, 5_000_000_000_000_000n,
      25_000_000_000_000_000n, 25_000_000_000_000_000n + 1n, 25_000_000_000_000_000n - 1n, 5_000_000_000_000_000n + 1n,
      5_000_000_000_000_000n - 1n, 50_000_000_000_000_000n, 50_000_000_000_000_001n, 100_000_000_000_000_000n, 250_000n,
      U64, U64 + 1n, U128, -1n, -1_000_000n];
    for (let i = 0; i < N; i++) prices.push(rnd() < 0.5 ? rbig(64) : BigInt(Math.floor(rnd() * 10 ** Math.floor(rnd() * 17))));
    for (const p of prices) {
      same(() => cur.pinnedMatcherCapsP3(p), () => old.pinnedMatcherCapsP3(p));
      same(() => cur.usdToQCappedP3(5_000n, p), () => old.usdToQCappedP3(5_000n, p));
    }
  });
  it("encodeInitVaultLpP3", () => {
    for (let i = 0; i < N; i++) { const v = rn(20000); same(() => cur.encodeInitVaultLpP3(v), () => old.encodeInitVaultLpP3(v)); }
    for (const v of numEdges) same(() => cur.encodeInitVaultLpP3(v), () => old.encodeInitVaultLpP3(v));
  });
  it("amount encoders", () => {
    const fns = ["encodeDepositJuniorTrancheP3", "encodeWithdrawJuniorTrancheP3", "encodeVaultLpConvertPnlP3"] as const;
    for (let i = 0; i < N; i++) {
      const a = rb();
      for (const f of fns) same(() => cur[f](a), () => old[f](a));
    }
    for (const a of bigEdges) for (const f of fns) same(() => cur[f](a), () => old[f](a));
  });
  it("recall / releaseSurplus / settleResolved", () => {
    for (let i = 0; i < N; i++) {
      const a = rb(), d = rn(70000);
      same(() => cur.encodeVaultLpRecallP3(a, d), () => old.encodeVaultLpRecallP3(a, d));
      same(() => cur.encodeVaultLpReleaseSurplusP3(a, d), () => old.encodeVaultLpReleaseSurplusP3(a, d));
    }
    for (const a of bigEdges) for (const d of numEdges) {
      same(() => cur.encodeVaultLpRecallP3(a, d), () => old.encodeVaultLpRecallP3(a, d));
      same(() => cur.encodeVaultLpReleaseSurplusP3(a, d), () => old.encodeVaultLpReleaseSurplusP3(a, d));
    }
    for (const t of [0, 1, 2, -1, 0.5, NaN] as unknown as (0 | 1)[]) same(() => cur.encodeVaultLpSettleResolvedP3(t), () => old.encodeVaultLpSettleResolvedP3(t));
  });
  it("decimal-string bigint args (JS callers) behave identically", () => {
    const strs = ["0", "1", "18446744073709551615", "18446744073709551616", "340282366920938463463374607431768211455", "abc", "-1", "01"];
    for (const s of strs) {
      same(() => cur.encodeDepositJuniorTrancheP3(s as unknown as bigint), () => old.encodeDepositJuniorTrancheP3(s as unknown as bigint));
      same(() => cur.encodeVaultLpRecallP3(s as unknown as bigint, 3), () => old.encodeVaultLpRecallP3(s as unknown as bigint, 3));
    }
  });
  it("encodeVaultLpSetMatcherP3", () => {
    const mk = () => ({
      expectedSequence: rb(64), assetGenerationFrontier: rb(64), tradeFeeCapBps: rn(65535), expirySlot: rb(64), kind: rn(255),
      tradingFeeBps: rn(4294967295), baseSpreadBps: rn(4294967295), maxTotalBps: rn(4294967295), impactKBps: rn(4294967295),
      liquidityNotionalE6: rb(), maxFillAbs: rb(), maxInventoryAbs: rb(), feeToInsuranceBps: rn(65535), skewSpreadMultBps: rn(65535),
    });
    // mostly-valid cases so the byte path is exercised, not just the throw path
    const valid = () => ({
      expectedSequence: rbig(64), assetGenerationFrontier: rbig(64), tradeFeeCapBps: Math.floor(rnd() * 65536), expirySlot: rbig(64),
      kind: Math.floor(rnd() * 256), tradingFeeBps: Math.floor(rnd() * 4294967296), baseSpreadBps: Math.floor(rnd() * 4294967296),
      maxTotalBps: Math.floor(rnd() * 4294967296), impactKBps: Math.floor(rnd() * 4294967296), liquidityNotionalE6: rbig(128),
      maxFillAbs: rbig(128) | 1n, maxInventoryAbs: rbig(128) | 1n, feeToInsuranceBps: Math.floor(rnd() * 65536), skewSpreadMultBps: Math.floor(rnd() * 65536),
    });
    let okCount = 0;
    for (let i = 0; i < N; i++) {
      const a = i % 2 ? mk() : valid();
      const r = run(() => old.encodeVaultLpSetMatcherP3(a)); if (r.ok) okCount++;
      same(() => cur.encodeVaultLpSetMatcherP3(a), () => old.encodeVaultLpSetMatcherP3(a));
    }
    expect(okCount).toBeGreaterThan(N / 3);
    const max = { expectedSequence: U64, assetGenerationFrontier: U64, tradeFeeCapBps: 65535, expirySlot: U64, kind: 255, tradingFeeBps: 4294967295, baseSpreadBps: 4294967295, maxTotalBps: 4294967295, impactKBps: 4294967295, liquidityNotionalE6: U128, maxFillAbs: U128, maxInventoryAbs: U128, feeToInsuranceBps: 65535, skewSpreadMultBps: 65535 };
    const zero = { ...max, expectedSequence: 0n, assetGenerationFrontier: 0n, tradeFeeCapBps: 0, expirySlot: 0n, kind: 0, tradingFeeBps: 0, baseSpreadBps: 0, maxTotalBps: 0, impactKBps: 0, liquidityNotionalE6: 0n, maxFillAbs: 1n, maxInventoryAbs: 1n, feeToInsuranceBps: 0, skewSpreadMultBps: 0 };
    for (const a of [max, zero]) same(() => cur.encodeVaultLpSetMatcherP3(a), () => old.encodeVaultLpSetMatcherP3(a));
    for (const k of Object.keys(max) as (keyof typeof max)[]) for (const v of [...bigEdges, ...numEdges]) {
      const a = { ...max, [k]: v } as typeof max;
      same(() => cur.encodeVaultLpSetMatcherP3(a), () => old.encodeVaultLpSetMatcherP3(a));
    }
  });
  it("encodeSetVaultLpRiskP3", () => {
    const pks = [Keypair.generate().publicKey, PublicKey.default, new PublicKey(new Uint8Array(32).fill(255))];
    for (let i = 0; i < N; i++) {
      const ok = i % 2 === 0;
      const a = {
        assetIndex: ok ? Math.floor(rnd() * 65536) : rn(65535), skewSlopeE9: ok ? rbig(64) : rb(64), skewMaxE9: ok ? rbig(64) : rb(64),
        levCapQ: ok ? rbig(128) : rb(), levMaxImrBps: ok ? Math.floor(rnd() * 10001) : rn(10000),
        vaultLpMaxLevBps: ok ? Math.floor(rnd() * (cur.VAULT_LP_MAX_LEV_BPS_P3 + 1)) : rn(cur.VAULT_LP_MAX_LEV_BPS_P3),
        approvedMatcherProgram: pick(pks),
      };
      same(() => cur.encodeSetVaultLpRiskP3(a), () => old.encodeSetVaultLpRiskP3(a));
    }
    const bad = { assetIndex: 1, skewSlopeE9: 1n, skewMaxE9: 1n, levCapQ: 1n, levMaxImrBps: 1, vaultLpMaxLevBps: 1, approvedMatcherProgram: null as unknown as PublicKey };
    same(() => cur.encodeSetVaultLpRiskP3(bad), () => old.encodeSetVaultLpRiskP3(bad));
  });
});
