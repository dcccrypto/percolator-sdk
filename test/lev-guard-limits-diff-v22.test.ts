/**
 * Differential test: src/abi/lev-guard-limits-v22.ts vs the program's own functions, run on seeded rows (u32-max peaks, 0..34
 * half-lives incl. the 31/32 boundary, zero / huge notionals, u16 clamp inputs).
 *
 * Rows come from scripts/lev-guard-limits-diff/ (a scratch Rust crate that includes the prog's lev_guard_v22.rs functions VERBATIM,
 * percolator-prog feat/v22-rc23-2026-10-22 @ d27f3d73). `fixtures/v22/lev-guard-limits-diff-d27f3d73.txt` is a 2 000-row-per-function
 * slice; set LEV_DIFF_ROWS=<file> to diff the full 50 000-row output (`lgdiff 50000`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  levBurstDecayV22,
  levBurstUpdateV22,
  levBurstVarEffV22,
  levLOverlayX100V22,
  levLTraderX100V22,
  levNOverlayQV22,
  levShortUsersCapNotionalV22,
} from "../src/abi/lev-guard-limits-v22.js";
import type { LevAgeBandV22 } from "../src/abi/lev-guard-v22.js";

const BANDS: LevAgeBandV22[] = ["NoOpen", "Day", "Week", "Month", "Mature"];
const path = process.env.LEV_DIFF_ROWS ?? join(__dirname, "..", "fixtures", "v22", "lev-guard-limits-diff-d27f3d73.txt");
const rows = new Map<string, string[][]>();
for (const line of readFileSync(path, "utf8").split("\n")) {
  if (!line) continue;
  const [k, ...rest] = line.split(" ");
  if (!rows.has(k)) rows.set(k, []);
  rows.get(k)!.push(rest);
}

function diff(name: string, f: (a: string[]) => string, tail = 1): string[] {
  const bad: string[] = [];
  for (const r of rows.get(name) ?? []) {
    const got = f(r.slice(0, r.length - tail));
    const want = r.slice(r.length - tail).join(" ");
    if (got !== want) bad.push(`${name} ${r.join(" ")} => ts ${got}`);
  }
  return bad;
}

describe("lev-guard-limits-v22 vs prog lev_guard_v22.rs (differential)", { timeout: 120_000 }, () => {
  it("has rows for every function", () => {
    for (const k of ["decay", "update", "vareff", "shortcap", "ltrader", "loverlay", "noverlay"]) expect(rows.get(k)!.length).toBeGreaterThanOrEqual(2000);
  });
  it("burst_decay (:342)", () => {
    expect(diff("decay", (a) => String(levBurstDecayV22(Number(a[0]), BigInt(a[1]))))).toEqual([]);
  });
  it("burst_update (:357)", () => {
    expect(
      diff("update", (a) => levBurstUpdateV22(Number(a[0]), BigInt(a[1]), Number(a[2]), BigInt(a[3])).join(" "), 2),
    ).toEqual([]);
  });
  it("burst_var_eff (:367)", () => {
    expect(diff("vareff", (a) => String(levBurstVarEffV22(Number(a[0]), BigInt(a[1]), Number(a[2]), BigInt(a[3]))))).toEqual([]);
  });
  it("short_users_cap_notional (:324, saturates at u128::MAX via mul_div_floor_sat / saturating_add)", () => {
    expect(diff("shortcap", (a) => String(levShortUsersCapNotionalV22(BigInt(a[0]), BigInt(a[1]), BigInt(a[2]), BANDS[Number(a[3])], Number(a[4]))))).toEqual([]);
  });
  it("l_trader_x100 (:238, u16 clamp)", () => {
    expect(diff("ltrader", (a) => String(levLTraderX100V22(BigInt(a[0]), a[1] === "-1" ? null : BigInt(a[1]), Number(a[2]))))).toEqual([]);
  });
  it("l_overlay_x100 (:263, m_oracle floor)", () => {
    expect(
      diff("loverlay", (a) => String(levLOverlayX100V22(Number(a[0]), Number(a[1]), Number(a[2]), a[3] === "1", a[4] === "-1" ? null : Number(a[4]), Number(a[5])))),
    ).toEqual([]);
  });
  it("n_overlay_q (:285)", () => {
    expect(
      diff("noverlay", (a) => String(levNOverlayQV22(BigInt(a[0]), BANDS[Number(a[1])], Number(a[2]), BigInt(a[3]), a[4] === "-1" ? null : BigInt(a[4])))),
    ).toEqual([]);
  });
});
