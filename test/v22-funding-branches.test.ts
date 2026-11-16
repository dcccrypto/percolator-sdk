/**
 * Branch coverage for src/abi/v22-funding.ts. Edge values are pinned against the program source
 * (percolator-prog @ pr715 head, `src/v16_program.rs` and `src/vault_lp_v18.rs`), not just the TS port.
 * Account bytes are the real devnet fixture with individual fields rewritten through the layout geometry.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveMarketGeometry } from "../src/abi/layout.js";
import {
  decodeMarketFundingV22,
  premiumFundingRateE9V22,
  skewFundingRateE9V22,
  combineFundingRateE9V22,
  impliedFundingRateE9V22,
  fundingRatePercentPerDayV22,
  ADL_ONE_V22,
  FUNDING_DEN_V22,
} from "../src/abi/v22-funding.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-qa-overnight-2026-10-14.json", import.meta.url), "utf8")) as {
  accounts: Record<"sol", { dataBase64: string }>;
};
const base = (): Uint8Array => new Uint8Array(Buffer.from(FX.accounts.sol.dataBase64, "base64"));
const U64_MAX = (1n << 64n) - 1n;
const I128_MAX = (1n << 127n) - 1n;
const I128_MIN = -(1n << 127n);
const U128_MAX = (1n << 128n) - 1n;

interface Edit {
  maxAbs?: bigint;
  mode?: number;
  effective?: bigint;
  slotLast?: bigint;
  oiL?: bigint;
  oiS?: bigint;
  mark?: bigint;
  markEwma?: bigint;
  pending?: bigint;
  pendingSlot?: bigint;
  flags?: number;
  slope?: bigint;
  skewMax?: bigint;
  lpNetQ?: bigint;
  fShort?: bigint;
  kLong?: bigint;
}
/** Rewrite fields of asset 0 through the layout geometry (offsets are those documented in v22-funding.ts). */
function mutate(e: Edit): Uint8Array {
  const d = base();
  const g = resolveMarketGeometry(d, { parser: "t", strictLength: false });
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const w64 = (o: number, x: bigint) => v.setBigUint64(o, x, true);
  const w128 = (o: number, x: bigint) => {
    const u = BigInt.asUintN(128, x);
    w64(o, u & U64_MAX);
    w64(o + 8, u >> 64n);
  };
  const cfg = g.groupOff + g.layout.group.config;
  const es = g.engineOff(0);
  const pr = g.slotOff(0) + g.layout.wrapperSlot.oracleProfile;
  const vl = g.slotOff(0) + g.layout.wrapperSlot.vaultLp;
  if (e.maxAbs !== undefined) w64(cfg + 126, e.maxAbs);
  if (e.mode !== undefined) d[pr] = e.mode;
  if (e.effective !== undefined) w64(es + 25, e.effective);
  if (e.slotLast !== undefined) w64(es + 41, e.slotLast);
  if (e.oiL !== undefined) w128(es + 289, e.oiL);
  if (e.oiS !== undefined) w128(es + 305, e.oiS);
  if (e.kLong !== undefined) w128(es + 81, e.kLong);
  if (e.fShort !== undefined) w128(es + 129, e.fShort);
  if (e.mark !== undefined) w64(pr + 432, e.mark);
  if (e.markEwma !== undefined) w64(pr + 168, e.markEwma);
  if (e.pending !== undefined) w64(pr + 440, e.pending);
  if (e.pendingSlot !== undefined) w64(pr + 448, e.pendingSlot);
  if (e.flags !== undefined) d[vl + 90] = e.flags;
  if (e.slope !== undefined) w64(vl + 72, e.slope);
  if (e.skewMax !== undefined) w64(vl + 80, e.skewMax);
  if (e.lpNetQ !== undefined) w128(vl + 32, e.lpNetQ);
  return d;
}
const a0 = (e: Edit) => decodeMarketFundingV22(mutate(e)).assets[0]!;

describe("premiumFundingRateE9V22 (prog v16_program.rs:13129 premium_funding_rate_e9)", () => {
  it("returns 0 on each guard arm: max 0, mark 0, index 0, mark == index", () => {
    expect(premiumFundingRateE9V22(110n, 100n, 0n)).toBe(0n);
    expect(premiumFundingRateE9V22(0n, 100n, 111n)).toBe(0n);
    expect(premiumFundingRateE9V22(110n, 0n, 111n)).toBe(0n);
    expect(premiumFundingRateE9V22(100n, 100n, 111n)).toBe(0n);
  });
  it("floors the quotient and keeps sign symmetric; clamp is on |premium|", () => {
    // 1 / 3 * 1e9 = 333_333_333.33 -> floor
    expect(premiumFundingRateE9V22(4n, 3n, U64_MAX)).toBe(333_333_333n);
    expect(premiumFundingRateE9V22(2n, 3n, U64_MAX)).toBe(-333_333_333n);
    // exact boundary: premium == cap is not clamped, cap-1 clamps
    expect(premiumFundingRateE9V22(110n, 100n, 100_000_000n)).toBe(100_000_000n);
    expect(premiumFundingRateE9V22(110n, 100n, 99_999_999n)).toBe(99_999_999n);
    expect(premiumFundingRateE9V22(90n, 100n, 99_999_999n)).toBe(-99_999_999n);
  });
  it("u64 limits: no overflow (diff * 1e9 fits u128 in prog, bigint here); mark u64::MAX vs index 1", () => {
    const p = premiumFundingRateE9V22(U64_MAX, 1n, U64_MAX);
    expect(p).toBe(U64_MAX); // clamped to u64 max cap
    expect(premiumFundingRateE9V22(1n, U64_MAX, U64_MAX)).toBe(-(((U64_MAX - 1n) * FUNDING_DEN_V22) / U64_MAX));
  });
});

describe("skewFundingRateE9V22 (prog vault_lp_v18.rs:272 skew_funding_rate_e9)", () => {
  it("zero on each guard arm: slope 0, max 0, lp 0, oi 0", () => {
    expect(skewFundingRateE9V22(-5n, 10n, 0n, 10n)).toBe(0n);
    expect(skewFundingRateE9V22(-5n, 10n, 10n, 0n)).toBe(0n);
    expect(skewFundingRateE9V22(0n, 10n, 10n, 10n)).toBe(0n);
    expect(skewFundingRateE9V22(-5n, 0n, 10n, 10n)).toBe(0n);
  });
  it("share clamps to 1 when |lp| > oi, cap applies, sign follows lp", () => {
    expect(skewFundingRateE9V22(-100n, 10n, 7n, 100n)).toBe(7n);
    expect(skewFundingRateE9V22(100n, 10n, 7n, 100n)).toBe(-7n);
    expect(skewFundingRateE9V22(-10n, 10n, 7n, 3n)).toBe(3n); // mag 7 > max 3
    expect(skewFundingRateE9V22(10n, 10n, 7n, 3n)).toBe(-3n);
    expect(skewFundingRateE9V22(-10n, 10n, 7n, 7n)).toBe(7n); // mag == max not capped
    expect(skewFundingRateE9V22(-1n, 3n, 10n, 100n)).toBe(3n); // floor(10/3)
  });
  it("i128 / u64 limits: i128::MIN magnitude is handled (unsigned_abs in prog), u64 slope times huge OI", () => {
    expect(skewFundingRateE9V22(I128_MIN, U128_MAX, U64_MAX, U64_MAX)).toBe(U64_MAX * (1n << 127n) / U128_MAX);
    expect(skewFundingRateE9V22(I128_MAX, I128_MAX, U64_MAX, U64_MAX)).toBe(-U64_MAX);
  });
});

describe("combineFundingRateE9V22 (prog vault_lp_v18.rs:301 combine_funding_rate_e9)", () => {
  it("clamps on both sides, passes through inside and at exactly +-max, sign flips across zero", () => {
    expect(combineFundingRateE9V22(100n, 50n, 111n)).toBe(111n);
    expect(combineFundingRateE9V22(-100n, -50n, 111n)).toBe(-111n);
    expect(combineFundingRateE9V22(100n, 11n, 111n)).toBe(111n);
    expect(combineFundingRateE9V22(-100n, -11n, 111n)).toBe(-111n);
    expect(combineFundingRateE9V22(100n, -150n, 111n)).toBe(-50n); // sign flip
    expect(combineFundingRateE9V22(-100n, 150n, 111n)).toBe(50n);
    expect(combineFundingRateE9V22(5n, -5n, 111n)).toBe(0n);
    expect(combineFundingRateE9V22(5n, 5n, 0n)).toBe(0n); // max 0 clamps everything
    expect(combineFundingRateE9V22(-5n, -5n, 0n)).toBe(0n);
    expect(combineFundingRateE9V22(I128_MAX, I128_MAX, U64_MAX)).toBe(U64_MAX);
    expect(combineFundingRateE9V22(I128_MIN, I128_MIN, U64_MAX)).toBe(-U64_MAX);
  });
});

describe("decodeMarketFundingV22 branch coverage on edited devnet bytes", () => {
  const live = { mode: 2, maxAbs: 1000n, effective: 100n, mark: 110n, oiL: 5n, oiS: 5n };
  it("mode gating: manual (0) and unknown (4) modes give 0; 1, 2, 3 compute (prog profile_is_price_managed, v16_program.rs:12489)", () => {
    for (const mode of [0, 4, 255]) {
      const a = a0({ ...live, mode });
      expect(a.premiumRateE9PerSlot).toBe(0n);
      expect(a.rateE9PerSlot).toBe(0n);
      expect(a.payer).toBe("none");
    }
    for (const mode of [1, 2, 3]) expect(a0({ ...live, mode }).payer).toBe("longs");
  });
  it("maxAbs == 0 disables rate and skew even when managed and bound (view returns 0, v16_program.rs:49539-49541)", () => {
    const a = a0({ ...live, maxAbs: 0n, flags: 1, slope: 100n, skewMax: 100n, lpNetQ: -5n });
    expect(a.rateE9PerSlot).toBe(0n);
    expect(a.skewRateE9PerSlot).toBe(0n);
    expect(decodeMarketFundingV22(mutate({ maxAbs: 0n })).maxAbsFundingE9PerSlot).toBe(0n);
  });
  it("active mark falls back to mark_ewma when funding_mark is 0 (v16_program.rs:49549-49553)", () => {
    const a = a0({ ...live, mark: 0n, markEwma: 90n });
    expect(a.fundingMarkE6).toBe(90n);
    expect(a.payer).toBe("shorts");
    expect(a0({ ...live, mark: 0n, markEwma: 0n }).rateE9PerSlot).toBe(0n);
  });
  it("skew gating: unbound, slope 0, and bound+slope; both skew signs; oi side is max(long, short)", () => {
    const sk = { ...live, mark: 100n, skewMax: 500n, lpNetQ: -5n };
    expect(a0({ ...sk, flags: 0, slope: 100n }).skewRateE9PerSlot).toBe(0n); // unbound (v16_program.rs:49830)
    expect(a0({ ...sk, flags: 1, slope: 0n }).skewRateE9PerSlot).toBe(0n); // slope 0
    expect(a0({ ...sk, flags: 3, slope: 100n }).vaultLpBound).toBe(true);
    expect(a0({ ...sk, flags: 2, slope: 100n }).vaultLpBound).toBe(false); // only bit 0 counts
    const short = a0({ ...sk, flags: 1, slope: 100n, oiL: 10n, oiS: 5n });
    expect(short.skewRateE9PerSlot).toBe(50n); // 100 * 5 / max(10,5)
    const short2 = a0({ ...sk, flags: 1, slope: 100n, oiL: 5n, oiS: 10n });
    expect(short2.skewRateE9PerSlot).toBe(50n);
    const long = a0({ ...sk, flags: 1, slope: 100n, lpNetQ: 5n });
    expect(long.skewRateE9PerSlot).toBe(-100n);
    expect(long.payer).toBe("shorts");
    // zero OI on both sides: skew 0 and funding inactive
    const z = a0({ ...sk, flags: 1, slope: 100n, oiL: 0n, oiS: 0n });
    expect(z.skewRateE9PerSlot).toBe(0n);
    expect(z.fundingActive).toBe(false);
  });
  it("fundingActive needs both sides: one-sided OI is inactive (engine balanced_exposure)", () => {
    expect(a0({ ...live, oiL: 5n, oiS: 0n }).fundingActive).toBe(false);
    expect(a0({ ...live, oiL: 0n, oiS: 5n }).fundingActive).toBe(false);
    expect(a0({ ...live, oiL: 1n, oiS: 1n }).fundingActive).toBe(true);
  });
  it("pendingMark requires nonzero pending mark AND pending slot strictly after slot_last (v16_program.rs:49559-49560)", () => {
    expect(a0({ ...live, slotLast: 10n, pending: 120n, pendingSlot: 11n }).pendingMark).toBe(true);
    expect(a0({ ...live, slotLast: 10n, pending: 120n, pendingSlot: 10n }).pendingMark).toBe(false);
    expect(a0({ ...live, slotLast: 10n, pending: 0n, pendingSlot: 11n }).pendingMark).toBe(false);
  });
  it("signed index words decode at i128 limits and u64 extremes survive", () => {
    const a = a0({ ...live, kLong: I128_MIN, fShort: I128_MAX, slotLast: U64_MAX, effective: U64_MAX });
    expect(a.kLong).toBe(I128_MIN);
    expect(a.fShortNum).toBe(I128_MAX);
    expect(a.slotLast).toBe(U64_MAX);
    const b = a0({ ...live, kLong: -1n, fShort: -1n, oiL: U128_MAX, oiS: U128_MAX });
    expect(b.kLong).toBe(-1n);
    expect(b.fShortNum).toBe(-1n);
    expect(b.oiEffLongQ).toBe(U128_MAX);
  });
  it("premium + skew clamp at maxAbs end-to-end", () => {
    const a = a0({ ...live, mark: 200n, flags: 1, slope: 900n, skewMax: 900n, lpNetQ: -5n, maxAbs: 1000n });
    expect(a.premiumRateE9PerSlot).toBe(1000n);
    expect(a.skewRateE9PerSlot).toBe(900n);
    expect(a.rateE9PerSlot).toBe(1000n);
  });
});

describe("fundingRatePercentPerDayV22 / impliedFundingRateE9V22", () => {
  it("is signed and zero at zero", () => {
    expect(fundingRatePercentPerDayV22(0n)).toBe(0);
    expect(fundingRatePercentPerDayV22(-111n)).toBeCloseTo(-fundingRatePercentPerDayV22(111n), 12);
  });
  it("returns 0 for every non-positive guard: dt, price, a", () => {
    expect(impliedFundingRateE9V22(5n, 0n, 1n)).toBe(0n);
    expect(impliedFundingRateE9V22(5n, -1n, 1n)).toBe(0n);
    expect(impliedFundingRateE9V22(5n, 1n, 0n)).toBe(0n);
    expect(impliedFundingRateE9V22(5n, 1n, -1n)).toBe(0n);
    expect(impliedFundingRateE9V22(5n, 1n, 1n, 0n)).toBe(0n);
    expect(impliedFundingRateE9V22(5n, 1n, 1n, -1n)).toBe(0n);
  });
  it("inverts delta = rate * dt * price * a / FUNDING_DEN, truncating toward zero for both signs", () => {
    const rate = 37n;
    const delta = rate * 10n * 100n * (ADL_ONE_V22 / FUNDING_DEN_V22);
    expect(impliedFundingRateE9V22(delta, 10n, 100n)).toBe(rate);
    expect(impliedFundingRateE9V22(-delta, 10n, 100n)).toBe(-rate);
    expect(impliedFundingRateE9V22(delta + 1n, 10n, 100n)).toBe(rate);
    expect(impliedFundingRateE9V22(-delta - 1n, 10n, 100n)).toBe(-rate);
    expect(impliedFundingRateE9V22(0n, 10n, 100n)).toBe(0n);
  });
});
