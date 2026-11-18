/**
 * Real-path differential for `staleResolveStatusV22` (tag 39 ResolveStalePermissionless).
 *
 * fixtures/v22/stale-resolve-bpf-d27f3d73.json.gz was produced by running the REAL program BPF
 * (percolator-prog feat/v22-rc23-2026-10-22 @ d27f3d73, target/deploy .so) in LiteSVM: for every
 * (mode, current_slot, last_good_oracle_slot, permissionless_resolve_stale_slots, cluster slot) the market's real bytes were
 * patched at the SDK's own offsets (fixture stores [offset, hex] runs over one base market), the Clock was warped to the
 * cluster slot, tag 39 was sent with a unique wire now_slot (proving it is ignored) and the outcome ("ok" or the Custom
 * error code) recorded. Regenerate with scripts/stale-resolve-cases.ts + the prog driver tests/stale_resolve_diff.rs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { staleResolveStatusV22 } from "../src/index.js";

const dir = join(__dirname, "..", "fixtures", "v22");
const base = new Uint8Array(gunzipSync(readFileSync(join(dir, "stale-resolve-base-d27f3d73.bin.gz"))));
interface Case { mode: number; cur: string; lg: string; st: string; cluster: string; res: string; diffs: [number, string][] }
const cases: Case[] = JSON.parse(gunzipSync(readFileSync(join(dir, "stale-resolve-bpf-d27f3d73.json.gz"))).toString("utf8"));

function marketFor(c: Case): Uint8Array {
  const d = base.slice();
  for (const [off, hex] of c.diffs) for (let i = 0; i < hex.length / 2; i++) d[off + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return d;
}

describe("staleResolveStatusV22 vs the real BPF (tag 39)", () => {
  it("has a non-trivial matrix covering every outcome", () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
    const outcomes = new Set(cases.map((c) => c.res));
    for (const k of ["ok", "19", "21", "27"]) expect(outcomes.has(k)).toBe(true);
  });

  it("canResolve / refusalCode match the program on every case", () => {
    const bad: string[] = [];
    for (const c of cases) {
      const st = staleResolveStatusV22(marketFor(c), BigInt(c.cluster));
      const want = c.res === "ok" ? null : Number(c.res);
      if (st.refusalCode !== want || st.canResolve !== (c.res === "ok")) {
        bad.push(`mode=${c.mode} cur=${c.cur} lg=${c.lg} st=${c.st} cluster=${c.cluster}: prog=${c.res} sdk=${st.refusalCode}`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it("decodes the fields the program was given, and slotsRemaining is consistent with the program outcome", () => {
    for (const c of cases) {
      const cluster = BigInt(c.cluster);
      const st = staleResolveStatusV22(marketFor(c), cluster);
      expect(st.mode).toBe(c.mode);
      expect(st.staleSlots).toBe(BigInt(c.st));
      expect(st.lastGoodOracleSlot).toBe(BigInt(c.lg));
      if (BigInt(c.st) === 0n) {
        expect(st.slotsRemaining).toBeNull();
        if (c.mode === 0 && cluster >= BigInt(c.cur)) expect(c.res).toBe("27");
        continue;
      }
      if (c.mode === 0 && cluster >= BigInt(c.cur)) expect(st.slotsRemaining === 0n).toBe(c.res === "ok");
    }
  });
});
