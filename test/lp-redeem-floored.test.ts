import { describe, it, expect } from "vitest";
import { encodeRequestRedeemLpShares, encodeRequestRedeemLpSharesV22 } from "../src/index.js";

describe("RequestRedeemLpShares (tag 76): the floored form is the v2.2 form (prog #616)", () => {
  it("the floored encoder produces the 26-byte form [76, shares u128, min_payout u64, keeper_ok u8]", () => {
    const d = encodeRequestRedeemLpSharesV22({ shares: 1_000_000n, minPayoutAtoms: 990_000n, keeperOk: true });
    expect(d.length).toBe(26);
    expect(d[0]).toBe(76);
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    expect(v.getBigUint64(1, true)).toBe(1_000_000n);
    expect(v.getBigUint64(17, true)).toBe(990_000n);
    expect(d[25]).toBe(1);
  });
  it("a zero floor is refused client-side, as the program does", () => {
    expect(() => encodeRequestRedeemLpSharesV22({ shares: 1n, minPayoutAtoms: 0n, keeperOk: false })).toThrow();
  });
  it("the deprecated legacy encoder is still exported and is the 17-byte form the v2.2 program now refuses", () => {
    expect(encodeRequestRedeemLpShares({ shares: 1n }).length).toBe(17);
  });
});
