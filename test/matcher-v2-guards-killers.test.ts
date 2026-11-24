/**
 * Mutation killers for validateMatcherSetParams + the v2 block encoder
 * (src/abi/matcher-v2.ts). matcher-v2-guards.test.ts only tests most bounds from the
 * rejecting side; every accept case here sits exactly on the inclusive bound the Rust
 * `validate_config` uses (percolator-match feat/p2-matcher-v2 @ 4a0f696, src/v2.rs:389),
 * so a `>` -> `>=` or `max` -> `max-1` change fails a test.
 */
import { describe, it, expect } from "vitest";
import {
  validateMatcherSetParams,
  encodeMatcherSetParams,
  defaultMatcherV2ConfigForKind2,
  zeroMatcherV2Config,
  type MatcherSetParams,
  type MatcherV2Config,
} from "../src/abi/matcher-v2.js";

function kind2(): MatcherSetParams {
  return {
    kind: 2, tradingFeeBps: 0, baseSpreadBps: 50, maxTotalBps: 200, impactKBps: 10_000,
    liquidityNotionalE6: 1_000_000_000n, maxFillAbs: 1_000n, maxInventoryAbs: 4_000n,
    feeToInsuranceBps: 0, skewSpreadMultBps: 50, enableV2: true,
    v2: defaultMatcherV2ConfigForKind2(10, 50, 200, 50, 4_000n),
  };
}
const v2With = (o: Partial<MatcherV2Config>, top: Partial<MatcherSetParams> = {}): MatcherSetParams =>
  ({ ...kind2(), ...top, v2: { ...kind2().v2, ...o } });
const guardOnly = (o: Partial<MatcherV2Config> = {}): MatcherSetParams => ({
  ...kind2(), kind: 0, impactKBps: 0, skewSpreadMultBps: 0,
  v2: { ...zeroMatcherV2Config(), flags: 1, maxMarkAgeSlots: 5, observedStaleSlots: 7, ...o },
});

describe("inclusive bounds are accepted (kills >= / max-1 mutants)", () => {
  it.each<[string, MatcherSetParams]>([
    ["tradingFee == 1000", { ...kind2(), tradingFeeBps: 1000, maxTotalBps: 2000 }],
    ["maxTotal == 9000", { ...kind2(), maxTotalBps: 9000 }],
    ["base + tradingFee == maxTotal", { ...kind2(), tradingFeeBps: 150 }],
    ["feeHi == 1000", v2With({ feeHiBps: 1000 }, { maxTotalBps: 2000 })],
    ["base + feeHi == maxTotal", v2With({ feeHiBps: 150 })],
    ["volAlpha == 10000", v2With({ volAlphaBps: 10_000 })],
    ["skewCap == 5000", v2With({ skewCapBps: 5000 })],
    ["rebateCap == skewCap", v2With({ skewCapBps: 100, rebateCapBps: 100 })],
    ["thinRebate == skewMult", v2With({ thinRebateMultBps: 50 })],
    ["impactK == 100000", { ...kind2(), impactKBps: 100_000 }],
    ["kind 2 maxMarkAge 0 (= off)", v2With({ maxMarkAgeSlots: 0 })],
    ["kind 2 every u16 guard field at 0xffff", v2With({ maxMarkAgeSlots: 0xffff, observedStaleSlots: 0xffff })],
    ["guard-only maxMarkAge 0 (= off)", guardOnly({ maxMarkAgeSlots: 0 })],
  ])("accepts %s", (_n, p) => {
    expect(() => validateMatcherSetParams(p)).not.toThrow();
  });
});

describe("rejections the guards file does not reach", () => {
  it.each<[string, MatcherSetParams, RegExp]>([
    ["kind 2 flags bit2", v2With({ flags: 4 }), /unknown bits/],
    ["guard-only unknown flag bit", guardOnly({ flags: 2 }), /unknown bits/],
    ["maxMarkAge > u16", v2With({ maxMarkAgeSlots: 0x10000 }), /v2\.maxMarkAgeSlots/],
    ["observedStale > u16", v2With({ observedStaleSlots: 0x10000 }), /v2\.observedStaleSlots/],
    ["kind 2 without enableV2", { ...kind2(), enableV2: false }, /kind 2 requires enableV2/],
    ["feeCold > feeHi", v2With({ feeColdBps: 90 }), /feeLo <= feeCold <= feeHi/],
    ["skew on, rebate off, ref 0", v2With({ thinRebateMultBps: 0, skewRefInventory: 0n }), /skewRefInventory must be > 0/],
  ])("rejects %s", (_n, p, re) => {
    expect(() => validateMatcherSetParams(p)).toThrow(re);
  });

  const pricing: [keyof MatcherV2Config, number | bigint][] = [
    ["feeLoBps", 1], ["feeHiBps", 1], ["feeColdBps", 1], ["volAMilli", 1], ["volBDen", 1], ["volAlphaBps", 1],
    ["volWarmup", 1], ["volMoveCap10bps", 1], ["volRefSlots", 1], ["thinRebateMultBps", 1], ["skewCapBps", 1],
    ["rebateCapBps", 1], ["skewRefInventory", 1n],
  ];
  it.each(pricing)("guard-only block rejects pricing field %s = %s", (k, v) => {
    expect(() => validateMatcherSetParams(guardOnly({ [k]: v } as Partial<MatcherV2Config>))).toThrow(/pricing field/);
  });
  it("kind 1 guard-only block rejects pricing too", () => {
    expect(() => validateMatcherSetParams({ ...guardOnly({ feeLoBps: 1 }), kind: 1 })).toThrow(/pricing field/);
  });
});

describe("guard-only block bytes on the wire", () => {
  it("writes flags @70, max_mark_age @93, observed_stale @95, pricing zero", () => {
    const b = encodeMatcherSetParams(guardOnly({ maxMarkAgeSlots: 0x0105, observedStaleSlots: 0x0207 }));
    const v = new DataView(b.buffer, b.byteOffset, b.length);
    expect(b[69]).toBe(1);
    expect(b[70]).toBe(1);
    expect(v.getUint16(93, true)).toBe(0x0105);
    expect(v.getUint16(95, true)).toBe(0x0207);
    expect(b.subarray(71, 93).every((x) => x === 0)).toBe(true);
    expect(b.subarray(97).every((x) => x === 0)).toBe(true);
  });
  it("kind 2 block puts max_mark_age (150) before observed_stale", () => {
    const b = encodeMatcherSetParams(v2With({ observedStaleSlots: 9 }));
    const v = new DataView(b.buffer, b.byteOffset, b.length);
    expect(v.getUint16(93, true)).toBe(150);
    expect(v.getUint16(95, true)).toBe(9);
  });
});
