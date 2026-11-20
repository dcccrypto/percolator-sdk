// Real devnet v2.2 portfolios (job J-20261120-SDK-REPORT-DEVNETSTATEINVARIANTS, finding F1).
// The default devnet wrapper (PROGRAM_IDS_DEVNET_V22: percolator-prog 81ed7fdf on engine 3ce4cbd1) predates engine #299:
// all 211 of its portfolios carry engine discriminator 19 and are 10,603 B. LAYOUT_V22 (variant B, engine #299) is
// disc 20 / 10,607 B. Before this fix the SDK refused every one of them with DISCRIMINATOR_MISMATCH.
// Fixture bytes: test/fixtures/v22-devnet-portfolio-disc19.json (4 portfolios; expected values read by an independent
// script at the engine-source offsets, not by the SDK).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  LAYOUT_V22,
  LAYOUT_V22_ROWS,
  LAYOUT_V22_VARIANT_B_DISC19,
  UnknownLayoutError,
  decodeResolvedPayoutReceiptP3,
  parsePortfolioV17,
  portfolioFilterForLayout,
  resolvePortfolioLayout,
} from "../src/index.js";

interface FxLeg { index: number; assetIndex: number; side: number; basisPosQ: string }
interface FxAccount {
  pubkey: string;
  dataBase64: string;
  expect: {
    length: number; discriminator: number; capital: string; activeLegs: FxLeg[];
    portfolioId: string; matcherSequence: string; matcherExpirySlot: string; receiptPresent: boolean; receiptFinalized: boolean;
  };
}
const FX: { accounts: FxAccount[] } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "v22-devnet-portfolio-disc19.json"), "utf8"),
);
const bytes = (a: FxAccount) => new Uint8Array(Buffer.from(a.dataBase64, "base64"));
const code = (f: () => unknown): string | undefined => {
  try { f(); } catch (e) { return e instanceof UnknownLayoutError ? e.code : `untyped: ${(e as Error).message}`; }
  return undefined;
};

describe("real devnet v2.2 portfolios (engine disc 19, 10,603 B)", () => {
  it("fixture sanity: 4 accounts, all disc 19 at 10,603 B", () => {
    expect(FX.accounts).toHaveLength(4);
    for (const a of FX.accounts) {
      const d = bytes(a);
      expect([d.length, new DataView(d.buffer, d.byteOffset).getUint16(114, true)]).toEqual([10_603, 19]);
    }
  });

  for (const a of FX.accounts) {
    it(`parsePortfolioV17 decodes ${a.pubkey.slice(0, 8)}… with the engine-source values`, () => {
      const p = parsePortfolioV17(bytes(a));
      expect(p.portfolioAccountId.toBase58()).toBe(a.pubkey);
      expect(p.capital).toBe(BigInt(a.expect.capital));
      const active = p.legs.map((l, index) => ({ l, index })).filter(({ l }) => l.active);
      expect(active.map(({ l, index }) => ({ index, assetIndex: l.assetIndex, side: l.side, basisPosQ: l.basisPosQ.toString() })))
        .toEqual(a.expect.activeLegs);
      // the wrapper trailer sits at 10,475 (not 10,479): a +4 misread gives portfolioId 2^32 here
      expect([p.portfolioId, p.matcherSequence, p.matcherExpirySlot])
        .toEqual([BigInt(a.expect.portfolioId), BigInt(a.expect.matcherSequence), BigInt(a.expect.matcherExpirySlot)]);
    });
  }

  it("decodeResolvedPayoutReceiptP3 reads every devnet portfolio (receipt at 10,409)", () => {
    for (const a of FX.accounts) {
      const r = decodeResolvedPayoutReceiptP3(bytes(a));
      expect([r.present, r.finalized]).toEqual([a.expect.receiptPresent, a.expect.receiptFinalized]);
    }
  });

  it("the disc-19 row is selected by discriminator, and its filter matches the deployed size", () => {
    const d = bytes(FX.accounts[0]!);
    const L = resolvePortfolioLayout(d, { parser: "t", strictLength: true });
    expect(L).toBe(LAYOUT_V22_VARIANT_B_DISC19);
    expect(LAYOUT_V22_ROWS.variantBDisc19).toBe(LAYOUT_V22_VARIANT_B_DISC19);
    expect(portfolioFilterForLayout(LAYOUT_V22_VARIANT_B_DISC19).dataSize).toBe(d.length);
    expect(portfolioFilterForLayout(LAYOUT_V22_VARIANT_B_DISC19).versionMemcmp).toEqual(portfolioFilterForLayout(LAYOUT_V22).versionMemcmp);
    expect(L.portfolio).toMatchObject({ accountLen: 10_603, legStride: 217, resolvedPayoutReceiptOff: 10_409, matcherConfigOff: 10_475 });
  });

  it("disc 20 is unchanged: LAYOUT_V22 is still 10,607 B with the trailer at 10,479", () => {
    expect(LAYOUT_V22.engineDiscriminator).toBe(20);
    expect(LAYOUT_V22.portfolio).toMatchObject({ accountLen: 10_607, resolvedPayoutReceiptOff: 10_409, matcherConfigOff: 10_479 });
    expect(portfolioFilterForLayout(LAYOUT_V22).dataSize).toBe(10_607);
  });

  it("still fail-closed: truncated / wrong-length / unknown-disc devnet bytes are refused", () => {
    const d = bytes(FX.accounts[0]!);
    expect(code(() => resolvePortfolioLayout(d.subarray(0, 115), { parser: "t" }))).toBe("TOO_SHORT");
    // a disc-19 body padded to the disc-20 length is not silently read with either row
    const padded = new Uint8Array(10_607); padded.set(d);
    expect(code(() => resolvePortfolioLayout(padded, { parser: "t", strictLength: true }))).toBe("BAD_LENGTH");
    expect(code(() => resolvePortfolioLayout(d.subarray(0, 10_602), { parser: "t", strictLength: true }))).toBe("BAD_LENGTH");
    // a receipt cut short still throws
    expect(code(() => decodeResolvedPayoutReceiptP3(d.subarray(0, 10_409 + 65)))).toMatch(/too short/);
    // an unlisted discriminator is still a mismatch
    const odd = d.slice(); new DataView(odd.buffer).setUint16(114, 21, true);
    expect(code(() => parsePortfolioV17(odd))).toBe("DISCRIMINATOR_MISMATCH");
  });
});
