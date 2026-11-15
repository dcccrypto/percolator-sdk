/**
 * Doc-comment drift guards (SDK-ENC, vs percolator-prog feat/v22-rc23-2026-10-22 d27f3d73).
 *
 * The encoders were already byte-exact (see wire-size-v22.test.ts); the IX_TAG JSDoc and the adl.ts doc
 * comments still quoted pre-v2.2 sizes and a wrong decimal for the ADL event tag. These tests pin the
 * documented byte counts to the wire table so the comments cannot rot again.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ROWS, parseSpec, expectedLength } from "./wire-size-v22/table.js";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("adl.ts event tag doc", () => {
  const src = read("../src/solana/adl.ts");
  it("quotes the true decimal of 0xAD1E_0001", () => {
    expect(0xad1e0001).toBe(2904424449);
    expect(src).not.toContain("2970353665");
    expect(src.match(/2904424449/g)?.length).toBe(3);
  });
});

describe("IX_TAG JSDoc byte counts match the v2.2 wire table", () => {
  const src = read("../src/abi/instructions.ts");
  const lenOf = (tag: number, formIncludes?: string) => {
    const rows = ROWS.filter((r) => r.tag === tag && (!formIncludes || r.form.includes(formIncludes)));
    expect(rows.length, `table row for tag ${tag}`).toBeGreaterThan(0);
    return expectedLength(parseSpec(rows[0].spec));
  };
  // [IX_TAG key, tag, regex capturing the byte count quoted in that key's doc block]
  const cases: [string, number, RegExp][] = [
    ["UpdateAuthority", 32, /UpdateAuthority \(tag 32\)[^]*?= (\d+) bytes/],
    ["WithdrawInsuranceAsset", 57, /WithdrawInsuranceAsset \(tag 57\)[^]*?= (\d+) bytes/],
    ["UpdateAssetAuthority", 65, /Wire \(v2\.2\): tag\(1\) \+ asset_index\(u16\) \+ market_id\(u64\) \+ kind\(u8\)[^]*?= (\d+) bytes/],
    ["SetMatcherConfig", 68, /SetMatcherConfig \(tag 68\)[^]*?= (\d+) bytes/],
    ["RestartAssetOracle", 69, /RestartAssetOracle \(tag 69\)[^]*?= (\d+) bytes/],
    ["UpdateFeeSplit", 86, /Wire: tag\(1\) \+ creator_share_bps\(u16\)[^]*?= (\d+) bytes/],
  ];
  for (const [name, tag, re] of cases) {
    it(`${name} (tag ${tag})`, () => {
      const m = src.match(re);
      expect(m, `doc block for ${name}`).not.toBeNull();
      expect(Number(m![1])).toBe(lenOf(tag));
    });
  }
  it("RequestRedeemLpShares doc states the v2.2 26-byte form and that the 17-byte form is retired", () => {
    expect(lenOf(76, "v2.2")).toBe(26);
    expect(src).toMatch(/Wire \(v2\.2\): tag\(1\) \+ shares\(u128\) \+ min_payout_atoms\(u64\) \+ keeper_ok\(u8\) = 26 bytes/);
    expect(src).toMatch(/legacy 17-byte shares-only form is RETIRED/);
  });
});
