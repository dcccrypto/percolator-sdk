/**
 * decodeMarketFundingV22 vs wrapper `permissionless_funding_rate_e9_view` (percolator-prog d27f3d73):
 * when `funding_mark_e6 == 0` the active mark is `mark_ewma_e6` only if `mark_ewma_last_slot <= asset.slot_last`;
 * otherwise the whole rate is 0 (premium AND skew), "non-retroactive until the engine catches up".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { decodeMarketFundingV22 } from "../src/index.js";
import { resolveMarketGeometry } from "../src/abi/layout.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-qa-overnight-2026-10-14.json", import.meta.url), "utf8")) as {
  penguPair: { snaps: { dataBase64: string }[] };
};
const base = (): Uint8Array => new Uint8Array(Buffer.from(FX.penguPair.snaps[0]!.dataBase64, "base64"));
const P_MARK_EWMA_LAST_SLOT = 176;
const P_FUNDING_MARK = 432;

function patch(mark: bigint, ewmaLastSlotDelta: bigint | null): Uint8Array {
  const d = base();
  const g = resolveMarketGeometry(d, { parser: "t", strictLength: false });
  const prof = g.slotOff(0) + g.layout.wrapperSlot.oracleProfile;
  const slotLast = decodeMarketFundingV22(d).assets[0]!.slotLast;
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  dv.setBigUint64(prof + P_FUNDING_MARK, mark, true);
  if (ewmaLastSlotDelta !== null) dv.setBigUint64(prof + P_MARK_EWMA_LAST_SLOT, slotLast + ewmaLastSlotDelta, true);
  return d;
}

describe("decodeMarketFundingV22: mark == 0 legacy-profile guard", () => {
  it("control: real snapshot has a skew-driven rate", () => {
    expect(decodeMarketFundingV22(base()).assets[0]!.rateE9PerSlot).not.toBe(0n);
  });
  it("mark == 0 and mark_ewma_last_slot ahead of slot_last: whole rate 0 (wrapper), skew not added", () => {
    const a = decodeMarketFundingV22(patch(0n, 1n)).assets[0]!;
    expect(a.rateE9PerSlot).toBe(0n);
    expect(a.skewRateE9PerSlot).toBe(0n);
    expect(a.premiumRateE9PerSlot).toBe(0n);
    expect(a.payer).toBe("none");
  });
  it("mark == 0 and ewma slot caught up (<= slot_last): falls back to mark_ewma_e6 and keeps skew", () => {
    const orig = decodeMarketFundingV22(base()).assets[0]!;
    const a = decodeMarketFundingV22(patch(0n, 0n)).assets[0]!;
    expect(a.skewRateE9PerSlot).toBe(orig.skewRateE9PerSlot);
    expect(a.rateE9PerSlot).not.toBe(0n);
  });
  it("mark != 0 ignores the ewma slot", () => {
    const orig = decodeMarketFundingV22(base()).assets[0]!;
    expect(decodeMarketFundingV22(patch(orig.fundingMarkE6, 5n)).assets[0]!.rateE9PerSlot).toBe(orig.rateE9PerSlot);
  });
});
