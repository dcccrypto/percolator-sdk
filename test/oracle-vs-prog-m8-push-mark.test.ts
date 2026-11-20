// DRAFT (fails on feat/v22-sdk-growth e4acaa84). M8: the authority-push encoders accept any positive u64 mark
// (requirePositiveU64, src/abi/instructions.ts:4807-4812) while the program refuses mark_e6 > MAX_ORACLE_PRICE (1e12):
// PushAuthMark v16_program.rs:30184-30186, PushEwmaMark 29819-29821, and the Configure* initial marks via
// valid_engine_oracle_price (4810-4812). Their own docstrings already state "mark_e6 in [1, MAX_ORACLE_PRICE]".
import { describe, expect, it } from "vitest";
import { encodeConfigureAuthMark, encodeConfigureEwmaMark, encodePushAuthMark, encodePushEwmaMark } from "../src/abi/instructions.js";

const MAX = 1_000_000_000_000n;
const base = { assetIndex: 0, marketId: 1n, nowSlot: 1n, observationSequence: 1n };
const enc = {
  "PushAuthMark (63)": (m: bigint) => encodePushAuthMark({ ...base, markE6: m }),
  "PushEwmaMark (36)": (m: bigint) => encodePushEwmaMark({ ...base, markE6: m }),
  "ConfigureAuthMark (62)": (m: bigint) => encodeConfigureAuthMark({ ...base, initialMarkE6: m }),
  "ConfigureEwmaMark (35)": (m: bigint) => encodeConfigureEwmaMark({ ...base, initialMarkE6: m, markEwmaHalflifeSlots: 100n, markMinFee: 0n } as Parameters<typeof encodeConfigureEwmaMark>[0]),
};

describe("M8 mark encoders refuse mark_e6 above MAX_ORACLE_PRICE", () => {
  for (const [name, f] of Object.entries(enc)) {
    it(`${name}: MAX_ORACLE_PRICE encodes`, () => expect(() => f(MAX)).not.toThrow());
    it(`${name}: MAX_ORACLE_PRICE + 1 throws (A-max+1)`, () => expect(() => f(MAX + 1n)).toThrow());
    it(`${name}: u64::MAX throws (A-u64max)`, () => expect(() => f((1n << 64n) - 1n)).toThrow());
  }
});
