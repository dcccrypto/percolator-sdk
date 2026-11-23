/**
 * D12 fail-tight (percolator-prog feat/v22-rc23-2026-10-22 @ bc657392, #620): on a build with
 * `LEV_GUARD_PERM_PROOF_REQUIRED` (`cfg!(not(feature = "devnet"))`, src/v16_program.rs:696), `lev_trade_post` merges the
 * overlay with `gd.perm_for_gate(true)` (src/v16_program.rs:46209), which reads a guard whose mint/freeze authorities were
 * never proven by op 3 (flags bit 2 `GUARD_FLAG_PERM_PROVEN` clear) as BOTH authorities live (src/lev_guard_v22.rs:1021-1028):
 * `l_cap 1` (lifted to L_floor) and `n_mult 0` (lifted to N_floor). The SDK read the stored bits only, so it quoted the full
 * limits and admitted opens the program refuses. Found by a seeded differential (20,000 scenarios on the proof-required build: 88 verdicts
 * differed, 60 of them SDK-ok / program-refuse).
 */
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { levGuardOpenLimitsV22, levGuardRefusalV22, LEV_GUARD_FLAG_PERM_PROVEN_V22 } from "../src/index.js";
import type { LevGuardV22, LevGuardOpenInputV22 } from "../src/index.js";

const USD = 1_000_000n;
const DAY = 216_000n;
const T0 = 1_000_000n;
const MONTH = T0 + 40n * DAY; // Mature: no age default on j / m, so the stored-bit overlay is the full one

function guard(over: Partial<LevGuardV22> = {}): LevGuardV22 {
  return {
    market: new PublicKey(new Uint8Array(32).fill(9)), riskKey: PublicKey.default, t0Slot: T0, assetIndex: 0, version: 1, bump: 255, flags: 0,
    mintAuthLive: false, freezeAuthLive: false, roundActive: false, roundLpLong: false, repJDumpBps: 0, repMIndBps: 0, repLCapX100: 0, repNMultBps: 0,
    repSlot: 0n, holderDumpBps: 0, roundKeepBps: 0, touchedN: 0, holderDumpSlot: 0n, pbLastPx: 0n, pbLastSlot: 0n, pbRefPx: 0n, pbRefSlot: 0n,
    pbFreezeUntil: 0n, pbOracleUntil: 0n, frozenLX100: 0, frozenNQ: 0n, navps: 0n, navLastEquity: 0n, navLastIn: 0n, navLastOut: 0n, navPeakCur: 0n,
    navPeakPrev: 0n, navRef: 0n, navBucketStart: 0n, navLastSlot: 0n, roundId: 0n, roundTargetQ: 0n, roundOpenSlot: 0n, burstVarPeakX100: 0,
    burstPeakSlot: 0n, touchedTags: [], ...over,
  };
}
function input(over: Partial<LevGuardOpenInputV22> = {}): LevGuardOpenInputV22 {
  return {
    guard: guard(), guardRequired: true, nowSlot: MONTH, lNowX100: 500, nCapQ: 100_000n * USD, priceE6: 1_000_000n, targetPriceE6: 1_000_000n,
    volHasData: false, volVarX100: 0, mmrBps: 500n, engineImrBps: 1_000n, lTierX100: 2_000, collateralDecimals: 6, cM: 50_000n * USD,
    oiEffLongQ: 10_000n * USD, oiEffShortQ: 10_000n * USD, lpEffQ: 0n, ...over,
  };
}

describe("D12 fail-tight: an unproven guard on a proof-required build takes the authority-live overlay", () => {
  it("the flag is bit 2 of the guard flags", () => {
    expect(LEV_GUARD_FLAG_PERM_PROVEN_V22).toBe(0x04);
  });

  it("proof required + unproven: L_eff drops to L_floor (2x) and n_eff to N_floor ($200), like stored live authorities", () => {
    const tight = levGuardOpenLimitsV22(input({ permProofRequired: true }));
    const live = levGuardOpenLimitsV22(input({ guard: guard({ flags: 1, mintAuthLive: true }) }));
    expect(tight.overlay).toMatchObject({ lCapX100: 1, nMultBps: 0 });
    expect(tight.lEffX100).toBe(200);
    expect(tight.nEffQ).toBe(200n * USD);
    expect(tight.lEffX100).toBe(live.lEffX100);
    expect(tight.nEffQ).toBe(live.nEffQ);
  });

  it("the program refuses a $201 LP-growing open there; the SDK used to admit it", () => {
    const i = input({ permProofRequired: true });
    const l = levGuardOpenLimitsV22(i);
    const fill = 201n * USD; // taker long 201 -> LP short 201 > N_floor 200
    expect(levGuardRefusalV22(l, i, 0n, fill, 10n ** 18n)).toBe("size");
    expect(levGuardRefusalV22(l, i, 0n, 200n * USD, 10n ** 18n)).toBeNull();
  });

  it("a proven guard, or a devnet build (proof not required, the default), keeps the stored bits", () => {
    const full = levGuardOpenLimitsV22(input());
    expect(full.nEffQ).toBe(100_000n * USD);
    expect(full.lEffX100).toBeGreaterThan(200);
    const proven = levGuardOpenLimitsV22(input({ permProofRequired: true, guard: guard({ flags: LEV_GUARD_FLAG_PERM_PROVEN_V22 }) }));
    expect(proven).toEqual(full);
    expect(levGuardOpenLimitsV22(input({ permProofRequired: false }))).toEqual(full);
    // proven with a live authority still clamps (the stored bit speaks)
    const provenLive = levGuardOpenLimitsV22(input({ permProofRequired: true, guard: guard({ flags: LEV_GUARD_FLAG_PERM_PROVEN_V22 | 2, freezeAuthLive: true }) }));
    expect(provenLive.nEffQ).toBe(200n * USD);
  });
});
