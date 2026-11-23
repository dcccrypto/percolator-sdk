/**
 * Branch coverage for src/abi/lev-guard-limits-v22.ts: the bound, zero / max field and refusal-order edges of
 * percolator-prog feat/v22-rc23-2026-10-22 `src/lev_guard_v22.rs` + `lev_trade_post` that the parity fixture does not reach.
 */
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  levLTraderX100V22, levShortUsersCapNotionalV22, levBurstDecayV22, levBurstUpdateV22, levMergeOverlayV22, levMoveBpsV22, levObservePriceV22, levGuardOpenLimitsV22,
  levGuardLeverageOkV22, levGuardMaxPositionQV22, levGuardShortCapOkV22, levGuardMaxFillQV22, levGuardRefusalV22,
} from "../src/index.js";
import type { LevGuardV22, LevGuardOpenInputV22, LevGuardOpenLimitsV22, LevPriceBandV22 } from "../src/index.js";

const USD = 1_000_000n;
const DAY = 216_000n;
const HOUR = 9_000n;

function guard(over: Partial<LevGuardV22> = {}): LevGuardV22 {
  return {
    market: new PublicKey(new Uint8Array(32).fill(9)), riskKey: PublicKey.default, t0Slot: 1_000_000n, assetIndex: 0, version: 1, bump: 255, flags: 0,
    mintAuthLive: false, freezeAuthLive: false, roundActive: false, roundLpLong: false, repJDumpBps: 0, repMIndBps: 0, repLCapX100: 0, repNMultBps: 0,
    repSlot: 0n, holderDumpBps: 0, roundKeepBps: 0, touchedN: 0, holderDumpSlot: 0n, pbLastPx: 0n, pbLastSlot: 0n, pbRefPx: 0n, pbRefSlot: 0n,
    pbFreezeUntil: 0n, pbOracleUntil: 0n, frozenLX100: 0, frozenNQ: 0n, navps: 0n, navLastEquity: 0n, navLastIn: 0n, navLastOut: 0n, navPeakCur: 0n,
    navPeakPrev: 0n, navRef: 0n, navBucketStart: 0n, navLastSlot: 0n, roundId: 0n, roundTargetQ: 0n, roundOpenSlot: 0n, burstVarPeakX100: 0,
    burstPeakSlot: 0n, touchedTags: [], ...over,
  };
}
function input(over: Partial<LevGuardOpenInputV22> = {}): LevGuardOpenInputV22 {
  return {
    guard: guard(), guardRequired: true, nowSlot: 1_000_000n + DAY / 2n, lNowX100: 500, nCapQ: 100_000n * USD, priceE6: 1_000_000n, targetPriceE6: 1_000_000n,
    volHasData: false, volVarX100: 0, mmrBps: 500n, engineImrBps: 1_000n, lTierX100: 2_000, collateralDecimals: 6, cM: 50_000n * USD,
    oiEffLongQ: 10_000n * USD, oiEffShortQ: 10_000n * USD, lpEffQ: -2_000n * USD, ...over,
  };
}
const lim = (over: Partial<LevGuardOpenLimitsV22> = {}): LevGuardOpenLimitsV22 => ({ ...levGuardOpenLimitsV22(input()), ...over });

describe("l_trader_x100 saturation", () => {
  it("a zero denominator (only reachable with a negative MMR) saturates at u16, as does any quotient above u16", () => {
    expect(levLTraderX100V22(-30n, null, 0)).toBe(0xffff); // den == 0
    expect(levLTraderX100V22(-29n, null, 0)).toBe(0xffff); // 1e6 / 1 > u16
    expect(levLTraderX100V22(500n, null, 0)).toBe(Number(1_000_000n / 530n)); // 1886: below the cap, unchanged
  });
});

describe("short cap off-set saturates at 100%", () => {
  it("MMR above m: users' longs offset in full (min(1, MMR/m))", () => {
    // Mature: m = max(mInd 0 -> 1%, tail 50%) = 50%; MMR 60% -> off 100%.
    expect(levShortUsersCapNotionalV22(1_000n, 0n, 6_000n, "Mature", 0)).toBe(1_000n);
    expect(levShortUsersCapNotionalV22(1_000n, 0n, 2_500n, "Mature", 0)).toBe(500n);
  });
});

describe("burst decay", () => {
  it("32 half-lives or more is zero; 31 still shifts", () => {
    const hl = 7n * DAY;
    expect(levBurstDecayV22(1 << 30, 32n * hl)).toBe(0);
    expect(levBurstDecayV22(0xffff_ffff, 40n * hl)).toBe(0);
    expect(levBurstDecayV22(0xffff_ffff, 31n * hl)).toBe(1);
  });
});

describe("price band", () => {
  const band = (o: Partial<LevPriceBandV22> = {}): LevPriceBandV22 => ({ lastPx: 100n, lastSlot: 10n, refPx: 100n, refSlot: 10n, freezeUntil: 0n, oracleUntil: 0n, ...o });
  it("move_bps with a zero base is a full u64 move", () => {
    expect(levMoveBpsV22(5n, 0n)).toBe((1n << 64n) - 1n);
    expect(levMoveBpsV22(0n, 0n)).toBe((1n << 64n) - 1n);
    expect(levMoveBpsV22(101n, 100n)).toBe(100n);
  });
  it("a zero price is ignored; an unseeded band seeds", () => {
    expect(levObservePriceV22(band(), 0n, 50n, null)).toEqual({ band: band(), trip: "None" });
    const s = levObservePriceV22(band({ lastPx: 0n }), 77n, 50n, null);
    expect(s.band).toMatchObject({ lastPx: 77n, refPx: 77n, lastSlot: 50n, refSlot: 50n });
    expect(levObservePriceV22(band({ refPx: 0n }), 77n, 50n, null).band.refPx).toBe(77n);
  });
  it("the reference rolls only after an hour; a clock behind refSlot counts as zero elapsed", () => {
    expect(levObservePriceV22(band({ refSlot: 10n }), 101n, 10n + HOUR - 1n, null).band.refPx).toBe(100n);
    expect(levObservePriceV22(band({ refSlot: 10n }), 101n, 10n + HOUR, null).band).toMatchObject({ refPx: 101n, refSlot: 10n + HOUR });
    expect(levObservePriceV22(band({ refSlot: 500n }), 101n, 20n, null).band.refPx).toBe(100n);
  });
  it("a sigma-relative freeze needs sigma > 0; sigma 0 never freezes", () => {
    // hour move 3% = 300 bps, sigma 50 bps -> 4x = 200 < 300: freeze. sigma 0n: none.
    expect(levObservePriceV22(band(), 103n, 20n, 50n).trip).toBe("Freeze");
    expect(levObservePriceV22(band(), 103n, 20n, 0n).trip).toBe("None");
    expect(levObservePriceV22(band(), 103n, 20n, 100n).trip).toBe("None");
  });
});

describe("levGuardOpenLimitsV22 market numbers", () => {
  it("with vol data: sigma feeds the band sample and the leverage term (lower L_eff than the no-data day band)", () => {
    const base = levGuardOpenLimitsV22(input());
    const withVol = levGuardOpenLimitsV22(input({ volHasData: true, volVarX100: 4_000_000 }));
    expect(withVol.lEffX100).toBeLessThan(base.lEffX100);
    expect(withVol.applies).toBe(true);
    // A decayed burst peak floors var at peak/4 even when the live variance is zero.
    const burst = levGuardOpenLimitsV22(input({ volHasData: true, volVarX100: 0, guard: guard({ burstVarPeakX100: 4_000_000, burstPeakSlot: 1_000_000n }) }));
    expect(burst.lEffX100).toBeLessThan(base.lEffX100);
  });
  it("a zero price gives no N_floor (nCapQ null -> 0): n_eff falls to the scaled cap only", () => {
    const month = 1_000_000n + 40n * DAY;
    const l = levGuardOpenLimitsV22(input({ nowSlot: month, priceE6: 0n, guard: guard({ repNMultBps: 0, repSlot: month - 1n, mintAuthLive: true }) }));
    expect(l.nEffQ).toBe(0n);
  });
  it("the vol-sampled freeze of an existing band keeps its own snapshot", () => {
    const now = 1_000_000n + DAY / 2n;
    const g = guard({ pbLastPx: 1_000_000n, pbLastSlot: now - 1n, pbRefPx: 1_000_000n, pbRefSlot: now - 1n, pbFreezeUntil: now + 100n, frozenLX100: 150, frozenNQ: 7n });
    const l = levGuardOpenLimitsV22(input({ nowSlot: now, guard: g, targetPriceE6: 1_500_000n }));
    expect(l.frozen).toBe(true);
    expect(l.lEffX100).toBe(200); // frozen 1.5x lifted to the 2x floor
    expect(l.nEffQ).toBe(7n); // the existing freeze's N snapshot, not this fill's
  });
});

describe("leverage check bounds", () => {
  it("no guard rules: always ok", () => {
    expect(levGuardLeverageOkV22(lim({ applies: false }), 0n, 10n ** 18n, USD)).toBe(true);
  });
  it("a blocked limit (imr null) and an IMR above 100% fail", () => {
    expect(levGuardLeverageOkV22(lim({ imrBps: null }), 10n ** 18n, 1n, USD)).toBe(false);
    expect(levGuardLeverageOkV22(lim({ imrBps: 10_001n }), 10n ** 18n, 1n, USD)).toBe(false);
    expect(levGuardLeverageOkV22(lim({ imrBps: 10_000n }), 1_000n, 1_000n, USD)).toBe(true); // exactly 100%
  });
});

describe("levGuardMaxPositionQV22 bounds", () => {
  it("null without rules; zero when blocked, IMR null / > 100%, price <= 0 or equity < 0", () => {
    expect(levGuardMaxPositionQV22(lim({ applies: false }), 1n, USD)).toBeNull();
    expect(levGuardMaxPositionQV22(lim({ blocked: "age-under-6h" }), 100n, USD)).toBe(0n);
    expect(levGuardMaxPositionQV22(lim({ imrBps: null }), 100n, USD)).toBe(0n);
    expect(levGuardMaxPositionQV22(lim({ imrBps: 10_001n }), 100n, USD)).toBe(0n);
    expect(levGuardMaxPositionQV22(lim(), 100n, 0n)).toBe(0n);
    expect(levGuardMaxPositionQV22(lim(), -1n, USD)).toBe(0n);
  });
  it("IMR 0 does not divide by zero; the bisection is bounded by the search hi", () => {
    const l = lim({ imrBps: 0n });
    const q = levGuardMaxPositionQV22(l, 5n, USD);
    expect(q).not.toBeNull();
    expect(levGuardLeverageOkV22(l, 5n, q!, USD)).toBe(true);
    // IMR 100%: position = equity (1 atom of equity carries 1 atom of notional)
    expect(levGuardMaxPositionQV22(lim({ imrBps: 10_000n }), 1_000n, USD)).toBe(1_000n);
  });
});

describe("short cap", () => {
  it("passes when it does not apply, when the guard has no band / overlay, and when the taker ends non-short", () => {
    const i = input();
    expect(levGuardShortCapOkV22(lim({ applies: false }), i, 0n, -1_000_000n * USD)).toBe(true);
    expect(levGuardShortCapOkV22(lim({ band: null }), i, 0n, -1_000_000n * USD)).toBe(true);
    expect(levGuardShortCapOkV22(lim({ overlay: null }), i, 0n, -1_000_000n * USD)).toBe(true);
    expect(levGuardShortCapOkV22(lim(), i, 0n, 5n * USD)).toBe(true);
    expect(levGuardShortCapOkV22(lim(), i, -5n * USD, 5n * USD)).toBe(true); // closes to exactly 0
  });
  it("users' sides clamp at zero when the taker's old position exceeds the side OI; a long taker flipping short sheds its long", () => {
    const l = lim();
    const i = input({ oiEffLongQ: 0n, oiEffShortQ: 0n, lpEffQ: 0n });
    // taker long 50 flips to short 10: users' long = 0 - 50 + 0 clamps to 0; short = 0 - 0 + 10.
    expect(levGuardShortCapOkV22(l, i, 50n * USD, -60n * USD)).toBe(true); // 10 <= cap from C_m alone
    // short side clamp: taker short 50 grows to 80 against zero short OI: 0 - 50 + 80 = 30
    expect(levGuardShortCapOkV22(l, i, -50n * USD, -30n * USD)).toBe(true);
    // a shrinking short taker with zero short OI: 0 - 50 + 20 < 0 clamps to 0
    expect(levGuardShortCapOkV22(l, i, -50n * USD, 30n * USD)).toBe(true);
  });
  it("a short fill beyond the cap fails", () => {
    const l = lim();
    const i = input({ oiEffLongQ: 0n, oiEffShortQ: 0n, lpEffQ: 0n, cM: 100n * USD });
    // Day: m = 100%, beta 10%: cap = 0 + 100·0.1 = 10 USD
    expect(levGuardShortCapOkV22(l, i, 0n, -10n * USD)).toBe(true);
    expect(levGuardShortCapOkV22(l, i, 0n, -(10n * USD + 1n))).toBe(false);
  });
});

describe("levGuardMaxFillQV22 bounds", () => {
  it("zero when blocked; clamps a negative size to zero", () => {
    expect(levGuardMaxFillQV22(lim({ blocked: "guard-missing" }), input(), "short", 0n)).toBe(0n);
    // LP long 5, lpAbsMax 0 (hand-built): a short fill = 0 - 5 < 0 -> 0; a long = 5 + 0
    const i = input({ lpEffQ: 5n * USD });
    expect(levGuardMaxFillQV22(lim({ lpAbsMaxQ: 0n }), i, "short", 0n)).toBe(0n);
    expect(levGuardMaxFillQV22(lim({ lpAbsMaxQ: 0n }), i, "long", 0n)).toBe(5n * USD);
    expect(levGuardMaxFillQV22(lim({ lpAbsMaxQ: 0n }), input({ lpEffQ: -5n * USD }), "long", 0n)).toBe(0n);
  });
  it("a short whose size fits under the short cap returns the size untouched", () => {
    const i = input({ oiEffLongQ: 0n, oiEffShortQ: 0n, lpEffQ: 0n, cM: 1_000_000n * USD });
    const l = lim({ lpAbsMaxQ: 100n * USD });
    expect(levGuardMaxFillQV22(l, i, "short", 0n)).toBe(100n * USD);
  });
});

describe("levGuardRefusalV22 order and bounds", () => {
  it("no rules: never refuses; a risk-reducing or flat-ending fill is never checked", () => {
    const i = input();
    expect(levGuardRefusalV22(lim({ applies: false }), i, 0n, 10n ** 12n, 0n)).toBeNull();
    expect(levGuardRefusalV22(lim(), i, 5n * USD, -5n * USD, 0n)).toBeNull(); // ends flat
    expect(levGuardRefusalV22(lim(), i, 5n * USD, -2n * USD, 0n)).toBeNull(); // shrinks
  });
  it("risk-up shapes: from flat, a side flip, and growth all count", () => {
    const i = input({ nowSlot: 1_000_000n + 40n * DAY });
    const l = levGuardOpenLimitsV22(i);
    expect(levGuardRefusalV22(l, i, 0n, 1n, 0n)).toBe("leverage"); // from flat, zero equity
    expect(levGuardRefusalV22(l, i, 5n * USD, -10n * USD, 0n)).toBe("leverage"); // flip
    expect(levGuardRefusalV22(l, i, 5n * USD, 1n, 0n)).toBe("leverage"); // growth
  });
  it("age_under_6h refuses before any later check", () => {
    const i = input({ nowSlot: 1_000_000n + 10n });
    const l = levGuardOpenLimitsV22(i);
    expect(levGuardRefusalV22(l, i, 0n, 1n, 10n ** 18n)).toBe("age_under_6h");
  });
  it("leverage is checked before size", () => {
    const month = 1_000_000n + 40n * DAY;
    const i = input({ nowSlot: month, guard: guard({ repNMultBps: 1_000, repSlot: month - 1n }) });
    const l = levGuardOpenLimitsV22(i);
    const big = 8_000n * USD + 1n; // exceeds n_eff via LP growth
    expect(levGuardRefusalV22(l, i, 0n, big, 0n)).toBe("leverage");
    expect(levGuardRefusalV22(l, i, 0n, big, 10n ** 18n)).toBe("size");
  });
  it("a W1 round refuses LP growth first; a fill that shrinks the LP is not a round refusal", () => {
    const now = 1_000_000n + 40n * DAY;
    const i = input({ nowSlot: now, guard: guard({ roundActive: true, roundOpenSlot: now - 10n }) });
    const l = levGuardOpenLimitsV22(i);
    expect(l.roundLive).toBe(true);
    expect(levGuardRefusalV22(l, i, 0n, 1n, 0n)).toBe("lp_stop_round"); // LP short 2000: taker long grows |LP|
    expect(levGuardRefusalV22(l, i, 0n, -1n, 10n ** 18n)).toBeNull(); // taker short shrinks the short LP
  });
});

describe("mutation killers (SDK-REPORT-LEVGUARDBRANCHESMUT survivors)", () => {
  it("K-M06: a holder proof exactly 216 000 slots old still binds; one slot older does not (lev_guard_v22.rs:205 `<=`)", () => {
    const now = 1_000_000n + 40n * DAY;
    expect(levMergeOverlayV22("Mature", guard({ holderDumpBps: 5_000, holderDumpSlot: now - DAY }), now).jDumpBps).toBe(5_000);
    expect(levMergeOverlayV22("Mature", guard({ holderDumpBps: 5_000, holderDumpSlot: now - DAY - 1n }), now).jDumpBps).toBe(0);
  });
  it("K-M24: a sample equal to the decayed peak restarts the burst clock (lev_guard_v22.rs:359 `>=`)", () => {
    expect(levBurstUpdateV22(100, 0n, 100, 1n)).toEqual([100, 1n]);
    expect(levBurstUpdateV22(100, 0n, 99, 1n)).toEqual([100, 0n]); // below the peak: peak and its slot are kept
  });
  it("K-M35: a risk-up fill that shrinks an LP already above n_eff is not a size refusal (v16_program.rs lev_trade_post size check)", () => {
    const month = 1_000_000n + 40n * DAY;
    const i = input({ nowSlot: month, lpEffQ: -20_000n * USD, guard: guard({ repNMultBps: 1_000, repSlot: month - 1n }) });
    const l = levGuardOpenLimitsV22(i);
    expect(l.nEffQ).toBeLessThan(19_999n * USD); // the LP stays over n_eff even after the 1 USD fill
    expect(levGuardRefusalV22(l, i, 0n, -1n * USD, 10n ** 18n)).toBeNull(); // taker short shrinks the short LP
  });
});
